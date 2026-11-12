/**
 * GitHub Issues integration for Caulk.
 * Allows turning canvas sticky notes into real GitHub issues, fetching issue cards,
 * listing repository issues, and updating issue states.
 */

import { withAuth, type TokenSource } from "../auth/token";

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";

export type IssueLabel = {
  name: string;
  color?: string;
  description?: string;
};

export type IssueAssignee = {
  login: string;
  avatarUrl?: string;
};

export type CreatedIssue = {
  number: number;
  title: string;
  htmlUrl: string;
};

export type IssueDetail = {
  number: number;
  title: string;
  state: "open" | "closed";
  htmlUrl: string;
  labels: IssueLabel[];
  author: string;
  authorAvatarUrl?: string;
  assignees: IssueAssignee[];
  body?: string;
  updatedAt?: string;
  commentsCount?: number;
  owner?: string;
  repo?: string;
};

export function isGitHubIssueLink(link: string): boolean {
  if (!link) return false;
  return (
    link.startsWith("caulk-issue://") ||
    /https?:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+/i.test(link)
  );
}

export function parseGitHubIssueRef(
  ref: string,
  defaultOwner?: string,
  defaultRepo?: string,
): { owner: string; repo: string; number: number } | null {
  const clean = ref.trim();
  if (!clean) return null;

  // Custom scheme: caulk-issue://owner/repo/123
  const customMatch = clean.match(/^caulk-issue:\/\/([^/]+)\/([^/]+)\/(\d+)$/i);
  if (customMatch) {
    return {
      owner: customMatch[1],
      repo: customMatch[2],
      number: parseInt(customMatch[3], 10),
    };
  }

  // GitHub web URL: https://github.com/owner/repo/issues/123
  const webMatch = clean.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)(?:[#?].*)?$/i,
  );
  if (webMatch) {
    return {
      owner: webMatch[1],
      repo: webMatch[2],
      number: parseInt(webMatch[3], 10),
    };
  }

  // owner/repo#123
  const shortMatch = clean.match(/^([^/\s]+)\/([^#\s]+)#(\d+)$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      number: parseInt(shortMatch[3], 10),
    };
  }

  // #123 (uses defaultOwner & defaultRepo)
  const numMatch = clean.match(/^#?(\d+)$/);
  if (numMatch && defaultOwner && defaultRepo) {
    return {
      owner: defaultOwner,
      repo: defaultRepo,
      number: parseInt(numMatch[1], 10),
    };
  }

  return null;
}

export async function createGitHubIssue(
  token: TokenSource,
  owner: string,
  repo: string,
  title: string,
  body: string,
): Promise<CreatedIssue> {
  const url = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`;
  const payload = JSON.stringify({
    title: title.slice(0, 256),
    body: body || "Created from Caulk whiteboard sticky note.",
  });
  const res = await withAuth(token, (t) =>
    fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${t}`,
        "X-GitHub-Api-Version": API_VERSION,
        "Content-Type": "application/json",
      },
      body: payload,
    }),
  );

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(errBody.message || `Failed to create GitHub issue (${res.status})`);
  }

  const data = (await res.json()) as { number: number; title: string; html_url: string };
  return {
    number: data.number,
    title: data.title,
    htmlUrl: data.html_url,
  };
}

export async function fetchGitHubIssue(
  token: TokenSource,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<IssueDetail> {
  const url = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`;
  const res = await withAuth(token, (t) =>
    fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${t}`,
        "X-GitHub-Api-Version": API_VERSION,
      },
    }),
  );

  if (!res.ok) {
    throw new Error(`Failed to load issue #${issueNumber}`);
  }

  const data = (await res.json()) as {
    number: number;
    title: string;
    state: string;
    html_url: string;
    labels?: Array<{ name: string; color?: string; description?: string }>;
    user?: { login: string; avatar_url?: string };
    assignees?: Array<{ login: string; avatar_url?: string }>;
    body?: string;
    updated_at?: string;
    comments?: number;
  };

  return {
    number: data.number,
    title: data.title,
    state: data.state === "closed" ? "closed" : "open",
    htmlUrl: data.html_url,
    labels: (data.labels || []).map((l) => ({
      name: l.name,
      color: l.color,
      description: l.description,
    })),
    author: data.user?.login || "anonymous",
    authorAvatarUrl: data.user?.avatar_url,
    assignees: (data.assignees || []).map((a) => ({
      login: a.login,
      avatarUrl: a.avatar_url,
    })),
    body: data.body,
    updatedAt: data.updated_at,
    commentsCount: data.comments,
    owner,
    repo,
  };
}

export async function listGitHubIssues(
  token: TokenSource,
  owner: string,
  repo: string,
  opts: {
    state?: "open" | "closed" | "all";
    per_page?: number;
    page?: number;
  } = {},
): Promise<IssueDetail[]> {
  const state = opts.state || "open";
  const perPage = opts.per_page || 30;
  const page = opts.page || 1;
  const url = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=${state}&per_page=${perPage}&page=${page}&sort=updated`;

  const res = await withAuth(token, (t) =>
    fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${t}`,
        "X-GitHub-Api-Version": API_VERSION,
      },
    }),
  );

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || `Failed to list issues for ${owner}/${repo}`);
  }

  const data = (await res.json()) as Array<{
    number: number;
    title: string;
    state: string;
    html_url: string;
    pull_request?: unknown; // GitHub issues endpoint includes pull requests, we filter them out!
    labels?: Array<{ name: string; color?: string; description?: string }>;
    user?: { login: string; avatar_url?: string };
    assignees?: Array<{ login: string; avatar_url?: string }>;
    body?: string;
    updated_at?: string;
    comments?: number;
  }>;

  // Filter out pull requests so only genuine issues are listed
  const issuesOnly = data.filter((item) => !item.pull_request);

  return issuesOnly.map((d) => ({
    number: d.number,
    title: d.title,
    state: d.state === "closed" ? "closed" : "open",
    htmlUrl: d.html_url,
    labels: (d.labels || []).map((l) => ({
      name: l.name,
      color: l.color,
      description: l.description,
    })),
    author: d.user?.login || "anonymous",
    authorAvatarUrl: d.user?.avatar_url,
    assignees: (d.assignees || []).map((a) => ({
      login: a.login,
      avatarUrl: a.avatar_url,
    })),
    body: d.body,
    updatedAt: d.updated_at,
    commentsCount: d.comments,
    owner,
    repo,
  }));
}

export async function updateGitHubIssueState(
  token: TokenSource,
  owner: string,
  repo: string,
  issueNumber: number,
  state: "open" | "closed",
): Promise<IssueDetail> {
  const url = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`;
  const payload = JSON.stringify({ state });

  const res = await withAuth(token, (t) =>
    fetch(url, {
      method: "PATCH",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${t}`,
        "X-GitHub-Api-Version": API_VERSION,
        "Content-Type": "application/json",
      },
      body: payload,
    }),
  );

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || `Failed to update issue #${issueNumber} state to ${state}`);
  }

  return fetchGitHubIssue(token, owner, repo, issueNumber);
}
