const { mysqlPool } = require('../../config/database');
const logger = require('../../utils/logger');

class TimeSlot {
  static tableName = 'gen_onlineslots';

  /**
   * Create multiple time slots
   * @param {Array} slots
   * @returns {Promise<Array>} Created slots
   */
  static async bulkCreate(slots) {
    try {
      const [result] = await mysqlPool.query(
        `INSERT INTO ${this.tableName} 
        (ConsultantID, SlotDate, SlotTime, SlotEndTime, MaxSlots, AvailableSlots, 
         Status, SlotToken, IsBooked, IsActive) 
        VALUES ?`,
        [
          slots.map((s) => [
            s.ConsultantID,
            s.SlotDate,
            s.SlotTime,
            s.SlotEndTime,
            s.MaxSlots || 1,
            s.AvailableSlots || s.MaxSlots || 1,
            s.Status || 'Available',
            s.SlotToken,
            s.IsBooked || false,
            s.IsActive !== false,
          ]),
        ]
      );
      return result;
    } catch (error) {
      logger.error('Error creating time slots:', error);
      throw error;
    }
  }

  /**
   * Find available slots for a doctor on a specific date
   * @param {number} consultantId
   * @param {string} date
   * @returns {Promise<Array>} Array of slots
   */
  static async findAvailableSlots(consultantId, date) {
    try {
      // const [slots] = await mysqlPool.query(
      //   `SELECT * FROM ${this.tableName}
      //   WHERE ConsultantID = ? AND SlotDate = ? AND Status = 'Available'
      //   AND AvailableSlots > 0 AND IsActive = TRUE
      //   ORDER BY SlotTime ASC`,
      //   [consultantId, date]
      // );

      const [slots] = await mysqlPool.query(
        `SELECT * FROM ${this.tableName}
         WHERE ConsultantID = ? 
           AND SlotDate = ? 
           AND IsActive = TRUE
         ORDER BY SlotTime ASC`,
        [consultantId, date]
      );

      return slots;
    } catch (error) {
      logger.error(
        `Error finding slots for consultant ${consultantId} on ${date}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Find all slots for a doctor
   * @param {number} consultantId
   * @returns {Promise<Array>} Array of slots
   */
  static async findAllByConsultant(consultantId) {
    try {
      const [slots] = await mysqlPool.query(
        `SELECT * FROM ${this.tableName} 
        WHERE ConsultantID = ? AND IsActive = TRUE
        ORDER BY SlotDate ASC, SlotTime ASC`,
        [parseInt(consultantId)]
      );
      return slots;
    } catch (error) {
      logger.error(
        `Error finding slots for consultant ${consultantId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Check if slot token exists
   * @param {string} slotToken
   * @returns {Promise<boolean>}
   */
  static async slotTokenExists(slotToken) {
    try {
      const [results] = await mysqlPool.query(
        `SELECT 1 FROM ${this.tableName} WHERE SlotToken = ? LIMIT 1`,
        [slotToken]
      );
      return results.length > 0;
    } catch (error) {
      logger.error(`Error checking slot token ${slotToken}:`, error);
      throw error;
    }
  }

  /**
   * Get all slots
   * @returns {Promise<Array>} Array of all slots
   */
  static async findAll() {
    try {
      const [slots] = await mysqlPool.query(
        `SELECT * FROM ${this.tableName} WHERE IsActive = TRUE`
      );
      return slots;
    } catch (error) {
      logger.error('Error fetching all slots:', error);
      throw error;
    }
  }

  /**
   * Reserve a slot
   * @param {number} slotId
   * @param {number} appointmentId
   * @returns {Promise<boolean>} True if reservation was successful
   */
  // static async reserveSlot(slotId, appointmentId) {
  //   let connection;
  //   try {
  //     connection = await mysqlPool.getConnection();
  //     await connection.beginTransaction();

  //     const [result] = await connection.query(
  //       `UPDATE ${this.tableName}
  //       SET AvailableSlots = AvailableSlots - 1,
  //           IsBooked = IF(AvailableSlots - 1 <= 0, TRUE, IsBooked),
  //           Status = IF(AvailableSlots - 1 <= 0, 'Booked', 'Hold'),
  //           AppointmentID = ?
  //       WHERE SlotID = ? AND AvailableSlots > 0`,
  //       [appointmentId, slotId]
  //     );

  //     if (result.affectedRows === 0) {
  //       await connection.rollback();
  //       return false;
  //     }

  //     await connection.commit();
  //     return true;
  //   } catch (error) {
  //     if (connection) await connection.rollback();
  //     logger.error(`Error reserving slot ${slotId}:`, error);
  //     throw error;
  //   } finally {
  //     if (connection) connection.release();
  //   }
  // }

  /**
   * Release a slot
   * @param {number} slotId
   * @returns {Promise<boolean>} True if release was successful
   */
  static async releaseSlot(slotId) {
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.beginTransaction();

      const [result] = await connection.query(
        `UPDATE ${this.tableName} 
        SET AvailableSlots = AvailableSlots + 1, 
            IsBooked = FALSE,
            Status = IF(AvailableSlots + 1 >= MaxSlots, 'Available', 'Hold'),
            AppointmentID = NULL
        WHERE SlotID = ?`,
        [slotId]
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        return false;
      }

      await connection.commit();
      return true;
    } catch (error) {
      if (connection) await connection.rollback();
      logger.error(`Error releasing slot ${slotId}:`, error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Find slot by ID with transaction support
   */
  static async findById(slotId, connection = null) {
    console.log('Finding slot by ID:', slotId);
    const useExternalConnection = !!connection;
    if (!connection) connection = await mysqlPool.getConnection();

    try {
      const [rows] = await connection.query(
        `SELECT * FROM ${this.tableName} WHERE SlotID = ? LIMIT 1`,
        [slotId]
      );
      return rows[0] || null;
    } catch (error) {
      logger.error(`Error finding slot ${slotId}:`, error);
      throw error;
    } finally {
      if (!useExternalConnection && connection) connection.release();
    }
  }

  // Add these new methods to your TimeSlot class
  static async findByIdForBooking(slotId, connection = null) {
    console.log('Finding slot by ID for booking:', slotId);
    const useExternalConnection = !!connection;
    if (!connection) connection = await mysqlPool.getConnection();

    try {
      const [rows] = await connection.query(
        `SELECT * FROM ${this.tableName} 
       WHERE SlotID = ? 
       AND Status IN ('Available', 'Hold')
       AND AvailableSlots > 0
       AND IsActive = TRUE
       FOR UPDATE`, // This is crucial for preventing race conditions
        [slotId]
      );

      logger.debug('Slot query results:', {
        slotId,
        rowCount: rows.length,
        status: rows[0]?.Status,
        availableSlots: rows[0]?.AvailableSlots,
      });

      return rows[0] || null;
    } catch (error) {
      logger.error(`Error finding slot ${slotId} for booking:`, error);
      throw error;
    } finally {
      if (!useExternalConnection && connection) connection.release();
    }
  }

  static async reserveSlotAtomic(connection, slotId, appointmentId) {
    try {
      // First verify the slot is still available
      const slot = await this.findByIdForBooking(slotId, connection);
      if (!slot) {
        throw new Error('Slot not available for booking');
      }

      // Calculate new values
      const newAvailableSlots = slot.AvailableSlots - 1;
      const newStatus = newAvailableSlots <= 0 ? 'Booked' : 'Hold';

      const [result] = await connection.query(
        `UPDATE ${this.tableName} 
       SET AvailableSlots = ?,
           Status = ?,
           AppointmentID = ?,
           UpdatedAt = NOW()
       WHERE SlotID = ?`,
        [newAvailableSlots, newStatus, appointmentId, slotId]
      );

      if (result.affectedRows === 0) {
        throw new Error('Slot reservation failed - no rows affected');
      }

      return {
        success: true,
        newStatus,
        availableSlots: newAvailableSlots,
      };
    } catch (error) {
      logger.error(`Atomic slot reservation failed for slot ${slotId}:`, error);
      throw error;
    }
  }

  static async reserveSlot(slotId, appointmentId, connection) {
    try {
      // Set lock wait timeout (in milliseconds) for this operation
      await connection.query('SET SESSION innodb_lock_wait_timeout = 30'); // 30 seconds

      const [result] = await connection.query(
        `UPDATE gen_onlineslots 
         SET AvailableSlots = AvailableSlots - 1,
             IsBooked = IF(AvailableSlots - 1 <= 0, TRUE, FALSE),
             Status = IF(AvailableSlots - 1 <= 0, 'Booked', 'Hold'),
             AppointmentID = ?,
             UpdatedAt = NOW()
         WHERE SlotID = ? AND AvailableSlots > 0
         LIMIT 1`, // Important for locking only one row
        [appointmentId, slotId]
      );

      if (result.affectedRows === 0) {
        throw new Error('No slots available after lock');
      }

      return true;
    } catch (error) {
      logger.error(`Error reserving slot ${slotId}:`, error);
      throw error;
    }
  }

  /**
   * Confirm slot booking after successful payment
   */
  static async confirmBooking(slotId, appointmentId, connection = null) {
    const useExternalConnection = !!connection;
    if (!connection) connection = await mysqlPool.getConnection();

    try {
      if (!useExternalConnection) await connection.beginTransaction();

      const [result] = await connection.query(
        `UPDATE ${this.tableName} 
        SET Status = 'Booked',
            IsBooked = TRUE,
            AppointmentID = ?
        WHERE SlotID = ?`,
        [appointmentId, slotId]
      );

      if (!useExternalConnection) await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      if (!useExternalConnection && connection) await connection.rollback();
      logger.error(`Error confirming booking for slot ${slotId}:`, error);
      throw error;
    } finally {
      if (!useExternalConnection && connection) connection.release();
    }
  }

  /**
   * Get slots with appointment details
   */
  static async getSlotsWithAppointments(consultantId, startDate, endDate) {
    try {
      const [slots] = await mysqlPool.query(
        `SELECT s.*, a.AppointmentID, a.PatientName, a.MobileNo, a.Status as AppointmentStatus
        FROM ${this.tableName} s
        LEFT JOIN opd_onlineappointments a ON s.SlotID = a.SlotID
        WHERE s.ConsultantID = ? 
        AND s.SlotDate BETWEEN ? AND ?
        ORDER BY s.SlotDate, s.SlotTime`,
        [consultantId, startDate, endDate]
      );
      return slots;
    } catch (error) {
      logger.error('Error fetching slots with appointments:', error);
      throw error;
    }
  }
}

module.exports = TimeSlot;
