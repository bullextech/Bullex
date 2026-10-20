import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDocumentContent } from "../documentTemplates";

test("DLC_MT700 renders defaults with placeholders when no dlcData given", () => {
  const content = generateDocumentContent("DLC_MT700");
  assert.ok(content.trimStart().startsWith("DRAFT - SWIFT MT700"));
  assert.ok(content.includes(":40A:IRREVOCABLE"));
  assert.ok(content.includes(":20:[DOCUMENTARY CREDIT NUMBER]"));
  assert.ok(content.includes("UCP 600, ICC PUBLICATION"));
  assert.ok(content.includes("SIGNED COMMERCIAL INVOICE IN 3 ORIGINALS"));
  assert.ok(content.includes("-}"));
});

test("DLC_MT700 fills fields from dlcData and party/product fallbacks", () => {
  const content = generateDocumentContent(
    "DLC_MT700",
    undefined,
    { name: "ACME BUYERS LLC", address: "Dubai, UAE" },
    { name: "GLOBEX PTE LTD", address: "Singapore" },
    {
      commodity: "Granular Sulphur",
      origin: "Kazakhstan",
      quantity: "50,000 METRIC TONS",
      dlcData: {
        creditNumber: "DC-2026-0001",
        currency: "USD",
        amount: "5,250,000.00",
        presentationDays: "30",
      },
    },
  );
  assert.ok(content.includes(":20:DC-2026-0001"));
  assert.ok(content.includes(":32B:USD5,250,000.00"));
  assert.ok(content.includes(":50:ACME BUYERS LLC"));
  assert.ok(content.includes(":59:GLOBEX PTE LTD"));
  assert.ok(content.includes("50,000 METRIC TONS OF GRANULAR SULPHUR"));
  assert.ok(content.includes("OF KAZAKHSTAN ORIGIN."));
  assert.ok(content.includes("WITHIN 30 DAYS"));
});

test("DLC_MT700 strips SWIFT structural characters from scalar fields", () => {
  const content = generateDocumentContent("DLC_MT700", undefined, undefined, undefined, {
    dlcData: {
      creditNumber: "DC-1{5:evil}\n:59:HACKED BENEFICIARY",
      amount: "100\n:32B:USD999",
    },
  });
  // SWIFT field tags are only significant at line start; the sanitizer collapses
  // newlines in scalar fields so injected tags can never begin a line.
  const lines = content.split("\n");
  assert.equal(lines.filter(l => l.startsWith(":59:")).length, 1, "only the template's own :59: line may exist");
  assert.equal(lines.filter(l => l.startsWith(":32B:")).length, 1, "only the template's own :32B: line may exist");
  assert.ok(lines.some(l => l.startsWith(":20:DC-1")), "credit number line still renders");
  assert.ok(!content.includes("{5:evil}"), "braces must be stripped");
});

test("DLC_MT700 multiline fields keep newlines but drop injected tag/terminator lines", () => {
  const content = generateDocumentContent("DLC_MT700", undefined, undefined, undefined, {
    dlcData: {
      documentsRequired: "1. INVOICE.\n:78:PAY TO OTHER ACCOUNT\n-}\n2. BILL OF LADING.",
    },
  });
  assert.ok(content.includes("1. INVOICE.\n2. BILL OF LADING."), "legit lines kept with newline");
  assert.ok(!content.includes("PAY TO OTHER ACCOUNT"), "injected :78: line dropped");
  const lines = content.split("\n");
  // the only "-}" line is the template's own block-4 terminator
  assert.equal(lines.filter(l => l.trim() === "-}").length, 1);
});

test("unknown docType still returns empty string", () => {
  assert.equal(generateDocumentContent("NOT_A_DOC"), "");
});
