---
type: Architecture
title: Sync lanes
description: Caulk keeps a durable GitHub lane and a best-effort live lane over one Yjs doc.
tags: [sync, yjs, github]
generated: { by: antigravity/gemini, at: "2026-11-11T16:58:00Z" }
---

# Overview

One `Y.Doc` per board. `src/crdt/scene.ts` (SceneBridge) maps Excalidraw elements ⇄ Yjs
(`elements` Y.Map of plain JSON per element, `order` Y.Array, `files`, `meta`, `settings`, `timer`, plus in `dev/` `comments` & `voting`).
Local changes are tagged `ORIGIN_LOCAL`; anything else is treated as remote and pushed to the canvas.

| Lane | Code | Behaviour |
|---|---|---|
| Offline | y-indexeddb | Persists the doc locally. |
| Durable | `src/sync/engine.ts`, `src/storage/github.ts`, `encrypted.ts` | Encrypted commits & ETag polling; sha conflicts merged via Yjs and retried. Root: 2s debounce / 15s maxWait / 2.5s poll. `dev/` & `dev/theming/`: 10s debounce / 60s maxWait, 403/429 backoff, single elected saver (`isElectedSaver` in `live.ts` — lowest awareness clientID), 30s GitHub poll while relay connected (2.5s fallback when disconnected). Boards >1MB read via Git Blobs API. |
| Live | `src/sync/live.ts` + `public/api/signal.php` | See [Live relay](/architecture/live-relay.md). Must never be required for durability. |

Remote scene updates go through `pushToCanvas` in `src/ui/BoardScreen.tsx`, which uses
Excalidraw's `reconcileElements` (not a full replace) so in-progress local edits don't snap back,
then drops elements deleted remotely. `onChange` skips element work when the scene fingerprint
(count + sum of versions) is unchanged, because collaborator-only updates re-fire onChange every frame.
