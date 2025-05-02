# 📦 Database Setup Guide

This guide explains how to export and import MySQL tables and how to prepare the database for this project.

---

## 🔧 Requirements

- MySQL Server (5.7+ or 8.x)
- MySQL Workbench or CLI
- Access to source and target databases
- Permissions to create/drop tables

---

## 1️⃣ Export Table Structure (No Data)

### Using MySQL Workbench:

1. Open **MySQL Workbench** and connect to the **source** database.
2. Navigate to: `Server → Data Export`.
3. Select your **database**, then check the table you want (e.g., `opd_onlineappointments`).
4. On the right:
   - Choose **"Dump Structure Only"**.
   - Select **"Export to Self-Contained File"**.
   - Set output file path, e.g., `dumps/opd_onlineappointments_structure.sql`.
5. Click **Start Export**.

### Using CLI:

```bash
mysqldump -u USER -p --no-data sjhrc_development opd_onlineappointments > opd_onlineappointments_structure.sql



# 🏥 Database Tables for SJHRC

This section outlines the schema structure for the main OPD appointment system.

---

## 🧱 Table: `gen_onlineslots`

| Column         | Type                              | Default       | Description                           |
|----------------|-----------------------------------|---------------|---------------------------------------|
| SlotID         | `INT AUTO_INCREMENT`              |               | Primary Key                           |
| ConsultantID   | `INT`                             |               | FK to `gen_consultants`               |
| SlotDate       | `DATE`                            |               | Slot Date                             |
| SlotTime       | `TIME`                            |               | Start Time                            |
| SlotEndTime    | `TIME`                            |               | End Time                              |
| PatientID      | `INT`                             | `NULL`        | Patient booking                       |
| MaxSlots       | `INT`                             | `1`           | Max number of slots available         |
| AvailableSlots | `INT`                             | `1`           | How many slots are still free         |
| IsBooked       | `TINYINT(1)`                      | `0`           | Flag if booked                        |
| IsActive       | `TINYINT(1)`                      | `1`           | Is slot active                        |
| AppointmentID  | `INT`                             | `NULL`        | FK to appointments                    |
| Status         | `ENUM`                            | `'Available'` | Slot state                            |
| SlotToken      | `VARCHAR(20)`                     | `NULL`        | Unique slot identifier                |
| CreatedAt      | `TIMESTAMP`                       | `CURRENT_TIMESTAMP` | Created time                   |
| UpdatedAt      | `TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | `CURRENT_TIMESTAMP` | Last update             |

✅ **Indexes**:
- `PRIMARY KEY (SlotID)`
- `UNIQUE (SlotToken)`
- `INDEX (ConsultantID, SlotDate)`
- `INDEX (Status)`

---

## 📋 Table: `opd_onlineappointments`

| Column          | Type                            | Default       | Description                         |
|------------------|-----------------------------------|----------------|-------------------------------------|
| AppointmentID     | `INT AUTO_INCREMENT`             |                | Primary key                         |
| RegistrationNo    | `VARCHAR(20)`                    | `NULL`         | Optional registration number        |
| MRNo              | `VARCHAR(10)`                    |                | FK to `mr_master`                   |
| ConsultantID      | `INT`                            |                | FK to `gen_consultants`             |
| SlotID            | `INT`                            |                | FK to `gen_onlineslots`             |
| ConsultationDate  | `DATE`                           |                | Date of appointment                 |
| TokenNo           | `INT UNSIGNED`                   | `NULL`         | Token issued to patient             |
| PatientName       | `VARCHAR(50)`                    |                | Patient full name                   |
| MobileNo          | `VARCHAR(15)`                    |                | Contact number                      |
| DepartmentID      | `INT`                            | `NULL`         | FK to department                    |
| Remarks           | `VARCHAR(255)`                   | `NULL`         | Additional notes                    |
| RefundReason      | `VARCHAR(255)`                   | `NULL`         | Reason for refund if cancelled      |
| Status            | `ENUM`                           | `'Pending'`    | Appointment status                  |
| CancelledBy       | `VARCHAR(50)`                    | `NULL`         | Who cancelled the appointment       |
| PaymentID         | `VARCHAR(100)`                   | `NULL`         | Razorpay Payment ID                 |
| RefundID          | `VARCHAR(100)`                   | `NULL`         | Razorpay Refund ID                  |
| OrderID           | `VARCHAR(100)`                   | `NULL`         | Razorpay Order ID                   |
| PaymentStatus     | `ENUM`                           | `'Pending'`    | Paid / Pending / Refunded etc.      |
| AmountPaid        | `DECIMAL(10,2)`                  | `0.00`         | Total amount received               |
| RefundAmount      | `DECIMAL(10,2)`                  | `NULL`         | Refund if any                       |
| PaymentMode       | `VARCHAR(50)`                    | `NULL`         | Online / Cash / UPI etc.            |
| PaymentDate       | `DATETIME`                       | `NULL`         | When payment was made               |
| RefundDate        | `DATETIME`                       | `NULL`         | When refund was made                |
| IsDeleted         | `TINYINT(1)`                     | `0`            | Soft delete flag                    |
| CreatedAt         | `TIMESTAMP`                      | `CURRENT_TIMESTAMP` | Created time                 |
| UpdatedAt         | `TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | `CURRENT_TIMESTAMP` | Updated time       |
| CancelledAt       | `DATETIME`                       | `NULL`         | Cancellation timestamp              |
| Diagnosis         | `TEXT`                           | `NULL`         | Doctor’s diagnosis                  |
| Prescription      | `TEXT`                           | `NULL`         | Medicine or treatment notes         |

✅ **Indexes**:
- `PRIMARY KEY (AppointmentID)`
- `INDEX (MRNo)`
- `INDEX (ConsultantID)`
- `INDEX (ConsultationDate)`
- `INDEX (PaymentStatus)`
- `INDEX (RefundID)`
- `INDEX (CancelledAt)`

---

## 📎 Notes

- All datetime columns use `TIMESTAMP` or `DATETIME` for full audit.
- Foreign keys enforce strong relational integrity:
  - `ConsultantID` → `gen_consultants`
  - `SlotID` → `gen_onlineslots`
  - `MRNo` → `mr_master`

---

## 🔁 Schema Dump Command

For full structure and data:

```bash
mysqldump -u your_user -p sjhrc_development opd_onlineappointments gen_onlineslots > dump.sql
