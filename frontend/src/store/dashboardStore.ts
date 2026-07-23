import { create } from 'zustand';

interface DateRange {
  from?: string;
  to?: string;
}

interface DashboardState {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  dateRange: {
    from: '',
    to: '',
  },
  setDateRange: (dateRange) => set({ dateRange }),
}));
