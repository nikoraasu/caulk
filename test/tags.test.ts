import assert from "node:assert/strict";
import {
  addTagToElement,
  aiClusterExisting,
  clusterByColor,
  clusterByTag,
  extractHashtags,
  findStickyItems,
  getElementTags,
  getTagColor,
  normalizeTag,
  removeTagFromElement,
  tidyGrid,
} from "../src/features/tags/store";

function runTests() {
  // 1. Tag Normalization & Extraction
  assert.equal(normalizeTag("#frontend"), "frontend");
  assert.equal(normalizeTag("##P0!"), "P0");
  assert.equal(normalizeTag("  #design-system  "), "design-system");

  const hashtags = extractHashtags("Refactor login flow #auth #security and #auth again!");
  assert.deepEqual(hashtags, ["auth", "security"]);

  // 2. Tag Colors
  const col1 = getTagColor("frontend");
  const col2 = getTagColor("frontend");
  assert.equal(col1.bg, col2.bg, "Identical tags must get identical color");
  assert.ok(col1.bg.startsWith("#"));
  assert.ok(col1.text.startsWith("#"));

  // 3. CustomData Tags & Merging
  let el: any = {
    id: "rect-1",
    type: "rectangle",
    version: 1,
    customData: { isSticky: true },
    text: "Fix button padding #ui",
  };

  const initialTags = getElementTags(el);
  assert.deepEqual(initialTags, ["ui"]);

  el = addTagToElement(el, "urgent");
  assert.equal(el.version, 2);
  assert.deepEqual(getElementTags(el), ["urgent", "ui"]);

  // No duplicate adding
  el = addTagToElement(el, "urgent");
  assert.equal(el.version, 2);

  el = removeTagFromElement(el, "urgent");
  assert.equal(el.version, 3);
  assert.deepEqual(getElementTags(el), ["ui"]);

  // 4. findStickyItems
  const boundText = {
    id: "text-1",
    type: "text",
    containerId: "rect-1",
    text: "Hello World #vgui",
    x: 10,
    y: 10,
    version: 1,
  };
  const elements = [el, boundText];
  const items = findStickyItems(elements);
  assert.equal(items.length, 1);
  assert.equal(items[0].text, "Hello World #vgui");
  assert.deepEqual(items[0].tags, ["vgui"]);

  // 5. Tidy Grid
  const mockItems = [
    {
      container: { id: "c1", x: 100, y: 100, width: 160, height: 160, version: 1 },
      textElement: { id: "t1", x: 110, y: 110, version: 1 },
      text: "Note 1",
      tags: ["frontend"],
      color: "#c4b550",
      width: 160,
      height: 160,
      x: 100,
      y: 100,
    },
    {
      container: { id: "c2", x: 450, y: 80, width: 160, height: 160, version: 1 },
      textElement: { id: "t2", x: 460, y: 90, version: 1 },
      text: "Note 2",
      tags: ["backend"],
      color: "#6b8e23",
      width: 160,
      height: 160,
      x: 450,
      y: 80,
    },
  ];

  const tidyRes = tidyGrid(mockItems, { columnsPerGroup: 2, gapX: 20, gapY: 20 });
  assert.equal(tidyRes.updatedElements.length, 4); // 2 containers + 2 text elements
  const c1 = tidyRes.updatedElements.find((e) => e.id === "c1");
  const t1 = tidyRes.updatedElements.find((e) => e.id === "t1");
  assert.ok(c1);
  assert.ok(t1);
  assert.equal(t1.x - c1.x, 10, "Text offset relative to container must be preserved");

  // 6. Cluster by Tag
  const tagRes = clusterByTag(mockItems, { createFrames: true });
  assert.equal(tagRes.newFrames.length, 2, "Should create a frame for frontend and backend");
  assert.ok(tagRes.newFrames[0].customData.frameTitle.includes("#"));

  // 7. Cluster by Color
  const colRes = clusterByColor(mockItems, { createFrames: true });
  assert.equal(colRes.newFrames.length, 2);
  assert.ok(colRes.newFrames.some((f) => f.customData.frameTitle.includes("Gold")));
  assert.ok(colRes.newFrames.some((f) => f.customData.frameTitle.includes("Sage")));

  // 8. AI Cluster Existing
  const aiRes = aiClusterExisting(
    mockItems,
    [
      { category: "Client Side", stickies: ["Note 1"] },
      { category: "Server Side", stickies: ["Note 2"] },
    ],
    { createFrames: true },
  );
  assert.equal(aiRes.newFrames.length, 2);
  assert.ok(aiRes.newFrames.some((f) => f.customData.frameTitle.includes("Client Side")));
  assert.ok(aiRes.newFrames.some((f) => f.customData.frameTitle.includes("Server Side")));

  console.log("ok  all tags and clustering unit tests passed");
}

runTests();
