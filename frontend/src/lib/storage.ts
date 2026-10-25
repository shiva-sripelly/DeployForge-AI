/**
 * Storage helpers that never throw: storage can be unavailable (private mode,
 * blocked cookies), in which case the app keeps working without persistence.
 */

type StorageKind = "local" | "session";

function resolve(kind: StorageKind): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStorage(kind: StorageKind, key: string): string | null {
  try {
    return resolve(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(kind: StorageKind, key: string, value: string | null): void {
  try {
    const storage = resolve(kind);
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    /* persistence is best-effort */
  }
}

const ACCESS_TOKEN_KEY = "deployforge.accessToken";

/** Tokens live in sessionStorage: they are scoped to the tab and cleared when it closes. */
export const accessTokenStore = {
  get: () => readStorage("session", ACCESS_TOKEN_KEY),
  set: (token: string) => writeStorage("session", ACCESS_TOKEN_KEY, token),
  clear: () => writeStorage("session", ACCESS_TOKEN_KEY, null),
};
