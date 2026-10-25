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
import { demoApi } from "@/demo/demo-api";
import { ApiError, apiClient } from "@/lib/api-client";

/** Guards against a misconfigured API URL returning an HTML page instead of JSON. */
function expectJsonObject<T>(data: unknown, status: number, key: keyof T): T {
  if (typeof data === "object" && data !== null && key in data) return data as T;
  throw new ApiError({
    status,
    code: "unexpected_response",
    message: "The API returned an unexpected response. Check the configured API base URL.",
  });
}

// Health endpoints are public and always call the real backend, including in the demo.

export async function getLiveness(): Promise<LivenessResponse> {
  const response = await apiClient.get<unknown>("/health/live");
  return expectJsonObject<LivenessResponse>(response.data, response.status, "status");
}

/** A 503 from readiness still carries a meaningful body, so treat it as data. */
export async function getReadiness(): Promise<ReadinessResponse> {
  const response = await apiClient.get<unknown>("/health/ready", {
    validateStatus: (status) => status === 200 || status === 503,
  });
  return expectJsonObject<ReadinessResponse>(response.data, response.status, "checks");
}

export async function issueDevToken(email: string): Promise<TokenResponse> {
  return (await apiClient.post<TokenResponse>("/auth/dev/token", { email })).data;
}

export async function getCurrentUser(): Promise<User> {
  return (await apiClient.get<User>("/auth/me")).data;
}

// Business endpoints. In the public demo build (__DEMO_MODE__, a compile-time
// constant) they are served from synthetic in-browser data instead.

export const listOrganizations = __DEMO_MODE__
  ? demoApi.listOrganizations
  : async (): Promise<Page<Organization>> =>
      (await apiClient.get<Page<Organization>>("/organizations", { params: { limit: 100 } })).data;

export const createOrganization = __DEMO_MODE__
  ? demoApi.createOrganization
  : async (body: OrganizationCreate): Promise<Organization> =>
      (await apiClient.post<Organization>("/organizations", body)).data;

export const getOrganizationStats = __DEMO_MODE__
  ? demoApi.getOrganizationStats
  : async (organizationId: string): Promise<OrganizationStats> =>
      (await apiClient.get<OrganizationStats>(`/organizations/${organizationId}/stats`)).data;

export const listAuditLogs = __DEMO_MODE__
  ? demoApi.listAuditLogs
  : async (organizationId: string, limit = 10): Promise<Page<AuditLogEntry>> =>
      (
        await apiClient.get<Page<AuditLogEntry>>(`/organizations/${organizationId}/audit-logs`, {
          params: { limit },
        })
      ).data;

export const listWorkspaces = __DEMO_MODE__
  ? demoApi.listWorkspaces
  : async (organizationId: string): Promise<Page<Workspace>> =>
      (
        await apiClient.get<Page<Workspace>>(`/organizations/${organizationId}/workspaces`, {
          params: { limit: 100 },
        })
      ).data;

export const createWorkspace = __DEMO_MODE__
  ? demoApi.createWorkspace
  : async (organizationId: string, body: WorkspaceCreate): Promise<WorkspaceDetail> =>
      (await apiClient.post<WorkspaceDetail>(`/organizations/${organizationId}/workspaces`, body))
        .data;

export const getWorkspace = __DEMO_MODE__
  ? demoApi.getWorkspace
  : async (workspaceId: string): Promise<WorkspaceDetail> =>
      (await apiClient.get<WorkspaceDetail>(`/workspaces/${workspaceId}`)).data;

export const getWorkspaceStats = __DEMO_MODE__
  ? demoApi.getWorkspaceStats
  : async (workspaceId: string): Promise<WorkspaceStats> =>
      (await apiClient.get<WorkspaceStats>(`/workspaces/${workspaceId}/stats`)).data;
