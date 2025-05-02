const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const { AppError } = require('../middleware/error');
const cache = require('../config/cache');

class AuthService {
  generateToken(userId) {
    return jwt.sign(
      { id: userId },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
  }

  async register(userData) {
    const { email } = userData;
    
    // Check cache first
    const cachedUser = await cache.get(`user:${email}`);
    if (cachedUser) {
      throw new AppError('User already exists', 400);
    }

    // Check database
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // Cache the result for future checks
      await cache.set(`user:${email}`, { exists: true }, 3600);
      throw new AppError('User already exists', 400);
    }

    const user = await User.create(userData);
    const token = this.generateToken(user._id);

    // Cache the new user
    await cache.set(`user:${user._id}`, user.toJSON(), 3600);

    return { token, user };
  }

  async login(email, password) {
    const user = await User.findOne({ email }).select('+password');
    
    if (!user || !(await user.matchPassword(password))) {
      throw new AppError('Invalid credentials', 401);
    }

    const token = this.generateToken(user._id);

    // Cache user data
    await cache.set(`user:${user._id}`, user.toJSON(), 3600);

    return { token, user };
  }

  async getProfile(userId) {
    // Try to get from cache first
    const cachedUser = await cache.get(`user:${userId}`);
    if (cachedUser) {
      return cachedUser;
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Cache the result
    await cache.set(`user:${userId}`, user.toJSON(), 3600);

    return user;
  }

  async updateProfile(userId, updateData) {
    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Update cache
    await cache.set(`user:${userId}`, user.toJSON(), 3600);

    return user;
  }

  async logout(userId) {
    // Remove user from cache
    await cache.del(`user:${userId}`);
    return true;
  }
}

module.exports = new AuthService();