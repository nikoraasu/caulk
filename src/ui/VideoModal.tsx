import { useState, type ChangeEvent } from "react";
import { ASSET_MAX_MB } from "../storage/assets";

type Props = {
  open: boolean;
  onClose: () => void;
  onInsertVideo: (url: string, width: number, height: number) => void;
  /** Stores a local file in the board's repo and resolves to the element link. */
  uploadAsset: (bytes: Uint8Array, mime: string) => Promise<string>;
};

const ASPECT_RATIOS = [
  { label: "16:9 Standard (560 × 315)", width: 560, height: 315 },
  { label: "16:9 Large (800 × 450)", width: 800, height: 450 },
  { label: "9:16 Portrait / Shorts (315 × 560)", width: 315, height: 560 },
  { label: "4:3 Classic (600 × 450)", width: 600, height: 450 },
  { label: "1:1 Square (480 × 480)", width: 480, height: 480 },
];

export function VideoModal({ open, onClose, onInsertVideo, uploadAsset }: Props) {
  const [tab, setTab] = useState<"url" | "file">("url");
  const [url, setUrl] = useState("");
  const [aspectIndex, setAspectIndex] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const fileSizeMb = file ? +(file.size / (1024 * 1024)).toFixed(2) : null;
  const isFileOversized = file !== null && file.size > ASSET_MAX_MB * 1024 * 1024;

  const close = () => {
    if (!uploading) onClose();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setFile(e.target.files?.[0] ?? null);
  };

  const handleInsert = async () => {
    const selectedRatio = ASPECT_RATIOS[aspectIndex] || ASPECT_RATIOS[0];

    if (tab === "url") {
      const targetUrl = url.trim();
      if (!targetUrl) return;
      onInsertVideo(targetUrl, selectedRatio.width, selectedRatio.height);
      onClose();
      return;
    }

    if (!file || isFileOversized) return;
    setUploading(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ref = await uploadAsset(bytes, file.type || "application/octet-stream");
      onInsertVideo(ref, selectedRatio.width, selectedRatio.height);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const canInsert =
    tab === "url"
      ? Boolean(url.trim())
      : Boolean(file) && !isFileOversized && !uploading;

  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="window-frame modal-window"
        style={{ width: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="window-titlebar">
          <div className="window-title">
            <span className="window-lambda">λ</span>
            <span>Add Video to Whiteboard</span>
          </div>
          <button type="button" className="window-btn close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="card modal-body" style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              className={`topbar-btn ${tab === "url" ? "active" : ""}`}
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => setTab("url")}
            >
              🌐 Video Link (URL)
            </button>
            <button
              type="button"
              className={`topbar-btn ${tab === "file" ? "active" : ""}`}
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => setTab("file")}
            >
              📁 Upload Video Clip
            </button>
          </div>

          {tab === "url" ? (
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: "var(--vgui-light)",
                }}
              >
                Video or Embed URL:
              </label>
              <input
                type="text"
                className="vgui-input"
                style={{ width: "100%", boxSizing: "border-box", marginBottom: 8 }}
                placeholder="YouTube, Loom, Vimeo, Google Drive, or .mp4 link"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
              />
              <div
                style={{
                  fontSize: 11,
                  color: "var(--vgui-muted)",
                  lineHeight: 1.5,
                  marginBottom: 12,
                }}
              >
                Supported: <strong>YouTube &amp; Shorts</strong>, <strong>Loom</strong>,{" "}
                <strong>Vimeo</strong>, <strong>Google Drive</strong>, or direct{" "}
                <code>.mp4</code> / <code>.webm</code> links. You can also paste any link
                directly onto the canvas with <kbd>Ctrl+V</kbd>!
              </div>

              {/* Sample link buttons */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: "var(--vgui-muted)", alignSelf: "center" }}>
                  Try example:
                </span>
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() =>
                    setUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
                  }
                >
                  YouTube
                </button>
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() =>
                    setUrl("https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4")
                  }
                >
                  Direct MP4
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: "var(--vgui-light)",
                }}
              >
                Choose Local Video Clip (&le; {ASSET_MAX_MB} MB):
              </label>
              <input
                type="file"
                accept="video/mp4,video/webm,video/ogg,video/quicktime"
                onChange={handleFileChange}
                disabled={uploading}
                style={{
                  marginBottom: 8,
                  fontSize: 12,
                  color: "var(--vgui-light)",
                }}
              />
              {uploading && (
                <div style={{ fontSize: 12, color: "var(--vgui-orange)", marginBottom: 8 }}>
                  Uploading…
                </div>
              )}
              {file && fileSizeMb !== null && (
                <div style={{ fontSize: 11, color: "var(--vgui-light)", marginBottom: 8 }}>
                  Selected: <strong>{file.name}</strong> ({fileSizeMb} MB)
                  {isFileOversized && (
                    <div style={{ color: "#f87171", marginTop: 4, lineHeight: 1.4 }}>
                      ⚠️ File exceeds {ASSET_MAX_MB} MB. Pick a shorter clip, or paste a YouTube, Loom,
                      Google Drive, or hosted MP4 link in the <strong>Video Link</strong> tab.
                    </div>
                  )}
                </div>
              )}
              <div
                style={{
                  fontSize: 11,
                  color: "var(--vgui-muted)",
                  lineHeight: 1.5,
                  marginBottom: 12,
                }}
              >
                Clips are encrypted and stored in this board's repo. Collaborators load them when the board opens.
              </div>
            </div>
          )}

          {/* Size / Aspect ratio picker */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 6,
                color: "var(--vgui-light)",
              }}
            >
              Default Dimensions:
            </label>
            <select
              className="vgui-input"
              value={aspectIndex}
              onChange={(e) => setAspectIndex(Number(e.target.value))}
              style={{ width: "100%", boxSizing: "border-box" }}
            >
              {ASPECT_RATIOS.map((ratio, i) => (
                <option key={ratio.label} value={i}>
                  {ratio.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div style={{ color: "#f87171", fontSize: 12, marginBottom: 12, lineHeight: 1.4 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={close} disabled={uploading}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!canInsert}
              onClick={() => void handleInsert()}
            >
              {uploading ? "Uploading…" : "🎬 Add to Board"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
