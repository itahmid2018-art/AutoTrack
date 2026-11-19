# AutoTrack Pro - BOSCH & Vendor Power Tools Service Hub

A One-page, high-efficiency **Job Card tracking, ~1,000-item spare parts inventory management, and automated customer dispatch system** specifically designed for **Bosch Power Tools** and vendor tool service centers (*Makita, DeWalt, Milwaukee, Hilti, Metabo, Festool*).

---

## 🌟 Key Features

1. **Monochrome Industrial Counter Intake Form**:
   * Single-page intake interface designed for service counter technicians.
   * Tool Specs: Brand, Model Number (`GBH 2-26 DFR`, `GWS 900`), Serial Number, Voltage Rating (`230V`, `18V Cordless`), Warranty Status (*Bosch Heavy Duty 3-Year Extended*).
   * Client Info: Client Name, Company/Account Name, Mobile Phone (WhatsApp), GST/Tax ID, Pre-Approved Repair Limit.
   * Defect Categories: Motor Sparking/Smoke, Dead Switch, SDS Chuck Jammed, Low Hammer Impact, Gearbox Heating.
   * Counter Accessories Checklist & On-Screen Touch Digital Signature.

2. **✨ Gemini AI Fault Diagnosis Engine**:
   * Powered by **Gemini 3.8 Flash** (`@google/genai`).
   * Analyzes client grievances and tool details to suggest probable root causes, step-by-step repair actions, estimated labor hours, and matched spare parts.
   * **1-Click Part Link**: Technicians auto-attach AI-recommended spare parts directly to the job card ticket.

3. **🎙️ Voice Note Dictation & Audio Transcription**:
   * Microphone recording via MediaRecorder with fallback to browser Web Speech API.
   * Transcribes spoken repair observations directly into Detailed Complaint or Internal Notes with timestamped audit entries.

4. **⚡ AI Recommended Spare Parts Analyzer**:
   * Analyzes tool model and reported complaint against spare parts inventory.
   * Suggests catalog items with confidence rationale and 1-click single or batch attachment to quotes.

5. **📱 Unique QR Code on Printed PDF Job Cards**:
   * Generates a 2D QR matrix on every printed receipt linking to live public status portal via secure access token.
   * Clients scan receipt with smartphone cameras to inspect repair progress without login.

6. **🤖 Context-Aware AI Response Assistant**:
   * Generates contextual WhatsApp and SMS replies in Messaging Center based on live job card data.
   * 1-click dispatch to WhatsApp Web or Twilio SMS gateway.

7. **📅 Technician Weekly Calendar & Workshop Capacity Scheduler**:
   * 7-day visual calendar view for scheduling technician shifts and booking ticket repair slots.
   * Tracks technician load, warns on 90%+ over-allocation, and filters by technician roster.

8. **✍️ Technician Repair Sign-Off Digital Signature Pad**:
   * HTML5 canvas signature pad allowing bench technicians to sign off on completed repairs.
   * Embeds vector signature image directly into final PDF invoices and traveler receipts.

9. **📊 Technician Performance Analytics**:
   * Calculates average turnaround time and total jobs completed per technician based on append-only audit logs.
   * Displays visual comparison table and on-time completion percentages.

10. **📑 Bulk CSV Client Maintenance Schedule Import & Export**:
    * RFC 4180 compliant parser supporting drag-and-drop file upload, text paste, and 5-record sample client loader.
    * Real-time row validation grid, skip invalid rows toggle, dynamic next due date calculator, and 1-click CSV export.

11. **📦 ~1,000 Product Spare Parts Inventory & Low-Stock Alerts**:
    * Pre-populated with 1,000 genuine Bosch replacement parts (Carbon Brushes, Armatures, SDS Chucks, Bearings, Switches).
    * Highlights low-stock items and exports itemized supplier reorder purchase orders.

12. **📷 Camera Barcode & QR Code Scanner (8 Entry Points)**:
    * Uses browser `BarcodeDetector` + Gemini Vision (`/api/ai/scan-serial`) fallback across Header Global Scan, `BoschIntakeForm`, `NewJobModal`, `InventoryManager`, `AddInventoryModal`, `JobCardList`, `JobCardDetail`, and `RecurringMaintenanceView`.
    * Extracts serial numbers, part SKUs, models, and brands directly from tool rating plates, cartons, and QR labels.

13. **🎛️ Configurable Analytics Dashboard Metrics**:
    * Toggle visibility of individual KPI cards and charts (`activeJobs`, `lowInventory`, `revenue`, `todaysAppointments`, `avgRepairTime`, `topGrievance`, `technicianPerformance`, `categoryVolume`) inside **Business Settings**.

14. **🔄 Live Multi-Client Sync (Firebase Firestore + Express SSE) & SQL Dumps**:
    * Google Sign-In (`signInWithPopup`) activates real-time `onSnapshot` synchronization across connected counter desktops, technician tablets, and live **Client Status Portal** (`/publicDeliveries/{token}`).
    * Ships runnable **PostgreSQL 16** (`/database.postgres.sql`) and **MySQL 8.0+** (`/database.sql`) schema + dummy demo seed scripts plus 1-click **Export Local MySQL DB (.sql)** UI export.

15. **📈 Predictive Monthly Revenue Forecast (Recharts `LineChart`)**:
    * Projects 3M, 6M, or 12M workshop monthly revenue using deseasonalized job card billing history, tool service seasonal multipliers, open pipeline volume, and scheduled fleet overhauls.
    * Supports `Conservative`, `Baseline`, and `Growth` scenarios plus upper/lower confidence bounds inside **Analytics**.

16. **📡 Offline Service Worker & Cached Job Card Viewing**:
    * Registers `/sw.js` (`autotrack-static-v1` + `autotrack-data-v1`) in `src/main.tsx` alongside `localStorage` so counter staff can view cached Job Cards, spare parts, schedules, and settings without internet connectivity (`OfflineIndicator`).

17. **📥 Bulk Excel & CSV Inventory Import (`InventoryManager`)**:
    * Paste tab-separated cells directly from Excel or Google Sheets (or upload `.csv`/`.tsv`) inside **1,000 SKUs** (`InventoryBulkImportModal`).
    * Supports `Update + Add New` (`upsert`), `Add Qty to Stock` (`replenish`), and `New SKUs Only` (`insertOnly`) modes with live row validation.

18. **⭐ Automated Customer Feedback SMS & CSAT Analytics**:
    * Moving a ticket to `Completed` automatically dispatches a completion SMS link (`&feedback=1`) when enabled in Business Setup.
    * Clients submit 1–5 star ratings and comments (up to 1,000 chars) via `POST /api/customer-portal/feedback`, updating job cards, list/Kanban rating badges, and the **Customer Satisfaction (CSAT)** panel in **Analytics**.

19. **📧 Job Card Email Notifications & Portal Links (`JobCardDetail`)**:
    * Dispatches repair progress emails with direct Client Status Portal / PDF links to the client's email address via `POST /api/messaging/send-email` (SendGrid, Resend, or SMTP relay).
    * Records outbound `'Email'` channel entries and `recipientEmail` across `MessageLog`, PostgreSQL, MySQL, and Cloud Firestore.

20. **🧭 Grouped Search-Bar Navigation & Bulk Card Status Updates (`Header` & `JobCardList`)**:
    * Organizes top bar links into categorized dropdown groups (`Jobs & Intake`, `Inventory & Servicing`, `Messaging & Portal`, `Analytics & Team`, `Settings & Tools`) positioned beneath the global search bar.
    * Adds multi-select checkboxes, **Select All**, and **Bulk Update Status** in `JobCardList` with atomic stock lifecycle reconciliation (`applyStockLifecycleTransition`) and audit entries.

21. **📄 Draft Purchase Order PDFs, 30-Day Expense/Labor Comparison & D3.js Consumption Trends**:
    * Generates downloadable **Draft Purchase Order (PO)** PDFs (`generatePurchaseOrderPdf`) inside **AI Reorder Recommendations** when stock falls below reorder thresholds.
    * Adds a **30-Day Operational Expenses vs. Labor Income** Recharts `BarChart` and a **D3.js Monthly Consumption Trends** SVG line chart inside **Analytics**.

22. **☁️ Kanban Cloud Sync Status Indicator (`KanbanBoard`) & Calibrated Intake Canvas (`BoschIntakeForm`)**:
    * Displays a live **Sync Status to Cloud** badge on every Kanban card (`Synced to Cloud`, `Pending Offline Sync`, or `Pending Offline Sync · Sign In`), tracks Firestore `hasPendingWrites` metadata, persists offline edits in a local retry queue (`autotrack_pending_cloud_sync_jobs_v1`), and flushes updates automatically on reconnect.
    * Applies CSS-to-canvas coordinate scaling (`scaleX`/`scaleY`) on the `BoschIntakeForm` signature pad to keep cursor/touch strokes aligned across responsive layouts.

---

## 🧰 Tech Stack & Packages

### Frontend
* **React 19** (`react`, `react-dom`)
* **TypeScript 5+** (`typescript` CLI check)
* **Vite 8** (`@vitejs/plugin-react`, `@tailwindcss/vite`)
* **Tailwind CSS v4** (`@import "tailwindcss";`)
* **Lucide React** (`lucide-react`) for industrial icon sets
* **jsPDF** (`jspdf`) & **qrcode** for client-side PDF documents, Draft POs & QR matrices
* **Recharts** (`recharts`), **D3.js** (`d3`), & **Motion** (`motion`) for analytics visualizations and Kanban transitions

### Backend & AI
* **Node.js 22** with `express` 4.21 (bundled for production into `dist-server/server.cjs`)
* **tsx** 4.21 for running server TypeScript files (`server.ts`) and utility test suites
* **Firebase Client & Admin SDKs** (`firebase` 13, `firebase-admin` 14)
* **@google/genai** (^3.1.0) with env-configurable `GEMINI_TEXT_MODEL` (default `gemini-4-hydrogen`) and `GEMINI_AUDIO_MODEL` (default `gemini-3.5-transcribe`)

### Storage & Demonstration Databases
* **Cloud Firestore Live Multi-Client DB** (`firebase-applet-config.json`, `firestore.rules`, `firebase-blueprint.json`)
* **Offline Browser Cache + Service Worker** (`public/sw.js` `autotrack-static-v1` / `autotrack-data-v1` + `localStorage` fallback with `INITIAL_JOB_CARDS` / 1,000-item `INITIAL_INVENTORY` dummy catalog)
* **PostgreSQL 16** relational DDL + demo seed (`database.postgres.sql`)
* **MySQL 8.0 / MariaDB 10.5** relational DDL + demo seed (`database.sql`)

---

## 🚀 Local Setup Instructions

### 1. Prerequisites
* Node.js v20.0.0 or v22.x LTS
* npm v9.0.0 or higher
* Optional for local SQL hosting: PostgreSQL 16+ or MySQL 8.0+

### 2. Installation
Clone the repository and install all dependencies:

```bash
# Clone the repository
git clone https://github.com/your-org/autotrack-bosch-service.git
cd autotrack-bosch-service

# Install dependencies
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory (refer to `.env.example`):

```env
# Required for Gemini AI Diagnosis, Vision Barcode Scan & Message Generation
GEMINI_API_KEY="YOUR_GEMINI_API_KEY_HERE"
GEMINI_TEXT_MODEL="gemini-4-hydrogen"
GEMINI_AUDIO_MODEL="gemini-3.5-transcribe"

# Server Port
PORT=3000

# Optional for Android/Capacitor or standalone client pointing to a remote Express server
VITE_API_BASE_URL=""
```

### 4. Running the Application (Development Mode)
Start the Express + Vite server:

```bash
npm run dev
```
Open your browser and navigate to `http://localhost:3000`.

### 5. Building, Testing & Verification
To type-check, run unit tests, validate SQL scripts, build the production client + server bundle (`dist/index.html` and `dist-server/server.cjs`), and run the production smoke check:

```bash
npm run lint
npm test
npm run validate:sql
npx eslint firestore.rules
npx tsx firestore.rules.test.ts
npm run build
npm run smoke
npm start
```

Or run the cross-platform UAT setup and service probe scripts (`PostgreSQL`, `MySQL`, `SQLite3`, `Redis`, `MongoDB`, `Firebase`, `Docker`, port `3000`):

```bash
# macOS / Linux
./scripts/uat_local_setup.sh

# Windows PowerShell / CMD
scripts\uat_local_setup.bat
```

---

## 🗄️ Database Setup, Cloud Sync & Dummy Databases

AutoTrack Pro includes a live **Firebase Firestore** configuration plus ready-to-import **PostgreSQL 16** and **MySQL 8.0** demonstration databases. See [`docs/DATABASE_SETUP_AND_INTEGRATION_GUIDE.md`](docs/DATABASE_SETUP_AND_INTEGRATION_GUIDE.md) for full setup instructions.

### Option A: Live Multi-Client Firestore Sync
* Configured in `firebase-applet-config.json` (Database ID: `ai-studio-autotrackservice-2eac3d40-310f-46ba-a293-99682d0a94d7`).
* Click **Sign In** in the header bar with a verified Google account to seed starter tickets, spare parts, schedules, custom fields, and zero-PII `publicDeliveries` tokens automatically.

### Option B: PostgreSQL 16 Schema & Demo Seed
```bash
psql "postgresql://user:pass@localhost:5432/bosch_service_db" -f database.postgres.sql
```

### Option C: MySQL 8.0 Schema & Demo Seed
```bash
mysql -u root -p < database.sql
node scripts/validate_sql.js
```

### 🔑 SQL Script Default Administrator Credentials (`database.sql` / `database.postgres.sql`)
Both SQL demonstration scripts provision starter staff accounts in `users` using bcrypt hash `$2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i`:

| Parameter | Value |
| :--- | :--- |
| **Database Name** | `bosch_service_db` |
| **Username** | `admin` |
| **Email** | `admin@autotrack.com` |
| **Default Password** | `123456` |
| **Role** | `Administrator` |

---

## 📡 Backend API Endpoints (`server.ts`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/ai/diagnose` | Accepts tool grievance details & inventory sample; returns structured root cause analysis, repair steps, labor hours, and part SKUs. |
| `POST` | `/api/ai/scan-serial` | Extracts serial numbers, SKUs, model numbers, and brands from camera photos when hardware barcode detection falls back. |
| `POST` | `/api/ai/generate-message` | Generates personalized client notifications for WhatsApp & SMS. |
| `POST` | `/api/ai/response-assistant` | Generates context-aware replies for client inquiries based on active ticket details. |
| `POST` | `/api/ai/repair-chat` | Interactive diagnostic chatbot for bench technicians querying wiring, exploded views, and torque specs. |
| `POST` | `/api/ai/recommend-reorders` | Predictive inventory reorder planner correlating historical failures with stock velocity. |
| `POST` | `/api/ai/recommend-parts` | Suggests catalog spare parts matching tool model and reported complaint with confidence scores. |
| `POST` | `/api/ai/transcribe` | Transcribes recorded microphone audio observations into Detailed Complaint or Internal Notes. |
| `GET`  | `/api/messaging/status` | Reports live credentials status for Twilio SMS, Meta WhatsApp Cloud API, and Email (SendGrid / Resend / SMTP) providers. |
| `POST` | `/api/messaging/send-sms` | Dispatches outbound SMS messages via Twilio REST API. |
| `POST` | `/api/messaging/send-whatsapp` | Dispatches outbound WhatsApp messages via Twilio or Meta Graph Cloud API. |
| `POST` | `/api/messaging/send-email` | Dispatches repair updates and portal/PDF links to client email addresses via SendGrid, Resend, or configurable SMTP relay. |
| `GET`  | `/api/sync/stream` | Authenticated SSE live sync stream (`Bearer <idToken>`) pushing ticket, inventory, and schedule updates to Android/tablet clients. |
| `GET/POST/PUT` | `/api/jobs`, `/api/jobs/:id` | Authenticated Firestore-backed job card CRUD endpoints with automatic `publicDeliveries` projection sync. |
| `GET/POST/PATCH` | `/api/inventory`, `/api/inventory/:id/stock` | Authenticated Firestore-backed spare parts catalog and stock quantity adjustments. |
| `GET/POST` | `/api/schedules` | Authenticated Firestore-backed recurring maintenance schedules API. |
| `GET`  | `/api/customer-portal/lookup` | Unauthenticated zero-PII Client delivery lookup by `publicAccessToken` or `jobId` + matching phone last-4 digits (returns HTTP `403` if bare ID lacks verification). |
| `GET`  | `/api/customer-portal/stream` | Unauthenticated SSE stream pushing real-time repair stage changes to `CustomerView`. |
| `POST` | `/api/customer-portal/feedback` | Unauthenticated post-service rating (`1–5` stars) & comment (max `1000` chars) submission validated by `token`/`jobId` + optional phone last-4. |

---

## 📚 Technical Documentation & Test Guides

1. **[Database Setup, Integration & Dummy Data Guide](docs/DATABASE_SETUP_AND_INTEGRATION_GUIDE.md)**:
   * Step-by-step guides for Cloud Firestore live sync, PostgreSQL 16 (`/database.postgres.sql`), MySQL 8.0 (`/database.sql`), Service Worker offline cache, Android/tablet `VITE_API_BASE_URL` + Bearer APIs, and 5 ready-to-use dummy datasets.
2. **[Testing & QA Acceptance Guide](docs/TESTING_AND_QA_ACCEPTANCE_GUIDE.md)**:
   * Test matrices, steps, pre-conditions, and expected results covering Features 1–20: Voice Notes, AI Diagnosis, Calendar, Sign-Offs, Bulk CSV & Excel Inventory Import, Analytics Toggles, Revenue Forecast, D3.js Consumption Trends, 30-Day Expense vs. Labor Chart, Draft PO PDFs, Email Dispatch, Bulk Status Updates, Kanban Cloud Sync Status, Intake Signature Calibration, Customer Feedback SMS, and Multi-Client Firebase Sync + Security Rules tests.
3. **[End-User Operating Manual & Training Guide](docs/USER_MANUAL_AND_TRAINING_GUIDE.md)**:
   * Counter intake protocols, camera barcode/QR scanning, Predictive Revenue charts, offline Service Worker behavior, live Google Auth sync, Client delivery portal (`/?view=customer&token=...`) & feedback survey usage, and staff checklists.
4. **[Setup, Security & Maintenance Guide](docs/SETUP_AND_MAINTENANCE_GUIDE.md)**:
   * Architecture reality, deployment limits, PII sanitization policies, Cancelled stock reversal policy, API rate limits, Firebase security rules (`security_spec.md`), Service Worker caching, and SQL setup.
5. **[Remediation Plan Archive](docs/REMEDIATION_PLAN.md)** & **[Engineering Guide](AGENTS.md)**:
   * Archived Phase 1–9 remediation records and developer invariants (`getEffectiveJobBilling`, `applyStockLifecycleTransition`, `nextJobCardId`).
6. **[Sample CSV Datasets Directory](docs/samples/README.md)**:
   * Pre-formatted CSV import fixtures for maintenance schedules, inventory items (including Excel/TSV & CSV bulk paste), and service tickets.

---

## 📄 License
Apache-2.0 License. Built for Bosch & Vendor Power Tools Authorised Service Centers.
