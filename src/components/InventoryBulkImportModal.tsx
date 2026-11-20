import React, { useMemo, useRef, useState } from 'react';
import { InventoryItem } from '../types';
import {
  InventoryImportMode,
  SAMPLE_INVENTORY_CSV,
  applyInventoryImport,
  parseInventorySpreadsheetText,
} from '../utils/inventoryImportParser';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';

interface InventoryBulkImportModalProps {
  inventory: InventoryItem[];
  onClose: () => void;
  onCommitInventory: (
    nextInventory: InventoryItem[],
    summary: { addedCount: number; updatedCount: number; skippedCount: number }
  ) => void;
}

export const InventoryBulkImportModal: React.FC<InventoryBulkImportModalProps> = ({
  inventory,
  onClose,
  onCommitInventory,
}) => {
  const [rawInput, setRawInput] = useState('');
  const [importMode, setImportMode] = useState<InventoryImportMode>('upsert');
  const [skipInvalidRows, setSkipInvalidRows] = useState(true);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'issues'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedResult = useMemo(
    () => parseInventorySpreadsheetText(rawInput, inventory, importMode),
    [rawInput, inventory, importMode]
  );

  const visiblePreviewRows = useMemo(() => {
    if (previewFilter === 'valid') return parsedResult.validRows;
    if (previewFilter === 'issues') return parsedResult.invalidRows;
    return parsedResult.allRows;
  }, [parsedResult, previewFilter]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRawInput(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([SAMPLE_INVENTORY_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'spare_parts_inventory_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleApplyImport = () => {
    if (parsedResult.validRows.length === 0) return;
    if (!skipInvalidRows && parsedResult.invalidRows.length > 0) return;

    const { nextInventory, addedCount, updatedCount, skippedCount } = applyInventoryImport(
      inventory,
      parsedResult.validRows,
      importMode
    );
    onCommitInventory(nextInventory, { addedCount, updatedCount, skippedCount });
  };

  const canCommit =
    parsedResult.validRows.length > 0 &&
    (skipInvalidRows || parsedResult.invalidRows.length === 0);

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/60 dark:bg-zinc-950/85 backdrop-blur flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-mono">
        {/* Header */}
        <div className="p-5 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-300 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-400 dark:border-zinc-700 text-emerald-700 dark:text-emerald-400 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-zinc-950 dark:text-white uppercase tracking-tight">
                Bulk Inventory Import (Excel / CSV Paste)
              </h3>
              <p className="text-xs text-zinc-700 dark:text-zinc-400 font-sans mt-0.5">
                Copy cells directly from Excel or Google Sheets (tab-separated) or paste CSV rows to add new SKUs or update stock counts.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close bulk inventory import"
            className="p-2 rounded-lg text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Toolbar & Mode Selection */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 text-xs font-bold text-white dark:text-zinc-950 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-lg inline-flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload CSV / TSV</span>
              </button>

              <button
                type="button"
                onClick={() => setRawInput(SAMPLE_INVENTORY_CSV)}
                className="px-3 py-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-emerald-300 dark:border-emerald-700/60 rounded-lg"
              >
                Load 10 Sample Bosch Parts
              </button>

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-3 py-1.5 text-xs font-bold text-zinc-900 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 rounded-lg inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV Template</span>
              </button>

              {rawInput && (
                <button
                  type="button"
                  onClick={() => setRawInput('')}
                  className="px-2.5 py-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Merge Mode Segmented Control */}
            <div className="flex items-center gap-1 p-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg">
              {(
                [
                  { id: 'upsert', label: 'Update + Add New' },
                  { id: 'replenish', label: 'Add Qty to Stock' },
                  { id: 'insertOnly', label: 'New SKUs Only' },
                ] as Array<{ id: InventoryImportMode; label: string }>
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setImportMode(m.id)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors whitespace-nowrap ${
                    importMode === m.id
                      ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950'
                      : 'text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Paste Textarea */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-700 dark:text-zinc-400">
              <span>
                Supported columns: <strong className="text-zinc-900 dark:text-zinc-200">sku, barcode, name, category, brand, compatibleModels, unitPrice, costPrice, stockQty, minStockThreshold, unit, binLocation</strong>
              </span>
              {parsedResult.totalRows > 0 && (
                <span className="text-emerald-700 dark:text-emerald-400">
                  Detected {parsedResult.delimiter === 'tab' ? 'Excel TSV (Tabs)' : 'CSV (Commas)'} · {parsedResult.hasHeaderRow ? 'Header Row Mapped' : 'Positional Columns'}
                </span>
              )}
            </div>
            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              rows={6}
              placeholder={`Paste spreadsheet rows copied from Excel, Google Sheets, or CSV...\n\nExample:\nsku,name,stockQty,unitPrice,binLocation\n1617014144,Carbon Brush Set,48,12.50,BIN-A-04-12`}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 focus:border-zinc-700 dark:focus:border-zinc-500 rounded-xl p-3 text-xs text-zinc-950 dark:text-zinc-100 placeholder-zinc-500 dark:placeholder-zinc-600 focus:outline-none font-mono"
            />
          </div>

          {/* Validation & Diff Preview Grid */}
          {parsedResult.totalRows > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl p-3 text-xs">
                <div className="flex flex-wrap items-center gap-4 tabular-nums">
                  <span className="text-zinc-800 dark:text-zinc-300">
                    Parsed: <strong className="text-zinc-950 dark:text-white">{parsedResult.totalRows}</strong>
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400">
                    New SKUs: <strong>{parsedResult.newCount}</strong>
                  </span>
                  <span className="text-sky-700 dark:text-sky-400">
                    Updates: <strong>{parsedResult.updateCount}</strong>
                  </span>
                  {parsedResult.skipCount > 0 && (
                    <span className="text-zinc-700 dark:text-zinc-400">
                      Skipped Existing: <strong>{parsedResult.skipCount}</strong>
                    </span>
                  )}
                  <span className={parsedResult.invalidRows.length > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-zinc-600 dark:text-zinc-500'}>
                    Issues: <strong>{parsedResult.invalidRows.length}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 p-1 rounded-lg border border-zinc-300 dark:border-zinc-800">
                  {(
                    [
                      { id: 'all', label: `All (${parsedResult.totalRows})` },
                      { id: 'valid', label: `Valid (${parsedResult.validRows.length})` },
                      { id: 'issues', label: `Issues (${parsedResult.invalidRows.length})` },
                    ] as Array<{ id: 'all' | 'valid' | 'issues'; label: string }>
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPreviewFilter(tab.id)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${
                        previewFilter === tab.id
                          ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950'
                          : 'text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse tabular-nums">
                  <thead className="bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-400 text-[10px] uppercase sticky top-0 border-b border-zinc-300 dark:border-zinc-800">
                    <tr>
                      <th className="py-2 px-3">Row</th>
                      <th className="py-2 px-3">Action</th>
                      <th className="py-2 px-3">SKU</th>
                      <th className="py-2 px-3">Part Name</th>
                      <th className="py-2 px-3">Bin</th>
                      <th className="py-2 px-3 text-right">Price</th>
                      <th className="py-2 px-3 text-right">Stock Qty</th>
                      <th className="py-2 px-3">Validation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/70">
                    {visiblePreviewRows.map((row) => (
                      <tr key={row.rowNumber} className="hover:bg-zinc-100 dark:hover:bg-zinc-900/50">
                        <td className="py-2 px-3 text-zinc-600 dark:text-zinc-500">#{row.rowNumber}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`text-[10px] font-bold ${
                              row.action === 'NEW'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : row.action === 'UPDATE'
                                ? 'text-sky-700 dark:text-sky-400'
                                : row.action === 'SKIP'
                                ? 'text-zinc-700 dark:text-zinc-400'
                                : 'text-rose-700 dark:text-rose-400'
                            }`}
                          >
                            {row.action}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-bold text-zinc-950 dark:text-white">{row.data.sku}</td>
                        <td className="py-2 px-3 font-sans text-zinc-900 dark:text-zinc-200 max-w-[220px] truncate">
                          {row.data.name}
                        </td>
                        <td className="py-2 px-3 text-zinc-700 dark:text-zinc-400">{row.data.binLocation}</td>
                        <td className="py-2 px-3 text-right text-zinc-950 dark:text-white">
                          ${row.data.unitPrice.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right text-zinc-900 dark:text-zinc-200">
                          {row.action === 'UPDATE' && importMode === 'replenish' && row.previousStockQty !== undefined ? (
                            <span className="text-emerald-700 dark:text-emerald-400">
                              {row.previousStockQty} + {row.data.stockQty}
                            </span>
                          ) : (
                            <span>
                              {row.data.stockQty} {row.data.unit}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-sans">
                          {row.isValid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>{row.warnings[0] || 'Ready'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 text-[11px]">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{row.errors.join(', ')}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {parsedResult.invalidRows.length > 0 && (
                <label className="inline-flex items-center gap-2 text-xs text-zinc-800 dark:text-zinc-300 font-sans cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipInvalidRows}
                    onChange={(e) => setSkipInvalidRows(e.target.checked)}
                    className="rounded border-zinc-400 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-emerald-500 focus:ring-0"
                  />
                  <span>
                    Skip invalid rows and import {parsedResult.validRows.length} valid inventory items
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-300 dark:border-zinc-800 flex items-center justify-between gap-3">
          <span className="text-[11px] text-zinc-600 dark:text-zinc-500 font-sans">
            Matches existing items by SKU (case-insensitive) and syncs changes to local storage, Service Worker cache, and Firestore.
          </span>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canCommit}
              onClick={handleApplyImport}
              className="px-5 py-2 text-xs font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl shadow transition-colors"
            >
              Apply Import ({parsedResult.validRows.length} Valid SKUs)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
