import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBlContent, parseCooContent, parseCoaContent, parseCowContent } from "../documentFileGenerator";
import { generateDocumentContent, type PartyDetails, type ProductDetails } from "../documentTemplates";

// Label-coupling guard for the other polished shipping documents (same pattern
// as ci-field-extraction.test.ts): the polished BL/COO/COA/COW DOCX & PDF
// layouts re-parse the generated text by matching template labels ("SHIPPER",
// "NAME OF COMMODITY:", "REF:  Certificate No. ", ...). If those templates in
// documentTemplates.ts are reworded without updating the parse helpers,
// exported documents silently render blank fields. These tests generate real
// content for each doc type and assert every key value survives the round
// trip, so a wording change fails loudly here instead.

const BLANK = "_______________";

const seller: PartyDetails = {
  name: "Alpha Commodities DMCC",
  address: "Unit 12, JLT, Dubai, UAE",
  contact: "ops@alpha-commodities.example",
};

const buyer: PartyDetails = {
  name: "Beta Trading GmbH",
  address: "Hafenstrasse 9, Hamburg, Germany",
  contact: "trade@beta-trading.example",
};

// Asserts a parsed record has no blank/empty extraction for any key.
function assertNoBlanks(docType: string, parsed: Record<string, string>) {
  for (const [key, val] of Object.entries(parsed)) {
    assert.notEqual(val, BLANK, `${docType} field "${key}" extracted as blank placeholder — template wording and its parse helper are out of sync`);
    assert.ok(String(val).trim().length > 0, `${docType} field "${key}" extracted as empty`);
  }
}

// ─── BILL OF LADING ──────────────────────────────────────────────────

const blProduct: ProductDetails = {
  commodity: "Iron Ore Fines 62% Fe",
  quantity: "55,000",
  origin: "Australia",
  loadingPort: "Port Hedland",
  dischargePort: "Qingdao",
  packing: "In Bulk",
  vesselName: "MV Ocean Pioneer",
  notifyParty: "Beta Trading GmbH, Hamburg",
  charterPartyDate: "15 July 2026",
  freightAdvance: "USD 250,000.00",
  loadingTimeDays: "5",
  loadingTimeHours: "6",
  placeOfIssue: "Singapore",
  dateOfIssue: "01 August 2026",
  companyOnBehalf: "Oceanic Chartering Pte Ltd",
  masterOfVessel: "Capt. J. Silva",
  agentsName: "Harbour Agencies LLC",
};

test("BL content generated with full data survives the BL field extraction", () => {
  const content = generateDocumentContent("BL", undefined, buyer, seller, blProduct);
  const bl = parseBlContent(content);

  assert.equal(bl.shipper, "Alpha Commodities DMCC");
  assert.equal(bl.consignee, "Beta Trading GmbH");
  assert.equal(bl.notifyAddress, "Beta Trading GmbH, Hamburg");
  assert.equal(bl.vessel, "MV Ocean Pioneer");
  assert.equal(bl.portOfLoading, "Port Hedland");
  assert.equal(bl.portOfDischarge, "Qingdao");
  assert.equal(bl.commodityName, "Iron Ore Fines 62% Fe");
  assert.equal(bl.quantityMT, "55,000");
  assert.equal(bl.countryOfOrigin, "Australia");
  assert.equal(bl.packing, "In Bulk");
  assert.equal(bl.charterPartyDate, "15 July 2026");
  assert.equal(bl.freightAdvance, "USD 250,000.00");
  assert.equal(bl.loadingTimeDays, "5");
  assert.equal(bl.loadingTimeHours, "6");
  assert.equal(bl.placeOfIssue, "Singapore");
  assert.equal(bl.dateOfIssue, "01 August 2026");
  assert.equal(bl.companyOnBehalf, "Oceanic Chartering Pte Ltd");
  assert.equal(bl.masterOfVessel, "Capt. J. Silva");
  assert.equal(bl.agentsName, "Harbour Agencies LLC");
});

test("no populated BL value degrades to blank", () => {
  const content = generateDocumentContent("BL", undefined, buyer, seller, blProduct);
  assertNoBlanks("BL", parseBlContent(content) as unknown as Record<string, string>);
});

test("simulated BL template rewording is caught", () => {
  const content = generateDocumentContent("BL", undefined, buyer, seller, blProduct)
    .replace("NAME OF COMMODITY:", "COMMODITY NAME:");
  const bl = parseBlContent(content);
  assert.equal(bl.commodityName, "");
});

// ─── CERTIFICATE OF ORIGIN ───────────────────────────────────────────

const cooProduct: ProductDetails = {
  commodity: "Iron Ore Fines 62% Fe",
  quantity: "55,000",
  origin: "Australia",
  loadingPort: "Port Hedland",
  dischargePort: "Qingdao",
  packing: "In Bulk",
  vesselName: "MV Ocean Pioneer",
  loiIssueNumber: "COO-2026-042",
};

test("COO content generated with full data survives the COO field extraction", () => {
  const content = generateDocumentContent("COO", undefined, buyer, seller, cooProduct);
  const coo = parseCooContent(content);

  assert.equal(coo.certNo, "COO-2026-042");
  assert.equal(coo.shipper, "Alpha Commodities DMCC");
  assert.equal(coo.consignee, "Beta Trading GmbH");
  assert.equal(coo.portOfLoading, "Port Hedland");
  assert.equal(coo.vesselName, "MV Ocean Pioneer");
  assert.equal(coo.portOfDischarge, "Qingdao");
  assert.equal(coo.finalDestination, "Qingdao");
  assert.equal(coo.commodityName, "Iron Ore Fines 62% Fe");
  assert.equal(coo.quantityMT, "55,000");
  assert.equal(coo.packing, "In Bulk");
  assert.equal(coo.countryOfOrigin, "Australia");
});

test("no populated COO value degrades to blank", () => {
  const content = generateDocumentContent("COO", undefined, buyer, seller, cooProduct);
  assertNoBlanks("COO", parseCooContent(content) as unknown as Record<string, string>);
});

test("simulated COO template rewording is caught", () => {
  const content = generateDocumentContent("COO", undefined, buyer, seller, cooProduct)
    .replace("CERT NO.:", "CERTIFICATE NO.:");
  const coo = parseCooContent(content);
  assert.equal(coo.certNo, "");
});

// ─── CERTIFICATE OF QUALITY (COA) ────────────────────────────────────

const coaProduct: ProductDetails = {
  commodity: "Iron Ore Fines 62% Fe",
  quantity: "55,000",
  origin: "Australia",
  loadingPort: "Port Hedland",
  dischargePort: "Qingdao",
  packing: "In Bulk",
  vesselName: "MV Ocean Pioneer",
  charterPartyDate: "15 July 2026",
  loiIssueNumber: "COA-2026-042",
  laycan: "01 July 2026 to 05 July 2026",
  validity: "02 July 2026 to 04 July 2026",
  qualitySpecs: "FE (T)            :    62.35   PCT",
  specialNote: "8.20",
  annexSpecs: "ABOVE 10MM   :    2.10   PCT",
  analysisAgency: "SGS Inspection Services",
};

test("COA content generated with full data survives the COA field extraction", () => {
  const content = generateDocumentContent("COA", undefined, buyer, seller, coaProduct);
  const coa = parseCoaContent(content);

  assert.equal(coa.certNo, "COA-2026-042");
  assert.equal(coa.commodity, "Iron Ore Fines 62% Fe");
  assert.equal(coa.quantity, "55,000");
  assert.equal(coa.origin, "Australia");
  assert.equal(coa.packing, "In Bulk");
  assert.equal(coa.vessel, "MV Ocean Pioneer");
  assert.equal(coa.portOfLoading, "Port Hedland");
  assert.equal(coa.portOfDischarge, "Qingdao");
  assert.equal(coa.blDate, "15 July 2026");
  assert.equal(coa.inspFrom, "01 July 2026");
  assert.equal(coa.inspTo, "05 July 2026");
  assert.equal(coa.loadStart, "02 July 2026");
  assert.equal(coa.loadEnd, "04 July 2026");
  assert.equal(coa.chemSpecs, "FE (T)            :    62.35   PCT");
  assert.equal(coa.moisture, "8.20");
  assert.equal(coa.physSizes, "ABOVE 10MM   :    2.10   PCT");
  assert.equal(coa.agency, "SGS Inspection Services");
  // Cert date is generated as "today" — just assert it is not blank.
  assert.ok(coa.date.trim().length > 0);
});

test("no populated COA value degrades to blank", () => {
  const content = generateDocumentContent("COA", undefined, buyer, seller, coaProduct);
  assertNoBlanks("COA", parseCoaContent(content) as unknown as Record<string, string>);
});

test("simulated COA template rewording is caught", () => {
  const content = generateDocumentContent("COA", undefined, buyer, seller, coaProduct)
    .replace("NAME OF THE CARRYING VESSEL", "CARRYING VESSEL NAME");
  const coa = parseCoaContent(content);
  assert.equal(coa.vessel, BLANK);
});

// ─── CERTIFICATE OF WEIGHT (COW) ─────────────────────────────────────

const cowProduct: ProductDetails = {
  commodity: "Iron Ore Fines 62% Fe",
  quantity: "55,000",
  origin: "Australia",
  loadingPort: "Port Hedland",
  dischargePort: "Qingdao",
  packing: "In Bulk",
  vesselName: "MV Ocean Pioneer",
  charterPartyDate: "15 July 2026",
  loiIssueNumber: "COW-2026-042",
  laycan: "02 July 2026    TO   04 July 2026",
  specialNote: "8.20",
  annexSpecs: "50,490",
  analysisAgency: "SGS Inspection Services",
};

test("COW content generated with full data survives the COW field extraction", () => {
  const content = generateDocumentContent("COW", undefined, buyer, seller, cowProduct);
  const cow = parseCowContent(content);

  assert.equal(cow.certNo, "COW-2026-042");
  assert.equal(cow.commodity, "Iron Ore Fines 62% Fe");
  assert.equal(cow.quantity, "55,000");
  assert.equal(cow.origin, "Australia");
  assert.equal(cow.packing, "In Bulk");
  assert.equal(cow.vessel, "MV Ocean Pioneer");
  assert.equal(cow.portOfLoading, "Port Hedland");
  assert.equal(cow.portOfDischarge, "Qingdao");
  assert.equal(cow.blDate, "15 July 2026");
  assert.equal(cow.loadPeriod, "02 July 2026    TO   04 July 2026");
  assert.equal(cow.moisture, "8.20");
  assert.equal(cow.dryQty, "50,490");
  assert.equal(cow.agency, "SGS Inspection Services");
  // Cert date is generated as "today" — just assert it is not blank.
  assert.ok(cow.date.trim().length > 0);
});

test("no populated COW value degrades to blank", () => {
  const content = generateDocumentContent("COW", undefined, buyer, seller, cowProduct);
  assertNoBlanks("COW", parseCowContent(content) as unknown as Record<string, string>);
});

test("simulated COW template rewording is caught", () => {
  const content = generateDocumentContent("COW", undefined, buyer, seller, cowProduct)
    .replace("Dry Quantity", "Dry Weight");
  const cow = parseCowContent(content);
  assert.equal(cow.dryQty, BLANK);
});
