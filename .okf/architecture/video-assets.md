---
type: Architecture
title: Repo assets
description: Local videos and board images are stored as encrypted, content-addressed files in the board repo.
tags: [assets, video, images, storage]
resource: /src/storage/assets.ts
generated: { by: claude-opus-5-5/okf, at: "2026-11-11T00:50:00Z" }
---

# Overview

Excalidraw sanitizes `data:` links to `about:blank`, and data URLs are too big for live sync, so
local videos are uploaded instead.

- Path: `<board dir>/.assets/<sha256 of plaintext>.bin`, encrypted with the board passphrase. Plaintext = u32 header length + JSON `{v,mime}` + bytes. Upload skipped if it already exists.
- Element link: `caulk-asset:<sha>?type=<mime>` (survives Excalidraw's sanitizer). `renderEmbeddable` renders `AssetVideo`, which downloads, decrypts, and uses a cached object URL.
- Cap 25MB. Embeddables need a click to activate before playing.

# Images

Images used to sit in the Yjs `files` map as data URLs, so every commit re-uploaded every photo.
Now `src/sync/imageAssets.ts` (`ImageAssetSync`) moves them to the same store:

- `SceneBridge.onLocalFiles` hands new local images to it instead of writing them to Yjs. It saves each one to an IndexedDB pending queue (`src/storage/pendingUploads.ts`), uploads it, then writes an `AssetFileRef` `{id,mimeType,created,asset}` with `setFileAsset`. Failed uploads retry every 15s and on `online`, and they survive a reload.
- Peers call `resolveRefs()`, which downloads and decrypts the asset, turns it back into a data URL, and passes it to `api.addFiles` (local only).
- `migrateInline()` uploads legacy inline images and replaces them with refs. The asset is content-addressed, so two clients migrating at once is harmless. Yjs GC then drops the old bytes from the doc.
- Wired in `BoardScreen.tsx`: it is constructed with the bridge, started at hydrate, and on remote file changes it re-resolves refs and re-migrates.

# Per-board dir and board passwords

- Assets live in `<board dir>/.assets/<board name>/` (for example `boards/.assets/roadmap/`). Boards with different passphrases can't share a content-addressed file. `AssetStore.get()` falls back to the old shared `<board dir>/.assets/`, where older videos still live. `put()` writes only to the per-board dir.
- A board's passphrase defaults to `defaultPassphrase(target)`, which is derived from owner/repo/path, so in effect it's public. A board with a password is encrypted with the user's password instead (`getBoardPassphrase`/`setBoardPassphrase` in `src/config.ts`, kept in the session and optionally in localStorage). The password is never stored in the repo.
- When decryption fails, `SyncEngine` emits `locked` and never saves, so the board can't be overwritten under the wrong key. BoardScreen then shows `UnlockBoardModal`.
- Repo admins (`GitHubAdapter.repoPermissions()`) get "Board password…". `rekeyBoard` (`src/storage/rekey.ts`) re-encrypts the board file, the per-board assets and the history snapshots. It also copies legacy shared assets that the board references into the per-board dir and skips files it can't decrypt. Everything goes into ONE commit through the Git Data API (`commitFiles`, non-force ref update), and on a ConflictError it retries once. Clients still holding the old key get a conflict on their next save, fail to open the board, and lock.
- Limitation: GitHub has no per-path or per-branch read ACL. Anyone with write access can still delete or overwrite the encrypted file, but they can't read it.
