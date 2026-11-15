import { RecurringMaintenance, ToolBrand, ToolCategory } from '../types';

export interface ParsedMaintenanceRow {
  rowNumber: number;
  data: RecurringMaintenance;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  rawValues: Record<string, string>;
}

export interface CsvImportResult {
  totalRows: number;
  validRows: ParsedMaintenanceRow[];
  invalidRows: ParsedMaintenanceRow[];
  allRows: ParsedMaintenanceRow[];
}

export const KNOWN_TOOL_BRANDS: ToolBrand[] = [
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

export const KNOWN_TOOL_CATEGORIES: ToolCategory[] = [
  'Rotary Hammer / SDS',
  'Angle Grinder',
  'Cordless Drill / Driver',
  'Impact Wrench / Driver',
  'Circular / Miter Saw',
  'Demolition Breaker',
  'Heat Gun / Blower',
  'High Pressure Washer',
  'Laser & Measuring',
  'Lawn & Garden / Outdoor',
];

/**
 * Robust RFC 4180 CSV line & cell tokenizer.
 * Handles quoted cells with embedded commas and escaped double quotes ("").
 */
export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  const normalized = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // Skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (char === '\n' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      // Skip empty blank lines
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  // Push last cell & row if file doesn't end with newline
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function matchToolBrand(raw?: string): ToolBrand {
  if (!raw) return 'Bosch Professional';
  const clean = raw.trim().toLowerCase();

  if (clean.includes('bosch') && (clean.includes('diy') || clean.includes('green'))) {
    return 'Bosch DIY (Green)';
  }
  if (clean.includes('bosch')) return 'Bosch Professional';
  if (clean.includes('makita')) return 'Makita';
  if (clean.includes('dewalt') || clean.includes('de walt')) return 'DeWalt';
  if (clean.includes('milwaukee')) return 'Milwaukee';
  if (clean.includes('hilti')) return 'Hilti';
  if (clean.includes('metabo')) return 'Metabo';
  if (clean.includes('festool')) return 'Festool';
  if (clean.includes('stihl')) return 'Stihl';

  const exact = KNOWN_TOOL_BRANDS.find((b) => b.toLowerCase() === clean);
  return exact || 'Other Vendor';
}

export function matchToolCategory(raw?: string): ToolCategory {
  if (!raw) return 'Rotary Hammer / SDS';
  const clean = raw.trim().toLowerCase();

  if (clean.includes('rotary') || clean.includes('sds') || (clean.includes('hammer') && !clean.includes('demolition'))) {
    return 'Rotary Hammer / SDS';
  }
  if (clean.includes('grinder') || clean.includes('angle')) {
    return 'Angle Grinder';
  }
  if (clean.includes('drill') || (clean.includes('driver') && !clean.includes('impact'))) {
    return 'Cordless Drill / Driver';
  }
  if (clean.includes('impact')) {
    return 'Impact Wrench / Driver';
  }
  if (clean.includes('saw') || clean.includes('miter') || clean.includes('circular')) {
    return 'Circular / Miter Saw';
  }
  if (clean.includes('breaker') || clean.includes('demolition')) {
    return 'Demolition Breaker';
  }
  if (clean.includes('heat') || clean.includes('blower')) {
    return 'Heat Gun / Blower';
  }
  if (clean.includes('washer') || clean.includes('pressure')) {
    return 'High Pressure Washer';
  }
  if (clean.includes('laser') || clean.includes('measur')) {
    return 'Laser & Measuring';
  }
  if (clean.includes('lawn') || clean.includes('garden') || clean.includes('outdoor')) {
    return 'Lawn & Garden / Outdoor';
  }

  const exact = KNOWN_TOOL_CATEGORIES.find((c) => c.toLowerCase() === clean);
  return exact || 'Rotary Hammer / SDS';
}

/**
 * Normalizes date to YYYY-MM-DD. Supports YYYY-MM-DD, MM/DD/YYYY, and DD-MM-YYYY.
 */
export function normalizeDate(dateStr?: string, defaultToday: boolean = true): string {
  const todayStr = new Date().toISOString().split('T')[0];
  if (!dateStr || !dateStr.trim()) {
    return defaultToday ? todayStr : '';
  }

  const trimmed = dateStr.trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // MM/DD/YYYY or M/D/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const parts = trimmed.split('/');
    const mm = parts[0].padStart(2, '0');
    const dd = parts[1].padStart(2, '0');
    const yyyy = parts[2];
    return `${yyyy}-${mm}-${dd}`;
  }

  // DD-MM-YYYY
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(trimmed)) {
    const parts = trimmed.split('-');
    const dd = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    const yyyy = parts[2];
    return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return defaultToday ? todayStr : '';
}

export function computeNextDueDate(lastServiceDate: string, intervalMonths: number): string {
  try {
    const date = new Date(lastServiceDate);
    if (Number.isNaN(date.getTime())) {
      const now = new Date();
      now.setMonth(now.getMonth() + intervalMonths);
      return now.toISOString().split('T')[0];
    }
    date.setMonth(date.getMonth() + intervalMonths);
    return date.toISOString().split('T')[0];
  } catch {
    const now = new Date();
    now.setMonth(now.getMonth() + intervalMonths);
    return now.toISOString().split('T')[0];
  }
}

export function computeScheduleStatus(nextDueDate: string): 'Upcoming' | 'Due Soon' | 'Overdue' | 'Serviced' {
  const todayStr = new Date().toISOString().split('T')[0];
  if (nextDueDate <= todayStr) {
    return 'Overdue';
  }
  const diffDays = Math.ceil((new Date(nextDueDate).getTime() - new Date(todayStr).getTime()) / (1000 * 3600 * 24));
  if (diffDays <= 14) {
    return 'Due Soon';
  }
  return 'Upcoming';
}

/**
 * Standard CSV Template with header and sample rows.
 */
export const SAMPLE_MAINTENANCE_CSV = `Client Name,Company,Phone,Email,Tool Brand,Tool Category,Model Number,Serial Number,Interval Months,Last Service Date,Next Due Date,Recommended Scope,Notes
"Apex Industrial Construction","Apex Industrial","+1 (555) 234-5678","service@apexconstruct.com","Bosch Professional","Demolition Breaker","GSH 11 E Professional","SN-3611C36000",6,"2026-05-15","2026-11-15","SDS-Max Striker O-Ring overhaul & FT 1 V 4 Lithium Gearbox Lubrication","Heavy concrete demolition usage"
"Metro Electrical Contractors","Metro Electric","+1 (555) 987-6543","maintenance@metroelectric.org","Bosch Professional","Rotary Hammer / SDS","GBH 2-28 F Professional","SN-3611B67000",3,"2026-08-01","2026-11-01","Auto-Stop Carbon Brushes check & High Voltage Cable inspection","High volume conduit drilling"
"Marcus Vance Mechanics","Vance Workshop","+1 (555) 876-5432","repairs@vancemechanics.com","Bosch Professional","Angle Grinder","GWS 24-230 LVI Professional","SN-3601H93000",6,"2026-09-10","2027-03-10","Vibration Control Side Handle & Grinding Flange bearing replacement","Chassis fabrication bay"
"Hilti Fleet Partner Services","Hilti Fleet","+1 (555) 345-6789","fleet@hiltipartner.com","Hilti","Demolition Breaker","TE 70-ATC/AVR","SN-HLT902148",12,"2025-11-20","2026-11-20","Annual AVR Anti-Vibration dampener & Brushless Controller calibration","Quarterly safety inspect"
"Precision Formwork & Joinery","Precision Joinery","+1 (555) 432-8765","ops@precisionjoinery.net","Makita","Circular / Miter Saw","LS1019L Sliding Compound Saw","SN-MK-550912",6,"2026-06-12","2026-12-12","Linear ball bearing rail alignment & electronic brake test","Cabinetry shop setup"`;

/**
 * Maps arbitrary header names to standardized keys.
 */
export function normalizeHeaderKey(rawHeader: string): string {
  const clean = rawHeader.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['clientname', 'customername', 'client', 'customer', 'name'].includes(clean)) return 'customerName';
  if (['company', 'clientcompany', 'customercompany', 'organization', 'org'].includes(clean)) return 'customerCompany';
  if (['phone', 'mobile', 'whatsapp', 'clientphone', 'customerphone', 'telephone', 'tel'].includes(clean)) return 'customerPhone';
  if (['email', 'clientemail', 'customeremail'].includes(clean)) return 'customerEmail';
  if (['toolbrand', 'brand', 'vendor', 'make'].includes(clean)) return 'toolBrand';
  if (['toolcategory', 'category', 'type', 'tooltype'].includes(clean)) return 'toolCategory';
  if (['modelnumber', 'model', 'toolmodel', 'modelno'].includes(clean)) return 'modelNumber';
  if (['serialnumber', 'serial', 'sn', 'serialno'].includes(clean)) return 'serialNumber';
  if (['intervalmonths', 'interval', 'servicemonths', 'months', 'intervalinmonths', 'serviceinterval'].includes(clean)) return 'intervalMonths';
  if (['lastservicedate', 'lastserviced', 'lastservice', 'date', 'lastdate'].includes(clean)) return 'lastServiceDate';
  if (['nextduedate', 'nextdue', 'duedate', 'due'].includes(clean)) return 'nextDueDate';
  if (['recommendedservicescope', 'recommendedscope', 'scope', 'servicescope', 'service'].includes(clean)) return 'recommendedServiceScope';
  if (['notes', 'remarks', 'comment', 'comments'].includes(clean)) return 'notes';
  return clean;
}

export function parseMaintenanceCsv(
  csvText: string,
  existingCount: number,
  existingIds: Set<string> = new Set()
): CsvImportResult {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) {
    return { totalRows: 0, validRows: [], invalidRows: [], allRows: [] };
  }

  const rawHeaders = rows[0];
  const headerKeys = rawHeaders.map(normalizeHeaderKey);

  const allRows: ParsedMaintenanceRow[] = [];
  const validRows: ParsedMaintenanceRow[] = [];
  const invalidRows: ParsedMaintenanceRow[] = [];

  let sequenceCursor = existingCount + 10;
  const usedIds = new Set<string>(existingIds);

  for (let r = 1; r < rows.length; r++) {
    const rowValues = rows[r];
    const rawMap: Record<string, string> = {};
    headerKeys.forEach((key, idx) => {
      rawMap[key] = rowValues[idx] || '';
    });

    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields: client name, model number
    const customerName = (rawMap.customerName || rawMap.clientname || '').trim();
    if (!customerName) {
      errors.push('Missing Client Name');
    }

    const customerPhone = (rawMap.customerPhone || rawMap.phone || '').trim() || 'N/A';

    const modelNumber = (rawMap.modelNumber || rawMap.model || '').trim();
    if (!modelNumber) {
      errors.push('Missing Tool Model Number');
    }

    // Optional / defaulted fields
    const customerCompany = (rawMap.customerCompany || rawMap.company || '').trim() || undefined;
    const customerEmail = (rawMap.customerEmail || rawMap.email || '').trim() || undefined;
    const serialNumber = (rawMap.serialNumber || rawMap.serial || '').trim() || 'SN-UNASSIGNED';

    if (serialNumber === 'SN-UNASSIGNED') {
      warnings.push('Serial Number missing (set to SN-UNASSIGNED)');
    }

    const rawInterval = parseInt(rawMap.intervalMonths || rawMap.interval || '6', 10);
    const intervalMonths = Number.isInteger(rawInterval) && rawInterval > 0 ? rawInterval : 6;

    if (!Number.isInteger(rawInterval) || rawInterval <= 0) {
      warnings.push('Invalid interval (defaulted to 6 months)');
    }

    const lastServiceDate = normalizeDate(rawMap.lastServiceDate, true);
    let nextDueDate = normalizeDate(rawMap.nextDueDate, false);

    if (!nextDueDate) {
      nextDueDate = computeNextDueDate(lastServiceDate, intervalMonths);
    }

    const status = computeScheduleStatus(nextDueDate);
    const toolBrand = matchToolBrand(rawMap.toolBrand || rawMap.brand);
    const toolCategory = matchToolCategory(rawMap.toolCategory || rawMap.category);
    const recommendedServiceScope = (rawMap.recommendedServiceScope || rawMap.scope || '').trim() ||
      'Routine Safety Check & Carbon Brush Inspection';
    const notes = (rawMap.notes || '').trim() || undefined;

    // Generate unique ID
    let scheduleId = `MAINT-2026-${String(sequenceCursor).padStart(3, '0')}`;
    while (usedIds.has(scheduleId)) {
      sequenceCursor++;
      scheduleId = `MAINT-2026-${String(sequenceCursor).padStart(3, '0')}`;
    }
    usedIds.add(scheduleId);
    sequenceCursor++;

    const nowIso = new Date().toISOString();

    const record: RecurringMaintenance = {
      id: scheduleId,
      customerName: customerName || 'Unknown Client',
      customerCompany,
      customerPhone: customerPhone || 'N/A',
      customerEmail,
      toolBrand,
      toolCategory,
      modelNumber: modelNumber || 'Power Tool',
      serialNumber,
      intervalMonths,
      lastServiceDate,
      nextDueDate,
      status,
      recommendedServiceScope,
      notes,
      queuedReminders: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const parsedRow: ParsedMaintenanceRow = {
      rowNumber: r + 1,
      data: record,
      isValid: errors.length === 0,
      errors,
      warnings,
      rawValues: rawMap,
    };

    allRows.push(parsedRow);
    if (parsedRow.isValid) {
      validRows.push(parsedRow);
    } else {
      invalidRows.push(parsedRow);
    }
  }

  return {
    totalRows: allRows.length,
    validRows,
    invalidRows,
    allRows,
  };
}

export const STANDARD_7COL_MAINTENANCE_CSV = `customerName,toolBrand,toolCategory,modelNumber,serialNumber,intervalMonths,recommendedServiceScope
"Apex Industrial Construction","Bosch Professional","Demolition Breaker","GSH 11 E Professional","SN-3611C36000",6,"SDS-Max Striker O-Ring overhaul & FT 1 V 4 Lithium Gearbox Lubrication"
"Metro Electrical Contractors","Bosch Professional","Rotary Hammer / SDS","GBH 2-28 F Professional","SN-3611B67000",3,"Auto-Stop Carbon Brushes check & High Voltage Cable inspection"
"Marcus Vance Mechanics","Bosch Professional","Angle Grinder","GWS 24-230 LVI Professional","SN-3601H93000",6,"Vibration Control Side Handle & Grinding Flange bearing replacement"
"Hilti Fleet Partner Services","Hilti","Demolition Breaker","TE 70-ATC/AVR","SN-HLT902148",12,"Annual AVR Anti-Vibration dampener & Brushless Controller calibration"
"Precision Formwork & Joinery","Makita","Circular / Miter Saw","LS1019L Sliding Compound Saw","SN-MK-550912",6,"Linear ball bearing rail alignment & electronic brake test"`;

export function downloadStandard7ColTemplate() {
  const blob = new Blob([STANDARD_7COL_MAINTENANCE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'standard_client_maintenance_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadMaintenanceCsvTemplate() {
  const blob = new Blob([STANDARD_7COL_MAINTENANCE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'client_maintenance_schedules_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportMaintenanceCsv(schedules: RecurringMaintenance[]) {
  const headers = [
    'Schedule ID',
    'Client Name',
    'Company',
    'Phone',
    'Email',
    'Tool Brand',
    'Tool Category',
    'Model Number',
    'Serial Number',
    'Interval Months',
    'Last Service Date',
    'Next Due Date',
    'Status',
    'Recommended Service Scope',
    'Notes',
    'Reminders Queued',
  ];

  const escapeCell = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = schedules.map((s) => [
    escapeCell(s.id),
    escapeCell(s.customerName),
    escapeCell(s.customerCompany || ''),
    escapeCell(s.customerPhone),
    escapeCell(s.customerEmail || ''),
    escapeCell(s.toolBrand),
    escapeCell(s.toolCategory),
    escapeCell(s.modelNumber),
    escapeCell(s.serialNumber),
    s.intervalMonths,
    escapeCell(s.lastServiceDate),
    escapeCell(s.nextDueDate),
    escapeCell(s.status),
    escapeCell(s.recommendedServiceScope),
    escapeCell(s.notes || ''),
    s.queuedReminders ? s.queuedReminders.length : 0,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `client_maintenance_schedules_export_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
