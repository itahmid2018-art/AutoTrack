import {
  BusinessSettings,
  InventoryItem,
  JobCard,
  JobStatus,
  MessageLog,
  RecurringMaintenance,
} from '../types';
import { InventoryNotification } from './inventoryNotifications';
import { sentStatusFor } from './messagingStatus';
import { getPriorityWeight, normalizeJobPriority } from './priority';
import { applyStockLifecycleTransition, InventoryDelta } from './stockDeduction';

export const SYNC_FAILURES_STORAGE_KEY = 'autotrack_sync_failures_v1';
export const DISMISSED_TASK_NOTIFS_STORAGE_KEY = 'autotrack_dismissed_task_notifs_v1';
export const READ_NOTIFS_STORAGE_KEY = 'autotrack_read_notifications_v1';

export interface SyncFailureRecord {
  reason: string;
  failedAt: string;
  wasOffline: boolean;
}

export interface PendingSyncJobItem {
  job: JobCard;
  reason: string;
  failedAt: string;
  wasOffline: boolean;
  inFlight: boolean;
}

export type TaskNotificationKind =
  | 'sla-overdue'
  | 'promised-overdue'
  | 'low-rating'
  | 'awaiting-approval'
  | 'ready-for-pickup'
  | 'high-priority';

export type NotificationSeverity = 'critical' | 'warning' | 'info';

export interface TaskNotificationItem {
  id: string;
  job: JobCard;
  kind: TaskNotificationKind;
  severity: NotificationSeverity;
  title: string;
  summary: string;
  reasons: string[];
  stageDays: number;
  triggeredAt: string;
  dismissed: boolean;
}

export type NotificationCategoryFilter =
  | 'all'
  | 'sync'
  | 'tasks'
  | 'inventory'
  | 'maintenance';

export type NotificationSortOrder = 'priority' | 'oldest' | 'newest';

const FIVE_DAY_MS = 5 * 24 * 60 * 60 * 1000;
const CRITICAL_STAGE_STATUSES: ReadonlySet<JobStatus> = new Set([
  'Awaiting Parts',
  'In Repair',
  'In Service',
]);

function parseTimestampMs(raw?: string): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const normalized = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

export function loadSyncFailureMap(): Record<string, SyncFailureRecord> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SYNC_FAILURES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, SyncFailureRecord>;
  } catch {
    return {};
  }
}

export function saveSyncFailureMap(map: Record<string, SyncFailureRecord>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const entries = Object.entries(map).filter(([id]) => id.trim().length > 0);
    if (entries.length === 0) {
      localStorage.removeItem(SYNC_FAILURES_STORAGE_KEY);
    } else {
      localStorage.setItem(SYNC_FAILURES_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
    }
  } catch (err) {
    console.warn('Unable to persist sync failure map:', err);
  }
}

export function loadDismissedTaskNotifications(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DISMISSED_TASK_NOTIFS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
    );
  } catch {
    return [];
  }
}

export function saveDismissedTaskNotifications(ids: string[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const unique = Array.from(new Set(ids.filter((id) => id.trim().length > 0)));
    if (unique.length === 0) {
      localStorage.removeItem(DISMISSED_TASK_NOTIFS_STORAGE_KEY);
    } else {
      localStorage.setItem(DISMISSED_TASK_NOTIFS_STORAGE_KEY, JSON.stringify(unique));
    }
  } catch (err) {
    console.warn('Unable to persist dismissed task notifications:', err);
  }
}

export function loadReadNotificationIds(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(READ_NOTIFS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
    );
  } catch {
    return [];
  }
}

export function saveReadNotificationIds(ids: string[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const unique = Array.from(new Set(ids.filter((id) => id.trim().length > 0)));
    if (unique.length === 0) {
      localStorage.removeItem(READ_NOTIFS_STORAGE_KEY);
    } else {
      localStorage.setItem(READ_NOTIFS_STORAGE_KEY, JSON.stringify(unique));
    }
  } catch (err) {
    console.warn('Unable to persist read notification IDs:', err);
  }
}

export interface PendingOfflineSyncInput {
  jobCards: JobCard[];
  pendingCloudSyncIds: string[] | Set<string>;
  inFlightCloudSyncIds?: string[] | Set<string>;
  firestorePendingWritesById?: Record<string, boolean>;
  syncFailureMap?: Record<string, SyncFailureRecord>;
  isOnline: boolean;
  isAuthenticated: boolean;
}

function toSet(input?: string[] | Set<string>): Set<string> {
  if (!input) return new Set();
  return input instanceof Set ? input : new Set(input);
}

/**
 * Returns active job cards that have unsynced offline edits, failed cloud writes,
 * or pending Firestore commits so the Jobs tab badge and Notifications page stay in sync.
 */
export function getPendingOfflineSyncJobs(
  input: PendingOfflineSyncInput
): PendingSyncJobItem[] {
  const pendingSet = toSet(input.pendingCloudSyncIds);
  const inFlightSet = toSet(input.inFlightCloudSyncIds);
  const failureMap = input.syncFailureMap || {};
  const firestorePending = input.firestorePendingWritesById || {};

  const items: PendingSyncJobItem[] = [];

  for (const job of input.jobCards) {
    const hasFailureRecord = Boolean(failureMap[job.id]);
    const hasFirestorePendingWrite = Boolean(firestorePending[job.id]);
    const isInPendingQueue = pendingSet.has(job.id);

    const needsSyncAttention =
      hasFailureRecord ||
      hasFirestorePendingWrite ||
      (isInPendingQueue && (!input.isOnline || input.isAuthenticated));

    if (!needsSyncAttention) continue;

    const record = failureMap[job.id];
    let reason = record?.reason || '';
    if (!reason) {
      if (!input.isOnline) {
        reason = 'Device is offline — saved locally until connectivity returns.';
      } else if (!input.isAuthenticated) {
        reason = 'Saved offline while signed out — sign in to push changes to the cloud.';
      } else if (inFlightSet.has(job.id)) {
        reason = 'Uploading local updates to Cloud Firestore.';
      } else {
        reason = 'Pending cloud synchronization — click Retry Sync to verify.';
      }
    }

    items.push({
      job,
      reason,
      failedAt: record?.failedAt || job.updatedAt || job.createdAt,
      wasOffline: record?.wasOffline ?? !input.isOnline,
      inFlight: inFlightSet.has(job.id),
    });
  }

  return items;
}

export function buildTaskNotificationItems(
  jobCards: JobCard[],
  nowMs: number = Date.now(),
  dismissedKeys: string[] | Set<string> = []
): TaskNotificationItem[] {
  const dismissedSet = toSet(dismissedKeys);
  const items: TaskNotificationItem[] = [];

  for (const job of jobCards) {
    if (job.status === 'Cancelled') continue;

    const reasons: string[] = [];
    let primaryKind: TaskNotificationKind | null = null;
    let severity: NotificationSeverity = 'info';

    const stageMs =
      parseTimestampMs(job.stageEnteredAt) ??
      parseTimestampMs(job.updatedAt) ??
      parseTimestampMs(job.intakeDate) ??
      parseTimestampMs(job.createdAt) ??
      nowMs;
    const stageAgeMs = Math.max(0, nowMs - stageMs);
    const stageDays = Math.floor(stageAgeMs / (24 * 60 * 60 * 1000));

    if (
      job.status !== 'Completed' &&
      CRITICAL_STAGE_STATUSES.has(job.status) &&
      stageAgeMs > FIVE_DAY_MS
    ) {
      primaryKind = 'sla-overdue';
      severity = 'critical';
      reasons.push(`In ${job.status} for ${stageDays} days (over 5-day workshop limit).`);
    }

    const promisedMs = parseTimestampMs(job.promisedCompletion);
    if (job.status !== 'Completed' && promisedMs !== null && nowMs > promisedMs) {
      if (!primaryKind) {
        primaryKind = 'promised-overdue';
        severity = 'critical';
      }
      const overdueDays = Math.max(1, Math.floor((nowMs - promisedMs) / (24 * 60 * 60 * 1000)));
      reasons.push(`Past promised completion date by ${overdueDays} day${overdueDays === 1 ? '' : 's'}.`);
    }

    if (job.customerFeedback && job.customerFeedback.rating <= 3) {
      if (!primaryKind) {
        primaryKind = 'low-rating';
        severity = 'critical';
      }
      reasons.push(`Client feedback scored ${job.customerFeedback.rating}/5 stars — service recovery needed.`);
    }

    if (job.status === 'Awaiting Approval') {
      if (!primaryKind) {
        primaryKind = 'awaiting-approval';
        severity = 'warning';
      }
      reasons.push('Estimate awaiting client approval before parts/labor proceed.');
    }

    if (job.status === 'Ready for Pickup') {
      if (!primaryKind) {
        primaryKind = 'ready-for-pickup';
        severity = 'warning';
      }
      reasons.push('Tool tested and ready for client pickup.');
    }

    const priority = normalizeJobPriority(job.priority);
    if (job.status !== 'Completed' && priority === 'High') {
      if (!primaryKind) {
        primaryKind = 'high-priority';
        severity = 'warning';
      }
      reasons.push('Marked High priority in workshop queue.');
    }

    if (!primaryKind || reasons.length === 0) continue;

    const notifKey = `task-${job.id}-${primaryKind}`;
    const titleMap: Record<TaskNotificationKind, string> = {
      'sla-overdue': `${job.id} stalled in ${job.status} (${stageDays}d)`,
      'promised-overdue': `${job.id} past promised completion`,
      'low-rating': `${job.id} low client rating (${job.customerFeedback?.rating}/5)`,
      'awaiting-approval': `${job.id} awaiting client approval`,
      'ready-for-pickup': `${job.id} ready for pickup`,
      'high-priority': `${job.id} high-priority repair active`,
    };

    items.push({
      id: notifKey,
      job,
      kind: primaryKind,
      severity,
      title: titleMap[primaryKind],
      summary: `${job.customerName} · ${job.tool.brand} ${job.tool.modelNumber}`,
      reasons,
      stageDays,
      triggeredAt: job.updatedAt || job.stageEnteredAt || job.createdAt,
      dismissed: dismissedSet.has(notifKey),
    });
  }

  return sortTaskNotifications(items, 'priority');
}

const TASK_SEVERITY_RANK: Record<NotificationSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function getTaskNotificationTimestampMs(item: TaskNotificationItem): number {
  return (
    parseTimestampMs(item.triggeredAt) ??
    parseTimestampMs(item.job.updatedAt) ??
    parseTimestampMs(item.job.stageEnteredAt) ??
    parseTimestampMs(item.job.intakeDate) ??
    parseTimestampMs(item.job.createdAt) ??
    0
  );
}

export function sortTaskNotifications(
  items: TaskNotificationItem[],
  sortOrder: NotificationSortOrder = 'priority'
): TaskNotificationItem[] {
  return [...items].sort((a, b) => {
    if (a.dismissed !== b.dismissed) return a.dismissed ? 1 : -1;

    const aMs = getTaskNotificationTimestampMs(a);
    const bMs = getTaskNotificationTimestampMs(b);

    if (sortOrder === 'oldest') {
      if (aMs !== bMs) return aMs - bMs;
      if (TASK_SEVERITY_RANK[a.severity] !== TASK_SEVERITY_RANK[b.severity]) {
        return TASK_SEVERITY_RANK[a.severity] - TASK_SEVERITY_RANK[b.severity];
      }
      if (b.stageDays !== a.stageDays) return b.stageDays - a.stageDays;
      return a.id.localeCompare(b.id);
    }

    if (sortOrder === 'newest') {
      if (bMs !== aMs) return bMs - aMs;
      if (TASK_SEVERITY_RANK[a.severity] !== TASK_SEVERITY_RANK[b.severity]) {
        return TASK_SEVERITY_RANK[a.severity] - TASK_SEVERITY_RANK[b.severity];
      }
      if (b.stageDays !== a.stageDays) return b.stageDays - a.stageDays;
      return a.id.localeCompare(b.id);
    }

    if (TASK_SEVERITY_RANK[a.severity] !== TASK_SEVERITY_RANK[b.severity]) {
      return TASK_SEVERITY_RANK[a.severity] - TASK_SEVERITY_RANK[b.severity];
    }
    const priorityDiff =
      getPriorityWeight(normalizeJobPriority(b.job.priority)) -
      getPriorityWeight(normalizeJobPriority(a.job.priority));
    if (priorityDiff !== 0) return priorityDiff;
    if (b.stageDays !== a.stageDays) {
      return b.stageDays - a.stageDays;
    }
    if (bMs !== aMs) return bMs - aMs;
    return a.id.localeCompare(b.id);
  });
}

export interface EscalateTaskOptions {
  reason?: string;
  technician?: string;
  actorName?: string;
}

export function applyTaskEscalation(
  jobs: JobCard[],
  jobId: string,
  options: EscalateTaskOptions = {},
  nowIso: string = new Date().toISOString()
): { updatedJobs: JobCard[]; changedJob: JobCard | null } {
  const cleanReason = (options.reason || '').trim();
  const cleanTechnician = (options.technician || '').trim();
  const actorName = (options.actorName || '').trim() || 'Workshop Supervisor';
  const timestampLabel = nowIso.slice(0, 16).replace('T', ' ');
  let changedJob: JobCard | null = null;

  const updatedJobs = jobs.map((job) => {
    if (job.id !== jobId) return job;

    const prevPriority = normalizeJobPriority(job.priority);
    const nextTechnician = cleanTechnician || job.technician;
    const prevNotes = (job.diagnosticNotes || '').trim();
    const escalationNoteLine = cleanReason
      ? `[ESCALATED ${timestampLabel}] ${cleanReason}`
      : `[ESCALATED ${timestampLabel}] Escalated to High priority for immediate technician review.`;

    const nextNotes = prevNotes
      ? `${prevNotes}\n${escalationNoteLine}`
      : escalationNoteLine;

    const auditSummaryParts = [`Priority: High`];
    if (cleanTechnician && cleanTechnician !== job.technician) {
      auditSummaryParts.push(`Assigned: ${cleanTechnician}`);
    }
    if (cleanReason) {
      auditSummaryParts.push(`Note: ${cleanReason.slice(0, 80)}`);
    }

    const nextAudit = [
      ...(job.auditLogs || []),
      {
        id: `aud-esc-${Date.now()}`,
        timestamp: timestampLabel,
        userName: actorName,
        userRole: 'Supervisor / Notifications Center',
        action: 'TASK_ESCALATED',
        previousState: `${prevPriority} · ${job.technician || 'Unassigned'}`,
        newState: auditSummaryParts.join(' · '),
      },
    ];

    changedJob = {
      ...job,
      priority: 'High',
      technician: nextTechnician,
      diagnosticNotes: nextNotes,
      auditLogs: nextAudit,
      updatedAt: nowIso,
    };
    return changedJob;
  });

  return { updatedJobs, changedJob };
}

export function buildClientReplyDraft(
  job: JobCard,
  kind: TaskNotificationKind,
  settings: Pick<BusinessSettings, 'centerName'>
): string {
  const clientName = job.customerName || 'Client';
  const toolLabel = `${job.tool.brand} ${job.tool.modelNumber}`.trim();
  const center = settings.centerName || 'Service Center';

  switch (kind) {
    case 'awaiting-approval':
      return `Hi ${clientName}, quick follow-up from ${center} on Job Card ${job.id} (${toolLabel}). Your repair estimate is waiting for approval so we can proceed.`;
    case 'ready-for-pickup':
      return `Hi ${clientName}, your ${toolLabel} under Job Card ${job.id} is ready for pickup at ${center}. Please let us know when you plan to collect it.`;
    case 'low-rating':
      return `Hi ${clientName}, this is ${center} following up on your recent feedback for Job Card ${job.id} (${toolLabel}). We want to make this right — please reply or call us at your convenience.`;
    case 'sla-overdue':
    case 'promised-overdue':
      return `Hi ${clientName}, update from ${center} on Job Card ${job.id} (${toolLabel}): our team has prioritized your tool in ${job.status} and will confirm an updated completion time shortly.`;
    default:
      return `Hi ${clientName}, status update from ${center} regarding Job Card ${job.id} (${toolLabel}): currently in ${job.status}. Let us know if you have any questions.`;
  }
}

export function buildScheduleReminderDraft(
  schedule: RecurringMaintenance,
  settings: Pick<BusinessSettings, 'centerName'>
): string {
  const clientName = schedule.customerName || 'Client';
  const center = settings.centerName || 'Service Center';
  return `Hi ${clientName}, reminder from ${center}: your ${schedule.toolBrand} ${schedule.modelNumber} (${schedule.id}) is ${schedule.status.toLowerCase()} for ${schedule.recommendedServiceScope} (due ${schedule.nextDueDate}). Reply to book your drop-off.`;
}

export interface ForwardNotificationOptions {
  recipient: string;
  note?: string;
  channel?: string;
  actorName?: string;
}

export function applyNotificationForward(
  jobs: JobCard[],
  jobId: string,
  options: ForwardNotificationOptions,
  nowIso: string = new Date().toISOString()
): { updatedJobs: JobCard[]; changedJob: JobCard | null } {
  const recipient = options.recipient.trim();
  if (!recipient) {
    return { updatedJobs: jobs, changedJob: null };
  }

  const cleanNote = (options.note || '').trim();
  const channelLabel = (options.channel || 'Internal Handoff').trim();
  const actorName = (options.actorName || '').trim() || 'Service Coordinator';
  const timestampLabel = nowIso.slice(0, 16).replace('T', ' ');
  let changedJob: JobCard | null = null;

  const updatedJobs = jobs.map((job) => {
    if (job.id !== jobId) return job;

    const prevNotes = (job.diagnosticNotes || '').trim();
    const forwardLine = cleanNote
      ? `[FORWARDED ${timestampLabel} -> ${recipient} (${channelLabel})] ${cleanNote}`
      : `[FORWARDED ${timestampLabel} -> ${recipient} (${channelLabel})] Notification forwarded for follow-up.`;

    const nextNotes = prevNotes ? `${prevNotes}\n${forwardLine}` : forwardLine;
    const nextAudit = [
      ...(job.auditLogs || []),
      {
        id: `aud-fwd-${Date.now()}`,
        timestamp: timestampLabel,
        userName: actorName,
        userRole: 'Service Coordinator / Notifications',
        action: 'NOTIFICATION_FORWARDED',
        previousState: `${job.status} · ${job.technician || 'Unassigned'}`,
        newState: `Forwarded to ${recipient} via ${channelLabel}${cleanNote ? ` — ${cleanNote.slice(0, 70)}` : ''}`,
      },
    ];

    changedJob = {
      ...job,
      diagnosticNotes: nextNotes,
      auditLogs: nextAudit,
      updatedAt: nowIso,
    };
    return changedJob;
  });

  return { updatedJobs, changedJob };
}

export type ForwardBriefPayload =
  | { type: 'job'; job: JobCard; heading: string; details: string }
  | { type: 'inventory'; notif: InventoryNotification }
  | { type: 'schedule'; schedule: RecurringMaintenance };

export function buildNotificationForwardText(
  payload: ForwardBriefPayload,
  recipient?: string,
  note?: string
): string {
  const targetPrefix = recipient?.trim() ? `To: ${recipient.trim()}\n` : '';
  const extraNote = note?.trim() ? `\nNote: ${note.trim()}` : '';

  if (payload.type === 'inventory') {
    const n = payload.notif;
    return `${targetPrefix}[RESTOCK REQUEST] ${n.sku} — ${n.name}\nStock: ${n.stockQty} ${n.unit} (Min: ${n.minStockThreshold} ${n.unit}) · Severity: ${n.severity.replace(/_/g, ' ')}\nBin: ${n.binLocation} · Suggested Reorder: +${n.suggestedReorderQty} ${n.unit} ($${n.estimatedReorderCost.toFixed(2)})${extraNote}`;
  }

  if (payload.type === 'schedule') {
    const s = payload.schedule;
    return `${targetPrefix}[SERVICING DUE] ${s.id} · ${s.status} (Due ${s.nextDueDate})\nClient: ${s.customerName} (${s.customerPhone})\nTool: ${s.toolBrand} ${s.modelNumber} (SN: ${s.serialNumber})\nScope: ${s.recommendedServiceScope}${extraNote}`;
  }

  const j = payload.job;
  return `${targetPrefix}[WORKSHOP HANDOFF] ${j.id} · ${payload.heading}\nClient: ${j.customerName} (${j.customerPhone})\nTool: ${j.tool.brand} ${j.tool.modelNumber} · Status: ${j.status} · Priority: ${normalizeJobPriority(j.priority)}\nDetails: ${payload.details}${extraNote}`;
}

export type QuickReplyPresetId =
  | 'in-progress'
  | 'waiting-for-parts'
  | 'awaiting-approval'
  | 'client-contacted'
  | 'ready-for-pickup';

export interface QuickReplyPreset {
  id: QuickReplyPresetId;
  label: string;
  actionHint: string;
  targetStatus?: JobStatus;
  messageType: MessageLog['type'];
}

export const QUICK_REPLY_PRESETS: readonly QuickReplyPreset[] = [
  {
    id: 'in-progress',
    label: 'In Progress',
    actionHint: 'Set status In Repair & notify client',
    targetStatus: 'In Repair',
    messageType: 'In Progress',
  },
  {
    id: 'waiting-for-parts',
    label: 'Waiting for Parts',
    actionHint: 'Set status Awaiting Parts & notify client',
    targetStatus: 'Awaiting Parts',
    messageType: 'Custom',
  },
  {
    id: 'awaiting-approval',
    label: 'Awaiting Approval',
    actionHint: 'Set status Awaiting Approval & request sign-off',
    targetStatus: 'Awaiting Approval',
    messageType: 'Estimate',
  },
  {
    id: 'client-contacted',
    label: 'Client Contacted',
    actionHint: 'Log client check-in & send follow-up',
    messageType: 'Custom',
  },
  {
    id: 'ready-for-pickup',
    label: 'Ready for Pickup',
    actionHint: 'Set status Ready for Pickup & notify client',
    targetStatus: 'Ready for Pickup',
    messageType: 'Ready',
  },
];

export function getQuickReplyPreset(presetId: QuickReplyPresetId): QuickReplyPreset {
  return QUICK_REPLY_PRESETS.find((preset) => preset.id === presetId) || QUICK_REPLY_PRESETS[0];
}

export function buildQuickReplyMessage(
  job: JobCard,
  presetId: QuickReplyPresetId,
  settings: Pick<BusinessSettings, 'centerName'>
): string {
  const clientName = job.customerName || 'Client';
  const toolLabel = `${job.tool.brand} ${job.tool.modelNumber}`.trim();
  const center = settings.centerName || 'Service Center';

  switch (presetId) {
    case 'in-progress':
      return `Hi ${clientName}, update from ${center} on Job Card ${job.id} (${toolLabel}): your tool is now In Progress on the repair bench. We will notify you once testing finishes.`;
    case 'waiting-for-parts':
      return `Hi ${clientName}, update from ${center} on Job Card ${job.id} (${toolLabel}): your repair is waiting for spare parts arrival. We will resume work as soon as parts arrive.`;
    case 'awaiting-approval':
      return `Hi ${clientName}, update from ${center} on Job Card ${job.id} (${toolLabel}): our inspection is complete and the repair estimate awaits your approval so we can proceed.`;
    case 'client-contacted':
      return `Hi ${clientName}, follow-up from ${center} on Job Card ${job.id} (${toolLabel}): we reached out regarding the ${job.status} stage. Reply anytime if you have questions.`;
    case 'ready-for-pickup':
      return `Hi ${clientName}, good news from ${center}: your ${toolLabel} under Job Card ${job.id} is Ready for Pickup. Let us know when you plan to collect it.`;
  }
}

export interface ApplyQuickReplyOptions {
  presetId: QuickReplyPresetId;
  channel: MessageLog['channel'];
  recipient: string;
  messageText: string;
  apiConfirmed: boolean;
  deductStockOn: BusinessSettings['deductStockOn'];
  actorName?: string;
  actorRole?: string;
}

export function applyQuickReplyToJobs(
  jobs: JobCard[],
  jobId: string,
  options: ApplyQuickReplyOptions,
  nowIso: string = new Date().toISOString()
): {
  updatedJobs: JobCard[];
  changedJob: JobCard | null;
  inventoryDeltas: InventoryDelta[];
  preset: QuickReplyPreset;
  previousStatus: JobStatus | null;
} {
  const preset = getQuickReplyPreset(options.presetId);
  const actorName = (options.actorName || '').trim() || 'Workshop Technician';
  const actorRole = (options.actorRole || '').trim() || 'Technician';
  const timestampLabel = nowIso.slice(0, 16).replace('T', ' ');
  const deliveryStatus = sentStatusFor(options.apiConfirmed);
  const cleanRecipient = (options.recipient || '').trim();

  let changedJob: JobCard | null = null;
  let inventoryDeltas: InventoryDelta[] = [];
  let previousStatus: JobStatus | null = null;

  const updatedJobs = jobs.map((job) => {
    if (job.id !== jobId) return job;

    previousStatus = job.status;
    const nextStatus: JobStatus =
      preset.targetStatus && preset.targetStatus !== job.status ? preset.targetStatus : job.status;
    const statusChanged = nextStatus !== job.status;

    const prevHistory =
      job.stageHistory && job.stageHistory.length > 0
        ? job.stageHistory
        : [{ status: job.status, enteredAt: job.stageEnteredAt || job.createdAt }];

    const nextMessageLog: MessageLog = {
      id: `msg-qr-${Date.now()}`,
      timestamp: timestampLabel,
      type: preset.messageType,
      ...(cleanRecipient
        ? options.channel === 'Email'
          ? { recipientEmail: cleanRecipient }
          : { recipientPhone: cleanRecipient }
        : {}),
      text: options.messageText,
      channel: options.channel,
      status: deliveryStatus,
    };

    const prevNotes = (job.diagnosticNotes || '').trim();
    const noteLine = statusChanged
      ? `[QUICK REPLY ${timestampLabel} · ${preset.label}] Status updated to ${nextStatus}; notified client via ${options.channel} (${deliveryStatus}).`
      : `[QUICK REPLY ${timestampLabel} · ${preset.label}] Logged client contact via ${options.channel} (${deliveryStatus}).`;
    const nextNotes = prevNotes ? `${prevNotes}\n${noteLine}` : noteLine;

    const nextAudit = [
      ...(job.auditLogs || []),
      {
        id: `aud-qr-${Date.now()}`,
        timestamp: timestampLabel,
        userName: actorName,
        userRole: actorRole,
        action: 'QUICK_REPLY_SENT',
        previousState: job.status,
        newState: statusChanged
          ? `${preset.label} · Status: ${nextStatus} · ${options.channel} (${deliveryStatus})`
          : `${preset.label} · ${options.channel} (${deliveryStatus})`,
      },
    ];

    const draftJob: JobCard = {
      ...job,
      status: nextStatus,
      stageEnteredAt: statusChanged ? nowIso : job.stageEnteredAt,
      stageHistory: statusChanged
        ? [...prevHistory, { status: nextStatus, enteredAt: nowIso }]
        : job.stageHistory,
      diagnosticNotes: nextNotes,
      messageLogs: [nextMessageLog, ...(job.messageLogs || [])],
      auditLogs: nextAudit,
      updatedAt: nowIso,
    };

    if (statusChanged) {
      const stockResult = applyStockLifecycleTransition(draftJob, nextStatus, options.deductStockOn, {
        actorName,
        actorRole,
        nowIso,
      });
      inventoryDeltas = stockResult.inventoryDeltas;
      changedJob = stockResult.updatedJob;
      return changedJob;
    }

    changedJob = draftJob;
    return changedJob;
  });

  return {
    updatedJobs,
    changedJob,
    inventoryDeltas,
    preset,
    previousStatus,
  };
}

export interface AssignTechnicianOptions {
  technician: string;
  note?: string;
  actorName?: string;
  actorRole?: string;
}

export function applyTechnicianAssignment(
  jobs: JobCard[],
  jobId: string,
  options: AssignTechnicianOptions,
  nowIso: string = new Date().toISOString()
): {
  updatedJobs: JobCard[];
  changedJob: JobCard | null;
  previousTechnician: string;
  assignedTechnician: string;
} {
  const assignedTechnician = (options.technician || '').trim().slice(0, 120);
  if (!assignedTechnician) {
    return {
      updatedJobs: jobs,
      changedJob: null,
      previousTechnician: '',
      assignedTechnician: '',
    };
  }

  const cleanNote = (options.note || '').trim();
  const actorName = (options.actorName || '').trim() || 'Workshop Manager';
  const actorRole = (options.actorRole || '').trim() || 'Manager / Notifications Center';
  const timestampLabel = nowIso.slice(0, 16).replace('T', ' ');

  let changedJob: JobCard | null = null;
  let previousTechnician = '';

  const updatedJobs = jobs.map((job) => {
    if (job.id !== jobId) return job;

    previousTechnician = (job.technician || '').trim() || 'Unassigned';
    const prevNotes = (job.diagnosticNotes || '').trim();
    const noteLine = cleanNote
      ? `[ASSIGNED ${timestampLabel} -> ${assignedTechnician}] ${cleanNote}`
      : `[ASSIGNED ${timestampLabel} -> ${assignedTechnician}] Reassigned from ${previousTechnician} via Notifications Center.`;
    const nextNotes = prevNotes ? `${prevNotes}\n${noteLine}` : noteLine;

    const nextAudit = [
      ...(job.auditLogs || []),
      {
        id: `aud-assign-${Date.now()}`,
        timestamp: timestampLabel,
        userName: actorName,
        userRole: actorRole,
        action: 'TECHNICIAN_ASSIGNED',
        previousState: previousTechnician,
        newState: cleanNote
          ? `${assignedTechnician} · ${cleanNote.slice(0, 80)}`
          : assignedTechnician,
      },
    ];

    changedJob = {
      ...job,
      technician: assignedTechnician,
      diagnosticNotes: nextNotes,
      auditLogs: nextAudit,
      updatedAt: nowIso,
    };
    return changedJob;
  });

  return {
    updatedJobs,
    changedJob,
    previousTechnician,
    assignedTechnician,
  };
}

export interface NotificationSummaryCounts {
  pendingSyncCount: number;
  activeTaskCount: number;
  unreadInventoryCount: number;
  dueMaintenanceCount: number;
  totalAttentionCount: number;
}

export function computeNotificationCounts(params: {
  pendingSyncJobs: PendingSyncJobItem[];
  taskNotifications: TaskNotificationItem[];
  inventoryNotifications: InventoryNotification[];
  schedules: RecurringMaintenance[];
  inventory?: InventoryItem[];
}): NotificationSummaryCounts {
  const pendingSyncCount = params.pendingSyncJobs.length;
  const activeTaskCount = params.taskNotifications.filter((t) => !t.dismissed).length;
  const unreadInventoryCount = params.inventoryNotifications.filter((n) => !n.read).length;
  const dueMaintenanceCount = params.schedules.filter(
    (s) => s.status === 'Overdue' || s.status === 'Due Soon'
  ).length;

  return {
    pendingSyncCount,
    activeTaskCount,
    unreadInventoryCount,
    dueMaintenanceCount,
    totalAttentionCount:
      pendingSyncCount + activeTaskCount + unreadInventoryCount + dueMaintenanceCount,
  };
}
