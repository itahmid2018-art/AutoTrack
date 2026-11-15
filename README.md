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

12. **🗄️ MySQL Database DDL & Data Dump Export**:
    * Complete relational database schema script (`database.sql`) for local MySQL 8.0+ deployment.
    * Includes 1-click **Export Local MySQL DB (.sql)** button in the UI.

---

## 🧰 Tech Stack & Packages

### Frontend
* **React 19** (`react`, `react-dom`)
* **TypeScript 5.7**
* **Vite 8** (`@vitejs/plugin-react`, `@tailwindcss/vite`)
* **Tailwind CSS v4** (`@import "tailwindcss";`)
* **Lucide React** (`lucide-react`) for industrial icon sets
* **jsPDF** (`jspdf`) for client-side PDF document compilation

### Backend & AI
* **Node.js** with `express` 4.21
* **tsx** 4.21 for running server TypeScript files (`server.ts`)
* **@google/genai** (^2.4.0) using **Gemini 3.8 Flash** (`gemini-3.8-flash`)

### Storage
* **Transactional Local Storage** (`localStorage` & `IndexedDB` fallback)
* **MySQL 8.0 / MariaDB 10.5** relational schema DDL (`database.sql`)

---

## 🚀 Local Setup Instructions

### 1. Prerequisites
* Node.js v18.0.0 or higher
* npm v9.0.0 or higher
* MySQL 8.0+ (optional, for local database deployment)

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
# Required for Gemini AI Diagnosis & Message Generation
GEMINI_API_KEY="YOUR_GEMINI_API_KEY_HERE"

# Server Port
PORT=3000
```

### 4. Running the Application (Development Mode)
Start the Express + Vite server:

```bash
npm run dev
```
Open your browser and navigate to `http://localhost:3000`.

### 5. Building for Production
To compile the TypeScript project and bundle the frontend for production:

```bash
npm run build
npm start
```

---

## 🗄️ Database Setup & MySQL Deployment

The application includes a complete, production-ready MySQL database script located at `/database.sql`.

### Importing Schema & Seed Data into MySQL
To deploy the database on a local MySQL server:

```bash
# Log into MySQL and run the database.sql script:
mysql -u root -p < database.sql
```

### 🔑 Default Administrator Credentials
The database script automatically provisions a default administrator account in the `admin_users` table:

| Parameter | Value |
| :--- | :--- |
| **Database Name** | `bosch_service_db` |
| **Username** | `admin` |
| **Email** | `admin@autotrack.com` |
| **Default Password** | `123456` |
| **Password Hash** | `$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW` *(Bcrypt)* |
| **Role** | `Administrator` |

---

## 📡 Backend API Endpoints (`server.ts`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/ai/diagnose` | Accepts tool grievance details & inventory sample; returns Gemini AI root cause analysis, repair steps, labor hours, and recommended part SKUs. |
| `POST` | `/api/ai/generate-message` | Generates personalized client notifications for WhatsApp & SMS. |
| `POST` | `/api/ai/response-assistant` | Generates context-aware replies for client inquiries based on active ticket details. |
| `POST` | `/api/ai/repair-chat` | Interactive diagnostic chatbot for bench technicians querying wiring, exploded views, and torque specs. |
| `POST` | `/api/ai/recommend-reorders` | Predictive inventory reorder planner correlating historical failures with stock velocity. |
| `POST` | `/api/ai/recommend-parts` | Suggests catalog spare parts matching tool model and reported complaint with confidence scores. |
| `POST` | `/api/ai/transcribe` | Transcribes recorded microphone audio observations into Detailed Complaint or Internal Notes. |
| `GET`  | `/api/messaging/status` | Reports live credentials status for Twilio SMS and Meta WhatsApp Cloud API providers. |
| `POST` | `/api/messaging/send-sms` | Dispatches outbound SMS messages via Twilio REST API. |
| `POST` | `/api/messaging/send-whatsapp` | Dispatches outbound WhatsApp messages via Meta Graph Cloud API. |

---

## 📚 Technical Documentation & Test Guides

1. **[Testing & QA Acceptance Guide](docs/TESTING_AND_QA_ACCEPTANCE_GUIDE.md)**:
   * Test matrices, steps, pre-conditions, and expected results for all 8 updated features.
   * Includes 10-step end-to-end regression flow and edge case validation scripts.
2. **[End-User Operating Manual & Training Guide](docs/USER_MANUAL_AND_TRAINING_GUIDE.md)**:
   * Counter intake protocols, bench repair instructions, parts management, and staff checklists.
3. **[Setup, Security & Maintenance Guide](docs/SETUP_AND_MAINTENANCE_GUIDE.md)**:
   * Architecture overview, PII sanitization policies, rate limiting, and MySQL database setup.

---

## 📄 License
Apache-2.0 License. Built for Bosch & Vendor Power Tools Authorised Service Centers.
