---
type: Reference
title: Getting started — Caulk
description: What Caulk is, how it is built, and where to look first.
tags: [getting-started, overview]
generated: { by: claude-opus-5-5/okf, at: "2026-11-11T00:50:00Z" }
sources:
  - id: readme
    resource: /README.md
    title: Project README
---

# Overview

Caulk is a Miro-style infinite whiteboard: an Excalidraw canvas whose state is a Yjs CRDT,
persisted **encrypted** (AES-GCM, PBKDF2 passphrase) into a GitHub repo the user controls.
No backend database. Two tiny PHP endpoints handle OAuth and the live relay.[^readme]

Repo: https://github.com/nikoraasu/caulk · Live: https://caulk.mikolajpolok.pl (seohost, LiteSpeed, DirectAdmin).

# Read next

- [Sync lanes](/architecture/sync-lanes.md): durable GitHub lane + live relay lane.
- [Live relay](/architecture/live-relay.md): how real-time collaboration works.
- [Auth](/architecture/auth.md): GitHub App vs classic OAuth vs PAT.
- [UI integration](/architecture/ui-integration.md): what lives inside Excalidraw's UI.
- [Video assets](/architecture/video-assets.md): local videos stored as repo files.
- [Deploy to seohost](/operations/deploy-seohost.md) and [Tests](/operations/tests.md).
- Decisions: [HTTP relay over WebRTC](/decisions/http-relay-over-webrtc.md), [GitHub App login](/decisions/github-app-login.md).
- [Roadmap](/decisions/roadmap.md): agreed next features.

[^readme]: Project README
