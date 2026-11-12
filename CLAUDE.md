# Claude Code Project Guidelines for Caulk

This project supports autonomous AI agent interaction with Caulk whiteboards & sprint boards via the `caulk` CLI.
See [AGENTS.md](file:///home/nikolas/miro-alt/AGENTS.md) for full commands and options.

## Quick CLI Cheat Sheet

- **Inspect board state**:
  ```bash
  npx caulk dump --board main
  npx caulk dump --board main --json
  ```
- **List tasks**:
  ```bash
  npx caulk list-tasks --board main
  npx caulk list-tasks --board main --status TODO
  ```
- **Add a task to the board**:
  ```bash
  npx caulk add-task --board main --title "Task title" --status TODO --priority HIGH --assignee "name" --sticky
  ```
- **Update task status**:
  ```bash
  npx caulk update-task --board main --task "Task title" --status IN_PROGRESS
  npx caulk update-task --board main --task "Task title" --status DONE
  ```
- **Add sticky note**:
  ```bash
  npx caulk add-sticky --board main --text "Note content" --color green
  ```

## Development Commands
- Typecheck: `npm run typecheck`
- Test: `npm test`
- Build CLI: `npm run build:cli`
- Build Web: `npm run build`
