export type BuiltinThemePresetId =
  | "vgui"
  | "frutiger-glacier"
  | "frutiger-aero"
  | "frutiger-aqua"
  | "frutiger-dorfic"
  | "frutiger-metal"
  | "windows-xp"
  | "mac-os9"
  | "win95"
  | "dos-tui"
  | "vaporwave";

export type BoardThemePresetId = BuiltinThemePresetId | "custom";

export type ThemeStyleMode =
  | "bevel"
  | "glass"
  | "xp"
  | "metal"
  | "neon"
  | "pinstripe"
  | "tui"
  | "flat";

export type ThemeUiColors = {
  /** Main panels, window frames, toolbars (--vgui-bg). */
  surface?: string;
  /** Sunken wells, inputs, inset areas (--vgui-base). */
  base?: string;
  /** Selected tools, highlights, title emphasis (--vgui-selected-bg & --vgui-accent). */
  accent?: string;
  /** Primary labels and toolbar icon color (--vgui-text & --ink). */
  text?: string;
};

export type ThemePresetSpec = {
  id: string;
  name: string;
  badge: string;
  tagline: string;
  font: string;
  radiusWindow: number;
  radiusControl: number;
  defaultColors: Required<ThemeUiColors>;
  suggestedCanvas: string;
  accentHighlight?: string;
  styleMode?: ThemeStyleMode;
};

export type BoardThemeConfig = {
  preset: BoardThemePresetId | string;
  colors?: ThemeUiColors;
  /** Custom UI chrome corner radius in pixels (0–32). Overrides the preset default. */
  radius?: number;
  /** Custom predefined rounding for canvas elements & sticky notes (0–64px). */
  elementRadius?: number;
  /** Automatically derive UI colors from the active canvas background color. */
  adaptToBackground?: boolean;
  /** Full custom theme definition when preset is "custom" or custom-defined. */
  customTheme?: ThemePresetSpec;
};

const HEX_COLOR = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeThemeHex(input: string | undefined): string | null {
  if (!input) return null;
  const m = HEX_COLOR.exec(input.trim());
  if (!m) return null;
  const digits =
    m[1].length === 3
      ? m[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : m[1];
  return `#${digits.toLowerCase()}`;
}

export const BOARD_THEME_PRESETS: Record<string, ThemePresetSpec> = {
  vgui: {
    id: "vgui",
    name: "Steam VGUI",
    badge: "VGUI",
    tagline: "Classic 2003 olive bevel chrome & gold accents",
    font: '"Tahoma", "MS Sans Serif", "Segoe UI", -apple-system, sans-serif',
    radiusWindow: 0,
    radiusControl: 0,
    styleMode: "bevel",
    defaultColors: {
      surface: "#4b5844",
      base: "#3e4637",
      accent: "#978730",
      text: "#ffffff",
    },
    accentHighlight: "#c59c3a",
    suggestedCanvas: "#283125",
  },
  "frutiger-glacier": {
    id: "frutiger-glacier",
    name: "Frutiger Glacier",
    badge: "GLACIER",
    tagline: "Subzero arctic crystalline frost, pure glacial ice & cryo cyan glow",
    font: '"Segoe UI", "Aptos", -apple-system, sans-serif',
    radiusWindow: 14,
    radiusControl: 8,
    styleMode: "glass",
    defaultColors: {
      surface: "#d6edfa",
      base: "#eff8ff",
      accent: "#00a2e8",
      text: "#082138",
    },
    accentHighlight: "#38d2ff",
    suggestedCanvas: "#c8e5f7",
  },
  "frutiger-aero": {
    id: "frutiger-aero",
    name: "Frutiger Aero",
    badge: "AERO",
    tagline: "Glossy translucent sky glass, aqua glow & soft depth",
    font: '"Segoe UI", "Trebuchet MS", -apple-system, sans-serif',
    radiusWindow: 12,
    radiusControl: 6,
    styleMode: "glass",
    defaultColors: {
      surface: "#cde8f8",
      base: "#ebf7fe",
      accent: "#0088e8",
      text: "#0b253a",
    },
    accentHighlight: "#00a6ff",
    suggestedCanvas: "#dff1fc",
  },
  "frutiger-aqua": {
    id: "frutiger-aqua",
    name: "Frutiger Aqua",
    badge: "AQUA",
    tagline: "Deep ocean marine glass, water droplets & luminous bioluminescent blue",
    font: '"Segoe UI", "Calibri", -apple-system, sans-serif',
    radiusWindow: 14,
    radiusControl: 8,
    styleMode: "glass",
    defaultColors: {
      surface: "#0b3b5b",
      base: "#06253c",
      accent: "#00d4ff",
      text: "#e0f7ff",
    },
    accentHighlight: "#38e1ff",
    suggestedCanvas: "#041c2e",
  },
  "frutiger-dorfic": {
    id: "frutiger-dorfic",
    name: "Frutiger Dorfic",
    badge: "DORFIC",
    tagline: "Warm early-2000s pastoral optimism, sunlight meadows & soft clay curves",
    font: '"Trebuchet MS", "Lucida Grande", "Segoe UI", sans-serif',
    radiusWindow: 16,
    radiusControl: 8,
    styleMode: "glass",
    defaultColors: {
      surface: "#e5ebd5",
      base: "#fbfdf7",
      accent: "#5a8f29",
      text: "#203014",
    },
    accentHighlight: "#7cb342",
    suggestedCanvas: "#d3e1bd",
  },
  "frutiger-metal": {
    id: "frutiger-metal",
    name: "Frutiger Metal",
    badge: "METAL",
    tagline: "Brushed titanium aluminum chrome with cryo-blue LED accents",
    font: '"Segoe UI", "Arial", sans-serif',
    radiusWindow: 4,
    radiusControl: 3,
    styleMode: "metal",
    defaultColors: {
      surface: "#b4bec8",
      base: "#dce2e8",
      accent: "#0074cc",
      text: "#151c24",
    },
    accentHighlight: "#2aa7ff",
    suggestedCanvas: "#272e36",
  },
  "windows-xp": {
    id: "windows-xp",
    name: "Windows XP",
    badge: "XP",
    tagline: "Authentic 2001 Luna royal blue titlebars, silver chrome & emerald accents",
    font: '"Tahoma", "Segoe UI", sans-serif',
    radiusWindow: 8,
    radiusControl: 3,
    styleMode: "xp",
    defaultColors: {
      surface: "#ece9d8",
      base: "#ffffff",
      accent: "#0058e6",
      text: "#000000",
    },
    accentHighlight: "#2ea836",
    suggestedCanvas: "#5a7edc",
  },
  "mac-os9": {
    id: "mac-os9",
    name: "Mac OS 9 Platinum",
    badge: "OS 9",
    tagline: "1999 Apple Platinum pinstripes, sapphire highlights & pill buttons",
    font: '"Charcoal", "Lucida Grande", "Geneva", "Segoe UI", sans-serif',
    radiusWindow: 5,
    radiusControl: 4,
    styleMode: "pinstripe",
    defaultColors: {
      surface: "#dcdcdc",
      base: "#ffffff",
      accent: "#3c5898",
      text: "#000000",
    },
    accentHighlight: "#587cc4",
    suggestedCanvas: "#6e7b8b",
  },
  win95: {
    id: "win95",
    name: "Win95/98 Classic",
    badge: "WIN95",
    tagline: "Redmond 1995 3D beveled gray, navy titlebars & zero border radius",
    font: '"MS Sans Serif", "Tahoma", sans-serif',
    radiusWindow: 0,
    radiusControl: 0,
    styleMode: "bevel",
    defaultColors: {
      surface: "#c0c0c0",
      base: "#ffffff",
      accent: "#000080",
      text: "#000000",
    },
    accentHighlight: "#1084d0",
    suggestedCanvas: "#008080",
  },
  "dos-tui": {
    id: "dos-tui",
    name: "DOS TUI",
    badge: "DOS",
    tagline: "Norton / Borland VGA box frames, ANSI blocks & monospace text",
    font: '"Cascadia Mono", "Consolas", "Lucida Console", monospace',
    radiusWindow: 0,
    radiusControl: 0,
    styleMode: "tui",
    defaultColors: {
      surface: "#0000aa",
      base: "#000033",
      accent: "#00aaaa",
      text: "#ffffff",
    },
    accentHighlight: "#ffff55",
    suggestedCanvas: "#000028",
  },
  vaporwave: {
    id: "vaporwave",
    name: "Vaporwave",
    badge: "VAPOR",
    tagline: "Neon magenta, electric cyan grids & dreamy late-night purple haze",
    font: '"Segoe UI", "Arial Black", sans-serif',
    radiusWindow: 4,
    radiusControl: 2,
    styleMode: "neon",
    defaultColors: {
      surface: "#2c124d",
      base: "#1b0a33",
      accent: "#ff71ce",
      text: "#01cdfe",
    },
    accentHighlight: "#05ffa1",
    suggestedCanvas: "#140527",
  },
};

export const BOARD_THEME_LIST: ThemePresetSpec[] = [
  BOARD_THEME_PRESETS.vgui,
  BOARD_THEME_PRESETS["frutiger-glacier"],
  BOARD_THEME_PRESETS["frutiger-aero"],
  BOARD_THEME_PRESETS["frutiger-aqua"],
  BOARD_THEME_PRESETS["frutiger-dorfic"],
  BOARD_THEME_PRESETS["frutiger-metal"],
  BOARD_THEME_PRESETS["windows-xp"],
  BOARD_THEME_PRESETS["mac-os9"],
  BOARD_THEME_PRESETS.win95,
  BOARD_THEME_PRESETS["dos-tui"],
  BOARD_THEME_PRESETS.vaporwave,
];

export function getThemePreset(presetId: string, customTheme?: ThemePresetSpec): ThemePresetSpec {
  if (presetId === "custom" && customTheme) return customTheme;
  return BOARD_THEME_PRESETS[presetId] ?? customTheme ?? BOARD_THEME_PRESETS.vgui;
}

/**
 * Curated starter templates for custom theme creation.
 */
export const CUSTOM_THEME_STARTERS: ThemePresetSpec[] = [
  {
    id: "amber-crt",
    name: "Cyberpunk Amber CRT",
    badge: "AMBER",
    tagline: "1980s phosphor amber terminal on obsidian black",
    font: '"Cascadia Mono", "Consolas", "Courier New", monospace',
    radiusWindow: 0,
    radiusControl: 0,
    styleMode: "tui",
    defaultColors: {
      surface: "#181005",
      base: "#0f0a02",
      accent: "#ffb000",
      text: "#ffcc44",
    },
    accentHighlight: "#ffe082",
    suggestedCanvas: "#0a0601",
  },
  {
    id: "dracula-night",
    name: "Dracula Night",
    badge: "DRACULA",
    tagline: "Gothic midnight slate, vampire pink accents & cyan glow",
    font: '"Segoe UI", -apple-system, sans-serif',
    radiusWindow: 10,
    radiusControl: 6,
    styleMode: "neon",
    defaultColors: {
      surface: "#282a36",
      base: "#1e1f29",
      accent: "#ff79c6",
      text: "#f8f8f2",
    },
    accentHighlight: "#8be9fd",
    suggestedCanvas: "#191a21",
  },
  {
    id: "nordic-ice",
    name: "Nordic Frost",
    badge: "NORD",
    tagline: "Arctic fjord deep navy, glacier ice white & pale blue sheen",
    font: '"Segoe UI", "Inter", sans-serif',
    radiusWindow: 12,
    radiusControl: 6,
    styleMode: "glass",
    defaultColors: {
      surface: "#2e3440",
      base: "#242933",
      accent: "#88c0d0",
      text: "#eceff4",
    },
    accentHighlight: "#81a1c1",
    suggestedCanvas: "#1e222a",
  },
  {
    id: "gameboy-1989",
    name: "Game Boy 1989",
    badge: "GB89",
    tagline: "Authentic 4-shade greenish monochrome DMG-01 LCD matrix",
    font: '"Courier New", "MS Sans Serif", monospace',
    radiusWindow: 2,
    radiusControl: 2,
    styleMode: "bevel",
    defaultColors: {
      surface: "#8bac0f",
      base: "#9bbc0f",
      accent: "#306230",
      text: "#0f380f",
    },
    accentHighlight: "#1f4a1f",
    suggestedCanvas: "#9bbc0f",
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    badge: "SOLAR",
    tagline: "Ethan Schoonover's scientifically calculated palette",
    font: '"Consolas", "Segoe UI", sans-serif',
    radiusWindow: 4,
    radiusControl: 3,
    styleMode: "flat",
    defaultColors: {
      surface: "#073642",
      base: "#002b36",
      accent: "#268bd2",
      text: "#93a1a1",
    },
    accentHighlight: "#b58900",
    suggestedCanvas: "#001e26",
  },
];

export const DEFAULT_BOARD_THEME: BoardThemeConfig = {
  preset: "vgui",
};

export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h = Math.round(h * 60);
  }
  return [h, Math.round(s * 100), Math.round(l * 100)];
}

export function hslToHex(h: number, s: number, l: number): string {
  const hNorm = (((h % 360) + 360) % 360) / 360;
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;

  if (sNorm === 0) {
    const val = Math.round(lNorm * 255);
    return rgbToHex(val, val, val);
  }

  const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
  const p = 2 * lNorm - q;

  const hue2rgb = (t: number) => {
    let tNorm = t;
    if (tNorm < 0) tNorm += 1;
    if (tNorm > 1) tNorm -= 1;
    if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
    if (tNorm < 1 / 2) return q;
    if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
    return p;
  };

  const r = Math.round(hue2rgb(hNorm + 1 / 3) * 255);
  const g = Math.round(hue2rgb(hNorm) * 255);
  const b = Math.round(hue2rgb(hNorm - 1 / 3) * 255);
  return rgbToHex(r, g, b);
}

export function deriveColorsFromBackground(
  canvasBg: string | undefined,
  presetId: string = "vgui",
): Required<ThemeUiColors> {
  const spec = (BOARD_THEME_PRESETS as Record<string, ThemePresetSpec>)[presetId] ?? BOARD_THEME_PRESETS.vgui;
  const cleanBg = normalizeThemeHex(canvasBg) ?? spec.suggestedCanvas;
  const [h, s, l] = hexToHsl(cleanBg);
  const isDark = l < 48;

  if (isDark) {
    // Dark canvas: UI surface is slightly elevated, base is sunken well, text is crisp white
    const surface = hslToHex(h, Math.min(s, 28), Math.max(16, Math.min(26, l + 10)));
    const base = hslToHex(h, Math.min(s, 32), Math.max(8, Math.min(15, l - 5)));
    const accentHue = s < 10 ? 205 : (h + 30) % 360;
    const accent = hslToHex(accentHue, Math.max(65, s), 56);
    const text = "#ffffff";
    return { surface, base, accent, text };
  } else {
    // Light canvas: UI surface is soft tinted light, base is crisp clean well, text is dark slate
    const surface = hslToHex(h, Math.min(s, 24), Math.max(88, Math.min(96, l - 5)));
    const base = hslToHex(h, Math.min(s, 30), 98);
    const accentHue = s < 10 ? 205 : h;
    const accent = hslToHex(accentHue, Math.max(75, s), 42);
    const text = hslToHex(h, Math.min(s, 25), 12);
    return { surface, base, accent, text };
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = normalizeThemeHex(hex) ?? "#4b5844";
  return [
    parseInt(clean.slice(1, 3), 16),
    parseInt(clean.slice(3, 5), 16),
    parseInt(clean.slice(5, 7), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function mixHex(a: string, b: string, ratioB: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const t = Math.max(0, Math.min(1, ratioB));
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

export type GeneratedThemePalette = {
  surface: string;
  base: string;
  accent: string;
  text: string;
  suggestedCanvas: string;
  accentHighlight: string;
};

/**
 * Generate a complete, harmonious theme palette from a single chosen main color.
 * Uses relative luminance to create fitting shades for UI surface, sunken wells,
 * vibrant accents, legible text, and atmospheric canvas backgrounds.
 */
export function generateShadesFromMainColor(mainColor: string): GeneratedThemePalette {
  const clean = normalizeThemeHex(mainColor) ?? "#4b5844";
  const [h, s, l] = hexToHsl(clean);
  const lum = relativeLuminance(clean);
  const isDark = lum < 0.38;

  if (isDark) {
    const surface = clean;
    const baseLightness = Math.max(6, Math.min(l - 5, Math.round(l * 0.75)));
    const base = hslToHex(h, Math.min(100, Math.round(s * 0.95)), baseLightness);

    let accentHue = h;
    let accentSat = Math.max(70, s);
    let accentLit = 54;
    if (s < 12) {
      accentHue = 42;
      accentSat = 85;
      accentLit = 54;
    } else if (h >= 55 && h <= 165) {
      accentHue = 40;
      accentSat = 86;
      accentLit = 52;
    } else if (h > 165 && h <= 250) {
      accentHue = (h + 30) % 360;
      accentLit = 55;
    } else if (h > 250 && h <= 325) {
      accentHue = 188;
      accentSat = 90;
      accentLit = 54;
    } else {
      accentHue = 45;
      accentSat = 90;
      accentLit = 52;
    }
    const accent = hslToHex(accentHue, accentSat, accentLit);
    const accentHighlight = hslToHex(accentHue, accentSat, Math.min(78, accentLit + 12));
    const text = "#ffffff";
    const canvasLit = Math.max(7, Math.min(l - 10, Math.round(l * 0.55)));
    const suggestedCanvas = hslToHex(h, Math.min(100, Math.round(s * 0.75)), canvasLit);

    return { surface, base, accent, text, suggestedCanvas, accentHighlight };
  } else {
    const surface = clean;
    const base = hslToHex(h, Math.min(100, Math.round(s * 0.6)), Math.min(99, Math.max(l + 4, 96)));
    let accentHue = h;
    if (s < 12) accentHue = 210;
    const accent = hslToHex(accentHue, Math.max(75, s), Math.max(28, Math.min(42, l - 40)));
    const accentHighlight = hslToHex(accentHue, Math.max(75, s), Math.max(36, Math.min(50, l - 30)));
    const text = hslToHex(h, Math.min(25, s), 12);
    const suggestedCanvas = hslToHex(h, Math.min(100, Math.round(s * 0.6)), Math.max(80, l - 8));

    return { surface, base, accent, text, suggestedCanvas, accentHighlight };
  }
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function sanitizeCustomThemeSpec(raw: unknown): ThemePresetSpec | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Partial<ThemePresetSpec>;
  const name =
    typeof obj.name === "string" && obj.name.trim()
      ? obj.name.trim().slice(0, 48)
      : "Custom Theme";
  const id =
    typeof obj.id === "string" && obj.id.trim()
      ? obj.id.trim().slice(0, 32)
      : "custom";
  const badge =
    typeof obj.badge === "string" && obj.badge.trim()
      ? obj.badge.trim().slice(0, 10).toUpperCase()
      : "CUSTOM";
  const tagline =
    typeof obj.tagline === "string"
      ? obj.tagline.trim().slice(0, 100)
      : "Custom user theme";
  const font =
    typeof obj.font === "string" && obj.font.trim()
      ? obj.font.trim().slice(0, 140)
      : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  const validModes: ThemeStyleMode[] = [
    "bevel",
    "glass",
    "xp",
    "metal",
    "neon",
    "pinstripe",
    "tui",
    "flat",
  ];
  const styleMode: ThemeStyleMode =
    typeof obj.styleMode === "string" && validModes.includes(obj.styleMode as ThemeStyleMode)
      ? (obj.styleMode as ThemeStyleMode)
      : "bevel";

  const radiusWindow =
    typeof obj.radiusWindow === "number" && Number.isFinite(obj.radiusWindow)
      ? Math.max(0, Math.min(32, Math.round(obj.radiusWindow)))
      : 4;
  const radiusControl =
    typeof obj.radiusControl === "number" && Number.isFinite(obj.radiusControl)
      ? Math.max(0, Math.min(16, Math.round(obj.radiusControl)))
      : Math.max(0, Math.round(radiusWindow * 0.6));

  const defColors =
    obj.defaultColors && typeof obj.defaultColors === "object"
      ? (obj.defaultColors as Partial<ThemeUiColors>)
      : {};
  const surface = normalizeThemeHex(defColors.surface) ?? "#2d3436";
  const base = normalizeThemeHex(defColors.base) ?? "#1e272e";
  const accent = normalizeThemeHex(defColors.accent) ?? "#0984e3";
  const text = normalizeThemeHex(defColors.text) ?? "#dfe6e9";
  const suggestedCanvas = normalizeThemeHex(obj.suggestedCanvas) ?? "#12171a";
  const accentHighlight = normalizeThemeHex(obj.accentHighlight) ?? accent;

  return {
    id,
    name,
    badge,
    tagline,
    font,
    radiusWindow,
    radiusControl,
    styleMode,
    defaultColors: { surface, base, accent, text },
    suggestedCanvas,
    accentHighlight,
  };
}

export function parseBoardTheme(raw: unknown): BoardThemeConfig | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<BoardThemeConfig>;
    if (!parsed || typeof parsed.preset !== "string") return undefined;

    const isBuiltin = parsed.preset in BOARD_THEME_PRESETS;
    const isCustom = parsed.preset === "custom" || Boolean(parsed.customTheme);
    if (!isBuiltin && !isCustom) return undefined;

    const preset = parsed.preset;
    const colors: ThemeUiColors = {};
    if (parsed.colors && typeof parsed.colors === "object") {
      const s = normalizeThemeHex(parsed.colors.surface);
      const b = normalizeThemeHex(parsed.colors.base);
      const a = normalizeThemeHex(parsed.colors.accent);
      const t = normalizeThemeHex(parsed.colors.text);
      if (s) colors.surface = s;
      if (b) colors.base = b;
      if (a) colors.accent = a;
      if (t) colors.text = t;
    }
    const radius =
      typeof parsed.radius === "number" && Number.isFinite(parsed.radius)
        ? Math.max(0, Math.min(32, Math.round(parsed.radius)))
        : undefined;
    const elementRadius =
      typeof parsed.elementRadius === "number" && Number.isFinite(parsed.elementRadius)
        ? Math.max(0, Math.min(64, Math.round(parsed.elementRadius)))
        : undefined;
    const adaptToBackground =
      typeof parsed.adaptToBackground === "boolean" ? parsed.adaptToBackground : undefined;

    const res: BoardThemeConfig = { preset };
    if (Object.keys(colors).length > 0) res.colors = colors;
    if (radius !== undefined) res.radius = radius;
    if (elementRadius !== undefined) res.elementRadius = elementRadius;
    if (adaptToBackground !== undefined) res.adaptToBackground = adaptToBackground;
    if (parsed.customTheme) {
      const sanitized = sanitizeCustomThemeSpec(parsed.customTheme);
      if (sanitized) res.customTheme = sanitized;
    }
    return res;
  } catch {
    return undefined;
  }
}

export function serializeBoardTheme(config: BoardThemeConfig): string {
  const clean: BoardThemeConfig = { preset: config.preset };
  if (config.colors) {
    const c: ThemeUiColors = {};
    const s = normalizeThemeHex(config.colors.surface);
    const b = normalizeThemeHex(config.colors.base);
    const a = normalizeThemeHex(config.colors.accent);
    const t = normalizeThemeHex(config.colors.text);
    if (s) c.surface = s;
    if (b) c.base = b;
    if (a) c.accent = a;
    if (t) c.text = t;
    if (Object.keys(c).length > 0) clean.colors = c;
  }
  if (typeof config.radius === "number" && Number.isFinite(config.radius)) {
    clean.radius = Math.max(0, Math.min(32, Math.round(config.radius)));
  }
  if (typeof config.elementRadius === "number" && Number.isFinite(config.elementRadius)) {
    clean.elementRadius = Math.max(0, Math.min(64, Math.round(config.elementRadius)));
  }
  if (typeof config.adaptToBackground === "boolean") {
    clean.adaptToBackground = config.adaptToBackground;
  }
  if (config.customTheme) {
    const sanitized = sanitizeCustomThemeSpec(config.customTheme);
    if (sanitized) clean.customTheme = sanitized;
  }
  return JSON.stringify(clean);
}

export function resolveEffectiveColors(
  config: BoardThemeConfig,
  currentCanvasBg?: string,
): Required<ThemeUiColors> {
  const spec =
    config.preset === "custom" && config.customTheme
      ? config.customTheme
      : ((BOARD_THEME_PRESETS as Record<string, ThemePresetSpec>)[config.preset] ??
        BOARD_THEME_PRESETS.vgui);
  if (config.adaptToBackground) {
    const derived = deriveColorsFromBackground(
      currentCanvasBg ?? spec.suggestedCanvas,
      config.preset,
    );
    return {
      surface: normalizeThemeHex(config.colors?.surface) ?? derived.surface,
      base: normalizeThemeHex(config.colors?.base) ?? derived.base,
      accent: normalizeThemeHex(config.colors?.accent) ?? derived.accent,
      text: normalizeThemeHex(config.colors?.text) ?? derived.text,
    };
  }
  return {
    surface: normalizeThemeHex(config.colors?.surface) ?? spec.defaultColors.surface,
    base: normalizeThemeHex(config.colors?.base) ?? spec.defaultColors.base,
    accent: normalizeThemeHex(config.colors?.accent) ?? spec.defaultColors.accent,
    text: normalizeThemeHex(config.colors?.text) ?? spec.defaultColors.text,
  };
}

/**
 * Push the resolved theme preset, corner radii, and UI colors onto `:root` so Caulk panels,
 * Excalidraw controls, modals, notifications, topbars, and video frames update globally.
 */
export function applyBoardThemeToDom(
  config: BoardThemeConfig = DEFAULT_BOARD_THEME,
  currentCanvasBg?: string,
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const spec =
    config.preset === "custom" && config.customTheme
      ? config.customTheme
      : ((BOARD_THEME_PRESETS as Record<string, ThemePresetSpec>)[config.preset] ??
        BOARD_THEME_PRESETS.vgui);
  const colors = resolveEffectiveColors(config, currentCanvasBg);
  const surfaceLum = relativeLuminance(colors.surface);
  const accentLum = relativeLuminance(colors.accent);
  const darkSurface = surfaceLum < 0.36;

  // Custom or preset corner radius
  const radiusWindow =
    typeof config.radius === "number" && Number.isFinite(config.radius)
      ? Math.max(0, Math.min(32, Math.round(config.radius)))
      : spec.radiusWindow;
  const radiusControl =
    typeof config.radius === "number" && Number.isFinite(config.radius)
      ? Math.max(0, Math.round(radiusWindow * 0.6))
      : spec.radiusControl;

  const styleMode: ThemeStyleMode = spec.styleMode ?? "bevel";

  // Preserve VGUI's authentic gold accent highlight unless user customized accent color.
  const hasCustomAccent = Boolean(normalizeThemeHex(config.colors?.accent));
  const accentHighlight =
    hasCustomAccent || !spec.accentHighlight
      ? mixHex(colors.accent, darkSurface ? "#ffffff" : "#ffd266", 0.25)
      : spec.accentHighlight;

  const light =
    spec.id === "dos-tui" || styleMode === "tui"
      ? mixHex(colors.accent, "#ffffff", 0.55)
      : mixHex(colors.surface, "#ffffff", darkSurface ? 0.28 : 0.72);
  const dark =
    spec.id === "dos-tui" || styleMode === "tui"
      ? mixHex(colors.surface, "#000000", 0.55)
      : mixHex(colors.surface, "#000000", darkSurface ? 0.35 : 0.32);

  let border = "#000000";
  if (spec.id === "frutiger-glacier" || styleMode === "glass") {
    border = darkSurface ? "rgba(0, 212, 255, 0.6)" : "rgba(255, 255, 255, 0.75)";
  } else if (spec.id === "frutiger-aqua") {
    border = "rgba(0, 212, 255, 0.6)";
  } else if (spec.id === "frutiger-dorfic") {
    border = "rgba(95, 145, 45, 0.4)";
  } else if (spec.id === "frutiger-metal" || styleMode === "metal") {
    border = mixHex(colors.surface, "#252b32", 0.65);
  } else if (spec.id === "vaporwave" || styleMode === "neon") {
    border = colors.accent;
  } else if (spec.id === "windows-xp" || styleMode === "xp") {
    border = "#0055ea";
  } else if (spec.id === "mac-os9" || styleMode === "pinstripe") {
    border = "#888888";
  } else if (spec.id === "win95" || styleMode === "bevel") {
    border = "#808080";
  } else if (styleMode === "tui") {
    border = "#ffffff";
  } else if (styleMode === "flat") {
    border = dark;
  }

  const hover = darkSurface
    ? mixHex(colors.surface, "#ffffff", 0.12)
    : mixHex(colors.surface, "#ffffff", 0.38);
  const selectedText = accentLum > 0.45 ? "#11161d" : "#ffffff";
  const textSoft = mixHex(colors.text, colors.surface, 0.26);
  const disabled = mixHex(colors.text, colors.surface, 0.52);

  root.setAttribute("data-board-theme", spec.id);
  root.setAttribute("data-theme-style-mode", styleMode);

  const isGlass = styleMode === "glass" || spec.id.startsWith("frutiger-") || spec.id === "vaporwave";

  // Translucent island background for glass themes
  const islandBg =
    spec.id === "frutiger-glacier"
      ? "rgba(224, 245, 255, 0.45)"
      : spec.id === "frutiger-aero"
      ? "rgba(205, 235, 252, 0.52)"
      : spec.id === "frutiger-aqua"
      ? "rgba(11, 59, 91, 0.62)"
      : spec.id === "vaporwave"
      ? "rgba(44, 18, 77, 0.65)"
      : isGlass
      ? rgba(colors.surface, 0.55)
      : colors.surface;

  // Compute style-mode specific CSS variables so custom themes look authentic out of the box
  let windowBg = colors.surface;
  let titlebarBg = colors.surface;
  let titlebarFg = colors.text;
  let btnBg = colors.surface;
  let btnHoverBg = hover;
  let btnActiveBg = colors.accent;
  let btnBorder = border;
  let btnPrimaryBg = colors.accent;
  let btnPrimaryFg = selectedText;
  let windowBoxShadow = `inset 1px 1px 0 ${light}, inset -1px -1px 0 ${dark}, 0 20px 48px rgba(0, 0, 0, 0.7)`;
  let backdropFilter = "none";
  let textShadow = "none";

  if (styleMode === "glass") {
    windowBg = `linear-gradient(135deg, ${rgba(colors.surface, darkSurface ? 0.7 : 0.6)} 0%, ${rgba(colors.base, darkSurface ? 0.5 : 0.35)} 50%, ${rgba(colors.surface, darkSurface ? 0.65 : 0.5)} 100%)`;
    titlebarBg = `linear-gradient(180deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.35) 48%, rgba(200, 235, 255, 0.15) 50%, ${rgba(colors.accent, 0.3)} 100%)`;
    titlebarFg = colors.text;
    btnBg = `linear-gradient(180deg, rgba(255, 255, 255, 0.88) 0%, ${rgba(colors.surface, 0.5)} 48%, ${rgba(colors.base, 0.4)} 50%, ${rgba(colors.surface, 0.65)} 100%)`;
    btnHoverBg = `linear-gradient(180deg, #ffffff 0%, rgba(255, 255, 255, 0.7) 48%, ${rgba(colors.accent, 0.4)} 50%, rgba(255, 255, 255, 0.85) 100%)`;
    btnActiveBg = `linear-gradient(180deg, ${mixHex(colors.accent, "#ffffff", 0.4)} 0%, ${colors.accent} 50%, ${mixHex(colors.accent, "#000000", 0.15)} 100%)`;
    btnBorder = "rgba(255, 255, 255, 0.85)";
    btnPrimaryBg = `linear-gradient(180deg, ${mixHex(colors.accent, "#ffffff", 0.45)} 0%, ${colors.accent} 48%, ${mixHex(colors.accent, "#000000", 0.15)} 100%)`;
    btnPrimaryFg = "#ffffff";
    windowBoxShadow = `inset 0 1.5px 0.5px rgba(255, 255, 255, 0.95), inset 0 0 0 1px rgba(255, 255, 255, 0.3), 0 14px 40px rgba(0, 30, 70, 0.35), 0 0 16px ${rgba(colors.accent, 0.35)}`;
    backdropFilter = "blur(24px) saturate(190%) brightness(105%)";
  } else if (styleMode === "xp") {
    windowBg = colors.surface;
    titlebarBg = `linear-gradient(180deg, ${colors.accent} 0%, ${mixHex(colors.accent, "#ffffff", 0.35)} 12%, ${colors.accent} 50%, ${mixHex(colors.accent, "#000000", 0.22)} 100%)`;
    titlebarFg = "#ffffff";
    btnBg = `linear-gradient(180deg, #ffffff 0%, ${colors.surface} 48%, ${mixHex(colors.surface, dark, 0.12)} 100%)`;
    btnHoverBg = `linear-gradient(180deg, #ffffff 0%, #fff7e0 40%, #ffe9b0 50%, #ffd975 100%)`;
    btnActiveBg = `linear-gradient(180deg, #51cf5e 0%, #38b446 45%, #2ea836 50%, #1e8326 100%)`;
    btnBorder = `1px solid ${mixHex(colors.accent, dark, 0.4)}`;
    btnPrimaryBg = `linear-gradient(180deg, #51cf5e 0%, #38b446 45%, #2ea836 50%, #1e8326 100%)`;
    btnPrimaryFg = "#ffffff";
    windowBoxShadow = `inset 1px 1px 0 #ffffff, inset -1px -1px 0 ${dark}, 0 8px 24px rgba(0, 40, 110, 0.28)`;
  } else if (styleMode === "metal") {
    windowBg = `linear-gradient(180deg, ${mixHex(colors.surface, "#ffffff", 0.35)} 0%, ${colors.surface} 48%, ${mixHex(colors.surface, "#000000", 0.15)} 100%)`;
    titlebarBg = `linear-gradient(180deg, ${mixHex(colors.surface, "#ffffff", 0.55)} 0%, ${colors.surface} 50%, ${mixHex(colors.surface, "#000000", 0.2)} 100%)`;
    titlebarFg = colors.text;
    btnBg = `linear-gradient(180deg, #ffffff 0%, ${colors.surface} 50%, ${mixHex(colors.surface, "#000000", 0.18)} 100%)`;
    btnHoverBg = `linear-gradient(180deg, #ffffff 0%, ${mixHex(colors.surface, "#ffffff", 0.3)} 50%, ${colors.surface} 100%)`;
    btnActiveBg = `linear-gradient(180deg, ${mixHex(colors.accent, "#ffffff", 0.4)} 0%, ${colors.accent} 100%)`;
    btnBorder = `1px solid ${mixHex(colors.surface, "#000000", 0.35)}`;
    btnPrimaryBg = `linear-gradient(180deg, ${mixHex(colors.accent, "#ffffff", 0.35)} 0%, ${colors.accent} 100%)`;
    btnPrimaryFg = "#ffffff";
    windowBoxShadow = `inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.4)`;
  } else if (styleMode === "neon") {
    windowBg = `linear-gradient(180deg, ${rgba(colors.surface, 0.85)} 0%, ${rgba(colors.base, 0.92)} 100%)`;
    titlebarBg = `linear-gradient(90deg, ${colors.accent} 0%, ${mixHex(colors.accent, accentHighlight, 0.5)} 50%, ${accentHighlight} 100%)`;
    titlebarFg = "#0a0214";
    btnBg = `linear-gradient(180deg, ${mixHex(colors.surface, colors.accent, 0.22)} 0%, ${colors.base} 100%)`;
    btnHoverBg = `linear-gradient(180deg, ${mixHex(colors.surface, colors.accent, 0.4)} 0%, ${colors.surface} 100%)`;
    btnActiveBg = `linear-gradient(180deg, ${mixHex(colors.accent, "#ffffff", 0.3)} 0%, ${colors.accent} 100%)`;
    btnBorder = `1px solid ${accentHighlight}`;
    btnPrimaryBg = `linear-gradient(180deg, ${mixHex(colors.accent, "#ffffff", 0.35)} 0%, ${colors.accent} 50%, ${mixHex(colors.accent, "#000000", 0.2)} 100%)`;
    btnPrimaryFg = "#ffffff";
    windowBoxShadow = `0 0 20px ${rgba(colors.accent, 0.45)}, inset 0 0 12px ${rgba(accentHighlight, 0.25)}, 0 12px 36px rgba(0, 0, 0, 0.7)`;
    textShadow = `0 0 8px ${rgba(colors.accent, 0.65)}`;
    backdropFilter = "blur(18px)";
  } else if (styleMode === "pinstripe") {
    windowBg = `repeating-linear-gradient(180deg, ${colors.surface} 0px, ${colors.surface} 1px, ${mixHex(colors.surface, "#000000", 0.08)} 1px, ${mixHex(colors.surface, "#000000", 0.08)} 2px)`;
    titlebarBg = `repeating-linear-gradient(180deg, ${mixHex(colors.surface, "#ffffff", 0.25)} 0px, ${mixHex(colors.surface, "#ffffff", 0.25)} 1px, ${colors.surface} 1px, ${colors.surface} 2px)`;
    titlebarFg = colors.text;
    btnBg = `linear-gradient(180deg, #ffffff 0%, ${colors.surface} 50%, ${mixHex(colors.surface, "#000000", 0.12)} 100%)`;
    btnHoverBg = `linear-gradient(180deg, #ffffff 0%, ${mixHex(colors.surface, "#ffffff", 0.2)} 50%, ${colors.surface} 100%)`;
    btnActiveBg = `linear-gradient(180deg, ${mixHex(colors.accent, "#ffffff", 0.25)} 0%, ${colors.accent} 100%)`;
    btnBorder = `1px solid ${mixHex(colors.surface, "#000000", 0.4)}`;
    btnPrimaryBg = `linear-gradient(180deg, ${mixHex(colors.accent, "#ffffff", 0.3)} 0%, ${colors.accent} 50%, ${mixHex(colors.accent, "#000000", 0.25)} 100%)`;
    btnPrimaryFg = "#ffffff";
    windowBoxShadow = `inset 1px 1px 0 #ffffff, inset -1px -1px 0 ${dark}, 0 6px 20px rgba(0, 0, 0, 0.22)`;
  } else if (styleMode === "tui") {
    windowBg = colors.surface;
    titlebarBg = colors.accent;
    titlebarFg = "#000000";
    btnBg = colors.accent;
    btnHoverBg = mixHex(colors.accent, "#ffffff", 0.2);
    btnActiveBg = accentHighlight;
    btnBorder = "1px solid #000000";
    btnPrimaryBg = accentHighlight;
    btnPrimaryFg = "#000000";
    windowBoxShadow = "4px 4px 0 #000000";
  } else if (styleMode === "flat") {
    windowBg = colors.surface;
    titlebarBg = mixHex(colors.surface, dark, 0.08);
    titlebarFg = colors.text;
    btnBg = mixHex(colors.surface, light, 0.12);
    btnHoverBg = mixHex(colors.surface, light, 0.25);
    btnActiveBg = colors.accent;
    btnBorder = `1px solid ${dark}`;
    btnPrimaryBg = colors.accent;
    btnPrimaryFg = selectedText;
    windowBoxShadow = `0 8px 30px rgba(0, 0, 0, 0.35)`;
  }

  const vars: Record<string, string> = {
    "--vgui-bg": colors.surface,
    "--vgui-base": colors.base,
    "--vgui-bg-dark": colors.base,
    "--vgui-bg-light": hover,
    "--vgui-fg": colors.text,
    "--vgui-text": colors.text,
    "--vgui-selected-bg": colors.accent,
    "--vgui-selected-fg": selectedText,
    "--vgui-light": light,
    "--vgui-dark": dark,
    "--vgui-border": border,
    "--vgui-border-light": light,
    "--vgui-border-dark": dark,
    "--vgui-disabled": disabled,
    "--vgui-accent": accentHighlight,
    "--vgui-hover": hover,
    "--vgui-muted": textSoft,
    "--vgui-canvas": spec.suggestedCanvas,
    "--vgui-surface-glass": rgba(colors.surface, isGlass ? 0.45 : 0.96),
    "--vgui-accent-glow": rgba(accentHighlight, 0.45),

    "--vgui-window-bg": windowBg,
    "--vgui-titlebar-bg": titlebarBg,
    "--vgui-titlebar-fg": titlebarFg,
    "--vgui-btn-bg": btnBg,
    "--vgui-btn-hover-bg": btnHoverBg,
    "--vgui-btn-active-bg": btnActiveBg,
    "--vgui-btn-border": btnBorder,
    "--vgui-btn-primary-bg": btnPrimaryBg,
    "--vgui-btn-primary-fg": btnPrimaryFg,
    "--vgui-box-shadow": windowBoxShadow,
    "--vgui-backdrop-filter": backdropFilter,
    "--vgui-text-shadow": textShadow,

    "--ink": colors.text,
    "--ink-soft": textSoft,
    "--line": dark,
    "--accent": colors.accent,

    "--theme-font": spec.font,
    "--ui-font": spec.font,
    "--theme-radius": `${radiusWindow}px`,
    "--theme-radius-sm": `${radiusControl}px`,
    "--border-radius-lg": `${radiusWindow}px`,
    "--border-radius-md": `${radiusControl}px`,
    "--border-radius-sm": `${Math.max(0, radiusControl - 2)}px`,

    "--island-bg-color": islandBg,
  };

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

export function resetBoardThemeOnDom(): void {
  applyBoardThemeToDom(DEFAULT_BOARD_THEME);
}
