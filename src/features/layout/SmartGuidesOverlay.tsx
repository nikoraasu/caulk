import React, { useCallback, useEffect, useState, type MutableRefObject } from "react";
import { sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "./smartGuides.css";

type Props = {
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
};

export const SmartGuidesOverlay: React.FC<Props> = ({ apiRef }) => {
  const [, setTick] = useState(0);

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

  // Check if dragging or moving elements
  const selectedIds = new Set(
    Object.entries(appState.selectedElementIds || {})
      .filter(([, selected]) => Boolean(selected))
      .map(([id]) => id),
  );

  if (selectedIds.size === 0 || (!appState.selectedElementsAreBeingDragged && !appState.editingTextElement)) {
    // Only active during interaction/dragging
  }

  const draggingElements = elements.filter((el) => selectedIds.has(el.id) && !el.isDeleted);
  if (draggingElements.length === 0) return null;

  const dragMinX = Math.min(...draggingElements.map((el) => el.x));
  const dragMaxX = Math.max(...draggingElements.map((el) => el.x + el.width));
  const dragCenterX = (dragMinX + dragMaxX) / 2;

  const dragMinY = Math.min(...draggingElements.map((el) => el.y));
  const dragMaxY = Math.max(...draggingElements.map((el) => el.y + el.height));
  const dragCenterY = (dragMinY + dragMaxY) / 2;

  const otherElements = elements.filter((el) => !selectedIds.has(el.id) && !el.isDeleted && el.type !== "arrow");
  if (otherElements.length === 0) return null;

  const SNAP_THRESHOLD = 5; // pixels
  const activeVGuides: number[] = [];
  const activeHGuides: number[] = [];

  for (const other of otherElements) {
    const oLeft = other.x;
    const oRight = other.x + other.width;
    const oCenterX = (oLeft + oRight) / 2;

    const oTop = other.y;
    const oBottom = other.y + other.height;
    const oCenterY = (oTop + oBottom) / 2;

    // Check vertical alignments
    if (Math.abs(dragMinX - oLeft) <= SNAP_THRESHOLD) activeVGuides.push(oLeft);
    else if (Math.abs(dragCenterX - oCenterX) <= SNAP_THRESHOLD) activeVGuides.push(oCenterX);
    else if (Math.abs(dragMaxX - oRight) <= SNAP_THRESHOLD) activeVGuides.push(oRight);

    // Check horizontal alignments
    if (Math.abs(dragMinY - oTop) <= SNAP_THRESHOLD) activeHGuides.push(oTop);
    else if (Math.abs(dragCenterY - oCenterY) <= SNAP_THRESHOLD) activeHGuides.push(oCenterY);
    else if (Math.abs(dragMaxY - oBottom) <= SNAP_THRESHOLD) activeHGuides.push(oBottom);
  }

  // Deduplicate guides within 2px
  const uniqueV = activeVGuides.filter((v, i, arr) => arr.findIndex((x) => Math.abs(x - v) < 2) === i);
  const uniqueH = activeHGuides.filter((h, i, arr) => arr.findIndex((x) => Math.abs(x - h) < 2) === i);

  if (uniqueV.length === 0 && uniqueH.length === 0) return null;

  return (
    <div className="caulk-smart-guides-overlay">
      {uniqueV.map((sceneX, idx) => {
        const screenPt = toOverlayXY(sceneX, 0);
        return (
          <div
            key={`v-${idx}`}
            className="caulk-guide-v-line"
            style={{ left: Math.round(screenPt.x) }}
          />
        );
      })}

      {uniqueH.map((sceneY, idx) => {
        const screenPt = toOverlayXY(0, sceneY);
        return (
          <div
            key={`h-${idx}`}
            className="caulk-guide-h-line"
            style={{ top: Math.round(screenPt.y) }}
          />
        );
      })}
    </div>
  );
};
