---
type: Architecture
title: Auth
description: Three login paths — GitHub App (per-repo), classic OAuth App fallback, or personal access token.
tags: [auth, github, oauth]
generated: { by: claude-opus-5-5/okf, at: "2026-11-11T00:50:00Z" }
---

# Paths

| Path | When | Repo listing | Token |
|---|---|---|---|
| GitHub App | `GITHUB_APP_SLUG` set in `api/config.php` | `/user/installations` → repos | Expiring; refreshed via `auth.php?action=refresh` |
| Classic OAuth App | slug **not** set (current live site) | `/user/repos` | scope `repo,read:user`, kind `pat` |
| PAT (fine-grained or classic) | typed in SetupScreen | `/user/repos` | static |

- `auth.php` callback redirects to `../#access_token=…&token_kind=app|pat[&refresh_token&expires_at&refresh_expires_at]`.
- `src/auth/token.ts`: stored credential `{token, refreshToken?, expiresAt?, kind}`, `getFreshToken()` (single-flight refresh <5min before expiry), `withAuth()` retries once on 401. `GitHubAdapter` and `issues.ts` accept a token provider.
- `action=config` returns `app_slug`, `oauth_configured`, `has_gemini_key` — **never the Gemini key** (it used to leak). `action=debug` returns booleans only. AI therefore needs each user's own Gemini key for now.
- The GitHub App needs: callback + setup URL = site root, "Request user authorization during installation", "Redirect on update", webhook off, Contents RW / Metadata R / Issues RW, installable by any account. Collaborators don't install; the repo owner's install covers them.

Decision: [GitHub App login](/decisions/github-app-login.md).
