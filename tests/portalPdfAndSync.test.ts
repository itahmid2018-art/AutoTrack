import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getApiBaseUrl, resolveApiUrl } from '../src/utils/apiBase';
import { sanitizeJobForCustomer, lookupCustomerJob } from '../src/utils/customerLookup';
import { sentStatusFor, isApiConfirmed } from '../src/utils/messagingStatus';
import { buildPdfBrandMeta } from '../src/utils/pdfBrandMeta';
import {
  generateBulkJobCardsPdf,
  generateJobCardPdf,
  generatePurchaseOrderPdf,
} from '../src/utils/generatePdf';
import { getEffectiveJobBilling } from '../src/utils/billing';
import {
  sanitizeDocId,
  isBootstrappedAdminUser,
  buildJobCardCreatePayload,
  buildJobCardUpdatePatch,
  buildInventoryCreatePayload,
  buildInventoryUpdatePatch,
  buildScheduleCreatePayload,
  buildScheduleUpdatePatch,
  buildSettingsCreatePayload,
  buildSettingsUpdatePatch,
  buildCustomFieldCreatePayload,
  buildCustomFieldUpdatePatch,
} from '../src/utils/firestoreSync';
import { INITIAL_JOB_CARDS } from '../src/data/initialJobCards';
import { INITIAL_INVENTORY } from '../src/data/mockInventory';
import { INITIAL_RECURRING_MAINTENANCE } from '../src/data/initialRecurringMaintenance';
import { INITIAL_CUSTOM_FIELDS } from '../src/data/initialCustomFields';
import { BusinessSettings } from '../src/types';

const SAMPLE_SETTINGS: BusinessSettings = {
  centerName: 'BOSCH & VENDOR POWER TOOLS SERVICE HUB',
  address: '100 Industrial Way',
  phone: '+1-555-0100',
  email: 'service@autotrack.local',
  taxRate: 10,
  laborRate: 75,
  jobCardPrefix: 'BOSCH-2026-',
  deductStockOn: 'InService',
  requireSignature: true,
  currencySymbol: '$',
  WhatsAppTemplateIntake: 'Intake confirmed',
  WhatsAppTemplateReady: 'Tool ready',
  WhatsAppTemplateEstimate: 'Estimate attached',
};

describe('apiBase utilities', () => {
  it('resolves relative paths cleanly and honors absolute URLs', () => {
    assert.equal(getApiBaseUrl(), '');
    assert.equal(resolveApiUrl('api/messaging/status'), '/api/messaging/status');
    assert.equal(resolveApiUrl('/api/ai/diagnose'), '/api/ai/diagnose');
    assert.equal(
      resolveApiUrl('https://example.com/api/test'),
      'https://example.com/api/test'
    );
  });
});

describe('customerLookup utilities', () => {
  it('masks sensitive fields when unverified and reveals record only after token or phone verification', () => {
    const job = {
      ...INITIAL_JOB_CARDS[0],
      customerPhone: '+15559874321',
      customerCompany: 'Apex Industrial Co',
      publicAccessToken: 'tok-abc-999',
    };

    const unverified = sanitizeJobForCustomer(job, false);
    assert.equal(unverified.customerCompany, undefined);
    assert.equal(unverified._pdfRecord, undefined);
    assert.equal(unverified.verifiedByTokenOrPhone, false);

    const byBareId = lookupCustomerJob([job], job.id);
    assert.equal(byBareId.status, 'verification-required');

    const byWrongPhone = lookupCustomerJob([job], job.id, '0000');
    assert.equal(byWrongPhone.status, 'verification-failed');

    const byValidPhone = lookupCustomerJob([job], job.id, '4321');
    assert.equal(byValidPhone.status, 'found');
    if (byValidPhone.status === 'found') {
      assert.equal(byValidPhone.summary._pdfRecord?.id, job.id);
    }

    const byValidToken = lookupCustomerJob([job], 'tok-abc-999');
    assert.equal(byValidToken.status, 'found');
  });
});

describe('messagingStatus utilities', () => {
  it('returns Sent only when HTTP ok and payload.success === true', () => {
    assert.equal(sentStatusFor(true), 'Sent');
    assert.equal(sentStatusFor(false), 'Pending');
    assert.equal(isApiConfirmed(true, { success: true }), true);
    assert.equal(isApiConfirmed(false, { success: true }), false);
    assert.equal(isApiConfirmed(true, { success: false }), false);
    assert.equal(isApiConfirmed(true, null), false);
  });
});

describe('pdfBrandMeta & generatePdf utilities', () => {
  it('builds brand metadata from settings and generates job card + PO PDF data URLs', () => {
    const meta = buildPdfBrandMeta(SAMPLE_SETTINGS, 'https://workshop.local');
    assert.equal(meta.centerName, SAMPLE_SETTINGS.centerName);
    assert.equal(meta.portalOrigin, 'https://workshop.local');

    const jobPdf = generateJobCardPdf(INITIAL_JOB_CARDS[0], meta, INITIAL_CUSTOM_FIELDS);
    assert.ok(jobPdf.filename.endsWith('_Service_Record.pdf'));
    assert.ok(jobPdf.dataUrl.startsWith('data:application/pdf'));

    const poPdf = generatePurchaseOrderPdf(
      [
        {
          sku: 'BRSH-001',
          name: 'Carbon Brush Set',
          currentStock: 2,
          minStockThreshold: 10,
          suggestedReorderQty: 18,
          costPrice: 12.5,
          estimatedTotalCost: 225,
          suggestedSupplier: 'Bosch Central Depot',
          urgency: 'Critical',
        },
      ],
      meta
    );
    assert.ok(poPdf.filename.endsWith('_Draft_Purchase_Order.pdf'));
    assert.ok(poPdf.dataUrl.startsWith('data:application/pdf'));

    const jobWithExpenses = {
      ...INITIAL_JOB_CARDS[2],
      operationalExpenses: [
        {
          id: 'exp-1',
          category: 'Shipping & Freight' as const,
          description: 'Site van pickup',
          vendor: 'Courier Express',
          amount: 25,
          date: '2026-11-22',
        },
      ],
    };
    const batchJobs = [INITIAL_JOB_CARDS[0], INITIAL_JOB_CARDS[1], jobWithExpenses];
    const bulkPdf = generateBulkJobCardsPdf(batchJobs, meta, INITIAL_CUSTOM_FIELDS);
    const expectedTotal = batchJobs.reduce(
      (sum, job) => sum + getEffectiveJobBilling(job).totalAmount,
      0
    );

    assert.equal(bulkPdf.jobCount, 3);
    assert.ok(bulkPdf.pageCount >= 4);
    assert.ok(bulkPdf.filename.startsWith('AutoTrack_Combined_JobCards_3_'));
    assert.ok(bulkPdf.filename.endsWith('.pdf'));
    assert.ok(bulkPdf.dataUrl.startsWith('data:application/pdf'));
    assert.ok(Math.abs(bulkPdf.totalAmount - expectedTotal) < 0.01);

    const emptyBulkPdf = generateBulkJobCardsPdf([], meta, INITIAL_CUSTOM_FIELDS);
    assert.equal(emptyBulkPdf.jobCount, 0);
    assert.equal(emptyBulkPdf.pageCount, 1);
    assert.equal(emptyBulkPdf.totalAmount, 0);
    assert.ok(emptyBulkPdf.dataUrl.startsWith('data:application/pdf'));
  });
});

describe('firestoreSync pure payload builders', () => {
  it('sanitizes doc IDs and verifies bootstrapped admin check', () => {
    assert.equal(sanitizeDocId('  BOSCH/2026 #01  '), 'BOSCH-2026-01');
    assert.equal(sanitizeDocId('', 'fallback-id'), 'fallback-id');

    assert.equal(isBootstrappedAdminUser(null), false);
    assert.equal(
      isBootstrappedAdminUser({ email: 'gurujiytube@gmail.com', emailVerified: false } as never),
      false
    );
    assert.equal(
      isBootstrappedAdminUser({ email: 'gurujiytube@gmail.com', emailVerified: true } as never),
      true
    );
  });

  it('builds schema-compliant create and update payloads for all Firestore collections', () => {
    const ownerUid = 'uid-admin-1';
    const staffUids = ['uid-admin-1'];

    const job = INITIAL_JOB_CARDS[0];
    const jobCreate = buildJobCardCreatePayload(job, ownerUid, staffUids);
    const jobPatch = buildJobCardUpdatePatch(job, staffUids);
    assert.equal(jobCreate.ownerUid, ownerUid);
    assert.equal(jobCreate.id, sanitizeDocId(job.id));
    assert.ok(typeof jobPatch.status === 'string');

    const inv = INITIAL_INVENTORY[0];
    const invCreate = buildInventoryCreatePayload(inv, ownerUid, staffUids);
    const invPatch = buildInventoryUpdatePatch(inv, staffUids);
    assert.equal(invCreate.sku, inv.sku);
    assert.equal(invPatch.stockQty, inv.stockQty);

    const sched = INITIAL_RECURRING_MAINTENANCE[0];
    const schedCreate = buildScheduleCreatePayload(sched, ownerUid, staffUids);
    const schedPatch = buildScheduleUpdatePatch(sched, staffUids);
    assert.equal(schedCreate.modelNumber, sched.modelNumber);
    assert.equal(schedPatch.status, sched.status);

    const settingsCreate = buildSettingsCreatePayload(SAMPLE_SETTINGS, ownerUid, staffUids);
    const settingsPatch = buildSettingsUpdatePatch(SAMPLE_SETTINGS, staffUids);
    assert.equal(settingsCreate.centerName, SAMPLE_SETTINGS.centerName);
    assert.equal(settingsPatch.laborRate, SAMPLE_SETTINGS.laborRate);

    const field = INITIAL_CUSTOM_FIELDS[0];
    const fieldCreate = buildCustomFieldCreatePayload(field, ownerUid, staffUids);
    const fieldPatch = buildCustomFieldUpdatePatch(field, staffUids);
    assert.equal(fieldCreate.key, field.key);
    assert.equal(fieldPatch.label, field.label);
  });
});
