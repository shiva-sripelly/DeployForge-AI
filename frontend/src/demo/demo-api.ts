/**
 * In-browser, read-only implementation of the business endpoints for the
 * public demo. It never contacts the backend: in production the API has no
 * way to issue tokens, so every protected endpoint would (correctly) reject
 * demo visitors. Health endpoints are not part of this module and stay live.
 */

import type {
  AuditLogEntry,
  Organization,
  OrganizationCreate,
  OrganizationStats,
  Page,
  Workspace,
  WorkspaceCreate,
  WorkspaceDetail,
  WorkspaceStats,
} from "@/api/types";
import {
  DEMO_VISITOR_WORKSPACE_ROLE,
  demoAuditLogs,
  demoOrganizations,
  demoWorkspaces,
  type DemoWorkspace,
} from "@/demo/demo-data";
import { ApiError } from "@/lib/api-client";

const WEEK = 7 * 24 * 60 * 60 * 1000;

export const DEMO_READ_ONLY_MESSAGE = "This is a read-only demo with synthetic data. Changes are disabled.";
export const DEMO_DISABLED_TITLE = "Disabled in the read-only public demo";

function page<T>(items: T[], limit = 100): Page<T> {
  return { items: items.slice(0, limit), total: items.length, limit, offset: 0 };
}

function readOnly(): Promise<never> {
  return Promise.reject(
    new ApiError({ status: 403, code: "demo_read_only", message: DEMO_READ_ONLY_MESSAGE }),
  );
}

function notFound(message: string): Promise<never> {
  return Promise.reject(new ApiError({ status: 404, code: "not_found", message }));
}

function toWorkspace({ members_by_role: _members, ...workspace }: DemoWorkspace): Workspace {
  return workspace;
}

function activity(entries: AuditLogEntry[]) {
  const since = Date.now() - WEEK;
  const times = entries.map((entry) => new Date(entry.created_at).getTime());
  return {
    recent: times.filter((time) => time >= since).length,
    last: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };
}

export const demoApi = {
  async listOrganizations(): Promise<Page<Organization>> {
    return page(demoOrganizations.map(({ members_by_role: _members, ...org }) => org));
  },

  createOrganization(_body: OrganizationCreate): Promise<Organization> {
    return readOnly();
  },

  async getOrganizationStats(organizationId: string): Promise<OrganizationStats> {
    const organization = demoOrganizations.find((org) => org.id === organizationId);
    if (!organization) return notFound("Organization not found.");
    const workspaces = demoWorkspaces.filter((ws) => ws.organization_id === organizationId);
    const events = activity(demoAuditLogs.filter((entry) => entry.organization_id === organizationId));
    const byEnvironment = { development: 0, staging: 0, production: 0 };
    for (const ws of workspaces) byEnvironment[ws.environment] += 1;
    return {
      organization_id: organizationId,
      workspaces_total: workspaces.length,
      workspaces_active: workspaces.filter((ws) => ws.status === "active").length,
      workspaces_by_environment: byEnvironment,
      members_total: Object.values(organization.members_by_role).reduce((a, b) => a + b, 0),
      members_by_role: { ...organization.members_by_role },
      audit_events_last_7_days: events.recent,
      last_activity_at: events.last,
    };
  },

  async listAuditLogs(organizationId: string, limit = 10): Promise<Page<AuditLogEntry>> {
    const entries = demoAuditLogs
      .filter((entry) => entry.organization_id === organizationId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return page(entries, limit);
  },

  async listWorkspaces(organizationId: string): Promise<Page<Workspace>> {
    return page(
      demoWorkspaces
        .filter((ws) => ws.organization_id === organizationId)
        .map(toWorkspace)
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  },

  createWorkspace(_organizationId: string, _body: WorkspaceCreate): Promise<WorkspaceDetail> {
    return readOnly();
  },

  async getWorkspace(workspaceId: string): Promise<WorkspaceDetail> {
    const ws = demoWorkspaces.find((candidate) => candidate.id === workspaceId);
    if (!ws) return notFound("Workspace not found.");
    return {
      ...toWorkspace(ws),
      access: { organization_role: "viewer", workspace_role: DEMO_VISITOR_WORKSPACE_ROLE },
    };
  },

  async getWorkspaceStats(workspaceId: string): Promise<WorkspaceStats> {
    const ws = demoWorkspaces.find((candidate) => candidate.id === workspaceId);
    if (!ws) return notFound("Workspace not found.");
    const entries = demoAuditLogs.filter((entry) => entry.workspace_id === workspaceId);
    const events = activity(entries);
    return {
      workspace_id: workspaceId,
      members_total: Object.values(ws.members_by_role).reduce((a, b) => a + b, 0),
      members_by_role: { ...ws.members_by_role },
      audit_events_total: entries.length,
      audit_events_last_7_days: events.recent,
      last_activity_at: events.last,
    };
  },
};
