---
name: Page scroll convention (app shell)
description: Why each routed page must own its vertical scroll, or content below the fold gets clipped with no scrollbar
---

The app shell (`client/src/App.tsx` `AppShell`) is fixed-height: `.app-shell` is
`height: 100dvh` and `<main>` plus its inner Router wrapper are `overflow-hidden`.

**Consequence:** a routed page does NOT inherit a scrollable viewport. If a page's
root is just `<div className="p-6 ...">`, any content taller than the viewport is
clipped and there is **no scrollbar** — the user simply cannot reach the lower
sections (this is what caused the Deal Pipeline "can't scroll / can't see matchable
enquiry" report).

**Convention:** every routed page must own its scroll. Wrap the page root in
`<div className="h-full overflow-y-auto">` (existing pages: participants, contact,
home, products, etc.). Keep the centered content (`max-w-* mx-auto p-6`) as an inner
div so the scrollbar sits at the viewport edge.

**How to apply:** when adding a new page under the authenticated app shell, start
its root with `h-full overflow-y-auto`; do not rely on the body/window scrolling.
