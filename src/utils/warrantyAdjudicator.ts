import { JobCard, ToolBrand, ToolDetails, WarrantyAdjudication, WarrantyFlag } from '../types';

export interface ManufactureLookupEntry {
  serialPattern: string;
  manufactureDate: string; // YYYY-MM
  plantCode: string;
  notes: string;
}

/**
 * Standard Service Center Manufacture Date Lookup Table
 * Maps known Bosch & multi-vendor production serial numbers / batch prefixes
 * to verified factory manufacture dates (YYYY-MM) and plant origins.
 */
export const MANUFACTURE_DATE_LOOKUP: Record<string, ManufactureLookupEntry> = {
  '3611B54300': {
    serialPattern: 'SN-3611B54300',
    manufactureDate: '2024-06',
    plantCode: 'DE-Leinfelden',
    notes: 'Bosch GBH 2-26 DFR Batch 2024-Q2 (36-Month Heavy Duty Eligible)',
  },
  '3601C96000': {
    serialPattern: 'SN-3601C96000',
    manufactureDate: '2026-03',
    plantCode: 'IN-Chennai',
    notes: 'Bosch GWS 900-100 Batch 2026-Q1',
  },
  '3611H17000': {
    serialPattern: 'SN-3611H17000',
    manufactureDate: '2023-08',
    plantCode: 'DE-Sebnitz',
    notes: 'Bosch GSH 11 E Batch 2023-Q3',
  },
  'DW-991823': {
    serialPattern: 'SN-DW-991823',
    manufactureDate: '2022-04',
    plantCode: 'US-Charlotte',
    notes: 'DeWalt D25133K Legacy Production Run',
  },
  'MK-772910': {
    serialPattern: 'SN-MK-772910',
    manufactureDate: '2026-01',
    plantCode: 'JP-Anjo',
    notes: 'Makita GA4530 Production Lot 2026-01',
  },
  'MIL-440192': {
    serialPattern: 'SN-MIL-440192',
    manufactureDate: '2020-11',
    plantCode: 'CN-Dongguan',
    notes: 'Milwaukee M18 FUEL Gen-3 Lot 2020-11',
  },
};

/**
 * Standard Service Center Brand Warranty Term Criteria (in months)
 */
export function getStandardWarrantyTermMonths(
  brand: ToolBrand,
  declaredStatus?: ToolDetails['warrantyStatus']
): number {
  if (declaredStatus === 'Bosch Heavy Duty 3-Year Extended') return 36;
  switch (brand) {
    case 'Bosch Professional':
      return 36; // Bosch Blue Heavy Duty 3-Year Extended standard
    case 'Bosch DIY (Green)':
      return 24;
    case 'DeWalt':
    case 'Milwaukee':
    case 'Festool':
      return 36;
    case 'Hilti':
      return 24;
    case 'Makita':
    case 'Metabo':
    case 'Stihl':
    case 'Other Vendor':
    default:
      return 12;
  }
}

/**
 * Decodes serial numbers using:
 * 1. Exact Manufacture Date Lookup Registry
 * 2. Bosch FD-Code (Fertigungsdatum: FD-YMM / FDYMM, e.g. FD-504 -> 2025-04)
 * 3. Embedded YYYYMM / YYMM / YYYY-WW Factory Batch Codes (e.g. SN-202506-112, DW-2411-998)
 * 4. Bosch 10-digit numeric series heuristic
 */
export function decodeSerialManufactureDate(serialNumber: string): {
  serialNumberValid: boolean;
  manufactureDate: string | null; // YYYY-MM
  decodedMethod: string;
} {
  const raw = (serialNumber || '').trim().toUpperCase();
  if (!raw || raw === 'N/A' || raw === 'NA' || raw.length < 4) {
    return {
      serialNumberValid: false,
      manufactureDate: null,
      decodedMethod: 'Missing or invalid serial number format',
    };
  }

  const normalized = raw.replace(/^SN[-:\s]*/i, '');

  // 1. Direct Manufacture Date Lookup match
  if (MANUFACTURE_DATE_LOOKUP[normalized]) {
    const entry = MANUFACTURE_DATE_LOOKUP[normalized];
    return {
      serialNumberValid: true,
      manufactureDate: entry.manufactureDate,
      decodedMethod: `Factory Lookup (${entry.plantCode})`,
    };
  }

  // 2. Bosch 3-digit FD (Fertigungsdatum) pattern: FD-409, FD603, FD 511, FD-5048812
  const fdMatch = normalized.match(/(?:^|[^A-Z0-9])FD[-:\s]?(\d)(0[1-9]|1[0-2])(?:\d*|[^A-Z0-9]|$)/);
  if (fdMatch) {
    const yearDigit = parseInt(fdMatch[1], 10);
    const monthNum = parseInt(fdMatch[2], 10);
    // Decade mapping anchored around 2017-2026
    const year = yearDigit <= 6 ? 2020 + yearDigit : 2010 + yearDigit;
    return {
      serialNumberValid: true,
      manufactureDate: `${year}-${String(monthNum).padStart(2, '0')}`,
      decodedMethod: `Bosch FD Date Code (FD-${yearDigit}${String(monthNum).padStart(2, '0')})`,
    };
  }

  // 3. Embedded YYYYMM or YYYY-MM pattern (e.g. 202506, 2024-11)
  const yyyymmMatch = normalized.match(/(201[5-9]|202[0-6])[-/]?(0[1-9]|1[0-2])/);
  if (yyyymmMatch) {
    return {
      serialNumberValid: true,
      manufactureDate: `${yyyymmMatch[1]}-${yyyymmMatch[2]}`,
      decodedMethod: 'ISO YYYYMM Serial Date Decode',
    };
  }

  // 4. Embedded YYWW or YYMM pattern (e.g. DW-2514-991 -> 2025 week 14 or month, or B2409xxxx)
  const yymmMatch = normalized.match(/(?:^|[-A-Z])(1[89]|2[0-6])(0[1-9]|1[0-2])(?:\d{2,}|[-]|$)/);
  if (yymmMatch) {
    return {
      serialNumberValid: true,
      manufactureDate: `20${yymmMatch[1]}-${yymmMatch[2]}`,
      decodedMethod: 'Vendor YYMM Production Stamp',
    };
  }

  // 5. Embedded YYWW (year + week 01..53) pattern (common on DeWalt / Milwaukee)
  const yywwMatch = normalized.match(/(?:^|[-A-Z])(1[89]|2[0-6])([0-4]\d|5[0-3])(?:\d{2,}|[-]|$)/);
  if (yywwMatch) {
    const year = 2000 + parseInt(yywwMatch[1], 10);
    const week = Math.max(1, Math.min(52, parseInt(yywwMatch[2], 10)));
    const approxMonth = Math.min(12, Math.max(1, Math.ceil((week / 52) * 12)));
    return {
      serialNumberValid: true,
      manufactureDate: `${year}-${String(approxMonth).padStart(2, '0')}`,
      decodedMethod: `Factory Week Stamp (20${yywwMatch[1]}-W${yywwMatch[2]})`,
    };
  }

  // 6. Bosch 9-to-10-character alphanumeric prefix lookup / heuristic (e.g., 3611... / 3601...)
  const boschPartMatch = normalized.match(/^(360[0-9]|361[0-9]|060[0-9])[A-Z0-9]{5,7}$/);
  if (boschPartMatch) {
    // Letter in position 5 often denotes revision/year batch
    const batchChar = normalized.charAt(4);
    const charYearMap: Record<string, string> = {
      A: '2022-05',
      B: '2024-06',
      C: '2025-09',
      D: '2026-02',
      E: '2026-06',
      H: '2023-08',
    };
    const mappedDate = charYearMap[batchChar] || '2023-01';
    return {
      serialNumberValid: true,
      manufactureDate: mappedDate,
      decodedMethod: 'Bosch Series Batch Prefix Decode',
    };
  }

  // Unrecognized pattern — valid alphanumeric check only
  const plausible = /^[A-Z0-9-]{6,}$/.test(normalized);
  return {
    serialNumberValid: plausible,
    manufactureDate: null,
    decodedMethod: plausible
      ? 'Serial format valid; manufacture stamp not in lookup'
      : 'Unverified / malformed serial check-digit',
  };
}

function addMonthsToYearMonth(ym: string, monthsToAdd: number): string {
  const [yStr, mStr] = ym.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const totalMonths = y * 12 + (m - 1) + monthsToAdd;
  const outYear = Math.floor(totalMonths / 12);
  const outMonth = (totalMonths % 12) + 1;
  return `${outYear}-${String(outMonth).padStart(2, '0')}`;
}

function diffMonths(fromYm: string, toDate: Date): number {
  const [yStr, mStr] = fromYm.split('-');
  const fromYear = parseInt(yStr, 10);
  const fromMonth = parseInt(mStr, 10);
  const toYear = toDate.getFullYear();
  const toMonth = toDate.getMonth() + 1;
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

/**
 * Warranty Adjudication Helper Function
 * Decodes serial numbers, compares them against the manufacture date lookup &
 * standard service center brand warranty criteria, and automatically returns
 * an 'In-Warranty' or 'Out-of-Warranty' adjudication result.
 */
export function adjudicateWarranty(
  tool: Pick<ToolDetails, 'brand' | 'serialNumber' | 'warrantyStatus' | 'physicalCondition'>,
  options?: {
    referenceDate?: Date;
    grievanceCategory?: string;
    detailedComplaint?: string;
  }
): WarrantyAdjudication & { recommendedWarrantyStatus: ToolDetails['warrantyStatus'] } {
  const refDate = options?.referenceDate || new Date();
  const termMonths = getStandardWarrantyTermMonths(tool.brand, tool.warrantyStatus);
  const decoded = decodeSerialManufactureDate(tool.serialNumber);

  // Check service-center exclusion conditions (abuse / user-inflicted damage)
  const combinedNotes = `${tool.physicalCondition || ''} ${options?.grievanceCategory || ''} ${options?.detailedComplaint || ''}`.toLowerCase();
  let exclusionAdvisory: string | undefined;
  if (combinedNotes.includes('cable cut') || combinedNotes.includes('severed')) {
    exclusionAdvisory = 'Exclusion Advisory: Cord / cable cut is typically billed as non-warranty wear/damage.';
  } else if (combinedNotes.includes('water') || combinedNotes.includes('slurry')) {
    exclusionAdvisory = 'Exclusion Advisory: Inspect armature/stator for concrete slurry or moisture ingress before approving warranty claim.';
  }

  let flag: WarrantyFlag = 'Out-of-Warranty';
  let ageMonths: number | null = null;
  let expirationDate: string | null = null;
  let reason = '';
  let recommendedWarrantyStatus: ToolDetails['warrantyStatus'] = tool.warrantyStatus;

  if (decoded.manufactureDate) {
    ageMonths = Math.max(0, diffMonths(decoded.manufactureDate, refDate));
    expirationDate = addMonthsToYearMonth(decoded.manufactureDate, termMonths);

    if (ageMonths <= termMonths) {
      flag = 'In-Warranty';
      const remaining = termMonths - ageMonths;
      reason = `Manufactured ${decoded.manufactureDate} (${ageMonths} mos old) — within ${termMonths}-month ${tool.brand} warranty (${remaining} mos remaining until ${expirationDate}).`;
      recommendedWarrantyStatus = termMonths >= 36 && tool.brand === 'Bosch Professional'
        ? 'Bosch Heavy Duty 3-Year Extended'
        : 'Standard 1-Year';
    } else {
      flag = 'Out-of-Warranty';
      const expiredBy = ageMonths - termMonths;
      reason = `Manufactured ${decoded.manufactureDate} (${ageMonths} mos old) — exceeded ${termMonths}-month ${tool.brand} warranty by ${expiredBy} mos (expired ${expirationDate}).`;
      recommendedWarrantyStatus = 'Out of Warranty';
    }
  } else {
    // No manufacture date could be decoded from serial
    if (tool.warrantyStatus === 'Out of Warranty') {
      flag = 'Out-of-Warranty';
      reason = 'Declared Out of Warranty and no valid factory manufacture date encoded in serial.';
      recommendedWarrantyStatus = 'Out of Warranty';
    } else if (!decoded.serialNumberValid) {
      flag = 'Out-of-Warranty';
      reason = `Auto-flagged Out-of-Warranty: ${decoded.decodedMethod}. Valid serial or proof of purchase required for warranty claim.`;
      recommendedWarrantyStatus = 'Unconfirmed';
    } else {
      // Valid serial without known factory stamp falls back conservatively to Out-of-Warranty until verified
      flag = 'Out-of-Warranty';
      reason = `Serial ${tool.serialNumber} not found in manufacture date lookup. Auto-flagged Out-of-Warranty pending invoice verification.`;
      recommendedWarrantyStatus = 'Unconfirmed';
    }
  }

  return {
    flag,
    serialNumberValid: decoded.serialNumberValid,
    manufactureDate: decoded.manufactureDate,
    expirationDate,
    ageMonths,
    termMonths,
    decodedMethod: decoded.decodedMethod,
    reason,
    exclusionAdvisory,
    evaluatedAt: new Date().toISOString(),
    recommendedWarrantyStatus,
  };
}

/**
 * Automatically evaluates and attaches warranty adjudication to a JobCard.
 */
export function autoAdjudicateJobCard(job: JobCard, referenceDate?: Date): JobCard {
  const result = adjudicateWarranty(job.tool, {
    referenceDate,
    grievanceCategory: job.serviceReq?.grievanceCategory,
    detailedComplaint: job.serviceReq?.detailedComplaint,
  });

  const { recommendedWarrantyStatus: _, ...adjudication } = result;

  return {
    ...job,
    tool: {
      ...job.tool,
      warrantyFlag: result.flag,
      warrantyAdjudication: adjudication,
    },
  };
}
