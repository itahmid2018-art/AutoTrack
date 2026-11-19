# API Key & Service Health Report

**Run Timestamp:** 2026-11-19T09:32:21Z — 2026-11-19T09:34:38Z  
**Target Server:** `http://127.0.0.1:3000` (Express + Vite Dev Middleware, Node v22.23.2)  
**Firebase Project:** `ai-studio-applet-webapp-65129` (`ai-studio-autotrackservice-2eac3d40-310f-46ba-a293-99682d0a94d7`)

---

## 1. Executive Summary of API Key & Credential Findings

| Credential / Integration | Presence (Server Runtime) | Presence (CLI Shell) | Live Upstream Responsiveness | Status | Summary Finding |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Firebase Web API Key** (`AIzaSy...Wu0E`) | Configured (`firebase-applet-config.json`) | Configured (`firebase-applet-config.json`) | **200 OK** (274ms Auth), **403** (350ms Firestore REST) | **PASS** | Key is valid, accepted by Identity Toolkit, and Cloud Firestore enforces `firestore.rules`. |
| **Gemini API Key & Models** (`GEMINI_API_KEY`, `GEMINI_TEXT_MODEL`) | Injected in server runtime | Missing in CLI shell (`exit 1` on `check_gemini_models.mjs`) | **500 / 404 NOT_FOUND** (215ms–612ms) | **FAIL** | Server authenticates with Google AI, but all 6 text AI routes fail with `404 models/hydrogen is not found for API version v1`. |
| **Firebase Admin ADC** (`GOOGLE_APPLICATION_CREDENTIALS`) | Missing / unprivileged | Missing | **503 Service Unavailable** (704ms) | **FAIL** | `/api/customer-portal/lookup` fails with `7 PERMISSION_DENIED: Missing or insufficient permissions` on `adminDb`. |
| **Twilio SMS & WhatsApp** (`TWILIO_*`) | Populated (`+918197845321`) | Missing in CLI shell | Input validation **400** (4–7ms); live dispatch skipped | **PARTIAL** | `/api/messaging/status` reports configured (`true`); upstream Twilio REST verification blocked from CLI shell and skipped to avoid external SMS. |
| **Meta WhatsApp Cloud API** (`WHATSAPP_CLOUD_API_TOKEN`) | Populated | Missing in CLI shell | Input validation **400** (4ms); live dispatch skipped | **PARTIAL** | `/api/messaging/status` reports `metaWhatsAppConfigured: true`; upstream token check not runnable from CLI shell. |
| **SendGrid / Resend / SMTP** (`SENDGRID_API_KEY`, `RESEND_API_KEY`, `SMTP_*`) | Populated (`itahmid2018@gmail.com`) | Missing in CLI shell | Input validation **400** (5ms); live dispatch skipped | **PARTIAL** | `/api/messaging/status` reports `emailConfigured: true` across all 3 providers; upstream auth check skipped to avoid sending test emails. |
| **Local SQL / Cache Daemons** (Postgres, MySQL, SQLite, Redis, MongoDB) | N/A | None installed | Not listening | **INFO** | None installed or running on loopback ports (`check_local_services.mjs` detected 1 service: Cloud Firestore HTTPS). |

---

## 2. Detailed API Key & Endpoint Probe Results

### 2.1 Gemini AI API (`GEMINI_API_KEY`, `GEMINI_TEXT_MODEL`, `GEMINI_AUDIO_MODEL`)
- **CLI Verification Script (`node scripts/check_gemini_models.mjs`)**:
  - **Result:** **FAIL** (exit code `1`)
  - **Output:** `[check_gemini_models] GEMINI_API_KEY is not set in the environment.`
  - **Cause:** AI Studio runtime injects secrets into the managed server process (`port 3000`), not into interactive shell sub-processes. Also no `.env` file exists on disk (only `.env.example` with placeholder defaults).
- **Live Express AI Endpoints (`http://127.0.0.1:3000/api/ai/*`)**:
  Every text generation endpoint was probed with valid JSON payloads. All 6 text routes reached Google's Generative Language API (confirming the key is injected in the server process) and failed with upstream **HTTP 404** wrapped as Express **HTTP 500**:

| Endpoint | HTTP Status | Latency (ms) | Upstream Error / Response | Verdict |
| :--- | :---: | :---: | :--- | :---: |
| `POST /api/ai/diagnose` | 500 | 408 | `404 NOT_FOUND: models/hydrogen is not found for API version v1, or is not supported for generateContent.` | **FAIL** |
| `POST /api/ai/generate-message` | 500 | 283 | `404 NOT_FOUND: models/hydrogen is not found for API version v1...` | **FAIL** |
| `POST /api/ai/response-assistant` | 500 | 612 | `404 NOT_FOUND: models/hydrogen is not found for API version v1...` | **FAIL** |
| `POST /api/ai/repair-chat` | 500 | 296 | `404 NOT_FOUND: models/hydrogen is not found for API version v1...` | **FAIL** |
| `POST /api/ai/recommend-reorders` | 500 | 215 | `404 NOT_FOUND: models/hydrogen is not found for API version v1...` | **FAIL** |
| `POST /api/ai/recommend-parts` | 500 | 238 | `404 NOT_FOUND: models/hydrogen is not found for API version v1...` | **FAIL** |
| `POST /api/ai/transcribe` (empty body check) | 400 | 5 | `{"error":"Audio recording payload (audioBase64) is required."}` | **PASS (Validation)** |
| `POST /api/ai/scan-serial` (empty body check) | 400 | 7 | `{"error":"Camera image payload (imageBase64) is required."}` | **PASS (Validation)** |

- **Root Cause & Remediation:**
  1. `server.ts` defaults `GEMINI_TEXT_MODEL` to `'gemini-4-hydrogen'` (and `GEMINI_AUDIO_MODEL` to `'gemini-3.5-transcribe'`), and `VALIDATE_GEMINI_MODELS_ON_START` is `"false"` in `.env.example`.
  2. Google's `v1` endpoint rejects `'gemini-4-hydrogen'` / `'models/hydrogen'` with `404 NOT_FOUND` on the configured key.
  3. **Action Required:** Run `node scripts/check_gemini_models.mjs` in an environment where `GEMINI_API_KEY` is exported to list valid model IDs for the key, then set `GEMINI_TEXT_MODEL` (and `GEMINI_AUDIO_MODEL`) in AI Studio Secrets or `.env` to supported model IDs.

---

### 2.2 Firebase Web API Key, Cloud Firestore & Firebase Admin SDK
- **Config File Checked:** `/firebase-applet-config.json`
  - `projectId`: `ai-studio-applet-webapp-65129`
  - `firestoreDatabaseId`: `ai-studio-autotrackservice-2eac3d40-310f-46ba-a293-99682d0a94d7`
  - `apiKey`: Masked `AIzaSy...Wu0E` (length 39)
- **Live Upstream HTTPS Probes:**
  1. **Firebase Identity Toolkit (`createAuthUri`):**
     - **HTTP Status:** **200 OK** (`274ms`)
     - **Result:** Returned `kind: "identitytoolkit#CreateAuthUriResponse"`. Confirms the Firebase Web API Key is valid and active.
  2. **Cloud Firestore REST (`documents/test/connection`):**
     - **HTTP Status:** **403 PERMISSION_DENIED** (`350ms`)
     - **Result:** Reached the named Firestore database over HTTPS and enforced security rules against unauthenticated requests.
  3. **Local Services Probe (`node scripts/check_local_services.mjs --json`):**
     - **Status:** `CONFIGURED & REACHABLE` (`Firebase / Cloud Firestore`).
- **Backend Firebase Admin SDK (`src/lib/firebase-admin.ts`):**
  1. `GET /api/customer-portal/lookup?query=BOSCH-2026-0041` -> **503 Service Unavailable** (`704ms`)
     - **Response:** `{"error":"Customer portal remote lookup unavailable.","details":"7 PERMISSION_DENIED: Missing or insufficient permissions."}`
     - **Cause:** `GOOGLE_APPLICATION_CREDENTIALS` is unset, and the workstation's default ADC service account does not have Firestore Admin / Datastore User IAM permissions on `ai-studio-applet-webapp-65129`.
     - **Client Workaround Status:** The client SPA falls back cleanly to local `jobCards` lookup via `src/utils/customerLookup.ts` (`Gate D` tests pass).
  2. **Protected Admin Routes (Auth Middleware Gate Check):**
     - `GET /api/jobs` -> **401 Unauthorized** (`3ms`)
     - `GET /api/inventory` -> **401 Unauthorized** (`4ms`)
     - `GET /api/schedules` -> **401 Unauthorized** (`3ms`)
     - `POST /api/customer-portal/feedback` (empty payload) -> **400 Bad Request** (`6ms`)

---

### 2.3 Messaging & Email Integrations (`/api/messaging/*`)
- **`GET /api/messaging/status` (HTTP 200 OK, 4ms):**
  - `twilioSmsConfigured`: `true` (`twilioPhoneNumber`: `+918197845321`)
  - `twilioWhatsAppConfigured`: `true` (`twilioWhatsAppNumber`: `+918197845321`)
  - `metaWhatsAppConfigured`: `true` (`whatsappCloudConfigured`: `true`)
  - `emailConfigured`: `true` (`sendgridConfigured`: `true`, `resendConfigured`: `true`, `smtpConfigured`: `true`, `mailFrom`: `itahmid2018@gmail.com`)
  - `activeMode`: `"REST API Direct Dispatch Enabled"`
- **Validation Gate Probes (Non-Destructive):**
  - `POST /api/messaging/send-sms` (`{}`) -> **400 Bad Request** (`7ms`)
  - `POST /api/messaging/send-whatsapp` (`{}`) -> **400 Bad Request** (`4ms`)
  - `POST /api/messaging/send-email` (`{}`) -> **400 Bad Request** (`5ms`)
- **Verification Limitation:**
  - Because `TWILIO_*`, `WHATSAPP_CLOUD_API_TOKEN`, `SENDGRID_API_KEY`, `RESEND_API_KEY`, and `SMTP_*` are injected only into the server process (absent in shell `process.env`), read-only credential balance/identity checks against Twilio/Meta/SendGrid/Resend could not be executed from the CLI without reading server memory or sending live outbound messages to real recipients.
  - Note: Ensure placeholder values from `.env.example` are not copied into production `.env` variables; inspect any test dispatch directly via a controlled sandbox recipient.

---

### 2.4 Local Database & Runtime Infrastructure (`scripts/check_local_services.mjs`)
- **HTTP Root (`GET http://127.0.0.1:3000/`):** **200 OK** (`100ms`), serves Vite HTML entry point cleanly.
- **PostgreSQL (5432):** Not detected (`psql` CLI absent).
- **MySQL / MariaDB (3306):** Not detected (`mysql`/`mariadb` CLI absent).
- **SQLite3 / Redis (6379) / MongoDB (27017) / Docker:** Not detected.
