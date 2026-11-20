import { InventoryItem, JobCard } from '../types';

export type InventoryAlertSeverity = 'OUT_OF_STOCK' | 'CRITICAL' | 'LOW_STOCK';

export interface InventoryNotification {
  id: string;
  itemId: string;
  sku: string;
  name: string;
  category: string;
  binLocation: string;
  stockQty: number;
  minStockThreshold: number;
  unit: string;
  costPrice: number;
  suggestedReorderQty: number;
  estimatedReorderCost: number;
  severity: InventoryAlertSeverity;
  message: string;
  triggeredAt: string;
  read: boolean;
}

export interface ReorderSuggestion {
  suggestedReorderQty: number;
  targetStockLevel: number;
  estimatedReorderCost: number;
  severity: InventoryAlertSeverity;
}

export interface AutomatedReorderPointItem {
  item: InventoryItem;
  itemId: string;
  sku: string;
  name: string;
  currentStock: number;
  staticMinThreshold: number;
  totalUnitsConsumed: number;
  jobUsageCount: number;
  observedMonths: number;
  avgMonthlyConsumptionRate: number;
  suggestedReorderPoint: number;
  belowAutomatedThreshold: boolean;
  suggestedOrderQty: number;
  estimatedOrderCost: number;
  urgency: InventoryAlertSeverity;
  suggestedSupplier: string;
}

export interface AutomatedReorderAnalysis {
  observedMonths: number;
  analyzedJobCount: number;
  items: AutomatedReorderPointItem[];
  belowThresholdItems: AutomatedReorderPointItem[];
  totalEstimatedOrderCost: number;
}

export interface MonthlyConsumptionMonth {
  yearMonth: string;
  label: string;
}

export interface MonthlyConsumptionSeries {
  itemId: string;
  sku: string;
  name: string;
  color: string;
  totalConsumed: number;
  jobUsageCount: number;
  avgMonthlyRate: number;
  values: number[];
}

export interface MonthlyConsumptionTrends {
  months: MonthlyConsumptionMonth[];
  series: MonthlyConsumptionSeries[];
}

export function isItemBelowThreshold(item: InventoryItem): boolean {
  return item.stockQty < item.minStockThreshold;
}

export function computeReorderSuggestion(item: InventoryItem): ReorderSuggestion {
  const targetStockLevel = Math.max(item.minStockThreshold * 2, item.minStockThreshold + 10);
  const suggestedReorderQty = Math.max(5, targetStockLevel - item.stockQty);
  const estimatedReorderCost = Math.round(suggestedReorderQty * item.costPrice * 100) / 100;

  let severity: InventoryAlertSeverity = 'LOW_STOCK';
  if (item.stockQty <= 0) {
    severity = 'OUT_OF_STOCK';
  } else if (item.stockQty <= Math.max(1, Math.floor(item.minStockThreshold * 0.5))) {
    severity = 'CRITICAL';
  }

  return {
    suggestedReorderQty,
    targetStockLevel,
    estimatedReorderCost,
    severity,
  };
}

export function buildInventoryNotification(
  item: InventoryItem,
  existing?: InventoryNotification
): InventoryNotification {
  const suggestion = computeReorderSuggestion(item);
  const nowIso = new Date().toISOString();

  return {
    id: existing?.id || `inv-alert-${item.id}`,
    itemId: item.id,
    sku: item.sku,
    name: item.name,
    category: item.category,
    binLocation: item.binLocation,
    stockQty: item.stockQty,
    minStockThreshold: item.minStockThreshold,
    unit: item.unit,
    costPrice: item.costPrice,
    suggestedReorderQty: suggestion.suggestedReorderQty,
    estimatedReorderCost: suggestion.estimatedReorderCost,
    severity: suggestion.severity,
    message:
      item.stockQty <= 0
        ? `${item.sku} (${item.name}) is OUT OF STOCK (Min: ${item.minStockThreshold} ${item.unit}). Reorder +${suggestion.suggestedReorderQty} ${item.unit} recommended.`
        : `${item.sku} (${item.name}) fell to ${item.stockQty} ${item.unit} (below Min ${item.minStockThreshold}). Reorder +${suggestion.suggestedReorderQty} ${item.unit} suggested.`,
    triggeredAt: existing && existing.stockQty === item.stockQty ? existing.triggeredAt : nowIso,
    read: existing && existing.stockQty <= item.stockQty ? existing.read : false,
  };
}

export function syncInventoryNotifications(
  inventory: InventoryItem[],
  previousAlerts: InventoryNotification[] = []
): InventoryNotification[] {
  const prevByItemId = new Map<string, InventoryNotification>(
    previousAlerts.map((n) => [n.itemId, n])
  );

  const severityWeight: Record<InventoryAlertSeverity, number> = {
    OUT_OF_STOCK: 0,
    CRITICAL: 1,
    LOW_STOCK: 2,
  };

  return inventory
    .filter(isItemBelowThreshold)
    .map((item) => buildInventoryNotification(item, prevByItemId.get(item.id)))
    .sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      if (severityWeight[a.severity] !== severityWeight[b.severity]) {
        return severityWeight[a.severity] - severityWeight[b.severity];
      }
      return a.stockQty - b.stockQty;
    });
}

function parseJobTimestampMs(job: JobCard): number | null {
  const candidates = [job.intakeDate, job.createdAt, job.updatedAt];
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue;
    const normalized = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw;
    const ms = Date.parse(normalized);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375;

export function analyzeInventoryReorderPoints(
  inventory: InventoryItem[],
  jobCards: JobCard[] = []
): AutomatedReorderAnalysis {
  const activeJobs = jobCards.filter((job) => job.status !== 'Cancelled');

  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;
  for (const job of activeJobs) {
    const ms = parseJobTimestampMs(job);
    if (ms !== null) {
      if (ms < minMs) minMs = ms;
      if (ms > maxMs) maxMs = ms;
    }
  }

  const observedMonths =
    Number.isFinite(minMs) && Number.isFinite(maxMs) && maxMs >= minMs
      ? Math.max(1, Math.round(((maxMs - minMs) / MS_PER_MONTH) * 10) / 10)
      : 1;

  const byItemId = new Map<string, InventoryItem>();
  const bySku = new Map<string, InventoryItem>();
  for (const item of inventory) {
    byItemId.set(item.id, item);
    bySku.set(item.sku.trim().toUpperCase(), item);
  }

  const usageStats = new Map<string, { totalQty: number; jobIds: Set<string> }>();
  for (const job of activeJobs) {
    if (!Array.isArray(job.parts)) continue;
    for (const part of job.parts) {
      const matched =
        (part.partId && byItemId.get(part.partId)) ||
        (part.sku && bySku.get(part.sku.trim().toUpperCase()));
      if (!matched) continue;
      const qty = Math.max(0, Number(part.quantity) || 0);
      if (qty <= 0) continue;

      const entry = usageStats.get(matched.id) || { totalQty: 0, jobIds: new Set<string>() };
      entry.totalQty += qty;
      entry.jobIds.add(job.id);
      usageStats.set(matched.id, entry);
    }
  }

  const severityWeight: Record<InventoryAlertSeverity, number> = {
    OUT_OF_STOCK: 0,
    CRITICAL: 1,
    LOW_STOCK: 2,
  };

  const items: AutomatedReorderPointItem[] = inventory.map((item) => {
    const usage = usageStats.get(item.id);
    const totalUnitsConsumed = usage ? usage.totalQty : 0;
    const jobUsageCount = usage ? usage.jobIds.size : 0;
    const avgMonthlyConsumptionRate =
      Math.round((totalUnitsConsumed / observedMonths) * 100) / 100;

    // 1.5 months of average consumption (lead time + safety stock), floored at static min threshold
    const consumptionReorderPoint =
      totalUnitsConsumed > 0 ? Math.ceil(avgMonthlyConsumptionRate * 1.5) : 0;
    const suggestedReorderPoint = Math.max(item.minStockThreshold, consumptionReorderPoint);
    const belowAutomatedThreshold = item.stockQty < suggestedReorderPoint;

    const targetLevel = Math.max(suggestedReorderPoint * 2, suggestedReorderPoint + 10);
    const suggestedOrderQty = belowAutomatedThreshold
      ? Math.max(5, targetLevel - item.stockQty)
      : 0;
    const estimatedOrderCost = Math.round(suggestedOrderQty * item.costPrice * 100) / 100;

    let urgency: InventoryAlertSeverity = 'LOW_STOCK';
    if (item.stockQty <= 0) {
      urgency = 'OUT_OF_STOCK';
    } else if (item.stockQty <= Math.max(1, Math.floor(suggestedReorderPoint * 0.5))) {
      urgency = 'CRITICAL';
    }

    return {
      item,
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      currentStock: item.stockQty,
      staticMinThreshold: item.minStockThreshold,
      totalUnitsConsumed,
      jobUsageCount,
      observedMonths,
      avgMonthlyConsumptionRate,
      suggestedReorderPoint,
      belowAutomatedThreshold,
      suggestedOrderQty,
      estimatedOrderCost,
      urgency,
      suggestedSupplier:
        item.brand === 'Bosch' || item.brand === 'Bosch Professional'
          ? 'Bosch Industrial Direct Depot'
          : 'Master Tool Components Supply',
    };
  });

  const belowThresholdItems = items
    .filter((entry) => entry.belowAutomatedThreshold)
    .sort((a, b) => {
      if (severityWeight[a.urgency] !== severityWeight[b.urgency]) {
        return severityWeight[a.urgency] - severityWeight[b.urgency];
      }
      if (b.avgMonthlyConsumptionRate !== a.avgMonthlyConsumptionRate) {
        return b.avgMonthlyConsumptionRate - a.avgMonthlyConsumptionRate;
      }
      return a.currentStock - b.currentStock;
    });

  const totalEstimatedOrderCost =
    Math.round(
      belowThresholdItems.reduce((sum, entry) => sum + entry.estimatedOrderCost, 0) * 100
    ) / 100;

  return {
    observedMonths,
    analyzedJobCount: activeJobs.length,
    items,
    belowThresholdItems,
    totalEstimatedOrderCost,
  };
}

const CHART_SERIES_COLORS = ['#34d399', '#f59e0b', '#60a5fa', '#a78bfa'];

export function computeMonthlyPartConsumptionTrends(
  inventory: InventoryItem[],
  jobCards: JobCard[] = [],
  monthCount: number = 6
): MonthlyConsumptionTrends {
  const activeJobs = jobCards.filter((job) => job.status !== 'Cancelled');
  const analysis = analyzeInventoryReorderPoints(inventory, activeJobs);

  let latestMs = Number.NEGATIVE_INFINITY;
  for (const job of activeJobs) {
    const ms = parseJobTimestampMs(job);
    if (ms !== null && ms > latestMs) {
      latestMs = ms;
    }
  }
  const anchorDate = Number.isFinite(latestMs) ? new Date(latestMs) : new Date();
  const anchorMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);

  const months: MonthlyConsumptionMonth[] = [];
  for (let offset = Math.max(1, monthCount) - 1; offset >= 0; offset--) {
    const d = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() - offset, 1);
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${d.toLocaleString('en-US', { month: 'short' })} ${String(d.getFullYear()).slice(-2)}`;
    months.push({ yearMonth, label });
  }

  const byItemId = new Map(inventory.map((i) => [i.id, i]));
  const bySku = new Map(inventory.map((i) => [i.sku.trim().toUpperCase(), i]));
  const monthlyItemTotals = new Map<string, Map<string, number>>();

  for (const job of activeJobs) {
    if (!Array.isArray(job.parts)) continue;
    const ms = parseJobTimestampMs(job);
    const d = ms !== null ? new Date(ms) : anchorMonth;
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    for (const part of job.parts) {
      const matched =
        (part.partId && byItemId.get(part.partId)) ||
        (part.sku && bySku.get(part.sku.trim().toUpperCase()));
      if (!matched) continue;
      const qty = Math.max(0, Number(part.quantity) || 0);
      if (qty <= 0) continue;

      let monthMap = monthlyItemTotals.get(matched.id);
      if (!monthMap) {
        monthMap = new Map<string, number>();
        monthlyItemTotals.set(matched.id, monthMap);
      }
      monthMap.set(ym, (monthMap.get(ym) || 0) + qty);
    }
  }

  const topConsumed = analysis.items
    .filter((entry) => entry.totalUnitsConsumed > 0)
    .sort((a, b) => {
      if (b.jobUsageCount !== a.jobUsageCount) return b.jobUsageCount - a.jobUsageCount;
      if (b.totalUnitsConsumed !== a.totalUnitsConsumed) {
        return b.totalUnitsConsumed - a.totalUnitsConsumed;
      }
      if (a.belowAutomatedThreshold !== b.belowAutomatedThreshold) {
        return a.belowAutomatedThreshold ? -1 : 1;
      }
      return a.sku.localeCompare(b.sku);
    })
    .slice(0, 4);

  const series: MonthlyConsumptionSeries[] = topConsumed.map((entry, idx) => {
    const monthMap = monthlyItemTotals.get(entry.itemId) || new Map<string, number>();
    return {
      itemId: entry.itemId,
      sku: entry.sku,
      name: entry.name,
      color: CHART_SERIES_COLORS[idx % CHART_SERIES_COLORS.length],
      totalConsumed: entry.totalUnitsConsumed,
      jobUsageCount: entry.jobUsageCount,
      avgMonthlyRate: entry.avgMonthlyConsumptionRate,
      values: months.map((m) => monthMap.get(m.yearMonth) || 0),
    };
  });

  return { months, series };
}
