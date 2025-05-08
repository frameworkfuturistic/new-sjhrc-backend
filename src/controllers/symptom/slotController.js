const TimeSlot = require('../../models/symptom/TimeSlot');
const logger = require('../../utils/logger');
const moment = require('moment-timezone');
const { validationResult } = require('express-validator');
const { nanoid } = require('nanoid');

// Configure the timezone you want to work with
const APP_TIMEZONE = 'Asia/Kolkata';

/**
 * Utility function to handle date/time conversion between timezone and UTC
 * @param {string|Date} date - The date to convert
 * @param {string} [time] - Optional time string
 * @returns {Object} - Returns {utcDate, localDate} objects
 */
const handleDateConversion = (date, time = null) => {
  let localMoment;

  if (time) {
    // When time is provided, create moment with both date and time
    localMoment = moment.tz(
      `${date} ${time}`,
      'YYYY-MM-DD HH:mm:ss',
      APP_TIMEZONE
    );
  } else {
    // When only date is provided, create moment at start of day
    localMoment = moment.tz(date, 'YYYY-MM-DD', APP_TIMEZONE).startOf('day');
  }

  if (!localMoment.isValid()) {
    throw new Error('Invalid date/time provided');
  }

  return {
    utcDate: localMoment.utc().toDate(),
    localDate: localMoment.format('YYYY-MM-DD'),
    localTime: time ? localMoment.format('HH:mm:ss') : null,
  };
};

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

    // Convert input date to start and end of day in application timezone, then to UTC
    const startOfDay = moment.tz(date, APP_TIMEZONE).startOf('day');
    const endOfDay = moment.tz(date, APP_TIMEZONE).endOf('day');

    const slots = await TimeSlot.findAvailableSlots(
      doctorId,
      startOfDay.utc().toDate(),
      endOfDay.utc().toDate()
    );

    if (!slots || slots.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No available slots for the given date.',
      });
    }

    // Format response with local date strings
    const formattedSlots = slots.map((slot) => {
      // Convert UTC SlotDate back to local timezone for display
      const slotLocalDate = moment
        .utc(slot.SlotDate)
        .tz(APP_TIMEZONE)
        .format('YYYY-MM-DD');

      return {
        SlotID: slot.SlotID,
        ConsultantID: slot.ConsultantID,
        SlotDate: date, //slotLocalDate for get direct body
        SlotTime: slot.SlotTime,
        SlotEndTime: slot.SlotEndTime,
        AvailableSlots: slot.AvailableSlots,
        MaxSlots: slot.MaxSlots,
        Status: slot.Status,
        SlotToken: slot.SlotToken,
        IsBooked: slot.IsBooked,
      };
    });

    res.status(200).json({
      success: true,
      data: formattedSlots,
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
 * @route   POST /api/slots
 * @access  Private/Admin
 */
// exports.addSlotsDay = async (req, res) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     return res.status(400).json({
//       success: false,
//       errors: errors.array(),
//     });
//   }

//   try {
//     const {
//       consultant_id,
//       date,
//       start_time,
//       end_time,
//       interval_minutes = 15,
//       max_slots = 1,
//     } = req.body;

//     // Validate date format
//     if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid date format. Use YYYY-MM-DD.',
//       });
//     }

//     // Parse input times without timezone conversion
//     const startMoment = moment.tz(
//       `${date} ${start_time}`,
//       'YYYY-MM-DD HH:mm:ss',
//       APP_TIMEZONE
//     );
//     const endMoment = moment.tz(
//       `${date} ${end_time}`,
//       'YYYY-MM-DD HH:mm:ss',
//       APP_TIMEZONE
//     );

//     if (!startMoment.isValid() || !endMoment.isValid()) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid time format. Use HH:mm:ss.',
//       });
//     }

//     if (startMoment.isSameOrAfter(endMoment)) {
//       return res.status(400).json({
//         success: false,
//         message: 'Start time must be before end time.',
//       });
//     }

//     const slots = [];
//     let currentTime = startMoment.clone();

//     while (currentTime.isBefore(endMoment)) {
//       const slotEndTime = currentTime.clone().add(interval_minutes, 'minutes');
//       if (slotEndTime.isAfter(endMoment)) break;

//       // Generate unique slot token
//       const slotToken =
//         currentTime.format('YYYYMMDD') + currentTime.format('HHmm') + nanoid(4);

//       // FIXED: Store the date as is without timezone conversion
//       slots.push({
//         ConsultantID: consultant_id,
//         SlotDate: date, // Store the original date string
//         SlotTime: currentTime.format('HH:mm:ss'),
//         SlotEndTime: slotEndTime.format('HH:mm:ss'),
//         MaxSlots: max_slots,
//         AvailableSlots: max_slots,
//         Status: 'Available',
//         SlotToken: slotToken,
//         IsBooked: false,
//         IsActive: true,
//       });

//       currentTime.add(interval_minutes, 'minutes');
//     }

//     // Bulk create slots in database
//     await TimeSlot.bulkCreate(slots);

//     res.status(201).json({
//       success: true,
//       message: 'Slots created successfully.',
//       data: slots,
//     });
//   } catch (error) {
//     logger.error('Error adding day slots:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to create slots',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined,
//     });
//   }
// };

/**
 * @desc    Add slots for a doctor on a specific day
 * @route   POST /api/slots
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

    // Validate and parse input times in application timezone
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
        message: 'Invalid time format. Use HH:mm:ss.',
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

      // Generate unique slot token
      const slotToken =
        currentTime.format('YYYYMMDD') + currentTime.format('HHmm') + nanoid(4);

      // Store SlotDate as UTC start of day for proper date grouping

      //11111111
      // const slotDateUTC = currentTime.clone().startOf('day').utc().toDate();

      //222222222
      //       const localDate = currentTime.format("YYYY-MM-DD")
      // const slotDateUTC = moment.tz(localDate, "YYYY-MM-DD", APP_TIMEZONE).utc().toDate()

      //333333333
      const slotDateUTC = currentTime
        .clone()
        .startOf('day')
        .format('YYYY-MM-DD');

      slots.push({
        ConsultantID: consultant_id,
        SlotDate: slotDateUTC,
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

    // Bulk create slots in database
    await TimeSlot.bulkCreate(slots);

    // Prepare response with local date formatting
    const responseSlots = slots.map((slot) => ({
      ...slot,
      SlotDate: moment.utc(slot.SlotDate).tz(APP_TIMEZONE).format('YYYY-MM-DD'),
    }));

    res.status(201).json({
      success: true,
      message: 'Slots created successfully.',
      data: responseSlots,
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
      days_of_week = [1, 2, 3, 4, 5, 6], // Monday-Saturday by default
    } = req.body;

    // Validate and parse date range in application timezone
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

    // Iterate through each day in the range
    while (currentDate.isSameOrBefore(endMoment, 'day')) {
      // Check if current day is in the allowed days_of_week
      if (days_of_week.includes(currentDate.isoWeekday())) {
        const dateStr = currentDate.format('YYYY-MM-DD');

        // Parse times for the current day in application timezone
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

        // Create slots for the current day
        while (currentTime.isBefore(endTime)) {
          const slotEndTime = currentTime
            .clone()
            .add(interval_minutes, 'minutes');
          if (slotEndTime.isAfter(endTime)) break;

          // Generate unique slot token
          const slotToken =
            currentDate.format('YYYYMMDD') +
            currentTime.format('HHmm') +
            nanoid(4);

          // Store SlotDate as UTC start of day for proper date grouping
          const slotDateUTC = currentDate.clone().startOf('day').utc().toDate();

          // const localDate = currentDate.format('YYYY-MM-DD');
          // const slotDateUTC = moment
          //   .tz(localDate, 'YYYY-MM-DD', APP_TIMEZONE)
          //   .utc()
          //   .toDate();

          slots.push({
            ConsultantID: consultant_id,
            SlotDate: slotDateUTC,
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

    // Bulk create all generated slots
    await TimeSlot.bulkCreate(slots);

    // Prepare response data
    const responseData = {
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
    };

    res.status(201).json({
      success: true,
      message: 'Slots created successfully.',
      data: responseData,
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
      // Convert UTC SlotDate back to local timezone for grouping
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
        isBooked: slot.IsBooked,
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

    // Format dates in response to local timezone
    const formattedSlots = slots.map((slot) => ({
      ...slot,
      SlotDate: moment.utc(slot.SlotDate).tz(APP_TIMEZONE).format('YYYY-MM-DD'),
      CreatedAt: moment.utc(slot.CreatedAt).tz(APP_TIMEZONE).format(),
      UpdatedAt: moment.utc(slot.UpdatedAt).tz(APP_TIMEZONE).format(),
    }));

    res.status(200).json({
      success: true,
      data: formattedSlots,
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

/**
 * @desc    Get slots with appointment data (filterable)
 * @route   GET /api/slots
 * @access  Private/Admin
 * @param {Object} req.query - Filter options
 * @param {string} [req.query.date] - Filter by date (YYYY-MM-DD)
 * @param {number} [req.query.consultantId] - Filter by consultant ID
 * @param {number} [req.query.departmentId] - Filter by department ID
 */
exports.getSlotsWithAppointments = async (req, res) => {
  try {
    // Extract and validate filters from query params
    const { date, consultantId, departmentId } = req.query;
    const filters = {};

    if (date && !moment(date, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD',
      });
    }

    if (date) filters.date = date;
    if (consultantId) filters.consultantId = parseInt(consultantId);
    if (departmentId) filters.departmentId = parseInt(departmentId);

    // Get filtered slots
    const slots = await TimeSlot.findAllWithAppointments(filters);

    if (!slots || slots.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: 'No slots found for the given filters',
      });
    }

    // Format dates and structure response
    const formattedSlots = slots.map((slot) => ({
      ...slot,
      SlotDate: formatDateToLocal(slot.SlotDate),
      CreatedAt: formatDateToLocal(slot.CreatedAt),
      UpdatedAt: formatDateToLocal(slot.UpdatedAt),
      appointment: slot.appointment
        ? {
            ...slot.appointment,
            ConsultationDate: formatDateToLocal(
              slot.appointment.ConsultationDate
            ),
            CreatedAt: formatDateToLocal(slot.appointment.CreatedAt),
            PaymentDate: formatDateToLocal(slot.appointment.PaymentDate),
            CancelledAt: formatDateToLocal(slot.appointment.CancelledAt),
          }
        : null,
      // Include additional relations
      consultant: slot.consultant,
      department: slot.department,
    }));

    res.status(200).json({
      success: true,
      data: formattedSlots,
      count: formattedSlots.length,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    });
  } catch (error) {
    logger.error('Error in getSlotsWithAppointments:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      queryParams: req.query,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to fetch slots data',
      error:
        process.env.NODE_ENV === 'development'
          ? {
              message: error.message,
              ...(error.sql && { sql: error.sql }),
            }
          : undefined,
    });
  }
};

// Helper function for consistent date formatting
function formatDateToLocal(date) {
  if (!date) return null;
  try {
    return moment.utc(date).tz(APP_TIMEZONE).format('YYYY-MM-DDTHH:mm:ssZ');
  } catch (error) {
    logger.warn('Date formatting error:', {
      inputDate: date,
      error: error.message,
    });
    return null;
  }
}
