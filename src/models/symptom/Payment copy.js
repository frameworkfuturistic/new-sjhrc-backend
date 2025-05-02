const { mysqlPool } = require('../../config/database');
const logger = require('../../utils/logger');

class Payment {
  static tableName = 'opd_appointment_payments';

  /**
   * Create payment with enhanced validation
   */
  static async create(paymentData, connection = mysqlPool) {
    try {
      // Validate amount
      if (paymentData.AmountPaid <= 0) {
        throw new Error('Invalid payment amount');
      }

      const [result] = await connection.query(
        `INSERT INTO ${this.tableName} SET ?`,
        [paymentData]
      );
      
      return this.findById(result.insertId, connection);
    } catch (error) {
      logger.error('Payment creation failed', {
        error: error.message,
        paymentData
      });
      throw error;
    }
  }

  /**
   * Find by appointment ID
   */
  static async findByAppointmentId(appointmentId, connection = mysqlPool) {
    try {
      const [payments] = await connection.query(
        `SELECT * FROM ${this.tableName} 
         WHERE OPDOnlineAppointmentID = ? 
         ORDER BY PaymentDate DESC LIMIT 1`,
        [appointmentId]
      );
      return payments[0] || null;
    } catch (error) {
      logger.error('Error finding payment by appointment', {
        appointmentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Enhanced update with change tracking
   */
  static async update(paymentId, updateData, connection = mysqlPool) {
    try {
      const current = await this.findById(paymentId, connection);
      if (!current) {
        throw new Error('Payment not found');
      }

      const [result] = await connection.query(
        `UPDATE ${this.tableName} SET ? 
         WHERE PaymentID = ?`,
        [{
          ...updateData,
          UpdatedAt: new Date() // Track update time
        }, paymentId]
      );

      if (result.affectedRows === 0) {
        throw new Error('Payment update failed');
      }

      return this.findById(paymentId, connection);
    } catch (error) {
      logger.error('Payment update failed', {
        paymentId,
        error: error.message,
        updateData
      });
      throw error;
    }
  }


  /**
   * Get payment history
   */
  static async getHistory(criteria = {}) {
    try {
      let query = `SELECT * FROM ${this.tableName}`;
      const conditions = [];
      const values = [];

      if (criteria.OPDOnlineAppointmentID) {
        conditions.push('OPDOnlineAppointmentID = ?');
        values.push(criteria.OPDOnlineAppointmentID);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY PaymentDate DESC';

      const [payments] = await mysqlPool.query(query, values);
      return payments;
    } catch (error) {
      logger.error('Error fetching payment history:', error);
      throw error;
    }
  }
}

module.exports = Payment;
