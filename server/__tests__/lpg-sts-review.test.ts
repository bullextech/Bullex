import test, { after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { LPG_STS_REVIEW_POINTS, getLpgStsReviewMetadata, isLpgStsSpa } from "@shared/lpg-sts";
import {
  assertLpgStsCleared, lpgStsFingerprint, lpgStsReviewState, LpgStsReviewError,
  protectLpgStsMutation, sanitizeLpgStsCreation, validateLpgStsReviewPoints, withLpgStsMetadata,
  projectLpgStsDocumentResponse, lpgStsReviewPage,
} from "../lpg-sts-review";
import { pool, storage } from "../storage";
import {
  createNextDocumentForParent, deriveNextDocument, finalizeDocumentWithSignatures,
  hasCompletedAdminChecklist, registerRoutes,
} from "../routes";

const ids: string[] = [];
const points = LPG_STS_REVIEW_POINTS.map(({ id }) => ({
  id, decision: "approved" as const, note: `Transaction-specific legal approval of ${id}.`,
}));
const content = "SALES AND PURCHASE AGREEMENT\nLPG SPA — STS Basis\nSPA No: TEST-169\nPrice: CP + 70; provisional CP + 50";
const base = { id: "transaction-a", docType: "SPA", title: "Review regression", content };
const clearanceFor = (doc: typeof base) => ({
  fingerprint: lpgStsFingerprint(doc), reviewedBy: "test-admin",
  reviewedAt: new Date().toISOString(), points,
});
async function draft(text = content) {
  const doc = await storage.createDocument({ docType: "SPA", title: "Task169 regression", content: text });
  ids.push(doc.id);
  return doc;
}
after(async () => {
  for (const id of ids.reverse()) await storage.deleteDocument(id);
  await pool.end();
});

test("every review point requires a distinct decision and nonblank explanation", () => {
  assert.equal(validateLpgStsReviewPoints(points), true);
  assert.equal(validateLpgStsReviewPoints(points.slice(1)), false);
  assert.equal(validateLpgStsReviewPoints([...points.slice(1), points[1]]), false);
  assert.equal(validateLpgStsReviewPoints(points.map(p => ({ ...p, note: " " }))), false);
  assert.equal(validateLpgStsReviewPoints(points.map(p => ({ ...p, decision: true }))), false);
});

test("clearance binds exact transaction identity, content and parties; signatures do not invalidate it", () => {
  const approved = { ...base, adminChecks: withLpgStsMetadata([], clearanceFor(base)) };
  assert.equal(lpgStsReviewState(approved).cleared, true);
  for (const change of [
    { id: "transaction-b" }, { title: "another title" }, { content: content + "\nchanged" },
    { buyerEmail: "other@example.com" }, { enquiryRef: "other-enquiry" },
  ]) assert.equal(lpgStsReviewState({ ...approved, ...change }).cleared, false);
  assert.equal(lpgStsReviewState({ ...approved, buyerSignature: "signed" } as any).cleared, true);
  assert.equal(clearanceFor(base).fingerprint.length, 64);
});

test("submitted reserved metadata cannot approve creations or generic mutations", () => {
  const forgedHistory = [{
    type: "invalidation" as const,
    fingerprint: "forged-old", occurredAt: new Date().toISOString(),
    reason: "forged", nextFingerprint: "forged-next",
  }];
  const forged = {
    ...base,
    adminChecks: withLpgStsMetadata([], clearanceFor(base), forgedHistory),
  };
  const created = sanitizeLpgStsCreation(forged);
  assert.equal(getLpgStsReviewMetadata(created)?.clearance, null);
  assert.deepEqual(getLpgStsReviewMetadata(created)?.history, []);
  const mutation = protectLpgStsMutation(created, { adminChecks: forged.adminChecks });
  assert.equal(getLpgStsReviewMetadata(mutation)?.clearance, null);
  assert.deepEqual(getLpgStsReviewMetadata(mutation)?.history, []);
  assert.throws(() => assertLpgStsCleared({ ...created, ...mutation }), LpgStsReviewError);
  const standard = sanitizeLpgStsCreation({ ...forged, content: "Standard SPA" });
  assert.equal(isLpgStsSpa(standard), false);
  assert.equal(lpgStsReviewState(standard).cleared, true);
});

test("selected variant remains tracked even if all identifying text was edited away", async () => {
  const doc = await storage.createDocument({
    docType: "SPA", title: "Edited LPG source", content: "Custom commercial agreement",
  }, { lpgSts: true });
  ids.push(doc.id);
  assert.equal(isLpgStsSpa(doc), true);
  await assert.rejects(storage.updateDocument(doc.id, { buyerSignature: "forged" }), LpgStsReviewError);
});

test("legacy LPG drafts block buyer/seller signing, final status, finalization and both bank chains", async () => {
  const doc = await draft();
  for (const patch of [{ buyerSignature: "signed" }, { sellerSignature: "signed" }, { status: "final" }]) {
    await assert.rejects(storage.updateDocument(doc.id, patch), LpgStsReviewError);
    await assert.rejects(storage.updateDocumentWithSpaAddendumGuard(doc.id, patch, "execution"), LpgStsReviewError);
  }
  const final = await finalizeDocumentWithSignatures({ ...doc, buyerSignature: "legacy-signature" });
  assert.equal(final.ok, false);
  for (const type of ["DLC_MT700", "PBG_MT760"]) {
    assert.equal((await createNextDocumentForParent(doc, type, true)).ok, false);
    await assert.rejects(deriveNextDocument(doc, type, true, true), LpgStsReviewError);
    await assert.rejects(storage.createDocumentIfNoChild({
      docType: type, title: "Blocked bank draft", parentDocId: doc.id, content: "Bank draft",
    }, doc.id, type), LpgStsReviewError);
    await assert.rejects(storage.createDocument({
      docType: type, title: "Blocked direct bank draft", parentDocId: doc.id, content: "Bank draft",
    }), LpgStsReviewError);
  }
  assert.equal((await storage.getDocumentById(doc.id))?.buyerSignature, null);
});

test("valid admin clearance enables signing and atomic bank drafts, and generic review cannot replace it", async () => {
  const doc = await draft();
  const approved = await storage.clearLpgStsReview(doc.id, doc.content!, points, "regression-admin", lpgStsFingerprint(doc));
  assert.equal(lpgStsReviewState(approved).cleared, true);
  const rewritten = await storage.updateDocument(doc.id, {
    adminChecks: withLpgStsMetadata([{ label: "generic", checked: true }], {
      ...clearanceFor(base), reviewedBy: "forged",
    }),
  });
  assert.equal(getLpgStsReviewMetadata(rewritten)?.clearance?.reviewedBy, "regression-admin");
  const signed = await storage.updateDocumentWithSpaAddendumGuard(doc.id, { buyerSignature: "signed" }, "execution", { expectedContent: doc.content });
  assert.equal(signed.ok, true);
  for (const type of ["DLC_MT700", "PBG_MT760"]) {
    const child = await storage.createDocumentIfNoChild({
      docType: type, title: "Cleared bank draft", parentDocId: doc.id, content: "Bank draft",
    }, doc.id, type, { parentDocType: "SPA", expectedParentContent: doc.content });
    assert.ok(child);
    ids.push(child.id);
  }
});

test("full-text edits including marker removal revoke clearance and old signatures; replay cannot restore", async () => {
  const doc = await draft();
  const approved = await storage.clearLpgStsReview(doc.id, doc.content!, points, "regression-admin", lpgStsFingerprint(doc));
  await storage.updateDocument(doc.id, { buyerSignature: "signed" });
  const edited = await storage.updateDocument(doc.id, {
    content: "Changed text with LPG marker removed", adminChecks: [],
  });
  assert.equal(isLpgStsSpa(edited), true);
  assert.equal(getLpgStsReviewMetadata(edited)?.clearance, null);
  assert.equal(edited.buyerSignature, null);
  const replay = await storage.updateDocument(doc.id, { content: doc.content, adminChecks: approved.adminChecks });
  assert.equal(lpgStsReviewState(replay).cleared, false);
  await assert.rejects(storage.updateDocument(doc.id, { docType: "FCO", buyerSignature: "signed" }), LpgStsReviewError);
});

test("clearance audit retains repeated reviews and invalidations without resurrecting reverted terms", async () => {
  const doc = await draft();
  const first = await storage.clearLpgStsReview(
    doc.id, doc.content!, points, "first-admin", lpgStsFingerprint(doc),
  );
  const second = await storage.clearLpgStsReview(
    doc.id, doc.content!, points, "second-admin", lpgStsFingerprint(first),
  );
  assert.deepEqual(
    lpgStsReviewState(second).history.map(entry => entry.type),
    ["clearance", "clearance"],
  );

  const changed = await storage.updateDocument(doc.id, {
    title: "Changed title", content: `${doc.content}\nChanged liability`,
    adminChecks: withLpgStsMetadata([], clearanceFor(base), [{
      type: "invalidation", fingerprint: "forged", occurredAt: new Date().toISOString(),
      reason: "forged", nextFingerprint: "forged",
    }]),
  });
  const changedState = lpgStsReviewState(changed);
  assert.equal(changedState.cleared, false);
  assert.deepEqual(changedState.history.map(entry => entry.type), [
    "clearance", "clearance", "invalidation",
  ]);
  const invalidation = changedState.history[2];
  assert.equal(invalidation.type, "invalidation");
  if (invalidation.type === "invalidation") {
    assert.equal(invalidation.fingerprint, lpgStsFingerprint(doc));
    assert.equal(invalidation.nextFingerprint, lpgStsFingerprint(changed));
    assert.match(invalidation.reason, /title/);
    assert.match(invalidation.reason, /content/);
  }
  assert.doesNotMatch(JSON.stringify(changedState.history), /forged/);

  const reverted = await storage.updateDocument(doc.id, {
    title: doc.title, content: doc.content,
  });
  assert.equal(lpgStsReviewState(reverted).cleared, false);
  assert.deepEqual(lpgStsReviewState(reverted).history, changedState.history);
});

test("legacy current clearance is backfilled once before mutation or another review", async () => {
  const legacyClearance = clearanceFor(base);
  const legacy = {
    ...base,
    adminChecks: [{ key: "lpgStsReview", clearance: legacyClearance }],
  };
  assert.deepEqual(lpgStsReviewState(legacy).history, []);

  const harmless = protectLpgStsMutation(legacy, { status: "draft" });
  assert.deepEqual(
    getLpgStsReviewMetadata(harmless)?.history,
    [{ type: "clearance", ...legacyClearance }],
  );
  const changed = protectLpgStsMutation(
    { ...legacy, ...harmless },
    { content: `${content}\nLegacy changed` },
  );
  assert.deepEqual(
    getLpgStsReviewMetadata(changed)?.history?.map(entry => entry.type),
    ["clearance", "invalidation"],
  );
});

test("concurrent successful reviews append both events and stale review appends nothing", async () => {
  const doc = await draft();
  await Promise.all([
    storage.clearLpgStsReview(doc.id, doc.content!, points, "parallel-a", lpgStsFingerprint(doc)),
    storage.clearLpgStsReview(doc.id, doc.content!, points, "parallel-b", lpgStsFingerprint(doc)),
  ]);
  const reviewed = (await storage.getDocumentById(doc.id))!;
  const before = lpgStsReviewState(reviewed).history;
  assert.deepEqual(new Set(before.map(entry => entry.type === "clearance" && entry.reviewedBy)), new Set(["parallel-a", "parallel-b"]));

  const changed = await storage.updateDocument(doc.id, { content: `${doc.content}\nConcurrent edit` });
  await assert.rejects(storage.clearLpgStsReview(
    doc.id, doc.content!, points, "stale-admin", lpgStsFingerprint(doc),
  ), /changed during review/);
  const after = lpgStsReviewState((await storage.getDocumentById(doc.id))!).history;
  assert.equal(after.length, before.length + 1);
  assert.equal(after.at(-1)?.type, "invalidation");
  assert.equal(after.some(entry => entry.type === "clearance" && entry.reviewedBy === "stale-admin"), false);
  assert.equal(lpgStsReviewState(changed).cleared, false);
});

test("approved amendments revoke review; proposed or rejected amendments leave live clearance intact", async () => {
  const doc = await draft();
  await storage.clearLpgStsReview(doc.id, doc.content!, points, "regression-admin", lpgStsFingerprint(doc));
  const staged = await storage.updateDocument(doc.id, { pendingContent: content + "\nNew liability text" });
  assert.equal(lpgStsReviewState(staged).cleared, true);
  const rejected = await storage.reviewDocumentAmendmentAtomically(doc.id, "reject");
  assert.equal(rejected.ok && lpgStsReviewState(rejected.document).cleared, true);
  await storage.updateDocument(doc.id, { pendingContent: content + "\nNew liability text" });
  const changed = await storage.reviewDocumentAmendmentAtomically(doc.id, "approve", undefined, {
    invalidateAdminReview: true, resetAdminChecks: [],
  });
  assert.equal(changed.ok, true);
  if (changed.ok) assert.equal(lpgStsReviewState(changed.document).cleared, false);
});

test("review/edit and sign/edit races cannot leave clearance or signatures for changed terms", async () => {
  const doc = await draft();
  await Promise.allSettled([
    storage.clearLpgStsReview(doc.id, doc.content!, points, "regression-admin", lpgStsFingerprint(doc)),
    storage.updateDocument(doc.id, { content: content + "\nEdited concurrently" }),
  ]);
  const changed = (await storage.getDocumentById(doc.id))!;
  assert.equal(lpgStsReviewState(changed).cleared, false);
  await assert.rejects(storage.clearLpgStsReview(doc.id, doc.content!, points, "regression-admin", lpgStsFingerprint(doc)), /changed during review/);
  await storage.clearLpgStsReview(doc.id, changed.content!, points, "regression-admin", lpgStsFingerprint(changed));
  await Promise.allSettled([
    storage.updateDocumentWithSpaAddendumGuard(doc.id, { sellerSignature: "signed" }, "execution", { expectedContent: changed.content }),
    storage.updateDocument(doc.id, { content: changed.content + "\nEdited again" }),
  ]);
  const latest = (await storage.getDocumentById(doc.id))!;
  assert.equal(latest.sellerSignature, null);
  assert.equal(lpgStsReviewState(latest).cleared, false);
  await storage.clearLpgStsReview(doc.id, latest.content!, points, "regression-admin", lpgStsFingerprint(latest));
  const staleChild = await storage.createDocumentIfNoChild({
    docType: "DLC_MT700", title: "Stale derived draft", content: "Old terms", parentDocId: doc.id,
  }, doc.id, "DLC_MT700", { parentDocType: "SPA", expectedParentContent: changed.content });
  assert.equal(staleChild, null, "re-clearing changed terms must not permit stale bank generation");
  await assert.rejects(storage.updateDocument(doc.id, { status: "final" }, changed.content), /changed during finalization/);
});

test("standard SPA signing/final status and generic checklist remain unchanged", async () => {
  const doc = await draft("Standard SPA terms");
  const signed = await storage.updateDocument(doc.id, { buyerSignature: "signed", status: "final" });
  assert.equal(signed.status, "final");
  assert.equal(isLpgStsSpa(signed), false);
  assert.equal(hasCompletedAdminChecklist("SPA", []), false);
});

test("non-admin projection removes private review from lists, nested children and mutation results", () => {
  const approved = { ...base, adminChecks: withLpgStsMetadata([{ label: "Generic check", checked: true }], clearanceFor(base)) };
  const value = projectLpgStsDocumentResponse({
    documents: [approved], ...approved, autoCreatedDoc: approved, createdAt: new Date("2026-01-01"),
  });
  for (const doc of [value, value.documents[0], value.autoCreatedDoc]) {
    assert.deepEqual(doc.lpgStsReview, { required: true, cleared: true });
    assert.deepEqual(doc.adminChecks, [{ label: "Generic check", checked: true }]);
  }
  assert.doesNotMatch(JSON.stringify(value), /reviewedBy|reviewedAt|Transaction-specific legal|fingerprint/);
  assert.equal(value.createdAt.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.ok(getLpgStsReviewMetadata(approved)?.clearance, "projection never mutates administrator/storage data");
});

test("large audit remains accessible in stable bounded pages without growing document payloads", () => {
  const history = Array.from({ length: 1003 }, (_, index) => ({
    type: "invalidation" as const, fingerprint: `old-${index}`, nextFingerprint: `new-${index}`,
    occurredAt: "2026-10-03T00:00:00Z", reason: `Event ${index}`,
  }));
  const doc = { ...base, content: "Marker removed", adminChecks: withLpgStsMetadata([], null, history) };
  const small = { ...doc, adminChecks: withLpgStsMetadata([], null, []) };
  assert.equal(JSON.stringify(projectLpgStsDocumentResponse([doc])), JSON.stringify(projectLpgStsDocumentResponse([small])));
  assert.deepEqual(projectLpgStsDocumentResponse(doc).lpgStsReview, { required: true, cleared: false });
  let page = lpgStsReviewPage(doc);
  const found = [...page.history];
  // Append after opening page one; earlier exclusive offsets remain stable.
  const appended = { ...doc, adminChecks: withLpgStsMetadata([], null, [...history, history[0]]) };
  while (page.nextBefore !== null) {
    page = lpgStsReviewPage(appended, page.nextBefore);
    assert.ok(page.history.length <= 20);
    found.unshift(...page.history);
  }
  assert.deepEqual(found, history);
  assert.deepEqual(lpgStsReviewPage(doc, 0).history, []);
  assert.equal(getLpgStsReviewMetadata(doc)?.history?.length, 1003);
  const legacy = { ...base, adminChecks: [{ key: "lpgStsReview", clearance: clearanceFor(base) }] };
  assert.equal(lpgStsReviewPage(legacy).history.length, 1);
});

test("accept/edit serialization cannot accept changed LPG terms, while rejection remains available", async () => {
  const doc = await draft();
  await storage.updateDocument(doc.id, { status: "sent", recipientResponse: "pending" });
  const acceptance = { status: "accepted", recipientResponse: "accepted", recipientRespondedAt: new Date() };
  await assert.rejects(storage.respondToDocumentOnce(doc.id, acceptance, doc.content), LpgStsReviewError);
  await storage.clearLpgStsReview(doc.id, doc.content!, points, "regression-admin", lpgStsFingerprint(doc));
  await storage.updateDocument(doc.id, { buyerSignature: "original signed terms" });
  await Promise.allSettled([
    storage.respondToDocumentOnce(doc.id, acceptance, doc.content),
    storage.updateDocument(doc.id, { content: content + "\nEdited during acceptance" }),
  ]);
  const latest = (await storage.getDocumentById(doc.id))!;
  assert.equal(lpgStsReviewState(latest).cleared, false);
  assert.notEqual(latest.status, "accepted");
  assert.notEqual(latest.recipientResponse, "accepted");
  await storage.updateDocument(doc.id, { status: "sent", recipientResponse: "pending" });
  await storage.clearLpgStsReview(doc.id, latest.content!, points, "regression-admin", lpgStsFingerprint(latest));
  await assert.rejects(storage.respondToDocumentOnce(doc.id, acceptance, doc.content), /changed while it was being accepted/);
  await storage.updateDocument(doc.id, { content: latest.content + "\nAnother amendment" });
  await storage.updateDocument(doc.id, { status: "sent", recipientResponse: "pending" });
  const rejected = await storage.respondToDocumentOnce(doc.id, {
    status: "rejected", recipientResponse: "rejected", recipientRespondedAt: new Date(), recipientAmendmentNotes: "Revise liability",
  });
  assert.equal(rejected?.status, "rejected");
  assert.equal(rejected?.recipientAmendmentNotes, "Revise liability");
});

test("review rejects metadata-only changes even when the reviewed content is unchanged", async () => {
  const doc = await draft();
  for (const change of [
    { title: "Changed transaction title" }, { buyerEmail: "new-buyer@example.com" },
    { sellerEmail: "new-seller@example.com" }, { tradeRef: "NEW-TRADE" },
    { enquiryRef: "NEW-ENQUIRY" }, { parentDocId: "NEW-PARENT" },
  ]) {
    const snapshot = (await storage.getDocumentById(doc.id))!;
    const state = lpgStsReviewState(snapshot);
    const changed = await storage.updateDocument(doc.id, change);
    assert.equal(changed.content, snapshot.content);
    await assert.rejects(storage.clearLpgStsReview(
      doc.id, snapshot.content!, points, "regression-admin", state.expectedFingerprint,
    ), /transaction details changed during review/);
    assert.equal(lpgStsReviewState(changed).cleared, false);
    const approved = await storage.clearLpgStsReview(
      doc.id, changed.content!, points, "regression-admin", lpgStsReviewState(changed).expectedFingerprint,
    );
    assert.equal(lpgStsReviewState(approved).cleared, true);
  }
});

test("editing a sent SPA retracts delivery; fresh clearance cannot replace a fresh issuer signature", async () => {
  const doc = await draft();
  await storage.clearLpgStsReview(doc.id, doc.content!, points, "regression-admin", lpgStsFingerprint(doc));
  await storage.updateDocument(doc.id, {
    buyerSignature: "original issuer signature", status: "sent", recipientResponse: "pending",
    recipientAmendmentNotes: "Old response notes", recipientRespondedAt: new Date(),
    sentTo: "recipient@example.com", sentToClientId: "old-recipient",
  });
  const edited = await storage.updateDocument(doc.id, {
    content: doc.content + "\nChanged liability", status: "sent", recipientResponse: "pending",
  });
  assert.equal(edited.status, "draft", "edit cannot preserve delivery even by submitting sent status");
  for (const field of ["buyerSignature", "recipientResponse", "recipientRespondedAt", "recipientAmendmentNotes", "sentTo", "sentToClientId"] as const) {
    assert.equal(edited[field], null, `${field} must be cleared`);
  }
  await storage.clearLpgStsReview(doc.id, edited.content!, points, "regression-admin", lpgStsFingerprint(edited));
  const acceptance = { status: "accepted", recipientResponse: "accepted", recipientRespondedAt: new Date() };
  assert.equal(await storage.respondToDocumentOnce(doc.id, acceptance, edited.content), undefined, "retracted document is not awaiting a response");
  await storage.updateDocument(doc.id, { status: "sent", recipientResponse: "pending" });
  await assert.rejects(storage.respondToDocumentOnce(doc.id, acceptance, edited.content), /signed again/);
  await storage.updateDocument(doc.id, { sellerSignature: "wrong slot" });
  await assert.rejects(storage.respondToDocumentOnce(doc.id, acceptance, edited.content), /signed again/);
  await assert.rejects(storage.updateDocument(doc.id, { status: "accepted" }), /signed again/);
  await assert.rejects(storage.updateDocumentWithSpaAddendumGuard(doc.id, { status: "accepted" }, "execution"), /signed again/);
  await storage.updateDocument(doc.id, { buyerSignature: "new issuer signature" });
  assert.equal((await storage.respondToDocumentOnce(doc.id, acceptance, edited.content))?.status, "accepted");
});

test("review endpoint is admin-only; unsigned LPG blocks all exposed signing callers and payload forgery", async () => {
  const doc = await draft();
  const username = `lpg-review-${Date.now()}`;
  const member = await storage.createTeamMember({
    username, password: "unused-test-password", name: "LPG review regression",
    allowedModules: ["documents"],
  } as any);
  const client = await storage.createKycApplication({
    companyName: username, registeredAddress: "Regression address",
    dateOfIncorporation: "2020-01-01", countryOfIncorporation: "GB", registrationNumber: username,
    contactName: "Review test", contactTitle: "Director", contactPhone: "+440000000000",
    contactEmail: `${username}@example.com`, status: "approved",
  } as any);
  await storage.updateDocument(doc.id, {
    submittedByTeamMemberId: member.id, sentToClientId: client.id, status: "sent", recipientResponse: "pending",
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.headers["x-test-role"];
    if (role) req.session = {
      authenticated: true, role, username: role === "team" ? username : "regression-admin",
      allowedModules: ["documents"],
      clientKycId: client.id, clientCompanyName: username,
    } as any;
    next();
  });
  const server = createServer(app);
  await registerRoutes(server, app, { sessionPool: pool, attachRealtime: false, seedOnStart: false });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/documents/${doc.id}`;
  const request = async (suffix: string, role: string, body: unknown, method = "POST") => {
    const response = await fetch(url + suffix, {
      method, headers: { "Content-Type": "application/json", ...(role ? { "x-test-role": role } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as any };
  };
  const portal = async (path: string, role: string, body?: unknown, method = "GET") => {
    const result = await fetch(new URL(path, url), {
      method, headers: { "Content-Type": "application/json", "x-test-role": role },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: result.status, body: await result.json() as any };
  };
  try {
    for (const [path, role] of [
      [`/api/client/documents/${doc.id}/respond`, "client"], [`/api/documents/${doc.id}/respond`, "admin"],
    ]) {
      const result = await portal(path, role, { response: "accepted" }, "POST");
      assert.equal(result.status, 409, `${role} cannot bypass clearance through acceptance`);
      assert.match(result.body.message, /clearance/);
    }
    for (const role of ["", "client", "team"]) {
      assert.equal((await portal(`/api/documents/${doc.id}/lpg-sts-review?before=20`, role)).status, 401);
      assert.equal((await request("/lpg-sts-review", role, { expectedContent: content, points })).status, 401);
      const signing = await request("/sign", role, { party: "buyer", signature: "forged", name: "Signer" });
      assert.ok([401, 403, 409].includes(signing.status), `${role} sign: ${signing.status}`);
    }
    assert.equal((await request("/sign", "admin", { party: "buyer", signature: "forged", name: "Signer" })).status, 409);
    assert.equal((await request("", "admin", { status: "final" }, "PATCH")).status, 409);
    const forged = await request("/admin-review", "admin", {
      adminChecks: withLpgStsMetadata([], clearanceFor({ ...base, id: doc.id, title: doc.title })),
    }, "PATCH");
    assert.equal(forged.status, 200);
    assert.equal(lpgStsReviewState((await storage.getDocumentById(doc.id))!).cleared, false);
    const reviewSnapshot = await portal(`/api/documents/${doc.id}/lpg-sts-review`, "admin");
    assert.equal(reviewSnapshot.status, 200);
    const expectedFingerprint = reviewSnapshot.body.expectedFingerprint;
    assert.match(expectedFingerprint, /^[a-f0-9]{64}$/);
    assert.equal((await request("/lpg-sts-review", "admin", { expectedContent: content, points: points.slice(1), expectedFingerprint })).status, 400);
    assert.equal((await request("/lpg-sts-review", "admin", { expectedContent: content, points })).status, 400, "fingerprint required");
    assert.equal((await request("/lpg-sts-review", "admin", { expectedContent: "old", expectedFingerprint, points })).status, 409);
    const approved = await request("/lpg-sts-review", "admin", { expectedContent: content, expectedFingerprint, points });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.cleared, true);
    assert.equal(approved.body.clearance.reviewedBy, "regression-admin");
    for (let index = 0; index < 42; index++) {
      await storage.clearLpgStsReview(doc.id, content, points, `history-reviewer-${index}`, expectedFingerprint);
    }
    const collected: any[] = [];
    let cursor: number | null | undefined;
    do {
      const page = await portal(`/api/documents/${doc.id}/lpg-sts-review${cursor == null ? "" : `?before=${cursor}`}`, "admin");
      assert.equal(page.status, 200);
      assert.ok(page.body.history.length <= 20);
      collected.unshift(...page.body.history);
      cursor = page.body.nextBefore;
    } while (cursor !== null);
    assert.equal(collected.length, 43);
    assert.deepEqual(collected.slice(1).map(entry => entry.reviewedBy),
      Array.from({ length: 42 }, (_, index) => `history-reviewer-${index}`));
    for (const invalid of ["-1", "abc", "1.5", "9007199254740992"]) {
      assert.equal((await portal(`/api/documents/${doc.id}/lpg-sts-review?before=${invalid}`, "admin")).status, 400);
    }
    for (const [path, role] of [
      ["/api/documents", "admin"], [`/api/documents/${doc.id}`, "admin"],
      ["/api/client/documents", "client"], ["/api/documents", "team"], [`/api/documents/${doc.id}`, "team"],
    ]) {
      const result = await portal(path, role);
      assert.equal(result.status, 200);
      const returnedDoc = Array.isArray(result.body) ? result.body.find((d: any) => d.id === doc.id) : result.body;
      assert.deepEqual(returnedDoc.lpgStsReview, { required: true, cleared: true });
      assert.equal(getLpgStsReviewMetadata(returnedDoc), undefined);
      assert.doesNotMatch(JSON.stringify(returnedDoc), /reviewedBy|reviewedAt|Transaction-specific legal|fingerprint/);
    }
    const unsigned = await portal(`/api/documents/${doc.id}/sign/buyer`, "team", undefined, "DELETE");
    // Existing team rules forbid signature mutation after sending; the status
    // projection itself is covered on a permitted draft mutation below.
    assert.equal(unsigned.status, 403);
    await storage.updateDocument(doc.id, { status: "draft" });
    const mutation = await portal(`/api/documents/${doc.id}/sign/buyer`, "team", undefined, "DELETE");
    assert.equal(mutation.status, 200);
    assert.deepEqual(mutation.body.lpgStsReview, { required: true, cleared: true });
    assert.equal(getLpgStsReviewMetadata(mutation.body), undefined);
    await storage.updateDocument(doc.id, { status: "sent", recipientResponse: "pending" });
    const unsignedAcceptance = await portal(`/api/client/documents/${doc.id}/respond`, "client", { response: "accepted" }, "POST");
    assert.equal(unsignedAcceptance.status, 409);
    assert.match(unsignedAcceptance.body.message, /signed again/);
    await storage.updateDocument(doc.id, { buyerSignature: "transaction issuer signature" });
    const accepted = await portal(`/api/client/documents/${doc.id}/respond`, "client", { response: "accepted" }, "POST");
    assert.equal(accepted.status, 200);
    assert.deepEqual(accepted.body.lpgStsReview, { required: true, cleared: true });
    assert.equal(getLpgStsReviewMetadata(accepted.body), undefined);
    await storage.updateDocument(doc.id, { status: "sent", recipientResponse: "pending", content: content + "\nEdit" });
    // Editing an accepted document revokes its old response; re-send it.
    await storage.updateDocument(doc.id, { status: "sent", recipientResponse: "pending", sentToClientId: client.id });
    const rejected = await portal(`/api/client/documents/${doc.id}/respond`, "client", { response: "rejected" }, "POST");
    assert.equal(rejected.status, 200);
    assert.deepEqual(rejected.body.lpgStsReview, { required: true, cleared: false });
    await storage.updateDocument(doc.id, { status: "sent", recipientResponse: "pending" });
    assert.equal((await request("/respond", "admin", { response: "rejected" })).status, 200);
    const staleReview = await portal(`/api/documents/${doc.id}/lpg-sts-review`, "admin");
    const beforeMetadataChange = (await storage.getDocumentById(doc.id))!;
    await storage.updateDocument(doc.id, { buyerEmail: "changed-during-review@example.com" });
    const staleApproval = await request("/lpg-sts-review", "admin", {
      expectedContent: beforeMetadataChange.content,
      expectedFingerprint: staleReview.body.expectedFingerprint,
      points,
    });
    assert.equal(staleApproval.status, 409);
    assert.match(staleApproval.body.message, /transaction details changed during review/);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    // Test-only fixture, never a real retained team record.
    await pool.query("DELETE FROM team_members WHERE id = $1 AND username = $2", [member.id, username]);
    await storage.deleteKycApplication(client.id);
  }
});