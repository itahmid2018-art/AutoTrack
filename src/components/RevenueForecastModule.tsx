import React, { useMemo, useState } from 'react';
import { JobCard, RecurringMaintenance } from '../types';
import {
  ForecastHorizon,
  ForecastScenario,
  RevenueForecastPoint,
  generateMonthlyRevenueForecast,
} from '../utils/revenueForecast';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, Calendar, Layers } from 'lucide-react';

interface ForecastTooltipPayloadEntry {
  name?: string;
  value?: number;
  dataKey?: string;
  payload?: RevenueForecastPoint;
}

interface ForecastTooltipProps {
  active?: boolean;
  payload?: ForecastTooltipPayloadEntry[];
  currencySymbol?: string;
}

const ForecastChartTooltip: React.FC<ForecastTooltipProps> = ({
  active,
  payload,
  currencySymbol = '$',
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="bg-zinc-950 border border-zinc-700 rounded-xl p-3.5 shadow-2xl font-mono text-xs space-y-2 min-w-[230px]">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-1.5">
        <span className="text-white font-bold">{point.label}</span>
        <span className="text-[11px] text-zinc-400">
          {point.isForecast ? 'Forecast' : 'Recorded'}
        </span>
      </div>

      {point.actualRevenue !== null && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-400">Actual Revenue:</span>
          <span className="text-white font-bold tabular-nums">
            {currencySymbol}
            {point.actualRevenue.toFixed(2)}
          </span>
        </div>
      )}

      {point.forecastRevenue !== null && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-sky-400">Projected Revenue:</span>
          <span className="text-sky-300 font-bold tabular-nums">
            {currencySymbol}
            {point.forecastRevenue.toFixed(2)}
          </span>
        </div>
      )}

      {point.isForecast &&
        point.confidenceLow !== null &&
        point.confidenceHigh !== null && (
          <div className="flex items-center justify-between gap-4 text-[11px]">
            <span className="text-zinc-400">Confidence Range:</span>
            <span className="text-zinc-300 tabular-nums">
              {currencySymbol}
              {point.confidenceLow.toFixed(0)} – {currencySymbol}
              {point.confidenceHigh.toFixed(0)}
            </span>
          </div>
        )}

      <div className="border-t border-zinc-800/80 pt-1.5 space-y-1 text-[11px]">
        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-400">Seasonal Factor:</span>
          <span className="text-amber-300 font-semibold tabular-nums">
            {point.seasonalIndex.toFixed(2)}x · {point.seasonalFactorLabel}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-400">
            {point.isForecast ? 'Est. Tickets:' : 'Logged Tickets:'}
          </span>
          <span className="text-zinc-200 tabular-nums">
            {point.expectedJobs}
            {point.scheduledMaintenanceCount > 0
              ? ` (${point.scheduledMaintenanceCount} fleet due)`
              : ''}
          </span>
        </div>
      </div>
    </div>
  );
};

interface RevenueForecastModuleProps {
  jobCards: JobCard[];
  schedules?: RecurringMaintenance[];
  currencySymbol?: string;
}

export const RevenueForecastModule: React.FC<RevenueForecastModuleProps> = ({
  jobCards,
  schedules = [],
  currencySymbol = '$',
}) => {
  const [horizonMonths, setHorizonMonths] = useState<ForecastHorizon>(6);
  const [scenario, setScenario] = useState<ForecastScenario>('baseline');
  const [showConfidenceBounds, setShowConfidenceBounds] = useState<boolean>(true);

  const forecast = useMemo(
    () => generateMonthlyRevenueForecast(jobCards, schedules, horizonMonths, scenario),
    [jobCards, schedules, horizonMonths, scenario]
  );

  const forecastOnlyRows = useMemo(
    () => forecast.series.filter((p) => p.isForecast),
    [forecast.series]
  );

  const hasJobHistory = jobCards.some((j) => j.status !== 'Cancelled');

  return (
    <section
      aria-labelledby="revenue-forecast-heading"
      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xl"
    >
      {/* Header & Interactive Forecast Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-sky-400 shrink-0" />
            <h3
              id="revenue-forecast-heading"
              className="text-sm sm:text-base font-bold text-white uppercase tracking-wider font-mono"
            >
              Predictive Monthly Revenue Forecast
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Projects future monthly workshop revenue from historical job billings, seasonal construction demand indices, and scheduled fleet maintenance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Horizon Selector */}
          <div
            role="group"
            aria-label="Forecast horizon"
            className="flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-lg font-mono"
          >
            {([3, 6, 12] as ForecastHorizon[]).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHorizonMonths(h)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  horizonMonths === h
                    ? 'bg-white text-zinc-950'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {h}M Horizon
              </button>
            ))}
          </div>

          {/* Scenario Sensitivity Selector */}
          <div
            role="group"
            aria-label="Forecast scenario"
            className="flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-lg font-mono"
          >
            {(
              [
                { id: 'conservative', label: 'Conservative' },
                { id: 'baseline', label: 'Baseline' },
                { id: 'growth', label: 'Growth' },
              ] as Array<{ id: ForecastScenario; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setScenario(opt.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  scenario === opt.id
                    ? 'bg-sky-400 text-zinc-950'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Confidence Bounds Toggle */}
          <button
            type="button"
            onClick={() => setShowConfidenceBounds((prev) => !prev)}
            className={`px-3 py-2 text-xs font-mono font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              showConfidenceBounds
                ? 'bg-zinc-950 border-amber-400/50 text-amber-300'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Confidence Band</span>
          </button>
        </div>
      </div>

      {!hasJobHistory ? (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-white">
            No Job Card History Available for Forecasting
          </p>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Create or import at least 1 service job card to calculate deseasonalized run-rate trends and project monthly revenue.
          </p>
        </div>
      ) : (
        <>
          {/* 4-Column Forecast KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono tabular-nums">
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-1">
              <span className="text-[11px] text-zinc-400 uppercase block">
                {horizonMonths}-Month Forecast Total
              </span>
              <div className="text-2xl font-bold text-sky-400">
                {currencySymbol}
                {forecast.projectedTotal.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="text-[11px] text-zinc-500 font-sans">
                {scenario.charAt(0).toUpperCase() + scenario.slice(1)} projection across {horizonMonths} upcoming months
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-1">
              <span className="text-[11px] text-zinc-400 uppercase block">
                Projected Monthly Avg
              </span>
              <div className="text-2xl font-bold text-white">
                {currencySymbol}
                {forecast.projectedMonthlyAvg.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="text-[11px] text-zinc-500 font-sans">
                Base run-rate {currencySymbol}
                {forecast.baselineMonthlyRunRate.toFixed(0)} · Trend{' '}
                {forecast.monthlyTrendPct >= 0
                  ? `+${forecast.monthlyTrendPct}%`
                  : `${forecast.monthlyTrendPct}%`}
                /mo
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-1">
              <span className="text-[11px] text-zinc-400 uppercase block">
                Peak Seasonal Month
              </span>
              <div className="text-2xl font-bold text-emerald-400">
                {forecast.peakMonth
                  ? `${currencySymbol}${forecast.peakMonth.forecastRevenue.toLocaleString('en-US', {
                      maximumFractionDigits: 0,
                    })}`
                  : '—'}
              </div>
              <div className="text-[11px] text-zinc-500 font-sans">
                {forecast.peakMonth
                  ? `${forecast.peakMonth.label} (${forecast.peakMonth.seasonalIndex.toFixed(2)}x seasonal demand)`
                  : 'Pending forecast window'}
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-1">
              <span className="text-[11px] text-zinc-400 uppercase block">
                Open Job Pipeline
              </span>
              <div className="text-2xl font-bold text-amber-300">
                {currencySymbol}
                {forecast.currentPipelineRevenue.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="text-[11px] text-zinc-500 font-sans">
                {forecast.currentPipelineJobs} active tickets · Avg ticket {currencySymbol}
                {forecast.avgTicketValue.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Main Recharts Forecast LineChart */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Historical Actuals &amp; Seasonal Revenue Projection ({horizonMonths}M)
                </h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Solid line tracks recorded monthly job billings; dashed sky line projects seasonal demand through {forecastOnlyRows[forecastOnlyRows.length - 1]?.label}.
                </p>
              </div>
              <div className="text-[11px] font-mono text-zinc-400 whitespace-nowrap shrink-0">
                Anchor: {forecast.anchorYearMonth}
              </div>
            </div>

            <div className="h-72 sm:h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={forecast.series}
                  margin={{ top: 14, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="shortLabel"
                    stroke="#a1a1aa"
                    tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }}
                    axisLine={{ stroke: '#3f3f46' }}
                    tickLine={false}
                    interval={horizonMonths === 12 ? 1 : 0}
                  />
                  <YAxis
                    stroke="#a1a1aa"
                    tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val: number) => `${currencySymbol}${val}`}
                    width={64}
                  />
                  <Tooltip
                    content={<ForecastChartTooltip currencySymbol={currencySymbol} />}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      paddingTop: '10px',
                    }}
                  />
                  <ReferenceLine
                    x={
                      forecast.series.find((p) => !p.isForecast && p.forecastRevenue !== null)
                        ?.shortLabel
                    }
                    stroke="#52525b"
                    strokeDasharray="3 3"
                    label={{
                      value: 'Forecast Start',
                      position: 'top',
                      fill: '#a1a1aa',
                      fontSize: 10,
                      fontFamily: 'monospace',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actualRevenue"
                    name="Actual Monthly Revenue"
                    stroke="#f4f4f5"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#f4f4f5', stroke: '#09090b', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#34d399', stroke: '#09090b', strokeWidth: 2 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="forecastRevenue"
                    name="Forecasted Revenue (Seasonal)"
                    stroke="#38bdf8"
                    strokeWidth={3}
                    strokeDasharray="6 4"
                    dot={{ r: 4, fill: '#38bdf8', stroke: '#09090b', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#ffffff', stroke: '#38bdf8', strokeWidth: 2 }}
                    connectNulls={false}
                  />
                  {showConfidenceBounds && (
                    <Line
                      type="monotone"
                      dataKey="confidenceHigh"
                      name="Upper Bound (+Confidence)"
                      stroke="#34d399"
                      strokeWidth={1.5}
                      strokeDasharray="2 4"
                      dot={false}
                      activeDot={{ r: 3, fill: '#34d399' }}
                      connectNulls={false}
                    />
                  )}
                  {showConfidenceBounds && (
                    <Line
                      type="monotone"
                      dataKey="confidenceLow"
                      name="Lower Bound (-Confidence)"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      strokeDasharray="2 4"
                      dot={false}
                      activeDot={{ r: 3, fill: '#f59e0b' }}
                      connectNulls={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Monthly Forecast & Seasonal Drivers Breakdown Table */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs font-mono tabular-nums border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 uppercase text-[10px]">
                  <th className="py-2.5 px-4">Forecast Month</th>
                  <th className="py-2.5 px-3">Seasonal Demand Driver</th>
                  <th className="py-2.5 px-3 text-right">Multiplier</th>
                  <th className="py-2.5 px-3 text-right">Est. Tickets</th>
                  <th className="py-2.5 px-3 text-right">Confidence Range</th>
                  <th className="py-2.5 px-4 text-right">Forecast Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {forecastOnlyRows.map((row) => (
                  <tr key={row.yearMonth} className="hover:bg-zinc-900/60 transition-colors">
                    <td className="py-2.5 px-4 font-bold text-white flex items-center gap-2 whitespace-nowrap">
                      <Calendar className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>{row.label}</span>
                    </td>
                    <td className="py-2.5 px-3 font-sans text-zinc-300 whitespace-nowrap">
                      {row.seasonalFactorLabel}
                      {row.scheduledMaintenanceCount > 0 && (
                        <span className="text-emerald-400 text-[11px] ml-2">
                          · {row.scheduledMaintenanceCount} fleet overhaul due
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-300 font-semibold">
                      {row.seasonalIndex.toFixed(2)}x
                    </td>
                    <td className="py-2.5 px-3 text-right text-zinc-300">
                      {row.expectedJobs}
                    </td>
                    <td className="py-2.5 px-3 text-right text-zinc-400">
                      {currencySymbol}
                      {(row.confidenceLow ?? 0).toFixed(0)} – {currencySymbol}
                      {(row.confidenceHigh ?? 0).toFixed(0)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-sky-400">
                      {currencySymbol}
                      {(row.forecastRevenue ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};
