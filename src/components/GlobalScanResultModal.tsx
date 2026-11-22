import React from 'react';
import { BarcodeScanResult, ToolHistoryMatch, parseProductQrPayload } from '../utils/barcodeSerialParser';
import { QrScannerRole, resolveJobQrScanAccess } from '../utils/qrRoleAccess';
import { InventoryItem, JobCard } from '../types';
import {
  QrCode,
  X,
  Package,
  History,
  ExternalLink,
  FilePlus2,
  Search,
  ShieldCheck,
  Lock,
  MessageSquare,
} from 'lucide-react';

interface GlobalScanResultModalProps {
  scanResult: BarcodeScanResult;
  matchedInventory: InventoryItem | null;
  historyMatch: ToolHistoryMatch;
  jobCards: JobCard[];
  role: QrScannerRole;
  allowRoleSwitch?: boolean;
  onRoleChange?: (role: QrScannerRole) => void;
  onClose: () => void;
  onPrefillIntake: (result: BarcodeScanResult) => void;
  onOpenInventoryLookup: (code: string) => void;
  onSelectJob: (job: JobCard) => void;
  onOpenClientPortalJob: (jobId: string, token?: string) => void;
  onRescan: () => void;
}

export const GlobalScanResultModal: React.FC<GlobalScanResultModalProps> = ({
  scanResult,
  matchedInventory,
  historyMatch,
  jobCards,
  role,
  allowRoleSwitch = true,
  onRoleChange,
  onClose,
  onPrefillIntake,
  onOpenInventoryLookup,
  onSelectJob,
  onOpenClientPortalJob,
  onRescan,
}) => {
  const parsed = parseProductQrPayload(scanResult.rawValue);
  const access = resolveJobQrScanAccess({
    scanResult,
    jobCards,
    role,
    matchedInventory,
    historyMatch,
  });

  const displayCode =
    (access.canViewInventory ? matchedInventory?.sku : undefined) ||
    access.scannedJobId ||
    scanResult.serialNumber ||
    parsed.jobId ||
    scanResult.detectedSku ||
    scanResult.rawValue;

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/60 dark:bg-zinc-950/85 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="global-scan-result-title"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 font-mono">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-300 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-emerald-300 dark:border-emerald-700/60 text-emerald-700 dark:text-emerald-400 shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="global-scan-result-title" className="text-sm font-bold text-zinc-950 dark:text-white uppercase truncate">
                Scanned Code: {displayCode}
              </h2>
              <p className="text-[11px] text-zinc-700 dark:text-zinc-400 font-sans">
                {scanResult.format} · {scanResult.method}
                {scanResult.detectedModelNumber ? ` · Model ${scanResult.detectedModelNumber}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-zinc-600 dark:text-zinc-500 hover:text-zinc-950 dark:hover:text-white p-1 shrink-0"
            aria-label="Close scan result"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role Scope Indicator & Optional Role Switcher */}
        <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 font-sans text-[11px] text-zinc-700 dark:text-zinc-300">
            {role === 'internal_admin' ? (
              <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
            ) : (
              <Lock className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
            )}
            <span>
              {role === 'internal_admin'
                ? 'Internal Admin: Full job card, inventory & intake access'
                : 'Client Role: View-only status & reply for matched Job ID'}
            </span>
          </div>

          {allowRoleSwitch && onRoleChange && (
            <div className="flex items-center gap-1 p-0.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg">
              <button
                type="button"
                onClick={() => onRoleChange('internal_admin')}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors ${
                  role === 'internal_admin'
                    ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950'
                    : 'text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                Internal Admin
              </button>
              <button
                type="button"
                onClick={() => onRoleChange('customer')}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors ${
                  role === 'customer'
                    ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950'
                    : 'text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                Client View
              </button>
            </div>
          )}
        </div>

        {/* CLIENT ROLE VIEW (Restricted to single scanned Job ID) */}
        {role === 'customer' ? (
          access.clientSummary ? (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-300 dark:border-zinc-800 pb-2">
                <div>
                  <div className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400">
                    Verified Ticket Match
                  </div>
                  <div className="text-sm font-bold text-zinc-950 dark:text-white">
                    {access.clientSummary.id}
                  </div>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100">
                  {access.clientSummary.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-sans">
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400 block">Equipment</span>
                  <span className="font-semibold text-zinc-950 dark:text-white">
                    {access.clientSummary.toolBrand} {access.clientSummary.toolModel}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400 block">Promised Target</span>
                  <span className="font-semibold text-zinc-950 dark:text-white tabular-nums">
                    {access.clientSummary.promisedCompletion}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400 block">Client Record</span>
                  <span className="font-semibold text-zinc-950 dark:text-white">
                    {access.clientSummary.customerFirstName} ({access.clientSummary.maskedPhone})
                  </span>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400 block">Estimated Total</span>
                  <span className="font-semibold text-zinc-950 dark:text-white font-mono tabular-nums">
                    ${access.clientSummary.estimatedTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {!access.verifiedByToken && (
                <p className="text-[11px] text-amber-800 dark:text-amber-300 font-sans">
                  Phone last-4 verification will be required in the Client Portal to unlock PDF download or send a ticket reply.
                </p>
              )}

              <button
                type="button"
                onClick={() =>
                  onOpenClientPortalJob(
                    access.clientSummary!.id,
                    access.verifiedByToken ? access.clientSummary!.publicAccessToken : undefined
                  )
                }
                className="w-full py-2.5 px-4 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Open View-Only Status &amp; Respond</span>
              </button>
            </div>
          ) : (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-amber-300 dark:border-amber-800/70 rounded-xl text-xs text-zinc-800 dark:text-zinc-200 font-sans space-y-1.5">
              <div className="font-mono font-bold text-amber-800 dark:text-amber-300 uppercase">
                Restricted Client Scope
              </div>
              <p>{access.denialReason}</p>
            </div>
          )
        ) : (
          <>
            {/* INTERNAL ADMIN: Matched Inventory Item */}
            {access.accessibleInventory ? (
              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-emerald-300 dark:border-emerald-700/60 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    <span>Matched Inventory Spare Part</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-white dark:bg-zinc-900 border border-zinc-400 dark:border-zinc-700 text-zinc-950 dark:text-white font-bold tabular-nums">
                    {access.accessibleInventory.stockQty} {access.accessibleInventory.unit}
                  </span>
                </div>
                <div className="text-sm font-bold text-zinc-950 dark:text-white font-sans">
                  {access.accessibleInventory.name}
                </div>
                <div className="text-[11px] text-zinc-700 dark:text-zinc-400 tabular-nums">
                  SKU: {access.accessibleInventory.sku} · Bin: {access.accessibleInventory.binLocation} · $
                  {access.accessibleInventory.unitPrice.toFixed(2)}
                </div>
                <button
                  type="button"
                  onClick={() => onOpenInventoryLookup(access.accessibleInventory!.sku)}
                  className="mt-1 px-3 py-1.5 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold rounded-lg text-[11px] inline-flex items-center gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Open in Spare Parts Inventory</span>
                </button>
              </div>
            ) : (
              <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl text-[11px] text-zinc-700 dark:text-zinc-400 font-sans flex items-center justify-between gap-2">
                <span>No exact spare part SKU matched &quot;{displayCode}&quot;.</span>
                <button
                  type="button"
                  onClick={() => onOpenInventoryLookup(displayCode)}
                  className="font-mono font-bold text-zinc-950 dark:text-white underline shrink-0"
                >
                  Search Inventory
                </button>
              </div>
            )}

            {/* INTERNAL ADMIN: Matched Tool & Job Card History */}
            {access.accessibleJobs.length > 0 && (
              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl space-y-2 text-xs">
                <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  <span>Matched Service Job Cards ({access.accessibleJobs.length})</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {access.accessibleJobs.slice(0, 4).map((job) => (
                    <div
                      key={job.id}
                      className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-zinc-950 dark:text-white flex items-center gap-1.5">
                          <span>{job.id}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-400 dark:border-zinc-700 text-zinc-800 dark:text-zinc-300">
                            {job.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-700 dark:text-zinc-400 font-sans truncate">
                          {job.tool.brand} {job.tool.modelNumber} · Client: {job.customerName}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelectJob(job)}
                        className="px-2.5 py-1.5 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0"
                      >
                        <span>Open Full Job Card</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-300 dark:border-zinc-800">
          <button
            type="button"
            onClick={onRescan}
            className="px-3 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 rounded-xl flex items-center gap-1.5"
          >
            <QrCode className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
            <span>Scan Another Code</span>
          </button>

          {access.canPrefillIntake && (
            <button
              type="button"
              onClick={() => onPrefillIntake(scanResult)}
              className="px-4 py-2 text-xs font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl shadow flex items-center gap-1.5"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>Prefill Tool Intake Form</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
