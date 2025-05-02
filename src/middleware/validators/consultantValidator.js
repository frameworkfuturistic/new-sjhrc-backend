const { param } = require('express-validator');

exports.getConsultantsByDepartmentValidation = [
  param('departmentId')
    .isInt()
    .withMessage('Department ID must be an integer')
    .toInt(),
];

exports.getConsultantByIdValidation = [
  param('id').isInt().withMessage('Consultant ID must be an integer').toInt(),
];
