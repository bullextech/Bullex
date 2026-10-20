// Tests for the amendment-approval blockchain retry path (task: retry
// amendment approvals automatically when the blockchain moves mid-approval).
//
// KYC and enquiry amendment approvals mine their block outside the DB
// transaction, then re-verify under the blockchain lock that the tip hasn't
// moved. Storage throws the exact "Blockchain advanced while approving" error
// when it has. The routes now wrap the mine-then-approve attempt in
// approveWithBlockchainRetry: one automatic re-mine + retry, then a 409
// ("retryExhausted") instead of a 500.
//
// Covered here:
//  1. Pure retry-helper semantics (retry once on the specific error, exhaust
//     to a 409-shaped result, propagate unrelated errors untouched).
//  2. Storage integration: a stale blockData (tip moved since mining) makes
//     approveAndApplyChangeRequest throw EXACTLY the message the helper keys
//     on, and rolls back cleanly so an immediate re-mined retry succeeds —
//     the real end-to-end retry the routes now perform.
//
// Run with: npx tsx --test server/__tests__/amendment-approval-retry.test.ts

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { storage, pool } from "../storage";
import {
  approveWithBlockchainRetry,
  isBlockchainAdvancedError,
  BLOCKCHAIN_ADVANCED_MESSAGE,
} from "../routes";
import { generateKycAmendmentHash, mineBlock, GENESIS_HASH } from "../blockchain";

const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const createdKycIds: string[] = [];
const createdChangeRequestIds: string[] = [];
const mintedBlockHashes: string[] = [];

before(() => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL must be set to run these tests");
});

after(async () => {
  for (const hash of mintedBlockHashes) {
    await pool.query(`DELETE FROM blocks WHERE hash = $1`, [hash]);
  }
  for (const id of createdChangeRequestIds) {
    await pool.query(`DELETE FROM kyc_change_requests WHERE id = $1`, [id]);
  }
  for (const id of createdKycIds) {
    await storage.deleteKycApplication(id);
  }
  await pool.end();
});

// ─── Pure retry-helper semantics ───

test("retry helper succeeds first try without retrying", async () => {
  let calls = 0;
  const outcome = await approveWithBlockchainRetry(async () => {
    calls++;
    return "done";
  });
  assert.deepEqual(outcome, { ok: true, value: "done" });
  assert.equal(calls, 1);
});

test("retry helper re-runs the attempt once when the chain moved, then succeeds", async () => {
  let calls = 0;
  const outcome = await approveWithBlockchainRetry(async () => {
    calls++;
    if (calls === 1) throw new Error(BLOCKCHAIN_ADVANCED_MESSAGE);
    return "second-try";
  });
  assert.deepEqual(outcome, { ok: true, value: "second-try" });
  assert.equal(calls, 2, "exactly one retry");
});

test("retry helper exhausts to a 409-shaped result when the chain moves twice", async () => {
  let calls = 0;
  const outcome = await approveWithBlockchainRetry(async () => {
    calls++;
    throw new Error(BLOCKCHAIN_ADVANCED_MESSAGE);
  });
  assert.deepEqual(outcome, { ok: false, retryExhausted: true });
  assert.equal(calls, 2, "never more than two attempts");
});

test("retry helper propagates unrelated errors without retrying", async () => {
  let calls = 0;
  await assert.rejects(
    approveWithBlockchainRetry(async () => {
      calls++;
      throw new Error("Change request not found");
    }),
    /Change request not found/,
  );
  assert.equal(calls, 1, "unrelated errors must not be retried");
});

test("retry helper propagates an unrelated error thrown on the retry attempt", async () => {
  let calls = 0;
  await assert.rejects(
    approveWithBlockchainRetry(async () => {
      calls++;
      if (calls === 1) throw new Error(BLOCKCHAIN_ADVANCED_MESSAGE);
      throw new Error("db connection lost");
    }),
    /db connection lost/,
  );
  assert.equal(calls, 2);
});

test("isBlockchainAdvancedError matches only the exact storage error", () => {
  assert.equal(isBlockchainAdvancedError(new Error(BLOCKCHAIN_ADVANCED_MESSAGE)), true);
  assert.equal(isBlockchainAdvancedError(new Error("some other error")), false);
  assert.equal(isBlockchainAdvancedError(BLOCKCHAIN_ADVANCED_MESSAGE), false, "plain strings don't match");
  assert.equal(isBlockchainAdvancedError(null), false);
});

// ─── Storage integration: stale tip -> exact error -> re-mined retry succeeds ───

test("stale blockData throws the retryable error, and a re-mined retry succeeds end-to-end", async () => {
  const kyc = await storage.createKycApplication({
    companyName: `ZZRETRY-${RUN}`,
    registeredAddress: "1 Test Street",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "AE",
    registrationNumber: `REGRT-${RUN}`,
    contactName: "Test Contact",
    contactTitle: "Director",
    contactPhone: "+971500000000",
    contactEmail: "before@retry.test",
    status: "approved",
  } as any);
  createdKycIds.push(kyc.id);

  const fields = { contactEmail: "after@retry.test" };
  const changeReq = await storage.createKycChangeRequest({
    kycApplicationId: kyc.id,
    changedFields: fields,
    reason: "retry test",
  });
  createdChangeRequestIds.push(changeReq.id);

  // Simulate "mined against a tip that then moved": blockData whose
  // previousHash cannot match the live tip (the chain has at least the mint
  // below or existing blocks; a bogus previousHash + number is always stale
  // unless the chain is empty, in which case the number mismatch triggers it).
  const tipBefore = await storage.getLatestBlock();
  await assert.rejects(
    storage.approveAndApplyChangeRequest(changeReq.id, "stale attempt", {
      blockNumber: (tipBefore?.blockNumber ?? 0) + 2, // wrong next number
      hash: `stale-hash-${RUN}`,
      previousHash: `stale-prev-${RUN}`, // not the live tip's hash
      nonce: 1,
      timestamp: new Date(),
      dataId: kyc.id,
      dataSummary: `${kyc.companyName} | Amendment: contactEmail`,
    }),
    (err: unknown) => {
      assert.ok(isBlockchainAdvancedError(err), `must throw the exact retryable error, got: ${(err as Error)?.message}`);
      return true;
    },
  );

  // The failed attempt rolled back fully: still pending, field unchanged.
  const rereadPending = await storage.getKycApplicationById(kyc.id);
  assert.equal(rereadPending!.contactEmail, "before@retry.test");
  const reqsPending = await storage.getKycChangeRequestsByApplicationId(kyc.id);
  assert.equal(reqsPending.find(c => c.id === changeReq.id)!.status, "pending");

  // Now perform what the route's retry does: re-read the live tip, re-mine,
  // and approve again. Wrapped in the same helper the routes use. A parallel
  // suite can still race our block_number (UNIQUE), which surfaces as a
  // non-retryable unique violation — loop like kyc-amendment.test.ts does.
  let approved: Awaited<ReturnType<typeof storage.approveAndApplyChangeRequest>> | undefined;
  for (let i = 0; i < 10 && !approved; i++) {
    const outcome = await approveWithBlockchainRetry(async () => {
      const tip = await storage.getLatestBlock();
      const previousHash = tip?.hash || GENESIS_HASH;
      const blockNumber = (tip?.blockNumber || 0) + 1;
      const timestampIso = new Date().toISOString();
      const amendmentHash = generateKycAmendmentHash(kyc.companyName, kyc.registrationNumber, fields, timestampIso);
      const { hash: blockHash, nonce } = mineBlock(blockNumber, previousHash, timestampIso, amendmentHash);
      const updated = await storage.approveAndApplyChangeRequest(changeReq.id, "retried", {
        blockNumber,
        hash: blockHash,
        previousHash,
        nonce,
        timestamp: new Date(timestampIso),
        dataId: kyc.id,
        dataSummary: `${kyc.companyName} | Amendment: contactEmail`,
      });
      mintedBlockHashes.push(blockHash);
      return updated;
    }).catch((err) => {
      // Parallel-suite block_number collision: recompute and retry the loop.
      const e = err as { code?: string; cause?: { code?: string }; message?: string };
      if (e?.code === "23505" || e?.cause?.code === "23505" || /duplicate key/i.test(e?.message ?? "")) return undefined;
      throw err;
    });
    if (outcome === undefined) { await new Promise(r => setTimeout(r, 20)); continue; }
    assert.equal(outcome.ok, true, "re-mined retry against the live tip must succeed");
    if (outcome.ok) approved = outcome.value;
  }
  assert.ok(approved, "retry loop should have applied the amendment");
  assert.equal(approved!.contactEmail, "after@retry.test");

  const reqsAfter = await storage.getKycChangeRequestsByApplicationId(kyc.id);
  assert.equal(reqsAfter.find(c => c.id === changeReq.id)!.status, "approved");
});
