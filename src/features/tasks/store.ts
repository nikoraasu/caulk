import type * as Y from "yjs";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  TaskRecord,
  TaskStatus,
  SprintRecord,
  MilestoneRecord,
  ActivityLogEntry,
  AutomationRule,
  MemberRecord,
  CustomRoleRecord,
} from "./types";
import { recordActivity } from "../../history/activity";

export const TASKS_MAP_KEY = "tasks";
export const SPRINTS_MAP_KEY = "sprints";
export const MILESTONES_MAP_KEY = "milestones";
export const AUTOMATION_RULES_MAP_KEY = "task_automations";
export const MEMBERS_MAP_KEY = "project_members";
export const CUSTOM_ROLES_MAP_KEY = "project_roles";

export const DEFAULT_PROJECT_ROLES: CustomRoleRecord[] = [
  { id: "role-frontend", name: "Frontend Developer", icon: "💻", color: "#3182ce", isDefault: true },
  { id: "role-backend", name: "Backend Developer", icon: "⚙️", color: "#805ad5", isDefault: true },
  { id: "role-fullstack", name: "Full-stack Developer", icon: "🚀", color: "#2b6cb0", isDefault: true },
  { id: "role-designer", name: "Designer", icon: "🎨", color: "#d69e2e", isDefault: true },
  { id: "role-qa", name: "QA", icon: "🧪", color: "#38a169", isDefault: true },
  { id: "role-pm", name: "Project Manager", icon: "📋", color: "#dd6b20", isDefault: true },
  { id: "role-po", name: "Product Owner", icon: "👑", color: "#e53e3e", isDefault: true },
  { id: "role-devops", name: "DevOps", icon: "☁️", color: "#4a5568", isDefault: true },
  { id: "role-collab", name: "Collaborator", icon: "👥", color: "#718096", isDefault: true },
];

export const DEFAULT_AUTOMATION_RULES: AutomationRule[] = [
  {
    id: "rule-parent-complete",
    name: "Auto-complete parent when all subtasks are Done",
    enabled: true,
    trigger: "all_subtasks_completed",
    action: "set_parent_done",
  },
  {
    id: "rule-notify-qa",
    name: "Notify QA when task enters Review",
    enabled: true,
    trigger: "status_changed_to_review",
    action: "notify_qa",
  },
  {
    id: "rule-deadline-warn",
    name: "Warn assignees about approaching deadlines (< 24h)",
    enabled: true,
    trigger: "deadline_approaching",
    action: "ping_assignees",
  },
  {
    id: "rule-category-role",
    name: "Auto-assign roles based on task category (e.g. Design -> Designer, QA -> QA)",
    enabled: true,
    trigger: "task_created",
    action: "assign_role_by_category",
  },
];

export function getTasksMap(doc: Y.Doc): Y.Map<TaskRecord> {
  return doc.getMap<TaskRecord>(TASKS_MAP_KEY);
}

export function getSprintsMap(doc: Y.Doc): Y.Map<SprintRecord> {
  return doc.getMap<SprintRecord>(SPRINTS_MAP_KEY);
}

export function getMilestonesMap(doc: Y.Doc): Y.Map<MilestoneRecord> {
  return doc.getMap<MilestoneRecord>(MILESTONES_MAP_KEY);
}

export function getAutomationRulesMap(doc: Y.Doc): Y.Map<AutomationRule> {
  return doc.getMap<AutomationRule>(AUTOMATION_RULES_MAP_KEY);
}

export function getMembersMap(doc: Y.Doc): Y.Map<MemberRecord> {
  return doc.getMap<MemberRecord>(MEMBERS_MAP_KEY);
}

export function getCustomRolesMap(doc: Y.Doc): Y.Map<CustomRoleRecord> {
  return doc.getMap<CustomRoleRecord>(CUSTOM_ROLES_MAP_KEY);
}

/* ==========================================================================
   Tasks Operations
   ========================================================================== */

export function listTasks(doc: Y.Doc): TaskRecord[] {
  const map = getTasksMap(doc);
  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function getTask(doc: Y.Doc, id: string): TaskRecord | undefined {
  return getTasksMap(doc).get(id);
}

export function getNextTaskKey(doc: Y.Doc): string {
  const tasks = listTasks(doc);
  let maxNum = 0;
  for (const t of tasks) {
    const match = t.key.match(/^CLK-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  return `CLK-${maxNum + 1}`;
}

export function createTask(
  doc: Y.Doc,
  partial: Partial<TaskRecord>,
  user?: { id: string; name: string },
): TaskRecord {
  const map = getTasksMap(doc);
  const now = Date.now();
  const id = partial.id || `task-${now}-${Math.random().toString(36).slice(2, 7)}`;
  const key = partial.key || getNextTaskKey(doc);

  const initialActivity: ActivityLogEntry = {
    id: `act-${now}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    userId: user?.id || "anonymous",
    userName: user?.name || "Anonymous",
    action: "created",
    details: { description: `Task ${key} created` },
  };

  const initialRoles = { ...(partial.roles || {}) };
  // Check persisted member roles first
  const membersMap = getMembersMap(doc);
  for (const a of partial.assignees || (user?.name ? [user.name] : [])) {
    if (!initialRoles[a]) {
      const savedMember = membersMap.get(a);
      if (savedMember?.role) {
        initialRoles[a] = savedMember.role;
      }
    }
  }

  // Automation: Auto-assign role based on category if enabled and still unassigned
  if (partial.category) {
    const cat = partial.category.toLowerCase();
    for (const a of partial.assignees || (user?.name ? [user.name] : [])) {
      if (!initialRoles[a]) {
        if (cat.includes("design") || cat.includes("ux") || cat.includes("ui")) {
          initialRoles[a] = "Designer";
        } else if (cat.includes("qa") || cat.includes("test") || cat.includes("bug")) {
          initialRoles[a] = "QA";
        } else if (cat.includes("back") || cat.includes("api") || cat.includes("server")) {
          initialRoles[a] = "Backend Developer";
        } else if (cat.includes("front") || cat.includes("web")) {
          initialRoles[a] = "Frontend Developer";
        }
      }
    }
  }

  const record: TaskRecord = {
    id,
    key,
    type: partial.type || "task",
    title: partial.title || "Untitled Task",
    description: partial.description || "",
    status: partial.status || "todo",
    priority: partial.priority || "medium",
    assignees: partial.assignees || (user?.name ? [user.name] : []),
    roles: initialRoles,
    startDate: partial.startDate,
    dueDate: partial.dueDate,
    estimatedHours: partial.estimatedHours,
    loggedHours: partial.loggedHours,
    labels: partial.labels || [],
    category: partial.category,
    parentId: partial.parentId,
    subtaskIds: partial.subtaskIds || [],
    dependencies: partial.dependencies || { blocks: [], blockedBy: [], relatesTo: [] },
    sprintId: partial.sprintId,
    milestoneId: partial.milestoneId,
    bugDetails: partial.bugDetails,
    comments: partial.comments || [],
    activity: partial.activity ? [...partial.activity, initialActivity] : [initialActivity],
    linkedElementIds: partial.linkedElementIds || [],
    canvasCardElementId: partial.canvasCardElementId,
    createdAt: partial.createdAt || now,
    updatedAt: now,
  };

  doc.transact(() => {
    map.set(id, record);
    // If parentId exists, register as subtask of parent
    if (record.parentId) {
      const parent = map.get(record.parentId);
      if (parent && !parent.subtaskIds.includes(id)) {
        map.set(record.parentId, {
          ...parent,
          subtaskIds: [...parent.subtaskIds, id],
          updatedAt: now,
        });
      }
    }
  });

  try {
    recordActivity(doc, {
      userName: user?.name || "Anonymous",
      action: "create",
      targetType: "task",
      targetId: id,
      title: `Created task ${key}`,
      detail: `"${record.title}"`,
    });
  } catch {}

  return record;
}

export function updateTask(
  doc: Y.Doc,
  taskId: string,
  updates: Partial<TaskRecord>,
  user?: { id: string; name: string },
): TaskRecord | undefined {
  const map = getTasksMap(doc);
  const existing = map.get(taskId);
  if (!existing) {
    if (updates.title || updates.parentId) {
      return createTask(doc, { ...updates, id: taskId }, user);
    }
    return undefined;
  }

  const now = Date.now();
  const activities: ActivityLogEntry[] = [...existing.activity];

  if (updates.status && updates.status !== existing.status) {
    activities.push({
      id: `act-${now}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      userId: user?.id || "anonymous",
      userName: user?.name || "Anonymous",
      action: "status_change",
      details: { from: existing.status, to: updates.status, field: "status" },
    });
  }

  if (updates.priority && updates.priority !== existing.priority) {
    activities.push({
      id: `act-${now}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      userId: user?.id || "anonymous",
      userName: user?.name || "Anonymous",
      action: "priority_change",
      details: { from: existing.priority, to: updates.priority, field: "priority" },
    });
  }

  const updated: TaskRecord = {
    ...existing,
    ...updates,
    activity: activities,
    updatedAt: now,
  };

  doc.transact(() => {
    map.set(taskId, updated);

    // Automation: if this is a subtask and all subtasks of parent are now "done",
    // auto-complete parent task (unless manual override)
    if (updated.parentId && updates.status) {
      const parent = map.get(updated.parentId);
      if (parent && parent.subtaskIds.length > 0) {
        const subtasks = parent.subtaskIds.map((sid) => map.get(sid)).filter(Boolean) as TaskRecord[];
        const allDone = subtasks.length > 0 && subtasks.every((s) => s.status === "done");
        if (allDone && parent.status !== "done") {
          map.set(parent.id, {
            ...parent,
            status: "done" as TaskStatus,
            updatedAt: now,
            activity: [
              ...parent.activity,
              {
                id: `act-${now}-${Math.random().toString(36).slice(2, 6)}`,
                timestamp: now,
                userId: "automation",
                userName: "Workflow Automation",
                action: "status_change",
                details: {
                  from: parent.status,
                  to: "done",
                  description: "Automatically completed: all subtasks finished",
                },
              },
            ],
          });
        }
      }
    }
  });

  try {
    if (updates.status && updates.status !== existing.status) {
      recordActivity(doc, {
        userName: user?.name || "Anonymous",
        action: "task_status",
        targetType: "task",
        targetId: taskId,
        title: `Moved task ${existing.key}`,
        detail: `${existing.status.toUpperCase()} ➔ ${updates.status.toUpperCase()}`,
      });
    } else if (updates.title && updates.title !== existing.title) {
      recordActivity(doc, {
        userName: user?.name || "Anonymous",
        action: "update_text",
        targetType: "task",
        targetId: taskId,
        title: `Renamed task ${existing.key}`,
        detail: `"${updates.title}"`,
      });
    }
  } catch {}

  return updated;
}

export function deleteTask(doc: Y.Doc, taskId: string): boolean {
  const map = getTasksMap(doc);
  const existing = map.get(taskId);
  if (!existing) return false;

  doc.transact(() => {
    // Clean up subtask references from parent
    if (existing.parentId) {
      const parent = map.get(existing.parentId);
      if (parent) {
        map.set(parent.id, {
          ...parent,
          subtaskIds: parent.subtaskIds.filter((sid) => sid !== taskId),
          updatedAt: Date.now(),
        });
      }
    }
    map.delete(taskId);
  });

  try {
    recordActivity(doc, {
      userName: "Anonymous",
      action: "delete",
      targetType: "task",
      targetId: taskId,
      title: `Deleted task ${existing.key}`,
      detail: `"${existing.title}"`,
    });
  } catch {}

  return true;
}

export function convertElementToTask(
  doc: Y.Doc,
  element: ExcalidrawElement,
  user?: { id: string; name: string },
): TaskRecord {
  // Extract text from element if available
  let title = "Whiteboard Task";
  let description = "";

  const customData = (element.customData as Record<string, unknown> | undefined) ?? {};
  if (typeof customData.text === "string" && customData.text.trim()) {
    const lines = customData.text.trim().split("\n");
    title = lines[0].slice(0, 100);
    if (lines.length > 1) description = lines.slice(1).join("\n");
  } else if (element.type === "text" && "text" in element) {
    const lines = String((element as unknown as { text: string }).text).trim().split("\n");
    title = lines[0].slice(0, 100);
    if (lines.length > 1) description = lines.slice(1).join("\n");
  }

  // Connect whiteboard sticky tags to task labels
  const extractedTags: string[] = [];
  if (Array.isArray(customData.tags)) {
    for (const t of customData.tags) {
      if (typeof t === "string" && t.trim()) {
        const clean = t.trim().replace(/^#+/, "");
        if (clean && !extractedTags.includes(clean)) extractedTags.push(clean);
      }
    }
  }
  const textContent = `${title}\n${description}`;
  const hashtagMatches = textContent.match(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu);
  if (hashtagMatches) {
    for (const raw of hashtagMatches) {
      const tag = raw.trim().replace(/^#+/, "");
      if (tag && !extractedTags.includes(tag)) extractedTags.push(tag);
    }
  }

  const task = createTask(
    doc,
    {
      title,
      description,
      linkedElementIds: [element.id],
      status: "todo",
      priority: "medium",
      labels: extractedTags,
    },
    user,
  );

  return task;
}

export function createSubtask(
  doc: Y.Doc,
  parentId: string,
  partial: Partial<TaskRecord>,
  user?: { id: string; name: string },
): TaskRecord {
  const parent = getTask(doc, parentId);
  const subCount = parent?.subtaskIds?.length || 0;
  const key = parent ? `${parent.key}-${subCount + 1}` : getNextTaskKey(doc);
  return createTask(
    doc,
    {
      ...partial,
      key,
      parentId,
      priority: partial.priority || parent?.priority || "medium",
      sprintId: partial.sprintId ?? parent?.sprintId,
      milestoneId: partial.milestoneId ?? parent?.milestoneId,
    },
    user,
  );
}

export function calculateParentProgress(
  task: TaskRecord,
  allTasks: TaskRecord[],
): { total: number; done: number; percentage: number } {
  if (!task.subtaskIds || task.subtaskIds.length === 0) {
    return {
      total: 1,
      done: task.status === "done" ? 1 : 0,
      percentage: task.status === "done" ? 100 : 0,
    };
  }

  const subtasks = allTasks.filter((t) => task.subtaskIds.includes(t.id));
  const total = subtasks.length;
  const done = subtasks.filter((t) => t.status === "done").length;
  const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

  return { total, done, percentage };
}

export function isTaskBlocked(
  task: TaskRecord,
  allTasks: TaskRecord[],
): { isBlocked: boolean; blockedByKeys: string[] } {
  if (!task.dependencies?.blockedBy || task.dependencies.blockedBy.length === 0) {
    return { isBlocked: false, blockedByKeys: [] };
  }

  const blockedByTasks = allTasks.filter(
    (t) => task.dependencies.blockedBy.includes(t.id) && t.status !== "done",
  );
  return {
    isBlocked: blockedByTasks.length > 0,
    blockedByKeys: blockedByTasks.map((t) => t.key),
  };
}

export function subscribeToTasks(
  doc: Y.Doc,
  callback: (tasks: TaskRecord[]) => void,
): () => void {
  const map = getTasksMap(doc);
  const listener = () => {
    callback(listTasks(doc));
  };
  map.observe(listener);
  callback(listTasks(doc));
  return () => {
    map.unobserve(listener);
  };
}

/* ==========================================================================
   Sprints Operations
   ========================================================================== */

export function listSprints(doc: Y.Doc): SprintRecord[] {
  const map = getSprintsMap(doc);
  return Array.from(map.values()).sort((a, b) => b.startDate - a.startDate);
}

export function createSprint(
  doc: Y.Doc,
  partial: Partial<SprintRecord>,
): SprintRecord {
  const map = getSprintsMap(doc);
  const now = Date.now();
  const id = partial.id || `sprint-${now}-${Math.random().toString(36).slice(2, 7)}`;
  const record: SprintRecord = {
    id,
    name: partial.name || `Sprint ${map.size + 1}`,
    goal: partial.goal,
    startDate: partial.startDate || now,
    endDate: partial.endDate || now + 14 * 86400000, // 2 weeks default
    status: partial.status || "planning",
    createdAt: now,
    updatedAt: now,
  };
  map.set(id, record);
  return record;
}

export function updateSprint(
  doc: Y.Doc,
  sprintId: string,
  updates: Partial<SprintRecord>,
): SprintRecord | undefined {
  const map = getSprintsMap(doc);
  const existing = map.get(sprintId);
  if (!existing) return undefined;
  const updated: SprintRecord = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };
  map.set(sprintId, updated);
  return updated;
}

export function deleteSprint(doc: Y.Doc, sprintId: string): boolean {
  const map = getSprintsMap(doc);
  if (!map.has(sprintId)) return false;
  map.delete(sprintId);
  return true;
}

export function subscribeToSprints(
  doc: Y.Doc,
  callback: (sprints: SprintRecord[]) => void,
): () => void {
  const map = getSprintsMap(doc);
  const listener = () => {
    callback(listSprints(doc));
  };
  map.observe(listener);
  callback(listSprints(doc));
  return () => {
    map.unobserve(listener);
  };
}

/* ==========================================================================
   Milestones Operations
   ========================================================================== */

export function listMilestones(doc: Y.Doc): MilestoneRecord[] {
  const map = getMilestonesMap(doc);
  return Array.from(map.values()).sort((a, b) => a.targetDate - b.targetDate);
}

export function createMilestone(
  doc: Y.Doc,
  partial: Partial<MilestoneRecord>,
): MilestoneRecord {
  const map = getMilestonesMap(doc);
  const now = Date.now();
  const id = partial.id || `ms-${now}-${Math.random().toString(36).slice(2, 7)}`;
  const record: MilestoneRecord = {
    id,
    title: partial.title || `Milestone ${map.size + 1}`,
    description: partial.description,
    targetDate: partial.targetDate || now + 30 * 86400000, // 30 days default
    associatedTaskIds: partial.associatedTaskIds || [],
    status: partial.status || "open",
    createdAt: now,
    updatedAt: now,
  };
  map.set(id, record);
  return record;
}

export function updateMilestone(
  doc: Y.Doc,
  milestoneId: string,
  updates: Partial<MilestoneRecord>,
): MilestoneRecord | undefined {
  const map = getMilestonesMap(doc);
  const existing = map.get(milestoneId);
  if (!existing) return undefined;
  const updated: MilestoneRecord = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };
  map.set(milestoneId, updated);
  return updated;
}

export function deleteMilestone(doc: Y.Doc, milestoneId: string): boolean {
  const map = getMilestonesMap(doc);
  if (!map.has(milestoneId)) return false;
  map.delete(milestoneId);
  return true;
}

export function subscribeToMilestones(
  doc: Y.Doc,
  callback: (milestones: MilestoneRecord[]) => void,
): () => void {
  const map = getMilestonesMap(doc);
  const listener = () => {
    callback(listMilestones(doc));
  };
  map.observe(listener);
  callback(listMilestones(doc));
  return () => {
    map.unobserve(listener);
  };
}

/* ==========================================================================
   Automation Rules Operations
   ========================================================================== */

export function listAutomationRules(doc: Y.Doc): AutomationRule[] {
  const map = getAutomationRulesMap(doc);
  if (map.size === 0) {
    // Populate default rules on first access
    doc.transact(() => {
      for (const r of DEFAULT_AUTOMATION_RULES) {
        map.set(r.id, r);
      }
    });
  }
  return Array.from(map.values());
}

export function toggleAutomationRule(
  doc: Y.Doc,
  ruleId: string,
  enabled: boolean,
): void {
  const map = getAutomationRulesMap(doc);
  const existing = map.get(ruleId);
  if (existing) {
    map.set(ruleId, { ...existing, enabled });
  }
}

export function subscribeToAutomationRules(
  doc: Y.Doc,
  callback: (rules: AutomationRule[]) => void,
): () => void {
  const map = getAutomationRulesMap(doc);
  const listener = () => {
    callback(listAutomationRules(doc));
  };
  map.observe(listener);
  callback(listAutomationRules(doc));
  return () => {
    map.unobserve(listener);
  };
}

/* ==========================================================================
   Project Members & Roles Operations
   ========================================================================== */

export function listMembers(doc: Y.Doc): MemberRecord[] {
  const map = getMembersMap(doc);
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function getMember(doc: Y.Doc, name: string): MemberRecord | undefined {
  return getMembersMap(doc).get(name);
}

export function setMemberRole(
  doc: Y.Doc,
  name: string,
  role: string,
  _user?: { id: string; name: string },
): MemberRecord {
  const map = getMembersMap(doc);
  const existing = map.get(name);
  const record: MemberRecord = {
    id: existing?.id || name,
    name,
    role,
    customTitle: existing?.customTitle,
    avatarColor: existing?.avatarColor,
    avatarUrl: existing?.avatarUrl || (!name.includes(" ") ? `https://github.com/${name}.png` : undefined),
    isRepoCollaborator: existing?.isRepoCollaborator,
    repoRole: existing?.repoRole,
    updatedAt: Date.now(),
  };

  doc.transact(() => {
    map.set(name, record);

    // Synchronize to all existing tasks assigned to this member
    const tasksMap = getTasksMap(doc);
    for (const [taskId, task] of tasksMap.entries()) {
      if (task.assignees?.includes(name)) {
        tasksMap.set(taskId, {
          ...task,
          roles: {
            ...(task.roles || {}),
            [name]: role,
          },
          updatedAt: Date.now(),
        });
      }
    }
  });

  try {
    recordActivity(doc, {
      userName: "Team",
      action: "task_status",
      targetType: "task",
      title: "Updated member role",
      detail: `${name} is now ${role}`,
    });
  } catch {}

  return record;
}

export function addMember(
  doc: Y.Doc,
  member: {
    name: string;
    role?: string;
    avatarUrl?: string;
    isRepoCollaborator?: boolean;
    repoRole?: string;
  },
): MemberRecord {
  const map = getMembersMap(doc);
  const trimmed = member.name.trim();
  const existing = map.get(trimmed);
  const record: MemberRecord = {
    id: existing?.id || trimmed,
    name: trimmed,
    role: member.role || existing?.role || "Collaborator",
    avatarUrl:
      member.avatarUrl ||
      existing?.avatarUrl ||
      (!trimmed.includes(" ") ? `https://github.com/${trimmed}.png` : undefined),
    isRepoCollaborator: member.isRepoCollaborator ?? existing?.isRepoCollaborator,
    repoRole: member.repoRole || existing?.repoRole,
    customTitle: existing?.customTitle,
    avatarColor: existing?.avatarColor,
    updatedAt: Date.now(),
  };

  map.set(trimmed, record);
  return record;
}

export function removeMember(doc: Y.Doc, name: string): void {
  const map = getMembersMap(doc);
  map.delete(name);
}

export function syncRepoCollaborators(
  doc: Y.Doc,
  collabs: Array<{ login: string; role?: string; avatarUrl?: string }>,
): void {
  if (!collabs || collabs.length === 0) return;
  const map = getMembersMap(doc);
  doc.transact(() => {
    for (const c of collabs) {
      if (!c.login) continue;
      const existing = map.get(c.login);
      const record: MemberRecord = {
        id: existing?.id || c.login,
        name: c.login,
        role: existing?.role || "Collaborator",
        avatarUrl: c.avatarUrl || existing?.avatarUrl || `https://github.com/${c.login}.png`,
        isRepoCollaborator: true,
        repoRole: c.role || existing?.repoRole,
        customTitle: existing?.customTitle,
        avatarColor: existing?.avatarColor,
        updatedAt: Date.now(),
      };
      map.set(c.login, record);
    }
  });
}

export function subscribeToMembers(
  doc: Y.Doc,
  callback: (members: MemberRecord[]) => void,
): () => void {
  const map = getMembersMap(doc);
  const listener = () => {
    callback(listMembers(doc));
  };
  map.observe(listener);
  callback(listMembers(doc));
  return () => {
    map.unobserve(listener);
  };
}

/* ==========================================================================
   Custom Project Roles Operations
   ========================================================================== */

export function listCustomRoles(doc: Y.Doc): CustomRoleRecord[] {
  const map = getCustomRolesMap(doc);
  if (map.size === 0) {
    doc.transact(() => {
      for (const r of DEFAULT_PROJECT_ROLES) {
        map.set(r.id, r);
      }
    });
  }
  return Array.from(map.values());
}

export function addCustomRole(
  doc: Y.Doc,
  role: { name: string; color?: string; icon?: string; description?: string },
): CustomRoleRecord {
  const map = getCustomRolesMap(doc);
  // Ensure default roles are populated first
  if (map.size === 0) {
    listCustomRoles(doc);
  }
  const id = `role-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const record: CustomRoleRecord = {
    id,
    name: role.name.trim(),
    color: role.color || "#4a5568",
    icon: role.icon || "🏷️",
    description: role.description?.trim(),
    isDefault: false,
  };
  map.set(id, record);
  return record;
}

export function deleteCustomRole(doc: Y.Doc, roleId: string): boolean {
  const map = getCustomRolesMap(doc);
  if (!map.has(roleId)) return false;
  map.delete(roleId);
  return true;
}

export function subscribeToCustomRoles(
  doc: Y.Doc,
  callback: (roles: CustomRoleRecord[]) => void,
): () => void {
  const map = getCustomRolesMap(doc);
  const listener = () => {
    callback(listCustomRoles(doc));
  };
  map.observe(listener);
  callback(listCustomRoles(doc));
  return () => {
    map.unobserve(listener);
  };
}
