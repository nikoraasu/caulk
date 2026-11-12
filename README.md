# Caulk

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](tsconfig.json)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](package.json)
[![CRDT: Yjs](https://img.shields.io/badge/CRDT-Yjs%2013.6-orange.svg)](https://yjs.dev)
[![Encryption: AES--256--GCM](https://img.shields.io/badge/Encryption-AES--256--GCM%20%2B%20PBKDF2-green.svg)](src/crypto/envelope.ts)

A private, collaborative whiteboard and canvas — sticky notes, native frames, Jira-grade tasks, retro soundboard, and diagrams — that lives directly in **your own GitHub repository**, styled with an authentic **Steam (Valve VGUI)** retro aesthetic.

- **100% Data Ownership**: Board state is saved directly into your GitHub repo as versioned commits. No database, no tracking.
- **End-to-End Encrypted**: Boards are encrypted client-side with AES-256-GCM (PBKDF2 with 600,000 iterations).
- **Real-Time Collaboration**: Sub-300ms peer sync via a lightweight PHP relay without storing unencrypted data.
- **AI Agent Native**: External coding agents (Antigravity, Claude Code, Cursor, Codex) can inspect boards, manage tasks, and drop stickies via headless CLI.

---

## Quick Start

```bash
git clone https://github.com/nikoraasu/caulk.git
cd caulk
npm install
npm run dev
```

Open `http://localhost:5173`. Connect your GitHub repository using a Personal Access Token (PAT) or OAuth.

---

## Example Board (`boards/example.slate`)

The repository includes a pre-built demo board at [`boards/example.slate`](boards/example.slate) showcasing:

- **Sprint 14 & Milestones**: 9 color-coded Jira-grade tasks with subtasks, assignees, and priorities.
- **Native Frames**: Miro-style grouping frames (`Architecture & Sync Lanes`, `Active Sprint 14`, `Shortcuts`).
- **Retro Soundboard**: Vintage audio clips mapped to hotkeys `1`–`5`.
- **Assets & Badges**: Embedded branding graphics and dot-voted stickies.

Try it in the web app by opening board **`example`**, or inspect it from your terminal:

```bash
# Dump board contents (human-readable or JSON)
npx caulk dump --board example
npx caulk dump --board example --json

# List tasks by status
npx caulk list-tasks --board example --status IN_PROGRESS
npx caulk list-tasks --board example --status TODO
```

---

## Features

- **Jira-Grade Progress Hub (`T`)**: Kanban board, Gantt timeline with day snapping, sprint tracking, and team workload analytics.
- **Retro Whiteboard Soundboard (`1`–`9`)**: 5 vintage packs (Steam VGUI, Windows 95, Windows XP, Frutiger Glacier, Mac OS 9) with audio clipper and live peer broadcast.
- **11 Retro Themes & Custom Studio**: Steam VGUI, Windows XP Luna, Frutiger Aero/Glacier/Aqua/Dorfic/Metal, Mac OS 9, Win95, DOS TUI, and Vaporwave — plus an in-app Custom Studio with live preview, JSON export/import, and peer CRDT sync. See [`docs/THEMING.md`](docs/THEMING.md).
- **Native Frames (`F`)**: Miro-style grouping frames that move and resize all contained elements together.
- **Zero-Knowledge Encryption**: AES-256-GCM encryption client-side. Open boards use repository-scoped keys; password boards require custom passphrases.
- **Collaborative Activity Audit**: Ring-buffer activity log tracking element edits and task status changes.
- **Headless CLI (`npx caulk`)**: Manage tasks, change status, switch themes, and add stickies autonomously from AI agents or scripts.

---

## Headless CLI & AI Agents

Any AI coding agent (or terminal user) can inspect and update Caulk boards directly:

```bash
# List tasks
npx caulk list-tasks --board main --status TODO

# Add a task with subtasks and a canvas sticky note
npx caulk add-task \
  --board main \
  --title "Implement session refresh" \
  --status TODO \
  --priority HIGH \
  --assignee "nikoraasu" \
  --subtasks "Rotate JWT, Persist refresh token, Handle 401" \
  --sticky

# Update task status
npx caulk update-task --board main --task "Implement session refresh" --status DONE

# Inspect or change board theme
npx caulk get-theme --board main
npx caulk set-theme --board main --preset frutiger-aero

# Drop a sticky note onto the canvas
npx caulk add-sticky --board main --text "Verified tests pass" --color green
```

For agent setup instructions, see [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md).

---

## Self-Hosting

Caulk compiles to static assets and two PHP scripts ([`api/signal.php`](public/api/signal.php) and [`api/auth.php`](public/api/auth.php)). No MySQL or Node.js server required.

### Shared Hosting (cPanel / DirectAdmin)
1. Run `npm run pack` to generate `caulk-seohost.zip`.
2. Extract the archive into your web root (e.g. `public_html/`).
3. Copy `api/config.sample.php` to `api/config.php` and set your GitHub App credentials.
4. Ensure `api/` is writable (`chmod 755 api`) for ephemeral relay state.

### Nginx + PHP-FPM
```nginx
server {
    server_name caulk.yourdomain.com;
    root /var/www/caulk/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
    }

    location ^~ /api/_relay/ { deny all; }
    location ~ /\. { deny all; }
}
```

---

## Keyboard Shortcuts

| Key | Action | Description |
|---|---|---|
| `V` / `1` | **Select** | Pointer selection mode |
| `R` / `2` | **Rectangle** | Draw shapes |
| `F` | **Frame** | Grouping frame (moves child elements together) |
| `S` | **Sticky Note** | Drop a sticky note |
| `T` | **Tasks Hub** | Kanban board, Gantt timeline, and sprints |
| `C` | **Comment** | Collaborative comment thread |
| `1`–`9` | **Soundboard** | Broadcast audio clips to peers |
| `Alt + Click` | **Radar Ping** | Attention ping for collaborators |
| `Space + Drag` | **Pan** | Pan canvas |

---

## Development

```bash
npm run dev               # Start dev server
npm run typecheck         # Typecheck TypeScript
npm test                  # Run test suite
npm run build:cli         # Build headless CLI (bin/caulk.mjs)
npm run build             # Build production client bundle
npm run pack              # Package zip for deployment
```

---

## License

GNU General Public License v3.0 ([GPL-3.0-or-later](LICENSE)).
