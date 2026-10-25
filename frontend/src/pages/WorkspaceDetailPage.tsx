import { ArrowLeft, Clock, FolderKanban, History, ShieldCheck, Users } from "lucide-react";
import { Link, useParams } from "react-router";

import { useWorkspace, useWorkspaceStats } from "@/api/hooks";
import { EnvironmentBadge, RoleBadge, StatusBadge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { ApiError } from "@/lib/api-client";
import { formatDateTime, formatNumber, formatRelativeTime } from "@/lib/format";

const backLink = (
  <Link
    to="/workspaces"
    className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
  >
    <ArrowLeft className="size-3.5" aria-hidden /> All workspaces
  </Link>
);

export function WorkspaceDetailPage() {
  const { workspaceId } = useParams();
  const workspace = useWorkspace(workspaceId);
  const stats = useWorkspaceStats(workspaceId, workspace.isSuccess);

  if (workspace.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading workspace">
        <Skeleton className="mb-3 h-4 w-28" />
        <Skeleton className="mb-6 h-8 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((card) => (
            <Skeleton key={card} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (workspace.isError) {
    const notFound = workspace.error instanceof ApiError && workspace.error.status === 404;
    return (
      <>
        <PageHeader title="Workspace" eyebrow={backLink} />
        <Card>
          {notFound ? (
            <EmptyState
              icon={FolderKanban}
              title="Workspace not found"
              description="It may not exist, or you may not have access to it."
            />
          ) : (
            <ErrorState error={workspace.error} onRetry={() => void workspace.refetch()} />
          )}
        </Card>
      </>
    );
  }

  const ws = workspace.data;
  const data = stats.data;

  return (
    <>
      <PageHeader
        eyebrow={backLink}
        title={ws.name}
        description={ws.description ?? `Slug: ${ws.slug}`}
        actions={
          <>
            <EnvironmentBadge environment={ws.environment} />
            <StatusBadge status={ws.status} />
          </>
        }
      />

      <div className="space-y-6">
        {stats.isError ? (
          <Card>
            <ErrorState
              error={stats.error}
              title="Unable to load workspace statistics"
              onRetry={() => void stats.refetch()}
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Members" icon={Users} loading={stats.isPending} value={data && formatNumber(data.members_total)} />
            <StatCard label="Audit events" icon={History} loading={stats.isPending} value={data && formatNumber(data.audit_events_total)} hint="All time" />
            <StatCard label="Events (7 days)" icon={History} loading={stats.isPending} value={data && formatNumber(data.audit_events_last_7_days)} />
            <StatCard
              label="Last activity"
              icon={Clock}
              loading={stats.isPending}
              value={
                <span className="text-xl">
                  {data?.last_activity_at ? formatRelativeTime(data.last_activity_at) : "None"}
                </span>
              }
              hint={data?.last_activity_at ? formatDateTime(data.last_activity_at) : undefined}
            />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Members by role" />
            <dl className="mt-3 divide-y divide-border px-5 pb-2">
              {(["admin", "editor", "viewer"] as const).map((role) => (
                <div key={role} className="flex items-center justify-between py-3">
                  <dt>
                    <RoleBadge role={role} />
                  </dt>
                  <dd className="text-sm font-medium tabular-nums">
                    {data ? formatNumber(data.members_by_role[role]) : <Skeleton className="h-4 w-6" />}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Your access" description="Effective permissions for this workspace" />
            <dl className="mt-3 divide-y divide-border px-5 pb-2">
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm text-muted">Organization role</dt>
                <dd>
                  <RoleBadge role={ws.access.organization_role} />
                </dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm text-muted">Workspace role</dt>
                <dd>
                  {ws.access.workspace_role ? (
                    <RoleBadge role={ws.access.workspace_role} />
                  ) : (
                    <span className="text-xs text-subtle">Via organization role</span>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm text-muted">Created</dt>
                <dd className="text-sm">{formatDateTime(ws.created_at)}</dd>
              </div>
            </dl>
            <p className="flex items-start gap-2 border-t border-border px-5 py-3 text-xs text-subtle">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Access is enforced by the API and by database constraints that pin memberships to this
              organization.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
