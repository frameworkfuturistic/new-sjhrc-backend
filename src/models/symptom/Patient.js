const { mysqlPool } = require('../../config/database');
const logger = require('../../utils/logger');
const { generateMRNo } = require('../../utils/helpers');

class Patient {
  static tableName = 'mr_master';

  /**
   * Create a new patient
   * @param {Object} patientData
   * @returns {Promise<Object>} Created patient
   */
  static async create(patientData) {
    try {
      const [result] = await mysqlPool.query(
        `INSERT INTO ${this.tableName} SET ?`,
        patientData
      );
      return this.findByMRNo(patientData.MRNo);
    } catch (error) {
      logger.error('Error creating patient:', error);
      throw error;
    }
  }

  /**
   * Find patient by MRNo
   * @param {string} MRNo
   * @returns {Promise<Object|null>} Patient object or null
   */
  static async findByMRNo(MRNo) {
    try {
      const [patients] = await mysqlPool.query(
        `SELECT * FROM ${this.tableName} WHERE MRNo = ? LIMIT 1`,
        [MRNo]
      );
      return patients[0] || null;
    } catch (error) {
      logger.error(`Error finding patient by MRNo ${MRNo}:`, error);
      throw error;
    }
  }

  /**
   * Find patients by MRNo or MobileNo
   * @param {string} searchQuery
   * @returns {Promise<Array>} Array of patients
   */
  static async findByMRNoOrMobile(searchQuery) {
    try {
      const [patients] = await mysqlPool.query(
        `SELECT * FROM ${this.tableName} 
        WHERE MRNo = ? OR MobileNo = ?`,
        [searchQuery, searchQuery]
      );
      return patients;
    } catch (error) {
      logger.error(
        `Error finding patient by MRNo/Mobile ${searchQuery}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Check if MRNo exists
   * @param {string} MRNo
   * @returns {Promise<boolean>}
   */
  static async MRNoExists(MRNo) {
    try {
      const [results] = await mysqlPool.query(
        `SELECT 1 FROM ${this.tableName} WHERE MRNo = ? LIMIT 1`,
        [MRNo]
      );
      return results.length > 0;
    } catch (error) {
      logger.error(`Error checking MRNo existence ${MRNo}:`, error);
      throw error;
    }
  }
}

module.exports = Patient;
