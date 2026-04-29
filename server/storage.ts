import { eq, desc, inArray, and, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  users,
  kycApplications,
  kycDocuments,
  tradeDocuments,
  trades,
  blocks,
  documents,
  type User,
  type InsertUser,
  type KycApplication,
  type InsertKyc,
  type Trade,
  type InsertTrade,
  type Block,
  type InsertBlock,
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
  registrations,
  type Registration,
  type InsertRegistration,
} from "@shared/schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getKycApplications(): Promise<KycApplication[]>;
  getKycApplicationById(id: string): Promise<KycApplication | undefined>;
  getKycByClientUsername(username: string): Promise<KycApplication | undefined>;
  createKycApplication(kyc: InsertKyc): Promise<KycApplication>;
  updateKycStatus(id: string, status: string, reviewNotes?: string, category?: string, products?: string): Promise<KycApplication>;
  updateKycClientCredentials(id: string, clientUsername: string, clientPassword: string): Promise<KycApplication>;

  getTrades(): Promise<Trade[]>;
  getTradeById(id: string): Promise<Trade | undefined>;
  updateTradeStatus(id: string, status: string): Promise<Trade>;
  updateStageDocuments(id: string, stageDocuments: Record<string, boolean>): Promise<Trade>;
  createTrade(trade: any): Promise<Trade>;
  createPreDealTrade(tradeInput: any): Promise<Trade>;
  mintTradeBlock(tradeId: string, newStatus: string, generateTradeHashFn: Function, mineBlockFn: Function, genesisHash: string): Promise<Trade>;
  mintKycBlock(kycId: string, generateKycHashFn: Function, mineBlockFn: Function, genesisHash: string): Promise<KycApplication>;

  getBlocks(): Promise<Block[]>;
  getLatestBlock(): Promise<Block | undefined>;
  createBlock(block: InsertBlock): Promise<Block>;

  getDocuments(): Promise<Document[]>;
  getDocumentById(id: string): Promise<Document | undefined>;
  createDocument(doc: InsertDocument): Promise<Document>;
  updateDocument(id: string, data: Partial<InsertDocument>): Promise<Document>;

  getKycDocuments(documentType?: string): Promise<KycDocument[]>;
  getKycDocumentsByApplicationId(kycApplicationId: string): Promise<KycDocument[]>;
  createKycDocument(doc: InsertKycDocument): Promise<KycDocument>;
  deleteKycDocument(id: string): Promise<void>;
  linkKycDocumentsToApplication(kycApplicationId: string, documentIds: string[]): Promise<void>;

  getAllTradeDocuments(): Promise<TradeDocument[]>;
  getTradeDocuments(tradeId: string): Promise<TradeDocument[]>;
  getTradeDocumentById(id: string): Promise<TradeDocument | undefined>;
  createTradeDocument(doc: InsertTradeDocument): Promise<TradeDocument>;
  deleteTradeDocument(id: string): Promise<void>;

  executeTrade(
    tradeInput: any,
    generateTradeHash: Function,
    mineBlock: Function,
    genesisHash: string
  ): Promise<Trade>;

  getKycChangeRequests(): Promise<KycChangeRequest[]>;
  getKycChangeRequestsByApplicationId(kycApplicationId: string): Promise<KycChangeRequest[]>;
  createKycChangeRequest(req: InsertKycChangeRequest): Promise<KycChangeRequest>;
  updateKycChangeRequestStatus(id: string, status: string, adminNotes?: string): Promise<KycChangeRequest>;
  approveAndApplyChangeRequest(id: string, adminNotes?: string): Promise<KycApplication>;
  updateKycApplicationFields(id: string, fields: Record<string, any>): Promise<KycApplication>;

  getTradeEnquiries(): Promise<TradeEnquiry[]>;
  getTradeEnquiryById(id: string): Promise<TradeEnquiry | undefined>;
  createTradeEnquiry(enquiry: InsertTradeEnquiry): Promise<TradeEnquiry>;
  updateTradeEnquiryStatus(id: string, status: string): Promise<TradeEnquiry>;
  deleteTradeEnquiry(id: string): Promise<void>;

  updateTradeEnquiryClientResponse(id: string, response: string, respondedBy: string): Promise<TradeEnquiry>;

  getTradeEnquiryDocuments(enquiryId: string): Promise<TradeEnquiryDocument[]>;
  getTradeEnquiryDocumentById(id: string): Promise<TradeEnquiryDocument | undefined>;
  createTradeEnquiryDocument(doc: InsertTradeEnquiryDocument): Promise<TradeEnquiryDocument>;
  deleteTradeEnquiryDocument(id: string): Promise<TradeEnquiryDocument | undefined>;

  getRegistrations(): Promise<Registration[]>;
  createRegistration(reg: InsertRegistration): Promise<Registration>;
  updateRegistrationStatus(id: string, status: string): Promise<Registration>;
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

  async getKycApplicationById(id: string): Promise<KycApplication | undefined> {
    const [kyc] = await db.select().from(kycApplications).where(eq(kycApplications.id, id));
    return kyc;
  }

  async getKycByClientUsername(username: string): Promise<KycApplication | undefined> {
    const [kyc] = await db.select().from(kycApplications).where(eq(kycApplications.clientUsername, username));
    return kyc;
  }

  async createKycApplication(kyc: InsertKyc): Promise<KycApplication> {
    const [created] = await db.insert(kycApplications).values(kyc).returning();
    return created;
  }

  async updateKycClientCredentials(id: string, clientUsername: string, clientPassword: string): Promise<KycApplication> {
    const [updated] = await db.update(kycApplications).set({ clientUsername, clientPassword }).where(eq(kycApplications.id, id)).returning();
    return updated;
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

  async getTradeById(id: string): Promise<Trade | undefined> {
    const [trade] = await db.select().from(trades).where(eq(trades.id, id));
    return trade;
  }

  async updateTradeStatus(id: string, status: string): Promise<Trade> {
    const [updated] = await db.update(trades).set({ status }).where(eq(trades.id, id)).returning();
    return updated;
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

  async getDocumentById(id: string): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    return doc;
  }

  async createDocument(doc: InsertDocument): Promise<Document> {
    const [created] = await db.insert(documents).values(doc).returning();
    return created;
  }

  async updateDocument(id: string, data: Partial<InsertDocument>): Promise<Document> {
    const [updated] = await db.update(documents).set(data).where(eq(documents.id, id)).returning();
    return updated;
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
      const txDb = drizzle(client);

      const [trade] = await txDb.select().from(trades).where(eq(trades.id, tradeId));
      if (!trade) throw new Error("Trade not found");
      if (trade.status !== "pre_deal") throw new Error("Trade is not in pre_deal stage");
      if (trade.blockchainHash) throw new Error("Trade already has a blockchain record");

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

      await txDb.insert(blocks).values({
        blockNumber,
        hash: blockHash,
        previousHash,
        nonce,
        tradeCount: 1,
        verified: true,
        timestamp: new Date(timestamp),
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
  async mintKycBlock(
    kycId: string,
    generateKycHashFn: Function,
    mineBlockFn: Function,
    genesisHash: string
  ): Promise<KycApplication> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txDb = drizzle(client);

      const [kyc] = await txDb.select().from(kycApplications).where(eq(kycApplications.id, kycId));
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

  async approveAndApplyChangeRequest(id: string, adminNotes?: string): Promise<KycApplication> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txDb = drizzle(client);

      const [changeReq] = await txDb.select().from(kycChangeRequests).where(eq(kycChangeRequests.id, id));
      if (!changeReq) throw new Error("Change request not found");
      if (changeReq.status !== "pending") throw new Error("Change request is no longer pending");

      const fields = changeReq.changedFields as Record<string, any>;
      const [updated] = await txDb.update(kycApplications).set(fields).where(eq(kycApplications.id, changeReq.kycApplicationId)).returning();

      await txDb.update(kycChangeRequests).set({
        status: "approved",
        adminNotes: adminNotes || null,
        reviewedAt: new Date(),
      }).where(eq(kycChangeRequests.id, id));

      await client.query("COMMIT");
      return updated;
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

  async getTradeEnquiries(): Promise<TradeEnquiry[]> {
    return db.select().from(tradeEnquiries).orderBy(desc(tradeEnquiries.createdAt));
  }

  async getTradeEnquiryById(id: string): Promise<TradeEnquiry | undefined> {
    const [enquiry] = await db.select().from(tradeEnquiries).where(eq(tradeEnquiries.id, id));
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

  async updateTradeEnquiryStatus(id: string, status: string): Promise<TradeEnquiry> {
    const [updated] = await db.update(tradeEnquiries).set({ status }).where(eq(tradeEnquiries.id, id)).returning();
    return updated;
  }

  async updateTradeEnquiryClientResponse(id: string, response: string, respondedBy: string): Promise<TradeEnquiry> {
    const [updated] = await db.update(tradeEnquiries)
      .set({ clientResponse: response, clientRespondedBy: respondedBy, clientRespondedAt: new Date() })
      .where(eq(tradeEnquiries.id, id))
      .returning();
    return updated;
  }

  async deleteTradeEnquiry(id: string): Promise<void> {
    await db.delete(tradeEnquiryDocuments).where(eq(tradeEnquiryDocuments.enquiryId, id));
    await db.delete(tradeEnquiries).where(eq(tradeEnquiries.id, id));
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

  async getRegistrations(): Promise<Registration[]> {
    return db.select().from(registrations).orderBy(desc(registrations.createdAt));
  }

  async createRegistration(reg: InsertRegistration): Promise<Registration> {
    const [created] = await db.insert(registrations).values(reg).returning();
    return created;
  }

  async updateRegistrationStatus(id: string, status: string): Promise<Registration> {
    const [updated] = await db.update(registrations).set({ status }).where(eq(registrations.id, id)).returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
