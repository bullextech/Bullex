import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateDocumentContent } from "../documentTemplates";
import { hasNativeIssuerSignature } from "../documentFileGenerator";
import { LPG_STS_REFERENCE, spaVariantPayload } from "../../shared/lpg-sts";
import { parseSpaDocFields, buildDlcDataFromSpa, buildPbgDataFromSpa, buildProformaInvoiceDataFromSpa } from "../routes";

const buyer = { name: "Synthetic Buyer", address: "Buyer fixture address", contact: "buyer@example.test" };
const seller = { name: "Synthetic Seller", address: "Seller fixture address", contact: "seller@example.test", bank: "Synthetic Bank", swift: "TESTSWIFT" };
const product = {
  spaVariant: "lpg-sts" as const, commodity: "LPG", origin: "Fixture origin",
  quantity: "17,184 MT +/- 5%", dischargePort: "Kutubdia Outer Anchorage, Bangladesh",
  loadingPort: "Fixture loading port", price: "Saudi CP + 72", incoterm: "CIF", currency: "USD",
  laycan: "Agreed fixture window", paymentTerms: "Confirmed LC at sight",
  lpgSts: { reference: "SYNTHETIC-STS", mainPremium: "72", provisionalPremium: "52" },
};
const render = () => generateDocumentContent("SPA", undefined, buyer, seller, product);

test("accepted OOXML has all 30 clauses, both annexures and intact six-column specification rows", () => {
  assert.equal(LPG_STS_REFERENCE.length, 32);
  for (let i = 1; i <= 30; i++) assert.ok(LPG_STS_REFERENCE[i - 1].startsWith(`${i}. `));
  assert.match(LPG_STS_REFERENCE[30], /ANNEXURE I\n/);
  assert.match(LPG_STS_REFERENCE[31], /ANNEXURE II/);
  const rows = LPG_STS_REFERENCE[30].split("\n").filter(line => line.includes(" | "));
  assert.equal(rows.length, 40); // two header rows and 19 properties per grade
  assert.ok(rows.every(row => row.split(" | ").length === 6));
  for (const term of ["D7923", "IP 431", "ISO 6326-5", "950 – 1,380", "−37", "49.5 – 50.5"]) assert.ok(LPG_STS_REFERENCE[30].includes(term));
  assert.match(LPG_STS_REFERENCE[31], /Maximum Wind Speed While Alongside \| \.\.\./);
});

test("extractor accepts insertions and omits deleted / moved-away text", () => {
  const script = `import runpy
m = runpy.run_path(".agents/scripts/extract-lpg-sts.py")
w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
r = m["accepted_xml"](f'<w:document xmlns:w="{w}"><w:p><w:r><w:t>keep</w:t></w:r><w:ins><w:r><w:t>insert</w:t></w:r></w:ins><w:del><w:r><w:t>deleted</w:t></w:r></w:del><w:moveFrom><w:r><w:t>moved</w:t></w:r></w:moveFrom></w:p></w:document>')
assert m["text"](r) == "keepinsert"
assert m["extract"]() == ${JSON.stringify(LPG_STS_REFERENCE)}
`;
  execFileSync(".pythonlibs/bin/python3", ["-c", script]);
});

test("default resource contains no reference identities, banking details, reference numbers or dates", () => {
  assert.doesNotMatch(LPG_STS_REFERENCE.join("\n"), /Crescent|Bullfrog|Homsy|Royal Bank|ROYCCAT2|07191|CPL-|2026|September|August/);
  const text = generateDocumentContent("SPA", undefined, undefined, undefined, { spaVariant: "lpg-sts" });
  assert.match(text, /SAMPLE/);
  assert.match(text, /Indian import clearance/);
  assert.match(text, /FLAG TO LEGAL ADVISOR/);
  assert.match(text, /PLUS USD 70.00/);
  assert.match(text, /plus USD 50.00/);
  assert.doesNotMatch(text, /\{\{/);
});

test("standard SPA unchanged when variant is absent or explicitly standard", () => {
  const standard = generateDocumentContent("SPA", undefined, buyer, seller, {});
  assert.equal(standard, generateDocumentContent("SPA", undefined, buyer, seller, { spaVariant: "standard", lpgSts: product.lpgSts }));
  assert.doesNotMatch(standard, /LPG SPA|STS Basis|SAMPLE/);
  assert.match(standard, /Article 1\. Definitions/);
});

test("payload scopes LPG variant to SPA only; edits are resolved without carrying sample identities", () => {
  assert.deepEqual(spaVariantPayload("FCO", "lpg-sts", {}), {});
  assert.deepEqual(spaVariantPayload("SPA", "standard", {}), {});
  assert.deepEqual(spaVariantPayload("SPA", "lpg-sts", product.lpgSts), { spaVariant: "lpg-sts", lpgSts: product.lpgSts });
  const text = render();
  assert.match(text, /PLUS USD 72/);
  assert.match(text, /plus USD 52/);
  assert.match(text, /Bank Name: Synthetic Bank/);
  assert.match(text, /Account Number: _______________/);
  const sections = [...LPG_STS_REFERENCE];
  sections[31] = sections[31].replace("Terminal Name | ...", "Terminal Name | Fixture terminal");
  assert.match(generateDocumentContent("SPA", undefined, buyer, seller, { ...product, lpgSts: { sections } }), /Terminal Name \| Fixture terminal/);
  assert.throws(() => generateDocumentContent("SPA", undefined, buyer, seller, { ...product, lpgSts: { sections: [""] } }), /30 clauses/);
});

test("PI/DLC/PBG parser labels retain current parties and commercial fields", () => {
  const parsed = parseSpaDocFields(render());
  assert.equal(parsed.buyerName, buyer.name);
  assert.equal(parsed.sellerName, seller.name);
  assert.equal(parsed.buyerAddress, buyer.address);
  for (const key of ["commodity", "origin", "quantity", "loadingPort", "dischargePort", "price", "incoterm", "currency", "laycan", "paymentTerms"] as const) assert.equal(parsed[key], product[key], key);
  assert.ok(parsed.qualitySpecs.includes("Annexure I"));
  // Downstream numeric amounts must not be inferred from a formula price.
  const dlc = buildDlcDataFromSpa(parsed);
  assert.equal(dlc.applicantName, buyer.name);
  assert.equal(dlc.beneficiaryName, seller.name);
  assert.equal(dlc.pricePerUnit, product.price);
  assert.equal(dlc.amount, undefined);
  const pbg = buildPbgDataFromSpa(parsed);
  assert.equal(pbg.applicantName, seller.name);
  assert.equal(pbg.beneficiaryName, buyer.name);
  assert.equal(pbg.guaranteeAmount, undefined);
  const pi = buildProformaInvoiceDataFromSpa({ ...parsed, spaNumber: product.lpgSts.reference });
  assert.equal(pi.spaNumber, product.lpgSts.reference);
  assert.equal(pi.totalAmount, undefined);
});

test("native buyer-slot signing remains inline; seller and witnesses stay manual", () => {
  assert.ok(hasNativeIssuerSignature(render(), "SPA"));
  assert.equal(render().split("\n").filter(l => /^Signature:/.test(l)).length, 1);
  assert.match(render(), /Seller signature \(manual\)/);
});