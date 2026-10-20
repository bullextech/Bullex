// Guard tests: joint co-seller/co-buyer companies must survive the
// LOI → SPA and FCO → SPA derivation chains.
//
// Derived documents (SPA back-derived from a parent LOI/FCO) parse the parent's
// RENDERED TEXT, not structured data. Joint parties render as SEPARATE labeled
// blocks ("CO-SELLER DETAILS ..." with "Co-Seller Company/Address/Contact"
// lines) after the primary party's block, and single-line summaries add
// "Co-Buyer:" / "Co-Seller:" lines. These tests render real LOI/FCO content
// with the production templates, run the production parsers, and assert the
// joint company carries through — so a future template label change can't
// silently drop the joint company from derived SPAs.
//
// Run with:  npx tsx --test server/__tests__/joint-party-derivation.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLoiForSpa, parseGeneratedDocFields } from "../routes";
import { generateDocumentContent, type PartyDetails } from "../documentTemplates";

const jointBuyer: PartyDetails = {
  name: "Acme Buyers DMCC",
  address: "Dubai, UAE",
  contact: "buyer@acme.example",
  coName: "Beta Trading FZE",
  coAddress: "Sharjah, UAE",
  coContact: "co@beta.example",
};
const jointSeller: PartyDetails = {
  name: "Globex Sellers Ltd",
  address: "Singapore",
  contact: "seller@globex.example",
  coName: "Gamma Resources Pte",
  coAddress: "Jurong, Singapore",
  coContact: "co@gamma.example",
};
const plainBuyer: PartyDetails = { name: "Acme Buyers DMCC", address: "Dubai, UAE", contact: "buyer@acme.example" };
const plainSeller: PartyDetails = { name: "Globex Sellers Ltd", address: "Singapore", contact: "seller@globex.example" };

const product = {
  commodity: "Copper Cathode",
  origin: "Zambia",
  quantity: "5,000 MT",
  incoterm: "CIF",
  laycan: "15-30 July 2026",
  price: "8,500",
  currency: "USD",
  qualitySpecs: "Cu: 99.99% min",
  paymentTerms: "By DLC at sight against shipping documents",
};

// ── LOI → SPA ───────────────────────────────────────────────────────────────

test("LOI renders co-buyer and co-seller as separate labeled blocks", () => {
  const loi = generateDocumentContent("LOI", undefined, jointBuyer, jointSeller, product);
  assert.ok(loi.includes("Co-Buyer Company: Beta Trading FZE"));
  assert.ok(loi.includes("Co-Buyer Address: Sharjah, UAE"));
  assert.ok(loi.includes("Co-Buyer Contact: co@beta.example"));
  assert.ok(loi.includes("Co-Seller Company: Gamma Resources Pte"));
  assert.ok(loi.includes("Co-Seller Address: Jurong, Singapore"));
  assert.ok(loi.includes("Co-Seller Contact: co@gamma.example"));
  // Party blocks stay primary-only — no " / " joined address/contact fields.
  // (The closing "With warm regards" signature line still signs jointly.)
  assert.ok(!loi.includes("Dubai, UAE / Sharjah, UAE"));
  assert.ok(!loi.includes("Singapore / Jurong, Singapore"));
});

test("LOI→SPA: primary and co party fields carry through parseLoiForSpa", () => {
  const loi = generateDocumentContent("LOI", undefined, jointBuyer, jointSeller, product);
  const p = parseLoiForSpa(loi);
  assert.equal(p.buyerName, "Acme Buyers DMCC");
  assert.equal(p.sellerName, "Globex Sellers Ltd");
  assert.equal(p.coBuyerName, "Beta Trading FZE");
  assert.equal(p.coBuyerAddress, "Sharjah, UAE");
  assert.equal(p.coBuyerContact, "co@beta.example");
  assert.equal(p.coSellerName, "Gamma Resources Pte");
  assert.equal(p.coSellerAddress, "Jurong, Singapore");
  assert.equal(p.coSellerContact, "co@gamma.example");
});

test("LOI→SPA: co parties flow into the generated SPA body as separate blocks", () => {
  const loi = generateDocumentContent("LOI", undefined, jointBuyer, jointSeller, product);
  const p = parseLoiForSpa(loi);
  const spa = generateDocumentContent("SPA", undefined,
    { name: p.buyerName, address: "", contact: "", coName: p.coBuyerName, coAddress: p.coBuyerAddress, coContact: p.coBuyerContact },
    { name: p.sellerName, address: "", contact: "", coName: p.coSellerName, coAddress: p.coSellerAddress, coContact: p.coSellerContact },
    { commodity: p.commodity, quantity: p.quantity, price: p.price, currency: p.currency },
  );
  assert.ok(spa.includes("CO-BUYER DETAILS (JOINT BUYER)"));
  assert.ok(spa.includes("Co-Buyer Company: Beta Trading FZE"));
  assert.ok(spa.includes("Co-Buyer Address: Sharjah, UAE"));
  assert.ok(spa.includes("CO-SELLER DETAILS (JOINT SELLER)"));
  assert.ok(spa.includes("Co-Seller Company: Gamma Resources Pte"));
  assert.ok(spa.includes("Co-Seller Address: Jurong, Singapore"));
  // Joint parties bind jointly and severally in the SPA preamble.
  assert.ok(spa.includes("jointly and severally referred to as the Seller"));
  assert.ok(spa.includes("jointly and severally referred to as the Buyer"));
});

test("LOI→SPA: plain (no joint party) output is unchanged", () => {
  const loi = generateDocumentContent("LOI", undefined, plainBuyer, plainSeller, product);
  const p = parseLoiForSpa(loi);
  assert.equal(p.buyerName, "Acme Buyers DMCC");
  assert.equal(p.sellerName, "Globex Sellers Ltd");
  assert.equal(p.coBuyerName, "");
  assert.equal(p.coSellerName, "");
  assert.ok(!loi.includes("Co-Buyer"));
  assert.ok(!loi.includes("Co-Seller"));
});

test("LOI→SPA: joint party does not disturb the commercial-table round-trip", () => {
  const loi = generateDocumentContent("LOI", undefined, jointBuyer, jointSeller, product);
  const p = parseLoiForSpa(loi);
  assert.equal(p.commodity, "Copper Cathode");
  assert.equal(p.quantity, "5,000 MT");
  assert.equal(p.price, "8,500");
  assert.equal(p.currency, "USD");
  assert.equal(p.paymentTerms, "By DLC at sight against shipping documents");
});

// ── FCO → SPA ───────────────────────────────────────────────────────────────

test("FCO renders co-buyer and co-seller as separate summary lines", () => {
  const fco = generateDocumentContent("FCO", undefined, jointBuyer, jointSeller, product);
  assert.ok(fco.includes("Buyer: Acme Buyers DMCC"));
  assert.ok(fco.includes("Co-Buyer: Beta Trading FZE"));
  assert.ok(fco.includes("Seller: Globex Sellers Ltd"));
  assert.ok(fco.includes("Co-Seller: Gamma Resources Pte"));
  // No " / " joined address/contact fields anywhere.
  assert.ok(!fco.includes("Dubai, UAE / Sharjah, UAE"));
  assert.ok(!fco.includes("Singapore / Jurong, Singapore"));
});

test("FCO→SPA: primary and co names carry through parseGeneratedDocFields", () => {
  const fco = generateDocumentContent("FCO", undefined, jointBuyer, jointSeller, product);
  const p = parseGeneratedDocFields(fco);
  assert.equal(p.buyerName, "Acme Buyers DMCC");
  assert.equal(p.sellerName, "Globex Sellers Ltd");
  assert.equal(p.coBuyerName, "Beta Trading FZE");
  assert.equal(p.coSellerName, "Gamma Resources Pte");
});

test("FCO→SPA: co names flow into the generated SPA body as separate blocks", () => {
  const fco = generateDocumentContent("FCO", undefined, jointBuyer, jointSeller, product);
  const p = parseGeneratedDocFields(fco);
  const spa = generateDocumentContent("SPA", undefined,
    { name: p.buyerName, address: "", contact: "", coName: p.coBuyerName },
    { name: p.sellerName, address: "", contact: "", coName: p.coSellerName },
    { commodity: p.commodity, quantity: p.quantity, price: p.price, currency: p.currency },
  );
  assert.ok(spa.includes("Name of Company: Acme Buyers DMCC"));
  assert.ok(spa.includes("Co-Buyer Company: Beta Trading FZE"));
  assert.ok(spa.includes("Name of Company: Globex Sellers Ltd"));
  assert.ok(spa.includes("Co-Seller Company: Gamma Resources Pte"));
});

test("FCO→SPA: plain (no joint party) output is unchanged", () => {
  const fco = generateDocumentContent("FCO", undefined, plainBuyer, plainSeller, product);
  const p = parseGeneratedDocFields(fco);
  assert.equal(p.buyerName, "Acme Buyers DMCC");
  assert.equal(p.sellerName, "Globex Sellers Ltd");
  assert.equal(p.coBuyerName, "");
  assert.equal(p.coSellerName, "");
  assert.ok(!fco.includes("Co-Buyer"));
  assert.ok(!fco.includes("Co-Seller"));
});

test("FCO→SPA: joint party does not disturb the commercial round-trip", () => {
  const fco = generateDocumentContent("FCO", undefined, jointBuyer, jointSeller, product);
  const p = parseGeneratedDocFields(fco);
  assert.equal(p.commodity, "Copper Cathode");
  assert.equal(p.quantity, "5,000 MT");
  assert.equal(p.incoterm, "CIF");
  assert.equal(p.price, "8,500");
  assert.equal(p.currency, "USD");
});
