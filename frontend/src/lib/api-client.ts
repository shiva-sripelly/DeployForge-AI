import axios from "axios";

import { accessTokenStore } from "@/lib/storage";

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || "/api/v1";

/** Fired when the API rejects the stored token, so the app can return to sign-in. */
export const UNAUTHORIZED_EVENT = "deployforge:unauthorized";

interface ApiErrorInit {
  status: number | null;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string | null;
}

/** Normalized error for every failed API call, mirroring the backend error envelope. */
export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | null;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? null;
    this.requestId = init.requestId ?? null;
  }

  get isNetworkError(): boolean {
    return this.status === null;
  }
}

interface ErrorEnvelope {
  error: { code: string; message: string; details?: unknown; request_id?: string | null };
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const response = error.response;
    if (!response) {
      return new ApiError({
        status: null,
        code: error.code === "ECONNABORTED" ? "timeout" : "network_error",
        message: "Unable to reach the DeployForge API. Check that the backend is running.",
      });
    }
    const headerRequestId = response.headers?.["x-request-id"] as string | undefined;
    if (isErrorEnvelope(response.data)) {
      const body = response.data.error;
      return new ApiError({
        status: response.status,
        code: body.code,
        message: body.message,
        details: body.details,
        requestId: body.request_id ?? headerRequestId ?? null,
      });
    }
    return new ApiError({
      status: response.status,
      code: "http_error",
      message: `The API responded with status ${response.status}.`,
      requestId: headerRequestId ?? null,
    });
  }

  return new ApiError({
    status: null,
    code: "unknown_error",
    message: error instanceof Error ? error.message : "An unexpected error occurred.",
  });
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { Accept: "application/json" },
});

// The public demo never holds a token, so token handling is compiled out of its bundle.
apiClient.interceptors.request.use((config) => {
  const token = __DEMO_MODE__ ? null : accessTokenStore.get();
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const apiError = toApiError(error);
    if (!__DEMO_MODE__ && apiError.status === 401 && accessTokenStore.get()) {
      accessTokenStore.clear();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(apiError);
  },
);

/** Map a 422 validation error onto request-body field names. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== "validation_error") return {};
  if (!Array.isArray(error.details)) return {};
  const result: Record<string, string> = {};
  for (const detail of error.details as { loc?: unknown[]; msg?: string }[]) {
    const [source, field] = detail.loc ?? [];
    if (source === "body" && typeof field === "string" && !result[field]) {
      result[field] = detail.msg ?? "Invalid value";
    }
  }
  return result;
}
