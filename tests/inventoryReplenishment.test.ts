import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InventoryItem } from '../src/types';
import {
  calculateAverageReplenishMetrics,
  computeItemReplenishDurationMs,
  reconcileInventoryLowStockTimestamps,
} from '../src/utils/inventoryReplenishment';
import { InventoryNotification } from '../src/utils/inventoryNotifications';

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'item-1',
    sku: 'BRSH-1001',
    barcode: '3165141001',
    name: 'Carbon Brush Set',
    category: 'Carbon Brushes & Caps',
    brand: 'Bosch Genuine Spare Parts',
    compatibleModels: 'Bosch GBH 2-26',
    unitPrice: 12.5,
    costPrice: 7.5,
    stockQty: 20,
    minStockThreshold: 5,
    unit: 'sets',
    binLocation: 'Bin A-01',
    lastRestocked: '2026-11-05',
    ...overrides,
  };
}

describe('inventoryReplenishment utilities', () => {
  it('computes replenish duration when lastRestocked follows lowStockTimestamp', () => {
    const item = makeItem({
      stockQty: 20,
      minStockThreshold: 5,
      lowStockTimestamp: '2026-11-01T12:00:00.000Z',
      lastRestocked: '2026-11-05',
    });

    const result = computeItemReplenishDurationMs(item);
    assert.equal(result.status, 'replenished');
    assert.equal(result.durationMs, 4 * 24 * 60 * 60 * 1000);
  });

  it('marks items still below threshold or not restocked since lowStockTimestamp as pending', () => {
    const olderRestock = makeItem({
      id: 'item-pending-1',
      stockQty: 2,
      minStockThreshold: 5,
      lowStockTimestamp: '2026-11-15T09:00:00.000Z',
      lastRestocked: '2026-11-05',
    });
    const sameDayStillLow = makeItem({
      id: 'item-pending-2',
      stockQty: 1,
      minStockThreshold: 5,
      lowStockTimestamp: '2026-11-19T08:00:00.000Z',
      lastRestocked: '2026-11-19',
    });

    assert.equal(computeItemReplenishDurationMs(olderRestock).status, 'pending');
    assert.equal(computeItemReplenishDurationMs(sameDayStillLow).status, 'pending');
  });

  it('handles same-day restock cleanly without negative durations', () => {
    const sameDayRestocked = makeItem({
      stockQty: 15,
      minStockThreshold: 5,
      lowStockTimestamp: '2026-11-19T14:00:00.000Z',
      lastRestocked: '2026-11-19',
    });

    const result = computeItemReplenishDurationMs(sameDayRestocked);
    assert.equal(result.status, 'replenished');
    assert.ok(result.durationMs > 0);
    assert.ok(result.durationMs < 24 * 60 * 60 * 1000);
  });

  it('calculates average replenish days and hours across items and notification fallbacks', () => {
    const items: InventoryItem[] = [
      makeItem({
        id: 'a',
        stockQty: 20,
        lowStockTimestamp: '2026-11-01T12:00:00.000Z',
        lastRestocked: '2026-11-05', // 4.0 days
      }),
      makeItem({
        id: 'b',
        stockQty: 20,
        lowStockTimestamp: '2026-11-03T12:00:00.000Z',
        lastRestocked: '2026-11-05', // 2.0 days
      }),
      makeItem({
        id: 'c',
        stockQty: 2,
        minStockThreshold: 5,
        lastRestocked: '2026-11-05',
      }),
    ];

    const notifications: InventoryNotification[] = [
      {
        id: 'inv-alert-c',
        itemId: 'c',
        sku: 'BRSH-1003',
        name: 'Brush C',
        category: 'Carbon Brushes & Caps',
        binLocation: 'Bin A-03',
        stockQty: 2,
        minStockThreshold: 5,
        unit: 'sets',
        costPrice: 5,
        suggestedReorderQty: 10,
        estimatedReorderCost: 50,
        severity: 'CRITICAL',
        message: 'Low stock',
        triggeredAt: '2026-11-18T10:00:00.000Z',
        read: false,
      },
    ];

    const summary = calculateAverageReplenishMetrics(items, notifications);
    assert.equal(summary.replenishedCount, 2);
    assert.equal(summary.pendingReplenishCount, 1);
    assert.equal(summary.avgDays, 3.0);
    assert.equal(summary.avgHours, 72.0);
    assert.equal(summary.fastestDays, 2.0);
    assert.equal(summary.slowestDays, 4.0);
  });

  it('stamps lowStockTimestamp on low-stock transition and preserves it on restock', () => {
    const prev = [makeItem({ id: 'x', stockQty: 10, minStockThreshold: 5, lastRestocked: '2026-11-05' })];

    const dropped = reconcileInventoryLowStockTimestamps(
      [makeItem({ id: 'x', stockQty: 2, minStockThreshold: 5, lastRestocked: '2026-11-05' })],
      prev,
      '2026-11-16T10:00:00.000Z'
    );
    assert.equal(dropped[0].lowStockTimestamp, '2026-11-16T10:00:00.000Z');

    const droppedFurther = reconcileInventoryLowStockTimestamps(
      [makeItem({ id: 'x', stockQty: 1, minStockThreshold: 5, lastRestocked: '2026-11-05', lowStockTimestamp: dropped[0].lowStockTimestamp })],
      dropped,
      '2026-11-17T10:00:00.000Z'
    );
    assert.equal(droppedFurther[0].lowStockTimestamp, '2026-11-16T10:00:00.000Z');

    const restocked = reconcileInventoryLowStockTimestamps(
      [makeItem({ id: 'x', stockQty: 22, minStockThreshold: 5, lastRestocked: '2026-11-19', lowStockTimestamp: droppedFurther[0].lowStockTimestamp })],
      droppedFurther,
      '2026-11-19T12:00:00.000Z'
    );
    assert.equal(restocked[0].lowStockTimestamp, '2026-11-16T10:00:00.000Z');
  });
});
