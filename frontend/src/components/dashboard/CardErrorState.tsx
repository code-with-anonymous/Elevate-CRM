import { AlertCircle, RotateCw } from 'lucide-react';

interface CardErrorStateProps {
  message?: string;
  onRetry?: () => void;
  heightClass?: string;
}

export default function CardErrorState({
  message = 'Failed to load data',
  onRetry,
  heightClass = 'h-full',
}: CardErrorStateProps) {
  return (
    <div
      className={`flex ${heightClass} min-h-[120px] w-full flex-col items-center justify-center rounded-xl border border-border bg-card p-4 text-center`}
    >
      <AlertCircle size={20} className="mb-2 text-destructive" />
      <p className="text-xs font-medium text-foreground mb-2">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RotateCw size={12} />
          Retry
        </button>
      )}
    </div>
  );
}
