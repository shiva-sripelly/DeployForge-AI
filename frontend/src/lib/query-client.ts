import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api-client";

/** Retry only transient failures (network errors and 5xx), never 4xx responses. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  return error instanceof ApiError && (error.isNetworkError || (error.status ?? 0) >= 500);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
      },
      mutations: { retry: false },
    },
  });
}
