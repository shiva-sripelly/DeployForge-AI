import { describe, expect, it } from "vitest";

import {
  assertProductionApiBaseUrl,
  contentSecurityPolicy,
  resolveBuildTarget,
} from "./build-checks";

describe("resolveBuildTarget", () => {
  it("defaults to the full console with a same-origin API path", () => {
    expect(resolveBuildTarget({})).toEqual({ appMode: "full", apiBaseUrl: "/api/v1" });
  });

  it("rejects unknown modes", () => {
    expect(() => resolveBuildTarget({ VITE_APP_MODE: "public" })).toThrow(/VITE_APP_MODE/);
  });
});

describe("assertProductionApiBaseUrl", () => {
  it("accepts a relative path for the proxied full console (Docker/nginx)", () => {
    expect(() => assertProductionApiBaseUrl({ appMode: "full", apiBaseUrl: "/api/v1" })).not.toThrow();
  });

  it("accepts an https API for the public demo", () => {
    expect(() =>
      assertProductionApiBaseUrl({
        appMode: "demo",
        apiBaseUrl: "https://deployforge-api.onrender.com/api/v1",
      }),
    ).not.toThrow();
  });

  it("requires an absolute API URL for the public demo", () => {
    expect(() => assertProductionApiBaseUrl({ appMode: "demo", apiBaseUrl: "/api/v1" })).toThrow(
      /absolute https/,
    );
  });

  it.each([
    "http://localhost:8000/api/v1",
    "https://localhost:8000/api/v1",
    "https://127.0.0.1/api/v1",
    "https://0.0.0.0:8000/api/v1",
    "http://deployforge-api.onrender.com/api/v1",
    "not a url",
  ])("rejects %s", (apiBaseUrl) => {
    expect(() => assertProductionApiBaseUrl({ appMode: "demo", apiBaseUrl })).toThrow();
  });
});

describe("contentSecurityPolicy", () => {
  it("limits connections to the page origin for same-origin APIs", () => {
    expect(contentSecurityPolicy("/api/v1")).toContain("connect-src 'self';");
  });

  it("allows exactly the configured API origin", () => {
    const policy = contentSecurityPolicy("https://deployforge-api.onrender.com/api/v1");
    expect(policy).toContain("connect-src 'self' https://deployforge-api.onrender.com;");
    expect(policy).toContain("script-src 'self';");
    expect(policy).not.toContain("unsafe-eval");
  });
});
