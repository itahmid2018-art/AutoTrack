import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findMatchingInventoryItem,
  findMatchingToolHistory,
  normalizeScannedSerial,
  parseProductQrPayload,
} from '../src/utils/barcodeSerialParser';
import { InventoryItem, JobCard, RecurringMaintenance } from '../src/types';

const sampleInventory: InventoryItem[] = [
  {
    id: 'inv-1',
    sku: 'BRSH-1002',
    barcode: '4059952534123',
    name: 'Carbon Brush Set',
    category: 'Electrical',
    brand: 'Bosch Professional',
    compatibleModels: 'GBH 2-26 DFR',
    unitPrice: 24,
    costPrice: 12,
    stockQty: 18,
    minStockThreshold: 5,
    unit: 'sets',
    binLocation: 'A-12',
    lastRestocked: '2026-05-01',
  },
];

const sampleJobs: JobCard[] = [
  {
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
      grievanceCategory: 'Motor Sparking / Excessive Smoke',
      detailedComplaint: 'Sparking',
      serviceType: 'Carbon Brush & Maintenance',
      preApprovedLimit: 150,
    },
    intakeDate: '2026-05-10',
    promisedCompletion: '2026-05-12',
    status: 'Completed',
    priority: 'Routine',
    technician: 'Marco Rossi',
    laborHours: 1,
    laborRate: 85,
    discount: 0,
    taxRate: 10,
    parts: [
      { partId: 'inv-1', sku: 'BRSH-1002', name: 'Carbon Brush Set', unitPrice: 24, quantity: 1, total: 24 },
    ],
    totalAmount: 119.9,
    publicAccessToken: 'tok-bosch-2026-0041-abcdef',
    messageLogs: [],
    createdAt: '2026-05-10T09:00:00.000Z',
    updatedAt: '2026-05-12T15:00:00.000Z',
  },
];

const sampleSchedules: RecurringMaintenance[] = [
  {
    id: 'MAINT-2026-001',
    customerName: 'Apex Industrial',
    customerPhone: '+15551234567',
    toolBrand: 'Bosch Professional',
    toolCategory: 'Rotary Hammer / SDS',
    modelNumber: 'GBH 2-26 DFR',
    serialNumber: 'SN-3611B54300',
    intervalMonths: 6,
    lastServiceDate: '2026-05-12',
    nextDueDate: '2026-11-12',
    status: 'Upcoming',
    recommendedServiceScope: 'Routine check',
    queuedReminders: [],
    createdAt: '2026-05-12T15:00:00.000Z',
    updatedAt: '2026-05-12T15:00:00.000Z',
  },
];

describe('barcodeSerialParser helpers', () => {
  it('parses JSON QR payloads and normalizes serial numbers', () => {
    const raw = '{"sku":"brsh-1002","serialNumber":"sn-3611b54300","model":"GBH 2-26 DFR"}';
    const parsed = parseProductQrPayload(raw);
    assert.equal(parsed.sku, 'BRSH-1002');
    assert.equal(parsed.serialNumber, 'SN-3611B54300');
    assert.equal(parsed.modelNumber, 'GBH 2-26 DFR');
    assert.equal(normalizeScannedSerial(raw), 'SN-3611B54300');
  });

  it('parses customer portal URLs, labeled barcodes, EAN-13, and Job Card IDs', () => {
    const portal = parseProductQrPayload('https://portal.example.com/?view=customer&token=tok-bosch-2026-0041-abcdef');
    assert.equal(portal.token, 'tok-bosch-2026-0041-abcdef');

    const labeled = parseProductQrPayload('SKU: BRSH-1002 | SN: 3611B54300 | MODEL: GBH 2-26 DFR');
    assert.equal(labeled.sku, 'BRSH-1002');
    assert.equal(labeled.serialNumber, '3611B54300');
    assert.equal(labeled.modelNumber, 'GBH 2-26 DFR');

    const ean = parseProductQrPayload('4059952534123');
    assert.equal(ean.barcode, '4059952534123');

    const jobCode = parseProductQrPayload('bosch-2026-0041');
    assert.equal(jobCode.jobId, 'BOSCH-2026-0041');
  });

  it('matches inventory items by barcode/SKU and locates job and maintenance history', () => {
    const matchedItem = findMatchingInventoryItem('4059952534123', sampleInventory);
    assert.equal(matchedItem?.id, 'inv-1');

    const bySerial = findMatchingToolHistory('SN-3611B54300', sampleJobs, sampleSchedules);
    assert.equal(bySerial.matchingJobs.length, 1);
    assert.equal(bySerial.matchingSchedules.length, 1);

    const byToken = findMatchingToolHistory(
      'https://portal.example.com/?view=customer&token=tok-bosch-2026-0041-abcdef',
      sampleJobs,
      sampleSchedules
    );
    assert.equal(byToken.matchingJobs[0]?.id, 'BOSCH-2026-0041');
  });
});
