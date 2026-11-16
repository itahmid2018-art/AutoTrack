import { JobCard, RecurringMaintenance } from '../types';
import { getEffectiveJobBilling } from './billing';

export type ForecastHorizon = 3 | 6 | 12;
export type ForecastScenario = 'conservative' | 'baseline' | 'growth';

export interface RevenueForecastPoint {
  label: string;
  shortLabel: string;
  yearMonth: string;
  actualRevenue: number | null;
  forecastRevenue: number | null;
  confidenceLow: number | null;
  confidenceHigh: number | null;
  seasonalIndex: number;
  seasonalFactorLabel: string;
  expectedJobs: number;
  scheduledMaintenanceCount: number;
  isForecast: boolean;
}

export interface RevenueForecastSummary {
  series: RevenueForecastPoint[];
  horizonMonths: ForecastHorizon;
  scenario: ForecastScenario;
  historicalMonthsWithData: number;
  baselineMonthlyRunRate: number;
  avgTicketValue: number;
  projectedTotal: number;
  projectedMonthlyAvg: number;
  currentPipelineRevenue: number;
  currentPipelineJobs: number;
  monthlyTrendPct: number;
  peakMonth: {
    label: string;
    forecastRevenue: number;
    seasonalIndex: number;
  } | null;
  lowestMonth: {
    label: string;
    forecastRevenue: number;
    seasonalIndex: number;
  } | null;
  anchorYearMonth: string;
}

/**
 * Industry seasonal demand multipliers for power tool repair & commercial fleet servicing
 * (Normalized so mean across 12 calendar months = 1.00).
 * Index 0 = January ... Index 11 = December.
 */
export const TOOL_SERVICE_SEASONAL_INDICES: readonly number[] = [
  0.84, // Jan: Post-holiday slowdown
  0.88, // Feb: Early contractor startup
  1.04, // Mar: Spring construction mobilization
  1.10, // Apr: High SDS & hammer repair intake
  1.14, // May: Peak commercial build activity
  1.12, // Jun: Mid-year fleet overhaul cycle
  1.03, // Jul: Summer maintenance run-rate
  1.00, // Aug: Late-summer baseline
  1.09, // Sep: Autumn industrial push
  1.06, // Oct: Pre-winter heavy equipment prep
  0.94, // Nov: Late-autumn moderation
  0.76, // Dec: Holiday site shutdowns
];

const SCENARIO_MULTIPLIER: Record<ForecastScenario, number> = {
  conservative: 0.90,
  baseline: 1.00,
  growth: 1.12,
};

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseDateSafe(dateStr?: string): Date | null {
  if (!dateStr) return null;
  try {
    const normalized =
      dateStr.includes(' ') && !dateStr.includes('T') ? dateStr.replace(' ', 'T') : dateStr;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function formatYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(d: Date): string {
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`;
}

function formatShortLabel(d: Date, includeYear: boolean): string {
  const m = d.toLocaleString('en-US', { month: 'short' });
  return includeYear ? `${m} '${String(d.getFullYear()).slice(-2)}` : m;
}

export function getSeasonalCategoryLabel(index: number): string {
  if (index >= 1.08) return `Peak Demand (+${Math.round((index - 1) * 100)}%)`;
  if (index >= 1.02) return `Above Avg (+${Math.round((index - 1) * 100)}%)`;
  if (index <= 0.90) return `Off-Peak (${Math.round((index - 1) * 100)}%)`;
  if (index <= 0.96) return `Moderate (${Math.round((index - 1) * 100)}%)`;
  return 'Baseline (0%)';
}

export function generateMonthlyRevenueForecast(
  jobCards: JobCard[],
  schedules: RecurringMaintenance[] = [],
  horizonMonths: ForecastHorizon = 6,
  scenario: ForecastScenario = 'baseline'
): RevenueForecastSummary {
  const validJobs = jobCards.filter((j) => j.status !== 'Cancelled');

  const currentPipelineJobsList = validJobs.filter(
    (j) => j.status !== 'Completed'
  );
  const currentPipelineRevenue = roundCurrency(
    currentPipelineJobsList.reduce((sum, j) => sum + getEffectiveJobBilling(j).totalAmount, 0)
  );

  // Aggregate realized historical revenue & ticket counts per YYYY-MM
  const monthBuckets: Record<string, { revenue: number; jobs: number }> = {};

  validJobs.forEach((job) => {
    const d = parseDateSafe(job.intakeDate) || parseDateSafe(job.createdAt) || new Date();
    const ym = formatYearMonth(d);
    if (!monthBuckets[ym]) {
      monthBuckets[ym] = { revenue: 0, jobs: 0 };
    }
    monthBuckets[ym].revenue += getEffectiveJobBilling(job).totalAmount;
    monthBuckets[ym].jobs += 1;
  });

  // Aggregate due recurring maintenance per YYYY-MM to factor scheduled fleet volume
  const maintenanceByMonth: Record<string, number> = {};
  schedules.forEach((sched) => {
    if (sched.status === 'Serviced') return;
    const due = parseDateSafe(sched.nextDueDate);
    if (!due) return;
    const ym = formatYearMonth(due);
    maintenanceByMonth[ym] = (maintenanceByMonth[ym] || 0) + 1;
  });

  const sortedMonthKeys = Object.keys(monthBuckets).sort();
  const now = new Date();
  const currentSystemYm = formatYearMonth(now);

  // Anchor timeline at whichever is later between the latest logged ticket month and current month
  const anchorYm =
    sortedMonthKeys.length > 0 && sortedMonthKeys[sortedMonthKeys.length - 1] > currentSystemYm
      ? sortedMonthKeys[sortedMonthKeys.length - 1]
      : currentSystemYm;

  const [anchorYear, anchorMonthNum] = anchorYm.split('-').map(Number);
  const anchorDate = new Date(anchorYear, anchorMonthNum - 1, 1);

  // Build trailing 6-month historical window ending at anchorDate
  const historyLookback = 6;
  const historicalMonths: Array<{
    date: Date;
    yearMonth: string;
    revenue: number;
    jobs: number;
    seasonalIndex: number;
  }> = [];

  for (let offset = historyLookback - 1; offset >= 0; offset--) {
    const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - offset, 1);
    const ym = formatYearMonth(d);
    const bucket = monthBuckets[ym] || { revenue: 0, jobs: 0 };
    historicalMonths.push({
      date: d,
      yearMonth: ym,
      revenue: roundCurrency(bucket.revenue),
      jobs: bucket.jobs,
      seasonalIndex: TOOL_SERVICE_SEASONAL_INDICES[d.getMonth()],
    });
  }

  const nonZeroHistory = historicalMonths.filter((m) => m.revenue > 0);
  const historicalMonthsWithData = nonZeroHistory.length;

  const totalHistoricalRevenue = validJobs.reduce(
    (sum, j) => sum + getEffectiveJobBilling(j).totalAmount,
    0
  );
  const avgTicketValue =
    validJobs.length > 0 ? roundCurrency(totalHistoricalRevenue / validJobs.length) : 0;

  // Compute deseasonalized weighted baseline monthly run-rate
  let baselineMonthlyRunRate = 0;
  if (nonZeroHistory.length > 0) {
    let weightSum = 0;
    let weightedDeseasonalizedSum = 0;
    nonZeroHistory.forEach((m, idx) => {
      const recencyWeight = idx + 1; // Weight more recent active months higher
      const deseasonalized = m.revenue / Math.max(0.5, m.seasonalIndex);
      weightedDeseasonalizedSum += deseasonalized * recencyWeight;
      weightSum += recencyWeight;
    });
    baselineMonthlyRunRate = weightedDeseasonalizedSum / Math.max(1, weightSum);
  }

  // Compute dampened month-over-month trend slope when 2+ active months exist
  let rawTrendRate = 0.018; // Conservative 1.8%/mo organic growth prior when only single-month seed exists
  if (nonZeroHistory.length >= 2) {
    const deseasonalizedSeries = nonZeroHistory.map(
      (m) => m.revenue / Math.max(0.5, m.seasonalIndex)
    );
    const n = deseasonalizedSeries.length;
    const meanX = (n - 1) / 2;
    const meanY = deseasonalizedSeries.reduce((s, v) => s + v, 0) / n;

    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - meanX) * (deseasonalizedSeries[i] - meanY);
      den += (i - meanX) * (i - meanX);
    }
    const slopePerMonth = den > 0 ? num / den : 0;
    const relativeSlope = meanY > 0 ? slopePerMonth / meanY : 0;
    // Clamp trend between -8% and +10% per month to avoid overfitting sparse months
    rawTrendRate = Math.max(-0.08, Math.min(0.10, relativeSlope));
  }

  const scenarioFactor = SCENARIO_MULTIPLIER[scenario];
  const scenarioTrendAdjustment =
    scenario === 'growth' ? 0.015 : scenario === 'conservative' ? -0.01 : 0;
  const effectiveMonthlyTrend = rawTrendRate + scenarioTrendAdjustment;

  // Estimated scheduled recurring maintenance ticket value (~75% of avg ticket or $110 fallback)
  const maintenanceUnitEstimate = avgTicketValue > 0 ? Math.max(85, avgTicketValue * 0.75) : 110;

  const series: RevenueForecastPoint[] = [];

  // Populate trailing historical points
  historicalMonths.forEach((m, index) => {
    const isAnchor = index === historicalMonths.length - 1;
    const scheduledCount = maintenanceByMonth[m.yearMonth] || 0;
    series.push({
      label: formatMonthLabel(m.date),
      shortLabel: formatShortLabel(m.date, m.date.getMonth() === 0 || isAnchor),
      yearMonth: m.yearMonth,
      actualRevenue: m.revenue,
      // Connect forecast line continuously from the anchor month's actual point
      forecastRevenue: isAnchor ? m.revenue : null,
      confidenceLow: isAnchor ? m.revenue : null,
      confidenceHigh: isAnchor ? m.revenue : null,
      seasonalIndex: m.seasonalIndex,
      seasonalFactorLabel: getSeasonalCategoryLabel(m.seasonalIndex),
      expectedJobs: m.jobs,
      scheduledMaintenanceCount: scheduledCount,
      isForecast: false,
    });
  });

  // Populate future forecast points
  const forecastPointsOnly: RevenueForecastPoint[] = [];

  for (let step = 1; step <= horizonMonths; step++) {
    const futureDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + step, 1);
    const ym = formatYearMonth(futureDate);
    const seasonalIdx = TOOL_SERVICE_SEASONAL_INDICES[futureDate.getMonth()];
    const scheduledCount = maintenanceByMonth[ym] || 0;

    // Trend decay dampens long-range extrapolation slightly over 12 months
    const compoundedTrend = Math.pow(1 + effectiveMonthlyTrend, Math.min(step, 8));
    const seasonalComponent = baselineMonthlyRunRate * compoundedTrend * seasonalIdx * scenarioFactor;

    // Incorporate upcoming contracted/scheduled recurring maintenance directly into pipeline forecast
    const maintenanceContribution = scheduledCount * maintenanceUnitEstimate * 0.65;
    const forecastValue =
      baselineMonthlyRunRate > 0 ? roundCurrency(seasonalComponent + maintenanceContribution) : 0;

    // Uncertainty band widens smoothly with horizon distance (+/- 8% at month 1 up to +/- 22% at month 12)
    const uncertaintyPct = Math.min(0.24, 0.08 + step * 0.013);
    const confidenceLow = roundCurrency(Math.max(0, forecastValue * (1 - uncertaintyPct)));
    const confidenceHigh = roundCurrency(forecastValue * (1 + uncertaintyPct));

    const estimatedTickets =
      avgTicketValue > 0
        ? Math.max(scheduledCount, Math.round(forecastValue / avgTicketValue))
        : scheduledCount;

    const point: RevenueForecastPoint = {
      label: formatMonthLabel(futureDate),
      shortLabel: formatShortLabel(futureDate, futureDate.getMonth() === 0 || step === horizonMonths),
      yearMonth: ym,
      actualRevenue: null,
      forecastRevenue: forecastValue,
      confidenceLow,
      confidenceHigh,
      seasonalIndex: seasonalIdx,
      seasonalFactorLabel: getSeasonalCategoryLabel(seasonalIdx),
      expectedJobs: estimatedTickets,
      scheduledMaintenanceCount: scheduledCount,
      isForecast: true,
    };

    series.push(point);
    forecastPointsOnly.push(point);
  }

  const projectedTotal = roundCurrency(
    forecastPointsOnly.reduce((sum, p) => sum + (p.forecastRevenue || 0), 0)
  );
  const projectedMonthlyAvg =
    forecastPointsOnly.length > 0 ? roundCurrency(projectedTotal / forecastPointsOnly.length) : 0;

  let peakMonth: RevenueForecastSummary['peakMonth'] = null;
  let lowestMonth: RevenueForecastSummary['lowestMonth'] = null;

  forecastPointsOnly.forEach((p) => {
    const val = p.forecastRevenue ?? 0;
    if (!peakMonth || val > peakMonth.forecastRevenue) {
      peakMonth = {
        label: p.label,
        forecastRevenue: val,
        seasonalIndex: p.seasonalIndex,
      };
    }
    if (!lowestMonth || val < lowestMonth.forecastRevenue) {
      lowestMonth = {
        label: p.label,
        forecastRevenue: val,
        seasonalIndex: p.seasonalIndex,
      };
    }
  });

  return {
    series,
    horizonMonths,
    scenario,
    historicalMonthsWithData,
    baselineMonthlyRunRate: roundCurrency(baselineMonthlyRunRate),
    avgTicketValue,
    projectedTotal,
    projectedMonthlyAvg,
    currentPipelineRevenue,
    currentPipelineJobs: currentPipelineJobsList.length,
    monthlyTrendPct: Math.round(effectiveMonthlyTrend * 1000) / 10,
    peakMonth,
    lowestMonth,
    anchorYearMonth: formatMonthLabel(anchorDate),
  };
}
