// routes/jobPostingRoutes.js
const express = require('express');
const jobPostingController = require('../../controllers/jobPostingController');
const { protect } = require('../../middleware/auth');

const router = express.Router();

router.post('/', protect, jobPostingController.createJobPosting);
router.get('/', jobPostingController.getAllJobPostings);
router.get('/:id', jobPostingController.getJobPostingById);
router.put('/:id', protect, jobPostingController.updateJobPosting);
router.delete('/:id', protect, jobPostingController.deleteJobPosting);

module.exports = router;
