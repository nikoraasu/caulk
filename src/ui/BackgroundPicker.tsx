import { useState } from "react";
import { VGUI_CANVAS_PICKS, vguiShade } from "./vguiColors";

type BackgroundPickerProps = {
  /** The board's current background, as Excalidraw reports it. */
  initialColor: string;
  /** Called on every change, so the board updates live. */
  onChange: (color: string) => void;
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

/** Board background picker: a colour wheel, a hex field, VGUI presets and a VGUI shade of the pick. */
export function BackgroundPicker({ initialColor, onChange, onClose }: BackgroundPickerProps) {
  const [color, setColor] = useState(normalizeHex(initialColor) ?? "#283125");
  const [draft, setDraft] = useState(color);
  const shade = vguiShade(color);
  const invalid = normalizeHex(draft) === null;

  const apply = (next: string) => {
    const hex = next.toLowerCase();
    setColor(hex);
    setDraft(hex);
    onChange(hex);
  };

  const handleDraft = (text: string) => {
    setDraft(text);
    const hex = normalizeHex(text);
    if (hex) {
      setColor(hex);
      onChange(hex);
    }
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
            <p>The colour applies to everyone on this board as soon as you pick it.</p>
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

          <div className="bg-picker-footer">
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
