const galleryService = require('../services/galleryService');
const cloudinary = require('../config/cloudinary');
const { AppError } = require('../middleware/error');
const logger = require('../utils/logger');

// Test endpoint
exports.test = async (req, res) => {
  res.status(200).json({ success: true, message: 'Gallery API is working.' });
};

// Create a new gallery image
exports.createGalleryImage = async (req, res, next) => {
  try {
    const imageFile = req?.files?.image?.[0];

    if (!imageFile) {
      return res.status(400).json({
        success: false,
        message: 'Image file is required.',
      });
    }

    const galleryImage = await galleryService.createGalleryImage({
      title: req.body.title,
      description: req.body.description,
      GalleryImageUrl: imageFile.path, // Cloudinary secure_url
      GalleryImageId: imageFile.filename, // Cloudinary public_id
      createdBy: req.body.createdBy,
    });

    res.status(201).json({
      success: true,
      data: galleryImage,
    });
  } catch (error) {
    logger.error(`Create gallery error: ${error.message}`);
    next(error);
  }
};

// Get all gallery images with pagination
exports.getGalleryImages = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);

    const { total, images } = await galleryService.getGalleryImages(
      parsedPage,
      parsedLimit
    );

    res.status(200).json({
      success: true,
      data: {
        images,
        total,
        page: parsedPage,
        pages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    handleErrorResponse(res, error);
  }
};

// Get a single gallery image by ID or slug
exports.getGalleryImageById = async (req, res) => {
  try {
    const identifier = req.params.identifier;
    const galleryImage = await galleryService.getGalleryImageById(identifier);

    if (!galleryImage) {
      return res.status(404).json({
        success: false,
        message: 'Gallery image not found.',
      });
    }

    res.status(200).json({ success: true, data: galleryImage });
  } catch (error) {
    handleErrorResponse(res, error);
  }
};

// Update a gallery image by ID
exports.updateGalleryImage = async (req, res) => {
  try {
    const updatedData = { ...req.body };
    const { id } = req.params;

    // If a new file is provided, update the image on Cloudinary
    if (req.file) {
      const existingImage = await galleryService.getGalleryImageById(id);
      if (existingImage) {
        await cloudinary.uploader.destroy(existingImage.GalleryImageId); // Delete old image
      }

      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'gallery',
      });

      updatedData.GalleryImageUrl = result.secure_url;
      updatedData.GalleryImageId = result.public_id;
    }

    const updatedGalleryImage = await galleryService.updateGalleryImage(
      id,
      updatedData
    );

    if (!updatedGalleryImage) {
      return res.status(404).json({
        success: false,
        message: 'Gallery image not found.',
      });
    }

    res.status(200).json({ success: true, data: updatedGalleryImage });
  } catch (error) {
    handleErrorResponse(res, error);
  }
};

// Delete a gallery image by ID
exports.deleteGalleryImage = async (req, res) => {
  try {
    const { id } = req.params;

    const galleryImage = await galleryService.getGalleryImageById(id);
    if (!galleryImage) {
      return res.status(404).json({
        success: false,
        message: 'Gallery image not found.',
      });
    }

    // Remove the image from Cloudinary and delete from the database
    await cloudinary.uploader.destroy(galleryImage.GalleryImageId);
    await galleryService.deleteGalleryImage(id);

    res.status(200).json({
      success: true,
      message: 'Gallery image deleted successfully.',
    });
  } catch (error) {
    handleErrorResponse(res, error);
  }
};

// Helper: Handle Error Response
function handleErrorResponse(res, error) {
  console.error(`[Gallery API Error]: ${error.message}`, error); // Log error for debugging
  res.status(500).json({
    success: false,
    message: error.message || 'An internal server error occurred.',
  });
}
