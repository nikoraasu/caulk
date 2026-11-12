# AGENTS.md — Caulk Autonomous AI Agent Integration Guide

Welcome AI Agent (Antigravity, Claude Code, Cursor, Codex, OpenCode, Aider)!

Caulk boards are Git-backed, CRDT-synchronized collaborative whiteboards stored as `.slate` files under `boards/` (or wherever your project configures them).
You have a full headless CLI available directly via `npx caulk` (or `node bin/caulk.mjs`) to inspect, create, update, and manage tasks and whiteboard elements autonomously.

---

## ⚡ Quick Start for AI Agents

Whenever the user asks you to:
- *"Check the sprint board"* or *"What tasks are on the board?"*
- *"Implement task X from the board"*
- *"Add tasks for the new feature on the board"*
- *"Mark task X as DONE after fixing it"*
- *"Put a sticky note on the canvas"*

You can execute these actions immediately via shell commands!

### Finding Boards
Boards are stored in `boards/*.slate`:
```bash
ls boards/
```
If a board name is `main`, the file path is `boards/main.slate`. You can pass `--board main` or `--board boards/main.slate`.

---

## 🛠️ CLI Commands for AI Agents

### 1. Inspect Board State & Tasks
To read the full context (elements, sticky notes, task cards, frames):
```bash
# Human-readable summary:
npx caulk dump --board main

# Machine-readable JSON summary:
npx caulk dump --board main --json

# List only tasks:
npx caulk list-tasks --board main
npx caulk list-tasks --board main --status TODO
```

### 2. Create Tasks (Kanban / Backlog)
When breaking down a feature, planning an architecture, or logging bugs:
```bash
npx caulk add-task \
  --board main \
  --title "Implement user session refresh" \
  --status TODO \
  --priority HIGH \
  --assignee "nikoraasu" \
  --subtasks "Rotate JWT on expiry, Persist refresh token, Handle 401 response" \
  --sticky
```
- `--status`: `BACKLOG` | `TODO` | `IN_PROGRESS` | `REVIEW` | `DONE` (default: `TODO`)
- `--priority`: `LOW` | `MEDIUM` | `HIGH` | `CRITICAL` (default: `MEDIUM`)
- `--assignee`: user handle or name
- `--subtasks`: comma-separated checklist
- `--sticky`: also automatically creates a visual sticky note card on the whiteboard canvas linked to this task

### 3. Advance / Update Task Status
When you finish implementing a feature, fixing a bug, or starting work:
```bash
# Mark as in progress:
npx caulk update-task --board main --task "Implement user session refresh" --status IN_PROGRESS

# Mark as done:
npx caulk update-task --board main --task "Implement user session refresh" --status DONE
```
*(You can pass either the task ID or the exact task title)*.

### 4. Place Sticky Notes on Whiteboard Canvas
To leave notes, architectural decisions, post-mortems, or warnings on the whiteboard:
```bash
npx caulk add-sticky \
  --board main \
  --text "Architecture Decision: Using AES-256-GCM + PBKDF2 for client-side encryption" \
  --color green
```
- `--color`: `yellow` | `green` | `blue` | `purple` | `pink` | `orange`

### 5. Inspect & Set Board Theme
```bash
# Get active theme:
npx caulk get-theme --board main

# Switch theme:
npx caulk set-theme --board main --preset frutiger-aero
npx caulk set-theme --board main --preset windows-xp
```

---

## 🔒 Passphrases & Encryption
Caulk boards may be encrypted with PBKDF2 + AES-256-GCM.
- If the board is password protected, either provide `--passphrase "your-password"` or set the environment variable:
  ```bash
  export CAULK_PASSPHRASE="your-password"
  ```
- If the board is open/unprotected (default), no passphrase is required.

---

## 💡 Recommended Agent Workflow

1. **Before starting a task**:
   Run `npx caulk list-tasks --board main` to find pending tasks.
   Pick your assigned task and mark it `IN_PROGRESS`:
   ```bash
   npx caulk update-task --board main --task "<task-title>" --status IN_PROGRESS
   ```
2. **After finishing and verifying code**:
   Mark it `DONE`:
   ```bash
   npx caulk update-task --board main --task "<task-title>" --status DONE
   ```
   Add a quick summary sticky if appropriate:
   ```bash
   npx caulk add-sticky --board main --text "Verified tests pass. Completed task <task-title>" --color green
   ```
3. **Commit your changes**:
   Both code files and `boards/<board>.slate` will be modified. Commit both together so the board state stays in sync with git history.
