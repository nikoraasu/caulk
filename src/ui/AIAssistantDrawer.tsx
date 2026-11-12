import { useEffect, useState } from "react";
import {
  aiAnalyzeBoard,
  aiBrainstormIdeas,
  aiClusterStickies,
  aiGenerateDiagram,
  extractBoardContent,
  fetchServerGeminiConfig,
  getStoredGeminiKey,
  hasSharedGeminiKey,
  saveStoredGeminiKey,
} from "../ai/gemini";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { CaptureUpdateAction, convertToExcalidrawElements, restoreElements } from "@excalidraw/excalidraw";
import { sanitizeElement } from "../crdt/scene";

type Props = {
  onClose: () => void;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
  onToast: (msg: string) => void;
};

type Tab = "diagram" | "analyze" | "brainstorm" | "cluster";

const STICKY_PALETTE = ["#FEF08A", "#FED7AA", "#BBF7D0", "#BAE6FD", "#DDD6FE", "#FECDD3"];

export function AIAssistantDrawer({ onClose, apiRef, onToast }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("diagram");
  const [apiKey, setApiKey] = useState(() => getStoredGeminiKey());
  const [keySaved, setKeySaved] = useState(() => Boolean(getStoredGeminiKey()));
  const [showKeyInput, setShowKeyInput] = useState(() => !getStoredGeminiKey());

  // Mounted only while the AI sidebar is open, so this runs on each open.
  useEffect(() => {
    if (!getStoredGeminiKey()) {
      void fetchServerGeminiConfig().then((key) => {
        if (key) {
          setApiKey(key);
          setKeySaved(true);
          setShowKeyInput(false);
        }
      });
    }
  }, []);

  // Diagram tab
  const [diagramPrompt, setDiagramPrompt] = useState("");
  const [diagramResult, setDiagramResult] = useState<string | null>(null);

  // Analyze tab
  const [analyzeQuery, setAnalyzeQuery] = useState("");
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);

  // Brainstorm tab
  const [brainstormTopic, setBrainstormTopic] = useState("");

  // Loading state & errors
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSaveKey(e: React.FormEvent) {
    e.preventDefault();
    saveStoredGeminiKey(apiKey);
    setKeySaved(Boolean(apiKey.trim()));
    setShowKeyInput(false);
    onToast("✓ Gemini API key saved.");
  }

  // 1. Generate Diagram
  async function handleGenerateDiagram() {
    if (!diagramPrompt.trim()) return;
    setLoading(true);
    setError(null);
    setDiagramResult(null);

    try {
      const mermaidCode = await aiGenerateDiagram(diagramPrompt.trim(), apiKey);
      setDiagramResult(mermaidCode);
      onToast("✓ Diagram generated. Opening Mermaid tool...");

      // Open Excalidraw's built-in Mermaid importer dialog
      apiRef.current?.updateScene({
        appState: {
          openDialog: { name: "ttd", tab: "mermaid" },
        },
      });
      // Copy to clipboard for instant pasting
      await navigator.clipboard.writeText(mermaidCode).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // 2. Analyze Board
  async function handleAnalyzeBoard(promptText?: string) {
    const question = promptText || analyzeQuery;
    if (!question.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const elements = apiRef.current?.getSceneElements() || [];
      const boardContent = extractBoardContent(elements);
      const answer = await aiAnalyzeBoard(question.trim(), boardContent, apiKey);
      setAnalyzeResult(answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // 3. Brainstorm Sticky Notes
  async function handleBrainstorm() {
    if (!brainstormTopic.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const ideas = await aiBrainstormIdeas(brainstormTopic.trim(), apiKey);
      if (ideas.length === 0) {
        throw new Error("No ideas were returned.");
      }

      const api = apiRef.current;
      if (!api) return;
      const elements = api.getSceneElements();
      const appState = api.getAppState();

      // Find center of current viewport
      const startX = -appState.scrollX + appState.width / 2 - 250;
      const startY = -appState.scrollY + appState.height / 2 - 180;

      // Create a neat 2-column or 3-column grid of sticky notes
      const createdStickies = ideas.map((idea, idx) => {
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        const color = STICKY_PALETTE[idx % STICKY_PALETTE.length];

        return {
          type: "rectangle" as const,
          x: startX + col * 240,
          y: startY + row * 180,
          width: 220,
          height: 160,
          backgroundColor: color,
          fillStyle: "solid" as const,
          strokeColor: "transparent",
          roughness: 0,
          roundness: null,
          customData: { isSticky: true },
          label: {
            text: idea,
            fontSize: 18,
            fontFamily: 2,
            textAlign: "center" as const,
            verticalAlign: "middle" as const,
            strokeColor: "#1e1e1e",
          },
        };
      });

      const converted = convertToExcalidrawElements(createdStickies);
      const restored = restoreElements(
        [...elements.map(sanitizeElement), ...converted.map(sanitizeElement)],
        null,
      );
      api.updateScene({
        elements: restored as unknown as OrderedExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });

      onToast(`✓ Placed ${ideas.length} brainstormed sticky notes on canvas!`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // 4. Cluster Existing Sticky Notes
  async function handleClusterStickies() {
    const api = apiRef.current;
    if (!api) return;
    const elements = api.getSceneElements();

    // Extract all text from sticky notes
    const stickies: Array<{ id: string; text: string }> = [];
    for (const el of elements) {
      if (el.isDeleted) continue;
      if (
        (el.type === "rectangle" && (el.customData as Record<string, unknown> | undefined)?.isSticky) ||
        (el.type === "text" && el.containerId)
      ) {
        if (el.type === "text" && (el as unknown as { text?: string }).text) {
          stickies.push({ id: el.id, text: (el as unknown as { text: string }).text });
        }
      }
    }

    if (stickies.length < 2) {
      setError("Need at least 2 sticky notes on the canvas to cluster.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const clusters = await aiClusterStickies(
        stickies.map((s) => s.text),
        apiKey,
      );

      if (clusters.length === 0) {
        throw new Error("Unable to categorize notes.");
      }

      const appState = api.getAppState();
      const originX = -appState.scrollX + 60;
      const originY = -appState.scrollY + 100;

      const newElements: any[] = [];
      let currentFrameX = originX;

      clusters.forEach((cluster, clusterIdx) => {
        const frameWidth = 480;
        const noteWidth = 200;
        const noteHeight = 140;
        const padding = 20;

        const count = cluster.stickies.length;
        const rows = Math.ceil(count / 2);
        const frameHeight = Math.max(340, rows * 160 + 80);
        const frameId = `frame-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        // Sticky notes inside this frame (children precede the frame in scene order)
        const clusterStickyIds: string[] = [];
        cluster.stickies.forEach((text, noteIdx) => {
          const col = noteIdx % 2;
          const row = Math.floor(noteIdx / 2);
          const nx = currentFrameX + padding + col * (noteWidth + 20);
          const ny = originY + 60 + row * (noteHeight + 20);
          const color = STICKY_PALETTE[(clusterIdx + noteIdx) % STICKY_PALETTE.length];
          const noteId = `sticky-${frameId}-${noteIdx}`;
          clusterStickyIds.push(noteId);

          newElements.push({
            id: noteId,
            type: "rectangle",
            x: nx,
            y: ny,
            width: noteWidth,
            height: noteHeight,
            backgroundColor: color,
            fillStyle: "solid",
            strokeColor: "transparent",
            roughness: 0,
            roundness: null,
            frameId,
            customData: { isSticky: true },
            label: {
              text,
              fontSize: 16,
              fontFamily: 2,
              textAlign: "center",
              verticalAlign: "middle",
              strokeColor: "#1e1e1e",
            },
          });
        });

        // Native frame element
        newElements.push({
          id: frameId,
          type: "frame",
          name: `🗂️ ${cluster.category}`,
          children: clusterStickyIds,
          x: currentFrameX,
          y: originY,
          width: frameWidth,
          height: frameHeight,
          customData: { isFrame: true, frameTitle: cluster.category },
        });

        currentFrameX += frameWidth + 40;
      });

      const converted = convertToExcalidrawElements(newElements);
      const restored = restoreElements(
        [...elements.map(sanitizeElement), ...converted.map(sanitizeElement)],
        null,
      );
      api.updateScene({
        elements: restored as unknown as OrderedExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });

      onToast(`✓ Organized stickies into ${clusters.length} themed frames!`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="ai-sidebar-body"
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--vgui-bg)",
        color: "#FFFFFF",
      }}
    >
      {/* API Key Banner / Config */}
      {showKeyInput ? (
        <form
          onSubmit={handleSaveKey}
          style={{
            background: "var(--vgui-base)",
            borderBottom: "1px solid var(--vgui-border)",
            padding: "10px 12px",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--vgui-accent)", fontWeight: 700, marginBottom: 4 }}>
            Google AI Studio API Key (Free)
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 6 }}>
            {hasSharedGeminiKey()
              ? "Host shared key is active. Enter a personal key below only if you want to override it:"
              : "Paste your free Gemini key (or set GEMINI_API_KEY in api/config.php for all users):"}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              style={{ fontSize: 11, padding: "4px 6px" }}
            />
            <button type="submit" className="btn primary" style={{ fontSize: 11, padding: "4px 8px" }}>
              Save
            </button>
            {keySaved && (
              <button
                type="button"
                className="btn ghost"
                style={{ fontSize: 11, padding: "4px 8px" }}
                onClick={() => setShowKeyInput(false)}
              >
                Hide
              </button>
            )}
          </div>
        </form>
      ) : (
        <div
          style={{
            background: "var(--vgui-base)",
            borderBottom: "1px solid var(--vgui-dark)",
            padding: "5px 12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#4ade80" }}>●</span>
            <span style={{ color: "var(--vgui-light)" }}>
              {hasSharedGeminiKey() && !localStorage.getItem("caulk.gemini_key.v1")
                ? "Shared Host Key active (Free for all users)"
                : "API Key active (Gemini 3.8 Flash)"}
            </span>
          </div>
          <button
            type="button"
            className="btn ghost"
            style={{ fontSize: 10, padding: "2px 5px" }}
            onClick={() => setShowKeyInput(true)}
          >
            Change
          </button>
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--vgui-dark)",
          background: "var(--vgui-base)",
        }}
      >
        {(
          [
            { id: "diagram", label: "📊 Diagram" },
            { id: "analyze", label: "🔍 Analyze" },
            { id: "brainstorm", label: "💡 Ideas" },
            { id: "cluster", label: "🗂️ Cluster" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            style={{
              flex: 1,
              padding: "7px 4px",
              fontSize: 11,
              fontWeight: activeTab === t.id ? 700 : 500,
              background: activeTab === t.id ? "var(--vgui-bg)" : "transparent",
              color: activeTab === t.id ? "#FFFFFF" : "var(--ink-soft)",
              border: "none",
              borderRight: "1px solid var(--vgui-dark)",
              borderBottom: activeTab === t.id ? "2px solid var(--vgui-accent)" : "none",
              cursor: "pointer",
            }}
            onClick={() => {
              setActiveTab(t.id);
              setError(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <div className="note error" style={{ margin: 0, fontSize: 11 }}>{error}</div>}

        {/* 1. Diagram Tab */}
        {activeTab === "diagram" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, color: "#FFFFFF", fontWeight: 600 }}>
              Generate Diagrams from Description:
            </div>
            <textarea
              rows={4}
              value={diagramPrompt}
              onChange={(e) => setDiagramPrompt(e.target.value)}
              placeholder="e.g. Draw a microservice architecture with API gateway, auth service, user database, and redis cache"
              style={{
                width: "100%",
                background: "var(--vgui-base)",
                color: "#FFFFFF",
                border: "1px solid var(--vgui-dark)",
                padding: "8px",
                fontSize: 12,
                resize: "vertical",
              }}
            />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {[
                "Architecture Flow",
                "Auth Sequence",
                "Database ERD",
                "Git Branching",
              ].map((p) => (
                <button
                  key={p}
                  type="button"
                  className="btn ghost"
                  style={{ fontSize: 10, padding: "2px 6px" }}
                  onClick={() => setDiagramPrompt(`Draw a ${p} diagram`)}
                >
                  + {p}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn primary"
              disabled={loading || !diagramPrompt.trim()}
              onClick={handleGenerateDiagram}
            >
              {loading ? "Generating Diagram…" : "Generate Diagram"}
            </button>

            {diagramResult && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: "var(--vgui-accent)", fontWeight: 700, marginBottom: 4 }}>
                  Generated Mermaid Syntax (Copied):
                </div>
                <pre
                  style={{
                    background: "var(--vgui-base)",
                    padding: "8px",
                    fontSize: 10,
                    overflowX: "auto",
                    border: "1px solid var(--vgui-dark)",
                    maxHeight: 180,
                  }}
                >
                  {diagramResult}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* 2. Analyze Tab */}
        {activeTab === "analyze" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, color: "#FFFFFF", fontWeight: 600 }}>
              Ask Questions or Summarize the Board:
            </div>
            <textarea
              rows={3}
              value={analyzeQuery}
              onChange={(e) => setAnalyzeQuery(e.target.value)}
              placeholder="e.g. Summarize the main topics, or what are the top risks?"
              style={{
                width: "100%",
                background: "var(--vgui-base)",
                color: "#FFFFFF",
                border: "1px solid var(--vgui-dark)",
                padding: "8px",
                fontSize: 12,
                resize: "vertical",
              }}
            />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {[
                "Summarize Board",
                "Extract Action Items",
                "Identify Risks & Gaps",
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  className="btn ghost"
                  style={{ fontSize: 10, padding: "2px 6px" }}
                  onClick={() => {
                    setAnalyzeQuery(q);
                    void handleAnalyzeBoard(q);
                  }}
                >
                  ⚡ {q}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn primary"
              disabled={loading || !analyzeQuery.trim()}
              onClick={() => void handleAnalyzeBoard()}
            >
              {loading ? "Analyzing Board…" : "Analyze"}
            </button>

            {analyzeResult && (
              <div
                style={{
                  background: "var(--vgui-base)",
                  border: "1px solid var(--vgui-dark)",
                  padding: "10px",
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "#FFFFFF",
                  whiteSpace: "pre-wrap",
                }}
              >
                {analyzeResult}
              </div>
            )}
          </div>
        )}

        {/* 3. Brainstorm Tab */}
        {activeTab === "brainstorm" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, color: "#FFFFFF", fontWeight: 600 }}>
              Brainstorm Sticky Note Ideas:
            </div>
            <input
              value={brainstormTopic}
              onChange={(e) => setBrainstormTopic(e.target.value)}
              placeholder="e.g. Growth hacks for our Q2 roadmap"
              style={{
                width: "100%",
                background: "var(--vgui-base)",
                color: "#FFFFFF",
                border: "1px solid var(--vgui-dark)",
                padding: "8px",
                fontSize: 12,
              }}
            />

            <button
              type="button"
              className="btn primary"
              disabled={loading || !brainstormTopic.trim()}
              onClick={handleBrainstorm}
            >
              {loading ? "Brainstorming…" : "💡 Generate & Place Stickies"}
            </button>
            <small style={{ color: "var(--ink-soft)" }}>
              Places 4 to 6 colorful stickies organized in a grid at the center of your view.
            </small>
          </div>
        )}

        {/* 4. Cluster Tab */}
        {activeTab === "cluster" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, color: "#FFFFFF", fontWeight: 600 }}>
              Auto-Group Stickies into Themed Frames:
            </div>
            <p style={{ fontSize: 11, color: "var(--ink-soft)", margin: 0, lineHeight: 1.5 }}>
              Gemini reads all messy sticky notes on the canvas, categorizes them into themes (e.g. Architecture, Bugs, UX), and rearranges them into labeled frames!
            </p>

            <button
              type="button"
              className="btn primary"
              disabled={loading}
              onClick={handleClusterStickies}
              style={{ marginTop: 6 }}
            >
              {loading ? "Clustering Stickies…" : "🗂️ Cluster into Frames"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
