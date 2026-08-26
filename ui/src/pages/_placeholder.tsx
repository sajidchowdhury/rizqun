/**
 * Placeholder page generator. Each entry in the route table maps to a small
 * `<PlaceholderPage>` until the real page is built in a later phase.
 *
 * When a real page is implemented, replace the import in `src/routes/index.tsx`.
 */
import { useLocation } from 'react-router-dom';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function PlaceholderPage({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  const location = useLocation();

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <Badge variant="secondary">{phase}</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Route: <code className="rounded bg-muted px-1.5 py-0.5">{location.pathname}</code>
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          This page is a placeholder. It will be implemented in a later phase.
        </p>
      </CardContent>
    </Card>
  );
}
