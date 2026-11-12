/**
 * AI Tool definitions, system prompts, and action execution engine for canvas & task CRDT.
 */

import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type * as Y from "yjs";
import { type AgentAction, normalizeStatus, normalizePriority } from "./types";
import { createTask, updateTask, createSubtask } from "../features/tasks/store";
import type { TaskRecord } from "../features/tasks/types";
import { sanitizeElement } from "../crdt/scene";

export const STICKY_COLORS: Record<string, string> = {
  yellow: "#FEF08A",
  green: "#BBF7D0",
  blue: "#BAE6FD",
  purple: "#DDD6FE",
  pink: "#FECDD3",
  orange: "#FED7AA",
};

export const AI_SYSTEM_PROMPT = `You are Caulk AI — an expert visual project architect and agile facilitator collaborating on a real-time infinite whiteboard canvas.

The board contains:
- Sticky notes (colorful notes with text, tags, and ideas)
- Native Miro-style grouping frames (which bind and move child elements together)
- Jira-grade tasks (stored in the project CRDT with status, priority, assignees, and subtasks)
- Arrows and visual diagrams (Mermaid flowchart/sequence)

When the user asks you to organize, plan, break down, brainstorm, or update the board:
1. Provide a concise, clear response explaining your thinking and plan.
2. Output your executable actions in a JSON block marked with \`\`\`json:actions ... \`\`\`.

Available Actions Schema:
- { "type": "add_task", "title": "...", "status": "BACKLOG"|"TODO"|"IN_PROGRESS"|"REVIEW"|"DONE", "priority": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "assignee": "username", "description": "...", "subtasks": ["subtask 1", "subtask 2"], "labels": ["frontend", "urgent"], "createStickyOnCanvas": true }
- { "type": "update_task_status", "taskIdOrTitle": "exact title or id", "status": "BACKLOG"|"TODO"|"IN_PROGRESS"|"REVIEW"|"DONE" }
- { "type": "add_sticky", "text": "Note text", "color": "yellow"|"green"|"blue"|"purple"|"pink"|"orange", "tags": ["tag1", "tag2"], "frameTitle": "Optional Frame" }
- { "type": "create_frame", "title": "Frame Title", "backgroundColor": "rgba(255,255,255,0.05)", "stickies": [{ "text": "Note 1", "color": "yellow" }] }
- { "type": "group_elements", "elementIdsOrTexts": ["Sticky text 1", "Sticky text 2"], "frameTitle": "Category Name" }
- { "type": "connect_elements", "fromTextOrId": "Origin text", "toTextOrId": "Target text", "label": "arrow label" }
- { "type": "generate_diagram", "mermaidCode": "flowchart TD\\n  A-->B", "title": "Architecture" }

Always return ONLY valid JSON inside the \`\`\`json:actions block. You can combine multiple actions in one list.`;

/**
 * Extracts executable actions from the LLM's response text.
 */
export function parseActionsFromResponse(text: string): AgentAction[] {
  const actions: AgentAction[] = [];

  const blockRegex = /```(?:json:actions|json)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(text)) !== null) {
    const jsonStr = match[1].trim();
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object" && typeof item.type === "string") {
            actions.push(item as AgentAction);
          }
        }
      } else if (parsed && typeof parsed === "object" && typeof parsed.type === "string") {
        actions.push(parsed as AgentAction);
      }
    } catch {
      // Continue to next block if JSON fails
    }
  }

  if (actions.length === 0 && text.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(text.trim());
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object" && typeof item.type === "string") {
            actions.push(item as AgentAction);
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  return actions;
}

/**
 * Strips the action JSON blocks from the response to leave only the readable text message.
 */
export function cleanMessageText(text: string): string {
  return text
    .replace(/```(?:json:actions|json)\s*[\s\S]*?```/g, "")
    .trim();
}

/**
 * Executes a list of AI agent actions against both the Excalidraw canvas and the Yjs CRDT task store.
 */
export async function executeAgentActions(
  actions: AgentAction[],
  context: {
    doc: Y.Doc | null;
    api: ExcalidrawImperativeAPI;
    viewportCenter?: { x: number; y: number };
  },
): Promise<{ executedCount: number; summary: string[] }> {
  const { doc, api } = context;
  const elements = [...api.getSceneElements()];
  const appState = api.getAppState();

  const centerX = context.viewportCenter?.x ?? (-appState.scrollX + appState.width / 2);
  const centerY = context.viewportCenter?.y ?? (-appState.scrollY + appState.height / 2);

  const summary: string[] = [];
  let executedCount = 0;
  const newElementsToAdd: any[] = [];

  let stickyOffsetIndex = 0;

  for (const action of actions) {
    try {
      switch (action.type) {
        case "add_task": {
          if (doc) {
            const task = createTask(doc, {
              title: action.title,
              status: normalizeStatus(action.status),
              priority: normalizePriority(action.priority),
              assignees: action.assignee ? [action.assignee] : [],
              description: action.description || "",
              labels: action.labels || [],
            });

            if (action.subtasks && action.subtasks.length > 0) {
              for (const subTitle of action.subtasks) {
                createSubtask(doc, task.id, { title: subTitle });
              }
            }

            if (action.createStickyOnCanvas) {
              const col = stickyOffsetIndex % 3;
              const row = Math.floor(stickyOffsetIndex / 3);
              const sx = centerX - 250 + col * 240;
              const sy = centerY - 150 + row * 180;
              stickyOffsetIndex++;

              const assigneeStr = task.assignees.length ? `\n👤 @${task.assignees.join(", @")}` : "";

              newElementsToAdd.push({
                type: "rectangle",
                x: sx,
                y: sy,
                width: 220,
                height: 160,
                backgroundColor: STICKY_COLORS.blue,
                fillStyle: "solid",
                strokeColor: "transparent",
                roughness: 0,
                roundness: null,
                customData: { isSticky: true, taskId: task.id },
                label: {
                  text: `[${task.status.toUpperCase()}] ${task.title}${assigneeStr}`,
                  fontSize: 16,
                  fontFamily: 2,
                  textAlign: "center",
                  verticalAlign: "middle",
                  strokeColor: "#1e1e1e",
                },
              });
            }

            summary.push(`✓ Created task: "${action.title}" (${task.status.toUpperCase()})`);
            executedCount++;
          }
          break;
        }

        case "update_task_status": {
          if (doc) {
            const tasksMap = doc.getMap<TaskRecord>("tasks");
            let targetTask: TaskRecord | undefined;
            for (const t of tasksMap.values()) {
              if (t.id === action.taskIdOrTitle || t.title.toLowerCase() === action.taskIdOrTitle.toLowerCase()) {
                targetTask = t;
                break;
              }
            }
            if (targetTask) {
              const newStatus = normalizeStatus(action.status);
              updateTask(doc, targetTask.id, { status: newStatus });
              summary.push(`✓ Updated task "${targetTask.title}" -> ${newStatus.toUpperCase()}`);
              executedCount++;
            }
          }
          break;
        }

        case "add_sticky": {
          const col = stickyOffsetIndex % 3;
          const row = Math.floor(stickyOffsetIndex / 3);
          const sx = action.x ?? (centerX - 250 + col * 240);
          const sy = action.y ?? (centerY - 150 + row * 180);
          stickyOffsetIndex++;

          const bg = STICKY_COLORS[action.color || "yellow"] || STICKY_COLORS.yellow;
          const tagString = action.tags && action.tags.length > 0 ? `\n${action.tags.map(t => `#${t.replace(/^#/, '')}`).join(" ")}` : "";

          newElementsToAdd.push({
            type: "rectangle",
            x: sx,
            y: sy,
            width: 220,
            height: 160,
            backgroundColor: bg,
            fillStyle: "solid",
            strokeColor: "transparent",
            roughness: 0,
            roundness: null,
            customData: { isSticky: true, tags: action.tags },
            label: {
              text: `${action.text}${tagString}`,
              fontSize: 16,
              fontFamily: 2,
              textAlign: "center",
              verticalAlign: "middle",
              strokeColor: "#1e1e1e",
            },
          });

          summary.push(`✓ Placed sticky: "${action.text.slice(0, 30)}..."`);
          executedCount++;
          break;
        }

        case "create_frame": {
          const frameWidth = 560;
          const stickies = action.stickies || [];
          const rows = Math.max(1, Math.ceil(stickies.length / 2));
          const frameHeight = Math.max(340, rows * 180 + 80);

          const fx = centerX - frameWidth / 2;
          const fy = centerY - frameHeight / 2;
          const frameId = `frame-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

          stickies.forEach((s, idx) => {
            const col = idx % 2;
            const row = Math.floor(idx / 2);
            const nx = fx + 25 + col * 250;
            const ny = fy + 60 + row * 180;
            const bg = STICKY_COLORS[s.color || "yellow"] || STICKY_COLORS.yellow;

            newElementsToAdd.push({
              id: `sticky-${frameId}-${idx}`,
              type: "rectangle",
              frameId,
              x: nx,
              y: ny,
              width: 230,
              height: 160,
              backgroundColor: bg,
              fillStyle: "solid",
              strokeColor: "transparent",
              roughness: 0,
              roundness: null,
              customData: { isSticky: true },
              label: {
                text: s.text,
                fontSize: 16,
                fontFamily: 2,
                textAlign: "center",
                verticalAlign: "middle",
                strokeColor: "#1e1e1e",
              },
            });
          });

          newElementsToAdd.push({
            id: frameId,
            type: "frame",
            name: action.title,
            x: fx,
            y: fy,
            width: frameWidth,
            height: frameHeight,
            backgroundColor: action.backgroundColor || "rgba(0,0,0,0.03)",
            strokeColor: action.strokeColor || "#4B5563",
            strokeWidth: 2,
            roundness: action.roundness !== undefined ? { type: 3, value: action.roundness } : { type: 3, value: 8 },
          });

          summary.push(`✓ Created frame: "${action.title}" with ${stickies.length} items`);
          executedCount++;
          break;
        }

        case "generate_diagram": {
          navigator.clipboard.writeText(action.mermaidCode).catch(() => {});
          api.updateScene({
            appState: {
              openDialog: { name: "ttd", tab: "mermaid" },
            },
          });
          summary.push(`✓ Generated Mermaid diagram for "${action.title || "Diagram"}" (copied to clipboard)`);
          executedCount++;
          break;
        }
      }
    } catch (err) {
      console.warn("[caulk-ai] action failed", action, err);
    }
  }

  if (newElementsToAdd.length > 0) {
    if (typeof window !== "undefined") {
      const { convertToExcalidrawElements, restoreElements, CaptureUpdateAction } = await import("@excalidraw/excalidraw");
      const converted = convertToExcalidrawElements(newElementsToAdd);
      const restored = restoreElements(
        [...elements.map(sanitizeElement), ...converted.map(sanitizeElement)],
        null,
      );
      api.updateScene({
        elements: restored as unknown as OrderedExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    }
  }

  return { executedCount, summary };
}
