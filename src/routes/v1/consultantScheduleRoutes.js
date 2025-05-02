// routes/consultantScheduleRoutes.js
const express = require('express');
const router = express.Router();
const consultantScheduleController = require('../../controllers/consultantScheduleController');
const { protect } = require('../../middleware/auth');

router.post(
  '/',
  protect,
  consultantScheduleController.createConsultantSchedule
);
router.post(
  '/bulk',
  protect,
  consultantScheduleController.createConsultantScheduleBulk
);
router.get('/', consultantScheduleController.getAllConsultantSchedules);
router.get('/:id', consultantScheduleController.getConsultantScheduleById);
router.put(
  '/:id',
  protect,
  consultantScheduleController.updateConsultantSchedule
);
router.delete(
  '/:id',
  protect,
  consultantScheduleController.deleteConsultantSchedule
);

module.exports = router;
