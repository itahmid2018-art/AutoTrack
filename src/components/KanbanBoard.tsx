import React, { useState } from 'react';
import { JobCard, JobStatus, JobPriority } from '../types';
import { SHOP_TECHNICIANS } from '../data/mockTechnicians';
import { 
  Search, 
  Wrench, 
  UserCheck, 
  Clock, 
  FileText, 
  Printer, 
  MessageSquare, 
  Eye, 
  Filter, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight,
  UserX,
  CheckCircle2,
  SlidersHorizontal
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
}

const KANBAN_COLUMNS: { status: JobStatus; title: string; subtitle: string; badgeClass: string }[] = [
  { status: 'Intake', title: '1. Intake', subtitle: 'Received & Queued', badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700' },
  { status: 'Diagnosis', title: '2. Diagnosis', subtitle: 'Teardown & AI Check', badgeClass: 'bg-zinc-800 text-white border-zinc-600 font-bold' },
  { status: 'Awaiting Approval', title: '3. Approval', subtitle: 'Quote Sent to Client', badgeClass: 'bg-zinc-800 text-zinc-200 border-zinc-600' },
  { status: 'In Service', title: '4. In Service', subtitle: 'Bench Repair Active', badgeClass: 'bg-zinc-100 text-zinc-950 border-white font-bold' },
  { status: 'Ready for Pickup', title: '5. Ready', subtitle: 'Tested & Cleaned', badgeClass: 'bg-white text-zinc-950 border-white font-extrabold' },
  { status: 'Completed', title: '6. Completed', subtitle: 'Handed Over / Closed', badgeClass: 'bg-zinc-950 text-zinc-500 border-zinc-800' },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  jobCards,
  onQuickStatusChange,
  onUpdateJobCard,
  onSelectJob,
  onPrintJobCard,
  onSendPdfToCustomer,
  onOpenWhatsApp,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTechFilter, setSelectedTechFilter] = useState<string>('All');
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState<string>('All');
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<JobStatus | null>(null);

  // Filter jobs based on search term, technician, and priority
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

    return matchesSearch && matchesTech && matchesPriority;
  });

  // Calculate elapsed time string from intake date
  const getElapsedTime = (intakeDateStr: string) => {
    try {
      const intakeDate = new Date(intakeDateStr.replace(' ', 'T'));
      const diffMs = Date.now() - intakeDate.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours < 1) return '< 1h elapsed';
      if (diffHours < 24) return `${diffHours}h elapsed`;
      const days = Math.floor(diffHours / 24);
      return `${days}d ${diffHours % 24}h elapsed`;
    } catch {
      return 'Recently';
    }
  };

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
                Workshop Kanban Board
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Drag and drop job cards between repair stages to update live job status and manage technician workloads.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 md:w-64">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search job ID, model, customer..."
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
          </div>
        </div>

        {/* Stats Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-zinc-800 text-xs font-mono">
          <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-500">In Workshop</span>
            <span className="text-white font-bold">{jobCards.filter(j => j.status !== 'Completed' && j.status !== 'Cancelled').length} Cards</span>
          </div>
          <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-500">In Bench Repair</span>
            <span className="text-white font-bold">{jobCards.filter(j => j.status === 'In Service').length} Cards</span>
          </div>
          <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-500">Ready for Pickup</span>
            <span className="text-white font-bold">{jobCards.filter(j => j.status === 'Ready for Pickup').length} Cards</span>
          </div>
          <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-500">Completed Total</span>
            <span className="text-white font-bold">{jobCards.filter(j => j.status === 'Completed').length} Cards</span>
          </div>
        </div>
      </div>

      {/* Kanban Board 6-Column Container */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start">
        {KANBAN_COLUMNS.map((col) => {
          const colJobs = filteredJobs.filter(j => j.status === col.status);
          const isOver = dragOverColumn === col.status;

          return (
            <div
              key={col.status}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.status)}
              className={`bg-zinc-900 border transition-all rounded-2xl flex flex-col min-h-[580px] p-3 shadow-lg ${
                isOver 
                  ? 'border-white bg-zinc-800/80 shadow-2xl scale-[1.01]' 
                  : 'border-zinc-800'
              }`}
            >
              {/* Column Header */}
              <div className="pb-3 border-b border-zinc-800 mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    {col.title}
                  </h3>
                  <p className="text-[10px] text-zinc-500">{col.subtitle}</p>
                </div>
                <span className="text-xs font-mono font-bold text-zinc-300 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                  {colJobs.length}
                </span>
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
                    {colJobs.map((job) => (
                      <motion.div
                        key={job.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        draggable
                        onDragStart={(e: any) => handleDragStart(e, job.id)}
                        className={`bg-zinc-950 border rounded-xl p-3.5 shadow hover:shadow-xl transition-all cursor-grab active:cursor-grabbing group relative ${
                          draggedJobId === job.id ? 'opacity-40 border-dashed border-white' : 'border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
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
                        <div className="text-[10px] font-mono text-zinc-400 uppercase">{job.tool.brand}</div>
                        <h4 className="text-xs font-bold text-white group-hover:text-zinc-200 transition-colors line-clamp-1">
                          {job.tool.modelNumber}
                        </h4>

                        {/* Complaint summary */}
                        <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-tight bg-zinc-900/60 p-2 rounded border border-zinc-800/80">
                          {job.serviceReq.detailedComplaint}
                        </p>

                        {/* Customer & Time Info */}
                        <div className="mt-2 text-[10px] text-zinc-400 space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="truncate font-medium text-zinc-300">{job.customerName}</span>
                            <span className="font-mono text-[9px] text-zinc-400 shrink-0">{getElapsedTime(job.intakeDate)}</span>
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
                    ))}
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
