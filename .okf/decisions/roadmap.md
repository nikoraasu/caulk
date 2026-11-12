---
type: Plan
title: Roadmap
description: Agreed next steps and open decisions as of 2026-11-11.
tags: [roadmap, plan]
status: draft
generated: { by: antigravity/gemini, at: "2026-11-11T16:58:00Z" }
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

# Next Up: Tasks, Jira Tracking & External AI Agents

## 1. Project Management, Tasks & Progress Tracking
- **Independent Task Entities**: Tasks stored as dedicated records in a Yjs `tasks` Map (not tied exclusively to stickies). Fields: `id`, `title`, `description`, `status` (`backlog`, `todo`, `in_progress`, `review`, `done`), `priority`, `assignees`, `estimate`, `subtasks`, `dueDate`, `jiraRef` / `githubRef`.
- **Task Cards on Canvas**: Rendered via `renderEmbeddable` with interactive status dropdowns, assignee avatars, subtask checklists, and progress indicators.
- **Frame-Level Progress Aggregation**: Frames containing task cards automatically compute and display aggregate progress (e.g. "Sprint 1: 5/8 tasks complete — 62%").
- **Multiple Project Views**: Synchronized side-by-side or modal views (Kanban Board, Task List Table, Timeline/Gantt) reading from the shared Yjs task state.
- **Jira & Issue Sync**: Modular Jira REST API adapter (analogous to `GitHubAdapter`) supporting issue card import, bi-directional status updates, and webhook callbacks.

## 2. External Claude & Multi-Agent Integration
- **Board CLI / MCP Server / Headless Agent Bridge**: Allow external AI tools (Claude Desktop, Anthropic API, Gemini, custom scripts) to interact directly with Caulk boards.
- **Agent Collaborator Identity**: External agents connect with dedicated peer identity (e.g. `claude-pm`, `gemini-researcher`) with avatar and role badges.
- **Direct Board Manipulation ("Summarize & add to board")**:
  - Secure Agent API / Webhook: accepts structured prompts or JSON (e.g. `"summarize the enemies and add them to the caulk board"`).
  - Headless Scene Updater: parses enemy summaries into categorized sticky notes wrapped inside a native frame, calculating clean grid coordinates and committing directly to the board's encrypted Yjs doc or live relay.
  - Safe Action Scopes: permission boundaries for agent operations (read-only, append-only, or full edit).

# Hosting for others (agreed, not started)

1. Configurable API base URL; CORS on PHP endpoints.
2. Optional Cloudflare Worker backend (OAuth exchange + relay, Durable Objects WebSockets) + GitLab adapter if multi-provider repo joining is wanted.
3. GitHub Actions → GitHub Pages deploy + README tutorial (static / PHP / Pages + Worker).
4. Abuse limits on the relay and auth endpoints.
