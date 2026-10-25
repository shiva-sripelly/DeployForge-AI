import type { RouteObject } from "react-router";

import { AppShell } from "@/components/layout/AppShell";
import { FeaturePlaceholder } from "@/features/roadmap/FeaturePlaceholder";
import { CustomersPage } from "@/pages/CustomersPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { MonitoringPage } from "@/pages/MonitoringPage";
import { NotFoundPage, RouteErrorPage } from "@/pages/NotFoundPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { WorkspaceDetailPage } from "@/pages/WorkspaceDetailPage";
import { WorkspacesPage } from "@/pages/WorkspacesPage";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "customers", element: <CustomersPage /> },
      { path: "workspaces", element: <WorkspacesPage /> },
      { path: "workspaces/:workspaceId", element: <WorkspaceDetailPage /> },
      { path: "architect", element: <FeaturePlaceholder feature="architect" /> },
      { path: "integrations", element: <FeaturePlaceholder feature="integrations" /> },
      { path: "workflows", element: <FeaturePlaceholder feature="workflows" /> },
      { path: "agents", element: <FeaturePlaceholder feature="agents" /> },
      { path: "deployments", element: <FeaturePlaceholder feature="deployments" /> },
      { path: "monitoring", element: <MonitoringPage /> },
      { path: "incidents", element: <FeaturePlaceholder feature="incidents" /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
