import { Activity, ArrowRight, Building2, FolderKanban, History, Plus, Rocket, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { useAuditLogs, useOrganizationStats, useReadiness, useWorkspaces } from "@/api/hooks";
import { isManager, type Organization } from "@/api/types";
import { Badge, EnvironmentBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/Table";
import { CreateOrganizationDialog } from "@/features/organizations/CreateOrganizationDialog";
import { formatDate, formatNumber, formatRelativeTime, titleCase } from "@/lib/format";
import { useOrganizationContext } from "@/providers/OrganizationProvider";

function OrganizationStatsGrid({ organization }: { organization: Organization }) {
  const stats = useOrganizationStats(organization.id);

  if (stats.isError) {
    return (
      <Card>
        <ErrorState
          error={stats.error}
          title="Unable to load organization statistics"
          onRetry={() => void stats.refetch()}
          retrying={stats.isRefetching}
        />
      </Card>
    );
  }

  const data = stats.data;
  const loading = stats.isPending;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Workspaces"
        icon={FolderKanban}
        loading={loading}
        value={data && formatNumber(data.workspaces_total)}
        hint={data && `${formatNumber(data.workspaces_active)} active`}
      />
      <StatCard
        label="Members"
        icon={Users}
        loading={loading}
        value={data && formatNumber(data.members_total)}
        hint={
          data &&
          `${data.members_by_role.owner + data.members_by_role.admin} owners & admins`
        }
      />
      <StatCard
        label="Production workspaces"
        icon={Rocket}
        loading={loading}
        value={data && formatNumber(data.workspaces_by_environment.production)}
        hint={
          data &&
          `${data.workspaces_by_environment.staging} staging · ${data.workspaces_by_environment.development} development`
        }
      />
      <StatCard
        label="Audit events (7 days)"
        icon={History}
        loading={loading}
        value={data && formatNumber(data.audit_events_last_7_days)}
        hint={
          data &&
          (data.last_activity_at
            ? `Last activity ${formatRelativeTime(data.last_activity_at)}`
            : "No activity recorded yet")
        }
      />
    </div>
  );
}

function WorkspacesCard({ organization }: { organization: Organization }) {
  const workspaces = useWorkspaces(organization.id);
  const items = workspaces.data?.items.slice(0, 5) ?? [];

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Workspaces"
        description={
          isManager(organization.role)
            ? "All workspaces in this organization"
            : "Workspaces you are a member of"
        }
        actions={
          <Link
            to="/workspaces"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View all <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />
      <div className="mt-4">
        {workspaces.isPending ? (
          <div className="space-y-3 px-5 pb-5" aria-busy="true" aria-label="Loading workspaces">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-9 w-full" />
            ))}
          </div>
        ) : workspaces.isError ? (
          <ErrorState error={workspaces.error} onRetry={() => void workspaces.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No workspaces yet"
            description="Workspaces isolate each customer engagement. Create one from the Workspaces page."
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Environment</TH>
                <TH className="hidden sm:table-cell">Created</TH>
              </tr>
            </THead>
            <TBody>
              {items.map((workspace) => (
                <TR key={workspace.id}>
                  <TD>
                    <Link
                      to={`/workspaces/${workspace.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {workspace.name}
                    </Link>
                    <p className="text-xs text-subtle">{workspace.slug}</p>
                  </TD>
                  <TD>
                    <EnvironmentBadge environment={workspace.environment} />
                  </TD>
                  <TD className="hidden text-muted sm:table-cell">
                    {formatDate(workspace.created_at)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </Card>
  );
}

function PlatformStatusCard() {
  const readiness = useReadiness();
  const data = readiness.data;
  const database = data?.checks.database;

  const rows: { label: string; value: ReactNode }[] = [
    {
      label: "API",
      value: readiness.isError ? (
        <Badge tone="danger" dot>Unreachable</Badge>
      ) : data ? (
        <Badge tone="success" dot>Online</Badge>
      ) : (
        <Skeleton className="h-5 w-16" />
      ),
    },
    {
      label: "Database",
      value: readiness.isError ? (
        <Badge tone="neutral">Unknown</Badge>
      ) : database ? (
        <Badge tone={database.status === "ok" ? "success" : "danger"} dot>
          {database.status === "ok" ? `Healthy · ${database.latency_ms} ms` : "Unavailable"}
        </Badge>
      ) : (
        <Skeleton className="h-5 w-24" />
      ),
    },
    { label: "Version", value: data ? <span className="font-mono text-xs">{data.version}</span> : "—" },
    { label: "Environment", value: data ? titleCase(data.environment) : "—" },
  ];

  return (
    <Card>
      <CardHeader title="Platform status" description="Live readiness probe, refreshed every 30 s" />
      <dl className="mt-3 divide-y divide-border px-5 pb-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-3">
            <dt className="text-sm text-muted">{row.label}</dt>
            <dd className="text-sm text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function RecentActivityCard({ organization }: { organization: Organization }) {
  const canView = isManager(organization.role);
  const audit = useAuditLogs(organization.id, canView);

  return (
    <Card>
      <CardHeader title="Recent activity" description="Latest entries from the organization audit log" />
      <div className="mt-2">
        {!canView ? (
          <EmptyState
            icon={History}
            title="Restricted to owners and admins"
            description="Your role can see workspace activity but not the organization audit log."
          />
        ) : audit.isPending ? (
          <div className="space-y-3 px-5 pb-5" aria-busy="true" aria-label="Loading activity">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-10 w-full" />
            ))}
          </div>
        ) : audit.isError ? (
          <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
        ) : audit.data.items.length === 0 ? (
          <EmptyState icon={History} title="No activity recorded yet" />
        ) : (
          <ul className="divide-y divide-border">
            {audit.data.items.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface-muted text-subtle">
                  <Activity className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{titleCase(entry.action)}</span>
                    {typeof entry.details.name === "string" && (
                      <span className="text-muted"> · {entry.details.name}</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-subtle">
                    {entry.actor_email ?? "System"} · {formatRelativeTime(entry.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const { organizations, activeOrganization, setActiveOrganization, isLoading, error, refetch, isRefetching } =
    useOrganizationContext();
  const [creating, setCreating] = useState(false);

  const createDialog = (
    <CreateOrganizationDialog
      open={creating}
      onClose={() => setCreating(false)}
      onCreated={(org) => setActiveOrganization(org.id)}
    />
  );

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading dashboard">
        <Skeleton className="mb-2 h-8 w-64" />
        <Skeleton className="mb-6 h-4 w-96 max-w-full" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((card) => (
            <Skeleton key={card} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <ErrorState error={error} title="Unable to load your organizations" onRetry={refetch} retrying={isRefetching} />
      </Card>
    );
  }

  if (!activeOrganization || organizations.length === 0) {
    return (
      <>
        <PageHeader title="Enterprise overview" />
        <Card>
          <EmptyState
            icon={Building2}
            title="Create your first customer organization"
            description="Organizations are isolated tenants. Workspaces, members and the audit trail all belong to one."
            action={
              <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
                New organization
              </Button>
            }
          />
        </Card>
        {createDialog}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Enterprise overview"
        description={
          <>
            Live metrics for <span className="font-medium text-foreground">{activeOrganization.name}</span>.
          </>
        }
        actions={
          <Button variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
            New organization
          </Button>
        }
      />
      <div className="space-y-6">
        <OrganizationStatsGrid organization={activeOrganization} />
        <div className="grid gap-6 lg:grid-cols-3">
          <WorkspacesCard organization={activeOrganization} />
          <PlatformStatusCard />
        </div>
        <RecentActivityCard organization={activeOrganization} />
      </div>
      {createDialog}
    </>
  );
}
