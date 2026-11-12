# Caulk

> A private, collaborative whiteboard and canvas — sticky notes, native frames, Jira-grade tasks, soundboard, and diagrams — that lives directly in **your own GitHub repository**, styled with an authentic **Steam (Valve VGUI)** retro industrial aesthetic.

Caulk gives your team the power of Miro and Mural with **zero external servers**, **zero proprietary databases**, **zero tracking**, and **100% data ownership**. Everything is encrypted client-side with AES-256-GCM and stored in your private GitHub repository as version-controlled commits. Real-time collaboration operates peer-to-peer through an end-to-end encrypted HTTP relay with sub-second cursor and canvas synchronization.

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

## Table of Contents

- [Features Overview](#features-overview)
- [How to Use Caulk](#how-to-use-caulk)
  - [Connecting to a Board](#connecting-to-a-board)
  - [Whiteboard Canvas & Sticky Notes](#whiteboard-canvas--sticky-notes)
  - [Miro-Style Native Frames](#miro-style-native-frames)
  - [Jira-Grade Progress Manager & Tasks Hub](#jira-grade-progress-manager--tasks-hub)
  - [Collaborative Activity Audit Log & History](#collaborative-activity-audit-log--history)
  - [Soundboard & Audio Clipper](#soundboard--audio-clipper)
  - [Workshop Facilitation: Comments, Voting & Summon](#workshop-facilitation-comments-voting--summon)
  - [Retro UI Themes & Sound Packs](#retro-ui-themes--sound-packs)
- [How to Self-Host](#how-to-self-host)
  - [Prerequisites](#prerequisites)
  - [Option 1: Shared Hosting / LAMP (cPanel, SeoHost, DirectAdmin)](#option-1-shared-hosting--lamp-cpanel-seohost-directadmin)
  - [Option 2: Nginx + PHP-FPM VPS](#option-2-nginx--php-fpm-vps)
  - [Option 3: Local Development](#option-3-local-development)
  - [GitHub App & Authentication Setup](#github-app--authentication-setup)
- [Security & Cryptography Model](#security--cryptography-model)
- [Keyboard Shortcuts Reference](#keyboard-shortcuts-reference)
- [Developer Commands & Testing](#developer-commands--testing)

---

## Features Overview

- 🎨 **Full Infinite Canvas**: Sticky notes with auto-contrasting text, freehand sketching, geometric shapes, dynamic arrows, and Mermaid chart imports.
- 🖼️ **Native Miro-Style Frames (`[F]`)**: Enclose elements inside native frames. Moving or nudging a frame automatically moves all bound stickies, cards, and diagrams together.
- 📋 **Project Progress Manager**: Jira-grade CRDT task engine with Kanban boards, hierarchical tree list views, Gantt timelines, calendar grids, analytics dashboards, subtask trees, and GitHub issues integration.
- 👥 **Team & Collaborators Hub**: Automatic GitHub repository collaborator discovery, custom member roles, avatar resolution, and direct assignee dropdowns on task creation.
- 📜 **Collaborative Activity Audit Log**: 300-event encrypted CRDT ring buffer logging all peer changes with debounced text edits, change filters, and a 1-click **🎯 Jump to item** canvas locator.
- 🔊 **Retro Soundboard & Waveform Audio Clipper**: Procedural 8-bit/retro synthesizers, microphone voice recording, file upload, waveform audio trimming, keyboard hotkeys `[1]`–`[9]`, and synchronized live peer sound broadcasts.
- 💬 **Collaborative Comments & Sticky Dot Voting**: Pin comment threads to any canvas object with `@mentions`, emoji reactions, and resolve toggles. Run timed dot-voting sessions with exportable results.
- 📣 **Presenter Summon & Radar Pings**: "Bring everyone to me" camera summon and `Alt + Click` pulsing radar pings to guide attention during workshops.
- 🔒 **Client-Side Zero-Knowledge Encryption**: PBKDF2 (600,000 iterations) + AES-256-GCM. GitHub and the relay server only ever see opaque ciphertext.
- 💾 **Encrypted Content-Addressed Assets**: High-resolution photos and video frames are stored as encrypted blobs in `.assets/` with lazy background streaming and Git Blobs API fallback for >1MB files.
- 🕹️ **Retro Valve VGUI Aesthetic**: Authentic industrial UI with customizable themes (Half-Life/Steam VGUI, Windows XP, Frutiger Aero, Mac OS 9, Windows 95) and matching sound packs.

---

## How to Use Caulk

### Connecting to a Board

When you open Caulk for the first time:
1. **Log In**: Click **Log in with GitHub** (via GitHub App or OAuth) or paste a **Personal Access Token (PAT)** with repository permissions.
2. **Select Repository & Board**: Choose a repository where your boards will be saved (e.g. `your-username/my-boards`).
3. **Board Password / Encryption Passphrase**:
   - Every board is encrypted with a passphrase.
   - Enter your passphrase to unlock or create the board.
   - Anyone opening the same repository and board name with the same passphrase connects to the same collaborative session.
   - *Tip:* Your session and credentials are saved locally in `sessionStorage` so refreshing the tab won't desync your session.

---

### Whiteboard Canvas & Sticky Notes

- **Sticky Notes**: Click the sticky note tool or press `S`. Sticky notes default to a retro sharp industrial look with zero sloppiness.
- **Smart Stacking**: Successive stickies automatically cascade neatly so notes don't stack directly on top of each other.
- **Color Swatches**: Choose from built-in Valve VGUI quick swatches or use the color wheel.
- **Tags & Labels**: Add tags (`#frontend`, `bug`, `urgent`) directly to stickies. Click **🏷️ Tags** in the top bar to toggle label overlays on or off, or hover over a sticky to reveal its tags.
- **Clustering**: Group related stickies by tag or color into structured grids with a single click.

---

### Miro-Style Native Frames

Caulk features native Excalidraw frames (`type: "frame"`) enhanced with retro styling and child binding:
- **Create a Frame**: Press `F` or select **Frame (F)** from the toolbar. Draw a rectangle around the items you want to group.
- **Child Binding**: Any sticky note, GitHub issue card, image, shape, or text placed inside the boundary of a frame is automatically bound to that frame via `frameId`.
- **Drag & Nudge Together**: Moving a frame with your mouse or nudging it with keyboard arrow keys moves all contained child objects simultaneously.
- **Custom Frame Styling**: Set custom background fill colors, border stroke widths, solid/dashed/dotted strokes, and corner roundness (0px sharp, 4px, 8px, 12px, 16px, 24px, 32px, 44px).

---

### Jira-Grade Progress Manager & Tasks Hub

Open the **Tasks Hub** by clicking the **Tasks** button in the top navigation or pressing `T`:

1. **Kanban Board**: Drag-and-drop task cards between status columns (`Backlog`, `To Do`, `In Progress`, `Review`, `Done`). Expand subtask drawers directly on cards.
2. **Tree List View**: Hierarchical list view sorted by priority, status, deadline, or title.
3. **Gantt Timeline**: Dynamic timeline chart with time scales, progress markers, and start/deadline schedules.
4. **Calendar View**: Monthly calendar grid displaying task deadlines, milestones, and deliverables.
5. **Analytics Dashboard**: Real-time project charts showing completion percentage, priority breakdown, overdue alerts, and workload distribution.
6. **Subtasks & Tree Connectors**: Add subtasks to any parent task with interactive checkboxes and retro canvas branch connectors (`├──`, `└──`). Click **🌿 On Board** to generate linked visual cards on the whiteboard canvas.
7. **Team & Collaborators Matrix**:
   - Click **🔄 Sync GitHub Collaborators** to automatically pull all repository collaborators and organization members into your board.
   - Assign custom roles (`Tech Lead`, `Backend Dev`, `Designer`, `QA`).
   - When creating or editing tasks, use the **👤 Assignee** dropdown to assign tasks to teammates with live GitHub avatar badges.

---

### Collaborative Activity Audit Log & History

Never lose track of who changed what on the board:
- **Open History**: Click **History** in the top bar or status bar.
- **Dual Tabs**:
  - `📋 Activity`: Live, collaborative chronological stream of all actions performed by you and your peers.
  - `💾 Snapshots`: Local and remote timestamped board backup snapshots.
- **Semantic Change Classification**: The engine automatically classifies actions into human-readable events:
  - *"nikoraasu edited text on Sticky Note: 'API Refactor'"* (with a 1.6-second keystroke debounce to eliminate typing spam).
  - *"alex created Task Card: 'Auth flow'"*.
  - *"sarah moved 4 items inside Frame: 'Sprint 3'"*.
  - *"nikoraasu changed status of task 'Fix auth bug' to DONE"*.
- **1-Click Camera Locator**: Click the **🎯 Jump to item** button next to any activity entry to instantly glide the camera across the whiteboard canvas directly to the target element.
- **Filter & Search**: Instant real-time text search and filter by author or action type (Created, Edited, Deleted, Tasks, Restored).

---

### Soundboard & Audio Clipper

Bring LAN party energy to your team meetings:
- **Open Soundboard**: Click **Soundboard** in the top navigation or press the assigned hotkey.
- **8 Built-in Synthesizers**: Click to play retro procedural audio clips:
  - 📢 *Airhorn*, 🥁 *Ba-Dum-Tss*, ⬆️ *Level Up*, 🏆 *Victory*, 🦆 *Quack*, 🔔 *Ding*, 👏 *Applause*, 💥 *Bruh / Fail*.
- **Live Peer Broadcast**: Triggering a soundboard clip plays it synchronously for all active collaborators currently in the room.
- **Audio Clipper & Voice Recording**:
  - Click **+ Add Sound** to upload an `.mp3`, `.wav`, or `.ogg` file, or click **Record Mic** to record high-fidelity voice clips straight from your browser.
  - Interactive **Waveform Visualizer**: Drag start and end handles to trim audio clips to the exact millisecond.
  - Assign custom emoji icons, button colors, and hotkeys (`[1]` through `[9]`).
- **Sound Spam Protection**: Caulk includes a smart hover throttle so navigating menus or moving the mouse across UI buttons triggers a clean sound without stuttering or audio feedback spam.

---

### Workshop Facilitation: Comments, Voting & Summon

- **Sticky Reactions & Dot Voting**: Hover over any sticky note to add emoji reactions. Start a formal dot-voting session with a set number of votes per participant (with optional anonymous voting). View final tallies and export results directly to Markdown.
- **Comment Threads (`[C]`)**: Press `C` and click any element to pin a comment thread. Tag teammates with `@mentions`, post threaded replies, and mark threads as resolved.
- **Bring Everyone to Me**: In the presence bar, click **Bring everyone to me** to smoothly summon all active peers' viewports to your current coordinates.
- **Radar Attention Pings**: Hold `Alt` and click anywhere on the canvas to emit a pulsing radar ring that directs teammates' eyes to that spot.

---

### Retro UI Themes & Sound Packs

Click **Themes** in the top menu to customize your workspace:
- **Visual Themes**: Steam Valve VGUI Dark, Windows XP Classic, Frutiger Aero Glass, Mac OS 9 Platinum, Windows 95 Retro Gray, Cyberpunk Amber.
- **Sound Packs**: Custom retro audio kits providing authentic mechanical clicks, subtle hover feedback, ping chimes, and dialog beeps.
- **Board Wallpaper**: Upload custom board background patterns with options for seamless tiling or full cover.

---

## How to Self-Host

Caulk is designed to be completely self-hosted with minimal requirements:
- **Frontend**: A static Single Page Application (HTML, CSS, JS, SVG assets).
- **Relay Backend**: Two lightweight PHP scripts (`api/signal.php` and `api/auth.php`) requiring **zero MySQL database**, zero background daemons, and zero Node.js server.

### Prerequisites

- Any web server running **PHP 8.0 or newer** (Apache, Nginx, LiteSpeed, Caddy, or standard shared cPanel/DirectAdmin hosting).
- Write permissions for the PHP process on the `public/api/` directory (to store ephemeral encrypted relay packets in `api/_relay/`).

---

### Option 1: Shared Hosting / LAMP (cPanel, SeoHost, DirectAdmin)

This is the fastest and easiest way to deploy Caulk on shared hosting (e.g. `caulk.yourdomain.com`):

1. **Build the production package**:
   ```bash
   git clone https://github.com/nikoraasu/caulk.git
   cd caulk
   npm install
   npm run pack
   ```
   This generates a clean, self-contained deployment archive: [`caulk-seohost.zip`](file:///home/nikolas/miro-alt/caulk-seohost.zip) (~3.1 MB).

2. **Upload & Extract**:
   - In your hosting control panel (cPanel, DirectAdmin, Plesk, etc.), open the **File Manager**.
   - Navigate to your domain or subdomain document root (e.g., `public_html/caulk/`).
   - Upload `caulk-seohost.zip` and extract its contents directly into the folder.

3. **Configure GitHub Authentication**:
   - In the extracted files, navigate to `api/`.
   - Copy `config.sample.php` to `config.php`:
     ```bash
     cp api/config.sample.php api/config.php
     ```
   - Edit `api/config.php` and enter your GitHub App or OAuth credentials (see [GitHub App Setup](#github-app--authentication-setup) below).

4. **Verify Permissions**:
   - Ensure the `api/` directory has write permissions (`chmod 755 api`).
   - Test the relay endpoint in your browser:
     `https://caulk.yourdomain.com/api/signal.php?action=poll&room=test`
   - It should return: `{"messages":[],"last":0}`.

---

### Option 2: Nginx + PHP-FPM VPS

If hosting on an Ubuntu/Debian VPS with Nginx and PHP-FPM:

1. **Clone and Build**:
   ```bash
   cd /var/www
   git clone https://github.com/nikoraasu/caulk.git caulk
   cd caulk
   npm install
   npm run build
   ```

2. **Set Directory Permissions**:
   ```bash
   chown -R www-data:www-data /var/www/caulk/dist
   chmod -R 755 /var/www/caulk/dist
   chmod -R 775 /var/www/caulk/dist/api
   cp /var/www/caulk/dist/api/config.sample.php /var/www/caulk/dist/api/config.php
   ```

3. **Nginx Server Configuration**:
   Create `/etc/nginx/sites-available/caulk.conf`:

   ```nginx
   server {
       listen 80;
       listen 443 ssl http2;
       server_name caulk.yourdomain.com;

       root /var/www/caulk/dist;
       index index.html;

       # SSL certificates (use Certbot / Let's Encrypt)
       # ssl_certificate /etc/letsencrypt/live/caulk.yourdomain.com/fullchain.pem;
       # ssl_certificate_key /etc/letsencrypt/live/caulk.yourdomain.com/privkey.pem;

       # Static frontend routing (Single Page App)
       location / {
           try_files $uri $uri/ /index.html;
       }

       # Pass PHP relay requests to PHP-FPM
       location ~ \.php$ {
           include snippets/fastcgi-php.conf;
           fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
           fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
           include fastcgi_params;
       }

       # Deny access to relay storage and hidden files
       location ^~ /api/_relay/ {
           deny all;
       }
       location ~ /\. {
           deny all;
       }
   }
   ```

4. **Enable & Reload**:
   ```bash
   ln -s /etc/nginx/sites-available/caulk.conf /etc/nginx/sites-enabled/
   nginx -t
   systemctl reload nginx
   ```

---

### Option 3: Local Development

To run Caulk locally on your workstation:

```bash
git clone https://github.com/nikoraasu/caulk.git
cd caulk
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

> [!NOTE]
> During local Vite development, the frontend runs on port 5173. For persistent storage, you can connect directly to GitHub with a Personal Access Token (PAT). For full live relay testing locally, point Vite's proxy or an Apache/Nginx vhost to handle the `api/*.php` scripts.

---

### GitHub App & Authentication Setup

Caulk supports three login methods:

| Method | Best For | Features |
|---|---|---|
| **GitHub App (Recommended)** | Teams & Organizations | Select specific repositories, automatic token refreshing, no manual token entry |
| **Classic OAuth App** | General installations | Standard user OAuth flow |
| **Personal Access Token (PAT)** | Single developers / quick tests | Zero setup needed on the server |

#### Setting up a GitHub App:
1. On GitHub, navigate to **Settings** → **Developer settings** → **GitHub Apps** → **New GitHub App**.
2. **App Name**: `Caulk - Your Team`
3. **Homepage URL**: `https://caulk.yourdomain.com/`
4. **Callback URL**: `https://caulk.yourdomain.com/`
   - Check: `[x] Request user authorization (OAuth) during installation`
5. **Setup URL**: `https://caulk.yourdomain.com/`
   - Check: `[x] Redirect on update`
6. **Webhook**: Uncheck `[ ] Active` (no webhook server needed).
7. **Repository Permissions**:
   - `Contents`: **Read and write** (to commit and read board files & assets)
   - `Metadata`: **Read-only** (to list accessible repositories)
   - `Issues`: **Read and write** (to sync GitHub Issue cards on the whiteboard)
8. **Where can this GitHub App be installed**: Select **Any account**.
9. Click **Create GitHub App**.
10. On the General page, copy the **Client ID** and generate a **Client Secret**.
11. Update your `api/config.php` file:
    ```php
    define('GITHUB_CLIENT_ID', 'Iv1.xxxxxxxxxxxx');
    define('GITHUB_CLIENT_SECRET', 'xxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    define('GITHUB_APP_SLUG', 'your-app-slug');
    ```

---

## Security & Cryptography Model

Caulk uses an end-to-end zero-knowledge security architecture:

1. **Passphrase Derivation**:
   - Passphrases never leave the client browser.
   - Keys are derived using **PBKDF2-HMAC-SHA-256** with 600,000 rounds and a cryptographic random salt per board.
2. **Document Encryption**:
   - Yjs CRDT updates and binary scene files are encrypted using **AES-256-GCM** with a unique Initialization Vector (IV) per save.
   - Encrypted files are saved to GitHub under `boards/<name>.slate`.
3. **Relay Privacy**:
   - Real-time signaling through `api/signal.php` only transmits AES-GCM encrypted binary ciphertext payloads.
   - Even if the PHP relay server is compromised, attackers only see high-entropy random bytes.
4. **Storage Formats**:
   - High-resolution board media are stored in `.assets/<hash>` as encrypted content-addressed blocks.
   - Board backups and snapshots are encrypted under `snapshots/<timestamp>.slate`.

---

## Keyboard Shortcuts Reference

| Shortcut | Action | Description |
|---|---|---|
| `V` or `1` | **Select Tool** | Standard pointer selection mode |
| `R` or `2` | **Rectangle** | Draw rectangles and shape boxes |
| `F` | **Frame Tool** | Create native Miro-style grouping frames |
| `S` | **Sticky Note** | Drop a quick sticky note with auto-contrasting text |
| `T` | **Tasks Hub** | Open full Jira-grade progress manager & Kanban board |
| `C` | **Comment Pin** | Click any canvas object to start a collaborative thread |
| `1` – `9` | **Soundboard** | Play custom-mapped soundboard clips to the room |
| `Alt + Click` | **Radar Ping** | Emit a visible attention pulse for all peers |
| `Space + Drag` | **Canvas Pan** | Glide smoothly around the infinite whiteboard |
| `Ctrl / Cmd + Z` | **Undo** | Revert local canvas edits |
| `Esc` | **Cancel / Close** | Close modals, release selection, or stop following peer |

---

## Developer Commands & Testing

Caulk comes with a comprehensive suite of unit and integration tests simulating live WebRTC/polling relays, GitHub API rate limits, CRDT merges, and cryptographic validation:

```bash
# Start Vite development server
npm run dev

# Run TypeScript compilation check
npm run typecheck

# Run full automated test suite
npm test

# Run individual test modules:
npm run test:tasks       # Task store, CRDT subtasks, and automation checks
npm run test:activity    # Activity audit log ring buffer & semantic debounce
npm run test:soundboard  # Audio clip storage, synthesis, and broadcast sync
npm run test:sync        # Encrypted GitHub adapter, conflict resolution & assets
npm run test:live        # In-process multi-peer live relay & cursor awareness

# Build production bundle
npm run build

# Build and package deployment zip for shared hosting
npm run pack
```

---

## License

Caulk is free and open-source software licensed under the **GNU General Public License v3.0** (GPL-3.0-or-later). See [`LICENSE`](LICENSE) for the full license text.
