// Integration tests for candidate TFRs: preparing TFRs for several
// Import/Export combinations WITHOUT forming a deal, cancelling them, and
// creating the deal from the chosen combination (which cancels competitors).
//
// Service-layer tests against the real dev DB (session cookies are secure:true
// so authed HTTP doesn't work over plain-HTTP test clients); the routes are
// thin wrappers over these exported functions.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { storage, pool } from "../storage";
import {
  prepareTfrCandidate,
  cancelTfrCandidate,
  createDealFromTfrCandidate,
  updateTfrCandidateDetails,
  createDealFromEnquiries,
  cancelDealTfr,
  approveTfrForDeal,
  updateDealTfrDetails,
  updateTfrCandidateContent,
  updateDealTfrContent,
} from "../routes";
import type { TradeEnquiry } from "@shared/schema";

const RUN = Date.now().toString(36);
// Run-unique ref/party namespaces — the enquiry-ref serial is non-atomic and
// KYC lookups are by exact company name, so concurrent runs must not collide.
const rand3 = () =>
  Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
const CREATOR = `${rand3()} cand tester ${RUN}`;
const PRODUCT = `${rand3()}CANDTEST-${RUN}`;

const createdEnquiryIds: string[] = [];
const createdDealIds: string[] = [];
const createdCandidateIds: string[] = [];

async function makeImport(suffix: string, price = "8000"): Promise<TradeEnquiry> {
  const e = await storage.createTradeEnquiry({
    side: "buy",
    product: PRODUCT,
    quantity: "1000",
    unit: "MT",
    price,
    currency: "USD",
    origin: "Zambia",
    loadingPort: "Dar es Salaam",
    incoterms: "FOB",
    buyerName: `Cand Buyer ${suffix} ${RUN}`,
    sellerName: `Cand Supplier ${suffix} ${RUN}`,
    createdBy: CREATOR,
    status: "active",
  } as any);
  createdEnquiryIds.push(e.id);
  return e;
}

async function makeExport(suffix: string, price = "9000"): Promise<TradeEnquiry> {
  const e = await storage.createTradeEnquiry({
    side: "sell",
    product: PRODUCT,
    quantity: "1000",
    unit: "MT",
    price,
    currency: "USD",
    dischargePort: "Shanghai",
    incoterms: "CIF",
    buyerName: `Cand Final Buyer ${suffix} ${RUN}`,
    sellerName: `Cand Trader ${suffix} ${RUN}`,
    createdBy: CREATOR,
    status: "active",
  } as any);
  createdEnquiryIds.push(e.id);
  return e;
}

before(() => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL must be set to run these tests");
});

after(async () => {
  for (const id of createdCandidateIds) {
    const c = await storage.getTfrCandidateById(id);
    if (c?.tfrDocId) { try { await storage.deleteDocument(c.tfrDocId); } catch {} }
    try { await storage.deleteTfrCandidate(id); } catch {}
  }
  for (const dealId of createdDealIds) {
    const deal = await storage.getDealById(dealId);
    if (!deal) continue;
    const docIds = [
      deal.loiDocId, deal.scoDocId, deal.dealRecapImportDocId,
      deal.dealRecapExportDocId, deal.tfrDocId,
    ].filter(Boolean) as string[];
    if (docIds.length) {
      await pool.query(`DELETE FROM documents WHERE id = ANY($1::text[])`, [docIds]);
    }
    if (deal.tradeRef) {
      const { rows } = await pool.query(
        `SELECT block_number FROM trades WHERE trade_ref = $1`, [deal.tradeRef],
      );
      const blockNumber = rows[0]?.block_number;
      if (blockNumber != null) {
        await pool.query(`DELETE FROM blocks WHERE block_number = $1`, [blockNumber]);
      }
      await pool.query(`DELETE FROM trades WHERE trade_ref = $1`, [deal.tradeRef]);
    }
    await pool.query(`DELETE FROM deals WHERE id = $1`, [dealId]);
  }
  for (const id of createdEnquiryIds) {
    await storage.deleteTradeEnquiry(id);
  }
  await pool.end();
});

test("multiple candidates can share an enquiry; no deal is formed and enquiries stay free", async () => {
  const imp = await makeImport("A");
  const expA = await makeExport("A", "9000");
  const expB = await makeExport("B", "9500");

  const c1 = await prepareTfrCandidate(imp.enquiryRef, expA.enquiryRef);
  assert.ok(c1.ok, "first candidate should be created");
  createdCandidateIds.push(c1.value.id);
  const c2 = await prepareTfrCandidate(imp.enquiryRef, expB.enquiryRef);
  assert.ok(c2.ok, "second candidate sharing the import enquiry should be allowed");
  createdCandidateIds.push(c2.value.id);

  // Each has a draft TFR document and a gross-profit comparison figure.
  for (const c of [c1.value, c2.value]) {
    assert.equal(c.status, "active");
    assert.ok(c.tfrDocId, "candidate should carry a TFR doc");
    const doc = await storage.getDocumentById(c.tfrDocId!);
    assert.ok(doc, "TFR doc exists");
    assert.equal(doc!.docType, "TFR");
    assert.equal(doc!.status, "draft");
    assert.ok(c.grossProfit?.includes("USD"), "gross profit figure recorded");
  }
  // Higher sale price -> higher gross profit on c2.
  assert.notEqual(c1.value.grossProfit, c2.value.grossProfit);

  // No deal rows were created for these refs.
  const deals = await storage.getDeals();
  assert.ok(!deals.some(d =>
    [imp.enquiryRef, expA.enquiryRef, expB.enquiryRef].includes(d.importEnquiryRef) ||
    [imp.enquiryRef, expA.enquiryRef, expB.enquiryRef].includes(d.exportEnquiryRef)
  ), "preparing candidates must not form deals");

  // Exact duplicate active pairing is rejected.
  const dup = await prepareTfrCandidate(imp.enquiryRef, expA.enquiryRef);
  assert.ok(!dup.ok && dup.status === 409, "duplicate combination rejected");
});

test("candidate validation mirrors deal rules: sides and commodity", async () => {
  const imp = await makeImport("V");
  const imp2 = await makeImport("V2");
  const wrongSide = await prepareTfrCandidate(imp.enquiryRef, imp2.enquiryRef);
  assert.ok(!wrongSide.ok && wrongSide.status === 400, "export ref must be a sell enquiry");

  // Cross-commodity requires the manual override.
  const otherProdExp = await storage.createTradeEnquiry({
    side: "sell", product: `${PRODUCT}-OTHER`, quantity: "1000", unit: "MT",
    price: "9100", currency: "USD", createdBy: CREATOR, status: "active",
    buyerName: `Cand X Buyer ${RUN}`, sellerName: `Cand X Trader ${RUN}`,
  } as any);
  createdEnquiryIds.push(otherProdExp.id);
  const mismatch = await prepareTfrCandidate(imp.enquiryRef, otherProdExp.enquiryRef);
  assert.ok(!mismatch.ok && mismatch.status === 400, "cross-commodity rejected without manual override");
  const manual = await prepareTfrCandidate(imp.enquiryRef, otherProdExp.enquiryRef, { allowCommodityMismatch: true });
  assert.ok(manual.ok, "manual override allows cross-commodity candidate");
  createdCandidateIds.push(manual.value.id);
  assert.equal(manual.value.manualMatch, true);
  assert.ok(manual.value.commodity.includes(" / "), "cross-commodity candidate records both products");
});

test("cancelling a candidate removes its draft TFR document", async () => {
  const imp = await makeImport("C");
  const exp = await makeExport("C");
  const c = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
  assert.ok(c.ok);
  createdCandidateIds.push(c.value.id);
  const docId = c.value.tfrDocId!;

  const cancelled = await cancelTfrCandidate(c.value.id);
  assert.ok(cancelled.ok);
  assert.equal(cancelled.value.status, "cancelled");
  assert.equal(cancelled.value.tfrDocId, null);
  assert.equal(await storage.getDocumentById(docId), undefined, "draft TFR doc deleted");

  // Cancelling twice is rejected, and a cancelled candidate can't form a deal.
  const again = await cancelTfrCandidate(c.value.id);
  assert.ok(!again.ok && again.status === 409);
  const dealAttempt = await createDealFromTfrCandidate(c.value.id);
  assert.ok(!dealAttempt.ok && dealAttempt.status === 409, "cancelled candidate cannot create a deal");

  // The pair is free again for a fresh candidate after cancellation.
  const redo = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
  assert.ok(redo.ok, "same combination can be re-prepared after cancel");
  createdCandidateIds.push(redo.value.id);
});

test("creating the deal from the best candidate runs the cascade and cancels competitors", async () => {
  const imp = await makeImport("D");
  const expA = await makeExport("D1", "9000");
  const expB = await makeExport("D2", "9500");

  const c1 = await prepareTfrCandidate(imp.enquiryRef, expA.enquiryRef);
  const c2 = await prepareTfrCandidate(imp.enquiryRef, expB.enquiryRef);
  assert.ok(c1.ok && c2.ok);
  createdCandidateIds.push(c1.value.id, c2.value.id);
  const c1DocId = c1.value.tfrDocId!;
  const c2DocId = c2.value.tfrDocId!;

  const result = await createDealFromTfrCandidate(c2.value.id);
  assert.ok(result.ok, "deal formed from chosen candidate");
  createdDealIds.push(result.value.id);
  assert.equal(result.value.importEnquiryRef, imp.enquiryRef);
  assert.equal(result.value.exportEnquiryRef, expB.enquiryRef);
  assert.equal(result.value.stage, "tfr_pending", "full cascade ran to the real TFR");
  assert.ok(result.value.tfrDocId, "deal has its own final TFR");
  assert.notEqual(result.value.tfrDocId, c2DocId, "final TFR is freshly generated, not the draft");

  // Chosen candidate graduated; its draft doc is gone; competitor cancelled.
  const chosen = await storage.getTfrCandidateById(c2.value.id);
  assert.equal(chosen?.status, "deal_formed");
  assert.equal(chosen?.dealId, result.value.id);
  assert.equal(await storage.getDocumentById(c2DocId), undefined, "chosen candidate's draft TFR removed");
  const competitor = await storage.getTfrCandidateById(c1.value.id);
  assert.equal(competitor?.status, "cancelled", "competing candidate sharing the import was cancelled");
  assert.equal(await storage.getDocumentById(c1DocId), undefined, "competitor draft TFR removed");

  // Enquiries now in a deal: no new candidate may use them.
  const blocked = await prepareTfrCandidate(imp.enquiryRef, expA.enquiryRef);
  assert.ok(!blocked.ok && blocked.status === 409, "enquiries in a deal are blocked for candidates");
});

test("concurrent create-deal on the same candidate: exactly one wins", async () => {
  const imp = await makeImport("R1");
  const exp = await makeExport("R1");
  const c = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
  assert.ok(c.ok);
  createdCandidateIds.push(c.value.id);

  const [a, b] = await Promise.all([
    createDealFromTfrCandidate(c.value.id),
    createDealFromTfrCandidate(c.value.id),
  ]);
  const oks = [a, b].filter(r => r.ok) as Array<{ ok: true; value: any }>;
  const fails = [a, b].filter(r => !r.ok) as Array<{ ok: false; status: number }>;
  assert.equal(oks.length, 1, "exactly one concurrent claim forms the deal");
  assert.equal(fails.length, 1);
  assert.equal(fails[0].status, 409, "loser gets a 409, not a duplicate deal");
  createdDealIds.push(oks[0].value.id);

  const finalC = await storage.getTfrCandidateById(c.value.id);
  assert.equal(finalC?.status, "deal_formed");
  assert.equal(finalC?.dealId, oks[0].value.id);
});

test("concurrent create-deal on two overlapping candidates: one deal, one winner, loser cancelled", async () => {
  const imp = await makeImport("R2");
  const expA = await makeExport("R2A");
  const expB = await makeExport("R2B");
  const c1 = await prepareTfrCandidate(imp.enquiryRef, expA.enquiryRef);
  const c2 = await prepareTfrCandidate(imp.enquiryRef, expB.enquiryRef);
  assert.ok(c1.ok && c2.ok);
  createdCandidateIds.push(c1.value.id, c2.value.id);

  const [a, b] = await Promise.all([
    createDealFromTfrCandidate(c1.value.id),
    createDealFromTfrCandidate(c2.value.id),
  ]);
  const oks = [a, b].filter(r => r.ok) as Array<{ ok: true; value: any }>;
  assert.equal(oks.length, 1, "shared import enquiry allows exactly one deal");
  createdDealIds.push(oks[0].value.id);

  const s1 = await storage.getTfrCandidateById(c1.value.id);
  const s2 = await storage.getTfrCandidateById(c2.value.id);
  const statuses = [s1?.status, s2?.status].sort();
  assert.deepEqual(statuses, ["cancelled", "deal_formed"], "one graduates, the other is cancelled");
  const winner = s1?.status === "deal_formed" ? s1 : s2;
  const loser = s1?.status === "deal_formed" ? s2 : s1;
  assert.equal(winner?.dealId, oks[0].value.id);
  if (loser?.tfrDocId) {
    assert.equal(await storage.getDocumentById(loser.tfrDocId), undefined, "loser's draft TFR removed");
  }
  // No dangling extra deal for the loser's export ref.
  const deals = await storage.getDeals();
  assert.equal(
    deals.filter(d => d.importEnquiryRef === imp.enquiryRef).length, 1,
    "the shared import enquiry appears in exactly one deal",
  );
});

test("cancelling a deal-backed TFR dissolves the deal, removes cascade docs, and frees the enquiries", async () => {
  const imp = await makeImport("X");
  const exp = await makeExport("X");
  const deal = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.ok(deal.ok);
  assert.equal(deal.value.stage, "tfr_pending");
  const docIds = [
    deal.value.loiDocId, deal.value.scoDocId, deal.value.dealRecapImportDocId,
    deal.value.dealRecapExportDocId, deal.value.tfrDocId,
  ].filter(Boolean) as string[];
  assert.equal(docIds.length, 5, "full cascade present before cancel");

  const cancelled = await cancelDealTfr(deal.value.id);
  assert.ok(cancelled.ok, "TFR of an unapproved deal can be cancelled");

  assert.equal(await storage.getDealById(deal.value.id), undefined, "deal row removed");
  for (const id of docIds) {
    assert.equal(await storage.getDocumentById(id), undefined, "cascade doc removed");
  }

  // Enquiries are free again: a new candidate AND a new deal are possible.
  const redo = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
  assert.ok(redo.ok, "enquiries reusable for a candidate after TFR cancel");
  createdCandidateIds.push(redo.value.id);
  const redeal = await createDealFromTfrCandidate(redo.value.id);
  assert.ok(redeal.ok, "enquiries reusable for a fresh deal after TFR cancel");
  createdDealIds.push(redeal.value.id);

  // Second cancel of the (now nonexistent) deal 404s.
  const again = await cancelDealTfr(deal.value.id);
  assert.ok(!again.ok && again.status === 404);
});

test("cancelling a dissolved deal's TFR detaches the graduated candidate", async () => {
  const imp = await makeImport("Z");
  const exp = await makeExport("Z");
  const cand = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
  assert.ok(cand.ok);
  createdCandidateIds.push(cand.value.id);
  const deal = await createDealFromTfrCandidate(cand.value.id);
  assert.ok(deal.ok);

  const cancelled = await cancelDealTfr(deal.value.id);
  assert.ok(cancelled.ok);
  const c = await storage.getTfrCandidateById(cand.value.id);
  assert.equal(c?.status, "cancelled", "graduated candidate is cancelled when its deal dissolves");
  assert.equal(c?.dealId, null, "no dangling deal reference survives");
});

test("cancellation is blocked while documents derived from the cascade exist", async () => {
  const imp = await makeImport("W");
  const exp = await makeExport("W");
  const deal = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.ok(deal.ok);
  createdDealIds.push(deal.value.id);

  // Simulate a document derived from the import recap (e.g. an SPA draft).
  const child = await storage.createDocument({
    docType: "SPA",
    title: `Derived SPA ${RUN}`,
    content: "derived",
    status: "draft",
    parentDocId: deal.value.dealRecapImportDocId,
  } as any);

  const blocked = await cancelDealTfr(deal.value.id);
  assert.ok(!blocked.ok && blocked.status === 409, "derived children block cancellation");
  assert.ok(await storage.getDealById(deal.value.id), "deal untouched while children exist");

  // Removing the child unblocks cancellation.
  await storage.deleteDocument(child.id);
  const cancelled = await cancelDealTfr(deal.value.id);
  assert.ok(cancelled.ok, "cancellation proceeds once children are removed");
  createdDealIds.pop();
});

test("an approved TFR (trade formed) can no longer be cancelled", async () => {
  const imp = await makeImport("Y");
  const exp = await makeExport("Y");
  const deal = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.ok(deal.ok);
  createdDealIds.push(deal.value.id);

  const approved = await approveTfrForDeal(deal.value.id);
  assert.ok(approved.ok, "TFR approval forms the trade");

  const cancelled = await cancelDealTfr(deal.value.id);
  assert.ok(!cancelled.ok && cancelled.status === 409, "formed trade blocks TFR cancellation");
  assert.ok(await storage.getDealById(deal.value.id), "deal untouched");
});

test("manually incorporated TFR details regenerate the doc, persist on the deal, and save the recipient", async () => {
  const imp = await makeImport("M");
  const exp = await makeExport("M");
  const deal = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.ok(deal.ok);
  createdDealIds.push(deal.value.id);

  const bankName = `First Test Bank ${RUN}`;
  const updated = await updateDealTfrDetails(deal.value.id, {
    addressedToName: bankName,
    addressedToAddress: "1 Finance Street, Zurich",
    addressedToAttn: "Trade Desk",
    buyerBank: "Buyer Bank AG",
    workingCapitalRequired: "USD 1,000,000",
    additionalDetails: "Subject to sanctions screening.",
    emptyIgnored: "   ",
    reference: "HACKED-REF",           // not allowlisted — must be dropped
    grossProfitTotal: "USD 999,999,999", // not allowlisted — must be dropped
  });
  assert.ok(updated.ok, "details update succeeds");
  assert.equal(updated.value.tfrManualDetails?.addressedToName, bankName);
  assert.equal(updated.value.tfrManualDetails?.emptyIgnored, undefined, "blank values dropped");
  assert.equal(updated.value.tfrManualDetails?.reference, undefined, "non-allowlisted keys dropped");
  assert.equal(updated.value.tfrManualDetails?.grossProfitTotal, undefined, "auto-derived economics not overridable");
  const hackCheck = await storage.getDocumentById(deal.value.tfrDocId!);
  assert.ok(!hackCheck?.content.includes("HACKED-REF"), "dropped keys never reach the document");

  const doc = await storage.getDocumentById(deal.value.tfrDocId!);
  assert.ok(doc?.content.includes(bankName), "TFR content carries the manual addressee");
  assert.ok(doc?.content.includes("Subject to sanctions screening."), "additional details rendered");
  assert.ok(doc?.content.includes("Buyer Bank AG"), "banking assessment rendered");

  // Recipient saved for future reuse; re-saving refreshes rather than duplicating.
  const recipients = await storage.getTfrRecipients();
  const saved = recipients.find(r => r.name === bankName);
  assert.ok(saved, "addressee stored in recipients directory");
  assert.equal(saved!.address, "1 Finance Street, Zurich");

  const again = await updateDealTfrDetails(deal.value.id, {
    addressedToName: bankName,
    addressedToAddress: "2 New Plaza, Geneva",
  });
  assert.ok(again.ok);
  const refreshed = (await storage.getTfrRecipients()).filter(r => r.name === bankName);
  assert.equal(refreshed.length, 1, "upsert by name — no duplicate recipient");
  assert.equal(refreshed[0].address, "2 New Plaza, Geneva", "recipient details refreshed");
  // Replacement semantics: fields omitted this time are cleared.
  assert.equal(again.value.tfrManualDetails?.buyerBank, undefined);

  // Approval stamps the deal AND the document; details become read-only.
  const approved = await approveTfrForDeal(deal.value.id, "Test Admin");
  assert.ok(approved.ok);
  const stamped = await storage.getDealById(deal.value.id);
  assert.ok(stamped?.tfrApprovedAt, "digital approval time stamp recorded");
  assert.equal(stamped?.tfrApprovedBy, "Test Admin");
  const finalDoc = await storage.getDocumentById(deal.value.tfrDocId!);
  assert.ok(finalDoc?.content.includes("ADMIN DIGITAL APPROVAL"), "approval stamp in document");
  assert.ok(finalDoc?.content.includes(approved.value.createdTradeRef), "trade ref in stamp");

  const locked = await updateDealTfrDetails(deal.value.id, { addressedToName: "Too Late Bank" });
  assert.ok(!locked.ok && locked.status === 409, "approved TFR details are locked");
});

// Count occurrences of the digital approval stamp in a TFR document's content.
const stampCount = (content?: string | null) =>
  (String(content ?? "").match(/ADMIN DIGITAL APPROVAL/g) || []).length;

// Extract the visible text of a generated DOCX / PDF so tests can assert on
// the actual downloadable artifacts, not just the DB content column.
function docxText(filePath: string): string {
  return execSync(`unzip -p ${JSON.stringify(filePath)} word/document.xml`, { maxBuffer: 64 * 1024 * 1024 })
    .toString("utf8")
    .replace(/<[^>]+>/g, " ");
}
function pdfText(filePath: string): string {
  return execSync(`pdftotext ${JSON.stringify(filePath)} -`, { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
}

test("racing a details edit against approval never corrupts the approved TFR", async () => {
  // Two rounds to vary interleavings: the conditional update is the arbiter,
  // so either the edit lands fully pre-approval or it loses with a 409 — and
  // the approved document always carries the stamp exactly once.
  for (const round of ["G1", "G2"]) {
    const imp = await makeImport(round);
    const exp = await makeExport(round);
    const deal = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
    assert.ok(deal.ok);
    createdDealIds.push(deal.value.id);
    const bankName = `Race Bank ${round} ${RUN}`;

    const [edit, approve] = await Promise.all([
      updateDealTfrDetails(deal.value.id, {
        addressedToName: bankName,
        buyerBank: `Race Buyer Bank ${round}`,
      }),
      approveTfrForDeal(deal.value.id, "Race Admin"),
    ]);

    assert.ok(approve.ok, "approval of a pending TFR must succeed regardless of a racing edit");
    assert.ok(
      edit.ok || (!edit.ok && edit.status === 409),
      `edit must either fully apply or be rejected with 409 (got ${edit.ok ? "ok" : (edit as any).status})`,
    );

    const finalDeal = await storage.getDealById(deal.value.id);
    assert.ok(finalDeal?.tradeRef, "trade formed");
    assert.ok(finalDeal?.tfrApprovedAt, "approval time stamp recorded on the deal");
    const doc = await storage.getDocumentById(deal.value.tfrDocId!);
    assert.ok(doc, "approved TFR document exists");
    assert.equal(
      stampCount(doc!.content), 1,
      "approved TFR carries the digital approval stamp EXACTLY once (never lost, never duplicated)",
    );
    assert.ok(doc!.content.includes(approve.value.createdTradeRef), "stamp cites the trade ref");

    if (edit.ok) {
      // Edit won the conditional update — its details must be fully applied
      // on the deal AND present in the (still stamped) document.
      assert.equal(finalDeal?.tfrManualDetails?.addressedToName, bankName);
      assert.ok(doc!.content.includes(bankName), "winning edit's details survive in the approved doc");
    } else {
      // Edit lost — no post-approval details may leak into deal or document.
      assert.notEqual(finalDeal?.tfrManualDetails?.addressedToName, bankName, "losing edit leaves no details on the deal");
      assert.ok(!doc!.content.includes(bankName), "losing edit leaves no trace in the approved doc");
    }

    // Details are locked after the dust settles.
    const late = await updateDealTfrDetails(deal.value.id, { addressedToName: "Too Late" });
    assert.ok(!late.ok && late.status === 409, "approved TFR details stay locked");
  }
});

test("racing a details edit against cancellation never resurrects the deal", async () => {
  for (const round of ["H1", "H2"]) {
    const imp = await makeImport(round);
    const exp = await makeExport(round);
    const deal = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
    assert.ok(deal.ok);
    const bankName = `Cancel Race Bank ${round} ${RUN}`;

    const [edit, cancel] = await Promise.all([
      updateDealTfrDetails(deal.value.id, { addressedToName: bankName }),
      cancelDealTfr(deal.value.id),
    ]);

    assert.ok(cancel.ok, "cancelling an unapproved deal's TFR must succeed regardless of a racing edit");
    assert.ok(
      edit.ok || (!edit.ok && [404, 409].includes((edit as any).status)),
      "edit either fully applied before the cancel or failed cleanly",
    );

    // Whatever the interleaving: the deal and its cascade documents are gone.
    assert.equal(await storage.getDealById(deal.value.id), undefined, "deal removed despite the racing edit");
    for (const docId of [
      deal.value.loiDocId, deal.value.scoDocId, deal.value.dealRecapImportDocId,
      deal.value.dealRecapExportDocId, deal.value.tfrDocId,
    ].filter(Boolean) as string[]) {
      assert.equal(await storage.getDocumentById(docId), undefined, "cascade doc removed despite the racing edit");
    }

    // Further edits on the dissolved deal fail with 404, never a silent write.
    const late = await updateDealTfrDetails(deal.value.id, { addressedToName: "Ghost Bank" });
    assert.ok(!late.ok && late.status === 404, "edits on a cancelled deal 404");

    // Enquiries are free again for the standard reuse guarantee.
    const redo = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
    assert.ok(redo.ok, "enquiries reusable after the raced cancel");
    createdCandidateIds.push(redo.value.id);
  }
});

// ── Deterministic interleavings ──────────────────────────────────────────────
// The Promise.all races above cover whatever ordering the scheduler picks; the
// tests below FORCE each critical ordering by hooking the storage boundary the
// production code uses as its arbiter, so every window is exercised on every run.

test("deterministic: approval lands AFTER the edit's conditional claim but BEFORE its doc write — stamp is re-applied, exactly once", async () => {
  const imp = await makeImport("DA");
  const exp = await makeExport("DA");
  const deal = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.ok(deal.ok);
  createdDealIds.push(deal.value.id);
  const bankName = `Det Claim Bank ${RUN}`;

  // Hook: right after the edit wins the conditional claim (deal still
  // tfr_pending), run the FULL approval before the edit regenerates the doc.
  // This is the exact window where a naive implementation would overwrite the
  // freshly stamped document with unstamped content.
  const orig = storage.updateDealTfrDetailsIfPending.bind(storage);
  let approveResult: Awaited<ReturnType<typeof approveTfrForDeal>> | undefined;
  (storage as any).updateDealTfrDetailsIfPending = async (id: string, details: Record<string, string>) => {
    const claimed = await orig(id, details);
    approveResult = await approveTfrForDeal(deal.value.id, "Det Admin");
    return claimed;
  };
  let edit: Awaited<ReturnType<typeof updateDealTfrDetails>>;
  try {
    edit = await updateDealTfrDetails(deal.value.id, { addressedToName: bankName });
  } finally {
    (storage as any).updateDealTfrDetailsIfPending = orig;
  }

  assert.ok(edit.ok, "edit won the claim, so it must fully apply");
  assert.ok(approveResult?.ok, "approval in the window must also succeed");
  const finalDeal = await storage.getDealById(deal.value.id);
  assert.ok(finalDeal?.tradeRef, "trade formed");
  assert.equal(finalDeal?.tfrManualDetails?.addressedToName, bankName, "edit's details persisted on the deal");
  const doc = await storage.getDocumentById(deal.value.tfrDocId!);
  assert.ok(doc!.content.includes(bankName), "edit's details present in the final doc");
  assert.equal(stampCount(doc!.content), 1, "approval stamp re-applied after the edit's overwrite — exactly once");
  assert.ok(doc!.content.includes(approveResult!.ok ? approveResult!.value.createdTradeRef : ""), "stamp cites the trade ref");
});

test("deterministic: approval lands AFTER the edit's doc content write — idempotent stamp is not duplicated", async () => {
  const imp = await makeImport("DB");
  const exp = await makeExport("DB");
  const deal = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.ok(deal.ok);
  createdDealIds.push(deal.value.id);
  const bankName = `Det Post-Write Bank ${RUN}`;

  // Hook: after the edit's FIRST content write to the TFR doc, run the full
  // approval (which stamps the doc), then let the edit finish — its own
  // re-stamp pass must detect the existing stamp and not add a second one.
  const orig = storage.updateDocument.bind(storage);
  let fired = false;
  let approveResult: Awaited<ReturnType<typeof approveTfrForDeal>> | undefined;
  (storage as any).updateDocument = async (id: string, patch: any) => {
    const res = await orig(id, patch);
    if (!fired && id === deal.value.tfrDocId && typeof patch?.content === "string") {
      fired = true;
      approveResult = await approveTfrForDeal(deal.value.id, "Det Admin 2");
    }
    return res;
  };
  let edit: Awaited<ReturnType<typeof updateDealTfrDetails>>;
  try {
    edit = await updateDealTfrDetails(deal.value.id, { addressedToName: bankName });
  } finally {
    (storage as any).updateDocument = orig;
  }

  assert.ok(fired, "hook fired at the post-content-write window");
  assert.ok(edit.ok, "edit claimed first and must fully apply");
  assert.ok(approveResult?.ok, "approval after the content write must succeed");
  const doc = await storage.getDocumentById(deal.value.tfrDocId!);
  assert.ok(doc!.content.includes(bankName), "edit's details survive");
  assert.equal(stampCount(doc!.content), 1, "stamp appears exactly once — no duplicate from the edit's re-stamp pass");

  // The downloadable artifacts must match the stamped DB content: the edit
  // regenerated its files from a pre-stamp snapshot AFTER the approval wrote
  // stamped files, so the final reconciliation must have refreshed them.
  assert.ok(doc!.docxPath && doc!.pdfPath, "approved TFR has DOCX and PDF files");
  const docx = docxText(doc!.docxPath!);
  assert.equal(stampCount(docx), 1, "generated DOCX carries the approval stamp exactly once — never a stale unstamped file");
  assert.ok(docx.includes(bankName), "generated DOCX carries the winning edit's details");
  assert.ok(docx.includes(approveResult!.ok ? approveResult!.value.createdTradeRef : ""), "generated DOCX cites the trade ref");
  const pdf = pdfText(doc!.pdfPath!);
  assert.equal(stampCount(pdf), 1, "generated PDF carries the approval stamp exactly once");
  assert.ok(pdf.includes(bankName), "generated PDF carries the winning edit's details");
});

test("deterministic: approval reads a STALE doc snapshot, the winning edit writes, then approval stamps — edit survives, stamped exactly once", async () => {
  // The lost-update hazard: approval's stamping reads the document BEFORE the
  // winning edit's content write, and applies its stamp AFTER it. A
  // read-modify-write stamp would overwrite the edit with the stale snapshot;
  // the atomic conditional append must preserve the edit's content instead.
  const imp = await makeImport("DF");
  const exp = await makeExport("DF");
  const deal = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.ok(deal.ok);
  createdDealIds.push(deal.value.id);
  const tfrDocId = deal.value.tfrDocId!;
  const bankName = `Det Stale Read Bank ${RUN}`;

  let releaseEditWrite!: () => void;
  const editWriteGate = new Promise<void>(r => (releaseEditWrite = r));
  let editWroteResolve!: () => void;
  const editWrote = new Promise<void>(r => (editWroteResolve = r));
  let claimResolve!: () => void;
  const claimDone = new Promise<void>(r => (claimResolve = r));
  let staleReadForced = false;

  const origClaim = storage.updateDealTfrDetailsIfPending.bind(storage);
  const origUpd = storage.updateDocument.bind(storage);
  const origGet = storage.getDocumentById.bind(storage);

  // Edit wins the conditional claim first, then pauses just before its
  // content write.
  (storage as any).updateDealTfrDetailsIfPending = async (id: string, details: Record<string, string>) => {
    const claimed = await origClaim(id, details);
    claimResolve();
    return claimed;
  };
  let editWriteBlocked = false;
  (storage as any).updateDocument = async (id: string, patch: any) => {
    if (!editWriteBlocked && id === tfrDocId && typeof patch?.content === "string" && !patch.content.includes("ADMIN DIGITAL APPROVAL")) {
      editWriteBlocked = true;
      await editWriteGate; // hold the edit's content write until approval has taken its stale read
      const res = await origUpd(id, patch);
      editWroteResolve();
      return res;
    }
    return origUpd(id, patch);
  };
  // Approval's pre-stamp read (first doc read after the trade formed) returns
  // a STALE snapshot: we then let the edit write and complete before approval
  // proceeds to write its stamp.
  (storage as any).getDocumentById = async (id: string) => {
    const doc = await origGet(id);
    if (!staleReadForced && id === tfrDocId) {
      const d = await storage.getDealById(deal.value.id);
      if (d?.tradeRef) {
        staleReadForced = true;
        releaseEditWrite();
        await editWrote;
      }
    }
    return doc;
  };

  let edit: Awaited<ReturnType<typeof updateDealTfrDetails>>;
  let approve: Awaited<ReturnType<typeof approveTfrForDeal>>;
  try {
    const editP = updateDealTfrDetails(deal.value.id, { addressedToName: bankName });
    await claimDone; // edit has won the claim; now run the approval
    const approveP = approveTfrForDeal(deal.value.id, "Det Admin 4");
    [edit, approve] = await Promise.all([editP, approveP]);
  } finally {
    (storage as any).updateDealTfrDetailsIfPending = origClaim;
    (storage as any).updateDocument = origUpd;
    (storage as any).getDocumentById = origGet;
  }

  assert.ok(staleReadForced, "the stale-read window was actually forced");
  assert.ok(edit.ok, "the edit won the claim and must fully apply");
  assert.ok(approve.ok, "approval must succeed");
  const finalDeal = await storage.getDealById(deal.value.id);
  assert.equal(finalDeal?.tfrManualDetails?.addressedToName, bankName, "edit's details persisted on the deal");
  const doc = await storage.getDocumentById(tfrDocId);
  assert.ok(doc!.content.includes(bankName), "winning edit's content NOT clobbered by the stale-snapshot stamp");
  assert.equal(stampCount(doc!.content), 1, "approval stamp present exactly once");
  assert.ok(doc!.content.includes(approve.value.createdTradeRef), "stamp cites the trade ref");
  // Downloadable artifacts match the canonical stamped content too.
  assert.ok(doc!.docxPath && doc!.pdfPath, "files present");
  const docx = docxText(doc!.docxPath!);
  assert.equal(stampCount(docx), 1, "DOCX stamped exactly once");
  assert.ok(docx.includes(bankName), "DOCX carries the winning edit's details");
  const pdf = pdfText(doc!.pdfPath!);
  assert.equal(stampCount(pdf), 1, "PDF stamped exactly once");
  assert.ok(pdf.includes(bankName), "PDF carries the winning edit's details");
});

test("deterministic: approval wins BEFORE the edit's conditional claim — edit rejected with 409, stamped doc untouched", async () => {
  const imp = await makeImport("DC");
  const exp = await makeExport("DC");
  const deal = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.ok(deal.ok);
  createdDealIds.push(deal.value.id);
  const bankName = `Det Loser Bank ${RUN}`;

  // Hook: the edit passes its early pre-checks (deal still looks pending),
  // then approval completes JUST BEFORE the conditional claim executes.
  const orig = storage.updateDealTfrDetailsIfPending.bind(storage);
  let approveResult: Awaited<ReturnType<typeof approveTfrForDeal>> | undefined;
  (storage as any).updateDealTfrDetailsIfPending = async (id: string, details: Record<string, string>) => {
    approveResult = await approveTfrForDeal(deal.value.id, "Det Admin 3");
    return orig(id, details);
  };
  let edit: Awaited<ReturnType<typeof updateDealTfrDetails>>;
  try {
    edit = await updateDealTfrDetails(deal.value.id, { addressedToName: bankName });
  } finally {
    (storage as any).updateDealTfrDetailsIfPending = orig;
  }

  assert.ok(approveResult?.ok, "approval must win");
  assert.ok(!edit.ok && edit.status === 409, "edit loses the claim with 409");
  const finalDeal = await storage.getDealById(deal.value.id);
  assert.notEqual(finalDeal?.tfrManualDetails?.addressedToName, bankName, "no post-approval details on the deal");
  const doc = await storage.getDocumentById(deal.value.tfrDocId!);
  assert.ok(!doc!.content.includes(bankName), "no post-approval details in the doc");
  assert.equal(stampCount(doc!.content), 1, "stamped doc untouched by the losing edit");
});

test("deterministic: cancellation lands AFTER the edit's conditional claim — edit fails cleanly, nothing resurrected", async () => {
  const imp = await makeImport("DD");
  const exp = await makeExport("DD");
  const deal = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.ok(deal.ok);
  const docIds = [
    deal.value.loiDocId, deal.value.scoDocId, deal.value.dealRecapImportDocId,
    deal.value.dealRecapExportDocId, deal.value.tfrDocId,
  ].filter(Boolean) as string[];

  // Hook: the edit wins the conditional claim, then the FULL cancellation
  // (deal + cascade docs deleted) runs before the edit writes the document.
  const orig = storage.updateDealTfrDetailsIfPending.bind(storage);
  let cancelResult: Awaited<ReturnType<typeof cancelDealTfr>> | undefined;
  (storage as any).updateDealTfrDetailsIfPending = async (id: string, details: Record<string, string>) => {
    const claimed = await orig(id, details);
    cancelResult = await cancelDealTfr(deal.value.id);
    return claimed;
  };
  let edit: Awaited<ReturnType<typeof updateDealTfrDetails>>;
  try {
    edit = await updateDealTfrDetails(deal.value.id, { addressedToName: `Det Cancel Bank ${RUN}` });
  } finally {
    (storage as any).updateDealTfrDetailsIfPending = orig;
  }

  assert.ok(cancelResult?.ok, "cancellation in the window must succeed (deal was still unapproved)");
  assert.ok(!edit.ok && edit.status === 409, "edit fails cleanly once its document vanished mid-flight");
  assert.equal(await storage.getDealById(deal.value.id), undefined, "deal stays deleted — edit resurrected nothing");
  for (const id of docIds) {
    assert.equal(await storage.getDocumentById(id), undefined, "cascade docs stay deleted");
  }
});

test("deterministic: cancellation wins BEFORE the edit's conditional claim — edit rejected, deal gone", async () => {
  const imp = await makeImport("DE");
  const exp = await makeExport("DE");
  const deal = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.ok(deal.ok);

  const orig = storage.updateDealTfrDetailsIfPending.bind(storage);
  let cancelResult: Awaited<ReturnType<typeof cancelDealTfr>> | undefined;
  (storage as any).updateDealTfrDetailsIfPending = async (id: string, details: Record<string, string>) => {
    cancelResult = await cancelDealTfr(deal.value.id);
    return orig(id, details);
  };
  let edit: Awaited<ReturnType<typeof updateDealTfrDetails>>;
  try {
    edit = await updateDealTfrDetails(deal.value.id, { addressedToName: `Det Cancel First Bank ${RUN}` });
  } finally {
    (storage as any).updateDealTfrDetailsIfPending = orig;
  }

  assert.ok(cancelResult?.ok, "cancellation must win");
  assert.ok(!edit.ok && edit.status === 409, "edit's conditional claim matches nothing after deletion — 409");
  assert.equal(await storage.getDealById(deal.value.id), undefined, "deal stays deleted");
});

test("manual details on a candidate TFR: allowlist enforced, doc regenerated, recipient saved, details persist", async () => {
  const imp = await makeImport("CD");
  const exp = await makeExport("CD");
  const c = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
  assert.ok(c.ok);
  createdCandidateIds.push(c.value.id);

  const bankName = `Candidate Test Bank ${RUN}`;
  const updated = await updateTfrCandidateDetails(c.value.id, {
    addressedToName: bankName,
    addressedToAddress: "9 Harbour Road, Singapore",
    buyerBank: "Cand Buyer Bank AG",
    additionalDetails: "Candidate-stage note.",
    emptyIgnored: "   ",
    reference: "HACKED-REF", // not allowlisted — must be dropped
  });
  assert.ok(updated.ok, "candidate details update succeeds");
  assert.equal(updated.value.manualDetails?.addressedToName, bankName);
  assert.equal(updated.value.manualDetails?.emptyIgnored, undefined, "blank values dropped");
  assert.equal(updated.value.manualDetails?.reference, undefined, "non-allowlisted keys dropped");

  const doc = await storage.getDocumentById(c.value.tfrDocId!);
  assert.ok(doc?.content.includes(bankName), "candidate TFR content carries the manual addressee");
  assert.ok(doc?.content.includes("Cand Buyer Bank AG"), "banking assessment rendered");
  assert.ok(!doc?.content.includes("HACKED-REF"), "dropped keys never reach the document");

  const saved = (await storage.getTfrRecipients()).find(r => r.name === bankName);
  assert.ok(saved, "addressee stored in recipients directory");
  assert.equal(saved!.address, "9 Harbour Road, Singapore");

  // Details survive on the candidate row for later comparison/graduation.
  const persisted = await storage.getTfrCandidateById(c.value.id);
  assert.equal(persisted?.manualDetails?.addressedToName, bankName);
});

test("candidate manual details carry into the deal-backed TFR on Create Deal from this TFR", async () => {
  const imp = await makeImport("CG");
  const exp = await makeExport("CG");
  const c = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
  assert.ok(c.ok);
  createdCandidateIds.push(c.value.id);

  const bankName = `Graduating Bank ${RUN}`;
  const upd = await updateTfrCandidateDetails(c.value.id, {
    addressedToName: bankName,
    workingCapitalRequired: "USD 2,500,000",
  });
  assert.ok(upd.ok);

  const deal = await createDealFromTfrCandidate(c.value.id);
  assert.ok(deal.ok, "deal created from candidate");
  createdDealIds.push(deal.value.id);

  assert.equal(deal.value.tfrManualDetails?.addressedToName, bankName, "manual details copied onto the deal");
  assert.equal(deal.value.tfrManualDetails?.workingCapitalRequired, "USD 2,500,000");
  const dealTfr = await storage.getDocumentById(deal.value.tfrDocId!);
  assert.ok(dealTfr?.content.includes(bankName), "deal-backed TFR carries the candidate's manual addressee");
  assert.ok(dealTfr?.content.includes("USD 2,500,000"), "financing details carried over");

  // Inactive candidate: details are locked.
  const locked = await updateTfrCandidateDetails(c.value.id, { addressedToName: "Too Late Bank" });
  assert.ok(!locked.ok && locked.status === 409, "graduated candidate details are locked");
});

test("forming a deal directly also cancels overlapping active candidates", async () => {
  const imp = await makeImport("E");
  const exp = await makeExport("E1");
  const expOther = await makeExport("E2");

  const c = await prepareTfrCandidate(imp.enquiryRef, expOther.enquiryRef);
  assert.ok(c.ok);
  createdCandidateIds.push(c.value.id);
  const cDocId = c.value.tfrDocId!;

  const deal = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.ok(deal.ok);
  createdDealIds.push(deal.value.id);

  const after1 = await storage.getTfrCandidateById(c.value.id);
  assert.equal(after1?.status, "cancelled", "direct deal formation cancels overlapping candidates");
  assert.equal(await storage.getDocumentById(cDocId), undefined);
});

// ---- Full-document TFR text editing --------------------------------------

test("full TFR text edit: candidate content replaced while active, refused after cancel", async () => {
  const imp = await makeImport("FT1");
  const exp = await makeExport("FT1");
  const c = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
  assert.ok(c.ok);
  createdCandidateIds.push(c.value.id);

  const newText = `TRADE FACILITATION REQUEST (edited)\n\nOnly the sections we need. Run ${RUN}.`;
  const edited = await updateTfrCandidateContent(c.value.id, newText);
  assert.ok(edited.ok, "active candidate full-text edit should succeed");
  const doc = await storage.getDocumentById(c.value.tfrDocId!);
  assert.equal(doc!.content, newText, "document carries the manually edited text verbatim");

  // Empty / non-string content is rejected.
  const empty = await updateTfrCandidateContent(c.value.id, "   ");
  assert.ok(!empty.ok && empty.status === 400);

  const cancelled = await cancelTfrCandidate(c.value.id);
  assert.ok(cancelled.ok);
  const late = await updateTfrCandidateContent(c.value.id, "too late");
  assert.ok(!late.ok && late.status === 409, "cancelled candidate refuses full-text edits");
});

test("full TFR text edit: deal TFR editable while pending, locked after approval", async () => {
  const imp = await makeImport("FT2");
  const exp = await makeExport("FT2");
  const deal = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.ok(deal.ok);
  createdDealIds.push(deal.value.id);

  const newText = `TRADE FACILITATION REQUEST (deal, edited)\n\nCustom section set. Run ${RUN}.`;
  const edited = await updateDealTfrContent(deal.value.id, newText);
  assert.ok(edited.ok, "pending deal TFR full-text edit should succeed");
  const doc = await storage.getDocumentById(deal.value.tfrDocId!);
  assert.equal(doc!.content, newText);

  const approved = await approveTfrForDeal(deal.value.id, "FT2 Admin");
  assert.ok(approved.ok);
  const late = await updateDealTfrContent(deal.value.id, "post-approval rewrite");
  assert.ok(!late.ok && late.status === 409, "approved TFR refuses full-text edits");
  // Approval stamp survives on top of the manual text.
  const stamped = await storage.getDocumentById(deal.value.tfrDocId!);
  assert.ok(stamped!.content!.startsWith(newText), "manual text retained");
  assert.ok(stamped!.content!.includes("ADMIN DIGITAL APPROVAL"), "approval stamp appended");
});

// ---- Manual-edit protection: details save vs full-text edits ---------------

test("deal details save is refused after a manual full-text edit unless confirmed", async () => {
  const imp = await makeImport("MP1");
  const exp = await makeExport("MP1");
  const deal = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.ok(deal.ok);
  createdDealIds.push(deal.value.id);

  // A details save on the untouched (template) TFR needs no confirmation.
  const plain = await updateDealTfrDetails(deal.value.id, { addressedToName: `MP1 Bank ${RUN}` });
  assert.ok(plain.ok, "unedited TFR accepts a details save without confirmation");

  // Manually edit the full text, then attempt a details save without confirm.
  const manualText = `TRADE FACILITATION REQUEST (manually trimmed)\n\nOnly the relevant sections. Run ${RUN}.`;
  const edited = await updateDealTfrContent(deal.value.id, manualText);
  assert.ok(edited.ok);

  const blocked = await updateDealTfrDetails(deal.value.id, { addressedToName: `MP1 Bank v2 ${RUN}` });
  assert.ok(!blocked.ok && blocked.status === 409, "details save on edited TFR must 409");
  assert.ok(blocked.ok === false && /manually edited/i.test(blocked.message), "conflict message names manual edits");
  const docAfterBlock = await storage.getDocumentById(deal.value.tfrDocId!);
  assert.equal(docAfterBlock!.content, manualText, "manual text untouched by the refused save");
  const dealAfterBlock = await storage.getDealById(deal.value.id);
  assert.notEqual(dealAfterBlock?.tfrManualDetails?.addressedToName, `MP1 Bank v2 ${RUN}`, "refused save persisted nothing");

  // Explicit confirmation rebuilds from the template with the new details.
  const confirmed = await updateDealTfrDetails(deal.value.id, {
    addressedToName: `MP1 Bank v2 ${RUN}`,
    confirmRebuild: true,
  });
  assert.ok(confirmed.ok, "confirmed rebuild succeeds");
  const rebuilt = await storage.getDocumentById(deal.value.tfrDocId!);
  assert.ok(!rebuilt!.content.includes("manually trimmed"), "confirmed rebuild replaced the manual text");
  assert.ok(rebuilt!.content.includes(`MP1 Bank v2 ${RUN}`), "rebuilt content carries the new details");

  // After the confirmed rebuild the content matches the template again, so a
  // further details save needs no confirmation.
  const followUp = await updateDealTfrDetails(deal.value.id, { addressedToName: `MP1 Bank v3 ${RUN}` });
  assert.ok(followUp.ok, "post-rebuild details save needs no confirmation");
});

test("candidate details save is refused after a manual full-text edit unless confirmed", async () => {
  const imp = await makeImport("MP2");
  const exp = await makeExport("MP2");
  const c = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
  assert.ok(c.ok);
  createdCandidateIds.push(c.value.id);

  const manualText = `TRADE FACILITATION REQUEST (candidate, manually trimmed)\n\nRun ${RUN}.`;
  const edited = await updateTfrCandidateContent(c.value.id, manualText);
  assert.ok(edited.ok);

  const blocked = await updateTfrCandidateDetails(c.value.id, { addressedToName: `MP2 Bank ${RUN}` });
  assert.ok(!blocked.ok && blocked.status === 409, "candidate details save on edited TFR must 409");
  const docAfterBlock = await storage.getDocumentById(c.value.tfrDocId!);
  assert.equal(docAfterBlock!.content, manualText, "candidate manual text untouched");

  const confirmed = await updateTfrCandidateDetails(c.value.id, {
    addressedToName: `MP2 Bank ${RUN}`,
    confirmRebuild: true,
  });
  assert.ok(confirmed.ok, "confirmed candidate rebuild succeeds");
  const rebuilt = await storage.getDocumentById(c.value.tfrDocId!);
  assert.ok(!rebuilt!.content.includes("manually trimmed"), "candidate rebuild replaced the manual text");
  assert.ok(rebuilt!.content.includes(`MP2 Bank ${RUN}`), "candidate rebuild carries the new details");
});

// ---- No false manual-edit warning when enquiry data drifts ------------------

test("deal details save needs no confirmation when enquiry data changed after the TFR was built", async () => {
  const imp = await makeImport("MP3");
  const exp = await makeExport("MP3");
  const deal = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.ok(deal.ok);
  createdDealIds.push(deal.value.id);

  // Simulate the enquiry drifting AFTER the TFR was generated: prices, party
  // names and ports all change. The document text was never manually edited,
  // so a details save must NOT demand a rebuild confirmation.
  await pool.query(
    `UPDATE trade_enquiries SET price = '9999', buyer_name = $2, loading_port = 'Mombasa' WHERE id = $1`,
    [imp.id, `Drifted Buyer MP3 ${RUN}`],
  );

  const saved = await updateDealTfrDetails(deal.value.id, { addressedToName: `MP3 Bank ${RUN}` });
  assert.ok(saved.ok, "untouched TFR with drifted enquiry data saves without confirmation");
  const doc = await storage.getDocumentById(deal.value.tfrDocId!);
  assert.ok(doc!.content.includes(`MP3 Bank ${RUN}`), "details applied");
  assert.equal(doc!.contentManuallyEdited, false, "rebuild leaves the manual-edit flag clear");

  // A real manual edit still trips the guard even after further drift.
  const manualText = `TRADE FACILITATION REQUEST (MP3 manual)\n\nRun ${RUN}.`;
  const edited = await updateDealTfrContent(deal.value.id, manualText);
  assert.ok(edited.ok);
  await pool.query(`UPDATE trade_enquiries SET price = '10101' WHERE id = $1`, [exp.id]);
  const blocked = await updateDealTfrDetails(deal.value.id, { addressedToName: `MP3 Bank v2 ${RUN}` });
  assert.ok(!blocked.ok && blocked.status === 409, "genuine manual edit still requires confirmation");
});

test("candidate details save needs no confirmation when enquiry data changed after the TFR was built", async () => {
  const imp = await makeImport("MP4");
  const exp = await makeExport("MP4");
  const c = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
  assert.ok(c.ok);
  createdCandidateIds.push(c.value.id);

  await pool.query(
    `UPDATE trade_enquiries SET price = '8888', seller_name = $2 WHERE id = $1`,
    [exp.id, `Drifted Trader MP4 ${RUN}`],
  );

  const saved = await updateTfrCandidateDetails(c.value.id, { addressedToName: `MP4 Bank ${RUN}` });
  assert.ok(saved.ok, "untouched candidate TFR with drifted enquiry data saves without confirmation");
  const doc = await storage.getDocumentById(c.value.tfrDocId!);
  assert.ok(doc!.content.includes(`MP4 Bank ${RUN}`), "candidate details applied");
  assert.equal(doc!.contentManuallyEdited, false, "candidate rebuild leaves the manual-edit flag clear");
});

// ---------------------------------------------------------------------------
// LOI/FCO as the TFR basis: when basis documents exist for the linked
// enquiries, their rendered terms take precedence over raw enquiry fields.
// ---------------------------------------------------------------------------

test("a pre-existing accepted FCO overrides export enquiry terms in the candidate TFR", async () => {
  const imp = await makeImport("BAS");
  const exp = await makeExport("BAS", "9000");
  // FCO issued for the export enquiry at a renegotiated price of 9,750.
  const fco = await storage.createDocument({
    docType: "FCO",
    title: `Basis FCO ${RUN}`,
    content: [
      "FULL CORPORATE OFFER",
      `Buyer: Basis Final Buyer ${RUN}`,
      `Seller: Cand Trader BAS ${RUN}`,
      `Commodity: ${PRODUCT}`,
      "Quantity: 1000 MT",
      "Unit Price: USD 9750",
      "Incoterm: CIF",
      "Discharge Port: Qingdao",
      "Payment Terms: LC at sight",
    ].join("\n"),
    status: "accepted",
  } as any);
  await pool.query(`UPDATE documents SET enquiry_ref = $1 WHERE id = $2`, [exp.enquiryRef, fco.id]);
  try {
    const c = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
    assert.ok(c.ok, "candidate should prepare");
    if (!c.ok) return;
    createdCandidateIds.push(c.value.id);
    const doc = await storage.getDocumentById(c.value.tfrDocId!);
    const content = doc?.content || "";
    assert.match(content, /USD 9,?750/, "TFR price should come from the FCO, not the enquiry");
    assert.match(content, /Qingdao/, "TFR discharge port should come from the FCO");
    assert.match(content, /LC at sight/, "TFR payment terms should come from the FCO");
    assert.match(content, /Basis Documents: .*FCO: Basis FCO/, "TFR should cite its basis documents");
    // Gross profit reflects the FCO sale price: (9750-8000)*1000
    assert.match(content, /1,750,000/, "gross profit should use the FCO price");
  } finally {
    try { await storage.deleteDocument(fco.id); } catch {}
  }
});

test("deal cascade TFR derives from the cascade's own LOI/SCO when no external basis docs exist", async () => {
  const imp = await makeImport("CAS");
  const exp = await makeExport("CAS", "9100");
  const created = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.ok(created.ok, "deal should form");
  if (!created.ok) return;
  createdDealIds.push(created.value.id);
  const deal = await storage.getDealById(created.value.id);
  const tfr = await storage.getDocumentById(deal!.tfrDocId!);
  const content = tfr?.content || "";
  // Cascade LOI/SCO are generated from the enquiries, so the TFR round-trips
  // the same commercial terms and cites both instruments as its basis.
  assert.match(content, /USD 9,?100/, "sale price flows through the SCO into the TFR");
  assert.match(content, /Basis Documents: LOI: .*SCO: /, "cascade TFR cites LOI and SCO as basis");
});

test("a rejected FCO is never used as TFR basis — enquiry terms stand", async () => {
  const imp = await makeImport("REJ");
  const exp = await makeExport("REJ", "9000");
  const rejected = await storage.createDocument({
    docType: "FCO",
    title: `Rejected FCO ${RUN}`,
    content: ["FULL CORPORATE OFFER", "Unit Price: USD 5000", "Discharge Port: Nowhere"].join("\n"),
    status: "rejected",
  } as any);
  await pool.query(`UPDATE documents SET enquiry_ref = $1 WHERE id = $2`, [exp.enquiryRef, rejected.id]);
  try {
    const c = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
    assert.ok(c.ok, "candidate should prepare");
    if (!c.ok) return;
    createdCandidateIds.push(c.value.id);
    const content = (await storage.getDocumentById(c.value.tfrDocId!))?.content || "";
    assert.match(content, /USD 9,?000/, "TFR keeps the enquiry price");
    assert.doesNotMatch(content, /Nowhere/, "rejected FCO terms must not leak into the TFR");
    assert.doesNotMatch(content, /Rejected FCO/, "rejected FCO must not be cited as basis");
  } finally {
    try { await storage.deleteDocument(rejected.id); } catch {}
  }
});

// ---------------------------------------------------------------------------
// Basis-document precedence: an amendment-requested doc never supersedes an
// older accepted one; among accepted versions the newest wins; and the LOI
// (import) side follows the same rules as the FCO (export) side.
// ---------------------------------------------------------------------------

// Create a basis doc bound to an enquiry with a controlled created_at and
// recipient_response so precedence between versions is deterministic.
async function makeBasisDoc(opts: {
  docType: string;
  title: string;
  content: string;
  status: string;
  recipientResponse?: string | null;
  enquiryRef: string;
  createdAt: Date;
}): Promise<string> {
  const doc = await storage.createDocument({
    docType: opts.docType,
    title: opts.title,
    content: opts.content,
    status: opts.status,
  } as any);
  await pool.query(
    `UPDATE documents SET enquiry_ref = $1, recipient_response = $2, created_at = $3 WHERE id = $4`,
    [opts.enquiryRef, opts.recipientResponse ?? null, opts.createdAt, doc.id],
  );
  return doc.id;
}

const fcoContent = (price: string, port: string) => [
  "FULL CORPORATE OFFER",
  `Commodity: ${PRODUCT}`,
  "Quantity: 1000 MT",
  `Unit Price: USD ${price}`,
  "Incoterm: CIF",
  `Discharge Port: ${port}`,
  "Payment Terms: LC at sight",
].join("\n");

// LOI content in the fixed-table format parseLoiForSpa understands.
const loiContent = (price: string, port: string) => [
  "LETTER OF INTENT",
  `01 │ Commodity │ ${PRODUCT}`,
  "02 │ Origin │ Zambia",
  "03 │ Quantity │ 1000 MT",
  "04 │ Incoterm │ FOB",
  `06 │ Price │ USD ${price}`,
  `Discharge Port: ${port}`,
].join("\n");

test("a newer amendment-requested FCO never supersedes the older accepted FCO", async () => {
  const imp = await makeImport("AMX");
  const exp = await makeExport("AMX", "9000");
  const t0 = new Date(Date.now() - 60_000);
  const t1 = new Date();
  const oldId = await makeBasisDoc({
    docType: "FCO", title: `Accepted FCO AMX ${RUN}`,
    content: fcoContent("9750", "Qingdao"),
    status: "accepted", enquiryRef: exp.enquiryRef!, createdAt: t0,
  });
  // Client requested an amendment on the newer version: status stays
  // 'accepted' but recipientResponse='rejected' disqualifies it.
  const amendedId = await makeBasisDoc({
    docType: "FCO", title: `Amended FCO AMX ${RUN}`,
    content: fcoContent("5000", "NowherePort"),
    status: "accepted", recipientResponse: "rejected",
    enquiryRef: exp.enquiryRef!, createdAt: t1,
  });
  try {
    const c = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
    assert.ok(c.ok, "candidate should prepare");
    if (!c.ok) return;
    createdCandidateIds.push(c.value.id);
    const content = (await storage.getDocumentById(c.value.tfrDocId!))?.content || "";
    assert.match(content, /USD 9,?750/, "terms come from the older ACCEPTED FCO");
    assert.match(content, /Qingdao/, "discharge port comes from the accepted FCO");
    assert.doesNotMatch(content, /NowherePort/, "amendment-requested FCO terms must not leak in");
    assert.doesNotMatch(content, /USD 5,?000/, "amendment-requested FCO price must not leak in");
    assert.match(content, new RegExp(`Basis Documents: .*FCO: Accepted FCO AMX ${RUN}`),
      "basis line cites the accepted FCO");
    assert.doesNotMatch(content, /Amended FCO AMX/, "amendment-requested FCO must not be cited as basis");
    assert.match(content, /1,750,000/, "gross profit uses the accepted FCO price: (9750-8000)*1000");
  } finally {
    for (const id of [oldId, amendedId]) { try { await storage.deleteDocument(id); } catch {} }
  }
});

test("among multiple accepted FCO versions, the newest accepted one wins", async () => {
  const imp = await makeImport("VER");
  const exp = await makeExport("VER", "9000");
  const t0 = new Date(Date.now() - 60_000);
  const t1 = new Date();
  const v1 = await makeBasisDoc({
    docType: "FCO", title: `FCO v1 VER ${RUN}`,
    content: fcoContent("9200", "Busan"),
    status: "accepted", enquiryRef: exp.enquiryRef!, createdAt: t0,
  });
  const v2 = await makeBasisDoc({
    docType: "FCO", title: `FCO v2 VER ${RUN}`,
    content: fcoContent("9800", "Yokohama"),
    status: "accepted", recipientResponse: "accepted",
    enquiryRef: exp.enquiryRef!, createdAt: t1,
  });
  try {
    const c = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
    assert.ok(c.ok, "candidate should prepare");
    if (!c.ok) return;
    createdCandidateIds.push(c.value.id);
    const content = (await storage.getDocumentById(c.value.tfrDocId!))?.content || "";
    assert.match(content, /USD 9,?800/, "price comes from the NEWEST accepted FCO");
    assert.match(content, /Yokohama/, "discharge port comes from the newest accepted FCO");
    assert.doesNotMatch(content, /Busan/, "older accepted FCO terms must not be used");
    assert.match(content, new RegExp(`Basis Documents: .*FCO: FCO v2 VER ${RUN}`),
      "basis line cites the newest accepted version");
    assert.doesNotMatch(content, /FCO v1 VER/, "older version must not be cited as basis");
    assert.match(content, /1,800,000/, "gross profit uses the newest accepted price: (9800-8000)*1000");
  } finally {
    for (const id of [v1, v2]) { try { await storage.deleteDocument(id); } catch {} }
  }
});

test("two accepted FCO versions sharing created_at pick a deterministic, stable winner", async () => {
  const imp = await makeImport("TIE");
  const exp = await makeExport("TIE", "9000");
  // Same millisecond for both versions (bulk import / fast auto-chain case):
  // created_at alone cannot order them, so the id tie-breaker must decide.
  const t = new Date(Date.now() - 30_000);
  const idA = await makeBasisDoc({
    docType: "FCO", title: `FCO tieA TIE ${RUN}`,
    content: fcoContent("9100", "Hamburg"),
    status: "accepted", enquiryRef: exp.enquiryRef!, createdAt: t,
  });
  const idB = await makeBasisDoc({
    docType: "FCO", title: `FCO tieB TIE ${RUN}`,
    content: fcoContent("9300", "Antwerp"),
    status: "accepted", enquiryRef: exp.enquiryRef!, createdAt: t,
  });
  try {
    // The deterministic winner is the doc with the greater id (DESC id
    // tie-breaker) — whichever of the two that happens to be.
    const winnerId = idA > idB ? idA : idB;
    const winnerTitle = winnerId === idA ? `FCO tieA TIE ${RUN}` : `FCO tieB TIE ${RUN}`;
    const loserTitle = winnerId === idA ? `FCO tieB TIE ${RUN}` : `FCO tieA TIE ${RUN}`;

    // The storage query itself must order deterministically — repeatedly.
    for (let i = 0; i < 3; i++) {
      const docs = await storage.getBasisDocsForEnquiry(exp.enquiryRef!, ["FCO"]);
      const tied = docs.filter((d) => d.id === idA || d.id === idB);
      assert.equal(tied.length, 2, "both tied versions are eligible");
      assert.equal(tied[0].id, winnerId, `run ${i}: greater id wins the created_at tie`);
    }

    // And the TFR builder cites that same stable winner.
    const c = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
    assert.ok(c.ok, "candidate should prepare");
    if (!c.ok) return;
    createdCandidateIds.push(c.value.id);
    const content = (await storage.getDocumentById(c.value.tfrDocId!))?.content || "";
    assert.match(content, new RegExp(`Basis Documents: .*FCO: ${winnerTitle}`),
      "basis line cites the deterministic winner");
    assert.ok(!content.includes(loserTitle), "the tied loser must not be cited as basis");
  } finally {
    for (const id of [idA, idB]) { try { await storage.deleteDocument(id); } catch {} }
  }
});

test("LOI-side precedence: accepted LOI overrides import enquiry terms; a newer amendment-requested LOI is ignored", async () => {
  const imp = await makeImport("LAM"); // enquiry price 8000
  const exp = await makeExport("LAM", "9000");
  const t0 = new Date(Date.now() - 60_000);
  const t1 = new Date();
  const acceptedLoi = await makeBasisDoc({
    docType: "LOI", title: `Accepted LOI LAM ${RUN}`,
    content: loiContent("8500", "Rotterdam"),
    status: "accepted", enquiryRef: imp.enquiryRef!, createdAt: t0,
  });
  const amendedLoi = await makeBasisDoc({
    docType: "LOI", title: `Amended LOI LAM ${RUN}`,
    content: loiContent("7000", "GhostHarbour"),
    status: "accepted", recipientResponse: "rejected",
    enquiryRef: imp.enquiryRef!, createdAt: t1,
  });
  try {
    const c = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
    assert.ok(c.ok, "candidate should prepare");
    if (!c.ok) return;
    createdCandidateIds.push(c.value.id);
    const content = (await storage.getDocumentById(c.value.tfrDocId!))?.content || "";
    assert.match(content, /USD 8,?500/, "purchase price comes from the accepted LOI, not the enquiry");
    assert.match(content, /Rotterdam/, "import destination comes from the accepted LOI");
    assert.doesNotMatch(content, /GhostHarbour/, "amendment-requested LOI terms must not leak in");
    assert.doesNotMatch(content, /USD 7,?000/, "amendment-requested LOI price must not leak in");
    assert.match(content, new RegExp(`Basis Documents: LOI: Accepted LOI LAM ${RUN}`),
      "basis line cites the accepted LOI");
    assert.doesNotMatch(content, /Amended LOI LAM/, "amendment-requested LOI must not be cited as basis");
    assert.match(content, /500,000/, "gross profit uses the LOI purchase price: (9000-8500)*1000");
  } finally {
    for (const id of [acceptedLoi, amendedLoi]) { try { await storage.deleteDocument(id); } catch {} }
  }
});
