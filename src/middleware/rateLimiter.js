const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const { RATE_LIMITS } = require('../config/constants');

// MongoDB Model to store rate limits
const RateLimit = mongoose.model(
  'RateLimit',
  new mongoose.Schema({
    ip: { type: String, required: true, unique: true },
    requests: { type: Number, default: 0 },
    lastRequest: { type: Date, default: Date.now },
  })
);

const limiter = rateLimit({
  windowMs: RATE_LIMITS.WINDOW_MS, // time window in ms (e.g., 15 minutes)
  max: RATE_LIMITS.MAX_REQUESTS, // max requests per windowMs
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again later.',
  },
  async handler(req, res, next) {
    const ip = req.ip;
    const currentTime = Date.now();

    try {
      const rateData = await RateLimit.findOne({ ip });

      if (rateData) {
        const timeElapsed = currentTime - rateData.lastRequest;

        // Reset counter if window has passed
        if (timeElapsed > RATE_LIMITS.WINDOW_MS) {
          rateData.requests = 1;
          rateData.lastRequest = currentTime;
        } else {
          rateData.requests += 1;
        }

        // Save updated data
        await rateData.save();

        if (rateData.requests > RATE_LIMITS.MAX_REQUESTS) {
          return res
            .status(429)
            .json({ message: 'Too many requests, please try again later.' });
        }
      } else {
        const newRateLimit = new RateLimit({
          ip,
          requests: 1,
          lastRequest: currentTime,
        });
        await newRateLimit.save();
      }

      next();
    } catch (error) {
      next(new Error('Internal server error'));
    }
  },
});

module.exports = limiter;
