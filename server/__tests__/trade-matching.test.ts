// Pure-function tests for the confidential terminal + matching engine.
//
// These exercise the spec's three security/logic-critical pure helpers with no
// database: registration-code resolution (NEVER a name), anonymized listing
// construction (NO buyer/seller names in the payload), and the multi-field
// match scorer (product hard-gate + weighted closeness summing to 100).
// Run with:  npx tsx --test server/__tests__/trade-matching.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveEnquiryRegCode,
  buildTerminalListing,
  scoreInstrumentMatch,
} from "../routes";
import type { TradeEnquiry } from "@shared/schema";

function enq(over: Partial<TradeEnquiry>): TradeEnquiry {
  return {
    enquiryRef: `REF-${Math.random().toString(36).slice(2, 8)}`,
    side: "buy",
    product: "Copper Cathode",
    status: "active",
    quantity: "5000",
    unit: "MT",
    price: "8000",
    currency: "USD",
    origin: "Zambia",
    loadingPort: "Dar es Salaam",
    dischargePort: "Shanghai",
    incoterms: "FOB",
    paymentTerms: "Letter of Credit",
    buyerName: "SECRET Buyer Co",
    sellerName: "SECRET Seller Co",
    ...over,
  } as TradeEnquiry;
}

const codes = {
  clientCodeByKycId: new Map<string, string>([["kyc-1", "BFG-CL-0001"]]),
  teamCodeById: new Map<string, string>([["tm-1", "BFG-TM-0007"]]),
};

// ── resolveEnquiryRegCode ──────────────────────────────────────────
test("regCode: client (submittedByClientId) resolves to KYC participant code", () => {
  const code = resolveEnquiryRegCode(enq({ submittedByClientId: "kyc-1" } as any), codes);
  assert.equal(code, "BFG-CL-0001");
});

test("regCode: assignedToClientId is used when submittedByClientId is absent", () => {
  const code = resolveEnquiryRegCode(enq({ assignedToClientId: "kyc-1" } as any), codes);
  assert.equal(code, "BFG-CL-0001");
});

test("regCode: falls back to team member code", () => {
  const code = resolveEnquiryRegCode(enq({ submittedByTeamMemberId: "tm-1" } as any), codes);
  assert.equal(code, "BFG-TM-0007");
});

test("regCode: client takes precedence over team member", () => {
  const code = resolveEnquiryRegCode(
    enq({ submittedByClientId: "kyc-1", submittedByTeamMemberId: "tm-1" } as any),
    codes,
  );
  assert.equal(code, "BFG-CL-0001");
});

test("regCode: returns em-dash when nothing resolves (never a name)", () => {
  const code = resolveEnquiryRegCode(enq({}), codes);
  assert.equal(code, "—");
  assert.ok(!code.includes("SECRET"));
});

// ── buildTerminalListing (anonymization) ───────────────────────────
test("listing: contains the reg code and ZERO buyer/seller names", () => {
  const e = enq({ submittedByClientId: "kyc-1", buyerName: "SECRET Buyer Co", sellerName: "SECRET Seller Co" });
  const regCode = resolveEnquiryRegCode(e, codes);
  const listing = buildTerminalListing(e, regCode, { registered: false, instrumentType: null });
  const serialized = JSON.stringify(listing);
  assert.ok(!serialized.includes("SECRET"), "listing payload must not leak any name");
  assert.equal(listing.regCode, "BFG-CL-0001");
  assert.equal(listing.commodity, "Copper Cathode");
  assert.equal(listing.volume, 5000);
  assert.equal(listing.price, 8000);
});

test("listing: status is 'registered' when an accepted instrument exists", () => {
  const l = buildTerminalListing(enq({}), "BFG-CL-0001", { registered: true, instrumentType: "LOI" });
  assert.equal(l.status, "registered");
  assert.equal(l.instrumentType, "LOI");
  assert.equal(l.registered, true);
});

test("listing: status is 'matched' when linked to a trade (overrides registered)", () => {
  const l = buildTerminalListing(
    enq({ linkedTradeRef: "BFG-2026-0001" } as any),
    "BFG-CL-0001",
    { registered: true, instrumentType: "LOI" },
  );
  assert.equal(l.status, "matched");
});

test("listing: status is 'open' for an unregistered, unmatched enquiry", () => {
  const l = buildTerminalListing(enq({}), "—", { registered: false, instrumentType: null });
  assert.equal(l.status, "open");
  assert.equal(l.instrumentType, null);
});

// ── scoreInstrumentMatch ───────────────────────────────────────────
test("score: different commodities return null (product hard-gate)", () => {
  const buy = enq({ side: "buy", product: "Copper Cathode" });
  const sell = enq({ side: "sell", product: "Iron Ore" });
  assert.equal(scoreInstrumentMatch(buy, sell), null);
});

test("score: a perfect pairing scores 100 with full breakdown", () => {
  const buy = enq({
    side: "buy", quantity: "5000", price: "8000",
    origin: "Zambia", dischargePort: "Shanghai", paymentTerms: "Letter of Credit", incoterms: "FOB",
  });
  const sell = enq({
    side: "sell", quantity: "5000", price: "8000",
    origin: "Zambia", dischargePort: "Shanghai", paymentTerms: "Letter of Credit", incoterms: "FOB",
  });
  const r = scoreInstrumentMatch(buy, sell)!;
  assert.equal(r.score, 100);
  assert.equal(r.breakdown.product, 40);
  assert.equal(r.breakdown.quantity, 20);
  assert.equal(r.breakdown.price, 15);
  assert.equal(r.breakdown.origin, 10);
  assert.equal(r.breakdown.destination, 5);
  assert.equal(r.breakdown.payment, 5);
  assert.equal(r.breakdown.incoterms, 5);
});

test("score: buyer bid above seller ask earns full price marks", () => {
  const buy = enq({ side: "buy", price: "9000" });
  const sell = enq({ side: "sell", price: "8000" });
  const r = scoreInstrumentMatch(buy, sell)!;
  assert.equal(r.breakdown.price, 15);
});

test("score: a low bid scales price marks down proportionally", () => {
  const buy = enq({ side: "buy", price: "4000" });
  const sell = enq({ side: "sell", price: "8000" });
  const r = scoreInstrumentMatch(buy, sell)!;
  assert.equal(r.breakdown.price, Math.round((4000 / 8000) * 15)); // 8
});

test("score: mismatched quantity reduces the quantity component", () => {
  const buy = enq({ side: "buy", quantity: "2500" });
  const sell = enq({ side: "sell", quantity: "5000" });
  const r = scoreInstrumentMatch(buy, sell)!;
  assert.equal(r.breakdown.quantity, Math.round((2500 / 5000) * 20)); // 10
});

test("score: weights never exceed 100", () => {
  const buy = enq({ side: "buy", price: "999999" });
  const sell = enq({ side: "sell", price: "1" });
  const r = scoreInstrumentMatch(buy, sell)!;
  assert.ok(r.score <= 100);
});
