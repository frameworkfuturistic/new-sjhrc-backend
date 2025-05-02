const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const dotenv = require('dotenv');
const { AppError } = require('../middleware/error');
dotenv.config();

const hashedAdminPassword = process.env.HASHED_ADMIN_PASSWORD;
const JWT_EXPIRES_IN = '1h';
const COOKIE_MAX_AGE = 3600000; // 1 hour in ms

const generateUsername = () => moment().format('YYYYMMDD');

// Login controller
exports.login = async (req, res, next) => {
  const { password, superPassword, username } = req.body;

  // Input validation
  if (!username || !(password || superPassword)) {
    return next(new AppError('Please provide all required fields', 400));
  }

  if (username !== generateUsername()) {
    return next(new AppError('Invalid credentials', 401));
  }

  try {
    // Super password validation
    if (superPassword) {
      const hashedSuperPassword = process.env.SUPER_PASSWORD_HASH;
      if (!hashedSuperPassword) {
        return next(new AppError('Super password not configured', 500));
      }

      const isSuperPasswordValid = await bcrypt.compare(
        superPassword,
        hashedSuperPassword
      );

      if (isSuperPasswordValid) {
        const token = jwt.sign(
          { username, isSuperUser: true }, // Add role/flag
          process.env.JWT_SECRET,
          { expiresIn: JWT_EXPIRES_IN }
        );

        setSecureCookie(res, token);
        return res.status(200).json({
          message: 'Logged in with super password',
          token,
          isSuperUser: true,
        });
      }
      return next(new AppError('Incorrect super password', 401));
    }

    // Admin password validation
    if (!hashedAdminPassword) {
      return next(new AppError('Admin password not configured', 500));
    }

    const isPasswordValid = await bcrypt.compare(password, hashedAdminPassword);
    if (!isPasswordValid) {
      return next(new AppError('Incorrect Credential', 401));
    }

    const token = jwt.sign(
      { username, isSuperUser: false },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    setSecureCookie(res, token);
    return res.status(200).json({
      message: 'Logged in successfully',
      token,
      isSuperUser: false,
    });
  } catch (error) {
    return next(new AppError('Internal server error', 500));
  }
};

// Logout controller
exports.logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
  });
  return res.status(200).json({ message: 'Logged out successfully' });
};

// Helper function to set secure cookie
function setSecureCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Secure in production
    sameSite: 'Strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/', // Ensure cookie is available on all paths
  });
}
