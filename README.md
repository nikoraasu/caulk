# Caulk

> A private, collaborative whiteboard and canvas — sticky notes, native frames, Jira-grade tasks, soundboard, and diagrams — that lives directly in **your own GitHub repository**, styled with an authentic **Steam (Valve VGUI)** retro aesthetic.

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

## Quick Start

### Local Development

```bash
git clone https://github.com/nikoraasu/caulk.git
cd caulk
npm install
npm run dev
```
Open `http://localhost:5173`. Connect to your GitHub repository with a Personal Access Token (PAT) or OAuth.

---

## Self-Hosting

Caulk compiles to a static single-page app with two lightweight PHP scripts (`api/signal.php` and `api/auth.php`) that require **no MySQL database**, no background daemons, and no Node.js server.

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
4. Copy Client ID and Client Secret to `api/config.php`:
```php
define('GITHUB_CLIENT_ID', 'your-client-id');
define('GITHUB_CLIENT_SECRET', 'your-client-secret');
define('GITHUB_APP_SLUG', 'your-app-slug');
```

---

## Working with Boards

### 1. In the Browser
- **Login**: Click **Log in with GitHub** or paste a GitHub PAT.
- **Select / Create Board**: Pick a repository and board name.
- **Passphrase**: Choose a passphrase. The board is encrypted client-side using PBKDF2 (600,000 iterations) + AES-256-GCM before ever leaving your browser. Anyone with the same repo and passphrase joins the same live canvas.

### 2. External AI Agents & CLI Tool
Caulk includes a headless CLI (`bin/caulk.mjs`) so coding agents (**Claude Code**, **Cursor**, **Antigravity**, terminal scripts, or GitHub Actions) can read and write directly to `.slate` boards in your repository:

```bash
# Set your board passphrase
export CAULK_PASSPHRASE="your-board-passphrase"

# Inspect board contents (JSON or Markdown)
npx caulk dump --board sprint-1 --json

# List current tasks
npx caulk list-tasks --board sprint-1

# Add a task with subtasks & linked canvas sticky note
npx caulk add-task \
  --board sprint-1 \
  --title "Implement Auth Middleware" \
  --status "IN_PROGRESS" \
  --priority "HIGH" \
  --assignee "nikoraasu" \
  --subtasks "Add JWT validation,Add rate limiter,Write tests" \
  --sticky

# Update a task status
npx caulk update-task --board sprint-1 --task "CLK-1" --status "DONE"

# Drop a sticky note onto the canvas
npx caulk add-sticky --board sprint-1 --text "Verified tests passing 100%" --color "green"
```

---

## AI Agent Integration

Caulk boards are designed to be inspected and modified by any AI coding assistant (**Antigravity**, **Claude Code**, **Cursor**, **Codex**, **Aider**, etc.) directly from your terminal or editor workspace.
No API keys needed in the browser. External agents use `npx caulk` to inspect sprint boards, pick up tasks, create tickets, and update progress in real time.

See [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) for full instructions and command recipes.

---

## Keyboard Shortcuts

| Shortcut | Action | Description |
|---|---|---|
| `V` or `1` | **Select** | Pointer selection mode |
| `R` or `2` | **Rectangle** | Draw shapes |
| `F` | **Frame** | Miro-style grouping frame (drags all child elements together) |
| `S` | **Sticky Note** | Drop a quick sticky note |
| `T` | **Tasks Hub** | Open Jira-grade progress manager (Kanban, Gantt, Calendar) |
| `C` | **Comment** | Drop a pinned collaborative comment thread |
| `1` – `9` | **Soundboard** | Broadcast custom retro sound clips to live peers |
| `Alt + Click` | **Radar Ping** | Emit an attention ping for all collaborators |
| `Space + Drag`| **Pan** | Glide around the infinite canvas |

---

## Developer Commands & Testing

```bash
npm run dev               # Start Vite dev server
npm run typecheck         # TypeScript typecheck
npm test                  # Run full automated test suite (all 7 suites)
npm run build:cli         # Build standalone headless CLI (bin/caulk.mjs)
npm run build             # Build production client bundle
npm run pack              # Build and package caulk-seohost.zip for deployment
```

---

## License

Caulk is free and open-source software licensed under the **GNU General Public License v3.0** (GPL-3.0-or-later). See [`LICENSE`](LICENSE) for details.
