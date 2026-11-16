import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateJobBilling, getEffectiveJobBilling } from '../src/utils/billing';
import { JobCard } from '../src/types';

function makeBaseJob(overrides: Partial<JobCard> = {}): JobCard {
  const now = '2026-06-01T10:00:00.000Z';
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
      warrantyStatus: 'Bosch Heavy Duty 3-Year Extended',
      physicalCondition: 'Good',
      accessoriesReceived: [],
    },
    serviceReq: {
      grievanceCategory: 'Routine Maintenance / Carbon Brush Check',
      detailedComplaint: 'Routine brush and chuck inspection',
      serviceType: 'Standard Overhaul',
      preApprovedLimit: 250,
    },
    intakeDate: '2026-06-01',
    promisedCompletion: '2026-06-03',
    status: 'Intake',
    priority: 'Routine',
    technician: 'Marco Rossi',
    laborHours: 2,
    laborRate: 85,
    discount: 10,
    taxRate: 10,
    parts: [
      {
        partId: 'p-1',
        sku: 'BRSH-1002',
        name: 'Carbon Brush Set',
        unitPrice: 25,
        quantity: 2,
        total: 50,
      },
    ],
    operationalExpenses: [],
    totalAmount: 231,
    messageLogs: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('billing utilities', () => {
  it('calculates parts, labor, operational expenses, discount, tax, and rounding accurately', () => {
    const breakdown = calculateJobBilling(
      [
        { partId: 'p-1', sku: 'BRSH-1002', name: 'Brushes', unitPrice: 12.345, quantity: 2, total: 24.69 },
      ],
      1.5,
      80,
      [
        { id: 'exp-1', category: 'Shipping & Freight', description: 'Express courier', amount: 15.31, date: '2026-06-01' },
      ],
      10,
      18
    );

    assert.equal(breakdown.partsSubtotal, 24.69);
    assert.equal(breakdown.laborSubtotal, 120);
    assert.equal(breakdown.operationalExpensesSubtotal, 15.31);
    assert.equal(breakdown.subtotalBeforeTax, 150);
    assert.equal(breakdown.taxAmount, 27);
    assert.equal(breakdown.totalAmount, 177);
  });

  it('clamps negative total to 0 when discount exceeds subtotals', () => {
    const breakdown = calculateJobBilling([], 0, 85, [], 50, 10);
    assert.equal(breakdown.taxAmount, 0);
    assert.equal(breakdown.totalAmount, 0);
  });

  it('respects non-zero stored totalAmount when operationalExpenses is empty', () => {
    const job = makeBaseJob({
      operationalExpenses: [],
      totalAmount: 299.5,
    });
    const effective = getEffectiveJobBilling(job);
    assert.equal(effective.totalAmount, 299.5);
  });

  it('adds operational expenses and tax when stored totalAmount only reflects base amount', () => {
    // Base: parts 50 + labor 170 - discount 10 = 210 + 10% tax = 231
    // With $40 operational expense: subtotal 250 + 10% tax = 275
    const job = makeBaseJob({
      operationalExpenses: [
        { id: 'exp-1', category: 'Outsourced Labor', description: 'Armature rewind', amount: 40, date: '2026-06-01' },
      ],
      totalAmount: 231,
    });
    const effective = getEffectiveJobBilling(job);
    assert.equal(effective.operationalExpensesSubtotal, 40);
    assert.equal(effective.subtotalBeforeTax, 250);
    assert.equal(effective.taxAmount, 25);
    assert.equal(effective.totalAmount, 275);
  });

  it('computes full breakdown cleanly when totalAmount is 0', () => {
    const job = makeBaseJob({
      operationalExpenses: [
        { id: 'exp-1', category: 'Diagnostics / Calibration Fee', description: 'Bench test', amount: 20, date: '2026-06-01' },
      ],
      totalAmount: 0,
    });
    const effective = getEffectiveJobBilling(job);
    assert.equal(effective.subtotalBeforeTax, 230);
    assert.equal(effective.taxAmount, 23);
    assert.equal(effective.totalAmount, 253);
  });
});
