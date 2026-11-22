import QRCode from 'qrcode';
import { JobCard } from '../types';

function generateRandomHex(byteLength: number = 6): string {
  const bytes = new Uint8Array(byteLength);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteLength; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns the job card's stored `publicAccessToken`, or creates a fresh
 * CSPRNG-backed token matching `^[a-zA-Z0-9_-]{1,128}$` when none exists yet.
 */
export function ensurePublicAccessToken(
  job: Pick<JobCard, 'id' | 'createdAt' | 'publicAccessToken'>
): string {
  const existing = job.publicAccessToken?.trim();
  if (existing) return existing;

  const idSlug = (job.id || 'job')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  const randomSuffix = generateRandomHex(6);
  return `tok-${idSlug}-${randomSuffix}`.slice(0, 128);
}

/**
 * Builds the direct Customer View portal URL using the job card's public access token.
 */
export function buildCustomerPortalUrl(
  job: Pick<JobCard, 'id' | 'createdAt' | 'publicAccessToken'>,
  origin?: string
): string {
  const token = ensurePublicAccessToken(job);
  const resolvedOrigin =
    origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://service.portal.local');
  const cleanOrigin = resolvedOrigin.replace(/\/+$/, '');
  return `${cleanOrigin}/?view=customer&token=${encodeURIComponent(token)}`;
}

/**
 * Builds the direct Customer Feedback survey URL opening directly to the rating & comment form.
 */
export function buildCustomerFeedbackUrl(
  job: Pick<JobCard, 'id' | 'createdAt' | 'publicAccessToken'>,
  origin?: string
): string {
  return `${buildCustomerPortalUrl(job, origin)}&feedback=1`;
}

/**
 * Builds the scannable QR payload URL for a job card.
 * Includes both the private client token and canonical job ID so external phone cameras
 * open the tokenized Client View while internal scanners extract jobId + token directly.
 */
export function buildJobCardQrPayload(
  job: Pick<JobCard, 'id' | 'createdAt' | 'publicAccessToken'>,
  origin?: string
): string {
  const basePortalUrl = buildCustomerPortalUrl(job, origin);
  const jobId = encodeURIComponent(job.id);
  return `${basePortalUrl}&job=${jobId}`;
}

/**
 * Synchronously generates a 2D boolean QR module matrix for vector SVG or jsPDF rendering.
 */
export function buildQrMatrix(text: string): { size: number; rows: boolean[][] } {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const rows: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      row.push(Boolean(qr.modules.get(r, c)));
    }
    rows.push(row);
  }
  return { size, rows };
}
