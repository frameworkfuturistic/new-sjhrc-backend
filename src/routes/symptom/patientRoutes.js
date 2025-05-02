const express = require('express');
const router = express.Router();
const patientController = require('../../controllers/symptom/patientController');
const { 
  createPatientValidation, 
  getPatientValidation
} = require('../../middleware/validators/patientValidator');

// Patient Management
router.post(
  '/', 
  createPatientValidation, 
  patientController.createPatient
);

router.get(
  '/search', 
  getPatientValidation, 
  patientController.getPatient
);

module.exports = router;