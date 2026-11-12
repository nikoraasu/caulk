/**
 * Integration tests for the Caulk Headless Board CLI & Agent Tool.
 */

import { strict as assert } from "node:assert";
import { unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, runCLI, loadBoard } from "../src/cli/caulk";

const TEST_BOARD = resolve(".tmp/cli-test.slate");
const TEST_PASSPHRASE = "agent-secret-key-123";

async function main() {
  if (existsSync(TEST_BOARD)) {
    unlinkSync(TEST_BOARD);
  }

  console.log("-> 1: Test parseArgs options parsing");
  const opts = parseArgs([
    "add-task",
    "--file", TEST_BOARD,
    "--passphrase", TEST_PASSPHRASE,
    "--title", "CLI Test Task",
    "--status", "TODO",
    "--priority", "HIGH",
    "--assignee", "nikoraasu",
    "--subtasks", "Subtask 1,Subtask 2",
    "--sticky",
  ]);

  assert.equal(opts.command, "add-task");
  assert.equal(opts.file, TEST_BOARD);
  assert.equal(opts.title, "CLI Test Task");
  assert.equal(opts.status, "TODO");
  assert.equal(opts.priority, "HIGH");
  assert.equal(opts.assignee, "nikoraasu");
  assert.equal(opts.subtasks, "Subtask 1,Subtask 2");
  assert.equal(opts.sticky, true);
  console.log("ok 1: Test parseArgs options parsing");

  console.log("-> 2: CLI create new board and add task with subtasks & sticky");
  await runCLI([
    "add-task",
    "--file", TEST_BOARD,
    "--passphrase", TEST_PASSPHRASE,
    "--title", "Automated Agent Task",
    "--status", "IN_PROGRESS",
    "--priority", "CRITICAL",
    "--assignee", "claude-bot",
    "--subtasks", "Write code,Verify tests",
    "--sticky",
  ]);

  assert.equal(existsSync(TEST_BOARD), true, "Board file should exist on disk");
  const { doc } = await loadBoard(TEST_BOARD, TEST_PASSPHRASE);
  const tasksMap = doc.getMap<any>("tasks");
  const tasks = Array.from(tasksMap.values());
  assert.equal(tasks.length, 3, "Parent task + 2 subtasks should be stored in CRDT");

  const parent = tasks.find(t => t.title === "Automated Agent Task");
  assert.ok(parent, "Parent task must exist");
  assert.equal(parent.status, "in_progress");
  assert.equal(parent.priority, "critical");
  assert.deepEqual(parent.assignees, ["claude-bot"]);
  assert.equal(parent.subtaskIds.length, 2);

  const elementsMap = doc.getMap<any>("elements");
  assert.equal(elementsMap.size, 1, "Linked sticky note should exist in elementsMap");
  console.log("ok 2: CLI create new board and add task with subtasks & sticky");

  console.log("-> 3: CLI update task status");
  await runCLI([
    "update-task",
    "--file", TEST_BOARD,
    "--passphrase", TEST_PASSPHRASE,
    "--task", "Automated Agent Task",
    "--status", "DONE",
  ]);

  const { doc: docAfterUpdate } = await loadBoard(TEST_BOARD, TEST_PASSPHRASE);
  const updatedTasks = Array.from(docAfterUpdate.getMap<any>("tasks").values());
  const updatedParent = updatedTasks.find(t => t.title === "Automated Agent Task");
  assert.equal(updatedParent.status, "done", "Task status should be updated to done");
  console.log("ok 3: CLI update task status");

  console.log("-> 4: CLI add sticky note to whiteboard");
  await runCLI([
    "add-sticky",
    "--file", TEST_BOARD,
    "--passphrase", TEST_PASSPHRASE,
    "--text", "Autonomous sticky placed by external agent",
    "--color", "green",
  ]);

  const { doc: docAfterSticky } = await loadBoard(TEST_BOARD, TEST_PASSPHRASE);
  const elementsAfterSticky = Array.from(docAfterSticky.getMap<any>("elements").values());
  assert.equal(elementsAfterSticky.length, 2, "Should have 2 stickies now");
  const note = elementsAfterSticky.find(e => e.label?.text === "Autonomous sticky placed by external agent");
  assert.ok(note, "New sticky note should be found on canvas");
  assert.equal(note.backgroundColor, "#BBF7D0");
  console.log("ok 4: CLI add sticky note to whiteboard");

  console.log("-> 5: CLI set-theme and get-theme");
  await runCLI([
    "set-theme",
    "--file", TEST_BOARD,
    "--passphrase", TEST_PASSPHRASE,
    "--preset", "frutiger-aero",
  ]);

  const { doc: docAfterTheme } = await loadBoard(TEST_BOARD, TEST_PASSPHRASE);
  const themeRaw = docAfterTheme.getMap<string>("settings").get("boardTheme");
  assert.ok(themeRaw, "Board theme setting should be set in CRDT");
  const parsedTheme = JSON.parse(themeRaw!);
  assert.equal(parsedTheme.preset, "frutiger-aero");
  console.log("ok 5: CLI set-theme and get-theme");

  if (existsSync(TEST_BOARD)) {
    unlinkSync(TEST_BOARD);
  }

  console.log("All Caulk CLI & Headless Agent tests passed!");
}

main().catch((err) => {
  console.error("CLI test failed:", err);
  process.exit(1);
});
