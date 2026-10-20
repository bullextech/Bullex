import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDealRecapData, parseLoiContent } from "../documentFileGenerator";
import { generateDocumentContent, type PartyDetails, type ProductDetails } from "../documentTemplates";

// Label-coupling guard for the remaining polished layouts (same pattern as
// ci-field-extraction.test.ts / shipping-docs-field-extraction.test.ts): the
// Deal Recap and LOI DOCX & PDF builders re-parse the generated text by
// matching template labels ("Contract Reference", "Valid Till", "Issued to
// Seller", ...). If those templates in documentTemplates.ts are reworded
// without updating extractDealRecapData/parseLoiContent, exported documents
// silently render blank fields. These tests generate real content and assert
// every key value survives the round trip, so a wording change fails loudly.

const BLANK = "_______________";

const seller: PartyDetails = {
  name: "Alpha Commodities DMCC",
  address: "Unit 12, JLT, Dubai, UAE",
  contact: "John Smith",
};

const buyer: PartyDetails = {
  name: "Beta Trading GmbH",
  address: "Hafenstrasse 9, Hamburg, Germany",
  contact: "Jane Weber",
};

// ─── DEAL RECAP ──────────────────────────────────────────────────────

const recapProduct: ProductDetails = {
  commodity: "Iron Ore Fines 62% Fe",
  origin: "Australia",
  quantity: "55,000 MT +/- 10%",
  price: "1,250.00 per MT",
  currency: "USD",
  paymentTerms: "100% Irrevocable DLC at sight",
  recapValidity: "Valid for 5 calendar days from issuance",
  deliveryBasis: "CIF Qingdao",
  loadingWindow: "01-15 September 2026",
  shippingTerms: "CIF Qingdao, single shipment",
  governingLaw: "English law, ICC arbitration in London",
  qualitySpecs: "Fe: 62% (Rejection: below 60%) [Method: ISO 2597]",
};

// Template string interpolation evaluates trade fallbacks eagerly even when
// the product value wins, so the fake trade needs the numeric fields too.
const recapTrade = { tradeRef: "TR-2026-001", quantity: 55000, unit: "MT", pricePerUnit: 1250, currency: "USD" } as any;

test("Deal Recap content generated with full data survives extractDealRecapData", () => {
  const content = generateDocumentContent("DEAL_RECAP", recapTrade, buyer, seller, recapProduct);
  const d = extractDealRecapData(content);

  assert.equal(d.tradeRef, "TR-2026-001");
  assert.equal(d.sellerName, "Alpha Commodities DMCC");
  assert.equal(d.buyerName, "Beta Trading GmbH");
  assert.equal(d.recapValidity, "Valid for 5 calendar days from issuance");
  assert.equal(d.commodity, "Iron Ore Fines 62% Fe");
  assert.equal(d.origin, "Australia");
  assert.equal(d.deliveryBasis, "CIF Qingdao");
  assert.equal(d.quantity, "55,000 MT +/- 10%");
  assert.equal(d.price, "USD 1,250.00 per MT");
  assert.equal(d.paymentTerms, "100% Irrevocable DLC at sight");
  assert.equal(d.loadingWindow, "01-15 September 2026");
  assert.equal(d.shippingTerms, "CIF Qingdao, single shipment");
  assert.equal(d.governingLaw, "English law, ICC arbitration in London");
  // Quality/Specification row carries the fixed annex pointer text.
  assert.ok((d.qualitySpecs || "").includes("Annexure I"));
  // Annex spec table row must round-trip the structured spec.
  assert.ok((d.annexSpecs || "").includes("Fe | 62% | below 60% | ISO 2597"));
  // Signature block names.
  assert.equal(d.sellerContact, "John Smith");
  assert.equal(d.buyerContact, "Jane Weber");
});

test("no populated Deal Recap value degrades to blank", () => {
  const content = generateDocumentContent("DEAL_RECAP", recapTrade, buyer, seller, recapProduct);
  const d = extractDealRecapData(content) as unknown as Record<string, string | undefined>;
  for (const [key, val] of Object.entries(d)) {
    assert.ok(val !== undefined && String(val).trim().length > 0, `Deal Recap field "${key}" extracted as empty`);
    assert.notEqual(val, BLANK, `Deal Recap field "${key}" extracted as blank placeholder — template wording and extractDealRecapData are out of sync`);
  }
});

test("simulated Deal Recap template rewording is caught", () => {
  const content = generateDocumentContent("DEAL_RECAP", recapTrade, buyer, seller, recapProduct)
    .replace("Contract Reference", "Agreement Reference");
  const d = extractDealRecapData(content);
  assert.equal(d.tradeRef, undefined);
});

// ─── LOI (PURCHASE LETTER OF INTENT) ─────────────────────────────────

const loiProduct: ProductDetails = {
  commodity: "Iron Ore Fines 62% Fe",
  origin: "Australia",
  quantity: "55,000 MT",
  packing: "Bulk in vessel holds",
  incoterm: "CIF",
  laycan: "01-15 September 2026",
  price: "1,250.00 per MT",
  currency: "USD",
  contractConfirmation: "Subject to mine confirmation",
  paymentTerms: "By DLC against 2% PB",
  docsForPayment: "Full set of shipping documents",
  otherTerms: "Partial shipments not allowed",
  compliance: "Full AML/KYC compliance required",
  validity: "Friday, 14 August 2026 (2000HRS Dubai Time)",
  refPerson: "Mr. Ahmed Al-Rashid",
  loiIssueNumber: "LOI-2026-042",
  qualitySpecs: "Fe: 62% (Rejection: below 60%) [Method: ISO 2597]",
  loadingPort: "Port Hedland",
  dischargePort: "Qingdao",
  specialNote: "Trial shipment of 5,000 MT first.",
};

function headerValue(rows: { label: string; value: string }[], label: string): string | undefined {
  return rows.find(r => r.label === label)?.value;
}

test("LOI content generated with full data survives parseLoiContent", () => {
  const content = generateDocumentContent("LOI", undefined, buyer, seller, loiProduct);
  const loi = parseLoiContent(content);

  // Seller header block
  assert.ok((headerValue(loi.headerRows, "Seller") || "").includes("Alpha Commodities DMCC"));
  assert.ok((headerValue(loi.headerRows, "Seller") || "").includes("Unit 12, JLT, Dubai, UAE"));
  assert.equal(headerValue(loi.headerRows, "Attention (PIC)"), "John Smith");
  assert.equal(headerValue(loi.headerRows, "Ref"), "Mr. Ahmed Al-Rashid");
  assert.ok((headerValue(loi.headerRows, "LOI Issue No. and Date") || "").includes("LOI-2026-042"));
  assert.equal(headerValue(loi.headerRows, "Valid Till"), "Friday, 14 August 2026 (2000HRS Dubai Time)");
  assert.equal(headerValue(loi.headerRows, "Purchase Incoterms"), "CIF");

  // Buyer header block
  assert.ok((headerValue(loi.buyerRows, "Buyer") || "").includes("Beta Trading GmbH"));
  assert.ok((headerValue(loi.buyerRows, "Buyer") || "").includes("Hafenstrasse 9, Hamburg, Germany"));
  assert.equal(headerValue(loi.buyerRows, "Attention (PIC)"), "Jane Weber");

  // Parameters table
  const param = (name: string) => loi.paramRows.find(r => r.param === name)?.detail;
  assert.equal(param("Commodity"), "Iron Ore Fines 62% Fe");
  assert.equal(param("Origin"), "Australia");
  assert.equal(param("Quantity"), "55,000 MT");
  assert.equal(param("Packing"), "Bulk in vessel holds");
  assert.equal(param("Incoterms Terms"), "CIF");
  assert.equal(param("Delivery period"), "01-15 September 2026");
  assert.equal(param("Price"), "USD 1,250.00 per MT");
  assert.equal(param("Contract Confirmation"), "Subject to mine confirmation");
  assert.equal(param("Payment Terms"), "By DLC against 2% PB");
  assert.equal(param("Documents for Payment"), "Full set of shipping documents");
  assert.equal(param("Other terms & conditions"), "Partial shipments not allowed");
  assert.equal(param("Compliance"), "Full AML/KYC compliance required");

  // Spec table, logistics, special notes
  assert.deepEqual(loi.specRows, [["Fe", "62%", "below 60%", "ISO 2597"]]);
  assert.equal(loi.logisticsRows.find(r => r.label === "Loading Port")?.value, "Port Hedland");
  assert.equal(loi.logisticsRows.find(r => r.label === "Discharge Port")?.value, "Qingdao");
  assert.equal(loi.specialNote, "Trial shipment of 5,000 MT first.");

  // Closing carries the buyer signatory name.
  assert.ok(loi.closingLines.some(l => l.includes("Beta Trading GmbH")));
});

test("no populated LOI header/parameter value degrades to blank", () => {
  const content = generateDocumentContent("LOI", undefined, buyer, seller, loiProduct);
  const loi = parseLoiContent(content);
  for (const row of [...loi.headerRows, ...loi.buyerRows]) {
    assert.ok(row.value.trim().length > 0, `LOI header "${row.label}" extracted as empty`);
    assert.notEqual(row.value, BLANK, `LOI header "${row.label}" extracted as blank placeholder`);
  }
  assert.equal(loi.paramRows.length, 13, "LOI parameters table did not round-trip all 13 rows");
  for (const row of loi.paramRows) {
    assert.notEqual(row.detail, BLANK, `LOI parameter "${row.param}" extracted as blank placeholder`);
    assert.ok(row.detail.trim().length > 0, `LOI parameter "${row.param}" extracted as empty`);
  }
});

test("simulated LOI template rewording is caught", () => {
  const content = generateDocumentContent("LOI", undefined, buyer, seller, loiProduct)
    .replace("Valid Till", "Validity Window");
  const loi = parseLoiContent(content);
  assert.equal(headerValue(loi.headerRows, "Valid Till"), undefined);
});
