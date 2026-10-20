// Regression tests guarding the offer-document → SPA round-trip against template
// label drift.
//
// parseGeneratedDocFields recovers SPA fields from a generated offer document by
// matching the exact text labels each template prints (e.g. "Contractual
// Quantity", "Delivery Basis", "Delivery Period", "Loading Window"). If anyone
// renames a label in server/documentTemplates.ts, the matching field silently
// stops carrying into the next document (Deal Recap / SPA) and the contract comes
// out blank in that spot with no error. These tests generate a real SCO and Deal
// Recap with the production template and assert the parser still recovers
// quantity, incoterm, price, currency, laycan, and the reconstructed spec table —
// so a renamed label surfaces here as a failing test instead of a blank contract.
// Run with:  npx tsx --test server/__tests__/offer-to-spa.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGeneratedDocFields } from "../routes";
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

// The fields the create-next workflow carries from an accepted offer into the
// next document. Asserted for every source type so a label rename in any
// template fails loudly here.
function assertCoreFieldsRecovered(p: ReturnType<typeof parseGeneratedDocFields>) {
  assert.equal(p.commodity, "Copper Cathode");
  assert.equal(p.origin, "Zambia");
  assert.equal(p.quantity, "5,000 MT");
  assert.equal(p.incoterm, "CIF");
  assert.equal(p.laycan, "15-30 July 2026");
  assert.equal(p.price, "8,500");
  assert.equal(p.currency, "USD");
  // No currency doubling: the amount must not retain a leading currency token.
  assert.ok(!/^[A-Z]{3}\s/.test(p.price));
}

function assertSpecTableRecovered(p: ReturnType<typeof parseGeneratedDocFields>) {
  assert.ok(p.qualitySpecs.includes("Cu: 99.99% min"));
  assert.ok(p.qualitySpecs.includes("(Rejection: <99.9%)"));
  assert.ok(p.qualitySpecs.includes("[Method: LME]"));
  assert.ok(p.qualitySpecs.includes("Grade A LME registered"));
  assert.ok(p.qualitySpecs.includes("Cathode sheets"));
  // The header row must never leak into the reconstructed blob.
  assert.ok(!p.qualitySpecs.includes("Parameter: Specification"));
}

// --- SCO → Deal Recap -------------------------------------------------------
// The SCO renders its terms in a 3-column box table ("01 │ Commodity │ value")
// with FCO-distinct labels: "Incoterms", "Price" (with a " per MT" suffix), and
// "Delivery Period" for the laycan.

const sco = generateDocumentContent("SCO", undefined, buyer, seller, product);

test("SCO→Deal Recap: commodity/commercial fields round-trip from the 3-column box table", () => {
  assertCoreFieldsRecovered(parseGeneratedDocFields(sco));
});

test("SCO→Deal Recap: the rendered spec table is reconstructed into a spec blob", () => {
  assertSpecTableRecovered(parseGeneratedDocFields(sco));
});

test("SCO→Deal Recap: payment terms round-trip", () => {
  assert.equal(parseGeneratedDocFields(sco).paymentTerms, "By DLC at sight against shipping documents");
});

// --- Deal Recap → SPA -------------------------------------------------------
// The Deal Recap renders 2-column chapter tables ("Contractual Quantity │ value",
// "Delivery Basis │ value", "Loading Window │ value", "Contract Price & Currency
// │ value") and an ANNEXURE I spec table.

const recap = generateDocumentContent("DEAL_RECAP", undefined, buyer, seller, product);

test("Deal Recap→SPA: party names round-trip from the chapter tables", () => {
  const p = parseGeneratedDocFields(recap);
  assert.equal(p.buyerName, "Acme Buyers DMCC");
  assert.equal(p.sellerName, "Globex Sellers Ltd");
});

test("Deal Recap→SPA: commodity/commercial fields round-trip", () => {
  assertCoreFieldsRecovered(parseGeneratedDocFields(recap));
});

test("Deal Recap→SPA: packing round-trips from the chapter table", () => {
  assert.equal(parseGeneratedDocFields(recap).packing, "In Bulk / Jumbo Bags");
});

test("SCO→next: packing parses empty (SCO's serial table has no Packing row)", () => {
  // Locks the label behaviour: the parser must return empty, not garbage,
  // when a doc type doesn't render packing.
  assert.equal(parseGeneratedDocFields(sco).packing, "");
});

test("Deal Recap→SPA: the ANNEXURE spec table is reconstructed into a spec blob", () => {
  assertSpecTableRecovered(parseGeneratedDocFields(recap));
});

test("Deal Recap→SPA: extracted fields flow into a generated SPA body", () => {
  const p = parseGeneratedDocFields(recap);
  const spa = generateDocumentContent("SPA", undefined,
    { name: p.buyerName, address: "", contact: "" },
    { name: p.sellerName, address: "", contact: "" },
    {
      commodity: p.commodity, origin: p.origin, quantity: p.quantity, incoterm: p.incoterm,
      price: p.price, currency: p.currency, laycan: p.laycan, paymentTerms: p.paymentTerms,
      qualitySpecs: p.qualitySpecs,
    },
  );
  assert.ok(spa.includes("Copper Cathode"));
  assert.ok(spa.includes("Acme Buyers DMCC"));
  assert.ok(spa.includes("Globex Sellers Ltd"));
  assert.ok(spa.includes("15-30 July 2026"));
  assert.ok(spa.includes("USD 8,500"));
  assert.ok(!spa.includes("USD USD"));
  assert.ok(spa.includes("Cu: 99.99% min") || spa.includes("99.99% min"));
});
