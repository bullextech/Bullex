import { test, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { storage } from "../storage";
import { generateDocumentContent } from "../documentTemplates";
import { lpgDocumentPreset } from "@shared/lpg-format";
import { hasNativeIssuerSignature, regenerateWithSignatures } from "../documentFileGenerator";

const signature = "data:image/png;base64," + (process.env.SIGNATURE_FIXTURE
  ? fs.readFileSync(process.env.SIGNATURE_FIXTURE).toString("base64")
  : "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=");
const buyer = { name: "Synthetic Buyer Ltd" };
const seller = { name: "Synthetic Seller Ltd" };
const date = new Date("2026-07-01T12:30:00Z");

test("native slot detection is conservative for bilateral and unknown layouts", () => {
  assert.equal(hasNativeIssuerSignature("Signature: ______", "FCO"), true);
  assert.equal(hasNativeIssuerSignature("Terms only", "FCO"), false);
  assert.equal(hasNativeIssuerSignature("Signature: ____\nSignature: ____", "SPA"), false);
  assert.equal(hasNativeIssuerSignature("Signature: ____\nSignature: Already signed", "SPA"), false);
  assert.equal(hasNativeIssuerSignature("Signature: ____", "ADDENDUM"), false);
  assert.equal(hasNativeIssuerSignature("Signature: ____", "NCNDA"), false);
});

test("signed and unsigned issuer exports use native slots; bilateral and fallback exports remain intact", async () => {
  const settings = mock.method(storage, "getAppSetting", async () => undefined);
  const files: string[] = [];
  try {
    for (const kind of ["LOI", "FCO", "ICPO", "NCNDA", "ADDENDUM", "SCO"] as const) {
      const content = kind === "SCO" ? "OFFER\nTerms without a signature placeholder."
        : generateDocumentContent(kind, undefined, buyer, seller,
          kind === "LOI" || kind === "FCO" ? lpgDocumentPreset(kind) : undefined);
      for (const signed of [false, true]) {
        const bilateral = kind === "NCNDA" || kind === "ADDENDUM";
        const result = await regenerateWithSignatures(
          `native-signature-${randomUUID()}`, kind, content,
          signed ? signature : undefined, signed && bilateral ? signature : undefined,
          "Synthetic Issuer Signer", "Synthetic Seller Signer",
          signed ? date : undefined, signed && bilateral ? date : undefined, kind,
        );
        files.push(result.pdfPath, result.docxPath);
        const xml = execFileSync("unzip", ["-p", result.docxPath, "word/document.xml"], { encoding: "utf8", maxBuffer: 10e6 });
        const pdfText = execFileSync("pdftotext", ["-raw", result.pdfPath, "-"], { encoding: "utf8" });
        const docxText = xml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
        for (const text of [pdfText, docxText]) {
          if (signed) {
            assert.ok(text.includes("Synthetic Issuer Signer"), `${kind}: buyer-slot signer missing`);
            assert.ok(text.includes("01 Jul 2026"), `${kind}: execution date missing`);
            if (kind === "LOI" || kind === "FCO" || kind === "ICPO") {
              assert.equal((text.match(/Digital Signature:/g) || []).length, 1);
              assert.doesNotMatch(text, /DIGITAL SIGNATURE/);
              assert.doesNotMatch(text, /Signature: _/);
              assert.doesNotMatch(text.split("AUTHORISED SIGNATORY").at(-1)!, /Name: _/);
            } else {
              assert.match(text, /DIGITAL SIGNATURE/);
              if (bilateral) assert.match(text, /Synthetic Seller Signer/);
            }
          } else {
            assert.doesNotMatch(text, /Synthetic Issuer Signer|DIGITAL SIGNATURE/);
            if (kind === "LOI") assert.match(text, /Digital Signature:/);
            if (kind === "FCO") assert.match(text, /Signature: _/);
          }
        }
        assert.equal((xml.match(/<w:drawing>/g) || []).length, signed ? (bilateral ? 2 : 1) : 0);
        if (process.env.SIGNATURE_OUTPUT_DIR && (kind === "LOI" || kind === "FCO")) {
          fs.mkdirSync(process.env.SIGNATURE_OUTPUT_DIR, { recursive: true });
          for (const source of [result.pdfPath, result.docxPath]) {
            fs.copyFileSync(source, path.join(process.env.SIGNATURE_OUTPUT_DIR, `${kind.toLowerCase()}-${signed ? "signed" : "unsigned"}${path.extname(source)}`));
          }
        }
      }
    }
  } finally {
    settings.mock.restore();
    for (const file of files) fs.rmSync(file, { force: true });
  }
});