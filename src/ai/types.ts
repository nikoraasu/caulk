/**
 * Multi-model AI types and tool-calling interfaces.
 * Supports Anthropic (Claude), OpenAI (GPT-4o), Google Gemini, and custom OpenAI-compatible endpoints (Ollama).
 */

export type AIProvider = "anthropic" | "openai" | "gemini" | "custom";

export type AIModelConfig = {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string; // Optional custom URL for Ollama / LocalAI / proxy
};

export const PROVIDER_MODELS: Record<AIProvider, Array<{ id: string; name: string; description: string }>> = {
  anthropic: [
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet (Recommended)", description: "Most capable for complex planning, layout, and task breakdown" },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", description: "Fastest and lightweight for quick edits and stickies" },
    { id: "claude-3-opus-20240229", name: "Claude 3 Opus", description: "Deep reasoning and extensive writing" },
  ],
  openai: [
    { id: "gpt-4o", name: "GPT-4o (Recommended)", description: "Fast, intelligent multimodal flagship" },
    { id: "gpt-4o-mini", name: "GPT-4o mini", description: "Fast, cheap, and lightweight" },
    { id: "o1-mini", name: "o1-mini", description: "Advanced reasoning for technical architectures" },
  ],
  gemini: [
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (Recommended)", description: "Next-gen ultra-fast multimodal model" },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", description: "Large context window for huge boards" },
    { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", description: "Lightweight fast assistant" },
  ],
  custom: [
    { id: "llama3.3", name: "Ollama / Local (Llama 3.3)", description: "Local self-hosted model via OpenAI-compatible endpoint" },
    { id: "qwen2.5", name: "Ollama / Local (Qwen 2.5)", description: "Local self-hosted coding model" },
    { id: "custom", name: "Custom Model Name", description: "Any model identifier supported by your endpoint" },
  ],
};

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
