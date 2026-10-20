// Legacy hand-edited TFR backfill: TFRs whose full text was edited before the
// contentManuallyEdited flag existed must be flagged by the one-time startup
// backfill so a details save still requires the rebuild confirmation, while
// untouched TFRs (content matching a fresh template rebuild) stay unflagged.
//
// Service-layer tests against the real dev DB (session cookies are secure:true
// so authed HTTP doesn't work over plain-HTTP test clients).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { storage, pool } from "../storage";
import {
  prepareTfrCandidate,
  backfillTfrManualEditFlags,
  normalizeTfrContentForComparison,
  tfrContentDivergesFromRebuild,
  updateTfrCandidateDetails,
  TFR_MANUAL_EDIT_CONFLICT_MESSAGE,
  TFR_MANUAL_EDIT_BACKFILL_SETTING,
} from "../routes";
import type { TradeEnquiry } from "@shared/schema";

const RUN = Date.now().toString(36);
const rand3 = () =>
  Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
const CREATOR = `${rand3()} backfill tester ${RUN}`;
const PRODUCT = `${rand3()}BKFILLTEST-${RUN}`;

const createdEnquiryIds: string[] = [];
const createdCandidateIds: string[] = [];

async function makeEnquiry(side: "buy" | "sell", suffix: string, price: string): Promise<TradeEnquiry> {
  const e = await storage.createTradeEnquiry({
    side,
    product: PRODUCT,
    quantity: "1000",
    unit: "MT",
    price,
    currency: "USD",
    ...(side === "buy"
      ? { origin: "Zambia", loadingPort: "Dar es Salaam", incoterms: "FOB" }
      : { dischargePort: "Shanghai", incoterms: "CIF" }),
    buyerName: `Bkfill Buyer ${suffix} ${RUN}`,
    sellerName: `Bkfill Seller ${suffix} ${RUN}`,
    createdBy: CREATOR,
    status: "active",
  } as any);
  createdEnquiryIds.push(e.id);
  return e;
}

async function makeCandidate(suffix: string) {
  const imp = await makeEnquiry("buy", `${suffix}i`, "8000");
  const exp = await makeEnquiry("sell", `${suffix}e`, "9000");
  const res = await prepareTfrCandidate(imp.enquiryRef, exp.enquiryRef);
  assert.ok(res.ok, `candidate preparation failed: ${(res as any).message}`);
  const candidate = (res as any).value;
  createdCandidateIds.push(candidate.id);
  return candidate;
}

before(() => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL must be set to run these tests");
});

after(async () => {
  for (const id of createdCandidateIds) {
    try {
      const c = await storage.getTfrCandidateById(id);
      if (c?.tfrDocId) await storage.deleteDocument(c.tfrDocId).catch(() => {});
      await storage.deleteTfrCandidate(id);
    } catch {}
  }
  for (const id of createdEnquiryIds) {
    try { await storage.deleteTradeEnquiry(id); } catch {}
  }
  await pool.end();
});

test("comparison normalization ignores the Date line and whitespace, catches real edits", () => {
  const a = "TRANSACTION FEASIBILITY REPORT\n\nDate: 1 Jan 2026\nReference: X\nBody line";
  const b = "TRANSACTION FEASIBILITY REPORT\r\n\r\nDate: 11 Aug 2026\r\nReference: X\r\nBody line  ";
  assert.equal(tfrContentDivergesFromRebuild(a, b), false);
  const edited = a.replace("Body line", "Body line — hand-edited clause");
  assert.equal(tfrContentDivergesFromRebuild(edited, b), true);
  assert.equal(normalizeTfrContentForComparison("Date: today\nX\n"), "X");
});

test("backfill flags a legacy hand-edited TFR but leaves an untouched TFR unflagged", async () => {
  const untouched = await makeCandidate("A");
  const legacy = await makeCandidate("B");

  // Simulate a pre-flag manual edit: content rewritten, flag left false.
  const legacyDoc = await storage.getDocumentById(legacy.tfrDocId!);
  assert.ok(legacyDoc);
  await storage.updateDocument(legacyDoc!.id, {
    content: (legacyDoc!.content || "") + "\n\nHAND-EDITED SECTION ADDED BEFORE THE FLAG EXISTED",
    contentManuallyEdited: false,
  });

  const result = await backfillTfrManualEditFlags({ force: true });
  assert.equal(result.skipped, false);
  assert.ok(result.checked >= 2);

  const untouchedDoc = await storage.getDocumentById(untouched.tfrDocId!);
  assert.equal(untouchedDoc!.contentManuallyEdited, false, "untouched TFR must stay unflagged");
  const flaggedDoc = await storage.getDocumentById(legacy.tfrDocId!);
  assert.equal(flaggedDoc!.contentManuallyEdited, true, "legacy hand-edited TFR must be flagged");

  // The guard now fires on the flagged candidate...
  const save = await updateTfrCandidateDetails(legacy.id, { preparedBy: "Backfill Tester" });
  assert.ok(!save.ok && save.status === 409 && save.message === TFR_MANUAL_EDIT_CONFLICT_MESSAGE);
  // ...and a confirmed rebuild proceeds and clears the flag again.
  const confirmed = await updateTfrCandidateDetails(legacy.id, { preparedBy: "Backfill Tester", confirmRebuild: true });
  assert.ok(confirmed.ok, `confirmed rebuild failed: ${(confirmed as any).message}`);
  const rebuilt = await storage.getDocumentById(legacy.tfrDocId!);
  assert.equal(rebuilt!.contentManuallyEdited, false);
});

test("backfill runs once: guarded by the app setting unless forced", async () => {
  await storage.setAppSetting(TFR_MANUAL_EDIT_BACKFILL_SETTING, "done");
  const skipped = await backfillTfrManualEditFlags();
  assert.equal(skipped.skipped, true);
  const forced = await backfillTfrManualEditFlags({ force: true });
  assert.equal(forced.skipped, false);
});
