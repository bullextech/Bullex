import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "node:http";
import bcrypt from "bcryptjs";
import type { Block } from "@shared/schema";
import { mineBlock, GENESIS_HASH } from "../blockchain";
import { pool } from "../storage";
import { projectBlocksForBlockchainViewer, registerRoutes } from "../routes";

const makeBlock = (overrides: Partial<Block>): Block => ({
  id: "block-id",
  blockNumber: 1,
  hash: "block-hash",
  previousHash: "previous-hash",
  timestamp: new Date("2026-08-19T00:00:00.000Z"),
  nonce: 7,
  tradeCount: 1,
  verified: true,
  dataType: "trade",
  dataId: null,
  dataSummary: null,
  ...overrides,
});

const emptyScope = {
  tradeBlockNumbers: new Set<number>(),
  kycIds: new Set<string>(),
  enquiryIds: new Set<string>(),
};

test("team blockchain projection redacts another team's record metadata but preserves proof", () => {
  const source = makeBlock({
    dataType: "kyc_amendment",
    dataId: "other-kyc",
    dataSummary: "Other Company | Amendment: bank details",
  });
  const [projected] = projectBlocksForBlockchainViewer([source], emptyScope);

  assert.equal(projected.dataId, null);
  assert.equal(projected.dataSummary, null);
  assert.equal(projected.hash, source.hash);
  assert.equal(projected.previousHash, source.previousHash);
  assert.equal(projected.blockNumber, source.blockNumber);
  assert.equal(projected.nonce, source.nonce);
  assert.equal(projected.timestamp, source.timestamp);
  assert.equal(projected.verified, source.verified);
});

test("team blockchain projection retains metadata only for visible records", () => {
  const visibleTrade = makeBlock({
    id: "trade-block",
    blockNumber: 4,
    dataType: "trade",
    dataSummary: "Visible trade",
  });
  const visibleKyc = makeBlock({
    id: "kyc-block",
    blockNumber: 5,
    dataType: "kyc",
    dataId: "visible-kyc",
    dataSummary: "Visible Company",
  });
  const visibleEnquiry = makeBlock({
    id: "enquiry-block",
    blockNumber: 6,
    dataType: "enquiry_amendment",
    dataId: "visible-enquiry",
    dataSummary: "VISIBLE-ENQ | Amendment: quantity",
  });
  const projected = projectBlocksForBlockchainViewer(
    [visibleTrade, visibleKyc, visibleEnquiry],
    {
      tradeBlockNumbers: new Set([4]),
      kycIds: new Set(["visible-kyc"]),
      enquiryIds: new Set(["visible-enquiry"]),
    },
  );

  assert.deepEqual(projected, [visibleTrade, visibleKyc, visibleEnquiry]);
});

test("admin blockchain projection remains unrestricted", () => {
  const source = makeBlock({
    dataType: "kyc",
    dataId: "any-kyc",
    dataSummary: "Any Company",
  });
  assert.equal(projectBlocksForBlockchainViewer([source], null)[0], source);
});

type JsonObject = Record<string, any>;

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const OWNER_USERNAME = `block-owner-${RUN}`;
const VIEWER_USERNAME = `block-viewer-${RUN}`;
const TEAM_PASSWORD = `route-test-${RUN}`;
const OWNER_KYC_SUMMARY = `OWNER-KYC-${RUN} | Amendment: bank details`;
const OWNER_ENQUIRY_SUMMARY = `OWNER-ENQUIRY-${RUN} | Amendment: quantity`;
const VIEWER_KYC_SUMMARY = `VIEWER-KYC-${RUN} | Amendment: address`;
const VIEWER_ENQUIRY_SUMMARY = `VIEWER-ENQUIRY-${RUN} | Amendment: loading port`;
const BLOCKCHAIN_TEST_MUTEX_KEY = 792215002;
const BLOCKCHAIN_WRITER_LOCK_KEY = 792215001;

let httpServer: Server;
let baseUrl = "";
let ownerMemberId = "";
let viewerMemberId = "";
let ownerKycId = "";
let viewerKycId = "";
let ownerEnquiryId = "";
let viewerEnquiryId = "";
let ownerTradeId = "";
let viewerTradeId = "";
let ownerTradeRef = "";
let viewerTradeRef = "";
let ownerDealId = "";
let viewerDealId = "";
let ownerDealRef = "";
let viewerDealRef = "";
let ownerParentId = "";
let viewerParentId = "";
let testBlockIds: string[] = [];
let ownerBlockIds: string[] = [];
let viewerBlockIds: string[] = [];
let insertedBlocks = new Map<string, JsonObject>();
let chainMutexClient: Awaited<ReturnType<typeof pool.connect>> | null = null;
const testSessionIds: string[] = [];
const originalAdminUsername = process.env.ADMIN_USERNAME;

async function insertBlock(
  blockNumber: number,
  previousHash: string,
  dataType: string,
  dataId: string | null,
  dataSummary: string,
): Promise<{ id: string; hash: string }> {
  const timestamp = new Date(Date.now() + blockNumber).toISOString();
  const mined = mineBlock(
    blockNumber,
    previousHash,
    timestamp,
    `${dataType}:${dataId ?? ""}:${dataSummary}`,
  );
  const { rows } = await pool.query(
    `INSERT INTO blocks (
       block_number, hash, previous_hash, timestamp, nonce, trade_count,
       verified, data_type, data_id, data_summary
     ) VALUES ($1, $2, $3, $4, $5, 1, true, $6, $7, $8)
     RETURNING id, block_number, hash, previous_hash, timestamp, nonce,
               trade_count, verified, data_type, data_id, data_summary`,
    [blockNumber, mined.hash, previousHash, timestamp, mined.nonce, dataType, dataId, dataSummary],
  );
  const row = rows[0];
  testBlockIds.push(row.id);
  insertedBlocks.set(row.id, row);
  return { id: row.id, hash: row.hash };
}

async function login(username: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-proto": "https",
    },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200, `login failed for ${username}`);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, `login did not issue a session cookie for ${username}`);
  const cookie = setCookie.split(";", 1)[0];
  const encodedValue = cookie.slice(cookie.indexOf("=") + 1);
  const signedValue = decodeURIComponent(encodedValue);
  assert.ok(signedValue.startsWith("s:"), "session cookie was not signed");
  testSessionIds.push(signedValue.slice(2).split(".", 1)[0]);
  return cookie;
}

async function getJson(path: string, cookie: string): Promise<JsonObject> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      cookie,
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(response.status, 200, `${path} returned ${response.status}`);
  return await response.json() as JsonObject;
}

function allDealBlocks(groups: JsonObject[]): JsonObject[] {
  return groups.flatMap((group) => group.dealBlocks ?? []);
}

before(async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL must be set to run blockchain route tests");
  assert.ok(process.env.ADMIN_PASSWORD, "ADMIN_PASSWORD must be set to run admin route checks");
  process.env.ADMIN_USERNAME ||= `block-admin-${RUN}`;

  chainMutexClient = await pool.connect();
  await chainMutexClient.query("SELECT pg_advisory_lock($1)", [BLOCKCHAIN_TEST_MUTEX_KEY]);
  await chainMutexClient.query("SELECT pg_advisory_lock($1)", [BLOCKCHAIN_WRITER_LOCK_KEY]);

  const passwordHash = await bcrypt.hash(TEAM_PASSWORD, 4);
  const members = await pool.query(
    `INSERT INTO team_members (username, password, name, allowed_modules)
     VALUES
       ($1, $3, $4, ARRAY['blockchain']::text[]),
       ($2, $3, $5, ARRAY['blockchain', 'kyc-admin']::text[])
     RETURNING id, username`,
    [
      OWNER_USERNAME,
      VIEWER_USERNAME,
      passwordHash,
      `Blockchain Owner ${RUN}`,
      `Blockchain Viewer ${RUN}`,
    ],
  );
  ownerMemberId = members.rows.find((row) => row.username === OWNER_USERNAME).id;
  viewerMemberId = members.rows.find((row) => row.username === VIEWER_USERNAME).id;

  const kycs = await pool.query(
    `INSERT INTO kyc_applications (
       company_name, registered_address, date_of_incorporation,
       country_of_incorporation, registration_number, contact_name,
       contact_title, contact_phone, contact_email, status, category,
       products, submitted_by_team_member_id
     ) VALUES
       ($1, 'Owner address', '2020-01-01', 'Zambia', $2, 'Owner Contact',
        'Director', '+2600000001', $3, 'approved', 'Supplier', 'Copper', $4),
       ($5, 'Viewer address', '2021-01-01', 'Kenya', $6, 'Viewer Contact',
        'Director', '+2540000002', $7, 'approved', 'Buyer', 'Gold', $8)
     RETURNING id, submitted_by_team_member_id`,
    [
      `Owner Company ${RUN}`,
      `OWNER-REG-${RUN}`,
      `owner-${RUN}@example.test`,
      ownerMemberId,
      `Viewer Company ${RUN}`,
      `VIEWER-REG-${RUN}`,
      `viewer-${RUN}@example.test`,
      viewerMemberId,
    ],
  );
  ownerKycId = kycs.rows.find((row) => row.submitted_by_team_member_id === ownerMemberId).id;
  viewerKycId = kycs.rows.find((row) => row.submitted_by_team_member_id === viewerMemberId).id;

  const enquiries = await pool.query(
    `INSERT INTO trade_enquiries (
       enquiry_ref, side, product, quantity, unit, created_by,
       submitted_by_team_member_id
     ) VALUES
       ($1, 'sell', $2, '100', 'MT', $3, $4),
       ($5, 'buy', $6, '200', 'MT', $7, $8)
     RETURNING id, submitted_by_team_member_id`,
    [
      `OWNER-ENQ-${RUN}`,
      `Owner Copper ${RUN}`,
      `Owner Enquirer ${RUN}`,
      ownerMemberId,
      `VIEWER-ENQ-${RUN}`,
      `Viewer Gold ${RUN}`,
      `Viewer Enquirer ${RUN}`,
      viewerMemberId,
    ],
  );
  ownerEnquiryId = enquiries.rows.find((row) => row.submitted_by_team_member_id === ownerMemberId).id;
  viewerEnquiryId = enquiries.rows.find((row) => row.submitted_by_team_member_id === viewerMemberId).id;

  const latest = await pool.query(
    "SELECT block_number, hash FROM blocks ORDER BY block_number DESC LIMIT 1",
  );
  let blockNumber = Number(latest.rows[0]?.block_number ?? 0);
  let previousHash = latest.rows[0]?.hash ?? GENESIS_HASH;

  const ownerTradeBlock = await insertBlock(
    ++blockNumber,
    previousHash,
    "trade",
    null,
    `Owner grouped deal ${RUN}`,
  );
  previousHash = ownerTradeBlock.hash;
  ownerBlockIds.push(ownerTradeBlock.id);
  const ownerKycBlock = await insertBlock(
    ++blockNumber,
    previousHash,
    "kyc_amendment",
    ownerKycId,
    OWNER_KYC_SUMMARY,
  );
  previousHash = ownerKycBlock.hash;
  ownerBlockIds.push(ownerKycBlock.id);
  const ownerEnquiryBlock = await insertBlock(
    ++blockNumber,
    previousHash,
    "enquiry_amendment",
    ownerEnquiryId,
    OWNER_ENQUIRY_SUMMARY,
  );
  previousHash = ownerEnquiryBlock.hash;
  ownerBlockIds.push(ownerEnquiryBlock.id);

  const viewerTradeBlock = await insertBlock(
    ++blockNumber,
    previousHash,
    "trade",
    null,
    `Viewer grouped deal ${RUN}`,
  );
  previousHash = viewerTradeBlock.hash;
  viewerBlockIds.push(viewerTradeBlock.id);
  const viewerKycBlock = await insertBlock(
    ++blockNumber,
    previousHash,
    "kyc_amendment",
    viewerKycId,
    VIEWER_KYC_SUMMARY,
  );
  previousHash = viewerKycBlock.hash;
  viewerBlockIds.push(viewerKycBlock.id);
  const viewerEnquiryBlock = await insertBlock(
    ++blockNumber,
    previousHash,
    "enquiry_amendment",
    viewerEnquiryId,
    VIEWER_ENQUIRY_SUMMARY,
  );
  viewerBlockIds.push(viewerEnquiryBlock.id);

  ownerTradeRef = `OWNER-TRADE-${RUN}`;
  viewerTradeRef = `VIEWER-TRADE-${RUN}`;
  const trades = await pool.query(
    `INSERT INTO trades (
       trade_ref, commodity, commodity_category, quantity, unit, price_per_unit,
       total_value, currency, buyer_name, seller_name, origin, destination,
       incoterm, status, blockchain_hash, previous_hash, block_number, nonce,
       enquiry_ref, submitted_by_team_member_id
     ) VALUES
       ($1, $2, 'Metals', 100, 'MT', 10, 1000, 'USD', 'Owner Buyer',
        'Owner Seller', 'Zambia', 'China', 'FOB', 'deal', $3, $4, $5, $6, $7, $8),
       ($9, $10, 'Metals', 200, 'MT', 20, 4000, 'USD', 'Viewer Buyer',
        'Viewer Seller', 'Kenya', 'UAE', 'CIF', 'deal', $11, $12, $13, $14, $15, $16)
     RETURNING id, submitted_by_team_member_id`,
    [
      ownerTradeRef,
      `Owner Copper ${RUN}`,
      ownerTradeBlock.hash,
      insertedBlocks.get(ownerTradeBlock.id)!.previous_hash,
      insertedBlocks.get(ownerTradeBlock.id)!.block_number,
      insertedBlocks.get(ownerTradeBlock.id)!.nonce,
      `OWNER-ENQ-${RUN}`,
      ownerMemberId,
      viewerTradeRef,
      `Viewer Gold ${RUN}`,
      viewerTradeBlock.hash,
      insertedBlocks.get(viewerTradeBlock.id)!.previous_hash,
      insertedBlocks.get(viewerTradeBlock.id)!.block_number,
      insertedBlocks.get(viewerTradeBlock.id)!.nonce,
      `VIEWER-ENQ-${RUN}`,
      viewerMemberId,
    ],
  );
  ownerTradeId = trades.rows.find((row) => row.submitted_by_team_member_id === ownerMemberId).id;
  viewerTradeId = trades.rows.find((row) => row.submitted_by_team_member_id === viewerMemberId).id;

  ownerDealRef = `OWNER-DEAL-${RUN}`;
  viewerDealRef = `VIEWER-DEAL-${RUN}`;
  const dealRows = await pool.query(
    `INSERT INTO deals (
       deal_ref, import_enquiry_ref, export_enquiry_ref, commodity,
       stage, trade_ref
     ) VALUES
       ($1, $2, $3, $4, 'trade_formed', $5),
       ($6, $7, $8, $9, 'trade_formed', $10)
     RETURNING id, deal_ref`,
    [
      ownerDealRef,
      `OWNER-IMPORT-${RUN}`,
      `OWNER-EXPORT-${RUN}`,
      `Owner Copper ${RUN}`,
      ownerTradeRef,
      viewerDealRef,
      `VIEWER-IMPORT-${RUN}`,
      `VIEWER-EXPORT-${RUN}`,
      `Viewer Gold ${RUN}`,
      viewerTradeRef,
    ],
  );
  ownerDealId = dealRows.rows.find((row) => row.deal_ref === ownerDealRef).id;
  viewerDealId = dealRows.rows.find((row) => row.deal_ref === viewerDealRef).id;

  const parents = await pool.query(
    `INSERT INTO product_block_parents (commodity_key, commodity_label)
     VALUES ($1, $2), ($3, $4)
     RETURNING id, commodity_key`,
    [
      `owner-test-${RUN}`,
      `Owner Copper ${RUN}`,
      `viewer-test-${RUN}`,
      `Viewer Gold ${RUN}`,
    ],
  );
  ownerParentId = parents.rows.find((row) => row.commodity_key === `owner-test-${RUN}`).id;
  viewerParentId = parents.rows.find((row) => row.commodity_key === `viewer-test-${RUN}`).id;

  await pool.query(
    `INSERT INTO product_deal_blocks (
       product_parent_id, deal_id, trade_id, block_id
     ) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)`,
    [
      ownerParentId,
      ownerDealId,
      ownerTradeId,
      ownerTradeBlock.id,
      viewerParentId,
      viewerDealId,
      viewerTradeId,
      viewerTradeBlock.id,
    ],
  );

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app, {
    sessionPool: pool,
    attachRealtime: false,
    seedOnStart: false,
  });
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });
  const address = httpServer.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (httpServer?.listening) {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => error ? reject(error) : resolve());
    });
  }

  const cleanupErrors: unknown[] = [];
  const cleanup = async (sql: string, values: unknown[]) => {
    try {
      await pool.query(sql, values);
    } catch (error) {
      cleanupErrors.push(error);
    }
  };

  try {
    await cleanup("DELETE FROM session WHERE sid = ANY($1::text[])", [testSessionIds]);
    await cleanup(
      "DELETE FROM product_deal_blocks WHERE trade_id = ANY($1::text[])",
      [[ownerTradeId, viewerTradeId].filter(Boolean)],
    );
    await cleanup(
      "DELETE FROM deals WHERE id = ANY($1::text[])",
      [[ownerDealId, viewerDealId].filter(Boolean)],
    );
    await cleanup(
      "DELETE FROM trades WHERE id = ANY($1::text[])",
      [[ownerTradeId, viewerTradeId].filter(Boolean)],
    );
    await cleanup("DELETE FROM blocks WHERE id = ANY($1::text[])", [testBlockIds]);
    await cleanup(
      "DELETE FROM product_block_parents WHERE id = ANY($1::text[])",
      [[ownerParentId, viewerParentId].filter(Boolean)],
    );
    await cleanup(
      "DELETE FROM trade_enquiries WHERE id = ANY($1::text[])",
      [[ownerEnquiryId, viewerEnquiryId].filter(Boolean)],
    );
    await cleanup(
      "DELETE FROM kyc_applications WHERE id = ANY($1::text[])",
      [[ownerKycId, viewerKycId].filter(Boolean)],
    );
    await cleanup(
      "DELETE FROM team_members WHERE id = ANY($1::text[])",
      [[ownerMemberId, viewerMemberId].filter(Boolean)],
    );
  } finally {
    if (originalAdminUsername === undefined) {
      delete process.env.ADMIN_USERNAME;
    } else {
      process.env.ADMIN_USERNAME = originalAdminUsername;
    }
    if (chainMutexClient) {
      await chainMutexClient.query("SELECT pg_advisory_unlock($1)", [BLOCKCHAIN_WRITER_LOCK_KEY]);
      await chainMutexClient.query("SELECT pg_advisory_unlock($1)", [BLOCKCHAIN_TEST_MUTEX_KEY]);
      chainMutexClient.release();
    }
    await pool.end();
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Blockchain route test cleanup failed");
  }
});

test("blockchain HTTP routes keep another team's records private while preserving proof", async () => {
  const ownerCookie = await login(OWNER_USERNAME, TEAM_PASSWORD);
  const viewerCookie = await login(VIEWER_USERNAME, TEAM_PASSWORD);
  const adminCookie = await login(
    process.env.ADMIN_USERNAME!,
    process.env.ADMIN_PASSWORD!,
  );

  const ownerLedger = await getJson("/api/blockchain-ledger", ownerCookie);
  const viewerGroups = await getJson("/api/product-blocks", viewerCookie) as JsonObject[];
  const viewerLedger = await getJson("/api/blockchain-ledger", viewerCookie);
  const adminGroups = await getJson("/api/product-blocks", adminCookie) as JsonObject[];
  const adminLedger = await getJson("/api/blockchain-ledger", adminCookie);

  assert.ok(
    ownerLedger.kycApps.some((kyc: JsonObject) => kyc.id === ownerKycId),
    "the owning team session should receive its own KYC summary",
  );
  assert.ok(
    ownerLedger.enquiries.some((enquiry: JsonObject) => enquiry.id === ownerEnquiryId),
    "the owning team session should receive its own enquiry summary",
  );

  const viewerGroupedDeals = allDealBlocks(viewerGroups);
  assert.ok(
    viewerGroupedDeals.some((entry) => entry.dealRef === viewerDealRef),
    "the viewer should still receive its own grouped deal",
  );
  assert.equal(
    viewerGroupedDeals.some((entry) =>
      entry.dealId === ownerDealId ||
      entry.dealRef === ownerDealRef ||
      entry.trade?.id === ownerTradeId ||
      entry.trade?.tradeRef === ownerTradeRef
    ),
    false,
    "another team's grouped deal details must not appear in /api/product-blocks",
  );

  assert.equal(
    viewerLedger.trades.some((trade: JsonObject) =>
      trade.id === ownerTradeId || trade.tradeRef === ownerTradeRef
    ),
    false,
    "another team's trade must not appear in the blockchain read model",
  );
  assert.equal(
    viewerLedger.kycApps.some((kyc: JsonObject) => kyc.id === ownerKycId),
    false,
    "another team's KYC identifier must not appear even when the viewer also has KYC-admin access",
  );
  assert.equal(
    viewerLedger.enquiries.some((enquiry: JsonObject) => enquiry.id === ownerEnquiryId),
    false,
    "another team's enquiry identifier must not appear in the blockchain read model",
  );
  assert.equal(
    allDealBlocks(viewerLedger.productGroups).some((entry) =>
      entry.dealId === ownerDealId || entry.dealRef === ownerDealRef
    ),
    false,
    "another team's grouped deal must not appear in /api/blockchain-ledger",
  );

  for (const blockId of ownerBlockIds) {
    const source = insertedBlocks.get(blockId)!;
    const projected = viewerLedger.blocks.find((block: JsonObject) => block.id === blockId);
    assert.ok(projected, "global hash-chain proof should remain visible to the non-owner");
    assert.equal(projected.dataId, null);
    assert.equal(projected.dataSummary, null);
    assert.equal(projected.hash, source.hash);
    assert.equal(projected.previousHash, source.previous_hash);
    assert.equal(projected.blockNumber, source.block_number);
    assert.equal(projected.nonce, source.nonce);
    assert.equal(projected.verified, source.verified);
    assert.equal(projected.timestamp, new Date(source.timestamp).toISOString());
  }

  const viewerKycProof = viewerLedger.blocks.find(
    (block: JsonObject) => block.id === viewerBlockIds[1],
  );
  const viewerEnquiryProof = viewerLedger.blocks.find(
    (block: JsonObject) => block.id === viewerBlockIds[2],
  );
  assert.equal(viewerKycProof.dataId, viewerKycId);
  assert.equal(viewerKycProof.dataSummary, VIEWER_KYC_SUMMARY);
  assert.equal(viewerEnquiryProof.dataId, viewerEnquiryId);
  assert.equal(viewerEnquiryProof.dataSummary, VIEWER_ENQUIRY_SUMMARY);

  const serializedViewerPayloads = JSON.stringify({ viewerGroups, viewerLedger });
  for (const secret of [
    ownerDealId,
    ownerDealRef,
    ownerTradeId,
    ownerTradeRef,
    ownerKycId,
    ownerEnquiryId,
    OWNER_KYC_SUMMARY,
    OWNER_ENQUIRY_SUMMARY,
  ]) {
    assert.equal(
      serializedViewerPayloads.includes(secret),
      false,
      `non-owner response leaked ${secret}`,
    );
  }

  assert.ok(
    allDealBlocks(adminGroups).some((entry) =>
      entry.dealId === ownerDealId &&
      entry.dealRef === ownerDealRef &&
      entry.trade?.id === ownerTradeId
    ),
    "admin should receive the owning team's full grouped deal metadata",
  );
  assert.ok(adminLedger.trades.some((trade: JsonObject) => trade.id === ownerTradeId));
  assert.ok(adminLedger.kycApps.some((kyc: JsonObject) => kyc.id === ownerKycId));
  assert.ok(adminLedger.enquiries.some((enquiry: JsonObject) => enquiry.id === ownerEnquiryId));
  const adminOwnerKycBlock = adminLedger.blocks.find(
    (block: JsonObject) => block.id === ownerBlockIds[1],
  );
  const adminOwnerEnquiryBlock = adminLedger.blocks.find(
    (block: JsonObject) => block.id === ownerBlockIds[2],
  );
  assert.equal(adminOwnerKycBlock.dataId, ownerKycId);
  assert.equal(adminOwnerKycBlock.dataSummary, OWNER_KYC_SUMMARY);
  assert.equal(adminOwnerEnquiryBlock.dataId, ownerEnquiryId);
  assert.equal(adminOwnerEnquiryBlock.dataSummary, OWNER_ENQUIRY_SUMMARY);
});