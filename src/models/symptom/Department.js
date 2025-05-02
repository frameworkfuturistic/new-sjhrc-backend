const { mysqlPool } = require('../../config/database');

class Department {
  static async findAll() {
    const [departments] = await mysqlPool.query(
      'SELECT * FROM gen_departments'
    );
    return departments;
  }

  static async findById(departmentId) {
    const [departments] = await mysqlPool.query(
      'SELECT * FROM gen_departments WHERE DepartmentID = ?',
      [departmentId]
    );
    return departments[0];
  }
}

module.exports = Department;
