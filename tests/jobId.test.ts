import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextJobCardId,
  nextScheduleId,
  nextScheduleSequenceStart,
} from '../src/utils/jobId';

describe('jobId sequence generators', () => {
  it('uses default floor of 41 for BOSCH-2026- when list is empty', () => {
    assert.equal(nextJobCardId([]), 'BOSCH-2026-0041');
  });

  it('uses 0001 floor for custom prefix when list is empty', () => {
    assert.equal(nextJobCardId([], 'AT-2026-'), 'AT-2026-0001');
  });

  it('computes max + 1 and never collides or shrinks when earlier jobs are deleted', () => {
    const remainingJobs = [
      { id: 'BOSCH-2026-0041' },
      { id: 'BOSCH-2026-0045' },
    ];
    // Even though 0042..0044 were deleted, next ID advances past 0045
    const nextId = nextJobCardId(remainingJobs);
    assert.equal(nextId, 'BOSCH-2026-0046');
  });

  it('ignores IDs with non-matching prefixes', () => {
    const jobs = [
      { id: 'LEGACY-9999' },
      { id: 'BOSCH-2026-0042' },
    ];
    assert.equal(nextJobCardId(jobs, 'BOSCH-2026-'), 'BOSCH-2026-0043');
  });

  it('generates non-colliding maintenance schedule IDs after deletions', () => {
    const schedules = [
      { id: 'MAINT-2026-001' },
      { id: 'MAINT-2026-005' },
    ];
    assert.equal(nextScheduleSequenceStart(schedules.map((s) => s.id)), 6);
    assert.equal(nextScheduleId(schedules), 'MAINT-2026-006');
  });
});
