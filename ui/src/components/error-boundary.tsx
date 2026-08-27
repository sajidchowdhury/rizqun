import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary — catches render errors and shows a friendly fallback
 * instead of a blank white screen. Wrap each route's page in this.
 *
 * Usage:
 *   <ErrorBoundary><DashboardPage /></ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to console in dev — in production this would go to Sentry
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center px-6">
          <Card className="max-w-md text-center">
            <CardContent className="space-y-4 pt-6">
              <AlertTriangle className="mx-auto size-12 text-destructive" />
              <h2 className="text-lg font-semibold">Something went wrong</h2>
              <p className="text-sm text-muted-foreground">
                An unexpected error occurred while rendering this page. Try reloading — if the
                problem persists, contact your administrator.
              </p>
              {this.state.error && (
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  {this.state.error.message}
                </pre>
              )}
              <Button onClick={this.handleReload}>
                <RefreshCw className="size-4" />
                Reload page
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
