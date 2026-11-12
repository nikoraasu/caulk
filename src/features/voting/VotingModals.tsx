import { useMemo, useState, type MutableRefObject } from "react";
import { CaptureUpdateAction, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type * as Y from "yjs";
import {
  formatVotingResultsMarkdown,
  startVotingSession,
  summarizeVotingResults,
  type VotingSnapshot,
} from "./store";
import "./voting.css";

type StartModalProps = {
  open: boolean;
  doc: Y.Doc | null;
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  currentAuthor: string;
  onStartMeetingTimer: (minutes: number) => void;
  onClose: () => void;
};

export function StartVotingModal({
  open,
  doc,
  apiRef,
  currentAuthor,
  onStartMeetingTimer,
  onClose,
}: StartModalProps) {
  const [votesPerPerson, setVotesPerPerson] = useState(3);
  const [minutes, setMinutes] = useState<number>(0);
  const [anonymous, setAnonymous] = useState(false);
  const [frameId, setFrameId] = useState<string>("");

  const frames = useMemo(() => {
    const els = apiRef.current?.getSceneElements() ?? [];
    return els.filter((el) => el.type === "frame" && !el.isDeleted);
  }, [apiRef, open]);

  if (!open) return null;

  const submit = () => {
    if (!doc) return;
    const durationSeconds = minutes > 0 ? Math.round(minutes * 60) : null;
    startVotingSession(doc, {
      votesPerPerson,
      anonymous,
      frameId: frameId || null,
      durationSeconds,
      startedBy: currentAuthor,
      timerLinked: Boolean(durationSeconds),
    });
    if (minutes > 0) {
      onStartMeetingTimer(minutes);
    }
    onClose();
  };

  return (
    <div className="voting-modal-backdrop" onClick={onClose}>
      <div className="voting-modal" onClick={(e) => e.stopPropagation()}>
        <div className="voting-modal-header">
          <span>Start Dot Voting</span>
          <button type="button" className="voting-banner-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <label className="voting-form-row">
          <span>Votes per person (1–10)</span>
          <input
            type="number"
            min={1}
            max={10}
            value={votesPerPerson}
            onChange={(e) => setVotesPerPerson(Math.max(1, Math.min(10, Number(e.target.value) || 3)))}
          />
        </label>

        <label className="voting-form-row">
          <span>Optional timer</span>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            <option value={0}>No timer (end manually)</option>
            <option value={2}>2 minutes (syncs meeting timer)</option>
            <option value={5}>5 minutes (syncs meeting timer)</option>
            <option value={10}>10 minutes (syncs meeting timer)</option>
          </select>
        </label>

        <label className="voting-form-row">
          <span>Voting scope</span>
          <select value={frameId} onChange={(e) => setFrameId(e.target.value)}>
            <option value="">Whole board</option>
            {frames.map((f) => (
              <option key={f.id} value={f.id}>
                Frame: {(f as { name?: string | null }).name || f.id.slice(0, 6)}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
          />
          <span>Anonymous voting (hide others' dots until voting ends)</span>
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="voting-banner-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="voting-banner-btn primary" onClick={submit}>
            Start voting
          </button>
        </div>
      </div>
    </div>
  );
}

type ResultsModalProps = {
  open: boolean;
  voting: VotingSnapshot;
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  onCopyToast: (msg: string) => void;
  onClose: () => void;
};

export function VotingResultsModal({
  open,
  voting,
  apiRef,
  onCopyToast,
  onClose,
}: ResultsModalProps) {
  const elements = apiRef.current?.getSceneElements() ?? [];
  const rows = useMemo(
    () => summarizeVotingResults(voting, elements),
    [voting, elements],
  );

  if (!open || !voting.session) return null;

  const jumpToElement = (elementId: string) => {
    const api = apiRef.current;
    if (!api) return;
    const el = api.getSceneElements().find((item) => item.id === elementId && !item.isDeleted);
    if (!el) return;
    api.scrollToContent([el], { fitToContent: false, animate: true });
    api.updateScene({
      appState: { selectedElementIds: { [el.id]: true } },
    });
  };

  const copyMarkdown = async () => {
    const md = formatVotingResultsMarkdown(rows, voting.session);
    try {
      await navigator.clipboard.writeText(md);
      onCopyToast("Copied voting results as Markdown.");
    } catch {
      onCopyToast("Clipboard unavailable — select and copy results manually.");
    }
  };

  const tagTopThree = () => {
    const api = apiRef.current;
    if (!api) return;
    const all = api.getSceneElements();
    const medals = ["#1 🏆", "#2 🥈", "#3 🥉"];
    const additions: ExcalidrawElement[] = [];
    rows.slice(0, 3).forEach((row, i) => {
      const target = all.find((item) => item.id === row.elementId && !item.isDeleted);
      if (!target) return;
      const badge = convertToExcalidrawElements([
        {
          type: "text",
          x: target.x + target.width - 54,
          y: target.y - 24,
          text: `${medals[i]} (${row.totalVotes})`,
          fontSize: 15,
          fontFamily: 2,
          strokeColor: "#c4b550",
          backgroundColor: "transparent",
        },
      ]);
      additions.push(...badge);
    });
    if (additions.length === 0) return;
    api.updateScene({
      elements: [...all, ...additions] as unknown as OrderedExcalidrawElement[],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    onCopyToast("Tagged top 3 voted items on board.");
  };

  return (
    <div className="voting-modal-backdrop" onClick={onClose}>
      <div className="voting-modal" onClick={(e) => e.stopPropagation()}>
        <div className="voting-modal-header">
          <span>Voting Results</span>
          <button type="button" className="voting-banner-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="voting-results-list">
          {rows.length === 0 ? (
            <div style={{ opacity: 0.75, padding: "12px 0" }}>No votes were cast in this session.</div>
          ) : (
            rows.map((row, idx) => (
              <button
                key={row.elementId}
                type="button"
                className="voting-result-item"
                onClick={() => jumpToElement(row.elementId)}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  <strong>
                    {idx === 0 ? "🏆 " : idx === 1 ? "🥈 " : idx === 2 ? "🥉 " : `${idx + 1}. `}
                  </strong>
                  {row.label}
                  {!voting.session?.anonymous && row.voters.length > 0 && (
                    <span style={{ display: "block", fontSize: 11, opacity: 0.75 }}>
                      {row.voters.map((v) => `${v.author} ×${v.count}`).join(", ")}
                    </span>
                  )}
                </span>
                <span
                  style={{
                    color: "#f6df75",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  ● {row.totalVotes}
                </span>
              </button>
            ))
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="voting-banner-btn" onClick={() => void copyMarkdown()}>
              Copy Markdown
            </button>
            {rows.length > 0 && (
              <button type="button" className="voting-banner-btn" onClick={tagTopThree}>
                Tag top 3
              </button>
            )}
          </div>
          <button type="button" className="voting-banner-btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
