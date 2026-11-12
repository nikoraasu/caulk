import { useState, useMemo } from "react";
import type {
  TaskRecord,
  TaskStatus,
  TaskPriority,
  TaskType,
  TaskRole,
  SprintRecord,
  MilestoneRecord,
  CustomRoleRecord,
  MemberRecord,
} from "./types";
import type { RepoCollaborator } from "../../storage/github";
import { soundEngine } from "../../audio/soundEngine";
import { isTaskBlocked } from "./store";
import "./tasks.css";

type Props = {
  task: TaskRecord;
  allTasks: TaskRecord[];
  sprints?: SprintRecord[];
  milestones?: MilestoneRecord[];
  customRoles?: CustomRoleRecord[];
  members?: MemberRecord[];
  collaborators?: string[];
  repoCollaborators?: RepoCollaborator[];
  currentUserName: string;
  onCreateTask?: (partial: Partial<TaskRecord>) => TaskRecord | void;
  onUpdateTask: (taskId: string, updates: Partial<TaskRecord>) => void;
  onDeleteTask: (taskId: string) => void;
  onClose: () => void;
  onJumpToCard?: (cardElementId: string) => void;
  onAddStickyForTask?: (task: TaskRecord) => void;
  onAddCardToCanvas?: (task: TaskRecord) => void;
  onUnlinkElement?: (elementId: string) => void;
};

const STATUS_OPTIONS: { value: TaskStatus; label: string; bg: string }[] = [
  { value: "backlog", label: "Backlog", bg: "#718096" },
  { value: "todo", label: "To Do", bg: "#3182ce" },
  { value: "in_progress", label: "In Progress", bg: "#d69e2e" },
  { value: "review", label: "Review", bg: "#805ad5" },
  { value: "done", label: "Done", bg: "#38a169" },
  { value: "blocked", label: "Blocked", bg: "#e53e3e" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; icon: string }[] = [
  { value: "low", label: "Low", icon: "🔵" },
  { value: "medium", label: "Medium", icon: "🟡" },
  { value: "high", label: "High", icon: "🟠" },
  { value: "critical", label: "Critical", icon: "🔴" },
];

const TYPE_OPTIONS: { value: TaskType; label: string; icon: string }[] = [
  { value: "task", label: "Task", icon: "✅" },
  { value: "bug", label: "Bug", icon: "🪲" },
  { value: "story", label: "Story", icon: "📖" },
  { value: "epic", label: "Epic", icon: "⚡" },
];

const ROLE_OPTIONS: TaskRole[] = [
  "Backend Developer",
  "Frontend Developer",
  "Designer",
  "QA",
  "Project Manager",
  "DevOps",
  "Collaborator",
];

export function TaskDetailsModal({
  task,
  allTasks,
  sprints,
  milestones,
  customRoles = [],
  members = [],
  collaborators = [],
  repoCollaborators = [],
  currentUserName,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onClose,
  onJumpToCard,
  onAddStickyForTask,
  onAddCardToCanvas,
  onUnlinkElement,
}: Props) {
  const [activeTab, setActiveTab] = useState<"details" | "subtasks" | "dependencies" | "bug" | "activity">("details");
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newCommentBody, setNewCommentBody] = useState("");
  const [newAssigneeName, setNewAssigneeName] = useState("");
  const [newAssigneeRole, setNewAssigneeRole] = useState<string>("Frontend Developer");
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState(task.category || "");
  const [selectedBlockerId, setSelectedBlockerId] = useState("");
  const [selectedBlocksId, setSelectedBlocksId] = useState("");
  const [selectedRelatesId, setSelectedRelatesId] = useState("");

  const availableRoles: string[] = useMemo(() => {
    if (customRoles && customRoles.length > 0) {
      const list = customRoles.map((r) => r.name);
      for (const r of ROLE_OPTIONS) {
        if (!list.includes(r)) list.push(r);
      }
      return list;
    }
    return ROLE_OPTIONS;
  }, [customRoles]);

  const availableAssignees = useMemo(() => {
    const map = new Map<string, { name: string; role?: string; avatarUrl?: string; isRepo?: boolean }>();

    // 1. Repo collaborators from GitHub
    for (const rc of repoCollaborators) {
      map.set(rc.login, {
        name: rc.login,
        role: rc.role || "Collaborator",
        avatarUrl: rc.avatarUrl || `https://github.com/${rc.login}.png`,
        isRepo: true,
      });
    }

    // 2. Members from Yjs project_members
    for (const m of members) {
      const existing = map.get(m.name);
      map.set(m.name, {
        name: m.name,
        role: m.role || existing?.role || "Collaborator",
        avatarUrl:
          m.avatarUrl ||
          existing?.avatarUrl ||
          (!m.name.includes(" ") ? `https://github.com/${m.name}.png` : undefined),
        isRepo: m.isRepoCollaborator ?? existing?.isRepo,
      });
    }

    // 3. Online collaborators
    for (const c of collaborators) {
      if (!map.has(c)) {
        map.set(c, {
          name: c,
          role: "Collaborator",
          avatarUrl: !c.includes(" ") ? `https://github.com/${c}.png` : undefined,
        });
      }
    }

    // 4. Current user
    if (currentUserName && !map.has(currentUserName)) {
      map.set(currentUserName, {
        name: currentUserName,
        role: "Collaborator",
        avatarUrl: !currentUserName.includes(" ") ? `https://github.com/${currentUserName}.png` : undefined,
      });
    }

    // 5. Existing assignees across all tasks
    for (const t of allTasks || []) {
      for (const a of t.assignees || []) {
        if (!map.has(a)) {
          map.set(a, {
            name: a,
            role: t.roles?.[a] || "Collaborator",
            avatarUrl: !a.includes(" ") ? `https://github.com/${a}.png` : undefined,
          });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [repoCollaborators, members, collaborators, currentUserName, allTasks]);

  const unassignedMembers = useMemo(() => {
    return availableAssignees.filter((m) => !task.assignees.includes(m.name));
  }, [availableAssignees, task.assignees]);

  const subtasks = allTasks.filter((t) => task.subtaskIds.includes(t.id));
  const completedSubtasks = subtasks.filter((s) => s.status === "done").length;
  const subtaskProgress = subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;

  const blockedStatus = isTaskBlocked(task, allTasks);

  const handleSaveTitle = () => {
    if (title.trim() && title !== task.title) {
      onUpdateTask(task.id, { title: title.trim() });
    }
  };

  const handleSaveDescription = () => {
    if (description !== task.description) {
      onUpdateTask(task.id, { description });
    }
  };

  const handleSaveCategory = () => {
    if (newCategory.trim() !== (task.category || "")) {
      onUpdateTask(task.id, { category: newCategory.trim() || undefined });
    }
  };

  const handleAddAssignee = () => {
    if (!newAssigneeName.trim()) return;
    const name = newAssigneeName.trim();

    // Check if member has a persistent role
    const savedMember = members?.find((m) => m.name.toLowerCase() === name.toLowerCase());
    const roleToUse = savedMember?.role || newAssigneeRole;

    const nextAssignees = Array.from(new Set([...task.assignees, name]));
    const nextRoles = { ...task.roles, [name]: roleToUse };
    soundEngine.play("click");
    onUpdateTask(task.id, { assignees: nextAssignees, roles: nextRoles });
    setNewAssigneeName("");
  };

  const handleRemoveAssignee = (name: string) => {
    const nextAssignees = task.assignees.filter((a) => a !== name);
    const nextRoles = { ...task.roles };
    delete nextRoles[name];
    soundEngine.play("click");
    onUpdateTask(task.id, { assignees: nextAssignees, roles: nextRoles });
  };

  const handleAddLabel = () => {
    if (!newLabel.trim()) return;
    const clean = newLabel.trim().toLowerCase();
    if (!task.labels.includes(clean)) {
      onUpdateTask(task.id, { labels: [...task.labels, clean] });
    }
    setNewLabel("");
  };

  const handleRemoveLabel = (label: string) => {
    onUpdateTask(task.id, { labels: task.labels.filter((l) => l !== label) });
  };

  const handleAddComment = () => {
    if (!newCommentBody.trim()) return;
    const comment = {
      id: `comm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      authorId: currentUserName,
      authorName: currentUserName,
      createdAt: Date.now(),
      body: newCommentBody.trim(),
    };
    soundEngine.play("create");
    onUpdateTask(task.id, { comments: [...task.comments, comment] });
    setNewCommentBody("");
  };

  const handleAddQuickSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    const subtaskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const subtask: TaskRecord = {
      id: subtaskId,
      key: `${task.key}-${subtasks.length + 1}`,
      type: "task",
      title: newSubtaskTitle.trim(),
      description: "",
      status: "todo",
      priority: task.priority,
      assignees: [...task.assignees],
      roles: { ...task.roles },
      labels: [...task.labels],
      parentId: task.id,
      subtaskIds: [],
      dependencies: { blocks: [], blockedBy: [], relatesTo: [] },
      comments: [],
      activity: [],
      linkedElementIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (onCreateTask) {
      onCreateTask(subtask);
    } else {
      onUpdateTask(subtaskId, subtask);
    }
    if (!task.subtaskIds.includes(subtaskId)) {
      onUpdateTask(task.id, { subtaskIds: [...task.subtaskIds, subtaskId] });
    }
    setNewSubtaskTitle("");
    soundEngine.play("create");
  };

  // Dependency Management
  const handleAddBlockedBy = (blockerId: string) => {
    if (!blockerId || blockerId === task.id) return;
    const current = task.dependencies?.blockedBy || [];
    if (!current.includes(blockerId)) {
      onUpdateTask(task.id, {
        dependencies: {
          ...task.dependencies,
          blockedBy: [...current, blockerId],
        },
      });
      // Also update the blocker's `blocks` list
      const blocker = allTasks.find((t) => t.id === blockerId);
      if (blocker) {
        const blockerBlocks = blocker.dependencies?.blocks || [];
        if (!blockerBlocks.includes(task.id)) {
          onUpdateTask(blockerId, {
            dependencies: {
              ...blocker.dependencies,
              blocks: [...blockerBlocks, task.id],
            },
          });
        }
      }
    }
    setSelectedBlockerId("");
    soundEngine.play("click");
  };

  const handleRemoveBlockedBy = (blockerId: string) => {
    const current = task.dependencies?.blockedBy || [];
    onUpdateTask(task.id, {
      dependencies: {
        ...task.dependencies,
        blockedBy: current.filter((id) => id !== blockerId),
      },
    });
    // Remove from other task's `blocks`
    const blocker = allTasks.find((t) => t.id === blockerId);
    if (blocker) {
      onUpdateTask(blockerId, {
        dependencies: {
          ...blocker.dependencies,
          blocks: (blocker.dependencies?.blocks || []).filter((id) => id !== task.id),
        },
      });
    }
  };

  const handleAddBlocks = (blockedTaskId: string) => {
    if (!blockedTaskId || blockedTaskId === task.id) return;
    const current = task.dependencies?.blocks || [];
    if (!current.includes(blockedTaskId)) {
      onUpdateTask(task.id, {
        dependencies: {
          ...task.dependencies,
          blocks: [...current, blockedTaskId],
        },
      });
      const blockedTask = allTasks.find((t) => t.id === blockedTaskId);
      if (blockedTask) {
        const theirBlockedBy = blockedTask.dependencies?.blockedBy || [];
        if (!theirBlockedBy.includes(task.id)) {
          onUpdateTask(blockedTaskId, {
            dependencies: {
              ...blockedTask.dependencies,
              blockedBy: [...theirBlockedBy, task.id],
            },
          });
        }
      }
    }
    setSelectedBlocksId("");
    soundEngine.play("click");
  };

  const handleRemoveBlocks = (blockedTaskId: string) => {
    const current = task.dependencies?.blocks || [];
    onUpdateTask(task.id, {
      dependencies: {
        ...task.dependencies,
        blocks: current.filter((id) => id !== blockedTaskId),
      },
    });
    const blockedTask = allTasks.find((t) => t.id === blockedTaskId);
    if (blockedTask) {
      onUpdateTask(blockedTaskId, {
        dependencies: {
          ...blockedTask.dependencies,
          blockedBy: (blockedTask.dependencies?.blockedBy || []).filter((id) => id !== task.id),
        },
      });
    }
  };

  const handleAddRelates = (relId: string) => {
    if (!relId || relId === task.id) return;
    const current = task.dependencies?.relatesTo || [];
    if (!current.includes(relId)) {
      onUpdateTask(task.id, {
        dependencies: {
          ...task.dependencies,
          relatesTo: [...current, relId],
        },
      });
    }
    setSelectedRelatesId("");
    soundEngine.play("click");
  };

  const handleRemoveRelates = (relId: string) => {
    const current = task.dependencies?.relatesTo || [];
    onUpdateTask(task.id, {
      dependencies: {
        ...task.dependencies,
        relatesTo: current.filter((id) => id !== relId),
      },
    });
  };

  return (
    <div className="task-modal-backdrop" onClick={onClose}>
      <div
        className="window-frame modal-window task-details-window"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Task Details"
      >
        {/* Authentic Caulk Titlebar */}
        <div className="window-titlebar">
          <div className="window-title">
            <span className="window-lambda">
              {TYPE_OPTIONS.find((t) => t.value === task.type)?.icon}
            </span>
            <span>{task.key}</span>
            {task.canvasCardElementId && onJumpToCard && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => onJumpToCard(task.canvasCardElementId!)}
                style={{ fontSize: 11, padding: "1px 6px" }}
              >
                📍 Jump to Whiteboard Card
              </button>
            )}
            {blockedStatus.isBlocked && (
              <span
                style={{
                  fontSize: 11,
                  padding: "1px 6px",
                  background: "var(--err, #e53e3e)",
                  color: "#ffffff",
                  borderRadius: 2,
                  fontWeight: 700,
                }}
              >
                ⛔ Blocked by {blockedStatus.blockedByKeys.join(", ")}
              </span>
            )}
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

        {/* Tab Navigation */}
        <div className="task-view-bar">
          <div className="task-tab-strip">
            {[
              { id: "details", label: "Details" },
              { id: "subtasks", label: `Subtasks (${subtasks.length})` },
              {
                id: "dependencies",
                label: `Dependencies (${(task.dependencies?.blockedBy?.length || 0) + (task.dependencies?.blocks?.length || 0)})`,
              },
              ...(task.type === "bug" ? [{ id: "bug", label: "Bug Details" }] : []),
              { id: "activity", label: `Activity (${task.activity.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`task-tab-btn ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => {
                  soundEngine.play("click");
                  setActiveTab(tab.id as any);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Modal Body */}
        <div className="task-modal-body">
          {activeTab === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Title Input */}
              <div className="task-form-section">
                <label className="task-form-label">Title</label>
                <input
                  type="text"
                  className="task-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()}
                  style={{ fontSize: 15, fontWeight: 700, padding: "6px 8px" }}
                />
              </div>

              {/* Status, Priority, Type Quick Select Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                {/* Status */}
                <div className="task-form-section">
                  <label className="task-form-label">Status</label>
                  <select
                    className="task-select"
                    value={task.status}
                    onChange={(e) => {
                      soundEngine.play("click");
                      onUpdateTask(task.id, { status: e.target.value as TaskStatus });
                    }}
                    style={{ fontWeight: 600 }}
                  >
                    {STATUS_OPTIONS.map((st) => (
                      <option key={st.value} value={st.value}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Priority */}
                <div className="task-form-section">
                  <label className="task-form-label">Priority</label>
                  <select
                    className="task-select"
                    value={task.priority}
                    onChange={(e) => {
                      soundEngine.play("click");
                      onUpdateTask(task.id, { priority: e.target.value as TaskPriority });
                    }}
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.icon} {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Type */}
                <div className="task-form-section">
                  <label className="task-form-label">Type</label>
                  <select
                    className="task-select"
                    value={task.type}
                    onChange={(e) => {
                      soundEngine.play("click");
                      onUpdateTask(task.id, { type: e.target.value as TaskType });
                    }}
                  >
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.icon} {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category */}
                <div className="task-form-section">
                  <label className="task-form-label">Category</label>
                  <input
                    type="text"
                    className="task-input"
                    placeholder="e.g. Frontend, Backend, UI/UX"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onBlur={handleSaveCategory}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveCategory()}
                  />
                </div>
              </div>

              {/* Scheduling, Dates & Hours Row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                <div className="task-form-section">
                  <label className="task-form-label">Start Date</label>
                  <input
                    type="date"
                    className="task-input"
                    value={task.startDate ? new Date(task.startDate).toISOString().slice(0, 10) : ""}
                    onChange={(e) => {
                      const val = e.target.value ? new Date(e.target.value).getTime() : undefined;
                      onUpdateTask(task.id, { startDate: val });
                    }}
                  />
                </div>

                <div className="task-form-section">
                  <label className="task-form-label">Due Date</label>
                  <input
                    type="date"
                    className="task-input"
                    value={task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : ""}
                    onChange={(e) => {
                      const val = e.target.value ? new Date(e.target.value).getTime() : undefined;
                      onUpdateTask(task.id, { dueDate: val });
                    }}
                  />
                </div>

                <div className="task-form-section">
                  <label className="task-form-label">Estimated (hrs)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="task-input"
                    placeholder="e.g. 4"
                    value={task.estimatedHours ?? ""}
                    onChange={(e) => {
                      const val = e.target.value ? parseFloat(e.target.value) : undefined;
                      onUpdateTask(task.id, { estimatedHours: val });
                    }}
                  />
                </div>

                <div className="task-form-section">
                  <label className="task-form-label">Logged (hrs)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="task-input"
                    placeholder="e.g. 2.5"
                    value={task.loggedHours ?? ""}
                    onChange={(e) => {
                      const val = e.target.value ? parseFloat(e.target.value) : undefined;
                      onUpdateTask(task.id, { loggedHours: val });
                    }}
                  />
                </div>
              </div>

              {/* Sprint & Milestone Associations */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="task-form-section">
                  <label className="task-form-label">🏃 Sprint</label>
                  <select
                    className="task-select"
                    value={task.sprintId || ""}
                    onChange={(e) => {
                      soundEngine.play("click");
                      onUpdateTask(task.id, { sprintId: e.target.value || undefined });
                    }}
                  >
                    <option value="">No Sprint (Backlog)</option>
                    {(sprints || []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.status === "active" ? "🟢 " : s.status === "completed" ? "🏁 " : "📋 "}
                        {s.name} ({s.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="task-form-section">
                  <label className="task-form-label">🎯 Milestone</label>
                  <select
                    className="task-select"
                    value={task.milestoneId || ""}
                    onChange={(e) => {
                      soundEngine.play("click");
                      onUpdateTask(task.id, { milestoneId: e.target.value || undefined });
                    }}
                  >
                    <option value="">No Milestone</option>
                    {(milestones || []).map((m) => (
                      <option key={m.id} value={m.id}>
                        🎯 {m.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="task-form-section">
                <label className="task-form-label">Description</label>
                <textarea
                  rows={4}
                  className="task-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={handleSaveDescription}
                  placeholder="Add detailed task instructions, markdown, or notes..."
                  style={{ resize: "vertical" }}
                />
              </div>

              {/* Assignees with Role-Based Assignments */}
              <div className="task-form-section">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className="task-form-label" style={{ margin: 0 }}>Assignees &amp; Roles</label>
                  <span style={{ fontSize: 11, color: "var(--vgui-muted)" }}>
                    {task.assignees.length} assigned
                  </span>
                </div>

                {/* Assigned Members Chips */}
                <div className="task-chip-list" style={{ margin: "6px 0" }}>
                  {task.assignees.map((a) => {
                    const memberInfo = availableAssignees.find((m) => m.name === a);
                    return (
                      <span key={a} className="task-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px" }}>
                        {memberInfo?.avatarUrl ? (
                          <img
                            src={memberInfo.avatarUrl}
                            alt={a}
                            style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }}
                          />
                        ) : (
                          <span>{memberInfo?.isRepo ? "🐙" : "👤"}</span>
                        )}
                        <span style={{ fontWeight: 600 }}>{a}</span>
                        {task.roles[a] && (
                          <span style={{ fontSize: 10, color: "var(--vgui-muted)", fontWeight: 400 }}>
                            ({task.roles[a]})
                          </span>
                        )}
                        <span
                          onClick={() => handleRemoveAssignee(a)}
                          style={{ cursor: "pointer", color: "var(--err, #e53e3e)", marginLeft: 4 }}
                          title="Remove assignee"
                        >
                          ✕
                        </span>
                      </span>
                    );
                  })}
                </div>

                {/* 1. Quick Assign from Team & Collaborator Dropdown */}
                {unassignedMembers.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <select
                      className="task-select"
                      style={{ flex: 1, fontWeight: 500 }}
                      value=""
                      onChange={(e) => {
                        const selectedName = e.target.value;
                        if (!selectedName) return;
                        const member = availableAssignees.find((m) => m.name === selectedName);
                        const roleToUse = member?.role || "Collaborator";
                        const nextAssignees = Array.from(new Set([...task.assignees, selectedName]));
                        const nextRoles = { ...task.roles, [selectedName]: roleToUse };
                        soundEngine.play("click");
                        onUpdateTask(task.id, { assignees: nextAssignees, roles: nextRoles });
                      }}
                    >
                      <option value="" disabled>
                        👥 Quick Assign Team Member / GitHub Collaborator...
                      </option>
                      {unassignedMembers.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.isRepo ? "🐙 " : "👤 "} {m.name} — {m.role || "Collaborator"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 2. Quick Suggestion Chips */}
                {unassignedMembers.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "var(--vgui-muted)" }}>Available:</span>
                    {unassignedMembers.slice(0, 8).map((m) => (
                      <button
                        key={m.name}
                        type="button"
                        className="btn ghost"
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          borderRadius: 3,
                        }}
                        onClick={() => {
                          const roleToUse = m.role || "Collaborator";
                          const nextAssignees = Array.from(new Set([...task.assignees, m.name]));
                          const nextRoles = { ...task.roles, [m.name]: roleToUse };
                          soundEngine.play("click");
                          onUpdateTask(task.id, { assignees: nextAssignees, roles: nextRoles });
                        }}
                        title={`Assign ${m.name} (${m.role || "Collaborator"})`}
                      >
                        <span>{m.isRepo ? "🐙" : "👤"}</span>
                        <span>{m.name}</span>
                        <span style={{ color: "var(--vgui-accent)", fontWeight: 700 }}>+</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* 3. Custom / Manual Assignee Input */}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input
                    type="text"
                    className="task-input"
                    placeholder="Custom assignee or GitHub handle..."
                    value={newAssigneeName}
                    onChange={(e) => setNewAssigneeName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddAssignee()}
                    style={{ flex: 1 }}
                  />
                  <select
                    className="task-select"
                    value={newAssigneeRole}
                    onChange={(e) => setNewAssigneeRole(e.target.value)}
                  >
                    {availableRoles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={handleAddAssignee}
                    disabled={!newAssigneeName.trim()}
                  >
                    + Assign
                  </button>
                </div>
              </div>

              {/* Whiteboard Canvas Integration (Stickies & Cards) */}
              <div className="task-form-section" style={{ borderTop: "1px solid var(--vgui-border)", paddingTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className="task-form-label" style={{ margin: 0 }}>Whiteboard Canvas Integration</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {onAddStickyForTask && (
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ fontSize: 11, padding: "2px 8px" }}
                        onClick={() => {
                          onAddStickyForTask(task);
                          soundEngine.play("create");
                        }}
                        title="Create a linked sticky note on the board"
                      >
                        📝 + Add Sticky Note
                      </button>
                    )}
                    {onAddCardToCanvas && !task.canvasCardElementId && (
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ fontSize: 11, padding: "2px 8px" }}
                        onClick={() => {
                          onAddCardToCanvas(task);
                          soundEngine.play("create");
                        }}
                        title="Place an interactive task card on the board"
                      >
                        📍 + Place Card
                      </button>
                    )}
                  </div>
                </div>

                {task.linkedElementIds && task.linkedElementIds.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                    {task.linkedElementIds.map((elId) => (
                      <div
                        key={elId}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: 11,
                          padding: "3px 8px",
                          background: "var(--vgui-canvas, #101410)",
                          border: "1px solid var(--vgui-border, #455243)",
                          borderRadius: 2,
                        }}
                      >
                        <span style={{ color: "var(--vgui-muted)" }}>
                          Linked Sticky / Note ({elId.slice(0, 16)}...)
                        </span>
                        <div style={{ display: "flex", gap: 6 }}>
                          {onJumpToCard && (
                            <button
                              type="button"
                              className="btn ghost"
                              style={{ padding: "1px 5px", fontSize: 10 }}
                              onClick={() => {
                                onClose();
                                onJumpToCard(elId);
                              }}
                            >
                              🎯 Jump
                            </button>
                          )}
                          {onUnlinkElement && (
                            <button
                              type="button"
                              className="btn ghost"
                              style={{ padding: "1px 5px", fontSize: 10, color: "var(--err, #e53e3e)" }}
                              onClick={() => onUnlinkElement(elId)}
                              title="Unlink and remove task from sticky note"
                            >
                              🗑️ Unlink
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "var(--vgui-muted)", fontStyle: "italic", marginTop: 4 }}>
                    Not linked to any sticky note or shape yet. Click "+ Add Sticky Note" to place one on the canvas.
                  </div>
                )}
              </div>

              {/* Labels */}
              <div className="task-form-section">
                <label className="task-form-label">Labels</label>
                <div className="task-chip-list" style={{ margin: "4px 0" }}>
                  {task.labels.map((lbl) => (
                    <span key={lbl} className="task-chip">
                      #{lbl}
                      <span
                        onClick={() => handleRemoveLabel(lbl)}
                        style={{ cursor: "pointer", color: "var(--err, #e53e3e)", marginLeft: 4 }}
                      >
                        ✕
                      </span>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="text"
                    className="task-input"
                    placeholder="Add label..."
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddLabel()}
                    style={{ width: 140 }}
                  />
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={handleAddLabel}
                  >
                    + Label
                  </button>
                </div>
              </div>

              {/* Comments Section */}
              <div style={{ borderTop: "1px solid var(--vgui-border)", paddingTop: 12 }}>
                <label className="task-form-label">
                  Comments ({task.comments.length})
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "8px 0" }}>
                  {task.comments.map((c) => (
                    <div key={c.id} className="task-comment-box">
                      <div className="task-comment-header">
                        <span style={{ fontWeight: 700 }}>{c.authorName}</span>
                        <span>{new Date(c.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <div>{c.body}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="text"
                    className="task-input"
                    placeholder="Write a comment..."
                    value={newCommentBody}
                    onChange={(e) => setNewCommentBody(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn primary"
                    onClick={handleAddComment}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "subtasks" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Subtask Progress Bar */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
                  <span>Subtask Completion</span>
                  <span>{completedSubtasks} / {subtasks.length} ({subtaskProgress}%)</span>
                </div>
                <div className="task-progress-bar-track">
                  <div
                    className="task-progress-bar-fill"
                    style={{
                      width: `${subtaskProgress}%`,
                      background: "var(--ok, #38a169)",
                    }}
                  />
                </div>
              </div>

              {/* Subtasks List */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {subtasks.map((st) => (
                  <div key={st.id} className="task-subtask-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={st.status === "done"}
                        onChange={(e) => {
                          soundEngine.play("click");
                          onUpdateTask(st.id, { status: e.target.checked ? "done" : "todo" });
                        }}
                      />
                      <span style={{ textDecoration: st.status === "done" ? "line-through" : "none", color: st.status === "done" ? "var(--vgui-muted)" : "inherit" }}>
                        {st.title}
                      </span>
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--vgui-accent)" }}>{st.key}</span>
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ padding: "1px 5px", fontSize: 10, color: "var(--err, #e53e3e)" }}
                        onClick={() => {
                          onDeleteTask(st.id);
                          soundEngine.play("delete");
                        }}
                        title="Delete subtask"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Add Subtask Input */}
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input
                  type="text"
                  className="task-input"
                  placeholder="New subtask title..."
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddQuickSubtask()}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleAddQuickSubtask}
                >
                  + Add Subtask
                </button>
              </div>
            </div>
          )}

          {activeTab === "dependencies" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Blocked By Section */}
              <div className="task-form-section">
                <label className="task-form-label">
                  ⛔ Blocked By (This task cannot be finished until these tasks are Done)
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "6px 0" }}>
                  {(task.dependencies?.blockedBy || []).map((id) => {
                    const blocker = allTasks.find((t) => t.id === id);
                    const isDone = blocker?.status === "done";
                    return (
                      <div
                        key={id}
                        className="task-subtask-item"
                        style={{
                          borderLeft: `4px solid ${isDone ? "var(--ok, #38a169)" : "var(--err, #e53e3e)"}`,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 700, color: "var(--vgui-accent)" }}>
                            {blocker?.key || id}
                          </span>
                          <span>{blocker?.title || "Unknown Task"}</span>
                          <span
                            className="task-status-badge"
                            style={{
                              background: isDone ? "var(--ok, #38a169)" : "var(--err, #e53e3e)",
                              fontSize: 9,
                            }}
                          >
                            {blocker?.status?.toUpperCase() || "UNKNOWN"}
                          </span>
                        </div>
                        <span
                          onClick={() => handleRemoveBlockedBy(id)}
                          style={{ cursor: "pointer", color: "var(--err, #e53e3e)" }}
                          title="Remove dependency"
                        >
                          ✕
                        </span>
                      </div>
                    );
                  })}
                  {(!task.dependencies?.blockedBy || task.dependencies.blockedBy.length === 0) && (
                    <div style={{ fontSize: 12, color: "var(--vgui-muted)" }}>No blocking dependencies.</div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6 }}>
                  <select
                    className="task-select"
                    value={selectedBlockerId}
                    onChange={(e) => setSelectedBlockerId(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="">Select task that blocks this one...</option>
                    {allTasks
                      .filter((t) => t.id !== task.id && !task.dependencies?.blockedBy?.includes(t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.key} - {t.title} ({t.status})
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => handleAddBlockedBy(selectedBlockerId)}
                    disabled={!selectedBlockerId}
                  >
                    + Add Blocker
                  </button>
                </div>
              </div>

              {/* Blocks Section */}
              <div className="task-form-section" style={{ borderTop: "1px solid var(--vgui-border)", paddingTop: 14 }}>
                <label className="task-form-label">
                  ⛓️ Blocks (Other tasks waiting on this task to be finished)
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "6px 0" }}>
                  {(task.dependencies?.blocks || []).map((id) => {
                    const dep = allTasks.find((t) => t.id === id);
                    return (
                      <div key={id} className="task-subtask-item">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 700, color: "var(--vgui-accent)" }}>
                            {dep?.key || id}
                          </span>
                          <span>{dep?.title || "Unknown Task"}</span>
                        </div>
                        <span
                          onClick={() => handleRemoveBlocks(id)}
                          style={{ cursor: "pointer", color: "var(--err, #e53e3e)" }}
                          title="Remove"
                        >
                          ✕
                        </span>
                      </div>
                    );
                  })}
                  {(!task.dependencies?.blocks || task.dependencies.blocks.length === 0) && (
                    <div style={{ fontSize: 12, color: "var(--vgui-muted)" }}>This task does not block any other tasks.</div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6 }}>
                  <select
                    className="task-select"
                    value={selectedBlocksId}
                    onChange={(e) => setSelectedBlocksId(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="">Select task waiting on this one...</option>
                    {allTasks
                      .filter((t) => t.id !== task.id && !task.dependencies?.blocks?.includes(t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.key} - {t.title}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => handleAddBlocks(selectedBlocksId)}
                    disabled={!selectedBlocksId}
                  >
                    + Add Blocked Task
                  </button>
                </div>
              </div>

              {/* Relates To Section */}
              <div className="task-form-section" style={{ borderTop: "1px solid var(--vgui-border)", paddingTop: 14 }}>
                <label className="task-form-label">
                  🔗 Relates To (Tasks relevant or connected to this work)
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "6px 0" }}>
                  {(task.dependencies?.relatesTo || []).map((id) => {
                    const dep = allTasks.find((t) => t.id === id);
                    return (
                      <div key={id} className="task-subtask-item">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 700, color: "var(--vgui-accent)" }}>
                            {dep?.key || id}
                          </span>
                          <span>{dep?.title || "Unknown Task"}</span>
                        </div>
                        <span
                          onClick={() => handleRemoveRelates(id)}
                          style={{ cursor: "pointer", color: "var(--err, #e53e3e)" }}
                          title="Remove"
                        >
                          ✕
                        </span>
                      </div>
                    );
                  })}
                  {(!task.dependencies?.relatesTo || task.dependencies.relatesTo.length === 0) && (
                    <div style={{ fontSize: 12, color: "var(--vgui-muted)" }}>No related tasks linked.</div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6 }}>
                  <select
                    className="task-select"
                    value={selectedRelatesId}
                    onChange={(e) => setSelectedRelatesId(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="">Select related task...</option>
                    {allTasks
                      .filter((t) => t.id !== task.id && !task.dependencies?.relatesTo?.includes(t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.key} - {t.title}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => handleAddRelates(selectedRelatesId)}
                    disabled={!selectedRelatesId}
                  >
                    + Link Related
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "bug" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="task-form-section">
                <label className="task-form-label">Reproduction Steps</label>
                <textarea
                  rows={3}
                  className="task-textarea"
                  value={task.bugDetails?.reproductionSteps || ""}
                  onChange={(e) =>
                    onUpdateTask(task.id, {
                      bugDetails: {
                        ...(task.bugDetails || {
                          severity: "major",
                          reproductionSteps: "",
                          expectedBehavior: "",
                          actualBehavior: "",
                        }),
                        reproductionSteps: e.target.value,
                      },
                    })
                  }
                  placeholder="1. Open board... 2. Click button..."
                />
              </div>

              <div className="task-form-section">
                <label className="task-form-label">Expected Behavior</label>
                <textarea
                  rows={2}
                  className="task-textarea"
                  value={task.bugDetails?.expectedBehavior || ""}
                  onChange={(e) =>
                    onUpdateTask(task.id, {
                      bugDetails: {
                        ...(task.bugDetails || {
                          severity: "major",
                          reproductionSteps: "",
                          expectedBehavior: "",
                          actualBehavior: "",
                        }),
                        expectedBehavior: e.target.value,
                      },
                    })
                  }
                />
              </div>

              <div className="task-form-section">
                <label className="task-form-label">Actual Behavior</label>
                <textarea
                  rows={2}
                  className="task-textarea"
                  value={task.bugDetails?.actualBehavior || ""}
                  onChange={(e) =>
                    onUpdateTask(task.id, {
                      bugDetails: {
                        ...(task.bugDetails || {
                          severity: "major",
                          reproductionSteps: "",
                          expectedBehavior: "",
                          actualBehavior: "",
                        }),
                        actualBehavior: e.target.value,
                      },
                    })
                  }
                />
              </div>
            </div>
          )}

          {activeTab === "activity" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {task.activity.map((act) => (
                <div
                  key={act.id}
                  className="task-comment-box"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700 }}>{act.userName}</span>:{" "}
                    {act.details.description || `${act.action} (${act.details.from || ""} ➔ ${act.details.to || ""})`}
                  </div>
                  <span style={{ color: "var(--vgui-muted)" }}>
                    {new Date(act.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "8px 14px",
            background: "var(--vgui-bg)",
            borderTop: "1px solid var(--vgui-border)",
            boxShadow: "inset 0 1px 0 var(--vgui-light)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              if (window.confirm(`Delete task ${task.key}?`)) {
                onDeleteTask(task.id);
                onClose();
              }
            }}
            style={{ color: "var(--err, #d64949)" }}
          >
            🗑️ Delete Task
          </button>

          <button
            type="button"
            className="btn primary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
