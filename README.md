# Caulk

A Miro-like whiteboard and canvas — sticky notes, diagrams, Mermaid charts — that lives in **your own GitHub repo**, styled with the authentic **Steam (Valve VGUI)** aesthetic.

No backend, no accounts, zero tracking. Real-time collaboration happens through an end-to-end encrypted HTTP relay (`api/signal.php`) while you're connected, with changes persisted to GitHub via debounced commits.

```
┌──────────────────────────────────────────────┐
│ Excalidraw canvas (shapes, arrows, Mermaid)  │
├──────────────────────────────────────────────┤
│ SceneBridge   Excalidraw elements ⇄ Yjs doc  │
│                (Y.Map per element + Y.Array  │
│                 for z-order + Whitelist)     │
├──────────────────────────────────────────────┤
│ Live relay │  E2E encrypted live sync (PHP)  │
│ IndexedDB  │  offline-first persistence      │
│ GitHub     │  AES-GCM encrypted blob storage │
└──────────────────────────────────────────────┘
```

## Subdomain Hosting (`caulk.yourdomain.com`)

Caulk compiles to a 100% static client-side single page app. To host it at `caulk.yourdomain.com`:

1. Build the production bundle:
   ```bash
   npm run build
   ```
2. Upload the `dist/` directory contents to your web server or point your DNS CNAME (`caulk`) to your static hosting provider (Cloudflare Pages, GitHub Pages, Vercel, or Nginx/Caddy).

3. For Nginx:
   ```nginx
   server {
       server_name caulk.yourdomain.com;
       root /var/www/caulk;
       index index.html;

       location / {
           try_files $uri $uri/ /index.html;
       }
   }
   ```

## Why this shape

The goal was real collaboration without hosting anything. That rules out WebSockets and
webhooks (both need a URL you own), which leaves polling a file. Polling a file is fine
for *async* work but loses edits unless you deal with merge conflicts properly. So the
document is a CRDT (Yjs): every change is commutative, so pulling someone else's state
and re-pushing can never destroy their work.

Conflict granularity is **one element**. Two people editing different sticky notes never
interfere. Two people editing the same note resolve last-writer-wins on that note, which
is the same promise Miro makes.

## What works today (phases 0, 1 + 2)

- Full Excalidraw canvas: sticky notes, shapes, arrows, text, freehand, images-as-shapes.
- Sticky palette on the left; notes cascade instead of stacking.
- Offline-first: everything is persisted to IndexedDB, so a reload or a network drop
  loses nothing.
- **Live preview & peer collaboration (Phase 2):** Edits and cursors go through a
  small PHP polling relay (`api/signal.php`, ~300ms) that only stores ciphertext in
  `api/_relay/`. No WebRTC, so it works behind any NAT or firewall.
- **Live presence & cursors:** Cursors with usernames, assigned pastel badges, laser
  pointer trails, and live element selection highlights.
- **Collaborator status bar & top bar:** Live online peer indicator ("🟢 2 peers live"),
  online user avatars with name badges, and connection state.
- Automatic sync to GitHub: conditional polling (`ETag` → `304` is free against the rate
  limit) plus debounced commits.
- Write races (two people committing at once) are detected as `ConflictError`, merged
  with Yjs, and retried — losslessly.
- AES-GCM encryption with a PBKDF2-derived key. GitHub stores ciphertext only, so a
  public repo leaks nothing but the board's name. Live relay traffic is end-to-end encrypted
  with the same passphrase.
- Live status bar: save state, live peer count, last check, remote update count, remaining API budget.

## What is not built yet

- Images pasted into the canvas are not synced (they live in Excalidraw's `files` map,
  which is not part of the document yet).
- Character-level merge *inside* a note: the note is one element, so text is LWW.
- Boards larger than 1 MB of encoded CRDT state (the Contents API limit for inline
  content).

## Setup

1. Create a **private** repo on GitHub, e.g. `you/boards`.
2. Create a **fine-grained personal access token** for that repo with
   *Repository permissions → Contents: Read and write*.
3. `npm install && npm run dev`, open http://localhost:5173.
4. Fill in `you/boards`, paste the token, pick a board name and a passphrase.
   "Test connection" checks the repo and your write access first.

The board is written to `boards/<name>.slate` as a JSON envelope:

```json
{
  "v": 1,
  "app": "slateboard",
  "kdf": { "algo": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "…" },
  "iv": "…",
  "data": "…"
}
```

## Collaborating

Everyone who opens the same repo + branch + path **with the same passphrase** is on the
same board. Work is picked up within the poll interval (4s) or immediately via *Pull*.
Share the passphrase out of band; it is never stored on disk, only in `sessionStorage`, so
closing the tab locks the board.

The sync loop is intentionally boring:

- **Read:** conditional `GET` every 4s while the tab is visible, paused when hidden.
- **Write:** 2.5s after the last edit, or on tab hide / *Save now*.
- **Race:** on `409`/`422`, re-read, `Y.applyUpdate`, re-encode, retry (up to 3 times).

## Scripts

```bash
npm run dev               # vite dev server
npm run build             # typecheck + production build
npm run typecheck
npm test                  # runs both GitHub storage sync & live relay tests
npm run test:sync         # two clients + a fake GitHub API + real crypto
npm run test:live         # two clients + in-process relay + live cursors
```

The integration test spins up an in-process fake of the GitHub Contents API (with real
ETag/304 and sha-conflict behaviour), then asserts: the envelope contains no plaintext,
a second client decrypts it, a wrong passphrase fails loudly, a stale write raises
`ConflictError` and succeeds after re-syncing, and two live `SyncEngine`s converge in
both directions including concurrent edits.

## Roadmap

- **Phase 2 — live lane.** Done as an HTTP polling relay plus Yjs
  awareness for cursors. The durable path must never depend on the live path; losing
  the relay should only cost cursors and instant updates.
- **Phase 3 — history.** Named snapshots (`snapshots/<ts>.slate` on close / every N
  minutes), a "what changed since you were here" summary, and compaction.
- **Phase 4 — more backends.** A `StorageAdapter` for Google Drive (`appDataFolder` or a
  visible folder), optional per-board keys instead of one passphrase.
- **Later.** Per-client append-only update files (`updates/<clientId>/<seq>`) to make
  write conflicts structurally impossible, then compaction.

## Layout

```
src/
  crdt/scene.ts          Excalidraw ⇄ Yjs bridge (the interesting file)
  sync/engine.ts         poll + debounce + conflict retry
  storage/github.ts      Contents API adapter, ETags, sha conflicts
  storage/encrypted.ts   encryption wrapper around any adapter
  storage/types.ts       the StorageAdapter seam (Drive goes here)
  crypto/envelope.ts     PBKDF2 + AES-GCM
  ui/                    SetupScreen, BoardScreen, StatusBar
test/sync.test.ts        integration test against a fake GitHub
```

## Threat model, honestly

Encryption protects the board contents from GitHub and from anyone with repo read access.
It does not protect against a compromised browser or a malicious script on the page: the
GitHub token and the derived key both live in memory. Use a token scoped to a single repo
and revoke it if anything looks off.
