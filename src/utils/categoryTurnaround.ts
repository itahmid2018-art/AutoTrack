import { JobCard, ToolCategory } from '../types';

export const ALL_TOOL_CATEGORIES: ToolCategory[] = [
  'Rotary Hammer / SDS',
  'Angle Grinder',
  'Cordless Drill / Driver',
  'Impact Wrench / Driver',
  'Circular / Miter Saw',
  'Demolition Breaker',
  'Heat Gun / Blower',
  'High Pressure Washer',
  'Laser & Measuring',
  'Lawn & Garden / Outdoor',
];

export interface CategoryTurnaroundMetric {
  category: ToolCategory;
  completedCount: number;
  multiStageCount: number;
  avgHours: number | null;
  avgDays: number | null;
  minHours: number | null;
  maxHours: number | null;
}

export interface CategoryTurnaroundSummary {
  totalCompletedJobs: number;
  analyzedJobsCount: number;
  overallAvgHours: number | null;
  overallAvgDays: number | null;
  fastestCategory: CategoryTurnaroundMetric | null;
  slowestCategory: CategoryTurnaroundMetric | null;
  categories: CategoryTurnaroundMetric[];
  allCategories: CategoryTurnaroundMetric[];
}

function parseTimestampMs(raw?: string): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized =
    trimmed.includes(' ') && !trimmed.includes('T')
      ? trimmed.replace(' ', 'T')
      : trimmed;
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Computes turnaround duration (in hours) for a completed job using its `stageHistory`.
 * - Prefers elapsed time between the earliest valid `stageHistory` entry (typically `Intake`)
 *   and the latest `Completed` entry (or final entry) in `stageHistory`.
 * - When a seeded completed job only has a single `Completed` entry in `stageHistory`,
 *   anchors the start time from `intakeDate` / `createdAt` to that `stageHistory` completion timestamp.
 */
export function extractCompletedJobTurnaroundHours(
  job: Pick<JobCard, 'status' | 'stageHistory' | 'intakeDate' | 'createdAt' | 'updatedAt'>
): { hours: number | null; usedMultiStageHistory: boolean } {
  if (job.status !== 'Completed') {
    return { hours: null, usedMultiStageHistory: false };
  }

  const parsedStages = (Array.isArray(job.stageHistory) ? job.stageHistory : [])
    .map((entry) => ({
      status: entry.status,
      ms: parseTimestampMs(entry.enteredAt),
    }))
    .filter((entry): entry is { status: JobCard['status']; ms: number } => entry.ms !== null)
    .sort((a, b) => a.ms - b.ms);

  if (parsedStages.length >= 2) {
    const startMs = parsedStages[0].ms;
    const completedStages = parsedStages.filter((entry) => entry.status === 'Completed');
    const endMs =
      completedStages.length > 0
        ? completedStages[completedStages.length - 1].ms
        : parsedStages[parsedStages.length - 1].ms;

    if (endMs >= startMs) {
      return {
        hours: (endMs - startMs) / (1000 * 60 * 60),
        usedMultiStageHistory: true,
      };
    }
  }

  // Fallback for single-entry stageHistory records
  const endStage = parsedStages[parsedStages.length - 1];
  const startMs =
    parseTimestampMs(job.intakeDate) ?? parseTimestampMs(job.createdAt);
  const endMs = endStage?.ms ?? parseTimestampMs(job.updatedAt);

  if (startMs !== null && endMs !== null && endMs >= startMs) {
    return {
      hours: (endMs - startMs) / (1000 * 60 * 60),
      usedMultiStageHistory: false,
    };
  }

  return { hours: null, usedMultiStageHistory: false };
}

/**
 * Aggregates average, minimum, and maximum turnaround time (hours and days)
 * per tool category across completed jobs by analyzing `stageHistory`.
 */
export function calculateCategoryTurnaroundFromStageHistory(
  jobCards: JobCard[]
): CategoryTurnaroundSummary {
  const completedJobs = jobCards.filter((job) => job.status === 'Completed');

  const bucketMap = new Map<
    ToolCategory,
    { durations: number[]; multiStageCount: number; completedCount: number }
  >();

  for (const cat of ALL_TOOL_CATEGORIES) {
    bucketMap.set(cat, { durations: [], multiStageCount: 0, completedCount: 0 });
  }

  let totalDurationHours = 0;
  let analyzedJobsCount = 0;

  for (const job of completedJobs) {
    const category: ToolCategory = job.tool?.category || 'Rotary Hammer / SDS';
    if (!bucketMap.has(category)) {
      bucketMap.set(category, { durations: [], multiStageCount: 0, completedCount: 0 });
    }
    const bucket = bucketMap.get(category)!;
    bucket.completedCount += 1;

    const { hours, usedMultiStageHistory } = extractCompletedJobTurnaroundHours(job);
    if (hours !== null && Number.isFinite(hours) && hours >= 0) {
      bucket.durations.push(hours);
      if (usedMultiStageHistory) {
        bucket.multiStageCount += 1;
      }
      totalDurationHours += hours;
      analyzedJobsCount += 1;
    }
  }

  const allCategories: CategoryTurnaroundMetric[] = Array.from(bucketMap.entries()).map(
    ([category, data]) => {
      if (data.durations.length === 0) {
        return {
          category,
          completedCount: data.completedCount,
          multiStageCount: data.multiStageCount,
          avgHours: null,
          avgDays: null,
          minHours: null,
          maxHours: null,
        };
      }

      const sum = data.durations.reduce((acc, h) => acc + h, 0);
      const avgHours = roundToOneDecimal(sum / data.durations.length);
      const avgDays = roundToOneDecimal(avgHours / 24);
      const minHours = roundToOneDecimal(Math.min(...data.durations));
      const maxHours = roundToOneDecimal(Math.max(...data.durations));

      return {
        category,
        completedCount: data.completedCount,
        multiStageCount: data.multiStageCount,
        avgHours,
        avgDays,
        minHours,
        maxHours,
      };
    }
  );

  const populatedCategories = allCategories
    .filter((entry) => entry.completedCount > 0)
    .sort((a, b) => {
      const aHours = a.avgHours ?? -1;
      const bHours = b.avgHours ?? -1;
      if (bHours !== aHours) return bHours - aHours;
      return b.completedCount - a.completedCount;
    });

  const timedCategories = populatedCategories.filter(
    (entry): entry is CategoryTurnaroundMetric & { avgHours: number } =>
      entry.avgHours !== null
  );

  const fastestCategory =
    timedCategories.length > 0
      ? [...timedCategories].sort((a, b) => a.avgHours - b.avgHours)[0]
      : null;
  const slowestCategory =
    timedCategories.length > 0
      ? [...timedCategories].sort((a, b) => b.avgHours - a.avgHours)[0]
      : null;

  const overallAvgHours =
    analyzedJobsCount > 0
      ? roundToOneDecimal(totalDurationHours / analyzedJobsCount)
      : null;
  const overallAvgDays =
    overallAvgHours !== null ? roundToOneDecimal(overallAvgHours / 24) : null;

  return {
    totalCompletedJobs: completedJobs.length,
    analyzedJobsCount,
    overallAvgHours,
    overallAvgDays,
    fastestCategory,
    slowestCategory,
    categories: populatedCategories,
    allCategories,
  };
}
