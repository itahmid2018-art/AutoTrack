import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isItemBelowThreshold,
  computeReorderSuggestion,
  buildInventoryNotification,
  syncInventoryNotifications,
} from '../src/utils/inventoryNotifications';
import {
  SAMPLE_INVENTORY_CSV,
  parseSpreadsheetRows,
  parseInventorySpreadsheetText,
  applyInventoryImport,
} from '../src/utils/inventoryImportParser';
import { TransactionalDb } from '../src/utils/localStorageDb';
import { generateMySqlSchema, generateMySqlDump } from '../src/utils/mysqlExport';
import {
  syncRecordsToServiceWorker,
  readOfflineCachedJobCards,
  readOfflineCachedAllRecords,
} from '../src/utils/offlineCache';
import { INITIAL_JOB_CARDS } from '../src/data/initialJobCards';
import { INITIAL_RECURRING_MAINTENANCE } from '../src/data/initialRecurringMaintenance';
import { INITIAL_CUSTOM_FIELDS } from '../src/data/initialCustomFields';
import { BusinessSettings, InventoryItem } from '../src/types';

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

function makeInvItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'inv-test-1',
    sku: 'TEST-SKU-001',
    barcode: '4059955000001',
    name: 'Test Armature Assembly',
    category: 'Armatures & Rotors',
    brand: 'Bosch Professional',
    compatibleModels: 'GBH 2-26',
    unitPrice: 60,
    costPrice: 30,
    stockQty: 12,
    minStockThreshold: 10,
    unit: 'pcs',
    binLocation: 'BIN-A-01',
    lastRestocked: '2026-10-01',
    ...overrides,
  };
}

describe('inventoryNotifications utilities', () => {
  it('flags items strictly below threshold and computes severities and reorder quantities', () => {
    const healthy = makeInvItem({ id: 'i1', stockQty: 10, minStockThreshold: 10 });
    const low = makeInvItem({ id: 'i2', stockQty: 8, minStockThreshold: 10, costPrice: 20 });
    const critical = makeInvItem({ id: 'i3', stockQty: 2, minStockThreshold: 10, costPrice: 15 });
    const out = makeInvItem({ id: 'i4', stockQty: 0, minStockThreshold: 10, costPrice: 10 });

    assert.equal(isItemBelowThreshold(healthy), false);
    assert.equal(isItemBelowThreshold(low), true);

    assert.equal(computeReorderSuggestion(low).severity, 'LOW_STOCK');
    assert.equal(computeReorderSuggestion(critical).severity, 'CRITICAL');
    assert.equal(computeReorderSuggestion(out).severity, 'OUT_OF_STOCK');

    const prevRead = buildInventoryNotification(low);
    prevRead.read = true;
    const synced = syncInventoryNotifications([healthy, low, critical, out], [prevRead]);

    assert.equal(synced.length, 3); // healthy excluded
    assert.equal(synced[0].itemId, 'i4'); // unread OUT_OF_STOCK sorted first
    assert.equal(synced[1].itemId, 'i3'); // unread CRITICAL second
    assert.equal(synced[2].itemId, 'i2'); // read LOW_STOCK preserved read state & sorted last
    assert.equal(synced[2].read, true);
  });
});

describe('inventoryImportParser utilities', () => {
  it('detects delimiters and parses quoted CSV/TSV cells cleanly', () => {
    assert.equal(parseInventorySpreadsheetText('SKU\tName\nA1\tPart', []).delimiter, 'tab');
    assert.equal(parseInventorySpreadsheetText(SAMPLE_INVENTORY_CSV, []).delimiter, 'comma');

    const rows = parseSpreadsheetRows('SKU,Name\n"B-1","Carbon, Brush ""Pro"""', 'comma');
    assert.equal(rows.length, 2);
    assert.equal(rows[1][1], 'Carbon, Brush "Pro"');
  });

  it('validates rows and applies upsert, insertOnly, and replenish import modes', () => {
    const existing = [makeInvItem({ sku: 'SKU-EXIST', stockQty: 5, minStockThreshold: 4 })];
    const csv = [
      'SKU,Part Name,Unit Price,Cost Price,Stock Qty,Min Threshold,Unit',
      'SKU-EXIST,Existing Updated,75,40,3,6,sets',
      'SKU-NEW,New Bearing,22,12,15,5,pairs',
      ',Missing SKU Name,10,5,5,2,pcs',
    ].join('\n');

    const parsedUpsert = parseInventorySpreadsheetText(csv, existing, 'upsert');
    assert.equal(parsedUpsert.totalRows, 3);
    assert.equal(parsedUpsert.validRows.length, 2);
    assert.equal(parsedUpsert.invalidRows.length, 1);
    assert.equal(parsedUpsert.updateCount, 1);
    assert.equal(parsedUpsert.newCount, 1);

    const appliedReplenish = applyInventoryImport(existing, parsedUpsert.validRows, 'replenish');
    assert.equal(appliedReplenish.addedCount, 1);
    assert.equal(appliedReplenish.updatedCount, 1);
    assert.equal(appliedReplenish.nextInventory.find((i) => i.sku === 'SKU-EXIST')?.stockQty, 8); // 5 + 3

    const parsedInsertOnly = parseInventorySpreadsheetText(csv, existing, 'insertOnly');
    assert.equal(parsedInsertOnly.skipCount, 1);
    const appliedInsertOnly = applyInventoryImport(existing, parsedInsertOnly.validRows, 'insertOnly');
    assert.equal(appliedInsertOnly.skippedCount, 1);
    assert.equal(appliedInsertOnly.addedCount, 1);
  });
});

describe('localStorageDb utilities', () => {
  it('saves, loads, and falls back safely with shimmed localStorage', () => {
    const store = new Map<string, string>();
    const originalStorage = (globalThis as Record<string, unknown>).localStorage;

    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    };

    try {
      TransactionalDb.saveJobCards(INITIAL_JOB_CARDS);
      const loadedJobs = TransactionalDb.loadJobCards(INITIAL_JOB_CARDS);
      assert.equal(loadedJobs.length, INITIAL_JOB_CARDS.length);

      TransactionalDb.saveSettings(SAMPLE_SETTINGS);
      const loadedSettings = TransactionalDb.loadSettings(SAMPLE_SETTINGS);
      assert.equal(loadedSettings.centerName, SAMPLE_SETTINGS.centerName);

      TransactionalDb.saveCustomFields(INITIAL_CUSTOM_FIELDS);
      assert.equal(TransactionalDb.loadCustomFields(INITIAL_CUSTOM_FIELDS).length, INITIAL_CUSTOM_FIELDS.length);

      TransactionalDb.saveRecurringMaintenance(INITIAL_RECURRING_MAINTENANCE);
      assert.equal(
        TransactionalDb.loadRecurringMaintenance(INITIAL_RECURRING_MAINTENANCE).length,
        INITIAL_RECURRING_MAINTENANCE.length
      );

      // Corrupt JSON gracefully returns fallback
      store.set('autotrack_db_settings_v1', '{invalid-json');
      assert.equal(TransactionalDb.loadSettings(SAMPLE_SETTINGS).laborRate, SAMPLE_SETTINGS.laborRate);
    } finally {
      if (originalStorage === undefined) {
        delete (globalThis as Record<string, unknown>).localStorage;
      } else {
        (globalThis as Record<string, unknown>).localStorage = originalStorage;
      }
    }
  });
});

describe('mysqlExport utilities', () => {
  it('generates valid SQL DDL and transactional INSERT dump', () => {
    const schema = generateMySqlSchema();
    assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS `job_cards`'));
    assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS `inventory_items`'));
    assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS `recurring_maintenance`'));

    const dump = generateMySqlDump(
      INITIAL_JOB_CARDS.slice(0, 2),
      [makeInvItem({ name: "O'Connor Washer" })],
      SAMPLE_SETTINGS,
      INITIAL_RECURRING_MAINTENANCE.slice(0, 1),
      INITIAL_CUSTOM_FIELDS.slice(0, 2)
    );
    assert.ok(dump.includes('SEED DATA & TRANSACTIONAL DUMP'));
    assert.ok(dump.includes("O''Connor Washer")); // properly escaped SQL quote
    assert.ok(dump.includes('INSERT INTO `business_settings`'));
  });
});

describe('offlineCache utilities', () => {
  it('writes and reads offline cache records cleanly when Cache API is present or absent', async () => {
    // Without global caches (SSR / Node)
    const emptyRead = await readOfflineCachedJobCards();
    assert.equal(emptyRead.jobCards, null);

    // With mocked Cache Storage API
    const mockStore = new Map<string, Response>();
    const originalCaches = (globalThis as Record<string, unknown>).caches;
    (globalThis as Record<string, unknown>).caches = {
      open: async () => ({
        put: async (url: string, res: Response) => {
          mockStore.set(url, res);
        },
        match: async (url: string) => mockStore.get(url),
      }),
      delete: async () => true,
    };

    try {
      await syncRecordsToServiceWorker({
        jobCards: INITIAL_JOB_CARDS.slice(0, 2),
        inventory: [makeInvItem()],
        schedules: INITIAL_RECURRING_MAINTENANCE.slice(0, 1),
        settings: SAMPLE_SETTINGS,
      });

      const cachedJobs = await readOfflineCachedJobCards();
      assert.equal(cachedJobs.jobCards?.length, 2);

      const allCached = await readOfflineCachedAllRecords();
      assert.equal(allCached.inventory?.length, 1);
      assert.equal(allCached.schedules?.length, 1);
      assert.equal(allCached.settings?.centerName, SAMPLE_SETTINGS.centerName);
    } finally {
      if (originalCaches === undefined) {
        delete (globalThis as Record<string, unknown>).caches;
      } else {
        (globalThis as Record<string, unknown>).caches = originalCaches;
      }
    }
  });
});
