# BOSCH AUTHORISED SERVICE CENTER & POWER TOOLS HUB
## System Setup, Deployment, Database & Maintenance Guide
**Version 2.6 (2026 Enterprise Edition) · Administrator & DevOps Technical Operations Manual**

---

### TABLE OF CONTENTS
1. [Overview & Prerequisites](#1-overview--prerequisites)
2. [Environment Variables & Credentials Setup](#2-environment-variables--credentials-setup)
   - 2.1 Gemini 3.8 Flash AI Key Setup
   - 2.2 Twilio SMS API Credentials Setup
   - 2.3 Twilio WhatsApp & Meta WhatsApp Cloud API Setup
3. [Local Development & Full-Stack Server Launch](#3-local-development--full-stack-server-launch)
4. [MySQL Database Provisioning, Schema & Data Import](#4-mysql-database-provisioning-schema--data-import)
   - 4.1 Database Architecture & DDL Table Inventory
   - 4.2 Executing `database.sql` Import (MySQL 8.0+, MariaDB & Cloud SQL)
   - 4.3 Default Administrator Login Credentials
   - 4.4 Validating SQL Syntax via Parser Script
5. [Production Build & Server Deployment](#5-production-build--server-deployment)
6. [System Maintenance, Backups & Disaster Recovery](#6-system-maintenance-backups--disaster-recovery)
   - 6.1 Automatic Daily Snapshots & JSON Backups
   - 6.2 1-Click Dynamic MySQL Export Engine
   - 6.3 Disaster Recovery & Database Restoration Protocol
7. [System Diagnostics, Health Checks & Troubleshooting](#7-system-diagnostics-health-checks--troubleshooting)

---

### 1. OVERVIEW & PREREQUISITES

This guide provides technical installation, database initialization, API configuration, production deployment, and maintenance procedures for system administrators, DevOps engineers, and IT leads managing the **Bosch Authorised Service Center & Power Tools Hub**.

#### Minimum System Prerequisites:
- **Node.js**: `v18.x` or `v20.x LTS` installed (`node -v`).
- **Package Manager**: `npm` v9+ or `bun`.
- **Database Engine** *(Optional for local database hosting)*:
  - **MySQL 8.0+**
  - **MariaDB 10.5+**
  - **GCP Cloud SQL (MySQL Instance)**
- **Operating System**: Linux (Ubuntu 22.04 LTS / Debian 12 recommended), macOS Sonoma+, or Windows Server 2022.

---

### 2. ENVIRONMENT VARIABLES & CREDENTIALS SETUP

The system uses environment variables configured in `.env` for API integrations, authentication, and service endpoints.

Copy `.env.example` to create your active `.env` file:
```bash
cp .env.example .env
```

#### 2.1 Gemini 3.8 Flash AI Key Setup
Required for server-side AI fault diagnosis, bench chatbot responses, customer message polishing, and inventory reorder recommendations.

1. Obtain a Gemini API Key from Google AI Studio.
2. Set the key in `.env`:
```env
GEMINI_API_KEY="AIzaSyYourSecretGeminiKeyHere"
```

#### 2.2 Twilio SMS API Credentials Setup
Optional. Enables direct server-side SMS delivery to customer mobile devices.

1. Create a Twilio Account at [https://console.twilio.com](https://console.twilio.com).
2. Obtain your **Account SID**, **Auth Token**, and **Twilio Phone Number**.
3. Add to `.env`:
```env
TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_AUTH_TOKEN="your_twilio_auth_token_here"
TWILIO_PHONE_NUMBER="+18005550199"
```

#### 2.3 Twilio WhatsApp & Meta WhatsApp Cloud API Setup
Optional. Enables automated WhatsApp customer dispatch via API.

- **Option A: Twilio WhatsApp API**:
  ```env
  TWILIO_WHATSAPP_NUMBER="+14155238886" # Or "whatsapp:+14155238886"
  ```

- **Option B: Meta WhatsApp Cloud API**:
  ```env
  WHATSAPP_CLOUD_API_TOKEN="EAAGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  WHATSAPP_PHONE_NUMBER_ID="123456789012345"
  ```

*Note: If messaging keys are omitted, the application automatically falls back to native device SMS links (`sms:`) and 1-click WhatsApp Web deep links (`wa.me/`).*

---

### 3. LOCAL DEVELOPMENT & FULL-STACK SERVER LAUNCH

The project runs an Express backend server (`server.ts`) with Vite SPA middleware mounted in development mode on Port 3000.

#### 1. Install Dependencies:
```bash
npm install
```

#### 2. Launch Development Server:
```bash
npm run dev
```
- Access the web interface at: `http://localhost:3000`
- The Express server proxy endpoints (`/api/ai/*` and `/api/messaging/*`) and Vite HMR assets serve concurrently on port 3000.

---

### 4. MYSQL DATABASE PROVISIONING, SCHEMA & DATA IMPORT

The repository contains a 100% MySQL 8.0+, MariaDB 10.5+, and Cloud SQL compatible database script located at `/database.sql`.

#### 4.1 Database Architecture & DDL Table Inventory

| Table Name | Description | Primary Key | Foreign Keys & Cascades |
| :--- | :--- | :--- | :--- |
| `user_roles` | System authorization tiers (1=Admin to 6=Front Desk) | `role_id` | N/A |
| `users` | Staff accounts, emails, password hashes, status | `user_id` | `role_id` -> `user_roles(role_id)` |
| `business_settings` | Global shop configuration, tax, labor rates, backups | `setting_key` | N/A |
| `custom_fields` | Dynamic form field definitions for Job Cards & Inventory | `field_id` | N/A |
| `inventory_items` | 1,000 spare parts SKUs, stock levels, bin locations | `item_id` | N/A (Indexed by `sku`) |
| `job_cards` | Repair tickets, customer details, status, AI summaries | `job_id` | `technician_id` -> `users(user_id)` |
| `job_card_parts` | Parts consumed per job card with unit prices | `id` | `job_id` -> `job_cards(job_id)` ON DELETE CASCADE |
| `technician_time_logs` | Clock-in/out timestamps and labor durations | `log_id` | `job_id` -> `job_cards(job_id)` ON DELETE CASCADE |
| `recurring_maintenance` | Scheduled overhaul intervals and due dates | `schedule_id` | N/A |
| `message_logs` | Customer SMS/WhatsApp dispatch audit log | `log_id` | `job_id` -> `job_cards(job_id)` ON DELETE CASCADE |

#### 4.2 Executing `database.sql` Import (MySQL 8.0+, MariaDB & Cloud SQL)

To create the database and import schema and seed data on a MySQL server:

##### Method A: MySQL Command Line (CLI)
```bash
# 1. Login to MySQL CLI
mysql -u root -p

# 2. Create the database
CREATE DATABASE IF NOT EXISTS bosch_service_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;

# 3. Import database.sql
mysql -u root -p bosch_service_db < database.sql
```

##### Method B: GCP Cloud SQL MySQL Import
```bash
gcloud sql import sql my-cloudsql-instance gs://my-bucket/database.sql --database=bosch_service_db
```

#### 4.3 Default Administrator Login Credentials
The seed data includes a pre-configured Administrator account:
- **Username**: `admin`
- **Password**: `123456`
- **Password Hash (Bcrypt)**: `$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW`
- **Role**: `Administrator` (Full access to all system modules, AI diagnostics, settings, and database backups)

#### 4.4 Validating SQL Syntax via Parser Script
To verify that `database.sql` contains zero syntax errors prior to importing:

```bash
node scripts/validate_sql.js
```
*Output:*
```
Reading database.sql...
Splitting SQL statements...
Total SQL statements found: 34
Validating statements for MySQL 8.0+ / MariaDB syntax compliance...
SUCCESS: All 34 SQL statements parsed cleanly with 0 syntax errors!
```

---

### 5. PRODUCTION BUILD & SERVER DEPLOYMENT

For production deployment (Docker, GCP Cloud Run, AWS EC2, or Linux VPS):

#### 1. Compile Vite Client Assets:
```bash
npm run build
```
Generates production web assets under `/dist`.

#### 2. Start Production Express Server:
```bash
npm start
```
Runs `node server.ts` serving static `/dist` client assets alongside backend `/api/*` endpoints on Port 3000.

#### 3. Production `package.json` Scripts Reference:
```json
{
  "scripts": {
    "dev": "tsx server.ts",
    "build": "vite build",
    "start": "node server.ts",
    "lint": "tsc --noEmit"
  }
}
```

---

### 6. SYSTEM MAINTENANCE, BACKUPS & DISASTER RECOVERY

#### 6.1 Automatic Daily Snapshots & JSON Backups
1. Log in as Administrator -> Navigate to **Settings / System Transition** -> **Sub-Tab 3: System Business Rules**.
2. Enable **Automatic Daily Database Backups**.
3. Select Backup Destination:
   - `LocalStorage Snapshot`: Maintains rolling client snapshots.
   - `Downloadable JSON File`: Triggers an automatic `.json` backup file download on first daily login.
   - `Both`: Executes both snapshot mechanisms.

#### 6.2 1-Click Dynamic MySQL Export Engine
At any time, administrators can export the active operational state into a full MySQL `.sql` script:
- Go to **1,000 SKUs** or **Settings / System Transition** -> **Database Backup & Sync**.
- Click **`Export Local MySQL DB (.sql)`**.
- Downloads `bosch_service_db_local_deploy.sql` containing current tables, job cards, inventory stock levels, time logs, and settings.

#### 6.3 Disaster Recovery & Database Restoration Protocol
In the event of browser storage clearance or database corruption:
1. Locate the latest `bosch_service_db_local_deploy.sql` or JSON backup.
2. In MySQL, re-import the `.sql` dump:
   ```bash
   mysql -u root -p bosch_service_db < bosch_service_db_local_deploy.sql
   ```
3. In the application, click **`Reset to Sample State`** or restore from JSON backup to re-populate client state.

---

### 7. SYSTEM DIAGNOSTICS, HEALTH CHECKS & TROUBLESHOOTING

#### Health Check Endpoints:

| Endpoint | Method | Purpose | Expected Result |
| :--- | :--- | :--- | :--- |
| `/api/messaging/status` | `GET` | Verifies Twilio SMS & WhatsApp API credentials | `{"twilioSmsConfigured": boolean, "twilioWhatsAppConfigured": boolean, ...}` |
| `/api/ai/diagnose` | `POST` | Validates Gemini API key connection | Returns structured JSON diagnosis object |
| `/api/ai/repair-chat` | `POST` | Tests interactive bench chatbot connection | Returns `{ "reply": "..." }` |

#### Diagnostic Commands:
- **Validate TypeScript Code & Imports**:
  ```bash
  npm run lint
  ```
- **Validate SQL Dump Integrity**:
  ```bash
  node scripts/validate_sql.js
  ```

---
*Setup and Maintenance Manual compiled for Bosch Authorised Service Hub Operations.*
