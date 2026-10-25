import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "@/api/endpoints";
import type { OrganizationCreate, WorkspaceCreate } from "@/api/types";
import type { ApiError } from "@/lib/api-client";

export const queryKeys = {
  liveness: ["health", "live"] as const,
  readiness: ["health", "ready"] as const,
  currentUser: ["auth", "me"] as const,
  organizations: ["organizations"] as const,
  organizationStats: (id: string) => ["organizations", id, "stats"] as const,
  auditLogs: (id: string) => ["organizations", id, "audit-logs"] as const,
  workspaces: (orgId: string) => ["organizations", orgId, "workspaces"] as const,
  workspace: (id: string) => ["workspaces", id] as const,
  workspaceStats: (id: string) => ["workspaces", id, "stats"] as const,
};

export function useReadiness(refetchInterval: number | false = 30_000) {
  return useQuery({
    queryKey: queryKeys.readiness,
    queryFn: api.getReadiness,
    refetchInterval,
    retry: false,
  });
}

export function useLiveness(refetchInterval: number | false = 30_000) {
  return useQuery({
    queryKey: queryKeys.liveness,
    queryFn: api.getLiveness,
    refetchInterval,
    retry: false,
  });
}

export function useOrganizations(enabled = true) {
  return useQuery({ queryKey: queryKeys.organizations, queryFn: api.listOrganizations, enabled });
}

export function useOrganizationStats(organizationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.organizationStats(organizationId ?? ""),
    queryFn: () => api.getOrganizationStats(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useAuditLogs(organizationId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.auditLogs(organizationId ?? ""),
    queryFn: () => api.listAuditLogs(organizationId!),
    enabled: Boolean(organizationId) && enabled,
  });
}

export function useWorkspaces(organizationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces(organizationId ?? ""),
    queryFn: () => api.listWorkspaces(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useWorkspace(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspace(workspaceId ?? ""),
    queryFn: () => api.getWorkspace(workspaceId!),
    enabled: Boolean(workspaceId),
  });
}

export function useWorkspaceStats(workspaceId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.workspaceStats(workspaceId ?? ""),
    queryFn: () => api.getWorkspaceStats(workspaceId!),
    enabled: Boolean(workspaceId) && enabled,
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OrganizationCreate) => api.createOrganization(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.organizations }),
  });
}

export function useCreateWorkspace(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof api.createWorkspace>>, ApiError, WorkspaceCreate>({
    mutationFn: (body) => api.createWorkspace(organizationId, body),
    // Workspaces, stats and the audit log all live under the organization key.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId] }),
  });
}
