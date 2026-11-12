/**
 * Multi-model dispatcher routing requests to Anthropic, OpenAI, Gemini, or Custom endpoints.
 */

import type { AIModelConfig, AgentResponse } from "../types";
import { callAnthropic } from "./anthropic";
import { callOpenAI } from "./openai";
import { callGemini } from "./gemini";

export async function callAIModel(
  prompt: string,
  config: AIModelConfig,
  contextText: string,
): Promise<AgentResponse> {
  switch (config.provider) {
    case "anthropic":
      return callAnthropic(prompt, config, contextText);
    case "openai":
    case "custom":
      return callOpenAI(prompt, config, contextText);
    case "gemini":
      return callGemini(prompt, config, contextText);
    default:
      throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}
