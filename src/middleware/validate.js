// middleware/validate.js
const { validationResult } = require('express-validator');
const { AppError } = require('./error');

const validate = (validations) => {
  return async (req, res, next) => {
    // Execute all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    // Log validation errors for debugging
    console.log('Validation errors:', errors.array());

    // Extract error details
    const extractedErrors = errors.array().map(err => ({
      field: err.param,
      message: err.msg
    }));

    return next(new AppError('Validation failed', 400, extractedErrors));
  };
};

module.exports = validate;
