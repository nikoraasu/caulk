---
type: Playbook
title: Tests
description: Test suites and what they cover.
tags: [tests]
generated: { by: claude-opus-5-5/okf, at: "2026-11-11T00:50:00Z" }
---

| Command | Covers |
|---|---|
| `npm run typecheck` | tsc --noEmit |
| `npm run test:sync` | Fake GitHub Contents API: encryption, conflicts, convergence, >1MB blob fallback |
| `npm run test:live` | In-process Node copy of the relay protocol (incl. wait=1): edits both ways, cursors, late joiner, wrong passphrase, departure, cursor trail, ghost after crash, pagehide goodbye |
| `npm run build` | tsc + vite build (chunk-size warning is pre-existing) |

The live test's relay mirrors `signal.php` by hand; keep them in sync when changing the protocol.
User preference: no simulated UI/feel tests — build/smoke check, then list what to playtest by hand.
