const { mysqlPool } = require('../../config/database');

class ConsultantShift {
  // Create a new consultant shift
  static async create(shiftData) {
    const [result] = await mysqlPool.query(
      'INSERT INTO gen_consultantshifts SET ?',
      [shiftData]
    );
    return { ConsultantShiftID: result.insertId, ...shiftData };
  }

  // Find shift by ID
  static async findById(shiftId) {
    const [shifts] = await mysqlPool.query(
      'SELECT * FROM gen_consultantshifts WHERE ConsultantShiftID = ?',
      [shiftId]
    );
    return shifts[0];
  }

  // Find shifts by consultant ID
  static async findByConsultantId(consultantId) {
    const [shifts] = await mysqlPool.query(
      'SELECT * FROM gen_consultantshifts WHERE ConsultantID = ?',
      [consultantId]
    );
    return shifts;
  }

  // Update a consultant shift
  static async update(shiftId, updateData) {
    await mysqlPool.query(
      'UPDATE gen_consultantshifts SET ? WHERE ConsultantShiftID = ?',
      [updateData, shiftId]
    );
    return this.findById(shiftId);
  }

  // Delete a consultant shift
  static async delete(shiftId) {
    await mysqlPool.query(
      'DELETE FROM gen_consultantshifts WHERE ConsultantShiftID = ?',
      [shiftId]
    );
  }

  // Get shift with all relationships
  static async findByIdWithDetails(shiftId) {
    const [shifts] = await mysqlPool.query(
      `SELECT cs.*, 
              c.ConsultantName,
              s.ShiftName, s.StartTime, s.EndTime
       FROM gen_consultantshifts cs
       LEFT JOIN gen_consultants c ON cs.ConsultantID = c.ConsultantID
       LEFT JOIN gen_shifts s ON cs.ShiftID = s.ShiftID
       WHERE cs.ConsultantShiftID = ?`,
      [shiftId]
    );
    return shifts[0];
  }
}

module.exports = ConsultantShift;
