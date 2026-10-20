import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, doublePrecision, timestamp, boolean, jsonb, json, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session store table managed by connect-pg-simple (createTableIfMissing:false, so
// it is NOT auto-created at runtime). Declared here only so drizzle-kit treats it as
// a managed table and never proposes dropping it during `db:push` — dropping it would
// wipe all active sessions and break login. Structure must match connect-pg-simple's.
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6, mode: "date" }).notNull(),
}, (table) => [
  index("IDX_session_expire").on(table.expire),
]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// A single bank account on a KYC application. The applicant's primary bank
// stays in the flat bank* columns (bank #1, backward-compatible); any further
// banks are stored in the additionalBanks JSONB array.
export const bankEntrySchema = z.object({
  bankName: z.string().default(""),
  bankBranch: z.string().default(""),
  bankAddress: z.string().default(""),
  accountName: z.string().default(""),
  accountNumber: z.string().default(""),
  swiftCode: z.string().default(""),
  bankAccountCurrency: z.string().default(""),
  bankOfficerName: z.string().default(""),
  bankOfficerEmail: z.string().default(""),
});
export type BankEntry = z.infer<typeof bankEntrySchema>;

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
  additionalBanks: jsonb("additional_banks").$type<BankEntry[]>().default([]),
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
  clientUsername: text("client_username").unique(),
  clientPassword: text("client_password"),
  participantId: text("participant_id").unique(),
  status: text("status").notNull().default("pending"),
  category: text("category"),
  products: text("products"),
  reviewNotes: text("review_notes"),
  blockchainHash: text("blockchain_hash"),
  previousHash: text("previous_hash"),
  blockNumber: integer("block_number"),
  nonce: integer("nonce"),
  submittedByTeamMemberId: varchar("submitted_by_team_member_id"),
  amlStatus: text("aml_status").notNull().default("not_run"),
  amlMatches: jsonb("aml_matches"),
  amlCheckedAt: timestamp("aml_checked_at"),
  amlCheckedBy: text("aml_checked_by"),
  amlNotes: text("aml_notes"),
  ofacStatus: text("ofac_status").notNull().default("not_run"),
  ofacMatches: jsonb("ofac_matches"),
  unSanctionsStatus: text("un_sanctions_status").notNull().default("not_run"),
  unSanctionsMatches: jsonb("un_sanctions_matches"),
  pepStatus: text("pep_status").notNull().default("not_run"),
  pepMatches: jsonb("pep_matches"),
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
  submittedByTeamMemberId: varchar("submitted_by_team_member_id"),
  buyerKycId: varchar("buyer_kyc_id"),
  sellerKycId: varchar("seller_kyc_id"),
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
  buyerSignedIp: text("buyer_signed_ip"),
  sellerSignedIp: text("seller_signed_ip"),
  issueNumber: text("issue_number"),
  dealRecapNumber: text("deal_recap_number"),
  sentTo: text("sent_to"),
  sentToClientId: text("sent_to_client_id"),
  recipientResponse: text("recipient_response"),
  recipientRespondedAt: timestamp("recipient_responded_at"),
  recipientAmendmentNotes: text("recipient_amendment_notes"),
  parentDocId: text("parent_doc_id"),
  // The legal identifier of an SPA addendum is distinct from its editable
  // rendered text. It is normalized and unique per parent SPA.
  addendumNumber: text("addendum_number"),
  submittedByTeamMemberId: varchar("submitted_by_team_member_id"),
  submittedByClientId: varchar("submitted_by_client_id"),
  agentCode: text("agent_code"),
  teamMemberCode: text("team_member_code"),
  // Set when an admin replaces the FULL document text by hand (TFR "Edit Full
  // TFR"). A details save that would rebuild from the template keys its
  // confirmation guard off this flag — never off re-deriving the template
  // output, which drifts whenever enquiry data or the template changes.
  contentManuallyEdited: boolean("content_manually_edited").notNull().default(false),
  pendingContent: text("pending_content"),
  amendmentReason: text("amendment_reason"),
  amendmentRequestedBy: varchar("amendment_requested_by"),
  amendmentRequestedAt: timestamp("amendment_requested_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  // Equality filters first, then the client lists' newest-first ordering.
  // Keep status as a key (not a partial predicate) for parameterized plans.
  // PostgreSQL ORDER BY created_at DESC uses NULLS FIRST; match it explicitly
  // because Drizzle's index builder defaults to NULLS LAST, even for DESC.
  index("documents_sent_client_status_created_idx")
    .on(table.sentToClientId, table.status, table.createdAt.desc().nullsFirst()),
  index("documents_submitted_client_created_idx")
    .on(table.submittedByClientId, table.createdAt.desc().nullsFirst()),
  uniqueIndex("documents_parent_addendum_number_unique")
    .on(table.parentDocId, table.addendumNumber)
    .where(sql`${table.docType} = 'ADDENDUM' AND ${table.addendumNumber} IS NOT NULL`),
]);

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
  packing: text("packing"),
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
  // Optional joint parties — two companies acting together as seller/buyer
  coSellerName: text("co_seller_name"),
  coSellerAddress: text("co_seller_address"),
  coSellerContact: text("co_seller_contact"),
  coBuyerName: text("co_buyer_name"),
  coBuyerAddress: text("co_buyer_address"),
  coBuyerContact: text("co_buyer_contact"),
  dischargePort: text("discharge_port"),
  refPerson: text("ref_person"),
  contractConfirmation: text("contract_confirmation"),
  docsForPayment: text("docs_for_payment"),
  otherTerms: text("other_terms"),
  compliance: text("compliance"),
  performanceBond: text("performance_bond"),
  linkedTradeRef: text("linked_trade_ref"),
  submittedByTeamMemberId: varchar("submitted_by_team_member_id"),
  assignedToClientId: varchar("assigned_to_client_id"),
  submittedByClientId: varchar("submitted_by_client_id"),
  allocatedTeamMemberId: varchar("allocated_team_member_id"),
});

// --- Trade enquiry status: single source of truth ---
// All enquiry status values, grouped by meaning. Adding or renaming a status
// here updates the server matcher and every frontend badge/filter/counter that
// reads from these helpers, so they can never drift out of sync.
//
//   pending  — open / actionable; eligible to be paired into a deal. All
//              rendered as "Pending" in the UI.
//   accepted — already committed to a deal; no longer pairable.
//   terminal — closed / cancelled / rejected; no longer actionable.
export const ENQUIRY_STATUS_PENDING = ["active", "open", "under_review", "quoted"] as const;
export const ENQUIRY_STATUS_ACCEPTED = ["accepted"] as const;
export const ENQUIRY_STATUS_TERMINAL = ["closed", "cancelled", "rejected"] as const;

export const ENQUIRY_STATUSES = [
  ...ENQUIRY_STATUS_PENDING,
  ...ENQUIRY_STATUS_ACCEPTED,
  ...ENQUIRY_STATUS_TERMINAL,
] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

const ENQUIRY_PENDING_SET = new Set<string>(ENQUIRY_STATUS_PENDING);
const ENQUIRY_TERMINAL_SET = new Set<string>(ENQUIRY_STATUS_TERMINAL);

// Pending = open/actionable and eligible to be surfaced as a pairing candidate.
export function isEnquiryStatusPending(status: string): boolean {
  return ENQUIRY_PENDING_SET.has(status);
}
export function isEnquiryStatusAccepted(status: string): boolean {
  return status === "accepted";
}
export function isEnquiryStatusTerminal(status: string): boolean {
  return ENQUIRY_TERMINAL_SET.has(status);
}
// Active = not terminal (i.e. pending or accepted).
export function isEnquiryStatusActive(status: string): boolean {
  return !ENQUIRY_TERMINAL_SET.has(status);
}

// Bucket a raw status into the four display groups used for labels/colours.
export type EnquiryStatusBucket = "pending" | "accepted" | "rejected" | "closed";
export function enquiryStatusBucket(status: string): EnquiryStatusBucket {
  if (isEnquiryStatusPending(status)) return "pending";
  if (status === "accepted") return "accepted";
  if (status === "rejected") return "rejected";
  return "closed"; // closed / cancelled / unknown
}

export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatusBucket, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  closed: "Closed",
};

// Statuses an admin may manually assign via PATCH /api/trade-enquiries/:id/status.
// This is a deliberate, curated subset of ENQUIRY_STATUSES — the canonical
// pending state ("active") plus the committed ("accepted") and terminal
// ("rejected"/"closed") outcomes an admin acts on directly. The other pending
// variants (open/under_review/quoted) and "cancelled" are produced by automated
// flows, not manual overrides, so they are intentionally not assignable here.
// The `satisfies` constraint ties every entry back to a real status value, so
// renaming/removing one in the shared definition fails the build instead of
// silently letting this allowlist drift out of sync.
export const ENQUIRY_ASSIGNABLE_STATUSES = [
  "active",
  "accepted",
  "rejected",
  "closed",
] as const satisfies readonly EnquiryStatus[];

const ENQUIRY_ASSIGNABLE_SET = new Set<string>(ENQUIRY_ASSIGNABLE_STATUSES);
export function isAssignableEnquiryStatus(status: string): boolean {
  return ENQUIRY_ASSIGNABLE_SET.has(status);
}

// Details an enquiry must carry before an admin may ACCEPT it. An accepted
// enquiry feeds deal formation, TFRs and generated documents, so accepting one
// with blank commercial terms produces blank documents downstream. Returns
// human-readable labels of everything still missing (empty array = complete).
export function missingEnquiryAcceptanceDetails(e: {
  side?: string | null;
  quantity?: string | null;
  price?: string | null;
  incoterms?: string | null;
  buyerName?: string | null;
  sellerName?: string | null;
  origin?: string | null;
  loadingPort?: string | null;
  dischargePort?: string | null;
}): string[] {
  const blank = (v?: string | null) => !v || !v.trim();
  const missing: string[] = [];
  if (blank(e.quantity)) missing.push("Quantity");
  if (blank(e.price)) missing.push("Price");
  if (blank(e.incoterms)) missing.push("Incoterms");
  if (e.side === "buy") {
    if (blank(e.buyerName)) missing.push("Buyer name");
    if (blank(e.origin) && blank(e.loadingPort)) missing.push("Origin or loading port");
  } else {
    if (blank(e.sellerName)) missing.push("Seller name");
    if (blank(e.dischargePort)) missing.push("Discharge port");
  }
  return missing;
}

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
}).extend({
  // A blank commodity makes an enquiry unusable for matching/deals, so require
  // a non-blank, trimmed product at the schema level.
  product: z.string().trim().min(1, "Commodity is required"),
});

export const insertTradeEnquiryDocumentSchema = createInsertSchema(tradeEnquiryDocuments).omit({
  id: true,
  uploadedAt: true,
});

// Automated trade pipeline: pairs an Import (buy) enquiry with an Export (sell)
// enquiry. Picking a match runs an automatic document cascade (LOI + SCO ->
// Deal Recap Import + Export -> TFR). Admin approval of the TFR forms the trade.
export const deals = pgTable("deals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dealRef: text("deal_ref").notNull().unique(),
  importEnquiryRef: text("import_enquiry_ref").notNull().unique(),
  exportEnquiryRef: text("export_enquiry_ref").notNull().unique(),
  commodity: text("commodity").notNull(),
  // matched -> documents_issued -> recaps_issued -> tfr_pending -> trade_formed
  stage: text("stage").notNull().default("matched"),
  loiDocId: text("loi_doc_id"),
  scoDocId: text("sco_doc_id"),
  dealRecapImportDocId: text("deal_recap_import_doc_id"),
  dealRecapExportDocId: text("deal_recap_export_doc_id"),
  tfrDocId: text("tfr_doc_id"),
  tradeRef: text("trade_ref"),
  cascadeError: text("cascade_error"),
  // Manually incorporated TFR details (addressee + financial/banking fields),
  // merged over the auto-derived tfrData whenever the TFR is regenerated.
  tfrManualDetails: jsonb("tfr_manual_details").$type<Record<string, string>>(),
  // Digital approval stamp recorded when the admin approves the TFR.
  tfrApprovedAt: timestamp("tfr_approved_at"),
  tfrApprovedBy: text("tfr_approved_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Logical product parents for the blockchain explorer. These are grouping
// records only: they are not mined blocks and never participate in the linear
// hash chain. The immutable key is derived solely from the commodity name.
export const productBlockParents = pgTable("product_block_parents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commodityKey: text("commodity_key").notNull(),
  commodityLabel: text("commodity_label").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("product_block_parents_commodity_key_unique").on(table.commodityKey),
]);

// Persistent association between a logical product parent and an existing
// mined trade block. Deleting a revoked trade/block removes the association,
// but never rewrites the block itself or any hash-bearing ledger field.
export const productDealBlocks = pgTable("product_deal_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productParentId: varchar("product_parent_id").notNull()
    .references(() => productBlockParents.id, { onDelete: "cascade" }),
  dealId: varchar("deal_id")
    .references(() => deals.id, { onDelete: "cascade" }),
  tradeId: varchar("trade_id").notNull()
    .references(() => trades.id, { onDelete: "cascade" }),
  blockId: varchar("block_id").notNull()
    .references(() => blocks.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("product_deal_blocks_parent_idx").on(table.productParentId),
  uniqueIndex("product_deal_blocks_trade_unique").on(table.tradeId),
  uniqueIndex("product_deal_blocks_block_unique").on(table.blockId),
]);

export const insertDealSchema = createInsertSchema(deals).omit({
  id: true,
  dealRef: true,
  stage: true,
  loiDocId: true,
  scoDocId: true,
  dealRecapImportDocId: true,
  dealRecapExportDocId: true,
  tfrDocId: true,
  tradeRef: true,
  cascadeError: true,
  createdAt: true,
});
export type Deal = typeof deals.$inferSelect;
export type InsertDeal = z.infer<typeof insertDealSchema>;

// Saved TFR recipients: addressee details (bank / institution / anyone a TFR
// is sent to) entered manually by the admin are stored here for reuse.
// Upserted by name so re-entering a known recipient refreshes its details.
export const tfrRecipients = pgTable("tfr_recipients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  address: text("address"),
  attn: text("attn"),
  notes: text("notes"),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTfrRecipientSchema = createInsertSchema(tfrRecipients).omit({
  id: true,
  lastUsedAt: true,
  createdAt: true,
});
export type TfrRecipient = typeof tfrRecipients.$inferSelect;
export type InsertTfrRecipient = z.infer<typeof insertTfrRecipientSchema>;

// A candidate TFR: an admin pairs an Import (buy) enquiry with an Export (sell)
// enquiry and prepares a TFR for comparison WITHOUT forming a deal. Multiple
// candidates may share the same enquiry (no uniqueness on refs) so several
// combinations can be compared side by side; the admin then creates the deal
// from the best one (which cancels competing candidates) or cancels a candidate.
export const tfrCandidates = pgTable("tfr_candidates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateRef: text("candidate_ref").notNull().unique(),
  importEnquiryRef: text("import_enquiry_ref").notNull(),
  exportEnquiryRef: text("export_enquiry_ref").notNull(),
  commodity: text("commodity").notNull(),
  // Whether this pairing used the admin manual-match override (cross-commodity).
  manualMatch: boolean("manual_match").notNull().default(false),
  // Quick-compare figure copied from the TFR at preparation time.
  grossProfit: text("gross_profit"),
  tfrDocId: text("tfr_doc_id"),
  // Manually incorporated TFR details (same allowlisted fields as a deal's
  // tfrManualDetails); merged over auto-derived data on regeneration and
  // carried into the deal-backed TFR when the candidate graduates into a deal.
  manualDetails: jsonb("manual_details").$type<Record<string, string>>(),
  // active -> cancelled | deal_formed
  status: text("status").notNull().default("active"),
  dealId: text("deal_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTfrCandidateSchema = createInsertSchema(tfrCandidates).omit({
  id: true,
  status: true,
  dealId: true,
  createdAt: true,
});
export type TfrCandidate = typeof tfrCandidates.$inferSelect;
export type InsertTfrCandidate = z.infer<typeof insertTfrCandidateSchema>;

// A proposed buy<->sell match surfaced to the BULLEX deal desk. Creating a match
// does NOT generate any documents or form a trade — it is purely a flag for the
// desk to review and confirm/reject. Parties are referenced by enquiryRef only;
// the terminal/UI always renders registration codes, never names.
export const tradeMatches = pgTable("trade_matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  matchRef: text("match_ref").notNull().unique(),
  buyEnquiryRef: text("buy_enquiry_ref").notNull(),
  sellEnquiryRef: text("sell_enquiry_ref").notNull(),
  product: text("product").notNull(),
  score: integer("score").notNull().default(0),
  // 'manual' (a trader/admin picked the pair) or 'auto' (created from an
  // automated-engine suggestion). No match type auto-creates documents.
  matchType: text("match_type").notNull().default("manual"),
  // proposed -> confirmed | rejected (desk review). Always starts 'proposed'.
  status: text("status").notNull().default("proposed"),
  notes: text("notes"),
  // Human label of who proposed it (e.g. "Admin" or a team member name/code).
  createdByLabel: text("created_by_label"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTradeMatchSchema = createInsertSchema(tradeMatches).omit({
  id: true,
  matchRef: true,
  status: true,
  reviewedBy: true,
  reviewedAt: true,
  createdAt: true,
});
export type TradeMatch = typeof tradeMatches.$inferSelect;
export type InsertTradeMatch = z.infer<typeof insertTradeMatchSchema>;

// A tokenised shipment block. The shipment's at-cost value equals the number of
// Bull tokens issued (1 token = USD 1 at issue). Profit accrues to the block so
// the token redemption value rises: tokenValue = totalValue / tokensIssued.
export const shipmentBlocks = pgTable("shipment_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  blockRef: text("block_ref").notNull().unique(),
  commodity: text("commodity").notNull(),
  quantityMt: doublePrecision("quantity_mt").notNull(),
  pricePerMt: doublePrecision("price_per_mt").notNull(),
  profitPerMt: doublePrecision("profit_per_mt").notNull().default(0),
  shipmentValue: doublePrecision("shipment_value").notNull(),
  tokensIssued: doublePrecision("tokens_issued").notNull(),
  totalProfit: doublePrecision("total_profit").notNull().default(0),
  totalValue: doublePrecision("total_value").notNull(),
  tokenValue: doublePrecision("token_value").notNull().default(1),
  origin: text("origin"),
  destination: text("destination"),
  // open -> funding -> funded -> shipped -> completed | cancelled
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertShipmentBlockSchema = createInsertSchema(shipmentBlocks).omit({
  id: true,
  blockRef: true,
  shipmentValue: true,
  tokensIssued: true,
  totalProfit: true,
  totalValue: true,
  tokenValue: true,
  status: true,
  createdAt: true,
});
export type ShipmentBlock = typeof shipmentBlocks.$inferSelect;
export type InsertShipmentBlock = z.infer<typeof insertShipmentBlockSchema>;

// An investor's stake in a shipment block, funded by bank transfer. tokens equal
// the USD amount invested (1 token = USD 1). On completion the investor is
// reimbursed payoutAmount = tokens * block.tokenValue.
export const investments = pgTable("investments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  investmentRef: text("investment_ref").notNull().unique(),
  // Unguessable 32-hex-char token issued at creation; required for public lookup.
  lookupToken: text("lookup_token").notNull().unique(),
  blockId: varchar("block_id").notNull(),
  blockRef: text("block_ref").notNull(),
  commodity: text("commodity").notNull(),
  investorName: text("investor_name").notNull(),
  investorEmail: text("investor_email").notNull(),
  investorPhone: text("investor_phone"),
  amount: doublePrecision("amount").notNull(),
  tokens: doublePrecision("tokens").notNull(),
  bankName: text("bank_name"),
  bankAccountName: text("bank_account_name"),
  bankAccountNumber: text("bank_account_number"),
  // pending -> confirmed -> reimbursed | cancelled
  status: text("status").notNull().default("pending"),
  payoutAmount: doublePrecision("payout_amount"),
  reimbursedAt: timestamp("reimbursed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertInvestmentSchema = createInsertSchema(investments).omit({
  id: true,
  investmentRef: true,
  lookupToken: true,
  blockRef: true,
  commodity: true,
  tokens: true,
  status: true,
  payoutAmount: true,
  reimbursedAt: true,
  createdAt: true,
});
export type Investment = typeof investments.$inferSelect;
export type InsertInvestment = z.infer<typeof insertInvestmentSchema>;

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

export const insertKycSchema = createInsertSchema(kycApplications, {
  additionalBanks: z.array(bankEntrySchema).optional(),
}).omit({
  id: true,
  status: true,
  reviewNotes: true,
  blockchainHash: true,
  previousHash: true,
  blockNumber: true,
  nonce: true,
  createdAt: true,
  amlStatus: true,
  amlMatches: true,
  amlCheckedAt: true,
  amlCheckedBy: true,
  amlNotes: true,
  ofacStatus: true,
  ofacMatches: true,
  unSanctionsStatus: true,
  unSanctionsMatches: true,
  pepStatus: true,
  pepMatches: true,
  participantId: true,
  clientUsername: true,
  clientPassword: true,
}).partial().extend({
  // Minimum viable identity fields required on every public KYC submission.
  // All other sections remain optional so the multi-step form can save partial
  // drafts, but these three must be present to prevent near-empty flood attacks.
  companyName: z.string().trim().min(2, "Company name is required"),
  contactName: z.string().trim().min(2, "Contact name is required"),
  contactEmail: z.string().trim().email("A valid contact email is required"),
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
  buyerKycId: true,
  sellerKycId: true,
});

export const insertBlockSchema = createInsertSchema(blocks).omit({ id: true });

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
  pendingContent: true,
  amendmentReason: true,
  amendmentRequestedBy: true,
  amendmentRequestedAt: true,
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
  invitedByTeamMemberId: varchar("invited_by_team_member_id"),
  // High-entropy token issued at application creation and returned to the applicant
  // once. Subsequent photo/document upload requests must present it in the
  // X-Upload-Token header. Prevents anyone who only knows the application UUID
  // from tampering with the record's files.
  uploadToken: text("upload_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeamKycSchema = createInsertSchema(teamKycApplications).omit({
  id: true,
  status: true,
  reviewNotes: true,
  teamUsername: true,
  teamPassword: true,
  uploadToken: true,
  createdAt: true,
});
export type InsertTeamKyc = z.infer<typeof insertTeamKycSchema>;
export type TeamKycApplication = typeof teamKycApplications.$inferSelect;

export const teamMembers = pgTable("team_members", {
  terminatedAt: timestamp("terminated_at"),
  terminationReason: text("termination_reason"),
  terminatedBy: text("terminated_by"),
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  participantId: text("participant_id").unique(),
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
  invitedByTeamMemberId: varchar("invited_by_team_member_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({ id: true, createdAt: true });
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;

export const teamPasswordResetTokens = pgTable("team_password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TeamPasswordResetToken = typeof teamPasswordResetTokens.$inferSelect;

export const clientPasswordSetupTokens = pgTable("client_password_setup_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kycId: varchar("kyc_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientPasswordSetupToken = typeof clientPasswordSetupTokens.$inferSelect;

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

// ── Procurement Checklists ─────────────────────────────────────────────────
// A checklist "head" (template) defines stages of documents to collect plus
// buyer actions; a checklist record is a filled form tracking per-item status.
export type ChecklistItemDef = { label: string; purpose?: string };
export type ChecklistStageDef = { title: string; items: ChecklistItemDef[]; actions: string[] };

export const checklistTemplates = pgTable("checklist_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  objective: text("objective"),
  stages: jsonb("stages").$type<ChecklistStageDef[]>().notNull(),
  riskControls: jsonb("risk_controls").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChecklistTemplateSchema = createInsertSchema(checklistTemplates).omit({ id: true, createdAt: true });
export type InsertChecklistTemplate = z.infer<typeof insertChecklistTemplateSchema>;
export type ChecklistTemplate = typeof checklistTemplates.$inferSelect;

export type ChecklistProgress = {
  items: Record<string, { status: string; note?: string }>; // key "s<stage>i<item>", status: pending|received|verified|na
  actions: Record<string, boolean>;                          // key "s<stage>a<action>"
  riskControls: Record<string, boolean>;                     // key "<index>"
};

export const checklistRecords = pgTable("checklist_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull(),
  title: text("title").notNull(),
  commodity: text("commodity"),
  reference: text("reference"),
  notes: text("notes"),
  progress: jsonb("progress").$type<ChecklistProgress>().notNull().default(sql`'{"items":{},"actions":{},"riskControls":{}}'::jsonb`),
  status: text("status").notNull().default("in_progress"),
  submittedByTeamMemberId: varchar("submitted_by_team_member_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertChecklistRecordSchema = createInsertSchema(checklistRecords).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChecklistRecord = z.infer<typeof insertChecklistRecordSchema>;
export type ChecklistRecord = typeof checklistRecords.$inferSelect;

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

export const dailyReports = pgTable("daily_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamMemberId: varchar("team_member_id").notNull(),
  teamMemberName: text("team_member_name").notNull(),
  reportDate: text("report_date").notNull(),
  hoursWorked: text("hours_worked"),
  summary: text("summary").notNull(),
  tasksCompleted: text("tasks_completed"),
  blockers: text("blockers"),
  nextSteps: text("next_steps"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDailyReportSchema = createInsertSchema(dailyReports).omit({ id: true, createdAt: true });
export type InsertDailyReport = z.infer<typeof insertDailyReportSchema>;
export type DailyReport = typeof dailyReports.$inferSelect;

export const potentialClients = pgTable("potential_clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamMemberId: varchar("team_member_id").notNull(),
  companyName: text("company_name").notNull(),
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  address: text("address"),
  city: text("city"),
  country: text("country"),
  products: text("products").array(),
  status: text("status").notNull().default("lead"),
  source: text("source"),
  notes: text("notes"),
  lastContactedAt: text("last_contacted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  severity: text("severity").notNull().default("info"),
  module: text("module"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true, isRead: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const insertPotentialClientSchema = createInsertSchema(potentialClients).omit({
  id: true,
  teamMemberId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPotentialClient = z.infer<typeof insertPotentialClientSchema>;
export type PotentialClient = typeof potentialClients.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
// TeamKycApplication types already defined above
export type KycApplication = typeof kycApplications.$inferSelect;
export type InsertKyc = z.infer<typeof insertKycSchema>;
export type Trade = typeof trades.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Block = typeof blocks.$inferSelect;
export type InsertBlock = z.infer<typeof insertBlockSchema>;
export type ProductBlockParent = typeof productBlockParents.$inferSelect;
export type ProductDealBlock = typeof productDealBlocks.$inferSelect;
export type ProductDealBlockTrade = Pick<
  Trade,
  | "id"
  | "tradeRef"
  | "commodity"
  | "commodityCategory"
  | "quantity"
  | "unit"
  | "pricePerUnit"
  | "totalValue"
  | "currency"
  | "origin"
  | "destination"
  | "status"
  | "blockchainHash"
  | "blockNumber"
>;
export type ProductBlockGroup = {
  parent: ProductBlockParent;
  dealBlocks: Array<{
    associationId: string;
    dealId: string | null;
    dealRef: string | null;
    trade: ProductDealBlockTrade;
    block: Block;
  }>;
};
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
export type BlockchainKycSummary = Pick<
  KycApplication,
  | "id"
  | "companyName"
  | "registrationNumber"
  | "countryOfIncorporation"
  | "category"
  | "products"
  | "blockchainHash"
>;
export type BlockchainEnquirySummary = Pick<
  TradeEnquiry,
  | "id"
  | "enquiryRef"
  | "side"
  | "product"
  | "quantity"
  | "unit"
  | "createdBy"
  | "clientRespondedBy"
  | "loadingPort"
  | "incoterms"
>;
export type BlockchainLedgerResponse = {
  blocks: Block[];
  productGroups: ProductBlockGroup[];
  trades: ProductDealBlockTrade[];
  kycApps: BlockchainKycSummary[];
  enquiries: BlockchainEnquirySummary[];
};

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: text("room_id").notNull(),
  senderId: text("sender_id").notNull(),
  senderName: text("sender_name").notNull(),
  senderRole: text("sender_role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

// Generic key/value store for app-wide settings (e.g. the document branding logo).
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAppSettingSchema = createInsertSchema(appSettings).omit({ updatedAt: true });
export type InsertAppSetting = z.infer<typeof insertAppSettingSchema>;
export type AppSetting = typeof appSettings.$inferSelect;

// Contacts (visiting cards): structured business-contact records with an optional
// scanned/uploaded visiting-card image stored in Object Storage.
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  title: text("title"),
  company: text("company"),
  email: text("email"),
  phone: text("phone"),
  additionalEmails: text("additional_emails").array(),
  additionalPhones: text("additional_phones").array(),
  website: text("website"),
  address: text("address"),
  category: text("category"),
  notes: text("notes"),
  cardImageStoredName: text("card_image_stored_name"),
  submittedByTeamMemberId: varchar("submitted_by_team_member_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  cardImageStoredName: true,
  submittedByTeamMemberId: true,
  createdAt: true,
}).extend({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  additionalEmails: z.array(z.string().trim().email("Invalid email")).optional(),
  additionalPhones: z.array(z.string().trim().min(1, "Phone cannot be empty")).optional(),
});

export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

// Bank account details of counterparty companies (Banking & LC module)
export const companyBankAccounts = pgTable("company_bank_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull(),
  bankName: text("bank_name").notNull(),
  branch: text("branch"),
  bankAddress: text("bank_address"),
  accountName: text("account_name"),
  accountNumber: text("account_number"),
  iban: text("iban"),
  swiftCode: text("swift_code"),
  currency: text("currency"),
  correspondentBank: text("correspondent_bank"),
  correspondentSwift: text("correspondent_swift"),
  notes: text("notes"),
  submittedByTeamMemberId: varchar("submitted_by_team_member_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCompanyBankAccountSchema = createInsertSchema(companyBankAccounts).omit({
  id: true,
  submittedByTeamMemberId: true,
  createdAt: true,
}).extend({
  companyName: z.string().trim().min(1, "Company name is required"),
  bankName: z.string().trim().min(1, "Bank name is required"),
});

export type InsertCompanyBankAccount = z.infer<typeof insertCompanyBankAccountSchema>;
export type CompanyBankAccount = typeof companyBankAccounts.$inferSelect;

// Shipment tracking. Manual entries today; AIS-provider fields (imoNumber, mmsi,
// lastLat/lastLng/lastPositionAt, positionSource) are ready for a live feed later.
export const SHIPMENT_STATUSES = [
  "scheduled",
  "loading",
  "in_transit",
  "discharging",
  "delivered",
  "delayed",
  "cancelled",
] as const;

export const shipments = pgTable("shipments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vesselName: text("vessel_name").notNull(),
  imoNumber: text("imo_number"),
  mmsi: text("mmsi"),
  tradeRef: text("trade_ref"),
  commodity: text("commodity"),
  quantity: doublePrecision("quantity"),
  unit: text("unit").default("MT"),
  loadingPort: text("loading_port"),
  dischargePort: text("discharge_port"),
  status: text("status").notNull().default("scheduled"),
  etd: text("etd"),
  eta: text("eta"),
  ata: text("ata"),
  lastLat: doublePrecision("last_lat"),
  lastLng: doublePrecision("last_lng"),
  lastPositionAt: timestamp("last_position_at"),
  positionSource: text("position_source").notNull().default("manual"),
  notes: text("notes"),
  submittedByTeamMemberId: varchar("submitted_by_team_member_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertShipmentSchema = createInsertSchema(shipments).omit({
  id: true,
  lastPositionAt: true,
  positionSource: true,
  submittedByTeamMemberId: true,
  createdAt: true,
}).extend({
  vesselName: z.string().trim().min(1, "Vessel name is required"),
  status: z.enum(SHIPMENT_STATUSES).default("scheduled"),
  quantity: z.coerce.number().positive().optional().nullable(),
  lastLat: z.coerce.number().min(-90).max(90).optional().nullable(),
  lastLng: z.coerce.number().min(-180).max(180).optional().nullable(),
});

export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipments.$inferSelect;
