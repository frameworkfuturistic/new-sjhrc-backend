require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const xss = require('xss-clean');
const hpp = require('hpp');
// const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const { connectDB } = require('./config/database');
const { errorHandler } = require('./middleware/error');
const logger = require('./utils/logger');
const routes = require('./routes');
const corsOptions = require('./config/cors');

// Connect to database
connectDB();

const app = express();

app.set('trust proxy', true);

// Security middleware
app.use(helmet());
app.use(xss());
app.use(hpp());
app.use(cors(corsOptions));

// Force HTTPS in production
// if (process.env.NODE_ENV === 'production') {
//   app.use((req, res, next) => {
//     if (req.headers['x-forwarded-proto'] !== 'https') {
//       return res.redirect(`https://${req.hostname}${req.url}`);
//     }
//     next();
//   });
// }
if (process.env.NODE_ENV !== 'test') {
  try {
    const setupCleanupJob = require('./config/CleanupJob');
    app.locals.cleanupJob = setupCleanupJob();
    logger.info('Appointment cleanup job initialized');
  } catch (error) {
    logger.error('Failed to initialize cleanup job:', error);
    process.exit(1);
  }
}

// Enhanced error handling
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Perform cleanup if needed
  if (app.locals.cleanupJob) {
    app.locals.cleanupJob.stop();
  }
  process.exit(1);
});

// Rate limiting
// const apiLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
//   message: 'Too many requests, please try again later.',
// });
// app.use(apiLimiter);

// Body parser
app.use(express.json());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Routes
app.get('/', async (req, res) => {
  const healthcheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
    database: 'connected', // You could add DB ping check here
  };
  try {
    res.status(200).send(healthcheck);
  } catch (error) {
    healthcheck.message = error;
    res.status(503).send();
  }
});

app.use('/api', routes);

// Error handling
app.use(errorHandler);

// Handle unhandled routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot find ${req.originalUrl} on this server`,
  });
});

const PORT = process.env.PORT || 5656;

const server = app.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  logger.info(
    `Cleanup service status: ${app.locals.cleanupJob ? 'active' : 'inactive'}`
  );
});

// Graceful shutdown on unhandled rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

// Graceful shutdown on SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
