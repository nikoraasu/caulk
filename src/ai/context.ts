/**
 * Extracts whiteboard canvas and CRDT task context for AI reasoning.
 */

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type * as Y from "yjs";
import type { TaskRecord, MemberRecord } from "../features/tasks/types";

export function extractBoardContext(
  elements: readonly ExcalidrawElement[],
  doc: Y.Doc | null,
  selectedElementIds?: Record<string, boolean>,
): string {
  const sections: string[] = [];

  // 1. Selected elements (if any)
  if (selectedElementIds && Object.keys(selectedElementIds).length > 0) {
    const selectedTexts: string[] = [];
    for (const el of elements) {
      if (!selectedElementIds[el.id] || el.isDeleted) continue;
      const text = (el as any).text || ((el as any).label?.text);
      if (text) {
        selectedTexts.push(`- [${el.type}] "${text.trim().replace(/\n/g, " ")}" (id: ${el.id})`);
      }
    }
    if (selectedTexts.length > 0) {
      sections.push(`### Currently Selected Elements:\n${selectedTexts.join("\n")}`);
    }
  }

  // 2. Frames
  const frames: string[] = [];
  for (const el of elements) {
    if (el.isDeleted) continue;
    if (el.type === "frame" && (el as any).name) {
      frames.push(`- Frame: "${(el as any).name}" (id: ${el.id})`);
    }
  }
  if (frames.length > 0) {
    sections.push(`### Board Frames / Groups:\n${frames.join("\n")}`);
  }

  // 3. Stickies & text
  const stickies: string[] = [];
  const otherTexts: string[] = [];
  for (const el of elements) {
    if (el.isDeleted) continue;
    const text = (el as any).text || ((el as any).label?.text);
    if (!text || !text.trim()) continue;
    const cleanText = text.trim().replace(/\n/g, " ");

    const custom = el.customData as Record<string, unknown> | undefined;
    if (custom?.isSticky || (el as any).containerId) {
      stickies.push(`- Sticky: "${cleanText}" (color: ${el.backgroundColor || "yellow"})`);
    } else {
      otherTexts.push(`- Text: "${cleanText}"`);
    }
  }

  if (stickies.length > 0) {
    sections.push(`### Sticky Notes (${stickies.length}):\n${stickies.slice(0, 30).join("\n")}${stickies.length > 30 ? `\n...and ${stickies.length - 30} more` : ""}`);
  }
  if (otherTexts.length > 0) {
    sections.push(`### Text Labels:\n${otherTexts.slice(0, 20).join("\n")}`);
  }

  // 4. Tasks in CRDT
  if (doc) {
    const tasksMap = doc.getMap<TaskRecord>("tasks");
    const tasks = Array.from(tasksMap.values());
    if (tasks.length > 0) {
      const taskLines = tasks.map((t) => {
        const subCount = t.subtaskIds?.length ? ` [${t.subtaskIds.length} subtasks]` : "";
        const assignee = t.assignees?.length ? ` @${t.assignees.join(", @")}` : "";
        return `- [${t.status.toUpperCase()}] (${t.priority}) "${t.title}"${assignee}${subCount}`;
      });
      sections.push(`### Existing Tasks (${tasks.length}):\n${taskLines.slice(0, 25).join("\n")}`);
    }

    // 5. Team members
    const membersMap = doc.getMap<MemberRecord>("project_members");
    const members = Array.from(membersMap.values()).map((m) => `${m.name || m.id} (${m.role})`);
    if (members.length > 0) {
      sections.push(`### Team Members: ${members.join(", ")}`);
    }
  }

  if (sections.length === 0) {
    return "(The canvas is currently empty. No sticky notes, frames, or tasks.)";
  }

  return sections.join("\n\n");
}
