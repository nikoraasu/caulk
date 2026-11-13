import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { sanitizeElement } from "../../crdt/scene";

export type ConnectorArrowParams = {
  id?: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  sourceId: string;
  targetId?: string | null;
  frameId?: string | null;
  strokeColor?: string;
};

/**
 * Creates a theme-aware Excalidraw arrow connector between elements.
 */
export function createConnectorArrow(params: ConnectorArrowParams): ExcalidrawElement {
  const arrowId = params.id || `arrow-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const dx = params.endX - params.startX;
  const dy = params.endY - params.startY;

  return sanitizeElement({
    id: arrowId,
    type: "arrow",
    x: params.startX,
    y: params.startY,
    width: Math.abs(dx),
    height: Math.abs(dy),
    angle: 0,
    strokeColor: params.strokeColor || "#c59c3a",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: params.frameId ?? null,
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
      elementId: params.sourceId,
      focus: 0,
      gap: 6,
    },
    endBinding: params.targetId
      ? {
          elementId: params.targetId,
          focus: 0,
          gap: 6,
        }
      : null,
    lastCommittedPoint: null,
    startArrowhead: null,
    endArrowhead: "arrow",
  });
}
