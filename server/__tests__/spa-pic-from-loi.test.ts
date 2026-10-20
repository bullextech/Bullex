// Guards the SPA "person-in-charge" (PIC) lines derived from a Purchase LOI.
//
// parseLoiForSpa reads each party's "Attention (PIC)" value out of the LOI's
// rendered text (label-coupled to the LOI template in documentTemplates.ts) so
// the derived SPA names the right person on its PIC lines. A template tweak
// could silently blank or cross the names — these tests build real LOI content
// with the production template and assert the extraction stays correct.
// Also regression-guards the other SPA-derivation chains (FCO/SCO/Deal Recap →
// SPA), which must NOT pick up a PIC (their PIC line keeps the template's
// contact fallback, with no KYC contactName substitution).
// Run with:  npx tsx --test server/__tests__/spa-pic-from-loi.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLoiForSpa, parseGeneratedDocFields, picForDerivedParty } from "../routes";
import { generateDocumentContent, type PartyDetails, type ProductDetails } from "../documentTemplates";

const buyer: PartyDetails = { name: "Acme Buyers DMCC", address: "Dubai, UAE", contact: "Bob Buyer" };
const seller: PartyDetails = { name: "Globex Sellers Ltd", address: "Singapore", contact: "Sara Seller" };
const product: ProductDetails = {
  commodity: "Copper Cathode",
  origin: "Zambia",
  quantity: "5,000 MT",
  incoterm: "CIF",
  price: "8,500",
  currency: "USD",
};

// ─── parseLoiForSpa PIC extraction ───────────────────────────────────

test("LOI→SPA: distinct seller and buyer PICs land on the right party", () => {
  const loi = generateDocumentContent("LOI", undefined, buyer, seller, product);
  const p = parseLoiForSpa(loi);
  assert.equal(p.sellerPic, "Sara Seller");
  assert.equal(p.buyerPic, "Bob Buyer");
});

test("LOI→SPA: blank PIC parses as empty string, not the underscore placeholder", () => {
  const loi = generateDocumentContent("LOI", undefined,
    { ...buyer, contact: "" },
    { ...seller, contact: undefined },
    product);
  const p = parseLoiForSpa(loi);
  assert.equal(p.sellerPic, "");
  assert.equal(p.buyerPic, "");
});

test("LOI→SPA: a blank PIC never falls through to the other party's PIC", () => {
  // Seller PIC blank, buyer PIC set — the parser must not scan forward past the
  // seller block and steal the buyer's name (and vice versa).
  const sellerBlank = generateDocumentContent("LOI", undefined, buyer, { ...seller, contact: "" }, product);
  let p = parseLoiForSpa(sellerBlank);
  assert.equal(p.sellerPic, "");
  assert.equal(p.buyerPic, "Bob Buyer");

  const buyerBlank = generateDocumentContent("LOI", undefined, { ...buyer, contact: "" }, seller, product);
  p = parseLoiForSpa(buyerBlank);
  assert.equal(p.sellerPic, "Sara Seller");
  assert.equal(p.buyerPic, "");
});

test("LOI→SPA: co-party blocks do not pollute the PIC values", () => {
  const loi = generateDocumentContent("LOI", undefined,
    { ...buyer, coName: "Acme Second GmbH", coAddress: "Hamburg", coContact: "Carl Co-Buyer" },
    { ...seller, coName: "Globex Partner Pte", coAddress: "Jurong", coContact: "Cora Co-Seller" },
    product);
  const p = parseLoiForSpa(loi);
  assert.equal(p.sellerPic, "Sara Seller");
  assert.equal(p.buyerPic, "Bob Buyer");
  // And a blank primary PIC next to a co-party block stays blank — the co
  // company's lines must never be mistaken for the PIC.
  const blankWithCo = generateDocumentContent("LOI", undefined,
    { ...buyer, contact: "", coName: "Acme Second GmbH", coContact: "Carl Co-Buyer" },
    { ...seller, contact: "", coName: "Globex Partner Pte", coContact: "Cora Co-Seller" },
    product);
  const q = parseLoiForSpa(blankWithCo);
  assert.equal(q.sellerPic, "");
  assert.equal(q.buyerPic, "");
});

test("LOI→SPA: simulated 'Attention (PIC)' label rewording is caught", () => {
  // Rename only the SELLER block's label (first occurrence): the seller PIC must
  // go blank rather than crossing over to the buyer block's value.
  const loi = generateDocumentContent("LOI", undefined, buyer, seller, product)
    .replace("Attention (PIC)", "Contact Person");
  const p = parseLoiForSpa(loi);
  assert.equal(p.sellerPic, "");
  assert.equal(p.buyerPic, "Bob Buyer");
  // Rename ALL labels: both PICs blank, never garbage from elsewhere.
  const all = generateDocumentContent("LOI", undefined, buyer, seller, product)
    .replace(/Attention \(PIC\)/g, "Contact Person");
  const q = parseLoiForSpa(all);
  assert.equal(q.sellerPic, "");
  assert.equal(q.buyerPic, "");
});

// ─── Regression: FCO/SCO/Deal Recap → SPA keep contact-based PIC ─────

for (const docType of ["FCO", "SCO", "DEAL_RECAP"]) {
  test(`${docType}→SPA: parseGeneratedDocFields yields NO PIC (contact fallback preserved)`, () => {
    const content = generateDocumentContent(docType, undefined, buyer, seller, product);
    const p = parseGeneratedDocFields(content);
    // Only parseLoiForSpa fills these; other chains must leave them undefined so
    // deriveNextDocument passes pic:"" and the SPA template falls back to the
    // party contact (no KYC contactName substitution outside the LOI chain).
    assert.equal(p.buyerPic, undefined, `${docType}: buyerPic should be undefined`);
    assert.equal(p.sellerPic, undefined, `${docType}: sellerPic should be undefined`);
  });
}

// ─── picForDerivedParty: KYC contactName fallback (LOI-only) ─────────

test("pic selection: blank LOI PIC + approved KYC → contactName used", () => {
  assert.equal(picForDerivedParty("", "LOI", "Kylie Kyc"), "Kylie Kyc");
  assert.equal(picForDerivedParty(undefined, "LOI", "Kylie Kyc"), "Kylie Kyc");
});

test("pic selection: parsed LOI PIC wins over the KYC contactName", () => {
  assert.equal(picForDerivedParty("Bob Buyer", "LOI", "Kylie Kyc"), "Bob Buyer");
});

test("pic selection: blank LOI PIC with no approved KYC → empty string", () => {
  assert.equal(picForDerivedParty("", "LOI", undefined), "");
  assert.equal(picForDerivedParty("", "LOI", null), "");
  assert.equal(picForDerivedParty("", "LOI", ""), "");
});

test("pic selection: non-LOI parents never substitute the KYC contactName", () => {
  for (const parentType of ["FCO", "SCO", "DEAL_RECAP", "SPA", "ICPO"]) {
    assert.equal(picForDerivedParty("", parentType, "Kylie Kyc"), "", `${parentType}: blank PIC must stay blank`);
    assert.equal(picForDerivedParty(undefined, parentType, "Kylie Kyc"), "", `${parentType}: undefined PIC must stay blank`);
    // A parsed PIC (only possible via LOI parsing today) still passes through.
    assert.equal(picForDerivedParty("Parsed Person", parentType, "Kylie Kyc"), "Parsed Person");
  }
});

// ─── SPA template PIC rendering ──────────────────────────────────────

test("SPA template renders the parsed LOI PIC when provided", () => {
  const spa = generateDocumentContent("SPA", undefined,
    { ...buyer, contact: "buyer@acme.example", pic: "Bob Buyer" },
    { ...seller, contact: "seller@globex.example", pic: "Sara Seller" },
    product);
  assert.ok(spa.includes("PIC: Sara Seller"));
  assert.ok(spa.includes("PIC: Bob Buyer"));
  // The contact still renders on the Email line, not the PIC line.
  assert.ok(spa.includes("Email: seller@globex.example"));
  assert.ok(spa.includes("Email: buyer@acme.example"));
});

test("SPA template PIC line falls back to the party contact when no PIC is set", () => {
  const spa = generateDocumentContent("SPA", undefined,
    { ...buyer, contact: "buyer@acme.example", pic: "" },
    { ...seller, contact: "seller@globex.example" },
    product);
  assert.ok(spa.includes("PIC: seller@globex.example"));
  assert.ok(spa.includes("PIC: buyer@acme.example"));
});

test("SPA template PIC line renders empty (never crossed) when pic and contact are both blank", () => {
  const spa = generateDocumentContent("SPA", undefined,
    { name: "B Co", address: "", contact: "" },
    { name: "S Co", address: "", contact: "" },
    product);
  // v(pic, contact) uses the contact as the fallback STRING, so a blank contact
  // yields an empty PIC line — assert it stays empty and no name leaks in.
  const picLines = spa.split("\n").filter(l => l.startsWith("PIC:"));
  assert.equal(picLines.length, 2);
  for (const l of picLines) assert.equal(l.trim(), "PIC:");
});

// ─── End-to-end: parsed LOI PICs flow into the generated SPA body ───

test("LOI→SPA: extracted PICs render on the SPA PIC lines", () => {
  const loi = generateDocumentContent("LOI", undefined, buyer, seller, product);
  const p = parseLoiForSpa(loi);
  const spa = generateDocumentContent("SPA", undefined,
    { name: p.buyerName, address: "", contact: "buyer@acme.example", pic: p.buyerPic },
    { name: p.sellerName, address: "", contact: "seller@globex.example", pic: p.sellerPic },
    { commodity: p.commodity });
  assert.ok(spa.includes("PIC: Sara Seller"));
  assert.ok(spa.includes("PIC: Bob Buyer"));
});
