import { AuditLogEntry, JobCard } from '../types';
import { SHOP_TECHNICIANS, Technician } from '../data/mockTechnicians';

export interface TechnicianPerformanceSummary {
  tech: Technician;
  totalJobsCompleted: number;
  auditVerifiedCompletions: number;
  avgTurnaroundHours: number | null;
  avgTurnaroundDays: number | null;
  fastestTurnaroundHours: number | null;
  assignedActive: number;
  totalAssignedJobs: number;
  totalLaborHours: number;
  totalRevenueGenerated: number;
  auditEventsLogged: number;
  lastAuditTimestamp: string | null;
}

const GENERIC_OPERATOR_NAMES = new Set([
  'front desk reception',
  'front desk receptionist',
  'counter operator',
  'workshop operator',
  'bench technician',
  'counter / technician',
  'system',
]);

function parseTimestampMs(raw?: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(' ') && !trimmed.includes('T')
    ? trimmed.replace(' ', 'T')
    : trimmed;
  const ms = new Date(normalized).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function normalizeNameToken(name?: string): string {
  if (!name) return '';
  return name.split('(')[0].trim().toLowerCase();
}

export function matchTechnicianId(
  candidateName: string | undefined,
  technicians: Technician[]
): string | null {
  const cleanCandidate = normalizeNameToken(candidateName);
  if (!cleanCandidate || GENERIC_OPERATOR_NAMES.has(cleanCandidate)) return null;

  for (const tech of technicians) {
    const cleanTech = normalizeNameToken(tech.name);
    if (!cleanTech) continue;
    if (cleanCandidate === cleanTech || cleanTech.includes(cleanCandidate) || cleanCandidate.includes(cleanTech)) {
      return tech.id;
    }
    const techFirstLast = cleanTech.split(/\s+/).slice(0, 2).join(' ');
    if (techFirstLast && cleanCandidate.includes(techFirstLast)) {
      return tech.id;
    }
  }
  return null;
}

function isCompletionAuditEntry(entry: AuditLogEntry): boolean {
  const action = (entry.action || '').toUpperCase();
  const next = (entry.newState || '').toLowerCase();
  if (action === 'JOB_COMPLETED' || action === 'REPAIR_COMPLETED') return true;
  if (action === 'STAGE_CHANGED' || action === 'STATUS_CHANGED' || action === 'JOB_STAGE_UPDATED') {
    return next.includes('completed') || next.includes('ready for pickup');
  }
  return false;
}

function getEffectiveTotal(job: JobCard): number {
  const partsTotal = (job.parts || []).reduce((sum, p) => sum + (p.total || 0), 0);
  const laborTotal = (job.laborHours || 0) * (job.laborRate || 0);
  const opExTotal = (job.operationalExpenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
  const taxable = Math.max(0, partsTotal + laborTotal + opExTotal - (job.discount || 0));
  const computed = Math.round((taxable + taxable * ((job.taxRate || 0) / 100)) * 100) / 100;
  return computed > 0 || (job.operationalExpenses?.length ?? 0) > 0 ? computed : (job.totalAmount || 0);
}

export function calculateTechnicianPerformance(
  jobCards: JobCard[],
  technicians: Technician[] = SHOP_TECHNICIANS
): TechnicianPerformanceSummary[] {
  const accumulators = new Map<
    string,
    {
      tech: Technician;
      completedJobIds: Set<string>;
      auditVerifiedJobIds: Set<string>;
      turnaroundHoursList: number[];
      assignedActive: number;
      totalAssignedJobs: number;
      totalLaborHours: number;
      totalRevenueGenerated: number;
      auditEventsLogged: number;
      lastAuditMs: number | null;
      lastAuditTimestamp: string | null;
    }
  >();

  technicians.forEach((tech) => {
    accumulators.set(tech.id, {
      tech,
      completedJobIds: new Set(),
      auditVerifiedJobIds: new Set(),
      turnaroundHoursList: [],
      assignedActive: 0,
      totalAssignedJobs: 0,
      totalLaborHours: 0,
      totalRevenueGenerated: 0,
      auditEventsLogged: 0,
      lastAuditMs: null,
      lastAuditTimestamp: null,
    });
  });

  // 1. Attribute audit log actions & timestamps to technicians
  jobCards.forEach((job) => {
    const jobTechId = matchTechnicianId(job.technician, technicians);
    const logs = [...(job.auditLogs || [])].sort((a, b) => {
      const aMs = parseTimestampMs(a.timestamp) ?? 0;
      const bMs = parseTimestampMs(b.timestamp) ?? 0;
      return aMs - bMs;
    });

    // Count audit events per technician
    logs.forEach((entry) => {
      const entryTechId = matchTechnicianId(entry.userName, technicians) || (
        entry.userRole?.toLowerCase().includes('tech') ? jobTechId : null
      );
      if (!entryTechId) return;
      const acc = accumulators.get(entryTechId);
      if (!acc) return;

      acc.auditEventsLogged += 1;
      const entryMs = parseTimestampMs(entry.timestamp);
      if (entryMs !== null && (acc.lastAuditMs === null || entryMs > acc.lastAuditMs)) {
        acc.lastAuditMs = entryMs;
        acc.lastAuditTimestamp = entry.timestamp;
      }
    });

    // Determine start timestamp from earliest audit log entry, fallback to intakeDate / createdAt
    const earliestAuditMs = logs
      .map((l) => parseTimestampMs(l.timestamp))
      .find((ms): ms is number => ms !== null) ?? null;

    const startMs =
      earliestAuditMs ??
      parseTimestampMs(job.intakeDate) ??
      parseTimestampMs(job.createdAt);

    // Find completion audit log entry
    const completionEntries = logs.filter(isCompletionAuditEntry);
    const latestCompletionEntry =
      completionEntries.length > 0 ? completionEntries[completionEntries.length - 1] : null;

    const isJobCompletedStatus =
      job.status === 'Completed' || job.status === 'Ready for Pickup';

    if (latestCompletionEntry || isJobCompletedStatus) {
      const completingTechId =
        (latestCompletionEntry ? matchTechnicianId(latestCompletionEntry.userName, technicians) : null) ||
        jobTechId;

      if (completingTechId && accumulators.has(completingTechId)) {
        const acc = accumulators.get(completingTechId)!;
        acc.completedJobIds.add(job.id);
        if (latestCompletionEntry) {
          acc.auditVerifiedJobIds.add(job.id);
        }

        const completionMs =
          (latestCompletionEntry ? parseTimestampMs(latestCompletionEntry.timestamp) : null) ??
          parseTimestampMs(job.updatedAt) ??
          (logs.length > 0 ? parseTimestampMs(logs[logs.length - 1].timestamp) : null);

        if (startMs !== null && completionMs !== null && completionMs >= startMs) {
          const durationHours = Math.max(0.5, Math.round(((completionMs - startMs) / (1000 * 60 * 60)) * 10) / 10);
          acc.turnaroundHoursList.push(durationHours);
        }
      }
    }

    // Workload & revenue attribution to assigned technician
    if (jobTechId && accumulators.has(jobTechId)) {
      const acc = accumulators.get(jobTechId)!;
      acc.totalAssignedJobs += 1;
      if (job.status !== 'Completed' && job.status !== 'Cancelled') {
        acc.assignedActive += 1;
      }
      acc.totalLaborHours += job.laborHours || 0;
      acc.totalRevenueGenerated += getEffectiveTotal(job);
    }
  });

  return Array.from(accumulators.values()).map((acc) => {
    const sampleCount = acc.turnaroundHoursList.length;
    const avgTurnaroundHours =
      sampleCount > 0
        ? Math.round((acc.turnaroundHoursList.reduce((s, h) => s + h, 0) / sampleCount) * 10) / 10
        : null;
    const avgTurnaroundDays =
      avgTurnaroundHours !== null
        ? Math.round((avgTurnaroundHours / 24) * 10) / 10
        : null;
    const fastestTurnaroundHours =
      sampleCount > 0 ? Math.min(...acc.turnaroundHoursList) : null;

    return {
      tech: acc.tech,
      totalJobsCompleted: acc.completedJobIds.size,
      auditVerifiedCompletions: acc.auditVerifiedJobIds.size,
      avgTurnaroundHours,
      avgTurnaroundDays,
      fastestTurnaroundHours,
      assignedActive: acc.assignedActive,
      totalAssignedJobs: acc.totalAssignedJobs,
      totalLaborHours: Math.round(acc.totalLaborHours * 10) / 10,
      totalRevenueGenerated: Math.round(acc.totalRevenueGenerated * 100) / 100,
      auditEventsLogged: acc.auditEventsLogged,
      lastAuditTimestamp: acc.lastAuditTimestamp,
    };
  });
}
