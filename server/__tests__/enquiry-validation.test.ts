// Validation tests: a trade enquiry must always carry a non-blank commodity.
//
// A blank commodity makes an enquiry unusable for matching/deals, so it must be
// rejected at the source. These exercise the schema-level rule directly (pure,
// no database needed). Run with:  npx tsx server/__tests__/enquiry-validation.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { insertTradeEnquirySchema } from "@shared/schema";

test("rejects a missing commodity", () => {
  const r = insertTradeEnquirySchema.safeParse({ side: "buy" });
  assert.equal(r.success, false);
});

test("rejects an empty-string commodity", () => {
  const r = insertTradeEnquirySchema.safeParse({ product: "", side: "buy" });
  assert.equal(r.success, false);
});

test("rejects a whitespace-only commodity", () => {
  const r = insertTradeEnquirySchema.safeParse({ product: "   ", side: "buy" });
  assert.equal(r.success, false);
});

test("accepts and trims a valid commodity", () => {
  const r = insertTradeEnquirySchema.safeParse({ product: "  Copper Cathode  ", side: "buy" });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.product, "Copper Cathode");
});
