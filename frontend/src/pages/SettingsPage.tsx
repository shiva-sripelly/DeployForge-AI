import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";

import { useLiveness } from "@/api/hooks";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { API_BASE_URL } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatDateTime, titleCase } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme, type ThemePreference } from "@/providers/ThemeProvider";

const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const liveness = useLiveness(false);

  return (
    <>
      <PageHeader title="Settings" description="Personal preferences and platform information." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Appearance" description="Choose how DeployForge looks on this device." />
          <fieldset className="p-5">
            <legend className="sr-only">Theme</legend>
            <div className="grid grid-cols-3 gap-2">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-2 rounded-lg border px-3 py-4 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                    preference === value
                      ? "border-primary bg-primary-soft text-primary-soft-foreground"
                      : "border-border text-muted hover:bg-surface-hover",
                  )}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={value}
                    checked={preference === value}
                    onChange={() => setPreference(value)}
                    className="sr-only"
                  />
                  <Icon className="size-5" aria-hidden />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        <Card>
          <CardHeader
            title="Account"
            actions={
              <Button variant="secondary" size="sm" onClick={signOut} icon={<LogOut className="size-3.5" aria-hidden />}>
                Sign out
              </Button>
            }
          />
          <dl className="divide-y divide-border px-5 pb-2">
            <Row label="Name">{user?.full_name}</Row>
            <Row label="Email">{user?.email}</Row>
            <Row label="Last sign-in">{user?.last_login_at ? formatDateTime(user.last_login_at) : "—"}</Row>
            <Row label="Session">Stored for this browser tab only</Row>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Platform" description="Connection details for this deployment." />
          <dl className="divide-y divide-border px-5 pb-2">
            <Row label="API base URL">
              <code className="font-mono text-xs">{API_BASE_URL}</code>
            </Row>
            <Row label="API version">{liveness.data?.version ?? "—"}</Row>
            <Row label="Environment">{liveness.data ? titleCase(liveness.data.environment) : "—"}</Row>
            <Row label="Authentication">Development tokens (SSO arrives in Phase 2)</Row>
          </dl>
        </Card>
      </div>
    </>
  );
}
