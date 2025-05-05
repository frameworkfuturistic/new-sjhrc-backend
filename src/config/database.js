const mongoose = require('mongoose');
const mysqlPool = require('./mysql');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info('MongoDB Connected...');

    // Test MySQL connection
    // const connection = await mysqlPool.getConnection();
    // connection.release();
    // logger.info('MySQL Connected...');
  } catch (err) {
    logger.error('Database connection error:', err);
    process.exit(1);
  }
};

module.exports = { connectDB, mysqlPool };
