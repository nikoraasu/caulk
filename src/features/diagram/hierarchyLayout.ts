import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export type HierarchyDirection = "top-to-bottom" | "left-to-right";

export type LayoutOptions = {
  direction?: HierarchyDirection;
  horizontalGap?: number;
  verticalGap?: number;
};

type NodeId = string;

/**
 * Automatically calculates a clean hierarchical tree / DAG layout for connected elements.
 * Preserves element dimensions, aligns nodes into layers/ranks, and centers the graph
 * around the original bounding box center.
 */
export function layoutHierarchy(
  allElements: readonly ExcalidrawElement[],
  selectedIds?: Set<string>,
  options: LayoutOptions = {},
): ExcalidrawElement[] {
  const direction = options.direction ?? "top-to-bottom";
  const horizontalGap = options.horizontalGap ?? 60;
  const verticalGap = options.verticalGap ?? 80;

  // 1. Identify active nodes
  const activeElements = selectedIds && selectedIds.size > 0
    ? allElements.filter((el) => selectedIds.has(el.id) && !el.isDeleted && el.type !== "arrow")
    : allElements.filter((el) => !el.isDeleted && el.type !== "arrow");

  if (activeElements.length === 0) return [...allElements];

  const nodeMap = new Map<NodeId, ExcalidrawElement>();
  for (const el of activeElements) {
    nodeMap.set(el.id, el);
  }

  // 2. Identify arrows that connect active nodes
  const arrows = allElements.filter((el) => {
    const a = el as any;
    return (
      el.type === "arrow" &&
      !el.isDeleted &&
      a.startBinding?.elementId &&
      a.endBinding?.elementId &&
      nodeMap.has(a.startBinding.elementId) &&
      nodeMap.has(a.endBinding.elementId)
    );
  });

  // 3. Build adjacency list & in-degrees
  const childrenMap = new Map<NodeId, Set<NodeId>>();
  const parentsMap = new Map<NodeId, Set<NodeId>>();
  for (const id of nodeMap.keys()) {
    childrenMap.set(id, new Set());
    parentsMap.set(id, new Set());
  }

  for (const el of arrows) {
    const arrow = el as any;
    const fromId = arrow.startBinding.elementId as string;
    const toId = arrow.endBinding.elementId as string;
    if (fromId !== toId) {
      childrenMap.get(fromId)?.add(toId);
      parentsMap.get(toId)?.add(fromId);
    }
  }

  // 4. Assign layers (ranks) using Longest-Path / Topological layering
  const layers = new Map<NodeId, number>();

  // Find root nodes (in-degree == 0)
  const rootIds = Array.from(nodeMap.keys()).filter(
    (id) => (parentsMap.get(id)?.size ?? 0) === 0,
  );

  // If graph is cyclic or all have parents, pick the first node
  const startNodes = rootIds.length > 0 ? rootIds : [Array.from(nodeMap.keys())[0]];

  // Assign depths via BFS/DFS from roots
  for (const root of startNodes) {
    layers.set(root, 0);
  }

  const queue: NodeId[] = [...startNodes];
  const seenInQueue = new Set<NodeId>(startNodes);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLayer = layers.get(current) ?? 0;
    const children = childrenMap.get(current) ?? new Set();

    for (const child of children) {
      const existingLayer = layers.get(child) ?? 0;
      layers.set(child, Math.max(existingLayer, currentLayer + 1));
      if (!seenInQueue.has(child)) {
        seenInQueue.add(child);
        queue.push(child);
      }
    }
  }

  // Any remaining disconnected nodes get put in layer 0
  for (const id of nodeMap.keys()) {
    if (!layers.has(id)) {
      layers.set(id, 0);
    }
  }

  // 5. Group nodes by layer
  const layerBuckets = new Map<number, NodeId[]>();
  for (const [id, layer] of layers.entries()) {
    if (!layerBuckets.has(layer)) {
      layerBuckets.set(layer, []);
    }
    layerBuckets.get(layer)!.push(id);
  }

  const sortedLayerIndices = Array.from(layerBuckets.keys()).sort((a, b) => a - b);

  // Calculate current bounding box center to keep the layout in-place
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const el of activeElements) {
    minX = Math.min(minX, el.x);
    maxX = Math.max(maxX, el.x + el.width);
    minY = Math.min(minY, el.y);
    maxY = Math.max(maxY, el.y + el.height);
  }
  const originalCenterX = (minX + maxX) / 2;
  const originalCenterY = (minY + maxY) / 2;

  // 6. Compute new coordinates per node
  const newPositions = new Map<NodeId, { x: number; y: number }>();

  if (direction === "top-to-bottom") {
    let currentY = 0;

    for (const layerIdx of sortedLayerIndices) {
      const nodeIds = layerBuckets.get(layerIdx)!;
      let maxLayerHeight = 0;
      let totalWidth = 0;

      for (const id of nodeIds) {
        const el = nodeMap.get(id)!;
        maxLayerHeight = Math.max(maxLayerHeight, el.height);
        totalWidth += el.width;
      }
      totalWidth += (nodeIds.length - 1) * horizontalGap;

      let currentX = -totalWidth / 2;
      for (const id of nodeIds) {
        const el = nodeMap.get(id)!;
        newPositions.set(id, { x: currentX, y: currentY });
        currentX += el.width + horizontalGap;
      }

      currentY += maxLayerHeight + verticalGap;
    }
  } else {
    // left-to-right
    let currentX = 0;

    for (const layerIdx of sortedLayerIndices) {
      const nodeIds = layerBuckets.get(layerIdx)!;
      let maxLayerWidth = 0;
      let totalHeight = 0;

      for (const id of nodeIds) {
        const el = nodeMap.get(id)!;
        maxLayerWidth = Math.max(maxLayerWidth, el.width);
        totalHeight += el.height;
      }
      totalHeight += (nodeIds.length - 1) * verticalGap;

      let currentY = -totalHeight / 2;
      for (const id of nodeIds) {
        const el = nodeMap.get(id)!;
        newPositions.set(id, { x: currentX, y: currentY });
        currentY += el.height + verticalGap;
      }

      currentX += maxLayerWidth + horizontalGap;
    }
  }

  // 7. Compute bounds of new positions and shift so new center matches original center
  let newMinX = Infinity;
  let newMaxX = -Infinity;
  let newMinY = Infinity;
  let newMaxY = -Infinity;

  for (const [id, pos] of newPositions.entries()) {
    const el = nodeMap.get(id)!;
    newMinX = Math.min(newMinX, pos.x);
    newMaxX = Math.max(newMaxX, pos.x + el.width);
    newMinY = Math.min(newMinY, pos.y);
    newMaxY = Math.max(newMaxY, pos.y + el.height);
  }

  const newCenterX = (newMinX + newMaxX) / 2;
  const newCenterY = (newMinY + newMaxY) / 2;
  const offsetX = originalCenterX - newCenterX;
  const offsetY = originalCenterY - newCenterY;

  // 8. Generate updated elements list
  const nextElements = allElements.map((el) => {
    const newPos = newPositions.get(el.id);
    if (!newPos) return el;
    return {
      ...el,
      x: Math.round(newPos.x + offsetX),
      y: Math.round(newPos.y + offsetY),
      version: el.version + 1,
      versionNonce: Math.floor(Math.random() * 2e9),
      updated: Date.now(),
    };
  });

  return nextElements;
}
