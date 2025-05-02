const Appointment = require('../models/symptom/Appointment');
const logger = require('../utils/logger');
const { retryWithBackoff } = require('../utils/retryUtil');
const HealthMonitor = require('../utils/healthMonitor');

class AppointmentCleanupService {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.lastStatus = 'idle';
    this.metrics = null;

    // Register with health monitor
    HealthMonitor.trackService('appointment-cleanup', this.getStatus());
  }

  async executeCleanup() {
    if (this.isRunning) {
      logger.warn('Cleanup already in progress');
      return { skipped: true };
    }

    this.isRunning = true;
    this.lastRun = new Date();
    this.lastStatus = 'running';
    HealthMonitor.trackService('appointment-cleanup', this.getStatus());

    try {
      const result = await retryWithBackoff(
        () => Appointment.cleanupExpired(),
        {
          retries: 3,
          initialDelay: 1000,
          onRetry: (attempt, delay) => {
            logger.warn(
              `Cleanup retry attempt ${attempt}, delaying ${delay}ms`
            );
          },
        }
      );

      this.lastStatus = 'success';
      this.metrics = result;
      logger.info(`Cleanup completed: ${result.count} appointments processed`);

      HealthMonitor.trackService('appointment-cleanup', this.getStatus());
      return result;
    } catch (error) {
      this.lastStatus = 'failed';
      logger.error('Cleanup failed:', error);

      await HealthMonitor.sendHealthAlert({
        service: 'appointment-cleanup',
        error: error.message,
        severity: error.isDatabaseError ? 'critical' : 'high',
        metadata: {
          lastRun: this.lastRun.toISOString(),
          retryAttempts: 3,
        },
      });

      HealthMonitor.trackService('appointment-cleanup', this.getStatus());
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      lastStatus: this.lastStatus,
      metrics: this.metrics,
      uptime: process.uptime(),
    };
  }
}

module.exports = new AppointmentCleanupService();
