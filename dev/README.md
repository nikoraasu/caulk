# Caulk: developer handover

Read this file first, then [PLAN.md](PLAN.md).

## What Caulk is

A Miro-style whiteboard built on **Excalidraw 0.18.1** and **Yjs**.

- Each board is an encrypted Yjs document stored in a GitHub repo the user owns, for example `boards/roadmap.slate`. It uses AES-GCM, with the key derived from a passphrase via PBKDF2.
- Live collaboration (cursors and edits) runs through a small PHP long-poll relay on the host (`public/api/signal.php`). There's no WebRTC. The relay only ever sees ciphertext.
- Live site: https://caulk.mikolajpolok.pl (seohost / DirectAdmin, PHP). Code: github.com/nikoraasu/caulk, branch `main`.

## Where knowledge lives

- `.okf/`: the project knowledge bundle (markdown). **Start at `.okf/index.md`.** The most useful pages:
  - `.okf/architecture/sync-lanes.md`: how GitHub saving, IndexedDB and the live relay fit together
  - `.okf/architecture/video-assets.md`: images and videos as encrypted repo assets, board passwords, re-encryption
  - `.okf/architecture/live-relay.md`, `auth.md`, `ui-integration.md`
  - `.okf/decisions/roadmap.md`: agreed plans and open decisions
  - `.okf/operations/deploy-seohost.md`, `tests.md`
- When you change how something works, update the matching `.okf` page in the same change.

## Commands

| Command | What it checks |
|---|---|
| `npm run typecheck` | TypeScript |
| `npm test` | `test/sync.test.ts` (fake GitHub API: encryption, conflicts, merging, image assets, re-encryption) + `test/live.test.ts` (relay protocol) |
| `npm run build` | Production build into `dist/` |

Run all three before calling anything done.

**Deploy:** `npm run build`, then `cd dist && zip -qr ../caulk-seohost.zip . -x 'api/config.php' -x 'api/_relay/*'`. The owner uploads the zip in DirectAdmin, keeps `api/config.php`, and deletes the old `assets/` folder.

## Map of the code

| Area | Files |
|---|---|
| Board screen (big, ~2000 lines) | `src/ui/BoardScreen.tsx` |
| Excalidraw ⇄ Yjs bridge | `src/crdt/scene.ts` (`SceneBridge`) |
| GitHub save/poll loop | `src/sync/engine.ts` (`SyncEngine`) |
| Live relay client | `src/sync/live.ts` + `public/api/signal.php` |
| Encryption | `src/crypto/envelope.ts`, `src/storage/encrypted.ts` |
| GitHub API | `src/storage/github.ts` (Contents API + Git Data API `commitFiles`) |
| Images/videos as repo assets | `src/storage/assets.ts`, `src/sync/imageAssets.ts`, `src/storage/pendingUploads.ts` |
| Board passwords | `src/config.ts` (`getBoardPassphrase`/`setBoardPassphrase`), `src/storage/rekey.ts`, `src/ui/BoardPasswordModal.tsx` |
| VGUI colours | `src/ui/vguiColors.ts`, `build/excalidrawPalette.ts` (build-time patch of Excalidraw's quick swatches), `src/ui/BackgroundPicker.tsx` |
| Login | `src/auth/token.ts`, `public/api/auth.php`, `src/ui/SetupScreen.tsx` |
| Styles (VGUI = Valve Source-engine GUI look) | `src/styles.css` (`--vgui-*` variables at the top) |

## Rules and gotchas (learned the hard way)

1. **Never save with the wrong key.** If a board can't be decrypted, `SyncEngine` goes to `locked` and must never commit. Don't weaken this.
2. **No colour filters on the canvas.** The canvas uses Excalidraw's `theme="light"` on purpose. Dark mode inverts the whole canvas and also pre-filters photos, which made colours wrong. The dark look comes from CSS variables (`.excalidraw.excalidraw.theme--light` block in `styles.css`). Do not switch back to `theme="dark"`.
3. **Don't put elements inside Excalidraw's toolbar DOM** (`.excalidraw .Island` stretches). Float them beside it with a portal to `body` instead. Portaled elements lose Excalidraw's CSS variables, so use fallbacks.
4. `test/live.test.ts` has a hand-written Node copy of the relay protocol. Keep it in sync with `signal.php`.
5. PHP can't be run locally. Read PHP changes carefully; the server is the first real test.
6. `build/excalidrawPalette.ts` patches minified Excalidraw code. After any Excalidraw upgrade, check the build for "palette patch did not apply".
7. Large test files: wrap new test code in `{ }` blocks, because `test/sync.test.ts` has many top-level consts.
8. The owner prefers not to have simulated UI/feel tests. Build and smoke-check, then list what the owner should try by hand.
9. Commit messages: short, imperative, in English. Push to `main` over SSH (`git@github.com:nikoraasu/caulk.git`). No `gh` CLI is installed.
