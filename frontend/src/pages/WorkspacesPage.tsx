import { Building2, FolderKanban, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { useWorkspaces } from "@/api/hooks";
import { isManager } from "@/api/types";
import { EnvironmentBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/Table";
import { DEMO_DISABLED_TITLE } from "@/demo/demo-api";
import { CreateWorkspaceDialog } from "@/features/workspaces/CreateWorkspaceDialog";
import { formatDate } from "@/lib/format";
import { useOrganizationContext } from "@/providers/OrganizationProvider";

export function WorkspacesPage() {
  const { activeOrganization, isLoading: organizationsLoading } = useOrganizationContext();
  const workspaces = useWorkspaces(activeOrganization?.id);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  if (!organizationsLoading && !activeOrganization) {
    return (
      <>
        <PageHeader title="Workspaces" />
        <Card>
          <EmptyState
            icon={Building2}
            title="No organization selected"
            description="Workspaces belong to an organization. Create one first."
            action={
              <Link to="/customers" className="text-sm font-medium text-primary hover:underline">
                Go to Customers
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  const canCreate = !__DEMO_MODE__ && isManager(activeOrganization?.role);
  const loading = organizationsLoading || workspaces.isPending;

  return (
    <>
      <PageHeader
        title="Workspaces"
        description={
          activeOrganization && (
            <>
              Isolated project areas in{" "}
              <span className="font-medium text-foreground">{activeOrganization.name}</span>.
              {!canCreate && " Only organization owners and admins can create workspaces."}
            </>
          )
        }
        actions={
          <Button
            icon={<Plus className="size-4" aria-hidden />}
            onClick={() => setCreating(true)}
            disabled={!canCreate}
            title={
              canCreate
                ? undefined
                : __DEMO_MODE__
                  ? DEMO_DISABLED_TITLE
                  : "Requires the owner or admin role"
            }
          >
            New workspace
          </Button>
        }
      />
      <Card>
        {loading ? (
          <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading workspaces">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-11 w-full" />
            ))}
          </div>
        ) : workspaces.isError ? (
          <ErrorState
            error={workspaces.error}
            onRetry={() => void workspaces.refetch()}
            retrying={workspaces.isRefetching}
          />
        ) : workspaces.data.items.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No workspaces yet"
            description={
              canCreate
                ? "Create a workspace for each customer engagement or solution."
                : "You have not been added to any workspace in this organization."
            }
          />
        ) : (
          <Table>
            <caption className="sr-only">Workspaces</caption>
            <THead>
              <tr>
                <TH>Workspace</TH>
                <TH>Environment</TH>
                <TH className="hidden sm:table-cell">Status</TH>
                <TH className="hidden md:table-cell">Created</TH>
              </tr>
            </THead>
            <TBody>
              {workspaces.data.items.map((workspace) => (
                <TR key={workspace.id}>
                  <TD className="max-w-md">
                    <Link
                      to={`/workspaces/${workspace.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {workspace.name}
                    </Link>
                    <p className="truncate text-xs text-subtle">
                      {workspace.description ?? workspace.slug}
                    </p>
                  </TD>
                  <TD>
                    <EnvironmentBadge environment={workspace.environment} />
                  </TD>
                  <TD className="hidden sm:table-cell">
                    <StatusBadge status={workspace.status} />
                  </TD>
                  <TD className="hidden text-muted md:table-cell">
                    {formatDate(workspace.created_at)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {activeOrganization && (
        <CreateWorkspaceDialog
          organizationId={activeOrganization.id}
          organizationName={activeOrganization.name}
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(workspace) => void navigate(`/workspaces/${workspace.id}`)}
        />
      )}
    </>
  );
}
