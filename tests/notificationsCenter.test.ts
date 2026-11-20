import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTaskEscalation,
  buildClientReplyDraft,
  buildTaskNotificationItems,
  computeNotificationCounts,
  getPendingOfflineSyncJobs,
} from '../src/utils/notificationsCenter';
import { INITIAL_JOB_CARDS } from '../src/data/initialJobCards';
import { JobCard, RecurringMaintenance } from '../src/types';

function makeJob(overrides: Partial<JobCard> = {}): JobCard {
  const base = INITIAL_JOB_CARDS[0];
  return {
    ...base,
    id: 'BOSCH-2026-9001',
    status: 'Intake',
    priority: 'Low',
    auditLogs: [],
    messageLogs: [],
    diagnosticNotes: '',
    ...overrides,
  };
}

test('getPendingOfflineSyncJobs surfaces offline queued jobs and failed cloud writes without alarming guest edits online', () => {
  const jobOffline = makeJob({ id: 'BOSCH-2026-9001' });
  const jobFailed = makeJob({ id: 'BOSCH-2026-9002' });
  const jobHealthy = makeJob({ id: 'BOSCH-2026-9003' });

  // Case 1: Device offline with pending job in queue
  const offlinePending = getPendingOfflineSyncJobs({
    jobCards: [jobOffline, jobHealthy],
    pendingCloudSyncIds: [jobOffline.id],
    isOnline: false,
    isAuthenticated: false,
  });
  assert.equal(offlinePending.length, 1);
  assert.equal(offlinePending[0].job.id, jobOffline.id);
  assert.equal(offlinePending[0].wasOffline, true);

  // Case 2: Device back online & unauthenticated, but failure record persists from offline write
  const persistedOfflineFailure = getPendingOfflineSyncJobs({
    jobCards: [jobOffline, jobHealthy],
    pendingCloudSyncIds: [jobOffline.id],
    syncFailureMap: {
      [jobOffline.id]: {
        reason: 'Saved while offline — waiting for internet connectivity to sync to cloud.',
        failedAt: '2026-11-20T03:00:00.000Z',
        wasOffline: true,
      },
    },
    isOnline: true,
    isAuthenticated: false,
  });
  assert.equal(persistedOfflineFailure.length, 1);
  assert.equal(persistedOfflineFailure[0].job.id, jobOffline.id);

  // Case 3: Online & signed out with NO failure record or pending Firestore write -> silent local mode
  const pureLocalGuest = getPendingOfflineSyncJobs({
    jobCards: [jobHealthy],
    pendingCloudSyncIds: [jobHealthy.id],
    isOnline: true,
    isAuthenticated: false,
  });
  assert.equal(pureLocalGuest.length, 0);

  // Case 4: Online & signed in with pending Firestore write / write error
  const signedInFailed = getPendingOfflineSyncJobs({
    jobCards: [jobFailed, jobHealthy],
    pendingCloudSyncIds: [jobFailed.id],
    syncFailureMap: {
      [jobFailed.id]: {
        reason: 'Cloud sync failed: network timeout',
        failedAt: '2026-11-20T03:05:00.000Z',
        wasOffline: false,
      },
    },
    isOnline: true,
    isAuthenticated: true,
  });
  assert.equal(signedInFailed.length, 1);
  assert.match(signedInFailed[0].reason, /network timeout/);
});

test('buildTaskNotificationItems flags SLA overdue, promised overdue, approvals, pickups, low ratings, and respects dismissed state', () => {
  const nowMs = Date.parse('2026-11-20T12:00:00.000Z');

  const stalledJob = makeJob({
    id: 'BOSCH-2026-9010',
    status: 'Awaiting Parts',
    stageEnteredAt: '2026-11-10T10:00:00.000Z', // 10 days ago
    promisedCompletion: '2026-11-25 17:00',
  });

  const approvalJob = makeJob({
    id: 'BOSCH-2026-9011',
    status: 'Awaiting Approval',
    stageEnteredAt: '2026-11-19T12:00:00.000Z',
    promisedCompletion: '2026-11-25 17:00',
  });

  const lowRatingCompleted = makeJob({
    id: 'BOSCH-2026-9012',
    status: 'Completed',
    stageEnteredAt: '2026-11-19T12:00:00.000Z',
    promisedCompletion: '2026-11-18 17:00',
    customerFeedback: {
      rating: 2,
      comment: 'Took longer than expected',
      submittedAt: '2026-11-20T08:00:00.000Z',
    },
  });

  const cancelledJob = makeJob({
    id: 'BOSCH-2026-9013',
    status: 'Cancelled',
    priority: 'High',
  });

  const items = buildTaskNotificationItems(
    [approvalJob, stalledJob, lowRatingCompleted, cancelledJob],
    nowMs,
    [`task-${approvalJob.id}-awaiting-approval`]
  );

  assert.equal(items.length, 3);
  assert.equal(items[0].job.id, stalledJob.id);
  assert.equal(items[0].kind, 'sla-overdue');
  assert.equal(items[0].severity, 'critical');

  const ratingItem = items.find((i) => i.job.id === lowRatingCompleted.id);
  assert.ok(ratingItem);
  assert.equal(ratingItem.kind, 'low-rating');

  const approvalItem = items.find((i) => i.job.id === approvalJob.id);
  assert.ok(approvalItem);
  assert.equal(approvalItem.dismissed, true);
});

test('applyTaskEscalation elevates priority to High, assigns technician, appends notes, and records TASK_ESCALATED audit log', () => {
  const jobA = makeJob({ id: 'BOSCH-2026-9020', priority: 'Medium', technician: 'Alex Carter' });
  const jobB = makeJob({ id: 'BOSCH-2026-9021', priority: 'Low', technician: 'Alex Carter' });

  const { updatedJobs, changedJob } = applyTaskEscalation(
    [jobA, jobB],
    'BOSCH-2026-9020',
    {
      reason: 'Site crew waiting for concrete breaker today',
      technician: 'David Miller (Bosch Master Certified)',
      actorName: 'Supervisor Sam',
    },
    '2026-11-20T10:30:00.000Z'
  );

  assert.ok(changedJob);
  assert.equal(changedJob.priority, 'High');
  assert.equal(changedJob.technician, 'David Miller (Bosch Master Certified)');
  assert.match(changedJob.diagnosticNotes || '', /\[ESCALATED 2026-11-20 10:30\] Site crew waiting/);
  assert.equal(changedJob.auditLogs?.length, 1);
  assert.equal(changedJob.auditLogs?.[0].action, 'TASK_ESCALATED');
  assert.equal(changedJob.auditLogs?.[0].userName, 'Supervisor Sam');

  // Sibling job stays untouched
  assert.equal(updatedJobs[1].priority, 'Low');
});

test('buildClientReplyDraft uses Client terminology and computeNotificationCounts sums active attention items', () => {
  const job = makeJob({ id: 'BOSCH-2026-9030', status: 'Ready for Pickup', customerName: 'Elena Vance' });
  const draft = buildClientReplyDraft(job, 'ready-for-pickup', { centerName: 'Bosch Hub' });
  assert.ok(!draft.toLowerCase().includes('customer'));
  assert.match(draft, /BOSCH-2026-9030/);
  assert.match(draft, /ready for pickup/i);

  const schedules: RecurringMaintenance[] = [
    {
      id: 'RM-1',
      customerName: 'Elena Vance',
      customerPhone: '+15550100',
      toolBrand: 'Bosch Professional',
      toolCategory: 'Rotary Hammer / SDS',
      modelNumber: 'GBH 2-26',
      serialNumber: '1234',
      intervalMonths: 6,
      lastServiceDate: '2026-05-01',
      nextDueDate: '2026-11-01',
      status: 'Overdue',
      recommendedServiceScope: 'Brush check',
      queuedReminders: [],
      createdAt: '2026-05-01',
      updatedAt: '2026-11-01',
    },
  ];

  const counts = computeNotificationCounts({
    pendingSyncJobs: [
      {
        job,
        reason: 'Offline',
        failedAt: '2026-11-20T10:00:00.000Z',
        wasOffline: true,
        inFlight: false,
      },
    ],
    taskNotifications: buildTaskNotificationItems([job], Date.parse('2026-11-20T12:00:00.000Z')),
    inventoryNotifications: [],
    schedules,
  });

  assert.equal(counts.pendingSyncCount, 1);
  assert.equal(counts.activeTaskCount, 1);
  assert.equal(counts.dueMaintenanceCount, 1);
  assert.equal(counts.totalAttentionCount, 3);
});
