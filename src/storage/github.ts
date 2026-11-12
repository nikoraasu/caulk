/**
 * GitHub Contents API backed storage.
 *
 * Reads use conditional requests (`If-None-Match`): a 304 does not count
 * against the 5,000 req/hour authenticated limit, so idle polling is free.
 * Writes are single commits and can lose a race, which surfaces as a
 * ConflictError the sync engine resolves by merging and retrying.
 */

import { withAuth, type TokenSource } from "../auth/token";
import { base64ToBytes, bytesToBase64 } from "../lib/bytes";
import type { RateLimit, ReadResult, StorageAdapter, WriteResult } from "./types";

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";

/**
 * Remember if GitHub (or a proxy/CORS policy) rejects `application/vnd.github.raw`
 * on `/git/blobs`, so we skip that extra failing round-trip on subsequent blobs.
 */
let skipRawBlob = false;

export class GitHubError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

/** Someone else (or another tab) wrote the file between our read and our write. */
export class ConflictError extends GitHubError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = "ConflictError";
  }
}

export type GitHubConfig = {
  /** A fixed token, or a provider that refreshes it and retries once on 401. */
  token: TokenSource;
  owner: string;
  repo: string;
  branch: string;
  path: string;
  /** Override for GitHub Enterprise or tests. Defaults to api.github.com. */
  apiBase?: string;
};

function encodePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

export class GitHubAdapter implements StorageAdapter {
  readonly label: string;
  private readonly apiBase: string;
  private limit: RateLimit = null;

  constructor(private readonly cfg: GitHubConfig) {
    this.label = `${cfg.owner}/${cfg.repo}:${cfg.path}`;
    this.apiBase = (cfg.apiBase ?? API).replace(/\/$/, "");
  }

  rateLimit(): RateLimit {
    return this.limit;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
      ...extra,
    };
  }

  /** fetch with the Authorization header added per attempt, so a refreshed token is used on retry. */
  private send(url: string, init: RequestInit = {}): Promise<Response> {
    return withAuth(this.cfg.token, (t) =>
      fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${t}` } }),
    );
  }

  private noteRateLimit(res: Response): void {
    const remaining = Number(res.headers.get("x-ratelimit-remaining"));
    const limit = Number(res.headers.get("x-ratelimit-limit"));
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    if (Number.isFinite(remaining) && Number.isFinite(limit) && Number.isFinite(reset)) {
      this.limit = { remaining, limit, resetAt: reset * 1000 };
    }
  }

  private fileUrl(): string {
    return this.fileUrlFor(this.cfg.path);
  }

  private fileUrlFor(path: string): string {
    return `${this.apiBase}/repos/${encodeURIComponent(this.cfg.owner)}/${encodeURIComponent(
      this.cfg.repo,
    )}/contents/${encodePath(path)}`;
  }

  /** Same credentials, different file. Used for snapshots and history. */
  clone(path: string): GitHubAdapter {
    return new GitHubAdapter({ ...this.cfg, path });
  }

  /** List a directory. Returns [] when it does not exist yet. */
  async listDir(dirPath: string): Promise<Array<{ name: string; size: number; sha: string }>> {
    const res = await this.send(
      `${this.fileUrlFor(dirPath)}?ref=${encodeURIComponent(this.cfg.branch)}`,
      { headers: this.headers(), cache: "no-store" },
    );
    this.noteRateLimit(res);
    if (res.status === 404) return [];
    if (!res.ok) await this.fail(res);

    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) return [];
    return (body as Array<{ type?: string; name?: string; size?: number; sha?: string }>)
      .filter((entry) => entry.type === "file" && entry.name && entry.sha)
      .map((entry) => ({
        name: entry.name as string,
        size: entry.size ?? 0,
        sha: entry.sha as string,
      }));
  }

  async remove(path: string, sha: string, message: string): Promise<void> {
    const res = await this.send(this.fileUrlFor(path), {
      method: "DELETE",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message, sha, branch: this.cfg.branch }),
    });
    this.noteRateLimit(res);
    if (!res.ok && res.status !== 404) await this.fail(res);
  }

  private async fail(res: Response): Promise<never> {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) detail = body.message;
    } catch {
      /* keep statusText */
    }
    if (res.status === 401) {
      throw new GitHubError(401, "GitHub rejected the token (401). Check that it is valid and not expired.");
    }
    if (res.status === 403 || res.status === 429) {
      throw new GitHubError(res.status, formatRateLimitOrForbidden(res, detail));
    }
    throw new GitHubError(res.status, `GitHub error ${res.status}: ${detail}`);
  }

  async read(etag?: string): Promise<ReadResult> {
    const res = await this.send(`${this.fileUrl()}?ref=${encodeURIComponent(this.cfg.branch)}`, {
      headers: this.headers(etag ? { "If-None-Match": etag } : undefined),
      cache: "no-store",
    });
    this.noteRateLimit(res);

    if (res.status === 304) return { status: "unchanged" };
    if (res.status === 404) return { status: "missing" };
    if (!res.ok) await this.fail(res);

    const body = (await res.json()) as {
      type?: string;
      encoding?: string;
      content?: string;
      sha?: string;
      size?: number;
    };

    if (body.type && body.type !== "file") {
      throw new GitHubError(422, `"${this.cfg.path}" exists but is a ${body.type}, not a file.`);
    }
    if (body.encoding === "none" || (!body.content && (body.size ?? 0) > 0)) {
      if (body.sha) {
        return {
          status: "ok",
          bytes: await this.readBlobBytes(body.sha, body.size),
          sha: body.sha,
          etag: res.headers.get("etag") ?? undefined,
        };
      }
      throw new GitHubError(
        413,
        `This board file is larger than 1 MB (${(((body.size ?? 0) / (1024 * 1024)) || 1).toFixed(1)} MB) ` +
          "and could not be retrieved from the Git Blobs API.",
      );
    }

    return {
      status: "ok",
      bytes: base64ToBytes(body.content ?? ""),
      sha: body.sha,
      etag: res.headers.get("etag") ?? undefined,
    };
  }

  /** Fetch a git blob's raw bytes directly via its blob SHA (supports up to 100 MB in 1 API call). */
  async readBlob(blobSha: string): Promise<Uint8Array> {
    return this.readBlobBytes(blobSha);
  }

  private async readBlobBytes(blobSha: string, sizeHint?: number): Promise<Uint8Array> {
    // Retrieve via the Git Blobs API which supports files up to 100 MB.
    const blobUrl = `${this.apiBase}/repos/${encodeURIComponent(this.cfg.owner)}/${encodeURIComponent(
      this.cfg.repo,
    )}/git/blobs/${encodeURIComponent(blobSha)}`;

    let blobError: unknown;
    let triedRaw = false;

    // Attempt 1: Fetch raw binary directly using application/vnd.github.raw
    if (!skipRawBlob) {
      triedRaw = true;
      try {
        const blobRes = await this.send(blobUrl, {
          headers: this.headers({ Accept: "application/vnd.github.raw" }),
          cache: "no-store",
        });
        this.noteRateLimit(blobRes);
        if (blobRes.ok) {
          const buffer = await blobRes.arrayBuffer();
          return new Uint8Array(buffer);
        }
        // Auth, rate-limit, and missing-blob responses won't succeed on JSON either; fail fast.
        if (
          blobRes.status === 401 ||
          blobRes.status === 403 ||
          blobRes.status === 404 ||
          blobRes.status === 429
        ) {
          await this.fail(blobRes);
        }
      } catch (err) {
        if (err instanceof GitHubError) throw err;
        blobError = err; // try JSON fallback below
      }
    }

    // Attempt 2: Fetch via JSON (content base64 encoded)
    try {
      const jsonBlobRes = await this.send(blobUrl, {
        headers: this.headers({ Accept: "application/vnd.github+json" }),
        cache: "no-store",
      });
      this.noteRateLimit(jsonBlobRes);
      if (jsonBlobRes.ok) {
        const blobJson = (await jsonBlobRes.json()) as { content?: string };
        if (blobJson.content) {
          if (triedRaw) skipRawBlob = true;
          return base64ToBytes(blobJson.content);
        }
      } else {
        await this.fail(jsonBlobRes);
      }
    } catch (err) {
      blobError = err;
    }

    // A login, rate-limit, or HTTP error is not a size problem: surface it as is.
    if (blobError instanceof Error && !(blobError instanceof TypeError)) throw blobError;

    throw new GitHubError(
      413,
      `This board file is larger than 1 MB (${(((sizeHint ?? 0) / (1024 * 1024)) || 1).toFixed(1)} MB) ` +
        "and could not be retrieved from the Git Blobs API.",
    );
  }

  async write(bytes: Uint8Array, prevSha: string | undefined, message: string): Promise<WriteResult> {
    const res = await this.send(this.fileUrl(), {
      method: "PUT",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        message,
        content: bytesToBase64(bytes),
        branch: this.cfg.branch,
        ...(prevSha ? { sha: prevSha } : {}),
      }),
    });
    this.noteRateLimit(res);

    if (res.status === 409 || res.status === 422) {
      let detail = res.statusText;
      try {
        const body = (await res.json()) as { message?: string };
        if (body?.message) detail = body.message;
      } catch {
        /* ignore */
      }
      // A brand new repo has no branch to commit to. Say so plainly instead of
      // looping through conflict retries.
      if (/is empty|empty repository|branch .* not found|no commit found/i.test(detail)) {
        throw new GitHubError(
          res.status,
          `GitHub says "${detail}". A brand new repo has no commits, so the ` +
            `"${this.cfg.branch}" branch does not exist yet. Add a README to the repo ` +
            `(or pick an existing branch) and try again.`,
        );
      }
      throw new ConflictError(res.status, `Write rejected by GitHub (${res.status}): ${detail}`);
    }
    if (!res.ok) await this.fail(res);

    const body = (await res.json()) as { content?: { sha?: string } };
    return { sha: body.content?.sha };
  }

  private repoUrl(suffix = ""): string {
    return `${this.apiBase}/repos/${encodeURIComponent(this.cfg.owner)}/${encodeURIComponent(
      this.cfg.repo,
    )}${suffix}`;
  }

  /** The caller's permissions on the repo. Only admin and push are read. */
  async repoPermissions(): Promise<{ admin: boolean; push: boolean }> {
    const res = await this.send(this.repoUrl(), { headers: this.headers(), cache: "no-store" });
    this.noteRateLimit(res);
    if (!res.ok) await this.fail(res);
    const body = (await res.json()) as { permissions?: { admin?: boolean; push?: boolean } };
    return { admin: Boolean(body.permissions?.admin), push: Boolean(body.permissions?.push) };
  }

  /** The commit the configured branch points at. */
  async branchHead(): Promise<string> {
    const res = await this.send(this.repoUrl(`/git/ref/heads/${encodePath(this.cfg.branch)}`), {
      headers: this.headers(),
      cache: "no-store",
    });
    this.noteRateLimit(res);
    if (!res.ok) await this.fail(res);
    const body = (await res.json()) as { object?: { sha?: string } };
    if (!body.object?.sha) throw new GitHubError(502, "GitHub returned a branch without a commit.");
    return body.object.sha;
  }

  private async postJson<T>(suffix: string, payload: unknown): Promise<T> {
    const res = await this.send(this.repoUrl(suffix), {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    this.noteRateLimit(res);
    if (!res.ok) await this.fail(res);
    return (await res.json()) as T;
  }

  /**
   * Put several files in ONE commit on the branch, through the Git Data API, so either
   * every file lands or none does. `expectedHead` (from branchHead) makes this throw
   * ConflictError when the branch has moved since that read. A branch that moves while
   * the commit is being written also gives ConflictError (the ref update is not a
   * fast-forward).
   */
  async commitFiles(
    files: Array<{ path: string; bytes: Uint8Array }>,
    message: string,
    opts: { expectedHead?: string } = {},
  ): Promise<void> {
    if (files.length === 0) return;
    const parent = await this.branchHead();
    if (opts.expectedHead && parent !== opts.expectedHead) {
      throw new ConflictError(409, "The branch changed while the files were being prepared.");
    }

    const commitRes = await this.send(this.repoUrl(`/git/commits/${parent}`), {
      headers: this.headers(),
      cache: "no-store",
    });
    this.noteRateLimit(commitRes);
    if (!commitRes.ok) await this.fail(commitRes);
    const baseTree = ((await commitRes.json()) as { tree?: { sha?: string } }).tree?.sha;
    if (!baseTree) throw new GitHubError(502, "GitHub returned a commit without a tree.");

    const entries: Array<{ path: string; mode: string; type: string; sha: string }> = [];
    for (const file of files) {
      const blob = await this.postJson<{ sha: string }>("/git/blobs", {
        content: bytesToBase64(file.bytes),
        encoding: "base64",
      });
      entries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const tree = await this.postJson<{ sha: string }>("/git/trees", { base_tree: baseTree, tree: entries });
    const commit = await this.postJson<{ sha: string }>("/git/commits", {
      message,
      tree: tree.sha,
      parents: [parent],
    });

    const refRes = await this.send(this.repoUrl(`/git/refs/heads/${encodePath(this.cfg.branch)}`), {
      method: "PATCH",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    this.noteRateLimit(refRes);
    if (refRes.status === 422 || refRes.status === 409) {
      throw new ConflictError(refRes.status, "The branch moved while the files were being committed. Nothing was changed.");
    }
    if (!refRes.ok) await this.fail(refRes);
  }
}

/** Cheap sanity check used by the setup screen. */
function formatRateLimitOrForbidden(res: Response, detail?: string): string {
  const remaining = res.headers.get("x-ratelimit-remaining");
  const resetRaw = Number(res.headers.get("x-ratelimit-reset"));
  const retryAfter = Number(res.headers.get("retry-after"));
  const isRateLimited =
    res.status === 429 ||
    remaining === "0" ||
    /rate limit/i.test(detail || "") ||
    Number.isFinite(retryAfter);

  if (isRateLimited) {
    let resetHint = "";
    if (Number.isFinite(resetRaw) && resetRaw > 0) {
      const resetMs = resetRaw * 1000;
      const mins = Math.max(1, Math.ceil((resetMs - Date.now()) / 60_000));
      const hhmm = new Date(resetMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      resetHint = ` Resets at ${hhmm} (~${mins}m).`;
    } else if (Number.isFinite(retryAfter) && retryAfter > 0) {
      const mins = Math.max(1, Math.ceil(retryAfter / 60));
      resetHint = ` Retry in ~${mins}m.`;
    }
    return `GitHub API rate limit reached (${res.status}).${resetHint} Cached/recent boards still work offline & with Live Relay.`;
  }

  return `GitHub refused the request (${res.status})${detail ? `: ${detail}` : ""}. Usually a rate limit or missing permission.`;
}

async function throwIfAuthOrRateLimit(res: Response, fallbackMsg: string): Promise<void> {
  if (res.status === 401) {
    throw new GitHubError(401, "GitHub rejected the token (401).");
  }
  if (res.status === 403 || res.status === 429) {
    let detail = "";
    try {
      const body = (await res.clone().json()) as { message?: string };
      detail = body?.message || "";
    } catch {
      /* ignore */
    }
    throw new GitHubError(res.status, formatRateLimitOrForbidden(res, detail));
  }
  if (!res.ok) {
    throw new GitHubError(res.status, `${fallbackMsg} (${res.status}).`);
  }
}

export async function inspectRepo(
  token: string,
  owner: string,
  repo: string,
): Promise<{ private: boolean; push: boolean; defaultBranch: string; fullName: string; empty: boolean }> {
  const res = await fetch(`${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
    },
  });
  if (res.status === 404) {
    throw new GitHubError(404, `Repo ${owner}/${repo} not found, or this token cannot see it.`);
  }
  await throwIfAuthOrRateLimit(res, "GitHub error while checking the repo");
  const body = (await res.json()) as {
    private?: boolean;
    default_branch?: string;
    full_name?: string;
    pushed_at?: string | null;
    size?: number;
    permissions?: { push?: boolean };
  };
  return {
    private: Boolean(body.private),
    push: Boolean(body.permissions?.push),
    defaultBranch: body.default_branch ?? "main",
    fullName: body.full_name ?? `${owner}/${repo}`,
    empty: !body.pushed_at && (body.size ?? 0) === 0,
  };
}

export type GitHubUser = {
  login: string;
  name: string;
  avatarUrl: string;
};

export interface RepoCollaborator {
  login: string;
  name?: string;
  avatarUrl?: string;
  role?: string;
  permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
}

export async function fetchRepoCollaborators(
  token?: string | (() => Promise<string>) | null,
  owner?: string,
  repo?: string,
  apiBase: string = API,
): Promise<RepoCollaborator[]> {
  if (!owner || !repo) return [];
  const base = (apiBase || API).replace(/\/$/, "");
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
  };

  const results: RepoCollaborator[] = [];
  const seen = new Set<string>();

  // Helper to add user
  const addUser = (u: {
    login: string;
    avatar_url?: string;
    permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
    role_name?: string;
  }, fallbackRole?: string) => {
    if (!u.login || seen.has(u.login.toLowerCase())) return;
    seen.add(u.login.toLowerCase());
    results.push({
      login: u.login,
      avatarUrl: u.avatar_url || `https://github.com/${u.login}.png`,
      role:
        u.role_name ||
        (u.login.toLowerCase() === owner.toLowerCase()
          ? "Owner"
          : u.permissions?.admin
          ? "Admin"
          : u.permissions?.push
          ? "Collaborator"
          : fallbackRole || "Reader"),
      permissions: u.permissions,
    });
  };

  // 1. Attempt to fetch /collaborators with token if provided
  if (token) {
    try {
      const res = await withAuth(token, (t) =>
        fetch(`${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators?per_page=100`, {
          headers: { ...headers, Authorization: `Bearer ${t}` },
        }),
      );
      if (res.ok) {
        const data = (await res.json()) as Array<{
          login: string;
          avatar_url?: string;
          permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
          role_name?: string;
        }>;
        if (Array.isArray(data)) {
          for (const u of data) addUser(u);
        }
      }
    } catch {
      /* ignore and try contributors */
    }
  }

  // 2. If collaborators endpoint was inaccessible or returned empty, fetch /contributors (with token if available)
  if (results.length === 0 && token) {
    try {
      const res = await withAuth(token, (t) =>
        fetch(`${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contributors?per_page=100`, {
          headers: { ...headers, Authorization: `Bearer ${t}` },
        }),
      );
      if (res.ok) {
        const data = (await res.json()) as Array<{ login: string; avatar_url?: string }>;
        if (Array.isArray(data)) {
          for (const u of data) addUser(u, "Contributor");
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 3. Fallback: try fetching /contributors unauthenticated (works for public repositories)
  if (results.length === 0) {
    try {
      const res = await fetch(`${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contributors?per_page=100`, {
        headers,
      });
      if (res.ok) {
        const data = (await res.json()) as Array<{ login: string; avatar_url?: string }>;
        if (Array.isArray(data)) {
          for (const u of data) addUser(u, "Contributor");
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 4. Always ensure repo owner is present in the list
  if (owner && !seen.has(owner.toLowerCase())) {
    results.unshift({
      login: owner,
      avatarUrl: `https://github.com/${owner}.png`,
      role: "Owner",
    });
  }

  return results;
}

export async function fetchCurrentUser(token: string): Promise<GitHubUser> {
  const res = await fetch(`${API}/user`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
    },
  });
  await throwIfAuthOrRateLimit(res, "Failed to load GitHub user");
  const body = (await res.json()) as { login: string; name?: string; avatar_url?: string };
  return {
    login: body.login,
    name: body.name || body.login,
    avatarUrl: body.avatar_url || "",
  };
}

export type GitHubRepoItem = {
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  canPush: boolean;
};

type RepoJson = {
  full_name?: string;
  name?: string;
  owner?: { login?: string };
  private?: boolean;
  default_branch?: string;
  permissions?: { push?: boolean };
};

function toRepoItem(r: RepoJson): GitHubRepoItem {
  return {
    fullName: r.full_name || "",
    owner: r.owner?.login || "",
    name: r.name || "",
    private: Boolean(r.private),
    defaultBranch: r.default_branch || "main",
    canPush: Boolean(r.permissions?.push),
  };
}

/**
 * Repos a GitHub App user token can reach: every installation the user can see,
 * then every repo granted to each one. Deduped by full name.
 */
async function fetchAppRepos(token: string): Promise<GitHubRepoItem[]> {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": API_VERSION,
  };
  const seen = new Map<string, GitHubRepoItem>();

  for (let page = 1; ; page++) {
    const res = await fetch(`${API}/user/installations?per_page=100&page=${page}`, { headers });
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      await throwIfAuthOrRateLimit(res, "Failed to load installations");
    }
    if (!res.ok) break;
    const body = (await res.json()) as { installations?: Array<{ id?: number }> };
    const installations = Array.isArray(body.installations) ? body.installations : [];

    for (const installation of installations) {
      if (installation.id === undefined) continue;
      for (let repoPage = 1; ; repoPage++) {
        const repoRes = await fetch(
          `${API}/user/installations/${installation.id}/repositories?per_page=100&page=${repoPage}`,
          { headers },
        );
        if (repoRes.status === 401 || repoRes.status === 403 || repoRes.status === 429) {
          await throwIfAuthOrRateLimit(repoRes, "Failed to load installation repositories");
        }
        if (!repoRes.ok) break;
        const repoBody = (await repoRes.json()) as { repositories?: RepoJson[] };
        const repos = Array.isArray(repoBody.repositories) ? repoBody.repositories : [];
        for (const repo of repos) {
          const item = toRepoItem(repo);
          if (!seen.has(item.fullName)) seen.set(item.fullName, item);
        }
        if (repos.length < 100) break;
      }
    }
    if (installations.length < 100) break;
  }
  return [...seen.values()];
}

export async function fetchUserRepos(token: string, kind: "pat" | "app" = "pat"): Promise<GitHubRepoItem[]> {
  if (kind === "app") return fetchAppRepos(token);
  const res = await fetch(
    `${API}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": API_VERSION,
      },
    },
  );
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    await throwIfAuthOrRateLimit(res, "Failed to load repositories");
  }
  if (!res.ok) return [];
  const body = (await res.json()) as RepoJson[];
  if (!Array.isArray(body)) return [];
  return body.map(toRepoItem);
}

export async function listRepoBoards(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<string[]> {
  const adapter = new GitHubAdapter({
    token,
    owner,
    repo,
    branch,
    path: "",
  });
  const files = await adapter.listDir("boards");
  return files
    .filter((f) => /\.(caulk|slate)$/i.test(f.name))
    .map((f) => f.name.replace(/\.(caulk|slate)$/i, ""));
}


