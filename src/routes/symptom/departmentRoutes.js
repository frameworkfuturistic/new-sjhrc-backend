const express = require('express');
const router = express.Router();
const {
  index: getDepartments,
  getDoctors,
} = require('../../controllers/symptom/departmentController');
const { validate } = require('../../middleware/validators/departmentValidator');

// Department Management
router.get('/',  getDepartments);
router.get('/:id/doctors', getDoctors);

module.exports = router;
