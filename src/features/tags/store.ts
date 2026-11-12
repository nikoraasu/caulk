import type { ClusterOptions, StickyItem, TagColor } from "./types";

export const TAG_PALETTE: TagColor[] = [
  { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" }, // Blue
  { bg: "#d1fae5", text: "#065f46", border: "#6ee7b7" }, // Emerald
  { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" }, // Amber
  { bg: "#ede9fe", text: "#5b21b6", border: "#c4b5fd" }, // Violet
  { bg: "#ffe4e6", text: "#9f1239", border: "#fda4af" }, // Rose
  { bg: "#cffafe", text: "#155e75", border: "#67e8f9" }, // Cyan
  { bg: "#ffedd5", text: "#9a3412", border: "#fdba74" }, // Orange
  { bg: "#fae8ff", text: "#86198f", border: "#f0abfc" }, // Fuchsia
  { bg: "#ecfccb", text: "#3f6212", border: "#bef264" }, // Lime
  { bg: "#e0e7ff", text: "#3730a3", border: "#a5b4fc" }, // Indigo
  { bg: "#ccfbf1", text: "#115e59", border: "#5eead4" }, // Teal
  { bg: "#f1f5f9", text: "#334155", border: "#cbd5e1" }, // Slate
];

export function normalizeTag(tag: string): string {
  if (!tag) return "";
  return tag
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\w\s-]/g, "")
    .trim();
}

export function extractHashtags(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/(?:^|\s)#([a-zA-Z0-9_\-]+)/g);
  if (!matches) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const m of matches) {
    const raw = normalizeTag(m);
    const key = raw.toLowerCase();
    if (raw && !seen.has(key)) {
      seen.add(key);
      tags.push(raw);
    }
  }
  return tags;
}

export function getTagColor(tag: string): TagColor {
  const norm = normalizeTag(tag).toLowerCase();
  let hash = 0;
  for (let i = 0; i < norm.length; i += 1) {
    hash = (hash << 5) - hash + norm.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % TAG_PALETTE.length;
  return TAG_PALETTE[idx];
}

export function getElementTags(el: any, boundText?: any): string[] {
  if (!el) return [];
  const explicit = Array.isArray(el.customData?.tags)
    ? (el.customData.tags as string[])
    : [];
  const textContent =
    typeof boundText?.text === "string"
      ? boundText.text
      : typeof el.text === "string"
      ? el.text
      : "";
  const fromText = extractHashtags(textContent);

  const seen = new Set<string>();
  const combined: string[] = [];
  for (const t of [...explicit, ...fromText]) {
    const norm = normalizeTag(t);
    const key = norm.toLowerCase();
    if (norm && !seen.has(key)) {
      seen.add(key);
      combined.push(norm);
    }
  }
  return combined;
}

export function addTagToElement(el: any, tag: string): any {
  const norm = normalizeTag(tag);
  if (!norm) return el;
  const current = Array.isArray(el.customData?.tags)
    ? (el.customData.tags as string[])
    : [];
  if (current.some((t) => t.toLowerCase() === norm.toLowerCase())) {
    return el;
  }
  return {
    ...el,
    customData: {
      ...el.customData,
      tags: [...current, norm],
    },
    version: (el.version || 1) + 1,
    versionNonce: Math.floor(Math.random() * 2e9),
  };
}

export function removeTagFromElement(el: any, tag: string): any {
  const norm = normalizeTag(tag).toLowerCase();
  const current = Array.isArray(el.customData?.tags)
    ? (el.customData.tags as string[])
    : [];
  const filtered = current.filter((t) => t.toLowerCase() !== norm);
  if (filtered.length === current.length) return el;
  return {
    ...el,
    customData: {
      ...el.customData,
      tags: filtered,
    },
    version: (el.version || 1) + 1,
    versionNonce: Math.floor(Math.random() * 2e9),
  };
}

export function findStickyItems(elements: readonly any[]): StickyItem[] {
  const textByContainer = new Map<string, any>();
  for (const el of elements) {
    if (el.isDeleted) continue;
    if (el.type === "text" && el.containerId) {
      textByContainer.set(el.containerId, el);
    }
  }

  const items: StickyItem[] = [];
  for (const el of elements) {
    if (el.isDeleted) continue;
    if (el.type === "frame" || el.customData?.isFrame || el.customData?.isVideo || el.frameId === "caulk-video") continue;
    const isRect = el.type === "rectangle" || el.type === "diamond";
    if (!isRect) continue;

    const bound = textByContainer.get(el.id);
    const isSticky = Boolean(el.customData?.isSticky || bound);
    if (!isSticky) continue;

    const text = typeof bound?.text === "string" ? bound.text : "";
    const tags = getElementTags(el, bound);
    const color = el.backgroundColor || "#fff9b0";

    items.push({
      container: el,
      textElement: bound,
      text,
      tags,
      color,
      width: Math.abs(el.width || 160),
      height: Math.abs(el.height || 160),
      x: el.x,
      y: el.y,
    });
  }

  return items;
}

const COLOR_NAMES: Record<string, string> = {
  "#c4b550": "Gold",
  "#6b8e23": "Sage",
  "#708090": "Slate",
  "#cda37b": "Clay",
  "#a08ab8": "Lilac",
  "#d8d0c0": "Bone",
  "#fff9b0": "Yellow",
  "#ffc9c9": "Red",
  "#b2f2bb": "Green",
  "#a5d8ff": "Blue",
  "#ffec99": "Amber",
  "#d0bfff": "Purple",
};

export function getFriendlyColorName(hex: string): string {
  const lower = (hex || "").toLowerCase();
  if (COLOR_NAMES[lower]) return COLOR_NAMES[lower];
  return hex.toUpperCase();
}

/** Repositions item container and shifts bound text element by the same delta */
function moveItem(item: StickyItem, newX: number, newY: number): { container: any; text?: any } {
  const dx = newX - item.x;
  const dy = newY - item.y;

  const nextContainer = {
    ...item.container,
    x: newX,
    y: newY,
    version: (item.container.version || 1) + 1,
    versionNonce: Math.floor(Math.random() * 2e9),
  };

  let nextText: any = undefined;
  if (item.textElement) {
    nextText = {
      ...item.textElement,
      x: item.textElement.x + dx,
      y: item.textElement.y + dy,
      version: (item.textElement.version || 1) + 1,
      versionNonce: Math.floor(Math.random() * 2e9),
    };
  }

  return { container: nextContainer, text: nextText };
}

/** Creates a retro dashed frame rectangle element */
export function createFrameElement(
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
): any {
  const id = `frame-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    type: "frame",
    name: title,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: "#978730",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "dashed",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    customData: { isFrame: true, frameTitle: title },
  };
}

/** Tidy Up Grid: aligns notes into a clean, even grid around their center */
export function tidyGrid(
  items: StickyItem[],
  options: ClusterOptions = {},
): { updatedElements: any[] } {
  if (items.length === 0) return { updatedElements: [] };

  const cols = options.columnsPerGroup ?? Math.min(6, Math.max(2, Math.ceil(Math.sqrt(items.length))));
  const gapX = options.gapX ?? 24;
  const gapY = options.gapY ?? 24;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let avgW = 0;
  let avgH = 0;

  for (const it of items) {
    minX = Math.min(minX, it.x);
    minY = Math.min(minY, it.y);
    maxX = Math.max(maxX, it.x + it.width);
    avgW += it.width;
    avgH += it.height;
  }
  avgW = Math.round(avgW / items.length) || 160;
  avgH = Math.round(avgH / items.length) || 160;

  const startX = options.startX ?? minX;
  const startY = options.startY ?? minY;

  const updatedElements: any[] = [];
  items.forEach((item, idx) => {
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    const nx = startX + c * (avgW + gapX);
    const ny = startY + r * (avgH + gapY);
    const { container, text } = moveItem(item, nx, ny);
    updatedElements.push(container);
    if (text) updatedElements.push(text);
  });

  return { updatedElements };
}

/** Cluster by Tag: Groups items by their primary tag, frames them, and places side-by-side */
export function clusterByTag(
  items: StickyItem[],
  options: ClusterOptions = {},
): { updatedElements: any[]; newFrames: any[] } {
  if (items.length === 0) return { updatedElements: [], newFrames: [] };

  const groups = new Map<string, StickyItem[]>();
  for (const it of items) {
    const key = it.tags.length > 0 ? it.tags[0] : "Untagged";
    const arr = groups.get(key) ?? [];
    arr.push(it);
    groups.set(key, arr);
  }

  return layoutGroups(groups, options, (tag) => (tag === "Untagged" ? "📝 Untagged" : `🏷️ #${tag}`));
}

/** Cluster by Color: Groups items by their background color swatch */
export function clusterByColor(
  items: StickyItem[],
  options: ClusterOptions = {},
): { updatedElements: any[]; newFrames: any[] } {
  if (items.length === 0) return { updatedElements: [], newFrames: [] };

  const groups = new Map<string, StickyItem[]>();
  for (const it of items) {
    const key = it.color || "#fff9b0";
    const arr = groups.get(key) ?? [];
    arr.push(it);
    groups.set(key, arr);
  }

  return layoutGroups(groups, options, (color) => `🎨 ${getFriendlyColorName(color)}`);
}

/** AI Semantic Cluster: arranges existing items into AI-categorized groups */
export function aiClusterExisting(
  items: StickyItem[],
  clusters: Array<{ category: string; stickies: string[] }>,
  options: ClusterOptions = {},
): { updatedElements: any[]; newFrames: any[] } {
  if (items.length === 0) return { updatedElements: [], newFrames: [] };

  const available = [...items];
  const groups = new Map<string, StickyItem[]>();

  for (const cl of clusters) {
    const groupItems: StickyItem[] = [];
    for (const stickText of cl.stickies) {
      const normTarget = stickText.trim().toLowerCase();
      const matchIdx = available.findIndex((it) => {
        const itNorm = it.text.trim().toLowerCase();
        return itNorm === normTarget || itNorm.includes(normTarget) || normTarget.includes(itNorm);
      });
      if (matchIdx !== -1) {
        groupItems.push(available[matchIdx]);
        available.splice(matchIdx, 1);
      }
    }
    if (groupItems.length > 0) {
      groups.set(cl.category, groupItems);
    }
  }

  if (available.length > 0) {
    groups.set("Other Ideas", available);
  }

  return layoutGroups(groups, options, (cat) => `🗂️ ${cat}`);
}

/** Internal helper: lays out groups side-by-side with frames */
function layoutGroups(
  groups: Map<string, StickyItem[]>,
  options: ClusterOptions,
  formatTitle: (key: string) => string,
): { updatedElements: any[]; newFrames: any[] } {
  let minX = Infinity;
  let minY = Infinity;
  for (const list of groups.values()) {
    for (const it of list) {
      minX = Math.min(minX, it.x);
      minY = Math.min(minY, it.y);
    }
  }
  let currentX = options.startX ?? minX;
  const startY = options.startY ?? minY;
  const cols = options.columnsPerGroup ?? 2;
  const gapX = options.gapX ?? 20;
  const gapY = options.gapY ?? 20;
  const groupGap = options.groupGap ?? 48;
  const pad = 24;
  const headerSpace = 56;

  const updatedElements: any[] = [];
  const newFrames: any[] = [];

  for (const [key, groupItems] of groups.entries()) {
    const count = groupItems.length;
    if (count === 0) continue;

    let itemW = 160;
    let itemH = 160;
    for (const it of groupItems) {
      itemW = Math.max(itemW, it.width);
      itemH = Math.max(itemH, it.height);
    }

    const actualCols = Math.min(cols, count);
    const rows = Math.ceil(count / actualCols);

    const frameW = pad * 2 + actualCols * itemW + (actualCols - 1) * gapX;
    const frameH = headerSpace + pad + rows * itemH + (rows - 1) * gapY;

    const title = `${formatTitle(key)} (${count})`;
    let frame: any = null;
    if (options.createFrames !== false) {
      frame = createFrameElement(currentX, startY, frameW, frameH, title);
      newFrames.push(frame);
    }

    groupItems.forEach((it, idx) => {
      const c = idx % actualCols;
      const r = Math.floor(idx / actualCols);
      const nx = currentX + pad + c * (itemW + gapX);
      const ny = startY + headerSpace + r * (itemH + gapY);
      const { container, text } = moveItem(it, nx, ny);
      if (frame) {
        container.frameId = frame.id;
        if (text) text.frameId = frame.id;
      }
      updatedElements.push(container);
      if (text) updatedElements.push(text);
    });

    currentX += frameW + groupGap;
  }

  return { updatedElements, newFrames };
}
