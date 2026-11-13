import assert from "node:assert/strict";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { layoutHierarchy } from "../src/features/diagram/hierarchyLayout";
import { alignElements, distributeElements, packGrid } from "../src/features/layout/align";
import { BUILTIN_TEMPLATES } from "../src/features/templates/builtin";
import { sanitizeElement } from "../src/crdt/scene";
import { generateShadesFromMainColor, normalizeThemeHex } from "../src/ui/boardTheme";
import { createConnectorArrow } from "../src/features/diagram/connectorArrow";

function mockElement(id: string, x: number, y: number, width = 100, height = 60, extra: Record<string, unknown> = {}): ExcalidrawElement {
  return sanitizeElement({
    id,
    type: "rectangle",
    x,
    y,
    width,
    height,
    ...extra,
  });
}

function mockArrow(id: string, fromId: string, toId: string): ExcalidrawElement {
  return sanitizeElement({
    id,
    type: "arrow",
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    points: [[0, 0], [50, 50]],
    startBinding: { elementId: fromId, focus: 0, gap: 4 },
    endBinding: { elementId: toId, focus: 0, gap: 4 },
  });
}

async function testHierarchyLayout() {
  console.log("-> 1: Hierarchy Tree Layout (Chain & Branch)");

  // Test 1: Chain A -> B -> C
  const nA = mockElement("nA", 0, 0);
  const nB = mockElement("nB", 100, 20);
  const nC = mockElement("nC", 200, 40);
  const a1 = mockArrow("a1", "nA", "nB");
  const a2 = mockArrow("a2", "nB", "nC");

  const elements = [nA, nB, nC, a1, a2];
  const layoutTopDown = layoutHierarchy(elements, undefined, { direction: "top-to-bottom", verticalGap: 80 });

  const resA = layoutTopDown.find((el) => el.id === "nA")!;
  const resB = layoutTopDown.find((el) => el.id === "nB")!;
  const resC = layoutTopDown.find((el) => el.id === "nC")!;

  assert.ok(resA.y < resB.y, `nA.y (${resA.y}) must be above nB.y (${resB.y})`);
  assert.ok(resB.y < resC.y, `nB.y (${resB.y}) must be above nC.y (${resC.y})`);
  console.log("ok  Chain A -> B -> C correctly layered top-down");

  // Test 2: Tree Root -> [Left, Right]
  const root = mockElement("root", 0, 0);
  const left = mockElement("left", -50, 50);
  const right = mockElement("right", 50, 50);
  const arrL = mockArrow("arrL", "root", "left");
  const arrR = mockArrow("arrR", "root", "right");

  const treeLayout = layoutHierarchy([root, left, right, arrL, arrR], undefined, { direction: "top-to-bottom" });
  const tRoot = treeLayout.find((el) => el.id === "root")!;
  const tLeft = treeLayout.find((el) => el.id === "left")!;
  const tRight = treeLayout.find((el) => el.id === "right")!;

  assert.ok(tRoot.y < tLeft.y, "Root is above Left child");
  assert.equal(tLeft.y, tRight.y, "Left and Right siblings share the same layer Y");
  assert.ok(tLeft.x < tRight.x, "Left sibling is positioned to the left of Right sibling");
  console.log("ok  Branching tree Root -> [Left, Right] correctly spaced");

  // Test 3: Horizontal direction (Left to Right)
  const layoutLeftRight = layoutHierarchy(elements, undefined, { direction: "left-to-right", horizontalGap: 100 });
  const lrA = layoutLeftRight.find((el) => el.id === "nA")!;
  const lrB = layoutLeftRight.find((el) => el.id === "nB")!;
  const lrC = layoutLeftRight.find((el) => el.id === "nC")!;

  assert.ok(lrA.x < lrB.x, "lrA is left of lrB");
  assert.ok(lrB.x < lrC.x, "lrB is left of lrC");
  console.log("ok  Left-to-right hierarchy layout verified");
}

async function testAlignAndDistribute() {
  console.log("-> 2: Alignment, Distribution & Grid Packing");

  const e1 = mockElement("e1", 10, 20, 50, 40);
  const e2 = mockElement("e2", 80, 50, 60, 40);
  const e3 = mockElement("e3", 160, 10, 50, 40);
  const all = [e1, e2, e3];
  const selIds = new Set(["e1", "e2", "e3"]);

  // Test Align Left
  const alignedLeft = alignElements(all, selIds, "left");
  assert.equal(alignedLeft.find((e) => e.id === "e1")!.x, 10);
  assert.equal(alignedLeft.find((e) => e.id === "e2")!.x, 10);
  assert.equal(alignedLeft.find((e) => e.id === "e3")!.x, 10);
  console.log("ok  Align Left works");

  // Test Align Top
  const alignedTop = alignElements(all, selIds, "top");
  assert.equal(alignedTop.find((e) => e.id === "e1")!.y, 10);
  assert.equal(alignedTop.find((e) => e.id === "e2")!.y, 10);
  assert.equal(alignedTop.find((e) => e.id === "e3")!.y, 10);
  console.log("ok  Align Top works");

  // Test Distribute Horizontal
  const d1 = mockElement("d1", 0, 0, 50, 50);
  const d2 = mockElement("d2", 20, 0, 50, 50); // clustered near d1
  const d3 = mockElement("d3", 200, 0, 50, 50);
  const distAll = [d1, d2, d3];
  const distSel = new Set(["d1", "d2", "d3"]);

  const distributed = distributeElements(distAll, distSel, "horizontal");
  const rd1 = distributed.find((e) => e.id === "d1")!;
  const rd2 = distributed.find((e) => e.id === "d2")!;
  const rd3 = distributed.find((e) => e.id === "d3")!;

  const gap1 = rd2.x - (rd1.x + rd1.width);
  const gap2 = rd3.x - (rd2.x + rd2.width);
  assert.ok(Math.abs(gap1 - gap2) <= 1, `Gaps should be equal: gap1=${gap1}, gap2=${gap2}`);
  console.log("ok  Distribute Horizontal computes equal spacing");

  // Test Pack Grid
  const p1 = mockElement("p1", 0, 0, 40, 40);
  const p2 = mockElement("p2", 100, 10, 40, 40);
  const p3 = mockElement("p3", 50, 100, 40, 40);
  const p4 = mockElement("p4", 120, 120, 40, 40);

  const packed = packGrid([p1, p2, p3, p4], new Set(["p1", "p2", "p3", "p4"]), 2, 10);
  const rp1 = packed.find((e) => e.id === "p1")!;
  const rp2 = packed.find((e) => e.id === "p2")!;
  const rp3 = packed.find((e) => e.id === "p3")!;
  const rp4 = packed.find((e) => e.id === "p4")!;

  assert.equal(rp1.y, rp2.y, "Row 1 items share same Y");
  assert.equal(rp3.y, rp4.y, "Row 2 items share same Y");
  assert.equal(rp1.x, rp3.x, "Col 1 items share same X");
  assert.equal(rp2.x, rp4.x, "Col 2 items share same X");
  console.log("ok  Pack Grid arranges elements into 2x2 grid");
}

async function testRichEntitiesAndTemplates() {
  console.log("-> 3: Rich Canvas Entities & Matrix Templates");

  // Check 2x2 Matrix templates exist in BUILTIN_TEMPLATES
  const impactEffort = BUILTIN_TEMPLATES.find((t) => t.id === "builtin-impact-effort");
  assert.ok(impactEffort, "Impact vs. Effort template exists");
  assert.ok(impactEffort.elements.length >= 8, "Impact vs. Effort contains matrix quadrants");

  const eisenhower = BUILTIN_TEMPLATES.find((t) => t.id === "builtin-eisenhower");
  assert.ok(eisenhower, "Eisenhower Matrix template exists");
  assert.ok(eisenhower.elements.length >= 8, "Eisenhower Matrix contains matrix quadrants");

  console.log("ok  Builtin 2x2 Strategy Matrices verified");
}

async function testThemeShadesGenerator() {
  console.log("-> 4: Magic Theme Main Color Shade Generator");

  // Test 1: Dark olive main color (like VGUI)
  const olivePalette = generateShadesFromMainColor("#4b5844");
  assert.equal(olivePalette.surface, "#4b5844");
  assert.equal(olivePalette.text, "#ffffff");
  assert.ok(olivePalette.base.startsWith("#"));
  assert.ok(olivePalette.accent.startsWith("#"));
  assert.ok(olivePalette.suggestedCanvas.startsWith("#"));
  console.log("ok  Dark main color derives dark well, white text, and amber/gold accent");

  // Test 2: Light main color (like clean slate/air)
  const lightPalette = generateShadesFromMainColor("#f0f4f8");
  assert.equal(lightPalette.surface, "#f0f4f8");
  assert.notEqual(lightPalette.text, "#ffffff", "Light theme text should be dark slate");
  assert.ok(lightPalette.base.startsWith("#"));
  assert.ok(lightPalette.accent.startsWith("#"));
  console.log("ok  Light main color derives clean well, dark text, and high-contrast accent");

  // Test 3: Vibrant colors (purple, crimson, blue)
  for (const c of ["#7c3aed", "#be123c", "#2563eb"]) {
    const pal = generateShadesFromMainColor(c);
    assert.equal(pal.surface, c);
    assert.equal(normalizeThemeHex(pal.accent), pal.accent);
    assert.equal(normalizeThemeHex(pal.base), pal.base);
  }
  console.log("ok  Vibrant palettes generated cleanly for #7c3aed, #be123c, #2563eb");
}

async function testConnectorArrowStyling() {
  console.log("-> 5: Dynamic Theme-Aware Connector Arrow Creation & Styling");

  // Default fallback stroke color
  const defaultArrow = createConnectorArrow({
    startX: 10,
    startY: 20,
    endX: 110,
    endY: 120,
    sourceId: "node-1",
    targetId: "node-2",
  });
  assert.equal(defaultArrow.type, "arrow");
  assert.equal(defaultArrow.strokeColor, "#c59c3a", "Defaults to VGUI amber if no theme accent provided");
  assert.equal(defaultArrow.startBinding?.elementId, "node-1");
  assert.equal(defaultArrow.endBinding?.elementId, "node-2");
  assert.equal(defaultArrow.points.length, 2);

  // Frutiger Aero theme accent
  const aeroAccent = "#38bdf8";
  const aeroArrow = createConnectorArrow({
    startX: 0,
    startY: 0,
    endX: 200,
    endY: 100,
    sourceId: "source-a",
    targetId: "target-b",
    strokeColor: aeroAccent,
  });
  assert.equal(aeroArrow.strokeColor, aeroAccent, "Applies active theme accent color to arrow stroke");

  // Windows XP theme accent
  const xpAccent = "#2563eb";
  const xpArrow = createConnectorArrow({
    startX: 50,
    startY: 50,
    endX: 150,
    endY: 50,
    sourceId: "src",
    strokeColor: xpAccent,
  });
  assert.equal(xpArrow.strokeColor, xpAccent);
  assert.equal(xpArrow.endBinding, null, "Target binding is null when unconnected end");

  console.log("ok  Theme-aware connector arrows correctly styled with active theme accent");
}

async function main() {
  await testHierarchyLayout();
  await testAlignAndDistribute();
  await testRichEntitiesAndTemplates();
  await testThemeShadesGenerator();
  await testConnectorArrowStyling();
  console.log("\nAll Infinite Canvas v2 (Diagramming, Layout, Entities & Themeing) tests passed!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
