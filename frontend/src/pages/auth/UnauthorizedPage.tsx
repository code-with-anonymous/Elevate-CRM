import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants';
import { Lock } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center bg-background text-foreground">
      <Helmet>
        <title>Unauthorized | ElevateCRM</title>
      </Helmet>

      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Lock className="h-8 w-8" />
      </div>

      <h1 className="mb-2 text-2xl font-bold tracking-tight">Authentication Required</h1>
      <p className="mb-8 max-w-sm text-muted-foreground">
        You need to be logged in to access this page.
      </p>

      <Button asChild className="w-full max-w-xs">
        <Link to={ROUTES.LOGIN}>Log in</Link>
      </Button>
    </div>
  );
}
