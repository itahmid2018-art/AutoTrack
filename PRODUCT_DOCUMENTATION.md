# AutoTrack Pro — Product Documentation & Architecture Guide

## 1. Product Overview
AutoTrack Pro is an enterprise-grade service center and power tool workshop management platform built for B2B repair operators, service managers, and technicians. It provides full lifecycle tracking of service jobs, automated spare parts inventory replenishment, QR code serialization, role-based client and admin portals, and stage-history analytics.

---

## 2. Access Control & Authentication
- **Internal Organization Staff**:
  - Internal team members must authenticate via Google Workspace SSO / OAuth (`StaffLoginScreen`) to access workshop operations, parts catalog, analytics, and billing.
  - Unauthenticated visits default to the secure organization staff login screen.
- **Customer Client Portal**:
  - Customers access live service progress either directly via cloud URL (`/?view=customer&token=...`) or by scanning their Job Card QR code.
  - Clients can sign up or sign in using their Gmail or SSO account, or verify with the last 4 digits of their phone number to securely view status, download PDF receipts, rate service (1–5 stars), and send approvals or responses to the service desk.

---

## 3. Key Core Features
1. **Job Card QR Code & Global Scanner (`JobCardDetail`, `SerialBarcodeScannerModal`, `GlobalScanResultModal`)**:
   - Generates high-contrast vector SVG and PNG QR codes encoding both private tokens and canonical job IDs.
   - Enforces strict role-based access: Clients are restricted to view-only status and ticket responses for their specific `jobID`; Internal Admins have full access to edit jobs, view inventory, and prefill tool intake forms.
2. **Average Turnaround Time per Tool Category (`AnalyticsDashboard`, `categoryTurnaround.ts`)**:
   - Analyzes `stageHistory` timestamps of completed jobs to calculate mean turnaround hours and days across tool categories (Rotary Hammers, Angle Grinders, Cordless Drivers, etc.).
   - Visualizes performance with horizontal bar charts, range metrics (min/max), and structured summary tables.
3. **Smart Spare Parts Autosuggestion (`suggestedParts.ts`)**:
   - Automatically suggests relevant spare parts from the 1,000-SKU inventory catalog based on the tool's brand and category during job card intake or parts allocation.
4. **Bulk PDF Generation (`JobCardList`, `BulkPdfReportModal`)**:
   - Allows operators to select multiple job cards and generate a combined, printable PDF report.
5. **Notifications & Quick Reply System (`NotificationsView`, `notificationsCenter.ts`)**:
   - Centralized notification dashboard with quick reply presets (`In Progress`, `Waiting for Parts`, `Customer Contacted`), technician reassignment, sort-by filters, and badge counters for offline sync issues.

---

## 4. Engineering & Technology Stack
- **Frontend**: React 19, Vite, TypeScript strict mode, Tailwind CSS v4.
- **Backend**: Node.js 22, Express, Firebase Firestore & Authentication (JWT verified server-side).
- **Storage**: LocalStorage (`TransactionalDb`), Service Worker cache (`public/sw.js`), and live Cloud Firestore sync.
- **Testing**: Node.js test runner (`npm test`) covering core business logic, barcode parsing, QR role scoping, and turnaround analytics.
