/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

import {
  assertProductionApiBaseUrl,
  contentSecurityPolicy,
  resolveBuildTarget,
} from "./config/build-checks";

/** Adds a Content-Security-Policy <meta> tag scoped to the configured API origin. */
function contentSecurityPolicyMeta(policy: string): Plugin {
  return {
    name: "deployforge:csp-meta",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: policy },
        injectTo: "head-prepend",
      },
    ],
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = resolveBuildTarget(env);
  if (command === "build") assertProductionApiBaseUrl(target);

  return {
    plugins: [react(), tailwindcss(), contentSecurityPolicyMeta(contentSecurityPolicy(target.apiBaseUrl))],
    // Compile-time flag: demo-only and full-only code paths are removed from the
    // other build, so the public bundle contains no development sign-in code.
    define: { __DEMO_MODE__: JSON.stringify(target.appMode === "demo") },
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
      port: 5173,
      // In development the browser talks to Vite, which forwards /api to FastAPI.
      // Same-origin requests mean no CORS configuration is needed locally.
      proxy: {
        "/api": {
          target: env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000",
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: false,
      restoreMocks: true,
      projects: [
        {
          extends: true,
          test: {
            name: "full",
            include: ["src/**/*.test.{ts,tsx}", "config/**/*.test.ts"],
            exclude: ["src/**/*.demo.test.{ts,tsx}"],
          },
        },
        {
          extends: true,
          define: { __DEMO_MODE__: "true" },
          test: { name: "demo", include: ["src/**/*.demo.test.{ts,tsx}"] },
        },
      ],
    },
  };
});
