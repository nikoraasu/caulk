import React from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "./bookmarkCard.css";

type Props = {
  element: ExcalidrawElement;
  onUpdateElement?: (elementId: string, customData: Record<string, unknown>) => void;
};

export const WebBookmarkCard: React.FC<Props> = ({ element }) => {
  const customData = (element.customData || {}) as Record<string, unknown>;
  const url = (element.link || customData.url || "https://example.com") as string;
  const title = (customData.title || url.replace(/^https?:\/\//, "")) as string;
  const description = (customData.description || "Interactive web bookmark reference on the canvas.") as string;
  const thumbnail = customData.thumbnail as string | undefined;

  let domain = "";
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = url.split("/")[0] || "web";
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

  return (
    <div className="caulk-bookmark-card">
      <div className="caulk-bookmark-hero">
        {thumbnail ? (
          <img src={thumbnail} alt={title} />
        ) : (
          <div className="caulk-bookmark-hero-placeholder">🌐</div>
        )}
        <div className="caulk-bookmark-domain-pill">
          <img
            src={faviconUrl}
            alt=""
            style={{ width: 12, height: 12, borderRadius: 2 }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
          <span>{domain}</span>
        </div>
      </div>

      <div className="caulk-bookmark-content">
        <div>
          <div className="caulk-bookmark-title" title={title}>
            {title}
          </div>
          <div className="caulk-bookmark-desc" title={description}>
            {description}
          </div>
        </div>

        <div className="caulk-bookmark-footer">
          <span style={{ fontSize: 9, color: "var(--vgui-muted, #d0d8cc)", opacity: 0.8 }}>
            BOOKMARK CARD
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="caulk-bookmark-link-btn"
            title={`Open ${url} in a new tab`}
          >
            <span>↗</span>
            <span>Open Link</span>
          </a>
        </div>
      </div>
    </div>
  );
};
