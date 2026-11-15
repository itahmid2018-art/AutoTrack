import React, { useState, useRef, useEffect } from 'react';
import { RecurringMaintenance } from '../types';
import {
  Upload,
  Download,
  FileSpreadsheet,
  FileText,
  Check,
  AlertTriangle,
  AlertCircle,
  X,
  RefreshCw,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import {
  parseMaintenanceCsv,
  downloadMaintenanceCsvTemplate,
  SAMPLE_MAINTENANCE_CSV,
  CsvImportResult,
} from '../utils/maintenanceCsv';

interface BulkMaintenanceImportModalProps {
  onClose: () => void;
  onImport: (newSchedules: RecurringMaintenance[]) => void;
  existingCount: number;
  existingIds: Set<string>;
}

type InputTab = 'upload' | 'paste';
type FilterView = 'all' | 'valid' | 'invalid';

export const BulkMaintenanceImportModal: React.FC<BulkMaintenanceImportModalProps> = ({
  onClose,
  onImport,
  existingCount,
  existingIds,
}) => {
  const [activeTab, setActiveTab] = useState<InputTab>('upload');
  const [rawCsvText, setRawCsvText] = useState<string>('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [filterView, setFilterView] = useState<FilterView>('all');
  const [skipInvalid, setSkipInvalid] = useState<boolean>(true);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Parse CSV whenever rawCsvText changes
  useEffect(() => {
    if (!rawCsvText.trim()) {
      setImportResult(null);
      return;
    }

    try {
      const result = parseMaintenanceCsv(rawCsvText, existingCount, existingIds);
      setImportResult(result);
    } catch (err) {
      console.error('Error parsing CSV:', err);
    }
  }, [rawCsvText, existingCount, existingIds]);

  const handleFileSelect = (file: File) => {
    if (!file) return;
    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = typeof e.target?.result === 'string' ? e.target.result : '';
      setRawCsvText(content);
    };
    reader.readAsText(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleLoadSample = () => {
    setSelectedFileName('sample_client_maintenance.csv');
    setRawCsvText(SAMPLE_MAINTENANCE_CSV);
    setActiveTab('paste');
  };

  const handleClear = () => {
    setRawCsvText('');
    setSelectedFileName(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = () => {
    if (!importResult) return;
    const candidates = skipInvalid ? importResult.validRows : importResult.allRows;
    const recordsToImport = candidates.map((row) => row.data);

    if (recordsToImport.length === 0) return;

    setIsProcessing(true);
    onImport(recordsToImport);
    onClose();
  };

  const visibleRows = (() => {
    if (!importResult) return [];
    if (filterView === 'valid') return importResult.validRows;
    if (filterView === 'invalid') return importResult.invalidRows;
    return importResult.allRows;
  })();

  const validCount = importResult ? importResult.validRows.length : 0;
  const invalidCount = importResult ? importResult.invalidRows.length : 0;
  const totalCount = importResult ? importResult.totalRows : 0;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/85 backdrop-blur flex items-center justify-center p-3 sm:p-5 overflow-y-auto font-mono">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl flex flex-col space-y-4 max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white uppercase tracking-tight">
                Bulk CSV Import · Client Maintenance Schedules
              </h2>
              <p className="text-xs text-zinc-400 font-sans">
                Import client fleet maintenance schedules in bulk to accelerate digital transition.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Shortcuts Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 font-sans">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-xs font-semibold">Shortcuts:</span>
            <button
              type="button"
              onClick={handleLoadSample}
              className="px-2.5 py-1 text-xs font-bold font-mono text-zinc-950 bg-white hover:bg-zinc-200 rounded-lg transition-all flex items-center gap-1 shadow"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Load 5 Sample Client Schedules</span>
            </button>

            <button
              type="button"
              onClick={downloadMaintenanceCsvTemplate}
              className="px-2.5 py-1 text-xs font-bold font-mono text-zinc-200 bg-zinc-900 hover:bg-zinc-800 rounded-lg border border-zinc-700 transition-colors flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5 text-zinc-400" />
              <span>Download CSV Template</span>
            </button>
          </div>

          {rawCsvText && (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-zinc-400 hover:text-rose-300 font-mono underline"
            >
              Reset Input
            </button>
          )}
        </div>

        {/* Tab Toggle: File Upload vs Paste CSV Text */}
        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'upload'
                ? 'bg-white text-zinc-950 shadow'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload CSV File</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`flex-1 py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'paste'
                ? 'bg-white text-zinc-950 shadow'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Paste Raw CSV Text</span>
          </button>
        </div>

        {/* Input Work Area */}
        <div className="shrink-0">
          {activeTab === 'upload' ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-white bg-zinc-800/60'
                  : selectedFileName
                  ? 'border-emerald-500/60 bg-emerald-950/15'
                  : 'border-zinc-700 hover:border-zinc-500 bg-zinc-950/70'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={handleFileInputChange}
                className="hidden"
              />

              <div className="space-y-1.5">
                <Upload className="w-8 h-8 mx-auto text-zinc-400" />
                <div className="text-xs font-bold text-white">
                  {selectedFileName
                    ? `Loaded: ${selectedFileName}`
                    : 'Click to select CSV file, or drag and drop here'}
                </div>
                <p className="text-[11px] text-zinc-400 font-sans">
                  Supports Excel and Google Sheets CSV exports (.csv, comma-separated)
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-400 font-sans">
                <span>Paste header row and data rows below:</span>
                <span className="font-mono">
                  {rawCsvText ? `${rawCsvText.split('\n').filter(Boolean).length} lines` : 'Empty'}
                </span>
              </div>
              <textarea
                value={rawCsvText}
                onChange={(e) => setRawCsvText(e.target.value)}
                placeholder={`Client Name,Company,Phone,Email,Tool Brand,Tool Category,Model Number,Serial Number,Interval Months,Last Service Date,Next Due Date,Recommended Scope\n"Apex Industrial","Apex","+1 (555) 234-5678","service@apex.com","Bosch Professional","Demolition Breaker","GSH 11 E","SN-99120",6,"2026-05-15","2026-11-15","Gearbox repack"`}
                rows={5}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
          )}
        </div>

        {/* Live Validation & Data Preview */}
        {importResult && (
          <div className="flex-1 min-h-0 flex flex-col space-y-2.5 overflow-hidden">
            {/* KPI Summary & Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">Parsed Preview:</span>
                <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setFilterView('all')}
                    className={`px-2.5 py-0.5 rounded font-bold transition-colors ${
                      filterView === 'all' ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    All ({totalCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterView('valid')}
                    className={`px-2.5 py-0.5 rounded font-bold transition-colors ${
                      filterView === 'valid'
                        ? 'bg-emerald-400 text-zinc-950'
                        : 'text-emerald-400 hover:text-emerald-300'
                    }`}
                  >
                    Valid ({validCount})
                  </button>
                  {invalidCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterView('invalid')}
                      className={`px-2.5 py-0.5 rounded font-bold transition-colors ${
                        filterView === 'invalid'
                          ? 'bg-rose-500 text-white'
                          : 'text-rose-400 hover:text-rose-300'
                      }`}
                    >
                      Issues ({invalidCount})
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs font-sans text-zinc-300">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipInvalid}
                    onChange={(e) => setSkipInvalid(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-950 text-white"
                  />
                  <span>Skip invalid rows on import</span>
                </label>
              </div>
            </div>

            {/* Preview Grid Table */}
            <div className="flex-1 overflow-auto border border-zinc-800 rounded-xl bg-zinc-950 min-h-[160px]">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-900 text-zinc-400 text-[11px] uppercase border-b border-zinc-800 sticky top-0 z-10">
                  <tr>
                    <th className="p-2.5">Row</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Client &amp; Company</th>
                    <th className="p-2.5">Phone</th>
                    <th className="p-2.5">Tool Specification</th>
                    <th className="p-2.5">Serial No</th>
                    <th className="p-2.5">Interval / Due Date</th>
                    <th className="p-2.5">Recommended Scope</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80 text-zinc-300 text-[11px]">
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-zinc-500 font-sans">
                        No rows found matching filter.
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((row) => {
                      const item = row.data;
                      return (
                        <tr
                          key={row.rowNumber}
                          className={`hover:bg-zinc-900/60 transition-colors ${
                            !row.isValid ? 'bg-rose-950/20' : ''
                          }`}
                        >
                          <td className="p-2.5 font-bold text-zinc-500">{row.rowNumber}</td>
                          <td className="p-2.5">
                            {row.isValid ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1 w-fit">
                                <Check className="w-3 h-3" />
                                <span>Valid</span>
                              </span>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-700 flex items-center gap-1 w-fit">
                                  <AlertCircle className="w-3 h-3" />
                                  <span>Issue</span>
                                </span>
                                <div className="text-[10px] text-rose-400 font-sans">
                                  {row.errors.join(', ')}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="p-2.5">
                            <div className="font-bold text-white">{item.customerName}</div>
                            {item.customerCompany && (
                              <div className="text-[10px] text-zinc-400">{item.customerCompany}</div>
                            )}
                          </td>
                          <td className="p-2.5 text-zinc-300 tabular-nums">{item.customerPhone}</td>
                          <td className="p-2.5">
                            <div className="font-bold text-white">{item.modelNumber}</div>
                            <div className="text-[10px] text-zinc-400">
                              {item.toolBrand} · {item.toolCategory}
                            </div>
                          </td>
                          <td className="p-2.5 font-mono text-zinc-300">{item.serialNumber}</td>
                          <td className="p-2.5">
                            <div className="font-bold text-white tabular-nums">
                              {item.intervalMonths} Months
                            </div>
                            <div className="text-[10px] text-zinc-400 tabular-nums">
                              Due: {item.nextDueDate}
                            </div>
                          </td>
                          <td className="p-2.5 max-w-xs truncate font-sans text-zinc-300">
                            {item.recommendedServiceScope}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800 shrink-0">
          <div className="text-xs text-zinc-400 font-sans">
            {importResult && (
              <span>
                Ready to import{' '}
                <strong className="text-white font-mono">
                  {skipInvalid ? validCount : totalCount}
                </strong>{' '}
                schedules into tracker.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={!importResult || validCount === 0 || isProcessing}
              className="px-5 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 disabled:opacity-40 rounded-xl shadow transition-all flex items-center gap-2 active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>
                {isProcessing
                  ? 'Importing...'
                  : `Import ${skipInvalid ? validCount : totalCount} Schedules`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
