import { http, HttpResponse } from "msw";

import type {
  AuditLogEntry,
  Organization,
  OrganizationStats,
  Page,
  ReadinessResponse,
  User,
  Workspace,
  WorkspaceDetail,
  WorkspaceStats,
} from "@/api/types";

export const API = "*/api/v1";
export const TEST_TOKEN = "test-access-token";

export function page<T>(items: T[]): Page<T> {
  return { items, total: items.length, limit: 100, offset: 0 };
}

export function errorEnvelope(status: number, code: string, message: string, details: unknown = null) {
  return HttpResponse.json(
    { error: { code, message, details, request_id: `req-${code}` } },
    { status },
  );
}

const now = new Date().toISOString();

export const fixtures = {
  user: {
    id: "0b6b7a37-5f2c-4bde-9e0f-3c1d0f8a1111",
    email: "admin@deployforge.dev",
    full_name: "Avery Admin",
    is_active: true,
    last_login_at: now,
    created_at: now,
  } satisfies User,
  organization: {
    id: "5d4c0d64-90b5-4c43-8f0e-6c6fe2a12222",
    name: "Northwind Health",
    slug: "northwind-health",
    role: "owner",
    created_at: now,
    updated_at: now,
  } satisfies Organization,
  organizationStats: {
    organization_id: "5d4c0d64-90b5-4c43-8f0e-6c6fe2a12222",
    workspaces_total: 7,
    workspaces_active: 6,
    workspaces_by_environment: { development: 3, staging: 2, production: 2 },
    members_total: 12,
    members_by_role: { owner: 1, admin: 2, member: 8, viewer: 1 },
    audit_events_last_7_days: 42,
    last_activity_at: now,
  } satisfies OrganizationStats,
  workspaces: [
    {
      id: "9a1f6c1e-7f39-4b5f-9d39-2a4d2c6a3333",
      organization_id: "5d4c0d64-90b5-4c43-8f0e-6c6fe2a12222",
      name: "Patient Intake Assistant",
      slug: "patient-intake",
      description: "Automates intake triage",
      environment: "development",
      status: "active",
      created_at: now,
      updated_at: now,
    },
    {
      id: "c3e9f0b2-1d2a-4f0e-8a77-5b9e1c0d4444",
      organization_id: "5d4c0d64-90b5-4c43-8f0e-6c6fe2a12222",
      name: "Claims Triage",
      slug: "claims-triage",
      description: null,
      environment: "production",
      status: "active",
      created_at: now,
      updated_at: now,
    },
  ] satisfies Workspace[],
  auditLogs: [
    {
      id: "e7c1a2b3-0000-4000-8000-000000005555",
      organization_id: "5d4c0d64-90b5-4c43-8f0e-6c6fe2a12222",
      workspace_id: null,
      actor_user_id: "0b6b7a37-5f2c-4bde-9e0f-3c1d0f8a1111",
      actor_email: "admin@deployforge.dev",
      action: "workspace.created",
      resource_type: "workspace",
      resource_id: "c3e9f0b2-1d2a-4f0e-8a77-5b9e1c0d4444",
      details: { name: "Claims Triage" },
      request_id: "req-1",
      created_at: now,
    },
  ] satisfies AuditLogEntry[],
  workspaceStats: {
    workspace_id: "9a1f6c1e-7f39-4b5f-9d39-2a4d2c6a3333",
    members_total: 3,
    members_by_role: { admin: 1, editor: 1, viewer: 1 },
    audit_events_total: 9,
    audit_events_last_7_days: 4,
    last_activity_at: now,
  } satisfies WorkspaceStats,
  readiness: {
    status: "ready",
    version: "0.1.0",
    environment: "test",
    checks: { database: { status: "ok", latency_ms: 1.4, detail: null } },
  } satisfies ReadinessResponse,
};

export function workspaceDetail(workspace: Workspace): WorkspaceDetail {
  return { ...workspace, access: { organization_role: "owner", workspace_role: "admin" } };
}

function authorized(request: Request): boolean {
  return request.headers.get("Authorization") === `Bearer ${TEST_TOKEN}`;
}

const unauthorized = () => errorEnvelope(401, "not_authenticated", "Authentication is required.");

export const handlers = [
  http.get(`${API}/health/live`, () =>
    HttpResponse.json({ status: "ok", service: "DeployForge AI", version: "0.1.0", environment: "test" }),
  ),
  http.get(`${API}/health/ready`, () => HttpResponse.json(fixtures.readiness)),

  http.post(`${API}/auth/dev/token`, async ({ request }) => {
    const { email } = (await request.json()) as { email: string };
    if (email !== fixtures.user.email) {
      return errorEnvelope(401, "not_authenticated", "Unknown or inactive development account.");
    }
    return HttpResponse.json({ access_token: TEST_TOKEN, token_type: "bearer", expires_in: 3600 });
  }),
  http.get(`${API}/auth/me`, ({ request }) =>
    authorized(request) ? HttpResponse.json(fixtures.user) : unauthorized(),
  ),

  http.get(`${API}/organizations`, ({ request }) =>
    authorized(request) ? HttpResponse.json(page([fixtures.organization])) : unauthorized(),
  ),
  http.post(`${API}/organizations`, async ({ request }) => {
    const body = (await request.json()) as { name: string; slug?: string };
    return HttpResponse.json(
      {
        ...fixtures.organization,
        id: "11111111-2222-4333-8444-555555555555",
        name: body.name,
        slug: body.slug ?? "new-org",
      },
      { status: 201 },
    );
  }),
  http.get(`${API}/organizations/:id/stats`, () => HttpResponse.json(fixtures.organizationStats)),
  http.get(`${API}/organizations/:id/workspaces`, () => HttpResponse.json(page(fixtures.workspaces))),
  http.get(`${API}/organizations/:id/audit-logs`, () => HttpResponse.json(page(fixtures.auditLogs))),
  http.post(`${API}/organizations/:id/workspaces`, async ({ request }) => {
    const body = (await request.json()) as Partial<Workspace>;
    const created: Workspace = {
      ...fixtures.workspaces[0]!,
      id: "66666666-7777-4888-8999-000000000000",
      name: body.name ?? "",
      slug: body.slug ?? "new-workspace",
      environment: body.environment ?? "development",
      description: body.description ?? null,
    };
    return HttpResponse.json(workspaceDetail(created), { status: 201 });
  }),

  http.get(`${API}/workspaces/:id`, ({ params }) => {
    const workspace = fixtures.workspaces.find((ws) => ws.id === params.id);
    return workspace
      ? HttpResponse.json(workspaceDetail(workspace))
      : errorEnvelope(404, "not_found", "Workspace not found.");
  }),
  http.get(`${API}/workspaces/:id/stats`, () => HttpResponse.json(fixtures.workspaceStats)),
];
