/**
 * Phase E gate harness — active inventory/status lifecycle.
 * Run with tsx:
 *   node node_modules/tsx/dist/cli.mjs scripts/verify_stock_ledger.ts
 */
import { JobCard } from '../src/types';
import { INITIAL_JOB_CARDS } from '../src/data/initialJobCards';
import {
  applyStockLifecycleTransition,
  shouldDeductStockOnStatus,
} from '../src/utils/stockDeduction';

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) {
    failures += 1;
    if (detail !== undefined) console.log(`      got: ${JSON.stringify(detail)}`);
  }
}

const BASE_QTY = 10;
const stock: Record<string, number> = {};
const seed = INITIAL_JOB_CARDS[0];
const partIds = seed.parts.map((p) => p.partId);
partIds.forEach((id) => (stock[id] = BASE_QTY));

function applyDeltas(deltas: { partId: string; deltaQty: number }[]) {
  for (const delta of deltas) {
    stock[delta.partId] = Math.max(0, (stock[delta.partId] ?? 0) + delta.deltaQty);
  }
}
function resetStock() {
  partIds.forEach((id) => (stock[id] = BASE_QTY));
}
function stockOf(partId: string) {
  return stock[partId] ?? 0;
}
function transition(
  job: JobCard,
  status: JobCard['status'],
  policy: 'Approval' | 'InService' | 'Completion',
  nowIso: string
): JobCard {
  const result = applyStockLifecycleTransition(job, status, policy, { nowIso });
  applyDeltas(result.inventoryDeltas);
  return result.updatedJob;
}
function card(overrides: Partial<JobCard> = {}): JobCard {
  return {
    ...seed,
    status: 'Diagnosis',
    stockDeductedAt: undefined,
    partsDeducted: undefined,
    auditLogs: [],
    ...overrides,
  };
}

const T1 = '2026-11-02T10:00:00.000Z';
const T2 = '2026-11-02T11:00:00.000Z';
const T3 = '2026-11-02T12:00:00.000Z';

// --- 1. Policy trigger mapping ----------------------------------------------
check("'Approval' maps to Awaiting Approval", shouldDeductStockOnStatus('Approval', 'Awaiting Approval'));
check("'InService' maps to In Service", shouldDeductStockOnStatus('InService', 'In Service'));
check("'InService' also maps to In Repair", shouldDeductStockOnStatus('InService', 'In Repair'));
check("'Completion' maps to Completed", shouldDeductStockOnStatus('Completion', 'Completed'));
check('non-trigger status does not deduct', !shouldDeductStockOnStatus('InService', 'Diagnosis'));

// --- 2. Deduction on the trigger status -------------------------------------
resetStock();
let job = transition(card(), 'In Service', 'InService', T1);
check('trigger status deducts every part once', partIds.every((id) => stockOf(id) === BASE_QTY - 1), stock);
check('deduction marker is stamped', job.stockDeductedAt === T1);
check('deduction snapshot records every part', job.partsDeducted?.length === seed.parts.length);
check(
  'audit entry is INVENTORY_STOCK_DEDUCTED',
  job.auditLogs?.[job.auditLogs.length - 1]?.action === 'INVENTORY_STOCK_DEDUCTED'
);

// --- 3. Idempotency: re-entering the same status must not deduct again ------
const afterFirst = { ...job };
job = transition({ ...job, status: 'Ready for Pickup' }, 'In Service', 'InService', T2);
job = transition(job, 'In Service', 'InService', T2);
check('re-entering the trigger status is idempotent', partIds.every((id) => stockOf(id) === BASE_QTY - 1), stock);
check('re-entering keeps the original marker', job.stockDeductedAt === afterFirst.stockDeductedAt);
check(
  're-entering adds no duplicate audit entry',
  (job.auditLogs?.length ?? 0) === (afterFirst.auditLogs?.length ?? 0)
);

// --- 4. Non-trigger transitions freeze stock --------------------------------
resetStock();
job = transition(card(), 'In Service', 'InService', T1);
const beforeNonTrigger = { ...stock };
job = transition(job, 'Ready for Pickup', 'InService', T2);
check('non-trigger status touches no stock', JSON.stringify(stock) === JSON.stringify(beforeNonTrigger), stock);

// --- 5. Delta deduction for added / increased parts -------------------------
const itemId = partIds[0];
const increasedParts = job.parts.map((p) =>
  p.partId === itemId ? { ...p, quantity: p.quantity + 2, total: (p.quantity + 2) * p.unitPrice } : p
);
const beforeIncrease = stockOf(itemId);
job = transition({ ...job, parts: increasedParts }, 'In Service', 'InService', T3);
check('increased part deducts only the delta', stockOf(itemId) === beforeIncrease - 2, stock[itemId]);
check(
  'snapshot records the new quantity',
  job.partsDeducted?.find((d) => d.partId === itemId)?.qty === 3
);

// --- 6. Decreasing a part does NOT silently restore stock ------------------
const beforeDecrease = stockOf(itemId);
const decreasedParts = job.parts.map((p) =>
  p.partId === itemId ? { ...p, quantity: 1, total: p.unitPrice } : p
);
job = transition({ ...job, parts: decreasedParts }, 'In Service', 'InService', T3);
check('decreasing a part leaves stock untouched', stockOf(itemId) === beforeDecrease, stock[itemId]);

// --- 7. Cancellation restores the full deducted quantity -------------------
job = transition(job, 'Cancelled', 'InService', T3);
check('cancellation restores every deducted unit', partIds.every((id) => stockOf(id) === BASE_QTY), stock);
check('cancellation clears the deduction marker', job.stockDeductedAt === undefined);
check('cancellation clears the deduction snapshot', job.partsDeducted === undefined);
check(
  'audit entry is INVENTORY_STOCK_RESTORED',
  job.auditLogs?.[job.auditLogs.length - 1]?.action === 'INVENTORY_STOCK_RESTORED'
);

// --- 8. Re-opening after cancellation deducts again ------------------------
job = transition(job, 'In Service', 'InService', T3);
check('re-opening after cancel deducts again', partIds.every((id) => stockOf(id) === BASE_QTY - 1), stock);
check('re-opening restamps the marker', job.stockDeductedAt === T3);

// --- 9. Cancellation without a prior deduction is a no-op ------------------
resetStock();
const untouched = transition(card({ status: 'Cancelled' }), 'Cancelled', 'InService', T1);
check('cancel with no deduction restores nothing', partIds.every((id) => stockOf(id) === BASE_QTY), stock);
check('cancel with no deduction writes no audit entry', (untouched.auditLogs?.length ?? 0) === 0);

// --- 10. Completion policy deducts on Completed ----------------------------
resetStock();
const completed = transition(card(), 'Completed', 'Completion', T1);
check('Completion policy deducts on Completed', partIds.every((id) => stockOf(id) === BASE_QTY - 1), stock);
check('Completion policy stamps the marker', Boolean(completed.stockDeductedAt));

console.log(failures === 0 ? '\nPhase E ledger logic: PASS' : `\nPhase E ledger logic: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
