import { JobCard } from '../types';

export const PENDING_CLOUD_SYNC_STORAGE_KEY = 'autotrack_pending_cloud_sync_jobs_v1';

export type CloudSyncState = 'synced' | 'pending' | 'local';

export interface CloudSyncStatusInput {
  jobId: string;
  isOnline: boolean;
  isAuthenticated: boolean;
  pendingQueueIds: Set<string> | string[];
  inFlightIds?: Set<string> | string[];
  firestorePendingWritesById?: Record<string, boolean>;
  cloudConfirmedIds?: Set<string> | string[];
}

function toSet(value?: Set<string> | string[]): Set<string> {
  if (!value) return new Set<string>();
  return value instanceof Set ? value : new Set(value);
}

/**
 * Resolves the cloud synchronization state for an individual job card on the Kanban board.
 *
 * - `'local'`: Operator is not signed in with a verified Firebase account; changes live locally only.
 * - `'pending'`: Card has local/offline edits queued, an active write in flight, Firestore
 *   `hasPendingWrites`, or has not yet been confirmed by Firestore.
 * - `'synced'`: Card's latest state has been confirmed committed in Cloud Firestore.
 */
export function resolveJobCloudSyncStatus(input: CloudSyncStatusInput): CloudSyncState {
  if (!input.isAuthenticated) {
    return 'local';
  }

  const pendingSet = toSet(input.pendingQueueIds);
  const inFlightSet = toSet(input.inFlightIds);
  const confirmedSet = toSet(input.cloudConfirmedIds);

  if (
    pendingSet.has(input.jobId) ||
    inFlightSet.has(input.jobId) ||
    Boolean(input.firestorePendingWritesById?.[input.jobId])
  ) {
    return 'pending';
  }

  if (confirmedSet.has(input.jobId)) {
    return 'synced';
  }

  return 'pending';
}

export function buildCloudSyncStatusMap(
  jobCards: Pick<JobCard, 'id'>[],
  params: Omit<CloudSyncStatusInput, 'jobId'>
): Record<string, CloudSyncState> {
  const result: Record<string, CloudSyncState> = {};
  for (const job of jobCards) {
    result[job.id] = resolveJobCloudSyncStatus({
      ...params,
      jobId: job.id,
    });
  }
  return result;
}

export function loadPendingCloudSyncIds(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PENDING_CLOUD_SYNC_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));
  } catch {
    return [];
  }
}

export function savePendingCloudSyncIds(ids: string[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0)));
    if (unique.length === 0) {
      localStorage.removeItem(PENDING_CLOUD_SYNC_STORAGE_KEY);
    } else {
      localStorage.setItem(PENDING_CLOUD_SYNC_STORAGE_KEY, JSON.stringify(unique));
    }
  } catch (err) {
    console.warn('Unable to persist pending cloud sync IDs:', err);
  }
}
