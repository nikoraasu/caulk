export type BoardThemePresetId =
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

export type BoardThemeConfig = {
  preset: BoardThemePresetId;
  colors?: ThemeUiColors;
  /** Custom UI chrome corner radius in pixels (0–32). Overrides the preset default. */
  radius?: number;
  /** Custom predefined rounding for canvas elements & sticky notes (0–64px). */
  elementRadius?: number;
  /** Automatically derive UI colors from the active canvas background color. */
  adaptToBackground?: boolean;
};

export type ThemePresetSpec = {
  id: BoardThemePresetId;
  name: string;
  badge: string;
  tagline: string;
  font: string;
  radiusWindow: number;
  radiusControl: number;
  defaultColors: Required<ThemeUiColors>;
  suggestedCanvas: string;
  accentHighlight?: string;
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

export const BOARD_THEME_PRESETS: Record<BoardThemePresetId, ThemePresetSpec> = {
  vgui: {
    id: "vgui",
    name: "Steam VGUI",
    badge: "VGUI",
    tagline: "Classic 2003 olive bevel chrome & gold accents",
    font: '"Tahoma", "MS Sans Serif", "Segoe UI", -apple-system, sans-serif',
    radiusWindow: 0,
    radiusControl: 0,
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
    radiusWindow: 14,
    radiusControl: 8,
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
    radiusWindow: 6,
    radiusControl: 3,
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
  presetId: BoardThemePresetId = "vgui",
): Required<ThemeUiColors> {
  const spec = BOARD_THEME_PRESETS[presetId] ?? BOARD_THEME_PRESETS.vgui;
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

function mixHex(a: string, b: string, ratioB: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const t = Math.max(0, Math.min(1, ratioB));
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
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

export function parseBoardTheme(raw: unknown): BoardThemeConfig | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<BoardThemeConfig>;
    if (!parsed || typeof parsed.preset !== "string") return undefined;
    if (!(parsed.preset in BOARD_THEME_PRESETS)) return undefined;
    const preset = parsed.preset as BoardThemePresetId;
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
  return JSON.stringify(clean);
}

export function resolveEffectiveColors(
  config: BoardThemeConfig,
  currentCanvasBg?: string,
): Required<ThemeUiColors> {
  const spec = BOARD_THEME_PRESETS[config.preset] ?? BOARD_THEME_PRESETS.vgui;
  if (config.adaptToBackground) {
    const derived = deriveColorsFromBackground(currentCanvasBg ?? spec.suggestedCanvas, config.preset);
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
  const spec = BOARD_THEME_PRESETS[config.preset] ?? BOARD_THEME_PRESETS.vgui;
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

  // Preserve VGUI's authentic gold accent highlight unless user customized accent color.
  const hasCustomAccent = Boolean(normalizeThemeHex(config.colors?.accent));
  const accentHighlight =
    hasCustomAccent || !spec.accentHighlight
      ? mixHex(colors.accent, darkSurface ? "#ffffff" : "#ffd266", 0.25)
      : spec.accentHighlight;

  const light =
    config.preset === "dos-tui"
      ? mixHex(colors.accent, "#ffffff", 0.55)
      : mixHex(colors.surface, "#ffffff", darkSurface ? 0.28 : 0.72);
  const dark =
    config.preset === "dos-tui"
      ? mixHex(colors.surface, "#000000", 0.55)
      : mixHex(colors.surface, "#000000", darkSurface ? 0.35 : 0.32);

  let border = "#000000";
  if (config.preset === "frutiger-glacier") {
    border = "rgba(255, 255, 255, 0.75)";
  } else if (config.preset === "frutiger-aero") {
    border = "rgba(255, 255, 255, 0.75)";
  } else if (config.preset === "frutiger-aqua") {
    border = "rgba(0, 212, 255, 0.5)";
  } else if (config.preset === "frutiger-dorfic") {
    border = "rgba(95, 145, 45, 0.4)";
  } else if (config.preset === "frutiger-metal") {
    border = mixHex(colors.surface, "#252b32", 0.65);
  } else if (config.preset === "vaporwave") {
    border = "#ff71ce";
  } else if (config.preset === "windows-xp") {
    border = "#0055ea";
  } else if (config.preset === "mac-os9") {
    border = "#888888";
  } else if (config.preset === "win95") {
    border = "#808080";
  }

  const hover = darkSurface
    ? mixHex(colors.surface, "#ffffff", 0.1)
    : mixHex(colors.surface, "#ffffff", 0.38);
  const selectedText = accentLum > 0.45 ? "#11161d" : "#ffffff";
  const textSoft = mixHex(colors.text, colors.surface, 0.26);
  const disabled = mixHex(colors.text, colors.surface, 0.52);

  root.setAttribute("data-board-theme", spec.id);

  const isGlass = spec.id.startsWith("frutiger-") || spec.id === "vaporwave";

  // Translucent island background for glass themes
  const islandBg =
    config.preset === "frutiger-glacier"
      ? "rgba(224, 245, 255, 0.45)"
      : config.preset === "frutiger-aero"
      ? "rgba(205, 235, 252, 0.52)"
      : config.preset === "frutiger-aqua"
      ? "rgba(11, 59, 91, 0.62)"
      : config.preset === "vaporwave"
      ? "rgba(44, 18, 77, 0.65)"
      : colors.surface;

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
