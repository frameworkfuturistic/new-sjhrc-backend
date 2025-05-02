const Payment = require('../../models/symptom/Payment');
const Appointment = require('../../models/symptom/Appointment');
const TimeSlot = require('../../models/symptom/TimeSlot');
const RazorpayService = require('../../services/RazorpayService');
const logger = require('../../utils/logger');
const { validationResult } = require('express-validator');
const { mysqlPool } = require('../../config/database');

const razorpayService = new RazorpayService();

/**
 * @desc    Create a new payment
 * @route   POST /api/payments
 * @access  Public
 */
exports.createPayment = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.beginTransaction();

    const {
      OPDOnlineAppointmentID,
      AmountPaid,
      PaymentMode,
      CreatedBy = null,
    } = req.body;

    // 1. Get the appointment details
    const [appointment] = await connection.query(
      `SELECT * FROM opd_onlineappointments 
         WHERE OPDOnlineAppointmentID = ? FOR UPDATE`,
      [OPDOnlineAppointmentID]
    );

    if (appointment.length === 0) {
      await connection.rollback();
      return res
        .status(404)
        .json({ success: false, message: 'Appointment not found' });
    }

    // Create payment record
    const paymentData = {
      OPDOnlineAppointmentID,
      PaymentDate: new Date(),
      PaymentMode,
      PaymentStatus: 'Pending',
      AmountPaid,
      CreatedBy,
    };

    const payment = await Payment.create(paymentData, connection);

    // Create Razorpay order
    const orderData = {
      amount: AmountPaid,
      currency: 'INR',
      receipt: payment.PaymentID.toString(),
    };

    const razorpayOrder = await razorpayService.createOrder(orderData);

    // Update payment with transaction ID
    await Payment.update(
      payment.PaymentID,
      { OrderID: razorpayOrder.id },
      connection
    );

    // 5. If this is confirming a pending appointment, update the slot
    if (appointment[0].Pending) {
      await connection.query(
        `UPDATE opd_doctorslots 
         SET 
           isBooked = 1,
           AppointmentID = ?
         WHERE SlotID = ?`,
        [OPDOnlineAppointmentID, appointment[0].SlotID]
      );

      // Mark appointment as confirmed
      await Appointment.update(
        OPDOnlineAppointmentID,
        { Pending: 0 },
        connection
      );
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Payment initiated successfully',
      data: {
        payment_id: payment.PaymentID,
        order_id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        razorpay_key: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('Payment initiation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Payment initiation failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * @desc    Handle Razorpay webhook
 * @route   POST /api/payments/webhook
 * @access  Public
 */
exports.handleWebhook = async (req, res) => {
  const webhookBody = JSON.stringify(req.body);
  const signature = req.headers['x-razorpay-signature'];

  if (!signature) {
    logger.error('Missing Razorpay signature', {
      headers: req.headers,
      body: req.body,
    });
    return res
      .status(400)
      .json({ success: false, message: 'Missing signature' });
  }

  const isValid = razorpayService.verifyWebhookSignature(
    webhookBody,
    signature,
    process.env.RAZORPAY_WEBHOOK_SECRET
  );

  if (!isValid) {
    return res
      .status(400)
      .json({ success: false, message: 'Invalid signature' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.beginTransaction();

    const event = req.body.event;
    const paymentId = req.body.payload.payment?.entity?.id;

    if (event === 'payment.captured' && paymentId) {
      // Find and update payment with row lock
      const [payments] = await connection.query(
        `SELECT * FROM payments 
         WHERE OrderID = ? 
         FOR UPDATE`,
        [paymentId]
      );

      if (payments.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ success: false, message: 'Payment not found' });
      }

      const payment = payments[0];

      // Skip if payment already completed
      if (payment.PaymentStatus === 'Completed') {
        await connection.commit();
        return res
          .status(200)
          .json({ success: true, message: 'Payment already processed' });
      }

      // Update payment status
      await connection.query(
        `UPDATE payments 
         SET PaymentStatus = 'Completed', 
             PaymentDate = NOW() 
         WHERE PaymentID = ?`,
        [payment.PaymentID]
      );

      // Get the appointment with lock
      const [appointments] = await connection.query(
        `SELECT * FROM opd_onlineappointments 
         WHERE OPDOnlineAppointmentID = ? 
         FOR UPDATE`,
        [payment.OPDOnlineAppointmentID]
      );

      if (appointments.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ success: false, message: 'Appointment not found' });
      }

      const appointment = appointments[0];

      // Only process if appointment was pending
      if (appointment.Pending === 1) {
        // Mark appointment as confirmed
        await connection.query(
          `UPDATE opd_onlineappointments 
           SET Pending = 0 
           WHERE OPDOnlineAppointmentID = ?`,
          [appointment.OPDOnlineAppointmentID]
        );

        // Get and update the slot with lock
        const [slots] = await connection.query(
          `SELECT * FROM opd_doctorslots 
           WHERE SlotID = ? 
           FOR UPDATE`,
          [appointment.SlotID]
        );

        if (slots.length > 0) {
          const slot = slots[0];
          const newAvailableSlots = slot.AvailableSlots - 1;
          const newIsBooked = newAvailableSlots <= 0 ? 1 : slot.isBooked;

          await connection.query(
            `UPDATE opd_doctorslots 
             SET 
               AvailableSlots = ?,
               isBooked = ?,
               AppointmentID = ?
             WHERE SlotID = ?`,
            [
              newAvailableSlots,
              newIsBooked,
              appointment.OPDOnlineAppointmentID,
              appointment.SlotID,
            ]
          );

          logger.info('Slot updated after payment', {
            slotId: appointment.SlotID,
            oldAvailable: slot.AvailableSlots,
            newAvailable: newAvailableSlots,
            isBooked: newIsBooked,
          });
        }
      }

      // Log successful payment processing
      logger.info('Payment successfully processed', {
        paymentId: payment.PaymentID,
        appointmentId: appointment.OPDOnlineAppointmentID,
        amount: payment.AmountPaid,
      });
    }

    await connection.commit();
    res
      .status(200)
      .json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('Webhook processing failed:', {
      error: error.message,
      stack: error.stack,
      body: req.body,
    });
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * @desc    Get payment details
 * @route   GET /api/payments/:id
 * @access  Public
 */
exports.getPayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (error) {
    logger.error('Error fetching payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * @desc    Get payment history
 * @route   GET /api/payments/history
 * @access  Public
 */
exports.getPaymentHistory = async (req, res) => {
  try {
    const criteria = {};
    if (req.query.OPDOnlineAppointmentID) {
      criteria.OPDOnlineAppointmentID = req.query.OPDOnlineAppointmentID;
    }

    const payments = await Payment.getHistory(criteria);
    res.status(200).json({
      success: true,
      count: payments.length,
      data: payments,
    });
  } catch (error) {
    logger.error('Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
