const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/config');

class NotificationService {
  constructor() {
    if (!config.whatsapp.accessToken || !config.whatsapp.phoneNumberId) {
      throw new Error('WhatsApp Cloud API configuration missing');
    }

    this.apiVersion = config.whatsapp.apiVersion;
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;
    this.headers = {
      Authorization: `Bearer ${config.whatsapp.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Validate notification data before sending
   */
  _validateNotificationData(data) {
    if (!data?.mobileNo) {
      throw new Error('Missing mobile number');
    }
    if (!data.appointmentId) {
      logger.warn('Notification sent without appointment ID');
    }
  }

  /**
   * Core method to send WhatsApp message with enhanced validation
   */
  async _sendWhatsAppMessage(phoneNumber, messagePayload) {
    try {
      // Add validation for phone number format
      if (!/^91\d{10}$/.test(phoneNumber)) {
        throw new Error(`Invalid phone number format: ${phoneNumber}`);
      }

      // Log the full payload in development
      if (process.env.NODE_ENV === 'development') {
        logger.debug('Sending WhatsApp payload:', {
          payload: messagePayload,
          phoneNumber,
        });
      }

      const response = await axios.post(this.baseUrl, messagePayload, {
        headers: this.headers,
        timeout: 10000, // 10 second timeout
      });

      logger.info(`WhatsApp message sent to ${phoneNumber}`, {
        messageId: response.data.messages[0].id,
        template: messagePayload.template?.name,
      });

      return response.data;
    } catch (error) {
      const errorDetails = {
        status: error.response?.status,
        error: error.response?.data?.error || error.message,
        phoneNumber,
        template: messagePayload.template?.name,
      };

      // Include more details in development
      if (process.env.NODE_ENV === 'development') {
        errorDetails.payload = messagePayload;
        errorDetails.config = {
          url: this.baseUrl,
          headers: { ...this.headers, Authorization: 'Bearer [REDACTED]' },
        };
      }

      logger.error('WhatsApp API request failed:', errorDetails);
      throw error;
    }
  }

  /**
   * Safe date formatting with fallback
   */
  _formatDate(dateString) {
    try {
      if (!dateString) return 'Not specified';
      const date = new Date(dateString);
      return isNaN(date.getTime())
        ? 'Not specified'
        : date.toLocaleDateString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });
    } catch (e) {
      return 'Not specified';
    }
  }

  /**
   * Appointment Confirmed Notification with robust error handling
   */
  async sendAppointmentConfirmed(data) {
    try {
      this._validateNotificationData(data);

      const components = [
        {
          type: 'header',
          parameters: [{ type: 'text', text: '✅ Appointment Confirmed' }],
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: data.patientName || 'Patient' },
            { type: 'text', text: data.consultantName || 'Doctor' },
            { type: 'text', text: data.appointmentId || 'N/A' },
            { type: 'text', text: this._formatDate(data.date) },
            { type: 'text', text: data.time || 'Not specified' },
            {
              type: 'text',
              text:
                data.location ||
                config.hospital?.defaultLocation ||
                'Our Clinic',
            },
          ].filter((p) => p.text), // Remove any empty parameters
        },
      ];

      // Add buttons only if we have required data
      if (data.appointmentId) {
        components.push(
          {
            type: 'button',
            sub_type: 'quick_reply',
            index: 0,
            parameters: [
              {
                type: 'payload',
                payload: JSON.stringify({
                  action: 'get_directions',
                  id: data.appointmentId,
                }),
              },
            ],
          },
          {
            type: 'button',
            sub_type: 'quick_reply',
            index: 1,
            parameters: [
              {
                type: 'payload',
                payload: JSON.stringify({
                  action: 'reschedule',
                  id: data.appointmentId,
                }),
              },
            ],
          }
        );

        if (config.hospital?.portalUrl) {
          components.push({
            type: 'button',
            sub_type: 'url',
            index: 2,
            parameters: [
              {
                type: 'text',
                text: `${config.hospital.portalUrl}/appointments/${data.appointmentId}`,
              },
            ],
          });
        }
      }

      const messagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: `91${data.mobileNo}`,
        type: 'template',
        template: {
          name: 'appointment_confirmed_v2',
          language: { code: 'en', policy: 'deterministic' },
          components: components.filter((c) => c.parameters?.length > 0),
        },
      };

      return await this._sendWhatsAppMessage(
        `91${data.mobileNo}`,
        messagePayload
      );
    } catch (error) {
      logger.error('Failed to prepare appointment confirmation:', error);
      throw error;
    }
  }

  /**
   * Payment Success Notification with robust error handling
   */
  async sendPaymentSuccess(data) {
    try {
      this._validateNotificationData(data);

      if (!data.amount) {
        throw new Error('Missing payment amount');
      }

      const components = [
        {
          type: 'header',
          parameters: [{ type: 'text', text: '💰 Payment Received' }],
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: data.patientName || 'Patient' },
            { type: 'text', text: `₹${data.amount}` },
            { type: 'text', text: data.appointmentId || 'N/A' },
            { type: 'text', text: data.paymentId || 'N/A' },
          ].filter((p) => p.text),
        },
      ];

      // Add buttons only if we have required data
      if (data.paymentId) {
        components.push({
          type: 'button',
          sub_type: 'quick_reply',
          index: 0,
          parameters: [
            {
              type: 'payload',
              payload: JSON.stringify({
                action: 'view_receipt',
                id: data.paymentId,
              }),
            },
          ],
        });

        if (config.hospital?.portalUrl) {
          components.push({
            type: 'button',
            sub_type: 'url',
            index: 1,
            parameters: [
              {
                type: 'text',
                text: `${config.hospital.portalUrl}/receipts/${data.paymentId}`,
              },
            ],
          });
        }
      }

      const messagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: `91${data.mobileNo}`,
        type: 'template',
        template: {
          name: 'payment_successful_v2',
          language: { code: 'en', policy: 'deterministic' },
          components: components.filter((c) => c.parameters?.length > 0),
        },
      };

      return await this._sendWhatsAppMessage(
        `91${data.mobileNo}`,
        messagePayload
      );
    } catch (error) {
      logger.error('Failed to prepare payment confirmation:', error);
      throw error;
    }
  }

  /**
   * Appointment Reminder Notification (Enhanced)
   */
  async sendAppointmentReminder(data) {
    const messagePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: `91${data.mobileNo}`,
      type: 'template',
      template: {
        name: 'appointment_reminder_v2',
        language: { code: 'en', policy: 'deterministic' },
        components: [
          {
            type: 'header',
            parameters: [
              {
                type: 'text',
                text: '⏰ Appointment Reminder',
              },
            ],
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.patientName },
              { type: 'text', text: data.consultantName },
              { type: 'text', text: this._formatDate(data.date) },
              { type: 'text', text: data.time },
              {
                type: 'text',
                text: data.location || config.hospital.defaultLocation,
              },
            ],
          },
          {
            type: 'button',
            sub_type: 'quick_reply',
            index: 0,
            parameters: [
              {
                type: 'payload',
                payload: JSON.stringify({
                  action: 'confirm_attendance',
                  id: data.appointmentId,
                }),
              },
            ],
          },
          {
            type: 'button',
            sub_type: 'quick_reply',
            index: 1,
            parameters: [
              {
                type: 'payload',
                payload: JSON.stringify({
                  action: 'reschedule',
                  id: data.appointmentId,
                }),
              },
            ],
          },
        ],
      },
    };

    return this._sendWhatsAppMessage(`91${data.mobileNo}`, messagePayload);
  }

  /**
   * Appointment Cancelled Notification (Enhanced)
   */
  async sendAppointmentCancelled(data) {
    const messagePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: `91${data.mobileNo}`,
      type: 'template',
      template: {
        name: 'appointment_cancelled_v2',
        language: { code: 'en', policy: 'deterministic' },
        components: [
          {
            type: 'header',
            parameters: [
              {
                type: 'text',
                text: '❌ Appointment Cancelled',
              },
            ],
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.patientName },
              { type: 'text', text: data.consultantName },
              { type: 'text', text: data.appointmentId },
              { type: 'text', text: this._formatDate(data.date) },
              { type: 'text', text: data.time },
            ],
          },
          ...(data.refundAmount
            ? [
                {
                  type: 'footer',
                  parameters: [
                    {
                      type: 'text',
                      text: `A refund of ₹${data.refundAmount} will be processed within 5-7 business days.`,
                    },
                  ],
                },
              ]
            : []),
          {
            type: 'button',
            sub_type: 'quick_reply',
            index: 0,
            parameters: [
              {
                type: 'payload',
                payload: JSON.stringify({
                  action: 'rebook',
                  consultantId: data.consultantId,
                }),
              },
            ],
          },
        ],
      },
    };

    return this._sendWhatsAppMessage(`91${data.mobileNo}`, messagePayload);
  }

  /**
   * Custom Interactive Message
   */
  async sendInteractiveMessage(phoneNumber, messageData) {
    const messagePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: `91${phoneNumber}`,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: messageData.text,
        },
        action: {
          buttons: messageData.buttons.map((btn, index) => ({
            type: 'reply',
            reply: {
              id: `btn_${index}`,
              title: btn.title,
            },
          })),
        },
      },
    };

    return this._sendWhatsAppMessage(`91${phoneNumber}`, messagePayload);
  }
}

module.exports = NotificationService;
