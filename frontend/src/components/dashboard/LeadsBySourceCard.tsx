import { useLeadsBySource } from '@/hooks/useDashboard';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function LeadsBySourceCard() {
  const { data, isLoading, isError } = useLeadsBySource();

  if (isLoading) {
    return <Skeleton className="min-h-[250px] w-full rounded-xl border border-border" />;
  }

  if (isError) {
    return <div className="min-h-[250px] w-full rounded-xl border border-border bg-card p-6 text-destructive flex items-center justify-center">Error loading data</div>;
  }

  // Pre-defined colors for standard sources
  const COLORS: Record<string, string> = {
    'Cold Outreach': '#3B82F6',
    'Event': '#8B5CF6',
    'Social': '#10B981',
    'Website': '#F59E0B',
    'Referral': '#EF4444',
    'Other': '#6B7280'
  };

  const sourcesArray = Array.isArray(data) 
    ? data 
    : (data?.sources || []);

  const chartData = sourcesArray.map((item: any) => ({
    name: item.source || item.name,
    value: item.count || item.value,
    color: COLORS[item.source || item.name] || COLORS['Other']
  }));

  return (
    <div className="flex min-h-[250px] flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md h-full">
      <div className="mb-2">
        <h3 className="text-sm font-medium text-foreground">Leads by Source</h3>
        <p className="text-xs text-muted-foreground">Distribution across channels</p>
      </div>

      <div className="flex-1 flex flex-col md:flex-row items-center gap-4">
        <div className="h-[140px] w-full md:w-1/2 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={65}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {chartData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--color-border))', backgroundColor: 'hsl(var(--color-card))', boxShadow: 'var(--shadow-sm)' }}
                itemStyle={{ color: 'hsl(var(--color-foreground))', fontWeight: 500 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div className="flex flex-col gap-2 w-full md:w-1/2">
          {chartData.map((item: any, index: number) => (
            <div key={index} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-foreground">{item.name}</span>
              </div>
              <span className="font-medium text-muted-foreground">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
