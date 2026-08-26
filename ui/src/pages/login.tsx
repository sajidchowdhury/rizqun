import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, LogIn } from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { loginSchema, type LoginForm } from '@/schemas/auth';
import { toast } from '@/lib/toast';
import { ApiError } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export function LoginPage() {
  const { login, isAuthenticated, isInitializing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);

  // Where to send the user after a successful login. Defaults to /dashboard.
  // Captured by ProtectedRoute (Phase 1.4) via location.state.from.
  const from =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/dashboard';

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // Already authenticated → bounce to the destination immediately.
  // NOTE: kept after all hooks so we don't violate the rules-of-hooks rule.
  if (!isInitializing && isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(values: LoginForm) {
    setSubmitting(true);
    try {
      const user = await login(values.email, values.password);
      toast.success(`Welcome back, ${user.name}`);
      navigate(from, { replace: true });
    } catch (error) {
      // Friendly, status-aware message via the toast helper.
      // 401 → "Invalid email or password." (avoid user enumeration)
      // 429 → "Too many attempts. Please try again in 15 minutes."
      // 5xx / network → "Server error. Please try again in a moment."
      toast.apiError(error);

      // Defensive: if the API accidentally leaks a status code (e.g. 403
      // for deactivated accounts), surface the backend's message inline
      // on the password field so the user knows what's wrong.
      if (error instanceof ApiError && (error.isForbidden || error.isValidation)) {
        form.setError('password', { message: error.message });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 p-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl">Rizqun</CardTitle>
          <CardDescription>Sign in to your operator account</CardDescription>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        autoFocus
                        placeholder="operator@rizqun.com"
                        disabled={submitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        disabled={submitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    <LogIn className="size-4" />
                    Sign in
                  </>
                )}
              </Button>
            </form>
          </Form>

          {/* Demo credentials hint — dev only. Remove in production. */}
          <div className="mt-6 rounded-md border border-dashed bg-muted/50 p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                Dev
              </Badge>
              <span className="font-medium text-foreground">Demo credentials</span>
            </div>
            <div>
              <code className="rounded bg-background px-1.5 py-0.5">admin@rizqun.com</code>
              {' / '}
              <code className="rounded bg-background px-1.5 py-0.5">ChangeMeInProduction123!</code>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground/80">
              Or use a seeded operator:{' '}
              <code className="rounded bg-background px-1 py-0.5">grocery.op@rizqun.com</code>
              {' / '}
              <code className="rounded bg-background px-1 py-0.5">Operator123!</code>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Need an account?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Contact your administrator
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
