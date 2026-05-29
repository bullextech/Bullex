---
name: Security scan (semgrep SAST) behavior
description: How runSastScan findings relate to actual code state and what clears them
---

# SAST (semgrep) scan behavior on this project

The `runSastScan()` results do NOT necessarily reflect uncommitted working-tree edits — it
reads the committed snapshot. After editing, the finding count may not change until a checkpoint/commit exists.

**Why:** Confirmed when path-traversal + email html-injection fixes left the production
finding counts unchanged in an immediate re-scan.

**How to apply:**
- Several semgrep rules flag a *construct*, not exploitability. They will keep firing even
  after a correct mitigation:
  - `html-in-template-string` fires on ANY `${...}` inside an HTML-looking template literal,
    even when wrapped in an escape helper (`esc()`/`escapeHtml()`).
  - `path-join-resolve-traversal` / `detect-non-literal-fs-filename` fire on any variable
    passed to `path.join`/`fs.*`, even when the value is DB-sourced/server-generated or
    validated + containment-checked.
  - `react-href-var` fires on any variable in an `href`, even a static internal route.
- So judge these by real risk, not by the count. Don't chase the number to zero — fix the
  genuine vectors (request-param-to-path sinks, un-encoded user data in HTML) and treat the
  rest as accepted/false-positive.
- Findings under `attached_assets/` and `artifacts/mockup-sandbox/` are out of scope
  (reference HTML + dev tooling) per threat_model.md.
