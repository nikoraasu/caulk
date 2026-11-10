/**
 * GitHub Issues integration for Caulk.
 * Allows turning canvas sticky notes into real GitHub issues and fetching issue cards.
 */

import { withAuth, type TokenSource } from "../auth/token";

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";

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
  labels: string[];
  author: string;
};

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
    labels?: Array<{ name: string }>;
    user?: { login: string };
  };

  return {
    number: data.number,
    title: data.title,
    state: data.state === "closed" ? "closed" : "open",
    htmlUrl: data.html_url,
    labels: (data.labels || []).map((l) => l.name),
    author: data.user?.login || "anonymous",
  };
}
