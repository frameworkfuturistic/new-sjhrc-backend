const Consultant = require('../../models/symptom/Consultant');
const logger = require('../../utils/logger');
const { validationResult } = require('express-validator');

// Get consultants by department
exports.getByDepartment = async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const departmentId = req.params.departmentId;
    const consultants = await Consultant.findByDepartment(departmentId);

    if (!consultants || consultants.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No consultants found for this department',
      });
    }

    // Transform data
    const consultantData = consultants.map((c) => ({
      ConsultantID: c.ConsultantID,
      ConsultantName: c.ConsultantName,
      ProfessionalDegree: c.ProfessionalDegree,
      Fee: c.OPDConsultationFee
        ? parseFloat(c.OPDConsultationFee).toFixed(2)
        : null,
      Specialization: c.Specialization,
      ConsultantType: c.ConsultantType,
      Department: c.Department,
    }));

    res.status(200).json({
      success: true,
      count: consultantData.length,
      data: consultantData,
    });
  } catch (error) {
    logger.error(
      `Error fetching consultants for department ${req.params.departmentId}:`,
      error
    );
    res.status(500).json({
      success: false,
      message: 'Failed to fetch consultants',
    });
  }
};

// Get all consultants

exports.getAllConsultants = async (req, res) => {
  try {
    const consultants = await Consultant.findAll();

    if (!consultants || consultants.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No consultants found',
      });
    }

    // Transform data
    const consultantData = consultants.map((consultant) => ({
      ConsultantID: consultant.ConsultantID,
      ConsultantName: consultant.ConsultantName,
      ProfessionalDegree: consultant.ProfessionalDegree,
      Fee: consultant.Fee ? parseFloat(consultant.Fee).toFixed(2) : null,
      Department: consultant.Department || null,
    }));

    res.status(200).json({
      success: true,
      count: consultantData.length,
      data: consultantData,
    });
  } catch (error) {
    logger.error('Error fetching all consultants:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch consultants',
    });
  }
};

// Get consultant by ID
exports.getConsultantById = async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const consultantId = req.params.id;
    const consultant = await Consultant.findById(consultantId);

    if (!consultant) {
      return res.status(404).json({
        success: false,
        message: 'Consultant not found',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        ConsultantID: consultant.ConsultantID,
        ConsultantName: consultant.ConsultantName,
        ProfessionalDegree: consultant.ProfessionalDegree,
        Specialization: consultant.Specialization,
        Address: consultant.Address,
        Telephone: consultant.Telephone,
        Fee: consultant.Fee || null,
        Department: consultant.Department || null,
        AvailableDays: {
          Sunday: consultant.Sunday,
          Monday: consultant.Monday,
          Tuesday: consultant.Tuesday,
          Wednesday: consultant.Wednesday,
          Thursday: consultant.Thursday,
          Friday: consultant.Friday,
          Saturday: consultant.Saturday,
        },
      },
    });
  } catch (error) {
    logger.error(`Error fetching consultant with ID ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch consultant',
    });
  }
};
