const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/config');

class NotificationService {
  constructor() {
    this._validateConfig();
    this._initializeService();
    this._setupCircuitBreaker();
  }

  // ==================== INITIALIZATION ====================
  _initializeService() {
    this.apiVersion = config.whatsapp.apiVersion || 'v22.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;
    this.headers = {
      Authorization: `Bearer ${config.whatsapp.accessToken}`,
      'Content-Type': 'application/json',
    };
    this.rateLimiter = {
      lastRequest: 0,
      minInterval: 200, // 5 requests per second
    };
  }

  _setupCircuitBreaker() {
    this.circuitBreaker = {
      isOpen: false,
      lastFailure: 0,
      failureCount: 0,
      resetAfter: 60000, // 1 minute
      threshold: 3, // Max failures before tripping
    };
  }

  // ==================== CONFIG VALIDATION ====================
  _validateConfig() {
    const { whatsapp } = config;

    if (!whatsapp?.accessToken) {
      throw new Error('WhatsApp access token is required');
    }

    if (!whatsapp?.phoneNumberId) {
      throw new Error('WhatsApp phone number ID is required');
    }

    if (!/^EA[A-Za-z0-9]{180,}$/.test(whatsapp.accessToken)) {
      throw new Error('Invalid WhatsApp access token format');
    }

    if (!/^\d+$/.test(whatsapp.phoneNumberId)) {
      throw new Error('Invalid WhatsApp phone number ID format');
    }
  }

  // ==================== CIRCUIT BREAKER ====================
  _checkCircuitBreaker() {
    if (this.circuitBreaker.isOpen) {
      const now = Date.now();
      if (
        now - this.circuitBreaker.lastFailure >
        this.circuitBreaker.resetAfter
      ) {
        this._resetCircuitBreaker();
        return false;
      }
      throw new Error(
        'WhatsApp API temporarily unavailable (circuit breaker open)'
      );
    }
  }

  _handleApiFailure() {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.failureCount >= this.circuitBreaker.threshold) {
      this.circuitBreaker.isOpen = true;
      logger.error(
        'Circuit breaker tripped - WhatsApp API failures exceeded threshold'
      );
    }
  }

  _resetCircuitBreaker() {
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.failureCount = 0;
    logger.info('Circuit breaker reset');
  }

  // ==================== RATE LIMITING ====================
  async _enforceRateLimit() {
    const now = Date.now();
    const elapsed = now - this.rateLimiter.lastRequest;

    if (elapsed < this.rateLimiter.minInterval) {
      const delay = this.rateLimiter.minInterval - elapsed;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.rateLimiter.lastRequest = Date.now();
  }

  // ==================== CORE FUNCTIONALITY ====================
  async _sendWhatsAppMessage(phoneNumber, messagePayload, retryCount = 0) {
    try {
      await this._enforceRateLimit();
      this._checkCircuitBreaker();

      const formattedNumber = this._formatPhoneNumber(phoneNumber);
      const validatedPayload = this._validateMessagePayload(messagePayload);

      const response = await axios.post(this.baseUrl, validatedPayload, {
        headers: this.headers,
        timeout: 10000,
      });

      logger.info(`Message sent to ${formattedNumber}`, {
        messageId: response.data?.messages?.[0]?.id,
        template: validatedPayload.template?.name,
      });

      return response.data;
    } catch (error) {
      this._handleApiFailure();
      return this._handleSendError(
        error,
        phoneNumber,
        messagePayload,
        retryCount
      );
    }
  }

  _handleSendError(error, phoneNumber, messagePayload, retryCount) {
    const errorDetails = {
      status: error.response?.status,
      error: error.response?.data?.error || error.message,
      phoneNumber,
      template: messagePayload.template?.name,
      retryCount,
    };

    // Retry for 5xx errors (max 2 retries)
    if (error.response?.status >= 500 && retryCount < 2) {
      const delay = 1000 * (retryCount + 1); // Exponential backoff
      logger.warn(`Retrying failed request (attempt ${retryCount + 1})`);
      return new Promise((resolve) =>
        setTimeout(
          () =>
            resolve(
              this._sendWhatsAppMessage(
                phoneNumber,
                messagePayload,
                retryCount + 1
              )
            ),
          delay
        )
      );
    }

    logger.error('WhatsApp API request failed:', errorDetails);
    throw this._formatError(error);
  }

  _formatError(error) {
    if (error.response?.status === 401) {
      return new Error(
        'WhatsApp API authorization failed. ' +
          'Please verify your access token and phone number ID are correct and not expired.'
      );
    }
    return error;
  }

  // ==================== DATA VALIDATION ====================
  _validateNotificationData(data) {
    const mobileNo = this._extractMobileNumber(data);

    if (!mobileNo) {
      logger.error('Mobile number missing in data:', data);
      throw new Error('Mobile number is required');
    }

    if (!/^[6-9]\d{9}$/.test(mobileNo)) {
      throw new Error(`Invalid Indian mobile number format: ${mobileNo}`);
    }

    return `91${mobileNo}`;
  }

  _extractMobileNumber(data) {
    const mobileNo = data?.mobileNo || data?.data?.mobileNo;
    return mobileNo?.toString().replace(/\D/g, '');
  }

  _formatPhoneNumber(phoneNumber) {
    const digits = phoneNumber.toString().replace(/\D/g, '');
    return digits.startsWith('91') ? digits : `91${digits}`;
  }

  _validateMessagePayload(payload) {
    if (
      !payload?.messaging_product ||
      payload.messaging_product !== 'whatsapp'
    ) {
      throw new Error('Invalid messaging product specified');
    }
    return payload;
  }

  // ==================== TEMPLATE BUILDERS ====================
  async _sendTemplateMessage(templateName, data) {
    try {
      const mobileNo = this._validateNotificationData(data);
      const components = this._buildTemplateComponents(templateName, data);

      const messagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: mobileNo,
        type: 'template',
        template: {
          name: `${templateName}_v2`,
          language: { code: 'en', policy: 'deterministic' },
          components: components.filter((c) => c.parameters?.length > 0),
        },
      };

      return await this._sendWhatsAppMessage(mobileNo, messagePayload);
    } catch (error) {
      logger.error(`Failed to send ${templateName} notification:`, error);
      throw error;
    }
  }

  _buildTemplateComponents(templateName, data) {
    const templateConfig = {
      appointment_confirmed: {
        header: '✅ Appointment Confirmed',
        body: [
          data.patientName || 'Patient',
          data.consultantName || 'Doctor',
          data.appointmentId || 'N/A',
          this._formatDate(data.date),
          data.time || 'Not specified',
          data.location || config.hospital?.defaultLocation || 'Our Clinic',
        ],
        buttons: data.appointmentId
          ? [
              { action: 'get_directions', id: data.appointmentId },
              { action: 'reschedule', id: data.appointmentId },
            ]
          : [],
      },
      // Other templates...
    };

    const components = [
      {
        type: 'header',
        parameters: [
          { type: 'text', text: templateConfig[templateName].header },
        ],
      },
      {
        type: 'body',
        parameters: templateConfig[templateName].body
          .filter((text) => text !== undefined)
          .map((text) => ({ type: 'text', text })),
      },
    ];

    // Add buttons if available
    templateConfig[templateName].buttons.forEach((btn, index) => {
      components.push({
        type: 'button',
        sub_type: 'quick_reply',
        index,
        parameters: [
          {
            type: 'payload',
            payload: JSON.stringify({
              action: btn.action,
              id: btn.id,
            }),
          },
        ],
      });
    });

    return components;
  }

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

  // ==================== PUBLIC METHODS ====================
  async sendAppointmentConfirmed(data) {
    return this._sendTemplateMessage('appointment_confirmed', data);
  }

  async sendPaymentSuccess(data) {
    if (!data.amount) throw new Error('Payment amount is required');
    return this._sendTemplateMessage('payment_successful', data);
  }

  async sendInteractiveMessage(phoneNumber, messageData) {
    const validatedNumber = this._formatPhoneNumber(phoneNumber);
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: validatedNumber,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: messageData.text },
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
    return this._sendWhatsAppMessage(validatedNumber, payload);
  }

  async healthCheck() {
    try {
      const response = await axios.get(
        `https://graph.facebook.com/${this.apiVersion}/${config.whatsapp.phoneNumberId}`,
        { headers: this.headers, timeout: 5000 }
      );
      return {
        healthy: true,
        status: response.status,
        data: response.data,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.response?.data?.error || error.message,
        status: error.response?.status,
      };
    }
  }
}

module.exports = NotificationService;
