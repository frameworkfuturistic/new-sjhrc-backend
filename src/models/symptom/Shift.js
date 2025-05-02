const { mysqlPool } = require('../../config/database');

class Shift {
  static tableName = 'gen_shifts';

  /**
   * Find shift by ID
   * @param {number} shiftId
   * @returns {Promise<Object|null>} Shift object or null
   */
  static async findById(shiftId) {
    try {
      const [shifts] = await mysqlPool.query(
        `SELECT * FROM ${this.tableName} WHERE ShiftID = ? LIMIT 1`,
        [shiftId]
      );
      return shifts[0] || null;
    } catch (error) {
      throw error;
    }
  }

  static async findOne() {
    try {
      const [shifts] = await mysqlPool.query(
        `SELECT * FROM ${this.tableName} LIMIT 1`
      );
      return shifts[0] || null;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Shift;
