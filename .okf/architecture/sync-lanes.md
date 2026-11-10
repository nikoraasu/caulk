---
type: Architecture
title: Sync lanes
description: Caulk keeps a durable GitHub lane and a best-effort live lane over one Yjs doc.
tags: [sync, yjs, github]
generated: { by: claude-opus-5-5/okf, at: "2026-11-11T00:50:00Z" }
---

# Overview

One `Y.Doc` per board. `src/crdt/scene.ts` (SceneBridge) maps Excalidraw elements ⇄ Yjs
(`elements` Y.Map of plain JSON per element, `order` Y.Array, `files`, `meta`, timer, etc.).
Local changes are tagged `ORIGIN_LOCAL`; anything else is treated as remote and pushed to the canvas.

| Lane | Code | Behaviour |
|---|---|---|
| Offline | y-indexeddb | Persists the doc locally. |
| Durable | `src/sync/engine.ts`, `src/storage/github.ts`, `encrypted.ts` | Debounced (2s) encrypted commits; ETag polling every 2.5s; sha conflicts merged via Yjs and retried. Boards >1MB read via Git Blobs API. |
| Live | `src/sync/live.ts` + `public/api/signal.php` | See [Live relay](/architecture/live-relay.md). Must never be required for durability. |

Remote scene updates go through `pushToCanvas` in `src/ui/BoardScreen.tsx`, which uses
Excalidraw's `reconcileElements` (not a full replace) so in-progress local edits don't snap back,
then drops elements deleted remotely. `onChange` skips element work when the scene fingerprint
(count + sum of versions) is unchanged, because collaborator-only updates re-fire onChange every frame.
