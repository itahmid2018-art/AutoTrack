import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  JOB_PRIORITY_LEVELS,
  applyPriorityChangeToJobs,
  countJobsByPriority,
  filterJobsByPriority,
  getPriorityBadgeClasses,
  getPriorityWeight,
  normalizeJobPriority,
} from '../src/utils/priority';
import { JobCard } from '../src/types';

function makeJob(id: string, priority: JobCard['priority'] = 'Low'): JobCard {
  return {
    id,
    customerName: 'Apex Client',
    customerPhone: '+15551234567',
    tool: {
      brand: 'Bosch Professional',
      category: 'Rotary Hammer / SDS',
      modelNumber: 'GBH 2-26',
      serialNumber: `SN-${id}`,
      voltageRating: '230V',
      warrantyStatus: 'Standard 1-Year',
      physicalCondition: 'Good',
      accessoriesReceived: [],
    },
    serviceReq: {
      grievanceCategory: 'No Power / Dead Switch',
      detailedComplaint: 'Switch fault',
      serviceType: 'Diagnostic & Repair',
      preApprovedLimit: 100,
    },
    intakeDate: '2026-11-10',
    promisedCompletion: '2026-11-12',
    status: 'Intake',
    priority,
    technician: 'David Miller',
    laborHours: 1,
    laborRate: 45,
    discount: 0,
    taxRate: 10,
    parts: [],
    totalAmount: 49.5,
    messageLogs: [],
    createdAt: '2026-11-10T09:00:00Z',
    updatedAt: '2026-11-10T09:00:00Z',
  };
}

describe('priority helpers', () => {
  it('exposes the three priority levels Low, Medium, and High', () => {
    assert.deepEqual([...JOB_PRIORITY_LEVELS], ['Low', 'Medium', 'High']);
  });

  it('normalizes canonical and legacy priority values safely', () => {
    assert.equal(normalizeJobPriority('Low'), 'Low');
    assert.equal(normalizeJobPriority('Medium'), 'Medium');
    assert.equal(normalizeJobPriority('High'), 'High');
    assert.equal(normalizeJobPriority('Routine'), 'Low');
    assert.equal(normalizeJobPriority('Urgent'), 'Medium');
    assert.equal(normalizeJobPriority('Emergency'), 'High');
    assert.equal(normalizeJobPriority('high'), 'High');
    assert.equal(normalizeJobPriority(undefined), 'Low');
    assert.equal(normalizeJobPriority('unknown'), 'Low');
  });

  it('assigns monotonic workload weights and distinct badge classes', () => {
    assert.ok(getPriorityWeight('High') > getPriorityWeight('Medium'));
    assert.ok(getPriorityWeight('Medium') > getPriorityWeight('Low'));
    assert.match(getPriorityBadgeClasses('High'), /rose/);
    assert.match(getPriorityBadgeClasses('Medium'), /amber/);
    assert.match(getPriorityBadgeClasses('Low'), /zinc/);
  });

  it('filters and counts jobs accurately across All, Low, Medium, and High', () => {
    const jobs = [
      makeJob('BOSCH-2026-0001', 'Low'),
      makeJob('BOSCH-2026-0002', 'Medium'),
      makeJob('BOSCH-2026-0003', 'High'),
      makeJob('BOSCH-2026-0004', 'High'),
    ];

    assert.equal(filterJobsByPriority(jobs, 'All').length, 4);
    assert.deepEqual(
      filterJobsByPriority(jobs, 'High').map((j) => j.id),
      ['BOSCH-2026-0003', 'BOSCH-2026-0004']
    );
    assert.deepEqual(
      filterJobsByPriority(jobs, 'Medium').map((j) => j.id),
      ['BOSCH-2026-0002']
    );
    assert.deepEqual(countJobsByPriority(jobs), {
      All: 4,
      Low: 1,
      Medium: 1,
      High: 2,
    });
  });

  it('updates priority for a specific JobID so Kanban view reflects the change by JobID', () => {
    const jobs = [
      makeJob('BOSCH-2026-0041', 'Low'),
      makeJob('BOSCH-2026-0042', 'Medium'),
    ];

    const { updatedJobs, changedJob } = applyPriorityChangeToJobs(
      jobs,
      'BOSCH-2026-0041',
      'High',
      '2026-11-20T10:00:00Z'
    );

    assert.ok(changedJob);
    assert.equal(changedJob.id, 'BOSCH-2026-0041');
    assert.equal(changedJob.priority, 'High');
    assert.equal(updatedJobs.find((j) => j.id === 'BOSCH-2026-0041')?.priority, 'High');
    assert.equal(updatedJobs.find((j) => j.id === 'BOSCH-2026-0042')?.priority, 'Medium');
    assert.equal(changedJob.auditLogs?.[0].action, 'PRIORITY_CHANGED');
    assert.equal(changedJob.auditLogs?.[0].previousState, 'Low');
    assert.equal(changedJob.auditLogs?.[0].newState, 'High');
  });
});
