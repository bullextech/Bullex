// Prefetch route chunks on hover/focus of nav links so heavy pages open
// instantly. Each import() below resolves to the SAME chunk Vite creates for
// the matching React.lazy() call in App.tsx (Vite dedupes dynamic imports),
// so triggering it early just warms the browser/module cache — no extra
// bytes in the initial main chunk.

const prefetchers: Record<string, () => Promise<unknown>> = {
  "/dashboard": () => import("@/pages/dashboard"),
  "/registrations": () => import("@/pages/registrations-admin"),
  "/kyc-admin": () => import("@/pages/kyc-admin"),
  "/team": () => import("@/pages/team-members"),
  "/team-performance": () => import("@/pages/team-performance"),
  "/trade-enquiries": () => import("@/pages/trade-enquiries"),
  "/documents": () => import("@/pages/document-generator"),
  "/doc-templates": () => import("@/pages/document-generator"),
  "/trading": () => import("@/pages/trades"),
  "/matching": () => import("@/pages/matching"),
  "/vault": () => import("@/pages/vault"),
  "/blockchain": () => import("@/pages/blockchain"),
  "/db-backup": () => import("@/pages/database-backup"),
  "/tasks": () => import("@/pages/task-board"),
  "/checklists": () => import("@/pages/checklists"),
  "/notifications": () => import("@/pages/notifications"),
  "/chat": () => import("@/pages/chat"),
  "/shipments": () => import("@/pages/shipments"),
  "/banking": () => import("@/pages/banking"),
  "/live-prices": () => import("@/pages/live-prices"),
  "/contacts": () => import("@/pages/contacts"),
  "/my-team": () => import("@/pages/my-team"),
  "/team-portal": () => import("@/pages/team-portal"),
  "/products": () => import("@/pages/products"),
  "/platform": () => import("@/pages/platform"),
  "/client-portal": () => import("@/pages/client-portal"),
  "/investor": () => import("@/pages/investor"),
  "/tokenization-model": () => import("@/pages/tokenization-model"),
  "/human-resources": () => import("@/pages/human-resources"),
  "/contact": () => import("@/pages/contact"),
  "/trade-bank": () => import("@/pages/trade-bank"),
};

const done = new Set<string>();

/** Trigger the chunk download for a route's page. Safe to call repeatedly. */
export function prefetchRoute(path: string): void {
  const load = prefetchers[path];
  if (!load || done.has(path)) return;
  done.add(path);
  // Fire and forget; on failure allow a retry on next hover.
  load().catch(() => done.delete(path));
}

// Module id (from allowedModules) → the route path whose chunk serves it.
const moduleRoutes: Record<string, string> = {
  dashboard: "/dashboard",
  registrations: "/registrations",
  "kyc-admin": "/kyc-admin",
  enquiries: "/trade-enquiries",
  documents: "/documents",
  "doc-templates": "/doc-templates",
  trading: "/trading",
  matching: "/matching",
  vault: "/vault",
  blockchain: "/blockchain",
  tasks: "/tasks",
  checklists: "/checklists",
  notifications: "/notifications",
  shipments: "/shipments",
  banking: "/banking",
  "live-prices": "/live-prices",
  contacts: "/contacts",
  "team-network": "/my-team",
};

// Pages every admin routinely opens (admins have no allowedModules list).
const adminDefaultRoutes = [
  "/dashboard",
  "/registrations",
  "/kyc-admin",
  "/trade-enquiries",
  "/documents",
  "/team",
  "/notifications",
  "/chat",
];

/**
 * Pure: the ordered, deduped route paths worth warming for a user.
 * Team members: portal + chat (always reachable) + their allowedModules.
 * Admins (no allowedModules list): the common admin pages.
 * Exported for tests.
 */
export function computeIdlePrefetchPaths(
  role: string | null,
  allowedModules: string[] | null,
): string[] {
  const paths =
    role === "team"
      ? [
          "/team-portal",
          "/chat",
          ...(allowedModules ?? []).map((m) => moduleRoutes[m]).filter(Boolean),
        ]
      : adminDefaultRoutes;
  return Array.from(new Set(paths));
}

/** Run cb when the browser is idle (fallback: delayed timeout). */
function whenIdle(cb: () => void): void {
  const idleWindow =
    typeof window !== "undefined"
      ? (window as Window & {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        })
      : undefined;
  if (idleWindow && typeof idleWindow.requestIdleCallback === "function") {
    idleWindow.requestIdleCallback(cb, { timeout: 5000 });
  } else {
    setTimeout(cb, 1500);
  }
}

// Guard is keyed per logged-in identity so that after a logout/login as a
// different user (shared devices), the new user's routes still get queued.
// Already-downloaded chunks are still deduped via `done`.
let lastPrefetchKey: string | null = null;

/**
 * After auth resolves, warm the chunks for the pages this user can open,
 * one per idle period so we never compete with foreground work.
 */
export function idlePrefetchAllowedRoutes(
  role: string | null,
  allowedModules: string[] | null,
  userKey?: string | null,
): void {
  const key = `${userKey ?? ""}|${role ?? ""}`;
  if (lastPrefetchKey === key) return;
  lastPrefetchKey = key;

  const queue = computeIdlePrefetchPaths(role, allowedModules).filter(
    (p) => !done.has(p),
  );

  const next = () => {
    const path = queue.shift();
    if (!path) return;
    prefetchRoute(path);
    whenIdle(next);
  };
  whenIdle(next);
}

/** Spread props for nav links: prefetch on hover/focus/touch. */
export function prefetchHandlers(path: string) {
  return {
    onMouseEnter: () => prefetchRoute(path),
    onFocus: () => prefetchRoute(path),
    onTouchStart: () => prefetchRoute(path),
  };
}
