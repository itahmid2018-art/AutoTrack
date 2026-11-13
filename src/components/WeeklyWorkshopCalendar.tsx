import React, { useMemo, useState } from 'react';
import {
  JobCard,
  ScheduledJobSlot,
  ShiftType,
  TechnicianShift,
} from '../types';
import { SHOP_TECHNICIANS, Technician } from '../data/mockTechnicians';
import {
  SHIFT_PRESETS,
  WORKSHOP_BAYS,
  addDays,
  buildStandardWeekShifts,
  findSlotOverlaps,
  formatDateKey,
  formatHourLabel,
  formatTimeRange,
  getCapacityStatus,
  getMondayOfWeek,
  getShiftDuration,
  getWeekDays,
  isSlotOutsideShift,
} from '../utils/workshopSchedule';
import { matchTechnicianId } from '../utils/technicianPerformance';
import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Layers,
  Plus,
  Search,
  Trash2,
  UserCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react';

interface WeeklyWorkshopCalendarProps {
  jobCards: JobCard[];
  shifts: TechnicianShift[];
  scheduledSlots: ScheduledJobSlot[];
  onSaveShifts: (nextShifts: TechnicianShift[]) => void;
  onSaveSlots: (nextSlots: ScheduledJobSlot[]) => void;
  onUpdateJobCard: (updatedJob: JobCard) => void;
  onSelectJobCard?: (job: JobCard) => void;
  onNotify?: (message: string) => void;
}

type CalendarDisplayMode = 'week' | 'day';
type QueueFilterMode = 'unscheduled' | 'all';

const TIMELINE_START_HOUR = 8;
const TIMELINE_END_HOUR = 18;
const TIMELINE_TOTAL_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR;

const START_HOUR_OPTIONS = Array.from({ length: 24 }, (_, idx) => 7 + idx * 0.5); // 07:00 .. 18:30
const DURATION_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8];

export const WeeklyWorkshopCalendar: React.FC<WeeklyWorkshopCalendarProps> = ({
  jobCards,
  shifts,
  scheduledSlots,
  onSaveShifts,
  onSaveSlots,
  onUpdateJobCard,
  onSelectJobCard,
  onNotify,
}) => {
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [displayMode, setDisplayMode] = useState<CalendarDisplayMode>('week');
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => formatDateKey(new Date()));
  const [focusedTechId, setFocusedTechId] = useState<string>('All');
  const [queueFilter, setQueueFilter] = useState<QueueFilterMode>('unscheduled');
  const [queueSearch, setQueueSearch] = useState<string>('');
  const [dragOverCellKey, setDragOverCellKey] = useState<string | null>(null);

  // Shift Modal State
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [shiftTechId, setShiftTechId] = useState<string>(SHOP_TECHNICIANS[0].id);
  const [shiftDateKey, setShiftDateKey] = useState<string>(() => formatDateKey(new Date()));
  const [shiftType, setShiftType] = useState<ShiftType>('Full Shift');
  const [shiftStartHour, setShiftStartHour] = useState<number>(8);
  const [shiftEndHour, setShiftEndHour] = useState<number>(16);
  const [shiftBay, setShiftBay] = useState<string>(WORKSHOP_BAYS[0]);
  const [shiftNotes, setShiftNotes] = useState<string>('');
  const [applyMonToFri, setApplyMonToFri] = useState<boolean>(false);

  // Slot Assignment Modal State
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [slotJobId, setSlotJobId] = useState<string>(jobCards[0]?.id || '');
  const [slotTechId, setSlotTechId] = useState<string>(SHOP_TECHNICIANS[0].id);
  const [slotDateKey, setSlotDateKey] = useState<string>(() => formatDateKey(new Date()));
  const [slotStartHour, setSlotStartHour] = useState<number>(9);
  const [slotDurationHours, setSlotDurationHours] = useState<number>(1.5);
  const [slotNotes, setSlotNotes] = useState<string>('');
  const [syncJobTech, setSyncJobTech] = useState<boolean>(true);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekDateSet = useMemo(() => new Set(weekDays.map((d) => d.dateKey)), [weekDays]);

  const effectiveSelectedDayKey = weekDateSet.has(selectedDayKey)
    ? selectedDayKey
    : weekDays[0].dateKey;

  const jobMap = useMemo(() => {
    const map = new Map<string, JobCard>();
    jobCards.forEach((j) => map.set(j.id, j));
    return map;
  }, [jobCards]);

  const shiftMap = useMemo(() => {
    const map = new Map<string, TechnicianShift>();
    shifts.forEach((s) => map.set(`${s.technicianId}__${s.date}`, s));
    return map;
  }, [shifts]);

  const weekSlots = useMemo(
    () => scheduledSlots.filter((slot) => weekDateSet.has(slot.date)),
    [scheduledSlots, weekDateSet]
  );

  const weekShifts = useMemo(
    () => shifts.filter((shift) => weekDateSet.has(shift.date)),
    [shifts, weekDateSet]
  );

  const hasAnyShiftInWeek = weekShifts.length > 0;

  // Weekly Capacity Summary Metrics
  const capacitySummary = useMemo(() => {
    const totalShiftHours = weekShifts.reduce((sum, s) => sum + getShiftDuration(s), 0);
    const activeShiftCount = weekShifts.filter((s) => getShiftDuration(s) > 0).length;
    const totalBookedHours = weekSlots.reduce((sum, s) => sum + (s.durationHours || 0), 0);
    const utilizationPct =
      totalShiftHours > 0 ? Math.round((totalBookedHours / totalShiftHours) * 100) : 0;

    const scheduledJobIdsThisWeek = new Set(weekSlots.map((s) => s.jobCardId));
    const activeJobs = jobCards.filter((j) => j.status !== 'Completed' && j.status !== 'Cancelled');
    const unscheduledActiveJobs = activeJobs.filter((j) => !scheduledJobIdsThisWeek.has(j.id));

    return {
      totalShiftHours: Math.round(totalShiftHours * 10) / 10,
      activeShiftCount,
      totalBookedHours: Math.round(totalBookedHours * 10) / 10,
      utilizationPct,
      bookedSlotCount: weekSlots.length,
      unscheduledActiveCount: unscheduledActiveJobs.length,
      scheduledJobIdsThisWeek,
      overallStatus: getCapacityStatus(totalBookedHours, totalShiftHours),
    };
  }, [weekShifts, weekSlots, jobCards]);

  // Per-Technician Capacity Summary for the displayed week
  const technicianCapacities = useMemo(() => {
    return SHOP_TECHNICIANS.map((tech) => {
      const techWeekShifts = weekShifts.filter((s) => s.technicianId === tech.id);
      const techWeekSlots = weekSlots.filter((s) => s.technicianId === tech.id);
      const shiftHours = Math.round(
        techWeekShifts.reduce((sum, s) => sum + getShiftDuration(s), 0) * 10
      ) / 10;
      const bookedHours = Math.round(
        techWeekSlots.reduce((sum, s) => sum + s.durationHours, 0) * 10
      ) / 10;
      const status = getCapacityStatus(bookedHours, shiftHours);
      const activeDays = techWeekShifts.filter((s) => getShiftDuration(s) > 0).length;

      return {
        tech,
        shiftHours,
        bookedHours,
        remainingHours: Math.round((shiftHours - bookedHours) * 10) / 10,
        activeDays,
        slotCount: techWeekSlots.length,
        status,
      };
    });
  }, [weekShifts, weekSlots]);

  const visibleTechnicians: Technician[] = useMemo(() => {
    if (focusedTechId === 'All') return SHOP_TECHNICIANS;
    return SHOP_TECHNICIANS.filter((t) => t.id === focusedTechId);
  }, [focusedTechId]);

  // Active Jobs Queue
  const queueJobs = useMemo(() => {
    const query = queueSearch.trim().toLowerCase();
    return jobCards
      .filter((j) => j.status !== 'Completed' && j.status !== 'Cancelled')
      .filter((j) => {
        if (queueFilter === 'unscheduled' && capacitySummary.scheduledJobIdsThisWeek.has(j.id)) {
          return false;
        }
        if (!query) return true;
        return (
          j.id.toLowerCase().includes(query) ||
          j.customerName.toLowerCase().includes(query) ||
          j.tool.modelNumber.toLowerCase().includes(query) ||
          j.tool.brand.toLowerCase().includes(query)
        );
      });
  }, [jobCards, queueFilter, queueSearch, capacitySummary.scheduledJobIdsThisWeek]);

  // Week Navigation Handlers
  const handlePrevWeek = () => {
    const next = addDays(weekStart, -7);
    setWeekStart(next);
    setSelectedDayKey(formatDateKey(next));
  };

  const handleNextWeek = () => {
    const next = addDays(weekStart, 7);
    setWeekStart(next);
    setSelectedDayKey(formatDateKey(next));
  };

  const handleThisWeek = () => {
    const now = new Date();
    setWeekStart(getMondayOfWeek(now));
    setSelectedDayKey(formatDateKey(now));
  };

  const handlePopulateStandardWeek = () => {
    const additions = buildStandardWeekShifts(weekStart, SHOP_TECHNICIANS, shifts);
    if (additions.length === 0) {
      onNotify?.('Standard Mon–Sat shifts are already configured for this week.');
      return;
    }
    onSaveShifts([...shifts, ...additions]);
    onNotify?.(`Applied standard Mon–Sat workshop roster (${additions.length} shifts added).`);
  };

  // Open Shift Modal
  const openShiftModal = (techId: string, dateKey: string) => {
    const existing = shiftMap.get(`${techId}__${dateKey}`);
    const techIdx = Math.max(0, SHOP_TECHNICIANS.findIndex((t) => t.id === techId));
    setShiftTechId(techId);
    setShiftDateKey(dateKey);
    if (existing) {
      setShiftType(existing.shiftType);
      setShiftStartHour(existing.startHour);
      setShiftEndHour(existing.endHour);
      setShiftBay(existing.bay || WORKSHOP_BAYS[techIdx % WORKSHOP_BAYS.length]);
      setShiftNotes(existing.notes || '');
    } else {
      setShiftType('Full Shift');
      setShiftStartHour(8);
      setShiftEndHour(16);
      setShiftBay(WORKSHOP_BAYS[techIdx % WORKSHOP_BAYS.length]);
      setShiftNotes('');
    }
    setApplyMonToFri(false);
    setShiftModalOpen(true);
  };

  const handleApplyShiftPreset = (presetIdx: number) => {
    const preset = SHIFT_PRESETS[presetIdx];
    if (!preset) return;
    setShiftType(preset.shiftType);
    setShiftStartHour(preset.startHour);
    setShiftEndHour(preset.endHour);
  };

  const handleSaveShift = () => {
    const targetDates = applyMonToFri
      ? weekDays.slice(0, 5).map((d) => d.dateKey)
      : [shiftDateKey];

    const normalizedStart = shiftType === 'Off' ? 0 : shiftStartHour;
    const normalizedEnd =
      shiftType === 'Off' ? 0 : Math.max(normalizedStart + 1, shiftEndHour);

    const updatedMap = new Map<string, TechnicianShift>();
    shifts.forEach((s) => updatedMap.set(`${s.technicianId}__${s.date}`, s));

    targetDates.forEach((dateKey) => {
      const existing = updatedMap.get(`${shiftTechId}__${dateKey}`);
      updatedMap.set(`${shiftTechId}__${dateKey}`, {
        id: existing?.id || `shift-${shiftTechId}-${dateKey}`,
        technicianId: shiftTechId,
        date: dateKey,
        startHour: normalizedStart,
        endHour: normalizedEnd,
        shiftType,
        bay: shiftBay,
        notes: shiftNotes.trim() || undefined,
      });
    });

    onSaveShifts(Array.from(updatedMap.values()));
    setShiftModalOpen(false);
    const techName =
      SHOP_TECHNICIANS.find((t) => t.id === shiftTechId)?.name.split(' ')[0] || 'Technician';
    onNotify?.(
      applyMonToFri
        ? `Updated Mon–Fri shifts for ${techName} (${shiftType}).`
        : `Updated shift for ${techName} on ${shiftDateKey}.`
    );
  };

  const handleDeleteShift = () => {
    const next = shifts.filter(
      (s) => !(s.technicianId === shiftTechId && s.date === shiftDateKey)
    );
    onSaveShifts(next);
    setShiftModalOpen(false);
    onNotify?.(`Cleared shift entry for ${shiftDateKey}.`);
  };

  // Open Slot Modal (New or Edit)
  const openNewSlotModal = (opts?: {
    jobId?: string;
    techId?: string;
    dateKey?: string;
    startHour?: number;
  }) => {
    const fallbackJob =
      (opts?.jobId ? jobMap.get(opts.jobId) : undefined) ||
      queueJobs[0] ||
      jobCards.find((j) => j.status !== 'Cancelled') ||
      jobCards[0];

    const inferredTechId =
      opts?.techId ||
      (fallbackJob ? matchTechnicianId(fallbackJob.technician, SHOP_TECHNICIANS) : null) ||
      SHOP_TECHNICIANS[0].id;

    const targetDate = opts?.dateKey || effectiveSelectedDayKey;
    const techShift = shiftMap.get(`${inferredTechId}__${targetDate}`);
    const existingDaySlots = scheduledSlots
      .filter((s) => s.technicianId === inferredTechId && s.date === targetDate)
      .sort((a, b) => a.startHour - b.startHour);

    let suggestedStart = opts?.startHour;
    if (suggestedStart === undefined) {
      const shiftStart =
        techShift && techShift.shiftType !== 'Off' ? techShift.startHour : 9;
      if (existingDaySlots.length === 0) {
        suggestedStart = shiftStart;
      } else {
        const lastSlot = existingDaySlots[existingDaySlots.length - 1];
        suggestedStart = Math.min(17, lastSlot.startHour + lastSlot.durationHours);
      }
    }

    const estDuration = fallbackJob
      ? Math.max(0.5, Math.min(8, Math.round((fallbackJob.laborHours || 1.5) * 2) / 2))
      : 1.5;

    setEditingSlotId(null);
    setSlotJobId(fallbackJob?.id || '');
    setSlotTechId(inferredTechId);
    setSlotDateKey(targetDate);
    setSlotStartHour(suggestedStart);
    setSlotDurationHours(estDuration);
    setSlotNotes(fallbackJob ? `${fallbackJob.serviceReq.serviceType}` : '');
    setSyncJobTech(true);
    setSlotModalOpen(true);
  };

  const openEditSlotModal = (slot: ScheduledJobSlot) => {
    setEditingSlotId(slot.id);
    setSlotJobId(slot.jobCardId);
    setSlotTechId(slot.technicianId);
    setSlotDateKey(slot.date);
    setSlotStartHour(slot.startHour);
    setSlotDurationHours(slot.durationHours);
    setSlotNotes(slot.notes || '');
    setSyncJobTech(true);
    setSlotModalOpen(true);
  };

  const modalShift = shiftMap.get(`${slotTechId}__${slotDateKey}`);
  const modalOverlaps = useMemo(
    () =>
      slotModalOpen
        ? findSlotOverlaps(
            scheduledSlots,
            {
              technicianId: slotTechId,
              date: slotDateKey,
              startHour: slotStartHour,
              durationHours: slotDurationHours,
            },
            editingSlotId || undefined
          )
        : [],
    [slotModalOpen, scheduledSlots, slotTechId, slotDateKey, slotStartHour, slotDurationHours, editingSlotId]
  );

  const modalOutsideShift = useMemo(
    () =>
      slotModalOpen
        ? isSlotOutsideShift(
            { startHour: slotStartHour, durationHours: slotDurationHours },
            modalShift
          )
        : false,
    [slotModalOpen, slotStartHour, slotDurationHours, modalShift]
  );

  const handleSaveSlot = () => {
    if (!slotJobId) return;
    const targetJob = jobMap.get(slotJobId);
    const targetTech = SHOP_TECHNICIANS.find((t) => t.id === slotTechId);
    if (!targetTech) return;

    if (editingSlotId) {
      const nextSlots = scheduledSlots.map((s) =>
        s.id === editingSlotId
          ? {
              ...s,
              jobCardId: slotJobId,
              technicianId: slotTechId,
              date: slotDateKey,
              startHour: slotStartHour,
              durationHours: slotDurationHours,
              notes: slotNotes.trim() || undefined,
            }
          : s
      );
      onSaveSlots(nextSlots);
    } else {
      const newSlot: ScheduledJobSlot = {
        id: `slot-${Date.now()}`,
        jobCardId: slotJobId,
        technicianId: slotTechId,
        date: slotDateKey,
        startHour: slotStartHour,
        durationHours: slotDurationHours,
        notes: slotNotes.trim() || undefined,
      };
      onSaveSlots([...scheduledSlots, newSlot]);
    }

    if (syncJobTech && targetJob) {
      const currentJobTechId = matchTechnicianId(targetJob.technician, SHOP_TECHNICIANS);
      if (currentJobTechId !== targetTech.id) {
        const nowIso = new Date().toISOString();
        onUpdateJobCard({
          ...targetJob,
          technician: targetTech.name,
          auditLogs: [
            ...(targetJob.auditLogs || []),
            {
              id: `aud-sched-${Date.now()}`,
              timestamp: nowIso.slice(0, 16).replace('T', ' '),
              userName: targetTech.name.split(' (')[0],
              userRole: targetTech.role,
              action: 'WORKSHOP_SLOT_SCHEDULED',
              previousState: targetJob.technician || 'Unassigned',
              newState: `Scheduled ${slotDateKey} ${formatTimeRange(slotStartHour, slotDurationHours)} (${targetTech.name.split(' (')[0]})`,
            },
          ],
          updatedAt: nowIso,
        });
      }
    }

    setSlotModalOpen(false);
    onNotify?.(
      `Scheduled ${slotJobId} with ${targetTech.name.split(' ')[0]} on ${slotDateKey} (${formatTimeRange(slotStartHour, slotDurationHours)}).`
    );
  };

  const handleDeleteSlot = () => {
    if (!editingSlotId) return;
    onSaveSlots(scheduledSlots.filter((s) => s.id !== editingSlotId));
    setSlotModalOpen(false);
    onNotify?.(`Removed scheduled slot for ${slotJobId}.`);
  };

  // Drag & Drop Handlers (Supports unscheduled JobCard OR moving an existing Slot)
  const handleDropOnCell = (
    e: React.DragEvent,
    targetTechId: string,
    targetDateKey: string,
    explicitStartHour?: number
  ) => {
    e.preventDefault();
    setDragOverCellKey(null);
    const rawSlotId = e.dataTransfer.getData('application/x-slot-id');
    const rawJobId = e.dataTransfer.getData('application/x-job-id');

    const techShift = shiftMap.get(`${targetTechId}__${targetDateKey}`);
    const existingCellSlots = scheduledSlots
      .filter((s) => s.technicianId === targetTechId && s.date === targetDateKey)
      .sort((a, b) => a.startHour - b.startHour);

    const nextAvailableHour = (() => {
      if (explicitStartHour !== undefined) return explicitStartHour;
      const shiftBase = techShift && techShift.shiftType !== 'Off' ? techShift.startHour : 9;
      if (existingCellSlots.length === 0) return shiftBase;
      const tail = existingCellSlots[existingCellSlots.length - 1];
      return Math.min(17, tail.startHour + tail.durationHours);
    })();

    if (rawSlotId) {
      const movingSlot = scheduledSlots.find((s) => s.id === rawSlotId);
      if (!movingSlot) return;
      if (
        movingSlot.technicianId === targetTechId &&
        movingSlot.date === targetDateKey &&
        explicitStartHour === undefined
      ) {
        return;
      }

      const nextSlots = scheduledSlots.map((s) =>
        s.id === rawSlotId
          ? {
              ...s,
              technicianId: targetTechId,
              date: targetDateKey,
              startHour: nextAvailableHour,
            }
          : s
      );
      onSaveSlots(nextSlots);

      const movedJob = jobMap.get(movingSlot.jobCardId);
      const targetTech = SHOP_TECHNICIANS.find((t) => t.id === targetTechId);
      if (movedJob && targetTech && matchTechnicianId(movedJob.technician, SHOP_TECHNICIANS) !== targetTech.id) {
        const nowIso = new Date().toISOString();
        onUpdateJobCard({
          ...movedJob,
          technician: targetTech.name,
          updatedAt: nowIso,
        });
      }
      onNotify?.(
        `Moved ${movingSlot.jobCardId} to ${targetTech?.name.split(' ')[0] || 'Technician'} on ${targetDateKey} at ${formatHourLabel(nextAvailableHour)}.`
      );
      return;
    }

    if (rawJobId) {
      openNewSlotModal({
        jobId: rawJobId,
        techId: targetTechId,
        dateKey: targetDateKey,
        startHour: nextAvailableHour,
      });
    }
  };

  const weekRangeLabel = useMemo(() => {
    const first = weekDays[0];
    const last = weekDays[6];
    const year = addDays(weekStart, 6).getFullYear();
    return `${first.dayShort} ${first.monthShort} ${first.dayNumber} – ${last.dayShort} ${last.monthShort} ${last.dayNumber}, ${year}`;
  }, [weekDays, weekStart]);

  const capacityToneStyles = (tone: ReturnType<typeof getCapacityStatus>['tone']) => {
    switch (tone) {
      case 'overbooked':
        return {
          text: 'text-red-400',
          border: 'border-red-500/40',
          bar: 'bg-red-500',
          bg: 'bg-red-950/20',
        };
      case 'near-cap':
        return {
          text: 'text-amber-400',
          border: 'border-amber-500/40',
          bar: 'bg-amber-400',
          bg: 'bg-amber-950/15',
        };
      case 'nominal':
        return {
          text: 'text-emerald-400',
          border: 'border-emerald-500/30',
          bar: 'bg-emerald-500',
          bg: 'bg-emerald-950/10',
        };
      default:
        return {
          text: 'text-zinc-500',
          border: 'border-zinc-800',
          bar: 'bg-zinc-700',
          bg: 'bg-zinc-950',
        };
    }
  };

  const priorityTagStyle = (priority: JobCard['priority']) => {
    if (priority === 'Emergency') return 'text-red-400';
    if (priority === 'Urgent') return 'text-amber-400';
    return 'text-zinc-400';
  };

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5 shadow-xl">
      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Calendar className="w-5 h-5 text-white shrink-0" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Weekly Workshop Calendar &amp; Capacity Scheduler
            </h2>
          </div>
          <p className="text-xs text-zinc-400 font-sans">
            Schedule technician bench shifts, assign Job Cards to time slots, and monitor daily workshop capacity across all bays.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Week Navigation */}
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl p-1">
            <button
              type="button"
              onClick={handlePrevWeek}
              title="Previous Week"
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleThisWeek}
              className="px-2.5 py-1 text-xs font-semibold text-zinc-200 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              This Week
            </button>
            <span className="px-2.5 text-xs font-mono tabular-nums text-white whitespace-nowrap shrink-0">
              {weekRangeLabel}
            </span>
            <button
              type="button"
              onClick={handleNextWeek}
              title="Next Week"
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Display Mode Toggle */}
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setDisplayMode('week')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                displayMode === 'week'
                  ? 'bg-white text-zinc-950'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Week Matrix
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('day')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                displayMode === 'day'
                  ? 'bg-white text-zinc-950'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Day Timeline
            </button>
          </div>

          {!hasAnyShiftInWeek && (
            <button
              type="button"
              onClick={handlePopulateStandardWeek}
              className="px-3 py-2 text-xs font-semibold text-zinc-200 bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Apply Standard Roster</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => openShiftModal(SHOP_TECHNICIANS[0].id, effectiveSelectedDayKey)}
            className="px-3 py-2 text-xs font-semibold text-zinc-200 bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Configure Shift</span>
          </button>

          <button
            type="button"
            onClick={() => openNewSlotModal()}
            className="px-3.5 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Assign Job Slot</span>
          </button>
        </div>
      </div>

      {/* Workshop Capacity Overview Strip (Unified 4-Cell Grid, Tabular Numerals) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800 border border-zinc-800 rounded-xl bg-zinc-950">
        <div className="p-3.5 space-y-1">
          <div className="text-[11px] text-zinc-400 font-sans">Weekly Shift Capacity</div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xl font-bold text-white font-mono tabular-nums">
              {capacitySummary.totalShiftHours.toFixed(1)}h
            </span>
            <span className="text-xs text-zinc-400 font-mono tabular-nums">
              {capacitySummary.activeShiftCount} active shifts
            </span>
          </div>
        </div>

        <div className="p-3.5 space-y-1">
          <div className="text-[11px] text-zinc-400 font-sans">Scheduled Job Hours</div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xl font-bold text-white font-mono tabular-nums">
              {capacitySummary.totalBookedHours.toFixed(1)}h
            </span>
            <span className="text-xs text-zinc-400 font-mono tabular-nums">
              {capacitySummary.bookedSlotCount} time slots
            </span>
          </div>
        </div>

        <div className="p-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-sans">
            <span className="text-zinc-400">Workshop Utilization</span>
            <span className={`font-semibold ${capacityToneStyles(capacitySummary.overallStatus.tone).text}`}>
              {capacitySummary.overallStatus.label}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-white font-mono tabular-nums">
              {capacitySummary.utilizationPct}%
            </span>
            <div className="flex-1 h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
              <div
                className={`h-full transition-all duration-200 ${
                  capacityToneStyles(capacitySummary.overallStatus.tone).bar
                }`}
                style={{ width: `${Math.min(100, capacitySummary.utilizationPct)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="p-3.5 space-y-1">
          <div className="text-[11px] text-zinc-400 font-sans">Unscheduled Active Jobs</div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xl font-bold text-white font-mono tabular-nums">
              {capacitySummary.unscheduledActiveCount}
            </span>
            <button
              type="button"
              onClick={() => openNewSlotModal()}
              className="text-xs font-semibold text-zinc-300 hover:text-white underline whitespace-nowrap shrink-0"
            >
              Schedule Next
            </button>
          </div>
        </div>
      </div>

      {/* Per-Technician Weekly Capacity Bar & Interactive Filter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-zinc-300 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-zinc-400" />
            <span>Technician Weekly Load &amp; Availability</span>
          </span>
          {focusedTechId !== 'All' && (
            <button
              type="button"
              onClick={() => setFocusedTechId('All')}
              className="text-xs text-zinc-300 hover:text-white underline whitespace-nowrap shrink-0"
            >
              Show All Technicians
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {technicianCapacities.map(({ tech, shiftHours, bookedHours, remainingHours, activeDays, status }) => {
            const isSelected = focusedTechId === tech.id;
            const styles = capacityToneStyles(status.tone);
            return (
              <button
                key={tech.id}
                type="button"
                onClick={() => setFocusedTechId(isSelected ? 'All' : tech.id)}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  isSelected
                    ? 'bg-zinc-900 border-white'
                    : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold font-mono shrink-0 ${tech.avatarColor}`}
                    >
                      {tech.name.charAt(0)}
                    </span>
                    <span className="text-xs font-semibold text-white truncate">
                      {tech.name.split(' (')[0]}
                    </span>
                  </div>
                  <span className={`text-[11px] font-semibold shrink-0 ${styles.text}`}>
                    {status.label}
                  </span>
                </div>

                <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden mb-2 border border-zinc-800">
                  <div
                    className={`h-full transition-all duration-200 ${styles.bar}`}
                    style={{ width: `${Math.min(100, status.utilizationPct)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-zinc-400">
                  <span>
                    <strong className="text-white">{bookedHours.toFixed(1)}h</strong> / {shiftHours.toFixed(1)}h
                  </span>
                  <span>
                    {status.utilizationPct}% · {activeDays}d · {remainingHours >= 0 ? `${remainingHours.toFixed(1)}h free` : `${Math.abs(remainingHours).toFixed(1)}h over`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Split: Calendar Workspace + Unscheduled Active JobCards Queue */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_290px] gap-4 items-start">
        {/* Calendar Surface */}
        <div className="border border-zinc-800 rounded-xl bg-zinc-950 overflow-hidden">
          {displayMode === 'week' ? (
            <div className="overflow-x-auto">
              <div className="min-w-[920px]">
                {/* Day Headers */}
                <div className="grid grid-cols-[190px_repeat(7,minmax(108px,1fr))] border-b border-zinc-800 bg-zinc-900/70">
                  <div className="p-3 text-xs font-semibold text-zinc-300 border-r border-zinc-800 flex items-center justify-between">
                    <span>Technician</span>
                    <span className="text-[11px] text-zinc-500 font-normal">Shift / Slots</span>
                  </div>
                  {weekDays.map((day) => {
                    const daySlots = weekSlots.filter((s) => s.date === day.dateKey);
                    const dayShifts = weekShifts.filter((s) => s.date === day.dateKey);
                    const dayBooked = daySlots.reduce((sum, s) => sum + s.durationHours, 0);
                    const dayCap = dayShifts.reduce((sum, s) => sum + getShiftDuration(s), 0);

                    return (
                      <button
                        key={day.dateKey}
                        type="button"
                        onClick={() => {
                          setSelectedDayKey(day.dateKey);
                          setDisplayMode('day');
                        }}
                        title={`Open hourly timeline for ${day.fullLabel}`}
                        className={`p-2.5 text-left border-r last:border-r-0 border-zinc-800 hover:bg-zinc-900 transition-colors ${
                          day.isToday ? 'bg-zinc-900/90' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-white font-mono tabular-nums">
                            {day.dayShort} {day.dayNumber}
                          </span>
                          {day.isToday && (
                            <span className="text-[10px] font-semibold text-emerald-400">Today</span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono tabular-nums mt-0.5">
                          {dayBooked.toFixed(1)}h / {dayCap.toFixed(0)}h cap
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Technician Matrix Rows */}
                <div className="divide-y divide-zinc-800">
                  {visibleTechnicians.map((tech) => {
                    const techCap = technicianCapacities.find((t) => t.tech.id === tech.id);
                    return (
                      <div
                        key={tech.id}
                        className="grid grid-cols-[190px_repeat(7,minmax(108px,1fr))]"
                      >
                        {/* Row Label */}
                        <div className="p-3 border-r border-zinc-800 bg-zinc-900/30 flex flex-col justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold font-mono shrink-0 ${tech.avatarColor}`}
                              >
                                {tech.name.charAt(0)}
                              </span>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white truncate">
                                  {tech.name.split(' (')[0]}
                                </div>
                                <div className="text-[10px] text-zinc-400 truncate">
                                  {tech.role}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1 pt-2 border-t border-zinc-800/80 text-[11px] font-mono tabular-nums">
                            <div className="flex items-center justify-between text-zinc-400">
                              <span>Week Load</span>
                              <span className="text-white font-semibold">
                                {techCap?.bookedHours.toFixed(1)}h / {techCap?.shiftHours.toFixed(0)}h
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => openShiftModal(tech.id, weekDays[0].dateKey)}
                              className="w-full py-1 px-2 text-[11px] font-sans font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors whitespace-nowrap"
                            >
                              Edit Shift Roster
                            </button>
                          </div>
                        </div>

                        {/* 7 Day Cells */}
                        {weekDays.map((day) => {
                          const cellKey = `${tech.id}__${day.dateKey}`;
                          const shift = shiftMap.get(cellKey);
                          const shiftHrs = getShiftDuration(shift);
                          const cellSlots = weekSlots
                            .filter((s) => s.technicianId === tech.id && s.date === day.dateKey)
                            .sort((a, b) => a.startHour - b.startHour);
                          const bookedHrs = cellSlots.reduce((sum, s) => sum + s.durationHours, 0);
                          const cellCap = getCapacityStatus(bookedHrs, shiftHrs);
                          const capStyles = capacityToneStyles(cellCap.tone);
                          const isDragTarget = dragOverCellKey === cellKey;

                          return (
                            <div
                              key={cellKey}
                              onDragOver={(e) => {
                                e.preventDefault();
                                if (dragOverCellKey !== cellKey) setDragOverCellKey(cellKey);
                              }}
                              onDragLeave={() => {
                                if (dragOverCellKey === cellKey) setDragOverCellKey(null);
                              }}
                              onDrop={(e) => handleDropOnCell(e, tech.id, day.dateKey)}
                              className={`p-2 border-r last:border-r-0 border-zinc-800 flex flex-col justify-between gap-2 min-h-[156px] transition-colors ${
                                isDragTarget
                                  ? 'bg-zinc-800/70'
                                  : day.isWeekend && shiftHrs === 0
                                  ? 'bg-zinc-950/60'
                                  : 'bg-zinc-950'
                              }`}
                            >
                              {/* Shift Header Strip */}
                              <div className="space-y-1.5">
                                <button
                                  type="button"
                                  onClick={() => openShiftModal(tech.id, day.dateKey)}
                                  className={`w-full px-2 py-1 rounded-md border text-left text-[10px] font-mono tabular-nums flex items-center justify-between gap-1 transition-colors ${
                                    shift && shift.shiftType !== 'Off'
                                      ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                                      : 'bg-zinc-950 border-zinc-800/70 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                                  }`}
                                >
                                  <span className="truncate">
                                    {shift && shift.shiftType !== 'Off'
                                      ? `${formatHourLabel(shift.startHour)}–${formatHourLabel(shift.endHour)}`
                                      : shift?.shiftType === 'Off'
                                      ? 'Day Off'
                                      : 'No Shift'}
                                  </span>
                                  <span className="shrink-0 text-zinc-400">
                                    {shiftHrs > 0 ? `${shiftHrs}h` : 'Set'}
                                  </span>
                                </button>

                                {/* Scheduled Job Card Slots */}
                                <div className="space-y-1.5">
                                  {cellSlots.map((slot) => {
                                    const job = jobMap.get(slot.jobCardId);
                                    const overlaps = findSlotOverlaps(
                                      cellSlots,
                                      slot,
                                      slot.id
                                    );
                                    const outside = isSlotOutsideShift(slot, shift);
                                    const hasWarning = overlaps.length > 0 || outside;

                                    return (
                                      <button
                                        key={slot.id}
                                        type="button"
                                        draggable
                                        onDragStart={(e) => {
                                          e.dataTransfer.setData('application/x-slot-id', slot.id);
                                          e.dataTransfer.effectAllowed = 'move';
                                        }}
                                        onClick={() => openEditSlotModal(slot)}
                                        className={`w-full text-left p-1.5 rounded-lg border transition-colors cursor-grab active:cursor-grabbing ${
                                          hasWarning
                                            ? 'bg-amber-950/20 border-amber-500/40 hover:border-amber-400'
                                            : 'bg-zinc-900 border-zinc-700/80 hover:border-zinc-500'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-1 text-[10px] font-mono tabular-nums">
                                          <span className="text-zinc-300 font-semibold">
                                            {formatTimeRange(slot.startHour, slot.durationHours)}
                                          </span>
                                          <span className="text-zinc-400">{slot.durationHours}h</span>
                                        </div>
                                        <div className="text-[11px] font-bold text-white font-mono truncate mt-0.5">
                                          {slot.jobCardId}
                                        </div>
                                        {job && (
                                          <div className="text-[10px] text-zinc-400 font-sans truncate">
                                            {job.tool.modelNumber}
                                          </div>
                                        )}
                                        <div className="flex items-center justify-between gap-1 text-[10px] mt-0.5">
                                          {job && (
                                            <span className={`font-semibold ${priorityTagStyle(job.priority)}`}>
                                              {job.priority}
                                            </span>
                                          )}
                                          {overlaps.length > 0 ? (
                                            <span className="text-red-400 font-semibold">Overlap</span>
                                          ) : outside ? (
                                            <span className="text-amber-400 font-semibold">Outside Shift</span>
                                          ) : null}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Cell Capacity Footer & Add Action */}
                              <div className="pt-1.5 border-t border-zinc-900 space-y-1">
                                {(shiftHrs > 0 || bookedHrs > 0) && (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
                                      <span className={capStyles.text}>
                                        {bookedHrs.toFixed(1)}h / {shiftHrs.toFixed(0)}h
                                      </span>
                                      <span className={capStyles.text}>{cellCap.label}</span>
                                    </div>
                                    {shiftHrs > 0 && (
                                      <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full ${capStyles.bar}`}
                                          style={{ width: `${Math.min(100, cellCap.utilizationPct)}%` }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    openNewSlotModal({
                                      techId: tech.id,
                                      dateKey: day.dateKey,
                                    })
                                  }
                                  className="w-full py-1 text-[10px] font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 rounded transition-colors flex items-center justify-center gap-1 whitespace-nowrap"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Assign Slot</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Day Hourly Timeline View */
            <div className="divide-y divide-zinc-800">
              {/* Day Selector Strip */}
              <div className="flex items-center justify-between gap-2 p-3 bg-zinc-900/70 overflow-x-auto">
                <div className="flex items-center gap-1.5">
                  {weekDays.map((day) => {
                    const isSelected = day.dateKey === effectiveSelectedDayKey;
                    const dayHours = weekSlots
                      .filter((s) => s.date === day.dateKey)
                      .reduce((sum, s) => sum + s.durationHours, 0);
                    return (
                      <button
                        key={day.dateKey}
                        type="button"
                        onClick={() => setSelectedDayKey(day.dateKey)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono tabular-nums border transition-colors whitespace-nowrap shrink-0 ${
                          isSelected
                            ? 'bg-white text-zinc-950 border-white font-bold'
                            : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:text-white'
                        }`}
                      >
                        {day.dayShort} {day.dayNumber} · {dayHours.toFixed(1)}h
                      </button>
                    );
                  })}
                </div>

                <span className="text-xs text-zinc-400 font-sans whitespace-nowrap shrink-0">
                  Click any empty hour cell to assign a Job Card
                </span>
              </div>

              {/* Hourly Grid */}
              <div className="overflow-x-auto">
                <div className="min-w-[900px]">
                  {/* Hour Column Headers */}
                  <div className="grid grid-cols-[190px_1fr] border-b border-zinc-800 bg-zinc-900/40">
                    <div className="p-2.5 text-xs font-semibold text-zinc-300 border-r border-zinc-800">
                      Technician · {effectiveSelectedDayKey}
                    </div>
                    <div className="grid grid-cols-10">
                      {Array.from({ length: TIMELINE_TOTAL_HOURS }, (_, idx) => {
                        const hr = TIMELINE_START_HOUR + idx;
                        return (
                          <div
                            key={hr}
                            className="p-2 text-[11px] font-mono tabular-nums text-zinc-400 border-r last:border-r-0 border-zinc-800 text-center"
                          >
                            {formatHourLabel(hr)}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Technician Timeline Rows */}
                  <div className="divide-y divide-zinc-800">
                    {visibleTechnicians.map((tech) => {
                      const shift = shiftMap.get(`${tech.id}__${effectiveSelectedDayKey}`);
                      const shiftHrs = getShiftDuration(shift);
                      const daySlots = weekSlots
                        .filter(
                          (s) =>
                            s.technicianId === tech.id &&
                            s.date === effectiveSelectedDayKey
                        )
                        .sort((a, b) => a.startHour - b.startHour);
                      const bookedHrs = daySlots.reduce((sum, s) => sum + s.durationHours, 0);
                      const capStatus = getCapacityStatus(bookedHrs, shiftHrs);
                      const capStyles = capacityToneStyles(capStatus.tone);

                      return (
                        <div
                          key={tech.id}
                          className="grid grid-cols-[190px_1fr] min-h-[84px]"
                        >
                          <div className="p-3 border-r border-zinc-800 bg-zinc-900/20 flex flex-col justify-between gap-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-bold text-white truncate">
                                {tech.name.split(' (')[0]}
                              </span>
                              <span className={`text-[10px] font-semibold ${capStyles.text}`}>
                                {capStatus.label}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => openShiftModal(tech.id, effectiveSelectedDayKey)}
                              className="text-[11px] font-mono tabular-nums text-zinc-400 hover:text-white text-left underline"
                            >
                              {shift && shift.shiftType !== 'Off'
                                ? `Shift ${formatHourLabel(shift.startHour)}–${formatHourLabel(shift.endHour)} (${bookedHrs.toFixed(1)}h / ${shiftHrs}h)`
                                : 'Off Duty · Set Shift'}
                            </button>
                          </div>

                          {/* 10-Hour Interactive Track */}
                          <div className="relative grid grid-cols-10">
                            {Array.from({ length: TIMELINE_TOTAL_HOURS }, (_, idx) => {
                              const hr = TIMELINE_START_HOUR + idx;
                              const inShift =
                                shift &&
                                shift.shiftType !== 'Off' &&
                                hr >= shift.startHour &&
                                hr < shift.endHour;

                              return (
                                <button
                                  key={hr}
                                  type="button"
                                  onClick={() =>
                                    openNewSlotModal({
                                      techId: tech.id,
                                      dateKey: effectiveSelectedDayKey,
                                      startHour: hr,
                                    })
                                  }
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) =>
                                    handleDropOnCell(e, tech.id, effectiveSelectedDayKey, hr)
                                  }
                                  title={`Assign Job Card at ${formatHourLabel(hr)}`}
                                  className={`border-r last:border-r-0 border-zinc-800/80 h-full transition-colors flex items-end justify-end p-1 text-[10px] text-transparent hover:text-zinc-400 ${
                                    inShift
                                      ? 'bg-zinc-950 hover:bg-zinc-900'
                                      : 'bg-zinc-900/50 hover:bg-zinc-900'
                                  }`}
                                >
                                  <span>+ {formatHourLabel(hr)}</span>
                                </button>
                              );
                            })}

                            {/* Positioned Job Card Slot Bars */}
                            {daySlots.map((slot, idx) => {
                              const clampedStart = Math.max(TIMELINE_START_HOUR, slot.startHour);
                              const clampedEnd = Math.min(
                                TIMELINE_END_HOUR,
                                slot.startHour + slot.durationHours
                              );
                              if (clampedEnd <= clampedStart) return null;

                              const leftPct =
                                ((clampedStart - TIMELINE_START_HOUR) / TIMELINE_TOTAL_HOURS) *
                                100;
                              const widthPct =
                                ((clampedEnd - clampedStart) / TIMELINE_TOTAL_HOURS) * 100;

                              const job = jobMap.get(slot.jobCardId);
                              const overlaps = findSlotOverlaps(daySlots, slot, slot.id);
                              const outside = isSlotOutsideShift(slot, shift);
                              const topOffset = overlaps.length > 0 && idx % 2 === 1 ? 'top-10' : 'top-2';

                              return (
                                <button
                                  key={slot.id}
                                  type="button"
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData('application/x-slot-id', slot.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditSlotModal(slot);
                                  }}
                                  style={{
                                    left: `calc(${leftPct}% + 3px)`,
                                    width: `calc(${widthPct}% - 6px)`,
                                  }}
                                  className={`absolute ${topOffset} bottom-2 rounded-lg border px-2 py-1 text-left overflow-hidden transition-colors z-10 ${
                                    overlaps.length > 0 || outside
                                      ? 'bg-amber-950/90 border-amber-500/60 text-white hover:border-amber-400'
                                      : 'bg-zinc-900/95 border-zinc-600 text-white hover:border-white'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1 text-[10px] font-mono tabular-nums text-zinc-300">
                                    <span className="truncate">
                                      {formatTimeRange(slot.startHour, slot.durationHours)}
                                    </span>
                                    <span className="shrink-0">{slot.durationHours}h</span>
                                  </div>
                                  <div className="text-[11px] font-bold font-mono truncate">
                                    {slot.jobCardId}
                                  </div>
                                  {job && (
                                    <div className="text-[10px] text-zinc-400 truncate font-sans">
                                      {job.tool.modelNumber}
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Active JobCards Assignment Queue */}
        <aside className="border border-zinc-800 rounded-xl bg-zinc-950 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-zinc-400" />
              <span>Job Card Queue</span>
            </h3>
            <span className="text-[11px] font-mono tabular-nums text-zinc-400">
              {queueJobs.length} shown
            </span>
          </div>

          <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
            <button
              type="button"
              onClick={() => setQueueFilter('unscheduled')}
              className={`flex-1 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${
                queueFilter === 'unscheduled'
                  ? 'bg-white text-zinc-950'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Unscheduled
            </button>
            <button
              type="button"
              onClick={() => setQueueFilter('all')}
              className={`flex-1 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${
                queueFilter === 'all'
                  ? 'bg-white text-zinc-950'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              All Active
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={queueSearch}
              onChange={(e) => setQueueSearch(e.target.value)}
              placeholder="Filter job ID, customer, tool..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div className="text-[11px] text-zinc-500 font-sans">
            Drag any card onto a calendar day cell, or click Schedule.
          </div>

          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-0.5">
            {queueJobs.length === 0 ? (
              <div className="p-5 text-center border border-dashed border-zinc-800 rounded-lg space-y-2">
                <div className="text-xs text-zinc-400">
                  {queueFilter === 'unscheduled'
                    ? 'All active job cards have slots assigned this week.'
                    : 'No active job cards match your filter.'}
                </div>
                {queueFilter === 'unscheduled' && (
                  <button
                    type="button"
                    onClick={() => setQueueFilter('all')}
                    className="text-xs font-semibold text-white underline"
                  >
                    View All Active Jobs
                  </button>
                )}
              </div>
            ) : (
              queueJobs.map((job) => {
                const isScheduledThisWeek = capacitySummary.scheduledJobIdsThisWeek.has(job.id);
                return (
                  <div
                    key={job.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-job-id', job.id);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors space-y-1.5 cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectJobCard?.(job)}
                        className="text-xs font-bold text-white font-mono hover:underline truncate"
                      >
                        {job.id}
                      </button>
                      <span className={`text-[10px] font-semibold shrink-0 ${priorityTagStyle(job.priority)}`}>
                        {job.priority}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-200 font-medium truncate">
                      {job.tool.brand} {job.tool.modelNumber}
                    </div>

                    <div className="text-[11px] text-zinc-400 truncate">
                      {job.customerName} · {job.status}
                    </div>

                    <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800/80 text-[11px]">
                      <span className="font-mono tabular-nums text-zinc-400">
                        Est. {(job.laborHours || 1).toFixed(1)}h
                        {isScheduledThisWeek ? ' · Scheduled' : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => openNewSlotModal({ jobId: job.id })}
                        className="px-2 py-1 text-[11px] font-semibold bg-white text-zinc-950 hover:bg-zinc-200 rounded transition-colors whitespace-nowrap shrink-0"
                      >
                        Schedule
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>

      {/* Shift Configuration Modal */}
      {shiftModalOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950/85 backdrop-blur flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-zinc-300" />
                <span>Configure Technician Shift</span>
              </h3>
              <button
                type="button"
                onClick={() => setShiftModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-white rounded-lg"
                aria-label="Close shift modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Technician</label>
                  <select
                    value={shiftTechId}
                    onChange={(e) => setShiftTechId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                  >
                    {SHOP_TECHNICIANS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name.split(' (')[0]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Date</label>
                  <input
                    type="date"
                    value={shiftDateKey}
                    onChange={(e) => setShiftDateKey(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white font-mono tabular-nums focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Quick Shift Presets</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {SHIFT_PRESETS.map((preset, idx) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleApplyShiftPreset(idx)}
                      className={`px-2 py-1.5 rounded-lg border text-left text-[11px] transition-colors ${
                        shiftType === preset.shiftType &&
                        shiftStartHour === preset.startHour &&
                        shiftEndHour === preset.endHour
                          ? 'bg-white text-zinc-950 border-white font-semibold'
                          : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-600'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {shiftType !== 'Off' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Start Hour</label>
                    <select
                      value={shiftStartHour}
                      onChange={(e) => setShiftStartHour(Number(e.target.value))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white font-mono tabular-nums focus:outline-none"
                    >
                      {[6, 7, 8, 9, 10, 11, 12, 13, 14].map((hr) => (
                        <option key={hr} value={hr}>
                          {formatHourLabel(hr)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">End Hour</label>
                    <select
                      value={shiftEndHour}
                      onChange={(e) => setShiftEndHour(Number(e.target.value))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white font-mono tabular-nums focus:outline-none"
                    >
                      {[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((hr) => (
                        <option key={hr} value={hr} disabled={hr <= shiftStartHour}>
                          {formatHourLabel(hr)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Assigned Bay / Bench</label>
                <select
                  value={shiftBay}
                  onChange={(e) => setShiftBay(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none"
                >
                  {WORKSHOP_BAYS.map((bay) => (
                    <option key={bay} value={bay}>
                      {bay}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Shift Notes</label>
                <input
                  type="text"
                  value={shiftNotes}
                  onChange={(e) => setShiftNotes(e.target.value)}
                  placeholder="Optional coverage or training note..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <label className="flex items-center gap-2 pt-1 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyMonToFri}
                  onChange={(e) => setApplyMonToFri(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-950 text-white"
                />
                <span>Apply this shift to Mon–Fri of the displayed week</span>
              </label>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
              {shiftMap.has(`${shiftTechId}__${shiftDateKey}`) && !applyMonToFri ? (
                <button
                  type="button"
                  onClick={handleDeleteShift}
                  className="px-3 py-2 text-xs font-semibold text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Shift</span>
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShiftModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveShift}
                  className="px-4 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl transition-colors"
                >
                  Save Shift
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Job Card Time Slot Assignment / Editor Modal */}
      {slotModalOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950/85 backdrop-blur flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-300" />
                <span>{editingSlotId ? 'Edit Scheduled Job Slot' : 'Assign Job Card to Time Slot'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setSlotModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-white rounded-lg"
                aria-label="Close slot modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Job Card</label>
                <select
                  value={slotJobId}
                  onChange={(e) => {
                    const nextJob = jobMap.get(e.target.value);
                    setSlotJobId(e.target.value);
                    if (nextJob && !editingSlotId) {
                      setSlotDurationHours(
                        Math.max(0.5, Math.min(8, Math.round((nextJob.laborHours || 1.5) * 2) / 2))
                      );
                    }
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-zinc-600"
                >
                  {jobCards.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.id} · {j.tool.brand} {j.tool.modelNumber} ({j.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Assigned Technician</label>
                  <select
                    value={slotTechId}
                    onChange={(e) => setSlotTechId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                  >
                    {SHOP_TECHNICIANS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name.split(' (')[0]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Scheduled Date</label>
                  <input
                    type="date"
                    value={slotDateKey}
                    onChange={(e) => setSlotDateKey(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-mono tabular-nums focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Start Time</label>
                  <select
                    value={slotStartHour}
                    onChange={(e) => setSlotStartHour(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-mono tabular-nums focus:outline-none"
                  >
                    {START_HOUR_OPTIONS.map((hr) => (
                      <option key={hr} value={hr}>
                        {formatHourLabel(hr)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Bench Duration</label>
                  <select
                    value={slotDurationHours}
                    onChange={(e) => setSlotDurationHours(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-mono tabular-nums focus:outline-none"
                  >
                    {DURATION_OPTIONS.map((dur) => (
                      <option key={dur} value={dur}>
                        {dur.toFixed(1)} hrs ({formatTimeRange(slotStartHour, dur)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Shift & Conflict Status Banner */}
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between font-mono tabular-nums text-zinc-300">
                  <span>Technician Shift Coverage:</span>
                  <span>
                    {modalShift && modalShift.shiftType !== 'Off'
                      ? `${formatHourLabel(modalShift.startHour)}–${formatHourLabel(modalShift.endHour)} (${getShiftDuration(modalShift)}h)`
                      : modalShift?.shiftType === 'Off'
                      ? 'Day Off (0h)'
                      : 'No Shift Configured'}
                  </span>
                </div>

                {modalOutsideShift && (
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Selected slot falls outside the technician&apos;s active shift hours.</span>
                  </div>
                )}

                {modalOverlaps.length > 0 && (
                  <div className="flex items-center gap-1.5 text-red-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Overlaps {modalOverlaps.map((o) => `${o.jobCardId} (${formatTimeRange(o.startHour, o.durationHours)})`).join(', ')}.
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Bench Task Notes</label>
                <input
                  type="text"
                  value={slotNotes}
                  onChange={(e) => setSlotNotes(e.target.value)}
                  placeholder="e.g., Armature replacement & load benchmark test"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <label className="flex items-center gap-2 pt-1 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncJobTech}
                  onChange={(e) => setSyncJobTech(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-950 text-white"
                />
                <span>Sync assigned technician onto the Job Card &amp; audit trail</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-zinc-800">
              <div className="flex items-center gap-2">
                {editingSlotId && (
                  <button
                    type="button"
                    onClick={handleDeleteSlot}
                    className="px-3 py-2 text-xs font-semibold text-red-400 hover:text-red-300 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
                {slotJobId && onSelectJobCard && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = jobMap.get(slotJobId);
                      if (target) {
                        setSlotModalOpen(false);
                        onSelectJobCard(target);
                      }
                    }}
                    className="px-3 py-2 text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Job Card</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSlotModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSlot}
                  className="px-4 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl transition-colors"
                >
                  {editingSlotId ? 'Update Slot' : 'Assign Slot'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
