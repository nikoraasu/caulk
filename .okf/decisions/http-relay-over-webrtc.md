---
type: Decision
title: HTTP relay instead of WebRTC
description: Live collaboration uses an encrypted PHP long-poll relay, not y-webrtc.
tags: [decision, live]
generated: { by: claude-opus-5-5/okf, at: "2026-11-11T00:50:00Z" }
---

# Context

The original y-webrtc setup (signaling faked over a monkeypatched WebSocket polling `signal.php`)
never connected across real networks: no TURN, overlapping polls duplicated SDP messages, and
`sys_get_temp_dir()` writes silently failed on shared hosting. Tests passed only because they used a
real local WebSocket server.

# Decision

Relay Yjs updates and awareness directly through `signal.php` (encrypted, seq-based, long polling).
Works behind any NAT; latency ~50–150ms; smoothness comes from client-side cursor buffering.

# Consequences

- Each open board holds one PHP worker during long polls → shared-host process limits matter (auto-fallback to short polling).
- A public instance needs abuse limits (per-IP rate, room caps, concurrent long-poll cap). Not built yet.
- Future: Cloudflare Worker + Durable Objects WebSocket backend for GitHub Pages hosting.
