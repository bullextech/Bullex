// SPA → DLC Draft (SWIFT MT700) derivation.
//
// A signed SPA can spawn the bank LC draft with the SPA's commercial terms
// pre-filled: applicant/beneficiary (buyer/seller), credit amount & currency,
// ports (44E/44F), goods description and delivery term. Signature-driven like
// SPA→TFR — no recipient-acceptance round-trip required.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateDocTransition, buildDlcDataFromSpa, parseSpaDocFields, DOC_TRANSITIONS } from "../routes";
import { generateDocumentContent } from "../documentTemplates";

test("SPA transitions include DLC_MT700", () => {
  assert.ok(DOC_TRANSITIONS.SPA.includes("DLC_MT700"));
});

test("SPA -> DLC_MT700 is allowed without recipient acceptance once signed (signature-driven)", () => {
  const r = evaluateDocTransition({ parentDocType: "SPA", nextDocType: "DLC_MT700", recipientResponse: null, hasAnySignature: true });
  assert.equal(r.ok, true);
});

test("SPA -> DLC_MT700 is allowed on a prepared (unsigned) SPA so the draft can be amended pre-send", () => {
  const r = evaluateDocTransition({ parentDocType: "SPA", nextDocType: "DLC_MT700", recipientResponse: null, hasAnySignature: false });
  assert.equal(r.ok, true);
});

test("SPA -> TFR is no longer a document-chain transition (TFR comes from deal matching only)", () => {
  const r = evaluateDocTransition({ parentDocType: "SPA", nextDocType: "TFR", recipientResponse: "accepted", hasAnySignature: true });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("DLC_MT700 cannot be derived from a non-SPA parent", () => {
  const r = evaluateDocTransition({ parentDocType: "DEAL_RECAP", nextDocType: "DLC_MT700", recipientResponse: "accepted" });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

const spaFields = {
  buyerName: "Almexo Trading FZE",
  buyerAddress: "Jebel Ali Free Zone, Dubai, UAE",
  sellerName: "Bullfrog Group Ltd",
  sellerAddress: "1 Fenchurch St, London, UK",
  commodity: "Iron Ore Fines 62%",
  origin: "Brazil",
  quantity: "50,000 MT",
  price: "105.50",
  currency: "USD",
  incoterm: "CFR",
  loadingPort: "Port of Tubarao",
  dischargePort: "Qingdao Port",
  qualitySpecs: "Fe: 62% (Rejection: below 60%) [Method: ISO 2597]",
};

test("buildDlcDataFromSpa maps SPA terms into MT700 slots", () => {
  const d = buildDlcDataFromSpa(spaFields);
  assert.equal(d.applicantName, "Almexo Trading FZE");
  assert.equal(d.applicantAddress, "Jebel Ali Free Zone, Dubai, UAE");
  assert.equal(d.beneficiaryName, "Bullfrog Group Ltd");
  assert.equal(d.beneficiaryAddress, "1 Fenchurch St, London, UK");
  assert.equal(d.currency, "USD");
  // 50,000 × 105.50 = 5,275,000
  assert.equal(d.amount, "5,275,000");
  assert.equal(d.pricePerUnit, "105.50");
  assert.equal(d.portOfLoading, "Port of Tubarao");
  assert.equal(d.portOfDischarge, "Qingdao Port");
  assert.equal(d.deliveryTerm, "CFR Qingdao Port");
  assert.equal(d.commodity, "Iron Ore Fines 62%");
  assert.equal(d.origin, "Brazil");
  assert.equal(d.quantity, "50,000 MT");
  assert.match(d.productSpecification, /^PRODUCT SPECIFICATION:\n/);
  assert.match(d.productSpecification, /Fe: 62%/);
});

test("buildDlcDataFromSpa leaves blanks out so template placeholders remain", () => {
  const d = buildDlcDataFromSpa({ buyerName: "Almexo", quantity: "50,000 MT" });
  assert.equal(d.applicantName, "Almexo");
  assert.ok(!("beneficiaryName" in d));
  assert.ok(!("amount" in d)); // no price → no computed credit amount
  assert.ok(!("deliveryTerm" in d));
  assert.ok(!("productSpecification" in d));
});

test("derived dlcData renders in the MT700 template (parse-and-render lockstep)", () => {
  const dlcData = buildDlcDataFromSpa(spaFields);
  const content = generateDocumentContent("DLC_MT700", undefined, undefined, undefined, { dlcData });
  assert.match(content, /:50:Almexo Trading FZE\nJebel Ali Free Zone, Dubai, UAE/);
  assert.match(content, /:59:Bullfrog Group Ltd\n1 Fenchurch St, London, UK/);
  assert.match(content, /:32B:USD5,275,000/);
  assert.match(content, /:44E:Port of Tubarao/);
  assert.match(content, /:44F:Qingdao Port/);
  assert.match(content, /50,000 MT OF IRON ORE FINES 62%/);
  assert.match(content, /OF BRAZIL ORIGIN\./);
  assert.match(content, /PRICE: USD 105\.50 PER METRIC TON/);
  assert.match(content, /DELIVERY TERM: CFR Qingdao Port/);
  assert.match(content, /TOTAL CREDIT AMOUNT: USD 5,275,000/);
});

// --- End-to-end: SPA template → parseSpaDocFields → DLC (lockstep) ----------

const spaBuyer = { name: "Almexo Trading FZE", address: "Jebel Ali Free Zone, Dubai, UAE", contact: "buyer@almexo.example" };
const spaSeller = { name: "Bullfrog Group Ltd", address: "1 Fenchurch St, London, UK", contact: "seller@bullfrog.example" };
const spaProduct = {
  commodity: "Iron Ore Fines 62%",
  origin: "Brazil",
  quantity: "50,000 MT",
  price: "105.50",
  currency: "USD",
  incoterm: "CFR",
  loadingPort: "Port of Tubarao",
  dischargePort: "Qingdao Port",
  laycan: "15-30 September 2026",
  paymentTerms: "Irrevocable DLC at sight",
  packing: "Bulk",
  qualitySpecs: "Fe: 62% (Rejection: below 60%) [Method: ISO 2597]",
};

test("parseSpaDocFields recovers parties and commercial terms from a generated SPA", () => {
  const spaContent = generateDocumentContent("SPA", undefined, spaBuyer, spaSeller, spaProduct);
  const f = parseSpaDocFields(spaContent);
  assert.equal(f.buyerName, "Almexo Trading FZE");
  assert.equal(f.buyerAddress, "Jebel Ali Free Zone, Dubai, UAE");
  assert.equal(f.sellerName, "Bullfrog Group Ltd");
  assert.equal(f.sellerAddress, "1 Fenchurch St, London, UK");
  assert.equal(f.commodity, "Iron Ore Fines 62%");
  assert.equal(f.origin, "Brazil");
  assert.equal(f.quantity, "50,000 MT");
  assert.equal(f.price, "105.50");
  assert.equal(f.currency, "USD");
  assert.equal(f.incoterm, "CFR");
  assert.equal(f.loadingPort, "Port of Tubarao");
  assert.equal(f.dischargePort, "Qingdao Port");
  assert.equal(f.laycan, "15-30 September 2026");
  assert.equal(f.paymentTerms, "Irrevocable DLC at sight");
  assert.equal(f.packing, "Bulk");
  assert.match(f.qualitySpecs, /Fe: 62%.*Rejection: below 60%.*Method: ISO 2597/);
});

test("parseSpaDocFields leaves placeholder-only SPA fields empty", () => {
  const spaContent = generateDocumentContent("SPA", undefined, undefined, undefined, {});
  const f = parseSpaDocFields(spaContent);
  assert.equal(f.buyerName, "");
  assert.equal(f.sellerName, "");
  assert.equal(f.quantity, "");
  assert.equal(f.price, "");
  assert.equal(f.loadingPort, "");
});

test("generated SPA round-trips into a pre-filled DLC MT700 draft", () => {
  const spaContent = generateDocumentContent("SPA", undefined, spaBuyer, spaSeller, spaProduct);
  const f = parseSpaDocFields(spaContent);
  const dlcData = buildDlcDataFromSpa({
    buyerName: f.buyerName,
    buyerAddress: f.buyerAddress,
    sellerName: f.sellerName,
    sellerAddress: f.sellerAddress,
    commodity: f.commodity,
    origin: f.origin,
    quantity: f.quantity,
    price: f.price,
    currency: f.currency,
    incoterm: f.incoterm,
    loadingPort: f.loadingPort,
    dischargePort: f.dischargePort,
    qualitySpecs: f.qualitySpecs,
  });
  const dlc = generateDocumentContent("DLC_MT700", undefined, undefined, undefined, { dlcData });
  assert.match(dlc, /:50:Almexo Trading FZE\nJebel Ali Free Zone, Dubai, UAE/);
  assert.match(dlc, /:59:Bullfrog Group Ltd\n1 Fenchurch St, London, UK/);
  assert.match(dlc, /:32B:USD5,275,000/);
  assert.match(dlc, /:44E:Port of Tubarao/);
  assert.match(dlc, /:44F:Qingdao Port/);
  assert.match(dlc, /50,000 MT OF IRON ORE FINES 62%/);
  assert.match(dlc, /DELIVERY TERM: CFR Qingdao Port/);
  assert.match(dlc, /Fe: 62%/);
});
