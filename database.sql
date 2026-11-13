-- ============================================================
-- AUTOTRACK PRO - SERVICE HUB & POWER TOOLS WORKSHOP DATABASE
-- Target Engine: MySQL 8.0+ / MariaDB 10.5+ / Cloud SQL MySQL
-- Script Name: database.sql
-- Description: Complete DDL Schema & Functional Seed Data (Users, Roles, Inventory, Job Cards, Time Logs, Settings)
-- ============================================================

CREATE DATABASE IF NOT EXISTS `bosch_service_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `bosch_service_db`;

-- Set session parameters for maximum compatibility
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- 1. USER ROLES TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `user_roles`;
CREATE TABLE `user_roles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `role_name` VARCHAR(50) NOT NULL UNIQUE,
  `description` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `user_roles` (`id`, `role_name`, `description`) VALUES
(1, 'Administrator', 'Full system control, settings, user governance & database exports'),
(2, 'Service Manager', 'Workshop supervisor, job card assignments & financial reporting'),
(3, 'Senior Technician', 'Master certified diagnostic tech with repair & time tracking authority'),
(4, 'Bench Technician', 'Workbench repair tech logged into job card time clocks'),
(5, 'Inventory Specialist', 'Stock management, barcode scanning & PO reorder sheet control'),
(6, 'Front Desk Receptionist', 'Customer tool intake, digital signature capture & WhatsApp dispatches');

-- ------------------------------------------------------------
-- 2. USERS TABLE (Default Admin & Staff Accounts)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(50) NULL,
  `role_id` INT NOT NULL,
  `active_status` ENUM('Active', 'Inactive', 'On Leave') NOT NULL DEFAULT 'Active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`role_id`) REFERENCES `user_roles`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default Admin Account (Username: admin, Password: 123456)
-- Password '123456' is hashed using standard bcrypt ($2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i)
INSERT INTO `users` (`id`, `username`, `email`, `password_hash`, `full_name`, `phone`, `role_id`, `active_status`) VALUES
(1, 'admin', 'admin@autotrack.com', '$2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i', 'Master Service Admin', '+1 (555) 019-2831', 1, 'Active'),
(2, 'manager', 'manager@boschtools.com', '$2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i', 'Robert Sterling (Service Manager)', '+1 (555) 019-2832', 2, 'Active'),
(3, 'david.miller', 'david.m@boschtools.com', '$2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i', 'David Miller (Bosch Master Certified)', '+1 (555) 901-2244', 3, 'Active'),
(4, 'marcus.vance', 'marcus.v@boschtools.com', '$2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i', 'Marcus Vance (Electrical Specialist)', '+1 (555) 901-3355', 4, 'Active'),
(5, 'sarah.connor', 'sarah.c@boschtools.com', '$2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i', 'Sarah Connor (Pneumatic & SDS Tech)', '+1 (555) 901-4466', 4, 'Active'),
(6, 'alex.rivera', 'alex.r@boschtools.com', '$2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i', 'Alex Rivera (Power Tools Tech)', '+1 (555) 901-5577', 4, 'Active');

-- ------------------------------------------------------------
-- 3. BUSINESS SETTINGS TABLE
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
  `require_signature` TINYINT(1) NOT NULL DEFAULT 1,
  `auto_daily_backup_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `auto_daily_backup_destination` VARCHAR(50) NOT NULL DEFAULT 'localStorage',
  `last_auto_backup_date` DATE NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `business_settings` (`id`, `center_name`, `address`, `phone`, `email`, `tax_rate`, `labor_rate`, `job_card_prefix`, `deduct_stock_on`, `require_signature`, `auto_daily_backup_enabled`, `auto_daily_backup_destination`) VALUES
(1, 'BOSCH Authorised Power Tools Service Center', 'Industrial Estate, Bay 4, Workshop Division', '+1 (555) 019-2831', 'service@boschtools.com', 10.00, 45.00, 'BOSCH-2026-', 'InService', 1, 1, 'localStorage');

-- ------------------------------------------------------------
-- 4. CUSTOM FIELDS CONFIGURATION TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `custom_fields`;
CREATE TABLE `custom_fields` (
  `id` VARCHAR(64) PRIMARY KEY,
  `label` VARCHAR(100) NOT NULL,
  `field_key` VARCHAR(100) NOT NULL UNIQUE,
  `data_type` ENUM('text', 'number', 'select', 'date', 'boolean', 'textarea') NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `required` TINYINT(1) NOT NULL DEFAULT 0,
  `placeholder` VARCHAR(255) NULL,
  `options_json` JSON NULL,
  `is_system` TINYINT(1) NOT NULL DEFAULT 0,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `custom_fields` (`id`, `label`, `field_key`, `data_type`, `category`, `required`, `placeholder`, `is_system`, `enabled`) VALUES
('sys-cust-1', 'Customer Full Name', 'customerName', 'text', 'Customer Information', 1, 'e.g. Apex Construction', 1, 1),
('sys-cust-2', 'Customer Mobile Phone', 'customerPhone', 'text', 'Customer Information', 1, '+1 (555) 000-0000', 1, 1),
('sys-tool-1', 'Tool Model Number', 'modelNumber', 'text', 'Tool & Device Details', 1, 'e.g. GBH 2-26 DFR', 1, 1),
('sys-tool-2', 'Tool Serial Number', 'serialNumber', 'text', 'Tool & Device Details', 1, 'SN-3611B54300', 1, 1),
('sys-srv-1', 'Customer Grievance Category', 'grievanceCategory', 'select', 'Grievances & Service', 1, 'Select grievance category', 1, 1),
('sys-srv-2', 'Pre-Approved Cost Limit ($)', 'preApprovedLimit', 'number', 'Workshop & Billing', 0, '50.00', 1, 1);

-- ------------------------------------------------------------
-- 5. SPARE PARTS INVENTORY TABLE (~1,000 SKUs Capacity)
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `inventory_items` (`id`, `sku`, `barcode`, `name`, `category`, `brand`, `compatible_models`, `unit_price`, `cost_price`, `stock_qty`, `min_stock_threshold`, `unit`, `bin_location`, `last_restocked`) VALUES
('item-1001', 'BRSH-1001', '3165141001', 'Bosch GBH 2-26 Auto-Stop Carbon Brush Pair', 'Carbon Brushes & Caps', 'Bosch Genuine Spare Parts', 'Bosch GBH 2-26, GBH 2-28', 12.50, 7.50, 45, 5, 'sets', 'Bin A-01', '2026-11-05'),
('item-1002', 'BRSH-1002', '3165141002', 'Bosch GWS 7-115 Angle Grinder Carbon Brush Set', 'Carbon Brushes & Caps', 'Bosch Genuine Spare Parts', 'Bosch GWS 7-115, GWS 900', 10.00, 5.50, 3, 10, 'sets', 'Bin A-02', '2026-11-02'),
('item-1003', 'ARM-1009', '3165141003', 'Bosch GBH 2-26 DFR Armature Assembly 230V', 'Armatures & Rotors 230V/18V', 'Bosch Heavy Duty OEM', 'Bosch GBH 2-26 DFR', 48.00, 32.00, 2, 5, 'pcs', 'Bin A-12', '2026-11-05'),
('item-1004', 'SWT-4001', '3165141004', 'Bosch GWS Angle Grinder Switch Assembly', 'Switches & Speed Modules', 'Bosch Genuine Spare Parts', 'Bosch GWS 900, GWS 7-115', 14.00, 8.00, 18, 4, 'pcs', 'Bin B-04', '2026-11-05'),
('item-1005', 'CHK-1005', '3165141005', 'Bosch GBH 2-26 DFR Quick Change SDS Chuck', 'SDS Chucks & Tool Holders', 'Bosch Heavy Duty OEM', 'Bosch GBH 2-26 DFR', 35.00, 22.00, 8, 3, 'pcs', 'Bin C-02', '2026-11-05'),
('item-1006', 'GRS-3001', '3165141006', 'Bosch FT 1 V 4 Heavy Duty Grease Tube 100g', 'Gears, Pinions & Grease', 'Bosch Genuine Spare Parts', 'Universal Bosch SDS Tools', 9.50, 5.00, 2, 10, 'pcs', 'Bin D-01', '2026-11-05'),
('item-1007', 'CORD-5002', '3165141007', 'Industrial Rubber Power Cord 2x1.5mm 4m', 'Cables & Strain Relief', 'Universal OEM Parts', 'Universal 230V Tools', 11.50, 6.00, 22, 5, 'pcs', 'Bin E-03', '2026-11-01');

-- ------------------------------------------------------------
-- 6. SERVICE JOB CARDS TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `job_cards`;
CREATE TABLE `job_cards` (
  `id` VARCHAR(64) PRIMARY KEY,
  `customer_name` VARCHAR(255) NOT NULL,
  `customer_company` VARCHAR(255) NULL,
  `customer_phone` VARCHAR(50) NOT NULL,
  `customer_email` VARCHAR(100) NULL,
  `gst_or_tax_id` VARCHAR(50) NULL,
  
  -- Tool Specifications
  `tool_brand` VARCHAR(100) NOT NULL,
  `tool_category` VARCHAR(100) NOT NULL,
  `tool_model_number` VARCHAR(100) NOT NULL,
  `tool_serial_number` VARCHAR(100) NOT NULL,
  `tool_voltage_rating` VARCHAR(50) NOT NULL,
  `tool_warranty_status` VARCHAR(100) NOT NULL,
  `tool_physical_condition` TEXT NULL,
  `tool_accessories_json` JSON NULL,

  -- Grievance & Requirements
  `grievance_category` VARCHAR(150) NOT NULL,
  `detailed_complaint` TEXT NOT NULL,
  `service_type` VARCHAR(100) NOT NULL,
  `pre_approved_limit` DECIMAL(10,2) NOT NULL DEFAULT 50.00,

  -- Status & Technician
  `intake_date` VARCHAR(50) NOT NULL,
  `promised_completion` VARCHAR(50) NOT NULL,
  `status` ENUM('Intake', 'Diagnosis', 'Awaiting Approval', 'Awaiting Parts', 'In Repair', 'In Service', 'Ready for Pickup', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Intake',
  `priority` ENUM('Routine', 'Urgent', 'Emergency') NOT NULL DEFAULT 'Routine',
  `technician` VARCHAR(100) NOT NULL,
  `diagnostic_notes` TEXT NULL,

  -- Financials
  `labor_hours` DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  `labor_rate` DECIMAL(10,2) NOT NULL DEFAULT 45.00,
  `discount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `tax_rate` DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,

  `customer_signature` LONGTEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_customer_phone` (`customer_phone`),
  INDEX `idx_status` (`status`),
  INDEX `idx_technician` (`technician`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `job_cards` (`id`, `customer_name`, `customer_company`, `customer_phone`, `customer_email`, `gst_or_tax_id`, `tool_brand`, `tool_category`, `tool_model_number`, `tool_serial_number`, `tool_voltage_rating`, `tool_warranty_status`, `tool_physical_condition`, `tool_accessories_json`, `grievance_category`, `detailed_complaint`, `service_type`, `pre_approved_limit`, `intake_date`, `promised_completion`, `status`, `priority`, `technician`, `diagnostic_notes`, `labor_hours`, `labor_rate`, `discount`, `tax_rate`, `total_amount`) VALUES
('BOSCH-2026-0041', 'Apex Industrial Construction Ltd', 'Apex Industrial', '+1 (555) 234-5678', 'service@apexconstruct.com', 'TAX-8920194-US', 'Bosch Professional', 'Rotary Hammer / SDS', 'GBH 2-26 DFR Professional', 'SN-3611B54300', '230V AC (800W)', 'Bosch Heavy Duty 3-Year Extended', 'Heavy Jobsite Dust, Cable Scratched', '["Auxiliary Handle", "Depth Stop Rod", "SDS Quick Change Chuck"]', 'Motor Sparking / Excessive Smoke', 'Heavily sparking inside motor housing under load. Intermittent hammer impact loss during overhead drilling.', 'Diagnostic & Repair', 75.00, '2026-11-10 09:15', '2026-11-11 16:00', 'In Service', 'Urgent', 'David Miller (Bosch Master Certified)', 'Armature commutator segments pitted and burnt. Carbon brushes worn past auto-stop limit line.', 1.50, 45.00, 5.00, 10.00, 154.00),
('BOSCH-2026-0042', 'Marcus Vance Mechanics', 'Vance Repairs', '+1 (555) 876-5432', 'marcus@vancemechanics.com', NULL, 'Bosch Professional', 'Angle Grinder', 'GWS 900-100 Professional', 'SN-3601C96000', '230V AC (900W)', 'Standard 1-Year', 'Metal Shavings in Guard, Cord Pinched', '["Grinding Guard 100mm", "Pin Spanner Wrench"]', 'No Power / Dead Switch', 'Angle grinder does not turn on when switch is pushed. Cable strain relief is loose.', 'Standard Overhaul', 40.00, '2026-11-11 08:30', '2026-11-11 14:00', 'Ready for Pickup', 'Routine', 'Alex Rivera (Power Tools Tech)', 'Mains cable wire broken inside strain relief boot. On/Off toggle switch contacts oxidized.', 1.00, 45.00, 0.00, 10.00, 77.55);

-- ------------------------------------------------------------
-- 7. JOB CARD PARTS LINK TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `job_card_parts`;
CREATE TABLE `job_card_parts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `job_card_id` VARCHAR(64) NOT NULL,
  `part_id` VARCHAR(64) NOT NULL,
  `sku` VARCHAR(50) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `unit_price` DECIMAL(10,2) NOT NULL,
  `quantity` INT NOT NULL,
  `total` DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (`job_card_id`) REFERENCES `job_cards`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `job_card_parts` (`job_card_id`, `part_id`, `sku`, `name`, `unit_price`, `quantity`, `total`) VALUES
('BOSCH-2026-0041', 'item-1001', 'BRSH-1001', 'Bosch GBH 2-26 Auto-Stop Carbon Brush Pair', 12.50, 1, 12.50),
('BOSCH-2026-0041', 'item-1003', 'ARM-1009', 'Bosch GBH 2-26 DFR Armature Assembly 230V', 48.00, 1, 48.00),
('BOSCH-2026-0041', 'item-1006', 'GRS-3001', 'Bosch FT 1 V 4 Heavy Duty Grease Tube 100g', 9.50, 1, 9.50),
('BOSCH-2026-0042', 'item-1004', 'SWT-4001', 'Bosch GWS Angle Grinder Switch Assembly', 14.00, 1, 14.00),
('BOSCH-2026-0042', 'item-1007', 'CORD-5002', 'Industrial Rubber Power Cord 2x1.5mm 4m', 11.50, 1, 11.50);

-- ------------------------------------------------------------
-- 8. TECHNICIAN BENCH TIME LOGS TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `technician_time_logs`;
CREATE TABLE `technician_time_logs` (
  `id` VARCHAR(64) PRIMARY KEY,
  `job_card_id` VARCHAR(64) NOT NULL,
  `user_id` INT NULL,
  `technician_name` VARCHAR(100) NOT NULL,
  `clock_in_time` DATETIME NOT NULL,
  `clock_out_time` DATETIME NULL,
  `duration_minutes` INT NULL,
  `duration_hours` DECIMAL(5,2) NULL,
  `notes` TEXT NULL,
  `status` ENUM('ACTIVE', 'COMPLETED') NOT NULL DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`job_card_id`) REFERENCES `job_cards`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `technician_time_logs` (`id`, `job_card_id`, `user_id`, `technician_name`, `clock_in_time`, `clock_out_time`, `duration_minutes`, `duration_hours`, `notes`, `status`) VALUES
('time-101', 'BOSCH-2026-0041', 3, 'David Miller (Bosch Master Certified)', '2026-11-10 09:30:00', '2026-11-10 11:00:00', 90, 1.50, 'Motor housing teardown & armature replacement', 'COMPLETED'),
('time-102', 'BOSCH-2026-0042', 6, 'Alex Rivera (Power Tools Tech)', '2026-11-11 08:45:00', '2026-11-11 09:45:00', 60, 1.00, 'Switch contact oxidation cleaning and strain relief replacement', 'COMPLETED');

-- ------------------------------------------------------------
-- 9. RECURRING MAINTENANCE SCHEDULES TABLE
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
  INDEX `idx_maint_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `recurring_maintenance` (`id`, `customer_name`, `customer_company`, `customer_phone`, `customer_email`, `tool_brand`, `tool_category`, `model_number`, `serial_number`, `interval_months`, `last_service_date`, `next_due_date`, `status`, `recommended_service_scope`, `notes`) VALUES
('MAINT-2026-001', 'Apex Industrial Construction', 'Apex Industrial', '+1 (555) 234-5678', 'service@apexconstruct.com', 'Bosch Professional', 'Demolition Breaker', 'GSH 11 E Professional', 'SN-3611C36000', 6, '2026-05-15', '2026-11-15', 'Due Soon', 'SDS-Max Striker O-Ring overhaul & FT 1 V 4 Lithium Gearbox Lubrication', 'Heavy concrete demolition usage on commercial sites.'),
('MAINT-2026-002', 'Metro Electrical Contractors', 'Metro Electric', '+1 (555) 987-6543', 'maintenance@metroelectric.org', 'Bosch Professional', 'Rotary Hammer / SDS', 'GBH 2-28 F Professional', 'SN-3611B67000', 3, '2026-08-01', '2026-11-01', 'Overdue', 'Auto-Stop Carbon Brushes check & High Voltage Insulated Cable inspection', 'High volume conduit drilling.');

-- ------------------------------------------------------------
-- 10. CUSTOMER MESSAGING LOGS TABLE
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
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`job_card_id`) REFERENCES `job_cards`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `message_logs` (`id`, `job_card_id`, `timestamp`, `type`, `recipient_phone`, `text`, `channel`, `status`) VALUES
('msg-101', 'BOSCH-2026-0041', '2026-11-10 09:20', 'Intake', '+1 (555) 234-5678', 'Apex Industrial: Bosch GBH 2-26 DFR checked in for service under Job Card BOSCH-2026-0041. Bosch Service Hub.', 'WhatsApp', 'Delivered'),
('msg-102', 'BOSCH-2026-0042', '2026-11-11 10:15', 'Ready', '+1 (555) 876-5432', 'Marcus Vance: Your Bosch GWS 900 Angle Grinder (BOSCH-2026-0042) is READY FOR PICKUP. Total: $77.55.', 'WhatsApp', 'Sent');

-- ------------------------------------------------------------
-- 11. AUDIT LOGS TABLE (Append-Only System Ledger)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` VARCHAR(64) PRIMARY KEY,
  `job_card_id` VARCHAR(64) NULL,
  `user_name` VARCHAR(100) NOT NULL,
  `user_role` VARCHAR(50) NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `previous_state` TEXT NULL,
  `new_state` TEXT NULL,
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`job_card_id`) REFERENCES `job_cards`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `audit_logs` (`id`, `job_card_id`, `user_name`, `user_role`, `action`, `previous_state`, `new_state`) VALUES
('aud-001', 'BOSCH-2026-0041', 'Master Service Admin', 'Administrator', 'JOB_CARD_CREATED', 'None', 'Status: Intake, Customer: Apex Industrial'),
('aud-002', 'BOSCH-2026-0041', 'David Miller', 'Senior Technician', 'STATUS_SHIFT', 'Status: Intake', 'Status: In Service'),
('aud-003', 'BOSCH-2026-0042', 'Marcus Vance', 'Bench Technician', 'STOCK_RESERVED', 'Part: BRSH-1002 (Qty: 1)', 'Reserved in Workshop Shelf B-04');

-- Re-enable Foreign Key Checks
SET FOREIGN_KEY_CHECKS = 1;
