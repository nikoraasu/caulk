import { useState } from "react";
import type { TaskRecord, TaskStatus, TaskPriority } from "./types";
import { soundEngine } from "../../audio/soundEngine";
import "./tasks.css";

type Props = {
  element: any;
  task?: TaskRecord;
  allTasks?: TaskRecord[];
  onUpdateTask: (updates: Partial<TaskRecord>) => void;
  onUpdateSubtaskStatus?: (subtaskId: string, status: TaskStatus) => void;
  onCreateSubtask?: (parentId: string, title: string) => void;
  onOpenDetails: (task: TaskRecord) => void;
  onPlaceSubtasksOnCanvas?: (parentTask: TaskRecord, subtasks: TaskRecord[]) => void;
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; bg: string; color: string }> = {
  backlog: { label: "Backlog", bg: "#718096", color: "#ffffff" },
  todo: { label: "To Do", bg: "#3182ce", color: "#ffffff" },
  in_progress: { label: "In Progress", bg: "#d69e2e", color: "#ffffff" },
  review: { label: "Review", bg: "#805ad5", color: "#ffffff" },
  done: { label: "Done", bg: "#38a169", color: "#ffffff" },
  blocked: { label: "Blocked", bg: "#e53e3e", color: "#ffffff" },
};

const PRIORITY_CONFIG: Record<TaskPriority, { icon: string; label: string; color: string }> = {
  low: { icon: "🔵", label: "Low", color: "#4299e1" },
  medium: { icon: "🟡", label: "Medium", color: "#ecc94b" },
  high: { icon: "🟠", label: "High", color: "#ed8936" },
  critical: { icon: "🔴", label: "Critical", color: "#f56565" },
};

const TYPE_ICONS: Record<string, string> = {
  task: "✅",
  bug: "🪲",
  story: "📖",
  epic: "⚡",
};

export function WhiteboardTaskCard({
  element: _element,
  task,
  allTasks = [],
  onUpdateTask,
  onUpdateSubtaskStatus,
  onCreateSubtask,
  onOpenDetails,
  onPlaceSubtasksOnCanvas,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [subtasksExpanded, setSubtasksExpanded] = useState(true);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  if (!task) {
    return (
      <div
        className="caulk-task-card"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderStyle: "dashed",
          color: "var(--vgui-muted)",
        }}
      >
        <span>⚠️ Unlinked Task</span>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo;
  const prioCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const typeIcon = TYPE_ICONS[task.type] || "✅";

  const subtasks = (allTasks || []).filter((t) => task.subtaskIds?.includes(t.id));
  const doneSubtasks = subtasks.filter((s) => s.status === "done").length;
  const totalSubtasks = subtasks.length > 0 ? subtasks.length : task.subtaskIds?.length || 0;
  const subtaskProgress = subtasks.length > 0 ? Math.round((doneSubtasks / subtasks.length) * 100) : 0;

  const isOverdue = task.dueDate && task.dueDate < Date.now() && task.status !== "done";
  const hasBlockers = (task.dependencies?.blockedBy?.length || 0) > 0 && task.status !== "done";

  const handleStatusSelect = (nextStatus: TaskStatus) => {
    soundEngine.play("click");
    onUpdateTask({ status: nextStatus });
    setDropdownOpen(false);
  };

  const handleCreateSubtaskSubmit = () => {
    if (!newSubtaskTitle.trim() || !onCreateSubtask) return;
    onCreateSubtask(task.id, newSubtaskTitle.trim());
    setNewSubtaskTitle("");
    setAddingSubtask(false);
    soundEngine.play("create");
  };

  return (
    <div
      className="caulk-task-card"
      style={{ "--status-color": statusCfg.bg } as React.CSSProperties}
      onClick={(e) => {
        // Prevent canvas drag when clicking interactive elements
        e.stopPropagation();
      }}
    >
      {/* Top Header Bar */}
      <div className="caulk-task-card-header">
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span>{typeIcon}</span>
          <span style={{ fontWeight: 700, color: "var(--vgui-accent)", letterSpacing: 0.5 }}>
            {task.key}
          </span>
          {hasBlockers && (
            <span
              style={{
                fontSize: 9,
                padding: "0 4px",
                background: "var(--err, #e53e3e)",
                color: "#ffffff",
                borderRadius: 2,
                fontWeight: 700,
              }}
              title="Has blocking dependencies"
            >
              ⛔ BLOCKED
            </span>
          )}
        </div>

        {/* Status Dropdown Trigger */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDropdownOpen((o) => !o);
            }}
            className="task-status-badge"
            style={{
              background: statusCfg.bg,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>{statusCfg.label}</span>
            <span style={{ fontSize: 8 }}>▼</span>
          </button>

          {dropdownOpen && (
            <div className="caulk-task-dropdown">
              {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  className="caulk-task-dropdown-item"
                  onClick={() => handleStatusSelect(st)}
                  style={{
                    background: task.status === st ? "var(--vgui-selected-bg)" : "transparent",
                    color: task.status === st ? "var(--vgui-selected-fg)" : "var(--ink)",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: STATUS_CONFIG[st].bg,
                      display: "inline-block",
                    }}
                  />
                  <span>{STATUS_CONFIG[st].label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Body */}
      <div
        className="caulk-task-card-body"
        onClick={() => onOpenDetails(task)}
        title="Click to view task details"
        style={{ cursor: "pointer" }}
      >
        <h3 className="caulk-task-card-title">
          {task.title}
        </h3>

        {task.description && (
          <div
            style={{
              fontSize: 11,
              color: "var(--vgui-muted)",
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {task.description}
          </div>
        )}

        {/* Labels & Category */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 2 }}>
          {task.category && (
            <span
              className="task-chip"
              style={{ background: "var(--vgui-selected-bg)", color: "var(--vgui-selected-fg)" }}
            >
              📂 {task.category}
            </span>
          )}
          {task.labels && task.labels.map((lbl) => (
            <span key={lbl} className="task-chip">
              #{lbl}
            </span>
          ))}
        </div>

        {/* Streamlined Subtasks Tree Connected Under Main Task */}
        {(subtasks.length > 0 || addingSubtask || onCreateSubtask) && (
          <div
            className="caulk-task-subtasks-tree"
            onClick={(e) => e.stopPropagation()}
            style={{
              marginTop: 6,
              background: "rgba(0, 0, 0, 0.12)",
              border: "1px solid var(--vgui-border)",
              borderRadius: 3,
              padding: "4px 6px",
            }}
          >
            <div
              className="caulk-subtasks-header"
              onClick={() => setSubtasksExpanded(!subtasksExpanded)}
              style={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: subtasksExpanded ? 4 : 0,
                borderBottom: subtasksExpanded ? "1px solid var(--vgui-border)" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700 }}>
                <span>↳ Subtasks</span>
                {subtasks.length > 0 && (
                  <span
                    style={{
                      fontSize: 9,
                      padding: "1px 4px",
                      borderRadius: 2,
                      background: subtaskProgress === 100 ? "var(--ok, #38a169)" : "var(--vgui-base)",
                      color: subtaskProgress === 100 ? "#ffffff" : "var(--ink)",
                    }}
                  >
                    {doneSubtasks}/{subtasks.length} ({subtaskProgress}%)
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {onCreateSubtask && (
                  <button
                    type="button"
                    className="task-card-action-btn"
                    style={{ padding: "0 4px", fontSize: 9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddingSubtask(true);
                      setSubtasksExpanded(true);
                    }}
                    title="Add subtask inline"
                  >
                    + Add
                  </button>
                )}
                {onPlaceSubtasksOnCanvas && subtasks.length > 0 && (
                  <button
                    type="button"
                    className="task-card-action-btn"
                    style={{ padding: "0 4px", fontSize: 9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlaceSubtasksOnCanvas(task, subtasks);
                    }}
                    title="Place connected subtask cards on canvas"
                  >
                    🌿 On Board
                  </button>
                )}
                <span style={{ fontSize: 9, color: "var(--vgui-muted)" }}>
                  {subtasksExpanded ? "▲" : "▼"}
                </span>
              </div>
            </div>

            {subtasksExpanded && (
              <div
                className="caulk-subtasks-branch-list"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  marginTop: 4,
                  maxHeight: 120,
                  overflowY: "auto",
                }}
              >
                {subtasks.map((st, idx) => {
                  const isLast = idx === subtasks.length - 1 && !addingSubtask;
                  const isDone = st.status === "done";
                  return (
                    <div
                      key={st.id}
                      className="caulk-subtask-branch-row"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 10,
                        lineHeight: 1.2,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "monospace",
                          color: "var(--vgui-accent)",
                          fontSize: 11,
                          userSelect: "none",
                        }}
                      >
                        {isLast ? "└──" : "├──"}
                      </span>
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={(e) => {
                          soundEngine.play("click");
                          onUpdateSubtaskStatus?.(st.id, e.target.checked ? "done" : "todo");
                        }}
                        style={{ cursor: "pointer", margin: 0 }}
                        title={isDone ? "Mark todo" : "Mark done"}
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
                        onClick={() => onOpenDetails(st)}
                        title={`Subtask ${st.key}: ${st.title} (${st.status}) - Click to view details`}
                      >
                        <span style={{ fontWeight: 700, color: "var(--vgui-accent)", marginRight: 4 }}>
                          {st.key}
                        </span>
                        {st.title}
                      </span>
                    </div>
                  );
                })}

                {addingSubtask && (
                  <div
                    className="caulk-subtask-branch-row"
                    style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}
                  >
                    <span style={{ fontFamily: "monospace", color: "var(--vgui-accent)", fontSize: 11 }}>
                      └──
                    </span>
                    <input
                      type="text"
                      className="task-input"
                      placeholder="New subtask... (Enter)"
                      value={newSubtaskTitle}
                      autoFocus
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateSubtaskSubmit();
                        else if (e.key === "Escape") {
                          setAddingSubtask(false);
                          setNewSubtaskTitle("");
                        }
                      }}
                      style={{ flex: 1, padding: "1px 5px", fontSize: 10, height: 20 }}
                    />
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ padding: "0 3px", fontSize: 9 }}
                      onClick={() => {
                        setAddingSubtask(false);
                        setNewSubtaskTitle("");
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Footer Bar */}
      <div className="caulk-task-card-footer">
        {/* Priority & Subtasks & Deadlines */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span title={`Priority: ${prioCfg.label}`}>{prioCfg.icon}</span>

          {totalSubtasks > 0 && (
            <span
              style={{
                fontSize: 10,
                color: "var(--vgui-muted)",
                display: "flex",
                alignItems: "center",
                gap: 2,
              }}
              title={`${totalSubtasks} subtasks`}
            >
              <span>↳</span>
              <span>{totalSubtasks}</span>
            </span>
          )}

          {task.dueDate && (
            <span
              style={{
                fontSize: 9,
                color: isOverdue ? "var(--err, #e53e3e)" : "var(--vgui-muted)",
                fontWeight: isOverdue ? 700 : 500,
                display: "flex",
                alignItems: "center",
                gap: 2,
              }}
              title={`Due: ${new Date(task.dueDate).toLocaleDateString()}`}
            >
              <span>📅</span>
              <span>{new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </span>
          )}
        </div>

        {/* Assignees */}
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {task.assignees && task.assignees.length > 0 ? (
            task.assignees.slice(0, 2).map((name) => (
              <div
                key={name}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "var(--vgui-selected-bg)",
                  color: "var(--vgui-selected-fg)",
                  fontSize: 10,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid var(--vgui-border)",
                }}
                title={name}
              >
                {name.charAt(0).toUpperCase()}
              </div>
            ))
          ) : (
            <span style={{ fontSize: 10, color: "var(--vgui-muted)" }}>Unassigned</span>
          )}
        </div>
      </div>
    </div>
  );
}
