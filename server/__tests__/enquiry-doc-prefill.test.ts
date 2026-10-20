// Approved-enquiry → LOI/FCO prefill tests.
//
// Two paths seed the document generator from an approved enquiry:
//   1. Launch links (team portal / trade enquiries) encode `enq*` URL params
//      — buildEnquiryDocParams().
//   2. The linked-enquiry effect treats the DB enquiry as authoritative and
//      overwrites URL-seeded values — computeEnquiryPrefill() merged via
//      mergeEnquiryPrefill().
// A regression in either path silently produces documents missing enquiry
// details (Special Notes, discharge port, performance bond, producer). These
// tests are pure — no DB, no HTTP. Run with:
//   npx tsx --test server/__tests__/enquiry-doc-prefill.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEnquiryDocParams,
  computeEnquiryPrefill,
  mergeEnquiryPrefill,
  composeEnquirySpecialNote,
  formatEnquiryQuantity,
  type EnquiryPrefillSource,
} from "@shared/enquiry-doc-prefill";
import { generateDocumentContent, type ProductDetails } from "../documentTemplates";

const approvedEnquiry: EnquiryPrefillSource = {
  enquiryRef: "ENQ-2026-042",
  product: "Gasoil 10ppm",
  quantity: "50000",
  unit: "MT",
  packing: "50kg PP bags on pallets",
  origin: "UAE",
  loadingPort: "Fujairah",
  dischargePort: "Rotterdam",
  producer: "ADNOC Refining",
  incoterms: "CIF",
  specifications: "Sulphur: max 10ppm (Rejection: >10ppm) [Method: ASTM D5453]",
  deliveryPeriod: "August 2026",
  validity: "10 days",
  price: "620",
  currency: "USD",
  paymentTerms: "MT103 against dip test",
  additionalInfo: "Vessel must be less than 15 years old",
  performanceBond: "2% of contract value",
  createdBy: "Jane Trader",
  email: "buyer@example.com",
};

// ---------------------------------------------------------------------------
// Path 1: launch-link URL params
// ---------------------------------------------------------------------------

test("launch link carries Special Notes, performance bond, logistics and producer", () => {
  const params = buildEnquiryDocParams(approvedEnquiry, "LOI");
  assert.equal(params.get("enquiryRef"), "ENQ-2026-042");
  assert.equal(params.get("docType"), "LOI");
  assert.equal(params.get("enqProduct"), "Gasoil 10ppm");
  assert.equal(params.get("enqQuantity"), "50000 MT");
  assert.equal(params.get("enqPacking"), "50kg PP bags on pallets");
  assert.equal(params.get("enqLoadingPort"), "Fujairah");
  assert.equal(params.get("enqDischargePort"), "Rotterdam");
  assert.equal(params.get("enqProducer"), "ADNOC Refining");
  assert.equal(params.get("enqAdditionalInfo"), "Vessel must be less than 15 years old");
  assert.equal(params.get("enqPerformanceBond"), "2% of contract value");
  assert.equal(params.get("enqIncoterm"), "CIF");
  assert.equal(params.get("enqValidity"), "10 days");
});

test("launch link seeds origin from loading port only when the fallback is requested", () => {
  const noOrigin = { ...approvedEnquiry, origin: "" };
  assert.equal(buildEnquiryDocParams(noOrigin, "FCO").get("enqOrigin"), "");
  assert.equal(
    buildEnquiryDocParams(noOrigin, "FCO", { originFallsBackToLoadingPort: true }).get("enqOrigin"),
    "Fujairah",
  );
  // Fallback never clobbers a real origin.
  assert.equal(
    buildEnquiryDocParams(approvedEnquiry, "FCO", { originFallsBackToLoadingPort: true }).get("enqOrigin"),
    "UAE",
  );
});

test("blank enquiry fields become empty params, not literal 'null'/'undefined'", () => {
  const sparse: EnquiryPrefillSource = { enquiryRef: "ENQ-1", product: "NPK" };
  const params = buildEnquiryDocParams(sparse, "FCO");
  for (const key of ["enqDischargePort", "enqAdditionalInfo", "enqPerformanceBond", "enqProducer"]) {
    assert.equal(params.get(key), "", `${key} should be empty`);
  }
});

test("quantity formatting defaults unit to MT and stays blank without quantity", () => {
  assert.equal(formatEnquiryQuantity("5000", null), "5000 MT");
  assert.equal(formatEnquiryQuantity("5000", "BBL"), "5000 BBL");
  assert.equal(formatEnquiryQuantity(null, "MT"), "");
});

// ---------------------------------------------------------------------------
// Path 2: DB enquiry is authoritative over stale URL-seeded values
// ---------------------------------------------------------------------------

test("DB enquiry values override stale URL-seeded values", () => {
  // Simulate a launch link generated before the enquiry was amended.
  const staleUrlSeed = {
    commodity: "Gasoil 50ppm",
    dischargePort: "Antwerp",
    loadingPort: "Jebel Ali",
    specialNote: "OLD NOTE",
    price: "600",
  };
  const merged = mergeEnquiryPrefill(staleUrlSeed, computeEnquiryPrefill(approvedEnquiry));
  assert.equal(merged.commodity, "Gasoil 10ppm");
  assert.equal(merged.dischargePort, "Rotterdam");
  assert.equal(merged.loadingPort, "Fujairah");
  assert.equal(merged.price, "620");
  assert.equal(
    merged.specialNote,
    "Vessel must be less than 15 years old\nPerformance Bond: 2% of contract value",
  );
});

test("blank DB fields keep URL-seeded values instead of blanking them", () => {
  const sparseDb = computeEnquiryPrefill({ enquiryRef: "ENQ-2", product: "Iron Ore" });
  const merged = mergeEnquiryPrefill({ dischargePort: "Qingdao", specialNote: "Seed note" }, sparseDb);
  assert.equal(merged.commodity, "Iron Ore");
  assert.equal(merged.dischargePort, "Qingdao");
  assert.equal(merged.specialNote, "Seed note");
});

test("computeEnquiryPrefill seeds seller from producer when no seller name", () => {
  const p = computeEnquiryPrefill(approvedEnquiry);
  assert.equal(p.sellerName, "ADNOC Refining");
  const withSeller = computeEnquiryPrefill({ ...approvedEnquiry, sellerName: "Named Seller Ltd" });
  assert.equal(withSeller.sellerName, "Named Seller Ltd");
});

test("special note composes additionalInfo and performance bond", () => {
  assert.equal(composeEnquirySpecialNote("Note", "2%"), "Note\nPerformance Bond: 2%");
  assert.equal(composeEnquirySpecialNote("Note", null), "Note");
  assert.equal(composeEnquirySpecialNote(null, "2%"), "Performance Bond: 2%");
  assert.equal(composeEnquirySpecialNote(null, null), "");
});

// ---------------------------------------------------------------------------
// Generated LOI/FCO bodies carry the enquiry details
// ---------------------------------------------------------------------------

function productFromEnquiry(e: EnquiryPrefillSource): ProductDetails {
  const p = computeEnquiryPrefill(e);
  return {
    commodity: p.commodity,
    origin: p.origin,
    quantity: p.quantity,
    packing: p.packing,
    qualitySpecs: p.qualitySpecs,
    loadingPort: p.loadingPort,
    dischargePort: p.dischargePort,
    price: p.price,
    currency: p.currency,
    incoterm: p.incoterm,
    laycan: p.laycan,
    paymentTerms: p.paymentTerms,
    validity: p.validity,
    specialNote: p.specialNote,
  };
}

test("LOI body includes Special Notes block with additionalInfo and performance bond", () => {
  const content = generateDocumentContent("LOI", undefined, { name: "Buyer Co" }, { name: "ADNOC Refining" }, productFromEnquiry(approvedEnquiry));
  assert.ok(content.includes("SPECIAL NOTES"), "LOI missing SPECIAL NOTES block");
  assert.ok(content.includes("Vessel must be less than 15 years old"));
  assert.ok(content.includes("Performance Bond: 2% of contract value"));
  assert.ok(content.includes("Gasoil 10ppm"));
  assert.ok(content.includes("50000 MT"));
  assert.ok(content.includes("Packing                     │ 50kg PP bags on pallets"));
  assert.ok(content.includes("ADNOC Refining"), "producer/seller missing from LOI");
});

test("LOI omits the Special Notes block when the enquiry has none", () => {
  const bare = productFromEnquiry({ enquiryRef: "ENQ-3", product: "Iron Ore" });
  const content = generateDocumentContent("LOI", undefined, { name: "Buyer Co" }, { name: "Seller Co" }, bare);
  assert.ok(!content.includes("SPECIAL NOTES"));
});

test("FCO body includes Special Notes block and logistics ports", () => {
  const content = generateDocumentContent("FCO", undefined, { name: "Buyer Co" }, { name: "ADNOC Refining" }, productFromEnquiry(approvedEnquiry));
  assert.ok(content.includes("SPECIAL NOTES"), "FCO missing SPECIAL NOTES block");
  assert.ok(content.includes("Vessel must be less than 15 years old"));
  assert.ok(content.includes("Performance Bond: 2% of contract value"));
  assert.ok(content.includes("Loading Port: Fujairah"));
  assert.ok(content.includes("Discharge Port: Rotterdam"));
  assert.ok(content.includes("ADNOC Refining"), "producer/seller missing from FCO");
});

test("FCO omits the Special Notes block when the enquiry has none", () => {
  const bare = productFromEnquiry({ enquiryRef: "ENQ-4", product: "Iron Ore" });
  const content = generateDocumentContent("FCO", undefined, { name: "Buyer Co" }, { name: "Seller Co" }, bare);
  assert.ok(!content.includes("SPECIAL NOTES"));
});
