import * as Y from "yjs";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export const ACTIVITY_LOG_KEY = "activity_log";
export const MAX_ACTIVITY_ENTRIES = 300;

export type ActivityAction =
  | "create"
  | "update_text"
  | "move"
  | "delete"
  | "task_status"
  | "vote"
  | "restore";

export type ActivityTargetType =
  | "sticky"
  | "task"
  | "frame"
  | "text"
  | "image"
  | "shape"
  | "board";

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  userName: string;
  userColor?: string;
  action: ActivityAction;
  targetType: ActivityTargetType;
  targetId?: string;
  title: string;
  detail?: string;
  point?: { x: number; y: number };
}

export function getActivityArray(doc: Y.Doc): Y.Array<ActivityLogEntry> {
  return doc.getArray<ActivityLogEntry>(ACTIVITY_LOG_KEY);
}

export function listActivityEntries(doc: Y.Doc): ActivityLogEntry[] {
  const arr = getActivityArray(doc);
  return arr.toArray().sort((a, b) => b.timestamp - a.timestamp);
}

export function recordActivity(
  doc: Y.Doc,
  entry: Omit<ActivityLogEntry, "id" | "timestamp">,
): ActivityLogEntry {
  const arr = getActivityArray(doc);
  const fullEntry: ActivityLogEntry = {
    ...entry,
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };

  doc.transact(() => {
    arr.unshift([fullEntry]);
    if (arr.length > MAX_ACTIVITY_ENTRIES) {
      arr.delete(MAX_ACTIVITY_ENTRIES, arr.length - MAX_ACTIVITY_ENTRIES);
    }
  }, "activity_recorder");

  return fullEntry;
}

export function subscribeToActivityLog(
  doc: Y.Doc,
  callback: (entries: ActivityLogEntry[]) => void,
): () => void {
  const arr = getActivityArray(doc);
  const listener = () => {
    callback(listActivityEntries(doc));
  };
  arr.observe(listener);
  callback(listActivityEntries(doc));
  return () => {
    arr.unobserve(listener);
  };
}

/* ==========================================================================
   Element Classification & Label Extraction Helpers
   ========================================================================== */

export function classifyElement(el: ExcalidrawElement | null | undefined): {
  targetType: ActivityTargetType;
  label: string;
  text?: string;
  point?: { x: number; y: number };
} {
  if (!el) {
    return { targetType: "shape", label: "object" };
  }

  const point = { x: Math.round(el.x), y: Math.round(el.y) };
  const customData = el.customData as Record<string, unknown> | undefined;

  if (customData?.isTaskCard || customData?.taskId) {
    const title = (customData?.taskTitle as string) || (el as any).text || "Task";
    return { targetType: "task", label: "task card", text: title, point };
  }

  if (customData?.isSticky || el.backgroundColor === "#FFF9D2" || el.backgroundColor === "#F7E68E") {
    const text = (el as any).text || "";
    return { targetType: "sticky", label: "sticky note", text, point };
  }

  if (el.type === "frame" || customData?.isFrame) {
    const title = (el as any).name || (customData?.frameTitle as string) || "Frame";
    return { targetType: "frame", label: "frame", text: title, point };
  }

  if (el.type === "text") {
    const text = (el as any).text || "";
    return { targetType: "text", label: "text", text, point };
  }

  if (el.type === "image") {
    return { targetType: "image", label: "image", point };
  }

  let shapeLabel = "shape";
  if (el.type === "rectangle") shapeLabel = "rectangle";
  else if (el.type === "ellipse") shapeLabel = "circle";
  else if (el.type === "diamond") shapeLabel = "diamond";
  else if (el.type === "arrow") shapeLabel = "arrow";
  else if (el.type === "line") shapeLabel = "line";
  else if (el.type === "freedraw") shapeLabel = "drawing";

  return { targetType: "shape", label: shapeLabel, text: (el as any).text, point };
}

export function truncate(str: string | undefined | null, max = 50): string {
  if (!str) return "";
  const cleaned = str.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1) + "…";
}

/* ==========================================================================
   Debounced Semantic Activity Recorder
   ========================================================================== */

type PendingTextEdit = {
  timeoutId: number;
  initialText: string;
  latestText: string;
  targetType: ActivityTargetType;
  label: string;
  point?: { x: number; y: number };
  userName: string;
};

export class SemanticActivityRecorder {
  private pendingTextEdits = new Map<string, PendingTextEdit>();
  private knownElements = new Map<string, { text?: string; x: number; y: number }>();
  private initialBatchProcessed = false;

  constructor(
    private readonly doc: Y.Doc,
    private readonly currentUserName: string,
  ) {}

  /** Seeds initial elements so the recorder knows what was already on canvas */
  public seedInitialElements(elements: readonly ExcalidrawElement[]): void {
    if (this.initialBatchProcessed) return;
    for (const el of elements) {
      if (el.isDeleted) continue;
      this.knownElements.set(el.id, {
        text: (el as any).text,
        x: Math.round(el.x),
        y: Math.round(el.y),
      });
    }
    this.initialBatchProcessed = true;
  }

  /** Called when user creates or modifies elements on canvas */
  public onLocalElementsChange(elements: readonly ExcalidrawElement[]): void {
    if (!this.initialBatchProcessed) {
      this.seedInitialElements(elements);
      return;
    }

    const liveElements = elements.filter((el) => !el.isDeleted);
    const liveIds = new Set(liveElements.map((el) => el.id));

    // Detect deleted elements
    for (const [id, prev] of this.knownElements.entries()) {
      if (!liveIds.has(id)) {
        this.knownElements.delete(id);
        // Clear any pending text edit
        const pending = this.pendingTextEdits.get(id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          this.pendingTextEdits.delete(id);
        }
        recordActivity(this.doc, {
          userName: this.currentUserName,
          action: "delete",
          targetType: "shape",
          targetId: id,
          title: `Deleted element`,
          detail: prev.text ? `"${truncate(prev.text)}"` : undefined,
          point: { x: prev.x, y: prev.y },
        });
      }
    }

    // Detect created or updated elements
    for (const el of liveElements) {
      const prev = this.knownElements.get(el.id);
      const currentText = (el as any).text as string | undefined;
      const currentPoint = { x: Math.round(el.x), y: Math.round(el.y) };

      if (!prev) {
        // Newly created element!
        this.knownElements.set(el.id, {
          text: currentText,
          x: currentPoint.x,
          y: currentPoint.y,
        });

        const classified = classifyElement(el);
        recordActivity(this.doc, {
          userName: this.currentUserName,
          action: "create",
          targetType: classified.targetType,
          targetId: el.id,
          title: `Created ${classified.label}`,
          detail: classified.text ? `"${truncate(classified.text)}"` : undefined,
          point: classified.point,
        });
        continue;
      }

      // Existing element: check if text changed
      if (currentText !== undefined && currentText !== prev.text) {
        const classified = classifyElement(el);
        const existingPending = this.pendingTextEdits.get(el.id);

        if (existingPending) {
          clearTimeout(existingPending.timeoutId);
          existingPending.latestText = currentText;
          existingPending.point = currentPoint;
          existingPending.timeoutId = window.setTimeout(() => {
            this.flushPendingTextEdit(el.id);
          }, 1600);
        } else {
          const timeoutId = window.setTimeout(() => {
            this.flushPendingTextEdit(el.id);
          }, 1600);
          this.pendingTextEdits.set(el.id, {
            timeoutId,
            initialText: prev.text || "",
            latestText: currentText,
            targetType: classified.targetType,
            label: classified.label,
            point: currentPoint,
            userName: this.currentUserName,
          });
        }
      }

      // Update known coordinates and text
      this.knownElements.set(el.id, {
        text: currentText,
        x: currentPoint.x,
        y: currentPoint.y,
      });
    }
  }

  private flushPendingTextEdit(elementId: string): void {
    const pending = this.pendingTextEdits.get(elementId);
    if (!pending) return;
    this.pendingTextEdits.delete(elementId);

    if (pending.initialText.trim() === pending.latestText.trim()) return;

    recordActivity(this.doc, {
      userName: pending.userName,
      action: "update_text",
      targetType: pending.targetType,
      targetId: elementId,
      title: `Edited ${pending.label}`,
      detail: `"${truncate(pending.latestText)}"`,
      point: pending.point,
    });
  }

  public flushAll(): void {
    for (const id of Array.from(this.pendingTextEdits.keys())) {
      const pending = this.pendingTextEdits.get(id);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.flushPendingTextEdit(id);
      }
    }
  }

  public dispose(): void {
    this.flushAll();
  }
}
