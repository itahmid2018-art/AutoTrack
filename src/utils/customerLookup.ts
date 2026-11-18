import { JobCard, JobStatus } from '../types';
import { getEffectiveJobBilling } from './billing';

export interface PublicJobStatusSummary {
  id: string;
  customerFirstName: string;
  maskedPhone: string;
  phoneLast4: string;
  hasCompany: boolean;
  customerCompany?: string;
  toolBrand: string;
  toolCategory: string;
  toolModel: string;
  toolSerialMasked: string;
  voltageRating: string;
  warrantyFlag: 'In-Warranty' | 'Out-of-Warranty';
  warrantyStatusLabel: string;
  accessoriesReceived: string[];
  grievanceCategory: string;
  intakeDate: string;
  promisedCompletion: string;
  status: JobStatus;
  priority: string;
  estimatedTotal: number;
  partsCount: number;
  stageHistory: { status: JobStatus; enteredAt: string }[];
  updatedAt: string;
  verifiedByTokenOrPhone: boolean;
  /**
   * Full record backing the customer receipt PDF. Populated ONLY on a verified
   * lookup (valid token, or job ID plus matching phone last-4). Never render
   * fields from this object in the unverified path.
   */
  _pdfRecord?: JobCard;
}

/**
 * Discriminated lookup result so the UI can distinguish "you need to verify"
 * from "nothing matched" instead of showing a single misleading message.
 */
export type CustomerLookupResult =
  | { status: 'found'; summary: PublicJobStatusSummary }
  | { status: 'verification-required'; jobId: string }
  | { status: 'verification-failed'; jobId: string }
  | { status: 'not-found' };

/**
 * Builds the sanitized view model for the customer portal.
 *
 * `verifiedByTokenOrPhone` MUST only be true after the caller has proven
 * possession of the public access token or the matching phone last-4.
 */
export function sanitizeJobForCustomer(
  job: JobCard,
  verifiedByTokenOrPhone: boolean
): PublicJobStatusSummary {
  const digits = (job.customerPhone || '').replace(/\D/g, '');
  const phoneLast4 = digits.slice(-4);
  const maskedPhone = phoneLast4 ? `•••-•••-${phoneLast4}` : 'On file';
  const serial = job.tool.serialNumber || 'N/A';
  const toolSerialMasked =
    serial.length > 5 && !verifiedByTokenOrPhone
      ? `${serial.slice(0, 3)}••••${serial.slice(-3)}`
      : serial;
  const warrantyFlag =
    job.tool.warrantyFlag ||
    job.tool.warrantyAdjudication?.flag ||
    (job.tool.warrantyStatus === 'Out of Warranty' ? 'Out-of-Warranty' : 'In-Warranty');

  return {
    id: job.id,
    customerFirstName: (job.customerName || 'Customer').split(' ')[0],
    maskedPhone,
    phoneLast4,
    hasCompany: Boolean(job.customerCompany),
    customerCompany: verifiedByTokenOrPhone ? job.customerCompany : undefined,
    toolBrand: job.tool.brand,
    toolCategory: job.tool.category,
    toolModel: job.tool.modelNumber,
    toolSerialMasked,
    voltageRating: job.tool.voltageRating,
    warrantyFlag,
    warrantyStatusLabel: job.tool.warrantyStatus,
    accessoriesReceived: job.tool.accessoriesReceived || [],
    grievanceCategory: job.serviceReq.grievanceCategory,
    intakeDate: job.intakeDate,
    promisedCompletion: job.promisedCompletion,
    status: job.status,
    priority: job.priority,
    estimatedTotal: getEffectiveJobBilling(job).totalAmount,
    partsCount: job.parts ? job.parts.length : 0,
    stageHistory: job.stageHistory || [{ status: job.status, enteredAt: job.intakeDate }],
    updatedAt: job.updatedAt,
    verifiedByTokenOrPhone,
    // Only attach the full record once the caller has proven possession of the
    // token or the matching phone digits.
    _pdfRecord: verifiedByTokenOrPhone ? job : undefined,
  };
}

/**
 * Public portal lookup. A successful result ALWAYS requires either:
 *   - a valid, unguessable public access token, or
 *   - a job ID plus the matching last 4 digits of the intake phone number.
 * A bare job ID returns `verification-required` and exposes no data.
 */
export function lookupCustomerJob(
  jobCards: JobCard[],
  query: string,
  phoneLast4?: string
): CustomerLookupResult {
  const q = query.trim().toLowerCase();
  if (!q) return { status: 'not-found' };

  const matchedByToken = jobCards.find(
    (job) => job.publicAccessToken && job.publicAccessToken.toLowerCase() === q
  );
  if (matchedByToken) {
    return { status: 'found', summary: sanitizeJobForCustomer(matchedByToken, true) };
  }

  const matchedById = jobCards.find((job) => job.id.toLowerCase() === q);
  if (!matchedById) return { status: 'not-found' };

  const cleanLast4 = (phoneLast4 || '').replace(/\D/g, '').slice(-4);
  if (cleanLast4.length !== 4) {
    return { status: 'verification-required', jobId: matchedById.id };
  }

  const jobPhoneLast4 = (matchedById.customerPhone || '').replace(/\D/g, '').slice(-4);
  if (cleanLast4 !== jobPhoneLast4) {
    return { status: 'verification-failed', jobId: matchedById.id };
  }

  return { status: 'found', summary: sanitizeJobForCustomer(matchedById, true) };
}
