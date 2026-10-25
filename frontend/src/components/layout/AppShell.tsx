import { useState } from "react";
import { Outlet } from "react-router";

import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { DemoBanner } from "@/demo/DemoBanner";
import { SignInPage } from "@/pages/SignInPage";
import { useAuth } from "@/providers/AuthProvider";
import { OrganizationProvider } from "@/providers/OrganizationProvider";

export function AppShell() {
  const auth = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  // __DEMO_MODE__ is a compile-time constant, so the public demo bundle does not
  // include the development sign-in page at all.
  if (!__DEMO_MODE__ && auth.status === "anonymous") return <SignInPage />;
  if (auth.status === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center">
        <LoadingState label="Restoring your session…" />
      </div>
    );
  }
  if (auth.status === "error") {
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        <ErrorState error={auth.error} onRetry={auth.retry} />
      </div>
    );
  }

  return (
    <OrganizationProvider>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-h-dvh flex-col lg:pl-64">
        {__DEMO_MODE__ && <DemoBanner />}
        <TopBar onOpenNav={() => setNavOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </OrganizationProvider>
  );
}
