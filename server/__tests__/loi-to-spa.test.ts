// Pure-function tests for deriving an SPA from a Purchase LOI.
//
// The "Generate SPA from LOI" workflow round-trips a generated LOI's plain-text
// content back into structured fields (parseLoiForSpa) so every LOI detail is
// carried into the SPA. We build a real LOI with the production template, then
// assert the parser recovers the same values (parties, commodity, terms, specs).
// Run with:  npx tsx --test server/__tests__/loi-to-spa.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLoiForSpa } from "../routes";
import { generateDocumentContent } from "../documentTemplates";

const buyer = { name: "Acme Buyers DMCC", address: "Dubai, UAE", contact: "buyer@acme.example" };
const seller = { name: "Globex Sellers Ltd", address: "Singapore", contact: "seller@globex.example" };
const product = {
  commodity: "Copper Cathode",
  origin: "Zambia",
  quantity: "5,000 MT",
  packing: "Bundled cathode sheets on pallets",
  incoterm: "CIF",
  laycan: "15-30 July 2026",
  price: "8,500",
  currency: "USD",
  contractConfirmation: "Subject to Producer's Confirmation of cargo",
  qualitySpecs: "Cu: 99.99% min\nGrade A LME registered\nCathode sheets",
  paymentTerms: "By DLC at sight against shipping documents",
  docsForPayment: "Commercial Invoice, B/L, COO, SGS Report",
  otherTerms: "Performance Bond 2%",
  compliance: "ICC NCND applies",
};

const loi = generateDocumentContent("LOI", undefined, buyer, seller, product);

test("LOI→SPA: party names are recovered from the LOI blocks", () => {
  const p = parseLoiForSpa(loi);
  assert.equal(p.buyerName, "Acme Buyers DMCC");
  assert.equal(p.sellerName, "Globex Sellers Ltd");
});

test("LOI→SPA: numbered commercial-table rows round-trip", () => {
  const p = parseLoiForSpa(loi);
  assert.equal(p.commodity, "Copper Cathode");
  assert.equal(p.origin, "Zambia");
  assert.equal(p.quantity, "5,000 MT");
  assert.equal(p.packing, "Bundled cathode sheets on pallets");
  assert.equal(p.incoterm, "CIF");
  assert.equal(p.laycan, "15-30 July 2026");
  assert.equal(p.contractConfirmation, "Subject to Producer's Confirmation of cargo");
  assert.equal(p.paymentTerms, "By DLC at sight against shipping documents");
  assert.equal(p.docsForPayment, "Commercial Invoice, B/L, COO, SGS Report");
  assert.equal(p.otherTerms, "Performance Bond 2%");
  assert.equal(p.compliance, "ICC NCND applies");
});

test("LOI→SPA: stored legacy 12-row LOIs remain readable", () => {
  const legacyLoi = loi
    .split("\n")
    .filter((line) => !/^\s*04\s*│\s*Packing\s*│/.test(line))
    .map((line) => line.replace(
      /^(\s*)(0[5-9]|1[0-3])(\s*│)/,
      (_match, prefix: string, serial: string, suffix: string) =>
        `${prefix}${String(Number(serial) - 1).padStart(2, "0")}${suffix}`,
    ))
    .join("\n");
  const p = parseLoiForSpa(legacyLoi);
  assert.equal(p.packing, "");
  assert.equal(p.incoterm, "CIF");
  assert.equal(p.laycan, "15-30 July 2026");
  assert.equal(p.price, "8,500");
  assert.equal(p.paymentTerms, "By DLC at sight against shipping documents");
  assert.equal(p.compliance, "ICC NCND applies");
});

test("LOI→SPA: price splits the leading currency token (no USD doubling)", () => {
  const p = parseLoiForSpa(loi);
  assert.equal(p.currency, "USD");
  assert.equal(p.price, "8,500");
  // Guard against the "USD USD 8,500" regression in the SPA template.
  assert.ok(!/^[A-Z]{3}\s/.test(p.price));
});

test("LOI→SPA: multi-line quality specifications are fully carried over", () => {
  const p = parseLoiForSpa(loi);
  assert.ok(p.qualitySpecs.includes("Cu: 99.99% min"));
  assert.ok(p.qualitySpecs.includes("Grade A LME registered"));
  assert.ok(p.qualitySpecs.includes("Cathode sheets"));
});

test("LOI→SPA: blank/underscore placeholders are normalised to empty strings", () => {
  const sparse = generateDocumentContent("LOI", undefined, buyer, seller, { commodity: "NPK" });
  const p = parseLoiForSpa(sparse);
  assert.equal(p.commodity, "NPK");
  assert.equal(p.origin, "");
  assert.equal(p.laycan, "");
  assert.equal(p.docsForPayment, "");
});

test("LOI→SPA: extracted fields flow into a generated SPA body", () => {
  const p = parseLoiForSpa(loi);
  const spa = generateDocumentContent("SPA", undefined,
    { name: p.buyerName, address: "", contact: "" },
    { name: p.sellerName, address: "", contact: "" },
    {
      commodity: p.commodity, origin: p.origin, quantity: p.quantity, packing: p.packing, incoterm: p.incoterm,
      price: p.price, currency: p.currency, laycan: p.laycan, paymentTerms: p.paymentTerms,
      qualitySpecs: p.qualitySpecs,
    },
  );
  assert.ok(spa.includes("Copper Cathode"));
  assert.ok(spa.includes("Acme Buyers DMCC"));
  assert.ok(spa.includes("Globex Sellers Ltd"));
  assert.ok(spa.includes("15-30 July 2026"));
  assert.ok(spa.includes("Packing: Bundled cathode sheets on pallets"));
  assert.ok(spa.includes("USD 8,500"));
  assert.ok(!spa.includes("USD USD"));
});

test("LOI→SPA: optional LOI-only terms render in the SPA when present", () => {
  const p = parseLoiForSpa(loi);
  const spa = generateDocumentContent("SPA", undefined,
    { name: p.buyerName, address: "", contact: "" },
    { name: p.sellerName, address: "", contact: "" },
    {
      commodity: p.commodity, contractConfirmation: p.contractConfirmation,
      docsForPayment: p.docsForPayment, otherTerms: p.otherTerms, compliance: p.compliance,
    },
  );
  assert.ok(spa.includes("Cargo Confirmation: Subject to Producer's Confirmation of cargo"));
  assert.ok(spa.includes("Additional Documents for Payment (as agreed by the Parties): Commercial Invoice, B/L, COO, SGS Report"));
  assert.ok(spa.includes("Other Terms and Conditions: Performance Bond 2%"));
  assert.ok(spa.includes("Compliance: ICC NCND applies"));
});

test("LOI renders a LOGISTICS block with loading/discharge ports when provided", () => {
  const withPorts = generateDocumentContent("LOI", undefined, buyer, seller, {
    ...product, loadingPort: "Jebel Ali, UAE", dischargePort: "Mundra, India",
  });
  assert.ok(withPorts.includes("LOGISTICS"));
  assert.ok(withPorts.includes("Loading Port: Jebel Ali, UAE"));
  assert.ok(withPorts.includes("Discharge Port: Mundra, India"));
  // Without ports the block is omitted entirely (legacy LOIs unchanged).
  assert.ok(!loi.includes("LOGISTICS"));
  assert.ok(!loi.includes("Loading Port:"));
});

test("LOI→SPA: loading/discharge ports round-trip and reach the SPA delivery clause", () => {
  const withPorts = generateDocumentContent("LOI", undefined, buyer, seller, {
    ...product, loadingPort: "Jebel Ali, UAE", dischargePort: "Mundra, India",
  });
  const p = parseLoiForSpa(withPorts);
  assert.equal(p.loadingPort, "Jebel Ali, UAE");
  assert.equal(p.dischargePort, "Mundra, India");
  const spa = generateDocumentContent("SPA", undefined,
    { name: p.buyerName, address: "", contact: "" },
    { name: p.sellerName, address: "", contact: "" },
    { commodity: p.commodity, loadingPort: p.loadingPort, dischargePort: p.dischargePort },
  );
  assert.ok(spa.includes("Port of Loading: Jebel Ali, UAE"));
  assert.ok(spa.includes("Port of Discharge: Mundra, India"));
});

test("LOI without ports parses ports as empty strings", () => {
  const p = parseLoiForSpa(loi);
  assert.equal(p.loadingPort, "");
  assert.equal(p.dischargePort, "");
});

test("SPA without LOI-only terms (e.g. from a Deal Recap) omits the optional clauses", () => {
  const spa = generateDocumentContent("SPA", undefined,
    { name: "B Co", address: "", contact: "" },
    { name: "S Co", address: "", contact: "" },
    { commodity: "NPK", quantity: "1000 MT", price: "300", incoterm: "FOB" },
  );
  assert.ok(!spa.includes("Cargo Confirmation:"));
  assert.ok(!spa.includes("Additional Documents for Payment"));
  assert.ok(!spa.includes("Other Terms and Conditions:"));
  assert.ok(!spa.includes("25.13 Compliance:"));
});
