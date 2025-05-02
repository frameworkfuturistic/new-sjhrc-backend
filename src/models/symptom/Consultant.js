const { mysqlPool } = require('../../config/database');

class Consultant {
  static async findByDepartment(departmentId) {
    try {
      const [consultants] = await mysqlPool.query(
        `SELECT 
           c.ConsultantID,
           c.ConsultantName,
           c.ProfessionalDegree,
           c.OPDConsultationFee,
           c.Specialization,
           c.ConsultantType,
           d.Department
         FROM gen_consultants c
         LEFT JOIN gen_departments d ON c.DepartmentID = d.DepartmentID
         WHERE c.DepartmentID = ? AND (c.Hidden = 0 OR c.Hidden IS NULL)`,
        [departmentId]
      );

      return consultants;
    } catch (error) {
      console.error(
        'Database query error in Consultant.findByDepartment():',
        error.message
      );
      throw error;
    }
  }

  static async findAll() {
    try {
      const [consultants] = await mysqlPool.query(
        `SELECT 
           c.ConsultantID,
           c.ConsultantName,
           c.ProfessionalDegree,
           c.OPDConsultationFee AS Fee,
           d.Department
         FROM gen_consultants c
         LEFT JOIN gen_departments d ON c.DepartmentID = d.DepartmentID
         WHERE c.Hidden = 0 OR c.Hidden IS NULL`
      );

      return consultants;
    } catch (error) {
      console.error(
        'Database query error in Consultant.findAll():',
        error.message
      );
      throw error;
    }
  }

  static async findById(consultantId) {
    console.log('Consultant ID:', consultantId); // Debugging line
    const [consultants] = await mysqlPool.query(
      `SELECT 
         c.*, 
         d.Department 
       FROM gen_consultants c
       LEFT JOIN gen_departments d ON c.DepartmentID = d.DepartmentID
       WHERE c.ConsultantID = ?`,
      [consultantId]
    );
    return consultants[0];
  }
}

module.exports = Consultant;
