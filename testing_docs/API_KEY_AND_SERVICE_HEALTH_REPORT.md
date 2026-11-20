# API Key & Service Health Report

**Run Timestamp:** 2026-11-20T06:25:52Z — 2026-11-20T06:28:47Z  
**Target Server:** `http://127.0.0.1:3000` (Express + Vite Dev Middleware, Node v22.23.2)  
**Firebase Project:** `ai-studio-applet-webapp-65129` (`ai-studio-autotrackservice-2eac3d40-310f-46ba-a293-99682d0a94d7`)

---

## 1. Executive Summary of API Key & Credential Findings

| Credential / Integration | Presence (Server Runtime) | Presence (CLI Shell) | Live Upstream Responsiveness | Status | Summary Finding |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Firebase Web API Key** (`AIzaSy...Wu0E`) | Configured (`firebase-applet-config.json`) | Configured (`firebase-applet-config.json`) | **200 OK** (363ms Auth), **403** (363ms Firestore REST) | **PASS** | Key is valid, accepted by Identity Toolkit, and Cloud Firestore enforces `firestore.rules`. |
| **Gemini API Key & Models** (`GEMINI_API_KEY`, `GEMINI_TEXT_MODEL`, `GEMINI_AUDIO_MODEL`) | Injected in server runtime (`hydrogen`) | Not injected in interactive shell | **200 OK** (`GET /api/ai/status` 73ms; all 6 text AI routes `6,525ms–17,492ms`) | **PASS** | Server resolves `27` supported models; `server.ts` normalizes bare `"hydrogen"` -> `gemini-4-hydrogen` and falls back to `gemini-3.1-flash-lite` on timeout/404/503. |
| **Firebase Admin ADC** (`GOOGLE_APPLICATION_CREDENTIALS`) | Missing / unprivileged | Missing | **503 Service Unavailable** (174ms–801ms) | **FAIL** | `/api/customer-portal/lookup` returns `7 PERMISSION_DENIED: Missing or insufficient permissions` on `adminDb` (SPA falls back cleanly to local cache). |
| **Twilio SMS & WhatsApp** (`TWILIO_*`) | Populated (`+918197845321`) | Missing in CLI shell | `/api/messaging/status` **200 OK** (4ms); validation **400**; live send skipped | **PARTIAL** | Server reports configured (`true`); upstream live SMS dispatch intentionally skipped to avoid external messages. |
| **Meta WhatsApp Cloud API** (`WHATSAPP_CLOUD_API_TOKEN`) | Populated | Missing in CLI shell | `/api/messaging/status` **200 OK** (4ms); validation **400**; live send skipped | **PARTIAL** | Server reports `metaWhatsAppConfigured: true`; upstream live dispatch skipped. |
| **SendGrid / Resend / SMTP** (`SENDGRID_API_KEY`, `RESEND_API_KEY`, `SMTP_*`) | Populated (`itahmid2018@gmail.com`) | Missing in CLI shell | `/api/messaging/status` **200 OK** (4ms); validation **400**; live send skipped | **PARTIAL** | Server reports `emailConfigured: true` across all 3 providers; upstream live dispatch skipped. |
| **Local SQL / Cache Daemons** (Postgres, MySQL, SQLite, Redis, MongoDB) | N/A | None installed | Not listening | **INFO** | None installed or running on loopback ports (`check_local_services.mjs` detected 1 service: Cloud Firestore HTTPS). |

---

## 2. Detailed API Key & Endpoint Probe Results

### 2.1 Gemini AI API (`GEMINI_API_KEY`, `GEMINI_TEXT_MODEL`, `GEMINI_AUDIO_MODEL`)
- **Runtime Diagnostics (`GET /api/ai/status` — HTTP 200 OK, `73ms`):**
  - `keyConfigured`: `true` (`27` visible `generateContent` models)
  - `configuredTextModel`: `"hydrogen"` (runtime secret) -> `normalizedTextModel`: `"gemini-4-hydrogen"` -> `resolvedTextModel`: `"gemini-3.1-flash-lite"` (automatic fallback under overload / `503` / `404` / `15s` timeout)
  - `configuredAudioModel`: `"hydrogen"` (runtime secret) -> `normalizedAudioModel`: `"gemini-4-hydrogen"` -> runtime fallback chain includes `"gemini-3.5-transcribe"` and `"gemini-3.1-flash-lite"`
- **CLI Verification Script (`node scripts/check_gemini_models.mjs`):**
  - **Result:** **WARN / CLI Env Missing** (`exit 1` unless `GEMINI_API_KEY` is manually exported into shell)
  - **Cause:** AI Studio injects secrets into the managed Express server process on port `3000`, not into interactive shell sub-processes. Use `GET /api/ai/status` against the running server to inspect model resolution safely.
- **Live Express AI Endpoints (`http://127.0.0.1:3000/api/ai/*`):**
  All 6 text inference routes and both media validation gates were probed directly after updating `server.ts`:

| Endpoint | HTTP Status | Latency (ms) | Upstream Response / Payload Check | Verdict |
| :--- | :---: | :---: | :--- | :---: |
| `GET /api/ai/status` | **200** | 73 | `keyConfigured: true`, `availableModelCount: 27`, normalized + resolved models reported | **PASS** |
| `POST /api/ai/diagnose` | **200** | 16,811 | Structured JSON (`estimatedLaborHours`, `probableCause`, `recommendedParts`, `repairSteps`) | **PASS** |
| `POST /api/ai/generate-message` | **200** | 16,040 | Valid client WhatsApp/SMS update draft returned | **PASS** |
| `POST /api/ai/response-assistant` | **200** | 17,492 | Contextual technician reply returned | **PASS** |
| `POST /api/ai/repair-chat` | **200** | 7,626 | Live diagnostic assistant answer returned | **PASS** |
| `POST /api/ai/recommend-reorders` | **200** | 6,525 | Structured reorder recommendations returned | **PASS** |
| `POST /api/ai/recommend-parts` | **200** | 16,559 | `analysisSummary` + `recommendedParts` returned (`BRSH-1002` matched for Bosch GBH 2-26 DFR) | **PASS** |
| `POST /api/ai/transcribe` (empty body check) | **400** | 7 | `{"error":"Audio recording payload (audioBase64) is required."}` | **PASS (Validation)** |
| `POST /api/ai/scan-serial` (empty body check) | **400** | 7 | `{"error":"Camera image payload (imageBase64) is required."}` | **PASS (Validation)** |

- **Secret Hygiene Advisory:**
  - Server-side alias normalization (`normalizeGeminiModelAlias`) and candidate fallback (`gemini-3.1-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro`, `gemini-3.1-pro-preview`) keep all AI endpoints operational (`200 OK`).
  - To remove extra fallback latency in production, set `GEMINI_TEXT_MODEL` and `GEMINI_AUDIO_MODEL` in AI Studio Secrets explicitly to full model IDs (for example `gemini-3.1-flash-lite` or `gemini-2.5-flash` for text and `gemini-3.5-transcribe` or `gemini-2.5-flash` for audio).

---

### 2.2 Firebase Web API Key, Cloud Firestore & Firebase Admin SDK
- **Config File Checked:** `/firebase-applet-config.json`
  - `projectId`: `ai-studio-applet-webapp-65129`
  - `firestoreDatabaseId`: `ai-studio-autotrackservice-2eac3d40-310f-46ba-a293-99682d0a94d7`
  - `apiKey`: Masked `AIzaSy...Wu0E` (length 39)
- **Live Upstream HTTPS Probes:**
  1. **Firebase Identity Toolkit (`createAuthUri`):**
     - **HTTP Status:** **200 OK** (`363ms`)
     - **Result:** Returned `kind: "identitytoolkit#CreateAuthUriResponse"`. Confirms the Firebase Web API Key is valid and active.
  2. **Cloud Firestore REST (`documents/test/connection`):**
     - **HTTP Status:** **403 PERMISSION_DENIED** (`363ms`)
     - **Result:** Reached the named Firestore database over HTTPS and enforced security rules against unauthenticated requests.
  3. **Local Services Probe (`node scripts/check_local_services.mjs --json`):**
     - **Status:** `CONFIGURED & REACHABLE` (`Firebase / Cloud Firestore`).
- **Backend Firebase Admin SDK (`src/lib/firebase-admin.ts`):**
  1. `GET /api/customer-portal/lookup?query=BOSCH-2026-0041` -> **503 Service Unavailable** (`174ms`–`801ms`)
     - **Response:** `{"error":"Customer portal remote lookup unavailable.","details":"7 PERMISSION_DENIED: Missing or insufficient permissions."}`
     - **Cause:** `GOOGLE_APPLICATION_CREDENTIALS` is unset and default runtime ADC lacks Firestore Admin / Datastore User IAM permissions on `ai-studio-applet-webapp-65129`.
     - **Client Fallback Status:** Client portal reads signed-in `publicDeliveries` Firestore records or falls back cleanly to verified local `jobCards` (`Gate D` tests pass).
  2. **Protected Admin Routes (Auth Middleware Gate Check):**
     - `GET /api/jobs` -> **401 Unauthorized** (`2ms`)
     - `GET /api/inventory` -> **401 Unauthorized** (`5ms`)
     - `GET /api/schedules` -> **401 Unauthorized** (`6ms`)

---

### 2.3 Messaging & Email Integrations (`/api/messaging/*`)
- **`GET /api/messaging/status` (HTTP 200 OK, `4ms`):**
  - `twilioSmsConfigured`: `true` (`twilioPhoneNumber`: `+918197845321`)
  - `twilioWhatsAppConfigured`: `true` (`twilioWhatsAppNumber`: `+918197845321`)
  - `metaWhatsAppConfigured`: `true` (`whatsappCloudConfigured`: `true`)
  - `emailConfigured`: `true` (`sendgridConfigured`: `true`, `resendConfigured`: `true`, `smtpConfigured`: `true`, `mailFrom`: `itahmid2018@gmail.com`)
  - `activeMode`: `"REST API Direct Dispatch Enabled"`
- **Validation Gate Probes (Non-Destructive):**
  - `POST /api/messaging/send-sms` (`{}`) -> **400 Bad Request**
  - `POST /api/messaging/send-whatsapp` (`{}`) -> **400 Bad Request**
  - `POST /api/messaging/send-email` (`{}`) -> **400 Bad Request**
- **Verification Scope:**
  - Live external dispatches to Twilio, Meta Graph API, or SendGrid/Resend/SMTP were intentionally omitted to avoid sending test SMS/WhatsApp/email traffic to real numbers or inboxes. Validate one internal sandbox dispatch per provider before customer go-live.

---

### 2.4 Local Database & Runtime Infrastructure (`scripts/check_local_services.mjs`)
- **HTTP Root (`GET http://127.0.0.1:3000/`):** **200 OK** (`152ms`), serves Vite HTML entry point cleanly.
- **PostgreSQL (5432) / MySQL (3306) / SQLite3 / Redis / MongoDB / Docker:** Not installed or listening on loopback ports; PostgreSQL 16 and MySQL 8.0 SQL scripts passed full lexical validation via `npm run validate:sql`.
