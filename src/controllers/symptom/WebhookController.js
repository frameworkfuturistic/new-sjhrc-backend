const Appointment = require('../../models/symptom/Appointment');
const Consultant = require('../../models/symptom/Consultant');
const RazorpayService = require('../../services/RazorpayService');
const NotificationService = require('../../services/NotificationService');
const logger = require('../../utils/logger');
const { mysqlPool } = require('../../config/database');

class WebhookController {
  async handlePaymentWebhook(req, res) {
    const signature = req.headers['x-razorpay-signature'];
    const body = req.body;

    try {
      // 1. Verify webhook signature
      if (!RazorpayService.verifyWebhookSignature(body, signature)) {
        logger.warn('Invalid webhook signature');
        return res.status(401).json({ status: 'error' });
      }

      const { event, payload } = body;
      const { payment } = payload;

      logger.info(`Processing webhook event: ${event}`);

      // 2. Find related appointment
      const appointment = await this.findAppointmentByOrderId(payment.order_id);
      if (!appointment) {
        return res.status(404).json({ status: 'error' });
      }

      // 3. Process event in transaction
      let connection;
      try {
        connection = await mysqlPool.getConnection();
        await connection.beginTransaction();

        await this.processEvent(event, payment, appointment, connection);

        await connection.commit();
        return res.status(200).json({ status: 'success' });
      } catch (error) {
        if (connection) await connection.rollback();
        throw error;
      } finally {
        if (connection) connection.release();
      }
    } catch (error) {
      logger.error('Webhook processing failed:', error);
      return res.status(500).json({ status: 'error' });
    }
  }

  async findAppointmentByOrderId(orderId) {
    try {
      const [appointments] = await mysqlPool.query(
        'SELECT * FROM opd_onlineappointments WHERE OrderID = ? LIMIT 1',
        [orderId]
      );
      return appointments[0] || null;
    } catch (error) {
      logger.error('Error finding appointment:', error);
      return null;
    }
  }

  async processEvent(event, payment, appointment, connection) {
    let updateData = {};
    let notificationType = null;

    switch (event) {
      case 'payment.captured':
        updateData = {
          PaymentStatus: 'Paid',
          PaymentID: payment.id,
          PaymentDate: new Date(payment.created_at * 1000),
          Status: 'Confirmed',
        };
        notificationType = 'paymentSuccess';
        break;

      case 'payment.failed':
        updateData = {
          PaymentStatus: 'Failed',
          Status: 'Cancelled',
          Remarks: `Payment failed: ${payment.error_description || 'Unknown'}`,
        };
        notificationType = 'paymentFailed';
        break;

      case 'refund.processed':
        updateData = {
          PaymentStatus: 'Refunded',
          Status: 'Cancelled',
          RefundID: payment.id,
        };
        notificationType = 'refundProcessed';
        break;

      default:
        logger.info(`Unhandled event type: ${event}`);
        return;
    }

    // Update appointment
    await connection.query(
      'UPDATE opd_onlineappointments SET ? WHERE AppointmentID = ?',
      [updateData, appointment.AppointmentID]
    );

    // Send notification if needed
    if (notificationType) {
      this.sendNotification(notificationType, appointment, payment);
    }
  }

  async sendNotification(type, appointment, payment) {
    try {
      const consultant = await Consultant.findById(appointment.ConsultantID);
      const data = {
        appointmentId: appointment.AppointmentID,
        patientName: appointment.PatientName,
        mobileNo: appointment.MobileNo,
        email: appointment.Email,
        consultantName: consultant.ConsultantName,
        date: appointment.ConsultationDate,
        time: appointment.SlotTime,
        amount: payment.amount / 100,
        paymentId: payment.id,
      };

      switch (type) {
        case 'paymentSuccess':
          await NotificationService.sendPaymentSuccess(data);
          break;
        case 'paymentFailed':
          await NotificationService.sendPaymentFailed(data);
          break;
        case 'refundProcessed':
          await NotificationService.sendRefundProcessed({
            ...data,
            refundAmount: payment.amount / 100,
          });
          break;
      }
    } catch (error) {
      logger.error('Notification sending failed:', error);
    }
  }
}

module.exports = new WebhookController();
