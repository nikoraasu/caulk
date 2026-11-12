import { useEffect, useState } from "react";
import {
  BOARD_THEME_LIST,
  BOARD_THEME_PRESETS,
  CUSTOM_THEME_STARTERS,
  generateShadesFromMainColor,
  getThemePreset,
  mixHex,
  normalizeThemeHex,
  resolveEffectiveColors,
  sanitizeCustomThemeSpec,
  type BoardThemeConfig,
  type GeneratedThemePalette,
  type ThemePresetSpec,
  type ThemeStyleMode,
  type ThemeUiColors,
} from "./boardTheme";
import { soundEngine, type SoundPack } from "../audio/soundEngine";

type Props = {
  theme: BoardThemeConfig;
  currentCanvasBackground?: string;
  onChange: (next: BoardThemeConfig) => void;
  onApplyCanvasBackground: (color: string) => void;
  onClose: () => void;
};

type ColorFieldKey = keyof Required<ThemeUiColors>;

const FULL_HEX_RE = /^#?([0-9a-fA-F]{6})$/;
const SHORTHAND_HEX_RE = /^#?([0-9a-fA-F]{3})$/;

const COLOR_FIELDS: Array<{ key: ColorFieldKey; label: string; hint: string }> = [
  { key: "surface", label: "UI Surface", hint: "Toolbars, panels, frames" },
  { key: "base", label: "Inner Well", hint: "Inputs, recessed boxes" },
  { key: "accent", label: "Accent", hint: "Active tool & highlights" },
  { key: "text", label: "Text & Icons", hint: "Labels & toolbar icons" },
];

const STYLE_MODES: Array<{ mode: ThemeStyleMode; label: string; icon: string; desc: string }> = [
  { mode: "bevel", label: "3D Bevel", icon: "🔲", desc: "Win95 / VGUI 3D tactile bevels and sunken wells" },
  { mode: "glass", label: "Aero Glass", icon: "💎", desc: "Translucent frosted glass with specular shine & blur" },
  { mode: "xp", label: "Luna XP", icon: "🪟", desc: "Windows XP Luna royal blue glossy chrome & pill buttons" },
  { mode: "metal", label: "Brushed Metal", icon: "⚙️", desc: "Milled titanium & aluminum grain with LED indicators" },
  { mode: "neon", label: "Neon Synth", icon: "⚡", desc: "Vaporwave / Cyberpunk neon borders & glowing text" },
  { mode: "pinstripe", label: "Pinstripes", icon: "🍏", desc: "Apple Platinum 1999 pinstripes & sapphire buttons" },
  { mode: "tui", label: "DOS TUI", icon: "💻", desc: "Borland / Norton VGA box frames & monospace text" },
  { mode: "flat", label: "Minimal Flat", icon: "▫️", desc: "Clean contemporary crisp borders and subtle depth" },
];

const FONT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Classic Tahoma / Sans", value: '"Tahoma", "Segoe UI", -apple-system, sans-serif' },
  { label: "MS Sans Serif (Win95/98)", value: '"MS Sans Serif", "Tahoma", sans-serif' },
  { label: "Segoe Glass (Aero/Vista)", value: '"Segoe UI", "Trebuchet MS", sans-serif' },
  { label: "Cascadia / Consolas Monospace (CRT)", value: '"Cascadia Mono", "Consolas", monospace' },
  { label: "Apple Charcoal / Geneva (Mac OS 9)", value: '"Charcoal", "Lucida Grande", "Geneva", sans-serif' },
  { label: "Modern Inter / System", value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
];

const UI_RADIUS_PRESETS: Array<{ label: string; value: number }> = [
  { label: "Sharp 0px", value: 0 },
  { label: "Subtle 4px", value: 4 },
  { label: "Classic 8px", value: 8 },
  { label: "Aero 14px", value: 14 },
  { label: "Smooth 20px", value: 20 },
  { label: "Pill 28px", value: 28 },
];

export function ThemePickerModal({
  theme,
  currentCanvasBackground,
  onChange,
  onApplyCanvasBackground,
  onClose,
}: Props) {
  const effective = resolveEffectiveColors(theme, currentCanvasBackground);
  const presetSpec = getThemePreset(theme.preset, theme.customTheme);
  const isCustomActive = theme.preset === "custom" || Boolean(theme.customTheme);

  const [activeTab, setActiveTab] = useState<"presets" | "custom">(() =>
    isCustomActive ? "custom" : "presets",
  );
  const [matchCanvas, setMatchCanvas] = useState(true);
  const [drafts, setDrafts] = useState<Required<ThemeUiColors>>(effective);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Main color picker state for generating matching shades
  const [mainColorDraft, setMainColorDraft] = useState<string>(() => effective.surface);
  const generatedPalette: GeneratedThemePalette = generateShadesFromMainColor(mainColorDraft);

  // Custom theme editor state
  const [customDraft, setCustomDraft] = useState<ThemePresetSpec>(() => {
    if (theme.customTheme) return { ...theme.customTheme };
    return {
      id: "custom",
      name: "My Custom Theme",
      badge: "CUSTOM",
      tagline: "Custom user theme",
      font: presetSpec.font,
      radiusWindow: typeof theme.radius === "number" ? theme.radius : presetSpec.radiusWindow,
      radiusControl:
        typeof theme.radius === "number"
          ? Math.max(0, Math.round(theme.radius * 0.6))
          : presetSpec.radiusControl,
      styleMode: presetSpec.styleMode ?? "bevel",
      defaultColors: {
        surface: effective.surface,
        base: effective.base,
        accent: effective.accent,
        text: effective.text,
      },
      suggestedCanvas: currentCanvasBackground || presetSpec.suggestedCanvas,
      accentHighlight: presetSpec.accentHighlight || effective.accent,
    };
  });

  const [customColorDrafts, setCustomColorDrafts] = useState<Record<string, string>>(() => ({
    surface: customDraft.defaultColors.surface,
    base: customDraft.defaultColors.base,
    accent: customDraft.defaultColors.accent,
    text: customDraft.defaultColors.text,
    suggestedCanvas: customDraft.suggestedCanvas,
  }));

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const currentUiRadius =
    typeof theme.radius === "number" ? theme.radius : presetSpec.radiusWindow;
  const isCustomUiRadius = typeof theme.radius === "number";

  const [soundConfig, setSoundConfig] = useState(() => soundEngine.getConfig());

  const handleToggleSound = (enabled: boolean) => {
    soundEngine.setEnabled(enabled);
    setSoundConfig(soundEngine.getConfig());
    if (enabled) soundEngine.play("click");
  };

  const handleSoundVolume = (vol: number) => {
    soundEngine.setVolume(vol);
    setSoundConfig(soundEngine.getConfig());
  };

  const handleSoundPack = (pack: SoundPack) => {
    soundEngine.setSoundPack(pack);
    setSoundConfig(soundEngine.getConfig());
    soundEngine.play("create", pack);
  };

  const handleTestSound = () => {
    soundEngine.play("create");
  };

  // Synchronize drafts when preset changes, without clobbering active keystrokes
  useEffect(() => {
    const fresh = resolveEffectiveColors(theme, currentCanvasBackground);
    setDrafts((prev) => ({
      surface: FULL_HEX_RE.test(prev.surface) ? fresh.surface : prev.surface,
      base: FULL_HEX_RE.test(prev.base) ? fresh.base : prev.base,
      accent: FULL_HEX_RE.test(prev.accent) ? fresh.accent : prev.accent,
      text: FULL_HEX_RE.test(prev.text) ? fresh.text : prev.text,
    }));
  }, [
    theme.preset,
    theme.adaptToBackground,
    theme.colors?.surface,
    theme.colors?.base,
    theme.colors?.accent,
    theme.colors?.text,
    currentCanvasBackground,
  ]);

  const selectPreset = (presetId: string) => {
    onChange({ preset: presetId });
    if (matchCanvas && (BOARD_THEME_PRESETS as Record<string, ThemePresetSpec>)[presetId]) {
      onApplyCanvasBackground(BOARD_THEME_PRESETS[presetId].suggestedCanvas);
    }
  };

  const handleUiRadiusChange = (val: number) => {
    const clamped = Math.max(0, Math.min(32, Math.round(val)));
    onChange({
      ...theme,
      radius: clamped,
    });
  };

  const handleResetUiRadius = () => {
    const next: BoardThemeConfig = { ...theme };
    delete next.radius;
    onChange(next);
  };

  const handleToggleAdapt = (enabled: boolean) => {
    onChange({
      ...theme,
      adaptToBackground: enabled,
    });
  };

  // Quick Override Color Handlers (Does not autocomplete while typing!)
  const handleQuickHexChange = (key: ColorFieldKey, rawValue: string) => {
    const text = rawValue.startsWith("#") ? rawValue : (rawValue.length > 0 ? `#${rawValue}` : "");
    setDrafts((prev) => ({ ...prev, [key]: text }));

    // Only commit live changes when a full 6-digit hex code is typed
    const match = FULL_HEX_RE.exec(text);
    if (match) {
      const fullHex = `#${match[1].toLowerCase()}`;
      onChange({
        ...theme,
        colors: {
          ...theme.colors,
          [key]: fullHex,
        },
      });
    }
  };

  const handleQuickHexBlur = (key: ColorFieldKey) => {
    const raw = (drafts[key] || "").trim();
    const match3 = SHORTHAND_HEX_RE.exec(raw);
    if (match3) {
      const d = match3[1];
      const fullHex = `#${d[0]}${d[0]}${d[1]}${d[1]}${d[2]}${d[2]}`.toLowerCase();
      setDrafts((prev) => ({ ...prev, [key]: fullHex }));
      onChange({
        ...theme,
        colors: {
          ...theme.colors,
          [key]: fullHex,
        },
      });
      return;
    }
    const match6 = FULL_HEX_RE.exec(raw);
    if (match6) {
      const fullHex = `#${match6[1].toLowerCase()}`;
      setDrafts((prev) => ({ ...prev, [key]: fullHex }));
      onChange({
        ...theme,
        colors: {
          ...theme.colors,
          [key]: fullHex,
        },
      });
      return;
    }
    // Revert invalid hex on blur
    setDrafts((prev) => ({ ...prev, [key]: effective[key] }));
  };

  const handleQuickColorPicker = (key: ColorFieldKey, hex: string) => {
    const clean = hex.toLowerCase();
    setDrafts((prev) => ({ ...prev, [key]: clean }));
    onChange({
      ...theme,
      colors: {
        ...theme.colors,
        [key]: clean,
      },
    });
  };

  // Magic Main Color Palette Application
  const applyMainColorPalette = (chosenHex?: string) => {
    const target = chosenHex ?? mainColorDraft;
    const clean = normalizeThemeHex(target) ?? target;
    const palette = generateShadesFromMainColor(clean);
    setDrafts({
      surface: palette.surface,
      base: palette.base,
      accent: palette.accent,
      text: palette.text,
    });
    setMainColorDraft(palette.surface);
    onChange({
      ...theme,
      colors: {
        surface: palette.surface,
        base: palette.base,
        accent: palette.accent,
        text: palette.text,
      },
    });
    if (matchCanvas && palette.suggestedCanvas) {
      onApplyCanvasBackground(palette.suggestedCanvas);
    }
    setStatusMsg(`✓ Applied theme shades generated from ${palette.surface}`);
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleMainColorHexChange = (rawText: string) => {
    const text = rawText.startsWith("#") ? rawText : (rawText.length > 0 ? `#${rawText}` : "");
    setMainColorDraft(text);
    const match = FULL_HEX_RE.exec(text);
    if (match) {
      applyMainColorPalette(`#${match[1].toLowerCase()}`);
    }
  };

  const handleMainColorHexBlur = () => {
    const raw = mainColorDraft.trim();
    const match3 = SHORTHAND_HEX_RE.exec(raw);
    if (match3) {
      const d = match3[1];
      const fullHex = `#${d[0]}${d[0]}${d[1]}${d[1]}${d[2]}${d[2]}`.toLowerCase();
      setMainColorDraft(fullHex);
      applyMainColorPalette(fullHex);
      return;
    }
    const match6 = FULL_HEX_RE.exec(raw);
    if (match6) {
      const fullHex = `#${match6[1].toLowerCase()}`;
      setMainColorDraft(fullHex);
      applyMainColorPalette(fullHex);
      return;
    }
    setMainColorDraft(effective.surface);
  };

  const handleMainColorPicker = (hex: string) => {
    const clean = hex.toLowerCase();
    setMainColorDraft(clean);
    applyMainColorPalette(clean);
  };

  const resetColors = () => {
    const next: BoardThemeConfig = { ...theme };
    delete next.colors;
    onChange(next);
  };

  // Custom Studio Handlers
  const handleLoadStarter = (starter: ThemePresetSpec) => {
    setCustomDraft({ ...starter });
    setCustomColorDrafts({
      surface: starter.defaultColors.surface,
      base: starter.defaultColors.base,
      accent: starter.defaultColors.accent,
      text: starter.defaultColors.text,
      suggestedCanvas: starter.suggestedCanvas,
    });
    setStatusMsg(`Loaded template: "${starter.name}"`);
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleInitCustomFromCurrent = () => {
    setCustomDraft({
      id: "custom",
      name: `${presetSpec.name} (Custom)`,
      badge: presetSpec.badge.slice(0, 8),
      tagline: presetSpec.tagline,
      font: presetSpec.font,
      radiusWindow: currentUiRadius,
      radiusControl: Math.max(0, Math.round(currentUiRadius * 0.6)),
      styleMode: presetSpec.styleMode ?? "bevel",
      defaultColors: { ...effective },
      suggestedCanvas: currentCanvasBackground || presetSpec.suggestedCanvas,
      accentHighlight: presetSpec.accentHighlight || effective.accent,
    });
    setCustomColorDrafts({
      surface: effective.surface,
      base: effective.base,
      accent: effective.accent,
      text: effective.text,
      suggestedCanvas: currentCanvasBackground || presetSpec.suggestedCanvas,
    });
    setActiveTab("custom");
    setStatusMsg("Customized from current theme! Make changes below.");
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleCustomHexChange = (key: ColorFieldKey, rawValue: string) => {
    const text = rawValue.startsWith("#") ? rawValue : (rawValue.length > 0 ? `#${rawValue}` : "");
    setCustomColorDrafts((prev) => ({ ...prev, [key]: text }));

    const match = FULL_HEX_RE.exec(text);
    if (match) {
      const clean = `#${match[1].toLowerCase()}`;
      setCustomDraft((prev) => ({
        ...prev,
        defaultColors: {
          ...prev.defaultColors,
          [key]: clean,
        },
      }));
    }
  };

  const handleCustomHexBlur = (key: ColorFieldKey) => {
    const raw = (customColorDrafts[key] || "").trim();
    const match3 = SHORTHAND_HEX_RE.exec(raw);
    if (match3) {
      const d = match3[1];
      const fullHex = `#${d[0]}${d[0]}${d[1]}${d[1]}${d[2]}${d[2]}`.toLowerCase();
      setCustomColorDrafts((prev) => ({ ...prev, [key]: fullHex }));
      setCustomDraft((prev) => ({
        ...prev,
        defaultColors: {
          ...prev.defaultColors,
          [key]: fullHex,
        },
      }));
      return;
    }
    const match6 = FULL_HEX_RE.exec(raw);
    if (match6) {
      const fullHex = `#${match6[1].toLowerCase()}`;
      setCustomColorDrafts((prev) => ({ ...prev, [key]: fullHex }));
      setCustomDraft((prev) => ({
        ...prev,
        defaultColors: {
          ...prev.defaultColors,
          [key]: fullHex,
        },
      }));
      return;
    }
    setCustomColorDrafts((prev) => ({ ...prev, [key]: customDraft.defaultColors[key] }));
  };

  const handleCustomColorPicker = (key: ColorFieldKey, hex: string) => {
    const clean = hex.toLowerCase();
    setCustomColorDrafts((prev) => ({ ...prev, [key]: clean }));
    setCustomDraft((prev) => ({
      ...prev,
      defaultColors: {
        ...prev.defaultColors,
        [key]: clean,
      },
    }));
  };

  const handleCustomCanvasHexChange = (rawValue: string) => {
    const text = rawValue.startsWith("#") ? rawValue : (rawValue.length > 0 ? `#${rawValue}` : "");
    setCustomColorDrafts((prev) => ({ ...prev, suggestedCanvas: text }));

    const match = FULL_HEX_RE.exec(text);
    if (match) {
      const clean = `#${match[1].toLowerCase()}`;
      setCustomDraft((prev) => ({ ...prev, suggestedCanvas: clean }));
    }
  };

  const handleCustomCanvasBlur = () => {
    const raw = (customColorDrafts.suggestedCanvas || "").trim();
    const match3 = SHORTHAND_HEX_RE.exec(raw);
    if (match3) {
      const d = match3[1];
      const fullHex = `#${d[0]}${d[0]}${d[1]}${d[1]}${d[2]}${d[2]}`.toLowerCase();
      setCustomColorDrafts((prev) => ({ ...prev, suggestedCanvas: fullHex }));
      setCustomDraft((prev) => ({ ...prev, suggestedCanvas: fullHex }));
      return;
    }
    const match6 = FULL_HEX_RE.exec(raw);
    if (match6) {
      const fullHex = `#${match6[1].toLowerCase()}`;
      setCustomColorDrafts((prev) => ({ ...prev, suggestedCanvas: fullHex }));
      setCustomDraft((prev) => ({ ...prev, suggestedCanvas: fullHex }));
      return;
    }
    setCustomColorDrafts((prev) => ({ ...prev, suggestedCanvas: customDraft.suggestedCanvas }));
  };

  const handleApplyMainColorToCustomDraft = (chosenHex?: string) => {
    const palette = generateShadesFromMainColor(chosenHex ?? mainColorDraft);
    setCustomDraft((prev) => ({
      ...prev,
      defaultColors: {
        surface: palette.surface,
        base: palette.base,
        accent: palette.accent,
        text: palette.text,
      },
      suggestedCanvas: palette.suggestedCanvas,
      accentHighlight: palette.accentHighlight,
    }));
    setCustomColorDrafts({
      surface: palette.surface,
      base: palette.base,
      accent: palette.accent,
      text: palette.text,
      suggestedCanvas: palette.suggestedCanvas,
    });
    setStatusMsg(`✓ Generated custom shades from ${palette.surface}`);
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleApplyCustomTheme = () => {
    const sanitized = sanitizeCustomThemeSpec(customDraft) ?? customDraft;
    onChange({
      preset: "custom",
      customTheme: sanitized,
      radius: sanitized.radiusWindow,
      colors: sanitized.defaultColors,
    });
    if (matchCanvas && sanitized.suggestedCanvas) {
      onApplyCanvasBackground(sanitized.suggestedCanvas);
    }
    setStatusMsg("✓ Custom theme applied and synced to board!");
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const handleExportJson = () => {
    const sanitized = sanitizeCustomThemeSpec(customDraft) ?? customDraft;
    const json = JSON.stringify(sanitized, null, 2);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(json).then(() => {
        setStatusMsg("✓ Theme JSON copied to clipboard!");
        setTimeout(() => setStatusMsg(null), 3000);
      });
    } else {
      setImportText(json);
      setImportOpen(true);
    }
  };

  const handleDoImport = () => {
    try {
      const parsed = JSON.parse(importText);
      const sanitized = sanitizeCustomThemeSpec(parsed);
      if (!sanitized) {
        setImportError("Invalid theme structure. Must contain valid colors and properties.");
        return;
      }
      setCustomDraft(sanitized);
      setImportOpen(false);
      setImportText("");
      setImportError(null);
      setStatusMsg(`✓ Imported theme: "${sanitized.name}"`);
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      setImportError(`JSON syntax error: ${err?.message || "Invalid JSON"}`);
    }
  };

  const hasCustomColors = Boolean(theme.colors && Object.keys(theme.colors).length > 0);
  const darkBorder = mixHex(effective.surface, "#000000", 0.4);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="window-frame modal-window theme-picker-window"
        onClick={(e) => e.stopPropagation()}
        style={{
          "--vgui-bg": effective.surface,
          "--vgui-base": effective.base,
          "--vgui-bg-dark": effective.base,
          "--vgui-accent": effective.accent,
          "--vgui-selected-bg": effective.accent,
          "--vgui-text": effective.text,
          "--ink": effective.text,
          "--ink-soft": mixHex(effective.text, effective.surface, 0.35),
          backgroundColor: effective.surface,
          color: effective.text,
          borderColor: effective.accent,
        } as React.CSSProperties}
      >
        <div
          className="window-titlebar"
          style={{
            background: effective.surface,
            color: effective.text,
            borderBottom: `1px solid ${darkBorder}`,
          }}
        >
          <div className="window-title">
            <span className="window-lambda" style={{ color: effective.accent }}>
              λ
            </span>
            <span>Board Theme &amp; Custom Studio</span>
          </div>
          <div className="window-controls">
            <button type="button" className="window-btn close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div
          className="card modal-body"
          style={{
            background: effective.surface,
            color: effective.text,
          }}
        >
          <div className="card-head">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <h1>Global Board Theme</h1>
                <p>
                  Theme styles sync in real-time across peers and live directly in your board.
                </p>
              </div>
              <div className="theme-tab-switcher">
                <button
                  type="button"
                  className={`chip-btn ${activeTab === "presets" ? "active" : ""}`}
                  onClick={() => setActiveTab("presets")}
                >
                  Presets ({BOARD_THEME_LIST.length})
                </button>
                <button
                  type="button"
                  className={`chip-btn ${activeTab === "custom" ? "active" : ""}`}
                  onClick={() => setActiveTab("custom")}
                >
                  🎨 Custom Studio {isCustomActive && "★"}
                </button>
              </div>
            </div>

            {statusMsg && (
              <div className="theme-toast-banner" role="status">
                {statusMsg}
              </div>
            )}
          </div>

          {activeTab === "presets" ? (
            <>
              {/* Magic Main Color Generator */}
              <div
                className="theme-main-color-card"
                style={{
                  background: effective.base,
                  borderColor: darkBorder,
                  color: effective.text,
                }}
              >
                <div className="theme-main-color-header">
                  <span className="theme-main-color-title" style={{ color: effective.accent }}>
                    <span>🎨 Theme Generator — Pick a Main Color</span>
                  </span>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => applyMainColorPalette()}
                    style={{ background: effective.accent, color: "#ffffff", borderColor: effective.accent }}
                    title="Generate and apply fitting shades of this color across all UI elements"
                  >
                    ✨ Generate &amp; Apply Palette
                  </button>
                </div>
                <div className="theme-main-color-row">
                  <div
                    className="swatch-wheel theme-color-swatch"
                    style={{ background: normalizeThemeHex(mainColorDraft) ?? effective.surface }}
                    title="Click wheel to pick any main color"
                  >
                    <input
                      type="color"
                      value={normalizeThemeHex(mainColorDraft) ?? effective.surface}
                      onChange={(e) => handleMainColorPicker(e.target.value)}
                      aria-label="Main color picker wheel"
                    />
                  </div>
                  <input
                    type="text"
                    className="theme-color-hex"
                    value={mainColorDraft}
                    onChange={(e) => handleMainColorHexChange(e.target.value)}
                    onBlur={handleMainColorHexBlur}
                    spellCheck={false}
                    maxLength={7}
                    placeholder="#4b5844"
                    aria-label="Main color hex code"
                    style={{ width: 85 }}
                  />
                  <div className="theme-main-shades-preview">
                    <span
                      className="theme-shade-chip"
                      style={{ background: generatedPalette.surface, color: generatedPalette.text }}
                      title={`Surface: ${generatedPalette.surface}`}
                    >
                      <span className="theme-shade-dot" style={{ background: generatedPalette.surface }} />
                      Surface
                    </span>
                    <span
                      className="theme-shade-chip"
                      style={{ background: generatedPalette.base, color: generatedPalette.text }}
                      title={`Inner Well: ${generatedPalette.base}`}
                    >
                      <span className="theme-shade-dot" style={{ background: generatedPalette.base }} />
                      Well
                    </span>
                    <span
                      className="theme-shade-chip"
                      style={{ background: generatedPalette.accent, color: "#ffffff" }}
                      title={`Accent: ${generatedPalette.accent}`}
                    >
                      <span className="theme-shade-dot" style={{ background: generatedPalette.accent }} />
                      Accent
                    </span>
                    <span
                      className="theme-shade-chip"
                      style={{ background: generatedPalette.suggestedCanvas, color: generatedPalette.text }}
                      title={`Canvas: ${generatedPalette.suggestedCanvas}`}
                    >
                      <span className="theme-shade-dot" style={{ background: generatedPalette.suggestedCanvas }} />
                      Canvas
                    </span>
                  </div>
                </div>
                <p className="theme-radius-hint" style={{ margin: "2px 0 0" }}>
                  Pick your brand or aesthetic color. Caulk automatically harmonizes depths, wells, accents, and contrast.
                </p>
              </div>

              {/* Live Active Theme Preview */}
              <div
                className="theme-live-preview-bar"
                style={{
                  background: effective.surface,
                  borderColor: darkBorder,
                  color: effective.text,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 11, color: effective.accent }}>
                  λ {presetSpec.name}
                </span>
                <span style={{ opacity: 0.6 }}>|</span>
                <span
                  style={{
                    padding: "2px 8px",
                    background: effective.accent,
                    color: "#ffffff",
                    borderRadius: `${currentUiRadius > 0 ? 3 : 0}px`,
                    fontWeight: 700,
                    fontSize: 10,
                  }}
                >
                  Primary Active
                </span>
                <span
                  style={{
                    padding: "2px 8px",
                    background: effective.base,
                    color: effective.text,
                    border: `1px solid ${darkBorder}`,
                    borderRadius: `${currentUiRadius > 0 ? 3 : 0}px`,
                    fontSize: 10,
                  }}
                >
                  Well Input
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    color: effective.accent,
                    fontWeight: 700,
                    fontSize: 10,
                  }}
                >
                  {isCustomActive ? "CUSTOM THEME" : presetSpec.badge}
                </span>
              </div>

              <div className="theme-preset-grid" role="radiogroup" aria-label="Theme presets">
                {BOARD_THEME_LIST.map((preset) => {
                  const active = theme.preset === preset.id && !isCustomActive;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`theme-preset-card ${active ? "active" : ""}`}
                      onClick={() => selectPreset(preset.id)}
                    >
                      <div
                        className={`theme-preset-preview theme-preview-${preset.id}`}
                        style={{
                          background: active ? effective.surface : preset.defaultColors.surface,
                          color: active ? effective.text : preset.defaultColors.text,
                          borderColor: active ? effective.accent : preset.defaultColors.accent,
                        }}
                      >
                        <span
                          className="theme-preview-bar"
                          style={{
                            background: active ? effective.accent : preset.defaultColors.accent,
                            color:
                              active
                                ? "#ffffff"
                                : preset.id === "frutiger-aero" ||
                                  preset.id === "frutiger-glacier" ||
                                  preset.id === "frutiger-metal" ||
                                  preset.id === "windows-xp"
                                ? "#fff"
                                : preset.defaultColors.text,
                          }}
                        >
                          {preset.badge}
                        </span>
                        <span
                          className="theme-preview-well"
                          style={{
                            background: active ? effective.base : preset.defaultColors.base,
                            borderColor: active ? effective.accent : preset.defaultColors.accent,
                          }}
                        />
                      </div>
                      <div className="theme-preset-meta">
                        <span className="theme-preset-name">{preset.name}</span>
                        <span className="theme-preset-tagline">{preset.tagline}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={handleInitCustomFromCurrent}
                  title="Open Custom Theme Studio with current theme as base"
                >
                  ✨ Customize as New Theme…
                </button>
              </div>

              <div className="theme-options-row">
                <label className="checkbox theme-canvas-sync-row">
                  <input
                    type="checkbox"
                    checked={matchCanvas}
                    onChange={(e) => setMatchCanvas(e.target.checked)}
                  />
                  <span>Also update canvas background when switching presets</span>
                </label>

                <label className="checkbox theme-canvas-sync-row">
                  <input
                    type="checkbox"
                    checked={Boolean(theme.adaptToBackground)}
                    onChange={(e) => handleToggleAdapt(e.target.checked)}
                  />
                  <span>
                    <strong>Auto-adapt UI colors</strong> to current canvas background
                  </span>
                </label>
              </div>

              {/* UI Windows & Chrome Radius */}
              <div className="theme-radius-section">
                <div className="theme-colors-head">
                  <div className="theme-radius-title-wrap">
                    <h2>UI Window &amp; Chrome Radius</h2>
                    <span className="theme-radius-badge">{currentUiRadius}px</span>
                    {isCustomUiRadius ? (
                      <span className="theme-radius-custom-tag">(custom override)</span>
                    ) : (
                      <span className="theme-radius-preset-tag">({presetSpec.name} default)</span>
                    )}
                  </div>
                  <div className="theme-colors-actions">
                    {isCustomUiRadius && (
                      <button
                        type="button"
                        className="chip-btn"
                        onClick={handleResetUiRadius}
                        title={`Reset UI corner radius to ${presetSpec.name} default (${presetSpec.radiusWindow}px)`}
                      >
                        Reset UI ({presetSpec.radiusWindow}px)
                      </button>
                    )}
                  </div>
                </div>

                <div className="theme-radius-body">
                  <div className="theme-radius-slider-row">
                    <input
                      type="range"
                      min={0}
                      max={32}
                      step={1}
                      value={currentUiRadius}
                      onChange={(e) => handleUiRadiusChange(Number(e.target.value))}
                      className="theme-radius-slider"
                      aria-label="UI corner radius slider"
                    />
                    <span className="theme-radius-slider-val">{currentUiRadius}px</span>
                  </div>
                  <div className="theme-radius-presets">
                    {UI_RADIUS_PRESETS.map((p) => {
                      const active = currentUiRadius === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          className={`chip-btn ${active ? "active" : ""}`}
                          onClick={() => handleUiRadiusChange(p.value)}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="theme-radius-hint">
                    Controls roundness of Caulk modal dialogs, topbar badges, toolbar islands, and buttons.
                  </p>
                </div>
              </div>

              {/* UI Colors Section */}
              <div className="theme-colors-section">
                <div className="theme-colors-head">
                  <div className="theme-radius-title-wrap">
                    <h2>UI Colors Quick Override</h2>
                    {theme.adaptToBackground && (
                      <span className="theme-radius-badge">Auto-Adapted to Canvas</span>
                    )}
                  </div>
                  <div className="theme-colors-actions">
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={() => onApplyCanvasBackground(presetSpec.suggestedCanvas)}
                      title={`Set canvas background to ${presetSpec.suggestedCanvas}`}
                    >
                      Match Canvas ({presetSpec.suggestedCanvas})
                    </button>
                    {hasCustomColors && (
                      <button type="button" className="chip-btn" onClick={resetColors}>
                        Reset Colors
                      </button>
                    )}
                  </div>
                </div>

                <div className="theme-color-grid">
                  {COLOR_FIELDS.map(({ key, label, hint }) => {
                    const value = effective[key];
                    const draft = drafts[key];
                    const invalid = normalizeThemeHex(draft) === null;
                    const swatchBg = normalizeThemeHex(draft) ?? value;
                    return (
                      <div
                        key={key}
                        className="theme-color-field"
                        style={{
                          background: effective.base,
                          borderColor: darkBorder,
                          color: effective.text,
                        }}
                      >
                        <div
                          className="swatch-wheel theme-color-swatch"
                          title={`Pick ${label}`}
                          style={{ background: swatchBg }}
                        >
                          <input
                            type="color"
                            value={normalizeThemeHex(value) ?? value}
                            onChange={(e) => handleQuickColorPicker(key, e.target.value)}
                            aria-label={`${label} color picker`}
                          />
                        </div>
                        <div className="theme-color-meta">
                          <span className="theme-color-label" style={{ color: effective.text }}>
                            {label}
                          </span>
                          <span
                            className="theme-color-hint"
                            style={{ color: mixHex(effective.text, effective.surface, 0.4) }}
                          >
                            {hint}
                          </span>
                          <input
                            type="text"
                            className="theme-color-hex"
                            value={draft}
                            onChange={(e) => handleQuickHexChange(key, e.target.value)}
                            onBlur={() => handleQuickHexBlur(key)}
                            spellCheck={false}
                            maxLength={7}
                            aria-invalid={invalid}
                            aria-label={`${label} hex value`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* Custom Theme Studio */
            <div className="theme-studio-body">
              {/* Starter Templates */}
              <div className="theme-studio-section">
                <div className="theme-colors-head">
                  <h2>Starter Templates</h2>
                  <div className="theme-colors-actions">
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={handleInitCustomFromCurrent}
                      title="Load current theme into custom editor"
                    >
                      Current Theme
                    </button>
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={() => setImportOpen(true)}
                      title="Import theme from JSON"
                    >
                      📥 Import JSON
                    </button>
                  </div>
                </div>
                <div className="theme-starters-row">
                  {CUSTOM_THEME_STARTERS.map((starter) => (
                    <button
                      key={starter.id}
                      type="button"
                      className="theme-starter-chip"
                      onClick={() => handleLoadStarter(starter)}
                      style={{
                        background: starter.defaultColors.surface,
                        borderColor: starter.defaultColors.accent,
                        color: starter.defaultColors.text,
                      }}
                    >
                      <span
                        className="theme-starter-dot"
                        style={{ background: starter.defaultColors.accent }}
                      />
                      <span>{starter.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Interactive Preview */}
              <div className="theme-studio-section">
                <h2>Live Custom Theme Preview</h2>
                <div className="theme-mini-preview-wrap">
                  <div
                    className="theme-mini-window"
                    style={{
                      background: customDraft.defaultColors.surface,
                      borderColor: customDraft.defaultColors.accent,
                      borderRadius: `${customDraft.radiusWindow}px`,
                      fontFamily: customDraft.font,
                      color: customDraft.defaultColors.text,
                      boxShadow:
                        customDraft.styleMode === "glass"
                          ? `0 8px 24px rgba(0,0,0,0.25), 0 0 12px ${customDraft.defaultColors.accent}`
                          : customDraft.styleMode === "neon"
                          ? `0 0 16px ${customDraft.defaultColors.accent}`
                          : customDraft.styleMode === "tui"
                          ? `4px 4px 0 #000000`
                          : undefined,
                    }}
                  >
                    <div
                      className="theme-mini-titlebar"
                      style={{
                        background:
                          customDraft.styleMode === "xp"
                            ? `linear-gradient(180deg, ${customDraft.defaultColors.accent} 0%, #3a8df8 12%, ${customDraft.defaultColors.accent} 50%, #0042b5 100%)`
                            : customDraft.styleMode === "neon"
                            ? `linear-gradient(90deg, ${customDraft.defaultColors.accent} 0%, #ff71ce 100%)`
                            : customDraft.styleMode === "tui"
                            ? customDraft.defaultColors.accent
                            : customDraft.styleMode === "pinstripe"
                            ? `repeating-linear-gradient(180deg, ${customDraft.defaultColors.surface} 0px, ${customDraft.defaultColors.surface} 1px, #ffffff 1px, #ffffff 2px)`
                            : customDraft.defaultColors.surface,
                        color:
                          customDraft.styleMode === "xp" || customDraft.styleMode === "tui"
                            ? "#ffffff"
                            : customDraft.defaultColors.text,
                      }}
                    >
                      <div className="theme-mini-title-left">
                        <span style={{ color: customDraft.defaultColors.accent, fontWeight: 900 }}>λ</span>
                        <span style={{ fontWeight: 700 }}>{customDraft.name || "Custom Theme"}</span>
                      </div>
                      <div className="theme-mini-title-right">
                        <span
                          className="theme-mini-badge"
                          style={{
                            background: customDraft.defaultColors.accent,
                            color: "#ffffff",
                          }}
                        >
                          {customDraft.badge || "CUSTOM"}
                        </span>
                        <span className="theme-mini-winbtn">✕</span>
                      </div>
                    </div>
                    <div className="theme-mini-body">
                      <div className="theme-mini-toolbar">
                        <button
                          type="button"
                          className="theme-mini-btn"
                          style={{
                            background: customDraft.defaultColors.surface,
                            color: customDraft.defaultColors.text,
                            borderRadius: `${customDraft.radiusControl}px`,
                            border: `1px solid ${customDraft.defaultColors.accent}`,
                          }}
                        >
                          Button
                        </button>
                        <button
                          type="button"
                          className="theme-mini-btn active"
                          style={{
                            background: customDraft.defaultColors.accent,
                            color: "#ffffff",
                            borderRadius: `${customDraft.radiusControl}px`,
                            border: `1px solid ${customDraft.defaultColors.accent}`,
                          }}
                        >
                          Primary Active
                        </button>
                      </div>
                      <div
                        className="theme-mini-well"
                        style={{
                          background: customDraft.defaultColors.base,
                          borderColor: customDraft.defaultColors.accent,
                          color: customDraft.defaultColors.text,
                          borderRadius: `${Math.max(0, customDraft.radiusControl - 1)}px`,
                        }}
                      >
                        <span>Style: {(customDraft.styleMode ?? "bevel").toUpperCase()} | Font: {customDraft.font.split(",")[0]}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Metadata: Name, Badge, Tagline */}
              <div className="theme-studio-section">
                <h2>Theme Identity</h2>
                <div className="theme-meta-inputs-row">
                  <div className="field grow">
                    <label>Theme Name</label>
                    <input
                      type="text"
                      value={customDraft.name}
                      maxLength={40}
                      onChange={(e) => setCustomDraft({ ...customDraft, name: e.target.value })}
                      placeholder="e.g. Cyberpunk Amber"
                    />
                  </div>
                  <div className="field" style={{ width: 100 }}>
                    <label>Badge</label>
                    <input
                      type="text"
                      value={customDraft.badge}
                      maxLength={8}
                      onChange={(e) =>
                        setCustomDraft({ ...customDraft, badge: e.target.value.toUpperCase() })
                      }
                      placeholder="AMBER"
                    />
                  </div>
                </div>
                <div className="field" style={{ marginTop: 8 }}>
                  <label>Tagline</label>
                  <input
                    type="text"
                    value={customDraft.tagline}
                    maxLength={90}
                    onChange={(e) => setCustomDraft({ ...customDraft, tagline: e.target.value })}
                    placeholder="Brief description of the theme's aesthetic"
                  />
                </div>
              </div>

              {/* Aesthetic Style Mode */}
              <div className="theme-studio-section">
                <h2>Aesthetic Style Mode</h2>
                <p className="theme-radius-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                  Controls the tactile depth, specular gloss, bevels, shadows, and button textures.
                </p>
                <div className="theme-style-mode-grid">
                  {STYLE_MODES.map((sm) => {
                    const active = customDraft.styleMode === sm.mode;
                    return (
                      <button
                        key={sm.mode}
                        type="button"
                        className={`theme-style-mode-btn ${active ? "active" : ""}`}
                        onClick={() => setCustomDraft({ ...customDraft, styleMode: sm.mode })}
                      >
                        <span className="theme-style-mode-icon">{sm.icon}</span>
                        <div className="theme-style-mode-text">
                          <span className="theme-style-mode-title">{sm.label}</span>
                          <span className="theme-style-mode-desc">{sm.desc}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Typography Font */}
              <div className="theme-studio-section">
                <h2>Typography Font Family</h2>
                <div className="theme-font-grid">
                  {FONT_OPTIONS.map((f) => {
                    const active = customDraft.font === f.value;
                    return (
                      <button
                        key={f.label}
                        type="button"
                        className={`chip-btn ${active ? "active" : ""}`}
                        onClick={() => setCustomDraft({ ...customDraft, font: f.value })}
                        style={{ fontFamily: f.value }}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Corner Radius */}
              <div className="theme-studio-section">
                <div className="theme-colors-head">
                  <div className="theme-radius-title-wrap">
                    <h2>Corner Radius</h2>
                    <span className="theme-radius-badge">{customDraft.radiusWindow}px</span>
                  </div>
                </div>
                <div className="theme-radius-body">
                  <div className="theme-radius-slider-row">
                    <input
                      type="range"
                      min={0}
                      max={32}
                      step={1}
                      value={customDraft.radiusWindow}
                      onChange={(e) => {
                        const r = Number(e.target.value);
                        setCustomDraft({
                          ...customDraft,
                          radiusWindow: r,
                          radiusControl: Math.max(0, Math.round(r * 0.6)),
                        });
                      }}
                      className="theme-radius-slider"
                      aria-label="Custom corner radius slider"
                    />
                    <span className="theme-radius-slider-val">{customDraft.radiusWindow}px</span>
                  </div>
                  <div className="theme-radius-presets">
                    {UI_RADIUS_PRESETS.map((p) => {
                      const active = customDraft.radiusWindow === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          className={`chip-btn ${active ? "active" : ""}`}
                          onClick={() =>
                            setCustomDraft({
                              ...customDraft,
                              radiusWindow: p.value,
                              radiusControl: Math.max(0, Math.round(p.value * 0.6)),
                            })
                          }
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Color Customization */}
              <div className="theme-studio-section">
                <div className="theme-colors-head">
                  <h2>Theme Colors</h2>
                  <div className="theme-colors-actions">
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={() => handleApplyMainColorToCustomDraft()}
                      title="Generate harmonious shades from current main color into custom draft"
                    >
                      🎨 Generate from Main Color ({mainColorDraft})
                    </button>
                  </div>
                </div>
                <div className="theme-color-grid">
                  {COLOR_FIELDS.map(({ key, label, hint }) => {
                    const value = customDraft.defaultColors[key];
                    const draftVal = customColorDrafts[key] ?? value;
                    const swatchBg = normalizeThemeHex(draftVal) ?? value;
                    return (
                      <div key={key} className="theme-color-field">
                        <div
                          className="swatch-wheel theme-color-swatch"
                          title={`Pick ${label}`}
                          style={{ background: swatchBg }}
                        >
                          <input
                            type="color"
                            value={normalizeThemeHex(value) ?? value}
                            onChange={(e) => handleCustomColorPicker(key, e.target.value)}
                            aria-label={`${label} color picker`}
                          />
                        </div>
                        <div className="theme-color-meta">
                          <span className="theme-color-label">{label}</span>
                          <span className="theme-color-hint">{hint}</span>
                          <input
                            type="text"
                            className="theme-color-hex"
                            value={draftVal}
                            onChange={(e) => handleCustomHexChange(key, e.target.value)}
                            onBlur={() => handleCustomHexBlur(key)}
                            spellCheck={false}
                            maxLength={7}
                            aria-label={`${label} hex value`}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {/* Suggested Canvas */}
                  <div className="theme-color-field">
                    <div
                      className="swatch-wheel theme-color-swatch"
                      title="Pick Canvas Background"
                      style={{
                        background:
                          normalizeThemeHex(customColorDrafts.suggestedCanvas) ?? customDraft.suggestedCanvas,
                      }}
                    >
                      <input
                        type="color"
                        value={
                          normalizeThemeHex(customDraft.suggestedCanvas) ?? customDraft.suggestedCanvas
                        }
                        onChange={(e) => {
                          const clean = e.target.value.toLowerCase();
                          setCustomColorDrafts((prev) => ({ ...prev, suggestedCanvas: clean }));
                          setCustomDraft((prev) => ({ ...prev, suggestedCanvas: clean }));
                        }}
                        aria-label="Suggested canvas color picker"
                      />
                    </div>
                    <div className="theme-color-meta">
                      <span className="theme-color-label">Canvas Background</span>
                      <span className="theme-color-hint">Matching board canvas</span>
                      <input
                        type="text"
                        className="theme-color-hex"
                        value={customColorDrafts.suggestedCanvas ?? customDraft.suggestedCanvas}
                        onChange={(e) => handleCustomCanvasHexChange(e.target.value)}
                        onBlur={handleCustomCanvasBlur}
                        spellCheck={false}
                        maxLength={7}
                        aria-label="Suggested canvas hex value"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Studio Actions */}
              <div className="theme-studio-actions-bar">
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleApplyCustomTheme}
                  title="Save and synchronize custom theme to the board"
                >
                  💾 Apply &amp; Save to Board
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => onApplyCanvasBackground(customDraft.suggestedCanvas)}
                  title={`Apply canvas background (${customDraft.suggestedCanvas})`}
                >
                  Set Canvas Color
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={handleExportJson}
                  title="Copy theme JSON to clipboard"
                >
                  📋 Export JSON
                </button>
              </div>
            </div>
          )}

          {/* Import JSON Modal Dialog */}
          {importOpen && (
            <div className="theme-import-dialog-overlay" onClick={() => setImportOpen(false)}>
              <div
                className="window-frame theme-import-dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="window-titlebar">
                  <div className="window-title">
                    <span className="window-lambda">λ</span>
                    <span>Import Custom Theme JSON</span>
                  </div>
                  <div className="window-controls">
                    <button
                      type="button"
                      className="window-btn close"
                      onClick={() => setImportOpen(false)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="card modal-body">
                  <p style={{ margin: 0, fontSize: 12 }}>
                    Paste a valid Caulk ThemePresetSpec JSON object below:
                  </p>
                  <textarea
                    className="theme-import-textarea"
                    rows={10}
                    value={importText}
                    onChange={(e) => {
                      setImportText(e.target.value);
                      setImportError(null);
                    }}
                    placeholder='{\n  "name": "Custom Neo",\n  "badge": "NEO",\n  "styleMode": "glass",\n  "defaultColors": {\n    "surface": "#121b24",\n    "base": "#0a1016",\n    "accent": "#00d4ff",\n    "text": "#ffffff"\n  }\n}'
                  />
                  {importError && (
                    <div style={{ color: "#ff6b6b", fontSize: 12 }}>{importError}</div>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button type="button" className="btn" onClick={() => setImportOpen(false)}>
                      Cancel
                    </button>
                    <button type="button" className="btn primary" onClick={handleDoImport}>
                      Load Theme
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Retro Sound Effects Section */}
          <div className="theme-radius-section theme-sound-section">
            <div className="theme-radius-head">
              <div className="theme-radius-title-wrap">
                <h2>Retro Sound Effects</h2>
                <span className="theme-radius-badge">
                  {soundConfig.enabled ? "Active" : "Muted"}
                </span>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={soundConfig.enabled}
                  onChange={(e) => handleToggleSound(e.target.checked)}
                />
                <strong>Enable Sound Effects</strong>
              </label>
            </div>

            {soundConfig.enabled && (
              <div className="theme-sound-body">
                <div className="theme-sound-row">
                  <span className="theme-sound-label">Sound Pack:</span>
                  <select
                    className="theme-sound-select"
                    value={soundConfig.pack}
                    onChange={(e) => handleSoundPack(e.target.value as SoundPack)}
                  >
                    <option value="auto">Auto (Match Theme: {presetSpec.name})</option>
                    <option value="vgui">Half-Life / Valve (VGUI)</option>
                    <option value="windows-xp">Windows XP (Luna)</option>
                    <option value="frutiger">Frutiger Glacier &amp; Aqua (Water/Crystal)</option>
                    <option value="mac-os9">Mac OS 9 Platinum</option>
                    <option value="win95">Windows 95/98 Classic</option>
                    <option value="dos">IBM PC Speaker (DOS TUI)</option>
                  </select>
                </div>

                <div className="theme-sound-row" style={{ marginTop: 8 }}>
                  <span className="theme-sound-label">Volume:</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={soundConfig.volume}
                    onChange={(e) => handleSoundVolume(Number(e.target.value))}
                    className="theme-radius-slider"
                    style={{ flex: 1 }}
                    aria-label="Sound volume slider"
                  />
                  <span className="theme-radius-slider-val" style={{ minWidth: 42 }}>
                    {Math.round(soundConfig.volume * 100)}%
                  </span>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={handleTestSound}
                    title="Play sample sound"
                  >
                    ▶ Test Sound
                  </button>
                </div>
                <p className="theme-radius-hint" style={{ marginTop: 6 }}>
                  Plays authentic tactile sound effects on button clicks, sticky creation, tagging, clustering, and alerts.
                </p>
              </div>
            )}
          </div>

          <div className="bg-picker-footer">
            <button type="button" className="btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
