// ─────────────────────────────────────────────────────────────────────────────
// pages/reports/ReportsPage.tsx
// Four reports behind one toolbar. Tabs rather than a single scrolling page:
// each tab owns its query and only fetches when selected, so opening Reports
// costs one aggregation instead of four.
//
// No FilterBar here, deliberately. FilterBar's search input is mandatory, and
// there is nothing to search on a forecast or a time series — a dead control is
// worse than a bespoke toolbar. The controls below are built from the same
// field.tsx primitives every form in the app uses, so the chrome still matches.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, BarChart3, Download, Target, TrendingUp, Users } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import DataTable, { type Column } from '@/components/common/DataTable';
import AvatarWithInitials from '@/components/common/AvatarWithInitials';
import SegmentedControl from '@/components/ui/segmented-control';
import { Button } from '@/components/ui/button';
import { selectClass, controlClass } from '@/components/ui/field';
import { DashCard, DashCardHeader, Metric, MetricLabel } from '@/components/dashboard/DashCard';
import CardErrorState from '@/components/dashboard/CardErrorState';
import {
  useActivitySummary,
  useLeadSourceRoi,
  usePipelineForecast,
  useSalesPerformance,
} from '@/hooks/useReports';
import { leadsService } from '@/services/api/leadsService';
import { useQuery } from '@tanstack/react-query';
import type {
  ActivityDay,
  SalesPerformanceRow,
  SourceRoiRow,
} from '@/services/api/reportsService';
import { axisTick, chartColor, seriesColor, tooltipStyle } from '@/lib/chartTheme';
import { formatCompactCurrency, formatCurrency, formatNumber } from '@/lib/format';
import { downloadCsv, stampedFilename, toCsv } from '@/lib/csv';
import { DURATION, EASE_OUT, pageVariants } from '@/lib/motion';
import { cn } from '@/lib/cn';

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'performance' | 'forecast' | 'sources' | 'activity';

const TABS = [
  { value: 'performance' as const, label: 'Performance' },
  { value: 'forecast' as const, label: 'Forecast' },
  { value: 'sources' as const, label: 'Sources' },
  { value: 'activity' as const, label: 'Activity' },
];

// ── Date range presets ────────────────────────────────────────────────────────
// Presets cover the questions people actually ask; `custom` reveals two native
// date inputs rather than shipping a bespoke calendar widget for a control used
// once a week.

type RangeKey = '7d' | '30d' | '90d' | 'ytd' | 'all' | 'custom';

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom…' },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Resolve a preset into the {from,to} the API expects. `all` sends neither. */
function resolveRange(
  key: RangeKey,
  custom: { from: string; to: string }
): { from?: string; to?: string } {
  switch (key) {
    case '7d':
      return { from: isoDaysAgo(6) };
    case '30d':
      return { from: isoDaysAgo(29) };
    case '90d':
      return { from: isoDaysAgo(89) };
    case 'ytd':
      return { from: `${new Date().getUTCFullYear()}-01-01` };
    case 'custom':
      return { from: custom.from || undefined, to: custom.to || undefined };
    case 'all':
    default:
      return {};
  }
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function SummaryStrip({
  items,
}: {
  items: { label: string; value: string; hint?: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <DashCard key={item.label} className="p-4">
          <MetricLabel>{item.label}</MetricLabel>
          <Metric value={item.value} className="mt-1.5" />
          {item.hint && <p className="mt-1 text-[11px] text-muted-foreground">{item.hint}</p>}
        </DashCard>
      ))}
    </div>
  );
}

function ChartFrame({
  title,
  subtitle,
  action,
  icon,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <DashCard className={cn('p-5', className)}>
      <DashCardHeader title={title} subtitle={subtitle} action={action} icon={icon} />
      <div className="mt-5">{children}</div>
    </DashCard>
  );
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-11 animate-pulse rounded-lg bg-muted/60" />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — Sales performance
// ─────────────────────────────────────────────────────────────────────────────

type SortKey = keyof Pick<
  SalesPerformanceRow,
  'leadsAssigned' | 'dealsWon' | 'revenue' | 'conversionRate' | 'avgDealSize' | 'avgDaysToClose'
>;

function PerformanceTab({
  range,
  assignedTo,
}: {
  range: { from?: string; to?: string };
  assignedTo?: string;
}) {
  const { data, isLoading, isError, refetch } = useSalesPerformance({ ...range, assignedTo });
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Sorted client-side: the row set is one per active user, so paging it back
  // through the server for an ordering change would be a round trip for nothing.
  const rows = useMemo(() => {
    const list = [...(data?.rows ?? [])].map((r) => ({ ...r, id: r.userId }));
    return list.sort((a, b) => {
      // Nulls (no closed deal yet) sort last in both directions rather than
      // reading as "fastest to close".
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null) return 1;
      if (bv === null) return -1;
      return sortOrder === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
  }, [data, sortKey, sortOrder]);

  const handleSort = (key: string) => {
    if (key === sortKey) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key as SortKey);
      setSortOrder('desc');
    }
  };

  const exportCsv = () => {
    downloadCsv(
      stampedFilename('sales-performance'),
      toCsv(rows, [
        { header: 'Rep', value: (r) => `${r.firstName} ${r.lastName}` },
        { header: 'Email', value: (r) => r.email },
        { header: 'Role', value: (r) => r.role },
        { header: 'Leads assigned', value: (r) => r.leadsAssigned },
        { header: 'Leads won', value: (r) => r.leadsWon },
        { header: 'Deals won', value: (r) => r.dealsWon },
        { header: 'Revenue', value: (r) => r.revenue },
        { header: 'Conversion %', value: (r) => r.conversionRate },
        { header: 'Avg deal size', value: (r) => r.avgDealSize },
        { header: 'Avg days to close', value: (r) => r.avgDaysToClose ?? '' },
      ])
    );
  };

  if (isError) return <CardErrorState message="Couldn't load sales performance" onRetry={refetch} />;

  const totals = data?.totals;

  const columns: Column<SalesPerformanceRow & { id: string }>[] = [
    {
      key: 'rep',
      header: 'Rep',
      accessor: (row) => (
        <div className="flex items-center gap-2.5">
          <AvatarWithInitials firstName={row.firstName} lastName={row.lastName} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-foreground">
              {row.firstName} {row.lastName}
            </p>
            <p className="truncate text-[11px] capitalize text-muted-foreground">{row.role}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'leadsAssigned',
      header: 'Leads',
      align: 'right',
      sortable: true,
      accessor: (row) => <span className="tabular-nums">{formatNumber(row.leadsAssigned)}</span>,
    },
    {
      key: 'dealsWon',
      header: 'Won',
      align: 'right',
      sortable: true,
      accessor: (row) => <span className="tabular-nums">{formatNumber(row.dealsWon)}</span>,
    },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      sortable: true,
      accessor: (row) => (
        <span className="font-medium tabular-nums text-foreground">
          {formatCurrency(row.revenue)}
        </span>
      ),
    },
    {
      key: 'conversionRate',
      header: 'Conv.',
      align: 'right',
      sortable: true,
      accessor: (row) => <span className="tabular-nums">{row.conversionRate}%</span>,
    },
    {
      key: 'avgDealSize',
      header: 'Avg deal',
      align: 'right',
      sortable: true,
      hideOnMobile: true,
      accessor: (row) => <span className="tabular-nums">{formatCurrency(row.avgDealSize)}</span>,
    },
    {
      key: 'avgDaysToClose',
      header: 'Days to close',
      align: 'right',
      sortable: true,
      hideOnMobile: true,
      accessor: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {row.avgDaysToClose === null ? '—' : `${row.avgDaysToClose}d`}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <SummaryStrip
        items={[
          { label: 'Revenue', value: formatCurrency(totals?.revenue ?? 0) },
          { label: 'Deals won', value: formatNumber(totals?.dealsWon ?? 0) },
          {
            label: 'Conversion',
            value: `${totals?.conversionRate ?? 0}%`,
            hint: `${formatNumber(totals?.leadsWon ?? 0)} of ${formatNumber(totals?.leadsAssigned ?? 0)} leads`,
          },
          { label: 'Avg deal size', value: formatCurrency(totals?.avgDealSize ?? 0) },
        ]}
      />

      <ChartFrame
        title="Per-rep breakdown"
        subtitle="Leads are counted by created date, revenue by close date."
        icon={<Users size={14} />}
        action={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download size={13} />
            Export CSV
          </Button>
        }
      >
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          sortColumn={sortKey}
          sortOrder={sortOrder}
          onSort={handleSort}
          density="compact"
          emptyIcon={<Users size={22} />}
          emptyTitle="No activity in this range"
          emptyMessage="Nobody was assigned a lead or closed a deal in the selected window."
        />
      </ChartFrame>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — Pipeline forecast
// ─────────────────────────────────────────────────────────────────────────────

function ForecastTab() {
  const { data, isLoading, isError, refetch } = usePipelineForecast();

  if (isError) return <CardErrorState message="Couldn't load the forecast" onRetry={refetch} />;

  const open = (data?.stages ?? []).filter((s) => s.stage !== 'Won' && s.stage !== 'Lost');
  // Bars are scaled against the largest *gross* stage value, so the weighted
  // overlay reads as a proportion of it rather than being rescaled per row.
  const max = Math.max(...open.map((s) => s.value), 1);

  return (
    <div className="space-y-5">
      <SummaryStrip
        items={[
          {
            label: 'Weighted forecast',
            value: formatCurrency(data?.totals.weightedForecast ?? 0),
            hint: 'Open pipeline only',
          },
          {
            label: 'Gross open pipeline',
            value: formatCurrency(data?.totals.openValue ?? 0),
            hint: `${formatNumber(data?.totals.openCount ?? 0)} deals`,
          },
          {
            label: 'Closed won',
            value: formatCurrency(data?.totals.closedWonValue ?? 0),
            hint: `${formatNumber(data?.totals.closedWonCount ?? 0)} deals`,
          },
          {
            label: 'Avg confidence',
            value:
              data && data.totals.openValue > 0
                ? `${Math.round((data.totals.weightedForecast / data.totals.openValue) * 100)}%`
                : '—',
            hint: 'Weighted ÷ gross',
          },
        ]}
      />

      <ChartFrame
        title="Funnel by stage"
        subtitle="Bar length is gross value; the filled portion is value × win probability."
        icon={<Target size={14} />}
      >
        {isLoading ? (
          <TableSkeleton rows={4} />
        ) : (
          <div className="space-y-3">
            {open.map((stage) => (
              <div key={stage.stage}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-foreground">
                    {stage.stage}
                    <span className="ml-2 text-[11px] font-normal tabular-nums text-muted-foreground">
                      {stage.count} deal{stage.count === 1 ? '' : 's'} ·{' '}
                      {Math.round(stage.probability * 100)}%
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">
                    {formatCompactCurrency(stage.weightedValue)}
                    <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                      of {formatCompactCurrency(stage.value)}
                    </span>
                  </span>
                </div>

                <div className="h-7 w-full overflow-hidden rounded-md bg-muted/50">
                  <div
                    className="h-full bg-primary/15 transition-[width] duration-500 ease-out"
                    style={{ width: `${(stage.value / max) * 100}%` }}
                  >
                    <div
                      className="h-full bg-primary/70 transition-[width] duration-500 ease-out"
                      style={{
                        width: stage.value === 0 ? '0%' : `${stage.probability * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ChartFrame>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — Lead source ROI
// ─────────────────────────────────────────────────────────────────────────────

function SourcesTab({ range }: { range: { from?: string; to?: string } }) {
  const { data, isLoading, isError, refetch } = useLeadSourceRoi(range);

  const rows = useMemo(() => (data?.rows ?? []).map((r) => ({ ...r, id: r.source })), [data]);

  const exportCsv = () => {
    downloadCsv(
      stampedFilename('lead-source-roi'),
      toCsv(rows, [
        { header: 'Source', value: (r) => r.source },
        { header: 'Leads', value: (r) => r.leads },
        { header: 'Leads won', value: (r) => r.wonLeads },
        { header: 'Deals won', value: (r) => r.dealsWon },
        { header: 'Revenue', value: (r) => r.revenue },
        { header: 'Conversion %', value: (r) => r.conversionRate },
        { header: 'Revenue per lead', value: (r) => r.revenuePerLead },
      ])
    );
  };

  if (isError) return <CardErrorState message="Couldn't load source ROI" onRetry={refetch} />;

  const columns: Column<SourceRoiRow & { id: string }>[] = [
    {
      key: 'source',
      header: 'Source',
      accessor: (row) => (
        <span className="text-[13px] font-medium text-foreground">{row.source}</span>
      ),
    },
    {
      key: 'leads',
      header: 'Leads',
      align: 'right',
      accessor: (row) => <span className="tabular-nums">{formatNumber(row.leads)}</span>,
    },
    {
      key: 'dealsWon',
      header: 'Won',
      align: 'right',
      accessor: (row) => <span className="tabular-nums">{formatNumber(row.dealsWon)}</span>,
    },
    {
      key: 'conversionRate',
      header: 'Conv.',
      align: 'right',
      hideOnMobile: true,
      accessor: (row) => <span className="tabular-nums">{row.conversionRate}%</span>,
    },
    {
      key: 'revenuePerLead',
      header: 'Rev / lead',
      align: 'right',
      hideOnMobile: true,
      accessor: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {formatCurrency(row.revenuePerLead)}
        </span>
      ),
    },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      accessor: (row) => (
        <span className="font-medium tabular-nums text-foreground">
          {formatCurrency(row.revenue)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <ChartFrame
        title="Revenue by source"
        subtitle="Won deals attributed to the source of their originating lead."
        icon={<BarChart3 size={14} />}
        action={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download size={13} />
            Export CSV
          </Button>
        }
      >
        {isLoading ? (
          <div className="h-[260px] animate-pulse rounded-lg bg-muted/50" />
        ) : rows.length === 0 ? (
          <p className="py-14 text-center text-[13px] text-muted-foreground">
            No won deals in this range to attribute.
          </p>
        ) : (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {/* Horizontal bars: source names are words, and words belong on a
                  vertical axis where they can be read without rotating them. */}
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} stroke={chartColor.grid} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => formatCompactCurrency(v)}
                />
                <YAxis
                  type="category"
                  dataKey="source"
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                />
                <Tooltip
                  {...tooltipStyle}
                  cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
                  formatter={(value) => [formatCurrency(Number(value)), 'Revenue'] as [string, string]}
                />
                <Bar dataKey="revenue" fill={seriesColor(1)} radius={[0, 5, 5, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartFrame>

      <ChartFrame title="Source detail" icon={<BarChart3 size={14} />}>
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          density="compact"
          emptyIcon={<BarChart3 size={22} />}
          emptyTitle="No sources yet"
          emptyMessage="Once leads carry a source and deals close, attribution shows up here."
        />
      </ChartFrame>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — Activity timeline
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVITY_SERIES = [
  { key: 'leadsCreated' as const, label: 'Leads created', color: seriesColor(0) },
  { key: 'tasksCompleted' as const, label: 'Tasks completed', color: seriesColor(2) },
  { key: 'dealsWon' as const, label: 'Deals won', color: seriesColor(1) },
];

function ActivityTab({ range }: { range: { from?: string; to?: string } }) {
  const { data, isLoading, isError, refetch } = useActivitySummary(range);

  const exportCsv = () => {
    downloadCsv(
      stampedFilename('activity-summary'),
      toCsv(data?.series ?? [], [
        { header: 'Date', value: (r: ActivityDay) => r.date },
        { header: 'Leads created', value: (r: ActivityDay) => r.leadsCreated },
        { header: 'Tasks completed', value: (r: ActivityDay) => r.tasksCompleted },
        { header: 'Deals closed', value: (r: ActivityDay) => r.dealsClosed },
        { header: 'Deals won', value: (r: ActivityDay) => r.dealsWon },
      ])
    );
  };

  if (isError) return <CardErrorState message="Couldn't load activity" onRetry={refetch} />;

  const totals = data?.totals;

  return (
    <div className="space-y-5">
      <SummaryStrip
        items={[
          { label: 'Leads created', value: formatNumber(totals?.leadsCreated ?? 0) },
          { label: 'Tasks completed', value: formatNumber(totals?.tasksCompleted ?? 0) },
          { label: 'Deals won', value: formatNumber(totals?.dealsWon ?? 0) },
          {
            label: 'Days in range',
            value: formatNumber(data?.range.days ?? 0),
            hint: data?.range.truncated ? 'Clamped to 366' : undefined,
          },
        ]}
      />

      {/* The API clamps ranges over 366 days. Saying so beats quietly drawing a
          shorter chart than the one that was asked for. */}
      {data?.range.truncated && (
        <div className="flex items-start gap-2.5 rounded-lg border border-status-warn/30 bg-status-warn/[0.06] px-3.5 py-2.5">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-status-warn" />
          <p className="text-[13px] text-foreground">
            That range is longer than a year — showing the most recent 366 days.
          </p>
        </div>
      )}

      <ChartFrame
        title="Daily activity"
        subtitle="Every day in range is plotted, including days with no activity."
        icon={<TrendingUp size={14} />}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={!data?.series.length}
          >
            <Download size={13} />
            Export CSV
          </Button>
        }
      >
        {isLoading ? (
          <div className="h-[280px] animate-pulse rounded-lg bg-muted/50" />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              {ACTIVITY_SERIES.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  {s.label}
                </span>
              ))}
            </div>

            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data?.series ?? []}
                  margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke={chartColor.grid} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                    tickFormatter={(v: string) => v.slice(5).replace('-', '/')}
                  />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} cursor={{ stroke: chartColor.grid }} />
                  {ACTIVITY_SERIES.map((s) => (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.label}
                      stroke={s.color}
                      strokeWidth={2}
                      // A dot per day is noise at 90+ points; the hover dot
                      // still appears on the active index.
                      dot={false}
                      activeDot={{ r: 3.5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </ChartFrame>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('performance');
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [assignedTo, setAssignedTo] = useState('');

  const range = useMemo(() => resolveRange(rangeKey, custom), [rangeKey, custom]);

  // Same endpoint the lead drawer uses for its assignee dropdown — no second
  // way to ask "who is in this org".
  const { data: users = [] } = useQuery({
    queryKey: ['org-users'],
    queryFn: () => leadsService.getOrgUsers(),
  });

  // Forecast is a point-in-time snapshot of open deals — a date range has no
  // meaning for it, so the range controls hide rather than sit there inert.
  const rangeApplies = tab !== 'forecast';

  return (
    <>
      <Helmet>
        <title>Reports — ElevateCRM</title>
        <meta name="description" content="Sales performance, pipeline forecast, and source ROI." />
      </Helmet>

      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="mx-auto flex min-h-[calc(100vh-7.5rem)] max-w-[1600px] flex-col"
      >
        <PageHeader
          title="Reports"
          description="Deeper cuts than the dashboard — filterable and exportable."
          className="mb-8"
          actions={
            <SegmentedControl
              segments={TABS}
              value={tab}
              onChange={setTab}
              layoutId="reports-tabs"
              size="md"
              aria-label="Report"
            />
          }
        />

        {/* Toolbar */}
        {rangeApplies && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <select
              value={rangeKey}
              onChange={(e) => setRangeKey(e.target.value as RangeKey)}
              aria-label="Date range"
              className={cn(selectClass, 'w-auto min-w-[150px]')}
            >
              {RANGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            {rangeKey === 'custom' && (
              <motion.div
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: DURATION.fast, ease: EASE_OUT }}
                className="flex items-center gap-2"
              >
                <input
                  type="date"
                  value={custom.from}
                  max={custom.to || undefined}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                  aria-label="From date"
                  className={cn(controlClass, 'w-auto')}
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={custom.to}
                  min={custom.from || undefined}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                  aria-label="To date"
                  className={cn(controlClass, 'w-auto')}
                />
              </motion.div>
            )}

            {tab === 'performance' && (
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                aria-label="Filter by rep"
                className={cn(selectClass, 'w-auto min-w-[150px]')}
              >
                <option value="">All reps</option>
                {users.map((u: { id?: string; _id?: string; firstName: string; lastName: string }) => (
                  <option key={u.id ?? u._id} value={u.id ?? u._id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Panels — each hook is gated on its tab, so only the visible report
            fetches. Switching back reads from cache. */}
        {tab === 'performance' && (
          <PerformanceTab range={range} assignedTo={assignedTo || undefined} />
        )}
        {tab === 'forecast' && <ForecastTab />}
        {tab === 'sources' && <SourcesTab range={range} />}
        {tab === 'activity' && <ActivityTab range={range} />}
      </motion.div>
    </>
  );
}
