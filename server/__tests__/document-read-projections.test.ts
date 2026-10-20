import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, storage } from "../storage";
import { getLpgStsReviewMetadata, isLpgStsSpa, LPG_STS_REVIEW_POINTS } from "@shared/lpg-sts";
import { lpgStsFingerprint, lpgStsReviewPage, projectLpgStsDocumentResponse } from "../lpg-sts-review";

const ids: string[] = [];
after(async () => {
  for (const id of ids) await storage.deleteDocument(id);
  await pool.end();
});

async function fixture() {
  const owner = randomUUID();
  const doc = await storage.createDocument({
    docType: "SPA", title: "Projection regression", content: "Ordinary-looking terms",
    submittedByTeamMemberId: owner,
  }, { lpgSts: true });
  ids.push(doc.id);
  const clearance = {
    fingerprint: lpgStsFingerprint(doc), reviewedBy: "projection-admin",
    reviewedAt: "2026-10-03T00:00:00.000Z",
    points: LPG_STS_REVIEW_POINTS.map(({ id }) => ({ id, decision: "approved", note: "Approved terms" })),
  };
  return { doc, owner, clearance };
}

async function seed(id: string, checks: unknown) {
  // Seed legacy/large histories directly; application writes still use locks.
  await pool.query("UPDATE documents SET admin_checks = $1::jsonb WHERE id = $2", [JSON.stringify(checks), id]);
}

test("browse reads omit large histories at the database boundary, retaining marker, clearance and ownership", async () => {
  const { doc, owner, clearance } = await fixture();
  const other = await fixture();
  const history = Array.from({ length: 2400 }, (_, i) => ({
    type: "invalidation", fingerprint: `old-${i}`, nextFingerprint: `next-${i}`,
    occurredAt: "2026-10-02", reason: "Audit explanation ".repeat(80),
  }));
  const generic = { key: "commercial", checked: true };
  await seed(doc.id, [generic, { key: "lpgStsReview", clearance, history }]);
  const full = (await storage.getDocumentById(doc.id))!;
  const browse = (await storage.getDocumentForBrowse(doc.id))!;
  assert.equal(isLpgStsSpa(browse), true); // Reserved marker alone identifies this SPA.
  assert.equal(getLpgStsReviewMetadata(browse)?.history, undefined);
  assert.deepEqual(browse.adminChecks, [generic, { key: "lpgStsReview", clearance }]);
  assert.deepEqual(projectLpgStsDocumentResponse(browse), projectLpgStsDocumentResponse(full));
  assert.deepEqual(projectLpgStsDocumentResponse(browse).lpgStsReview, { required: true, cleared: true });
  assert.ok(JSON.stringify(full).length > 3_000_000);
  assert.ok(JSON.stringify(browse).length < 10_000);
  const own = await storage.getDocumentsForBrowse(owner);
  assert.deepEqual(own.map(d => d.id), [doc.id]);
  assert.equal(own.some(d => d.id === other.doc.id), false);
  assert.equal(getLpgStsReviewMetadata(own[0])?.history, undefined);
  const listed = (await storage.getDocumentsForBrowse()).find(d => d.id === doc.id)!;
  assert.deepEqual(listed, browse);

  for (const cursor of [undefined, 2401, 2400, 2381, 21, 20, 1, 0, Number.MAX_SAFE_INTEGER]) {
    const page = await storage.getLpgStsReviewPage(doc.id, cursor);
    assert.deepEqual(page, lpgStsReviewPage(full, cursor));
    assert.ok(JSON.stringify(page).length < 40_000);
  }
  const first = (await storage.getLpgStsReviewPage(doc.id))!;
  const previous = (await storage.getLpgStsReviewPage(doc.id, first.nextBefore!))!;
  // Mutation appends the legacy clearance before invalidating it. Old cursors
  // remain stable, and the full locked row retains all seeded events.
  await storage.updateDocument(doc.id, { content: "Amended terms" });
  const amended = (await storage.getDocumentById(doc.id))!;
  assert.equal(getLpgStsReviewMetadata(amended)?.history?.length, 2402);
  assert.deepEqual((await storage.getLpgStsReviewPage(doc.id, first.nextBefore!))!.history, previous.history);
  const amendedBrowse = (await storage.getDocumentForBrowse(doc.id))!;
  assert.deepEqual(projectLpgStsDocumentResponse(amendedBrowse).lpgStsReview, { required: true, cleared: false });
  assert.deepEqual(await storage.getLpgStsReviewPage(doc.id), lpgStsReviewPage(amended));
});

test("SQL paging matches legacy, empty, duplicate and non-array metadata semantics", async () => {
  const { doc, clearance } = await fixture();
  const event = { type: "clearance", ...clearance };
  for (const checks of [
    null, {}, [], [{ key: "ordinary", checked: false }],
    [{ key: "lpgStsReview", clearance: null }],
    [{ key: "lpgStsReview", clearance }],
    [{ key: "lpgStsReview", clearance, history: {} }],
    [{ key: "lpgStsReview", clearance, history: [event, event] }],
    [{ key: "lpgStsReview", clearance: null }, { key: "lpgStsReview", clearance, history: [event] }],
  ]) {
    await seed(doc.id, checks);
    const full = (await storage.getDocumentById(doc.id))!;
    const browse = (await storage.getDocumentForBrowse(doc.id))!;
    assert.deepEqual(projectLpgStsDocumentResponse(browse), projectLpgStsDocumentResponse(full));
    for (const cursor of [undefined, 0, 1, 2, 25]) {
      assert.deepEqual(await storage.getLpgStsReviewPage(doc.id, cursor), lpgStsReviewPage(full, cursor));
    }
  }
  assert.equal(await storage.getLpgStsReviewPage(randomUUID()), undefined);
  assert.equal(await storage.getDocumentForBrowse(randomUUID()), undefined);
  for (const cursor of [-1, 1.5, NaN, Infinity]) {
    await assert.rejects(storage.getLpgStsReviewPage(doc.id, cursor), /Invalid history cursor/);
  }
});

test("agent agreement browsing preserves subject and document-type filters", async () => {
  const agent = randomUUID();
  for (const [docType, agentCode] of [["ICA", agent], ["NCNDA", agent], ["SPA", agent], ["ICA", randomUUID()]]) {
    const doc = await storage.createDocument({ docType, agentCode, title: "Agreement projection", content: "Terms" });
    ids.push(doc.id);
  }
  assert.deepEqual(await storage.getAgentAgreementsForBrowse(agent), await storage.getAgentAgreementsByAgentCode(agent));
  assert.equal((await storage.getAgentAgreementsForBrowse(agent)).length, 2);
});