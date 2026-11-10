---
type: Architecture
title: Video assets
description: Local video files are stored as encrypted, content-addressed files in the board repo.
tags: [assets, video, storage]
resource: /src/storage/assets.ts
generated: { by: claude-opus-5-5/okf, at: "2026-11-11T00:50:00Z" }
---

# Overview

Excalidraw sanitizes `data:` links to `about:blank`, and data URLs are too big for live sync, so
local videos are uploaded instead.

- Path: `<board dir>/.assets/<sha256 of plaintext>.bin`, encrypted with the board passphrase. Plaintext = u32 header length + JSON `{v,mime}` + bytes. Upload skipped if it already exists.
- Element link: `caulk-asset:<sha>?type=<mime>` (survives Excalidraw's sanitizer). `renderEmbeddable` renders `AssetVideo`, which downloads, decrypts, and uses a cached object URL.
- Cap 25MB. Embeddables need a click to activate before playing.
- Images still live in the Yjs `files` map as data URLs — candidate to move to this store.
