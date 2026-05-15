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
  submittedByTeamMemberId: varchar("submitted_by_team_member_id"),
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
  enquiryRef: text("enquiry_ref"),
  specifications: text("specifications"),
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
  enquiryRef: text("enquiry_ref"),
  docType: text("doc_type").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  status: text("status").notNull().default("draft"),
  adminChecks: jsonb("admin_checks"),
  adminReviewNotes: text("admin_review_notes"),
  docxPath: text("docx_path"),
  pdfPath: text("pdf_path"),
  buyerEmail: text("buyer_email"),
  sellerEmail: text("seller_email"),
  buyerSignature: text("buyer_signature"),
  sellerSignature: text("seller_signature"),
  buyerSignedAt: timestamp("buyer_signed_at"),
  sellerSignedAt: timestamp("seller_signed_at"),
  buyerSignedName: text("buyer_signed_name"),
  sellerSignedName: text("seller_signed_name"),
  issueNumber: text("issue_number"),
  dealRecapNumber: text("deal_recap_number"),
  sentTo: text("sent_to"),
  sentToClientId: text("sent_to_client_id"),
  recipientResponse: text("recipient_response"),
  recipientRespondedAt: timestamp("recipient_responded_at"),
  recipientAmendmentNotes: text("recipient_amendment_notes"),
  parentDocId: text("parent_doc_id"),
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

export const tradeEnquiries = pgTable("trade_enquiries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enquiryRef: text("enquiry_ref").notNull().unique(),
  side: text("side").notNull().default("buy"),
  product: text("product").notNull(),
  specifications: text("specifications"),
  producer: text("producer"),
  quantity: text("quantity"),
  unit: text("unit").default("MT"),
  loadingPort: text("loading_port"),
  incoterms: text("incoterms"),
  validity: text("validity"),
  additionalInfo: text("additional_info"),
  createdBy: text("created_by"),
  email: text("email"),
  status: text("status").notNull().default("active"),
  clientResponse: text("client_response"),
  clientRespondedBy: text("client_responded_by"),
  clientRespondedAt: timestamp("client_responded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // LOI template fields
  origin: text("origin"),
  deliveryPeriod: text("delivery_period"),
  price: text("price"),
  currency: text("currency").default("USD"),
  paymentTerms: text("payment_terms"),
  sellerName: text("seller_name"),
  sellerAddress: text("seller_address"),
  sellerContact: text("seller_contact"),
  buyerName: text("buyer_name"),
  buyerAddress: text("buyer_address"),
  buyerContact: text("buyer_contact"),
  dischargePort: text("discharge_port"),
  refPerson: text("ref_person"),
  contractConfirmation: text("contract_confirmation"),
  docsForPayment: text("docs_for_payment"),
  otherTerms: text("other_terms"),
  compliance: text("compliance"),
  performanceBond: text("performance_bond"),
  linkedTradeRef: text("linked_trade_ref"),
  submittedByTeamMemberId: varchar("submitted_by_team_member_id"),
});

export const enquiryChangeRequests = pgTable("enquiry_change_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enquiryId: varchar("enquiry_id").notNull(),
  changedFields: jsonb("changed_fields").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
});

export const insertEnquiryChangeRequestSchema = createInsertSchema(enquiryChangeRequests).omit({
  id: true,
  status: true,
  adminNotes: true,
  createdAt: true,
  reviewedAt: true,
});
export type EnquiryChangeRequest = typeof enquiryChangeRequests.$inferSelect;
export type InsertEnquiryChangeRequest = z.infer<typeof insertEnquiryChangeRequestSchema>;

export const tradeEnquiryDocuments = pgTable("trade_enquiry_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enquiryId: varchar("enquiry_id").notNull(),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const insertTradeEnquirySchema = createInsertSchema(tradeEnquiries).omit({
  id: true,
  enquiryRef: true,
  status: true,
  createdAt: true,
});

export const insertTradeEnquiryDocumentSchema = createInsertSchema(tradeEnquiryDocuments).omit({
  id: true,
  uploadedAt: true,
});

export const registrations = pgTable("registrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  companyName: text("company_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  country: text("country").notNull(),
  roleType: text("role_type").notNull(),
  commodities: text("commodities"),
  message: text("message"),
  status: text("status").notNull().default("pending"),
  reviewNotes: text("review_notes"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRegistrationSchema = createInsertSchema(registrations).omit({
  id: true,
  status: true,
  createdAt: true,
});

export type Registration = typeof registrations.$inferSelect;
export type InsertRegistration = z.infer<typeof insertRegistrationSchema>;

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

export const teamKycApplications = pgTable("team_kyc_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  dateOfBirth: text("date_of_birth"),
  gender: text("gender"),
  nationality: text("nationality"),
  passportNumber: text("passport_number"),
  maritalStatus: text("marital_status"),
  email: text("email").notNull(),
  phone: text("phone"),
  homeAddress: text("home_address"),
  city: text("city"),
  country: text("country"),
  positionApplied: text("position_applied"),
  department: text("department"),
  employmentType: text("employment_type"),
  expectedStartDate: text("expected_start_date"),
  highestQualification: text("highest_qualification"),
  institution: text("institution"),
  graduationYear: text("graduation_year"),
  previousEmployer: text("previous_employer"),
  previousRole: text("previous_role"),
  yearsExperience: text("years_experience"),
  emergencyName: text("emergency_name"),
  emergencyRelationship: text("emergency_relationship"),
  emergencyPhone: text("emergency_phone"),
  bankName: text("bank_name"),
  bankBranch: text("bank_branch"),
  payrollAccountName: text("payroll_account_name"),
  payrollAccountNumber: text("payroll_account_number"),
  payrollSwift: text("payroll_swift"),
  additionalNotes: text("additional_notes"),
  declarationAgreed: boolean("declaration_agreed"),
  declarationName: text("declaration_name"),
  declarationDate: text("declaration_date"),
  photoStoredName: text("photo_stored_name"),
  photoOriginalName: text("photo_original_name"),
  status: text("status").notNull().default("pending"),
  reviewNotes: text("review_notes"),
  teamUsername: text("team_username"),
  teamPassword: text("team_password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeamKycSchema = createInsertSchema(teamKycApplications).omit({
  id: true,
  status: true,
  reviewNotes: true,
  teamUsername: true,
  teamPassword: true,
  createdAt: true,
});
export type InsertTeamKyc = z.infer<typeof insertTeamKycSchema>;
export type TeamKycApplication = typeof teamKycApplications.$inferSelect;

export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  department: text("department"),
  email: text("email"),
  dateOfBirth: text("date_of_birth"),
  gender: text("gender"),
  nationality: text("nationality"),
  passportNumber: text("passport_number"),
  maritalStatus: text("marital_status"),
  phone: text("phone"),
  homeAddress: text("home_address"),
  city: text("city"),
  country: text("country"),
  position: text("position"),
  employmentType: text("employment_type"),
  startDate: text("start_date"),
  highestQualification: text("highest_qualification"),
  institution: text("institution"),
  graduationYear: text("graduation_year"),
  previousEmployer: text("previous_employer"),
  previousRole: text("previous_role"),
  yearsExperience: text("years_experience"),
  emergencyName: text("emergency_name"),
  emergencyRelationship: text("emergency_relationship"),
  emergencyPhone: text("emergency_phone"),
  bankName: text("bank_name"),
  bankBranch: text("bank_branch"),
  payrollAccountName: text("payroll_account_name"),
  payrollAccountNumber: text("payroll_account_number"),
  payrollSwift: text("payroll_swift"),
  photoStoredName: text("photo_stored_name"),
  additionalNotes: text("additional_notes"),
  allowedModules: text("allowed_modules").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({ id: true, createdAt: true });
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;

export const teamMemberDocuments = pgTable("team_member_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull(),
  docType: text("doc_type").notNull(),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const insertTeamMemberDocumentSchema = createInsertSchema(teamMemberDocuments).omit({ id: true, uploadedAt: true });
export type InsertTeamMemberDocument = z.infer<typeof insertTeamMemberDocumentSchema>;
export type TeamMemberDocument = typeof teamMemberDocuments.$inferSelect;

export const teamKycDocuments = pgTable("team_kyc_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar("application_id").notNull(),
  docType: text("doc_type").notNull(),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const insertTeamKycDocumentSchema = createInsertSchema(teamKycDocuments).omit({ id: true, uploadedAt: true });
export type InsertTeamKycDocument = z.infer<typeof insertTeamKycDocumentSchema>;
export type TeamKycDocument = typeof teamKycDocuments.$inferSelect;

export const teamTasks = pgTable("team_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("todo"),
  assignee: text("assignee"),
  dueDate: text("due_date"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTeamTaskSchema = createInsertSchema(teamTasks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTeamTask = z.infer<typeof insertTeamTaskSchema>;
export type TeamTask = typeof teamTasks.$inferSelect;

export const taskUpdates = pgTable("task_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull(),
  author: text("author").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTaskUpdateSchema = createInsertSchema(taskUpdates).omit({ id: true, createdAt: true });
export type InsertTaskUpdate = z.infer<typeof insertTaskUpdateSchema>;
export type TaskUpdate = typeof taskUpdates.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
// TeamKycApplication types already defined above
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
export type TradeEnquiry = typeof tradeEnquiries.$inferSelect;
export type InsertTradeEnquiry = z.infer<typeof insertTradeEnquirySchema>;
export type TradeEnquiryDocument = typeof tradeEnquiryDocuments.$inferSelect;
export type InsertTradeEnquiryDocument = z.infer<typeof insertTradeEnquiryDocumentSchema>;
