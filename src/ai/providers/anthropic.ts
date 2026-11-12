/**
 * Anthropic Claude API provider (Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus).
 */

import type { AIModelConfig, AgentResponse } from "../types";
import { AI_SYSTEM_PROMPT, parseActionsFromResponse, cleanMessageText } from "../tools";

export async function callAnthropic(
  prompt: string,
  config: AIModelConfig,
  contextText: string,
): Promise<AgentResponse> {
  if (!config.apiKey || !config.apiKey.trim()) {
    throw new Error("Anthropic API Key is missing. Please add your key starting with 'sk-ant-...' in AI settings.");
  }

  const userContent = `Board State Context:\n${contextText}\n\nUser Request:\n${prompt}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "dangerously-allow-browser": "true",
    },
    body: JSON.stringify({
      model: config.model || "claude-3-5-sonnet-20241022",
      max_tokens: 3000,
      system: AI_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let msg = `Anthropic API error (${response.status})`;
    try {
      const errJson = JSON.parse(errorText);
      if (errJson?.error?.message) msg = errJson.error.message;
    } catch {
      // Use raw status
    }
    throw new Error(msg);
  }

  const data = await response.json();
  const rawText = data?.content?.[0]?.text || "";
  const actions = parseActionsFromResponse(rawText);
  const message = cleanMessageText(rawText) || rawText;

  return { message, actions, raw: data };
}
