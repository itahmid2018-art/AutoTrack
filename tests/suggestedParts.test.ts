import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractBrandKeywords,
  extractModelTokens,
  getSuggestedPartsForTool,
  searchInventoryAutoSuggestions,
} from '../src/utils/suggestedParts';
import { INITIAL_INVENTORY } from '../src/data/mockInventory';
import { InventoryItem } from '../src/types';

function makeItem(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    id: 'item-test',
    sku: 'TST-100',
    barcode: '123456',
    name: 'Generic Part',
    category: 'Carbon Brushes & Caps',
    brand: 'Bosch Genuine Spare Parts',
    compatibleModels: 'Bosch GBH 2-26',
    unitPrice: 20,
    costPrice: 10,
    stockQty: 10,
    minStockThreshold: 4,
    unit: 'pcs',
    binLocation: 'Bin A-01',
    lastRestocked: '2026-11-05',
    ...overrides,
  };
}

test('extractBrandKeywords and extractModelTokens parse workshop brand and model strings', () => {
  assert.deepEqual(extractBrandKeywords('Bosch Professional'), ['bosch']);
  assert.deepEqual(extractBrandKeywords('Bosch DIY (Green)'), ['bosch']);
  assert.deepEqual(extractBrandKeywords('Makita'), ['makita']);

  const gbh = extractModelTokens('GBH 2-26 DFR');
  assert.equal(gbh.full, 'gbh 2-26 dfr');
  assert.equal(gbh.compact, 'gbh226dfr');
  assert.ok(gbh.coreTokens.includes('gbh 2-26'));
  assert.ok(gbh.coreTokens.includes('2-26'));
  assert.equal(gbh.prefixToken, 'gbh');
});

test('getSuggestedPartsForTool prioritizes exact model and brand matches over generic brand items', () => {
  const catalog: InventoryItem[] = [
    makeItem({
      id: 'i-brand-only',
      sku: 'HSG-1',
      name: 'Bosch Carrying Case',
      category: 'Housing Covers & Handles',
      brand: 'Bosch Heavy Duty OEM',
      compatibleModels: 'Bosch GWS 7-115',
    }),
    makeItem({
      id: 'i-exact',
      sku: 'CHK-2',
      name: 'Bosch GBH 2-26 DFR Quick Change Chuck',
      category: 'SDS Chucks & Tool Holders',
      brand: 'Bosch Genuine Spare Parts',
      compatibleModels: 'Bosch GBH 2-26 DFR, GBH 2-28',
    }),
    makeItem({
      id: 'i-other-brand',
      sku: 'BAT-3',
      name: 'DeWalt DCB184 Battery Pack',
      category: 'Batteries & Chargers',
      brand: 'DeWalt Service Parts',
      compatibleModels: 'DeWalt DCD796',
    }),
  ];

  const results = getSuggestedPartsForTool(
    { brand: 'Bosch Professional', modelNumber: 'GBH 2-26 DFR' },
    catalog
  );

  assert.equal(results[0].item.sku, 'CHK-2');
  assert.equal(results[0].matchReason, 'Exact Model & Brand');
  assert.ok(!results.some((r) => r.item.sku === 'BAT-3'));
});

test('getSuggestedPartsForTool returns diverse distinct spare parts from the 1,000-SKU catalog for Makita HR2470', () => {
  const results = getSuggestedPartsForTool(
    { brand: 'Makita', modelNumber: 'HR2470' },
    INITIAL_INVENTORY,
    { limit: 6 }
  );

  assert.ok(results.length >= 2);
  assert.ok(
    results.some((r) => r.item.name.toLowerCase().includes('hr2470') || r.item.compatibleModels.toLowerCase().includes('hr2470'))
  );

  // Variant deduplication prevents repetitive "#10/#11" duplicates from crowding suggestions
  const normalizedNames = results.map((r) => r.item.name.replace(/\s+#\d+$/i, '').toLowerCase());
  assert.equal(new Set(normalizedNames).size, normalizedNames.length);
});

test('getSuggestedPartsForTool supports category filtering cleanly', () => {
  const brushesOnly = getSuggestedPartsForTool(
    { brand: 'Bosch Professional', modelNumber: 'GBH 2-26 DFR' },
    INITIAL_INVENTORY,
    { categoryFilter: 'Carbon Brushes & Caps', limit: 4 }
  );

  assert.ok(brushesOnly.length >= 1);
  assert.ok(brushesOnly.every((m) => m.item.category === 'Carbon Brushes & Caps'));
});

test('searchInventoryAutoSuggestions ranks parts matching job brand and tool category on focus and while typing', () => {
  const catalog: InventoryItem[] = [
    makeItem({
      id: 'i-unrelated',
      sku: 'BAT-001',
      name: 'DeWalt DCB184 Battery Pack',
      category: 'Batteries & Chargers',
      brand: 'DeWalt Service Parts',
      compatibleModels: 'DeWalt DCD796',
    }),
    makeItem({
      id: 'i-cat-only',
      sku: 'CHK-002',
      name: 'Generic SDS-Plus Chuck Assembly',
      category: 'SDS Chucks & Tool Holders',
      brand: 'Metabo Service Parts',
      compatibleModels: 'Universal SDS',
    }),
    makeItem({
      id: 'i-brand-cat',
      sku: 'BRSH-003',
      name: 'Bosch Carbon Brush Pair',
      category: 'Carbon Brushes & Caps',
      brand: 'Bosch Genuine Spare Parts',
      compatibleModels: 'Bosch GBH 2-26',
    }),
    makeItem({
      id: 'i-brand-only',
      sku: 'HSG-004',
      name: 'Bosch Blower Nozzle',
      category: 'Housing Covers & Handles',
      brand: 'Bosch Heavy Duty OEM',
      compatibleModels: 'Bosch GBL 800',
    }),
  ];

  // Empty-query focus auto-suggestions exclude unrelated brand/category and rank Brand + Category match first
  const focusResults = searchInventoryAutoSuggestions(
    { brand: 'Bosch Professional', category: 'Rotary Hammer / SDS', modelNumber: 'GBH 2-26' },
    catalog,
    ''
  );
  assert.equal(focusResults[0].item.sku, 'BRSH-003');
  assert.equal(focusResults[0].isBrandMatch, true);
  assert.equal(focusResults[0].isCategoryMatch, true);
  assert.equal(focusResults[0].matchLabel, 'Brand & Category Match');
  assert.ok(!focusResults.some((r) => r.item.sku === 'BAT-001'));

  // Typing a broad query ranks exact Brand + Category relevance above other brand matches
  const angleGrinderCatalogResults = searchInventoryAutoSuggestions(
    { brand: 'DeWalt', category: 'Cordless Drill / Driver', modelNumber: 'DCD796' },
    catalog,
    'battery'
  );
  assert.equal(angleGrinderCatalogResults.length, 1);
  assert.equal(angleGrinderCatalogResults[0].item.sku, 'BAT-001');
  assert.equal(angleGrinderCatalogResults[0].matchLabel, 'Brand & Category Match');

  // Direct SKU lookup surfaces the exact item first
  const skuLookup = searchInventoryAutoSuggestions(
    { brand: 'Bosch Professional', category: 'Rotary Hammer / SDS', modelNumber: 'GBH 2-26' },
    catalog,
    'CHK-002'
  );
  assert.equal(skuLookup.length, 1);
  assert.equal(skuLookup[0].item.sku, 'CHK-002');
});
