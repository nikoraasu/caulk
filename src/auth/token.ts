/**
 * GitHub credentials as the browser keeps them.
 *
 * Two kinds exist:
 * - "pat": a personal access token typed in by hand. Stored as a plain string,
 *   exactly as older versions did, so it never expires here.
 * - "app": a GitHub App user token from "Login with GitHub". Stored as JSON and
 *   refreshed through api/auth.php?action=refresh when it nears expiry.
 */

export type TokenKind = "pat" | "app";

export type StoredToken = {
  token: string;
  refreshToken?: string;
  /** Absolute epoch ms when `token` expires. Absent when the app has expiration off. */
  expiresAt?: number;
  kind: TokenKind;
};

export type TokenOptions = {
  /** Refresh even if the token is not near expiry (a request was rejected with 401). */
  force?: boolean;
  /** The token the rejected request used. If the store already holds a newer one, use that. */
  stale?: string;
};

/** Hands out a current token. A plain `() => Promise<string>` also fits. */
export type TokenProvider = (opts?: TokenOptions) => Promise<string>;
export type TokenSource = string | TokenProvider;

export const TOKEN_KEY = "caulk.token.v1";
export const SESSION_TOKEN_KEY = "caulk.token.session.v1";
const LEGACY_TOKEN_KEY = "slateboard.token.v1";

const REFRESH_WINDOW_MS = 5 * 60 * 1000;

function parseStored(raw: string): StoredToken | null {
  if (!raw) return null;
  // Legacy and manual entries: a bare token string is a personal access token.
  if (!raw.startsWith("{")) return { token: raw, kind: "pat" };
  try {
    const parsed = JSON.parse(raw) as Partial<StoredToken>;
    if (typeof parsed.token !== "string" || !parsed.token) return null;
    return {
      token: parsed.token,
      kind: parsed.kind === "app" ? "app" : "pat",
      refreshToken: parsed.refreshToken || undefined,
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : undefined,
    };
  } catch {
    return null;
  }
}

function serialize(stored: StoredToken): string {
  return stored.kind === "pat" ? stored.token : JSON.stringify(stored);
}

type Located = { stored: StoredToken; inSession: boolean };

function locate(): Located | null {
  const candidates: Array<[string | null, boolean]> = [
    [localStorage.getItem(TOKEN_KEY), false],
    [sessionStorage.getItem(SESSION_TOKEN_KEY), true],
    [localStorage.getItem(LEGACY_TOKEN_KEY), false],
  ];
  for (const [raw, inSession] of candidates) {
    if (!raw) continue;
    const stored = parseStored(raw);
    if (stored) return { stored, inSession };
  }
  return null;
}

export function loadStoredToken(): StoredToken | null {
  return locate()?.stored ?? null;
}

/** "Remember me" keeps the token in localStorage; otherwise it lives for this tab only. */
export function saveStoredToken(stored: StoredToken, rememberToken: boolean): void {
  if (rememberToken) {
    localStorage.setItem(TOKEN_KEY, serialize(stored));
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.setItem(SESSION_TOKEN_KEY, serialize(stored));
  }
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

let refreshing: Promise<StoredToken> | null = null;

async function refresh(stored: StoredToken, rememberToken: boolean): Promise<StoredToken> {
  const res = await fetch("./api/auth.php?action=refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: stored.refreshToken }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
  };
  if (!res.ok || !data.access_token) {
    throw new Error("Your GitHub login has expired. Log in with GitHub again.");
  }
  const next: StoredToken = {
    token: data.access_token,
    refreshToken: data.refresh_token || stored.refreshToken,
    expiresAt: typeof data.expires_at === "number" ? data.expires_at : undefined,
    kind: "app",
  };
  try {
    saveStoredToken(next, rememberToken);
  } catch {
    /* storage full or blocked: this page still gets the new token */
  }
  return next;
}

/** The stored credential, refreshed first if it is an app token close to expiry. */
export async function getFreshCredential(opts: TokenOptions = {}): Promise<StoredToken> {
  const located = locate();
  if (!located) throw new Error("Not signed in to GitHub. Log in again.");
  const { stored, inSession } = located;

  // A request rejected with an older token: if the store has moved on, use that.
  if (opts.force && opts.stale && stored.token !== opts.stale) return stored;
  if (stored.kind !== "app" || !stored.refreshToken) return stored;

  const expiringSoon = stored.expiresAt !== undefined && stored.expiresAt - Date.now() < REFRESH_WINDOW_MS;
  if (!expiringSoon && !opts.force) return stored;

  // Single-flight: concurrent callers share one refresh.
  if (!refreshing) {
    refreshing = refresh(stored, !inSession).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export async function getFreshToken(opts: TokenOptions = {}): Promise<string> {
  return (await getFreshCredential(opts)).token;
}

/**
 * Runs `call` with the current token. A 401 from a refreshable source triggers
 * one forced refresh and one retry. A plain string token is used as-is.
 */
export async function withAuth(
  source: TokenSource,
  call: (token: string) => Promise<Response>,
): Promise<Response> {
  if (typeof source === "string") return call(source);
  const first = await source();
  const res = await call(first);
  if (res.status !== 401) return res;
  return call(await source({ force: true, stale: first }));
}
