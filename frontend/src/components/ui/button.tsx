import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'default'
    | 'outline'
    | 'ghost'
    | 'link'
    | 'secondary'
    | 'subtle'
    | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm';
  isLoading?: boolean;
  asChild?: boolean;
}

// Quiet by default. The filled primary is the only loud thing on a page, so
// it gets used once — hairline `outline` and transparent `ghost` do the rest.
const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  default:
    'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:bg-primary/95',
  secondary:
    'bg-secondary text-secondary-foreground hover:bg-secondary/70 active:bg-secondary',
  outline:
    'border border-border/70 bg-card text-foreground hover:bg-muted/60 hover:border-border active:bg-muted',
  subtle:
    'bg-primary/10 text-primary hover:bg-primary/15 active:bg-primary/20',
  ghost:
    'text-muted-foreground hover:bg-muted/70 hover:text-foreground active:bg-muted',
  link: 'text-primary underline-offset-4 hover:underline',
  destructive:
    'bg-destructive/10 text-destructive hover:bg-destructive/15 active:bg-destructive/20',
};

const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  default: 'h-9 gap-1.5 rounded-lg px-3.5',
  sm: 'h-8 gap-1.5 rounded-md px-3 text-xs',
  lg: 'h-10 gap-2 rounded-lg px-5',
  icon: 'h-9 w-9 rounded-lg',
  'icon-sm': 'h-8 w-8 rounded-md',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'default',
      isLoading,
      children,
      disabled,
      asChild: _asChild,
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      disabled={isLoading || disabled}
      data-loading={isLoading || undefined}
      className={cn(
        'relative inline-flex select-none items-center justify-center whitespace-nowrap',
        'text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform]',
        'duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        '[&_svg]:shrink-0',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {isLoading && (
        <Loader2
          className="absolute h-4 w-4 animate-spin"
          aria-hidden="true"
        />
      )}
      {/* Children stay mounted so the button never changes width mid-request */}
      <span
        className={cn(
          'inline-flex items-center gap-1.5',
          isLoading && 'invisible'
        )}
      >
        {children}
      </span>
    </button>
  )
);
Button.displayName = 'Button';

export { Button };
