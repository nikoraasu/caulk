// VGUI-fitting colour picks. Shared by the Excalidraw build patch (build/excalidrawPalette.ts)
// and the Caulk UI, so there is one source of truth.

/** Excalidraw's quick stroke swatches. */
export const VGUI_STROKE_PICKS = ["#E9ECE4", "#C4B550", "#9FB38A", "#8FA6C1", "#C2674F"];

/** Excalidraw's quick background (fill) swatches. */
export const VGUI_FILL_PICKS = ["transparent", "#4B5844", "#6B7A5C", "#978730", "#7A4A3A"];

/** Excalidraw's quick canvas-background swatches. */
export const VGUI_CANVAS_PICKS = ["#283125", "#3E4637", "#4B5844", "#1B221B", "#C0C8BD"];

/** Muted sticky colours that sit well in VGUI and keep dark text readable. */
export const VGUI_STICKY_PICKS = ["#D8C76A", "#B8C98F", "#9FB7C9", "#D49A7A", "#C9B7D6", "#DADFD2"];

const VGUI_HUE = 80;
const HUE_MIX = 0.2;
const MAX_SATURATION = 0.45;
const MIN_LIGHTNESS = 0.22;
const MAX_LIGHTNESS = 0.82;

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const toHex2 = (n: number) => n.toString(16).padStart(2, "0");

/**
 * The VGUI-fitting version of any colour: hue pulled 20% toward the VGUI olive (shortest way
 * round the hue circle), saturation capped, lightness clamped. Non-hex input is returned unchanged.
 */
export function vguiShade(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [h, s, l] = rgbToHsl(...rgb);
  const delta = ((VGUI_HUE - h + 540) % 360) - 180;
  const nextH = (h + HUE_MIX * delta + 360) % 360;
  const nextS = Math.min(s, MAX_SATURATION);
  const nextL = Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, l));
  const [r, g, b] = hslToRgb(nextH, nextS, nextL);
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`.toUpperCase();
}
