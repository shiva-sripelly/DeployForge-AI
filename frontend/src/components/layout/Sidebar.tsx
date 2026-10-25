import { X } from "lucide-react";
import { NavLink } from "react-router";

import { BrandMark } from "@/components/layout/BrandMark";
import { navigation } from "@/components/layout/navigation";
import { cn } from "@/lib/cn";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-overlay transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        id="app-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface transition-transform lg:translate-x-0",
          // `invisible` keeps off-screen links out of the tab order on small screens.
          open ? "translate-x-0" : "invisible -translate-x-full lg:visible",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <NavLink to="/" onClick={onClose} aria-label="DeployForge AI home">
            <BrandMark />
          </NavLink>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-subtle hover:bg-surface-hover lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 pb-4">
          {navigation.map((group) => (
            <div key={group.label} className="mt-4 first:mt-1">
              <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-subtle uppercase">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary-soft text-primary-soft-foreground"
                            : "text-muted hover:bg-surface-hover hover:text-foreground",
                        )
                      }
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.phase && (
                        <span
                          className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-subtle"
                          title={`Planned for Phase ${item.phase}`}
                        >
                          P{item.phase}
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-border px-5 py-4 text-xs text-subtle">
          <p className="font-medium text-muted">Phase 1 · Foundation</p>
          <p className="mt-0.5">Tenancy, workspaces &amp; audit trail</p>
        </div>
      </aside>
    </>
  );
}
