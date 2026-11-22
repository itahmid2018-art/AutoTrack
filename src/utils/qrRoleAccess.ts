import { InventoryItem, JobCard } from '../types';
import {
  BarcodeScanResult,
  ToolHistoryMatch,
  parseProductQrPayload,
} from './barcodeSerialParser';
import {
  PublicJobStatusSummary,
  sanitizeJobForCustomer,
} from '../components/CustomerView';

export type QrScannerRole = 'internal_admin' | 'customer';

export interface RoleScopedJobScanAccess {
  role: QrScannerRole;
  scannedJobId?: string;
  scannedToken?: string;
  primaryJob: JobCard | null;
  accessibleJobs: JobCard[];
  clientSummary: PublicJobStatusSummary | null;
  verifiedByToken: boolean;
  canViewFullJobCard: boolean;
  canEditJob: boolean;
  canRespondToJob: boolean;
  canViewInventory: boolean;
  canPrefillIntake: boolean;
  accessibleInventory: InventoryItem | null;
  denialReason?: string;
}

export interface ResolveJobQrScanAccessParams {
  scanResult: BarcodeScanResult;
  jobCards: JobCard[];
  role: QrScannerRole;
  matchedInventory: InventoryItem | null;
  historyMatch: ToolHistoryMatch;
}

/**
 * Resolves role-based accessibility for a scanned job card QR code or serial/barcode.
 * - Client (`customer`): strict view-only + response access scoped strictly to their single matched jobID.
 *   Never exposes internal inventory pricing/stock, intake creation, or unrelated service tickets.
 * - Internal Admin (`internal_admin`): full workshop access to inspect and edit matched job cards,
 *   spare parts inventory, and intake prefill.
 */
export function resolveJobQrScanAccess({
  scanResult,
  jobCards,
  role,
  matchedInventory,
  historyMatch,
}: ResolveJobQrScanAccessParams): RoleScopedJobScanAccess {
  const parsed = parseProductQrPayload(scanResult.rawValue);
  const scannedJobId = parsed.jobId?.trim();
  const scannedToken = parsed.token?.trim();

  const exactByToken = scannedToken
    ? jobCards.find(
        (job) =>
          Boolean(job.publicAccessToken) &&
          job.publicAccessToken!.toLowerCase() === scannedToken.toLowerCase()
      ) || null
    : null;

  const exactById = scannedJobId
    ? jobCards.find((job) => job.id.toUpperCase() === scannedJobId.toUpperCase()) || null
    : null;

  const exactMatch = exactByToken || exactById || null;

  const orderedAdminJobs = exactMatch
    ? [
        exactMatch,
        ...historyMatch.matchingJobs.filter((j) => j.id !== exactMatch.id),
      ]
    : historyMatch.matchingJobs;

  if (role === 'internal_admin') {
    return {
      role,
      scannedJobId: exactMatch?.id || scannedJobId,
      scannedToken,
      primaryJob: orderedAdminJobs[0] || null,
      accessibleJobs: orderedAdminJobs,
      clientSummary: null,
      verifiedByToken: Boolean(exactByToken),
      canViewFullJobCard: true,
      canEditJob: true,
      canRespondToJob: false,
      canViewInventory: true,
      canPrefillIntake: true,
      accessibleInventory: matchedInventory,
    };
  }

  // Client role: only allow access to their single specific Job ID.
  // Never expose internal inventory, intake workflows, or multi-client job lists.
  const singleHistoryJob =
    !exactMatch && historyMatch.matchingJobs.length === 1 && !matchedInventory
      ? historyMatch.matchingJobs[0]
      : null;
  const targetClientJob = exactMatch || singleHistoryJob;

  if (!targetClientJob) {
    return {
      role,
      scannedJobId,
      scannedToken,
      primaryJob: null,
      accessibleJobs: [],
      clientSummary: null,
      verifiedByToken: false,
      canViewFullJobCard: false,
      canEditJob: false,
      canRespondToJob: false,
      canViewInventory: false,
      canPrefillIntake: false,
      accessibleInventory: null,
      denialReason: matchedInventory
        ? 'Spare part barcodes are restricted to workshop staff. Scan your Job Card QR code to view your repair status.'
        : historyMatch.matchingJobs.length > 1
        ? 'Multiple service tickets match that serial number. Scan your specific Job Card QR code to view your ticket.'
        : 'No matching service ticket was found for this QR code.',
    };
  }

  const verifiedByToken = Boolean(
    scannedToken &&
      targetClientJob.publicAccessToken &&
      targetClientJob.publicAccessToken.toLowerCase() === scannedToken.toLowerCase()
  );

  return {
    role,
    scannedJobId: targetClientJob.id,
    scannedToken,
    primaryJob: targetClientJob,
    accessibleJobs: [targetClientJob],
    clientSummary: sanitizeJobForCustomer(targetClientJob, verifiedByToken),
    verifiedByToken,
    canViewFullJobCard: false,
    canEditJob: false,
    canRespondToJob: true,
    canViewInventory: false,
    canPrefillIntake: false,
    accessibleInventory: null,
  };
}
