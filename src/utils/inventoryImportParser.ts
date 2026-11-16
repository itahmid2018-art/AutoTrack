import { InventoryItem } from '../types';

export type InventoryImportMode = 'upsert' | 'replenish' | 'insertOnly';

export type InventoryRowAction = 'NEW' | 'UPDATE' | 'SKIP' | 'ERROR';

export interface ParsedInventoryRow {
  rowNumber: number;
  isValid: boolean;
  action: InventoryRowAction;
  errors: string[];
  warnings: string[];
  existingItemId?: string;
  previousStockQty?: number;
  data: Omit<InventoryItem, 'id'>;
}

export interface InventoryImportParseResult {
  delimiter: 'tab' | 'comma';
  hasHeaderRow: boolean;
  totalRows: number;
  allRows: ParsedInventoryRow[];
  validRows: ParsedInventoryRow[];
  invalidRows: ParsedInventoryRow[];
  newCount: number;
  updateCount: number;
  skipCount: number;
}

const VALID_UNITS: InventoryItem['unit'][] = [
  'pcs',
  'sets',
  'bottles',
  'boxes',
  'pairs',
  'meters',
];

const HEADER_ALIASES: Record<string, keyof Omit<InventoryItem, 'id'>> = {
  sku: 'sku',
  partsku: 'sku',
  itemcode: 'sku',
  partno: 'sku',
  partnumber: 'sku',
  code: 'sku',

  barcode: 'barcode',
  ean: 'barcode',
  upc: 'barcode',
  qr: 'barcode',

  name: 'name',
  partname: 'name',
  itemname: 'name',
  description: 'name',
  partdescription: 'name',
  title: 'name',

  category: 'category',
  group: 'category',
  partcategory: 'category',

  brand: 'brand',
  manufacturer: 'brand',
  vendor: 'brand',

  compatiblemodels: 'compatibleModels',
  models: 'compatibleModels',
  compatibletools: 'compatibleModels',
  tools: 'compatibleModels',

  unitprice: 'unitPrice',
  sellingprice: 'unitPrice',
  price: 'unitPrice',
  msrp: 'unitPrice',
  sellprice: 'unitPrice',

  costprice: 'costPrice',
  cost: 'costPrice',
  unitcost: 'costPrice',

  stockqty: 'stockQty',
  stock: 'stockQty',
  qty: 'stockQty',
  quantity: 'stockQty',
  onhand: 'stockQty',
  currentstock: 'stockQty',

  minstockthreshold: 'minStockThreshold',
  minstock: 'minStockThreshold',
  minthreshold: 'minStockThreshold',
  threshold: 'minStockThreshold',
  reorderlevel: 'minStockThreshold',

  unit: 'unit',
  uom: 'unit',

  binlocation: 'binLocation',
  bin: 'binLocation',
  shelf: 'binLocation',
  location: 'binLocation',

  lastrestocked: 'lastRestocked',
};

const POSITIONAL_COLUMNS: Array<keyof Omit<InventoryItem, 'id'>> = [
  'sku',
  'barcode',
  'name',
  'category',
  'brand',
  'compatibleModels',
  'unitPrice',
  'costPrice',
  'stockQty',
  'minStockThreshold',
  'unit',
  'binLocation',
];

export const SAMPLE_INVENTORY_CSV = `sku,barcode,name,category,brand,compatibleModels,unitPrice,costPrice,stockQty,minStockThreshold,unit,binLocation
"1617014144","4059955141448","Carbon Brush Set (Pair) with Auto-Cutoff","Carbon Brushes","Bosch Professional","GBH 2-26 DFR, GBH 2-28, GBH 2-24 D",12.50,4.20,48,15,"sets","BIN-A-04-12"
"2608572213","4059955221300","Quick-Change SDS Plus Toolholder Chuck","Chuck & Toolholders","Bosch Professional","GBH 2-26 DFR, GBH 2-28 F, GBH 3-28 DFR",46.00,21.50,14,5,"pcs","BIN-B-02-08"
"1614010227","4059955022709","Armature Assembly 230V with Fan","Armatures & Rotors","Bosch Professional","GBH 2-26 DRE, GBH 2-26 DFR",58.00,28.00,8,4,"pcs","BIN-C-01-03"
"1607000228","4059955002282","Deep Groove Ball Bearing 608-2RS","Bearings & Seals","Bosch Professional","GBH 2-26, GWS 900, GWS 750",6.20,1.80,65,20,"pcs","BIN-A-01-15"
"1607014176","4059955141769","Carbon Brush Set (Pair) 5x8x17.5mm","Carbon Brushes","Bosch Professional","GWS 900-100, GWS 750-100, GWS 9-115",8.90,2.50,32,12,"sets","BIN-A-04-14"
"1607200179","4059955201791","Main Trigger Switch Assembly with Lock-On","Switches & Electronics","Bosch Professional","GWS 900, GWS 750, GWS 9-115",16.40,6.90,18,6,"pcs","BIN-D-03-02"
"1615430010","4059955300104","FT 1 V 4 Synthetic Heavy Duty Gearbox Grease 225ml","Lubricants & Grease","Bosch Professional","GBH 2-26, GBH 4-32, GSH 11 E, GBH 11 DE",24.00,11.20,25,8,"bottles","BIN-E-05-01"
"1617000625","4059955006259","SDS-Max Striker & O-Ring Service Set","Striker & Piston","Bosch Professional","GSH 11 E, GBH 11 DE, GSH 10 C",38.50,16.00,12,4,"sets","BIN-B-04-06"
"2607225929","4059955259297","GAL 18V-40 Quick Battery Charger 18V","Chargers & Power","Bosch Professional","GSR 18V-50, GSB 18V-50, GWS 18V-10",54.00,29.00,10,3,"pcs","BIN-F-01-04"
"1604460298","4059955460297","Heavy Duty Rubber Power Supply Cable 4m 2x1.5mm","Cables & Cords","Bosch Professional","GBH 2-26, GSH 11 E, GWS 24-230",18.00,7.50,22,8,"pcs","BIN-E-02-10"`;

function normalizeHeaderKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function detectDelimiter(text: string): 'tab' | 'comma' {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/).find((l) => l.trim().length > 0) || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount > 0 && tabCount >= commaCount ? 'tab' : 'comma';
}

export function parseSpreadsheetRows(rawText: string, delimiter: 'tab' | 'comma'): string[][] {
  const normalized = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (delimiter === 'tab') {
    return normalized
      .split('\n')
      .map((line) =>
        line.split('\t').map((rawCell) => {
          const cell = rawCell.trim();
          if (cell.length >= 2 && cell.startsWith('"') && cell.endsWith('"')) {
            return cell.slice(1, -1).replace(/""/g, '"').trim();
          }
          return cell;
        })
      )
      .filter((row) => row.some((c) => c.length > 0));
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1];

    if (ch === '"') {
      if (insideQuotes && next === '"') {
        currentCell += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (ch === ',' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\n' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function parseNumericCell(raw?: string): number | null {
  if (raw === undefined || raw === null) return null;
  const cleaned = raw
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[$€£,\s]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function normalizeUnit(raw?: string): InventoryItem['unit'] {
  const lower = (raw || '').trim().toLowerCase();
  if (VALID_UNITS.includes(lower as InventoryItem['unit'])) {
    return lower as InventoryItem['unit'];
  }
  if (lower.startsWith('set')) return 'sets';
  if (lower.startsWith('pair')) return 'pairs';
  if (lower.startsWith('box')) return 'boxes';
  if (lower.startsWith('bot')) return 'bottles';
  if (lower.startsWith('meter') || lower.startsWith('m')) return 'meters';
  return 'pcs';
}

export function parseInventorySpreadsheetText(
  rawText: string,
  existingInventory: InventoryItem[],
  mode: InventoryImportMode = 'upsert'
): InventoryImportParseResult {
  const delimiter = detectDelimiter(rawText);
  const rows = parseSpreadsheetRows(rawText, delimiter);

  if (rows.length === 0) {
    return {
      delimiter,
      hasHeaderRow: false,
      totalRows: 0,
      allRows: [],
      validRows: [],
      invalidRows: [],
      newCount: 0,
      updateCount: 0,
      skipCount: 0,
    };
  }

  const firstRowMapped = rows[0].map((col) => HEADER_ALIASES[normalizeHeaderKey(col)] || null);
  const recognizedHeaderCount = firstRowMapped.filter(Boolean).length;
  const hasHeaderRow = recognizedHeaderCount >= 2;

  const columnMap: Array<keyof Omit<InventoryItem, 'id'> | null> = hasHeaderRow
    ? firstRowMapped
    : rows[0].map((_, idx) => POSITIONAL_COLUMNS[idx] || null);

  const dataStartIndex = hasHeaderRow ? 1 : 0;
  const existingBySku = new Map<string, InventoryItem>();
  existingInventory.forEach((item) => {
    existingBySku.set(item.sku.trim().toUpperCase(), item);
  });

  const seenSkusInBatch = new Set<string>();
  const todayStr = new Date().toISOString().split('T')[0];

  const allRows: ParsedInventoryRow[] = [];

  for (let i = dataStartIndex; i < rows.length; i++) {
    const rawCells = rows[i];
    const rowNumber = i + 1;
    const record: Record<string, string> = {};

    columnMap.forEach((fieldKey, colIdx) => {
      if (fieldKey && rawCells[colIdx] !== undefined) {
        record[fieldKey] = rawCells[colIdx].trim();
      }
    });

    const errors: string[] = [];
    const warnings: string[] = [];

    const sku = (record.sku || '').trim();
    const name = (record.name || '').trim();

    if (!sku) errors.push('Missing SKU');
    if (!name) errors.push('Missing part name');

    const skuKey = sku.toUpperCase();
    if (sku && seenSkusInBatch.has(skuKey)) {
      warnings.push(`Duplicate SKU "${sku}" in paste; later row overrides earlier row`);
    }
    if (sku) seenSkusInBatch.add(skuKey);

    const parsedUnitPrice = parseNumericCell(record.unitPrice);
    const parsedCostPrice = parseNumericCell(record.costPrice);
    const parsedStockQty = parseNumericCell(record.stockQty);
    const parsedMinThreshold = parseNumericCell(record.minStockThreshold);

    if (record.unitPrice && (parsedUnitPrice === null || parsedUnitPrice < 0)) {
      errors.push('Invalid unitPrice');
    }
    if (record.costPrice && (parsedCostPrice === null || parsedCostPrice < 0)) {
      errors.push('Invalid costPrice');
    }
    if (record.stockQty && (parsedStockQty === null || parsedStockQty < 0)) {
      errors.push('Invalid stockQty');
    }
    if (record.minStockThreshold && (parsedMinThreshold === null || parsedMinThreshold < 0)) {
      errors.push('Invalid minStockThreshold');
    }

    const existing = sku ? existingBySku.get(skuKey) : undefined;

    const unitPrice =
      parsedUnitPrice !== null ? Math.round(parsedUnitPrice * 100) / 100 : (existing?.unitPrice ?? 0);
    const costPrice =
      parsedCostPrice !== null
        ? Math.round(parsedCostPrice * 100) / 100
        : (existing?.costPrice ?? Math.round(unitPrice * 0.55 * 100) / 100);
    const stockQty =
      parsedStockQty !== null ? Math.round(parsedStockQty) : (existing ? 0 : 10);
    const minStockThreshold =
      parsedMinThreshold !== null ? Math.round(parsedMinThreshold) : (existing?.minStockThreshold ?? 5);

    const normalizedData: Omit<InventoryItem, 'id'> = {
      sku: sku || `SKU-ROW-${rowNumber}`,
      barcode: (record.barcode || '').trim() || existing?.barcode || sku || `4059955${String(rowNumber).padStart(6, '0')}`,
      name: name || existing?.name || 'Unnamed Spare Part',
      category: (record.category || '').trim() || existing?.category || 'General Spare Parts',
      brand: (record.brand || '').trim() || existing?.brand || 'Bosch Professional',
      compatibleModels: (record.compatibleModels || '').trim() || existing?.compatibleModels || 'Universal Bosch Tools',
      unitPrice,
      costPrice,
      stockQty,
      minStockThreshold,
      unit: record.unit ? normalizeUnit(record.unit) : (existing?.unit ?? 'pcs'),
      binLocation: (record.binLocation || '').trim() || existing?.binLocation || 'BIN-A-01-01',
      lastRestocked: (record.lastRestocked || '').trim() || todayStr,
    };

    const isValid = errors.length === 0;
    let action: InventoryRowAction = 'ERROR';
    if (isValid) {
      if (!existing) {
        action = 'NEW';
      } else if (mode === 'insertOnly') {
        action = 'SKIP';
      } else {
        action = 'UPDATE';
      }
    }

    allRows.push({
      rowNumber,
      isValid,
      action,
      errors,
      warnings,
      existingItemId: existing?.id,
      previousStockQty: existing?.stockQty,
      data: normalizedData,
    });
  }

  const validRows = allRows.filter((r) => r.isValid);
  const invalidRows = allRows.filter((r) => !r.isValid);

  return {
    delimiter,
    hasHeaderRow,
    totalRows: allRows.length,
    allRows,
    validRows,
    invalidRows,
    newCount: validRows.filter((r) => r.action === 'NEW').length,
    updateCount: validRows.filter((r) => r.action === 'UPDATE').length,
    skipCount: validRows.filter((r) => r.action === 'SKIP').length,
  };
}

export function applyInventoryImport(
  existingInventory: InventoryItem[],
  validRows: ParsedInventoryRow[],
  mode: InventoryImportMode
): {
  nextInventory: InventoryItem[];
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
} {
  const bySku = new Map<string, InventoryItem>();
  existingInventory.forEach((item) => {
    bySku.set(item.sku.trim().toUpperCase(), { ...item });
  });

  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const addedItems: InventoryItem[] = [];
  const today = new Date().toISOString().split('T')[0];

  validRows.forEach((row, index) => {
    const skuKey = row.data.sku.trim().toUpperCase();
    const existing = bySku.get(skuKey);

    if (existing) {
      if (mode === 'insertOnly') {
        skippedCount += 1;
        return;
      }

      const nextQty =
        mode === 'replenish'
          ? existing.stockQty + row.data.stockQty
          : row.data.stockQty;

      const updated: InventoryItem = {
        ...existing,
        barcode: row.data.barcode || existing.barcode,
        name: row.data.name || existing.name,
        category: row.data.category || existing.category,
        brand: row.data.brand || existing.brand,
        compatibleModels: row.data.compatibleModels || existing.compatibleModels,
        unitPrice: row.data.unitPrice > 0 ? row.data.unitPrice : existing.unitPrice,
        costPrice: row.data.costPrice > 0 ? row.data.costPrice : existing.costPrice,
        stockQty: nextQty,
        minStockThreshold: row.data.minStockThreshold,
        unit: row.data.unit,
        binLocation: row.data.binLocation || existing.binLocation,
        lastRestocked: today,
      };
      bySku.set(skuKey, updated);
      updatedCount += 1;
    } else {
      const slug = row.data.sku
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-')
        .slice(0, 32);
      const created: InventoryItem = {
        id: `item-${slug}-${Date.now().toString(36)}-${index}`,
        ...row.data,
      };
      bySku.set(skuKey, created);
      addedItems.push(created);
      addedCount += 1;
    }
  });

  const existingUpdated = existingInventory.map(
    (orig) => bySku.get(orig.sku.trim().toUpperCase()) || orig
  );

  return {
    nextInventory: [...addedItems, ...existingUpdated],
    addedCount,
    updatedCount,
    skippedCount,
  };
}
