# Quality Assurance & Testing Acceptance Guide

This guide defines acceptance tests for the AutoTrack Pro service center application. It covers 22 core features, multi-client database synchronization, offline Service Worker resilience, Kanban cloud sync indicators, and automated dev-team verification suites.

---

## Table of Contents
1. [Test Environment Setup](#1-test-environment-setup)
2. [Feature 1: Voice Note Dictation & Transcription](#2-feature-1-voice-note-dictation--transcription)
3. [Feature 2: Technician Performance Analytics](#3-feature-2-technician-performance-analytics)
4. [Feature 3: AI Recommended Spare Parts](#4-feature-3-ai-recommended-spare-parts)
5. [Feature 4: Unique QR Code on Printed PDF Job Card](#5-feature-4-unique-qr-code-on-printed-pdf-job-card)
6. [Feature 5: AI Response Assistant](#6-feature-5-ai-response-assistant)
7. [Feature 6: Weekly Technician Calendar & Capacity Scheduler](#7-feature-6-weekly-technician-calendar--capacity-scheduler)
8. [Feature 7: Technician Repair Sign-Off Signature Pad](#8-feature-7-technician-repair-sign-off-signature-pad)
9. [Feature 8: Bulk CSV Import for Client Maintenance Schedules](#9-feature-8-bulk-csv-import-for-client-maintenance-schedules)
10. [Feature 9: Analytics Dashboard Metric Visibility Toggles](#10-feature-9-analytics-dashboard-metric-visibility-toggles)
11. [Feature 10: Camera Barcode & QR Code Scanner (8 Entry Points)](#11-feature-10-camera-barcode--qr-code-scanner-8-entry-points)
12. [Feature 11: Multi-Client Live Sync, REST APIs & Client Delivery Portal](#12-feature-11-multi-client-live-sync-rest-apis--client-delivery-portal)
13. [Feature 12: Predictive Monthly Revenue Forecast (Recharts LineChart)](#13-feature-12-predictive-monthly-revenue-forecast-recharts-linechart)
14. [Feature 13: Offline Service Worker Caching & Job Card Viewing](#14-feature-13-offline-service-worker-caching--job-card-viewing)
15. [Feature 14: Inventory Bulk Import (Excel TSV & CSV Paste)](#15-feature-14-inventory-bulk-import-excel-tsv--csv-paste)
16. [Feature 15: Automated Customer Feedback SMS & CSAT Ratings](#16-feature-15-automated-customer-feedback-sms--csat-ratings)
17. [Feature 16: Job Card Email Notifications & Portal Links](#17-feature-16-job-card-email-notifications--portal-links)
18. [Feature 17: Grouped Header Menus, Bulk Status Update & Intake Signature Calibration](#18-feature-17-grouped-header-menus-bulk-status-update--intake-signature-calibration)
19. [Feature 18: Consumption-Based Reorder Points, Draft PO PDFs, 30-Day Op Expenses vs. Labor Chart & D3.js Consumption Trends](#19-feature-18-consumption-based-reorder-points-draft-po-pdfs-30-day-op-expenses-vs-labor-chart--d3js-consumption-trends)
20. [Feature 19: Kanban Board Cloud Sync Status Indicator & Offline Queue Recovery](#20-feature-19-kanban-board-cloud-sync-status-indicator--offline-queue-recovery)
21. [Feature 20: Average Time to Replenish Summary Card (`AnalyticsDashboard`)](#21-feature-20-average-time-to-replenish-summary-card-analyticsdashboard)
22. [Feature 21: High-Contrast Light & Dark Theme Toggle (`Header` & `CustomerView`)](#22-feature-21-high-contrast-light--dark-theme-toggle-header--customerview)
23. [Feature 22: Full-Width Global Search Bar & Last-5 Recent Job Searches (`Header`)](#23-feature-22-full-width-global-search-bar--last-5-recent-job-searches-header)
24. [Database & Dummy Dataset Verification Matrix](#24-database--dummy-dataset-verification-matrix)
25. [End-to-End Regression Test Script & Dev-Team Automation](#25-end-to-end-regression-test-script--dev-team-automation)

---

## 1. Test Environment Setup

### Prerequisites
- Node 22 runtime installed.
- Modern browser: Chrome 120+, Edge 120+, or Firefox 120+.
- Working audio input (microphone) for voice testing.
- Local server running on port 3000 via `npm run dev`.

### Quick Smoke Check
1. Start dev server: `npm run dev`.
2. Open `http://localhost:3000`.
3. Verify the intake dashboard loads without console exceptions.

---

## 2. Feature 1: Voice Note Dictation & Transcription

### Location
`Job Cards` tab -> Select any active ticket -> `JobCardDetail` modal -> `Internal Repair Notes & Voice Dictation` or `Detailed Complaint`.

### Test Cases

#### TC-VN-01: Voice Note Transcription into Detailed Complaint
- **Preconditions**: Ticket opened in `Intake` or `Diagnosing` state.
- **Steps**:
  1. Click `Record Voice Note` next to the `Detailed Complaint` input.
  2. Grant browser microphone permissions when prompted.
  3. Speak a 5-second sentence: "Armature commutator segments show deep pitting and copper discoloration."
  4. Click `Stop Recording`.
- **Expected Outcome**:
  - Live preview reflects recorded audio.
  - Spinner displays: "Transcribing audio recording into Detailed Complaint...".
  - Transcribed text appends to the complaint box with a timestamp prefix: `[Voice Note YYYY-MM-DD HH:MM]`.
  - An audit log item `VOICE_NOTE_TRANSCRIBED` appends to the timeline.

#### TC-VN-02: Voice Dictation into Internal Repair Notes
- **Preconditions**: Same ticket open.
- **Steps**:
  1. Click the target pill `Internal Notes`.
  2. Click `Record Voice Note`.
  3. Speak: "Replaced 608 2RS bearing and repacked gearbox with 30 grams of lithium grease."
  4. Click `Stop Recording`.
- **Expected Outcome**:
  - Text appends directly into `internalRepairNotes`.
  - Ticket auto-saves without page reload.

#### TC-VN-03: Microphone Permission Denied (Negative Test)
- **Steps**:
  1. Block microphone permissions in browser settings for `localhost:3000`.
  2. Click `Record Voice Note`.
- **Expected Outcome**:
  - Error banner renders: "Microphone permission denied. Allow mic access in browser settings to record voice notes."
  - App state remains interactive; manual text input remains editable.

#### TC-VN-04: Cancellation During Audio Recording
- **Steps**:
  1. Click `Record Voice Note`.
  2. Speak for 2 seconds.
  3. Click `Cancel`.
- **Expected Outcome**:
  - Audio capture aborts immediately.
  - Neither complaint nor internal notes receive edits.
  - Recording indicator resets to default state.

---

## 3. Feature 2: Technician Performance Analytics

### Location
`Analytics` tab -> Scroll to `Technician Performance Section (Calculated from Audit Logs)`.

### Test Cases

#### TC-TP-01: Turnaround Time Calculation Verification
- **Preconditions**: At least 3 job cards exist with audit logs containing `JOB_INTAKE_CREATED` and `STAGE_CHANGED` or `STATUS_CHANGE` to `Completed`.
- **Steps**:
  1. Navigate to the `Analytics` tab.
  2. Scroll down to `Technician Performance`.
  3. Locate `David Miller (Bosch Master Certified)` and `Marcus Vance (Senior Electrical Tech)`.
- **Expected Outcome**:
  - Displays `Average Turnaround Time` formatted in hours or decimal days.
  - Displays `Total Jobs Completed` counter.
  - Values match difference between initial intake timestamp and final completion audit entry.

#### TC-TP-02: Real-Time Metric Update on Ticket Completion
- **Steps**:
  1. Note current completed count for `David Miller`.
  2. Navigate to `Job Cards` tab and pick an open ticket assigned to David Miller.
  3. Advance ticket status from `Repairing` to `Completed`.
  4. Return to `Analytics` tab.
- **Expected Outcome**:
  - Completed jobs count increments by 1.
  - Turnaround time recalculates to factor in the new completion span.

#### TC-TP-03: Zero-Job Technician Display (Edge Case)
- **Preconditions**: A technician exists with 0 completed tickets in audit logs.
- **Expected Outcome**:
  - Turnaround time renders as `N/A` or `0.0 hrs`.
  - Jobs completed counter displays `0`.
  - Visual layout displays clean empty metric without NaN or division by zero errors.

---

## 4. Feature 3: AI Recommended Spare Parts

### Location
`Job Cards` tab -> Select ticket -> `Inventory Spare Parts Search & AI Recommended Parts`.

### Test Cases

#### TC-RP-01: Automated Model and Grievance Analysis
- **Preconditions**: Ticket tool is `Bosch Professional GBH 2-26 DFR` with complaint `SDS chuck slipping and motor sparking`.
- **Steps**:
  1. Scroll down to the `Recommended Parts` card.
  2. Click `Recommend Parts` (or `Refresh Recommendations`).
- **Expected Outcome**:
  - Loading skeleton appears during `/api/ai/recommend-parts` inference.
  - Suggested parts list displays relevant SKUs:
    - Carbon Brush Set (`1617014144`)
    - Quick-Change SDS Plus Chuck (`2608572213`)
  - Each item displays unit price, in-stock quantity, and matching rationale.

#### TC-RP-02: Single Part Attachment to Job Ticket
- **Steps**:
  1. Click `+ Add to Job` next to Carbon Brush Set.
- **Expected Outcome**:
  - Item adds to the job card's active parts list.
  - Total quote amount updates instantly.
  - Button state changes to `Added ✓` and disables.

#### TC-RP-03: Batch Part Attachment via Attach All
- **Steps**:
  1. Click `Attach All Recommended Parts`.
- **Expected Outcome**:
  - All remaining unlinked parts append to the job card ticket.
  - Inventory reservation registers for each item.
  - Financial summary recalculates subtotal, tax, and grand total.

---

## 5. Feature 4: Unique QR Code on Printed PDF Job Card

### Location
`Job Cards` tab -> Select ticket -> Click `Print PDF Job Card` or `Download PDF`.

### Test Cases

#### TC-QR-01: Receipt QR Matrix Rendering
- **Preconditions**: Ticket possesses a valid `publicAccessToken` (e.g. `pat-7741-f09b`).
- **Steps**:
  1. Open ticket `BOSCH-2026-0041`.
  2. Click `Print PDF Job Card`.
  3. Inspect the lower receipt section in the PDF preview modal.
- **Expected Outcome**:
  - A 28mm high-density QR code appears inside the receipt bounding box.
  - Header text reads: `SCAN FOR LIVE STATUS`.
  - Displays human-readable token string below the code.
  - Code contains embedded hyperlink targeting `/?view=customer&token=pat-7741-f09b`.

#### TC-QR-02: Mobile Camera Scan & Status Portal Navigation
- **Steps**:
  1. Scan the on-screen QR code using a smartphone camera (or click the embedded hyperlink in the PDF viewer).
- **Expected Outcome**:
  - Browser opens public client status portal.
  - Renders live repair progress tracker without requiring client login.
  - Displays tool brand, serial number, quoted amount, and stage badge (`In Repair`).

---

## 6. Feature 5: AI Response Assistant

### Location
`Messaging` tab -> Select a client ticket in the left list -> View `AI Response Assistant` panel on right.

### Test Cases

#### TC-RA-01: Status Inquiry Suggestion Generation
- **Preconditions**: Select job card with status `Awaiting Parts`.
- **Steps**:
  1. In the AI Response Assistant panel, select prompt chip `Status Update`.
  2. Click `Suggest Reply`.
- **Expected Outcome**:
  - Generator queries `/api/ai/response-assistant`.
  - Suggests context-aware message containing client name, tool model, and awaiting parts status.
  - Character count remains under 220 characters.

#### TC-RA-02: Quotation Approval Suggestion
- **Steps**:
  1. Click prompt chip `Pricing / Estimate`.
  2. Click `Suggest Reply`.
- **Expected Outcome**:
  - Suggests copy referencing exact estimate total and pre-approved limit.
  - Includes clear call to action: "Reply YES to approve quote or call workshop."

#### TC-RA-03: Pre-filling Composer and WhatsApp Dispatch
- **Steps**:
  1. Click `Use Suggestion` on the generated text.
  2. Click `Send via WhatsApp Web`.
- **Expected Outcome**:
  - Text copies directly into the active message composer.
  - Launches `https://wa.me/{phone}?text=...` with URL-encoded message text.
  - Logs outgoing handoff in message history ledger with honest `'Pending'` status badge (and `'Sent'` only when a real Twilio/Meta API returns `success: true`).

---

## 7. Feature 6: Weekly Technician Calendar & Capacity Scheduler

### Location
`Time Tracking` tab -> Scroll to `Weekly Workshop Calendar & Capacity Scheduler`.

### Test Cases

#### TC-WC-01: 7-Day Grid View & Shift Allocation
- **Steps**:
  1. Open `Time Tracking` tab.
  2. View 7-day columns (Monday through Sunday).
  3. Verify technician capacity bars at top.
- **Expected Outcome**:
  - Renders all 4 shop technicians.
  - Displays weekly shift capacity (e.g. `32 / 40 hrs`).
  - Progress bar turns amber when technician load reaches 90%.

#### TC-WC-02: Assigning Job Card to Day Slot
- **Steps**:
  1. Click `+ Schedule Ticket` on `Wednesday`.
  2. Select technician `David Miller` and ticket `BOSCH-2026-0041`.
  3. Set duration to `2.5 hours` and shift to `Morning (08:00 - 12:00)`.
  4. Click `Save Slot`.
- **Expected Outcome**:
  - Job card pill renders inside Wednesday morning column.
  - David Miller's weekly scheduled hours increment by 2.5 hours.
  - State persists on browser refresh.

#### TC-WC-03: Filtering Schedule by Technician
- **Steps**:
  1. Click `Marcus Vance` in the technician load header filter.
- **Expected Outcome**:
  - Calendar isolates shifts and assigned slots for Marcus Vance.
  - Other technician slots hide from view.
  - Click `All Technicians` restores full shop roster.

---

## 8. Feature 7: Technician Repair Sign-Off Signature Pad

### Location
`Job Cards` tab -> Select ticket -> Advance status to `Completed` -> `Technician Sign-Off & Bench Signatures`.

### Test Cases

#### TC-SP-01: Drawing and Saving Digital Signature
- **Steps**:
  1. Open ticket in `Repairing` stage.
  2. Set status to `Completed`.
  3. Scroll to `Technician Repair Sign-Off`.
  4. Draw signature on the canvas pad with mouse or stylus.
  5. Click `Save Sign-Off`.
- **Expected Outcome**:
  - Canvas converts vector strokes to data URL PNG format.
  - Status changes from `Pending Sign-Off` (amber) to `Signed & Verified` (emerald).
  - Signature displays in preview mode with clear verification badge.
  - Appends audit log entry: `TECHNICIAN_SIGNATURE_SAVED`.

#### TC-SP-02: Clearing and Redrawing Signature
- **Steps**:
  1. Click `Re-sign / Clear`.
  2. Draw a new signature curve.
  3. Click `Save Sign-Off`.
- **Expected Outcome**:
  - Canvas clears cleanly without artifacts.
  - Replaces previous signature image with updated vector stroke.

#### TC-SP-03: Signature Inclusion in Final PDF Invoice
- **Steps**:
  1. Click `Print PDF Job Card`.
  2. Scroll down to signature box at page bottom.
- **Expected Outcome**:
  - Technician signature image embeds cleanly beside client authorization line.

---

## 9. Feature 8: Bulk CSV Import for Client Maintenance Schedules

### Location
`Recurring Maintenance` tab -> Header action bar -> `Bulk Import CSV`.

### Test Cases

#### TC-CSV-01: 5-Record Sample Client Schedule Loader
- **Steps**:
  1. Open `Recurring Maintenance` tab.
  2. Click `Bulk Import CSV`.
  3. Click `Load 5 Sample Client Schedules`.
- **Expected Outcome**:
  - Text area populates with 5 formatted CSV client rows.
  - Validation grid displays `5 Total Rows`, `5 Valid Rows`, `0 Issues`.
  - Shows green `Valid` checkmarks on all 5 entries.
  - Next due dates calculate dynamically based on last service date + interval months.

#### TC-CSV-02: Validation Error Detection on Missing Required Columns
- **Steps**:
  1. Click `Reset Input`.
  2. Switch to `Paste CSV Text` tab.
  3. Paste invalid text:
     ```csv
     Client Name,Phone,Model Number,Interval
     Acme Builders,,GBH 2-26,6
     ,555-9876,,12
     ```
- **Expected Outcome**:
  - Validation grid detects 2 issues.
  - Row 1 flags error: `Missing client phone number`.
  - Row 2 flags error: `Missing client name` and `Missing model number`.
  - Filter tabs allow toggling between `All (2)`, `Valid (0)`, and `Issues (2)`.

#### TC-CSV-03: Executing Batch Import with Skip Invalid Rows
- **Steps**:
  1. Paste mixed CSV with 1 valid row and 1 invalid row.
  2. Verify checkbox `Skip invalid rows and import only valid entries (1)` is checked.
  3. Click `Import 1 Schedules`.
- **Expected Outcome**:
  - Modal closes automatically.
  - Toast banner appears: `Imported 1 client maintenance schedules.`
  - Valid row appends to active recurring maintenance grid.
  - Record persists in localStorage (`autotrack_db_recurring_maintenance_v1`).

#### TC-CSV-04: Exporting Client Schedules to CSV
- **Steps**:
  1. Click `Export CSV` on the Recurring Maintenance toolbar.
- **Expected Outcome**:
  - Browser downloads file `client_tool_maintenance_schedules_YYYY-MM-DD.csv`.
  - File contains RFC 4180 headers with all client names, phones, tools, intervals, and due dates.

#### TC-CSV-05: CSV Format Guide & Instruction Modal
- **Steps**:
  1. Click `CSV Format Guide` on the Recurring Maintenance toolbar.
  2. Inspect the displayed column specifications table.
  3. Click `Download Template`.
  4. Inspect the downloaded file: `standard_client_maintenance_template.csv`.
- **Expected Outcome**:
  - Instruction modal opens with 7-column specification table.
  - Required columns (`customerName`, `modelNumber`) display distinct required badges.
  - Preformatted sample code block displays with one-click copy button.
  - Template downloads containing 5 realistic client equipment rows.

#### TC-CSV-06: Direct File Selection Ingestion via Bulk Import Button
- **Steps**:
  1. Click `Bulk Import CSV` on the toolbar.
  2. Select `docs/samples/recurring_maintenance_standard.csv`.
- **Expected Outcome**:
  - Hidden file input processes the file change event cleanly (including UTF-8 BOM Excel CSVs).
  - Parser normalizes 7 headers (`customerName`, `toolBrand`, `toolCategory`, `modelNumber`, `serialNumber`, `intervalMonths`, `recommendedServiceScope`).
  - Calls `onAddSchedules` with 10 parsed records using functional state updates.
  - Displays toast notification: `Imported 10 client maintenance schedules.`

#### TC-CSV-07: Database Persistence & Table Target Verification (`autotrack_db_recurring_maintenance_v1`)
- **Preconditions**: Complete `TC-CSV-06` by importing 10 records.
- **Steps**:
  1. Open Browser DevTools -> `Application` -> `Local Storage` -> `http://localhost:3000`.
  2. Inspect the key `autotrack_db_recurring_maintenance_v1` (do not confuse with `autotrack_db_job_cards_v1` or `autotrack_db_inventory_v1`).
  3. Refresh the browser page (`F5`) and return to the `Servicing` (Recurring Maintenance) tab.
- **Expected Outcome**:
  - `autotrack_db_recurring_maintenance_v1` contains the 10 newly imported records appended to existing schedules.
  - Each record includes valid `id` (`MAINT-2026-XXX`), `lastServiceDate`, `nextDueDate` (`YYYY-MM-DD`), `status` (`Upcoming` | `Due Soon` | `Overdue`), `customerPhone` (`N/A` default), and `serialNumber` (`SN-UNASSIGNED` default).
  - Total tracked tools count and imported rows remain intact after reload.

#### TC-CSV-08: MySQL Export & Relational Schema Parity (`recurring_maintenance`)
- **Preconditions**: At least 1 CSV-imported schedule exists in active state.
- **Steps**:
  1. Navigate to `1,000 SKUs` (Inventory) tab and click `Export Local MySQL DB (.sql)`.
  2. Open the downloaded `.sql` file in a text editor.
  3. Search for `INSERT INTO \`recurring_maintenance\``.
- **Expected Outcome**:
  - SQL file contains the `CREATE TABLE IF NOT EXISTS \`recurring_maintenance\`` DDL matching `/database.sql`.
  - File emits `INSERT INTO \`recurring_maintenance\`` statements for every imported schedule.
  - Every `NOT NULL`, `ENUM`, `DATE`, and `INT` field aligns with the MySQL table schema without `NULL` constraint violations.

---

### Database Schema & Persistence Mapping

| CSV Field | Runtime Key (`autotrack_db_recurring_maintenance_v1`) | SQL Column (`recurring_maintenance`) | Constraint / Default |
| :--- | :--- | :--- | :--- |
| Auto-generated | `id` | `id` | `VARCHAR(64) PRIMARY KEY` (`MAINT-2026-XXX`) |
| `customerName` | `customerName` | `customer_name` | `VARCHAR(255) NOT NULL` (Required) |
| `customerCompany` | `customerCompany` | `customer_company` | `VARCHAR(255) NULL` |
| `customerPhone` | `customerPhone` | `customer_phone` | `VARCHAR(50) NOT NULL` (Defaults to `'N/A'`) |
| `customerEmail` | `customerEmail` | `customer_email` | `VARCHAR(100) NULL` |
| `toolBrand` | `toolBrand` | `tool_brand` | `VARCHAR(100) NOT NULL` (`'Bosch Professional'`) |
| `toolCategory` | `toolCategory` | `tool_category` | `VARCHAR(100) NOT NULL` (`'Rotary Hammer / SDS'`) |
| `modelNumber` | `modelNumber` | `model_number` | `VARCHAR(100) NOT NULL` (Required) |
| `serialNumber` | `serialNumber` | `serial_number` | `VARCHAR(100) NOT NULL` (`'SN-UNASSIGNED'`) |
| `intervalMonths` | `intervalMonths` | `interval_months` | `INT NOT NULL` (`6`) |
| `lastServiceDate` | `lastServiceDate` | `last_service_date` | `DATE NOT NULL` (`YYYY-MM-DD`) |
| `nextDueDate` | `nextDueDate` | `next_due_date` | `DATE NOT NULL` (Auto-calculated) |
| Computed | `status` | `status` | `ENUM('Upcoming','Due Soon','Overdue','Serviced')` |
| `recommendedServiceScope` | `recommendedServiceScope` | `recommended_service_scope` | `TEXT NOT NULL` |
| `notes` | `notes` | `notes` | `TEXT NULL` |

---

### Standardized CSV Datasets in `/docs/samples/`
- **`docs/samples/recurring_maintenance_standard.csv`**: 7-column standard format.
- **`docs/samples/recurring_maintenance_full.csv`**: 12-column extended format with client emails and notes.
- **`docs/samples/spare_parts_inventory_sample.csv`**: Catalog inventory import dataset.
- **`docs/samples/service_job_cards_sample.csv`**: Intake and service tickets dataset.
- **`docs/samples/README.md`**: Specification manual for all dataset schemas.

---

## 10. Feature 9: Analytics Dashboard Metric Visibility Toggles

### Location
`Business Setup` (`TransitionView`) -> `Analytics Dashboard Metrics Visibility` panel.

### Supported Metric Keys (8 Total)
- **Core KPIs (4)**: `activeJobs` (Active Jobs), `lowInventory` (Low Inventory), `revenue` (Revenue), `todaysAppointments` (Today's Appointments).
- **Dashboard Sections (4)**: `avgRepairTime` (Average Repair Time), `topGrievance` (Top Grievances), `technicianPerformance` (Technician Performance), `categoryVolume` (Tool Category Volume).

### Test Cases

#### TC-AM-01: Toggling Individual Analytics Metrics
- **Steps**:
  1. Open `Business Setup` and scroll to `Analytics Dashboard Metrics Visibility`.
  2. Uncheck `Revenue` and `Tool Category Volume`.
  3. Click `Open Analytics`.
- **Expected Outcome**:
  - Revenue KPI card, labor/parts billing chart, and Tool Category Volume chart disappear immediately.
  - Remaining 6 enabled metrics stay visible.
  - Reloading the page (`F5`) preserves toggled state in `autotrack_db_settings_v1` and Firestore `settings/workshop-default`.

#### TC-AM-02: Preset Buttons (`Core 4 Only`, `Enable All`, `Reset Defaults`)
- **Steps**:
  1. Click `Core 4 Only`.
  2. Switch to `Analytics` tab and count visible widgets.
  3. Return to `Business Setup` and click `Enable All`.
- **Expected Outcome**:
  - `Core 4 Only` enables only `activeJobs`, `lowInventory`, `revenue`, and `todaysAppointments`.
  - `Enable All` and `Reset Defaults` restore all 8 widgets to visible.

---

## 11. Feature 10: Camera Barcode & QR Code Scanner (8 Entry Points)

### Supported Entry Points
1. Global Top Header Scanner (`Header` -> `Scan` -> `GlobalScanResultModal`)
2. Full Intake Form (`BoschIntakeForm` -> `Scan Serial / QR`)
3. Quick Intake Modal (`NewJobModal` -> `Scan Serial / QR`)
4. Spare Parts Catalog (`InventoryManager` -> `Barcode / QR Scan`)
5. Add Inventory Modal (`AddInventoryModal` -> `Scan SKU / Barcode`)
6. Job Card List Toolbar (`JobCardList` -> `Scan Ticket / Tool`)
7. Job Card Detail Drawer (`JobCardDetail` -> `Scan Part / Serial`)
8. Recurring Maintenance Toolbar (`RecurringMaintenanceView` -> `Scan Tool QR`)

### Test Cases

#### TC-BS-01: Live Camera Barcode & QR Recognition
- **Preconditions**: Device with webcam or mobile camera on HTTPS / `localhost:3000`.
- **Steps**:
  1. Open `Intake Form` (`BoschIntakeForm`) and click `Scan Serial / QR`.
  2. Grant browser camera permissions when requested.
  3. Point camera at a Code-128 tool serial barcode (`SN-3611B67000`) or QR code (`BOSCH-2026-0041`).
- **Expected Outcome**:
  - `SerialBarcodeScannerModal` decodes via native `BarcodeDetector` (with `jsQR` + `/api/ai/scan-serial` vision fallback on unsupported browsers).
  - Serial number field populates without manual typing.
  - If an inventory SKU or ticket QR matches, `GlobalScanResultModal` or item lookup opens directly to the matched record.

#### TC-BS-02: Vision Fallback & Manual Upload (`/api/ai/scan-serial`)
- **Steps**:
  1. Deny or close live camera stream in `SerialBarcodeScannerModal`.
  2. Upload or capture a photo of a damaged Bosch nameplate label.
- **Expected Outcome**:
  - Frontend posts base64 image frame to `POST /api/ai/scan-serial`.
  - Gemini vision extracts printed serial/model characters and inserts the string into the active form field.

---

## 12. Feature 11: Multi-Client Live Sync, REST APIs & Client Delivery Portal

### Location
- **Live Cloud Database**: Firebase Auth (`Google Sign-In`) + Cloud Firestore (`ai-studio-autotrackservice-2eac3d40-310f-46ba-a293-99682d0a94d7`).
- **Server Endpoints**: `server.ts` on Port `3000` (`/api/jobs`, `/api/inventory`, `/api/schedules`, `/api/sync/stream`, `/api/customer-portal/lookup`, `/api/customer-portal/stream`).
- **Public Portal**: `CustomerView` (`/?view=customer&token=...`).

### Test Cases

#### TC-SYNC-01: Two-Browser Live Operator Synchronization
- **Preconditions**: Two browser windows (Browser A desktop, Browser B Android tablet/second profile) signed in via Google Auth.
- **Steps**:
  1. Create a new ticket `BOSCH-2026-0099` in Browser A.
  2. Advance an existing ticket status to `Ready for Pickup` in Browser A.
- **Expected Outcome**:
  - Browser B displays `BOSCH-2026-0099` and the status transition within 2 seconds via Firestore `onSnapshot` without manual refresh.
  - Both windows receive updated KPIs and inventory stock counts.

#### TC-SYNC-02: Zero-PII Public Client Delivery Portal (`CustomerView`)
- **Preconditions**: Ticket possesses `publicAccessToken` (e.g. `tok-apex-2026-0041-sec`).
- **Steps**:
  1. Open an unauthenticated incognito window at `http://localhost:3000/?view=customer&token=tok-apex-2026-0041-sec`.
  2. Test bare-ID gating: enter `BOSCH-2026-0041` without phone last-4 digits; confirm verification prompt and HTTP `403` on `/api/customer-portal/lookup`. Then enter the matching last-4 digits.
  3. Advance the same ticket in the signed-in operator session from `In Service` to `Completed`.
- **Expected Outcome**:
  - Unverified bare-ID searches reveal zero tool specs, company names, or PDF receipts.
  - Verified or token-based portal loads tool model, masked serial, quote estimate, PDF download, and live status stage via `publicDeliveries/{token}` and `/api/customer-portal/stream` SSE.
  - Response JSON contains zero client phone numbers, email addresses, internal technician notes, or GST tax IDs.
  - Stage badge updates live in the incognito portal when the operator changes status.

#### TC-SYNC-03: Android / Tablet REST API Bearer Auth & CORS Enforcement
- **Steps**:
  1. Send unauthenticated request: `curl -i http://localhost:3000/api/jobs`.
  2. Send CORS preflight request: `curl -i -X OPTIONS -H "Origin: http://localhost" -H "Access-Control-Request-Method: GET" http://localhost:3000/api/jobs`.
  3. Send SSE preflight/auth check: `curl -i http://localhost:3000/api/sync/stream`.
- **Expected Outcome**:
  - Unauthenticated `/api/jobs` and `/api/sync/stream` return `HTTP 401` (`Unauthorized`).
  - CORS `OPTIONS` returns `HTTP 204` with `Access-Control-Allow-Headers: Content-Type, Authorization`.
  - Sending a valid Firebase ID token in `Authorization: Bearer <idToken>` returns `HTTP 200` JSON or SSE stream.

#### TC-SEC-01: Firestore Security Rules Validation (`Dirty Dozen` Suite)
- **Steps**:
  1. Run rules static lint: `npx eslint firestore.rules` (or inspect rules).
  2. Run emulator security test suite: `npx tsx firestore.rules.test.ts`.
- **Expected Outcome**:
  - Unauthenticated clients cannot list or read `/jobCards`, `/inventory`, `/schedules`, `/settings`, or `/users`.
  - Unauthenticated clients cannot `list` the entire `/publicDeliveries` collection (only single-document `get` by secret token).
  - Read-only/viewer roles cannot mutate `/jobCards` or `/inventory`.

---

## 13. Feature 12: Predictive Monthly Revenue Forecast (Recharts LineChart)

### Location
`Analytics` tab -> `Predictive Monthly Revenue Forecast` section (`RevenueForecastModule`).

### Test Cases

#### TC-PF-01: Historical & Seasonal LineChart Projection
- **Preconditions**: At least 1 active or completed job card in workshop history; `revenue` metric enabled in Business Setup.
- **Steps**:
  1. Open the `Analytics` tab and scroll to `Predictive Monthly Revenue Forecast`.
  2. Inspect the Recharts `LineChart` and 4 KPI summary cards (`Horizon Total`, `Projected Monthly Avg`, `Peak Seasonal Month`, `Open Job Pipeline`).
- **Expected Outcome**:
  - Solid line renders recorded monthly billings; dashed sky-blue line projects upcoming months from `Forecast Start`.
  - Hovering chart points displays `Actual Revenue`, `Projected Revenue`, `Confidence Range`, `Seasonal Factor`, and `Est. Tickets`.

#### TC-PF-02: Horizon (`3M`, `6M`, `12M`) & Scenario Controls
- **Steps**:
  1. Switch horizon from `6M Horizon` to `12M Horizon`.
  2. Switch scenario from `Baseline` to `Growth`, then `Conservative`.
  3. Toggle `Confidence Band` off and back on.
- **Expected Outcome**:
  - X-axis and forecast breakdown table dynamically recalculate across `3`, `6`, or `12` future months.
  - Upper (`+Confidence`) and Lower (`-Confidence`) Recharts `Line` series show/hide cleanly.

#### TC-PF-03: Empty Job History Handling (Edge Case)
- **Preconditions**: All job cards deleted or marked `Cancelled`.
- **Expected Outcome**:
  - Empty state panel renders `"No Job Card History Available for Forecasting"` without NaN values or chart crashes.

---

## 14. Feature 13: Offline Service Worker Caching & Job Card Viewing

### Location
Registered globally via `src/main.tsx` (`public/sw.js` + `src/utils/offlineCache.ts` + `OfflineIndicator`).

### Test Cases

#### TC-SW-01: Service Worker Registration & Cache Population
- **Steps**:
  1. Open `http://localhost:3000` in Chrome/Edge and wait 2 seconds after load.
  2. Open DevTools -> `Application` -> `Service Workers` and `Cache Storage`.
- **Expected Outcome**:
  - `/sw.js` shows status `activated and is running`.
  - `autotrack-static-v1` holds `/`, `/index.html`, `/manifest.webmanifest`, `/icon.svg`, and PWA icons.
  - `autotrack-data-v1` holds `/__offline-cache/jobCards.json`, `inventory.json`, `schedules.json`, and `settings.json`.

#### TC-SW-02: Offline Job Card Viewing After Network Disconnect
- **Steps**:
  1. In DevTools `Network`, enable `Offline` throttling.
  2. Reload `http://localhost:3000`.
  3. Navigate between `Service Cards`, `Kanban`, `1,000 SKUs`, and open any Job Card detail modal.
- **Expected Outcome**:
  - Bottom-left badge displays `Offline Mode · N Cached Job Cards Readable`.
  - App shell loads from `autotrack-static-v1`; Job Cards and Inventory remain searchable and readable without server connectivity.

#### TC-SW-03: Cache Recovery When Local Browser Keys Are Removed Offline
- **Steps**:
  1. While remaining offline, remove `autotrack_db_*` keys from browser storage (keeping `autotrack-data-v1` intact) and reload the page.
- **Expected Outcome**:
  - `readOfflineCachedAllRecords()` hydrates `jobCards`, `inventory`, `schedules`, and `settings` back into React state from `autotrack-data-v1`.

---

## 15. Feature 14: Inventory Bulk Import (Excel TSV & CSV Paste)

### Location
`1,000 SKUs` (`InventoryManager`) tab -> `Bulk Import Excel / CSV` (`InventoryBulkImportModal`).

### Test Cases

#### TC-INVCSV-01: Direct Excel / Google Sheets Tab-Separated Paste
- **Steps**:
  1. Open `1,000 SKUs` -> click `Bulk Import Excel / CSV`.
  2. Copy a 3-row range with header from Excel/Sheets (`sku\tname\tstockQty\tunitPrice\tbinLocation`) and paste into the modal textarea.
- **Expected Outcome**:
  - Parser detects `Excel TSV (Tabs)` automatically and classifies matching SKUs as `UPDATE` and unknown SKUs as `NEW`.

#### TC-INVCSV-02: Merge Modes (`Update + Add New`, `Add Qty to Stock`, `New SKUs Only`)
- **Steps**:
  1. Click `Load 10 Sample Bosch Parts` (or upload `docs/samples/spare_parts_inventory_sample.csv`).
  2. Toggle between `Update + Add New`, `Add Qty to Stock` (`replenish`), and `New SKUs Only`.
  3. Click `Apply Import`.
- **Expected Outcome**:
  - `replenish` previews additive quantities (`prev + added`); `New SKUs Only` skips existing SKUs; `upsert` updates stock/prices and adds new rows.
  - Changes persist to `localStorage`, Service Worker cache, and Firestore.

#### TC-INVCSV-03: Invalid Row Detection & Filtering
- **Steps**:
  1. Paste a CSV row missing `sku` or with negative `unitPrice`.
- **Expected Outcome**:
  - Row highlights in the `Issues` filter tab with explicit error text; `Skip invalid rows` imports only valid items cleanly.

---

## 16. Feature 15: Automated Customer Feedback SMS & CSAT Ratings

### Location
Kanban / Job Card status -> `Completed`; `FeedbackSmsToast`; `CustomerView` (`&feedback=1`); `JobCardDetail`; `AnalyticsDashboard` CSAT panel.

### Test Cases

#### TC-CF-01: Auto-Trigger Feedback SMS on `Completed` Status
- **Preconditions**: `Business Setup` -> `Auto-Send Customer Feedback SMS Survey upon Job Completion` is checked (default `true`). Ticket `BOSCH-2026-0041` is in `Ready for Pickup`.
- **Steps**:
  1. Change ticket status to `Completed` via Kanban drag, Quick Status menu, or `JobCardDetail`.
- **Expected Outcome**:
  - Frontend stamps `feedbackSmsSentAt`, dispatches `POST /api/messaging/send-sms`, logs a `Feedback` SMS entry in `messageLogs`, and renders `FeedbackSmsToast` with a 1-click survey URL (`?token=...&feedback=1`).

#### TC-CF-02: Public Portal Star Rating & Comment Submission (`POST /api/customer-portal/feedback`)
- **Steps**:
  1. Open the survey link from `FeedbackSmsToast` (or click `Customer Feedback` in `JobCardDetail`).
  2. Select `5` stars, enter comment `"Fast turnaround and quiet gearbox after overhaul."`, and submit.
- **Expected Outcome**:
  - Client sends `POST /api/customer-portal/feedback` and persists `customerFeedback` (`rating`, `comment`, `submittedAt`, `channel`) onto both the job card and `publicDeliveries/{token}`.
  - `JobCardList`, `KanbanBoard`, and `JobCardDetail` display the `★ 5/5` rating badge, and `Analytics` updates Average CSAT & Star Breakdown.

#### TC-CF-03: Server Validation Bounds (`rating` & `comment` length)
- **Steps**:
  1. Send `POST /api/customer-portal/feedback` with `rating: 0`, `rating: 6`, or a `1001`-character comment.
- **Expected Outcome**:
  - `server.ts` rejects invalid payloads with `HTTP 400` JSON validation error without truncating oversized comments.

#### TC-CF-04: Firestore Rule Exception on `Completed` Job Cards
- **Steps**:
  1. Run `npx tsx firestore.rules.test.ts`.
- **Expected Outcome**:
  - Non-admin workshop members can update feedback fields on `Completed` job cards (`customerFeedback`, `feedbackSmsSentAt`, `messageLogs`, `auditLogs`, `updatedAtIso`, `updatedAt`), while attempts to tamper with billed totals on `Completed` tickets remain denied.

---

## 17. Feature 16: Job Card Email Notifications & Portal Links

### Location
`Service Cards` -> Open ticket (`JobCardDetail`) -> Header **Email Customer** button -> `POST /api/messaging/send-email` -> `GET /api/messaging/status`.

### Test Cases

#### TC-EMAIL-01: Dispatching Repair Update & Portal Link via Email Modal
- **Preconditions**: Ticket has a valid `customerEmail` (or operator enters one in the modal). Optional provider keys (`SENDGRID_API_KEY` + `MAIL_FROM`, `RESEND_API_KEY` + `MAIL_FROM`, or `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`) configured in `.env`.
- **Steps**:
  1. Open ticket `BOSCH-2026-0041` in `JobCardDetail`.
  2. Click **Email Customer**.
  3. Confirm pre-filled recipient email, subject, and body containing the live Client Portal URL (`/?view=customer&token=...`).
  4. Click **Send Email Update**.
- **Expected Outcome**:
  - Frontend posts to `/api/messaging/send-email` with `to`, `subject`, `body`, and `jobId`.
  - When a provider succeeds, `messageLogs` appends an `'Email'` channel record (`recipientEmail` populated) with status `'Sent'`.
  - When no server email credentials are configured, fallback behavior logs `'Pending'` without exposing server secrets, matching `MessageLog['status']` invariants.

#### TC-EMAIL-02: Messaging Provider Status Probe & SQL Export Parity
- **Steps**:
  1. Run `curl http://localhost:3000/api/messaging/status`.
  2. In `Business Setup` or `1,000 SKUs`, click **Export Local MySQL DB (.sql)** and inspect `message_logs` table DDL and `INSERT` rows.
- **Expected Outcome**:
  - `/api/messaging/status` returns boolean provider flags (`sendgrid`, `resend`, `smtp`) and `mailFrom` without leaking API keys or passwords.
  - Exported SQL `message_logs` includes `'Email'` in the `channel` enum/check constraint and `recipient_email VARCHAR(254)`.

---

## 18. Feature 17: Grouped Header Menus, Bulk Status Update & Intake Signature Calibration

### Location
Top navigation bar (`Header.tsx`), `Service Cards` list (`JobCardList.tsx`), and `Tool Intake Form` signature pad (`BoschIntakeForm.tsx`).

### Test Cases

#### TC-NAV-01: Grouped Dropdown Navigation Beneath Global Search Bar
- **Steps**:
  1. Inspect desktop layout (`>= 1024px`) in `Header.tsx`.
  2. Click each group trigger beneath the search bar (`Jobs & Intake`, `Inventory & Servicing`, `Messaging & Portal`, `Analytics & Team`, `Settings & Tools`).
  3. Press `Escape` or click outside the menu bar.
- **Expected Outcome**:
  - All 5 categorized dropdown menus open cleanly under the search bar with live badge counts (`activeJobCount`, `lowStockCount`, `dueMaintenanceCount`).
  - Clicking outside or pressing `Escape` closes the open dropdown immediately.

#### TC-BULK-01: Multi-Select & Bulk Status Update with Stock Lifecycle Consistency
- **Preconditions**: At least 2 tickets exist in `Intake` or `Diagnosis` with attached parts and `deductStockOn: 'InService'`.
- **Steps**:
  1. Open `Service Cards` (`JobCardList`).
  2. Select 2 cards via individual checkboxes (or click `Select All`).
  3. Choose `In Service` in the `Bulk update target status` dropdown and click **Bulk Update Status (2)**.
- **Expected Outcome**:
  - Both cards transition to `In Service`, append `STAGE_CHANGED` audit entries (`Bulk Status: In Service`), trigger `applyStockLifecycleTransition` once per card, and clear the active selection with a confirmation banner.
  - Repeating with target `Completed` triggers completion feedback SMS for eligible tickets.

#### TC-SIG-CAL-01: Intake Digital Signature Cursor-to-Canvas Calibration
- **Steps**:
  1. Open `+ Intake Form` (`BoschIntakeForm.tsx`) at desktop (`1440px`), tablet (`768px`), and resized split-screen widths.
  2. Slowly draw a diagonal X from top-left corner to bottom-right corner inside the Client Authorization Signature `<canvas>`.
- **Expected Outcome**:
  - Drawn stroke tracks directly beneath the pointer/touch cursor with zero horizontal or vertical drift regardless of CSS container scaling (`scaleX = canvas.width / rect.width`, `scaleY = canvas.height / rect.height`).

---

## 19. Feature 18: Consumption-Based Reorder Points, Draft PO PDFs, 30-Day Op Expenses vs. Labor Chart & D3.js Consumption Trends

### Location
`1,000 SKUs` (`InventoryManager` Notification Center, `Reorder Point Sheet`, and `AiReorderRecommendations` -> `Download Draft PO PDF`) and `Analytics` financial/D3 charts (`AnalyticsDashboard`).

### Test Cases

#### TC-PO-01: Consumption-Based Automated Reorder Points & Direct Draft Purchase Order PDF Generation
- **Preconditions**: Historical active `jobCards` include consumed spare parts (`parts[]`), and at least 1 inventory item has `stockQty < suggestedReorderPoint` (derived from `avgMonthlyConsumptionRate * 1.5` floored at `minStockThreshold` via `analyzeInventoryReorderPoints`).
- **Steps**:
  1. Open `1,000 SKUs` and inspect the **Inventory Notification Center** badge (`N BELOW AUTO REORDER PT`) or click **Reorder Point Sheet**.
  2. Verify each part displays its `Avg / Mo Burn` rate and `Auto Reorder Pt`.
  3. Click **Download Draft PO PDF** directly from `InventoryManager` (or optionally run `Spark AI Reorder Analysis` and click `Download Draft PO PDF`).
- **Expected Outcome**:
  - Cancelled job cards are excluded from monthly burn calculations.
  - Browser downloads `Draft_PO_Bosch_Parts_YYYY-MM-DD.pdf`.
  - PDF renders `DRAFT PURCHASE ORDER` header banner, part SKUs, current vs. automated reorder thresholds, suggested reorder quantities, unit costs, extended totals, and grand PO total.

#### TC-D3-01: 30-Day Operational Expenses vs. Labor Income & Live D3.js Monthly Consumption Chart
- **Preconditions**: `Revenue` metric enabled in `Business Setup`.
- **Steps**:
  1. Navigate to `Analytics` and scroll below `Monthly Service Revenue`.
  2. Inspect **Operational Expenses vs Labor Income (Last 30 Days)** Recharts `BarChart` and **D3.js Monthly Consumption Trends (High-Frequency Parts)** SVG chart.
- **Expected Outcome**:
  - Recharts `BarChart` plots daily `laborIncome` (`#34d399`) alongside `operationalExpenses` (`#f59e0b`, computed via `getEffectiveJobBilling`) over the last 30 days with interactive tooltips.
  - D3.js SVG dynamically renders smoothed monotone curves, data points with hover `<title>` tooltips, X/Y axes, and color legend for the highest-frequency consumed SKUs computed from `jobCards` via `computeMonthlyPartConsumptionTrends` (or an empty state if no parts are logged yet), without console errors or duplicate SVG nodes on re-render.

---

## 20. Feature 19: Kanban Board Cloud Sync Status Indicator & Offline Queue Recovery

### Location
`Kanban Board` (`KanbanBoard.tsx`), `src/App.tsx`, `src/utils/firestoreSync.ts`, `src/utils/cloudSyncStatus.ts`.

### Test Cases

#### TC-KSYNC-01: Signed-Out Local Mode Badge State
- **Preconditions**: Operator is signed out of Google Auth (`authUser === null`).
- **Steps**:
  1. Open `Kanban Board`.
  2. Inspect the `Cloud Sync` summary card and individual job cards.
- **Expected Outcome**:
  - Every card displays **Pending Offline Sync · Sign In** (amber/local styling), and the board summary reports `N Pending`.

#### TC-KSYNC-02: Signed-In Live Cloud Sync Confirmation
- **Preconditions**: Sign in with a verified Google account on `localhost:3000` with internet active.
- **Steps**:
  1. Open `Kanban Board`.
  2. Drag card `BOSCH-2026-0041` to the next column (e.g., `Ready for Pickup`).
- **Expected Outcome**:
  - Card saves to Firestore (`upsertJobCardInFirestore`), `{ includeMetadataChanges: true }` confirms `hasPendingWrites === false` and `fromCache === false`, and card badge renders emerald **Synced to Cloud**.

#### TC-KSYNC-03: Offline Mutation Queue & Automatic Reconnect Flush
- **Preconditions**: Signed in with verified Google account and cards initially showing **Synced to Cloud**.
- **Steps**:
  1. In DevTools -> `Network`, set throttling to `Offline`.
  2. Drag `BOSCH-2026-0041` (or click `<` / `>`) to change its stage while offline.
  3. Inspect `localStorage` key `autotrack_pending_cloud_sync_jobs_v1` and Kanban card badges.
  4. Restore `Online` connectivity in DevTools (keep tab focused).
- **Expected Outcome**:
  - While offline, the modified card immediately displays amber **Pending Offline Sync**, persists its ID in `autotrack_pending_cloud_sync_jobs_v1`, and untouched cards remain **Synced to Cloud**.
  - On reconnect, `App.tsx` automatically flushes `pendingCloudSyncIds` to Firestore without overwriting the offline status edit, clears the card from `pendingCloudSyncIds`, and flips its indicator back to emerald **Synced to Cloud**.
  - Reloading mid-offline preserves **Pending Offline Sync** until connectivity returns; clicking manual **Sync** while online/authenticated retries any single pending card immediately.

---

## 21. Feature 20: Average Time to Replenish Summary Card (`AnalyticsDashboard`)

### Location
`Analytics` tab (`AnalyticsDashboard.tsx`) KPI Grid -> **Average Time to Replenish** card; duration helpers in `src/utils/inventoryReplenishment.ts`.

### Test Cases

#### TC-REPL-01: Average Replenish Duration Calculation & Pending Count
- **Preconditions**: `lowInventory` metric is enabled in `Business Setup`. At least 1 inventory SKU has `lowStockTimestamp` older than `lastRestocked`, and optionally another SKU still awaiting restock.
- **Steps**:
  1. Open `Analytics` and inspect the **Average Time to Replenish** KPI card next to **Low Inventory**.
  2. Navigate to `1,000 SKUs`, trigger a low-stock alert via `-1` adjustment (`lowStockTimestamp` stamped automatically), then click `+10` / `+ Receive Restock` on a subsequent date (`lastRestocked` updated).
  3. Return to `Analytics` and verify updated counts.
- **Expected Outcome**:
  - Card displays calculated average days (`avgDays`) and hours (`avgHours`) from `lowStockTimestamp` to `lastRestocked`, alongside `N restocked · M awaiting`.
  - When no replenished items have a valid pair yet, the card shows `Pending (awaiting restock)` cleanly without `NaN`.

---

## 22. Feature 21: High-Contrast Light & Dark Theme Toggle (`Header` & `CustomerView`)

### Location
Top-right utility bar in `Header.tsx` (`data-testid="theme-toggle"`), Client Portal header (`CustomerView.tsx`), pre-paint loader in `index.html`, and helpers in `src/utils/theme.ts`.

### Test Cases

#### TC-THEME-01: Toggling Between Dark & High-Contrast Light Themes with Reload Persistence
- **Preconditions**: Application open in default Dark theme (`document.documentElement.classList.contains('dark') === true`).
- **Steps**:
  1. Click the **Light** (`Sun`) button in the Header utility bar.
  2. Navigate across `Intake Form`, `Service Cards`, `Kanban Board`, `Analytics` (checking Recharts tooltips and D3.js trend chart), and `Print Tag` (`PrintableJobCardModal`).
  3. Reload the browser (`F5`), then open `Client Portal` and inspect its header toggle.
- **Expected Outcome**:
  - `.dark` class clears from `<html>`, `localStorage['autotrack_theme_mode_v1']` stores `'light'`, and `<meta name="theme-color">` updates to `#ffffff`.
  - Cards, inputs, text, inverted buttons (`bg-zinc-950 text-white`), and chart strokes render cleanly in high-contrast daylight colors, while `#printable-job-card` remains crisp white A4 paper (`bg-white text-black`).
  - Reloading preserves the selected light theme immediately with zero pre-paint dark flash.

---

## 23. Feature 22: Full-Width Global Search Bar & Last-5 Recent Job Searches (`Header`)

### Location
Full-width search bar (`<section aria-label="Global workshop search">`) placed directly beneath the top header bar (`Header.tsx`), backed by `src/utils/recentSearches.ts` (`autotrack_recent_job_searches_v1`).

### Test Cases

#### TC-SEARCH-01: Full-Width Search Filtering & Keyboard `Enter` Shortcut
- **Steps**:
  1. Inspect desktop (`1440px`), tablet (`768px`), and mobile (`390px`) layouts. Confirm the global search bar spans the full page width directly under `<header>` without crowding Row 1 brand/utility buttons.
  2. Type `BOSCH-2026-0041` (or a client phone/serial/SKU) and inspect results; repeat with a single matching ticket and press `Enter`.
- **Expected Outcome**:
  - Search bar occupies full horizontal page width (`w-full`) with centered search, clear (`X`), and QR/Barcode icons.
  - Pressing `Enter` opens the top matched job card immediately and clears the query.

#### TC-SEARCH-02: Recent Searches Dropdown (Last 5 Job IDs) & Persistence
- **Steps**:
  1. Search and open 6 distinct Job Cards sequentially from the global search bar.
  2. Click inside the empty search input to focus it (`recent-searches-dropdown`).
  3. Select the 3rd listed Job ID, then test individual item dismissal (`X`) and **Clear history**.
- **Expected Outcome**:
  - Focusing the empty search bar opens the Recent Searches dropdown displaying only the last **5** opened Job IDs (`5/5 Job IDs`), ordered newest-first.
  - Selecting an ID opens that job card immediately and promotes its ID to position 1 without creating duplicates; the preference persists across reloads in `autotrack_recent_job_searches_v1`.
  - Clicking `X` removes only that ID; clicking **Clear history** empties `autotrack_recent_job_searches_v1` cleanly.

---

## 24. Database & Dummy Dataset Verification Matrix

All 3 database engines and sample CSV files are shipped with deterministic demonstration data for immediate QA testing. Refer to [`DATABASE_SETUP_AND_INTEGRATION_GUIDE.md`](DATABASE_SETUP_AND_INTEGRATION_GUIDE.md) for installation commands.

| Target Environment | Artifact / Entry Point | Verification Command / Action | Expected Seed Result |
| :--- | :--- | :--- | :--- |
| **MySQL 8.0+ / MariaDB** | `/database.sql` | `node scripts/validate_sql.js` then `mysql -u root -p < database.sql` | Creates `bosch_service_db` with 11 tables, `admin` user, 5 settings rows (`auto_send_feedback_sms`, `analytics_metrics`), sample SKUs, 3 tickets (`BOSCH-2026-0046` with 5-star feedback), `'Feedback'` & `'Email'` `message_logs`, and schedules. |
| **PostgreSQL 16** | `/database.postgres.sql` | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database.postgres.sql` | Creates all 11 tables using `SERIAL`, `TIMESTAMPTZ`, `JSONB`, `CHECK` constraints (`customer_feedback_rating BETWEEN 1 AND 5`, `'Email'` channel + `recipient_email`), and loads demo rows including `BOSCH-2026-0046` cleanly. |
| **Cloud Firestore (Live)** | `seedWorkshopIfEmpty()` in `src/utils/firestoreSync.ts` | Sign in with Google on an empty Firestore instance (`ai-studio-autotrackservice-2eac3d40-310f-46ba-a293-99682d0a94d7`). | Automatically seeds initial job cards, spare parts inventory, settings (including 8 analytics toggles + `autoSendFeedbackSms`), and `publicDeliveries`. |
| **Browser Demo + Service Worker** | `src/utils/localStorageDb.ts` & `public/sw.js` | Clear browser `localStorage` and reload `http://localhost:3000`. | Hydrates demo dataset (1,000 SKUs, 7 job cards, 5 technicians, sample maintenance rows) and caches records in `autotrack-data-v1`. |
| **CSV & Excel Fixtures** | `docs/samples/*.csv` | Load via `Servicing -> Bulk Import CSV`, `1,000 SKUs -> Bulk Import Excel / CSV`, or `Business Setup -> Restore`. | Validates headers, skips malformed rows cleanly when toggled, and persists to `recurring_maintenance` or `inventory_items`. |

---

## 25. End-to-End Regression Test Script & Dev-Team Automation

### 25.1 Automated Dev-Team Verification Suite
Run the full automated suite before every release or PR merge (recorded results are also maintained in [`../testing_docs/README.md`](../testing_docs/README.md)):

```bash
# Single-command UAT environment probe + lint + unit tests + rules + SQL + prod build + smoke check
./scripts/uat_local_setup.sh          # Linux / macOS
scripts\uat_local_setup.bat           # Windows

# Or execute individual checks:
node scripts/check_local_services.mjs # Probe PostgreSQL, MySQL, SQLite, Redis, Mongo, Firebase, Docker, port 3000
npm run lint                          # Strict TypeScript check (tsc --noEmit)
npm test                              # All 25 utility + seed unit suites (63 tests covering all 26 src/utils/* modules)
npm run validate:sql                  # State-machine lexer over database.sql & database.postgres.sql
npx eslint firestore.rules            # Firestore rules security static analysis
npx tsx firestore.rules.test.ts       # Dirty Dozen & schema boundary rules checks
npx tsx scripts/verify_message_status.ts
npx tsx scripts/verify_portal_gate.ts
npx tsx scripts/verify_stock_ledger.ts
curl -s http://localhost:3000/api/ai/status # Confirm resolved GEMINI_TEXT_MODEL & GEMINI_AUDIO_MODEL
npm run build                         # Build Vite client + dist-server/server.cjs
npm run smoke                         # Boot built server on port 3199 & verify /, customer portal, /api/messaging/status
```

### 25.2 Manual E2E Flow (15-Minute Regression)

1. **Theme Toggle, Full-Width Search, Recent Searches & Multi-Client Sync**:
   - Switch between Dark and Light modes via the Header **Light/Dark** button, reload, and confirm zero flash.
   - Search and open 2 job cards from the full-width search bar beneath `<header>`, focus the empty search box to reopen one via **Recent Searches**, and verify the 5 grouped menus (`Jobs & Intake`, `Inventory & Servicing`, `Messaging & Portal`, `Analytics & Team`, `Settings & Tools`).
   - Sign in with Google on Browser A and Browser B (`localhost:3000`) to confirm live Firestore sync.
2. **Camera Barcode/QR & Calibrated Signature Intake**:
   - Open `+ Intake Form`, click `Scan Serial / QR`, register tool `Bosch GBH 11 DE`, verify the signature stroke aligns under cursor at any viewport width, and submit `BOSCH-2026-004X`.
   - Confirm the new card syncs to Browser B within 2 seconds.
3. **Kanban Cloud Sync Badge & Offline Reconnect Queue**:
   - Open `Kanban Board`, verify `BOSCH-2026-004X` displays **Synced to Cloud**.
   - Toggle DevTools `Network -> Offline`, move a card stage, verify **Pending Offline Sync**, restore `Online`, and verify automatic flush returns the card to **Synced to Cloud**.
4. **Bulk Status Update & AI Diagnosis**:
   - In `Service Cards`, select 2 cards via checkboxes and apply **Bulk Update Status**; open a ticket, click `Run AI Diagnosis`, and click `Attach All Recommended Parts`.
5. **Voice Observation & Email Dispatch**:
   - Click `Record Voice Note`, dictate a bench note, then click **Email Customer** in `JobCardDetail` and confirm `/api/messaging/send-email` logs an `'Email'` entry.
6. **Calendar Shift Booking**:
   - Open `Time Tracking`. Assign ticket to David Miller on Thursday morning.
7. **Finalization, Technician Signature & Auto Feedback SMS**:
   - Mark status `Completed`. Sign the technician sign-off pad and save. Verify `FeedbackSmsToast` renders.
8. **PDF Receipt, Delivery Portal & Customer Rating**:
   - Generate PDF receipt, open `/?view=customer&token=...&feedback=1` in an incognito window, and submit a 5-star rating.
   - Confirm `★ 5/5` badge appears in List & Kanban views and updates CSAT in `Analytics`.
9. **Analytics Forecast, Replenish KPI, 30-Day Op Expense Chart, D3 Trends & Direct Draft PO PDF**:
   - Open `Analytics`: inspect **Average Time to Replenish**, `Operational Expenses vs Labor Income (Last 30 Days)`, live `D3.js Monthly Consumption Trends`, and `Predictive Monthly Revenue Forecast` (`3M`, `6M`, `12M`).
   - Open `Business Setup`, test `Analytics Dashboard Metrics Visibility` (`Core 4 Only` -> `Enable All`).
   - Open `1,000 SKUs`: verify `Avg / Mo Burn` and `Auto Reorder Pt` in `Reorder Point Sheet`, download a **Draft PO PDF** directly from `InventoryManager`, and test `Spark AI Reorder Analysis`.
10. **Inventory Bulk Excel/CSV, Fleet Maintenance CSV & Offline Cache**:
    - Test `Bulk Import Excel / CSV` in `1,000 SKUs` and `Bulk Import CSV` (`docs/samples/recurring_maintenance_standard.csv`) in `Servicing`.
    - Toggle DevTools `Network -> Offline`, reload page, and confirm cached Job Cards remain viewable with the `Offline Mode` badge.

---

## Document Control
- **Document Version**: 4.4.0
- **Audience**: QA Engineers, Software Developers, Workshop Supervisors, Implementation Leads
- **Classification**: Internal Technical Specification


