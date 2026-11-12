import assert from "node:assert/strict";
import * as Y from "yjs";
import {
  createTask,
  createSubtask,
  updateTask,
  deleteTask,
  convertElementToTask,
  calculateParentProgress,
  isTaskBlocked,
  listTasks,
  getTask,
  subscribeToTasks,
  createSprint,
  updateSprint,
  deleteSprint,
  listSprints,
  subscribeToSprints,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  listMilestones,
  subscribeToMilestones,
  listAutomationRules,
  toggleAutomationRule,
  setMemberRole,
  addMember,
  removeMember,
  syncRepoCollaborators,
  getMember,
  listMembers,
  addCustomRole,
  listCustomRoles,
  deleteCustomRole,
} from "../src/features/tasks/store";

function runTests() {
  const doc = new Y.Doc();

  // 1. Task Creation & Key Auto-Increment
  const task1 = createTask(doc, {
    title: "Implement Auth Flow",
    description: "JWT and Session management",
    status: "todo",
    priority: "high",
    assignees: ["Alice"],
    roles: { Alice: "Backend Developer" },
  });

  assert.equal(task1.key, "CLK-1");
  assert.equal(task1.title, "Implement Auth Flow");
  assert.equal(task1.status, "todo");
  assert.equal(task1.priority, "high");
  assert.equal(task1.roles["Alice"], "Backend Developer");

  const task2 = createTask(doc, {
    title: "Design Landing Page",
    type: "story",
    priority: "medium",
    category: "Design",
    assignees: ["Dan"],
  });
  assert.equal(task2.key, "CLK-2");
  // Automation: Category "Design" automatically assigned role "Designer" to Dan
  assert.equal(task2.roles["Dan"], "Designer");

  // 2. Task Updates & Activity Logging
  const updated1 = updateTask(doc, task1.id, { status: "in_progress" });
  assert.ok(updated1);
  assert.equal(updated1?.status, "in_progress");
  assert.equal(getTask(doc, task1.id)?.status, "in_progress");
  assert.ok(updated1.activity.length >= 2, "Status change should be recorded in activity log");
  assert.equal(updated1.activity[1].action, "status_change");

  // 3. Parent / Subtask Hierarchy & Automation
  const sub1 = createTask(doc, {
    title: "Database schema migration",
    parentId: task1.id,
    status: "todo",
  });
  const sub2 = createTask(doc, {
    title: "API endpoints",
    parentId: task1.id,
    status: "todo",
  });

  const refreshedParent = getTask(doc, task1.id);
  assert.ok(refreshedParent);
  assert.deepEqual(refreshedParent?.subtaskIds, [sub1.id, sub2.id]);

  // Check progress calculation
  const allTasks = listTasks(doc);
  const prog1 = calculateParentProgress(refreshedParent!, allTasks);
  assert.equal(prog1.total, 2);
  assert.equal(prog1.done, 0);
  assert.equal(prog1.percentage, 0);

  // Mark first subtask done
  updateTask(doc, sub1.id, { status: "done" });
  const prog2 = calculateParentProgress(getTask(doc, task1.id)!, listTasks(doc));
  assert.equal(prog2.done, 1);
  assert.equal(prog2.percentage, 50);

  // Automation: When all subtasks are done, parent task auto-completes to "done"
  updateTask(doc, sub2.id, { status: "done" });
  const autoCompletedParent = getTask(doc, task1.id);
  assert.equal(autoCompletedParent?.status, "done", "Parent task must auto-complete when all subtasks reach done");

  // 4. Task Dependencies & Blocked State Detection
  const depTaskA = createTask(doc, { title: "API Gateway", status: "in_progress" });
  const depTaskB = createTask(doc, {
    title: "Frontend Dashboard",
    status: "todo",
    dependencies: { blocks: [], blockedBy: [depTaskA.id], relatesTo: [] },
  });

  const blockedCheck1 = isTaskBlocked(depTaskB, listTasks(doc));
  assert.equal(blockedCheck1.isBlocked, true);
  assert.deepEqual(blockedCheck1.blockedByKeys, [depTaskA.key]);

  // Once blocker is finished, task is no longer blocked
  updateTask(doc, depTaskA.id, { status: "done" });
  const blockedCheck2 = isTaskBlocked(getTask(doc, depTaskB.id)!, listTasks(doc));
  assert.equal(blockedCheck2.isBlocked, false);

  // 5. Whiteboard Element Conversion to Task
  const fakeSticky: any = {
    id: "sticky-elem-99",
    type: "rectangle",
    customData: { isSticky: true, text: "Refactor WebSocket handler\nNeeds retry backoff" },
  };

  const converted = convertElementToTask(doc, fakeSticky, { id: "dev-1", name: "Bob" });
  assert.equal(converted.title, "Refactor WebSocket handler");
  assert.equal(converted.description, "Needs retry backoff");
  assert.deepEqual(converted.linkedElementIds, ["sticky-elem-99"]);

  // 6. Sprints CRDT Operations
  let sprintNotifyCount = 0;
  const unsubSprint = subscribeToSprints(doc, () => sprintNotifyCount++);
  const sprint1 = createSprint(doc, { name: "Sprint 42", goal: "Launch Task Hub" });
  assert.equal(sprint1.name, "Sprint 42");
  assert.equal(sprint1.status, "planning");
  assert.equal(listSprints(doc).length, 1);

  updateSprint(doc, sprint1.id, { status: "active" });
  assert.equal(listSprints(doc)[0].status, "active");

  deleteSprint(doc, sprint1.id);
  assert.equal(listSprints(doc).length, 0);
  assert.ok(sprintNotifyCount >= 2);
  unsubSprint();

  // 7. Milestones CRDT Operations
  let milestoneNotifyCount = 0;
  const unsubMs = subscribeToMilestones(doc, () => milestoneNotifyCount++);
  const ms1 = createMilestone(doc, { title: "v1.0 Public Beta", targetDate: Date.now() + 86400000 * 30 });
  assert.equal(ms1.title, "v1.0 Public Beta");
  assert.equal(listMilestones(doc).length, 1);

  updateMilestone(doc, ms1.id, { description: "Release on ProductHunt" });
  assert.equal(listMilestones(doc)[0].description, "Release on ProductHunt");

  deleteMilestone(doc, ms1.id);
  assert.equal(listMilestones(doc).length, 0);
  assert.ok(milestoneNotifyCount >= 2);
  unsubMs();

  // 8. Automation Rules
  const rules = listAutomationRules(doc);
  assert.ok(rules.length >= 4);
  assert.equal(rules.find((r) => r.id === "rule-parent-complete")?.enabled, true);

  toggleAutomationRule(doc, "rule-parent-complete", false);
  assert.equal(listAutomationRules(doc).find((r) => r.id === "rule-parent-complete")?.enabled, false);

  // 9. Subscription to live Yjs changes
  let notifyCount = 0;
  let latestCount = 0;
  const unsubscribe = subscribeToTasks(doc, (currentTasks) => {
    notifyCount++;
    latestCount = currentTasks.length;
  });

  const currentCount = listTasks(doc).length;
  createTask(doc, { title: "Another Task" });
  assert.equal(latestCount, currentCount + 1);
  assert.ok(notifyCount >= 2);
  unsubscribe();

  // 10. Multi-client CRDT sync convergence
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  createTask(docA, { id: "t-sync-1", title: "Task on Client A", status: "todo" });
  createTask(docB, { id: "t-sync-2", title: "Task on Client B", status: "review" });

  const updateA = Y.encodeStateAsUpdate(docA);
  const updateB = Y.encodeStateAsUpdate(docB);

  Y.applyUpdate(docB, updateA);
  Y.applyUpdate(docA, updateB);

  assert.equal(listTasks(docA).length, 2);
  assert.equal(listTasks(docB).length, 2);
  assert.deepEqual(getTask(docA, "t-sync-1")?.title, getTask(docB, "t-sync-1")?.title);
  assert.deepEqual(getTask(docA, "t-sync-2")?.status, getTask(docB, "t-sync-2")?.status);

  // 11. createSubtask explicit helper & hierarchical keys
  const parentTask = createTask(doc, { title: "Parent Feature Task" });
  const subtaskA = createSubtask(doc, parentTask.id, { title: "Subtask Step 1", status: "todo" });
  assert.equal(subtaskA.key, `${parentTask.key}-1`);
  assert.equal(subtaskA.parentId, parentTask.id);
  assert.equal(getTask(doc, subtaskA.id)?.title, "Subtask Step 1");
  const subtaskB = createSubtask(doc, parentTask.id, { title: "Subtask Step 2", status: "todo" });
  assert.equal(subtaskB.key, `${parentTask.key}-2`);
  const updatedParent = getTask(doc, parentTask.id);
  assert.ok(updatedParent?.subtaskIds.includes(subtaskA.id));
  assert.ok(updatedParent?.subtaskIds.includes(subtaskB.id));

  // 12. Persistent Team Member Roles & Custom Roles
  setMemberRole(doc, "Charlie", "Security Engineer");
  const charlie = getMember(doc, "Charlie");
  assert.equal(charlie?.role, "Security Engineer");
  const allMembers = listMembers(doc);
  assert.ok(allMembers.some((m) => m.name === "Charlie" && m.role === "Security Engineer"));

  // Add Member helper
  const added = addMember(doc, { name: "octocat", role: "DevOps", isRepoCollaborator: true });
  assert.equal(added.name, "octocat");
  assert.equal(added.role, "DevOps");
  assert.equal(added.avatarUrl, "https://github.com/octocat.png");
  assert.equal(added.isRepoCollaborator, true);

  // Sync Repo Collaborators
  syncRepoCollaborators(doc, [
    { login: "nikoraasu", role: "Owner" },
    { login: "sarah", role: "Collaborator", avatarUrl: "https://avatars.example.com/sarah" },
  ]);
  const nikoraasuMember = getMember(doc, "nikoraasu");
  assert.ok(nikoraasuMember);
  assert.equal(nikoraasuMember?.isRepoCollaborator, true);
  assert.equal(nikoraasuMember?.avatarUrl, "https://github.com/nikoraasu.png");
  assert.equal(nikoraasuMember?.repoRole, "Owner");

  const sarahMember = getMember(doc, "sarah");
  assert.ok(sarahMember);
  assert.equal(sarahMember?.avatarUrl, "https://avatars.example.com/sarah");

  // Remove Member
  removeMember(doc, "octocat");
  assert.equal(getMember(doc, "octocat"), undefined);

  // Task created with assignee Charlie inherits persisted role
  const charlieTask = createTask(doc, { title: "Penetration Test", assignees: ["Charlie"] });
  assert.equal(charlieTask.roles["Charlie"], "Security Engineer");

  // Custom Roles management
  const customRole = addCustomRole(doc, { name: "Cloud Architect", icon: "☁️", color: "#6366f1" });
  assert.equal(customRole.name, "Cloud Architect");
  const rolesList = listCustomRoles(doc);
  assert.ok(rolesList.some((r) => r.name === "Cloud Architect"));

  deleteCustomRole(doc, customRole.id);
  assert.equal(listCustomRoles(doc).some((r) => r.id === customRole.id), false);

  // 13. Sticky Element Tag & Hashtag Extraction to Task Labels
  const taggedSticky: any = {
    id: "sticky-elem-tags",
    type: "rectangle",
    customData: {
      isSticky: true,
      text: "Optimize DB queries #backend #database\nSlow query logs attached",
      tags: ["urgent", "db"],
    },
  };
  const convertedTagged = convertElementToTask(doc, taggedSticky, { id: "dev-2", name: "Eve" });
  assert.ok(convertedTagged.labels.includes("backend"));
  assert.ok(convertedTagged.labels.includes("database"));
  assert.ok(convertedTagged.labels.includes("urgent"));
  assert.ok(convertedTagged.labels.includes("db"));

  console.log("ok  all task CRDT, automation, and sync checks passed");
}

runTests();
