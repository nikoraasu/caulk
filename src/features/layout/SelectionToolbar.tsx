import React, { useCallback, useEffect, useState, type MutableRefObject } from "react";
import { sceneCoordsToViewportCoords, CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawElement, OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { SceneBridge } from "../../crdt/scene";
import { alignElements, distributeElements, packGrid, type AlignmentType } from "./align";
import { layoutHierarchy } from "../diagram/hierarchyLayout";
import { soundEngine } from "../../audio/soundEngine";
import "./selectionToolbar.css";

type Props = {
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  bridgeRef: MutableRefObject<SceneBridge | null>;
  onToast: (msg: string) => void;
};

export const SelectionToolbar: React.FC<Props> = ({ apiRef, bridgeRef, onToast }) => {
  const [, setTick] = useState(0);

  // Re-render when camera or selection changes
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    let raf = 0;
    const bump = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setTick((t) => t + 1);
      });
    };
    const u1 = api.onScrollChange(bump);
    const u2 = api.onChange(bump);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      u1();
      u2();
    };
  }, [apiRef]);

  const api = apiRef.current;
  const appState = api?.getAppState();
  const elements = api?.getSceneElements() ?? [];

  const toOverlayXY = useCallback(
    (sceneX: number, sceneY: number) => {
      if (!appState) return { x: 0, y: 0 };
      const pt = sceneCoordsToViewportCoords({ sceneX, sceneY }, appState);
      return {
        x: pt.x - (appState.offsetLeft || 0),
        y: pt.y - (appState.offsetTop || 0),
      };
    },
    [appState],
  );

  if (!appState) return null;

  const selectedIds = new Set(
    Object.entries(appState.selectedElementIds || {})
      .filter(([, selected]) => Boolean(selected))
      .map(([id]) => id),
  );

  // Only show if at least 2 non-deleted elements selected
  const selectedElements = elements.filter((el) => selectedIds.has(el.id) && !el.isDeleted);
  if (selectedElements.length < 2) return null;

  // Compute selection bounding box
  const minX = Math.min(...selectedElements.map((el) => el.x));
  const maxX = Math.max(...selectedElements.map((el) => el.x + el.width));
  const minY = Math.min(...selectedElements.map((el) => el.y));

  const centerX = (minX + maxX) / 2;
  const toolbarPos = toOverlayXY(centerX, minY);

  const applyLayoutUpdate = (nextElements: ExcalidrawElement[], actionLabel: string) => {
    if (!api) return;
    api.updateScene({
      elements: nextElements as unknown as OrderedExcalidrawElement[],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    bridgeRef.current?.applyLocal(nextElements as readonly ExcalidrawElement[]);
    soundEngine.play("click");
    onToast(actionLabel);
  };

  const handleAlign = (alignment: AlignmentType) => {
    const updated = alignElements(elements, selectedIds, alignment);
    applyLayoutUpdate(updated, `Aligned elements ${alignment}`);
  };

  const handleDistribute = (axis: "horizontal" | "vertical") => {
    const updated = distributeElements(elements, selectedIds, axis);
    applyLayoutUpdate(updated, `Distributed elements ${axis}ly`);
  };

  const handlePackGrid = () => {
    const updated = packGrid(elements, selectedIds);
    applyLayoutUpdate(updated, "Packed elements into grid");
  };

  const handleTreeLayout = () => {
    const updated = layoutHierarchy(elements, selectedIds, { direction: "top-to-bottom" });
    applyLayoutUpdate(updated, "🌿 Auto-formatted hierarchy tree");
  };

  return (
    <div className="caulk-selection-toolbar-mount">
      <div
        className="caulk-selection-toolbar"
        style={{
          left: toolbarPos.x,
          top: toolbarPos.y - 40,
          transform: "translateX(-50%)",
        }}
      >
        {/* Horizontal Alignment */}
        <button
          type="button"
          className="caulk-sel-btn"
          title="Align Left"
          onClick={() => handleAlign("left")}
        >
          ⇤
        </button>
        <button
          type="button"
          className="caulk-sel-btn"
          title="Align Center Horizontal"
          onClick={() => handleAlign("center-x")}
        >
          ⇥⇤
        </button>
        <button
          type="button"
          className="caulk-sel-btn"
          title="Align Right"
          onClick={() => handleAlign("right")}
        >
          ⇥
        </button>

        <div className="caulk-sel-sep" />

        {/* Vertical Alignment */}
        <button
          type="button"
          className="caulk-sel-btn"
          title="Align Top"
          onClick={() => handleAlign("top")}
        >
          ⤒
        </button>
        <button
          type="button"
          className="caulk-sel-btn"
          title="Align Center Vertical"
          onClick={() => handleAlign("center-y")}
        >
          ↕
        </button>
        <button
          type="button"
          className="caulk-sel-btn"
          title="Align Bottom"
          onClick={() => handleAlign("bottom")}
        >
          ⤓
        </button>

        <div className="caulk-sel-sep" />

        {/* Distribution */}
        <button
          type="button"
          className="caulk-sel-btn"
          title="Distribute Horizontally"
          onClick={() => handleDistribute("horizontal")}
        >
          ↔
        </button>
        <button
          type="button"
          className="caulk-sel-btn"
          title="Distribute Vertically"
          onClick={() => handleDistribute("vertical")}
        >
          ↕
        </button>

        <div className="caulk-sel-sep" />

        {/* Pack Grid & Auto-Format Tree */}
        <button
          type="button"
          className="caulk-sel-label-btn"
          title="Pack selected elements into neat grid"
          onClick={handlePackGrid}
        >
          <span>▦</span>
          <span>Grid</span>
        </button>

        <button
          type="button"
          className="caulk-sel-label-btn"
          title="Auto-format connected cards into clean hierarchy tree"
          onClick={handleTreeLayout}
        >
          <span>🌿</span>
          <span>Tree</span>
        </button>
      </div>
    </div>
  );
};
