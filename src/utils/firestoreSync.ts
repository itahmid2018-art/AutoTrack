import { User } from 'firebase/auth';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  BusinessSettings,
  CustomField,
  InventoryItem,
  JobCard,
  JobStatus,
  RecurringMaintenance,
} from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ensurePublicAccessToken } from './customerPortalUrl';
import { normalizeJobPriority } from './priority';
import { PublicJobStatusSummary } from '../components/CustomerView';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'gurujiytube@gmail.com';
export const DEFAULT_WORKSHOP_ID = 'workshop-default';
export const DEFAULT_SETTINGS_DOC_ID = 'workshop-default';

const VALID_JOB_STATUSES = new Set<JobStatus>([
  'Intake',
  'Diagnosis',
  'Awaiting Approval',
  'Awaiting Parts',
  'In Repair',
  'In Service',
  'Ready for Pickup',
  'Completed',
  'Cancelled',
]);

const VALID_INVENTORY_UNITS = new Set([
  'pcs',
  'sets',
  'bottles',
  'boxes',
  'pairs',
  'meters',
]);

const VALID_FIELD_TYPES = new Set([
  'text',
  'number',
  'select',
  'date',
  'boolean',
  'textarea',
]);

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Timestamp)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

export function sanitizeDocId(raw: string, fallback = 'doc'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128);
  return cleaned || fallback;
}

function clampString(value: unknown, maxLen: number, fallback = ''): string {
  if (typeof value !== 'string') {
    return fallback.slice(0, maxLen);
  }
  const trimmed = value.trim();
  if (!trimmed && fallback) {
    return fallback.slice(0, maxLen);
  }
  return trimmed.slice(0, maxLen);
}

function clampNumber(value: unknown, min: number, max: number, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeCustomFieldValues(
  values: Record<string, string | number | boolean> | undefined
): Record<string, string | number | boolean> | undefined {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return undefined;
  const entries = Object.entries(values).slice(0, 30);
  const cleaned: Record<string, string | number | boolean> = {};
  for (const [k, v] of entries) {
    const cleanKey = clampString(k, 64);
    if (!cleanKey) continue;
    if (typeof v === 'boolean') {
      cleaned[cleanKey] = v;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      cleaned[cleanKey] = v;
    } else if (typeof v === 'string') {
      cleaned[cleanKey] = v.slice(0, 500);
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function sanitizeMessageLogsForFirestore(logs: JobCard['messageLogs'] | undefined) {
  return (logs || []).slice(0, 50).map((m) => ({
    ...m,
    status: m.status === 'Pending' ? 'Pending' : 'Sent',
  }));
}

function normalizeStaffUids(ownerUid: string, extraUids: string[] = []): string[] {
  const merged = Array.from(
    new Set([ownerUid, ...extraUids].map((u) => sanitizeDocId(u)).filter(Boolean))
  );
  return merged.slice(0, 20);
}

function timestampToIso(val: unknown, fallback?: string): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (val && typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string' && val.trim()) {
    return val;
  }
  return fallback || new Date().toISOString();
}

export function isBootstrappedAdminUser(user: User | null | undefined): boolean {
  return Boolean(
    user &&
      user.emailVerified &&
      user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
  );
}

function buildPublicDeliveryCreatePayload(
  job: JobCard,
  ownerUid: string,
  staffUids: string[]
) {
  const token = sanitizeDocId(ensurePublicAccessToken(job), `tok-${sanitizeDocId(job.id)}`);
  const warrantyFlag =
    job.tool.warrantyFlag ||
    job.tool.warrantyAdjudication?.flag ||
    (job.tool.warrantyStatus === 'Out of Warranty' ? 'Out-of-Warranty' : 'In-Warranty');

  const basePayload: Record<string, unknown> = {
    token,
    ownerUid,
    staffUids,
    jobId: sanitizeDocId(job.id),
    status: clampString(job.status, 40, 'Intake'),
    toolBrand: clampString(job.tool?.brand, 80, 'Bosch Professional'),
    toolModel: clampString(job.tool?.modelNumber, 120, 'Power Tool'),
    warrantyFlag: clampString(warrantyFlag, 40),
    intakeDate: clampString(job.intakeDate, 40, new Date().toISOString().slice(0, 16).replace('T', ' ')),
    promisedCompletion: clampString(
      job.promisedCompletion,
      40,
      new Date(Date.now() + 86400000).toISOString().slice(0, 16).replace('T', ' ')
    ),
    totalAmount: clampNumber(job.totalAmount, 0, 1000000, 0),
    readyForDelivery: job.status === 'Ready for Pickup' || job.status === 'Completed',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (job.customerFeedback) {
    basePayload.feedbackSubmitted = true;
    basePayload.feedbackRating = clampNumber(job.customerFeedback.rating, 1, 5, 5);
    basePayload.feedbackComment = clampString(job.customerFeedback.comment, 1000);
    basePayload.feedbackSubmittedAt = clampString(job.customerFeedback.submittedAt, 40);
  }

  return stripUndefined(basePayload) as typeof basePayload & { token: string };
}

function buildPublicDeliveryUpdatePatch(job: JobCard, staffUids: string[]) {
  const warrantyFlag =
    job.tool.warrantyFlag ||
    job.tool.warrantyAdjudication?.flag ||
    (job.tool.warrantyStatus === 'Out of Warranty' ? 'Out-of-Warranty' : 'In-Warranty');

  const patch: Record<string, unknown> = {
    status: clampString(job.status, 40, 'Intake'),
    toolBrand: clampString(job.tool?.brand, 80, 'Bosch Professional'),
    toolModel: clampString(job.tool?.modelNumber, 120, 'Power Tool'),
    warrantyFlag: clampString(warrantyFlag, 40),
    promisedCompletion: clampString(
      job.promisedCompletion,
      40,
      new Date(Date.now() + 86400000).toISOString().slice(0, 16).replace('T', ' ')
    ),
    totalAmount: clampNumber(job.totalAmount, 0, 1000000, 0),
    readyForDelivery: job.status === 'Ready for Pickup' || job.status === 'Completed',
    staffUids,
    updatedAt: serverTimestamp(),
  };

  if (job.customerFeedback) {
    patch.feedbackSubmitted = true;
    patch.feedbackRating = clampNumber(job.customerFeedback.rating, 1, 5, 5);
    patch.feedbackComment = clampString(job.customerFeedback.comment, 1000);
    patch.feedbackSubmittedAt = clampString(job.customerFeedback.submittedAt, 40);
  }

  return stripUndefined(patch);
}

export function buildJobCardCreatePayload(
  job: JobCard,
  ownerUid: string,
  staffUids: string[]
) {
  const token = sanitizeDocId(ensurePublicAccessToken(job), `tok-${sanitizeDocId(job.id)}`);
  const nowIso = new Date().toISOString();
  const cleanStatus: JobStatus = VALID_JOB_STATUSES.has(job.status) ? job.status : 'Intake';

  const payload: Record<string, unknown> = {
    id: sanitizeDocId(job.id),
    ownerUid,
    staffUids,
    customerName: clampString(job.customerName, 160, 'Walk-in Client'),
    customerPhone: clampString(job.customerPhone, 40, '000-0000'),
    tool: stripUndefined(job.tool),
    serviceReq: stripUndefined(job.serviceReq),
    intakeDate: clampString(job.intakeDate, 40, nowIso.slice(0, 16).replace('T', ' ')),
    promisedCompletion: clampString(
      job.promisedCompletion,
      40,
      new Date(Date.now() + 86400000).toISOString().slice(0, 16).replace('T', ' ')
    ),
    status: cleanStatus,
    priority: normalizeJobPriority(job.priority),
    technician: clampString(job.technician, 120, 'Workshop Technician'),
    laborHours: clampNumber(job.laborHours, 0, 1000, 0),
    laborRate: clampNumber(job.laborRate, 0, 10000, 45),
    discount: clampNumber(job.discount, 0, 100000, 0),
    taxRate: clampNumber(job.taxRate, 0, 100, 0),
    parts: stripUndefined((job.parts || []).slice(0, 50)),
    totalAmount: clampNumber(job.totalAmount, 0, 1000000, 0),
    messageLogs: stripUndefined(sanitizeMessageLogsForFirestore(job.messageLogs)),
    publicAccessToken: token,
    createdAtIso: clampString(job.createdAt, 40, nowIso),
    updatedAtIso: clampString(job.updatedAt, 40, nowIso),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (job.customerCompany?.trim()) payload.customerCompany = clampString(job.customerCompany, 160);
  if (job.customerEmail?.trim()) payload.customerEmail = clampString(job.customerEmail, 254);
  if (job.gstOrTaxId?.trim()) payload.gstOrTaxId = clampString(job.gstOrTaxId, 64);
  if (job.diagnosticNotes !== undefined) payload.diagnosticNotes = clampString(job.diagnosticNotes, 8000);
  if (Array.isArray(job.recommendedActions)) payload.recommendedActions = job.recommendedActions.slice(0, 20);
  if (Array.isArray(job.operationalExpenses)) payload.operationalExpenses = stripUndefined(job.operationalExpenses.slice(0, 30));
  if (job.customerSignature && job.customerSignature.length <= 120000) payload.customerSignature = job.customerSignature;
  if (job.technicianSignature && job.technicianSignature.length <= 120000) payload.technicianSignature = job.technicianSignature;
  if (job.technicianSignOffBy?.trim()) payload.technicianSignOffBy = clampString(job.technicianSignOffBy, 120);
  if (job.technicianSignOffAt?.trim()) payload.technicianSignOffAt = clampString(job.technicianSignOffAt, 40);
  if (job.technicianSignOffNotes?.trim()) payload.technicianSignOffNotes = clampString(job.technicianSignOffNotes, 2000);
  if (Array.isArray(job.attachments)) payload.attachments = stripUndefined(job.attachments.slice(0, 6));
  if (Array.isArray(job.timeLogs)) payload.timeLogs = stripUndefined(job.timeLogs.slice(0, 50));
  if (Array.isArray(job.auditLogs)) payload.auditLogs = stripUndefined(job.auditLogs.slice(0, 50));
  if (Array.isArray(job.photos)) payload.photos = stripUndefined(job.photos.slice(0, 6));
  if (Array.isArray(job.subletRecords)) payload.subletRecords = stripUndefined(job.subletRecords.slice(0, 20));
  if (job.stockDeductedAt?.trim()) payload.stockDeductedAt = clampString(job.stockDeductedAt, 40);
  if (Array.isArray(job.partsDeducted) && job.partsDeducted.length > 0) {
    payload.partsDeducted = stripUndefined(job.partsDeducted.slice(0, 50));
  }
  const cleanCustomFieldValues = sanitizeCustomFieldValues(job.customFieldValues);
  if (cleanCustomFieldValues) {
    payload.customFieldValues = cleanCustomFieldValues;
  }
  if (job.customerFeedback) {
    payload.customerFeedback = stripUndefined({
      rating: clampNumber(job.customerFeedback.rating, 1, 5, 5),
      comment: clampString(job.customerFeedback.comment, 1000),
      submittedAt: clampString(job.customerFeedback.submittedAt, 40, nowIso),
      ...(job.customerFeedback.channel ? { channel: job.customerFeedback.channel === 'Portal' ? 'Portal' : 'SMS' } : {}),
      ...(job.customerFeedback.customerName?.trim() ? { customerName: clampString(job.customerFeedback.customerName, 160) } : {}),
      ...(job.customerFeedback.smsSentAt?.trim() ? { smsSentAt: clampString(job.customerFeedback.smsSentAt, 40) } : {}),
      ...(job.customerFeedback.smsStatus?.trim() ? { smsStatus: clampString(job.customerFeedback.smsStatus, 60) } : {}),
    });
  }
  if (job.feedbackSmsSentAt?.trim()) payload.feedbackSmsSentAt = clampString(job.feedbackSmsSentAt, 40);
  if (job.stageEnteredAt?.trim()) payload.stageEnteredAt = clampString(job.stageEnteredAt, 40);
  if (Array.isArray(job.stageHistory)) payload.stageHistory = stripUndefined(job.stageHistory.slice(0, 20));

  return stripUndefined(payload);
}

export function buildJobCardUpdatePatch(job: JobCard, staffUids: string[]) {
  const nowIso = new Date().toISOString();
  const cleanStatus: JobStatus = VALID_JOB_STATUSES.has(job.status) ? job.status : 'Intake';

  const patch: Record<string, unknown> = {
    status: cleanStatus,
    priority: normalizeJobPriority(job.priority),
    technician: clampString(job.technician, 120, 'Workshop Technician'),
    laborHours: clampNumber(job.laborHours, 0, 1000, 0),
    laborRate: clampNumber(job.laborRate, 0, 10000, 45),
    discount: clampNumber(job.discount, 0, 100000, 0),
    taxRate: clampNumber(job.taxRate, 0, 100, 0),
    parts: stripUndefined((job.parts || []).slice(0, 50)),
    totalAmount: clampNumber(job.totalAmount, 0, 1000000, 0),
    messageLogs: stripUndefined(sanitizeMessageLogsForFirestore(job.messageLogs)),
    promisedCompletion: clampString(
      job.promisedCompletion,
      40,
      new Date(Date.now() + 86400000).toISOString().slice(0, 16).replace('T', ' ')
    ),
    tool: stripUndefined(job.tool),
    serviceReq: stripUndefined(job.serviceReq),
    staffUids,
    updatedAtIso: clampString(job.updatedAt, 40, nowIso),
    updatedAt: serverTimestamp(),
  };

  if (job.diagnosticNotes !== undefined) patch.diagnosticNotes = clampString(job.diagnosticNotes, 8000);
  if (Array.isArray(job.recommendedActions)) patch.recommendedActions = job.recommendedActions.slice(0, 20);
  if (Array.isArray(job.operationalExpenses)) patch.operationalExpenses = stripUndefined(job.operationalExpenses.slice(0, 30));
  if (job.customerSignature && job.customerSignature.length <= 120000) patch.customerSignature = job.customerSignature;
  if (job.technicianSignature && job.technicianSignature.length <= 120000) patch.technicianSignature = job.technicianSignature;
  if (job.technicianSignOffBy?.trim()) patch.technicianSignOffBy = clampString(job.technicianSignOffBy, 120);
  if (job.technicianSignOffAt?.trim()) patch.technicianSignOffAt = clampString(job.technicianSignOffAt, 40);
  if (job.technicianSignOffNotes?.trim()) patch.technicianSignOffNotes = clampString(job.technicianSignOffNotes, 2000);
  if (Array.isArray(job.attachments)) patch.attachments = stripUndefined(job.attachments.slice(0, 6));
  if (Array.isArray(job.timeLogs)) patch.timeLogs = stripUndefined(job.timeLogs.slice(0, 50));
  if (Array.isArray(job.auditLogs)) patch.auditLogs = stripUndefined(job.auditLogs.slice(0, 50));
  if (Array.isArray(job.photos)) patch.photos = stripUndefined(job.photos.slice(0, 6));
  if (Array.isArray(job.subletRecords)) patch.subletRecords = stripUndefined(job.subletRecords.slice(0, 20));
  if (job.stockDeductedAt?.trim()) {
    patch.stockDeductedAt = clampString(job.stockDeductedAt, 40);
  } else {
    patch.stockDeductedAt = deleteField();
  }
  if (Array.isArray(job.partsDeducted) && job.partsDeducted.length > 0) {
    patch.partsDeducted = stripUndefined(job.partsDeducted.slice(0, 50));
  } else {
    patch.partsDeducted = deleteField();
  }
  const cleanCustomFieldValues = sanitizeCustomFieldValues(job.customFieldValues);
  if (cleanCustomFieldValues) {
    patch.customFieldValues = cleanCustomFieldValues;
  }
  if (job.customerFeedback) {
    patch.customerFeedback = stripUndefined({
      rating: clampNumber(job.customerFeedback.rating, 1, 5, 5),
      comment: clampString(job.customerFeedback.comment, 1000),
      submittedAt: clampString(job.customerFeedback.submittedAt, 40, nowIso),
      ...(job.customerFeedback.channel ? { channel: job.customerFeedback.channel === 'Portal' ? 'Portal' : 'SMS' } : {}),
      ...(job.customerFeedback.customerName?.trim() ? { customerName: clampString(job.customerFeedback.customerName, 160) } : {}),
      ...(job.customerFeedback.smsSentAt?.trim() ? { smsSentAt: clampString(job.customerFeedback.smsSentAt, 40) } : {}),
      ...(job.customerFeedback.smsStatus?.trim() ? { smsStatus: clampString(job.customerFeedback.smsStatus, 60) } : {}),
    });
  }
  if (job.feedbackSmsSentAt?.trim()) patch.feedbackSmsSentAt = clampString(job.feedbackSmsSentAt, 40);
  if (job.stageEnteredAt?.trim()) patch.stageEnteredAt = clampString(job.stageEnteredAt, 40);
  if (Array.isArray(job.stageHistory)) patch.stageHistory = stripUndefined(job.stageHistory.slice(0, 20));

  return stripUndefined(patch);
}

export function buildInventoryCreatePayload(
  item: InventoryItem,
  ownerUid: string,
  staffUids: string[]
) {
  const unit = VALID_INVENTORY_UNITS.has(item.unit) ? item.unit : 'pcs';
  return stripUndefined({
    id: sanitizeDocId(item.id),
    ownerUid,
    staffUids,
    sku: clampString(item.sku, 64, 'SKU-ITEM'),
    barcode: clampString(item.barcode, 64, item.sku || '000000'),
    name: clampString(item.name, 200, 'Spare Part'),
    category: clampString(item.category, 120, 'General Parts'),
    brand: clampString(item.brand, 120, 'Bosch'),
    compatibleModels: clampString(item.compatibleModels, 500, 'Universal'),
    unitPrice: clampNumber(item.unitPrice, 0, 1000000, 0),
    costPrice: clampNumber(item.costPrice, 0, 1000000, 0),
    stockQty: clampNumber(item.stockQty, 0, 1000000, 0),
    minStockThreshold: clampNumber(item.minStockThreshold, 0, 1000000, 0),
    unit,
    binLocation: clampString(item.binLocation, 64, 'Bin A-01'),
    lastRestocked: clampString(item.lastRestocked, 40, new Date().toISOString().split('T')[0]),
    ...(item.lowStockTimestamp?.trim()
      ? { lowStockTimestamp: clampString(item.lowStockTimestamp, 40) }
      : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function buildInventoryUpdatePatch(item: InventoryItem, staffUids: string[]) {
  const unit = VALID_INVENTORY_UNITS.has(item.unit) ? item.unit : 'pcs';
  return stripUndefined({
    sku: clampString(item.sku, 64, 'SKU-ITEM'),
    barcode: clampString(item.barcode, 64, item.sku || '000000'),
    name: clampString(item.name, 200, 'Spare Part'),
    category: clampString(item.category, 120, 'General Parts'),
    brand: clampString(item.brand, 120, 'Bosch'),
    compatibleModels: clampString(item.compatibleModels, 500, 'Universal'),
    unitPrice: clampNumber(item.unitPrice, 0, 1000000, 0),
    costPrice: clampNumber(item.costPrice, 0, 1000000, 0),
    stockQty: clampNumber(item.stockQty, 0, 1000000, 0),
    minStockThreshold: clampNumber(item.minStockThreshold, 0, 1000000, 0),
    unit,
    binLocation: clampString(item.binLocation, 64, 'Bin A-01'),
    lastRestocked: clampString(item.lastRestocked, 40, new Date().toISOString().split('T')[0]),
    ...(item.lowStockTimestamp?.trim()
      ? { lowStockTimestamp: clampString(item.lowStockTimestamp, 40) }
      : {}),
    staffUids,
    updatedAt: serverTimestamp(),
  });
}

export function buildScheduleCreatePayload(
  schedule: RecurringMaintenance,
  ownerUid: string,
  staffUids: string[]
) {
  const nowIso = new Date().toISOString();
  const payload: Record<string, unknown> = {
    id: sanitizeDocId(schedule.id),
    ownerUid,
    staffUids,
    customerName: clampString(schedule.customerName, 160, 'Client'),
    customerPhone: clampString(schedule.customerPhone, 40, '000-0000'),
    toolBrand: clampString(schedule.toolBrand, 80, 'Bosch Professional'),
    toolCategory: clampString(schedule.toolCategory, 80, 'Power Tool'),
    modelNumber: clampString(schedule.modelNumber, 120, 'Power Tool'),
    serialNumber: clampString(schedule.serialNumber, 80, 'SN-000'),
    intervalMonths: clampNumber(schedule.intervalMonths, 1, 60, 6),
    lastServiceDate: clampString(schedule.lastServiceDate, 40, nowIso.slice(0, 10)),
    nextDueDate: clampString(schedule.nextDueDate, 40, nowIso.slice(0, 10)),
    status: ['Upcoming', 'Due Soon', 'Overdue', 'Serviced'].includes(schedule.status)
      ? schedule.status
      : 'Upcoming',
    recommendedServiceScope: clampString(
      schedule.recommendedServiceScope,
      400,
      'Routine inspection and overhaul'
    ),
    queuedReminders: stripUndefined((schedule.queuedReminders || []).slice(0, 50)),
    createdAtIso: clampString(schedule.createdAt, 40, nowIso),
    updatedAtIso: clampString(schedule.updatedAt, 40, nowIso),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (schedule.customerCompany?.trim()) payload.customerCompany = clampString(schedule.customerCompany, 160);
  if (schedule.customerEmail?.trim()) payload.customerEmail = clampString(schedule.customerEmail, 254);
  if (schedule.notes?.trim()) payload.notes = clampString(schedule.notes, 2000);
  return stripUndefined(payload);
}

export function buildScheduleUpdatePatch(schedule: RecurringMaintenance, staffUids: string[]) {
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: ['Upcoming', 'Due Soon', 'Overdue', 'Serviced'].includes(schedule.status)
      ? schedule.status
      : 'Upcoming',
    lastServiceDate: clampString(schedule.lastServiceDate, 40, nowIso.slice(0, 10)),
    nextDueDate: clampString(schedule.nextDueDate, 40, nowIso.slice(0, 10)),
    intervalMonths: clampNumber(schedule.intervalMonths, 1, 60, 6),
    recommendedServiceScope: clampString(
      schedule.recommendedServiceScope,
      400,
      'Routine inspection and overhaul'
    ),
    queuedReminders: stripUndefined((schedule.queuedReminders || []).slice(0, 50)),
    staffUids,
    updatedAtIso: clampString(schedule.updatedAt, 40, nowIso),
    updatedAt: serverTimestamp(),
  };
  if (schedule.notes !== undefined) patch.notes = clampString(schedule.notes, 2000);
  return stripUndefined(patch);
}

export function buildSettingsCreatePayload(
  settings: BusinessSettings,
  ownerUid: string,
  staffUids: string[]
) {
  const payload: Record<string, unknown> = {
    id: DEFAULT_SETTINGS_DOC_ID,
    ownerUid,
    staffUids,
    centerName: clampString(settings.centerName, 160, 'BOSCH Authorised Service Center'),
    taxRate: clampNumber(settings.taxRate, 0, 100, 10),
    laborRate: clampNumber(settings.laborRate, 0, 10000, 45),
    deductStockOn: ['Approval', 'InService', 'Completion'].includes(settings.deductStockOn)
      ? settings.deductStockOn
      : 'InService',
    requireSignature: Boolean(settings.requireSignature),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (settings.address !== undefined) payload.address = clampString(settings.address, 240);
  if (settings.phone !== undefined) payload.phone = clampString(settings.phone, 40);
  if (settings.email !== undefined) payload.email = clampString(settings.email, 254);
  if (settings.jobCardPrefix !== undefined) payload.jobCardPrefix = clampString(settings.jobCardPrefix, 32);
  if (settings.currencySymbol !== undefined) payload.currencySymbol = clampString(settings.currencySymbol, 8);
  if (settings.WhatsAppTemplateIntake !== undefined) payload.WhatsAppTemplateIntake = clampString(settings.WhatsAppTemplateIntake, 1000);
  if (settings.WhatsAppTemplateReady !== undefined) payload.WhatsAppTemplateReady = clampString(settings.WhatsAppTemplateReady, 1000);
  if (settings.WhatsAppTemplateEstimate !== undefined) payload.WhatsAppTemplateEstimate = clampString(settings.WhatsAppTemplateEstimate, 1000);
  if (settings.autoSendFeedbackSms !== undefined) payload.autoSendFeedbackSms = Boolean(settings.autoSendFeedbackSms);
  if (settings.autoDailyBackupEnabled !== undefined) payload.autoDailyBackupEnabled = Boolean(settings.autoDailyBackupEnabled);
  if (settings.autoDailyBackupDestination !== undefined) payload.autoDailyBackupDestination = clampString(settings.autoDailyBackupDestination, 32);
  if (settings.lastAutoBackupDate !== undefined) payload.lastAutoBackupDate = clampString(settings.lastAutoBackupDate, 40);
  if (settings.analyticsMetrics) payload.analyticsMetrics = stripUndefined(settings.analyticsMetrics);
  return stripUndefined(payload);
}

export function buildSettingsUpdatePatch(settings: BusinessSettings, staffUids: string[]) {
  const patch: Record<string, unknown> = {
    centerName: clampString(settings.centerName, 160, 'BOSCH Authorised Service Center'),
    taxRate: clampNumber(settings.taxRate, 0, 100, 10),
    laborRate: clampNumber(settings.laborRate, 0, 10000, 45),
    deductStockOn: ['Approval', 'InService', 'Completion'].includes(settings.deductStockOn)
      ? settings.deductStockOn
      : 'InService',
    requireSignature: Boolean(settings.requireSignature),
    staffUids,
    updatedAt: serverTimestamp(),
  };
  if (settings.address !== undefined) patch.address = clampString(settings.address, 240);
  if (settings.phone !== undefined) patch.phone = clampString(settings.phone, 40);
  if (settings.email !== undefined) patch.email = clampString(settings.email, 254);
  if (settings.jobCardPrefix !== undefined) patch.jobCardPrefix = clampString(settings.jobCardPrefix, 32);
  if (settings.currencySymbol !== undefined) patch.currencySymbol = clampString(settings.currencySymbol, 8);
  if (settings.WhatsAppTemplateIntake !== undefined) patch.WhatsAppTemplateIntake = clampString(settings.WhatsAppTemplateIntake, 1000);
  if (settings.WhatsAppTemplateReady !== undefined) patch.WhatsAppTemplateReady = clampString(settings.WhatsAppTemplateReady, 1000);
  if (settings.WhatsAppTemplateEstimate !== undefined) patch.WhatsAppTemplateEstimate = clampString(settings.WhatsAppTemplateEstimate, 1000);
  if (settings.autoSendFeedbackSms !== undefined) patch.autoSendFeedbackSms = Boolean(settings.autoSendFeedbackSms);
  if (settings.autoDailyBackupEnabled !== undefined) patch.autoDailyBackupEnabled = Boolean(settings.autoDailyBackupEnabled);
  if (settings.autoDailyBackupDestination !== undefined) patch.autoDailyBackupDestination = clampString(settings.autoDailyBackupDestination, 32);
  if (settings.lastAutoBackupDate !== undefined) patch.lastAutoBackupDate = clampString(settings.lastAutoBackupDate, 40);
  if (settings.analyticsMetrics) patch.analyticsMetrics = stripUndefined(settings.analyticsMetrics);
  return stripUndefined(patch);
}

export function buildCustomFieldCreatePayload(
  field: CustomField,
  ownerUid: string,
  staffUids: string[]
) {
  const payload: Record<string, unknown> = {
    id: sanitizeDocId(field.id),
    ownerUid,
    staffUids,
    label: clampString(field.label, 120, 'Custom Field'),
    key: clampString(field.key, 64, 'customField'),
    dataType: VALID_FIELD_TYPES.has(field.dataType) ? field.dataType : 'text',
    category: clampString(field.category, 80, 'Customer Information'),
    required: Boolean(field.required),
    enabled: Boolean(field.enabled),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (field.placeholder !== undefined) payload.placeholder = clampString(field.placeholder, 200);
  if (Array.isArray(field.options)) payload.options = field.options.slice(0, 30);
  if (field.isSystem !== undefined) payload.isSystem = Boolean(field.isSystem);
  return stripUndefined(payload);
}

export function buildCustomFieldUpdatePatch(field: CustomField, staffUids: string[]) {
  const patch: Record<string, unknown> = {
    label: clampString(field.label, 120, 'Custom Field'),
    required: Boolean(field.required),
    enabled: Boolean(field.enabled),
    staffUids,
    updatedAt: serverTimestamp(),
  };
  if (field.placeholder !== undefined) patch.placeholder = clampString(field.placeholder, 200);
  if (Array.isArray(field.options)) patch.options = field.options.slice(0, 30);
  return stripUndefined(patch);
}

export async function upsertWorkshopUser(user: User): Promise<void> {
  if (!user.emailVerified) return;

  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'profile');

  try {
    const existingPublic = await getDoc(userRef);
    const displayName = clampString(
      user.displayName || user.email?.split('@')[0] || 'Workshop Operator',
      120,
      'Workshop Operator'
    );

    if (!existingPublic.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName,
        role: 'Technician',
        workshopId: DEFAULT_WORKSHOP_ID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        displayName,
        workshopId: DEFAULT_WORKSHOP_ID,
        updatedAt: serverTimestamp(),
      });
    }

    if (user.email) {
      const existingPrivate = await getDoc(privateRef);
      if (!existingPrivate.exists()) {
        await setDoc(privateRef, {
          uid: user.uid,
          email: clampString(user.email, 254),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(privateRef, {
          email: clampString(user.email, 254),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
  }
}

export async function seedWorkshopIfEmpty(
  user: User,
  teamUids: string[],
  defaults: {
    jobCards: JobCard[];
    inventory: InventoryItem[];
    schedules: RecurringMaintenance[];
    settings: BusinessSettings;
    customFields: CustomField[];
  }
): Promise<void> {
  if (!user.emailVerified) return;

  const ownerUid = user.uid;
  const staffUids = normalizeStaffUids(ownerUid, teamUids);
  const settingsRef = doc(db, 'settings', DEFAULT_SETTINGS_DOC_ID);

  try {
    const existingSettings = await getDoc(settingsRef);
    if (existingSettings.exists()) {
      return;
    }

    const batch = writeBatch(db);

    batch.set(settingsRef, buildSettingsCreatePayload(defaults.settings, ownerUid, staffUids));

    for (const job of defaults.jobCards) {
      const jobId = sanitizeDocId(job.id);
      const jobRef = doc(db, 'jobCards', jobId);
      const pubPayload = buildPublicDeliveryCreatePayload(job, ownerUid, staffUids);
      const pubRef = doc(db, 'publicDeliveries', pubPayload.token);

      batch.set(jobRef, buildJobCardCreatePayload(job, ownerUid, staffUids));
      batch.set(pubRef, pubPayload);
    }

    for (const sched of defaults.schedules) {
      const schedRef = doc(db, 'schedules', sanitizeDocId(sched.id));
      batch.set(schedRef, buildScheduleCreatePayload(sched, ownerUid, staffUids));
    }

    for (const field of defaults.customFields) {
      const fieldRef = doc(db, 'customFields', sanitizeDocId(field.id));
      batch.set(fieldRef, buildCustomFieldCreatePayload(field, ownerUid, staffUids));
    }

    // Seed core inventory items referenced by tickets plus initial 25 SKUs to conserve Spark quota
    const referencedIds = new Set<string>();
    defaults.jobCards.forEach((j) =>
      j.parts?.forEach((p) => {
        if (p.partId) referencedIds.add(p.partId);
      })
    );
    const seedInventory = defaults.inventory.filter(
      (item, idx) => idx < 25 || referencedIds.has(item.id)
    );
    for (const item of seedInventory) {
      const itemRef = doc(db, 'inventory', sanitizeDocId(item.id));
      batch.set(itemRef, buildInventoryCreatePayload(item, ownerUid, staffUids));
    }

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/workshop-default');
  }
}

function docToJobCard(raw: Record<string, unknown>): JobCard {
  const createdAt =
    typeof raw.createdAtIso === 'string' && raw.createdAtIso
      ? raw.createdAtIso
      : timestampToIso(raw.createdAt);
  const updatedAt =
    typeof raw.updatedAtIso === 'string' && raw.updatedAtIso
      ? raw.updatedAtIso
      : timestampToIso(raw.updatedAt, createdAt);

  const rawObj = raw as unknown as JobCard;
  return {
    ...rawObj,
    priority: normalizeJobPriority(rawObj.priority),
    createdAt,
    updatedAt,
  };
}

function docToSchedule(raw: Record<string, unknown>): RecurringMaintenance {
  const createdAt =
    typeof raw.createdAtIso === 'string' && raw.createdAtIso
      ? raw.createdAtIso
      : timestampToIso(raw.createdAt);
  const updatedAt =
    typeof raw.updatedAtIso === 'string' && raw.updatedAtIso
      ? raw.updatedAtIso
      : timestampToIso(raw.updatedAt, createdAt);

  return {
    ...(raw as unknown as RecurringMaintenance),
    createdAt,
    updatedAt,
  };
}

export function subscribeWorkshopData(
  user: User,
  callbacks: {
    onJobCards: (jobs: JobCard[]) => void;
    onJobSyncMetadata?: (meta: {
      pendingWritesById: Record<string, boolean>;
      confirmedIds: string[];
      fromCache: boolean;
    }) => void;
    onInventoryItems: (items: InventoryItem[]) => void;
    onSchedules: (schedules: RecurringMaintenance[]) => void;
    onSettings: (settings: Partial<BusinessSettings>) => void;
    onCustomFields: (fields: CustomField[]) => void;
    onError?: (error: Error) => void;
  }
): Unsubscribe {
  const adminMode = isBootstrappedAdminUser(user);

  const buildCollectionQuery = (collectionName: string) => {
    const colRef = collection(db, collectionName);
    return adminMode ? colRef : query(colRef, where('staffUids', 'array-contains', user.uid));
  };

  const reportError = (err: unknown, op: OperationType, path: string) => {
    try {
      handleFirestoreError(err, op, path);
    } catch (wrapped) {
      callbacks.onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
    }
  };

  const unsubJobs = onSnapshot(
    buildCollectionQuery('jobCards'),
    { includeMetadataChanges: true },
    (snap) => {
      const pendingWritesById: Record<string, boolean> = {};
      const confirmedIds: string[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        const cardId = typeof data.id === 'string' && data.id ? data.id : d.id;
        const hasPending = Boolean(d.metadata.hasPendingWrites);
        pendingWritesById[cardId] = hasPending;
        if (!hasPending && !snap.metadata.fromCache) {
          confirmedIds.push(cardId);
        }
      }
      callbacks.onJobSyncMetadata?.({
        pendingWritesById,
        confirmedIds,
        fromCache: snap.metadata.fromCache,
      });

      if (snap.empty) return;
      const list = snap.docs
        .map((d) => docToJobCard(d.data()))
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      callbacks.onJobCards(list);
    },
    (err) => reportError(err, OperationType.LIST, 'jobCards')
  );

  const unsubInventory = onSnapshot(
    buildCollectionQuery('inventory'),
    (snap) => {
      if (snap.empty) return;
      const list = snap.docs.map((d) => d.data() as InventoryItem);
      callbacks.onInventoryItems(list);
    },
    (err) => reportError(err, OperationType.LIST, 'inventory')
  );

  const unsubSchedules = onSnapshot(
    buildCollectionQuery('schedules'),
    (snap) => {
      if (snap.empty) return;
      const list = snap.docs.map((d) => docToSchedule(d.data()));
      callbacks.onSchedules(list);
    },
    (err) => reportError(err, OperationType.LIST, 'schedules')
  );

  const unsubSettings = onSnapshot(
    buildCollectionQuery('settings'),
    (snap) => {
      if (snap.empty) return;
      const docMatch =
        snap.docs.find((d) => d.id === DEFAULT_SETTINGS_DOC_ID) || snap.docs[0];
      if (docMatch) {
        callbacks.onSettings(docMatch.data() as Partial<BusinessSettings>);
      }
    },
    (err) => reportError(err, OperationType.LIST, 'settings')
  );

  const unsubFields = onSnapshot(
    buildCollectionQuery('customFields'),
    (snap) => {
      if (snap.empty) return;
      const list = snap.docs.map((d) => d.data() as CustomField);
      callbacks.onCustomFields(list);
    },
    (err) => reportError(err, OperationType.LIST, 'customFields')
  );

  return () => {
    unsubJobs();
    unsubInventory();
    unsubSchedules();
    unsubSettings();
    unsubFields();
  };
}

export async function upsertJobCardInFirestore(
  job: JobCard,
  user: User,
  teamUids: string[] = []
): Promise<void> {
  if (!user.emailVerified) return;
  const jobId = sanitizeDocId(job.id);
  const jobRef = doc(db, 'jobCards', jobId);
  const staffUids = normalizeStaffUids(user.uid, teamUids);
  const token = sanitizeDocId(ensurePublicAccessToken(job), `tok-${jobId}`);
  const pubRef = doc(db, 'publicDeliveries', token);

  try {
    const existing = await getDoc(jobRef);
    if (!existing.exists()) {
      await setDoc(jobRef, buildJobCardCreatePayload(job, user.uid, staffUids));
      await setDoc(pubRef, buildPublicDeliveryCreatePayload(job, user.uid, staffUids));
      return;
    }

    const existingOwner = String(existing.data()?.ownerUid || user.uid);
    const mergedStaff = normalizeStaffUids(existingOwner, [user.uid, ...staffUids]);
    await updateDoc(jobRef, buildJobCardUpdatePatch(job, mergedStaff));

    const existingPub = await getDoc(pubRef);
    if (!existingPub.exists()) {
      await setDoc(pubRef, buildPublicDeliveryCreatePayload(job, existingOwner, mergedStaff));
    } else {
      await updateDoc(pubRef, buildPublicDeliveryUpdatePatch(job, mergedStaff));
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `jobCards/${jobId}`);
  }
}

export async function upsertInventoryItemsInFirestore(
  items: InventoryItem[],
  user: User,
  teamUids: string[] = []
): Promise<void> {
  if (!user.emailVerified || items.length === 0) return;

  try {
    for (const item of items) {
      const itemId = sanitizeDocId(item.id);
      const ref = doc(db, 'inventory', itemId);
      const existing = await getDoc(ref);
      if (!existing.exists()) {
        const staffUids = normalizeStaffUids(user.uid, teamUids);
        await setDoc(ref, buildInventoryCreatePayload(item, user.uid, staffUids));
      } else {
        const existingOwner = String(existing.data()?.ownerUid || user.uid);
        const existingStaff = Array.isArray(existing.data()?.staffUids)
          ? (existing.data()?.staffUids as string[])
          : [];
        const staffUids = normalizeStaffUids(existingOwner, [
          ...existingStaff,
          user.uid,
          ...teamUids,
        ]);
        await updateDoc(ref, buildInventoryUpdatePatch(item, staffUids));
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'inventory');
  }
}

export async function upsertScheduleInFirestore(
  schedule: RecurringMaintenance,
  user: User,
  teamUids: string[] = []
): Promise<void> {
  if (!user.emailVerified) return;
  const schedId = sanitizeDocId(schedule.id);
  const ref = doc(db, 'schedules', schedId);
  const staffUids = normalizeStaffUids(user.uid, teamUids);

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, buildScheduleCreatePayload(schedule, user.uid, staffUids));
    } else {
      const existingOwner = String(existing.data()?.ownerUid || user.uid);
      const mergedStaff = normalizeStaffUids(existingOwner, [user.uid, ...staffUids]);
      await updateDoc(ref, buildScheduleUpdatePatch(schedule, mergedStaff));
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `schedules/${schedId}`);
  }
}

export async function upsertSchedulesBatchInFirestore(
  schedules: RecurringMaintenance[],
  user: User,
  teamUids: string[] = []
): Promise<void> {
  for (const s of schedules) {
    await upsertScheduleInFirestore(s, user, teamUids);
  }
}

export async function upsertSettingsInFirestore(
  settings: BusinessSettings,
  user: User,
  teamUids: string[] = []
): Promise<void> {
  if (!user.emailVerified) return;
  const ref = doc(db, 'settings', DEFAULT_SETTINGS_DOC_ID);
  const staffUids = normalizeStaffUids(user.uid, teamUids);

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, buildSettingsCreatePayload(settings, user.uid, staffUids));
    } else {
      const existingOwner = String(existing.data()?.ownerUid || user.uid);
      const mergedStaff = normalizeStaffUids(existingOwner, [user.uid, ...staffUids]);
      await updateDoc(ref, buildSettingsUpdatePatch(settings, mergedStaff));
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `settings/${DEFAULT_SETTINGS_DOC_ID}`);
  }
}

export async function upsertCustomFieldsInFirestore(
  fields: CustomField[],
  user: User,
  teamUids: string[] = []
): Promise<void> {
  if (!user.emailVerified) return;
  const staffUids = normalizeStaffUids(user.uid, teamUids);

  try {
    for (const field of fields) {
      const fieldId = sanitizeDocId(field.id);
      const ref = doc(db, 'customFields', fieldId);
      const existing = await getDoc(ref);
      if (!existing.exists()) {
        await setDoc(ref, buildCustomFieldCreatePayload(field, user.uid, staffUids));
      } else {
        const existingOwner = String(existing.data()?.ownerUid || user.uid);
        const mergedStaff = normalizeStaffUids(existingOwner, [user.uid, ...staffUids]);
        await updateDoc(ref, buildCustomFieldUpdatePatch(field, mergedStaff));
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'customFields');
  }
}

export function subscribePublicDeliveryStatus(
  token: string,
  onUpdate: (summary: Partial<PublicJobStatusSummary> & { readyForDelivery?: boolean }) => void
): Unsubscribe {
  const cleanToken = sanitizeDocId(token);
  if (!cleanToken) return () => {};
  const ref = doc(db, 'publicDeliveries', cleanToken);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      onUpdate({
        id: String(data.jobId || ''),
        status: data.status as JobStatus,
        toolBrand: String(data.toolBrand || ''),
        toolModel: String(data.toolModel || ''),
        warrantyFlag:
          data.warrantyFlag === 'Out-of-Warranty' ? 'Out-of-Warranty' : 'In-Warranty',
        intakeDate: String(data.intakeDate || ''),
        promisedCompletion: String(data.promisedCompletion || ''),
        estimatedTotal: Number(data.totalAmount || 0),
        readyForDelivery: Boolean(data.readyForDelivery),
        customerFeedback:
          data.feedbackSubmitted && typeof data.feedbackRating === 'number'
            ? {
                rating: Number(data.feedbackRating),
                comment: String(data.feedbackComment || ''),
                submittedAt: String(data.feedbackSubmittedAt || timestampToIso(data.updatedAt)),
              }
            : undefined,
        updatedAt: timestampToIso(data.updatedAt),
      });
    },
    (err) => {
      console.warn('Public delivery listener warning:', err.message);
    }
  );
}

export async function getWorkshopTeamMemberUids(user: User): Promise<string[]> {
  return user?.uid ? [user.uid] : [];
}
