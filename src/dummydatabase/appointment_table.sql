-- MySQL dump 10.13  Distrib 8.0.40, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: sjhrc_development
-- ------------------------------------------------------
-- Server version	8.0.40

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `gen_onlineslots`
--

DROP TABLE IF EXISTS `gen_onlineslots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gen_onlineslots` (
  `SlotID` int NOT NULL AUTO_INCREMENT,
  `ConsultantID` int NOT NULL,
  `SlotDate` date NOT NULL,
  `SlotTime` time NOT NULL,
  `SlotEndTime` time NOT NULL,
  `PatientID` int DEFAULT NULL,
  `MaxSlots` int NOT NULL DEFAULT '1',
  `AvailableSlots` int NOT NULL DEFAULT '1',
  `IsBooked` tinyint(1) DEFAULT '0',
  `IsActive` tinyint(1) DEFAULT '1',
  `AppointmentID` int DEFAULT NULL,
  `Status` enum('Available','Hold','Booked','Cancelled','Completed') DEFAULT 'Available',
  `SlotToken` varchar(20) DEFAULT NULL,
  `CreatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `UpdatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`SlotID`),
  UNIQUE KEY `idx_slot_token` (`SlotToken`),
  KEY `idx_consultant_date` (`ConsultantID`,`SlotDate`),
  KEY `idx_slot_status` (`Status`),
  KEY `idx_slot_time` (`SlotTime`),
  CONSTRAINT `gen_onlineslots_ibfk_1` FOREIGN KEY (`ConsultantID`) REFERENCES `gen_consultants` (`ConsultantID`)
) ENGINE=InnoDB AUTO_INCREMENT=191 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `opd_onlineappointments`
--

DROP TABLE IF EXISTS `opd_onlineappointments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `opd_onlineappointments` (
  `AppointmentID` int NOT NULL AUTO_INCREMENT,
  `RegistrationNo` varchar(20) DEFAULT NULL,
  `MRNo` varchar(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `ConsultantID` int NOT NULL,
  `SlotID` int NOT NULL,
  `ConsultationDate` date NOT NULL,
  `TokenNo` int unsigned DEFAULT NULL,
  `PatientName` varchar(50) NOT NULL,
  `MobileNo` varchar(15) NOT NULL,
  `DepartmentID` int DEFAULT NULL,
  `Remarks` varchar(255) DEFAULT NULL,
  `RefundReason` varchar(255) DEFAULT NULL,
  `Status` enum('Pending','Confirmed','Completed','Cancelled','No Show','Scheduled') DEFAULT 'Pending',
  `CancelledBy` varchar(50) DEFAULT NULL,
  `PaymentID` varchar(100) DEFAULT NULL,
  `RefundID` varchar(100) DEFAULT NULL,
  `OrderID` varchar(100) DEFAULT NULL,
  `PaymentStatus` enum('Pending','Paid','Failed','Refunded') DEFAULT 'Pending',
  `AmountPaid` decimal(10,2) DEFAULT '0.00',
  `RefundAmount` decimal(10,2) DEFAULT NULL,
  `PaymentMode` varchar(50) DEFAULT NULL,
  `PaymentDate` datetime DEFAULT NULL,
  `RefundDate` datetime DEFAULT NULL,
  `IsDeleted` tinyint(1) DEFAULT '0',
  `CreatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `UpdatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `CancelledAt` datetime DEFAULT NULL,
  `Diagnosis` text,
  `Prescription` text,
  PRIMARY KEY (`AppointmentID`),
  KEY `idx_appointment_mrno` (`MRNo`),
  KEY `idx_appointment_consultant` (`ConsultantID`),
  KEY `idx_appointment_date` (`ConsultationDate`),
  KEY `idx_appointment_status` (`Status`),
  KEY `idx_appointment_payment` (`PaymentStatus`),
  KEY `idx_appointment_slot` (`SlotID`),
  KEY `idx_payment_status` (`PaymentStatus`),
  KEY `idx_refund_id` (`RefundID`),
  KEY `idx_cancelled_at` (`CancelledAt`),
  CONSTRAINT `opd_onlineappointments_ibfk_1` FOREIGN KEY (`MRNo`) REFERENCES `mr_master` (`MRNo`),
  CONSTRAINT `opd_onlineappointments_ibfk_2` FOREIGN KEY (`ConsultantID`) REFERENCES `gen_consultants` (`ConsultantID`),
  CONSTRAINT `opd_onlineappointments_ibfk_3` FOREIGN KEY (`SlotID`) REFERENCES `gen_onlineslots` (`SlotID`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-05-02 10:51:38
