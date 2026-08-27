// ─────────────────────────────────────────────────────────────────────────────
// src/components/common/PageLoader.tsx
// Full-screen loading state — lazy route Suspense fallback, and the gate App.tsx
// shows while the session is being restored on boot.
// ─────────────────────────────────────────────────────────────────────────────
import { LogoMark } from './Logo';

/** Full-screen spinner. Shared so a boot restore and a lazy route look alike. */
function PageLoader(): React.JSX.Element {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <LogoMark size={44} />
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    </div>
  );
}

PageLoader.displayName = 'PageLoader';

export default PageLoader;
