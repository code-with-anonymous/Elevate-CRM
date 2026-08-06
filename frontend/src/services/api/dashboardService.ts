// ─────────────────────────────────────────────────────────────────────────────
// src/services/api/dashboardService.ts
// Service for fetching dashboard data
// ─────────────────────────────────────────────────────────────────────────────
import axiosInstance from './axiosInstance';
import { 
  MOCK_DASHBOARD_STATS, 
  MOCK_FOLLOW_UPS, 
  MOCK_PIPELINE_CHART, 
  MOCK_LEAD_ACTIVITY, 
  MOCK_LEADS_BY_SOURCE,
  MOCK_REVENUE_CHART 
} from '@/constants/dashboardMockData';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA === 'true';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export interface DateRange {
  from?: string;
  to?: string;
}

function buildQuery(dateRange?: DateRange, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (dateRange?.from) params.set('from', dateRange.from);
  if (dateRange?.to) params.set('to', dateRange.to);
  if (extra) {
    Object.entries(extra).forEach(([k, v]) => params.set(k, v));
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

export const dashboardService = {
  getStats: async (dateRange?: DateRange) => {
    if (USE_MOCK) {
      await delay(500);
      return MOCK_DASHBOARD_STATS;
    }
    const query = buildQuery(dateRange);
    const res = await axiosInstance.get(`/dashboard/stats${query}`);
    return res.data.data;
  },
  
  getFollowUps: async () => {
    if (USE_MOCK) {
      await delay(500);
      return MOCK_FOLLOW_UPS;
    }
    const res = await axiosInstance.get('/dashboard/follow-ups');
    return res.data.data;
  },
  
  getPipelineChart: async (period: 'monthly' | 'annually', dateRange?: DateRange) => {
    if (USE_MOCK) {
      await delay(500);
      // @ts-ignore
      return MOCK_PIPELINE_CHART[period];
    }
    const query = buildQuery(dateRange, { period });
    const res = await axiosInstance.get(`/dashboard/pipeline-chart${query}`);
    return res.data.data;
  },

  getLeadActivity: async () => {
    if (USE_MOCK) {
      await delay(500);
      return MOCK_LEAD_ACTIVITY;
    }
    const res = await axiosInstance.get('/dashboard/lead-activity');
    return res.data.data;
  },

  getLeadsBySource: async (dateRange?: DateRange) => {
    if (USE_MOCK) {
      await delay(500);
      return MOCK_LEADS_BY_SOURCE;
    }
    const query = buildQuery(dateRange);
    const res = await axiosInstance.get(`/dashboard/leads-by-source${query}`);
    return res.data.data;
  },
  
  getRevenueTrend: async (dateRange?: DateRange) => {
    if (USE_MOCK) {
      await delay(500);
      return MOCK_REVENUE_CHART;
    }
    const query = buildQuery(dateRange);
    const res = await axiosInstance.get(`/dashboard/revenue-trend${query}`);
    return res.data.data;
  },

  getAIInsights: async () => {
    if (USE_MOCK) {
      await delay(1500);
      return {
        insights: [
          { type: 'positive', text: 'Win rate is up 4.1% this week' },
          { type: 'warning', text: '3 leads stalled in Qualified for 14+ days' },
          { type: 'info', text: 'Cold Outreach is your top source this month' },
        ],
        generatedAt: new Date().toISOString(),
        pipelineSummary: { value: 4102000, winRate: 46, topSource: 'Cold Outreach' }
      };
    }
    const res = await axiosInstance.post('/dashboard/ai-insights');
    return res.data.data;
  }
};
