const Payment = require('../../models/symptom/Payment');
const Appointment = require('../../models/symptom/Appointment');
const TimeSlot = require('../../models/symptom/TimeSlot');
const RazorpayService = require('../../services/RazorpayService');
const logger = require('../../utils/logger');
const { validationResult } = require('express-validator');
const { mysqlPool } = require('../../config/database');

const razorpayService = new RazorpayService();

/**
 * @desc    Create a new payment and confirm appointment
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

    // 1. Verify and lock appointment
    const [appointments] = await connection.query(
      `SELECT * FROM opd_onlineappointments 
       WHERE OPDOnlineAppointmentID = ? 
       AND (Pending = 1 OR Pending = 0)
       FOR UPDATE`,
      [OPDOnlineAppointmentID]
    );

    if (appointments.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Appointment not found or already cancelled',
      });
    }

    const appointment = appointments[0];

    // 2. Check if payment already exists
    const [existingPayments] = await connection.query(
      `SELECT * FROM opd_appointment_payments 
       WHERE OPDOnlineAppointmentID = ? 
       AND PaymentStatus = 'Completed'
       FOR UPDATE`,
      [OPDOnlineAppointmentID]
    );

    if (existingPayments.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Payment already completed for this appointment',
      });
    }

    // 3. Create payment record
    const paymentData = {
      OPDOnlineAppointmentID,
      PaymentDate: new Date(),
      PaymentMode,
      PaymentStatus: 'Pending',
      AmountPaid,
      CreatedBy,
      TransactionID: null,
    };

    const payment = await Payment.create(paymentData, connection);

    // 4. Create Razorpay order
    const orderData = {
      amount: AmountPaid * 100, // Convert to paise
      currency: 'INR',
      receipt: `appt_${OPDOnlineAppointmentID}_${payment.PaymentID}`,
      notes: {
        appointmentId: OPDOnlineAppointmentID,
        patientName: appointment.PatientName,
        mobileNo: appointment.MobileNo,
      },
    };

    const razorpayOrder = await razorpayService.createOrder(orderData);

    // 5. Update payment with order details
    await Payment.update(
      payment.PaymentID,
      {
        TransactionID: razorpayOrder.id,
        ModifiedOn: new Date(),
      },
      connection
    );

    // 6. If appointment was pending, confirm it
    if (appointment.Pending === 1) {
      await connection.query(
        `UPDATE opd_onlineappointments 
         SET Pending = 0,
             TransactionID = ?
         WHERE OPDOnlineAppointmentID = ?`,
        [razorpayOrder.id, OPDOnlineAppointmentID]
      );

      // Finalize slot booking
      await connection.query(
        `UPDATE opd_doctorslots 
         SET isBooked = 1,
             AppointmentID = ?
         WHERE SlotID = ?`,
        [OPDOnlineAppointmentID, appointment.SlotID]
      );
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Payment initiated successfully',
      data: {
        payment_id: payment.PaymentID,
        order_id: razorpayOrder.id,
        amount: orderData.amount,
        currency: orderData.currency,
        razorpay_key: process.env.RAZORPAY_KEY_ID,
        appointment_status:
          appointment.Pending === 1 ? 'confirmed' : 'already_confirmed',
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('Payment initiation failed:', {
      error: error.message,
      stack: error.stack,
      body: req.body,
    });
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
 * @desc    Handle Razorpay webhook events
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
    return res.status(400).json({
      success: false,
      message: 'Missing signature',
    });
  }

  const isValid = razorpayService.verifyWebhookSignature(
    webhookBody,
    signature,
    process.env.RAZORPAY_WEBHOOK_SECRET
  );

  if (!isValid) {
    return res.status(400).json({
      success: false,
      message: 'Invalid signature',
    });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.beginTransaction();

    const event = req.body.event;
    const paymentId = req.body.payload.payment?.entity?.id;

    if (event === 'payment.captured' && paymentId) {
      // 1. Find and update payment with row lock
      const [payments] = await connection.query(
        `SELECT * FROM opd_appointment_payments 
         WHERE TransactionID  = ? 
         FOR UPDATE`,
        [paymentId]
      );

      if (payments.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Payment not found',
        });
      }

      const payment = payments[0];

      // Skip if payment already completed
      if (payment.PaymentStatus === 'Completed') {
        await connection.commit();
        return res.status(200).json({
          success: true,
          message: 'Payment already processed',
        });
      }

      // 2. Update payment status
      await connection.query(
        `UPDATE opd_appointment_payments 
         SET PaymentStatus = 'Completed',
             PaymentDate = NOW()
         WHERE PaymentID = ?`,
        [JSON.stringify(req.body.payload.payment.entity), payment.PaymentID]
      );

      // 3. Get and confirm appointment if needed
      const [appointments] = await connection.query(
        `SELECT * FROM opd_onlineappointments 
         WHERE OPDOnlineAppointmentID = ? 
         FOR UPDATE`,
        [payment.OPDOnlineAppointmentID]
      );

      if (appointments.length > 0) {
        const appointment = appointments[0];

        if (appointment.Pending === 1) {
          // Confirm appointment
          await connection.query(
            `UPDATE opd_onlineappointments 
             SET Pending = 0,
                 TransactionID = ?
             WHERE OPDOnlineAppointmentID = ?`,
            [paymentId, appointment.OPDOnlineAppointmentID]
          );

          // Update slot status
          await connection.query(
            `UPDATE opd_doctorslots 
             SET isBooked = 1,
                 AppointmentID = ?
             WHERE SlotID = ?`,
            [appointment.OPDOnlineAppointmentID, appointment.SlotID]
          );

          logger.info('Appointment confirmed via webhook', {
            appointmentId: appointment.OPDOnlineAppointmentID,
            slotId: appointment.SlotID,
          });
        }
      }

      logger.info('Payment processed via webhook', {
        paymentId: payment.PaymentID,
        amount: payment.AmountPaid,
        razorpayOrderId: payment.OrderID,
      });
    }

    // Add handling for failed payments
    if (event === 'payment.failed' && paymentId) {
      const [payments] = await connection.query(
        `SELECT * FROM opd_appointment_payments 
     WHERE TransactionID = ? 
     FOR UPDATE`,
        [paymentId]
      );

      if (payments.length > 0) {
        const payment = payments[0];
        await connection.query(
          `UPDATE opd_appointment_payments 
       SET PaymentStatus = 'Failed',
           PaymentResponse = ?
       WHERE PaymentID = ?`,
          [JSON.stringify(req.body.payload.payment.entity), payment.PaymentID]
        );

        // Optionally mark appointment as cancelled if payment fails
        await connection.query(
          `UPDATE opd_onlineappointments 
       SET Pending = 2 
       WHERE OPDOnlineAppointmentID = ?`,
          [payment.OPDOnlineAppointmentID]
        );
      }
    }

    await connection.commit();
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
    });
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
 * @desc    Get payment details by ID
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

    // Add appointment details to response
    const [appointment] = await mysqlPool.query(
      `SELECT * FROM opd_onlineappointments 
       WHERE OPDOnlineAppointmentID = ?`,
      [payment.OPDOnlineAppointmentID]
    );

    res.status(200).json({
      success: true,
      data: {
        ...payment,
        appointment: appointment[0] || null,
        razorpay_order: payment.OrderID
          ? {
              id: payment.OrderID,
              key: process.env.RAZORPAY_KEY_ID,
            }
          : null,
      },
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
 * @desc    Get payment history with filters
 * @route   GET /api/payments/history
 * @access  Public
 */
exports.getPaymentHistory = async (req, res) => {
  try {
    const { OPDOnlineAppointmentID, MRNo, MobileNo, fromDate, toDate } =
      req.query;
    let query = `SELECT p.* FROM opd_appointment_payments p`;
    const conditions = [];
    const params = [];

    // Build query conditions
    if (OPDOnlineAppointmentID) {
      conditions.push('p.OPDOnlineAppointmentID = ?');
      params.push(OPDOnlineAppointmentID);
    }

    if (MRNo || MobileNo) {
      query += ` JOIN opd_onlineappointments a ON p.OPDOnlineAppointmentID = a.OPDOnlineAppointmentID`;
      if (MRNo) {
        conditions.push('a.MRNo = ?');
        params.push(MRNo);
      }
      if (MobileNo) {
        conditions.push('a.MobileNo = ?');
        params.push(MobileNo);
      }
    }

    if (fromDate) {
      conditions.push('p.PaymentDate >= ?');
      params.push(new Date(fromDate));
    }

    if (toDate) {
      conditions.push('p.PaymentDate <= ?');
      params.push(new Date(toDate));
    }

    // Finalize query
    if (conditions.length) {
      query += ` WHERE ` + conditions.join(' AND ');
    }
    query += ` ORDER BY p.PaymentDate DESC`;

    const [payments] = await mysqlPool.query(query, params);

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

/**
 * @desc    Check payment status
 * @route   GET /api/payments/status/:orderId
 * @access  Public
 */
exports.checkPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    // 1. Check local database first
    const [payments] = await mysqlPool.query(
      `SELECT * FROM opd_appointment_payments 
       WHERE TransactionID = ?`,
      [orderId]
    );

    if (payments.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    const payment = payments[0];

    // 2. If payment already completed, return status
    if (payment.PaymentStatus === 'Completed') {
      return res.status(200).json({
        success: true,
        status: 'completed',
        payment,
      });
    }

    // 3. Check with Razorpay if still pending
    const razorpayPayment = await razorpayService.fetchPayment(orderId);
    const status = razorpayPayment.status;

    // 4. Update local status if changed
    if (status === 'captured' && payment.PaymentStatus !== 'Completed') {
      await mysqlPool.query(
        `UPDATE opd_appointment_payments 
         SET PaymentStatus = 'Completed',
             PaymentDate = NOW()
         WHERE PaymentID = ?`,
        [JSON.stringify(razorpayPayment), payment.PaymentID]
      );
    }

    res.status(200).json({
      success: true,
      status,
      payment: {
        ...payment,
        PaymentStatus:
          status === 'captured' ? 'Completed' : payment.PaymentStatus,
      },
    });
  } catch (error) {
    logger.error('Error checking payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check payment status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
