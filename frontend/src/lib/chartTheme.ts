// ─────────────────────────────────────────────────────────────────────────────
// src/lib/chartTheme.ts
// Shared Recharts theming so every chart in the app reads as one system.
//
// Colors are `hsl(var(--token))` strings. SVG presentation attributes resolve
// CSS custom properties, so charts retheme on light/dark with no JS.
//
// NOTE: call sites previously used `hsl(var(--color-primary))`, which expanded
// to `hsl(hsl(...))` and silently painted nothing. The tokens below are the
// bare-channel form and actually resolve.
// ─────────────────────────────────────────────────────────────────────────────

export const chartColor = {
  primary: 'hsl(var(--primary))',
  primaryMuted: 'hsl(var(--primary) / 0.28)',
  grid: 'hsl(var(--border))',
  axis: 'hsl(var(--muted-foreground))',
  surface: 'hsl(var(--card))',
  text: 'hsl(var(--foreground))',
} as const;

/** Categorical ramp — deliberately ordered so neighbours stay distinguishable. */
export const CATEGORICAL_SERIES = [
  'hsl(var(--status-info))',
  'hsl(var(--status-accent))',
  'hsl(var(--status-positive))',
  'hsl(var(--status-warn))',
  'hsl(var(--status-progress))',
  'hsl(var(--status-negative))',
  'hsl(var(--status-neutral))',
] as const;

export function seriesColor(index: number): string {
  return CATEGORICAL_SERIES[index % CATEGORICAL_SERIES.length];
}

/** Tooltip chrome — hairline border, popover surface, no heavy drop shadow. */
export const tooltipStyle = {
  contentStyle: {
    borderRadius: '10px',
    border: '1px solid hsl(var(--border))',
    backgroundColor: 'hsl(var(--popover))',
    boxShadow: 'var(--shadow-pop)',
    padding: '8px 10px',
    fontSize: '12px',
  },
  itemStyle: {
    color: 'hsl(var(--foreground))',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
    padding: 0,
  },
  labelStyle: {
    color: 'hsl(var(--muted-foreground))',
    fontSize: '11px',
    marginBottom: '2px',
  },
} as const;

export const axisTick = {
  fill: 'hsl(var(--muted-foreground))',
  fontSize: 11,
} as const;
