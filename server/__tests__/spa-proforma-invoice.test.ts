import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import express from "express";
import { createServer } from "node:http";
import { storage } from "../storage";
import {
  areAdminChecksComplete,
  buildAdminChecks,
  buildProformaInvoiceDataFromSpa,
  buildProformaInvoicePreviewToken,
  buildProformaInvoiceSourceRevision,
  canManageProformaInvoice,
  createNextDocumentForParent,
  deriveNextDocument,
  DOC_TRANSITIONS,
  evaluateProformaInvoiceEligibility,
  hasCompletedAdminChecklist,
  hasRequiredDocumentSignatures,
  invalidatesProformaSpaApproval,
  prepareProformaInvoiceForParent,
  registerRoutes,
  requiresProformaPortalDelivery,
  sanitizePreparedProformaInvoiceFields,
  validateProformaInvoicePreviewToken,
  validateProformaInvoiceRecipient,
  validateProformaInvoiceDirectEmail,
} from "../routes";
import { generateDocumentContent } from "../documentTemplates";
import { parseCiContent, regenerateWithSignatures, resolveBuilderKey } from "../documentFileGenerator";

const createdIds: string[] = [];
const createdEnquiryIds: string[] = [];
const createdKycIds: string[] = [];
const createdTeamMemberIds: string[] = [];
const generatedFiles = new Set<string>();
const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

after(async () => {
  for (const id of createdIds.reverse()) {
    try { await storage.deleteDocument(id); } catch {}
  }
  for (const id of createdEnquiryIds.reverse()) {
    try { await storage.deleteTradeEnquiry(id); } catch {}
  }
  for (const id of createdKycIds.reverse()) {
    try { await storage.deleteKycApplication(id); } catch {}
  }
  for (const id of createdTeamMemberIds.reverse()) {
    try { await storage.deleteTeamMember(id); } catch {}
  }
  for (const file of generatedFiles) {
    try { fs.unlinkSync(file); } catch {}
  }
});

const completeChecks = buildAdminChecks("SPA").map((check) => ({ ...check, checked: true }));

async function makeImportEnquiry() {
  const unique = `PIX${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  const enquiry = await storage.createTradeEnquiry({
    side: "buy",
    product: `Iron Ore ${unique}`,
    createdBy: unique,
    sellerName: "Export Supplier Ltd",
    sellerContact: "supplier@example.com",
    buyerName: "Import Buyer FZE",
    buyerContact: "buyer@example.com",
  } as any);
  createdEnquiryIds.push(enquiry.id);
  return enquiry;
}

test("PI is an admin-created SPA child that does not require SPA checklist approval", () => {
  assert.ok(DOC_TRANSITIONS.SPA.includes("PI"));
  assert.equal(areAdminChecksComplete(completeChecks), true);
  assert.equal(areAdminChecksComplete([{ label: "Parties verified", checked: false }]), false);
  assert.equal(hasCompletedAdminChecklist("SPA", completeChecks), true);
  assert.equal(hasCompletedAdminChecklist("SPA", [{ label: completeChecks[0].label, checked: true }]), false);

  assert.deepEqual(evaluateProformaInvoiceEligibility({
    isAdminCaller: true,
    parentDocType: "SPA",
    enquirySide: "buy",
  }), { ok: true });
  assert.deepEqual(evaluateProformaInvoiceEligibility({
    isAdminCaller: true,
    parentDocType: "SPA",
    enquirySide: "sell",
  }), { ok: true });
  assert.deepEqual(evaluateProformaInvoiceEligibility({
    isAdminCaller: true,
    parentDocType: "SPA",
    enquirySide: "buy",
  }), { ok: true });

  for (const denied of [
    evaluateProformaInvoiceEligibility({
      isAdminCaller: false,
      parentDocType: "SPA",
      enquirySide: "buy",
    }),
    evaluateProformaInvoiceEligibility({
      isAdminCaller: true,
      parentDocType: "LOI",
      enquirySide: "buy",
    }),
    evaluateProformaInvoiceEligibility({
      isAdminCaller: true,
      parentDocType: "SPA",
      enquirySide: null,
    }),
  ]) {
    assert.equal(denied.ok, false);
  }
});

test("PI uses the generic buyer signature slot while displaying the signer as Seller / Issuer", () => {
  assert.equal(hasRequiredDocumentSignatures({
    docType: "PI",
    buyerSignature: "supplier-signature",
    sellerSignature: null,
  } as any), true);
  assert.equal(hasRequiredDocumentSignatures({
    docType: "PI",
    buyerSignature: null,
    sellerSignature: "wrong-slot",
  } as any), false);
});

test("PI portal delivery stays restricted while a signed PI can be emailed directly by an admin", () => {
  assert.equal(requiresProformaPortalDelivery("PI"), true);
  assert.equal(requiresProformaPortalDelivery("CI"), false);
  assert.equal(requiresProformaPortalDelivery("SPA"), false);
  assert.equal(canManageProformaInvoice({ docType: "PI", role: "admin" }), true);
  assert.equal(canManageProformaInvoice({ docType: "PI", role: "team" }), false);
  assert.equal(canManageProformaInvoice({ docType: "SPA", role: "team" }), true);
  assert.deepEqual(validateProformaInvoiceDirectEmail({
    docType: "PI",
    role: "admin",
    hasRequiredSignature: true,
  }), { ok: true });
  assert.deepEqual(validateProformaInvoiceDirectEmail({
    docType: "PI",
    role: "team",
    hasRequiredSignature: true,
  }), {
    ok: false,
    status: 403,
    message: "Only an administrator can email a Proforma Invoice directly",
  });
  assert.deepEqual(validateProformaInvoiceDirectEmail({
    docType: "PI",
    role: "admin",
    hasRequiredSignature: false,
  }), {
    ok: false,
    status: 400,
    message: "The Proforma Invoice must be signed before it can be emailed directly",
  });
  assert.deepEqual(validateProformaInvoiceDirectEmail({
    docType: "CI",
    role: "team",
    hasRequiredSignature: false,
  }), { ok: true });
});

test("an owning team member cannot edit, sign, or supplier-send an admin-created PI while an admin can sign and send it", async () => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const teamUsername = `pi-route-owner-${runId}`;
  const supplierEmail = `pi-supplier-${runId}@example.com`;
  const member = await storage.createTeamMember({
    username: teamUsername,
    password: "unused-route-test-password",
    name: "PI Route Owner",
    email: `pi-owner-${runId}@example.com`,
    allowedModules: ["documents"],
  } as any);
  createdTeamMemberIds.push(member.id);

  const supplier = await storage.createKycApplication({
    companyName: `PI Supplier ${runId}`,
    registeredAddress: "1 Supplier Street",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "GB",
    registrationNumber: `PI-SUP-${runId}`,
    contactName: "Supplier Signatory",
    contactTitle: "Director",
    contactPhone: "+440000000000",
    contactEmail: supplierEmail,
    signatoryEmail: supplierEmail,
    status: "approved",
  } as any);
  createdKycIds.push(supplier.id);
  const enquiry = await storage.createTradeEnquiry({
    side: "buy",
    product: `Iron Ore PI ${runId}`,
    createdBy: `PII-${runId}`,
    sellerName: supplier.companyName,
    sellerContact: supplierEmail,
    buyerName: "Import Buyer FZE",
    buyerContact: "buyer@example.com",
  } as any);
  createdEnquiryIds.push(enquiry.id);
  const parentSpa = await storage.createDocument({
    docType: "SPA",
    title: `Approved Import SPA route authorization ${runId}`,
    status: "draft",
    content: `Reviewed Import SPA content ${runId}`,
    enquiryRef: enquiry.enquiryRef,
    buyerEmail: "buyer@example.com",
    sellerEmail: supplierEmail,
    adminChecks: completeChecks,
  } as any);
  createdIds.push(parentSpa.id);

  const content = generateDocumentContent(
    "PI",
    undefined,
    { name: "Import Buyer FZE", address: "Dubai, UAE", contact: "buyer@example.com" },
    { name: supplier.companyName, address: supplier.registeredAddress, contact: supplierEmail },
    {
      commodity: "Iron Ore",
      quantity: "1,000",
      price: "100",
      currency: "USD",
      paymentTerms: "Documentary Letter of Credit",
      piData: buildProformaInvoiceDataFromSpa({
        spaNumber: `PI-SPA-${runId}`,
        quantity: "1,000",
        price: "100",
      }),
    },
  );
  const pi = await storage.createDocument({
    docType: "PI",
    title: `Proforma Invoice route authorization ${runId}`,
    status: "draft",
    content,
    enquiryRef: enquiry.enquiryRef,
    parentDocId: parentSpa.id,
    buyerEmail: "buyer@example.com",
    sellerEmail: supplierEmail,
    submittedByTeamMemberId: member.id,
  } as any);
  createdIds.push(pi.id);

  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use((req, _res, next) => {
    const role = req.headers["x-test-role"];
    if (role === "team") {
      req.session = {
        authenticated: true,
        role: "team",
        username: teamUsername,
        allowedModules: ["documents"],
      } as any;
    } else if (role === "admin") {
      req.session = {
        authenticated: true,
        role: "admin",
        username: "pi-route-admin",
      } as any;
    } else if (role === "client") {
      req.session = {
        authenticated: true,
        role: "client",
        username: supplierEmail,
        clientKycId: supplier.id,
        clientCompanyName: supplier.companyName,
      } as any;
    }
    next();
  });
  const server = createServer(app);
  const originalResendKey = process.env.RESEND_API_KEY;

  try {
    delete process.env.RESEND_API_KEY;
    await registerRoutes(server, app, { attachRealtime: false, seedOnStart: false });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const post = async (role: "team" | "admin" | "client", path: string, body: unknown, method = "POST") => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          "x-forwarded-proto": "https",
          "x-test-role": role,
        },
        body: JSON.stringify(body),
      });
      const responseBody = await response.json();
      return { status: response.status, body: responseBody };
    };

    const teamEdit = await post("team", `/api/documents/${pi.id}`, { content: `${content}\nUnauthorised change` }, "PATCH");
    assert.equal(teamEdit.status, 403);
    assert.match(teamEdit.body.message, /Only an administrator/);

    const teamSign = await post("team", `/api/documents/${pi.id}/sign`, {
      party: "buyer",
      signature: tinyPng,
      name: "Team Issuer",
    });
    assert.equal(teamSign.status, 403);
    assert.match(teamSign.body.message, /Only an administrator/);

    const teamSend = await post("team", `/api/documents/${pi.id}/send`, {
      recipientEmail: supplierEmail,
      clientId: supplier.id,
    });
    assert.equal(teamSend.status, 403);
    assert.match(teamSend.body.message, /Only an administrator/);

    const teamDirectEmail = await post("team", `/api/documents/${pi.id}/email`, {
      recipientEmail: `chosen-pi-recipient-${runId}@example.com`,
    });
    assert.equal(teamDirectEmail.status, 403);
    assert.match(teamDirectEmail.body.message, /Only an administrator/);

    const unsignedAdminDirectEmail = await post("admin", `/api/documents/${pi.id}/email`, {
      recipientEmail: `chosen-pi-recipient-${runId}@example.com`,
    });
    assert.equal(unsignedAdminDirectEmail.status, 400);
    assert.match(unsignedAdminDirectEmail.body.message, /must be signed/i);

    const weakenImportReview = await post("admin", `/api/documents/${parentSpa.id}/admin-review`, {
      adminChecks: buildAdminChecks("SPA"),
    }, "PATCH");
    assert.equal(weakenImportReview.status, 409);
    assert.match(weakenImportReview.body.message, /approved review record is locked/i);

    const rejectImportSpa = await post("admin", `/api/documents/${parentSpa.id}/admin-review`, {
      adminChecks: completeChecks,
      action: "reject",
    }, "PATCH");
    assert.equal(rejectImportSpa.status, 409);
    assert.match(rejectImportSpa.body.message, /approved review record is locked/i);

    const adminSign = await post("admin", `/api/documents/${pi.id}/sign`, {
      party: "buyer",
      signature: tinyPng,
      name: "Administrator Issuer",
    });
    assert.equal(adminSign.status, 200);
    assert.equal(adminSign.body.buyerSignedName, "Administrator Issuer");

    const directEmail = await post("admin", `/api/documents/${pi.id}/email`, {
      recipientEmail: `chosen-pi-recipient-${runId}@example.com`,
      ccEmail: `chosen-pi-cc-${runId}@example.com`,
      message: "Please review the attached PI in both formats.",
    });
    assert.equal(directEmail.status, 502);
    assert.match(directEmail.body.message, /email service configuration/i);
    const regeneratedForDirectEmail = await storage.getDocumentById(pi.id);
    assert.ok(regeneratedForDirectEmail?.docxPath);
    assert.ok(regeneratedForDirectEmail?.pdfPath);
    generatedFiles.add(regeneratedForDirectEmail.docxPath);
    generatedFiles.add(regeneratedForDirectEmail.pdfPath);
    assert.equal(fs.existsSync(regeneratedForDirectEmail.docxPath), true);
    assert.equal(fs.existsSync(regeneratedForDirectEmail.pdfPath), true);
    assert.equal(regeneratedForDirectEmail.status, "draft");
    assert.equal(regeneratedForDirectEmail.sentTo, null);
    assert.equal(regeneratedForDirectEmail.sentToClientId, null);
    assert.equal(regeneratedForDirectEmail.recipientResponse, null);

    const signedDelete = await post("admin", `/api/documents/${pi.id}`, {}, "DELETE");
    assert.equal(signedDelete.status, 409);
    assert.match(signedDelete.body.message, /immutable counterparty record/i);

    const signedEdit = await post("admin", `/api/documents/${pi.id}`, {
      content: `${content}\nAltered after issuer signature`,
    }, "PATCH");
    assert.equal(signedEdit.status, 409);
    assert.match(signedEdit.body.message, /immutable once signed or delivered/i);

    const removeIssuerSignature = await post(
      "admin",
      `/api/documents/${pi.id}/sign/buyer`,
      {},
      "DELETE",
    );
    assert.equal(removeIssuerSignature.status, 409);
    assert.match(removeIssuerSignature.body.message, /signature is final/i);

    const adminSend = await post("admin", `/api/documents/${pi.id}/send`, {
      recipientEmail: supplierEmail,
      clientId: supplier.id,
    });
    assert.equal(adminSend.status, 200);
    assert.equal(adminSend.body.status, "sent");
    assert.equal(adminSend.body.sentToClientId, supplier.id);

    const adminAcceptance = await post("admin", `/api/documents/${pi.id}/respond`, {
      response: "accepted",
    });
    assert.equal(adminAcceptance.status, 403);
    assert.match(adminAcceptance.body.message, /only the recipient account/i);

    const adminRejection = await post("admin", `/api/documents/${pi.id}/respond`, {
      response: "rejected",
      amendmentNotes: "Admin must not impersonate the supplier",
    });
    assert.equal(adminRejection.status, 403);

    const sentEdit = await post("admin", `/api/documents/${pi.id}`, {
      content: `${content}\nAltered after supplier delivery`,
    }, "PATCH");
    assert.equal(sentEdit.status, 409);

    const supplierAcceptance = await post("client", `/api/client/documents/${pi.id}/respond`, {
      response: "accepted",
    });
    assert.equal(supplierAcceptance.status, 200);
    assert.equal(supplierAcceptance.body.status, "accepted");
    assert.equal(supplierAcceptance.body.recipientResponse, "accepted");

    const duplicateSupplierResponse = await post("client", `/api/client/documents/${pi.id}/respond`, {
      response: "rejected",
      amendmentNotes: "A second response must never replace the first",
    });
    assert.equal(duplicateSupplierResponse.status, 400);
    assert.match(duplicateSupplierResponse.body.message, /not awaiting your response/i);

    const acceptedEdit = await post("admin", `/api/documents/${pi.id}`, {
      content: `${content}\nAltered after supplier acceptance`,
    }, "PATCH");
    assert.equal(acceptedEdit.status, 409);

    const portalDownload = await fetch(`${baseUrl}/api/client/documents/${pi.id}/download`, {
      headers: {
        "x-forwarded-proto": "https",
        "x-test-role": "client",
      },
    });
    assert.equal(portalDownload.status, 200);
    assert.match(portalDownload.headers.get("content-type") || "", /application\/pdf/);
    const pdfBytes = Buffer.from(await portalDownload.arrayBuffer());
    assert.equal(pdfBytes.subarray(0, 4).toString("ascii"), "%PDF");

    const immutablePi = await storage.getDocumentById(pi.id);
    assert.equal(immutablePi?.content, content);
    assert.equal(immutablePi?.buyerSignedName, "Administrator Issuer");
    assert.equal(immutablePi?.status, "accepted");

    await new Promise((resolve) => setTimeout(resolve, 500));
  } finally {
    if (originalResendKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalResendKey;
    }
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  }
});

test("an approved Export SPA produces a seller-issued PI routed only to its approved buyer client", async () => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const buyerEmail = `pi-export-buyer-${runId}@example.com`;
  const sellerEmail = `pi-export-seller-${runId}@example.com`;
  const buyer = await storage.createKycApplication({
    companyName: `PI Export Buyer ${runId}`,
    registeredAddress: "10 Buyer Avenue",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "AE",
    registrationNumber: `PI-BUY-${runId}`,
    contactName: "Buyer Signatory",
    contactTitle: "Director",
    contactPhone: "+971500000000",
    contactEmail: buyerEmail,
    signatoryEmail: buyerEmail,
    status: "approved",
  } as any);
  createdKycIds.push(buyer.id);

  const enquiry = await storage.createTradeEnquiry({
    side: "sell",
    product: `Export Copper Cathodes ${runId}`,
    createdBy: `PIX-${runId}`,
    buyerName: buyer.companyName,
    buyerContact: buyerEmail,
    sellerName: `PI Export Seller ${runId}`,
    sellerContact: sellerEmail,
  } as any);
  createdEnquiryIds.push(enquiry.id);

  const spaContent = generateDocumentContent(
    "SPA",
    undefined,
    { name: buyer.companyName, address: buyer.registeredAddress, contact: buyerEmail },
    { name: enquiry.sellerName, address: "1 Seller Street", contact: sellerEmail },
    {
      commodity: "Copper Cathodes",
      origin: "Zambia",
      quantity: "1,000 MT",
      price: "9,000",
      currency: "USD",
      incoterm: "CIF",
      paymentTerms: "Irrevocable DLC at sight",
      dealRecapNumber: `EXP/PI-${runId}`,
    },
  );
  const parent = await storage.createDocument({
    docType: "SPA",
    title: `Approved Export SPA ${runId}`,
    status: "draft",
    content: spaContent,
    enquiryRef: enquiry.enquiryRef,
    dealRecapNumber: `EXP/PI-${runId}`,
    buyerEmail,
    sellerEmail,
    adminChecks: completeChecks,
  } as any);
  createdIds.push(parent.id);

  const derived = await createNextDocumentForParent(parent, "PI", true);
  assert.equal(derived.ok, true);
  if (!derived.ok) return;
  const pi = derived.doc;
  createdIds.push(pi.id);
  if (pi.docxPath) generatedFiles.add(pi.docxPath);
  if (pi.pdfPath) generatedFiles.add(pi.pdfPath);
  assert.match(pi.content, /SELLER \(BENEFICIARY\)/);
  assert.match(pi.content, new RegExp(enquiry.sellerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(pi.content, /FOR AND ON BEHALF OF/);

  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use((req, _res, next) => {
    const role = req.headers["x-test-role"];
    if (role === "admin") {
      req.session = {
        authenticated: true,
        role: "admin",
        username: "pi-export-admin",
      } as any;
    } else if (role === "client") {
      req.session = {
        authenticated: true,
        role: "client",
        username: buyerEmail,
        clientKycId: buyer.id,
        clientCompanyName: buyer.companyName,
      } as any;
    }
    next();
  });
  const server = createServer(app);
  const originalResendKey = process.env.RESEND_API_KEY;

  try {
    delete process.env.RESEND_API_KEY;
    await registerRoutes(server, app, { attachRealtime: false, seedOnStart: false });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const post = async (role: "admin" | "client", path: string, body: unknown, method = "POST") => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          "x-forwarded-proto": "https",
          "x-test-role": role,
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };

    const weakenExportReview = await post("admin", `/api/documents/${parent.id}/admin-review`, {
      adminChecks: buildAdminChecks("SPA"),
    }, "PATCH");
    assert.equal(weakenExportReview.status, 409);
    assert.match(weakenExportReview.body.message, /approved review record is locked/i);

    const rejectExportSpa = await post("admin", `/api/documents/${parent.id}/admin-review`, {
      adminChecks: completeChecks,
      action: "reject",
    }, "PATCH");
    assert.equal(rejectExportSpa.status, 409);
    assert.match(rejectExportSpa.body.message, /approved review record is locked/i);

    const adminSign = await post("admin", `/api/documents/${pi.id}/sign`, {
      party: "buyer",
      signature: tinyPng,
      name: "Export Seller Issuer",
    });
    assert.equal(adminSign.status, 200);
    assert.equal(adminSign.body.buyerSignedName, "Export Seller Issuer");

    const wrongSellerRouting = await post("admin", `/api/documents/${pi.id}/send`, {
      recipientEmail: sellerEmail,
      clientId: buyer.id,
    });
    assert.equal(wrongSellerRouting.status, 422);
    assert.match(wrongSellerRouting.body.message, /buyer email recorded on the SPA/i);

    const buyerDelivery = await post("admin", `/api/documents/${pi.id}/send`, {
      recipientEmail: buyerEmail,
      clientId: buyer.id,
    });
    assert.equal(buyerDelivery.status, 200);
    assert.equal(buyerDelivery.body.status, "sent");
    assert.equal(buyerDelivery.body.sentToClientId, buyer.id);

    const adminAcceptance = await post("admin", `/api/documents/${pi.id}/respond`, {
      response: "accepted",
    });
    assert.equal(adminAcceptance.status, 403);
    assert.match(adminAcceptance.body.message, /only the recipient account/i);

    const buyerAcceptance = await post("client", `/api/client/documents/${pi.id}/respond`, {
      response: "accepted",
    });
    assert.equal(buyerAcceptance.status, 200);
    assert.equal(buyerAcceptance.body.status, "accepted");
    assert.equal(buyerAcceptance.body.recipientResponse, "accepted");

    const acceptedEdit = await post("admin", `/api/documents/${pi.id}`, {
      content: `${pi.content}\nAltered after Export buyer acceptance`,
    }, "PATCH");
    assert.equal(acceptedEdit.status, 409);

    const portalDownload = await fetch(`${baseUrl}/api/client/documents/${pi.id}/download`, {
      headers: {
        "x-forwarded-proto": "https",
        "x-test-role": "client",
      },
    });
    assert.equal(portalDownload.status, 200);
    assert.match(portalDownload.headers.get("content-type") || "", /application\/pdf/);
    const pdfBytes = Buffer.from(await portalDownload.arrayBuffer());
    assert.equal(pdfBytes.subarray(0, 4).toString("ascii"), "%PDF");

    await new Promise((resolve) => setTimeout(resolve, 500));
  } finally {
    if (originalResendKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalResendKey;
    }
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  }
});

test("changing Import or Export SPA content invalidates its approval", () => {
  assert.equal(invalidatesProformaSpaApproval({
    docType: "SPA",
    enquirySide: "buy",
    contentChanged: true,
  }), true);
  assert.equal(invalidatesProformaSpaApproval({
    docType: "SPA",
    enquirySide: "sell",
    contentChanged: true,
  }), true);
  assert.equal(invalidatesProformaSpaApproval({
    docType: "SPA",
    enquirySide: "buy",
    contentChanged: false,
  }), false);
});

test("PI recipient validation routes Import to the supplier and Export to the buyer", () => {
  assert.deepEqual(validateProformaInvoiceRecipient({
    docType: "PI",
    enquirySide: "buy",
    recipientEmail: "supplier@example.com",
    buyerEmail: "buyer@example.com",
    sellerEmail: "Supplier@Example.com",
    clientId: "supplier-client",
    clientStatus: "approved",
    clientEmails: ["supplier@example.com"],
  }), { ok: true });

  const wrongParty = validateProformaInvoiceRecipient({
    docType: "PI",
    enquirySide: "buy",
    recipientEmail: "buyer@example.com",
    buyerEmail: "buyer@example.com",
    sellerEmail: "supplier@example.com",
    clientId: "buyer-client",
    clientStatus: "approved",
    clientEmails: ["buyer@example.com"],
  });
  assert.equal(wrongParty.ok, false);

  const noPortalClient = validateProformaInvoiceRecipient({
    docType: "PI",
    enquirySide: "buy",
    recipientEmail: "supplier@example.com",
    buyerEmail: "buyer@example.com",
    sellerEmail: "supplier@example.com",
  });
  assert.equal(noPortalClient.ok, false);

  const unapproved = validateProformaInvoiceRecipient({
    docType: "PI",
    enquirySide: "buy",
    recipientEmail: "supplier@example.com",
    buyerEmail: "buyer@example.com",
    sellerEmail: "supplier@example.com",
    clientId: "supplier-client",
    clientStatus: "pending",
    clientEmails: ["supplier@example.com"],
  });
  assert.equal(unapproved.ok, false);

  assert.deepEqual(validateProformaInvoiceRecipient({
    docType: "PI",
    enquirySide: "sell",
    recipientEmail: "buyer@example.com",
    buyerEmail: "buyer@example.com",
    sellerEmail: "supplier@example.com",
    clientId: "buyer-client",
    clientStatus: "approved",
    clientEmails: ["buyer@example.com"],
  }), { ok: true });

  const exportWrongParty = validateProformaInvoiceRecipient({
    docType: "PI",
    enquirySide: "sell",
    recipientEmail: "supplier@example.com",
    buyerEmail: "buyer@example.com",
    sellerEmail: "supplier@example.com",
    clientId: "buyer-client",
    clientStatus: "approved",
    clientEmails: ["buyer@example.com"],
  });
  assert.equal(exportWrongParty.ok, false);
});

test("SPA commercial terms map into a supplier-ready PI and use the CI-quality renderer", () => {
  const piData = buildProformaInvoiceDataFromSpa({
    spaNumber: "BUY/SELL-2008-001",
    quantity: "50,000 MT",
    price: "105.50",
    incoterm: "CFR",
    laycan: "15-30 September 2026",
    packing: "Bulk",
    validUntil: "30 September 2026",
  });
  assert.equal(piData.invoiceNumber, "PI-BUY/SELL-2008-001");
  assert.equal(piData.totalAmount, "5,275,000.00");
  assert.equal(piData.validUntil, "30 September 2026");

  const content = generateDocumentContent(
    "PI",
    undefined,
    { name: "Import Buyer FZE", address: "Dubai, UAE", contact: "buyer@example.com" },
    {
      name: "Export Supplier Ltd",
      address: "London, UK",
      contact: "supplier@example.com",
      bank: "Supplier Bank",
      swift: "SUPPGB2L",
    },
    {
      commodity: "Iron Ore Fines 62%",
      origin: "Brazil",
      quantity: "50,000 MT",
      price: "105.50",
      currency: "USD",
      incoterm: "CFR",
      laycan: "15-30 September 2026",
      loadingPort: "Port of Tubarao",
      dischargePort: "Qingdao Port",
      packing: "Bulk",
      paymentTerms: "Irrevocable DLC at sight",
      piData,
    },
  );

  assert.match(content, /^PROFORMA INVOICE/);
  assert.match(content, /SPA Reference: BUY\/SELL-2008-001/);
  assert.match(content, /Valid Until: 30 September 2026/);
  assert.match(content, /Delivery Term: CFR/);
  assert.match(content, /Shipment Window: 15-30 September 2026/);
  assert.match(content, /TOTAL PROFORMA VALUE: USD 5,275,000.00/);
  assert.equal(resolveBuilderKey(content, "PI"), "CI");

  const parsed = parseCiContent(content);
  assert.equal(parsed.invoiceNo, "PI-BUY/SELL-2008-001");
  assert.equal(parsed.sellerName, "Export Supplier Ltd");
  assert.equal(parsed.buyerName, "Import Buyer FZE");
  assert.equal(parsed.commodity, "Iron Ore Fines 62%");
  assert.equal(parsed.quantity, "50,000");
  assert.equal(parsed.unitPrice, "105.50");
  assert.equal(parsed.totalAmount, "5,275,000.00");
});

test("preparing a PI prefills an editable CI-style invoice without creating a document", async () => {
  const enquiry = await makeImportEnquiry();
  const spaNumber = `PREP/PI-${Date.now()}`;
  const parent = await storage.createDocument({
    docType: "SPA",
    title: `Prepare-only Import SPA ${Date.now()}`,
    status: "draft",
    content: generateDocumentContent(
      "SPA",
      undefined,
      { name: "Import Buyer FZE", address: "Dubai, UAE", contact: "buyer@example.com" },
      { name: "Export Supplier Ltd", address: "London, UK", contact: "supplier@example.com" },
      {
        commodity: "Iron Ore Fines 62%",
        origin: "Brazil",
        quantity: "50,000 MT",
        price: "105.50",
        currency: "USD",
        incoterm: "CFR",
        laycan: "15-30 September 2026",
        loadingPort: "Port of Tubarao",
        dischargePort: "Qingdao Port",
        packing: "Bulk",
        paymentTerms: "Irrevocable DLC at sight",
        dealRecapNumber: spaNumber,
      },
    ),
    enquiryRef: enquiry.enquiryRef,
    dealRecapNumber: spaNumber,
    buyerEmail: "buyer@example.com",
    sellerEmail: "supplier@example.com",
    adminChecks: completeChecks,
  } as any);
  createdIds.push(parent.id);

  const before = (await storage.getDocuments()).filter(
    (doc) => doc.parentDocId === parent.id && doc.docType === "PI",
  );
  const result = await prepareProformaInvoiceForParent(parent, true);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.preparation.sourceRevision, buildProformaInvoiceSourceRevision(parent));
  assert.equal(result.preparation.fields.sellerName, "Export Supplier Ltd");
  assert.equal(result.preparation.fields.buyerName, "Import Buyer FZE");
  assert.equal(result.preparation.fields.commodity, "Iron Ore Fines 62%");
  assert.equal(result.preparation.fields.totalAmount, "5,275,000.00");
  assert.match(result.preparation.content, /^PROFORMA INVOICE/);

  const after = (await storage.getDocuments()).filter(
    (doc) => doc.parentDocId === parent.id && doc.docType === "PI",
  );
  assert.equal(before.length, 0);
  assert.equal(after.length, 0);
});

test("Create PI can prepare and create DOCX/PDF before SPA checklist review", async () => {
  const enquiry = await makeImportEnquiry();
  const parent = await storage.createDocument({
    docType: "SPA",
    title: `Unreviewed Import SPA ${Date.now()}`,
    status: "pending_review",
    content: generateDocumentContent(
      "SPA",
      undefined,
      { name: "Import Buyer FZE", contact: "buyer@example.com" },
      { name: "Export Supplier Ltd", contact: "supplier@example.com" },
      {
        commodity: "Copper Cathodes",
        quantity: "1,000 MT",
        price: "9,000",
        currency: "USD",
        dealRecapNumber: `UNREVIEWED/PI-${Date.now()}`,
      },
    ),
    enquiryRef: enquiry.enquiryRef,
    buyerEmail: "buyer@example.com",
    sellerEmail: "supplier@example.com",
    adminChecks: [],
  } as any);
  createdIds.push(parent.id);

  const preparation = await prepareProformaInvoiceForParent(parent, true);
  assert.equal(preparation.ok, true);
  if (!preparation.ok) return;
  assert.equal(preparation.preparation.fields.commodity, "Copper Cathodes");
  assert.match(preparation.preparation.content, /^PROFORMA INVOICE/);

  const created = await createNextDocumentForParent(parent, "PI", true, {
    sourceRevision: preparation.preparation.sourceRevision,
    preparedFields: preparation.preparation.fields,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  createdIds.push(created.doc.id);
  if (created.doc.docxPath) generatedFiles.add(created.doc.docxPath);
  if (created.doc.pdfPath) generatedFiles.add(created.doc.pdfPath);
  assert.equal(fs.existsSync(created.doc.docxPath), true);
  assert.equal(fs.existsSync(created.doc.pdfPath), true);

  const after = (await storage.getDocuments()).filter(
    (doc) => doc.parentDocId === parent.id && doc.docType === "PI",
  );
  assert.equal(after.length, 1);
});

test("PI preparation ignores fields outside its invoice allowlist", () => {
  const fields = sanitizePreparedProformaInvoiceFields({
    title: "Reviewed PI",
    invoiceNumber: "PI-001",
    sellerName: "Seller",
    buyerName: "Buyer",
    commodity: "Copper",
    unexpectedField: "must never reach the document",
    parentDocId: "must never alter the parent link",
    status: "sent",
  });
  assert.equal(fields.title, "Reviewed PI");
  assert.equal(fields.invoiceNumber, "PI-001");
  assert.equal(fields.sellerName, "Seller");
  assert.equal("unexpectedField" in fields, false);
  assert.equal("parentDocId" in fields, false);
  assert.equal("status" in fields, false);
});

test("final PI creation can confirm the exact Commercial Invoice fields that were reviewed", () => {
  const fields = sanitizePreparedProformaInvoiceFields({
    title: "Reviewed PI",
    invoiceNumber: "PI-001",
    sellerName: "Seller",
    buyerName: "Buyer",
    commodity: "Copper",
    quantity: "1,000 MT",
    price: "9,000",
    currency: "USD",
  });
  const token = buildProformaInvoicePreviewToken("spa-parent", "spa-revision", fields, "test-secret");
  assert.equal(
    validateProformaInvoicePreviewToken("spa-parent", "spa-revision", fields, token, "test-secret"),
    true,
  );
  assert.equal(
    validateProformaInvoicePreviewToken(
      "spa-parent",
      "spa-revision",
      { ...fields, price: "9,100" },
      token,
      "test-secret",
    ),
    false,
  );
});

test("reviewed PI fields create the linked child and stale SPA revisions create nothing", async () => {
  const enquiry = await makeImportEnquiry();
  const parent = await storage.createDocument({
    docType: "SPA",
    title: `Editable Import SPA ${Date.now()}`,
    status: "draft",
    content: generateDocumentContent(
      "SPA",
      undefined,
      { name: "Import Buyer FZE", address: "Dubai, UAE", contact: "buyer@example.com" },
      { name: "Export Supplier Ltd", address: "London, UK", contact: "supplier@example.com" },
      {
        commodity: "Iron Ore",
        origin: "Brazil",
        quantity: "1,000 MT",
        price: "100",
        currency: "USD",
        incoterm: "CFR",
        paymentTerms: "DLC at sight",
        dealRecapNumber: `EDIT/PI-${Date.now()}`,
      },
    ),
    enquiryRef: enquiry.enquiryRef,
    buyerEmail: "buyer@example.com",
    sellerEmail: "supplier@example.com",
    adminChecks: completeChecks,
  } as any);
  createdIds.push(parent.id);
  const prepared = await prepareProformaInvoiceForParent(parent, true);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const editedFields = {
    ...prepared.preparation.fields,
    title: "Reviewed supplier Proforma Invoice",
    invoiceNumber: "PI-REVIEWED-001",
    sellerBank: "Reviewed Supplier Bank",
    sellerSwift: "REVIEWED1",
    quantity: "1,250 MT",
    price: "110",
    totalAmount: "137,500.00",
    paymentTerms: "Irrevocable DLC payable at sight after compliant documents.",
  };
  const created = await createNextDocumentForParent(parent, "PI", true, {
    sourceRevision: prepared.preparation.sourceRevision,
    preparedFields: editedFields,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  createdIds.push(created.doc.id);
  if (created.doc.docxPath) generatedFiles.add(created.doc.docxPath);
  if (created.doc.pdfPath) generatedFiles.add(created.doc.pdfPath);
  assert.ok(created.doc.docxPath, "PI creation must persist a DOCX path");
  assert.ok(created.doc.pdfPath, "PI creation must persist a PDF path");
  assert.equal(fs.existsSync(created.doc.docxPath), true);
  assert.equal(fs.existsSync(created.doc.pdfPath), true);
  assert.equal(fs.readFileSync(created.doc.docxPath).subarray(0, 2).toString("ascii"), "PK");
  assert.equal(fs.readFileSync(created.doc.pdfPath).subarray(0, 4).toString("ascii"), "%PDF");
  assert.equal(created.doc.title, "Reviewed supplier Proforma Invoice");
  assert.match(created.doc.content, /Invoice No\.: PI-REVIEWED-001/);
  assert.match(created.doc.content, /Bank: Reviewed Supplier Bank/);
  assert.match(created.doc.content, /TOTAL PROFORMA VALUE: USD 137,500\.00/);
  assert.match(created.doc.content, /Irrevocable DLC payable at sight/);

  const staleParent = await storage.createDocument({
    ...parent,
    id: undefined,
    title: `Stale prepared SPA ${Date.now()}`,
    content: parent.content,
  } as any);
  createdIds.push(staleParent.id);
  const stalePrepared = await prepareProformaInvoiceForParent(staleParent, true);
  assert.equal(stalePrepared.ok, true);
  if (!stalePrepared.ok) return;
  await storage.updateDocument(staleParent.id, {
    content: `${staleParent.content}\nUpdated commercial term`,
  });
  const freshParent = await storage.getDocumentById(staleParent.id);
  assert.ok(freshParent);
  const staleResult = await createNextDocumentForParent(freshParent, "PI", true, {
    sourceRevision: stalePrepared.preparation.sourceRevision,
    preparedFields: stalePrepared.preparation.fields,
  });
  assert.equal(staleResult.ok, false);
  if (!staleResult.ok) assert.match(staleResult.message, /SPA changed while the Proforma Invoice was being prepared/i);
  const staleChildren = (await storage.getDocuments()).filter(
    (doc) => doc.parentDocId === staleParent.id && doc.docType === "PI",
  );
  assert.equal(staleChildren.length, 0);
});

test("concurrent PI derivation creates one child and signed output labels the seller issuer", async () => {
  const enquiry = await makeImportEnquiry();
  const spaContent = generateDocumentContent(
    "SPA",
    undefined,
    { name: "Import Buyer FZE", address: "Dubai, UAE", contact: "buyer@example.com" },
    { name: "Export Supplier Ltd", address: "London, UK", contact: "supplier@example.com" },
    {
      commodity: "Iron Ore Fines 62%",
      origin: "Brazil",
      quantity: "50,000 MT",
      price: "105.50",
      currency: "USD",
      incoterm: "CFR",
      laycan: "15-30 September 2026",
      loadingPort: "Port of Tubarao",
      dischargePort: "Qingdao Port",
      packing: "Bulk",
      paymentTerms: "Irrevocable DLC at sight",
      dealRecapNumber: `BUY/SELL-${Date.now()}`,
    },
  );
  const parent = await storage.createDocument({
    docType: "SPA",
    title: `Import SPA PI test ${Date.now()}`,
    status: "draft",
    content: spaContent,
    enquiryRef: enquiry.enquiryRef,
    dealRecapNumber: `BUY/SELL-${Date.now()}`,
    buyerEmail: "buyer@example.com",
    sellerEmail: "supplier@example.com",
    adminChecks: completeChecks,
  } as any);
  createdIds.push(parent.id);

  const [first, second] = await Promise.all([
    deriveNextDocument(parent, "PI", true, true),
    deriveNextDocument(parent, "PI", true, true),
  ]);
  const winners = [first, second].filter(Boolean);
  assert.equal(winners.length, 1);
  const pi = winners[0]!;
  createdIds.push(pi.id);
  assert.equal(pi.parentDocId, parent.id);
  assert.equal(pi.docType, "PI");
  assert.equal(pi.sellerEmail, "supplier@example.com");
  assert.match(pi.content, /PROFORMA INVOICE/);
  assert.match(pi.content, /TOTAL PROFORMA VALUE: USD 5,275,000.00/);
  if (pi.docxPath) generatedFiles.add(pi.docxPath);
  if (pi.pdfPath) generatedFiles.add(pi.pdfPath);

  const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const signed = await regenerateWithSignatures(
    pi.id,
    pi.title,
    pi.content,
    tinyPng,
    undefined,
    "Supplier Signer",
    undefined,
    new Date("2026-08-20T10:00:00Z"),
    undefined,
    "PI",
  );
  generatedFiles.add(signed.docxPath);
  generatedFiles.add(signed.pdfPath);
  const pdfText = execFileSync("pdftotext", [signed.pdfPath, "-"], { encoding: "utf8" });
  assert.match(pdfText, /PROFORMA INVOICE/);
  assert.match(pdfText, /DESCR\. OF GOODS AND \/ OR SERVICES/);
  assert.match(pdfText, /Amount Chargeable \(In Words\)/);
  assert.match(pdfText, /Our Bankers are:/);
  assert.match(pdfText, /FOR & ON BEHALF OF SELLER \/ ISSUER/);
  assert.match(pdfText, /Supplier Signer/);
});

test("long PI fields continue across PDF pages without truncation", async () => {
  const sellerAddress = `SELLER ADDRESS BEGIN ${"International warehouse and logistics district, ".repeat(20)} SELLER ADDRESS END`;
  const buyerAddress = `BUYER ADDRESS BEGIN ${"Registered commercial and receiving office, ".repeat(20)} BUYER ADDRESS END`;
  const paymentTerms = `PAYMENT TERMS BEGIN ${"Payment against a compliant documentary presentation under the agreed credit instrument. ".repeat(42)} PAYMENT TERMS END`;
  const spaReference = `SPA-REFERENCE-BEGIN-${"X".repeat(700)}-SPA-REFERENCE-END`;
  const bankDetails = `BANK DETAILS BEGIN ${"International settlement and correspondent banking department, ".repeat(16)} BANK DETAILS END`;
  const content = generateDocumentContent(
    "PI",
    undefined,
    { name: "Long Field Buyer LLC", address: buyerAddress, contact: "buyer@example.com" },
    {
      name: "Long Field Seller FZE",
      address: sellerAddress,
      contact: "seller@example.com",
      bank: bankDetails,
      swift: "LONGGB2L",
    },
    {
      commodity: "Refined Sunflower Oil",
      origin: "Ukraine",
      quantity: "27,600",
      price: "1,050.00",
      currency: "USD",
      incoterm: "CIF",
      laycan: "Shipment in multiple lots within sixty days",
      loadingPort: "Port of Constanta",
      dischargePort: "Port of Djibouti",
      packing: "Flexitanks in containers",
      paymentTerms,
      validity: "+/- 10%",
      piData: {
        invoiceNumber: "PI-LONG-FIELDS-001",
        spaNumber: spaReference,
        invoiceDate: "21 August 2026",
        validUntil: "20 September 2026",
        deliveryTerm: "CIF",
        shipmentWindow: "Shipment in multiple lots within sixty days",
        packing: "Flexitanks in containers",
        totalAmount: "28,980,000.00",
      },
    },
  );
  const output = await regenerateWithSignatures(
    `pi-pagination-${Date.now()}`,
    "Long PI pagination fixture",
    content,
    tinyPng,
    undefined,
    "Supplier Signer",
    undefined,
    new Date("2026-08-21T08:00:00Z"),
    undefined,
    "PI",
  );
  generatedFiles.add(output.docxPath);
  generatedFiles.add(output.pdfPath);

  const pdfText = execFileSync("pdftotext", [output.pdfPath, "-"], { encoding: "utf8" });
  const normalizedPdf = pdfText.replace(/\s+/g, " ");
  assert.match(normalizedPdf, /SELLER ADDRESS BEGIN .* SELLER ADDRESS END/);
  assert.match(normalizedPdf, /BUYER ADDRESS BEGIN .* BUYER ADDRESS END/);
  assert.match(normalizedPdf, /PAYMENT TERMS BEGIN .* PAYMENT TERMS END/);
  assert.match(normalizedPdf, /SPA-REFERENCE-BEGIN-.*-SPA-REFERENCE-END/);
  assert.match(normalizedPdf, /BANK DETAILS BEGIN .* BANK DETAILS END/);
  const pdfInfo = execFileSync("pdfinfo", [output.pdfPath], { encoding: "utf8" });
  const pages = Number(pdfInfo.match(/^Pages:\s+(\d+)$/m)?.[1] || 0);
  assert.ok(pages >= 2, `expected a multi-page invoice, got ${pages} page(s)`);
  assert.equal((pdfText.match(/PROFORMA INVOICE/g) || []).length, pages);

  const docxXml = execFileSync("unzip", ["-p", output.docxPath, "word/document.xml"], { encoding: "utf8" })
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  assert.match(docxXml, /SELLER ADDRESS BEGIN .* SELLER ADDRESS END/);
  assert.match(docxXml, /PAYMENT TERMS BEGIN .* PAYMENT TERMS END/);
  assert.match(docxXml, /SPA-REFERENCE-BEGIN-.*-SPA-REFERENCE-END/);
  assert.match(docxXml, /BANK DETAILS BEGIN .* BANK DETAILS END/);
});

test("SPA checklist changes do not block atomic PI creation", async () => {
  const enquiry = await makeImportEnquiry();
  const parent = await storage.createDocument({
    docType: "SPA",
    title: `Stale Import SPA PI test ${Date.now()}`,
    status: "draft",
    content: "SALES AND PURCHASE AGREEMENT\nCommodity: Iron Ore\nQuantity: 1,000 MT\nContract Price: USD 100 per MT",
    enquiryRef: enquiry.enquiryRef,
    buyerEmail: "buyer@example.com",
    sellerEmail: "supplier@example.com",
    adminChecks: completeChecks,
  } as any);
  createdIds.push(parent.id);

  await storage.updateDocument(parent.id, {
    adminChecks: [{ label: completeChecks[0].label, checked: true }],
  } as any);

  const result = await createNextDocumentForParent(parent, "PI", true);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  createdIds.push(result.doc.id);
  if (result.doc.docxPath) generatedFiles.add(result.doc.docxPath);
  if (result.doc.pdfPath) generatedFiles.add(result.doc.pdfPath);
  const children = (await storage.getDocuments())
    .filter((doc) => doc.parentDocId === parent.id && doc.docType === "PI");
  assert.equal(children.length, 1);
});

test("atomic PI creation rejects content built from a stale SPA snapshot", async () => {
  const enquiry = await makeImportEnquiry();
  const parent = await storage.createDocument({
    docType: "SPA",
    title: `Stale-content Import SPA PI test ${Date.now()}`,
    status: "draft",
    content: "SALES AND PURCHASE AGREEMENT\nCommodity: Iron Ore\nQuantity: 1,000 MT\nContract Price: USD 100 per MT",
    enquiryRef: enquiry.enquiryRef,
    buyerEmail: "buyer@example.com",
    sellerEmail: "supplier@example.com",
    adminChecks: completeChecks,
  } as any);
  createdIds.push(parent.id);

  await storage.updateDocument(parent.id, {
    content: "SALES AND PURCHASE AGREEMENT\nCommodity: Iron Ore\nQuantity: 2,000 MT\nContract Price: USD 95 per MT",
  } as any);

  const result = await createNextDocumentForParent(parent, "PI", true);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
    assert.match(result.message, /changed while the Proforma Invoice was being prepared/i);
  }
  const children = (await storage.getDocuments())
    .filter((doc) => doc.parentDocId === parent.id && doc.docType === "PI");
  assert.equal(children.length, 0);
});

test("an approved Import SPA amendment resets review and cannot replace a SPA that already has a PI", async () => {
  const enquiry = await makeImportEnquiry();
  const parent = await storage.createDocument({
    docType: "SPA",
    title: `Import SPA amendment PI test ${Date.now()}`,
    status: "draft",
    content: "Original approved SPA content",
    pendingContent: "Amended SPA content",
    enquiryRef: enquiry.enquiryRef,
    adminChecks: completeChecks,
  } as any);
  createdIds.push(parent.id);

  const review = await storage.reviewDocumentAmendmentAtomically(
    parent.id,
    "approve",
    undefined,
    {
      invalidateAdminReview: true,
      resetAdminChecks: buildAdminChecks("SPA"),
      disallowChildDocTypes: ["PI"],
    },
  );
  assert.equal(review.ok, true);
  if (!review.ok) return;
  assert.equal(review.document.content, "Amended SPA content");
  assert.equal(review.document.status, "pending_review");
  assert.equal(hasCompletedAdminChecklist("SPA", review.document.adminChecks), false);

  const pi = await storage.createDocument({
    docType: "PI",
    title: "Existing Proforma Invoice",
    status: "draft",
    content: "PROFORMA INVOICE",
    parentDocId: parent.id,
  } as any);
  createdIds.push(pi.id);

  const blockedEdit = await storage.updateDocumentWithSpaAddendumGuard(
    parent.id,
    {
      content: "Further changed SPA content",
      status: "pending_review",
      adminChecks: buildAdminChecks("SPA"),
    } as any,
    "content",
    { disallowChildDocTypes: ["PI"] },
  );
  assert.equal(blockedEdit.ok, false);
  if (!blockedEdit.ok) assert.equal(blockedEdit.reason, "child_document_exists");
});