import { useEffect, useMemo, useState } from "react";
import { exportToSvg, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { BUILTIN_TEMPLATES } from "./builtin";
import {
  listRepoTemplates,
  saveRepoTemplate,
  type RepoTemplateConfig,
} from "./store";
import type { BoardTemplate, TemplateElement } from "./types";
import "./templates.css";

function TemplateThumb({ elements }: { elements: TemplateElement[] }) {
  const [svgHtml, setSvgHtml] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const restored = restoreElements(
      elements as unknown as ExcalidrawElement[],
      null,
    );
    if (restored.length === 0) return;

    void exportToSvg({
      elements: restored,
      appState: {
        exportWithDarkMode: false,
        viewBackgroundColor: "#f5f5f5",
      },
      files: null,
      exportPadding: 16,
    }).then((svg: SVGSVGElement) => {
      if (cancelled) return;
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      setSvgHtml(svg.outerHTML);
    }).catch(() => {
      // Ignore preview failures; card title still renders.
    });

    return () => {
      cancelled = true;
    };
  }, [elements]);

  return (
    <div
      className="template-thumb"
      dangerouslySetInnerHTML={
        svgHtml
          ? { __html: svgHtml }
          : undefined
      }
    >
      {!svgHtml ? <span style={{ color: "#666", fontSize: 12 }}>Preview…</span> : null}
    </div>
  );
}

type GalleryProps = {
  open: boolean;
  repoConfig: RepoTemplateConfig | null;
  selectedElements?: TemplateElement[];
  includeBlankOption?: boolean;
  title?: string;
  onSelectTemplate: (template: BoardTemplate | null) => void;
  onClose: () => void;
  onToast?: (msg: string) => void;
};

export function TemplateGalleryModal({
  open,
  repoConfig,
  selectedElements = [],
  includeBlankOption = false,
  title = "Insert Template",
  onSelectTemplate,
  onClose,
  onToast,
}: GalleryProps) {
  const [search, setSearch] = useState("");
  const [repoTemplates, setRepoTemplates] = useState<BoardTemplate[]>([]);
  const [loadingRepo, setLoadingRepo] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !repoConfig) return;
    let cancelled = false;
    setLoadingRepo(true);
    void listRepoTemplates(repoConfig)
      .then((list) => {
        if (!cancelled) setRepoTemplates(list);
      })
      .catch(() => {
        if (!cancelled) setRepoTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRepo(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, repoConfig]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = [...repoTemplates, ...BUILTIN_TEMPLATES];
    if (!q) return all;
    return all.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    );
  }, [repoTemplates, search]);

  if (!open) return null;

  const handleSaveSelection = async () => {
    if (!repoConfig || selectedElements.length === 0 || !saveName.trim() || saving) return;
    setSaving(true);
    try {
      const saved = await saveRepoTemplate(repoConfig, {
        name: saveName.trim(),
        elements: selectedElements,
      });
      setRepoTemplates((prev) => [
        saved,
        ...prev.filter((item) => item.slug !== saved.slug),
      ]);
      setSaveName("");
      onToast?.(`Saved template "${saved.name}" to repo.`);
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : "Failed to save template.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="templates-backdrop" onClick={onClose}>
      <div className="templates-modal" onClick={(e) => e.stopPropagation()}>
        <div className="templates-header">
          <h3>{title}</h3>
          <button type="button" className="voting-banner-btn" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <div className="templates-toolbar">
          <input
            type="search"
            className="templates-search"
            placeholder="Search templates (Retro, Kanban, SWOT…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {loadingRepo && (
            <span style={{ fontSize: 11, opacity: 0.75 }}>Loading repo templates…</span>
          )}
        </div>

        <div className="templates-grid">
          {includeBlankOption && (
            <button
              type="button"
              className="template-card"
              onClick={() => onSelectTemplate(null)}
            >
              <div className="template-thumb" style={{ background: "#fafaf7", color: "#555" }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>+ Blank Board</span>
              </div>
              <div className="template-meta">
                <div className="template-meta-top">
                  <span className="template-name">Blank board</span>
                  <span className="template-badge">Empty</span>
                </div>
                <div className="template-desc">Start with a clean infinite canvas</div>
              </div>
            </button>
          )}

          {filtered.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="template-card"
              onClick={() => onSelectTemplate(tpl)}
            >
              <TemplateThumb elements={tpl.elements} />
              <div className="template-meta">
                <div className="template-meta-top">
                  <span className="template-name">{tpl.name}</span>
                  <span className="template-badge">
                    {tpl.source === "repo" ? "This repo" : tpl.category}
                  </span>
                </div>
                <div className="template-desc">{tpl.description}</div>
              </div>
            </button>
          ))}
        </div>

        {repoConfig && selectedElements.length > 0 && (
          <div className="template-save-box">
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              Save selection ({selectedElements.length} items) as template:
            </span>
            <input
              type="text"
              className="templates-search"
              style={{ maxWidth: 240 }}
              placeholder="Template name…"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
            />
            <button
              type="button"
              className="voting-banner-btn primary"
              disabled={!saveName.trim() || saving}
              onClick={() => void handleSaveSelection()}
            >
              {saving ? "Saving…" : "Save to repo"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
