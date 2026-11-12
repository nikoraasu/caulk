import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import type { GitHubRepoItem, GitHubUser } from "../../storage/github";
import { getFreshToken } from "../../auth/token";
import { GitHubAdapter, GitHubError, inspectRepo } from "../../storage/github";
import { EncryptedStore } from "../../storage/encrypted";
import {
  boardKey,
  getBoardPassphrase,
  setBoardPassphrase,
  slugifyBoardName,
  type BoardTarget,
} from "../../config";
import { TemplateGalleryModal } from "../templates/TemplateGalleryModal";
import { seedDocFromTemplate } from "../templates/store";
import type { BoardTemplate } from "../templates/types";
import {
  deleteRepoBoard,
  duplicateOrRenameBoard,
  formatRelativeDate,
  getCachedThumbnail,
  listDashboardBoards,
  listRecentBoards,
  loadCachedBoards,
  recordRecentBoard,
  saveCachedBoards,
  saveLastRepo,
  type DashboardBoard,
  type RecentBoardEntry,
} from "./store";
import "./home.css";

function buildCachedBoardFallback(
  repoList: GitHubRepoItem[],
  recentList: RecentBoardEntry[],
): DashboardBoard[] {
  const byKey = new Map<string, DashboardBoard>();
  for (const r of repoList) {
    for (const cached of loadCachedBoards(r.owner, r.name)) {
      byKey.set(boardKey(cached), cached);
    }
  }
  const repoSet = new Set(repoList.map((r) => r.fullName.toLowerCase()));
  for (const rec of recentList) {
    const full = `${rec.owner}/${rec.repo}`.toLowerCase();
    if (!repoSet.has(full)) continue;
    const key = boardKey(rec);
    if (byKey.has(key)) continue;
    const file = rec.path.split("/").pop() || `${rec.name}.slate`;
    byKey.set(key, {
      owner: rec.owner,
      repo: rec.repo,
      branch: rec.branch,
      path: rec.path,
      slug: file.replace(/\.(caulk|slate)$/i, ""),
      name: rec.name,
      sha: "",
      size: 0,
      lastEditedAt: new Date(rec.lastOpenedAt).toISOString(),
      lastAuthor: null,
      locked: false,
      thumbnailSvg: getCachedThumbnail(rec),
    });
  }
  return Array.from(byKey.values());
}

type Props = {
  token: string;
  user: GitHubUser | null;
  repos: GitHubRepoItem[];
  initialRepo: string;
  initialBranch: string;
  apiNotice?: string | null;
  onOpenBoard: (target: BoardTarget, passphraseOverride?: string) => void;
  onLogout: () => void;
  onSwitchToManual: () => void;
};

export function HomeDashboard({
  token,
  user,
  repos,
  initialRepo,
  initialBranch,
  apiNotice,
  onOpenBoard,
  onLogout,
  onSwitchToManual,
}: Props) {
  const [selectedRepo, setSelectedRepo] = useState<string>(() => {
    if (initialRepo) return initialRepo;
    return repos[0]?.fullName ?? "";
  });
  const [customRepoInput, setCustomRepoInput] = useState(initialRepo);
  const [customBranch, setCustomBranch] = useState(initialBranch || "main");
  const [customRepos, setCustomRepos] = useState<GitHubRepoItem[]>([]);
  const [addingCustomRepo, setAddingCustomRepo] = useState(false);

  const [boards, setBoards] = useState<DashboardBoard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<RecentBoardEntry[]>(() => listRecentBoards());

  // New board modal
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newBoardRepo, setNewBoardRepo] = useState(initialRepo || repos[0]?.fullName || "");
  const [newBoardName, setNewBoardName] = useState("new-board");
  const [newBoardPassword, setNewBoardPassword] = useState("");
  const [rememberNewPassword, setRememberNewPassword] = useState(true);
  const [starterTemplate, setStarterTemplate] = useState<BoardTemplate | null>(null);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Action dialogs: rename / duplicate / delete / unlock
  const [renameTarget, setRenameTarget] = useState<{
    board: DashboardBoard;
    mode: "rename" | "duplicate";
    nextName: string;
    password: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DashboardBoard | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const allRepos = useMemo(() => {
    const map = new Map<string, GitHubRepoItem>();
    for (const r of repos) map.set(r.fullName, r);
    for (const r of customRepos) map.set(r.fullName, r);
    // Keep last-used/recent repos selectable even if GitHub repo listing failed on rate limit
    for (const rec of recent) {
      const fullName = `${rec.owner}/${rec.repo}`;
      if (!map.has(fullName)) {
        map.set(fullName, {
          fullName,
          owner: rec.owner,
          name: rec.repo,
          private: true,
          defaultBranch: rec.branch || "main",
          canPush: true,
        });
      }
    }
    return Array.from(map.values());
  }, [repos, customRepos, recent]);

  // Keep selectedRepo synced to the first/initial repo once repos finish loading (never auto-scan all repos).
  useEffect(() => {
    if (!selectedRepo && allRepos.length > 0) {
      const preferred =
        initialRepo && allRepos.some((r) => r.fullName === initialRepo)
          ? initialRepo
          : allRepos[0].fullName;
      setSelectedRepo(preferred);
    }
    if (!newBoardRepo && allRepos.length > 0) {
      setNewBoardRepo(allRepos[0].fullName);
    }
  }, [allRepos, selectedRepo, initialRepo, newBoardRepo]);

  const activeRepoList = useMemo(() => {
    if (!selectedRepo) return [];
    if (selectedRepo === "__all__") return allRepos.slice(0, 5);
    const match = allRepos.find((r) => r.fullName === selectedRepo);
    if (match) return [match];
    const parts = selectedRepo.split("/");
    if (parts.length === 2 && parts[0] && parts[1]) {
      return [
        {
          fullName: selectedRepo,
          owner: parts[0],
          name: parts[1],
          private: false,
          defaultBranch: customBranch || "main",
          canPush: true,
        },
      ];
    }
    return [];
  }, [selectedRepo, allRepos, customBranch]);

  const activeRepoKey = useMemo(
    () => activeRepoList.map((r) => `${r.owner}/${r.name}:${r.defaultBranch}`).join("|"),
    [activeRepoList],
  );
  const activeRepoListRef = useRef(activeRepoList);
  activeRepoListRef.current = activeRepoList;
  const rateLimitedUntilRef = useRef(0);
  const loadingRef = useRef(false);

  const loadBoards = useCallback(
    async (manual = false) => {
      const targetRepos = activeRepoListRef.current;
      const currentRecent = listRecentBoards();
      if (!token.trim() || targetRepos.length === 0) {
        setBoards([]);
        return;
      }
      if (loadingRef.current) return;
      if (!manual && Date.now() < rateLimitedUntilRef.current) {
        setBoards(buildCachedBoardFallback(targetRepos, currentRecent));
        return;
      }
      loadingRef.current = true;
      // Show cached boards immediately while loading fresh list
      const initialCached = buildCachedBoardFallback(targetRepos, currentRecent);
      if (initialCached.length > 0) {
        setBoards((prev) => (prev.length > 0 ? prev : initialCached));
      }
      setLoading(true);
      setError(null);
      try {
        const results: DashboardBoard[][] = [];
        for (const r of targetRepos) {
          try {
            const list = await listDashboardBoards({
              token: getFreshToken,
              owner: r.owner,
              repo: r.name,
              branch: r.defaultBranch,
            });
            saveCachedBoards(r.owner, r.name, list);
            results.push(list);
          } catch (err) {
            if (err instanceof GitHubError && (err.status === 403 || err.status === 429 || err.status === 401)) {
              throw err;
            }
            results.push(loadCachedBoards(r.owner, r.name));
          }
        }
        rateLimitedUntilRef.current = 0;
        const merged = results.flat().sort((a, b) => {
          const ta = a.lastEditedAt ? Date.parse(a.lastEditedAt) : 0;
          const tb = b.lastEditedAt ? Date.parse(b.lastEditedAt) : 0;
          if (ta !== tb) return tb - ta;
          return a.name.localeCompare(b.name);
        });
        setBoards(merged);
      } catch (err) {
        if (err instanceof GitHubError && (err.status === 403 || err.status === 429)) {
          rateLimitedUntilRef.current = Date.now() + 60_000;
        }
        const fallback = buildCachedBoardFallback(targetRepos, currentRecent);
        setBoards(fallback);
        setError(err instanceof Error ? err.message : "Failed to load boards.");
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [token, activeRepoKey],
  );

  useEffect(() => {
    void loadBoards(false);
  }, [loadBoards]);

  const filteredBoards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        `${b.owner}/${b.repo}`.toLowerCase().includes(q) ||
        (b.lastAuthor?.toLowerCase().includes(q) ?? false),
    );
  }, [boards, search]);

  const handleConnectCustomRepo = async () => {
    const parts = customRepoInput.trim().split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setError("Enter repository as owner/repo.");
      return;
    }
    setError(null);
    try {
      const info = await inspectRepo(token, parts[0], parts[1]);
      const item: GitHubRepoItem = {
        fullName: info.fullName,
        owner: parts[0],
        name: parts[1],
        private: info.private,
        defaultBranch: customBranch.trim() || info.defaultBranch,
        canPush: info.push,
      };
      setCustomRepos((prev) => [...prev.filter((r) => r.fullName !== item.fullName), item]);
      setSelectedRepo(item.fullName);
      saveLastRepo(item.fullName);
      setNewBoardRepo(item.fullName);
      setAddingCustomRepo(false);
    } catch (err) {
      // During GitHub rate limits (403/429), still allow connecting the typed owner/repo locally
      if (err instanceof GitHubError && (err.status === 403 || err.status === 429)) {
        const fullName = `${parts[0]}/${parts[1]}`;
        const item: GitHubRepoItem = {
          fullName,
          owner: parts[0],
          name: parts[1],
          private: true,
          defaultBranch: customBranch.trim() || "main",
          canPush: true,
        };
        setCustomRepos((prev) => [...prev.filter((r) => r.fullName !== item.fullName), item]);
        setSelectedRepo(item.fullName);
        saveLastRepo(item.fullName);
        setNewBoardRepo(item.fullName);
        setAddingCustomRepo(false);
        setError(`${err.message} Connected ${fullName} using cached/offline mode.`);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not inspect repository.");
    }
  };

  const openBoardTarget = (target: BoardTarget) => {
    recordRecentBoard(target);
    setRecent(listRecentBoards());
    onOpenBoard(target);
  };

  const handleCreateBoard = async () => {
    const targetRepo = allRepos.find((r) => r.fullName === newBoardRepo) ?? activeRepoList[0];
    if (!targetRepo || !newBoardName.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const path = `boards/${slugifyBoardName(newBoardName)}`;
      const target: BoardTarget = {
        owner: targetRepo.owner,
        repo: targetRepo.name,
        branch: targetRepo.defaultBranch,
        path,
      };
      if (newBoardPassword) {
        setBoardPassphrase(target, newBoardPassword, { remember: rememberNewPassword });
      }
      const passphrase = newBoardPassword || getBoardPassphrase(target);

      if (starterTemplate) {
        const adapter = new GitHubAdapter({
          token,
          owner: target.owner,
          repo: target.repo,
          branch: target.branch,
          path: target.path,
        });
        const existing = await adapter.read().catch(() => ({ status: "missing" as const }));
        if (existing.status === "missing") {
          const seedDoc = new Y.Doc();
          seedDocFromTemplate(seedDoc, starterTemplate);
          await new EncryptedStore(adapter, passphrase).save(Y.encodeStateAsUpdate(seedDoc));
          seedDoc.destroy();
        }
      }
      recordRecentBoard(target);
      setNewModalOpen(false);
      onOpenBoard(target, newBoardPassword || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create board.");
    } finally {
      setCreating(false);
    }
  };

  const handleRenameOrDuplicate = async () => {
    if (!renameTarget || !renameTarget.nextName.trim() || actionBusy) return;
    setActionBusy(true);
    setError(null);
    try {
      await duplicateOrRenameBoard(
        {
          token,
          owner: renameTarget.board.owner,
          repo: renameTarget.board.repo,
          branch: renameTarget.board.branch,
        },
        {
          sourcePath: renameTarget.board.path,
          newName: renameTarget.nextName,
          mode: renameTarget.mode,
          passphraseOverride: renameTarget.password || undefined,
        },
      );
      setRenameTarget(null);
      await loadBoards(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || actionBusy) return;
    setActionBusy(true);
    setError(null);
    try {
      await deleteRepoBoard(
        {
          token,
          owner: deleteTarget.owner,
          repo: deleteTarget.repo,
          branch: deleteTarget.branch,
        },
        deleteTarget.path,
      );
      setDeleteTarget(null);
      await loadBoards(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setActionBusy(false);
    }
  };

  const selectedRepoObj = allRepos.find((r) => r.fullName === newBoardRepo) ?? activeRepoList[0];
  const templateRepoConfig = useMemo(
    () =>
      selectedRepoObj
        ? {
            token: getFreshToken,
            owner: selectedRepoObj.owner,
            repo: selectedRepoObj.name,
            branch: selectedRepoObj.defaultBranch,
            passphrase: newBoardPassword,
          }
        : null,
    [selectedRepoObj, newBoardPassword],
  );

  return (
    <div className="home-page">
      <div className="home-shell">
        <div className="window-titlebar">
          <div className="window-title">
            <span className="window-lambda">λ</span>
            <span>Caulk Boards</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {user && (
              <span style={{ fontSize: 12, color: "#fff3b0" }}>@{user.login}</span>
            )}
            <button type="button" className="board-card-btn" onClick={onSwitchToManual}>
              Repo form
            </button>
            <button type="button" className="board-card-btn" onClick={onLogout}>
              Log out
            </button>
          </div>
        </div>

        <div className="home-body">
          <div className="home-toolbar">
            <div className="home-controls">
              <select
                className="home-select"
                value={selectedRepo}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedRepo(val);
                  saveLastRepo(val);
                }}
              >
                {allRepos.length === 0 && (
                  <option value="">-- No cached repos yet (+ Repo or Repo form) --</option>
                )}
                {allRepos.length > 1 && <option value="__all__">All connected repos ({allRepos.length})</option>}
                {allRepos.map((r) => (
                  <option key={r.fullName} value={r.fullName}>
                    {r.fullName} ({r.defaultBranch})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="board-card-btn"
                onClick={() => setAddingCustomRepo((v) => !v)}
              >
                {addingCustomRepo ? "Cancel" : "+ Repo"}
              </button>
              <input
                type="search"
                className="home-search"
                placeholder="Search boards…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button type="button" className="board-card-btn" onClick={() => void loadBoards(true)}>
                {loading ? "Loading…" : "↻ Refresh"}
              </button>
            </div>
            <button
              type="button"
              className="board-card-btn open"
              style={{ padding: "6px 12px", fontSize: 12 }}
              onClick={() => {
                setNewBoardName("new-board");
                setNewBoardPassword("");
                setStarterTemplate(null);
                setNewModalOpen(true);
              }}
            >
              + New Board
            </button>
          </div>

          {addingCustomRepo && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                className="home-search"
                placeholder="owner/repo"
                value={customRepoInput}
                onChange={(e) => setCustomRepoInput(e.target.value)}
              />
              <input
                type="text"
                className="home-search"
                style={{ maxWidth: 120 }}
                placeholder="branch"
                value={customBranch}
                onChange={(e) => setCustomBranch(e.target.value)}
              />
              <button
                type="button"
                className="board-card-btn open"
                onClick={() => void handleConnectCustomRepo()}
              >
                Connect repo
              </button>
            </div>
          )}

          {(error || apiNotice) && (
            <div className="note error" style={{ margin: 0 }}>
              {error || apiNotice}
            </div>
          )}

          {recent.length > 0 && (
            <div>
              <div className="home-section-title">Recent boards</div>
              <div className="recent-strip">
                {recent.map((r) => (
                  <button
                    key={boardKey(r)}
                    type="button"
                    className="recent-pill"
                    onClick={() => openBoardTarget(r)}
                    title={`${r.owner}/${r.repo} (${r.branch})`}
                  >
                    <span>📋</span>
                    <span>{r.name}</span>
                    <span style={{ opacity: 0.65, fontSize: 11 }}>
                      {r.owner}/{r.repo}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="home-section-title">
              <span>Boards ({filteredBoards.length})</span>
            </div>

            {loading && boards.length === 0 ? (
              <div style={{ opacity: 0.75, padding: "24px 0" }}>Loading boards from GitHub…</div>
            ) : filteredBoards.length === 0 ? (
              <div style={{ opacity: 0.75, padding: "24px 0" }}>
                No boards match right now. Click <strong>+ New Board</strong> to create one.
              </div>
            ) : (
              <div className="boards-grid">
                {filteredBoards.map((board) => {
                  const target: BoardTarget = {
                    owner: board.owner,
                    repo: board.repo,
                    branch: board.branch,
                    path: board.path,
                  };
                  return (
                    <div key={boardKey(target)} className="board-card">
                      <button
                        type="button"
                        className="board-thumb-btn"
                        onClick={() => openBoardTarget(target)}
                        title={`Open ${board.name}`}
                      >
                        {board.thumbnailSvg && !board.locked ? (
                          <div
                            style={{ width: "100%", height: "100%", padding: 8 }}
                            dangerouslySetInnerHTML={{ __html: board.thumbnailSvg }}
                          />
                        ) : (
                          <div className="board-thumb-placeholder">
                            <span style={{ fontSize: 22 }}>{board.locked ? "🔒" : "📋"}</span>
                            <span>{board.locked ? "Password protected" : "Open board"}</span>
                          </div>
                        )}
                        {board.locked && <span className="board-lock-badge">🔒 Locked</span>}
                      </button>

                      <div className="board-card-body">
                        <div className="board-card-name" onClick={() => openBoardTarget(target)}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {board.name}
                          </span>
                        </div>
                        <div className="board-card-meta">
                          {board.owner}/{board.repo} · {formatRelativeDate(board.lastEditedAt)}
                          {board.lastAuthor ? ` by @${board.lastAuthor}` : ""}
                        </div>
                        <div className="board-card-actions">
                          <button
                            type="button"
                            className="board-card-btn open"
                            onClick={() => openBoardTarget(target)}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            className="board-card-btn"
                            onClick={() =>
                              setRenameTarget({
                                board,
                                mode: "rename",
                                nextName: `${board.name}-renamed`,
                                password: "",
                              })
                            }
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            className="board-card-btn"
                            onClick={() =>
                              setRenameTarget({
                                board,
                                mode: "duplicate",
                                nextName: `${board.name}-copy`,
                                password: "",
                              })
                            }
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            className="board-card-btn danger"
                            onClick={() => setDeleteTarget(board)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New board modal (Blank vs Template) */}
      {newModalOpen && (
        <div className="home-dialog-backdrop" onClick={() => setNewModalOpen(false)}>
          <div className="home-dialog" onClick={(e) => e.stopPropagation()}>
            <h4>Create New Board</h4>
            {allRepos.length > 1 && (
              <label className="voting-form-row">
                <span>Repository</span>
                <select
                  className="home-select"
                  value={newBoardRepo}
                  onChange={(e) => setNewBoardRepo(e.target.value)}
                >
                  {allRepos.map((r) => (
                    <option key={r.fullName} value={r.fullName}>
                      {r.fullName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="voting-form-row">
              <span>Board name</span>
              <input
                type="text"
                className="home-search"
                style={{ maxWidth: "none" }}
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                autoFocus
              />
              <small style={{ opacity: 0.72 }}>
                File: boards/{slugifyBoardName(newBoardName)}
              </small>
            </label>
            <label className="voting-form-row">
              <span>Board password (optional)</span>
              <input
                type="password"
                className="home-search"
                style={{ maxWidth: "none" }}
                value={newBoardPassword}
                onChange={(e) => setNewBoardPassword(e.target.value)}
                placeholder="Leave blank for open collaborator access"
              />
            </label>
            {newBoardPassword && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={rememberNewPassword}
                  onChange={(e) => setRememberNewPassword(e.target.checked)}
                />
                <span>Remember password on this device</span>
              </label>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>Starter:</span>
              <button
                type="button"
                className={`board-card-btn${!starterTemplate ? " open" : ""}`}
                onClick={() => setStarterTemplate(null)}
              >
                Blank board
              </button>
              <button
                type="button"
                className={`board-card-btn${starterTemplate ? " open" : ""}`}
                onClick={() => setTemplateGalleryOpen(true)}
              >
                {starterTemplate ? `📐 ${starterTemplate.name}` : "📐 From template…"}
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="board-card-btn"
                onClick={() => setNewModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="board-card-btn open"
                disabled={!newBoardName.trim() || creating}
                onClick={() => void handleCreateBoard()}
              >
                {creating ? "Creating…" : "Create & Open"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename / Duplicate modal */}
      {renameTarget && (
        <div className="home-dialog-backdrop" onClick={() => setRenameTarget(null)}>
          <div className="home-dialog" onClick={(e) => e.stopPropagation()}>
            <h4>
              {renameTarget.mode === "rename"
                ? `Rename "${renameTarget.board.name}"`
                : `Duplicate "${renameTarget.board.name}"`}
            </h4>
            <label className="voting-form-row">
              <span>New board name</span>
              <input
                type="text"
                className="home-search"
                style={{ maxWidth: "none" }}
                value={renameTarget.nextName}
                onChange={(e) =>
                  setRenameTarget({ ...renameTarget, nextName: e.target.value })
                }
                autoFocus
              />
            </label>
            {renameTarget.board.locked && (
              <label className="voting-form-row">
                <span>Board password (needed if not saved on this device)</span>
                <input
                  type="password"
                  className="home-search"
                  style={{ maxWidth: "none" }}
                  value={renameTarget.password}
                  onChange={(e) =>
                    setRenameTarget({ ...renameTarget, password: e.target.value })
                  }
                  placeholder="Optional if remembered"
                />
              </label>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="board-card-btn"
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="board-card-btn open"
                disabled={actionBusy || !renameTarget.nextName.trim()}
                onClick={() => void handleRenameOrDuplicate()}
              >
                {actionBusy
                  ? "Working…"
                  : renameTarget.mode === "rename"
                    ? "Rename"
                    : "Duplicate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="home-dialog-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="home-dialog" onClick={(e) => e.stopPropagation()}>
            <h4>Delete Board "{deleteTarget.name}"?</h4>
            <p style={{ margin: 0, lineHeight: 1.4 }}>
              This deletes <code>{deleteTarget.path}</code> from{" "}
              <strong>
                {deleteTarget.owner}/{deleteTarget.repo}
              </strong>
              . Collaborators can no longer sync this board unless restored from git history.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="board-card-btn"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="board-card-btn danger"
                disabled={actionBusy}
                onClick={() => void handleDelete()}
              >
                {actionBusy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      <TemplateGalleryModal
        open={templateGalleryOpen}
        repoConfig={templateRepoConfig}
        includeBlankOption
        title="Choose Starter Template"
        onSelectTemplate={(tpl) => {
          setStarterTemplate(tpl);
          setTemplateGalleryOpen(false);
        }}
        onClose={() => setTemplateGalleryOpen(false)}
      />
    </div>
  );
}
