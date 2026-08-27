// ─────────────────────────────────────────────────────────────────────────────
// App.tsx — Root application shell
// Providers are layered here in the correct order
// ─────────────────────────────────────────────────────────────────────────────
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';

import { router } from '@routes/index';
import { RouterProvider } from 'react-router-dom';
import { useAppBootstrap } from '@/hooks/useAuthActions';
import { useAuthStore } from '@store/authStore';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import PageLoader from '@/components/common/PageLoader';
import { warmUpApi } from '@/services/api/axiosInstance';
import { useEffect } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

function AppContent() {
  const { bootstrap } = useAppBootstrap();
  const authStatus = useAuthStore((s) => s.authStatus);

  useEffect(() => {
    // Nudge the API awake before anything needs it. On a spun-down Render
    // instance the boot happens while the user reads the page, instead of
    // stalling their first real request for 45 seconds.
    warmUpApi();
    void bootstrap();
  }, [bootstrap]);

  // THE fix for "refreshing the page bounces me to /login".
  //
  // React commits children before parents, and <Navigate> fires from a child
  // effect — so ProtectedRoute's redirect ran before this component's effect had
  // called bootstrap() even once. On every reload the guard read the
  // isAuthenticated: false that a reload always starts with, sent the user to
  // /login, and the silent refresh finished a moment later into PublicRoute,
  // which bounced them on to /dashboard. Hence the login flash and the lost page.
  //
  // Nothing mounts the router until the restore has actually resolved. The
  // guards then read a settled answer, and a reload stays where it was.
  if (authStatus === 'restoring') {
    return <PageLoader />;
  }

  return <RouterProvider router={router} />;
}

function App(): React.JSX.Element {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        {/* Inside the providers, not outside: the fallback and any retry the
            user triggers need the query client and Helmet context. Only
            AppContent is wrapped, so a render error can't take the Toaster with
            it — error toasts still work on the way down. */}
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>

        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'var(--color-card)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
              borderRadius: '0.625rem',
              fontSize: '0.875rem',
            },
          }}
        />

        {import.meta.env.VITE_ENABLE_DEVTOOLS === 'true' && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </HelmetProvider>
  );
}

App.displayName = 'App';

export default App;
