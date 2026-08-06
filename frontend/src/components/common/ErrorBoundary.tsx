// ─────────────────────────────────────────────────────────────────────────────
// components/common/ErrorBoundary.tsx
// Catches render-phase errors anywhere below it and shows a recoverable
// fallback instead of React unmounting the tree to a blank white page.
//
// Class component by necessity, not preference: componentDidCatch has no hook
// equivalent. This is the one place in the codebase where that's still true.
//
// WHAT IT DOES NOT CATCH — worth knowing so you don't trust it too far:
//   · errors inside event handlers (those run outside React's render phase)
//   · async rejections and setTimeout callbacks
//   · errors in the boundary's own fallback
// Query failures are already handled per-surface by TanStack's isError states;
// this is for the genuinely unexpected — the undefined.map() nobody predicted.
// ─────────────────────────────────────────────────────────────────────────────
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback. Receives the error so a caller can render specifics. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console is the whole strategy for now — there's no Sentry or LogRocket in
    // this project. When one is added, this is the single place it hooks in.
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  /**
   * Clearing `error` re-renders children from scratch. That's enough when the
   * cause was transient (a bad cache entry, a race). If the same render throws
   * again the boundary simply catches it again — no loop, because React doesn't
   * retry on its own.
   */
  private reset = (): void => {
    this.setState({ error: null });
  };

  private reload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;
    if (fallback) return fallback(error, this.reset);

    return (
      // Tokens, not hex — this renders in whichever theme was active, and a
      // hardcoded white card would flash bright in dark mode.
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-xl border border-border/60 bg-card p-6 text-center shadow-card">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle size={24} />
          </div>

          <h1 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
            Something broke
          </h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            This screen hit an error it couldn’t recover from on its own. Your data is fine —
            nothing was saved or lost by this.
          </p>

          {/* The message, but never the stack. A stack trace in front of a user
              is noise to them and detail to an attacker. */}
          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-32 overflow-auto rounded-lg border border-border/60 bg-muted/40 p-3 text-left text-[11px] leading-relaxed text-muted-foreground">
              {error.message}
            </pre>
          )}

          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/70 bg-card px-3.5 text-sm font-medium text-foreground transition-colors duration-150 hover:border-border hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <RotateCw size={14} />
              Reload the app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
