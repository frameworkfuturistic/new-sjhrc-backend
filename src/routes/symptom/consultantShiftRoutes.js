const express = require('express');
const router = express.Router();
const controller = require('../controllers/consultantShiftController');
const validator = require('../validators/consultantShiftValidator');
const { validate } = require('../middleware/validate');

// Consultant Shift routes
router.post(
  '/',
  validator.createConsultantShiftValidation,
  validate,
  controller.createConsultantShift
);

router.get('/:id', controller.getConsultantShift);
router.put(
  '/:id',
  validator.updateConsultantShiftValidation,
  validate,
  controller.updateConsultantShift
);
router.delete('/:id', controller.deleteConsultantShift);

// Relationship routes
router.get('/consultant/:consultantId', controller.getByConsultant);

module.exports = router;
