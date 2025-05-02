const { body, query } = require('express-validator');

exports.createPatientValidation = [
  body('PatientName')
    .notEmpty().withMessage('Patient name is required')
    .isString().withMessage('Patient name must be a string')
    .isLength({ max: 50 }).withMessage('Patient name cannot exceed 50 characters'),
  
  body('Sex')
    .notEmpty().withMessage('Sex is required')
    .isString().withMessage('Sex must be a string')
    .isLength({ max: 6 }).withMessage('Sex cannot exceed 6 characters'),
  
  body('DOB')
    .notEmpty().withMessage('Date of birth is required')
    .isDate().withMessage('Invalid date format'),
  
  body('Address1')
    .optional()
    .isString().withMessage('Address must be a string')
    .isLength({ max: 250 }).withMessage('Address cannot exceed 250 characters'),
  
  body('City')
    .optional()
    .isString().withMessage('City must be a string')
    .isLength({ max: 50 }).withMessage('City cannot exceed 50 characters'),
  
  body('State')
    .optional()
    .isString().withMessage('State must be a string')
    .isLength({ max: 50 }).withMessage('State cannot exceed 50 characters'),
  
  body('Pin')
    .optional()
    .isString().withMessage('Pin must be a string')
    .isLength({ max: 6 }).withMessage('Pin cannot exceed 6 characters'),
  
  body('MobileNo')
    .notEmpty().withMessage('Mobile number is required')
    .isString().withMessage('Mobile number must be a string')
    .isLength({ max: 20 }).withMessage('Mobile number cannot exceed 20 characters')
];

exports.getPatientValidation = [
  query('mrdOrMobile')
    .notEmpty().withMessage('Search query (mrdOrMobile) is required')
    .isString().withMessage('Search query must be a string')
];