import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBuilderKey } from "../documentFileGenerator";
import { generateDocumentContent } from "../documentTemplates";

// Review content is user-editable, so builder selection must be driven by the
// persisted docType; content sniffing is only a fallback for legacy rows.

test("non-DLC document whose edited content contains DLC markers keeps its own layout", () => {
  // Edited SPA content that happens to START with the MT700 marker phrases.
  const edited = `DRAFT - SWIFT MT700\n:40A: IRREVOCABLE\nSALE AND PURCHASE AGREEMENT terms follow...`;
  assert.equal(resolveBuilderKey(edited, "SPA"), "GENERIC");
  // Without a docType (legacy row) the sniffer would route it to the DLC builder.
  assert.equal(resolveBuilderKey(edited), "DLC_MT700");
});

test("docType drives dispatch even when content sniffers disagree", () => {
  const loiLikeContent = generateDocumentContent("LOI");
  // A TFR whose edited body embeds LOI marker phrases still renders as TFR.
  assert.equal(resolveBuilderKey(loiLikeContent, "TFR"), "TFR");
  // A generic-layout doc type embedding LOI markers stays generic.
  assert.equal(resolveBuilderKey(loiLikeContent, "FCO"), "GENERIC");
});

test("each dedicated docType maps to its own builder regardless of content", () => {
  const expectations: Array<[string, string]> = [
    ["TFR", "TFR"],
    ["DLC_MT700", "DLC_MT700"],
    ["DEAL_RECAP", "DEAL_RECAP"],
    ["LOI", "LOI"],
    ["NCNDA", "NCNDA"],
    ["BL", "BL"],
    ["COO", "COO"],
    ["COA", "COA"],
    ["COW", "COW"],
    ["CI", "CI"],
  ];
  for (const [docType, key] of expectations) {
    assert.equal(resolveBuilderKey("completely edited unrelated text", docType), key, docType);
  }
});

test("legacy rows without docType still sniff content correctly", () => {
  const tfr = generateDocumentContent("TFR");
  assert.equal(resolveBuilderKey(tfr), "TFR");
  const ncnda = generateDocumentContent("NCNDA");
  assert.equal(resolveBuilderKey(ncnda), "NCNDA");
  assert.equal(resolveBuilderKey("just some plain text"), "GENERIC");
  const ci = generateDocumentContent("CI");
  assert.equal(resolveBuilderKey(ci), "CI");
});

test("unknown docType falls back to sniffing rather than forcing generic", () => {
  const tfr = generateDocumentContent("TFR");
  assert.equal(resolveBuilderKey(tfr, "SOME_FUTURE_TYPE"), "TFR");
});
