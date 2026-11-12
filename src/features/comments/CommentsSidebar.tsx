import { useMemo, useState, type MutableRefObject } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { isThreadUnread, threadMentionsAuthor, type CommentThread } from "./store";
import "./comments.css";

type Filter = "open" | "resolved" | "mentions" | "all";

type Props = {
  threads: CommentThread[];
  currentAuthor: string;
  activeThreadId: string | null;
  seenMap: Record<string, number>;
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  onSelectThread: (id: string) => void;
  onStartAdding: () => void;
};

export function CommentsSidebar({
  threads,
  currentAuthor,
  activeThreadId,
  seenMap,
  apiRef,
  onSelectThread,
  onStartAdding,
}: Props) {
  const [filter, setFilter] = useState<Filter>("open");

  const filtered = useMemo(() => {
    return threads.filter((t) => {
      if (filter === "open") return !t.resolved;
      if (filter === "resolved") return t.resolved;
      if (filter === "mentions") return threadMentionsAuthor(t, currentAuthor);
      return true;
    });
  }, [threads, filter, currentAuthor]);

  const jumpToThread = (thread: CommentThread) => {
    const api = apiRef.current;
    if (api) {
      let sx = thread.x;
      let sy = thread.y;
      if (thread.elementId) {
        const el = api.getSceneElements().find((item) => item.id === thread.elementId && !item.isDeleted);
        if (el) {
          sx = el.x + (thread.offsetX ?? el.width / 2);
          sy = el.y + (thread.offsetY ?? 0);
        }
      }
      const appState = api.getAppState();
      const zoom = appState.zoom.value || 1;
      api.updateScene({
        appState: {
          scrollX: appState.width / (2 * zoom) - sx,
          scrollY: appState.height / (2 * zoom) - sy,
        },
      });
    }
    onSelectThread(thread.id);
  };

  return (
    <div className="comments-sidebar-body">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{filtered.length} thread(s)</span>
        <button type="button" className="btn primary" style={{ padding: "3px 8px", fontSize: 11 }} onClick={onStartAdding}>
          + Drop pin (C)
        </button>
      </div>

      <div className="comments-filters">
        {(
          [
            ["open", "Open"],
            ["resolved", "Resolved"],
            ["mentions", "Mentions me"],
            ["all", "All"],
          ] as Array<[Filter, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`comments-filter-btn${filter === key ? " active" : ""}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="comments-sidebar-list">
        {filtered.length === 0 ? (
          <p className="muted" style={{ marginTop: 12 }}>
            No threads match this filter.
          </p>
        ) : (
          filtered.map((t) => {
            const first = t.messages[0];
            const unread = isThreadUnread(t, seenMap[t.id] ?? 0, currentAuthor);
            const elementMissing =
              Boolean(t.elementId) &&
              !apiRef.current?.getSceneElements().some((el) => el.id === t.elementId && !el.isDeleted);

            return (
              <button
                key={t.id}
                type="button"
                className={`comments-sidebar-item${t.id === activeThreadId ? " active" : ""}`}
                onClick={() => jumpToThread(t)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ fontWeight: 700 }}>
                    {t.author}
                    {unread ? " • unread" : ""}
                  </span>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {t.messages.length} {t.messages.length === 1 ? "reply" : "replies"}
                    {t.resolved ? " · resolved" : ""}
                  </span>
                </div>
                {elementMissing && (
                  <span className="comment-removed-tag" style={{ alignSelf: "flex-start" }}>
                    element removed
                  </span>
                )}
                <div style={{ opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {first?.text ?? ""}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
