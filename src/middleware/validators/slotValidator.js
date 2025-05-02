const { body, param, query } = require('express-validator');
const moment = require('moment');

exports.availableSlotsValidation = [
  param('doctorId').isInt().withMessage('Doctor ID must be an integer'),

  param('date').isDate().withMessage('Invalid date format'),
];

exports.addSlotsDayValidation = [
  body('consultant_id')
    .isInt({ min: 1 })
    .withMessage('Consultant ID must be a positive integer')
    .toInt(),

  body('date')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Invalid date format. Must be YYYY-MM-DD')
    .custom((value) => {
      if (!moment(value, 'YYYY-MM-DD', true).isValid()) {
        throw new Error('Invalid date');
      }
      if (moment(value).isBefore(moment().startOf('day'))) {
        throw new Error('Date cannot be in the past');
      }
      return true;
    }),

  body('start_time')
    .matches(/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/) // Optional seconds
    .withMessage('Start time must be in HH:MM or HH:MM:SS format (24-hour)'),

  body('end_time')
    .matches(/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/) // Optional seconds
    .withMessage('End time must be in HH:MM or HH:MM:SS format (24-hour)'),

  body('interval_minutes')
    .optional()
    .isInt({ min: 5, max: 120 })
    .withMessage('Interval must be between 5 and 120 minutes')
    .toInt(),

  body('max_slots')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Max slots must be between 1 and 20')
    .toInt(),
];

exports.addSlotsRangeValidation = [
  body('consultant_id')
    .isInt()
    .withMessage('Consultant ID must be an integer')
    .toInt(),

  body('start_date')
    .isISO8601()
    .withMessage('Invalid start date format (expected YYYY-MM-DD)'),

  body('end_date')
    .isISO8601()
    .withMessage('Invalid end date format (expected YYYY-MM-DD)'),

  body('start_time')
    .matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
    .withMessage('Start time must be in HH:mm:ss format'),

  body('end_time')
    .matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
    .withMessage('End time must be in HH:mm:ss format'),

  body('interval_minutes')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Interval must be a positive integer (in minutes)')
    .toInt(),

  body('max_slots')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Max slots per slot must be a positive integer')
    .toInt(),

  body('days_of_week')
    .optional()
    .isArray({ min: 1 })
    .withMessage(
      'days_of_week must be an array with at least one day (1 = Monday, 7 = Sunday)'
    )
    .custom((days) => days.every((day) => day >= 1 && day <= 7))
    .withMessage('Each day in days_of_week must be between 1 and 7'),
];

exports.getAllDoctorSlotsValidation = [
  param('doctorId').isInt().withMessage('Doctor ID must be an integer'),
];
