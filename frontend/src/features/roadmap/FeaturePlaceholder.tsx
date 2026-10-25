import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { roadmapFeatures, type RoadmapFeatureKey } from "@/features/roadmap/roadmap";

/**
 * Placeholder for capabilities scheduled after Phase 1. It describes what is
 * planned and deliberately shows no metrics, so nothing here can be mistaken
 * for live data.
 */
export function FeaturePlaceholder({ feature }: { feature: RoadmapFeatureKey }) {
  const { title, phase, phaseName, icon: Icon, summary, capabilities } = roadmapFeatures[feature];

  return (
    <>
      <PageHeader
        title={title}
        description={summary}
        eyebrow={
          <Badge tone="primary">
            Planned · Phase {phase}: {phaseName}
          </Badge>
        }
      />
      <Card>
        <CardContent className="grid gap-8 p-6 md:grid-cols-[auto_1fr] md:p-8">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary-soft-foreground">
            <Icon className="size-7" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">What this area will provide</h2>
            <ul className="mt-4 space-y-3">
              {capabilities.map((capability) => (
                <li key={capability} className="flex gap-3 text-sm text-muted">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {capability}
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-border pt-5 text-sm text-subtle">
              Not available in Phase 1. In the meantime, set up{" "}
              <Link to="/customers" className="font-medium text-primary hover:underline">
                customer organizations
              </Link>{" "}
              and{" "}
              <Link to="/workspaces" className="font-medium text-primary hover:underline">
                workspaces
              </Link>
              ; every later capability is scoped to them.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
