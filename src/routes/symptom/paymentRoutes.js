// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const paymentController = require('../../controllers/symptom/paymentController');
const webhookController = require('../../controllers/symptom/webhookController');
const {
  initiatePaymentValidation,
  verifyPaymentValidation,
} = require('../../middleware/validators/paymentValidator');

// Payment routes
router.post(
  '/:id/initiate',
  initiatePaymentValidation,
  paymentController.initiatePayment
);
router.post(
  '/:id/verify',
  verifyPaymentValidation,
  paymentController.verifyPayment
);
// router.get('/status/:appointmentId', paymentController.getPaymentStatus);

// Razorpay webhook
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  webhookController.handlePaymentWebhook
);

module.exports = router;
