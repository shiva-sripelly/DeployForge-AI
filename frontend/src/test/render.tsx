import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";

import { AppProviders } from "@/AppProviders";
import { accessTokenStore } from "@/lib/storage";
import { routes } from "@/routes";
import { TEST_TOKEN } from "@/test/handlers";

interface RenderAppOptions {
  authenticated?: boolean;
}

/** Render the full application (providers, router, layout) at a given path. */
export function renderApp(path = "/", { authenticated = true }: RenderAppOptions = {}) {
  if (authenticated) accessTokenStore.set(TEST_TOKEN);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  const view = render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, user, router, queryClient };
}
