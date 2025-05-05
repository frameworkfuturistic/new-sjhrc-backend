// config.js
require('dotenv').config();

module.exports = {
  // Database configuration (MySQL)
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'sjhrc_development',
    connectionLimit: 10,
    timezone: 'UTC',
    waitForConnections: true,
  },

  // MongoDB configuration (if you're using it elsewhere)
  mongodb: {
    uri: process.env.MONGODB_URI || '',
  },

  // Razorpay payment gateway configuration
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_TmmbARIwlAEaSr',
    keySecret: process.env.RAZORPAY_KEY_SECRET || 'Qt7YeHhbmoJHQtd0HmDpLOEb',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || 'uVaTjt5dnv32b6j',
  },

  // Application settings
  app: {
    port: parseInt(process.env.PORT) || 5555,
    env: process.env.NODE_ENV || 'development',
    appointmentExpiryMinutes: 30, // 30 minutes for pending appointments
    timezone: 'Asia/Kolkata',
  },

  // Authentication & Security
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'yourSuperSecretKey',
    sessionSecret: process.env.SESSION_SECRET || 'anotherSecretKey',
    adminPasswordHash: process.env.HASHED_ADMIN_PASSWORD,
    superPasswordHash: process.env.SUPER_PASSWORD_HASH,
  },

  // Cloudinary configuration
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'daeekyrp8',
    apiKey: process.env.CLOUDINARY_API_KEY || '591742275297713',
    apiSecret:
      process.env.CLOUDINARY_API_SECRET || 'PJEXIA6xEbVqrjV8-44GarsIyD8',
  },

  // Logging configuration
  logging: {
    level: 'debug',
    file: 'app.log',
  },
  // Whatsapp Cloud API configuration
  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    webhook: {
      verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
      path: '/webhook/whatsapp', // Customize
      version: process.env.WHATSAPP_API_VERSION || 'v18.0',
    },
    // Default message parameters
    defaults: {
      language: {
        code: 'en',
        policy: 'deterministic',
      },
      timeout: 10000, // ms
    },
  },

  hospital: {
    name: process.env.HOSPITAL_NAME || 'City Hospital',
    contactNumber: process.env.HOSPITAL_CONTACT || '+911234567890',
    defaultLocation:
      process.env.HOSPITAL_LOCATION || '123 Main St, City, State',
  },
};
