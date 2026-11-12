import { useState, useCallback, useEffect } from "react";
import type { TokenSource } from "../../auth/token";
import {
  fetchGitHubIssue,
  parseGitHubIssueRef,
  updateGitHubIssueState,
  type IssueDetail,
  type IssueLabel,
} from "../../storage/issues";
import { soundEngine } from "../../audio/soundEngine";

type Props = {
  element: any;
  token?: TokenSource;
  defaultOwner?: string;
  defaultRepo?: string;
  onUpdateElement?: (elementId: string, customData: Record<string, unknown>) => void;
};

function getContrastColor(hexColor?: string): string {
  if (!hexColor) return "#ffffff";
  const hex = hexColor.replace(/^#/, "");
  if (hex.length !== 6) return "#ffffff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#1f2328" : "#ffffff";
}

export function GitHubIssueCard({
  element,
  token,
  defaultOwner,
  defaultRepo,
  onUpdateElement,
}: Props) {
  const custom = (element.customData as Record<string, unknown> | undefined) || {};
  const link = element.link || "";

  const parsed = parseGitHubIssueRef(link, defaultOwner, defaultRepo);
  const owner = (custom.repoOwner as string) || parsed?.owner || defaultOwner || "";
  const repo = (custom.repoName as string) || parsed?.repo || defaultRepo || "";
  const number = (custom.issueNumber as number) || parsed?.number || 0;

  const [state, setState] = useState<"open" | "closed">(
    (custom.issueState as "open" | "closed") || "open",
  );
  const [title, setTitle] = useState<string>((custom.issueTitle as string) || `Issue #${number}`);
  const [labels, setLabels] = useState<IssueLabel[]>(
    Array.isArray(custom.issueLabels) ? (custom.issueLabels as IssueLabel[]) : [],
  );
  const [author, setAuthor] = useState<string>((custom.issueAuthor as string) || "");
  const [authorAvatar, setAuthorAvatar] = useState<string | undefined>(
    custom.issueAuthorAvatar as string | undefined,
  );
  const [assignees, setAssignees] = useState<Array<{ login: string; avatarUrl?: string }>>(
    Array.isArray(custom.issueAssignees) ? (custom.issueAssignees as any) : [],
  );
  const [commentsCount, setCommentsCount] = useState<number>(
    typeof custom.issueComments === "number" ? (custom.issueComments as number) : 0,
  );

  const [loading, setLoading] = useState(false);
  const [updatingState, setUpdatingState] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync internal state if customData updates externally from peer CRDT
  useEffect(() => {
    if (custom.issueState && custom.issueState !== state) {
      setState(custom.issueState as "open" | "closed");
    }
    if (custom.issueTitle && custom.issueTitle !== title) {
      setTitle(custom.issueTitle as string);
    }
    if (Array.isArray(custom.issueLabels)) {
      setLabels(custom.issueLabels as IssueLabel[]);
    }
  }, [custom.issueState, custom.issueTitle, custom.issueLabels]);

  const refreshIssue = useCallback(async () => {
    if (!token || !owner || !repo || !number) return;
    setLoading(true);
    setError(null);
    try {
      soundEngine.play("click");
      const details: IssueDetail = await fetchGitHubIssue(token, owner, repo, number);
      setState(details.state);
      setTitle(details.title);
      setLabels(details.labels);
      setAuthor(details.author);
      setAuthorAvatar(details.authorAvatarUrl);
      setAssignees(details.assignees);
      setCommentsCount(details.commentsCount || 0);

      onUpdateElement?.(element.id, {
        ...custom,
        isIssueCard: true,
        issueNumber: details.number,
        issueTitle: details.title,
        issueState: details.state,
        issueLabels: details.labels,
        issueAuthor: details.author,
        issueAuthorAvatar: details.authorAvatarUrl,
        issueAssignees: details.assignees,
        issueComments: details.commentsCount || 0,
        repoOwner: owner,
        repoName: repo,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh issue");
    } finally {
      setLoading(false);
    }
  }, [token, owner, repo, number, onUpdateElement, element.id, custom]);

  const toggleIssueState = useCallback(async () => {
    if (!token || !owner || !repo || !number || updatingState) return;
    setUpdatingState(true);
    setError(null);
    const nextState = state === "open" ? "closed" : "open";
    try {
      soundEngine.play("click");
      const updated: IssueDetail = await updateGitHubIssueState(
        token,
        owner,
        repo,
        number,
        nextState,
      );
      setState(updated.state);
      onUpdateElement?.(element.id, {
        ...custom,
        issueState: updated.state,
      });
      soundEngine.play("vote");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update state");
    } finally {
      setUpdatingState(false);
    }
  }, [token, owner, repo, number, state, updatingState, onUpdateElement, element.id, custom]);

  const htmlUrl =
    (custom.issueHtmlUrl as string) ||
    link ||
    (owner && repo && number ? `https://github.com/${owner}/${repo}/issues/${number}` : "#");

  const isOpen = state === "open";

  return (
    <div
      className={`caulk-issue-card ${isOpen ? "state-open" : "state-closed"}`}
      onClick={(e) => {
        // Prevent accidental canvas clicks
        e.stopPropagation();
      }}
    >
      <div className="issue-card-header">
        <div className="issue-card-header-left">
          <svg
            className="issue-gh-icon"
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
          </svg>
          <a
            href={htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="issue-number-link"
            title={`Open #${number} on GitHub`}
          >
            {owner && repo ? `${repo}#${number}` : `#${number}`}
          </a>
          <span className={`issue-state-badge ${isOpen ? "open" : "closed"}`}>
            {isOpen ? "🟢 Open" : "🟣 Closed"}
          </span>
        </div>

        <div className="issue-card-actions">
          {token && (
            <button
              type="button"
              className="issue-action-btn"
              onClick={refreshIssue}
              disabled={loading}
              title="Refresh issue from GitHub"
              aria-label="Refresh issue"
            >
              <span className={loading ? "spin" : ""}>🔄</span>
            </button>
          )}

          {token && (
            <button
              type="button"
              className={`issue-action-btn toggle ${isOpen ? "btn-close" : "btn-reopen"}`}
              onClick={toggleIssueState}
              disabled={updatingState}
              title={isOpen ? "Close issue on GitHub" : "Reopen issue on GitHub"}
              aria-label="Toggle issue state"
            >
              {updatingState ? "…" : isOpen ? "Close" : "Reopen"}
            </button>
          )}

          <a
            href={htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="issue-action-btn link"
            title="Open in new tab"
            aria-label="Open on GitHub"
          >
            ↗
          </a>
        </div>
      </div>

      <div className="issue-card-body">
        <h3 className="issue-card-title" title={title}>
          {title}
        </h3>

        {labels.length > 0 && (
          <div className="issue-card-labels">
            {labels.map((lbl, idx) => {
              const bg = lbl.color ? `#${lbl.color}` : "var(--vgui-base, #3e4637)";
              const fg = lbl.color ? getContrastColor(lbl.color) : "var(--vgui-text, #e6d6ac)";
              return (
                <span
                  key={lbl.name || idx}
                  className="issue-label-pill"
                  style={{ backgroundColor: bg, color: fg }}
                  title={lbl.description || lbl.name}
                >
                  {lbl.name}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="issue-card-footer">
        <div className="issue-footer-author">
          {authorAvatar && (
            <img src={authorAvatar} alt={author} className="issue-author-avatar" />
          )}
          <span className="issue-author-name">@{author || "unknown"}</span>
        </div>

        <div className="issue-footer-meta">
          {commentsCount > 0 && (
            <span className="issue-comments-badge" title={`${commentsCount} comments`}>
              💬 {commentsCount}
            </span>
          )}

          {assignees.length > 0 && (
            <div className="issue-assignees" title={`Assigned to ${assignees.map((a) => a.login).join(", ")}`}>
              {assignees.slice(0, 3).map((a) => (
                <span key={a.login} className="issue-assignee-avatar" title={`@${a.login}`}>
                  {a.avatarUrl ? (
                    <img src={a.avatarUrl} alt={a.login} />
                  ) : (
                    a.login.slice(0, 1).toUpperCase()
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <div className="issue-card-error">{error}</div>}
    </div>
  );
}
