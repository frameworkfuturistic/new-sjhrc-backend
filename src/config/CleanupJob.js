const cron = require('node-cron');
const cleanupService = require('../services/appointmentCleanup');
const logger = require('../utils/logger');
const HealthMonitor = require('../utils/healthMonitor');

function setupCleanupJob() {
  // Configurable schedule with fallback
  const schedule = process.env.CLEANUP_SCHEDULE || '*/10 * * * *';

  if (!cron.validate(schedule)) {
    throw new Error(`Invalid cron schedule: ${schedule}`);
  }

  const job = cron.schedule(
    schedule,
    async () => {
      try {
        logger.debug('Starting scheduled cleanup job...');
        await cleanupService.executeCleanup();
      } catch (error) {
        logger.error('Scheduled cleanup job failed:', error);
      }
    },
    {
      scheduled: true,
      timezone: process.env.TZ || 'UTC',
    }
  );

  // Graceful shutdown handlers
  const shutdown = async () => {
    logger.info('Stopping cleanup job gracefully...');
    job.stop();

    // Wait for current execution to finish if running
    if (cleanupService.isRunning) {
      logger.info('Waiting for current cleanup to complete...');
      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (!cleanupService.isRunning) {
            clearInterval(check);
            resolve();
          }
        }, 500);
      });
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info(`Cleanup job scheduled with pattern: ${schedule}`);
  return job;
}

module.exports = setupCleanupJob;
