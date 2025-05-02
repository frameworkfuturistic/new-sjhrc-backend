const Payment = require('../../models/symptom/Payment');
const Appointment = require('../../models/symptom/Appointment');
const { mysqlPool } = require('../../config/database');

exports.getPaymentDashboard = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;

    const connection = await mysqlPool.getConnection();
    try {
      // 1. Get summary stats
      const [stats] = await connection.query(
        `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN PaymentStatus = 'Completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN PaymentStatus = 'Pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN PaymentStatus = 'Failed' THEN 1 ELSE 0 END) as failed,
          SUM(AmountPaid) as total_amount,
          SUM(CASE WHEN ReconciliationStatus = 'discrepancy' THEN 1 ELSE 0 END) as discrepancies
        FROM opd_appointment_payments
        WHERE PaymentDate BETWEEN ? AND ?
      `,
        [startDate || '1970-01-01', endDate || new Date()]
      );

      // 2. Get recent payments with appointment details
      const [payments] = await connection.query(
        `
        SELECT p.*, 
               a.PatientName, 
               a.ConsultationDate,
               a.SlotID,
               d.ConsultantName
        FROM opd_appointment_payments p
        JOIN opd_onlineappointments a ON p.OPDOnlineAppointmentID = a.OPDOnlineAppointmentID
        JOIN opd_consultants d ON a.ConsultantID = d.ConsultantID
        WHERE p.PaymentDate BETWEEN ? AND ?
        ${status ? 'AND p.PaymentStatus = ?' : ''}
        ORDER BY p.PaymentDate DESC
        LIMIT 100
      `,
        [startDate || '1970-01-01', endDate || new Date(), status].filter(
          Boolean
        )
      );

      // 3. Get reconciliation issues
      const [issues] = await connection.query(`
        SELECT * FROM opd_appointment_payments
        WHERE ReconciliationStatus = 'discrepancy'
        ORDER BY PaymentDate DESC
        LIMIT 50
      `);

      res.json({
        success: true,
        data: {
          summary: stats[0],
          recentPayments: payments,
          reconciliationIssues: issues,
        },
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
    });
  }
};

exports.forceReconciliation = async (req, res) => {
  try {
    const ReconService = require('../services/reconciliationService');
    const result = await new ReconService().runDailyReconciliation();
    res.json({
      success: true,
      result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Manual reconciliation failed',
    });
  }
};
