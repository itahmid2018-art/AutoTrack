import React, { useState, useEffect } from 'react';
import { JobCard, JobStatus, JobPriority } from '../types';
import { SHOP_TECHNICIANS } from '../data/mockTechnicians';
import { adjudicateWarranty } from '../utils/warrantyAdjudicator';
import { 
  Search, 
  Wrench, 
  UserCheck, 
  Clock, 
  FileText, 
  Printer, 
  MessageSquare, 
  Eye, 
  AlertTriangle, 
  ChevronLeft, 
  ChevronRight,
  SlidersHorizontal,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Settings2,
  Hourglass
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface KanbanBoardProps {
  jobCards: JobCard[];
  onQuickStatusChange: (jobId: string, newStatus: JobStatus) => void;
  onUpdateJobCard: (updatedJob: JobCard) => void;
  onSelectJob: (job: JobCard) => void;
  onPrintJobCard: (job: JobCard) => void;
  onSendPdfToCustomer: (job: JobCard) => void;
  onOpenWhatsApp: (job: JobCard) => void;
  onOpenAiDiagnosis?: (job: JobCard) => void;
}

const KANBAN_COLUMNS: { status: JobStatus; title: string; subtitle: string; badgeClass: string; matchStatuses?: JobStatus[] }[] = [
  { status: 'Intake', title: '1. Intake', subtitle: 'Received & Queued', badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700' },
  { status: 'Diagnosis', title: '2. Diagnosis', subtitle: 'Teardown & AI Check', badgeClass: 'bg-zinc-800 text-white border-zinc-600 font-bold' },
  { status: 'Awaiting Approval', title: '3. Approval', subtitle: 'Quote Sent to Client', badgeClass: 'bg-zinc-800 text-zinc-200 border-zinc-600' },
  { status: 'Awaiting Parts', title: '4. Awaiting Parts', subtitle: 'Backorder / Vendor Hold', badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-700/60 font-bold' },
  {
    status: 'In Service',
    title: '5. In Repair',
    subtitle: 'Bench Repair / In Service',
    badgeClass: 'bg-zinc-100 text-zinc-950 border-white font-bold',
    matchStatuses: ['In Service', 'In Repair'],
  },
  { status: 'Ready for Pickup', title: '6. Ready', subtitle: 'Tested & Cleaned', badgeClass: 'bg-white text-zinc-950 border-white font-extrabold' },
  { status: 'Completed', title: '7. Completed', subtitle: 'Handed Over / Closed', badgeClass: 'bg-zinc-950 text-zinc-500 border-zinc-800' },
];

const DEFAULT_STAGE_SLA_DAYS: Record<JobStatus, number> = {
  Intake: 1,
  Diagnosis: 2,
  'Awaiting Approval': 2,
  'Awaiting Parts': 5,
  'In Repair': 5,
  'In Service': 5,
  'Ready for Pickup': 5,
  Completed: 0,
  Cancelled: 0,
};

const FIVE_DAY_CRITICAL_STATUSES: JobStatus[] = ['Awaiting Parts', 'In Repair', 'In Service'];

export interface StatusDurationEntry {
  status: JobStatus;
  displayStatus: string;
  durationMs: number;
  daysFloat: number;
  label: string;
  isCurrent: boolean;
  exceedsFiveDays: boolean;
}

const parseTimestampMs = (raw?: string): number | null => {
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parsed = new Date(normalized).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

const formatDurationShort = (diffMs: number): string => {
  const safeMs = Math.max(0, diffMs);
  const hoursTotal = Math.floor(safeMs / (1000 * 60 * 60));
  if (hoursTotal < 1) return '< 1h';
  if (hoursTotal < 24) return `${hoursTotal}h`;
  const days = Math.floor(hoursTotal / 24);
  const remHours = hoursTotal % 24;
  return `${days}d ${remHours}h`;
};

const getDisplayStatusLabel = (status: JobStatus): string => {
  if (status === 'In Service' || status === 'In Repair') return 'In Repair';
  return status;
};

export const calculateTimeSpentPerStatus = (job: JobCard, nowMs: number): StatusDurationEntry[] => {
  const events: { status: JobStatus; enteredMs: number }[] = [];

  if (job.stageHistory && job.stageHistory.length > 0) {
    for (const h of job.stageHistory) {
      const ms = parseTimestampMs(h.enteredAt);
      if (ms !== null) {
        events.push({ status: h.status, enteredMs: ms });
      }
    }
    events.sort((a, b) => a.enteredMs - b.enteredMs);
  }

  const currentStageStartMs =
    parseTimestampMs(job.stageEnteredAt) ??
    parseTimestampMs(job.updatedAt) ??
    parseTimestampMs(job.intakeDate) ??
    parseTimestampMs(job.createdAt) ??
    nowMs;

  if (events.length === 0) {
    const intakeStartMs = parseTimestampMs(job.createdAt) ?? parseTimestampMs(job.intakeDate) ?? currentStageStartMs;
    if (job.status !== 'Intake' && currentStageStartMs > intakeStartMs) {
      events.push({ status: 'Intake', enteredMs: intakeStartMs });
    }
    events.push({ status: job.status, enteredMs: currentStageStartMs });
  } else {
    const lastEvent = events[events.length - 1];
    if (lastEvent.status !== job.status) {
      events.push({
        status: job.status,
        enteredMs: Math.max(lastEvent.enteredMs, currentStageStartMs),
      });
    }
  }

  const totalsByStatus = new Map<JobStatus, number>();
  const statusOrder: JobStatus[] = [];

  for (let i = 0; i < events.length; i++) {
    const curr = events[i];
    const nextMs = i < events.length - 1 ? events[i + 1].enteredMs : nowMs;
    const segmentMs = Math.max(0, nextMs - curr.enteredMs);
    if (!totalsByStatus.has(curr.status)) {
      totalsByStatus.set(curr.status, 0);
      statusOrder.push(curr.status);
    }
    totalsByStatus.set(curr.status, (totalsByStatus.get(curr.status) || 0) + segmentMs);
  }

  return statusOrder.map((st) => {
    const durationMs = totalsByStatus.get(st) || 0;
    const daysFloat = durationMs / (1000 * 60 * 60 * 24);
    const isCriticalStatus = FIVE_DAY_CRITICAL_STATUSES.includes(st);
    return {
      status: st,
      displayStatus: getDisplayStatusLabel(st),
      durationMs,
      daysFloat,
      label: formatDurationShort(durationMs),
      isCurrent: st === job.status,
      exceedsFiveDays: isCriticalStatus && daysFloat > 5,
    };
  });
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  jobCards,
  onQuickStatusChange,
  onUpdateJobCard,
  onSelectJob,
  onPrintJobCard,
  onSendPdfToCustomer,
  onOpenWhatsApp,
  onOpenAiDiagnosis,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTechFilter, setSelectedTechFilter] = useState<string>('All');
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState<string>('All');
  const [showSlaBreachesOnly, setShowSlaBreachesOnly] = useState(false);
  const [showSlaConfig, setShowSlaConfig] = useState(false);
  const [stageThresholds, setStageThresholds] = useState<Record<JobStatus, number>>(DEFAULT_STAGE_SLA_DAYS);
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<JobStatus | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Refresh timer every minute so "Time in Stage" counters remain live
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Compute Time in Stage, per-status history breakdown, and >5-day warning status
  const getTimeInStage = (job: JobCard) => {
    const thresholdDays = stageThresholds[job.status] || 0;
    const statusBreakdown = calculateTimeSpentPerStatus(job, nowMs);
    const currentEntry = statusBreakdown.find((s) => s.isCurrent);
    const rawStageStart = job.stageEnteredAt || job.updatedAt || job.intakeDate;
    const startMs = parseTimestampMs(rawStageStart);

    const diffMs =
      currentEntry && currentEntry.durationMs > 0
        ? currentEntry.durationMs
        : startMs !== null
        ? Math.max(0, nowMs - startMs)
        : 0;

    const hoursTotal = Math.floor(diffMs / (1000 * 60 * 60));
    const daysFloat = diffMs / (1000 * 60 * 60 * 24);
    const label = formatDurationShort(diffMs);

    const isFiveDayStageWarning =
      FIVE_DAY_CRITICAL_STATUSES.includes(job.status) && daysFloat > 5;
    const isOverdue =
      isFiveDayStageWarning || (thresholdDays > 0 && daysFloat > thresholdDays);
    const isCritical =
      isFiveDayStageWarning || (thresholdDays > 0 && daysFloat >= thresholdDays * 1.5);
    const effectiveLimit = isFiveDayStageWarning ? 5 : thresholdDays;
    const overdueDays = isOverdue ? Math.max(1, Math.floor(daysFloat - effectiveLimit + 1)) : 0;

    return {
      label,
      daysFloat,
      hoursTotal,
      thresholdDays,
      isOverdue,
      isCritical,
      isFiveDayStageWarning,
      overdueDays,
      statusBreakdown,
    };
  };

  // Calculate total elapsed time from intake date
  const getElapsedTime = (intakeDateStr: string) => {
    const intakeMs = parseTimestampMs(intakeDateStr);
    if (intakeMs === null) return 'Recently';
    return `${formatDurationShort(nowMs - intakeMs)} total`;
  };

  const fiveDayWarningCount = jobCards.filter((j) => getTimeInStage(j).isFiveDayStageWarning).length;
  const overdueCount = jobCards.filter((j) => getTimeInStage(j).isOverdue).length;

  // Filter jobs based on search term, technician, priority, and SLA breach toggle
  const filteredJobs = jobCards.filter((job) => {
    const matchesSearch =
      job.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.customerPhone.includes(searchTerm) ||
      job.tool.modelNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.tool.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.serviceReq.grievanceCategory.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesTech = selectedTechFilter === 'All' || job.technician === selectedTechFilter;
    const matchesPriority = selectedPriorityFilter === 'All' || job.priority === selectedPriorityFilter;
    const matchesSla = !showSlaBreachesOnly || getTimeInStage(job).isOverdue;

    return matchesSearch && matchesTech && matchesPriority && matchesSla;
  });

  // Drag and Drop Handlers
  const handleDragStart = (e: any, jobId: string) => {
    if (e && e.dataTransfer) {
      e.dataTransfer.setData('text/plain', jobId);
      e.dataTransfer.effectAllowed = 'move';
    }
    setDraggedJobId(jobId);
  };

  const handleDragOver = (e: React.DragEvent, status: JobStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: JobStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const jobId = e.dataTransfer.getData('text/plain') || draggedJobId;
    if (jobId) {
      onQuickStatusChange(jobId, targetStatus);
    }
    setDraggedJobId(null);
  };

  const handleTechnicianReassign = (job: JobCard, newTechName: string) => {
    const updated: JobCard = {
      ...job,
      technician: newTechName,
      updatedAt: new Date().toISOString(),
    };
    onUpdateJobCard(updated);
  };

  const getPriorityBadgeClass = (priority: JobPriority) => {
    switch (priority) {
      case 'Emergency':
        return 'bg-white text-zinc-950 font-extrabold animate-pulse';
      case 'Urgent':
        return 'bg-zinc-200 text-zinc-950 font-bold';
      default:
        return 'bg-zinc-800 text-zinc-400 font-mono';
    }
  };

  const slaConfigurableStatuses: { status: JobStatus; label: string }[] = [
    { status: 'Intake', label: 'Intake' },
    { status: 'Diagnosis', label: 'Diagnosis' },
    { status: 'Awaiting Approval', label: 'Awaiting Approval' },
    { status: 'Awaiting Parts', label: 'Awaiting Parts' },
    { status: 'In Service', label: 'In Repair' },
    { status: 'Ready for Pickup', label: 'Ready for Pickup' },
  ];

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Control Panel */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-white">
                <SlidersHorizontal className="w-4 h-4" />
              </span>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight uppercase font-mono">
                Workshop Kanban Board &amp; Stage Duration Tracker
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Tracks cumulative time spent in every status and displays automatic warnings for cards in <strong className="text-amber-300">Awaiting Parts</strong> or <strong className="text-rose-300">In Repair</strong> for more than 5 days.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 md:w-56">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search job ID, model, SN..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
              />
            </div>

            {/* Filter by Technician */}
            <select
              value={selectedTechFilter}
              onChange={(e) => setSelectedTechFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-zinc-500 font-mono"
            >
              <option value="All">All Technicians ({SHOP_TECHNICIANS.length})</option>
              {SHOP_TECHNICIANS.map(t => (
                <option key={t.id} value={t.name}>{t.name.split(' ')[0]} - {t.role}</option>
              ))}
            </select>

            {/* Filter by Priority */}
            <select
              value={selectedPriorityFilter}
              onChange={(e) => setSelectedPriorityFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-zinc-500 font-mono"
            >
              <option value="All">All Priorities</option>
              <option value="Routine">Routine</option>
              <option value="Urgent">Urgent</option>
              <option value="Emergency">Emergency</option>
            </select>

            {/* SLA / >5d Bottleneck Quick Filter */}
            <button
              type="button"
              onClick={() => setShowSlaBreachesOnly(!showSlaBreachesOnly)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all flex items-center gap-1.5 ${
                showSlaBreachesOnly
                  ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow'
                  : overdueCount > 0
                  ? 'bg-amber-950/60 text-amber-300 border-amber-700/70 hover:bg-amber-900/60'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Warnings ({overdueCount})</span>
            </button>

            {/* SLA Thresholds Config Toggle */}
            <button
              type="button"
              onClick={() => setShowSlaConfig(!showSlaConfig)}
              title="Configure Stage SLA Day Thresholds"
              className={`px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all flex items-center gap-1.5 ${
                showSlaConfig
                  ? 'bg-white text-zinc-950 border-white'
                  : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-600'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>SLA Rules</span>
            </button>
          </div>
        </div>

        {/* Configurable Stage SLA Day Thresholds Panel */}
        {showSlaConfig && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-white uppercase">
                <Hourglass className="w-3.5 h-3.5 text-amber-400" />
                <span>Stage Aging Thresholds (Max Days Before Overdue Warning)</span>
              </div>
              <button
                type="button"
                onClick={() => setStageThresholds(DEFAULT_STAGE_SLA_DAYS)}
                className="text-[11px] font-mono text-zinc-400 hover:text-white underline"
              >
                Reset Defaults
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {slaConfigurableStatuses.map(({ status: st, label }) => (
                <div key={st} className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 flex flex-col gap-1">
                  <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase truncate">
                    {label}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={stageThresholds[st]}
                      onChange={(e) => {
                        const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                        setStageThresholds({
                          ...stageThresholds,
                          [st]: val,
                          ...(st === 'In Service' ? { 'In Repair': val } : {}),
                        });
                      }}
                      className="w-16 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs font-mono font-bold text-white focus:outline-none focus:border-white"
                    />
                    <span className="text-[11px] text-zinc-500 font-mono">days max</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-zinc-800 text-xs font-mono">
          <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-500">In Workshop</span>
            <span className="text-white font-bold">{jobCards.filter(j => j.status !== 'Completed' && j.status !== 'Cancelled').length} Cards</span>
          </div>
          <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-500">Awaiting Parts</span>
            <span className="text-amber-300 font-bold">{jobCards.filter(j => j.status === 'Awaiting Parts').length} Cards</span>
          </div>
          <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-500">In Repair</span>
            <span className="text-white font-bold">{jobCards.filter(j => j.status === 'In Service' || j.status === 'In Repair').length} Cards</span>
          </div>
          <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-500">Ready for Pickup</span>
            <span className="text-white font-bold">{jobCards.filter(j => j.status === 'Ready for Pickup').length} Cards</span>
          </div>
          <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
            fiveDayWarningCount > 0
              ? 'bg-rose-950/40 border-rose-700/70'
              : overdueCount > 0
              ? 'bg-amber-950/40 border-amber-700/70'
              : 'bg-zinc-950 border-zinc-800'
          }`}>
            <span className={fiveDayWarningCount > 0 ? 'text-rose-200 font-bold' : overdueCount > 0 ? 'text-amber-300 font-bold' : 'text-zinc-500'}>
              &gt;5d Parts/Repair
            </span>
            <span className={`font-extrabold ${fiveDayWarningCount > 0 ? 'text-rose-300' : overdueCount > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
              {fiveDayWarningCount} Warnings
            </span>
          </div>
        </div>
      </div>

      {/* Kanban Board 7-Column Horizontal Track */}
      <div className="flex gap-3.5 overflow-x-auto pb-4 items-start">
        {KANBAN_COLUMNS.map((col) => {
          const acceptedStatuses = col.matchStatuses || [col.status];
          const colJobs = filteredJobs.filter(j => acceptedStatuses.includes(j.status));
          const colTimings = colJobs.map(j => getTimeInStage(j));
          const colOverdueCount = colTimings.filter(t => t.isOverdue).length;
          const colAvgMs = colTimings.length > 0
            ? colTimings.reduce((acc, t) => acc + t.daysFloat * 86400000, 0) / colTimings.length
            : 0;
          const isOver = dragOverColumn === col.status;

          return (
            <div
              key={col.status}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.status)}
              className={`w-[295px] sm:w-[305px] shrink-0 bg-zinc-900 border transition-all rounded-2xl flex flex-col min-h-[620px] p-3 shadow-lg ${
                isOver 
                  ? 'border-white bg-zinc-800/80 shadow-2xl scale-[1.01]' 
                  : colOverdueCount > 0
                  ? 'border-amber-800/60'
                  : 'border-zinc-800'
              }`}
            >
              {/* Column Header */}
              <div className="pb-3 border-b border-zinc-800 mb-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono truncate">
                      {col.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <p className="text-[10px] text-zinc-500 truncate">{col.subtitle}</p>
                    {stageThresholds[col.status] > 0 && (
                      <span className="text-[9px] font-mono text-zinc-400 bg-zinc-950 px-1.5 py-0.2 rounded border border-zinc-800 shrink-0">
                        SLA {stageThresholds[col.status]}d
                      </span>
                    )}
                    {colJobs.length > 0 && (
                      <span className="text-[9px] font-mono text-zinc-300 bg-zinc-950 px-1.5 py-0.2 rounded border border-zinc-800 shrink-0">
                        Avg {formatDurationShort(colAvgMs)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {colOverdueCount > 0 && (
                    <span
                      title={`${colOverdueCount} card(s) exceeded stage limit`}
                      className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/90 px-1.5 py-0.5 rounded border border-amber-700/80 flex items-center gap-0.5"
                    >
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {colOverdueCount}
                    </span>
                  )}
                  <span className="text-xs font-mono font-bold text-zinc-300 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                    {colJobs.length}
                  </span>
                </div>
              </div>

              {/* Cards Container */}
              <div className="flex-1 space-y-3 overflow-y-auto max-h-[calc(100vh-280px)] pr-0.5">
                {colJobs.length === 0 ? (
                  <div className={`h-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-4 text-center transition-colors ${
                    isOver ? 'border-white bg-zinc-950 text-white' : 'border-zinc-800 text-zinc-600'
                  }`}>
                    <Wrench className="w-5 h-5 mb-1 opacity-50" />
                    <span className="text-[11px] font-mono">No Cards Here</span>
                    <span className="text-[10px] text-zinc-600">Drop cards to set status</span>
                  </div>
                ) : (
                  <AnimatePresence>
                    {colJobs.map((job) => {
                      const stageTiming = getTimeInStage(job);
                      const warrantyFlag = job.tool.warrantyFlag || adjudicateWarranty(job.tool, {
                        grievanceCategory: job.serviceReq.grievanceCategory,
                        detailedComplaint: job.serviceReq.detailedComplaint,
                      }).flag;

                      return (
                        <motion.div
                          key={job.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          draggable
                          onDragStart={(e: any) => handleDragStart(e, job.id)}
                          className={`bg-zinc-950 border rounded-xl p-3.5 shadow hover:shadow-xl transition-all cursor-grab active:cursor-grabbing group relative ${
                            draggedJobId === job.id
                              ? 'opacity-40 border-dashed border-white'
                              : stageTiming.isFiveDayStageWarning || stageTiming.isCritical
                              ? 'border-rose-500/80 ring-1 ring-rose-500/25'
                              : stageTiming.isOverdue
                              ? 'border-amber-500/80 ring-1 ring-amber-500/20'
                              : 'border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          {/* > 5 Days Warning Indicator for Awaiting Parts / In Repair */}
                          {stageTiming.isFiveDayStageWarning ? (
                            <div className="mb-2 px-2 py-1 rounded-lg border bg-rose-950/90 border-rose-600/80 text-rose-200 text-[10px] font-mono font-extrabold flex items-center justify-between gap-1">
                              <span className="flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0 text-rose-300" />
                                <span>
                                  {job.status === 'Awaiting Parts'
                                    ? '> 5D IN AWAITING PARTS'
                                    : '> 5D IN REPAIR'}
                                </span>
                              </span>
                              <span>{stageTiming.label}</span>
                            </div>
                          ) : stageTiming.isOverdue ? (
                            <div
                              className={`mb-2 px-2 py-1 rounded-lg border text-[10px] font-mono font-extrabold flex items-center justify-between gap-1 ${
                                stageTiming.isCritical
                                  ? 'bg-rose-950/80 border-rose-700/80 text-rose-200'
                                  : 'bg-amber-950/80 border-amber-700/80 text-amber-200'
                              }`}
                            >
                              <span className="flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>STAGE SLA EXCEEDED</span>
                              </span>
                              <span>&gt; {stageTiming.thresholdDays}d</span>
                            </div>
                          ) : null}

                          {/* Top ID & Priority */}
                          <div className="flex items-center justify-between gap-1.5 mb-2">
                            <span className="font-mono text-[11px] font-bold text-white bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                              {job.id}
                            </span>
                            <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded ${getPriorityBadgeClass(job.priority)}`}>
                              {job.priority}
                            </span>
                          </div>

                          {/* Tool Brand & Model */}
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-mono text-zinc-400 uppercase truncate">{job.tool.brand}</span>
                            <span
                              className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border inline-flex items-center gap-0.5 shrink-0 ${
                                warrantyFlag === 'In-Warranty'
                                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/70'
                                  : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                              }`}
                            >
                              {warrantyFlag === 'In-Warranty' ? (
                                <ShieldCheck className="w-2.5 h-2.5" />
                              ) : (
                                <ShieldAlert className="w-2.5 h-2.5" />
                              )}
                              <span>{warrantyFlag}</span>
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-white group-hover:text-zinc-200 transition-colors line-clamp-1 mt-0.5">
                            {job.tool.modelNumber}
                          </h4>

                          {/* Complaint summary */}
                          <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-tight bg-zinc-900/60 p-2 rounded border border-zinc-800/80">
                            {job.serviceReq.detailedComplaint}
                          </p>

                          {/* Current Time in Stage Tracker Badge */}
                          <div
                            className={`mt-2 px-2 py-1.5 rounded-lg border flex items-center justify-between text-[10px] font-mono ${
                              stageTiming.isFiveDayStageWarning || stageTiming.isCritical
                                ? 'bg-rose-950/40 border-rose-800/70 text-rose-200'
                                : stageTiming.isOverdue
                                ? 'bg-amber-950/40 border-amber-800/70 text-amber-200'
                                : 'bg-zinc-900/70 border-zinc-800 text-zinc-300'
                            }`}
                          >
                            <span className="flex items-center gap-1 font-semibold">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>Time in {getDisplayStatusLabel(job.status)}:</span>
                            </span>
                            <span className="font-bold">
                              {stageTiming.label}
                              {stageTiming.thresholdDays > 0 ? ` / ${stageTiming.thresholdDays}d` : ''}
                            </span>
                          </div>

                          {/* Time Spent in Each Status Breakdown */}
                          {stageTiming.statusBreakdown.length > 0 && (
                            <div className="mt-1.5 bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-2 space-y-1">
                              <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-wider block">
                                Time Spent per Status
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {stageTiming.statusBreakdown.map((entry) => (
                                  <span
                                    key={entry.status}
                                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                                      entry.exceedsFiveDays
                                        ? 'bg-rose-950/80 text-rose-200 border-rose-700/80 font-bold'
                                        : entry.isCurrent
                                        ? 'bg-zinc-800 text-white border-zinc-600 font-bold'
                                        : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                                    }`}
                                  >
                                    {entry.displayStatus}: {entry.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Customer & Total Intake Elapsed Info */}
                          <div className="mt-2 text-[10px] text-zinc-400 space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className="truncate font-medium text-zinc-300">{job.customerName}</span>
                              <span className="font-mono text-[9px] text-zinc-500 shrink-0">{getElapsedTime(job.intakeDate)}</span>
                            </div>
                          </div>

                          {/* Technician Selector */}
                          <div className="mt-2.5 pt-2 border-t border-zinc-900 flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1 min-w-0 flex-1">
                              <UserCheck className="w-3 h-3 text-zinc-500 shrink-0" />
                              <select
                                value={job.technician || ''}
                                onChange={(e) => handleTechnicianReassign(job, e.target.value)}
                                className="bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-zinc-500 font-mono w-full truncate"
                                title="Assign Technician"
                              >
                                <option value="">Unassigned Tech</option>
                                {SHOP_TECHNICIANS.map(t => (
                                  <option key={t.id} value={t.name}>{t.name.split(' ')[0]}</option>
                                ))}
                              </select>
                            </div>

                            <span className="font-mono text-[11px] font-bold text-white shrink-0">
                              ${job.totalAmount.toFixed(0)}
                            </span>
                          </div>

                          {/* Action Bar (PDF, Print, WhatsApp, Quick Shift) */}
                          <div className="mt-3 pt-2 border-t border-zinc-900 flex items-center justify-between gap-1">
                            {/* Quick Left/Right Status Arrows for Touch / Accessibility */}
                            <div className="flex items-center gap-1">
                              {col.status !== 'Intake' && (
                                <button
                                  onClick={() => {
                                    const idx = KANBAN_COLUMNS.findIndex(c => c.status === col.status);
                                    if (idx > 0) onQuickStatusChange(job.id, KANBAN_COLUMNS[idx - 1].status);
                                  }}
                                  title="Move Left"
                                  className="p-1 rounded bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                                >
                                  <ChevronLeft className="w-3 h-3" />
                                </button>
                              )}

                              {col.status !== 'Completed' && (
                                <button
                                  onClick={() => {
                                    const idx = KANBAN_COLUMNS.findIndex(c => c.status === col.status);
                                    if (idx < KANBAN_COLUMNS.length - 1) onQuickStatusChange(job.id, KANBAN_COLUMNS[idx + 1].status);
                                  }}
                                  title="Move Right"
                                  className="p-1 rounded bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                                >
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              {onOpenAiDiagnosis && (
                                <button
                                  onClick={() => onOpenAiDiagnosis(job)}
                                  title="Run Gemini AI Fault Diagnosis"
                                  className="p-1 rounded bg-zinc-900 text-white border border-zinc-700 hover:bg-zinc-800 text-[10px]"
                                >
                                  <Sparkles className="w-3 h-3 text-white" />
                                </button>
                              )}

                              <button
                                onClick={() => onSendPdfToCustomer(job)}
                                title="Send PDF"
                                className="p-1 rounded bg-white text-zinc-950 font-bold hover:bg-zinc-200 text-[10px]"
                              >
                                <FileText className="w-3 h-3" />
                              </button>

                              <button
                                onClick={() => onPrintJobCard(job)}
                                title="Print Tag"
                                className="p-1 rounded bg-zinc-900 text-zinc-300 border border-zinc-800 hover:text-white"
                              >
                                <Printer className="w-3 h-3" />
                              </button>

                              <button
                                onClick={() => onOpenWhatsApp(job)}
                                title="WhatsApp"
                                className="p-1 rounded bg-zinc-900 text-zinc-300 border border-zinc-800 hover:text-white"
                              >
                                <MessageSquare className="w-3 h-3" />
                              </button>

                              <button
                                onClick={() => onSelectJob(job)}
                                title="View Job Details"
                                className="p-1 rounded bg-zinc-900 text-zinc-300 border border-zinc-800 hover:text-white"
                              >
                                <Eye className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};

