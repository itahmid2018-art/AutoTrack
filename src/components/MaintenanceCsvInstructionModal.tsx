import React, { useState } from 'react';
import {
  X,
  Download,
  Upload,
  FileSpreadsheet,
  Check,
  Copy,
  Info,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  STANDARD_7COL_MAINTENANCE_CSV,
  downloadStandard7ColTemplate,
} from '../utils/maintenanceCsv';

interface MaintenanceCsvInstructionModalProps {
  onClose: () => void;
  onTriggerUpload: () => void;
}

export const MaintenanceCsvInstructionModal: React.FC<MaintenanceCsvInstructionModalProps> = ({
  onClose,
  onTriggerUpload,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopySample = () => {
    navigator.clipboard.writeText(STANDARD_7COL_MAINTENANCE_CSV);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  const columns = [
    {
      name: 'customerName',
      required: true,
      type: 'String',
      example: '"Apex Industrial Construction"',
      notes: 'Client account or contractor company name.',
    },
    {
      name: 'toolBrand',
      required: false,
      type: 'String',
      example: '"Bosch Professional"',
      notes: 'Supported: Bosch Professional, Makita, DeWalt, Hilti, Milwaukee.',
    },
    {
      name: 'toolCategory',
      required: false,
      type: 'String',
      example: '"Rotary Hammer / SDS"',
      notes: 'E.g., Rotary Hammer, Angle Grinder, Demolition Breaker.',
    },
    {
      name: 'modelNumber',
      required: true,
      type: 'String',
      example: '"GBH 2-26 DFR"',
      notes: 'Manufacturer tool model code or catalogue reference.',
    },
    {
      name: 'serialNumber',
      required: false,
      type: 'String',
      example: '"SN-3611B67000"',
      notes: 'Tool serial number. Defaults to "N/A" if omitted.',
    },
    {
      name: 'intervalMonths',
      required: false,
      type: 'Number (3, 6, 12)',
      example: '6',
      notes: 'Service cycle in months. Defaults to 6 if omitted.',
    },
    {
      name: 'recommendedServiceScope',
      required: false,
      type: 'String',
      example: '"Carbon Brush & SDS Lubrication"',
      notes: 'Overhaul checklist and maintenance instructions.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/60 dark:bg-zinc-950/85 backdrop-blur flex items-center justify-center p-3 sm:p-5 overflow-y-auto font-mono">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl flex flex-col space-y-5 max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-300 dark:border-zinc-800 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-zinc-200 dark:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 rounded-xl text-zinc-950 dark:text-white">
              <FileSpreadsheet className="w-5 h-5 text-zinc-950 dark:text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-950 dark:text-white uppercase tracking-tight">
                Bulk CSV Import Format Specification
              </h2>
              <p className="text-xs text-zinc-700 dark:text-zinc-400 font-sans">
                Prepare your client fleet maintenance schedule using these standard columns.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white rounded-lg transition-colors"
            aria-label="Close instruction modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Scrollable Body */}
        <div className="space-y-4 overflow-y-auto pr-1 text-xs">
          
          {/* Summary Banner */}
          <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 p-3.5 rounded-xl flex items-start gap-3">
            <Info className="w-4 h-4 text-zinc-700 dark:text-zinc-400 shrink-0 mt-0.5" />
            <div className="font-sans text-zinc-800 dark:text-zinc-300 space-y-1">
              <p className="font-semibold text-zinc-950 dark:text-white">
                Expected 7-Column CSV Structure
              </p>
              <p className="text-zinc-700 dark:text-zinc-400 text-xs leading-relaxed">
                The import parser expects rows containing customerName, toolBrand, toolCategory, modelNumber, serialNumber, intervalMonths, and recommendedServiceScope.
              </p>
            </div>
          </div>

          {/* Expected Columns Table */}
          <div className="border border-zinc-300 dark:border-zinc-800 rounded-xl overflow-hidden bg-zinc-50 dark:bg-zinc-950">
            <div className="p-2.5 bg-white dark:bg-zinc-900 border-b border-zinc-300 dark:border-zinc-800 font-bold text-zinc-950 dark:text-white uppercase text-[11px] tracking-wide">
              Column Headers &amp; Validation Requirements
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-zinc-50 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-400 border-b border-zinc-300 dark:border-zinc-800">
                  <tr>
                    <th className="p-2.5 font-bold">Header Name</th>
                    <th className="p-2.5 font-bold">Requirement</th>
                    <th className="p-2.5 font-bold">Data Type</th>
                    <th className="p-2.5 font-bold">Sample Value</th>
                    <th className="p-2.5 font-bold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80 font-sans">
                  {columns.map((col) => (
                    <tr key={col.name} className="hover:bg-zinc-100 dark:hover:bg-zinc-900/30">
                      <td className="p-2.5 font-mono font-bold text-zinc-950 dark:text-white whitespace-nowrap">
                        {col.name}
                      </td>
                      <td className="p-2.5">
                        {col.required ? (
                          <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-zinc-950 dark:bg-white text-white dark:text-zinc-950">
                            Required
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400">
                            Optional
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-zinc-700 dark:text-zinc-400 font-mono text-[10px]">
                        {col.type}
                      </td>
                      <td className="p-2.5 font-mono text-zinc-800 dark:text-zinc-300 whitespace-nowrap text-[10px]">
                        {col.example}
                      </td>
                      <td className="p-2.5 text-zinc-700 dark:text-zinc-400 text-xs">
                        {col.notes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Code / Sample Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-400 uppercase">
                Ready-to-Use Sample CSV Snippet
              </span>
              <button
                type="button"
                onClick={handleCopySample}
                className="px-2.5 py-1 text-[11px] font-bold font-mono text-zinc-800 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-800 rounded-lg transition-colors flex items-center gap-1.5"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                    <span className="text-emerald-700 dark:text-emerald-400">Copied to Clipboard</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-400" />
                    <span>Copy Sample</span>
                  </>
                )}
              </button>
            </div>

            <pre className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl text-[11px] text-zinc-800 dark:text-zinc-300 font-mono overflow-x-auto whitespace-pre leading-relaxed select-all">
              {STANDARD_7COL_MAINTENANCE_CSV}
            </pre>
          </div>

          {/* Preparation Rules */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-sans">
            <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-zinc-950 dark:text-white block">Quoting Commas</span>
                <span className="text-zinc-700 dark:text-zinc-400 text-[11px]">Wrap values containing commas or slashes in double quotes.</span>
              </div>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-zinc-950 dark:text-white block">UTF-8 Plain Text</span>
                <span className="text-zinc-700 dark:text-zinc-400 text-[11px]">Save files from Excel or Google Sheets as Comma Separated Values (.csv).</span>
              </div>
            </div>
          </div>

        </div>

        {/* Modal Action Buttons Footer */}
        <div className="border-t border-zinc-300 dark:border-zinc-800 pt-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={downloadStandard7ColTemplate}
            className="px-4 py-2 text-xs font-bold font-mono text-white dark:text-zinc-950 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-xl transition-all shadow flex items-center gap-2 active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Download Template (.csv)</span>
          </button>

          <div className="flex items-center gap-2 font-mono">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onTriggerUpload();
              }}
              className="px-4 py-2 text-xs font-bold text-zinc-950 dark:text-white bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 border border-zinc-400 dark:border-zinc-700 rounded-xl transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Upload className="w-3.5 h-3.5 text-zinc-950 dark:text-white" />
              <span>Upload Prepared CSV</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
