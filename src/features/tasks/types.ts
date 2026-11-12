/**
 * Task Management System Types (Jira / Linear Grade)
 * Independent CRDT entities stored in Yjs `doc.getMap("tasks")`
 */

export type TaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "review"
  | "done"
  | "blocked";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export type TaskType = "task" | "bug" | "story" | "epic";

export type TaskRole =
  | "Backend Developer"
  | "Frontend Developer"
  | "Full-stack Developer"
  | "Designer"
  | "QA"
  | "Project Manager"
  | "Product Owner"
  | "DevOps"
  | "Collaborator"
  | (string & {});

export interface MemberRecord {
  id: string; // member name / user id
  name: string;
  role: string;
  customTitle?: string;
  avatarColor?: string;
  avatarUrl?: string;
  isRepoCollaborator?: boolean;
  repoRole?: string;
  updatedAt: number;
}

export interface CustomRoleRecord {
  id: string;
  name: string;
  color: string;
  icon: string;
  description?: string;
  isDefault?: boolean;
}

export interface BugDetails {
  severity: "cosmetic" | "minor" | "major" | "critical" | "blocker";
  reproductionSteps: string;
  expectedBehavior: string;
  actualBehavior: string;
  environment?: string;
  attachments?: { name: string; url: string; size: number }[];
}

export interface TaskComment {
  id: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  updatedAt?: number;
  body: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  userId: string;
  userName: string;
  action:
    | "created"
    | "status_change"
    | "priority_change"
    | "assignee_change"
    | "comment_added"
    | "converted_from_element";
  details: {
    from?: string;
    to?: string;
    field?: string;
    description?: string;
  };
}

export interface TaskRecord {
  id: string;
  key: string; // e.g. "CLK-1", "CLK-42"
  type: TaskType;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignees: string[]; // List of user names / IDs
  roles: Record<string, TaskRole>; // e.g. { "Alice": "Frontend Developer", "Bob": "QA" }
  startDate?: number; // Unix timestamp ms
  dueDate?: number; // Unix timestamp ms
  estimatedHours?: number;
  loggedHours?: number;
  labels: string[];
  category?: string;
  parentId?: string; // Parent Task ID for subtasks
  subtaskIds: string[]; // Child Task IDs
  dependencies: {
    blocks: string[]; // Tasks that cannot start until this is done
    blockedBy: string[]; // Tasks that must finish before this can start
    relatesTo: string[]; // Related tasks
  };
  sprintId?: string; // Optional Sprint association
  milestoneId?: string; // Optional Milestone association
  bugDetails?: BugDetails; // For type === "bug"
  comments: TaskComment[];
  activity: ActivityLogEntry[];
  linkedElementIds: string[]; // Linked whiteboard elements (stickies, frames, shapes)
  canvasCardElementId?: string; // ID of embeddable card on canvas if placed
  createdAt: number;
  updatedAt: number;
}

export interface SprintRecord {
  id: string;
  name: string;
  goal?: string;
  startDate: number;
  endDate: number;
  status: "planning" | "active" | "completed";
  createdAt: number;
  updatedAt: number;
}

export interface MilestoneRecord {
  id: string;
  title: string;
  targetDate: number;
  description?: string;
  associatedTaskIds: string[];
  status: "open" | "reached" | "missed";
  createdAt: number;
  updatedAt: number;
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger:
    | "all_subtasks_completed"
    | "status_changed_to_review"
    | "deadline_approaching"
    | "task_created";
  condition?: {
    field?: string;
    operator?: "equals" | "contains";
    value?: string;
  };
  action:
    | "set_parent_done"
    | "notify_qa"
    | "ping_assignees"
    | "assign_role_by_category";
}
