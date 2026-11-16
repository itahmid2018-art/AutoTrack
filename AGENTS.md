# AutoTrack Pro — Engineering Guide (`AGENTS.md`)

## Architecture & Runtime
- **Frontend**: React 19 + Vite 8 + TypeScript + Tailwind CSS v4 (`src/`). State persists in `localStorage` (`TransactionalDb`), Service Worker cache (`public/sw.js`), and optional live Cloud Firestore sync (`src/utils/firestoreSync.ts`) when an operator signs in with a verified Google account.
- **Backend (`server.ts`)**: Express 4 on Node 22 serving Vite middleware in dev (`npm run dev`) or bundled CJS (`dist-server/server.cjs`) over `dist/` in prod (`npm start`). Resolves port via `--port` -> `PORT` -> `DEFAULT_APP_PORT` -> `3000`.
- **AI Models**: Configurable via `GEMINI_TEXT_MODEL` (default `gemini-4-hydrogen`) and `GEMINI_AUDIO_MODEL` (default `gemini-3.5-transcribe`). Run `node scripts/check_gemini_models.mjs` to list live account models. Startup model validation runs in production when `GEMINI_API_KEY` is set unless `VALIDATE_GEMINI_MODELS_ON_START=false`.
- **Storage Engines**:
  - Live Cloud Firestore (`firebase-applet-config.json`, `firestore.rules`, `firebase-blueprint.json`).
  - Relational SQL schemas (11 tables + seed rows): `database.sql` (MySQL 8.0+ / MariaDB 10.5+) and `database.postgres.sql` (PostgreSQL 16+). Keep `src/utils/mysqlExport.ts` aligned with `database.sql`.

## Standard Commands
- `npm run dev` — Start local Express + Vite dev server on port 3000.
- `npm run lint` — TypeScript check (`tsc --noEmit`).
- `npm test` — Run utility unit test suites (`npx tsx --test tests/*.test.ts`).
- `npm run validate:sql` — Run state-machine lexical SQL checks on `database.sql` and `database.postgres.sql`.
- `npx eslint firestore.rules` — Lint Firestore security rules.
- `npx tsx firestore.rules.test.ts` — Validate Dirty Dozen and schema boundary checks.
- `npm run build` — Clean `dist`/`dist-server`, build Vite SPA and `dist-server/server.cjs`.
- `npm run smoke` — Boot built `dist-server/server.cjs` on port `3199` and verify `/`, `/?view=customer&token=test`, and `/api/messaging/status`.

## Engineering Invariants & Guardrails
- **Billing**: Always compute totals via `getEffectiveJobBilling(job).totalAmount` (`src/utils/billing.ts`) rather than trusting raw `job.totalAmount`, so `operationalExpenses` are consistently included.
- **Stock Deductions**: Never deduct inventory manually across components. Use `applyStockLifecycleTransition()` (`src/utils/stockDeduction.ts`). Deduct once per job (`stockDeductedAt`); moving to `Cancelled` restores `partsDeducted` and clears `stockDeductedAt`.
- **Job & Schedule IDs**: Generate new IDs using `nextJobCardId()` and `nextScheduleId()` (`src/utils/jobId.ts`) to prevent collisions after deletions or imports.
- **Messaging Status**: `MessageLog['status']` is strictly `'Sent' | 'Pending'`. Set `'Sent'` only when `/api/messaging/*` returns `success: true`; browser deep-links (`wa.me/`, `sms:`) and fallback paths must log `'Pending'`.
- **Public Portal Access (`CustomerView`)**: Never expose `_pdfRecord`, `customerCompany`, or PDF downloads without `token` match or `jobId` + matching phone last-4 verification. Use HTTP `403` for verification failures on `/api/customer-portal/lookup`.
- **UI Constraints**: Never use `window.alert` or `window.confirm`. Render inline confirmation banners instead.
