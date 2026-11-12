import {
  useCallback,
  useEffect,
  useState,
  type MutableRefObject,
} from "react";
import {
  sceneCoordsToViewportCoords,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { findStickyItems, getTagColor } from "./store";
import "./tags.css";

type Props = {
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  apiReady: boolean;
  activeTagFilter: string | null;
  showTags?: boolean;
  onSelectTagFilter: (tag: string | null) => void;
  onAddTag: (elementId: string, tag: string) => void;
  onRemoveTag: (elementId: string, tag: string) => void;
  onUnlinkTask?: (elementId: string) => void;
};

export function TagsOverlay({
  apiRef,
  apiReady,
  activeTagFilter,
  showTags = true,
  onSelectTagFilter,
  onAddTag,
  onRemoveTag,
  onUnlinkTask,
}: Props) {
  const [, setTick] = useState(0);
  const [addingTagForId, setAddingTagForId] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState("");

  // Recompute positions on camera scroll/zoom or scene changes
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

  const api = apiRef.current;
  const appState = api?.getAppState();
  const elements = api?.getSceneElements() ?? [];

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

  if (!api || !appState) return null;

  const stickyItems = findStickyItems(elements);
  const selectedIds = appState.selectedElementIds ?? {};

  // Count matches for active tag filter
  const filterMatchesCount = activeTagFilter
    ? stickyItems.filter((it) =>
        it.tags.some((t) => t.toLowerCase() === activeTagFilter.toLowerCase()),
      ).length
    : 0;

  const handleCreateTag = (elId: string) => {
    if (newTagInput.trim()) {
      onAddTag(elId, newTagInput.trim());
      setNewTagInput("");
      setAddingTagForId(null);
    }
  };

  return (
    <div className="tags-overlay">
      {/* Floating Tag Filter Bar if a tag filter is active */}
      {activeTagFilter && (
        <div className="tag-filter-bar">
          <span className="tag-filter-title">
            <span>🏷️ Filter:</span>
          </span>
          <span
            className="tag-filter-badge"
            style={{
              backgroundColor: getTagColor(activeTagFilter).bg,
              color: getTagColor(activeTagFilter).text,
              border: `1px solid ${getTagColor(activeTagFilter).border}`,
            }}
          >
            #{activeTagFilter} ({filterMatchesCount} {filterMatchesCount === 1 ? "note" : "notes"})
          </span>
          <button
            type="button"
            className="tag-filter-clear-btn"
            onClick={() => onSelectTagFilter(null)}
            title="Clear tag filter"
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* Render Tag Badges on Each Sticky Note */}
      {stickyItems.map((item) => {
        const isSelected = Boolean(selectedIds[item.container.id]);
        const isHovered = Boolean(
          (appState.hoveredElementIds as Record<string, boolean> | undefined)?.[item.container.id],
        );
        const taskKey = (item.container.customData as Record<string, unknown> | undefined)?.taskKey as string | undefined;
        const hasTask = Boolean(taskKey);
        const hasTags = item.tags.length > 0;
        if (!hasTags && !isSelected && !hasTask) return null;

        const isMatchingFilter = activeTagFilter
          ? item.tags.some((t) => t.toLowerCase() === activeTagFilter.toLowerCase())
          : false;

        // If tags are toggled off, hide unless explicitly matching active tag filter
        if (!showTags && !isMatchingFilter) {
          return null;
        }

        const zoom = appState.zoom?.value ?? 1;

        // When zoomed far out (zoom < 0.4), hide unless actively selected, hovered, or matching filter
        if (zoom < 0.4 && !isSelected && !isHovered && !isMatchingFilter) {
          return null;
        }

        // Position at top-left edge of note: 8px from left, 10px below top
        const pos = toOverlayXY(item.x + 8, item.y + 10);
        if (!pos) return null;

        const isAddingHere = addingTagForId === item.container.id;

        return (
          <div
            key={`tags-${item.container.id}`}
            className="element-tags-strip"
            style={{
              left: `${pos.x}px`,
              top: `${pos.y}px`,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              maxWidth: `${Math.max(100, item.width - 16)}px`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {taskKey && (
              <span
                className="element-tag-badge task-link-badge"
                style={{
                  backgroundColor: "#2b3a42",
                  color: "#ffffff",
                  borderColor: "#3182ce",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
                title={`Linked to Task ${taskKey} - ${isSelected ? "click ✕ to unlink" : ""}`}
              >
                <span>📋 {taskKey}</span>
                {isSelected && onUnlinkTask && (
                  <span
                    className="tag-remove-x"
                    title="Remove/Unlink task from this sticky note"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnlinkTask(item.container.id);
                    }}
                  >
                    ✕
                  </span>
                )}
              </span>
            )}
            {item.tags.map((tag) => {
              const col = getTagColor(tag);
              const isCurrentFilter =
                activeTagFilter?.toLowerCase() === tag.toLowerCase();

              return (
                <span
                  key={tag}
                  className={`element-tag-badge${isCurrentFilter ? " active-filter" : ""}`}
                  style={{
                    backgroundColor: col.bg,
                    color: col.text,
                    borderColor: col.border,
                  }}
                  title={`Filter board by #${tag}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTagFilter(isCurrentFilter ? null : tag);
                  }}
                >
                  #{tag}
                  {isSelected && (
                    <span
                      className="tag-remove-x"
                      title="Remove tag"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveTag(item.container.id, tag);
                      }}
                    >
                      ✕
                    </span>
                  )}
                </span>
              );
            })}

            {/* Quick Add Tag button when note is selected */}
            {isSelected && !isAddingHere && (
              <button
                type="button"
                className="element-add-tag-btn"
                title="Add tag to note"
                onClick={(e) => {
                  e.stopPropagation();
                  setAddingTagForId(item.container.id);
                }}
              >
                +
              </button>
            )}

            {/* Quick inline tag input */}
            {isAddingHere && (
              <div
                style={{
                  display: "inline-flex",
                  gap: 3,
                  alignItems: "center",
                  background: "var(--vgui-bg, #ece9d8)",
                  padding: "2px 4px",
                  borderRadius: 6,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  autoFocus
                  placeholder="tag..."
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateTag(item.container.id);
                    if (e.key === "Escape") setAddingTagForId(null);
                  }}
                  style={{
                    width: 70,
                    fontSize: 10,
                    padding: "1px 4px",
                    borderRadius: 3,
                    border: "1px solid #999",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleCreateTag(item.container.id)}
                  style={{
                    fontSize: 10,
                    padding: "1px 5px",
                    background: "var(--vgui-accent, #978730)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 3,
                    cursor: "pointer",
                  }}
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => setAddingTagForId(null)}
                  style={{
                    fontSize: 10,
                    padding: "1px 3px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
