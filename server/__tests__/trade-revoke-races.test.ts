// Deterministic concurrency tests for TFR-revoke racing trade mutations.
//
// Revoking a TFR approval deletes the freshly minted trade (and its chain-tip
// block) inside a row-locked transaction. These tests prove the mutation paths
// that previously could "slip past" a revoke now fail cleanly instead:
//   - document upload attach (attachTradeDocument) -> undefined, no orphan row
//   - manual stage-flag update (setStageDocumentFlag) -> undefined
//   - status transition (conditional updateTradeStatus)  -> undefined
//   - pre_deal -> deal block mint (mintTradeBlock)        -> throws, no block
//   - unrelated block appends (mintKycBlock) serialize on the blockchain lock
//
// Interleavings are made deterministic by holding row/advisory locks from a
// dedicated pg client, starting the racing operation (which blocks on the
// lock), then committing the lock-holder — exactly the order a slow request
// racing a revoke would experience. Run: npx tsx --test server/__tests__/trade-revoke-races.test.ts

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { storage, pool } from "../storage";
import { createDealFromEnquiries, approveTfrForDeal, revokeTfrApproval } from "../routes";
import { generateTradeHash, generateKycHash, mineBlock, GENESIS_HASH } from "../blockchain";
import type { TradeEnquiry } from "@shared/schema";

// Must match BLOCKCHAIN_LOCK_KEY in server/storage.ts — the single advisory
// lock every blocks append / tip delete serializes on.
const BLOCKCHAIN_LOCK_KEY = 792215001;

const RUN = Date.now().toString(36);
const rand3 = () =>
  Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
const CREATOR = `${rand3()} racer ${RUN}`;
const PRODUCT = `${rand3()}RACETEST-${RUN}`;

const createdEnquiryIds: string[] = [];
const createdDealIds: string[] = [];
const createdKycIds: string[] = [];

async function makeEnquiry(side: "buy" | "sell", suffix: string): Promise<TradeEnquiry> {
  const e = await storage.createTradeEnquiry({
    side,
    product: PRODUCT,
    quantity: "5000",
    unit: "MT",
    price: side === "buy" ? "8000" : "9000",
    currency: "USD",
    incoterms: side === "buy" ? "FOB" : "CIF",
    // Deal formation now requires complete commercial details on both sides.
    ...(side === "buy" ? { origin: "Zambia", loadingPort: "Dar es Salaam" } : { dischargePort: "Shanghai" }),
    buyerName: `Race Buyer ${suffix} ${RUN}`,
    sellerName: `Race Seller ${suffix} ${RUN}`,
    createdBy: CREATOR,
    status: "active",
  } as any);
  createdEnquiryIds.push(e.id);
  return e;
}

// Create a deal and approve its TFR, returning the formed trade.
async function makeApprovedTrade(suffix: string) {
  const imp = await makeEnquiry("buy", suffix);
  const exp = await makeEnquiry("sell", suffix);
  const created = await createDealFromEnquiries(imp.enquiryRef, exp.enquiryRef);
  assert.equal(created.ok, true, "deal creation should succeed");
  if (!created.ok) throw new Error("unreachable");
  createdDealIds.push(created.value.id);
  const approved = await approveTfrForDeal(created.value.id);
  assert.equal(approved.ok, true, "TFR approval should succeed");
  if (!approved.ok) throw new Error("unreachable");
  const tradeRef = approved.value.createdTradeRef!;
  const trade = (await storage.getTrades()).find((t) => t.tradeRef === tradeRef);
  assert.ok(trade, "approved trade should exist");
  return { dealId: created.value.id, trade: trade! };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

before(() => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL must be set");
});

after(async () => {
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
      const { rows } = await pool.query(`SELECT id, block_number FROM trades WHERE trade_ref = $1`, [deal.tradeRef]);
      if (rows[0]) {
        await pool.query(`DELETE FROM trade_documents WHERE trade_id = $1`, [rows[0].id]);
        if (rows[0].block_number != null) {
          await pool.query(`DELETE FROM blocks WHERE block_number = $1`, [rows[0].block_number]);
        }
        await pool.query(`DELETE FROM trades WHERE trade_ref = $1`, [deal.tradeRef]);
      }
    }
    await pool.query(`DELETE FROM deals WHERE id = $1`, [dealId]);
  }
  for (const id of createdKycIds) {
    const { rows } = await pool.query(`SELECT block_number FROM kyc_applications WHERE id = $1`, [id]);
    if (rows[0]?.block_number != null) {
      await pool.query(`DELETE FROM blocks WHERE block_number = $1`, [rows[0].block_number]);
    }
    try { await storage.deleteKycApplication(id); } catch {}
  }
  for (const id of createdEnquiryIds) {
    await storage.deleteTradeEnquiry(id);
  }
  await pool.end();
});

test("revoke committed first: attach, flag, status and mint all fail cleanly with no orphans", async () => {
  const { dealId, trade } = await makeApprovedTrade("SEQ");

  const revoked = await revokeTfrApproval(dealId);
  assert.equal(revoked.ok, true, "revoke should succeed on a fresh trade");

  // Upload attach: must NOT create an orphaned trade_documents row.
  const doc = await storage.attachTradeDocument({
    tradeId: trade.id,
    documentKey: "icpo",
    originalName: "x.pdf",
    storedName: "race-x.pdf",
    mimeType: "application/pdf",
    size: 10,
  } as any);
  assert.equal(doc, undefined, "attach after revoke must return undefined");
  const { rows: orphans } = await pool.query(`SELECT id FROM trade_documents WHERE trade_id = $1`, [trade.id]);
  assert.equal(orphans.length, 0, "no orphaned trade_documents rows may exist");

  // Manual stage flag.
  assert.equal(await storage.setStageDocumentFlag(trade.id, "icpo", true), undefined);

  // Conditional status transition matches zero rows.
  assert.equal(await storage.updateTradeStatus(trade.id, "deal", "pre_deal"), undefined);

  // pre_deal -> deal block mint refuses and appends no block.
  const blocksBefore = (await storage.getBlocks()).length;
  await assert.rejects(
    storage.mintTradeBlock(trade.id, "deal", generateTradeHash, mineBlock, GENESIS_HASH),
    /Trade not found/,
  );
  assert.equal((await storage.getBlocks()).length, blocksBefore, "mint after revoke must not append a block");
});

test("in-flight mutations blocked on the trade row lose to a committed revoke-style delete", async () => {
  // Gate deterministically: a lock-holder transaction locks the trade row
  // (as revokeTfrApprovalForDeal does), the racing operations start and block
  // on that lock, then the holder deletes the trade and commits — the exact
  // interleaving of a revoke committing while slow requests are in flight.
  const { trade } = await makeApprovedTrade("GATE");

  const holder = await pool.connect();
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT pg_advisory_xact_lock($1)", [BLOCKCHAIN_LOCK_KEY]);
    await holder.query("SELECT 1 FROM trades WHERE id = $1 FOR UPDATE", [trade.id]);

    const pAttach = storage.attachTradeDocument({
      tradeId: trade.id,
      documentKey: "icpo",
      originalName: "y.pdf",
      storedName: "race-y.pdf",
      mimeType: "application/pdf",
      size: 10,
    } as any);
    const pFlag = storage.setStageDocumentFlag(trade.id, "icpo", true);
    const pStatus = storage.updateTradeStatus(trade.id, "deal", "pre_deal");
    const pMint = storage.mintTradeBlock(trade.id, "deal", generateTradeHash, mineBlock, GENESIS_HASH)
      .then(() => "resolved" as const, () => "rejected" as const);

    // All four must still be pending — proving they wait on the lock instead
    // of reading stale pre-revoke state.
    const probe = await Promise.race([
      Promise.all([pAttach, pFlag, pStatus, pMint]).then(() => "settled" as const),
      sleep(400).then(() => "pending" as const),
    ]);
    assert.equal(probe, "pending", "mutations must block while the revoke-style transaction holds the row");

    if (trade.blockNumber != null) {
      await holder.query("DELETE FROM blocks WHERE block_number = $1", [trade.blockNumber]);
    }
    await holder.query("DELETE FROM trades WHERE id = $1", [trade.id]);
    await holder.query("COMMIT");

    assert.equal(await pAttach, undefined, "attach must see the deletion and refuse");
    assert.equal(await pFlag, undefined, "flag update must see the deletion and refuse");
    assert.equal(await pStatus, undefined, "status transition must match zero rows");
    assert.equal(await pMint, "rejected", "block mint must reject once the trade is gone");

    const { rows } = await pool.query(`SELECT id FROM trade_documents WHERE trade_id = $1`, [trade.id]);
    assert.equal(rows.length, 0, "no orphaned trade_documents rows may exist");
  } finally {
    holder.release();
  }
});

test("real revoke racing an upload: either order, never an approved-revoke + orphan combination", async () => {
  const { dealId, trade } = await makeApprovedTrade("RACE");

  // Start both while a lock-holder pins the trade row so neither can finish
  // first; on release, Postgres grants the row lock in either order.
  const holder = await pool.connect();
  let pRevoke: ReturnType<typeof revokeTfrApproval>;
  let pAttach: ReturnType<typeof storage.attachTradeDocument>;
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT 1 FROM trades WHERE id = $1 FOR UPDATE", [trade.id]);
    pRevoke = revokeTfrApproval(dealId);
    pAttach = storage.attachTradeDocument({
      tradeId: trade.id,
      documentKey: "icpo",
      originalName: "z.pdf",
      storedName: "race-z.pdf",
      mimeType: "application/pdf",
      size: 10,
    } as any);
    await sleep(300); // let both reach the row lock
    await holder.query("COMMIT");
  } finally {
    holder.release();
  }
  const [revoked, doc] = await Promise.all([pRevoke, pAttach]);

  const { rows } = await pool.query(`SELECT id FROM trade_documents WHERE trade_id = $1`, [trade.id]);
  if (revoked.ok) {
    // Revoke won: the upload must have refused and left nothing behind.
    assert.equal(doc, undefined, "upload must lose to a committed revoke");
    assert.equal(rows.length, 0, "no orphaned trade_documents rows after revoke wins");
  } else {
    // Upload won: the revoke must have refused (stage documents now exist).
    assert.ok(doc, "upload should have committed when revoke lost");
    assert.equal(revoked.status, 409, "revoke must 409 when the trade gained documents");
    assert.equal(rows.length, 1);
    const stillTrade = await storage.getTradeById(trade.id);
    assert.ok(stillTrade, "trade must survive a refused revoke");
  }
});

test("unrelated block appends (KYC mint) serialize on the blockchain lock and keep the chain intact", async () => {
  const kyc = await storage.createKycApplication({
    companyName: `Race KYC Co ${RUN}`,
    registrationNumber: `REG-${RUN}`,
    registeredAddress: "1 Test Street",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "Testland",
    contactName: "Race Tester",
    contactTitle: "QA",
    contactPhone: "+100000000",
    contactEmail: `race-${RUN}@example.com`,
  } as any);
  createdKycIds.push(kyc.id);

  const holder = await pool.connect();
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT pg_advisory_xact_lock($1)", [BLOCKCHAIN_LOCK_KEY]);

    const pKyc = storage.mintKycBlock(kyc.id, generateKycHash, mineBlock, GENESIS_HASH);
    const probe = await Promise.race([
      pKyc.then(() => "settled" as const),
      sleep(400).then(() => "pending" as const),
    ]);
    assert.equal(probe, "pending", "KYC mint must wait for the blockchain lock (same key revoke holds)");

    await holder.query("COMMIT");
    const minted = await pKyc;
    assert.ok(minted.blockchainHash, "KYC mint completes once the lock is released");
  } finally {
    holder.release();
  }

  // Chain integrity: the new tip must chain onto its predecessor's hash.
  const allBlocks = await storage.getBlocks(); // desc by blockNumber
  if (allBlocks.length >= 2) {
    assert.equal(allBlocks[0].previousHash, allBlocks[1].hash, "tip.previousHash must equal predecessor.hash");
  }
});
