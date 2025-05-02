const {
  getAnnouncementStats,
  getAppointmentStats,
  getSlotsStats,
  getApplicationStats,
} = require('../services/statsService');
const { AppError } = require('../middleware/error');
const logger = require('../utils/logger');

exports.getSystemStats = async (req, res, next) => {
  try {
    // Execute all stats queries in parallel
    const [announcements, slots, applications, appointments] =
      await Promise.allSettled([
        getAnnouncementStats(),
        getSlotsStats(),
        getApplicationStats(),
        getAppointmentStats(),
      ]);

    // Check for failed promises
    const errors = [announcements, slots, applications, appointments]
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason.message);

    if (errors.length > 0) {
      logger.warn('Partial stats failure', { errors });
    }

    // Build response with successful results
    const stats = {
      announcements:
        announcements.status === 'fulfilled' ? announcements.value : null,
      slots: slots.status === 'fulfilled' ? slots.value : null,
      applications:
        applications.status === 'fulfilled' ? applications.value : null,
      appointments:
        appointments.status === 'fulfilled' ? appointments.value : null,
      timestamp: new Date(),
      ...(errors.length > 0 && { warnings: errors }),
    };

    res.status(200).json(stats);
  } catch (error) {
    logger.error('System stats error:', error);
    next(new AppError('Failed to load system statistics', 500));
  }
};
