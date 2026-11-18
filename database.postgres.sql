-- ============================================================
-- AUTOTRACK PRO - SERVICE HUB & POWER TOOLS WORKSHOP DATABASE
-- Target Engine: PostgreSQL 16+ / Cloud SQL for PostgreSQL
-- Script Name: database.postgres.sql
-- Description: Complete DDL Schema & Demonstration Seed Data (11 Tables)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;

-- Drop existing tables in dependency order for repeatable test setup
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS message_logs CASCADE;
DROP TABLE IF EXISTS recurring_maintenance CASCADE;
DROP TABLE IF EXISTS technician_time_logs CASCADE;
DROP TABLE IF EXISTS job_card_parts CASCADE;
DROP TABLE IF EXISTS job_cards CASCADE;
DROP TABLE IF EXISTS inventory_items CASCADE;
DROP TABLE IF EXISTS custom_fields CASCADE;
DROP TABLE IF EXISTS business_settings CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;

-- ------------------------------------------------------------
-- 1. USER ROLES TABLE
-- ------------------------------------------------------------
CREATE TABLE user_roles (
  id SERIAL PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO user_roles (id, role_name, description) VALUES
(1, 'Administrator', 'Full system control, settings, user governance & database exports'),
(2, 'Service Manager', 'Workshop supervisor, job card assignments & financial reporting'),
(3, 'Senior Technician', 'Master certified diagnostic tech with repair & time tracking authority'),
(4, 'Bench Technician', 'Workbench repair tech logged into job card time clocks'),
(5, 'Inventory Specialist', 'Stock management, barcode scanning & PO reorder sheet control'),
(6, 'Front Desk Receptionist', 'Client tool intake, digital signature capture & WhatsApp dispatches');

SELECT setval('user_roles_id_seq', (SELECT MAX(id) FROM user_roles));

-- ------------------------------------------------------------
-- 2. USERS TABLE (Demo Admin & Staff Accounts)
-- ------------------------------------------------------------
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(50),
  role_id INT NOT NULL REFERENCES user_roles(id) ON DELETE CASCADE,
  active_status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (active_status IN ('Active', 'Inactive', 'On Leave')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Demo Admin Account (Username: admin, Password: 123456)
INSERT INTO users (id, username, email, password_hash, full_name, phone, role_id, active_status) VALUES
(1, 'admin', 'admin@autotrack.com', '$2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i', 'Master Service Admin', '+1 (555) 019-2831', 1, 'Active'),
(2, 'manager', 'manager@boschtools.com', '$2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i', 'Robert Sterling (Service Manager)', '+1 (555) 019-2832', 2, 'Active'),
(3, 'david.miller', 'david.m@boschtools.com', '$2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i', 'David Miller (Bosch Master Certified)', '+1 (555) 901-2244', 3, 'Active'),
(4, 'marcus.vance', 'marcus.v@boschtools.com', '$2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i', 'Marcus Vance (Electrical Specialist)', '+1 (555) 901-3355', 4, 'Active'),
(5, 'sarah.connor', 'sarah.c@boschtools.com', '$2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i', 'Sarah Connor (Pneumatic & SDS Tech)', '+1 (555) 901-4466', 4, 'Active'),
(6, 'alex.rivera', 'alex.r@boschtools.com', '$2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i', 'Alex Rivera (Power Tools Tech)', '+1 (555) 901-5577', 4, 'Active');

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- ------------------------------------------------------------
-- 3. BUSINESS SETTINGS TABLE
-- ------------------------------------------------------------
CREATE TABLE business_settings (
  id SERIAL PRIMARY KEY,
  center_name VARCHAR(255) NOT NULL DEFAULT 'BOSCH Authorised Service Center',
  address TEXT NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  labor_rate NUMERIC(10,2) NOT NULL DEFAULT 45.00,
  job_card_prefix VARCHAR(20) NOT NULL DEFAULT 'BOSCH-2026-',
  deduct_stock_on VARCHAR(20) NOT NULL DEFAULT 'InService' CHECK (deduct_stock_on IN ('Approval', 'InService', 'Completion')),
  require_signature BOOLEAN NOT NULL DEFAULT TRUE,
  auto_send_feedback_sms BOOLEAN NOT NULL DEFAULT TRUE,
  auto_daily_backup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_daily_backup_destination VARCHAR(50) NOT NULL DEFAULT 'localStorage',
  last_auto_backup_date DATE,
  analytics_metrics JSONB NOT NULL DEFAULT '{"activeJobs":true,"lowInventory":true,"revenue":true,"todaysAppointments":true,"avgRepairTime":true,"topGrievance":true,"technicianPerformance":true,"categoryVolume":true}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO business_settings (id, center_name, address, phone, email, tax_rate, labor_rate, job_card_prefix, deduct_stock_on, require_signature, auto_send_feedback_sms, auto_daily_backup_enabled, auto_daily_backup_destination) VALUES
(1, 'BOSCH Authorised Power Tools Service Center', 'Industrial Estate, Bay 4, Workshop Division', '+1 (555) 019-2831', 'service@boschtools.com', 10.00, 45.00, 'BOSCH-2026-', 'InService', TRUE, TRUE, TRUE, 'localStorage');

SELECT setval('business_settings_id_seq', (SELECT MAX(id) FROM business_settings));

-- ------------------------------------------------------------
-- 4. CUSTOM FIELDS CONFIGURATION TABLE
-- ------------------------------------------------------------
CREATE TABLE custom_fields (
  id VARCHAR(64) PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  field_key VARCHAR(100) NOT NULL UNIQUE,
  data_type VARCHAR(20) NOT NULL CHECK (data_type IN ('text', 'number', 'select', 'date', 'boolean', 'textarea')),
  category VARCHAR(100) NOT NULL,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  placeholder VARCHAR(255),
  options_json JSONB,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO custom_fields (id, label, field_key, data_type, category, required, placeholder, is_system, enabled) VALUES
('sys-cust-1', 'Client Full Name', 'customerName', 'text', 'Client Information', TRUE, 'e.g. Apex Construction', TRUE, TRUE),
('sys-cust-2', 'Client Mobile Phone', 'customerPhone', 'text', 'Client Information', TRUE, '+1 (555) 000-0000', TRUE, TRUE),
('sys-tool-1', 'Tool Model Number', 'modelNumber', 'text', 'Tool & Device Details', TRUE, 'e.g. GBH 2-26 DFR', TRUE, TRUE),
('sys-tool-2', 'Tool Serial Number', 'serialNumber', 'text', 'Tool & Device Details', TRUE, 'SN-3611B54300', TRUE, TRUE),
('sys-srv-1', 'Client Grievance Category', 'grievanceCategory', 'select', 'Grievances & Service', TRUE, 'Select grievance category', TRUE, TRUE),
('sys-srv-2', 'Pre-Approved Cost Limit ($)', 'preApprovedLimit', 'number', 'Workshop & Billing', FALSE, '50.00', TRUE, TRUE);

-- ------------------------------------------------------------
-- 5. SPARE PARTS INVENTORY TABLE (~1,000 SKUs Capacity)
-- ------------------------------------------------------------
CREATE TABLE inventory_items (
  id VARCHAR(64) PRIMARY KEY,
  sku VARCHAR(50) NOT NULL UNIQUE,
  barcode VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  brand VARCHAR(100) NOT NULL,
  compatible_models VARCHAR(255) NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  cost_price NUMERIC(10,2) NOT NULL,
  stock_qty INT NOT NULL DEFAULT 0,
  min_stock_threshold INT NOT NULL DEFAULT 5,
  unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
  bin_location VARCHAR(50) NOT NULL,
  last_restocked DATE NOT NULL
);

CREATE INDEX idx_inv_category ON inventory_items (category);
CREATE INDEX idx_inv_sku ON inventory_items (sku);
CREATE INDEX idx_inv_stock_alert ON inventory_items (stock_qty, min_stock_threshold);

INSERT INTO inventory_items (id, sku, barcode, name, category, brand, compatible_models, unit_price, cost_price, stock_qty, min_stock_threshold, unit, bin_location, last_restocked) VALUES
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
CREATE TABLE job_cards (
  id VARCHAR(64) PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  customer_company VARCHAR(255),
  customer_phone VARCHAR(50) NOT NULL,
  customer_email VARCHAR(100),
  gst_or_tax_id VARCHAR(50),
  tool_brand VARCHAR(100) NOT NULL,
  tool_category VARCHAR(100) NOT NULL,
  tool_model_number VARCHAR(100) NOT NULL,
  tool_serial_number VARCHAR(100) NOT NULL,
  tool_voltage_rating VARCHAR(50) NOT NULL,
  tool_warranty_status VARCHAR(100) NOT NULL,
  tool_physical_condition TEXT,
  tool_accessories_json JSONB,
  grievance_category VARCHAR(150) NOT NULL,
  detailed_complaint TEXT NOT NULL,
  service_type VARCHAR(100) NOT NULL,
  pre_approved_limit NUMERIC(10,2) NOT NULL DEFAULT 50.00,
  intake_date VARCHAR(50) NOT NULL,
  promised_completion VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Intake' CHECK (status IN ('Intake', 'Diagnosis', 'Awaiting Approval', 'Awaiting Parts', 'In Repair', 'In Service', 'Ready for Pickup', 'Completed', 'Cancelled')),
  priority VARCHAR(20) NOT NULL DEFAULT 'Routine' CHECK (priority IN ('Routine', 'Urgent', 'Emergency')),
  technician VARCHAR(100) NOT NULL,
  diagnostic_notes TEXT,
  labor_hours NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  labor_rate NUMERIC(10,2) NOT NULL DEFAULT 45.00,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  public_access_token VARCHAR(128) UNIQUE,
  stock_deducted_at VARCHAR(40),
  parts_deducted_json JSONB,
  custom_field_values_json JSONB,
  feedback_sms_sent_at VARCHAR(40),
  customer_feedback_rating SMALLINT CHECK (customer_feedback_rating BETWEEN 1 AND 5),
  customer_feedback_comment TEXT,
  customer_feedback_submitted_at TIMESTAMPTZ,
  customer_feedback_json JSONB,
  customer_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_customer_phone ON job_cards (customer_phone);
CREATE INDEX idx_job_status ON job_cards (status);
CREATE INDEX idx_job_technician ON job_cards (technician);

INSERT INTO job_cards (id, customer_name, customer_company, customer_phone, customer_email, gst_or_tax_id, tool_brand, tool_category, tool_model_number, tool_serial_number, tool_voltage_rating, tool_warranty_status, tool_physical_condition, tool_accessories_json, grievance_category, detailed_complaint, service_type, pre_approved_limit, intake_date, promised_completion, status, priority, technician, diagnostic_notes, labor_hours, labor_rate, discount, tax_rate, total_amount, public_access_token, stock_deducted_at, parts_deducted_json, custom_field_values_json, feedback_sms_sent_at, customer_feedback_rating, customer_feedback_comment, customer_feedback_submitted_at, customer_feedback_json) VALUES
('BOSCH-2026-0041', 'Apex Industrial Construction Ltd', 'Apex Industrial', '+1 (555) 234-5678', 'service@apexconstruct.com', 'TAX-8920194-US', 'Bosch Professional', 'Rotary Hammer / SDS', 'GBH 2-26 DFR Professional', 'SN-3611B54300', '230V AC (800W)', 'Bosch Heavy Duty 3-Year Extended', 'Heavy Jobsite Dust, Cable Scratched', '["Auxiliary Handle", "Depth Stop Rod", "SDS Quick Change Chuck"]', 'Motor Sparking / Excessive Smoke', 'Heavily sparking inside motor housing under load. Intermittent hammer impact loss during overhead drilling.', 'Diagnostic & Repair', 75.00, '2026-11-10 09:15', '2026-11-11 16:00', 'In Service', 'Urgent', 'David Miller (Bosch Master Certified)', 'Armature commutator segments pitted and burnt. Carbon brushes worn past auto-stop limit line.', 1.50, 45.00, 5.00, 10.00, 154.00, 'tok-apex-2026-0041-sec', '2026-11-10T09:25:00Z', '[{"partId":"item-1001","sku":"BRSH-1001","qty":1},{"partId":"item-1003","sku":"ARM-1009","qty":1},{"partId":"item-1006","sku":"GRS-3001","qty":1}]', NULL, NULL, NULL, NULL, NULL, NULL),
('BOSCH-2026-0042', 'Marcus Vance Mechanics', 'Vance Repairs', '+1 (555) 876-5432', 'marcus@vancemechanics.com', NULL, 'Bosch Professional', 'Angle Grinder', 'GWS 900-100 Professional', 'SN-3601C96000', '230V AC (900W)', 'Standard 1-Year', 'Metal Shavings in Guard, Cord Pinched', '["Grinding Guard 100mm", "Pin Spanner Wrench"]', 'No Power / Dead Switch', 'Angle grinder does not turn on when switch is pushed. Cable strain relief is loose.', 'Standard Overhaul', 40.00, '2026-11-11 08:30', '2026-11-11 14:00', 'Ready for Pickup', 'Routine', 'Alex Rivera (Power Tools Tech)', 'Mains cable wire broken inside strain relief boot. On/Off toggle switch contacts oxidized.', 1.00, 45.00, 0.00, 10.00, 77.55, 'tok-vance-2026-0042-sec', '2026-11-11T08:45:00Z', '[{"partId":"item-1004","sku":"SWT-4001","qty":1},{"partId":"item-1007","sku":"CORD-5002","qty":1}]', NULL, NULL, NULL, NULL, NULL, NULL),
('BOSCH-2026-0046', 'BuildCore Civil Works', 'BuildCore', '+1 (555) 602-8811', 'fleet@buildcore.com', NULL, 'Bosch Professional', 'Demolition Breaker', 'GSH 11 E Professional', 'SN-3611C36000', '230V AC (1500W)', 'Bosch Heavy Duty 3-Year Extended', 'Dusty Barrel, SDS-Max Retainer Worn', '["Chisel Case", "Auxiliary Handle"]', 'Low Impact / Weak Hammering', 'Percussion energy dropped significantly on concrete slab demolition.', 'Standard Overhaul', 120.00, '2026-11-08 10:00', '2026-11-09 17:00', 'Completed', 'Routine', 'David Miller (Bosch Master Certified)', 'Striker O-ring perished, piston barrel flushed and repacked with FT 1 V 4 grease.', 2.00, 45.00, 0.00, 10.00, 132.00, 'tok-buildcore-2026-0046-sec', NULL, NULL, NULL, '2026-11-09T17:12:00Z', 5, 'Breaker hits like factory new again. Same-day turnaround saved our slab pour schedule.', '2026-11-09T18:05:00Z', '{"rating":5,"comment":"Breaker hits like factory new again. Same-day turnaround saved our slab pour schedule.","submittedAt":"2026-11-09T18:05:00Z","channel":"SMS","customerName":"BuildCore"}');

-- ------------------------------------------------------------
-- 7. JOB CARD PARTS LINK TABLE
-- ------------------------------------------------------------
CREATE TABLE job_card_parts (
  id SERIAL PRIMARY KEY,
  job_card_id VARCHAR(64) NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  part_id VARCHAR(64) NOT NULL,
  sku VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  quantity INT NOT NULL,
  total NUMERIC(10,2) NOT NULL
);

INSERT INTO job_card_parts (job_card_id, part_id, sku, name, unit_price, quantity, total) VALUES
('BOSCH-2026-0041', 'item-1001', 'BRSH-1001', 'Bosch GBH 2-26 Auto-Stop Carbon Brush Pair', 12.50, 1, 12.50),
('BOSCH-2026-0041', 'item-1003', 'ARM-1009', 'Bosch GBH 2-26 DFR Armature Assembly 230V', 48.00, 1, 48.00),
('BOSCH-2026-0041', 'item-1006', 'GRS-3001', 'Bosch FT 1 V 4 Heavy Duty Grease Tube 100g', 9.50, 1, 9.50),
('BOSCH-2026-0042', 'item-1004', 'SWT-4001', 'Bosch GWS Angle Grinder Switch Assembly', 14.00, 1, 14.00),
('BOSCH-2026-0042', 'item-1007', 'CORD-5002', 'Industrial Rubber Power Cord 2x1.5mm 4m', 11.50, 1, 11.50);

-- ------------------------------------------------------------
-- 8. TECHNICIAN BENCH TIME LOGS TABLE
-- ------------------------------------------------------------
CREATE TABLE technician_time_logs (
  id VARCHAR(64) PRIMARY KEY,
  job_card_id VARCHAR(64) NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  technician_name VARCHAR(100) NOT NULL,
  clock_in_time TIMESTAMPTZ NOT NULL,
  clock_out_time TIMESTAMPTZ,
  duration_minutes INT,
  duration_hours NUMERIC(5,2),
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO technician_time_logs (id, job_card_id, user_id, technician_name, clock_in_time, clock_out_time, duration_minutes, duration_hours, notes, status) VALUES
('time-101', 'BOSCH-2026-0041', 3, 'David Miller (Bosch Master Certified)', '2026-11-10 09:30:00Z', '2026-11-10 11:00:00Z', 90, 1.50, 'Motor housing teardown & armature replacement', 'COMPLETED'),
('time-102', 'BOSCH-2026-0042', 6, 'Alex Rivera (Power Tools Tech)', '2026-11-11 08:45:00Z', '2026-11-11 09:45:00Z', 60, 1.00, 'Switch contact oxidation cleaning and strain relief replacement', 'COMPLETED');

-- ------------------------------------------------------------
-- 9. RECURRING MAINTENANCE SCHEDULES TABLE
-- ------------------------------------------------------------
CREATE TABLE recurring_maintenance (
  id VARCHAR(64) PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  customer_company VARCHAR(255),
  customer_phone VARCHAR(50) NOT NULL,
  customer_email VARCHAR(100),
  tool_brand VARCHAR(100) NOT NULL,
  tool_category VARCHAR(100) NOT NULL,
  model_number VARCHAR(100) NOT NULL,
  serial_number VARCHAR(100) NOT NULL,
  interval_months INT NOT NULL DEFAULT 6,
  last_service_date DATE NOT NULL,
  next_due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Upcoming' CHECK (status IN ('Upcoming', 'Due Soon', 'Overdue', 'Serviced')),
  recommended_service_scope TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maint_due_date ON recurring_maintenance (next_due_date);
CREATE INDEX idx_maint_status ON recurring_maintenance (status);

INSERT INTO recurring_maintenance (id, customer_name, customer_company, customer_phone, customer_email, tool_brand, tool_category, model_number, serial_number, interval_months, last_service_date, next_due_date, status, recommended_service_scope, notes) VALUES
('MAINT-2026-001', 'Apex Industrial Construction', 'Apex Industrial', '+1 (555) 234-5678', 'service@apexconstruct.com', 'Bosch Professional', 'Demolition Breaker', 'GSH 11 E Professional', 'SN-3611C36000', 6, '2026-05-15', '2026-11-15', 'Due Soon', 'SDS-Max Striker O-Ring overhaul & FT 1 V 4 Lithium Gearbox Lubrication', 'Heavy concrete demolition usage on commercial sites.'),
('MAINT-2026-002', 'Metro Electrical Contractors', 'Metro Electric', '+1 (555) 987-6543', 'maintenance@metroelectric.org', 'Bosch Professional', 'Rotary Hammer / SDS', 'GBH 2-28 F Professional', 'SN-3611B67000', 3, '2026-08-01', '2026-11-01', 'Overdue', 'Auto-Stop Carbon Brushes check & High Voltage Insulated Cable inspection', 'High volume conduit drilling.');

-- ------------------------------------------------------------
-- 10. CLIENT MESSAGING LOGS TABLE
-- ------------------------------------------------------------
CREATE TABLE message_logs (
  id VARCHAR(64) PRIMARY KEY,
  job_card_id VARCHAR(64) REFERENCES job_cards(id) ON DELETE CASCADE,
  timestamp VARCHAR(50) NOT NULL,
  type VARCHAR(50) NOT NULL,
  recipient_phone VARCHAR(50) NOT NULL,
  text TEXT NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('WhatsApp', 'SMS')),
  status VARCHAR(50) NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO message_logs (id, job_card_id, timestamp, type, recipient_phone, text, channel, status) VALUES
('msg-101', 'BOSCH-2026-0041', '2026-11-10 09:20', 'Intake', '+1 (555) 234-5678', 'Apex Industrial: Bosch GBH 2-26 DFR checked in for service under Job Card BOSCH-2026-0041. Bosch Service Hub.', 'WhatsApp', 'Sent'),
('msg-102', 'BOSCH-2026-0042', '2026-11-11 10:15', 'Ready', '+1 (555) 876-5432', 'Marcus Vance: Your Bosch GWS 900 Angle Grinder (BOSCH-2026-0042) is READY FOR PICKUP. Total: $77.55.', 'WhatsApp', 'Sent'),
('msg-103', 'BOSCH-2026-0046', '2026-11-09 17:12', 'Feedback', '+1 (555) 602-8811', 'Hi BuildCore Civil Works, your Bosch Professional GSH 11 E (BOSCH-2026-0046) service is complete. Rate our work & leave feedback: https://app.local/?view=customer&token=tok-buildcore-2026-0046-sec&feedback=1', 'SMS', 'Sent');

-- ------------------------------------------------------------
-- 11. AUDIT LOGS TABLE (Append-Only System Ledger)
-- ------------------------------------------------------------
CREATE TABLE audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  job_card_id VARCHAR(64) REFERENCES job_cards(id) ON DELETE CASCADE,
  user_name VARCHAR(100) NOT NULL,
  user_role VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  previous_state TEXT,
  new_state TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO audit_logs (id, job_card_id, user_name, user_role, action, previous_state, new_state) VALUES
('aud-001', 'BOSCH-2026-0041', 'Master Service Admin', 'Administrator', 'JOB_CARD_CREATED', 'None', 'Status: Intake, Client: Apex Industrial'),
('aud-002', 'BOSCH-2026-0041', 'David Miller', 'Senior Technician', 'STATUS_SHIFT', 'Status: Intake', 'Status: In Service'),
('aud-003', 'BOSCH-2026-0042', 'Marcus Vance', 'Bench Technician', 'STOCK_RESERVED', 'Part: BRSH-1002 (Qty: 1)', 'Reserved in Workshop Shelf B-04'),
('aud-004', 'BOSCH-2026-0046', 'BuildCore', 'Client Feedback Survey', 'CUSTOMER_FEEDBACK_SUBMITTED', 'No Rating Recorded', '5/5 Stars - Breaker hits like factory new again.');
