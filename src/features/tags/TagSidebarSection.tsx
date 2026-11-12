import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import {
  findStickyItems,
  getElementTags,
  getTagColor,
  normalizeTag,
} from "./store";
import "./tags.css";

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectedElements: readonly ExcalidrawElement[];
  allElements: readonly ExcalidrawElement[];
  appState: AppState | null;
  onAddTag: (elementIds: string[], tag: string) => void;
  onRemoveTag: (elementIds: string[], tag: string) => void;
  onUnlinkTask?: (elementId: string) => void;
};

export function TagSidebarSection({
  containerRef,
  selectedElements,
  allElements,
  appState,
  onAddTag,
  onRemoveTag,
  onUnlinkTask,
}: Props) {
  const [sidebarMount, setSidebarMount] = useState<HTMLDivElement | null>(null);
  const [tagInput, setTagInput] = useState("");

  const selectedIds = appState?.selectedElementIds ?? {};
  const hasSelected = Object.values(selectedIds).some(Boolean);

  // Filter selected stickies / notes
  const selectedStickies = selectedElements.filter((el) => {
    if (el.isDeleted) return false;
    return (
      (el.type === "rectangle" || el.type === "diamond") &&
      Boolean(el.customData?.isSticky || el.boundElements?.some((b) => b.type === "text"))
    );
  });

  const hasStickies = selectedStickies.length > 0 && hasSelected;

  // Mount/unmount into Excalidraw's left sidebar under the Edges fieldset
  useEffect(() => {
    if (!hasStickies) {
      setSidebarMount((prev) => {
        if (prev?.parentNode) prev.parentNode.removeChild(prev);
        return null;
      });
      const existing = containerRef.current?.querySelectorAll(".caulk-sidebar-tags-mount");
      existing?.forEach((el) => el.parentNode?.removeChild(el));
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const findAndMount = () => {
      const edgesInput = container.querySelector<HTMLInputElement>(
        '.App-menu__left input[name="edges"]'
      );
      const fieldset = edgesInput?.closest("fieldset");
      if (!fieldset) {
        setSidebarMount((prev) => {
          if (prev?.parentNode) prev.parentNode.removeChild(prev);
          return null;
        });
        return;
      }

      let mount = fieldset.querySelector<HTMLDivElement>(".caulk-sidebar-tags-mount");
      if (!mount) {
        mount = document.createElement("div");
        mount.className = "caulk-sidebar-tags-mount";
        fieldset.appendChild(mount);
      }
      setSidebarMount((prev) => (prev === mount ? prev : mount));
    };

    findAndMount();

    const sidebarArea =
      container.querySelector(".App-menu__left") ||
      container.querySelector(".layer-ui__wrapper") ||
      container;
    const observer = new MutationObserver(findAndMount);
    observer.observe(sidebarArea, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      setSidebarMount((prev) => {
        if (prev?.parentNode) prev.parentNode.removeChild(prev);
        return null;
      });
      const existing = container.querySelectorAll(".caulk-sidebar-tags-mount");
      existing.forEach((el) => el.parentNode?.removeChild(el));
    };
  }, [hasStickies, containerRef]);

  if (!hasStickies || !sidebarMount) {
    return null;
  }

  // Collect all unique tags currently on selected notes
  const activeTagsSet = new Set<string>();
  for (const el of selectedStickies) {
    const tags = getElementTags(el);
    for (const t of tags) activeTagsSet.add(t);
  }
  const activeTags = Array.from(activeTagsSet);

  // Collect all board tags for suggestions
  const boardItems = findStickyItems(allElements);
  const allBoardTagsSet = new Set<string>();
  for (const it of boardItems) {
    for (const t of it.tags) allBoardTagsSet.add(t);
  }
  const suggestedTags = Array.from(allBoardTagsSet).filter(
    (t) => !activeTagsSet.has(t),
  );

  const targetIds = selectedStickies.map((s) => s.id);

  const handleAdd = (tagToAdd?: string) => {
    const raw = tagToAdd ?? tagInput;
    const norm = normalizeTag(raw);
    if (!norm) return;
    onAddTag(targetIds, norm);
    setTagInput("");
  };

  return createPortal(
    <div className="caulk-sidebar-tags-panel">
      <div className="caulk-tags-row-head">
        <span>Tags</span>
        <span style={{ fontSize: 10, color: "var(--ink-soft)" }}>
          {selectedStickies.length} {selectedStickies.length === 1 ? "note" : "notes"}
        </span>
      </div>

      <div className="caulk-tags-chips-wrap">
        {activeTags.length === 0 ? (
          <span className="caulk-tags-empty">No tags attached</span>
        ) : (
          activeTags.map((tag) => {
            const col = getTagColor(tag);
            return (
              <span
                key={tag}
                className="element-tag-badge"
                style={{
                  backgroundColor: col.bg,
                  color: col.text,
                  borderColor: col.border,
                }}
              >
                #{tag}
                <span
                  className="tag-remove-x"
                  title="Remove tag from selection"
                  onClick={() => onRemoveTag(targetIds, tag)}
                >
                  ✕
                </span>
              </span>
            );
          })
        )}
      </div>

      <div className="caulk-tag-input-row">
        <input
          type="text"
          placeholder="Add #tag..."
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          className="caulk-tag-input"
        />
        <button
          type="button"
          onClick={() => handleAdd()}
          className="caulk-tag-add-btn"
        >
          Add
        </button>
      </div>

      {suggestedTags.length > 0 && (
        <div className="caulk-suggested-tags">
          <span style={{ fontSize: 10, color: "var(--ink-soft)", width: "100%" }}>
            Suggested:
          </span>
          {suggestedTags.slice(0, 8).map((t) => (
            <button
              key={t}
              type="button"
              className="caulk-suggested-chip"
              onClick={() => handleAdd(t)}
              title={`Add #${t}`}
            >
              +#{t}
            </button>
          ))}
        </div>
      )}

      {selectedStickies.some((s) => (s.customData as any)?.taskId) && onUnlinkTask && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px dashed var(--vgui-border, #ccc)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--vgui-accent, #3182ce)" }}>
            📋 {selectedStickies.map((s) => (s.customData as any)?.taskKey).filter(Boolean).join(", ")}
          </span>
          <button
            type="button"
            className="btn ghost"
            style={{ fontSize: 10, padding: "2px 6px", color: "var(--err, #e53e3e)" }}
            onClick={() => {
              selectedStickies.forEach((s) => {
                if ((s.customData as any)?.taskId) onUnlinkTask(s.id);
              });
            }}
            title="Unlink and remove task from sticky note"
          >
            🗑️ Remove Task
          </button>
        </div>
      )}
    </div>,
    sidebarMount,
  );
}
