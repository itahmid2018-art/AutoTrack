/**
 * Temporary Gate D verification harness. Run with tsx, not shipped in prod.
 *   node_modules/tsx/dist/cli.mjs scripts/verify_portal_gate.ts
 */
import { INITIAL_JOB_CARDS } from '../src/data/initialJobCards';
import {
  lookupCustomerJob,
  sanitizeJobForCustomer,
} from '../src/utils/customerLookup';
import { ensurePublicAccessToken } from '../src/utils/customerPortalUrl';

let failures = 0;
function check(label: string, condition: boolean) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) failures += 1;
}

const seed = INITIAL_JOB_CARDS[0];
// Simulate normalizeJobCard minting a fresh token for a record that has none.
const token = ensurePublicAccessToken({
  id: seed.id,
  createdAt: seed.createdAt,
  publicAccessToken: undefined,
});
const job = { ...seed, publicAccessToken: token };
const jobCards = INITIAL_JOB_CARDS.map((card, index) =>
  index === 0 ? job : card
);
const last4 = (job.customerPhone || '').replace(/\D/g, '').slice(-4);
const wrong4 = last4 === '0000' ? '1111' : '0000';

// 1. Bare job ID must not expose data.
const bareId = lookupCustomerJob(jobCards, job.id);
check('bare job ID -> verification-required', bareId.status === 'verification-required');
check('bare job ID carries no summary', !('summary' in bareId));

// 2. Wrong last-4 must fail.
const wrong = lookupCustomerJob(jobCards, job.id, wrong4);
check('wrong phone last-4 -> verification-failed', wrong.status === 'verification-failed');
check('wrong phone last-4 carries no summary', !('summary' in wrong));

// 3. Job ID + matching last-4 must succeed.
const good = lookupCustomerJob(jobCards, job.id, last4);
check('job ID + correct last-4 -> found', good.status === 'found');
check(
  'found summary is verified and carries the PDF record',
  good.status === 'found' && good.summary.verifiedByTokenOrPhone && Boolean(good.summary._pdfRecord)
);

// 4. Valid token must succeed without phone digits.
const byToken = lookupCustomerJob(jobCards, token);
check('valid token -> found', byToken.status === 'found');
check('token lookup is verified', byToken.status === 'found' && byToken.summary.verifiedByTokenOrPhone);

// 5. Unknown query must be not-found.
check('unknown query -> not-found', lookupCustomerJob(jobCards, 'NOPE-0000').status === 'not-found');

// 6. Token has the current tok-<jobSlug>-<randomHex> shape and an unguessable suffix.
const slug = job.id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
check('token uses the current tok-<jobSlug>-<randomHex> shape', new RegExp(`^tok-${slug}-[0-9a-f]{12}$`, 'i').test(token));
check('token suffix is not a UUID', !/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(token));

// 7. Absent tokens must be unique per call.
const a = ensurePublicAccessToken({ id: 'J1', createdAt: 'x', publicAccessToken: undefined });
const b = ensurePublicAccessToken({ id: 'J1', createdAt: 'x', publicAccessToken: undefined });
check('absent token generates distinct random values', a !== b);

// 8. Unverified sanitization must strip the full record and company data.
const unverified = sanitizeJobForCustomer(job, false);
check('unverified sanitize has no _pdfRecord', unverified._pdfRecord === undefined);
check('unverified sanitize masks the serial', unverified.toolSerialMasked.includes('•') || (job.tool.serialNumber || '').length <= 5);
check('unverified sanitize omits company', unverified.customerCompany === undefined);

console.log(failures === 0 ? '\nGate D logic: PASS' : `\nGate D logic: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
