import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCloudSyncStatusMap,
  resolveJobCloudSyncStatus,
} from '../src/utils/cloudSyncStatus';

describe('Kanban cloudSyncStatus resolution', () => {
  it('returns "local" when operator is not signed in with Firebase', () => {
    const status = resolveJobCloudSyncStatus({
      jobId: 'BOSCH-2026-0041',
      isOnline: true,
      isAuthenticated: false,
      pendingQueueIds: [],
      cloudConfirmedIds: ['BOSCH-2026-0041'],
    });
    assert.equal(status, 'local');
  });

  it('returns "synced" when signed in, confirmed in Firestore, and no pending writes exist', () => {
    const status = resolveJobCloudSyncStatus({
      jobId: 'BOSCH-2026-0041',
      isOnline: true,
      isAuthenticated: true,
      pendingQueueIds: [],
      inFlightIds: [],
      firestorePendingWritesById: { 'BOSCH-2026-0041': false },
      cloudConfirmedIds: ['BOSCH-2026-0041'],
    });
    assert.equal(status, 'synced');
  });

  it('returns "pending" when a card is queued in pendingQueueIds after an offline edit', () => {
    const status = resolveJobCloudSyncStatus({
      jobId: 'BOSCH-2026-0041',
      isOnline: false,
      isAuthenticated: true,
      pendingQueueIds: ['BOSCH-2026-0041'],
      cloudConfirmedIds: ['BOSCH-2026-0041'],
    });
    assert.equal(status, 'pending');
  });

  it('keeps previously confirmed untouched cards as "synced" while modified offline cards show "pending"', () => {
    const map = buildCloudSyncStatusMap(
      [{ id: 'BOSCH-2026-0041' }, { id: 'BOSCH-2026-0042' }],
      {
        isOnline: false,
        isAuthenticated: true,
        pendingQueueIds: ['BOSCH-2026-0041'],
        cloudConfirmedIds: ['BOSCH-2026-0041', 'BOSCH-2026-0042'],
      }
    );
    assert.equal(map['BOSCH-2026-0041'], 'pending');
    assert.equal(map['BOSCH-2026-0042'], 'synced');
  });

  it('returns "pending" when Firestore metadata reports hasPendingWrites=true', () => {
    const status = resolveJobCloudSyncStatus({
      jobId: 'BOSCH-2026-0043',
      isOnline: true,
      isAuthenticated: true,
      pendingQueueIds: [],
      firestorePendingWritesById: { 'BOSCH-2026-0043': true },
      cloudConfirmedIds: ['BOSCH-2026-0043'],
    });
    assert.equal(status, 'pending');
  });

  it('returns "pending" when a card write is actively in flight or not yet confirmed', () => {
    assert.equal(
      resolveJobCloudSyncStatus({
        jobId: 'BOSCH-2026-0044',
        isOnline: true,
        isAuthenticated: true,
        pendingQueueIds: [],
        inFlightIds: ['BOSCH-2026-0044'],
        cloudConfirmedIds: ['BOSCH-2026-0044'],
      }),
      'pending'
    );

    assert.equal(
      resolveJobCloudSyncStatus({
        jobId: 'BOSCH-2026-0045',
        isOnline: true,
        isAuthenticated: true,
        pendingQueueIds: [],
        cloudConfirmedIds: [],
      }),
      'pending'
    );
  });
});
