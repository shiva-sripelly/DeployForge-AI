import { Building2, Check, Plus } from "lucide-react";
import { useState } from "react";

import { RoleBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/Table";
import { CreateOrganizationDialog } from "@/features/organizations/CreateOrganizationDialog";
import { formatDate } from "@/lib/format";
import { useOrganizationContext } from "@/providers/OrganizationProvider";

export function CustomersPage() {
  const { organizations, activeOrganization, setActiveOrganization, isLoading, error, refetch, isRefetching } =
    useOrganizationContext();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Each customer is an isolated organization (tenant). Its workspaces, members and audit history never mix with another customer's."
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
            New organization
          </Button>
        }
      />
      <Card>
        {isLoading ? (
          <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading organizations">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-11 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} retrying={isRefetching} />
        ) : organizations.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No customer organizations yet"
            description="Create an organization to start onboarding a customer."
          />
        ) : (
          <Table>
            <caption className="sr-only">Organizations you belong to</caption>
            <THead>
              <tr>
                <TH>Organization</TH>
                <TH>Your role</TH>
                <TH className="hidden md:table-cell">Created</TH>
                <TH className="text-right">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {organizations.map((org) => {
                const active = org.id === activeOrganization?.id;
                return (
                  <TR key={org.id}>
                    <TD>
                      <p className="font-medium">{org.name}</p>
                      <p className="text-xs text-subtle">{org.slug}</p>
                    </TD>
                    <TD>
                      <RoleBadge role={org.role} />
                    </TD>
                    <TD className="hidden text-muted md:table-cell">{formatDate(org.created_at)}</TD>
                    <TD className="text-right">
                      {active ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                          <Check className="size-3.5" aria-hidden /> Active
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setActiveOrganization(org.id)}
                          aria-label={`Switch to ${org.name}`}
                        >
                          Switch to
                        </Button>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      <CreateOrganizationDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(org) => setActiveOrganization(org.id)}
      />
    </>
  );
}
