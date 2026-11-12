/**
 * Multi-model AI types and tool-calling interfaces.
 * Defines agent action schemas and normalization helpers.
 */

export type AgentAction =
  | {
      type: "add_task";
      title: string;
      status?: "BACKLOG" | "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
      priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      assignee?: string;
      description?: string;
      subtasks?: string[];
      labels?: string[];
      createStickyOnCanvas?: boolean;
    }
  | {
      type: "update_task_status";
      taskIdOrTitle: string;
      status: "BACKLOG" | "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
    }
  | {
      type: "add_sticky";
      text: string;
      color?: "yellow" | "green" | "blue" | "purple" | "pink" | "orange";
      x?: number;
      y?: number;
      tags?: string[];
      frameTitle?: string;
    }
  | {
      type: "create_frame";
      title: string;
      backgroundColor?: string;
      strokeColor?: string;
      roundness?: number;
      stickies?: Array<{ text: string; color?: string }>;
    }
  | {
      type: "group_elements";
      elementIdsOrTexts: string[];
      frameTitle: string;
      backgroundColor?: string;
    }
  | {
      type: "connect_elements";
      fromTextOrId: string;
      toTextOrId: string;
      label?: string;
    }
  | {
      type: "generate_diagram";
      mermaidCode: string;
      title?: string;
    };

export function normalizeStatus(status?: string): "backlog" | "todo" | "in_progress" | "review" | "done" | "blocked" {
  const s = (status || "todo").toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "in_progress" || s === "inprogress") return "in_progress";
  if (s === "backlog" || s === "todo" || s === "review" || s === "done" || s === "blocked") return s as any;
  return "todo";
}

export function normalizePriority(priority?: string): "low" | "medium" | "high" | "critical" {
  const p = (priority || "medium").toLowerCase();
  if (p === "low" || p === "medium" || p === "high" || p === "critical") return p as any;
  return "medium";
}

export type AgentResponse = {
  message: string;
  actions: AgentAction[];
  raw?: unknown;
};

export type BoardContext = {
  elementsSummary: string;
  tasksSummary: string;
  selectedElementsText?: string;
  activeCollaborators?: string[];
  members?: string[];
};
