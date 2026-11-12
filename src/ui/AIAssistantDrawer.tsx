import { useState, useEffect } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type * as Y from "yjs";
import {
  type AIProvider,
  type AIModelConfig,
  type AgentAction,
  PROVIDER_MODELS,
  getStoredConfig,
  saveStoredConfig,
  getDefaultModel,
  callAIModel,
  extractBoardContext,
  executeAgentActions,
} from "../ai";

type Props = {
  onClose: () => void;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
  doc?: Y.Doc | null;
  onToast: (msg: string) => void;
};

type ActiveTab = "chat" | "quick" | "settings";

export function AIAssistantDrawer({ onClose, apiRef, doc = null, onToast }: Props) {
  const [tab, setTab] = useState<ActiveTab>("chat");
  const [config, setConfig] = useState<AIModelConfig>(() => getStoredConfig());

  // Chat & Agent prompt state
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Response & Pending Actions state
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<AgentAction[]>([]);
  const [executedLogs, setExecutedLogs] = useState<string[]>([]);
  const [autoApply, setAutoApply] = useState(true);

  // Quick Action states
  const [quickInput, setQuickInput] = useState("");

  // Settings form state
  const [tempApiKey, setTempApiKey] = useState(config.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  useEffect(() => {
    setTempApiKey(config.apiKey);
  }, [config.provider, config.apiKey]);

  const activeProviderMeta = PROVIDER_MODELS[config.provider] || [];

  function handleProviderChange(newProvider: AIProvider) {
    const newModel = getDefaultModel(newProvider);
    const updated = {
      ...config,
      provider: newProvider,
      model: newModel,
      apiKey: getStoredConfig().apiKey,
    };
    setConfig(updated);
    saveStoredConfig({ provider: newProvider, model: newModel });
  }

  function handleSaveSettings(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const updated = { ...config, apiKey: tempApiKey };
    setConfig(updated);
    saveStoredConfig({
      provider: config.provider,
      model: config.model,
      apiKey: tempApiKey,
      baseUrl: config.baseUrl,
    });
    setTestStatus("✓ Settings saved locally.");
    onToast("✓ AI settings saved.");
    setTimeout(() => setTestStatus(null), 3000);
  }

  async function handleTestConnection() {
    if (!tempApiKey.trim() && config.provider !== "custom") {
      setTestStatus("❌ Please enter an API key first.");
      return;
    }
    setTestStatus("Testing connection...");
    try {
      const testConfig = { ...config, apiKey: tempApiKey };
      await callAIModel("Reply with the word 'OK'.", testConfig, "test");
      setTestStatus("✓ Connected successfully!");
      onToast("✓ AI model connection successful!");
    } catch (err: any) {
      setTestStatus(`❌ ${err?.message || String(err)}`);
    }
  }

  async function handleSendPrompt(customPrompt?: string) {
    const textToSend = customPrompt || prompt;
    if (!textToSend.trim()) return;

    if (!config.apiKey && config.provider !== "custom") {
      setTab("settings");
      setError(`Please provide your ${config.provider} API key first.`);
      return;
    }

    setLoading(true);
    setError(null);
    setLastMessage(null);
    setPendingActions([]);
    setExecutedLogs([]);

    try {
      const api = apiRef.current;
      const elements = api ? api.getSceneElements() : [];
      const appState = api ? api.getAppState() : undefined;
      const contextText = extractBoardContext(elements, doc, appState?.selectedElementIds);

      const res = await callAIModel(textToSend.trim(), config, contextText);
      setLastMessage(res.message);
      setPendingActions(res.actions);

      if (res.actions.length > 0) {
        if (autoApply && api) {
          const execRes = await executeAgentActions(res.actions, { doc, api });
          setExecutedLogs(execRes.summary);
          onToast(`✓ Executed ${execRes.executedCount} AI actions on the board.`);
          setPendingActions([]);
        }
      } else {
        onToast("✓ Response received.");
      }

      if (!customPrompt) setPrompt("");
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleManualApply() {
    const api = apiRef.current;
    if (!api || pendingActions.length === 0) return;

    const execRes = await executeAgentActions(pendingActions, { doc, api });
    setExecutedLogs(execRes.summary);
    onToast(`✓ Applied ${execRes.executedCount} actions to the board.`);
    setPendingActions([]);
  }

  return (
    <div className="vgui-ai-drawer" style={{ display: "flex", flexDirection: "column", height: "100%", padding: "12px", gap: "10px", background: "var(--color-surface, #242424)", color: "#e0e0e0", fontSize: "13px" }}>
      {/* Top Provider Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "16px" }}>🤖</span>
          <strong>Caulk Copilot</strong>
          <span style={{ fontSize: "10px", padding: "1px 6px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", color: "var(--theme-accent, #90CAF9)" }}>
            {config.provider.toUpperCase()}
          </span>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            type="button"
            className={`vgui-button${tab === "chat" ? " active" : ""}`}
            style={{ padding: "3px 8px", fontSize: "11px" }}
            onClick={() => setTab("chat")}
          >
            Chat
          </button>
          <button
            type="button"
            className={`vgui-button${tab === "quick" ? " active" : ""}`}
            style={{ padding: "3px 8px", fontSize: "11px" }}
            onClick={() => setTab("quick")}
          >
            Actions
          </button>
          <button
            type="button"
            className={`vgui-button${tab === "settings" ? " active" : ""}`}
            style={{ padding: "3px 8px", fontSize: "11px" }}
            onClick={() => setTab("settings")}
          >
            ⚙️ Config
          </button>
          <button
            type="button"
            className="vgui-button"
            style={{ padding: "3px 6px", fontSize: "11px", marginLeft: "4px" }}
            onClick={onClose}
            title="Close drawer"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
        {tab === "chat" && (
          <>
            {/* Auto-apply toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.2)", padding: "6px 8px", borderRadius: "4px", fontSize: "11px" }}>
              <span>Auto-apply actions to board:</span>
              <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={autoApply}
                  onChange={(e) => setAutoApply(e.target.checked)}
                />
                <span style={{ color: autoApply ? "#4ADE80" : "#9CA3AF" }}>{autoApply ? "ON" : "OFF"}</span>
              </label>
            </div>

            {/* Error banner */}
            {error && (
              <div style={{ background: "rgba(239, 68, 68, 0.2)", border: "1px solid #EF4444", borderRadius: "4px", padding: "8px", color: "#FCA5A5", fontSize: "12px" }}>
                <strong>Error:</strong> {error}
              </div>
            )}

            {/* Latest AI Message */}
            {lastMessage && (
              <div style={{ background: "rgba(255,255,255,0.05)", borderLeft: "3px solid var(--theme-accent, #60A5FA)", padding: "10px", borderRadius: "0 4px 4px 0", lineHeight: "1.4", whiteSpace: "pre-wrap" }}>
                {lastMessage}
              </div>
            )}

            {/* Pending actions (if auto-apply was OFF) */}
            {pendingActions.length > 0 && (
              <div style={{ background: "rgba(234, 179, 8, 0.15)", border: "1px solid #EAB308", borderRadius: "4px", padding: "10px" }}>
                <div style={{ fontWeight: "bold", color: "#FDE047", marginBottom: "6px" }}>
                  Proposed Actions ({pendingActions.length}):
                </div>
                <ul style={{ margin: "0 0 10px 18px", padding: 0, fontSize: "12px" }}>
                  {pendingActions.map((act, i) => (
                    <li key={i}>
                      <code>{act.type}</code>: {JSON.stringify(act).slice(0, 70)}...
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="vgui-button"
                  style={{ width: "100%", padding: "6px", background: "#EAB308", color: "#000", fontWeight: "bold" }}
                  onClick={handleManualApply}
                >
                  ✓ Apply Actions to Canvas & Tasks
                </button>
              </div>
            )}

            {/* Executed Logs */}
            {executedLogs.length > 0 && (
              <div style={{ background: "rgba(34, 197, 94, 0.1)", border: "1px solid #22C55E", borderRadius: "4px", padding: "8px", fontSize: "11px", color: "#86EFAC" }}>
                <div style={{ fontWeight: "bold", marginBottom: "4px" }}>Executed:</div>
                {executedLogs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "quick" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "11px", color: "#9CA3AF" }}>
              1-Click Intelligent Whiteboard Workflows:
            </div>

            <button
              type="button"
              className="vgui-button"
              disabled={loading}
              onClick={() => handleSendPrompt("Review the selected elements (or all stickies on board) and convert the actionable ones into structured Jira-grade Tasks with priority, status TODO, and subtasks.")}
              style={{ textAlign: "left", padding: "8px" }}
            >
              📋 <strong>Convert Stickies to Tasks</strong>
              <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>Turns selected or unorganized stickies into CRDT tasks in the Progress Manager</div>
            </button>

            <button
              type="button"
              className="vgui-button"
              disabled={loading}
              onClick={() => handleSendPrompt("Analyze the current board state and group all related stickies and elements into named Miro-style native frames by category.")}
              style={{ textAlign: "left", padding: "8px" }}
            >
              🗂️ <strong>Group Board into Frames</strong>
              <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>Automatically frames and tidies notes into themed category clusters</div>
            </button>

            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" }}>
              <label style={{ fontSize: "11px", color: "#9CA3AF" }}>✨ Brainstorm ideas onto canvas:</label>
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  type="text"
                  placeholder="e.g. Q1 Growth experiments"
                  value={quickInput}
                  onChange={(e) => setQuickInput(e.target.value)}
                  style={{ flex: 1, padding: "5px 8px", background: "rgba(0,0,0,0.3)", border: "1px solid #444", borderRadius: "3px", color: "#fff", fontSize: "12px" }}
                />
                <button
                  type="button"
                  className="vgui-button"
                  disabled={loading || !quickInput.trim()}
                  onClick={() => {
                    handleSendPrompt(`Brainstorm 6 creative, distinct sticky note ideas for "${quickInput}". Place them on the canvas with vibrant colors.`);
                    setQuickInput("");
                  }}
                  style={{ padding: "5px 10px" }}
                >
                  Generate
                </button>
              </div>
            </div>

            <button
              type="button"
              className="vgui-button"
              disabled={loading}
              onClick={() => handleSendPrompt("Analyze the entire board content and produce an executive summary with key themes, bottlenecks, and prioritized next steps.")}
              style={{ textAlign: "left", padding: "8px", marginTop: "6px" }}
            >
              🔍 <strong>Executive Summary & Bottlenecks</strong>
              <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>Synthesizes all stickies, frames, and tasks into high-level findings</div>
            </button>
          </div>
        )}

        {tab === "settings" && (
          <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#9CA3AF", marginBottom: "4px" }}>
                LLM Provider:
              </label>
              <select
                value={config.provider}
                onChange={(e) => handleProviderChange(e.target.value as AIProvider)}
                style={{ width: "100%", padding: "6px", background: "#1e1e1e", border: "1px solid #444", color: "#fff", borderRadius: "3px" }}
              >
                <option value="anthropic">Anthropic (Claude 3.5 Sonnet / Opus)</option>
                <option value="openai">OpenAI (GPT-4o / GPT-4o-mini / o1)</option>
                <option value="gemini">Google Gemini (Gemini 2.0 Flash / 1.5 Pro)</option>
                <option value="custom">Local / Ollama (OpenAI Compatible)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#9CA3AF", marginBottom: "4px" }}>
                Model:
              </label>
              <select
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                style={{ width: "100%", padding: "6px", background: "#1e1e1e", border: "1px solid #444", color: "#fff", borderRadius: "3px" }}
              >
                {activeProviderMeta.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: "11px", color: "#888", marginTop: "3px" }}>
                {activeProviderMeta.find((m) => m.id === config.model)?.description}
              </div>
            </div>

            {config.provider === "custom" && (
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#9CA3AF", marginBottom: "4px" }}>
                  Base URL (e.g. Ollama endpoint):
                </label>
                <input
                  type="text"
                  placeholder="http://localhost:11434/v1"
                  value={config.baseUrl || ""}
                  onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                  style={{ width: "100%", padding: "6px", background: "#1e1e1e", border: "1px solid #444", color: "#fff", borderRadius: "3px", fontSize: "12px" }}
                />
              </div>
            )}

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <label style={{ fontSize: "11px", color: "#9CA3AF" }}>
                  {config.provider === "anthropic" && "Anthropic API Key (sk-ant-...):"}
                  {config.provider === "openai" && "OpenAI API Key (sk-...):"}
                  {config.provider === "gemini" && "Gemini API Key:"}
                  {config.provider === "custom" && "Optional API Key:"}
                </label>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "#60A5FA", cursor: "pointer", fontSize: "10px" }}
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showKey ? "text" : "password"}
                placeholder={`Enter ${config.provider} API key`}
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                style={{ width: "100%", padding: "6px", background: "#1e1e1e", border: "1px solid #444", color: "#fff", borderRadius: "3px", fontSize: "12px" }}
              />
              <div style={{ fontSize: "10px", color: "#777", marginTop: "3px" }}>
                🔒 Stored only in your local browser storage. Never sent to any third party.
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
              <button
                type="button"
                className="vgui-button"
                onClick={handleTestConnection}
                style={{ flex: 1, padding: "6px" }}
              >
                Test Connection
              </button>
              <button
                type="submit"
                className="vgui-button"
                style={{ flex: 1, padding: "6px", background: "var(--theme-accent, #2563EB)", color: "#fff", fontWeight: "bold" }}
              >
                Save Config
              </button>
            </div>

            {testStatus && (
              <div style={{ fontSize: "11px", padding: "6px", borderRadius: "3px", background: testStatus.startsWith("✓") ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: testStatus.startsWith("✓") ? "#86EFAC" : "#FCA5A5" }}>
                {testStatus}
              </div>
            )}
          </form>
        )}
      </div>

      {/* Bottom Prompt Bar (available on chat tab) */}
      {tab === "chat" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "8px" }}>
          <div style={{ display: "flex", gap: "6px" }}>
            <textarea
              rows={3}
              placeholder="e.g. 'Plan user auth: create 3 tasks with assignees and link them to stickies on the board'..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSendPrompt();
                }
              }}
              style={{ flex: 1, padding: "8px", background: "#1a1a1a", border: "1px solid #444", borderRadius: "4px", color: "#fff", resize: "none", fontSize: "12px", fontFamily: "inherit" }}
            />
          </div>
          <button
            type="button"
            className="vgui-button"
            disabled={loading || !prompt.trim()}
            onClick={() => handleSendPrompt()}
            style={{ padding: "8px", background: loading ? "#555" : "var(--theme-accent, #2563EB)", color: "#fff", fontWeight: "bold" }}
          >
            {loading ? "Agent Thinking & Executing..." : "Send Instruction (Enter)"}
          </button>
        </div>
      )}
    </div>
  );
}
