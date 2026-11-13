import { JobCard, ScheduledJobSlot, ShiftType, TechnicianShift } from '../types';
import { Technician } from '../data/mockTechnicians';
import { matchTechnicianId } from './technicianPerformance';

export interface WeekDayDescriptor {
  dateKey: string;
  dayShort: string;
  dayNumber: string;
  monthShort: string;
  fullLabel: string;
  isToday: boolean;
  isWeekend: boolean;
}

export const WORKSHOP_BAYS = [
  'Bench 1 · Heavy SDS & Breakers',
  'Bench 2 · Electrical & Armatures',
  'Bench 3 · Pneumatic & Seals',
  'Bench 4 · Cordless & Diagnostics',
];

export const SHIFT_PRESETS: {
  label: string;
  shiftType: ShiftType;
  startHour: number;
  endHour: number;
}[] = [
  { label: 'Early Full (08:00–16:00 · 8h)', shiftType: 'Full Shift', startHour: 8, endHour: 16 },
  { label: 'Mid Full (09:00–17:00 · 8h)', shiftType: 'Full Shift', startHour: 9, endHour: 17 },
  { label: 'Late Full (10:00–18:00 · 8h)', shiftType: 'Full Shift', startHour: 10, endHour: 18 },
  { label: 'Morning Half (08:00–12:00 · 4h)', shiftType: 'Morning Half', startHour: 8, endHour: 12 },
  { label: 'Afternoon Half (13:00–17:00 · 4h)', shiftType: 'Afternoon Half', startHour: 13, endHour: 17 },
  { label: 'Extended Overtime (08:00–18:00 · 10h)', shiftType: 'Overtime', startHour: 8, endHour: 18 },
  { label: 'Day Off (0h)', shiftType: 'Off', startHour: 0, endHour: 0 },
];

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getMondayOfWeek(referenceDate: Date = new Date()): Date {
  const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export function getWeekDays(weekStart: Date): WeekDayDescriptor[] {
  const todayKey = formatDateKey(new Date());
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return Array.from({ length: 7 }, (_, index) => {
    const current = addDays(weekStart, index);
    const dateKey = formatDateKey(current);
    const dayShort = dayNames[index];
    const dayNumber = String(current.getDate()).padStart(2, '0');
    const monthShort = monthNames[current.getMonth()];
    return {
      dateKey,
      dayShort,
      dayNumber,
      monthShort,
      fullLabel: `${dayShort} ${monthShort} ${dayNumber}`,
      isToday: dateKey === todayKey,
      isWeekend: index >= 5,
    };
  });
}

export function formatHourLabel(hour: number): string {
  const wholeHours = Math.floor(hour);
  const mins = Math.round((hour - wholeHours) * 60);
  return `${String(wholeHours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function formatTimeRange(startHour: number, durationHours: number): string {
  return `${formatHourLabel(startHour)}–${formatHourLabel(startHour + durationHours)}`;
}

export function getShiftDuration(shift?: TechnicianShift): number {
  if (!shift || shift.shiftType === 'Off') return 0;
  return Math.max(0, Math.round((shift.endHour - shift.startHour) * 10) / 10);
}

export function findSlotOverlaps(
  slots: ScheduledJobSlot[],
  candidate: { technicianId: string; date: string; startHour: number; durationHours: number },
  excludeSlotId?: string
): ScheduledJobSlot[] {
  const candEnd = candidate.startHour + candidate.durationHours;
  return slots.filter((slot) => {
    if (excludeSlotId && slot.id === excludeSlotId) return false;
    if (slot.technicianId !== candidate.technicianId || slot.date !== candidate.date) return false;
    const slotEnd = slot.startHour + slot.durationHours;
    return candidate.startHour < slotEnd && candEnd > slot.startHour;
  });
}

export function isSlotOutsideShift(
  slot: { startHour: number; durationHours: number },
  shift?: TechnicianShift
): boolean {
  if (!shift || shift.shiftType === 'Off') return true;
  const slotEnd = slot.startHour + slot.durationHours;
  return slot.startHour < shift.startHour || slotEnd > shift.endHour;
}

export function getCapacityStatus(bookedHours: number, shiftHours: number): {
  label: string;
  utilizationPct: number;
  tone: 'neutral' | 'nominal' | 'near-cap' | 'overbooked' | 'unshifted';
} {
  if (shiftHours <= 0) {
    if (bookedHours > 0) {
      return { label: 'Unshifted', utilizationPct: 100, tone: 'overbooked' };
    }
    return { label: 'Day Off', utilizationPct: 0, tone: 'neutral' };
  }

  const pct = Math.round((bookedHours / shiftHours) * 100);
  if (bookedHours > shiftHours) {
    return { label: 'Overbooked', utilizationPct: pct, tone: 'overbooked' };
  }
  if (pct >= 80) {
    return { label: 'Near Cap', utilizationPct: pct, tone: 'near-cap' };
  }
  return { label: 'Nominal', utilizationPct: pct, tone: 'nominal' };
}

export function buildStandardWeekShifts(
  weekStart: Date,
  technicians: Technician[],
  existingShifts: TechnicianShift[] = []
): TechnicianShift[] {
  const days = getWeekDays(weekStart);
  const existingKeys = new Set(existingShifts.map((s) => `${s.technicianId}__${s.date}`));
  const generated: TechnicianShift[] = [];

  days.forEach((day, dayIndex) => {
    technicians.forEach((tech, techIndex) => {
      const key = `${tech.id}__${day.dateKey}`;
      if (existingKeys.has(key)) return;

      const bay = WORKSHOP_BAYS[techIndex % WORKSHOP_BAYS.length];

      // Mon–Fri regular rotating shifts; Saturday morning half-shift for techs 0 & 3; Sunday off
      if (dayIndex < 5) {
        const startHour = techIndex === 0 ? 8 : techIndex === 1 ? 9 : techIndex === 2 ? 8 : 9;
        const endHour = startHour + 8;
        generated.push({
          id: `shift-${tech.id}-${day.dateKey}`,
          technicianId: tech.id,
          date: day.dateKey,
          startHour,
          endHour,
          shiftType: 'Full Shift',
          bay,
          notes: 'Standard weekday workshop roster',
        });
      } else if (dayIndex === 5 && (techIndex === 0 || techIndex === 3)) {
        generated.push({
          id: `shift-${tech.id}-${day.dateKey}`,
          technicianId: tech.id,
          date: day.dateKey,
          startHour: 8,
          endHour: 12,
          shiftType: 'Morning Half',
          bay,
          notes: 'Saturday express pickup & diagnostics coverage',
        });
      } else {
        generated.push({
          id: `shift-${tech.id}-${day.dateKey}`,
          technicianId: tech.id,
          date: day.dateKey,
          startHour: 0,
          endHour: 0,
          shiftType: 'Off',
          bay,
        });
      }
    });
  });

  return generated;
}

export function buildInitialTechShifts(technicians: Technician[], referenceDate: Date = new Date()): TechnicianShift[] {
  const monday = getMondayOfWeek(referenceDate);
  return buildStandardWeekShifts(monday, technicians);
}

export function buildInitialScheduledSlots(
  jobCards: JobCard[],
  technicians: Technician[],
  referenceDate: Date = new Date()
): ScheduledJobSlot[] {
  const monday = getMondayOfWeek(referenceDate);
  const days = getWeekDays(monday);
  const slots: ScheduledJobSlot[] = [];

  // Map active / recent jobs cleanly across Mon-Fri of the current week without overlaps
  const candidateJobs = jobCards.filter((j) => j.status !== 'Cancelled').slice(0, 7);

  // Track next available hour per tech+day
  const cursorByTechDay = new Map<string, number>();

  candidateJobs.forEach((job, idx) => {
    const matchedTechId = matchTechnicianId(job.technician, technicians) || technicians[idx % technicians.length].id;
    const techIndex = Math.max(0, technicians.findIndex((t) => t.id === matchedTechId));
    const baseShiftStart = techIndex === 0 || techIndex === 2 ? 8 : 9;

    // Spread jobs realistically across Mon–Fri (day indices 0..4), keeping today well populated
    const dayIndex = idx % 5;
    const dateKey = days[dayIndex].dateKey;
    const techDayKey = `${matchedTechId}__${dateKey}`;

    const startHour = cursorByTechDay.get(techDayKey) ?? (baseShiftStart + (idx % 2 === 0 ? 0.5 : 1));
    const roundedEstimate = Math.max(1, Math.min(4, Math.round((job.laborHours || 1.5) * 2) / 2));

    slots.push({
      id: `slot-init-${job.id}`,
      jobCardId: job.id,
      technicianId: matchedTechId,
      date: dateKey,
      startHour,
      durationHours: roundedEstimate,
      notes: `${job.serviceReq.serviceType} · ${job.tool.modelNumber}`,
    });

    cursorByTechDay.set(techDayKey, startHour + roundedEstimate + 0.5);
  });

  return slots;
}
