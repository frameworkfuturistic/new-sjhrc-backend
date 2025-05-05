const express = require('express');
const router = express.Router();
const slotController = require('../../controllers/symptom/slotController');
const {
  availableSlotsValidation,
  addSlotsDayValidation,
  addSlotsRangeValidation,
  getAllDoctorSlotsValidation,
} = require('../../middleware/validators/slotValidator');
const { protect } = require('../../middleware/auth');

// Get available slots for a doctor on a specific date
router.get(
  '/:doctorId/:date',
  availableSlotsValidation,
  slotController.availableSlots
);

// Add slots for a specific day
router.post('/', protect, addSlotsDayValidation, slotController.addSlotsDay);
router.put('/release', protect, slotController.releaseSlots);

// Add slots for a date range
router.post(
  '/range',
  protect,
  addSlotsRangeValidation,
  slotController.addSlotsRange
);

// Get all slots (admin)
router.get('/', slotController.getAllSlots);
router.get('/appointments', slotController.getSlotsWithAppointments);

// Get all slots for a specific doctor
router.get(
  '/:doctorId',
  getAllDoctorSlotsValidation,
  slotController.getAllDoctorSlots
);

module.exports = router;
