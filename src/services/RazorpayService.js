// services/RazorpayService.js
const Razorpay = require('razorpay');
const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../config/config');

class RazorpayService {
  constructor() {
    this.instance = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }
  /**
   * Enhanced Razorpay Service with better refund handling
   */
  async initiateRefund(paymentId, amount, notes = {}) {
    try {
      // First check if payment exists and its status
      const payment = await this.instance.payments.fetch(paymentId);

      // Check if payment is already fully refunded
      if (payment.status === 'refunded') {
        return {
          id: `already_refunded_${Date.now()}`,
          amount: payment.amount_refunded,
          status: 'already_refunded',
          original_payment: payment,
        };
      }

      // Check if payment was captured
      if (payment.status !== 'captured') {
        throw new Error(`Payment not captured (status: ${payment.status})`);
      }

      // Check remaining refundable amount
      const refundableAmount = payment.amount - payment.amount_refunded;
      if (amount > refundableAmount) {
        throw new Error(
          `Requested amount (${amount}) exceeds refundable amount (${refundableAmount})`
        );
      }

      // Process refund
      const refund = await this.instance.payments.refund(paymentId, {
        amount: amount,
        notes: notes,
        speed: 'normal', // or 'optimum' for faster processing
      });

      return {
        ...refund,
        original_payment: payment,
      };
    } catch (error) {
      logger.error('Error initiating refund:', {
        error: error.error?.description || error.message,
        paymentId,
        amount,
        notes,
      });

      // Enhanced error handling
      if (error.error?.code === 'BAD_REQUEST_ERROR') {
        if (error.error.description.includes('already refunded')) {
          throw new Error('Payment already refunded');
        }
        if (error.error.description.includes('not captured')) {
          throw new Error('Payment not captured');
        }
      }

      throw new Error(error.error?.description || 'Failed to initiate refund');
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(body, signature) {
    try {
      const generatedSignature = crypto
        .createHmac('sha256', config.razorpay.webhookSecret)
        .update(JSON.stringify(body))
        .digest('hex');

      return generatedSignature === signature;
    } catch (error) {
      logger.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  async createOrder(amount, currency = 'INR', receipt = null, notes = {}) {
    try {
      const options = {
        amount: amount * 100, // Razorpay expects amount in paise
        currency,
        receipt: receipt || `receipt_${Date.now()}`,
        payment_capture: 1, // Auto-capture payment
        notes,
      };

      const order = await this.instance.orders.create(options);
      return order;
    } catch (error) {
      logger.error('Error creating Razorpay order:', error);
      throw new Error('Failed to create payment order');
    }
  }

  async verifyPaymentSignature(paymentId, orderId, signature) {
    try {
      // Ensure we're using the correct secret (API key secret, not webhook secret)
      const razorpaySecret = config.razorpay.keySecret;

      // Create the expected signature
      const generatedSignature = crypto
        .createHmac('sha256', razorpaySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      // Secure comparison to prevent timing attacks
      const isValid = crypto.timingSafeEqual(
        Buffer.from(generatedSignature),
        Buffer.from(signature)
      );

      if (!isValid) {
        logger.warn('Payment signature verification failed', {
          generatedSignature,
          receivedSignature: signature,
          orderId,
          paymentId,
        });
        return false;
      }
      return true;
    } catch (error) {
      logger.error('Error verifying payment signature:', error);
      throw new Error('Payment verification failed');
    }
  }

  async fetchPayment(paymentId) {
    try {
      return await this.instance.payments.fetch(paymentId);
    } catch (error) {
      logger.error('Error fetching payment:', error);
      throw new Error('Failed to fetch payment details');
    }
  }
}

module.exports = new RazorpayService();
