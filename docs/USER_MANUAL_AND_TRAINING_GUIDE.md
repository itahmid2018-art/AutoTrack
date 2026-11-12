# BOSCH AUTHORISED SERVICE CENTER & POWER TOOLS HUB
## End-User Operating Manual, System Specifications & Training Guide
**Version 2.5 (2026 Edition) · Industrial Enterprise Release**

---

### TABLE OF CONTENTS
1. [Executive Summary & Purpose](#1-executive-summary--purpose)
2. [System Specifications & Architecture](#2-system-specifications--architecture)
3. [System Requirements](#3-system-requirements)
4. [End-User Operating Manual & Feature Walkthrough](#4-end-user-operating-manual--feature-walkthrough)
   - 4.1 Tool Intake & Job Card Lifecycle Management
   - 4.2 Global Real-Time Search Bar
   - 4.3 Drag-and-Drop Kanban Board
   - 4.4 Gemini AI Repair Diagnosis & Workbench Chatbot
   - 4.5 AI Predictive Inventory Reorder Recommendation Engine
   - 4.6 Technician Bench Time Clock & Efficiency Tracking
   - 4.7 1,000 Spare Parts Inventory & Barcode Management
   - 4.8 Recurring Maintenance & Preventive Overhaul Servicing
   - 4.9 Customer WhatsApp & SMS Messaging Center
   - 4.10 Analytics & Financial Audit CSV Reporting
   - 4.11 UI & Form Field Customization
   - 4.12 Automatic Daily Database Backups & MySQL Export
5. [System Limitations & Boundary Conditions](#5-system-limitations--boundary-conditions)
6. [Vendor & Staff Training Manual](#6-vendor--staff-training-manual)
   - 6.1 Front-Desk Service Receptionist Checklist
   - 6.2 Bench Repair Technician Workflow
   - 6.3 Workshop Manager & Inventory Lead Protocols

---

### 1. EXECUTIVE SUMMARY & PURPOSE

The **Bosch Authorised Service Center & Power Tools Hub** is a full-stack, enterprise-grade workshop management system purpose-built for heavy-duty power tool service centers, equipment rental depots, and industrial repair centers.

It streamlines the entire lifecycle of power tool servicing across primary brand vendors—including **Bosch Professional**, **Bosch DIY (Green)**, **Makita**, **DeWalt**, **Milwaukee**, **Hilti**, and **Metabo**.

#### Primary Operational Goals:
1. **Reduce Job Ticket Intake Time**: Fast digital intake with customer signatures and automatic Job Card ID generation.
2. **Elevate Diagnostic Accuracy**: Powered by server-side **Gemini 3.8 Flash AI** (`gemini-3.8-flash`) to diagnose tool symptoms (motor sparking, lost impact, dead switch, gearbox noise) and auto-link genuine replacement parts SKUs.
3. **Prevent Inventory Stockouts**: Proactive AI predictive inventory forecasting correlates historical repair grievances with 1,000 spare parts SKUs to suggest reorders before stockouts occur.
4. **Accurate Labor Accounting**: Bench time clock module allowing technicians to clock-in/out of job cards with real-time timers and turnaround tracking.
5. **Data Ownership & Backup Safeguards**: 1-click exportable deployable MySQL `.sql` scripts, automatic daily LocalStorage snapshots, and downloadable `.json` backups.

---

### 2. SYSTEM SPECIFICATIONS & ARCHITECTURE

```
+-------------------------------------------------------------------+
|                   CLIENT FRONTEND (Vite + React)                  |
|  - High-Contrast Industrial UI (Monochrome Monochrome Zinc Theme)  |
|  - Real-Time LocalStorage Transactional Engine (TransactionalDb)    |
|  - Framer Motion Drag-and-Drop Kanban Board                       |
+-------------------------------------------------------------------+
                                  |
                                  | HTTP REST API Proxy (/api/*)
                                  v
+-------------------------------------------------------------------+
|                    EXPRESS NODE.JS SERVER (server.ts)             |
|  - Middleware Proxy & Environment Secrets Protection               |
|  - @google/genai SDK Integration (User-Agent: 'aistudio-build')    |
+-------------------------------------------------------------------+
                                  |
            +---------------------+---------------------+
            |                                           |
            v                                           v
+-----------------------+                   +-----------------------+
|  GEMINI 3.8 FLASH API |                   | LOCAL MYSQL DATABASE  |
|  - /api/ai/diagnose   |                   | - Deployable SQL Dump |
|  - /api/ai/repair-chat|                   | - MySQL 8.0+ / MariaDB|
|  - /api/ai/reorders   |                   | - bosch_service_db    |
+-----------------------+                   +-----------------------+
```

#### Technical Stack Breakdown:
- **Frontend Framework**: React 18 SPA with Vite bundler.
- **Styling Discipline**: Tailwind CSS (`@import "tailwindcss";`) strictly obeying high-contrast industrial monochrome rules (zinc/black/white, monospace metrics, zero pill shapes).
- **Backend Runtime**: Node.js Express server (`server.ts`) listening on Port 3000.
- **Artificial Intelligence SDK**: `@google/genai` (SDK version `>= 2.29.1`) invoking `gemini-3.8-flash` model with structured JSON schemas (`responseSchema`).
- **Database Engine**:
  - *Client-Side Persistence*: `TransactionalDb` module over `localStorage`.
  - *Server/SQL Deployment*: Custom MySQL DDL/DML exporter generating `bosch_service_db` schema.

---

### 3. SYSTEM REQUIREMENTS

#### Client Requirements:
- **Operating System**: Windows 10/11, macOS 12+, Linux, or Android/iOS tablet devices.
- **Web Browser**: Google Chrome 110+, Microsoft Edge 110+, Mozilla Firefox 110+, or Safari 16+.
- **Screen Resolution**: Minimum 1280 × 720 (Optimized for 1920 × 1080 workshop workbench monitors).
- **Hardware Integration**: Standard USB / Bluetooth HID Barcode Scanner (emulates keyboard input).

#### Server Requirements:
- **Runtime**: Node.js 18.x or 20.x LTS.
- **Environment Variables**:
  - `GEMINI_API_KEY`: API key with access to Gemini models.
  - `PORT`: Default `3000`.
- **Database (Optional for Local Self-Hosting)**:
  - MySQL 8.0+ or MariaDB 10.6+.

---

### 4. END-USER OPERATING MANUAL & FEATURE WALKTHROUGH

#### 4.1 Tool Intake & Job Card Lifecycle Management
1. Navigate to **`+ Intake Form`** on the top header bar.
2. Enter **Customer Information**: Customer Name, Company, Mobile Phone Number, Email, Tax/GST ID.
3. Enter **Tool Specifications**: Brand Vendor, Category (Rotary Hammer, Angle Grinder, Cordless Drill, Demolition Breaker, etc.), Model Number, Serial Number, Voltage Rating, Warranty Status.
4. Select **Customer Grievance Details**: Grievance Category (*Motor Sparking*, *No Power*, *Low Impact*, *Gearbox Noise*, etc.), Detailed Complaint Description, Service Type, Pre-Approved Repair Cost Limit.
5. Capture **Digital Signature**: Customer signs on the touch/mouse signature pad.
6. Click **`Submit & Generate Job Ticket`**.
7. The system automatically creates a unique Job Card ID (e.g. `BOSCH-2026-0041`) and prompts to print job tags or generate a WhatsApp intake message.

#### 4.2 Global Real-Time Search Bar
Located in the center of the top navigation header bar:
- Search instantly across all job cards and ~1,000 inventory spare parts SKUs.
- Accepts: **Customer Name**, **Mobile Phone Number**, **Job Card ID** (e.g., `BOSCH-2026-0041`), **Part SKU** (e.g., `BRSH-1002`), **Model Number** (e.g., `GBH 2-26`), or **Serial Number**.
- Click any result overlay row to navigate directly to that record.

#### 4.3 Drag-and-Drop Kanban Board
1. Click the **`Kanban`** tab.
2. View 6 workshop status columns:
   - `1. Intake` -> `2. Diagnosis` -> `3. Approval` -> `4. In Service` -> `5. Ready` -> `6. Completed`.
3. Drag any job card card and drop it into a target status column. The system immediately updates status, records timestamp in state, and reflects changes across all screens.
4. Quick status shift buttons (`<` and `>`) are provided for touchscreen operation.

#### 4.4 Gemini AI Repair Diagnosis & Workbench Chatbot
1. Open any Job Card in **`Service Cards`** or click **`Diagnose`** on any card.
2. Click **`✨ Run Gemini AI Diagnosis`**:
   - The server queries `gemini-3.8-flash` with the device model and customer grievance details.
   - Outputs: **Probable Root Cause Analysis**, **Numbered Step-by-Step Bench Repair Procedures**, **Suggested Catalog Replacement Parts**, and **Service Ticket Technical Notes**.
3. **1-Click Apply to Ticket**: Click `1-Click Apply to Ticket` to automatically update diagnostic notes, recommended actions, labor hours, and link suggested parts.
4. **Interactive AI Repair Chatbot**: Switch to the `💬 AI Repair Chatbot` tab in the job detail view to ask freeform diagnostic questions, request multimeter test procedures, or click SKU buttons to link parts directly from assistant messages.

#### 4.5 AI Predictive Inventory Reorder Recommendation Engine
1. Navigate to the **`1,000 SKUs`** (Inventory Manager) or **`Analytics`** view.
2. Click **`✨ AI Reorder Recommendations`** -> **`Spark AI Reorder Analysis`**:
   - Analyzes historical repair grievance patterns (e.g., *14 recent GWS grinder tickets showing carbon brush burn rate*).
   - Generates an **AI Predictive Reorder Purchase Order Table** with suggested reorder quantities, urgency ratings (*CRITICAL*, *HIGH*, *MEDIUM*), and defect pattern context.
3. Click **`+ Receive Restock`** to add parts immediately to active stock in 1 click.
4. Click **`Export AI PO CSV`** to download a purchase order sheet formatted for vendor suppliers.

#### 4.6 Technician Bench Time Clock & Efficiency Tracking
1. Click the **`Time Tracking`** tab on the top header.
2. **Clocking In**: Select Technician Name -> Select Target Job Card -> Enter optional task scope -> Click `Clock In Now`.
3. **Live Workshop Monitor**: View all active running timers with real-time elapsed tickers (`1h 42m 10s`).
4. **Clocking Out**: Click `Clock Out` on any running session. The system calculates duration, logs history, and syncs labor hours to the job card invoice.
5. **Individual Job Clock**: Technicians viewing a job card in `Service Cards` can also clock in/out directly via the `Bench Time Clock` widget on the right sidebar.

#### 4.7 1,000 Spare Parts Inventory & Barcode Management
1. Click **`1,000 SKUs`**.
2. Filter parts by SKU, Category, Bin Location, or Low Stock Alert.
3. **Barcode Scanner**: Click `Barcode Scanner` and scan any part barcode or type SKU to instantly display stock quantity, bin location, and price.
4. **Quick Restock**: Click `+10` on any row to increment stock instantly upon receiving shipment.

#### 4.8 Recurring Maintenance & Preventive Overhaul Servicing
1. Click the **`Servicing`** tab.
2. Track tools registered for 3, 6, or 12-month interval preventive overhauls.
3. Identifies tools that are `Upcoming`, `Due Soon`, or `Overdue`.
4. Click **`+ Generate Intake Ticket`** to convert a due maintenance schedule into an active repair job card in 1 click.

#### 4.9 Customer WhatsApp & SMS Messaging Center
1. Click **`WhatsApp`**.
2. Select target customer job ticket.
3. Choose template: **Intake Confirmation**, **Estimate Approval Request**, or **Ready for Pickup Notification**.
4. The system pre-fills customer name, tool details, and estimate totals. Click **`Send WhatsApp Notification`** to dispatch.

#### 4.10 Analytics & Financial Audit CSV Reporting
1. Click **`Analytics`**.
2. Review Workshop KPIs: Active Intakes, Service Revenue, Average Turnaround Hours, Technician Efficiency Ratings.
3. Click **`Download Jobs CSV`** to export complete job card transactional history.
4. Click **`Download Inventory CSV`** to export inventory valuation and stock audit reports.

#### 4.11 UI & Form Field Customization
1. Click **`Business Setup Questions`** (Transition View) -> **`UI & Field Customizer`**.
2. View all system form fields across categories (*Customer Information*, *Tool Details*, *Grievance & Service*, *Billing*).
3. Add custom text, number, select, date, or boolean fields, toggle field required flags, or disable non-essential fields.

#### 4.12 Automatic Daily Database Backups & MySQL Export
1. Under **`Business Setup Questions`**, enable **Automatic Daily Backups**.
2. Choose destination: `LocalStorage Snapshot`, `Downloadable JSON File`, or `Both`.
3. **MySQL Local Deployment Export**: Under Inventory Manager or Transition view, click **`Export Local MySQL DB (.sql)`** to download `bosch_service_db_local_deploy.sql` containing full DDL (`CREATE TABLE`) and DML (`INSERT INTO`) statements for local MySQL self-hosting.

---

### 5. SYSTEM LIMITATIONS & BOUNDARY CONDITIONS

| Feature Area | Operational Boundary / Limitation | Mitigation Strategy |
| :--- | :--- | :--- |
| **Browser Local Storage** | Client state stored in `localStorage` (~5MB - 10MB limit depending on browser). | Export MySQL `.sql` dump or enable daily JSON backups. |
| **Offline Operation** | Core Job Card editing, time tracking, and search work offline. Gemini AI features require an active internet connection to reach Gemini API endpoints. | Standard deterministic fallback diagnostic routines trigger automatically when offline. |
| **Barcode Scanners** | Requires standard HID keyboard emulation mode on hardware scanner devices. | Soft SKU manual search input is available as fallback. |
| **WhatsApp Dispatch** | Direct browser WhatsApp links open `https://wa.me/` protocol. | Operator must have WhatsApp Web or Desktop client installed. |

---

### 6. VENDOR & STAFF TRAINING MANUAL

#### 6.1 Front-Desk Service Receptionist Checklist
- [ ] **Step 1**: Greet customer, open `+ Intake Form`.
- [ ] **Step 2**: Inspect physical tool condition (check cable, body cracks, chuck wear) and note accessories received.
- [ ] **Step 3**: Select precise grievance category (*Motor Sparking*, *No Power*, *Low Impact*, etc.).
- [ ] **Step 4**: Obtain customer signature on digital pad and click `Submit`.
- [ ] **Step 5**: Print job tag and attach tag securely to tool carrying case.

#### 6.2 Bench Repair Technician Workflow
- [ ] **Step 1**: Open assigned card in `Service Cards` or `Kanban Board`.
- [ ] **Step 2**: Click `Clock In` on the `Bench Time Clock` widget.
- [ ] **Step 3**: Click `✨ Run Gemini AI Diagnosis` to view root cause analysis and recommended repair procedures.
- [ ] **Step 4**: Perform teardown and test bench checks. Click `Link Part` for required spare parts SKUs.
- [ ] **Step 5**: Complete repair work, click `Clock Out`, and shift status to `Ready for Pickup`.

#### 6.3 Workshop Manager & Inventory Lead Protocols
- [ ] **Step 1**: Morning review of `Analytics` dashboard and technician active workload.
- [ ] **Step 2**: Open `1,000 SKUs` -> Click `✨ AI Reorder Recommendations` -> Review low stock velocity items.
- [ ] **Step 3**: Export `AI PO CSV` sheet for vendor spare part procurement.
- [ ] **Step 4**: Verify automatic daily backup execution and export monthly MySQL `.sql` database snapshots.

---
*Manual compiled and maintained for Bosch Authorised Service Hub Operations.*
