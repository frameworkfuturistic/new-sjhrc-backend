const jobApplicationService = require('../services/jobApplicationService');
const cloudinary = require('../config/cloudinary');
const { AppError } = require('../middleware/error');
const logger = require('../utils/logger');

// Create a new job application
const createJobApplication = async (req, res, next) => {
  try {
    const resumeFile = req?.files?.resume?.[0];

    if (!resumeFile) {
      throw new AppError('Resume file is required', 400);
    }

    const resume = resumeFile?.path;

    const {
      applicantName,
      email,
      phone,
      coverLetter,
      linkedInProfile,
      portfolio,
      jobId,
    } = req.body;

    const jobApplication = await jobApplicationService.createJobApplication({
      jobId,
      applicantName,
      email,
      phone,
      resume,
      coverLetter,
      linkedInProfile,
      portfolio,
    });

    res.status(201).json({
      success: true,
      message: 'Job application submitted successfully',
      data: jobApplication,
    });
  } catch (error) {
    logger.error(`Create application error: ${error.message}`);
    next(error);
  }
};

// Get all job applications
const getAllJobs = async (req, res, next) => {
  try {
    const jobs = await jobApplicationService.getAllJobs();
    res.status(200).json({
      success: true,
      data: jobs,
    });
  } catch (error) {
    logger.error(`Fetch all jobs error: ${error.message}`);
    next(error);
  }
};

// Get applications by Job ID
const getApplicationsByJobId = async (req, res, next) => {
  try {
    const applications = await jobApplicationService.getApplicationsByJobId(
      req.params.jobId
    );
    res.status(200).json({
      success: true,
      data: applications,
    });
  } catch (error) {
    logger.error(`Fetch applications by job ID error: ${error.message}`);
    next(error);
  }
};

// Update application status
const updateApplicationStatus = async (req, res, next) => {
  try {
    const updatedApplication =
      await jobApplicationService.updateApplicationStatus(
        req.params.id,
        req.body.status
      );
    res.status(200).json({
      success: true,
      message: 'Application status updated',
      data: updatedApplication,
    });
  } catch (error) {
    logger.error(`Update application status error: ${error.message}`);
    next(error);
  }
};

module.exports = {
  createJobApplication,
  getAllJobs,
  getApplicationsByJobId,
  updateApplicationStatus,
};
