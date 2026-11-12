/**
 * OpenAI & OpenAI-compatible provider (GPT-4o, GPT-4o-mini, o1, Ollama, LocalAI).
 */

import type { AIModelConfig, AgentResponse } from "../types";
import { AI_SYSTEM_PROMPT, parseActionsFromResponse, cleanMessageText } from "../tools";

export async function callOpenAI(
  prompt: string,
  config: AIModelConfig,
  contextText: string,
): Promise<AgentResponse> {
  const isCustom = config.provider === "custom";
  const baseUrl = (config.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");

  if (!isCustom && (!config.apiKey || !config.apiKey.trim())) {
    throw new Error("OpenAI API Key is missing. Please add your key starting with 'sk-...' in AI settings.");
  }

  const userContent = `Board State Context:\n${contextText}\n\nUser Request:\n${prompt}`;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (config.apiKey && config.apiKey.trim()) {
    headers["Authorization"] = `Bearer ${config.apiKey.trim()}`;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model || (isCustom ? "llama3.3" : "gpt-4o"),
      messages: [
        { role: "system", content: AI_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let msg = `OpenAI API error (${response.status})`;
    try {
      const errJson = JSON.parse(errorText);
      if (errJson?.error?.message) msg = errJson.error.message;
    } catch {
      // Use raw status
    }
    throw new Error(msg);
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content || "";
  const actions = parseActionsFromResponse(rawText);
  const message = cleanMessageText(rawText) || rawText;

  return { message, actions, raw: data };
}
