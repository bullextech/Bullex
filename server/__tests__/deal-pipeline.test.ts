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
import { createDealFromEnquiries, approveTfrForDeal, revokeTfrApproval, computeEnquiryMatches, runDealCascade, resumeDealCascade, deriveNextDocument } from "../routes";
import type { TradeEnquiry } from "@shared/schema";
import { generateDocumentContent } from "../documentTemplates";
import { generateTradeHash, mineBlock, GENESIS_HASH } from "../blockchain";
import { canonicalCommodityBlockParent } from "@shared/product-groups";

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
// Enquiry refs are generated as `<3 letters of createdBy>-<3 letters of product>-<ddmm>-<serial>`
// with a NON-atomic serial (count of same-prefix rows). Two concurrent test runs
// sharing the same 3-letter codes race on the serial and hit the unique-ref
// constraint, so randomize the code-forming letters per run to give every run
// its own ref namespace.
const rand3 = () =>
  Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
const CREATOR = `${rand3()} tester ${RUN}`; // ref party code = the 3 random letters
const PRODUCT = `${rand3()}ZZTEST-${RUN}`;  // ref product code = the 3 random letters

// Track everything we create so cleanup is deterministic and complete.
const createdEnquiryIds: string[] = [];
const createdDealIds: string[] = [];
const createdKycIds: string[] = [];
const createdDocIds: string[] = [];

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
    // Party names are run-unique: the dev DB is shared, and the TFR addressee
    // prefill looks KYC up by exact company name — a stale/concurrent KYC row
    // for a same-named company must never leak into these tests.
    buyerName: `Buyer Co ${suffix} ${RUN}`,
    sellerName: `Supplier Co ${suffix} ${RUN}`,
    createdBy: CREATOR,
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
    buyerName: `Final Buyer ${suffix} ${RUN}`,
    sellerName: `Trader Co ${suffix} ${RUN}`,
    createdBy: CREATOR,
    status: "active",
  } as any);
  createdEnquiryIds.push(e.id);
  return e;
}

// Cross-process suite mutex: chain-tip assertions (revokes, tip checks) break
// whenever ANY other block producer runs against the shared dev DB — another
// test file, another agent's validation run, or the dev server. Hold a
// session-level advisory lock for the whole suite so chain-touching suites
// serialize across processes; each releases only after its cleanup ran.
const CHAIN_TEST_MUTEX_KEY = 792215002;
let chainMutexClient: Awaited<ReturnType<typeof pool.connect>> | null = null;

before(async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL must be set to run pipeline tests");
  chainMutexClient = await pool.connect();
  await chainMutexClient.query("SELECT pg_advisory_lock($1)", [CHAIN_TEST_MUTEX_KEY]);
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
  for (const id of createdDocIds.reverse()) {
    try { await storage.deleteDocument(id); } catch {}
  }
  for (const id of createdKycIds) {
    try { await storage.deleteKycApplication(id); } catch {}
  }
  for (const id of createdEnquiryIds) {
    await storage.deleteTradeEnquiry(id);
  }
  if (chainMutexClient) {
    await chainMutexClient.query("SELECT pg_advisory_unlock($1)", [CHAIN_TEST_MUTEX_KEY]);
    chainMutexClient.release();
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

test("manual match: cross-product pairing is rejected by default and allowed with the admin override", async () => {
  const imp = await makeImport("MX");
  // Export in a DIFFERENT product than the import.
  const otherProduct = `${PRODUCT}-ALT`;
  const exp = await storage.createTradeEnquiry({
    side: "sell",
    product: otherProduct,
    quantity: "5000",
    unit: "MT",
    price: "9100",
    currency: "USD",
    dischargePort: "Rotterdam",
    incoterms: "CIF",
    buyerName: "Final Buyer MX",
    sellerName: "Trader Co MX",
    createdBy: CREATOR,
    status: "active",
  } as any);
  createdEnquiryIds.push(exp.id);

  // Without the override, the same-commodity guard rejects the pair.
  const rejected = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.equal(rejected.ok, false, "cross-product pair must be rejected without the manual override");
  if (!rejected.ok) assert.equal(rejected.status, 400);

  // With the override, the deal forms; side guards still apply.
  const wrongSide = await createDealFromEnquiries(exp.enquiryRef, imp.enquiryRef, { allowCommodityMismatch: true });
  assert.equal(wrongSide.ok, false, "side (buy/sell) guard must survive the manual override");

  const result = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef, { allowCommodityMismatch: true });
  assert.equal(result.ok, true, "manual override should allow the cross-product pair");
  if (!result.ok) return;
  const deal = result.value;
  createdDealIds.push(deal.id);

  // Deal row records both product names; TFR states each side's OWN product.
  assert.equal(deal.commodity, `${PRODUCT} / ${otherProduct}`);
  assert.equal(deal.cascadeError, null, "cascade should not error");
  assert.ok(deal.tfrDocId, "TFR should be generated");
  const docs = await storage.getDocuments();
  const tfr = docs.find(d => d.id === deal.tfrDocId);
  assert.ok(tfr, "TFR document should exist");
  const content = tfr!.content || "";
  assert.ok(content.includes(PRODUCT), "TFR should carry the import side's own product");
  assert.ok(content.includes(otherProduct), "TFR should carry the export side's own product");
  assert.ok(!content.includes(`${PRODUCT} / ${otherProduct} / ${otherProduct}`), "combined label must not double-substitute");
});

test("a partial cascade failure can be resumed without duplicating documents", async () => {
  const imp = await makeImport("R");
  const exp = await makeExport("R");

  // Simulate a partial failure: create the deal row directly (no cascade) and run
  // the cascade only far enough to issue the LOI + SCO, then abort. This mirrors a
  // crash after the first documents were generated but before the recaps/TFR.
  const partial = await storage.createDeal({
    dealRef: `DEAL-TEST-${RUN}-R`,
    importEnquiryRef: imp.enquiryRef,
    exportEnquiryRef: exp.enquiryRef,
    commodity: imp.product,
  } as any);
  createdDealIds.push(partial.id);

  // First pass produces the full cascade; capture the doc ids.
  const firstPass = await runDealCascade(partial, imp, exp);
  assert.equal(firstPass.stage, "tfr_pending");
  const firstDocIds = {
    loi: firstPass.loiDocId,
    sco: firstPass.scoDocId,
    recapImport: firstPass.dealRecapImportDocId,
    recapExport: firstPass.dealRecapExportDocId,
    tfr: firstPass.tfrDocId,
  };
  for (const [k, v] of Object.entries(firstDocIds)) assert.ok(v, `${k} should be generated`);

  const docCountBefore = (await storage.getDocuments()).length;

  // Resume: every document already exists, so create-if-missing must produce NONE.
  const resumed = await resumeDealCascade(partial.id);
  assert.equal(resumed.ok, true, "resume should succeed");
  if (!resumed.ok) return;

  // The doc ids are unchanged — no duplicates were created.
  assert.equal(resumed.value.loiDocId, firstDocIds.loi);
  assert.equal(resumed.value.scoDocId, firstDocIds.sco);
  assert.equal(resumed.value.dealRecapImportDocId, firstDocIds.recapImport);
  assert.equal(resumed.value.dealRecapExportDocId, firstDocIds.recapExport);
  assert.equal(resumed.value.tfrDocId, firstDocIds.tfr);
  assert.equal(resumed.value.stage, "tfr_pending", "stage should not regress");

  const docCountAfter = (await storage.getDocuments()).length;
  assert.equal(docCountAfter, docCountBefore, "resuming a complete cascade creates no new documents");
});

test("resuming a deal missing only its TFR generates just the TFR", async () => {
  const imp = await makeImport("S");
  const exp = await makeExport("S");

  // Create a deal that already has LOI/SCO/recaps but no TFR (a failure right
  // before the final step), to prove resume fills exactly the missing document.
  const created = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  createdDealIds.push(created.value.id);
  const dealId = created.value.id;

  // Wipe just the TFR to simulate the pre-TFR partial state.
  const tfrId = created.value.tfrDocId!;
  await pool.query(`DELETE FROM documents WHERE id = $1`, [tfrId]);
  await storage.updateDeal(dealId, { tfrDocId: null, stage: "recaps_issued" });

  const docCountBefore = (await storage.getDocuments()).length;
  const resumed = await resumeDealCascade(dealId);
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;

  assert.ok(resumed.value.tfrDocId, "a new TFR should be generated");
  assert.notEqual(resumed.value.tfrDocId, tfrId, "the new TFR is a fresh document");
  assert.equal(resumed.value.stage, "tfr_pending", "deal should advance back to tfr_pending");
  // The recaps/LOI/SCO are untouched, so exactly one new document (the TFR)
  // exists FOR THIS DEAL. Scope the count to this deal's enquiry refs — a
  // global document count is polluted by other test files sharing the dev DB.
  const dealDocs = (await storage.getDocuments()).filter(
    (d) => d.enquiryRef === imp.enquiryRef || d.enquiryRef === exp.enquiryRef,
  );
  const dealDocCountBefore = docCountBefore; // kept for context; assertion below is scoped
  void dealDocCountBefore;
  const dealIds = new Set([
    resumed.value.loiDocId, resumed.value.scoDocId,
    resumed.value.dealRecapImportDocId, resumed.value.dealRecapExportDocId,
    resumed.value.tfrDocId,
  ].filter(Boolean));
  assert.equal(dealDocs.length, dealIds.size, "no extra documents beyond the deal's own five should exist");
  assert.equal(dealDocs.filter((d) => d.docType === "TFR").length, 1, "exactly one TFR should exist for the deal");
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

  // The mined deal block is associated with exactly one logical commodity
  // parent, and the grouped read model carries the Deal reference.
  const productIdentity = canonicalCommodityBlockParent(trade!.commodity);
  let productGroups = await storage.getProductBlockGroups();
  let productGroup = productGroups.find((g) => g.parent.commodityKey === productIdentity.key);
  assert.ok(productGroup, "formed trade should have a logical commodity parent");
  let groupedDealBlock = productGroup!.dealBlocks.find((entry) => entry.trade.id === trade!.id);
  assert.ok(groupedDealBlock, "formed trade block should appear under its commodity parent");
  assert.equal(groupedDealBlock!.dealId, dealId);
  assert.equal(groupedDealBlock!.dealRef, deal!.dealRef);
  assert.equal(groupedDealBlock!.block.blockNumber, trade!.blockNumber);
  const unrelatedGroups = await storage.getProductBlockGroups(`unrelated-${RUN}`);
  assert.equal(
    unrelatedGroups.some((group) => group.dealBlocks.some((entry) => entry.trade.id === trade!.id)),
    false,
    "a different team scope must not see this trade's grouped commercial data",
  );

  // Historical backfill is repeatable and association-only: deleting the link
  // then restoring it must leave every proof-bearing block field untouched.
  const originalBlock = blocksAfter.find((b) => b.blockNumber === trade!.blockNumber)!;
  const originalProof = {
    id: originalBlock.id,
    blockNumber: originalBlock.blockNumber,
    hash: originalBlock.hash,
    previousHash: originalBlock.previousHash,
    nonce: originalBlock.nonce,
    timestamp: originalBlock.timestamp.toISOString(),
    dataType: originalBlock.dataType,
    verified: originalBlock.verified,
  };
  await pool.query("DELETE FROM product_deal_blocks WHERE trade_id = $1", [trade!.id]);
  const backfilled = await storage.backfillProductDealBlocks();
  assert.equal(backfilled.linksCreated, 1, "backfill should restore the missing association");
  const repeated = await storage.backfillProductDealBlocks();
  assert.equal(repeated.linksCreated, 0, "backfill should be idempotent");
  assert.equal(repeated.checked, 0, "idempotent rerun should find no missing links");
  productGroups = await storage.getProductBlockGroups();
  productGroup = productGroups.find((g) => g.parent.commodityKey === productIdentity.key);
  groupedDealBlock = productGroup?.dealBlocks.find((entry) => entry.trade.id === trade!.id);
  assert.ok(groupedDealBlock, "backfill should restore the grouped Deal reference");
  const restoredBlock = (await storage.getBlocks()).find((b) => b.id === originalBlock.id)!;
  assert.deepEqual(
    {
      id: restoredBlock.id,
      blockNumber: restoredBlock.blockNumber,
      hash: restoredBlock.hash,
      previousHash: restoredBlock.previousHash,
      nonce: restoredBlock.nonce,
      timestamp: restoredBlock.timestamp.toISOString(),
      dataType: restoredBlock.dataType,
      verified: restoredBlock.verified,
    },
    originalProof,
    "backfill must not alter the immutable blockchain record",
  );

  // Completing Pre-Deal documents and advancing must reuse the block minted by
  // TFR approval. The old path attempted to mint again and failed because the
  // trade already had a blockchain record.
  const chainIdentityBeforeAdvance = {
    blockchainHash: trade!.blockchainHash,
    previousHash: trade!.previousHash,
    blockNumber: trade!.blockNumber,
    nonce: trade!.nonce,
  };
  const advanced = await storage.mintTradeBlock(
    trade!.id,
    "deal",
    generateTradeHash,
    mineBlock,
    GENESIS_HASH,
  );
  assert.equal(advanced.status, "deal", "the TFR-approved trade should advance to Deal");
  assert.deepEqual(
    {
      blockchainHash: advanced.blockchainHash,
      previousHash: advanced.previousHash,
      blockNumber: advanced.blockNumber,
      nonce: advanced.nonce,
    },
    chainIdentityBeforeAdvance,
    "advancement must preserve the block minted at TFR approval",
  );
  const groupsAfterAdvance = await storage.getProductBlockGroups();
  assert.equal(
    groupsAfterAdvance
      .flatMap((group) => group.dealBlocks)
      .filter((entry) => entry.trade.id === trade!.id).length,
    1,
    "advancement must keep exactly one block association for the trade",
  );

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

test("pre-deal advancement fails closed for partial or mismatched chain metadata", async () => {
  const imp = await makeImport("CHAIN-GUARD");
  const exp = await makeExport("CHAIN-GUARD");
  const created = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  createdDealIds.push(created.value.id);
  const approved = await approveTfrForDeal(created.value.id);
  assert.equal(approved.ok, true);
  if (!approved.ok) return;

  const anchorTrade = (await storage.getTrades()).find(
    (trade) => trade.tradeRef === approved.value.createdTradeRef,
  );
  assert.ok(anchorTrade?.blockNumber != null);
  const anchorBlock = (await storage.getBlocks()).find(
    (block) => block.blockNumber === anchorTrade!.blockNumber,
  );
  assert.ok(anchorBlock);

  const probeIds: string[] = [];
  const createProbe = async (
    suffix: string,
    chain: {
      blockchainHash: string | null;
      previousHash: string | null;
      blockNumber: number | null;
      nonce: number | null;
    },
  ) => {
    const probe = await storage.createTrade({
      tradeRef: `BFG-CHAIN-${suffix}-${RUN}`,
      commodity: PRODUCT,
      commodityCategory: "Test",
      quantity: 100,
      unit: "MT",
      pricePerUnit: 10,
      totalValue: 1000,
      currency: "USD",
      buyerName: `Chain Buyer ${suffix} ${RUN}`,
      sellerName: `Chain Seller ${suffix} ${RUN}`,
      origin: "Test",
      destination: "Test",
      incoterm: "FOB",
      status: "pre_deal",
      stageDocuments: {},
      ...chain,
    } as any);
    probeIds.push(probe.id);
    return probe;
  };

  const blockCountBefore = (await storage.getBlocks()).length;
  try {
    const emptyHash = await createProbe("EMPTY", {
      blockchainHash: "",
      previousHash: anchorBlock!.previousHash,
      blockNumber: anchorBlock!.blockNumber,
      nonce: anchorBlock!.nonce,
    });
    const missingBlock = await createProbe("MISSING", {
      blockchainHash: "a".repeat(64),
      previousHash: anchorBlock!.previousHash,
      blockNumber: 2_147_483_647,
      nonce: 0,
    });
    const mismatchedBlock = await createProbe("MISMATCH", {
      blockchainHash: "b".repeat(64),
      previousHash: anchorBlock!.previousHash,
      blockNumber: anchorBlock!.blockNumber,
      nonce: anchorBlock!.nonce,
    });

    for (const probe of [emptyHash, missingBlock, mismatchedBlock]) {
      await assert.rejects(
        storage.mintTradeBlock(probe.id, "deal", generateTradeHash, mineBlock, GENESIS_HASH),
        /incomplete blockchain record/,
      );
      assert.equal(
        (await storage.getTradeById(probe.id))!.status,
        "pre_deal",
        "invalid chain metadata must not advance the trade",
      );
    }
    assert.equal(
      (await storage.getBlocks()).length,
      blockCountBefore,
      "invalid existing metadata must never mint another block",
    );
  } finally {
    if (probeIds.length > 0) {
      await pool.query(`DELETE FROM trades WHERE id = ANY($1::text[])`, [probeIds]);
    }
  }
});

test("a TFR rejected before approval completes blocks trade formation and rolls back", async () => {
  const imp = await makeImport("RJ");
  const exp = await makeExport("RJ");
  const created = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  createdDealIds.push(created.value.id);
  const dealId = created.value.id;

  // Simulate a rejection racing in (client or admin) before approval runs.
  await storage.updateDocument(created.value.tfrDocId!, {
    status: "rejected",
    recipientResponse: "rejected",
  } as any);

  const tradesBefore = (await storage.getTrades()).length;
  const blocksBefore = (await storage.getBlocks()).length;

  await assert.rejects(
    () => approveTfrForDeal(dealId),
    /rejected before approval/i,
    "approval must fail when the TFR was rejected first",
  );

  // Full rollback: no trade, no block, deal back in tfr_pending, TFR still rejected.
  assert.equal((await storage.getTrades()).length, tradesBefore, "no trade may be formed");
  assert.equal((await storage.getBlocks()).length, blocksBefore, "no block may be minted");
  const deal = await storage.getDealById(dealId);
  assert.equal(deal!.stage, "tfr_pending", "deal must return to tfr_pending");
  assert.equal(deal!.tradeRef, null, "deal must not record a trade ref");
  const tfr = (await storage.getDocuments()).find(d => d.id === created.value.tfrDocId);
  assert.equal(tfr!.status, "rejected", "the rejection must not be overwritten");
});

test("revoking a TFR approval deletes the trade + block and returns the deal to pending", async () => {
  const imp = await makeImport("RV");
  const exp = await makeExport("RV");
  const created = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  createdDealIds.push(created.value.id);
  const dealId = created.value.id;

  // Revoke before approval is refused.
  const early = await revokeTfrApproval(dealId);
  assert.equal(early.ok, false, "revoking an unapproved TFR must fail");
  if (!early.ok) assert.equal(early.status, 409);

  const approved = await approveTfrForDeal(dealId);
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  const tradeRef = approved.value.createdTradeRef;

  const tradesBefore = (await storage.getTrades()).length;
  const blocksBefore = (await storage.getBlocks()).length;

  const revoked = await revokeTfrApproval(dealId);
  assert.equal(revoked.ok, true, "revoke should succeed while nothing is built on the trade");
  if (!revoked.ok) return;

  // Trade + block are gone.
  const tradesAfter = await storage.getTrades();
  assert.equal(tradesAfter.length, tradesBefore - 1, "the minted trade should be deleted");
  assert.equal((await storage.getBlocks()).length, blocksBefore - 1, "the minted block should be deleted");
  assert.ok(!tradesAfter.find(t => t.tradeRef === tradeRef), "revoked trade must not remain");

  // Deal is back to tfr_pending with approval fields cleared.
  const deal = await storage.getDealById(dealId);
  assert.equal(deal!.stage, "tfr_pending");
  assert.equal(deal!.tradeRef, null);
  assert.equal(deal!.tfrApprovedAt, null);
  assert.equal(deal!.tfrApprovedBy, null);

  // TFR document reverted to pending with the approval stamp stripped.
  const tfr = (await storage.getDocuments()).find(d => d.id === deal!.tfrDocId);
  assert.equal(tfr!.status, "pending_review");
  assert.equal(tfr!.tradeRef, null);
  assert.equal(tfr!.recipientResponse, null);
  assert.ok(!(tfr!.content || "").includes("ADMIN DIGITAL APPROVAL"), "approval stamp must be removed from content");

  // Enquiries detached from the deleted trade.
  const enquiries = await storage.getTradeEnquiries();
  assert.equal(enquiries.find(e => e.id === imp.id)!.linkedTradeRef, null);
  assert.equal(enquiries.find(e => e.id === exp.id)!.linkedTradeRef, null);

  // The deal can be approved again after the revoke.
  const reapproved = await approveTfrForDeal(dealId);
  assert.equal(reapproved.ok, true, "re-approval after revoke should succeed");

  // Unwind the re-approval so this test leaves no block on the chain tip —
  // later tests reason about the tip and must not inherit our leftovers.
  const unwound = await revokeTfrApproval(dealId);
  assert.equal(unwound.ok, true, "unwinding the re-approval should succeed");
});

// Small helper: build a deal ready for approval, tracked for cleanup.
async function makeApprovableDeal(suffix: string): Promise<string> {
  const imp = await makeImport(suffix);
  const exp = await makeExport(suffix);
  const created = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.equal(created.ok, true, `deal creation (${suffix}) should succeed`);
  if (!created.ok) throw new Error("unreachable");
  createdDealIds.push(created.value.id);
  return created.value.id;
}

test("revoke is refused when the trade's block is no longer the chain tip", async () => {
  const dealA = await makeApprovableDeal("TIP1");
  const dealB = await makeApprovableDeal("TIP2");

  const approvedA = await approveTfrForDeal(dealA);
  assert.equal(approvedA.ok, true);
  if (!approvedA.ok) return;
  // A second trade mints a newer block, so deal A's block is mid-chain now.
  const approvedB = await approveTfrForDeal(dealB);
  assert.equal(approvedB.ok, true);
  if (!approvedB.ok) return;

  const tradesBefore = (await storage.getTrades()).length;
  const blocksBefore = (await storage.getBlocks()).length;

  const refused = await revokeTfrApproval(dealA);
  assert.equal(refused.ok, false, "revoking a non-tip block must be refused");
  if (!refused.ok) {
    assert.equal(refused.status, 409);
    assert.match(refused.message, /newer blockchain block/i);
  }
  // Nothing was deleted and the deal is untouched.
  assert.equal((await storage.getTrades()).length, tradesBefore, "refused revoke must delete no trade");
  assert.equal((await storage.getBlocks()).length, blocksBefore, "refused revoke must delete no block");
  const dealAAfter = await storage.getDealById(dealA);
  assert.equal(dealAAfter!.stage, "trade_formed", "deal A must stay trade_formed");
  assert.equal(dealAAfter!.tradeRef, approvedA.value.createdTradeRef);

  // Unwind tip-first: B (tip) revokes, then A becomes the tip and revokes too.
  const revokedB = await revokeTfrApproval(dealB);
  assert.equal(revokedB.ok, true, "revoking the chain tip should succeed");
  const revokedA = await revokeTfrApproval(dealA);
  assert.equal(revokedA.ok, true, "deal A becomes the tip once B is unwound");
});

test("revoke is refused when another document references the trade or stage documents exist", async () => {
  const dealId = await makeApprovableDeal("REFDOC");
  const approved = await approveTfrForDeal(dealId);
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  const tradeRef = approved.value.createdTradeRef;

  // 1) Another document referencing the tradeRef blocks the revoke.
  const otherDoc = await storage.createDocument({
    docType: "LOI",
    title: `LOI referencing trade ${tradeRef}`,
    status: "draft",
    content: "test document tied to a formed trade",
    tradeRef,
  } as any);
  createdDocIds.push(otherDoc.id);

  const refusedDoc = await revokeTfrApproval(dealId);
  assert.equal(refusedDoc.ok, false, "revoke must be refused while another document references the trade");
  if (!refusedDoc.ok) {
    assert.equal(refusedDoc.status, 409);
    assert.match(refusedDoc.message, /other documents/i);
  }
  const stillFormed = await storage.getDealById(dealId);
  assert.equal(stillFormed!.stage, "trade_formed", "refused revoke must not touch the deal");

  // Detach the other document; now stage documents block the revoke.
  await pool.query(`UPDATE documents SET trade_ref = NULL WHERE id = $1`, [otherDoc.id]);

  // 2) Non-empty trade.stageDocuments blocks the revoke.
  await pool.query(
    `UPDATE trades SET stage_documents = $1::jsonb WHERE trade_ref = $2`,
    [JSON.stringify({ loi: "uploaded-file.pdf" }), tradeRef],
  );
  const refusedStage = await revokeTfrApproval(dealId);
  assert.equal(refusedStage.ok, false, "revoke must be refused while the trade has stage documents");
  if (!refusedStage.ok) {
    assert.equal(refusedStage.status, 409);
    assert.match(refusedStage.message, /stage documents/i);
  }

  // With both obstacles cleared the revoke goes through.
  await pool.query(
    `UPDATE trades SET stage_documents = '{}'::jsonb WHERE trade_ref = $1`,
    [tradeRef],
  );
  const revoked = await revokeTfrApproval(dealId);
  assert.equal(revoked.ok, true, "revoke should succeed once nothing references the trade");
});

test("concurrent revoke vs approve serialize on the blockchain lock and never break the chain", async () => {
  const dealA = await makeApprovableDeal("RACE1");
  const dealB = await makeApprovableDeal("RACE2");

  // Capture the chain tip BEFORE this test mints anything: the shared dev DB
  // may carry historical gaps lower down, so integrity is asserted only over
  // the segment this test adds on top of the pre-test tip.
  const preTestBlocks = await storage.getBlocks();
  const preTestTip = [...preTestBlocks].sort((a, b) => b.blockNumber - a.blockNumber)[0];

  const approvedA = await approveTfrForDeal(dealA);
  assert.equal(approvedA.ok, true);
  if (!approvedA.ok) return;

  const blocksBefore = (await storage.getBlocks()).length; // includes A's block

  // Race: revoke deal A's approval while approving deal B. The advisory lock
  // serializes the two, so exactly one ordering happens:
  //  - revoke first: A's tip block is deleted, then B mints on the new tip
  //    (both succeed);
  //  - approve first: B mints atop A's block, so A's block is no longer the
  //    tip and the revoke is refused.
  const [revokeRes, approveRes] = await Promise.all([
    revokeTfrApproval(dealA),
    approveTfrForDeal(dealB),
  ]);

  assert.equal(approveRes.ok, true, "deal B's approval must always succeed");
  if (!approveRes.ok) return;

  const blocksAfter = await storage.getBlocks();
  if (revokeRes.ok) {
    // Revoke won the lock: A's block gone, B's block minted — net zero.
    assert.equal(blocksAfter.length, blocksBefore, "revoke-then-mint leaves the block count unchanged");
    assert.equal((await storage.getDealById(dealA))!.stage, "tfr_pending");
  } else {
    // Approve won the lock: A's block is mid-chain, revoke refused, net +1.
    assert.equal(revokeRes.status, 409);
    assert.equal(blocksAfter.length, blocksBefore + 1, "refused revoke deletes nothing; only B's block was added");
    assert.equal((await storage.getDealById(dealA))!.stage, "trade_formed");
  }

  // In BOTH orderings the chain segment this test minted must be intact:
  // every new block chains onto its immediate predecessor's hash with
  // contiguous block numbers, starting from the pre-test tip — i.e. no block
  // ever chained onto a deleted predecessor.
  const segment = blocksAfter
    .filter(b => !preTestTip || b.blockNumber > preTestTip.blockNumber)
    .sort((a, b) => a.blockNumber - b.blockNumber);
  assert.ok(segment.length >= 1, "the race must leave at least one new block (deal B's)");
  if (preTestTip) {
    assert.equal(segment[0].blockNumber, preTestTip.blockNumber + 1,
      "the first new block must sit directly above the pre-test tip");
    assert.equal(segment[0].previousHash, preTestTip.hash,
      "the first new block must chain onto the pre-test tip's hash");
  }
  for (let i = 1; i < segment.length; i++) {
    assert.equal(segment[i].blockNumber, segment[i - 1].blockNumber + 1,
      "block numbers must be contiguous — a mid-chain block was deleted");
    assert.equal(segment[i].previousHash, segment[i - 1].hash,
      "every block must chain onto its immediate predecessor's hash");
  }

  // Unwind tip-first so cleanup leaves the chain as it found it.
  const revokedB = await revokeTfrApproval(dealB);
  assert.equal(revokedB.ok, true, "deal B (the tip) should revoke cleanly");
  if (!revokeRes.ok) {
    const revokedA = await revokeTfrApproval(dealA);
    assert.equal(revokedA.ok, true, "deal A revokes once it is the tip again");
  }
});

test("a late approval stamp after a revoke never lands on the reverted TFR", async () => {
  const dealId = await makeApprovableDeal("LATE");
  const approved = await approveTfrForDeal(dealId);
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  const tradeRef = approved.value.createdTradeRef;
  const tfrDocId = (await storage.getDealById(dealId))!.tfrDocId!;

  const revoked = await revokeTfrApproval(dealId);
  assert.equal(revoked.ok, true);
  if (!revoked.ok) return;
  const contentAfterRevoke = (await storage.getDocumentById(tfrDocId))!.content || "";
  assert.ok(!contentAfterRevoke.includes("ADMIN DIGITAL APPROVAL"), "revoke must strip the stamp first");

  // Simulate the approval's post-transaction stamp arriving AFTER the revoke:
  // the tradeRef guard must make the conditional append match nothing, because
  // the revoke already cleared documents.tradeRef inside its transaction.
  const stamp = `\n\n=== ADMIN DIGITAL APPROVAL ===\nDigitally approved by: Late Stamper\nTrade Reference: ${tradeRef}\n`;
  const stamped = await storage.appendDocContentIfMissing(tfrDocId, "ADMIN DIGITAL APPROVAL", stamp, tradeRef);
  assert.equal(stamped, undefined, "late stamp with the revoked tradeRef must match no row");

  const doc = await storage.getDocumentById(tfrDocId);
  assert.ok(!(doc!.content || "").includes("ADMIN DIGITAL APPROVAL"), "reverted TFR content must stay unstamped");
  assert.equal(doc!.status, "pending_review", "TFR must remain pending after the failed late stamp");
  assert.equal(doc!.tradeRef, null);

  // Sanity check the guard itself: after a REAL re-approval (fresh tradeRef,
  // set by the forming transaction), the same conditional append DOES land.
  const reapproved = await approveTfrForDeal(dealId);
  assert.equal(reapproved.ok, true);
  if (!reapproved.ok) return;
  const restamped = await storage.getDocumentById(tfrDocId);
  assert.ok((restamped!.content || "").includes("ADMIN DIGITAL APPROVAL"),
    "re-approval stamps normally, proving the guard blocks only stale tradeRefs");
  assert.ok((restamped!.content || "").includes(reapproved.value.createdTradeRef),
    "the stamp must carry the NEW trade reference");

  // Unwind the re-approval so this test leaves the chain tip as it found it.
  const unwound = await revokeTfrApproval(dealId);
  assert.equal(unwound.ok, true, "unwinding the re-approval should succeed");
});

test("concurrent revoke vs a trade moving forward (mintTradeBlock) never breaks the chain", async () => {
  const { generateTradeHash, mineBlock, GENESIS_HASH } = await import("../blockchain");

  // Approve a deal so its TFR trade's block sits at the chain tip.
  const dealId = await makeApprovableDeal("FWD");
  const preTestBlocks = await storage.getBlocks();
  const preTestTip = [...preTestBlocks].sort((a, b) => b.blockNumber - a.blockNumber)[0];
  const approved = await approveTfrForDeal(dealId);
  assert.equal(approved.ok, true);
  if (!approved.ok) return;

  // A separate manually-entered pre_deal trade with NO blockchain record yet —
  // advancing it pre_deal -> deal is the "trade moving forward" block producer.
  const manualTrade = await storage.createTrade({
    tradeRef: `BFG-TEST-FWD-${RUN}`,
    commodity: PRODUCT,
    commodityCategory: "Test",
    quantity: 100,
    unit: "MT",
    pricePerUnit: 10,
    totalValue: 1000,
    currency: "USD",
    buyerName: `Fwd Buyer ${RUN}`,
    sellerName: `Fwd Seller ${RUN}`,
    origin: "Test",
    destination: "Test",
    incoterm: "FOB",
    status: "pre_deal",
    stageDocuments: {},
  } as any);

  const blocksBefore = (await storage.getBlocks()).length; // includes the TFR trade's tip block

  // Race the revoke (tip delete) against the forward move (tip read + mint).
  // Both now take the blockchain advisory lock, so exactly one ordering runs:
  //  - revoke first: tip deleted, forward mint chains onto the new tip (both succeed);
  //  - mint first: the TFR block is mid-chain, so the revoke is refused.
  const [revokeRes, mintedTrade] = await Promise.all([
    revokeTfrApproval(dealId),
    storage.mintTradeBlock(manualTrade.id, "deal", generateTradeHash, mineBlock, GENESIS_HASH),
  ]);

  assert.equal(mintedTrade.status, "deal", "the forward-moving trade must always mint and advance");
  assert.ok(mintedTrade.blockNumber != null, "the forward-moving trade must get a block number");

  const blocksAfter = await storage.getBlocks();
  if (revokeRes.ok) {
    assert.equal(blocksAfter.length, blocksBefore, "revoke-then-mint leaves the count unchanged");
  } else {
    assert.equal(revokeRes.status, 409, "a refused revoke must be the newer-block refusal");
    assert.equal(blocksAfter.length, blocksBefore + 1, "refused revoke deletes nothing");
  }

  // Either way the segment minted above the pre-test tip must chain perfectly:
  // no block may reference a deleted predecessor.
  const segment = blocksAfter
    .filter(b => !preTestTip || b.blockNumber > preTestTip.blockNumber)
    .sort((a, b) => a.blockNumber - b.blockNumber);
  assert.ok(segment.length >= 1);
  if (preTestTip) {
    assert.equal(segment[0].blockNumber, preTestTip.blockNumber + 1);
    assert.equal(segment[0].previousHash, preTestTip.hash, "first new block chains onto the pre-test tip");
  }
  for (let i = 1; i < segment.length; i++) {
    assert.equal(segment[i].blockNumber, segment[i - 1].blockNumber + 1, "block numbers must stay contiguous");
    assert.equal(segment[i].previousHash, segment[i - 1].hash, "every block must chain onto its predecessor's hash");
  }

  // Unwind tip-first so the chain is left as this test found it: delete the
  // manual trade's block (the tip), then the trade, then revoke the deal's
  // approval if the race refused it.
  await pool.query(`DELETE FROM blocks WHERE block_number = $1`, [mintedTrade.blockNumber]);
  await pool.query(`DELETE FROM trades WHERE id = $1`, [manualTrade.id]);
  if (!revokeRes.ok) {
    const revokedA = await revokeTfrApproval(dealId);
    assert.equal(revokedA.ok, true, "the deal's approval revokes once its block is the tip again");
  }
});

test("stale post-revoke cleanup never strips a fresh re-approval's stamp", async () => {
  const dealId = await makeApprovableDeal("STALE");
  const approved = await approveTfrForDeal(dealId);
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  const tfrDocId = (await storage.getDealById(dealId))!.tfrDocId!;

  const revoked = await revokeTfrApproval(dealId);
  assert.equal(revoked.ok, true);
  if (!revoked.ok) return;

  // A fresh approval lands (the revoke's own cleanup already ran).
  const reapproved = await approveTfrForDeal(dealId);
  assert.equal(reapproved.ok, true);
  if (!reapproved.ok) return;
  const newRef = reapproved.value.createdTradeRef;
  const stampedDoc = await storage.getDocumentById(tfrDocId);
  assert.ok((stampedDoc!.content || "").includes("ADMIN DIGITAL APPROVAL"), "re-approval must stamp the TFR");
  const filesBefore = { docx: stampedDoc!.docxPath, pdf: stampedDoc!.pdfPath };

  // Deterministic interleaving: replay the revoke's post-transaction cleanup
  // AFTER the re-approval, exactly as a delayed cleanup task would. The
  // detached-only guards must make both writes match nothing.
  const staleStrip = await storage.stripDocContentIfDetached(tfrDocId, "\n\n=== ADMIN DIGITAL APPROVAL ===");
  assert.equal(staleStrip, undefined, "stale strip must not touch a re-attached document");
  const staleFiles = await storage.setDocFilesIfDetached(tfrDocId, "/tmp/stale.docx", "/tmp/stale.pdf");
  assert.equal(staleFiles, undefined, "stale file refresh must not touch a re-attached document");

  const doc = await storage.getDocumentById(tfrDocId);
  assert.ok((doc!.content || "").includes("ADMIN DIGITAL APPROVAL"), "the new approval's stamp must survive");
  assert.ok((doc!.content || "").includes(newRef), "the stamp must still carry the new trade reference");
  assert.equal(doc!.tradeRef, newRef, "the document must stay tied to the new trade");
  assert.equal(doc!.docxPath, filesBefore.docx, "the new approval's DOCX path must survive");
  assert.equal(doc!.pdfPath, filesBefore.pdf, "the new approval's PDF path must survive");

  // Sanity: on a genuinely detached document the same strip DOES apply.
  const revokedAgain = await revokeTfrApproval(dealId);
  assert.equal(revokedAgain.ok, true, "unwinding the re-approval should succeed");
  const cleaned = await storage.getDocumentById(tfrDocId);
  assert.ok(!(cleaned!.content || "").includes("ADMIN DIGITAL APPROVAL"),
    "the revoke's own cleanup strips the stamp when the document really is detached");
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

test("only allowlisted statuses are eligible; unknown statuses are excluded", () => {
  // The matcher uses an explicit allowlist (MATCHABLE_ENQUIRY_STATUSES): only
  // the open/pending statuses (active/open/under_review/quoted) are eligible.
  // Everything else — terminal statuses AND any unknown/future status like a
  // hypothetical "draft" — is excluded by default, so a new status can never
  // silently appear in pairings.
  const imp = synthEnquiry({ enquiryRef: "IMP-ST", side: "buy", product: "Copper Cathode", status: "active" });

  // Every allowlisted status pairs with an active import.
  for (const status of ["active", "open", "under_review", "quoted"]) {
    const exp = synthEnquiry({ enquiryRef: `EXP-${status}`, side: "sell", product: "Copper Cathode", status });
    assert.equal(
      computeEnquiryMatches([imp, exp], []).length,
      1,
      `an export with allowlisted status "${status}" should match`,
    );
  }

  // Terminal statuses and "accepted" are not on the allowlist.
  for (const status of ["closed", "rejected", "cancelled", "accepted"]) {
    const exp = synthEnquiry({ enquiryRef: `EXP-${status}`, side: "sell", product: "Copper Cathode", status });
    assert.equal(
      computeEnquiryMatches([imp, exp], []).length,
      0,
      `an export with non-allowlisted status "${status}" is never eligible`,
    );
  }

  // An unknown/future status is excluded by default (allowlist, not denylist).
  const expDraft = synthEnquiry({ enquiryRef: "EXP-DRAFT", side: "sell", product: "Copper Cathode", status: "draft" });
  assert.equal(
    computeEnquiryMatches([imp, expDraft], []).length,
    0,
    'an unknown status like "draft" must not be surfaced unless explicitly allowlisted',
  );

  // An import with an unknown status is excluded too.
  const impDraft = synthEnquiry({ enquiryRef: "IMP-DRAFT", side: "buy", product: "Copper Cathode", status: "draft" });
  const expActive = synthEnquiry({ enquiryRef: "EXP-ACT", side: "sell", product: "Copper Cathode", status: "active" });
  assert.equal(
    computeEnquiryMatches([impDraft, expActive], []).length,
    0,
    "an import with an unknown status yields no matches",
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

// ---------------------------------------------------------------------------
// TFR bank addressee heading ("To / Address / Attn.") — must stay pre-filled
// from the import buyer's approved KYC bank details, and show placeholder
// blanks when no KYC exists, as templates evolve.
// ---------------------------------------------------------------------------

test("cascade TFR is addressed to the import buyer's KYC bank when an approved KYC exists", async () => {
  // The buyer name is the exact-match lookup key for the KYC prefill, and the
  // dev DB is shared — it must be run-unique so a concurrent/stale KYC row for
  // a same-named company can never satisfy (or shadow) this test's lookup.
  const buyerCompany = `ZZTEST Import Buyer ${RUN}`;
  const imp = await storage.createTradeEnquiry({
    side: "buy",
    product: PRODUCT,
    quantity: "5000",
    unit: "MT",
    price: "8000",
    currency: "USD",
    origin: "Zambia",
    loadingPort: "Dar es Salaam",
    incoterms: "FOB",
    buyerName: buyerCompany,
    sellerName: `Supplier Co KYC-${RUN}`,
    createdBy: CREATOR,
    status: "active",
  } as any);
  createdEnquiryIds.push(imp.id);
  const exp = await makeExport("KYC");

  const bankName = `ZZTEST Bank of Testing ${RUN}`;
  const bankAddress = `42 Ledger Lane, Test City ${RUN}`;
  const kyc = await storage.createKycApplication({
    companyName: buyerCompany, // exact-match lookup key for the prefill
    registeredAddress: "1 Buyer Street",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "AE",
    registrationNumber: `REGTFR-${RUN}`,
    contactName: "Test Contact",
    contactTitle: "Director",
    contactPhone: "+971500000000",
    contactEmail: `buyer-${RUN}@test.example`,
    bankName,
    bankAddress,
    status: "approved",
  } as any);
  createdKycIds.push(kyc.id);

  const result = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.equal(result.ok, true, "deal creation should succeed");
  if (!result.ok) return;
  createdDealIds.push(result.value.id);

  const tfr = (await storage.getDocuments()).find(d => d.id === result.value.tfrDocId);
  assert.ok(tfr, "TFR document should exist");
  const content = tfr!.content || "";
  assert.ok(content.includes(`To: ${bankName}`), "TFR heading must carry the buyer's KYC bank name");
  assert.ok(content.includes(`Address: ${bankAddress}`), "TFR heading must carry the buyer's KYC bank address");
  assert.ok(content.includes("Attn.: Trade Finance Department"), "Attn. line defaults to Trade Finance Department");
});

test("cascade TFR shows placeholder blanks in the addressee heading when no KYC exists", async () => {
  const imp = await makeImport("NOKYC");
  const exp = await makeExport("NOKYC");

  const result = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.equal(result.ok, true, "deal creation should succeed");
  if (!result.ok) return;
  createdDealIds.push(result.value.id);

  const tfr = (await storage.getDocuments()).find(d => d.id === result.value.tfrDocId);
  assert.ok(tfr, "TFR document should exist");
  const content = tfr!.content || "";
  assert.ok(content.includes("To: ____"), "To line must fall back to a placeholder blank");
  assert.ok(content.includes("Address: ____"), "Address line must fall back to a placeholder blank");
  assert.ok(content.includes("Attn.: Trade Finance Department"), "Attn. line still defaults to Trade Finance Department");
});

// ---------------------------------------------------------------------------
// KYC authorization boundary for NON-ADMIN (team) callers: deriveNextDocument
// may only enrich the TFR addressee from a buyer's approved KYC when that
// buyer is named on the source enquiry that authorized the document chain.
// Otherwise a team member could embed an arbitrary approved company name in a
// parent SPA and use create-next to exfiltrate that company's banking data.
// ---------------------------------------------------------------------------

test("team-caller SPA-chain TFR must NOT prefill bank details for a buyer not named on the enquiry", async () => {
  // An approved KYC exists for the SPA's buyer — but that buyer is NOT the
  // buyer recorded on the linked enquiry.
  const spaBuyer = `ZZTEST Unauthorized Buyer ${RUN}`;
  const bankName = `ZZTEST Secret Bank ${RUN}`;
  const bankAddress = `9 Hidden Vault St, Test City ${RUN}`;
  await makeApprovedKyc(spaBuyer, bankName, bankAddress, "TEAMDENY");

  const enq = await makeImport("TEAMDENY"); // enquiry buyer is "Buyer Co TEAMDENY <RUN>", not spaBuyer
  const parent = await makeSignedSpa(spaBuyer, "TEAMDENY", enq.enquiryRef);

  const tfr = await deriveNextDocument(parent, "TFR", /* isAdminCaller */ false, true);
  assert.ok(tfr, "TFR should still be derived for the team caller");
  createdDocIds.push(tfr.id);

  const content = tfr.content || "";
  assert.ok(!content.includes(bankName), "unauthorized buyer's bank name must not appear anywhere in the TFR");
  assert.ok(!content.includes(bankAddress), "unauthorized buyer's bank address must not appear anywhere in the TFR");
  assert.ok(content.includes("To: ____"), "To line must stay a placeholder blank for the unauthorized buyer");
  assert.ok(content.includes("Address: ____"), "Address line must stay a placeholder blank for the unauthorized buyer");
});

test("team-caller SPA-chain TFR DOES prefill bank details when the buyer is named on the enquiry", async () => {
  const buyerName = `ZZTEST Authorized Buyer ${RUN}`;
  const bankName = `ZZTEST Allowed Bank ${RUN}`;
  const bankAddress = `3 Cleared Funds Ave, Test City ${RUN}`;
  await makeApprovedKyc(buyerName, bankName, bankAddress, "TEAMOK");

  // The enquiry names this exact buyer, so the team caller is authorized.
  const enq = await storage.createTradeEnquiry({
    side: "buy",
    product: PRODUCT,
    quantity: "5000",
    unit: "MT",
    price: "8000",
    currency: "USD",
    origin: "Zambia",
    loadingPort: "Dar es Salaam",
    incoterms: "FOB",
    buyerName,
    sellerName: `Supplier Co TEAMOK ${RUN}`,
    createdBy: CREATOR,
    status: "active",
  } as any);
  createdEnquiryIds.push(enq.id);

  const parent = await makeSignedSpa(buyerName, "TEAMOK", enq.enquiryRef);
  const tfr = await deriveNextDocument(parent, "TFR", /* isAdminCaller */ false, true);
  assert.ok(tfr, "TFR should be derived for the team caller");
  createdDocIds.push(tfr.id);

  const content = tfr.content || "";
  assert.ok(content.includes(`To: ${bankName}`), "authorized buyer's KYC bank name must prefill the To line");
  assert.ok(content.includes(`Address: ${bankAddress}`), "authorized buyer's KYC bank address must prefill the Address line");
  assert.ok(content.includes("Attn.: Trade Finance Department"), "Attn. line defaults to Trade Finance Department");
});

// SPA-chain TFR (deriveNextDocument): the same addressee prefill applies when a
// TFR is derived from a signed SPA, keyed on the SPA buyer's approved KYC.
// Render a real SPA through the template so the test stays in lockstep with
// parseSpaDocFields (which parses the template's own headings/labels).
function spaContentFor(buyerName: string, sellerName: string): string {
  return generateDocumentContent(
    "SPA",
    undefined,
    { name: buyerName, address: "Jebel Ali Free Zone, Dubai, UAE", contact: "buyer@test.example" },
    { name: sellerName, address: "1 Fenchurch St, London, UK", contact: "seller@test.example" },
    {
      commodity: "Iron Ore Fines 62%",
      origin: "Brazil",
      quantity: "50,000 MT",
      price: "105.50",
      currency: "USD",
      incoterm: "CFR",
      loadingPort: "Port of Tubarao",
      dischargePort: "Qingdao Port",
      paymentTerms: "Irrevocable DLC at sight",
    },
  );
}

async function makeSignedSpa(buyerName: string, label: string, enquiryRef?: string | null) {
  const doc = await storage.createDocument({
    docType: "SPA",
    title: `SPA - TFR addressee test (${label})`,
    status: "draft",
    content: spaContentFor(buyerName, `ZZTEST Seller ${RUN}`),
    dealRecapNumber: `TST/TFR-${RUN}-${label}`,
    enquiryRef: enquiryRef ?? null,
    buyerSignature: "Buyer Signatory",
    sellerSignature: "Seller Signatory",
  } as any);
  createdDocIds.push(doc.id);
  return doc;
}

// Create an approved KYC row (with bank details) for a company, so tests can
// prove whether the TFR addressee prefill is allowed to read it.
async function makeApprovedKyc(companyName: string, bankName: string, bankAddress: string, label: string) {
  const kyc = await storage.createKycApplication({
    companyName,
    registeredAddress: "Jebel Ali Free Zone, Dubai, UAE",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "AE",
    registrationNumber: `REG${label}-${RUN}`,
    contactName: "Test Contact",
    contactTitle: "Director",
    contactPhone: "+971500000000",
    contactEmail: `${label.toLowerCase()}-${RUN}@test.example`,
    bankName,
    bankAddress,
    status: "approved",
  } as any);
  createdKycIds.push(kyc.id);
  return kyc;
}

test("SPA-chain TFR is addressed to the SPA buyer's KYC bank when an approved KYC exists", async () => {
  const buyerName = `ZZTEST SPA Buyer ${RUN}`;
  const bankName = `ZZTEST SPA Bank ${RUN}`;
  const bankAddress = `7 Clearing House Row, Test City ${RUN}`;
  const kyc = await storage.createKycApplication({
    companyName: buyerName,
    registeredAddress: "Jebel Ali Free Zone, Dubai, UAE",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "AE",
    registrationNumber: `REGSPA-${RUN}`,
    contactName: "Test Contact",
    contactTitle: "Director",
    contactPhone: "+971500000000",
    contactEmail: `spa-buyer-${RUN}@test.example`,
    bankName,
    bankAddress,
    status: "approved",
  } as any);
  createdKycIds.push(kyc.id);

  const parent = await makeSignedSpa(buyerName, "WITHKYC");
  const tfr = await deriveNextDocument(parent, "TFR", true, true);
  assert.ok(tfr, "TFR should be derived from the signed SPA");
  createdDocIds.push(tfr.id);

  const content = tfr.content || "";
  assert.ok(content.includes(`To: ${bankName}`), "derived TFR heading must carry the buyer's KYC bank name");
  assert.ok(content.includes(`Address: ${bankAddress}`), "derived TFR heading must carry the buyer's KYC bank address");
  assert.ok(content.includes("Attn.: Trade Finance Department"), "Attn. line defaults to Trade Finance Department");
});

// ---------------------------------------------------------------------------
// Co-party KYC authorization boundary for NON-ADMIN (team) callers:
// deriveNextDocument may only enrich a joint co-buyer/co-seller's details
// (registered address / contact email) from approved KYC when that co-company
// is named on the source enquiry. Otherwise a team member could embed an
// arbitrary approved company as a joint party in a parent document and use
// create-next to exfiltrate that company's address/contact data.
// Parent = LOI (renders the labeled Co-Buyer block); child = SPA (renders
// Co-Buyer Company/Address/Contact), so enrichment is observable in content.
// ---------------------------------------------------------------------------

// Render a real LOI through the template with a joint co-buyer whose
// address/contact are intentionally blank, so derivation must consult KYC
// (if authorized) to fill them.
function loiWithCoBuyer(buyerName: string, coBuyerName: string): string {
  return generateDocumentContent(
    "LOI",
    undefined,
    { name: buyerName, address: "Jebel Ali Free Zone, Dubai, UAE", contact: "buyer@test.example", coName: coBuyerName },
    { name: `ZZTEST Seller ${RUN}`, address: "1 Fenchurch St, London, UK", contact: "seller@test.example" },
    {
      commodity: "Iron Ore Fines 62%",
      origin: "Brazil",
      quantity: "50,000 MT",
      price: "105.50",
      currency: "USD",
      incoterm: "CFR",
      loadingPort: "Port of Tubarao",
      dischargePort: "Qingdao Port",
      paymentTerms: "Irrevocable DLC at sight",
    },
  );
}

async function makeLoiWithCoBuyer(buyerName: string, coBuyerName: string, enquiryRef: string, label: string) {
  const doc = await storage.createDocument({
    docType: "LOI",
    title: `LOI - co-party boundary test (${label})`,
    status: "draft",
    content: loiWithCoBuyer(buyerName, coBuyerName),
    enquiryRef,
  } as any);
  createdDocIds.push(doc.id);
  return doc;
}

// Approved KYC with a run-unique registered address + contact email so the
// assertions below can prove exactly whether KYC data leaked into the child.
async function makeApprovedCoPartyKyc(companyName: string, registeredAddress: string, contactEmail: string, label: string) {
  const kyc = await storage.createKycApplication({
    companyName,
    registeredAddress,
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "AE",
    registrationNumber: `REGCO${label}-${RUN}`,
    contactName: "Co Test Contact",
    contactTitle: "Director",
    contactPhone: "+971500000000",
    contactEmail,
    bankName: `ZZTEST Co Bank ${label} ${RUN}`,
    bankAddress: `1 Co Bank St ${label} ${RUN}`,
    status: "approved",
  } as any);
  createdKycIds.push(kyc.id);
  return kyc;
}

test("team-caller derived SPA must NOT carry KYC details for a co-buyer not named on the enquiry", async () => {
  // The co-buyer has an approved KYC — but the linked enquiry does NOT name
  // it as a co-party, so a team caller is not authorized to read that KYC.
  const coName = `ZZTEST Unauthorized CoBuyer ${RUN}`;
  const kycAddress = `77 Covert Registry Rd, Test City ${RUN}`;
  const kycEmail = `codeny-${RUN}@test.example`;
  await makeApprovedCoPartyKyc(coName, kycAddress, kycEmail, "CODENY");

  const enq = await makeImport("CODENY"); // no coBuyerName on the enquiry
  const buyerName = enq.buyerName!; // primary buyer IS on the enquiry
  const parent = await makeLoiWithCoBuyer(buyerName, coName, enq.enquiryRef, "CODENY");

  const spa = await deriveNextDocument(parent, "SPA", /* isAdminCaller */ false, true);
  assert.ok(spa, "SPA should still be derived for the team caller");
  createdDocIds.push(spa.id);

  const content = spa.content || "";
  assert.ok(content.includes(coName), "the co-buyer's NAME (already on the parent) still carries over");
  assert.ok(!content.includes(kycAddress), "unauthorized co-buyer's KYC registered address must not leak into the SPA");
  assert.ok(!content.includes(kycEmail), "unauthorized co-buyer's KYC contact email must not leak into the SPA");
});

test("team-caller derived SPA DOES carry KYC details when the co-buyer is named on the enquiry", async () => {
  const coName = `ZZTEST Authorized CoBuyer ${RUN}`;
  const kycAddress = `12 Cleared Registry Ave, Test City ${RUN}`;
  const kycEmail = `cook-${RUN}@test.example`;
  await makeApprovedCoPartyKyc(coName, kycAddress, kycEmail, "COOK");

  // The enquiry names this exact co-buyer (with no address/contact of its
  // own), so the team caller is authorized and enrichment must consult KYC.
  const buyerName = `ZZTEST Primary Buyer COOK ${RUN}`;
  const enq = await storage.createTradeEnquiry({
    side: "buy",
    product: PRODUCT,
    quantity: "5000",
    unit: "MT",
    price: "8000",
    currency: "USD",
    origin: "Zambia",
    loadingPort: "Dar es Salaam",
    incoterms: "FOB",
    buyerName,
    coBuyerName: coName,
    sellerName: `Supplier Co COOK ${RUN}`,
    createdBy: CREATOR,
    status: "active",
  } as any);
  createdEnquiryIds.push(enq.id);

  const parent = await makeLoiWithCoBuyer(buyerName, coName, enq.enquiryRef, "COOK");
  const spa = await deriveNextDocument(parent, "SPA", /* isAdminCaller */ false, true);
  assert.ok(spa, "SPA should be derived for the team caller");
  createdDocIds.push(spa.id);

  const content = spa.content || "";
  assert.ok(content.includes(`Co-Buyer Company: ${coName}`), "co-buyer company block should render");
  assert.ok(content.includes(kycAddress), "authorized co-buyer's KYC registered address should enrich the SPA");
  assert.ok(content.includes(kycEmail), "authorized co-buyer's KYC contact email should enrich the SPA");
});

test("co-seller boundary: team-caller derived SPA enriches only an enquiry-named co-seller from KYC", async () => {
  // Deny: co-seller with approved KYC but NOT on the enquiry.
  const deniedCo = `ZZTEST Unauthorized CoSeller ${RUN}`;
  const deniedAddr = `44 Shadow Registry Ln, Test City ${RUN}`;
  const deniedEmail = `csdeny-${RUN}@test.example`;
  await makeApprovedCoPartyKyc(deniedCo, deniedAddr, deniedEmail, "CSDENY");

  const enqDeny = await makeImport("CSDENY"); // no coSellerName on the enquiry
  const parentDeny = await storage.createDocument({
    docType: "LOI",
    title: `LOI - co-seller boundary test (CSDENY)`,
    status: "draft",
    content: generateDocumentContent(
      "LOI",
      undefined,
      { name: enqDeny.buyerName!, address: "Jebel Ali Free Zone, Dubai, UAE", contact: "buyer@test.example" },
      { name: enqDeny.sellerName!, address: "1 Fenchurch St, London, UK", contact: "seller@test.example", coName: deniedCo },
      { commodity: "Iron Ore Fines 62%", quantity: "50,000 MT", price: "105.50", currency: "USD", incoterm: "CFR" },
    ),
    enquiryRef: enqDeny.enquiryRef,
  } as any);
  createdDocIds.push(parentDeny.id);

  const spaDeny = await deriveNextDocument(parentDeny, "SPA", /* isAdminCaller */ false, true);
  createdDocIds.push(spaDeny.id);
  const denyContent = spaDeny.content || "";
  assert.ok(denyContent.includes(deniedCo), "co-seller NAME (already on the parent) still carries over");
  assert.ok(!denyContent.includes(deniedAddr), "unauthorized co-seller's KYC address must not leak");
  assert.ok(!denyContent.includes(deniedEmail), "unauthorized co-seller's KYC email must not leak");

  // Allow: co-seller named on the enquiry.
  const allowedCo = `ZZTEST Authorized CoSeller ${RUN}`;
  const allowedAddr = `9 Open Registry Sq, Test City ${RUN}`;
  const allowedEmail = `csok-${RUN}@test.example`;
  await makeApprovedCoPartyKyc(allowedCo, allowedAddr, allowedEmail, "CSOK");

  const sellerName = `ZZTEST Primary Seller CSOK ${RUN}`;
  const enqOk = await storage.createTradeEnquiry({
    side: "buy", product: PRODUCT, quantity: "5000", unit: "MT", price: "8000",
    currency: "USD", origin: "Zambia", loadingPort: "Dar es Salaam", incoterms: "FOB",
    buyerName: `Buyer Co CSOK ${RUN}`,
    sellerName,
    coSellerName: allowedCo,
    createdBy: CREATOR, status: "active",
  } as any);
  createdEnquiryIds.push(enqOk.id);

  const parentOk = await storage.createDocument({
    docType: "LOI",
    title: `LOI - co-seller boundary test (CSOK)`,
    status: "draft",
    content: generateDocumentContent(
      "LOI",
      undefined,
      { name: enqOk.buyerName!, address: "Jebel Ali Free Zone, Dubai, UAE", contact: "buyer@test.example" },
      { name: sellerName, address: "1 Fenchurch St, London, UK", contact: "seller@test.example", coName: allowedCo },
      { commodity: "Iron Ore Fines 62%", quantity: "50,000 MT", price: "105.50", currency: "USD", incoterm: "CFR" },
    ),
    enquiryRef: enqOk.enquiryRef,
  } as any);
  createdDocIds.push(parentOk.id);

  const spaOk = await deriveNextDocument(parentOk, "SPA", /* isAdminCaller */ false, true);
  createdDocIds.push(spaOk.id);
  const okContent = spaOk.content || "";
  assert.ok(okContent.includes(`Co-Seller Company: ${allowedCo}`), "co-seller company block should render");
  assert.ok(okContent.includes(allowedAddr), "authorized co-seller's KYC address should enrich the SPA");
  assert.ok(okContent.includes(allowedEmail), "authorized co-seller's KYC email should enrich the SPA");
});

test("SPA-chain TFR shows placeholder blanks in the addressee heading when no KYC exists", async () => {
  const parent = await makeSignedSpa(`ZZTEST Unknown Buyer ${RUN}`, "NOKYC");
  const tfr = await deriveNextDocument(parent, "TFR", true, true);
  assert.ok(tfr, "TFR should be derived from the signed SPA");
  createdDocIds.push(tfr.id);

  const content = tfr.content || "";
  assert.ok(content.includes("To: ____"), "To line must fall back to a placeholder blank");
  assert.ok(content.includes("Address: ____"), "Address line must fall back to a placeholder blank");
  assert.ok(content.includes("Attn.: Trade Finance Department"), "Attn. line still defaults to Trade Finance Department");
});
