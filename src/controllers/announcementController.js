const announcementService = require('../services/announcementService');
const cloudinary = require('../config/cloudinary');
const { AppError } = require('../middleware/error');
const logger = require('../utils/logger');
const slugify = require('slugify');

// Test endpoint
exports.test = async (req, res) => {
  res.status(200).json('Announcement API is working.');
};

// Create a new announcement
exports.createAnnouncement = async (req, res, next) => {
  try {
    const imageFile = req?.files?.image?.[0];

    if (!imageFile) {
      throw new AppError('Thumbnail image is required', 400);
    }

    const announcementData = {
      ...req.body,
      slug: slugify(req.body.title, { lower: true }),
      thumbnailImage: imageFile.path,
      thumbnailImageId: imageFile.filename,
    };

    const announcement = await announcementService.create(announcementData);

    res.status(201).json({
      success: true,
      data: announcement,
    });
  } catch (error) {
    logger.error(`Create announcement error: ${error.message}`);
    next(error);
  }
};

// Get paginated list of announcements
exports.getAnnouncements = async (req, res) => {
  try {
    const { page = 1, limit = 10, type } = req.query;
    const query = type ? { type } : {};
    const { total, announcements } = await announcementService.getAnnouncements(
      query,
      parseInt(page),
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      data: {
        announcements,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get a single announcement by ID or slug
exports.getAnnouncementById = async (req, res) => {
  try {
    const identifier = req.params.identifier;
    const announcement =
      await announcementService.getAnnouncementById(identifier);
    if (!announcement)
      return res
        .status(404)
        .json({ success: false, message: 'Announcement not found' });
    res.status(200).json({ success: true, data: announcement });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update an announcement by ID
exports.updateAnnouncement = async (req, res) => {
  try {
    const updateData = { ...req.body };

    if (req.file) {
      // Fetch the existing announcement
      const existingAnnouncement =
        await announcementService.getAnnouncementById(req.params.id);
      if (!existingAnnouncement) {
        return res
          .status(404)
          .json({ success: false, message: 'Announcement not found.' });
      }

      // Delete the old image from Cloudinary
      if (existingAnnouncement.thumbnailImageId) {
        await cloudinary.uploader.destroy(
          existingAnnouncement.thumbnailImageId
        );
      }

      // Upload the new image to Cloudinary
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'announcements',
      });

      updateData.thumbnailImage = result.secure_url;
      updateData.thumbnailImageId = result.public_id;
    }

    const updatedAnnouncement = await announcementService.updateAnnouncement(
      req.params.id,
      updateData
    );

    if (!updatedAnnouncement) {
      return res
        .status(404)
        .json({ success: false, message: 'Announcement not found.' });
    }

    res.status(200).json({ success: true, data: updatedAnnouncement });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete an announcement by ID
exports.deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await announcementService.deleteAnnouncement(
      req.params.id
    );
    if (!announcement)
      return res
        .status(404)
        .json({ success: false, message: 'Announcement not found' });
    res
      .status(200)
      .json({ success: true, message: 'Announcement deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
