import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDocumentContent } from "../documentTemplates";

test("PBG_MT760 renders defaults with placeholders when no pbgData given", () => {
  const content = generateDocumentContent("PBG_MT760");
  assert.ok(content.trimStart().startsWith("DRAFT - SWIFT MT760"));
  assert.ok(content.includes(":22D:DGAR"));
  assert.ok(content.includes(":40C:URDG"));
  assert.ok(content.includes(":20:[GUARANTEE NUMBER]"));
  assert.ok(content.includes("URDG 758"));
  assert.ok(content.includes("THIS GUARANTEE IS NON-TRANSFERABLE."));
  assert.ok(content.includes("-}"));
});

test("PBG_MT760 fills fields from pbgData and party fallbacks", () => {
  const content = generateDocumentContent(
    "PBG_MT760",
    undefined,
    { name: "Acme Buyers LLC", address: "Dubai, UAE" },
    { name: "Globex Pte Ltd", address: "Singapore" },
    {
      quantity: "50,000 Metric Tons",
      commodity: "Granular Sulphur",
      origin: "Kazakhstan",
      pbgData: {
        guaranteeNumber: "PBG-2026-0001",
        currency: "USD",
        guaranteeAmount: "525,000.00",
        amountInWords: "FIVE HUNDRED TWENTY FIVE THOUSAND",
        spaNumber: "SPA-2026-001",
        spaDate: "01 Aug 2026",
        destination: "India",
        expiryDate: "270228",
        issuingBankName: "EMIRATES NBD",
      },
    },
  );
  assert.ok(content.includes(":20:PBG-2026-0001"));
  assert.ok(content.includes(":32B:USD525,000.00"));
  assert.ok(content.includes(":50:Acme Buyers LLC"));
  assert.ok(content.includes(":59:Globex Pte Ltd"));
  assert.ok(content.includes("WE, EMIRATES NBD, AT THE REQUEST"));
  assert.ok(content.includes("THE ACCOUNT OF ACME BUYERS LLC"));
  assert.ok(content.includes("IN FAVOUR OF GLOBEX PTE LTD"));
  assert.ok(content.includes("FIVE HUNDRED TWENTY FIVE THOUSAND"));
  assert.ok(content.includes("PURCHASE AGREEMENT NO. SPA-2026-001 DATED 01 Aug 2026"));
  assert.ok(content.includes("50,000 METRIC TONS OF"));
  assert.ok(content.includes("GRANULAR SULPHUR OF KAZAKHSTAN ORIGIN FOR DELIVERY"));
  assert.ok(content.includes("TO INDIA."));
  assert.ok(content.includes("ISSUING BANK ON 270228."));
});

test("PBG_MT760 strips SWIFT structural characters from scalar and multiline fields", () => {
  const content = generateDocumentContent("PBG_MT760", undefined, undefined, undefined, {
    pbgData: {
      guaranteeNumber: "PBG-1{5:x}\n:59:EVIL BENEFICIARY",
      guaranteeText: "WE GUARANTEE.\n:32B:USD9,999,999\n-}\nEND OF TEXT.",
    },
  });
  const lines = content.split("\n");
  assert.equal(lines.filter(l => l.startsWith(":59:")).length, 1, "only the template's :59: line");
  assert.equal(lines.filter(l => l.startsWith(":32B:")).length, 1, "injected :32B: line dropped");
  assert.equal(lines.filter(l => l.trim() === "-}").length, 1, "only the template's block terminator");
  assert.ok(!content.includes("{5:x}"));
  assert.ok(content.includes("WE GUARANTEE.\nEND OF TEXT."));
});

test("PBG_MT760 bare-CR line separators cannot smuggle SWIFT tags into multiline fields", () => {
  const content = generateDocumentContent("PBG_MT760", undefined, undefined, undefined, {
    pbgData: {
      guaranteeText: "WE GUARANTEE.\r:32B:USD9,999,999\r-}\rEND OF TEXT.",
      underlyingTransaction: "UNDERLYING SPA.\r:59:EVIL PARTY",
    },
  });
  assert.ok(!content.includes("\r"), "no carriage returns may survive");
  const lines = content.split("\n");
  assert.equal(lines.filter(l => l.startsWith(":32B:")).length, 1);
  assert.equal(lines.filter(l => l.startsWith(":59:")).length, 1);
  assert.equal(lines.filter(l => l.trim() === "-}").length, 1);
  assert.ok(content.includes("WE GUARANTEE.\nEND OF TEXT."));
});
