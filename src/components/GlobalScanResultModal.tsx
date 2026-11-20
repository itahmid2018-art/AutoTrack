import React from 'react';
import { BarcodeScanResult, ToolHistoryMatch, parseProductQrPayload } from '../utils/barcodeSerialParser';
import { InventoryItem, JobCard } from '../types';
import { QrCode, X, Package, History, Wrench, ExternalLink, FilePlus2, Search } from 'lucide-react';

interface GlobalScanResultModalProps {
  scanResult: BarcodeScanResult;
  matchedInventory: InventoryItem | null;
  historyMatch: ToolHistoryMatch;
  onClose: () => void;
  onPrefillIntake: (result: BarcodeScanResult) => void;
  onOpenInventoryLookup: (code: string) => void;
  onSelectJob: (job: JobCard) => void;
  onRescan: () => void;
}

export const GlobalScanResultModal: React.FC<GlobalScanResultModalProps> = ({
  scanResult,
  matchedInventory,
  historyMatch,
  onClose,
  onPrefillIntake,
  onOpenInventoryLookup,
  onSelectJob,
  onRescan,
}) => {
  const parsed = parseProductQrPayload(scanResult.rawValue);
  const displayCode =
    matchedInventory?.sku ||
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
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-emerald-300 dark:border-emerald-700/60 text-emerald-700 dark:text-emerald-400">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 id="global-scan-result-title" className="text-sm font-bold text-zinc-950 dark:text-white uppercase">
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
            className="text-zinc-600 dark:text-zinc-500 hover:text-zinc-950 dark:hover:text-white p-1"
            aria-label="Close scan result"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Matched Inventory Item */}
        {matchedInventory ? (
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-emerald-300 dark:border-emerald-700/60 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" />
                <span>Matched Inventory Spare Part</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-white dark:bg-zinc-900 border border-zinc-400 dark:border-zinc-700 text-zinc-950 dark:text-white font-bold">
                {matchedInventory.stockQty} {matchedInventory.unit}
              </span>
            </div>
            <div className="text-sm font-bold text-zinc-950 dark:text-white font-sans">{matchedInventory.name}</div>
            <div className="text-[11px] text-zinc-700 dark:text-zinc-400">
              SKU: {matchedInventory.sku} · Bin: {matchedInventory.binLocation} · ${matchedInventory.unitPrice.toFixed(2)}
            </div>
            <button
              type="button"
              onClick={() => onOpenInventoryLookup(matchedInventory.sku)}
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

        {/* Matched Tool & Job Card History */}
        {historyMatch.matchingJobs.length > 0 && (
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl space-y-2 text-xs">
            <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              <span>Matched Tool Service History ({historyMatch.matchingJobs.length})</span>
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {historyMatch.matchingJobs.slice(0, 4).map((job) => (
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
                    className="px-2.5 py-1 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 text-emerald-800 dark:text-emerald-300 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0"
                  >
                    <span>Open</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
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

          <button
            type="button"
            onClick={() => onPrefillIntake(scanResult)}
            className="px-4 py-2 text-xs font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl shadow flex items-center gap-1.5"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>Prefill Tool Intake Form</span>
          </button>
        </div>
      </div>
    </div>
  );
};
