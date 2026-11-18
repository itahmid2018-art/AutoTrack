/**
 * Phase F gate harness — honest message status.
 * Run with tsx:
 *   node node_modules/tsx/dist/cli.mjs scripts/verify_message_status.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isApiConfirmed, sentStatusFor } from '../src/utils/messagingStatus';

let failures = 0;
function check(label: string, condition: boolean) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) failures += 1;
}

// --- 1. Status mapping ------------------------------------------------------
check("API-confirmed send -> 'Sent'", sentStatusFor(true) === 'Sent');
check("unconfirmed send -> 'Pending'", sentStatusFor(false) === 'Pending');

// --- 2. API confirmation requires both HTTP + body success -----------------
check('200 + success:true is confirmed', isApiConfirmed(true, { success: true }));
check('200 + success:false is not confirmed', !isApiConfirmed(true, { success: false }));
check('500 + success:true is not confirmed', !isApiConfirmed(false, { success: true }));
check('200 + missing body is not confirmed', !isApiConfirmed(true, undefined));
check('200 + string body is not confirmed', !isApiConfirmed(true, 'OK'));
check('200 + truthy non-boolean success is not confirmed', !isApiConfirmed(true, { success: 1 }));
check('200 + error payload is not confirmed', !isApiConfirmed(true, { error: 'nope' }));

// --- 3. Source guards: no unconditional "Sent" on deep-link paths ----------
function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const messaging = source('src/components/MessagingCenter.tsx');
check('MessagingCenter uses sentStatusFor()', messaging.includes('sentStatusFor(apiConfirmed)'));
check('MessagingCenter no longer has the ? Sent : Sent bug', !/\?\s*'Sent'\s*:\s*'Sent'/.test(messaging));
check('MessagingCenter logs a Pending fallback on network failure', messaging.includes('buildLog(false)'));

const recurring = source('src/components/RecurringMaintenanceView.tsx');
check(
  "Recurring reminders (wa.me only) log 'Pending'",
  /type: 'Recurring Reminder'[\s\S]*?status: 'Pending'/.test(recurring)
);

const app = source('src/App.tsx');
check(
  "PDF deep-link logging records 'Pending'",
  /handleLogMessageFromPdf[\s\S]*?status: 'Pending'/.test(app)
);

const pdf = source('src/components/PdfViewModal.tsx');
check('PDF modal no longer claims delivery', !pdf.includes('PDF Dispatched to Customer'));

const types = source('src/types/index.ts');
check("MessageLog status union stays strictly 'Sent' | 'Pending'", /status:\s*'Sent' \| 'Pending';/.test(types));

const intake = source('src/components/BoschIntakeForm.tsx');
check("Intake message logging is 'Pending'", /status: 'Pending'/.test(intake));

console.log(failures === 0 ? '\nPhase F message status: PASS' : `\nPhase F message status: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
