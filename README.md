# AutoTrack Pro - BOSCH & Vendor Power Tools Service Hub

A single-page, high-efficiency **Job Card tracking, ~1,000-item spare parts inventory management, and automated customer dispatch system** specifically designed for **Bosch Power Tools** and vendor tool service centers (*Makita, DeWalt, Milwaukee, Hilti, Metabo, Festool*).

---

## 🌟 Key Features

1. **Monochrome Industrial Counter Intake Form**:
   * Single-page intake interface designed for service counter technicians.
   * Tool Specs: Brand, Model Number (e.g., `GBH 2-26 DFR`, `GWS 900`), Serial Number, Voltage Rating (`230V`, `18V Cordless`), Warranty Status (*Bosch Heavy Duty 3-Year Extended*).
   * Customer Info: Client Name, Company/Account Name, Mobile Phone (WhatsApp), GST/Tax ID, Pre-Approved Repair Limit.
   * Defect Categories: Motor Sparking/Smoke, Dead Switch, SDS Chuck Jammed, Low Hammer Impact, Gearbox Heating.
   * Counter Accessories Checklist & On-Screen Touch Digital Signature.

2. **✨ Gemini AI Fault Diagnosis Engine**:
   * Powered by **Gemini 3.8 Flash** (`@google/genai`).
   * Analyzes customer grievances and tool details to suggest probable root causes, step-by-step repair actions, estimated labor hours, and matched spare parts.
   * **1-Click Part Link**: Technicians can auto-attach AI-recommended spare parts directly to the job card ticket.

3. **📄 Digital PDF Generation & Direct WhatsApp / SMS Dispatch**:
   * Uses `jsPDF` to generate official digital PDF Job Card receipts.
   * **1-Click WhatsApp & SMS Dispatch**: Instantly triggers WhatsApp Web (`wa.me`) or SMS with customer phone numbers pre-filled, sending PDF link and status updates.
   * In-browser PDF preview iframe and download capabilities.

4. **🖨️ Dual-Section Physical Workshop Traveler Tag & Service Receipt (Print View)**:
   * **Upper Half**: Workshop Repair Tag attached to the tool/carrying case with barcode, physical condition, accessories checklist, and **Technician Quality & Safety Checklist** (Carbon Brushes, Armature Segment Test, Gearbox Repack, High Voltage Ground Test).
   * **Lower Half**: Perforated Customer Service Slip with terms, signature line, and estimate totals.

5. **📦 ~1,000 Product Spare Parts Inventory & Low-Stock Alerts**:
   * Pre-populated with 1,000 genuine Bosch replacement parts (Carbon Brushes, Armatures 230V/110V, SDS Chuck Assemblies, Bearings 608/6201, Switches, Cords, Lithium Batteries).
   * **🚨 Visual Low-Stock Badges**: Highlights items where `stockQty <= minStockThreshold`.
   * **⚡ Supplier Reorder PO Planning Sheet**: Aggregates all low-stock items into an itemized reorder plan with suggested PO quantities and 1-click CSV export.
   * Barcode / SKU scanner simulation modal.

6. **⏰ Recurring Tool Maintenance Tracker**:
   * Tracks contractor tools requiring 3-month, 6-month, or 12-month periodic servicing.
   * Auto-calculates next due dates and flags tools as **Due Soon** or **Overdue**.
   * **Queue Reminder**: Automatically formats and logs WhatsApp/SMS maintenance reminders into the message transaction history.
   * **1-Click Job Intake**: Converts scheduled maintenance tools directly into active Job Cards.

7. **🗄️ MySQL Database DDL & Data Dump Export**:
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
| `POST` | `/api/ai/generate-message` | Generates personalized customer notifications for WhatsApp & SMS. |

---

## 📄 License
Apache-2.0 License. Built for Bosch & Vendor Power Tools Authorised Service Centers.
