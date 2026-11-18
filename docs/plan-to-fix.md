# AutoTrack — Plan to Fix (Production Readiness)

**Status:** Phases A, B, C, D, E, and F complete (2026-11-16). Phase C model IDs await verification with a real key. Phases G–J not started.
> **Superseded where conflicting (2026-11-18):** `docs/REMEDIATION_PLAN.md` and `AGENTS.md` are authoritative for token shape, message status, signature policy, and model IDs. This document is retained as the original execution log only.
**Date:** 2026-11-16
**Environment observed:** Windows 11 (10.0.22621), Node v22.15.1, npm 10.9.2, repo at `G:\Dev\AutoTrack`
**Inputs:** npm cache logs under `C:\Users\tahmi\AppData\Local\npm-cache\_logs`, plus static review of `package.json`, `server.ts`, `vite.config.ts`, `tsconfig.json`, and `bun.lock`.

---

## 1. Executive Summary

`npm install` currently **fails before anything is written**. The cause is a single peer-dependency conflict: the project pins `esbuild@^0.25.0` while `vite@8.3.8` declares an optional peer of `esbuild@^0.27.0 || ^0.28.0`.

Fixing that one line gets the install through. But install is only the first gate. Two structural defects sit behind it:

1. `npm run build` never produces `dist/server.js`, which `npm start` then tries to execute. The documented production path cannot work.
2. `server.ts` imports `vite` at module scope, and `vite` is a devDependency, so a production install that omits devDependencies crashes at boot.

The plan below is ordered so each phase is independently verifiable: **unblock install → prove build/start → harden runtime → close the security and data-integrity defects**. Nothing after Phase B is blocked by anything except Phase A.

---

## 1a. Execution Log — Phases A and B (2026-11-16)

Both gates passed. Actual results, not projections:

| Check | Result |
|---|---|
| `npm install` | Exit 0. 271 packages added, 278 audited, **0 vulnerabilities**. `package-lock.json` created (173,815 bytes). |
| `npm ls esbuild vite typescript` | `esbuild@0.28.2` hoisted and deduped under `vite@8.3.8` and `tsx@4.23.15` — one copy, no peer warnings. `typescript@7.0.2`. |
| `npm run typecheck` (`tsc --noEmit`) | **Clean, 0 errors.** No pre-existing baseline to document. |
| `npm run build` | Succeeded. `dist/index.html` (1,609 B), `dist/assets/index-*.js` (1,818 kB raw / 507 kB gzip), `dist-server/server.cjs` (38.5 kB). |
| `NODE_ENV=production npm start` | Boots on `0.0.0.0:3000`. `GET /` → 200. `GET /api/messaging/status` → JSON, fallback mode reported correctly. |
| `npm run dev` (tsx + Vite middleware) | Boots on `0.0.0.0:3000`. `GET /` → 200, 1,766 bytes, contains `id="root"`. API responds. |

### Changes applied

- `package.json` — `esbuild` `^0.25.0` → `^0.28.0`; scripts split into `clean` (cross-platform Node one-liner), `build:client`, `build:server`, `build`, `start` (`dist-server/server.cjs`), `typecheck`.
- `server.ts` — removed the module-scope `vite` import; now dynamically imported inside the dev branch. Added `node:path`. Static root resolves from `__dirname` instead of CWD. Port precedence unified to `--port` → `PORT` → `DEFAULT_APP_PORT` → `3000`.
- `.env.example` — documented `PORT`.
- `.gitignore` — added `dist-server/`.

### Observations for later phases (non-blocking)

1. ~~**Gemini client logs a warning at boot**~~ — **resolved in Phase C.** The client now uses a placeholder key and startup validation emits a single `[AI] GEMINI_API_KEY is not set…` warning.
2. **Vite 8 deprecation** — `server.hmr.*` is deprecated in favour of `server.ws.*` (`server.ts:964–966`). HMR still works; fix alongside Phase C or when Vite 9 lands.
3. **Bundle size warning** — the main client chunk exceeds 500 kB. Advisory only; a `manualChunks` split is a later optimization, not a correctness issue.
4. **`bun.lock` still present** alongside the new `package-lock.json`. Open Decision D-2 is unresolved; two lockfiles should not both be authoritative.

---

## 1b. Execution Log — Phase C (2026-11-16)

Plumbing and validation are complete. Model IDs themselves are **still unverified** — that requires a real `GEMINI_API_KEY`, which is not present in this checkout.

| Check | Result |
|---|---|
| `npm run typecheck` | Clean, 0 errors. |
| `npm run build` | Both artifacts rebuilt: `dist/index.html` (1,609 B), `dist-server/server.cjs` (42.6 kB). |
| Dev boot, no key | Single stderr line: `[AI] GEMINI_API_KEY is not set. AI endpoints are disabled (HTTP 503).` The previous duplicate SDK warnings are gone. |
| `POST /api/ai/diagnose` with no key | **503** with `{"error":"AI features are not configured on this server.","code":"AI_NOT_CONFIGURED","details":"Set GEMINI_API_KEY in the environment (see .env.example) and restart."}` |
| Prod boot, bogus key | **Exits 1** before serving, naming the reason (`API key not valid`) and stating `Refusing to start in production`. |
| `node scripts/check_gemini_models.mjs` with no key | Exits **2** with `GEMINI_API_KEY is not set. Add it to .env…` |
| `generate-message` client failure | Now shows an inline amber error near the AI Polish button and clears when the user edits the textarea or switches template. |

### Changes applied

- `ai-model-defaults.json` (new) — single source of truth for `text`, `reasoning`, `audio` model IDs.
- `server.ts` — loads defaults from that JSON with hardened fallbacks; adds `GEMINI_API_KEY` and `GEMINI_MODELS`; adds `/api/ai` 503 guard (`AI_NOT_CONFIGURED`); adds `validateGeminiConfiguration()` at the top of `startServer()`; replaces all 8 hardcoded model literals (4 text, 3 reasoning, 1 audio). Validation fails closed in production (`process.exit(1)`) and warns in development.
- `scripts/check_gemini_models.mjs` (new) — lists models for the configured key, prints PASS/FAIL per env var, exits 0/1/2, supports `--all`.
- `.env.example` — documents `GEMINI_TEXT_MODEL`, `GEMINI_REASONING_MODEL`, `GEMINI_AUDIO_MODEL`.
- `src/components/MessagingCenter.tsx` — `aiPolishError` state; `handleAiPolish` now checks `res.ok`, surfaces API `error`/`details`/`message`, and renders an inline error.

### What is still unproven

The default IDs (`gemini-3.8-flash`, `gemini-4-hydrogen`, `gemini-3.5-transcribe`) have never been confirmed against the live API. Until someone runs `node scripts/check_gemini_models.mjs --all` with a valid key, treat them as placeholders. If they are wrong, a keyed production boot now refuses to start rather than 500-ing per request — which is the intended failure mode, but it does mean the app will not boot until the IDs are corrected.

---

## 1c. Execution Log — Phase D (2026-11-16)

The public portal no longer exposes data on a bare job ID, and tokens are no longer derivable from public job data.

| Check | Result |
|---|---|
| `npm install` | Exit 0, up to date, 0 vulnerabilities. |
| `npm run typecheck` | Clean, 0 errors. |
| `npm run build` | Both artifacts rebuilt (`dist/index.html`, `dist-server/server.cjs` 41.6 kB). |
| `npm run dev` | Boots; `/` → 200 with `id="root"`; `/api/messaging/status` → 200. |
| Bare job ID lookup | `verification-required`, no summary, no PII. |
| Wrong phone last-4 | `verification-failed`, no summary, no PII. |
| Job ID + correct last-4 | `found`, verified, PDF record attached. |
| Valid token lookup | `found`, verified, no phone digits needed. |
| Token shape | `tok-<uuid-v4>`; does not embed job ID or timestamps; two mints for the same absent token differ. |
| Unverified sanitization | No `_pdfRecord`, no company name, masked serial. |
| Gate harness | `scripts/verify_portal_gate.ts` → **15/15 PASS**. |

### Changes applied

- `src/utils/customerPortalUrl.ts` — deterministic FNV hash replaced with `crypto.randomUUID()` (with `getRandomValues` and last-resort fallbacks).
- `src/utils/customerLookup.ts` (new) — `sanitizeJobForCustomer`, `lookupCustomerJob`, `CustomerLookupResult`, `PublicJobStatusSummary`. A successful lookup now requires a token **or** job ID + matching last-4.
- `src/App.tsx` — handler delegates to `lookupCustomerJob`; removed `sampleJobIds` quick-lookup chips and the unverified success branch; no full `JobCard` is returned unverified.
- `src/components/CustomerView.tsx` — renders `verification-required` / `verification-failed` instead of a generic "not found"; focuses the last-4 field; PDF button is disabled unless the summary is verified **and** carries `_pdfRecord`; removed demo chips; copy now states the rule.
- `src/data/initialJobCards.ts` — removed the hardcoded seeded `publicAccessToken` so demo data is minted a random token at load.
- `docs/SETUP_AND_MAINTENANCE_GUIDE.md` §2.5 — replaced the false "signed token / `/api/jobs/public-status`" claim with the real access model and an explicit residual-risk statement (client-side storage means no true access control against someone using the same browser profile).

### Residual risk (unchanged by this phase)

Tokens protect shared links, not the store. `localStorage` remains the source of truth, so anyone with the originating browser profile has full data access. Moving job data behind an authenticated API is a larger architectural change, not part of Phase D.

---

## 1d. Execution Log — Phase E (2026-11-16)

Stock moves exactly once per job card, and cancelling a job gives the parts back.

| Check | Result |
|---|---|
| `npm install` | Exit 0, up to date, 0 vulnerabilities. |
| `npm run typecheck` | Clean, 0 errors. |
| `npm run build` | Both artifacts rebuilt (`dist/index.html`, `dist-server/server.cjs` 41.6 kB). |
| `npm run dev` | Boots; `/`, `/src/App.tsx`, `/src/components/JobCardDetail.tsx`, `/src/components/JobCardList.tsx`, `/src/utils/stockLedger.ts`, `/api/messaging/status` all → 200. |
| Gate harness | `scripts/verify_stock_ledger.ts` → **33/33 PASS**. |
| Portal gate re-run | `scripts/verify_portal_gate.ts` → still **15/15 PASS**. |

### Decisions applied

- **D-2:** `bun.lock` removed with `git rm`; `package-lock.json` is the single lockfile (173,815 B), and no `bun` references remain in `package.json` or the docs.
- **D-3:** cancelling restores the deducted quantities and clears the ledger, so a later re-open deducts again. This is now the documented policy, not an implicit behaviour.

### Changes applied

- `src/types/index.ts` — added `StockDeduction` and the optional `stockDeductedAt` / `stockDeductions` fields on `JobCard`. Existing records without them load unchanged.
- `src/utils/stockLedger.ts` (new) — `reconcileStockForUpdate`, `triggerStatusFor`, `DeductStockOn`. Deduction is idempotent, parts added after the first deduction take a delta-only deduction, cancellation restores the whole ledger, and audit entries record `STOCK_DEDUCTED`, `STOCK_DEDUCTED_ADDITIONAL`, and `STOCK_RESTORED_ON_CANCEL`.
- `src/components/JobCardDetail.tsx` — both manual deduction blocks (status change and technician sign-off) replaced with the reconciler; dropdown now lists every `JobStatus`, including `In Repair` and `Cancelled`; new `onRestoreInventoryStock` prop.
- `src/App.tsx` — added `handleRestoreInventoryStock`; `handleQuickStatusChange` (list and Kanban moves) now reconciles stock; `handleUpdateJobCard` reconciles on every save as a safety net, which covers part additions made without a status change.
- `src/components/JobCardList.tsx` — added a `Cancelled` filter tab. `KanbanBoard` deliberately has **no** Cancelled column: its "advance" button uses column order, so a trailing Cancelled column would send `Completed` jobs to `Cancelled`. `In Repair` is already grouped under `In Service` there.

### Policy details worth knowing

- **Trigger:** `Approval` → `Awaiting Approval`, `InService` → `In Service`, `Completion` → `Completed` (from `settings.deductStockOn`).
- **No double deduction:** re-entering the trigger status, or saving any other edit afterwards, takes no further stock because `stockDeductedAt` and the ledger are already present.
- **Delta only:** parts added or increased while already at the trigger status deduct only the difference.
- **Decreases are not reversible:** lowering or removing a part does not put stock back. Only cancellation restores. Adjust inventory manually if needed.
- **Cancellation:** restores every ledger line, clears `stockDeductedAt` and `stockDeductions`, and logs `STOCK_RESTORED_ON_CANCEL`. Re-opening the job deducts again.
- **Legacy records:** a job already sitting at the trigger status with no ledger is treated as "probably already deducted by the old code" and is not deducted again on an unrelated edit. Only a fresh entry into the trigger status starts a ledger.

### Correction to the original plan

Phase E step 5 (`initialJobCards.ts:80`, `status: 'Delivered'`) was a **false positive**. That line is a `MessageLog` status, where `'Delivered'` is valid. No invalid `JobStatus` exists in the seed data, and the status union itself was already correct. `MessageLog` honesty is Phase F work.

---

## 1e. Execution Log — Phase F (2026-11-16)

Message logs no longer claim delivery that the app cannot prove.

| Check | Result |
|---|---|
| `npm run typecheck` | Clean, 0 errors. |
| `npm run build` | Both artifacts rebuilt (`dist/index.html`, `dist-server/server.cjs` 41.6 kB). |
| `npm run dev` | Boots; `/`, `MessagingCenter.tsx`, `RecurringMaintenanceView.tsx`, `/api/messaging/status` all → 200. |
| Gate harness | `scripts/verify_message_status.ts` → **17/17 PASS**. |
| Gate D / Gate E re-run | Still PASS. |

### Decision applied

- **D-5:** keep `'Delivered'` in the `MessageLog` union, but nothing produces it until a delivery webhook exists. It is documented as reserved, not as a capability.

### Changes applied

- `src/utils/messagingStatus.ts` (new) — `sentStatusFor(apiConfirmed)` and `isApiConfirmed(resOk, payload)`. A message is `'Sent'` only when the HTTP status is OK **and** the body has `success: true`; everything else is `'Pending'`.
- `src/components/MessagingCenter.tsx` — both send handlers now derive the log status from the API outcome (replacing `data.success ? 'Sent' : 'Sent'`). Network failures are logged as `Pending` and surface an inline error instead of only `console.error`. A provider rejection (`apiConfigured: true`, `success: false`) shows the provider error and does not auto-open a deep link.
- `src/components/RecurringMaintenanceView.tsx` — `wa.me` reminders log `Pending`.
- `src/App.tsx` — PDF deep-link logging records `Pending`.
- `src/components/PdfViewModal.tsx` — the confirmation banner no longer says "PDF Dispatched to Customer"; it says WhatsApp opened and the send is logged as Pending.
- `src/types/index.ts` — documents the contract on `MessageLog.status`.
- `database.sql` + `src/utils/mysqlExport.ts` — `message_logs.status` default changed from `Sent` to `Pending`.

### What this does not do

There is still no delivery receipt. `'Sent'` means the provider accepted the message, not that the handset received it. `'Delivered'` requires a webhook or status-polling integration (Twilio status callbacks or Meta webhooks) and is tracked as a gap rather than half-implemented.

---


## 2. Evidence From the npm Logs

| Log file | Command | Outcome |
|---|---|---|
| `2026-11-16T06_47_33_104Z-debug-0.log` | `npm install` | **Failed, `ERESOLVE`** (the install blocker) |
| `2026-11-16T06_47_33_104Z-eresolve-report.txt` | — | Structured explanation of the conflict |
| `2026-11-16T06_46_30_495Z-debug-0.log` | `npm build` | Exit 1 (not a real npm script) |
| `2026-11-16T06_46_38_301Z-debug-0.log` | `npm run build` | Exit 1, no lifecycle output captured |
| `2026-11-16T06_14_44_980Z-debug-0.log` | `npm install -g @opencode/cli` | Unrelated global tool install |
| `2026-11-16T06_16_*, 06_20_*, 06_30_*, 06_40_*, 06_50_*` | `npm list -g @opencode/cli` | Unrelated, exit 0 |
| `2026-11-03T12_16_17_721Z-debug-0.log` | `npm install` in `G:\Dev\ai_projects\gemini\INSTASEND` | Different repo, unrelated |

### 2.1 The actual error

From `2026-11-16T06_47_33_104Z-debug-0.log` (lines 1924–1928):

```text
error code ERESOLVE
error ERESOLVE could not resolve
error While resolving: vite@8.3.8
error Found: esbuild@0.25.12
error   node_modules/esbuild
error   dev esbuild@"^0.25.0" from the root project
error
error Could not resolve dependency:
error peerOptional esbuild@"^0.27.0 || ^0.28.0" from vite@8.3.8
```

The dependency graph, per the eresolve report:

```text
root project
  +-- vite@^8.3.0            -> 8.3.8  (needs esbuild ^0.27 || ^0.28)
  +-- @tailwindcss/vite@^4.3.3 -> 4.3.5 (peer vite ^5.2 || ^6 || ^7 || ^8)
  +-- @vitejs/plugin-react@^6.1.1 -> 6.3.0 (peer vite ^8)
  +-- devDependency esbuild@^0.25.0 -> 0.25.12   <-- conflict
```

### 2.2 Corroborating facts

- `package.json:34` — `"esbuild": "^0.25.0"`.
- `package.json:27` — `"vite": "^8.3.0"`.
- `bun.lock` resolves `esbuild@0.25.12` at the root and nests `esbuild@0.28.2` under `tsx`. The lockfile therefore encodes the same unsatisfied peer, and bun tolerates it while npm does not.
- No `package-lock.json` exists. npm has no lockfile to fall back on, so it resolves fresh and hits the conflict every time.
- `node_modules/` is absent.
- `bun` is **not installed** on this machine, yet `bun.lock` is committed.
- The repo has **no `.npmrc`**, but the 12:17 log line 4 shows npm loading `G:\Dev\AutoTrack\.npmrc`. Either that file was created and later deleted, or the earlier attempt used it. Leftover `legacy-peer-deps` configuration must not be allowed to mask this.

### 2.3 The two build attempts

`npm run build` exited 1 at 12:16:38 with no stack in the debug log. That is consistent with `vite: not found` because `node_modules` was never created. It cannot be confirmed from the log alone; Phase B re-runs it after a successful install and captures the real output.

---

## 3. Root Cause Analysis

### RC-1 — Install blocker: esbuild major-version mismatch

`vite@8` made `esbuild` an **optional peer** pinned to `^0.27.0 || ^0.28.0`. The project declares `^0.25.0` for its own (currently unused) direct esbuild dependency. npm 10 enforces optional peers during resolution, so it aborts rather than nesting.

**Fix:** raise the direct dependency to `^0.28.0`. This satisfies vite's peer range and dedupes against `tsx`'s nested `~0.28.0`, so one esbuild copy serves the build, `tsx`, and the planned server bundle.

**Non-fix:** `--force` and `--legacy-peer-deps` suppress the check without resolving the version conflict. They belong in a diagnostic run only, never in a committed `.npmrc` or CI script.

### RC-2 — Production build produces no server artifact

- `package.json:8` → `"build": "vite build"` emits `dist/index.html` plus assets.
- `package.json:9` → `"start": "node dist/server.js"` expects a file that nothing generates.
- `esbuild` is installed at `package.json:34` but no script invokes it.
- `package.json:10` → `"clean": "rm -rf dist server.js"` cannot run in PowerShell/CMD, and targets a root `server.js` that collides with a future build output.

**Fix:** add an esbuild server bundle, split `build` into client + server steps, point `start` at the real artifact, and make `clean` cross-platform.

### RC-3 — `vite` is imported unconditionally in production

`server.ts:3`:

```ts
import { createServer as createViteServer } from 'vite';
```

`vite` is a devDependency (`package.json:27` is under `dependencies` today, but it is a build-time tool). Even if it stays a runtime dependency, importing a 100+ MB build tool in the production server process is wrong, and if devDependencies are pruned in deployment, the process fails at startup before the `NODE_ENV` branch is reached.

**Fix:** move the import into the development branch as a dynamic import.

### RC-4 — Static root resolves against the process CWD

`server.ts:971` uses `express.static('dist')`. Starting the process from any directory other than the repo root serves 404s.

**Fix:** resolve from the bundle location.

---

## 4. Fix Sequence

Each phase has its own acceptance gate. Do not start the next phase until the gate passes.

> **Shell note:** this machine's PowerShell blocks `npm.ps1` (execution policy). If that happens, use `npm.cmd <args>` or run commands via `cmd /c npm <args>`. Not a project defect.

---

### Phase A — Unblock `npm install` (blocking) — ✅ complete

#### A1. Raise esbuild to match vite's peer range

`package.json`, devDependencies:

```diff
-    "esbuild": "^0.25.0",
+    "esbuild": "^0.28.0",
```

Why `^0.28.0` and not `^0.27.0`: `tsx` already resolves `esbuild@0.28.2`, so `^0.28.0` gives a single hoisted copy instead of two.

#### A2. Confirm no peer-depression config

```powershell
Test-Path .npmrc
npm config get legacy-peer-deps
```

Both must be false/absent. If a `.npmrc` exists, inspect it before installing; do not leave `legacy-peer-deps=true` behind as the "fix".

#### A3. Decide the lockfile policy

Two lockfiles cannot both be authoritative. Recommended: delete `bun.lock` (bun is not installed, and npm is the documented path), then commit the generated `package-lock.json`. If bun is genuinely the team's tool, the inverse applies: regenerate `bun.lock` after A1 and drop npm from the docs. **Pick one; see Open Decision D-2.**

#### A4. Install

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm install
```

Expected:
- No `ERESOLVE`.
- `package-lock.json` created.
- `node_modules/esbuild` resolves to `0.28.x`.

#### A5. Verify the resolved tree

```powershell
npm ls esbuild vite typescript
```

Expected: one hoisted `esbuild@0.28.x` (or a clearly nested duplicate with no conflict markers), `vite@8.3.x`, `typescript@7.0.x`.

**Gate A:** `npm install` exits 0 and `npm ls` reports no `invalid` or `UNMET PEER DEPENDENCY` entries.

**If it still fails:** capture `npm install --dry-run --loglevel=verbose` and stop. Do not escalate to `--force`.

---

### Phase B — Make `npm run build && npm start` real (blocking) — ✅ complete

#### B1. Rewrite the scripts

`package.json`:

```json
"scripts": {
  "dev": "tsx server.ts",
  "clean": "node -e \"const fs=require('node:fs');for(const d of ['dist','dist-server'])fs.rmSync(d,{recursive:true,force:true})\"",
  "build:client": "vite build",
  "build:server": "esbuild server.ts --bundle --platform=node --target=node22 --format=cjs --packages=external --outfile=dist-server/server.cjs",
  "build": "npm run clean && npm run build:client && npm run build:server",
  "start": "node dist-server/server.cjs",
  "typecheck": "tsc --noEmit",
  "lint": "npm run typecheck"
}
```

Rationale for each choice:

- **`dist-server/` outside `dist/`** — if the bundle lives in `dist/`, `express.static` can serve the server source. Keep them separate.
- **`.cjs` extension** — `package.json:5` sets `"type": "module"`, so a `.js` bundle would be treated as ESM and `require` would fail.
- **`--packages=external`** — `express`, `@google/genai`, etc. stay in `node_modules`; only project code is bundled.
- **`--target=node22`** — matches the observed runtime (v22.15.1).
- **Node one-liner for `clean`** — `rm -rf` is not available in PowerShell/CMD.
- **`lint` kept as an alias** — preserves the existing command name.

#### B2. Defer the `vite` import

`server.ts:3` — remove the static import. Inside `startServer()` (`server.ts:961`), do:

```ts
if (process.env.NODE_ENV !== 'production') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ /* existing options */ });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, '..', 'dist')));
}
```

Add `import path from 'node:path';` at the top (CJS bundle provides `__dirname`; `server.ts` currently uses neither `import.meta` nor `__dirname`, so this is safe).

#### B3. Unify the port

`server.ts:18–28` — one precedence chain in both modes: `--port` → `PORT` → `DEFAULT_APP_PORT` → `3000`. Then update `.env.example` to document `PORT=3000` (it currently documents neither variable) and drop `DEFAULT_APP_PORT` unless there is a reason to keep it.

#### B4. Ignore build output

Add `dist-server/` to `.gitignore`. Confirm `dist/` and `node_modules/` are already ignored.

#### B5. Smoke test

```powershell
npm run build
# expect: dist/index.html, dist/assets/*, dist-server/server.cjs

$env:NODE_ENV='production'
npm start
# expect: startup log with resolved host/port, no "Cannot find module 'vite'"

# in a second shell
curl.exe -I http://localhost:3000/
curl.exe -s http://localhost:3000/api/messaging/status
```

**Gate B:** both files exist, the prod server boots, `/` returns the app shell, the status endpoint returns JSON.

---

### Phase C — AI configuration and failure behavior — ✅ complete (IDs unverified)

**Problem:** `server.ts` hardcodes eight model IDs: `gemini-3.8-flash` (lines 125, 189, 355, 412), `gemini-4-hydrogen` (273, 557, 707), `gemini-3.5-transcribe` (661). Two of those are not known public model names. If any is wrong, every AI endpoint returns 500, and only `AiDiagnosis.tsx:101` and `AiReorderRecommendations.tsx:87` have client-side fallbacks.

**Steps:**

1. ✅ Add `scripts/check_gemini_models.mjs` that lists models available to the configured `GEMINI_API_KEY` and exits non-zero if the configured IDs are absent.
2. ✅ Replace the literals with three slots (`GEMINI_TEXT_MODEL` / `GEMINI_REASONING_MODEL` / `GEMINI_AUDIO_MODEL`), defaulting from `ai-model-defaults.json`. Documented in `.env.example`.
3. ✅ Validate once during `startServer()`. Production exits non-zero with a readable message; development warns and continues. A missing key returns `503 AI_NOT_CONFIGURED` instead of an opaque provider error.
4. ✅ Visible error state on `generate-message` (AI Polish). `recommend-parts`, `repair-chat`, `transcribe`, and `scan-serial` already surfaced errors; verified, no change needed.

**Gate C:** partially passed. The startup failure path is proven (bogus key → exit 1). The discovery script exits 2 without a key. Full pass requires a valid `GEMINI_API_KEY` to confirm the three default IDs.

---

### Phase D — Close the public portal PII leak — ✅ complete

**Problem:** `/_pdfRecord` embeds the whole `JobCard` (`CustomerView.tsx:169`), a predictable job ID alone is enough to retrieve it (`App.tsx:417–428`), and the PDF download is not gated (`CustomerView.tsx:216–225`). `generatePdf.ts:115–123, 139–140, 398–410` then prints phone, email, GST ID, diagnostic notes, and signatures.

**Steps:**

1. `App.tsx:406–429` — require a token **or** job ID + matching phone-last-4. Delete the bare-ID success branch at line 428. Return a discriminated result so the UI can say "verification required" instead of "not found".
2. `CustomerView.tsx:49,169` — stop carrying the full record in `PublicJobStatusSummary`; populate it only after verification, or replace it with a verified fetch callback.
3. `CustomerView.tsx:391–396` — disable the download until verified.
4. `customerPortalUrl.ts:17–29` — replace the deterministic token with a random persisted token (`crypto.randomUUID()`), generated once in `normalizeJobCard` (`App.tsx:44–61`).
5. `App.tsx:436` — remove the sample job-ID quick-lookup chips.
6. Document the residual risk in `docs/SETUP_AND_MAINTENANCE_GUIDE.md`: client-side storage means no real access control; token links are the intended distribution method.

**Gate D:** ID-only lookup and wrong-last-4 lookup show no data; valid token shows status plus a branded PDF; no full `JobCard` appears in the unverified render path.

---

### Phase E — Inventory and status integrity — ✅ complete

**Problem:** stock is deducted every time a trigger status is entered (`JobCardDetail.tsx:639`) and again on sign-off (`JobCardDetail.tsx:443–447`), with no dedup flag.

**Steps:**

1. Add `stockDeductedAt?: string` (or a per-part ledger) to `JobCard`.
2. Deduct only when the flag is unset; write the flag with the status change.
3. Choose and document the reversal policy for `Cancelled`: restore stock and clear the flag, or require a manual adjustment. Do not leave this implicit.
4. Add `In Repair` and `Cancelled` to the detail dropdown (`JobCardDetail.tsx:1687`), and reconcile them with `KanbanBoard.tsx:38–50` and `JobCardList.tsx:69–71`.
5. ~~Fix `initialJobCards.ts:80` (`status: 'Delivered'` is not a valid `JobStatus`).~~ **False positive:** this is a `MessageLog` status, where `'Delivered'` is valid. See §1d.

**Gate E:** running a job through the statuses twice decrements stock once; cancel behaves per the documented policy; no TypeScript errors from the status union.

---

### Phase F — Honest message status — ✅ complete

**Problem:** `MessagingCenter.tsx:277` and `:328` log `data.success ? 'Sent' : 'Sent'`. `RecurringMaintenanceView.tsx:160–176` logs `'Sent'` before opening WhatsApp. `App.tsx:324–334` logs `'Sent'` when the PDF modal opens.

**Steps:**

1. Log `'Pending'` whenever the only action was opening `wa.me` or `sms:`.
2. Log `'Sent'` only when the API returned `success: true`.
3. Either wire a delivery webhook for `'Delivered'` (`types/index.ts:99`) or remove it from the union so the type stops implying a capability that does not exist.

**Gate F:** with no API keys, every send logs `Pending`; with keys, success logs `Sent`; failures log `Pending` plus a visible error.

---

### Phase G — PDF branding, billing, signatures, IDs (~3 hours)

1. `JobCardDetail.tsx:1709` and `PdfViewModal.tsx:13` call `generateJobCardPdf(job)` without `brandMeta`, so center name/address/phone/currency never render. Thread `settings` from `App.tsx:477–486` and `:654`.
2. `PdfViewModal.tsx:22` uses `job.totalAmount` (drops operational expenses) and hardcodes `(555) 019-2831`. Use `getEffectiveJobBilling(job)` (`billing.ts:50`) and `settings.phone`.
3. `MessagingCenter.tsx:123,125` also use `job.totalAmount`; switch to effective billing.
4. `requireSignature` (`types/index.ts:297`, toggled at `TransitionView.tsx:686–687`) is never read. Enforce it at intake (`BoschIntakeForm.tsx:259–265`) and sign-off (`JobCardDetail.tsx:396–411`), or remove the setting.
5. Job IDs use `length + offset` (`App.tsx:350`, `maintenanceCsv.ts:273`), which collides after deletes or restores. Add `src/utils/jobId.ts` with `nextJobCardId(jobCards, prefix)` based on `max(suffix) + 1`.

**Gate G:** staff PDFs show configured branding and the effective total; signature policy is enforced or removed; delete-then-create does not reuse an ID.

---

### Phase H — Custom fields end-to-end (~4 hours)

`BoschIntakeForm.tsx:60, 935–958` captures `customValues` and never attaches them. `JobCard` has no field bag. `mysqlExport.ts` has no `custom_fields` table even though `database.sql:89` defines one. System-field toggles are filtered out at `BoschIntakeForm.tsx:919–927`, so they do nothing.

**Steps:** add `customFieldValues` to `JobCard`; attach on submit; render read-only in `JobCardDetail`; export DDL + inserts; either make system-field toggles work or relabel the customizer as custom-only.

**Gate H:** a custom field survives intake → reload → detail view → SQL export.

---

### Phase I — Documentation and dependency hygiene (~2 hours)

Fix these documented-but-false claims:

| Claim | Location | Reality |
|---|---|---|
| React 18 | `SETUP_GUIDE:31`, `USER_MANUAL:56` | React 19 |
| QR target `#status?token=…` | `TESTING_GUIDE:178` | `/?view=customer&token=…` |
| 10 tables | `USER_MANUAL:224` | 11 in `database.sql` |
| Auth, security banner, forced rotation | `SETUP_GUIDE:32–44` | no auth code |
| `/api/jobs/public-status` | guides | endpoint does not exist |
| Central MySQL store | `SETUP_GUIDE:33` | localStorage only |
| Customizer toggles work | `USER_MANUAL:195` | system fields ignored |
| Admin bcrypt hash | `README.md:153` vs `database.sql:54` | two different hashes |

Also:

- Add an "Architecture Reality" section stating the app is single-user, browser-local, with Express as an AI/messaging proxy only.
- Add a "Deployment Limits" section: QR links resolve only in the browser profile that created the job.
- Either upgrade `scripts/validate_sql.js` to a real parser and wire `validate:sql`, or rename it to `check_sql_balance.js` (it only counts backticks and parentheses today).
- Add `AGENTS.md` with commands, architecture invariants, and the gotchas from this document.

---

### Phase J — Guardrails (~2 hours, optional but recommended)

- Add `vitest` and cover the pure utilities where the silent bugs live: `billing.ts`, `jobId.ts`, `customerPortalUrl.ts`, `warrantyAdjudicator.ts`, `maintenanceCsv.ts`.
- Add a `smoke` script that builds, boots in prod mode, and curls `/` and `/api/messaging/status`.
- Add a CI job (GitHub Actions) running `npm ci && npm run typecheck && npm run build`.
- Add `"engines": { "node": ">=22.12" }` and a `.nvmrc`.

---

## 5. Verification Matrix

| Phase | Command / action | Pass condition |
|---|---|---|
| A | `npm install` | exit 0, `package-lock.json` created |
| A | `npm ls esbuild vite` | no `invalid` / `UNMET PEER` |
| B | `npm run build` | `dist/index.html` + `dist-server/server.cjs` exist |
| B | `NODE_ENV=production npm start` | boots, no `Cannot find module 'vite'` |
| B | start from a different CWD | `/` still serves |
| C | `node scripts/check_gemini_models.mjs` | exit 0 |
| C | bad `GEMINI_TEXT_MODEL` | startup exits non-zero, names the model |
| D | portal, ID only | verification prompt, no data |
| D | portal, valid token | status + branded PDF |
| E | status cycle ×2 | stock −1 total |
| F | send without API keys | log = `Pending` |
| G | staff PDF | configured branding + effective total |
| H | custom field round-trip | persists and exports |
| I | docs read-through | no false capability claims |

---

## 6. Definition of Done (Production Ready)

- [ ] `npm ci` succeeds from a clean checkout.
- [ ] `package-lock.json` committed; one lockfile policy, no ambiguity.
- [ ] `npm run typecheck` passes (or a documented baseline of pre-existing errors exists).
- [ ] `npm run build` produces both the client bundle and the server bundle.
- [ ] `NODE_ENV=production npm start` serves the UI and the API from one port.
- [ ] No production code path requires a devDependency.
- [ ] AI endpoints either work or fail with an actionable message, never a silent 500.
- [ ] The customer portal exposes no PII without a token or phone-last-4.
- [ ] Stock deductions are idempotent.
- [ ] Message logs distinguish `Pending` from `Sent`.
- [ ] Every capability claim in `README.md` and `docs/` maps to real code.

---

## 7. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Bumping esbuild breaks the `tsx` dev loop | Low | Medium | `tsx` bundles its own `~0.28.0`; dedupe makes them identical. Verify with `npm run dev`. |
| Fresh install pulls newer minor versions with breaking changes | Medium | Medium | Commit `package-lock.json` immediately after Gate A; use `npm ci` thereafter. |
| `tsc` with TypeScript 7 surfaces many pre-existing errors | High | Low | Capture the baseline at Gate B; do not fix application types in the same PR as the build fix. |
| Model discovery reveals no valid IDs without a paid key | Medium | High | Keep Phase C defaults behind env vars; document the failure mode; offline fallbacks in Phase C.4. |
| Portal gating locks out real customers | Medium | Medium | Token links primary, phone-last-4 fallback, clear "call the workshop" message. |
| Custom field migration orphans existing data | Low | Medium | Fields are additive; no destructive migration. |
| Sorting out the two lockfiles causes churn | Medium | Low | Decide once (D-2) and document it. |

**Residual risks not addressed by this plan:** no server-side authority, in-memory rate limiting that resets on restart (`server.ts:54`), `stripPII` does not mask names or addresses, and anyone with the browser profile has full data access.

---

## 8. Rollback

Before Phase A:

```powershell
git switch -c fix/production-readiness
git tag pre-fix-baseline
```

Per phase, rollback is `git revert <commit>`. For a dependency-only rollback:

```powershell
git checkout -- package.json package-lock.json
Remove-Item -Recurse -Force node_modules, dist, dist-server -ErrorAction SilentlyContinue
npm install
```

No destructive data migration is proposed, so localStorage data is never at risk.

---

## 9. Open Decisions

| ID | Decision | Recommendation | Owner |
|---|---|---|---|
| D-1 | Keep direct `esbuild` dependency, or rely on `vite`'s bundled esbuild? | Keep at `^0.28.0`; it is needed for the server bundle. | Dev |
| D-2 | `bun.lock` vs `package-lock.json` | **Resolved 2026-11-16:** `bun.lock` deleted; npm only. | Dev |
| D-3 | Stock reversal on `Cancelled` | **Resolved 2026-11-16:** restore stock and clear the deduction flag; re-opening deducts again. | Product |
| D-4 | Custom fields: make system-field toggles work, or relabel customizer? | Relabel for now; system-field overrides are a larger refactor. | Product |
| D-5 | `MessageLog` `'Delivered'`: implement a webhook or remove from the union? | **Resolved 2026-11-16:** keep the status, build a delivery webhook later; `Sent` now means provider-accepted only. | Product |
| D-6 | Minimum Node version to support | `>=22.12`, matching the Vite 8 peer and the current machine. | Dev |

---

## 10. Appendix — Exact First Commit

Everything needed to clear Gates A and B, and nothing else:

```diff
--- a/package.json
+++ b/package.json
@@
   "scripts": {
     "dev": "tsx server.ts",
-    "build": "vite build",
-    "start": "node dist/server.js",
-    "clean": "rm -rf dist server.js",
-    "lint": "tsc --noEmit"
+    "clean": "node -e \"const fs=require('node:fs');for(const d of ['dist','dist-server'])fs.rmSync(d,{recursive:true,force:true})\"",
+    "build:client": "vite build",
+    "build:server": "esbuild server.ts --bundle --platform=node --target=node22 --format=cjs --packages=external --outfile=dist-server/server.cjs",
+    "build": "npm run clean && npm run build:client && npm run build:server",
+    "start": "node dist-server/server.cjs",
+    "typecheck": "tsc --noEmit",
+    "lint": "npm run typecheck"
   },
@@
-    "esbuild": "^0.25.0",
+    "esbuild": "^0.28.0",
```

Plus, in `server.ts`: remove the static `vite` import at line 3, dynamic-import it inside the dev branch, add `import path from 'node:path'`, and change `express.static('dist')` to resolve from `__dirname`.

Commit message: `fix(build): resolve vite/esbuild peer conflict and produce a real server bundle`.

---

*Next step: approve D-1 through D-6, then execute Phase A. No code changes have been made.*
