const express = require('express');
const blogController = require('../../controllers/blogController');
const { blogUpload } = require('../../middleware/upload');
const { protect } = require('../../middleware/auth'); // Import the protect and authorize middleware

const router = express.Router();

// Public routes (No protection needed for GET)
router.get('/test', blogController.test);
router.get('/', blogController.getBlogs);
router.get('/:id', blogController.getBlogById);
router.get('/slug/:slug', blogController.getBlogBySlug);

// Admin-only routes (Protected and Admin authorized)
router.post('/', protect, blogUpload, blogController.createBlog);
router.put('/:id', protect, blogUpload, blogController.updateBlog);
router.delete('/:id', protect, blogController.deleteBlog);

module.exports = router;
