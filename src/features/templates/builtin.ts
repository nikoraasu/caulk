import type { BoardTemplate, TemplateElement } from "./types";

let seq = 1;
const nextId = (prefix: string) => `${prefix}-${(seq += 1)}`;

function baseProps(overrides: Record<string, unknown>): TemplateElement {
  return {
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
    roundness: null,
    seed: seq * 101 + 7,
    version: 1,
    versionNonce: seq * 313 + 11,
    isDeleted: false,
    boundElements: null,
    updated: 1700000000000,
    link: null,
    locked: false,
    ...overrides,
  };
}

function labeledShape(
  type: "rectangle" | "diamond" | "ellipse",
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  opts: { bg?: string; stroke?: string; fontSize?: number; rough?: number; strokeStyle?: string } = {},
): TemplateElement[] {
  const shapeId = nextId(type);
  const textId = nextId("txt");
  const fontSize = opts.fontSize ?? 16;
  const lines = text.split("\n");
  const textHeight = Math.round(lines.length * fontSize * 1.25);

  const shape = baseProps({
    id: shapeId,
    type,
    x,
    y,
    width,
    height,
    backgroundColor: opts.bg ?? "#f5e6b3",
    strokeColor: opts.stroke ?? "#2f382d",
    roughness: opts.rough ?? 0,
    strokeStyle: opts.strokeStyle ?? "solid",
    boundElements: [{ id: textId, type: "text" }],
  });

  const label = baseProps({
    id: textId,
    type: "text",
    x: x + 10,
    y: y + Math.max(8, (height - textHeight) / 2),
    width: Math.max(40, width - 20),
    height: textHeight,
    text,
    originalText: text,
    fontSize,
    fontFamily: 2,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: shapeId,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    roundness: null,
    roughness: 0,
    autoResize: true,
    lineHeight: 1.25,
  });

  return [shape, label];
}

function heading(x: number, y: number, text: string, fontSize = 22): TemplateElement {
  return baseProps({
    id: nextId("hdr"),
    type: "text",
    x,
    y,
    width: Math.max(120, text.length * fontSize * 0.6),
    height: Math.round(fontSize * 1.3),
    text,
    originalText: text,
    fontSize,
    fontFamily: 2,
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    roundness: null,
    roughness: 0,
    autoResize: true,
    lineHeight: 1.25,
  });
}

function sticky(x: number, y: number, text: string, bg = "#f7e07f"): TemplateElement[] {
  return labeledShape("rectangle", x, y, 160, 110, text, {
    bg,
    stroke: "#b89f3b",
    fontSize: 15,
    rough: 0,
  });
}

function arrowBetween(x1: number, y1: number, x2: number, y2: number): TemplateElement {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return baseProps({
    id: nextId("arr"),
    type: "arrow",
    x: x1,
    y: y1,
    width: Math.abs(dx),
    height: Math.abs(dy),
    points: [
      [0, 0],
      [dx, dy],
    ],
    strokeColor: "#2f382d",
    roughness: 0,
    startBinding: null,
    endBinding: null,
    lastCommittedPoint: null,
    startArrowhead: null,
    endArrowhead: "arrow",
    elbowed: false,
  });
}

function buildRetro(): TemplateElement[] {
  const cols = [
    { title: "Start Doing", bg: "#d9ead3", note: "Try pairing on tricky fixes", cardBg: "#c9e2b8" },
    { title: "Stop Doing", bg: "#f4cccc", note: "Long unscheduled meetings", cardBg: "#f5c2c2" },
    { title: "Continue Doing", bg: "#fff2cc", note: "Fast async code reviews", cardBg: "#f7e07f" },
    { title: "Action Items", bg: "#cfe2f3", note: "Owner + due date", cardBg: "#bdd8f1" },
  ];
  const els: TemplateElement[] = [heading(0, -45, "Sprint Retrospective", 24)];
  cols.forEach((col, i) => {
    const cx = i * 230;
    els.push(
      ...labeledShape("rectangle", cx, 0, 210, 420, "", { bg: col.bg, stroke: "#6c7666", rough: 0 }),
      ...labeledShape("rectangle", cx + 10, 10, 190, 42, col.title, {
        bg: "#3e4637",
        stroke: "#252b20",
        fontSize: 15,
      }),
    );
    // fix header contrast to readable soft pill
    els[els.length - 1].strokeColor = "#fff3b0";
    els.push(...sticky(cx + 25, 72, col.note, col.cardBg));
    els.push(...sticky(cx + 25, 200, "Add card…", col.cardBg));
  });
  return els;
}

function buildKanban(): TemplateElement[] {
  const cols = [
    { title: "To Do", bg: "#e8ece6", notes: ["Define scope", "Create mockups"] },
    { title: "Doing", bg: "#fdf5d8", notes: ["Build prototype"] },
    { title: "Done", bg: "#dff0d8", notes: ["Project kickoff"] },
  ];
  const els: TemplateElement[] = [heading(0, -45, "Kanban Board", 24)];
  cols.forEach((col, i) => {
    const cx = i * 260;
    els.push(
      ...labeledShape("rectangle", cx, 0, 240, 420, "", { bg: col.bg, stroke: "#6c7666" }),
      ...labeledShape("rectangle", cx + 12, 12, 216, 40, col.title, {
        bg: "#ffffff",
        stroke: "#556052",
        fontSize: 16,
      }),
    );
    col.notes.forEach((txt, j) => {
      els.push(...sticky(cx + 40, 74 + j * 130, txt, i === 1 ? "#f7e07f" : i === 2 ? "#c9e2b8" : "#f5ebe0"));
    });
  });
  return els;
}

function buildBrainstorm(): TemplateElement[] {
  const els: TemplateElement[] = [
    heading(0, -45, "Team Brainstorm", 24),
    ...labeledShape("rectangle", 0, 0, 460, 220, "Problem / Goal", { bg: "#eef3eb", stroke: "#556052" }),
    ...sticky(30, 95, "Who are we helping?", "#f7e07f"),
    ...sticky(240, 95, "What hurts today?", "#f7e07f"),
    ...labeledShape("rectangle", 480, 0, 460, 220, "Wild Ideas", { bg: "#fdf6df", stroke: "#b89f3b" }),
    ...sticky(510, 95, "No constraints!", "#f9d6c2"),
    ...sticky(720, 95, "10x simpler?", "#f9d6c2"),
    ...labeledShape("rectangle", 0, 240, 460, 220, "Top Picks (Vote!)", { bg: "#e6f0fa", stroke: "#4a6c8c" }),
    ...sticky(30, 335, "Quick win", "#bdd8f1"),
    ...labeledShape("rectangle", 480, 240, 460, 220, "Next Experiments", { bg: "#e3f2e1", stroke: "#4b7547" }),
    ...sticky(510, 335, "Owner + Week 1 test", "#c9e2b8"),
  ];
  return els;
}

function buildSwot(): TemplateElement[] {
  const cells = [
    { x: 0, y: 0, title: "Strengths", bg: "#dff0d8", card: "#c9e2b8", hint: "What we do best" },
    { x: 340, y: 0, title: "Weaknesses", bg: "#f9dede", card: "#f5c2c2", hint: "Internal gaps" },
    { x: 0, y: 260, title: "Opportunities", bg: "#d9ebf9", card: "#bdd8f1", hint: "External tailwinds" },
    { x: 340, y: 260, title: "Threats", bg: "#fdf2d6", card: "#f7e07f", hint: "Risks & blockers" },
  ];
  const els: TemplateElement[] = [heading(0, -45, "SWOT Analysis", 24)];
  for (const c of cells) {
    els.push(
      ...labeledShape("rectangle", c.x, c.y, 320, 240, "", { bg: c.bg, stroke: "#6c7666" }),
      ...labeledShape("rectangle", c.x + 12, c.y + 12, 296, 38, c.title, { bg: "#ffffff", stroke: "#556052" }),
      ...sticky(c.x + 24, c.y + 72, c.hint, c.card),
    );
  }
  return els;
}

function buildMindmap(): TemplateElement[] {
  return [
    heading(220, -45, "Mind Map", 24),
    ...labeledShape("ellipse", 280, 160, 200, 100, "Central Topic", {
      bg: "#f7e07f",
      stroke: "#8f7719",
      fontSize: 18,
    }),
    ...labeledShape("rectangle", 0, 20, 180, 76, "Branch 1", { bg: "#c9e2b8", stroke: "#4b7547" }),
    ...labeledShape("rectangle", 580, 20, 180, 76, "Branch 2", { bg: "#bdd8f1", stroke: "#4a6c8c" }),
    ...labeledShape("rectangle", 0, 320, 180, 76, "Branch 3", { bg: "#f5c2c2", stroke: "#9c4848" }),
    ...labeledShape("rectangle", 580, 320, 180, 76, "Branch 4", { bg: "#e2d4f0", stroke: "#6c538c" }),
    arrowBetween(290, 185, 185, 78),
    arrowBetween(470, 185, 575, 78),
    arrowBetween(290, 235, 185, 342),
    arrowBetween(470, 235, 575, 342),
  ];
}

function buildStoryMap(): TemplateElement[] {
  const activities = ["Discover", "Evaluate", "Purchase", "Onboard"];
  const els: TemplateElement[] = [heading(0, -45, "User Story Map", 24)];
  activities.forEach((act, col) => {
    const x = 140 + col * 200;
    els.push(
      ...labeledShape("rectangle", x, 0, 180, 56, act, { bg: "#3e4637", stroke: "#252b20", fontSize: 16 }),
    );
    els[els.length - 1].strokeColor = "#fff3b0";
    els.push(...sticky(x + 10, 86, `${act}: Core task`, "#bdd8f1"));
    els.push(...sticky(x + 10, 224, `Release 1 story`, "#f7e07f"));
    els.push(...sticky(x + 10, 362, `Release 2 stretch`, "#f5ebe0"));
  });
  els.push(
    ...labeledShape("rectangle", 0, 86, 120, 110, "Backbone", { bg: "#e6efe2", stroke: "#556052", fontSize: 14 }),
    ...labeledShape("rectangle", 0, 224, 120, 110, "Release 1\n(MVP)", { bg: "#fdf5d8", stroke: "#b89f3b", fontSize: 14 }),
    ...labeledShape("rectangle", 0, 362, 120, 110, "Release 2\n(Later)", { bg: "#f0f0f0", stroke: "#888888", fontSize: 14 }),
  );
  return els;
}

function buildFlowchart(): TemplateElement[] {
  return [
    heading(0, -45, "Flowchart Starter", 24),
    ...labeledShape("ellipse", 210, 0, 160, 72, "Start", { bg: "#c9e2b8", stroke: "#4b7547" }),
    arrowBetween(290, 76, 290, 126),
    ...labeledShape("rectangle", 180, 130, 220, 76, "Process Input", { bg: "#bdd8f1", stroke: "#4a6c8c" }),
    arrowBetween(290, 210, 290, 260),
    ...labeledShape("diamond", 200, 265, 180, 120, "Valid?", { bg: "#f7e07f", stroke: "#8f7719" }),
    arrowBetween(385, 325, 480, 325),
    arrowBetween(290, 390, 290, 450),
    ...labeledShape("rectangle", 485, 287, 170, 76, "Fix & Retry", { bg: "#f5c2c2", stroke: "#9c4848" }),
    ...labeledShape("ellipse", 210, 455, 160, 72, "Done", { bg: "#d9ead3", stroke: "#4b7547" }),
  ];
}

function buildWeekly(): TemplateElement[] {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const els: TemplateElement[] = [
    heading(0, -45, "Weekly Planning", 24),
    ...labeledShape("rectangle", 0, 0, 190, 360, "", { bg: "#fdf5d8", stroke: "#b89f3b" }),
    ...labeledShape("rectangle", 10, 10, 170, 38, "Top Priorities", { bg: "#ffffff", stroke: "#b89f3b" }),
    ...sticky(15, 68, "1. Ship milestone\n2. Review docs", "#f7e07f"),
  ];
  days.forEach((day, idx) => {
    const x = 210 + idx * 190;
    els.push(
      ...labeledShape("rectangle", x, 0, 175, 360, "", { bg: "#eef3eb", stroke: "#6c7666" }),
      ...labeledShape("rectangle", x + 10, 10, 155, 38, day, { bg: "#ffffff", stroke: "#556052" }),
      ...sticky(x + 8, 68, "Focus block", "#bdd8f1"),
    );
  });
  return els;
}

export const BUILTIN_TEMPLATES: BoardTemplate[] = [
  {
    id: "builtin-retro",
    slug: "retro",
    name: "Retrospective",
    category: "Team rituals",
    description: "Start / Stop / Continue / Action Items columns",
    source: "builtin",
    elements: buildRetro(),
  },
  {
    id: "builtin-kanban",
    slug: "kanban",
    name: "Kanban Board",
    category: "Workflow",
    description: "To Do / Doing / Done lanes with task stickies",
    source: "builtin",
    elements: buildKanban(),
  },
  {
    id: "builtin-brainstorm",
    slug: "brainstorm",
    name: "Brainstorm",
    category: "Ideation",
    description: "Problem, Wild Ideas, Top Picks & Next Experiments",
    source: "builtin",
    elements: buildBrainstorm(),
  },
  {
    id: "builtin-swot",
    slug: "swot",
    name: "SWOT Matrix",
    category: "Strategy",
    description: "Strengths, Weaknesses, Opportunities & Threats 2x2",
    source: "builtin",
    elements: buildSwot(),
  },
  {
    id: "builtin-mindmap",
    slug: "mindmap",
    name: "Mind Map",
    category: "Ideation",
    description: "Central topic with connected radial branches",
    source: "builtin",
    elements: buildMindmap(),
  },
  {
    id: "builtin-storymap",
    slug: "storymap",
    name: "User Story Map",
    category: "Product",
    description: "User journey backbone + Release 1 & Release 2 rows",
    source: "builtin",
    elements: buildStoryMap(),
  },
  {
    id: "builtin-flowchart",
    slug: "flowchart",
    name: "Flowchart Starter",
    category: "Diagrams",
    description: "Start, process step, decision diamond & retry branch",
    source: "builtin",
    elements: buildFlowchart(),
  },
  {
    id: "builtin-weekly",
    slug: "weekly",
    name: "Weekly Planning",
    category: "Team rituals",
    description: "Weekly priorities plus Mon–Fri focus columns",
    source: "builtin",
    elements: buildWeekly(),
  },
];
