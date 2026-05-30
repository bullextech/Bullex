---
name: Standalone full-screen routes
description: How full-screen pages outside the app shell (and user-provided static mockups) are wired in
---

# Standalone routes (outside the app shell)

Some pages render full-screen WITHOUT the TopNavbar/AdminSidebar shell. They are
gated in `client/src/App.tsx` via a chain of `useRoute(...)` guards that short-circuit
before `<AppShell />` (e.g. /kyc-register, /client-portal, /deck, /trade-bank).

**How to add one:** import the page, add `const [isX] = useRoute("/x")`, and add an
`isX ? <X /> : ...` branch in the render ternary above the final `<AppShell />`.

**Why:** these pages bring their own chrome/full-bleed layout; wrapping them in the
shell would double up navigation and break the layout.

## Integrating a user-provided self-contained HTML mockup
When the user supplies a complete single-file HTML mockup (own theme, own chrome,
vanilla JS, CDN-only deps) and wants it "added as-is", the reliable path is:
- Copy the file verbatim into `client/public/` (Vite serves it statically in dev and
  in the production build; reachable at `/<file>.html`).
- Render it full-screen via an `<iframe src="/<file>.html">` inside a standalone route.
- Add a fixed "Back to <app>" `<Link href="/">` overlay so users can return.

**Why:** hand-porting hundreds of inline styles + vanilla JS to JSX is high-risk and
loses fidelity; the iframe keeps the mockup pixel-exact with near-zero conversion risk.
Trade-off: it is NOT wired to the backend (mock/demo data only) — fine for a design/
prototype surface, revisit if it must become functional.
