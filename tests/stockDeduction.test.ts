import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStockLifecycleTransition,
  shouldDeductStockOnStatus,
} from '../src/utils/stockDeduction';
import { JobCard } from '../src/types';

function makeJobWithParts(): JobCard {
  const now = '2026-06-01T09:00:00.000Z';
  return {
    id: 'BOSCH-2026-0041',
    customerName: 'Apex Industrial',
    customerPhone: '+15551234567',
    tool: {
      brand: 'Bosch Professional',
      category: 'Rotary Hammer / SDS',
      modelNumber: 'GBH 2-26 DFR',
      serialNumber: '3611B54300',
      voltageRating: '230V',
      warrantyStatus: 'Standard 1-Year',
      physicalCondition: 'Used',
      accessoriesReceived: [],
    },
    serviceReq: {
      grievanceCategory: 'Motor Sparking / Excessive Smoke',
      detailedComplaint: 'Sparking at commutator',
      serviceType: 'Carbon Brush & Maintenance',
      preApprovedLimit: 200,
    },
    intakeDate: '2026-06-01',
    promisedCompletion: '2026-06-03',
    status: 'Diagnosis',
    priority: 'Low',
    technician: 'Marco Rossi',
    laborHours: 1,
    laborRate: 85,
    discount: 0,
    taxRate: 10,
    parts: [
      { partId: 'inv-1', sku: 'BRSH-1002', name: 'Carbon Brush Set', unitPrice: 20, quantity: 2, total: 40 },
      { partId: 'inv-2', sku: 'RING-2010', name: 'O-Ring Kit', unitPrice: 15, quantity: 1, total: 15 },
    ],
    totalAmount: 154,
    messageLogs: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe('stockDeduction lifecycle', () => {
  it('maps policy triggers accurately across In Service and In Repair', () => {
    assert.equal(shouldDeductStockOnStatus('Approval', 'Awaiting Approval'), true);
    assert.equal(shouldDeductStockOnStatus('InService', 'In Service'), true);
    assert.equal(shouldDeductStockOnStatus('InService', 'In Repair'), true);
    assert.equal(shouldDeductStockOnStatus('Completion', 'Completed'), true);
    assert.equal(shouldDeductStockOnStatus('InService', 'Intake'), false);
  });

  it('deducts parts once when entering trigger status and avoids double deduction on repeat transition', () => {
    const job = makeJobWithParts();
    const first = applyStockLifecycleTransition(job, 'In Service', 'InService', {
      actorName: 'Marco Rossi',
      nowIso: '2026-06-01T10:00:00.000Z',
    });

    assert.equal(first.deductedNow, true);
    assert.equal(first.restoredFromCancellation, false);
    assert.deepEqual(first.inventoryDeltas, [
      { partId: 'inv-1', deltaQty: -2 },
      { partId: 'inv-2', deltaQty: -1 },
    ]);
    assert.equal(first.updatedJob.stockDeductedAt, '2026-06-01T10:00:00.000Z');
    assert.deepEqual(first.updatedJob.partsDeducted, [
      { partId: 'inv-1', qty: 2 },
      { partId: 'inv-2', qty: 1 },
    ]);

    const second = applyStockLifecycleTransition(first.updatedJob, 'In Repair', 'InService', {
      actorName: 'Marco Rossi',
      nowIso: '2026-06-01T11:00:00.000Z',
    });
    assert.equal(second.deductedNow, false);
    assert.deepEqual(second.inventoryDeltas, []);
  });

  it('deducts only the net delta when additional parts are added after initial deduction', () => {
    const job = makeJobWithParts();
    const first = applyStockLifecycleTransition(job, 'In Repair', 'InService', {
      nowIso: '2026-06-01T10:00:00.000Z',
    });

    const jobWithExtraPart: JobCard = {
      ...first.updatedJob,
      parts: [
        ...first.updatedJob.parts,
        { partId: 'inv-1', sku: 'BRSH-1002', name: 'Carbon Brush Set', unitPrice: 20, quantity: 1, total: 20 },
      ],
    };

    const second = applyStockLifecycleTransition(jobWithExtraPart, 'In Service', 'InService', {
      nowIso: '2026-06-01T12:00:00.000Z',
    });
    assert.equal(second.deductedNow, true);
    assert.deepEqual(second.inventoryDeltas, [{ partId: 'inv-1', deltaQty: -1 }]);
    assert.deepEqual(second.updatedJob.partsDeducted, [
      { partId: 'inv-1', qty: 3 },
      { partId: 'inv-2', qty: 1 },
    ]);
  });

  it('restores stock on Cancelled transition and avoids double restoration if cancelled again', () => {
    const job = makeJobWithParts();
    const deducted = applyStockLifecycleTransition(job, 'In Service', 'InService', {
      nowIso: '2026-06-01T10:00:00.000Z',
    }).updatedJob;

    const cancelled = applyStockLifecycleTransition(deducted, 'Cancelled', 'InService', {
      actorName: 'Workshop Manager',
      nowIso: '2026-06-01T13:00:00.000Z',
    });

    assert.equal(cancelled.restoredFromCancellation, true);
    assert.equal(cancelled.deductedNow, false);
    assert.deepEqual(cancelled.inventoryDeltas, [
      { partId: 'inv-1', deltaQty: 2 },
      { partId: 'inv-2', deltaQty: 1 },
    ]);
    assert.equal(cancelled.updatedJob.stockDeductedAt, undefined);
    assert.equal(cancelled.updatedJob.partsDeducted, undefined);
    assert.ok(
      cancelled.updatedJob.auditLogs?.some((entry) => entry.action === 'INVENTORY_STOCK_RESTORED')
    );

    const cancelledAgain = applyStockLifecycleTransition(cancelled.updatedJob, 'Cancelled', 'InService');
    assert.equal(cancelledAgain.restoredFromCancellation, false);
    assert.deepEqual(cancelledAgain.inventoryDeltas, []);
  });
});
