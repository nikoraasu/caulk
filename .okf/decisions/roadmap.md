---
type: Plan
title: Roadmap
description: Agreed next steps and open decisions as of 2026-11-11.
tags: [roadmap, plan]
status: draft
generated: { by: "antigravity/gemini", at: "2026-11-13T01:06:00Z" }
stale_after: "2027-02-01T00:00:00Z"
---

# Open decisions

- **License**: copyleft wanted; choose GPL-3.0 vs AGPL-3.0 (AGPL recommended for a hosted app). No LICENSE file yet.
- Shared Gemini key: proxy AI through the server, or keep per-user keys.
- Access control: AccessModal/whitelist is dormant; needs a source of truth if revived.

# Smarter GitHub saving & Miro-parity (implemented in `dev/`)

Done in `dev/` (and carried into `dev/theming/`), pending promotion/commit to root:
1. `SyncEngine`: 10s idle debounce, 60s maxWait, 403/429 backoff, single elected saver (`isElectedSaver` in `live.ts`), 30s GitHub poll while relay connected.
2. Features in `dev/src/features/`: `comments`, `voting` (reactions + dot voting), `templates`, `presence` (summon/present/ping), `home` (boards home).
3. UI polish: Tools dropdown in `renderTopRightUI`, slimmed `MainMenu`, `.caulk-notif-stack` bottom-left status bar, `VideoEmbedFrame` custom player, `assetCache` + `skipRawBlob` + coalesced `listDir`.

# Completed Miro & Board features (`dev/theming/`)

Implemented and verified in `dev/theming/`:
1. **Miro-like Frames**: Native `type: "frame"` with child element binding (`frameId`), ordering invariant (`[...other, ...children, frame]`), and synchronized movement (canvas drag + keyboard arrow nudges). Legacy rectangle frame migration.
2. **GitHub Issue Cards**: First-class embeddable issue cards with live status badges, label pills, author/assignee avatars, and repository issue browser drawer (independent of stickies).
3. **Default Sticky Preferences**: Sharp 0px corners, 0 sloppiness by default with per-user persistent preferences.
4. **Retro Sound Effects Engine**: Theme-aware sound engine with Half-Life / VGUI and Frutiger Aero packs.
5. **Theme Presets & Wallpaper**: 11 curated retro OS presets with transparent canvas, tiling wallpaper, and dynamic background adaptation.
6. **Per-Object Corner Radius**: Contextual and sidebar controls adjusting specific roundable elements (0–48px).

# Completed: Tasks, Theming Studio & External Agent Bridge

1. **Jira/Linear-Grade Task System**: Stored in CRDT map `doc.getMap("tasks")`, interactive canvas cards with live subtask checkoffs, tree connectors, arrow linking, 2-way sticky tag sync, and multi-views (Kanban, List, Gantt, Calendar, Dashboard, Team Roles).
2. **Custom Theming Engine & Studio**: 11 authentic OS presets, custom theme spec, 8 style modes (`bevel`, `glass`, `xp`, `metal`, `neon`, `pinstripe`, `tui`, `flat`), dynamic CSS variables, live interactive preview, and JSON export/import.
3. **Headless Board CLI & AI Agent Bridge (`npx caulk`)**: `bin/caulk.mjs` allows external AI agents (Antigravity, Claude Code, Cursor, Codex, OpenCode, Aider) and CI/CD pipelines to inspect boards (`dump`), manage tasks (`list-tasks`, `add-task`, `update-task`), drop stickies (`add-sticky`), and inspect/switch themes (`get-theme`, `set-theme`) over encrypted or unencrypted `.slate` files directly. Documented in `AGENTS.md`.
4. **Infinite Canvas v2 System**: Tactical Radar Minimap & Spatial Waypoints, Sugiyama Hierarchy Tree DAG layout, 6-axis selection alignment & distribution toolbar, quick-branching handles, rich canvas embeds (empty VGUI checklists, syntax-highlighted code cards, web bookmarks, 2x2 strategy matrices), <kbd>TAB</kbd> player list scoreboard HUD, and magic main color shade generator (`generateShadesFromMainColor`).

# Next Up: Handoff & Known Follow-up Items

1. **Theme-Aware Arrow Colors**:
   - *Current issue*: Connector arrows spawned by quick-branching handles in `src/features/diagram/BranchingOverlay.tsx` (line 146) are hardcoded to `#c59c3a` (classic VGUI gold/amber).
   - *Target behavior*: Connectors should dynamically adapt their `strokeColor` to the current active theme accent (`boardTheme.colors.accent` / `effectiveTheme.accent`), ensuring arrows blend seamlessly into Frutiger Aero, Windows XP, Cyberpunk, or user-generated palettes.
2. **Quick-Branch Handles Anchoring During Board Movement**:
   - *Current issue*: The four directional plus (`+`) handles follow an object when the object itself is moved. However, when the user pans/moves the entire board (via spacebar drag, middle-click pan, or trackpad) while an object is selected, the plus handles can desynchronize or move relative to the viewport instead of remaining locked to the selected object's scene coordinates.
   - *Target behavior*: The overlay projection in `BranchingOverlay.tsx` (`toOverlayXY`) should stay locked to the selected element during viewport pan/scroll, or hide during active board panning (`appState.isPanning` / background drag) and snap into position upon pan release.

# Multi-Agent Presence & Jira Sync

# Hosting for others (agreed, not started)

1. Configurable API base URL; CORS on PHP endpoints.
2. Optional Cloudflare Worker backend (OAuth exchange + relay, Durable Objects WebSockets) + GitLab adapter if multi-provider repo joining is wanted.
3. GitHub Actions → GitHub Pages deploy + README tutorial (static / PHP / Pages + Worker).
4. Abuse limits on the relay and auth endpoints.
