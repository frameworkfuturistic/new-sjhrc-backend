const { body, param } = require('express-validator');

exports.getDepartmentsValidation = [];

exports.getDoctorsValidation = [
  param('id').isInt().withMessage('Department ID must be an integer').toInt(),
];
