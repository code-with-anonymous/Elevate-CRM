import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center bg-background text-foreground">
      <Helmet>
        <title>Page Not Found | ElevateCRM</title>
      </Helmet>

      <h1 className="mb-2 text-6xl font-bold tracking-tight text-primary/20">404</h1>
      <h2 className="mb-4 text-2xl font-semibold tracking-tight">Page Not Found</h2>
      <p className="mb-8 max-w-md text-muted-foreground">
        Sorry, we couldn't find the page you're looking for. It might have been moved or doesn't exist.
      </p>

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
