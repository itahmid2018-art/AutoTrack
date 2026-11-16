# BOSCH AUTHORISED SERVICE CENTER & POWER TOOLS HUB
## System Setup, Security Hardening, Database & Maintenance Guide
**Version 4.0 (2026 Multi-Client Sync, Offline PWA & Predictive Enterprise Edition) · Administrator & DevOps Operations Manual**

---

### TABLE OF CONTENTS
1. [Executive Overview & System Architecture](#1-executive-overview--system-architecture)
2. [Security Hardening & PII Protection Standards](#2-security-hardening--pii-protection-standards)
   - 2.1 Google Sign-In & Firebase Security Rules (`firestore.rules`)
   - 2.2 Server-Side PII Scrubbing (`stripPII`) Before AI Inference
   - 2.3 API Rate Limiting & CORS Policy
   - 2.4 Append-Only Audit Ledger (`audit_logs` / `auditLogs`)
   - 2.5 Zero-PII Public Client Status Tokens (`publicDeliveries`)
3. [Environment Variables & Credentials Configuration](#3-environment-variables--credentials-configuration)
4. [Local Development & Full-Stack Server Launch](#4-local-development--full-stack-server-launch)
5. [Database Provisioning: Firestore, PostgreSQL 16 & MySQL 8.0](#5-database-provisioning-firestore-postgresql-16--mysql-80)
6. [Production Build & Server Deployment](#6-production-build--server-deployment)
7. [System Maintenance, Backups & Disaster Recovery](#7-system-maintenance-backups--disaster-recovery)

---

### 1. EXECUTIVE OVERVIEW & SYSTEM ARCHITECTURE

This technical manual covers setup, security policies, database management, and deployment for the **Bosch Authorised Service Center & Power Tools Hub**.

#### Multi-Counter Architecture Model:
- **Client Frontend (React 19 + Vite 8 + Tailwind v4)**: High-contrast workshop interface for counter intake, camera barcode/QR scanning, Kanban dispatch, Recharts monthly revenue forecasting, Excel/CSV inventory import, and post-service feedback ratings. Combines `localStorage` (`TransactionalDb`) with a Service Worker (`public/sw.js` `autotrack-static-v1` & `autotrack-data-v1`) so cached Job Cards remain viewable offline.
- **Express Backend Server (`server.ts`)**: Listens on Port `3000` (compiled to `dist-server/server.cjs` for production), enforces Bearer token verification via `firebase-admin` (`requireAuth`) on sync APIs, serves Gemini AI diagnosis/vision endpoints, handles Twilio SMS/WhatsApp + `/api/customer-portal/feedback`, and broadcasts SSE updates (`/api/sync/stream`, `/api/customer-portal/stream`) with CORS headers for native Android/Capacitor tablet clients (configured via `VITE_API_BASE_URL` or `resolveApiUrl()`).
- **Cloud Firestore Live Store (`firebase-applet-config.json`)**: Named Enterprise database (`ai-studio-autotrackservice-2eac3d40-310f-46ba-a293-99682d0a94d7`) synchronizing job cards, inventory deltas, maintenance schedules, business settings, and `publicDeliveries`.
- **Relational SQL Schemas (`database.postgres.sql` & `database.sql`)**: Complete 11-table schemas with demonstration seed data (including completed feedback ticket `BOSCH-2026-0046`) for PostgreSQL 16+ and MySQL 8.0+ deployments.

#### Architecture Reality & Operational Limits:
- **Local-First Mode Without Sign-In**: When operators do not sign in with Google, all job cards, spare parts, settings, and schedules live strictly inside the local browser profile (`localStorage` + `/sw.js` cache), and Express acts purely as a stateless AI/messaging proxy. QR portal links entered manually by bare Job ID resolve only against the active browser store unless Firestore sync is enabled.
- **Cancelled Stock Reversal Policy**: Transitioning any job card with prior stock deductions (`stockDeductedAt` / `partsDeducted`) to `Cancelled` automatically restores deducted quantities to spare parts inventory, clears deduction markers, and writes an `INVENTORY_STOCK_RESTORED` audit entry. Moving back into an active trigger stage deducts once cleanly.

---

### 2. SECURITY HARDENING & PII PROTECTION STANDARDS

#### 2.1 Google Sign-In & Firebase Security Rules (`firestore.rules`)
- Live Firestore synchronization uses Firebase Authentication (Google Sign-In via `signInWithPopup`).
- All Firestore mutations require `email_verified == true` and strict ownership/membership verification (`ownerUid == request.auth.uid`, `staffUids`, or verified admin in `/admins/{uid}` / bootstrapped admin).
- User PII (`email`) is isolated to `/users/{userId}/private/profile`, separate from `/users/{userId}` metadata.
- For SQL demo environments (`database.sql` / `database.postgres.sql`), change the demo `admin / 123456` password before production use.

#### 2.2 Server-Side PII Scrubbing (`stripPII`) Before AI Inference
All complaint descriptions pass through `stripPII` in `server.ts` before calling external Gemini API endpoints:
- Phone numbers -> `[REDACTED_PHONE]`
- Email addresses -> `[REDACTED_EMAIL]`
- Tax/GST IDs -> `[REDACTED_TAX_ID]`

#### 2.3 API Rate Limiting & CORS Policy
- `rateLimiter` protects `/api/` routes (excluding persistent SSE connections `/api/sync/stream` and `/api/customer-portal/stream`) at 300 requests per minute per IP (`429 Rate Limit Exceeded`).
- CORS headers (`GET, POST, PUT, PATCH, DELETE, OPTIONS` and `Content-Type, Authorization`) allow external Android, iOS, and desktop HTTP clients to connect safely.

#### 2.4 Append-Only Audit Ledger (`audit_logs`) & Terminal State Exception
State transitions, price adjustments, diagnostic applications, feedback submissions, and stock reservations append timestamped entries (`auditLogs` in Firestore / `audit_logs` in SQL). Terminal statuses (`Cancelled` on `jobCards`; `Serviced` on `schedules`) lock updates against non-admin mutations in `firestore.rules`; `Completed` job cards allow non-admin updates strictly limited to feedback fields (`customerFeedback`, `feedbackSmsSentAt`, `messageLogs`, `auditLogs`, `updatedAtIso`, `updatedAt`).

#### 2.5 Zero-PII Public Client Status Tokens & Feedback (`publicDeliveries`)
Clients track repair progress and submit 1–5 star ratings at `/?view=customer&token=tok-...` using `publicDeliveries/{deliveryToken}`, `GET /api/customer-portal/lookup`, and `POST /api/customer-portal/feedback`:
- `allow list: if false;` on `publicDeliveries` prevents enumeration.
- Looking up by bare Job ID without a valid `publicAccessToken` or matching last-4 phone digits returns HTTP `403` from `/api/customer-portal/lookup` and triggers a phone verification prompt in `CustomerView` with zero PII or PDF access until verified.
- Note: Without server-backed sessions on offline localStorage profiles, local phone-last-4 gating mitigates casual enumeration (~10^4 keyspace); always share printed `/?view=customer&token=...` QR links as the primary Client tracking method.
- Responses strip client emails, full phone numbers, tax IDs, and internal bench notes.
- Feedback submissions validate `rating` (`1–5` integer) and `comment` (`<= 1000` characters) server-side before returning HTTP `200` or `400`.

---

### 3. ENVIRONMENT VARIABLES & CREDENTIALS CONFIGURATION

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

```env
# GEMINI AI API KEY & CONFIGURABLE MODELS
GEMINI_API_KEY="AIzaSyYourSecretGeminiKeyHere"
GEMINI_TEXT_MODEL="gemini-4-hydrogen"
GEMINI_AUDIO_MODEL="gemini-3.5-transcribe"
VALIDATE_GEMINI_MODELS_ON_START=true

# SERVER PORT
PORT=3000

# TWILIO SMS & WHATSAPP API (Optional)
TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_AUTH_TOKEN="your_twilio_auth_token_here"
TWILIO_PHONE_NUMBER="+18005550199"
TWILIO_WHATSAPP_NUMBER="+14155238886"

# META WHATSAPP CLOUD API (Optional)
WHATSAPP_CLOUD_API_TOKEN="EAAGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
WHATSAPP_PHONE_NUMBER_ID="123456789012345"

# ANDROID / CAPACITOR EXTERNAL BACKEND ORIGIN (Optional)
VITE_API_BASE_URL=""
```

---

### 4. LOCAL DEVELOPMENT & FULL-STACK SERVER LAUNCH

```bash
# 1. Install dependencies
npm install

# 2. Launch Express + Vite server on Port 3000
npm run dev

# 3. Validate Firestore rules, SQL lexing, unit tests & TypeScript types
npx eslint firestore.rules
npx tsx firestore.rules.test.ts
npm run validate:sql
npm test
npm run lint
```

---

### 5. DATABASE PROVISIONING: FIRESTORE, POSTGRESQL 16 & MYSQL 8.0

Refer to [`DATABASE_SETUP_AND_INTEGRATION_GUIDE.md`](DATABASE_SETUP_AND_INTEGRATION_GUIDE.md) for complete setup commands, schema mapping, and dummy test datasets.

- **Firestore Live Sync**: Click **Sign In** in the app header; initial seed populates starter tickets, core SKUs, schedules, settings, custom fields, and `publicDeliveries`.
- **PostgreSQL 16**: Run `psql "<CONNECTION_URL>" -f database.postgres.sql` to create and seed all 11 relational tables.
- **MySQL 8.0+ / MariaDB 10.5+**: Run `mysql -u root -p bosch_service_db < database.sql` and validate syntax with `npm run validate:sql`.

---

### 6. PRODUCTION BUILD & SERVER DEPLOYMENT

```bash
# Clean dist/ and dist-server/, build Vite SPA + dist-server/server.cjs
npm run build

# Run offline production smoke test (PORT=3199)
npm run smoke

# Start production Express server
npm start
```

---

### 7. SYSTEM MAINTENANCE, BACKUPS & DISASTER RECOVERY

- **Automatic Daily Backups**: Enabled under **Business Settings** (`TransitionView`). Supports rolling `localStorage` snapshots or daily JSON file downloads.
- **Dynamic MySQL Export**: Click **Export Local MySQL DB (.sql)** inside **1,000 SKUs** or **Business Settings** to dump active UI state into an executable `.sql` file.
- **Security Rules Audits**: Run `npx eslint firestore.rules` after any edit to `firestore.rules`, and review rules in `security_spec.md` before expanding user access.

---
*Setup and Security Manual compiled for Bosch Authorised Service Hub Operations.*
