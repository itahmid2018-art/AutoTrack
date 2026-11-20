# AI Model Configuration & Messaging Sandbox Testing Guide

**Applies To:** AutoTrack Pro — Bosch & Vendor Power Tools Service Hub  
**Last Verified:** 2026-11-20 (`server.ts`, Node `v22.23.2`, Port `3000`)

This step-by-step guide explains how to:
1. Replace shorthand or unavailable Gemini model aliases in AI Studio Secrets with explicit supported model IDs so AI requests succeed on the first attempt with zero fallback delay.
2. Execute non-destructive, internal sandbox tests against Twilio SMS, Twilio/Meta WhatsApp, and Email (`/api/messaging/*`) before dispatching messages to real Clients.

---

## Part 1: Set Explicit `GEMINI_TEXT_MODEL` & `GEMINI_AUDIO_MODEL` IDs

### Why Explicit Model IDs Matter
In `server.ts`, Gemini requests call `generateContentWithModelFallback()`. If `GEMINI_TEXT_MODEL` is set to a shorthand like `"hydrogen"`, or points to a temporarily unavailable/overloaded model:
- `server.ts` normalizes `"hydrogen"` -> `"gemini-4-hydrogen"` and `"transcribe"` -> `"gemini-3.5-transcribe"`.
- If the primary model returns `404 NOT_FOUND`, `503 UNAVAILABLE`, `429 RESOURCE_EXHAUSTED`, or exceeds the timeout (`15,000ms` for text, `25,000ms` for audio), the server automatically falls back across supported `generateContent` candidates (such as `gemini-3.1-flash-lite` or `gemini-2.5-flash`).
- Setting explicit, key-supported model IDs eliminates that extra fallback hop and cuts tail latency from ~16s down to normal inference time.

---

### Step 1: Discover Supported Model IDs for Your Key
With the AutoTrack Pro server running on port `3000`, query the read-only AI diagnostic endpoint (never exposes API keys):

```bash
curl -s http://127.0.0.1:3000/api/ai/status | node -e "
  const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  console.log({
    keyConfigured: d.keyConfigured,
    configuredTextModel: d.configuredTextModel,
    normalizedTextModel: d.normalizedTextModel,
    resolvedTextModel: d.resolvedTextModel,
    configuredAudioModel: d.configuredAudioModel,
    normalizedAudioModel: d.normalizedAudioModel,
    resolvedAudioModel: d.resolvedAudioModel,
    availableModelCount: d.availableModelCount,
    availableModels: d.availableModels
  });
"
```

*(Optional CLI check when `GEMINI_API_KEY` is exported in your local shell or `.env`)*:
```bash
node scripts/check_gemini_models.mjs
```

Look for two things in the output:
- Confirm `keyConfigured: true` and `availableModelCount > 0`.
- Pick an explicit text model present in `availableModels` (for example `gemini-3.1-flash-lite` or `gemini-2.5-flash`) and an explicit audio-capable model (for example `gemini-3.5-transcribe` if listed, or `gemini-2.5-flash`).
- Do **not** use deprecated families (`gemini-1.*`, `gemini-2.0*`, `gemini-pro`); `isProhibitedDeprecatedModel()` in `server.ts` blocks them automatically.

---

### Step 2: Update Secrets in AI Studio (or `.env`)
1. Open the **Secrets** panel in Google AI Studio (or edit `.env` for standalone Node hosting).
2. Set explicit values using full model IDs verified in Step 1 (no `models/` prefix required):
   - `GEMINI_TEXT_MODEL` = e.g. `gemini-3.1-flash-lite` *(or `gemini-2.5-flash` / `gemini-4-hydrogen` if directly supported without 503s)*
   - `GEMINI_AUDIO_MODEL` = e.g. `gemini-3.5-transcribe` *(or `gemini-2.5-flash` if `gemini-3.5-transcribe` is absent in `availableModels`)*
3. *(Optional strict startup check)* Set `VALIDATE_GEMINI_MODELS_ON_START` = `"true"` when testing locally so `validateConfiguredGeminiModels()` verifies both model IDs at boot via `ai.models.get()`.
4. **Restart the server** (`restart_dev_server` in AI Studio, or restart `npm run dev` / `npm start`) so the Express process loads the updated secrets.

---

### Step 3: Verify Zero-Fallback Model Resolution
1. Re-run the status check:
   ```bash
   curl -s http://127.0.0.1:3000/api/ai/status
   ```
2. Run a live text diagnostic test against `/api/ai/diagnose`:
   ```bash
   curl -s -w "\nHTTP %{http_code} | Time %{time_total}s\n" \
     -X POST http://127.0.0.1:3000/api/ai/diagnose \
     -H "Content-Type: application/json" \
     -d '{
       "toolBrand": "Bosch",
       "toolModel": "GBH 2-26 DFR",
       "issueDescription": "Excessive commutator sparking and smoke under load"
     }'
   ```
3. Re-check `GET /api/ai/status` and confirm:
   - `configuredTextModel === normalizedTextModel === resolvedTextModel` (confirming no fallback occurred).
   - No `[gemini] text model ... fell back to ...` warnings appear in server logs.
4. Open any ticket in `JobCardDetail` and record a short 3–5 second voice note using **Dictate** to verify `POST /api/ai/transcribe` succeeds directly on `GEMINI_AUDIO_MODEL`.

---

## Part 2: Run Sandbox Tests on Twilio & Email Routes

> **Safety Rule:** Always route sandbox tests exclusively to **internal engineering test numbers** and **internal test email inboxes**—never to live Client records.

### Step 1: Check Provider Credential Detection
Query the server's non-destructive status endpoint:

```bash
curl -s http://127.0.0.1:3000/api/messaging/status
```

Verify the JSON response flags before running sends:
- **SMS:** `twilioSmsConfigured: true` (requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`).
- **WhatsApp:** `twilioWhatsAppConfigured: true` (requires `TWILIO_WHATSAPP_NUMBER`) or `metaWhatsAppConfigured: true` (`WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`).
- **Email:** `sendgridConfigured: true` (`SENDGRID_API_KEY` + `MAIL_FROM`) or `resendConfigured: true` (`RESEND_API_KEY` + `MAIL_FROM`).
  - **Important `server.ts` Email Behavior:** `/api/messaging/send-email` dispatches live HTTPS requests **only** via `SendGrid API` or `Resend API`. If neither `SENDGRID_API_KEY` nor `RESEND_API_KEY` is present, setting only `SMTP_HOST`/`SMTP_USER` returns `provider: "SMTP Relay (Simulated)"` with `apiConfigured: false` instead of delivering a real external email.

---

### Step 2: Test Twilio SMS (`/api/messaging/send-sms`)
1. Prepare an E.164 internal test mobile number (if using a **Twilio Trial** account, verify that recipient phone number inside Twilio Console first, or use Twilio's `+15005550006` test flow with test credentials).
2. Execute a controlled SMS request:
   ```bash
   curl -s -X POST http://127.0.0.1:3000/api/messaging/send-sms \
     -H "Content-Type: application/json" \
     -d '{
       "to": "+1XXXXXXXXXX",
       "message": "[SANDBOX TEST] AutoTrack Pro SMS connectivity verification.",
       "jobId": "SANDBOX-SMS-001"
     }'
   ```
3. **Pass Criteria:**
   - HTTP `200 OK`
   - JSON body contains `"success": true`, `"apiConfigured": true`, `"provider": "Twilio REST API"`, and a non-empty `"sid"` (`SM...`).
   - Test handset receives the SMS text within 30 seconds.
4. **Common Errors to Fix:**
   - Twilio `21608`: Trial account cannot text unverified recipient numbers -> verify the test number in Twilio Console.
   - Twilio `20003`: Invalid `TWILIO_ACCOUNT_SID` or `TWILIO_AUTH_TOKEN` -> rotate token in AI Studio Secrets.
   - `"apiConfigured": false`: One or more `TWILIO_*` variables are missing -> add them and restart server.

---

### Step 3: Test WhatsApp (`/api/messaging/send-whatsapp`)
1. **If using Twilio WhatsApp Sandbox:** On your test smartphone, send the sandbox join code (e.g., `join <two-words>`) to your `TWILIO_WHATSAPP_NUMBER` (`+14155238886` or configured sender) inside WhatsApp before calling the API.
2. **If using Meta WhatsApp Cloud API:** Ensure the test number is added to your Meta App's allowed test recipient list and within the 24-hour session window (or use an approved template).
3. Send the sandbox test request:
   ```bash
   curl -s -X POST http://127.0.0.1:3000/api/messaging/send-whatsapp \
     -H "Content-Type: application/json" \
     -d '{
       "to": "+1XXXXXXXXXX",
       "message": "[SANDBOX TEST] AutoTrack Pro WhatsApp dispatch verification.",
       "jobId": "SANDBOX-WA-001"
     }'
   ```
4. **Pass Criteria:**
   - HTTP `200 OK`
   - JSON contains `"success": true`, `"apiConfigured": true`, `"provider": "Twilio WhatsApp API"` (with `"sid"`) or `"Meta WhatsApp Cloud API"` (with `"messageId"`).
   - Test WhatsApp client receives the message.

---

### Step 4: Test Email Dispatch (`/api/messaging/send-email`)
1. Ensure `MAIL_FROM` matches a verified Single Sender or authenticated domain in SendGrid or Resend.
2. Send a test email to an internal QA inbox:
   ```bash
   curl -s -X POST http://127.0.0.1:3000/api/messaging/send-email \
     -H "Content-Type: application/json" \
     -d '{
       "to": "qa-team@example.com",
       "subject": "[SANDBOX TEST] AutoTrack Pro Email Relay Check",
       "message": "This confirms live SendGrid/Resend email delivery from AutoTrack Pro.",
       "jobId": "SANDBOX-EMAIL-001"
     }'
   ```
3. **Pass Criteria:**
   - HTTP `200 OK`
   - JSON contains `"success": true` and `"provider": "SendGrid API"` or `"Resend API"`.
   - Confirm the provider is **not** `"SMTP Relay (Simulated)"` or `"Local Mail Relay Simulation"` (`apiConfigured: false`).
   - Confirm the email arrives in your QA inbox (check Spam/Promotions during initial sender domain setup).

---

### Step 5: Verify `MessageLog` Honesty in the UI
1. Send one sandbox SMS/WhatsApp/Email from `MessagingCenter` or `JobCardDetail` targeting your internal test ticket.
2. Open the ticket's **Communication Log** (`MessageLog`):
   - Confirm `'Sent'` is recorded **only** when the backend returned HTTP `200` with `{ "success": true }`.
   - Confirm browser deep-links (`wa.me/`, `sms:`) or failed API responses record `'Pending'`, matching `src/utils/messagingStatus.ts` (`Gate C`).

---

## Quick Verification Checklist

| Step | Command / Action | Expected Passing Output |
| :--- | :--- | :--- |
| 1 | `GET /api/ai/status` | `configuredTextModel === resolvedTextModel` & `configuredAudioModel === resolvedAudioModel` |
| 2 | `POST /api/ai/diagnose` | HTTP `200`, valid JSON diagnosis, no fallback warning in server logs |
| 3 | `GET /api/messaging/status` | `twilioSmsConfigured` / `emailConfigured` match intended providers (`activeMode: "REST API Direct Dispatch Enabled"`) |
| 4 | `POST /api/messaging/send-sms` | HTTP `200`, `success: true`, `provider: "Twilio REST API"`, SMS received on test handset |
| 5 | `POST /api/messaging/send-whatsapp` | HTTP `200`, `success: true`, message received in WhatsApp |
| 6 | `POST /api/messaging/send-email` | HTTP `200`, `success: true`, `provider: "SendGrid API"` or `"Resend API"`, email in QA inbox |
