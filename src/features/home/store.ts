/**
 * Boards home storage & management helpers:
 *   - Recent boards & cached thumbnails in localStorage
 *   - Encrypted board thumbnail storage alongside the board (`boards/.thumbs/<slug>.svg.enc`)
 *   - Board discovery with latest commit metadata (timestamp + author) & lock detection
 *   - Atomic Rename, Duplicate, and Delete across GitHub repository files
 */

import {
  boardKey,
  boardLabel,
  defaultPassphrase,
  getBoardPassphrase,
  setBoardPassphrase,
  slugifyBoardName,
  type BoardTarget,
} from "../../config";
import { EncryptedStore } from "../../storage/encrypted";
import {
  GitHubAdapter,
  GitHubError,
  type GitHubConfig,
  type GitHubRepoItem,
  type GitHubUser,
} from "../../storage/github";
import { withAuth } from "../../auth/token";

const RECENT_KEY = "caulk.recent_boards.v1";
const THUMB_CACHE_KEY = "caulk.board_thumbs.v1";
const META_CACHE_KEY = "caulk.board_meta.v1";
const REPOS_CACHE_KEY = "caulk.repos_cache.v1";
const BOARDS_CACHE_KEY = "caulk.boards_cache.v1";
const LAST_REPO_KEY = "caulk.last_repo.v1";
const USER_CACHE_KEY = "caulk.user_cache.v1";

export type RecentBoardEntry = {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  name: string;
  lastOpenedAt: number;
};

export type DashboardBoard = {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  slug: string;
  name: string;
  sha: string;
  size: number;
  lastEditedAt: string | null;
  lastAuthor: string | null;
  locked: boolean;
  thumbnailSvg: string | null;
};

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeGetPassphrase(target: BoardTarget): string {
  if (!hasStorage() || typeof window.sessionStorage === "undefined") {
    return defaultPassphrase(target);
  }
  return getBoardPassphrase(target);
}

function safeSetPassphrase(
  target: BoardTarget,
  passphrase: string,
  opts: { remember: boolean },
): void {
  if (!hasStorage() || typeof window.sessionStorage === "undefined") return;
  setBoardPassphrase(target, passphrase, opts);
}

export function thumbPathFor(boardPath: string): string {
  const filename = boardPath.split("/").pop() || boardPath;
  const slug = filename.replace(/\.(caulk|slate)$/i, "");
  return `boards/.thumbs/${slug}.svg.enc`;
}

// ───────────────────── Recent boards (localStorage) ─────────────────────

export function listRecentBoards(): RecentBoardEntry[] {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as RecentBoardEntry[])
      .filter((item) => item && item.owner && item.repo && item.path)
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  } catch {
    return [];
  }
}

export function recordRecentBoard(target: BoardTarget, at = Date.now()): void {
  if (!hasStorage()) return;
  const key = boardKey(target);
  const existing = listRecentBoards().filter(
    (entry) => boardKey(entry) !== key,
  );
  const next: RecentBoardEntry[] = [
    {
      owner: target.owner,
      repo: target.repo,
      branch: target.branch,
      path: target.path,
      name: boardLabel(target),
      lastOpenedAt: at,
    },
    ...existing,
  ].slice(0, 20);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
}

export function removeRecentBoard(target: BoardTarget): void {
  if (!hasStorage()) return;
  const key = boardKey(target);
  const next = listRecentBoards().filter((entry) => boardKey(entry) !== key);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
}

// ───────────────────── Offline/Rate-Limit Fallback Caches ─────────────────────

export function loadCachedUser(): GitHubUser | null {
  if (!hasStorage()) return null;
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GitHubUser;
    return parsed?.login ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCachedUser(user: GitHubUser | null): void {
  if (!hasStorage()) return;
  try {
    if (user) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadCachedRepos(): GitHubRepoItem[] {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(REPOS_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? (parsed as GitHubRepoItem[]).filter((r) => r?.fullName) : [];
  } catch {
    return [];
  }
}

export function saveCachedRepos(repos: GitHubRepoItem[]): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(REPOS_CACHE_KEY, JSON.stringify(repos.slice(0, 100)));
  } catch {
    /* ignore */
  }
}

export function loadLastRepo(): string {
  if (!hasStorage()) return "";
  try {
    return localStorage.getItem(LAST_REPO_KEY) || "";
  } catch {
    return "";
  }
}

export function saveLastRepo(fullName: string): void {
  if (!hasStorage() || !fullName || fullName === "__all__") return;
  try {
    localStorage.setItem(LAST_REPO_KEY, fullName);
  } catch {
    /* ignore */
  }
}

function readCachedBoardsMap(): Record<string, DashboardBoard[]> {
  if (!hasStorage()) return {};
  try {
    const raw = localStorage.getItem(BOARDS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, DashboardBoard[]>) : {};
  } catch {
    return {};
  }
}

export function loadCachedBoards(owner: string, repo: string): DashboardBoard[] {
  const list = readCachedBoardsMap()[`${owner}/${repo}`] ?? [];
  return list.map((b) => ({
    ...b,
    thumbnailSvg: b.thumbnailSvg ?? getCachedThumbnail(b),
  }));
}

export function saveCachedBoards(owner: string, repo: string, boards: DashboardBoard[]): void {
  if (!hasStorage()) return;
  try {
    const map = readCachedBoardsMap();
    // Omit large inline SVG data since THUMB_CACHE_KEY stores thumbnails separately.
    map[`${owner}/${repo}`] = boards.map((b) => ({ ...b, thumbnailSvg: null }));
    localStorage.setItem(BOARDS_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function clearHomeAuthCaches(): void {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(USER_CACHE_KEY);
    localStorage.removeItem(REPOS_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

// ───────────────────── Thumbnail Cache & Encrypted Repo Storage ─────────────────────

function readThumbCache(): Record<string, { sha?: string; svg: string }> {
  if (!hasStorage()) return {};
  try {
    const raw = localStorage.getItem(THUMB_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, { sha?: string; svg: string }>) : {};
  } catch {
    return {};
  }
}

export function getCachedThumbnail(target: BoardTarget): string | null {
  const entry = readThumbCache()[boardKey(target)];
  return entry?.svg ?? null;
}

export function cacheThumbnail(target: BoardTarget, svg: string, sha?: string): void {
  if (!hasStorage()) return;
  try {
    const cache = readThumbCache();
    cache[boardKey(target)] = { sha, svg };
    // Cap to 40 cached thumbnails to respect localStorage quota.
    const keys = Object.keys(cache);
    if (keys.length > 40) {
      for (const k of keys.slice(0, keys.length - 40)) delete cache[k];
    }
    localStorage.setItem(THUMB_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore quota errors
  }
}

/** Encrypts and commits a compact SVG preview alongside the board in the repo. */
export async function saveBoardThumbnail(
  cfg: Pick<GitHubConfig, "token" | "owner" | "repo" | "branch" | "apiBase"> & {
    boardPath: string;
    passphrase: string;
  },
  svg: string,
): Promise<void> {
  const tPath = thumbPathFor(cfg.boardPath);
  const target: BoardTarget = {
    owner: cfg.owner,
    repo: cfg.repo,
    branch: cfg.branch,
    path: cfg.boardPath,
  };
  cacheThumbnail(target, svg);

  const adapter = new GitHubAdapter({
    token: cfg.token,
    owner: cfg.owner,
    repo: cfg.repo,
    branch: cfg.branch,
    path: tPath,
    apiBase: cfg.apiBase,
  });
  const store = new EncryptedStore(adapter, cfg.passphrase);
  await store.open().catch(() => null);
  await store.save(new TextEncoder().encode(svg));
}

// ───────────────────── Commit metadata + Lock detection ─────────────────────

type CachedBoardMeta = {
  sha: string;
  thumbSha?: string;
  lastEditedAt: string | null;
  lastAuthor: string | null;
  locked: boolean;
};

function readMetaCache(): Record<string, CachedBoardMeta> {
  if (!hasStorage()) return {};
  try {
    const raw = localStorage.getItem(META_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, CachedBoardMeta>) : {};
  } catch {
    return {};
  }
}

function writeMetaCache(cache: Record<string, CachedBoardMeta>): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(META_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

async function fetchLatestCommitInfo(
  cfg: Pick<GitHubConfig, "token" | "owner" | "repo" | "branch" | "apiBase">,
  filePath: string,
): Promise<{ at: string | null; author: string | null }> {
  const apiBase = (cfg.apiBase ?? "https://api.github.com").replace(/\/$/, "");
  const url = `${apiBase}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/commits?sha=${encodeURIComponent(cfg.branch)}&path=${encodeURIComponent(filePath)}&per_page=1`;
  const res = await withAuth(cfg.token, (tok) =>
    fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${tok}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    }),
  );
  if (res.status === 403 || res.status === 429) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new GitHubError(res.status, body?.message || `GitHub rate limit (${res.status})`);
  }
  if (!res.ok) return { at: null, author: null };
  const commits = (await res.json()) as Array<{
    author?: { login?: string } | null;
    commit?: { author?: { name?: string; date?: string } };
  }>;
  if (!Array.isArray(commits) || commits.length === 0) {
    return { at: null, author: null };
  }
  const c = commits[0];
  return {
    at: c.commit?.author?.date ?? null,
    author: c.author?.login ?? c.commit?.author?.name ?? null,
  };
}

function isWrongPassphrase(err: unknown): boolean {
  return err instanceof Error && /Wrong passphrase/i.test(err.message);
}

/** Checks lock status & loads cached/encrypted thumbnail without unnecessary board downloads. */
async function probeLockAndThumb(
  cfg: Pick<GitHubConfig, "token" | "owner" | "repo" | "branch" | "apiBase">,
  boardPath: string,
  fileSize: number,
  thumbShaMap: Map<string, string>,
): Promise<{ locked: boolean; thumbnailSvg: string | null; thumbSha?: string }> {
  const target: BoardTarget = {
    owner: cfg.owner,
    repo: cfg.repo,
    branch: cfg.branch,
    path: boardPath,
  };
  const defPass = defaultPassphrase(target);
  const knownPass = safeGetPassphrase(target);
  const customPassStored = knownPass !== defPass;

  let thumbnailSvg = getCachedThumbnail(target);
  const tPath = thumbPathFor(boardPath);
  const tSha = thumbShaMap.get(tPath.split("/").pop() || "");
  let locked = customPassStored;

  // Fast path: if an encrypted thumbnail exists, decrypting it both gives the preview AND proves lock state.
  if (tSha) {
    const thumbAdapter = new GitHubAdapter({ ...cfg, path: tPath });
    try {
      const plain = await new EncryptedStore(thumbAdapter, knownPass).open();
      if (plain) {
        thumbnailSvg = new TextDecoder().decode(plain);
        cacheThumbnail(target, thumbnailSvg, tSha);
      }
      return { locked: customPassStored, thumbnailSvg, thumbSha: tSha };
    } catch (err) {
      if (err instanceof GitHubError) throw err;
      if (isWrongPassphrase(err)) {
        return { locked: true, thumbnailSvg: null, thumbSha: tSha };
      }
    }
  }

  // Fallback: only probe small board files once per SHA when no thumbnail exists.
  if (!customPassStored && fileSize <= 512_000) {
    const boardAdapter = new GitHubAdapter({ ...cfg, path: boardPath });
    try {
      await new EncryptedStore(boardAdapter, defPass).open();
      locked = false;
    } catch (err) {
      if (err instanceof GitHubError) throw err;
      if (isWrongPassphrase(err)) locked = true;
    }
  }

  if (locked && !customPassStored) thumbnailSvg = null;
  return { locked, thumbnailSvg, thumbSha: tSha };
}

export async function listDashboardBoards(
  cfg: Pick<GitHubConfig, "token" | "owner" | "repo" | "branch" | "apiBase">,
): Promise<DashboardBoard[]> {
  const rootAdapter = new GitHubAdapter({ ...cfg, path: "" });
  const boardFiles = await rootAdapter.listDir("boards");
  const valid = boardFiles.filter((f) => /\.(caulk|slate)$/i.test(f.name));
  if (valid.length === 0) return [];

  const thumbFiles = await rootAdapter.listDir("boards/.thumbs").catch(() => []);
  const thumbShaMap = new Map<string, string>();
  for (const tf of thumbFiles) thumbShaMap.set(tf.name, tf.sha);

  const metaCache = readMetaCache();
  let cacheDirty = false;

  const boards = await mapWithConcurrency(
    valid,
    2,
    async (file): Promise<DashboardBoard> => {
      const path = `boards/${file.name}`;
      const slug = file.name.replace(/\.(caulk|slate)$/i, "");
      const target: BoardTarget = {
        owner: cfg.owner,
        repo: cfg.repo,
        branch: cfg.branch,
        path,
      };
      const key = boardKey(target);
      const cached = metaCache[key];
      const tName = thumbPathFor(path).split("/").pop() || "";
      const currentThumbSha = thumbShaMap.get(tName);

      if (cached && cached.sha === file.sha && cached.thumbSha === currentThumbSha) {
        const cachedThumb = getCachedThumbnail(target);
        let thumbnailSvg = cachedThumb;
        if (!thumbnailSvg && currentThumbSha) {
          const tRes = await probeLockAndThumb(cfg, path, file.size, thumbShaMap);
          thumbnailSvg = tRes.thumbnailSvg;
        }
        return {
          owner: cfg.owner,
          repo: cfg.repo,
          branch: cfg.branch,
          path,
          slug,
          name: slug,
          sha: file.sha,
          size: file.size,
          lastEditedAt: cached.lastEditedAt,
          lastAuthor: cached.lastAuthor,
          locked: cached.locked,
          thumbnailSvg,
        };
      }

      const [commit, probe] = await Promise.all([
        cached && cached.sha === file.sha
          ? Promise.resolve({ at: cached.lastEditedAt, author: cached.lastAuthor })
          : fetchLatestCommitInfo(cfg, path),
        probeLockAndThumb(cfg, path, file.size, thumbShaMap),
      ]);

      metaCache[key] = {
        sha: file.sha,
        thumbSha: probe.thumbSha,
        lastEditedAt: commit.at,
        lastAuthor: commit.author,
        locked: probe.locked,
      };
      cacheDirty = true;

      return {
        owner: cfg.owner,
        repo: cfg.repo,
        branch: cfg.branch,
        path,
        slug,
        name: slug,
        sha: file.sha,
        size: file.size,
        lastEditedAt: commit.at,
        lastAuthor: commit.author,
        locked: probe.locked,
        thumbnailSvg: probe.thumbnailSvg,
      };
    },
  );

  if (cacheDirty) writeMetaCache(metaCache);

  boards.sort((a, b) => {
    const ta = a.lastEditedAt ? Date.parse(a.lastEditedAt) : 0;
    const tb = b.lastEditedAt ? Date.parse(b.lastEditedAt) : 0;
    if (ta !== tb) return tb - ta;
    return a.name.localeCompare(b.name);
  });

  return boards;
}

// ───────────────────── Board Actions: Rename, Duplicate, Delete ─────────────────────

function reEncryptBoardBytes(
  rawBytes: Uint8Array,
  fromPassphrase: string,
  toPassphrase: string,
): Promise<Uint8Array> {
  return (async () => {
    const { parseEnvelope, deriveKey, decryptEnvelope, encryptEnvelope, PBKDF2_ITERATIONS } =
      await import("../../crypto/envelope");
    const { base64ToBytes, randomBytes } = await import("../../lib/bytes");
    const env = parseEnvelope(rawBytes);
    const oldKey = await deriveKey(
      fromPassphrase,
      base64ToBytes(env.kdf.salt),
      env.kdf.iterations,
    );
    const plain = await decryptEnvelope(env, oldKey);
    const newSalt = randomBytes(16);
    const newKey = await deriveKey(toPassphrase, newSalt, PBKDF2_ITERATIONS);
    const newEnv = await encryptEnvelope(plain, newKey, newSalt);
    return new TextEncoder().encode(JSON.stringify(newEnv, null, 2));
  })();
}

export async function duplicateOrRenameBoard(
  cfg: Pick<GitHubConfig, "token" | "owner" | "repo" | "branch" | "apiBase">,
  opts: {
    sourcePath: string;
    newName: string;
    mode: "rename" | "duplicate";
    passphraseOverride?: string;
  },
): Promise<BoardTarget> {
  const newPath = `boards/${slugifyBoardName(opts.newName)}`;
  if (newPath === opts.sourcePath) {
    throw new Error("Target board name matches the existing board.");
  }

  const srcTarget: BoardTarget = {
    owner: cfg.owner,
    repo: cfg.repo,
    branch: cfg.branch,
    path: opts.sourcePath,
  };
  const dstTarget: BoardTarget = {
    owner: cfg.owner,
    repo: cfg.repo,
    branch: cfg.branch,
    path: newPath,
  };

  const srcAdapter = new GitHubAdapter({ ...cfg, path: opts.sourcePath });
  const readRes = await srcAdapter.read();
  if (readRes.status !== "ok") {
    throw new Error(`Could not read ${opts.sourcePath}`);
  }

  const dstCheck = await new GitHubAdapter({ ...cfg, path: newPath }).read();
  if (dstCheck.status === "ok") {
    throw new Error(`A board already exists at ${newPath}`);
  }

  const srcPass = opts.passphraseOverride || safeGetPassphrase(srcTarget);
  const srcDefault = defaultPassphrase(srcTarget);
  const hadCustomPassword = srcPass !== srcDefault;
  const dstPass = hadCustomPassword ? srcPass : defaultPassphrase(dstTarget);

  const newBytes = await reEncryptBoardBytes(readRes.bytes, srcPass, dstPass);

  const commits: Array<{ path: string; bytes: Uint8Array }> = [
    { path: newPath, bytes: newBytes },
  ];

  // Also migrate encrypted thumbnail if readable.
  const srcThumbPath = thumbPathFor(opts.sourcePath);
  const dstThumbPath = thumbPathFor(newPath);
  const thumbRead = await new GitHubAdapter({ ...cfg, path: srcThumbPath })
    .read()
    .catch(() => ({ status: "missing" as const }));
  if (thumbRead.status === "ok") {
    try {
      const nextThumb = await reEncryptBoardBytes(thumbRead.bytes, srcPass, dstPass);
      commits.push({ path: dstThumbPath, bytes: nextThumb });
    } catch {
      // Thumbnail passphrase mismatch — skip copying thumb cleanly.
    }
  }

  const committer = new GitHubAdapter({ ...cfg, path: newPath });
  await committer.commitFiles(
    commits,
    `caulk: ${opts.mode} ${opts.sourcePath} -> ${newPath}`,
  );

  if (hadCustomPassword) {
    safeSetPassphrase(dstTarget, dstPass, { remember: true });
  }

  if (opts.mode === "rename") {
    if (readRes.sha) {
      await srcAdapter.remove(opts.sourcePath, readRes.sha, `caulk: remove ${opts.sourcePath}`);
    }
    if (thumbRead.status === "ok" && thumbRead.sha) {
      await srcAdapter
        .remove(srcThumbPath, thumbRead.sha, `caulk: remove old thumbnail ${srcThumbPath}`)
        .catch(() => {});
    }
    removeRecentBoard(srcTarget);
  }

  recordRecentBoard(dstTarget);
  return dstTarget;
}

export async function deleteRepoBoard(
  cfg: Pick<GitHubConfig, "token" | "owner" | "repo" | "branch" | "apiBase">,
  boardPath: string,
): Promise<void> {
  const target: BoardTarget = {
    owner: cfg.owner,
    repo: cfg.repo,
    branch: cfg.branch,
    path: boardPath,
  };
  const adapter = new GitHubAdapter({ ...cfg, path: boardPath });
  const res = await adapter.read();
  if (res.status === "ok" && res.sha) {
    await adapter.remove(boardPath, res.sha, `caulk: delete board ${boardPath}`);
  }
  const tPath = thumbPathFor(boardPath);
  const tAdapter = new GitHubAdapter({ ...cfg, path: tPath });
  const tRes = await tAdapter.read().catch(() => ({ status: "missing" as const }));
  if (tRes.status === "ok" && tRes.sha) {
    await tAdapter.remove(tPath, tRes.sha, `caulk: delete thumbnail ${tPath}`).catch(() => {});
  }
  removeRecentBoard(target);
}

export function formatRelativeDate(iso: string | null): string {
  if (!iso) return "Unknown time";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 14) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}
