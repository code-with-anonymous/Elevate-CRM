import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants';
import { ShieldAlert } from 'lucide-react';

export default function AccessDeniedPage() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const state = location.state as { requiredPermission?: string, requiredRole?: string, allowedRoles?: string[] } | null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center bg-background text-foreground">
      <Helmet>
        <title>Access Denied | ElevateCRM</title>
      </Helmet>

      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldAlert className="h-8 w-8" />
      </div>

      <h1 className="mb-2 text-2xl font-bold tracking-tight">Access Denied</h1>
      <p className="mb-2 max-w-md text-muted-foreground">
        You do not have the required permissions to access this page.
      </p>
      
      {state?.requiredPermission && (
        <p className="mb-6 text-xs text-muted-foreground">
          Missing permission: <code className="rounded bg-muted px-1 py-0.5 font-mono">{state.requiredPermission}</code>
        </p>
      )}

      {!state?.requiredPermission && (
        <div className="mb-6" />
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="outline" onClick={() => navigate(-1)}>
          Go Back
        </Button>
        <Button asChild>
          <Link to={ROUTES.DASHBOARD}>Return to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
