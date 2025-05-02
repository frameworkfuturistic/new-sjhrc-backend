const express = require('express');
const router = express.Router();

const authRoutes = require('./v1/authRoutes');
const announcementRoutes = require('./v1/announcementRoutes');
const galleryRoutes = require('./v1/galleryRoutes');
const blogRoutes = require('./v1/blogRoutes');
const consultantScheduleRoutes = require('./v1/consultantScheduleRoutes');
const jobPostingRoutes = require('./v1/jobPostingRoutes');
const jobApplicationRoutes = require('./v1/jobApplicationRoutes');
const contactUsRoutes = require('./v1/contactUsRoutes');

const departmentRoutes = require('./symptom/departmentRoutes');
const consultantRoutes = require('./symptom/consultantRoutes');
const slotRoutes = require('./symptom/slotRoutes');
const patientRoutes = require('./symptom/patientRoutes');
const appointmentRoutes = require('./symptom/appointmentRoutes');
const paymentRoutes = require('./symptom/paymentRoutes');

const statsRoutes = require('./statsRoutes');

router.use('/stats', statsRoutes);

// Grouped routes
router.use('/auth', authRoutes);
router.use('/announcement', announcementRoutes);
router.use('/gallery', galleryRoutes);
router.use('/blogs', blogRoutes);
router.use('/consultant', consultantScheduleRoutes);
router.use('/jobs', jobPostingRoutes);
router.use('/applications', jobApplicationRoutes);
router.use('/contact-us', contactUsRoutes);

// Hims routes
router.use('/departments', departmentRoutes);
router.use('/consultants', consultantRoutes);
router.use('/slots', slotRoutes);
router.use('/patients', patientRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/payments', paymentRoutes);

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date() });
});

module.exports = router;
