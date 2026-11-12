import React, { useState, useMemo } from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "./frameNavigator.css";

type Props = {
  frames: readonly ExcalidrawElement[];
  allElements: readonly ExcalidrawElement[];
  onSelectFrame: (frame: ExcalidrawElement) => void;
  onAddFrame: () => void;
  onRenameFrame: (frameId: string, newName: string) => void;
  isOpen: boolean;
  onClose: () => void;
};

export const FrameNavigator: React.FC<Props> = ({
  frames,
  allElements,
  onSelectFrame,
  onAddFrame,
  onRenameFrame,
  isOpen,
  onClose,
}) => {
  const [search, setSearch] = useState("");
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const activeFrames = useMemo(() => {
    return frames.filter((f) => !f.isDeleted);
  }, [frames]);

  // Count children inside each frame
  const frameChildCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const nonDeleted = allElements.filter(
      (el) => !el.isDeleted && el.type !== "frame" && el.type !== "magicframe",
    );

    for (const frame of activeFrames) {
      let count = 0;
      const fx = frame.x;
      const fy = frame.y;
      const fw = frame.width;
      const fh = frame.height;

      for (const el of nonDeleted) {
        if (el.frameId === frame.id) {
          count++;
          continue;
        }
        // Fallback: check bounding box intersection if frameId isn't set yet
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        if (cx >= fx && cx <= fx + fw && cy >= fy && cy <= fy + fh) {
          count++;
        }
      }
      counts.set(frame.id, count);
    }
    return counts;
  }, [activeFrames, allElements]);

  const filteredFrames = useMemo(() => {
    if (!search.trim()) return activeFrames;
    const q = search.toLowerCase();
    return activeFrames.filter((f) => {
      const name = (
        (f as any).name ||
        (f.customData as Record<string, unknown> | undefined)?.frameTitle ||
        "Frame"
      ).toString().toLowerCase();
      return name.includes(q);
    });
  }, [activeFrames, search]);

  if (!isOpen) return null;

  const startEditing = (frame: ExcalidrawElement, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFrameId(frame.id);
    const currentName =
      (frame as any).name ||
      (frame.customData as Record<string, unknown> | undefined)?.frameTitle ||
      "Frame";
    setEditName(String(currentName));
  };

  const saveEditing = (frameId: string) => {
    if (editName.trim()) {
      onRenameFrame(frameId, editName.trim());
    }
    setEditingFrameId(null);
  };

  return (
    <div className="caulk-frame-navigator-drawer">
      <div className="caulk-frame-navigator-header">
        <div className="caulk-frame-navigator-title">
          <span>📐</span>
          <span>OUTLINE // FRAMES</span>
        </div>
        <button
          type="button"
          className="caulk-frame-navigator-close"
          onClick={onClose}
          title="Close Outline Drawer"
        >
          ✕
        </button>
      </div>

      <div className="caulk-frame-navigator-toolbar">
        <input
          type="text"
          className="caulk-frame-search-input"
          placeholder="Filter frames…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          className="caulk-frame-add-btn"
          onClick={onAddFrame}
          title="Draw or insert frame (F)"
        >
          <span>+ Frame</span>
        </button>
      </div>

      <div className="caulk-frame-list">
        {filteredFrames.length === 0 ? (
          <div className="caulk-frame-empty-state">
            <span>No frames found on this board.</span>
            <button
              type="button"
              className="caulk-frame-add-btn"
              onClick={onAddFrame}
            >
              + Create First Frame (F)
            </button>
          </div>
        ) : (
          filteredFrames.map((frame, index) => {
            const frameName =
              (frame as any).name ||
              (frame.customData as Record<string, unknown> | undefined)?.frameTitle ||
              `Frame ${index + 1}`;
            const childCount = frameChildCounts.get(frame.id) || 0;
            const isEditing = editingFrameId === frame.id;

            return (
              <div
                key={frame.id}
                className="caulk-frame-item"
                onClick={() => onSelectFrame(frame)}
                title={`Jump to ${frameName}`}
              >
                <div className="caulk-frame-item-left">
                  <span className="caulk-frame-index-badge">#{index + 1}</span>
                  {isEditing ? (
                    <input
                      type="text"
                      className="caulk-frame-search-input"
                      style={{ fontSize: 11, padding: "1px 4px" }}
                      value={editName}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => saveEditing(frame.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEditing(frame.id);
                        if (e.key === "Escape") setEditingFrameId(null);
                      }}
                    />
                  ) : (
                    <span
                      className="caulk-frame-name-text"
                      onDoubleClick={(e) => startEditing(frame, e)}
                    >
                      {frameName}
                    </span>
                  )}
                </div>

                <div className="caulk-frame-item-right">
                  <span className="caulk-frame-child-count">
                    {childCount} {childCount === 1 ? "item" : "items"}
                  </span>
                  {!isEditing && (
                    <button
                      type="button"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--vgui-muted, #d0d8cc)",
                        cursor: "pointer",
                        padding: "0 2px",
                        fontSize: 10,
                      }}
                      title="Rename frame"
                      onClick={(e) => startEditing(frame, e)}
                    >
                      ✎
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
