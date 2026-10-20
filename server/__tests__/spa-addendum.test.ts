import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import express from "express";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { execFileSync } from "node:child_process";
import { storage } from "../storage";
import {
  createNextDocumentForParent,
  createSpaAddendumForParent,
  evaluateDocTransition,
  finalizeDocumentWithSignatures,
  hasDocumentSignature,
  hasRequiredDocumentSignatures,
  isSpaAddendumContentLocked,
  isSpaAddendumExecuted,
  parseSpaIdentity,
  registerRoutes,
  validateSpaAddendumInput,
} from "../routes";
import { generateDocumentContent } from "../documentTemplates";
import { getDocFilePath } from "../documentFileGenerator";

const createdIds: string[] = [];
const createdTeamMemberIds: string[] = [];
const generatedFiles: string[] = [];

after(async () => {
  for (const id of createdIds.reverse()) {
    try { await storage.deleteDocument(id); } catch {}
  }
  for (const file of generatedFiles) {
    try { fs.unlinkSync(file); } catch {}
  }
  for (const id of createdTeamMemberIds.reverse()) {
    try { await storage.deleteTeamMember(id); } catch {}
  }
});


const buyer = {
  name: "Acme Buyers DMCC",
  address: "Dubai, UAE",
  contact: "buyer@acme.example",
};
const seller = {
  name: "Globex Sellers Ltd",
  address: "London, UK",
  contact: "seller@globex.example",
};
const product = {
  commodity: "Copper Cathode",
  origin: "Zambia",
  quantity: "5,000 MT",
  price: "8,500",
  currency: "USD",
  incoterm: "CIF",
  loadingPort: "Dar es Salaam",
  dischargePort: "Shanghai",
  paymentTerms: "DLC at sight",
  dealRecapNumber: "ACM/GLO-1908-001",
};

const validInput = {
  effectiveDate: "2026-09-01",
  amendments: [
    {
      category: "price",
      clauseNumber: "5",
      description: "Contract price",
      existingProvision: "USD 8,500 per MT",
      amendedProvision: "USD 8,750 per MT on CIF basis.",
    },
    {
      category: "delivery",
      clauseNumber: "8.1",
      description: "Latest shipment date",
      amendedProvision: "The latest shipment date shall be 30 September 2026.",
    },
  ],
};

const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function postJson(
  server: Server,
  pathname: string,
  body: Record<string, unknown>,
  username: string,
): Promise<{ status: number; body: any }> {
  const address = server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: "127.0.0.1",
      port: address.port,
      path: pathname,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-team-username": username,
      },
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode ?? 0,
            body: raw ? JSON.parse(raw) : null,
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

test("SPA is the only parent type allowed to create an ADDENDUM", () => {
  assert.equal(evaluateDocTransition({
    parentDocType: "SPA",
    nextDocType: "ADDENDUM",
    recipientResponse: null,
  }).ok, true);
  const wrongParent = evaluateDocTransition({
    parentDocType: "DEAL_RECAP",
    nextDocType: "ADDENDUM",
    recipientResponse: "accepted",
  });
  assert.equal(wrongParent.ok, false);
  assert.equal(wrongParent.status, 400);
});

test("addendum validation requires date and complete selected clauses", () => {
  const noDate = validateSpaAddendumInput({ amendments: validInput.amendments });
  assert.equal(noDate.ok, false);
  if (!noDate.ok) assert.match(noDate.message, /Effective date is required/);

  const incomplete = validateSpaAddendumInput({
    effectiveDate: "2026-09-01",
    amendments: [{ category: "price", clauseNumber: "5", description: "Price", amendedProvision: "" }],
  });
  assert.equal(incomplete.ok, false);
  if (!incomplete.ok) assert.match(incomplete.message, /Revised provision/);

  const invalidCategory = validateSpaAddendumInput({
    effectiveDate: "2026-09-01",
    amendments: [{ ...validInput.amendments[0], category: "status" }],
  });
  assert.equal(invalidCategory.ok, false);
  if (!invalidCategory.ok) assert.match(invalidCategory.message, /valid category/);

  const normalizedNumber = validateSpaAddendumInput({
    ...validInput,
    addendumNumber: "Addendum No. 002",
  });
  assert.equal(normalizedNumber.ok, true);
  if (normalizedNumber.ok) assert.equal(normalizedNumber.data.addendumNumber, "2");

  const emptyNumber = validateSpaAddendumInput({
    ...validInput,
    addendumNumber: "Addendum No.",
  });
  assert.equal(emptyNumber.ok, false);
  if (!emptyNumber.ok) assert.match(emptyNumber.message, /must include a number or reference/);
});

test("addendum template renders only selected amendments and both annexes", () => {
  const content = generateDocumentContent("ADDENDUM", undefined, buyer, seller, {
    commodity: product.commodity,
    dealRecapNumber: product.dealRecapNumber,
    addendumData: {
      addendumNumber: "2",
      effectiveDate: "01 September 2026",
      originalSpaNumber: product.dealRecapNumber,
      originalSpaDate: "19 August 2026",
      amendments: validInput.amendments,
    },
  });
  assert.match(content, /ADDENDUM NO\. 2 TO SALE AND PURCHASE AGREEMENT NO\. ACM\/GLO-1908-001/);
  assert.match(content, /AMENDMENT TO PRICE — CLAUSE 5/);
  assert.match(content, /AMENDMENT TO DELIVERY \/ SHIPMENT — CLAUSE 8\.1/);
  assert.doesNotMatch(content, /AMENDMENT TO PAYMENT TERMS/);
  assert.match(content, /ANNEXURE A\nREVISED COMMERCIAL TERMS/);
  assert.match(content, /ANNEXURE B\nCLAUSE-BY-CLAUSE AMENDMENTS/);
  assert.match(content, /USD 8,750 per MT on CIF basis/);
});

test("addendum narrative escapes pipe characters so legal prose is not parsed as a table", () => {
  const content = generateDocumentContent("ADDENDUM", undefined, buyer, seller, {
    commodity: product.commodity,
    addendumData: {
      addendumNumber: "3",
      effectiveDate: "01 September 2026",
      originalSpaNumber: product.dealRecapNumber,
      originalSpaDate: "19 August 2026",
      amendments: [{
        ...validInput.amendments[0],
        description: "Price | premium",
        amendedProvision: "USD 8,750 | inclusive of premium",
      }],
    },
  });
  assert.match(content, /concerning Price \/ premium/);
  assert.match(content, /USD 8,750 \/ inclusive of premium/);
});

test("ADDENDUM signatures use both seller and buyer slots", () => {
  assert.equal(hasDocumentSignature({ docType: "ADDENDUM", sellerSignature: "data:image/png;base64,x", buyerSignature: null } as any), true);
  assert.equal(hasDocumentSignature({ docType: "ADDENDUM", sellerSignature: null, buyerSignature: "data:image/png;base64,x" } as any), true);
  assert.equal(hasDocumentSignature({ docType: "ADDENDUM", sellerSignature: null, buyerSignature: null } as any), false);
  assert.equal(hasRequiredDocumentSignatures({ docType: "ADDENDUM", sellerSignature: "data:image/png;base64,x", buyerSignature: null } as any), false);
  assert.equal(hasRequiredDocumentSignatures({ docType: "ADDENDUM", sellerSignature: null, buyerSignature: "data:image/png;base64,x" } as any), false);
  assert.equal(hasRequiredDocumentSignatures({ docType: "ADDENDUM", sellerSignature: "data:image/png;base64,x", buyerSignature: "data:image/png;base64,y" } as any), true);
  assert.equal(isSpaAddendumContentLocked({ docType: "ADDENDUM", status: "draft", sellerSignature: "x", buyerSignature: null } as any), true);
  assert.equal(isSpaAddendumExecuted({ docType: "ADDENDUM", status: "draft", sellerSignature: "x", buyerSignature: null } as any), false);
  assert.equal(isSpaAddendumExecuted({ docType: "ADDENDUM", status: "draft", sellerSignature: "x", buyerSignature: "y" } as any), true);
});

test("SPA identity is taken from the rendered Original SPA", () => {
  const spaContent = generateDocumentContent("SPA", undefined, buyer, seller, product);
  const identity = parseSpaIdentity(spaContent, "fallback");
  assert.equal(identity.spaNumber, product.dealRecapNumber);
  assert.match(identity.spaDate, /\d{2} \w+ \d{4}/);
});

test("dedicated service creates a linked ADDENDUM with DOCX and PDF files", async () => {
  const spaContent = generateDocumentContent("SPA", undefined, buyer, seller, product);
  const parent = await storage.createDocument({
    docType: "SPA",
    title: `SPA - addendum test ${Date.now()}`,
    status: "draft",
    content: spaContent,
    dealRecapNumber: product.dealRecapNumber,
    buyerEmail: buyer.contact,
    sellerEmail: seller.contact,
  } as any);
  createdIds.push(parent.id);

  const generic = await createNextDocumentForParent(parent, "ADDENDUM", true);
  assert.equal(generic.ok, false, "generic create-next must not bypass clause selection");
  if (!generic.ok) assert.match(generic.message, /dedicated addendum form/);

  const result = await createSpaAddendumForParent(parent, validInput);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  createdIds.push(result.doc.id);
  assert.equal(result.doc.docType, "ADDENDUM");
  assert.equal(result.doc.parentDocId, parent.id);
  assert.equal(result.doc.dealRecapNumber, parent.dealRecapNumber);
  assert.equal(result.doc.status, "draft");
  assert.match(result.doc.content || "", /Clause 5/);
  assert.match(result.doc.content || "", /Clause 8\.1/);
  assert.ok(result.doc.docxPath, "DOCX path should be stored");
  assert.ok(result.doc.pdfPath, "PDF path should be stored");
  const docx = getDocFilePath(result.doc.docxPath || "");
  const pdf = getDocFilePath(result.doc.pdfPath || "");
  assert.ok(docx, "generated DOCX must exist");
  assert.ok(pdf, "generated PDF must exist");
  const pdfText = execFileSync("pdftotext", [pdf!, "-"], { encoding: "utf8" });
  assert.match(pdfText, /Effective Date/);
  assert.match(pdfText, /01 September 2026/);

  const partlySigned = await storage.updateDocument(result.doc.id, {
    sellerSignature: tinyPng,
    sellerSignedName: "Seller Signer",
    sellerSignedAt: new Date("2026-09-01T09:00:00Z"),
  });
  const premature = await finalizeDocumentWithSignatures(partlySigned);
  assert.equal(premature.ok, false, "one signature must not finalize the addendum");

  const fullySigned = await storage.updateDocument(result.doc.id, {
    buyerSignature: tinyPng,
    buyerSignedName: "Buyer Signer",
    buyerSignedAt: new Date("2026-09-01T10:00:00Z"),
  });
  const finalized = await finalizeDocumentWithSignatures(fullySigned);
  assert.equal(finalized.ok, true, "both signatures must make finalization reachable");
  if (!finalized.ok) return;
  assert.equal(finalized.doc.status, "final");
  assert.equal(isSpaAddendumContentLocked(finalized.doc), true);
  assert.equal(isSpaAddendumExecuted(finalized.doc), true);
  const signedPdfText = execFileSync("pdftotext", [finalized.doc.pdfPath!, "-"], { encoding: "utf8" });
  assert.match(signedPdfText, /SELLER/);
  assert.match(signedPdfText, /BUYER/);
  assert.match(signedPdfText, /Seller Signer/);
  assert.match(signedPdfText, /Buyer Signer/);
  generatedFiles.push(docx!, pdf!);
});

test("concurrent addendum creation allocates distinct per-SPA numbers", async () => {
  const spaContent = generateDocumentContent("SPA", undefined, buyer, seller, product);
  const parent = await storage.createDocument({
    docType: "SPA",
    title: `SPA - concurrent addendum test ${Date.now()}`,
    status: "draft",
    content: spaContent,
    dealRecapNumber: `${product.dealRecapNumber}-RACE`,
  } as any);
  createdIds.push(parent.id);

  const [first, second] = await Promise.all([
    createSpaAddendumForParent(parent, validInput),
    createSpaAddendumForParent(parent, validInput),
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  createdIds.push(first.doc.id, second.doc.id);
  const numbers = [first.doc.content, second.doc.content]
    .map((content) => content?.match(/^ADDENDUM NO\.\s*(.+?)\s+TO SALE AND PURCHASE AGREEMENT/im)?.[1])
    .sort();
  assert.deepEqual(numbers, ["1", "2"]);
  for (const doc of [first.doc, second.doc]) {
    const docx = getDocFilePath(doc.docxPath || "");
    const pdf = getDocFilePath(doc.pdfPath || "");
    if (docx) generatedFiles.push(docx);
    if (pdf) generatedFiles.push(pdf);
  }

  const duplicate = await createSpaAddendumForParent(parent, { ...validInput, addendumNumber: "02" });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.status, 409);
});

test("persisted addendum numbers survive draft-heading edits and still prevent reuse", async () => {
  const spaContent = generateDocumentContent("SPA", undefined, buyer, seller, product);
  const parent = await storage.createDocument({
    docType: "SPA",
    title: `SPA - immutable addendum number test ${Date.now()}`,
    status: "draft",
    content: spaContent,
    dealRecapNumber: `${product.dealRecapNumber}-NUMBER`,
  } as any);
  createdIds.push(parent.id);

  const first = await createSpaAddendumForParent(parent, {
    ...validInput,
    addendumNumber: "01",
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  createdIds.push(first.doc.id);
  assert.equal(first.doc.addendumNumber, "1");
  await assert.rejects(
    storage.updateDocument(first.doc.id, { addendumNumber: "9" } as any),
    /numbers are immutable/,
  );

  const changedHeading = first.doc.content!.replace("ADDENDUM NO. 1", "ADDENDUM NO. 99");
  const guardedEdit = await storage.updateDocumentWithSpaAddendumGuard(
    first.doc.id,
    { content: changedHeading },
    "content",
  );
  assert.equal(guardedEdit.ok, false);
  if (!guardedEdit.ok) assert.equal(guardedEdit.reason, "spa_addendum_number_mismatch");

  // Even if rendered prose is damaged outside the guarded application paths,
  // allocation must trust the immutable column rather than parse the heading.
  await storage.updateDocument(first.doc.id, { content: "Heading removed from draft prose" });
  const explicitDuplicate = await createSpaAddendumForParent(parent, {
    ...validInput,
    addendumNumber: "001",
  });
  assert.equal(explicitDuplicate.ok, false);
  if (!explicitDuplicate.ok) assert.equal(explicitDuplicate.status, 409);

  const automatic = await createSpaAddendumForParent(parent, validInput);
  assert.equal(automatic.ok, true);
  if (!automatic.ok) return;
  createdIds.push(automatic.doc.id);
  assert.equal(automatic.doc.addendumNumber, "2");
  assert.match(automatic.doc.content || "", /^ADDENDUM NO\. 2 /m);

  for (const doc of [first.doc, automatic.doc]) {
    const docx = getDocFilePath(doc.docxPath || "");
    const pdf = getDocFilePath(doc.pdfPath || "");
    if (docx) generatedFiles.push(docx);
    if (pdf) generatedFiles.push(pdf);
  }
});

test("content edits and first signatures serialize on the addendum row", async () => {
  const doc = await storage.createDocument({
    docType: "ADDENDUM",
    title: `Atomic addendum content test ${Date.now()}`,
    status: "draft",
    content: "Original legal content",
  } as any);
  createdIds.push(doc.id);

  const [edit, sign] = await Promise.all([
    storage.updateDocumentWithSpaAddendumGuard(
      doc.id,
      { content: "Edited before signature" },
      "content",
    ),
    storage.updateDocumentWithSpaAddendumGuard(
      doc.id,
      {
        sellerSignature: tinyPng,
        sellerSignedName: "Seller Signer",
        sellerSignedAt: new Date(),
      },
      "execution",
    ),
  ]);

  assert.equal(sign.ok, true, "the first signature must be preserved");
  const current = await storage.getDocumentById(doc.id);
  assert.equal(current?.sellerSignature, tinyPng);
  if (edit.ok) {
    assert.equal(current?.content, "Edited before signature");
  } else {
    assert.equal(edit.reason, "spa_addendum_content_locked");
    assert.equal(current?.content, "Original legal content");
  }

  const lateEdit = await storage.updateDocumentWithSpaAddendumGuard(
    doc.id,
    { content: "Illegal post-signature edit" },
    "content",
  );
  assert.equal(lateEdit.ok, false);
  if (!lateEdit.ok) assert.equal(lateEdit.reason, "spa_addendum_content_locked");
});

test("concurrent duplicate second signatures cannot overwrite an executed addendum", async () => {
  const doc = await storage.createDocument({
    docType: "ADDENDUM",
    title: `Atomic duplicate signature test ${Date.now()}`,
    status: "draft",
    content: "Immutable execution content",
    sellerSignature: tinyPng,
    sellerSignedName: "Seller Signer",
    sellerSignedAt: new Date(),
  } as any);
  createdIds.push(doc.id);

  const [first, second] = await Promise.all([
    storage.updateDocumentWithSpaAddendumGuard(
      doc.id,
      { buyerSignature: "data:image/png;base64,first", buyerSignedName: "First Buyer", buyerSignedAt: new Date() },
      "execution",
    ),
    storage.updateDocumentWithSpaAddendumGuard(
      doc.id,
      { buyerSignature: "data:image/png;base64,second", buyerSignedName: "Second Buyer", buyerSignedAt: new Date() },
      "execution",
    ),
  ]);

  assert.equal([first, second].filter((result) => result.ok).length, 1);
  const rejected = [first, second].find((result) => !result.ok);
  assert.ok(rejected && !rejected.ok);
  if (rejected && !rejected.ok) assert.equal(rejected.reason, "spa_addendum_executed");
  const current = await storage.getDocumentById(doc.id);
  assert.equal(current?.sellerSignature, tinyPng);
  assert.ok(["First Buyer", "Second Buyer"].includes(current?.buyerSignedName || ""));
});

test("concurrent second-sign and unsign cannot remove a completed execution", async () => {
  const doc = await storage.createDocument({
    docType: "ADDENDUM",
    title: `Atomic sign-unsign test ${Date.now()}`,
    status: "draft",
    content: "Execution race content",
    sellerSignature: tinyPng,
    sellerSignedName: "Seller Signer",
    sellerSignedAt: new Date(),
  } as any);
  createdIds.push(doc.id);

  const [secondSign, unsign] = await Promise.all([
    storage.updateDocumentWithSpaAddendumGuard(
      doc.id,
      { buyerSignature: tinyPng, buyerSignedName: "Buyer Signer", buyerSignedAt: new Date() },
      "execution",
    ),
    storage.updateDocumentWithSpaAddendumGuard(
      doc.id,
      {
        sellerSignature: null,
        sellerSignedName: null,
        sellerSignedAt: null,
        sellerSignedIp: null,
      },
      "execution",
    ),
  ]);

  assert.equal(secondSign.ok, true);
  const current = await storage.getDocumentById(doc.id);
  assert.equal(current?.buyerSignature, tinyPng);
  if (unsign.ok) {
    assert.equal(current?.sellerSignature, null, "unsigning won before bilateral execution");
  } else {
    assert.equal(unsign.reason, "spa_addendum_executed");
    assert.equal(current?.sellerSignature, tinyPng, "executed seller signature must be preserved");
  }
});

test("authenticated direct email requires both addendum signatures before delivery", async () => {
  const runId = `${Date.now()}-${process.pid}`;
  const username = `spa-email-route-${runId}`;
  const recipientEmail = `spa-email-route-${runId}@example.com`;
  const member = await storage.createTeamMember({
    username,
    password: "unused-route-test-password",
    name: "SPA Email Route Test",
    email: recipientEmail,
    allowedModules: ["documents"],
  } as any);
  createdTeamMemberIds.push(member.id);

  const content = generateDocumentContent("ADDENDUM", undefined, buyer, seller, {
    commodity: product.commodity,
    dealRecapNumber: product.dealRecapNumber,
    addendumData: {
      addendumNumber: `route-${runId}`,
      effectiveDate: "01 September 2026",
      originalSpaNumber: product.dealRecapNumber,
      originalSpaDate: "19 August 2026",
      amendments: validInput.amendments,
    },
  });
  const routeDocs: Awaited<ReturnType<typeof storage.createDocument>>[] = [];
  const createRouteDoc = async (overrides: Record<string, unknown>) => {
    const doc = await storage.createDocument({
      docType: "ADDENDUM",
      title: `SPA email route ${runId}`,
      status: "draft",
      content,
      submittedByTeamMemberId: member.id,
      ...overrides,
    } as any);
    routeDocs.push(doc);
    createdIds.push(doc.id);
    return doc;
  };

  const sellerOnly = await createRouteDoc({
    title: `Seller-only SPA email route ${runId}`,
    sellerSignature: tinyPng,
  });
  const buyerOnly = await createRouteDoc({
    title: `Buyer-only SPA email route ${runId}`,
    buyerSignature: tinyPng,
  });
  const notOwned = await createRouteDoc({
    title: `Unowned SPA email route ${runId}`,
    submittedByTeamMemberId: null,
    sellerSignature: tinyPng,
    buyerSignature: tinyPng,
  });
  const pendingReview = await createRouteDoc({
    title: `Pending-review SPA email route ${runId}`,
    status: "pending_review",
    sellerSignature: tinyPng,
    buyerSignature: tinyPng,
  });
  const fullySigned = await createRouteDoc({
    title: `Fully-signed SPA email route ${runId}`,
    sellerSignature: tinyPng,
    buyerSignature: tinyPng,
    sellerSignedName: "Seller Signer",
    buyerSignedName: "Buyer Signer",
    sellerSignedAt: new Date(),
    buyerSignedAt: new Date(),
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.headers["x-test-team-username"] === username) {
      req.session = {
        authenticated: true,
        role: "team",
        username,
        allowedModules: ["documents"],
      } as any;
    }
    next();
  });
  const server = createServer(app);
  const originalFetch = globalThis.fetch;
  const originalResendKey = process.env.RESEND_API_KEY;
  const originalEmailTestDelivery = process.env.EMAIL_ENABLE_TEST_DELIVERY;
  const deliveryRequests: Array<{ url: string; body: any }> = [];

  try {
    await registerRoutes(server, app);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    process.env.RESEND_API_KEY = "route-test-key";
    process.env.EMAIL_ENABLE_TEST_DELIVERY = "true";
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      assert.equal(url, "https://api.resend.com/emails");
      deliveryRequests.push({
        url,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      });
      return new Response(JSON.stringify({ id: `route-test-${runId}` }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const requestBody = { recipientEmail };

    const sellerOnlyResponse = await postJson(server, `/api/documents/${sellerOnly.id}/email`, requestBody, username);
    assert.equal(sellerOnlyResponse.status, 400);
    assert.match(sellerOnlyResponse.body.message, /signed by both Seller and Buyer/);
    assert.equal(deliveryRequests.length, 0);

    const buyerOnlyResponse = await postJson(server, `/api/documents/${buyerOnly.id}/email`, requestBody, username);
    assert.equal(buyerOnlyResponse.status, 400);
    assert.match(buyerOnlyResponse.body.message, /signed by both Seller and Buyer/);
    assert.equal(deliveryRequests.length, 0);

    const notOwnedResponse = await postJson(server, `/api/documents/${notOwned.id}/email`, requestBody, username);
    assert.equal(notOwnedResponse.status, 403);
    assert.match(notOwnedResponse.body.message, /only email documents you created/);
    assert.equal(deliveryRequests.length, 0);

    const pendingReviewResponse = await postJson(server, `/api/documents/${pendingReview.id}/email`, requestBody, username);
    assert.equal(pendingReviewResponse.status, 403);
    assert.match(pendingReviewResponse.body.message, /awaiting admin approval/);
    assert.equal(deliveryRequests.length, 0);

    const fullySignedResponse = await postJson(server, `/api/documents/${fullySigned.id}/email`, requestBody, username);
    assert.equal(fullySignedResponse.status, 200);
    assert.deepEqual(fullySignedResponse.body, {
      success: true,
      emailedTo: recipientEmail,
      cc: null,
    });
    assert.equal(deliveryRequests.length, 1);
    assert.equal(deliveryRequests[0].body.to[0], recipientEmail);
    assert.match(deliveryRequests[0].body.subject, /ADDENDUM/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalResendKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalResendKey;
    }
    if (originalEmailTestDelivery === undefined) {
      delete process.env.EMAIL_ENABLE_TEST_DELIVERY;
    } else {
      process.env.EMAIL_ENABLE_TEST_DELIVERY = originalEmailTestDelivery;
    }
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    for (const doc of routeDocs) {
      const current = await storage.getDocumentById(doc.id);
      for (const storedPath of [current?.docxPath, current?.pdfPath]) {
        const file = getDocFilePath(storedPath || "");
        if (file) generatedFiles.push(file);
      }
    }
    const notifications = await storage.getNotifications();
    for (const notification of notifications) {
      if (notification.type === "document_sent" && notification.message.includes(recipientEmail)) {
        await storage.deleteNotification(notification.id);
      }
    }
  }
});