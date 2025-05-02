const { mysqlPool } = require('../../config/database');
const logger = require('../../utils/logger');

class Payment {
  static tableName = 'opd_appointment_payments';

  /**
   * Create a new payment record
   */
  static async create(paymentData, connection = mysqlPool) {
    try {
      const [result] = await connection.query(
        `INSERT INTO ${this.tableName} SET ?`,
        [paymentData]
      );
      return this.findById(result.insertId, connection);
    } catch (error) {
      logger.error('Error creating payment:', error);
      throw error;
    }
  }

  /**
   * Find payment by ID
   */
  static async findById(paymentId, connection = mysqlPool) {
    try {
      const [payments] = await connection.query(
        `SELECT * FROM ${this.tableName} WHERE PaymentID = ? LIMIT 1`,
        [paymentId]
      );
      return payments[0] || null;
    } catch (error) {
      logger.error(`Error finding payment ${paymentId}:`, error);
      throw error;
    }
  }

  /**
   * Update payment record
   */
  static async update(paymentId, updateData, connection = mysqlPool) {
    try {
      const [result] = await connection.query(
        `UPDATE ${this.tableName} SET ? WHERE PaymentID = ?`,
        [updateData, paymentId]
      );
      if (result.affectedRows === 0) return null;
      return this.findById(paymentId, connection);
    } catch (error) {
      logger.error(`Error updating payment ${paymentId}:`, error);
      throw error;
    }
  }

  /**
   * Find payment by transaction ID
   */
  static async findByTransactionId(transactionId, connection = mysqlPool) {
    try {
      const [payments] = await connection.query(
        `SELECT * FROM ${this.tableName} WHERE TransactionID = ? LIMIT 1`,
        [transactionId]
      );
      return payments[0] || null;
    } catch (error) {
      logger.error(
        `Error finding payment by transaction ID ${transactionId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get payment history with optional filters
   */
  static async getHistory(filters = {}, connection = mysqlPool) {
    try {
      let query = `SELECT * FROM ${this.tableName}`;
      const conditions = [];
      const values = [];

      // Supported filters
      if (filters.OPDOnlineAppointmentID) {
        conditions.push('OPDOnlineAppointmentID = ?');
        values.push(filters.OPDOnlineAppointmentID);
      }
      if (filters.PaymentStatus) {
        conditions.push('PaymentStatus = ?');
        values.push(filters.PaymentStatus);
      }
      if (filters.fromDate) {
        conditions.push('PaymentDate >= ?');
        values.push(new Date(filters.fromDate));
      }
      if (filters.toDate) {
        conditions.push('PaymentDate <= ?');
        values.push(new Date(filters.toDate));
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY PaymentDate DESC';

      if (filters.limit) {
        query += ' LIMIT ?';
        values.push(parseInt(filters.limit));
      }

      const [payments] = await connection.query(query, values);
      return payments;
    } catch (error) {
      logger.error('Error fetching payment history:', error);
      throw error;
    }
  }
}

module.exports = Payment;
