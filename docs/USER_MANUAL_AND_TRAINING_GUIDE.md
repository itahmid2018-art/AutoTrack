# BOSCH AUTHORISED SERVICE CENTER & POWER TOOLS HUB
## End-User Operating Manual, System Specifications & Training Guide
**Version 2.6 (2026 Enterprise Edition) · Industrial Production Release**

---

### TABLE OF CONTENTS
1. [Executive Summary & System Purpose](#1-executive-summary--system-purpose)
2. [System Architecture & Technology Stack](#2-system-architecture--technology-stack)
3. [System Requirements & Infrastructure](#3-system-requirements--infrastructure)
4. [End-User Operating Manual & Module Walkthrough](#4-end-user-operating-manual--module-walkthrough)
   - 4.1 Tool Intake & Digital Job Card Management
   - 4.2 Global Real-Time Search Bar
   - 4.3 Drag-and-Drop Kanban Board
   - 4.4 Gemini AI Repair Diagnosis & Workbench Chatbot
   - 4.5 AI Predictive Inventory Reorder Recommendation Engine
   - 4.6 Technician Bench Time Tracking & Labor Accounting
   - 4.7 1,000 Spare Parts Inventory & Barcode Management
   - 4.8 Recurring Maintenance & Preventive Overhaul Servicing
   - 4.9 WhatsApp & Twilio SMS Customer Dispatch Center
   - 4.10 Analytics & Financial Audit CSV Reporting
   - 4.11 UI & Form Field Customization Suite
   - 4.12 Automatic Daily Database Backups & MySQL (.sql) Export
5. [API Integrations: Twilio SMS & Meta WhatsApp Cloud API](#5-api-integrations-twilio-sms--meta-whatsapp-cloud-api)
6. [MySQL Relational Database Schema & Default Credentials](#6-mysql-relational-database-schema--default-credentials)
7. [System Limitations & Boundary Conditions](#7-system-limitations--boundary-conditions)
8. [Vendor & Staff Training Manual](#8-vendor--staff-training-manual)
   - 8.1 Front-Desk Receptionist Onboarding Checklist
   - 8.2 Bench Repair Technician Workflow
   - 8.3 Workshop Manager & Inventory Lead Protocols

---

### 1. EXECUTIVE SUMMARY & SYSTEM PURPOSE

The **Bosch Authorised Service Center & Power Tools Hub** is a full-stack, enterprise-grade service management platform purpose-built for commercial power tool service hubs, equipment rental depots, and industrial tool repair centers.

It automates and digitizes the entire lifecycle of power tool servicing across leading brands—including **Bosch Professional**, **Bosch DIY (Green)**, **Makita**, **DeWalt**, **Milwaukee**, **Hilti**, **Metabo**, **Festool**, and **Stihl**.

#### Key Objectives & Core Capabilities:
1. **Accelerated Intake & Digital Signatures**: Complete check-in under 60 seconds with digital customer signature capture and automatic Job Card ID generation (e.g., `BOSCH-2026-0041`).
2. **Server-Side Gemini 3.8 Flash AI Diagnosis**: Leverages `@google/genai` (`gemini-3.8-flash`) to analyze tool grievance descriptions, determine electrical/mechanical failure causes, generate step-by-step teardown steps, and link catalog spare parts SKUs.
3. **Interactive Workbench Diagnostic Chatbot**: Real-time diagnostic assistant allowing technicians to query multimeter test parameters, exploded view component advice, and SKU links directly on the repair bench.
4. **Predictive Inventory Reordering**: AI failure pattern correlation engine matching historical repair complaints against stock velocity to recommend purchase orders before stockouts occur.
5. **Technician Labor Accounting**: Bench time clock tracker for technician clock-ins/outs per job ticket with automatic labor hour sync.
6. **Twilio SMS & Meta WhatsApp API Integration**: Direct server-side API dispatch for customer notifications with automatic 1-click browser deep-link fallback.
7. **MySQL 8.0+ / Cloud SQL Database Export**: 1-click deployable `database.sql` script containing complete DDL and DML data structures.

---

### 2. SYSTEM ARCHITECTURE & TECHNOLOGY STACK

```
+-------------------------------------------------------------------+
|                   CLIENT FRONTEND (Vite + React 18)               |
|  - High-Contrast Industrial UI (Monochrome Zinc / Monospace Specs)|
|  - Real-Time LocalStorage Engine (TransactionalDb)               |
|  - Framer Motion Drag-and-Drop Kanban Board                       |
+-------------------------------------------------------------------+
                                  |
                                  | HTTP REST API Proxy (/api/*)
                                  v
+-------------------------------------------------------------------+
|                    EXPRESS NODE.JS SERVER (server.ts)             |
|  - Middleware Proxy & Environment Secrets Protection               |
|  - @google/genai SDK Integration (User-Agent: 'aistudio-build')    |
|  - Twilio REST API & Meta WhatsApp Cloud API Proxies               |
+-------------------------------------------------------------------+
                                  |
            +---------------------+---------------------+
            |                                           |
            v                                           v
+-----------------------+                   +-----------------------+
|  GEMINI 3.8 FLASH API |                   | LOCAL MYSQL DATABASE  |
|  - /api/ai/diagnose   |                   | - database.sql Dump   |
|  - /api/ai/repair-chat|                   | - MySQL 8.0+ / MariaDB|
|  - /api/ai/reorders   |                   | - bosch_service_db    |
+-----------------------+                   +-----------------------+
```

#### Technical Stack Breakdown:
- **Frontend Framework**: React 18 SPA built with Vite bundler.
- **Styling Architecture**: Tailwind CSS (`@import "tailwindcss";`) adhering to strict industrial monochrome guidelines (zinc/black/white, monospace data displays, zero rounded pills).
- **Backend Runtime**: Node.js Express server (`server.ts`) running on Port 3000.
- **Artificial Intelligence Engine**: `@google/genai` TypeScript SDK invoking `gemini-3.8-flash` with JSON output schemas (`responseSchema`).
- **Data Storage & Persistence**:
  - *Client Storage*: Synchronous `TransactionalDb` utility operating over `localStorage`.
  - *Database Server*: MySQL 8.0+ / MariaDB / Cloud SQL compatible `database.sql` schema export.

---

### 3. SYSTEM REQUIREMENTS & INFRASTRUCTURE

#### Client Requirements:
- **Operating System**: Windows 10/11, macOS 12+, Linux, or Android/iOS tablet devices.
- **Browser**: Google Chrome 110+, Microsoft Edge 110+, Mozilla Firefox 110+, or Safari 16+.
- **Display Resolution**: Minimum 1280 × 720 (Optimized for 1920 × 1080 workshop workbench displays).
- **Hardware Peripherals**: Standard USB or Bluetooth HID Barcode Scanner.

#### Server & Hosting Requirements:
- **Runtime Environment**: Node.js 18.x or 20.x LTS.
- **Environment Variables**:
  - `GEMINI_API_KEY`: API Key for Google Gemini services.
  - `PORT`: Server port (default `3000`).
  - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_NUMBER` *(Optional)*.
  - `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` *(Optional)*.

---

### 4. END-USER OPERATING MANUAL & MODULE WALKTHROUGH

#### 4.1 Tool Intake & Digital Job Card Management
1. Click **`+ Intake Form`** in the top navigation bar.
2. Enter **Customer Information**: Customer Name, Company, Mobile Phone Number, Email Address, Tax/GST ID.
3. Enter **Tool Specifications**: Brand Vendor, Tool Category (Rotary Hammer, Angle Grinder, Cordless Drill, Demolition Breaker, etc.), Model Number, Serial Number, Voltage Rating, Warranty Status.
4. Select **Customer Grievance Details**: Grievance Category (*Motor Sparking*, *No Power*, *Low Impact*, *Gearbox Noise*, etc.), Detailed Complaint Description, Service Type, Pre-Approved Cost Limit.
5. Capture **Digital Signature**: Customer signs directly on the touch/mouse signature canvas.
6. Click **`Submit & Generate Job Ticket`**.
7. The system assigns a unique Job Ticket ID (e.g., `BOSCH-2026-0041`), logs intake date, and opens quick actions to print tags or notify the customer.

#### 4.2 Global Real-Time Search Bar
Located in the center header navigation bar:
- Real-time instant search across all Job Cards and 1,000 Inventory Spare Parts SKUs.
- Accepts: **Customer Name**, **Mobile Phone Number**, **Job Ticket ID** (e.g., `BOSCH-2026-0041`), **Part SKU** (e.g., `BRSH-1002`), **Model Number** (e.g., `GBH 2-26`), or **Serial Number**.
- Click any search result item to view details instantly.

#### 4.3 Drag-and-Drop Kanban Board
1. Click the **`Kanban`** tab.
2. Monitor 6 workshop pipeline columns:
   - `1. Intake` -> `2. Diagnosis` -> `3. Approval` -> `4. In Service` -> `5. Ready` -> `6. Completed`.
3. Drag any job ticket card and drop it into a new column. Status and timestamps update automatically.
4. Use quick step arrow buttons (`<` and `>`) for touch-screen operation.

#### 4.4 Gemini AI Repair Diagnosis & Workbench Chatbot
1. Open any Job Card from **`Service Cards`** or click **`Diagnose`**.
2. Click **`✨ Run Gemini AI Diagnosis`**:
   - Queries `gemini-3.8-flash` with tool model and grievance complaint context.
   - Generates: **Probable Cause Analysis**, **Step-by-Step Bench Repair Procedures**, **Recommended Catalog Spare Parts**, and **Technical Notes**.
3. Click **`1-Click Apply to Ticket`** to write diagnostic recommendations, labor estimates, and linked parts directly to the ticket.
4. **Workbench AI Diagnostic Chatbot**: Select the `💬 AI Repair Chatbot` tab to ask freeform diagnostic questions, request multimeter check values, or click part SKU buttons to attach parts directly from assistant messages.

#### 4.5 AI Predictive Inventory Reorder Recommendation Engine
1. Navigate to **`1,000 SKUs`** or **`Analytics`**.
2. Click **`✨ AI Reorder Recommendations`** -> **`Spark AI Reorder Analysis`**:
   - Analyzes historical repair grievance complaints against stock levels and reorder thresholds.
   - Generates an **AI Predictive Reorder Purchase Order Table** listing suggested quantities, urgency ratings (*CRITICAL*, *HIGH*, *MEDIUM*), and defect velocity context.
3. Click **`+ Receive Restock`** to add parts directly to inventory stock.
4. Click **`Export AI PO CSV`** to export purchase orders formatted for supplier procurement.

#### 4.6 Technician Bench Time Tracking & Labor Accounting
1. Click **`Time Tracking`** on the header bar.
2. **Clock In**: Select Technician -> Select Target Job Card -> Enter optional notes -> Click `Clock In Now`.
3. **Live Workshop Timer**: Track active working sessions with real-time timers (`1h 42m 10s`).
4. **Clock Out**: Click `Clock Out` to finalize duration, record logs, and auto-sync labor hours to the customer invoice.

#### 4.7 1,000 Spare Parts Inventory & Barcode Management
1. Click **`1,000 SKUs`**.
2. Filter parts by SKU, Category, Bin Location, or Low Stock Alert.
3. **Barcode Scanner**: Click `Barcode Scanner` and scan any part barcode or enter SKU to display stock quantity, bin location, and price.
4. **Quick Restock**: Click `+10` on any row to increment stock count instantly.

#### 4.8 Recurring Maintenance & Preventive Overhaul Servicing
1. Click **`Servicing`**.
2. Track commercial contractor equipment registered for 3, 6, or 12-month interval overhauls.
3. Monitor status flags: `Upcoming`, `Due Soon`, `Overdue`.
4. Click **`+ Generate Intake Ticket`** to convert due maintenance items into active job cards in 1 click.

#### 4.9 WhatsApp & Twilio SMS Customer Dispatch Center
1. Click **`WhatsApp`** on the top header bar.
2. Select target customer job ticket.
3. Choose milestone template: **Intake Received**, **Estimate Ready**, **Ready for Pickup**, or **Service Invoice**.
4. Click **`Send Twilio SMS API`** or **`Send WhatsApp API`** (or 1-click native web deep link fallback).

#### 4.10 Analytics & Financial Audit CSV Reporting
1. Click **`Analytics`**.
2. Review workshop KPIs: Active Intakes, Total Revenue, Average Turnaround Hours, Technician Efficiency Metrics.
3. Click **`Download Jobs CSV`** for job ticket history.
4. Click **`Download Inventory CSV`** for inventory valuation reports.

#### 4.11 UI & Form Field Customization Suite
1. Click **`Business Setup Questions`** (Transition View) -> **`UI & Field Customizer`**.
2. Manage form fields across Customer Info, Tool Details, Grievance Details, and Billing categories.
3. Add custom text, number, select, date, or boolean fields, toggle required flags, or disable non-essential fields.

#### 4.12 Automatic Daily Database Backups & MySQL (.sql) Export
1. Under **`Business Setup Questions`**, toggle **Automatic Daily Backups**.
2. Select destination: `LocalStorage Snapshot`, `Downloadable JSON File`, or `Both`.
3. **MySQL Database Export**: Click **`Export Local MySQL DB (.sql)`** to download a complete, deployable `database.sql` script for self-hosting on MySQL 8.0+, MariaDB, or Cloud SQL.

---

### 5. API INTEGRATIONS: TWILIO SMS & META WHATSAPP CLOUD API

The system provides native support for automated SMS and WhatsApp delivery:

- **Twilio SMS REST API**: Sends direct server-side SMS to customer mobile numbers.
- **Twilio WhatsApp API**: Dispatches WhatsApp messages from Twilio Sandbox or registered business numbers.
- **Meta WhatsApp Cloud API**: Direct integration with Graph API using phone number IDs and system user access tokens.
- **Automatic Fallback Protocol**: If `.env` API credentials are not set, the frontend automatically falls back to native device SMS links (`sms:`) and 1-click WhatsApp Web deep links (`wa.me/`), ensuring uninterrupted service dispatch.

---

### 6. MYSQL RELATIONAL DATABASE SCHEMA & DEFAULT CREDENTIALS

The project includes a 100% MySQL 8.0+ compatible database dump (`database.sql`).

#### Default System Admin Credentials:
- **Username**: `admin`
- **Password**: `123456` *(Bcrypt Hash: `$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW`)*
- **Role**: `Administrator`

#### Database Table Schemas (10 Tables):
1. `user_roles`: 6 role tiers (Admin, Manager, Senior Tech, Bench Tech, Inventory Specialist, Front Desk).
2. `users`: System user credentials, emails, role assignments, and active status.
3. `business_settings`: Shop configuration, tax rates, labor pricing, backup settings.
4. `custom_fields`: Dynamic UI form field definitions.
5. `inventory_items`: 1,000 spare parts catalog items with bin locations, costs, and reorder thresholds.
6. `job_cards`: Service tickets, customer details, tool info, status, AI diagnostic summaries.
7. `job_card_parts`: Parts consumed per ticket with price and quantity snapshot.
8. `technician_time_logs`: Clock-in/out timestamps, duration minutes, and labor notes.
9. `recurring_maintenance`: Preventive maintenance overhaul schedules and due dates.
10. `message_logs`: Customer notification dispatch logs.

---

### 7. SYSTEM LIMITATIONS & BOUNDARY CONDITIONS

| Feature Area | Limitation / Boundary | Mitigation Strategy |
| :--- | :--- | :--- |
| **Browser Storage** | Local state uses browser `localStorage` (~5MB - 10MB limit). | Download periodic JSON backups or export deployable MySQL `.sql` database script. |
| **Offline Mode** | Core Job Cards, search, time tracking, and inventory work offline. Gemini AI features require an internet connection. | Deterministic offline fallback diagnostic checks trigger automatically when offline. |
| **Barcode Scanning** | Expects standard HID keyboard emulation on hardware scanners. | Manual soft SKU search input is available as fallback. |
| **API Messaging** | Direct API dispatch requires Twilio or Meta API keys in `.env`. | Automatic fallback opens native device SMS or WhatsApp Web deep links. |

---

### 8. VENDOR & STAFF TRAINING MANUAL

#### 8.1 Front-Desk Receptionist Onboarding Checklist
- [ ] **Step 1**: Open **`+ Intake Form`**.
- [ ] **Step 2**: Inspect tool body, power cable, carbon brushes, and chuck condition. Record accessories received.
- [ ] **Step 3**: Select grievance category (*Motor Sparking*, *No Power*, etc.) and detailed complaint description.
- [ ] **Step 4**: Obtain customer digital signature on touch canvas.
- [ ] **Step 5**: Click `Submit & Generate Job Ticket`. Print job tag and attach securely to tool case.

#### 8.2 Bench Repair Technician Workflow
- [ ] **Step 1**: Open ticket in **`Service Cards`** or **`Kanban Board`**.
- [ ] **Step 2**: Click `Clock In` on the **Bench Time Clock** widget.
- [ ] **Step 3**: Click `✨ Run Gemini AI Diagnosis` for root cause analysis and recommended repair procedures.
- [ ] **Step 4**: Perform teardown. Use `💬 AI Repair Chatbot` if assistance is needed. Click `Link Part` for consumed parts.
- [ ] **Step 5**: Complete repair work, click `Clock Out`, and shift ticket status to `Ready for Pickup`.

#### 8.3 Workshop Manager & Inventory Lead Protocols
- [ ] **Step 1**: Morning review of **`Analytics`** dashboard and technician active workloads.
- [ ] **Step 2**: Open **`1,000 SKUs`** -> Click `✨ AI Reorder Recommendations` -> Review low stock velocity items.
- [ ] **Step 3**: Export `AI PO CSV` purchase order sheet for vendor spare part procurement.
- [ ] **Step 4**: Verify daily database backup execution and export monthly MySQL `.sql` snapshots.

---
*Manual compiled and maintained for Bosch Authorised Service Hub Operations.*
