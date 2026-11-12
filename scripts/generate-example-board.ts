import * as Y from "yjs";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  deriveKey,
  encryptEnvelope,
  PBKDF2_ITERATIONS,
} from "../src/crypto/envelope";
import { randomBytes } from "../src/lib/bytes";
import { defaultPassphrase } from "../src/config";
import {
  createTask,
  createSubtask,
  createSprint,
  createMilestone,
  addMember,
  addCustomRole,
  DEFAULT_PROJECT_ROLES,
} from "../src/features/tasks/store";
import { addSoundboardClip } from "../src/features/soundboard/store";
import { recordActivity } from "../src/history/activity";

async function generateExampleBoard() {
  const doc = new Y.Doc();
  const now = Date.now();
  const ONE_DAY = 86400000;

  console.log("1. Adding custom roles & team members...");
  for (const role of DEFAULT_PROJECT_ROLES) {
    addCustomRole(doc, { name: role.name, color: role.color, icon: role.icon });
  }

  addMember(doc, { name: "nikoraasu", role: "Lead Architect", avatarUrl: "https://github.com/nikoraasu.png", isRepoCollaborator: true, repoRole: "admin" });
  addMember(doc, { name: "alex-dev", role: "Frontend Engineer", avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=alex-dev", isRepoCollaborator: true, repoRole: "write" });
  addMember(doc, { name: "elena-rust", role: "Systems Engineer", avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=elena-rust", isRepoCollaborator: false, repoRole: "write" });
  addMember(doc, { name: "marcus-ops", role: "DevOps & Security", avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=marcus-ops", isRepoCollaborator: false, repoRole: "write" });
  addMember(doc, { name: "sarah-qa", role: "QA Specialist", avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=sarah-qa", isRepoCollaborator: false, repoRole: "read" });

  console.log("2. Creating milestones & sprints...");
  const m1 = createMilestone(
    doc,
    "V1.0 Public Launch",
    "Feature-complete release with teams hub, soundboard, and AI agent CLI",
    now + ONE_DAY * 14,
    "#48bb78",
  );

  const m2 = createMilestone(
    doc,
    "Enterprise Multi-Repo Support",
    "Cross-repository dashboard linking and team permission governance",
    now + ONE_DAY * 45,
    "#805ad5",
  );

  const s1 = createSprint(
    doc,
    "Sprint 14: Retro Polish & AI Integration",
    "Ship soundboard, activity log, teams hub, and headless CLI for AI agents",
    now - ONE_DAY * 3,
    now + ONE_DAY * 11,
    "active",
  );

  const s2 = createSprint(
    doc,
    "Sprint 15: Mobile Canvas & Offline IndexedDB Sync",
    "PWA touch gestures, local offline mutations, and battery-friendly polling",
    now + ONE_DAY * 11,
    now + ONE_DAY * 25,
    "planned",
  );

  console.log("3. Adding Jira-grade tasks with subtasks...");
  const t1 = createTask(doc, {
    title: "Implement Web Audio retro sound effects synthesizer",
    description: "Built-in chimes, clicks, alerts, and cluster sounds with authentic 90s retro DAC emulation.",
    status: "done",
    priority: "high",
    assignees: ["nikoraasu"],
    labels: ["audio", "synthesizer", "retro"],
    sprintId: s1.id,
    milestoneId: m1.id,
    startDate: now - ONE_DAY * 3,
    dueDate: now - ONE_DAY * 1,
  });
  createSubtask(doc, t1.id, { title: "Oscillator & GainNode sound generators", status: "done" });
  createSubtask(doc, t1.id, { title: "5 retro sound packs (VGUI, Win95, XP, Frutiger, Mac OS9)", status: "done" });
  createSubtask(doc, t1.id, { title: "Volume slider and mute toggle", status: "done" });

  const t2 = createTask(doc, {
    title: "Build Jira-grade Progress Manager (Kanban, Gantt, Calendar)",
    description: "Complete project hub with drag-and-drop Kanban, live timeline Gantt bars, calendar view, and workload metrics.",
    status: "done",
    priority: "critical",
    assignees: ["alex-dev"],
    labels: ["tasks", "kanban", "gantt"],
    sprintId: s1.id,
    milestoneId: m1.id,
    startDate: now - ONE_DAY * 3,
    dueDate: now + ONE_DAY * 2,
  });
  createSubtask(doc, t2.id, { title: "CRDT Y.Map storage for task records", status: "done" });
  createSubtask(doc, t2.id, { title: "Interactive timeline Gantt scale with day snapping", status: "done" });
  createSubtask(doc, t2.id, { title: "Subtask progress calculation & blocked status detection", status: "done" });
  createSubtask(doc, t2.id, { title: "Filter by sprint, milestone, assignee, and priority", status: "done" });

  const t3 = createTask(doc, {
    title: "Universal CLI & AGENTS.md for autonomous AI coding agents",
    description: "Headless board CLI (npx caulk) allowing Claude Code, Antigravity, and Codex to autonomously inspect and advance board tasks.",
    status: "done",
    priority: "high",
    assignees: ["nikoraasu"],
    labels: ["ai", "cli", "agents"],
    sprintId: s1.id,
    milestoneId: m1.id,
    startDate: now - ONE_DAY * 2,
    dueDate: now,
  });
  createSubtask(doc, t3.id, { title: "npx caulk dump and list-tasks commands", status: "done" });
  createSubtask(doc, t3.id, { title: "npx caulk add-task with --sticky flag", status: "done" });
  createSubtask(doc, t3.id, { title: "npx caulk update-task status transitions", status: "done" });
  createSubtask(doc, t3.id, { title: "AGENTS.md & CLAUDE.md standard prompt specifications", status: "done" });

  const t4 = createTask(doc, {
    title: "Audio Clipper & collaborative soundboard broadcasting",
    description: "Interactive visual waveform clipper for MP3/WAV files with real-time audio broadcast triggers across live peers.",
    status: "in_progress",
    priority: "high",
    assignees: ["alex-dev", "nikoraasu"],
    labels: ["audio", "soundboard", "collaboration"],
    sprintId: s1.id,
    milestoneId: m1.id,
    startDate: now,
    dueDate: now + ONE_DAY * 4,
  });
  createSubtask(doc, t4.id, { title: "Canvas waveform renderer with draggable start/end handles", status: "done" });
  createSubtask(doc, t4.id, { title: "Microphone recording with live visual level meter", status: "in_progress" });
  createSubtask(doc, t4.id, { title: "Y.Map soundboard_triggers replication for peer playback", status: "todo" });

  const t5 = createTask(doc, {
    title: "Activity audit log ring buffer with semantic human-readable diffs",
    description: "Collaborative event stream recording element creations, task status transitions, and sticky edits with avatar attribution.",
    status: "review",
    priority: "medium",
    assignees: ["sarah-qa"],
    labels: ["audit", "history", "security"],
    sprintId: s1.id,
    milestoneId: m1.id,
    startDate: now - ONE_DAY * 1,
    dueDate: now + ONE_DAY * 3,
  });
  createSubtask(doc, t5.id, { title: "Capped 200-entry ring buffer in Yjs", status: "done" });
  createSubtask(doc, t5.id, { title: "Semantic classification (Shapes, Sticky notes, Task cards)", status: "done" });
  createSubtask(doc, t5.id, { title: "History drawer UI with timestamp formatting", status: "todo" });

  const t6 = createTask(doc, {
    title: "E2E Encrypted Live Relay via lightweight PHP signal server",
    description: "Sub-300ms peer-to-peer live state replication with zero plaintext on server using ephemeral ciphertext rooms.",
    status: "done",
    priority: "critical",
    assignees: ["elena-rust"],
    labels: ["crypto", "relay", "php"],
    sprintId: s1.id,
    milestoneId: m1.id,
    startDate: now - ONE_DAY * 4,
    dueDate: now - ONE_DAY * 2,
  });
  createSubtask(doc, t6.id, { title: "api/signal.php long-polling endpoint", status: "done" });
  createSubtask(doc, t6.id, { title: "AES-256-GCM message encryption per room", status: "done" });
  createSubtask(doc, t6.id, { title: "Collaborator presence & cursor trails", status: "done" });

  const t7 = createTask(doc, {
    title: "Automate periodic git commit squash for active live sessions",
    description: "Elected saver strategy to coalesce frequent edits into clean, readable GitHub commit history.",
    status: "todo",
    priority: "medium",
    assignees: ["marcus-ops"],
    labels: ["sync", "git", "devops"],
    sprintId: s1.id,
    milestoneId: m1.id,
    startDate: now + ONE_DAY * 2,
    dueDate: now + ONE_DAY * 8,
  });
  createSubtask(doc, t7.id, { title: "Leader election amongst active peers", status: "todo" });
  createSubtask(doc, t7.id, { title: "Dirty state debounce timer (5 seconds)", status: "todo" });
  createSubtask(doc, t7.id, { title: "GitHub Blobs API fallback for >1MB board assets", status: "todo" });

  const t8 = createTask(doc, {
    title: "SVG Canvas Export with embedded encrypted slate envelope",
    description: "Export full whiteboard canvas to high-res SVG while embedding the raw encrypted .slate payload in an XML comment block.",
    status: "todo",
    priority: "low",
    assignees: ["alex-dev"],
    labels: ["export", "svg", "canvas"],
    sprintId: s1.id,
    milestoneId: m1.id,
    startDate: now + ONE_DAY * 5,
    dueDate: now + ONE_DAY * 10,
  });
  createSubtask(doc, t8.id, { title: "Export Excalidraw scene to SVG string", status: "todo" });
  createSubtask(doc, t8.id, { title: "Drag-and-drop .svg back into Caulk to restore board", status: "todo" });

  const t9 = createTask(doc, {
    title: "Client-side cryptographic security & side-channel audit",
    description: "Verify PBKDF2 600,000 iteration key derivation resistance, constant-time comparisons, and zero localStorage credential leaks.",
    status: "backlog",
    priority: "high",
    assignees: ["marcus-ops"],
    labels: ["security", "crypto", "audit"],
    milestoneId: m2.id,
    startDate: now + ONE_DAY * 14,
    dueDate: now + ONE_DAY * 28,
  });
  createSubtask(doc, t9.id, { title: "Audit web crypto SubtleCrypto usage", status: "todo" });
  createSubtask(doc, t9.id, { title: "Verify wrong passphrase rejection without partial state corruption", status: "todo" });

  console.log("4. Adding retro soundboard clips...");
  addSoundboardClip(doc, {
    id: "clip-valve",
    name: "VGUI Click",
    icon: "🎮",
    color: "#c59c3a",
    duration: 0.15,
    startTime: 0,
    endTime: 0.15,
    hotkey: "1",
    isPreset: true,
    createdAt: now,
    createdBy: "nikoraasu",
  });
  addSoundboardClip(doc, {
    id: "clip-alert",
    name: "Steam Alert",
    icon: "📢",
    color: "#e53e3e",
    duration: 0.4,
    startTime: 0,
    endTime: 0.4,
    hotkey: "2",
    isPreset: true,
    createdAt: now,
    createdBy: "alex-dev",
  });
  addSoundboardClip(doc, {
    id: "clip-win95",
    name: "Win95 Chime",
    icon: "⚡",
    color: "#3182ce",
    duration: 0.8,
    startTime: 0,
    endTime: 0.8,
    hotkey: "3",
    isPreset: true,
    createdAt: now,
    createdBy: "elena-rust",
  });
  addSoundboardClip(doc, {
    id: "clip-glacier",
    name: "Frutiger Ping",
    icon: "💎",
    color: "#319795",
    duration: 0.35,
    startTime: 0,
    endTime: 0.35,
    hotkey: "4",
    isPreset: true,
    createdAt: now,
    createdBy: "sarah-qa",
  });
  addSoundboardClip(doc, {
    id: "clip-applause",
    name: "Team Applause",
    icon: "👏",
    color: "#48bb78",
    duration: 1.2,
    startTime: 0,
    endTime: 1.2,
    hotkey: "5",
    isPreset: true,
    createdAt: now,
    createdBy: "marcus-ops",
  });

  console.log("5. Populating collaborative activity log...");
  recordActivity(doc, {
    user: "nikoraasu",
    action: "create",
    elementType: "task",
    detail: 'Created task "Universal CLI & AGENTS.md for autonomous AI coding agents"',
    timestamp: now - 3600000 * 4,
  });
  recordActivity(doc, {
    user: "alex-dev",
    action: "update",
    elementType: "task",
    detail: 'Advanced "Build Jira-grade Progress Manager" (IN_PROGRESS ➔ DONE)',
    timestamp: now - 3600000 * 3,
  });
  recordActivity(doc, {
    user: "elena-rust",
    action: "create",
    elementType: "sticky",
    detail: 'Added sticky note: "E2E Encrypted Live Relay tested with 8 concurrent peers"',
    timestamp: now - 3600000 * 2,
  });
  recordActivity(doc, {
    user: "sarah-qa",
    action: "update",
    elementType: "task",
    detail: 'Moved "Activity audit log ring buffer" to REVIEW',
    timestamp: now - 3600000 * 1,
  });

  console.log("6. Constructing visual whiteboard canvas elements, frames, diagrams, and stickies...");
  const elementsMap = doc.getMap("elements");
  const orderArray = doc.getArray("order");
  const filesMap = doc.getMap("files");
  const settingsMap = doc.getMap("settings");

  // Board settings: Authentic Steam VGUI theme
  settingsMap.set("theme", "vgui");
  settingsMap.set("boardRadius", "4");

  const elements: any[] = [];

  // Helper for creating base element attributes
  const makeEl = (data: any) => ({
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: { type: 3 },
    seed: Math.floor(Math.random() * 1000000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 1000000),
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: null,
    locked: false,
    ...data,
  });

  // FRAME 1: Project Architecture & Data Flow
  const frame1Id = "frame-arch-1";
  elements.push(makeEl({
    id: frame1Id,
    type: "frame",
    name: "🚀 Architecture & Real-Time Sync Lanes",
    x: 80,
    y: 80,
    width: 920,
    height: 600,
    backgroundColor: "rgba(43, 53, 44, 0.4)",
    strokeColor: "#5b6e58",
    strokeWidth: 2,
  }));

  // Box 1: Browser Client
  const clientBoxId = "box-client";
  elements.push(makeEl({
    id: clientBoxId,
    type: "rectangle",
    frameId: frame1Id,
    x: 120,
    y: 160,
    width: 240,
    height: 100,
    backgroundColor: "#3a4638",
    strokeColor: "#c59c3a",
    strokeWidth: 2,
    label: { text: "🖥️ Caulk Web App\n(React 18 + Excalidraw)", fontSize: 16, strokeColor: "#ffffff" },
  }));

  // Box 2: Yjs CRDT Engine
  const crdtBoxId = "box-crdt";
  elements.push(makeEl({
    id: crdtBoxId,
    type: "rectangle",
    frameId: frame1Id,
    x: 420,
    y: 160,
    width: 240,
    height: 100,
    backgroundColor: "#2c3b2d",
    strokeColor: "#48bb78",
    strokeWidth: 2,
    label: { text: "⚡ Yjs CRDT Engine\n(LWW Map + Z-Order Array)", fontSize: 16, strokeColor: "#ffffff" },
  }));

  // Arrow Client -> CRDT
  elements.push(makeEl({
    id: "arrow-client-crdt",
    type: "arrow",
    frameId: frame1Id,
    x: 360,
    y: 210,
    points: [[0, 0], [60, 0]],
    strokeColor: "#c59c3a",
    strokeWidth: 2,
    endArrowhead: "arrow",
  }));

  // Box 3: Live Relay
  const relayBoxId = "box-relay";
  elements.push(makeEl({
    id: relayBoxId,
    type: "rectangle",
    frameId: frame1Id,
    x: 720,
    y: 120,
    width: 240,
    height: 80,
    backgroundColor: "#243224",
    strokeColor: "#3182ce",
    strokeWidth: 2,
    label: { text: "📡 api/signal.php\n(E2E Ephemeral Sub-300ms)", fontSize: 14, strokeColor: "#ffffff" },
  }));

  // Box 4: GitHub Git Persistence
  const gitBoxId = "box-git";
  elements.push(makeEl({
    id: gitBoxId,
    type: "rectangle",
    frameId: frame1Id,
    x: 720,
    y: 230,
    width: 240,
    height: 80,
    backgroundColor: "#243224",
    strokeColor: "#805ad5",
    strokeWidth: 2,
    label: { text: "📦 GitHub REST Blobs\n(AES-256-GCM Encrypted)", fontSize: 14, strokeColor: "#ffffff" },
  }));

  // Arrow CRDT -> Relay
  elements.push(makeEl({
    id: "arrow-crdt-relay",
    type: "arrow",
    frameId: frame1Id,
    x: 660,
    y: 180,
    points: [[0, 0], [60, -20]],
    strokeColor: "#3182ce",
    strokeWidth: 2,
    endArrowhead: "arrow",
  }));

  // Arrow CRDT -> Git
  elements.push(makeEl({
    id: "arrow-crdt-git",
    type: "arrow",
    frameId: frame1Id,
    x: 660,
    y: 230,
    points: [[0, 0], [60, 40]],
    strokeColor: "#805ad5",
    strokeWidth: 2,
    endArrowhead: "arrow",
  }));

  // Stickies inside Frame 1
  elements.push(makeEl({
    id: "sticky-security-1",
    type: "rectangle",
    frameId: frame1Id,
    x: 120,
    y: 350,
    width: 240,
    height: 160,
    backgroundColor: "#2b4c2b",
    strokeColor: "transparent",
    customData: { isSticky: true, tags: ["security", "zero-knowledge"] },
    label: {
      text: "🔒 Zero Knowledge\n\nNo plain text ever touches server or relay. PBKDF2 600k + AES-256-GCM entirely in-browser.",
      fontSize: 14,
      strokeColor: "#e6ffe6",
    },
  }));

  elements.push(makeEl({
    id: "sticky-security-2",
    type: "rectangle",
    frameId: frame1Id,
    x: 420,
    y: 350,
    width: 240,
    height: 160,
    backgroundColor: "#4c3e20",
    strokeColor: "transparent",
    customData: { isSticky: true, tags: ["git-backed", "data-ownership"] },
    label: {
      text: "📂 100% Data Ownership\n\nEvery commit is a clean Git version. No SaaS lock-in, no vendor databases, inspectable in repo.",
      fontSize: 14,
      strokeColor: "#fff0cc",
    },
  }));

  elements.push(makeEl({
    id: "sticky-security-3",
    type: "rectangle",
    frameId: frame1Id,
    x: 720,
    y: 350,
    width: 240,
    height: 160,
    backgroundColor: "#352b4c",
    strokeColor: "transparent",
    customData: { isSticky: true, tags: ["cli", "agents"] },
    label: {
      text: "🤖 AI Autonomous CLI\n\nExternal coding agents run `npx caulk` to inspect, add tasks, and update progress directly in repo.",
      fontSize: 14,
      strokeColor: "#edd5ff",
    },
  }));

  // FRAME 2: Active Sprint 14 Board
  const frame2Id = "frame-sprint-2";
  elements.push(makeEl({
    id: frame2Id,
    type: "frame",
    name: "📋 Active Sprint 14: Core Deliverables & Stickies",
    x: 1040,
    y: 80,
    width: 960,
    height: 600,
    backgroundColor: "rgba(35, 45, 38, 0.4)",
    strokeColor: "#5b6e58",
    strokeWidth: 2,
  }));

  // Task-linked Stickies
  elements.push(makeEl({
    id: "sticky-task-1",
    type: "rectangle",
    frameId: frame2Id,
    x: 1080,
    y: 160,
    width: 260,
    height: 170,
    backgroundColor: "#2e4a36",
    strokeColor: "transparent",
    customData: { isSticky: true, taskId: t1.id, tags: ["audio", "synthesizer"] },
    label: {
      text: "✓ [DONE] Sound Synthesizer\n\nBuilt-in 90s DAC emulator with 5 retro sound packs\n\n👤 @nikoraasu #audio",
      fontSize: 14,
      strokeColor: "#d2f5db",
    },
  }));

  elements.push(makeEl({
    id: "sticky-task-2",
    type: "rectangle",
    frameId: frame2Id,
    x: 1380,
    y: 160,
    width: 260,
    height: 170,
    backgroundColor: "#2e4a36",
    strokeColor: "transparent",
    customData: { isSticky: true, taskId: t2.id, tags: ["tasks", "jira"] },
    label: {
      text: "✓ [DONE] Jira Progress Hub\n\nKanban, Gantt timeline, calendar, and workload charts\n\n👤 @alex-dev #tasks",
      fontSize: 14,
      strokeColor: "#d2f5db",
    },
  }));

  elements.push(makeEl({
    id: "sticky-task-3",
    type: "rectangle",
    frameId: frame2Id,
    x: 1680,
    y: 160,
    width: 260,
    height: 170,
    backgroundColor: "#2e4a36",
    strokeColor: "transparent",
    customData: { isSticky: true, taskId: t3.id, tags: ["ai", "agents"] },
    label: {
      text: "✓ [DONE] Agent CLI (npx caulk)\n\nAGENTS.md & CLAUDE.md integration for Claude Code & Antigravity\n\n👤 @nikoraasu #ai",
      fontSize: 14,
      strokeColor: "#d2f5db",
    },
  }));

  elements.push(makeEl({
    id: "sticky-task-4",
    type: "rectangle",
    frameId: frame2Id,
    x: 1080,
    y: 370,
    width: 260,
    height: 170,
    backgroundColor: "#4d4224",
    strokeColor: "transparent",
    customData: { isSticky: true, taskId: t4.id, tags: ["audio", "soundboard"] },
    label: {
      text: "⏳ [IN PROGRESS] Soundboard\n\nAudio waveform clipper + peer-to-peer live broadcast\n\n👤 @alex-dev #audio",
      fontSize: 14,
      strokeColor: "#fbeaa8",
    },
  }));

  elements.push(makeEl({
    id: "sticky-task-5",
    type: "rectangle",
    frameId: frame2Id,
    x: 1380,
    y: 370,
    width: 260,
    height: 170,
    backgroundColor: "#3a2d4d",
    strokeColor: "transparent",
    customData: { isSticky: true, taskId: t5.id, tags: ["audit", "history"] },
    label: {
      text: "👀 [REVIEW] Activity Log\n\nCollaborative audit history drawer with user avatars\n\n👤 @sarah-qa #audit",
      fontSize: 14,
      strokeColor: "#e6d7ff",
    },
  }));

  elements.push(makeEl({
    id: "sticky-task-7",
    type: "rectangle",
    frameId: frame2Id,
    x: 1680,
    y: 370,
    width: 260,
    height: 170,
    backgroundColor: "#24374d",
    strokeColor: "transparent",
    customData: { isSticky: true, taskId: t7.id, tags: ["git", "sync"] },
    label: {
      text: "📌 [TODO] Auto Git Squash\n\nSaver leader election & batch commit debouncing\n\n👤 @marcus-ops #sync",
      fontSize: 14,
      strokeColor: "#cce4ff",
    },
  }));

  // FRAME 3: Interactive Hotkeys & Embedded Asset
  const frame3Id = "frame-tips-3";
  elements.push(makeEl({
    id: frame3Id,
    type: "frame",
    name: "⚡ Collaborative Shortcuts & Visuals",
    x: 80,
    y: 720,
    width: 920,
    height: 520,
    backgroundColor: "rgba(43, 53, 44, 0.4)",
    strokeColor: "#5b6e58",
    strokeWidth: 2,
  }));

  // Embedded SVG image logo
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="140" viewBox="0 0 300 140">
    <rect width="300" height="140" rx="6" fill="#384635" stroke="#c59c3a" stroke-width="3"/>
    <rect x="12" y="12" width="276" height="116" rx="4" fill="#283326" stroke="#4a5c46" stroke-width="2"/>
    <text x="150" y="55" fill="#c59c3a" font-family="monospace" font-size="28" font-weight="bold" text-anchor="middle">CAULK</text>
    <text x="150" y="80" fill="#a4c2a0" font-family="sans-serif" font-size="12" text-anchor="middle">GIT-BACKED E2E COLLABORATION</text>
    <rect x="30" y="96" width="240" height="16" rx="3" fill="#1b241a"/>
    <rect x="32" y="98" width="180" height="12" rx="2" fill="#48bb78"/>
    <text x="150" y="108" fill="#ffffff" font-family="sans-serif" font-size="9" font-weight="bold" text-anchor="middle">V1.0 MILESTONE · 75% COMPLETE</text>
  </svg>`;
  const logoDataUrl = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;
  const logoFileId = "file-caulk-logo";

  filesMap.set(logoFileId, {
    id: logoFileId,
    mimeType: "image/svg+xml",
    created: now,
    dataURL: logoDataUrl,
  });

  elements.push(makeEl({
    id: "img-caulk-badge",
    type: "image",
    frameId: frame3Id,
    fileId: logoFileId,
    status: "saved",
    x: 120,
    y: 800,
    width: 320,
    height: 150,
  }));

  // Quick Tip cards
  elements.push(makeEl({
    id: "sticky-tip-1",
    type: "rectangle",
    frameId: frame3Id,
    x: 480,
    y: 800,
    width: 220,
    height: 150,
    backgroundColor: "#3a4638",
    strokeColor: "#c59c3a",
    strokeWidth: 1,
    customData: { isSticky: true, tags: ["shortcuts"] },
    label: {
      text: "🎹 Soundboard Hotkeys\n\nPress number keys 1 through 5 to trigger sound effects live for all peers!\n\n1: VGUI Click\n2: Alert\n3: Win95\n4: Ping\n5: Applause",
      fontSize: 12,
      strokeColor: "#e6ffe6",
    },
  }));

  elements.push(makeEl({
    id: "sticky-tip-2",
    type: "rectangle",
    frameId: frame3Id,
    x: 730,
    y: 800,
    width: 220,
    height: 150,
    backgroundColor: "#3a4638",
    strokeColor: "#3182ce",
    strokeWidth: 1,
    customData: { isSticky: true, tags: ["collaboration"] },
    label: {
      text: "🎯 Radar Ping & Live\n\nAlt + Click anywhere to send a pulsing radar ping to get your team's attention!\n\nPress 'T' to open Jira Tasks Hub anytime.",
      fontSize: 12,
      strokeColor: "#cce4ff",
    },
  }));

  elements.push(makeEl({
    id: "sticky-tip-3",
    type: "rectangle",
    frameId: frame3Id,
    x: 120,
    y: 990,
    width: 830,
    height: 180,
    backgroundColor: "#263324",
    strokeColor: "#5b6e58",
    strokeWidth: 1,
    customData: { isSticky: true, tags: ["cli-recipes"] },
    label: {
      text: "🤖 Example Agent Terminal Commands:\n\n$ npx caulk dump --board example --json\n$ npx caulk list-tasks --board example --status TODO\n$ npx caulk add-task --board example --title \"New Feature\" --status TODO --priority HIGH --sticky\n$ npx caulk update-task --board example --task \"CLK-4\" --status DONE\n$ npx caulk add-sticky --board example --text \"Verified all tests pass\" --color green",
      fontSize: 13,
      fontFamily: 3,
      textAlign: "left",
      strokeColor: "#c59c3a",
    },
  }));

  // FRAME 4: Brainstorming & Feedback
  const frame4Id = "frame-brainstorm-4";
  elements.push(makeEl({
    id: frame4Id,
    type: "frame",
    name: "💡 Next Up & Team Brainstorming",
    x: 1040,
    y: 720,
    width: 960,
    height: 520,
    backgroundColor: "rgba(35, 45, 38, 0.4)",
    strokeColor: "#5b6e58",
    strokeWidth: 2,
  }));

  elements.push(makeEl({
    id: "sticky-idea-1",
    type: "rectangle",
    frameId: frame4Id,
    x: 1080,
    y: 800,
    width: 260,
    height: 160,
    backgroundColor: "#4c4022",
    strokeColor: "transparent",
    customData: { isSticky: true, tags: ["idea", "mermaid"] },
    label: {
      text: "💡 Mermaid.js Live Editor\n\nType Mermaid graph syntax in a modal to render flowchart diagrams directly as native Excalidraw shapes!\n\n👍 4 votes",
      fontSize: 13,
      strokeColor: "#fff0cc",
    },
  }));

  elements.push(makeEl({
    id: "sticky-idea-2",
    type: "rectangle",
    frameId: frame4Id,
    x: 1380,
    y: 800,
    width: 260,
    height: 160,
    backgroundColor: "#293e4c",
    strokeColor: "transparent",
    customData: { isSticky: true, tags: ["idea", "pwa"] },
    label: {
      text: "📱 Mobile Offline PWA\n\nAdd Service Worker caching and touch pinch-zoom gestures for tablet whiteboarding on the go.\n\n👍 6 votes",
      fontSize: 13,
      strokeColor: "#cce4ff",
    },
  }));

  elements.push(makeEl({
    id: "sticky-idea-3",
    type: "rectangle",
    frameId: frame4Id,
    x: 1680,
    y: 800,
    width: 260,
    height: 160,
    backgroundColor: "#412a4c",
    strokeColor: "transparent",
    customData: { isSticky: true, tags: ["idea", "issues"] },
    label: {
      text: "🐙 2-Way GitHub Issues Sync\n\nDrag any repo issue onto the board; closing the card on the whiteboard automatically closes the GitHub issue!\n\n👍 8 votes",
      fontSize: 13,
      strokeColor: "#f3dbff",
    },
  }));

  elements.push(makeEl({
    id: "sticky-idea-4",
    type: "rectangle",
    frameId: frame4Id,
    x: 1080,
    y: 1000,
    width: 410,
    height: 170,
    backgroundColor: "#263a2a",
    strokeColor: "transparent",
    customData: { isSticky: true, tags: ["retro-aesthetic"] },
    label: {
      text: "🎮 Retro Soundboard Customization\n\nUpload custom .mp3 / .wav sound clips, assign custom pixel-art icons, and trim them with the AudioClipper.\n\nEveryone hears the soundboard live during sprint demos!",
      fontSize: 13,
      strokeColor: "#d5f7de",
    },
  }));

  elements.push(makeEl({
    id: "sticky-idea-5",
    type: "rectangle",
    frameId: frame4Id,
    x: 1530,
    y: 1000,
    width: 410,
    height: 170,
    backgroundColor: "#4c2626",
    strokeColor: "transparent",
    customData: { isSticky: true, tags: ["dot-voting"] },
    label: {
      text: "🗳️ Collaborative Dot Voting\n\nHost timed dot-voting sessions with configurable token budgets (e.g. 5 votes per peer) and live heatmaps.\n\nGreat for prioritizing backlog and retrospectives!",
      fontSize: 13,
      strokeColor: "#ffd6d6",
    },
  }));

  console.log(`Writing ${elements.length} elements to Yjs scene...`);
  const ids: string[] = [];
  doc.transact(() => {
    for (const el of elements) {
      elementsMap.set(el.id, el);
      ids.push(el.id);
    }
    orderArray.insert(0, ids);
  });

  console.log("7. Encrypting board envelope using Caulk's default open board key...");
  const target = {
    owner: "nikoraasu",
    repo: "caulk",
    branch: "main",
    path: "boards/example.slate",
  };
  const passphrase = defaultPassphrase(target);
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plain = Y.encodeStateAsUpdate(doc);
  const env = await encryptEnvelope(plain, key, salt);

  const outDir = resolve("./boards");
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const outPath = resolve(outDir, "example.slate");
  writeFileSync(outPath, JSON.stringify(env, null, 2), "utf-8");
  console.log(`✓ Successfully generated rich example board at ${outPath}!`);
}

generateExampleBoard().catch((err) => {
  console.error("Failed to generate example board:", err);
  process.exit(1);
});
