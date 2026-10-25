import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { getCurrentUser, issueDevToken } from "@/api/endpoints";
import { queryKeys } from "@/api/hooks";
import type { User } from "@/api/types";
import { UNAUTHORIZED_EVENT } from "@/lib/api-client";
import { accessTokenStore } from "@/lib/storage";

export type AuthStatus = "anonymous" | "loading" | "authenticated" | "error";

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  error: unknown;
  signIn: (email: string) => Promise<void>;
  signOut: () => void;
  retry: () => void;
}

/** Exported so the public demo can supply a token-free identity (see DemoAuthProvider). */
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => accessTokenStore.get());

  const currentUser = useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: getCurrentUser,
    enabled: token !== null,
    staleTime: 5 * 60_000,
  });

  // The API client clears the stored token on any 401; mirror that in React state.
  useEffect(() => {
    const onUnauthorized = () => {
      setToken(null);
      queryClient.clear();
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [queryClient]);

  const signIn = useCallback(
    async (email: string) => {
      const { access_token } = await issueDevToken(email);
      accessTokenStore.set(access_token);
      queryClient.clear();
      setToken(access_token);
    },
    [queryClient],
  );

  const signOut = useCallback(() => {
    accessTokenStore.clear();
    queryClient.clear();
    setToken(null);
  }, [queryClient]);

  const { refetch } = currentUser;
  const retry = useCallback(() => void refetch(), [refetch]);

  let status: AuthStatus;
  if (token === null) status = "anonymous";
  else if (currentUser.isPending) status = "loading";
  else if (currentUser.isError) status = "error";
  else status = "authenticated";

  const user = status === "authenticated" ? (currentUser.data ?? null) : null;
  const value = useMemo(
    () => ({ status, user, error: currentUser.error, signIn, signOut, retry }),
    [status, user, currentUser.error, signIn, signOut, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
