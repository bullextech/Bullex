// Pure-function tests for deriving an SPA from a Full Corporate Offer (FCO).
//
// The "Generate SPA from FCO" workflow round-trips a generated FCO's plain-text
// content back into structured fields (parseGeneratedDocFields) so every FCO
// detail is carried into the SPA. We build a real FCO with the production
// template, then assert the parser recovers the same values (parties, commodity,
// terms, and the reconstructed commodity-spec table).
// Run with:  npx tsx --test server/__tests__/fco-to-spa.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGeneratedDocFields, evaluateDocTransition } from "../routes";
import { generateDocumentContent } from "../documentTemplates";

const buyer = { name: "Acme Buyers DMCC", address: "Dubai, UAE", contact: "buyer@acme.example", bank: "Emirates NBD", swift: "EBILAEAD" };
const seller = { name: "Globex Sellers Ltd", address: "Singapore", contact: "seller@globex.example", bank: "DBS Bank", swift: "DBSSSGSG" };
const product = {
  commodity: "Copper Cathode",
  origin: "Zambia",
  quantity: "5,000 MT",
  packing: "In Bulk / Jumbo Bags",
  incoterm: "CIF",
  laycan: "15-30 July 2026",
  price: "8,500",
  currency: "USD",
  qualitySpecs: "Cu: 99.99% min (Rejection: <99.9%) [Method: LME]\nGrade: Grade A LME registered\nForm: Cathode sheets",
  paymentTerms: "By DLC at sight against shipping documents",
  loadingPort: "Dar es Salaam",
  dischargePort: "Shanghai",
};

const fco = generateDocumentContent("FCO", undefined, buyer, seller, product);

test("FCO→SPA: party names are recovered from the FCO trade block", () => {
  const p = parseGeneratedDocFields(fco);
  assert.equal(p.buyerName, "Acme Buyers DMCC");
  assert.equal(p.sellerName, "Globex Sellers Ltd");
});

test("FCO→SPA: commodity/commercial fields round-trip (incl. FCO-specific labels)", () => {
  const p = parseGeneratedDocFields(fco);
  assert.equal(p.commodity, "Copper Cathode");
  assert.equal(p.origin, "Zambia");
  assert.equal(p.quantity, "5,000 MT");
  assert.equal(p.packing, "In Bulk / Jumbo Bags");
  // FCO renders "Incoterm" (singular) and "Unit Price"/"Currency", which the
  // old generic parser missed entirely.
  assert.equal(p.incoterm, "CIF");
  assert.equal(p.laycan, "15-30 July 2026");
  assert.equal(p.paymentTerms, "By DLC at sight against shipping documents");
});

test("FCO→SPA: price splits the leading currency token (no USD doubling)", () => {
  const p = parseGeneratedDocFields(fco);
  assert.equal(p.currency, "USD");
  assert.equal(p.price, "8,500");
  assert.ok(!/^[A-Z]{3}\s/.test(p.price));
});

test("FCO→SPA: the rendered spec table is reconstructed into a spec blob", () => {
  const p = parseGeneratedDocFields(fco);
  assert.ok(p.qualitySpecs.includes("Cu: 99.99% min"));
  assert.ok(p.qualitySpecs.includes("(Rejection: <99.9%)"));
  assert.ok(p.qualitySpecs.includes("[Method: LME]"));
  assert.ok(p.qualitySpecs.includes("Grade A LME registered"));
  assert.ok(p.qualitySpecs.includes("Cathode sheets"));
  // The header row must never leak into the reconstructed blob.
  assert.ok(!p.qualitySpecs.includes("Parameter: Specification"));
});

test("FCO→SPA: extracted fields flow into a generated SPA body", () => {
  const p = parseGeneratedDocFields(fco);
  const spa = generateDocumentContent("SPA", undefined,
    { name: p.buyerName, address: "", contact: "" },
    { name: p.sellerName, address: "", contact: "" },
    {
      commodity: p.commodity, origin: p.origin, quantity: p.quantity, packing: p.packing, incoterm: p.incoterm,
      price: p.price, currency: p.currency, laycan: p.laycan, paymentTerms: p.paymentTerms,
      qualitySpecs: p.qualitySpecs,
    },
  );
  assert.ok(spa.includes("Packing: In Bulk / Jumbo Bags"));
  assert.ok(spa.includes("Copper Cathode"));
  assert.ok(spa.includes("Acme Buyers DMCC"));
  assert.ok(spa.includes("Globex Sellers Ltd"));
  assert.ok(spa.includes("15-30 July 2026"));
  assert.ok(spa.includes("USD 8,500"));
  assert.ok(!spa.includes("USD USD"));
  assert.ok(spa.includes("Cu: 99.99% min") || spa.includes("99.99% min"));
});

test("FCO→SPA: sparse FCO normalises missing fields to empty strings", () => {
  const sparse = generateDocumentContent("FCO", undefined,
    { name: "B Co", address: "", contact: "" },
    { name: "S Co", address: "", contact: "" },
    { commodity: "NPK" });
  const p = parseGeneratedDocFields(sparse);
  assert.equal(p.commodity, "NPK");
  assert.equal(p.origin, "");
  assert.equal(p.laycan, "");
  assert.equal(p.qualitySpecs, "");
});

// --- Transition gate (POST /api/documents/:id/create-next) -------------------
//
// The create-next route lets a trader turn an FCO straight into an SPA without
// waiting for the recipient to accept it, while an FCO→Deal Recap still requires
// acceptance. These tests lock in that business rule via the pure gate the route
// delegates to (evaluateDocTransition).

test("gate: FCO→SPA is allowed while the FCO is unaccepted (recipientResponse null)", () => {
  const r = evaluateDocTransition({ parentDocType: "FCO", nextDocType: "SPA", recipientResponse: null });
  assert.equal(r.ok, true);
});

test("gate: FCO→Deal Recap is blocked (400) until the FCO is accepted", () => {
  const r = evaluateDocTransition({ parentDocType: "FCO", nextDocType: "DEAL_RECAP", recipientResponse: null });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.equal(r.message, "Parent document must be accepted first");
});

test("gate: FCO→Deal Recap succeeds once the FCO has been accepted", () => {
  const r = evaluateDocTransition({ parentDocType: "FCO", nextDocType: "DEAL_RECAP", recipientResponse: "accepted" });
  assert.equal(r.ok, true);
});

test("gate: a pending recipient response does not unlock FCO→Deal Recap", () => {
  const r = evaluateDocTransition({ parentDocType: "FCO", nextDocType: "DEAL_RECAP", recipientResponse: "pending" });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("gate: an unsupported transition is rejected with a 400 and an explanatory message", () => {
  const r = evaluateDocTransition({ parentDocType: "FCO", nextDocType: "LOI", recipientResponse: "accepted" });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.ok(r.message?.startsWith("Invalid transition: FCO can only create"));
});

test("gate: LOI converts directly to an SPA without acceptance (offer shortcut)", () => {
  const r = evaluateDocTransition({ parentDocType: "LOI", nextDocType: "SPA", recipientResponse: null });
  assert.equal(r.ok, true);
});

// --- Signature-driven auto-chain additions -----------------------------------
//
// The automatic chain (FCO signed → Deal Recap, Deal Recap signed → SPA)
// reuses the same transition map. The TFR is NOT part of the document chain:
// it consolidates BOTH legs of a matched deal, so it is only prepared via the
// Deal Pipeline (deal matching), never derived from a single SPA.

test("gate: SPA→TFR is rejected — TFRs are prepared only via deal matching", () => {
  const r = evaluateDocTransition({ parentDocType: "SPA", nextDocType: "TFR", recipientResponse: null, hasAnySignature: true });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("gate: SPA can create addenda and bank drafts, but not a Deal Recap", () => {
  const r = evaluateDocTransition({ parentDocType: "SPA", nextDocType: "DEAL_RECAP", recipientResponse: "accepted" });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.ok(r.message?.startsWith("Invalid transition: SPA can only create ADDENDUM"));
});
