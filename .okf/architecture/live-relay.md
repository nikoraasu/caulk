---
type: Architecture
title: Live relay
description: Real-time collaboration via an encrypted HTTP long-poll relay in PHP, with smoothed cursors.
tags: [live, realtime, relay, awareness]
resource: /src/sync/live.ts
generated: { by: claude-opus-5-5/okf, at: "2026-11-11T00:50:00Z" }
---

# Protocol (`public/api/signal.php`)

- `POST ?action=publish&room=R` body `{from, kind: update|awareness|hello, data, to?}` → `{ok, seq}`.
- `GET ?action=poll&room=R&since=N[&wait=1]` → `{messages:[seq>N], last}`. `wait=1` holds up to 15s, re-checking every 40ms.
- Storage `api/_relay/<room>.json` (auto-created, `.htaccess` deny). 60s TTL, max 300 messages, 2MB body cap. Returns 500 if it cannot write (never fakes ok).
- Room = `caulk-` + sha256(owner/repo/branch/path)[0:32]. `data` = base64(iv‖AES-GCM) with key from passphrase, salt = sha256(room)[0:16]; server sees ciphertext only.

# Client (`LiveSession`)

- Doc updates batched every 40ms (`Y.mergeUpdates`); retry after 2s if relay down.
- Awareness (y-protocols) throttled to 50ms; carries a `trail` of timestamped pointer samples.
- Join: publish `hello` (state vector); peers reply with a directed diff + awareness, and send their own hello back so the joiner's unsynced state flows too.
- Polling: single-flight long polls while visible; 2s short polls when hidden; falls back to 300ms short polling after 3 strikes (failure, >20s, or empty <1s).
- First poll ignores replayed awareness (prevents ghost duplicates after reload). A precomputed encrypted "goodbye" is sent on `pagehide` via keepalive fetch.

# Cursor smoothing

Per peer: clock offset = min(recv − t); adaptive jitter buffer = p95 lateness + 40ms, clamped 80–600ms
(grows fast, shrinks slowly); linear interpolation per rAF, then exponential easing (45ms) of the drawn
position. `onCollaboratorsChange` may fire every frame; `onStatusChange` only on peer-set/name/viewport change.
Follow mode (BoardScreen) eases scroll+zoom toward the followed peer's viewport (90ms time constant).

See [why not WebRTC](/decisions/http-relay-over-webrtc.md). Tests: [Tests](/operations/tests.md).
