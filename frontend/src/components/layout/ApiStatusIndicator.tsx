import { useReadiness } from "@/api/hooks";
import { cn } from "@/lib/cn";

type Connectivity = "checking" | "online" | "degraded" | "offline";

const styles: Record<Connectivity, { label: string; dot: string; text: string }> = {
  checking: { label: "Checking API", dot: "bg-subtle animate-pulse", text: "text-muted" },
  online: { label: "API online", dot: "bg-success", text: "text-success" },
  degraded: { label: "API degraded", dot: "bg-warning", text: "text-warning" },
  offline: { label: "API offline", dot: "bg-danger", text: "text-danger" },
};

/** Live backend connectivity, polled from the readiness endpoint. */
export function ApiStatusIndicator({ className }: { className?: string }) {
  const readiness = useReadiness();

  let state: Connectivity = "checking";
  let detail = "Contacting the DeployForge API…";
  if (readiness.isError) {
    state = "offline";
    detail = "The API could not be reached.";
  } else if (readiness.data) {
    const database = readiness.data.checks.database;
    if (readiness.data.status === "ready") {
      state = "online";
      detail = `API v${readiness.data.version} · database ${database?.latency_ms ?? "?"} ms`;
    } else {
      state = "degraded";
      detail = database?.detail ?? "A dependency is unavailable.";
    }
  }
  const style = styles[state];

  return (
    <div
      role="status"
      aria-live="polite"
      title={detail}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full border border-border bg-surface px-3 text-xs font-medium",
        style.text,
        className,
      )}
    >
      <span className={cn("size-2 rounded-full", style.dot)} aria-hidden />
      <span>{style.label}</span>
      <span className="sr-only">. {detail}</span>
    </div>
  );
}
