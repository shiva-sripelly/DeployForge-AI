import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme, type ThemePreference } from "@/providers/ThemeProvider";

const order: ThemePreference[] = ["light", "dark", "system"];
const icons = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const next = order[(order.indexOf(preference) + 1) % order.length] ?? "system";
  const Icon = icons[preference];

  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-foreground"
      aria-label={`Theme: ${preference}. Switch to ${next}.`}
      title={`Theme: ${preference}`}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
