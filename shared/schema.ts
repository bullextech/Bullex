import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const assets = pgTable("assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  quantity: real("quantity").notNull().default(0),
  avgBuyPrice: real("avg_buy_price").notNull().default(0),
  currentPrice: real("current_price").notNull().default(0),
  change24h: real("change_24h").notNull().default(0),
});

export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetSymbol: text("asset_symbol").notNull(),
  assetName: text("asset_name").notNull(),
  type: text("type").notNull(),
  quantity: real("quantity").notNull(),
  price: real("price").notNull(),
  total: real("total").notNull(),
  status: text("status").notNull().default("confirmed"),
  blockchainHash: text("blockchain_hash"),
  previousHash: text("previous_hash"),
  blockNumber: integer("block_number"),
  nonce: integer("nonce"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const blocks = pgTable("blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  blockNumber: integer("block_number").notNull().unique(),
  hash: text("hash").notNull(),
  previousHash: text("previous_hash").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  nonce: integer("nonce").notNull().default(0),
  tradeCount: integer("trade_count").notNull().default(0),
  verified: boolean("verified").notNull().default(true),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertAssetSchema = createInsertSchema(assets).omit({ id: true });

export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  blockchainHash: true,
  previousHash: true,
  blockNumber: true,
  nonce: true,
  createdAt: true,
  status: true,
}).extend({
  type: z.enum(["buy", "sell"]),
});

export const insertBlockSchema = createInsertSchema(blocks).omit({ id: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Trade = typeof trades.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Block = typeof blocks.$inferSelect;
export type InsertBlock = z.infer<typeof insertBlockSchema>;
