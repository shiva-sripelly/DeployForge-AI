import { Activity, Database, LineChart, RefreshCw, Server } from "lucide-react";

import { useLiveness, useReadiness } from "@/api/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDateTime, titleCase } from "@/lib/format";

const POLL_INTERVAL = 15_000;

export function MonitoringPage() {
  const liveness = useLiveness(POLL_INTERVAL);
  const readiness = useReadiness(POLL_INTERVAL);
  const database = readiness.data?.checks.database;
  const lastChecked = Math.max(liveness.dataUpdatedAt, readiness.dataUpdatedAt);

  const refresh = () => {
    void liveness.refetch();
    void readiness.refetch();
  };

  return (
    <>
      <PageHeader
        title="Monitoring"
        description={`Live health of the DeployForge platform services, polled every ${POLL_INTERVAL / 1000} seconds.`}
        actions={
          <Button
            variant="secondary"
            onClick={refresh}
            loading={liveness.isFetching || readiness.isFetching}
            icon={<RefreshCw className="size-4" aria-hidden />}
          >
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex items-start gap-4">
            <span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
              <Server className="size-5" aria-hidden />
            </span>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">API service</h2>
                {liveness.isPending ? (
                  <Skeleton className="h-5 w-16" />
                ) : liveness.isError ? (
                  <Badge tone="danger" dot>Unreachable</Badge>
                ) : (
                  <Badge tone="success" dot>Live</Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-subtle">
                {liveness.data
                  ? `${liveness.data.service} v${liveness.data.version} · ${titleCase(liveness.data.environment)}`
                  : "GET /api/v1/health/live"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start gap-4">
            <span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
              <Database className="size-5" aria-hidden />
            </span>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">PostgreSQL</h2>
                {readiness.isPending ? (
                  <Skeleton className="h-5 w-16" />
                ) : readiness.isError || !database ? (
                  <Badge tone="neutral">Unknown</Badge>
                ) : database.status === "ok" ? (
                  <Badge tone="success" dot>Healthy</Badge>
                ) : (
                  <Badge tone="danger" dot>Unavailable</Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-subtle">
                {database?.status === "ok"
                  ? `Query round-trip ${database.latency_ms} ms`
                  : (database?.detail ?? "GET /api/v1/health/ready")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="mt-3 text-xs text-subtle" aria-live="polite">
        {lastChecked > 0 ? `Last checked ${formatDateTime(new Date(lastChecked).toISOString())}` : "Checking…"}
      </p>

      <Card className="mt-6">
        <CardHeader
          title="Solution telemetry"
          description="Planned for Phase 6: Delivery & operations"
          actions={<Badge tone="primary">Planned</Badge>}
        />
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Activity, label: "Request rates, latency and error budgets per deployed solution" },
            { icon: LineChart, label: "Model quality, cost and token usage trends" },
            { icon: Server, label: "Infrastructure health across customer environments" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted">
              <Icon className="mb-2 size-4 text-subtle" aria-hidden />
              {label}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
