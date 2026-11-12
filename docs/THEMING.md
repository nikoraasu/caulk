# Caulk Theming Guide & Custom Theme Studio

Caulk combines private, Git-backed collaborative whiteboarding with authentic retro operating system chrome, skeuomorphic glass, and tactile mechanical design.

This guide explains how Caulk's theme engine works, the visual anatomy of all 11 built-in presets, how to create and share custom themes using the in-app **Custom Theme Studio**, and how to programmatically manage themes via headless CLI and AI coding agents.

---

## 🎨 Built-in Theme Catalog (11 Presets)

Caulk ships with 11 authentic visual themes spanning the golden eras of personal computing:

| Theme ID | Name | Style Mode | Era & Aesthetic | Sound Pack |
|---|---|---|---|---|
| `vgui` | **Steam VGUI** | `bevel` | 2003 Valve Half-Life olive drab bevels & gold accents | Valve VGUI |
| `windows-xp` | **Windows XP** | `xp` | 2001 Luna royal blue titlebars, pill buttons & emerald accents | Windows XP |
| `frutiger-aero` | **Frutiger Aero** | `glass` | 2007 Vista/7 glossy translucent sky glass & specular sheen | Water / Crystal |
| `frutiger-glacier` | **Frutiger Glacier** | `glass` | Subzero arctic crystalline frost, pure glacial ice & cryo glow | Water / Crystal |
| `frutiger-aqua` | **Frutiger Aqua** | `glass` | Deep oceanic liquid glass & bioluminescent turquoise | Water / Crystal |
| `frutiger-dorfic` | **Frutiger Dorfic** | `glass` | Pastoral techno-optimism (XP Bliss meadows, sunlit clay curves) | Water / Crystal |
| `frutiger-metal` | **Frutiger Metal** | `metal` | Brushed titanium aluminum grain with cryo-blue LED indicators | Mac / Valve |
| `mac-os9` | **Mac OS 9** | `pinstripe` | 1999 Apple Platinum pinstripe textures & sapphire buttons | Mac OS 9 |
| `win95` | **Win95/98** | `bevel` | Redmond 1995 3D beveled gray, navy titlebars & zero radius | Win95 Classic |
| `dos-tui` | **DOS TUI** | `tui` | Norton / Borland VGA cyan/blue box frames & monospace text | IBM PC Speaker |
| `vaporwave` | **Vaporwave** | `neon` | Neon magenta, electric cyan grids & midnight violet sunset | Valve VGUI |

---

## 🛠️ The Custom Theme Studio

Caulk includes a full-featured **Custom Theme Studio** built directly into the Theme Picker dialog (`🎭 Theme & UI colors…` in the canvas top menu).

### 1. Opening the Studio
1. Open the board in the web app.
2. In the top-right menu, select **🎭 Theme & UI colors…** (or press the theme badge button).
3. Click the **🎨 Custom Studio** tab at the top of the dialog.

### 2. Live Interactive Mini Window Preview
As you tweak colors, corner radius, fonts, or style modes, a live miniature window updates in real time to show you exactly how titlebars, active buttons, toolbars, and input wells will render.

### 3. Aesthetic Style Modes
Custom themes are powered by Caulk's **Style Mode Engine**. Instead of writing raw CSS, you choose a tactile style mode that automatically generates the appropriate bevels, glass reflections, or neon halos:

- **🔲 3D Bevel (`bevel`)**: Win95 & Steam VGUI tactile raised borders, sunken input wells, and inverted active buttons.
- **💎 Aero Glass (`glass`)**: Translucent frosted acrylic with multi-stop specular reflections, backdrop blur, and aqua glows.
- **🪟 Luna XP (`xp`)**: Windows XP 3D chrome, curved titlebars, red close button, and silver pill buttons.
- **⚙️ Brushed Metal (`metal`)**: Horizontal metallic brushed aluminum grain, milled bevels, and glowing LED indicators.
- **⚡ Neon Synth (`neon`)**: 80s/90s synthwave glowing borders, sunset gradient titlebars, and neon text-shadows.
- **🍏 Pinstripes (`pinstripe`)**: Mac OS 9 Apple Platinum alternating pinstripes, beveled borders, and sapphire pills.
- **💻 DOS TUI (`tui`)**: High-contrast monospace terminal with solid box borders and vibrant active blocks.
- **▫️ Minimal Flat (`flat`)**: Clean, contemporary borders, crisp contrast, and subtle drop shadows.

### 4. Color Tokens
Each custom theme defines 5 core color tokens:
- **UI Surface (`surface`)**: Window backgrounds, toolbars, and floating panels.
- **Inner Well (`base`)**: Input fields, table wrappers, and recessed containers.
- **Accent & Active (`accent`)**: Active tool states, primary buttons, and highlight badges.
- **Text & Icons (`text`)**: Primary ink for labels, menus, and toolbar icons.
- **Suggested Canvas Background**: The recommended whiteboard canvas color for the theme.

### 5. Curated Starter Templates
The Studio includes 5 one-click starter presets:
- **Cyberpunk Amber CRT**: 1980s phosphor amber terminal on obsidian black (`tui`).
- **Dracula Midnight**: Gothic midnight slate with vampire pink and cyan glows (`neon`).
- **Nordic Frost**: Arctic deep navy with glacier ice white and pale blue sheen (`glass`).
- **Game Boy 1989**: Authentic 4-shade greenish monochrome DMG-01 LCD matrix (`bevel`).
- **Solarized Dark**: Ethan Schoonover's scientifically calculated palette (`flat`).

---

## 💾 Exporting, Importing & Sharing Themes

Custom themes are completely self-contained and JSON-serializable.

### Export Theme JSON
In the Custom Theme Studio, click **📋 Export JSON**. The complete theme definition is copied to your clipboard:

```json
{
  "id": "amber-crt",
  "name": "Cyberpunk Amber CRT",
  "badge": "AMBER",
  "tagline": "1980s phosphor amber terminal on obsidian black",
  "font": "\"Cascadia Mono\", \"Consolas\", monospace",
  "radiusWindow": 0,
  "radiusControl": 0,
  "styleMode": "tui",
  "defaultColors": {
    "surface": "#181005",
    "base": "#0f0a02",
    "accent": "#ffb000",
    "text": "#ffcc44"
  },
  "suggestedCanvas": "#0a0601",
  "accentHighlight": "#ffe082"
}
```

### Import Theme JSON
1. Click **📥 Import JSON** in the Custom Theme Studio.
2. Paste any valid Caulk theme JSON snippet.
3. Click **Load Theme**. The editor populates instantly with the imported colors, font, and style mode.

### Zero-Config Peer Synchronization
When you click **💾 Apply & Save to Board**:
1. The custom theme spec is saved into the Yjs CRDT `settings.boardTheme` document.
2. The board is encrypted client-side with AES-256-GCM.
3. The custom theme replicates to all peers in real-time. Connected collaborators immediately see the new theme **without needing any local configuration or plugins**.

---

## 📐 CSS Custom Properties Reference

Caulk exposes CSS custom properties on `:root` that are dynamically calculated and updated by [`src/ui/boardTheme.ts`](file:///home/nikolas/miro-alt/src/ui/boardTheme.ts):

| CSS Custom Property | Description | Example / Fallback |
|---|---|---|
| `--vgui-bg` | Main panel and toolbar surface | `#4b5844` |
| `--vgui-base` | Recessed well and input field background | `#3e4637` |
| `--vgui-selected-bg` | Active tool, selected radio, and primary button | `#978730` |
| `--vgui-selected-fg` | Text color on active tool and primary button | `#ffffff` |
| `--vgui-text` / `--ink` | Primary label and icon color | `#ffffff` |
| `--vgui-muted` | Soft secondary label color | `rgba(255, 255, 255, 0.7)` |
| `--vgui-border` | Window frame border color | `#000000` |
| `--vgui-light` | 3D bevel top-left highlight border | `rgba(255, 255, 255, 0.28)` |
| `--vgui-dark` | 3D bevel bottom-right shadow border | `rgba(0, 0, 0, 0.35)` |
| `--vgui-window-bg` | Computed high-fidelity window gradient or pattern | Dynamic |
| `--vgui-titlebar-bg` | Computed titlebar gradient or pattern | Dynamic |
| `--vgui-titlebar-fg` | Titlebar text and icon color | Dynamic |
| `--vgui-btn-bg` | Standard button gradient | Dynamic |
| `--vgui-btn-hover-bg` | Hover button background | Dynamic |
| `--vgui-btn-primary-bg` | Primary / active button gradient | Dynamic |
| `--vgui-box-shadow` | Window and dialog drop shadow | Dynamic |
| `--vgui-backdrop-filter` | Glass blur filter for acrylic / glass themes | `blur(24px)` |
| `--theme-font` | Global typography font stack | `"Tahoma", sans-serif` |
| `--theme-radius` | Modal and window frame corner radius | `0px` – `32px` |
| `--theme-radius-sm` | Button and input field corner radius | `0px` – `16px` |

---

## 🤖 Headless CLI & AI Agent Theme Management

External AI coding agents (**Antigravity**, **Claude Code**, **Cursor**, **Codex**) and terminal scripts can inspect and update board themes via `npx caulk`:

```bash
# Inspect the active theme of a board
npx caulk get-theme --board main

# Machine-readable JSON output:
npx caulk get-theme --board main --json

# Switch to a built-in preset:
npx caulk set-theme --board main --preset frutiger-aero
npx caulk set-theme --board main --preset windows-xp
npx caulk set-theme --board main --preset dos-tui

# Apply a custom theme from a JSON file:
npx caulk set-theme --board main --theme-file ./my-custom-theme.json
```

---

## 👨‍💻 Adding a Built-in Theme in Code

If you want to contribute a permanent built-in theme to the Caulk codebase:

1. **Register the preset in [`src/ui/boardTheme.ts`](file:///home/nikolas/miro-alt/src/ui/boardTheme.ts)**:
   Add your preset spec to `BOARD_THEME_PRESETS` and append it to `BOARD_THEME_LIST`.
2. **Add custom styling in [`src/styles.css`](file:///home/nikolas/miro-alt/src/styles.css)**:
   Use `html[data-board-theme="your-preset-id"]` to define custom gradients, titlebars, or button textures.
3. **Add task hub styling in [`src/features/tasks/tasks.css`](file:///home/nikolas/miro-alt/src/features/tasks/tasks.css)**:
   Style `.task-hub-window`, `.task-kanban-column`, and `.task-kanban-card` to match your theme's aesthetic.
4. **Pair with audio in [`src/audio/soundEngine.ts`](file:///home/nikolas/miro-alt/src/audio/soundEngine.ts)**:
   In `resolveEffectivePack()`, associate your preset ID with an authentic retro sound pack (`vgui`, `win95`, `windows-xp`, `frutiger`, `mac-os9`, or `dos`).
