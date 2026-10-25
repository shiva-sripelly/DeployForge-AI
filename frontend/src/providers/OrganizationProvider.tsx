import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { useOrganizations } from "@/api/hooks";
import type { Organization } from "@/api/types";
import { readStorage, writeStorage } from "@/lib/storage";

const ACTIVE_ORGANIZATION_KEY = "deployforge.activeOrganization";

interface OrganizationContextValue {
  organizations: Organization[];
  activeOrganization: Organization | null;
  setActiveOrganization: (id: string) => void;
  isLoading: boolean;
  isRefetching: boolean;
  error: unknown;
  refetch: () => void;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

/** Tracks which organization (tenant) the user is currently working in. */
export function OrganizationProvider({ children }: { children: ReactNode }) {
  const query = useOrganizations();
  const [selectedId, setSelectedId] = useState(() =>
    readStorage("local", ACTIVE_ORGANIZATION_KEY),
  );

  const organizations = useMemo(() => query.data?.items ?? [], [query.data]);
  const activeOrganization =
    organizations.find((org) => org.id === selectedId) ?? organizations[0] ?? null;

  const setActiveOrganization = useCallback((id: string) => {
    setSelectedId(id);
    writeStorage("local", ACTIVE_ORGANIZATION_KEY, id);
  }, []);

  const { refetch } = query;
  const value = useMemo(
    () => ({
      organizations,
      activeOrganization,
      setActiveOrganization,
      isLoading: query.isPending,
      isRefetching: query.isRefetching,
      error: query.error,
      refetch: () => void refetch(),
    }),
    [
      organizations,
      activeOrganization,
      setActiveOrganization,
      query.isPending,
      query.isRefetching,
      query.error,
      refetch,
    ],
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganizationContext(): OrganizationContextValue {
  const context = useContext(OrganizationContext);
  if (!context) throw new Error("useOrganizationContext must be used within OrganizationProvider");
  return context;
}
