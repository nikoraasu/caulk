import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export type AlignmentType =
  | "left"
  | "center-x"
  | "right"
  | "top"
  | "center-y"
  | "bottom";

export type DistributionAxis = "horizontal" | "vertical";

/**
 * Aligns selected elements along the specified edge or center line.
 */
export function alignElements(
  allElements: readonly ExcalidrawElement[],
  selectedIds: Set<string>,
  alignment: AlignmentType,
): ExcalidrawElement[] {
  const selected = allElements.filter((el) => selectedIds.has(el.id) && !el.isDeleted);
  if (selected.length < 2) return [...allElements];

  let targetValue = 0;

  switch (alignment) {
    case "left":
      targetValue = Math.min(...selected.map((el) => el.x));
      break;
    case "center-x": {
      const minX = Math.min(...selected.map((el) => el.x));
      const maxX = Math.max(...selected.map((el) => el.x + el.width));
      targetValue = (minX + maxX) / 2;
      break;
    }
    case "right":
      targetValue = Math.max(...selected.map((el) => el.x + el.width));
      break;
    case "top":
      targetValue = Math.min(...selected.map((el) => el.y));
      break;
    case "center-y": {
      const minY = Math.min(...selected.map((el) => el.y));
      const maxY = Math.max(...selected.map((el) => el.y + el.height));
      targetValue = (minY + maxY) / 2;
      break;
    }
    case "bottom":
      targetValue = Math.max(...selected.map((el) => el.y + el.height));
      break;
  }

  return allElements.map((el) => {
    if (!selectedIds.has(el.id) || el.isDeleted) return el;

    let nextX = el.x;
    let nextY = el.y;

    if (alignment === "left") nextX = targetValue;
    else if (alignment === "center-x") nextX = Math.round(targetValue - el.width / 2);
    else if (alignment === "right") nextX = targetValue - el.width;
    else if (alignment === "top") nextY = targetValue;
    else if (alignment === "center-y") nextY = Math.round(targetValue - el.height / 2);
    else if (alignment === "bottom") nextY = targetValue - el.height;

    return {
      ...el,
      x: nextX,
      y: nextY,
      version: el.version + 1,
      versionNonce: Math.floor(Math.random() * 2e9),
      updated: Date.now(),
    };
  });
}

/**
 * Distributes selected elements evenly along the horizontal or vertical axis.
 */
export function distributeElements(
  allElements: readonly ExcalidrawElement[],
  selectedIds: Set<string>,
  axis: DistributionAxis,
): ExcalidrawElement[] {
  const selected = allElements.filter((el) => selectedIds.has(el.id) && !el.isDeleted);
  if (selected.length < 3) return [...allElements];

  if (axis === "horizontal") {
    // Sort left to right
    const sorted = [...selected].sort((a, b) => a.x - b.x);
    const minX = sorted[0].x;
    const last = sorted[sorted.length - 1];
    const maxX = last.x + last.width;
    const totalElemWidth = sorted.reduce((sum, el) => sum + el.width, 0);
    const totalAvailableGap = maxX - minX - totalElemWidth;
    const gap = totalAvailableGap / (sorted.length - 1);

    const posMap = new Map<string, number>();
    let currentX = minX;
    for (const el of sorted) {
      posMap.set(el.id, Math.round(currentX));
      currentX += el.width + gap;
    }

    return allElements.map((el) => {
      if (!posMap.has(el.id)) return el;
      return {
        ...el,
        x: posMap.get(el.id)!,
        version: el.version + 1,
        versionNonce: Math.floor(Math.random() * 2e9),
        updated: Date.now(),
      };
    });
  } else {
    // Sort top to bottom
    const sorted = [...selected].sort((a, b) => a.y - b.y);
    const minY = sorted[0].y;
    const last = sorted[sorted.length - 1];
    const maxY = last.y + last.height;
    const totalElemHeight = sorted.reduce((sum, el) => sum + el.height, 0);
    const totalAvailableGap = maxY - minY - totalElemHeight;
    const gap = totalAvailableGap / (sorted.length - 1);

    const posMap = new Map<string, number>();
    let currentY = minY;
    for (const el of sorted) {
      posMap.set(el.id, Math.round(currentY));
      currentY += el.height + gap;
    }

    return allElements.map((el) => {
      if (!posMap.has(el.id)) return el;
      return {
        ...el,
        y: posMap.get(el.id)!,
        version: el.version + 1,
        versionNonce: Math.floor(Math.random() * 2e9),
        updated: Date.now(),
      };
    });
  }
}

/**
 * Packs selected elements into a clean N-column grid while preserving order.
 */
export function packGrid(
  allElements: readonly ExcalidrawElement[],
  selectedIds: Set<string>,
  columns?: number,
  gap = 20,
): ExcalidrawElement[] {
  const selected = allElements.filter((el) => selectedIds.has(el.id) && !el.isDeleted);
  if (selected.length < 2) return [...allElements];

  // Auto-determine column count if omitted: approx square root
  const cols = columns ?? Math.ceil(Math.sqrt(selected.length));
  const startX = Math.min(...selected.map((el) => el.x));
  const startY = Math.min(...selected.map((el) => el.y));

  // Determine standard grid cell dimensions based on max width & height
  const cellWidth = Math.max(...selected.map((el) => el.width));
  const cellHeight = Math.max(...selected.map((el) => el.height));

  const posMap = new Map<string, { x: number; y: number }>();

  selected.forEach((el, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = startX + col * (cellWidth + gap);
    const y = startY + row * (cellHeight + gap);
    posMap.set(el.id, { x: Math.round(x), y: Math.round(y) });
  });

  return allElements.map((el) => {
    const pos = posMap.get(el.id);
    if (!pos) return el;
    return {
      ...el,
      x: pos.x,
      y: pos.y,
      version: el.version + 1,
      versionNonce: Math.floor(Math.random() * 2e9),
      updated: Date.now(),
    };
  });
}
