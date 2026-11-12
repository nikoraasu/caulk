---
type: Architecture
title: UI integration with Excalidraw
description: Which Caulk features live inside Excalidraw's own UI and the gotchas found doing it.
tags: [ui, excalidraw]
resource: /src/ui/BoardScreen.tsx
generated: { by: antigravity/gemini, at: "2026-11-12T22:40:00Z" }
---

# Layout

- **AI assistant**: `<Sidebar name="ai">` child of `<Excalidraw>`, toggled with `api.toggleSidebar`; docked state in localStorage `caulk.ai_docked.v1`. Sidebar children unmount when closed (typed text is lost).
- **Top-right UI** (`renderTopRightUI`):
  - Root: AI and Video buttons.
  - Unified **Tools** dropdown (`caulk-tools-anchor` / `toolsMenuOpen`) consolidating timers, comments, voting, templates, presentation/summon/attention-ping, frame/AI/Mermaid/stamp, video, board background, and **Theme & UI colors…** (`ThemePickerModal`), with active tool badge count.
- **Main menu** (`<MainMenu>`, group `"Board"`): kept slim — board background, theme & UI colors, sticky palette toggle, switch board/log out, plus Excalidraw defaults (ClearCanvas, SaveAsImage, Export, ChangeCanvasBackground, Help). Duplicate tool actions were moved to Tools.
- **Notification stack**: `.caulk-notif-stack` anchored bottom-left above Excalidraw's zoom & undo/redo controls (`raised` state offsets when active banners show) for timer popover, ping/present/follow/placing-comment/voting status bars instead of floating over the top toolbar.
- **Stickies**: one button portaled to `document.body`, `position: fixed`, aligned to `.App-toolbar` via ResizeObserver; horizontal colour popover, closed by default. **N** drops a sticky at the mouse. Narrow screens use a fixed "📝 Sticky" button.
- **Top bar** (`.vgui-topbar`): title, save label, running timer, following indicator, live pill, avatars (click to follow). Excalidraw's own `.UserList` is hidden in CSS to avoid a duplicate peer list.
- **Video frame**: `VideoEmbedFrame.tsx` wraps video/iframe embeds in theme-styled window chrome (`vgui-video-window`) with custom player controls. Creating the `embeddable` element in `BoardScreen.tsx` sets clean borderless framing by default.
- **Global Theming & Custom Theme Studio**:
  - **Presets**: 11 authentic OS aesthetics driving `html[data-board-theme]` and style modes (`vgui`, `windows-xp`, `frutiger-aero`, `frutiger-glacier`, `frutiger-aqua`, `frutiger-dorfic`, `frutiger-metal`, `mac-os9`, `win95`, `dos-tui`, `vaporwave`).
  - **Custom Theme Studio** (`ThemePickerModal.tsx`): Dedicated studio tab allowing users to craft bespoke themes with live mini-window interactive preview (titlebar, buttons, input wells, badges).
  - **Style Modes** (`data-theme-style-mode`): 8 rendering modes (`bevel`, `glass`, `xp`, `metal`, `neon`, `pinstripe`, `tui`, `flat`) providing authentic glass reflections, bevels, CRT glow, or Luna pills.
  - **Dynamic CSS Variable Engine**: Drives `--vgui-window-bg`, `--vgui-titlebar-bg`, `--vgui-titlebar-fg`, `--vgui-btn-bg`, `--vgui-btn-fg`, `--vgui-btn-hover-bg`, `--vgui-btn-active-bg`, `--vgui-box-shadow`, `--vgui-backdrop-filter`, `--vgui-border-top`, `--vgui-border-left`, `--vgui-border-right`, `--vgui-border-bottom`, `--theme-font`, `--theme-radius`, and `--theme-radius-sm`.
  - **Starters & Portability**: 5 curated 1-click starter templates (Cyberpunk Amber CRT, Dracula Night, Nordic Frost, Game Boy 1989, Solarized Dark), plus JSON export and import modal.
  - **CRDT Sync**: Full `ThemePresetSpec` persists inside `settings.boardTheme` in Yjs, synchronizing custom themes to all peers automatically without local setup.
  - **CLI Integration**: Fully manageable headlessly via `npx caulk get-theme` and `npx caulk set-theme --preset <id>` or `--theme-file <path>`.
- **Canvas element rounding & frame styling**: Per-object corner radius changer (`ElementRadiusControl.tsx`). Whenever any roundable shape (rectangle, sticky note, diamond, or frame) is selected, users can adjust its specific radius via the left sidebar panel directly under Excalidraw's "Edges" fieldset (slider 0–44px and quick chips). Native frames support custom stroke colors, background fills, stroke widths, and corner radiuses. Patched Excalidraw dev & prod bundles (`build/excalidrawPalette.ts`) to permit stroke color, background fill, roundness changes, and custom canvas rendering on frames. Changes apply strictly to the selected element(s) with undo/redo and Yjs sync.
- **Drawing safeguards**: Rectangle tool drawing is protected by ensuring `onChange` never invokes `api.updateScene` during active pointer drags (`pointerDownRef.current`) or while drawing shapes (`appState.newElement`), preventing premature element destruction.
- **Dedicated Frame tool**: Portaled `🖼️ Frame (F)` tool button floats beside the sticky trigger in the top toolbar. Pressing `F` on the canvas (when not editing text) toggles the frame drawing mode. The Tools dropdown provides both "Draw frame (F)" and "Frame selection".
- **Default stickies overhaul**: Sticky notes default to sharp corners (0px radius, `roundness: null`) and 0 sloppiness (`roughness: 0` Architect style). Topbar sticky panel includes live defaults controls and auto-persists user preferences (`caulk_sticky_defaults_v1`).
- **GitHub Issue cards**: Interactive embeddable cards (`GitHubIssueCard.tsx`) rendered on the canvas with status badges (Open/Closed), issue number, title, author/assignee avatars, comments count, label pills, and quick refresh/toggle actions. Separate non-destructive drawer (`IssuesDrawer.tsx`) to search and insert issues by number or URL without modifying existing stickies.
- **Miro-like native frames & child movement**: Implemented with native `type: "frame"` (`ExcalidrawFrameElement`) using `name: frameTitle`. Any objects placed inside or selected when framing are bound via `frameId`. Respects Excalidraw's scene order invariant (`[...otherElements, ...childrenToFrame, frameElement]`). Moving the frame via mouse dragging or keyboard arrow nudging moves all contained objects together. Clustered notes and AI clusters generate native frames with bound children. Legacy rectangle frames are automatically migrated in `sanitizeElement`.
