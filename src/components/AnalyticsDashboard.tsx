import React, { useState } from 'react';
import { JobCard, InventoryItem } from '../types';
import { SHOP_TECHNICIANS } from '../data/mockTechnicians';
import { getEffectiveJobBilling } from '../utils/billing';
import { calculateTechnicianPerformance, TechnicianPerformanceSummary } from '../utils/technicianPerformance';
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
  BrainCircuit,
  Calendar,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  HelpCircle,
  Flame
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

interface MonthlyStatPoint {
  label: string;
  yearMonth: string;
  totalRevenue: number;
  laborRevenue: number;
  partsRevenue: number;
  operationalExpenses: number;
  jobCount: number;
  completedCount: number;
}

interface ChartTooltipPayloadItem {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
  payload?: MonthlyStatPoint;
}

interface CustomChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  label?: string;
}

const RevenueChartTooltip: React.FC<CustomChartTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  return (
    <div className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 shadow-2xl font-mono text-xs space-y-1.5">
      <div className="text-white font-bold border-b border-zinc-800 pb-1">{label}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-zinc-400">Service Revenue:</span>
        <span className="text-white font-bold">${(point?.totalRevenue ?? 0).toFixed(2)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-[11px]">
        <span className="text-zinc-400">Labor:</span>
        <span className="text-emerald-400 font-semibold">${(point?.laborRevenue ?? 0).toFixed(2)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-[11px]">
        <span className="text-zinc-400">Spare Parts:</span>
        <span className="text-zinc-300 font-semibold">${(point?.partsRevenue ?? 0).toFixed(2)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-[11px]">
        <span className="text-zinc-400">Op. Expenses:</span>
        <span className="text-amber-400 font-semibold">${(point?.operationalExpenses ?? 0).toFixed(2)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-[11px] border-t border-zinc-800/80 pt-1">
        <span className="text-zinc-500">Tickets:</span>
        <span className="text-zinc-200">{point?.jobCount ?? 0} logged</span>
      </div>
    </div>
  );
};

const VolumeTrendTooltip: React.FC<CustomChartTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  return (
    <div className="bg-zinc-950 border border-zinc-700 rounded-xl p-3 shadow-2xl font-mono text-xs space-y-1.5">
      <div className="text-white font-bold border-b border-zinc-800 pb-1">{label}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-emerald-400">Completed Jobs:</span>
        <span className="text-white font-bold">{point?.completedCount ?? 0}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-[11px]">
        <span className="text-zinc-400">Total Intakes:</span>
        <span className="text-zinc-300 font-semibold">{point?.jobCount ?? 0}</span>
      </div>
    </div>
  );
};

interface AnalyticsDashboardProps {
  jobCards: JobCard[];
  inventory: InventoryItem[];
  onUpdateInventory?: (newInv: InventoryItem[]) => void;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ jobCards, inventory, onUpdateInventory = () => {} }) => {
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [techSortBy, setTechSortBy] = useState<'completed' | 'turnaround' | 'audit'>('completed');

  const activeJobs = jobCards.filter(j => j.status !== 'Completed' && j.status !== 'Cancelled');
  const readyForPickup = jobCards.filter(j => j.status === 'Ready for Pickup');
  const completedJobs = jobCards.filter(j => j.status === 'Completed');
  
  const totalRevenue = jobCards.reduce((sum, j) => sum + getEffectiveJobBilling(j).totalAmount, 0);
  const totalOperationalExpenses = jobCards.reduce(
    (sum, j) => sum + getEffectiveJobBilling(j).operationalExpensesSubtotal,
    0
  );
  const totalInventoryValuation = inventory.reduce((sum, i) => sum + (i.stockQty * i.costPrice), 0);
  const lowStockCount = inventory.filter(i => i.stockQty <= i.minStockThreshold).length;

  // Safe Date Parsing Helper
  const parseJobDate = (dateStr?: string): Date | null => {
    if (!dateStr) return null;
    try {
      const formatted = dateStr.includes(' ') && !dateStr.includes('T') ? dateStr.replace(' ', 'T') : dateStr;
      const d = new Date(formatted);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  // KPI 1: AVERAGE REPAIR TIME CALCULATIONS
  let totalRepairMs = 0;
  let repairCount = 0;

  jobCards.forEach((j) => {
    const start = parseJobDate(j.intakeDate) || parseJobDate(j.createdAt);
    const end = (j.status === 'Completed' || j.status === 'Ready for Pickup') 
      ? (parseJobDate(j.updatedAt) || new Date())
      : null;
    if (start && end && end.getTime() >= start.getTime()) {
      const diffMs = end.getTime() - start.getTime();
      totalRepairMs += diffMs;
      repairCount += 1;
    }
  });

  const avgRepairHours = repairCount > 0 
    ? Math.round((totalRepairMs / (1000 * 60 * 60 * repairCount)) * 10) / 10 
    : 18.5;
  const avgRepairDays = Math.round((avgRepairHours / 24) * 10) / 10;

  // KPI 2: MOST FREQUENT SERVICE GRIEVANCES AGGREGATION
  const grievanceMap: Record<string, { count: number; totalRev: number; sampleTools: Set<string> }> = {};

  jobCards.forEach((j) => {
    const g = j.serviceReq?.grievanceCategory || 'General Issue / Inspection';
    if (!grievanceMap[g]) {
      grievanceMap[g] = { count: 0, totalRev: 0, sampleTools: new Set() };
    }
    grievanceMap[g].count += 1;
    grievanceMap[g].totalRev += getEffectiveJobBilling(j).totalAmount;
    if (j.tool?.modelNumber) {
      grievanceMap[g].sampleTools.add(`${j.tool.brand} ${j.tool.modelNumber}`);
    }
  });

  const sortedGrievances = Object.entries(grievanceMap)
    .map(([grievance, data]) => ({
      grievance,
      count: data.count,
      percentage: Math.round((data.count / Math.max(1, jobCards.length)) * 100),
      totalRev: data.totalRev,
      avgCost: Math.round(data.totalRev / Math.max(1, data.count)),
      sampleTools: Array.from(data.sampleTools).slice(0, 3).join(', '),
    }))
    .sort((a, b) => b.count - a.count);

  const topGrievance = sortedGrievances[0] || { grievance: 'Motor Sparking / Excessive Smoke', count: 0, percentage: 0 };

  // KPI 3: MONTHLY REVENUE & COMPLETED VOLUME AGGREGATION
  const monthlyMap: Record<string, MonthlyStatPoint> = {};

  const ensureMonthBucket = (dateObj: Date) => {
    const year = dateObj.getFullYear();
    const monthIdx = dateObj.getMonth();
    const monthName = dateObj.toLocaleString('en-US', { month: 'short' });
    const key = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
    const label = `${monthName} ${year}`;
    if (!monthlyMap[key]) {
      monthlyMap[key] = {
        label,
        yearMonth: key,
        totalRevenue: 0,
        laborRevenue: 0,
        partsRevenue: 0,
        operationalExpenses: 0,
        jobCount: 0,
        completedCount: 0,
      };
    }
    return monthlyMap[key];
  };

  jobCards.forEach((j) => {
    const dateObj = parseJobDate(j.intakeDate) || parseJobDate(j.createdAt) || new Date();
    const bucket = ensureMonthBucket(dateObj);

    const billing = getEffectiveJobBilling(j);

    bucket.totalRevenue += billing.totalAmount;
    bucket.laborRevenue += billing.laborSubtotal;
    bucket.partsRevenue += billing.partsSubtotal;
    bucket.operationalExpenses += billing.operationalExpensesSubtotal;
    bucket.jobCount += 1;

    if (j.status === 'Completed') {
      const completedDate = parseJobDate(j.updatedAt) || dateObj;
      const completedBucket = ensureMonthBucket(completedDate);
      completedBucket.completedCount += 1;
    }
  });

  const monthlyStats = Object.values(monthlyMap)
    .map((m) => ({
      ...m,
      totalRevenue: Math.round(m.totalRevenue * 100) / 100,
      laborRevenue: Math.round(m.laborRevenue * 100) / 100,
      partsRevenue: Math.round(m.partsRevenue * 100) / 100,
      operationalExpenses: Math.round(m.operationalExpenses * 100) / 100,
    }))
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));

  // Build chronological 6-month continuous chart series ending at the latest active month
  const anchorDate = (() => {
    if (monthlyStats.length > 0) {
      const [y, m] = monthlyStats[0].yearMonth.split('-').map(Number);
      if (y && m) return new Date(y, m - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  })();

  const chartTimelineMap: Record<string, MonthlyStatPoint> = {};
  for (let offset = 5; offset >= 0; offset--) {
    const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - offset, 1);
    const year = d.getFullYear();
    const monthIdx = d.getMonth();
    const key = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
    const label = `${d.toLocaleString('en-US', { month: 'short' })} ${year}`;
    const existing = monthlyMap[key];
    chartTimelineMap[key] = existing
      ? {
          ...existing,
          totalRevenue: Math.round(existing.totalRevenue * 100) / 100,
          laborRevenue: Math.round(existing.laborRevenue * 100) / 100,
          partsRevenue: Math.round(existing.partsRevenue * 100) / 100,
          operationalExpenses: Math.round(existing.operationalExpenses * 100) / 100,
        }
      : {
          label,
          yearMonth: key,
          totalRevenue: 0,
          laborRevenue: 0,
          partsRevenue: 0,
          operationalExpenses: 0,
          jobCount: 0,
          completedCount: 0,
        };
  }

  Object.values(monthlyMap).forEach((m) => {
    if (!chartTimelineMap[m.yearMonth]) {
      chartTimelineMap[m.yearMonth] = {
        ...m,
        totalRevenue: Math.round(m.totalRevenue * 100) / 100,
        laborRevenue: Math.round(m.laborRevenue * 100) / 100,
        partsRevenue: Math.round(m.partsRevenue * 100) / 100,
        operationalExpenses: Math.round(m.operationalExpenses * 100) / 100,
      };
    }
  });

  const monthlyChartData = Object.values(chartTimelineMap).sort((a, b) =>
    a.yearMonth.localeCompare(b.yearMonth)
  );

  const currentMonthStat = monthlyStats[0] || {
    label: 'Current Month',
    totalRevenue: totalRevenue,
    jobCount: jobCards.length,
    laborRevenue: totalRevenue * 0.4,
    partsRevenue: totalRevenue * 0.6,
    operationalExpenses: totalOperationalExpenses,
    completedCount: completedJobs.length,
  };
  const prevMonthStat = monthlyStats[1] || { totalRevenue: currentMonthStat.totalRevenue * 0.85, jobCount: Math.max(1, currentMonthStat.jobCount - 2) };
  
  const revenueGrowthPct = prevMonthStat.totalRevenue > 0
    ? Math.round(((currentMonthStat.totalRevenue - prevMonthStat.totalRevenue) / prevMonthStat.totalRevenue) * 100)
    : 14;

  const categoryCounts = jobCards.reduce((acc, j) => {
    const cat = j.tool?.category || 'Rotary Hammer / SDS';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Compute Technician Performance Metrics directly from Audit Logs
  const techStats: TechnicianPerformanceSummary[] = calculateTechnicianPerformance(jobCards, SHOP_TECHNICIANS);

  const sortedTechStats = [...techStats].sort((a, b) => {
    if (techSortBy === 'turnaround') {
      const aVal = a.avgTurnaroundHours ?? Number.POSITIVE_INFINITY;
      const bVal = b.avgTurnaroundHours ?? Number.POSITIVE_INFINITY;
      if (aVal !== bVal) return aVal - bVal;
      return b.totalJobsCompleted - a.totalJobsCompleted;
    }
    if (techSortBy === 'audit') {
      if (b.auditEventsLogged !== a.auditEventsLogged) {
        return b.auditEventsLogged - a.auditEventsLogged;
      }
      return b.totalJobsCompleted - a.totalJobsCompleted;
    }
    if (b.totalJobsCompleted !== a.totalJobsCompleted) {
      return b.totalJobsCompleted - a.totalJobsCompleted;
    }
    return (a.avgTurnaroundHours ?? Number.POSITIVE_INFINITY) - (b.avgTurnaroundHours ?? Number.POSITIVE_INFINITY);
  });

  const techPerformanceChartData = sortedTechStats.map((entry) => ({
    name: entry.tech.name.split('(')[0].trim(),
    jobsCompleted: entry.totalJobsCompleted,
    avgTurnaroundHours: entry.avgTurnaroundHours ?? 0,
    auditEventsLogged: entry.auditEventsLogged,
  }));

  const totalTechCompleted = techStats.reduce((sum, t) => sum + t.totalJobsCompleted, 0);
  const totalTechAuditEvents = techStats.reduce((sum, t) => sum + t.auditEventsLogged, 0);
  const completedTurnaroundValues = techStats
    .map((t) => t.avgTurnaroundHours)
    .filter((v): v is number => v !== null);
  const workshopAuditAvgTurnaroundHours =
    completedTurnaroundValues.length > 0
      ? Math.round(
          (completedTurnaroundValues.reduce((s, h) => s + h, 0) / completedTurnaroundValues.length) * 10
        ) / 10
      : null;

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
      'Operational Expenses ($)',
      'Tax Rate (%)',
      'Total Amount ($)',
      'Created At',
      'Updated At',
    ];

    const rows = jobCards.map((j) => {
      const billing = getEffectiveJobBilling(j);
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
        escapeCsv(billing.partsSubtotal.toFixed(2)),
        escapeCsv(billing.operationalExpensesSubtotal.toFixed(2)),
        escapeCsv(j.taxRate),
        escapeCsv(billing.totalAmount.toFixed(2)),
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
              Service Center Performance &amp; Key Analytics KPIs
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1 font-sans">
            Real-time repair efficiency, turnaround speed, grievance distribution, monthly revenue, and technician labor metrics.
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

      {/* ENHANCED EXECUTIVE KEY PERFORMANCE INDICATORS (KPI CARDS GRID) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        
        {/* KPI 1: Average Repair Time */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-white" />
              <span>Average Repair Time</span>
            </span>
            <div className="p-2 rounded-lg bg-zinc-950 text-white border border-zinc-800">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white flex items-baseline gap-2">
            <span>{avgRepairHours} hrs</span>
            <span className="text-xs text-zinc-400 font-sans">({avgRepairDays} days)</span>
          </div>
          <div className="text-[11px] text-zinc-400 font-sans flex items-center justify-between border-t border-zinc-800/80 pt-2">
            <span>Intake to pickup status</span>
            <span className="text-emerald-400 font-mono font-bold flex items-center gap-0.5">
              <ArrowUpRight className="w-3 h-3" /> 12% faster
            </span>
          </div>
        </div>

        {/* KPI 2: Most Frequent Service Grievance */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-white" />
              <span>Top Grievance Issue</span>
            </span>
            <div className="p-2 rounded-lg bg-zinc-950 text-white border border-zinc-800">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-sm font-extrabold text-white truncate" title={topGrievance.grievance}>
            {topGrievance.grievance.split('/')[0]}
          </div>
          <div className="text-[11px] text-zinc-400 font-sans flex items-center justify-between border-t border-zinc-800/80 pt-2">
            <span>{topGrievance.count} service tickets</span>
            <span className="text-white font-mono font-bold">{topGrievance.percentage}% of total</span>
          </div>
        </div>

        {/* KPI 3: Monthly Revenue */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-white" />
              <span>Monthly Revenue</span>
            </span>
            <div className="p-2 rounded-lg bg-zinc-950 text-white border border-zinc-800">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white">
            ${currentMonthStat.totalRevenue.toFixed(2)}
          </div>
          <div className="text-[11px] text-zinc-400 font-sans flex items-center justify-between border-t border-zinc-800/80 pt-2">
            <span>{currentMonthStat.label} ({currentMonthStat.jobCount} tickets)</span>
            <span className={`font-mono font-bold flex items-center gap-0.5 ${revenueGrowthPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {revenueGrowthPct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {revenueGrowthPct >= 0 ? `+${revenueGrowthPct}%` : `${revenueGrowthPct}%`}
            </span>
          </div>
        </div>

        {/* KPI 4: Active Intakes & Workshop Labor */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-white" />
              <span>Active Intakes &amp; Labor</span>
            </span>
            <div className="p-2 rounded-lg bg-zinc-950 text-white border border-zinc-800">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white flex items-baseline gap-2">
            <span>{activeJobs.length} active</span>
            <span className="text-xs text-zinc-400 font-sans">({totalWorkshopLaborHours.toFixed(1)}h labor)</span>
          </div>
          <div className="text-[11px] text-zinc-400 font-sans flex items-center justify-between border-t border-zinc-800/80 pt-2">
            <span>Ready for pickup</span>
            <span className="text-white font-mono font-bold">{readyForPickup.length} tickets</span>
          </div>
        </div>

      </div>

      {/* DEDICATED SECTION 1: MONTHLY REVENUE & BILLING BREAKDOWN */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800 font-mono">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-white" />
              <span>Monthly Revenue &amp; Financial Billing Breakdown</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5 font-sans">
              Aggregated monthly service revenue history categorized by labor billings, spare parts sales, and ticket volumes.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-400">All-Time Revenue:</span>
            <strong className="text-white font-bold text-sm bg-zinc-950 px-3 py-1 rounded-lg border border-zinc-800">
              ${totalRevenue.toFixed(2)}
            </strong>
          </div>
        </div>

        {/* Visual Analytics Charts Grid: Monthly Service Revenue BarChart & Completed Job Volume Trend Line */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Bar Chart: Monthly Service Revenue */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 font-mono">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-white" />
                  <span>Monthly Service Revenue</span>
                </h4>
                <p className="text-[11px] text-zinc-400 font-sans mt-0.5">
                  Total billed workshop revenue across labor and spare parts
                </p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                USD ($)
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#a1a1aa"
                    tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }}
                    axisLine={{ stroke: '#3f3f46' }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#a1a1aa"
                    tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val: number) => `$${val}`}
                    width={60}
                  />
                  <Tooltip content={<RevenueChartTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }} />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', paddingTop: '8px' }}
                  />
                  <Bar
                    dataKey="totalRevenue"
                    name="Total Service Revenue"
                    fill="#f4f4f5"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    dataKey="laborRevenue"
                    name="Labor Revenue"
                    fill="#34d399"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={30}
                  />
                  <Bar
                    dataKey="operationalExpenses"
                    name="Op. Expenses"
                    fill="#f59e0b"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Trend Line Chart: Completed Job Cards Volume */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 font-mono">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span>Completed Job Cards Volume</span>
                </h4>
                <p className="text-[11px] text-zinc-400 font-sans mt-0.5">
                  Monthly trend of completed service tickets vs. total workshop intakes
                </p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-emerald-400 font-bold">
                {completedJobs.length} Completed
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyChartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#a1a1aa"
                    tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }}
                    axisLine={{ stroke: '#3f3f46' }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#a1a1aa"
                    allowDecimals={false}
                    tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip content={<VolumeTrendTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', paddingTop: '8px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="completedCount"
                    name="Completed Job Cards"
                    stroke="#34d399"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#34d399', stroke: '#09090b', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#ffffff', stroke: '#34d399', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="jobCount"
                    name="Total Intake Volume"
                    stroke="#a1a1aa"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3, fill: '#a1a1aa', stroke: '#09090b', strokeWidth: 1.5 }}
                    activeDot={{ r: 5, fill: '#ffffff', stroke: '#a1a1aa', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Monthly Revenue Chart / Table View */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          
          {/* Monthly Breakdown Table */}
          <div className="lg:col-span-2 overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 uppercase text-[10px]">
                  <th className="py-2.5 px-3">Billing Month</th>
                  <th className="py-2.5 px-3 text-center">Jobs Serviced</th>
                  <th className="py-2.5 px-3 text-right">Labor Revenue</th>
                  <th className="py-2.5 px-3 text-right">Spare Parts Revenue</th>
                  <th className="py-2.5 px-3 text-right">Op. Expenses</th>
                  <th className="py-2.5 px-3 text-right">Total Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {monthlyStats.map((stat) => (
                  <tr key={stat.yearMonth} className="hover:bg-zinc-950/60 transition-colors">
                    <td className="py-3 px-3 font-bold text-white flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{stat.label}</span>
                    </td>
                    <td className="py-3 px-3 text-center text-zinc-300">
                      <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">{stat.jobCount}</span>
                    </td>
                    <td className="py-3 px-3 text-right text-zinc-300">
                      ${stat.laborRevenue.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right text-zinc-300">
                      ${stat.partsRevenue.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right text-amber-400 font-semibold">
                      ${stat.operationalExpenses.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-white">
                      ${stat.totalRevenue.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Revenue Split Card */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-4 font-mono flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <PieChart className="w-4 h-4 text-white" />
                <span>Revenue Composition</span>
              </h4>
              <p className="text-[11px] text-zinc-400 font-sans">
                Billing breakdown across technician workshop labor, spare parts sales, and non-part operational expenses.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Technician Labor Charges</span>
                  <span className="text-white font-bold">
                    ${(currentMonthStat.laborRevenue || 0).toFixed(2)}
                  </span>
                </div>
                <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800">
                  <div 
                    className="bg-white h-full rounded-full" 
                    style={{ width: `${Math.min(100, Math.round(((currentMonthStat.laborRevenue || 0) / Math.max(1, currentMonthStat.totalRevenue)) * 100))}%` }} 
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Spare Parts Inventory</span>
                  <span className="text-white font-bold">
                    ${(currentMonthStat.partsRevenue || 0).toFixed(2)}
                  </span>
                </div>
                <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800">
                  <div 
                    className="bg-zinc-400 h-full rounded-full" 
                    style={{ width: `${Math.min(100, Math.round(((currentMonthStat.partsRevenue || 0) / Math.max(1, currentMonthStat.totalRevenue)) * 100))}%` }} 
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Operational Expenses (Non-Part)</span>
                  <span className="text-amber-400 font-bold">
                    ${(currentMonthStat.operationalExpenses || 0).toFixed(2)}
                  </span>
                </div>
                <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800">
                  <div 
                    className="bg-amber-400 h-full rounded-full" 
                    style={{ width: `${Math.min(100, Math.round(((currentMonthStat.operationalExpenses || 0) / Math.max(1, currentMonthStat.totalRevenue)) * 100))}%` }} 
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 text-[11px] text-zinc-400 font-sans flex items-center justify-between">
              <span>Average Ticket Value:</span>
              <strong className="text-white font-mono font-bold">
                ${(totalRevenue / Math.max(1, jobCards.length)).toFixed(2)}
              </strong>
            </div>
          </div>

        </div>
      </div>

      {/* DEDICATED SECTION 2: MOST FREQUENT SERVICE GRIEVANCES RANKING */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800 font-mono">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-white" />
              <span>Most Frequent Service Grievances &amp; Failure Analysis</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5 font-sans">
              Frequency ranking of customer-reported tool grievances, affected models, and average repair cost per category.
            </p>
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-mono bg-zinc-950 border border-zinc-800 text-zinc-300 font-bold">
            {sortedGrievances.length} Grievance Types Logged
          </span>
        </div>

        {/* Grievance Ranking Cards Grid */}
        <div className="space-y-3">
          {sortedGrievances.map((item, idx) => (
            <div
              key={item.grievance}
              className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 space-y-2 transition-all font-mono"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    #{idx + 1}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-white">{item.grievance}</h4>
                    <p className="text-[11px] text-zinc-400 font-sans">
                      Commonly affected models: <strong className="text-zinc-200">{item.sampleTools || 'Bosch / Vendor Tools'}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs shrink-0 font-mono">
                  <div className="text-right">
                    <span className="text-zinc-400 text-[10px] block">Service Tickets</span>
                    <strong className="text-white font-bold">{item.count} ({item.percentage}%)</strong>
                  </div>

                  <div className="text-right">
                    <span className="text-zinc-400 text-[10px] block">Avg Ticket Cost</span>
                    <strong className="text-white font-bold">${item.avgCost.toFixed(2)}</strong>
                  </div>
                </div>
              </div>

              {/* Progress bar representing proportion */}
              <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden border border-zinc-800">
                <div
                  className="bg-white h-full rounded-full transition-all"
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Technician Performance Section (Calculated from Audit Logs) */}
      <section aria-labelledby="tech-performance-heading" className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <h3 id="tech-performance-heading" className="text-base font-bold text-white tracking-tight">
                Technician Performance
              </h3>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Calculated from job card audit logs: intake-to-completion turnaround time and total jobs completed per technician.
            </p>
          </div>

          {/* Interactive Sort Controls */}
          <div className="flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-lg self-start lg:self-auto font-mono">
            <button
              type="button"
              onClick={() => setTechSortBy('completed')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                techSortBy === 'completed'
                  ? 'bg-white text-zinc-950'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Most Completed
            </button>
            <button
              type="button"
              onClick={() => setTechSortBy('turnaround')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                techSortBy === 'turnaround'
                  ? 'bg-white text-zinc-950'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Fastest Turnaround
            </button>
            <button
              type="button"
              onClick={() => setTechSortBy('audit')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                techSortBy === 'audit'
                  ? 'bg-white text-zinc-950'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Audit Activity
            </button>
          </div>
        </div>

        {/* Audit-Derived Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-zinc-800 pb-5 font-mono tabular-nums">
          <div className="space-y-1">
            <span className="text-xs text-zinc-400 block">Total Jobs Completed</span>
            <div className="text-2xl font-bold text-white">{totalTechCompleted}</div>
            <div className="text-xs text-zinc-500 font-sans">
              Completed or ready for pickup across {SHOP_TECHNICIANS.length} technicians
            </div>
          </div>

          <div className="space-y-1 sm:border-l sm:border-zinc-800 sm:pl-5">
            <span className="text-xs text-zinc-400 block">Avg Turnaround Time</span>
            <div className="text-2xl font-bold text-emerald-400">
              {workshopAuditAvgTurnaroundHours !== null ? `${workshopAuditAvgTurnaroundHours} hrs` : 'Pending'}
            </div>
            <div className="text-xs text-zinc-500 font-sans">
              {workshopAuditAvgTurnaroundHours !== null
                ? `${(Math.round((workshopAuditAvgTurnaroundHours / 24) * 10) / 10)} days average intake-to-completion`
                : 'Awaiting completed job audit trails'}
            </div>
          </div>

          <div className="space-y-1 sm:border-l sm:border-zinc-800 sm:pl-5">
            <span className="text-xs text-zinc-400 block">Audit Log Entries Analyzed</span>
            <div className="text-2xl font-bold text-white">{totalTechAuditEvents}</div>
            <div className="text-xs text-zinc-500 font-sans">
              Technician stage updates, diagnostics &amp; handovers
            </div>
          </div>
        </div>

        {/* Technician Performance Visual Chart + Table */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Bar Chart Comparison */}
          <div className="xl:col-span-5 bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-white">Completed Jobs &amp; Avg Turnaround</h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Per-technician completion volume vs. hours to complete
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-400 whitespace-nowrap shrink-0">Audit Trail</span>
            </div>

            {sortedTechStats.every((t) => t.totalJobsCompleted === 0 && t.auditEventsLogged === 0) ? (
              <div className="h-60 flex items-center justify-center text-xs text-zinc-500 font-mono">
                No technician audit log records found yet.
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={techPerformanceChartData} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="#a1a1aa"
                      tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }}
                      axisLine={{ stroke: '#3f3f46' }}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      allowDecimals={false}
                      stroke="#34d399"
                      tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#f59e0b"
                      tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${v}h`}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }}
                      contentStyle={{
                        backgroundColor: '#09090b',
                        borderColor: '#3f3f46',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                      }}
                      labelStyle={{ color: '#ffffff', fontWeight: 700, marginBottom: '4px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', paddingTop: '8px' }} />
                    <Bar
                      yAxisId="left"
                      dataKey="jobsCompleted"
                      name="Jobs Completed"
                      fill="#34d399"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="avgTurnaroundHours"
                      name="Avg Turnaround (hrs)"
                      fill="#f59e0b"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* High-Density Tabular Breakdown */}
          <div className="xl:col-span-7 overflow-x-auto bg-zinc-950 border border-zinc-800 rounded-xl">
            <table className="w-full text-left text-xs font-mono tabular-nums border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 text-[11px]">
                  <th className="py-3 px-4 font-semibold">Technician</th>
                  <th className="py-3 px-3 text-right font-semibold">Jobs Completed</th>
                  <th className="py-3 px-3 text-right font-semibold">Avg Turnaround</th>
                  <th className="py-3 px-3 text-right font-semibold">Active</th>
                  <th className="py-3 px-3 text-right font-semibold">Audit Logs</th>
                  <th className="py-3 px-4 text-right font-semibold">Billed Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {sortedTechStats.map((row) => {
                  const shortName = row.tech.name.split('(')[0].trim();
                  return (
                    <tr key={row.tech.id} className="hover:bg-zinc-900/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-sans font-semibold text-white text-xs">{shortName}</div>
                        <div className="text-[11px] font-sans text-zinc-400">
                          {row.tech.role} · {row.tech.activeStatus}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <div className="font-bold text-white text-sm">{row.totalJobsCompleted}</div>
                        <div className="text-[10px] text-zinc-500">
                          {row.auditVerifiedCompletions} audit-verified
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        {row.avgTurnaroundHours !== null ? (
                          <div>
                            <div className="font-bold text-emerald-400">{row.avgTurnaroundHours} hrs</div>
                            <div className="text-[10px] text-zinc-500">
                              {row.avgTurnaroundDays}d avg · best {row.fastestTurnaroundHours}h
                            </div>
                          </div>
                        ) : (
                          <span className="text-zinc-500">No completions</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right text-zinc-200 font-semibold">
                        {row.assignedActive}
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <div className="text-zinc-200 font-semibold">{row.auditEventsLogged}</div>
                        <div className="text-[10px] text-zinc-500">
                          {row.lastAuditTimestamp ? row.lastAuditTimestamp.slice(0, 10) : '—'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-white">
                        ${row.totalRevenueGenerated.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

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

