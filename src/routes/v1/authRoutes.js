const express = require('express');
const { login, logout } = require('../../controllers/authController');
const { protect } = require('../../middleware/auth');

const router = express.Router();

// Login Route
router.post('/login', login);

// Logout Route
router.post('/logout', protect, logout);

module.exports = router;
