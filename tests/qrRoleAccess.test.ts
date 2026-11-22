import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJobCardQrPayload,
  buildQrMatrix,
} from '../src/utils/customerPortalUrl';
import {
  findMatchingInventoryItem,
  findMatchingToolHistory,
  parseProductQrPayload,
} from '../src/utils/barcodeSerialParser';
import { resolveJobQrScanAccess } from '../src/utils/qrRoleAccess';
import { InventoryItem, JobCard } from '../src/types';

function makeJob(id: string, token: string, serialNumber: string): JobCard {
  return {
    id,
    customerName: 'Jordan Lee',
    customerCompany: 'Jordan Builders',
    customerPhone: '+15559871234',
    tool: {
      brand: 'Bosch Professional',
      category: 'Rotary Hammer / SDS',
      modelNumber: 'GBH 2-26 DFR',
      serialNumber,
      voltageRating: '230V',
      warrantyStatus: 'Standard 1-Year',
      physicalCondition: 'Good',
      accessoriesReceived: [],
    },
    serviceReq: {
      grievanceCategory: 'Low Impact / No Hammering Action',
      detailedComplaint: 'Weak hammering',
      serviceType: 'Diagnostic & Repair',
      preApprovedLimit: 120,
    },
    intakeDate: '2026-11-10',
    promisedCompletion: '2026-11-12',
    status: 'In Service',
    priority: 'Medium',
    technician: 'David Miller',
    laborHours: 1,
    laborRate: 50,
    discount: 0,
    taxRate: 10,
    parts: [],
    totalAmount: 55,
    publicAccessToken: token,
    messageLogs: [],
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: '2026-11-10T10:00:00.000Z',
  };
}

const sampleInventory: InventoryItem[] = [
  {
    id: 'inv-1',
    sku: 'BRSH-1002',
    barcode: '4059952534123',
    name: 'Carbon Brush Set',
    category: 'Electrical',
    brand: 'Bosch Professional',
    compatibleModels: 'GBH 2-26',
    unitPrice: 14,
    costPrice: 7,
    stockQty: 20,
    minStockThreshold: 5,
    unit: 'sets',
    binLocation: 'B-04',
    lastRestocked: '2026-11-01',
  },
];

describe('Job Card QR code and role-based global scanner access', () => {
  const jobA = makeJob('BOSCH-2026-0041', 'tok-bosch-0041-alpha', 'SN-1001');
  const jobB = makeJob('TOOL-2026-0099', 'tok-tool-0099-beta', 'SN-2002');
  const jobs = [jobA, jobB];

  it('builds valid scannable QR payload URLs and boolean matrices', () => {
    const payload = buildJobCardQrPayload(jobB, 'https://hub.example.com');
    assert.equal(
      payload,
      'https://hub.example.com/?view=customer&token=tok-tool-0099-beta&job=TOOL-2026-0099'
    );

    const parsed = parseProductQrPayload(payload);
    assert.equal(parsed.token, 'tok-tool-0099-beta');
    assert.equal(parsed.jobId, 'TOOL-2026-0099');

    const matrix = buildQrMatrix(payload);
    assert.ok(matrix.size > 20);
    assert.equal(matrix.rows.length, matrix.size);
  });

  it('parses custom workshop job prefixes directly', () => {
    const parsedPlain = parseProductQrPayload('tool-2026-0099');
    assert.equal(parsedPlain.jobId, 'TOOL-2026-0099');

    const parsedLabeled = parseProductQrPayload('JOB: TOOL-2026-0099 | SN: SN-2002');
    assert.equal(parsedLabeled.jobId, 'TOOL-2026-0099');
    assert.equal(parsedLabeled.serialNumber, 'SN-2002');
  });

  it('restricts Client role to view-only and response for their scanned jobID only', () => {
    const qrPayload = buildJobCardQrPayload(jobA, 'https://hub.example.com');
    const historyMatch = findMatchingToolHistory(qrPayload, jobs, []);

    const access = resolveJobQrScanAccess({
      scanResult: {
        serialNumber: 'BOSCH-2026-0041',
        rawValue: qrPayload,
        format: 'QR_CODE',
        method: 'Hardware BarcodeDetector',
      },
      jobCards: jobs,
      role: 'customer',
      matchedInventory: sampleInventory[0],
      historyMatch,
    });

    assert.equal(access.canViewFullJobCard, false);
    assert.equal(access.canEditJob, false);
    assert.equal(access.canViewInventory, false);
    assert.equal(access.canPrefillIntake, false);
    assert.equal(access.canRespondToJob, true);
    assert.equal(access.verifiedByToken, true);
    assert.equal(access.accessibleInventory, null);
    assert.equal(access.accessibleJobs.length, 1);
    assert.equal(access.clientSummary?.id, 'BOSCH-2026-0041');
  });

  it('denies Client access to raw spare part SKU scans without a matching job ticket', () => {
    const historyMatch = findMatchingToolHistory('BRSH-1002', jobs, [], 'BRSH-1002');
    const matchedInventory = findMatchingInventoryItem('BRSH-1002', sampleInventory);

    const access = resolveJobQrScanAccess({
      scanResult: {
        serialNumber: 'BRSH-1002',
        rawValue: 'BRSH-1002',
        format: 'QR_CODE',
        method: 'Hardware BarcodeDetector',
      },
      jobCards: jobs,
      role: 'customer',
      matchedInventory,
      historyMatch,
    });

    assert.equal(access.clientSummary, null);
    assert.equal(access.canViewInventory, false);
    assert.ok(access.denialReason && access.denialReason.length > 0);
  });

  it('grants Internal Admin full job card, inventory, and intake access', () => {
    const qrPayload = buildJobCardQrPayload(jobB, 'https://hub.example.com');
    const historyMatch = findMatchingToolHistory(qrPayload, jobs, []);

    const access = resolveJobQrScanAccess({
      scanResult: {
        serialNumber: 'TOOL-2026-0099',
        rawValue: qrPayload,
        format: 'QR_CODE',
        method: 'Hardware BarcodeDetector',
      },
      jobCards: jobs,
      role: 'internal_admin',
      matchedInventory: sampleInventory[0],
      historyMatch,
    });

    assert.equal(access.canViewFullJobCard, true);
    assert.equal(access.canEditJob, true);
    assert.equal(access.canViewInventory, true);
    assert.equal(access.canPrefillIntake, true);
    assert.equal(access.primaryJob?.id, 'TOOL-2026-0099');
    assert.equal(access.accessibleInventory?.sku, 'BRSH-1002');
  });
});
