import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  users,
  kycApplications,
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
  createKycApplication(kyc: InsertKyc): Promise<KycApplication>;

  getTrades(): Promise<Trade[]>;
  createTrade(trade: any): Promise<Trade>;

  getBlocks(): Promise<Block[]>;
  getLatestBlock(): Promise<Block | undefined>;
  createBlock(block: InsertBlock): Promise<Block>;

  getDocuments(): Promise<Document[]>;
  createDocument(doc: InsertDocument): Promise<Document>;

  executeTrade(
    tradeInput: any,
    generateTradeHash: Function,
    mineBlock: Function,
    genesisHash: string
  ): Promise<Trade>;
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

  async createKycApplication(kyc: InsertKyc): Promise<KycApplication> {
    const [created] = await db.insert(kycApplications).values(kyc).returning();
    return created;
  }

  async getTrades(): Promise<Trade[]> {
    return db.select().from(trades).orderBy(desc(trades.createdAt));
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

  async createDocument(doc: InsertDocument): Promise<Document> {
    const [created] = await db.insert(documents).values(doc).returning();
    return created;
  }

  async executeTrade(
    tradeInput: any,
    generateTradeHashFn: Function,
    mineBlockFn: Function,
    genesisHash: string
  ): Promise<Trade> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txDb = drizzle(client);

      const [latestBlock] = await txDb.select().from(blocks).orderBy(desc(blocks.blockNumber)).limit(1);
      const previousHash = latestBlock ? latestBlock.hash : genesisHash;
      const blockNumber = latestBlock ? latestBlock.blockNumber + 1 : 1;
      const timestamp = new Date().toISOString();

      const year = new Date().getFullYear();
      const hexSuffix = Math.random().toString(16).slice(2, 6).toUpperCase();
      const tradeRef = `BFG-${year}-${hexSuffix}`;

      const tradeHash = generateTradeHashFn(
        tradeRef,
        tradeInput.commodity,
        tradeInput.commodityCategory,
        tradeInput.quantity,
        tradeInput.pricePerUnit,
        timestamp
      );

      const tradeData = `${tradeRef}:${tradeInput.commodity}:${tradeInput.quantity}:${tradeInput.pricePerUnit}:${tradeHash}`;
      const { hash: blockHash, nonce } = mineBlockFn(blockNumber, previousHash, timestamp, tradeData, 2);

      const [trade] = await txDb.insert(trades).values({
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
        status: "initiated",
        blockchainHash: tradeHash,
        previousHash,
        blockNumber,
        nonce,
      }).returning();

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
      return trade;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const storage = new DatabaseStorage();
