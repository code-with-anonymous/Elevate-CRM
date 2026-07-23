import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants';
import { Clock } from 'lucide-react';

export default function SessionExpiredPage() {
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || ROUTES.DASHBOARD;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center bg-background text-foreground">
      <Helmet>
        <title>Session Expired | ElevateCRM</title>
      </Helmet>

      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10 text-warning">
        <Clock className="h-8 w-8" />
      </div>

      <h1 className="mb-2 text-2xl font-bold tracking-tight">Your session has expired</h1>
      <p className="mb-8 max-w-sm text-muted-foreground">
        For your security, you have been automatically logged out due to inactivity.
      </p>

      <Button asChild className="w-full max-w-xs">
        <Link to={`${ROUTES.LOGIN}?returnTo=${encodeURIComponent(returnTo)}`}>
          Log in again
        </Link>
      </Button>
    </div>
  );
}
