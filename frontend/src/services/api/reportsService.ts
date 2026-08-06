// ─────────────────────────────────────────────────────────────────────────────
// src/services/api/reportsService.ts
// Transport for /api/reports/*. Every endpoint is manager+ on the server, so a
// 403 here is expected behaviour for member/viewer roles, not a bug.
// ─────────────────────────────────────────────────────────────────────────────
import axiosInstance from './axiosInstance';

export interface DateRangeParams {
  /** ISO date string, inclusive. */
  from?: string;
  to?: string;
}

// ── Sales performance ─────────────────────────────────────────────────────────

export interface SalesPerformanceRow {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  leadsAssigned: number;
  leadsWon: number;
  leadsLost: number;
  openPipelineValue: number;
  dealsWon: number;
  revenue: number;
  /** Percent, one decimal. leadsWon ÷ leadsAssigned — same definition as the Dashboard. */
  conversionRate: number;
  avgDealSize: number;
  /** Null when no won deal in range has both timestamps. */
  avgDaysToClose: number | null;
}

export interface SalesPerformanceResponse {
  range: { from: string | null; to: string | null };
  rows: SalesPerformanceRow[];
  totals: {
    leadsAssigned: number;
    leadsWon: number;
    dealsWon: number;
    revenue: number;
    conversionRate: number;
    avgDealSize: number;
  };
}

// ── Pipeline forecast ─────────────────────────────────────────────────────────

export interface ForecastStage {
  stage: string;
  count: number;
  value: number;
  /** 0-1. */
  probability: number;
  weightedValue: number;
}

export interface PipelineForecastResponse {
  stages: ForecastStage[];
  totals: {
    /** Open stages only — excludes Won, so it's expected revenue, not banked. */
    weightedForecast: number;
    openValue: number;
    openCount: number;
    closedWonValue: number;
    closedWonCount: number;
  };
  probabilities: Record<string, number>;
}

// ── Lead source ROI ───────────────────────────────────────────────────────────

export interface SourceRoiRow {
  source: string;
  leads: number;
  wonLeads: number;
  dealsWon: number;
  revenue: number;
  conversionRate: number;
  revenuePerLead: number;
}

export interface LeadSourceRoiResponse {
  range: { from: string | null; to: string | null };
  rows: SourceRoiRow[];
  totals: { revenue: number; leads: number; dealsWon: number };
}

// ── Activity summary ──────────────────────────────────────────────────────────

export interface ActivityDay {
  /** YYYY-MM-DD */
  date: string;
  tasksCompleted: number;
  leadsCreated: number;
  dealsClosed: number;
  dealsWon: number;
}

export interface ActivitySummaryResponse {
  range: { from: string; to: string; days: number; truncated: boolean };
  /** Dense — every day in range present, zero-filled. */
  series: ActivityDay[];
  totals: {
    tasksCompleted: number;
    leadsCreated: number;
    dealsClosed: number;
    dealsWon: number;
  };
}

// ── Client ────────────────────────────────────────────────────────────────────

// Generic rather than Record<string, string|undefined>: interfaces don't get
// an implicit index signature, so passing DateRangeParams to a Record param is
// a type error even though the shape is fine.
function qs<T extends object>(params: T): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, String(value));
  });
  const str = search.toString();
  return str ? `?${str}` : '';
}

export const reportsService = {
  getSalesPerformance: async (
    params: DateRangeParams & { assignedTo?: string } = {}
  ): Promise<SalesPerformanceResponse> => {
    const res = await axiosInstance.get(`/reports/sales-performance${qs(params)}`);
    return res.data.data;
  },

  getPipelineForecast: async (): Promise<PipelineForecastResponse> => {
    const res = await axiosInstance.get('/reports/pipeline-forecast');
    return res.data.data;
  },

  getLeadSourceRoi: async (params: DateRangeParams = {}): Promise<LeadSourceRoiResponse> => {
    const res = await axiosInstance.get(`/reports/lead-source-roi${qs(params)}`);
    return res.data.data;
  },

  getActivitySummary: async (params: DateRangeParams = {}): Promise<ActivitySummaryResponse> => {
    const res = await axiosInstance.get(`/reports/activity-summary${qs(params)}`);
    return res.data.data;
  },
};
