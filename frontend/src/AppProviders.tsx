import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { DemoAuthProvider } from "@/demo/DemoAuthProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";

// Resolved at compile time: the public demo bundle contains no token-based sign-in.
const IdentityProvider = __DEMO_MODE__ ? DemoAuthProvider : AuthProvider;

export function AppProviders({
  queryClient,
  children,
}: {
  queryClient: QueryClient;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <IdentityProvider>{children}</IdentityProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
