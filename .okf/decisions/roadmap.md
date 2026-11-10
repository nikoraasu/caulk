---
type: Plan
title: Roadmap
description: Agreed next steps and open decisions as of 2026-11-11.
tags: [roadmap, plan]
status: draft
generated: { by: claude-opus-5-5/okf, at: "2026-11-11T00:50:00Z" }
stale_after: "2027-02-01T00:00:00Z"
---

# Open decisions

- **License**: copyleft wanted; choose GPL-3.0 vs AGPL-3.0 (AGPL recommended for a hosted app). No LICENSE file yet.
- Shared Gemini key: proxy AI through the server, or keep per-user keys.
- Access control: AccessModal/whitelist is dormant; needs a source of truth if revived.

# Hosting for others (agreed, not started)

1. Configurable API base URL; CORS on PHP endpoints.
2. Optional Cloudflare Worker backend (OAuth exchange + relay, Durable Objects WebSockets).
3. GitHub Actions → GitHub Pages deploy.
4. README tutorial: static-only / PHP host / Pages + Worker.
5. Abuse limits on the relay and auth endpoints.

# Miro-parity features (user liked; "later")

Priority: comments & threads → templates → dot voting + "bring everyone to me" → boards home page →
images as repo assets. Also: smarter stickies (auto-fit, tags, AI clustering), Kanban cards synced with
GitHub Issues, tables & mind-map nodes, search, view/comment-only links, roles, PDF/CSV export,
activity panel, mobile polish, onboarding.
