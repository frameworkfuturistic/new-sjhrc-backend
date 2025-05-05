const Appointment = require('../../models/symptom/Appointment');
const TimeSlot = require('../../models/symptom/TimeSlot');
const Consultant = require('../../models/symptom/Consultant');
// const NotificationService = require('../../services/notificationService');
const logger = require('../../utils/logger');
const { mysqlPool } = require('../../config/database');
const { validationResult } = require('express-validator');
const RazorpayService = require('../../services/RazorpayService');
const cleanupService = require('../../services/appointmentCleanup');

class AppointmentController {
  /**
   * Create new appointment (without payment initiation)
   */
  async createAppointment(req, res) {
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.beginTransaction();

      // Destructure with proper case matching request body
      const {
        SlotID,
        ConsultantID,
        MRNo,
        PatientName,
        MobileNo,
        Email,
        Remarks,
      } = req.body;
      console.log('Request body:', req.body);

      // 1. Verify slot availability
      console.log('Slot ID:', SlotID);
      const slot = await TimeSlot.findByIdForBooking(SlotID, connection);
      console.log('Slot details:', slot);

      if (!slot || slot.Status !== 'Available') {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Selected slot is no longer available',
          debug: {
            slotStatus: slot?.Status,
            availableSlots: slot?.AvailableSlots,
          },
        });
      }

      // 2. Get consultant details
      const consultant = await Consultant.findById(ConsultantID, connection);
      if (!consultant) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Consultant not found',
        });
      }

      // 3. Create appointment record
      const appointmentData = {
        MRNo: MRNo,
        ConsultantID: ConsultantID,
        SlotID: SlotID,
        ConsultationDate: slot.SlotDate,
        PatientName: PatientName,
        MobileNo: MobileNo,
        DepartmentID: consultant.DepartmentID,
        Status: 'Pending',
        PaymentStatus: 'Pending',
        AmountPaid: consultant.OPDConsultationFee,
        Remarks: Remarks || null,
      };

      // Add optional fields only if they exist
      if (Email !== undefined) {
        appointmentData.Email = Email;
      }
      if (Remarks !== undefined) {
        appointmentData.Remarks = Remarks;
      }

      const appointment = await Appointment.create(appointmentData, connection);
      console.log('Appointment created:', appointment);

      // 4. Reserve the slot
      const reserved = await TimeSlot.reserveSlot(
        SlotID,
        appointment.AppointmentID,
        connection
      );
      console.log('Slot reserved:', reserved);

      if (!reserved) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Failed to reserve slot',
        });
      }

      await connection.commit();

      res.status(201).json({
        success: true,
        data: appointment,
      });
    } catch (error) {
      if (connection) await connection.rollback();
      logger.error('Error creating appointment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create appointment',
        error:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    } finally {
      if (connection) connection.release();
    }
  }

  async cancelRefundAppointment(req, res) {
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.beginTransaction();

      const { id: appointmentId } = req.params;
      const {
        remarks = 'Cancelled by patient',
        refundReason = 'Patient request',
      } = req.body;

      // 1. Get appointment details
      const appointment = await Appointment.findById(appointmentId, connection);
      if (!appointment) {
        await connection.rollback();
        return res
          .status(404)
          .json({ success: false, message: 'Appointment not found' });
      }

      // 2. Check cancellation eligibility
      if (!['Pending', 'Confirmed', 'Scheduled'].includes(appointment.Status)) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Appointment cannot be cancelled at this stage',
        });
      }

      // 3. Handle payment and refund logic
      let refundDetails = null;
      let refundStatus = 'not_required';

      if (appointment.PaymentStatus === 'Paid' && appointment.PaymentID) {
        try {
          refundDetails = await RazorpayService.initiateRefund(
            appointment.PaymentID,
            Math.round(appointment.AmountPaid * 100),
            {
              reason: refundReason,
              appointment_id: appointmentId,
              cancelled_by: req.user?.id || 'system',
            }
          );

          if (refundDetails.status === 'already_refunded') {
            refundStatus = 'already_refunded';
            // Update our records to match Razorpay's state
            await connection.query(
              `UPDATE opd_onlineappointments 
               SET RefundID = ?, RefundAmount = ?, RefundDate = ?
               WHERE AppointmentID = ?`,
              [
                `existing_refund_${refundDetails.original_payment.amount_refunded}`,
                refundDetails.original_payment.amount_refunded / 100,
                new Date(),
                appointmentId,
              ]
            );
          } else {
            refundStatus = 'initiated';
          }
        } catch (error) {
          if (error.message === 'Payment already refunded') {
            // Handle case where payment was refunded outside our system
            refundStatus = 'already_refunded_external';
            await connection.rollback();
            return res.status(400).json({
              success: false,
              message: 'Payment was already refunded through another channel',
              solution: 'Check Razorpay dashboard for refund details',
            });
          }

          await connection.rollback();
          logger.error('Refund processing failed:', {
            error: error.message,
            appointmentId,
            paymentId: appointment.PaymentID,
          });
          return res.status(500).json({
            success: false,
            message: 'Refund processing failed',
            error:
              process.env.NODE_ENV === 'development'
                ? error.message
                : undefined,
          });
        }
      }

      // 4. Update appointment status
      const updateData = {
        Status: 'Cancelled',
        Remarks: remarks,
        PaymentStatus: refundStatus.startsWith('already_refunded')
          ? 'Refunded'
          : refundDetails
            ? 'Refunded'
            : 'Cancelled',
        RefundID: refundDetails?.id || null,
        RefundAmount: refundDetails?.amount ? refundDetails.amount / 100 : null,
        RefundDate: refundDetails ? new Date() : null,
        RefundReason: refundReason,
        CancelledBy: req.user?.id || 'patient',
        CancelledAt: new Date(),
      };

      await Appointment.update(appointmentId, updateData, connection);

      // 5. Release the slot
      await TimeSlot.releaseSlot(appointment.SlotID, connection);

      await connection.commit();

      // 6. Send notifications
      // const notificationData = {
      //   appointmentId: appointment.AppointmentID,
      //   patientName: appointment.PatientName,
      //   consultantName: appointment.ConsultantName,
      //   date: appointment.ConsultationDate,
      //   amount: appointment.AmountPaid,
      //   refundStatus,
      //   refundId: updateData.RefundID,
      //   refundAmount: updateData.RefundAmount,
      // };

      // if (refundStatus === 'already_refunded') {
      //   await NotificationService.sendPaymentNotification(
      //     'refundAlreadyProcessed',
      //     notificationData
      //   );
      // } else if (refundDetails) {
      //   await NotificationService.sendPaymentNotification(
      //     'refundProcessed',
      //     notificationData
      //   );
      // } else {
      //   await NotificationService.sendAppointmentCancelled(notificationData);
      // }

      return res.status(200).json({
        success: true,
        message:
          refundStatus === 'already_refunded'
            ? 'Appointment cancelled (payment was already refunded)'
            : refundDetails
              ? 'Appointment cancelled and refund initiated'
              : 'Appointment cancelled (no refund required)',
        refundStatus,
        refundId: updateData.RefundID,
        refundAmount: updateData.RefundAmount,
      });
    } catch (error) {
      if (connection) await connection.rollback();
      logger.error('Cancellation error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to cancel appointment',
        error:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Mark appointment as completed (doctor/admin only)
   */
  async complete(req, res) {
    try {
      const { appointmentId } = req.params;
      const { diagnosis, prescription } = req.body;

      let connection;
      try {
        connection = await mysqlPool.getConnection();
        await connection.beginTransaction();

        // 1. Get appointment details
        const appointment = await Appointment.findById(
          appointmentId,
          connection
        );
        if (!appointment) {
          await connection.rollback();
          return res.status(404).json({
            success: false,
            message: 'Appointment not found',
          });
        }

        // 2. Check if appointment can be completed
        // if (appointment.Status !== 'Confirmed' || 'Scheduled')
        if (
          appointment.Status !== 'Confirmed' &&
          appointment.Status !== 'Scheduled'
        ) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: 'Only confirmed & Scheduled appointments can be completed',
          });
        }

        // 3. Update appointment status
        const completed = await Appointment.update(
          appointmentId,
          {
            Status: 'Completed',
            Diagnosis: diagnosis,
            Prescription: prescription,
            UpdatedAt: new Date(),
          },
          connection
        );

        if (!completed) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: 'Failed to complete appointment',
          });
        }

        await connection.commit();

        res.status(200).json({
          success: true,
          message: 'Appointment marked as completed',
        });
      } catch (error) {
        if (connection) await connection.rollback();
        throw error;
      } finally {
        if (connection) connection.release();
      }
    } catch (error) {
      logger.error('Error completing appointment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to complete appointment',
        error:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  async schedule(req, res) {
    try {
      const { appointmentId } = req.params;
      const { newSlotId } = req.body; // Expecting newSlotId in request body

      let connection;
      try {
        connection = await mysqlPool.getConnection();
        await connection.beginTransaction();

        // 1. Get appointment details
        const appointment = await Appointment.findById(
          appointmentId,
          connection
        );
        if (!appointment) {
          await connection.rollback();
          return res.status(404).json({
            success: false,
            message: 'Appointment not found',
          });
        }
        if (
          appointment.Status !== 'Confirmed' &&
          appointment.Status !== 'Scheduled'
        ) {
          // 2. Check if appointment can be scheduled
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: 'Only confirmed appointments can be scheduled',
          });
        }

        // 3. Validate new slot
        const newSlot = await TimeSlot.findByIdForBooking(
          newSlotId,
          connection
        );
        if (!newSlot || newSlot.AvailableSlots <= 0) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: 'Selected slot is not available',
          });
        }

        // 4. Release old slot if exists
        if (appointment.SlotID) {
          const releaseSuccess = await TimeSlot.releaseSlot(
            appointment.SlotID,
            connection
          );
          if (!releaseSuccess) {
            await connection.rollback();
            return res.status(400).json({
              success: false,
              message: 'Failed to release previous slot',
            });
          }
        }

        // 5. Reserve new slot
        const reserveSuccess = await TimeSlot.reserveSlot(
          newSlotId,
          appointmentId,
          connection
        );
        if (!reserveSuccess) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: 'Failed to reserve new slot',
          });
        }

        // 6. Update appointment with new slot and status
        const updateData = {
          Status: 'Scheduled',
          SlotID: newSlotId,
          ConsultationDate: newSlot.SlotDate,
          UpdatedAt: new Date(),
        };

        const scheduleSuccess = await Appointment.update(
          appointmentId,
          updateData,
          connection
        );

        if (!scheduleSuccess) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: 'Failed to update appointment',
          });
        }

        await connection.commit();

        // 7. Send notification
        // try {
        //   const consultant = await Consultant.findById(
        //     appointment.ConsultantID
        //   );
        //   await NotificationService.sendAppointmentScheduled({
        //     appointmentId: appointment.AppointmentID,
        //     patientName: appointment.PatientName,
        //     mobileNo: appointment.MobileNo,
        //     email: appointment.Email,
        //     consultantName: consultant.ConsultantName,
        //     date: newSlot.SlotDate,
        //     time: newSlot.SlotTime,
        //     tokenNo: appointment.TokenNo,
        //   });
        // } catch (notificationError) {
        //   logger.error('Notification error:', notificationError);
        // }

        res.status(200).json({
          success: true,
          message: 'Appointment scheduled successfully',
          data: {
            newSlotId,
            consultationDate: newSlot.SlotDate,
            slotTime: newSlot.SlotTime,
          },
        });
      } catch (error) {
        if (connection) await connection.rollback();
        logger.error('Error scheduling appointment:', error);
        throw error;
      } finally {
        if (connection) connection.release();
      }
    } catch (error) {
      logger.error('Error in schedule appointment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to schedule appointment',
        error:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * Search appointments with filters
   */
  async search(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    try {
      const appointments = await Appointment.search(req.body);
      res.status(200).json({
        success: true,
        data: appointments,
      });
    } catch (error) {
      logger.error('Error searching appointments:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search appointments',
        error:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * Get all appointments with pagination
   */
  async getAll(req, res) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      // Extract query parameters
      const { page = 1, limit = 10, ...filters } = req.query;

      // Get appointments
      const result = await Appointment.getAll(filters, { page, limit });

      // Handle case when no appointments found
      if (!result || !result.data) {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: {
            total: 0,
            page: 1,
            limit: parseInt(limit),
            totalPages: 0,
          },
        });
      }

      // Successful response
      return res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      logger.error('Error in appointmentController.getAll:', error);

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch appointments',
        error:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * Cleanup expired appointments (for cron job)
   */
  async cleanupExpired(req, res) {
    try {
      const result = await cleanupService.executeCleanup();

      if (result.skipped) {
        return res.status(200).json({
          success: true,
          message: 'Cleanup already in progress',
          status: cleanupService.getStatus(),
        });
      }

      res.status(200).json({
        success: true,
        message: `Cleaned up ${result.count} expired appointments`,
        slotsFreed: result.slotsFreed,
        status: cleanupService.getStatus(),
      });
    } catch (error) {
      logger.error('Cleanup controller error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup expired appointments',
        error:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
        status: cleanupService.getStatus(),
      });
    }
  }

  /**
   * Get cleanup service health status
   */
  getCleanupHealth(req, res) {
    try {
      const status = cleanupService.getStatus();
      res.status(200).json({
        success: true,
        status,
        uptime: process.uptime(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get cleanup status',
      });
    }
  }
}

module.exports = new AppointmentController();
