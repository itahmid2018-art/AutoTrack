# Integration, Security, SQL & Build Verification Report

**Run Timestamp:** 2026-11-19T09:32:00Z — 2026-11-19T09:35:15Z  
**Toolchain:** Node `v22.23.2`, TypeScript (`tsc --noEmit`), Vite `v8.3.8`, esbuild, ESLint (`@firebase/rules-unit-testing` / `eslint-plugin-security` / `firestore.rules`)

---

## 1. Verification Scorecard

| Check Suite | Command | Result | Key Metrics / Output |
| :--- | :--- | :---: | :--- |
| **TypeScript Static Check** | `npm run lint` (`tsc --noEmit`) | **PASS** | 0 errors across `src/`, `server.ts`, and `tests/` |
| **Production Client Build** | `npm run build:client` (`vite build`) | **PASS** | 2,792 modules transformed in `8.64s` (warning: main bundle `3,131.60 kB` > 500 kB chunk threshold) |
| **Production Server Build** | `npm run build:server` (`esbuild`) | **PASS** | `dist-server/server.cjs` (`78.7 kB`) built in `31ms` |
| **Production Boot Smoke** | `npm run smoke` (`scripts/smoke_prod.mjs`) | **PASS** | Verified `/`, `/?view=customer&token=test`, `/api/messaging/status` (200), `/api/customer-portal/lookup` (503) |
| **SQL Schema Validation** | `npm run validate:sql` (`scripts/validate_sql.js`) | **PASS** | `database.sql` (MySQL: 37 statements), `database.postgres.sql` (PostgreSQL: 46 statements) |
| **Firestore Rules Lint** | `npx eslint firestore.rules` | **PASS** | 0 lint errors or warnings |
| **Firestore Rules Security Tests** | `npx tsx firestore.rules.test.ts` | **PASS** | Verified 12 Dirty Dozen payloads, feedback bounds, custom field & stock snapshot limits |
| **Messaging Honesty Gate** | `npx tsx scripts/verify_message_status.ts` | **PASS** | 16/16 checks passed (`'Sent'` only on confirmed API `success: true`, `'Pending'` otherwise) |
| **Customer Portal Gate D** | `npx tsx scripts/verify_portal_gate.ts` | **PASS** | 15/15 checks passed (phone/token gating, serial/company masking, CSPRNG token format) |
| **Stock Deduction Ledger Gate E** | `npx tsx scripts/verify_stock_ledger.ts` | **PASS** | 21/21 checks passed (idempotent deduction, delta add, Cancelled stock restore) |

---

## 2. Verification Script Details

### 2.1 `scripts/verify_message_status.ts` (16 Assertions — PASS)
- Verified `sentStatusFor(true) === 'Sent'` and `sentStatusFor(false) === 'Pending'`.
- Verified `isApiConfirmed(resOk, payload)` rejects HTTP `500` even with `{ success: true }`, rejects `200` with missing/string/non-boolean body, and accepts only `resOk === true` with `payload.success === true`.
- Verified static source invariants in `MessagingCenter.tsx`, `RecurringMaintenanceView.tsx`, `PdfViewModal.tsx`, and `JobCard` intake logging so deep links (`wa.me/`, `sms:`) always record `'Pending'`.

### 2.2 `scripts/verify_portal_gate.ts` (15 Assertions — PASS)
- Verified `lookupCustomerJob()` returns `verification-required` for a bare Job ID with no summary attached.
- Verified wrong last-4 phone digits return `verification-failed` with no summary.
- Verified matching last-4 phone digits or valid `publicAccessToken` returns `found` with `verifiedByTokenOrPhone: true` and `_pdfRecord`.
- Verified `ensurePublicAccessToken()` produces CSPRNG `tok-<jobSlug>-<randomHex>` tokens and preserves existing tokens verbatim.
- Verified `sanitizeJobForCustomer(..., false)` omits `_pdfRecord` and `customerCompany` and masks `toolSerialMasked`.

### 2.3 `scripts/verify_stock_ledger.ts` (21 Assertions — PASS)
- Verified policy mapping (`Approval` -> `Awaiting Approval`, `InService` -> `In Service` / `In Repair`, `Completion` -> `Completed`).
- Verified parts are deducted once, `stockDeductedAt` and `partsDeducted` are stamped, repeat entries are idempotent, added parts deduct only the delta, and transitions to `Cancelled` restore all deducted stock and clear deduction markers.

### 2.4 SQL Lexical Checks (`scripts/validate_sql.js` — PASS)
- `database.sql` (MySQL 8.0+ / MariaDB 10.5+): 37 lexical statements parsed with balanced quotes/delimiters.
- `database.postgres.sql` (PostgreSQL 16+): 46 lexical statements parsed cleanly.
- **Note:** Because no local MySQL or PostgreSQL daemon is running in the container, schema execution against a live RDBMS engine remains unverified here.

### 2.5 Build Notes & Observations
- **Bundle Size Advisory:** Vite reported `dist/assets/index-CFeUVV5m.js` at `3,131.60 kB` (`837.49 kB` gzipped), exceeding the default `500 kB` warning threshold. Applying route/tab dynamic `import()` code-splitting for heavy modules (`AnalyticsDashboard`, `RevenueForecastModule`, `jsPDF` / `html2canvas`, `D3`) would lower initial load size.
- **Smoke Test `503` on `/api/customer-portal/lookup`:** `smoke_prod.mjs` accepts `503` in environments without Firebase Admin ADC credentials, matching the live finding documented in `API_KEY_AND_SERVICE_HEALTH_REPORT.md`.
