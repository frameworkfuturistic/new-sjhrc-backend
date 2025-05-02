const Appointment = require('../../models/symptom/Appointment');
const Consultant = require('../../models/symptom/Consultant');
const RazorpayService = require('../../services/RazorpayService');
const NotificationService = require('../../services/NotificationService');

const logger = require('../../utils/logger');
const { mysqlPool } = require('../../config/database');
const TimeSlot = require('../../models/symptom/TimeSlot');
const config = require('../../config/config');

class PaymentController {
  /**
   * Initiate payment for an appointment
   */
  async initiatePayment(req, res) {
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.beginTransaction();

      const { id: appointmentId } = req.params;

      // 1. Get and validate appointment
      const appointment = await Appointment.findById(appointmentId, connection);
      if (!appointment || appointment.Status !== 'Pending') {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Appointment not eligible for payment',
        });
      }

      // 2. Create Razorpay order
      const order = await RazorpayService.createOrder(
        appointment.AmountPaid,
        'INR',
        `appt_${appointment.AppointmentID}`,
        {
          appointmentId: appointment.AppointmentID,
          patientMR: appointment.MRNo,
        }
      );

      // 3. Update appointment with order ID
      await Appointment.update(
        appointmentId,
        { OrderID: order.id },
        connection
      );

      await connection.commit();

      res.status(200).json({
        success: true,
        data: {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          key: process.env.RAZORPAY_KEY_ID,
        },
      });
    } catch (error) {
      if (connection) await connection.rollback();
      logger.error('Payment initiation failed:', error);
      res.status(500).json({
        success: false,
        message: 'Payment initiation failed',
        error:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Verify payment and confirm appointment
   */
  async verifyPayment(req, res) {
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.beginTransaction();

      const { id: appointmentId } = req.params;
      const { paymentId, signature, orderId } = req.body;

      // Validate input
      if (!paymentId || !signature || !orderId) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Missing payment verification parameters',
        });
      }

      // 1. Get appointment
      const appointment = await Appointment.findById(appointmentId, connection);
      if (!appointment) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Appointment not found',
        });
      }

      // 2. Verify payment signature
      const isValid = await RazorpayService.verifyPaymentSignature(
        paymentId,
        orderId,
        signature
      );
      console.log('Signature verification:', isValid);

      if (!isValid) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Invalid payment signature',
          debug:
            process.env.NODE_ENV === 'development'
              ? {
                  receivedOrderId: orderId,
                  expectedOrderId: appointment.OrderID,
                  paymentId,
                }
              : undefined,
        });
      }

      // 3. Confirm payment with Razorpay
      const payment = await RazorpayService.fetchPayment(paymentId);
      if (payment.status !== 'captured') {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Payment not captured',
        });
      }

      // 4. Update appointment status
      const updateData = {
        Status: 'Confirmed',
        PaymentStatus: 'Paid',
        PaymentID: paymentId,
        PaymentDate: new Date(),
        AmountPaid: payment.amount / 100,
      };

      await Appointment.update(appointmentId, updateData, connection);

      // 5. Confirm slot booking
      await TimeSlot.confirmBooking(
        appointment.SlotID,
        appointment.AppointmentID,
        connection
      );

      // await connection.commit();

      // 6. Send confirmation (async)
      const notificationData = {
        appointmentId: appointment.AppointmentID,
        patientName: appointment.PatientName,
        consultantName: appointment.ConsultantName,
        date: appointment.SlotDate,
        time: appointment.SlotTime,
        amount: payment.amount / 100,
        mobileNo: appointment.MobileNo,
        location: config.hospital?.defaultLocation,
        paymentId: paymentId,
        consultantId: appointment.ConsultantID,
      };

      console.log('Notification data:', notificationData);

      // Validate critical fields
      if (!notificationData.mobileNo) {
        throw new Error('Patient mobile number is required for notifications');
      }

      const notificationService = new NotificationService();

      // Send notifications with proper error handling
      await Promise.allSettled([
        notificationService
          .sendAppointmentConfirmed(notificationData)
          .then(() => logger.info('Appointment confirmation sent'))
          .catch((err) =>
            logger.error('Appointment confirmation failed:', err)
          ),

        notificationService
          .sendPaymentSuccess(notificationData)
          .then(() => logger.info('Payment confirmation sent'))
          .catch((err) => logger.error('Payment confirmation failed:', err)),
      ]);

      await connection.commit();
      res.status(200).json({
        success: true,
        message: 'Payment verified and appointment confirmed',
      });
    } catch (error) {
      if (connection) await connection.rollback();
      logger.error('Payment verification failed b2:', error);
      res.status(500).json({
        success: false,
        message: 'Payment verification failed b2',
        error:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    } finally {
      if (connection) connection.release();
    }
  }
}

module.exports = new PaymentController();
