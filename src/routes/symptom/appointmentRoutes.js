const express = require('express');
const router = express.Router();
const appointmentController = require('../../controllers/symptom/appointmentController');
const {
  createAppointmentValidation,
  confirmAppointmentValidation,
  cancelAppointmentValidation,
  searchAppointmentsValidation,
} = require('../../middleware/validators/appointmentValidator');
const { protect } = require('../../middleware/auth');

// Appointment routes
router.post('/', appointmentController.createAppointment);
router.put('/:appointmentId/complete', protect, appointmentController.complete);
router.put('/:appointmentId/schedule', protect, appointmentController.schedule);
router.get('/', protect, appointmentController.getAll);
router.post(
  '/:id/refund',
  protect,
  cancelAppointmentValidation,
  appointmentController.cancelRefundAppointment
);
router.post(
  '/search',
  searchAppointmentsValidation,
  appointmentController.search
);
router.post('/cleanup', appointmentController.cleanupExpired);

module.exports = router;
