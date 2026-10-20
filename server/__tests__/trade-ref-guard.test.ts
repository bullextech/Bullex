// Tests the team-member tradeRef guard used by document preview/create routes.
// The trade linked when an admin accepts an enquiry lives in `linkedTradeRef`
// (there is no `tradeRef` column on trade_enquiries); a prior bug compared the
// supplied tradeRef against a non-existent field and rejected every request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tradeRefMatchesEnquiry } from "../routes";

test("accepts a tradeRef matching the enquiry's linkedTradeRef", () => {
  assert.equal(tradeRefMatchesEnquiry({ linkedTradeRef: "TRD-2026-001" }, "TRD-2026-001"), true);
});

test("rejects a tradeRef that does not match linkedTradeRef", () => {
  assert.equal(tradeRefMatchesEnquiry({ linkedTradeRef: "TRD-2026-001" }, "TRD-2026-999"), false);
});

test("rejects any tradeRef when the enquiry has no linked trade", () => {
  assert.equal(tradeRefMatchesEnquiry({ linkedTradeRef: null }, "TRD-2026-001"), false);
});
