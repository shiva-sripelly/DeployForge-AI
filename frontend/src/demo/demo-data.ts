/**
 * Synthetic data for the public read-only demo.
 *
 * Every organization, person and event here is fictional. Email addresses use
 * the reserved example.com domain. Nothing is loaded from any database.
 */

import type {
  AuditLogEntry,
  Organization,
  OrganizationRole,
  User,
  Workspace,
  WorkspaceRole,
} from "@/api/types";

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number, hours = 0) =>
  new Date(Date.now() - days * DAY - hours * 60 * 60 * 1000).toISOString();

export const DEMO_VISITOR: User = {
  id: "00000000-0000-4000-8000-00000000de00",
  email: "visitor@example.com",
  full_name: "Demo Visitor",
  is_active: true,
  last_login_at: null,
  created_at: ago(0),
};

/** The visitor's role in each synthetic organization: read-only everywhere. */
const VISITOR_ROLE: OrganizationRole = "viewer";
const VISITOR_WORKSPACE_ROLE: WorkspaceRole = "viewer";

export interface DemoOrganization extends Organization {
  members_by_role: Record<OrganizationRole, number>;
}

export interface DemoWorkspace extends Workspace {
  members_by_role: Record<WorkspaceRole, number>;
}

const RIVERBEND = "7f3c2a10-1b2c-4d5e-8f90-a1b2c3d4e5f6";
const LUMEN = "2e9d8c7b-6a5f-4e3d-9c2b-1a0f9e8d7c6b";

export const demoOrganizations: DemoOrganization[] = [
  {
    id: RIVERBEND,
    name: "Riverbend Health Network (Demo)",
    slug: "riverbend-health-demo",
    role: VISITOR_ROLE,
    created_at: ago(64),
    updated_at: ago(3),
    members_by_role: { owner: 1, admin: 2, member: 9, viewer: 4 },
  },
  {
    id: LUMEN,
    name: "Lumen Logistics (Demo)",
    slug: "lumen-logistics-demo",
    role: VISITOR_ROLE,
    created_at: ago(31),
    updated_at: ago(6),
    members_by_role: { owner: 1, admin: 1, member: 4, viewer: 2 },
  },
];

function workspace(
  id: string,
  organizationId: string,
  name: string,
  slug: string,
  description: string | null,
  environment: Workspace["environment"],
  createdDaysAgo: number,
  members: Record<WorkspaceRole, number>,
  status: Workspace["status"] = "active",
): DemoWorkspace {
  return {
    id,
    organization_id: organizationId,
    name,
    slug,
    description,
    environment,
    status,
    created_at: ago(createdDaysAgo),
    updated_at: ago(Math.max(0, createdDaysAgo - 2)),
    members_by_role: members,
  };
}

export const demoWorkspaces: DemoWorkspace[] = [
  workspace("a1000000-0000-4000-8000-000000000001", RIVERBEND, "Patient Intake Assistant", "patient-intake",
    "Triage inbound referrals and route them to the right clinic.", "production", 58, { admin: 1, editor: 4, viewer: 3 }),
  workspace("a1000000-0000-4000-8000-000000000002", RIVERBEND, "Claims Pre-Authorization", "claims-preauth",
    "Assemble prior-authorization packets from EHR extracts.", "staging", 40, { admin: 1, editor: 3, viewer: 2 }),
  workspace("a1000000-0000-4000-8000-000000000003", RIVERBEND, "Clinical Notes Summaries", "clinical-notes",
    "Discovery workspace for discharge summary drafting.", "development", 12, { admin: 1, editor: 2, viewer: 1 }),
  workspace("a1000000-0000-4000-8000-000000000004", RIVERBEND, "Legacy Scheduling Pilot", "scheduling-pilot",
    null, "development", 61, { admin: 1, editor: 0, viewer: 1 }, "archived"),
  workspace("b2000000-0000-4000-8000-000000000001", LUMEN, "Shipment Exception Desk", "shipment-exceptions",
    "Classify carrier exceptions and draft customer updates.", "production", 27, { admin: 1, editor: 2, viewer: 2 }),
  workspace("b2000000-0000-4000-8000-000000000002", LUMEN, "Customs Document Review", "customs-review",
    "Extract and validate fields from commercial invoices.", "development", 9, { admin: 1, editor: 1, viewer: 0 }),
];

let auditSequence = 0;
function event(
  organizationId: string,
  workspaceId: string | null,
  actor: string,
  action: string,
  name: string,
  daysAgo: number,
  hoursAgo = 0,
): AuditLogEntry {
  auditSequence += 1;
  return {
    id: `c3000000-0000-4000-8000-${String(auditSequence).padStart(12, "0")}`,
    organization_id: organizationId,
    workspace_id: workspaceId,
    actor_user_id: null,
    actor_email: actor,
    action,
    resource_type: action.split(".")[0] ?? "resource",
    resource_id: workspaceId,
    details: { name },
    request_id: null,
    created_at: ago(daysAgo, hoursAgo),
  };
}

export const demoAuditLogs: AuditLogEntry[] = [
  event(RIVERBEND, "a1000000-0000-4000-8000-000000000003", "maya.chen@example.com", "workspace.created", "Clinical Notes Summaries", 0, 5),
  event(RIVERBEND, "a1000000-0000-4000-8000-000000000002", "dev.patel@example.com", "workspace.member_added", "Claims Pre-Authorization", 1, 2),
  event(RIVERBEND, "a1000000-0000-4000-8000-000000000001", "maya.chen@example.com", "workspace.environment_promoted", "Patient Intake Assistant", 2, 7),
  event(RIVERBEND, "a1000000-0000-4000-8000-000000000002", "sam.okafor@example.com", "workspace.updated", "Claims Pre-Authorization", 4, 1),
  event(RIVERBEND, null, "maya.chen@example.com", "organization.member_invited", "Riverbend Health Network (Demo)", 6, 3),
  event(RIVERBEND, "a1000000-0000-4000-8000-000000000001", "dev.patel@example.com", "workspace.updated", "Patient Intake Assistant", 11),
  event(RIVERBEND, "a1000000-0000-4000-8000-000000000004", "maya.chen@example.com", "workspace.archived", "Legacy Scheduling Pilot", 20),
  event(LUMEN, "b2000000-0000-4000-8000-000000000002", "lena.ruiz@example.com", "workspace.created", "Customs Document Review", 0, 9),
  event(LUMEN, "b2000000-0000-4000-8000-000000000001", "lena.ruiz@example.com", "workspace.environment_promoted", "Shipment Exception Desk", 3, 4),
  event(LUMEN, null, "omar.haddad@example.com", "organization.member_invited", "Lumen Logistics (Demo)", 9),
];

export const DEMO_VISITOR_WORKSPACE_ROLE = VISITOR_WORKSPACE_ROLE;
