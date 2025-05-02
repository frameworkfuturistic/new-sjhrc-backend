const express = require('express');
const announcementController = require('../../controllers/announcementController');
const { announcementUpload } = require('../../middleware/upload');
const { protect } = require('../../middleware/auth'); // Import the protect middleware

const router = express.Router();

// Test route (No protection needed for GET)
router.get('/test', announcementController.test);

// Create a new announcement (Protected)
router.post(
  '/',
  protect,
  announcementUpload,
  announcementController.createAnnouncement
);

// Get all announcements (with pagination and optional type filtering) - No protection for GET
router.get('/', announcementController.getAnnouncements);

// Get a single announcement by ID or slug - No protection for GET
router.get('/:identifier', announcementController.getAnnouncementById);

// Update an announcement by ID (Protected)
router.put(
  '/:id',
  protect,
  announcementUpload,
  announcementController.updateAnnouncement
);

// Delete an announcement by ID (Protected)
router.delete('/:id', protect, announcementController.deleteAnnouncement);

module.exports = router;
