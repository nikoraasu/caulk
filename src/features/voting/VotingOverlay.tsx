import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
} from "react";
import {
  sceneCoordsToViewportCoords,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type * as Y from "yjs";
import {
  ELEMENT_REACTION_EMOJIS,
  castVote,
  clearVotingSession,
  endVotingSession,
  retractVote,
  toggleElementReaction,
  type ElementReactionBucket,
  type VotingSnapshot,
} from "./store";
import { soundEngine } from "../../audio/soundEngine";
import "./voting.css";

type Props = {
  doc: Y.Doc | null;
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  apiReady: boolean;
  currentAuthor: string;
  reactions: Map<string, ElementReactionBucket[]>;
  voting: VotingSnapshot;
  activeVoters: string[];
  onOpenStartVoting: () => void;
  onOpenResults: () => void;
};

function isReactableElement(el: ExcalidrawElement): boolean {
  if (el.isDeleted) return false;
  if (el.type === "text" && (el as { containerId?: string | null }).containerId) {
    return false;
  }
  return (
    el.type === "rectangle" ||
    el.type === "diamond" ||
    el.type === "ellipse" ||
    el.type === "text" ||
    el.type === "image"
  );
}

function elementInScope(el: ExcalidrawElement, frameId: string | null): boolean {
  if (!frameId) return true;
  return el.frameId === frameId;
}

export function VotingOverlay({
  doc,
  apiRef,
  apiReady,
  currentAuthor,
  reactions,
  voting,
  activeVoters,
  onOpenStartVoting,
  onOpenResults,
}: Props) {
  const [, setTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [reactPickerTargetId, setReactPickerTargetId] = useState<string | null>(null);

  // Close reaction picker on Escape or click outside
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setReactPickerTargetId(null);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".element-chips-strip, .element-reaction-popover")) {
        setReactPickerTargetId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  // Recompute viewport coordinates whenever camera scrolls/zooms or elements change.
  useEffect(() => {
    const api = apiRef.current;
    if (!apiReady || !api) return;
    let raf = 0;
    const bump = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setTick((t) => t + 1);
      });
    };
    const u1 = api.onScrollChange(() => bump());
    const u2 = api.onChange(() => bump());
    return () => {
      if (raf) cancelAnimationFrame(raf);
      u1();
      u2();
    };
  }, [apiReady, apiRef]);

  // Countdown tick & auto-end when timed voting expires.
  useEffect(() => {
    const session = voting.session;
    if (!session || session.status !== "active" || !session.endsAt) return;
    const id = setInterval(() => {
      const cur = Date.now();
      setNow(cur);
      if (doc && session.endsAt && cur >= session.endsAt) {
        if (session.startedBy === currentAuthor || cur >= session.endsAt + 1500) {
          endVotingSession(doc, session.endsAt);
        }
      }
    }, 500);
    return () => clearInterval(id);
  }, [voting.session, doc, currentAuthor]);

  const api = apiRef.current;
  const appState = api?.getAppState();
  const elements = api?.getSceneElements() ?? [];

  const session = voting.session;
  const isVotingActive = session?.status === "active";

  const myVotesUsed = useMemo(() => {
    if (!session) return 0;
    let sum = 0;
    for (const b of voting.ballots) {
      if (b.author === currentAuthor) sum += b.count;
    }
    return sum;
  }, [session, voting.ballots, currentAuthor]);

  const myVotesByElement = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of voting.ballots) {
      if (b.author === currentAuthor) m.set(b.elementId, (m.get(b.elementId) ?? 0) + b.count);
    }
    return m;
  }, [voting.ballots, currentAuthor]);

  const totalVotesByElement = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of voting.ballots) {
      m.set(b.elementId, (m.get(b.elementId) ?? 0) + b.count);
    }
    return m;
  }, [voting.ballots]);

  const toOverlayXY = useCallback(
    (sceneX: number, sceneY: number) => {
      if (!appState) return null;
      const pt = sceneCoordsToViewportCoords({ sceneX, sceneY }, appState);
      return {
        x: pt.x - (appState.offsetLeft || 0),
        y: pt.y - (appState.offsetTop || 0),
      };
    },
    [appState],
  );

  // Single selection identification (reactions bar is closed and rotation handle is unhindered)
  const selectedIds = appState
    ? Object.keys(appState.selectedElementIds).filter((id) => appState.selectedElementIds[id])
    : [];
  const singleSelectedId =
    !appState?.editingTextElement && selectedIds.length === 1 ? selectedIds[0] : null;

  useEffect(() => {
    if (reactPickerTargetId && reactPickerTargetId !== singleSelectedId) {
      setReactPickerTargetId(null);
    }
  }, [singleSelectedId, reactPickerTargetId]);

  const remainingVotes = session ? Math.max(0, session.votesPerPerson - myVotesUsed) : 0;
  const secondsLeft =
    session?.status === "active" && session.endsAt
      ? Math.max(0, Math.ceil((session.endsAt - now) / 1000))
      : null;

  if (!api || !appState) return null;

  // Render bottom-edge chips for elements having reactions, votes, or currently selected.
  // Placed strictly at the bottom (y + height) to keep Excalidraw's top rotation handle completely free!
  const chipOverlays = elements
    .filter((el) => {
      if (!isReactableElement(el)) return false;
      const hasReactions = (reactions.get(el.id)?.length ?? 0) > 0;
      const myDots = myVotesByElement.get(el.id) ?? 0;
      const totalDots = totalVotesByElement.get(el.id) ?? 0;
      const showDots =
        session &&
        (session.status === "ended"
          ? totalDots > 0
          : session.anonymous
            ? myDots > 0
            : totalDots > 0);
      const isSelected = el.id === singleSelectedId;
      return hasReactions || Boolean(showDots) || isSelected;
    })
    .map((el) => {
      const pos = toOverlayXY(el.x, el.y + el.height);
      if (!pos) return null;
      const buckets = reactions.get(el.id) ?? [];
      const myDots = myVotesByElement.get(el.id) ?? 0;
      const totalDots = totalVotesByElement.get(el.id) ?? 0;
      const visibleDots =
        session && session.anonymous && session.status === "active" ? myDots : totalDots;
      const inScope = session ? elementInScope(el, session.frameId) : false;
      const isSelected = el.id === singleSelectedId;
      const isPickerOpen = reactPickerTargetId === el.id;

      return (
        <div
          key={`chips-${el.id}`}
          className="element-chips-strip"
          style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {buckets.map((b) => {
            const mine = b.authors.includes(currentAuthor);
            return (
              <button
                key={b.emoji}
                type="button"
                className={`element-chip${mine ? " mine" : ""}`}
                title={`${b.emoji} by ${b.authors.join(", ")}`}
                onClick={() => {
                  if (!doc) return;
                  soundEngine.play("vote");
                  toggleElementReaction(doc, el.id, b.emoji, currentAuthor);
                }}
              >
                <span>{b.emoji}</span>
                <span>{b.count}</span>
              </button>
            );
          })}

          {session && visibleDots > 0 && (
            <button
              type="button"
              className={`element-chip vote-chip${myDots > 0 ? " mine" : ""}`}
              title={
                isVotingActive
                  ? myDots > 0
                    ? `Click to retract 1 vote (${myDots} yours${session.anonymous ? ", blind mode" : ""})`
                    : `${visibleDots} vote(s)`
                  : `Final votes: ${visibleDots}`
              }
              onClick={() => {
                if (!doc || !isVotingActive || !inScope) return;
                if (myDots > 0) {
                  soundEngine.play("delete");
                  retractVote(doc, el.id, currentAuthor);
                } else if (remainingVotes > 0) {
                  soundEngine.play("vote");
                  castVote(doc, el.id, currentAuthor);
                }
              }}
            >
              <span>●</span>
              <span>{visibleDots}</span>
            </button>
          )}

          {/* Discrete "React" button: visible on selected element or if element already has reactions */}
          {(isSelected || buckets.length > 0) && (
            <button
              type="button"
              className={`element-chip react-trigger-btn${isPickerOpen ? " active" : ""}`}
              title="Add reaction"
              onClick={(e) => {
                e.stopPropagation();
                soundEngine.play("click");
                setReactPickerTargetId((prev) => (prev === el.id ? null : el.id));
              }}
            >
              <span>😀</span>
              {buckets.length === 0 ? <span>React</span> : <span>+</span>}
            </button>
          )}

          {/* Floating Emoji Picker Popover — rendered safely at the bottom edge */}
          {isPickerOpen && (
            <div
              className="element-reaction-popover"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {ELEMENT_REACTION_EMOJIS.map((emoji) => {
                const mine = buckets.some(
                  (b) => b.emoji === emoji && b.authors.includes(currentAuthor),
                );
                return (
                  <button
                    key={emoji}
                    type="button"
                    className={`element-reaction-btn${mine ? " active" : ""}`}
                    title={`React ${emoji}`}
                    onClick={() => {
                      if (!doc) return;
                      soundEngine.play("vote");
                      toggleElementReaction(doc, el.id, emoji, currentAuthor);
                      setReactPickerTargetId(null);
                    }}
                  >
                    {emoji}
                  </button>
                );
              })}

              {isVotingActive && inScope && (
                <span className="element-vote-action">
                  <button
                    type="button"
                    className="element-vote-btn"
                    disabled={remainingVotes <= 0}
                    title={
                      remainingVotes > 0
                        ? "Cast 1 dot vote on this item"
                        : "No votes remaining"
                    }
                    onClick={() => {
                      if (!doc) return;
                      soundEngine.play("vote");
                      castVote(doc, el.id, currentAuthor);
                    }}
                  >
                    +● Vote
                  </button>
                  {myDots > 0 && (
                    <button
                      type="button"
                      className="element-vote-btn"
                      title="Remove 1 of your dot votes"
                      onClick={() => {
                        if (!doc) return;
                        soundEngine.play("delete");
                        retractVote(doc, el.id, currentAuthor);
                      }}
                    >
                      −
                    </button>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      );
    });

  return (
    <div className="voting-overlay">
      {/* Participant Voting Banner */}
      {session && session.status === "active" && (
        <div className="voting-banner">
          <span>
            <strong>Dot Voting</strong>
            {session.anonymous ? " (anonymous)" : ""}
          </span>
          <span className="voting-banner-dots" title={`${remainingVotes} of ${session.votesPerPerson} left`}>
            {Array.from({ length: session.votesPerPerson }, (_, idx) => (
              <span
                key={idx}
                className={`voting-dot-pip${idx < myVotesUsed ? " used" : ""}`}
              />
            ))}
          </span>
          <span>
            {remainingVotes}/{session.votesPerPerson} left
          </span>
          {secondsLeft !== null && (
            <span style={{ color: secondsLeft <= 15 ? "#f28b82" : "#e6d6ac", fontWeight: 700 }}>
              ⏱ {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
            </span>
          )}
          {activeVoters.length > 0 && (
            <span style={{ opacity: 0.85, fontSize: 11 }}>
              Voting: {activeVoters.slice(0, 4).join(", ")}
              {activeVoters.length > 4 ? ` +${activeVoters.length - 4}` : ""}
            </span>
          )}
          <button
            type="button"
            className="voting-banner-btn primary"
            onClick={() => {
              if (!doc) return;
              endVotingSession(doc);
              onOpenResults();
            }}
          >
            End voting
          </button>
        </div>
      )}

      {session && session.status === "ended" && (
        <div className="voting-banner">
          <span>
            <strong>Voting ended</strong> ({voting.ballots.reduce((s, b) => s + b.count, 0)} votes)
          </span>
          <button type="button" className="voting-banner-btn primary" onClick={onOpenResults}>
            View results
          </button>
          <button type="button" className="voting-banner-btn" onClick={onOpenStartVoting}>
            New vote…
          </button>
          <button
            type="button"
            className="voting-banner-btn"
            onClick={() => doc && clearVotingSession(doc)}
          >
            Clear
          </button>
        </div>
      )}

      {/* Bottom chips & anchored react trigger */}
      {chipOverlays}
    </div>
  );
}
