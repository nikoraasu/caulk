---
type: Architecture
title: UI integration with Excalidraw
description: Which Caulk features live inside Excalidraw's own UI and the gotchas found doing it.
tags: [ui, excalidraw]
resource: /src/ui/BoardScreen.tsx
generated: { by: claude-opus-5-5/okf, at: "2026-11-11T00:50:00Z" }
---

# Layout

- **AI assistant**: `<Sidebar name="ai">` child of `<Excalidraw>`, toggled with `api.toggleSidebar`; docked state in localStorage `caulk.ai_docked.v1`. Sidebar children unmount when closed (typed text is lost).
- **Top-right UI** (`renderTopRightUI`): AI and Video buttons.
- **Main menu** (`<MainMenu>`, group "Caulk"): video, timer, history, save, pull, frame, AI, Mermaid, present, stamp, sticky palette, invite link, note→issue, switch board. Excalidraw defaults kept except LoadScene/SaveToActiveFile/ToggleTheme (theme fixed dark).
- **Stickies**: one button portaled to `document.body`, `position: fixed`, aligned to `.App-toolbar` via ResizeObserver; horizontal colour popover, closed by default. **N** drops a sticky at the mouse. Narrow screens use a fixed "📝 Sticky" button.
- **Top bar** (`.vgui-topbar`): title, save label, running timer, following indicator, live pill, avatars (click to follow). Excalidraw's own `.UserList` is hidden in CSS to avoid a duplicate peer list.

# Gotchas

- Never insert our elements into Excalidraw's toolbar DOM: `.excalidraw .Island` overrides positioning and stretches the toolbar.
- Elements portaled outside `.excalidraw` lose its CSS variables; give fallbacks.
- Command palette can't take custom commands in 0.18.
- The access/whitelist modal (`AccessModal.tsx`) is unused; `isAllowed` is hardcoded true.
