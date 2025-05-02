const express = require('express');
const galleryController = require('../../controllers/galleryController');
const { galleryUpload } = require('../../middleware/upload');
const { protect } = require('../../middleware/auth'); // Import the protect middleware

const router = express.Router();

// Test route (No protection needed for GET)
router.get('/test', galleryController.test);

// Create a new gallery image (Protected)
router.post('/', protect, galleryUpload, galleryController.createGalleryImage); // Use multer middleware for file uploads

// Get all gallery images (with pagination) - No protection for GET
router.get('/', galleryController.getGalleryImages);

// Get a single gallery image by ID or slug - No protection for GET
router.get('/:identifier', galleryController.getGalleryImageById);

// Update a gallery image by ID (Protected)
router.put(
  '/:id',
  protect,
  galleryUpload,
  galleryController.updateGalleryImage
); // Use multer middleware for file uploads

// Delete a gallery image by ID (Protected)
router.delete('/:id', protect, galleryController.deleteGalleryImage);

module.exports = router;
