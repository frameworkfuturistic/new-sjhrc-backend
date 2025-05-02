const { mysqlPool } = require('../../config/database');

class SlotModel {
  /**
   * Get available slots for a doctor on a specific date
   * @param {number} doctorId - The consultant ID
   * @param {string} date - The consultation date (YYYY-MM-DD)
   * @returns {Promise<Array>} - Array of available slots
   */
  static async getAvailableSlots(doctorId, date) {
    try {
      // Using idx_consultant_date and idx_booked_status indexes
      const sql = `
        SELECT 
          s.SlotID,
          s.ConsultantID,
          c.ConsultantName,
          s.ConsultationDate,
          s.SlotTime,
          s.SlotToken,
          s.MaxSlots,
          s.AvailableSlots,
          s.isBooked,
          cs.Fee
        FROM 
          opd_doctorslots s
        JOIN 
          gen_consultants c ON s.ConsultantID = c.ConsultantID
        LEFT JOIN 
          gen_consultantshifts cs ON s.ConsultantID = cs.ConsultantID
        WHERE 
          s.ConsultantID = ? 
          AND s.ConsultationDate = ?
          AND s.isBooked = 0
        ORDER BY 
          s.SlotTime
      `;

      return await mysqlPool.query(sql, [doctorId, date]);
    } catch (error) {
      console.error('Error getting available slots:', error);
      throw error;
    }
  }

  /**
   * Add a slot for a specific day
   * @param {Object} slotData - The slot data
   * @returns {Promise<Object>} - The created slot
   */
  static async addSlot(slotData) {
    const {
      consultantId,
      slotTime,
      consultationDate,
      slotToken,
      maxPatientsPerSlot = 1,
    } = slotData;

    const connection = await mysqlPool.getConnection();

    try {
      await connection.beginTransaction();

      // 1. Check if slot already exists
      const [existingSlots] = await connection.execute(
        'SELECT SlotID FROM opd_doctorslots WHERE ConsultantID = ? AND ConsultationDate = ? AND SlotTime = ?',
        [consultantId, consultationDate, slotTime]
      );

      if (existingSlots.length > 0) {
        await connection.rollback();
        return {
          success: false,
          message: 'Slot already exists for this time',
          slotId: existingSlots[0].SlotID,
        };
      }

      // 2. Check if token is already used
      const [existingTokens] = await connection.execute(
        'SELECT SlotID FROM opd_doctorslots WHERE SlotToken = ?',
        [slotToken]
      );

      if (existingTokens.length > 0) {
        await connection.rollback();
        return {
          success: false,
          message: 'Slot token already exists. Please use a unique token.',
          slotId: existingTokens[0].SlotID,
        };
      }

      // 3. Insert new slot
      const [result] = await connection.execute(
        `INSERT INTO opd_doctorslots (
          ConsultantID, 
          ConsultationDate, 
          SlotTime, 
          SlotToken, 
          MaxSlots, 
          AvailableSlots, 
          isBooked
        ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [
          consultantId,
          consultationDate,
          slotTime,
          slotToken,
          maxPatientsPerSlot,
          maxPatientsPerSlot,
        ]
      );

      // 4. Fetch the created slot
      const [slot] = await connection.execute(
        `SELECT * FROM opd_doctorslots WHERE SlotID = ?`,
        [result.insertId]
      );

      await connection.commit();

      return {
        success: true,
        message: 'Slot added successfully',
        slot: slot[0],
      };
    } catch (error) {
      await connection.rollback();
      console.error('Error adding slot:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Add slots for a date range
   * @param {Object} rangeData - The date range data
   * @returns {Promise<Object>} - Result with count of slots created
   */
  static async addSlotsForDateRange(rangeData) {
    try {
      const { consultantId, startDate, endDate, slotTimes } = rangeData;

      if (!slotTimes || !Array.isArray(slotTimes) || slotTimes.length === 0) {
        throw new Error('slotTimes must be an array of time objects');
      }

      // Begin transaction
      return await mysqlPool.transaction(async (connection) => {
        let slotsCreated = 0;
        let duplicateTokens = 0;
        let duplicateSlots = 0;

        // Loop through each date in the range
        const currentDate = new Date(startDate);
        const endDateObj = new Date(endDate);

        while (currentDate <= endDateObj) {
          const formattedDate = currentDate.toISOString().split('T')[0];

          // Create slots for each time in slotTimes
          for (const slotTime of slotTimes) {
            const { time, token, maxPatients } = slotTime;

            // Generate a unique token for each date if needed
            const uniqueToken = `${token}_${formattedDate.replace(/-/g, '')}`;

            // Check if slot already exists
            const [existingSlots] = await connection.execute(
              'SELECT SlotID FROM opd_doctorslots WHERE ConsultantID = ? AND ConsultationDate = ? AND SlotTime = ?',
              [consultantId, formattedDate, time]
            );

            if (existingSlots.length === 0) {
              // Check if token is already used
              const [existingTokens] = await connection.execute(
                'SELECT SlotID FROM opd_doctorslots WHERE SlotToken = ?',
                [uniqueToken]
              );

              if (existingTokens.length === 0) {
                // Insert the slot
                const [result] = await connection.execute(
                  `INSERT INTO opd_doctorslots (
                    ConsultantID, 
                    ConsultationDate, 
                    SlotTime, 
                    SlotToken, 
                    MaxSlots, 
                    AvailableSlots, 
                    isBooked
                  ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
                  [
                    consultantId,
                    formattedDate,
                    time,
                    uniqueToken,
                    maxPatients || 1,
                    maxPatients || 1,
                  ]
                );

                if (result.insertId) {
                  slotsCreated++;
                }
              } else {
                duplicateTokens++;
              }
            } else {
              duplicateSlots++;
            }
          }

          // Move to next day
          currentDate.setDate(currentDate.getDate() + 1);
        }

        return {
          success: true,
          message: `Successfully created ${slotsCreated} slots for date range ${startDate} to ${endDate}`,
          slotsCreated,
          duplicateSlots,
          duplicateTokens,
        };
      });
    } catch (error) {
      console.error('Error adding slots for date range:', error);
      throw error;
    }
  }

  /**
   * Get all slots with optional filters
   * @param {Object} filters - The filter criteria
   * @returns {Promise<Array>} - Array of slots
   */
  static async getAllSlots(filters) {
    try {
      const { startDate, endDate, isBooked, consultantId, departmentId } =
        filters;

      // Using idx_slot_datetime index for date range
      let sql = `
        SELECT 
          s.SlotID,
          s.ConsultantID,
          c.ConsultantName,
          d.Department,
          s.ConsultationDate,
          s.SlotTime,
          s.SlotToken,
          s.MaxSlots,
          s.AvailableSlots,
          s.isBooked,
          cs.Fee,
          a.OPDOnlineAppointmentID,
          a.PatientName
        FROM 
          opd_doctorslots s
        JOIN 
          gen_consultants c ON s.ConsultantID = c.ConsultantID
        JOIN 
          gen_departments d ON c.DepartmentID = d.DepartmentID
        LEFT JOIN 
          gen_consultantshifts cs ON s.ConsultantID = cs.ConsultantID
        LEFT JOIN 
          opd_onlineappointments a ON s.SlotID = a.SlotID
        WHERE 
          s.ConsultationDate BETWEEN ? AND ?
      `;

      const params = [startDate, endDate];

      if (consultantId) {
        // Using idx_consultant_date index
        sql += ' AND s.ConsultantID = ?';
        params.push(consultantId);
      }

      if (departmentId) {
        sql += ' AND d.DepartmentID = ?';
        params.push(departmentId);
      }

      if (isBooked !== undefined) {
        // Using idx_booked_status index
        sql += ' AND s.isBooked = ?';
        params.push(isBooked ? 1 : 0);
      }

      sql += ' ORDER BY s.ConsultationDate, s.SlotTime';

      return await mysqlPool.query(sql, params);
    } catch (error) {
      console.error('Error getting all slots:', error);
      throw error;
    }
  }

  /**
   * Get all slots for a specific doctor
   * @param {number} consultantId - The consultant ID
   * @param {Object} filters - The filter criteria
   * @returns {Promise<Array>} - Array of slots
   */
  static async getAllSlotsForDoctor(consultantId, filters) {
    try {
      const { startDate, endDate, isBooked } = filters;

      // Using idx_consultant_date index
      let sql = `
        SELECT 
          s.SlotID,
          s.ConsultantID,
          c.ConsultantName,
          d.Department,
          s.ConsultationDate,
          s.SlotTime,
          s.SlotToken,
          s.MaxSlots,
          s.AvailableSlots,
          s.isBooked,
          cs.Fee,
          a.OPDOnlineAppointmentID,
          a.MRNo,
          a.PatientName,
          a.MobileNo
        FROM 
          opd_doctorslots s
        JOIN 
          gen_consultants c ON s.ConsultantID = c.ConsultantID
        JOIN 
          gen_departments d ON c.DepartmentID = d.DepartmentID
        LEFT JOIN 
          gen_consultantshifts cs ON s.ConsultantID = cs.ConsultantID
        LEFT JOIN 
          opd_onlineappointments a ON s.SlotID = a.SlotID
        WHERE 
          s.ConsultantID = ?
          AND s.ConsultationDate BETWEEN ? AND ?
      `;

      const params = [consultantId, startDate, endDate];

      if (isBooked !== undefined) {
        // Using idx_booked_status index
        sql += ' AND s.isBooked = ?';
        params.push(isBooked ? 1 : 0);
      }

      sql += ' ORDER BY s.ConsultationDate, s.SlotTime';

      return await mysqlPool.query(sql, params);
    } catch (error) {
      console.error('Error getting slots for doctor:', error);
      throw error;
    }
  }

  /**
   * Get available dates for a doctor in a specific month
   * @param {number} consultantId - The consultant ID
   * @param {number} month - The month (1-12)
   * @param {number} year - The year
   * @returns {Promise<Array>} - Array of available dates
   */
  static async getAvailableDatesForDoctor(consultantId, month, year) {
    try {
      // Calculate start and end dates for the month
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;

      // Using idx_consultant_date and idx_booked_status indexes
      const sql = `
        SELECT DISTINCT 
          s.ConsultationDate
        FROM 
          opd_doctorslots s
        WHERE 
          s.ConsultantID = ?
          AND s.ConsultationDate BETWEEN ? AND ?
          AND s.isBooked = 0
        ORDER BY 
          s.ConsultationDate
      `;

      return await mysqlPool.query(sql, [consultantId, startDate, endDate]);
    } catch (error) {
      console.error('Error getting available dates for doctor:', error);
      throw error;
    }
  }

  /**
   * Update slot booking status
   * @param {number} slotId - The slot ID
   * @param {boolean} isBooked - Whether the slot is booked
   * @returns {Promise<Object>} - Result of the update
   */
  static async updateSlotBookingStatus(slotId, isBooked) {
    try {
      return await mysqlPool.transaction(async (connection) => {
        // Get current slot details
        const [slots] = await connection.execute(
          'SELECT AvailableSlots, MaxSlots FROM opd_doctorslots WHERE SlotID = ?',
          [slotId]
        );

        if (slots.length === 0) {
          throw new Error('Slot not found');
        }

        const slot = slots[0];
        let availableSlots = slot.AvailableSlots;

        if (isBooked) {
          // Booking a slot
          if (availableSlots <= 0) {
            throw new Error('No available slots');
          }
          availableSlots--;
        } else {
          // Unbooking a slot
          if (availableSlots < slot.MaxSlots) {
            availableSlots++;
          }
        }

        // Update the slot
        const [result] = await connection.execute(
          `UPDATE opd_doctorslots 
           SET isBooked = ?, 
               AvailableSlots = ?,
               UpdatedAt = CURRENT_TIMESTAMP
           WHERE SlotID = ?`,
          [availableSlots <= 0 ? 1 : 0, availableSlots, slotId]
        );

        return {
          success: result.affectedRows > 0,
          message:
            result.affectedRows > 0
              ? `Slot ${isBooked ? 'booked' : 'unbooked'} successfully`
              : 'Failed to update slot',
          availableSlots,
        };
      });
    } catch (error) {
      console.error('Error updating slot booking status:', error);
      throw error;
    }
  }

  /**
   * Get slot by ID
   * @param {number} slotId - The slot ID
   * @returns {Promise<Object>} - The slot details
   */
  static async getSlotById(slotId) {
    try {
      const sql = `
        SELECT 
          s.*,
          c.ConsultantName,
          d.Department
        FROM 
          opd_doctorslots s
        JOIN 
          gen_consultants c ON s.ConsultantID = c.ConsultantID
        JOIN 
          gen_departments d ON c.DepartmentID = d.DepartmentID
        WHERE 
          s.SlotID = ?
      `;

      const results = await mysqlPool.query(sql, [slotId]);

      if (results.length === 0) {
        return null;
      }

      return results[0];
    } catch (error) {
      console.error('Error getting slot by ID:', error);
      throw error;
    }
  }

  /**
   * Delete a slot
   * @param {number} slotId - The slot ID
   * @returns {Promise<Object>} - Result of the deletion
   */
  static async deleteSlot(slotId) {
    try {
      return await mysqlPool.transaction(async (connection) => {
        // Check if slot is booked or has an appointment
        const [slots] = await connection.execute(
          'SELECT isBooked, AppointmentID FROM opd_doctorslots WHERE SlotID = ?',
          [slotId]
        );

        if (slots.length === 0) {
          return {
            success: false,
            message: 'Slot not found',
          };
        }

        const slot = slots[0];

        if (slot.isBooked || slot.AppointmentID) {
          return {
            success: false,
            message:
              'Cannot delete a booked slot or a slot with an appointment',
          };
        }

        // Delete the slot
        const [result] = await connection.execute(
          'DELETE FROM opd_doctorslots WHERE SlotID = ?',
          [slotId]
        );

        return {
          success: result.affectedRows > 0,
          message:
            result.affectedRows > 0
              ? 'Slot deleted successfully'
              : 'Failed to delete slot',
        };
      });
    } catch (error) {
      console.error('Error deleting slot:', error);
      throw error;
    }
  }

  /**
   * Generate unique slot token
   * @param {string} prefix - Token prefix (e.g., M for Morning)
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<string>} - Unique slot token
   */
  static async generateUniqueSlotToken(prefix, date) {
    try {
      // Get the highest token number for this prefix and date
      const sql = `
        SELECT SlotToken 
        FROM opd_doctorslots 
        WHERE SlotToken LIKE ? AND ConsultationDate = ?
        ORDER BY SlotToken DESC 
        LIMIT 1
      `;

      const results = await mysqlPool.query(sql, [`${prefix}%`, date]);

      let nextNumber = 1;
      if (results.length > 0) {
        const lastToken = results[0].SlotToken;
        const match = lastToken.match(/\d+$/);
        if (match) {
          nextNumber = Number.parseInt(match[0], 10) + 1;
        }
      }

      // Format: prefix + 3-digit number + date without hyphens
      const dateStr = date.replace(/-/g, '');
      return `${prefix}${nextNumber.toString().padStart(3, '0')}_${dateStr}`;
    } catch (error) {
      console.error('Error generating unique slot token:', error);
      throw error;
    }
  }
}

module.exports = SlotModel;
