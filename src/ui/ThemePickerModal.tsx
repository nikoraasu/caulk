import { useEffect, useState } from "react";
import {
  BOARD_THEME_LIST,
  BOARD_THEME_PRESETS,
  normalizeThemeHex,
  resolveEffectiveColors,
  type BoardThemeConfig,
  type BoardThemePresetId,
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

const COLOR_FIELDS: Array<{ key: ColorFieldKey; label: string; hint: string }> = [
  { key: "surface", label: "UI Surface", hint: "Toolbars, panels, frames" },
  { key: "base", label: "Inner Well", hint: "Inputs, recessed boxes" },
  { key: "accent", label: "Accent", hint: "Active tool & highlights" },
  { key: "text", label: "Text & Icons", hint: "Labels & toolbar icons" },
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
  const presetSpec = BOARD_THEME_PRESETS[theme.preset] ?? BOARD_THEME_PRESETS.vgui;
  const [matchCanvas, setMatchCanvas] = useState(true);
  const [drafts, setDrafts] = useState<Required<ThemeUiColors>>(effective);

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

  useEffect(() => {
    setDrafts(resolveEffectiveColors(theme, currentCanvasBackground));
  }, [
    theme.preset,
    theme.adaptToBackground,
    theme.colors?.surface,
    theme.colors?.base,
    theme.colors?.accent,
    theme.colors?.text,
    currentCanvasBackground,
  ]);

  const selectPreset = (presetId: BoardThemePresetId) => {
    // Switching preset resets colors and radii to the preset's native defaults
    onChange({ preset: presetId });
    if (matchCanvas) {
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

  const updateColor = (key: ColorFieldKey, rawValue: string, liveHex?: string) => {
    setDrafts((prev) => ({ ...prev, [key]: rawValue }));
    const hex = liveHex ?? normalizeThemeHex(rawValue);
    if (!hex) return;
    onChange({
      ...theme,
      colors: {
        ...theme.colors,
        [key]: hex,
      },
    });
  };

  const resetColors = () => {
    const next: BoardThemeConfig = { ...theme };
    delete next.colors;
    onChange(next);
  };

  const hasCustomColors = Boolean(theme.colors && Object.keys(theme.colors).length > 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="window-frame modal-window theme-picker-window"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="window-titlebar">
          <div className="window-title">
            <span className="window-lambda">λ</span>
            <span>Board Theme &amp; UI Colors</span>
          </div>
          <div className="window-controls">
            <button type="button" className="window-btn close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="card modal-body">
          <div className="card-head">
            <h1>Global Board Theme</h1>
            <p>
              Changes apply live across the UI and sync for everyone on this board.
            </p>
          </div>

          <div className="theme-preset-grid" role="radiogroup" aria-label="Theme presets">
            {BOARD_THEME_LIST.map((preset) => {
              const active = theme.preset === preset.id;
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
                      background: preset.defaultColors.surface,
                      color: preset.defaultColors.text,
                      borderColor: preset.defaultColors.accent,
                    }}
                  >
                    <span
                      className="theme-preview-bar"
                      style={{
                        background: preset.defaultColors.accent,
                        color:
                          preset.id === "frutiger-aero" ||
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
                        background: preset.defaultColors.base,
                        borderColor: preset.defaultColors.accent,
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
                <h2>UI Colors</h2>
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

            {theme.adaptToBackground && (
              <p className="theme-radius-hint">
                Colors are currently dynamically generated from your canvas background (
                <code>{currentCanvasBackground || presetSpec.suggestedCanvas}</code>). You can still pick custom overrides below.
              </p>
            )}

            <div className="theme-color-grid">
              {COLOR_FIELDS.map(({ key, label, hint }) => {
                const value = effective[key];
                const draft = drafts[key];
                const invalid = normalizeThemeHex(draft) === null;
                return (
                  <div key={key} className="theme-color-field">
                    <div className="swatch-wheel theme-color-swatch" title={`Pick ${label}`}>
                      <input
                        type="color"
                        value={value}
                        onChange={(e) => updateColor(key, e.target.value, e.target.value.toLowerCase())}
                        aria-label={`${label} color picker`}
                      />
                    </div>
                    <div className="theme-color-meta">
                      <span className="theme-color-label">{label}</span>
                      <span className="theme-color-hint">{hint}</span>
                      <input
                        type="text"
                        className="theme-color-hex"
                        value={draft}
                        onChange={(e) => updateColor(key, e.target.value)}
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
                    <option value="frutiger">Frutiger Glacier & Aqua (Water/Crystal)</option>
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
