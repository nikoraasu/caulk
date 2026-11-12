import { useState, useEffect, useCallback, useMemo } from "react";
import type { TokenSource } from "../../auth/token";
import {
  listGitHubIssues,
  fetchGitHubIssue,
  createGitHubIssue,
  parseGitHubIssueRef,
  type IssueDetail,
} from "../../storage/issues";
import { soundEngine } from "../../audio/soundEngine";

type Props = {
  open: boolean;
  token: TokenSource;
  owner: string;
  repo: string;
  onClose: () => void;
  onInsertIssueCard: (issue: IssueDetail) => void;
};

export function IssuesDrawer({
  open,
  token,
  owner,
  repo,
  onClose,
  onInsertIssueCard,
}: Props) {
  const [tab, setTab] = useState<"browse" | "quick" | "create">("browse");
  const [filterState, setFilterState] = useState<"open" | "closed" | "all">("open");
  const [searchQuery, setSearchQuery] = useState("");
  const [issues, setIssues] = useState<IssueDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick add input
  const [quickRef, setQuickRef] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);

  // Create issue inputs
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);

  // Fetch issues for repo
  const loadIssues = useCallback(async () => {
    if (!open || !owner || !repo) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listGitHubIssues(token, owner, repo, {
        state: filterState,
        per_page: 50,
      });
      setIssues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load issues from GitHub");
    } finally {
      setLoading(false);
    }
  }, [open, token, owner, repo, filterState]);

  useEffect(() => {
    if (open) {
      loadIssues();
    }
  }, [open, loadIssues]);

  // Keyboard escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Filter issues by search query
  const filteredIssues = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return issues;
    return issues.filter((iss) => {
      const matchNum = String(iss.number).includes(q.replace(/^#/, ""));
      const matchTitle = iss.title.toLowerCase().includes(q);
      const matchAuthor = iss.author.toLowerCase().includes(q);
      const matchLabel = iss.labels.some((l) => l.name.toLowerCase().includes(q));
      return matchNum || matchTitle || matchAuthor || matchLabel;
    });
  }, [issues, searchQuery]);

  const handleInsert = (issue: IssueDetail) => {
    soundEngine.play("click");
    onInsertIssueCard(issue);
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = quickRef.trim();
    if (!target) return;
    const parsed = parseGitHubIssueRef(target, owner, repo);
    if (!parsed) {
      setError("Invalid issue format. Enter #123, or full URL like https://github.com/owner/repo/issues/123");
      return;
    }

    setQuickLoading(true);
    setError(null);
    try {
      soundEngine.play("click");
      const issue = await fetchGitHubIssue(token, parsed.owner, parsed.repo, parsed.number);
      onInsertIssueCard(issue);
      setQuickRef("");
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load issue #${parsed.number}`);
    } finally {
      setQuickLoading(false);
    }
  };

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      setError("Please enter an issue title");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      soundEngine.play("click");
      const created = await createGitHubIssue(token, owner, repo, title, newBody.trim());
      // Fetch full issue details
      const detail = await fetchGitHubIssue(token, owner, repo, created.number);
      onInsertIssueCard(detail);
      setNewTitle("");
      setNewBody("");
      setTab("browse");
      loadIssues();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create issue");
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="window-frame modal-window issues-drawer-window"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 620, maxWidth: "94vw", maxHeight: "88vh", display: "flex", flexDirection: "column" }}
      >
        <div className="window-titlebar">
          <div className="window-title">
            <span className="window-lambda">🐙</span>
            <span>GitHub Issues — {owner}/{repo}</span>
          </div>
          <button
            type="button"
            className="window-btn close"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="card modal-body" style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", padding: 12 }}>
          {/* Tabs */}
          <div className="theme-tab-strip" style={{ marginBottom: 10 }}>
            <button
              type="button"
              className={`theme-tab-btn ${tab === "browse" ? "active" : ""}`}
              onClick={() => {
                soundEngine.play("click");
                setTab("browse");
              }}
            >
              Browse Issues ({issues.length})
            </button>
            <button
              type="button"
              className={`theme-tab-btn ${tab === "quick" ? "active" : ""}`}
              onClick={() => {
                soundEngine.play("click");
                setTab("quick");
              }}
            >
              + Quick Add by #/URL
            </button>
            <button
              type="button"
              className={`theme-tab-btn ${tab === "create" ? "active" : ""}`}
              onClick={() => {
                soundEngine.play("click");
                setTab("create");
              }}
            >
              + Create New Issue
            </button>
          </div>

          {error && <div className="note error" style={{ marginBottom: 10 }}>{error}</div>}

          {/* TAB 1: BROWSE */}
          {tab === "browse" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                {/* Search */}
                <input
                  type="text"
                  placeholder="Filter by title, #number, @author, label…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ flex: 1, padding: "5px 8px", fontSize: 12 }}
                />

                {/* State filters */}
                <div style={{ display: "flex", gap: 3 }}>
                  <button
                    type="button"
                    className={`btn ${filterState === "open" ? "primary" : "ghost"}`}
                    style={{ padding: "4px 8px", fontSize: 11 }}
                    onClick={() => {
                      soundEngine.play("click");
                      setFilterState("open");
                    }}
                  >
                    🟢 Open
                  </button>
                  <button
                    type="button"
                    className={`btn ${filterState === "closed" ? "primary" : "ghost"}`}
                    style={{ padding: "4px 8px", fontSize: 11 }}
                    onClick={() => {
                      soundEngine.play("click");
                      setFilterState("closed");
                    }}
                  >
                    🟣 Closed
                  </button>
                  <button
                    type="button"
                    className={`btn ${filterState === "all" ? "primary" : "ghost"}`}
                    style={{ padding: "4px 8px", fontSize: 11 }}
                    onClick={() => {
                      soundEngine.play("click");
                      setFilterState("all");
                    }}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ padding: "4px 8px", fontSize: 11 }}
                    onClick={loadIssues}
                    disabled={loading}
                    title="Reload from GitHub"
                  >
                    {loading ? "…" : "🔄"}
                  </button>
                </div>
              </div>

              {/* Issues List */}
              <div className="issues-drawer-list" style={{ flex: 1, overflowY: "auto", border: "1px solid var(--vgui-dark, #283022)", background: "var(--vgui-bg, #3e4637)" }}>
                {loading && (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--vgui-text, #e6d6ac)" }}>
                    Loading issues from GitHub…
                  </div>
                )}

                {!loading && filteredIssues.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--vgui-dim, #8b9982)" }}>
                    {searchQuery ? "No matching issues found." : "No issues in this repository."}
                  </div>
                )}

                {!loading &&
                  filteredIssues.map((iss) => {
                    const isOpen = iss.state === "open";
                    return (
                      <div
                        key={iss.number}
                        className="issue-drawer-row"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "8px 10px",
                          borderBottom: "1px solid var(--vgui-border, rgba(0,0,0,0.15))",
                          background: "var(--vgui-base, rgba(0,0,0,0.06))",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 12 }}>{isOpen ? "🟢" : "🟣"}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--vgui-accent, #c59c3a)" }}>
                              #{iss.number}
                            </span>
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "var(--ink, #ffffff)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={iss.title}
                            >
                              {iss.title}
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 11, color: "var(--vgui-dim, #8b9982)" }}>
                            <span>by @{iss.author}</span>
                            {iss.labels.map((lbl) => (
                              <span
                                key={lbl.name}
                                style={{
                                  fontSize: 10,
                                  padding: "1px 5px",
                                  borderRadius: 8,
                                  backgroundColor: lbl.color ? `#${lbl.color}` : "var(--vgui-bg)",
                                  color: "#ffffff",
                                }}
                              >
                                {lbl.name}
                              </span>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn primary"
                          style={{ padding: "4px 10px", fontSize: 11, whiteSpace: "nowrap" }}
                          onClick={() => handleInsert(iss)}
                          title="Place Issue Card onto whiteboard canvas"
                        >
                          ➕ Insert Card
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* TAB 2: QUICK ADD */}
          {tab === "quick" && (
            <form onSubmit={handleQuickAdd} style={{ display: "flex", flexDirection: "column", gap: 12, padding: 8 }}>
              <p style={{ margin: 0, fontSize: 12, color: "var(--vgui-text, #e6d6ac)" }}>
                Insert any existing issue from this repository (or any public repo) by issue number or URL:
              </p>
              <label className="field">
                <span>Issue URL or #number:</span>
                <input
                  type="text"
                  placeholder="e.g. #42 or https://github.com/facebook/react/issues/1234"
                  value={quickRef}
                  onChange={(e) => setQuickRef(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px" }}
                />
              </label>

              <div className="actions" style={{ justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={quickLoading || !quickRef.trim()}
                >
                  {quickLoading ? "Fetching…" : "➕ Insert as Card"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: CREATE NEW */}
          {tab === "create" && (
            <form onSubmit={handleCreateNew} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 8 }}>
              <p style={{ margin: 0, fontSize: 12, color: "var(--vgui-text, #e6d6ac)" }}>
                Create a new GitHub issue in <strong>{owner}/{repo}</strong> and drop its card onto the whiteboard:
              </p>

              <label className="field">
                <span>Title:</span>
                <input
                  type="text"
                  placeholder="e.g. Add dark mode support"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px" }}
                  required
                />
              </label>

              <label className="field">
                <span>Description (optional):</span>
                <textarea
                  rows={4}
                  placeholder="Issue details, acceptance criteria, or context…"
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px", resize: "vertical" }}
                />
              </label>

              <div className="actions" style={{ justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={creating || !newTitle.trim()}
                >
                  {creating ? "Creating on GitHub…" : "🚀 Create & Insert Card"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
