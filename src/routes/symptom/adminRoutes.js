const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/symptom/adminController');

// Payment dashboard routes
router.get('/payments', adminController.getPaymentDashboard);
router.post('/payments/reconcile', adminController.forceReconciliation);

// Add other admin routes as needed

module.exports = router;
