import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  Clock,
  KeyRound,
  RotateCcw,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import {
  fetchStatusDistribution,
  fetchSummary,
  fetchTimeseries,
  fetchTopEndpoints,
} from '../api/analytics';
import { fetchKeyStats } from '../api/keys';
import { useRange } from '../components/Layout';
import { MethodBadge } from '../components/MethodBadge';
import { StatCard } from '../components/StatCard';
import { EmptyState } from '../components/EmptyState';
import {
  bucketLabel,
  formatLatency,
  formatNumber,
  formatPercent,
  rangeDaysLabel,
  STATUS_CLASS_COLORS,
} from '../lib/format';
import type { TimeseriesInterval } from '../lib/types';

const CHART_TOOLTIP = {
  contentStyle: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '8px',
    fontSize: '12px',
  },
  labelStyle: { color: '#94a3b8' },
  itemStyle: { color: '#e2e8f0' },
} as const;

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="h-3 w-24 rounded bg-slate-800" />
      <div className="mt-4 h-7 w-20 rounded bg-slate-800" />
    </div>
  );
}

function ChartSkeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-800/40 ${className}`} />;
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2 text-sm text-rose-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="truncate">{message}</span>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-rose-500/30 px-2.5 py-1 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20"
      >
        <RotateCcw className="h-3 w-3" />
        Retry
      </button>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  accent: 'indigo' | 'emerald' | 'amber' | 'sky';
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

function MetricCard({ title, value, hint, icon, accent, isLoading, isError, onRetry }: MetricCardProps) {
  if (isLoading) return <SkeletonCard />;
  if (isError) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-5">
        <p className="text-sm text-rose-400">{title} unavailable</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-rose-300 transition hover:text-rose-200"
        >
          <RotateCcw className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }
  return (
    <StatCard title={title} value={value} hint={hint} icon={icon} accent={accent} />
  );
}

export function Dashboard() {
  const { days } = useRange();
  // 24h of hourly buckets is readable; 30d needs daily buckets.
  const interval: TimeseriesInterval = days === 30 ? 'day' : 'hour';

  const summary = useQuery({
    queryKey: ['analytics', 'summary', days],
    queryFn: () => fetchSummary({ days }),
  });

  const timeseries = useQuery({
    queryKey: ['analytics', 'timeseries', days, interval],
    queryFn: () => fetchTimeseries({ days, interval }),
  });

  const distribution = useQuery({
    queryKey: ['analytics', 'status-distribution', days],
    queryFn: () => fetchStatusDistribution({ days }),
  });

  const topEndpoints = useQuery({
    queryKey: ['analytics', 'top-endpoints', days],
    queryFn: () => fetchTopEndpoints({ days }),
  });

  const keyStats = useQuery({
    queryKey: ['keys', 'stats'],
    queryFn: fetchKeyStats,
  });

  const chartData =
    timeseries.data?.points.map((point) => ({
      label: bucketLabel(point.bucket, interval),
      total: point.total,
      errors: point.errors,
    })) ?? [];

  const pieData =
    distribution.data?.by_class
      .filter((item) => item.count > 0)
      .map((item) => ({ name: item.bucket, value: item.count })) ?? [];

  const topCount = topEndpoints.data?.results[0]?.count ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-100">Overview</h2>
        <p className="text-sm text-slate-400">
          Traffic and health across all your APIs · {rangeDaysLabel(days).toLowerCase()}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total requests"
          value={formatNumber(summary.data?.total_requests ?? 0)}
          hint={rangeDaysLabel(days)}
          icon={Activity}
          accent="indigo"
          isLoading={summary.isLoading}
          isError={summary.isError}
          onRetry={() => summary.refetch()}
        />
        <MetricCard
          title="Success rate"
          value={formatPercent(summary.data?.success_rate ?? 0)}
          hint={`${formatNumber(summary.data?.error_count ?? 0)} errors`}
          icon={TrendingUp}
          accent="emerald"
          isLoading={summary.isLoading}
          isError={summary.isError}
          onRetry={() => summary.refetch()}
        />
        <MetricCard
          title="Avg latency"
          value={formatLatency(summary.data?.avg_latency_ms ?? null)}
          hint="Across all endpoints"
          icon={Clock}
          accent="sky"
          isLoading={summary.isLoading}
          isError={summary.isError}
          onRetry={() => summary.refetch()}
        />
        <MetricCard
          title="Active keys"
          value={formatNumber(keyStats.data?.active ?? 0)}
          hint={`${formatNumber(keyStats.data?.total ?? 0)} keys · ${
            summary.data?.projects ?? 0
          } projects`}
          icon={KeyRound}
          accent="amber"
          isLoading={keyStats.isLoading}
          isError={keyStats.isError}
          onRetry={() => keyStats.refetch()}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Requests over time</h3>
              <p className="text-xs text-slate-500">
                {interval === 'hour' ? 'Hourly' : 'Daily'} buckets, total vs. errors
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-indigo-400" />
                Requests
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                Errors
              </span>
            </div>
          </div>

          {timeseries.isError ? (
            <ErrorPanel
              message="Failed to load the requests chart."
              onRetry={() => timeseries.refetch()}
            />
          ) : timeseries.isLoading ? (
            <ChartSkeleton className="h-72" />
          ) : chartData.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No traffic yet"
              description="Requests routed through the gateway will show up here."
            />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="fillErrors" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#1e293b' }}
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                  />
                  <Tooltip {...CHART_TOOLTIP} cursor={{ stroke: '#334155' }} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Requests"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#fillTotal)"
                  />
                  <Area
                    type="monotone"
                    dataKey="errors"
                    name="Errors"
                    stroke="#f43f5e"
                    strokeWidth={1.5}
                    fill="url(#fillErrors)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-sm font-semibold text-slate-200">Status classes</h3>
          <p className="text-xs text-slate-500">Distribution of response codes</p>

          {distribution.isError ? (
            <div className="mt-4">
              <ErrorPanel
                message="Failed to load status distribution."
                onRetry={() => distribution.refetch()}
              />
            </div>
          ) : distribution.isLoading ? (
            <ChartSkeleton className="mt-4 h-56" />
          ) : pieData.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No responses yet" description="Complete a request to populate this chart." />
            </div>
          ) : (
            <>
              <div className="mt-2 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                      stroke="#0f172a"
                    >
                      {pieData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={STATUS_CLASS_COLORS[entry.name] ?? '#64748b'}
                        />
                      ))}
                    </Pie>
                    <Tooltip {...CHART_TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 space-y-2">
                {pieData.map((entry) => (
                  <li
                    key={entry.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2 text-slate-400">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: STATUS_CLASS_COLORS[entry.name] ?? '#64748b',
                        }}
                      />
                      {entry.name}
                    </span>
                    <span className="font-medium text-slate-200">
                      {formatNumber(entry.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* Top endpoints — ranked list */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Top endpoints</h3>
            <p className="text-xs text-slate-500">Hottest routes in the period</p>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-400">
            {rangeDaysLabel(days)}
          </span>
        </div>

        {topEndpoints.isError ? (
          <ErrorPanel
            message="Failed to load top endpoints."
            onRetry={() => topEndpoints.refetch()}
          />
        ) : topEndpoints.isLoading ? (
          <div className="space-y-2">
            <ChartSkeleton className="h-11" />
            <ChartSkeleton className="h-11" />
            <ChartSkeleton className="h-11" />
          </div>
        ) : (topEndpoints.data?.results.length ?? 0) === 0 ? (
          <EmptyState
            title="No endpoint traffic"
            description="Call your gateway to see your hottest endpoints here."
          />
        ) : (
          <ol className="space-y-1.5">
            {topEndpoints.data?.results.map((endpoint, index) => {
              const share = topCount > 0 ? (endpoint.count / topCount) * 100 : 0;
              return (
                <li
                  key={`${endpoint.method} ${endpoint.path}`}
                  className="group relative flex items-center gap-3 overflow-hidden rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2.5 transition hover:border-slate-700 hover:bg-slate-900"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 bg-indigo-500/10 transition-all"
                    style={{ width: `${share}%` }}
                  />
                  <span className="relative w-5 shrink-0 text-right font-mono text-xs text-slate-600">
                    {index + 1}
                  </span>
                  <span className="relative shrink-0">
                    <MethodBadge method={endpoint.method} />
                  </span>
                  <span
                    className="relative min-w-0 flex-1 truncate font-mono text-xs text-slate-300"
                    title={endpoint.path}
                  >
                    {endpoint.path}
                  </span>
                  <span className="relative shrink-0 text-xs text-slate-500">
                    avg {formatLatency(endpoint.avg_latency_ms)}
                  </span>
                  <span className="relative w-20 shrink-0 text-right font-medium text-slate-200">
                    {formatNumber(endpoint.count)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
