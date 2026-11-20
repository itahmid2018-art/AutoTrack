import React, { useState } from 'react';
import { JobCard, JobStatus } from '../types';
import { adjudicateWarranty } from '../utils/warrantyAdjudicator';
import { SerialBarcodeScannerModal } from './SerialBarcodeScannerModal';
import { BarcodeScanResult, findMatchingToolHistory, parseProductQrPayload } from '../utils/barcodeSerialParser';
import { getEffectiveJobBilling } from '../utils/billing';
import { Search, Wrench, MessageSquare, ChevronRight, User, Plus, Printer, FileText, X, Filter, Sparkles, ShieldCheck, ShieldAlert, QrCode, Star, CheckSquare } from 'lucide-react';

const BULK_STATUS_OPTIONS: JobStatus[] = [
  'Intake',
  'Diagnosis',
  'Awaiting Approval',
  'Awaiting Parts',
  'In Repair',
  'In Service',
  'Ready for Pickup',
  'Completed',
  'Cancelled',
];

interface JobCardListProps {
  jobCards: JobCard[];
  onSelectJob: (job: JobCard) => void;
  onOpenNewJobModal: () => void;
  onQuickStatusChange: (jobId: string, newStatus: JobStatus) => void;
  onBulkStatusChange?: (jobIds: string[], newStatus: JobStatus) => void;
  onOpenWhatsApp: (job: JobCard) => void;
  onPrintJobCard: (job: JobCard) => void;
  onSendPdfToCustomer: (job: JobCard) => void;
  onOpenAiDiagnosis?: (job: JobCard) => void;
}

export const JobCardList: React.FC<JobCardListProps> = ({
  jobCards,
  onSelectJob,
  onOpenNewJobModal,
  onQuickStatusChange,
  onBulkStatusChange,
  onOpenWhatsApp,
  onPrintJobCard,
  onSendPdfToCustomer,
  onOpenAiDiagnosis,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [brandFilter, setBrandFilter] = useState<string>('All');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkStatus, setBulkStatus] = useState<JobStatus>('Ready for Pickup');
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);

  const handleScanJobFilter = (result: BarcodeScanResult) => {
    const parsed = parseProductQrPayload(result.rawValue);
    const history = findMatchingToolHistory(result.rawValue, jobCards);

    if (
      (parsed.jobId || parsed.token) &&
      history.matchingJobs.length === 1
    ) {
      setIsScannerOpen(false);
      onSelectJob(history.matchingJobs[0]);
      return;
    }

    const queryValue =
      parsed.jobId ||
      result.serialNumber ||
      parsed.serialNumber ||
      parsed.sku ||
      result.rawValue;
    setSearchTerm(queryValue);
    setStatusFilter('All');
    setIsScannerOpen(false);
  };

  const filteredJobs = jobCards.filter((job) => {
    const matchesSearch =
      job.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (job.customerCompany && job.customerCompany.toLowerCase().includes(searchTerm.toLowerCase())) ||
      job.customerPhone.includes(searchTerm) ||
      job.tool.modelNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.tool.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.serviceReq.grievanceCategory.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'All' ||
      job.status === statusFilter ||
      (statusFilter === 'In Service' && job.status === 'In Repair');
    const matchesBrand = brandFilter === 'All' || job.tool.brand === brandFilter;

    return matchesSearch && matchesStatus && matchesBrand;
  });

  const existingJobIds = new Set(jobCards.map((j) => j.id));
  const activeSelectedIds = new Set(
    Array.from(selectedIds).filter((id) => existingJobIds.has(id))
  );
  const selectedCount = activeSelectedIds.size;
  const allFilteredSelected =
    filteredJobs.length > 0 && filteredJobs.every((j) => activeSelectedIds.has(j.id));

  const toggleSelectJob = (jobId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => existingJobIds.has(id)));
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => existingJobIds.has(id)));
      if (allFilteredSelected) {
        filteredJobs.forEach((j) => next.delete(j.id));
      } else {
        filteredJobs.forEach((j) => next.add(j.id));
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkUpdateStatus = () => {
    const targetIds = Array.from(activeSelectedIds);
    if (targetIds.length === 0) return;

    const changedCount = targetIds.filter(
      (id) => jobCards.find((j) => j.id === id)?.status !== bulkStatus
    ).length;

    if (changedCount > 0) {
      if (onBulkStatusChange) {
        onBulkStatusChange(targetIds, bulkStatus);
      } else {
        targetIds.forEach((id) => onQuickStatusChange(id, bulkStatus));
      }
      setBulkNotice(
        `Updated ${changedCount} job card${changedCount === 1 ? '' : 's'} to ${bulkStatus}.`
      );
    } else {
      setBulkNotice(
        `Selected job card${targetIds.length === 1 ? '' : 's'} already have status ${bulkStatus}.`
      );
    }

    setSelectedIds(new Set());
  };

  const getStatusBadgeClass = (status: JobStatus) => {
    switch (status) {
      case 'Intake':
        return 'bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-300 border-zinc-400 dark:border-zinc-700';
      case 'Diagnosis':
        return 'bg-zinc-200 dark:bg-zinc-800 text-zinc-950 dark:text-white border-zinc-400 dark:border-zinc-600 font-bold';
      case 'Awaiting Approval':
        return 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-200 border-zinc-400 dark:border-zinc-600';
      case 'Awaiting Parts':
        return 'bg-amber-50 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700/70 font-bold';
      case 'In Repair':
      case 'In Service':
        return 'bg-zinc-100 text-zinc-950 border-zinc-950 dark:border-white font-bold';
      case 'Ready for Pickup':
        return 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-zinc-950 dark:border-white font-extrabold';
      case 'Completed':
        return 'bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-500 border-zinc-300 dark:border-zinc-800';
      case 'Cancelled':
        return 'bg-rose-50 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800 font-bold';
      default:
        return 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-400 border-zinc-300 dark:border-zinc-800';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Controls & Real-Time Filter Bar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl font-mono">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          
          {/* Real-time Text Input Search Field */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-600 dark:text-zinc-500 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Customer Name, Job ID (e.g. BOSCH-2026-0041), or Model Number (GBH 2-26)..."
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 focus:border-zinc-950 dark:focus:border-white rounded-xl pl-10 pr-20 py-2.5 text-xs text-zinc-950 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none font-mono transition-colors shadow-inner"
            />

            {/* Clear Button or Result Badge */}
            {searchTerm ? (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2 text-xs font-mono font-bold text-white dark:text-zinc-950 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 px-2 py-1 rounded-lg transition-all flex items-center gap-1 shadow"
                title="Clear filter text"
              >
                <X className="w-3 h-3" />
                <span>Clear</span>
              </button>
            ) : (
              <span className="absolute right-3 top-2.5 text-[10px] text-zinc-600 dark:text-zinc-500 font-mono hidden sm:inline">
                Real-time Filter
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="px-3 py-2.5 text-xs font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl shadow flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 active:scale-95"
              title="Scan Job Card QR or Tool Serial Barcode"
            >
              <QrCode className="w-4 h-4" />
              <span>Scan QR / Barcode</span>
            </button>

            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-zinc-800 dark:text-zinc-300 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-zinc-700 dark:focus:border-zinc-500 font-medium"
            >
              <option value="All">All Vendor Brands</option>
              <option value="Bosch Professional">Bosch Professional</option>
              <option value="Bosch DIY (Green)">Bosch DIY</option>
              <option value="Makita">Makita</option>
              <option value="DeWalt">DeWalt</option>
              <option value="Milwaukee">Milwaukee</option>
              <option value="Hilti">Hilti</option>
            </select>
          </div>

        </div>

        {/* Search Feedback & Sample Chips */}
        {searchTerm && (
          <div className="mt-3 pt-3 border-t border-zinc-300/80 dark:border-zinc-800/80 flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-400">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-zinc-950 dark:text-white" />
              <span>
                Filtering by: <strong className="text-zinc-950 dark:text-white">&quot;{searchTerm}&quot;</strong>
              </span>
              <span className="px-2 py-0.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-zinc-950 dark:text-white rounded font-bold text-[11px]">
                {filteredJobs.length} match{filteredJobs.length === 1 ? '' : 'es'}
              </span>
            </div>

            <button
              onClick={() => setSearchTerm('')}
              className="text-[11px] text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white underline font-semibold"
            >
              Reset Search Filter
            </button>
          </div>
        )}

        {/* Status Segmented Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto mt-4 pt-4 border-t border-zinc-300 dark:border-zinc-800">
          {[
            { id: 'All', label: 'All Cards', count: jobCards.length },
            { id: 'Intake', label: 'Intake', count: jobCards.filter(j => j.status === 'Intake').length },
            { id: 'Diagnosis', label: 'Diagnosis', count: jobCards.filter(j => j.status === 'Diagnosis').length },
            { id: 'Awaiting Parts', label: 'Awaiting Parts', count: jobCards.filter(j => j.status === 'Awaiting Parts').length },
            { id: 'In Service', label: 'In Repair / Service', count: jobCards.filter(j => j.status === 'In Service' || j.status === 'In Repair').length },
            { id: 'Ready for Pickup', label: 'Ready for Pickup', count: jobCards.filter(j => j.status === 'Ready for Pickup').length },
            { id: 'Completed', label: 'Completed', count: jobCards.filter(j => j.status === 'Completed').length },
            { id: 'Cancelled', label: 'Cancelled', count: jobCards.filter(j => j.status === 'Cancelled').length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-2 ${
                statusFilter === tab.id
                  ? 'bg-zinc-100 text-zinc-950 shadow font-bold'
                  : 'text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 text-[10px] font-mono rounded ${
                statusFilter === tab.id ? 'bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-white' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Bulk Selection & Header Status Action Bar */}
        <div className="mt-4 pt-4 border-t border-zinc-300 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-2 cursor-pointer text-zinc-900 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white select-none">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAllFiltered}
                disabled={filteredJobs.length === 0}
                aria-label="Select all visible job cards"
                className="w-4 h-4 rounded border-zinc-400 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-emerald-700 dark:text-emerald-400 accent-emerald-600 dark:accent-emerald-400 cursor-pointer disabled:opacity-40"
              />
              <span className="font-semibold">
                Select All ({filteredJobs.length})
              </span>
            </label>

            <span className="px-2 py-0.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-[11px] text-zinc-800 dark:text-zinc-300 tabular-nums">
              {selectedCount} selected
            </span>

            {selectedCount > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-[11px] text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white underline font-semibold"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as JobStatus)}
              aria-label="Bulk update target status"
              className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-zinc-700 dark:focus:border-zinc-500 font-medium"
            >
              {BULK_STATUS_OPTIONS.map((statusOption) => (
                <option key={statusOption} value={statusOption}>
                  {statusOption}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleBulkUpdateStatus}
              disabled={selectedCount === 0}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl shadow flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                selectedCount > 0
                  ? 'bg-emerald-400 hover:bg-emerald-300 text-zinc-950 active:scale-95 cursor-pointer'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-500 border border-zinc-400 dark:border-zinc-700 cursor-not-allowed'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              <span>
                Bulk Update Status{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </span>
            </button>
          </div>
        </div>

        {bulkNotice && (
          <div className="mt-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700/70 rounded-xl px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-2">
            <span>{bulkNotice}</span>
            <button
              type="button"
              onClick={() => setBulkNotice(null)}
              className="text-emerald-800 dark:text-emerald-300 hover:text-zinc-950 dark:hover:text-white font-bold"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Cards Grid */}
      {filteredJobs.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-12 text-center">
          <Wrench className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-300">No Tool Intakes Found</h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-500 max-w-sm mx-auto mt-1 mb-4">
            No transactional service cards match your filter parameters.
          </p>
          <button
            onClick={onOpenNewJobModal}
            className="px-4 py-2 text-xs font-bold text-white dark:text-zinc-950 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-lg shadow transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Tool Intake</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredJobs.map((job) => {
            const isSelected = activeSelectedIds.has(job.id);
            return (
            <div
              key={job.id}
              className={`bg-white dark:bg-zinc-900 border rounded-2xl p-5 shadow-lg flex flex-col justify-between group transition-all ${
                isSelected
                  ? 'border-emerald-400/80 ring-1 ring-emerald-400/40'
                  : 'border-zinc-300 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700'
              }`}
            >
              <div>
                {/* Card Header */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectJob(job.id)}
                      aria-label={`Select job card ${job.id}`}
                      className="w-4 h-4 rounded border-zinc-400 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-emerald-700 dark:text-emerald-400 accent-emerald-600 dark:accent-emerald-400 cursor-pointer"
                    />
                    <span className="font-mono text-xs font-bold text-zinc-950 dark:text-white bg-zinc-50 dark:bg-zinc-950 px-2.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-800">
                      {job.id}
                    </span>
                  </label>

                  <div className="flex items-center gap-1.5">
                    {job.customerFeedback && (
                      <span
                        title={job.customerFeedback.comment || 'Submitted Client Rating'}
                        className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border bg-amber-50 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700/70 inline-flex items-center gap-1 tabular-nums"
                      >
                        <Star className="w-3 h-3 fill-amber-400 text-amber-500 dark:text-amber-400" />
                        <span>{job.customerFeedback.rating}/5</span>
                      </span>
                    )}
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${getStatusBadgeClass(job.status)}`}>
                      {job.status}
                    </span>
                  </div>
                </div>

                {/* Tool Model & Brand */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-zinc-700 dark:text-zinc-400 uppercase tracking-wider">{job.tool.brand}</span>
                  {(() => {
                    const warrantyFlag = job.tool.warrantyFlag || adjudicateWarranty(job.tool, {
                      grievanceCategory: job.serviceReq.grievanceCategory,
                      detailedComplaint: job.serviceReq.detailedComplaint,
                    }).flag;
                    return (
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                          warrantyFlag === 'In-Warranty'
                            ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/70'
                            : 'bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-400 border-zinc-300 dark:border-zinc-800'
                        }`}
                      >
                        {warrantyFlag === 'In-Warranty' ? (
                          <ShieldCheck className="w-3 h-3" />
                        ) : (
                          <ShieldAlert className="w-3 h-3" />
                        )}
                        <span>{warrantyFlag}</span>
                      </span>
                    );
                  })()}
                </div>
                <h3 className="text-base font-bold text-zinc-950 dark:text-white group-hover:text-zinc-900 dark:group-hover:text-zinc-300 transition-colors line-clamp-1 mt-0.5">
                  {job.tool.modelNumber}
                </h3>
                <div className="text-[11px] text-zinc-700 dark:text-zinc-400 font-mono mt-0.5">
                  SN: <span className="text-zinc-900 dark:text-zinc-200">{job.tool.serialNumber}</span> · {job.tool.voltageRating}
                </div>

                {/* Customer Details */}
                <div className="flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-400 mt-2 mb-3 pt-2 border-t border-zinc-300 dark:border-zinc-800">
                  <div className="flex items-center gap-2 truncate">
                    <User className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-500 shrink-0" />
                    <span className="font-medium text-zinc-800 dark:text-zinc-300 truncate">{job.customerName}</span>
                  </div>
                  <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-400 shrink-0">{job.customerPhone}</span>
                </div>

                {/* Complaint */}
                <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-300 dark:border-zinc-800 text-xs text-zinc-800 dark:text-zinc-300 leading-relaxed mb-4">
                  <span className="text-zinc-600 dark:text-zinc-500 font-semibold block text-[10px] uppercase mb-0.5">{job.serviceReq.grievanceCategory}</span>
                  <p className="line-clamp-2">{job.serviceReq.detailedComplaint}</p>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="pt-3 border-t border-zinc-300 dark:border-zinc-800 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] text-zinc-600 dark:text-zinc-500 uppercase tracking-wider font-semibold">Total Estimate</div>
                  <div className="text-base font-extrabold font-mono text-zinc-950 dark:text-white">
                    ${getEffectiveJobBilling(job).totalAmount.toFixed(2)}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {onOpenAiDiagnosis && (
                    <button
                      onClick={() => onOpenAiDiagnosis(job)}
                      title="Run Gemini AI Fault Diagnosis for this device"
                      className="px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 transition-colors flex items-center gap-1 text-[11px] font-bold font-mono"
                    >
                      <Sparkles className="w-3 h-3 text-zinc-950 dark:text-white" />
                      <span>Diagnose</span>
                    </button>
                  )}

                  <button
                    onClick={() => onSendPdfToCustomer(job)}
                    title="Generate & Send PDF to Customer Number"
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center gap-1 text-xs font-bold"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Send PDF</span>
                  </button>

                  <button
                    onClick={() => onPrintJobCard(job)}
                    title="Print Tag"
                    className="p-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-zinc-800 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => onSelectJob(job)}
                    className="p-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-zinc-800 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>
            );
          })}
        </div>
      )}

      {isScannerOpen && (
        <SerialBarcodeScannerModal
          title="Scan Job Card QR or Tool Serial Barcode"
          subtitle="Opens matching Job Cards or filters the list by scanned serial number"
          prioritizeQr
          onDetected={handleScanJobFilter}
          onClose={() => setIsScannerOpen(false)}
        />
      )}

    </div>
  );
};
