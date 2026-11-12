/**
 * Local credential and preferences store for multi-model AI providers.
 * All keys remain strictly client-side in browser localStorage.
 */

import type { AIModelConfig, AIProvider } from "./types";

const STORAGE_PREFIX = "caulk.ai.";

export function getStoredConfig(): AIModelConfig {
  const provider = (localStorage.getItem(STORAGE_PREFIX + "provider") as AIProvider) || "anthropic";
  const model = localStorage.getItem(STORAGE_PREFIX + "model") || getDefaultModel(provider);
  const apiKey = getStoredApiKey(provider);
  const baseUrl = localStorage.getItem(STORAGE_PREFIX + "custom_base_url") || "http://localhost:11434/v1";

  return { provider, model, apiKey, baseUrl };
}

export function getDefaultModel(provider: AIProvider): string {
  switch (provider) {
    case "anthropic":
      return "claude-3-5-sonnet-20241022";
    case "openai":
      return "gpt-4o";
    case "gemini":
      return "gemini-2.0-flash";
    case "custom":
      return "llama3.3";
  }
}

export function getStoredApiKey(provider: AIProvider): string {
  const key = localStorage.getItem(STORAGE_PREFIX + `key.${provider}`);
  if (key && key.trim()) return key.trim();

  // Backward-compatibility: check legacy gemini key if provider is gemini
  if (provider === "gemini") {
    const legacy = localStorage.getItem("caulk.gemini_key.v1");
    if (legacy && legacy.trim()) return legacy.trim();
  }

  // Check Vite build-time environment variables
  if (provider === "anthropic" && import.meta.env.VITE_ANTHROPIC_API_KEY) {
    return (import.meta.env.VITE_ANTHROPIC_API_KEY as string).trim();
  }
  if (provider === "openai" && import.meta.env.VITE_OPENAI_API_KEY) {
    return (import.meta.env.VITE_OPENAI_API_KEY as string).trim();
  }
  if (provider === "gemini" && import.meta.env.VITE_GEMINI_API_KEY) {
    return (import.meta.env.VITE_GEMINI_API_KEY as string).trim();
  }

  return "";
}

export function saveStoredConfig(config: Partial<AIModelConfig>): void {
  if (config.provider) {
    localStorage.setItem(STORAGE_PREFIX + "provider", config.provider);
  }
  if (config.model) {
    localStorage.setItem(STORAGE_PREFIX + "model", config.model);
  }
  if (config.provider && config.apiKey !== undefined) {
    if (config.apiKey.trim()) {
      localStorage.setItem(STORAGE_PREFIX + `key.${config.provider}`, config.apiKey.trim());
    } else {
      localStorage.removeItem(STORAGE_PREFIX + `key.${config.provider}`);
    }
  }
  if (config.baseUrl !== undefined) {
    localStorage.setItem(STORAGE_PREFIX + "custom_base_url", config.baseUrl.trim());
  }
}
