// Pure-function tests guaranteeing enquiry Special Notes survive document
// derivation: an LOI or FCO rendered with a specialNote must carry that note
// into the SPA derived from the parent document's plain text.
//
// The derivation pipeline (deriveNextDocument in routes.ts) round-trips the
// parent's rendered content via parseLoiForSpa (LOI) or parseGeneratedDocFields
// (FCO/SCO/Deal Recap) and feeds the parsed fields into the SPA template. These
// tests exercise exactly that path with the production template + parsers.
// Run with:  npx tsx --test server/__tests__/spa-special-notes.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLoiForSpa, parseGeneratedDocFields, extractSpecialNotes } from "../routes";
import { generateDocumentContent } from "../documentTemplates";

const buyer = { name: "Acme Buyers DMCC", address: "Dubai, UAE", contact: "buyer@acme.example" };
const seller = { name: "Globex Sellers Ltd", address: "Singapore", contact: "seller@globex.example" };
const specialNote = "Performance Bond: 5% of contract value. Buyer requires phytosanitary certificate at loading.";
const baseProduct = {
  commodity: "Copper Cathode",
  origin: "Zambia",
  quantity: "5,000 MT",
  incoterm: "CIF",
  price: "8,500",
  currency: "USD",
  paymentTerms: "By DLC at sight",
  qualitySpecs: "Cu: 99.99% min",
  specialNote,
};

test("LOI with specialNote renders a SPECIAL NOTES block", () => {
  const loi = generateDocumentContent("LOI", undefined, buyer, seller, baseProduct);
  assert.ok(loi.includes("SPECIAL NOTES"));
  assert.ok(loi.includes(specialNote));
});

test("LOI→SPA: parseLoiForSpa recovers the special note", () => {
  const loi = generateDocumentContent("LOI", undefined, buyer, seller, baseProduct);
  const p = parseLoiForSpa(loi);
  assert.equal(p.specialNote, specialNote);
});

test("LOI→SPA: special note appears in the derived SPA body", () => {
  const loi = generateDocumentContent("LOI", undefined, buyer, seller, baseProduct);
  const p = parseLoiForSpa(loi);
  const spa = generateDocumentContent("SPA", undefined,
    { name: p.buyerName, address: "", contact: "" },
    { name: p.sellerName, address: "", contact: "" },
    {
      commodity: p.commodity, origin: p.origin, quantity: p.quantity, incoterm: p.incoterm,
      price: p.price, currency: p.currency, paymentTerms: p.paymentTerms,
      qualitySpecs: p.qualitySpecs, specialNote: p.specialNote,
    },
  );
  assert.ok(spa.includes("SPECIAL NOTES"));
  assert.ok(spa.includes(specialNote));
});

test("FCO with specialNote renders a SPECIAL NOTES block", () => {
  const fco = generateDocumentContent("FCO", undefined, buyer, seller, baseProduct);
  assert.ok(fco.includes("SPECIAL NOTES"));
  assert.ok(fco.includes(specialNote));
});

test("FCO→SPA: parseGeneratedDocFields recovers the special note", () => {
  const fco = generateDocumentContent("FCO", undefined, buyer, seller, baseProduct);
  const p = parseGeneratedDocFields(fco);
  assert.equal(p.specialNote, specialNote);
});

test("FCO→SPA: special note appears in the derived SPA body", () => {
  const fco = generateDocumentContent("FCO", undefined, buyer, seller, baseProduct);
  const p = parseGeneratedDocFields(fco);
  const spa = generateDocumentContent("SPA", undefined,
    { name: p.buyerName, address: "", contact: "" },
    { name: p.sellerName, address: "", contact: "" },
    {
      commodity: p.commodity, quantity: p.quantity, price: p.price, currency: p.currency,
      incoterm: p.incoterm, qualitySpecs: p.qualitySpecs, specialNote: p.specialNote,
    },
  );
  assert.ok(spa.includes("SPECIAL NOTES"));
  assert.ok(spa.includes(specialNote));
});

test("multi-line special note round-trips (single paragraph, no blank lines)", () => {
  const note = "Line one of the note\nLine two of the note";
  const loi = generateDocumentContent("LOI", undefined, buyer, seller, { ...baseProduct, specialNote: note });
  const p = parseLoiForSpa(loi);
  assert.equal(p.specialNote, note);
});

test("documents without a special note yield an empty specialNote and no SPA block", () => {
  const { specialNote: _omit, ...noNote } = baseProduct;
  const loi = generateDocumentContent("LOI", undefined, buyer, seller, noNote);
  assert.ok(!loi.includes("SPECIAL NOTES"));
  const p = parseLoiForSpa(loi);
  assert.equal(p.specialNote, "");

  const spa = generateDocumentContent("SPA", undefined, buyer, seller, noNote);
  assert.ok(!spa.includes("SPECIAL NOTES"));
});

test("multi-paragraph special note (blank line between paragraphs) survives LOI→SPA derivation", () => {
  const note = "First paragraph of the note.\n\nSecond paragraph after a blank line.";
  const loi = generateDocumentContent("LOI", undefined, buyer, seller, { ...baseProduct, specialNote: note });
  const p = parseLoiForSpa(loi);
  assert.equal(p.specialNote, note);
  const spa = generateDocumentContent("SPA", undefined, buyer, seller, { ...baseProduct, specialNote: p.specialNote });
  assert.ok(spa.includes(note));
});

test("multi-paragraph special note survives FCO→SPA derivation", () => {
  const note = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";
  const fco = generateDocumentContent("FCO", undefined, buyer, seller, { ...baseProduct, specialNote: note });
  const p = parseGeneratedDocFields(fco);
  assert.equal(p.specialNote, note);
});

test("multi-paragraph special note survives Deal Recap→SPA derivation", () => {
  const note = "Recap paragraph one.\n\nRecap paragraph two.";
  const recap = generateDocumentContent("DEAL_RECAP", undefined, buyer, seller, { ...baseProduct, specialNote: note });
  const p = parseGeneratedDocFields(recap);
  assert.equal(p.specialNote, note);
});

test("extractSpecialNotes stops at document terminators (signature/closing lines)", () => {
  const fakeDoc = "SPECIAL NOTES\nThe actual note\nAUTHORISED SIGNATORY\nName: X";
  assert.equal(extractSpecialNotes(fakeDoc), "The actual note");
  assert.equal(extractSpecialNotes("no notes here"), "");
});

test("Deal Recap annexure special note carries into a derived SPA", () => {
  const recap = generateDocumentContent("DEAL_RECAP", undefined, buyer, seller, baseProduct);
  assert.ok(recap.includes(specialNote));
  const p = parseGeneratedDocFields(recap);
  assert.equal(p.specialNote, specialNote);
});
