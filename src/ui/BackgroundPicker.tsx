import { useEffect, useRef, useState } from "react";
import { VGUI_CANVAS_PICKS, vguiShade } from "./vguiColors";
import type { CanvasBackgroundImage } from "../crdt/scene";
import { assetObjectUrl, type AssetStore, ASSET_MAX_MB } from "../storage/assets";

type BackgroundPickerProps = {
  /** The board's current background, as Excalidraw reports it. */
  initialColor: string;
  /** Current background image config if any. */
  bgImage?: CanvasBackgroundImage;
  /** Asset store for uploading encrypted background wallpaper. */
  assetStore?: AssetStore;
  /** Called on every change, so the board updates live. */
  onChange?: (color: string) => void;
  onChangeColor?: (color: string) => void;
  /** Called when wallpaper changes (upload, tile toggle, remove). */
  onChangeBgImage?: (next: CanvasBackgroundImage | undefined) => void;
  onClose: () => void;
};

const HEX_INPUT = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#abc", "abc" or "#AABBCC" become lowercase "#aabbcc". Anything else is null. */
function normalizeHex(input: string): string | null {
  const m = HEX_INPUT.exec(input.trim());
  if (!m) return null;
  const digits = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return `#${digits.toLowerCase()}`;
}

/** Board background picker: a colour wheel, a hex field, VGUI presets, VGUI shade, and canvas wallpaper. */
export function BackgroundPicker({
  initialColor,
  bgImage,
  assetStore,
  onChange,
  onChangeColor,
  onChangeBgImage,
  onClose,
}: BackgroundPickerProps) {
  const [color, setColor] = useState(normalizeHex(initialColor) ?? "#283125");
  const [draft, setDraft] = useState(color);
  const shade = vguiShade(color);
  const invalid = normalizeHex(draft) === null;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (bgImage?.ref && assetStore) {
      assetObjectUrl(assetStore, bgImage.ref)
        .then((url) => {
          if (alive) setPreviewUrl(url);
        })
        .catch(() => {
          if (alive) setPreviewUrl(null);
        });
    } else {
      setPreviewUrl(null);
    }
    return () => {
      alive = false;
    };
  }, [bgImage?.ref, assetStore]);

  const fireColorChange = (hex: string) => {
    onChange?.(hex);
    onChangeColor?.(hex);
  };

  const apply = (next: string) => {
    const hex = next.toLowerCase();
    setColor(hex);
    setDraft(hex);
    fireColorChange(hex);
  };

  const handleDraft = (text: string) => {
    setDraft(text);
    const hex = normalizeHex(text);
    if (hex) {
      setColor(hex);
      fireColorChange(hex);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !assetStore) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      if (file.size > 25 * 1024 * 1024) {
        throw new Error(`File is too large (max ${ASSET_MAX_MB} MB).`);
      }
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const ref = await assetStore.put(bytes, file.type, { cacheObjectUrl: true });
      onChangeBgImage?.({ ref, tile: bgImage?.tile ?? false });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleTileToggle = (tile: boolean) => {
    if (bgImage?.ref) {
      onChangeBgImage?.({ ref: bgImage.ref, tile });
    }
  };

  const handleRemoveImage = () => {
    setPreviewUrl(null);
    onChangeBgImage?.(undefined);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="window-frame modal-window" onClick={(e) => e.stopPropagation()}>
        <div className="window-titlebar">
          <div className="window-title">
            <span className="window-lambda">λ</span>
            <span>Board Background</span>
          </div>
          <div className="window-controls">
            <button type="button" className="window-btn close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>
        <div className="card modal-body">
          <div className="card-head">
            <h1>Board background</h1>
            <p>The colour and wallpaper apply to everyone on this board live.</p>
          </div>

          <div className="bg-picker-row">
            <div className="swatch-wheel bg-picker-wheel" title="Pick any background colour">
              <input
                type="color"
                value={color}
                onChange={(e) => apply(e.target.value)}
                aria-label="Background colour wheel"
              />
            </div>
            <div className="field bg-picker-hex">
              <span>Hex</span>
              <input
                type="text"
                value={draft}
                onChange={(e) => handleDraft(e.target.value)}
                spellCheck={false}
                maxLength={7}
                aria-invalid={invalid}
              />
              {invalid && <small>Use a hex colour such as #283125.</small>}
            </div>
          </div>

          <div className="bg-picker-swatches" role="group" aria-label="Background presets">
            {VGUI_CANVAS_PICKS.map((c) => (
              <button
                key={c}
                type="button"
                className="swatch"
                style={{ background: c }}
                title={`Set background to ${c}`}
                aria-label={`Set background to ${c}`}
                onClick={() => apply(c)}
              />
            ))}
            <button
              type="button"
              className="swatch swatch-shade"
              style={{ background: shade }}
              title="VGUI shade of the current pick"
              aria-label={`Set background to VGUI shade ${shade}`}
              onClick={() => apply(shade)}
            />
          </div>

          <div className="bg-picker-divider" />

          <div className="bg-picker-section-title">Canvas Wallpaper</div>
          <div className="bg-picker-image-box">
            <div className="bg-picker-preview-row">
              {previewUrl ? (
                <div
                  className="bg-picker-thumb"
                  style={{
                    backgroundImage: `url(${previewUrl})`,
                    backgroundRepeat: bgImage?.tile ? "repeat" : "no-repeat",
                    backgroundSize: bgImage?.tile ? "auto" : "cover",
                    backgroundPosition: "center",
                  }}
                  title="Active wallpaper preview"
                />
              ) : (
                <div className="bg-picker-thumb bg-picker-thumb-empty">
                  <span>No image</span>
                </div>
              )}
              <div className="bg-picker-image-actions">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || !assetStore}
                >
                  {isUploading
                    ? "Uploading…"
                    : bgImage?.ref
                    ? "Change image…"
                    : "Upload wallpaper…"}
                </button>
                {bgImage?.ref && (
                  <button
                    type="button"
                    className="btn"
                    onClick={handleRemoveImage}
                    disabled={isUploading}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {bgImage?.ref && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(bgImage.tile)}
                  onChange={(e) => handleTileToggle(e.target.checked)}
                />
                <span>Tile pattern across canvas</span>
              </label>
            )}

            <span className="bg-picker-hint">
              {bgImage?.ref
                ? "Static behind canvas (doesn't move on pan/zoom). Encrypted in repo."
                : "Upload a pattern or image to sit fixed behind the canvas."}
            </span>

            {uploadError && (
              <small style={{ color: "#ff6b6b", marginTop: 2 }}>{uploadError}</small>
            )}
          </div>

          <div className="bg-picker-footer" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
