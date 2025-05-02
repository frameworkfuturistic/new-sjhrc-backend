const { body, param } = require('express-validator');

exports.initiatePaymentValidation = [
  body('appointmentId').isInt({ min: 1 }).withMessage('Invalid appointment ID'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be at least 1'),
];

exports.verifyPaymentValidation = [
  body('paymentId').notEmpty().withMessage('Payment ID is required'),
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('signature').notEmpty().withMessage('Signature is required'),
  body('appointmentId').isInt({ min: 1 }).withMessage('Invalid appointment ID'),
];
