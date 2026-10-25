/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API base URL as seen by the browser; defaults to the same-origin "/api/v1". */
  readonly VITE_API_BASE_URL?: string;
  /** "full" (default): console with sign-in. "demo": public read-only demo. */
  readonly VITE_APP_MODE?: "full" | "demo";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** True in the public read-only demo build. Replaced at compile time by Vite. */
declare const __DEMO_MODE__: boolean;
