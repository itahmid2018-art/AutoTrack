import React from 'react';
import { InventoryNotification } from '../utils/inventoryNotifications';
import { AlertTriangle, ShoppingCart, X, ArrowRight, PackageX } from 'lucide-react';

interface InventoryNotificationToastProps {
  toasts: InventoryNotification[];
  onDismiss: (id: string) => void;
  onQuickReorder: (itemId: string, qty: number) => void;
  onOpenInventoryAlerts: () => void;
}

export const InventoryNotificationToast: React.FC<InventoryNotificationToastProps> = ({
  toasts,
  onDismiss,
  onQuickReorder,
  onOpenInventoryAlerts,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none no-print"
      aria-live="polite"
    >
      {toasts.slice(0, 3).map((toast) => {
        const isOut = toast.severity === 'OUT_OF_STOCK';
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border p-4 shadow-2xl backdrop-blur bg-zinc-950/95 font-mono space-y-2.5 animate-in slide-in-from-bottom-4 duration-200 ${
              isOut ? 'border-rose-500/80' : 'border-amber-500/80'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`p-1.5 rounded-lg border ${
                    isOut
                      ? 'bg-rose-950 text-rose-300 border-rose-700'
                      : 'bg-amber-950 text-amber-300 border-amber-700'
                  }`}
                >
                  {isOut ? <PackageX className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                </span>
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-white">
                    {isOut ? 'Stockout Alert' : 'Low Stock Threshold Alert'}
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    SKU: <strong className="text-white">{toast.sku}</strong> · {toast.binLocation}
                  </div>
                </div>
              </div>

              <button
                onClick={() => onDismiss(toast.id)}
                className="text-zinc-500 hover:text-white p-0.5"
                aria-label="Dismiss inventory alert"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-zinc-200 font-sans leading-snug">
              <strong className="text-white">{toast.name}</strong> dropped to{' '}
              <span className={isOut ? 'text-rose-400 font-bold' : 'text-amber-400 font-bold'}>
                {toast.stockQty} {toast.unit}
              </span>{' '}
              (Min threshold: {toast.minStockThreshold}).
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 flex items-center justify-between text-[11px]">
              <span className="text-zinc-400">Suggested Reorder:</span>
              <span className="text-emerald-400 font-bold">
                +{toast.suggestedReorderQty} {toast.unit} (${toast.estimatedReorderCost.toFixed(2)})
              </span>
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <button
                onClick={() => {
                  onQuickReorder(toast.itemId, toast.suggestedReorderQty);
                  onDismiss(toast.id);
                }}
                className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-colors"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Reorder +{toast.suggestedReorderQty}</span>
              </button>

              <button
                onClick={() => {
                  onOpenInventoryAlerts();
                  onDismiss(toast.id);
                }}
                className="py-1.5 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-bold rounded-xl text-[11px] flex items-center gap-1 transition-colors"
              >
                <span>Alerts</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
