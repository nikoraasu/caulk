---
type: Architecture
title: Infinite Canvas v2 — Spatial Navigation, Layout & Rich Embeds
description: Architecture for the spatial radar minimap, camera waypoints, quick-branching connectors, tree auto-layout, rich canvas entities, 2x2 matrices, and the magic main color shade generator.
tags: [canvas, navigation, layout, embeds, waypoints, theme]
resource: /src/ui/BoardScreen.tsx
generated: { by: "antigravity/gemini", at: "2026-11-13T00:45:00Z" }
status: stable
---

# Overview

The Infinite Canvas v2 architecture transforms Caulk from a pure whiteboard canvas into an advanced, spatial collaborative thinking environment. It adds four core capability pillars:
1. **Spatial Navigation & Awareness**: Tactical Radar Minimap, viewport FOV tracking, peer dots, and persistent Camera Waypoints.
2. **Diagramming & Layout Automation**: 4-way Quick-Branching handles, Sugiyama-style Hierarchy Tree DAG Auto-Layout, and Multi-Selection Alignment/Distribution/Grid packing.
3. **Rich Canvas Embed Entities & Matrices**: Interactive VGUI Checklists (empty by default, retro progress bar), Syntax-Highlighted Code Cards, Web Bookmarks, and 5 Strategic 2x2 Matrix templates.
4. **Magic Main Color Shade Generator**: Single-color algorithm generating harmonized themes with WCAG-compliant contrast.

---

# Spatial Navigation & Minimap

### Tactical Radar Minimap (`RadarMinimap.tsx`)
- **Positioning**: Anchored to the bottom-left corner of the canvas viewport, positioned directly above Excalidraw's zoom and undo/redo controls (`bottom: 96px; left: 16px;`). Notifications (`.caulk-notif-stack`) dynamically stack above the radar to prevent overlapping.
- **Canvas Projection**: Computes world bounding box `[minX, minY, maxX, maxY]` across all non-deleted elements. Renders miniature representations of:
  - Whiteboard elements, stickies, and embed cards.
  - Native frames (`type: "frame"`) as crisp accent outlines.
  - Active peer cursors as colored dots with hover tooltips.
  - User's current viewport FOV as a high-contrast draggable/interactive viewing rectangle.
- **Interactivity**: Clicking any point on the radar immediately teleports the camera to that coordinate via `api.scrollToContent` with smooth panning.
- **Docking/Collapse**: Supports 1-click minimize/expand toggle and hides seamlessly during presentation mode.

### Camera Waypoints (`SceneBridge.ts`)
- **CRDT Map**: Stored under `doc.getMap("spatial_waypoints")`. Synchronized across all collaborators.
- **Schema**:
  ```ts
  interface SpatialWaypoint {
    id: string;
    title: string;
    x: number;
    y: number;
    zoom: number;
    created_at: string;
    author: string;
  }
  ```
- **Navigation**: Selecting a waypoint smoothly pans and zooms the viewport to the target position. Quick hotkeys allow cycling through waypoints during design walkthroughs.

---

# Diagramming, Quick-Branching & Layout

### 4-Way Quick-Branching Handles (`QuickBranchHandles.tsx`)
- Appears on the four cardinal edges (North, East, South, West) of any currently selected element or sticky note.
- Clicking a handle:
  1. Computes the offset position in the chosen direction (accounting for element dimensions and configurable spacing).
  2. Spawns an identical or paired node (e.g., matching sticky note or card).
  3. Automatically binds a directional Excalidraw `arrow` element connecting the source to the target with proper `startBinding` and `endBinding`.
  4. Selects the new node immediately for continuous diagram flow.

### Hierarchy Tree DAG Auto-Layout (`treeLayout.ts`)
- Implements a Sugiyama-style hierarchical tree layout algorithm:
  - Analyzes arrow connections between nodes to build a Directed Acyclic Graph (DAG).
  - Assigns nodes to discrete depth layers/ranks via topological sorting.
  - Resolves layer crossings and computes horizontal/vertical bounding box offsets.
  - Supports both **Top-to-Bottom** and **Left-to-Right** hierarchy layouts.
  - Commits transformed element positions to Excalidraw's scene via single batch update.

### Selection Alignment & Distribution Toolbar (`SelectionToolbar.tsx`)
- Floats dynamically above any multi-element selection (2 or more items).
- **Alignment (6 Axes)**: Align Left, Align Center, Align Right, Align Top, Align Middle, Align Bottom.
- **Distribution**: Distribute Horizontally (equal horizontal gap), Distribute Vertically (equal vertical gap).
- **Grid Packing (`packGrid`)**: Automatically arranges selected items into a tight $N \times M$ grid.

---

# Rich Canvas Embed Entities

Entities are embedded directly on the whiteboard canvas via Excalidraw's `embeddable` element type with custom HTML5 `srcDoc` overlays and theme-aware styling.

### 1. Interactive Checklists (`ChecklistCard.tsx`)
- **Empty Default**: Initialized with `items: []` to allow users to populate tasks from scratch.
- **VGUI Retro Styling**: Sharp 0px corners, sunken input wells, and amber/gold progress fill bar (`#ffc107`).
- **Interactive State**: Clicking items toggles checked status; inline add-item input; delete item triggers; completion ratio counter (`N / M done`).

### 2. Syntax-Highlighted Code Cards (`CodeCard.tsx`)
- Embeds monospaced syntax-highlighted code blocks with language selector (TypeScript, Python, Rust, SQL, Go, HTML, CSS, JSON).
- Integrated 1-click **Copy to Clipboard** button with transient success state.
- Styled with dark terminal CRT chrome and line numbers.

### 3. Rich Web Bookmarks (`BookmarkCard.tsx`)
- Pasting or inserting a URL creates a rich link preview card with favicon, extracted domain, title, and direct link.

### 4. Strategic 2x2 Matrices & Framework Templates (`matrixTemplates.ts`)
- Pre-built templates ready for 1-click insertion on the canvas:
  - **Eisenhower Priority Matrix**: Urgent vs. Important quadrants with native frame grouping.
  - **Ansoff Growth Matrix**: Market Penetration, Market Development, Product Development, Diversification.
  - **Value vs. Complexity 2x2**: Quick Wins, Major Projects, Fill-ins, Thankless Tasks.
  - **SWOT Analysis Canvas**: Strengths, Weaknesses, Opportunities, Threats.
  - **User Journey Map**: Phased stages with customer emotion swimlanes.

---

# Player Scoreboard HUD (`PlayerListModal.tsx`)

- Activated by pressing the <kbd>TAB</kbd> key on the keyboard.
- Displays a retro multiplayer scoreboard HUD:
  - Active connected peers with avatars, handles, and role badges.
  - Real-time connection latency and ping indicator.
  - Peer cursor color indicators matching on-canvas pointers.
  - 1-click **Follow / Spectate** action to lock viewport camera to a peer.

---

# Magic Main Color Shade Generator (`boardTheme.ts`)

### Color Derivation Algorithm (`generateShadesFromMainColor`)
Takes any single user-selected main color (hex) and automatically computes a complete, harmonized theme palette:
- **WCAG Relative Luminance Threshold**:
  Computes relative luminance $L = 0.2126 R + 0.7152 G + 0.0722 B$ (after gamma expansion).
  - If $L < 0.38$, the color is classified as **Dark** (e.g. navy, purple, forest green, deep crimson, dark slate).
  - If $L \ge 0.38$, the color is classified as **Light** (e.g. mint, sky blue, cream, light grey).
- **Dark Mode Derivations**:
  - `surface`: Base color or slightly lifted tone.
  - `base` (recessed well): `mixHex(mainColor, "#000000", 0.45)` for deep contrast wells.
  - `text`: Crisp `#ffffff`.
  - `accent`: High-contrast amber/gold (`#ffc107`) or complementary hue.
  - `suggestedCanvas`: Deep atmospheric background derived from the main color.
- **Light Mode Derivations**:
  - `surface`: Clean, soft surface tone.
  - `base`: Light recessed well with subtle border.
  - `text`: High-contrast dark slate (`#0f172a`).
  - `accent`: High-saturation accent color.
- **Theme Studio Integration**:
  - Main color swatch and hex input in `ThemePickerModal.tsx`.
  - Non-blocking text input (permits uninterrupted 6-character typing without premature auto-completion).
  - Live CSS variables (`--vgui-bg`, `--vgui-base`, `--vgui-accent`, `--vgui-text`) update the modal window and swatches in real-time.
