import { test, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { LPG_GRADES, LPG_SPECIFICATIONS, fillEmptyLpgFields, lpgDocumentPreset, lpgEnquiryPreset } from "@shared/lpg-format";
import { buildEnquiryDocParams, computeEnquiryPrefill } from "@shared/enquiry-doc-prefill";
import { parseSpecRows, serializeSpecRows } from "../../client/src/lib/spec-rows";
import { generateDocumentContent, parseSpecBlobRows } from "../documentTemplates";
import { parseLoiContent, groupLoiSpecRows, generateDocx, generatePdf } from "../documentFileGenerator";
import { parseGeneratedDocFields, parseLoiForSpa } from "../routes";
import { storage } from "../storage";

const buyer = { name: "Fixture Buyer Ltd", address: "Fixture buyer address", contact: "buyer@example.test" };
const seller = { name: "Fixture Seller Ltd", address: "Fixture seller address", contact: "seller@example.test" };

test("LPG specs retain every reference row and all six source columns through editable serialization", () => {
  assert.deepEqual(LPG_GRADES.map(g => g.rows.length), [19, 19]);
  assert.equal(serializeSpecRows(parseSpecRows(LPG_SPECIFICATIONS)!), LPG_SPECIFICATIONS);
  const rows = parseSpecBlobRows(LPG_SPECIFICATIONS);
  assert.equal(rows.length, 40);
  for (const grade of LPG_GRADES) for (const [property, unit, limit, requirement, astm, iso] of grade.rows) {
    const row = rows.find(r => r[0] === `${grade.name} — ${property}`)!;
    assert.ok(row, `${grade.name} ${property}`);
    assert.equal(row[1], `${requirement}; Unit: ${unit}; Limit: ${limit}`);
    assert.equal(row[3], `ASTM: ${astm}; ISO / other: ${iso}`);
  }
});

test("explicit LPG apply is gap-only and idempotent, with no party or bank defaults", () => {
  const sample = lpgDocumentPreset("LOI");
  const current = { ...sample, commodity: "User commodity", price: "Negotiated formula", origin: "", qualitySpecs: "User specs" };
  const result = fillEmptyLpgFields(current, sample);
  assert.equal(result.commodity, current.commodity);
  assert.equal(result.price, current.price);
  assert.equal(result.qualitySpecs, current.qualitySpecs);
  assert.equal(result.origin, "Brazil");
  assert.deepEqual(fillEmptyLpgFields(result, sample), result);
  assert.doesNotMatch(JSON.stringify(sample), /Crescent|Royal Bank of Canada|Homsy|2026/);
});

for (const kind of ["LOI", "FCO"] as const) {
  test(`${kind} contains both grade specifications, commercial terms and preserves downstream labels`, () => {
    const sample = lpgDocumentPreset(kind);
    const text = generateDocumentContent(kind, undefined, buyer, seller, sample);
    for (const value of [buyer.name, seller.name, sample.price, sample.paymentTerms, sample.otherTerms, sample.docsForPayment, sample.loadingPort, sample.dischargePort]) assert.ok(text.includes(value), value);
    for (const grade of LPG_GRADES) for (const [p, u, l, r, a, i] of grade.rows) {
      assert.ok(text.includes(`${grade.name} — ${p} | ${r}; Unit: ${u}; Limit: ${l} | - | ASTM: ${a}; ISO / other: ${i}`));
    }
    assert.equal((text.match(/Parameter \| Specification \| Rejection \| Test Method/g) || []).length, 2);
    const parsed = kind === "LOI" ? parseLoiForSpa(text) : parseGeneratedDocFields(text);
    assert.equal(parsed.qualitySpecs, LPG_SPECIFICATIONS);
    assert.equal(parsed.price, sample.price);
    assert.equal(parsed.otherTerms, sample.otherTerms);
    assert.equal(parsed.docsForPayment, sample.docsForPayment);
    if (kind === "LOI") {
      assert.match(text, /Non-binding expression of purchase intent/);
      assert.deepEqual(groupLoiSpecRows(parseLoiContent(text).specRows).map(g => g.length), [20, 20]);
    } else {
      assert.match(text, /Offer Validity: 3 banking days from date of issue/);
      assert.doesNotMatch(text, /five \(5\) working days from the date of issuance/);
    }
  });
  test(`enquiry → ${kind} carries LPG price, specs, logistics and execution terms via DB and launch link`, () => {
    const enquiry = { ...lpgEnquiryPreset(), enquiryRef: "FIXTURE-LPG-ENQ", buyerName: buyer.name, sellerName: seller.name };
    const p = computeEnquiryPrefill(enquiry);
    assert.equal(p.qualitySpecs, LPG_SPECIFICATIONS);
    assert.equal(p.price, enquiry.price);
    assert.equal(p.otherTerms, enquiry.otherTerms);
    assert.equal(p.paymentTerms, enquiry.paymentTerms);
    const url = buildEnquiryDocParams(enquiry, kind);
    for (const [key, value] of [["enqSpecs", enquiry.specifications], ["enqPrice", enquiry.price], ["enqPaymentTerms", enquiry.paymentTerms], ["enqDocsForPayment", enquiry.docsForPayment], ["enqOtherTerms", enquiry.otherTerms]]) assert.equal(url.get(key), value);
    const text = generateDocumentContent(kind, undefined, buyer, seller, p);
    assert.ok(text.includes("available ullage"));
    assert.ok(text.includes(enquiry.docsForPayment));
    assert.doesNotMatch(text, /Non-binding request for quotation/);
    assert.match(text, kind === "LOI" ? /Non-binding expression of purchase intent/ : /Full corporate offer for acceptance/);
  });
}

test("LPG PDF and DOCX files retain both grades, limits, methods and commercial sections", async t => {
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
  } catch {
    t.skip("File-content verification requires pdftotext and unzip");
    return;
  }
  // File tests use no real records, settings or object-storage dependencies.
  const settingMock = mock.method(storage, "getAppSetting", async () => undefined);
  const files: string[] = [];
  try {
    for (const kind of ["LOI", "FCO"] as const) {
      const text = generateDocumentContent(kind, undefined, buyer, seller, lpgDocumentPreset(kind));
      const id = `lpg-test-${randomUUID()}`;
      const pdf = await generatePdf(id, kind, text, undefined, undefined, undefined, kind);
      files.push(pdf);
      const docx = await generateDocx(id, kind, text, undefined, undefined, undefined, kind);
      files.push(docx);
      const pdfText = execFileSync("pdftotext", ["-raw", pdf, "-"], { encoding: "utf8" });
      const docxText = execFileSync("unzip", ["-p", docx, "word/document.xml"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })
        .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<");
      for (const rendered of [pdfText, docxText]) {
        const normalized = rendered.replace(/\s+/g, " ");
        for (const phrase of ["n-Butane grade", "Propane grade", "Min >=", "Max <=", "Unit: kPa gauge", "Unit: mL/100mL", "IP 431", "ISO 6326-5", "D7923", "D3588", "49.5 - 50.5", "45.5 - 46.5", "Saudi Aramco", "Q88", "available ullage", "English Law", "separate Certificate of Analysis"]) {
          assert.ok(normalized.includes(phrase), `${kind} file missing ${phrase}`);
        }
        assert.doesNotMatch(normalized, /Crescent|Royal Bank of Canada|Homsy/);
      }
    }
  } finally {
    settingMock.mock.restore();
    for (const file of files) fs.unlinkSync(file);
  }
});