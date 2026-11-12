# Caulk

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](tsconfig.json)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](package.json)
[![CRDT: Yjs](https://img.shields.io/badge/CRDT-Yjs%2013.6-orange.svg)](https://yjs.dev)
[![Encryption: AES--256--GCM](https://img.shields.io/badge/Encryption-AES--256--GCM%20%2B%20PBKDF2-green.svg)](src/crypto/envelope.ts)

> A private, collaborative whiteboard and canvas — sticky notes, native frames, Jira-grade tasks, retro soundboard, and diagrams — that lives directly in **your own GitHub repository**, styled with an authentic **Steam (Valve VGUI)** retro aesthetic.

No third-party database, no tracking, 100% data ownership. Board state is encrypted client-side with AES-256-GCM and saved directly into your GitHub repo as versioned commits. Real-time collaboration operates peer-to-peer via a lightweight, end-to-end encrypted PHP relay.

```
┌────────────────────────────────────────────────────────────────────────┐
│ Excalidraw Canvas (Shapes, Sticky Notes, Native Frames, Diagrams)      │
├────────────────────────────────────────────────────────────────────────┤
│ SceneBridge: Excalidraw Elements ⇄ Yjs CRDT Document                   │
│   • Elements Map (LWW per element)   • Z-Order Array                   │
│   • Tasks & Subtasks Map             • Collaborative Activity Audit    │
│   • Soundboard Clips & Triggers      • Comments & Dot Voting           │
├────────────────────────────────────────────────────────────────────────┤
│ Live Sync Relay (api/signal.php) │  E2E Encrypted Sub-300ms Polling    │
│ IndexedDB Storage                │  Offline-First Local Cache          │
│ GitHub Storage Adapter           │  AES-GCM Encrypted Blob Persistence │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🌟 Pre-Built Example Board (`boards/example.slate`)

Caulk includes a fully featured demo board committed directly in the repository at [`boards/example.slate`](boards/example.slate). It demonstrates the entire feature suite out-of-the-box:

```
┌──────────────────────────────────────┬──────────────────────────────────────┐
│  🚀 Architecture & Sync Lanes Frame  │  📋 Active Sprint 14 Tasks Frame    │
│  • React App ➔ Yjs CRDT ➔ Relay      │  • 6 Color-Coded Task Stickies       │
│  • 3 Zero-Knowledge Security Stickies│  • Assignees, Statuses & Hashtags    │
├──────────────────────────────────────┼──────────────────────────────────────┤
│  ⚡ Shortcuts & Embedded Logo Asset   │  💡 Next Up & Brainstorming Frame   │
│  • Embedded SVG Badge Graphic Asset  │  • 5 Idea Stickies with Dot Votes    │
│  • Soundboard Hotkey Cheat-Sheet     │  • Community Feedback Cards          │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

### Try the Example Board

1. **In the Web App**: Open board **`example`** (no password required; open by default).
2. **In your Terminal**:
   ```bash
   # Inspect full human-readable board dump (tasks, frames, stickies)
   npx caulk dump --board example

   # List tasks filtered by status
   npx caulk list-tasks --board example --status IN_PROGRESS
   npx caulk list-tasks --board example --status TODO
   ```

---

## ⚡ Quick Start

### Local Development

```bash
git clone https://github.com/nikoraasu/caulk.git
cd caulk
npm install
npm run dev
```

Open `http://localhost:5173`. Connect to your GitHub repository with a Personal Access Token (PAT) or OAuth.

---

## 🎯 Key Features & Capabilities

### 1. 🛡️ Zero-Knowledge Client-Side Encryption
- Encrypted with **AES-256-GCM** using keys derived via **PBKDF2 (600,000 iterations)**.
- **Open / Default Boards**: Automatically encrypted using deterministic repository-scoped keys (`caulk:owner/repo:path`). Collaborators with repository access join seamlessly without password prompts.
- **Password-Protected Boards**: Users can set custom passphrases. Plaintext never touches the relay server, IndexedDB, or GitHub unencrypted.

### 2. 📊 Jira-Grade Progress Hub (`T`)
- **Kanban Board**: Drag-and-drop task cards across `BACKLOG`, `TODO`, `IN_PROGRESS`, `REVIEW`, and `DONE` columns.
- **Gantt Timeline**: Real-time project schedule with calendar day snapping, milestone flags, and duration bars.
- **Sprints & Milestones**: Manage active and planned sprint cycles with progress metrics and deadlines.
- **Team & Roles**: Assignee workload analytics, GitHub avatar resolution, and custom project roles.

### 3. 🔊 Retro Whiteboard Soundboard (`1`–`9`)
- Built-in retro audio engine with **5 vintage sound packs**:
  - 🎮 **Steam VGUI** (Valve classic clicks & alerts)
  - ⚡ **Windows 95** (90s desktop chimes)
  - 🪟 **Windows XP** (Classic error, alert, and popup sounds)
  - 💎 **Frutiger Glacier** (Aero glass drops and chimes)
  - 🍎 **Mac OS 9** (Platinum system audio)
- **Audio Clipper**: Record from your microphone or upload audio files to visually trim clips.
- **Live Peer Broadcast**: Trigger soundboard clips that replicate instantly to all connected collaborators.

### 4. 🖼️ Native Miro-Style Frames (`F`)
- Group multiple sticky notes, shapes, and diagrams into named frames.
- Moving or resizing a frame automatically translates all child elements across the canvas.

### 5. 📜 Collaborative Activity Audit Log
- Built-in ring buffer tracking element creations, moves, deletions, and task status transitions.
- Filter by user or action with timestamped history records.

### 6. 🤖 Universal Headless CLI for External AI Agents (`npx caulk`)
- External AI assistants (**Antigravity**, **Claude Code**, **Cursor**, **Codex**) can inspect boards, create tickets, and update progress directly from the terminal or editor.
- Discovered automatically via [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md).

---

## 🛠️ CLI Commands for AI Agents & Terminal

```bash
# Optional: Set passphrase if the board is password protected
export CAULK_PASSPHRASE="your-board-passphrase"

# Inspect board contents (human-readable or JSON)
npx caulk dump --board example
npx caulk dump --board example --json

# List tasks on the board
npx caulk list-tasks --board example
npx caulk list-tasks --board example --status TODO

# Add a Jira-grade task with subtasks & linked canvas sticky note
npx caulk add-task \
  --board example \
  --title "Implement OAuth token rotation" \
  --status TODO \
  --priority HIGH \
  --assignee "nikoraasu" \
  --subtasks "Rotate JWT on expiry,Persist refresh token,Write tests" \
  --sticky

# Update a task status
npx caulk update-task --board example --task "CLK-1" --status DONE

# Drop a sticky note onto the canvas
npx caulk add-sticky --board example --text "Verified tests pass 100%" --color green
```

---

## 🌐 Self-Hosting

Caulk compiles to a static single-page application with two lightweight PHP scripts ([`api/signal.php`](public/api/signal.php) and [`api/auth.php`](public/api/auth.php)) that require **no MySQL database**, no Node.js runtime, and no background daemons.

### Option 1: Shared Hosting (cPanel, SeoHost, DirectAdmin)
1. Run `npm run pack` or download the pre-built `caulk-seohost.zip` (~3.2 MB).
2. Upload and extract into your web root (e.g. `public_html/` or subdomain folder).
3. Copy `api/config.sample.php` to `api/config.php` and fill in your GitHub App credentials.
4. Ensure `api/` is writable (`chmod 755 api`) so the relay can store ephemeral ciphertext.

### Option 2: Nginx + PHP-FPM
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

### GitHub App Configuration (`api/config.php`)
1. Create a GitHub App at **Settings → Developer settings → GitHub Apps → New GitHub App**.
2. **Homepage, Callback & Setup URL**: `https://caulk.yourdomain.com/`
3. **Permissions**:
   - `Contents`: Read & write (board data and assets)
   - `Metadata`: Read-only (list repos)
   - `Issues`: Read & write (sync issue cards on canvas)
4. Copy credentials to `api/config.php`:
```php
define('GITHUB_CLIENT_ID', 'your-client-id');
define('GITHUB_CLIENT_SECRET', 'your-client-secret');
define('GITHUB_APP_SLUG', 'your-app-slug');
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action | Description |
|---|---|---|
| `V` or `1` | **Select** | Pointer selection mode |
| `R` or `2` | **Rectangle** | Draw shapes |
| `F` | **Frame** | Miro-style grouping frame (drags child elements together) |
| `S` | **Sticky Note** | Drop a quick sticky note |
| `T` | **Tasks Hub** | Open Jira-grade progress manager (Kanban, Gantt, Calendar) |
| `C` | **Comment** | Drop a pinned collaborative comment thread |
| `1` – `9` | **Soundboard** | Broadcast retro sound clips to live peers |
| `Alt + Click` | **Radar Ping** | Emit an attention ping for all collaborators |
| `Space + Drag`| **Pan** | Glide around the infinite canvas |

---

## 🧪 Developer Commands & Testing

```bash
npm run dev               # Start Vite dev server
npm run typecheck         # TypeScript typecheck
npm test                  # Run full automated test suite (7 suites)
npm run build:cli         # Build standalone headless CLI (bin/caulk.mjs)
npm run build             # Build production client bundle
npm run pack              # Build and package caulk-seohost.zip for deployment
```

---

## 📄 License

Caulk is free and open-source software licensed under the **GNU General Public License v3.0** (GPL-3.0-or-later). See [`LICENSE`](LICENSE) for details.
