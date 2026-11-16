# AutoTrack Pro — Remediation Plan Archive

> **Location:** `docs/REMEDIATION_PLAN.md`
> **Original Source:** Uploaded `autotrack-remediation-plan.md` (2026-11-16)
> **Status:** Executed Phases 1–9

---

## Execution Status Summary

| Phase | Scope | Status | Verification Summary |
|---|---|---|---|
| Phase 1 (P0) | Production server build (`dist-server/server.cjs`), lazy dev `vite` import, CWD-independent `dist/`, unified `PORT`, `.gitignore` | Completed | Verified via `npm run build` and `npm run smoke` |
| Phase 2 (P0) | Centralized `GEMINI_TEXT_MODEL` / `GEMINI_AUDIO_MODEL`, `scripts/check_gemini_models.mjs`, startup validation, inline dismissible UI errors | Completed | Checked with `server.ts`, `BoschIntakeForm.tsx`, `MessagingCenter.tsx` |
| Phase 3 (P0) | Public portal gating (`CustomerLookupResult`), `_pdfRecord` gated to verified lookups, CSPRNG `publicAccessToken`, HTTP `403` phone verification on `/api/customer-portal/lookup`, sample verification prompt | Completed | Checked with `server.ts`, `App.tsx`, `CustomerView.tsx`, `customerPortalUrl.ts` |
| Phase 4 (P1) | Idempotent stock deductions via `applyStockLifecycleTransition`, explicit **Cancelled** reversal policy restoring stock and clearing `stockDeductedAt`, `In Repair` & `Cancelled` status parity, valid `initialJobCards.ts` log statuses | Completed | Covered by `tests/stockDeduction.test.ts` and `JobCardDetail.tsx` |
| Phase 5 (P1) | Honest `MessageLog['status']` (`'Sent' | 'Pending'`), legend in `MessagingCenter.tsx`, `getEffectiveJobBilling(job).totalAmount` across PDF, UI, and templates | Completed | Covered by `tests/billing.test.ts` and message dispatch paths |
| Phase 6 (P1) | Threaded `settings` & `customFields` into `PdfViewModal` & `JobCardDetail`, `settings.requireSignature` enforcement, `NewJobModal` counter-signature label, collision-free `nextJobCardId` / `nextScheduleId` | Completed | Covered by `tests/jobId.test.ts` and `tests/maintenanceCsv.test.ts` |
| Phase 7 (P2) | End-to-end custom intake fields (`JobCard.customFieldValues`), system field overrides (`enabled`/`label`/`placeholder`/`required`), `'boolean'` checkbox, inline delete confirmation in `FieldCustomizer.tsx`, SQL (`custom_fields`, `custom_field_values_json`), Firestore rules + blueprint updates | Completed | Validated via `npm run validate:sql`, `eslint firestore.rules`, `firestore.rules.test.ts` |
| Phase 8 (P3) | Removed unused `bun.lock`, upgraded `scripts/validate_sql.js` state-machine lexer for MySQL & Postgres, added `AGENTS.md`, unified SQL bcrypt seed hash, reconciled `README.md` & `docs/*.md` | Completed | Validated by documentation sweep and `npm run validate:sql` |
| Phase 9 | Unit tests in `tests/*.test.ts` (`tsx --test`) + production smoke script `scripts/smoke_prod.mjs` | Completed | Executed `npm test` and `npm run smoke` |

---

## Original Plan Details & Decisions

### Decisions Locked In
- Production build bundles `server.ts` into `dist-server/server.cjs` via `esbuild` so `dist/` serves only static client assets.
- Public client portal (`CustomerView`) requires a valid `publicAccessToken` or `jobId` + matching phone last-4 digits before revealing full receipt details, PDF downloads, or company names.
- Cancelled stock reversal policy: transitioning a job card with prior stock deductions to `Cancelled` restores deducted quantities back into inventory, clears `stockDeductedAt` and `partsDeducted`, and appends an `INVENTORY_STOCK_RESTORED` audit entry.
- Message logging never marks a browser deep-link handoff (`wa.me/`, `sms:`) as `'Sent'`; only API dispatches returning `success: true` log `'Sent'`, while handoffs and fallbacks log `'Pending'`.
- Canonical SQL seed bcrypt hash for default demo password `123456`: `$2b$10$32i.0QG3W55o8K6A4GgVMe/2vH98gO.X1Mv1qQe4u6aY0g7l.0q5i`.
