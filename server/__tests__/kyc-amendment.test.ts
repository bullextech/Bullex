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
import {
  ALLOWED_KYC_CHANGE_FIELDS,
  isKycApprovalScreeningComplete,
  sanitizeKycAdminAmendFields,
  sanitizeKycChangeFields,
} from "../routes";
import { generateKycAmendmentHash, mineBlock, GENESIS_HASH } from "../blockchain";

const RUN = Date.now().toString(36);

// Track everything we create so cleanup is deterministic and complete.
const createdKycIds: string[] = [];
const createdChangeRequestIds: string[] = [];
const mintedBlockNumbers: number[] = [];
const bankSourceIds: string[] = [];
const createdBankAccountIds: string[] = [];
const BANK_FAILURE_TRIGGER = `kyc_bank_failure_${RUN}`;
const BANK_FAILURE_FUNCTION = `${BANK_FAILURE_TRIGGER}_fn`;
let bankFailureTriggerInstalled = false;

// Cross-process suite mutex: this suite mints/deletes blockchain blocks, which
// moves the chain tip under any concurrently running chain-sensitive suite
// (same run, another agent's validation, the dev server). Hold a session-level
// advisory lock for the whole suite so chain-touching suites serialize.
const CHAIN_TEST_MUTEX_KEY = 792215002;
let chainMutexClient: Awaited<ReturnType<typeof pool.connect>> | null = null;

before(async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL must be set to run amendment tests");
  chainMutexClient = await pool.connect();
  await chainMutexClient.query("SELECT pg_advisory_lock($1)", [CHAIN_TEST_MUTEX_KEY]);
});

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  return (
    e?.code === "23505" ||
    e?.cause?.code === "23505" ||
    /duplicate key|unique constraint/i.test(e?.message ?? "")
  );
}

// Approve + apply a change request, minting its amendment block in the same
// transaction. Because the suite runs files in parallel against one dev DB and
// the `blocks` table has a UNIQUE block_number, a concurrent block from another
// suite can claim our computed number. The whole transaction rolls back on that
// duplicate, so we recompute the next number and retry a bounded number of times.
async function applyAmendmentWithBlock(
  changeRequestId: string,
  kyc: { id: string; companyName: string; registrationNumber: string },
  fields: Record<string, unknown>,
) {
  // The block number/hash are computed INSIDE the storage transaction under
  // the blockchain advisory lock, so concurrent block producers serialize and
  // the old recompute-and-retry loop is no longer needed.
  let mintedNumber = 0;
  const updated = await storage.approveAndApplyChangeRequest(changeRequestId, "approved in test", {
    genesisHash: GENESIS_HASH,
    dataId: kyc.id,
    dataSummary: `${kyc.companyName} | Amendment: contactEmail`,
    buildBlockFn: (previousHash, blockNumber) => {
      mintedNumber = blockNumber;
      const timestampIso = new Date().toISOString();
      const amendmentHash = generateKycAmendmentHash(
        kyc.companyName,
        kyc.registrationNumber,
        fields,
        timestampIso,
      );
      const { hash, nonce } = mineBlock(blockNumber, previousHash, timestampIso, amendmentHash);
      return { hash, nonce, timestamp: new Date(timestampIso) };
    },
  });
  mintedBlockNumbers.push(mintedNumber);
  return { updated, blockNumber: mintedNumber };
}

async function installBankFailureTrigger(sourceId: string) {
  await removeBankFailureTrigger();
  await pool.query(`
    CREATE FUNCTION ${BANK_FAILURE_FUNCTION}() RETURNS trigger AS $$
    BEGIN
      IF NEW.notes LIKE '%Source: ${sourceId}.%' THEN
        RAISE EXCEPTION 'forced KYC bank reconciliation failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await pool.query(`
    CREATE TRIGGER ${BANK_FAILURE_TRIGGER}
    BEFORE INSERT ON company_bank_accounts
    FOR EACH ROW EXECUTE FUNCTION ${BANK_FAILURE_FUNCTION}()
  `);
  bankFailureTriggerInstalled = true;
}

async function removeBankFailureTrigger() {
  if (!bankFailureTriggerInstalled) return;
  await pool.query(`DROP TRIGGER IF EXISTS ${BANK_FAILURE_TRIGGER} ON company_bank_accounts`);
  await pool.query(`DROP FUNCTION IF EXISTS ${BANK_FAILURE_FUNCTION}()`);
  bankFailureTriggerInstalled = false;
}

after(async () => {
  await removeBankFailureTrigger();
  for (const id of createdBankAccountIds) {
    await pool.query(`DELETE FROM company_bank_accounts WHERE id = $1`, [id]);
  }
  for (const sourceId of bankSourceIds) {
    await pool.query(`DELETE FROM company_bank_accounts WHERE notes LIKE $1`, [`%Source: ${sourceId}.%`]);
  }
  for (const blockNumber of mintedBlockNumbers) {
    await pool.query(`DELETE FROM blocks WHERE block_number = $1`, [blockNumber]);
  }
  for (const id of createdChangeRequestIds) {
    await pool.query(`DELETE FROM kyc_change_requests WHERE id = $1`, [id]);
  }
  for (const id of createdKycIds) {
    await pool.query(`DELETE FROM client_password_setup_tokens WHERE kyc_id = $1`, [id]);
    await storage.deleteKycApplication(id);
  }
  if (chainMutexClient) {
    await chainMutexClient.query("SELECT pg_advisory_unlock($1)", [CHAIN_TEST_MUTEX_KEY]);
    chainMutexClient.release();
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

test("full KYC amendment allowlist covers every applicant-submitted field", () => {
  const submittedFields = [
    "companyName", "registeredAddress", "primaryBusinessAddress",
    "dateOfIncorporation", "countryOfIncorporation", "countryOfOperation",
    "registrationNumber", "taxIdNumber", "businessType", "coreBusinessDescription",
    "ultimateBeneficialOwners", "shareholders", "managementStructure", "subsidiaries",
    "listingInfo", "shareCapital", "capitalRange", "financialCurrency", "salesRevenue",
    "netIncome", "totalEquity", "totalBalanceSheet", "lastReportingPeriod",
    "externalAuditors", "bankName", "bankBranch", "bankAddress", "accountName",
    "accountNumber", "swiftCode", "bankAccountCurrency", "bankOfficerName",
    "bankOfficerEmail", "additionalBanks", "employeesCompany", "employeesGroup",
    "previousBullfrogEmployee", "amlSubject", "amlConformityProgram", "amlRegulator",
    "amlLawName", "documentReasons", "contactName", "contactTitle", "contactPhone",
    "contactEmail", "faxNumber", "website", "signatoryName", "signatoryTitle",
    "signatoryCompany", "signatoryEmail", "signatoryPlaceDate", "filledByName",
    "filledByEmail",
  ];
  assert.deepEqual(
    submittedFields.filter((field) => !ALLOWED_KYC_CHANGE_FIELDS.has(field)),
    [],
  );
});

test("full KYC amendment validates and trims additional bank accounts", () => {
  const r = sanitizeKycChangeFields({
    additionalBanks: [{
      bankName: "  Second Bank  ",
      bankBranch: " Downtown ",
      bankAddress: " Dubai ",
      accountName: " Acme Ltd ",
      accountNumber: " 12345 ",
      swiftCode: " ABCDAEAD ",
      bankAccountCurrency: " USD ",
      bankOfficerName: " Jane Doe ",
      bankOfficerEmail: " banker@example.test ",
    }],
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.fields.additionalBanks[0].bankName, "Second Bank");
    assert.equal(r.fields.additionalBanks[0].bankOfficerEmail, "banker@example.test");
  }
});

test("full KYC amendment rejects malformed additional banks", () => {
  const malformed = sanitizeKycChangeFields({
    additionalBanks: [{ bankName: "Bank", unexpectedSecret: "nope" }],
  });
  assert.equal(malformed.ok, false);

  const badEmail = sanitizeKycChangeFields({
    additionalBanks: [{
      bankName: "Bank", bankBranch: "", bankAddress: "", accountName: "",
      accountNumber: "", swiftCode: "", bankAccountCurrency: "",
      bankOfficerName: "", bankOfficerEmail: "not-an-email",
    }],
  });
  assert.equal(badEmail.ok, false);
});

test("direct admin amendment rejects immutable, security and unknown fields", () => {
  for (const field of ["status", "clientPassword", "participantId", "amlStatus", "blockchainHash", "createdAt", "unknownField"]) {
    const r = sanitizeKycAdminAmendFields(
      { [field]: "tampered" },
      { status: "approved", clientUsername: "client.one" },
    );
    assert.equal(r.ok, false, `${field} must not be directly amendable`);
  }
});

test("direct admin amendment permits classification and a normalized allocated username", () => {
  const r = sanitizeKycAdminAmendFields(
    { category: "  Buyer  ", products: " Copper ", clientUsername: " Client.One " },
    { status: "approved", clientUsername: "old.username" },
  );
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.fields.category, "Buyer");
    assert.equal(r.fields.products, "Copper");
    assert.equal(r.fields.clientUsername, "client.one");
  }
});

test("direct admin amendment cannot allocate or change usernames outside an approved account", () => {
  const pending = sanitizeKycAdminAmendFields(
    { clientUsername: "client.one" },
    { status: "pending", clientUsername: null },
  );
  assert.equal(pending.ok, false);

  const approvedWithoutAccount = sanitizeKycAdminAmendFields(
    { clientUsername: "client.one" },
    { status: "approved", clientUsername: null },
  );
  assert.equal(approvedWithoutAccount.ok, false);
});

for (const startingStatus of ["pending", "rejected"] as const) {
  test(`direct identity amendment clears stale screening on a ${startingStatus} KYC`, async () => {
    const kyc = await storage.createKycApplication({
      companyName: `ZZSTALE-SCREEN-${startingStatus}-${RUN}`,
      registeredAddress: "1 Test Street",
      dateOfIncorporation: "2020-01-01",
      countryOfIncorporation: "AE",
      registrationNumber: `REG-STALE-${startingStatus}-${RUN}`,
      contactName: "Test Contact",
      contactTitle: "Director",
      contactPhone: "+971500000000",
      contactEmail: `stale-${startingStatus}@acme.test`,
      status: startingStatus,
      amlStatus: "manual_clear",
      amlMatches: [{ match: false }],
      amlCheckedAt: new Date(),
      amlCheckedBy: "prior-screen",
      amlNotes: "Prior screening result",
      ofacStatus: "clear",
      ofacMatches: [],
      unSanctionsStatus: "clear",
      unSanctionsMatches: [],
      pepStatus: "clear",
      pepMatches: [],
    } as any);
    createdKycIds.push(kyc.id);

    const result = await storage.applyDirectKycAdminAmendment(
      kyc.id,
      { companyName: `${kyc.companyName}-UPDATED` },
      `stale ${startingStatus} screening test`,
      {
        genesisHash: GENESIS_HASH,
        dataId: kyc.id,
        dataSummary: `${kyc.companyName} | Identity amendment`,
        buildBlockFn: () => {
          throw new Error("non-approved amendments must not mint");
        },
      },
      true,
    );

    assert.equal(result.updated.status, startingStatus);
    assert.equal(result.updated.amlStatus, "not_run");
    assert.equal(result.updated.amlMatches, null);
    assert.equal(result.updated.amlCheckedAt, null);
    assert.equal(result.updated.amlCheckedBy, null);
    assert.equal(result.updated.ofacStatus, "not_run");
    assert.equal(result.updated.unSanctionsStatus, "not_run");
    assert.equal(result.updated.pepStatus, "not_run");
    assert.equal(
      isKycApprovalScreeningComplete(result.updated.amlStatus),
      false,
      "the status endpoint's approval gate must reject stale screening",
    );

    const freshlyScreened = await storage.updateKycAmlScreening(kyc.id, {
      amlStatus: "clear",
      amlMatches: [],
      amlCheckedBy: "fresh-screen",
      ofacStatus: "clear",
      ofacMatches: [],
      unSanctionsStatus: "clear",
      unSanctionsMatches: [],
      pepStatus: "clear",
      pepMatches: [],
    });
    assert.equal(isKycApprovalScreeningComplete(freshlyScreened.amlStatus), true);

    const audits = await storage.getKycChangeRequestsByApplicationId(kyc.id);
    for (const audit of audits) {
      if (audit.reason === `stale ${startingStatus} screening test`) {
        createdChangeRequestIds.push(audit.id);
      }
    }
  });
}

test("direct identity amendment is audited, minted, and returned to screening", async () => {
  const kyc = await storage.createKycApplication({
    companyName: `ZZDIRECT-${RUN}`,
    registeredAddress: "1 Test Street",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "AE",
    registrationNumber: `REG-DIRECT-${RUN}`,
    contactName: "Test Contact",
    contactTitle: "Director",
    contactPhone: "+971500000000",
    contactEmail: "direct@acme.test",
    status: "approved",
    amlStatus: "clear",
    ofacStatus: "clear",
    unSanctionsStatus: "clear",
    pepStatus: "clear",
    blockchainHash: `base-${RUN}`,
    blockNumber: 99,
  } as any);
  createdKycIds.push(kyc.id);

  let mintedNumber = 0;
  const result = await storage.applyDirectKycAdminAmendment(
    kyc.id,
    { companyName: `ZZDIRECT-UPDATED-${RUN}` },
    "Direct admin amendment in test",
    {
      genesisHash: GENESIS_HASH,
      dataId: kyc.id,
      dataSummary: `${kyc.companyName} | Admin amendment: company name`,
      buildBlockFn: (previousHash, blockNumber) => {
        mintedNumber = blockNumber;
        const timestampIso = new Date().toISOString();
        const amendmentHash = generateKycAmendmentHash(
          kyc.companyName,
          kyc.registrationNumber,
          { companyName: `ZZDIRECT-UPDATED-${RUN}` },
          timestampIso,
        );
        const { hash, nonce } = mineBlock(blockNumber, previousHash, timestampIso, amendmentHash);
        return { hash, nonce, timestamp: new Date(timestampIso) };
      },
    },
    true,
  );
  mintedBlockNumbers.push(mintedNumber);

  assert.equal(result.reapprovalRequired, true);
  assert.equal(result.updated.status, "pending");
  assert.equal(result.updated.amlStatus, "not_run");
  assert.equal(result.updated.ofacStatus, "not_run");
  assert.equal(result.updated.unSanctionsStatus, "not_run");
  assert.equal(result.updated.pepStatus, "not_run");
  assert.equal(result.updated.blockchainHash, `base-${RUN}`, "prior approval proof must not be rewritten");

  const requests = await storage.getKycChangeRequestsByApplicationId(kyc.id);
  const directAudit = requests.find((request) => request.reason === "Direct admin amendment in test");
  assert.ok(directAudit);
  assert.equal(directAudit!.status, "approved");
  createdChangeRequestIds.push(directAudit!.id);
});

test("direct non-identity amendment stays approved and is still audited and minted", async () => {
  const kyc = await storage.createKycApplication({
    companyName: `ZZDIRECT-BANK-${RUN}`,
    registeredAddress: "1 Test Street",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "AE",
    registrationNumber: `REG-DIRECT-BANK-${RUN}`,
    contactName: "Test Contact",
    contactTitle: "Director",
    contactPhone: "+971500000000",
    contactEmail: "direct-bank@acme.test",
    status: "approved",
    amlStatus: "clear",
    blockchainHash: `base-bank-${RUN}`,
    blockNumber: 100,
  } as any);
  createdKycIds.push(kyc.id);

  let mintedNumber = 0;
  const result = await storage.applyDirectKycAdminAmendment(
    kyc.id,
    { bankName: "Replacement Bank" },
    "Direct bank amendment in test",
    {
      genesisHash: GENESIS_HASH,
      dataId: kyc.id,
      dataSummary: `${kyc.companyName} | Admin amendment: bank name`,
      buildBlockFn: (previousHash, blockNumber) => {
        mintedNumber = blockNumber;
        const timestampIso = new Date().toISOString();
        const amendmentHash = generateKycAmendmentHash(
          kyc.companyName,
          kyc.registrationNumber,
          { bankName: "Replacement Bank" },
          timestampIso,
        );
        const { hash, nonce } = mineBlock(blockNumber, previousHash, timestampIso, amendmentHash);
        return { hash, nonce, timestamp: new Date(timestampIso) };
      },
    },
    false,
  );
  mintedBlockNumbers.push(mintedNumber);

  assert.equal(result.reapprovalRequired, false);
  assert.equal(result.updated.status, "approved");
  assert.equal(result.updated.bankName, "Replacement Bank");

  const requests = await storage.getKycChangeRequestsByApplicationId(kyc.id);
  const directAudit = requests.find((request) => request.reason === "Direct bank amendment in test");
  assert.ok(directAudit);
  createdChangeRequestIds.push(directAudit!.id);
});

test("row-locked direct amendment rejects a stale username edit after status changed", async () => {
  const kyc = await storage.createKycApplication({
    companyName: `ZZUSERNAME-RACE-${RUN}`,
    registeredAddress: "1 Test Street",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "AE",
    registrationNumber: `REG-USERNAME-RACE-${RUN}`,
    contactName: "Test Contact",
    contactTitle: "Director",
    contactPhone: "+971500000000",
    contactEmail: "username-race@acme.test",
    clientUsername: `old.${RUN}`,
    status: "pending",
  } as any);
  createdKycIds.push(kyc.id);

  await assert.rejects(
    storage.applyDirectKycAdminAmendment(
      kyc.id,
      { clientUsername: `new.${RUN}` },
      "Stale username amendment",
      {
        genesisHash: GENESIS_HASH,
        dataId: kyc.id,
        dataSummary: `${kyc.companyName} | Admin amendment: client username`,
        buildBlockFn: () => {
          throw new Error("must not mint");
        },
      },
      false,
    ),
    /Portal username state changed/,
  );
  const reread = await storage.getKycApplicationById(kyc.id);
  assert.equal(reread!.clientUsername, `old.${RUN}`);
  assert.equal((await storage.getKycChangeRequestsByApplicationId(kyc.id)).length, 0);
});

test("a client password setup/reset token can be consumed exactly once", async () => {
  const kyc = await storage.createKycApplication({
    companyName: `ZZRESET-${RUN}`,
    registeredAddress: "1 Test Street",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "AE",
    registrationNumber: `REG-RESET-${RUN}`,
    contactName: "Test Contact",
    contactTitle: "Director",
    contactPhone: "+971500000000",
    contactEmail: "reset@acme.test",
    clientUsername: `reset.${RUN}`,
    status: "approved",
  } as any);
  createdKycIds.push(kyc.id);
  const token = `reset-token-${RUN}`;
  await storage.createClientPasswordSetupToken(kyc.id, token, new Date(Date.now() + 60_000));

  const outcomes = await Promise.all([
    storage.consumeClientPasswordSetupToken(token, "hash-one"),
    storage.consumeClientPasswordSetupToken(token, "hash-two"),
  ]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  const winner = outcomes.find(Boolean)!;
  const reread = await storage.getKycApplicationById(kyc.id);
  assert.equal(reread!.clientPassword, winner.clientPassword);
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
  // the amendment block in the SAME transaction as the field update so the two
  // can never diverge.
  //
  // The `blocks` table is an append-only chain with a UNIQUE block_number. The
  // full test suite runs files in parallel (`tsx --test` glob), and sibling
  // suites (e.g. deal-pipeline) also mint blocks against this same dev DB, so a
  // naive `latest + 1` can collide. Because the whole transaction rolls back on
  // a duplicate block_number, we simply recompute the next number and retry.
  const { updated, blockNumber } = await applyAmendmentWithBlock(
    changeReq.id,
    kyc,
    sanitized.fields,
  );

  // The amendment and its block are persisted together: the block now exists.
  const mintedBlock = await pool.query(
    `SELECT block_number FROM blocks WHERE block_number = $1`,
    [blockNumber],
  );
  assert.equal(mintedBlock.rowCount, 1, "amendment block must be persisted with the change");

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

// ─── Atomicity: a failing block mint rolls back the field change too ───

test("a failed block mint rolls back the whole amendment (no partial state)", async () => {
  const kyc = await storage.createKycApplication({
    companyName: `ZZROLLBACK-${RUN}`,
    registeredAddress: "1 Test Street",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "AE",
    registrationNumber: `REGRB-${RUN}`,
    contactName: "Test Contact",
    contactTitle: "Director",
    contactPhone: "+971500000000",
    contactEmail: "before@acme.test",
    status: "approved",
  } as any);
  createdKycIds.push(kyc.id);

  const sanitized = sanitizeKycChangeFields({ contactEmail: "after@acme.test" });
  assert.equal(sanitized.ok, true);
  if (!sanitized.ok) return;

  const changeReq = await storage.createKycChangeRequest({
    kycApplicationId: kyc.id,
    changedFields: sanitized.fields,
    reason: "rollback test",
  });
  createdChangeRequestIds.push(changeReq.id);

  // Force the in-transaction block mint to fail: the block builder (which now
  // runs INSIDE the storage transaction, under the blockchain advisory lock)
  // throws after the KYC field update has already been issued. The whole
  // transaction — including the field update and change-request status — must
  // roll back, leaving the record exactly as it was.
  await assert.rejects(
    storage.approveAndApplyChangeRequest(changeReq.id, "should roll back", {
      genesisHash: GENESIS_HASH,
      dataId: kyc.id,
      dataSummary: `${kyc.companyName} | Amendment: contactEmail`,
      buildBlockFn: () => {
        throw new Error(`forced mint failure rollback-hash-${RUN}`);
      },
    }),
    "a failing block mint must abort the transaction",
  );

  // Nothing was applied: the email is unchanged and the change request is still
  // pending (not stuck in a half-approved state).
  const reread = await storage.getKycApplicationById(kyc.id);
  assert.equal(reread!.contactEmail, "before@acme.test", "field change must be rolled back");

  const reqs = await storage.getKycChangeRequestsByApplicationId(kyc.id);
  const stillPending = reqs.find(c => c.id === changeReq.id);
  assert.ok(stillPending, "change request should still exist");
  assert.equal(stillPending!.status, "pending", "change request must remain pending after rollback");

  // No block with the specific hash from the rolled-back attempt survived.
  // We check by hash rather than global latest block_number because other
  // test files run in parallel and may legitimately insert new blocks between
  // our snapshot and this recheck.
  const orphanCheck = await pool.query(
    `SELECT 1 FROM blocks WHERE hash = $1`,
    [`rollback-hash-${RUN}`],
  );
  assert.equal(orphanCheck.rowCount, 0, "no orphan block may be left behind");
});

test("KYC bank reconciliation rolls back a partial replacement and can be retried", async () => {
  const sourceId = `bank-source-${RUN}`;
  const sameNameSourceId = `same-name-source-${RUN}`;
  bankSourceIds.push(sourceId, sameNameSourceId);
  const companyName = `ZZBANK-ATOMIC-${RUN}`;
  const notesFor = (id: string) => `From approved KYC. Source: ${id}.`;

  await storage.createCompanyBankAccount({
    companyName,
    bankName: "Old Primary Bank",
    accountNumber: "OLD-PRIMARY",
    notes: notesFor(sourceId),
  });
  await storage.createCompanyBankAccount({
    companyName,
    bankName: "Old Additional Bank",
    accountNumber: "OLD-ADDITIONAL",
    notes: notesFor(sourceId),
  });
  await storage.createCompanyBankAccount({
    companyName,
    bankName: "Other Company's Bank",
    accountNumber: "OTHER-SOURCE",
    notes: notesFor(sameNameSourceId),
  });

  await assert.rejects(
    storage.reconcileKycCompanyBankAccounts(sourceId, [companyName], [
      {
        companyName,
        bankName: "New Primary Bank",
        accountNumber: "NEW-PRIMARY",
        notes: notesFor(sourceId),
      },
      {
        companyName,
        bankName: null as any,
        accountNumber: "FORCED-FAILURE",
        notes: notesFor(sourceId),
      },
    ]),
  );

  const afterFailure = await storage.getCompanyBankAccounts();
  const sourceAccountsAfterFailure = afterFailure.filter((account) =>
    (account.notes || "").includes(`Source: ${sourceId}.`),
  );
  assert.deepEqual(
    sourceAccountsAfterFailure.map((account) => account.accountNumber).sort(),
    ["OLD-ADDITIONAL", "OLD-PRIMARY"],
    "the old complete set must survive a failure after replacement starts",
  );
  assert.ok(
    afterFailure.some((account) => (account.notes || "").includes(`Source: ${sameNameSourceId}.`)),
    "a same-named company with another KYC source must remain isolated",
  );

  await storage.reconcileKycCompanyBankAccounts(sourceId, [companyName], [
    {
      companyName,
      bankName: "New Primary Bank",
      accountNumber: "NEW-PRIMARY",
      notes: notesFor(sourceId),
    },
    {
      companyName,
      bankName: "New Additional Bank",
      accountNumber: "NEW-ADDITIONAL",
      notes: notesFor(sourceId),
    },
  ]);

  const afterRetry = await storage.getCompanyBankAccounts();
  const sourceAccountsAfterRetry = afterRetry.filter((account) =>
    (account.notes || "").includes(`Source: ${sourceId}.`),
  );
  assert.deepEqual(
    sourceAccountsAfterRetry.map((account) => account.accountNumber).sort(),
    ["NEW-ADDITIONAL", "NEW-PRIMARY"],
  );
  assert.ok(
    afterRetry.some((account) => (account.notes || "").includes(`Source: ${sameNameSourceId}.`)),
    "retry must not touch the other same-named KYC source",
  );
});

test("legacy bank rows for same-named KYC records are claimed only by an unambiguous owner", async () => {
  const companyName = `ZZBANK-LEGACY-SHARED-${RUN}`;
  const first = await storage.createKycApplication({
    companyName,
    registeredAddress: "1 Test Street",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "AE",
    registrationNumber: `REG-LEGACY-FIRST-${RUN}`,
    contactName: "First Contact",
    contactTitle: "Director",
    contactPhone: "+971500000001",
    contactEmail: "legacy-first@acme.test",
    bankName: "First Legacy Bank",
    accountNumber: "FIRST-OLD",
    status: "approved",
    blockchainHash: `legacy-first-${RUN}`,
    blockNumber: 102,
  } as any);
  const second = await storage.createKycApplication({
    companyName,
    registeredAddress: "2 Test Street",
    dateOfIncorporation: "2020-01-02",
    countryOfIncorporation: "AE",
    registrationNumber: `REG-LEGACY-SECOND-${RUN}`,
    contactName: "Second Contact",
    contactTitle: "Director",
    contactPhone: "+971500000002",
    contactEmail: "legacy-second@acme.test",
    bankName: "Second Legacy Bank",
    accountNumber: "SECOND-KEEP",
    status: "approved",
    blockchainHash: `legacy-second-${RUN}`,
    blockNumber: 103,
  } as any);
  createdKycIds.push(first.id, second.id);
  bankSourceIds.push(first.id);
  const firstLegacy = await storage.createCompanyBankAccount({
    companyName,
    bankName: "First Legacy Bank",
    accountNumber: "FIRST-OLD",
    notes: "From approved KYC.",
  });
  const secondLegacy = await storage.createCompanyBankAccount({
    companyName,
    bankName: "Second Legacy Bank",
    accountNumber: "SECOND-KEEP",
    notes: "From approved KYC.",
  });
  createdBankAccountIds.push(firstLegacy.id, secondLegacy.id);

  let mintedNumber = 0;
  const result = await storage.applyDirectKycAdminAmendment(
    first.id,
    { bankName: "First Replacement Bank", accountNumber: "FIRST-NEW" },
    "same-name legacy ownership test",
    {
      genesisHash: GENESIS_HASH,
      dataId: first.id,
      dataSummary: `${companyName} | Bank amendment`,
      buildBlockFn: (previousHash, blockNumber) => {
        mintedNumber = blockNumber;
        const timestampIso = new Date().toISOString();
        const amendmentHash = generateKycAmendmentHash(
          first.companyName,
          first.registrationNumber,
          { bankName: "First Replacement Bank", accountNumber: "FIRST-NEW" },
          timestampIso,
        );
        const { hash, nonce } = mineBlock(blockNumber, previousHash, timestampIso, amendmentHash);
        return { hash, nonce, timestamp: new Date(timestampIso) };
      },
    },
    false,
  );
  mintedBlockNumbers.push(mintedNumber);
  assert.equal(result.updated.accountNumber, "FIRST-NEW");

  const registry = await storage.getCompanyBankAccounts();
  assert.equal(
    registry.some((account) => account.id === firstLegacy.id),
    false,
    "the uniquely matched legacy row for the amended KYC should be replaced",
  );
  assert.equal(
    registry.some((account) => account.id === secondLegacy.id),
    true,
    "the other same-named KYC's legacy bank row must be preserved",
  );
  assert.ok(
    registry.some((account) =>
      (account.notes || "").includes(`Source: ${first.id}.`) &&
      account.accountNumber === "FIRST-NEW",
    ),
  );

  const audits = await storage.getKycChangeRequestsByApplicationId(first.id);
  for (const audit of audits) {
    if (audit.reason === "same-name legacy ownership test") createdChangeRequestIds.push(audit.id);
  }
});

test("change-request bank amendments roll back with reconciliation and retry cleanly", async () => {
  const kyc = await storage.createKycApplication({
    companyName: `ZZBANK-CHANGE-${RUN}`,
    registeredAddress: "1 Test Street",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "AE",
    registrationNumber: `REG-BANK-CHANGE-${RUN}`,
    contactName: "Test Contact",
    contactTitle: "Director",
    contactPhone: "+971500000000",
    contactEmail: "bank-change@acme.test",
    bankName: "Old Primary Bank",
    accountNumber: "OLD-PRIMARY",
    additionalBanks: [{ bankName: "Old Additional Bank", accountNumber: "OLD-ADDITIONAL" }],
    status: "approved",
  } as any);
  createdKycIds.push(kyc.id);
  bankSourceIds.push(kyc.id);
  const notes = `From approved KYC. Source: ${kyc.id}.`;
  await storage.createCompanyBankAccount({
    companyName: kyc.companyName,
    bankName: "Old Primary Bank",
    accountNumber: "OLD-PRIMARY",
    notes,
  });
  await storage.createCompanyBankAccount({
    companyName: kyc.companyName,
    bankName: "Old Additional Bank",
    accountNumber: "OLD-ADDITIONAL",
    notes,
  });
  const changeReq = await storage.createKycChangeRequest({
    kycApplicationId: kyc.id,
    changedFields: {
      bankName: "New Primary Bank",
      accountNumber: "NEW-PRIMARY",
      additionalBanks: [{ bankName: "New Additional Bank", accountNumber: "NEW-ADDITIONAL" }],
    },
    reason: "bank reconciliation rollback test",
  });
  createdChangeRequestIds.push(changeReq.id);

  await installBankFailureTrigger(kyc.id);
  try {
    await assert.rejects(
      applyAmendmentWithBlock(changeReq.id, kyc, changeReq.changedFields as Record<string, unknown>),
      (error: any) => {
        assert.match(error?.cause?.message || "", /forced KYC bank reconciliation failure/);
        return true;
      },
    );
  } finally {
    await removeBankFailureTrigger();
  }

  const afterFailure = await storage.getKycApplicationById(kyc.id);
  assert.equal(afterFailure!.bankName, "Old Primary Bank");
  const pending = await storage.getKycChangeRequestsByApplicationId(kyc.id);
  assert.equal(pending.find((request) => request.id === changeReq.id)!.status, "pending");
  const oldRegistry = (await storage.getCompanyBankAccounts())
    .filter((account) => (account.notes || "").includes(`Source: ${kyc.id}.`))
    .map((account) => account.accountNumber)
    .sort();
  assert.deepEqual(oldRegistry, ["OLD-ADDITIONAL", "OLD-PRIMARY"]);

  const { updated } = await applyAmendmentWithBlock(
    changeReq.id,
    kyc,
    changeReq.changedFields as Record<string, unknown>,
  );
  assert.equal(updated.bankName, "New Primary Bank");
  const newRegistry = (await storage.getCompanyBankAccounts())
    .filter((account) => (account.notes || "").includes(`Source: ${kyc.id}.`))
    .map((account) => account.accountNumber)
    .sort();
  assert.deepEqual(newRegistry, ["NEW-ADDITIONAL", "NEW-PRIMARY"]);
});

test("direct-admin bank amendments roll back with reconciliation and retry cleanly", async () => {
  const kyc = await storage.createKycApplication({
    companyName: `ZZBANK-DIRECT-${RUN}`,
    registeredAddress: "1 Test Street",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "AE",
    registrationNumber: `REG-BANK-DIRECT-${RUN}`,
    contactName: "Test Contact",
    contactTitle: "Director",
    contactPhone: "+971500000000",
    contactEmail: "bank-direct@acme.test",
    bankName: "Old Direct Bank",
    accountNumber: "OLD-DIRECT",
    status: "approved",
    blockchainHash: `base-direct-reconcile-${RUN}`,
    blockNumber: 101,
  } as any);
  createdKycIds.push(kyc.id);
  bankSourceIds.push(kyc.id);
  const notes = `From approved KYC. Source: ${kyc.id}.`;
  await storage.createCompanyBankAccount({
    companyName: kyc.companyName,
    bankName: "Old Direct Bank",
    accountNumber: "OLD-DIRECT",
    notes,
  });
  const fields = { bankName: "New Direct Bank", accountNumber: "NEW-DIRECT" };
  let successfulBlockNumber = 0;
  const mintSpec = {
    genesisHash: GENESIS_HASH,
    dataId: kyc.id,
    dataSummary: `${kyc.companyName} | Admin bank amendment`,
    buildBlockFn: (previousHash: string, blockNumber: number) => {
      successfulBlockNumber = blockNumber;
      const timestampIso = new Date().toISOString();
      const amendmentHash = generateKycAmendmentHash(
        kyc.companyName,
        kyc.registrationNumber,
        fields,
        timestampIso,
      );
      const { hash, nonce } = mineBlock(blockNumber, previousHash, timestampIso, amendmentHash);
      return { hash, nonce, timestamp: new Date(timestampIso) };
    },
  };

  await installBankFailureTrigger(kyc.id);
  try {
    await assert.rejects(
      storage.applyDirectKycAdminAmendment(
        kyc.id,
        fields,
        "direct bank reconciliation rollback test",
        mintSpec,
        false,
      ),
      (error: any) => {
        assert.match(error?.cause?.message || "", /forced KYC bank reconciliation failure/);
        return true;
      },
    );
  } finally {
    await removeBankFailureTrigger();
  }

  const afterFailure = await storage.getKycApplicationById(kyc.id);
  assert.equal(afterFailure!.bankName, "Old Direct Bank");
  assert.deepEqual(
    (await storage.getCompanyBankAccounts())
      .filter((account) => (account.notes || "").includes(`Source: ${kyc.id}.`))
      .map((account) => account.accountNumber),
    ["OLD-DIRECT"],
  );

  const result = await storage.applyDirectKycAdminAmendment(
    kyc.id,
    fields,
    "direct bank reconciliation retry test",
    mintSpec,
    false,
  );
  mintedBlockNumbers.push(successfulBlockNumber);
  assert.equal(result.updated.bankName, "New Direct Bank");
  assert.deepEqual(
    (await storage.getCompanyBankAccounts())
      .filter((account) => (account.notes || "").includes(`Source: ${kyc.id}.`))
      .map((account) => account.accountNumber),
    ["NEW-DIRECT"],
  );
  const audits = await storage.getKycChangeRequestsByApplicationId(kyc.id);
  for (const audit of audits) {
    if (audit.reason.includes("bank reconciliation")) createdChangeRequestIds.push(audit.id);
  }
});

test("an identity amendment returning KYC to pending removes sourced bank instructions atomically", async () => {
  const kyc = await storage.createKycApplication({
    companyName: `ZZBANK-PENDING-${RUN}`,
    registeredAddress: "1 Test Street",
    dateOfIncorporation: "2020-01-01",
    countryOfIncorporation: "AE",
    registrationNumber: `REG-BANK-PENDING-${RUN}`,
    contactName: "Test Contact",
    contactTitle: "Director",
    contactPhone: "+971500000000",
    contactEmail: "bank-pending@acme.test",
    bankName: "Pending Bank",
    accountNumber: "PENDING-OLD",
    status: "approved",
  } as any);
  createdKycIds.push(kyc.id);
  bankSourceIds.push(kyc.id);
  await storage.createCompanyBankAccount({
    companyName: kyc.companyName,
    bankName: "Pending Bank",
    accountNumber: "PENDING-OLD",
    notes: `From approved KYC. Source: ${kyc.id}.`,
  });
  const changeReq = await storage.createKycChangeRequest({
    kycApplicationId: kyc.id,
    changedFields: { companyName: `${kyc.companyName}-UPDATED` },
    reason: "identity bank removal test",
  });
  createdChangeRequestIds.push(changeReq.id);

  let mintedNumber = 0;
  const updated = await storage.approveAndApplyChangeRequest(
    changeReq.id,
    "identity amendment",
    {
      genesisHash: GENESIS_HASH,
      dataId: kyc.id,
      dataSummary: `${kyc.companyName} | Identity amendment`,
      buildBlockFn: (previousHash, blockNumber) => {
        mintedNumber = blockNumber;
        const timestampIso = new Date().toISOString();
        const amendmentHash = generateKycAmendmentHash(
          kyc.companyName,
          kyc.registrationNumber,
          changeReq.changedFields as Record<string, unknown>,
          timestampIso,
        );
        const { hash, nonce } = mineBlock(blockNumber, previousHash, timestampIso, amendmentHash);
        return { hash, nonce, timestamp: new Date(timestampIso) };
      },
    },
    true,
  );
  mintedBlockNumbers.push(mintedNumber);

  assert.equal(updated.status, "pending");
  assert.equal(
    (await storage.getCompanyBankAccounts()).some((account) =>
      (account.notes || "").includes(`Source: ${kyc.id}.`),
    ),
    false,
  );
});
