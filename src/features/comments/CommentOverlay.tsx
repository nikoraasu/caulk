import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
} from "react";
import { sceneCoordsToViewportCoords, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type * as Y from "yjs";
import {
  COMMENT_REACTIONS,
  addCommentReply,
  createCommentThread,
  deleteCommentMessage,
  isThreadUnread,
  setCommentResolved,
  toggleCommentReaction,
  updateCommentAnchorPos,
  type CommentThread,
} from "./store";
import "./comments.css";

type Props = {
  doc: Y.Doc | null;
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  apiReady: boolean;
  threads: CommentThread[];
  currentAuthor: string;
  peerNames: string[];
  visible: boolean;
  placingMode: boolean;
  onDonePlacing: () => void;
  activeThreadId: string | null;
  onSelectThread: (id: string | null) => void;
  seenMap: Record<string, number>;
  onMarkSeen: (threadId: string, at: number) => void;
};

type DraftAnchor = {
  x: number;
  y: number;
  elementId: string | null;
  offsetX: number | null;
  offsetY: number | null;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

function formatTime(at: number): string {
  if (!at) return "";
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function hitTestElement(
  elements: readonly ExcalidrawElement[],
  x: number,
  y: number,
): ExcalidrawElement | null {
  const byId = new Map<string, ExcalidrawElement>();
  for (const el of elements) byId.set(el.id, el);

  const nonFrames: ExcalidrawElement[] = [];
  const frames: ExcalidrawElement[] = [];
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i];
    if (el.isDeleted) continue;
    if (el.type === "frame" || (el.customData as Record<string, unknown> | undefined)?.isFrame) {
      frames.push(el);
    } else {
      nonFrames.push(el);
    }
  }

  const checkList = (list: ExcalidrawElement[]): ExcalidrawElement | null => {
    for (const el of list) {
      const target =
        el.type === "text" && el.containerId ? byId.get(el.containerId) ?? el : el;
      const minX = Math.min(target.x, target.x + target.width) - 6;
      const maxX = Math.max(target.x, target.x + target.width) + 6;
      const minY = Math.min(target.y, target.y + target.height) - 6;
      const maxY = Math.max(target.y, target.y + target.height) + 6;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        return target;
      }
    }
    return null;
  };

  return checkList(nonFrames) ?? checkList(frames);
}

function renderMentionText(text: string) {
  const parts = text.split(/(@[a-zA-Z0-9_.-]+)/g);
  return parts.map((part, idx) =>
    part.startsWith("@") && part.length > 1 ? (
      <span key={idx} className="comment-mention">
        {part}
      </span>
    ) : (
      <span key={idx}>{part}</span>
    ),
  );
}

export function CommentOverlay({
  doc,
  apiRef,
  apiReady,
  threads,
  currentAuthor,
  peerNames,
  visible,
  placingMode,
  onDonePlacing,
  activeThreadId,
  onSelectThread,
  seenMap,
  onMarkSeen,
}: Props) {
  const [, setTick] = useState(0);
  const [draft, setDraft] = useState<DraftAnchor | null>(null);
  const [draftText, setDraftText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [openPickerMsgId, setOpenPickerMsgId] = useState<string | null>(null);
  const lastKnownPosRef = useRef(new Map<string, { x: number; y: number }>());

  // Recompute overlay positions whenever viewport scrolls/zooms or elements move.
  useEffect(() => {
    const api = apiRef.current;
    if (!apiReady || !api) return;
    const bump = () => setTick((n) => (n + 1) % 1000000);
    const unsubScroll = api.onScrollChange(bump);
    const unsubChange = api.onChange(bump);
    return () => {
      unsubScroll();
      unsubChange();
    };
  }, [apiRef, apiReady]);

  // Mark active thread seen when opened or when new replies arrive while open.
  useEffect(() => {
    if (!activeThreadId) return;
    const t = threads.find((item) => item.id === activeThreadId);
    const lastAt = t?.messages[t.messages.length - 1]?.at ?? Date.now();
    if ((seenMap[activeThreadId] ?? 0) < lastAt) {
      onMarkSeen(activeThreadId, lastAt);
    }
  }, [activeThreadId, threads, seenMap, onMarkSeen]);

  const mentionCandidates = useMemo(() => {
    const set = new Set<string>();
    for (const p of peerNames) if (p.trim()) set.add(p.trim());
    for (const t of threads) {
      if (t.author.trim()) set.add(t.author.trim());
      for (const m of t.messages) if (m.author.trim()) set.add(m.author.trim());
    }
    set.delete(currentAuthor.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [peerNames, threads, currentAuthor]);

  const activeThread = useMemo(
    () => (activeThreadId ? threads.find((t) => t.id === activeThreadId) ?? null : null),
    [activeThreadId, threads],
  );

  const elementMap = useMemo(() => {
    const map = new Map<string, ExcalidrawElement>();
    const api = apiRef.current;
    if (!api) return map;
    for (const el of api.getSceneElements()) {
      if (!el.isDeleted) map.set(el.id, el);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRef, apiReady, threads, setTick]);

  // Keep fallback scene coords synced when an attached element was moved before deletion.
  const resolveAnchor = useCallback(
    (t: CommentThread): { sceneX: number; sceneY: number; elementRemoved: boolean } => {
      if (t.elementId) {
        const el = apiRef.current?.getSceneElements().find((item) => item.id === t.elementId && !item.isDeleted);
        if (el) {
          const sx = el.x + (t.offsetX ?? el.width / 2);
          const sy = el.y + (t.offsetY ?? 0);
          lastKnownPosRef.current.set(t.id, { x: sx, y: sy });
          return { sceneX: sx, sceneY: sy, elementRemoved: false };
        }
        const cached = lastKnownPosRef.current.get(t.id);
        if (cached && doc && (Math.abs(cached.x - t.x) >= 1 || Math.abs(cached.y - t.y) >= 1)) {
          updateCommentAnchorPos(doc, t.id, cached.x, cached.y);
        }
        return {
          sceneX: cached?.x ?? t.x,
          sceneY: cached?.y ?? t.y,
          elementRemoved: true,
        };
      }
      return { sceneX: t.x, sceneY: t.y, elementRemoved: false };
    },
    [apiRef, doc],
  );

  const sceneToBoardPx = useCallback(
    (sceneX: number, sceneY: number): { left: number; top: number } | null => {
      const api = apiRef.current;
      if (!api) return null;
      const appState = api.getAppState();
      const vp = sceneCoordsToViewportCoords({ sceneX, sceneY }, appState);
      return {
        left: vp.x - appState.offsetLeft,
        top: vp.y - appState.offsetTop,
      };
    },
    [apiRef],
  );

  const handlePlaceClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!placingMode || !apiRef.current) return;
    if ((e.target as HTMLElement).closest(".comment-popover, .comments-placing-banner")) return;
    const appState = apiRef.current.getAppState();
    const scene = viewportCoordsToSceneCoords(
      { clientX: e.clientX, clientY: e.clientY },
      appState,
    );
    const hit = hitTestElement(apiRef.current.getSceneElements(), scene.x, scene.y);
    setDraft({
      x: scene.x,
      y: scene.y,
      elementId: hit ? hit.id : null,
      offsetX: hit ? scene.x - hit.x : null,
      offsetY: hit ? scene.y - hit.y : null,
    });
    setDraftText("");
    onDonePlacing();
    onSelectThread(null);
  };

  const submitDraft = () => {
    if (!doc || !draft) return;
    const id = createCommentThread(doc, {
      elementId: draft.elementId,
      x: draft.x,
      y: draft.y,
      offsetX: draft.offsetX,
      offsetY: draft.offsetY,
      author: currentAuthor,
      text: draftText,
    });
    setDraft(null);
    setDraftText("");
    if (id) {
      onMarkSeen(id, Date.now());
      onSelectThread(id);
    }
  };

  const submitReply = () => {
    if (!doc || !activeThread) return;
    const msgId = addCommentReply(doc, activeThread.id, {
      author: currentAuthor,
      text: replyText,
    });
    if (msgId) {
      setReplyText("");
      onMarkSeen(activeThread.id, Date.now());
    }
  };

  if (!apiReady) return null;
  if (!visible && !placingMode && !draft && !activeThread) return null;

  const appState = apiRef.current?.getAppState();
  const boardW = appState?.width ?? 900;
  const boardH = appState?.height ?? 600;

  const clampPopover = (px: { left: number; top: number }) => ({
    left: Math.max(12, Math.min(boardW - 326, px.left + 14)),
    top: Math.max(12, Math.min(boardH - 360, px.top - 24)),
  });

  const activeAnchor = activeThread ? resolveAnchor(activeThread) : null;
  const activePx = activeAnchor ? sceneToBoardPx(activeAnchor.sceneX, activeAnchor.sceneY) : null;
  const draftPx = draft ? sceneToBoardPx(draft.x, draft.y) : null;

  return (
    <div
      className={`comments-overlay${placingMode ? " placing" : ""}`}
      onClick={handlePlaceClick}
    >
      {placingMode && (
        <div className="comments-placing-banner">
          <span>Click on canvas or any element to drop a comment pin</span>
          <button type="button" className="comment-mini-btn" onClick={onDonePlacing}>
            Cancel (Esc)
          </button>
        </div>
      )}

      {(visible || activeThread) &&
        threads.map((thread) => {
          const anchor = resolveAnchor(thread);
          const pos = sceneToBoardPx(anchor.sceneX, anchor.sceneY);
          if (!pos) return null;
          if (pos.left < -40 || pos.top < -40 || pos.left > boardW + 40 || pos.top > boardH + 40) {
            return null;
          }
          const unread = isThreadUnread(thread, seenMap[thread.id] ?? 0, currentAuthor);
          const isActive = thread.id === activeThreadId;
          return (
            <button
              key={thread.id}
              type="button"
              className={`comment-pin${thread.resolved ? " resolved" : ""}${isActive ? " active" : ""}`}
              style={{ left: pos.left, top: pos.top }}
              title={`${thread.author}: ${thread.messages[0]?.text ?? ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setDraft(null);
                onSelectThread(isActive ? null : thread.id);
              }}
            >
              <span>{initials(thread.author)}</span>
              {unread && <span className="comment-pin-unread" />}
            </button>
          );
        })}

      {draft && draftPx && (
        <div
          className="comment-popover"
          style={clampPopover(draftPx)}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="comment-popover-head">
            <span className="comment-popover-title">
              New comment{draft.elementId ? " (attached)" : ""}
            </span>
            <button type="button" className="comment-mini-btn" onClick={() => setDraft(null)}>
              ✕
            </button>
          </div>
          <MentionComposer
            value={draftText}
            onChange={setDraftText}
            onSubmit={submitDraft}
            onCancel={() => setDraft(null)}
            candidates={mentionCandidates}
            placeholder="Write a comment… (@ to mention, Enter to post)"
            submitLabel="Post"
            autoFocus
          />
        </div>
      )}

      {activeThread && activeAnchor && activePx && (
        <div
          className="comment-popover"
          style={clampPopover(activePx)}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="comment-popover-head">
            <div className="comment-popover-title">
              <span>{activeThread.author}</span>
              {(activeAnchor.elementRemoved ||
                (activeThread.elementId && !elementMap.has(activeThread.elementId))) && (
                <span className="comment-removed-tag">element removed</span>
              )}
            </div>
            <div className="comment-popover-actions">
              <button
                type="button"
                className="comment-mini-btn"
                onClick={() => doc && setCommentResolved(doc, activeThread.id, !activeThread.resolved)}
              >
                {activeThread.resolved ? "Reopen" : "Resolve"}
              </button>
              <button type="button" className="comment-mini-btn" onClick={() => onSelectThread(null)}>
                ✕
              </button>
            </div>
          </div>

          <div className="comment-messages">
            {activeThread.messages.map((msg) => {
              const entries = Object.entries(msg.reactions).filter(([, list]) => list.length > 0);
              return (
                <div key={msg.id} className="comment-msg">
                  <div className="comment-msg-meta">
                    <span className="comment-msg-author">{msg.author}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="comment-msg-time">{formatTime(msg.at)}</span>
                      {msg.author === currentAuthor && doc && (
                        <button
                          type="button"
                          className="comment-mini-btn"
                          title="Delete your message"
                          onClick={() =>
                            deleteCommentMessage(doc, activeThread.id, msg.id, currentAuthor)
                          }
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="comment-msg-body">{renderMentionText(msg.text)}</div>
                  <div className="comment-msg-reactions">
                    {entries.map(([emoji, authors]) => {
                      const mine = authors.includes(currentAuthor);
                      return (
                        <button
                          key={emoji}
                          type="button"
                          className={`comment-reaction-chip${mine ? " mine" : ""}`}
                          title={authors.join(", ")}
                          onClick={() =>
                            doc &&
                            toggleCommentReaction(doc, activeThread.id, msg.id, emoji, currentAuthor)
                          }
                        >
                          <span>{emoji}</span>
                          <span>{authors.length}</span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="comment-reaction-add"
                      title="React"
                      onClick={() =>
                        setOpenPickerMsgId((cur) => (cur === msg.id ? null : msg.id))
                      }
                    >
                      +😊
                    </button>
                  </div>
                  {openPickerMsgId === msg.id && (
                    <div className="comment-reaction-picker">
                      {COMMENT_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            if (doc) {
                              toggleCommentReaction(
                                doc,
                                activeThread.id,
                                msg.id,
                                emoji,
                                currentAuthor,
                              );
                            }
                            setOpenPickerMsgId(null);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <MentionComposer
            value={replyText}
            onChange={setReplyText}
            onSubmit={submitReply}
            onCancel={() => onSelectThread(null)}
            candidates={mentionCandidates}
            placeholder="Reply… (@ to mention, Enter to send)"
            submitLabel="Reply"
          />
        </div>
      )}
    </div>
  );
}

function MentionComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  candidates,
  placeholder,
  submitLabel,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  candidates: string[];
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
}) {
  const match = /(?:^|\s)@([a-zA-Z0-9_.-]*)$/.exec(value);
  const query = match ? match[1].toLowerCase() : null;
  const filtered =
    query !== null
      ? candidates.filter((c) => c.toLowerCase().includes(query)).slice(0, 6)
      : [];

  const insertMention = (name: string) => {
    const token = name.replace(/\s+/g, "_");
    const next = value.replace(/@([a-zA-Z0-9_.-]*)$/, `@${token} `);
    onChange(next);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === "Tab" && filtered.length > 0) {
      e.preventDefault();
      insertMention(filtered[0]);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSubmit();
    }
  };

  return (
    <div className="comment-composer">
      {filtered.length > 0 && (
        <div className="comment-mention-menu">
          {filtered.map((name) => (
            <button
              key={name}
              type="button"
              className="comment-mention-item"
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(name);
              }}
            >
              @{name.replace(/\s+/g, "_")} ({name})
            </button>
          ))}
        </div>
      )}
      <textarea
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <button
          type="button"
          className="btn primary"
          style={{ padding: "3px 10px", fontSize: 11 }}
          disabled={!value.trim()}
          onClick={onSubmit}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
