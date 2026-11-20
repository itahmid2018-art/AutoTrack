import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECENT_JOB_SEARCHES_KEY,
  MAX_RECENT_JOB_SEARCHES,
  normalizeRecentJobIds,
  recordRecentJobId,
  removeRecentJobId,
  loadRecentJobIds,
  saveRecentJobIds,
} from '../src/utils/recentSearches';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

describe('recentSearches utilities', () => {
  it('caps recent job IDs to the last 5 unique entries with most recent first', () => {
    let ids: string[] = [];
    for (let i = 1; i <= 7; i++) {
      ids = recordRecentJobId(ids, `BOSCH-2026-000${i}`);
    }

    assert.equal(ids.length, MAX_RECENT_JOB_SEARCHES);
    assert.deepEqual(ids, [
      'BOSCH-2026-0007',
      'BOSCH-2026-0006',
      'BOSCH-2026-0005',
      'BOSCH-2026-0004',
      'BOSCH-2026-0003',
    ]);

    // Re-selecting an existing ID promotes it to the top without duplicating
    ids = recordRecentJobId(ids, 'BOSCH-2026-0004');
    assert.deepEqual(ids, [
      'BOSCH-2026-0004',
      'BOSCH-2026-0007',
      'BOSCH-2026-0006',
      'BOSCH-2026-0005',
      'BOSCH-2026-0003',
    ]);
  });

  it('ignores blank or non-string entries during normalization and removes single entries cleanly', () => {
    const normalized = normalizeRecentJobIds([
      '  BOSCH-2026-0041 ',
      '',
      null,
      'BOSCH-2026-0041',
      'BOSCH-2026-0042',
    ]);
    assert.deepEqual(normalized, ['BOSCH-2026-0041', 'BOSCH-2026-0042']);

    const afterRemove = removeRecentJobId(normalized, 'BOSCH-2026-0041');
    assert.deepEqual(afterRemove, ['BOSCH-2026-0042']);
  });

  it('persists and restores recent job IDs safely in storage', () => {
    const storage = createMemoryStorage();
    saveRecentJobIds(['BOSCH-2026-0041', 'BOSCH-2026-0045'], storage);

    const raw = storage.getItem(RECENT_JOB_SEARCHES_KEY);
    assert.ok(raw);
    assert.deepEqual(loadRecentJobIds(storage), ['BOSCH-2026-0041', 'BOSCH-2026-0045']);

    // Saving empty list clears the key
    saveRecentJobIds([], storage);
    assert.equal(storage.getItem(RECENT_JOB_SEARCHES_KEY), null);
    assert.deepEqual(loadRecentJobIds(storage), []);
  });
});
