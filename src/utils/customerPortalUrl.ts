import QRCode from 'qrcode';
import { JobCard } from '../types';

function hashTokenSeed(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(6, '0');
}

/**
 * Returns the job card's public access token or generates a deterministic,
 * unique-per-job token so QR codes and shared Customer View links always resolve.
 */
export function ensurePublicAccessToken(
  job: Pick<JobCard, 'id' | 'createdAt' | 'publicAccessToken'>
): string {
  const existing = job.publicAccessToken?.trim();
  if (existing) return existing;

  const idSlug = (job.id || 'job')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const digest = hashTokenSeed(`${job.id}|${job.createdAt || ''}|bosch-portal`);
  return `tok-${idSlug}-${digest}`;
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
