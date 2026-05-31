---
name: Auth testing over curl
description: Why curl-based auth tests fail locally and how to verify protected routes instead
---

# Auth testing: curl vs browser

Session cookies are issued with `secure: true` (set in `server/routes.ts` session
config). Over plain HTTP on `localhost:5000`, curl will NOT persist the cookie even
though `POST /api/auth/login` returns `{authenticated:true}` — so every follow-up
protected request comes back `401 Unauthorized`. This is expected, not a bug.

**Why:** the browser/preview reaches the app through Replit's HTTPS proxy, so the
secure cookie is accepted there. curl hits the raw HTTP port directly.

**How to apply:** verify protected/auth-gated routes via the preview, a screenshot,
or the testing skill — not curl. A `401` after a successful curl login is the cookie
limitation, not broken authz.
