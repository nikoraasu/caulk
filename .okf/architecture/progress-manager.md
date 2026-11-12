---
type: Architecture
title: Project and Task Progress Manager
description: CRDT task management system with multi-views (Kanban, List, Gantt, Calendar, Dashboard), streamlined subtask hierarchy, persistent member roles, and whiteboard canvas integration.
tags: [tasks, kanban, crdt, subtasks, roles, github, whiteboard]
resource: /dev/progress_manager/src/features/tasks/
generated: { by: antigravity/gemini, at: "2026-11-12T02:50:00Z" }
---

# Overview

The Project and Task Progress Manager (`dev/progress_manager/src/features/tasks/`) provides a full Jira/Linear-grade task management system operating on Caulk's encrypted Yjs CRDT doc. Tasks are independent first-class entities that can be viewed and manipulated across multiple synchronized perspectives and embedded directly on the infinite whiteboard canvas.

# CRDT Data Store

Tasks, sprints, milestones, automations, members, and custom roles are stored in dedicated Yjs maps on the board document:
- `tasks` (`Y.Map<string, TaskRecord>`): Individual tasks with auto-incrementing keys (`CLK-1`, `CLK-2`, etc.), parent-child relations (`parentId`, `subtaskIds`), dependencies (`blocks`, `blockedBy`, `relatesTo`), priorities, statuses, categories, labels, and activity audit trails.
- `sprints` (`Y.Map<string, SprintRecord>`): Sprint schedules, goals, and task assignment sets.
- `milestones` (`Y.Map<string, MilestoneRecord>`): Target dates, deadline tracking, and task links.
- `task_automations` (`Y.Map<string, AutomationRule>`): Rules such as auto-completing parent tasks when all subtasks reach `done`.
- `project_members` (`Y.Map<string, MemberRecord>`): Permanent per-user role assignments that persist across sessions even for members with 0 tasks.
- `project_roles` (`Y.Map<string, CustomRoleRecord>`): User-defined roles with custom title, emoji/icon, and color.

# Whiteboard Canvas Integration

- **Embedded Task Cards (`WhiteboardTaskCard`)**: Canvas elements rendered via `renderEmbeddable`. Features streamlined collapsible subtasks with tree branch connectors (`├──`, `└──`), live checkboxes to toggle completion directly on the canvas without opening a modal, inline quick-add input, and `🌿 On Board` action to spawn child subtask cards on the whiteboard connected via dashed arrows.
- **Sticky Note 2-Way Sync**: Converting a sticky note to a task extracts `#hashtags` and `customData.tags` to `task.labels`. Editing tags on the sticky updates the task's labels; editing task labels updates the sticky's tags.
- **Task Unlinking**: Sticky notes feature an interactive `✕` badge and sidebar action to remove the task association without deleting the note or task.
- **Hide Sticky Tags**: 1-click topbar toggle (`🏷️ Tags: ON/OFF`) cleanly hides all sticky tags to avoid obstructing note content.
- **Quick Sticky Creation**: Task creation supports a `[x] 📝 Create sticky` checkbox that automatically generates and positions a linked sticky note on the canvas.
- **Member Selector on Creation**: Task quick-add strip provides a direct `👤 Assignee:` dropdown listing all team members, GitHub collaborators, and active peers with role indicators and GitHub avatar resolution.

# Multiple Synchronized Views (`TaskHubModal`)

1. **Kanban Board**: Drag-and-drop status columns for top-level tasks, with collapsible subtask drawers and inline subtask creation.
2. **List View**: Sortable columns (Key, Title, Status, Priority, Category, Assignees, Due Date, Labels, Subtasks) and hierarchical tree rows (`▶ / ▼`) revealing indented subtasks (`└── ↳ [CLK-1-1]`).
3. **Timeline / Gantt**: Interactive schedule bars showing dates, deadlines, and dependencies.
4. **Calendar View**: Monthly grid of deadlines, events, and milestones.
5. **Analytics Dashboard**: Aggregates completion percentage, priority/status distribution, overdue counts, workload by user and role, and sprint progress.
6. **Team & Roles Matrix**: Aggregates GitHub repo collaborators/owners (`fetchRepoCollaborators`), live peers, and assignees with persistent role selectors, custom role builder, `+ Add Member` panel with automatic `https://github.com/${username}.png` avatar resolution, and 1-click `🔄 Sync GitHub Collaborators` button.
7. **Task Details Inspector**: Features a team member dropdown picker and 1-click suggestion chips (`[+ 🐙 nikoraasu]`, `[+ 👤 Sarah]`) alongside manual custom name input.
