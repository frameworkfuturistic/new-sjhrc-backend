const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const { CLOUDINARY_FOLDERS, FILE_CONFIG } = require('../config/constants');

// Helper function to generate unique public_id
const generatePublicId = (prefix) => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${randomString}`;
};

// Configuration for different resource types
const storageConfigurations = {
  ANNOUNCEMENT: {
    folder: CLOUDINARY_FOLDERS.ANNOUNCEMENT,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    transformations: [{ width: 1200, crop: 'limit', quality: 'auto' }],
    publicIdPrefix: 'announcement',
  },
  BLOG: {
    folder: CLOUDINARY_FOLDERS.BLOGS,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformations: [{ width: 1600, crop: 'limit', quality: 'auto:best' }],
    publicIdPrefix: 'blog',
  },
  GALLERY: {
    folder: CLOUDINARY_FOLDERS.GALLERY,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'mp4', 'mov'],
    transformations: [{ width: 2000, crop: 'limit', quality: 'auto:best' }],
    publicIdPrefix: 'gallery',
  },
  RESUME: {
    folder: CLOUDINARY_FOLDERS.RESUME,
    allowedFormats: ['pdf', 'doc', 'docx'],
    transformations: null,
    publicIdPrefix: 'resume',
  },
};

// Create storage instances for each resource type
const createStorage = (resourceType) => {
  const config = storageConfigurations[resourceType];
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: (req, file) => {
      const isImage = file.mimetype.startsWith('image/');
      const isVideo = file.mimetype.startsWith('video/');

      return {
        folder: config.folder,
        allowed_formats: config.allowedFormats,
        transformation: isImage ? config.transformations : null,
        resource_type:
          resourceType === 'RESUME'
            ? 'raw'
            : isVideo
              ? 'video'
              : isImage
                ? 'image'
                : 'auto',
        public_id: generatePublicId(config.publicIdPrefix),
        format: file.originalname.split('.').pop(),
      };
    },
  });
};

// File filter factory
const createFileFilter = (resourceType) => (req, file, cb) => {
  const config = FILE_CONFIG[resourceType];
  let fileType;

  if (file.fieldname === 'image') fileType = 'IMAGE';
  else if (file.fieldname === 'video') fileType = 'VIDEO';
  else if (file.fieldname === 'resume') fileType = 'DOCUMENT';
  else if (file.fieldname === 'attachment') fileType = 'ATTACHMENT';
  else return cb(new Error(`Unexpected field: ${file.fieldname}`), false);

  const typeConfig = config[fileType];

  if (!typeConfig.allowedTypes.includes(file.mimetype)) {
    return cb(
      new Error(
        `Invalid file type for ${fileType}. Allowed: ${typeConfig.allowedTypes.join(', ')}`
      ),
      false
    );
  }

  if (file.size > typeConfig.maxSize) {
    return cb(
      new Error(
        `File too large. Max size: ${typeConfig.maxSize / 1024 / 1024}MB`
      ),
      false
    );
  }

  cb(null, true);
};

// Middleware factory
const createUploadMiddleware = (resourceType, fields) => {
  return multer({
    storage: createStorage(resourceType),
    fileFilter: createFileFilter(resourceType),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max per file
      files: fields.reduce((acc, field) => acc + field.maxCount, 0), // Total max files
    },
  }).fields(fields);
};

// Pre-configured upload middlewares
const announcementUpload = createUploadMiddleware('ANNOUNCEMENT', [
  { name: 'image', maxCount: 1 },
  { name: 'attachment', maxCount: 1 },
]);

const blogUpload = createUploadMiddleware('BLOG', [
  { name: 'image', maxCount: 1 },
]);

const galleryUpload = createUploadMiddleware('GALLERY', [
  { name: 'image', maxCount: 10 },
  { name: 'video', maxCount: 3 },
]);

const resumeUpload = createUploadMiddleware('RESUME', [
  { name: 'resume', maxCount: 1 },
]);

module.exports = {
  announcementUpload,
  blogUpload,
  galleryUpload,
  resumeUpload,
};
