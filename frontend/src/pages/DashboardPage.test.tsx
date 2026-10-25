import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { API, errorEnvelope, fixtures, page } from "@/test/handlers";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

async function findStatCard(label: string): Promise<HTMLElement> {
  const labelElement = await screen.findByText(label, { selector: "p" });
  return labelElement.closest("div.p-5") as HTMLElement;
}

describe("DashboardPage", () => {
  it("displays statistics returned by the API", async () => {
    renderApp("/");

    expect(await screen.findByText(/Live metrics for/)).toHaveTextContent("Northwind Health");
    expect(await within(await findStatCard("Workspaces")).findByText("7")).toBeInTheDocument();
    expect(within(await findStatCard("Workspaces")).getByText("6 active")).toBeInTheDocument();
    expect(within(await findStatCard("Members")).getByText("12")).toBeInTheDocument();
    expect(within(await findStatCard("Production workspaces")).getByText("2 staging · 3 development")).toBeInTheDocument();
    expect(within(await findStatCard("Audit events (7 days)")).getByText("42")).toBeInTheDocument();

    expect(await screen.findByRole("link", { name: "Patient Intake Assistant" })).toHaveAttribute(
      "href",
      `/workspaces/${fixtures.workspaces[0]!.id}`,
    );
    expect(await screen.findByText("Workspace Created")).toBeInTheDocument();
  });

  it("shows API connectivity as online", async () => {
    renderApp("/");

    const indicators = await screen.findAllByRole("status");
    expect(await screen.findByText("API online")).toBeInTheDocument();
    expect(indicators.length).toBeGreaterThan(0);
  });

  it("shows a degraded indicator when the database is unavailable", async () => {
    server.use(
      http.get(`${API}/health/ready`, () =>
        HttpResponse.json(
          {
            ...fixtures.readiness,
            status: "not_ready",
            checks: { database: { status: "unavailable", latency_ms: null, detail: "Database connection failed." } },
          },
          { status: 503 },
        ),
      ),
    );
    renderApp("/");

    expect(await screen.findByText("API degraded")).toBeInTheDocument();
    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
  });

  it("shows an offline indicator when the API is unreachable", async () => {
    server.use(http.get(`${API}/health/ready`, () => HttpResponse.error()));
    renderApp("/");

    expect(await screen.findByText("API offline")).toBeInTheDocument();
    expect(await screen.findByText("Unreachable")).toBeInTheDocument();
  });

  it("shows an empty state when the user has no organizations", async () => {
    server.use(http.get(`${API}/organizations`, () => HttpResponse.json(page([]))));
    renderApp("/");

    expect(await screen.findByText("Create your first customer organization")).toBeInTheDocument();
  });

  it("shows an error state with request ID and recovers on retry", async () => {
    let failures = 1;
    server.use(
      http.get(`${API}/organizations/:id/stats`, () =>
        failures-- > 0
          ? errorEnvelope(500, "internal_error", "An unexpected error occurred.")
          : HttpResponse.json(fixtures.organizationStats),
      ),
    );
    const { user } = renderApp("/");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unable to load organization statistics");
    expect(alert).toHaveTextContent("Request ID: req-internal_error");

    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await within(await findStatCard("Workspaces")).findByText("7")).toBeInTheDocument();
  });

  it("hides the audit log from non-managers without requesting it", async () => {
    let auditRequested = false;
    server.use(
      http.get(`${API}/organizations`, () =>
        HttpResponse.json(page([{ ...fixtures.organization, role: "member" }])),
      ),
      http.get(`${API}/organizations/:id/audit-logs`, () => {
        auditRequested = true;
        return HttpResponse.json(page(fixtures.auditLogs));
      }),
    );
    renderApp("/");

    expect(await screen.findByText("Restricted to owners and admins")).toBeInTheDocument();
    expect(auditRequested).toBe(false);
  });

  it("creates an organization from the dashboard", async () => {
    const { user } = renderApp("/");

    await user.click(await screen.findByRole("button", { name: "New organization" }));
    const dialog = await screen.findByRole("dialog", { name: "New customer organization" });
    await user.type(within(dialog).getByLabelText(/Organization name/), "Globex Industrial");
    await user.click(within(dialog).getByRole("button", { name: "Create organization" }));

    expect(screen.queryByRole("dialog", { name: "New customer organization" })).not.toBeInTheDocument();
  });
});
