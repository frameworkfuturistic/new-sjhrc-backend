const ConsultantShift = require('../models/mysql/ConsultantShift');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Create a new consultant shift
exports.createConsultantShift = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const shift = await ConsultantShift.create(req.body);
    res.status(201).json(shift);
  } catch (error) {
    logger.error('Error creating consultant shift:', error);
    res.status(500).json({ error: 'Failed to create shift' });
  }
};

// Get shift details
exports.getConsultantShift = async (req, res) => {
  try {
    const shift = await ConsultantShift.findByIdWithDetails(req.params.id);
    
    if (!shift) {
      return res.status(404).json({ error: 'Shift not found' });
    }

    res.json(shift);
  } catch (error) {
    logger.error('Error fetching consultant shift:', error);
    res.status(500).json({ error: 'Failed to fetch shift' });
  }
};

// Update a consultant shift
exports.updateConsultantShift = async (req, res) => {
  try {
    const updatedShift = await ConsultantShift.update(
      req.params.id, 
      req.body
    );
    res.json(updatedShift);
  } catch (error) {
    logger.error('Error updating consultant shift:', error);
    res.status(500).json({ error: 'Failed to update shift' });
  }
};

// Delete a consultant shift
exports.deleteConsultantShift = async (req, res) => {
  try {
    await ConsultantShift.delete(req.params.id);
    res.status(204).end();
  } catch (error) {
    logger.error('Error deleting consultant shift:', error);
    res.status(500).json({ error: 'Failed to delete shift' });
  }
};

// Get shifts by consultant
exports.getByConsultant = async (req, res) => {
  try {
    const shifts = await ConsultantShift.findByConsultantId(req.params.consultantId);
    res.json(shifts);
  } catch (error) {
    logger.error('Error fetching shifts by consultant:', error);
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
};