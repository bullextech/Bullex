import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  users,
  assets,
  trades,
  blocks,
  type User,
  type InsertUser,
  type Asset,
  type InsertAsset,
  type Trade,
  type InsertTrade,
  type Block,
  type InsertBlock,
} from "@shared/schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getAssets(): Promise<Asset[]>;
  getAssetBySymbol(symbol: string): Promise<Asset | undefined>;
  upsertAsset(asset: InsertAsset): Promise<Asset>;
  updateAsset(id: string, data: Partial<InsertAsset>): Promise<Asset>;

  getTrades(): Promise<Trade[]>;
  getTradeById(id: string): Promise<Trade | undefined>;
  createTrade(trade: any): Promise<Trade>;

  getBlocks(): Promise<Block[]>;
  getLatestBlock(): Promise<Block | undefined>;
  createBlock(block: InsertBlock): Promise<Block>;
  getBlockCount(): Promise<number>;

  executeTrade(
    tradeInput: { assetSymbol: string; assetName: string; type: string; quantity: number; price: number; total: number },
    generateTradeHash: (id: string, symbol: string, type: string, qty: number, price: number, ts: string) => string,
    mineBlock: (bn: number, ph: string, ts: string, td: string, diff?: number) => { hash: string; nonce: number },
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

  async getAssets(): Promise<Asset[]> {
    return db.select().from(assets);
  }

  async getAssetBySymbol(symbol: string): Promise<Asset | undefined> {
    const [asset] = await db.select().from(assets).where(eq(assets.symbol, symbol));
    return asset;
  }

  async upsertAsset(asset: InsertAsset): Promise<Asset> {
    const existing = await this.getAssetBySymbol(asset.symbol);
    if (existing) {
      const newQuantity = existing.quantity + (asset.quantity || 0);
      const newAvg =
        newQuantity > 0
          ? (existing.quantity * existing.avgBuyPrice +
              (asset.quantity || 0) * (asset.avgBuyPrice || 0)) /
            newQuantity
          : 0;
      const [updated] = await db
        .update(assets)
        .set({
          quantity: newQuantity,
          avgBuyPrice: newAvg,
          currentPrice: asset.currentPrice || existing.currentPrice,
          name: asset.name,
        })
        .where(eq(assets.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(assets).values(asset).returning();
    return created;
  }

  async updateAsset(id: string, data: Partial<InsertAsset>): Promise<Asset> {
    const [updated] = await db.update(assets).set(data).where(eq(assets.id, id)).returning();
    return updated;
  }

  async getTrades(): Promise<Trade[]> {
    return db.select().from(trades).orderBy(desc(trades.createdAt));
  }

  async getTradeById(id: string): Promise<Trade | undefined> {
    const [trade] = await db.select().from(trades).where(eq(trades.id, id));
    return trade;
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

  async getBlockCount(): Promise<number> {
    const result = await db.select().from(blocks);
    return result.length;
  }

  async executeTrade(
    tradeInput: { assetSymbol: string; assetName: string; type: string; quantity: number; price: number; total: number },
    generateTradeHashFn: (id: string, symbol: string, type: string, qty: number, price: number, ts: string) => string,
    mineBlockFn: (bn: number, ph: string, ts: string, td: string, diff?: number) => { hash: string; nonce: number },
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

      const tradeHash = generateTradeHashFn(
        `${Date.now()}`,
        tradeInput.assetSymbol,
        tradeInput.type,
        tradeInput.quantity,
        tradeInput.price,
        timestamp
      );

      const tradeData = `${tradeInput.assetSymbol}:${tradeInput.type}:${tradeInput.quantity}:${tradeInput.price}:${tradeHash}`;
      const { hash: blockHash, nonce } = mineBlockFn(blockNumber, previousHash, timestamp, tradeData, 2);

      const [trade] = await txDb.insert(trades).values({
        assetSymbol: tradeInput.assetSymbol,
        assetName: tradeInput.assetName,
        type: tradeInput.type,
        quantity: tradeInput.quantity,
        price: tradeInput.price,
        total: tradeInput.total,
        status: "confirmed",
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

      if (tradeInput.type === "buy") {
        const [existing] = await txDb.select().from(assets).where(eq(assets.symbol, tradeInput.assetSymbol));
        if (existing) {
          const newQuantity = existing.quantity + tradeInput.quantity;
          const newAvg = (existing.quantity * existing.avgBuyPrice + tradeInput.quantity * tradeInput.price) / newQuantity;
          await txDb.update(assets).set({
            quantity: newQuantity,
            avgBuyPrice: newAvg,
            currentPrice: tradeInput.price,
            name: tradeInput.assetName,
          }).where(eq(assets.id, existing.id));
        } else {
          await txDb.insert(assets).values({
            symbol: tradeInput.assetSymbol,
            name: tradeInput.assetName,
            quantity: tradeInput.quantity,
            avgBuyPrice: tradeInput.price,
            currentPrice: tradeInput.price,
            change24h: 0,
          });
        }
      } else {
        const [existing] = await txDb.select().from(assets).where(eq(assets.symbol, tradeInput.assetSymbol));
        if (existing) {
          const newQty = existing.quantity - tradeInput.quantity;
          await txDb.update(assets).set({
            quantity: newQty,
            currentPrice: tradeInput.price,
          }).where(eq(assets.id, existing.id));
        }
      }

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
