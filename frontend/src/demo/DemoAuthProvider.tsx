import { useMemo, type ReactNode } from "react";

import { DEMO_READ_ONLY_MESSAGE } from "@/demo/demo-api";
import { DEMO_VISITOR } from "@/demo/demo-data";
import { ApiError } from "@/lib/api-client";
import { AuthContext } from "@/providers/AuthProvider";

/**
 * Identity for public demo visitors. No token is requested, stored or sent:
 * the visitor is a synthetic, client-side identity with no backend account.
 */
export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const value = useMemo(
    () => ({
      status: "authenticated" as const,
      user: DEMO_VISITOR,
      error: null,
      signIn: () =>
        Promise.reject(new ApiError({ status: 403, code: "demo_read_only", message: DEMO_READ_ONLY_MESSAGE })),
      signOut: () => undefined,
      retry: () => undefined,
    }),
    [],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
