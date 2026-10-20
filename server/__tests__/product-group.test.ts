// Pure tests for the shared main-product grouping used by the enquiry board
// blocks AND the pairing guards (deal formation, candidate TFRs, suggested
// matches). Variants of one main product must merge; distinct commodities that
// merely share a word (fuel oil vs diesel, NPK vs urea) must NOT.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalCommodityBlockParent,
  canonicalProductGroup,
  sameProductGroup,
} from "@shared/product-groups";
import { enquiryProductsMatch } from "../routes";
import type { TradeEnquiry } from "@shared/schema";

const enq = (product: string) => ({ product } as TradeEnquiry);

test("variants of a main product collapse into one group", () => {
  assert.equal(sameProductGroup("Granular Sulphur", "Sulphur 99.9%"), true);
  assert.equal(sameProductGroup("sulfur lumps", "SULPHUR"), true);
  assert.equal(sameProductGroup("EN590 10ppm", "Diesel Gas Oil"), true);
  assert.equal(sameProductGroup("Urea 46% Prilled", "Granular Urea"), true);
  assert.equal(sameProductGroup("Crude Sunflower Oil", "Refined Sunflower Oil"), true);
  assert.equal(canonicalProductGroup("Granular Sulphur").label, "Sulphur");
});

test("distinct commodities sharing a word never merge", () => {
  assert.equal(sameProductGroup("Fuel Oil CST-180", "EN590 Diesel"), false, "fuel oil is not diesel");
  assert.equal(sameProductGroup("Petcoke fuel grade", "Diesel D2"), false);
  assert.equal(sameProductGroup("Jet A1", "EN590"), false, "jet fuel is not diesel");
  assert.equal(sameProductGroup("NPK Fertilizer", "Urea 46%"), false, "NPK is not urea");
  assert.equal(sameProductGroup("DAP", "Urea"), false);
  assert.equal(sameProductGroup("Biodiesel", "EN590 Diesel"), false, "biodiesel is not mineral diesel");
  assert.equal(sameProductGroup("Sulphuric Acid", "Granular Sulphur"), false, "sulphuric acid is not sulphur");
  assert.equal(sameProductGroup("Sunflower Seeds", "Refined Sunflower Oil"), false, "seeds are not oil");
  assert.equal(sameProductGroup("Copper Cathode", "Copper Concentrate"), false, "unknown products need exact names");
  assert.equal(sameProductGroup("", ""), false, "blank products never match");
});

test("unknown products fall back to their own normalized name", () => {
  assert.equal(sameProductGroup("Copper Cathode", " copper cathode "), true);
  assert.equal(canonicalProductGroup("Copper Cathode").label, "Copper Cathode");
});

test("enquiryProductsMatch agrees with the group rules", () => {
  assert.equal(enquiryProductsMatch(enq("Granular Sulphur"), enq("Sulphur 99.9%")), true);
  assert.equal(enquiryProductsMatch(enq("Fuel Oil"), enq("EN590")), false);
  assert.equal(enquiryProductsMatch(enq("NPK Fertilizer"), enq("Urea")), false);
  assert.equal(enquiryProductsMatch(enq("Copper Cathode"), enq("Copper Cathode")), true);
});

test("blockchain product parents use commodity name only", () => {
  assert.deepEqual(canonicalCommodityBlockParent("  UREA\u00a046% Prilled  "), {
    key: "urea",
    label: "Urea",
  });
  assert.deepEqual(canonicalCommodityBlockParent("Copper   Cathode"), {
    key: "copper cathode",
    label: "Copper Cathode",
  });
  assert.equal(
    canonicalCommodityBlockParent("Copper Cathode").key,
    canonicalCommodityBlockParent("copper cathode").key,
  );
  assert.notEqual(
    canonicalCommodityBlockParent("Copper Cathode").key,
    canonicalCommodityBlockParent("Copper Concentrate").key,
  );
  assert.deepEqual(canonicalCommodityBlockParent(" \t "), {
    key: "unknown-commodity",
    label: "Unknown Commodity",
  });
});
