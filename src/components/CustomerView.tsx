import React, { useState, useEffect } from 'react';
import { JobCard, JobStatus } from '../types';
import { generateJobCardPdf } from '../utils/generatePdf';
import { getEffectiveJobBilling } from '../utils/billing';
import {
  Search,
  Wrench,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Download,
  Phone,
  Calendar,
  PackageCheck,
  AlertCircle,
  ArrowLeft,
  Lock,
  Sparkles,
  FileText,
} from 'lucide-react';

export interface PublicJobStatusSummary {
  id: string;
  customerFirstName: string;
  maskedPhone: string;
  phoneLast4: string;
  hasCompany: boolean;
  customerCompany?: string;
  toolBrand: string;
  toolCategory: string;
  toolModel: string;
  toolSerialMasked: string;
  voltageRating: string;
  warrantyFlag: 'In-Warranty' | 'Out-of-Warranty';
  warrantyStatusLabel: string;
  accessoriesReceived: string[];
  grievanceCategory: string;
  intakeDate: string;
  promisedCompletion: string;
  status: JobStatus;
  priority: string;
  estimatedTotal: number;
  partsCount: number;
  stageHistory: { status: JobStatus; enteredAt: string }[];
  updatedAt: string;
  verifiedByTokenOrPhone: boolean;
  // Kept strictly for customer receipt PDF export of *this* verified ticket only
  _pdfRecord: JobCard;
}

interface CustomerViewProps {
  onLookupJob: (query: string, phoneLast4?: string) => PublicJobStatusSummary | null;
  initialQuery?: string;
  sampleJobIds?: string[];
  centerName?: string;
  centerPhone?: string;
  onExitCustomerView?: () => void;
}

const CUSTOMER_MILESTONES: {
  key: string;
  label: string;
  description: string;
  matches: JobStatus[];
}[] = [
  {
    key: 'Intake',
    label: 'Tool Received',
    description: 'Checked in at service counter',
    matches: ['Intake'],
  },
  {
    key: 'Diagnosis',
    label: 'Bench Inspection',
    description: 'Technician diagnosing fault',
    matches: ['Diagnosis'],
  },
  {
    key: 'Awaiting Approval',
    label: 'Estimate Review',
    description: 'Repair estimate prepared',
    matches: ['Awaiting Approval'],
  },
  {
    key: 'Awaiting Parts',
    label: 'Parts Allocation',
    description: 'Sourcing genuine spare parts',
    matches: ['Awaiting Parts'],
  },
  {
    key: 'In Repair',
    label: 'Repair & Testing',
    description: 'Active overhaul & load check',
    matches: ['In Repair', 'In Service'],
  },
  {
    key: 'Ready for Pickup',
    label: 'Ready for Pickup',
    description: 'QC passed & ready at counter',
    matches: ['Ready for Pickup'],
  },
  {
    key: 'Completed',
    label: 'Picked Up / Closed',
    description: 'Tool returned to customer',
    matches: ['Completed'],
  },
];

const getStatusBadgeStyle = (status: JobStatus): string => {
  switch (status) {
    case 'Ready for Pickup':
      return 'bg-emerald-950 text-emerald-300 border-emerald-600';
    case 'Completed':
      return 'bg-zinc-900 text-emerald-400 border-emerald-800';
    case 'Awaiting Parts':
    case 'Awaiting Approval':
      return 'bg-amber-950 text-amber-300 border-amber-700';
    case 'Cancelled':
      return 'bg-rose-950 text-rose-300 border-rose-700';
    default:
      return 'bg-zinc-900 text-white border-zinc-700';
  }
};

export function sanitizeJobForCustomer(
  job: JobCard,
  verifiedByTokenOrPhone: boolean
): PublicJobStatusSummary {
  const digits = (job.customerPhone || '').replace(/\D/g, '');
  const phoneLast4 = digits.slice(-4);
  const maskedPhone = phoneLast4 ? `•••-•••-${phoneLast4}` : 'On file';
  const serial = job.tool.serialNumber || 'N/A';
  const toolSerialMasked =
    serial.length > 5 && !verifiedByTokenOrPhone
      ? `${serial.slice(0, 3)}••••${serial.slice(-3)}`
      : serial;
  const warrantyFlag =
    job.tool.warrantyFlag ||
    job.tool.warrantyAdjudication?.flag ||
    (job.tool.warrantyStatus === 'Out of Warranty' ? 'Out-of-Warranty' : 'In-Warranty');

  return {
    id: job.id,
    customerFirstName: (job.customerName || 'Customer').split(' ')[0],
    maskedPhone,
    phoneLast4,
    hasCompany: Boolean(job.customerCompany),
    customerCompany: verifiedByTokenOrPhone ? job.customerCompany : undefined,
    toolBrand: job.tool.brand,
    toolCategory: job.tool.category,
    toolModel: job.tool.modelNumber,
    toolSerialMasked,
    voltageRating: job.tool.voltageRating,
    warrantyFlag,
    warrantyStatusLabel: job.tool.warrantyStatus,
    accessoriesReceived: job.tool.accessoriesReceived || [],
    grievanceCategory: job.serviceReq.grievanceCategory,
    intakeDate: job.intakeDate,
    promisedCompletion: job.promisedCompletion,
    status: job.status,
    priority: job.priority,
    estimatedTotal: getEffectiveJobBilling(job).totalAmount,
    partsCount: job.parts ? job.parts.length : 0,
    stageHistory: job.stageHistory || [{ status: job.status, enteredAt: job.intakeDate }],
    updatedAt: job.updatedAt,
    verifiedByTokenOrPhone,
    _pdfRecord: job,
  };
}

export const CustomerView: React.FC<CustomerViewProps> = ({
  onLookupJob,
  initialQuery = '',
  sampleJobIds = [],
  centerName = 'BOSCH Authorised Service Center',
  centerPhone = '+1 (555) 019-2831',
  onExitCustomerView,
}) => {
  const [lookupInput, setLookupInput] = useState(initialQuery);
  const [phoneLast4Input, setPhoneLast4Input] = useState('');
  const [matchedSummary, setMatchedSummary] = useState<PublicJobStatusSummary | null>(() =>
    initialQuery ? onLookupJob(initialQuery) : null
  );
  const [hasSearched, setHasSearched] = useState(Boolean(initialQuery));
  const [pdfSavedMsg, setPdfSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialQuery) {
      setLookupInput(initialQuery);
      setMatchedSummary(onLookupJob(initialQuery));
      setHasSearched(true);
    }
  }, [initialQuery, onLookupJob]);

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = lookupInput.trim();
    if (!cleaned) return;
    const result = onLookupJob(cleaned, phoneLast4Input.trim() || undefined);
    setMatchedSummary(result);
    setHasSearched(true);
    setPdfSavedMsg(null);
  };

  const handleQuickSampleLookup = (sampleId: string) => {
    setLookupInput(sampleId);
    setPhoneLast4Input('');
    const result = onLookupJob(sampleId);
    setMatchedSummary(result);
    setHasSearched(true);
    setPdfSavedMsg(null);
  };

  const handleDownloadCustomerReceipt = () => {
    if (!matchedSummary) return;
    const { doc, filename } = generateJobCardPdf(matchedSummary._pdfRecord, {
      centerName,
      phone: centerPhone,
    });
    doc.save(filename);
    setPdfSavedMsg(`Downloaded ${filename}`);
    setTimeout(() => setPdfSavedMsg(null), 3500);
  };

  const currentStepIndex = matchedSummary
    ? CUSTOMER_MILESTONES.findIndex((m) => m.matches.includes(matchedSummary.status))
    : -1;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Isolated Customer Portal Header (No Internal Nav, Inventory, or Staff Controls) */}
      <header className="bg-zinc-950/95 border-b border-zinc-800 sticky top-0 z-30 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white font-mono uppercase tracking-tight">
                {centerName}
              </div>
              <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-emerald-400" />
                <span>Customer Self-Service Status Tracker</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span>{centerPhone}</span>
            </span>

            {onExitCustomerView && (
              <button
                onClick={onExitCustomerView}
                className="px-3 py-1.5 text-xs font-bold font-mono text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Staff Dashboard</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Centered Customer Self-Service Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Lookup Search Card */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="space-y-1">
            <h1 className="text-lg sm:text-xl font-extrabold text-white font-mono uppercase tracking-tight">
              Check Your Tool Repair Status
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400">
              Enter your Job Card number (printed on your intake slip) or private status token to view live service progress.
            </p>
          </div>

          <form onSubmit={handleLookupSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 font-mono">
            <div className="sm:col-span-6 relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                placeholder="Job Card ID (e.g. BOSCH-2026-0041) or Token"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-white rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
                required
              />
            </div>

            <div className="sm:col-span-3">
              <input
                type="text"
                maxLength={4}
                value={phoneLast4Input}
                onChange={(e) => setPhoneLast4Input(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Phone Last 4 (Optional)"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-white rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="sm:col-span-3 py-2.5 px-4 bg-white hover:bg-zinc-200 text-zinc-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow"
            >
              <Search className="w-4 h-4" />
              <span>Track Repair</span>
            </button>
          </form>

          {sampleJobIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-mono">
              <span className="text-zinc-500">Quick Demo Lookup:</span>
              {sampleJobIds.slice(0, 4).map((sampleId) => (
                <button
                  key={sampleId}
                  type="button"
                  onClick={() => handleQuickSampleLookup(sampleId)}
                  className={`px-2.5 py-1 rounded-lg border transition-colors ${
                    matchedSummary?.id === sampleId
                      ? 'bg-white text-zinc-950 border-white font-bold'
                      : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  {sampleId}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Empty / Not Found Feedback */}
        {hasSearched && !matchedSummary && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-2 shadow-lg">
            <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
            <h2 className="text-sm font-bold text-white font-mono uppercase">
              No Matching Service Ticket Found
            </h2>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Verify your Job Card ID (for example <code className="text-zinc-200">BOSCH-2026-0041</code>) and, if entered, ensure the last 4 phone digits match the intake phone number.
            </p>
          </div>
        )}

        {/* Sanitized Customer Job Status Card */}
        {matchedSummary && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Status Header Banner */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-xl font-extrabold text-white font-mono">
                      {matchedSummary.id}
                    </span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${getStatusBadgeStyle(
                        matchedSummary.status
                      )}`}
                    >
                      {matchedSummary.status.toUpperCase()}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border inline-flex items-center gap-1 ${
                        matchedSummary.warrantyFlag === 'In-Warranty'
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                          : 'bg-amber-950/70 text-amber-300 border-amber-700/70'
                      }`}
                    >
                      {matchedSummary.warrantyFlag === 'In-Warranty' ? (
                        <ShieldCheck className="w-3.5 h-3.5" />
                      ) : (
                        <ShieldAlert className="w-3.5 h-3.5" />
                      )}
                      <span>{matchedSummary.warrantyFlag}</span>
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1.5 font-mono">
                    Customer: <strong className="text-zinc-200">{matchedSummary.customerFirstName}</strong> ({matchedSummary.maskedPhone})
                    {matchedSummary.customerCompany ? ` · ${matchedSummary.customerCompany}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleDownloadCustomerReceipt}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs font-mono flex items-center gap-1.5 shadow active:scale-95 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>{pdfSavedMsg ? 'PDF Saved' : 'Download PDF Receipt'}</span>
                  </button>
                </div>
              </div>

              {/* Ready for Pickup Highlight Banner */}
              {matchedSummary.status === 'Ready for Pickup' && (
                <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-700 flex items-center gap-3 text-emerald-200">
                  <PackageCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                  <div className="text-xs space-y-0.5">
                    <div className="font-bold text-sm text-emerald-300 font-mono">
                      Your power tool is ready for counter pickup!
                    </div>
                    <div>
                      Bring your intake receipt or quote <strong>{matchedSummary.id}</strong> at the service desk.
                    </div>
                  </div>
                </div>
              )}

              {/* Cancelled Notice */}
              {matchedSummary.status === 'Cancelled' ? (
                <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-xs text-rose-200 font-mono">
                  This service ticket has been marked as <strong>Cancelled</strong>. Please contact {centerPhone} if you have questions.
                </div>
              ) : (
                /* Repair Progress Stepper */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                    <span className="uppercase tracking-wider font-bold text-zinc-300">
                      Live Repair Milestone Progress
                    </span>
                    <span>Promised Completion: <strong className="text-white">{matchedSummary.promisedCompletion}</strong></span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
                    {CUSTOMER_MILESTONES.map((step, idx) => {
                      const isDone = currentStepIndex > idx;
                      const isCurrent = currentStepIndex === idx;
                      return (
                        <div
                          key={step.key}
                          className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-1.5 ${
                            isCurrent
                              ? 'bg-white text-zinc-950 border-white shadow-lg'
                              : isDone
                              ? 'bg-emerald-950/40 text-emerald-200 border-emerald-800/80'
                              : 'bg-zinc-950 text-zinc-500 border-zinc-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-bold">
                              STEP {idx + 1}
                            </span>
                            {isDone ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : isCurrent ? (
                              <Sparkles className="w-3.5 h-3.5 text-zinc-950" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 text-zinc-600" />
                            )}
                          </div>
                          <div className="text-xs font-bold leading-tight">{step.label}</div>
                          <div
                            className={`text-[10px] leading-snug ${
                              isCurrent ? 'text-zinc-700' : isDone ? 'text-emerald-300/80' : 'text-zinc-500'
                            }`}
                          >
                            {step.description}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Tool Information & Service Summary Cards (No Internal Inventory Access) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3 shadow-lg">
                <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2 border-b border-zinc-800 pb-2.5">
                  <Wrench className="w-4 h-4 text-white" />
                  <span>Tool &amp; Intake Details</span>
                </h2>

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Tool Model:</span>
                    <span className="text-white font-bold text-right">
                      {matchedSummary.toolBrand} {matchedSummary.toolModel}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Category:</span>
                    <span className="text-zinc-200">{matchedSummary.toolCategory}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Serial Number:</span>
                    <span className="text-zinc-200">{matchedSummary.toolSerialMasked}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Reported Issue:</span>
                    <span className="text-zinc-200 text-right">{matchedSummary.grievanceCategory}</span>
                  </div>
                  <div className="pt-2 border-t border-zinc-800/80">
                    <span className="text-zinc-400 block mb-1">Accessories Checked In:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {matchedSummary.accessoriesReceived.length > 0 ? (
                        matchedSummary.accessoriesReceived.map((acc) => (
                          <span
                            key={acc}
                            className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300"
                          >
                            {acc}
                          </span>
                        ))
                      ) : (
                        <span className="text-zinc-500">Bare tool only</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3 shadow-lg flex flex-col justify-between">
                <div className="space-y-3">
                  <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2 border-b border-zinc-800 pb-2.5">
                    <FileText className="w-4 h-4 text-white" />
                    <span>Schedule &amp; Billing Summary</span>
                  </h2>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-zinc-400 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> Intake Date:
                      </span>
                      <span className="text-zinc-200">{matchedSummary.intakeDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Promised Target:</span>
                      <span className="text-white font-bold">{matchedSummary.promisedCompletion}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Warranty Classification:</span>
                      <span className="text-zinc-200">{matchedSummary.warrantyFlag}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Replacement Parts Used:</span>
                      <span className="text-zinc-200">{matchedSummary.partsCount} line item(s)</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between font-mono">
                  <span className="text-xs text-zinc-400 uppercase font-bold">
                    Estimated / Billed Total
                  </span>
                  <span className="text-xl font-extrabold text-white">
                    ${matchedSummary.estimatedTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-900 py-4 text-center text-[11px] text-zinc-500 font-mono">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>{centerName} · Read-Only Customer Status Portal</span>
          <span>Need assistance? Call {centerPhone}</span>
        </div>
      </footer>
    </div>
  );
};
