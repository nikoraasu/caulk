import { useState } from "react";
import type { SnapshotInfo } from "../history/snapshots";

type Props = {
  open: boolean;
  snapshots: SnapshotInfo[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onSnapshotNow: () => void;
  onRestore: (snapshot: SnapshotInfo) => void;
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

export function HistoryPanel({
  open,
  snapshots,
  loading,
  busy,
  error,
  onClose,
  onRefresh,
  onSnapshotNow,
  onRestore,
}: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <aside className={`history ${open ? "open" : ""}`} aria-hidden={!open}>
      <header className="history-head">
        <div>
          <strong>History</strong>
          <p className="muted small">
            Restore points live in <code>.history/</code> next to the board.
          </p>
        </div>
        <button className="btn ghost" onClick={onClose} aria-label="Close history">
          ✕
        </button>
      </header>

      <div className="history-actions">
        <button className="btn" onClick={onSnapshotNow} disabled={busy}>
          {busy ? "Working…" : "Snapshot now"}
        </button>
        <button className="btn ghost" onClick={onRefresh} disabled={loading || busy}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <p className="note error">{error}</p>}

      <div className="history-list">
        {!loading && snapshots.length === 0 && !error && (
          <p className="muted small history-empty">
            No snapshots yet. One is taken automatically every 10 minutes of activity, or hit
            “Snapshot now”.
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
    </aside>
  );
}
