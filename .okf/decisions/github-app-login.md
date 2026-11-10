---
type: Decision
title: GitHub App login
description: Login moves to a GitHub App so users choose which repos Caulk can access.
tags: [decision, auth]
generated: { by: claude-opus-5-5/okf, at: "2026-11-11T00:50:00Z" }
---

# Context

Classic OAuth Apps can only request `repo` (all repos) or `public_repo`; there is no per-repo scope.
The user wanted per-repo access, especially for a future public instance.

# Decision

Support a GitHub App (user-to-server tokens, installation-scoped repos), keep classic OAuth as a
fallback when `GITHUB_APP_SLUG` is unset, keep PAT login. Details in [Auth](/architecture/auth.md).

# Status

Code done and pushed; the user has **not yet created the GitHub App** — the live site still uses the classic OAuth App.
