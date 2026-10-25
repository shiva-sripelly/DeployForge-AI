import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ApiStatusIndicator } from "@/components/layout/ApiStatusIndicator";
import { BrandMark } from "@/components/layout/BrandMark";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/FormField";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/providers/AuthProvider";

/** Accounts created by `python -m app.scripts.seed_dev`. */
const SEEDED_ACCOUNTS = [
  { email: "admin@deployforge.dev", label: "Owner" },
  { email: "engineer@deployforge.dev", label: "Member" },
  { email: "outsider@deployforge.dev", label: "No access" },
];

function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Sign-in failed. Please try again.";
  if (error.isNetworkError) return "The DeployForge API is unreachable. Check that the backend is running.";
  if (error.status === 404) return "Developer sign-in is disabled on this server.";
  if (error.status === 422) return "Enter a valid email address.";
  return error.message;
}

export function SignInPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email.trim());
    } catch (caught) {
      setError(caught);
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <BrandMark />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Sign in to DeployForge</h1>
            <p className="mt-1 text-sm text-muted">
              From customer requirements to secure, deployable AI solutions.
            </p>
          </div>
        </div>

        <Card className="p-6">
          <div className="mb-5 flex items-start gap-3 rounded-lg bg-warning-soft px-3 py-2.5 text-xs text-warning">
            <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <strong className="font-semibold">Development sign-in.</strong> Tokens are issued
              for existing accounts only. Single sign-on replaces this in Phase 2.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            <TextField
              label="Work email"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
            />
            {error !== null && (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {describeError(error)}
              </p>
            )}
            <Button type="submit" className="w-full" loading={submitting} disabled={!email.trim()}>
              Continue
            </Button>
          </form>

          <div className="mt-6 border-t border-border pt-5">
            <p className="text-xs font-medium text-subtle">Seeded development accounts</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SEEDED_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => setEmail(account.email)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:bg-surface-hover hover:text-foreground"
                >
                  {account.label}: {account.email}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <div className="mt-6 flex justify-center">
          <ApiStatusIndicator />
        </div>
      </div>
    </main>
  );
}
