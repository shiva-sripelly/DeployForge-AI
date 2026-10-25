import { screen, within } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it } from "vitest";

import { accessTokenStore } from "@/lib/storage";
import { API, errorEnvelope } from "@/test/handlers";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const NAV_LABELS = [
  "Dashboard",
  "Customers",
  "Workspaces",
  "Solution Architect",
  "Integrations",
  "Workflows",
  "Agent Studio",
  "Deployments",
  "Monitoring",
  "Incidents",
  "Settings",
];

describe("application shell", () => {
  it("shows the sign-in page when there is no session", async () => {
    renderApp("/", { authenticated: false });

    expect(await screen.findByRole("heading", { name: "Sign in to DeployForge" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
  });

  it("signs in with a development account and lands on the dashboard", async () => {
    const { user } = renderApp("/", { authenticated: false });

    await user.type(await screen.findByLabelText(/work email/i), "admin@deployforge.dev");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Enterprise overview" })).toBeInTheDocument();
    expect(accessTokenStore.get()).toBe("test-access-token");
    expect(screen.getByText("Avery Admin")).toBeInTheDocument();
  });

  it("explains rejected sign-in attempts", async () => {
    const { user } = renderApp("/", { authenticated: false });

    await user.type(await screen.findByLabelText(/work email/i), "stranger@example.com");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unknown or inactive development account.");
  });

  it("reports when developer sign-in is disabled on the server", async () => {
    server.use(http.post(`${API}/auth/dev/token`, () => errorEnvelope(404, "not_found", "Not Found")));
    const { user } = renderApp("/", { authenticated: false });

    await user.type(await screen.findByLabelText(/work email/i), "admin@deployforge.dev");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/sign-in is disabled/i);
  });

  it("returns to sign-in when the stored token is rejected", async () => {
    accessTokenStore.set("expired");
    renderApp("/", { authenticated: false });

    expect(await screen.findByRole("heading", { name: "Sign in to DeployForge" })).toBeInTheDocument();
    expect(accessTokenStore.get()).toBeNull();
  });

  it("renders the full navigation for an authenticated user", async () => {
    renderApp("/");

    const nav = await screen.findByRole("navigation", { name: "Primary" });
    for (const label of NAV_LABELS) {
      expect(within(nav).getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(within(nav).getByRole("link", { name: /Dashboard/ })).toHaveAttribute("aria-current", "page");
  });

  it("renders roadmap placeholders without metrics", async () => {
    renderApp("/agents");

    expect(await screen.findByRole("heading", { name: "AI Agent Studio", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Planned · Phase 5/)).toBeInTheDocument();
    expect(screen.getByText(/Not available in Phase 1/)).toBeInTheDocument();
  });

  it("renders a not-found page for unknown routes", async () => {
    renderApp("/does-not-exist");

    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });

  it("navigates between pages from the sidebar", async () => {
    const { user } = renderApp("/");

    const nav = await screen.findByRole("navigation", { name: "Primary" });
    await user.click(within(nav).getByRole("link", { name: /Settings/ }));

    expect(await screen.findByRole("heading", { name: "Settings", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("admin@deployforge.dev", { selector: "dd" })).toBeInTheDocument();
  });
});
