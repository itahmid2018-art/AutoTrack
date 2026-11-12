import React, { useState } from 'react';
import { JobCard, JobStatus } from '../types';
import { Search, Wrench, MessageSquare, ChevronRight, User, Plus, Printer, FileText, X, Filter, Sparkles } from 'lucide-react';

interface JobCardListProps {
  jobCards: JobCard[];
  onSelectJob: (job: JobCard) => void;
  onOpenNewJobModal: () => void;
  onQuickStatusChange: (jobId: string, newStatus: JobStatus) => void;
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
  onOpenWhatsApp,
  onPrintJobCard,
  onSendPdfToCustomer,
  onOpenAiDiagnosis,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [brandFilter, setBrandFilter] = useState<string>('All');

  const filteredJobs = jobCards.filter((job) => {
    const matchesSearch =
      job.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (job.customerCompany && job.customerCompany.toLowerCase().includes(searchTerm.toLowerCase())) ||
      job.customerPhone.includes(searchTerm) ||
      job.tool.modelNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.tool.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.serviceReq.grievanceCategory.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'All' || job.status === statusFilter;
    const matchesBrand = brandFilter === 'All' || job.tool.brand === brandFilter;

    return matchesSearch && matchesStatus && matchesBrand;
  });

  const getStatusBadgeClass = (status: JobStatus) => {
    switch (status) {
      case 'Intake':
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
      case 'Diagnosis':
        return 'bg-zinc-800 text-white border-zinc-600 font-bold';
      case 'Awaiting Approval':
        return 'bg-zinc-800 text-zinc-200 border-zinc-600';
      case 'In Service':
        return 'bg-zinc-100 text-zinc-950 border-white font-bold';
      case 'Ready for Pickup':
        return 'bg-white text-zinc-950 border-white font-extrabold';
      case 'Completed':
        return 'bg-zinc-950 text-zinc-500 border-zinc-800';
      default:
        return 'bg-zinc-900 text-zinc-400 border-zinc-800';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Controls & Real-Time Filter Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl font-mono">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          
          {/* Real-time Text Input Search Field */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Customer Name, Job ID (e.g. BOSCH-2026-0041), or Model Number (GBH 2-26)..."
              className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-white rounded-xl pl-10 pr-20 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none font-mono transition-colors shadow-inner"
            />

            {/* Clear Button or Result Badge */}
            {searchTerm ? (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2 text-xs font-mono font-bold text-zinc-950 bg-white hover:bg-zinc-200 px-2 py-1 rounded-lg transition-all flex items-center gap-1 shadow"
                title="Clear filter text"
              >
                <X className="w-3 h-3" />
                <span>Clear</span>
              </button>
            ) : (
              <span className="absolute right-3 top-2.5 text-[10px] text-zinc-500 font-mono hidden sm:inline">
                Real-time Filter
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-zinc-500 font-medium"
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
          <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-white" />
              <span>
                Filtering by: <strong className="text-white">&quot;{searchTerm}&quot;</strong>
              </span>
              <span className="px-2 py-0.5 bg-zinc-950 border border-zinc-800 text-white rounded font-bold text-[11px]">
                {filteredJobs.length} match{filteredJobs.length === 1 ? '' : 'es'}
              </span>
            </div>

            <button
              onClick={() => setSearchTerm('')}
              className="text-[11px] text-zinc-400 hover:text-white underline font-semibold"
            >
              Reset Search Filter
            </button>
          </div>
        )}

        {/* Status Segmented Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto mt-4 pt-4 border-t border-zinc-800">
          {[
            { id: 'All', label: 'All Cards', count: jobCards.length },
            { id: 'Intake', label: 'Intake', count: jobCards.filter(j => j.status === 'Intake').length },
            { id: 'Diagnosis', label: 'Diagnosis', count: jobCards.filter(j => j.status === 'Diagnosis').length },
            { id: 'In Service', label: 'In Service', count: jobCards.filter(j => j.status === 'In Service').length },
            { id: 'Ready for Pickup', label: 'Ready for Pickup', count: jobCards.filter(j => j.status === 'Ready for Pickup').length },
            { id: 'Completed', label: 'Completed', count: jobCards.filter(j => j.status === 'Completed').length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-2 ${
                statusFilter === tab.id
                  ? 'bg-zinc-100 text-zinc-950 shadow font-bold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 text-[10px] font-mono rounded ${
                statusFilter === tab.id ? 'bg-zinc-950 text-white' : 'bg-zinc-800 text-zinc-400'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Cards Grid */}
      {filteredJobs.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <Wrench className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-zinc-300">No Tool Intakes Found</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1 mb-4">
            No transactional service cards match your filter parameters.
          </p>
          <button
            onClick={onOpenNewJobModal}
            className="px-4 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-lg shadow transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Tool Intake</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-5 shadow-lg flex flex-col justify-between group transition-all"
            >
              <div>
                {/* Card Header */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="font-mono text-xs font-bold text-white bg-zinc-950 px-2.5 py-0.5 rounded border border-zinc-800">
                    {job.id}
                  </span>
                  
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${getStatusBadgeClass(job.status)}`}>
                    {job.status}
                  </span>
                </div>

                {/* Tool Model & Brand */}
                <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">{job.tool.brand}</div>
                <h3 className="text-base font-bold text-white group-hover:text-zinc-300 transition-colors line-clamp-1 mt-0.5">
                  {job.tool.modelNumber}
                </h3>
                <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                  SN: <span className="text-zinc-200">{job.tool.serialNumber}</span> · {job.tool.voltageRating}
                </div>

                {/* Customer Details */}
                <div className="flex items-center justify-between text-xs text-zinc-400 mt-2 mb-3 pt-2 border-t border-zinc-800">
                  <div className="flex items-center gap-2 truncate">
                    <User className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="font-medium text-zinc-300 truncate">{job.customerName}</span>
                  </div>
                  <span className="font-mono text-[11px] text-zinc-400 shrink-0">{job.customerPhone}</span>
                </div>

                {/* Complaint */}
                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 text-xs text-zinc-300 leading-relaxed mb-4">
                  <span className="text-zinc-500 font-semibold block text-[10px] uppercase mb-0.5">{job.serviceReq.grievanceCategory}</span>
                  <p className="line-clamp-2">{job.serviceReq.detailedComplaint}</p>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="pt-3 border-t border-zinc-800 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Total Estimate</div>
                  <div className="text-base font-extrabold font-mono text-white">
                    ${job.totalAmount.toFixed(2)}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {onOpenAiDiagnosis && (
                    <button
                      onClick={() => onOpenAiDiagnosis(job)}
                      title="Run Gemini AI Fault Diagnosis for this device"
                      className="px-2 py-1.5 rounded-lg bg-zinc-950 text-white hover:bg-zinc-800 border border-zinc-700 transition-colors flex items-center gap-1 text-[11px] font-bold font-mono"
                    >
                      <Sparkles className="w-3 h-3 text-white" />
                      <span>Diagnose</span>
                    </button>
                  )}

                  <button
                    onClick={() => onSendPdfToCustomer(job)}
                    title="Generate & Send PDF to Customer Number"
                    className="px-2.5 py-1.5 rounded-lg bg-white text-zinc-950 hover:bg-zinc-200 transition-colors flex items-center gap-1 text-xs font-bold"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Send PDF</span>
                  </button>

                  <button
                    onClick={() => onPrintJobCard(job)}
                    title="Print Tag"
                    className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => onSelectJob(job)}
                    className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
};
