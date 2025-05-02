const Department = require('../../models/symptom/Department');
const logger = require('../../utils/logger');

/**
 * @desc    Get all departments
 * @route   GET /api/hims/departments
 * @access  Public
 */
exports.index = async (req, res) => {
  try {
    const departments = await Department.findAll();
    
    res.status(200).json({
      success: true,
      count: departments.length,
      data: departments
    });
  } catch (error) {
    logger.error('Error fetching departments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch departments',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get doctors by department
 * @route   GET /api/hims/departments/:id/doctors
 * @access  Public
 */
exports.getDoctors = async (req, res) => {
  try {
    const departmentId = req.params.id;
    const doctors = await Department.findDoctorsByDepartment(departmentId);
    
    if (!doctors || doctors.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No doctors found for this department'
      });
    }

    res.status(200).json({
      success: true,
      count: doctors.length,
      data: doctors
    });
  } catch (error) {
    logger.error(`Error fetching doctors for department ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctors',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};