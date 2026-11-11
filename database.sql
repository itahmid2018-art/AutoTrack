-- ============================================================
-- AUTOTRACK PRO - BOSCH & VENDOR POWER TOOLS SERVICE CENTER DB
-- Target Database: MySQL 8.0+ / MariaDB 10.5+ / PostgreSQL
-- Script Name: database.sql
-- Description: Complete DDL schema & seed data with admin credentials
-- ============================================================

CREATE DATABASE IF NOT EXISTS `bosch_service_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `bosch_service_db`;

-- ------------------------------------------------------------
-- 1. ADMIN USERS TABLE (With Default Admin Account)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `admin_users`;
CREATE TABLE `admin_users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` VARCHAR(20) NOT NULL DEFAULT 'Administrator',
  `full_name` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Seed Default Admin Account (Email: admin@autotrack.com, Password: 123456)
INSERT INTO `admin_users` (`username`, `email`, `password_hash`, `role`, `full_name`) VALUES
('admin', 'admin@autotrack.com', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW', 'Administrator', 'Master Service Admin');
-- Note: Password '123456' is hashed above using bcrypt. Plain text: 123456

-- ------------------------------------------------------------
-- 2. BUSINESS SETTINGS TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `business_settings`;
CREATE TABLE `business_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `center_name` VARCHAR(255) NOT NULL DEFAULT 'BOSCH Authorised Service Center',
  `address` TEXT NOT NULL,
  `phone` VARCHAR(50) NOT NULL,
  `email` VARCHAR(100) NOT NULL,
  `tax_rate` DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  `labor_rate` DECIMAL(10,2) NOT NULL DEFAULT 45.00,
  `job_card_prefix` VARCHAR(20) NOT NULL DEFAULT 'BOSCH-2026-',
  `deduct_stock_on` ENUM('Approval', 'InService', 'Completion') NOT NULL DEFAULT 'InService',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO `business_settings` (`center_name`, `address`, `phone`, `email`, `tax_rate`, `labor_rate`, `job_card_prefix`, `deduct_stock_on`) VALUES
('BOSCH Authorised Power Tools Service Center', 'Industrial Estate, Bay 4, Workshop Division', '+1 (555) 019-2831', 'service@boschtools.com', 10.00, 45.00, 'BOSCH-2026-', 'InService');

-- ------------------------------------------------------------
-- 3. SPARE PARTS INVENTORY TABLE (1,000 SKUs)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `inventory_items`;
CREATE TABLE `inventory_items` (
  `id` VARCHAR(64) PRIMARY KEY,
  `sku` VARCHAR(50) NOT NULL UNIQUE,
  `barcode` VARCHAR(50) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `brand` VARCHAR(100) NOT NULL,
  `compatible_models` VARCHAR(255) NOT NULL,
  `unit_price` DECIMAL(10,2) NOT NULL,
  `cost_price` DECIMAL(10,2) NOT NULL,
  `stock_qty` INT NOT NULL DEFAULT 0,
  `min_stock_threshold` INT NOT NULL DEFAULT 5,
  `unit` VARCHAR(20) NOT NULL DEFAULT 'pcs',
  `bin_location` VARCHAR(50) NOT NULL,
  `last_restocked` DATE NOT NULL,
  INDEX `idx_category` (`category`),
  INDEX `idx_sku` (`sku`),
  INDEX `idx_stock_alert` (`stock_qty`, `min_stock_threshold`)
) ENGINE=InnoDB;

-- Sample Inventory Seed
INSERT INTO `inventory_items` (`id`, `sku`, `barcode`, `name`, `category`, `brand`, `compatible_models`, `unit_price`, `cost_price`, `stock_qty`, `min_stock_threshold`, `unit`, `bin_location`, `last_restocked`) VALUES
('item-1001', 'BRSH-1001', '3165141001', 'Bosch GBH 2-26 Auto-Stop Carbon Brush Pair', 'Carbon Brushes & Caps', 'Bosch Genuine Spare Parts', 'Bosch GBH 2-26, GBH 2-28', 12.50, 7.50, 45, 5, 'sets', 'Bin A-01', '2026-11-05'),
('item-1002', 'ARM-1002', '3165141002', 'Bosch GBH 2-26 DFR Armature Assembly 230V', 'Armatures & Rotors 230V/18V', 'Bosch Heavy Duty OEM', 'Bosch GBH 2-26 DFR', 48.00, 32.00, 2, 5, 'pcs', 'Bin A-12', '2026-11-05'),
('item-1003', 'SWT-1003', '3165141003', 'Bosch GWS Angle Grinder Switch Assembly', 'Switches & Speed Modules', 'Bosch Genuine Spare Parts', 'Bosch GWS 900, GWS 7-115', 14.00, 8.00, 18, 4, 'pcs', 'Bin B-04', '2026-11-05'),
('item-1004', 'CHK-1004', '3165141004', 'Bosch GBH 2-26 DFR Quick Change SDS Chuck', 'SDS Chucks & Tool Holders', 'Bosch Heavy Duty OEM', 'Bosch GBH 2-26 DFR', 35.00, 22.00, 8, 3, 'pcs', 'Bin C-02', '2026-11-05'),
('item-1005', 'GER-1005', '3165141005', 'Bosch FT 1 V 4 Heavy Duty Grease Tube 100g', 'Gears, Pinions & Grease', 'Bosch Genuine Spare Parts', 'Universal Bosch SDS Tools', 9.50, 5.00, 30, 8, 'pcs', 'Bin D-01', '2026-11-05');

-- ------------------------------------------------------------
-- 4. SERVICE JOB CARDS TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `job_cards`;
CREATE TABLE `job_cards` (
  `id` VARCHAR(64) PRIMARY KEY,
  `customer_name` VARCHAR(255) NOT NULL,
  `customer_company` VARCHAR(255) NULL,
  `customer_phone` VARCHAR(50) NOT NULL,
  `customer_email` VARCHAR(100) NULL,
  `gst_or_tax_id` VARCHAR(50) NULL,
  
  -- Tool Specs
  `tool_brand` VARCHAR(100) NOT NULL,
  `tool_category` VARCHAR(100) NOT NULL,
  `tool_model_number` VARCHAR(100) NOT NULL,
  `tool_serial_number` VARCHAR(100) NOT NULL,
  `tool_voltage_rating` VARCHAR(50) NOT NULL,
  `tool_warranty_status` VARCHAR(100) NOT NULL,
  `tool_physical_condition` TEXT NULL,

  -- Grievance & Requirements
  `grievance_category` VARCHAR(150) NOT NULL,
  `detailed_complaint` TEXT NOT NULL,
  `service_type` VARCHAR(100) NOT NULL,
  `pre_approved_limit` DECIMAL(10,2) NOT NULL DEFAULT 50.00,

  -- Status & Tech
  `intake_date` VARCHAR(50) NOT NULL,
  `promised_completion` VARCHAR(50) NOT NULL,
  `status` ENUM('Intake', 'Diagnosis', 'Awaiting Approval', 'In Service', 'Ready for Pickup', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Intake',
  `priority` ENUM('Routine', 'Urgent', 'Emergency') NOT NULL DEFAULT 'Routine',
  `technician` VARCHAR(100) NOT NULL,
  `diagnostic_notes` TEXT NULL,

  -- Financials
  `labor_hours` DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  `labor_rate` DECIMAL(10,2) NOT NULL DEFAULT 45.00,
  `discount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `tax_rate` DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,

  `customer_signature` LONGTEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_phone` (`customer_phone`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB;

-- Seed Sample Job Card
INSERT INTO `job_cards` (`id`, `customer_name`, `customer_company`, `customer_phone`, `customer_email`, `gst_or_tax_id`, `tool_brand`, `tool_category`, `tool_model_number`, `tool_serial_number`, `tool_voltage_rating`, `tool_warranty_status`, `tool_physical_condition`, `grievance_category`, `detailed_complaint`, `service_type`, `pre_approved_limit`, `intake_date`, `promised_completion`, `status`, `priority`, `technician`, `diagnostic_notes`, `labor_hours`, `labor_rate`, `discount`, `tax_rate`, `total_amount`) VALUES
('BOSCH-2026-0041', 'Apex Industrial Construction Ltd', 'Apex Industrial', '+1 (555) 234-5678', 'service@apexconstruct.com', 'TAX-8920194-US', 'Bosch Professional', 'Rotary Hammer / SDS', 'GBH 2-26 DFR Professional', 'SN-3611B54300', '230V AC (800W)', 'Bosch Heavy Duty 3-Year Extended', 'Heavy Jobsite Dust, Cable Scratched', 'Motor Sparking / Excessive Smoke', 'Heavily sparking inside motor housing under load. Intermittent hammer impact loss during overhead drilling.', 'Diagnostic & Repair', 75.00, '2026-11-10 09:15', '2026-11-11 16:00', 'In Service', 'Urgent', 'David Miller (Bosch Tech)', 'Armature commutator segments pitted and burnt. Carbon brushes worn past auto-stop limit line.', 1.50, 45.00, 5.00, 10.00, 154.00);

-- ------------------------------------------------------------
-- 5. RECURRING MAINTENANCE SCHEDULES TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `recurring_maintenance`;
CREATE TABLE `recurring_maintenance` (
  `id` VARCHAR(64) PRIMARY KEY,
  `customer_name` VARCHAR(255) NOT NULL,
  `customer_company` VARCHAR(255) NULL,
  `customer_phone` VARCHAR(50) NOT NULL,
  `customer_email` VARCHAR(100) NULL,
  `tool_brand` VARCHAR(100) NOT NULL,
  `tool_category` VARCHAR(100) NOT NULL,
  `model_number` VARCHAR(100) NOT NULL,
  `serial_number` VARCHAR(100) NOT NULL,
  `interval_months` INT NOT NULL DEFAULT 6,
  `last_service_date` DATE NOT NULL,
  `next_due_date` DATE NOT NULL,
  `status` ENUM('Upcoming', 'Due Soon', 'Overdue', 'Serviced') NOT NULL DEFAULT 'Upcoming',
  `recommended_service_scope` TEXT NOT NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_due_date` (`next_due_date`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB;

-- Seed Sample Recurring Servicing Schedule
INSERT INTO `recurring_maintenance` (`id`, `customer_name`, `customer_company`, `customer_phone`, `customer_email`, `tool_brand`, `tool_category`, `model_number`, `serial_number`, `interval_months`, `last_service_date`, `next_due_date`, `status`, `recommended_service_scope`, `notes`) VALUES
('MAINT-2026-001', 'Apex Industrial Construction', 'Apex Industrial', '+1 (555) 234-5678', 'service@apexconstruct.com', 'Bosch Professional', 'Demolition Breaker', 'GSH 11 E Professional', 'SN-3611C36000', 6, '2026-05-15', '2026-11-15', 'Due Soon', 'SDS-Max Striker O-Ring overhaul & FT 1 V 4 Lithium Gearbox Lubrication', 'Heavy concrete demolition usage on commercial sites.'),
('MAINT-2026-002', 'Metro Electrical Contractors', 'Metro Electric', '+1 (555) 987-6543', 'maintenance@metroelectric.org', 'Bosch Professional', 'Rotary Hammer / SDS', 'GBH 2-28 F Professional', 'SN-3611B67000', 3, '2026-08-01', '2026-11-01', 'Overdue', 'Auto-Stop Carbon Brushes check & High Voltage Insulated Cable inspection', 'High volume conduit drilling.');

-- ------------------------------------------------------------
-- 6. MESSAGE LOGS TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `message_logs`;
CREATE TABLE `message_logs` (
  `id` VARCHAR(64) PRIMARY KEY,
  `job_card_id` VARCHAR(64) NULL,
  `timestamp` VARCHAR(50) NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `recipient_phone` VARCHAR(50) NOT NULL,
  `text` TEXT NOT NULL,
  `channel` ENUM('WhatsApp', 'SMS') NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'Sent',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
