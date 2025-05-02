const blogService = require('../services/blogService');
const cloudinary = require('../config/cloudinary');
const { AppError } = require('../middleware/error');
const logger = require('../utils/logger');

// Test endpoint
exports.test = async (req, res) => {
  res.status(200).json({ success: true, message: "I'm here for testing" });
};

// Create a new blog post
exports.createBlog = async (req, res) => {
  try {
    const imageFile = req?.files?.image?.[0];

    if (!imageFile) {
      return res.status(400).json({
        success: false,
        message: 'Image file is required.',
      });
    }

    const blogData = {
      title: req.body.title,
      content: req.body.content,
      author: req.body.author,
      category: req.body.category,
      status: req.body.status || 'draft',
      tags: req.body.tags ? JSON.parse(req.body.tags) : [],
      blogImageUrl: imageFile.path,
      blogImageId: imageFile.filename,
      publishDate: req.body.publishDate || new Date(),
    };

    const blog = await blogService.createBlog(blogData);
    res.status(201).json({ success: true, data: blog });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get paginated list of blogs with optional category filter
exports.getBlogs = async (req, res) => {
  try {
    const { page = 1, limit = 8, category, status } = req.query;
    const query = {};
    if (category) query.category = category;
    if (status) query.status = status;

    const { total, blogs } = await blogService.getBlogs(
      query,
      parseInt(page, 10),
      parseInt(limit, 10)
    );

    // Add full URLs to images
    const blogsWithFullUrls = blogs.map((blog) => ({
      ...blog,
    }));

    res.status(200).json({
      success: true,
      data: {
        blogs,
        total,
        page: parseInt(page, 10),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get a single blog post by its ID
exports.getBlogById = async (req, res) => {
  try {
    const blog = await blogService.getBlogById(req.params.id);
    if (!blog) {
      return res
        .status(404)
        .json({ success: false, message: 'Blog not found' });
    }
    res.status(200).json({ success: true, data: blog });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get a single blog post by its slug
exports.getBlogBySlug = async (req, res) => {
  try {
    const blog = await blogService.getBlogBySlug(req.params.slug);
    if (!blog) {
      return res
        .status(404)
        .json({ success: false, message: 'Blog not found' });
    }
    res.status(200).json({ success: true, data: blog });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update a blog post by ID
exports.updateBlog = async (req, res) => {
  try {
    const blogData = {
      title: req.body.title,
      content: req.body.content,
      author: req.body.author,
      category: req.body.category,
      status: req.body.status,
      tags: Array.isArray(req.body.tags)
        ? req.body.tags
        : JSON.parse(req.body.tags),

      publishDate: req.body.publishDate,
    };

    if (req.file) {
      blogData.image = getFullUrl(req, req.file.path);
    }

    const blog = await blogService.updateBlog(req.params.id, blogData);
    if (!blog) {
      return res
        .status(404)
        .json({ success: false, message: 'Blog not found' });
    }
    res.status(200).json({ success: true, data: blog });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a blog post by ID
exports.deleteBlog = async (req, res) => {
  try {
    const blog = await blogService.deleteBlog(req.params.id);
    if (!blog) {
      return res
        .status(404)
        .json({ success: false, message: 'Blog not found' });
    }
    res
      .status(200)
      .json({ success: true, message: 'Blog deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
