/**
 * Google Gemini API provider (Gemini 2.0 Flash, Gemini 1.5 Pro).
 */

import { GoogleGenAI } from "@google/genai";
import type { AIModelConfig, AgentResponse } from "../types";
import { AI_SYSTEM_PROMPT, parseActionsFromResponse, cleanMessageText } from "../tools";

export async function callGemini(
  prompt: string,
  config: AIModelConfig,
  contextText: string,
): Promise<AgentResponse> {
  if (!config.apiKey || !config.apiKey.trim()) {
    throw new Error("Gemini API Key missing. Please provide your Gemini key in AI settings.");
  }

  const ai = new GoogleGenAI({ apiKey: config.apiKey.trim() });
  const modelName = config.model || "gemini-2.0-flash";

  const response = await ai.models.generateContent({
    model: modelName,
    contents: `Board State Context:\n${contextText}\n\nUser Request:\n${prompt}`,
    config: {
      systemInstruction: AI_SYSTEM_PROMPT,
      temperature: 0.3,
    },
  });

  const rawText = response.text || "";
  const actions = parseActionsFromResponse(rawText);
  const message = cleanMessageText(rawText) || rawText;

  return { message, actions, raw: response };
}
