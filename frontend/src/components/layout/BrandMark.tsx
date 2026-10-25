export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path
          d="M9 9h7.5a7 7 0 0 1 0 14H9z"
          fill="none"
          className="stroke-primary-foreground"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <path d="M13 16h7" stroke="#a5b4fc" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      {!compact && (
        <span className="text-[15px] leading-none font-semibold tracking-tight text-foreground">
          DeployForge <span className="text-primary">AI</span>
        </span>
      )}
    </span>
  );
}
