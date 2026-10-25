import { Bot, Plug, Rocket, Siren, Sparkles, Workflow, type LucideIcon } from "lucide-react";

export interface RoadmapFeature {
  title: string;
  phase: number;
  phaseName: string;
  icon: LucideIcon;
  summary: string;
  capabilities: string[];
}

export const roadmapFeatures = {
  architect: {
    title: "AI Solution Architect",
    phase: 3,
    phaseName: "Requirements intelligence",
    icon: Sparkles,
    summary:
      "Turn customer discovery notes, RFPs and transcripts into a reviewed solution design with security and data-handling constraints made explicit.",
    capabilities: [
      "Structured requirement capture per workspace",
      "Generated reference architectures with trade-off notes",
      "Risk, compliance and data-residency checklists",
      "Human review and approval before anything is built",
    ],
  },
  integrations: {
    title: "Integrations",
    phase: 4,
    phaseName: "Integrations & workflows",
    icon: Plug,
    summary:
      "Connect customer systems of record through scoped, audited credentials stored outside the application database.",
    capabilities: [
      "Connector catalog (CRM, ticketing, data warehouses, identity providers)",
      "Per-workspace secrets held in an external secrets manager",
      "Connection health checks and credential rotation",
    ],
  },
  workflows: {
    title: "Workflows",
    phase: 4,
    phaseName: "Integrations & workflows",
    icon: Workflow,
    summary:
      "Compose deterministic, versioned workflows that combine integrations, approvals and AI steps.",
    capabilities: [
      "Visual workflow builder with versioning",
      "Human-in-the-loop approval steps",
      "Replayable execution history",
    ],
  },
  agents: {
    title: "AI Agent Studio",
    phase: 5,
    phaseName: "Agents & evaluation",
    icon: Bot,
    summary:
      "Design, evaluate and govern AI agents with explicit tool permissions and measurable quality gates.",
    capabilities: [
      "Agent definitions with least-privilege tool access",
      "Offline evaluation suites and regression tracking",
      "Prompt and model version management",
    ],
  },
  deployments: {
    title: "Deployments",
    phase: 6,
    phaseName: "Delivery & operations",
    icon: Rocket,
    summary:
      "Promote solutions from development to production with environment-aware approvals and rollbacks.",
    capabilities: [
      "Environment promotion pipeline per workspace",
      "Change approvals tied to the audit log",
      "One-click rollback to a known-good release",
    ],
  },
  incidents: {
    title: "Incidents",
    phase: 6,
    phaseName: "Delivery & operations",
    icon: Siren,
    summary:
      "Detect, triage and resolve production issues with timelines linked to deployments and audit events.",
    capabilities: [
      "Alert routing and on-call escalation",
      "Incident timelines and post-incident reviews",
      "Customer-facing status communication",
    ],
  },
} satisfies Record<string, RoadmapFeature>;

export type RoadmapFeatureKey = keyof typeof roadmapFeatures;
