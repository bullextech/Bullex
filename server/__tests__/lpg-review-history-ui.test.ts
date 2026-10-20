import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LpgReviewHistory } from "../../client/src/pages/document-generator/dialogs/lpg-review-history";
import { LPG_STS_REVIEW_POINTS, type LpgStsReviewHistoryEntry } from "@shared/lpg-sts";

// tsx uses the project's preserved JSX with the classic runtime in node tests.
(globalThis as any).React = React;

test("history renders newest first with review notes, identities and revocation details, without execution controls", () => {
  const history: LpgStsReviewHistoryEntry[] = [
    {
      type: "clearance", fingerprint: "a".repeat(64), reviewedBy: "Original reviewer",
      reviewedAt: "2026-09-20T12:00:00.000Z",
      points: LPG_STS_REVIEW_POINTS.map(({ id }) => ({ id, decision: "resolved", note: `Original ${id} note` })),
    },
    {
      type: "invalidation", fingerprint: "a".repeat(64), nextFingerprint: "b".repeat(64),
      occurredAt: "2026-09-21T12:00:00.000Z", reason: "Document terms changed: content.",
    },
  ];
  const html = renderToStaticMarkup(React.createElement(LpgReviewHistory, { history }));
  assert.ok(html.indexOf("Clearance revoked") < html.indexOf("Clearance recorded"));
  for (const text of ["Original reviewer", "Original pricing note", "Document terms changed: content.", "a".repeat(64), "b".repeat(64), "do not authorize execution"]) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(!/<button|<input|<textarea|<select/.test(html));
  assert.equal(history[0].type, "clearance", "render does not reorder stored history");
});

test("history explains empty and legacy history without implying recovered decisions", () => {
  const html = renderToStaticMarkup(React.createElement(LpgReviewHistory, { history: [] }));
  assert.ok(html.includes("No review decisions recorded yet"));
  assert.ok(html.includes("cannot be recovered"));
});

test("history offers older events only while a page cursor remains", () => {
  const html = renderToStaticMarkup(React.createElement(LpgReviewHistory, {
    history: [], docId: "audit-doc", nextBefore: 40, total: 60,
  }));
  assert.ok(html.includes("Load older events"));
  assert.ok(html.includes("Showing 0 of 60 recorded events"));
  const last = renderToStaticMarkup(React.createElement(LpgReviewHistory, {
    history: [], docId: "audit-doc", nextBefore: null, total: 0,
  }));
  assert.ok(!last.includes("Load older events"));
});