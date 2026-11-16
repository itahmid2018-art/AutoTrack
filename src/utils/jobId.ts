import { JobCard, RecurringMaintenance } from '../types';

function extractTrailingNumber(id: string): number | null {
  const match = String(id || '').trim().match(/(\d+)$/);
  if (!match) return null;
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Computes the next unique Job Card ID by taking 1 + the maximum numeric
 * suffix across existing job cards so deleted tickets never cause ID collisions.
 */
export function nextJobCardId(
  existingJobs: Pick<JobCard, 'id'>[],
  prefix: string = 'BOSCH-2026-',
  defaultFloor?: number
): string {
  const cleanPrefix = prefix || 'BOSCH-2026-';
  const baseFloor =
    typeof defaultFloor === 'number'
      ? defaultFloor
      : cleanPrefix === 'BOSCH-2026-'
      ? 40
      : 0;

  const existingSet = new Set(existingJobs.map((j) => j.id));
  let maxSeq = baseFloor;

  for (const job of existingJobs) {
    if (!job.id.startsWith(cleanPrefix)) continue;
    const num = extractTrailingNumber(job.id);
    if (num !== null && num > maxSeq) {
      maxSeq = num;
    }
  }

  let nextNum = maxSeq + 1;
  let candidate = `${cleanPrefix}${String(nextNum).padStart(4, '0')}`;
  while (existingSet.has(candidate)) {
    nextNum += 1;
    candidate = `${cleanPrefix}${String(nextNum).padStart(4, '0')}`;
  }
  return candidate;
}

/**
 * Returns the starting numeric cursor (max existing + 1) for recurring maintenance IDs.
 */
export function nextScheduleSequenceStart(
  existingIds: Iterable<string>,
  prefix: string = 'MAINT-2026-'
): number {
  let maxSeq = 0;
  for (const id of existingIds) {
    if (prefix && !String(id).startsWith(prefix)) continue;
    const num = extractTrailingNumber(String(id));
    if (num !== null && num > maxSeq) {
      maxSeq = num;
    }
  }
  return maxSeq + 1;
}

/**
 * Computes the next unique Recurring Maintenance Schedule ID without reusing deleted IDs.
 */
export function nextScheduleId(
  existingSchedules: Pick<RecurringMaintenance, 'id'>[],
  prefix: string = 'MAINT-2026-'
): string {
  const existingSet = new Set(existingSchedules.map((s) => s.id));
  let nextNum = nextScheduleSequenceStart(existingSet, prefix);
  let candidate = `${prefix}${String(nextNum).padStart(3, '0')}`;
  while (existingSet.has(candidate)) {
    nextNum += 1;
    candidate = `${prefix}${String(nextNum).padStart(3, '0')}`;
  }
  return candidate;
}
