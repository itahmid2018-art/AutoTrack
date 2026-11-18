# AutoTrack — Remediation Plan (Pre-Install)

> **Final location:** `docs/REMEDIATION_PLAN.md`
> This draft was written in the Plan-mode directory. Move/copy it into `docs/` once Plan mode is exited.
>
> **Status:** Draft, awaiting `npm install`
> **Date:** 2026-11-16
> **Basis:** static code review only. No dependency installation, type-check, build, or runtime test has been performed. Items flagged **[verify]** must be confirmed after install.

---

## 1. Decisions Locked In

| Topic | Decision |
|---|---|
| Production build | Bundle `server.ts` with `esbuild`; keep `npm run build` → `npm start` working |
| Public portal | Token **or** job ID + phone-last-4 required for **everything**, including the PDF |
| Auth / MySQL | Correct the documentation; keep localStorage. No new auth layer in this cycle |
| Gemini models | Env-configurable IDs + startup validation; fail loudly instead of per-request 500s |
| Sequencing | Phased by severity: P0 → P1 → P2 → P3, independently verifiable |

### Non-goals (explicitly out of scope)
- Real server-side authentication, sessions, or role enforcement.
- Migrating business data from localStorage to MySQL.
- Multi-user/multi-counter sync.
- Replacing the deterministic QR token with server-issued signed tokens.
- A full test suite (a small targeted suite is proposed as optional in Phase 9).

---

## 2. Baseline (do this before any edit)

```powershell
git rev-parse HEAD                 # record the starting commit
git status --porcelain             # should be clean on main
node --version                     # record; check package.json "engines" if present
```

Record in the PR description so findings can be re-tested against a known point.

---

## 3. Phase 1 (P0) — Make the production build real

**Why:** `npm run build` runs `vite build`, which emits `dist/index.html` + assets only. `npm start` runs `node dist/server.js`, a file nothing creates. The documented production path cannot start.

### 1.1 Bundle the server
`package.json`
- Add `"build:server"` using `esbuild` (already a devDependency, currently unused):
  - entry `server.ts`, `--platform=node`, `--format=cjs`, `--target=node20` (match `engines`/deployment runtime),
  - `--bundle --packages=external` so `express`, `@google/genai`, etc. stay in `node_modules`,
  - `--outfile=dist-server/server.cjs`.
- Keep the bundle **outside** the static root so `express.static` cannot serve it.
- Rewrite `"build"` to `clean:dist && build:client && build:server` so `README.md:122–128` stays accurate.
- Point `"start"` at `dist-server/server.cjs`.
- Replace `"clean": "rm -rf dist server.js"` (`package.json:10`) with a cross-platform Node one-liner that removes `dist` and `dist-server` only. Do **not** delete `server.js` — that name collides with a future build artifact and has already destroyed nothing only by luck (`server.ts` is the real source).

**Why a Node one-liner:** `rm -rf` fails under PowerShell/CMD, which is this repo's primary dev platform.

### 1.2 Remove the production dependency on `vite`
`server.ts` imports `createViteServer` at module scope, and `vite` is a devDependency. In a prod install that omits devDependencies, `require('vite')` fails at boot even though the code path is never used.

- Move the import inside the `NODE_ENV !== 'production'` branch as `const { createServer: createViteServer } = await import('vite')` (`server.ts:961–969`).
- **[verify]** confirm the top-level import exists and that no other dev-only package is imported unconditionally.

### 1.3 Fix static path resolution
`server.ts:971` uses `express.static('dist')`, which resolves against the process CWD. Starting the server from any other directory serves a 404 index.

- Resolve from the bundle location instead: `path.resolve(__dirname, '..', 'dist')` (CJS build, so `__dirname` is available).
- Keep the SPA fallback behavior unchanged; verify deep links (`/?view=customer&token=…`) still return `index.html`.

### 1.4 Unify the port
`server.ts:18–28` reads `DEFAULT_APP_PORT` in dev and `PORT` in prod. `README.md:111` documents `PORT=3000`; `.env.example` defines neither.

- Single precedence chain in both modes: `--port` CLI arg → `PORT` → `DEFAULT_APP_PORT` → `3000`.
- Add `PORT=3000` to `.env.example` with a one-line comment; keep `DEFAULT_APP_PORT` documented as a dev-only alias or drop it entirely.
- **[verify]** the startup log at `server.ts:979–987` prints the resolved host/port so misconfiguration is visible.

### 1.5 Ignore build output
Ensure `.gitignore` covers `dist/` and the new `dist-server/`. **[verify]** current contents before editing.

### Phase 1 acceptance
```powershell
npm install
npm run lint          # tsc --noEmit
npm run build         # must create dist/index.html and dist-server/server.cjs
$env:NODE_ENV='production'; npm start
# expect: server listening on the documented port, / returns the app shell,
#         /api/messaging/status returns JSON
```

---

## 4. Phase 2 (P0) — AI model configuration and failure behavior

**Why:** `server.ts` hardcodes:

| Model | Lines |
|---|---|
| `gemini-3.8-flash` | 125, 189, 355, 412 |
| `gemini-4-hydrogen` | 273, 557, 707 |
| `gemini-3.5-transcribe` | 661 |

`gemini-4-hydrogen` and `gemini-3.5-transcribe` do not correspond to known public models; all IDs are unverifiable against `@google/genai@3.1.0`. If any is wrong, every AI feature 500s, and only two features have client fallbacks.

### 2.1 One-time model discovery
Add `scripts/check_gemini_models.mjs`:
- Instantiate the client from `GEMINI_API_KEY`.
- Call the SDK's model-listing API.
- Print every model ID that supports `generateContent`, plus which support audio input.
- Exit non-zero if the IDs currently configured in `.env` are absent from the list.

Run it once after `npm install`; treat its output as the source of truth for defaults.

### 2.2 Centralize and make configurable
- Replace the 8 literals with two constants resolved from env:
  - `GEMINI_TEXT_MODEL` (diagnose, generate-message, repair-chat, recommend-parts, recommend-reorders, response-assistant, scan-serial)
  - `GEMINI_AUDIO_MODEL` (transcribe)
- Defaults = IDs confirmed by 2.1 (do not guess; leave a `TODO(verify-models)` placeholder until discovery runs).
- Add both keys to `.env.example`.

### 2.3 Fail loudly at startup
- If `GEMINI_API_KEY` is set and `NODE_ENV === 'production'`, validate the configured models once during `startServer()`.
- On failure: log the exact model ID and the valid alternatives, then exit non-zero. A boot-time failure is far cheaper than silent per-request 500s.

### 2.4 Graceful degradation (P1, same PR acceptable)
Features with **no** offline path today: recommend-parts, repair-chat, transcribe, scan-serial, generate-message, response-assistant.
- Minimum: surface a clear inline error ("AI unavailable — retry / enter manually") and keep the manual field usable.
- Optional: add deterministic fallbacks mirroring `AiDiagnosis.tsx:101` and `AiReorderRecommendations.tsx:87`.

### Phase 2 acceptance
- `node scripts/check_gemini_models.mjs` passes with the shipped defaults.
- Temporarily setting `GEMINI_TEXT_MODEL=not-a-model` makes `npm start` fail with a readable error.
- With a valid key, each `/api/ai/*` endpoint returns 200 for one sample payload.

---

## 5. Phase 3 (P0) — Close the public portal PII leak

**Why:** the "sanitized" customer summary carries the complete job record, and a predictable job ID is enough to get it.

Current path:
1. `App.tsx:417–428` — bare job-ID lookup succeeds with no phone check.
2. `CustomerView.tsx:169` — `_pdfRecord: job` embeds the full `JobCard`.
3. `CustomerView.tsx:216–225` — PDF download is not gated on `verifiedByTokenOrPhone`.
4. `generatePdf.ts:115–123, 139–140, 398–410` — the PDF contains phone, email, GST/tax ID, diagnostic notes, and both signatures.
5. `App.tsx:436` — sample job IDs are rendered as one-click lookups.

### 3.1 Server-free access rule
`App.tsx:406–429`
- Delete the bare-ID success branch (`:428`).
- Resolution order: exact token match → job ID **and** matching phone-last-4 → otherwise `null`.
- Distinguish "not found" from "needs verification" so the UI can prompt instead of pretending the job doesn't exist. Return a small result union, e.g. `{ status: 'found', summary } | { status: 'needs-verification' } | { status: 'not-found' }`.

### 3.2 Stop shipping the full record
- Remove `_pdfRecord` from `PublicJobStatusSummary` (`CustomerView.tsx:49`).
- Replace it with either:
  - a callback `onRequestPdf(jobId, token)` that resolves only for verified sessions, or
  - `_pdfRecord` populated **only** when `verifiedByTokenOrPhone === true`.
- Gate the Download button (`CustomerView.tsx:391–396`) on the same condition; otherwise render a disabled state with "Verify with phone last 4".

### 3.3 Strengthen the token
`customerPortalUrl.ts:17–29` derives the token deterministically from `id + createdAt`, so it is guessable from a QR screenshot plus a known ID scheme.

- Generate a random token (`crypto.randomUUID()` or 128 bits base32) the first time a job is normalized, then persist it on the `JobCard`. `normalizeJobCard` (`App.tsx:44–61`) already runs on add/update, so this is a small change.
- Keep the existing token if present (no churn for printed QRs).
- Note in code: determinism was chosen for QR stability; persisted randomness gives the same stability with real entropy.

### 3.4 Remove the enumeration aids
- Drop sample job-ID chips (`App.tsx:436`) or convert them to demonstrate the verification prompt.
- Confirm `CustomerView` does not display the full serial when unverified (it already masks at `:135–138`) — keep that behavior.

### 3.5 Residual risk to document
- Without a server, there is no real rate limiting or authority; a determined user can read localStorage directly. This is a **mitigation**, not a fix. Say so in `docs/SETUP_AND_MAINTENANCE_GUIDE.md`.
- Phone-last-4 is ~10⁴ guesses; token links should be the primary distribution method (printed QR), with ID+last-4 as a convenience fallback.

### Phase 3 acceptance
- Lookup by job ID alone → verification prompt, no data.
- Wrong last-4 → verification prompt, no data.
- Correct last-4 or valid token → status + branded PDF.
- React DevTools / network: no full `JobCard` object present in the unverified render path.
- A newly created job gets a high-entropy token that survives reload.

---

## 6. Phase 4 (P1) — Inventory and status correctness

### 4.1 Deduplicate stock deductions
Two deduction sites, no guard:
- `JobCardDetail.tsx:639` — fires on every entry into a trigger status.
- `JobCardDetail.tsx:443–447` — fires again on `Completed`.

Plan:
- Add `stockDeductedAt?: string` (or `partsDeducted?: { partId: string; qty: number }[]`) to `JobCard`.
- Deduct only when the flag is unset; set it atomically with the status write.
- Define reversal policy explicitly: on `Cancelled`, either restore stock and clear the flag, or leave it and require a manual inventory adjustment. **Pick one and document it** — silent divergence between UI totals and stock is worse than either choice.
- Apply the same guard to `deductStockOn === 'Approval'` and `'Completion'` paths.

### 4.2 Reconcile the status model
- `types/index.ts:35–44` defines 9 statuses; `JobCardDetail.tsx:1687` exposes 7 (missing `In Repair`, `Cancelled`).
- `KanbanBoard.tsx:38–50` folds `In Repair` into `In Service`; `JobCardList.tsx:69–71` repeats the special case.
- `initialJobCards.ts:80` uses `'Delivered'`, which is not in `JobStatus`.

Plan:
- Add `In Repair` and `Cancelled` to the detail dropdown.
- Decide whether `In Repair` is a real state or an alias. Recommendation: keep both, add a `Cancelled` handling path (Kanban hides it by default, list filter shows it, analytics excludes it — analytics already excludes `Cancelled`).
- Fix the seed data to a valid status.
- **[verify]** `KanbanBoard`'s `onQuickStatusChange` routes through `App.handleUpdateJobCard` so `stageHistory` is appended; if it writes directly, that is a second stage-history bug.

### Phase 4 acceptance
- Move a job through all statuses twice → stock decreases exactly once.
- Cancel a job → policy applied, no orphaned deduction.
- `In Repair` and `Cancelled` selectable and filterable; Kanban drop onto "In Repair" persists as expected.
- No TS errors from the status union.

---

## 7. Phase 5 (P1) — Honest messaging status

**Why:** history claims messages were sent when only a browser tab was opened.

| Location | Current | Fix |
|---|---|---|
| `MessagingCenter.tsx:277` | `data.success ? 'Sent' : 'Sent'` | `'Sent'` : `'Pending'` |
| `MessagingCenter.tsx:328` | same pattern for SMS | same fix |
| `RecurringMaintenanceView.tsx:160–176` | logs `'Sent'` before dispatch | log `'Pending'`; only `'Sent'` on API success |
| `App.tsx:324–334` | PDF send logs `'Sent'` on click | log `'Pending'` (download + `wa.me` is not delivery) |
| `NewJobModal.tsx:144` | `'Pending'` | already correct — use as the reference pattern |

Additional:
- `MessageLog.status` (`types/index.ts:99`) allows `'Delivered'` but nothing sets it. Either wire a delivery webhook or remove `'Delivered'` from the union to avoid implying capability.
- Add a legend/tooltip in the message ledger: "Pending = handed to WhatsApp/SMS client, not confirmed delivered."

### Phase 5 acceptance
- Click "Send via WhatsApp" with no API keys → log entry reads **Pending**, not Sent.
- With Twilio/Meta keys → log entry reads **Sent** only when `data.success === true`.
- Errors produce Pending + a visible inline error.

---

## 8. Phase 6 (P1) — Branding, billing, signatures, IDs

### 6.1 Brand the staff PDFs
`JobCardDetail.tsx:1709` and `PdfViewModal.tsx:13` call `generateJobCardPdf(job)` with no `brandMeta`, so center name/address/phone and `currencySymbol` never appear (`generatePdf.ts:33`). Only `CustomerView.tsx:218–221` passes them.

- Thread `settings` into `JobCardDetail` and `PdfViewModal` from `App.tsx:477–486` and `:654`.
- Pass `{ centerName, address, phone, email, currencySymbol, portalOrigin: window.location.origin }`.
- Replace the hardcoded `(555) 019-2831` at `PdfViewModal.tsx:22` with `settings.phone`.

### 6.2 Use effective billing everywhere
`PdfViewModal.tsx:22` uses `job.totalAmount` directly, dropping operational expenses. Use `getEffectiveJobBilling(job).totalAmount` (`src/utils/billing.ts:50`) to match `generatePdf.ts:43`.

Also sweep the message templates:
- `MessagingCenter.tsx:123,125` use `job.totalAmount` → switch to effective billing.

### 6.3 Enforce or retire `requireSignature`
Defined (`types/index.ts:297`), toggled (`TransitionView.tsx:686–687`), exported (`mysqlExport.ts:228`), never read by intake or sign-off.

- Intake (`BoschIntakeForm.tsx:259–265`): if `requireSignature`, block submit without a signature.
- Sign-off (`JobCardDetail.tsx:396–411`): if `!requireSignature`, allow proceeding without a freshly drawn signature (still block if the setting is on).
- `NewJobModal`: either add signature capture or explicitly label it "Quick intake — signature collected at counter".

### 6.4 Deterministic, collision-free job IDs
`App.tsx:350`, the intake paths, and `maintenanceCsv.ts:273` all use `length + offset` (`+45`, `+5`, `+10`). Any delete or backup restore reuses IDs.

- Add `src/utils/jobId.ts` → `nextJobCardId(jobCards, prefix)`: parse the numeric suffix of existing IDs, take `max + 1`.
- Use it in all three call sites.
- Add a regression check: delete the newest job, create a new one, confirm the ID is unused.

### Phase 6 acceptance
- Staff-downloaded PDF shows configured center name, address, phone, and currency.
- A job with operational expenses shows the same total in the PDF, the messaging template, and the detail view.
- `requireSignature` off → sign-off without drawing; on → blocked.
- ID reuse test passes.

---

## 9. Phase 7 (P2) — Custom fields end-to-end

**Why:** `BoschIntakeForm.tsx:60, 935–958` captures `customValues`, but they are never attached to the submitted `JobCard`; `JobCard` has no field bag; `mysqlExport.ts` has no `custom_fields` table; and system fields cannot be toggled (`BoschIntakeForm.tsx:919–927` filters `!f.isSystem`, so enable/label edits on system fields do nothing).

Plan:
1. `types/index.ts` → `JobCard.customFieldValues?: Record<string, string | number | boolean>`.
2. `BoschIntakeForm` submit → include `customFieldValues: customValues`.
3. Render system fields from `customFields` where `enabled` is false → hide, and apply `label` overrides; or, if that is too invasive, relabel the customizer UI as "custom fields only" and drop the system-field toggles. **Pick one — do not leave a control that does nothing.**
4. Display captured values read-only in `JobCardDetail` and include them in the PDF appendix (optional).
5. Export: add `custom_fields` DDL + inserts, and a `job_card_custom_values` table (or a JSON column on `job_cards`) to `mysqlExport.ts`. Align with `database.sql:89`.
6. `deleteField` in `FieldCustomizer.tsx:146` — warn that existing values will be orphaned.

### Phase 7 acceptance
- Add a custom field → it appears on intake → value persists through reload → appears on the detail view.
- Disable a system field (if supported) → it disappears from intake.
- SQL export contains the field definition and the captured value.

---

## 10. Phase 8 (P3) — Documentation reconciliation

Every claim below is currently false or unverifiable in code.

| Claim | Location | Reality |
|---|---|---|
| React 18 | `SETUP_GUIDE:31`, `USER_MANUAL:56` | package.json uses React 19 |
| QR target `#status?token=…` / `/track?token=…` | `TESTING_GUIDE:178` | actual is `/?view=customer&token=…` |
| "10 Tables" | `USER_MANUAL:224` | `database.sql` defines 11 |
| Authentication, security banner, forced rotation | `SETUP_GUIDE:32–44` | no auth code in `server.ts` |
| `/api/jobs/public-status` | architecture diagram / guide | endpoint does not exist |
| Central MySQL database | `SETUP_GUIDE:33` | all state is browser localStorage |
| UI customizer toggles work | `USER_MANUAL:195` | system fields are ignored (Phase 7) |
| Admin bcrypt hash | `README.md:153` vs `database.sql:54` | two different hashes for the same password |
| "Production-ready" schema | `README.md:134` | export and DDL diverge (Phase 7) |

Plan:
- Apply the corrections above; prefer removing a claim over softening it.
- Add an "Architecture reality" section to `SETUP_GUIDE` stating: single-user, browser-local data, Express as an AI/messaging proxy only.
- Add a "Deployment limits" section: QR links resolve only in the browser profile that created the job; there is no server-side job store. **This is the single most important operational caveat.**
- Reconcile the bcrypt hash — keep exactly one source of truth and generate it, don't hand-copy.
- Either upgrade `scripts/validate_sql.js` to a real parser (`node-sql-parser`) and wire `"validate:sql"`, or rename it to `check_sql_balance.js` and stop calling it "syntax verification" (`scripts/validate_sql.js:56`).
- Decide on `bun.lock`: keep and document bun as an alternative, or remove it so npm is unambiguous.
- Add `AGENTS.md` (compact: commands, architecture invariants, known gotchas).

---

## 11. Phase 9 (optional) — Guardrails

- Add `vitest` and cover the pure utilities, which is where the silent bugs live:
  - `billing.ts` (expenses, rounding, stored-total reconciliation)
  - `jobId.ts` (collision after delete/restore)
  - `customerPortalUrl.ts` (token stability + entropy)
  - `warrantyAdjudicator.ts`, `barcodeSerialParser.ts`, `maintenanceCsv.ts`
- Add `npm run validate:sql` to a `prebuild` or CI step.
- Add a smoke script that boots the server in prod mode and curls `/` and `/api/messaging/status`.

---

## 12. Verification Matrix

| Phase | Command / action | Pass condition |
|---|---|---|
| 1 | `npm run build` | `dist/index.html` + `dist-server/server.cjs` exist |
| 1 | `$env:NODE_ENV='production'; npm start` | boots, `/` serves app, no `require('vite')` error |
| 1 | `npm start` from a different CWD | app still serves |
| 2 | `node scripts/check_gemini_models.mjs` | exits 0 |
| 2 | bad `GEMINI_TEXT_MODEL` | startup exits non-zero with a readable message |
| 3 | portal, ID only | verification prompt, no PII |
| 3 | portal, ID + wrong last-4 | verification prompt |
| 3 | portal, valid token | status + branded PDF |
| 4 | status cycle ×2 | stock −1 total |
| 4 | cancel job | reversal policy holds |
| 5 | send without API keys | log shows Pending |
| 6 | staff PDF | configured branding + effective total |
| 7 | custom field round-trip | persists, exports |
| 8 | docs read-through | no false capability claims |

Run the existing manual cases in `docs/TESTING_AND_QA_ACCEPTANCE_GUIDE.md` after Phase 6, fixing any that are unachievable rather than leaving them as aspirational QA steps.

---

## 13. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Model IDs still invalid after "fix" | Medium | High | Discovery script (2.1) is the gate; no guessed defaults |
| Prod bundle accidentally served as a static asset | Low | High | Keep `dist-server/` outside `dist/` |
| Signature enforcement breaks counter workflow | Medium | Medium | Roll out behind the existing setting; default stays permissive until tested |
| Stock reversal policy surprises accountants | Medium | Medium | Document the chosen policy in the setup guide and in the UI tooltip |
| Portal gating locks out legitimate customers | Medium | Medium | Keep token links primary; show clear "call the workshop" fallback |
| Docs updated ahead of code | Medium | Low | Land docs changes in the same PR as the behavior change |
| localStorage cleared → all data lost | Low | Critical | Recommend "Both" auto-backup destination; document restore steps prominently |

**Residual (not fixed by this plan):** no server-side authority, no real rate limiting across restarts (`server.ts:54`), `stripPII` does not mask names or addresses, and anyone with the browser profile has full data access.

---

## 14. Suggested PR Breakdown

One branch per phase, in order:

1. `fix/build-prod-bundle` — Phase 1
2. `fix/ai-model-config` — Phase 2
3. `fix/portal-access-control` — Phase 3
4. `fix/inventory-status-integrity` — Phase 4
5. `fix/message-status-truth` — Phase 5
6. `fix/pdf-branding-signature-ids` — Phase 6
7. `feat/custom-fields-persistence` — Phase 7
8. `docs/reality-alignment` — Phase 8
9. `test/utility-guardrails` — Phase 9 (optional)

Phases 1 and 2 both touch `server.ts` and should land before any runtime verification. Phases 3–6 are independent of each other. Phase 8 must follow the behavior changes it describes.

---

## 15. First Action After `npm install`

```powershell
npm install
npm run lint                 # capture the real error count — expect pre-existing noise
node scripts/check_gemini_models.mjs
npm run build
$env:NODE_ENV='production'; npm start
```

Report back with: lint error count, the model list output, and whether `dist-server/server.cjs` boots. That converts every **[verify]** item in this plan into a confirmed fact before code changes begin.
