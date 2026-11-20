# AutoTrack Pro — End-User UAT Manual & Testing Guide

**Purpose:** Plain-language test guide for workshop counter staff, bench technicians, parts clerks, and managers.  
**Feedback Sheet:** Record every test result in [`UAT_FEEDBACK_TEMPLATE.xlsx`](./UAT_FEEDBACK_TEMPLATE.xlsx) inside this same folder.  
**No technical background required.** Follow each numbered step on screen and compare what you see with **"What good looks like."**

---

## 1. Before You Start (5-Minute Setup)

1. Open your test website link in **Google Chrome**, **Microsoft Edge**, or **Safari** (on a laptop, desktop, or tablet).
2. Download or open [`UAT_FEEDBACK_TEMPLATE.xlsx`](./UAT_FEEDBACK_TEMPLATE.xlsx) in **Microsoft Excel** or **Google Sheets**.
3. On the first tab (`Summary_Instructions`), fill in your **Name**, **Workshop Role**, **Date**, and **Browser/Device**.
4. Work through the test cases below (`UAT-01` to `UAT-32`) on the second tab (`UAT_Feedback`).
5. Pick one of these **4 exact statuses** in the **Status** dropdown for every row you test:

| Status Choice | When to Pick It |
| :--- | :--- |
| **Pass** | Every step worked as described, buttons responded, and nothing looked broken. |
| **Fail** | A button did nothing, an error appeared, numbers were wrong, or data disappeared. |
| **Needs Improvement** | It worked, but the wording, button placement, contrast, or speed felt confusing or slow. |
| **Other** | You could not test it (for example, no webcam or no email/SMS test number), or you want to leave a general note. |

> **Tip:** If you pick **Fail** or **Needs Improvement**, write 1–2 short sentences in **Actual Result / What Happened** explaining what you clicked and what went wrong. Screenshots shared with your coordinator help too.

---

## 2. Role Quick-Map (Who Should Test Which Sections)

| Workshop Role | Focus Test Cases |
| :--- | :--- |
| **Front Counter / Reception** | `UAT-01` to `UAT-11`, `UAT-14`, `UAT-15`, `UAT-26` to `UAT-28` |
| **Bench Technician** | `UAT-04` to `UAT-06`, `UAT-12` to `UAT-19` |
| **Spare Parts / Store Clerk** | `UAT-02`, `UAT-20` to `UAT-25` |
| **Workshop Manager / Owner** | All sections, especially `UAT-11`, `UAT-17`, `UAT-22`, `UAT-28` to `UAT-32` |

---

## 3. Step-by-Step Test Cases (`UAT-01` to `UAT-32`)

---

### Section A — Screen Theme, Alerts & Account Access

#### `UAT-01` — Switch Between Dark Mode and Light Mode
* **Where to look:** Top header bar, right side (`Light` or `Dark` button next to the bell icon).
* **Steps:**
  1. Look at the current background color of the app.
  2. Click the **Light / Dark** theme button once.
  3. Open 2 or 3 different menus (for example, `Service Cards`, `Spare Parts Catalog`, and `Analytics`).
  4. Refresh the browser page (`F5` or Reload button).
  5. Click the theme button again to switch back.
* **What good looks like:**
  * All panels, cards, tables, buttons, and text switch cleanly between dark and high-contrast light colors.
  * Every label remains easy to read with no white-on-white or dark-on-dark hidden text.
  * After reloading the page, the app remembers your chosen theme.

#### `UAT-02` — Check the Inventory Notification Bell
* **Where to look:** Top header bar, bell icon with a red count badge (when alerts exist).
* **Steps:**
  1. Click the **Bell** icon (`Inventory Notification Center`).
  2. Read the list of low-stock alerts inside the panel.
  3. Click an alert action button (or `Mark all read` / dismiss).
* **What good looks like:**
  * The notification panel opens smoothly and lists spare parts running low or out of stock.
  * Clicking an action updates the unread badge count cleanly without crashing.

#### `UAT-03` — Sign In / Sign Out & Install App Prompt
* **Where to look:** Top header bar, right side (`Sign In` or your Google user button, plus `Install App` if your browser offers it).
* **Steps:**
  1. Click **Sign In** (if testing live multi-user sync) and sign in with an authorized Google account, or verify the button opens the Google sign-in popup.
  2. If **Install App** appears in the header, click it once to inspect the browser install dialog (you may cancel or complete install).
  3. Click **Sign Out** if you signed in during step 1.
* **What good looks like:**
  * Sign-in completes cleanly and displays your active status instead of freezing.
  * Note: If no Google test account is available, record **Other** and note "No test Google account."

---

### Section B — Full-Width Search, Recent Searches & Camera Scanner

#### `UAT-04` — Search Across Tickets, Clients, Phones, SKUs & Serials
* **Where to look:** Wide search bar stretching across the full page width directly under the top header.
* **Steps:**
  1. Click inside the full-width search bar.
  2. Type a client's first name or phone digits (or part of a tool model like `GBH`).
  3. Clear the text (`X` button on the right of the search bar) and type an exact Job ID (for example `JC-2025-1001`) and press **Enter**.
* **What good looks like:**
  * The search bar spans the full width cleanly below the header.
  * Typing filters the visible list right away; pressing **Enter** on a matching ticket opens that Job Card.
  * Clicking the `X` button clears the search text in one click.

#### `UAT-05` — Re-Open One of Your Last 5 Searched Job IDs
* **Where to look:** Same full-width search bar.
* **Steps:**
  1. Search and open 2 or 3 different Job IDs (for example via pressing **Enter** or opening a searched job).
  2. Clear the search bar so it is empty, then click inside the empty search box.
  3. Check the **Recent Searches** dropdown that appears underneath.
  4. Click one of the listed Job IDs.
  5. Open the dropdown again, click the small `X` beside one entry, and then test **Clear history**.
* **What good looks like:**
  * Up to 5 recently searched Job IDs appear in a neat dropdown when focusing the empty search box.
  * Clicking a Job ID opens that ticket right away.
  * Removing 1 entry deletes only that row; **Clear history** empties the list.

#### `UAT-06` — Scan a Barcode or QR Code with Camera (or Photo)
* **Where to look:** Camera/QR icon at the right end of the full-width search bar, OR `Settings & Tools` → `QR & Barcode Scanner`.
* **Steps:**
  1. Click the camera/QR icon in the search bar.
  2. Point your webcam or phone camera at any printed tool barcode or QR receipt (or upload a photo of a tool label if supported).
  3. Inspect the lookup result dialog that pops up.
* **What good looks like:**
  * Camera permission prompt or image upload works cleanly.
  * Detected code opens matching job cards or spare parts, or fills the search bar.
  * If testing on a desktop with no webcam, pick **Other** and note "No webcam available."

---

### Section C — Counter Tool Intake & New Ticket Creation

#### `UAT-07` — Complete a Full Counter Intake Form
* **Where to look:** Menu `Jobs & Intake` → `New Tool Intake Form`.
* **Steps:**
  1. Choose a **Tool Brand** (e.g., `Bosch`), **Model** (e.g., `GBH 2-26 DFR`), **Serial Number**, and **Voltage** (`230V` or `18V Cordless`).
  2. Enter a **Client Name**, **Company/Account**, **Mobile Phone**, and optional **Email**.
  3. Tick a defect category (e.g., `Dead Switch`) and check included accessories (e.g., `Carrying Case`, `Side Handle`).
  4. Type an **Approved Cost Limit** and verify any custom fields shown.
* **What good looks like:**
  * All dropdowns, checkboxes, and required field markers (`*`) respond smoothly.
  * Entering a Bosch serial number automatically decodes/fills manufacture/warranty cues where applicable.

#### `UAT-08` — Client Digital Signature Pad & Voice Note Dictation
* **Where to look:** Inside `New Tool Intake Form` (bottom area) or `Job Card Detail` notes.
* **Steps:**
  1. Using your mouse, trackpad, or finger, draw a signature inside the **Client Signature** box. Make sure the ink draws right under your cursor/finger (not shifted off to the side).
  2. Click **Clear** to test resetting the box, then draw again.
  3. Click **Record Voice Note** (microphone button), speak 1 short sentence about the tool fault, and stop recording.
  4. Submit the intake form to create the ticket.
* **What good looks like:**
  * Pen strokes match the exact tip of your cursor or finger across the whole box.
  * Voice recording saves spoken text into the complaint/notes field cleanly (if testing without a mic, note that in Comments).
  * Submitting creates a new Job Card with a new `JC-...` number and jumps to the ticket view.

#### `UAT-09` — Create a Ticket with the Quick Intake Modal
* **Where to look:** Top header right side (`+ New Intake` button) or `Jobs & Intake` → `Quick Intake Modal`.
* **Steps:**
  1. Click `+ New Intake`.
  2. Fill in Client Name, Phone, Tool Model, and Complaint.
  3. Click **Create Job Card** (submit).
* **What good looks like:**
  * A clean popup opens without leaving your current page.
  * Submitting adds the new card immediately to `Service Cards` and `Kanban Board`.

---

### Section D — Service Cards List & Bulk Status Updates

#### `UAT-10` — Browse, Filter & Sort Service Cards
* **Where to look:** Menu `Jobs & Intake` → `Service Cards`.
* **Steps:**
  1. Look through the list of job cards, customer names, tool models, statuses, and total amounts.
  2. Use any status filter tabs or sort options on the page.
  3. Click any ticket row to verify it opens that Job Card's detail page.
* **What good looks like:**
  * Status pills, priority tags, CSAT stars (on rated jobs), and totals line up cleanly with no overlapping text.

#### `UAT-11` — Bulk Update Status Across Multiple Cards
* **Where to look:** `Service Cards` (`JobCardList`) checkboxes beside each card.
* **Steps:**
  1. Check the boxes next to **2 or 3** test tickets (or test the **Select All** checkbox).
  2. Look at the **Bulk Update Status** toolbar that appears.
  3. Pick a new status (for example `In Progress`) and apply the bulk update.
* **What good looks like:**
  * All selected tickets switch to the chosen status at once.
  * Selecting `Cancelled` later restores any deducted spare parts cleanly; selecting `Completed` triggers completion logic.

---

### Section E — Job Card Detail, AI Bench Assistants & Printing

#### `UAT-12` — Update Ticket Details, Parts Used, Operational Expenses & Status
* **Where to look:** Click any ticket to open `Job Card Detail`.
* **Steps:**
  1. Change the ticket status (for example from `Intake` → `Diagnosed` → `Repairing`).
  2. Add 1 spare part from inventory and inspect the quantity/stock deduction.
  3. Add an **Operational Expense** (for example courier or consumables) and verify the **Total Amount** updates automatically.
* **What good looks like:**
  * Totals recalculate immediately (`Parts + Labor + Operational Expenses - Discount`).
  * Audit log records every status change with a timestamp.

#### `UAT-13` — Test Gemini AI Diagnosis, Recommended Parts & Repair Chatbot
* **Where to look:** Inside `Job Card Detail` (AI Diagnosis & Spare Parts panels).
* **Steps:**
  1. Click **Run Gemini AI Diagnosis** and wait a few seconds.
  2. Click **Recommend Parts** (or AI spare parts suggestions) and attach 1 suggested part with **1-Click Attach**.
  3. Open the **AI Repair Chatbot**, ask a practical repair question (e.g., *"What checks should I do before replacing the armature?"*), and send.
* **What good looks like:**
  * AI Diagnosis returns clear probable root causes, repair steps, and time estimate (no raw error messages).
  * Recommended parts show relevant inventory items that attach with 1 click.
  * Chatbot responds with helpful workshop troubleshooting steps.

#### `UAT-14` — Technician Repair Sign-Off & Printable QR Job Ticket / PDF
* **Where to look:** Inside `Job Card Detail` (`Technician Sign-Off` pad and `Print Service Ticket` / PDF actions).
* **Steps:**
  1. Draw a technician signature on the **Technician Repair Sign-Off** pad and save it.
  2. Click **Print Service Ticket** (or PDF download / preview modal).
  3. Verify the printable A4 sheet shows tool details, itemized costs, QR code, and both signatures.
  4. If using **Light** or **Dark** mode, confirm the A4 printed sheet stays crisp white paper with black text.
* **What good looks like:**
  * Printed ticket / PDF looks clean like a real paper invoice even when the app is in Dark mode.
  * The 2D QR code renders clearly on the sheet.

#### `UAT-15` — Send Progress Email (`Email Customer`)
* **Where to look:** Inside `Job Card Detail` (`Email Customer` button).
* **Steps:**
  1. Make sure the ticket has a valid test email address (edit client email if needed).
  2. Click **Email Customer**, review the pre-filled message, and click Send.
* **What good looks like:**
  * Confirmation banner shows whether the email sent or whether email credentials are not configured in this test environment.
  * If no live email relay is set up in UAT, note what message appeared and mark **Pass** (if graceful status message) or **Other** (if live delivery cannot be tested).

---

### Section F — Kanban Board & Cloud Sync Status

#### `UAT-16` — Move Cards Across the 7 Kanban Columns
* **Where to look:** Menu `Jobs & Intake` → `Kanban Board`.
* **Steps:**
  1. Check all 7 stage columns (`Intake` through `Completed`).
  2. Drag one card from one column into the next column **OR** click the `<` / `>` stage arrow buttons on the card.
* **What good looks like:**
  * Card moves smoothly into the new column and updates its status count immediately.

#### `UAT-17` — Check `Sync Status to Cloud` Indicator on Kanban Cards
* **Where to look:** Bottom/badge area on each card in `Kanban Board`.
* **Steps:**
  1. Look at the **Sync Status to Cloud** badge on any card (`Synced to Cloud`, `Pending Offline Sync`, or `Pending Offline Sync · Sign In`).
  2. If signed in, edit or move a card and watch the badge update.
  3. If offline or queued, click the manual **Sync** button when back online.
* **What good looks like:**
  * Every card clearly tells you whether its changes are saved to the cloud or waiting to sync.

---

### Section G — Technician Time Tracking & Weekly Calendar

#### `UAT-18` — Clock In & Clock Out on Technician Time Tracker
* **Where to look:** Menu `Analytics & Team` → `Time Tracking & Shifts`.
* **Steps:**
  1. Select a technician and active job card (if prompted).
  2. Click **Clock In**, wait 10–15 seconds, then click **Clock Out**.
* **What good looks like:**
  * Live timer counts seconds/minutes cleanly and saves a completed time log entry.

#### `UAT-19` — Schedule Workshop Slots on Weekly Calendar
* **Where to look:** Inside `Time Tracking & Shifts` (Weekly Workshop Calendar view).
* **Steps:**
  1. View the 7-day calendar grid and filter by technician.
  2. Add or inspect a scheduled repair slot or shift.
* **What good looks like:**
  * Daily technician workload bars display cleanly and warn if capacity approaches or exceeds 90%.

---

### Section H — Spare Parts Inventory, Reorder Points & Draft Purchase Orders

#### `UAT-20` — Search 1,000 SKUs & Review Low-Stock Alerts
* **Where to look:** Menu `Inventory & Servicing` → `Spare Parts Catalog` and `Low-Stock Alerts`.
* **Steps:**
  1. Open `Spare Parts Catalog`, search for `Brush` or `Chuck`, and scroll a few rows.
  2. Switch to `Low-Stock Alerts` (or low-stock filter) to see parts below minimum level.
* **What good looks like:**
  * Catalog loads rapidly without freezing the browser despite ~1,000 parts.
  * Low-stock items stand out clearly with red/amber indicators.

#### `UAT-21` — Add a New Part & Edit Stock Counts
* **Where to look:** Inside `Spare Parts Catalog` (`+ Add Part` button and row edit controls).
* **Steps:**
  1. Click **Add Part** (test scanning a barcode or typing a test SKU like `TEST-SKU-999`).
  2. Fill in Name, Category, Stock Qty, Min Threshold, and Price, then save.
  3. Adjust stock quantity up/down on an item.
* **What good looks like:**
  * New part appears in the catalog right away and persists after page refresh.

#### `UAT-22` — Automated Reorder Points & `Download Draft PO PDF`
* **Where to look:** Inside `Spare Parts Catalog` (Reorder Analysis / Low-Stock section + `Spark AI Reorder Analysis`).
* **Steps:**
  1. Check the **Average Monthly Burn Rate** and automated **Reorder Point** columns/cards on low-stock items.
  2. Click **Download Draft PO PDF** (or **Export Reorder PO CSV**).
  3. Open `Spark AI Reorder Analysis` to view AI reorder suggestions and test Draft PO export there too.
* **What good looks like:**
  * A clean, readable Draft Purchase Order PDF downloads listing low-stock SKUs, suggested order quantities, and supplier notes.

#### `UAT-23` — Bulk Import Excel / CSV Parts & Export MySQL `.sql`
* **Where to look:** Inside `Spare Parts Catalog` (`Bulk Import Excel / CSV` and `Export MySQL DB`).
* **Steps:**
  1. Click **Bulk Import Excel / CSV**.
  2. Copy 2–3 rows from a spreadsheet (or paste sample CSV text), pick an import mode (`Update + Add New`, `Add Qty to Stock`, or `New SKUs Only`), and inspect the preview grid before importing or cancelling.
  3. Click **Export MySQL DB** (or Download `.sql` Script) to verify a `.sql` file downloads.
* **What good looks like:**
  * Preview highlights valid rows vs. any formatting errors clearly before saving.
  * `.sql` download completes cleanly with non-empty file size.

---

### Section I — Recurring Tool Maintenance & CSV Schedules

#### `UAT-24` — Add Recurring Schedule, Queue WhatsApp Reminder & Create Ticket
* **Where to look:** Menu `Inventory & Servicing` → `Recurring Servicing`.
* **Steps:**
  1. Click `+ Register Tool Schedule`, enter client details, tool model, and service interval (e.g., `90` days), and save.
  2. Click the WhatsApp reminder button on a schedule row.
  3. Click **Create Job Card** on a schedule row to turn it into an active repair ticket.
* **What good looks like:**
  * Next due date calculates automatically.
  * Clicking **Create Job Card** creates a real ticket linked to that schedule.

#### `UAT-25` — Bulk Import & Export Maintenance CSV
* **Where to look:** Inside `Recurring Servicing` (`Bulk Import CSV` and CSV Export buttons).
* **Steps:**
  1. Click **Bulk Import CSV**, load the **5-record sample** (or paste CSV rows), check the validation grid, and import.
  2. Click **Export CSV** and confirm a spreadsheet file downloads.
* **What good looks like:**
  * Bad rows are flagged with clear reasons; skipping invalid rows imports the valid ones cleanly.

---

### Section J — Messaging Center & Public Client Status Portal

#### `UAT-26` — Generate AI Reply & Send WhatsApp / SMS in Messaging Center
* **Where to look:** Menu `Messaging & Portal` → `WhatsApp & SMS Dispatch`.
* **Steps:**
  1. Pick a Job Card in the Messaging Center.
  2. Click the **AI Response Assistant** button to draft a status update message.
  3. Review/edit the text and test sending/logging via **WhatsApp** or **SMS**.
* **What good looks like:**
  * AI drafts a polite message including the client's name, tool model, and current status.
  * Message appears in the sent/pending message log history below.

#### `UAT-27` — Open Client Status Portal & Verify Phone Last-4 Digits
* **Where to look:** Top header (`Client Portal` button) or `Messaging & Portal` → `Client Status Portal`.
* **Steps:**
  1. Open the **Client Status Portal**.
  2. Enter a known Job ID and first try **wrong** last-4 phone digits — verify access is blocked.
  3. Now enter the **correct** last-4 digits of the client's phone number and submit.
* **What good looks like:**
  * Wrong phone digits never reveal client company names, PDF receipts, or private notes.
  * Correct digits show clear stage progress, cost breakdown, and PDF download option.

#### `UAT-28` — Submit 1–5 Star Customer Rating (CSAT) in Client Portal
* **Where to look:** Inside `Client Status Portal` on a `Completed` ticket (or portal URL ending with `&feedback=1`).
* **Steps:**
  1. Move a test ticket to `Completed` first (if none is completed).
  2. Open that ticket in **Client Status Portal**.
  3. Select **1 to 5 stars**, type a brief comment, and click **Submit Feedback**.
* **What good looks like:**
  * Confirmation shows the submitted stars and comment.
  * Returning to `Service Cards` and `Kanban Board` displays the star rating badge on that ticket.

---

### Section K — Analytics, Charts & Revenue Forecasting

#### `UAT-29` — Review KPI Cards, Average Time to Replenish & Technician Performance
* **Where to look:** Menu `Analytics & Team` → `Analytics & Revenue Forecast`.
* **Steps:**
  1. Check top KPI cards (Active Jobs, Low Inventory, Revenue, Average Repair Time, Top Grievance).
  2. Locate the **Average Time to Replenish** KPI card and inspect days/hours shown.
  3. Scroll to the **Technician Performance** table and verify turnaround/completion figures.
* **What good looks like:**
  * Cards align cleanly in both desktop and tablet widths with readable labels in both Light and Dark themes.

#### `UAT-30` — Check 30-Day Expenses vs Labor Chart, D3 Trends & CSAT Panel
* **Where to look:** Inside `Analytics & Revenue Forecast`.
* **Steps:**
  1. Hover your mouse over bars in **Operational Expenses vs. Labor Income (Last 30 Days)** to read tooltips.
  2. Inspect the **D3.js Monthly Consumption Trends** line chart and hover/check legends.
  3. Check the **Customer Satisfaction (CSAT)** panel (including the rating you submitted in `UAT-28`) and click **Export CSV**.
* **What good looks like:**
  * Charts resize without clipping labels; tooltips show exact currency/part counts; CSV file downloads cleanly.

#### `UAT-31` — Test Predictive Monthly Revenue Forecast
* **Where to look:** Inside `Analytics & Revenue Forecast` (Predictive Forecast section).
* **Steps:**
  1. Switch time horizons between `3M`, `6M`, and `12M`.
  2. Switch forecast scenarios between `Conservative`, `Baseline`, and `Growth`.
* **What good looks like:**
  * Forecast curve and upper/lower confidence bands update smoothly with clear projected monthly revenue figures.

---

### Section L — Business Settings, Backups & Offline Mode

#### `UAT-32` — Customize Analytics, Edit Custom Fields, Backup Data & Test Offline Mode
* **Where to look:** Menu `Settings & Tools` → `Business Settings & Custom Fields`.
* **Steps:**
  1. Toggle **off** 1 metric under `Analytics Dashboard Metrics Visibility` (e.g., `Top Grievance`), open `Analytics`, verify that card is hidden, then toggle it back **on**.
  2. Add 1 custom intake field (e.g., `Rack Location`), then check `New Tool Intake Form` to see it appear.
  3. Click **Download JSON** and **Export Both CSVs** to verify local backups download cleanly.
  4. Turn off Wi-Fi (or enable browser DevTools → Network → `Offline`), confirm the offline indicator appears, and verify you can still view cached tickets and parts. Turn Wi-Fi back on.
* **What good looks like:**
  * Hidden analytics cards vanish immediately until re-enabled.
  * Backups download complete files.
  * Offline mode lets you browse cached job cards and inventory without blank screens or crashes.

---

## 4. Submitting Your Completed Feedback

1. Save [`UAT_FEEDBACK_TEMPLATE.xlsx`](./UAT_FEEDBACK_TEMPLATE.xlsx) with your name in the filename if shared separately (for example: `UAT_FEEDBACK_TEMPLATE_Priya.xlsx`).
2. Confirm every row you tested has a **Status** chosen from the dropdown (`Pass`, `Fail`, `Needs Improvement`, or `Other`).
3. Check the `Summary_Instructions` tab — the counts at the top update automatically to show your **Pass / Fail / Needs Improvement / Other** totals.
4. Send the completed Excel file (plus any screenshots for **Fail** items) back to your project coordinator.
