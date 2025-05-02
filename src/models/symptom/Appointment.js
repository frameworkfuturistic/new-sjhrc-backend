const { mysqlPool } = require('../../config/database');
const logger = require('../../utils/logger');
const { DatabaseError } = require('../../utils/errors');

class Appointment {
  static tableName = 'opd_onlineappointments';

  /**
   * Create a new appointment with transaction support
   */
  static async create(appointmentData, connection = null) {
    const useExternalConnection = !!connection;
    if (!connection) connection = await mysqlPool.getConnection();

    try {
      if (!useExternalConnection) await connection.beginTransaction();

      const [result] = await connection.query(
        `INSERT INTO ${this.tableName} SET ?`,
        [appointmentData]
      );

      const [rows] = await connection.query(
        `SELECT * FROM ${this.tableName} WHERE AppointmentID = ? LIMIT 1`,
        [result.insertId]
      );

      if (!useExternalConnection) await connection.commit();
      return rows[0];
    } catch (error) {
      if (!useExternalConnection && connection) await connection.rollback();
      logger.error('Error creating appointment:', error);
      throw error;
    } finally {
      if (!useExternalConnection && connection) connection.release();
    }
  }

  /**
   * Find appointment by ID
   */
  static async findById(appointmentId) {
    try {
      const [rows] = await mysqlPool.query(
        `SELECT * FROM ${this.tableName} 
        WHERE AppointmentID = ? AND IsDeleted = FALSE LIMIT 1`,
        [appointmentId]
      );
      return rows[0] || null;
    } catch (error) {
      logger.error(`Error finding appointment ${appointmentId}:`, error);
      throw error;
    }
  }

  /**
   * Update appointment with transaction support
   */
  static async update(appointmentId, updateData, connection = null) {
    const useExternalConnection = !!connection;
    if (!connection) connection = await mysqlPool.getConnection();

    try {
      if (!useExternalConnection) await connection.beginTransaction();

      const [result] = await connection.query(
        `UPDATE ${this.tableName} SET ? 
        WHERE AppointmentID = ? AND IsDeleted = FALSE`,
        [updateData, appointmentId]
      );

      if (!useExternalConnection) await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      if (!useExternalConnection && connection) await connection.rollback();
      logger.error(`Error updating appointment ${appointmentId}:`, error);
      throw error;
    } finally {
      if (!useExternalConnection && connection) connection.release();
    }
  }

  /**
   * Search appointments with flexible criteria
   */
  static async search(criteria) {
    try {
      let query = `
    SELECT 
      app.*,
      con.ConsultantName,
      con.ProfessionalDegree,
      con.OPDConsultationFee,
      dep.Department AS DepartmentName,
      slot.SlotTime,
      slot.SlotEndTime,
      slot.SlotDate,
      slot.IsBooked,
      slot.Status AS SlotStatus,
      slot.MaxSlots,
      slot.AvailableSlots
    FROM ${this.tableName} app
    LEFT JOIN gen_consultants con ON app.ConsultantID = con.ConsultantID
    LEFT JOIN gen_departments dep ON app.DepartmentID = dep.DepartmentID
    LEFT JOIN gen_onlineslots slot ON app.SlotID = slot.SlotID 
      AND DATE(app.ConsultationDate) = DATE(slot.SlotDate)
    WHERE app.IsDeleted = FALSE
    `;

      const conditions = [];
      const values = [];

      const allowedFields = [
        'AppointmentID',
        'MRNo',
        'MobileNo',
        'ConsultantID',
        'Status',
        'PaymentStatus',
        'startDate',
        'endDate',
      ];

      const invalidFields = Object.keys(criteria).filter(
        (key) => !allowedFields.includes(key)
      );
      if (invalidFields.length > 0) {
        throw new Error(`Invalid search field(s): ${invalidFields.join(', ')}`);
      }

      if (criteria.AppointmentID) {
        conditions.push('app.AppointmentID = ?');
        values.push(criteria.AppointmentID);
      }

      if (criteria.MRNo) {
        conditions.push('app.MRNo = ?');
        values.push(criteria.MRNo);
      }

      if (criteria.MobileNo) {
        conditions.push('app.MobileNo = ?');
        values.push(criteria.MobileNo);
      }

      if (criteria.ConsultantID) {
        conditions.push('app.ConsultantID = ?');
        values.push(criteria.ConsultantID);
      }

      if (criteria.Status) {
        conditions.push('app.Status = ?');
        values.push(criteria.Status);
      }

      if (criteria.PaymentStatus) {
        conditions.push('app.PaymentStatus = ?');
        values.push(criteria.PaymentStatus);
      }

      if (criteria.startDate) {
        conditions.push('app.ConsultationDate >= ?');
        values.push(criteria.startDate);
      }

      if (criteria.endDate) {
        conditions.push('app.ConsultationDate <= ?');
        values.push(criteria.endDate);
      }

      if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
      }

      query += ' ORDER BY app.ConsultationDate DESC, app.CreatedAt DESC';

      const [appointments] = await mysqlPool.query(query, values);
      return appointments;
    } catch (error) {
      logger.error('Error searching appointments:', error.message);
      throw error;
    }
  }

  /**
   * Get all appointments with pagination, filtering, sorting, and field selection
   * @param {Object} filters - Filter criteria
   * @param {Object} pagination - Pagination settings
   * @param {Object} options - Additional options (sorting, field selection)
   * @returns {Promise<Object>} Paginated appointment data
   */
  static async getAll(filters = {}, pagination = { page: 1, limit: 10 }) {
    const connection = await mysqlPool.getConnection();
    try {
      // Validate and parse pagination parameters
      const page = Math.max(1, parseInt(pagination.page) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(pagination.limit) || 10)
      );

      // Base query with joins
      let query = `
        SELECT 
          app.*,
          con.ConsultantName,
          con.ProfessionalDegree,
          con.OPDConsultationFee,
          dep.Department AS DepartmentName,
          slot.SlotTime,
          slot.SlotEndTime,
          slot.SlotDate,
          slot.IsBooked,
          slot.Status AS SlotStatus,
          slot.MaxSlots,
          slot.AvailableSlots
        FROM opd_onlineappointments app
        LEFT JOIN gen_consultants con ON app.ConsultantID = con.ConsultantID
        LEFT JOIN gen_departments dep ON app.DepartmentID = dep.DepartmentID
        LEFT JOIN gen_onlineslots slot ON app.SlotID = slot.SlotID 
          AND DATE(app.ConsultationDate) = DATE(slot.SlotDate)
        WHERE app.IsDeleted = FALSE
      `;

      let countQuery = `SELECT COUNT(*) as total FROM opd_onlineappointments app WHERE app.IsDeleted = FALSE`;

      const conditions = [];
      const values = [];
      const countValues = [];

      // Define allowed filters and their handlers
      const filterHandlers = {
        Status: (value) => {
          const allowedStatuses = [
            'Pending',
            'Confirmed',
            'Completed',
            'Cancelled',
            'No Show',
          ];
          if (allowedStatuses.includes(value)) {
            conditions.push('app.Status = ?');
            values.push(value);
            countValues.push(value);
          }
        },
        ConsultantID: (value) => {
          const id = parseInt(value);
          if (!isNaN(id)) {
            conditions.push('app.ConsultantID = ?');
            values.push(id);
            countValues.push(id);
          }
        },
        DepartmentID: (value) => {
          const id = parseInt(value);
          if (!isNaN(id)) {
            conditions.push('app.DepartmentID = ?');
            values.push(id);
            countValues.push(id);
          }
        },
        MRNo: (value) => {
          if (typeof value === 'string' && value.trim()) {
            conditions.push('app.MRNo = ?');
            values.push(value.trim());
            countValues.push(value.trim());
          }
        },
        MobileNo: (value) => {
          if (typeof value === 'string' && value.trim()) {
            conditions.push('app.MobileNo = ?');
            values.push(value.trim());
            countValues.push(value.trim());
          }
        },
        SlotID: (value) => {
          const id = parseInt(value);
          if (!isNaN(id)) {
            conditions.push('app.SlotID = ?');
            values.push(id);
            countValues.push(id);
          }
        },
        AppointmentID: (value) => {
          const id = parseInt(value);
          if (!isNaN(id)) {
            conditions.push('app.AppointmentID = ?');
            values.push(id);
            countValues.push(id);
          }
        },
        startDate: (value) => {
          if (value) {
            conditions.push('app.ConsultationDate >= ?');
            values.push(value);
            countValues.push(value);
          }
        },
        endDate: (value) => {
          if (value) {
            conditions.push('app.ConsultationDate <= ?');
            values.push(value);
            countValues.push(value);
          }
        },
        PaymentStatus: (value) => {
          const allowedStatuses = ['Pending', 'Paid', 'Failed', 'Refunded'];
          if (allowedStatuses.includes(value)) {
            conditions.push('app.PaymentStatus = ?');
            values.push(value);
            countValues.push(value);
          }
        },
      };

      // Apply filters using the handlers
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          const handler = filterHandlers[key];
          if (handler) {
            handler(value);
          }
        }
      });

      // Add conditions to queries
      if (conditions.length > 0) {
        const whereClause = ' AND ' + conditions.join(' AND ');
        query += whereClause;
        countQuery += whereClause;
      }

      // Get total count
      const [countResult] = await connection.query(countQuery, countValues);
      const total = countResult[0]?.total || 0;
      const totalPages = Math.ceil(total / limit);

      // Add sorting and pagination
      query +=
        ' ORDER BY app.ConsultationDate DESC, app.CreatedAt DESC LIMIT ? OFFSET ?';
      values.push(limit, (page - 1) * limit);

      // Execute query
      const [rows] = await connection.query(query, values);

      // Format response
      const data = rows.map((row) => {
        const appointment = {
          ...row,
          Consultant: {
            ConsultantID: row.ConsultantID,
            ConsultantName: row.ConsultantName,
            ProfessionalDegree: row.ProfessionalDegree,
            ConsultationFee: row.OPDConsultationFee,
          },
          Department: {
            DepartmentID: row.DepartmentID,
            DepartmentName: row.DepartmentName,
          },
          Slot: {
            SlotID: row.SlotID,
            SlotTime: row.SlotTime,
            SlotEndTime: row.SlotEndTime,
            SlotDate: row.SlotDate,
            IsBooked: row.IsBooked,
            Status: row.SlotStatus,
            MaxSlots: row.MaxSlots,
            AvailableSlots: row.AvailableSlots,
          },
        };

        // Remove joined fields from root level
        [
          'ConsultantName',
          'ProfessionalDegree',
          'OPDConsultationFee',
          'DepartmentName',
          'SlotTime',
          'SlotEndTime',
          'SlotDate',
          'IsBooked',
          'SlotStatus',
          'MaxSlots',
          'AvailableSlots',
        ].forEach((field) => delete appointment[field]);

        return appointment;
      });

      return {
        data,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      console.error('Database Error:', error);
      throw new DatabaseError('Failed to retrieve appointments', {
        message: error.message,
        code: error.code,
        sql: error.sql,
      });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Cleanup expired appointments (for cron job)
   */
  // static async cleanupExpired() {
  //   let connection;
  //   try {
  //     connection = await mysqlPool.getConnection();
  //     await connection.beginTransaction();

  //     // Find pending appointments older than 30 minutes
  //     const [expired] = await connection.query(
  //       `SELECT AppointmentID, SlotID FROM ${this.tableName}
  //       WHERE Status = 'Pending' AND PaymentStatus = 'Pending'
  //       AND CreatedAt < DATE_SUB(NOW(), INTERVAL 30 MINUTE)`
  //     );

  //     if (expired.length === 0) {
  //       await connection.rollback();
  //       return { count: 0 };
  //     }

  //     // Release associated slots
  //     // await connection.query(
  //     //   `UPDATE gen_onlineslots
  //     //   SET Status = 'Available', IsBooked = FALSE, AppointmentID = NULL
  //     //   WHERE SlotID IN (?)`,
  //     //   [expired.map((e) => e.SlotID)]
  //     // );

  //     await connection.query(
  //       `UPDATE gen_onlineslots
  //        SET
  //          Status = 'Available',
  //          IsBooked = FALSE,
  //          AppointmentID = NULL,
  //          AvailableSlots = MaxSlots
  //        WHERE SlotID IN (?)`,
  //       [expired.map((e) => e.SlotID)]
  //     );

  //     // Mark appointments as expired
  //     const [result] = await connection.query(
  //       `UPDATE ${this.tableName}
  //       SET Status = 'Cancelled', Remarks = 'Expired - automatic cancellation'
  //       WHERE AppointmentID IN (?)`,
  //       [expired.map((e) => e.AppointmentID)]
  //     );

  //     await connection.commit();
  //     return { count: result.affectedRows };
  //   } catch (error) {
  //     if (connection) await connection.rollback();
  //     logger.error('Error cleaning up expired appointments:', error);
  //     throw error;
  //   } finally {
  //     if (connection) connection.release();
  //   }
  // }

  /**
   * Advanced secure cleanup of expired appointments
   * @returns {Promise<{count: number, slotsFreed: number, warnings?: string[]}>}
   */
  static async cleanupExpired() {
    let connection;
    try {
      // Validate environment first
      if (!mysqlPool) throw new Error('Database pool not initialized');

      connection = await mysqlPool.getConnection();
      await connection.beginTransaction();

      // 1. Find expired appointments with parameterized query
      const [expired] = await connection.execute(
        `SELECT AppointmentID, SlotID FROM ${this.tableName} 
       WHERE Status = ? AND PaymentStatus = ?
       AND CreatedAt < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
        ['Pending', 'Pending', 10] // Parameterized values 10 min
      );

      if (!expired || expired.length === 0) {
        await connection.rollback();
        return { count: 0, slotsFreed: 0 };
      }

      // 2. Validate IDs are safe integers
      const validatedData = expired
        .map((entry) => ({
          appointmentId: Number.parseInt(entry.AppointmentID),
          slotId: Number.parseInt(entry.SlotID),
        }))
        .filter(
          (entry) =>
            !isNaN(entry.appointmentId) &&
            !isNaN(entry.slotId) &&
            entry.appointmentId > 0 &&
            entry.slotId > 0
        );

      if (validatedData.length !== expired.length) {
        logger.warn('Some invalid IDs were filtered out');
      }

      // 3. Process in batches for safety
      const BATCH_SIZE = 100;
      let totalProcessed = 0;
      const warnings = [];

      for (let i = 0; i < validatedData.length; i += BATCH_SIZE) {
        const batch = validatedData.slice(i, i + BATCH_SIZE);
        const slotIds = batch.map((e) => e.slotId);
        const appointmentIds = batch.map((e) => e.appointmentId);

        // 4. Update slots with proper parameterization
        const [slotResult] = await connection.execute(
          `UPDATE gen_onlineslots 
         SET Status = ?, IsBooked = ?, 
             AppointmentID = ?, AvailableSlots = MaxSlots
         WHERE SlotID IN (${slotIds.map(() => '?').join(',')})`,
          ['Available', false, null, ...slotIds]
        );

        // 5. Update appointments
        const [appointmentResult] = await connection.execute(
          `UPDATE ${this.tableName} 
         SET Status = ?, Remarks = ?, CancelledAt = NOW()
         WHERE AppointmentID IN (${appointmentIds.map(() => '?').join(',')})`,
          [
            'Cancelled',
            'Expired - automatic cancellation...',
            ...appointmentIds,
          ]
        );

        if (slotResult.affectedRows !== appointmentResult.affectedRows) {
          warnings.push(
            `Mismatch in batch ${i / BATCH_SIZE + 1}: slots ${slotResult.affectedRows} vs appointments ${appointmentResult.affectedRows}`
          );
        }

        totalProcessed += appointmentResult.affectedRows;
      }

      await connection.commit();

      return {
        count: totalProcessed,
        slotsFreed: totalProcessed,
        ...(warnings.length ? { warnings } : {}),
      };
    } catch (error) {
      if (connection) await connection.rollback();

      // Enhanced error logging
      logger.error({
        message: 'Cleanup failed',
        error: error.message,
        stack: error.stack,
        code: error.code,
        sqlState: error.sqlState,
      });

      throw new DatabaseError('Cleanup transaction failed', {
        originalError: error,
        isRetryable: !error.code?.startsWith('ER_'), // Non-MySQL errors are retryable
      });
    } finally {
      if (connection) {
        try {
          await connection.release();
        } catch (releaseError) {
          logger.warn('Connection release failed:', releaseError);
        }
      }
    }
  }

  /**
   * Update appointment status with additional checks
   */
  static async updateStatus(appointmentId, newStatus, connection = null) {
    const validTransitions = {
      Pending: ['Confirmed', 'Cancelled'],
      Confirmed: ['Completed', 'Cancelled', 'No Show'],
      Completed: [],
      Cancelled: [],
      'No Show': [],
    };

    const useExternalConnection = !!connection;
    if (!connection) connection = await mysqlPool.getConnection();

    try {
      if (!useExternalConnection) await connection.beginTransaction();

      // Get current status
      const [rows] = await connection.query(
        `SELECT Status FROM ${this.tableName} 
          WHERE AppointmentID = ? AND IsDeleted = FALSE LIMIT 1`,
        [appointmentId]
      );

      if (rows.length === 0) {
        throw new Error('Appointment not found');
      }

      const currentStatus = rows[0].Status;

      // Validate status transition
      if (!validTransitions[currentStatus]?.includes(newStatus)) {
        throw new Error(
          `Invalid status transition from ${currentStatus} to ${newStatus}`
        );
      }

      // Update status
      const [result] = await connection.query(
        `UPDATE ${this.tableName} 
          SET Status = ?
          WHERE AppointmentID = ? AND IsDeleted = FALSE`,
        [newStatus, appointmentId]
      );

      if (!useExternalConnection) await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      if (!useExternalConnection && connection) await connection.rollback();
      logger.error(
        `Error updating status for appointment ${appointmentId}:`,
        error
      );
      throw error;
    } finally {
      if (!useExternalConnection && connection) connection.release();
    }
  }

  /**
   * Get appointment statistics
   */
  static async getStats(consultantId, startDate, endDate) {
    try {
      const [stats] = await mysqlPool.query(
        `SELECT 
            Status,
            COUNT(*) as count,
            SUM(AmountPaid) as totalAmount
          FROM ${this.tableName}
          WHERE ConsultantID = ?
          AND ConsultationDate BETWEEN ? AND ?
          GROUP BY Status`,
        [consultantId, startDate, endDate]
      );

      return stats;
    } catch (error) {
      logger.error('Error fetching appointment stats:', error);
      throw error;
    }
  }
}

module.exports = Appointment;
