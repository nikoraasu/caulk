# Caulk — Project Handoff & Next Steps

This document outlines the current state of the project, recent deliverables, and the prioritized follow-up items for the next development session.

---

## 📌 Current Status

- **Active Branch**: `feature/infinite-canvas-v2` (pushed to `origin/feature/infinite-canvas-v2`)
- **Pull Request URL**: https://github.com/nikoraasu/caulk/pull/new/feature/infinite-canvas-v2
- **Verification**:
  - `npm run typecheck`: **0 errors**
  - `npm test`: **All 9 test suites passing** (`test:tasks`, `test:activity`, `test:soundboard`, `test:ai`, `test:cli`, `test:sync`, `test:live`, `test:navigation`, `test:canvas`)
  - `npm run pack`: Successful, `caulk-seohost.zip` (3.1 MB) generated
  - `.okf/` knowledge bundle strictly validated (`okf_validate.py --strict`)

---

## 📋 Prioritized Handoff Items

### 1. Dynamic Theme-Aware Arrow Styling
- **Problem**:
  Connector arrows created by the quick-branching handles (`handleQuickBranch`) in [`src/features/diagram/BranchingOverlay.tsx`](file:///home/nikolas/miro-alt/src/features/diagram/BranchingOverlay.tsx#L146) currently hardcode `strokeColor: "#c59c3a"` (classic VGUI gold/amber). When using modern themes (e.g., Frutiger Aero, Windows XP, Cyberpunk Amber CRT, Dracula Night) or a custom main-color palette, the arrows do not match the active theme.
- **Desired Behavior**:
  Newly spawned connector arrows should use the current board theme's accent color (or a theme-appropriate stroke color derived from `effectiveTheme.accent` / `boardTheme.colors.accent`).
- **Files to Modify**:
  - [`src/features/diagram/BranchingOverlay.tsx`](file:///home/nikolas/miro-alt/src/features/diagram/BranchingOverlay.tsx):
    Pass the current theme or accent color prop (e.g. `themeAccent?: string` or `effectiveTheme`) and use it in `sanitizeElement({... strokeColor: themeAccent || "#c59c3a" })`.
  - [`src/ui/BoardScreen.tsx`](file:///home/nikolas/miro-alt/src/ui/BoardScreen.tsx):
    Pass `effectiveTheme.accent` or `boardTheme.colors.accent` to `<BranchingOverlay />`.

---

### 2. Anchor Quick-Branching Handles on Canvas Pan / Board Move
- **Problem**:
  The four directional plus (`+`) handles correctly move along with an object when the object itself is dragged across the canvas. However, when the user moves/pans the entire board (e.g. via spacebar drag, middle-click pan, or trackpad scrolling) while an object is selected, the plus handles can desynchronize or move relative to the viewport rather than remaining locked to the selected object's scene coordinates.
- **Root Cause & Investigation**:
  In [`src/features/diagram/BranchingOverlay.tsx`](file:///home/nikolas/miro-alt/src/features/diagram/BranchingOverlay.tsx):
  - `toOverlayXY(sceneX, sceneY)` maps canvas coordinates to screen coordinates using `appState.scrollX`, `appState.scrollY`, and `appState.zoom`.
  - During continuous canvas panning (e.g., when the user holds spacebar or uses middle-click drag), Excalidraw updates `appState.scrollX`/`scrollY`, but `api.onScrollChange` may only fire at the end of the scroll gesture, or the RAF subscription in `useEffect` may not catch every frame of pointer pan.
- **Recommended Solutions**:
  1. **Continuous RAF during panning**: Listen to `pointermove` or `wheel` on the canvas container while any element is selected so `setTick` runs on every animation frame during active pans.
  2. **Hide during pan**: When `appState.isPanning` is true (or when middle mouse / space is held), hide the plus handles (`if (appState?.isPanning) return null;`) and re-anchor them instantly the moment panning stops.

---

## 🔍 Key Code References

| Feature | Key Files |
|---|---|
| Quick Branching & Handles | [`src/features/diagram/BranchingOverlay.tsx`](file:///home/nikolas/miro-alt/src/features/diagram/BranchingOverlay.tsx), [`src/features/diagram/branching.css`](file:///home/nikolas/miro-alt/src/features/diagram/branching.css) |
| Hierarchy Tree Auto-Layout | [`src/ui/treeLayout.ts`](file:///home/nikolas/miro-alt/src/ui/treeLayout.ts) |
| Alignment & Grid Toolbar | [`src/features/diagram/SelectionToolbar.tsx`](file:///home/nikolas/miro-alt/src/features/diagram/SelectionToolbar.tsx) |
| Tactical Radar Minimap | [`src/ui/Minimap.tsx`](file:///home/nikolas/miro-alt/src/ui/Minimap.tsx), [`src/features/navigation/SceneBridge.ts`](file:///home/nikolas/miro-alt/src/features/navigation/SceneBridge.ts) |
| Player Scoreboard (<kbd>TAB</kbd>) | [`src/ui/PlayerListModal.tsx`](file:///home/nikolas/miro-alt/src/ui/PlayerListModal.tsx) |
| Theme Engine & Shade Generator | [`src/ui/boardTheme.ts`](file:///home/nikolas/miro-alt/src/ui/boardTheme.ts), [`src/ui/ThemePickerModal.tsx`](file:///home/nikolas/miro-alt/src/ui/ThemePickerModal.tsx) |
| Architecture & Knowledge Docs | [`.okf/architecture/infinite-canvas.md`](file:///home/nikolas/miro-alt/.okf/architecture/infinite-canvas.md), [`.okf/decisions/roadmap.md`](file:///home/nikolas/miro-alt/.okf/decisions/roadmap.md) |
