/**
 * Build-time configuration checks, used by vite.config.ts.
 *
 * Production bundles are static: whatever API address they are built with is
 * what every visitor's browser will call. These checks stop a build from
 * shipping a localhost address, plain HTTP, or (for the public demo, which is
 * served by static hosting with no /api proxy) a relative path.
 */

export type AppMode = "full" | "demo";

export interface BuildTarget {
  appMode: AppMode;
  apiBaseUrl: string;
}

const DEFAULT_API_BASE_URL = "/api/v1";
const LOCAL_HOSTNAME = /^(localhost|127(\.\d{1,3}){3}|0\.0\.0\.0|\[::1?\])$/i;

export function resolveBuildTarget(env: Record<string, string | undefined>): BuildTarget {
  const mode = env.VITE_APP_MODE || "full";
  if (mode !== "full" && mode !== "demo") {
    throw new Error(`VITE_APP_MODE must be "full" or "demo", got "${mode}".`);
  }
  return { appMode: mode, apiBaseUrl: env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL };
}

export function assertProductionApiBaseUrl({ appMode, apiBaseUrl }: BuildTarget): void {
  if (apiBaseUrl.startsWith("/")) {
    if (appMode === "demo") {
      throw new Error(
        "VITE_API_BASE_URL must be an absolute https:// URL for the public demo build " +
          "(e.g. https://<render-service>.onrender.com/api/v1). Static hosting has no /api proxy.",
      );
    }
    return; // Same-origin path, served behind a reverse proxy (nginx in Docker).
  }

  let url: URL;
  try {
    url = new URL(apiBaseUrl);
  } catch {
    throw new Error(`VITE_API_BASE_URL is not a valid URL: "${apiBaseUrl}".`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`VITE_API_BASE_URL must use https:// in production builds, got "${apiBaseUrl}".`);
  }
  if (LOCAL_HOSTNAME.test(url.hostname)) {
    throw new Error(`VITE_API_BASE_URL must not point at a local address in production builds.`);
  }
}

export function contentSecurityPolicy(apiBaseUrl: string): string {
  const connectSources = ["'self'"];
  if (!apiBaseUrl.startsWith("/")) connectSources.push(new URL(apiBaseUrl).origin);
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
