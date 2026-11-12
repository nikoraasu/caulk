import React, { useState, useMemo, useCallback } from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "./codeCard.css";

type Props = {
  element: ExcalidrawElement;
  onUpdateElement?: (elementId: string, customData: Record<string, unknown>) => void;
};

const LANGUAGES = [
  "typescript",
  "javascript",
  "python",
  "go",
  "rust",
  "bash",
  "sql",
  "json",
  "html",
  "css",
];

export const CodeSnippetCard: React.FC<Props> = ({ element, onUpdateElement }) => {
  const customData = (element.customData || {}) as Record<string, unknown>;
  const code = typeof customData.code === "string" ? customData.code : `// Enter code here...\nfunction example() {\n  return "Hello, Caulk!";\n}`;
  const language = typeof customData.language === "string" ? customData.language : "typescript";
  const title = typeof customData.title === "string" ? customData.title : "snippet.ts";

  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draftCode, setDraftCode] = useState(code);
  const [draftTitle, setDraftTitle] = useState(title);

  const lines = useMemo(() => (isEditing ? draftCode : code).split("\n"), [code, draftCode, isEditing]);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  const handleSave = () => {
    setIsEditing(false);
    onUpdateElement?.(element.id, {
      ...customData,
      code: draftCode,
      title: draftTitle,
    });
  };

  const handleLanguageChange = (newLang: string) => {
    onUpdateElement?.(element.id, {
      ...customData,
      language: newLang,
    });
  };

  // Simple, fast syntax tokenizer
  const renderHighlightedLine = (line: string) => {
    // Regex for basic syntax tokens
    const tokenRegex = /(\/\/.*$|#.*$|--.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|import|export|from|class|async|await|def|fn|pub|struct|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN)\b|\b(?:string|number|boolean|any|void|Promise|int|str|float|Option|Result)\b|\b\d+\b|\b[a-zA-Z0-9_$]+(?=\())/g;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      const token = match[0];
      let className = "";

      if (token.startsWith("//") || token.startsWith("#") || token.startsWith("--")) {
        className = "token-comment";
      } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith("`")) {
        className = "token-string";
      } else if (
        /^(const|let|var|function|return|if|else|import|export|from|class|async|await|def|fn|pub|struct|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN)$/.test(
          token,
        )
      ) {
        className = "token-keyword";
      } else if (/^(string|number|boolean|any|void|Promise|int|str|float|Option|Result)$/.test(token)) {
        className = "token-type";
      } else if (/^\d+$/.test(token)) {
        className = "token-number";
      } else {
        className = "token-fn";
      }

      parts.push(
        <span key={match.index} className={className}>
          {token}
        </span>,
      );
      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    return parts.length > 0 ? parts : "\u00A0";
  };

  return (
    <div className="caulk-code-card">
      <div className="caulk-code-header">
        <div className="caulk-code-meta">
          <select
            className="caulk-code-lang-select"
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
          {isEditing ? (
            <input
              type="text"
              className="caulk-code-title"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="filename.ext"
            />
          ) : (
            <span className="caulk-code-title">{title}</span>
          )}
        </div>
        <div className="caulk-code-actions">
          <button type="button" className="caulk-code-btn" onClick={handleCopy}>
            {copied ? "✓ Copied!" : "📋 Copy"}
          </button>
          {isEditing ? (
            <button type="button" className="caulk-code-btn" onClick={handleSave}>
              💾 Done
            </button>
          ) : (
            <button
              type="button"
              className="caulk-code-btn"
              onClick={() => {
                setDraftCode(code);
                setDraftTitle(title);
                setIsEditing(true);
              }}
            >
              ✏️ Edit
            </button>
          )}
        </div>
      </div>

      <div className="caulk-code-body">
        <div className="caulk-code-gutter">
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {isEditing ? (
          <textarea
            className="caulk-code-editor"
            value={draftCode}
            onChange={(e) => setDraftCode(e.target.value)}
            spellCheck={false}
          />
        ) : (
          <pre className="caulk-code-content">
            {lines.map((line, idx) => (
              <div key={idx}>{renderHighlightedLine(line)}</div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
};
