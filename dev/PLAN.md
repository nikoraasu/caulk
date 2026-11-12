# Caulk: implementation plan

Work top to bottom. Each task lists **why**, **files**, **steps** and **done when**.
After each task: `npm run typecheck && npm test && npm run build`, update `.okf/`, commit, and tell the owner what to try by hand.

---

## 0. Commit the work in progress (do this first)

The working tree holds finished, tested, **uncommitted** work (it's staged with `git add -A`):

- Photos stored as encrypted repo assets instead of inside the board (fixes slow commits) + automatic migration
- Board passwords (create with password, unlock screen, owner-only "Board password…" re-encryption)
- Filter-free canvas (true colours), per-board synced background colour
- VGUI colour suggestions, "VGUI shade" swatch, "Board background…" colour wheel
- Solid cover over the board while it opens or is locked
- Image downloads: max 3 at once, retried with backoff

**Steps:** `git status`, skim `git diff --cached --stat`, run the three checks, then commit
("Images as repo assets, board passwords, true-colour canvas, VGUI pickers") and push.

---

## 1. Bug: some photos stay placeholders

**Symptom:** on a photo-heavy board, two photos showed as grey placeholders after loading.

**Already fixed (unconfirmed):** downloads were all started at once and a failed one was never retried.
`src/sync/imageAssets.ts` now limits downloads to 3 at a time and retries with backoff (3s → 60s).

**If it still happens, diagnose before changing code:**
1. Open the browser console and look for `[caulk] image download failed <fileId> <error>`.
2. Network tab: filter `.assets`. Note the status of the failing request (404 = file missing, 403/429 = rate limit, 409 = upload race).
3. In the console: `__excalidrawAPI.getFiles()`. Does the placeholder's `fileId` exist there?
4. Check the board's Yjs `files` map entry for that id: is it `{asset: "caulk-asset:..."}`, or still an inline `dataURL`?

**Likely causes and fixes:**
- *404, asset never uploaded:* the upload failed and was retried only while the uploader's tab was open. The image still sits in that browser's pending queue (IndexedDB `caulk-pending-assets`). Fix: open the board again in the browser that added the photo; it re-uploads on start. Possible improvement: show a "N images waiting to upload" badge in the status bar.
- *Element arrived before its file:* Excalidraw may mark an image element `status: "error"`. Check that `api.addFiles` re-renders it. If not, after `addFiles`, touch those elements with `api.updateScene({ elements })` so they redraw.
- *Upload race (409):* two clients migrating the same image at once. `AssetStore.put` treats "already exists" as success after re-listing the folder, so check that path.

**Done when:** a 30+ photo board loads every photo after a hard refresh, on two devices.

---

## 2. Smarter GitHub saving (agreed with the owner)

**Why:** every open client commits the same edits → conflicts, retries, commit spam.
**Files:** `src/sync/engine.ts`, `src/ui/BoardScreen.tsx` (around the `new SyncEngine({...})` call), `src/sync/live.ts`.
**Steps:**
1. Debounce: commit after 10s idle, at most 60s during continuous editing (`debounceMs: 10_000`, `maxWaitMs: 60_000`).
2. One saver per live room: the peer with the lowest awareness clientID commits, the others don't. Re-elect when that peer leaves. `live.ts` must expose the current peer ids. Non-savers still keep IndexedDB and still save on tab hide if they are the last peer.
3. Poll GitHub every ~30s while the live relay is connected; drop back to 2.5s when it disconnects.
4. Keep "save on tab hide".
**Done when:** two browsers editing together produce one commit stream, with no 409 retries in the console. Add a sync test for saver election if practical.

---

## 3. Import Miro boards

**Why:** the owner wants to bring existing Miro boards into Caulk.
**Approach:** Miro REST API v2 (`GET https://api.miro.com/v2/boards/{board_id}/items`, paginated with `cursor`). The user creates a Miro developer app and pastes an access token plus the board URL. Miro's own export (image/PDF) and Enterprise backups (.rtb) are not usable.
**First check:** whether `api.miro.com` allows browser CORS calls. If it doesn't, add `public/api/miro.php`, a tiny proxy that forwards only GETs to `api.miro.com/v2/boards/...` with the user's token and never stores it.
**Mapping (Miro → Excalidraw):**
| Miro item | Caulk |
|---|---|
| `sticky_note` | Caulk sticky (reuse the sticky creation code in BoardScreen; map Miro's colour names to hex) |
| `shape` (rectangle, circle, triangle, rhombus…) | rectangle / ellipse / diamond, with fill and stroke colours |
| `text` | text element (Miro text is HTML: strip tags) |
| `frame` | Excalidraw frame |
| `image` | download it, then add it as a file. It is uploaded as an encrypted asset automatically by `ImageAssetSync` |
| `connector` | arrow bound to the mapped start/end elements |
| `card`, `app_card`, tables, mind map | text in a rectangle (simplified) |
Miro positions are item **centres**, relative to the parent frame when `parent` is set. Convert them to Excalidraw top-left absolute coordinates.
**UI:** a menu item "Import from Miro…" opens a modal (token, board URL, Import button, progress bar). The import is added at the current viewport and grouped so it can be moved as one piece.
**Files:** new `src/import/miro.ts` (fetch + mapping, pure and testable), new `src/ui/MiroImportModal.tsx`, small hook-up in `BoardScreen.tsx`, maybe `public/api/miro.php`.
**Done when:** a sample Miro board with stickies, shapes, text, a frame, an image and connectors imports with the right layout. Add a unit test for the mapping using a recorded JSON sample.

---

## 4. Wipe the local copy of locked boards (optional, ask the owner)

**Why:** the browser keeps an **unencrypted** offline copy of each board (y-indexeddb, database `slate:<boardKey>`). The lock screen hides it, but someone with access to that browser's storage could still read it.
**Steps:** when `SyncEngine` emits `locked`, delete that IndexedDB database. Possibly also encrypt the offline copy with the board key.

---

## 5. License (owner must choose)

Copyleft wanted: **GPL-3.0 or AGPL-3.0** (AGPL recommended, since Caulk is a hosted web app). Ask the owner. Then add `LICENSE` (full text), a `"license"` field in `package.json`, and a README license section. Also rewrite the README "Setup" section: classic OAuth vs GitHub App vs personal token, pointing to `public/api/config.sample.php`.

---

## 6. GitHub App login (when the owner is ready)

The code is done (`src/auth/token.ts`, `public/api/auth.php`). The owner still has to create the GitHub App. The settings to use are in `.okf/architecture/auth.md`. Afterwards, set `GITHUB_APP_SLUG` in the server's `config.php`. This gives per-repo access instead of access to all repos.

---

## 7. Hosting for others

1. Configurable API base URL + CORS on the PHP endpoints.
2. GitHub Actions workflow → GitHub Pages deploy.
3. Optional Cloudflare Worker backend (OAuth exchange + relay via Durable Objects).
4. README tutorial for three setups: static-only, PHP host, Pages + Worker.
5. Abuse limits on the relay and auth endpoints.

---

## 8. Miro-style features (owner APPROVED, build these in order)

These are agreed with the owner. Build them; don't ask first. Each feature goes in **new files**
(`src/features/<name>/…`); `BoardScreen.tsx` only gets a few lines to mount components and wire callbacks
(menu item, shortcut). All shared state lives in the board's Yjs doc (`src/crdt/scene.ts`, see how the
`timer` and `settings` maps are done), so it syncs live and saves to GitHub encrypted like everything else.
Ephemeral state (who is voting, "look here" pings) goes over awareness in `src/sync/live.ts`.
After each feature: checks pass, add a unit test for the Yjs data helpers, commit, tell the owner what to try.

### 8.1 Comments and threads
**Why:** most async work in Miro happens in comments; Caulk has none.
**Data:** Yjs map `comments`: `threadId → { id, elementId?: string, x, y, resolved: boolean, createdAt,
author, messages: [{ id, author, text, at, reactions: { [emoji]: string[] /* author names */ } }] }`.
Store `messages` as a `Y.Array` inside a `Y.Map` per thread so concurrent replies merge.
**UI:**
1. Comment tool: menu item "Add comment" + shortcut **C**; next click on the canvas drops a pin. If the click
   hits an element, store `elementId` and keep the pin offset relative to it (pin follows the element when moved).
2. Pins: small round avatar badges rendered in an overlay layer, positioned with scene→viewport conversion
   (`sceneCoordsToViewportCoords` from Excalidraw), updated on scroll/zoom (`onScrollChange`). Unread count dot.
3. Clicking a pin opens a thread popover: messages, reply box (Enter sends, Shift+Enter newline), **@mentions**
   autocompleted from live peers + previous authors, emoji reactions on each message (👍 ❤️ 😂 🎉 👀 + picker),
   Resolve / Reopen, delete own message.
4. Comments sidebar (Excalidraw sidebar like the AI one): all threads, filter Open / Resolved / Mentions me,
   click to scroll the canvas to the pin.
5. Deleting an element keeps its threads but marks them "element removed" (pin stays at last position).
6. Toggle "Show comments" in the Caulk menu (hide pins while presenting).
**Done when:** two browsers see a new comment, reply, reaction and resolve within ~1s; comments survive reload
and appear after a GitHub pull on a third device.

### 8.2 Reactions and dot voting on stickies
**Why:** this plus the existing timer covers most workshop activity.
**Data:** Yjs map `votes`: `{ session?: { id, votesPerPerson, endsAt?, startedBy, anonymous }, ballots:
{ [sessionId]: { [author]: elementId[] } } }`; Yjs map `reactions`: `elementId → { [emoji]: author[] }`.
**UI:**
1. Reactions: hover/select a sticky or shape → small floating bar with 5 emojis; counts render as chips on the
   element's bottom edge (overlay, not Excalidraw elements). Click your own reaction again to remove it.
   Replace the current "stamp reaction" (`stampReaction` in BoardScreen.tsx ~1477, which inserts text elements)
   with this, or keep stamps only as a separate "stamp" tool.
2. Voting session: menu "Start voting…" → dialog (votes per person, default 3; optional duration reusing the
   timer; anonymous yes/no; only frame X or whole board). Everyone gets a banner "Voting: 2 of 3 votes left".
   Click a sticky to add a dot, click again to remove. Others' dots hidden until the session ends (if anonymous).
3. End (starter clicks End, or timer runs out): results panel sorted by votes, click a row to jump to it,
   "Copy results as Markdown", and optional "Tag top N" that writes a small "N votes" label.
**Done when:** three browsers vote, limits are enforced per person, results match, and a reload mid-session
keeps the votes.

### 8.3 "Bring everyone to me" and attention pings
**Why:** the key feature for running a meeting. Follow mode already exists (BoardScreen.tsx ~1230,
`followingPeerId`), this is the reverse.
**Steps:**
1. Awareness field `summon: { at, viewport }` set by the presenter (button next to peer avatars + menu
   "Bring everyone to me"). Every peer whose `followingPeerId` is null starts following the presenter
   (reuse the existing easing code) with a toast "<name> brought you here — Esc to stop".
2. "Look here" ping: Alt+click (or menu) → awareness `ping: { x, y, at }`; peers see a pulsing ring at that
   scene point for 4s and an edge arrow if it's off-screen. Rate limit 1 per 2s.
3. Presenter mode toggle: while on, new joiners auto-follow the presenter.
**Done when:** in two browsers, summon moves the other view, Esc releases it, and pings show on/off-screen.

### 8.4 Templates
**Why:** new boards start empty; templates are how Miro onboards.
**Steps:**
1. A template = JSON `{ name, description, elements, files? }`. Built-ins in `src/features/templates/builtin/`:
   Retro (went well / to improve / actions), Kanban (To do / Doing / Done), Brainstorm, SWOT, Mind map,
   User story map, Flowchart starter, Weekly planning.
2. "Insert template…" menu item → gallery modal with thumbnails (`exportToSvg` of the elements); inserting
   regenerates element ids and places the template at the viewport centre, inside a frame.
3. "Save selection as template": writes `templates/<slug>.json` (encrypted, same storage as boards) to the
   repo; gallery shows a "This repo" section.
4. When creating a new board, offer "Blank" or a template.
**Done when:** each built-in inserts correctly twice on one board (no id clashes) and a saved template appears
in another board in the same repo.

### 8.5 Boards home page
**Why:** opening a board by typing its path is the biggest friction vs Miro's dashboard.
**Steps:** after login, show a grid of boards in the connected repo(s) (list via `src/storage/github.ts`),
with name, last edited time + author (latest commit on the file), a cached thumbnail (render on save, store as
an encrypted asset next to the board), lock icon for password boards. Actions: open, new (blank/template),
rename, duplicate, delete (confirm). Search box and "recent" section (localStorage).
**Done when:** the home page lists every board, thumbnails appear after a board is saved once, rename and
duplicate work.

### 8.6 Later (not approved yet, ask the owner first)
Smarter stickies (auto-fit text, tags, AI clustering), Kanban cards synced with GitHub Issues, tables,
mind-map nodes with Tab/Enter, board search, view/comment-only links, roles, PDF/CSV export, activity panel,
own-changes-only undo, mobile polish, onboarding tour.
