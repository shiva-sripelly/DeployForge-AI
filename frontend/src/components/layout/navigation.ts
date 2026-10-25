import {
  Activity,
  Bot,
  Building2,
  FolderKanban,
  LayoutDashboard,
  Plug,
  Rocket,
  Settings,
  Siren,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Roadmap phase in which the feature ships; omitted for live features. */
  phase?: number;
  end?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navigation: NavGroup[] = [
  {
    label: "Overview",
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    label: "Accounts",
    items: [
      { to: "/customers", label: "Customers", icon: Building2 },
      { to: "/workspaces", label: "Workspaces", icon: FolderKanban },
    ],
  },
  {
    label: "Build",
    items: [
      { to: "/architect", label: "Solution Architect", icon: Sparkles, phase: 3 },
      { to: "/integrations", label: "Integrations", icon: Plug, phase: 4 },
      { to: "/workflows", label: "Workflows", icon: Workflow, phase: 4 },
      { to: "/agents", label: "Agent Studio", icon: Bot, phase: 5 },
    ],
  },
  {
    label: "Operate",
    items: [
      { to: "/deployments", label: "Deployments", icon: Rocket, phase: 6 },
      { to: "/monitoring", label: "Monitoring", icon: Activity },
      { to: "/incidents", label: "Incidents", icon: Siren, phase: 6 },
    ],
  },
  {
    label: "Administration",
    items: [{ to: "/settings", label: "Settings", icon: Settings }],
  },
];
