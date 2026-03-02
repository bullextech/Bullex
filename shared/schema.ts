import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const kycApplications = pgTable("kyc_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull(),
  registeredAddress: text("registered_address").notNull(),
  businessAddress: text("business_address"),
  contactPerson: text("contact_person").notNull(),
  contactTitle: text("contact_title").notNull(),
  phone: text("phone").notNull(),
  fax: text("fax"),
  email: text("email").notNull(),
  website: text("website"),
  dateOfIncorporation: text("date_of_incorporation").notNull(),
  countryOfIncorporation: text("country_of_incorporation").notNull(),
  countryOfOperation: text("country_of_operation"),
  businessRegNumber: text("business_reg_number").notNull(),
  taxId: text("tax_id"),
  businessType: text("business_type"),
  businessDescription: text("business_description"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeRef: text("trade_ref").notNull().unique(),
  commodity: text("commodity").notNull(),
  commodityCategory: text("commodity_category").notNull(),
  quantity: real("quantity").notNull(),
  unit: text("unit").notNull().default("MT"),
  pricePerUnit: real("price_per_unit").notNull(),
  totalValue: real("total_value").notNull(),
  currency: text("currency").notNull().default("USD"),
  buyerName: text("buyer_name").notNull(),
  sellerName: text("seller_name").notNull(),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  incoterm: text("incoterm").notNull().default("CIF"),
  status: text("status").notNull().default("initiated"),
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

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeRef: text("trade_ref"),
  docType: text("doc_type").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertKycSchema = createInsertSchema(kycApplications).omit({
  id: true,
  status: true,
  createdAt: true,
});

export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  tradeRef: true,
  blockchainHash: true,
  previousHash: true,
  blockNumber: true,
  nonce: true,
  createdAt: true,
  status: true,
});

export const insertBlockSchema = createInsertSchema(blocks).omit({ id: true });

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type KycApplication = typeof kycApplications.$inferSelect;
export type InsertKyc = z.infer<typeof insertKycSchema>;
export type Trade = typeof trades.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Block = typeof blocks.$inferSelect;
export type InsertBlock = z.infer<typeof insertBlockSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
