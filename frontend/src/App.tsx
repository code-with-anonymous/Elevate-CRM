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

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return <RouterProvider router={router} />;
}

function App(): React.JSX.Element {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AppContent />

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
