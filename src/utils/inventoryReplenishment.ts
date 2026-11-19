import { InventoryItem } from '../types';
import { InventoryNotification, isItemBelowThreshold } from './inventoryNotifications';

export interface ReplenishDurationResult {
  status: 'replenished' | 'pending' | 'none';
  durationMs: number;
}

export interface ReplenishSummaryMetrics {
  avgDays: number | null;
  avgHours: number | null;
  fastestDays: number | null;
  slowestDays: number | null;
  replenishedCount: number;
  pendingReplenishCount: number;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

export function parseReplenishDateMs(value?: string | null): number | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (DATE_ONLY_PATTERN.test(trimmed)) {
    const ms = Date.parse(`${trimmed}T12:00:00.000Z`);
    return Number.isFinite(ms) ? ms : null;
  }

  const normalized =
    trimmed.includes(' ') && !trimmed.includes('T') ? trimmed.replace(' ', 'T') : trimmed;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

export function computeItemReplenishDurationMs(
  item: InventoryItem,
  fallbackLowStockTimestamp?: string
): ReplenishDurationResult {
  const lowRaw = (item.lowStockTimestamp || fallbackLowStockTimestamp || '').trim();
  if (!lowRaw) {
    return { status: 'none', durationMs: 0 };
  }

  const lowMs = parseReplenishDateMs(lowRaw);
  if (lowMs === null) {
    return { status: 'none', durationMs: 0 };
  }

  const restockRaw = (item.lastRestocked || '').trim();
  const restockMs = parseReplenishDateMs(restockRaw);
  if (!restockRaw || restockMs === null) {
    return { status: 'pending', durationMs: 0 };
  }

  const lowDay = lowRaw.slice(0, 10);
  const restockDay = restockRaw.slice(0, 10);

  if (DATE_ONLY_PATTERN.test(restockRaw)) {
    if (restockDay < lowDay) {
      return { status: 'pending', durationMs: 0 };
    }

    if (restockDay === lowDay) {
      if (isItemBelowThreshold(item)) {
        return { status: 'pending', durationMs: 0 };
      }
      const endOfDayMs = Date.parse(`${restockDay}T23:59:59.999Z`);
      const durationMs =
        restockMs >= lowMs
          ? restockMs - lowMs
          : Math.max(0, endOfDayMs - lowMs);
      return { status: 'replenished', durationMs };
    }

    return {
      status: 'replenished',
      durationMs: Math.max(0, restockMs - lowMs),
    };
  }

  if (restockMs < lowMs) {
    return { status: 'pending', durationMs: 0 };
  }

  return {
    status: 'replenished',
    durationMs: restockMs - lowMs,
  };
}

export function calculateAverageReplenishMetrics(
  inventory: InventoryItem[],
  notifications: InventoryNotification[] = []
): ReplenishSummaryMetrics {
  const notifTimestampByItemId = new Map<string, string>();
  for (const notif of notifications) {
    if (notif.itemId && notif.triggeredAt) {
      notifTimestampByItemId.set(notif.itemId, notif.triggeredAt);
    }
  }

  let totalDurationMs = 0;
  let minDurationMs = Number.POSITIVE_INFINITY;
  let maxDurationMs = 0;
  let replenishedCount = 0;
  let pendingReplenishCount = 0;

  for (const item of inventory) {
    const result = computeItemReplenishDurationMs(item, notifTimestampByItemId.get(item.id));
    if (result.status === 'replenished') {
      totalDurationMs += result.durationMs;
      if (result.durationMs < minDurationMs) minDurationMs = result.durationMs;
      if (result.durationMs > maxDurationMs) maxDurationMs = result.durationMs;
      replenishedCount += 1;
    } else if (result.status === 'pending') {
      pendingReplenishCount += 1;
    }
  }

  if (replenishedCount === 0) {
    return {
      avgDays: null,
      avgHours: null,
      fastestDays: null,
      slowestDays: null,
      replenishedCount: 0,
      pendingReplenishCount,
    };
  }

  const avgMs = totalDurationMs / replenishedCount;
  const avgDays = Math.round((avgMs / MS_PER_DAY) * 10) / 10;
  const avgHours = Math.round((avgMs / MS_PER_HOUR) * 10) / 10;
  const fastestDays = Math.round((minDurationMs / MS_PER_DAY) * 10) / 10;
  const slowestDays = Math.round((maxDurationMs / MS_PER_DAY) * 10) / 10;

  return {
    avgDays,
    avgHours,
    fastestDays,
    slowestDays,
    replenishedCount,
    pendingReplenishCount,
  };
}

export function reconcileItemLowStockTimestamp(
  nextItem: InventoryItem,
  prevItem?: InventoryItem,
  nowIso: string = new Date().toISOString()
): InventoryItem {
  const isNowLow = isItemBelowThreshold(nextItem);
  const wasPrevLow = prevItem ? isItemBelowThreshold(prevItem) : false;
  const existingLowTimestamp = nextItem.lowStockTimestamp || prevItem?.lowStockTimestamp;

  if (isNowLow) {
    if (wasPrevLow && existingLowTimestamp) {
      return nextItem.lowStockTimestamp === existingLowTimestamp
        ? nextItem
        : { ...nextItem, lowStockTimestamp: existingLowTimestamp };
    }
    return {
      ...nextItem,
      lowStockTimestamp: nextItem.lowStockTimestamp || nowIso,
    };
  }

  if (existingLowTimestamp && !nextItem.lowStockTimestamp) {
    return {
      ...nextItem,
      lowStockTimestamp: existingLowTimestamp,
    };
  }

  return nextItem;
}

export function reconcileInventoryLowStockTimestamps(
  nextInventory: InventoryItem[],
  prevInventory: InventoryItem[] = [],
  nowIso: string = new Date().toISOString()
): InventoryItem[] {
  const prevById = new Map(prevInventory.map((item) => [item.id, item]));
  return nextInventory.map((item) =>
    reconcileItemLowStockTimestamp(item, prevById.get(item.id), nowIso)
  );
}

export function backfillSeededLowStockTimestamps(
  loadedInventory: InventoryItem[],
  seedInventory: InventoryItem[],
  nowIso: string = new Date().toISOString()
): InventoryItem[] {
  const seedById = new Map(seedInventory.map((item) => [item.id, item]));
  return loadedInventory.map((item) => {
    if (item.lowStockTimestamp) return item;
    const seeded = seedById.get(item.id);
    if (seeded?.lowStockTimestamp && item.lastRestocked === seeded.lastRestocked) {
      return { ...item, lowStockTimestamp: seeded.lowStockTimestamp };
    }
    if (isItemBelowThreshold(item)) {
      return { ...item, lowStockTimestamp: nowIso };
    }
    return item;
  });
}
