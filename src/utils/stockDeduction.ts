import { AuditLogEntry, JobCard, JobPart, JobStatus } from '../types';

export interface DeductedPartSnapshot {
  partId: string;
  qty: number;
}

export interface InventoryDelta {
  partId: string;
  deltaQty: number; // Negative to deduct stock, positive to restore stock
}

export interface StockLifecycleTransitionResult {
  updatedJob: JobCard;
  inventoryDeltas: InventoryDelta[];
  restoredFromCancellation: boolean;
  deductedNow: boolean;
}

export function aggregateJobParts(parts: JobPart[] = []): DeductedPartSnapshot[] {
  const counts = new Map<string, number>();
  for (const part of parts) {
    if (!part?.partId) continue;
    const qty = Number(part.quantity) || 0;
    if (qty <= 0) continue;
    counts.set(part.partId, (counts.get(part.partId) || 0) + qty);
  }
  return Array.from(counts.entries()).map(([partId, qty]) => ({ partId, qty }));
}

export function shouldDeductStockOnStatus(
  policy: 'Approval' | 'InService' | 'Completion',
  status: JobStatus
): boolean {
  if (policy === 'Approval') return status === 'Awaiting Approval';
  if (policy === 'InService') return status === 'In Service' || status === 'In Repair';
  if (policy === 'Completion') return status === 'Completed';
  return false;
}

/**
 * Applies idempotent spare-part stock deductions and explicit Cancelled reversal.
 * - Deducts stock once when reaching the configured policy stage, or only for net
 *   newly added parts if the ticket already recorded `stockDeductedAt`.
 * - Restores all previously deducted part quantities back to inventory and clears
 *   `stockDeductedAt` / `partsDeducted` when transitioning to `Cancelled`.
 */
export function applyStockLifecycleTransition(
  job: JobCard,
  nextStatus: JobStatus,
  policy: 'Approval' | 'InService' | 'Completion',
  options?: {
    actorName?: string;
    actorRole?: string;
    nowIso?: string;
  }
): StockLifecycleTransitionResult {
  const nowIso = options?.nowIso || new Date().toISOString();
  const displayTs = nowIso.slice(0, 16).replace('T', ' ');
  const actorName = options?.actorName || 'Workshop Operator';
  const actorRole = options?.actorRole || 'Technician';

  const existingLogs: AuditLogEntry[] = Array.isArray(job.auditLogs) ? [...job.auditLogs] : [];

  if (nextStatus === 'Cancelled') {
    const previouslyDeducted = Array.isArray(job.partsDeducted) ? job.partsDeducted : [];
    const inventoryDeltas: InventoryDelta[] = previouslyDeducted
      .filter((entry) => entry.partId && entry.qty > 0)
      .map((entry) => ({ partId: entry.partId, deltaQty: entry.qty }));

    const nextJob: JobCard = { ...job, status: nextStatus };
    delete nextJob.stockDeductedAt;
    delete nextJob.partsDeducted;

    if (inventoryDeltas.length > 0) {
      const summary = inventoryDeltas.map((d) => `${d.partId} (+${d.deltaQty})`).join(', ');
      nextJob.auditLogs = [
        ...existingLogs,
        {
          id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          timestamp: displayTs,
          userName: actorName,
          userRole: actorRole,
          action: 'INVENTORY_STOCK_RESTORED',
          previousState: job.stockDeductedAt ? `Deducted @ ${job.stockDeductedAt}` : undefined,
          newState: `Cancelled ticket restored inventory: ${summary}`,
        },
      ];
      return {
        updatedJob: nextJob,
        inventoryDeltas,
        restoredFromCancellation: true,
        deductedNow: false,
      };
    }

    return {
      updatedJob: nextJob,
      inventoryDeltas: [],
      restoredFromCancellation: false,
      deductedNow: false,
    };
  }

  if (!shouldDeductStockOnStatus(policy, nextStatus)) {
    return {
      updatedJob: { ...job, status: nextStatus },
      inventoryDeltas: [],
      restoredFromCancellation: false,
      deductedNow: false,
    };
  }

  const currentAggregated = aggregateJobParts(job.parts || []);
  if (currentAggregated.length === 0) {
    return {
      updatedJob: { ...job, status: nextStatus },
      inventoryDeltas: [],
      restoredFromCancellation: false,
      deductedNow: false,
    };
  }

  const deductedMap = new Map<string, number>();
  for (const prev of job.partsDeducted || []) {
    if (prev?.partId && prev.qty > 0) {
      deductedMap.set(prev.partId, (deductedMap.get(prev.partId) || 0) + prev.qty);
    }
  }

  const inventoryDeltas: InventoryDelta[] = [];
  const nextPartsDeducted: DeductedPartSnapshot[] = [];

  for (const item of currentAggregated) {
    const alreadyQty = job.stockDeductedAt ? deductedMap.get(item.partId) || 0 : 0;
    const netDelta = item.qty - alreadyQty;
    if (netDelta > 0) {
      inventoryDeltas.push({ partId: item.partId, deltaQty: -netDelta });
    }
    nextPartsDeducted.push({ partId: item.partId, qty: Math.max(item.qty, alreadyQty) });
  }

  // Also preserve any previously deducted entries not currently in currentAggregated if any
  for (const [partId, prevQty] of deductedMap.entries()) {
    if (!nextPartsDeducted.some((p) => p.partId === partId)) {
      nextPartsDeducted.push({ partId, qty: prevQty });
    }
  }

  if (inventoryDeltas.length === 0) {
    return {
      updatedJob: { ...job, status: nextStatus },
      inventoryDeltas: [],
      restoredFromCancellation: false,
      deductedNow: false,
    };
  }

  const summary = inventoryDeltas.map((d) => `${d.partId} (${d.deltaQty})`).join(', ');
  const updatedJob: JobCard = {
    ...job,
    status: nextStatus,
    stockDeductedAt: job.stockDeductedAt || nowIso,
    partsDeducted: nextPartsDeducted,
    auditLogs: [
      ...existingLogs,
      {
        id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: displayTs,
        userName: actorName,
        userRole: actorRole,
        action: 'INVENTORY_STOCK_DEDUCTED',
        newState: `Policy(${policy}) -> ${nextStatus}: ${summary}`,
      },
    ],
  };

  return {
    updatedJob,
    inventoryDeltas,
    restoredFromCancellation: false,
    deductedNow: true,
  };
}
