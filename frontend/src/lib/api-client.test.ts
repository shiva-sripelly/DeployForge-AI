import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { ApiError, apiClient, fieldErrors, toApiError, UNAUTHORIZED_EVENT } from "@/lib/api-client";
import { accessTokenStore } from "@/lib/storage";
import { API, errorEnvelope } from "@/test/handlers";
import { server } from "@/test/server";

function axiosErrorWith(response?: Partial<AxiosResponse>, code?: string): AxiosError {
  return new AxiosError(
    "failed",
    code,
    undefined,
    undefined,
    response
      ? ({ headers: {}, config: { headers: new AxiosHeaders() }, statusText: "", ...response } as AxiosResponse)
      : undefined,
  );
}

describe("toApiError", () => {
  it("unwraps the backend error envelope", () => {
    const error = toApiError(
      axiosErrorWith({
        status: 409,
        data: { error: { code: "conflict", message: "Slug taken", details: { field: "slug" }, request_id: "abc" } },
      }),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "conflict", message: "Slug taken", requestId: "abc" });
    expect(error.details).toEqual({ field: "slug" });
  });

  it("reports network failures with a null status", () => {
    const error = toApiError(axiosErrorWith(undefined, "ERR_NETWORK"));

    expect(error.isNetworkError).toBe(true);
    expect(error.code).toBe("network_error");
    expect(error.message).toMatch(/unable to reach/i);
  });

  it("distinguishes timeouts", () => {
    expect(toApiError(axiosErrorWith(undefined, "ECONNABORTED")).code).toBe("timeout");
  });

  it("handles non-envelope error bodies such as proxy HTML pages", () => {
    const error = toApiError(
      axiosErrorWith({ status: 502, data: "<html>Bad gateway</html>", headers: { "x-request-id": "edge-1" } }),
    );

    expect(error).toMatchObject({ status: 502, code: "http_error", requestId: "edge-1" });
  });

  it("wraps unknown errors", () => {
    expect(toApiError(new Error("boom"))).toMatchObject({ status: null, code: "unknown_error", message: "boom" });
  });
});

describe("fieldErrors", () => {
  it("maps body validation errors to field names", () => {
    const error = new ApiError({
      status: 422,
      code: "validation_error",
      message: "invalid",
      details: [
        { loc: ["body", "name"], msg: "String should have at least 2 characters" },
        { loc: ["query", "limit"], msg: "ignored" },
      ],
    });

    expect(fieldErrors(error)).toEqual({ name: "String should have at least 2 characters" });
    expect(fieldErrors(new Error("other"))).toEqual({});
  });
});

describe("apiClient", () => {
  it("attaches the stored bearer token", async () => {
    accessTokenStore.set("secret-token");
    let seen: string | null = null;
    server.use(
      http.get(`${API}/echo`, ({ request }) => {
        seen = request.headers.get("Authorization");
        return HttpResponse.json({});
      }),
    );

    await apiClient.get("/echo");

    expect(seen).toBe("Bearer secret-token");
  });

  it("clears the token and notifies the app on 401", async () => {
    accessTokenStore.set("expired-token");
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    server.use(http.get(`${API}/echo`, () => errorEnvelope(401, "not_authenticated", "Expired")));

    await expect(apiClient.get("/echo")).rejects.toMatchObject({ status: 401, code: "not_authenticated" });

    expect(accessTokenStore.get()).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });

  it("rejects with ApiError for server errors", async () => {
    server.use(http.get(`${API}/echo`, () => errorEnvelope(500, "internal_error", "Unexpected")));

    await expect(apiClient.get("/echo")).rejects.toMatchObject({
      status: 500,
      code: "internal_error",
      requestId: "req-internal_error",
    });
  });
});
