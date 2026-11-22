import React, { useState, useEffect, useRef } from 'react';
import { CustomerFeedback, JobCard, JobStatus } from '../types';
import { generateJobCardPdf } from '../utils/generatePdf';
import { getEffectiveJobBilling } from '../utils/billing';
import { subscribePublicDeliveryStatus } from '../utils/firestoreSync';
import { resolveApiUrl } from '../utils/apiBase';
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
  Star,
  MessageSquare,
  Send,
  Sun,
  Moon,
  QrCode,
} from 'lucide-react';
import type { AppTheme } from '../utils/theme';
import { SerialBarcodeScannerModal } from './SerialBarcodeScannerModal';
import { parseProductQrPayload } from '../utils/barcodeSerialParser';

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
  publicAccessToken?: string;
  customerFeedback?: CustomerFeedback;
  // Kept strictly for client receipt PDF export of this verified ticket only
  _pdfRecord?: JobCard;
}

export type CustomerLookupResult =
  | { status: 'found'; summary: PublicJobStatusSummary }
  | { status: 'needs-verification'; jobId: string }
  | { status: 'invalid-phone'; jobId: string }
  | { status: 'not-found' };

interface CustomerViewProps {
  onLookupJob: (query: string, phoneLast4?: string) => CustomerLookupResult;
  initialQuery?: string;
  initialShowFeedback?: boolean;
  sampleJobIds?: string[];
  centerName?: string;
  centerPhone?: string;
  onSubmitFeedback?: (jobId: string, feedback: CustomerFeedback) => void;
  onSubmitClientResponse?: (
    jobId: string,
    payload: { responseType: string; message: string; persistedToCloud: boolean }
  ) => void;
  onExitCustomerView?: () => void;
  theme?: AppTheme;
  onToggleTheme?: () => void;
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
      return 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-500 dark:border-emerald-600';
    case 'Completed':
      return 'bg-white dark:bg-zinc-900 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800';
    case 'Awaiting Parts':
    case 'Awaiting Approval':
      return 'bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700';
    case 'Cancelled':
      return 'bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700';
    default:
      return 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white border-zinc-400 dark:border-zinc-700';
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
    publicAccessToken: job.publicAccessToken,
    customerFeedback: job.customerFeedback,
    _pdfRecord: verifiedByTokenOrPhone ? job : undefined,
  };
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor — Needs Attention',
  2: 'Fair — Below Expectations',
  3: 'Good — Satisfactory Service',
  4: 'Very Good — Reliable Repair',
  5: 'Excellent — Top Quality Service',
};

export const CustomerView: React.FC<CustomerViewProps> = ({
  onLookupJob,
  initialQuery = '',
  initialShowFeedback = false,
  sampleJobIds = [],
  centerName = 'BOSCH Authorised Service Center',
  centerPhone = '+1 (555) 019-2831',
  onSubmitFeedback,
  onSubmitClientResponse,
  onExitCustomerView,
  theme = 'dark',
  onToggleTheme,
}) => {
  const [lookupInput, setLookupInput] = useState(initialQuery);
  const [phoneLast4Input, setPhoneLast4Input] = useState('');
  const initialLookupResult = initialQuery ? onLookupJob(initialQuery) : null;
  const [matchedSummary, setMatchedSummary] = useState<PublicJobStatusSummary | null>(
    initialLookupResult?.status === 'found' ? initialLookupResult.summary : null
  );
  const [lookupNotice, setLookupNotice] = useState<{
    type: 'needs-verification' | 'invalid-phone' | 'not-found';
    jobId?: string;
  } | null>(() => {
    if (!initialLookupResult || initialLookupResult.status === 'found') return null;
    if (initialLookupResult.status === 'not-found') return { type: 'not-found' };
    return { type: initialLookupResult.status, jobId: initialLookupResult.jobId };
  });
  const [hasSearched, setHasSearched] = useState(Boolean(initialQuery));
  const [pdfSavedMsg, setPdfSavedMsg] = useState<string | null>(null);
  const [activeToken, setActiveToken] = useState<string>(() =>
    initialQuery && initialQuery.toLowerCase().startsWith('tok-') ? initialQuery : ''
  );

  // Customer Feedback form state
  const [ratingDraft, setRatingDraft] = useState<number>(
    () => matchedSummary?.customerFeedback?.rating || 0
  );
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [commentDraft, setCommentDraft] = useState<string>(
    () => matchedSummary?.customerFeedback?.comment || ''
  );
  const [isEditingFeedback, setIsEditingFeedback] = useState<boolean>(
    () => !matchedSummary?.customerFeedback
  );
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccessMsg, setFeedbackSuccessMsg] = useState<string | null>(null);
  const [isClientScannerOpen, setIsClientScannerOpen] = useState(false);
  const [responseTypeDraft, setResponseTypeDraft] = useState<string>('Approve Estimate');
  const [responseMsgDraft, setResponseMsgDraft] = useState<string>('');
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [responseSuccessMsg, setResponseSuccessMsg] = useState<string | null>(null);
  const feedbackSectionRef = useRef<HTMLElement | null>(null);
  const didAutoScrollFeedbackRef = useRef(false);

  const runLookup = async (queryText: string, last4?: string) => {
    const cleaned = queryText.trim();
    if (!cleaned) return;
    const cleanedLast4 = (last4 || '').replace(/\D/g, '').slice(-4);

    const localResult = onLookupJob(cleaned, cleanedLast4 || undefined);
    if (localResult.status === 'found') {
      setMatchedSummary(localResult.summary);
      setLookupNotice(null);
      setActiveToken(
        localResult.summary.publicAccessToken || (cleaned.toLowerCase().startsWith('tok-') ? cleaned : '')
      );
      setHasSearched(true);
      return;
    }

    if (localResult.status === 'needs-verification' || localResult.status === 'invalid-phone') {
      setMatchedSummary(null);
      setLookupNotice({ type: localResult.status, jobId: localResult.jobId });
      setHasSearched(true);
      return;
    }

    try {
      const params = new URLSearchParams({ query: cleaned });
      if (cleanedLast4) params.set('phoneLast4', cleanedLast4);
      const res = await fetch(resolveApiUrl(`/api/customer-portal/lookup?${params.toString()}`));
      if (res.ok) {
        const data = await res.json();
        if (data?.summary) {
          setMatchedSummary(data.summary);
          setLookupNotice(null);
          setActiveToken(cleaned.toLowerCase().startsWith('tok-') ? cleaned : '');
          setHasSearched(true);
          return;
        }
      } else if (res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        setMatchedSummary(null);
        setLookupNotice({
          type: cleanedLast4 ? 'invalid-phone' : 'needs-verification',
          jobId: errData?.jobId || cleaned,
        });
        setHasSearched(true);
        return;
      }
    } catch {
      // Fallback cleanly when offline or server lookup unavailable
    }

    setMatchedSummary(null);
    setLookupNotice({ type: 'not-found' });
    setHasSearched(true);
  };

  useEffect(() => {
    if (initialQuery) {
      setLookupInput(initialQuery);
      void runLookup(initialQuery);
    }
  }, [initialQuery]);

  // Sync feedback draft state when switching between matched job cards
  useEffect(() => {
    const existing = matchedSummary?.customerFeedback;
    setRatingDraft(existing?.rating || 0);
    setCommentDraft(existing?.comment || '');
    setIsEditingFeedback(!existing);
    setFeedbackError(null);
    setFeedbackSuccessMsg(null);
    setResponseError(null);
    setResponseSuccessMsg(null);
    setResponseMsgDraft('');
  }, [matchedSummary?.id, matchedSummary?.customerFeedback?.submittedAt]);

  // Scroll straight to the feedback survey when opened from an SMS feedback link (?feedback=1)
  useEffect(() => {
    if (
      initialShowFeedback &&
      matchedSummary &&
      feedbackSectionRef.current &&
      !didAutoScrollFeedbackRef.current
    ) {
      didAutoScrollFeedbackRef.current = true;
      setTimeout(() => {
        feedbackSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  }, [initialShowFeedback, matchedSummary]);

  // Keep matched ticket synced with live Firestore /publicDeliveries & server SSE
  useEffect(() => {
    const matchedId = matchedSummary?.id;
    const token =
      activeToken ||
      matchedSummary?.publicAccessToken ||
      (lookupInput.trim().toLowerCase().startsWith('tok-') ? lookupInput.trim() : '');

    if (!matchedId && !token) return;

    const unsubFirestore = token
      ? subscribePublicDeliveryStatus(token, (update) => {
          setMatchedSummary((prev) => {
            if (!prev && !update.id) return prev;
            const nextStatus = update.status || prev?.status || 'Intake';
            const prevHistory = prev?.stageHistory || [
              { status: nextStatus, enteredAt: update.intakeDate || new Date().toISOString() },
            ];
            const hasStatusInHistory = prevHistory.some((h) => h.status === nextStatus);
            return {
              id: update.id || prev?.id || matchedId || '',
              customerFirstName: prev?.customerFirstName || 'Client',
              maskedPhone: prev?.maskedPhone || 'On file',
              phoneLast4: prev?.phoneLast4 || '',
              hasCompany: prev?.hasCompany || false,
              customerCompany: prev?.customerCompany,
              toolBrand: update.toolBrand || prev?.toolBrand || 'Bosch Professional',
              toolCategory: prev?.toolCategory || 'Power Tool',
              toolModel: update.toolModel || prev?.toolModel || '',
              toolSerialMasked: prev?.toolSerialMasked || 'Verified Token',
              voltageRating: prev?.voltageRating || '',
              warrantyFlag: update.warrantyFlag || prev?.warrantyFlag || 'In-Warranty',
              warrantyStatusLabel: prev?.warrantyStatusLabel || 'Verified',
              accessoriesReceived: prev?.accessoriesReceived || [],
              grievanceCategory: prev?.grievanceCategory || 'Service Ticket',
              intakeDate: update.intakeDate || prev?.intakeDate || '',
              promisedCompletion: update.promisedCompletion || prev?.promisedCompletion || '',
              status: nextStatus,
              priority: prev?.priority || 'Low',
              estimatedTotal:
                typeof update.estimatedTotal === 'number'
                  ? update.estimatedTotal
                  : prev?.estimatedTotal || 0,
              partsCount: prev?.partsCount || 0,
              stageHistory: hasStatusInHistory
                ? prevHistory
                : [...prevHistory, { status: nextStatus, enteredAt: update.updatedAt || new Date().toISOString() }],
              updatedAt: update.updatedAt || new Date().toISOString(),
              verifiedByTokenOrPhone: prev?.verifiedByTokenOrPhone ?? Boolean(token),
              publicAccessToken: token,
              customerFeedback: update.customerFeedback || prev?.customerFeedback,
              _pdfRecord: prev?._pdfRecord
                ? {
                    ...prev._pdfRecord,
                    status: nextStatus,
                    promisedCompletion:
                      update.promisedCompletion || prev._pdfRecord.promisedCompletion,
                    totalAmount:
                      typeof update.estimatedTotal === 'number'
                        ? update.estimatedTotal
                        : prev._pdfRecord.totalAmount,
                    customerFeedback:
                      update.customerFeedback || prev._pdfRecord.customerFeedback,
                  }
                : undefined,
            };
          });
        })
      : () => {};

    let eventSource: EventSource | null = null;
    if (typeof window !== 'undefined' && typeof EventSource !== 'undefined') {
      const sseParams = new URLSearchParams();
      if (token) sseParams.set('token', token);
      if (matchedId) sseParams.set('jobId', matchedId);
      if (sseParams.toString()) {
        eventSource = new EventSource(resolveApiUrl(`/api/customer-portal/stream?${sseParams.toString()}`));
        eventSource.addEventListener('delivery:updated', (evt) => {
          try {
            const payload = JSON.parse((evt as MessageEvent).data);
            if (payload?.id) {
              setMatchedSummary((prev) => ({
                ...(prev || {}),
                ...payload,
                publicAccessToken: token || prev?.publicAccessToken,
                _pdfRecord: prev?._pdfRecord
                  ? {
                      ...prev._pdfRecord,
                      status: payload.status || prev._pdfRecord.status,
                      totalAmount: payload.estimatedTotal ?? prev._pdfRecord.totalAmount,
                      promisedCompletion:
                        payload.promisedCompletion || prev._pdfRecord.promisedCompletion,
                    }
                  : undefined,
              }));
            }
          } catch {
            // Ignore malformed SSE event payload
          }
        });
      }
    }

    return () => {
      unsubFirestore();
      eventSource?.close();
    };
  }, [matchedSummary?.id, activeToken]);

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = lookupInput.trim();
    if (!cleaned) return;
    setPdfSavedMsg(null);
    void runLookup(cleaned, phoneLast4Input.trim() || undefined);
  };

  const handleQuickSampleLookup = (sampleId: string) => {
    setLookupInput(sampleId);
    setPhoneLast4Input('');
    setMatchedSummary(null);
    setPdfSavedMsg(null);
    void runLookup(sampleId);
  };

  const handleDownloadCustomerReceipt = () => {
    if (!matchedSummary || !matchedSummary.verifiedByTokenOrPhone) return;
    const pdfSource: JobCard = matchedSummary._pdfRecord || {
      id: matchedSummary.id,
      customerName: matchedSummary.customerFirstName,
      customerCompany: matchedSummary.customerCompany,
      customerPhone: matchedSummary.maskedPhone,
      tool: {
        brand: (matchedSummary.toolBrand || 'Bosch Professional') as JobCard['tool']['brand'],
        category: (matchedSummary.toolCategory || 'Rotary Hammer / SDS') as JobCard['tool']['category'],
        modelNumber: matchedSummary.toolModel,
        serialNumber: matchedSummary.toolSerialMasked,
        voltageRating: matchedSummary.voltageRating || '230V AC',
        warrantyStatus: 'Unconfirmed',
        warrantyFlag: matchedSummary.warrantyFlag,
        physicalCondition: 'Recorded at intake',
        accessoriesReceived: matchedSummary.accessoriesReceived || [],
      },
      serviceReq: {
        grievanceCategory: (matchedSummary.grievanceCategory || 'Routine Maintenance / Carbon Brush Check') as JobCard['serviceReq']['grievanceCategory'],
        detailedComplaint: 'Client portal service summary',
        serviceType: 'Diagnostic & Repair',
        preApprovedLimit: 0,
      },
      intakeDate: matchedSummary.intakeDate,
      promisedCompletion: matchedSummary.promisedCompletion,
      status: matchedSummary.status,
      priority: 'Low',
      technician: 'Service Bench',
      laborHours: 0,
      laborRate: 0,
      discount: 0,
      taxRate: 0,
      parts: [],
      totalAmount: matchedSummary.estimatedTotal,
      messageLogs: [],
      publicAccessToken: matchedSummary.publicAccessToken,
      stageHistory: matchedSummary.stageHistory,
      createdAt: matchedSummary.intakeDate,
      updatedAt: matchedSummary.updatedAt,
    };
    const { doc, filename } = generateJobCardPdf(pdfSource, {
      centerName,
      phone: centerPhone,
    });
    doc.save(filename);
    setPdfSavedMsg(`Downloaded ${filename}`);
    setTimeout(() => setPdfSavedMsg(null), 3500);
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchedSummary) return;

    if (ratingDraft < 1 || ratingDraft > 5) {
      setFeedbackError('Select a star rating between 1 and 5 before submitting.');
      return;
    }

    setIsSubmittingFeedback(true);
    setFeedbackError(null);
    setFeedbackSuccessMsg(null);

    const nowIso = new Date().toISOString();
    const trimmedComment = commentDraft.trim().slice(0, 1000);
    const channel: 'SMS' | 'Portal' = initialShowFeedback ? 'SMS' : 'Portal';
    let savedFeedback: CustomerFeedback = {
      rating: ratingDraft,
      comment: trimmedComment,
      submittedAt: nowIso,
      channel,
      customerName: matchedSummary.customerFirstName,
    };

    try {
      const lookupKey =
        activeToken ||
        matchedSummary.publicAccessToken ||
        matchedSummary.id;

      const res = await fetch(resolveApiUrl('/api/customer-portal/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: lookupKey,
          rating: ratingDraft,
          comment: trimmedComment,
          phoneLast4: phoneLast4Input.trim() || undefined,
          channel,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setFeedbackError(data?.error || 'Phone verification digits do not match this service ticket.');
        setIsSubmittingFeedback(false);
        return;
      }

      if (res.ok && data?.feedback) {
        savedFeedback = {
          ...savedFeedback,
          ...data.feedback,
        };
      }
    } catch {
      // Offline or unseeded demo ticket: persist into client workshop store below
    }

    onSubmitFeedback?.(matchedSummary.id, savedFeedback);
    setMatchedSummary((prev) =>
      prev
        ? {
            ...prev,
            customerFeedback: savedFeedback,
            _pdfRecord: prev._pdfRecord
              ? { ...prev._pdfRecord, customerFeedback: savedFeedback }
              : undefined,
          }
        : prev
    );
    setIsEditingFeedback(false);
    setFeedbackSuccessMsg(`Thank you! Saved ${savedFeedback.rating}/5 rating to Job Card ${matchedSummary.id}.`);
    setIsSubmittingFeedback(false);
  };

  const handleClientResponseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchedSummary || !matchedSummary.verifiedByTokenOrPhone) return;

    const trimmedMsg = responseMsgDraft.trim().slice(0, 1000);
    if (!trimmedMsg) {
      setResponseError('Write a brief response before sending.');
      return;
    }

    setIsSubmittingResponse(true);
    setResponseError(null);
    setResponseSuccessMsg(null);

    let persistedToCloud = false;
    try {
      const lookupKey =
        activeToken ||
        matchedSummary.publicAccessToken ||
        matchedSummary.id;

      const res = await fetch(resolveApiUrl('/api/customer-portal/response'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: lookupKey,
          responseType: responseTypeDraft,
          message: trimmedMsg,
          phoneLast4: phoneLast4Input.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setResponseError(data?.error || 'Phone verification digits do not match this ticket.');
        setIsSubmittingResponse(false);
        return;
      }
      persistedToCloud = Boolean(res.ok && data?.success);
    } catch {
      persistedToCloud = false;
    }

    onSubmitClientResponse?.(matchedSummary.id, {
      responseType: responseTypeDraft,
      message: trimmedMsg,
      persistedToCloud,
    });

    setResponseMsgDraft('');
    setResponseSuccessMsg(
      `Response logged on Job Card ${matchedSummary.id} (${responseTypeDraft}).`
    );
    setIsSubmittingResponse(false);
  };

  const currentStepIndex = matchedSummary
    ? CUSTOMER_MILESTONES.findIndex((m) => m.matches.includes(matchedSummary.status))
    : -1;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-100 flex flex-col font-sans">
      {/* Isolated Customer Portal Header (No Internal Nav, Inventory, or Staff Controls) */}
      <header className="bg-white/95 dark:bg-zinc-950/95 border-b border-zinc-300 dark:border-zinc-800 sticky top-0 z-30 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-400 dark:border-zinc-700 flex items-center justify-center text-zinc-950 dark:text-white">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-zinc-950 dark:text-white font-mono uppercase tracking-tight">
                {centerName}
              </div>
              <div className="text-[11px] text-zinc-700 dark:text-zinc-400 flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                <span>Customer Self-Service Status Tracker</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-pressed={theme === 'light'}
                aria-label={
                  theme === 'dark' ? 'Switch to high-contrast light theme' : 'Switch to dark theme'
                }
                className="px-2.5 py-1.5 text-xs font-bold font-mono text-zinc-900 dark:text-zinc-200 bg-white dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 rounded-xl flex items-center gap-1.5 transition-colors"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                    <span className="hidden sm:inline">Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-zinc-900" />
                    <span className="hidden sm:inline">Dark</span>
                  </>
                )}
              </button>
            )}

            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-mono text-zinc-700 dark:text-zinc-400 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-800">
              <Phone className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
              <span>{centerPhone}</span>
            </span>

            {onExitCustomerView && (
              <button
                onClick={onExitCustomerView}
                className="px-3 py-1.5 text-xs font-bold font-mono text-zinc-900 dark:text-zinc-200 bg-white dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 rounded-xl flex items-center gap-1.5 transition-colors"
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
        <section className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="space-y-1">
            <h1 className="text-lg sm:text-xl font-extrabold text-zinc-950 dark:text-white font-mono uppercase tracking-tight">
              Check Your Tool Repair Status
            </h1>
            <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-400">
              Enter your Job Card number (printed on your intake slip) or private status token to view live service progress.
            </p>
          </div>

          <form onSubmit={handleLookupSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 font-mono">
            <div className="sm:col-span-5 relative">
              <Search className="w-4 h-4 text-zinc-600 dark:text-zinc-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                placeholder="Job Card ID (e.g. BOSCH-2026-0041) or Token"
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 focus:border-zinc-950 dark:focus:border-white rounded-xl pl-10 pr-3 py-2.5 text-xs text-zinc-950 dark:text-white placeholder-zinc-500 focus:outline-none"
                required
              />
            </div>

            <div className="sm:col-span-3">
              <input
                type="text"
                maxLength={4}
                value={phoneLast4Input}
                onChange={(e) => setPhoneLast4Input(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Phone Last 4 (Required for ID)"
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 focus:border-zinc-950 dark:focus:border-white rounded-xl px-3 py-2.5 text-xs text-zinc-950 dark:text-white placeholder-zinc-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="sm:col-span-2 py-2.5 px-3 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow"
            >
              <Search className="w-4 h-4" />
              <span>Track</span>
            </button>

            <button
              type="button"
              onClick={() => setIsClientScannerOpen(true)}
              className="sm:col-span-2 py-2.5 px-3 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 text-zinc-950 dark:text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
              title="Scan Job Card QR Code (view-only ticket scope)"
            >
              <QrCode className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>Scan QR</span>
            </button>
          </form>

          {sampleJobIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-mono">
              <span className="text-zinc-600 dark:text-zinc-500">Quick Demo Lookup:</span>
              {sampleJobIds.slice(0, 4).map((sampleId) => (
                <button
                  key={sampleId}
                  type="button"
                  onClick={() => handleQuickSampleLookup(sampleId)}
                  className={`px-2.5 py-1 rounded-lg border transition-colors ${
                    matchedSummary?.id === sampleId
                      ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-zinc-950 dark:border-white font-bold'
                      : 'bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-300 border-zinc-300 dark:border-zinc-800 hover:border-zinc-500 dark:hover:border-zinc-600'
                  }`}
                >
                  {sampleId}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Verification Required / Invalid Phone / Not Found Feedback */}
        {hasSearched && !matchedSummary && lookupNotice && (lookupNotice.type === 'needs-verification' || lookupNotice.type === 'invalid-phone') && (
          <div className="bg-white dark:bg-zinc-900 border border-amber-300 dark:border-amber-700/70 rounded-2xl p-6 text-center space-y-2 shadow-lg">
            <Lock className="w-7 h-7 text-amber-700 dark:text-amber-400 mx-auto" />
            <h2 className="text-sm font-bold text-zinc-950 dark:text-white font-mono uppercase">
              {lookupNotice.type === 'invalid-phone'
                ? 'Phone Verification Digits Do Not Match'
                : 'Phone Verification Required'}
            </h2>
            <p className="text-xs text-zinc-800 dark:text-zinc-300 max-w-md mx-auto">
              {lookupNotice.type === 'invalid-phone'
                ? `The last 4 digits entered do not match the client phone number on ticket ${lookupNotice.jobId || lookupInput}. Re-enter the correct 4 digits or use your private tracking token link.`
                : `Ticket ${lookupNotice.jobId || lookupInput} exists. Enter the last 4 digits of the client phone number in the field above to unlock repair progress and PDF receipt download.`}
            </p>
          </div>
        )}

        {hasSearched && !matchedSummary && (!lookupNotice || lookupNotice.type === 'not-found') && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-8 text-center space-y-2 shadow-lg">
            <AlertCircle className="w-8 h-8 text-amber-700 dark:text-amber-400 mx-auto" />
            <h2 className="text-sm font-bold text-zinc-950 dark:text-white font-mono uppercase">
              No Matching Service Ticket Found
            </h2>
            <p className="text-xs text-zinc-700 dark:text-zinc-400 max-w-md mx-auto">
              Verify your Job Card ID (for example <code className="text-zinc-900 dark:text-zinc-200">BOSCH-2026-0041</code>) and private token or phone last 4 digits.
            </p>
          </div>
        )}

        {/* Sanitized Customer Job Status Card */}
        {matchedSummary && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Status Header Banner */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-300 dark:border-zinc-800 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-xl font-extrabold text-zinc-950 dark:text-white font-mono">
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
                          ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                          : 'bg-amber-50 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700/70'
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
                  <p className="text-xs text-zinc-700 dark:text-zinc-400 mt-1.5 font-mono">
                    Customer: <strong className="text-zinc-900 dark:text-zinc-200">{matchedSummary.customerFirstName}</strong> ({matchedSummary.maskedPhone})
                    {matchedSummary.customerCompany ? ` · ${matchedSummary.customerCompany}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleDownloadCustomerReceipt}
                    disabled={!matchedSummary.verifiedByTokenOrPhone}
                    className={`px-4 py-2 font-bold rounded-xl text-xs font-mono flex items-center gap-1.5 shadow transition-all ${
                      matchedSummary.verifiedByTokenOrPhone
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95'
                        : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400 cursor-not-allowed opacity-70'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {!matchedSummary.verifiedByTokenOrPhone
                        ? 'Verify phone last 4 for PDF'
                        : pdfSavedMsg
                        ? 'PDF Saved'
                        : 'Download PDF Receipt'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Ready for Pickup Highlight Banner */}
              {matchedSummary.status === 'Ready for Pickup' && (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 flex items-center gap-3 text-emerald-800 dark:text-emerald-200">
                  <PackageCheck className="w-6 h-6 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <div className="text-xs space-y-0.5">
                    <div className="font-bold text-sm text-emerald-800 dark:text-emerald-300 font-mono">
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
                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 font-mono">
                  This service ticket has been marked as <strong>Cancelled</strong>. Please contact {centerPhone} if you have questions.
                </div>
              ) : (
                /* Repair Progress Stepper */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono text-zinc-700 dark:text-zinc-400">
                    <span className="uppercase tracking-wider font-bold text-zinc-800 dark:text-zinc-300">
                      Live Repair Milestone Progress
                    </span>
                    <span>Promised Completion: <strong className="text-zinc-950 dark:text-white">{matchedSummary.promisedCompletion}</strong></span>
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
                              ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-zinc-950 dark:border-white shadow-lg'
                              : isDone
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800/80'
                              : 'bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-500 border-zinc-300 dark:border-zinc-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-bold">
                              STEP {idx + 1}
                            </span>
                            {isDone ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                            ) : isCurrent ? (
                              <Sparkles className="w-3.5 h-3.5 text-zinc-950" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 text-zinc-600" />
                            )}
                          </div>
                          <div className="text-xs font-bold leading-tight">{step.label}</div>
                          <div
                            className={`text-[10px] leading-snug ${
                              isCurrent ? 'text-zinc-700' : isDone ? 'text-emerald-800 dark:text-emerald-300/80' : 'text-zinc-600 dark:text-zinc-500'
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
              <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-5 space-y-3 shadow-lg">
                <h2 className="text-xs font-bold text-zinc-950 dark:text-white uppercase tracking-wider font-mono flex items-center gap-2 border-b border-zinc-300 dark:border-zinc-800 pb-2.5">
                  <Wrench className="w-4 h-4 text-zinc-950 dark:text-white" />
                  <span>Tool &amp; Intake Details</span>
                </h2>

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-zinc-700 dark:text-zinc-400">Tool Model:</span>
                    <span className="text-zinc-950 dark:text-white font-bold text-right">
                      {matchedSummary.toolBrand} {matchedSummary.toolModel}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-700 dark:text-zinc-400">Category:</span>
                    <span className="text-zinc-900 dark:text-zinc-200">{matchedSummary.toolCategory}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-700 dark:text-zinc-400">Serial Number:</span>
                    <span className="text-zinc-900 dark:text-zinc-200">{matchedSummary.toolSerialMasked}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-700 dark:text-zinc-400">Reported Issue:</span>
                    <span className="text-zinc-900 dark:text-zinc-200 text-right">{matchedSummary.grievanceCategory}</span>
                  </div>
                  <div className="pt-2 border-t border-zinc-300/80 dark:border-zinc-800/80">
                    <span className="text-zinc-700 dark:text-zinc-400 block mb-1">Accessories Checked In:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {matchedSummary.accessoriesReceived.length > 0 ? (
                        matchedSummary.accessoriesReceived.map((acc) => (
                          <span
                            key={acc}
                            className="px-2 py-0.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-[11px] text-zinc-800 dark:text-zinc-300"
                          >
                            {acc}
                          </span>
                        ))
                      ) : (
                        <span className="text-zinc-600 dark:text-zinc-500">Bare tool only</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-5 space-y-3 shadow-lg flex flex-col justify-between">
                <div className="space-y-3">
                  <h2 className="text-xs font-bold text-zinc-950 dark:text-white uppercase tracking-wider font-mono flex items-center gap-2 border-b border-zinc-300 dark:border-zinc-800 pb-2.5">
                    <FileText className="w-4 h-4 text-zinc-950 dark:text-white" />
                    <span>Schedule &amp; Billing Summary</span>
                  </h2>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-zinc-700 dark:text-zinc-400 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> Intake Date:
                      </span>
                      <span className="text-zinc-900 dark:text-zinc-200">{matchedSummary.intakeDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-700 dark:text-zinc-400">Promised Target:</span>
                      <span className="text-zinc-950 dark:text-white font-bold">{matchedSummary.promisedCompletion}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-700 dark:text-zinc-400">Warranty Classification:</span>
                      <span className="text-zinc-900 dark:text-zinc-200">{matchedSummary.warrantyFlag}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-700 dark:text-zinc-400">Replacement Parts Used:</span>
                      <span className="text-zinc-900 dark:text-zinc-200">{matchedSummary.partsCount} line item(s)</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-300 dark:border-zinc-800 flex items-center justify-between font-mono">
                  <span className="text-xs text-zinc-700 dark:text-zinc-400 uppercase font-bold">
                    Estimated / Billed Total
                  </span>
                  <span className="text-xl font-extrabold text-zinc-950 dark:text-white">
                    ${matchedSummary.estimatedTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Client Response / Approval Note Card (Scoped to matched Job ID) */}
            <section
              aria-labelledby="client-response-heading"
              className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-300 dark:border-zinc-800 pb-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-emerald-700 dark:text-emerald-400 shrink-0">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h2
                      id="client-response-heading"
                      className="text-sm font-bold text-zinc-950 dark:text-white font-mono uppercase tracking-wider"
                    >
                      Respond to Service Desk
                    </h2>
                    <p className="text-xs text-zinc-700 dark:text-zinc-400 mt-0.5">
                      Send an approval, callback request, or pickup message for Job Card {matchedSummary.id}.
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
                  Client Scope: {matchedSummary.id}
                </span>
              </div>

              {responseSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 text-xs font-mono text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span>{responseSuccessMsg}</span>
                </div>
              )}

              {responseError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-xs font-mono text-rose-800 dark:text-rose-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-700 dark:text-rose-400 shrink-0" />
                  <span>{responseError}</span>
                </div>
              )}

              <form onSubmit={handleClientResponseSubmit} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 font-mono">
                  {(['Approve Estimate', 'Schedule Callback', 'Confirm Pickup Time', 'General Question'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setResponseTypeDraft(option)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                        responseTypeDraft === option
                          ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-zinc-950 dark:border-white'
                          : 'bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-300 border-zinc-300 dark:border-zinc-800 hover:border-zinc-500'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={2}
                  maxLength={1000}
                  value={responseMsgDraft}
                  onChange={(e) => setResponseMsgDraft(e.target.value)}
                  placeholder={`Write your message for Job Card ${matchedSummary.id}...`}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 focus:border-zinc-950 dark:focus:border-white rounded-xl p-3 text-xs text-zinc-950 dark:text-white placeholder-zinc-500 focus:outline-none leading-relaxed"
                />

                <div className="flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={isSubmittingResponse || !responseMsgDraft.trim() || !matchedSummary.verifiedByTokenOrPhone}
                    className="px-4 py-2 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 text-white dark:text-zinc-950 font-bold rounded-xl text-xs font-mono flex items-center gap-2 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSubmittingResponse ? 'Sending...' : 'Send Response'}</span>
                  </button>
                </div>
              </form>
            </section>

            {/* Customer Feedback Rating & Comment Survey Card */}
            <section
              ref={feedbackSectionRef}
              aria-labelledby="customer-feedback-heading"
              className={`bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-xl space-y-4 border ${
                initialShowFeedback || matchedSummary.status === 'Completed'
                  ? 'border-emerald-300 dark:border-emerald-700/80'
                  : 'border-zinc-300 dark:border-zinc-800'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-300 dark:border-zinc-800 pb-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-amber-700 dark:text-amber-400 shrink-0">
                    <Star className="w-4 h-4 fill-amber-400" />
                  </div>
                  <div>
                    <h2
                      id="customer-feedback-heading"
                      className="text-sm font-bold text-zinc-950 dark:text-white font-mono uppercase tracking-wider"
                    >
                      Rate Your Service Experience
                    </h2>
                    <p className="text-xs text-zinc-700 dark:text-zinc-400 mt-0.5">
                      Share a 1–5 star rating and quick comment for Job Card {matchedSummary.id}. Feedback is saved directly on your service record.
                    </p>
                  </div>
                </div>

                {matchedSummary.customerFeedback && !isEditingFeedback && (
                  <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Feedback Recorded</span>
                  </span>
                )}
              </div>

              {feedbackSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 text-xs font-mono text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span>{feedbackSuccessMsg}</span>
                </div>
              )}

              {feedbackError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-xs font-mono text-rose-800 dark:text-rose-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-700 dark:text-rose-400 shrink-0" />
                  <span>{feedbackError}</span>
                </div>
              )}

              {matchedSummary.customerFeedback && !isEditingFeedback ? (
                <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1" aria-label={`Rated ${matchedSummary.customerFeedback.rating} out of 5 stars`}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-5 h-5 ${
                              star <= (matchedSummary.customerFeedback?.rating || 0)
                                ? 'text-amber-500 dark:text-amber-400 fill-amber-400'
                                : 'text-zinc-700'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-bold text-zinc-950 dark:text-white font-mono tabular-nums ml-1">
                        {matchedSummary.customerFeedback.rating}.0 / 5.0
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-700 dark:text-zinc-400">
                      <span>
                        Submitted:{' '}
                        <strong className="text-zinc-900 dark:text-zinc-200">
                          {matchedSummary.customerFeedback.submittedAt.slice(0, 16).replace('T', ' ')}
                        </strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsEditingFeedback(true)}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-400 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 font-bold transition-colors"
                      >
                        Edit Review
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-900 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-300/80 dark:border-zinc-800/80 rounded-xl p-3 leading-relaxed flex items-start gap-2">
                    <MessageSquare className="w-4 h-4 text-zinc-600 dark:text-zinc-500 shrink-0 mt-0.5" />
                    <span>
                      {matchedSummary.customerFeedback.comment || 'No additional written comments left.'}
                    </span>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <span className="block text-xs font-mono font-bold text-zinc-800 dark:text-zinc-300 uppercase">
                      Select Rating (1 to 5 Stars)
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {[1, 2, 3, 4, 5].map((starValue) => {
                        const activeScore = hoverRating || ratingDraft;
                        const isFilled = starValue <= activeScore;
                        return (
                          <button
                            key={starValue}
                            type="button"
                            onMouseEnter={() => setHoverRating(starValue)}
                            onMouseLeave={() => setHoverRating(0)}
                            onClick={() => {
                              setRatingDraft(starValue);
                              setFeedbackError(null);
                            }}
                            aria-label={`Rate ${starValue} out of 5 stars`}
                            aria-pressed={ratingDraft === starValue}
                            className={`min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl border transition-all flex items-center justify-center gap-1.5 font-mono text-xs font-bold ${
                              isFilled
                                ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-500 dark:border-amber-500 text-amber-900 dark:text-amber-300'
                                : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-400 hover:border-zinc-500 dark:hover:border-zinc-600'
                            }`}
                          >
                            <Star
                              className={`w-4 h-4 ${
                                isFilled ? 'text-amber-500 dark:text-amber-400 fill-amber-400' : 'text-zinc-600'
                              }`}
                            />
                            <span className="tabular-nums">{starValue}</span>
                          </button>
                        );
                      })}

                      {(hoverRating || ratingDraft) > 0 && (
                        <span className="text-xs font-mono text-zinc-800 dark:text-zinc-300 ml-1">
                          {RATING_LABELS[hoverRating || ratingDraft]}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <label htmlFor="customer-feedback-comment" className="font-bold text-zinc-800 dark:text-zinc-300 uppercase">
                        Service Comments (Optional)
                      </label>
                      <span className="text-[11px] text-zinc-600 dark:text-zinc-500 tabular-nums">
                        {commentDraft.length}/1000
                      </span>
                    </div>
                    <textarea
                      id="customer-feedback-comment"
                      rows={3}
                      maxLength={1000}
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      placeholder="How was the repair turnaround, tool performance, and pickup communication?"
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 focus:border-zinc-950 dark:focus:border-white rounded-xl p-3 text-xs text-zinc-950 dark:text-white placeholder-zinc-500 focus:outline-none leading-relaxed"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {matchedSummary.customerFeedback && (
                      <button
                        type="button"
                        onClick={() => {
                          setRatingDraft(matchedSummary.customerFeedback?.rating || 0);
                          setCommentDraft(matchedSummary.customerFeedback?.comment || '');
                          setIsEditingFeedback(false);
                        }}
                        className="px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-300 border border-zinc-400 dark:border-zinc-700 font-bold rounded-xl text-xs font-mono"
                      >
                        Cancel
                      </button>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmittingFeedback || ratingDraft < 1}
                      className="px-5 py-2.5 bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 text-white dark:text-zinc-950 font-bold rounded-xl text-xs font-mono flex items-center gap-2 transition-all active:scale-95 shadow"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {isSubmittingFeedback
                          ? 'Saving Feedback...'
                          : matchedSummary.customerFeedback
                          ? 'Update Feedback'
                          : 'Submit Rating & Feedback'}
                      </span>
                    </button>
                  </div>
                </form>
              )}
            </section>
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-200 dark:border-zinc-900 py-4 text-center text-[11px] text-zinc-600 dark:text-zinc-500 font-mono">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>{centerName} · Read-Only Client Status Portal</span>
          <span>Need assistance? Call {centerPhone}</span>
        </div>
      </footer>

      {isClientScannerOpen && (
        <SerialBarcodeScannerModal
          title="Scan Your Job Card QR Code"
          subtitle="Client access opens read-only progress and response controls for your specific Job ID"
          prioritizeQr
          onDetected={(result) => {
            setIsClientScannerOpen(false);
            const parsed = parseProductQrPayload(result.rawValue);
            const targetQuery = parsed.token || parsed.jobId || result.rawValue.trim();
            if (targetQuery) {
              setLookupInput(targetQuery);
              setPhoneLast4Input('');
              void runLookup(targetQuery);
            }
          }}
          onClose={() => setIsClientScannerOpen(false)}
        />
      )}
    </div>
  );
};
