/**
 * Unit tests for Multi-Model AI Agent parser, context extractor, and action executor.
 */

import { strict as assert } from "node:assert";
import * as Y from "yjs";
import {
  parseActionsFromResponse,
  cleanMessageText,
  executeAgentActions,
  extractBoardContext,
  normalizeStatus,
  normalizePriority,
} from "../src/ai";

async function main() {
  console.log("-> 1: Action schema parsing from LLM markdown response");
  const sampleLLMResponse = `
I have reviewed your request. I will create a new task and add two sticky notes.

\`\`\`json:actions
[
  {
    "type": "add_task",
    "title": "Build Auth API",
    "status": "TODO",
    "priority": "HIGH",
    "assignee": "nikoraasu",
    "subtasks": ["Add token endpoint", "Validate headers"]
  },
  {
    "type": "add_sticky",
    "text": "Remember to use Argon2 / PBKDF2",
    "color": "yellow"
  }
]
\`\`\`

Let me know if you need any adjustments.
`;

  const actions = parseActionsFromResponse(sampleLLMResponse);
  assert.equal(actions.length, 2, "Should parse 2 actions");
  assert.equal(actions[0].type, "add_task");
  if (actions[0].type === "add_task") {
    assert.equal(actions[0].title, "Build Auth API");
    assert.equal(actions[0].priority, "HIGH");
    assert.equal(actions[0].subtasks?.length, 2);
  }
  assert.equal(actions[1].type, "add_sticky");

  const cleaned = cleanMessageText(sampleLLMResponse);
  assert.ok(!cleaned.includes("json:actions"));
  assert.ok(cleaned.includes("I have reviewed your request."));
  assert.ok(cleaned.includes("Let me know if you need any adjustments."));
  console.log("ok 1: Action schema parsing from LLM markdown response");

  console.log("-> 2: Normalization helpers");
  assert.equal(normalizeStatus("IN_PROGRESS"), "in_progress");
  assert.equal(normalizeStatus("todo"), "todo");
  assert.equal(normalizeStatus("BACKLOG"), "backlog");
  assert.equal(normalizePriority("CRITICAL"), "critical");
  assert.equal(normalizePriority("high"), "high");
  console.log("ok 2: Normalization helpers");

  console.log("-> 3: Board context extraction");
  const doc = new Y.Doc();
  const elements = [
    {
      id: "el-1",
      type: "rectangle",
      customData: { isSticky: true },
      label: { text: "Brainstorming idea #1" },
    },
    {
      id: "frame-1",
      type: "frame",
      name: "Sprint Backlog",
    },
  ] as any[];

  const contextText = extractBoardContext(elements, doc);
  assert.ok(contextText.includes("Sprint Backlog"));
  assert.ok(contextText.includes("Brainstorming idea #1"));
  console.log("ok 3: Board context extraction");

  console.log("-> 4: Action execution engine against CRDT and canvas elements");
  const mockApi = {
    getSceneElements: () => [],
    getAppState: () => ({ scrollX: 0, scrollY: 0, width: 1200, height: 800 }),
    updateScene: (_payload: any) => {},
  } as any;

  const result = await executeAgentActions(actions, { doc, api: mockApi });
  assert.equal(result.executedCount, 2);
  const tasksMap = doc.getMap<any>("tasks");
  const storedTasks = Array.from(tasksMap.values());
  assert.equal(storedTasks.length, 3, "Parent task + 2 subtasks created");
  const parent = storedTasks.find(t => t.title === "Build Auth API");
  assert.ok(parent);
  assert.equal(parent.status, "todo");
  assert.equal(parent.priority, "high");
  console.log("ok 4: Action execution engine against CRDT and canvas elements");

  console.log("All AI parser and execution tests passed!");
}

main().catch((err) => {
  console.error("AI test failed:", err);
  process.exit(1);
});
