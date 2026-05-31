// Integration tests for the enquiry amendment (change-request) path.
//
// The amendment route lets an admin/team member alter an existing enquiry's
// fields via a change request that is later approved and applied. A blank or
// whitespace-only commodity makes an enquiry unusable for matching/deals, so the
// route must reject it — but the schema-level validation that covers fresh
// enquiries does NOT run on the change-request path. These tests pin the
// server-side guard so the regression can't silently return.
//
// We test the extracted service function `sanitizeEnquiryChangeFields` (the same
// logic the POST /api/trade-enquiries/:id/change-request handler runs) rather
// than over HTTP, because the session cookie is `secure: true` and authenticated
// HTTP requests do not work over plain-HTTP test clients — the same convention
// as deal-pipeline.test.ts. A final integration case drives a valid amendment
// all the way through storage (create -> approve -> apply) against the real dev
// DB and asserts the trimmed commodity is persisted.
//
// Every record created (enquiry, change request, minted amendment block) is
// removed in the `after` hook so the test leaves the database — including the
// append-only blockchain — as it found it. Run with:
//   npx tsx server/__tests__/enquiry-amendment.test.ts

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { storage, pool } from "../storage";
import { sanitizeEnquiryChangeFields } from "../routes";
import { generateKycAmendmentHash, mineBlock, GENESIS_HASH } from "../blockchain";

const RUN = Date.now().toString(36);

// Track everything we create so cleanup is deterministic and complete.
const createdEnquiryIds: string[] = [];
const createdChangeRequestIds: string[] = [];
const mintedBlockNumbers: number[] = [];

before(() => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL must be set to run amendment tests");
});

after(async () => {
  for (const blockNumber of mintedBlockNumbers) {
    await pool.query(`DELETE FROM blocks WHERE block_number = $1`, [blockNumber]);
  }
  for (const id of createdChangeRequestIds) {
    await pool.query(`DELETE FROM enquiry_change_requests WHERE id = $1`, [id]);
  }
  for (const id of createdEnquiryIds) {
    await storage.deleteTradeEnquiry(id);
  }
  await pool.end();
});

// ─── Pure guard: a blank commodity amendment is always rejected ───

test("amendment rejects an empty-string commodity", () => {
  const r = sanitizeEnquiryChangeFields({ product: "" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /commodity/i);
});

test("amendment rejects a whitespace-only commodity", () => {
  const r = sanitizeEnquiryChangeFields({ product: "   " });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /commodity/i);
});

test("amendment accepts and trims a valid commodity", () => {
  const r = sanitizeEnquiryChangeFields({ product: "  Copper Cathode  " });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.fields.product, "Copper Cathode");
});

test("amendment keeps other allowlisted fields while trimming the commodity", () => {
  const r = sanitizeEnquiryChangeFields({ product: "  Iron Ore  ", quantity: "1000" });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.fields.product, "Iron Ore");
    assert.equal(r.fields.quantity, "1000");
  }
});

test("amendment drops non-allowlisted fields (e.g. status/enquiryRef)", () => {
  const r = sanitizeEnquiryChangeFields({ status: "active", enquiryRef: "HACK-1", quantity: "5" });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal("status" in r.fields, false, "status must not be amendable");
    assert.equal("enquiryRef" in r.fields, false, "enquiryRef must not be amendable");
    assert.equal(r.fields.quantity, "5");
  }
});

test("amendment rejects when nothing valid remains after allowlisting", () => {
  const r = sanitizeEnquiryChangeFields({ status: "closed" });
  assert.equal(r.ok, false);
});

test("amendment rejects an empty / non-object changedFields", () => {
  assert.equal(sanitizeEnquiryChangeFields({}).ok, false);
  assert.equal(sanitizeEnquiryChangeFields(null).ok, false);
  assert.equal(sanitizeEnquiryChangeFields(undefined).ok, false);
  assert.equal(sanitizeEnquiryChangeFields([]).ok, false);
});

// ─── Integration: a valid amendment is accepted, applied and persisted ───

test("a valid commodity amendment is applied to the enquiry end-to-end", async () => {
  // Start with a usable enquiry whose status is amendable (the route only allows
  // change requests on accepted/closed/quoted/under-review enquiries).
  const enquiry = await storage.createTradeEnquiry({
    side: "buy",
    product: `ZZAMEND-${RUN}`,
    quantity: "5000",
    unit: "MT",
    incoterms: "FOB",
    createdBy: `tester-${RUN}`,
    status: "under_review",
  } as any);
  createdEnquiryIds.push(enquiry.id);

  // The user submits a padded-but-non-blank commodity. The guard must accept it
  // and store the trimmed value.
  const sanitized = sanitizeEnquiryChangeFields({ product: "  Manganese Ore  " });
  assert.equal(sanitized.ok, true);
  if (!sanitized.ok) return;
  assert.equal(sanitized.fields.product, "Manganese Ore");

  const changeReq = await storage.createEnquiryChangeRequest({
    enquiryId: enquiry.id,
    changedFields: sanitized.fields,
    reason: "test amendment",
  });
  createdChangeRequestIds.push(changeReq.id);
  assert.equal(changeReq.status, "pending");

  // Approve + apply through storage, mirroring what the status route does: mint
  // an amendment block in the same transaction as the field update.
  const latestBlock = await storage.getLatestBlock();
  const previousHash = latestBlock?.hash || GENESIS_HASH;
  const blockNumber = (latestBlock?.blockNumber || 0) + 1;
  const timestampIso = new Date().toISOString();
  const amendmentHash = generateKycAmendmentHash(
    enquiry.enquiryRef,
    enquiry.product,
    sanitized.fields,
    timestampIso,
  );
  const { hash: blockHash, nonce } = mineBlock(blockNumber, previousHash, timestampIso, amendmentHash);

  const updated = await storage.approveAndApplyEnquiryChangeRequest(changeReq.id, "approved in test", {
    blockNumber,
    hash: blockHash,
    previousHash,
    nonce,
    timestamp: new Date(timestampIso),
    dataId: enquiry.id,
    dataSummary: `${enquiry.enquiryRef} | Amendment: product`,
  });
  mintedBlockNumbers.push(blockNumber);

  // The trimmed commodity is now live on the enquiry, and it is never blank.
  assert.equal(updated.product, "Manganese Ore");
  assert.ok(updated.product.trim().length > 0, "applied commodity must never be blank");

  // The change request is recorded as approved, and the enquiry persists the
  // change when re-read from the database.
  const reqs = await storage.getEnquiryChangeRequestsByEnquiryId(enquiry.id);
  const applied = reqs.find(c => c.id === changeReq.id);
  assert.ok(applied, "change request should still exist");
  assert.equal(applied!.status, "approved");

  const reread = await storage.getTradeEnquiryById(enquiry.id);
  assert.equal(reread!.product, "Manganese Ore");
});
