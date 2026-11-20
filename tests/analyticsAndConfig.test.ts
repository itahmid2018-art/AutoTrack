import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ANALYTICS_METRICS,
  CORE_ANALYTICS_METRICS,
  ANALYTICS_METRIC_DEFINITIONS,
  resolveAnalyticsMetrics,
  countEnabledAnalyticsMetrics,
} from '../src/utils/analyticsConfig';
import {
  TOOL_SERVICE_SEASONAL_INDICES,
  getSeasonalCategoryLabel,
  generateMonthlyRevenueForecast,
} from '../src/utils/revenueForecast';
import {
  matchTechnicianId,
  calculateTechnicianPerformance,
} from '../src/utils/technicianPerformance';
import {
  WORKSHOP_BAYS,
  SHIFT_PRESETS,
  formatDateKey,
  getMondayOfWeek,
  addDays,
  getWeekDays,
  formatHourLabel,
  formatTimeRange,
  getShiftDuration,
  findSlotOverlaps,
  isSlotOutsideShift,
  getCapacityStatus,
  buildStandardWeekShifts,
  buildInitialTechShifts,
  buildInitialScheduledSlots,
} from '../src/utils/workshopSchedule';
import { INITIAL_JOB_CARDS } from '../src/data/initialJobCards';
import { INITIAL_INVENTORY } from '../src/data/mockInventory';
import { SHOP_TECHNICIANS } from '../src/data/mockTechnicians';
import { INITIAL_RECURRING_MAINTENANCE } from '../src/data/initialRecurringMaintenance';
import { INITIAL_CUSTOM_FIELDS } from '../src/data/initialCustomFields';
import { JobCard, ScheduledJobSlot, TechnicianShift } from '../src/types';

function makeSampleJob(overrides: Partial<JobCard> = {}): JobCard {
  const now = '2026-10-15T10:00:00.000Z';
  return {
    id: 'BOSCH-2026-9001',
    customerName: 'Apex Construction',
    customerPhone: '+15551112222',
    tool: {
      brand: 'Bosch Professional',
      category: 'Rotary Hammer / SDS',
      modelNumber: 'GBH 2-26',
      serialNumber: '3611900100',
      voltageRating: '230V',
      warrantyStatus: 'Out of Warranty',
      physicalCondition: 'Good',
      accessoriesReceived: [],
    },
    serviceReq: {
      grievanceCategory: 'Low Impact / No Hammering Action',
      detailedComplaint: 'Weak hammering',
      serviceType: 'Standard Overhaul',
      preApprovedLimit: 250,
    },
    intakeDate: '2026-10-10',
    promisedCompletion: '2026-10-16',
    status: 'Completed',
    priority: 'Low',
    technician: 'David Miller',
    laborHours: 2,
    laborRate: 75,
    discount: 0,
    taxRate: 10,
    parts: [
      {
        partId: 'inv-1',
        sku: 'BRSH-01',
        name: 'Carbon Brush',
        unitPrice: 25,
        quantity: 2,
        total: 50,
      },
    ],
    operationalExpenses: [],
    totalAmount: 220,
    messageLogs: [],
    auditLogs: [
      {
        id: 'log-1',
        timestamp: '2026-10-10T09:00:00.000Z',
        userName: 'David Miller',
        userRole: 'Senior Technician',
        action: 'STAGE_CHANGED',
        newState: 'In Service',
      },
      {
        id: 'log-2',
        timestamp: '2026-10-11T09:00:00.000Z',
        userName: 'David Miller',
        userRole: 'Senior Technician',
        action: 'JOB_COMPLETED',
        newState: 'Completed',
      },
    ],
    createdAt: now,
    updatedAt: '2026-10-11T09:00:00.000Z',
    ...overrides,
  };
}

describe('analyticsConfig utilities', () => {
  it('resolves default and partial metric configurations cleanly', () => {
    assert.equal(countEnabledAnalyticsMetrics(DEFAULT_ANALYTICS_METRICS), 8);
    assert.equal(countEnabledAnalyticsMetrics(CORE_ANALYTICS_METRICS), 4);
    assert.equal(ANALYTICS_METRIC_DEFINITIONS.length, 8);

    const merged = resolveAnalyticsMetrics({ revenue: false, avgRepairTime: false });
    assert.equal(merged.revenue, false);
    assert.equal(merged.avgRepairTime, false);
    assert.equal(merged.activeJobs, true);
    assert.equal(countEnabledAnalyticsMetrics(merged), 6);

    const fromNull = resolveAnalyticsMetrics(null);
    assert.deepEqual(fromNull, DEFAULT_ANALYTICS_METRICS);
  });
});

describe('revenueForecast utilities', () => {
  it('validates 12 seasonal indices and category labels', () => {
    assert.equal(TOOL_SERVICE_SEASONAL_INDICES.length, 12);
    assert.ok(getSeasonalCategoryLabel(1.12).startsWith('Peak Demand'));
    assert.ok(getSeasonalCategoryLabel(1.04).startsWith('Above Avg'));
    assert.ok(getSeasonalCategoryLabel(0.84).startsWith('Off-Peak'));
    assert.ok(getSeasonalCategoryLabel(0.94).startsWith('Moderate'));
    assert.equal(getSeasonalCategoryLabel(1.0), 'Baseline (0%)');
  });

  it('generates historical + forecast series across scenarios and horizons', () => {
    const jobs = [
      makeSampleJob({ id: 'J1', intakeDate: '2026-09-05', totalAmount: 300, status: 'Completed' }),
      makeSampleJob({ id: 'J2', intakeDate: '2026-10-12', totalAmount: 450, status: 'In Service' }),
      makeSampleJob({ id: 'J3', intakeDate: '2026-10-14', totalAmount: 999, status: 'Cancelled' }),
    ];

    const baseline = generateMonthlyRevenueForecast(jobs, INITIAL_RECURRING_MAINTENANCE, 6, 'baseline');
    const growth = generateMonthlyRevenueForecast(jobs, INITIAL_RECURRING_MAINTENANCE, 6, 'growth');
    const conservative = generateMonthlyRevenueForecast(jobs, INITIAL_RECURRING_MAINTENANCE, 6, 'conservative');

    assert.equal(baseline.series.length, 12); // 6 trailing + 6 forecast
    assert.equal(baseline.currentPipelineJobs, 1); // J2 only (J1 completed, J3 cancelled)
    assert.equal(baseline.currentPipelineRevenue, 450); // respects stored non-zero totalAmount when opEx is empty
    assert.ok(growth.projectedTotal >= baseline.projectedTotal);
    assert.ok(baseline.projectedTotal >= conservative.projectedTotal);
    assert.ok(baseline.peakMonth !== null);
    assert.ok(baseline.lowestMonth !== null);
  });
});

describe('technicianPerformance utilities', () => {
  it('matches technician names safely and excludes generic placeholders', () => {
    assert.equal(matchTechnicianId('David Miller (Senior Tech)', SHOP_TECHNICIANS), SHOP_TECHNICIANS[0].id);
    assert.equal(matchTechnicianId('Front Desk Receptionist', SHOP_TECHNICIANS), null);
    assert.equal(matchTechnicianId('System', SHOP_TECHNICIANS), null);
    assert.equal(matchTechnicianId(undefined, SHOP_TECHNICIANS), null);
  });

  it('computes completions, turnaround hours, active workload, and revenue per technician', () => {
    const firstTech = SHOP_TECHNICIANS[0];
    const completedJob = makeSampleJob({
      id: 'J-PERF-1',
      technician: firstTech.name,
      status: 'Completed',
      auditLogs: [
        {
          id: 'a1',
          timestamp: '2026-10-10T08:00:00.000Z',
          userName: firstTech.name,
          userRole: firstTech.role,
          action: 'STAGE_CHANGED',
          newState: 'In Service',
        },
        {
          id: 'a2',
          timestamp: '2026-10-10T20:00:00.000Z',
          userName: firstTech.name,
          userRole: firstTech.role,
          action: 'JOB_COMPLETED',
          newState: 'Completed',
        },
      ],
    });
    const activeJob = makeSampleJob({
      id: 'J-PERF-2',
      technician: firstTech.name,
      status: 'In Service',
      auditLogs: [],
    });

    const stats = calculateTechnicianPerformance([completedJob, activeJob], SHOP_TECHNICIANS);
    const firstStats = stats.find((s) => s.tech.id === firstTech.id)!;

    assert.equal(firstStats.totalJobsCompleted, 1);
    assert.equal(firstStats.auditVerifiedCompletions, 1);
    assert.equal(firstStats.avgTurnaroundHours, 12);
    assert.equal(firstStats.assignedActive, 1);
    assert.equal(firstStats.totalAssignedJobs, 2);
    assert.equal(firstStats.totalRevenueGenerated, 440);
    assert.equal(firstStats.auditEventsLogged, 2);
  });
});

describe('workshopSchedule utilities', () => {
  it('handles date math, formatting, shifts, overlaps, and capacity thresholds', () => {
    const wed = new Date(2026, 10, 18); // Wed Nov 18 2026
    const mon = getMondayOfWeek(wed);
    assert.equal(formatDateKey(mon), '2026-11-16');
    assert.equal(formatDateKey(addDays(mon, 2)), '2026-11-18');

    const days = getWeekDays(mon);
    assert.equal(days.length, 7);
    assert.equal(days[0].dayShort, 'Mon');
    assert.equal(days[5].isWeekend, true);
    assert.equal(days[6].isWeekend, true);

    assert.equal(formatHourLabel(9.5), '09:30');
    assert.equal(formatTimeRange(8, 2.5), '08:00–10:30');
    assert.ok(WORKSHOP_BAYS.length >= 4);
    assert.ok(SHIFT_PRESETS.length >= 5);

    const shift: TechnicianShift = {
      id: 's1',
      technicianId: 'tech-1',
      date: '2026-11-16',
      startHour: 8,
      endHour: 16,
      shiftType: 'Full Shift',
      bay: WORKSHOP_BAYS[0],
    };
    assert.equal(getShiftDuration(shift), 8);
    assert.equal(getShiftDuration({ ...shift, shiftType: 'Off' }), 0);

    const existingSlots: ScheduledJobSlot[] = [
      { id: 'slot-1', jobCardId: 'J1', technicianId: 'tech-1', date: '2026-11-16', startHour: 9, durationHours: 2 },
    ];
    assert.equal(
      findSlotOverlaps(existingSlots, { technicianId: 'tech-1', date: '2026-11-16', startHour: 10, durationHours: 2 }).length,
      1
    );
    assert.equal(
      findSlotOverlaps(existingSlots, { technicianId: 'tech-1', date: '2026-11-16', startHour: 11, durationHours: 2 }).length,
      0
    );

    assert.equal(isSlotOutsideShift({ startHour: 7.5, durationHours: 2 }, shift), true);
    assert.equal(isSlotOutsideShift({ startHour: 9, durationHours: 2 }, shift), false);

    assert.equal(getCapacityStatus(0, 0).label, 'Day Off');
    assert.equal(getCapacityStatus(2, 0).label, 'Unshifted');
    assert.equal(getCapacityStatus(9, 8).label, 'Overbooked');
    assert.equal(getCapacityStatus(7, 8).label, 'Near Cap');
    assert.equal(getCapacityStatus(4, 8).label, 'Nominal');
  });

  it('builds initial shifts and slots without slot collisions', () => {
    const refDate = new Date(2026, 10, 18);
    const shifts = buildInitialTechShifts(SHOP_TECHNICIANS, refDate);
    assert.equal(shifts.length, 7 * SHOP_TECHNICIANS.length);

    const nextShifts = buildStandardWeekShifts(getMondayOfWeek(refDate), SHOP_TECHNICIANS, shifts);
    assert.equal(nextShifts.length, 0); // Skips already defined shifts

    const slots = buildInitialScheduledSlots(INITIAL_JOB_CARDS, SHOP_TECHNICIANS, refDate);
    assert.ok(slots.length > 0);
    slots.forEach((slot) => {
      const overlaps = findSlotOverlaps(slots, slot, slot.id);
      assert.equal(overlaps.length, 0);
    });
  });
});

describe('seed data integrity', () => {
  it('verifies seed arrays are populated with unique IDs and valid records', () => {
    assert.ok(INITIAL_JOB_CARDS.length > 0);
    assert.ok(INITIAL_INVENTORY.length >= 100);
    assert.ok(SHOP_TECHNICIANS.length >= 4);
    assert.ok(INITIAL_RECURRING_MAINTENANCE.length > 0);
    assert.ok(INITIAL_CUSTOM_FIELDS.length > 0);

    const jobIds = new Set(INITIAL_JOB_CARDS.map((j) => j.id));
    assert.equal(jobIds.size, INITIAL_JOB_CARDS.length);

    const invIds = new Set(INITIAL_INVENTORY.map((i) => i.id));
    const skus = new Set(INITIAL_INVENTORY.map((i) => i.sku));
    assert.equal(invIds.size, INITIAL_INVENTORY.length);
    assert.equal(skus.size, INITIAL_INVENTORY.length);
  });
});
