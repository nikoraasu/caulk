import React, { useEffect, useRef, useState, useCallback } from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import "./minimap.css";

type Props = {
  getAppState: () => AppState | null;
  getElements: () => readonly ExcalidrawElement[];
  onNavigate: (sceneX: number, sceneY: number) => void;
  onZoomToFit: () => void;
  onResetZoom: () => void;
  onGoToOrigin: () => void;
  isOpen: boolean;
  onToggle: () => void;
};

export const Minimap: React.FC<Props> = ({
  getAppState,
  getElements,
  onNavigate,
  onZoomToFit,
  onResetZoom,
  onGoToOrigin,
  isOpen,
  onToggle,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef(false);
  const [hudStats, setHudStats] = useState({ zoom: 100, count: 0 });

  // Cached world-to-minimap transform parameters for mouse projection
  const transformRef = useRef<{
    totalMinX: number;
    totalMinY: number;
    scale: number;
    offsetX: number;
    offsetY: number;
  }>({
    totalMinX: -800,
    totalMinY: -500,
    scale: 0.1,
    offsetX: 0,
    offsetY: 0,
  });

  const renderMinimap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isOpen) return;

    const appState = getAppState();
    const elements = getElements();
    if (!appState) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = 240;
    const height = 150;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = "#141a12";
    ctx.fillRect(0, 0, width, height);

    // Draw tactical radar background grid
    ctx.strokeStyle = "rgba(75, 88, 68, 0.25)";
    ctx.lineWidth = 1;
    const gridSpacing = 24;
    for (let x = 0; x < width; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Filter active elements
    const activeElements = elements.filter((el) => !el.isDeleted);

    // Calculate elements bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of activeElements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }

    if (!isFinite(minX)) {
      minX = -600;
      minY = -400;
      maxX = 600;
      maxY = 400;
    }

    // Viewport bounds in scene coordinates
    const zoom = Math.max(0.01, appState.zoom.value);
    const vpX = -appState.scrollX;
    const vpY = -appState.scrollY;
    const vpW = appState.width / zoom;
    const vpH = appState.height / zoom;

    // Expand bounding box to enclose both elements and current camera viewport
    const pad = 120;
    const totalMinX = Math.min(minX, vpX) - pad;
    const totalMinY = Math.min(minY, vpY) - pad;
    const totalMaxX = Math.max(maxX, vpX + vpW) + pad;
    const totalMaxY = Math.max(maxY, vpY + vpH) + pad;

    const worldW = Math.max(100, totalMaxX - totalMinX);
    const worldH = Math.max(100, totalMaxY - totalMinY);

    const scale = Math.min(width / worldW, height / worldH);
    const offsetX = (width - worldW * scale) / 2;
    const offsetY = (height - worldH * scale) / 2;

    transformRef.current = { totalMinX, totalMinY, scale, offsetX, offsetY };

    // Function to convert scene coord to minimap canvas coord
    const toMapX = (sx: number) => offsetX + (sx - totalMinX) * scale;
    const toMapY = (sy: number) => offsetY + (sy - totalMinY) * scale;

    // 1. Draw Frames
    for (const el of activeElements) {
      if (el.type === "frame" || (el.customData as Record<string, unknown> | undefined)?.isFrame) {
        const mx = toMapX(el.x);
        const my = toMapY(el.y);
        const mw = Math.max(2, el.width * scale);
        const mh = Math.max(2, el.height * scale);

        ctx.fillStyle = "rgba(75, 88, 68, 0.4)";
        ctx.fillRect(mx, my, mw, mh);
        ctx.strokeStyle = "rgba(122, 139, 113, 0.8)";
        ctx.lineWidth = 1;
        ctx.strokeRect(mx, my, mw, mh);
      }
    }

    // 2. Draw regular shapes & stickies
    for (const el of activeElements) {
      if (el.type === "frame" || (el.customData as Record<string, unknown> | undefined)?.isFrame) {
        continue;
      }
      const mx = toMapX(el.x);
      const my = toMapY(el.y);
      const mw = Math.max(1.5, el.width * scale);
      const mh = Math.max(1.5, el.height * scale);

      if (el.type === "arrow" || el.type === "line") {
        ctx.strokeStyle = "rgba(208, 216, 204, 0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + mw, my + mh);
        ctx.stroke();
      } else {
        // Sticky / Task Card / Shape
        const fill =
          el.backgroundColor && el.backgroundColor !== "transparent"
            ? el.backgroundColor
            : "rgba(197, 156, 58, 0.6)";

        ctx.fillStyle = fill;
        ctx.fillRect(mx, my, mw, mh);
      }
    }

    // 3. Draw Camera Viewport Frustum (Active view rectangle)
    const vX = toMapX(vpX);
    const vY = toMapY(vpY);
    const vW = Math.max(4, vpW * scale);
    const vH = Math.max(4, vpH * scale);

    // Viewport fill & stroke
    ctx.fillStyle = "rgba(197, 156, 58, 0.16)";
    ctx.fillRect(vX, vY, vW, vH);

    ctx.strokeStyle = "#c59c3a";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vX, vY, vW, vH);

    // Tactical corner reticles on the camera view
    const cornerSize = Math.min(6, Math.min(vW, vH) / 3);
    ctx.strokeStyle = "#ffb82e";
    ctx.lineWidth = 2;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(vX, vY + cornerSize);
    ctx.lineTo(vX, vY);
    ctx.lineTo(vX + cornerSize, vY);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(vX + vW - cornerSize, vY);
    ctx.lineTo(vX + vW, vY);
    ctx.lineTo(vX + vW, vY + cornerSize);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(vX, vY + vH - cornerSize);
    ctx.lineTo(vX, vY + vH);
    ctx.lineTo(vX + cornerSize, vY + vH);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(vX + vW - cornerSize, vY + vH);
    ctx.lineTo(vX + vW, vY + vH);
    ctx.lineTo(vX + vW, vY + vH - cornerSize);
    ctx.stroke();

    ctx.restore();
  }, [getAppState, getElements, isOpen]);

  useEffect(() => {
    let animId: number;
    let frameCounter = 0;

    const loop = () => {
      renderMinimap();
      frameCounter++;

      // Update HUD labels once every 12 frames (~200ms) to avoid unnecessary React re-renders
      if (frameCounter % 12 === 0) {
        const appState = getAppState();
        const elements = getElements();
        const zoom = appState?.zoom?.value ? Math.round(appState.zoom.value * 100) : 100;
        const count = elements.filter((e) => !e.isDeleted).length;
        setHudStats((prev) => {
          if (prev.zoom !== zoom || prev.count !== count) {
            return { zoom, count };
          }
          return prev;
        });
      }

      animId = requestAnimationFrame(loop);
    };

    if (isOpen) {
      animId = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(animId);
  }, [renderMinimap, isOpen, getAppState, getElements]);

  const handlePointerNavigate = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const { totalMinX, totalMinY, scale, offsetX, offsetY } = transformRef.current;
      if (scale <= 0) return;

      const targetSceneX = totalMinX + (clickX - offsetX) / scale;
      const targetSceneY = totalMinY + (clickY - offsetY) / scale;

      onNavigate(targetSceneX, targetSceneY);
    },
    [onNavigate],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      isDraggingRef.current = true;
      handlePointerNavigate(e);

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const clickX = moveEvent.clientX - rect.left;
        const clickY = moveEvent.clientY - rect.top;

        const { totalMinX, totalMinY, scale, offsetX, offsetY } = transformRef.current;
        if (scale <= 0) return;

        const targetSceneX = totalMinX + (clickX - offsetX) / scale;
        const targetSceneY = totalMinY + (clickY - offsetY) / scale;

        onNavigate(targetSceneX, targetSceneY);
      };

      const onMouseUp = () => {
        isDraggingRef.current = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [handlePointerNavigate, onNavigate],
  );

  return (
    <div className={`caulk-minimap-container${!isOpen ? " collapsed" : ""}`}>
      <div className="caulk-minimap-header" onClick={onToggle}>
        <div className="caulk-minimap-header-title">
          <span>🛰️ RADAR</span>
          <span className="caulk-minimap-hotkey-badge">M</span>
        </div>
        <div className="caulk-minimap-header-actions">
          <span className="caulk-minimap-zoom-pill">{hudStats.zoom}%</span>
          <button
            type="button"
            className="caulk-minimap-toggle-btn"
            title={isOpen ? "Minimize Radar (M)" : "Expand Radar (M)"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {isOpen ? "▼" : "▲"}
          </button>
        </div>
      </div>

      {isOpen && (
        <>
          <div className="caulk-minimap-canvas-wrapper" onMouseDown={handleMouseDown}>
            <canvas ref={canvasRef} className="caulk-minimap-canvas" />
            <div className="caulk-minimap-scanlines" />
          </div>

          <div className="caulk-minimap-footer">
            <span style={{ fontSize: 9, color: "var(--vgui-muted, #d0d8cc)" }}>
              {hudStats.count} items
            </span>
            <div style={{ display: "flex", gap: 3 }}>
              <button
                type="button"
                className="caulk-minimap-btn"
                title="Zoom to fit all elements (Shift+1)"
                onClick={onZoomToFit}
              >
                Fit
              </button>
              <button
                type="button"
                className="caulk-minimap-btn"
                title="Reset zoom to 100% (Shift+0)"
                onClick={onResetZoom}
              >
                1:1
              </button>
              <button
                type="button"
                className="caulk-minimap-btn"
                title="Go to Origin (0,0) (H)"
                onClick={onGoToOrigin}
              >
                Origin
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
