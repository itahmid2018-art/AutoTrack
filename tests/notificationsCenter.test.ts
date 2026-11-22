import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUICK_REPLY_PRESETS,
  applyNotificationForward,
  applyQuickReplyToJobs,
  applyTaskEscalation,
  applyTechnicianAssignment,
  buildClientReplyDraft,
  buildNotificationForwardText,
  buildQuickReplyMessage,
  buildScheduleReminderDraft,
  buildTaskNotificationItems,
  computeNotificationCounts,
  getPendingOfflineSyncJobs,
  sortTaskNotifications,
} from '../src/utils/notificationsCenter';
import type { InventoryNotification } from '../src/utils/inventoryNotifications';
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

test('applyNotificationForward records diagnostic handoff note, NOTIFICATION_FORWARDED audit log, and skips empty recipients', () => {
  const jobA = makeJob({ id: 'BOSCH-2026-9040', status: 'In Repair', technician: 'Alex Carter' });
  const jobB = makeJob({ id: 'BOSCH-2026-9041', status: 'Intake', diagnosticNotes: 'Original intake note' });

  const skipped = applyNotificationForward(
    [jobA, jobB],
    'BOSCH-2026-9040',
    { recipient: '   ', note: 'Should not record' },
    '2026-11-21T09:15:00.000Z'
  );
  assert.equal(skipped.changedJob, null);
  assert.equal(skipped.updatedJobs[0].auditLogs?.length, 0);

  const { updatedJobs, changedJob } = applyNotificationForward(
    [jobA, jobB],
    'BOSCH-2026-9040',
    {
      recipient: 'Parts & Procurement Desk',
      note: 'Check commutator stock before 3 PM',
      channel: 'WhatsApp',
      actorName: 'Coordinator Priya',
    },
    '2026-11-21T09:15:00.000Z'
  );

  assert.ok(changedJob);
  assert.match(
    changedJob.diagnosticNotes || '',
    /\[FORWARDED 2026-11-21 09:15 -> Parts & Procurement Desk \(WhatsApp\)\] Check commutator stock/
  );
  assert.equal(changedJob.auditLogs?.length, 1);
  assert.equal(changedJob.auditLogs?.[0].action, 'NOTIFICATION_FORWARDED');
  assert.equal(changedJob.auditLogs?.[0].userName, 'Coordinator Priya');
  assert.match(changedJob.auditLogs?.[0].newState || '', /Forwarded to Parts & Procurement Desk via WhatsApp/);

  // Sibling job stays untouched
  assert.equal(updatedJobs[1].diagnosticNotes, 'Original intake note');
  assert.equal(updatedJobs[1].auditLogs?.length, 0);
});

test('buildScheduleReminderDraft and buildNotificationForwardText format job, inventory, and schedule briefs', () => {
  const job = makeJob({
    id: 'BOSCH-2026-9050',
    customerName: 'Marcus Bell',
    customerPhone: '+15550199',
    status: 'Awaiting Parts',
    priority: 'High',
  });

  const jobBrief = buildNotificationForwardText(
    {
      type: 'job',
      job,
      heading: 'BOSCH-2026-9050 stalled in Awaiting Parts (6d)',
      details: 'In Awaiting Parts for 6 days',
    },
    'Lead Bench',
    'Expedite armature delivery'
  );
  assert.match(jobBrief, /^To: Lead Bench\n\[WORKSHOP HANDOFF\] BOSCH-2026-9050/);
  assert.match(jobBrief, /Client: Marcus Bell \(\+15550199\)/);
  assert.match(jobBrief, /Priority: High/);
  assert.match(jobBrief, /Note: Expedite armature delivery$/);

  const invNotif: InventoryNotification = {
    id: 'inv-1',
    itemId: 'item-1',
    sku: 'SP-BR-26',
    name: 'Carbon Brush Set',
    category: 'Brushes',
    binLocation: 'A-12',
    unit: 'pcs',
    costPrice: 4.5,
    stockQty: 1,
    minStockThreshold: 5,
    severity: 'CRITICAL',
    message: '1 remaining',
    suggestedReorderQty: 10,
    estimatedReorderCost: 45,
    triggeredAt: '2026-11-21T08:00:00.000Z',
    read: false,
  };
  const invBrief = buildNotificationForwardText(
    { type: 'inventory', notif: invNotif },
    'Procurement'
  );
  assert.match(invBrief, /\[RESTOCK REQUEST\] SP-BR-26 — Carbon Brush Set/);
  assert.match(invBrief, /Suggested Reorder: \+10 pcs \(\$45\.00\)/);

  const schedule: RecurringMaintenance = {
    id: 'RM-99',
    customerName: 'Apex Civil Works',
    customerPhone: '+15550222',
    toolBrand: 'Makita',
    toolCategory: 'Angle Grinder',
    modelNumber: 'GA9020',
    serialNumber: 'MK-4421',
    intervalMonths: 6,
    lastServiceDate: '2026-05-20',
    nextDueDate: '2026-11-20',
    status: 'Due Soon',
    recommendedServiceScope: 'Gear grease & bearing inspection',
    queuedReminders: [],
    createdAt: '2026-05-20',
    updatedAt: '2026-11-20',
  };

  const reminderDraft = buildScheduleReminderDraft(schedule, { centerName: 'AutoTrack Pro Hub' });
  assert.ok(!reminderDraft.toLowerCase().includes('customer'));
  assert.match(reminderDraft, /RM-99/);
  assert.match(reminderDraft, /Makita GA9020/);
  assert.match(reminderDraft, /due 2026-11-20/);

  const scheduleBrief = buildNotificationForwardText({ type: 'schedule', schedule });
  assert.match(scheduleBrief, /\[SERVICING DUE\] RM-99 · Due Soon \(Due 2026-11-20\)/);
  assert.match(scheduleBrief, /Client: Apex Civil Works \(\+15550222\)/);
});

test('buildQuickReplyMessage formats client-focused preset replies without customer wording', () => {
  const job = makeJob({
    id: 'BOSCH-2026-9060',
    customerName: 'Nora Vance',
    status: 'Diagnosis',
  });

  assert.equal(QUICK_REPLY_PRESETS.length, 5);
  for (const preset of QUICK_REPLY_PRESETS) {
    const text = buildQuickReplyMessage(job, preset.id, { centerName: 'AutoTrack Pro Hub' });
    assert.ok(!text.toLowerCase().includes('customer'), `Preset ${preset.id} leaked 'customer'`);
    assert.match(text, /BOSCH-2026-9060/);
    assert.match(text, /Nora Vance/);
  }
});

test('applyQuickReplyToJobs updates status, applies stock lifecycle transition, logs MessageLog and audit entry', () => {
  const jobWithPart = makeJob({
    id: 'BOSCH-2026-9070',
    status: 'Diagnosis',
    customerPhone: '+15550333',
    parts: [
      {
        partId: 'part-1',
        sku: 'BR-26',
        name: 'Carbon Brush',
        unitPrice: 12,
        quantity: 2,
        total: 24,
      },
    ],
  });
  const siblingJob = makeJob({ id: 'BOSCH-2026-9071', status: 'Intake' });

  const inProgressText = buildQuickReplyMessage(jobWithPart, 'in-progress', {
    centerName: 'AutoTrack Pro Hub',
  });

  const inProgressResult = applyQuickReplyToJobs(
    [jobWithPart, siblingJob],
    'BOSCH-2026-9070',
    {
      presetId: 'in-progress',
      channel: 'WhatsApp',
      recipient: '+15550333',
      messageText: inProgressText,
      apiConfirmed: true,
      deductStockOn: 'InService',
      actorName: 'Tech Alex',
      actorRole: 'Technician',
    },
    '2026-11-22T01:40:00.000Z'
  );

  assert.ok(inProgressResult.changedJob);
  assert.equal(inProgressResult.previousStatus, 'Diagnosis');
  assert.equal(inProgressResult.changedJob.status, 'In Repair');
  assert.equal(inProgressResult.changedJob.stockDeductedAt, '2026-11-22T01:40:00.000Z');
  assert.deepEqual(inProgressResult.inventoryDeltas, [{ partId: 'part-1', deltaQty: -2 }]);
  assert.equal(inProgressResult.changedJob.messageLogs[0].status, 'Sent');
  assert.equal(inProgressResult.changedJob.messageLogs[0].type, 'In Progress');
  assert.equal(inProgressResult.changedJob.auditLogs?.[0].action, 'QUICK_REPLY_SENT');
  assert.match(inProgressResult.changedJob.diagnosticNotes || '', /\[QUICK REPLY 2026-11-22 01:40 · In Progress\]/);

  // Client Contacted keeps existing status and respects Pending status when API unconfirmed
  const contactedResult = applyQuickReplyToJobs(
    inProgressResult.updatedJobs,
    'BOSCH-2026-9070',
    {
      presetId: 'client-contacted',
      channel: 'SMS',
      recipient: '+15550333',
      messageText: 'Reached out to client.',
      apiConfirmed: false,
      deductStockOn: 'InService',
    },
    '2026-11-22T01:45:00.000Z'
  );

  assert.ok(contactedResult.changedJob);
  assert.equal(contactedResult.changedJob.status, 'In Repair');
  assert.equal(contactedResult.inventoryDeltas.length, 0);
  assert.equal(contactedResult.changedJob.messageLogs[0].status, 'Pending');
  assert.equal(contactedResult.changedJob.messageLogs.length, 2);
  assert.equal(contactedResult.updatedJobs[1].status, 'Intake');
});

test('applyTechnicianAssignment reassigns job card, logs audit entry, and ignores blank technician names', () => {
  const jobTarget = makeJob({
    id: 'BOSCH-2026-9080',
    technician: 'David Miller',
    diagnosticNotes: 'Initial inspection complete.',
    auditLogs: [],
  });
  const sibling = makeJob({
    id: 'MAK-2026-9081',
    technician: 'Marcus Vance',
  });

  const blankResult = applyTechnicianAssignment(
    [jobTarget, sibling],
    'BOSCH-2026-9080',
    { technician: '   ' },
    '2026-11-22T02:00:00.000Z'
  );
  assert.equal(blankResult.changedJob, null);
  assert.equal(blankResult.updatedJobs[0].technician, 'David Miller');

  const result = applyTechnicianAssignment(
    [jobTarget, sibling],
    'BOSCH-2026-9080',
    {
      technician: 'Sarah Connor',
      actorName: 'Floor Manager',
    },
    '2026-11-22T02:05:00.000Z'
  );

  assert.ok(result.changedJob);
  assert.equal(result.previousTechnician, 'David Miller');
  assert.equal(result.assignedTechnician, 'Sarah Connor');
  assert.equal(result.changedJob.technician, 'Sarah Connor');
  assert.match(
    result.changedJob.diagnosticNotes || '',
    /\[ASSIGNED 2026-11-22 02:05 -> Sarah Connor\] Reassigned from David Miller via Notifications Center\./
  );
  assert.equal(result.changedJob.auditLogs?.[0].action, 'TECHNICIAN_ASSIGNED');
  assert.equal(result.changedJob.auditLogs?.[0].previousState, 'David Miller');
  assert.equal(result.changedJob.auditLogs?.[0].newState, 'Sarah Connor');
  assert.equal(result.updatedJobs[1].technician, 'Marcus Vance');
});

test('sortTaskNotifications supports priority, oldest first, and newest first ordering without mutating input', () => {
  const nowMs = Date.parse('2026-11-22T12:00:00.000Z');

  const olderWarning = makeJob({
    id: 'BOSCH-2026-9101',
    status: 'Awaiting Approval',
    priority: 'Medium',
    stageEnteredAt: '2026-11-18T08:00:00.000Z',
    updatedAt: '2026-11-18T08:00:00.000Z',
    promisedCompletion: '2026-11-30 17:00',
  });

  const midCritical = makeJob({
    id: 'BOSCH-2026-9102',
    status: 'In Repair',
    priority: 'High',
    stageEnteredAt: '2026-11-10T08:00:00.000Z',
    updatedAt: '2026-11-20T09:00:00.000Z',
    promisedCompletion: '2026-11-30 17:00',
  });

  const newestHighPriority = makeJob({
    id: 'BOSCH-2026-9103',
    status: 'Intake',
    priority: 'High',
    stageEnteredAt: '2026-11-22T10:30:00.000Z',
    updatedAt: '2026-11-22T10:30:00.000Z',
    promisedCompletion: '2026-11-30 17:00',
  });

  const items = buildTaskNotificationItems(
    [olderWarning, midCritical, newestHighPriority],
    nowMs
  );

  // Default priority order places critical alert first, then High priority ahead of Medium warning
  assert.deepEqual(
    items.map((item) => item.job.id),
    ['BOSCH-2026-9102', 'BOSCH-2026-9103', 'BOSCH-2026-9101']
  );

  const oldestFirst = sortTaskNotifications(items, 'oldest');
  assert.deepEqual(
    oldestFirst.map((item) => item.job.id),
    ['BOSCH-2026-9101', 'BOSCH-2026-9102', 'BOSCH-2026-9103']
  );

  const newestFirst = sortTaskNotifications(items, 'newest');
  assert.deepEqual(
    newestFirst.map((item) => item.job.id),
    ['BOSCH-2026-9103', 'BOSCH-2026-9102', 'BOSCH-2026-9101']
  );

  // Ensure input array wasn't mutated
  assert.deepEqual(
    items.map((item) => item.job.id),
    ['BOSCH-2026-9102', 'BOSCH-2026-9103', 'BOSCH-2026-9101']
  );
});
