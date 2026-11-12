import { useState, useMemo } from "react";
import type { SnapshotInfo } from "../history/snapshots";
import type { ActivityLogEntry, ActivityAction } from "../history/activity";

type Props = {
  open: boolean;
  snapshots: SnapshotInfo[];
  activityEntries: ActivityLogEntry[];
  collaborators?: string[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onSnapshotNow: () => void;
  onRestore: (snapshot: SnapshotInfo) => void;
  onJumpToElement?: (point?: { x: number; y: number }, elementId?: string) => void;
};

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const bytes = (n: number) =>
  n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

function actionIcon(action: ActivityAction): { icon: string; bg: string; color: string } {
  switch (action) {
    case "create":
      return { icon: "+", bg: "rgba(72, 187, 120, 0.2)", color: "#48bb78" };
    case "update_text":
      return { icon: "✏️", bg: "rgba(224, 159, 43, 0.2)", color: "#e09f2b" };
    case "delete":
      return { icon: "🗑️", bg: "rgba(214, 73, 73, 0.2)", color: "#d64949" };
    case "task_status":
      return { icon: "📋", bg: "rgba(49, 130, 206, 0.2)", color: "#3182ce" };
    case "vote":
      return { icon: "🗳️", bg: "rgba(128, 90, 213, 0.2)", color: "#9f7aea" };
    case "restore":
      return { icon: "💾", bg: "rgba(197, 156, 58, 0.2)", color: "#c59c3a" };
    default:
      return { icon: "•", bg: "rgba(255, 255, 255, 0.1)", color: "#ffffff" };
  }
}

export function HistoryPanel({
  open,
  snapshots,
  activityEntries,
  collaborators = [],
  loading,
  busy,
  error,
  onClose,
  onRefresh,
  onSnapshotNow,
  onRestore,
  onJumpToElement,
}: Props) {
  const [activeTab, setActiveTab] = useState<"activity" | "snapshots">("activity");
  const [confirming, setConfirming] = useState<string | null>(null);

  // Filters for Activity Log
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState("all");
  const [selectedActionType, setSelectedActionType] = useState<string>("all");

  // Distinct authors from activity entries and collaborators
  const allAuthors = useMemo(() => {
    const set = new Set<string>();
    for (const entry of activityEntries) {
      if (entry.userName) set.add(entry.userName);
    }
    for (const c of collaborators) {
      if (c) set.add(c);
    }
    return Array.from(set).sort();
  }, [activityEntries, collaborators]);

  // Filtered activity items
  const filteredActivity = useMemo(() => {
    return activityEntries.filter((item) => {
      if (selectedUser !== "all" && item.userName !== selectedUser) {
        return false;
      }
      if (selectedActionType !== "all") {
        if (selectedActionType === "edits" && item.action !== "update_text") return false;
        if (selectedActionType === "creates" && item.action !== "create") return false;
        if (selectedActionType === "deletes" && item.action !== "delete") return false;
        if (selectedActionType === "tasks" && item.action !== "task_status" && item.targetType !== "task") return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inTitle = item.title.toLowerCase().includes(q);
        const inDetail = (item.detail || "").toLowerCase().includes(q);
        const inUser = item.userName.toLowerCase().includes(q);
        if (!inTitle && !inDetail && !inUser) return false;
      }
      return true;
    });
  }, [activityEntries, selectedUser, selectedActionType, searchQuery]);

  return (
    <aside className={`history ${open ? "open" : ""}`} aria-hidden={!open} style={{ width: 360 }}>
      {/* Header */}
      <header className="history-head">
        <div>
          <strong style={{ fontSize: 14 }}>Board History</strong>
          <p className="muted small" style={{ margin: "2px 0 0" }}>
            Audit log of changes and restore points.
          </p>
        </div>
        <button className="btn ghost" onClick={onClose} aria-label="Close history">
          ✕
        </button>
      </header>

      {/* Tabs navigation */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--vgui-border, #000)",
          background: "var(--vgui-base, #1b2219)",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("activity")}
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: 12,
            fontWeight: activeTab === "activity" ? 700 : 500,
            background: activeTab === "activity" ? "var(--vgui-bg, #263023)" : "transparent",
            color: activeTab === "activity" ? "var(--vgui-accent, #c59c3a)" : "var(--vgui-muted, #ccc)",
            border: "none",
            borderBottom: activeTab === "activity" ? "2px solid var(--vgui-accent, #c59c3a)" : "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <span>📋 Activity</span>
          <span
            style={{
              fontSize: 10,
              padding: "1px 5px",
              borderRadius: 8,
              background: activeTab === "activity" ? "var(--vgui-accent, #c59c3a)" : "rgba(255,255,255,0.1)",
              color: activeTab === "activity" ? "#000" : "#fff",
              fontWeight: 700,
            }}
          >
            {activityEntries.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("snapshots")}
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: 12,
            fontWeight: activeTab === "snapshots" ? 700 : 500,
            background: activeTab === "snapshots" ? "var(--vgui-bg, #263023)" : "transparent",
            color: activeTab === "snapshots" ? "var(--vgui-accent, #c59c3a)" : "var(--vgui-muted, #ccc)",
            border: "none",
            borderBottom: activeTab === "snapshots" ? "2px solid var(--vgui-accent, #c59c3a)" : "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <span>💾 Snapshots</span>
          <span
            style={{
              fontSize: 10,
              padding: "1px 5px",
              borderRadius: 8,
              background: activeTab === "snapshots" ? "var(--vgui-accent, #c59c3a)" : "rgba(255,255,255,0.1)",
              color: activeTab === "snapshots" ? "#000" : "#fff",
              fontWeight: 700,
            }}
          >
            {snapshots.length}
          </span>
        </button>
      </div>

      {/* Tab 1: Activity Log */}
      {activeTab === "activity" && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          {/* Activity Filters */}
          <div
            style={{
              padding: "8px 10px",
              background: "var(--vgui-base, #1b2219)",
              borderBottom: "1px solid var(--vgui-border, #000)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {/* Search Input */}
            <input
              type="text"
              placeholder="🔍 Filter activity or text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "4px 8px",
                fontSize: 11,
                background: "var(--vgui-bg-dark, #151a13)",
                color: "#fff",
                border: "1px solid var(--vgui-dark, #2b3528)",
                borderRadius: "var(--theme-radius-sm, 2px)",
              }}
            />

            {/* Author Filter Dropdown & Category Chips */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                style={{
                  flex: 1,
                  padding: "3px 6px",
                  fontSize: 11,
                  background: "var(--vgui-bg-dark, #151a13)",
                  color: "#fff",
                  border: "1px solid var(--vgui-dark, #2b3528)",
                  borderRadius: "var(--theme-radius-sm, 2px)",
                }}
              >
                <option value="all">👤 All Collaborators</option>
                {allAuthors.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>

              <select
                value={selectedActionType}
                onChange={(e) => setSelectedActionType(e.target.value)}
                style={{
                  width: 100,
                  padding: "3px 6px",
                  fontSize: 11,
                  background: "var(--vgui-bg-dark, #151a13)",
                  color: "#fff",
                  border: "1px solid var(--vgui-dark, #2b3528)",
                  borderRadius: "var(--theme-radius-sm, 2px)",
                }}
              >
                <option value="all">All Actions</option>
                <option value="edits">✏️ Edits</option>
                <option value="creates">🟢 Creates</option>
                <option value="deletes">🗑️ Deletes</option>
                <option value="tasks">📋 Tasks</option>
              </select>
            </div>
          </div>

          {/* Activity List */}
          <div
            className="history-list"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "8px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {filteredActivity.length === 0 ? (
              <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--vgui-muted, #888)" }}>
                <span style={{ fontSize: 24, display: "block", marginBottom: 6 }}>📝</span>
                <span style={{ fontSize: 12 }}>
                  {activityEntries.length === 0
                    ? "No activity recorded yet. Edits made by you and collaborators will appear here in real time."
                    : "No activity matches your filters."}
                </span>
              </div>
            ) : (
              filteredActivity.map((item) => {
                const badge = actionIcon(item.action);
                const canJump = Boolean(onJumpToElement && (item.point || item.targetId));

                return (
                  <div
                    key={item.id}
                    className="activity-item"
                    style={{
                      background: "var(--vgui-bg, #263023)",
                      border: "1px solid var(--vgui-border-dark, #1e261b)",
                      borderRadius: "var(--theme-radius-sm, 2px)",
                      padding: "8px 10px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                    }}
                  >
                    {/* Top Row: Action badge, Author, Time */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            background: badge.bg,
                            color: badge.color,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {badge.icon}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--vgui-accent, #c59c3a)" }}>
                          {item.userName || "Someone"}
                        </span>
                      </div>
                      <span
                        className="snapshot-time"
                        title={new Date(item.timestamp).toLocaleString()}
                        style={{ fontSize: 10, color: "var(--vgui-muted, #aaa)" }}
                      >
                        {timeAgo(item.timestamp)}
                      </span>
                    </div>

                    {/* Middle Row: Title */}
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#ffffff" }}>
                      {item.title}
                    </div>

                    {/* Detail Preview (if present) */}
                    {item.detail && (
                      <div
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--theme-font, monospace)",
                          background: "var(--vgui-bg-dark, #151a13)",
                          borderLeft: `2px solid ${badge.color}`,
                          padding: "3px 6px",
                          borderRadius: 2,
                          color: "var(--vgui-muted, #ccc)",
                          wordBreak: "break-word",
                        }}
                      >
                        {item.detail}
                      </div>
                    )}

                    {/* Bottom Row: Jump button */}
                    {canJump && (
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ padding: "1px 6px", fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}
                          onClick={() => onJumpToElement?.(item.point, item.targetId)}
                          title="Locate and center this element on canvas"
                        >
                          <span>🎯</span>
                          <span>Jump to item</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Snapshots */}
      {activeTab === "snapshots" && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <div className="history-actions">
            <button className="btn" onClick={onSnapshotNow} disabled={busy}>
              {busy ? "Working…" : "Snapshot now"}
            </button>
            <button className="btn ghost" onClick={onRefresh} disabled={loading || busy}>
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          {error && <p className="note error">{error}</p>}

          <div className="history-list" style={{ flex: 1, overflowY: "auto" }}>
            {!loading && snapshots.length === 0 && !error && (
              <p className="muted small history-empty">
                No snapshots yet. One is taken automatically every 10 minutes of activity, or hit “Snapshot now”.
              </p>
            )}

            {snapshots.map((snapshot) => (
              <div className="snapshot" key={snapshot.name}>
                <div className="snapshot-main">
                  <span className="snapshot-time" title={new Date(snapshot.at).toLocaleString()}>
                    {timeAgo(snapshot.at)}
                  </span>
                  <span className="muted small">
                    {snapshot.author}
                    {snapshot.size > 0 && ` · ${bytes(snapshot.size)}`}
                  </span>
                </div>

                {confirming === snapshot.name ? (
                  <div className="snapshot-confirm">
                    <span className="small">Replace the board?</span>
                    <button
                      className="btn danger"
                      disabled={busy}
                      onClick={() => {
                        setConfirming(null);
                        onRestore(snapshot);
                      }}
                    >
                      Restore
                    </button>
                    <button className="btn ghost" onClick={() => setConfirming(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn ghost"
                    disabled={busy}
                    onClick={() => setConfirming(snapshot.name)}
                  >
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
