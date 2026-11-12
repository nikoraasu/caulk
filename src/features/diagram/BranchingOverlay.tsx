import React, { useCallback, useEffect, useState, type MutableRefObject } from "react";
import {
  sceneCoordsToViewportCoords,
  viewportCoordsToSceneCoords,
  CaptureUpdateAction,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement, OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { sanitizeElement, type SceneBridge } from "../../crdt/scene";
import { soundEngine } from "../../audio/soundEngine";
import "./branching.css";

type Props = {
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  bridgeRef: MutableRefObject<SceneBridge | null>;
  onToast: (msg: string) => void;
};

type Direction = "top" | "right" | "bottom" | "left";

export const BranchingOverlay: React.FC<Props> = ({ apiRef, bridgeRef, onToast }) => {
  const [, setTick] = useState(0);

  // Dragging connection state
  const [draggingAnchor, setDraggingAnchor] = useState<{
    sourceId: string;
    sourceDirection: Direction;
    startX: number;
    startY: number;
  } | null>(null);

  const [currentCursorScene, setCurrentCursorScene] = useState<{ x: number; y: number } | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);

  // Subscribe to Excalidraw camera/scene changes for crisp alignment
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

  const toSceneXY = useCallback(
    (clientX: number, clientY: number) => {
      if (!appState) return { x: 0, y: 0 };
      return viewportCoordsToSceneCoords({ clientX, clientY }, appState);
    },
    [appState],
  );

  // Handle single selection
  const selectedIds = appState ? Object.keys(appState.selectedElementIds || {}) : [];
  const singleSelectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selectedElement = singleSelectedId
    ? elements.find((el) => el.id === singleSelectedId && !el.isDeleted)
    : null;

  // 1. Quick-Branch Click Handler: Spawn adjacent card + bound arrow
  const handleQuickBranch = useCallback(
    (direction: Direction) => {
      if (!selectedElement || !api) return;

      const spacing = 120;
      let nextX = selectedElement.x;
      let nextY = selectedElement.y;

      if (direction === "right") nextX = selectedElement.x + selectedElement.width + spacing;
      else if (direction === "bottom") nextY = selectedElement.y + selectedElement.height + spacing;
      else if (direction === "left") nextX = selectedElement.x - selectedElement.width - spacing;
      else if (direction === "top") nextY = selectedElement.y - selectedElement.height - spacing;

      const newId = `branch-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Create new clone element
      const newElement: ExcalidrawElement = sanitizeElement({
        ...selectedElement,
        id: newId,
        x: Math.round(nextX),
        y: Math.round(nextY),
        seed: Math.floor(Math.random() * 2e9),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2e9),
        boundElements: [],
        updated: Date.now(),
      });

      // Compute start and end points for connector arrow
      let startPoint = { x: selectedElement.x + selectedElement.width / 2, y: selectedElement.y + selectedElement.height / 2 };
      let endPoint = { x: newElement.x + newElement.width / 2, y: newElement.y + newElement.height / 2 };

      if (direction === "right") {
        startPoint = { x: selectedElement.x + selectedElement.width, y: selectedElement.y + selectedElement.height / 2 };
        endPoint = { x: newElement.x, y: newElement.y + newElement.height / 2 };
      } else if (direction === "bottom") {
        startPoint = { x: selectedElement.x + selectedElement.width / 2, y: selectedElement.y + selectedElement.height };
        endPoint = { x: newElement.x + newElement.width / 2, y: newElement.y };
      } else if (direction === "left") {
        startPoint = { x: selectedElement.x, y: selectedElement.y + selectedElement.height / 2 };
        endPoint = { x: newElement.x + newElement.width, y: newElement.y + newElement.height / 2 };
      } else if (direction === "top") {
        startPoint = { x: selectedElement.x + selectedElement.width / 2, y: selectedElement.y };
        endPoint = { x: newElement.x + newElement.width / 2, y: newElement.y + newElement.height };
      }

      const dx = endPoint.x - startPoint.x;
      const dy = endPoint.y - startPoint.y;
      const arrowId = `arrow-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const arrowElement: ExcalidrawElement = sanitizeElement({
        id: arrowId,
        type: "arrow",
        x: startPoint.x,
        y: startPoint.y,
        width: Math.abs(dx),
        height: Math.abs(dy),
        angle: 0,
        strokeColor: "#c59c3a",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: selectedElement.frameId ?? null,
        index: null,
        roundness: { type: 2 },
        seed: Math.floor(Math.random() * 2e9),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2e9),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        points: [[0, 0], [dx, dy]],
        startBinding: {
          elementId: selectedElement.id,
          focus: 0,
          gap: 6,
        },
        endBinding: {
          elementId: newId,
          focus: 0,
          gap: 6,
        },
        lastCommittedPoint: null,
        startArrowhead: null,
        endArrowhead: "arrow",
      });

      // Update boundElements on source and new element
      const updatedSource: ExcalidrawElement = {
        ...selectedElement,
        boundElements: [...(selectedElement.boundElements || []), { id: arrowId, type: "arrow" }],
        version: selectedElement.version + 1,
        versionNonce: Math.floor(Math.random() * 2e9),
      };

      (newElement as any).boundElements = [{ id: arrowId, type: "arrow" }];

      const allUpdated = elements.map((el) => {
        if (el.id === selectedElement.id) return updatedSource;
        return el;
      });

      const nextScene = [...allUpdated, arrowElement, newElement];

      api.updateScene({
        elements: nextScene as unknown as OrderedExcalidrawElement[],
        appState: {
          selectedElementIds: { [newId]: true },
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });

      bridgeRef.current?.applyLocal(nextScene as readonly ExcalidrawElement[]);
      soundEngine.play("create");
      onToast("✨ Quick-branched new connected card");
    },
    [api, bridgeRef, elements, onToast, selectedElement],
  );

  // 2. Interactive Drag Connector Handler
  const handleStartDragConnector = (
    e: React.PointerEvent,
    direction: Direction,
    sourceSceneX: number,
    sourceSceneY: number,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!selectedElement) return;

    setDraggingAnchor({
      sourceId: selectedElement.id,
      sourceDirection: direction,
      startX: sourceSceneX,
      startY: sourceSceneY,
    });
    setCurrentCursorScene({ x: sourceSceneX, y: sourceSceneY });
  };

  useEffect(() => {
    if (!draggingAnchor) return;

    const onPointerMove = (e: PointerEvent) => {
      const scenePt = toSceneXY(e.clientX, e.clientY);
      setCurrentCursorScene(scenePt);

      // Check if cursor is over any other element on the board
      const target = elements.find(
        (el) =>
          !el.isDeleted &&
          el.id !== draggingAnchor.sourceId &&
          el.type !== "arrow" &&
          scenePt.x >= el.x &&
          scenePt.x <= el.x + el.width &&
          scenePt.y >= el.y &&
          scenePt.y <= el.y + el.height,
      );

      setHoveredTargetId(target?.id ?? null);
    };

    const onPointerUp = (e: PointerEvent) => {
      const finalScenePt = toSceneXY(e.clientX, e.clientY);
      const target = elements.find(
        (el) =>
          !el.isDeleted &&
          el.id !== draggingAnchor.sourceId &&
          el.type !== "arrow" &&
          finalScenePt.x >= el.x &&
          finalScenePt.x <= el.x + el.width &&
          finalScenePt.y >= el.y &&
          finalScenePt.y <= el.y + el.height,
      );

      const sourceEl = elements.find((el) => el.id === draggingAnchor.sourceId);

      if (sourceEl && api) {
        const arrowId = `arrow-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const endX = target ? target.x + target.width / 2 : finalScenePt.x;
        const endY = target ? target.y + target.height / 2 : finalScenePt.y;
        const dx = endX - draggingAnchor.startX;
        const dy = endY - draggingAnchor.startY;

        const newArrow: ExcalidrawElement = sanitizeElement({
          id: arrowId,
          type: "arrow",
          x: draggingAnchor.startX,
          y: draggingAnchor.startY,
          width: Math.abs(dx),
          height: Math.abs(dy),
          angle: 0,
          strokeColor: "#c59c3a",
          backgroundColor: "transparent",
          fillStyle: "solid",
          strokeWidth: 2,
          strokeStyle: "solid",
          roughness: 0,
          opacity: 100,
          groupIds: [],
          frameId: sourceEl.frameId ?? null,
          index: null,
          roundness: { type: 2 },
          seed: Math.floor(Math.random() * 2e9),
          version: 1,
          versionNonce: Math.floor(Math.random() * 2e9),
          isDeleted: false,
          boundElements: null,
          updated: Date.now(),
          link: null,
          locked: false,
          points: [[0, 0], [dx, dy]],
          startBinding: {
            elementId: sourceEl.id,
            focus: 0,
            gap: 6,
          },
          endBinding: target
            ? {
                elementId: target.id,
                focus: 0,
                gap: 6,
              }
            : null,
          lastCommittedPoint: null,
          startArrowhead: null,
          endArrowhead: "arrow",
        });

        const nextElements = elements.map((el) => {
          if (el.id === sourceEl.id) {
            return {
              ...el,
              boundElements: [...(el.boundElements || []), { id: arrowId, type: "arrow" }],
              version: el.version + 1,
              versionNonce: Math.floor(Math.random() * 2e9),
            };
          }
          if (target && el.id === target.id) {
            return {
              ...el,
              boundElements: [...(el.boundElements || []), { id: arrowId, type: "arrow" }],
              version: el.version + 1,
              versionNonce: Math.floor(Math.random() * 2e9),
            };
          }
          return el;
        });

        const updatedScene = [...nextElements, newArrow];

        api.updateScene({
          elements: updatedScene as unknown as OrderedExcalidrawElement[],
          appState: {
            selectedElementIds: { [arrowId]: true },
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });

        bridgeRef.current?.applyLocal(updatedScene as readonly ExcalidrawElement[]);
        soundEngine.play("create");
        onToast(target ? `🔗 Connected to @${target.type}` : "➡️ Created connector arrow");
      }

      setDraggingAnchor(null);
      setCurrentCursorScene(null);
      setHoveredTargetId(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [api, bridgeRef, draggingAnchor, elements, onToast, toSceneXY]);

  // Arrow Context Bar for editing arrow style and roundness
  const handleUpdateArrowStyle = (roundnessType: number | null) => {
    if (!selectedElement || selectedElement.type !== "arrow" || !api) return;
    const nextElements = elements.map((el) => {
      if (el.id === selectedElement.id) {
        return {
          ...el,
          roundness: roundnessType ? { type: roundnessType } : null,
          version: el.version + 1,
          versionNonce: Math.floor(Math.random() * 2e9),
        };
      }
      return el;
    });

    api.updateScene({
      elements: nextElements as unknown as OrderedExcalidrawElement[],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    bridgeRef.current?.applyLocal(nextElements as readonly ExcalidrawElement[]);
    soundEngine.play("click");
  };

  // If nothing is selected and not dragging, render nothing
  if (!appState) return null;

  // Render Arrow Context Bar if single arrow selected
  if (selectedElement && selectedElement.type === "arrow" && !selectedElement.isDeleted) {
    const arrowMidX = selectedElement.x + selectedElement.width / 2;
    const arrowMidY = selectedElement.y + selectedElement.height / 2;
    const barPos = toOverlayXY(arrowMidX, arrowMidY);

    return (
      <div className="caulk-branching-overlay">
        <div
          className="caulk-connector-bar"
          style={{
            left: barPos.x,
            top: barPos.y - 36,
            transform: "translateX(-50%)",
          }}
        >
          <span style={{ fontSize: 10, opacity: 0.8, marginRight: 2 }}>CONNECTOR:</span>
          <button
            type="button"
            className={`caulk-connector-btn${!selectedElement.roundness ? " active" : ""}`}
            title="Straight line"
            onClick={() => handleUpdateArrowStyle(null)}
          >
            Straight
          </button>
          <button
            type="button"
            className={`caulk-connector-btn${selectedElement.roundness?.type === 2 ? " active" : ""}`}
            title="Curved line"
            onClick={() => handleUpdateArrowStyle(2)}
          >
            Curved
          </button>
          <button
            type="button"
            className={`caulk-connector-btn${selectedElement.roundness?.type === 1 ? " active" : ""}`}
            title="Elbow / Orthogonal line"
            onClick={() => handleUpdateArrowStyle(1)}
          >
            Elbow
          </button>
        </div>
      </div>
    );
  }

  // If a single shape/card/sticky is selected (and not an arrow), render the 4 branching anchors
  const showHandles =
    selectedElement &&
    selectedElement.type !== "arrow" &&
    !selectedElement.isDeleted &&
    !appState.editingTextElement;

  let topAnchor = { x: 0, y: 0 };
  let rightAnchor = { x: 0, y: 0 };
  let bottomAnchor = { x: 0, y: 0 };
  let leftAnchor = { x: 0, y: 0 };

  if (showHandles) {
    const cx = selectedElement.x + selectedElement.width / 2;
    const cy = selectedElement.y + selectedElement.height / 2;

    topAnchor = toOverlayXY(cx, selectedElement.y);
    rightAnchor = toOverlayXY(selectedElement.x + selectedElement.width, cy);
    bottomAnchor = toOverlayXY(cx, selectedElement.y + selectedElement.height);
    leftAnchor = toOverlayXY(selectedElement.x, cy);
  }

  // Hover halo on target element during drag
  const hoveredElement = hoveredTargetId
    ? elements.find((el) => el.id === hoveredTargetId)
    : null;
  const haloPos = hoveredElement ? toOverlayXY(hoveredElement.x, hoveredElement.y) : null;
  const haloZoom = appState.zoom.value;

  // Live SVG connector preview during drag
  const dragStartScreen = draggingAnchor ? toOverlayXY(draggingAnchor.startX, draggingAnchor.startY) : null;
  const dragCurScreen = currentCursorScene ? toOverlayXY(currentCursorScene.x, currentCursorScene.y) : null;

  return (
    <div className="caulk-branching-overlay">
      {/* 4 Cardinal Quick-Branch Handles */}
      {showHandles && !draggingAnchor && (
        <>
          <div
            className="caulk-branch-handle"
            style={{ left: topAnchor.x, top: topAnchor.y - 12 }}
            title="Branch card above (or drag to connect)"
            onClick={() => handleQuickBranch("top")}
            onPointerDown={(e) =>
              handleStartDragConnector(
                e,
                "top",
                selectedElement.x + selectedElement.width / 2,
                selectedElement.y,
              )
            }
          >
            +
          </div>
          <div
            className="caulk-branch-handle"
            style={{ left: rightAnchor.x + 12, top: rightAnchor.y }}
            title="Branch card to the right (or drag to connect)"
            onClick={() => handleQuickBranch("right")}
            onPointerDown={(e) =>
              handleStartDragConnector(
                e,
                "right",
                selectedElement.x + selectedElement.width,
                selectedElement.y + selectedElement.height / 2,
              )
            }
          >
            +
          </div>
          <div
            className="caulk-branch-handle"
            style={{ left: bottomAnchor.x, top: bottomAnchor.y + 12 }}
            title="Branch card below (or drag to connect)"
            onClick={() => handleQuickBranch("bottom")}
            onPointerDown={(e) =>
              handleStartDragConnector(
                e,
                "bottom",
                selectedElement.x + selectedElement.width / 2,
                selectedElement.y + selectedElement.height,
              )
            }
          >
            +
          </div>
          <div
            className="caulk-branch-handle"
            style={{ left: leftAnchor.x - 12, top: leftAnchor.y }}
            title="Branch card to the left (or drag to connect)"
            onClick={() => handleQuickBranch("left")}
            onPointerDown={(e) =>
              handleStartDragConnector(
                e,
                "left",
                selectedElement.x,
                selectedElement.y + selectedElement.height / 2,
              )
            }
          >
            +
          </div>
        </>
      )}

      {/* Target Magnetic Halo */}
      {hoveredElement && haloPos && (
        <div
          className="caulk-magnetic-halo"
          style={{
            left: haloPos.x - 4,
            top: haloPos.y - 4,
            width: hoveredElement.width * haloZoom + 8,
            height: hoveredElement.height * haloZoom + 8,
          }}
        />
      )}

      {/* Live Interactive Connector Drag Line (SVG) */}
      {dragStartScreen && dragCurScreen && (
        <svg
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          <defs>
            <marker
              id="caulk-arrow-head"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill="#c59c3a" />
            </marker>
          </defs>
          <line
            x1={dragStartScreen.x}
            y1={dragStartScreen.y}
            x2={dragCurScreen.x}
            y2={dragCurScreen.y}
            stroke="#c59c3a"
            strokeWidth="2.5"
            strokeDasharray="4 3"
            markerEnd="url(#caulk-arrow-head)"
          />
        </svg>
      )}
    </div>
  );
};
