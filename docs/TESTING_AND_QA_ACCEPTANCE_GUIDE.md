# Quality Assurance & Testing Acceptance Guide

This guide defines acceptance tests for the AutoTrack Pro service center application. It covers 8 core features introduced across recent release cycles.

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
10. [End-to-End Regression Test Script](#10-end-to-end-regression-test-script)

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
- **Preconditions**: At least 3 job cards exist with audit logs containing `JOB_INTAKE_CREATED` and `STATUS_CHANGE` to `Completed` or `Delivered`.
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
  - Code contains embedded hyperlink targeting `#status?token=pat-7741-f09b` or `/track?token=pat-7741-f09b`.

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
  - Logs outgoing transmission in message history ledger.

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

## 10. End-to-End Regression Test Script

Perform this 10-minute flow to verify workshop system health:

1. **Intake Flow**:
   - Register new tool: `Bosch GBH 11 DE` for client `Metro Demolition`.
   - Capture client signature on intake pad.
   - Confirm generated ticket ID format: `BOSCH-2026-004X`.
2. **AI Diagnosis & Parts**:
   - Click `Run AI Diagnosis`.
   - Verify recommended parts display with SKU and pricing.
   - Click `Attach All Recommended Parts`.
3. **Voice Observation**:
   - Click `Record Voice Note`. Dictate bench observation and stop.
   - Confirm transcript appends to `internalRepairNotes`.
4. **Calendar Shift Booking**:
   - Open `Time Tracking`. Assign ticket to David Miller on Thursday morning.
5. **Finalization & Technician Signature**:
   - Mark status `Completed`.
   - Sign the technician sign-off pad and save.
6. **PDF Generation & QR Scan**:
   - Generate PDF receipt. Verify QR code renders with status link.
7. **Client Notification**:
   - Open `Messaging`. Generate AI Response Assistant message and dispatch via WhatsApp.
8. **Fleet Maintenance Onboarding**:
   - Open `Recurring Maintenance`. Click `Bulk Import CSV` and load 5 sample schedules.
   - Confirm total tracked tools counter increments by 5.

---

## Document Control
- **Document Version**: 1.0.0
- **Audience**: QA Engineers, Workshop Supervisors, Implementation Leads
- **Classification**: Internal Technical Specification
