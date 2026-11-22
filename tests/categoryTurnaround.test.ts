import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCategoryTurnaroundFromStageHistory,
  extractCompletedJobTurnaroundHours,
} from '../src/utils/categoryTurnaround';
import { JobCard, ToolCategory } from '../src/types';

function makeCompletedJob(
  id: string,
  category: ToolCategory,
  stageHistory: JobCard['stageHistory'],
  overrides: Partial<JobCard> = {}
): JobCard {
  return {
    id,
    customerName: 'Apex Client',
    customerPhone: '+15550001111',
    tool: {
      brand: 'Bosch Professional',
      category,
      modelNumber: 'GBH 2-26',
      serialNumber: `SN-${id}`,
      voltageRating: '230V',
      warrantyStatus: 'Standard 1-Year',
      physicalCondition: 'Normal wear',
      accessoriesReceived: [],
    },
    serviceReq: {
      grievanceCategory: 'Routine Maintenance / Carbon Brush Check',
      detailedComplaint: 'Periodic servicing',
      serviceType: 'Standard Overhaul',
      preApprovedLimit: 100,
    },
    intakeDate: '2026-11-01 08:00',
    promisedCompletion: '2026-11-03 17:00',
    status: 'Completed',
    priority: 'Low',
    technician: 'David Miller',
    laborHours: 1,
    laborRate: 50,
    discount: 0,
    taxRate: 10,
    parts: [],
    totalAmount: 55,
    messageLogs: [],
    stageHistory,
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-20T18:00:00.000Z', // Later feedback edit should not inflate turnaround
    ...overrides,
  };
}

describe('categoryTurnaround stageHistory analysis', () => {
  it('computes average turnaround time per tool category strictly from stageHistory of completed jobs', () => {
    const rotary1 = makeCompletedJob('BOSCH-2026-0101', 'Rotary Hammer / SDS', [
      { status: 'Intake', enteredAt: '2026-11-01T08:00:00.000Z' },
      { status: 'Diagnosis', enteredAt: '2026-11-01T10:00:00.000Z' },
      { status: 'In Service', enteredAt: '2026-11-01T12:00:00.000Z' },
      { status: 'Completed', enteredAt: '2026-11-01T20:00:00.000Z' }, // 12h
    ]);

    const rotary2 = makeCompletedJob('BOSCH-2026-0102', 'Rotary Hammer / SDS', [
      { status: 'Intake', enteredAt: '2026-11-02T08:00:00.000Z' },
      { status: 'In Repair', enteredAt: '2026-11-02T14:00:00.000Z' },
      { status: 'Completed', enteredAt: '2026-11-03T20:00:00.000Z' }, // 36h
    ]);

    const grinder1 = makeCompletedJob('BOSCH-2026-0103', 'Angle Grinder', [
      { status: 'Intake', enteredAt: '2026-11-04T09:00:00.000Z' },
      { status: 'Completed', enteredAt: '2026-11-04T15:00:00.000Z' }, // 6h
    ]);

    const activeIgnored = makeCompletedJob(
      'BOSCH-2026-0104',
      'Angle Grinder',
      [
        { status: 'Intake', enteredAt: '2026-11-01T00:00:00.000Z' },
        { status: 'In Service', enteredAt: '2026-11-10T00:00:00.000Z' },
      ],
      { status: 'In Service' }
    );

    const summary = calculateCategoryTurnaroundFromStageHistory([
      rotary1,
      rotary2,
      grinder1,
      activeIgnored,
    ]);

    assert.equal(summary.totalCompletedJobs, 3);
    assert.equal(summary.analyzedJobsCount, 3);
    assert.equal(summary.overallAvgHours, 18); // (12 + 36 + 6) / 3
    assert.equal(summary.overallAvgDays, 0.8);

    const rotaryMetric = summary.categories.find(
      (c) => c.category === 'Rotary Hammer / SDS'
    );
    assert.ok(rotaryMetric);
    assert.equal(rotaryMetric.completedCount, 2);
    assert.equal(rotaryMetric.multiStageCount, 2);
    assert.equal(rotaryMetric.avgHours, 24);
    assert.equal(rotaryMetric.avgDays, 1);
    assert.equal(rotaryMetric.minHours, 12);
    assert.equal(rotaryMetric.maxHours, 36);

    assert.equal(summary.fastestCategory?.category, 'Angle Grinder');
    assert.equal(summary.fastestCategory?.avgHours, 6);
    assert.equal(summary.slowestCategory?.category, 'Rotary Hammer / SDS');
    assert.equal(summary.slowestCategory?.avgHours, 24);
  });

  it('handles empty completed lists and single-entry stageHistory cleanly', () => {
    const empty = calculateCategoryTurnaroundFromStageHistory([]);
    assert.equal(empty.totalCompletedJobs, 0);
    assert.equal(empty.categories.length, 0);
    assert.equal(empty.overallAvgHours, null);

    const singleStageJob = makeCompletedJob(
      'BOSCH-2026-0046',
      'Impact Wrench / Driver',
      [{ status: 'Completed', enteredAt: '2026-11-09T11:45:00Z' }],
      { intakeDate: '2026-11-08 10:00' }
    );
    const extracted = extractCompletedJobTurnaroundHours(singleStageJob);
    assert.equal(extracted.usedMultiStageHistory, false);
    assert.ok(extracted.hours !== null && extracted.hours > 25 && extracted.hours < 26);
  });
});
