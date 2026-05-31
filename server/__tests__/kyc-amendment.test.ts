// Integration tests for the KYC profile amendment (change-request) path.
//
// The amendment route lets an admin/team member alter an approved KYC
// application's fields via a change request that is later approved and applied.
// Blanking a required onboarding field (e.g. company name or contact email)
// silently corrupts an approved record, so the route must reject it — but the
// schema-level validation that covers fresh KYC submissions does NOT run on the
// change-request path. These tests pin the server-side guard so the regression
// can't silently return.
//
// We test the extracted service function `sanitizeKycChangeFields` (the same
// logic the POST /api/kyc/:id/change-request handler runs) rather than over
// HTTP, because the session cookie is `secure: true` and authenticated HTTP
// requests do not work over plain-HTTP test clients — the same convention as
// enquiry-amendment.test.ts. A final integration case drives a valid amendment
// all the way through storage (create -> approve -> apply) against the real dev
// DB and asserts the trimmed value is persisted.
//
// Every record created (KYC app, change request, minted amendment block) is
// removed in the `after` hook so the test leaves the database — including the
// append-only blockchain — as it found it. Run with:
//   npx tsx server/__tests__/kyc-amendment.test.ts

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { storage, pool } from "../storage";
import { sanitizeKycChangeFields } from "../routes";
import { generateKycAmendmentHash, mineBlock, GENESIS_HASH } from "../blockchain";

const RUN = Date.now().toString(36);

// Track everything we create so cleanup is deterministic and complete.
const createdKycIds: string[] = [];
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
    await pool.query(`DELETE FROM kyc_change_requests WHERE id = $1`, [id]);
  }
  for (const id of createdKycIds) {
    await storage.deleteKycApplication(id);
  }
  await pool.end();
});

// ─── Pure guard: a blank required field amendment is always rejected ───

test("amendment rejects an empty-string required field (companyName)", () => {
  const r = sanitizeKycChangeFields({ companyName: "" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /companyName/i);
});

test("amendment rejects a whitespace-only required field (contactEmail)", () => {
  const r = sanitizeKycChangeFields({ contactEmail: "   " });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /contactEmail/i);
});

test("amendment accepts and trims a valid required field", () => {
  const r = sanitizeKycChangeFields({ companyName: "  Acme Metals Ltd  " });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.fields.companyName, "Acme Metals Ltd");
});

test("amendment keeps other allowlisted fields while trimming the required field", () => {
  const r = sanitizeKycChangeFields({ companyName: "  Acme  ", website: "  https://acme.test  " });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.fields.companyName, "Acme");
    assert.equal(r.fields.website, "https://acme.test");
  }
});

test("amendment allows clearing an optional field (faxNumber)", () => {
  const r = sanitizeKycChangeFields({ faxNumber: "   ", bankName: "New Bank" });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.fields.faxNumber, "", "optional field may be blanked");
    assert.equal(r.fields.bankName, "New Bank");
  }
});

test("amendment drops non-allowlisted fields (e.g. status/participantId)", () => {
  const r = sanitizeKycChangeFields({ status: "rejected", participantId: "HACK-1", bankName: "X" });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal("status" in r.fields, false, "status must not be amendable");
    assert.equal("participantId" in r.fields, false, "participantId must not be amendable");
    assert.equal(r.fields.bankName, "X");
  }
});

test("amendment rejects when nothing valid remains after allowlisting", () => {
  const r = sanitizeKycChangeFields({ status: "approved" });
  assert.equal(r.ok, false);
});

test("amendment rejects an empty / non-object changedFields", () => {
  assert.equal(sanitizeKycChangeFields({}).ok, false);
  assert.equal(sanitizeKycChangeFields(null).ok, false);
  assert.equal(sanitizeKycChangeFields(undefined).ok, false);
  assert.equal(sanitizeKycChangeFields([]).ok, false);
});

// ─── Integration: a valid amendment is accepted, applied and persisted ───

test("a valid amendment is applied to the KYC application end-to-end", async () => {
  // Start with an approved KYC application — the route only allows change
  // requests against approved records.
  const kyc = await storage.createKycApplication({
    companyName: `ZZAMEND-${RUN}`,
    registeredAddress: "1 Test Street",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "AE",
    registrationNumber: `REG-${RUN}`,
    contactName: "Test Contact",
    contactTitle: "Director",
    contactPhone: "+971500000000",
    contactEmail: "old@acme.test",
    status: "approved",
  } as any);
  createdKycIds.push(kyc.id);

  // The user submits a padded-but-non-blank contact email. The guard must
  // accept it and store the trimmed value.
  const sanitized = sanitizeKycChangeFields({ contactEmail: "  new@acme.test  " });
  assert.equal(sanitized.ok, true);
  if (!sanitized.ok) return;
  assert.equal(sanitized.fields.contactEmail, "new@acme.test");

  const changeReq = await storage.createKycChangeRequest({
    kycApplicationId: kyc.id,
    changedFields: sanitized.fields,
    reason: "test amendment",
  });
  createdChangeRequestIds.push(changeReq.id);
  assert.equal(changeReq.status, "pending");

  // Approve + apply through storage, mirroring what the status route does: mint
  // an amendment block alongside the field update.
  const updated = await storage.approveAndApplyChangeRequest(changeReq.id, "approved in test");

  const latestBlock = await storage.getLatestBlock();
  const previousHash = latestBlock?.hash || GENESIS_HASH;
  const blockNumber = (latestBlock?.blockNumber || 0) + 1;
  const timestampIso = new Date().toISOString();
  const amendmentHash = generateKycAmendmentHash(
    updated.companyName,
    updated.registrationNumber,
    sanitized.fields,
    timestampIso,
  );
  const { hash: blockHash, nonce } = mineBlock(blockNumber, previousHash, timestampIso, amendmentHash);
  await storage.createBlock({
    blockNumber,
    hash: blockHash,
    previousHash,
    nonce,
    timestamp: new Date(timestampIso),
    dataType: "kyc",
    dataId: kyc.id,
    dataSummary: `${updated.companyName} | Amendment: contactEmail`,
  } as any);
  mintedBlockNumbers.push(blockNumber);

  // The trimmed value is now live on the application, and the required field is
  // never blank.
  assert.equal(updated.contactEmail, "new@acme.test");
  assert.ok(updated.companyName.trim().length > 0, "required company name must never be blank");

  // The change request is recorded as approved, and the application persists the
  // change when re-read from the database.
  const reqs = await storage.getKycChangeRequestsByApplicationId(kyc.id);
  const applied = reqs.find(c => c.id === changeReq.id);
  assert.ok(applied, "change request should still exist");
  assert.equal(applied!.status, "approved");

  const reread = await storage.getKycApplicationById(kyc.id);
  assert.equal(reread!.contactEmail, "new@acme.test");
});
