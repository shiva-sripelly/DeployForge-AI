import { Building2, LogOut, Menu } from "lucide-react";

import { ApiStatusIndicator } from "@/components/layout/ApiStatusIndicator";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useAuth } from "@/providers/AuthProvider";
import { useOrganizationContext } from "@/providers/OrganizationProvider";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function OrganizationSwitcher() {
  const { organizations, activeOrganization, setActiveOrganization, isLoading } =
    useOrganizationContext();

  if (isLoading) return <div className="h-8 w-44 animate-pulse rounded-lg bg-surface-muted" />;
  if (!activeOrganization) {
    return <span className="text-sm text-subtle">No organization yet</span>;
  }

  return (
    <div className="relative flex min-w-0 items-center">
      <Building2
        className="pointer-events-none absolute left-2.5 size-4 text-subtle"
        aria-hidden
      />
      <label htmlFor="organization-switcher" className="sr-only">
        Active organization
      </label>
      <select
        id="organization-switcher"
        value={activeOrganization.id}
        onChange={(event) => setActiveOrganization(event.target.value)}
        className="h-8 max-w-[14rem] min-w-0 truncate rounded-lg border border-border bg-surface pr-8 pl-8 text-sm font-medium text-foreground hover:bg-surface-hover sm:max-w-xs"
      >
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenNav}
        className="-ml-1 rounded-md p-1.5 text-muted hover:bg-surface-hover lg:hidden"
        aria-label="Open navigation"
        aria-controls="app-sidebar"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      <OrganizationSwitcher />

      <div className="ml-auto flex items-center gap-2">
        <ApiStatusIndicator className="hidden sm:inline-flex" />
        <ThemeToggle />
        {user && (
          <div className="flex items-center gap-2 border-l border-border pl-3">
            <span
              className="grid size-8 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground"
              aria-hidden
            >
              {initials(user.full_name)}
            </span>
            <div className="hidden leading-tight md:block">
              <p className="text-sm font-medium text-foreground">{user.full_name}</p>
              <p className="text-xs text-subtle">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-foreground"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
