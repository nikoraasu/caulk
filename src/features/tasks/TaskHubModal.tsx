import React, { useState, useMemo, Fragment } from "react";
import type {
  TaskRecord,
  TaskStatus,
  TaskPriority,
  TaskType,
  AutomationRule,
  SprintRecord,
  MilestoneRecord,
  MemberRecord,
  CustomRoleRecord,
} from "./types";
import type { RepoCollaborator } from "../../storage/github";
import { soundEngine } from "../../audio/soundEngine";
import { DEFAULT_AUTOMATION_RULES, isTaskBlocked } from "./store";
import "./tasks.css";

type Props = {
  tasks: TaskRecord[];
  sprints?: SprintRecord[];
  milestones?: MilestoneRecord[];
  collaborators?: string[];
  repoCollaborators?: RepoCollaborator[];
  members?: MemberRecord[];
  customRoles?: CustomRoleRecord[];
  currentUserName: string;
  onClose: () => void;
  onCreateTask: (partial: Partial<TaskRecord>, options?: { createSticky?: boolean }) => void;
  onUpdateTask: (taskId: string, updates: Partial<TaskRecord>) => void;
  onCreateSubtask?: (parentId: string, title: string) => void;
  onSetMemberRole?: (name: string, role: string) => void;
  onAddCustomRole?: (role: { name: string; color?: string; icon?: string; description?: string }) => void;
  onDeleteCustomRole?: (roleId: string) => void;
  onCreateSprint?: (partial: Partial<SprintRecord>) => void;
  onUpdateSprint?: (sprintId: string, updates: Partial<SprintRecord>) => void;
  onDeleteSprint?: (sprintId: string) => void;
  onCreateMilestone?: (partial: Partial<MilestoneRecord>) => void;
  onUpdateMilestone?: (milestoneId: string, updates: Partial<MilestoneRecord>) => void;
  onDeleteMilestone?: (milestoneId: string) => void;
  onSelectTaskDetails: (task: TaskRecord) => void;
  onAddCardToCanvas?: (task: TaskRecord) => void;
  onJumpToCard?: (cardElementId: string) => void;
  onAddStickyForTask?: (task: TaskRecord) => void;
  onAddMember?: (member: { name: string; role?: string; avatarUrl?: string; isRepoCollaborator?: boolean; repoRole?: string }) => void;
  onRemoveMember?: (name: string) => void;
  onSyncRepoCollaborators?: () => Promise<number | void>;
};

type ViewMode =
  | "kanban"
  | "list"
  | "timeline"
  | "calendar"
  | "sprints"
  | "milestones"
  | "team"
  | "dashboard"
  | "automations";

const STATUSES: { key: TaskStatus; label: string; color: string }[] = [
  { key: "backlog", label: "Backlog", color: "#718096" },
  { key: "todo", label: "To Do", color: "#3182ce" },
  { key: "in_progress", label: "In Progress", color: "#d69e2e" },
  { key: "review", label: "Review", color: "#805ad5" },
  { key: "done", label: "Done", color: "#38a169" },
  { key: "blocked", label: "Blocked", color: "#e53e3e" },
];

const PRIORITY_BADGES: Record<TaskPriority, { icon: string; label: string }> = {
  low: { icon: "🔵", label: "Low" },
  medium: { icon: "🟡", label: "Medium" },
  high: { icon: "🟠", label: "High" },
  critical: { icon: "🔴", label: "Critical" },
};

const TYPE_ICONS: Record<TaskType, string> = {
  task: "✅",
  bug: "🪲",
  story: "📖",
  epic: "⚡",
};

export function TaskHubModal({
  tasks,
  sprints = [],
  milestones = [],
  collaborators = [],
  repoCollaborators = [],
  members = [],
  customRoles = [],
  currentUserName,
  onClose,
  onCreateTask,
  onUpdateTask,
  onCreateSubtask,
  onSetMemberRole,
  onAddCustomRole,
  onDeleteCustomRole,
  onCreateSprint,
  onUpdateSprint,
  onDeleteSprint,
  onCreateMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
  onSelectTaskDetails,
  onAddCardToCanvas,
  onJumpToCard,
  onAddStickyForTask,
  onAddMember,
  onRemoveMember,
  onSyncRepoCollaborators,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterSprint, setFilterSprint] = useState<string>("all");
  const [filterLabel, setFilterLabel] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("key");
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickAssignee, setQuickAssignee] = useState<string>(currentUserName || "");
  const [quickCreateSticky, setQuickCreateSticky] = useState<boolean>(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [rules, setRules] = useState<AutomationRule[]>(DEFAULT_AUTOMATION_RULES);

  // Member & Collaborator State
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("Collaborator");
  const [isSyncingCollabs, setIsSyncingCollabs] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Custom Role Creation State
  const [showAddCustomRole, setShowAddCustomRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleIcon, setNewRoleIcon] = useState("🏷️");
  const [newRoleColor, setNewRoleColor] = useState("#3182ce");

  // Subtasks Drawer Expansion State
  const [kanbanSubtasksExpanded, setKanbanSubtasksExpanded] = useState<Record<string, boolean>>({});
  const [listSubtasksExpanded, setListSubtasksExpanded] = useState<Record<string, boolean>>({});
  const [inlineSubtaskTitles, setInlineSubtaskTitles] = useState<Record<string, string>>({});
  const [inlineAddingSubtaskFor, setInlineAddingSubtaskFor] = useState<string | null>(null);

  // Sprint Creation State
  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [newSprintName, setNewSprintName] = useState("");
  const [newSprintGoal, setNewSprintGoal] = useState("");
  const [newSprintDurationWeeks, setNewSprintDurationWeeks] = useState(2);

  // Milestone Creation State
  const [showCreateMilestone, setShowCreateMilestone] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneDesc, setNewMilestoneDesc] = useState("");
  const [newMilestoneDays, setNewMilestoneDays] = useState(30);

  // All Role Options (Built-in + Custom Roles)
  const allRoles = useMemo(() => {
    const list: Array<{ value: string; label: string; icon: string; color: string; isCustom?: boolean; id?: string }> = [
      { value: "Frontend Developer", label: "Frontend Developer", icon: "💻", color: "#3182ce" },
      { value: "Backend Developer", label: "Backend Developer", icon: "⚙️", color: "#805ad5" },
      { value: "Full-stack Developer", label: "Full-stack Developer", icon: "🚀", color: "#2b6cb0" },
      { value: "Designer", label: "Designer", icon: "🎨", color: "#d69e2e" },
      { value: "QA", label: "QA / Test Engineer", icon: "🧪", color: "#38a169" },
      { value: "Project Manager", label: "Project Manager", icon: "📋", color: "#dd6b20" },
      { value: "Product Owner", label: "Product Owner", icon: "👑", color: "#e53e3e" },
      { value: "DevOps", label: "DevOps / Infra", icon: "☁️", color: "#4a5568" },
      { value: "Collaborator", label: "Collaborator", icon: "👥", color: "#718096" },
    ];
    for (const cr of customRoles) {
      if (!list.some((r) => r.value.toLowerCase() === cr.name.toLowerCase())) {
        list.push({
          value: cr.name,
          label: cr.name,
          icon: cr.icon || "🏷️",
          color: cr.color || "#4a5568",
          isCustom: !cr.isDefault,
          id: cr.id,
        });
      }
    }
    return list;
  }, [customRoles]);

  // Unique labels across all tasks
  const allLabels = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      for (const l of t.labels || []) {
        if (l.trim()) set.add(l.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          t.title.toLowerCase().includes(q) ||
          t.key.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.category?.toLowerCase().includes(q) ||
          t.labels?.some((l) => l.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterAssignee !== "all" && !t.assignees?.includes(filterAssignee)) return false;
      if (filterSprint === "backlog" && t.sprintId) return false;
      if (filterSprint !== "all" && filterSprint !== "backlog" && t.sprintId !== filterSprint)
        return false;
      if (filterLabel !== "all") {
        if (filterLabel === "none") {
          if (t.labels && t.labels.length > 0) return false;
        } else {
          if (!t.labels || !t.labels.some((l) => l.toLowerCase() === filterLabel.toLowerCase()))
            return false;
        }
      }
      return true;
    });
  }, [tasks, searchQuery, filterPriority, filterAssignee, filterSprint, filterLabel]);

  // Unique assignees
  const allAssignees = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      for (const a of t.assignees || []) set.add(a);
    }
    return Array.from(set);
  }, [tasks]);

  // Discovered team members across repo collaborators, live peers, and persistent records
  const teamMembers = useMemo(() => {
    const memberMap = new Map<
      string,
      {
        name: string;
        isOnline: boolean;
        isRepoCollaborator?: boolean;
        repoRole?: string;
        avatarUrl?: string;
        role: string;
        assignedTasks: TaskRecord[];
        doneCount: number;
        inProgressCount: number;
        reviewCount: number;
        overdueCount: number;
      }
    >();

    const ensureMember = (
      name: string,
      isOnline = false,
      extra?: Partial<{ isRepoCollaborator: boolean; repoRole: string; avatarUrl: string; role: string }>,
    ) => {
      if (!name) return;
      const avatarUrl =
        extra?.avatarUrl || (!name.includes(" ") ? `https://github.com/${name}.png` : undefined);
      if (!memberMap.has(name)) {
        memberMap.set(name, {
          name,
          isOnline,
          isRepoCollaborator: extra?.isRepoCollaborator,
          repoRole: extra?.repoRole,
          avatarUrl,
          role: extra?.role || "Collaborator",
          assignedTasks: [],
          doneCount: 0,
          inProgressCount: 0,
          reviewCount: 0,
          overdueCount: 0,
        });
      } else {
        const existing = memberMap.get(name)!;
        if (isOnline) existing.isOnline = true;
        if (extra?.isRepoCollaborator) existing.isRepoCollaborator = true;
        if (extra?.repoRole) existing.repoRole = extra.repoRole;
        if (avatarUrl) existing.avatarUrl = avatarUrl;
        if (extra?.role) existing.role = extra.role;
      }
    };

    // 1. Repo collaborators from GitHub
    for (const rc of repoCollaborators) {
      ensureMember(rc.login, false, {
        isRepoCollaborator: true,
        repoRole: rc.role,
        avatarUrl: rc.avatarUrl || `https://github.com/${rc.login}.png`,
      });
    }

    // 2. Persisted members from Yjs project_members
    for (const pm of members) {
      ensureMember(pm.name, false, {
        role: pm.role,
        avatarUrl: pm.avatarUrl,
        isRepoCollaborator: pm.isRepoCollaborator,
        repoRole: pm.repoRole,
      });
      const m = memberMap.get(pm.name);
      if (m && pm.role) m.role = pm.role;
      if (m && pm.avatarUrl) m.avatarUrl = pm.avatarUrl;
      if (m && pm.isRepoCollaborator) m.isRepoCollaborator = true;
      if (m && pm.repoRole) m.repoRole = pm.repoRole;
    }

    // 3. Current user & online live collaborators
    if (currentUserName) ensureMember(currentUserName, true);
    for (const c of collaborators) ensureMember(c, true);

    // 4. Task assignees
    const now = Date.now();
    for (const t of tasks) {
      for (const a of t.assignees || []) {
        ensureMember(a);
        const m = memberMap.get(a)!;
        m.assignedTasks.push(t);
        if (t.status === "done") m.doneCount++;
        else if (t.status === "in_progress") m.inProgressCount++;
        else if (t.status === "review") m.reviewCount++;
        if (t.dueDate && t.dueDate < now && t.status !== "done") m.overdueCount++;

        // If not already assigned a role via project_members, fallback to task role
        if (t.roles && t.roles[a] && m.role === "Collaborator") {
          m.role = t.roles[a];
        }
      }
    }

    return Array.from(memberMap.values()).sort(
      (a, b) => b.assignedTasks.length - a.assignedTasks.length || a.name.localeCompare(b.name),
    );
  }, [tasks, collaborators, repoCollaborators, members, currentUserName]);

  // Analytics Metrics
  const metrics = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === "done").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const review = tasks.filter((t) => t.status === "review").length;
    const todo = tasks.filter((t) => t.status === "todo").length;
    const blocked = tasks.filter((t) => t.status === "blocked").length;
    const backlog = tasks.filter((t) => t.status === "backlog").length;
    const overdue = tasks.filter((t) => t.dueDate && t.dueDate < Date.now() && t.status !== "done").length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Upcoming deadlines in the next 14 days
    const now = Date.now();
    const upcomingDeadlines = tasks
      .filter((t) => t.dueDate && t.dueDate >= now && t.status !== "done")
      .sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0))
      .slice(0, 5);

    // Workload by user
    const userWorkload: Record<string, { total: number; done: number }> = {};
    for (const t of tasks) {
      for (const u of t.assignees || ["Unassigned"]) {
        if (!userWorkload[u]) userWorkload[u] = { total: 0, done: 0 };
        userWorkload[u].total += 1;
        if (t.status === "done") userWorkload[u].done += 1;
      }
    }

    // Active Sprint Metrics
    const activeSprint = sprints.find((s) => s.status === "active");
    const activeSprintTasks = activeSprint ? tasks.filter((t) => t.sprintId === activeSprint.id) : [];
    const activeSprintDone = activeSprintTasks.filter((t) => t.status === "done").length;
    const activeSprintPct =
      activeSprintTasks.length > 0
        ? Math.round((activeSprintDone / activeSprintTasks.length) * 100)
        : 0;

    // Milestones Metrics
    const milestonesProgress = milestones.map((m) => {
      const mTasks = tasks.filter(
        (t) => m.associatedTaskIds?.includes(t.id) || t.milestoneId === m.id,
      );
      const mDone = mTasks.filter((t) => t.status === "done").length;
      const mPct = mTasks.length > 0 ? Math.round((mDone / mTasks.length) * 100) : 0;
      const daysLeft = Math.ceil((m.targetDate - now) / 86400000);
      return {
        ...m,
        total: mTasks.length,
        done: mDone,
        pct: mPct,
        daysLeft,
      };
    });

    return {
      total,
      completed,
      inProgress,
      review,
      todo,
      blocked,
      backlog,
      overdue,
      completionRate,
      upcomingDeadlines,
      userWorkload,
      activeSprint,
      activeSprintTasks,
      activeSprintDone,
      activeSprintPct,
      milestonesProgress,
    };
  }, [tasks, sprints, milestones]);

  // Timeline scale calculation
  const timelineTimeRange = useMemo(() => {
    const now = Date.now();
    const ONE_DAY = 86400000;
    let min = Infinity;
    let max = -Infinity;

    for (const t of filteredTasks) {
      const s = t.startDate || t.createdAt || now;
      const d = t.dueDate || (s + ONE_DAY * 7);
      if (s < min) min = s;
      if (d > max) max = d;
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = now - ONE_DAY * 2;
      max = now + ONE_DAY * 14;
    }

    // Snap min to start of day, max to end of day
    const startDate = new Date(min);
    startDate.setHours(0, 0, 0, 0);
    const minTime = startDate.getTime();

    const endDate = new Date(max);
    endDate.setHours(23, 59, 59, 999);
    let maxTime = endDate.getTime();
    if (maxTime - minTime < ONE_DAY * 7) {
      maxTime = minTime + ONE_DAY * 7;
    }

    const totalDuration = Math.max(ONE_DAY, maxTime - minTime);
    const totalDays = Math.max(1, Math.ceil(totalDuration / ONE_DAY));

    // Generate 6-8 interval ticks for the timeline ruler
    const tickStep = Math.max(1, Math.round(totalDays / 6));
    const ticks: { label: string; leftPct: number }[] = [];
    for (let d = 0; d < totalDays; d += tickStep) {
      const tickTime = minTime + d * ONE_DAY;
      const leftPct = (d * ONE_DAY / totalDuration) * 100;
      ticks.push({
        label: new Date(tickTime).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        leftPct,
      });
    }

    const todayPct = ((now - minTime) / totalDuration) * 100;

    return { minTime, maxTime, totalDuration, totalDays, ticks, todayPct };
  }, [filteredTasks]);

  const handleQuickCreate = () => {
    if (!quickTitle.trim()) return;
    soundEngine.play("create");
    const chosenAssignees = quickAssignee ? [quickAssignee] : [];
    onCreateTask(
      {
        title: quickTitle.trim(),
        status: "todo",
        priority: "medium",
        type: "task",
        assignees: chosenAssignees,
      },
      { createSticky: quickCreateSticky },
    );
    setQuickTitle("");
  };

  // Drag and drop for Kanban
  const handleDropOnStatus = (status: TaskStatus) => {
    if (!draggedTaskId) return;
    soundEngine.play("click");
    onUpdateTask(draggedTaskId, { status });
    setDraggedTaskId(null);
  };

  const handleToggleRule = (ruleId: string) => {
    soundEngine.play("click");
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)),
    );
  };

  return (
    <div className="task-modal-backdrop" onClick={onClose}>
      <div
        className="window-frame modal-window task-hub-window"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Project and Task Hub"
      >
        {/* Authentic Caulk Titlebar */}
        <div className="window-titlebar">
          <div className="window-title">
            <span className="window-lambda">📋</span>
            <span>Project &amp; Task Hub</span>
            <span className="task-count-pill">
              {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
            </span>
          </div>

          <div className="window-controls">
            <button
              type="button"
              className="window-btn close"
              onClick={onClose}
              title="Close"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* View Switcher Bar & Filters */}
        <div className="task-view-bar">
          {/* View Modes */}
          <div className="task-tab-strip">
            {[
              { id: "kanban", label: "Kanban", icon: "📊" },
              { id: "list", label: "List", icon: "📑" },
              { id: "timeline", label: "Timeline (Gantt)", icon: "📅" },
              { id: "calendar", label: "Calendar", icon: "🗓️" },
              { id: "sprints", label: "Sprints & Backlog", icon: "🏃" },
              { id: "milestones", label: "Milestones", icon: "🎯" },
              { id: "team", label: "Team & Roles", icon: "👥" },
              { id: "dashboard", label: "Analytics", icon: "📈" },
              { id: "automations", label: "Automations", icon: "⚡" },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                className={`task-tab-btn ${viewMode === v.id ? "active" : ""}`}
                onClick={() => {
                  soundEngine.play("click");
                  setViewMode(v.id as ViewMode);
                }}
              >
                <span>{v.icon}</span>
                <span>{v.label}</span>
              </button>
            ))}
          </div>

          {/* Quick Filter & Search Bar */}
          <div className="task-filter-group">
            <input
              type="text"
              className="task-input"
              placeholder="Search tasks, category, or #labels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: 180 }}
            />

            <select
              className="task-select"
              value={filterSprint}
              onChange={(e) => setFilterSprint(e.target.value)}
            >
              <option value="all">All Sprints</option>
              <option value="backlog">📦 Backlog Only</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.status === "active" ? "🟢 " : s.status === "completed" ? "🏁 " : "📋 "}
                  {s.name}
                </option>
              ))}
            </select>

            <select
              className="task-select"
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
            >
              <option value="all">All Priorities</option>
              <option value="critical">🔴 Critical</option>
              <option value="high">🟠 High</option>
              <option value="medium">🟡 Medium</option>
              <option value="low">🔵 Low</option>
            </select>

            <select
              className="task-select"
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
            >
              <option value="all">All Assignees</option>
              {allAssignees.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            <select
              className="task-select"
              value={filterLabel}
              onChange={(e) => setFilterLabel(e.target.value)}
              title="Filter by label or sticky tag"
            >
              <option value="all">🏷️ All Tags &amp; Labels</option>
              <option value="none">Untagged</option>
              {allLabels.map((l) => (
                <option key={l} value={l}>
                  #{l}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Task Creation Strip */}
        <div className="task-quick-add-bar" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            className="task-input"
            placeholder="Quick add new task title (press Enter)..."
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleQuickCreate()}
            style={{ flex: 1, minWidth: 220 }}
          />

          {/* Member List Selector When Creating Task */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11, color: "var(--vgui-muted)", whiteSpace: "nowrap" }}>👤 Assignee:</span>
            <select
              className="task-select"
              value={quickAssignee}
              onChange={(e) => setQuickAssignee(e.target.value)}
              style={{ fontSize: 11, padding: "2px 6px", maxWidth: 170 }}
              title="Select team member or GitHub collaborator to assign"
            >
              <option value="">⚡ Unassigned</option>
              {currentUserName && (
                <option value={currentUserName}>
                  👤 {currentUserName} (You)
                </option>
              )}
              {teamMembers
                .filter((m) => m.name !== currentUserName)
                .map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.isRepoCollaborator ? "🐙 " : "👤 "} {m.name} ({m.role || "Collaborator"})
                  </option>
                ))}
            </select>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              userSelect: "none",
              whiteSpace: "nowrap",
            }}
            title="Automatically create a linked sticky note on the canvas"
          >
            <input
              type="checkbox"
              checked={quickCreateSticky}
              onChange={(e) => setQuickCreateSticky(e.target.checked)}
            />
            <span>📝 Create sticky</span>
          </label>

          <button
            type="button"
            className="btn primary"
            onClick={handleQuickCreate}
            disabled={!quickTitle.trim()}
          >
            + Create Task
          </button>
        </div>

        {/* Main Workspace Body */}
        <div className="task-modal-body">
          {/* VIEW 1: KANBAN BOARD */}
          {viewMode === "kanban" && (
            <div className="task-kanban-board">
              {STATUSES.map((st) => {
                const columnTasks = filteredTasks.filter((t) => t.status === st.key && !t.parentId);
                return (
                  <div
                    key={st.key}
                    className="task-kanban-column"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDropOnStatus(st.key)}
                  >
                    {/* Column Header */}
                    <div
                      className="task-kanban-column-header"
                      style={{ "--status-color": st.color } as React.CSSProperties}
                    >
                      <span>{st.label}</span>
                      <span className="task-kanban-count-pill">
                        {columnTasks.length}
                      </span>
                    </div>

                    {/* Column Cards */}
                    <div className="task-kanban-cards-list">
                      {columnTasks.map((t) => {
                        const blocked = isTaskBlocked(t, tasks);
                        const childTasks = tasks.filter((sub) => t.subtaskIds?.includes(sub.id));
                        const doneChildCount = childTasks.filter((sub) => sub.status === "done").length;
                        const isExpanded = kanbanSubtasksExpanded[t.id];

                        return (
                          <div
                            key={t.id}
                            className="task-kanban-card"
                            draggable
                            onDragStart={() => setDraggedTaskId(t.id)}
                            onClick={() => onSelectTaskDetails(t)}
                          >
                            <div className="task-card-meta-row">
                              <span className="task-card-key">
                                {TYPE_ICONS[t.type]} {t.key}
                              </span>
                              <span>{PRIORITY_BADGES[t.priority]?.icon}</span>
                            </div>

                            <div className="task-card-title">
                              {t.title}
                            </div>

                            {blocked.isBlocked && (
                              <div
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: "var(--err, #e53e3e)",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <span>⛔ Blocked by {blocked.blockedByKeys.join(", ")}</span>
                              </div>
                            )}

                            {t.category && (
                              <div style={{ fontSize: 10, color: "var(--vgui-muted)" }}>
                                📂 {t.category}
                              </div>
                            )}

                            {/* Labels & Tags chips */}
                            {t.labels && t.labels.length > 0 && (
                              <div className="task-chip-list" style={{ marginTop: 2 }}>
                                {t.labels.map((lbl) => (
                                  <span
                                    key={lbl}
                                    className="task-chip"
                                    style={{ cursor: "pointer" }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFilterLabel(lbl);
                                    }}
                                    title={`Filter by #${lbl}`}
                                  >
                                    #{lbl}
                                  </span>
                                ))}
                              </div>
                            )}

                            {t.assignees && t.assignees.length > 0 && (
                              <div className="task-chip-list">
                                {t.assignees.slice(0, 2).map((a) => (
                                  <span key={a} className="task-chip">
                                    👤 {a}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Streamlined Subtasks Drawer */}
                            {childTasks.length > 0 && (
                              <div
                                className="task-kanban-subtasks"
                                style={{
                                  marginTop: 6,
                                  paddingTop: 4,
                                  borderTop: "1px dashed var(--vgui-border)",
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    fontSize: 10,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                  onClick={() =>
                                    setKanbanSubtasksExpanded((prev) => ({
                                      ...prev,
                                      [t.id]: !prev[t.id],
                                    }))
                                  }
                                >
                                  <span style={{ color: "var(--vgui-accent)" }}>
                                    ↳ {doneChildCount}/{childTasks.length} subtasks
                                  </span>
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    {onCreateSubtask && (
                                      <span
                                        style={{ fontSize: 9, color: "var(--vgui-accent)", cursor: "pointer", padding: "0 2px" }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setInlineAddingSubtaskFor(t.id);
                                          setKanbanSubtasksExpanded((prev) => ({ ...prev, [t.id]: true }));
                                        }}
                                        title="Add subtask inline"
                                      >
                                        + Add
                                      </span>
                                    )}
                                    <span style={{ fontSize: 9, color: "var(--vgui-muted)" }}>
                                      {isExpanded ? "▲" : "▼"}
                                    </span>
                                  </div>
                                </div>

                                {isExpanded && (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
                                    {childTasks.map((st, idx) => {
                                      const isLast = idx === childTasks.length - 1 && inlineAddingSubtaskFor !== t.id;
                                      const isDone = st.status === "done";
                                      return (
                                        <div
                                          key={st.id}
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 4,
                                            fontSize: 10,
                                          }}
                                        >
                                          <span style={{ fontFamily: "monospace", color: "var(--vgui-accent)" }}>
                                            {isLast ? "└──" : "├──"}
                                          </span>
                                          <input
                                            type="checkbox"
                                            checked={isDone}
                                            onChange={(e) => {
                                              soundEngine.play("click");
                                              onUpdateTask(st.id, { status: e.target.checked ? "done" : "todo" });
                                            }}
                                            style={{ cursor: "pointer", margin: 0 }}
                                          />
                                          <span
                                            style={{
                                              textDecoration: isDone ? "line-through" : "none",
                                              opacity: isDone ? 0.6 : 1,
                                              cursor: "pointer",
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap",
                                              flex: 1,
                                            }}
                                            onClick={() => onSelectTaskDetails(st)}
                                            title={`${st.key}: ${st.title} (${st.status})`}
                                          >
                                            <span style={{ fontWeight: 700, color: "var(--vgui-accent)", marginRight: 3 }}>
                                              {st.key}
                                            </span>
                                            {st.title}
                                          </span>
                                        </div>
                                      );
                                    })}

                                    {inlineAddingSubtaskFor === t.id && (
                                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                                        <span style={{ fontFamily: "monospace", color: "var(--vgui-accent)" }}>└──</span>
                                        <input
                                          type="text"
                                          className="task-input"
                                          placeholder="New subtask... (Enter)"
                                          value={inlineSubtaskTitles[t.id] || ""}
                                          autoFocus
                                          onChange={(e) =>
                                            setInlineSubtaskTitles((prev) => ({ ...prev, [t.id]: e.target.value }))
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter" && inlineSubtaskTitles[t.id]?.trim()) {
                                              onCreateSubtask?.(t.id, inlineSubtaskTitles[t.id].trim());
                                              setInlineSubtaskTitles((prev) => ({ ...prev, [t.id]: "" }));
                                              setInlineAddingSubtaskFor(null);
                                              soundEngine.play("create");
                                            } else if (e.key === "Escape") {
                                              setInlineAddingSubtaskFor(null);
                                            }
                                          }}
                                          style={{ flex: 1, padding: "1px 5px", fontSize: 10, height: 18 }}
                                        />
                                        <button
                                          type="button"
                                          className="btn ghost"
                                          style={{ padding: "0 3px", fontSize: 9 }}
                                          onClick={() => setInlineAddingSubtaskFor(null)}
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                              {onAddCardToCanvas && !t.canvasCardElementId && (
                                <button
                                  type="button"
                                  className="task-card-action-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAddCardToCanvas(t);
                                  }}
                                  title="Place interactive card on board"
                                >
                                  📍 Place Card
                                </button>
                              )}
                              {onAddStickyForTask && (
                                <button
                                  type="button"
                                  className="task-card-action-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAddStickyForTask(t);
                                  }}
                                  title="Create linked sticky note on board"
                                >
                                  📝 Sticky
                                </button>
                              )}
                              {t.canvasCardElementId && onJumpToCard && (
                                <button
                                  type="button"
                                  className="task-card-action-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onClose();
                                    onJumpToCard(t.canvasCardElementId!);
                                  }}
                                  title="Jump to element on board"
                                >
                                  🎯 On Board
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW 2: LIST / TABLE VIEW WITH FULL SORTING & SUBTASKS */}
          {viewMode === "list" && (
            <div className="task-table-wrapper">
              <table className="task-table">
                <thead>
                  <tr>
                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (sortField === "key") setSortAsc(!sortAsc);
                        else {
                          setSortField("key");
                          setSortAsc(true);
                        }
                      }}
                    >
                      Key {sortField === "key" ? (sortAsc ? "▲" : "▼") : ""}
                    </th>
                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (sortField === "title") setSortAsc(!sortAsc);
                        else {
                          setSortField("title");
                          setSortAsc(true);
                        }
                      }}
                    >
                      Title {sortField === "title" ? (sortAsc ? "▲" : "▼") : ""}
                    </th>
                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (sortField === "status") setSortAsc(!sortAsc);
                        else {
                          setSortField("status");
                          setSortAsc(true);
                        }
                      }}
                    >
                      Status {sortField === "status" ? (sortAsc ? "▲" : "▼") : ""}
                    </th>
                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (sortField === "priority") setSortAsc(!sortAsc);
                        else {
                          setSortField("priority");
                          setSortAsc(true);
                        }
                      }}
                    >
                      Priority {sortField === "priority" ? (sortAsc ? "▲" : "▼") : ""}
                    </th>
                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (sortField === "category") setSortAsc(!sortAsc);
                        else {
                          setSortField("category");
                          setSortAsc(true);
                        }
                      }}
                    >
                      Category {sortField === "category" ? (sortAsc ? "▲" : "▼") : ""}
                    </th>
                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (sortField === "assignees") setSortAsc(!sortAsc);
                        else {
                          setSortField("assignees");
                          setSortAsc(true);
                        }
                      }}
                    >
                      Assignees {sortField === "assignees" ? (sortAsc ? "▲" : "▼") : ""}
                    </th>
                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (sortField === "dueDate") setSortAsc(!sortAsc);
                        else {
                          setSortField("dueDate");
                          setSortAsc(true);
                        }
                      }}
                    >
                      Due Date {sortField === "dueDate" ? (sortAsc ? "▲" : "▼") : ""}
                    </th>
                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (sortField === "labels") setSortAsc(!sortAsc);
                        else {
                          setSortField("labels");
                          setSortAsc(true);
                        }
                      }}
                    >
                      Labels {sortField === "labels" ? (sortAsc ? "▲" : "▼") : ""}
                    </th>
                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (sortField === "subtasks") setSortAsc(!sortAsc);
                        else {
                          setSortField("subtasks");
                          setSortAsc(true);
                        }
                      }}
                    >
                      Subtasks {sortField === "subtasks" ? (sortAsc ? "▲" : "▼") : ""}
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const sorted = [...filteredTasks].sort((a, b) => {
                      let cmp = 0;
                      switch (sortField) {
                        case "key": {
                          const numA = parseInt(a.key.replace(/\D/g, ""), 10) || 0;
                          const numB = parseInt(b.key.replace(/\D/g, ""), 10) || 0;
                          cmp = numA - numB;
                          break;
                        }
                        case "title":
                          cmp = a.title.localeCompare(b.title);
                          break;
                        case "status":
                          cmp = a.status.localeCompare(b.status);
                          break;
                        case "priority": {
                          const order: Record<TaskPriority, number> = { critical: 4, high: 3, medium: 2, low: 1 };
                          cmp = (order[a.priority] || 0) - (order[b.priority] || 0);
                          break;
                        }
                        case "category":
                          cmp = (a.category || "").localeCompare(b.category || "");
                          break;
                        case "assignees":
                          cmp = (a.assignees?.[0] || "").localeCompare(b.assignees?.[0] || "");
                          break;
                        case "dueDate":
                          cmp = (a.dueDate || 0) - (b.dueDate || 0);
                          break;
                        case "labels": {
                          const lA = (a.labels || []).join(", ");
                          const lB = (b.labels || []).join(", ");
                          cmp = lA.localeCompare(lB);
                          break;
                        }
                        case "subtasks":
                          cmp = (a.subtaskIds?.length || 0) - (b.subtaskIds?.length || 0);
                          break;
                        default:
                          cmp = 0;
                      }
                      return sortAsc ? cmp : -cmp;
                    });

                    const topLevel = sorted.filter((t) => !t.parentId);

                    return topLevel.map((t) => {
                      const blocked = isTaskBlocked(t, tasks);
                      const childTasks = tasks.filter((sub) => t.subtaskIds?.includes(sub.id));
                      const isExpanded = listSubtasksExpanded[t.id];

                      return (
                        <Fragment key={t.id}>
                          <tr key={t.id} onClick={() => onSelectTaskDetails(t)} style={{ cursor: "pointer" }}>
                            <td style={{ fontWeight: 700, color: "var(--vgui-accent)" }}>
                              {childTasks.length > 0 && (
                                <span
                                  style={{ marginRight: 6, fontSize: 10, cursor: "pointer" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setListSubtasksExpanded((prev) => ({ ...prev, [t.id]: !prev[t.id] }));
                                  }}
                                >
                                  {isExpanded ? "▼" : "▶"}
                                </span>
                              )}
                              {TYPE_ICONS[t.type]} {t.key}
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              {t.title}
                              {blocked.isBlocked && (
                                <span style={{ marginLeft: 6, fontSize: 10, color: "var(--err, #e53e3e)", fontWeight: 700 }}>
                                  [⛔ Blocked]
                                </span>
                              )}
                            </td>
                            <td>
                              <span
                                className="task-status-badge"
                                style={{
                                  background: STATUSES.find((s) => s.key === t.status)?.color || "var(--vgui-base)",
                                }}
                              >
                                {t.status.toUpperCase()}
                              </span>
                            </td>
                            <td>
                              {PRIORITY_BADGES[t.priority]?.icon} {PRIORITY_BADGES[t.priority]?.label}
                            </td>
                            <td>{t.category ? `📂 ${t.category}` : "—"}</td>
                            <td>{t.assignees?.join(", ") || "—"}</td>
                            <td>
                              {t.dueDate ? (
                                <span style={{ color: t.dueDate < Date.now() && t.status !== "done" ? "var(--err, #e53e3e)" : "inherit" }}>
                                  {new Date(t.dueDate).toLocaleDateString()}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                                {t.labels && t.labels.length > 0
                                  ? t.labels.map((lbl) => (
                                      <span key={lbl} className="task-chip">
                                        #{lbl}
                                      </span>
                                    ))
                                  : "—"}
                              </div>
                            </td>
                            <td>{t.subtaskIds?.length || 0}</td>
                            <td>
                              <div style={{ display: "flex", gap: 4 }}>
                                {onAddCardToCanvas && !t.canvasCardElementId && (
                                  <button
                                    type="button"
                                    className="btn ghost"
                                    style={{ padding: "2px 6px", fontSize: 11 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onAddCardToCanvas(t);
                                    }}
                                  >
                                    📍 Card
                                  </button>
                                )}
                                {onAddStickyForTask && (
                                  <button
                                    type="button"
                                    className="btn ghost"
                                    style={{ padding: "2px 6px", fontSize: 11 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onAddStickyForTask(t);
                                    }}
                                  >
                                    📝 Sticky
                                  </button>
                                )}
                                {t.canvasCardElementId && onJumpToCard && (
                                  <button
                                    type="button"
                                    className="btn ghost"
                                    style={{ padding: "2px 6px", fontSize: 11 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onClose();
                                      onJumpToCard(t.canvasCardElementId!);
                                    }}
                                  >
                                    🎯 Jump
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Nested Subtask Rows in List View */}
                          {isExpanded &&
                            childTasks.map((sub) => (
                              <tr
                                key={`sub-${sub.id}`}
                                onClick={() => onSelectTaskDetails(sub)}
                                style={{
                                  background: "rgba(0, 0, 0, 0.15)",
                                  fontSize: 11,
                                  cursor: "pointer",
                                }}
                              >
                                <td style={{ paddingLeft: 24, fontWeight: 700, color: "var(--vgui-accent)" }}>
                                  └── ↳ {sub.key}
                                </td>
                                <td style={{ paddingLeft: 20 }}>
                                  <label
                                    style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={sub.status === "done"}
                                      onChange={(e) => {
                                        soundEngine.play("click");
                                        onUpdateTask(sub.id, { status: e.target.checked ? "done" : "todo" });
                                      }}
                                    />
                                    <span
                                      style={{
                                        textDecoration: sub.status === "done" ? "line-through" : "none",
                                        color: sub.status === "done" ? "var(--vgui-muted)" : "inherit",
                                      }}
                                    >
                                      {sub.title}
                                    </span>
                                  </label>
                                </td>
                                <td>
                                  <span
                                    className="task-status-badge"
                                    style={{
                                      fontSize: 10,
                                      padding: "1px 5px",
                                      background: STATUSES.find((s) => s.key === sub.status)?.color || "var(--vgui-base)",
                                    }}
                                  >
                                    {sub.status.toUpperCase()}
                                  </span>
                                </td>
                                <td>{PRIORITY_BADGES[sub.priority]?.icon}</td>
                                <td>{sub.category || "—"}</td>
                                <td>{sub.assignees?.join(", ") || "—"}</td>
                                <td>{sub.dueDate ? new Date(sub.dueDate).toLocaleDateString() : "—"}</td>
                                <td>
                                  {sub.labels?.map((l) => (
                                    <span key={l} className="task-chip">
                                      #{l}
                                    </span>
                                  )) || "—"}
                                </td>
                                <td>—</td>
                                <td>
                                  {onAddStickyForTask && (
                                    <button
                                      type="button"
                                      className="btn ghost"
                                      style={{ padding: "1px 4px", fontSize: 10 }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onAddStickyForTask(sub);
                                      }}
                                    >
                                      📝
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </Fragment>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}

          {/* VIEW 3: TIMELINE / GANTT */}
          {viewMode === "timeline" && (
            <div className="task-timeline-container">
              <div className="task-timeline-header">
                <span>📅 Project Schedule &amp; Gantt Bars</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: "var(--vgui-muted)" }}>
                  {filteredTasks.length} {filteredTasks.length === 1 ? "task" : "tasks"} · {timelineTimeRange.totalDays}d span
                </span>
              </div>

              {/* Time Scale Ruler */}
              <div className="task-timeline-ruler">
                <div className="task-timeline-label" style={{ fontSize: 11, color: "var(--vgui-muted)" }}>
                  Deliverable / Task
                </div>
                <div className="task-timeline-ruler-track">
                  {timelineTimeRange.ticks.map((tick, i) => (
                    <div key={i} className="task-timeline-tick" style={{ left: `${tick.leftPct}%` }}>
                      <span>{tick.label}</span>
                    </div>
                  ))}
                  {timelineTimeRange.todayPct >= 0 && timelineTimeRange.todayPct <= 100 && (
                    <div
                      className="task-timeline-today-marker"
                      style={{ left: `${timelineTimeRange.todayPct}%` }}
                      title="Current Date"
                    >
                      📍 Today
                    </div>
                  )}
                </div>
              </div>

              {/* Task Gantt Rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                {filteredTasks.length === 0 ? (
                  <div style={{ padding: 20, textAlign: "center", color: "var(--vgui-muted)", fontStyle: "italic" }}>
                    No tasks found matching current filters.
                  </div>
                ) : (
                  filteredTasks.map((t) => {
                    const ONE_DAY = 86400000;
                    const s = t.startDate || t.createdAt || Date.now();
                    const d = t.dueDate || (s + ONE_DAY * 7);
                    const durationDays = Math.max(1, Math.round((d - s) / ONE_DAY));
                    const leftPct = Math.max(
                      0,
                      Math.min(95, ((s - timelineTimeRange.minTime) / timelineTimeRange.totalDuration) * 100),
                    );
                    const rawWidthPct = ((Math.max(s + ONE_DAY, d) - s) / timelineTimeRange.totalDuration) * 100;
                    const widthPct = Math.max(4, Math.min(100 - leftPct, rawWidthPct));

                    return (
                      <div
                        key={t.id}
                        className="task-timeline-row"
                        onClick={() => onSelectTaskDetails(t)}
                        title={`Click to inspect ${t.key}: ${t.title}`}
                      >
                        <div className="task-timeline-label" title={`${t.key} - ${t.title}`}>
                          {t.key} - {t.title}
                        </div>
                        <div className="task-timeline-track">
                          {timelineTimeRange.todayPct >= 0 && timelineTimeRange.todayPct <= 100 && (
                            <div
                              className="task-timeline-today-line"
                              style={{ left: `${timelineTimeRange.todayPct}%` }}
                            />
                          )}
                          <div
                            className="task-timeline-bar"
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              background:
                                t.status === "done"
                                  ? "var(--ok, #48bb78)"
                                  : t.status === "blocked"
                                  ? "var(--err, #e53e3e)"
                                  : t.status === "in_progress"
                                  ? "#d69e2e"
                                  : t.status === "review"
                                  ? "#805ad5"
                                  : "var(--vgui-selected-bg)",
                            }}
                            title={`Start: ${new Date(s).toLocaleDateString()} → Due: ${new Date(d).toLocaleDateString()} (${durationDays}d)`}
                          >
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {t.status.toUpperCase()} ({durationDays}d)
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* VIEW 4: CALENDAR */}
          {viewMode === "calendar" && (
            <div className="task-timeline-container">
              <div className="task-timeline-header">
                🗓️ Task Deadlines &amp; Milestones (Monthly Grid)
              </div>
              <div className="task-calendar-grid">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} style={{ fontWeight: 700, fontSize: 12, textAlign: "center", padding: 4 }}>
                    {d}
                  </div>
                ))}
                {Array.from({ length: 28 }).map((_, idx) => (
                  <div key={idx} className="task-calendar-cell">
                    <div className="task-calendar-day-num">{idx + 1}</div>
                    {filteredTasks.slice(idx % 4, (idx % 4) + 1).map((t) => (
                      <div
                        key={t.id}
                        className="task-calendar-pill"
                        onClick={() => onSelectTaskDetails(t)}
                        title={`${t.key} ${t.title}`}
                      >
                        {t.key} {t.title}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW: SPRINTS & BACKLOG */}
          {viewMode === "sprints" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", overflowX: "auto", overflowY: "auto", minWidth: 920 }}>
              {/* Sprint Action Bar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                  🏃 Sprint Planning &amp; Backlog Queue
                </div>
                {onCreateSprint && (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => setShowCreateSprint((v) => !v)}
                  >
                    {showCreateSprint ? "Cancel" : "+ New Sprint"}
                  </button>
                )}
              </div>

              {/* Create Sprint Form Drawer */}
              {showCreateSprint && onCreateSprint && (
                <div className="task-metric-card" style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Create New Sprint</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px auto", gap: 8, alignItems: "center" }}>
                    <input
                      type="text"
                      className="task-input"
                      placeholder={`Sprint ${sprints.length + 1}`}
                      value={newSprintName}
                      onChange={(e) => setNewSprintName(e.target.value)}
                    />
                    <input
                      type="text"
                      className="task-input"
                      placeholder="Sprint goal (e.g. Core MVP launch)..."
                      value={newSprintGoal}
                      onChange={(e) => setNewSprintGoal(e.target.value)}
                    />
                    <select
                      className="task-select"
                      value={newSprintDurationWeeks}
                      onChange={(e) => setNewSprintDurationWeeks(Number(e.target.value))}
                    >
                      <option value={1}>1 Week</option>
                      <option value={2}>2 Weeks</option>
                      <option value={3}>3 Weeks</option>
                      <option value={4}>4 Weeks</option>
                    </select>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        const now = Date.now();
                        onCreateSprint({
                          name: newSprintName.trim() || `Sprint ${sprints.length + 1}`,
                          goal: newSprintGoal.trim() || undefined,
                          startDate: now,
                          endDate: now + newSprintDurationWeeks * 7 * 86400000,
                          status: "planning",
                        });
                        setNewSprintName("");
                        setNewSprintGoal("");
                        setShowCreateSprint(false);
                        soundEngine.play("create");
                      }}
                    >
                      Save Sprint
                    </button>
                  </div>
                </div>
              )}

              {/* Sprints & Backlog Split Container */}
              <div className="task-sprint-container">
                {/* Backlog Column */}
                <div className="task-backlog-panel">
                  <div className="task-backlog-header">
                    <span>📦 Backlog ({tasks.filter((t) => !t.sprintId).length})</span>
                    <span style={{ fontSize: 11, color: "var(--vgui-muted)" }}>Unassigned</span>
                  </div>
                  <div className="task-backlog-list">
                    {tasks.filter((t) => !t.sprintId).length === 0 ? (
                      <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--vgui-muted)" }}>
                        Backlog is empty! All tasks are in sprints.
                      </div>
                    ) : (
                      tasks
                        .filter((t) => !t.sprintId)
                        .map((t) => (
                          <div
                            key={t.id}
                            className="task-kanban-card"
                            style={{ padding: "8px 10px" }}
                            onClick={() => onSelectTaskDetails(t)}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                              <span style={{ fontWeight: 700, color: "var(--vgui-accent)" }}>{t.key}</span>
                              <span>{PRIORITY_BADGES[t.priority].icon}</span>
                            </div>
                            <div className="task-card-title" style={{ fontSize: 12, marginTop: 4 }}>
                              {t.title}
                            </div>
                            {sprints.length > 0 && (
                              <div style={{ marginTop: 6, display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                                <select
                                  className="task-select"
                                  style={{ fontSize: 11, padding: "1px 4px" }}
                                  value=""
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      soundEngine.play("click");
                                      onUpdateTask(t.id, { sprintId: e.target.value });
                                    }
                                  }}
                                >
                                  <option value="">➔ Add to Sprint…</option>
                                  {sprints.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name} ({s.status})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* Sprints Column */}
                <div className="task-sprints-panel">
                  {sprints.length === 0 ? (
                    <div className="task-metric-card" style={{ textAlign: "center", padding: 32 }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>🏃</div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>No sprints configured yet</div>
                      <div style={{ fontSize: 12, color: "var(--vgui-muted)", marginTop: 4, marginBottom: 12 }}>
                        Create your first sprint to organize tasks into 1–4 week time-boxed iterations.
                      </div>
                      {onCreateSprint && (
                        <button
                          type="button"
                          className="btn primary"
                          onClick={() => setShowCreateSprint(true)}
                        >
                          + Create First Sprint
                        </button>
                      )}
                    </div>
                  ) : (
                    sprints.map((s) => {
                      const sTasks = tasks.filter((t) => t.sprintId === s.id);
                      const sDone = sTasks.filter((t) => t.status === "done").length;
                      const sPct = sTasks.length > 0 ? Math.round((sDone / sTasks.length) * 100) : 0;

                      return (
                        <div key={s.id} className="task-sprint-card">
                          <div className="task-sprint-card-header">
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</span>
                              <span className={`task-sprint-badge ${s.status}`}>{s.status}</span>
                              <span style={{ fontSize: 11, color: "var(--vgui-muted)" }}>
                                {new Date(s.startDate).toLocaleDateString()} – {new Date(s.endDate).toLocaleDateString()}
                              </span>
                            </div>

                            <div style={{ display: "flex", gap: 6 }}>
                              {s.status === "planning" && onUpdateSprint && (
                                <button
                                  type="button"
                                  className="btn primary"
                                  style={{ fontSize: 11, padding: "2px 8px" }}
                                  onClick={() => {
                                    soundEngine.play("click");
                                    onUpdateSprint(s.id, { status: "active" });
                                  }}
                                >
                                  ▶ Start Sprint
                                </button>
                              )}
                              {s.status === "active" && onUpdateSprint && (
                                <button
                                  type="button"
                                  className="btn ok"
                                  style={{ fontSize: 11, padding: "2px 8px", background: "var(--ok, #38a169)", color: "#fff" }}
                                  onClick={() => {
                                    soundEngine.play("ping");
                                    onUpdateSprint(s.id, { status: "completed" });
                                  }}
                                >
                                  ✓ Complete Sprint
                                </button>
                              )}
                              {onDeleteSprint && (
                                <button
                                  type="button"
                                  className="btn ghost"
                                  style={{ fontSize: 11, padding: "2px 6px" }}
                                  onClick={() => {
                                    soundEngine.play("delete");
                                    onDeleteSprint(s.id);
                                  }}
                                  title="Delete Sprint"
                                >
                                  🗑
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="task-sprint-card-body">
                            {s.goal && (
                              <div style={{ fontSize: 12, color: "var(--vgui-muted)", fontStyle: "italic" }}>
                                🎯 Goal: {s.goal}
                              </div>
                            )}

                            {/* Progress Bar */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600 }}>
                                <span>Progress: {sDone} of {sTasks.length} tasks completed</span>
                                <span>{sPct}%</span>
                              </div>
                              <div className="task-progress-bar-track">
                                <div className="task-progress-bar-fill" style={{ width: `${sPct}%` }} />
                              </div>
                            </div>

                            {/* Sprint Tasks List */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                              {sTasks.length === 0 ? (
                                <div style={{ fontSize: 12, color: "var(--vgui-muted)", textAlign: "center", padding: 8 }}>
                                  No tasks in this sprint yet. Add tasks from the backlog!
                                </div>
                              ) : (
                                sTasks.map((t) => (
                                  <div
                                    key={t.id}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      padding: "6px 10px",
                                      background: "var(--vgui-canvas, #101410)",
                                      border: "1px solid var(--vgui-border, #455243)",
                                      borderRadius: 2,
                                      cursor: "pointer",
                                    }}
                                    onClick={() => onSelectTaskDetails(t)}
                                  >
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <span style={{ fontWeight: 700, fontSize: 11, color: "var(--vgui-accent)" }}>
                                        {t.key}
                                      </span>
                                      <span style={{ fontSize: 12 }}>{t.title}</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                                      <select
                                        className="task-select"
                                        style={{ fontSize: 11, padding: "1px 4px" }}
                                        value={t.status}
                                        onChange={(e) => {
                                          soundEngine.play("click");
                                          onUpdateTask(t.id, { status: e.target.value as TaskStatus });
                                        }}
                                      >
                                        {STATUSES.map((st) => (
                                          <option key={st.key} value={st.key}>
                                            {st.label}
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        type="button"
                                        className="btn ghost"
                                        style={{ fontSize: 10, padding: "1px 5px" }}
                                        title="Move back to backlog"
                                        onClick={() => {
                                          soundEngine.play("click");
                                          onUpdateTask(t.id, { sprintId: undefined });
                                        }}
                                      >
                                        ⬇ Backlog
                                      </button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW: MILESTONES */}
          {viewMode === "milestones" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                  🎯 Project Milestones &amp; Release Roadmap
                </div>
                {onCreateMilestone && (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => setShowCreateMilestone((v) => !v)}
                  >
                    {showCreateMilestone ? "Cancel" : "+ New Milestone"}
                  </button>
                )}
              </div>

              {/* Create Milestone Drawer */}
              {showCreateMilestone && onCreateMilestone && (
                <div className="task-metric-card" style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Create Project Milestone</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px auto", gap: 8, alignItems: "center" }}>
                    <input
                      type="text"
                      className="task-input"
                      placeholder="Milestone title (e.g. Beta v1.0 Release)..."
                      value={newMilestoneTitle}
                      onChange={(e) => setNewMilestoneTitle(e.target.value)}
                    />
                    <input
                      type="text"
                      className="task-input"
                      placeholder="Description / key deliverables..."
                      value={newMilestoneDesc}
                      onChange={(e) => setNewMilestoneDesc(e.target.value)}
                    />
                    <select
                      className="task-select"
                      value={newMilestoneDays}
                      onChange={(e) => setNewMilestoneDays(Number(e.target.value))}
                    >
                      <option value={7}>Due in 1 Week</option>
                      <option value={14}>Due in 2 Weeks</option>
                      <option value={30}>Due in 1 Month</option>
                      <option value={60}>Due in 2 Months</option>
                      <option value={90}>Due in 1 Quarter</option>
                    </select>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        const now = Date.now();
                        onCreateMilestone({
                          title: newMilestoneTitle.trim() || `Milestone ${milestones.length + 1}`,
                          description: newMilestoneDesc.trim() || undefined,
                          targetDate: now + newMilestoneDays * 86400000,
                          status: "open",
                          associatedTaskIds: [],
                        });
                        setNewMilestoneTitle("");
                        setNewMilestoneDesc("");
                        setShowCreateMilestone(false);
                        soundEngine.play("create");
                      }}
                    >
                      Save Milestone
                    </button>
                  </div>
                </div>
              )}

              {/* Milestones Grid */}
              <div className="task-milestones-grid">
                {milestones.length === 0 ? (
                  <div className="task-metric-card" style={{ textAlign: "center", padding: 32, gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>🎯</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>No milestones configured yet</div>
                    <div style={{ fontSize: 12, color: "var(--vgui-muted)", marginTop: 4, marginBottom: 12 }}>
                      Track major deadlines, client deliverables, and releases with milestone gauges.
                    </div>
                    {onCreateMilestone && (
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => setShowCreateMilestone(true)}
                      >
                        + Create First Milestone
                      </button>
                    )}
                  </div>
                ) : (
                  milestones.map((m) => {
                    const mTasks = tasks.filter(
                      (t) => m.associatedTaskIds?.includes(t.id) || t.milestoneId === m.id,
                    );
                    const mDone = mTasks.filter((t) => t.status === "done").length;
                    const mPct = mTasks.length > 0 ? Math.round((mDone / mTasks.length) * 100) : 0;
                    const now = Date.now();
                    const daysLeft = Math.ceil((m.targetDate - now) / 86400000);

                    return (
                      <div key={m.id} className="task-milestone-card">
                        <div className="task-milestone-header">
                          <div>
                            <div className="task-milestone-title">{m.title}</div>
                            {m.description && (
                              <div style={{ fontSize: 12, color: "var(--vgui-muted)", marginTop: 2 }}>
                                {m.description}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                fontSize: 11,
                                padding: "2px 7px",
                                borderRadius: 2,
                                fontWeight: 700,
                                background:
                                  m.status === "reached"
                                    ? "var(--ok, #38a169)"
                                    : daysLeft < 0
                                    ? "var(--err, #e53e3e)"
                                    : "var(--vgui-accent)",
                                color: "#fff",
                              }}
                            >
                              {m.status === "reached"
                                ? "🏆 Reached"
                                : daysLeft < 0
                                ? `⚠️ Overdue ${Math.abs(daysLeft)}d`
                                : `⏳ ${daysLeft}d left`}
                            </span>
                            {onDeleteMilestone && (
                              <button
                                type="button"
                                className="btn ghost"
                                style={{ fontSize: 11, padding: "2px 5px" }}
                                onClick={() => {
                                  soundEngine.play("delete");
                                  onDeleteMilestone(m.id);
                                }}
                                title="Delete Milestone"
                              >
                                🗑
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600 }}>
                            <span>Target: {new Date(m.targetDate).toLocaleDateString()}</span>
                            <span>{mDone} of {mTasks.length} tasks ({mPct}%)</span>
                          </div>
                          <div className="task-progress-bar-track">
                            <div className="task-progress-bar-fill" style={{ width: `${mPct}%` }} />
                          </div>
                        </div>

                        {/* Associated Tasks */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--vgui-muted)" }}>
                            Associated Deliverables ({mTasks.length}):
                          </div>
                          {mTasks.slice(0, 4).map((t) => (
                            <div
                              key={t.id}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: 11,
                                padding: "3px 6px",
                                background: "var(--vgui-canvas, #101410)",
                                borderRadius: 2,
                                cursor: "pointer",
                              }}
                              onClick={() => onSelectTaskDetails(t)}
                            >
                              <span>{t.key} - {t.title}</span>
                              <span style={{ fontWeight: 600 }}>{t.status}</span>
                            </div>
                          ))}
                          {mTasks.length > 4 && (
                            <div style={{ fontSize: 10, color: "var(--vgui-muted)", textAlign: "center" }}>
                              + {mTasks.length - 4} more tasks
                            </div>
                          )}
                        </div>

                        {/* Quick Action */}
                        {onUpdateMilestone && (
                          <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className={`btn ${m.status === "reached" ? "ghost" : "primary"}`}
                              style={{ fontSize: 11, padding: "2px 8px" }}
                              onClick={() => {
                                soundEngine.play(m.status === "reached" ? "click" : "ping");
                                onUpdateMilestone(m.id, {
                                  status: m.status === "reached" ? "open" : "reached",
                                });
                              }}
                            >
                              {m.status === "reached" ? "Reopen Milestone" : "Mark as Reached 🏆"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* VIEW: TEAM & ROLES */}
          {viewMode === "team" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 700, overflowX: "auto" }}>
              {/* Team Summary Bar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                    👥 Team Members &amp; GitHub Collaborators
                  </div>
                  <div style={{ fontSize: 12, color: "var(--vgui-muted)", marginTop: 2 }}>
                    Manage repository collaborators, custom project roles, and track workload distribution.
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {onSyncRepoCollaborators && (
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ fontSize: 11, padding: "3px 8px" }}
                      disabled={isSyncingCollabs}
                      onClick={async () => {
                        setIsSyncingCollabs(true);
                        soundEngine.play("click");
                        try {
                          const count = await onSyncRepoCollaborators();
                          setSyncMessage(`✓ Synced ${count || 0} collaborators from GitHub`);
                          setTimeout(() => setSyncMessage(null), 4500);
                        } catch {
                          setSyncMessage("⚠️ GitHub sync failed or rate limited");
                          setTimeout(() => setSyncMessage(null), 4500);
                        } finally {
                          setIsSyncingCollabs(false);
                        }
                      }}
                      title="Fetch latest collaborators and contributors from GitHub repository"
                    >
                      {isSyncingCollabs ? "⏳ Syncing..." : "🔄 Sync GitHub Collaborators"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => {
                      setShowAddMember(!showAddMember);
                      soundEngine.play("click");
                    }}
                  >
                    👤 {showAddMember ? "Cancel Member" : "+ Add Member"}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => {
                      setShowAddCustomRole(!showAddCustomRole);
                      soundEngine.play("click");
                    }}
                  >
                    🏷️ {showAddCustomRole ? "Cancel Role" : "+ Custom Role"}
                  </button>
                  <div className="task-count-pill" style={{ fontSize: 12 }}>
                    {teamMembers.length} {teamMembers.length === 1 ? "Member" : "Members"}
                  </div>
                </div>
              </div>

              {/* Sync Status Banner */}
              {syncMessage && (
                <div
                  style={{
                    padding: "6px 12px",
                    fontSize: 12,
                    borderRadius: 3,
                    background: syncMessage.startsWith("✓") ? "rgba(72, 187, 120, 0.15)" : "rgba(229, 62, 62, 0.15)",
                    color: syncMessage.startsWith("✓") ? "var(--ok, #48bb78)" : "var(--err, #e53e3e)",
                    border: `1px solid ${syncMessage.startsWith("✓") ? "var(--ok, #48bb78)" : "var(--err, #e53e3e)"}`,
                  }}
                >
                  {syncMessage}
                </div>
              )}

              {/* Add Member Panel */}
              {showAddMember && onAddMember && (
                <div
                  style={{
                    padding: 12,
                    background: "var(--vgui-base, #1b2219)",
                    border: "1px solid var(--vgui-border, #455243)",
                    borderRadius: 3,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12, color: "var(--vgui-accent)" }}>
                    👤 Add Team Member / GitHub Collaborator
                  </div>
                  <div style={{ fontSize: 11, color: "var(--vgui-muted)" }}>
                    Enter any team member or GitHub handle (e.g. <code>nikoraasu</code>, <code>octocat</code>, <code>Sarah</code>). GitHub avatars and roles will automatically link.
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="text"
                      className="task-input"
                      placeholder="Username or Member Name (e.g. nikoraasu, Sarah)..."
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newMemberName.trim()) {
                          const trimmed = newMemberName.trim();
                          onAddMember({
                            name: trimmed,
                            role: newMemberRole,
                            avatarUrl: !trimmed.includes(" ") ? `https://github.com/${trimmed}.png` : undefined,
                            isRepoCollaborator: !trimmed.includes(" "),
                          });
                          setNewMemberName("");
                          setShowAddMember(false);
                          soundEngine.play("create");
                        }
                      }}
                      style={{ flex: 2 }}
                    />
                    <select
                      className="task-select"
                      value={newMemberRole}
                      onChange={(e) => setNewMemberRole(e.target.value)}
                      style={{ flex: 1 }}
                    >
                      {allRoles.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.icon} {r.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn primary"
                      style={{ fontSize: 11, padding: "4px 12px" }}
                      disabled={!newMemberName.trim()}
                      onClick={() => {
                        const trimmed = newMemberName.trim();
                        onAddMember({
                          name: trimmed,
                          role: newMemberRole,
                          avatarUrl: !trimmed.includes(" ") ? `https://github.com/${trimmed}.png` : undefined,
                          isRepoCollaborator: !trimmed.includes(" "),
                        });
                        setNewMemberName("");
                        setShowAddMember(false);
                        soundEngine.play("create");
                      }}
                    >
                      + Add to Team
                    </button>
                  </div>
                </div>
              )}

              {/* Add Custom Role Panel */}
              {showAddCustomRole && onAddCustomRole && (
                <div
                  style={{
                    padding: 12,
                    background: "var(--vgui-base, #1b2219)",
                    border: "1px solid var(--vgui-border, #455243)",
                    borderRadius: 3,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12, color: "var(--vgui-accent)" }}>
                    ✨ Define New Custom Project Role
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="text"
                      className="task-input"
                      placeholder="Role title (e.g. Game Designer, Sound Engineer)..."
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      style={{ flex: 2 }}
                    />
                    <input
                      type="text"
                      className="task-input"
                      placeholder="Icon / Emoji (e.g. 🎮)"
                      value={newRoleIcon}
                      onChange={(e) => setNewRoleIcon(e.target.value)}
                      style={{ width: 80, textAlign: "center" }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 11, color: "var(--vgui-muted)" }}>Color:</span>
                      <input
                        type="color"
                        value={newRoleColor}
                        onChange={(e) => setNewRoleColor(e.target.value)}
                        style={{ width: 32, height: 26, padding: 0, border: "none", cursor: "pointer", background: "none" }}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn primary"
                      style={{ fontSize: 11, padding: "4px 10px" }}
                      disabled={!newRoleName.trim()}
                      onClick={() => {
                        onAddCustomRole({
                          name: newRoleName.trim(),
                          icon: newRoleIcon.trim() || "🏷️",
                          color: newRoleColor,
                        });
                        setNewRoleName("");
                        setNewRoleIcon("🏷️");
                        setShowAddCustomRole(false);
                        soundEngine.play("create");
                      }}
                    >
                      Create Role
                    </button>
                  </div>
                </div>
              )}

              {/* Team Members Grid */}
              <div className="task-team-grid">
                {teamMembers.length === 0 ? (
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      padding: 24,
                      textAlign: "center",
                      color: "var(--vgui-muted)",
                      background: "var(--vgui-base, #1b2219)",
                      border: "1px dashed var(--vgui-border, #455243)",
                      borderRadius: 4,
                    }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 8 }}>👥</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>
                      No Team Members or Collaborators Visible Yet
                    </div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                      Use <b>+ Add Member</b> to register team members by name or GitHub handle, or click <b>🔄 Sync GitHub Collaborators</b> to fetch repository contributors.
                    </div>
                  </div>
                ) : (
                  teamMembers.map((member) => {
                    const workloadStatus =
                      member.assignedTasks.length > 5
                        ? "heavy"
                        : member.assignedTasks.length > 2
                        ? "optimal"
                        : "light";

                    return (
                      <div key={member.name} className="task-member-card">
                        {/* Header */}
                        <div className="task-member-header">
                          <div className="task-member-info">
                            {member.avatarUrl ? (
                              <img
                                src={member.avatarUrl}
                                alt={member.name}
                                className="task-member-avatar"
                                style={{ objectFit: "cover" }}
                              />
                            ) : (
                              <div className="task-member-avatar">
                                {member.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <span>{member.name}</span>
                                {member.isOnline && (
                                  <span style={{ fontSize: 10, color: "var(--ok, #48bb78)" }} title="Online now">
                                    🟢 Online
                                  </span>
                                )}
                                {member.isRepoCollaborator && (
                                  <span
                                    className="task-chip"
                                    style={{
                                      fontSize: 9,
                                      background: "#24292e",
                                      color: "#ffffff",
                                      padding: "0 4px",
                                      border: "1px solid #444",
                                    }}
                                    title={`Repository ${member.repoRole || "Collaborator"}`}
                                  >
                                    🐙 {member.repoRole || "Repo"}
                                  </span>
                                )}
                                {member.name === currentUserName && (
                                  <span style={{ fontSize: 10, color: "var(--vgui-muted)" }}>(You)</span>
                                )}
                              </div>
                              <div style={{ marginTop: 4 }}>
                                <select
                                  className="task-select"
                                  style={{ fontSize: 11, padding: "1px 6px" }}
                                  value={member.role}
                                  onChange={(e) => {
                                    const newRole = e.target.value;
                                    soundEngine.play("click");
                                    if (onSetMemberRole) {
                                      onSetMemberRole(member.name, newRole);
                                    } else {
                                      member.assignedTasks.forEach((t) => {
                                        onUpdateTask(t.id, {
                                          roles: { ...(t.roles || {}), [member.name]: newRole },
                                        });
                                      });
                                    }
                                  }}
                                >
                                  {allRoles.map((r) => (
                                    <option key={r.value} value={r.value}>
                                      {r.icon} {r.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span className={`task-workload-badge ${workloadStatus}`}>
                              {workloadStatus === "heavy"
                                ? "🔥 High Load"
                                : workloadStatus === "optimal"
                                ? "✓ Optimal"
                                : "⚡ Available"}
                            </span>
                            {onRemoveMember && member.name !== currentUserName && (
                              <button
                                type="button"
                                className="btn ghost"
                                style={{ padding: "1px 6px", fontSize: 10, color: "var(--err, #e53e3e)" }}
                                title={`Remove ${member.name} from team`}
                                onClick={() => {
                                  soundEngine.play("click");
                                  onRemoveMember(member.name);
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>

                      {/* Workload Meter */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600 }}>
                          <span>
                            Active Tasks: {member.assignedTasks.length} ({member.doneCount} done)
                          </span>
                          <span style={{ color: member.overdueCount > 0 ? "var(--err)" : "var(--vgui-muted)" }}>
                            {member.overdueCount > 0 ? `⚠️ ${member.overdueCount} overdue` : "On schedule"}
                          </span>
                        </div>
                        <div className="task-progress-bar-track">
                          <div
                            className="task-progress-bar-fill"
                            style={{
                              width: `${Math.min(100, (member.assignedTasks.length / 6) * 100)}%`,
                              background:
                                workloadStatus === "heavy"
                                  ? "var(--err, #e53e3e)"
                                  : workloadStatus === "optimal"
                                  ? "var(--ok, #48bb78)"
                                  : "var(--vgui-accent, #3182ce)",
                            }}
                          />
                        </div>
                      </div>

                      {/* Assigned Tasks Quick List */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4, flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--vgui-muted)" }}>
                          Assigned Deliverables ({member.assignedTasks.length}):
                        </div>
                        {member.assignedTasks.length === 0 ? (
                          <div style={{ fontSize: 11, color: "var(--vgui-muted)", fontStyle: "italic", padding: "6px 0" }}>
                            No tasks currently assigned to {member.name}.
                          </div>
                        ) : (
                          member.assignedTasks.slice(0, 4).map((t) => (
                            <div
                              key={t.id}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                fontSize: 11,
                                padding: "4px 8px",
                                background: "var(--vgui-canvas, #101410)",
                                border: "1px solid var(--vgui-border, #455243)",
                                borderRadius: 2,
                                cursor: "pointer",
                              }}
                              onClick={() => onSelectTaskDetails(t)}
                            >
                              <span style={{ fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {t.key} - {t.title}
                              </span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--vgui-accent)" }}>
                                {t.status}
                              </span>
                            </div>
                          ))
                        )}
                        {member.assignedTasks.length > 4 && (
                          <div style={{ fontSize: 10, color: "var(--vgui-muted)", textAlign: "center" }}>
                            + {member.assignedTasks.length - 4} more tasks
                          </div>
                        )}
                      </div>

                      {/* Quick Assign Dropdown */}
                      <div style={{ marginTop: "auto", paddingTop: 8, borderTop: "1px solid var(--vgui-border, #455243)" }}>
                        <select
                          className="task-select"
                          style={{ width: "100%", fontSize: 11 }}
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            soundEngine.play("click");
                            const targetTask = tasks.find((t) => t.id === e.target.value);
                            if (targetTask) {
                              const existingAssignees = targetTask.assignees || [];
                              if (!existingAssignees.includes(member.name)) {
                                onUpdateTask(targetTask.id, {
                                  assignees: [...existingAssignees, member.name],
                                  roles: { ...(targetTask.roles || {}), [member.name]: member.role },
                                });
                              }
                            }
                          }}
                        >
                          <option value="">+ Assign Task to {member.name}…</option>
                          {tasks
                            .filter((t) => !t.assignees?.includes(member.name))
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.key} - {t.title} ({t.status})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  );
                }))}
              </div>

              {/* Role Matrix Distribution */}
              <div className="task-metric-card" style={{ marginTop: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  🎯 Project Roles &amp; Responsibilities Matrix
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                  {allRoles.map((role) => {
                    const membersWithRole = teamMembers.filter((m) => m.role === role.value);
                    const tasksForRole = tasks.filter((t) =>
                      Object.values(t.roles || {}).includes(role.value),
                    );

                    return (
                      <div
                        key={role.value}
                        style={{
                          padding: 10,
                          background: "var(--vgui-canvas, #101410)",
                          border: `1px solid ${role.color || "var(--vgui-border, #455243)"}`,
                          borderRadius: 2,
                          position: "relative",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span>{role.icon}</span>
                            <span>{role.label}</span>
                          </span>
                          {role.isCustom && role.id && onDeleteCustomRole && (
                            <button
                              type="button"
                              className="btn ghost"
                              style={{ padding: "0 4px", fontSize: 10, color: "var(--err, #e53e3e)" }}
                              title="Delete custom role"
                              onClick={() => {
                                onDeleteCustomRole(role.id!);
                                soundEngine.play("delete");
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--vgui-muted)", marginTop: 4 }}>
                          {membersWithRole.length === 0
                            ? "No assignees yet"
                            : membersWithRole.map((m) => m.name).join(", ")}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--vgui-accent)", marginTop: 2 }}>
                          {tasksForRole.length} {tasksForRole.length === 1 ? "task" : "tasks"} configured
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 5: ANALYTICS DASHBOARD */}
          {viewMode === "dashboard" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Metric Cards Row */}
              <div className="task-metric-grid">
                <div className="task-metric-card">
                  <div className="task-metric-label">Overall Completion</div>
                  <div className="task-metric-value" style={{ color: "var(--ok, #38a169)" }}>
                    {metrics.completionRate}%
                  </div>
                  <div style={{ fontSize: 11, color: "var(--vgui-muted)" }}>
                    {metrics.completed} of {metrics.total} finished
                  </div>
                </div>

                <div className="task-metric-card">
                  <div className="task-metric-label">In Progress</div>
                  <div className="task-metric-value" style={{ color: "var(--warn, #d69e2e)" }}>
                    {metrics.inProgress}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--vgui-muted)" }}>
                    Active tasks being worked on
                  </div>
                </div>

                <div className="task-metric-card">
                  <div className="task-metric-label">In Review / QA</div>
                  <div className="task-metric-value" style={{ color: "var(--vgui-accent)" }}>
                    {metrics.review}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--vgui-muted)" }}>
                    Ready for verification
                  </div>
                </div>

                <div className="task-metric-card">
                  <div className="task-metric-label">Blocked / Overdue</div>
                  <div className="task-metric-value" style={{ color: "var(--err, #e53e3e)" }}>
                    {metrics.blocked + metrics.overdue}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--vgui-muted)" }}>
                    {metrics.blocked} blocked, {metrics.overdue} overdue
                  </div>
                </div>
              </div>

              {/* Sprint Progress & Burndown */}
              {metrics.activeSprint && (
                <div className="task-metric-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      🏃 Active Sprint: {metrics.activeSprint.name}
                    </div>
                    <span className="task-sprint-badge active">Active</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600 }}>
                      <span>
                        Sprint Goal: {metrics.activeSprint.goal || "Complete sprint deliverables"}
                      </span>
                      <span>
                        {metrics.activeSprintDone} / {metrics.activeSprintTasks.length} tasks ({metrics.activeSprintPct}%)
                      </span>
                    </div>
                    <div className="task-progress-bar-track">
                      <div className="task-progress-bar-fill" style={{ width: `${metrics.activeSprintPct}%` }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Milestones Delivery Status */}
              {metrics.milestonesProgress.length > 0 && (
                <div className="task-metric-card">
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                    🎯 Milestone Delivery Health
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {metrics.milestonesProgress.map((m) => (
                      <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                          <span style={{ fontWeight: 600 }}>{m.title}</span>
                          <span style={{ color: m.daysLeft < 0 ? "var(--err)" : "var(--ok)", fontWeight: 700 }}>
                            {m.status === "reached"
                              ? "🏆 Reached"
                              : m.daysLeft < 0
                              ? `⚠️ ${Math.abs(m.daysLeft)}d overdue`
                              : `⏳ ${m.daysLeft}d left`} ({m.pct}%)
                          </span>
                        </div>
                        <div className="task-progress-bar-track">
                          <div className="task-progress-bar-fill" style={{ width: `${m.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming Deadlines */}
              {metrics.upcomingDeadlines.length > 0 && (
                <div className="task-metric-card">
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                    ⏰ Upcoming Deadlines
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {metrics.upcomingDeadlines.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => onSelectTaskDetails(t)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 12,
                          cursor: "pointer",
                          padding: "4px 8px",
                          background: "var(--vgui-base)",
                          borderRadius: 2,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {t.key} - {t.title}
                        </span>
                        <span style={{ color: "var(--vgui-accent)", fontWeight: 700 }}>
                          {new Date(t.dueDate!).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Workload by User */}
              <div className="task-metric-card">
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                  👥 Workload Distribution by Collaborator
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {Object.entries(metrics.userWorkload).map(([user, data]) => {
                    const pct = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
                    return (
                      <div key={user} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600 }}>
                          <span>👤 {user} ({data.total} tasks)</span>
                          <span>{data.done} done ({pct}%)</span>
                        </div>
                        <div className="task-progress-bar-track">
                          <div className="task-progress-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 6: AUTOMATIONS */}
          {viewMode === "automations" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 13, color: "var(--ink)" }}>
                Workflow Automations eliminate busywork by running event-driven rules when tasks or subtasks update.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {rules.map((r) => (
                  <div
                    key={r.id}
                    className="task-metric-card"
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>
                        {r.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--vgui-muted)", marginTop: 2 }}>
                        Trigger: <code>{r.trigger}</code> ➔ Action: <code>{r.action}</code>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`btn ${r.enabled ? "primary" : "ghost"}`}
                      onClick={() => handleToggleRule(r.id)}
                    >
                      {r.enabled ? "✓ Enabled" : "○ Disabled"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
