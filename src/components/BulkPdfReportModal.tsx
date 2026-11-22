import React, { useEffect, useMemo, useState } from 'react';
import { BusinessSettings, CustomField, JobCard } from '../types';
import { generateBulkJobCardsPdf } from '../utils/generatePdf';
import { getEffectiveJobBilling } from '../utils/billing';
import { buildPdfBrandMeta } from '../utils/pdfBrandMeta';
import { Download, FileText, Printer, X } from 'lucide-react';

interface BulkPdfReportModalProps {
  jobs: JobCard[];
  settings?: BusinessSettings;
  customFields?: CustomField[];
  onClose: () => void;
}

export const BulkPdfReportModal: React.FC<BulkPdfReportModalProps> = ({
  jobs,
  settings,
  customFields = [],
  onClose,
}) => {
  const brandMeta = useMemo(
    () => (settings ? buildPdfBrandMeta(settings) : undefined),
    [settings]
  );
  const currency = settings?.currencySymbol || '$';
  const centerName = settings?.centerName || 'BOSCH & VENDOR AUTHORISED SERVICE CENTER';
  const contactLine = settings
    ? [settings.address, settings.phone, settings.email].filter(Boolean).join(' · ')
    : 'Authorised Industrial Tool Service Center';

  const { doc, filename, dataUrl, pageCount, totalAmount } = useMemo(
    () => generateBulkJobCardsPdf(jobs, brandMeta, customFields),
    [jobs, brandMeta, customFields]
  );

  const [blobPreviewUrl, setBlobPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return;
    }
    try {
      const pdfBlob = doc.output('blob');
      const nextUrl = URL.createObjectURL(pdfBlob);
      setBlobPreviewUrl(nextUrl);
      return () => {
        URL.revokeObjectURL(nextUrl);
      };
    } catch {
      setBlobPreviewUrl(null);
    }
  }, [doc]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const previewUrl = blobPreviewUrl || dataUrl;

  const handleDownloadPdf = () => {
    doc.save(filename);
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-pdf-report-title"
      data-testid="bulk-pdf-report-modal"
      className="fixed inset-0 z-50 bg-zinc-950/65 dark:bg-zinc-950/85 backdrop-blur flex items-center justify-center p-4 overflow-y-auto print:static print:inset-auto print:bg-white print:p-0 print:block"
    >
      {/* Interactive Screen Preview Modal */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-mono no-print">
        <div className="p-4 sm:p-5 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-300 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="bulk-pdf-report-title"
                className="text-sm sm:text-base font-bold text-zinc-950 dark:text-white truncate"
              >
                Combined Job Card PDF Report
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 font-sans tabular-nums">
                {jobs.length} selected job card{jobs.length === 1 ? '' : 's'} · {pageCount} pages · Batch Total {currency}
                {totalAmount.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadPdf}
              data-testid="bulk-pdf-download-btn"
              className="px-3.5 py-2 text-xs font-bold text-zinc-950 dark:text-white bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-xl transition-colors inline-flex items-center gap-1.5 border border-zinc-400 dark:border-zinc-700 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>

            <button
              type="button"
              onClick={handlePrintReport}
              data-testid="bulk-pdf-print-btn"
              className="px-4 py-2 text-xs font-bold text-white dark:text-zinc-950 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-xl shadow transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>Print Report</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close combined PDF report modal"
              className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-5 py-2.5 bg-zinc-100/80 dark:bg-zinc-950/70 border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 font-sans flex flex-wrap items-center justify-between gap-2">
          <div className="truncate">
            Included IDs:{' '}
            <span className="font-mono font-semibold text-zinc-950 dark:text-white">
              {jobs.map((j) => j.id).join(', ')}
            </span>
          </div>
          <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400 shrink-0">
            {filename}
          </span>
        </div>

        <div className="flex-1 bg-zinc-100 dark:bg-zinc-950 p-4 min-h-[460px]">
          <iframe
            src={previewUrl}
            title="Combined Job Card Report PDF Preview"
            className="w-full h-full min-h-[460px] rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white"
          />
        </div>
      </div>

      {/* Dedicated Multi-Page Print Layout */}
      <div className="hidden print-only bg-white text-black w-full font-sans text-xs leading-snug space-y-6">
        <div className="border-2 border-black p-5 space-y-4">
          <div className="flex items-start justify-between border-b-2 border-black pb-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider font-mono">
                {centerName}
              </div>
              <h1 className="text-xl font-black font-mono uppercase">
                Combined Job Card Batch Report
              </h1>
              <p className="text-[11px] text-zinc-700">{contactLine}</p>
            </div>
            <div className="text-right font-mono">
              <div className="text-base font-black">{jobs.length} Job Cards</div>
              <div className="text-xs font-bold">
                Total: {currency}
                {totalAmount.toFixed(2)}
              </div>
              <div className="text-[10px] text-zinc-600">
                Printed: {new Date().toISOString().slice(0, 16).replace('T', ' ')}
              </div>
            </div>
          </div>

          <table className="w-full border-collapse border border-black text-[11px] font-mono">
            <thead>
              <tr className="bg-zinc-200 border-b border-black text-left">
                <th className="p-1.5">Job ID</th>
                <th className="p-1.5">Client</th>
                <th className="p-1.5">Tool</th>
                <th className="p-1.5">Priority</th>
                <th className="p-1.5">Status</th>
                <th className="p-1.5">Tech</th>
                <th className="p-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const effectiveTotal = getEffectiveJobBilling(job).totalAmount;
                return (
                  <tr key={job.id} className="border-b border-zinc-300">
                    <td className="p-1.5 font-bold">{job.id}</td>
                    <td className="p-1.5">{job.customerName}</td>
                    <td className="p-1.5">
                      {job.tool.brand} {job.tool.modelNumber}
                    </td>
                    <td className="p-1.5">{job.priority}</td>
                    <td className="p-1.5">{job.status}</td>
                    <td className="p-1.5">{job.technician || 'Unassigned'}</td>
                    <td className="p-1.5 text-right font-bold tabular-nums">
                      {currency}
                      {effectiveTotal.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {jobs.map((job) => {
          const billing = getEffectiveJobBilling(job);
          const expenses = job.operationalExpenses || [];
          return (
            <div key={job.id} className="break-before-page border-2 border-black p-5 space-y-4">
              <div className="flex items-start justify-between border-b-2 border-black pb-3">
                <div>
                  <div className="text-[10px] font-bold uppercase font-mono">{centerName}</div>
                  <h2 className="text-lg font-black font-mono uppercase">Job Card Record</h2>
                  <p className="text-[10px] text-zinc-700">{contactLine}</p>
                </div>
                <div className="text-right font-mono">
                  <div className="text-base font-black">{job.id}</div>
                  <div className="text-[10px]">
                    Status: {job.status} · Priority: {job.priority}
                  </div>
                  <div className="text-[10px]">
                    Intake: {job.intakeDate} · Promised: {job.promisedCompletion}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border border-black p-3 bg-zinc-50 text-[11px]">
                <div className="space-y-0.5">
                  <div className="font-bold uppercase text-[10px]">Client Details</div>
                  <div className="font-bold">{job.customerName}</div>
                  <div className="font-mono">Phone: {job.customerPhone}</div>
                  {job.customerCompany && <div>Company: {job.customerCompany}</div>}
                  {job.customerEmail && <div>Email: {job.customerEmail}</div>}
                </div>
                <div className="space-y-0.5">
                  <div className="font-bold uppercase text-[10px]">Tool &amp; Assignment</div>
                  <div className="font-bold">
                    {job.tool.brand} {job.tool.modelNumber}
                  </div>
                  <div className="font-mono">
                    SN: {job.tool.serialNumber} · {job.tool.voltageRating}
                  </div>
                  <div>
                    Warranty: {job.tool.warrantyFlag || job.tool.warrantyStatus} · Tech:{' '}
                    {job.technician || 'Unassigned'}
                  </div>
                </div>
              </div>

              <div className="border border-black p-3 space-y-1 text-[11px]">
                <div className="font-bold uppercase text-[10px]">
                  Service Grievance: {job.serviceReq.grievanceCategory}
                </div>
                <p className="font-mono">{job.serviceReq.detailedComplaint}</p>
                {job.diagnosticNotes && (
                  <p className="font-mono pt-1 border-t border-zinc-300">
                    Findings: {job.diagnosticNotes}
                  </p>
                )}
              </div>

              {job.parts.length > 0 && (
                <table className="w-full border-collapse border border-black text-[10px] font-mono">
                  <thead>
                    <tr className="bg-zinc-200 border-b border-black text-left">
                      <th className="p-1">SKU</th>
                      <th className="p-1">Part Description</th>
                      <th className="p-1 text-center">Qty</th>
                      <th className="p-1 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.parts.map((part, idx) => (
                      <tr key={idx} className="border-b border-zinc-300">
                        <td className="p-1 font-bold">{part.sku}</td>
                        <td className="p-1">{part.name}</td>
                        <td className="p-1 text-center">{part.quantity}</td>
                        <td className="p-1 text-right tabular-nums">
                          {currency}
                          {part.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {expenses.length > 0 && (
                <table className="w-full border-collapse border border-black text-[10px] font-mono">
                  <thead>
                    <tr className="bg-zinc-100 border-b border-black text-left">
                      <th className="p-1">Expense Category</th>
                      <th className="p-1">Description</th>
                      <th className="p-1 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((exp, idx) => (
                      <tr key={idx} className="border-b border-zinc-300">
                        <td className="p-1">{exp.category}</td>
                        <td className="p-1">{exp.description}</td>
                        <td className="p-1 text-right tabular-nums">
                          {currency}
                          {Number(exp.amount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="flex items-end justify-between border-t border-black pt-3 font-mono text-[11px]">
                <div>
                  Pre-Approved Limit: {currency}
                  {job.serviceReq.preApprovedLimit.toFixed(2)}
                </div>
                <div className="text-right space-y-0.5 tabular-nums">
                  <div>
                    Labor: {currency}
                    {billing.laborSubtotal.toFixed(2)} · Parts: {currency}
                    {billing.partsSubtotal.toFixed(2)}
                  </div>
                  {billing.operationalExpensesSubtotal > 0 && (
                    <div>
                      Expenses: {currency}
                      {billing.operationalExpensesSubtotal.toFixed(2)}
                    </div>
                  )}
                  <div className="text-sm font-black">
                    Total: {currency}
                    {billing.totalAmount.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
