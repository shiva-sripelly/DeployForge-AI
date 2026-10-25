/**
 * Runs in the "demo" Vitest project, where __DEMO_MODE__ is compiled as true,
 * mirroring the public Vercel build.
 */
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { demoApi } from "@/demo/demo-api";
import { accessTokenStore } from "@/lib/storage";
import { API } from "@/test/handlers";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const requestedUrls: string[] = [];
server.events.on("request:start", ({ request }) => requestedUrls.push(request.url));

afterEach(() => {
  requestedUrls.length = 0;
});

describe("public demo build", () => {
  it("renders the console with synthetic data and no sign-in", async () => {
    renderApp("/", { authenticated: false });

    expect(await screen.findByRole("note", { name: "Public demo notice" })).toHaveTextContent(
      /read-only, with synthetic data/i,
    );
    expect(screen.queryByRole("heading", { name: "Sign in to DeployForge" })).not.toBeInTheDocument();
    expect(await screen.findByText(/Live metrics for/)).toHaveTextContent(
      "Riverbend Health Network (Demo)",
    );
    expect(await screen.findByText("3 active")).toBeInTheDocument();
    expect(screen.getByText("Demo Visitor")).toBeInTheDocument();
  });

  it("never calls protected endpoints and never stores a token", async () => {
    const { user } = renderApp("/", { authenticated: false });
    const nav = await screen.findByRole("navigation", { name: "Primary" });
    await screen.findByText(/Live metrics for/);

    for (const label of [/Customers/, /Workspaces/, /Settings/, /Monitoring/]) {
      await user.click(within(nav).getByRole("link", { name: label }));
      await screen.findByRole("heading", { level: 1 });
    }

    expect(requestedUrls.length).toBeGreaterThan(0);
    for (const url of requestedUrls) {
      expect(new URL(url).pathname).toMatch(/^\/api\/v1\/health\/(live|ready)$/);
    }
    expect(accessTokenStore.get()).toBeNull();
  });

  it("shows live platform status from the real API", async () => {
    renderApp("/", { authenticated: false });

    expect(await screen.findByText("API online")).toBeInTheDocument();
  });

  it("reports a misconfigured API URL instead of crashing", async () => {
    // Static hosting answers unknown paths with the SPA's index.html.
    server.use(http.get(`${API}/health/ready`, () => HttpResponse.text("<!doctype html><html></html>")));
    renderApp("/monitoring", { authenticated: false });

    expect(await screen.findByRole("heading", { name: "Monitoring", level: 1 })).toBeInTheDocument();
    expect(await screen.findByText("API offline", {}, { timeout: 15_000 })).toBeInTheDocument();
  }, 20_000);

  it("disables every write action", async () => {
    const { user } = renderApp("/", { authenticated: false });

    expect(await screen.findByRole("button", { name: "New organization" })).toBeDisabled();

    const nav = screen.getByRole("navigation", { name: "Primary" });
    await user.click(within(nav).getByRole("link", { name: /Customers/ }));
    expect(await screen.findByRole("button", { name: "New organization" })).toBeDisabled();

    await user.click(within(nav).getByRole("link", { name: /Workspaces/ }));
    expect(await screen.findByRole("button", { name: "New workspace" })).toBeDisabled();

    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
  });

  it("shows synthetic workspace details", async () => {
    const { user } = renderApp("/workspaces", { authenticated: false });

    await user.click(await screen.findByRole("link", { name: "Patient Intake Assistant" }));

    expect(
      await screen.findByRole("heading", { name: "Patient Intake Assistant", level: 1 }),
    ).toBeInTheDocument();
    // Computed from the synthetic membership data: 1 admin + 4 editors + 3 viewers.
    expect(await screen.findByText("8")).toBeInTheDocument();
    expect(screen.getByText("All time")).toBeInTheDocument();
  });

  it("rejects writes in the demo data layer as well", async () => {
    await expect(demoApi.createOrganization({ name: "Public Org" })).rejects.toMatchObject({
      status: 403,
      code: "demo_read_only",
    });
    await expect(
      demoApi.createWorkspace("any", { name: "Public Workspace", environment: "development" }),
    ).rejects.toMatchObject({ status: 403, code: "demo_read_only" });
  });
});
