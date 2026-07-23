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

// Vite handles import.meta.env
const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA === 'true';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export const dashboardService = {
  getStats: async () => {
    if (USE_MOCK) {
      await delay(500);
      return MOCK_DASHBOARD_STATS;
    }
    const res = await axiosInstance.get('/dashboard/stats');
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
  
  getPipelineChart: async (period: 'monthly' | 'annually') => {
    if (USE_MOCK) {
      await delay(500);
      // @ts-ignore
      return MOCK_PIPELINE_CHART[period];
    }
    const res = await axiosInstance.get(`/dashboard/pipeline-chart?period=${period}`);
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

  getLeadsBySource: async () => {
    if (USE_MOCK) {
      await delay(500);
      return MOCK_LEADS_BY_SOURCE;
    }
    const res = await axiosInstance.get('/dashboard/leads-by-source');
    return res.data.data;
  },
  
  getRevenueTrend: async () => {
    if (USE_MOCK) {
      await delay(500);
      return MOCK_REVENUE_CHART;
    }
    const res = await axiosInstance.get('/dashboard/revenue-trend');
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
