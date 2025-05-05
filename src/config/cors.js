// config/cors.js
const cors = require('cors');

const corsOptions = {
  origin: ['http://localhost:3000', 'https://sjhrc.in/'], // Add the domains you want to allow
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
  credentials: true, // Enable cookies and authorization headers for cross-origin requests
  preflightContinue: false, // Allow the OPTIONS request to be handled by the next handler
  optionsSuccessStatus: 204, // Status code for successful preflight response
};

module.exports = corsOptions;
