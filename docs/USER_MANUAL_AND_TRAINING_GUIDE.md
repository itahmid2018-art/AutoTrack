# BOSCH AUTHORISED SERVICE CENTER & POWER TOOLS HUB
## End-User Operating Manual, System Specifications & Training Guide
**Version 4.0 (2026 Enterprise Multi-Client, Offline PWA & Predictive Analytics Edition) · Industrial Production Release**

---

### TABLE OF CONTENTS
1. [Executive Summary & System Purpose](#1-executive-summary--system-purpose)
2. [System Architecture & Technology Stack](#2-system-architecture--technology-stack)
3. [System Requirements & Infrastructure](#3-system-requirements--infrastructure)
4. [End-User Operating Manual & Module Walkthrough](#4-end-user-operating-manual--module-walkthrough)
   - 4.1 Tool Intake, Camera Scanner & Digital Job Card Management
   - 4.2 Global Real-Time Search & Multi-Client Sync
   - 4.3 Drag-and-Drop Kanban Board
   - 4.4 Gemini AI Repair Diagnosis & Workbench Chatbot
   - 4.5 AI Predictive Inventory Reorder Recommendation Engine
   - 4.6 Technician Bench Time Tracking & Labor Accounting
   - 4.7 1,000 Spare Parts Inventory & Camera Barcode/QR Scanner
   - 4.8 Recurring Maintenance & Preventive Overhaul Servicing
   - 4.9 WhatsApp, Twilio SMS & Public Client Delivery Portal
   - 4.10 Configurable Analytics & Financial Audit CSV Reporting
   - 4.11 UI Customization, Analytics Toggles & Business Settings
   - 4.12 Automatic Daily Database Backups, PostgreSQL & MySQL Export
5. [API Integrations: Twilio SMS & Meta WhatsApp Cloud API](#5-api-integrations-twilio-sms--meta-whatsapp-cloud-api)
6. [Database Deployment: Firestore, PostgreSQL 16 & MySQL 8.0](#6-database-deployment-firestore-postgresql-16--mysql-80)
7. [System Limitations & Boundary Conditions](#7-system-limitations--boundary-conditions)
8. [Vendor & Staff Training Manual](#8-vendor--staff-training-manual)
   - 8.1 Front-Desk Receptionist Onboarding Checklist
   - 8.2 Bench Repair Technician Workflow
   - 8.3 Workshop Manager & Inventory Lead Protocols
9. [Quality Assurance & Testing Acceptance Guide](#9-quality-assurance--testing-acceptance-guide)

---

### 1. EXECUTIVE SUMMARY & SYSTEM PURPOSE

The **Bosch Authorised Service Center & Power Tools Hub** is a full-stack, multi-client service management platform built for commercial power tool repair hubs, equipment rental depots, and industrial service centers.

It digitizes tool servicing across leading brands—including **Bosch Professional**, **Bosch DIY (Green)**, **Makita**, **DeWalt**, **Milwaukee**, **Hilti**, **Metabo**, **Festool**, and **Stihl**.

#### Key Objectives & Core Capabilities:
1. **Accelerated Intake & Camera Scanning**: Complete check-in under 60 seconds with camera barcode/QR scanning (8 UI entry points), calibrated digital client signature capture, and automatic Job Card IDs (`BOSCH-2026-0041`).
2. **Real-Time Multi-Client Sync, Kanban Sync Badges & Offline Service Worker**: Powered by **Firebase Auth (Google Sign-In)** and **Cloud Firestore** (`onSnapshot` with metadata change tracking), **Express SSE/REST API** (with `VITE_API_BASE_URL` for Android Capacitor builds), per-card **Sync Status to Cloud** badges (`Synced to Cloud` / `Pending Offline Sync`), and `/sw.js` offline caching.
3. **Zero-PII Public Client Delivery Portal & Feedback**: Secret-token repair tracking (`/?view=customer&token=...` via `publicDeliveries` + SSE, or `jobId` + last-4 phone verification) shows repair stages and collects post-service 1–5 star feedback (`&feedback=1`) without exposing client phone numbers, email, or internal notes.
4. **Server-Side Gemini AI Diagnosis & Vision**: Uses `@google/genai` for repair troubleshooting, spare-part matching, response suggestions, voice transcription, and fallback serial label extraction (`/api/ai/scan-serial`).
5. **Predictive Revenue, D3.js Consumption Trends & Configurable Analytics**: Includes Recharts `LineChart` monthly revenue forecasting, **30-Day Operational Expenses vs. Labor Income** comparison bar chart, **D3.js Monthly Consumption Trends** SVG chart, CSAT analytics, and Business Settings visibility toggles across 8 core KPIs.
6. **Twilio SMS, Meta WhatsApp & Email Dispatch**: Automated completion feedback SMS triggers, server-side SMS/WhatsApp relays, and direct **Email Customer** dispatch (`POST /api/messaging/send-email` via SendGrid, Resend, or SMTP) with portal/PDF links.
7. **Bulk Job Status Updates, Draft PO PDFs, Excel/CSV Import & SQL**: Multi-select checkboxes and **Bulk Update Status** in `Service Cards`, downloadable **Draft PO PDFs** in AI Reorder Recommendations, Excel/CSV bulk inventory paste, and PostgreSQL 16 / MySQL 8.0+ schemas.

---

### 2. SYSTEM ARCHITECTURE & TECHNOLOGY STACK

```
+-----------------------------------------------------------------------+
|          MULTI-CLIENT FRONTEND (Vite 8 + React 19 + Tailwind v4)      |
|  - Desktop Web, Tablet Browsers & Android Capacitor Client           |
|  - Camera Barcode/QR Scanner (BarcodeDetector + jsQR + Gemini Vision)|
|  - Firebase Auth (Google Sign-In) + Live Firestore onSnapshot Sync   |
|  - Offline Service Worker (/sw.js Cache Storage) + TransactionalDb   |
+-----------------------------------------------------------------------+
                   |                                      |
      REST / SSE (/api/* + Bearer JWT)         Cloud Firestore Real-Time
                   v                                      v
+--------------------------------------+  +-----------------------------+
|  EXPRESS NODE 22 SERVER (server.ts)  |  |  CLOUD FIRESTORE (LIVE DB)  |
|  - Port 3000 · Rate Limit (300/min)  |  |  - Named DB:                |
|  - /api/jobs, /api/inventory, /sync  |  |    ai-studio-autotrackservice|
|  - /api/ai/* (Gemini Server Proxy)   |  |  - Zero-PII publicDeliveries|
|  - Twilio & Meta WhatsApp Proxies    |  |  - Strict firestore.rules   |
+--------------------------------------+  +-----------------------------+
                   |
                   v (Enterprise SQL Exports / Cloud SQL)
+-----------------------------------------------------------------------+
|   RELATIONAL SQL DATABASES (11 Tables + Seed Data)                    |
|   - PostgreSQL 16: /database.postgres.sql                             |
|   - MySQL 8.0+ / MariaDB: /database.sql                               |
+-----------------------------------------------------------------------+
```

#### Technical Stack Breakdown:
- **Frontend Framework**: React 19 SPA built with Vite 8 and strict TypeScript.
- **Styling Architecture**: Tailwind CSS v4 (`@import "tailwindcss";`) supporting both Dark and High-Contrast Light industrial themes (`localStorage` persisted).
- **Backend Runtime**: Node 22 Express server (`server.ts`) running on Port 3000 with Firebase Admin JWT verification, CORS support, and 300 req/min rate limiting.
- **Artificial Intelligence Engine**: `@google/genai` server proxy (`GEMINI_API_KEY`) for diagnosis, part matching, voice notes, chat, and barcode label vision.
- **Data Storage & Persistence**:
  - *Live Cloud Sync*: Cloud Firestore (`ai-studio-autotrackservice-2eac3d40-310f-46ba-a293-99682d0a94d7`).
  - *Client Offline Cache*: Synchronous `TransactionalDb` utility over `localStorage`.
  - *SQL Relational Dumps*: PostgreSQL 16 (`/database.postgres.sql`) and MySQL 8.0+ (`/database.sql`).

---

### 3. SYSTEM REQUIREMENTS & INFRASTRUCTURE

#### Client Requirements:
- **Operating System**: Windows 10/11, macOS 12+, Linux, Android 10+ (Browser or Capacitor APK), or iOS/iPadOS.
- **Browser**: Google Chrome 120+, Microsoft Edge 120+, Mozilla Firefox 120+, or Safari 17+.
- **Display Resolution**: Minimum 1280 × 720 (responsive down to tablet screens).
- **Hardware Peripherals**: Device camera (for live Barcode/QR scanning), microphone (for voice dictation), or USB/Bluetooth HID barcode scanner.

#### Server & Hosting Requirements:
- **Runtime Environment**: Node.js 22 LTS.
- **Environment Variables** (see `.env.example`):
  - `GEMINI_API_KEY`: Server-side Google Gemini API key.
  - `PORT`: Server port (default `3000`).
  - `ALLOWED_ORIGINS`: Comma-separated origins for tablet/Capacitor CORS requests.
  - `VITE_API_BASE_URL`: Backend URL injected into Android Capacitor builds so client API calls target your hosted Express server.
  - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_NUMBER` *(Optional)*.
  - `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` *(Optional)*.
  - `SENDGRID_API_KEY`, `RESEND_API_KEY`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` *(Optional email relay credentials)*.

---

### 4. END-USER OPERATING MANUAL & MODULE WALKTHROUGH

#### 4.1 Tool Intake, Camera Scanner & Digital Job Card Management
1. Click **`+ Intake Form`** in the top navigation bar.
2. **Scan Tool Barcode or QR Code**: Click `Scan Serial / QR` next to the Serial Number input to open `SerialBarcodeScannerModal`. Point the device camera at the tool barcode/QR or upload a nameplate photo (`/api/ai/scan-serial` fallback) to populate fields automatically.
3. Enter **Client Information**: Client Name, Company, Mobile Phone Number, Email Address, Tax/GST ID.
4. Enter **Tool Specifications**: Brand Vendor, Tool Category, Model Number, Serial Number, Voltage Rating, Warranty Status.
5. Select **Client Grievance Details**: Grievance Category, Detailed Complaint Description, Service Type, Pre-Approved Cost Limit.
6. Capture **Digital Signature**: Client signs directly on the touch/mouse signature canvas.
7. Click **`Submit & Generate Job Ticket`**.
8. The system assigns a Job Ticket ID (e.g., `BOSCH-2026-0041`), generates a `publicAccessToken`, syncs to Cloud Firestore, and updates the live client delivery portal.
9. **Voice Note Dictation**: Click `Record Voice Note` to transcribe spoken bench observations directly into Detailed Complaint or Internal Notes with timestamped audit entries.
10. **Technician Repair Sign-Off**: Once repairs conclude, bench technicians sign off using the HTML5 canvas signature pad before marking tickets `Completed`.
11. **Unique QR Code Receipts**: Printed PDF job cards embed a QR matrix linking directly to `/?view=customer&token=...`.

#### 4.2 Grouped Navigation, Full-Width Global Search, Recent Searches & Theme Toggle
Located in the top bar (`Header`) and the dedicated full-width search band directly beneath it:
- **Full-Width Global Search**: Spans the entire page width directly under the top header bar for instant filtering across Job Cards and 1,000 Spare Parts SKUs by Client Name, Mobile Phone Number, Job Ticket ID, Part SKU, Model Number, or Serial Number. Press `Enter` to open the top matched Job Card immediately.
- **Recent Searches Dropdown (Last 5 Job IDs)**: Focusing the empty search bar displays the last 5 opened Job Card IDs (`autotrack_recent_job_searches_v1`) so operators can jump back to recent records in one click, dismiss individual IDs (`X`), or clear history.
- **Grouped Feature Menus**: Row 2 of the top header bar organizes **Jobs & Intake**, **Inventory & Servicing**, **Messaging & Portal**, **Analytics & Team**, and **Settings & Tools** with live badge counts.
- **High-Contrast Light / Dark Theme Toggle**: Click the **Light** (`Sun`) or **Dark** (`Moon`) button in the top-right header utility bar (or inside the Client Portal header) to switch themes; preference saves automatically in `autotrack_theme_mode_v1` while printed A4 Job Cards stay on crisp white paper.
- **Global Barcode / QR Button**: Opens the camera scanner inside the search bar and routes matches to `GlobalScanResultModal`.
- **Bulk Job Status Update (`Service Cards`)**: Select multiple cards via row checkboxes or **Select All**, pick a target status, and click **Bulk Update Status** to update statuses, audit logs, and inventory stock deductions together.
- **Google Sign-In Sync**: Sign in with Google to synchronize live intakes, inventory stock counts, settings, and delivery statuses across every active operator browser and tablet within seconds.

#### 4.3 Drag-and-Drop Kanban Board & Cloud Sync Status Badges
1. Open **Jobs & Intake -> Kanban Board**.
2. Monitor the 7 workshop pipeline columns (`1. Intake` -> `2. Diagnosis` -> `3. Approval` -> `4. Awaiting Parts` -> `5. In Repair` -> `6. Ready` -> `7. Completed`) alongside the top **Cloud Sync** summary tile.
3. Inspect the **Sync Status to Cloud** badge on each job card:
   - **Synced to Cloud (Green)**: Card's current status and fields are committed in Firebase Firestore (`hasPendingWrites === false`).
   - **Pending Offline Sync (Amber)**: Card has local/offline edits queued in `autotrack_pending_cloud_sync_jobs_v1` (or in-flight writes) awaiting Firestore commit. Click **Sync** on any card (or the header sync button) when online, or let reconnect auto-flush automatically.
   - **Pending Offline Sync · Sign In**: Operator is not signed in with Google; changes are stored in `localStorage` and `/sw.js` cache until signed in.
4. Drag any job ticket card and drop it into a new column, or use quick step arrow buttons (`<` and `>`) for touch-screen operation.

#### 4.4 Gemini AI Repair Diagnosis & AI Recommended Parts
1. Open any Job Card from **`Service Cards`** or click **`Diagnose`**.
2. Click **`✨ Run Gemini AI Diagnosis`** to generate probable cause analysis, teardown steps, recommended catalog spare parts, and technical notes.
3. **AI Recommended Parts Analyzer**: Click `Recommend Parts` under the parts table to match tool models and reported complaints against catalog inventory. Click `+ Add to Job` or `Attach All Recommended Parts`.
4. **Workbench AI Diagnostic Chatbot**: Select the `💬 AI Repair Chatbot` tab to query multimeter check values or attach parts directly from assistant replies.

#### 4.5 Consumption-Based Reorder Points, AI Predictive Reorder & Draft Purchase Order PDF
1. Navigate to **`1,000 SKUs`** (`InventoryManager`). The **Inventory Notification Center** and **Reorder Point Sheet** automatically analyze non-cancelled `jobCards` part history to calculate average monthly burn rates (`avgMonthlyConsumptionRate`) and automated reorder points (`suggestedReorderPoint`).
2. Click **`Download Draft PO PDF`** directly inside the **Inventory Notification Center** or **Reorder Point Sheet** (`generatePurchaseOrderPdf`) to generate a print-ready `DRAFT PURCHASE ORDER` PDF listing every SKU currently below its automated reorder threshold.
3. Optionally expand **`✨ AI Reorder Recommendations`** -> **`Spark AI Reorder Analysis`** to correlate defect patterns and export an AI-annotated **`Download Draft PO PDF`** or **`Export AI PO CSV`**, or click **`+ Receive Restock`** to increment stock.

#### 4.6 Technician Bench Time Tracking & Workshop Capacity Scheduler
1. Click **`Analytics & Team -> Time Tracking & Shifts`** on the header menu bar.
2. **Clock In & Out**: Track active bench sessions and sync labor hours to ticket costs.
3. **Weekly Workshop Calendar & Capacity Scheduler**: Assign repair slots across Monday–Sunday, monitor weekly technician hour capacity bars, and filter by individual technician.

#### 4.7 1,000 Spare Parts Inventory, Camera Scanner & Bulk Excel/CSV Import
1. Click **`Inventory & Servicing -> Spare Parts Catalog`**.
2. Filter parts by SKU, Category, Bin Location, or Low Stock Alert.
3. **Camera Barcode & QR Scanner**: Click `Barcode / QR Scan` in the catalog toolbar or inside `Add Inventory` to locate an item or pre-fill barcode numbers using device cameras or USB HID scanners.
4. **Bulk Excel / CSV Paste Import**: Click **`Bulk Import Excel / CSV`** to paste tab-separated cells directly from Microsoft Excel or Google Sheets, upload `.csv`/`.tsv` files, or load 10 sample Bosch parts. Choose `Update + Add New` (`upsert`), `Add Qty to Stock` (`replenish`), or `New SKUs Only` (`insertOnly`), review validation rows, and apply.
5. **Quick Restock**: Click `+10` on any row to increment stock count and sync updates live.

#### 4.8 Recurring Maintenance Tracker & Bulk CSV Import
1. Click **`Inventory & Servicing -> Recurring Servicing`**.
2. Track commercial contractor equipment registered for 3, 6, or 12-month overhauls (`Upcoming`, `Due Soon`, `Overdue`) or click `Scan Tool QR` to jump to a machine's maintenance record.
3. **Bulk CSV Import Engine**: Click `Bulk Import CSV` to load `docs/samples/recurring_maintenance_standard.csv` or `recurring_maintenance_full.csv`, preview row validations, and append clean schedules to `recurring_maintenance`.
4. **CSV Export**: Click `Export CSV` to download all client schedules in RFC 4180 format.
5. Click **`+ Generate Intake Ticket`** to convert due maintenance tools into active job cards.

#### 4.9 Email Notifications, WhatsApp, Automated Feedback SMS & Client Delivery Portal
1. **Email Customer (`JobCardDetail`)**: Open any ticket and click **Email Customer** in the detail header to send repair progress updates and the direct Client Portal / PDF tracking link (`POST /api/messaging/send-email`). Outbound emails append to `messageLogs` (`channel: 'Email'`, `recipientEmail`).
2. Click **`Messaging & Portal -> WhatsApp & SMS Dispatch`** in the top header menu.
3. Select target client job ticket and optionally use **AI Response Assistant** (`Status Update`, `Pricing / Estimate`, `Completion Notice`, `Parts Delay`) or Milestone Templates (`Intake`, `Estimate`, `Ready`, `Invoice`, `Feedback`) to populate the composer.
4. Click **`Send Twilio SMS API`**, **`Send WhatsApp API`**, or open WhatsApp Web deep links (`wa.me/`).
5. **Automated Completion Feedback SMS**: When a job ticket moves to `Completed` (and **Auto-Send Customer Feedback SMS** is enabled in Business Setup), the system automatically dispatches an SMS with a direct survey link (`?token=...&feedback=1`) and opens `FeedbackSmsToast`.
6. **Public Client Delivery Portal & Survey (`CustomerView`)**: Share `/?view=customer&token=<publicAccessToken>` (or the receipt QR code). Clients can also look up by `jobId` after verifying the last 4 digits of their phone number, track live repair stages, download verified receipts, and submit 1–5 star feedback ratings without logging in.

#### 4.10 Predictive Revenue Forecast, Replenish KPI, 30-Day Expense/Labor Comparison, D3.js Trends & CSAT
1. Click **`Analytics & Team -> Analytics & Revenue Forecast`**.
2. Review workshop KPIs and sections configured in Business Settings: **Active Jobs**, **Low Inventory**, **Average Time to Replenish** (mean days/hours from `lowStockTimestamp` to `lastRestocked` plus awaiting count), **Revenue**, **Today's Appointments**, **Average Repair Time**, **Top Grievances**, **Technician Performance**, and **Tool Category Volume**.
3. **Operational Expenses vs Labor Income (Last 30 Days)**: Compare daily technician labor revenue (`#34d399`) against operational expenses (`#f59e0b`) in the Recharts `BarChart` to spot high-cost service trends.
4. **D3.js Monthly Consumption Trends**: Inspect the D3.js SVG curve chart computing live monthly usage across the top high-frequency spare part SKUs from active `jobCards` to anticipate seasonal demand.
5. **Predictive Monthly Revenue Forecast**: Inside the Recharts `LineChart` module, toggle `3M / 6M / 12M Horizon`, `Conservative / Baseline / Growth` scenarios, and `Confidence Band` to project monthly revenue from recorded billings, seasonal tool demand multipliers, and upcoming fleet maintenance.
6. **Customer Satisfaction (CSAT) & Feedback Breakdown**: View overall 5-star average rating, response rate, star distribution bars, and recent client comments captured from completion surveys.
7. Click **`Download Jobs CSV`** and **`Download Inventory CSV`** for spreadsheet auditing.

#### 4.11 UI Customization, Analytics Toggles, Feedback Rule & Business Settings
1. Open **`Business Setup`** (`TransitionView`).
2. **Analytics Dashboard Metrics Visibility**: Toggle any of the 8 analytics widgets individually or apply presets (`Enable All`, `Core 4 Only`, `Reset Defaults`).
3. **Completion Feedback SMS Toggle**: Toggle `Auto-Send Customer Feedback SMS Survey upon Job Completion` under Shop Rules.
4. **UI & Field Customizer**: Add custom intake form fields, toggle required flags, customize system field labels/visibility (`customFields`), and persist captured values onto tickets and SQL/Firestore exports.

#### 4.12 Automatic Daily Database Backups, PostgreSQL & MySQL Export
1. Under **`Business Setup`**, enable **Automatic Daily Backups** (`LocalStorage Snapshot`, `Downloadable JSON File`, or `Both`).
2. **MySQL Database Export**: Click **`Export Local MySQL DB (.sql)`** to generate a full relational dump matching `/database.sql`.
3. **PostgreSQL 16 & Enterprise Migration**: Deploy `/database.postgres.sql` on PostgreSQL 16 or Cloud SQL using the steps in `docs/DATABASE_SETUP_AND_INTEGRATION_GUIDE.md`.

---

### 5. API INTEGRATIONS: TWILIO SMS & META WHATSAPP CLOUD API

The system provides native support for automated SMS and WhatsApp delivery:

- **Twilio SMS REST API**: Sends direct server-side SMS to customer mobile numbers.
- **Twilio WhatsApp API**: Dispatches WhatsApp messages from Twilio Sandbox or registered business numbers.
- **Meta WhatsApp Cloud API**: Direct integration with Graph API using phone number IDs and system user access tokens.
- **Automatic Fallback Protocol**: If `.env` API credentials are not set, the frontend automatically falls back to native device SMS links (`sms:`) and 1-click WhatsApp Web deep links (`wa.me/`), ensuring uninterrupted service dispatch.

---

### 6. DATABASE DEPLOYMENT: FIRESTORE, POSTGRESQL 16 & MYSQL 8.0

See [`docs/DATABASE_SETUP_AND_INTEGRATION_GUIDE.md`](DATABASE_SETUP_AND_INTEGRATION_GUIDE.md) for step-by-step installation commands, Drizzle ORM integration examples, Android/tablet Bearer auth flows, and dummy demonstration database details.

#### Supported Persistence Layers:
- **Cloud Firestore (Live Multi-Client)**: Named database `ai-studio-autotrackservice-2eac3d40-310f-46ba-a293-99682d0a94d7` in project `ai-studio-applet-webapp-65129` with `jobCards`, `inventory`, `schedules`, `settings`, `customFields`, `users`, and zero-PII `publicDeliveries`.
- **PostgreSQL 16 Schema (`/database.postgres.sql`)**: Full 11-table DDL (`SERIAL`, `TIMESTAMPTZ`, `JSONB`, `BOOLEAN`, `CHECK` constraints) plus demonstration seed data.
- **MySQL 8.0+ / MariaDB Schema (`/database.sql`)**: Full 11-table DDL + seed dump (`bosch_service_db`).

#### Default SQL Demo Credentials (PostgreSQL & MySQL Seed):
- **Username**: `admin`
- **Password**: `123456` *(Bcrypt Hash in SQL seed — change before external deployment)*
- **Role**: `Administrator`

#### 11 Relational Database Tables:
1. `user_roles`: 6 role tiers (Admin, Manager, Senior Tech, Bench Tech, Inventory Specialist, Front Desk).
2. `users`: System user credentials, emails, role assignments, and active status.
3. `business_settings`: Shop configuration, tax rates, labor pricing, `auto_send_feedback_sms`, `analytics_metrics`, and backup settings.
4. `custom_fields`: Dynamic UI form field definitions.
5. `inventory_items`: 1,000 spare parts catalog items with bin locations, costs, and reorder thresholds.
6. `job_cards`: Service tickets, client details, tool info, status, `public_access_token`, `feedback_sms_sent_at`, `customer_feedback_*`, and AI diagnostic summaries.
7. `job_card_parts`: Parts consumed per ticket with price and quantity snapshot.
8. `technician_time_logs`: Clock-in/out timestamps, duration minutes, and labor notes.
9. `recurring_maintenance`: Preventive maintenance overhaul schedules and due dates.
10. `message_logs`: Client notification dispatch logs (including automated `'Feedback'` SMS records).
11. `audit_logs`: Compliance timeline events (`JOB_INTAKE_CREATED`, `STATUS_CHANGE`, signatures, voice notes, `CUSTOMER_FEEDBACK_SUBMITTED`).

---

### 7. SYSTEM LIMITATIONS & BOUNDARY CONDITIONS

| Feature Area | Limitation / Boundary | Mitigation Strategy |
| :--- | :--- | :--- |
| **Browser Storage & Offline Cache** | `localStorage` holds ~5MB–10MB; Service Worker (`autotrack-data-v1`) caches core JSON snapshots. | Sign in with Google for live Cloud Firestore persistence, or export JSON / SQL dumps. |
| **Camera Scanning** | Native `BarcodeDetector` varies across older browsers. | Automatic fallback uses `jsQR` frame decoding plus `/api/ai/scan-serial` vision API and USB HID input. |
| **Offline Mode** | Service Worker (`/sw.js`) enables offline Job Card, Inventory, Schedule, and Settings viewing; Gemini AI & live cloud sync require connectivity. | `OfflineIndicator` confirms cached ticket count; updates sync when connectivity returns. |
| **API Messaging** | Direct SMS/WhatsApp dispatch requires Twilio or Meta API keys in `.env`. | Automatic fallback opens native device `sms:` or WhatsApp Web `wa.me/` deep links. |

---

### 8. VENDOR & STAFF TRAINING MANUAL

#### 8.1 Front-Desk Receptionist Onboarding Checklist
- [ ] **Step 1**: Sign in with Google Auth and verify live sync indicator is active.
- [ ] **Step 2**: Open **`+ Intake Form`** and click `Scan Serial / QR` to capture the tool nameplate barcode.
- [ ] **Step 3**: Record client details, accessories received, grievance category, and detailed complaint.
- [ ] **Step 4**: Capture client digital signature on the intake touch canvas and click `Submit & Generate Job Ticket`.
- [ ] **Step 5**: Print the PDF traveler receipt with QR code (`/?view=customer&token=...`) so the client can track live repair status.

#### 8.2 Bench Repair Technician Workflow
- [ ] **Step 1**: Open assigned ticket in **`Service Cards`** or **`Kanban Board`**.
- [ ] **Step 2**: Click `Clock In` on the **Bench Time Clock** widget.
- [ ] **Step 3**: Click `✨ Run Gemini AI Diagnosis` and inspect AI recommended spare parts.
- [ ] **Step 4**: Perform teardown, scan replacement part barcodes, and link consumed parts to the ticket.
- [ ] **Step 5**: Dictate completion notes, save your technician sign-off signature, click `Clock Out`, and move the ticket to `Ready for Pickup`.

#### 8.3 Workshop Manager & Inventory Lead Protocols
- [ ] **Step 1**: Review **`Analytics`** (including **Average Time to Replenish**, 30-day Expense vs Labor chart, live D3 consumption trends, Predictive Monthly Revenue Forecast, and CSAT breakdown) and customize visible widgets in **`Business Setup` -> `Analytics Dashboard Metrics Visibility`**.
- [ ] **Step 2**: Open **`1,000 SKUs`** -> review automated monthly consumption reorder points, click **`Download Draft PO PDF`** for low-stock SKUs, use **`Bulk Import Excel / CSV`** for distributor restock sheets, or click `✨ AI Reorder Recommendations` -> Export `AI PO CSV`.
- [ ] **Step 3**: Monitor **`Kanban Board`** cloud sync indicators (**Synced to Cloud** vs. **Pending Offline Sync**), audit `Servicing` (`Recurring Maintenance`) schedules, confirm offline Service Worker activation, and verify weekly SQL/Firestore backups.

---

### 9. QUALITY ASSURANCE & TESTING ACCEPTANCE GUIDE

For complete test matrices covering Features 1–22, security rules tests, SQL/CSV validation scripts, live API health reports, and E2E verification checklists, refer to:

- **[`docs/TESTING_AND_QA_ACCEPTANCE_GUIDE.md`](TESTING_AND_QA_ACCEPTANCE_GUIDE.md)**
- **[`docs/DATABASE_SETUP_AND_INTEGRATION_GUIDE.md`](DATABASE_SETUP_AND_INTEGRATION_GUIDE.md)**
- **[`docs/SETUP_AND_MAINTENANCE_GUIDE.md`](SETUP_AND_MAINTENANCE_GUIDE.md)**
- **[`docs/AI_MODEL_AND_MESSAGING_SANDBOX_GUIDE.md`](AI_MODEL_AND_MESSAGING_SANDBOX_GUIDE.md)**
- **[`testing_docs/README.md`](../testing_docs/README.md)**

---
*Manual compiled and maintained for Bosch Authorised Service Hub Operations (v4.4).*
