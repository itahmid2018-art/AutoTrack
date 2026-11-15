import { AnalyticsMetricsConfig } from '../types';

export type AnalyticsMetricKey = keyof AnalyticsMetricsConfig;

export interface AnalyticsMetricDefinition {
  key: AnalyticsMetricKey;
  label: string;
  description: string;
  group: 'Core KPIs' | 'Dashboard Sections';
}

export const DEFAULT_ANALYTICS_METRICS: AnalyticsMetricsConfig = {
  activeJobs: true,
  lowInventory: true,
  revenue: true,
  todaysAppointments: true,
  avgRepairTime: true,
  topGrievance: true,
  technicianPerformance: true,
  categoryVolume: true,
};

export const CORE_ANALYTICS_METRICS: AnalyticsMetricsConfig = {
  activeJobs: true,
  lowInventory: true,
  revenue: true,
  todaysAppointments: true,
  avgRepairTime: false,
  topGrievance: false,
  technicianPerformance: false,
  categoryVolume: false,
};

export const ANALYTICS_METRIC_DEFINITIONS: AnalyticsMetricDefinition[] = [
  {
    key: 'activeJobs',
    label: 'Active Jobs',
    description: 'Open service tickets in progress, logged labor hours, and ready-for-pickup count.',
    group: 'Core KPIs',
  },
  {
    key: 'lowInventory',
    label: 'Low Inventory',
    description: 'SKUs at or below minimum threshold, AI reorder alerts, and stock valuation health.',
    group: 'Core KPIs',
  },
  {
    key: 'revenue',
    label: 'Revenue',
    description: 'Monthly revenue KPI card, billing charts, and labor vs. spare parts financial breakdown.',
    group: 'Core KPIs',
  },
  {
    key: 'todaysAppointments',
    label: "Today's Appointments",
    description: 'Scheduled workshop bench slots, promised completions, and client maintenance due today.',
    group: 'Core KPIs',
  },
  {
    key: 'avgRepairTime',
    label: 'Average Repair Time',
    description: 'Mean intake-to-pickup turnaround hours and days across completed tool repairs.',
    group: 'Dashboard Sections',
  },
  {
    key: 'topGrievance',
    label: 'Top Grievances',
    description: 'Most frequent client-reported failure KPI card and grievance ranking breakdown.',
    group: 'Dashboard Sections',
  },
  {
    key: 'technicianPerformance',
    label: 'Technician Performance',
    description: 'Audit-log derived completions, turnaround benchmarks, and billed revenue per technician.',
    group: 'Dashboard Sections',
  },
  {
    key: 'categoryVolume',
    label: 'Tool Category Volume',
    description: 'Ticket distribution across rotary hammers, cordless tools, grinders, and bench equipment.',
    group: 'Dashboard Sections',
  },
];

export function resolveAnalyticsMetrics(
  config?: Partial<AnalyticsMetricsConfig> | null
): AnalyticsMetricsConfig {
  return {
    activeJobs: config?.activeJobs ?? DEFAULT_ANALYTICS_METRICS.activeJobs,
    lowInventory: config?.lowInventory ?? DEFAULT_ANALYTICS_METRICS.lowInventory,
    revenue: config?.revenue ?? DEFAULT_ANALYTICS_METRICS.revenue,
    todaysAppointments: config?.todaysAppointments ?? DEFAULT_ANALYTICS_METRICS.todaysAppointments,
    avgRepairTime: config?.avgRepairTime ?? DEFAULT_ANALYTICS_METRICS.avgRepairTime,
    topGrievance: config?.topGrievance ?? DEFAULT_ANALYTICS_METRICS.topGrievance,
    technicianPerformance: config?.technicianPerformance ?? DEFAULT_ANALYTICS_METRICS.technicianPerformance,
    categoryVolume: config?.categoryVolume ?? DEFAULT_ANALYTICS_METRICS.categoryVolume,
  };
}

export function countEnabledAnalyticsMetrics(config: AnalyticsMetricsConfig): number {
  return Object.values(config).filter(Boolean).length;
}
