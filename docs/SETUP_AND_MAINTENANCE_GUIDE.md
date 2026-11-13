# BOSCH AUTHORISED SERVICE CENTER & POWER TOOLS HUB
## System Setup, Security Hardening, Database & Maintenance Guide
**Version 2.7 (2026 Security & Enterprise Edition) · Administrator & DevOps Operations Manual**

---

### TABLE OF CONTENTS
1. [Executive Overview & System Architecture](#1-executive-overview--system-architecture)
2. [Security Hardening & PII Protection Standards](#2-security-hardening--pii-protection-standards)
   - 2.1 Default Credentials & Mandatory Password Rotation
   - 2.2 Server-Side PII Scrubbing (`stripPII`) Before AI Inference
   - 2.3 API Rate Limiting & Abuse Prevention
   - 2.4 Append-Only Audit Ledger (`audit_logs`)
   - 2.5 Secure Public Customer Status Tokens
3. [Environment Variables & Credentials Configuration](#3-environment-variables--credentials-configuration)
4. [Local Development & Full-Stack Server Launch](#4-local-development--full-stack-server-launch)
5. [MySQL Database Provisioning, Schema & Data Import](#5-mysql-database-provisioning-schema--data-import)
   - 5.1 Database Table Inventory (11 Relational Tables)
   - 5.2 Executing `database.sql` Import (MySQL 8.0+, MariaDB & Cloud SQL)
   - 5.3 Validating SQL Syntax via AST Parser
6. [Production Build & Server Deployment](#6-production-build--server-deployment)
7. [System Maintenance, Backups & Disaster Recovery](#7-system-maintenance-backups--disaster-recovery)

---

### 1. EXECUTIVE OVERVIEW & SYSTEM ARCHITECTURE

This technical manual details the setup, security policies, database management, and deployment protocols for the **Bosch Authorised Service Center & Power Tools Hub**.

#### Multi-Counter Architecture Model:
- **Client Frontend (React 18 + Vite)**: Provides high-contrast workshop UI for counter intake, bench repair, and inventory management. LocalStorage serves as an offline-first resilient cache.
- **Express Backend Server (`server.ts`)**: Server-authoritative API proxy listening on Port 3000 handling authentication, AI inference with PII sanitization, API rate limiting, and WhatsApp/SMS messaging.
- **Host MySQL Database (`database.sql`)**: Central relational store for multi-counter workshop deployments across multiple technicians and storekeepers.

---

### 2. SECURITY HARDENING & PII PROTECTION STANDARDS

#### 2.1 Default Credentials & Mandatory Password Rotation
- **Default Admin Account**:
  - **Username**: `admin`
  - **Password**: `123456`
  - **Bcrypt Hash**: `$2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i` (Cost Factor: 10)
- **Mandatory Policy**: Upon initial deployment, administrators MUST log into the system and update default credentials. A security banner actively alerts operators in the application header until changed.

#### 2.2 Server-Side PII Scrubbing (`stripPII`) Before AI Inference
To comply with global data privacy regulations (e.g., DPDP Act, GDPR), all customer complaint descriptions pass through server-side PII scrubbing in `server.ts` before reaching external Gemini API endpoints:
- Phone numbers (`+1 555-123-4567`) -> Sanitized to `[REDACTED_PHONE]`
- Email addresses (`user@domain.com`) -> Sanitized to `[REDACTED_EMAIL]`
- Tax/GST IDs -> Sanitized to `[REDACTED_TAX_ID]`

#### 2.3 API Rate Limiting & Abuse Prevention
An in-memory sliding window rate limiter (`rateLimiter`) protects all server proxy endpoints (`/api/ai/*` and `/api/messaging/*`):
- **Rate Limit**: Maximum 50 requests per minute per IP address.
- **Response**: Returns HTTP 429 (`Too Many Requests`) if threshold is exceeded.

#### 2.4 Append-Only Audit Ledger (`audit_logs`)
Every state transition, price adjustment, diagnostic application, and stock reservation is recorded in an immutable append-only audit table (`audit_logs`):
```sql
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
);
```

#### 2.5 Secure Public Customer Status Tokens
Customers can check their tool repair progress via secure, signed token URLs (`/api/jobs/public-status?jobId=BOSCH-2026-0041&token=tok-sec`). Public views return read-only status timelines without exposing PII, internal notes, or password hashes.

---

### 3. ENVIRONMENT VARIABLES & CREDENTIALS CONFIGURATION

Copy `.env.example` to set active environment variables:
```bash
cp .env.example .env
```

```env
# GEMINI AI API KEY
GEMINI_API_KEY="AIzaSyYourSecretGeminiKeyHere"

# TWILIO SMS API INTEGRATION (Optional)
TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_AUTH_TOKEN="your_twilio_auth_token_here"
TWILIO_PHONE_NUMBER="+18005550199"
TWILIO_WHATSAPP_NUMBER="+14155238886"

# META WHATSAPP CLOUD API INTEGRATION (Optional)
WHATSAPP_CLOUD_API_TOKEN="EAAGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
WHATSAPP_PHONE_NUMBER_ID="123456789012345"
```

---

### 4. LOCAL DEVELOPMENT & FULL-STACK SERVER LAUNCH

```bash
# 1. Install dependencies
npm install

# 2. Launch Express + Vite server on Port 3000
npm run dev
```

---

### 5. MYSQL DATABASE PROVISIONING, SCHEMA & DATA IMPORT

The `/database.sql` script contains 11 executable MySQL 8.0+ / MariaDB 10.5+ / Cloud SQL statements.

#### 5.1 Table Inventory (11 Tables):
1. `user_roles`: System authorization hierarchy.
2. `users`: Staff credentials, roles, and bcrypt password hashes.
3. `business_settings`: Shop configuration, tax rates, labor pricing, backup rules.
4. `custom_fields`: Dynamic form field definitions.
5. `inventory_items`: 1,000 spare parts catalog with bin locations and reorder thresholds.
6. `job_cards`: Repair orders, customer info, tool specs, status, and diagnostic summaries.
7. `job_card_parts`: Parts consumed per ticket with price snapshot.
8. `technician_time_logs`: Clock-in/out timestamps and labor durations.
9. `recurring_maintenance`: Scheduled overhaul intervals and due dates.
10. `message_logs`: Customer SMS/WhatsApp dispatch audit log.
11. `audit_logs`: Immutable append-only system change ledger.

#### 5.2 Executing `database.sql` Import
```bash
mysql -u root -p bosch_service_db < database.sql
```

#### 5.3 Validating SQL Syntax via AST Parser
```bash
node scripts/validate_sql.js
```

---

### 6. PRODUCTION BUILD & SERVER DEPLOYMENT

```bash
# Compile client Vite SPA assets
npm run build

# Start production Express server
npm start
```

---

### 7. SYSTEM MAINTENANCE, BACKUPS & DISASTER RECOVERY

- **Automatic Daily Backups**: Enabled under **Settings / System Transition**. Supports rolling local snapshots or daily JSON downloads.
- **Dynamic MySQL Export**: Click **Export Local MySQL DB (.sql)** in Inventory or Transition views to export active state into a full `.sql` dump.

---
*Setup and Security Manual compiled for Bosch Authorised Service Hub Operations.*
