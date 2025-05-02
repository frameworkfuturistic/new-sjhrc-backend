const twilio = require('twilio');
const logger = require('../utils/logger');
const config = require('../config/config');

class NotificationService {
  constructor() {
    // Initialize SMS/WhatsApp client
    this.smsClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  }

  /**
   * Send appointment created notification via SMS and WhatsApp
   */
  static async sendAppointmentCreated(data) {
    try {
      const messageBody = this.getAppointmentCreatedSMS(data);

      // Send SMS
      await this.smsClient.messages.create({
        body: messageBody,
        from: config.twilio.fromNumber,
        to: `+91${data.mobileNo}`,
      });

      // Send WhatsApp message if enabled
      if (config.twilio.whatsappEnabled) {
        await this.smsClient.messages.create({
          body: messageBody,
          from: `whatsapp:${config.twilio.whatsappNumber}`,
          to: `whatsapp:+91${data.mobileNo}`,
        });
      }
    } catch (error) {
      logger.error('Error sending appointment created notification:', error);
      throw error;
    }
  }

  /**
   * Send appointment confirmed notification via SMS and WhatsApp
   */
  static async sendAppointmentConfirmed(data) {
    try {
      const messageBody = this.getAppointmentConfirmedSMS(data);

      // Send SMS
      await this.smsClient.messages.create({
        body: messageBody,
        from: config.twilio.fromNumber,
        to: `+91${data.mobileNo}`,
      });

      // Send WhatsApp message if enabled
      if (config.twilio.whatsappEnabled) {
        await this.smsClient.messages.create({
          body: messageBody,
          from: `whatsapp:${config.twilio.whatsappNumber}`,
          to: `whatsapp:+91${data.mobileNo}`,
        });
      }
    } catch (error) {
      logger.error('Error sending appointment confirmed notification:', error);
      throw error;
    }
  }

  /**
   * Send payment notification based on type via SMS and WhatsApp
   */
  static async sendPaymentNotification(type, data) {
    try {
      let messageBody;

      switch (type) {
        case 'paymentSuccess':
          messageBody = this.getPaymentSuccessSMS(data);
          break;
        case 'paymentFailed':
          messageBody = this.getPaymentFailedSMS(data);
          break;
        case 'refundProcessed':
          messageBody = this.getRefundProcessedSMS(data);
          break;
        default:
          throw new Error('Invalid notification type');
      }

      // Send SMS
      await this.smsClient.messages.create({
        body: messageBody,
        from: config.twilio.fromNumber,
        to: `+91${data.mobileNo}`,
      });

      // Send WhatsApp message if enabled
      if (config.twilio.whatsappEnabled) {
        await this.smsClient.messages.create({
          body: messageBody,
          from: `whatsapp:${config.twilio.whatsappNumber}`,
          to: `whatsapp:+91${data.mobileNo}`,
        });
      }
    } catch (error) {
      logger.error(`Error sending ${type} notification:`, error);
      throw error;
    }
  }

  /**
   * Send appointment cancelled notification via SMS and WhatsApp
   */
  static async sendAppointmentCancelled(data) {
    try {
      const messageBody = this.getAppointmentCancelledSMS(data);

      // Send SMS
      await this.smsClient.messages.create({
        body: messageBody,
        from: config.twilio.fromNumber,
        to: `+91${data.mobileNo}`,
      });

      // Send WhatsApp message if enabled
      if (config.twilio.whatsappEnabled) {
        await this.smsClient.messages.create({
          body: messageBody,
          from: `whatsapp:${config.twilio.whatsappNumber}`,
          to: `whatsapp:+91${data.mobileNo}`,
        });
      }
    } catch (error) {
      logger.error('Error sending appointment cancelled notification:', error);
      throw error;
    }
  }

  // SMS/WhatsApp Template Methods
  static getAppointmentCreatedSMS(data) {
    return `Appt ${data.appointmentId} with Dr.${data.consultantName} scheduled for ${data.date} at ${data.time}. Amount: ₹${data.amount}. Please complete payment to confirm.`;
  }

  static getAppointmentConfirmedSMS(data) {
    return `Your appt ${data.appointmentId} with Dr.${data.consultantName} on ${data.date} at ${data.time} is confirmed. Please arrive 10 mins early.`;
  }

  static getPaymentSuccessSMS(data) {
    return `Payment of ₹${data.amount} for appt ${data.appointmentId} successful. Your consultation is confirmed.`;
  }

  static getPaymentFailedSMS(data) {
    return `Payment of ₹${data.amount} for appt ${data.appointmentId} failed. Please try again or contact support.`;
  }

  static getRefundProcessedSMS(data) {
    return `Refund of ₹${data.amount} for appt ${data.appointmentId} processed. It may take 3-5 business days to reflect in your account.`;
  }

  static getAppointmentCancelledSMS(data) {
    return `Appt ${data.appointmentId} with Dr.${data.consultantName} on ${data.date} has been cancelled. ${data.refundAmount ? `Refund of ₹${data.refundAmount} initiated.` : ''}`;
  }

  static getRefundAlreadyProcessedSMS(data) {
    return `Appt ${data.appointmentId} cancelled. We detected your payment was already refunded (Ref ID: ${data.refundId}). Contact support if needed.`;
  }
}

module.exports = NotificationService;
