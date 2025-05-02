module.exports = {
  CLOUDINARY_FOLDERS: {
    ANNOUNCEMENT: 'announcements',
    BLOGS: 'blogs',
    GALLERY: 'gallery',
    RESUME: 'resumes',
  },

  FILE_CONFIG: {
    // Configuration per resource type
    ANNOUNCEMENT: {
      IMAGE: {
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxSize: 2 * 1024 * 1024, // 2MB
        transformations: { width: 1200, crop: 'limit', quality: 'auto' },
      },
      ATTACHMENT: {
        allowedTypes: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'image/jpeg',
          'image/png',
          'text/plain',
        ],
        maxSize: 5 * 1024 * 1024, // 5MB
      },
      maxFiles: {
        images: 1,
        attachments: 5,
      },
    },
    BLOG: {
      IMAGE: {
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        maxSize: 3 * 1024 * 1024, // 3MB
        transformations: { width: 1600, crop: 'limit', quality: 'auto:best' },
      },
    },
    GALLERY: {
      IMAGE: {
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
        maxSize: 10 * 1024 * 1024, // 10MB
        transformations: { width: 2000, crop: 'limit', quality: 'auto:best' },
      },
      VIDEO: {
        allowedTypes: ['video/mp4', 'video/quicktime'],
        maxSize: 50 * 1024 * 1024, // 50MB
      },
      maxFiles: 10,
    },
    RESUME: {
      DOCUMENT: {
        allowedTypes: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        maxSize: 1 * 1024 * 1024, // 3MB
      },
      maxFiles: 1,
    },
  },

  RATE_LIMITS: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: {
      UPLOAD: 20,
      DEFAULT: 100,
    },
  },
};
