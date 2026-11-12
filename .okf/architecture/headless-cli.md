---
type: Architecture
title: Headless Board CLI & Agent Bridge
description: Headless CLI and CRDT mutator allowing autonomous AI agents and scripts to manipulate Caulk boards directly.
tags: [cli, agents, crdt, headless, automation]
resource: /src/cli/caulk.ts
generated: { by: antigravity/gemini, at: "2026-11-12T22:42:00Z" }
---

# Overview

The Caulk Headless Board CLI (`src/cli/caulk.ts`, compiled to `bin/caulk.mjs` and runnable via `npx caulk`) provides a direct bridge for external AI agents (Antigravity, Claude Code, Cursor, Codex, OpenCode, Aider) and CI/CD pipelines to inspect and mutate Caulk whiteboards stored in Git repositories.

Because Caulk boards are saved as `.slate` files containing encrypted Yjs CRDT update binary envelopes, the CLI operates directly on the binary state without requiring a browser or headless browser runtime (like Puppeteer/Playwright).

# Architecture & Mechanics

1. **Envelope Decryption**:
   - Reads `boards/<name>.slate` (or specified file path).
   - Validates envelope header (`parseEnvelope`).
   - If encrypted, derives the AES-256-GCM key from `--passphrase` or `CAULK_PASSPHRASE` using PBKDF2 (100,000 iterations). If unencrypted, parses raw Yjs update bytes.
2. **CRDT Application**:
   - Instantiates a clean `Y.Doc`.
   - Calls `Y.applyUpdate(doc, updateBytes)` to reconstitute state.
3. **Mutation**:
   - Performs requested operation on `doc.getMap("tasks")`, `doc.getMap("settings")`, or Excalidraw element arrays.
   - Computes diff using `Y.encodeStateAsUpdate(doc)`.
4. **Re-encryption & Atomic Write**:
   - Re-encrypts with AES-256-GCM (if encrypted) using a fresh random 12-byte IV and salt.
   - Atomically overwrites the `.slate` file on disk, ready for `git commit`.

# Headless CLI Commands

- `npx caulk dump --board <name> [--json]`: Outputs board overview including elements count, stickies, task cards, frames, and active theme details.
- `npx caulk list-tasks --board <name> [--status <STATUS>]`: Lists tasks with ID, title, status, priority, and assignees.
- `npx caulk add-task --board <name> --title <str> [--status <sfc>] [--priority <lvl>] [--assignee <user>] [--subtasks <csv>] [--sticky]`: Creates a Jira-grade task entity in the CRDT map. When `--sticky` is passed, also generates a visual sticky note card on the canvas linked to the task.
- `npx caulk update-task --board <name> --task <id-or-title> --status <STATUS>`: Updates task status (`BACKLOG`, `TODO`, `IN_PROGRESS`, `REVIEW`, `DONE`) by task ID or title.
- `npx caulk add-sticky --board <name> --text <str> [--color <col>] [--frame <id>]`: Places a sticky note on the canvas.
- `npx caulk get-theme --board <name>`: Displays current theme preset, style mode, and custom specifications.
- `npx caulk set-theme --board <name> [--preset <id>] [--theme-file <path>]`: Switches board theme to a built-in preset or imports a custom theme JSON file.

# Agent Integration

Documented in `AGENTS.md` at the repository root, which serves as a prompt rule for autonomous coding agents working inside the repository.
