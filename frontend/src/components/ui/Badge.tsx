import type { ReactNode } from "react";

import type { WorkspaceEnvironment, WorkspaceStatus } from "@/api/types";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted ring-border",
  primary: "bg-primary-soft text-primary-soft-foreground ring-primary/20",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/20",
  danger: "bg-danger-soft text-danger ring-danger/20",
  info: "bg-info-soft text-info ring-info/20",
};

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}

export function Badge({ tone = "neutral", children, className, dot = false }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        toneClasses[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const environmentTones: Record<WorkspaceEnvironment, Tone> = {
  development: "info",
  staging: "warning",
  production: "success",
};

export function EnvironmentBadge({ environment }: { environment: WorkspaceEnvironment }) {
  return (
    <Badge tone={environmentTones[environment]} dot>
      {capitalize(environment)}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: WorkspaceStatus }) {
  return <Badge tone={status === "active" ? "success" : "neutral"}>{capitalize(status)}</Badge>;
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <Badge tone={role === "owner" || role === "admin" ? "primary" : "neutral"}>
      {capitalize(role)}
    </Badge>
  );
}
