const { mysqlPool } = require('../config/database');
const logger = require('../utils/logger');
const { DatabaseError } = require('../utils/errors');
const Announcement = require('../models/Announcement');
const Appointment = require('../models/symptom/Appointment');
const JobApplication = require('../models/JobApplication');

// Cache setup
const NodeCache = require('node-cache');
const statsCache = new NodeCache({
  stdTTL: 300, // 5 minutes cache
  checkperiod: 60, // check for expired items every minute
  useClones: false, // better performance for our use case
});

// Helper function for MySQL queries with retry logic
async function queryWithRetry(sql, params, retries = 3) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const [results] = await mysqlPool.query(sql, params);
      return results;
    } catch (error) {
      lastError = error;
      if (i < retries - 1) {
        // Exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, 100 * Math.pow(2, i))
        );
        continue;
      }
      throw new DatabaseError('MySQL query failed after retries', {
        originalError: error,
        sql,
        params,
      });
    }
  }
}

// Helper function to convert aggregation results to key-value pairs
function aggregateToObject(
  aggregation,
  keyField = '_id',
  valueField = 'count'
) {
  return aggregation.reduce(
    (acc, item) => ({
      ...acc,
      [item[keyField]]: item[valueField],
    }),
    {}
  );
}

// Announcement Statistics
exports.getAnnouncementStats = async () => {
  const cacheKey = 'announcementStats';
  const cached = statsCache.get(cacheKey);
  if (cached) {
    logger.debug('Returning cached announcement stats');
    return cached;
  }

  try {
    const [
      total,
      byType,
      byStatus,
      byPriority,
      recentActivity,
      upcomingCount,
      latest,
    ] = await Promise.all([
      Announcement.countDocuments(),
      Announcement.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      Announcement.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Announcement.aggregate([
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
      Announcement.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Announcement.countDocuments({ startDate: { $gt: new Date() } }),
      Announcement.findOne()
        .sort({ createdAt: -1 })
        .select('title createdAt')
        .lean(),
    ]);

    const stats = {
      total,
      byType: aggregateToObject(byType),
      byStatus: aggregateToObject(byStatus),
      byPriority: aggregateToObject(byPriority),
      recentActivity,
      upcomingCount,
      latest,
    };

    statsCache.set(cacheKey, stats);
    return stats;
  } catch (error) {
    logger.error('Announcement stats error:', error);
    throw error;
  }
};

// Appointment Statistics
exports.getAppointmentStats = async () => {
  const cacheKey = 'appointmentStats';
  const cached = statsCache.get(cacheKey);
  if (cached) {
    logger.debug('Returning cached appointment stats');
    return cached;
  }

  try {
    const [
      totalResult,
      statusStats,
      paymentStats,
      dailyTrends,
      consultantStats,
      departmentStats,
      cancellationStats,
      timeUtilization,
      latestAppointments,
    ] = await Promise.all([
      queryWithRetry(
        `SELECT COUNT(*) as total FROM opd_onlineappointments WHERE IsDeleted = FALSE`
      ),
      queryWithRetry(
        `SELECT Status, COUNT(*) as count 
         FROM opd_onlineappointments
         WHERE IsDeleted = FALSE
         GROUP BY Status`
      ),
      queryWithRetry(
        `SELECT PaymentStatus, COUNT(*) as count 
         FROM opd_onlineappointments
         WHERE IsDeleted = FALSE
         GROUP BY PaymentStatus`
      ),
      queryWithRetry(
        `SELECT DATE(ConsultationDate) as date, COUNT(*) as totalAppointments,
         SUM(CASE WHEN Status = 'Completed' THEN 1 ELSE 0 END) as completed,
         SUM(AmountPaid) as dailyRevenue
         FROM opd_onlineappointments
         WHERE IsDeleted = FALSE AND ConsultationDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         GROUP BY DATE(ConsultationDate)
         ORDER BY DATE(ConsultationDate) ASC`
      ),
      queryWithRetry(
        `SELECT c.ConsultantID, c.ConsultantName, COUNT(a.AppointmentID) as totalAppointments,
         SUM(CASE WHEN a.Status = 'Completed' THEN 1 ELSE 0 END) as completed,
         SUM(a.AmountPaid) as totalRevenue, ROUND(AVG(a.AmountPaid), 2) as avgRevenue,
         ROUND((SUM(CASE WHEN a.Status = 'Completed' THEN 1 ELSE 0 END) / COUNT(a.AppointmentID)) * 100, 2) as completionRate
         FROM opd_onlineappointments a
         JOIN gen_consultants c ON a.ConsultantID = c.ConsultantID
         WHERE a.IsDeleted = FALSE
         GROUP BY c.ConsultantID, c.ConsultantName
         ORDER BY totalRevenue DESC`
      ),
      queryWithRetry(
        `SELECT d.DepartmentID, d.Department, COUNT(a.AppointmentID) as totalAppointments,
         SUM(a.AmountPaid) as totalRevenue
         FROM opd_onlineappointments a
         JOIN gen_departments d ON a.DepartmentID = d.DepartmentID
         WHERE a.IsDeleted = FALSE
         GROUP BY d.DepartmentID, d.Department
         ORDER BY totalAppointments DESC`
      ),
      queryWithRetry(
        `SELECT COUNT(*) as totalCancelled,
         SUM(CASE WHEN Remarks LIKE '%automatic%' THEN 1 ELSE 0 END) as autoCancelled,
         SUM(CASE WHEN Remarks LIKE '%patient%' THEN 1 ELSE 0 END) as patientCancelled,
         SUM(CASE WHEN Remarks LIKE '%doctor%' THEN 1 ELSE 0 END) as doctorCancelled
         FROM opd_onlineappointments
         WHERE IsDeleted = FALSE AND Status = 'Cancelled'`
      ),
      queryWithRetry(
        `SELECT HOUR(s.SlotTime) as hour, COUNT(a.AppointmentID) as appointments,
         AVG(a.AmountPaid) as avgRevenue
         FROM opd_onlineappointments a
         JOIN gen_onlineslots s ON a.SlotID = s.SlotID
         WHERE a.IsDeleted = FALSE
         GROUP BY HOUR(s.SlotTime)
         ORDER BY HOUR(s.SlotTime)`
      ),
      Appointment.getAll({}, { page: 1, limit: 5 }).then((res) => res.data),
    ]);

    const totalRevenue = dailyTrends.reduce(
      (sum, day) => sum + (day.dailyRevenue || 0),
      0
    );
    const totalAppointments = totalResult[0].total;

    const stats = {
      total: totalAppointments,
      byStatus: aggregateToObject(statusStats, 'Status'),
      byPaymentStatus: aggregateToObject(paymentStats, 'PaymentStatus'),
      dailyTrends,
      byConsultant: consultantStats,
      byDepartment: departmentStats,
      cancellations: cancellationStats[0],
      timeUtilization,
      latestAppointments,
      revenueStats: {
        total: totalRevenue,
        avgPerAppointment:
          totalAppointments > 0
            ? (totalRevenue / totalAppointments).toFixed(2)
            : 0,
      },
    };

    statsCache.set(cacheKey, stats);
    return stats;
  } catch (error) {
    logger.error('Appointment stats error:', error);
    throw error;
  }
};

// Slot Statistics
exports.getSlotsStats = async () => {
  const cacheKey = 'slotsStats';
  const cached = statsCache.get(cacheKey);
  if (cached) {
    logger.debug('Returning cached slots stats');
    return cached;
  }

  try {
    const [
      totalResult,
      availabilityStats,
      statusStats,
      consultantStats,
      dailyTrends,
      timeDistribution,
      latestSlots,
    ] = await Promise.all([
      queryWithRetry(
        `SELECT COUNT(*) as total FROM gen_onlineslots WHERE IsActive = TRUE`
      ),
      queryWithRetry(
        `SELECT 
          SUM(CASE WHEN IsBooked = TRUE THEN 1 ELSE 0 END) as booked,
          SUM(CASE WHEN IsBooked = FALSE AND AvailableSlots > 0 THEN 1 ELSE 0 END) as available,
          SUM(CASE WHEN IsBooked = FALSE AND AvailableSlots = 0 THEN 1 ELSE 0 END) as full
        FROM gen_onlineslots
        WHERE IsActive = TRUE`
      ),
      queryWithRetry(
        `SELECT Status, COUNT(*) as count 
         FROM gen_onlineslots
         WHERE IsActive = TRUE
         GROUP BY Status`
      ),
      queryWithRetry(
        `SELECT 
          c.ConsultantID,
          c.ConsultantName,
          COUNT(s.SlotID) as totalSlots,
          SUM(CASE WHEN s.IsBooked = TRUE THEN 1 ELSE 0 END) as bookedSlots,
          ROUND((SUM(CASE WHEN s.IsBooked = TRUE THEN 1 ELSE 0 END) / COUNT(s.SlotID)) * 100, 2) as utilizationRate
        FROM gen_onlineslots s
        JOIN gen_consultants c ON s.ConsultantID = c.ConsultantID
        WHERE s.IsActive = TRUE
        GROUP BY c.ConsultantID, c.ConsultantName
        ORDER BY utilizationRate DESC`
      ),
      queryWithRetry(
        `SELECT 
          DATE(SlotDate) as date,
          COUNT(*) as totalSlots,
          SUM(CASE WHEN IsBooked = TRUE THEN 1 ELSE 0 END) as bookedSlots
        FROM gen_onlineslots
        WHERE IsActive = TRUE AND SlotDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY DATE(SlotDate)
        ORDER BY DATE(SlotDate) ASC`
      ),
      queryWithRetry(
        `SELECT 
          HOUR(SlotTime) as hour,
          COUNT(*) as totalSlots,
          SUM(CASE WHEN IsBooked = TRUE THEN 1 ELSE 0 END) as bookedSlots
        FROM gen_onlineslots
        WHERE IsActive = TRUE
        GROUP BY HOUR(SlotTime)
        ORDER BY HOUR(SlotTime)`
      ),
      queryWithRetry(
        `SELECT * FROM gen_onlineslots 
         WHERE IsActive = TRUE
         ORDER BY SlotDate DESC, SlotTime DESC
         LIMIT 5`
      ),
    ]);

    const total = totalResult[0].total;
    const booked = availabilityStats[0].booked;
    const utilizationRate = total > 0 ? ((booked / total) * 100).toFixed(2) : 0;

    const stats = {
      total,
      availability: {
        booked,
        available: availabilityStats[0].available,
        full: availabilityStats[0].full,
        utilizationRate,
      },
      byStatus: aggregateToObject(statusStats, 'Status'),
      byConsultant: consultantStats,
      dailyTrends,
      timeDistribution,
      latestSlots,
    };

    statsCache.set(cacheKey, stats);
    return stats;
  } catch (error) {
    logger.error('Slots stats error:', error);
    throw error;
  }
};

// Job Application Statistics
exports.getApplicationStats = async () => {
  const cacheKey = 'applicationStats';
  const cached = statsCache.get(cacheKey);
  if (cached) {
    logger.debug('Returning cached application stats');
    return cached;
  }

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      total,
      byStatus,
      applicationTrend,
      statusChanges,
      statusDurations,
      latestApplications,
    ] = await Promise.all([
      JobApplication.countDocuments(),
      JobApplication.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      JobApplication.aggregate([
        {
          $match: {
            appliedAt: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$appliedAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 30 },
      ]),
      // Assuming statusHistory exists in the schema
      JobApplication.aggregate([
        {
          $project: {
            statusChanges: {
              $objectToArray: '$statusHistory',
            },
          },
        },
        { $unwind: '$statusChanges' },
        {
          $group: {
            _id: '$statusChanges.v',
            count: { $sum: 1 },
          },
        },
      ]),
      // Assuming statusTimestamps exists in the schema
      JobApplication.aggregate([
        {
          $project: {
            statusDurations: {
              $objectToArray: '$statusTimestamps',
            },
          },
        },
        { $unwind: '$statusDurations' },
        {
          $group: {
            _id: '$statusDurations.k',
            avgDuration: { $avg: '$statusDurations.v' },
          },
        },
      ]),
      JobApplication.find()
        .sort({ appliedAt: -1 })
        .limit(5)
        .select('applicantName status appliedAt')
        .lean(),
    ]);

    const stats = {
      total,
      byStatus: aggregateToObject(byStatus),
      applicationTrend,
      statusChanges: aggregateToObject(statusChanges),
      statusDurations: statusDurations.reduce(
        (acc, { _id, avgDuration }) => ({
          ...acc,
          [_id]: avgDuration,
        }),
        {}
      ),
      latestApplications,
    };

    statsCache.set(cacheKey, stats);
    return stats;
  } catch (error) {
    logger.error('Job application stats error:', error);
    throw error;
  }
};

// Clear all stats cache (can be called when data changes)
exports.clearStatsCache = () => {
  statsCache.flushAll();
  logger.info('Stats cache cleared');
};
