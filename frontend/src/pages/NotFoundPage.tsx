import { Compass } from "lucide-react";
import { Link, isRouteErrorResponse, useRouteError } from "react-router";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you are looking for does not exist."
        action={
          <Link to="/" className="text-sm font-medium text-primary hover:underline">
            Back to dashboard
          </Link>
        }
      />
    </Card>
  );
}

/** Rendered by the router when a route throws while rendering. */
export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "An unexpected error occurred while rendering this page.";

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div role="alert" className="max-w-md text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <a href="/" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          Reload the application
        </a>
      </div>
    </main>
  );
}
