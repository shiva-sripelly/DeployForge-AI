import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { API, errorEnvelope, fixtures, page } from "@/test/handlers";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

describe("WorkspacesPage", () => {
  it("lists workspaces for the active organization", async () => {
    renderApp("/workspaces");

    const table = await screen.findByRole("table", { name: "Workspaces" });
    expect(within(table).getByRole("link", { name: "Patient Intake Assistant" })).toBeInTheDocument();
    expect(within(table).getByText("Automates intake triage")).toBeInTheDocument();
    expect(within(table).getByText("Production")).toBeInTheDocument();
  });

  it("creates a workspace and opens it", async () => {
    let submitted: unknown = null;
    server.use(
      http.post(`${API}/organizations/:id/workspaces`, async ({ request }) => {
        submitted = await request.json();
        return HttpResponse.json(
          {
            ...fixtures.workspaces[0]!,
            name: "Fraud Review",
            environment: "staging",
            access: { organization_role: "owner", workspace_role: "admin" },
          },
          { status: 201 },
        );
      }),
    );
    const { user, router } = renderApp("/workspaces");

    await user.click(await screen.findByRole("button", { name: "New workspace" }));
    const dialog = await screen.findByRole("dialog", { name: "New workspace" });
    await user.type(within(dialog).getByLabelText(/Workspace name/), "Fraud Review");
    await user.selectOptions(within(dialog).getByLabelText("Environment"), "staging");
    await user.click(within(dialog).getByRole("button", { name: "Create workspace" }));

    expect(submitted).toEqual({ name: "Fraud Review", environment: "staging" });
    await screen.findByRole("heading", { name: "Patient Intake Assistant", level: 1 });
    expect(router.state.location.pathname).toBe(`/workspaces/${fixtures.workspaces[0]!.id}`);
  });

  it("shows server-side validation errors next to the field", async () => {
    server.use(
      http.post(`${API}/organizations/:id/workspaces`, () =>
        errorEnvelope(422, "validation_error", "The request failed validation.", [
          { loc: ["body", "name"], msg: "String should have at least 2 characters", type: "string_too_short" },
        ]),
      ),
    );
    const { user } = renderApp("/workspaces");

    await user.click(await screen.findByRole("button", { name: "New workspace" }));
    const dialog = await screen.findByRole("dialog", { name: "New workspace" });
    await user.type(within(dialog).getByLabelText(/Workspace name/), "X");
    await user.click(within(dialog).getByRole("button", { name: "Create workspace" }));

    const nameInput = within(dialog).getByLabelText(/Workspace name/);
    expect(await within(dialog).findByText("String should have at least 2 characters")).toBeInTheDocument();
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
  });

  it("shows slug conflicts on the slug field", async () => {
    server.use(
      http.post(`${API}/organizations/:id/workspaces`, () =>
        errorEnvelope(409, "conflict", "A workspace with this slug already exists in the organization."),
      ),
    );
    const { user } = renderApp("/workspaces");

    await user.click(await screen.findByRole("button", { name: "New workspace" }));
    const dialog = await screen.findByRole("dialog", { name: "New workspace" });
    await user.type(within(dialog).getByLabelText(/Workspace name/), "Intake");
    await user.type(within(dialog).getByLabelText("Slug"), "patient-intake");
    await user.click(within(dialog).getByRole("button", { name: "Create workspace" }));

    expect(await within(dialog).findByText(/slug already exists/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Slug")).toHaveAttribute("aria-invalid", "true");
  });

  it("disables workspace creation for non-manager roles", async () => {
    server.use(
      http.get(`${API}/organizations`, () =>
        HttpResponse.json(page([{ ...fixtures.organization, role: "viewer" }])),
      ),
    );
    renderApp("/workspaces");

    expect(await screen.findByText(/Only organization owners and admins/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New workspace" })).toBeDisabled();
  });

  it("shows an error state when workspaces fail to load", async () => {
    server.use(http.get(`${API}/organizations/:id/workspaces`, () => HttpResponse.error()));
    renderApp("/workspaces");

    expect(await screen.findByRole("alert")).toHaveTextContent("API unreachable");
  });
});

describe("WorkspaceDetailPage", () => {
  it("shows workspace statistics", async () => {
    renderApp(`/workspaces/${fixtures.workspaces[0]!.id}`);

    expect(await screen.findByRole("heading", { name: "Patient Intake Assistant", level: 1 })).toBeInTheDocument();
    expect(await screen.findByText("9")).toBeInTheDocument();
    expect(screen.getByText("All time")).toBeInTheDocument();
  });

  it("treats inaccessible workspaces as not found", async () => {
    renderApp("/workspaces/00000000-0000-4000-8000-000000000000");

    expect(await screen.findByText("Workspace not found")).toBeInTheDocument();
  });
});
