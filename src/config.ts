/** Where a board lives, who you are, plus how we authenticate to it. */

import {
  clearStoredToken,
  loadStoredToken,
  saveStoredToken,
  type TokenKind,
} from "./auth/token";

export type BoardTarget = {
  owner: string;
  repo: string;
  branch: string;
  path: string;
};

export type Identity = { id: string; name: string };

export type Session = BoardTarget & {
  token: string;
  tokenKind: TokenKind;
  refreshToken?: string;
  expiresAt?: number;
  passphrase: string;
  identity: Identity;
  initialAllowedNicknames?: string[];
};

const TARGET_KEY = "caulk.target.v1";
const PASSPHRASE_KEY = "caulk.passphrase.v1";
/** JSON map of boardKey → passphrase, one per storage (session or remembered). */
const PASSPHRASES_KEY = "caulk.passphrases.v1";
const IDENTITY_KEY = "caulk.identity.v1";
const LAST_SEEN_KEY = "caulk.lastseen.v1";

const LEGACY_TARGET_KEY = "slateboard.target.v1";
const LEGACY_PASSPHRASE_KEY = "slateboard.passphrase.v1";
const LEGACY_IDENTITY_KEY = "slateboard.identity.v1";

export function boardKey(target: BoardTarget): string {
  return `${target.owner}/${target.repo}/${target.branch}/${target.path}`;
}

export function boardLabel(target: BoardTarget): string {
  const name = target.path.split("/").pop() ?? target.path;
  return name.replace(/\.(caulk|slate)$/i, "");
}

/** `boards/roadmap.caulk` → `boards/.history/roadmap` */
export function historyDirFor(boardPath: string): string {
  const idx = boardPath.lastIndexOf("/");
  const dir = idx === -1 ? "" : boardPath.slice(0, idx);
  const file = idx === -1 ? boardPath : boardPath.slice(idx + 1);
  return [dir, ".history", file.replace(/\.(caulk|slate)$/i, "")].filter(Boolean).join("/");
}

export function loadTarget(): BoardTarget | null {
  try {
    const raw = localStorage.getItem(TARGET_KEY) ?? localStorage.getItem(LEGACY_TARGET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BoardTarget>;
    if (!parsed.owner || !parsed.repo || !parsed.path) return null;
    return {
      owner: parsed.owner,
      repo: parsed.repo,
      branch: parsed.branch || "main",
      path: parsed.path,
    };
  } catch {
    return null;
  }
}

export function storedIdentityName(): string {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY) ?? localStorage.getItem(LEGACY_IDENTITY_KEY);
    if (!raw) return "";
    return (JSON.parse(raw) as Partial<Identity>).name ?? "";
  } catch {
    return "";
  }
}

/**
 * One stable device id, so a digest can tell "someone else edited this" from
 * "I edited this on my other laptop".
 */
export function ensureIdentity(name: string): Identity {
  let id: string | null = null;
  try {
    const raw = localStorage.getItem(IDENTITY_KEY) ?? localStorage.getItem(LEGACY_IDENTITY_KEY);
    if (raw) id = (JSON.parse(raw) as Partial<Identity>).id ?? null;
  } catch {
    id = null;
  }
  const identity: Identity = {
    id: id ?? crypto.randomUUID(),
    name: name.trim() || "Anonymous",
  };
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  return identity;
}

export function defaultPassphrase(target: BoardTarget): string {
  return `caulk:${target.owner.toLowerCase().trim()}/${target.repo.toLowerCase().trim()}:${target.path.toLowerCase().trim()}`;
}

type PassphraseMap = Record<string, string>;

function readPassphraseMap(storage: Storage): PassphraseMap {
  try {
    const raw = storage.getItem(PASSPHRASES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as PassphraseMap) : {};
  } catch {
    return {};
  }
}

function writePassphraseMap(storage: Storage, map: PassphraseMap): void {
  try {
    if (Object.keys(map).length === 0) storage.removeItem(PASSPHRASES_KEY);
    else storage.setItem(PASSPHRASES_KEY, JSON.stringify(map));
  } catch {
    /* quota or blocked storage: the board falls back to the default key */
  }
}

/** The password stored for this board, or null if none was set on this device. */
function findStoredPassphrase(target: BoardTarget): string | null {
  const key = boardKey(target);
  return readPassphraseMap(sessionStorage)[key] || readPassphraseMap(localStorage)[key] || null;
}

/** The passphrase that encrypts this board: the user's password if set, else the default. */
export function getBoardPassphrase(target: BoardTarget): string {
  return findStoredPassphrase(target) ?? defaultPassphrase(target);
}

/**
 * Store a board's password. It always lives for this tab (sessionStorage);
 * it also survives restarts only when `remember` is set. The default key is
 * never stored, so a board without a password leaves no trace.
 */
export function setBoardPassphrase(
  target: BoardTarget,
  passphrase: string,
  opts: { remember: boolean },
): void {
  const key = boardKey(target);
  const sessionMap = readPassphraseMap(sessionStorage);
  const localMap = readPassphraseMap(localStorage);
  if (!passphrase || passphrase === defaultPassphrase(target)) {
    delete sessionMap[key];
    delete localMap[key];
  } else {
    sessionMap[key] = passphrase;
    if (opts.remember) localMap[key] = passphrase;
    else delete localMap[key];
  }
  writePassphraseMap(sessionStorage, sessionMap);
  writePassphraseMap(localStorage, localMap);
}

export function clearBoardPassphrase(target: BoardTarget): void {
  const key = boardKey(target);
  const sessionMap = readPassphraseMap(sessionStorage);
  const localMap = readPassphraseMap(localStorage);
  delete sessionMap[key];
  delete localMap[key];
  writePassphraseMap(sessionStorage, sessionMap);
  writePassphraseMap(localStorage, localMap);
}

export function loadSession(target: BoardTarget): Session | null {
  const stored = loadStoredToken();
  if (!stored) return null;
  const passphrase =
    findStoredPassphrase(target) ??
    sessionStorage.getItem(PASSPHRASE_KEY) ??
    sessionStorage.getItem(LEGACY_PASSPHRASE_KEY) ??
    defaultPassphrase(target);
  let identity: Identity | null = null;
  try {
    const raw = localStorage.getItem(IDENTITY_KEY) ?? localStorage.getItem(LEGACY_IDENTITY_KEY);
    if (raw) identity = JSON.parse(raw) as Identity;
  } catch {
    identity = null;
  }
  return {
    ...target,
    token: stored.token,
    tokenKind: stored.kind,
    refreshToken: stored.refreshToken,
    expiresAt: stored.expiresAt,
    passphrase,
    identity: identity ?? { id: crypto.randomUUID(), name: "Anonymous" },
  };
}

export function saveTarget(target: BoardTarget): void {
  localStorage.setItem(TARGET_KEY, JSON.stringify(target));
}

export function saveSession(session: Session, opts: { rememberToken: boolean }): void {
  saveTarget({
    owner: session.owner,
    repo: session.repo,
    branch: session.branch,
    path: session.path,
  });
  saveStoredToken(
    {
      token: session.token,
      kind: session.tokenKind,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
    },
    opts.rememberToken,
  );
  // Session-scoped only: the "remember on this device" choice belongs to
  // setBoardPassphrase, so saving the session must not touch localStorage.
  const sessionMap = readPassphraseMap(sessionStorage);
  if (!session.passphrase || session.passphrase === defaultPassphrase(session)) {
    delete sessionMap[boardKey(session)];
  } else {
    sessionMap[boardKey(session)] = session.passphrase;
  }
  writePassphraseMap(sessionStorage, sessionMap);
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(session.identity));
}

export function clearSession(): void {
  localStorage.removeItem(TARGET_KEY);
  sessionStorage.removeItem(PASSPHRASE_KEY);
  sessionStorage.removeItem(PASSPHRASES_KEY);
}

export function clearAuth(): void {
  clearStoredToken();
  sessionStorage.removeItem(PASSPHRASE_KEY);
  sessionStorage.removeItem(PASSPHRASES_KEY);
  localStorage.removeItem(TARGET_KEY);
  localStorage.removeItem(IDENTITY_KEY);
}

export function slugifyBoardName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "board"}.slate`;
}

function readLastSeen(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function getLastSeen(key: string): number | null {
  const all = readLastSeen();
  return typeof all[key] === "number" ? all[key] : null;
}

export function setLastSeen(key: string, at: number): void {
  try {
    const all = readLastSeen();
    all[key] = at;
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(all));
  } catch {
    /* quota or private mode: the digest just won't persist */
  }
}
