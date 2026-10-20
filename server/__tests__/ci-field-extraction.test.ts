import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceAmountInWords, parseCiContent } from "../documentFileGenerator";
import { generateDocumentContent, type PartyDetails, type ProductDetails } from "../documentTemplates";

// Label-coupling guard: the polished CI DOCX/PDF layouts (buildCiDocx/buildCiPdf)
// re-parse the generated CI text by matching template labels ("SELLER
// (BENEFICIARY)", "Invoice No.:", the goods table header, ...). If the CI
// template in documentTemplates.ts is reworded without updating parseCiContent,
// exported invoices silently render blank fields. These tests generate real CI
// content and assert every key value survives the round trip, so a wording
// change fails loudly here instead.

const BLANK = "_______________";

const seller: PartyDetails = {
  name: "Alpha Commodities DMCC",
  address: "Unit 12, JLT, Dubai, UAE",
  contact: "ops@alpha-commodities.example",
  bank: "Emirates NBD",
  swift: "EBILAEAD",
};

const buyer: PartyDetails = {
  name: "Beta Trading GmbH",
  address: "Hafenstrasse 9, Hamburg, Germany",
  contact: "trade@beta-trading.example",
};

const product: ProductDetails = {
  commodity: "ICUMSA 45 Sugar",
  quantity: "12,500",
  origin: "Brazil",
  loadingPort: "Port of Santos",
  dischargePort: "Port of Jebel Ali",
  price: "485.00",
  currency: "USD",
  paymentTerms: "100% Irrevocable DLC at sight",
  loiIssueNumber: "CI-2026-042",
  vesselName: "MV Ocean Pioneer",
  laycan: "VOY-77",
  charterPartyDate: "15 July 2026",
  packing: "BL-9931",
  specialNote: "LC-556677",
  annexSpecs: "HSBC London",
  validity: "+/- 5%",
  qualityPremiums: "6,062,500.00",
};

test("CI content generated with full data survives the CI field extraction", () => {
  const content = generateDocumentContent("CI", undefined, buyer, seller, product);
  const ci = parseCiContent(content);

  assert.equal(ci.invoiceNo, "CI-2026-042");
  assert.equal(ci.sellerName, "Alpha Commodities DMCC");
  assert.equal(ci.sellerAddr, "Unit 12, JLT, Dubai, UAE");
  assert.equal(ci.sellerContact, "ops@alpha-commodities.example");
  assert.equal(ci.sellerBank, "Emirates NBD");
  assert.equal(ci.sellerSwift, "EBILAEAD");
  assert.equal(ci.buyerName, "Beta Trading GmbH");
  assert.equal(ci.buyerAddr, "Hafenstrasse 9, Hamburg, Germany");
  assert.equal(ci.buyerContact, "trade@beta-trading.example");
  assert.equal(ci.lcNo, "LC-556677");
  assert.equal(ci.lcBank, "HSBC London");
  assert.equal(ci.vessel, "MV Ocean Pioneer");
  assert.equal(ci.voyage, "VOY-77");
  assert.equal(ci.portOfLoading, "Port of Santos");
  assert.equal(ci.portOfDischarge, "Port of Jebel Ali");
  assert.equal(ci.origin, "Brazil");
  assert.equal(ci.blNo, "BL-9931");
  assert.equal(ci.blDate, "15 July 2026");
  assert.equal(ci.commodity, "ICUMSA 45 Sugar");
  assert.equal(ci.quantity, "12,500");
  assert.equal(ci.unitPrice, "485.00");
  assert.equal(ci.currency, "USD");
  assert.equal(ci.totalAmount, "6,062,500.00");
  assert.equal(ci.tolerance, "+/- 5%");
  assert.equal(ci.paymentTerms, "100% Irrevocable DLC at sight");
  // Invoice date is generated as "today" — just assert it is not blank.
  assert.notEqual(ci.date, BLANK);
  assert.ok(ci.date.trim().length > 0);
});

test("no populated CI value degrades to the blank placeholder", () => {
  const content = generateDocumentContent("CI", undefined, buyer, seller, product);
  const ci = parseCiContent(content);
  for (const [key, val] of Object.entries(ci)) {
    assert.notEqual(val, BLANK, `CI field "${key}" extracted as blank placeholder — template wording and parseCiContent are out of sync`);
    assert.ok(String(val).trim().length > 0, `CI field "${key}" extracted as empty`);
  }
});

test("section boundaries keep seller and buyer fields from bleeding into each other", () => {
  const content = generateDocumentContent("CI", undefined, buyer, seller, product);
  const ci = parseCiContent(content);
  // Buyer has no bank/SWIFT in the template; if section ranges broke, the
  // buyer Company/Address lookups could match the seller block instead.
  assert.notEqual(ci.buyerName, ci.sellerName);
  assert.notEqual(ci.buyerAddr, ci.sellerAddr);
});

test("simulated template rewording is caught (extraction returns blanks)", () => {
  // Sanity-check the guard itself: reword one label the way a template edit
  // might, and confirm the extractor visibly degrades to the placeholder.
  const content = generateDocumentContent("CI", undefined, buyer, seller, product)
    .replace("Invoice No.:", "Invoice Number:");
  const ci = parseCiContent(content);
  assert.equal(ci.invoiceNo, BLANK);
});

test("invoice totals are rendered in words for the tabulated amount row", () => {
  assert.equal(
    invoiceAmountInWords("6,062,500.25", "USD"),
    "USD Six Million Sixty Two Thousand Five Hundred And 25/100 Only",
  );
});
