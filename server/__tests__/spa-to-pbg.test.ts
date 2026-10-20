import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateDocTransition, buildPbgDataFromSpa } from "../routes";
import { generateDocumentContent } from "../documentTemplates";

test("SPA -> PBG_MT760 is allowed on a prepared SPA (no signature or acceptance needed)", () => {
  assert.equal(
    evaluateDocTransition({ parentDocType: "SPA", nextDocType: "PBG_MT760", hasAnySignature: false }).ok,
    true,
  );
  const ok = evaluateDocTransition({
    parentDocType: "SPA",
    nextDocType: "PBG_MT760",
    recipientResponse: null,
    hasAnySignature: true,
  });
  assert.equal(ok.ok, true);
  assert.equal(
    evaluateDocTransition({ parentDocType: "FCO", nextDocType: "PBG_MT760", hasAnySignature: true }).ok,
    false,
    "only SPA may derive a PBG",
  );
});

test("buildPbgDataFromSpa reverses roles: applicant = seller, beneficiary = buyer", () => {
  const d = buildPbgDataFromSpa({
    buyerName: "Acme Buyers LLC",
    buyerAddress: "Dubai, UAE",
    sellerName: "Globex Pte Ltd",
    sellerAddress: "Singapore",
    commodity: "Granular Sulphur",
    origin: "Kazakhstan",
    quantity: "50,000 MT",
    currency: "USD",
    dischargePort: "Mundra, India",
    spaNumber: "ACM/GLO-0708-001",
  });
  assert.equal(d.applicantName, "Globex Pte Ltd");
  assert.equal(d.applicantAddress, "Singapore");
  assert.equal(d.beneficiaryName, "Acme Buyers LLC");
  assert.equal(d.beneficiaryAddress, "Dubai, UAE");
  assert.equal(d.destination, "Mundra, India");
  assert.equal(d.spaNumber, "ACM/GLO-0708-001");
  // Guarantee amount intentionally left for the parties/bank to complete.
  assert.equal(d.guaranteeAmount, undefined);
  assert.equal(d.amountInWords, undefined);
});

test("SPA-derived pbgData renders a valid MT760 draft with placeholders for bank fields", () => {
  const pbgData = buildPbgDataFromSpa({
    buyerName: "Acme Buyers LLC",
    sellerName: "Globex Pte Ltd",
    commodity: "Granular Sulphur",
    origin: "Kazakhstan",
    quantity: "50,000 MT",
    currency: "USD",
    dischargePort: "Mundra, India",
    spaNumber: "ACM/GLO-0708-001",
  });
  const content = generateDocumentContent("PBG_MT760", undefined, undefined, undefined, { pbgData });
  assert.ok(content.trimStart().startsWith("DRAFT - SWIFT MT760"));
  assert.ok(content.includes(":50:Globex Pte Ltd"));
  assert.ok(content.includes(":59:Acme Buyers LLC"));
  assert.ok(content.includes("PURCHASE AGREEMENT NO. ACM/GLO-0708-001"));
  assert.ok(content.includes("[GUARANTEE AMOUNT]"), "amount stays a placeholder");
  assert.ok(content.includes("[ISSUING BANK NAME]"), "bank fields stay placeholders");
});

test("buildPbgDataFromSpa maps KYC bank details: seller bank issues, buyer bank receives", () => {
  const d = buildPbgDataFromSpa({
    buyerName: "Acme Buyers LLC",
    buyerSwift: "ACMBAEAD",
    sellerName: "Globex Pte Ltd",
    sellerBank: "DBS Bank Ltd",
    sellerSwift: "DBSSSGSG",
    spaNumber: "ACM/GLO-0708-001",
  });
  assert.equal(d.issuingBankName, "DBS Bank Ltd");
  assert.equal(d.issuingBankBic, "DBSSSGSG");
  assert.equal(d.beneficiaryBankBic, "ACMBAEAD");
});

test("blank KYC bank data degrades to template placeholders", () => {
  const pbgData = buildPbgDataFromSpa({
    buyerName: "Acme Buyers LLC",
    sellerName: "Globex Pte Ltd",
    buyerSwift: "",
    sellerBank: "   ",
    sellerSwift: undefined,
    spaNumber: "ACM/GLO-0708-001",
  });
  assert.equal(pbgData.issuingBankName, undefined);
  assert.equal(pbgData.issuingBankBic, undefined);
  assert.equal(pbgData.beneficiaryBankBic, undefined);
  const content = generateDocumentContent("PBG_MT760", undefined, undefined, undefined, { pbgData });
  assert.ok(content.includes("[ISSUING BANK NAME]"));
  assert.ok(content.includes("[ISSUINGBANKBIC]"));
  assert.ok(content.includes("[BENEFICIARYBANKBIC]"));
});

test("KYC-enriched pbgData renders bank details into the MT760 draft", () => {
  const pbgData = buildPbgDataFromSpa({
    buyerName: "Acme Buyers LLC",
    buyerSwift: "ACMBAEAD",
    sellerName: "Globex Pte Ltd",
    sellerBank: "DBS Bank Ltd",
    sellerSwift: "DBSSSGSG",
    commodity: "Granular Sulphur",
    currency: "USD",
    spaNumber: "ACM/GLO-0708-001",
  });
  const content = generateDocumentContent("PBG_MT760", undefined, undefined, undefined, { pbgData });
  assert.ok(content.includes("{1:F01DBSSSGSG0000000000}"), "issuing bank BIC in block 1");
  assert.ok(content.includes("{2:I760ACMBAEADN}"), "beneficiary bank BIC in block 2");
  assert.ok(content.includes("WE, DBS Bank Ltd,"), "issuing bank name in guarantee text");
  assert.ok(!content.includes("[ISSUING BANK NAME]"));
});
