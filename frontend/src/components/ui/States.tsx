import { CircleAlert, Inbox, RefreshCw, WifiOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <span className="grid size-11 place-items-center rounded-full bg-surface-muted text-subtle">
        <Icon className="size-5" aria-hidden />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

export function ErrorState({ error, title, onRetry, retrying, className }: ErrorStateProps) {
  const apiError = error instanceof ApiError ? error : null;
  const offline = apiError?.isNetworkError ?? false;
  const Icon = offline ? WifiOff : CircleAlert;
  const message =
    apiError?.message ?? (error instanceof Error ? error.message : "Something went wrong.");

  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center px-6 py-12 text-center", className)}
    >
      <span className="grid size-11 place-items-center rounded-full bg-danger-soft text-danger">
        <Icon className="size-5" aria-hidden />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-foreground">
        {title ?? (offline ? "API unreachable" : "Unable to load data")}
      </h3>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {apiError?.requestId && (
        <p className="mt-2 font-mono text-xs text-subtle">Request ID: {apiError.requestId}</p>
      )}
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-5"
          onClick={onRetry}
          loading={retrying}
          icon={<RefreshCw className="size-3.5" aria-hidden />}
        >
          Try again
        </Button>
      )}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
      <Spinner label={label} />
      <span>{label}</span>
    </div>
  );
}
