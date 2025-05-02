const express = require('express');
const router = express.Router();
const {
  getByDepartment,
  getAllConsultants,
  getConsultantById,
} = require('../../controllers/symptom/consultantController');
// const {
//   getConsultantsByDepartmentValidation,
//   getConsultantByIdValidation,
// } = require('../../middleware/validators/consultantValidator');
// const { validate } = require('../../middleware/validate');

// Consultant/Doctor routes
router.get('/', getAllConsultants);

router.get('/doctors/:departmentId', getByDepartment);

router.get('/:id', getConsultantById);

module.exports = router;
