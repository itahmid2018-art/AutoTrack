import React, { useState, useEffect } from 'react';
import { JobCard, ScheduledJobSlot, TechnicianShift, TimeLog } from '../types';
import { SHOP_TECHNICIANS } from '../data/mockTechnicians';
import { calculateJobBilling } from '../utils/billing';
import { TransactionalDb } from '../utils/localStorageDb';
import {
  buildInitialScheduledSlots,
  buildInitialTechShifts,
} from '../utils/workshopSchedule';
import { WeeklyWorkshopCalendar } from './WeeklyWorkshopCalendar';
import { 
  Clock, 
  Play, 
  Square, 
  UserCheck, 
  FileSpreadsheet, 
  Plus, 
  CheckCircle2, 
  Timer
} from 'lucide-react';

interface TechnicianTimeTrackerProps {
  jobCards: JobCard[];
  onUpdateJobCard: (updatedJob: JobCard) => void;
  onSelectJobCard?: (job: JobCard) => void;
}

export const TechnicianTimeTracker: React.FC<TechnicianTimeTrackerProps> = ({
  jobCards,
  onUpdateJobCard,
  onSelectJobCard,
}) => {
  const [selectedTechId, setSelectedTechId] = useState<string>(SHOP_TECHNICIANS[0].id);
  const [selectedJobId, setSelectedJobId] = useState<string>(jobCards[0]?.id || '');
  const [logNotes, setLogNotes] = useState<string>('');
  const [filterTech, setFilterTech] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<'All' | 'ACTIVE' | 'COMPLETED'>('All');
  const [notification, setNotification] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'all' | 'calendar' | 'timeclock'>('all');

  // Weekly Shift & Job Slot Schedule State
  const [shifts, setShifts] = useState<TechnicianShift[]>(() =>
    TransactionalDb.loadTechShifts(() => buildInitialTechShifts(SHOP_TECHNICIANS))
  );
  const [scheduledSlots, setScheduledSlots] = useState<ScheduledJobSlot[]>(() =>
    TransactionalDb.loadScheduledSlots(() => buildInitialScheduledSlots(jobCards, SHOP_TECHNICIANS))
  );

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleSaveShifts = (nextShifts: TechnicianShift[]) => {
    setShifts(nextShifts);
    TransactionalDb.saveTechShifts(nextShifts);
  };

  const handleSaveSlots = (nextSlots: ScheduledJobSlot[]) => {
    setScheduledSlots(nextSlots);
    TransactionalDb.saveScheduledSlots(nextSlots);
  };

  // Manual Log Modal
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualJobId, setManualJobId] = useState(jobCards[0]?.id || '');
  const [manualTechId, setManualTechId] = useState(SHOP_TECHNICIANS[0].id);
  const [manualHours, setManualHours] = useState('1.5');
  const [manualNotes, setManualNotes] = useState('Bench diagnostic & armature overhaul');

  // Live timer tick for active sessions display
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Collect all time logs across all job cards
  const allLogs: (TimeLog & { customerName?: string; toolModel?: string })[] = [];
  jobCards.forEach((j) => {
    if (j.timeLogs && j.timeLogs.length > 0) {
      j.timeLogs.forEach((log) => {
        allLogs.push({
          ...log,
          customerName: j.customerName,
          toolModel: `${j.tool.brand} ${j.tool.modelNumber}`,
        });
      });
    }
  });

  // Sort logs by clock in time descending
  allLogs.sort((a, b) => new Date(b.clockInTime).getTime() - new Date(a.clockInTime).getTime());

  // Filtered Logs
  const filteredLogs = allLogs.filter((log) => {
    const matchesTech = filterTech === 'All' || log.technicianName.includes(filterTech);
    const matchesStatus = filterStatus === 'All' || log.status === filterStatus;
    return matchesTech && matchesStatus;
  });

  // Active Sessions
  const activeSessions = allLogs.filter((l) => l.status === 'ACTIVE');

  // Technician Labor Hour Aggregates
  const techStats = SHOP_TECHNICIANS.map((tech) => {
    const techLogs = allLogs.filter((l) => l.technicianName.toLowerCase().includes(tech.name.split(' ')[0].toLowerCase()));
    const totalMinutes = techLogs.reduce((sum, l) => {
      if (l.durationMinutes) return sum + l.durationMinutes;
      if (l.clockInTime) {
        const start = new Date(l.clockInTime).getTime();
        const end = l.clockOutTime ? new Date(l.clockOutTime).getTime() : Date.now();
        return sum + Math.max(0, Math.round((end - start) / (1000 * 60)));
      }
      return sum;
    }, 0);

    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
    const completedCount = techLogs.filter((l) => l.status === 'COMPLETED').length;
    const activeCount = techLogs.filter((l) => l.status === 'ACTIVE').length;

    return {
      tech,
      totalHours,
      totalMinutes,
      completedCount,
      activeCount,
      totalLogsCount: techLogs.length,
    };
  });

  const grandTotalHours = Math.round(techStats.reduce((acc, t) => acc + t.totalHours, 0) * 10) / 10;

  // Handle Clock In Action
  const handleClockIn = () => {
    const targetJob = jobCards.find((j) => j.id === selectedJobId);
    const targetTech = SHOP_TECHNICIANS.find((t) => t.id === selectedTechId);

    if (!targetJob || !targetTech) return;

    // Check if technician is already clocked into an active session
    const existingActive = (targetJob.timeLogs || []).find(
      (l) => l.technicianName.includes(targetTech.name.split(' ')[0]) && l.status === 'ACTIVE'
    );

    if (existingActive) {
      setNotification(`⚠️ ${targetTech.name.split(' ')[0]} is already clocked into Job ${targetJob.id}!`);
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    const newLog: TimeLog = {
      id: `time-${Date.now()}`,
      jobCardId: targetJob.id,
      technicianId: targetTech.id,
      technicianName: targetTech.name,
      clockInTime: new Date().toISOString(),
      notes: logNotes || 'Started repair bench diagnostics',
      status: 'ACTIVE',
    };

    const updatedJob: JobCard = {
      ...targetJob,
      timeLogs: [newLog, ...(targetJob.timeLogs || [])],
      updatedAt: new Date().toISOString(),
    };

    onUpdateJobCard(updatedJob);
    setLogNotes('');
    setNotification(`🟢 Clocked IN ${targetTech.name.split(' ')[0]} to Job ${targetJob.id}`);
    setTimeout(() => setNotification(null), 4000);
  };

  // Handle Clock Out Action
  const handleClockOut = (jobId: string, logId: string) => {
    const targetJob = jobCards.find((j) => j.id === jobId);
    if (!targetJob || !targetJob.timeLogs) return;

    const clockOutTime = new Date().toISOString();

    const updatedTimeLogs = targetJob.timeLogs.map((l) => {
      if (l.id === logId) {
        const startTime = new Date(l.clockInTime).getTime();
        const endTime = new Date(clockOutTime).getTime();
        const diffMs = Math.max(60000, endTime - startTime); // At least 1 minute
        const durationMinutes = Math.round(diffMs / (1000 * 60));
        const durationHours = Math.round((durationMinutes / 60) * 10) / 10;

        return {
          ...l,
          clockOutTime,
          durationMinutes,
          durationHours,
          status: 'COMPLETED' as const,
        };
      }
      return l;
    });

    // Calculate sum of completed hours for this job card to sync laborHours
    const totalJobCompletedHours = updatedTimeLogs
      .filter((l) => l.status === 'COMPLETED')
      .reduce((sum, l) => sum + (l.durationHours || 0), 0);

    const syncedLaborHours = totalJobCompletedHours > 0 ? totalJobCompletedHours : targetJob.laborHours;
    const billing = calculateJobBilling(
      targetJob.parts || [],
      syncedLaborHours,
      targetJob.laborRate,
      targetJob.operationalExpenses || [],
      targetJob.discount || 0,
      targetJob.taxRate || 0
    );

    const updatedJob: JobCard = {
      ...targetJob,
      timeLogs: updatedTimeLogs,
      laborHours: syncedLaborHours,
      totalAmount: billing.totalAmount,
      updatedAt: new Date().toISOString(),
    };

    onUpdateJobCard(updatedJob);
    setNotification(`🔴 Clocked OUT technician from Job ${jobId}. Logged labor hours synced to card!`);
    setTimeout(() => setNotification(null), 4000);
  };

  // Handle Manual Log Submit
  const handleAddManualLog = () => {
    const targetJob = jobCards.find((j) => j.id === manualJobId);
    const targetTech = SHOP_TECHNICIANS.find((t) => t.id === manualTechId);

    if (!targetJob || !targetTech) return;

    const hours = parseFloat(manualHours) || 1.0;
    const mins = Math.round(hours * 60);
    const now = new Date();
    const clockOutTime = now.toISOString();
    const clockInTime = new Date(now.getTime() - mins * 60 * 1000).toISOString();

    const manualLog: TimeLog = {
      id: `time-man-${Date.now()}`,
      jobCardId: targetJob.id,
      technicianId: targetTech.id,
      technicianName: targetTech.name,
      clockInTime,
      clockOutTime,
      durationMinutes: mins,
      durationHours: hours,
      notes: manualNotes || 'Manual technician labor entry',
      status: 'COMPLETED',
    };

    const updatedJob: JobCard = {
      ...targetJob,
      timeLogs: [manualLog, ...(targetJob.timeLogs || [])],
      updatedAt: new Date().toISOString(),
    };

    onUpdateJobCard(updatedJob);
    setManualModalOpen(false);
    setNotification(`Added ${hours}h manual time entry for ${targetTech.name.split(' ')[0]} on ${targetJob.id}`);
    setTimeout(() => setNotification(null), 4000);
  };

  // Export Time Tracking Sheet CSV
  const handleExportTimeCsv = () => {
    const headers = [
      'Log ID',
      'Date',
      'Technician Name',
      'Job ID',
      'Customer Name',
      'Tool Model',
      'Status',
      'Clock In Time',
      'Clock Out Time',
      'Duration (Mins)',
      'Duration (Hours)',
      'Work Notes',
    ];

    const rows = allLogs.map((l) => [
      `"${l.id}"`,
      `"${new Date(l.clockInTime).toLocaleDateString()}"`,
      `"${l.technicianName}"`,
      `"${l.jobCardId}"`,
      `"${l.customerName || ''}"`,
      `"${l.toolModel || ''}"`,
      `"${l.status}"`,
      `"${new Date(l.clockInTime).toLocaleTimeString()}"`,
      `"${l.clockOutTime ? new Date(l.clockOutTime).toLocaleTimeString() : 'Running...'}"`,
      l.durationMinutes || 0,
      l.durationHours || 0,
      `"${(l.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = `technician_time_logs_report_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Format Elapsed Time
  const formatElapsed = (clockInIso: string) => {
    const elapsedMs = Math.max(0, Date.now() - new Date(clockInIso).getTime());
    const totalSecs = Math.floor(elapsedMs / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs > 0 ? `${hrs}h ` : ''}${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-6 font-mono">
      
      {/* Top Banner & Quick Clock In Control Workbench */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-white text-zinc-950 font-bold">
                <Timer className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-bold text-white tracking-tight uppercase">
                Technician Labor &amp; Time Clock System
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-zinc-950 text-white border border-zinc-700">
                {activeSessions.length} Active Timers
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 font-sans">
              Clock-in and clock-out of specific job tickets to track exact workshop bench repair hours per technician.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
              <button
                type="button"
                onClick={() => setActiveSection('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  activeSection === 'all' ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white'
                }`}
              >
                All Views
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('calendar')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  activeSection === 'calendar' ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Weekly Calendar
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('timeclock')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  activeSection === 'timeclock' ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Time Clock &amp; Logs
              </button>
            </div>

            <button
              onClick={() => setManualModalOpen(true)}
              className="px-3.5 py-2 text-xs font-bold text-zinc-200 bg-zinc-950 hover:bg-zinc-800 rounded-xl transition-all border border-zinc-700 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>Manual Time Entry</span>
            </button>

            <button
              onClick={handleExportTimeCsv}
              className="px-4 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl shadow transition-all flex items-center gap-1.5 active:scale-95 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Time CSV</span>
            </button>
          </div>
        </div>

        {/* Quick Clock-In Action Box */}
        {activeSection !== 'calendar' && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-4">
            <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Play className="w-4 h-4 text-white fill-white" />
              <span>Clock In Technician to Job Card</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Technician Select */}
              <div>
                <label className="text-[10px] text-zinc-400 block mb-1 uppercase font-bold">Select Technician</label>
                <select
                  value={selectedTechId}
                  onChange={(e) => setSelectedTechId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-500 font-mono"
                >
                  {SHOP_TECHNICIANS.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Job Card Select */}
              <div>
                <label className="text-[10px] text-zinc-400 block mb-1 uppercase font-bold">Target Job Ticket</label>
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-500 font-mono"
                >
                  {jobCards.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.id} - {j.tool.brand} {j.tool.modelNumber} ({j.customerName})
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[10px] text-zinc-400 block mb-1 uppercase font-bold">Task Scope / Notes</label>
                <input
                  type="text"
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  placeholder="e.g., Motor teardown & armature check..."
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
                />
              </div>

              {/* Clock In Button */}
              <div className="flex items-end">
                <button
                  onClick={handleClockIn}
                  className="w-full py-2 px-4 bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold rounded-xl shadow flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Play className="w-4 h-4 fill-zinc-950" />
                  <span>Clock In Now</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="bg-zinc-900 border border-white/30 p-3.5 rounded-xl text-xs font-mono text-white flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-white" />
            <span>{notification}</span>
          </div>
          <span className="text-[10px] text-zinc-400">Workshop Schedule &amp; Log Updated</span>
        </div>
      )}

      {/* Weekly Workshop Calendar & Capacity Scheduler */}
      {(activeSection === 'all' || activeSection === 'calendar') && (
        <WeeklyWorkshopCalendar
          jobCards={jobCards}
          shifts={shifts}
          scheduledSlots={scheduledSlots}
          onSaveShifts={handleSaveShifts}
          onSaveSlots={handleSaveSlots}
          onUpdateJobCard={onUpdateJobCard}
          onSelectJobCard={onSelectJobCard}
          onNotify={showToast}
        />
      )}

      {/* Live Active Clock-Ins Workshop Monitor */}
      {activeSection !== 'calendar' && activeSessions.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
              <span>Live Running Workshop Sessions ({activeSessions.length})</span>
            </h2>
            <span className="text-[11px] text-zinc-400">Timers updating real-time</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeSessions.map((session) => (
              <div key={session.id} className="bg-zinc-950 border border-zinc-700 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white font-mono">{session.jobCardId}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-zinc-950 animate-pulse">
                    ACTIVE BENCH TIME
                  </span>
                </div>

                <div>
                  <div className="text-xs font-bold text-zinc-200">{session.technicianName}</div>
                  <div className="text-[11px] text-zinc-400 font-sans truncate">{session.notes}</div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-900 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-zinc-500 block uppercase">Elapsed Time</span>
                    <span className="text-white font-extrabold text-sm">{formatElapsed(session.clockInTime)}</span>
                  </div>

                  <button
                    onClick={() => handleClockOut(session.jobCardId, session.id)}
                    className="px-3 py-1.5 bg-white hover:bg-zinc-200 text-zinc-950 font-bold rounded-lg text-xs flex items-center gap-1 transition-all active:scale-95"
                  >
                    <Square className="w-3.5 h-3.5 fill-zinc-950" />
                    <span>Clock Out</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Technician Total Hours Logged Summary Cards Grid */}
      {activeSection !== 'calendar' && (
      <>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-white uppercase tracking-wider">
          <span className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-white" />
            <span>Total Hours Logged Per Technician ({grandTotalHours} Total Hours)</span>
          </span>
          <span className="text-zinc-400 text-[11px] font-mono font-normal">
            Synced from {allLogs.length} benchmark time entries
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {techStats.map(({ tech, totalHours, totalMinutes, completedCount, activeCount, totalLogsCount }) => (
            <div
              key={tech.id}
              className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-4 space-y-3 transition-all shadow-lg"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs font-mono shrink-0 ${tech.avatarColor}`}>
                    {tech.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-white truncate">
                      {tech.name.split(' ')[0]} {tech.name.split(' ')[1] || ''}
                    </h3>
                    <span className="text-[10px] text-zinc-400 block truncate">{tech.role}</span>
                  </div>
                </div>

                {activeCount > 0 && (
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping shrink-0" title="Currently Clocked In" />
                )}
              </div>

              {/* Total Hours Big Display */}
              <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex items-center justify-between font-mono">
                <div>
                  <span className="text-[10px] text-zinc-500 block uppercase font-bold">Total Logged Time</span>
                  <span className="text-xl font-extrabold text-white">{totalHours} hrs</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-zinc-500 block uppercase font-bold">Labor Value</span>
                  <span className="text-xs font-bold text-white">${(totalHours * 45).toFixed(0)}</span>
                </div>
              </div>

              {/* Breakdown Stats */}
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800 text-center">
                  <span className="text-zinc-500 text-[9px] block uppercase">Completed</span>
                  <span className="text-white font-bold">{completedCount} sessions</span>
                </div>
                <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800 text-center">
                  <span className="text-zinc-500 text-[9px] block uppercase font-bold">Active Now</span>
                  <span className="text-white font-bold">{activeCount} active</span>
                </div>
              </div>

              <div className="text-[10px] text-zinc-400 font-sans bg-zinc-950 p-2 rounded border border-zinc-800/80 truncate">
                Specialization: {tech.specialization}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Time Logs History Table & Filter Controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-white" />
            <span>Time Logs Audit History ({filteredLogs.length} Entries)</span>
          </h2>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filterTech}
              onChange={(e) => setFilterTech(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs rounded-xl px-3 py-1.5 focus:outline-none font-mono"
            >
              <option value="All">All Technicians</option>
              {SHOP_TECHNICIANS.map((t) => (
                <option key={t.id} value={t.name.split(' ')[0]}>
                  {t.name.split(' ')[0]} {t.name.split(' ')[1] || ''}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
              <button
                onClick={() => setFilterStatus('All')}
                className={`px-2.5 py-1 text-xs rounded-lg ${filterStatus === 'All' ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-400'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilterStatus('ACTIVE')}
                className={`px-2.5 py-1 text-xs rounded-lg ${filterStatus === 'ACTIVE' ? 'bg-white text-zinc-950 font-bold' : 'text-zinc-400'}`}
              >
                Active
              </button>
              <button
                onClick={() => setFilterStatus('COMPLETED')}
                className={`px-2.5 py-1 text-xs rounded-lg ${filterStatus === 'COMPLETED' ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-400'}`}
              >
                Completed
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-zinc-800 rounded-xl bg-zinc-950">
          <table className="w-full text-xs text-left font-mono">
            <thead className="bg-zinc-900 text-zinc-400 text-[11px] uppercase border-b border-zinc-800">
              <tr>
                <th className="p-3">Status</th>
                <th className="p-3">Technician</th>
                <th className="p-3">Job ID &amp; Device</th>
                <th className="p-3">Clock In</th>
                <th className="p-3">Clock Out</th>
                <th className="p-3 text-center">Duration</th>
                <th className="p-3">Work Notes</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-300">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-500 font-sans">
                    No time logs found matching the selected filters.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isActive = log.status === 'ACTIVE';
                  return (
                    <tr key={log.id} className="hover:bg-zinc-900/60 transition-colors">
                      <td className="p-3">
                        {isActive ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-zinc-950 shadow animate-pulse">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-900 text-zinc-400 border border-zinc-800">
                            COMPLETED
                          </span>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="font-bold text-white">{log.technicianName}</div>
                      </td>

                      <td className="p-3">
                        <button
                          onClick={() => {
                            const foundJob = jobCards.find((j) => j.id === log.jobCardId);
                            if (foundJob && onSelectJobCard) onSelectJobCard(foundJob);
                          }}
                          className="font-bold text-white hover:underline text-left"
                        >
                          {log.jobCardId}
                        </button>
                        <div className="text-[11px] text-zinc-400 truncate max-w-xs">{log.toolModel}</div>
                      </td>

                      <td className="p-3 text-zinc-300">
                        {new Date(log.clockInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        <span className="text-[10px] text-zinc-500 block">{new Date(log.clockInTime).toLocaleDateString()}</span>
                      </td>

                      <td className="p-3 text-zinc-300">
                        {log.clockOutTime
                          ? new Date(log.clockOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Running...'}
                      </td>

                      <td className="p-3 text-center font-bold text-white">
                        {isActive ? formatElapsed(log.clockInTime) : `${log.durationHours || 0} hrs (${log.durationMinutes || 0}m)`}
                      </td>

                      <td className="p-3 font-sans text-[11px] text-zinc-300 max-w-xs truncate">
                        {log.notes || 'No work notes logged.'}
                      </td>

                      <td className="p-3 text-center">
                        {isActive ? (
                          <button
                            onClick={() => handleClockOut(log.jobCardId, log.id)}
                            className="px-2.5 py-1 text-[10px] font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded transition-all active:scale-95"
                          >
                            Clock Out
                          </button>
                        ) : (
                          <span className="text-[10px] text-zinc-500">Logged</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* Manual Time Entry Modal */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950/85 backdrop-blur flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl font-mono">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-white uppercase flex items-center gap-2">
                <Plus className="w-5 h-5 text-white" />
                <span>Manual Technician Time Entry</span>
              </h3>
              <button onClick={() => setManualModalOpen(false)} className="text-xs text-zinc-500 hover:text-white">
                Cancel
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-zinc-400 block mb-1 uppercase font-bold">Select Technician</label>
                <select
                  value={manualTechId}
                  onChange={(e) => setManualTechId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-mono"
                >
                  {SHOP_TECHNICIANS.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 block mb-1 uppercase font-bold">Select Job Ticket</label>
                <select
                  value={manualJobId}
                  onChange={(e) => setManualJobId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-mono"
                >
                  {jobCards.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.id} - {j.tool.brand} {j.tool.modelNumber} ({j.customerName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 block mb-1 uppercase font-bold">Hours Spent (Decimal, e.g. 1.5)</label>
                <input
                  type="number"
                  step="0.1"
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 block mb-1 uppercase font-bold">Work Scope / Notes</label>
                <textarea
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setManualModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleAddManualLog}
                className="px-5 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl shadow"
              >
                Save Manual Time Log
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
