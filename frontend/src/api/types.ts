/** Types mirroring the FastAPI response schemas (backend/app/schemas). */

export type OrganizationRole = "owner" | "admin" | "member" | "viewer";
export type WorkspaceRole = "admin" | "editor" | "viewer";
export type WorkspaceEnvironment = "development" | "staging" | "production";
export type WorkspaceStatus = "active" | "archived";

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface LivenessResponse {
  status: "ok";
  service: string;
  version: string;
  environment: string;
}

export interface ComponentStatus {
  status: "ok" | "unavailable";
  latency_ms: number | null;
  detail: string | null;
}

export interface ReadinessResponse {
  status: "ready" | "not_ready";
  version: string;
  environment: string;
  checks: Record<string, ComponentStatus>;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
  created_at: string;
  updated_at: string;
}

export interface OrganizationCreate {
  name: string;
  slug?: string;
}

export interface OrganizationStats {
  organization_id: string;
  workspaces_total: number;
  workspaces_active: number;
  workspaces_by_environment: Record<WorkspaceEnvironment, number>;
  members_total: number;
  members_by_role: Record<OrganizationRole, number>;
  audit_events_last_7_days: number;
  last_activity_at: string | null;
}

export interface Workspace {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  environment: WorkspaceEnvironment;
  status: WorkspaceStatus;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceDetail extends Workspace {
  access: { organization_role: OrganizationRole; workspace_role: WorkspaceRole | null };
}

export interface WorkspaceCreate {
  name: string;
  slug?: string;
  description?: string;
  environment: WorkspaceEnvironment;
}

export interface WorkspaceStats {
  workspace_id: string;
  members_total: number;
  members_by_role: Record<WorkspaceRole, number>;
  audit_events_total: number;
  audit_events_last_7_days: number;
  last_activity_at: string | null;
}

export interface AuditLogEntry {
  id: string;
  organization_id: string | null;
  workspace_id: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  request_id: string | null;
  created_at: string;
}

export const MANAGER_ROLES: readonly OrganizationRole[] = ["owner", "admin"];

export function isManager(role: OrganizationRole | undefined): boolean {
  return role !== undefined && MANAGER_ROLES.includes(role);
}
