import { ExternalLink, Eye } from "lucide-react";

export const REPOSITORY_URL = "https://github.com/shiva-sripelly/DeployForge-AI";

export function DemoBanner() {
  return (
    <div
      role="note"
      aria-label="Public demo notice"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-primary-soft px-4 py-2 text-xs text-primary-soft-foreground sm:px-6 lg:px-8"
    >
      <Eye className="size-3.5 shrink-0" aria-hidden />
      <p className="flex-1">
        <strong className="font-semibold">Public demo.</strong> Read-only, with synthetic data.
        Sign-in and all changes are disabled; platform status below is live.
      </p>
      <a
        href={REPOSITORY_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-medium hover:underline"
      >
        View source <ExternalLink className="size-3" aria-hidden />
      </a>
    </div>
  );
}
