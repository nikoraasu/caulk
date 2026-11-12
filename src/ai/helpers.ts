/**
 * High-level helper functions for specialized whiteboard tasks (clustering, diagrams, Q&A).
 * Powered by whichever model is configured in AI settings (Claude, OpenAI, Gemini, or Ollama).
 */

import { getStoredConfig } from "./storage";
import { callAIModel } from "./providers";

export type StickyCluster = {
  category: string;
  stickies: string[];
};

/**
 * Categorizes sticky notes into thematic groups.
 */
export async function aiClusterStickies(
  stickies: string[],
  apiKey?: string,
): Promise<StickyCluster[]> {
  const config = getStoredConfig();
  if (apiKey) config.apiKey = apiKey;

  const prompt = `Categorize the following sticky notes into 3 to 6 logical thematic groups:\n${stickies
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n")}\n\nReturn ONLY a JSON array in the format: [{"category": "Category Name", "stickies": ["exact sticky note text"]}]. No markdown formatting.`;

  const response = await callAIModel(prompt, config, "(Clustering task)");

  try {
    const raw = response.message;
    // Extract JSON block if present
    const jsonMatch = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : raw;
    const parsed = JSON.parse(jsonStr) as StickyCluster[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Generates Mermaid diagram syntax from a natural language description.
 */
export async function aiGenerateDiagram(
  prompt: string,
  apiKey?: string,
): Promise<string> {
  const config = getStoredConfig();
  if (apiKey) config.apiKey = apiKey;

  const systemInstruction =
    "Convert the following description into valid Mermaid.js diagram syntax (e.g. flowchart TD, sequenceDiagram, stateDiagram-v2). Return ONLY valid raw Mermaid syntax without commentary, backticks, or markdown blocks.";

  const response = await callAIModel(
    `${systemInstruction}\n\nDescription:\n${prompt}`,
    config,
    "",
  );

  let raw = response.message || "";
  raw = raw.replace(/^```(mermaid)?/i, "").replace(/```$/i, "").trim();
  return raw;
}

/**
 * Answers questions or produces an executive summary of the board.
 */
export async function aiAnalyzeBoard(
  question: string,
  boardContent: string,
  apiKey?: string,
): Promise<string> {
  const config = getStoredConfig();
  if (apiKey) config.apiKey = apiKey;

  const response = await callAIModel(
    `Analyze this board and answer: ${question}`,
    config,
    boardContent,
  );

  return response.message;
}
