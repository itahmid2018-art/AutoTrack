import React, { useState } from 'react';
import { JobCard, InventoryItem } from '../types';
import { SHOP_TECHNICIANS } from '../data/mockTechnicians';
import { AiReorderRecommendations } from './AiReorderRecommendations';
import { 
  Wrench, 
  DollarSign, 
  Package, 
  AlertTriangle, 
  TrendingUp, 
  UserCheck, 
  Clock, 
  CheckCircle2, 
  Award, 
  BarChart3, 
  Zap,
  Activity,
  Download,
  FileSpreadsheet,
  FileCheck,
  Sparkles,
  BrainCircuit
} from 'lucide-react';

interface AnalyticsDashboardProps {
  jobCards: JobCard[];
  inventory: InventoryItem[];
  onUpdateInventory?: (newInv: InventoryItem[]) => void;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ jobCards, inventory, onUpdateInventory = () => {} }) => {
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const activeJobs = jobCards.filter(j => j.status !== 'Completed' && j.status !== 'Cancelled');
  const readyForPickup = jobCards.filter(j => j.status === 'Ready for Pickup');
  const completedJobs = jobCards.filter(j => j.status === 'Completed');
  
  const totalRevenue = jobCards.reduce((sum, j) => sum + j.totalAmount, 0);
  const totalInventoryValuation = inventory.reduce((sum, i) => sum + (i.stockQty * i.costPrice), 0);
  const lowStockCount = inventory.filter(i => i.stockQty <= i.minStockThreshold).length;

  const categoryCounts = jobCards.reduce((acc, j) => {
    const cat = j.tool?.category || 'Rotary Hammer / SDS';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Compute Technician Performance Metrics
  const techStats = SHOP_TECHNICIANS.map(tech => {
    const techJobs = jobCards.filter(j => j.technician && j.technician.toLowerCase().includes(tech.name.split(' ')[0].toLowerCase()));
    
    const assignedActive = techJobs.filter(j => j.status !== 'Completed' && j.status !== 'Cancelled').length;
    const completedCount = techJobs.filter(j => j.status === 'Completed' || j.status === 'Ready for Pickup').length;
    
    const totalLaborHours = techJobs.reduce((sum, j) => sum + (j.laborHours || 1.0), 0);
    const totalRevenueGenerated = techJobs.reduce((sum, j) => sum + j.totalAmount, 0);

    let totalTurnaroundHours = 0;
    let completedTurnaroundSampleCount = 0;

    techJobs.forEach(j => {
      try {
        const intake = new Date(j.intakeDate.replace(' ', 'T')).getTime();
        const end = new Date(j.updatedAt || j.promisedCompletion.replace(' ', 'T')).getTime();
        const diffHours = Math.max(1, (end - intake) / (1000 * 60 * 60));
        totalTurnaroundHours += diffHours;
        completedTurnaroundSampleCount += 1;
      } catch {
        totalTurnaroundHours += 24;
        completedTurnaroundSampleCount += 1;
      }
    });

    const avgTurnaroundHours = completedTurnaroundSampleCount > 0 
      ? Math.round((totalTurnaroundHours / completedTurnaroundSampleCount) * 10) / 10 
      : 18.0;

    const efficiencyRating = totalLaborHours > 0 
      ? Math.min(100, Math.round(((completedCount * 3.5) / Math.max(1, totalLaborHours)) * 100))
      : 85;

    return {
      tech,
      assignedActive,
      completedCount,
      totalLaborHours,
      totalRevenueGenerated,
      avgTurnaroundHours,
      efficiencyRating,
      totalJobs: techJobs.length,
    };
  });

  const overallAvgTurnaround = Math.round(
    techStats.reduce((acc, t) => acc + t.avgTurnaroundHours, 0) / Math.max(1, techStats.length)
  );

  const totalWorkshopLaborHours = techStats.reduce((acc, t) => acc + t.totalLaborHours, 0);

  // Helper for safe CSV escaping
  const escapeCsv = (val: any): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  // CSV Exporter for Job Cards History
  const handleDownloadJobHistoryCsv = () => {
    const headers = [
      'Job ID',
      'Intake Date',
      'Status',
      'Priority',
      'Customer Name',
      'Company',
      'Customer Phone',
      'Customer Email',
      'Tool Brand',
      'Tool Category',
      'Model Number',
      'Serial Number',
      'Voltage Rating',
      'Warranty Status',
      'Grievance Category',
      'Detailed Complaint',
      'Technician',
      'Labor Hours',
      'Labor Rate ($)',
      'Parts Count',
      'Parts Subtotal ($)',
      'Tax Rate (%)',
      'Total Amount ($)',
      'Created At',
      'Updated At',
    ];

    const rows = jobCards.map((j) => {
      const partsSubtotal = j.parts ? j.parts.reduce((sum, p) => sum + p.total, 0) : 0;
      return [
        escapeCsv(j.id),
        escapeCsv(j.intakeDate),
        escapeCsv(j.status),
        escapeCsv(j.priority),
        escapeCsv(j.customerName),
        escapeCsv(j.customerCompany || ''),
        escapeCsv(j.customerPhone),
        escapeCsv(j.customerEmail || ''),
        escapeCsv(j.tool.brand),
        escapeCsv(j.tool.category),
        escapeCsv(j.tool.modelNumber),
        escapeCsv(j.tool.serialNumber),
        escapeCsv(j.tool.voltageRating),
        escapeCsv(j.tool.warrantyStatus),
        escapeCsv(j.serviceReq.grievanceCategory),
        escapeCsv(j.serviceReq.detailedComplaint),
        escapeCsv(j.technician || 'Unassigned'),
        escapeCsv(j.laborHours),
        escapeCsv(j.laborRate),
        escapeCsv(j.parts ? j.parts.length : 0),
        escapeCsv(partsSubtotal.toFixed(2)),
        escapeCsv(j.taxRate),
        escapeCsv(j.totalAmount.toFixed(2)),
        escapeCsv(j.createdAt),
        escapeCsv(j.updatedAt),
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const filename = `bosch_service_job_history_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadSuccess(`Exported ${jobCards.length} Job Cards to ${filename}`);
    setTimeout(() => setDownloadSuccess(null), 4000);
  };

  // CSV Exporter for Inventory Stock Audit
  const handleDownloadInventoryCsv = () => {
    const headers = [
      'SKU',
      'Barcode',
      'Part Name',
      'Category',
      'Brand',
      'Compatible Models',
      'Unit Cost Price ($)',
      'Selling Price ($)',
      'Stock Qty',
      'Min Stock Threshold',
      'Unit',
      'Bin Location',
      'Stock Alert Status',
      'Last Restocked',
    ];

    const rows = inventory.map((item) => {
      const isLow = item.stockQty <= item.minStockThreshold;
      return [
        escapeCsv(item.sku),
        escapeCsv(item.barcode),
        escapeCsv(item.name),
        escapeCsv(item.category),
        escapeCsv(item.brand),
        escapeCsv(item.compatibleModels),
        escapeCsv(item.costPrice.toFixed(2)),
        escapeCsv(item.unitPrice.toFixed(2)),
        escapeCsv(item.stockQty),
        escapeCsv(item.minStockThreshold),
        escapeCsv(item.unit),
        escapeCsv(item.binLocation),
        escapeCsv(isLow ? 'LOW STOCK ALERT' : 'OK'),
        escapeCsv(item.lastRestocked),
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const filename = `bosch_parts_inventory_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadSuccess(`Exported ${inventory.length} Parts SKUs to ${filename}`);
    setTimeout(() => setDownloadSuccess(null), 4000);
  };

  // Export Both Datasets in 1 Click
  const handleDownloadAllCsv = () => {
    handleDownloadJobHistoryCsv();
    setTimeout(() => handleDownloadInventoryCsv(), 300);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner with Download CSV Export Actions */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-white">
              <BarChart3 className="w-5 h-5" />
            </span>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight uppercase font-mono">
              Service Center Performance &amp; Audit Analytics
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time repair efficiency, turnaround speed, technician labor metrics, and exportable financial audits.
          </p>
        </div>

        {/* CSV Export Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto shrink-0">
          <button
            onClick={handleDownloadJobHistoryCsv}
            className="px-3.5 py-2 text-xs font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl transition-all shadow flex items-center gap-1.5 font-mono active:scale-95"
            title="Download Job Cards transactional history CSV for accounting & audit"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Download Jobs CSV</span>
          </button>

          <button
            onClick={handleDownloadInventoryCsv}
            className="px-3.5 py-2 text-xs font-bold text-zinc-100 bg-zinc-950 hover:bg-zinc-800 rounded-xl transition-all border border-zinc-700 flex items-center gap-1.5 font-mono active:scale-95"
            title="Download 1,000 spare parts inventory valuation CSV for audit"
          >
            <Download className="w-4 h-4 text-white" />
            <span>Download Inventory CSV</span>
          </button>
        </div>
      </div>

      {/* Success Notification Toast */}
      {downloadSuccess && (
        <div className="bg-zinc-900 border border-white/20 p-3.5 rounded-xl text-xs font-mono text-white flex items-center justify-between shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-white" />
            <span>{downloadSuccess}</span>
          </div>
          <span className="text-[10px] text-zinc-400">Ready in Downloads</span>
        </div>
      )}

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
            <span className="text-xs font-semibold uppercase tracking-wider">Avg Turnaround Time</span>
            <div className="p-2 rounded-lg bg-zinc-950 text-white">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold font-mono text-white">{overallAvgTurnaround} hrs</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Intake to completed repair
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Tech Labor</span>
            <div className="p-2 rounded-lg bg-zinc-950 text-white">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold font-mono text-white">{totalWorkshopLaborHours.toFixed(1)} hrs</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Logged repair bench hours
          </div>
        </div>

      </div>

      {/* Technician Efficiency & Performance Breakdown Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 font-mono">
              <UserCheck className="w-4 h-4 text-white" />
              <span>Technician Efficiency &amp; Workload Tracking</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Tracks time spent per job card, total repairs completed, and average turnaround time per technician.
            </p>
          </div>
          
          <span className="px-3 py-1 rounded-full text-xs font-mono bg-zinc-950 border border-zinc-800 text-zinc-300 font-bold">
            {SHOP_TECHNICIANS.length} Shop Technicians On Duty
          </span>
        </div>

        {/* Technician Performance Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {techStats.map(({ tech, assignedActive, completedCount, totalLaborHours, avgTurnaroundHours, efficiencyRating, totalRevenueGenerated }) => (
            <div
              key={tech.id}
              className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 space-y-3 transition-all shadow-md group"
            >
              {/* Technician Header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs font-mono shrink-0 ${tech.avatarColor}`}>
                    {tech.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-white truncate group-hover:text-zinc-200">
                      {tech.name.split(' ')[0]} {tech.name.split(' ')[1]}
                    </h4>
                    <span className="text-[10px] text-zinc-400 block truncate">{tech.role}</span>
                  </div>
                </div>

                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800 shrink-0">
                  {tech.activeStatus}
                </span>
              </div>

              {/* Specialization */}
              <div className="text-[10px] text-zinc-400 bg-zinc-900/80 p-2 rounded border border-zinc-800/80 line-clamp-2 font-mono">
                {tech.specialization}
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                  <span className="text-[10px] text-zinc-400 block uppercase">Active Jobs</span>
                  <span className="text-white font-extrabold text-sm">{assignedActive}</span>
                </div>
                <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                  <span className="text-[10px] text-zinc-400 block uppercase">Completed</span>
                  <span className="text-white font-extrabold text-sm">{completedCount}</span>
                </div>
                <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                  <span className="text-[10px] text-zinc-400 block uppercase">Labor Time</span>
                  <span className="text-white font-bold text-xs">{totalLaborHours.toFixed(1)}h</span>
                </div>
                <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                  <span className="text-[10px] text-zinc-400 block uppercase">Avg Turnaround</span>
                  <span className="text-white font-bold text-xs">{avgTurnaroundHours}h</span>
                </div>
              </div>

              {/* Efficiency Rating Bar */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-zinc-400">Efficiency Index</span>
                  <span className="text-white font-bold">{efficiencyRating}%</span>
                </div>
                <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden border border-zinc-800">
                  <div
                    className="bg-white h-full rounded-full transition-all"
                    style={{ width: `${efficiencyRating}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detailed Technician Efficiency Table */}
        <div className="overflow-x-auto pt-2">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 uppercase text-[10px]">
                <th className="py-2.5 px-3">Technician</th>
                <th className="py-2.5 px-3">Specialization</th>
                <th className="py-2.5 px-3 text-center">Active Assigned</th>
                <th className="py-2.5 px-3 text-center">Repairs Completed</th>
                <th className="py-2.5 px-3 text-center">Labor Hours</th>
                <th className="py-2.5 px-3 text-center">Avg Turnaround</th>
                <th className="py-2.5 px-3 text-right">Revenue Generated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {techStats.map(({ tech, assignedActive, completedCount, totalLaborHours, avgTurnaroundHours, totalRevenueGenerated }) => (
                <tr key={tech.id} className="hover:bg-zinc-950/60 transition-colors">
                  <td className="py-3 px-3">
                    <div className="font-bold text-white">{tech.name}</div>
                    <div className="text-[10px] text-zinc-400">{tech.role}</div>
                  </td>
                  <td className="py-3 px-3 text-zinc-300 text-[11px] max-w-xs truncate">
                    {tech.specialization}
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-white">
                    <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">{assignedActive}</span>
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-white">
                    <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">{completedCount}</span>
                  </td>
                  <td className="py-3 px-3 text-center text-zinc-200">
                    {totalLaborHours.toFixed(1)} hrs
                  </td>
                  <td className="py-3 px-3 text-center text-zinc-200">
                    {avgTurnaroundHours} hrs
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-white">
                    ${totalRevenueGenerated.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI-Driven Inventory Reorder Recommendation Section */}
      <AiReorderRecommendations
        inventory={inventory}
        jobCards={jobCards}
        onUpdateInventory={onUpdateInventory}
      />

      {/* Category & Parts Valuation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Tool Category Volume */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-lg">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 font-mono">
            <TrendingUp className="w-4 h-4 text-white" />
            <span>Tool Category Service Volume</span>
          </h3>

          <div className="space-y-3">
            {Object.entries(categoryCounts).map(([cat, count]) => {
              const pct = Math.round((count / Math.max(1, jobCards.length)) * 100);
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="font-semibold text-zinc-200">{cat}</span>
                    <span className="text-white font-bold">{count} tickets ({pct}%)</span>
                  </div>
                  <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden border border-zinc-800">
                    <div className="bg-white h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Spare Parts Inventory & Health Summary */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 font-mono">
              <Package className="w-4 h-4 text-white" />
              <span>Inventory &amp; Reorder Health</span>
            </h3>

            <button
              onClick={handleDownloadInventoryCsv}
              className="text-[11px] font-mono font-bold text-zinc-300 hover:text-white flex items-center gap-1 bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-800"
            >
              <Download className="w-3 h-3" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800">
              <span className="text-[10px] text-zinc-500 block uppercase">Parts Catalog SKUs</span>
              <span className="text-xl font-extrabold text-white">{inventory.length}</span>
              <span className="text-[10px] text-zinc-400 block mt-1">Bosch &amp; Vendor Spare Parts</span>
            </div>

            <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800">
              <span className="text-[10px] text-zinc-500 block uppercase">Inventory Valuation</span>
              <span className="text-xl font-extrabold text-white">${totalInventoryValuation.toFixed(0)}</span>
              <span className="text-[10px] text-zinc-400 block mt-1">Cost value of active stock</span>
            </div>
          </div>

          <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-white font-mono">Low Stock Reorder Threshold</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">{lowStockCount} parts currently require purchase order generation</div>
            </div>
            <span className="px-3 py-1 bg-zinc-900 border border-zinc-700 text-white font-mono text-xs font-bold rounded-lg">
              {lowStockCount} SKUs Alert
            </span>
          </div>
        </div>

      </div>

    </div>
  );
};
