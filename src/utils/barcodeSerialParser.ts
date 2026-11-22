import { InventoryItem, JobCard, RecurringMaintenance, ToolBrand } from '../types';

export interface BarcodeScanResult {
  serialNumber: string;
  rawValue: string;
  format: string;
  method: 'Hardware BarcodeDetector' | 'AI Label Vision';
  detectedModelNumber?: string;
  detectedSku?: string;
  detectedBrand?: string;
}

export interface ParsedProductQrPayload {
  rawValue: string;
  sku?: string;
  barcode?: string;
  serialNumber?: string;
  modelNumber?: string;
  brand?: string;
  jobId?: string;
  token?: string;
}

export interface ToolHistoryMatch {
  queryCode: string;
  matchingJobs: JobCard[];
  matchingSchedules: RecurringMaintenance[];
}

const KNOWN_BRANDS: ToolBrand[] = [
  'Bosch Professional',
  'Bosch DIY (Green)',
  'Makita',
  'DeWalt',
  'Milwaukee',
  'Hilti',
  'Metabo',
  'Festool',
  'Stihl',
  'Other Vendor',
];

function matchKnownBrand(rawBrand?: string): ToolBrand | undefined {
  if (!rawBrand) return undefined;
  const lower = rawBrand.trim().toLowerCase();
  const exact = KNOWN_BRANDS.find((b) => b.toLowerCase() === lower);
  if (exact) return exact;
  if (lower.includes('bosch') && (lower.includes('green') || lower.includes('diy') || lower.includes('home'))) {
    return 'Bosch DIY (Green)';
  }
  if (lower.includes('bosch')) return 'Bosch Professional';
  if (lower.includes('makita')) return 'Makita';
  if (lower.includes('dewalt')) return 'DeWalt';
  if (lower.includes('milwaukee')) return 'Milwaukee';
  if (lower.includes('hilti')) return 'Hilti';
  if (lower.includes('metabo')) return 'Metabo';
  if (lower.includes('festool')) return 'Festool';
  if (lower.includes('stihl')) return 'Stihl';
  return undefined;
}

function stripSnPrefix(val: string): string {
  return val.trim().replace(/^SN[-:\s]*/i, '').toUpperCase();
}

/**
 * Normalizes a scanned 1D/2D barcode payload into a clean tool serial number.
 * Supports plain serial codes (e.g. "3611B54300", "SN-3611B54300"),
 * Bosch nameplate prefixes ("S/N: ...", "FD:..."), JSON QR payloads, and QR URLs.
 */
export function normalizeScannedSerial(rawValue: string): string {
  const parsed = parseProductQrPayload(rawValue);
  if (parsed.serialNumber) return parsed.serialNumber;
  if (parsed.sku) return parsed.sku;
  if (parsed.barcode) return parsed.barcode;
  if (parsed.jobId) return parsed.jobId;

  const trimmed = (rawValue || '').trim();
  if (!trimmed) return '';
  const singleLine = trimmed.split(/[\r\n]+/)[0].trim();
  return singleLine.replace(/\s+/g, '-').toUpperCase();
}

/**
 * Parses structured product/tool QR code payloads (JSON, URL parameters, key:value labels, or plain codes).
 */
export function parseProductQrPayload(rawValue: string): ParsedProductQrPayload {
  const trimmed = (rawValue || '').trim();
  if (!trimmed) return { rawValue: '' };

  // 1. JSON QR payload (e.g. {"sku":"BRSH-1002","serialNumber":"SN-3611B54300"})
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object') {
        const sku = typeof obj.sku === 'string' ? obj.sku.trim().toUpperCase() : undefined;
        const barcode = typeof obj.barcode === 'string' ? obj.barcode.trim() : undefined;
        const serialRaw =
          obj.serialNumber || obj.serial || obj.sn || obj.serial_number;
        const serialNumber =
          typeof serialRaw === 'string' && serialRaw.trim()
            ? serialRaw.trim().toUpperCase()
            : undefined;
        const modelRaw = obj.modelNumber || obj.model || obj.toolModel;
        const modelNumber =
          typeof modelRaw === 'string' && modelRaw.trim() ? modelRaw.trim() : undefined;
        const brand = matchKnownBrand(typeof obj.brand === 'string' ? obj.brand : undefined);
        const jobRaw = obj.jobId || obj.jobCardId || obj.id;
        const jobId =
          typeof jobRaw === 'string' && jobRaw.trim() ? jobRaw.trim().toUpperCase() : undefined;
        const token = typeof obj.token === 'string' ? obj.token.trim() : undefined;

        return {
          rawValue: trimmed,
          sku,
          barcode,
          serialNumber,
          modelNumber,
          brand,
          jobId,
          token,
        };
      }
    } catch {
      // Fall through if not valid JSON
    }
  }

  // 2. URL QR payload (e.g. customer portal / tracking URL with ?token=, ?job=, ?sn=, ?sku=)
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const sku = url.searchParams.get('sku')?.trim().toUpperCase() || undefined;
      const barcode = url.searchParams.get('barcode')?.trim() || undefined;
      const serialParam =
        url.searchParams.get('sn') ||
        url.searchParams.get('serial') ||
        url.searchParams.get('serialNumber') ||
        url.searchParams.get('s');
      const modelNumber =
        url.searchParams.get('model') ||
        url.searchParams.get('modelNumber') ||
        undefined;
      const jobId =
        (url.searchParams.get('job') || url.searchParams.get('jobId'))?.trim().toUpperCase() ||
        undefined;
      const token = url.searchParams.get('token')?.trim() || undefined;
      const lastSegment = url.pathname.split('/').filter(Boolean).pop();

      const fallbackSerial =
        !sku && !barcode && !serialParam && !jobId && !token && lastSegment && lastSegment.length >= 4
          ? lastSegment.trim().toUpperCase()
          : undefined;

      return {
        rawValue: trimmed,
        sku,
        barcode,
        serialNumber: serialParam?.trim().toUpperCase() || fallbackSerial,
        modelNumber: modelNumber?.trim() || undefined,
        jobId,
        token,
      };
    } catch {
      // Fall through
    }
  }

  // 3. Key-value / labeled barcode payload (e.g. "SKU: BRSH-1002 | SN: 3611B54300 | MODEL: GBH 2-26 DFR")
  const jobMatch = trimmed.match(/(?:^|[\s;|,])(?:JOB|JOB_ID|JOBID|CARD)\s*[:=#]\s*([A-Z0-9-]{4,32})/i);
  const skuMatch = trimmed.match(/(?:^|[\s;|,])SKU\s*[:=#]\s*([A-Z0-9-]{3,32})/i);
  const barcodeMatch = trimmed.match(/(?:^|[\s;|,])(?:BARCODE|EAN|UPC)\s*[:=#]\s*([A-Z0-9-]{4,32})/i);
  const serialMatch = trimmed.match(
    /(?:^|[\s;|,])(?:S\/?N|SERIAL(?:\s*(?:NO|NUMBER))?|SER)\s*[:=#-]\s*([A-Z0-9-]{4,32})/i
  );
  const modelMatch = trimmed.match(/(?:^|[\s;|,])MODEL\s*[:=#]\s*([A-Z0-9 \-./]{3,40}?)(?=$|[\s]*[;|,\r\n])/i);

  if (jobMatch || skuMatch || barcodeMatch || serialMatch || modelMatch) {
    return {
      rawValue: trimmed,
      jobId: jobMatch?.[1]?.trim().toUpperCase(),
      sku: skuMatch?.[1]?.trim().toUpperCase(),
      barcode: barcodeMatch?.[1]?.trim(),
      serialNumber: serialMatch?.[1]?.trim().toUpperCase(),
      modelNumber: modelMatch?.[1]?.trim(),
    };
  }

  // 4. Plain token classification (SKU vs numeric EAN/UPC barcode vs Job ID vs tool serial)
  const compact = trimmed.split(/[\r\n]+/)[0].trim();
  const upper = compact.toUpperCase();

  if (/^\d{8,14}$/.test(compact)) {
    return { rawValue: trimmed, barcode: compact, serialNumber: compact };
  }
  if (/^[A-Z]{2,6}-\d{3,6}$/.test(upper)) {
    return { rawValue: trimmed, sku: upper, serialNumber: upper };
  }
  if (/^[A-Z]{2,12}-\d{4}-\d{2,6}$/.test(upper)) {
    return { rawValue: trimmed, jobId: upper };
  }

  return {
    rawValue: trimmed,
    serialNumber: compact.replace(/\s+/g, '-').toUpperCase(),
  };
}

/**
 * Looks up a matching spare part SKU / barcode item from inventory using a scanned QR or barcode value.
 */
export function findMatchingInventoryItem(
  rawValue: string,
  inventory: InventoryItem[]
): InventoryItem | null {
  const parsed = parseProductQrPayload(rawValue);
  const candidates = [
    parsed.sku,
    parsed.barcode,
    parsed.serialNumber,
    parsed.rawValue.trim(),
  ]
    .filter((c): c is string => Boolean(c && c.trim()))
    .map((c) => c.trim().toLowerCase());

  if (candidates.length === 0) return null;

  return (
    inventory.find((item) => {
      const itemSku = item.sku.trim().toLowerCase();
      const itemBarcode = item.barcode.trim().toLowerCase();
      return candidates.some((c) => itemSku === c || itemBarcode === c);
    }) || null
  );
}

/**
 * Looks up prior workshop Job Cards and Recurring Maintenance schedules matching a scanned tool QR, serial, job ID, or portal token.
 */
export function findMatchingToolHistory(
  rawValue: string,
  jobCards: JobCard[],
  schedules: RecurringMaintenance[] = [],
  matchedInventorySku?: string
): ToolHistoryMatch {
  const parsed = parseProductQrPayload(rawValue);
  const queryCode =
    parsed.serialNumber || parsed.jobId || parsed.sku || parsed.barcode || parsed.rawValue.trim();

  const candidateSerials = new Set<string>();
  [parsed.serialNumber, parsed.barcode, parsed.rawValue].forEach((val) => {
    if (!val) return;
    const clean = val.trim().toUpperCase();
    if (clean.length >= 4) {
      candidateSerials.add(clean);
      candidateSerials.add(stripSnPrefix(clean));
    }
  });

  const matchingJobs = jobCards.filter((job) => {
    if (parsed.jobId && job.id.toUpperCase() === parsed.jobId) return true;
    if (parsed.token && job.publicAccessToken && job.publicAccessToken === parsed.token) return true;

    const jobSn = (job.tool?.serialNumber || '').trim().toUpperCase();
    if (jobSn && jobSn !== 'N/A') {
      if (candidateSerials.has(jobSn) || candidateSerials.has(stripSnPrefix(jobSn))) {
        return true;
      }
    }

    if (
      matchedInventorySku &&
      Array.isArray(job.parts) &&
      job.parts.some((part) => part.sku.toUpperCase() === matchedInventorySku.toUpperCase())
    ) {
      return true;
    }

    return false;
  });

  const matchingSchedules = schedules.filter((sched) => {
    const schedSn = (sched.serialNumber || '').trim().toUpperCase();
    if (!schedSn) return false;
    return candidateSerials.has(schedSn) || candidateSerials.has(stripSnPrefix(schedSn));
  });

  return {
    queryCode,
    matchingJobs,
    matchingSchedules,
  };
}
