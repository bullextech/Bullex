// Tests for the idle route-prefetch path computation used after login.
// Covers the shared-device flow: team member A logs in, logs out, and
// team member B (different module access) logs in — each must get their
// own set of routes to warm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeIdlePrefetchPaths } from "../../client/src/lib/route-prefetch";

test("team member paths = portal + chat + their allowed modules", () => {
  const paths = computeIdlePrefetchPaths("team", ["dashboard", "enquiries", "doc-templates"]);
  assert.deepEqual(paths, ["/team-portal", "/chat", "/dashboard", "/trade-enquiries", "/doc-templates"]);
});

test("two team members with different modules get different route sets", () => {
  const a = computeIdlePrefetchPaths("team", ["enquiries", "documents"]);
  const b = computeIdlePrefetchPaths("team", ["banking", "shipments", "team-network"]);
  assert.deepEqual(a, ["/team-portal", "/chat", "/trade-enquiries", "/documents"]);
  assert.deepEqual(b, ["/team-portal", "/chat", "/banking", "/shipments", "/my-team"]);
});

test("unknown module ids are skipped, duplicates deduped", () => {
  const paths = computeIdlePrefetchPaths("team", ["dashboard", "dashboard", "not-a-module"]);
  assert.deepEqual(paths, ["/team-portal", "/chat", "/dashboard"]);
});

test("team member with no modules still warms portal + chat", () => {
  assert.deepEqual(computeIdlePrefetchPaths("team", []), ["/team-portal", "/chat"]);
  assert.deepEqual(computeIdlePrefetchPaths("team", null), ["/team-portal", "/chat"]);
});

test("admin (null allowedModules) gets the common admin pages", () => {
  const paths = computeIdlePrefetchPaths("admin", null);
  assert.ok(paths.includes("/dashboard"));
  assert.ok(paths.includes("/kyc-admin"));
  assert.ok(paths.includes("/documents"));
  assert.ok(!paths.includes("/team-portal"));
});
