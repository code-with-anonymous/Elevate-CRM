// ─────────────────────────────────────────────────────────────────────────────
// src/constants/dashboardMockData.ts
// Mock data for the dashboard until the backend is ready
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_DASHBOARD_STATS = {
  pipelineGoal: 4102000,
  weeklyRevenue: 710000,
  revenueDelta: 12.8,
  conversionRate: 46,
  conversionDelta: 4.1,
  leadsCount: 40,
  openTasks: 20,
  totalWon: 710000
};

export const MOCK_FOLLOW_UPS = [
  { id: '1', title: 'Send security doc...', date: '2026-05-31', assignedTo: 'Olivia Carter', priority: 'Medium' },
  { id: '2', title: 'Deal discovery call', date: '2026-06-02', assignedTo: 'Noah Khan', priority: 'High' },
  { id: '3', title: 'Follow up on proposal', date: '2026-06-05', assignedTo: 'Lucas Carter', priority: 'Low' },
];

export const MOCK_PIPELINE_CHART = {
  monthly: [
    { name: 'Jan', value: 12 },
    { name: 'Feb', value: 19 },
    { name: 'Mar', value: 15 },
    { name: 'Apr', value: 28 }, // highlight peak
    { name: 'May', value: 22 },
    { name: 'Jun', value: 30 },
  ],
  annually: [
    { name: '2021', value: 120 },
    { name: '2022', value: 190 },
    { name: '2023', value: 150 },
    { name: '2024', value: 280 },
    { name: '2025', value: 220 },
    { name: '2026', value: 300 },
  ]
};

export const MOCK_LEAD_ACTIVITY = [
  { id: '1', name: 'Lucas Carter', initials: 'LC', company: 'Massive Dynamic', date: '18 Jun 2026', time: '07:43 PM', status: 'New', value: 143000, color: 'bg-blue-100 text-blue-600' },
  { id: '2', name: 'Olivia Cole', initials: 'OC', company: 'Spacely Sprockets', date: '18 Jun 2026', time: '05:12 PM', status: 'Won', value: 26000, color: 'bg-green-100 text-green-600' },
  { id: '3', name: 'Noah Khan', initials: 'NK', company: 'Nakatomi', date: '17 Jun 2026', time: '02:30 PM', status: 'Qualified', value: 144000, color: 'bg-purple-100 text-purple-600' },
  { id: '4', name: 'Ruby Bennett', initials: 'RB', company: 'Wayne Tech', date: '16 Jun 2026', time: '11:20 AM', status: 'New', value: 118000, color: 'bg-blue-100 text-blue-600' },
  { id: '5', name: 'Julian Webb', initials: 'JW', company: 'Stark Industries', date: '15 Jun 2026', time: '09:15 AM', status: 'New', value: 52000, color: 'bg-blue-100 text-blue-600' },
];

export const MOCK_LEADS_BY_SOURCE = [
  { name: 'Cold Outreach', value: 8, color: '#3B82F6' },
  { name: 'Event', value: 9, color: '#8B5CF6' },
  { name: 'Social', value: 7, color: '#10B981' },
  { name: 'Website', value: 7, color: '#F59E0B' },
  { name: 'Referral', value: 9, color: '#EF4444' },
];

export const MOCK_REVENUE_CHART = [
  { name: 'Week 1', value: 400000 },
  { name: 'Week 2', value: 300000 },
  { name: 'Week 3', value: 550000 },
  { name: 'Week 4', value: 450000 },
  { name: 'Week 5', value: 710000 },
];
