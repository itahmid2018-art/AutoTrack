# Database Setup, Integration & Dummy Test Data Guide

AutoTrack Pro supports 4 storage backends: live Cloud Firestore sync, PostgreSQL 16 relational setup, MySQL 8.0+ relational setup, and preloaded dummy datasets for immediate demonstration.

---

## 1. Storage Options Matrix

| Option | Status | Primary File / Script | Use Case |
| :--- | :--- | :--- | :--- |
| **Firebase Firestore** | Active Live Sync | `firebase-applet-config.json`, `firestore.rules` | Real-time multi-client browser, tablet, and Client status updates |
| **Offline Service Worker + Dummy Catalog** | Active Instant Demo & Offline | `public/sw.js`, `src/utils/offlineCache.ts`, `src/data/*` | Zero-setup demo (1,000 SKUs, 7 job cards, 4 schedules) + offline Job Card cache |
| **PostgreSQL 16** | Ready DDL + Seed | `database.postgres.sql` | Self-hosted Postgres / Cloud SQL / Drizzle ORM backend integration |
| **MySQL 8.0+ / MariaDB** | Ready DDL + Export | `database.sql` | Local MySQL deployment and 1-click `.sql` UI export |
| **CSV & Excel Sample Datasets** | Ready Import Files | `docs/samples/*.csv` | Bulk upload & paste validation for maintenance schedules, inventory, and job cards |

---

## 2. Live Firebase Firestore & Multi-Client Sync Setup

### 2.1 Provisioned Project Configuration
- **Project ID**: `ai-studio-applet-webapp-65129`
- **Named Firestore Database**: `ai-studio-autotrackservice-2eac3d40-310f-46ba-a293-99682d0a94d7`
- **Configuration File**: `firebase-applet-config.json` (imported statically in `src/lib/firebase.ts` and `src/lib/firebase-admin.ts`)
- **Authentication Provider**: Google Sign-In (`signInWithPopup` via `GoogleAuthProvider`)

> **Important**: Both `getFirestore(app, firebaseConfig.firestoreDatabaseId)` in `src/lib/firebase.ts` and `getFirestore(adminApp, firebaseConfig.firestoreDatabaseId)` in `src/lib/firebase-admin.ts` target the named Enterprise database instance. Do not omit `firestoreDatabaseId`.

### 2.2 Firestore Collections & Security Rules (`firebase-blueprint.json` / `firestore.rules`)
- `/users/{uid}`: Non-PII operator metadata (`uid`, `displayName`, `role`, `workshopId`).
- `/users/{uid}/private/{docId}`: Isolated PII email profile restricted to owner or admin.
- `/admins/{uid}`: Admin membership allowlist (plus bootstrapped admin `gurujiytube@gmail.com`).
- `/jobCards/{jobId}`: Live repair intakes, parts, time logs, audit entries, `publicAccessToken`, `stockDeductedAt`, `partsDeducted`, `customFieldValues` (up to 30 keys), `feedbackSmsSentAt`, and `customerFeedback`.
- `/inventory/{itemId}`: Spare part SKU stock levels and bin locations.
- `/schedules/{scheduleId}`: Recurring preventive maintenance schedules.
- `/settings/{settingId}`: Shared center settings including `analyticsMetrics` toggles and `autoSendFeedbackSms`.
- `/customFields/{fieldId}`: Custom intake form field definitions.
- `/publicDeliveries/{deliveryToken}`: Zero-PII status & post-service feedback projection (`feedbackSubmitted`, `feedbackRating`, `feedbackComment`, `feedbackSubmittedAt`) for public Client tracking (`allow list: if false;` blocks scraping).

### 2.3 Automatic Initial Seed & Multi-Client Sync Behavior
1. Click **Sign In** in the header bar and complete Google authentication with a verified email.
2. On login, `testFirestoreConnection()` verifies connectivity via `getDocFromServer(doc(db, 'test', 'connection'))`.
3. `upsertWorkshopUser(user)` creates or refreshes the operator profile.
4. `seedWorkshopIfEmpty(user, [user.uid], defaults)` seeds `settings/workshop-default`, the 7 sample `jobCards`, 4 `schedules`, 14 `customFields`, core referenced SKUs plus the first 25 `inventory` items, and `/publicDeliveries/{token}` documents if the workspace is empty.
5. Real-time `onSnapshot` listeners update open tabs immediately when intakes, Kanban stages, inventory restocks, or settings change.

### 2.4 Security Verification Commands & Rule Hardening Notice
Run these checks after any rule change:
```bash
npx eslint firestore.rules
npx tsx firestore.rules.test.ts
```
Review and harden `firestore.rules` and `security_spec.md` before sharing access broadly beyond initial test operators. Free Spark tier daily read limits reset every 24 hours (`Quota exceeded` monitoring).

### 2.5 Native Android / Tablet HTTP, SSE & Client Configuration (`server.ts` + `src/utils/apiBase.ts`)
External Android Capacitor, iOS, or desktop clients authenticate with a Firebase ID token (`Authorization: Bearer <idToken>`) against port `3000`. Configure `VITE_API_BASE_URL` at build time (or set `localStorage.setItem('autotrack_api_base_url', 'https://your-server.example.com')` at runtime) so `resolveApiUrl()` routes all `/api/*` requests from packaged native WebViews (`capacitor://localhost`) to your running Express host:
- `GET /api/sync/stream`: Authenticated Server-Sent Events stream (`job:updated`, `inventory:updated`, `schedule:updated`).
- `GET /api/jobs`, `POST /api/jobs`, `PUT /api/jobs/:id`: Authenticated multi-client job card CRUD.
- `GET /api/inventory`, `POST /api/inventory`, `PATCH /api/inventory/:id/stock`: Authenticated stock adjustments.
- `GET /api/schedules`, `POST /api/schedules`: Authenticated preventive maintenance sync.
- `GET /api/customer-portal/lookup?query=...&phoneLast4=...`: Unauthenticated sanitized delivery lookup (zero PII).
- `GET /api/customer-portal/stream?token=...&jobId=...`: Live delivery status SSE stream for `CustomerView`.
- `POST /api/customer-portal/feedback`: Unauthenticated post-service rating (`1–5`) and comment (`<= 1000` chars) persisted to `jobCards` and `publicDeliveries`.

---

## 3. PostgreSQL 16 Setup & Drizzle Integration Guide

### 3.1 Quick Start with Local Postgres 16 (Docker)
Start a clean Postgres 16 container and load all 11 relational tables plus demonstration records from `/database.postgres.sql`:
```bash
docker run -d \
  --name autotrack-pg \
  -e POSTGRES_USER=autotrack \
  -e POSTGRES_PASSWORD=autotrack_dev \
  -e POSTGRES_DB=bosch_service_db \
  -p 5432:5432 \
  postgres:16-alpine

psql "postgresql://autotrack:autotrack_dev@localhost:5432/bosch_service_db" -f database.postgres.sql
```

### 3.2 Verifying Seeded Postgres Demo Tables
```bash
psql "postgresql://autotrack:autotrack_dev@localhost:5432/bosch_service_db" -c "\dt"
psql "postgresql://autotrack:autotrack_dev@localhost:5432/bosch_service_db" -c "SELECT id, status, total_amount FROM job_cards;"
```

### 3.3 Connecting Node 22 + Drizzle ORM to Postgres 16
When deploying against PostgreSQL 16 instead of Firestore, add `DATABASE_URL` to your environment and bind `drizzle-orm/node-postgres`:
```env
DATABASE_URL="postgresql://autotrack:autotrack_dev@localhost:5432/bosch_service_db"
```
```ts
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const pgDb = drizzle(pool);
```
Column definitions in `database.postgres.sql` map 1-to-1 to `JobCard` (including `stock_deducted_at`, `parts_deducted_json`, `custom_field_values_json`, `customer_feedback_rating`, `customer_feedback_comment`, `customer_feedback_submitted_at`, `customer_feedback_json`, and `feedback_sms_sent_at`), `InventoryItem`, `RecurringMaintenance`, `BusinessSettings` (including `auto_send_feedback_sms` and `analytics_metrics`), and `CustomField` in `src/types/index.ts`. Both `database.postgres.sql` and `database.sql` use canonical bcrypt hash `$2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i` for the demo `admin / 123456` account.

---

## 4. MySQL 8.0+ / MariaDB 10.5+ Setup

### 4.1 Importing `/database.sql` into Local MySQL
```bash
# Option A: Docker MySQL 8
docker run -d \
  --name autotrack-mysql \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=bosch_service_db \
  -p 3306:3306 \
  mysql:8.0

mysql -h 127.0.0.1 -u root -prootpass < database.sql
```

### 4.2 Verifying MySQL & PostgreSQL Syntax Without Running a Server
```bash
npm run validate:sql
```
`scripts/validate_sql.js` runs a state-machine SQL lexer over both `/database.sql` (MySQL) and `/database.postgres.sql` (PostgreSQL), verifying balanced quotes, backticks, dollar-quoted blocks, parentheses, and statement terminators across all 11 tables and seed statements.

### 4.3 Exporting Live UI State to MySQL `.sql`
Inside **1,000 SKUs** (`InventoryManager`) or **Business Settings** (`TransitionView`), click **Export Local MySQL DB (.sql)** to download a fresh SQL script containing `CREATE TABLE IF NOT EXISTS` statements (all 11 tables including `custom_fields`) and `INSERT INTO` dumps for active records.

---

## 5. Dummy & Demonstration Databases Available for Testing

Use any of the 5 built-in demo data sources below depending on your test scope:

1. **Instant Zero-Config Browser Demo + Offline Cache (`src/data/*` + `localStorage` + `/sw.js`)**:
   - **7 Sample Job Cards** (`INITIAL_JOB_CARDS`): Covers `Intake`, `Diagnosis`, `Awaiting Approval`, `Awaiting Parts`, `In Service`, `Ready for Pickup`, and `Completed` states (including `BOSCH-2026-0041` with token `tok-apex-2026-0041-sec`).
   - **1,000 Generated Inventory SKUs** (`INITIAL_INVENTORY`): `item-1001` through `item-2000` (`BRSH-*`, `ARM-*`, `SWT-*`, `CHK-*`, `BRG-*`, `GER-*`, `BAT-*`, `CRD-*`, `HSG-*`) with deliberate low-stock items to trigger alerts.
   - **4 Maintenance Schedules** (`INITIAL_RECURRING_MAINTENANCE`): `MAINT-2026-001` through `MAINT-2026-004`.
   - **14 Intake Form Fields** (`INITIAL_CUSTOM_FIELDS`): `f-1` through `f-14`.
   - **Service Worker Data Cache (`autotrack-data-v1`)**: Persists `/__offline-cache/{jobCards,inventory,schedules,settings}.json` for offline viewing even if `localStorage` is cleared.
2. **Firestore Auto-Seed Demo (`seedWorkshopIfEmpty`)**:
   - Populates live multi-client collections automatically on first verified Google Sign-In.
3. **PostgreSQL 16 Demo Script (`database.postgres.sql`)**:
   - Populates 11 tables including 6 demo staff accounts (`admin / 123456` with Bcrypt hash), 7 core inventory parts, 3 repair tickets (including completed ticket `BOSCH-2026-0046` with 5-star customer feedback), 2 time logs, 2 maintenance schedules, `'Feedback'` SMS log `msg-103`, and 4 audit rows.
4. **MySQL 8.0 Demo Script (`database.sql`)**:
   - Identical 11-table demo dataset (including `public_access_token`, `customer_feedback_*`, `auto_send_feedback_sms`, `analytics_metrics`, and completed `BOSCH-2026-0046` feedback seed) tailored for MySQL `InnoDB` engines.
5. **CSV & Excel Bulk Upload Fixtures (`docs/samples/*`)**:
   - `recurring_maintenance_standard.csv` (10 standard rows)
   - `recurring_maintenance_full.csv` (extended 12-column dataset)
   - `spare_parts_inventory_sample.csv` (10-part Bosch catalog fixture compatible with both CSV upload and Excel tab-separated paste)
   - `service_job_cards_sample.csv` (service ticket fixture)
