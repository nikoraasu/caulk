import { useState } from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  aiClusterExisting,
  clusterByColor,
  clusterByTag,
  findStickyItems,
  tidyGrid,
} from "./store";
import { aiClusterStickies, getStoredConfig } from "../../ai";
import "./tags.css";

type Props = {
  allElements: readonly ExcalidrawElement[];
  selectedElementIds: Record<string, boolean>;
  onApply: (updatedElements: ExcalidrawElement[], newFrames?: ExcalidrawElement[]) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
};

type ClusterMode = "tag" | "color" | "tidy" | "ai";

export function ClusterModal({
  allElements,
  selectedElementIds,
  onApply,
  onClose,
  onToast,
}: Props) {
  const allStickyItems = findStickyItems(allElements);
  const selectedStickyItems = allStickyItems.filter(
    (it) => selectedElementIds[it.container.id],
  );

  const hasSelection = selectedStickyItems.length >= 2;
  const [scope, setScope] = useState<"selected" | "all">(
    hasSelection ? "selected" : "all",
  );
  const [mode, setMode] = useState<ClusterMode>("tag");
  const [columns, setColumns] = useState(2);
  const [wrapFrames, setWrapFrames] = useState(true);
  const [loading, setLoading] = useState(false);

  const targetItems = scope === "selected" ? selectedStickyItems : allStickyItems;
  const canRunAI = Boolean(getStoredConfig().apiKey);

  const handleExecute = async () => {
    if (targetItems.length === 0) {
      onToast("No sticky notes found to cluster.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "tidy") {
        const res = tidyGrid(targetItems, { columnsPerGroup: columns });
        onApply(res.updatedElements);
        onToast(`✓ Cleaned up ${targetItems.length} notes into a tidy grid!`);
        onClose();
        return;
      }

      if (mode === "tag") {
        const res = clusterByTag(targetItems, {
          columnsPerGroup: columns,
          createFrames: wrapFrames,
        });
        onApply(res.updatedElements, res.newFrames);
        onToast(`✓ Clustered ${targetItems.length} notes by tag into ${res.newFrames.length} groups!`);
        onClose();
        return;
      }

      if (mode === "color") {
        const res = clusterByColor(targetItems, {
          columnsPerGroup: columns,
          createFrames: wrapFrames,
        });
        onApply(res.updatedElements, res.newFrames);
        onToast(`✓ Clustered ${targetItems.length} notes by color into ${res.newFrames.length} groups!`);
        onClose();
        return;
      }

      if (mode === "ai") {
        const texts = targetItems.map((it) => it.text).filter((t) => t.trim().length > 0);
        if (texts.length === 0) {
          throw new Error("Sticky notes must contain text for AI clustering.");
        }

        const clusters = await aiClusterStickies(texts);
        if (clusters.length === 0) {
          throw new Error("AI was unable to find distinct categories.");
        }

        const res = aiClusterExisting(targetItems, clusters, {
          columnsPerGroup: columns,
          createFrames: wrapFrames,
        });
        onApply(res.updatedElements, res.newFrames);
        onToast(`✓ AI organized ${targetItems.length} notes into ${res.newFrames.length} thematic groups!`);
        onClose();
        return;
      }
    } catch (err: any) {
      onToast(`Error clustering notes: ${err?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="vgui-modal-overlay" onClick={onClose}>
      <div
        className="vgui-window"
        style={{ width: 540 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Cluster Stickies"
      >
        <div className="vgui-titlebar">
          <span className="vgui-titlebar-text">🏷️ Cluster & Organize Stickies</span>
          <button type="button" className="vgui-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="vgui-content" style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: 13, color: "var(--ink)", marginBottom: 12 }}>
            Organize messy sticky notes into tidy columns and framed categories.
          </div>

          {/* Scope Selector */}
          {hasSelection && (
            <div style={{ display: "flex", gap: 16, marginBottom: 14, fontSize: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "selected"}
                  onChange={() => setScope("selected")}
                />
                <strong>Selected notes only ({selectedStickyItems.length})</strong>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                />
                <span>All board notes ({allStickyItems.length})</span>
              </label>
            </div>
          )}

          {/* Clustering Modes Grid */}
          <div className="cluster-modal-grid">
            <div
              className={`cluster-option-card${mode === "tag" ? " selected" : ""}`}
              onClick={() => setMode("tag")}
            >
              <div className="cluster-card-title">
                <span>🏷️</span>
                <span>Cluster by Tag</span>
              </div>
              <div className="cluster-card-desc">
                Groups notes by their #hashtags and tags into labeled columns and frames.
              </div>
            </div>

            <div
              className={`cluster-option-card${mode === "color" ? " selected" : ""}`}
              onClick={() => setMode("color")}
            >
              <div className="cluster-card-title">
                <span>🎨</span>
                <span>Cluster by Color</span>
              </div>
              <div className="cluster-card-desc">
                Organizes stickies by their background color swatch (Gold, Sage, Slate, etc.).
              </div>
            </div>

            <div
              className={`cluster-option-card${mode === "tidy" ? " selected" : ""}`}
              onClick={() => setMode("tidy")}
            >
              <div className="cluster-card-title">
                <span>📐</span>
                <span>Tidy Up Grid</span>
              </div>
              <div className="cluster-card-desc">
                Straightens overlapping scattered notes into a clean, evenly spaced grid.
              </div>
            </div>

            <div
              className={`cluster-option-card${mode === "ai" ? " selected" : ""}`}
              onClick={() => setMode("ai")}
            >
              <div className="cluster-card-title">
                <span>🤖</span>
                <span>AI Smart Cluster</span>
                <span
                  style={{
                    fontSize: 10,
                    marginLeft: "auto",
                    color: canRunAI ? "#16a34a" : "#ca8a04",
                    fontWeight: 600,
                  }}
                >
                  {canRunAI ? "● AI Active" : "● Setup AI"}
                </span>
              </div>
              <div className="cluster-card-desc">
                Uses Gemini to analyze note ideas and group them into thematic categories.
              </div>
            </div>
          </div>

          {/* Additional Options */}
          <div style={{ marginTop: 12 }}>
            <div className="cluster-settings-row">
              <span>Columns per cluster:</span>
              <select
                className="cluster-select"
                value={columns}
                onChange={(e) => setColumns(Number(e.target.value))}
              >
                <option value={1}>1 column (Vertical stack)</option>
                <option value={2}>2 columns (Standard)</option>
                <option value={3}>3 columns (Wide)</option>
                <option value={4}>4 columns</option>
              </select>
            </div>

            {mode !== "tidy" && (
              <div className="cluster-settings-row">
                <label>
                  <input
                    type="checkbox"
                    checked={wrapFrames}
                    onChange={(e) => setWrapFrames(e.target.checked)}
                  />
                  <span>Wrap each category in a dashed frame with title</span>
                </label>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button
              type="button"
              className="vgui-btn"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="vgui-btn primary"
              onClick={handleExecute}
              disabled={loading || targetItems.length === 0}
            >
              {loading ? "Organizing..." : `Organize ${targetItems.length} Notes`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
