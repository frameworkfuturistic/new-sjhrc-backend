// routes/jobApplicationRoutes.js
const express = require('express');
const jobApplicationController = require('../../controllers/jobApplicationController');
const { resumeUpload } = require('../../middleware/upload');
const { protect } = require('../../middleware/auth');

const router = express.Router();

router.post('/', resumeUpload, jobApplicationController.createJobApplication);
router.get('/', protect, jobApplicationController.getAllJobs);
router.get('/:jobId', jobApplicationController.getApplicationsByJobId);
router.put(
  '/:id/status',
  protect,
  jobApplicationController.updateApplicationStatus
);

module.exports = router;
