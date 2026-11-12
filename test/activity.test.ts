import * as Y from "yjs";
import {
  recordActivity,
  listActivityEntries,
  subscribeToActivityLog,
  classifyElement,
  MAX_ACTIVITY_ENTRIES,
  SemanticActivityRecorder,
  type ActivityLogEntry,
} from "../src/history/activity";
import { createTask, updateTask, deleteTask } from "../src/features/tasks/store";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

console.log("-> 1: recordActivity and subscribeToActivityLog");
const doc = new Y.Doc();
let receivedEntries: ActivityLogEntry[] = [];
const unsub = subscribeToActivityLog(doc, (entries) => {
  receivedEntries = entries;
});

assert(receivedEntries.length === 0, "Initial entries should be empty");

recordActivity(doc, {
  userName: "Alice",
  action: "create",
  targetType: "sticky",
  title: "Created sticky note",
  detail: '"Sprint Planning"',
  point: { x: 100, y: 200 },
});

assert(receivedEntries.length === 1, "Expected 1 entry after recording");
assert(receivedEntries[0].userName === "Alice", "Expected author Alice");
assert(receivedEntries[0].action === "create", "Expected action create");
assert(receivedEntries[0].point?.x === 100, "Expected point x=100");
console.log("ok 1: recordActivity and subscribeToActivityLog");

console.log("-> 2: Capped ring buffer prunes oldest entries beyond limit");
doc.transact(() => {
  for (let i = 0; i < MAX_ACTIVITY_ENTRIES + 20; i++) {
    recordActivity(doc, {
      userName: `User_${i}`,
      action: "update_text",
      targetType: "text",
      title: `Edit ${i}`,
    });
  }
});

const allEntries = listActivityEntries(doc);
assert(
  allEntries.length <= MAX_ACTIVITY_ENTRIES,
  `Entries length ${allEntries.length} should not exceed MAX ${MAX_ACTIVITY_ENTRIES}`,
);
console.log("ok 2: Capped ring buffer prunes oldest entries beyond limit");

console.log("-> 3: Element classification");
const stickyEl: any = {
  id: "el-1",
  type: "rectangle",
  x: 50,
  y: 60,
  backgroundColor: "#FFF9D2",
  text: "Buy groceries",
  customData: { isSticky: true },
};
const classifiedSticky = classifyElement(stickyEl);
assert(classifiedSticky.targetType === "sticky", "Expected sticky targetType");
assert(classifiedSticky.text === "Buy groceries", "Expected text to match");

const taskEl: any = {
  id: "el-2",
  type: "rectangle",
  x: 100,
  y: 120,
  customData: { isTaskCard: true, taskId: "task-1", taskTitle: "Fix Auth" },
};
const classifiedTask = classifyElement(taskEl);
assert(classifiedTask.targetType === "task", "Expected task targetType");
assert(classifiedTask.text === "Fix Auth", "Expected taskTitle");

const frameEl: any = {
  id: "el-3",
  type: "frame",
  name: "Sprint 42",
  x: 0,
  y: 0,
};
const classifiedFrame = classifyElement(frameEl);
assert(classifiedFrame.targetType === "frame", "Expected frame targetType");
assert(classifiedFrame.text === "Sprint 42", "Expected frame name");
console.log("ok 3: Element classification");

console.log("-> 4: SemanticActivityRecorder element creation and deletion");
const doc2 = new Y.Doc();
let doc2Entries: ActivityLogEntry[] = [];
subscribeToActivityLog(doc2, (e) => {
  doc2Entries = e;
});

const recorder = new SemanticActivityRecorder(doc2, "Bob");

// Initial seed
recorder.seedInitialElements([stickyEl]);
assert(doc2Entries.length === 0, "Seeding initial elements must not create activity entries");

// Add a new element
const newCircle: any = {
  id: "el-circle",
  type: "ellipse",
  x: 200,
  y: 200,
};
recorder.onLocalElementsChange([stickyEl, newCircle]);
assert(doc2Entries.length === 1, "Adding circle should create 1 activity entry");
assert(doc2Entries[0].action === "create", "Expected create action");
assert(doc2Entries[0].title.includes("circle"), "Expected title to mention circle");

// Delete circle
recorder.onLocalElementsChange([stickyEl]);
assert(doc2Entries.length === 2, "Deleting circle should create deletion entry");
assert(doc2Entries[0].action === "delete", "Expected newest action to be delete");

recorder.dispose();
console.log("ok 4: SemanticActivityRecorder element creation and deletion");

console.log("-> 5: Tasks store activity logging integration");
const doc3 = new Y.Doc();
let doc3Entries: ActivityLogEntry[] = [];
subscribeToActivityLog(doc3, (e) => {
  doc3Entries = e;
});

// Create task
const task = createTask(
  doc3,
  { title: "Refactor Database Schema", priority: "high" },
  { id: "usr-1", name: "Charlie" },
);

assert(doc3Entries.length === 1, "Task creation should create activity entry");
assert(doc3Entries[0].userName === "Charlie", "Expected Charlie author");
assert(doc3Entries[0].title.includes("Created task"), "Expected task creation title");
assert(doc3Entries[0].detail?.includes("Refactor Database"), "Expected detail to have task title");

// Update task status
updateTask(
  doc3,
  task.id,
  { status: "in_progress" },
  { id: "usr-1", name: "Charlie" },
);

assert(doc3Entries.length === 2, "Task status update should create status change entry");
assert(doc3Entries[0].action === "task_status", "Expected action task_status");
assert(doc3Entries[0].detail?.includes("TODO ➔ IN_PROGRESS"), "Expected status transition in detail");

// Delete task
deleteTask(doc3, task.id);
assert(doc3Entries.length === 3, "Task deletion should create activity entry");
assert(doc3Entries[0].action === "delete", "Expected delete action");

unsub();
console.log("All activity log and expanded history tests passed!");
