import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, doublePrecision, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
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
  primaryBusinessAddress: text("primary_business_address"),
  dateOfIncorporation: text("date_of_incorporation").notNull(),
  countryOfIncorporation: text("country_of_incorporation").notNull(),
  countryOfOperation: text("country_of_operation"),
  registrationNumber: text("registration_number").notNull(),
  taxIdNumber: text("tax_id_number"),
  businessType: text("business_type"),
  coreBusinessDescription: text("core_business_description"),
  ultimateBeneficialOwners: text("ultimate_beneficial_owners"),
  shareholders: text("shareholders"),
  managementStructure: text("management_structure"),
  subsidiaries: text("subsidiaries"),
  listingInfo: text("listing_info"),
  shareCapital: text("share_capital"),
  capitalRange: text("capital_range"),
  financialCurrency: text("financial_currency"),
  salesRevenue: text("sales_revenue"),
  netIncome: text("net_income"),
  totalEquity: text("total_equity"),
  totalBalanceSheet: text("total_balance_sheet"),
  lastReportingPeriod: text("last_reporting_period"),
  externalAuditors: text("external_auditors"),
  bankName: text("bank_name"),
  bankBranch: text("bank_branch"),
  bankAddress: text("bank_address"),
  accountName: text("account_name"),
  accountNumber: text("account_number"),
  swiftCode: text("swift_code"),
  bankAccountCurrency: text("bank_account_currency"),
  bankOfficerName: text("bank_officer_name"),
  bankOfficerEmail: text("bank_officer_email"),
  employeesCompany: text("employees_company"),
  employeesGroup: text("employees_group"),
  previousBullfrogEmployee: text("previous_bullfrog_employee"),
  amlSubject: text("aml_subject"),
  amlConformityProgram: text("aml_conformity_program"),
  amlRegulator: text("aml_regulator"),
  amlLawName: text("aml_law_name"),
  documentReasons: text("document_reasons"),
  contactName: text("contact_name").notNull(),
  contactTitle: text("contact_title").notNull(),
  contactPhone: text("contact_phone").notNull(),
  contactEmail: text("contact_email").notNull(),
  faxNumber: text("fax_number"),
  website: text("website"),
  signatoryName: text("signatory_name"),
  signatoryTitle: text("signatory_title"),
  signatoryCompany: text("signatory_company"),
  signatoryEmail: text("signatory_email"),
  signatoryPlaceDate: text("signatory_place_date"),
  filledByName: text("filled_by_name"),
  filledByEmail: text("filled_by_email"),
  clientUsername: text("client_username"),
  clientPassword: text("client_password"),
  status: text("status").notNull().default("pending"),
  category: text("category"),
  products: text("products"),
  reviewNotes: text("review_notes"),
  blockchainHash: text("blockchain_hash"),
  previousHash: text("previous_hash"),
  blockNumber: integer("block_number"),
  nonce: integer("nonce"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeRef: text("trade_ref").notNull().unique(),
  commodity: text("commodity").notNull(),
  commodityCategory: text("commodity_category").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  unit: text("unit").notNull().default("MT"),
  pricePerUnit: doublePrecision("price_per_unit").notNull(),
  totalValue: doublePrecision("total_value").notNull(),
  currency: text("currency").notNull().default("USD"),
  buyerName: text("buyer_name").notNull(),
  sellerName: text("seller_name").notNull(),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  incoterm: text("incoterm").notNull().default("CIF"),
  status: text("status").notNull().default("pre_deal"),
  stageDocuments: jsonb("stage_documents").default({}),
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
  dataType: text("data_type").notNull().default("trade"),
  dataId: text("data_id"),
  dataSummary: text("data_summary"),
});

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeRef: text("trade_ref"),
  docType: text("doc_type").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  status: text("status").notNull().default("draft"),
  docxPath: text("docx_path"),
  pdfPath: text("pdf_path"),
  buyerEmail: text("buyer_email"),
  sellerEmail: text("seller_email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const kycDocuments = pgTable("kyc_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kycApplicationId: varchar("kyc_application_id"),
  documentType: text("document_type").notNull(),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const insertKycDocumentSchema = createInsertSchema(kycDocuments).omit({
  id: true,
  uploadedAt: true,
});

export const kycChangeRequests = pgTable("kyc_change_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kycApplicationId: varchar("kyc_application_id").notNull(),
  changedFields: jsonb("changed_fields").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
});

export const insertKycChangeRequestSchema = createInsertSchema(kycChangeRequests).omit({
  id: true,
  status: true,
  adminNotes: true,
  createdAt: true,
  reviewedAt: true,
});

export const tradeDocuments = pgTable("trade_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeId: varchar("trade_id").notNull(),
  documentKey: text("document_key").notNull(),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const insertTradeDocumentSchema = createInsertSchema(tradeDocuments).omit({
  id: true,
  uploadedAt: true,
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertKycSchema = createInsertSchema(kycApplications).omit({
  id: true,
  status: true,
  reviewNotes: true,
  blockchainHash: true,
  previousHash: true,
  blockNumber: true,
  nonce: true,
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
  stageDocuments: true,
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
export type KycDocument = typeof kycDocuments.$inferSelect;
export type InsertKycDocument = z.infer<typeof insertKycDocumentSchema>;
export type TradeDocument = typeof tradeDocuments.$inferSelect;
export type InsertTradeDocument = z.infer<typeof insertTradeDocumentSchema>;
export type KycChangeRequest = typeof kycChangeRequests.$inferSelect;
export type InsertKycChangeRequest = z.infer<typeof insertKycChangeRequestSchema>;
