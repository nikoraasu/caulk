import { useEffect, useState } from "react";
import type { SyncStatus } from "../sync/engine";
import type { LiveStatus } from "../sync/live";
import type { RateLimit } from "../storage/types";

type Props = {
  status: SyncStatus;
  liveStatus: LiveStatus;
  lastPollAt: number;
  remoteEdits: number;
  rateLimit: RateLimit;
  label: string;
  busy: boolean;
  historyOpen: boolean;
  onHistory: () => void;
  onSaveNow: () => void;
  onPullNow: () => void;
  onClose: () => void;
};

function timeAgo(ts: number, now: number): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 3) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export function StatusBar({
  status,
  liveStatus,
  lastPollAt,
  remoteEdits,
  rateLimit,
  label,
  busy,
  historyOpen,
  onHistory,
  onSaveNow,
  onPullNow,
  onClose,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const dot =
    status.kind === "error"
      ? "err"
      : status.kind === "pending" || status.kind === "loading"
        ? "warn"
        : status.kind === "saving"
          ? "busy"
          : "ok";

  let text: React.ReactNode;
  switch (status.kind) {
    case "loading":
      text = "Unlocking board…";
      break;
    case "pending":
      text = "Changes waiting to save…";
      break;
    case "saving":
      text = "Committing to GitHub…";
      break;
    case "saved":
      text = (
        <>
          Saved {timeAgo(status.at, now)}
          <span className="muted"> · checked {timeAgo(lastPollAt, now)}</span>
        </>
      );
      break;
    case "error":
      text = <span title={status.message}>{status.message}</span>;
      break;
  }

  return (
    <div className="statusbar">
      <div className="status-left">
        <span className={`dot ${dot}`} />
        <span className="status-text">{text}</span>
        <span
          className={`live-badge ${liveStatus.peersCount > 0 ? "live" : "solo"}`}
          title={
            liveStatus.peersCount > 0
              ? `${liveStatus.peersCount} peer(s) connected in real-time. Live preview active!`
              : "Live mesh ready. Connects peer-to-peer when another tab or collaborator opens this board."
          }
        >
          <span className="live-mini-dot" />
          {liveStatus.peersCount > 0
            ? `${liveStatus.peersCount} live ${liveStatus.peersCount === 1 ? "peer" : "peers"}`
            : "Live: ready"}
        </span>
        {remoteEdits > 0 && (
          <span className="badge" title="Remote updates merged into this board">
            {remoteEdits} remote {remoteEdits === 1 ? "update" : "updates"}
          </span>
        )}
      </div>

      <div className="status-right">
        {rateLimit && (
          <span
            className={`small rate ${rateLimit.remaining / rateLimit.limit < 0.05 ? "danger" : rateLimit.remaining / rateLimit.limit < 0.2 ? "warn" : "muted"}`}
            title={
              `${rateLimit.remaining} of ${rateLimit.limit} GitHub API requests left this hour. ` +
              `Resets at ${new Date(rateLimit.resetAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}. Conditional 304 responses are free, so an idle board costs nothing.`
            }
          >
            API {rateLimit.remaining}/{rateLimit.limit}
          </span>
        )}
        <span className="muted small" title="Encrypted board file in your repo">
          {label}
        </span>
        <button
          className={`btn ghost ${historyOpen ? "active" : ""}`}
          onClick={onHistory}
          title="Board snapshot history"
        >
          History
        </button>
        <button className="btn ghost" onClick={onPullNow} disabled={busy}>
          Pull
        </button>
        <button className="btn" onClick={onSaveNow} disabled={busy}>
          Save now
        </button>
        <button className="btn ghost" onClick={onClose} title="Lock this board">
          Lock
        </button>
      </div>
    </div>
  );
}
