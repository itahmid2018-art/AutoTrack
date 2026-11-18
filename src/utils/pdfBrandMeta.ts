import { BusinessSettings } from '../types';
import type { PdfBrandMeta } from './generatePdf';

/**
 * Builds the branding metadata for generated PDFs from the live business
 * settings. Without this, `generateJobCardPdf` falls back to hardcoded
 * placeholder branding and ignores the configured center details.
 */
export function buildPdfBrandMeta(
  settings: BusinessSettings,
  portalOrigin?: string
): PdfBrandMeta {
  const origin =
    portalOrigin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : undefined);

  return {
    centerName: settings.centerName,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    currencySymbol: settings.currencySymbol,
    portalOrigin: origin,
  };
}
