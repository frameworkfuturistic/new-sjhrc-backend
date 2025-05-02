const { mysqlPool } = require('../../config/database');
const logger = require('../../utils/logger');

class Appointment {
  static tableName = 'opd_onlineappointments';

  /**
   * Create a new appointment (with transaction support)
   */
  static async create(appointmentData, connection = mysqlPool) {
    try {
      const [result] = await connection.query(
        `INSERT INTO ${this.tableName} SET ?`,
        [appointmentData]
      );
      const [rows] = await connection.query(
        `SELECT * FROM ${this.tableName} WHERE OPDOnlineAppointmentID = ? LIMIT 1`,
        [result.insertId]
      );
      return rows[0];
    } catch (error) {
      logger.error('Error creating appointment:', error);
      throw error;
    }
  }

  /**
   * Find appointment by ID (with connection parameter)
   */
  static async findById(appointmentId, connection = mysqlPool) {
    try {
      const [appointments] = await connection.query(
        `SELECT * FROM ${this.tableName} WHERE OPDOnlineAppointmentID = ? LIMIT 1`,
        [appointmentId]
      );
      return appointments[0] || null;
    } catch (error) {
      logger.error(`Error finding appointment ${appointmentId}:`, error);
      throw error;
    }
  }

  /**
   * Update an appointment (with transaction support)
   */
  static async update(appointmentId, updateData, connection = mysqlPool) {
    try {
      const [result] = await connection.query(
        `UPDATE ${this.tableName} SET ? WHERE OPDOnlineAppointmentID = ?`,
        [updateData, appointmentId]
      );
      if (result.affectedRows === 0) return null;
      return this.findById(appointmentId, connection);
    } catch (error) {
      logger.error(`Error updating appointment ${appointmentId}:`, error);
      throw error;
    }
  }

  /**
   * Search appointments (enhanced query building)
   */
  static async search(criteria, connection = mysqlPool) {
    try {
      const where = [];
      const params = [];

      if (criteria.MobileNo) {
        where.push('MobileNo = ?');
        params.push(criteria.MobileNo);
      }
      if (criteria.OPDOnlineAppointmentID) {
        where.push('OPDOnlineAppointmentID = ?');
        params.push(criteria.OPDOnlineAppointmentID);
      }
      if (criteria.MRNo) {
        where.push('MRNo = ?');
        params.push(criteria.MRNo);
      }

      const query = `SELECT * FROM ${this.tableName} ${
        where.length ? 'WHERE ' + where.join(' AND ') : ''
      }`;

      const [appointments] = await connection.query(query, params);
      return appointments;
    } catch (error) {
      logger.error('Error searching appointments:', error);
      throw error;
    }
  }

  /**
   * Get all appointments
   */
  static async findAll(connection = mysqlPool) {
    try {
      const [appointments] = await connection.query(
        `SELECT * FROM ${this.tableName}`
      );
      return appointments;
    } catch (error) {
      logger.error('Error fetching all appointments:', error);
      throw error;
    }
  }

  /**
   * Check for existing appointment (enhanced with connection parameter)
   */
  static async hasExistingAppointment(
    MRNo,
    consultationDate,
    slotId,
    connection = mysqlPool
  ) {
    try {
      const [appointments] = await connection.query(
        `SELECT 1 FROM ${this.tableName} 
         WHERE MRNo = ? AND ConsultationDate = ? AND SlotID = ? AND Pending = 0 
         LIMIT 1`,
        [MRNo, consultationDate, slotId]
      );
      return appointments.length > 0;
    } catch (error) {
      logger.error('Error checking existing appointment:', error);
      throw error;
    }
  }
}

module.exports = Appointment;
