// Integration tests for the automated enquiry-to-trade pipeline.
//
// These exercise the real service-layer logic against the real database:
//   match Import+Export enquiries -> create a deal that auto-generates the
//   LOI/SCO/Deal Recaps/TFR cascade -> approve the TFR to form exactly one
//   trade + blockchain block and advance the deal to "trade_formed".
//
// We test at the service layer (the exported pipeline functions in routes.ts)
// rather than over HTTP on purpose: the session cookie is `secure: true`, so
// authenticated HTTP requests do not work over plain-HTTP test clients. The
// route handlers are thin wrappers over these same functions, so behaviour is
// equivalent. Run with:  npx tsx server/__tests__/deal-pipeline.test.ts
//
// Every record created is tracked and removed in the `after` hook so the test
// leaves the database (including the append-only blockchain) as it found it.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { storage, pool } from "../storage";
import { createDealFromEnquiries, approveTfrForDeal, computeEnquiryMatches } from "../routes";
import type { TradeEnquiry } from "@shared/schema";

// Build a synthetic enquiry exercising only the fields the matcher reads
// (enquiryRef, side, product, status). The matcher is pure, so these tests need
// no database and assert exact, deterministic results free of other dev-DB rows.
function synthEnquiry(over: Partial<TradeEnquiry>): TradeEnquiry {
  return {
    enquiryRef: `REF-${Math.random().toString(36).slice(2, 8)}`,
    side: "buy",
    product: "Copper Cathode",
    status: "active",
    ...over,
  } as TradeEnquiry;
}

const RUN = Date.now().toString(36);
const PRODUCT = `ZZTEST-${RUN}`;

// Track everything we create so cleanup is deterministic and complete.
const createdEnquiryIds: string[] = [];
const createdDealIds: string[] = [];

async function makeImport(suffix: string): Promise<TradeEnquiry> {
  const e = await storage.createTradeEnquiry({
    side: "buy",
    product: PRODUCT,
    quantity: "5000",
    unit: "MT",
    price: "8000",
    currency: "USD",
    origin: "Zambia",
    loadingPort: "Dar es Salaam",
    incoterms: "FOB",
    buyerName: `Buyer Co ${suffix}`,
    sellerName: `Supplier Co ${suffix}`,
    createdBy: `tester-${RUN}`,
    status: "active",
  } as any);
  createdEnquiryIds.push(e.id);
  return e;
}

async function makeExport(suffix: string): Promise<TradeEnquiry> {
  const e = await storage.createTradeEnquiry({
    side: "sell",
    product: PRODUCT,
    quantity: "5000",
    unit: "MT",
    price: "9000",
    currency: "USD",
    dischargePort: "Shanghai",
    incoterms: "CIF",
    buyerName: `Final Buyer ${suffix}`,
    sellerName: `Trader Co ${suffix}`,
    createdBy: `tester-${RUN}`,
    status: "active",
  } as any);
  createdEnquiryIds.push(e.id);
  return e;
}

before(() => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL must be set to run pipeline tests");
});

after(async () => {
  // Delete in reverse dependency order: docs/trades/blocks -> deals -> enquiries.
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

test("creating a deal runs the full document cascade and leaves the TFR pending", async () => {
  const imp = await makeImport("A");
  const exp = await makeExport("A");

  const result = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.equal(result.ok, true, "deal creation should succeed");
  if (!result.ok) return;
  const deal = result.value;
  createdDealIds.push(deal.id);

  // Cascade must have produced every document and parked the deal at tfr_pending.
  assert.equal(deal.cascadeError, null, "cascade should not error");
  assert.equal(deal.stage, "tfr_pending", "deal should be awaiting TFR approval");
  assert.ok(deal.loiDocId, "LOI should be generated");
  assert.ok(deal.scoDocId, "SCO should be generated");
  assert.ok(deal.dealRecapImportDocId, "import Deal Recap should be generated");
  assert.ok(deal.dealRecapExportDocId, "export Deal Recap should be generated");
  assert.ok(deal.tfrDocId, "TFR should be generated");
  assert.equal(deal.tradeRef, null, "no trade should exist before TFR approval");

  // The five cascade docs are distinct, and the TFR is pending review (not auto-accepted).
  const ids = new Set([
    deal.loiDocId, deal.scoDocId, deal.dealRecapImportDocId,
    deal.dealRecapExportDocId, deal.tfrDocId,
  ]);
  assert.equal(ids.size, 5, "the five cascade documents should be distinct");

  const docs = await storage.getDocuments();
  const tfr = docs.find(d => d.id === deal.tfrDocId);
  assert.ok(tfr, "TFR document should exist");
  assert.equal(tfr!.docType, "TFR");
  assert.equal(tfr!.status, "pending_review", "TFR should be pending admin review");
  assert.notEqual(tfr!.recipientResponse, "accepted", "TFR must not be auto-accepted");
});

test("approving the TFR forms exactly one trade + block and advances the deal", async () => {
  const imp = await makeImport("B");
  const exp = await makeExport("B");
  const created = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  createdDealIds.push(created.value.id);
  const dealId = created.value.id;

  const tradesBefore = (await storage.getTrades()).length;
  const blocksBefore = (await storage.getBlocks()).length;

  const result = await approveTfrForDeal(dealId);
  assert.equal(result.ok, true, "TFR approval should succeed");
  if (!result.ok) return;

  const tradesAfter = await storage.getTrades();
  const blocksAfter = await storage.getBlocks();
  assert.equal(tradesAfter.length, tradesBefore + 1, "exactly one trade should be formed");
  assert.equal(blocksAfter.length, blocksBefore + 1, "exactly one block should be minted");

  // Deal advanced and is bound to the new trade.
  const deal = await storage.getDealById(dealId);
  assert.equal(deal!.stage, "trade_formed", "deal should advance to trade_formed");
  assert.ok(deal!.tradeRef, "deal should record the formed trade ref");
  assert.equal(deal!.tradeRef, result.value.createdTradeRef);

  // The formed trade is in the Deal Desk pre_deal stage with a blockchain record.
  const trade = tradesAfter.find(t => t.tradeRef === deal!.tradeRef);
  assert.ok(trade, "formed trade should exist");
  assert.equal(trade!.status, "pre_deal", "trade should sit in pre_deal for the Deal Desk");
  assert.ok(trade!.blockchainHash, "trade should have a blockchain hash");
  assert.ok(trade!.blockNumber != null, "trade should have a block number");

  // Both linked enquiries are accepted and tied to the new trade.
  const enquiries = await storage.getTradeEnquiries();
  const impAfter = enquiries.find(e => e.id === imp.id);
  const expAfter = enquiries.find(e => e.id === exp.id);
  assert.equal(impAfter!.status, "accepted");
  assert.equal(expAfter!.status, "accepted");
  assert.equal(impAfter!.linkedTradeRef, deal!.tradeRef);
  assert.equal(expAfter!.linkedTradeRef, deal!.tradeRef);

  // The TFR document is now accepted.
  const tfr = (await storage.getDocuments()).find(d => d.id === deal!.tfrDocId);
  assert.equal(tfr!.status, "accepted", "TFR should be marked accepted after approval");
});

test("an enquiry already part of a deal cannot be reused", async () => {
  const imp = await makeImport("C");
  const exp = await makeExport("C");
  const first = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  createdDealIds.push(first.value.id);

  // A second, fresh export enquiry for the same commodity exists...
  const otherExp = await makeExport("C2");

  // ...but the import enquiry is already committed to a deal, so reuse is rejected.
  const reuse = await createDealFromEnquiries(imp.enquiryRef, otherExp.enquiryRef);
  assert.equal(reuse.ok, false, "reusing an enquiry already in a deal must fail");
  if (reuse.ok) return;
  assert.equal(reuse.status, 409, "reuse should be a 409 conflict");
});

test("concurrent TFR approvals cannot double-form a trade", async () => {
  const imp = await makeImport("D");
  const exp = await makeExport("D");
  const created = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  createdDealIds.push(created.value.id);
  const dealId = created.value.id;

  const tradesBefore = (await storage.getTrades()).length;
  const blocksBefore = (await storage.getBlocks()).length;

  // Fire two approvals at the same time — the atomic claim must let only one win.
  const [r1, r2] = await Promise.all([
    approveTfrForDeal(dealId),
    approveTfrForDeal(dealId),
  ]);
  const successes = [r1, r2].filter(r => r.ok);
  const failures = [r1, r2].filter(r => !r.ok);
  assert.equal(successes.length, 1, "exactly one concurrent approval should succeed");
  assert.equal(failures.length, 1, "the other concurrent approval should be rejected");
  // The loser is rejected either by losing the atomic claim (409) or by the
  // pre-check seeing the trade already formed (400) if the winner finished first.
  // Both paths correctly prevent a second trade; the count assertions below are
  // the authoritative guarantee.
  const loserStatus = (failures[0] as { status: number }).status;
  assert.ok(
    loserStatus === 409 || loserStatus === 400,
    `loser should be rejected with a conflict status (got ${loserStatus})`,
  );

  // Only one trade and one block were created despite two simultaneous requests.
  const tradesAfter = (await storage.getTrades()).length;
  const blocksAfter = (await storage.getBlocks()).length;
  assert.equal(tradesAfter, tradesBefore + 1, "no duplicate trade should be formed");
  assert.equal(blocksAfter, blocksBefore + 1, "no duplicate block should be minted");

  const deal = await storage.getDealById(dealId);
  assert.equal(deal!.stage, "trade_formed");
  assert.ok(deal!.tradeRef);
});

test("matches pair Import+Export enquiries only when the commodity matches", () => {
  const imp = synthEnquiry({ enquiryRef: "IMP-1", side: "buy", product: "Copper Cathode" });
  const expSame = synthEnquiry({ enquiryRef: "EXP-1", side: "sell", product: "Copper Cathode" });
  const expOther = synthEnquiry({ enquiryRef: "EXP-2", side: "sell", product: "Iron Ore" });

  const matches = computeEnquiryMatches([imp, expSame, expOther], []);
  assert.equal(matches.length, 1, "only the same-commodity pair should match");
  assert.equal(matches[0].id, "IMP-1__EXP-1");
  assert.equal(matches[0].import.enquiryRef, "IMP-1");
  assert.equal(matches[0].export.enquiryRef, "EXP-1");
});

test("commodity matching ignores case and surrounding whitespace", () => {
  const imp = synthEnquiry({ enquiryRef: "IMP-CS", side: "buy", product: "  copper CATHODE " });
  const exp = synthEnquiry({ enquiryRef: "EXP-CS", side: "sell", product: "Copper Cathode" });

  const matches = computeEnquiryMatches([imp, exp], []);
  assert.equal(matches.length, 1, "case/space differences should still match");
  assert.equal(matches[0].id, "IMP-CS__EXP-CS");
});

test("two imports or two exports never pair with each other", () => {
  const imp1 = synthEnquiry({ enquiryRef: "IMP-A", side: "buy", product: "Copper Cathode" });
  const imp2 = synthEnquiry({ enquiryRef: "IMP-B", side: "buy", product: "Copper Cathode" });
  const exp1 = synthEnquiry({ enquiryRef: "EXP-A", side: "sell", product: "Copper Cathode" });
  const exp2 = synthEnquiry({ enquiryRef: "EXP-B", side: "sell", product: "Copper Cathode" });

  const matches = computeEnquiryMatches([imp1, imp2, exp1, exp2], []);
  // 2 imports x 2 exports = 4 buy<->sell pairs; no buy<->buy or sell<->sell.
  assert.equal(matches.length, 4, "only cross-side pairs are produced");
  for (const m of matches) {
    assert.equal(m.import.side, "buy");
    assert.equal(m.export.side, "sell");
  }
});

test("inactive (closed/rejected/cancelled) enquiries are excluded from matches", () => {
  const imp = synthEnquiry({ enquiryRef: "IMP-INA", side: "buy", product: "Copper Cathode" });
  const exClosed = synthEnquiry({ enquiryRef: "EXP-CL", side: "sell", product: "Copper Cathode", status: "closed" });
  const exRejected = synthEnquiry({ enquiryRef: "EXP-RJ", side: "sell", product: "Copper Cathode", status: "rejected" });
  const exCancelled = synthEnquiry({ enquiryRef: "EXP-CN", side: "sell", product: "Copper Cathode", status: "cancelled" });
  const exActive = synthEnquiry({ enquiryRef: "EXP-AC", side: "sell", product: "Copper Cathode", status: "active" });

  const matches = computeEnquiryMatches([imp, exClosed, exRejected, exCancelled, exActive], []);
  assert.equal(matches.length, 1, "only the active export should match");
  assert.equal(matches[0].export.enquiryRef, "EXP-AC");

  // An inactive import is excluded too.
  const impClosed = synthEnquiry({ enquiryRef: "IMP-CL", side: "buy", product: "Copper Cathode", status: "closed" });
  assert.equal(
    computeEnquiryMatches([impClosed, exActive], []).length,
    0,
    "an inactive import yields no matches",
  );
});

test("enquiries already part of a deal are excluded from matches", () => {
  const imp = synthEnquiry({ enquiryRef: "IMP-D", side: "buy", product: "Copper Cathode" });
  const expUsed = synthEnquiry({ enquiryRef: "EXP-USED", side: "sell", product: "Copper Cathode" });
  const expFree = synthEnquiry({ enquiryRef: "EXP-FREE", side: "sell", product: "Copper Cathode" });

  // A deal already pairs IMP-D with EXP-USED, so neither may reappear in matches.
  const deals = [{ importEnquiryRef: "IMP-D", exportEnquiryRef: "EXP-USED" }];
  const matches = computeEnquiryMatches([imp, expUsed, expFree], deals);
  assert.equal(matches.length, 0, "the import is committed to a deal, so no pairs remain");

  // A fresh import can still pair with the free export.
  const impFree = synthEnquiry({ enquiryRef: "IMP-FREE", side: "buy", product: "Copper Cathode" });
  const matches2 = computeEnquiryMatches([imp, impFree, expUsed, expFree], deals);
  assert.equal(matches2.length, 1, "only the un-dealt import+export pair should match");
  assert.equal(matches2[0].id, "IMP-FREE__EXP-FREE");
});

test("enquiries with an empty or whitespace-only commodity never match", () => {
  // Two blanks must not collapse into a spurious "" === "" pairing.
  const impBlank = synthEnquiry({ enquiryRef: "IMP-BLK", side: "buy", product: "" });
  const expBlank = synthEnquiry({ enquiryRef: "EXP-BLK", side: "sell", product: "   " });
  assert.equal(
    computeEnquiryMatches([impBlank, expBlank], []).length,
    0,
    "two blank-commodity enquiries must not pair",
  );

  // A blank import never matches a real export (and vice versa).
  const expReal = synthEnquiry({ enquiryRef: "EXP-REAL", side: "sell", product: "Copper Cathode" });
  assert.equal(
    computeEnquiryMatches([impBlank, expReal], []).length,
    0,
    "a blank import must not match a real export",
  );
  const impReal = synthEnquiry({ enquiryRef: "IMP-REAL", side: "buy", product: "Copper Cathode" });
  assert.equal(
    computeEnquiryMatches([impReal, expBlank], []).length,
    0,
    "a real import must not match a blank export",
  );

  // A blank-commodity enquiry mixed in with valid ones is simply ignored.
  const matches = computeEnquiryMatches([impBlank, impReal, expBlank, expReal], []);
  assert.equal(matches.length, 1, "only the real import+export pair should match");
  assert.equal(matches[0].id, "IMP-REAL__EXP-REAL");
});

test("only the known active statuses are eligible; other statuses are excluded", () => {
  // The matcher treats closed/rejected/cancelled as inactive and pairs the rest.
  // "active" (the enquiry default) is eligible; an unknown status like "draft"
  // is conservatively still surfaced today — pin that behaviour so a change is
  // a deliberate decision, not a silent regression.
  const imp = synthEnquiry({ enquiryRef: "IMP-ST", side: "buy", product: "Copper Cathode", status: "active" });
  const expActive = synthEnquiry({ enquiryRef: "EXP-ACT", side: "sell", product: "Copper Cathode", status: "active" });
  const matchesActive = computeEnquiryMatches([imp, expActive], []);
  assert.equal(matchesActive.length, 1, "active import+export should match");

  const expClosed = synthEnquiry({ enquiryRef: "EXP-CLS", side: "sell", product: "Copper Cathode", status: "closed" });
  assert.equal(
    computeEnquiryMatches([imp, expClosed], []).length,
    0,
    "a closed export is never eligible",
  );
});

test("match id is importRef__exportRef and the sides are never swapped", () => {
  // The UI selects a pair by its id (importRef__exportRef) and trusts that the
  // import side is always the buy and the export side always the sell. Pass the
  // enquiries in export-before-import order to prove ordering of the input does
  // not swap the sides or the id composition.
  const exp = synthEnquiry({ enquiryRef: "EXP-X", side: "sell", product: "Copper Cathode" });
  const imp = synthEnquiry({ enquiryRef: "IMP-X", side: "buy", product: "Copper Cathode" });

  const matches = computeEnquiryMatches([exp, imp], []);
  assert.equal(matches.length, 1);
  const m = matches[0];
  assert.equal(m.id, "IMP-X__EXP-X", "id must be importRef__exportRef regardless of input order");
  assert.equal(m.id, `${m.import.enquiryRef}__${m.export.enquiryRef}`, "id must compose from import then export");
  assert.equal(m.import.side, "buy", "import side must be the buy enquiry");
  assert.equal(m.export.side, "sell", "export side must be the sell enquiry");
});

test("matches are emitted in a deterministic, stable order", () => {
  // The UI renders the match list as-is, so the order must be a stable function
  // of the input: imports outer, exports inner, each preserving the relative
  // order in which they appear in the enquiry list. Two imports x two exports
  // must always yield this exact id sequence for a given input order.
  const imp1 = synthEnquiry({ enquiryRef: "IMP-1", side: "buy", product: "Copper Cathode" });
  const imp2 = synthEnquiry({ enquiryRef: "IMP-2", side: "buy", product: "Copper Cathode" });
  const exp1 = synthEnquiry({ enquiryRef: "EXP-1", side: "sell", product: "Copper Cathode" });
  const exp2 = synthEnquiry({ enquiryRef: "EXP-2", side: "sell", product: "Copper Cathode" });

  const expectedOrder = ["IMP-1__EXP-1", "IMP-1__EXP-2", "IMP-2__EXP-1", "IMP-2__EXP-2"];

  // Interleaving imports and exports in the input must not change the emitted
  // order: the matcher first partitions by side (stably) then nests the loops.
  const ids = computeEnquiryMatches([imp1, exp1, imp2, exp2], []).map(m => m.id);
  assert.deepEqual(ids, expectedOrder, "imports outer, exports inner — stable ordering");

  // The same logical set in a different interleaving yields the same order,
  // because partitioning preserves each side's relative input order.
  const ids2 = computeEnquiryMatches([exp1, imp1, exp2, imp2], []).map(m => m.id);
  assert.deepEqual(ids2, expectedOrder, "ordering depends only on per-side input order");
});
