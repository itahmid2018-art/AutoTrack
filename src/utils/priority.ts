import { JobCard, JobPriority } from '../types';

export const JOB_PRIORITY_LEVELS: readonly JobPriority[] = ['Low', 'Medium', 'High'];

export function normalizeJobPriority(raw: unknown): JobPriority {
  if (typeof raw !== 'string') return 'Low';
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'high' || normalized === 'emergency') return 'High';
  if (normalized === 'medium' || normalized === 'urgent') return 'Medium';
  return 'Low';
}

export function getPriorityWeight(priority: JobPriority): number {
  switch (normalizeJobPriority(priority)) {
    case 'High':
      return 3;
    case 'Medium':
      return 2;
    default:
      return 1;
  }
}

export function getPriorityBadgeClasses(priority: JobPriority): string {
  switch (normalizeJobPriority(priority)) {
    case 'High':
      return 'bg-rose-50 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-700 font-extrabold';
    case 'Medium':
      return 'bg-amber-50 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-bold';
    default:
      return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 font-semibold';
  }
}

export function applyPriorityChangeToJobs(
  jobs: JobCard[],
  jobId: string,
  nextPriority: JobPriority,
  nowIso: string = new Date().toISOString()
): { updatedJobs: JobCard[]; changedJob: JobCard | null } {
  const cleanPriority = normalizeJobPriority(nextPriority);
  let changedJob: JobCard | null = null;

  const updatedJobs = jobs.map((job) => {
    if (job.id !== jobId) return job;
    const prevPriority = normalizeJobPriority(job.priority);
    if (prevPriority === cleanPriority && job.priority === cleanPriority) {
      return job;
    }

    const nextAudit = [
      ...(job.auditLogs || []),
      {
        id: `aud-prio-${Date.now()}`,
        timestamp: nowIso.slice(0, 16).replace('T', ' '),
        userName: job.technician || 'Workshop Operator',
        userRole: job.technician ? 'Technician' : 'Technician / Counter',
        action: 'PRIORITY_CHANGED',
        previousState: prevPriority,
        newState: cleanPriority,
      },
    ];

    changedJob = {
      ...job,
      priority: cleanPriority,
      auditLogs: nextAudit,
      updatedAt: nowIso,
    };
    return changedJob;
  });

  return { updatedJobs, changedJob };
}

export function filterJobsByPriority(
  jobs: JobCard[],
  priorityFilter: 'All' | JobPriority
): JobCard[] {
  if (priorityFilter === 'All') return jobs;
  const target = normalizeJobPriority(priorityFilter);
  return jobs.filter((job) => normalizeJobPriority(job.priority) === target);
}

export function countJobsByPriority(jobs: JobCard[]): Record<'All' | JobPriority, number> {
  const counts: Record<'All' | JobPriority, number> = {
    All: jobs.length,
    Low: 0,
    Medium: 0,
    High: 0,
  };
  for (const job of jobs) {
    const level = normalizeJobPriority(job.priority);
    counts[level] += 1;
  }
  return counts;
}
