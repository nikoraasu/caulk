import { GoogleGenAI } from "@google/genai";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

const GEMINI_KEY_STORAGE = "caulk.gemini_key.v1";
const DEFAULT_MODEL = "gemini-3.8-flash";

let serverSharedKey = "";

export function setServerSharedGeminiKey(key: string): void {
  serverSharedKey = key.trim();
}

export function getServerSharedGeminiKey(): string {
  return serverSharedKey;
}

export function hasSharedGeminiKey(): boolean {
  return Boolean(
    serverSharedKey ||
    (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim()
  );
}

export function getStoredGeminiKey(): string {
  const userKey = localStorage.getItem(GEMINI_KEY_STORAGE);
  if (userKey && userKey.trim()) return userKey.trim();

  if (serverSharedKey) return serverSharedKey;

  const envKey = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
  if (envKey) return envKey;

  return "";
}

// Shared server key is no longer exposed to browsers; proxying Gemini through the server is a possible future feature.
export async function fetchServerGeminiConfig(): Promise<string> {
  return "";
}

export function saveStoredGeminiKey(key: string): void {
  if (key.trim()) {
    localStorage.setItem(GEMINI_KEY_STORAGE, key.trim());
  } else {
    localStorage.removeItem(GEMINI_KEY_STORAGE);
  }
}

function getClient(apiKey?: string): GoogleGenAI {
  const key = apiKey?.trim() || getStoredGeminiKey();
  if (!key) {
    throw new Error(
      "Gemini API Key missing. Please provide your free Gemini key in the AI panel (from aistudio.google.com).",
    );
  }
  return new GoogleGenAI({ apiKey: key });
}

/**
 * Extracts plain text, stickies, and frame titles from canvas elements
 * so the AI can read and analyze the entire board.
 */
export function extractBoardContent(elements: readonly ExcalidrawElement[]): string {
  const stickies: string[] = [];
  const texts: string[] = [];
  const frames: string[] = [];

  for (const el of elements) {
    if (el.isDeleted) continue;
    const custom = el.customData as Record<string, unknown> | undefined;

    if ((el.type === "frame" && (el as any).name) || (custom?.isFrame && custom.frameTitle)) {
      frames.push(`Frame: "${(el as any).name || custom?.frameTitle}"`);
    }

    if (el.type === "text" && (el as unknown as { text?: string }).text) {
      const t = (el as unknown as { text: string }).text.trim();
      if (!t) continue;
      if (el.containerId) {
        stickies.push(`- Sticky: "${t.replace(/\n/g, " ")}"`);
      } else {
        texts.push(`- Text: "${t.replace(/\n/g, " ")}"`);
      }
    }
  }

  const sections: string[] = [];
  if (frames.length > 0) {
    sections.push(`## Board Frames / Slides:\n${frames.join("\n")}`);
  }
  if (stickies.length > 0) {
    sections.push(`## Sticky Notes (${stickies.length}):\n${stickies.join("\n")}`);
  }
  if (texts.length > 0) {
    sections.push(`## Other Text & Labels:\n${texts.join("\n")}`);
  }

  if (sections.length === 0) {
    return "(The canvas is currently empty. No sticky notes or text found.)";
  }

  return sections.join("\n\n");
}

/**
 * Generates valid Mermaid diagram code from natural language prompt.
 */
export async function aiGenerateDiagram(prompt: string, apiKey?: string): Promise<string> {
  const ai = getClient(apiKey);
  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: prompt,
    config: {
      systemInstruction:
        "You are an expert visual diagram architect. " +
        "Convert the user's request into valid Mermaid.js diagram syntax (e.g. flowchart TD, sequenceDiagram, classDiagram, erDiagram, stateDiagram-v2). " +
        "Return ONLY the pure Mermaid syntax. DO NOT include markdown code blocks (no ```mermaid), no backticks, no markdown formatting, and no commentary. Just raw Mermaid text.",
      temperature: 0.2,
    },
  });

  let raw = response.text || "";
  // Strip code fences if the model included them despite instructions
  raw = raw.replace(/^```(mermaid)?/i, "").replace(/```$/i, "").trim();
  return raw;
}

/**
 * Analyzes the board content and answers questions or provides a summary.
 */
export async function aiAnalyzeBoard(
  question: string,
  boardContent: string,
  apiKey?: string,
): Promise<string> {
  const ai = getClient(apiKey);
  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `Board Content:\n${boardContent}\n\nUser Question:\n${question}`,
    config: {
      systemInstruction:
        "You are an intelligent team collaborator analyzing a collaborative visual whiteboard. " +
        "Review the board content (sticky notes, frames, text labels) and answer the user's questions clearly, concisely, and actionably. " +
        "Format your answer with clear markdown bullet points.",
      temperature: 0.4,
    },
  });

  return response.text || "No analysis generated.";
}

export type StickyCluster = {
  category: string;
  stickies: string[];
};

/**
 * Groups a collection of messy sticky notes into thematic categories.
 */
export async function aiClusterStickies(
  stickies: string[],
  apiKey?: string,
): Promise<StickyCluster[]> {
  const ai = getClient(apiKey);
  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `Sticky notes to cluster:\n${stickies.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    config: {
      systemInstruction:
        "You are an agile facilitator. Categorize the given sticky notes into 3 to 6 logical thematic groups. " +
        "Return a JSON array of objects with the structure: [{ \"category\": \"Category Name\", \"stickies\": [\"exact sticky note text\"] }]. " +
        "Return ONLY valid JSON.",
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  try {
    const parsed = JSON.parse(response.text || "[]") as StickyCluster[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Generates 4 to 6 quick brainstormed ideas for a topic.
 */
export async function aiBrainstormIdeas(topic: string, apiKey?: string): Promise<string[]> {
  const ai = getClient(apiKey);
  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `Topic: ${topic}`,
    config: {
      systemInstruction:
        "Generate 4 to 6 creative, concise sticky note ideas for the given topic. " +
        "Return ONLY a JSON array of strings, e.g. [\"Idea 1\", \"Idea 2\"].",
      responseMimeType: "application/json",
      temperature: 0.7,
    },
  });

  try {
    const parsed = JSON.parse(response.text || "[]") as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
