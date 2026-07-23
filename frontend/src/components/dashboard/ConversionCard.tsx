import { useStats } from '@/hooks/useDashboard';
import { Skeleton } from '@/components/ui/skeleton';

export default function ConversionCard() {
  const { data, isLoading, isError } = useStats();

  if (isLoading) {
    return <Skeleton className="h-32 rounded-xl border border-border" />;
  }

  if (isError) {
    return <div className="h-32 rounded-xl border border-border bg-card p-6 text-destructive flex items-center justify-center">Error loading data</div>;
  }

  return (
    <div className="flex h-32 flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">Conversion</h3>
          <span className="text-xs text-muted-foreground">Win rate</span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-foreground">{data?.conversion?.rate}%</span>
        </div>
      </div>
      
      <div className="text-xs text-muted-foreground font-medium">
        {data?.conversion?.totalLeads} leads · {data?.conversion?.openTasks} open tasks
      </div>
    </div>
  );
}
