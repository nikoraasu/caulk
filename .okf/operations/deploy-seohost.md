---
type: Playbook
title: Deploy to seohost
description: How the live site at caulk.mikolajpolok.pl is updated.
tags: [deploy, operations]
generated: { by: claude-opus-5-5/okf, at: "2026-11-11T00:50:00Z" }
---

# Steps

1. `npm run build`, then `cd dist && zip -qr ../caulk-seohost.zip . -x 'api/config.php' -x 'api/_relay/*'` (zip is git-ignored).
2. DirectAdmin File Manager → subdomain folder: delete old `assets/`, keep `api/config.php`, upload + extract with overwrite.
3. Hard refresh (Ctrl+Shift+R) in every browser.

# Checks

- `/api/signal.php?action=poll&room=test` → `{"messages":[],"last":0}`. A 500 means `api/` isn't writable (chmod 755).
- Test live alone: two browsers (or normal + private window) side by side, or a phone on mobile data.
- PHP can't be run locally (no php binary, nix unavailable) — server is the first real PHP test.
