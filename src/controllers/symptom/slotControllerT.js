const TimeSlot = require('../../models/symptom/TimeSlot');
const logger = require('../../utils/logger');
const moment = require('moment-timezone');
const { validationResult } = require('express-validator');
const { nanoid } = require('nanoid');

// Configure the timezone you want to work with
const APP_TIMEZONE = 'Asia/Kolkata';

/**
 * @desc    Get available slots for a doctor on a specific date
 * @route   GET /api/slots/:doctorId/:date
 * @access  Public
 */
exports.availableSlots = async (req, res) => {
  try {
    const { doctorId, date } = req.params;

    // Validate date format
    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD.',
      });
    }

    // Convert input date to start and end of day in UTC
    const startDate = moment.tz(date, APP_TIMEZONE).startOf('day').utc();
    const endDate = moment.tz(date, APP_TIMEZONE).endOf('day').utc();

    const slots = await TimeSlot.findAvailableSlots(
      doctorId,
      startDate.toDate(),
      endDate.toDate()
    );

    if (!slots || slots.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No available slots for the given date.',
      });
    }

    // Format response with local date strings
    res.status(200).json({
      success: true,
      data: slots.map((slot) => ({
        SlotID: slot.SlotID,
        ConsultantID: slot.ConsultantID,
        SlotDate: moment
          .utc(slot.SlotDate)
          .tz(APP_TIMEZONE)
          .format('YYYY-MM-DD'),
        SlotTime: slot.SlotTime,
        SlotEndTime: slot.SlotEndTime,
        AvailableSlots: slot.AvailableSlots,
        MaxSlots: slot.MaxSlots,
        Status: slot.Status,
        SlotToken: slot.SlotToken,
        IsBooked: slot.IsBooked,
      })),
    });
  } catch (error) {
    logger.error('Error fetching available slots:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available slots',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * @desc    Add slots for a doctor on a specific day
 * @route   POST /api/slots/day
 * @access  Private/Admin
 */
exports.addSlotsDay = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  try {
    const {
      consultant_id,
      date,
      start_time,
      end_time,
      interval_minutes = 15,
      max_slots = 1,
    } = req.body;

    // Validate time format
    const timeFormat = 'HH:mm:ss';
    const startMoment = moment.tz(
      `${date} ${start_time}`,
      'YYYY-MM-DD HH:mm:ss',
      APP_TIMEZONE
    );
    const endMoment = moment.tz(
      `${date} ${end_time}`,
      'YYYY-MM-DD HH:mm:ss',
      APP_TIMEZONE
    );

    if (!startMoment.isValid() || !endMoment.isValid()) {
      return res.status(400).json({
        success: false,
        message: `Invalid time format. Use ${timeFormat}.`,
      });
    }

    if (startMoment.isSameOrAfter(endMoment)) {
      return res.status(400).json({
        success: false,
        message: 'Start time must be before end time.',
      });
    }

    const slots = [];
    let currentTime = startMoment.clone();

    while (currentTime.isBefore(endMoment)) {
      const slotEndTime = currentTime.clone().add(interval_minutes, 'minutes');
      if (slotEndTime.isAfter(endMoment)) break;

      const slotToken =
        currentTime.format('YYYYMMDD') + currentTime.format('HHmm') + nanoid(4);

      slots.push({
        ConsultantID: consultant_id,
        SlotDate: currentTime.startOf('day').utc().toDate(),
        SlotTime: currentTime.format('HH:mm:ss'),
        SlotEndTime: slotEndTime.format('HH:mm:ss'),
        MaxSlots: max_slots,
        AvailableSlots: max_slots,
        Status: 'Available',
        SlotToken: slotToken,
        IsBooked: false,
        IsActive: true,
      });

      currentTime.add(interval_minutes, 'minutes');
    }

    await TimeSlot.bulkCreate(slots);

    res.status(201).json({
      success: true,
      message: 'Slots created successfully.',
      data: slots.map((slot) => ({
        ...slot,
        SlotDate: moment
          .utc(slot.SlotDate)
          .tz(APP_TIMEZONE)
          .format('YYYY-MM-DD'),
      })),
    });
  } catch (error) {
    logger.error('Error adding day slots:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create slots',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * @desc    Add slots for a doctor over a date range
 * @route   POST /api/slots/range
 * @access  Private/Admin
 */
exports.addSlotsRange = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  try {
    const {
      consultant_id,
      start_date,
      end_date,
      start_time,
      end_time,
      interval_minutes = 15,
      max_slots = 1,
      days_of_week = [1, 2, 3, 4, 5, 6], // Monday, Tuesday, Wednesday, Thursday, Friday, Saturday
    } = req.body;

    // Parse dates in application timezone and convert to UTC
    const startMoment = moment.tz(start_date, APP_TIMEZONE).startOf('day');
    const endMoment = moment.tz(end_date, APP_TIMEZONE).endOf('day');

    if (startMoment.isAfter(endMoment)) {
      return res.status(400).json({
        success: false,
        message: 'Start date must be before end date.',
      });
    }

    const slots = [];
    let currentDate = startMoment.clone();

    while (currentDate.isSameOrBefore(endMoment, 'day')) {
      if (days_of_week.includes(currentDate.isoWeekday())) {
        const dateStr = currentDate.format('YYYY-MM-DD');
        let currentTime = moment.tz(
          `${dateStr} ${start_time}`,
          'YYYY-MM-DD HH:mm:ss',
          APP_TIMEZONE
        );
        const endTime = moment.tz(
          `${dateStr} ${end_time}`,
          'YYYY-MM-DD HH:mm:ss',
          APP_TIMEZONE
        );

        while (currentTime.isBefore(endTime)) {
          const slotEndTime = currentTime
            .clone()
            .add(interval_minutes, 'minutes');
          if (slotEndTime.isAfter(endTime)) break;

          const slotToken =
            currentDate.format('YYYYMMDD') +
            currentTime.format('HHmm') +
            nanoid(4);

          slots.push({
            ConsultantID: consultant_id,
            SlotDate: currentDate.startOf('day').utc().toDate(),
            SlotTime: currentTime.format('HH:mm:ss'),
            SlotEndTime: slotEndTime.format('HH:mm:ss'),
            MaxSlots: max_slots,
            AvailableSlots: max_slots,
            Status: 'Available',
            SlotToken: slotToken,
            IsBooked: false,
            IsActive: true,
          });

          currentTime.add(interval_minutes, 'minutes');
        }
      }
      currentDate.add(1, 'day');
    }

    await TimeSlot.bulkCreate(slots);

    res.status(201).json({
      success: true,
      message: 'Slots created successfully.',
      data: {
        totalSlotsCreated: slots.length,
        dateRange: {
          start: startMoment.format('YYYY-MM-DD'),
          end: endMoment.format('YYYY-MM-DD'),
        },
        slots: slots.map((slot) => ({
          ...slot,
          SlotDate: moment
            .utc(slot.SlotDate)
            .tz(APP_TIMEZONE)
            .format('YYYY-MM-DD'),
        })),
      },
    });
  } catch (error) {
    logger.error('Error adding range slots:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create slots',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * @desc    Get all slots for a specific doctor
 * @route   GET /api/slots/doctor/:doctorId
 * @access  Public
 */
exports.getAllDoctorSlots = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const slots = await TimeSlot.findAllByConsultant(doctorId);

    if (!slots || slots.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No slots available for this doctor.',
      });
    }

    // Group slots by local date
    const groupedSlots = slots.reduce((acc, slot) => {
      // const date = moment.utc(slot.SlotDate).local().format('YYYY-MM-DD');
      const date = moment
        .utc(slot.SlotDate)
        .tz(APP_TIMEZONE)
        .format('YYYY-MM-DD');
      if (!acc[date]) {
        acc[date] = [];
      }

      acc[date].push({
        SlotID: slot.SlotID,
        ConsultationDate: date,
        SlotTime: slot.SlotTime,
        AvailableSlots: slot.AvailableSlots,
        MaxSlots: slot.MaxSlots,
        SlotToken: slot.SlotToken,
        isBooked: slot.IsBooked, // camelCase to match output
        AppointmentID: slot.AppointmentID || null,
        appointments: slot.appointments || [],
      });

      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: groupedSlots,
    });
  } catch (error) {
    logger.error('Error fetching doctor slots:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor slots',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * @desc    Release a slot
 * @route   PUT /api/slots/release
 * @access  Public
 */
exports.releaseSlots = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  try {
    const { slotId } = req.body;

    const released = await TimeSlot.releaseSlot(slotId);
    if (!released) {
      return res.status(404).json({
        success: false,
        message: 'Slot not found or already released',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Slot released successfully',
    });
  } catch (error) {
    logger.error('Error releasing slot:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to release slot',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * @desc    Get all slots
 * @route   GET /api/slots
 * @access  Private/Admin
 */
exports.getAllSlots = async (req, res) => {
  try {
    const slots = await TimeSlot.findAll();
    res.status(200).json({
      success: true,
      data: slots,
    });
  } catch (error) {
    logger.error('Error fetching all slots:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch slots',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
