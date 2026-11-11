import React from 'react';
import { JobCard, InventoryItem } from '../types';
import { Wrench, DollarSign, Package, AlertTriangle, TrendingUp, CheckCircle2 } from 'lucide-react';

interface AnalyticsDashboardProps {
  jobCards: JobCard[];
  inventory: InventoryItem[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ jobCards, inventory }) => {
  const activeJobs = jobCards.filter(j => j.status !== 'Completed' && j.status !== 'Cancelled');
  const readyForPickup = jobCards.filter(j => j.status === 'Ready for Pickup');
  
  const totalRevenue = jobCards.reduce((sum, j) => sum + j.totalAmount, 0);
  const totalInventoryValuation = inventory.reduce((sum, i) => sum + (i.stockQty * i.costPrice), 0);
  const lowStockCount = inventory.filter(i => i.stockQty <= i.minStockThreshold).length;

  const categoryCounts = jobCards.reduce((acc, j) => {
    const cat = j.tool?.category || 'Rotary Hammer / SDS';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Intakes</span>
            <div className="p-2 rounded-lg bg-zinc-950 text-white">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold font-mono text-white">{activeJobs.length}</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            <span className="text-white font-bold">{readyForPickup.length}</span> ready for pickup
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Service Revenue</span>
            <div className="p-2 rounded-lg bg-zinc-950 text-white">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold font-mono text-white">${totalRevenue.toFixed(2)}</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Across {jobCards.length} service tickets
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Spare Parts Valuation</span>
            <div className="p-2 rounded-lg bg-zinc-950 text-white">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold font-mono text-white">${totalInventoryValuation.toFixed(2)}</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {inventory.length} total active SKUs
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Low Stock SKU Alerts</span>
            <div className="p-2 rounded-lg bg-zinc-950 text-white">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold font-mono text-white">{lowStockCount} SKUs</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Below safety reorder threshold
          </div>
        </div>

      </div>

      {/* Category Volume */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-white" />
          <span>Tool Category Volume</span>
        </h3>

        <div className="space-y-3">
          {Object.entries(categoryCounts).map(([cat, count]) => {
            const pct = Math.round((count / Math.max(1, jobCards.length)) * 100);
            return (
              <div key={cat} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-zinc-200">{cat}</span>
                  <span className="font-mono text-white font-bold">{count} tickets ({pct}%)</span>
                </div>
                <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden border border-zinc-800">
                  <div className="bg-white h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
