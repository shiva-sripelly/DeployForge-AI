import type {
  AuditLogEntry,
  LivenessResponse,
  Organization,
  OrganizationCreate,
  OrganizationStats,
  Page,
  ReadinessResponse,
  TokenResponse,
  User,
  Workspace,
  WorkspaceCreate,
  WorkspaceDetail,
  WorkspaceStats,
} from "@/api/types";
import { apiClient } from "@/lib/api-client";

export async function getLiveness(): Promise<LivenessResponse> {
  return (await apiClient.get<LivenessResponse>("/health/live")).data;
}

/** A 503 from readiness still carries a meaningful body, so treat it as data. */
export async function getReadiness(): Promise<ReadinessResponse> {
  const response = await apiClient.get<ReadinessResponse>("/health/ready", {
    validateStatus: (status) => status === 200 || status === 503,
  });
  return response.data;
}

export async function issueDevToken(email: string): Promise<TokenResponse> {
  return (await apiClient.post<TokenResponse>("/auth/dev/token", { email })).data;
}

export async function getCurrentUser(): Promise<User> {
  return (await apiClient.get<User>("/auth/me")).data;
}

export async function listOrganizations(): Promise<Page<Organization>> {
  return (await apiClient.get<Page<Organization>>("/organizations", { params: { limit: 100 } }))
    .data;
}

export async function createOrganization(body: OrganizationCreate): Promise<Organization> {
  return (await apiClient.post<Organization>("/organizations", body)).data;
}

export async function getOrganizationStats(organizationId: string): Promise<OrganizationStats> {
  return (await apiClient.get<OrganizationStats>(`/organizations/${organizationId}/stats`)).data;
}

export async function listAuditLogs(
  organizationId: string,
  limit = 10,
): Promise<Page<AuditLogEntry>> {
  return (
    await apiClient.get<Page<AuditLogEntry>>(`/organizations/${organizationId}/audit-logs`, {
      params: { limit },
    })
  ).data;
}

export async function listWorkspaces(organizationId: string): Promise<Page<Workspace>> {
  return (
    await apiClient.get<Page<Workspace>>(`/organizations/${organizationId}/workspaces`, {
      params: { limit: 100 },
    })
  ).data;
}

export async function createWorkspace(
  organizationId: string,
  body: WorkspaceCreate,
): Promise<WorkspaceDetail> {
  return (
    await apiClient.post<WorkspaceDetail>(`/organizations/${organizationId}/workspaces`, body)
  ).data;
}

export async function getWorkspace(workspaceId: string): Promise<WorkspaceDetail> {
  return (await apiClient.get<WorkspaceDetail>(`/workspaces/${workspaceId}`)).data;
}

export async function getWorkspaceStats(workspaceId: string): Promise<WorkspaceStats> {
  return (await apiClient.get<WorkspaceStats>(`/workspaces/${workspaceId}/stats`)).data;
}
