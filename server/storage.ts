import { eq, ne, asc, desc, inArray, notInArray, and, or, isNull, count, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import bcrypt from "bcryptjs";
import { isLpgStsSpa, type LpgStsReviewDecision, type LpgStsReviewPage } from "@shared/lpg-sts";
import { documentBrowseColumns, lpgStsAuditPageProjection } from "./document-read-projections";
import { isCopperCathode } from "@shared/copper-cathodes";
import {
  assertLpgStsCleared, assertLpgStsAcceptanceReady, isLpgStsExecutionMutation, lpgStsFingerprint,
  appendLpgStsClearance, LpgStsReviewError, protectLpgStsMutation, sanitizeLpgStsCreation,
  validateLpgStsReviewPoints, lpgStsReviewState,
} from "./lpg-sts-review";
import { pickClosestProduct } from "./product-match";
import { generateBlockHash } from "./blockchain";
import { canonicalCommodityBlockParent } from "@shared/product-groups";
import {
  isSpaAddendumContentLocked,
  isSpaAddendumExecuted,
  normalizeSpaAddendumNumber,
  preservesSpaAddendumNumber,
} from "./spa-addendum-policy";
import {
  users,
  kycApplications,
  kycDocuments,
  tradeDocuments,
  trades,
  blocks,
  productBlockParents,
  productDealBlocks,
  documents,
  type User,
  type InsertUser,
  type KycApplication,
  type InsertKyc,
  type Trade,
  type InsertTrade,
  type Block,
  type InsertBlock,
  type ProductBlockParent,
  type ProductBlockGroup,
  type Document,
  type InsertDocument,
  type KycDocument,
  type InsertKycDocument,
  type TradeDocument,
  type InsertTradeDocument,
  kycChangeRequests,
  type KycChangeRequest,
  type InsertKycChangeRequest,
  tradeEnquiries,
  tradeEnquiryDocuments,
  type TradeEnquiry,
  type InsertTradeEnquiry,
  type TradeEnquiryDocument,
  type InsertTradeEnquiryDocument,
  enquiryChangeRequests,
  type EnquiryChangeRequest,
  type InsertEnquiryChangeRequest,
  deals,
  type Deal,
  type InsertDeal,
  tfrCandidates,
  type TfrCandidate,
  type InsertTfrCandidate,
  tfrRecipients,
  type TfrRecipient,
  type InsertTfrRecipient,
  tradeMatches,
  type TradeMatch,
  type InsertTradeMatch,
  shipmentBlocks,
  type ShipmentBlock,
  type InsertShipmentBlock,
  investments,
  type Investment,
  type InsertInvestment,
  registrations,
  type Registration,
  type InsertRegistration,
  teamMembers,
  type TeamMember,
  type InsertTeamMember,
  teamPasswordResetTokens,
  type TeamPasswordResetToken,
  clientPasswordSetupTokens,
  type ClientPasswordSetupToken,
  teamMemberDocuments,
  type TeamMemberDocument,
  type InsertTeamMemberDocument,
  teamKycApplications,
  type TeamKycApplication,
  type InsertTeamKyc,
  teamKycDocuments,
  type TeamKycDocument,
  type InsertTeamKycDocument,
  teamTasks,
  type TeamTask,
  type InsertTeamTask,
  checklistTemplates,
  type ChecklistTemplate,
  type InsertChecklistTemplate,
  checklistRecords,
  type ChecklistRecord,
  type InsertChecklistRecord,
  taskUpdates,
  dailyReports,
  chatMessages,
  type ChatMessage,
  type InsertChatMessage,
  appSettings,
  type AppSetting,
  contacts,
  type Contact,
  type InsertContact,
  companyBankAccounts,
  type CompanyBankAccount,
  type InsertCompanyBankAccount,
  shipments,
  type Shipment,
  type InsertShipment,
  type DailyReport,
  type InsertDailyReport,
  type TaskUpdate,
  type InsertTaskUpdate,
  potentialClients,
  type PotentialClient,
  type InsertPotentialClient,
  notifications,
  type Notification,
  type InsertNotification,
} from "@shared/schema";

// Advisory-lock key serializing blockchain appends (trade formation) against
// chain-tip deletes (TFR approval revoke) so blocks never chain onto a deleted
// predecessor. Any fixed bigint works; it only has to be shared by both paths.
const BLOCKCHAIN_LOCK_KEY = 792215001;

// drizzle() has separate Pool and PoolClient overloads whose inferred `$client`
// types are not mutually assignable even though the query API used here is the
// same. Keep this private helper structural rather than coupling it to one.
type TransactionDb = any;

const bankRegistryKey = (account: {
  companyName: string;
  bankName: string;
  accountNumber?: string | null;
}) =>
  `${account.companyName.trim().toLowerCase()}|${account.bankName.trim().toLowerCase()}|${(account.accountNumber || "").trim().toLowerCase()}`;

function kycBankAccountValues(kyc: KycApplication): InsertCompanyBankAccount[] {
  const entries = [
    {
      bankName: kyc.bankName,
      bankBranch: kyc.bankBranch,
      bankAddress: kyc.bankAddress,
      accountName: kyc.accountName,
      accountNumber: kyc.accountNumber,
      swiftCode: kyc.swiftCode,
      bankAccountCurrency: kyc.bankAccountCurrency,
      bankOfficerName: kyc.bankOfficerName,
      bankOfficerEmail: kyc.bankOfficerEmail,
    },
    ...(Array.isArray(kyc.additionalBanks) ? kyc.additionalBanks : []),
  ].filter((bank) => (bank.bankName || "").trim());

  return entries.map((bank) => {
    const officer = [bank.bankOfficerName, bank.bankOfficerEmail]
      .filter((value) => value?.trim())
      .join(" · ");
    const sourceMarker = ` Source: ${kyc.id}.`;
    return {
      companyName: kyc.companyName,
      bankName: (bank.bankName || "").trim(),
      branch: bank.bankBranch?.trim() || null,
      bankAddress: bank.bankAddress?.trim() || null,
      accountName: bank.accountName?.trim() || null,
      accountNumber: bank.accountNumber?.trim() || null,
      swiftCode: bank.swiftCode?.trim() || null,
      currency: bank.bankAccountCurrency?.trim() || null,
      notes: officer
        ? `From approved KYC.${sourceMarker} Bank officer: ${officer}`
        : `From approved KYC.${sourceMarker}`,
    };
  });
}

async function reconcileKycCompanyBankAccountsInTransaction(
  txDb: TransactionDb,
  sourceId: string,
  legacyCompanyNames: string[],
  accounts: InsertCompanyBankAccount[],
  previousSource?: KycApplication,
): Promise<number> {
  const existing = await txDb.select().from(companyBankAccounts).for("update");
  const normalizedLegacyNames = new Set(
    legacyCompanyNames.map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const legacyKeysOwnedOnlyBySource = new Set<string>();
  if (previousSource) {
    const allKycRecords = await txDb.select().from(kycApplications);
    const ownerKeys = allKycRecords.map((kyc: KycApplication) => ({
      id: kyc.id,
      keys: new Set(
        kycBankAccountValues(kyc.id === sourceId ? previousSource : kyc).map(bankRegistryKey),
      ),
    }));
    for (const key of ownerKeys.find((owner: { id: string }) => owner.id === sourceId)?.keys || []) {
      const matchingOwners = ownerKeys.filter((owner: { keys: Set<string> }) => owner.keys.has(key));
      if (matchingOwners.length === 1 && matchingOwners[0].id === sourceId) {
        legacyKeysOwnedOnlyBySource.add(key);
      }
    }
  }
  const sourceMarker = `Source: ${sourceId}.`;
  const idsToReplace = existing
    .filter((account: CompanyBankAccount) => {
      const notes = account.notes || "";
      return (
        notes.includes(sourceMarker) ||
        (
          notes.startsWith("From approved KYC.") &&
          !notes.includes("Source: ") &&
          normalizedLegacyNames.has(account.companyName.trim().toLowerCase()) &&
          legacyKeysOwnedOnlyBySource.has(bankRegistryKey(account))
        )
      );
    })
    .map((account: CompanyBankAccount) => account.id);
  const idsToReplaceSet = new Set(idsToReplace);

  if (idsToReplace.length > 0) {
    await txDb.delete(companyBankAccounts).where(inArray(companyBankAccounts.id, idsToReplace));
  }

  const retainedKeys = new Set(
    existing
      .filter((account: CompanyBankAccount) => !idsToReplaceSet.has(account.id))
      .map(bankRegistryKey),
  );
  let created = 0;
  for (const account of accounts) {
    const key = bankRegistryKey(account);
    if (retainedKeys.has(key)) continue;
    retainedKeys.add(key);
    await txDb.insert(companyBankAccounts).values(account);
    created++;
  }
  return created;
}

async function getOrCreateProductBlockParent(
  txDb: TransactionDb,
  commodity: string | null | undefined,
): Promise<{ parent: ProductBlockParent; created: boolean }> {
  const identity = canonicalCommodityBlockParent(commodity);
  const [created] = await txDb.insert(productBlockParents)
    .values({
      commodityKey: identity.key,
      commodityLabel: identity.label,
    })
    .onConflictDoNothing({ target: productBlockParents.commodityKey })
    .returning();
  if (created) return { parent: created, created: true };

  const [existing] = await txDb.select().from(productBlockParents)
    .where(eq(productBlockParents.commodityKey, identity.key))
    .limit(1);
  if (!existing) {
    throw new Error(`Product block parent could not be resolved for ${identity.label}`);
  }
  return { parent: existing, created: false };
}

async function ensureProductDealBlockAssociation(
  txDb: TransactionDb,
  trade: Trade,
  block: Block,
  knownDealId?: string | null,
): Promise<{ created: boolean; parentCreated: boolean }> {
  const { parent, created: parentCreated } = await getOrCreateProductBlockParent(txDb, trade.commodity);
  let dealId = knownDealId;
  if (dealId === undefined) {
    const [linkedDeal] = await txDb.select({ id: deals.id }).from(deals)
      .where(eq(deals.tradeRef, trade.tradeRef))
      .limit(1);
    dealId = linkedDeal?.id ?? null;
  }

  const [association] = await txDb.insert(productDealBlocks)
    .values({
      productParentId: parent.id,
      dealId: dealId ?? null,
      tradeId: trade.id,
      blockId: block.id,
    })
    .onConflictDoNothing()
    .returning();

  return { created: !!association, parentCreated };
}

// Amendment approvals accept either mint style:
//  - preferred: buildBlockFn — the tip is read and the block computed INSIDE
//    the transaction under the blockchain advisory lock (cannot go stale);
//  - legacy: a pre-mined block (mined outside the txn) that is re-verified
//    against the live tip under the lock, throwing the retryable
//    "Blockchain advanced" error when the tip has moved.
export type AmendmentMintSpec =
  | {
      buildBlockFn: (previousHash: string, blockNumber: number) => { hash: string; nonce: number; timestamp: Date };
      genesisHash: string;
      dataId: string;
      dataSummary: string;
    }
  | {
      blockNumber: number;
      hash: string;
      previousHash: string;
      nonce: number;
      timestamp: Date;
      dataId: string;
      dataSummary: string;
    };

export type DirectKycAdminAmendmentResult = {
  updated: KycApplication;
  audited: boolean;
  reapprovalRequired: boolean;
};

// Resolve an AmendmentMintSpec into concrete block column values. Must be
// called inside a transaction holding BLOCKCHAIN_LOCK_KEY.
async function buildAmendmentBlockValues(
  txDb: Pick<ReturnType<typeof drizzle>, "select">,
  mintSpec: AmendmentMintSpec,
): Promise<{ blockNumber: number; hash: string; previousHash: string; nonce: number; timestamp: Date }> {
  if ("buildBlockFn" in mintSpec) {
    const [latestBlock] = await txDb.select().from(blocks).orderBy(desc(blocks.blockNumber)).limit(1);
    const previousHash = latestBlock ? latestBlock.hash : mintSpec.genesisHash;
    const blockNumber = latestBlock ? latestBlock.blockNumber + 1 : 1;
    const built = mintSpec.buildBlockFn(previousHash, blockNumber);
    return { blockNumber, hash: built.hash, previousHash, nonce: built.nonce, timestamp: built.timestamp };
  }
  return {
    blockNumber: mintSpec.blockNumber,
    hash: mintSpec.hash,
    previousHash: mintSpec.previousHash,
    nonce: mintSpec.nonce,
    timestamp: mintSpec.timestamp,
  };
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

export type SpaAddendumMutationGuard = "content" | "execution";

export interface AtomicChildEligibility {
  parentDocType: string;
  parentStatus?: string;
  enquirySide?: string;
  requiredAdminCheckLabels?: string[];
  expectedParentContent?: string | null;
}

export type GuardedDocumentMutationResult =
  | { ok: true; document: Document }
  | {
      ok: false;
      reason:
        | "not_found"
        | "spa_addendum_content_locked"
        | "spa_addendum_executed"
        | "spa_addendum_number_mismatch"
        | "child_document_exists"
        | "proforma_invoice_immutable"
        | "status_conflict"
        | "no_pending_amendment";
      document?: Document;
    };

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;

  getUserByUsername(username: string): Promise<User | undefined>;

  createUser(user: InsertUser): Promise<User>;

  getChatMessages(roomId: string, limit?: number): Promise<ChatMessage[]>;

  createChatMessage(msg: InsertChatMessage): Promise<ChatMessage>;

  getKycApplications(): Promise<KycApplication[]>;

  deleteKycApplication(id: string): Promise<void>;

  getKycApplicationById(id: string): Promise<KycApplication | undefined>;

  getKycByClientUsername(username: string): Promise<KycApplication | undefined>;

  createKycApplication(kyc: InsertKyc): Promise<KycApplication>;

  updateKycStatus(id: string, status: string, reviewNotes?: string, category?: string, products?: string): Promise<KycApplication>;

  claimKycForAutoApproval(id: string, reviewNotes: string): Promise<KycApplication | undefined>;

  updateKycClientUsername(id: string, clientUsername: string): Promise<KycApplication>;

  updateKycClientCredentials(id: string, clientUsername: string, clientPassword: string): Promise<KycApplication>;

  consumeClientPasswordSetupToken(token: string, clientPassword: string): Promise<KycApplication | undefined>;

  updateKycAmlScreening(id: string, data: { amlStatus: string; amlMatches?: any; amlCheckedBy?: string; amlNotes?: string; ofacStatus?: string; ofacMatches?: any; unSanctionsStatus?: string; unSanctionsMatches?: any; pepStatus?: string; pepMatches?: any }): Promise<KycApplication>;

  applyDirectKycAdminAmendment(
    id: string,
    fields: Record<string, any>,
    reason: string,
    mintSpec: AmendmentMintSpec,
    invalidateScreening: boolean,
  ): Promise<DirectKycAdminAmendmentResult>;

  getApprovedKycByCompanyName(companyName: string): Promise<KycApplication | undefined>;

  getTrades(): Promise<Trade[]>;

  getTradesByTeamMemberId(teamMemberId: string): Promise<Trade[]>;

  getTradeById(id: string): Promise<Trade | undefined>;

  updateTradeStatus(id: string, status: string, expectedStatus?: string): Promise<Trade | undefined>;

  updateStageDocuments(id: string, stageDocuments: Record<string, boolean>): Promise<Trade>;

  setStageDocumentFlag(tradeId: string, docKey: string, checked: boolean): Promise<Trade | undefined>;

  attachTradeDocument(doc: InsertTradeDocument): Promise<TradeDocument | undefined>;

  createTrade(trade: any): Promise<Trade>;

  createPreDealTrade(tradeInput: any): Promise<Trade>;

  mintTradeBlock(tradeId: string, newStatus: string, generateTradeHashFn: Function, mineBlockFn: Function, genesisHash: string): Promise<Trade>;

  mintKycBlock(kycId: string, generateKycHashFn: Function, mineBlockFn: Function, genesisHash: string): Promise<KycApplication>;

  getBlocks(): Promise<Block[]>;

  getProductBlockGroups(teamMemberId?: string | null): Promise<ProductBlockGroup[]>;

  backfillProductDealBlocks(): Promise<{ checked: number; parentsCreated: number; linksCreated: number }>;

  getLatestBlock(): Promise<Block | undefined>;

  createBlock(block: InsertBlock): Promise<Block>;

  getDocuments(): Promise<Document[]>;
  getDocumentsForBrowse(teamMemberId?: string): Promise<Document[]>;
  getSentDocumentsForClient(clientId: string): Promise<Document[]>;
  getGeneratedDocumentsForClient(clientId: string): Promise<Document[]>;
  getDocumentForBrowse(id: string): Promise<Document | undefined>;
  getAgentAgreementsForBrowse(agentCode: string): Promise<Document[]>;
  getLpgStsReviewPage(id: string, before?: number): Promise<LpgStsReviewPage | undefined>;
  getBasisDocsForEnquiry(enquiryRef: string, docTypes: string[]): Promise<Document[]>;

  getDocumentById(id: string): Promise<Document | undefined>;

  getDocumentsByTeamMemberId(teamMemberId: string): Promise<Document[]>;

  getAgentAgreementsByAgentCode(agentCode: string): Promise<Document[]>;

  createDocument(doc: InsertDocument, options?: { lpgSts?: boolean }): Promise<Document>;

  createNumberedSpaAddendum(
    parentDocId: string,
    requestedNumber: string | undefined,
    buildDocument: (addendumNumber: string) => InsertDocument,
  ): Promise<{ document: Document; addendumNumber: string } | null>;

  createDocumentIfNoChild(
    doc: InsertDocument,
    parentDocId: string,
    docType: string,
    eligibility?: AtomicChildEligibility,
  ): Promise<Document | null>;

  updateDocument(id: string, data: Partial<Document>, expectedContent?: string | null): Promise<Document>;
  clearLpgStsReview(id: string, expectedContent: string, points: LpgStsReviewDecision[], reviewedBy: string, expectedFingerprint: string): Promise<Document>;

  updateDocumentWithSpaAddendumGuard(
    id: string,
    data: Partial<Document>,
    guard: SpaAddendumMutationGuard,
    options?: {
      disallowedStatuses?: string[];
      disallowChildDocTypes?: string[];
      expectedContent?: string | null;
      expectedStatus?: string;
      requireUnsigned?: boolean;
      expectedBuyerSignature?: string | null;
    },
  ): Promise<GuardedDocumentMutationResult>;

  reviewDocumentAmendmentAtomically(
    id: string,
    decision: "approve" | "reject",
    adminReviewNotes?: string,
    options?: {
      invalidateAdminReview?: boolean;
      resetAdminChecks?: Array<{ label: string; checked: boolean }>;
      disallowChildDocTypes?: string[];
    },
  ): Promise<GuardedDocumentMutationResult>;

  respondToDocumentOnce(id: string, data: { recipientResponse: string; status: string; recipientRespondedAt: Date; recipientAmendmentNotes?: string }, expectedContent?: string | null): Promise<Document | undefined>;

  deleteDocument(id: string): Promise<void>;

  deleteDocumentWithSpaAddendumGuard(id: string): Promise<GuardedDocumentMutationResult>;

  getKycDocuments(documentType?: string): Promise<KycDocument[]>;

  getKycDocumentsByApplicationId(kycApplicationId: string): Promise<KycDocument[]>;

  countOrphanedKycDocuments(): Promise<number>;

  createKycDocument(doc: InsertKycDocument): Promise<KycDocument>;

  deleteKycDocument(id: string): Promise<void>;

  linkKycDocumentsToApplication(kycApplicationId: string, documentIds: string[]): Promise<void>;

  getAllTradeDocuments(): Promise<TradeDocument[]>;

  getTradeDocuments(tradeId: string): Promise<TradeDocument[]>;

  getTradeDocumentById(id: string): Promise<TradeDocument | undefined>;

  createTradeDocument(doc: InsertTradeDocument): Promise<TradeDocument>;

  deleteTradeDocument(id: string): Promise<void>;

  getKycChangeRequests(): Promise<KycChangeRequest[]>;

  getKycChangeRequestsByApplicationId(kycApplicationId: string): Promise<KycChangeRequest[]>;

  createKycChangeRequest(req: InsertKycChangeRequest): Promise<KycChangeRequest>;

  updateKycChangeRequestStatus(id: string, status: string, adminNotes?: string): Promise<KycChangeRequest>;

  approveAndApplyChangeRequest(id: string, adminNotes?: string, mintSpec?: AmendmentMintSpec): Promise<KycApplication>;

  updateKycApplicationFields(id: string, fields: Record<string, any>): Promise<KycApplication>;
  updateTradeEnquiryFields(id: string, fields: Record<string, any>): Promise<TradeEnquiry>;

  getTradeEnquiries(): Promise<TradeEnquiry[]>;

  getLatestAcceptedSpecsByProduct(product: string): Promise<{ product: string; specifications: string } | undefined>;

  getDistinctProductNames(query: string, limit?: number): Promise<string[]>;

  getTradeEnquiryById(id: string): Promise<TradeEnquiry | undefined>;

  getTradeEnquiryByRef(ref: string): Promise<TradeEnquiry | undefined>;

  createTradeEnquiry(enquiry: InsertTradeEnquiry): Promise<TradeEnquiry>;

  updateTradeEnquiryStatus(id: string, status: string, linkedTradeRef?: string): Promise<TradeEnquiry>;

  deleteTradeEnquiry(id: string): Promise<void>;

  getContacts(): Promise<Contact[]>;

  getContactById(id: string): Promise<Contact | undefined>;

  createContact(contact: InsertContact & { submittedByTeamMemberId?: string | null }): Promise<Contact>;

  updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined>;

  updateContactCardImage(id: string, storedName: string | null): Promise<Contact | undefined>;

  deleteContact(id: string): Promise<Contact | undefined>;

  getCompanyBankAccounts(): Promise<CompanyBankAccount[]>;

  getCompanyBankAccountById(id: string): Promise<CompanyBankAccount | undefined>;

  createCompanyBankAccount(account: InsertCompanyBankAccount & { submittedByTeamMemberId?: string | null }): Promise<CompanyBankAccount>;

  updateCompanyBankAccount(id: string, data: Partial<InsertCompanyBankAccount>): Promise<CompanyBankAccount | undefined>;

  deleteCompanyBankAccount(id: string): Promise<CompanyBankAccount | undefined>;

  reconcileKycCompanyBankAccounts(
    sourceId: string,
    legacyCompanyNames: string[],
    accounts: InsertCompanyBankAccount[],
  ): Promise<number>;

  getShipments(): Promise<Shipment[]>;

  getShipmentById(id: string): Promise<Shipment | undefined>;

  createShipment(shipment: InsertShipment & { submittedByTeamMemberId?: string | null; lastPositionAt?: Date | null }): Promise<Shipment>;

  updateShipment(id: string, data: Partial<InsertShipment> & { lastPositionAt?: Date | null; positionSource?: string }): Promise<Shipment | undefined>;

  updateShipmentPositionByMmsi(mmsi: string, lat: number, lng: number): Promise<number>;

  deleteShipment(id: string): Promise<Shipment | undefined>;

  getKycApplicationsByTeamMemberId(teamMemberId: string): Promise<KycApplication[]>;

  getTradeEnquiriesByTeamMemberId(teamMemberId: string): Promise<TradeEnquiry[]>;

  getTradeEnquiriesForTeamMember(teamMemberId: string): Promise<TradeEnquiry[]>;

  getEnquiryChangeRequests(): Promise<EnquiryChangeRequest[]>;

  getEnquiryChangeRequestsByEnquiryId(enquiryId: string): Promise<EnquiryChangeRequest[]>;

  createEnquiryChangeRequest(req: InsertEnquiryChangeRequest): Promise<EnquiryChangeRequest>;

  updateEnquiryChangeRequestStatus(id: string, status: string, adminNotes?: string): Promise<EnquiryChangeRequest>;

  approveAndApplyEnquiryChangeRequest(id: string, adminNotes?: string, mintSpec?: AmendmentMintSpec): Promise<TradeEnquiry>;

  updateTradeEnquiryClientResponse(id: string, response: string, respondedBy: string): Promise<TradeEnquiry | undefined>;

  assignEnquiryToClient(id: string, clientId: string | null): Promise<TradeEnquiry | undefined>;

  allocateEnquiryToTeamMember(id: string, teamMemberId: string | null): Promise<TradeEnquiry | undefined>;

  getTradeEnquiryDocuments(enquiryId: string): Promise<TradeEnquiryDocument[]>;

  getTradeEnquiryDocumentById(id: string): Promise<TradeEnquiryDocument | undefined>;

  createTradeEnquiryDocument(doc: InsertTradeEnquiryDocument): Promise<TradeEnquiryDocument>;

  deleteTradeEnquiryDocument(id: string): Promise<TradeEnquiryDocument | undefined>;

  getDeals(): Promise<Deal[]>;

  getDealById(id: string): Promise<Deal | undefined>;

  createDeal(deal: InsertDeal & { dealRef: string }): Promise<Deal>;

  getTfrCandidates(): Promise<TfrCandidate[]>;

  getTfrCandidateById(id: string): Promise<TfrCandidate | undefined>;

  createTfrCandidate(candidate: InsertTfrCandidate): Promise<TfrCandidate>;

  claimTfrCandidate(id: string): Promise<TfrCandidate | undefined>;

  deleteDealIfNoTrade(id: string): Promise<Deal | undefined>;

  updateDealTfrDetailsIfPending(id: string, details: Record<string, string>): Promise<Deal | undefined>;
  revokeTfrApprovalForDeal(dealId: string): Promise<
    | { ok: false; status: number; message: string }
    | { ok: true; deal: Deal; tradeRef: string; tfrDocId: string | null }
  >;

  appendDocContentIfMissing(id: string, marker: string, suffix: string, requireTradeRef?: string): Promise<Document | undefined>;
  stripDocContentIfDetached(id: string, marker: string): Promise<Document | undefined>;
  setDocFilesIfDetached(id: string, docxPath: string, pdfPath: string): Promise<Document | undefined>;

  getTfrRecipients(): Promise<TfrRecipient[]>;

  upsertTfrRecipient(recipient: InsertTfrRecipient): Promise<TfrRecipient>;

  updateTfrRecipient(id: string, data: Partial<InsertTfrRecipient>): Promise<TfrRecipient | undefined>;

  deleteTfrRecipient(id: string): Promise<TfrRecipient | undefined>;

  updateTfrCandidate(id: string, data: Partial<TfrCandidate>): Promise<TfrCandidate>;

  deleteTfrCandidate(id: string): Promise<void>;

  updateDeal(id: string, data: Partial<Deal>): Promise<Deal>;

  getTradeMatches(): Promise<TradeMatch[]>;

  getTradeMatchById(id: string): Promise<TradeMatch | undefined>;

  createTradeMatch(match: InsertTradeMatch & { matchRef: string }): Promise<TradeMatch>;

  updateTradeMatch(id: string, data: Partial<TradeMatch>): Promise<TradeMatch>;

  getShipmentBlocks(): Promise<ShipmentBlock[]>;

  getShipmentBlockById(id: string): Promise<ShipmentBlock | undefined>;

  createShipmentBlock(block: InsertShipmentBlock & {
    blockRef: string; shipmentValue: number; tokensIssued: number;
    totalProfit: number; totalValue: number; tokenValue: number;

  }): Promise<ShipmentBlock>;

  updateShipmentBlock(id: string, data: Partial<ShipmentBlock>): Promise<ShipmentBlock>;

  getInvestments(): Promise<Investment[]>;

  getInvestmentById(id: string): Promise<Investment | undefined>;

  getInvestmentsByEmail(email: string): Promise<Investment[]>;

  getInvestmentsByBlockId(blockId: string): Promise<Investment[]>;

  getInvestmentByLookupToken(token: string): Promise<Investment | undefined>;

  createInvestment(inv: InsertInvestment & {
    investmentRef: string; lookupToken: string; blockRef: string; commodity: string; tokens: number;

  }): Promise<Investment>;

  updateInvestment(id: string, data: Partial<Investment>): Promise<Investment>;

  formTradeForTfrApproval(params: {
    dealId: string;
    tfrDocId: string;
    importEnqId: string;
    exportEnqId: string;
    tradeInput: any;
    generateTradeHashFn: Function;
    mineBlockFn: Function;
    genesisHash: string;
    approvedBy?: string;

  }): Promise<{ claimed: false } | { claimed: true; deal: Deal; trade: Trade }>;

  getAppSetting(key: string): Promise<AppSetting | undefined>;

  setAppSetting(key: string, value: string): Promise<AppSetting>;

  deleteAppSetting(key: string): Promise<void>;

  getRegistrations(): Promise<Registration[]>;

  createRegistration(reg: InsertRegistration): Promise<Registration>;

  updateRegistrationStatus(id: string, status: string, reviewNotes?: string): Promise<Registration>;

  updateRegistrationFields(id: string, fields: Record<string, any>): Promise<Registration>;

  getAllTeamMembers(): Promise<TeamMember[]>;

  getTeamMemberByUsername(username: string): Promise<TeamMember | undefined>;

  allocateParticipantId(prefix: "TM" | "CL"): Promise<string>;

  assignKycParticipantId(id: string): Promise<KycApplication>;

  backfillParticipantIds(): Promise<{ kyc: number; team: number }>;

  getTeamMemberById(id: string): Promise<TeamMember | undefined>;

  createTeamMember(member: InsertTeamMember): Promise<TeamMember>;

  updateTeamMember(id: string, data: Partial<InsertTeamMember>): Promise<TeamMember>;
  terminateTeamMember(id: string, reason: string, actor: string): Promise<TeamMember | undefined>;
  completeTeamPasswordReset(token: string, password: string): Promise<TeamMember | undefined>;

  updateTeamMemberPhoto(id: string, photoStoredName: string): Promise<TeamMember>;

  deleteTeamMember(id: string): Promise<void>;

  createTeamPasswordResetToken(memberId: string, token: string, expiresAt: Date): Promise<TeamPasswordResetToken>;

  getTeamPasswordResetTokenByToken(token: string): Promise<TeamPasswordResetToken | undefined>;

  markTeamPasswordResetTokenUsed(id: string): Promise<void>;

  invalidateActiveTeamPasswordResetTokens(memberId: string): Promise<void>;

  getTeamMemberDocuments(memberId: string): Promise<TeamMemberDocument[]>;

  getTeamMemberDocumentById(id: string): Promise<TeamMemberDocument | undefined>;

  createTeamMemberDocument(doc: InsertTeamMemberDocument): Promise<TeamMemberDocument>;

  deleteTeamMemberDocument(id: string): Promise<void>;

  countPendingKycApplications(): Promise<number>;

  getTeamKycApplications(): Promise<TeamKycApplication[]>;

  getTeamKycApplicationById(id: string): Promise<TeamKycApplication | undefined>;

  countPendingTeamKycApplications(): Promise<number>;

  getTeamMembersInvitedBy(teamMemberId: string): Promise<TeamMember[]>;

  getTeamKycApplicationsInvitedBy(teamMemberId: string): Promise<TeamKycApplication[]>;

  createTeamKycApplication(app: InsertTeamKyc): Promise<TeamKycApplication>;

  updateTeamKycStatus(id: string, status: string, reviewNotes?: string, teamUsername?: string, teamPassword?: string): Promise<TeamKycApplication>;

  updateTeamKycPhoto(id: string, storedName: string, originalName: string): Promise<TeamKycApplication>;

  getTeamKycDocuments(applicationId: string): Promise<TeamKycDocument[]>;

  createTeamKycDocument(doc: InsertTeamKycDocument): Promise<TeamKycDocument>;

  getTeamKycDocumentById(id: string): Promise<TeamKycDocument | undefined>;

  deleteTeamKycDocument(id: string): Promise<void>;

  getChecklistTemplates(): Promise<ChecklistTemplate[]>;

  getChecklistTemplateById(id: string): Promise<ChecklistTemplate | undefined>;

  getChecklistTemplateByName(name: string): Promise<ChecklistTemplate | undefined>;

  createChecklistTemplate(t: InsertChecklistTemplate): Promise<ChecklistTemplate>;

  getChecklistRecords(teamMemberId?: string | null): Promise<ChecklistRecord[]>;

  getChecklistRecordById(id: string): Promise<ChecklistRecord | undefined>;

  createChecklistRecord(r: InsertChecklistRecord): Promise<ChecklistRecord>;

  updateChecklistRecord(id: string, data: Partial<InsertChecklistRecord>): Promise<ChecklistRecord>;

  deleteChecklistRecord(id: string): Promise<void>;

  getTeamTasks(): Promise<TeamTask[]>;

  getTeamTaskById(id: string): Promise<TeamTask | undefined>;

  createTeamTask(task: InsertTeamTask): Promise<TeamTask>;

  updateTeamTask(id: string, data: Partial<InsertTeamTask>): Promise<TeamTask>;

  deleteTeamTask(id: string): Promise<void>;

  getTaskUpdates(taskId: string): Promise<TaskUpdate[]>;

  createTaskUpdate(update: InsertTaskUpdate): Promise<TaskUpdate>;

  getDailyReports(filters?: { date?: string; teamMemberId?: string }): Promise<DailyReport[]>;

  createDailyReport(report: InsertDailyReport): Promise<DailyReport>;

  deleteDailyReport(id: string): Promise<void>;

  getNotifications(limit?: number): Promise<Notification[]>;

  getNotificationsPage(opts: { limit: number; cursor?: { createdAt: Date; id: string } }): Promise<{ items: Notification[]; total: number }>;

  getUnreadNotificationCount(): Promise<number>;

  createNotification(n: InsertNotification): Promise<Notification>;

  markNotificationRead(id: string): Promise<void>;

  markAllNotificationsRead(): Promise<void>;

  deleteNotification(id: string): Promise<void>;

  getPotentialClients(): Promise<PotentialClient[]>;

  getPotentialClientsByTeamMemberId(teamMemberId: string): Promise<PotentialClient[]>;

  getPotentialClientById(id: string): Promise<PotentialClient | undefined>;

  createPotentialClient(teamMemberId: string, data: InsertPotentialClient): Promise<PotentialClient>;

  updatePotentialClient(id: string, data: Partial<InsertPotentialClient>): Promise<PotentialClient>;

  deletePotentialClient(id: string): Promise<void>;

  updateTfrCandidateDetailsIfActive(id: string, details: Record<string, string>): Promise<TfrCandidate | undefined>;
  updateDocumentContentIfUnapproved(id: string, content: string): Promise<Document | undefined>;
  updateCandidateDocContentIfActive(candidateId: string, content: string): Promise<Document | undefined>;
  updateDocumentPathsIfContentMatches(id: string, content: string, docxPath: string, pdfPath: string): Promise<Document | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getKycApplications(): Promise<KycApplication[]> {
    return db.select().from(kycApplications).orderBy(desc(kycApplications.createdAt));
  }

  async getApprovedKycByCompanyName(companyName: string): Promise<KycApplication | undefined> {
    const [kyc] = await db.select().from(kycApplications)
      .where(and(eq(kycApplications.companyName, companyName), eq(kycApplications.status, "approved")))
      .limit(1);
    return kyc;
  }

  async getKycApplicationById(id: string): Promise<KycApplication | undefined> {
    const [kyc] = await db.select().from(kycApplications).where(eq(kycApplications.id, id));
    return kyc;
  }

  async getKycByClientUsername(username: string): Promise<KycApplication | undefined> {
    const [kyc] = await db.select().from(kycApplications).where(eq(kycApplications.clientUsername, username));
    return kyc;
  }

  async createKycApplication(kyc: InsertKyc): Promise<KycApplication> {
    const [created] = await db.insert(kycApplications).values(kyc as typeof kycApplications.$inferInsert).returning();
    return created;
  }

  async claimKycForAutoApproval(id: string, reviewNotes: string): Promise<KycApplication | undefined> {
    // Atomic claim: only one concurrent auto-approval can flip pending+clear -> approved.
    const [claimed] = await db.update(kycApplications)
      .set({ status: "approved", reviewNotes })
      .where(and(
        eq(kycApplications.id, id),
        eq(kycApplications.status, "pending"),
        eq(kycApplications.amlStatus, "clear"),
      ))
      .returning();
    return claimed;
  }

  async updateKycClientUsername(id: string, clientUsername: string): Promise<KycApplication> {
    const [updated] = await db.update(kycApplications).set({ clientUsername }).where(eq(kycApplications.id, id)).returning();
    return updated;
  }

  async updateKycClientCredentials(id: string, clientUsername: string, clientPassword: string): Promise<KycApplication> {
    const [updated] = await db.update(kycApplications).set({ clientUsername, clientPassword }).where(eq(kycApplications.id, id)).returning();
    return updated;
  }

  async updateKycAmlScreening(id: string, data: { amlStatus: string; amlMatches?: any; amlCheckedBy?: string; amlNotes?: string; ofacStatus?: string; ofacMatches?: any; unSanctionsStatus?: string; unSanctionsMatches?: any; pepStatus?: string; pepMatches?: any }): Promise<KycApplication> {
    const updates: any = { amlStatus: data.amlStatus, amlCheckedAt: new Date() };
    if (data.amlMatches !== undefined) updates.amlMatches = data.amlMatches;
    if (data.amlCheckedBy !== undefined) updates.amlCheckedBy = data.amlCheckedBy;
    if (data.amlNotes !== undefined) updates.amlNotes = data.amlNotes;
    if (data.ofacStatus !== undefined) updates.ofacStatus = data.ofacStatus;
    if (data.ofacMatches !== undefined) updates.ofacMatches = data.ofacMatches;
    if (data.unSanctionsStatus !== undefined) updates.unSanctionsStatus = data.unSanctionsStatus;
    if (data.unSanctionsMatches !== undefined) updates.unSanctionsMatches = data.unSanctionsMatches;
    if (data.pepStatus !== undefined) updates.pepStatus = data.pepStatus;
    if (data.pepMatches !== undefined) updates.pepMatches = data.pepMatches;
    const [updated] = await db.update(kycApplications).set(updates).where(eq(kycApplications.id, id)).returning();
    return updated;
  }

  async deleteKycApplication(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(kycChangeRequests).where(eq(kycChangeRequests.kycApplicationId, id));
      await tx.delete(kycDocuments).where(eq(kycDocuments.kycApplicationId, id));
      await tx.delete(kycApplications).where(eq(kycApplications.id, id));
    });
  }

  async updateKycStatus(id: string, status: string, reviewNotes?: string, category?: string, products?: string): Promise<KycApplication> {
    const updates: any = { status };
    if (reviewNotes !== undefined) updates.reviewNotes = reviewNotes;
    if (category !== undefined) updates.category = category;
    if (products !== undefined) updates.products = products;
    const [updated] = await db.update(kycApplications).set(updates).where(eq(kycApplications.id, id)).returning();
    return updated;
  }

  async getTrades(): Promise<Trade[]> {
    return db.select().from(trades).orderBy(desc(trades.createdAt));
  }

  async getTradesByTeamMemberId(teamMemberId: string): Promise<Trade[]> {
    return db.select().from(trades).where(eq(trades.submittedByTeamMemberId, teamMemberId)).orderBy(desc(trades.createdAt));
  }

  async getTradeById(id: string): Promise<Trade | undefined> {
    const [trade] = await db.select().from(trades).where(eq(trades.id, id));
    return trade;
  }

  async updateTradeStatus(id: string, status: string, expectedStatus?: string): Promise<Trade | undefined> {
    // Conditional UPDATE: when expectedStatus is provided, the row must still
    // exist AND still be in that status — a concurrent TFR revoke (which
    // deletes the trade) or another transition makes this match zero rows
    // instead of silently overwriting.
    const condition = expectedStatus
      ? and(eq(trades.id, id), eq(trades.status, expectedStatus))
      : eq(trades.id, id);
    const [updated] = await db.update(trades).set({ status }).where(condition).returning();
    return updated;
  }

  async setStageDocumentFlag(tradeId: string, docKey: string, checked: boolean): Promise<Trade | undefined> {
    // Row-locked read-modify-write so a concurrent revoke (row delete) or
    // another flag update cannot interleave. Returns undefined if the trade
    // no longer exists.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txDb = drizzle(client);
      const [trade] = await txDb.select().from(trades).where(eq(trades.id, tradeId)).for("update");
      if (!trade) {
        await client.query("ROLLBACK");
        return undefined;
      }
      const current = (trade.stageDocuments as Record<string, boolean>) || {};
      current[docKey] = checked;
      const [updated] = await txDb.update(trades).set({ stageDocuments: current }).where(eq(trades.id, tradeId)).returning();
      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async attachTradeDocument(doc: InsertTradeDocument): Promise<TradeDocument | undefined> {
    // Insert the trade_documents row and set the stage-document flag in ONE
    // transaction, with the parent trade row locked. If a TFR revoke deleted
    // the trade mid-upload, the lock forces us to see the deletion and we
    // return undefined instead of committing an orphaned document row.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txDb = drizzle(client);
      const [trade] = await txDb.select().from(trades).where(eq(trades.id, doc.tradeId)).for("update");
      if (!trade) {
        await client.query("ROLLBACK");
        return undefined;
      }
      const [created] = await txDb.insert(tradeDocuments).values(doc).returning();
      const current = (trade.stageDocuments as Record<string, boolean>) || {};
      current[doc.documentKey] = true;
      await txDb.update(trades).set({ stageDocuments: current }).where(eq(trades.id, doc.tradeId));
      await client.query("COMMIT");
      return created;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateStageDocuments(id: string, stageDocuments: Record<string, boolean>): Promise<Trade> {
    const [updated] = await db.update(trades).set({ stageDocuments }).where(eq(trades.id, id)).returning();
    return updated;
  }

  async createTrade(trade: any): Promise<Trade> {
    const [created] = await db.insert(trades).values(trade).returning();
    return created;
  }

  async getBlocks(): Promise<Block[]> {
    return db.select().from(blocks).orderBy(desc(blocks.blockNumber));
  }

  async getProductBlockGroups(teamMemberId?: string | null): Promise<ProductBlockGroup[]> {
    const rows = await db.select({
      parent: productBlockParents,
      associationId: productDealBlocks.id,
      dealId: productDealBlocks.dealId,
      dealRef: deals.dealRef,
      trade: {
        id: trades.id,
        tradeRef: trades.tradeRef,
        commodity: trades.commodity,
        commodityCategory: trades.commodityCategory,
        quantity: trades.quantity,
        unit: trades.unit,
        pricePerUnit: trades.pricePerUnit,
        totalValue: trades.totalValue,
        currency: trades.currency,
        origin: trades.origin,
        destination: trades.destination,
        status: trades.status,
        blockchainHash: trades.blockchainHash,
        blockNumber: trades.blockNumber,
      },
      block: blocks,
    })
      .from(productDealBlocks)
      .innerJoin(productBlockParents, eq(productDealBlocks.productParentId, productBlockParents.id))
      .innerJoin(trades, eq(productDealBlocks.tradeId, trades.id))
      .innerJoin(blocks, eq(productDealBlocks.blockId, blocks.id))
      .leftJoin(deals, eq(productDealBlocks.dealId, deals.id))
      .where(teamMemberId ? eq(trades.submittedByTeamMemberId, teamMemberId) : undefined)
      .orderBy(asc(productBlockParents.commodityLabel), desc(blocks.blockNumber));

    const groups = new Map<string, ProductBlockGroup>();
    for (const row of rows) {
      let group = groups.get(row.parent.id);
      if (!group) {
        group = { parent: row.parent, dealBlocks: [] };
        groups.set(row.parent.id, group);
      }
      group.dealBlocks.push({
        associationId: row.associationId,
        dealId: row.dealId,
        dealRef: row.dealRef,
        trade: row.trade,
        block: row.block,
      });
    }
    return Array.from(groups.values());
  }

  async backfillProductDealBlocks(): Promise<{ checked: number; parentsCreated: number; linksCreated: number }> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Associations do not alter the chain, but using the chain lock gives the
      // backfill a stable trade/block snapshot if approval or revoke is running.
      await client.query("SELECT pg_advisory_xact_lock($1)", [BLOCKCHAIN_LOCK_KEY]);
      const txDb = drizzle(client);
      const missing = await txDb.select({
        trade: trades,
        block: blocks,
        dealId: deals.id,
      })
        .from(trades)
        .innerJoin(blocks, eq(trades.blockNumber, blocks.blockNumber))
        .leftJoin(productDealBlocks, eq(productDealBlocks.tradeId, trades.id))
        .leftJoin(deals, eq(deals.tradeRef, trades.tradeRef))
        .where(and(
          eq(blocks.dataType, "trade"),
          isNull(productDealBlocks.id),
        ))
        .orderBy(asc(trades.createdAt));

      let parentsCreated = 0;
      let linksCreated = 0;
      for (const row of missing) {
        const result = await ensureProductDealBlockAssociation(
          txDb,
          row.trade,
          row.block,
          row.dealId,
        );
        if (result.parentCreated) parentsCreated += 1;
        if (result.created) linksCreated += 1;
      }

      await client.query("COMMIT");
      return { checked: missing.length, parentsCreated, linksCreated };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getLatestBlock(): Promise<Block | undefined> {
    const [block] = await db.select().from(blocks).orderBy(desc(blocks.blockNumber)).limit(1);
    return block;
  }

  async createBlock(block: InsertBlock): Promise<Block> {
    const [created] = await db.insert(blocks).values(block).returning();
    return created;
  }

  async getDocuments(): Promise<Document[]> {
    return db.select().from(documents).orderBy(desc(documents.createdAt));
  }

  async getDocumentsForBrowse(teamMemberId?: string): Promise<Document[]> {
    return db.select(documentBrowseColumns).from(documents)
      .where(teamMemberId === undefined ? undefined : eq(documents.submittedByTeamMemberId, teamMemberId))
      .orderBy(desc(documents.createdAt));
  }

  async getDocumentForBrowse(id: string): Promise<Document | undefined> {
    const [doc] = await db.select(documentBrowseColumns).from(documents).where(eq(documents.id, id));
    return doc;
  }

  async getSentDocumentsForClient(clientId: string): Promise<Document[]> {
    return db.select(documentBrowseColumns).from(documents)
      .where(and(eq(documents.sentToClientId, clientId), eq(documents.status, "sent")))
      .orderBy(desc(documents.createdAt));
  }

  async getGeneratedDocumentsForClient(clientId: string): Promise<Document[]> {
    return db.select(documentBrowseColumns).from(documents)
      .where(eq(documents.submittedByClientId, clientId))
      .orderBy(desc(documents.createdAt));
  }

  async getAgentAgreementsForBrowse(agentCode: string): Promise<Document[]> {
    return db.select(documentBrowseColumns).from(documents)
      .where(and(eq(documents.agentCode, agentCode), inArray(documents.docType, ["NCNDA", "ICA"])))
      .orderBy(desc(documents.createdAt));
  }

  async getLpgStsReviewPage(id: string, before?: number): Promise<LpgStsReviewPage | undefined> {
    const [row] = await db.select({
      ...documentBrowseColumns,
      auditPage: lpgStsAuditPageProjection(before),
    }).from(documents).where(eq(documents.id, id));
    return row ? { ...lpgStsReviewState(row), ...row.auditPage } : undefined;
  }

  // Candidate TFR basis documents for one enquiry: only the given docTypes,
  // only accepted instruments (client-accepted or auto-accepted by the
  // cascade), newest first. Mirrors pickTfrBasisDoc's eligibility rule so the
  // TFR builder doesn't need to load the whole documents table:
  //   (status = accepted OR recipientResponse = accepted)
  //   AND status != rejected AND recipientResponse is not rejected.
  async getBasisDocsForEnquiry(enquiryRef: string, docTypes: string[]): Promise<Document[]> {
    if (!docTypes.length) return [];
    return db.select().from(documents)
      .where(and(
        eq(documents.enquiryRef, enquiryRef),
        inArray(documents.docType, docTypes),
        or(eq(documents.status, "accepted"), eq(documents.recipientResponse, "accepted")),
        ne(documents.status, "rejected"),
        or(isNull(documents.recipientResponse), ne(documents.recipientResponse, "rejected")),
      ))
      // Deterministic tie-breaker: two versions created in the same
      // millisecond (bulk imports, fast auto-chains) would otherwise sort
      // nondeterministically and the TFR could cite either one.
      .orderBy(desc(documents.createdAt), desc(documents.id));
  }

  async getDocumentById(id: string): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    return doc;
  }

  async getDocumentsByTeamMemberId(teamMemberId: string): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.submittedByTeamMemberId, teamMemberId)).orderBy(desc(documents.createdAt));
  }

  // NCNDA/ICA agent agreements where the given participant ID is the agent
  // (the document's SUBJECT, regardless of who generated it).
  async getAgentAgreementsByAgentCode(agentCode: string): Promise<Document[]> {
    return db.select().from(documents)
      .where(and(eq(documents.agentCode, agentCode), inArray(documents.docType, ["NCNDA", "ICA"])))
      .orderBy(desc(documents.createdAt));
  }

  async createDocument(doc: InsertDocument, options?: { lpgSts?: boolean }): Promise<Document> {
    const clean = sanitizeLpgStsCreation(doc, options?.lpgSts);
    if (isLpgStsExecutionMutation(clean)) assertLpgStsCleared(clean);
    if (clean.status === "accepted" || clean.recipientResponse === "accepted") assertLpgStsAcceptanceReady(clean);
    if (doc.parentDocId && ["DLC_MT700", "PBG_MT760"].includes(doc.docType)) {
      // The generic create path also accepts a parent ID. Validate under the
      // same lock as insertion without changing standard-SPA duplicate policy.
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM documents WHERE id = ${doc.parentDocId} FOR UPDATE`);
        const [parent] = await tx.select().from(documents).where(eq(documents.id, doc.parentDocId!)).limit(1);
        if (parent) assertLpgStsCleared(parent);
        const [created] = await tx.insert(documents).values(clean).returning();
        return created;
      });
    }
    const [created] = await db.insert(documents).values(clean).returning();
    return created;
  }

  // Serialize addendum-number allocation on the parent SPA. Multiple addenda
  // are valid, but two concurrent requests must never receive the same legal
  // reference. Explicit numbers are rejected when already used.
  async createNumberedSpaAddendum(
    parentDocId: string,
    requestedNumber: string | undefined,
    buildDocument: (addendumNumber: string) => InsertDocument,
  ): Promise<{ document: Document; addendumNumber: string } | null> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM documents WHERE id = ${parentDocId} FOR UPDATE`);
      const existing = await tx
        .select({ addendumNumber: documents.addendumNumber })
        .from(documents)
        .where(and(eq(documents.parentDocId, parentDocId), eq(documents.docType, "ADDENDUM")));
      const used = existing
        .map((row) => row.addendumNumber)
        .filter((value): value is string => !!value);

      let addendumNumber: string;
      if (requestedNumber) {
        addendumNumber = normalizeSpaAddendumNumber(requestedNumber);
        if (used.includes(addendumNumber)) return null;
      } else {
        const highestNumeric = used.reduce((highest, value) => {
          const parsed = /^\d+$/.test(value) ? Number(value) : 0;
          return Math.max(highest, parsed);
        }, 0);
        addendumNumber = String(highestNumeric + 1);
      }
      const [created] = await tx.insert(documents).values({
        ...buildDocument(addendumNumber),
        addendumNumber,
      }).returning();
      return { document: created, addendumNumber };
    });
  }

  // Atomically create a child document only if the parent has no existing child
  // of the same docType. Locks the parent row so concurrent signers (e.g. buyer
  // and seller signing near-simultaneously) cannot both create a duplicate.
  async createDocumentIfNoChild(
    doc: InsertDocument,
    parentDocId: string,
    docType: string,
    eligibility?: AtomicChildEligibility,
  ): Promise<Document | null> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM documents WHERE id = ${parentDocId} FOR UPDATE`);
      if (["DLC_MT700", "PBG_MT760"].includes(docType)) {
        const [parent] = await tx.select().from(documents).where(eq(documents.id, parentDocId)).limit(1);
        if (!parent) return null;
        assertLpgStsCleared(parent);
      }
      if (eligibility) {
        const [parent] = await tx
          .select({
            docType: documents.docType,
            status: documents.status,
            adminChecks: documents.adminChecks,
            enquiryRef: documents.enquiryRef,
            content: documents.content,
          })
          .from(documents)
          .where(eq(documents.id, parentDocId))
          .limit(1);
        if (!parent || parent.docType !== eligibility.parentDocType) {
          return null;
        }
        if (eligibility.parentStatus && parent.status !== eligibility.parentStatus) return null;
        if (eligibility.requiredAdminCheckLabels) {
          const checks = Array.isArray(parent.adminChecks)
            ? parent.adminChecks.filter((c: any) => c?.key !== "lpgStsReview")
            : parent.adminChecks;
          const checklistComplete = Array.isArray(checks)
            && checks.length === eligibility.requiredAdminCheckLabels.length
            && checks.every((check: any, index) =>
              check?.label === eligibility.requiredAdminCheckLabels![index]
              && check?.checked === true);
          if (!checklistComplete) return null;
        }
        if (
          Object.prototype.hasOwnProperty.call(eligibility, "expectedParentContent")
          && parent.content !== eligibility.expectedParentContent
        ) {
          return null;
        }
        if (eligibility.enquirySide) {
          if (!parent.enquiryRef) return null;
          await tx.execute(sql`
            SELECT enquiry_ref
            FROM trade_enquiries
            WHERE enquiry_ref = ${parent.enquiryRef}
            FOR SHARE
          `);
          const [enquiry] = await tx
            .select({ side: tradeEnquiries.side })
            .from(tradeEnquiries)
            .where(eq(tradeEnquiries.enquiryRef, parent.enquiryRef))
            .limit(1);
          if (enquiry?.side !== eligibility.enquirySide) return null;
        }
      }
      const existing = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.parentDocId, parentDocId), eq(documents.docType, docType)))
        .limit(1);
      if (existing.length > 0) return null;
      const clean = sanitizeLpgStsCreation(doc);
      if (isLpgStsExecutionMutation(clean)) assertLpgStsCleared(clean);
      if (clean.status === "accepted" || clean.recipientResponse === "accepted") assertLpgStsAcceptanceReady(clean);
      const [created] = await tx.insert(documents).values(clean).returning();
      return created;
    });
  }

  async updateDocument(id: string, data: Partial<Document>, expectedContent?: string | null): Promise<Document> {
    if (Object.prototype.hasOwnProperty.call(data, "addendumNumber")) {
      throw new Error("SPA addendum numbers are immutable after creation");
    }
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM documents WHERE id = ${id} FOR UPDATE`);
      const [current] = await tx.select().from(documents).where(eq(documents.id, id)).limit(1);
      // Preserve the existing no-row UPDATE result: TFR cancellation may
      // delete its document after an edit's earlier conditional claim.
      if (!current) return current;
      if (expectedContent !== undefined && current.content !== expectedContent) {
        throw new LpgStsReviewError("The document changed during finalization. Reopen the latest document.");
      }
      const protectedData = protectLpgStsMutation(current, data);
      if (isLpgStsExecutionMutation(data)) assertLpgStsCleared({ ...current, ...protectedData });
      if (data.status === "accepted" || data.recipientResponse === "accepted") assertLpgStsAcceptanceReady({ ...current, ...protectedData });
      const [updated] = await tx.update(documents).set(protectedData).where(eq(documents.id, id)).returning();
      return updated;
    });
  }

  async clearLpgStsReview(id: string, expectedContent: string, points: LpgStsReviewDecision[], reviewedBy: string, expectedFingerprint: string): Promise<Document> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM documents WHERE id = ${id} FOR UPDATE`);
      const [current] = await tx.select().from(documents).where(eq(documents.id, id)).limit(1);
      if (!current || !isLpgStsSpa(current)) throw new LpgStsReviewError("This document is not an LPG STS SPA.");
      if (current.content !== expectedContent) throw new LpgStsReviewError("The SPA changed during review. Reopen and review the latest saved content.");
      if (typeof expectedFingerprint !== "string" || lpgStsFingerprint(current) !== expectedFingerprint) {
        throw new LpgStsReviewError("The SPA transaction details changed during review. Reopen and review the latest document.");
      }
      if (!validateLpgStsReviewPoints(points) || !reviewedBy) throw new LpgStsReviewError("Provide a decision and transaction-specific explanation for every LPG review point.");
      const adminChecks = appendLpgStsClearance(current.adminChecks, {
        fingerprint: lpgStsFingerprint(current), points,
        reviewedBy, reviewedAt: new Date().toISOString(),
      });
      const [updated] = await tx.update(documents).set({ adminChecks }).where(eq(documents.id, id)).returning();
      return updated;
    });
  }

  async updateDocumentWithSpaAddendumGuard(
    id: string,
    data: Partial<Document>,
    guard: SpaAddendumMutationGuard,
    options?: {
      disallowedStatuses?: string[];
      disallowChildDocTypes?: string[];
      expectedContent?: string | null;
      expectedStatus?: string;
      requireUnsigned?: boolean;
      expectedBuyerSignature?: string | null;
    },
  ): Promise<GuardedDocumentMutationResult> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM documents WHERE id = ${id} FOR UPDATE`);
      const [current] = await tx.select().from(documents).where(eq(documents.id, id)).limit(1);
      if (!current) return { ok: false, reason: "not_found" };
      if (
        Object.prototype.hasOwnProperty.call(options || {}, "expectedContent")
        && current.content !== options?.expectedContent
      ) {
        return { ok: false, reason: "status_conflict", document: current };
      }
      if (options?.expectedStatus && current.status !== options.expectedStatus) {
        return { ok: false, reason: "status_conflict", document: current };
      }
      if (options?.requireUnsigned && (current.buyerSignature || current.sellerSignature)) {
        return { ok: false, reason: "status_conflict", document: current };
      }
      if (
        Object.prototype.hasOwnProperty.call(options || {}, "expectedBuyerSignature")
        && current.buyerSignature !== options?.expectedBuyerSignature
      ) {
        return { ok: false, reason: "status_conflict", document: current };
      }
      if (options?.disallowedStatuses?.includes(current.status)) {
        return { ok: false, reason: "status_conflict", document: current };
      }
      if (options?.disallowChildDocTypes?.length) {
        const [child] = await tx
          .select({ id: documents.id })
          .from(documents)
          .where(and(
            eq(documents.parentDocId, id),
            inArray(documents.docType, options.disallowChildDocTypes),
          ))
          .limit(1);
        if (child) return { ok: false, reason: "child_document_exists", document: current };
      }
      if (
        current.docType === "ADDENDUM" &&
        Object.prototype.hasOwnProperty.call(data, "addendumNumber") &&
        data.addendumNumber !== current.addendumNumber
      ) {
        return { ok: false, reason: "spa_addendum_number_mismatch", document: current };
      }
      if (guard === "content" && isSpaAddendumContentLocked(current)) {
        return { ok: false, reason: "spa_addendum_content_locked", document: current };
      }
      const proposedContent = typeof data.content === "string"
        ? data.content
        : typeof data.pendingContent === "string"
          ? data.pendingContent
          : null;
      if (guard === "content" && proposedContent !== null && !preservesSpaAddendumNumber(current, proposedContent)) {
        return { ok: false, reason: "spa_addendum_number_mismatch", document: current };
      }
      if (guard === "execution" && isSpaAddendumExecuted(current)) {
        return { ok: false, reason: "spa_addendum_executed", document: current };
      }
      const protectedData = protectLpgStsMutation(current, data);
      if (isLpgStsExecutionMutation(data)) assertLpgStsCleared({ ...current, ...protectedData });
      if (data.status === "accepted" || data.recipientResponse === "accepted") assertLpgStsAcceptanceReady({ ...current, ...protectedData });
      const [updated] = await tx
        .update(documents)
        .set(protectedData)
        .where(eq(documents.id, id))
        .returning();
      return { ok: true, document: updated };
    });
  }

  async reviewDocumentAmendmentAtomically(
    id: string,
    decision: "approve" | "reject",
    adminReviewNotes?: string,
    options?: {
      invalidateAdminReview?: boolean;
      resetAdminChecks?: Array<{ label: string; checked: boolean }>;
      disallowChildDocTypes?: string[];
    },
  ): Promise<GuardedDocumentMutationResult> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM documents WHERE id = ${id} FOR UPDATE`);
      const [current] = await tx.select().from(documents).where(eq(documents.id, id)).limit(1);
      if (!current) return { ok: false, reason: "not_found" };
      if (!current.pendingContent) {
        return { ok: false, reason: "no_pending_amendment", document: current };
      }
      if (decision === "approve" && isSpaAddendumContentLocked(current)) {
        return { ok: false, reason: "spa_addendum_content_locked", document: current };
      }
      if (decision === "approve" && !preservesSpaAddendumNumber(current, current.pendingContent)) {
        return { ok: false, reason: "spa_addendum_number_mismatch", document: current };
      }
      if (decision === "approve" && options?.disallowChildDocTypes?.length) {
        const [child] = await tx
          .select({ id: documents.id })
          .from(documents)
          .where(and(
            eq(documents.parentDocId, id),
            inArray(documents.docType, options.disallowChildDocTypes),
          ))
          .limit(1);
        if (child) return { ok: false, reason: "child_document_exists", document: current };
      }
      const updateData: Partial<Document> = {
        pendingContent: null,
        amendmentReason: null,
        amendmentRequestedBy: null,
        amendmentRequestedAt: null,
      };
      if (adminReviewNotes) updateData.adminReviewNotes = adminReviewNotes;
      if (decision === "approve") {
        updateData.content = current.pendingContent;
        updateData.buyerSignature = null;
        updateData.sellerSignature = null;
        updateData.buyerSignedName = null;
        updateData.sellerSignedName = null;
        updateData.buyerSignedAt = null;
        updateData.sellerSignedAt = null;
        updateData.buyerSignedIp = null;
        updateData.sellerSignedIp = null;
        if (options?.invalidateAdminReview) {
          updateData.status = "pending_review";
          updateData.adminChecks = options.resetAdminChecks || null;
        }
      }
      const [updated] = await tx
        .update(documents)
        .set(protectLpgStsMutation(current, updateData))
        .where(eq(documents.id, id))
        .returning();
      return { ok: true, document: updated };
    });
  }

  async respondToDocumentOnce(id: string, data: { recipientResponse: string; status: string; recipientRespondedAt: Date; recipientAmendmentNotes?: string }, expectedContent?: string | null): Promise<Document | undefined> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM documents WHERE id = ${id} FOR UPDATE`);
      const [current] = await tx.select().from(documents).where(eq(documents.id, id)).limit(1);
      if (!current || current.status !== "sent" || current.recipientResponse !== "pending") return undefined;
      if (data.recipientResponse === "accepted" || data.status === "accepted") {
        assertLpgStsCleared(current);
        if (isLpgStsSpa(current) && expectedContent !== undefined && current.content !== expectedContent) {
          throw new LpgStsReviewError("The SPA changed while it was being accepted. Reopen the latest document.");
        }
        assertLpgStsAcceptanceReady(current);
      }
      // Besides enforcing execution above, pass the mutation through the LPG
      // protector so a legacy clearance is backfilled into its audit history.
      const [updated] = await tx.update(documents)
        .set(protectLpgStsMutation(current, data))
        .where(eq(documents.id, id))
        .returning();
      return updated;
    });
  }

  async deleteDocument(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  async deleteDocumentWithSpaAddendumGuard(id: string): Promise<GuardedDocumentMutationResult> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM documents WHERE id = ${id} FOR UPDATE`);
      const [current] = await tx.select().from(documents).where(eq(documents.id, id)).limit(1);
      if (!current) return { ok: false, reason: "not_found" };
      if (isSpaAddendumContentLocked(current)) {
        return { ok: false, reason: "spa_addendum_content_locked", document: current };
      }
      if (
        current.docType === "PI"
        && (current.status !== "draft" || !!current.buyerSignature || !!current.sellerSignature)
      ) {
        return { ok: false, reason: "proforma_invoice_immutable", document: current };
      }
      await tx.delete(documents).where(eq(documents.id, id));
      return { ok: true, document: current };
    });
  }

  async getKycDocuments(documentType?: string): Promise<KycDocument[]> {
    if (documentType) {
      return db.select().from(kycDocuments).where(eq(kycDocuments.documentType, documentType)).orderBy(desc(kycDocuments.uploadedAt));
    }
    return db.select().from(kycDocuments).orderBy(desc(kycDocuments.uploadedAt));
  }

  async getKycDocumentsByApplicationId(kycApplicationId: string): Promise<KycDocument[]> {
    return db.select().from(kycDocuments).where(eq(kycDocuments.kycApplicationId, kycApplicationId)).orderBy(desc(kycDocuments.uploadedAt));
  }

  async countOrphanedKycDocuments(): Promise<number> {
    const result = await db.select({ total: count() }).from(kycDocuments).where(isNull(kycDocuments.kycApplicationId));
    return result[0]?.total ?? 0;
  }

  async createKycDocument(doc: InsertKycDocument): Promise<KycDocument> {
    const [created] = await db.insert(kycDocuments).values(doc).returning();
    return created;
  }

  async deleteKycDocument(id: string): Promise<void> {
    await db.delete(kycDocuments).where(eq(kycDocuments.id, id));
  }

  async linkKycDocumentsToApplication(kycApplicationId: string, documentIds: string[]): Promise<void> {
    await db.update(kycDocuments)
      .set({ kycApplicationId })
      .where(
        and(
          inArray(kycDocuments.id, documentIds),
          isNull(kycDocuments.kycApplicationId)
        )
      );
  }

  async getAllTradeDocuments(): Promise<TradeDocument[]> {
    return db.select().from(tradeDocuments).orderBy(desc(tradeDocuments.uploadedAt));
  }

  async getTradeDocuments(tradeId: string): Promise<TradeDocument[]> {
    return db.select().from(tradeDocuments).where(eq(tradeDocuments.tradeId, tradeId)).orderBy(desc(tradeDocuments.uploadedAt));
  }

  async getTradeDocumentById(id: string): Promise<TradeDocument | undefined> {
    const [doc] = await db.select().from(tradeDocuments).where(eq(tradeDocuments.id, id));
    return doc;
  }

  async createTradeDocument(doc: InsertTradeDocument): Promise<TradeDocument> {
    const [created] = await db.insert(tradeDocuments).values(doc).returning();
    return created;
  }

  async deleteTradeDocument(id: string): Promise<void> {
    await db.delete(tradeDocuments).where(eq(tradeDocuments.id, id));
  }

  async createPreDealTrade(tradeInput: any): Promise<Trade> {
    const year = new Date().getFullYear();
    const hexSuffix = Math.random().toString(16).slice(2, 6).toUpperCase();
    const tradeRef = `BFG-${year}-${hexSuffix}`;

    const [trade] = await db.insert(trades).values({
      tradeRef,
      commodity: tradeInput.commodity,
      commodityCategory: tradeInput.commodityCategory,
      quantity: tradeInput.quantity,
      unit: tradeInput.unit,
      pricePerUnit: tradeInput.pricePerUnit,
      totalValue: tradeInput.totalValue,
      currency: tradeInput.currency,
      buyerName: tradeInput.buyerName,
      sellerName: tradeInput.sellerName,
      origin: tradeInput.origin,
      destination: tradeInput.destination,
      incoterm: tradeInput.incoterm,
      status: "pre_deal",
      stageDocuments: {},
      blockchainHash: null,
      previousHash: null,
      blockNumber: null,
      nonce: null,
      enquiryRef: tradeInput.enquiryRef || null,
      specifications: tradeInput.specifications || null,
      submittedByTeamMemberId: tradeInput.submittedByTeamMemberId || null,
      buyerKycId: tradeInput.buyerKycId || null,
      sellerKycId: tradeInput.sellerKycId || null,
    }).returning();

    return trade;
  }

  async mintTradeBlock(
    tradeId: string,
    newStatus: string,
    generateTradeHashFn: Function,
    mineBlockFn: Function,
    genesisHash: string
  ): Promise<Trade> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize against block mints and TFR revokes (same key as
      // revokeTfrApprovalForDeal), so the chain-tip read below is stable.
      await client.query("SELECT pg_advisory_xact_lock($1)", [BLOCKCHAIN_LOCK_KEY]);
      const txDb = drizzle(client);

      const [trade] = await txDb.select().from(trades).where(eq(trades.id, tradeId)).for("update");
      if (!trade) throw new Error("Trade not found");
      if (trade.status !== "pre_deal") throw new Error("Trade is not in pre_deal stage");

      // TFR approval already mints the trade's block atomically, but intentionally
      // leaves the trade in pre_deal so its stage documents can be completed.
      // Treat any populated chain field as an existing-record attempt: partial or
      // mismatched legacy metadata must fail closed instead of minting a duplicate.
      const hasAnyChainMetadata =
        trade.blockchainHash !== null ||
        trade.blockNumber !== null ||
        trade.previousHash !== null ||
        trade.nonce !== null;
      if (hasAnyChainMetadata) {
        const isHash = (value: string | null): value is string =>
          typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
        if (
          !isHash(trade.blockchainHash) ||
          typeof trade.previousHash !== "string" ||
          trade.previousHash.trim().length === 0 ||
          !Number.isInteger(trade.blockNumber) ||
          (trade.blockNumber ?? 0) < 1 ||
          !Number.isInteger(trade.nonce) ||
          (trade.nonce ?? -1) < 0
        ) {
          throw new Error("Trade has an incomplete blockchain record");
        }
        const [existingBlock] = await txDb.select()
          .from(blocks)
          .where(eq(blocks.blockNumber, trade.blockNumber!))
          .limit(1);
        const timestamp = existingBlock?.timestamp.toISOString();
        const tradeData = `${trade.tradeRef}:${trade.commodity}:${trade.quantity}:${trade.pricePerUnit}:${trade.blockchainHash}`;
        const expectedBlockHash = existingBlock
          ? generateBlockHash(
              trade.blockNumber!,
              trade.previousHash,
              timestamp!,
              tradeData,
              trade.nonce!,
            )
          : null;
        if (
          !existingBlock ||
          existingBlock.previousHash !== trade.previousHash ||
          existingBlock.nonce !== trade.nonce ||
          existingBlock.hash !== expectedBlockHash ||
          existingBlock.dataType !== "trade" ||
          !existingBlock.verified
        ) {
          throw new Error("Trade has an incomplete blockchain record");
        }
        await ensureProductDealBlockAssociation(txDb, trade, existingBlock);
        const [advanced] = await txDb.update(trades)
          .set({ status: newStatus })
          .where(and(eq(trades.id, tradeId), eq(trades.status, "pre_deal")))
          .returning();
        await client.query("COMMIT");
        return advanced;
      }

      const [latestBlock] = await txDb.select().from(blocks).orderBy(desc(blocks.blockNumber)).limit(1);
      const previousHash = latestBlock ? latestBlock.hash : genesisHash;
      const blockNumber = latestBlock ? latestBlock.blockNumber + 1 : 1;
      const timestamp = new Date().toISOString();

      const tradeHash = generateTradeHashFn(
        trade.tradeRef,
        trade.commodity,
        trade.commodityCategory,
        trade.quantity,
        trade.pricePerUnit,
        timestamp
      );

      const tradeData = `${trade.tradeRef}:${trade.commodity}:${trade.quantity}:${trade.pricePerUnit}:${tradeHash}`;
      const { hash: blockHash, nonce } = mineBlockFn(blockNumber, previousHash, timestamp, tradeData, 2);

      const [updated] = await txDb.update(trades).set({
        blockchainHash: tradeHash,
        previousHash,
        blockNumber,
        nonce,
        status: newStatus,
      }).where(eq(trades.id, tradeId)).returning();

      const [createdBlock] = await txDb.insert(blocks).values({
        blockNumber,
        hash: blockHash,
        previousHash,
        nonce,
        tradeCount: 1,
        verified: true,
        timestamp: new Date(timestamp),
      }).returning();
      await ensureProductDealBlockAssociation(txDb, updated, createdBlock);

      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async mintKycBlock(
    kycId: string,
    generateKycHashFn: Function,
    mineBlockFn: Function,
    genesisHash: string
  ): Promise<KycApplication> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize every blocks append against other mints and TFR revoke's
      // chain-tip delete — otherwise a concurrent revoke can remove the tip
      // this mint is chaining onto, corrupting the hash chain.
      await client.query("SELECT pg_advisory_xact_lock($1)", [BLOCKCHAIN_LOCK_KEY]);
      const txDb = drizzle(client);

      const [kyc] = await txDb.select().from(kycApplications).where(eq(kycApplications.id, kycId)).for("update");
      if (!kyc) throw new Error("KYC application not found");
      if (kyc.blockchainHash) throw new Error("KYC already has a blockchain record");

      const [latestBlock] = await txDb.select().from(blocks).orderBy(desc(blocks.blockNumber)).limit(1);
      const previousHash = latestBlock ? latestBlock.hash : genesisHash;
      const blockNumber = latestBlock ? latestBlock.blockNumber + 1 : 1;
      const timestamp = new Date().toISOString();

      const kycHash = generateKycHashFn(
        kyc.companyName,
        kyc.registrationNumber,
        kyc.countryOfIncorporation,
        kyc.category || "N/A",
        timestamp
      );

      const kycData = `KYC:${kyc.companyName}:${kyc.registrationNumber}:${kyc.countryOfIncorporation}:${kycHash}`;
      const { hash: blockHash, nonce } = mineBlockFn(blockNumber, previousHash, timestamp, kycData, 2);

      const [updated] = await txDb.update(kycApplications).set({
        blockchainHash: kycHash,
        previousHash,
        blockNumber,
        nonce,
      }).where(eq(kycApplications.id, kycId)).returning();

      await txDb.insert(blocks).values({
        blockNumber,
        hash: blockHash,
        previousHash,
        nonce,
        tradeCount: 1,
        verified: true,
        timestamp: new Date(timestamp),
        dataType: "kyc",
        dataId: kycId,
        dataSummary: `${kyc.companyName} | ${kyc.category || "N/A"} | ${kyc.countryOfIncorporation}`,
      });

      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getKycChangeRequests(): Promise<KycChangeRequest[]> {
    return db.select().from(kycChangeRequests).orderBy(desc(kycChangeRequests.createdAt));
  }

  async getKycChangeRequestsByApplicationId(kycApplicationId: string): Promise<KycChangeRequest[]> {
    return db.select().from(kycChangeRequests).where(eq(kycChangeRequests.kycApplicationId, kycApplicationId)).orderBy(desc(kycChangeRequests.createdAt));
  }

  async createKycChangeRequest(req: InsertKycChangeRequest): Promise<KycChangeRequest> {
    const [created] = await db.insert(kycChangeRequests).values(req).returning();
    return created;
  }

  async updateKycChangeRequestStatus(id: string, status: string, adminNotes?: string): Promise<KycChangeRequest> {
    const [updated] = await db.update(kycChangeRequests).set({
      status,
      adminNotes: adminNotes || null,
      reviewedAt: new Date(),
    }).where(eq(kycChangeRequests.id, id)).returning();
    return updated;
  }

  async approveAndApplyChangeRequest(
    id: string,
    adminNotes?: string,
    mintSpec?: AmendmentMintSpec,
    invalidateScreening = false,
  ): Promise<KycApplication> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (mintSpec) {
        // Same blockchain serialization lock as every other block producer.
        await client.query("SELECT pg_advisory_xact_lock($1)", [BLOCKCHAIN_LOCK_KEY]);
      }
      const txDb = drizzle(client);

      // Legacy path: the block was mined OUTSIDE this transaction, so verify
      // (under the lock) that it still chains onto the live tip — the tip may
      // have moved or been deleted by a revoke since the caller mined it.
      if (mintSpec && !("buildBlockFn" in mintSpec)) {
        const [tip] = await txDb.select().from(blocks).orderBy(desc(blocks.blockNumber)).limit(1);
        const expectedPrev = tip ? tip.hash : mintSpec.previousHash;
        const expectedNumber = tip ? tip.blockNumber + 1 : mintSpec.blockNumber;
        if (mintSpec.previousHash !== expectedPrev || mintSpec.blockNumber !== expectedNumber) {
          throw new Error("Blockchain advanced while approving; please retry the approval");
        }
      }

      const [changeReq] = await txDb.select().from(kycChangeRequests).where(eq(kycChangeRequests.id, id));
      if (!changeReq) throw new Error("Change request not found");
      if (changeReq.status !== "pending") throw new Error("Change request is no longer pending");
      const [current] = await txDb
        .select()
        .from(kycApplications)
        .where(eq(kycApplications.id, changeReq.kycApplicationId))
        .for("update");
      if (!current) throw new Error("KYC application not found");

      const fields = changeReq.changedFields as Record<string, any>;
      const updates: Record<string, any> = { ...fields };
      if (invalidateScreening) {
        Object.assign(updates, {
          status: "pending",
          amlStatus: "not_run",
          amlMatches: null,
          amlCheckedAt: null,
          amlCheckedBy: null,
          amlNotes: "Identity-bearing KYC details changed; screening must be run again.",
          ofacStatus: "not_run",
          ofacMatches: null,
          unSanctionsStatus: "not_run",
          unSanctionsMatches: null,
          pepStatus: "not_run",
          pepMatches: null,
        });
      }
      const [updated] = await txDb.update(kycApplications).set(updates).where(eq(kycApplications.id, changeReq.kycApplicationId)).returning();

      await reconcileKycCompanyBankAccountsInTransaction(
        txDb,
        updated.id,
        [current.companyName, updated.companyName],
        updated.status === "approved" ? kycBankAccountValues(updated) : [],
        current,
      );

      await txDb.update(kycChangeRequests).set({
        status: "approved",
        adminNotes: adminNotes || null,
        reviewedAt: new Date(),
      }).where(eq(kycChangeRequests.id, id));

      // Mint the amendment block in the same transaction as the field update so a
      // mid-way failure rolls back fully — an amended KYC record is never left
      // without its corresponding blockchain block (and vice-versa). Preferred
      // path: the tip is read and the block computed HERE, under the advisory
      // lock, so it can never chain onto a block a concurrent revoke deleted.
      if (mintSpec) {
        const block = await buildAmendmentBlockValues(txDb, mintSpec);
        await txDb.insert(blocks).values({
          ...block,
          tradeCount: 1,
          verified: true,
          dataType: "kyc_amendment",
          dataId: mintSpec.dataId,
          dataSummary: mintSpec.dataSummary,
        });
      }

      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async applyDirectKycAdminAmendment(
    id: string,
    fields: Record<string, any>,
    reason: string,
    mintSpec: AmendmentMintSpec,
    invalidateScreening: boolean,
  ): Promise<DirectKycAdminAmendmentResult> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Keep lock order consistent with every other blockchain mutation:
      // blockchain advisory lock first, then the KYC row.
      await client.query("SELECT pg_advisory_xact_lock($1)", [BLOCKCHAIN_LOCK_KEY]);
      const txDb = drizzle(client);
      const [current] = await txDb
        .select()
        .from(kycApplications)
        .where(eq(kycApplications.id, id))
        .for("update");
      if (!current) throw new Error("KYC application not found");

      const wasApproved = current.status === "approved";
      if ("clientUsername" in fields && (!wasApproved || !current.clientUsername)) {
        throw new Error("Portal username state changed; only an approved, allocated client account can change username");
      }
      if (wasApproved && (!current.blockchainHash || current.blockNumber == null)) {
        throw new Error("KYC approval is still being finalised; retry the amendment shortly");
      }
      const reapprovalRequired = wasApproved && invalidateScreening;
      const updates: Record<string, any> = { ...fields };
      if (invalidateScreening) {
        Object.assign(updates, {
          amlStatus: "not_run",
          amlMatches: null,
          amlCheckedAt: null,
          amlCheckedBy: null,
          amlNotes: "Identity-bearing KYC details changed by admin; screening must be run again.",
          ofacStatus: "not_run",
          ofacMatches: null,
          unSanctionsStatus: "not_run",
          unSanctionsMatches: null,
          pepStatus: "not_run",
          pepMatches: null,
        });
        if (wasApproved) {
          updates.status = "pending";
        }
      }

      const [updated] = await txDb
        .update(kycApplications)
        .set(updates)
        .where(eq(kycApplications.id, id))
        .returning();

      await reconcileKycCompanyBankAccountsInTransaction(
        txDb,
        updated.id,
        [current.companyName, updated.companyName],
        updated.status === "approved" ? kycBankAccountValues(updated) : [],
        current,
      );

      await txDb.insert(kycChangeRequests).values({
        kycApplicationId: id,
        changedFields: fields,
        reason,
        status: "approved",
        adminNotes: invalidateScreening
          ? "Direct admin amendment applied; identity changed and re-screening is required."
          : "Direct admin amendment applied.",
        reviewedAt: new Date(),
      });

      if (wasApproved) {
        const block = await buildAmendmentBlockValues(txDb, mintSpec);
        await txDb.insert(blocks).values({
          ...block,
          tradeCount: 1,
          verified: true,
          dataType: "kyc_amendment",
          dataId: mintSpec.dataId,
          dataSummary: mintSpec.dataSummary,
        });
      }

      await client.query("COMMIT");
      return { updated, audited: true, reapprovalRequired };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateKycApplicationFields(id: string, fields: Record<string, any>): Promise<KycApplication> {
    const [updated] = await db.update(kycApplications).set(fields).where(eq(kycApplications.id, id)).returning();
    return updated;
  }

  async updateTradeEnquiryFields(id: string, fields: Record<string, any>): Promise<TradeEnquiry> {
    const [updated] = await db.update(tradeEnquiries).set(fields).where(eq(tradeEnquiries.id, id)).returning();
    return updated;
  }

  async getTradeEnquiries(): Promise<TradeEnquiry[]> {
    return db.select().from(tradeEnquiries).orderBy(desc(tradeEnquiries.createdAt));
  }

  // (fuzzy matcher lives in ./product-match for DB-free unit testing)
  // Latest saved chemical composition for a commodity: the specifications blob
  // of the most recent admin-accepted enquiry for that product (case- and
  // whitespace-insensitive match). Used to prefill new enquiry forms.
  private async findSpecsByProduct(product: string, acceptedOnly: boolean): Promise<{ product: string; specifications: string } | undefined> {
    const needle = product.trim().toLowerCase();
    if (!needle) return undefined;
    const statusCond = acceptedOnly ? [eq(tradeEnquiries.status, "accepted")] : [];
    const hasSpecs = sql`coalesce(trim(${tradeEnquiries.specifications}), '') <> ''`;
    const [row] = await db
      .select({ product: tradeEnquiries.product, specifications: tradeEnquiries.specifications, createdAt: tradeEnquiries.createdAt })
      .from(tradeEnquiries)
      .where(and(...statusCond, sql`lower(trim(${tradeEnquiries.product})) = ${needle}`, hasSpecs))
      .orderBy(desc(tradeEnquiries.createdAt))
      .limit(1);
    if (row) return { product: row.product, specifications: row.specifications! };

    // Fuzzy fallback: product names vary between enquiries ("Granular Sulphur"
    // vs "Granulated Sulphur"). Score the typed name against the known
    // products (small distinct set) and reuse the closest one.
    const candidates = await db
      .select({ product: tradeEnquiries.product, latest: sql<string>`max(${tradeEnquiries.createdAt})` })
      .from(tradeEnquiries)
      .where(and(...statusCond, hasSpecs))
      .groupBy(tradeEnquiries.product)
      .orderBy(sql`max(${tradeEnquiries.createdAt}) desc`);
    // Cathode variants belong together, but must never inherit ore/scrap specs
    // from a fuzzy "copper" match. Candidates are already newest-first.
    const closest = isCopperCathode(product)
      ? candidates.find(c => isCopperCathode(c.product))?.product
      : pickClosestProduct(product, candidates.filter(c => !isCopperCathode(c.product)).map(c => c.product));
    if (!closest) return undefined;
    const [fuzzyRow] = await db
      .select({ product: tradeEnquiries.product, specifications: tradeEnquiries.specifications })
      .from(tradeEnquiries)
      .where(and(...statusCond, eq(tradeEnquiries.product, closest), hasSpecs))
      .orderBy(desc(tradeEnquiries.createdAt))
      .limit(1);
    return fuzzyRow ? { product: fuzzyRow.product, specifications: fuzzyRow.specifications! } : undefined;
  }

  async getLatestAcceptedSpecsByProduct(product: string): Promise<{ product: string; specifications: string } | undefined> {
    // Prefer the most recent ACCEPTED enquiry's specs; if the commodity has
    // never been accepted yet (e.g. it was first entered five minutes ago),
    // fall back to the latest enquiry of any status so freshly captured
    // compositions are reusable immediately.
    return (await this.findSpecsByProduct(product, true)) ?? (await this.findSpecsByProduct(product, false));
  }

  // Distinct commodity names for the enquiry-form autocomplete. Matches
  // anywhere in the name, most recently used first.
  async getDistinctProductNames(query: string, limit = 10): Promise<string[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const rows = await db
      .select({ product: tradeEnquiries.product, latest: sql<string>`max(${tradeEnquiries.createdAt})` })
      .from(tradeEnquiries)
      .where(sql`lower(${tradeEnquiries.product}) like ${"%" + q + "%"}`)
      .groupBy(tradeEnquiries.product)
      .orderBy(sql`max(${tradeEnquiries.createdAt}) desc`)
      .limit(limit);
    return rows.map((r) => r.product);
  }

  async getKycApplicationsByTeamMemberId(teamMemberId: string): Promise<KycApplication[]> {
    return db.select().from(kycApplications).where(eq(kycApplications.submittedByTeamMemberId, teamMemberId)).orderBy(desc(kycApplications.createdAt));
  }

  async getTradeEnquiriesByTeamMemberId(teamMemberId: string): Promise<TradeEnquiry[]> {
    return db.select().from(tradeEnquiries).where(eq(tradeEnquiries.submittedByTeamMemberId, teamMemberId)).orderBy(desc(tradeEnquiries.createdAt));
  }

  // Enquiries a team member owns for day-to-day work: ones they submitted OR ones
  // an admin has allocated to them. Admins use getTradeEnquiries() for the full list.
  async getTradeEnquiriesForTeamMember(teamMemberId: string): Promise<TradeEnquiry[]> {
    return db
      .select()
      .from(tradeEnquiries)
      .where(
        or(
          eq(tradeEnquiries.submittedByTeamMemberId, teamMemberId),
          eq(tradeEnquiries.allocatedTeamMemberId, teamMemberId),
        ),
      )
      .orderBy(desc(tradeEnquiries.createdAt));
  }

  async getEnquiryChangeRequests(): Promise<EnquiryChangeRequest[]> {
    return db.select().from(enquiryChangeRequests).orderBy(desc(enquiryChangeRequests.createdAt));
  }

  async getEnquiryChangeRequestsByEnquiryId(enquiryId: string): Promise<EnquiryChangeRequest[]> {
    return db.select().from(enquiryChangeRequests).where(eq(enquiryChangeRequests.enquiryId, enquiryId)).orderBy(desc(enquiryChangeRequests.createdAt));
  }

  async createEnquiryChangeRequest(req: InsertEnquiryChangeRequest): Promise<EnquiryChangeRequest> {
    const [created] = await db.insert(enquiryChangeRequests).values(req).returning();
    return created;
  }

  async updateEnquiryChangeRequestStatus(id: string, status: string, adminNotes?: string): Promise<EnquiryChangeRequest> {
    const [updated] = await db.update(enquiryChangeRequests).set({
      status,
      adminNotes: adminNotes || null,
      reviewedAt: new Date(),
    }).where(eq(enquiryChangeRequests.id, id)).returning();
    return updated;
  }

  async approveAndApplyEnquiryChangeRequest(
    id: string,
    adminNotes?: string,
    mintSpec?: AmendmentMintSpec,
  ): Promise<TradeEnquiry> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (mintSpec) {
        await client.query("SELECT pg_advisory_xact_lock($1)", [BLOCKCHAIN_LOCK_KEY]);
      }
      const txDb = drizzle(client);
      // Legacy pre-mined path: re-check the block still chains onto the live
      // tip under the blockchain lock (see approveAndApplyChangeRequest).
      if (mintSpec && !("buildBlockFn" in mintSpec)) {
        const [tip] = await txDb.select().from(blocks).orderBy(desc(blocks.blockNumber)).limit(1);
        const expectedPrev = tip ? tip.hash : mintSpec.previousHash;
        const expectedNumber = tip ? tip.blockNumber + 1 : mintSpec.blockNumber;
        if (mintSpec.previousHash !== expectedPrev || mintSpec.blockNumber !== expectedNumber) {
          throw new Error("Blockchain advanced while approving; please retry the approval");
        }
      }
      const [changeReq] = await txDb.select().from(enquiryChangeRequests).where(eq(enquiryChangeRequests.id, id));
      if (!changeReq) throw new Error("Change request not found");
      if (changeReq.status !== "pending") throw new Error("Change request is no longer pending");
      const fields = changeReq.changedFields as Record<string, any>;
      const [updated] = await txDb.update(tradeEnquiries).set(fields).where(eq(tradeEnquiries.id, changeReq.enquiryId)).returning();
      await txDb.update(enquiryChangeRequests).set({
        status: "approved",
        adminNotes: adminNotes || null,
        reviewedAt: new Date(),
      }).where(eq(enquiryChangeRequests.id, id));
      if (mintSpec) {
        const block = await buildAmendmentBlockValues(txDb, mintSpec);
        await txDb.insert(blocks).values({
          ...block,
          tradeCount: 1,
          verified: true,
          dataType: "enquiry_amendment",
          dataId: mintSpec.dataId,
          dataSummary: mintSpec.dataSummary,
        });
      }
      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getTradeEnquiryById(id: string): Promise<TradeEnquiry | undefined> {
    const [enquiry] = await db.select().from(tradeEnquiries).where(eq(tradeEnquiries.id, id));
    return enquiry;
  }

  async getTradeEnquiryByRef(ref: string): Promise<TradeEnquiry | undefined> {
    const [enquiry] = await db.select().from(tradeEnquiries).where(eq(tradeEnquiries.enquiryRef, ref));
    return enquiry;
  }

  async createTradeEnquiry(enquiry: InsertTradeEnquiry): Promise<TradeEnquiry> {
    const partyName = (enquiry.createdBy || "UNK").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
    const productName = (enquiry.product || "UNK").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
    const now = new Date();
    const ddmm = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const existing = await db.select().from(tradeEnquiries);
    const prefix = `${partyName}-${productName}-${ddmm}`;
    const samePrefix = existing.filter(e => e.enquiryRef.startsWith(prefix));
    const serial = String(samePrefix.length + 1).padStart(3, "0");
    const ref = `${prefix}-${serial}`;
    const [created] = await db.insert(tradeEnquiries).values({ ...enquiry, enquiryRef: ref }).returning();
    return created;
  }

  async updateTradeEnquiryStatus(id: string, status: string, linkedTradeRef?: string): Promise<TradeEnquiry> {
    const fields: any = { status };
    if (linkedTradeRef) fields.linkedTradeRef = linkedTradeRef;
    const [updated] = await db.update(tradeEnquiries).set(fields).where(eq(tradeEnquiries.id, id)).returning();
    return updated;
  }

  async updateTradeEnquiryClientResponse(id: string, response: string, respondedBy: string): Promise<TradeEnquiry | undefined> {
    const [updated] = await db.update(tradeEnquiries)
      .set({ clientResponse: response, clientRespondedBy: respondedBy, clientRespondedAt: new Date() })
      .where(and(eq(tradeEnquiries.id, id), isNull(tradeEnquiries.clientResponse)))
      .returning();
    return updated;
  }

  async assignEnquiryToClient(id: string, clientId: string | null): Promise<TradeEnquiry | undefined> {
    const [updated] = await db.update(tradeEnquiries)
      .set({ assignedToClientId: clientId })
      .where(eq(tradeEnquiries.id, id))
      .returning();
    return updated;
  }

  async allocateEnquiryToTeamMember(id: string, teamMemberId: string | null): Promise<TradeEnquiry | undefined> {
    const [updated] = await db.update(tradeEnquiries)
      .set({ allocatedTeamMemberId: teamMemberId })
      .where(eq(tradeEnquiries.id, id))
      .returning();
    return updated;
  }

  async deleteTradeEnquiry(id: string): Promise<void> {
    await db.delete(tradeEnquiryDocuments).where(eq(tradeEnquiryDocuments.enquiryId, id));
    await db.delete(tradeEnquiries).where(eq(tradeEnquiries.id, id));
  }

  async getContacts(): Promise<Contact[]> {
    return db.select().from(contacts).orderBy(desc(contacts.createdAt));
  }

  async getContactById(id: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact;
  }

  async createContact(contact: InsertContact & { submittedByTeamMemberId?: string | null }): Promise<Contact> {
    const [created] = await db.insert(contacts).values(contact).returning();
    return created;
  }

  async updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined> {
    const [updated] = await db.update(contacts).set(data).where(eq(contacts.id, id)).returning();
    return updated;
  }

  async updateContactCardImage(id: string, storedName: string | null): Promise<Contact | undefined> {
    const [updated] = await db.update(contacts).set({ cardImageStoredName: storedName }).where(eq(contacts.id, id)).returning();
    return updated;
  }

  async deleteContact(id: string): Promise<Contact | undefined> {
    const [deleted] = await db.delete(contacts).where(eq(contacts.id, id)).returning();
    return deleted;
  }

  async getCompanyBankAccounts(): Promise<CompanyBankAccount[]> {
    return db.select().from(companyBankAccounts).orderBy(desc(companyBankAccounts.createdAt));
  }

  async getCompanyBankAccountById(id: string): Promise<CompanyBankAccount | undefined> {
    const [account] = await db.select().from(companyBankAccounts).where(eq(companyBankAccounts.id, id));
    return account;
  }

  async createCompanyBankAccount(account: InsertCompanyBankAccount & { submittedByTeamMemberId?: string | null }): Promise<CompanyBankAccount> {
    const [created] = await db.insert(companyBankAccounts).values(account).returning();
    return created;
  }

  async updateCompanyBankAccount(id: string, data: Partial<InsertCompanyBankAccount>): Promise<CompanyBankAccount | undefined> {
    const [updated] = await db.update(companyBankAccounts).set(data).where(eq(companyBankAccounts.id, id)).returning();
    return updated;
  }

  async deleteCompanyBankAccount(id: string): Promise<CompanyBankAccount | undefined> {
    const [deleted] = await db.delete(companyBankAccounts).where(eq(companyBankAccounts.id, id)).returning();
    return deleted;
  }

  async reconcileKycCompanyBankAccounts(
    sourceId: string,
    legacyCompanyNames: string[],
    accounts: InsertCompanyBankAccount[],
  ): Promise<number> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txDb = drizzle(client);
      const created = await reconcileKycCompanyBankAccountsInTransaction(
        txDb,
        sourceId,
        legacyCompanyNames,
        accounts,
      );
      await client.query("COMMIT");
      return created;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getShipments(): Promise<Shipment[]> {
    return db.select().from(shipments).orderBy(desc(shipments.createdAt));
  }

  async getShipmentById(id: string): Promise<Shipment | undefined> {
    const [shipment] = await db.select().from(shipments).where(eq(shipments.id, id));
    return shipment;
  }

  async createShipment(shipment: InsertShipment & { submittedByTeamMemberId?: string | null; lastPositionAt?: Date | null }): Promise<Shipment> {
    const [created] = await db.insert(shipments).values(shipment).returning();
    return created;
  }

  async updateShipment(id: string, data: Partial<InsertShipment> & { lastPositionAt?: Date | null; positionSource?: string }): Promise<Shipment | undefined> {
    const [updated] = await db.update(shipments).set(data).where(eq(shipments.id, id)).returning();
    return updated;
  }

  async updateShipmentPositionByMmsi(mmsi: string, lat: number, lng: number): Promise<number> {
    // Only active shipments receive live positions — delivered/cancelled rows
    // are historical records and must never be overwritten by the feed.
    const updated = await db
      .update(shipments)
      .set({ lastLat: lat, lastLng: lng, lastPositionAt: new Date(), positionSource: "ais" })
      .where(and(eq(shipments.mmsi, mmsi), notInArray(shipments.status, ["delivered", "cancelled"])))
      .returning({ id: shipments.id });
    return updated.length;
  }

  async deleteShipment(id: string): Promise<Shipment | undefined> {
    const [deleted] = await db.delete(shipments).where(eq(shipments.id, id)).returning();
    return deleted;
  }

  async getTradeEnquiryDocuments(enquiryId: string): Promise<TradeEnquiryDocument[]> {
    return db.select().from(tradeEnquiryDocuments).where(eq(tradeEnquiryDocuments.enquiryId, enquiryId));
  }

  async getTradeEnquiryDocumentById(id: string): Promise<TradeEnquiryDocument | undefined> {
    const [doc] = await db.select().from(tradeEnquiryDocuments).where(eq(tradeEnquiryDocuments.id, id));
    return doc;
  }

  async createTradeEnquiryDocument(doc: InsertTradeEnquiryDocument): Promise<TradeEnquiryDocument> {
    const [created] = await db.insert(tradeEnquiryDocuments).values(doc).returning();
    return created;
  }

  async deleteTradeEnquiryDocument(id: string): Promise<TradeEnquiryDocument | undefined> {
    const [deleted] = await db.delete(tradeEnquiryDocuments).where(eq(tradeEnquiryDocuments.id, id)).returning();
    return deleted;
  }

  async getDeals(): Promise<Deal[]> {
    return db.select().from(deals).orderBy(desc(deals.createdAt));
  }

  async getDealById(id: string): Promise<Deal | undefined> {
    const [deal] = await db.select().from(deals).where(eq(deals.id, id));
    return deal;
  }

  async createDeal(deal: InsertDeal & { dealRef: string }): Promise<Deal> {
    const [created] = await db.insert(deals).values(deal).returning();
    return created;
  }

  async updateDeal(id: string, data: Partial<Deal>): Promise<Deal> {
    const [updated] = await db.update(deals).set(data).where(eq(deals.id, id)).returning();
    return updated;
  }

  async getTfrCandidates(): Promise<TfrCandidate[]> {
    return db.select().from(tfrCandidates).orderBy(desc(tfrCandidates.createdAt));
  }

  async getTfrCandidateById(id: string): Promise<TfrCandidate | undefined> {
    const [row] = await db.select().from(tfrCandidates).where(eq(tfrCandidates.id, id));
    return row;
  }

  async createTfrCandidate(candidate: InsertTfrCandidate): Promise<TfrCandidate> {
    const [created] = await db.insert(tfrCandidates).values(candidate).returning();
    return created;
  }

  // Atomic claim: transitions the candidate from 'active' to 'deal_formed' only
  // if it is still active. Returns undefined when another request already
  // claimed/cancelled it — the single-row conditional UPDATE is the arbiter of
  // concurrent create-deal/cancel races.
  async claimTfrCandidate(id: string): Promise<TfrCandidate | undefined> {
    const [claimed] = await db
      .update(tfrCandidates)
      .set({ status: "deal_formed" })
      .where(and(eq(tfrCandidates.id, id), eq(tfrCandidates.status, "active")))
      .returning();
    return claimed;
  }

  // Atomically persist manual TFR details ONLY while the candidate is still
  // active. The conditional single-row UPDATE is the arbiter of an edit racing
  // a concurrent cancel/create-deal: once the candidate leaves 'active' the
  // edit matches nothing and fails cleanly.
  async updateTfrCandidateDetailsIfActive(id: string, details: Record<string, string>): Promise<TfrCandidate | undefined> {
    const [updated] = await db.update(tfrCandidates)
      .set({ manualDetails: details })
      .where(and(eq(tfrCandidates.id, id), eq(tfrCandidates.status, "active")))
      .returning();
    return updated;
  }

  async updateTfrCandidate(id: string, data: Partial<TfrCandidate>): Promise<TfrCandidate> {
    const [updated] = await db.update(tfrCandidates).set(data).where(eq(tfrCandidates.id, id)).returning();
    return updated;
  }

  async deleteTfrCandidate(id: string): Promise<void> {
    await db.delete(tfrCandidates).where(eq(tfrCandidates.id, id));
  }

  // Atomically remove a deal ONLY if its trade has not been formed. The
  // conditional single-row DELETE is the arbiter of a concurrent
  // approve-TFR/cancel race: once approval mints the trade (tradeRef set),
  // cancellation matches nothing and fails cleanly.
  async deleteDealIfNoTrade(id: string): Promise<Deal | undefined> {
    const [deleted] = await db
      .delete(deals)
      .where(and(eq(deals.id, id), isNull(deals.tradeRef), sql`${deals.stage} != 'trade_formed'`))
      .returning();
    return deleted;
  }

  // Atomically persist manual TFR details ONLY while the deal is still
  // awaiting approval. The conditional single-row UPDATE is the arbiter of an
  // edit racing a concurrent approval/cancellation: once the trade forms (or
  // the deal is deleted) the edit matches nothing and fails cleanly.
  async updateDealTfrDetailsIfPending(id: string, details: Record<string, string>): Promise<Deal | undefined> {
    const [updated] = await db.update(deals)
      .set({ tfrManualDetails: details })
      .where(and(eq(deals.id, id), eq(deals.stage, "tfr_pending"), isNull(deals.tradeRef)))
      .returning();
    return updated;
  }

  // Atomically replace a document's FULL content ONLY while it is still
  // unapproved (no tradeRef). Approval stamps documents.tradeRef, so a manual
  // full-text edit racing an approval matches nothing and fails cleanly
  // instead of silently rewriting an approved TFR.
  async updateDocumentContentIfUnapproved(id: string, content: string): Promise<Document | undefined> {
    const [updated] = await db.update(documents)
      .set({ content, contentManuallyEdited: true })
      .where(and(eq(documents.id, id), isNull(documents.tradeRef)))
      .returning();
    return updated;
  }

  // Atomically replace a candidate's TFR document content ONLY while the
  // candidate is still 'active' — the candidate-status check and the document
  // write happen in ONE statement (subquery), so an edit racing a concurrent
  // cancel or create-deal matches nothing and fails cleanly.
  async updateCandidateDocContentIfActive(candidateId: string, content: string): Promise<Document | undefined> {
    const [updated] = await db.update(documents)
      .set({ content, contentManuallyEdited: true })
      .where(and(
        isNull(documents.tradeRef),
        sql`${documents.id} = (SELECT tfr_doc_id FROM tfr_candidates WHERE id = ${candidateId} AND status = 'active')`,
      ))
      .returning();
    return updated;
  }

  // Persist regenerated file paths ONLY while the document still carries the
  // exact content the files were generated from — a concurrent edit (or a
  // cancel that deleted the row) makes this a clean no-op instead of pointing
  // the document at stale files.
  async updateDocumentPathsIfContentMatches(id: string, content: string, docxPath: string, pdfPath: string): Promise<Document | undefined> {
    const [updated] = await db.update(documents)
      .set({ docxPath, pdfPath })
      .where(and(eq(documents.id, id), eq(documents.content, content)))
      .returning();
    return updated;
  }

  // Atomically append `suffix` to a document's content ONLY if `marker` is not
  // already present — in a single conditional UPDATE against the CURRENT row.
  // This is the arbiter for stamping a TFR approval into a document that a
  // concurrent edit may be rewriting: unlike read-modify-write, it can never
  // overwrite the document with a stale snapshot, and it is idempotent.
  async appendDocContentIfMissing(id: string, marker: string, suffix: string, requireTradeRef?: string): Promise<Document | undefined> {
    const [updated] = await db.update(documents)
      .set({ content: sql`${documents.content} || ${suffix}` })
      .where(and(
        eq(documents.id, id),
        sql`${documents.content} NOT LIKE ${"%" + marker + "%"}`,
        // Optional guard: only stamp while the document is still tied to the
        // given trade. A revoke clears documents.tradeRef inside its
        // transaction, so a late post-approval stamp matches nothing instead
        // of stamping a reverted (pending) TFR.
        ...(requireTradeRef !== undefined ? [eq(documents.tradeRef, requireTradeRef)] : []),
      ))
      .returning();
    return updated;
  }

  // Atomically strip everything from `marker` onward in a document's content,
  // but ONLY while the document is still detached from any trade
  // (tradeRef IS NULL). This is the arbiter for the post-revoke stamp cleanup:
  // if a fresh re-approval landed between the revoke transaction and this
  // cleanup, the document carries the new tradeRef again and the stale strip
  // matches nothing instead of wiping the new approval's stamp.
  async stripDocContentIfDetached(id: string, marker: string): Promise<Document | undefined> {
    const [updated] = await db.update(documents)
      .set({ content: sql`split_part(${documents.content}, ${marker}, 1)` })
      .where(and(
        eq(documents.id, id),
        isNull(documents.tradeRef),
        sql`${documents.content} LIKE ${"%" + marker + "%"}`,
      ))
      .returning();
    return updated;
  }

  // Conditionally record regenerated file paths, again only while the document
  // remains detached — so a strip's file refresh can never clobber the files a
  // concurrent re-approval just regenerated with its stamp.
  async setDocFilesIfDetached(id: string, docxPath: string, pdfPath: string): Promise<Document | undefined> {
    const [updated] = await db.update(documents)
      .set({ docxPath, pdfPath })
      .where(and(eq(documents.id, id), isNull(documents.tradeRef)))
      .returning();
    return updated;
  }

  async getTfrRecipients(): Promise<TfrRecipient[]> {
    return db.select().from(tfrRecipients).orderBy(desc(tfrRecipients.lastUsedAt));
  }

  // Save-or-refresh a TFR addressee by name so manually entered details are
  // reusable in future; every use bumps lastUsedAt for most-recent-first lists.
  async upsertTfrRecipient(recipient: InsertTfrRecipient): Promise<TfrRecipient> {
    const [row] = await db.insert(tfrRecipients)
      .values(recipient)
      .onConflictDoUpdate({
        target: tfrRecipients.name,
        set: {
          address: recipient.address ?? null,
          attn: recipient.attn ?? null,
          notes: recipient.notes ?? null,
          lastUsedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  // Correct a saved recipient's details in place (admin directory maintenance).
  // Unlike upsert, this targets the row by id so a rename cannot silently
  // create a duplicate — a name collision surfaces as a 23505 unique violation.
  async updateTfrRecipient(id: string, data: Partial<InsertTfrRecipient>): Promise<TfrRecipient | undefined> {
    const updates: Partial<typeof tfrRecipients.$inferInsert> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.address !== undefined) updates.address = data.address;
    if (data.attn !== undefined) updates.attn = data.attn;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (Object.keys(updates).length === 0) {
      const [row] = await db.select().from(tfrRecipients).where(eq(tfrRecipients.id, id));
      return row;
    }
    const [updated] = await db.update(tfrRecipients).set(updates).where(eq(tfrRecipients.id, id)).returning();
    return updated;
  }

  async deleteTfrRecipient(id: string): Promise<TfrRecipient | undefined> {
    const [deleted] = await db.delete(tfrRecipients).where(eq(tfrRecipients.id, id)).returning();
    return deleted;
  }

  async getTradeMatches(): Promise<TradeMatch[]> {
    return db.select().from(tradeMatches).orderBy(desc(tradeMatches.createdAt));
  }

  async getTradeMatchById(id: string): Promise<TradeMatch | undefined> {
    const [match] = await db.select().from(tradeMatches).where(eq(tradeMatches.id, id));
    return match;
  }

  async createTradeMatch(match: InsertTradeMatch & { matchRef: string }): Promise<TradeMatch> {
    const [created] = await db.insert(tradeMatches).values(match).returning();
    return created;
  }

  async updateTradeMatch(id: string, data: Partial<TradeMatch>): Promise<TradeMatch> {
    const [updated] = await db.update(tradeMatches).set(data).where(eq(tradeMatches.id, id)).returning();
    return updated;
  }

  async getShipmentBlocks(): Promise<ShipmentBlock[]> {
    return db.select().from(shipmentBlocks).orderBy(desc(shipmentBlocks.createdAt));
  }

  async getShipmentBlockById(id: string): Promise<ShipmentBlock | undefined> {
    const [block] = await db.select().from(shipmentBlocks).where(eq(shipmentBlocks.id, id));
    return block;
  }

  async createShipmentBlock(block: InsertShipmentBlock & {
    blockRef: string; shipmentValue: number; tokensIssued: number;
    totalProfit: number; totalValue: number; tokenValue: number;
  }): Promise<ShipmentBlock> {
    const [created] = await db.insert(shipmentBlocks).values(block).returning();
    return created;
  }

  async updateShipmentBlock(id: string, data: Partial<ShipmentBlock>): Promise<ShipmentBlock> {
    const [updated] = await db.update(shipmentBlocks).set(data).where(eq(shipmentBlocks.id, id)).returning();
    return updated;
  }

  async getInvestments(): Promise<Investment[]> {
    return db.select().from(investments).orderBy(desc(investments.createdAt));
  }

  async getInvestmentById(id: string): Promise<Investment | undefined> {
    const [inv] = await db.select().from(investments).where(eq(investments.id, id));
    return inv;
  }

  async getInvestmentsByEmail(email: string): Promise<Investment[]> {
    return db.select().from(investments)
      .where(eq(investments.investorEmail, email))
      .orderBy(desc(investments.createdAt));
  }

  async getInvestmentsByBlockId(blockId: string): Promise<Investment[]> {
    return db.select().from(investments)
      .where(eq(investments.blockId, blockId))
      .orderBy(desc(investments.createdAt));
  }

  async getInvestmentByLookupToken(token: string): Promise<Investment | undefined> {
    const [inv] = await db.select().from(investments).where(eq(investments.lookupToken, token));
    return inv;
  }

  async createInvestment(inv: InsertInvestment & {
    investmentRef: string; lookupToken: string; blockRef: string; commodity: string; tokens: number;
  }): Promise<Investment> {
    const [created] = await db.insert(investments).values(inv).returning();
    return created;
  }

  async updateInvestment(id: string, data: Partial<Investment>): Promise<Investment> {
    const [updated] = await db.update(investments).set(data).where(eq(investments.id, id)).returning();
    return updated;
  }

  // Form a trade from an approved TFR atomically. Every write — claiming the
  // deal, creating the pre_deal trade, minting the blockchain block, accepting
  // the TFR document, tying both enquiries to the trade, and advancing the deal
  // — happens inside a single transaction. If any step fails the whole sequence
  // rolls back, so the deal returns to "tfr_pending" (never stranded in
  // "trade_forming") and can be safely re-approved with no half-formed trade or
  // orphaned block left behind. The conditional claim UPDATE also locks the row,
  // so concurrent approvals cannot both form a trade: the loser sees no claimed
  // row and gets `{ claimed: false }`.
  async formTradeForTfrApproval(params: {
    dealId: string;
    tfrDocId: string;
    importEnqId: string;
    exportEnqId: string;
    tradeInput: any;
    generateTradeHashFn: Function;
    mineBlockFn: Function;
    genesisHash: string;
    approvedBy?: string;
  }): Promise<{ claimed: false } | { claimed: true; deal: Deal; trade: Trade }> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize all blockchain appends/deletes: the tip read below and the
      // block insert must not interleave with a concurrent mint or a revoke's
      // tip delete, or a new block can chain onto a deleted predecessor.
      await client.query("SELECT pg_advisory_xact_lock($1)", [BLOCKCHAIN_LOCK_KEY]);
      const txDb = drizzle(client);

      // Atomically claim the deal. Succeeds only while it is still tfr_pending
      // with no trade; the row lock blocks concurrent approvals until commit.
      const [claimed] = await txDb.update(deals)
        .set({ stage: "trade_forming" })
        .where(and(eq(deals.id, params.dealId), eq(deals.stage, "tfr_pending"), isNull(deals.tradeRef)))
        .returning();
      if (!claimed) {
        await client.query("ROLLBACK");
        return { claimed: false };
      }

      // Create the pre_deal trade.
      const ti = params.tradeInput;
      const year = new Date().getFullYear();
      const hexSuffix = Math.random().toString(16).slice(2, 6).toUpperCase();
      const tradeRef = `BFG-${year}-${hexSuffix}`;
      const [createdTrade] = await txDb.insert(trades).values({
        tradeRef,
        commodity: ti.commodity,
        commodityCategory: ti.commodityCategory,
        quantity: ti.quantity,
        unit: ti.unit,
        pricePerUnit: ti.pricePerUnit,
        totalValue: ti.totalValue,
        currency: ti.currency,
        buyerName: ti.buyerName,
        sellerName: ti.sellerName,
        buyerKycId: ti.buyerKycId || null,
        sellerKycId: ti.sellerKycId || null,
        origin: ti.origin,
        destination: ti.destination,
        incoterm: ti.incoterm,
        status: "pre_deal",
        stageDocuments: {},
        blockchainHash: null,
        previousHash: null,
        blockNumber: null,
        nonce: null,
        enquiryRef: ti.enquiryRef || null,
        specifications: ti.specifications || null,
      }).returning();

      // Mint a blockchain block while keeping the trade in pre_deal.
      const [latestBlock] = await txDb.select().from(blocks).orderBy(desc(blocks.blockNumber)).limit(1);
      const previousHash = latestBlock ? latestBlock.hash : params.genesisHash;
      const blockNumber = latestBlock ? latestBlock.blockNumber + 1 : 1;
      const timestamp = new Date().toISOString();
      const tradeHash = params.generateTradeHashFn(
        createdTrade.tradeRef,
        createdTrade.commodity,
        createdTrade.commodityCategory,
        createdTrade.quantity,
        createdTrade.pricePerUnit,
        timestamp
      );
      const tradeData = `${createdTrade.tradeRef}:${createdTrade.commodity}:${createdTrade.quantity}:${createdTrade.pricePerUnit}:${tradeHash}`;
      const { hash: blockHash, nonce } = params.mineBlockFn(blockNumber, previousHash, timestamp, tradeData, 2);
      const [mintedTrade] = await txDb.update(trades).set({
        blockchainHash: tradeHash,
        previousHash,
        blockNumber,
        nonce,
        status: "pre_deal",
      }).where(eq(trades.id, createdTrade.id)).returning();
      const [createdBlock] = await txDb.insert(blocks).values({
        blockNumber,
        hash: blockHash,
        previousHash,
        nonce,
        tradeCount: 1,
        verified: true,
        timestamp: new Date(timestamp),
      }).returning();
      await ensureProductDealBlockAssociation(txDb, mintedTrade, createdBlock, claimed.id);

      // Mark the TFR document accepted and tie it to the trade — but never
      // overwrite a rejection that raced in (client or admin reject between
      // validation and this transaction). Losing the claim rolls the whole
      // formation back, so no trade or block is left behind.
      const acceptedRows = await txDb.update(documents).set({
        status: "accepted",
        recipientResponse: "accepted",
        recipientRespondedAt: new Date(),
        tradeRef: mintedTrade.tradeRef,
      } as any).where(and(
        eq(documents.id, params.tfrDocId),
        sql`${documents.status} <> 'rejected'`,
        sql`(${documents.recipientResponse} IS NULL OR ${documents.recipientResponse} <> 'rejected')`,
      )).returning({ id: documents.id });
      if (acceptedRows.length === 0) {
        throw new Error("TFR was rejected before approval could complete — review the rejection before re-approving");
      }

      // Mark both linked enquiries as accepted and tied to the new trade.
      await txDb.update(tradeEnquiries)
        .set({ status: "accepted", linkedTradeRef: mintedTrade.tradeRef })
        .where(eq(tradeEnquiries.id, params.importEnqId));
      await txDb.update(tradeEnquiries)
        .set({ status: "accepted", linkedTradeRef: mintedTrade.tradeRef })
        .where(eq(tradeEnquiries.id, params.exportEnqId));

      // Advance the deal to trade_formed with the digital approval stamp.
      const [updatedDeal] = await txDb.update(deals)
        .set({
          tradeRef: mintedTrade.tradeRef,
          stage: "trade_formed",
          tfrApprovedAt: new Date(),
          tfrApprovedBy: params.approvedBy || "Bullex Admin",
        })
        .where(eq(deals.id, params.dealId))
        .returning();

      await client.query("COMMIT");
      return { claimed: true, deal: updatedDeal, trade: mintedTrade };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // Undo a TFR approval: delete the minted trade + its blockchain block, revert
  // the TFR document and enquiries to their pre-approval state, and return the
  // deal to tfr_pending — all in one transaction. Refuses (409-style result)
  // when the trade has progressed beyond pre_deal, has stage documents, has
  // other documents referencing its tradeRef, or when its block is no longer
  // the chain tip (deleting a mid-chain block would break the hash chain).
  async revokeTfrApprovalForDeal(dealId: string): Promise<
    | { ok: false; status: number; message: string }
    | { ok: true; deal: Deal; tradeRef: string; tfrDocId: string | null }
  > {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Same blockchain serialization lock as formTradeForTfrApproval: the
      // chain-tip check + delete must not race a concurrent block mint.
      await client.query("SELECT pg_advisory_xact_lock($1)", [BLOCKCHAIN_LOCK_KEY]);
      const txDb = drizzle(client);

      // Lock the deal row so a concurrent revoke/cancel can't interleave.
      const [deal] = await txDb.select().from(deals)
        .where(eq(deals.id, dealId)).for("update");
      if (!deal) {
        await client.query("ROLLBACK");
        return { ok: false, status: 404, message: "Deal not found" };
      }
      if (!deal.tradeRef || deal.stage !== "trade_formed") {
        await client.query("ROLLBACK");
        return { ok: false, status: 409, message: "This deal's TFR is not approved" };
      }
      const tradeRef = deal.tradeRef;

      const [trade] = await txDb.select().from(trades)
        .where(eq(trades.tradeRef, tradeRef)).for("update");
      if (trade) {
        if (trade.status !== "pre_deal") {
          await client.query("ROLLBACK");
          return { ok: false, status: 409, message: "Trade has progressed beyond pre-deal; approval can no longer be revoked" };
        }
        const stageDocs = trade.stageDocuments as Record<string, unknown> | null;
        if (stageDocs && Object.keys(stageDocs).length > 0) {
          await client.query("ROLLBACK");
          return { ok: false, status: 409, message: "Trade already has stage documents; approval can no longer be revoked" };
        }
        // Any documents beyond the TFR referencing this trade block the revoke.
        const otherDocs = await txDb.select({ id: documents.id }).from(documents)
          .where(and(
            eq(documents.tradeRef, tradeRef),
            deal.tfrDocId ? sql`${documents.id} != ${deal.tfrDocId}` : sql`TRUE`,
          )).limit(1);
        if (otherDocs.length > 0) {
          await client.query("ROLLBACK");
          return { ok: false, status: 409, message: "Other documents already reference this trade; approval can no longer be revoked" };
        }
        // Only the chain tip can be removed without breaking the hash chain.
        if (trade.blockNumber != null) {
          const [tip] = await txDb.select().from(blocks).orderBy(desc(blocks.blockNumber)).limit(1);
          if (!tip || tip.blockNumber !== trade.blockNumber) {
            await client.query("ROLLBACK");
            return { ok: false, status: 409, message: "A newer blockchain block exists; approval can no longer be revoked" };
          }
          await txDb.delete(blocks).where(eq(blocks.blockNumber, trade.blockNumber));
        }
        await txDb.delete(trades).where(eq(trades.id, trade.id));
      }

      // Revert the TFR document to its pre-approval pending state.
      if (deal.tfrDocId) {
        await txDb.update(documents).set({
          status: "pending_review",
          recipientResponse: null,
          recipientRespondedAt: null,
          tradeRef: null,
        } as any).where(eq(documents.id, deal.tfrDocId));
      }

      // Detach both enquiries from the (now deleted) trade. They stay owned by
      // the deal, so they do not reappear on the matching board.
      await txDb.update(tradeEnquiries)
        .set({ linkedTradeRef: null })
        .where(eq(tradeEnquiries.linkedTradeRef, tradeRef));

      const [updatedDeal] = await txDb.update(deals)
        .set({ tradeRef: null, stage: "tfr_pending", tfrApprovedAt: null, tfrApprovedBy: null })
        .where(eq(deals.id, dealId))
        .returning();

      await client.query("COMMIT");
      return { ok: true, deal: updatedDeal, tradeRef, tfrDocId: deal.tfrDocId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getAppSetting(key: string): Promise<AppSetting | undefined> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return row;
  }

  async setAppSetting(key: string, value: string): Promise<AppSetting> {
    const [row] = await db.insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } })
      .returning();
    return row;
  }

  async deleteAppSetting(key: string): Promise<void> {
    await db.delete(appSettings).where(eq(appSettings.key, key));
  }

  async getRegistrations(): Promise<Registration[]> {
    return db.select().from(registrations).orderBy(desc(registrations.createdAt));
  }

  async createRegistration(reg: InsertRegistration): Promise<Registration> {
    const [created] = await db.insert(registrations).values(reg).returning();
    return created;
  }

  async updateRegistrationStatus(id: string, status: string, reviewNotes?: string): Promise<Registration> {
    const [updated] = await db.update(registrations)
      .set({ status, reviewNotes: reviewNotes ?? null, reviewedAt: new Date() })
      .where(eq(registrations.id, id))
      .returning();
    return updated;
  }

  async updateRegistrationFields(id: string, fields: Record<string, any>): Promise<Registration> {
    const [updated] = await db.update(registrations)
      .set(fields)
      .where(eq(registrations.id, id))
      .returning();
    return updated;
  }

  async getAllTeamMembers(): Promise<TeamMember[]> {
    return db.select().from(teamMembers).orderBy(desc(teamMembers.createdAt));
  }

  async getTeamMemberByUsername(username: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.username, username));
    return member;
  }

  async createTeamMember(member: InsertTeamMember): Promise<TeamMember> {
    // Ignore caller-supplied participantId — allocator owns format & uniqueness.
    const { participantId: _ignored, terminatedAt, terminationReason, terminatedBy, ...rest } = member as any;
    for (let attempt = 0; attempt < 5; attempt++) {
      const participantId = await this.allocateParticipantId("TM");
      try {
        const [created] = await db.insert(teamMembers).values({ ...rest, participantId }).returning();
        return created;
      } catch (err: any) {
        if (err?.code === "23505" && String(err?.constraint || "").includes("participant_id")) continue;
        throw err;
      }
    }
    throw new Error("Failed to allocate unique team participant ID after retries");
  }

  // Allocate next sequential participant ID for the given prefix ("TM" team / "CL" client).
  // Format: BFG-<PREFIX>-<NNNN> (zero-padded to 4 digits, grows beyond if needed).
  // Note: callers must handle 23505 unique-violation and retry — this is best-effort, not atomic.
  async allocateParticipantId(prefix: "TM" | "CL"): Promise<string> {
    const table = prefix === "TM" ? teamMembers : kycApplications;
    const rows = await db.select({ pid: table.participantId }).from(table);
    let maxN = 0;
    for (const r of rows) {
      const m = r.pid && r.pid.match(/^BFG-(TM|CL)-(\d+)$/);
      if (m && m[1] === prefix) {
        const n = parseInt(m[2], 10);
        if (n > maxN) maxN = n;
      }
    }
    const next = maxN + 1;
    return `BFG-${prefix}-${String(next).padStart(4, "0")}`;
  }

  async assignKycParticipantId(id: string): Promise<KycApplication> {
    const [existing] = await db.select().from(kycApplications).where(eq(kycApplications.id, id));
    if (!existing) throw new Error("KYC application not found");
    if (existing.participantId) return existing;
    for (let attempt = 0; attempt < 5; attempt++) {
      const participantId = await this.allocateParticipantId("CL");
      try {
        const [updated] = await db.update(kycApplications).set({ participantId }).where(eq(kycApplications.id, id)).returning();
        return updated;
      } catch (err: any) {
        if (err?.code === "23505" && String(err?.constraint || "").includes("participant_id")) continue;
        throw err;
      }
    }
    throw new Error("Failed to allocate unique client participant ID after retries");
  }

  // Backfill participantId for any approved records that don't yet have one (legacy data).
  async backfillParticipantIds(): Promise<{ kyc: number; team: number }> {
    let kycCount = 0;
    let teamCount = 0;
    const kycRows = await db.select().from(kycApplications).orderBy(kycApplications.createdAt);
    for (const row of kycRows) {
      if (row.status === "approved" && !row.participantId) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const pid = await this.allocateParticipantId("CL");
          try {
            await db.update(kycApplications).set({ participantId: pid }).where(eq(kycApplications.id, row.id));
            kycCount++;
            break;
          } catch (err: any) {
            if (err?.code === "23505") continue;
            throw err;
          }
        }
      }
    }
    const teamRows = await db.select().from(teamMembers).orderBy(teamMembers.createdAt);
    for (const row of teamRows) {
      if (!row.participantId) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const pid = await this.allocateParticipantId("TM");
          try {
            await db.update(teamMembers).set({ participantId: pid }).where(eq(teamMembers.id, row.id));
            teamCount++;
            break;
          } catch (err: any) {
            if (err?.code === "23505") continue;
            throw err;
          }
        }
      }
    }
    return { kyc: kycCount, team: teamCount };
  }

  async getTeamMemberById(id: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
    return member;
  }

  async updateTeamMember(id: string, data: Partial<InsertTeamMember>): Promise<TeamMember> {
    // Lifecycle fields are exclusively owned by termination; identity is immutable.
    const { terminatedAt, terminationReason, terminatedBy, id: ignoredId, username, ...safe } = data as any;
    const [updated] = await db.update(teamMembers).set(safe)
      .where(and(eq(teamMembers.id, id), isNull(teamMembers.terminatedAt))).returning();
    if (!updated) throw new Error("Team member not found or service terminated");
    return updated;
  }

  async terminateTeamMember(id: string, reason: string, actor: string): Promise<TeamMember | undefined> {
    if (!reason.trim() || reason.trim().length > 1000) throw new Error("Termination reason must be 1–1000 characters");
    return db.transaction(async tx => {
      const [member] = await tx.select().from(teamMembers).where(eq(teamMembers.id, id)).for("update");
      if (!member) return undefined;
      if (member.terminatedAt) return member;
      const now = new Date();
      const [terminated] = await tx.update(teamMembers).set({
        terminatedAt: now, terminationReason: reason.trim(), terminatedBy: actor,
        password: "!terminated",
      }).where(eq(teamMembers.id, id)).returning();
      await tx.update(teamPasswordResetTokens).set({ usedAt: now })
        .where(eq(teamPasswordResetTokens.memberId, id));
      return terminated;
    });
  }

  async completeTeamPasswordReset(token: string, password: string): Promise<TeamMember | undefined> {
    return db.transaction(async tx => {
      const [hint] = await tx.select().from(teamPasswordResetTokens).where(eq(teamPasswordResetTokens.token, token));
      if (!hint) return undefined;
      // All reset operations lock member first, matching termination lock order.
      const [member] = await tx.select().from(teamMembers).where(eq(teamMembers.id, hint.memberId)).for("update");
      if (!member || member.terminatedAt) return undefined;
      const [reset] = await tx.select().from(teamPasswordResetTokens).where(eq(teamPasswordResetTokens.id, hint.id)).for("update");
      if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) return undefined;
      const [updated] = await tx.update(teamMembers).set({ password }).where(eq(teamMembers.id, member.id)).returning();
      await tx.update(teamPasswordResetTokens).set({ usedAt: new Date() }).where(eq(teamPasswordResetTokens.memberId, member.id));
      return updated;
    });
  }

  async updateTeamMemberPhoto(id: string, photoStoredName: string): Promise<TeamMember> {
    const [updated] = await db.update(teamMembers).set({ photoStoredName })
      .where(and(eq(teamMembers.id, id), isNull(teamMembers.terminatedAt))).returning();
    if (!updated) throw Object.assign(new Error("Team member not found or service terminated; profile is read-only"), { statusCode: 409 });
    return updated;
  }

  async deleteTeamMember(id: string): Promise<void> {
    throw new Error("Team records must be retained. Terminate service instead.");
  }

  async createTeamPasswordResetToken(memberId: string, token: string, expiresAt: Date): Promise<TeamPasswordResetToken> {
    return db.transaction(async tx => {
      const [member] = await tx.select().from(teamMembers).where(eq(teamMembers.id, memberId)).for("update");
      if (!member || member.terminatedAt) throw new Error("Team member not found or service terminated");
      await tx.update(teamPasswordResetTokens).set({ usedAt: new Date() }).where(eq(teamPasswordResetTokens.memberId, memberId));
      const [created] = await tx.insert(teamPasswordResetTokens).values({ memberId, token, expiresAt }).returning();
      return created;
    });
  }

  async getTeamPasswordResetTokenByToken(token: string): Promise<TeamPasswordResetToken | undefined> {
    const [row] = await db.select().from(teamPasswordResetTokens).where(eq(teamPasswordResetTokens.token, token));
    return row;
  }

  async markTeamPasswordResetTokenUsed(id: string): Promise<void> {
    await db.update(teamPasswordResetTokens).set({ usedAt: new Date() }).where(eq(teamPasswordResetTokens.id, id));
  }

  async invalidateActiveTeamPasswordResetTokens(memberId: string): Promise<void> {
    await db.update(teamPasswordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(teamPasswordResetTokens.memberId, memberId), isNull(teamPasswordResetTokens.usedAt)));
  }

  async createClientPasswordSetupToken(kycId: string, token: string, expiresAt: Date): Promise<ClientPasswordSetupToken> {
    const [created] = await db.insert(clientPasswordSetupTokens).values({ kycId, token, expiresAt }).returning();
    return created;
  }

  async getClientPasswordSetupTokenByToken(token: string): Promise<ClientPasswordSetupToken | undefined> {
    const [row] = await db.select().from(clientPasswordSetupTokens).where(eq(clientPasswordSetupTokens.token, token));
    return row;
  }

  async markClientPasswordSetupTokenUsed(id: string): Promise<void> {
    await db.update(clientPasswordSetupTokens).set({ usedAt: new Date() }).where(eq(clientPasswordSetupTokens.id, id));
  }

  async invalidateActiveClientPasswordSetupTokens(kycId: string): Promise<void> {
    await db.update(clientPasswordSetupTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(clientPasswordSetupTokens.kycId, kycId), isNull(clientPasswordSetupTokens.usedAt)));
  }

  async consumeClientPasswordSetupToken(token: string, clientPassword: string): Promise<KycApplication | undefined> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const claimed = await client.query<{
        id: string;
        kyc_id: string;
      }>(
        `UPDATE client_password_setup_tokens
         SET used_at = NOW()
         WHERE token = $1
           AND used_at IS NULL
           AND expires_at > NOW()
         RETURNING id, kyc_id`,
        [token],
      );
      const row = claimed.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return undefined;
      }
      const txDb = drizzle(client);
      const [kyc] = await txDb
        .select()
        .from(kycApplications)
        .where(eq(kycApplications.id, row.kyc_id))
        .for("update");
      if (!kyc || kyc.status !== "approved" || !kyc.clientUsername) {
        await client.query("ROLLBACK");
        return undefined;
      }
      const [updated] = await txDb
        .update(kycApplications)
        .set({ clientPassword })
        .where(eq(kycApplications.id, kyc.id))
        .returning();
      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getTeamMemberDocuments(memberId: string): Promise<TeamMemberDocument[]> {
    return db.select().from(teamMemberDocuments).where(eq(teamMemberDocuments.memberId, memberId)).orderBy(desc(teamMemberDocuments.uploadedAt));
  }

  async getTeamMemberDocumentById(id: string): Promise<TeamMemberDocument | undefined> {
    const [doc] = await db.select().from(teamMemberDocuments).where(eq(teamMemberDocuments.id, id));
    return doc;
  }

  async createTeamMemberDocument(doc: InsertTeamMemberDocument): Promise<TeamMemberDocument> {
    const [created] = await db.insert(teamMemberDocuments).values(doc).returning();
    return created;
  }

  async deleteTeamMemberDocument(id: string): Promise<void> {
    await db.delete(teamMemberDocuments).where(eq(teamMemberDocuments.id, id));
  }

  async getTeamKycApplications(): Promise<TeamKycApplication[]> {
    return db.select().from(teamKycApplications).orderBy(desc(teamKycApplications.createdAt));
  }

  async getTeamKycApplicationById(id: string): Promise<TeamKycApplication | undefined> {
    const [app] = await db.select().from(teamKycApplications).where(eq(teamKycApplications.id, id));
    return app;
  }

  async countPendingKycApplications(): Promise<number> {
    const result = await db.select({ total: count() }).from(kycApplications).where(eq(kycApplications.status, "pending"));
    return result[0]?.total ?? 0;
  }

  async countPendingTeamKycApplications(): Promise<number> {
    const result = await db.select({ total: count() }).from(teamKycApplications).where(eq(teamKycApplications.status, "pending"));
    return result[0]?.total ?? 0;
  }

  async getTeamMembersInvitedBy(teamMemberId: string): Promise<TeamMember[]> {
    return db.select().from(teamMembers).where(eq(teamMembers.invitedByTeamMemberId, teamMemberId)).orderBy(desc(teamMembers.createdAt));
  }

  async getTeamKycApplicationsInvitedBy(teamMemberId: string): Promise<TeamKycApplication[]> {
    return db.select().from(teamKycApplications).where(eq(teamKycApplications.invitedByTeamMemberId, teamMemberId)).orderBy(desc(teamKycApplications.createdAt));
  }

  async createTeamKycApplication(app: InsertTeamKyc): Promise<TeamKycApplication> {
    const { randomBytes } = await import("crypto");
    const uploadToken = randomBytes(32).toString("hex");
    const [created] = await db.insert(teamKycApplications).values({ ...app, uploadToken }).returning();
    return created;
  }

  async updateTeamKycStatus(id: string, status: string, reviewNotes?: string, teamUsername?: string, teamPassword?: string): Promise<TeamKycApplication> {
    const updateData: any = { status };
    if (reviewNotes !== undefined) updateData.reviewNotes = reviewNotes;
    if (teamUsername !== undefined) updateData.teamUsername = teamUsername;
    if (teamPassword !== undefined) updateData.teamPassword = teamPassword;
    const [updated] = await db.update(teamKycApplications).set(updateData).where(eq(teamKycApplications.id, id)).returning();
    return updated;
  }

  async updateTeamKycPhoto(id: string, storedName: string, originalName: string): Promise<TeamKycApplication> {
    const [updated] = await db.update(teamKycApplications)
      .set({ photoStoredName: storedName, photoOriginalName: originalName })
      .where(eq(teamKycApplications.id, id))
      .returning();
    return updated;
  }

  async getTeamKycDocuments(applicationId: string): Promise<TeamKycDocument[]> {
    return db.select().from(teamKycDocuments)
      .where(eq(teamKycDocuments.applicationId, applicationId))
      .orderBy(desc(teamKycDocuments.uploadedAt));
  }

  async createTeamKycDocument(doc: InsertTeamKycDocument): Promise<TeamKycDocument> {
    const [created] = await db.insert(teamKycDocuments).values(doc).returning();
    return created;
  }

  async getTeamKycDocumentById(id: string): Promise<TeamKycDocument | undefined> {
    const [doc] = await db.select().from(teamKycDocuments).where(eq(teamKycDocuments.id, id));
    return doc;
  }

  async deleteTeamKycDocument(id: string): Promise<void> {
    await db.delete(teamKycDocuments).where(eq(teamKycDocuments.id, id));
  }

  async getChecklistTemplates(): Promise<ChecklistTemplate[]> {
    return db.select().from(checklistTemplates).orderBy(desc(checklistTemplates.createdAt));
  }

  async getChecklistTemplateById(id: string): Promise<ChecklistTemplate | undefined> {
    const [t] = await db.select().from(checklistTemplates).where(eq(checklistTemplates.id, id));
    return t;
  }

  async getChecklistTemplateByName(name: string): Promise<ChecklistTemplate | undefined> {
    const [t] = await db.select().from(checklistTemplates).where(eq(checklistTemplates.name, name));
    return t;
  }

  async createChecklistTemplate(t: InsertChecklistTemplate): Promise<ChecklistTemplate> {
    // Race-safe against concurrent seeding: name is unique, first insert wins.
    const [created] = await db.insert(checklistTemplates).values(t as typeof checklistTemplates.$inferInsert)
      .onConflictDoNothing({ target: checklistTemplates.name })
      .returning();
    if (created) return created;
    const existing = await this.getChecklistTemplateByName(t.name);
    if (!existing) throw new Error("Failed to create checklist template");
    return existing;
  }

  async getChecklistRecords(teamMemberId?: string | null): Promise<ChecklistRecord[]> {
    if (teamMemberId) {
      return db.select().from(checklistRecords)
        .where(eq(checklistRecords.submittedByTeamMemberId, teamMemberId))
        .orderBy(desc(checklistRecords.createdAt));
    }
    return db.select().from(checklistRecords).orderBy(desc(checklistRecords.createdAt));
  }

  async getChecklistRecordById(id: string): Promise<ChecklistRecord | undefined> {
    const [r] = await db.select().from(checklistRecords).where(eq(checklistRecords.id, id));
    return r;
  }

  async createChecklistRecord(r: InsertChecklistRecord): Promise<ChecklistRecord> {
    const [created] = await db.insert(checklistRecords).values(r as typeof checklistRecords.$inferInsert).returning();
    return created;
  }

  async updateChecklistRecord(id: string, data: Partial<InsertChecklistRecord>): Promise<ChecklistRecord> {
    const [updated] = await db.update(checklistRecords)
      .set({ ...data, updatedAt: new Date() } as Partial<typeof checklistRecords.$inferInsert>)
      .where(eq(checklistRecords.id, id))
      .returning();
    return updated;
  }

  async deleteChecklistRecord(id: string): Promise<void> {
    await db.delete(checklistRecords).where(eq(checklistRecords.id, id));
  }

  async getTeamTasks(): Promise<TeamTask[]> {
    return db.select().from(teamTasks).orderBy(desc(teamTasks.createdAt));
  }

  async getTeamTaskById(id: string): Promise<TeamTask | undefined> {
    const [task] = await db.select().from(teamTasks).where(eq(teamTasks.id, id));
    return task;
  }

  async createTeamTask(task: InsertTeamTask): Promise<TeamTask> {
    const [created] = await db.insert(teamTasks).values(task).returning();
    return created;
  }

  async updateTeamTask(id: string, data: Partial<InsertTeamTask>): Promise<TeamTask> {
    const [updated] = await db.update(teamTasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(teamTasks.id, id))
      .returning();
    return updated;
  }

  async deleteTeamTask(id: string): Promise<void> {
    await db.delete(taskUpdates).where(eq(taskUpdates.taskId, id));
    await db.delete(teamTasks).where(eq(teamTasks.id, id));
  }

  async getTaskUpdates(taskId: string): Promise<TaskUpdate[]> {
    return db.select().from(taskUpdates)
      .where(eq(taskUpdates.taskId, taskId))
      .orderBy(taskUpdates.createdAt);
  }

  async createTaskUpdate(update: InsertTaskUpdate): Promise<TaskUpdate> {
    const [created] = await db.insert(taskUpdates).values(update).returning();
    return created;
  }

  async getDailyReports(filters?: { date?: string; teamMemberId?: string }): Promise<DailyReport[]> {
    const conds: any[] = [];
    if (filters?.date) conds.push(eq(dailyReports.reportDate, filters.date));
    if (filters?.teamMemberId) conds.push(eq(dailyReports.teamMemberId, filters.teamMemberId));
    const q = conds.length
      ? db.select().from(dailyReports).where(conds.length === 1 ? conds[0] : and(...conds))
      : db.select().from(dailyReports);
    return q.orderBy(desc(dailyReports.createdAt));
  }

  async createDailyReport(report: InsertDailyReport): Promise<DailyReport> {
    const [created] = await db.insert(dailyReports).values(report).returning();
    return created;
  }

  async deleteDailyReport(id: string): Promise<void> {
    await db.delete(dailyReports).where(eq(dailyReports.id, id));
  }

  async getPotentialClients(): Promise<PotentialClient[]> {
    return db.select().from(potentialClients).orderBy(desc(potentialClients.createdAt));
  }

  async getPotentialClientsByTeamMemberId(teamMemberId: string): Promise<PotentialClient[]> {
    return db.select().from(potentialClients).where(eq(potentialClients.teamMemberId, teamMemberId)).orderBy(desc(potentialClients.createdAt));
  }

  async getPotentialClientById(id: string): Promise<PotentialClient | undefined> {
    const [row] = await db.select().from(potentialClients).where(eq(potentialClients.id, id));
    return row;
  }

  async createPotentialClient(teamMemberId: string, data: InsertPotentialClient): Promise<PotentialClient> {
    const [row] = await db.insert(potentialClients).values({ ...data, teamMemberId }).returning();
    return row;
  }

  async updatePotentialClient(id: string, data: Partial<InsertPotentialClient>): Promise<PotentialClient> {
    const [row] = await db.update(potentialClients).set({ ...data, updatedAt: new Date() }).where(eq(potentialClients.id, id)).returning();
    return row;
  }

  async deletePotentialClient(id: string): Promise<void> {
    await db.delete(potentialClients).where(eq(potentialClients.id, id));
  }

  async getNotifications(limit?: number): Promise<Notification[]> {
    const q = db.select().from(notifications).orderBy(desc(notifications.createdAt));
    return limit !== undefined ? q.limit(limit) : q;
  }

  // Keyset (cursor) pagination over (createdAt DESC, id DESC). The cursor is
  // the last row of the previous page; rows strictly "after" it in that
  // ordering are returned. Also returns the total row count so the UI can show
  // "X of Y" without fetching everything.
  async getNotificationsPage(opts: { limit: number; cursor?: { createdAt: Date; id: string } }): Promise<{ items: Notification[]; total: number }> {
    const { limit, cursor } = opts;
    const where = cursor
      ? or(
          sql`${notifications.createdAt} < ${cursor.createdAt}`,
          and(eq(notifications.createdAt, cursor.createdAt), sql`${notifications.id} < ${cursor.id}`),
        )
      : undefined;
    let q = db.select().from(notifications)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit);
    const itemsPromise = where ? q.where(where) : q;
    const totalPromise = db.select({ n: count() }).from(notifications);
    const [items, [{ n: total }]] = await Promise.all([itemsPromise, totalPromise]);
    return { items, total };
  }

  async getUnreadNotificationCount(): Promise<number> {
    const [{ n }] = await db.select({ n: count() }).from(notifications).where(eq(notifications.isRead, false));
    return n;
  }

  async createNotification(n: InsertNotification): Promise<Notification> {
    const [row] = await db.insert(notifications).values(n).returning();
    return row;
  }

  async markNotificationRead(id: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.isRead, false));
  }

  async deleteNotification(id: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  async getChatMessages(roomId: string, limit: number = 200): Promise<ChatMessage[]> {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.roomId, roomId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
    return rows.reverse();
  }

  async createChatMessage(msg: InsertChatMessage): Promise<ChatMessage> {
    if (msg.senderId.startsWith("team:")) {
      return db.transaction(async tx => {
        const [member] = await tx.select().from(teamMembers)
          .where(eq(teamMembers.username, msg.senderId.slice(5))).for("update");
        if (!member || member.terminatedAt) throw new Error("Team service has ended");
        const [row] = await tx.insert(chatMessages).values(msg).returning();
        return row;
      });
    }
    const [row] = await db.insert(chatMessages).values(msg).returning();
    return row;
  }

  // One-time migration: hash any plaintext passwords that were stored before bcrypt was introduced.
  // A bcrypt hash always starts with "$2" so we can detect un-hashed values reliably.
  async migratePasswordsToHashed(): Promise<{ teamMembers: number; kycClients: number }> {
    let teamCount = 0;
    let kycCount = 0;

    const members = await db.select({ id: teamMembers.id, password: teamMembers.password }).from(teamMembers);
    for (const m of members) {
      if (m.password && !m.password.startsWith("$2")) {
        const hashed = await bcrypt.hash(m.password, 12);
        await db.update(teamMembers).set({ password: hashed })
          .where(and(eq(teamMembers.id, m.id), eq(teamMembers.password, m.password), isNull(teamMembers.terminatedAt)));
        teamCount++;
      }
    }

    const clients = await db.select({ id: kycApplications.id, clientPassword: kycApplications.clientPassword })
      .from(kycApplications);
    for (const c of clients) {
      if (c.clientPassword && !c.clientPassword.startsWith("$2")) {
        const hashed = await bcrypt.hash(c.clientPassword, 12);
        await db.update(kycApplications).set({ clientPassword: hashed }).where(eq(kycApplications.id, c.id));
        kycCount++;
      }
    }

    // Hash any plaintext teamPassword values in team_kyc_applications.
    const teamKycRows = await db.select({ id: teamKycApplications.id, teamPassword: teamKycApplications.teamPassword })
      .from(teamKycApplications);
    for (const t of teamKycRows) {
      if (t.teamPassword && !t.teamPassword.startsWith("$2")) {
        const hashed = await bcrypt.hash(t.teamPassword, 12);
        await db.update(teamKycApplications).set({ teamPassword: hashed }).where(eq(teamKycApplications.id, t.id));
        teamCount++;
      }
    }

    return { teamMembers: teamCount, kycClients: kycCount };
  }
}

export const storage = new DatabaseStorage();
