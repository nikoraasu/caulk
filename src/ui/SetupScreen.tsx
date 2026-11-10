import { useEffect, useMemo, useState } from "react";
import {
  fetchCurrentUser,
  fetchUserRepos,
  inspectRepo,
  listRepoBoards,
  type GitHubRepoItem,
  type GitHubUser,
} from "../storage/github";
import {
  boardLabel,
  clearAuth,
  defaultPassphrase,
  ensureIdentity,
  loadTarget,
  saveSession,
  slugifyBoardName,
  type Session,
} from "../config";

type CheckState =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok"; message: string; isPrivate: boolean; canPush: boolean; empty: boolean }
  | { state: "error"; message: string };

function parseRepo(input: string): { owner: string; repo: string } | null {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  return { owner, repo };
}

export function SetupScreen({ onReady }: { onReady: (session: Session) => void }) {
  const existing = useMemo(() => loadTarget(), []);

  // Parse URL hash or query params (from OAuth redirect or shared board link)
  const urlParams = useMemo(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const hashParams = new URLSearchParams(hash);
    const searchParams = new URLSearchParams(window.location.search);
    return {
      token: hashParams.get("access_token") || searchParams.get("access_token"),
      code: searchParams.get("code"),
      state: searchParams.get("state"),
      error: hashParams.get("auth_error") || searchParams.get("auth_error"),
      repo: hashParams.get("repo") || searchParams.get("repo"),
      board: hashParams.get("board") || searchParams.get("board"),
    };
  }, []);

  const [exchangingCode, setExchangingCode] = useState(Boolean(urlParams.code));

  // If redirected from GitHub with ?code=..., forward to api/auth.php to exchange for token
  useEffect(() => {
    if (urlParams.code) {
      setExchangingCode(true);
      const target =
        `./api/auth.php?code=${encodeURIComponent(urlParams.code)}` +
        (urlParams.state ? `&state=${encodeURIComponent(urlParams.state)}` : "");
      window.location.replace(target);
    }
  }, [urlParams.code, urlParams.state]);

  const [token, setToken] = useState(() => {
    if (urlParams.token) return urlParams.token;
    return (
      localStorage.getItem("caulk.token.v1") ??
      sessionStorage.getItem("caulk.token.session.v1") ??
      localStorage.getItem("slateboard.token.v1") ??
      ""
    );
  });

  const [ghUser, setGhUser] = useState<GitHubUser | null>(null);
  const [userRepos, setUserRepos] = useState<GitHubRepoItem[]>([]);
  const [existingBoards, setExistingBoards] = useState<string[]>([]);
  const [loadingUser, setLoadingUser] = useState(false);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [showManualToken, setShowManualToken] = useState(false);

  const [repoInput, setRepoInput] = useState(
    urlParams.repo || (existing ? `${existing.owner}/${existing.repo}` : ""),
  );
  const [isCustomRepo, setIsCustomRepo] = useState(false);
  const [branch, setBranch] = useState(existing?.branch ?? "main");
  const [showBranchInput, setShowBranchInput] = useState(false);
  const [boardName, setBoardName] = useState(
    urlParams.board || (existing ? boardLabel(existing) : "my-board"),
  );
  const [check, setCheck] = useState<CheckState>({ state: "idle" });
  const [error, setError] = useState<string | null>(urlParams.error || null);

  // Clean URL if token or auth_error was present in hash
  useEffect(() => {
    if (urlParams.token || urlParams.error) {
      if (urlParams.token) {
        localStorage.setItem("caulk.token.v1", urlParams.token);
      }
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [urlParams]);

  // Load GitHub user profile and repositories when token is present
  useEffect(() => {
    const activeToken = token.trim();
    if (!activeToken) {
      setGhUser(null);
      setUserRepos([]);
      return;
    }

    let isSubscribed = true;
    setLoadingUser(true);

    fetchCurrentUser(activeToken)
      .then((user) => {
        if (!isSubscribed) return;
        setGhUser(user);
        return fetchUserRepos(activeToken);
      })
      .then((repos) => {
        if (!isSubscribed || !repos) return;
        setUserRepos(repos);

        // Preselect repo if empty and repos exist
        if (!repoInput && repos.length > 0) {
          const first = repos[0];
          setRepoInput(first.fullName);
          setBranch(first.defaultBranch);
        } else if (repoInput) {
          const match = repos.find(
            (r) => r.fullName.toLowerCase() === repoInput.trim().toLowerCase(),
          );
          if (match) {
            setBranch(match.defaultBranch);
          } else {
            setIsCustomRepo(true);
          }
        }
      })
      .catch((err) => {
        if (!isSubscribed) return;
        setGhUser(null);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (isSubscribed) setLoadingUser(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [token]);

  // Fetch existing boards whenever a repo is selected
  useEffect(() => {
    const parsed = parseRepo(repoInput);
    if (!parsed || !token.trim()) {
      setExistingBoards([]);
      return;
    }

    let isSubscribed = true;
    setLoadingBoards(true);

    listRepoBoards(token.trim(), parsed.owner, parsed.repo, branch)
      .then((boards) => {
        if (!isSubscribed) return;
        setExistingBoards(boards);
      })
      .catch(() => {
        if (isSubscribed) setExistingBoards([]);
      })
      .finally(() => {
        if (isSubscribed) setLoadingBoards(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [repoInput, branch, token]);

  const parsed = parseRepo(repoInput);
  const canSubmit = Boolean(parsed) && token.trim().length > 10 && boardName.trim().length > 0;

  async function verify() {
    if (!parsed) {
      setCheck({ state: "error", message: "Use the form owner/repo, e.g. nikolas/boards" });
      return;
    }
    if (!token.trim()) {
      setCheck({ state: "error", message: "Log in with GitHub first." });
      return;
    }
    setCheck({ state: "checking" });
    try {
      const info = await inspectRepo(token.trim(), parsed.owner, parsed.repo);
      setCheck({
        state: "ok",
        message: `${info.fullName} · ${info.private ? "private" : "public"}`,
        isPrivate: info.private,
        canPush: info.push,
        empty: info.empty,
      });
      setBranch(info.defaultBranch);
    } catch (e) {
      setCheck({ state: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  function handleSelectRepo(fullName: string) {
    if (fullName === "__custom__") {
      setIsCustomRepo(true);
      return;
    }
    setIsCustomRepo(false);
    setRepoInput(fullName);
    const repoData = userRepos.find((r) => r.fullName === fullName);
    if (repoData) {
      setBranch(repoData.defaultBranch);
      setCheck({
        state: "ok",
        message: `${repoData.fullName} · ${repoData.private ? "private" : "public"}`,
        isPrivate: repoData.private,
        canPush: repoData.canPush,
        empty: false,
      });
    }
  }

  function handleLogout() {
    clearAuth();
    setToken("");
    setGhUser(null);
    setUserRepos([]);
    setExistingBoards([]);
    setCheck({ state: "idle" });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!parsed) {
      setError("Please select or enter a repository (owner/repo).");
      return;
    }
    if (!boardName.trim()) {
      setError("Please enter or select a board name.");
      return;
    }

    const userName = ghUser?.login || "Collaborator";
    const boardPath = `boards/${slugifyBoardName(boardName)}`;
    const sessionTarget = {
      owner: parsed.owner,
      repo: parsed.repo,
      branch: branch.trim() || "main",
      path: boardPath,
    };

    const session: Session = {
      ...sessionTarget,
      token: token.trim(),
      passphrase: defaultPassphrase(sessionTarget),
      identity: ensureIdentity(userName),
    };

    saveSession(session, { rememberToken: true });
    onReady(session);
  }

  return (
    <div className="page">
      <div className="window-frame">
        <div className="window-titlebar">
          <div className="window-title">
            <span className="window-lambda">λ</span>
            <span>Caulk - Collaborative Whiteboard</span>
          </div>
          <div className="window-controls">
            <button type="button" className="window-btn" tabIndex={-1} aria-label="Minimize">
              _
            </button>
            <button type="button" className="window-btn" tabIndex={-1} aria-label="Maximize">
              □
            </button>
            <button type="button" className="window-btn close" tabIndex={-1} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <form className="card" onSubmit={submit}>
          <header className="card-head">
            <h1>Caulk</h1>
            <p>
              Real-time collaborative whiteboard backed directly by GitHub. Only authorized repository
              collaborators can access and edit boards.
            </p>
          </header>

          {/* 1. Logged-out State */}
          {exchangingCode ? (
            <div
              style={{
                background: "var(--vgui-base)",
                border: "1px solid var(--vgui-dark)",
                padding: "36px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                alignItems: "center",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 28 }}>🐙</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>
                Connecting to GitHub…
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                Exchanging authentication code with GitHub. Please wait…
              </div>
            </div>
          ) : !ghUser && !token ? (
            <div
              style={{
                background: "var(--vgui-base)",
                border: "1px solid var(--vgui-dark)",
                padding: "24px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                alignItems: "center",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>
                Authentication Required
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", maxWidth: 360, lineHeight: 1.5 }}>
                Log in with your GitHub account to access your repositories and boards. Collaborators
                you invite on GitHub get instant access automatically.
              </div>

              <a
                href="./api/auth.php?action=login"
                className="btn primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: "12px 28px",
                  fontSize: 14,
                  fontWeight: 700,
                  background: "var(--vgui-selected-bg)",
                  color: "#FFFFFF",
                  textDecoration: "none",
                  border: "1px solid var(--vgui-border)",
                  boxShadow: "inset 1px 1px 0 var(--vgui-light)",
                }}
              >
                <span style={{ fontSize: 18 }}>🐙</span>
                <span>Log in with GitHub</span>
              </a>

              <button
                type="button"
                className="btn ghost"
                style={{ fontSize: 11, marginTop: 6 }}
                onClick={() => setShowManualToken(!showManualToken)}
              >
                {showManualToken
                  ? "▲ Hide manual token entry"
                  : "▼ Or enter a GitHub Personal Access Token"}
              </button>

              {showManualToken && (
                <div style={{ width: "100%", marginTop: 8, textAlign: "left" }}>
                  <label className="field">
                    <span>Manual GitHub Token</span>
                    <input
                      type="password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="ghp_... or github_pat_..."
                    />
                  </label>
                </div>
              )}
            </div>
          ) : (
            /* 2. Logged-in State */
            <>
              {/* Account Header Banner */}
              <div
                style={{
                  background: "var(--vgui-base)",
                  border: "1px solid var(--vgui-dark)",
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {ghUser?.avatarUrl ? (
                    <img
                      src={ghUser.avatarUrl}
                      alt={ghUser.login}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        border: "1px solid var(--vgui-light)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "var(--vgui-selected-bg)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        color: "#FFFFFF",
                      }}
                    >
                      λ
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>
                      @{ghUser?.login || "Collaborator"}
                      {ghUser?.name && ghUser.name !== ghUser.login && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 400,
                            color: "var(--ink-soft)",
                            marginLeft: 6,
                          }}
                        >
                          ({ghUser.name})
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--vgui-accent)" }}>
                      {loadingUser ? "Loading repositories…" : "✓ Logged in via GitHub"}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn ghost"
                  style={{ padding: "4px 10px", fontSize: 11 }}
                  onClick={handleLogout}
                >
                  Log out
                </button>
              </div>

              {/* Repository Picker */}
              <div className="field" style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Repository</span>
                  {userRepos.length > 0 && !isCustomRepo && (
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ padding: "2px 6px", fontSize: 11 }}
                      onClick={() => setIsCustomRepo(true)}
                    >
                      ✏ Custom repo
                    </button>
                  )}
                </div>

                {userRepos.length > 0 && !isCustomRepo ? (
                  <select
                    value={repoInput}
                    onChange={(e) => handleSelectRepo(e.target.value)}
                    style={{
                      background: "var(--vgui-base)",
                      color: "#FFFFFF",
                      border: "1px solid var(--vgui-dark)",
                      padding: "8px",
                      fontSize: 13,
                    }}
                  >
                    <option value="">-- Choose one of your repositories or collaborations --</option>
                    {userRepos.map((r) => (
                      <option key={r.fullName} value={r.fullName}>
                        {r.fullName} ({r.private ? "Private" : "Public"}){" "}
                        {r.canPush ? "✓ Collaborator" : "Read-only"}
                      </option>
                    ))}
                    <option value="__custom__">-- Other / Enter manually… --</option>
                  </select>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={repoInput}
                      onChange={(e) => {
                        setRepoInput(e.target.value);
                        setCheck({ state: "idle" });
                      }}
                      placeholder="owner/repo (e.g. your-name/my-boards)"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {userRepos.length > 0 && (
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ padding: "6px 10px", fontSize: 11, whiteSpace: "nowrap" }}
                        onClick={() => setIsCustomRepo(false)}
                      >
                        List Repos
                      </button>
                    )}
                  </div>
                )}
                <small>Select a repository you own or where you have collaborator access.</small>
              </div>

              {/* Board Selection */}
              <div className="field">
                <span>Board</span>
                {existingBoards.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 4 }}>
                      Existing boards in this repo:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {existingBoards.map((b) => (
                        <button
                          key={b}
                          type="button"
                          className="btn ghost"
                          style={{
                            padding: "4px 8px",
                            fontSize: 12,
                            background:
                              boardName.toLowerCase() === b.toLowerCase()
                                ? "var(--vgui-selected-bg)"
                                : undefined,
                            color:
                              boardName.toLowerCase() === b.toLowerCase() ? "#FFFFFF" : undefined,
                          }}
                          onClick={() => setBoardName(b)}
                        >
                          📋 {b}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ padding: "4px 8px", fontSize: 12 }}
                        onClick={() => setBoardName("new-board")}
                      >
                        ➕ New
                      </button>
                    </div>
                  </div>
                )}

                <input
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                  placeholder="e.g. roadmap, sprint-1"
                />
                <small>
                  {loadingBoards
                    ? "Searching repository for existing boards…"
                    : `Saved as boards/${slugifyBoardName(boardName)}`}
                </small>
              </div>

              {/* Branch Toggle (Collapsed by default) */}
              <div style={{ marginTop: 2 }}>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ fontSize: 11, padding: "2px 6px" }}
                  onClick={() => setShowBranchInput(!showBranchInput)}
                >
                  {showBranchInput ? "▲ Hide branch settings" : `⚙ Branch: ${branch}`}
                </button>

                {showBranchInput && (
                  <label className="field" style={{ marginTop: 6 }}>
                    <span>Git Branch</span>
                    <input
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      spellCheck={false}
                    />
                  </label>
                )}
              </div>
            </>
          )}

          {/* Verification / Feedback Message */}
          {check.state === "ok" && (
            <p className="note ok">
              Connected to {check.message}.{" "}
              {check.canPush
                ? "✓ Collaborator write access confirmed."
                : "⚠ Warning: You have read-only access to this repository. You can view public boards, but need write access to save changes."}
            </p>
          )}
          {check.state === "error" && <p className="note error">{check.message}</p>}
          {error && <p className="note error">{error}</p>}

          {/* Actions */}
          {token.trim() && (
            <div className="actions" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={verify}
                disabled={check.state === "checking" || !token.trim()}
              >
                {check.state === "checking" ? "Checking…" : "Verify Access"}
              </button>
              <button type="submit" className="btn primary" disabled={!canSubmit}>
                Open Board
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
