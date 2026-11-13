import { InventoryItem } from '../types';

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
