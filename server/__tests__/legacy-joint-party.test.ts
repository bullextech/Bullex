// Regression guard: documents generated BEFORE the separate co-party-block
// change render joint parties as ONE merged line —
//   "Primary Co jointly with Second Co"
// with " / " joined address/contact fields. Deriving an SPA from such a
// legacy document relies on the splitJointPartyName fallback in
// deriveNextDocument (server/routes.ts). These tests pin that fallback so a
// future cleanup can't silently drop the joint partner from contracts derived
// from old documents. A companion suite pins the exact Co-Buyer/Co-Seller
// label extraction against silent template label drift.
//
// Run with:  npx tsx --test server/__tests__/legacy-joint-party.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseLoiForSpa,
  parseGeneratedDocFields,
  splitJointPartyName,
} from "../routes";

// ── Legacy-style rendered fixtures ──────────────────────────────────────────

// Legacy LOI: merged joint names under the party-block labels, " / " joined
// address/contact lines, and NO "Co-Buyer Company:" / "Co-Seller Company:"
// labeled lines anywhere.
const legacyLoi = [
  "═══════════════════════════════════════",
  "LETTER OF INTENT",
  "═══════════════════════════════════════",
  "",
  "Issued by Buyer",
  "Acme Buyers DMCC jointly with Beta Trading FZE",
  "Dubai, UAE / Sharjah, UAE",
  "buyer@acme.example / co@beta.example",
  "",
  "Issued to Seller",
  "Globex Sellers Ltd jointly with Gamma Resources Pte",
  "Singapore / Jurong, Singapore",
  "seller@globex.example / co@gamma.example",
  "",
  "═══════════════════════════════════════",
  " 01 │ Commodity        │ Copper Cathode",
  " 02 │ Origin           │ Zambia",
  " 03 │ Quantity         │ 5,000 MT",
  " 04 │ Incoterm         │ CIF",
  " 06 │ Unit Price       │ USD 8,500",
  " 08 │ Specifications   │ Cu: 99.99% min",
  " 09 │ Payment Terms    │ By DLC at sight against shipping documents",
  "═══════════════════════════════════════",
].join("\n");

// Legacy FCO: merged joint names on the "Buyer:"/"Seller:" summary lines,
// no Co-Buyer/Co-Seller lines.
const legacyFco = [
  "FIRM CORPORATE OFFER",
  "",
  "Buyer: Acme Buyers DMCC jointly with Beta Trading FZE",
  "Seller: Globex Sellers Ltd jointly with Gamma Resources Pte",
  "Commodity: Copper Cathode",
  "Origin: Zambia",
  "Quantity: 5,000 MT",
  "Incoterm: CIF",
  "Unit Price: USD 8,500",
  "Payment Terms: By DLC at sight against shipping documents",
].join("\n");

// ── splitJointPartyName fallback ────────────────────────────────────────────

test("splitJointPartyName splits a legacy merged joint name", () => {
  assert.deepEqual(splitJointPartyName("Acme Buyers DMCC jointly with Beta Trading FZE"), {
    primary: "Acme Buyers DMCC",
    co: "Beta Trading FZE",
  });
  // Case-insensitive separator.
  assert.deepEqual(splitJointPartyName("A Co JOINTLY WITH B Co"), {
    primary: "A Co",
    co: "B Co",
  });
});

test("splitJointPartyName leaves a plain name intact (no co party)", () => {
  assert.deepEqual(splitJointPartyName("Acme Buyers DMCC"), {
    primary: "Acme Buyers DMCC",
    co: "",
  });
  assert.deepEqual(splitJointPartyName(""), { primary: "", co: "" });
});

test("splitJointPartyName does not split on 'jointly' inside a company name", () => {
  // Only the exact "jointly with" separator (with surrounding whitespace) splits.
  assert.deepEqual(splitJointPartyName("Jointly Withers Trading Ltd"), {
    primary: "Jointly Withers Trading Ltd",
    co: "",
  });
});

// ── Legacy LOI → parse + fallback recovers both parties ─────────────────────

test("legacy LOI: parseLoiForSpa returns the merged name, no co fields", () => {
  const p = parseLoiForSpa(legacyLoi);
  assert.equal(p.buyerName, "Acme Buyers DMCC jointly with Beta Trading FZE");
  assert.equal(p.sellerName, "Globex Sellers Ltd jointly with Gamma Resources Pte");
  // Legacy docs have no labeled co-party lines — parser must return empty,
  // leaving recovery to the splitJointPartyName fallback.
  assert.equal(p.coBuyerName, "");
  assert.equal(p.coSellerName, "");
});

test("legacy LOI: splitJoint fallback recovers primary and co-party names", () => {
  const p = parseLoiForSpa(legacyLoi);
  const buyerSplit = splitJointPartyName(p.buyerName);
  const sellerSplit = splitJointPartyName(p.sellerName);
  // Mirrors deriveNextDocument: primary replaces the merged name (so KYC
  // lookup can match), co falls back from the split when the parse was empty.
  assert.equal(buyerSplit.primary || p.buyerName, "Acme Buyers DMCC");
  assert.equal(p.coBuyerName || buyerSplit.co, "Beta Trading FZE");
  assert.equal(sellerSplit.primary || p.sellerName, "Globex Sellers Ltd");
  assert.equal(p.coSellerName || sellerSplit.co, "Gamma Resources Pte");
});

test("legacy LOI: commercial fields still parse alongside merged names", () => {
  const p = parseLoiForSpa(legacyLoi);
  assert.equal(p.commodity, "Copper Cathode");
  assert.equal(p.quantity, "5,000 MT");
  assert.equal(p.price, "8,500");
  assert.equal(p.currency, "USD");
  assert.equal(p.paymentTerms, "By DLC at sight against shipping documents");
});

// ── Legacy FCO → parse + fallback recovers both parties ─────────────────────

test("legacy FCO: parseGeneratedDocFields returns merged names, no co fields", () => {
  const p = parseGeneratedDocFields(legacyFco);
  assert.equal(p.buyerName, "Acme Buyers DMCC jointly with Beta Trading FZE");
  assert.equal(p.sellerName, "Globex Sellers Ltd jointly with Gamma Resources Pte");
  assert.equal(p.coBuyerName, "");
  assert.equal(p.coSellerName, "");
});

test("legacy FCO: splitJoint fallback recovers primary and co-party names", () => {
  const p = parseGeneratedDocFields(legacyFco);
  const buyerSplit = splitJointPartyName(p.buyerName);
  const sellerSplit = splitJointPartyName(p.sellerName);
  assert.equal(buyerSplit.primary || p.buyerName, "Acme Buyers DMCC");
  assert.equal(p.coBuyerName || buyerSplit.co, "Beta Trading FZE");
  assert.equal(sellerSplit.primary || p.sellerName, "Globex Sellers Ltd");
  assert.equal(p.coSellerName || sellerSplit.co, "Gamma Resources Pte");
});

// ── Exact co-party label extraction (guards template label drift) ───────────

test("parseLoiForSpa co-party labels match exactly — near-miss labels are ignored", () => {
  const withLabels = [
    "Co-Buyer Company: Beta Trading FZE",
    "Co-Buyer Address: Sharjah, UAE",
    "Co-Buyer Contact: co@beta.example",
    "Co-Seller Company: Gamma Resources Pte",
    "Co-Seller Address: Jurong, Singapore",
    "Co-Seller Contact: co@gamma.example",
  ].join("\n");
  const p = parseLoiForSpa(withLabels);
  assert.equal(p.coBuyerName, "Beta Trading FZE");
  assert.equal(p.coBuyerAddress, "Sharjah, UAE");
  assert.equal(p.coBuyerContact, "co@beta.example");
  assert.equal(p.coSellerName, "Gamma Resources Pte");
  assert.equal(p.coSellerAddress, "Jurong, Singapore");
  assert.equal(p.coSellerContact, "co@gamma.example");

  // A drifted label (e.g. a template rename) must NOT match — the derivation
  // would then fall back to splitJointPartyName rather than silently pick up
  // wrong values.
  const drifted = [
    "Co-Buyer Company Name: Beta Trading FZE",
    "Joint Buyer Company: Beta Trading FZE",
    "Co-Seller Co: Gamma Resources Pte",
  ].join("\n");
  const d = parseLoiForSpa(drifted);
  assert.equal(d.coBuyerName, "");
  assert.equal(d.coSellerName, "");
});

test("parseGeneratedDocFields co-party labels match exactly", () => {
  const withLabels = [
    "Co-Buyer: Beta Trading FZE",
    "Co-Buyer Address: Sharjah, UAE",
    "Co-Buyer Contact: co@beta.example",
    "Co-Seller: Gamma Resources Pte",
    "Co-Seller Address: Jurong, Singapore",
    "Co-Seller Contact: co@gamma.example",
  ].join("\n");
  const p = parseGeneratedDocFields(withLabels);
  assert.equal(p.coBuyerName, "Beta Trading FZE");
  assert.equal(p.coBuyerAddress, "Sharjah, UAE");
  assert.equal(p.coBuyerContact, "co@beta.example");
  assert.equal(p.coSellerName, "Gamma Resources Pte");
  assert.equal(p.coSellerAddress, "Jurong, Singapore");
  assert.equal(p.coSellerContact, "co@gamma.example");

  // The long-form labels used by LOI blocks are also accepted.
  const longForm = [
    "Co-Buyer Company: Beta Trading FZE",
    "Co-Seller Company: Gamma Resources Pte",
  ].join("\n");
  const l = parseGeneratedDocFields(longForm);
  assert.equal(l.coBuyerName, "Beta Trading FZE");
  assert.equal(l.coSellerName, "Gamma Resources Pte");

  // Drifted labels must not match.
  const drifted = [
    "CoBuyer: Beta Trading FZE",
    "Co Seller: Gamma Resources Pte",
  ].join("\n");
  const d = parseGeneratedDocFields(drifted);
  assert.equal(d.coBuyerName, "");
  assert.equal(d.coSellerName, "");
});
