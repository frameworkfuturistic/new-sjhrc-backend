const Patient = require('../../models/symptom/Patient');
const { generateMRNo } = require('../../utils/helpers');
const logger = require('../../utils/logger');
const { validationResult } = require('express-validator');
const moment = require('moment');

/**
 * @desc    Create a new patient
 * @route   POST /api/patients
 * @access  Public
 */
exports.createPatient = async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Patient creation validation failed:', errors.array());
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  try {
    const { PatientName, Sex, DOB, Address1, City, State, Pin, MobileNo } =
      req.body;

    // Generate MRNo
    const MRNo = await generateMRNo(Patient);
    const MRDate = moment().format('YYYY-MM-DD HH:mm:ss');
    const formattedDOB = moment(DOB).format('YYYY-MM-DD');
    // Create patient data object
    const patientData = {
      MRNo,
      MRDate,
      PatientName,
      Sex,
      DOB: formattedDOB,
      Address1,
      City,
      State,
      Pin,
      MobileNo,
    };

    // Create patient
    const patient = await Patient.create(patientData);

    logger.info(`Patient created successfully with MRNo: ${MRNo}`);

    return res.status(201).json({
      success: true,
      message: 'Patient created successfully.',
      data: patient,
    });
  } catch (error) {
    logger.error('Error creating patient:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create patient',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * @desc    Get patient by MRNo or MobileNo
 * @route   GET /api/patients/search
 * @access  Public
 */
exports.getPatient = async (req, res) => {
  try {
    const searchQuery = req.query.mrdOrMobile;

    if (!searchQuery) {
      return res.status(400).json({
        success: false,
        message: 'Search query parameter (mrdOrMobile) is required',
      });
    }

    const patients = await Patient.findByMRNoOrMobile(searchQuery);

    if (!patients || patients.length === 0) {
      logger.info(`Patient not found with query: ${searchQuery}`);
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    return res.status(200).json({
      success: true,
      count: patients.length,
      data: patients,
    });
  } catch (error) {
    logger.error('Error searching for patient:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to search for patient',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
