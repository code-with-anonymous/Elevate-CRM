import { AlertCircle, RotateCw } from 'lucide-react';
import { cn } from '@/lib/cn';

interface CardErrorStateProps {
  message?: string;
  onRetry?: () => void;
  heightClass?: string;
}

export default function CardErrorState({
  message = "Couldn't load this",
  onRetry,
  heightClass = 'h-full',
}: CardErrorStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[120px] w-full flex-col items-center justify-center rounded-xl',
        'border border-border/60 bg-card p-5 text-center',
        heightClass
      )}
    >
      <span className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle size={16} />
      </span>
      <p className="text-xs font-medium text-foreground">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <RotateCw size={12} />
          Retry
        </button>
      )}
    </div>
  );
}
