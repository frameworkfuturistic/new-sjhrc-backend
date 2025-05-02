const { body, param, query } = require('express-validator');
const moment = require('moment');

exports.createAppointmentValidation = [
  body('slotId').isInt({ min: 1 }).withMessage('Invalid slot ID').toInt(),

  body('consultantId')
    .isInt({ min: 1 })
    .withMessage('Invalid consultant ID')
    .toInt(),

  body('mrNo')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('MRNo is required')
    .isLength({ max: 10 })
    .withMessage('MRNo cannot exceed 10 characters'),

  body('patientName')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Patient name is required')
    .isLength({ max: 50 })
    .withMessage('Patient name cannot exceed 50 characters'),

  body('mobileNo')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Mobile number is required')
    .matches(/^[0-9]{10}$/)
    .withMessage('Invalid mobile number format'),
];

exports.confirmAppointmentValidation = [
  body('appointmentId')
    .isInt({ min: 1 })
    .withMessage('Invalid appointment ID')
    .toInt(),

  body('paymentId')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Payment ID is required'),

  body('signature')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Signature is required'),
];

exports.cancelAppointmentValidation = [
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment ID').toInt(),

  body('remarks')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Remarks cannot exceed 255 characters'),
];

exports.searchAppointmentsValidation = [
  body('AppointmentID')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Invalid appointment ID')
    .toInt(),

  body('MRNo')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 10 })
    .withMessage('MRNo cannot exceed 10 characters'),

  body('MobileNo')
    .optional()
    .isString()
    .trim()
    .matches(/^[0-9]{10}$/)
    .withMessage('Invalid mobile number format'),

  body('ConsultantID')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Invalid consultant ID')
    .toInt(),

  body('Status')
    .optional()
    .isIn(['Pending', 'Confirmed', 'Completed', 'Cancelled', 'No Show'])
    .withMessage('Invalid status'),

  body('PaymentStatus')
    .optional()
    .isIn(['Pending', 'Paid', 'Failed', 'Refunded'])
    .withMessage('Invalid payment status'),

  body('startDate')
    .optional()
    .isDate()
    .withMessage('Invalid start date format'),

  body('endDate')
    .optional()
    .isDate()
    .withMessage('Invalid end date format')
    .custom((value, { req }) => {
      if (
        req.body.startDate &&
        moment(value).isBefore(moment(req.body.startDate))
      ) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
];
