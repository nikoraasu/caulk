#!/usr/bin/env node
/**
 * Caulk Headless Board CLI & External AI Agent Tool.
 *
 * Allows external AI agents (Claude Code, Cursor, terminal tools, CI/CD actions)
 * to inspect, add tasks, update status, and manage whiteboards stored in a Git repo.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import * as Y from "yjs";
import {
  deriveKey,
  encryptEnvelope,
  decryptEnvelope,
  parseEnvelope,
  PBKDF2_ITERATIONS,
} from "../crypto/envelope";
import { base64ToBytes, randomBytes } from "../lib/bytes";
import { createTask, updateTask, createSubtask } from "../features/tasks/store";
import type { TaskRecord } from "../features/tasks/types";
import { normalizeStatus, normalizePriority } from "../ai/types";

export type CLIOptions = {
  command?: string;
  board?: string;
  file?: string;
  dir?: string;
  passphrase?: string;
  title?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  description?: string;
  subtasks?: string;
  labels?: string;
  sticky?: boolean;
  color?: string;
  text?: string;
  frame?: string;
  task?: string;
  json?: boolean;
};

export function parseArgs(args: string[]): CLIOptions {
  const opts: CLIOptions = {};
  let i = 0;

  if (args.length > 0 && !args[0].startsWith("-")) {
    opts.command = args[0];
    i = 1;
  }

  while (i < args.length) {
    const arg = args[i];
    if (arg === "--board" || arg === "-b") {
      opts.board = args[++i];
    } else if (arg === "--file" || arg === "-f") {
      opts.file = args[++i];
    } else if (arg === "--dir" || arg === "-d") {
      opts.dir = args[++i];
    } else if (arg === "--passphrase" || arg === "-p") {
      opts.passphrase = args[++i];
    } else if (arg === "--title" || arg === "-t") {
      opts.title = args[++i];
    } else if (arg === "--status" || arg === "-s") {
      opts.status = args[++i];
    } else if (arg === "--priority") {
      opts.priority = args[++i];
    } else if (arg === "--assignee" || arg === "-a") {
      opts.assignee = args[++i];
    } else if (arg === "--description") {
      opts.description = args[++i];
    } else if (arg === "--subtasks") {
      opts.subtasks = args[++i];
    } else if (arg === "--labels" || arg === "-l") {
      opts.labels = args[++i];
    } else if (arg === "--text") {
      opts.text = args[++i];
    } else if (arg === "--color" || arg === "-c") {
      opts.color = args[++i];
    } else if (arg === "--frame") {
      opts.frame = args[++i];
    } else if (arg === "--task") {
      opts.task = args[++i];
    } else if (arg === "--sticky") {
      opts.sticky = true;
    } else if (arg === "--json") {
      opts.json = true;
    }
    i++;
  }

  return opts;
}

export function resolveBoardPath(opts: CLIOptions): string {
  if (opts.file) return resolve(opts.file);
  const dir = resolve(opts.dir || "./boards");
  const boardName = opts.board || "default";
  const filename = boardName.endsWith(".slate") ? boardName : `${boardName}.slate`;
  return join(dir, filename);
}

export function getPassphrase(opts: CLIOptions): string {
  if (opts.passphrase && opts.passphrase.trim()) return opts.passphrase.trim();
  if (process.env.CAULK_PASSPHRASE && process.env.CAULK_PASSPHRASE.trim()) {
    return process.env.CAULK_PASSPHRASE.trim();
  }
  return "";
}

/**
 * Loads and decrypts a .slate board into a Y.Doc.
 * If file does not exist, returns an empty Y.Doc.
 */
export async function loadBoard(filePath: string, passphrase: string): Promise<{ doc: Y.Doc; isNew: boolean; salt?: Uint8Array }> {
  const doc = new Y.Doc();
  if (!existsSync(filePath)) {
    return { doc, isNew: true };
  }

  const rawBytes = readFileSync(filePath);
  const env = parseEnvelope(rawBytes);
  const salt = base64ToBytes(env.kdf.salt);
  const key = await deriveKey(passphrase, salt, env.kdf.iterations || PBKDF2_ITERATIONS);
  const plain = await decryptEnvelope(env, key);

  Y.applyUpdate(doc, plain);
  return { doc, isNew: false, salt };
}

/**
 * Encrypts a Y.Doc and saves it to a .slate file on disk.
 */
export async function saveBoard(filePath: string, doc: Y.Doc, passphrase: string, existingSalt?: Uint8Array): Promise<void> {
  const salt = existingSalt || randomBytes(16);
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plain = Y.encodeStateAsUpdate(doc);
  const env = await encryptEnvelope(plain, key, salt);

  const dir = resolve(filePath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filePath, JSON.stringify(env, null, 2), "utf-8");
}

export async function runCLI(args: string[] = process.argv.slice(2)): Promise<void> {
  const opts = parseArgs(args);
  const command = opts.command || "help";

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(`
Caulk Board CLI & External AI Agent Tool

Usage:
  npx caulk <command> [options]

Commands:
  list-boards                     List all .slate boards found in boards/ directory
  dump                            Dump board state (tasks, stickies, frames) as JSON or Markdown
  list-tasks                      List all tasks on the board
  add-task                        Create a new Jira-grade task on the board
  update-task                     Update status, assignee, or priority of a task
  add-sticky                      Add a sticky note directly to the whiteboard canvas

Options:
  --board, -b <name>              Board name (default: "default")
  --file, -f <path>               Direct path to .slate board file
  --dir, -d <path>                Boards directory (default: "./boards")
  --passphrase, -p <pass>         Decryption passphrase (or set CAULK_PASSPHRASE env var)
  --title, -t <title>             Task title
  --status, -s <status>           Task status (TODO, IN_PROGRESS, REVIEW, DONE, BACKLOG)
  --priority <priority>           Task priority (LOW, MEDIUM, HIGH, CRITICAL)
  --assignee, -a <name>           Assignee username
  --subtasks <list>               Comma-separated subtask titles
  --sticky                        Also place a linked sticky note on canvas
  --text <text>                   Sticky note text content
  --color, -c <color>             Sticky note color (yellow, green, blue, purple, pink, orange)
  --frame <title>                 Target frame title for grouping
  --json                          Output results in JSON format
`);
    return;
  }

  if (command === "list-boards") {
    const dir = resolve(opts.dir || "./boards");
    if (!existsSync(dir)) {
      console.log(`Directory ${dir} does not exist.`);
      return;
    }
    const files = readdirSync(dir).filter((f) => f.endsWith(".slate"));
    if (opts.json) {
      console.log(JSON.stringify(files.map(f => ({ name: f.replace(/\.slate$/, ""), file: join(dir, f) }))));
    } else {
      console.log(`Found ${files.length} board(s) in ${dir}:`);
      for (const f of files) {
        console.log(`  • ${basename(f, ".slate")} (${f})`);
      }
    }
    return;
  }

  const filePath = resolveBoardPath(opts);
  const passphrase = getPassphrase(opts);

  if (!passphrase && existsSync(filePath)) {
    console.error("Error: Board passphrase required. Provide --passphrase or set CAULK_PASSPHRASE environment variable.");
    process.exit(1);
  }

  const effectivePassphrase = passphrase || "default";
  const { doc, salt } = await loadBoard(filePath, effectivePassphrase);

  switch (command) {
    case "dump": {
      const tasksMap = doc.getMap<TaskRecord>("tasks");
      const tasks = Array.from(tasksMap.values());

      const elementsMap = doc.getMap<any>("elements");
      const elements = Array.from(elementsMap.values());

      const frames = elements.filter(e => e.type === "frame" && !e.isDeleted);
      const stickies = elements.filter(e => e.customData?.isSticky && !e.isDeleted);

      if (opts.json) {
        console.log(JSON.stringify({ file: filePath, tasks, frames, stickies }, null, 2));
      } else {
        console.log(`# Board: ${basename(filePath, ".slate")}`);
        console.log(`Path: ${filePath}\n`);
        console.log(`## Tasks (${tasks.length})`);
        if (tasks.length === 0) {
          console.log("No tasks recorded.");
        } else {
          for (const t of tasks) {
            const assignee = t.assignees?.length ? ` [@${t.assignees.join(", @")}]` : "";
            const sub = t.subtaskIds?.length ? ` (${t.subtaskIds.length} subtasks)` : "";
            console.log(`- [${t.status.toUpperCase()}] ${t.key || t.id}: ${t.title}${assignee}${sub}`);
          }
        }

        console.log(`\n## Frames (${frames.length})`);
        for (const f of frames) {
          console.log(`- Frame: "${f.name}"`);
        }

        console.log(`\n## Stickies (${stickies.length})`);
        for (const s of stickies) {
          const txt = s.label?.text || s.text || "";
          console.log(`- Sticky: "${txt.replace(/\n/g, " ").slice(0, 60)}"`);
        }
      }
      break;
    }

    case "list-tasks": {
      const tasksMap = doc.getMap<TaskRecord>("tasks");
      const tasks = Array.from(tasksMap.values());
      if (opts.json) {
        console.log(JSON.stringify(tasks, null, 2));
      } else {
        console.log(`Tasks for ${basename(filePath, ".slate")}:`);
        for (const t of tasks) {
          const assignee = t.assignees?.length ? ` [@${t.assignees.join(", @")}]` : "";
          console.log(`  [${t.status.toUpperCase()}] ${t.title}${assignee} (${t.priority})`);
        }
      }
      break;
    }

    case "add-task": {
      if (!opts.title) {
        console.error("Error: --title is required to add a task.");
        process.exit(1);
      }

      const subtasks = opts.subtasks ? opts.subtasks.split(",").map(s => s.trim()).filter(Boolean) : [];
      const labels = opts.labels ? opts.labels.split(",").map(l => l.trim()).filter(Boolean) : [];

      const task = createTask(doc, {
        title: opts.title,
        status: normalizeStatus(opts.status),
        priority: normalizePriority(opts.priority),
        assignees: opts.assignee ? [opts.assignee] : [],
        description: opts.description || "",
        labels,
      });

      if (subtasks.length > 0) {
        for (const subTitle of subtasks) {
          createSubtask(doc, task.id, { title: subTitle });
        }
      }

      if (opts.sticky) {
        const elementsMap = doc.getMap<any>("elements");
        const orderArray = doc.getArray<string>("order");
        const stickyId = `sticky-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const element = {
          id: stickyId,
          type: "rectangle",
          x: 200,
          y: 200,
          width: 220,
          height: 160,
          backgroundColor: "#BAE6FD",
          fillStyle: "solid",
          strokeColor: "transparent",
          roughness: 0,
          roundness: null,
          customData: { isSticky: true, taskId: task.id },
          label: {
            text: `[${task.status.toUpperCase()}] ${task.title}${task.assignees.length ? `\n👤 @${task.assignees.join(", @")}` : ""}`,
            fontSize: 16,
            fontFamily: 2,
            textAlign: "center",
            verticalAlign: "middle",
            strokeColor: "#1e1e1e",
          },
        };
        elementsMap.set(stickyId, element);
        orderArray.push([stickyId]);
      }

      await saveBoard(filePath, doc, effectivePassphrase, salt);
      console.log(`✓ Added task: [${task.key}] "${task.title}" (${task.status.toUpperCase()}) to ${filePath}`);
      break;
    }

    case "update-task": {
      if (!opts.task) {
        console.error("Error: --task <id or title> is required.");
        process.exit(1);
      }

      const tasksMap = doc.getMap<TaskRecord>("tasks");
      let target: TaskRecord | undefined;
      for (const t of tasksMap.values()) {
        if (t.id === opts.task || t.key === opts.task || t.title.toLowerCase().includes(opts.task.toLowerCase())) {
          target = t;
          break;
        }
      }

      if (!target) {
        console.error(`Error: Task matching "${opts.task}" not found.`);
        process.exit(1);
      }

      const updates: Partial<TaskRecord> = {};
      if (opts.status) updates.status = normalizeStatus(opts.status);
      if (opts.priority) updates.priority = normalizePriority(opts.priority);
      if (opts.assignee) updates.assignees = [opts.assignee];

      updateTask(doc, target.id, updates);
      await saveBoard(filePath, doc, effectivePassphrase, salt);
      console.log(`✓ Updated task [${target.key || target.id}] "${target.title}" in ${filePath}`);
      break;
    }

    case "add-sticky": {
      if (!opts.text) {
        console.error("Error: --text is required to add a sticky note.");
        process.exit(1);
      }

      const elementsMap = doc.getMap<any>("elements");
      const orderArray = doc.getArray<string>("order");
      const stickyId = `sticky-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const element = {
        id: stickyId,
        type: "rectangle",
        x: 150 + Math.floor(Math.random() * 80),
        y: 150 + Math.floor(Math.random() * 80),
        width: 220,
        height: 160,
        backgroundColor: opts.color === "green" ? "#BBF7D0" : opts.color === "blue" ? "#BAE6FD" : "#FEF08A",
        fillStyle: "solid",
        strokeColor: "transparent",
        roughness: 0,
        roundness: null,
        customData: { isSticky: true },
        label: {
          text: opts.text,
          fontSize: 16,
          fontFamily: 2,
          textAlign: "center",
          verticalAlign: "middle",
          strokeColor: "#1e1e1e",
        },
      };

      elementsMap.set(stickyId, element);
      orderArray.push([stickyId]);

      await saveBoard(filePath, doc, effectivePassphrase, salt);
      console.log(`✓ Added sticky note to ${filePath}: "${opts.text.slice(0, 40)}"`);
      break;
    }

    default:
      console.error(`Unknown command: ${command}. Run with --help for usage.`);
      process.exit(1);
  }
}

// Direct invocation check
if (process.argv[1] && (process.argv[1].endsWith("/caulk") || process.argv[1].endsWith("/caulk.ts") || process.argv[1].endsWith("/caulk.mjs"))) {
  void runCLI();
}
