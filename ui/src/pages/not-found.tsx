import { Link, useRouteError } from 'react-router-dom';

import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  const error = useRouteError() as { statusText?: string; message?: string } | undefined;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-6xl font-bold tracking-tight text-muted-foreground">404</h1>
        <p className="text-lg font-medium">Page not found</p>
        <p className="text-sm text-muted-foreground">
          {error?.statusText ?? error?.message ?? "The page you're looking for doesn't exist."}
        </p>
      </div>
      <Button asChild>
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
