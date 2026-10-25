import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  hint?: ReactNode;
  loading?: boolean;
}

export function StatCard({ label, value, icon: Icon, hint, loading = false }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-subtle uppercase">{label}</p>
        <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      {loading ? (
        <div aria-busy="true" aria-label={`Loading ${label}`}>
          <Skeleton className="mt-3 h-8 w-20" />
          <Skeleton className="mt-2 h-3.5 w-32" />
        </div>
      ) : (
        <>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground tabular-nums">
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
        </>
      )}
    </Card>
  );
}
