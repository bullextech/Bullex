import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { disconnectTeamMember } from "./chat";
import { createServer, type Server } from "http";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import bcrypt from "bcryptjs";
import multer from "multer";
import { multipartFieldLimits } from "./upload-limits";
import { rateLimit } from "express-rate-limit";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { enquirySpecTemplate } from "@shared/copper-cathodes";
import { isLpgStsSpa } from "@shared/lpg-sts";
import { assertLpgStsCleared, lpgStsReviewState, lpgStsReviewPage, LpgStsReviewError, projectLpgStsDocumentResponse, validateLpgStsReviewPoints } from "./lpg-sts-review";
import { getTableColumns } from "drizzle-orm";
import { canonicalProductGroup, sameProductGroup } from "@shared/product-groups";
import { composeEnquirySpecialNote, formatEnquiryQuantity } from "@shared/enquiry-doc-prefill";
import { insertTradeSchema, insertKycSchema, insertDocumentSchema, insertPotentialClientSchema, insertTradeMatchSchema, insertShipmentBlockSchema, insertInvestmentSchema, insertContactSchema, insertCompanyBankAccountSchema, insertShipmentSchema, bankEntrySchema, kycApplications, ENQUIRY_STATUS_PENDING, isEnquiryStatusPending, isEnquiryStatusTerminal, isEnquiryStatusAccepted, isAssignableEnquiryStatus, missingEnquiryAcceptanceDetails, type Trade, type Deal, type TfrCandidate, type TradeEnquiry, type Document, type TradeMatch, type ShipmentBlock, type Investment, type Block } from "@shared/schema";
import { generateTradeHash, generateKycHash, generateKycAmendmentHash, mineBlock, GENESIS_HASH } from "./blockchain";
import { generateDocumentContent, type PartyDetails, type SpaAddendumAmendment, type SpaAddendumData } from "./documentTemplates";
import { seedDatabase } from "./seed";
import { DEFAULT_CHECKLIST_TEMPLATE } from "./checklistSeed";
import { sendKycConfirmationEmail, sendKycApprovalEmail, sendKycRejectionEmail, sendChangeRequestApprovedEmail, sendChangeRequestRejectedEmail, sendDocumentEmail, sendSignaturePendingEmail, sendAmendmentRequestedEmail, sendDocumentReviewDecisionEmail, sendKycSubmittedAdminEmail, sendKycActionAdminCopyEmail, sendKycOnboardingInviteEmail, sendRegistrationConfirmationEmail, sendRegistrationAdminEmail, sendRegistrationApprovalEmail, sendRegistrationRejectionEmail, sendEnquiryCreatedNotification, sendEnquiryClientResponseNotification, sendEnquiryStatusNotification, sendJobApplicationToHR, sendJobApplicationAcknowledgement, sendTeamKycAdminNotification, sendTeamKycUpdateNotification, sendTeamKycConfirmation, sendTeamMemberWelcomeEmail, sendTeamMemberPasswordChangedEmail, sendTeamMemberPasswordResetLinkEmail, sendClientPasswordResetLinkEmail, sendMeetingInviteEmail, runWithEmailActor, clearEmailLogoCache } from "./email";
import { generateDocx, generatePdf, getDocFilePath, regenerateWithSignatures, generateKycApplicationPdf, generateBlankKycApplicationPdf, clearLogoCache, LOGO_SETTING_KEY, LOGO_SECONDARY_SETTING_KEY, LOGO_LETTERHEAD_SETTING_KEY } from "./documentFileGenerator";
import { attachChat, getSessionIdentity, dmRoomId, canAccessRoom } from "./chat";
import { syncBankAccountsFromKyc } from "./bank-sync";
import { saveUpload, streamObject, deleteObject, safeContentType } from "./object-files";
import { createInstantMeeting } from "./googleMeet";
import { getMarketPrices } from "./market";
import {
  isSpaAddendumContentLocked,
  isSpaAddendumExecuted,
  normalizeSpaAddendumNumber,
} from "./spa-addendum-policy";
import { sortClientDetails } from "@shared/client-sorting";
export { isSpaAddendumContentLocked, isSpaAddendumExecuted } from "./spa-addendum-policy";
// archiver is CommonJS; under the tsx/ESM loader neither a default import nor
// a namespace unwrap resolves the callable export, so load it via createRequire.
// In the production bundle (esbuild --format=cjs) `import.meta.url` is EMPTY and
// createRequire(undefined) throws at startup (crash-looped a deploy once), so
// fall back to the native CJS require/__filename when they exist.
import { createRequire } from "module";
declare const require: any; // present in the cjs bundle at runtime
const archiver: (format: string, options?: any) => any =
  typeof require === "function"
    ? require("archiver")
    : createRequire(import.meta.url)("archiver");

// ── Per-IP rate limiters for public unauthenticated endpoints ──────────────
// These prevent abuse: email-relay flooding, sanctions-screening quota drain,
// and operational DoS via unbounded parallel form submissions.

/** High-risk: KYC submission and HR job applications (trigger paid third-party
 *  calls and outbound emails with optional large attachments).
 *  Key is req.ip — resolved correctly because app.set("trust proxy", 1) is
 *  configured, so Express unwraps exactly one trusted proxy hop from the
 *  X-Forwarded-For chain. Raw header access is intentionally avoided. */
const publicFormLimiterStrict: RequestHandler<any> = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many submissions from this IP. Please try again later." },
});

/** Medium-risk: Registration and public trade-enquiry forms (trigger internal
 *  notification emails but no large attachments or third-party API calls).
 *  Same trust-proxy note as above. */
const publicFormLimiterModerate: RequestHandler<any> = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many submissions from this IP. Please try again later." },
});

function getTrustedPublicOrigin(req: Request): string {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured) {
    const parsed = new URL(configured);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("PUBLIC_APP_URL must use HTTP or HTTPS");
    return parsed.origin;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("PUBLIC_APP_URL is required to generate account setup links in production");
  }

  const host = (req.get("host") || "").trim().toLowerCase();
  const hostname = host.replace(/:\d+$/, "");
  if (!/^[a-z0-9.-]+(?::\d+)?$/.test(host)) throw new Error("Untrusted public application host");

  const runtimeHosts = new Set(
    [process.env.REPLIT_DEV_DOMAIN, ...(process.env.REPLIT_DOMAINS || "").split(",")]
      .map((value) => value?.trim().toLowerCase())
      .filter((value): value is string => !!value),
  );
  const trusted =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    runtimeHosts.has(hostname);
  if (!trusted) throw new Error("Untrusted public application host");

  const protocol = hostname === "localhost" || hostname === "127.0.0.1" ? "http" : "https";
  return `${protocol}://${host}`;
}

/** Login endpoints — applied to all credential-checking routes (admin/team and
 *  client portals). 10 attempts per 15 minutes per IP; deliberately tighter
 *  than general form limits to resist online credential-stuffing attacks. */
const loginLimiter: RequestHandler<any> = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many login attempts from this IP. Please try again later." },
});

export type BlockchainViewerScope = {
  tradeBlockNumbers: ReadonlySet<number>;
  kycIds: ReadonlySet<string>;
  enquiryIds: ReadonlySet<string>;
};

const PUBLIC_BLOCKCHAIN_SCOPE: BlockchainViewerScope = {
  tradeBlockNumbers: new Set(),
  kycIds: new Set(),
  enquiryIds: new Set(),
};

// The chain proof is globally auditable, but record IDs and human-readable
// summaries are only visible when the team caller can access the underlying
// record. Passing null represents the unrestricted admin view.
export function projectBlocksForBlockchainViewer(
  ledgerBlocks: Block[],
  scope: BlockchainViewerScope | null,
): Block[] {
  if (!scope) return ledgerBlocks;
  return ledgerBlocks.map((block) => {
    const canSeeMetadata = block.dataType === "trade"
      ? scope.tradeBlockNumbers.has(block.blockNumber)
      : block.dataType === "kyc" || block.dataType === "kyc_amendment"
        ? !!block.dataId && scope.kycIds.has(block.dataId)
        : block.dataType === "trade_enquiry" || block.dataType === "enquiry_amendment"
          ? !!block.dataId && scope.enquiryIds.has(block.dataId)
          : false;
    return canSeeMetadata
      ? block
      : { ...block, dataId: null, dataSummary: null };
  });
}

/** Authenticated outbound-email endpoints — applied to routes that send emails
 *  on behalf of an authenticated user (team member or admin). Even authenticated
 *  sessions must be rate-limited to prevent a compromised account from using
 *  Bullex infrastructure as a spam relay or exhausting Resend quota.
 *  20 sends per hour per IP is generous for legitimate use but blocks automation. */
const authenticatedEmailLimiter: RequestHandler<any> = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Email send rate limit reached. Please try again later." },
});

async function notify(args: { type: string; title: string; message: string; link?: string | null; severity?: "info" | "success" | "warning" | "alert"; module?: string | null }) {
  try {
    await storage.createNotification({
      type: args.type,
      title: args.title,
      message: args.message,
      link: args.link ?? null,
      severity: args.severity ?? "info",
      module: args.module ?? null,
    });
  } catch (err: any) {
    console.error("[notifications] create failed:", err.message);
  }
}

// Build the admin notification payload for an auto-chain child-creation failure
// in the sign endpoint (e.g. a signed SPA failing to create its DLC/PBG/TFR
// drafts). Exported pure so tests can assert the exact payload.
export function buildAutoChainFailureNotification(
  parent: { id: string; docType: string; title: string },
  childType: string,
  errMessage?: string,
): { type: string; title: string; message: string; link: string; severity: "alert"; module: string } {
  return {
    type: "auto_chain_failed",
    title: `${childType} auto-creation failed`,
    message: `Signing ${parent.docType} "${parent.title}" did not auto-create its ${childType} draft${errMessage ? ` (${errMessage})` : ""}. Create it manually from the parent document.`,
    link: `/documents`,
    severity: "alert",
    module: "documents",
  };
}

export function buildFileGenerationFailureNotification(
  doc: { id: string; docType: string; title: string },
  context: "pipeline_create" | "signature_regenerate" | "send_email" | "tfr_details_update",
  errMessage?: string,
): { type: string; title: string; message: string; link: string; severity: "alert"; module: string } {
  const detail =
    context === "pipeline_create"
      ? `was created without its DOCX/PDF files — file generation failed`
      : context === "send_email"
        ? `could not be regenerated and emailed to the recipient — the send silently failed`
        : `could not regenerate its DOCX/PDF files with the latest signature state — existing files are stale`;
  return {
    type: "file_generation_failed",
    title: `${doc.docType} file generation failed`,
    message: `${doc.docType} "${doc.title}" ${detail}${errMessage ? ` (${errMessage})` : ""}. Review the document and regenerate its files.`,
    link: `/documents`,
    severity: "alert",
    module: "documents",
  };
}

export async function runFileGenerationOrNotify<T>(
  doc: { id: string; docType: string; title: string },
  context: "pipeline_create" | "signature_regenerate" | "send_email" | "tfr_details_update",
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err: any) {
    console.error(`[docs] File generation failed (${context}) for ${doc.docType} ${doc.id}:`, err?.message || err);
    await notify(buildFileGenerationFailureNotification(doc, context, err?.message));
    return null;
  }
}
async function notifyAgentDocPendingReview(doc: { id: string; docType: string; title: string }, callerTmId: string) {
  let preparedBy = "A team member";
  try {
    const tm = await storage.getTeamMemberById(callerTmId);
    if (tm?.name) preparedBy = tm.name;
  } catch {}
  notify({
    type: "document_pending_review",
    title: `${doc.docType} awaiting approval`,
    message: `${preparedBy} prepared ${doc.docType} "${doc.title}" — admin approval required before it can be sent`,
    link: "/documents",
    severity: "warning",
    module: "doc-templates",
  });
}

// ── Amendment-approval blockchain retry ─────────────────────────────────────
// KYC/enquiry amendment approvals mine their block OUTSIDE the DB transaction,
// then re-verify under the blockchain lock that the tip hasn't moved. If it
// has (another mint, or a TFR revoke deleted the tip), storage throws this
// exact error. Rather than surfacing a 500 and forcing the admin to click
// approve again, re-mine against the fresh tip and retry once; only if the
// chain moves AGAIN do we return a 409 telling the admin to retry.
export const BLOCKCHAIN_ADVANCED_MESSAGE = "Blockchain advanced while approving; please retry the approval";

export function isBlockchainAdvancedError(err: unknown): boolean {
  return err instanceof Error && err.message === BLOCKCHAIN_ADVANCED_MESSAGE;
}

/**
 * Runs `attempt()` (mine-then-approve); if it fails specifically because the
 * blockchain tip moved mid-approval, runs it once more (the caller's attempt
 * fn must re-read the tip and re-mine each call). Returns the approval result,
 * or `{ retryExhausted: true }` when both attempts hit a moving chain — the
 * route maps that to a 409. Any other error propagates unchanged.
 */
export async function approveWithBlockchainRetry<T>(
  attempt: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; retryExhausted: true }> {
  try {
    return { ok: true, value: await attempt() };
  } catch (err) {
    if (!isBlockchainAdvancedError(err)) throw err;
    console.warn("[blockchain] tip moved mid-approval; re-mining and retrying once");
    try {
      return { ok: true, value: await attempt() };
    } catch (err2) {
      if (!isBlockchainAdvancedError(err2)) throw err2;
      return { ok: false, retryExhausted: true };
    }
  }
}

const ADMIN_CHECKLISTS: Record<string, string[]> = {
  LOI: [
    "Buyer details verified against KYC records",
    "Product specification matches enquiry",
    "Quantity and unit are correct",
    "Price and payment terms acceptable",
    "Laycan / delivery timeline is feasible",
    "Port of loading and discharge correct",
    "Enquiry reference number present and valid",
  ],
  SCO: [
    "Seller details verified against KYC records",
    "LOI reference correctly cited",
    "Product grade and specifications complete",
    "Quantity, price, and unit match LOI",
    "Inspection clause included",
    "Laycan dates consistent with LOI",
    "Payment terms match LOI",
  ],
  FCO: [
    "Seller details verified against KYC records",
    "Product grade and specifications complete",
    "Quantity, price, and unit specified",
    "Payment and delivery terms defined",
    "Validity period stated",
    "Inspection clause included",
    "Signatory authorized",
  ],
  DEAL_RECAP: [
    "Buyer and Seller details correct",
    "LOI and SCO references cited",
    "Product, qty, price match all prior documents",
    "Total contract value calculated correctly",
    "Payment, laycan, inspection terms consistent",
    "Arbitration and governing law clause present",
    "Deal Recap number format correct",
  ],
  SPA: [
    "Deal Recap reference number cited",
    "All commercial terms match Deal Recap",
    "Force majeure clause included",
    "Penalty and dispute resolution defined",
    "Both party signatories identified",
    "SPA number matches Deal Recap number",
    "Governing law and jurisdiction confirmed",
  ],
  ADDENDUM: [
    "Original SPA reference and date verified",
    "Seller and Buyer details match the Original SPA",
    "Every amended clause is identified precisely",
    "Replacement wording reflects the agreed commercial intent",
    "Effective date is stated",
    "No unselected SPA provision is altered",
    "No novation and continuing-validity clauses are present",
    "Both party signatories are authorised",
  ],
  NCNDA: [
    "Party A details verified against KYC / company records",
    "Party B details verified against approved KYC application",
    "Effective date and term correctly stated",
    "Proposed Transaction description complete",
    "Governing law and jurisdiction confirmed",
    "Non-circumvention clause reviewed",
    "Both party signatories authorised",
    "Sanctions and anti-bribery clauses reviewed",
  ],
  ICA: [
    "Principal details verified against company records",
    "Agent / Broker details verified against approved KYC application",
    "Agent participant ID (agent code) present on the document",
    "Agency type (Exclusive / Non-Exclusive) selected",
    "Commission structure, basis and currency complete",
    "Transaction details (commodity, qty, value, incoterm) consistent",
    "Governing law, seat of arbitration and ICC clause set",
    "AML / sanctions / anti-bribery articles reviewed",
    "Annexure A (IMFPA) and Annexure B (NCNDA) attached",
    "Signatory blocks for Principal and Agent complete",
  ],
  TFR: [
    "Buyer and Seller verified against KYC / company records",
    "Product, quantity, contract value and Incoterms consistent",
    "Financial economics and profit figures reviewed",
    "Trade finance / banking structure assessed",
    "Logistics route and infrastructure feasibility confirmed",
    "Legal, AML/KYC and sanctions screening completed",
    "Risk ratings and security structure reviewed",
    "Overall feasibility conclusion and recommendation set",
    "Prepared By and Approved By signatories complete",
  ],
};
// Extract every email address from a free-text enquiry contact field
// (e.g. "Cem Alaybeyi · +90545… · cem@almexo.com.tr"), lowercased, as a Set.
// Used to validate that a party email supplied on a document matches the email
// the enquiry actually recorded for that same party (buyer vs seller).
export function extractEnquiryEmails(field?: string | null): Set<string> {
  return new Set(((field || "").match(/[\w.-]+@[\w.-]+\.\w+/g) ?? []).map((e) => e.toLowerCase()));
}

// Side-specific guard for POST /api/documents: if the linked enquiry recorded an
// email for a party (buyer or seller), the email supplied on the document for
// that SAME party must match it. Sides where the enquiry captured no email are
// not enforced — enquiry contact fields are free text and frequently store only
// a name/phone for one party. Portal routing (the real multi-tenant boundary) is
// enforced separately at POST /api/documents/:id/send, so this is defense-in-depth.
// Returns { ok: true } when acceptable, or the offending side when a stored email
// exists for that party and the supplied email does not match it.
export function checkPartyEmailAgainstEnquiry(opts: {
  buyerContact?: string | null;
  sellerContact?: string | null;
  enquiryBuyerContact?: string | null;
  enquirySellerContact?: string | null;
}): { ok: true } | { ok: false; side: "buyer" | "seller" } {
  const firstEmail = (s?: string | null) =>
    s?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0]?.toLowerCase() || null;
  const buyerCandidate = firstEmail(opts.buyerContact);
  const sellerCandidate = firstEmail(opts.sellerContact);
  const enquiryBuyerEmails = extractEnquiryEmails(opts.enquiryBuyerContact);
  const enquirySellerEmails = extractEnquiryEmails(opts.enquirySellerContact);
  if (buyerCandidate && enquiryBuyerEmails.size > 0 && !enquiryBuyerEmails.has(buyerCandidate)) {
    return { ok: false, side: "buyer" };
  }
  if (sellerCandidate && enquirySellerEmails.size > 0 && !enquirySellerEmails.has(sellerCandidate)) {
    return { ok: false, side: "seller" };
  }
  return { ok: true };
}
// Team members may only reference a trade via a tradeRef that is actually linked
// to their own enquiry. When an admin accepts an enquiry into a trade, the trade's
// reference is recorded on the enquiry's `linkedTradeRef` column (there is no
// `tradeRef` column on trade_enquiries), so that is the field the supplied
// tradeRef must match. Exported pure so tests can cover accept/reject directly.
export function tradeRefMatchesEnquiry(
  enquiry: Pick<TradeEnquiry, "linkedTradeRef">,
  suppliedTradeRef: string,
): boolean {
  return !!enquiry.linkedTradeRef && enquiry.linkedTradeRef === suppliedTradeRef;
}

async function resolveAgentCode(opts: {
  buyerEmail?: string | null;
  sellerEmail?: string | null;
  sentToClientId?: string | null;
  submittedByTeamMemberId?: string | null;
}): Promise<string | null> {
  try {
    // 1) Prefer the explicit client recipient if linked.
    if (opts.sentToClientId) {
      const k = await storage.getKycApplicationById(opts.sentToClientId);
      if (k?.participantId) return k.participantId;
    }
    // 2) Match an approved KYC by buyer/seller email.
    const emails = [opts.buyerEmail, opts.sellerEmail].filter(Boolean) as string[];
    if (emails.length) {
      const all = await storage.getKycApplications();
      for (const e of emails) {
        const hit = all.find(a =>
          a.status === "approved" &&
          a.participantId &&
          [a.signatoryEmail, a.contactEmail, a.filledByEmail].filter(Boolean).some(x => (x as string).toLowerCase() === e.toLowerCase())
        );
        if (hit?.participantId) return hit.participantId;
      }
    }
    // 3) Fall back to the submitting team member's participant ID.
    if (opts.submittedByTeamMemberId) {
      const tm = await storage.getTeamMemberById(opts.submittedByTeamMemberId);
      if (tm?.participantId) return tm.participantId;
    }
  } catch (err) {
    console.error("[agent-code] resolution failed:", err);
  }
  return null;
}

// Resolves the allocated team member's code (participantId) for a document.
// Priority: the team member an admin allocated to the deal (anchored on the
// enquiry) -> else the team member who created the document. This stamps the
// responsible member's code onto every document across the enquiry->shipment
// lifecycle so allocated-member performance can be tracked.
async function resolveTeamMemberCode(opts: {
  enquiryRef?: string | null;
  submittedByTeamMemberId?: string | null;
}): Promise<string | null> {
  try {
    if (opts.enquiryRef) {
      const enquiries = await storage.getTradeEnquiries();
      const enq = enquiries.find(e => e.enquiryRef === opts.enquiryRef);
      const allocatedId = (enq as any)?.allocatedTeamMemberId as string | undefined;
      if (allocatedId) {
        const tm = await storage.getTeamMemberById(allocatedId);
        if (tm?.participantId) return tm.participantId;
      }
    }
    if (opts.submittedByTeamMemberId) {
      const tm = await storage.getTeamMemberById(opts.submittedByTeamMemberId);
      if (tm?.participantId) return tm.participantId;
    }
  } catch (err) {
    console.error("[team-member-code] resolution failed:", err);
  }
  return null;
}

const DEFAULT_CHECKLIST = [
  "Document details complete and accurate",
  "Trade reference verified",
  "Counterparty details correct",
  "Terms and conditions reviewed",
  "Compliance requirements met",
];

export function buildAdminChecks(docType: string): Array<{ label: string; checked: boolean }> {
  const labels = ADMIN_CHECKLISTS[docType] || DEFAULT_CHECKLIST;
  return labels.map(label => ({ label, checked: false }));
}

// ----------------------------------------------------------------------------
// Automated trade pipeline (deals) — document cascade engine
// ----------------------------------------------------------------------------

const COMMODITY_CATEGORY_MAP: Record<string, string> = {
  "Iron Ore": "minerals", "Bauxite": "minerals", "Manganese Ore": "minerals",
  "Copper Cathode": "metals", "Copper Concentrate": "metals", "Aluminium Ingots": "metals",
  "Gasoil 10ppm": "energy", "Gasoil 50ppm": "energy", "LHC": "energy", "HSFO": "energy", "HSGO": "energy",
  "Petcoke – Anode Grade": "petrochemicals", "Petcoke – Fuel Grade": "petrochemicals",
  "NPK": "fertilizers", "Sulphur – Granular": "fertilizers", "Sulphur – Lumps": "fertilizers",
};

function commodityCategoryFor(product?: string): string {
  return COMMODITY_CATEGORY_MAP[(product || "").trim()] || "minerals";
}

function extractEmail(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    const m = (c || "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (m) return m[0];
  }
  return null;
}

function toNumber(s?: string | null): number {
  return parseFloat(String(s ?? "").replace(/[^\d.]/g, "")) || 0;
}

// Build PartyDetails/ProductDetails from a trade enquiry. `role` selects whether
// the enquiry's own party is the buyer (import/buy) or seller (export/sell).
function partiesFromEnquiry(enq: TradeEnquiry) {
  const buyer: PartyDetails = {
    name: enq.buyerName || undefined,
    address: enq.buyerAddress || undefined,
    contact: enq.buyerContact || undefined,
  };
  const seller: PartyDetails = {
    name: enq.sellerName || enq.producer || undefined,
    address: enq.sellerAddress || undefined,
    contact: enq.sellerContact || undefined,
  };
  const product = {
    commodity: enq.product || undefined,
    origin: enq.origin || enq.loadingPort || undefined,
    quantity: formatEnquiryQuantity(enq.quantity, enq.unit) || undefined,
    qualitySpecs: enq.specifications || undefined,
    packing: enq.packing || undefined,
    specialNote: composeEnquirySpecialNote(enq.additionalInfo, enq.performanceBond) || undefined,
    loadingPort: enq.loadingPort || undefined,
    dischargePort: enq.dischargePort || undefined,
    price: enq.price || undefined,
    currency: enq.currency || "USD",
    incoterm: enq.incoterms || undefined,
    laycan: enq.deliveryPeriod || undefined,
    paymentTerms: enq.paymentTerms || undefined,
    validity: enq.validity || undefined,
    refPerson: enq.refPerson || undefined,
    contractConfirmation: enq.contractConfirmation || undefined,
    docsForPayment: enq.docsForPayment || undefined,
    otherTerms: enq.otherTerms || undefined,
    compliance: enq.compliance || undefined,
  };
  return { buyer, seller, product };
}

// Generate a document for the pipeline cascade: build content, persist, generate
// DOCX/PDF, and (optionally) mark it auto-accepted so the chain can continue.
async function createPipelineDoc(opts: {
  docType: string;
  title: string;
  buyer: PartyDetails;
  seller: PartyDetails;
  product: any;
  enquiryRef?: string | null;
  parentDocId?: string | null;
  dealRecapNumber?: string | null;
  status: string;
  autoAccept: boolean;
}): Promise<Document> {
  const content = generateDocumentContent(opts.docType, undefined, opts.buyer, opts.seller, opts.product);
  const buyerEmail = extractEmail(opts.buyer.contact);
  const sellerEmail = extractEmail(opts.seller.contact);
  const teamMemberCode = await resolveTeamMemberCode({ enquiryRef: opts.enquiryRef });
  const created = await storage.createDocument({
    docType: opts.docType,
    title: opts.title,
    content,
    status: opts.status,
    adminChecks: buildAdminChecks(opts.docType),
    enquiryRef: opts.enquiryRef ?? null,
    parentDocId: opts.parentDocId ?? null,
    dealRecapNumber: opts.dealRecapNumber ?? null,
    teamMemberCode,
    buyerEmail,
    sellerEmail,
    recipientResponse: opts.autoAccept ? "accepted" : null,
    recipientRespondedAt: opts.autoAccept ? new Date() : null,
  } as any);

  const withFiles = await runFileGenerationOrNotify(created, "pipeline_create", async () => {
    const docxPath = await generateDocx(created.id, created.title, content, "Bullex Admin", undefined, teamMemberCode || undefined, created.docType);
    let pdfPath: string | undefined;
    if (opts.docType !== "LOI") {
      pdfPath = await generatePdf(created.id, created.title, content, "Bullex Admin", undefined, teamMemberCode || undefined, created.docType);
    }
    return await storage.updateDocument(created.id, { docxPath, ...(pdfPath ? { pdfPath } : {}) });
  });
  return withFiles ?? created;
}

function dealRecapNumberFor(buyerName: string, sellerName: string, serialSeed: number): string {
  const b3 = (buyerName || "XXX").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
  const s3 = (sellerName || "XXX").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
  const now = new Date();
  const ddmm = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `${b3}/${s3}-${ddmm}-${String(serialSeed).padStart(3, "0")}`;
}

// Build the consolidated TFR data block for an Import/Export enquiry pair.
// Shared by the deal cascade (reference = dealRef) and candidate TFR
// preparation (reference = candidateRef). Import column = purchase side
// (origin supplier); Export column = sale side (final customer). Each column
// reports ITS OWN enquiry's product — for a manual cross-product match these
// differ, and the TFR must state each side honestly rather than the combined
// deal label.
// Pick the latest ELIGIBLE basis document of the given type(s) for an enquiry.
// Only accepted instruments qualify (client-accepted or auto-accepted by the
// cascade): a draft, pending, rejected, or amendment-requested LOI/FCO must
// never overwrite the enquiry's terms — with no eligible document the TFR
// falls back to the enquiry data unchanged. Note the 'rejected' overload:
// status can be 'rejected' (admin reject) or recipientResponse 'rejected'
// (client amendment request on an accepted doc); both disqualify. Types are
// tried in order (e.g. FCO first, SCO as stand-in); newest eligible wins.
async function pickTfrBasisDoc(enquiryRef: string | null | undefined, types: string[]): Promise<Document | null> {
  if (!enquiryRef) return null;
  // Eligibility (accepted, not rejected either way) is enforced by the
  // storage query itself; only the non-empty-content check remains here.
  const docs = await storage.getBasisDocsForEnquiry(enquiryRef, types);
  for (const type of types) {
    const match = docs.find((d) => d.docType === type && (d.content || "").trim());
    if (match) return match;
  }
  return null;
}

async function buildTfrData(
  reference: string,
  importEnq: TradeEnquiry,
  exportEnq: TradeEnquiry,
  commodityLabel?: string | null,
): Promise<{ tfrData: Record<string, string>; grossProfitLabel: string | null }> {
  const imp = partiesFromEnquiry(importEnq);
  const exp = partiesFromEnquiry(exportEnq);

  // The LOI (purchase side) and FCO (sale side) are the BASIS for the TFR:
  // when such documents exist for the linked enquiries, their rendered terms —
  // the instruments actually issued — take precedence over raw enquiry fields.
  // The cascade's SCO stands in for the sale side when no FCO exists, and any
  // side without a basis document falls back to the enquiry data unchanged.
  // (In the deal cascade the LOI/SCO are generated immediately before the TFR,
  // so the TFR always derives from the documents it accompanies.)
  const [loiDoc, fcoDoc] = await Promise.all([
    pickTfrBasisDoc(importEnq.enquiryRef, ["LOI"]),
    pickTfrBasisDoc(exportEnq.enquiryRef, ["FCO", "SCO"]),
  ]);
  const loi = loiDoc ? parseLoiForSpa(loiDoc.content || "") : null;
  const fco = fcoDoc ? parseGeneratedDocFields(fcoDoc.content || "") : null;
  const pick = (docVal: string | undefined, enqVal: string) =>
    docVal && docVal.trim() ? docVal.trim() : enqVal;

  const qty =
    toNumber(loi?.quantity) || toNumber(importEnq.quantity) ||
    toNumber(fco?.quantity) || toNumber(exportEnq.quantity);
  const purchasePrice = toNumber(loi?.price) || toNumber(importEnq.price);
  const salePrice = toNumber(fco?.price) || toNumber(exportEnq.price);
  const cur = loi?.currency || importEnq.currency || fco?.currency || exportEnq.currency || "USD";
  const purchaseCost = purchasePrice * qty;
  const saleRevenue = salePrice * qty;
  const grossProfit = saleRevenue - purchaseCost;
  const fmt = (n: number) => `${cur} ${n.toLocaleString()}`;

  // Addressee heading so the TFR can be sent directly to a bank. Pre-filled
  // from the import buyer's approved KYC bank details when available;
  // otherwise left blank for the admin to complete before sending.
  const buyerKyc = importEnq.buyerName
    ? await storage.getApprovedKycByCompanyName(importEnq.buyerName)
    : undefined;

  const tfrData: Record<string, string> = {
    reference,
    addressedToName: buyerKyc?.bankName || "",
    addressedToAddress: buyerKyc?.bankAddress || "",
    productImport: pick(loi?.commodity, importEnq.product || commodityLabel || ""),
    productExport: pick(fco?.commodity, exportEnq.product || commodityLabel || ""),
    originImport: pick(loi?.origin, imp.product.origin || ""),
    originExport: pick(fco?.origin, exp.product.origin || imp.product.origin || ""),
    destinationImport: pick(loi?.dischargePort, imp.product.dischargePort || ""),
    destinationExport: pick(fco?.dischargePort, exp.product.dischargePort || exp.product.origin || ""),
    quantityImport: pick(loi?.quantity, importEnq.quantity ? `${importEnq.quantity} ${importEnq.unit || "MT"}`.trim() : ""),
    quantityExport: pick(fco?.quantity, exportEnq.quantity ? `${exportEnq.quantity} ${exportEnq.unit || "MT"}`.trim() : ""),
    priceImport: purchasePrice ? fmt(purchasePrice) : "",
    priceExport: salePrice ? fmt(salePrice) : "",
    contractValueImport: purchaseCost ? fmt(purchaseCost) : "",
    contractValueExport: saleRevenue ? fmt(saleRevenue) : "",
    deliveryTermsImport: pick(loi?.incoterm, imp.product.incoterm || ""),
    deliveryTermsExport: pick(fco?.incoterm, exp.product.incoterm || ""),
    paymentTermsImport: pick(loi?.paymentTerms, imp.product.paymentTerms || ""),
    paymentTermsExport: pick(fco?.paymentTerms, exp.product.paymentTerms || ""),
    partyImport: pick(loi?.sellerName, imp.seller.name || ""),   // origin supplier (purchase side)
    partyExport: pick(fco?.buyerName, exp.buyer.name || ""),     // final customer (sale side)
    loadingPort: pick(loi?.loadingPort, imp.product.loadingPort || imp.product.origin || ""),
    dischargePort: pick(fco?.dischargePort, exp.product.dischargePort || ""),
  };
  // Record which instruments the TFR was derived from, so the reviewer can
  // trace every figure back to its basis document.
  if (loiDoc || fcoDoc) {
    tfrData.basisDocuments = [
      loiDoc ? `LOI: ${loiDoc.title}` : null,
      fcoDoc ? `${fcoDoc.docType}: ${fcoDoc.title}` : null,
    ].filter(Boolean).join(" · ");
  }
  let grossProfitLabel: string | null = null;
  if (purchaseCost) {
    tfrData.purchaseCostTotal = fmt(purchaseCost);
    tfrData.totalImport = fmt(purchaseCost);
    tfrData.importTotalCost = fmt(purchaseCost);
  }
  if (saleRevenue) {
    tfrData.totalExport = fmt(saleRevenue);
    tfrData.exportTotalCost = fmt(saleRevenue);
  }
  if (purchaseCost && saleRevenue) {
    grossProfitLabel = fmt(grossProfit);
    tfrData.grossProfitTotal = grossProfitLabel;
    tfrData.sumGrossProfit = grossProfitLabel;
    tfrData.grossMargin = `${((grossProfit / saleRevenue) * 100).toFixed(1)}%`;
  }
  return { tfrData, grossProfitLabel };
}

// Ordered cascade stages. Used to advance a deal's stage monotonically so a
// resumed/retried cascade never regresses an already-advanced deal.
const DEAL_STAGE_ORDER = ["matched", "documents_issued", "recaps_issued", "tfr_pending", "trade_formed"];
function stageRank(stage: string | null | undefined): number {
  const i = DEAL_STAGE_ORDER.indexOf(stage || "matched");
  return i === -1 ? 0 : i;
}

// Runs the full automatic document cascade for a deal:
//   LOI (import) + SCO (export) -> Deal Recap Import + Deal Recap Export -> TFR
// All intermediate docs are auto-accepted; the TFR is left pending admin approval.
//
// Idempotent / retry-safe: every step is create-if-missing keyed off the deal's
// stored doc ids, so re-running after a partial failure resumes from where it
// stopped without duplicating documents. Stage only ever advances forward, and a
// previously-recorded cascadeError is cleared once the cascade completes.
export async function runDealCascade(deal: Deal, importEnq: TradeEnquiry, exportEnq: TradeEnquiry): Promise<Deal> {
  const imp = partiesFromEnquiry(importEnq);
  const exp = partiesFromEnquiry(exportEnq);
  let current = deal;

  // Every deal update must observe that the deal still exists: a concurrent
  // TFR cancellation deletes the deal row, and a cascade that keeps running
  // afterwards would create documents belonging to no deal. When the update
  // matches no row, remove the just-created document (if any) and abort.
  const updateOrAbort = async (data: Partial<Deal>, createdDocId?: string): Promise<void> => {
    const updated = await storage.updateDeal(current.id, data);
    if (!updated) {
      if (createdDocId) {
        try { await deleteDocumentWithFiles(createdDocId); } catch { /* best-effort */ }
      }
      throw new Error("Deal was cancelled while the cascade was running");
    }
    current = updated;
  };

  const advanceStage = async (target: string) => {
    if (stageRank(current.stage) < stageRank(target)) {
      await updateOrAbort({ stage: target });
    }
  };

  // 1. LOI for the Import (buy) side — buyer issues a Purchase LOI to the supplier.
  if (!current.loiDocId) {
    const loi = await createPipelineDoc({
      docType: "LOI",
      title: `LOI - ${current.dealRef}`,
      buyer: imp.buyer,
      seller: imp.seller,
      product: imp.product,
      enquiryRef: importEnq.enquiryRef,
      status: "accepted",
      autoAccept: true,
    });
    await updateOrAbort({ loiDocId: loi.id }, loi.id);
  }

  // 2. SCO for the Export (sell) side — seller issues a Soft Corporate Offer to the buyer.
  if (!current.scoDocId) {
    const sco = await createPipelineDoc({
      docType: "SCO",
      title: `SCO - ${current.dealRef}`,
      buyer: exp.buyer,
      seller: exp.seller,
      product: exp.product,
      enquiryRef: exportEnq.enquiryRef,
      status: "accepted",
      autoAccept: true,
    });
    await updateOrAbort({ scoDocId: sco.id }, sco.id);
  }
  await advanceStage("documents_issued");

  // 3. Deal Recap (Import) — derived from the LOI.
  if (!current.dealRecapImportDocId) {
    const importRecapNum = dealRecapNumberFor(imp.buyer.name || "", imp.seller.name || "", 1);
    const dealRecapImport = await createPipelineDoc({
      docType: "DEAL_RECAP",
      title: `Deal Recap (Import) - ${importRecapNum}`,
      buyer: imp.buyer,
      seller: imp.seller,
      product: { ...imp.product, dealRecapNumber: importRecapNum },
      enquiryRef: importEnq.enquiryRef,
      parentDocId: current.loiDocId,
      dealRecapNumber: importRecapNum,
      status: "accepted",
      autoAccept: true,
    });
    await updateOrAbort({ dealRecapImportDocId: dealRecapImport.id }, dealRecapImport.id);
  }

  // 4. Deal Recap (Export) — derived from the SCO.
  if (!current.dealRecapExportDocId) {
    const exportRecapNum = dealRecapNumberFor(exp.buyer.name || "", exp.seller.name || "", 2);
    const dealRecapExport = await createPipelineDoc({
      docType: "DEAL_RECAP",
      title: `Deal Recap (Export) - ${exportRecapNum}`,
      buyer: exp.buyer,
      seller: exp.seller,
      product: { ...exp.product, dealRecapNumber: exportRecapNum },
      enquiryRef: exportEnq.enquiryRef,
      parentDocId: current.scoDocId,
      dealRecapNumber: exportRecapNum,
      status: "accepted",
      autoAccept: true,
    });
    await updateOrAbort({ dealRecapExportDocId: dealRecapExport.id }, dealRecapExport.id);
  }
  await advanceStage("recaps_issued");

  // 5. Single TFR consolidating BOTH recaps (import = purchase side, export = sale side).
  if (!current.tfrDocId) {
    const { tfrData } = await buildTfrData(current.dealRef, importEnq, exportEnq, current.commodity);
    // Manually incorporated details (addressee, costs, banking assessment…)
    // always win over auto-derived values when the TFR is (re)generated.
    if (current.tfrManualDetails) Object.assign(tfrData, current.tfrManualDetails);
    const tfr = await createPipelineDoc({
      docType: "TFR",
      title: `TFR - ${current.dealRef}`,
      buyer: { name: exp.buyer.name },
      seller: { name: imp.seller.name },
      product: { tfrData },
      enquiryRef: importEnq.enquiryRef,
      parentDocId: current.dealRecapImportDocId,
      status: "pending_review",
      autoAccept: false,
    });
    await updateOrAbort({ tfrDocId: tfr.id }, tfr.id);
  }
  await advanceStage("tfr_pending");

  // Cascade completed cleanly — clear any error recorded by a previous attempt.
  if (current.cascadeError) {
    await updateOrAbort({ cascadeError: null });
  }
  return current;
}

// Re-run the cascade for an existing deal (admin retry after a partial failure).
// Reloads the deal + its linked enquiries and relies on runDealCascade's
// create-if-missing behaviour to fill in only the missing documents.
export async function resumeDealCascade(dealId: string): Promise<PipelineResult<Deal>> {
  const deal = await storage.getDealById(dealId);
  if (!deal) return { ok: false, status: 404, message: "Deal not found" };
  if (stageRank(deal.stage) >= stageRank("trade_formed")) {
    return { ok: false, status: 409, message: "Deal already has a formed trade; nothing to resume" };
  }
  const enquiries = await storage.getTradeEnquiries();
  const importEnq = enquiries.find(e => e.enquiryRef === deal.importEnquiryRef);
  const exportEnq = enquiries.find(e => e.enquiryRef === deal.exportEnquiryRef);
  if (!importEnq || !exportEnq) return { ok: false, status: 404, message: "Linked enquiries not found" };
  try {
    const value = await runDealCascade(deal, importEnq, exportEnq);
    return { ok: true, value };
  } catch (cascadeErr: any) {
    console.error("[deals] Cascade resume failed:", cascadeErr);
    const value = await storage.updateDeal(deal.id, { cascadeError: cascadeErr?.message || "Cascade failed" });
    if (!value) return { ok: false, status: 409, message: "Deal was cancelled while the cascade was running" };
    return { ok: true, value };
  }
}

// Result wrapper so this logic can be unit/integration tested independently of
// the HTTP layer while the route handler maps {ok,status,message} onto a response.
type PipelineResult<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

// Create a deal from a matched Import/Export enquiry pair and run the document
// cascade. Enforces side/commodity validity and prevents an enquiry that already
// belongs to a deal from being reused (both via an explicit check and the DB
// unique constraint that wins concurrent races).
// Shared completeness gate for deal formation and TFR approval: every enquiry
// entering (or already inside) a deal must have its key commercial details
// entered, so accepted enquiries and generated documents are never blank.
function enquiryPairDetailsError(importEnq: TradeEnquiry, exportEnq: TradeEnquiry): string | null {
  const problems: string[] = [];
  for (const enq of [importEnq, exportEnq]) {
    const missing = missingEnquiryAcceptanceDetails(enq);
    if (missing.length) problems.push(`${enq.enquiryRef} is missing: ${missing.join(", ")}`);
  }
  return problems.length
    ? `Enquiry details are incomplete — ${problems.join("; ")}. Edit the enquiries, then try again.`
    : null;
}

export async function createDealFromEnquiries(
  importEnquiryRef: string,
  exportEnquiryRef: string,
  // Admin manual-match override: skips the same-commodity guard so an admin can
  // deliberately pair enquiries whose product names differ (e.g. spelling
  // variants or a substitutable grade). Side (buy/sell) and already-in-a-deal
  // checks still apply.
  opts?: {
    allowCommodityMismatch?: boolean;
    // Manual TFR details carried over from a graduating candidate TFR: stored
    // on the deal row at creation so the cascade's TFR generation (which merges
    // tfrManualDetails over the auto-derived data) includes them immediately.
    tfrManualDetails?: Record<string, string> | null;
  },
): Promise<PipelineResult<Deal>> {
  if (!importEnquiryRef || !exportEnquiryRef) {
    return { ok: false, status: 400, message: "importEnquiryRef and exportEnquiryRef are required" };
  }
  const enquiries = await storage.getTradeEnquiries();
  const importEnq = enquiries.find(e => e.enquiryRef === importEnquiryRef);
  const exportEnq = enquiries.find(e => e.enquiryRef === exportEnquiryRef);
  if (!importEnq || !exportEnq) return { ok: false, status: 404, message: "Enquiry not found" };
  if (importEnq.side !== "buy") return { ok: false, status: 400, message: "importEnquiryRef must be an Import (buy) enquiry" };
  if (exportEnq.side !== "sell") return { ok: false, status: 400, message: "exportEnquiryRef must be an Export (sell) enquiry" };
  // Same MAIN product counts as the same commodity: enquiries share a product
  // block when their names map to one canonical group (e.g. "Granular Sulphur"
  // + "Sulphur 99.9%"), so pairing within a block must be allowed too.
  const sameCommodity =
    (importEnq.product || "").trim().toLowerCase() === (exportEnq.product || "").trim().toLowerCase() ||
    sameProductGroup(importEnq.product, exportEnq.product);
  if (!sameCommodity && !opts?.allowCommodityMismatch) {
    return { ok: false, status: 400, message: "Import and Export enquiries must be for the same commodity" };
  }
  // Both enquiries must carry the required commercial details before a deal
  // can form — otherwise the cascade generates TFR/documents with blank fields.
  const detailsErr = enquiryPairDetailsError(importEnq, exportEnq);
  if (detailsErr) return { ok: false, status: 400, message: detailsErr };
  const existingDeals = await storage.getDeals();
  const used = new Set<string>();
  for (const d of existingDeals) { used.add(d.importEnquiryRef); used.add(d.exportEnquiryRef); }
  if (used.has(importEnquiryRef) || used.has(exportEnquiryRef)) {
    return { ok: false, status: 409, message: "One or both enquiries are already part of a deal" };
  }

  const year = new Date().getFullYear();
  const dealRef = `DEAL-${year}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
  let deal: Deal;
  try {
    // Manual cross-commodity pairs record both product names so the deal row
    // is honest about what was matched.
    const commodity = (importEnq.product || "").trim().toLowerCase() === (exportEnq.product || "").trim().toLowerCase()
      ? importEnq.product
      : `${importEnq.product} / ${exportEnq.product}`;
    deal = await storage.createDeal({
      dealRef, importEnquiryRef, exportEnquiryRef, commodity,
      ...(opts?.tfrManualDetails && Object.keys(opts.tfrManualDetails).length
        ? { tfrManualDetails: opts.tfrManualDetails }
        : {}),
    });
  } catch (insertErr: any) {
    // Unique constraint on import/export enquiry refs — a concurrent request
    // won the race. Drizzle wraps the pg error, so the SQLSTATE may live on
    // `.cause` rather than the thrown error itself.
    if (insertErr?.code === "23505" || insertErr?.cause?.code === "23505") {
      return { ok: false, status: 409, message: "One or both enquiries are already part of a deal" };
    }
    throw insertErr;
  }
  // A deal now owns these enquiries — any still-active candidate TFRs that
  // reference either one are no longer viable comparisons; cancel them so
  // stale candidate TFR documents don't linger.
  try {
    await cancelActiveTfrCandidatesForRefs(importEnquiryRef, exportEnquiryRef);
  } catch (candErr) {
    console.error("[deals] Failed to cancel overlapping TFR candidates:", candErr);
  }
  try {
    deal = await runDealCascade(deal, importEnq, exportEnq);
  } catch (cascadeErr: any) {
    console.error("[deals] Cascade failed:", cascadeErr);
    // If the deal was cancelled mid-cascade, the row is gone and the error
    // cannot be recorded — report the cancellation instead of a phantom deal.
    const errored = await storage.updateDeal(deal.id, { cascadeError: cascadeErr?.message || "Cascade failed" });
    if (!errored) return { ok: false, status: 409, message: "Deal was cancelled while the cascade was running" };
    deal = errored;
  }
  return { ok: true, value: deal };
}

// Delete a generated document together with its DOCX/PDF files on disk. All
// pipeline/candidate cleanup paths must use this (not bare storage.deleteDocument)
// so cancelled drafts never leave orphaned files behind.
async function deleteDocumentWithFiles(docId: string): Promise<void> {
  const doc = await storage.getDocumentById(docId);
  if (!doc) return;
  for (const p of [doc.docxPath, doc.pdfPath]) {
    if (!p) continue;
    const fullPath = getDocFilePath(p);
    if (fullPath) {
      try { fs.unlinkSync(fullPath); } catch { /* file may already be gone */ }
    }
  }
  await storage.deleteDocument(doc.id);
}

// Cancel an already-created, deal-backed TFR before the trade is formed. The
// TFR consolidates the whole deal, so cancelling it dissolves the deal: every
// cascade document (LOI, SCO, both Deal Recaps, TFR) is removed and the deal
// row deleted, freeing both enquiries back onto the matching board. Blocked —
// atomically — once the TFR has been approved and the trade formed.
export async function cancelDealTfr(dealId: string): Promise<PipelineResult<{ cancelled: true }>> {
  const deal = await storage.getDealById(dealId);
  if (!deal) return { ok: false, status: 404, message: "Deal not found" };
  if (deal.tradeRef || deal.stage === "trade_formed") {
    return { ok: false, status: 409, message: "The TFR was already approved and the trade formed; it can no longer be cancelled" };
  }
  // Cascade documents can be parents for derived documents (e.g. a Deal Recap
  // -> SPA). Deleting a parent would strand its descendants, so cancellation
  // is prohibited while any derived child exists — remove those first.
  const cascadeDocIds = [
    deal.loiDocId, deal.scoDocId, deal.dealRecapImportDocId,
    deal.dealRecapExportDocId, deal.tfrDocId,
  ].filter(Boolean) as string[];
  if (cascadeDocIds.length) {
    const allDocs = await storage.getDocuments();
    const idSet = new Set(cascadeDocIds);
    // The cascade documents parent EACH OTHER (recap -> LOI/SCO, TFR ->
    // import recap); only documents OUTSIDE the cascade count as derived.
    const child = allDocs.find(doc => doc.parentDocId && idSet.has(doc.parentDocId) && !idSet.has(doc.id));
    if (child) {
      return {
        ok: false, status: 409,
        message: `Documents have already been derived from this deal's cascade (e.g. ${child.docType} "${child.title}"); delete them first, then cancel the TFR`,
      };
    }
  }
  // Conditional DELETE claims the deal (wins/loses a concurrent approve-TFR
  // race atomically) BEFORE removing documents, so approval can never mint a
  // trade from a half-deleted cascade.
  const removed = await storage.deleteDealIfNoTrade(dealId);
  if (!removed) {
    return { ok: false, status: 409, message: "The TFR was already approved and the trade formed; it can no longer be cancelled" };
  }
  const docIds = [
    removed.loiDocId, removed.scoDocId, removed.dealRecapImportDocId,
    removed.dealRecapExportDocId, removed.tfrDocId,
  ].filter(Boolean) as string[];
  for (const id of docIds) {
    try {
      await deleteDocumentWithFiles(id);
    } catch (delErr) {
      // The deal row is already gone (enquiries freed); a straggler document
      // is admin-visible and deletable manually — log rather than fail.
      console.error(`[deals] Failed to delete cascade doc ${id} while cancelling TFR:`, delErr);
    }
  }
  // A candidate that graduated into this deal now points at a deleted deal —
  // mark it cancelled and detach it so no dangling deal reference survives.
  try {
    const candidates = await storage.getTfrCandidates();
    for (const c of candidates) {
      if (c.dealId === removed.id) {
        await storage.updateTfrCandidate(c.id, { status: "cancelled", dealId: null });
      }
    }
  } catch (candErr) {
    console.error("[deals] Failed to detach candidates from dissolved deal:", candErr);
  }
  return { ok: true, value: { cancelled: true } };
}

// ----------------------------------------------------------------------------
// Candidate TFRs — compare Import/Export combinations BEFORE forming a deal.
// An admin can prepare TFRs for several pairings (the same enquiry may appear
// in multiple candidates), compare the figures, cancel the ones not wanted,
// and create the deal from the best one. Creating a deal cancels every other
// active candidate that shares either enquiry.
// ----------------------------------------------------------------------------

// Validate an Import/Export pairing the same way deal formation does (sides,
// commodity unless manual override, and neither enquiry already in a deal).
async function validateTfrPairing(
  importEnquiryRef: string,
  exportEnquiryRef: string,
  opts?: { allowCommodityMismatch?: boolean },
): Promise<PipelineResult<{ importEnq: TradeEnquiry; exportEnq: TradeEnquiry; sameCommodity: boolean }>> {
  if (!importEnquiryRef || !exportEnquiryRef) {
    return { ok: false, status: 400, message: "importEnquiryRef and exportEnquiryRef are required" };
  }
  const enquiries = await storage.getTradeEnquiries();
  const importEnq = enquiries.find(e => e.enquiryRef === importEnquiryRef);
  const exportEnq = enquiries.find(e => e.enquiryRef === exportEnquiryRef);
  if (!importEnq || !exportEnq) return { ok: false, status: 404, message: "Enquiry not found" };
  if (importEnq.side !== "buy") return { ok: false, status: 400, message: "importEnquiryRef must be an Import (buy) enquiry" };
  if (exportEnq.side !== "sell") return { ok: false, status: 400, message: "exportEnquiryRef must be an Export (sell) enquiry" };
  // Same MAIN product counts as the same commodity: enquiries share a product
  // block when their names map to one canonical group (e.g. "Granular Sulphur"
  // + "Sulphur 99.9%"), so pairing within a block must be allowed too.
  const sameCommodity =
    (importEnq.product || "").trim().toLowerCase() === (exportEnq.product || "").trim().toLowerCase() ||
    sameProductGroup(importEnq.product, exportEnq.product);
  if (!sameCommodity && !opts?.allowCommodityMismatch) {
    return { ok: false, status: 400, message: "Import and Export enquiries must be for the same commodity" };
  }
  const existingDeals = await storage.getDeals();
  const used = new Set<string>();
  for (const d of existingDeals) { used.add(d.importEnquiryRef); used.add(d.exportEnquiryRef); }
  if (used.has(importEnquiryRef) || used.has(exportEnquiryRef)) {
    return { ok: false, status: 409, message: "One or both enquiries are already part of a deal" };
  }
  return { ok: true, value: { importEnq, exportEnq, sameCommodity } };
}

// Cancel an active candidate: remove its TFR document (files + row) FIRST,
// then mark the candidate cancelled. Document deletion failures propagate —
// a cancel must never report success while leaving the draft TFR behind.
// Safe to call for already-inactive candidates (no-op).
async function cancelTfrCandidateRow(candidate: TfrCandidate): Promise<TfrCandidate> {
  if (candidate.status !== "active") return candidate;
  if (candidate.tfrDocId) {
    await deleteDocumentWithFiles(candidate.tfrDocId);
  }
  return storage.updateTfrCandidate(candidate.id, { status: "cancelled", tfrDocId: null });
}

async function cancelActiveTfrCandidatesForRefs(importEnquiryRef: string, exportEnquiryRef: string): Promise<void> {
  const candidates = await storage.getTfrCandidates();
  for (const c of candidates) {
    if (c.status !== "active") continue;
    if (
      c.importEnquiryRef === importEnquiryRef || c.exportEnquiryRef === exportEnquiryRef ||
      c.importEnquiryRef === exportEnquiryRef || c.exportEnquiryRef === importEnquiryRef
    ) {
      try {
        await cancelTfrCandidateRow(c);
      } catch (err) {
        // Best-effort sweep: one candidate's doc-cleanup failure must not stop
        // the others from being cancelled. The failed one stays 'active' and
        // simply 409s later (its enquiries are now in a deal).
        console.error(`[tfr-candidates] Failed to cancel overlapping candidate ${c.candidateRef}:`, err);
      }
    }
  }
}

// Prepare a candidate TFR for an Import/Export pairing without forming a deal.
// The TFR document is created as a draft so it is clearly not a final,
// deal-backed TFR. The same enquiry may appear in several candidates; only an
// identical active pairing is rejected as a duplicate.
export async function prepareTfrCandidate(
  importEnquiryRef: string,
  exportEnquiryRef: string,
  opts?: { allowCommodityMismatch?: boolean },
): Promise<PipelineResult<TfrCandidate>> {
  const validated = await validateTfrPairing(importEnquiryRef, exportEnquiryRef, opts);
  if (!validated.ok) return validated;
  const { importEnq, exportEnq, sameCommodity } = validated.value;

  const existing = await storage.getTfrCandidates();
  if (existing.some(c =>
    c.status === "active" && c.importEnquiryRef === importEnquiryRef && c.exportEnquiryRef === exportEnquiryRef
  )) {
    return { ok: false, status: 409, message: "A candidate TFR for this exact combination is already prepared" };
  }

  const commodity = (importEnq.product || "").trim().toLowerCase() === (exportEnq.product || "").trim().toLowerCase()
    ? (importEnq.product || "")
    : `${importEnq.product} / ${exportEnq.product}`;
  const year = new Date().getFullYear();
  const candidateRef = `TFRC-${year}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
  const { tfrData, grossProfitLabel } = await buildTfrData(candidateRef, importEnq, exportEnq, commodity);
  const imp = partiesFromEnquiry(importEnq);
  const exp = partiesFromEnquiry(exportEnq);
  const tfr = await createPipelineDoc({
    docType: "TFR",
    title: `TFR (Candidate) - ${candidateRef}`,
    buyer: { name: exp.buyer.name },
    seller: { name: imp.seller.name },
    product: { tfrData },
    enquiryRef: importEnq.enquiryRef,
    status: "draft",
    autoAccept: false,
  });
  const candidate = await storage.createTfrCandidate({
    candidateRef,
    importEnquiryRef,
    exportEnquiryRef,
    commodity,
    manualMatch: !sameCommodity,
    grossProfit: grossProfitLabel,
    tfrDocId: tfr.id,
  });
  return { ok: true, value: candidate };
}

// Cancel a prepared candidate TFR (admin decided against this combination).
export async function cancelTfrCandidate(id: string): Promise<PipelineResult<TfrCandidate>> {
  const candidate = await storage.getTfrCandidateById(id);
  if (!candidate) return { ok: false, status: 404, message: "Candidate TFR not found" };
  if (candidate.status !== "active") {
    return { ok: false, status: 409, message: `Candidate TFR is already ${candidate.status === "deal_formed" ? "part of a deal" : "cancelled"}` };
  }
  const cancelled = await cancelTfrCandidateRow(candidate);
  return { ok: true, value: cancelled };
}

// The admin picked this combination as the best one: form the deal and run the
// full document cascade (which generates the real, deal-backed TFR). The
// candidate's draft TFR is removed and every other active candidate sharing
// either enquiry is cancelled (inside createDealFromEnquiries).
export async function createDealFromTfrCandidate(id: string): Promise<PipelineResult<Deal>> {
  const existing = await storage.getTfrCandidateById(id);
  if (!existing) return { ok: false, status: 404, message: "Candidate TFR not found" };
  // Atomically claim the candidate (active -> deal_formed). The conditional
  // single-row UPDATE is the arbiter of concurrent create-deal/cancel races:
  // exactly one request wins; everyone else gets a 409.
  const candidate = await storage.claimTfrCandidate(id);
  if (!candidate) {
    const now = await storage.getTfrCandidateById(id);
    return { ok: false, status: 409, message: `Candidate TFR is already ${now?.status === "cancelled" ? "cancelled" : "part of a deal"}` };
  }
  let result: PipelineResult<Deal>;
  try {
    result = await createDealFromEnquiries(candidate.importEnquiryRef, candidate.exportEnquiryRef, {
      allowCommodityMismatch: candidate.manualMatch,
      // Manual details entered on the candidate carry into the deal-backed TFR.
      tfrManualDetails: candidate.manualDetails ?? null,
    });
  } catch (err) {
    // Unexpected failure: release the claim so the candidate is usable again.
    await storage.updateTfrCandidate(candidate.id, { status: "active" });
    throw err;
  }
  if (!result.ok) {
    if (result.status === 409) {
      // Lost a race: another deal now owns one of these enquiries, so this
      // candidate can never form a deal — cancel it (removing its draft TFR)
      // instead of leaving a permanently unusable "active" candidate behind.
      const reverted = await storage.updateTfrCandidate(candidate.id, { status: "active" });
      try {
        await cancelTfrCandidateRow(reverted);
      } catch (cleanupErr) {
        console.error("[tfr-candidates] Failed to cancel raced-out candidate:", cleanupErr);
      }
    } else {
      await storage.updateTfrCandidate(candidate.id, { status: "active" });
    }
    return result;
  }
  // Deal formed. The claimed candidate was skipped by the overlapping-candidate
  // cancellation (it was no longer 'active'), so remove its draft TFR here —
  // the deal cascade generated the real, deal-backed TFR. If deletion fails,
  // keep tfrDocId so the draft stays visible/cleanable rather than orphaned.
  let clearedDocId = false;
  if (candidate.tfrDocId) {
    try {
      await deleteDocumentWithFiles(candidate.tfrDocId);
      clearedDocId = true;
    } catch (delErr) {
      console.error("[tfr-candidates] Failed to delete graduated candidate's draft TFR:", delErr);
    }
  }
  await storage.updateTfrCandidate(candidate.id, {
    dealId: result.value.id,
    ...(clearedDocId ? { tfrDocId: null } : {}),
  });
  return result;
}

// A proposed Import<->Export pairing surfaced to admins before they form a deal.
export type EnquiryMatch = { id: string; import: TradeEnquiry; export: TradeEnquiry };

// Two enquiries match when they reference the same commodity, ignoring case and
// surrounding whitespace. An enquiry with a missing/blank commodity never
// matches anything (a blank product is not a real commodity to pair on).
export function enquiryProductsMatch(a: TradeEnquiry, b: TradeEnquiry): boolean {
  const pa = (a.product || "").trim().toLowerCase();
  const pb = (b.product || "").trim().toLowerCase();
  if (!pa || !pb) return false;
  // Exact-name match OR same canonical MAIN product group (e.g. "Granular
  // Sulphur" vs "Sulphur 99.9%") — consistent with the one-block-per-main-
  // product enquiry board and the deal-formation commodity guard.
  return pa === pb || sameProductGroup(a.product, b.product);
}

// Which enquiry statuses are eligible for pairing. These are exactly the
// "pending" statuses from the shared single source of truth in @shared/schema
// (an ALLOWLIST, not a denylist): a status must be in that pending group to be
// surfaced in admin pairings, so a newly introduced status can never silently
// start appearing in pairings. Excluded by design:
//   - "accepted" — already committed to a deal; pairing it again is wrong
//   - "closed" / "cancelled" / "rejected" — terminal, no longer actionable
export const MATCHABLE_ENQUIRY_STATUSES = new Set<string>(ENQUIRY_STATUS_PENDING);

// Whether an enquiry in the given status may be surfaced as a pairing candidate.
export const isEnquiryStatusMatchable = isEnquiryStatusPending;

// Fields an enquiry amendment (change request) is permitted to alter. Anything
// outside this allowlist is silently dropped so an amendment can't touch
// identity/workflow columns (status, enquiryRef, ids, blockchain fields, ...).
export const ALLOWED_ENQUIRY_CHANGE_FIELDS = new Set([
  "product", "specifications", "producer", "quantity", "unit", "packing",
  "loadingPort", "dischargePort", "incoterms", "validity", "additionalInfo",
  "origin", "deliveryPeriod", "price", "currency", "paymentTerms",
  "buyerName", "sellerName",
  "coBuyerName", "coBuyerAddress", "coBuyerContact",
  "coSellerName", "coSellerAddress", "coSellerContact",
  "createdBy", "email",
]);

// Validate + normalise the changedFields of an enquiry amendment before it is
// stored. Returns the cleaned, allowlisted field map on success, or an error
// message on rejection. Extracted from the POST
// /api/trade-enquiries/:id/change-request handler so the rules — in particular
// that an amendment can never blank out the commodity — can be tested directly.
export function sanitizeEnquiryChangeFields(
  changedFields: unknown,
):
  | { ok: true; fields: Record<string, string> }
  | { ok: false; message: string } {
  if (
    !changedFields ||
    typeof changedFields !== "object" ||
    Array.isArray(changedFields) ||
    Object.keys(changedFields).length === 0
  ) {
    return { ok: false, message: "changedFields must be a non-empty object" };
  }
  const sanitized: Record<string, string> = {};
  for (const [key, val] of Object.entries(changedFields)) {
    if (ALLOWED_ENQUIRY_CHANGE_FIELDS.has(key) && typeof val === "string") sanitized[key] = val;
  }
  // A blank commodity makes an enquiry unusable for matching/deals — never let
  // an amendment clear it. Trim the change so the stored value can't be padded.
  if ("product" in sanitized) {
    const trimmed = sanitized.product.trim();
    if (!trimmed) return { ok: false, message: "Commodity is required and cannot be blank" };
    sanitized.product = trimmed;
  }
  if (Object.keys(sanitized).length === 0) return { ok: false, message: "No valid fields to change" };
  return { ok: true, fields: sanitized };
}

// Fields a KYC profile amendment (change request) is permitted to alter.
// Anything outside this allowlist is silently dropped so an amendment can't
// touch identity/workflow columns (status, participantId, credentials,
// blockchain fields, AML/OFAC results, ...).
export const ALLOWED_KYC_CHANGE_FIELDS = new Set([
  "companyName", "registeredAddress", "primaryBusinessAddress",
  "dateOfIncorporation", "countryOfIncorporation", "countryOfOperation",
  "registrationNumber", "taxIdNumber", "businessType", "coreBusinessDescription",
  "ultimateBeneficialOwners", "shareholders", "managementStructure",
  "subsidiaries", "listingInfo", "shareCapital", "capitalRange",
  "financialCurrency", "salesRevenue", "netIncome", "totalEquity",
  "totalBalanceSheet", "lastReportingPeriod", "externalAuditors",
  "bankName", "bankBranch", "bankAddress", "accountName", "accountNumber",
  "swiftCode", "bankAccountCurrency", "bankOfficerName", "bankOfficerEmail",
  "additionalBanks", "employeesCompany", "employeesGroup",
  "previousBullfrogEmployee", "amlSubject", "amlConformityProgram",
  "amlRegulator", "amlLawName", "documentReasons",
  "contactName", "contactTitle", "contactPhone", "contactEmail",
  "faxNumber", "website", "signatoryName", "signatoryTitle",
  "signatoryCompany", "signatoryEmail", "signatoryPlaceDate",
  "filledByName", "filledByEmail",
]);

const KYC_ADMIN_CLASSIFICATION_FIELDS = new Set(["category", "products", "reviewNotes"]);
const KYC_ADMIN_AMEND_FIELDS = new Set([
  ...ALLOWED_KYC_CHANGE_FIELDS,
  ...KYC_ADMIN_CLASSIFICATION_FIELDS,
  "clientUsername",
]);

// KYC columns that are NOT NULL in the schema. An amendment must never blank or
// whitespace these out — doing so would corrupt an approved onboarding record.
export const REQUIRED_KYC_CHANGE_FIELDS = new Set([
  "companyName", "registeredAddress", "dateOfIncorporation",
  "countryOfIncorporation", "registrationNumber",
  "contactName", "contactTitle", "contactPhone", "contactEmail",
]);

const KYC_EMAIL_FIELDS = new Set([
  "contactEmail", "bankOfficerEmail", "signatoryEmail", "filledByEmail",
]);

const KYC_SCREENING_INPUT_FIELDS = new Set([
  "companyName", "registeredAddress", "primaryBusinessAddress",
  "dateOfIncorporation", "countryOfIncorporation", "countryOfOperation",
  "registrationNumber", "taxIdNumber", "businessType", "coreBusinessDescription",
  "ultimateBeneficialOwners", "shareholders", "managementStructure",
  "subsidiaries", "listingInfo", "contactName", "contactTitle",
  "contactPhone", "contactEmail", "signatoryName", "signatoryTitle",
  "signatoryCompany", "signatoryEmail",
]);

const isValidKycEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Validate + normalise the changedFields of a KYC profile amendment before it is
// stored. Returns the cleaned, allowlisted field map on success, or an error
// message on rejection. Extracted from the POST /api/kyc/:id/change-request
// handler so the rules — in particular that an amendment can never blank out a
// required field — can be tested directly, mirroring sanitizeEnquiryChangeFields.
export function sanitizeKycChangeFields(
  changedFields: unknown,
):
  | { ok: true; fields: Record<string, any> }
  | { ok: false; message: string } {
  if (
    !changedFields ||
    typeof changedFields !== "object" ||
    Array.isArray(changedFields) ||
    Object.keys(changedFields).length === 0
  ) {
    return { ok: false, message: "changedFields must be a non-empty object" };
  }
  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(changedFields)) {
    if (!ALLOWED_KYC_CHANGE_FIELDS.has(key)) continue;
    if (key === "additionalBanks") {
      const parsed = bankEntrySchema.strict().array().max(20).safeParse(val ?? []);
      if (!parsed.success) {
        return { ok: false, message: "Additional banks must be a valid list of bank accounts" };
      }
      const banks = parsed.data.map((bank) => {
        const cleaned = Object.fromEntries(
          Object.entries(bank).map(([field, value]) => [field, value.trim()]),
        ) as typeof bank;
        return cleaned;
      });
      const invalidBankEmailIndex = banks.findIndex(
        (bank) => bank.bankOfficerEmail && !isValidKycEmail(bank.bankOfficerEmail),
      );
      if (invalidBankEmailIndex !== -1) {
        return { ok: false, message: `Additional bank ${invalidBankEmailIndex + 2} officer email is invalid` };
      }
      sanitized[key] = banks;
      continue;
    }
    if (val === null) {
      if (REQUIRED_KYC_CHANGE_FIELDS.has(key)) {
        return { ok: false, message: `${key} is required and cannot be blank` };
      }
      sanitized[key] = null;
      continue;
    }
    if (typeof val !== "string") {
      return { ok: false, message: `${key} must be text` };
    }
    sanitized[key] = val;
  }
  // Trim every change so a stored value can't be padded, and never let a
  // required field be cleared by a blank/whitespace-only amendment.
  for (const key of Object.keys(sanitized)) {
    if (typeof sanitized[key] !== "string") continue;
    const trimmed = sanitized[key].trim();
    if (REQUIRED_KYC_CHANGE_FIELDS.has(key) && !trimmed) {
      return { ok: false, message: `${key} is required and cannot be blank` };
    }
    if (KYC_EMAIL_FIELDS.has(key) && trimmed && !isValidKycEmail(trimmed)) {
      return { ok: false, message: `${key} must be a valid email address` };
    }
    sanitized[key] = trimmed;
  }
  if (Object.keys(sanitized).length === 0) return { ok: false, message: "No valid fields to change" };
  return { ok: true, fields: sanitized };
}

export function sanitizeKycAdminAmendFields(
  changedFields: unknown,
  existing: { status?: string | null; clientUsername?: string | null },
):
  | { ok: true; fields: Record<string, any> }
  | { ok: false; message: string } {
  if (!changedFields || typeof changedFields !== "object" || Array.isArray(changedFields)) {
    return { ok: false, message: "Amendment must be a non-empty object" };
  }
  const entries = Object.entries(changedFields);
  if (entries.length === 0) return { ok: false, message: "No editable fields supplied" };
  const unknown = entries.find(([key]) => !KYC_ADMIN_AMEND_FIELDS.has(key));
  if (unknown) return { ok: false, message: `Field "${unknown[0]}" cannot be amended` };

  const applicantFields = Object.fromEntries(entries.filter(([key]) => ALLOWED_KYC_CHANGE_FIELDS.has(key)));
  const fields: Record<string, any> = {};
  if (Object.keys(applicantFields).length > 0) {
    const result = sanitizeKycChangeFields(applicantFields);
    if (!result.ok) return result;
    Object.assign(fields, result.fields);
  }
  for (const [key, value] of entries.filter(([key]) => KYC_ADMIN_CLASSIFICATION_FIELDS.has(key))) {
    if (value === null) {
      fields[key] = null;
      continue;
    }
    if (typeof value !== "string") return { ok: false, message: `${key} must be text` };
    const trimmed = value.trim();
    if (key === "reviewNotes" && trimmed.length > 2000) {
      return { ok: false, message: "Review notes must be under 2000 characters" };
    }
    fields[key] = trimmed;
  }

  if ("clientUsername" in (changedFields as Record<string, unknown>)) {
    if (existing.status !== "approved" || !existing.clientUsername) {
      return { ok: false, message: "A portal username can only be changed for an approved, allocated client account" };
    }
    const value = (changedFields as Record<string, unknown>).clientUsername;
    if (typeof value !== "string") return { ok: false, message: "clientUsername must be text" };
    const username = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) {
      return { ok: false, message: "Client username must be 3–64 characters using letters, numbers, dots, underscores, or hyphens" };
    }
    fields.clientUsername = username;
  }

  if (Object.keys(fields).length === 0) return { ok: false, message: "No editable fields supplied" };
  return { ok: true, fields };
}

export function isKycApprovalScreeningComplete(amlStatus: string | null | undefined): boolean {
  return ["clear", "manual_clear"].includes(amlStatus || "not_run");
}

// Compute the same-commodity Import (buy) <-> Export (sell) pairings that admins
// see before forming a deal. Only enquiries whose status is in the
// MATCHABLE_ENQUIRY_STATUSES allowlist and that are not already committed to a
// deal are considered. Extracted from the GET /api/enquiry-matches handler so
// the matching rules can be tested directly.
export function computeEnquiryMatches(
  enquiries: TradeEnquiry[],
  existingDeals: Array<{ importEnquiryRef: string; exportEnquiryRef: string }>,
): EnquiryMatch[] {
  const used = new Set<string>();
  for (const d of existingDeals) { used.add(d.importEnquiryRef); used.add(d.exportEnquiryRef); }
  const active = enquiries.filter(e => !used.has(e.enquiryRef) && isEnquiryStatusMatchable(e.status));
  const imports = active.filter(e => e.side === "buy");
  const exportsList = active.filter(e => e.side === "sell");
  const matches: EnquiryMatch[] = [];
  for (const imp of imports) {
    for (const exp of exportsList) {
      if (enquiryProductsMatch(imp, exp)) {
        matches.push({ id: `${imp.enquiryRef}__${exp.enquiryRef}`, import: imp, export: exp });
      }
    }
  }
  return matches;
}

// ===== Confidential terminal listings + multi-field matching engine =====

// Parse a numeric value out of a free-text quantity/price field. Mirrors the
// frontend's `num` so backend scoring and the terminal agree on magnitudes.
function numFrom(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function gradeFromSpec(spec: string | null | undefined): string {
  const s = (spec || "").toLowerCase();
  if (s.includes("grade a") || s.includes("premium")) return "Grade A (Premium)";
  if (s.includes("grade b")) return "Grade B (Standard)";
  if (s.includes("organic") || s.includes("certified")) return "Certified";
  return "Standard";
}

// A terminal listing exposes only the commercial terms of an enquiry plus the
// owning party's BULLEX registration code. It NEVER contains a buyer/seller
// name — confidentiality is enforced HERE, server-side, so identities never
// reach the browser payload (only the registration code does).
export interface TerminalListing {
  id: string; // enquiryRef
  side: "buy" | "sell";
  commodity: string;
  volume: number;
  unit: string;
  price: number;
  currency: string;
  origin: string;
  destination: string;
  grade: string;
  incoterms: string;
  payment: string;
  specifications: string;
  contractDuration: string;
  performance: string;
  regCode: string; // BULLEX registration code (BFG-CL/BFG-TM-XXXX) or "—"
  registered: boolean; // an accepted LOI(buy)/FCO(sell) exists for this enquiry
  instrumentType: "LOI" | "FCO" | null;
  status: "open" | "matched" | "registered";
  ts: number;
}

// Resolve the BULLEX registration code that represents an enquiry's owning
// party. Looks up the owning client (submittedByClientId / assignedToClientId ->
// KYC participantId) first, then the owning team member (submittedByTeamMemberId
// -> participantId). Returns "—" when no code resolves. NEVER returns a name.
export function resolveEnquiryRegCode(
  enq: TradeEnquiry,
  codes: { clientCodeByKycId: Map<string, string>; teamCodeById: Map<string, string> },
): string {
  const clientId = enq.submittedByClientId || enq.assignedToClientId || "";
  const cc = clientId ? codes.clientCodeByKycId.get(clientId) : undefined;
  if (cc) return cc;
  const tmId = enq.submittedByTeamMemberId || "";
  const tc = tmId ? codes.teamCodeById.get(tmId) : undefined;
  if (tc) return tc;
  return "—";
}

// Build the anonymized terminal listing for an enquiry. `instrument` carries
// whether an accepted LOI/FCO is registered against this enquiry. Pure helper —
// the only place listing fields are shaped, so the no-names guarantee is local.
export function buildTerminalListing(
  enq: TradeEnquiry,
  regCode: string,
  instrument: { registered: boolean; instrumentType: "LOI" | "FCO" | null },
): TerminalListing {
  const side = (enq.side || "buy").toLowerCase() === "sell" ? "sell" : "buy";
  const status: TerminalListing["status"] = enq.linkedTradeRef
    ? "matched"
    : instrument.registered
    ? "registered"
    : "open";
  return {
    id: enq.enquiryRef,
    side,
    commodity: enq.product,
    volume: numFrom(enq.quantity),
    unit: enq.unit || "MT",
    price: numFrom(enq.price),
    currency: enq.currency || "USD",
    origin: enq.origin || enq.loadingPort || "—",
    destination: enq.dischargePort || "—",
    grade: gradeFromSpec(enq.specifications),
    incoterms: enq.incoterms || "FOB",
    payment: enq.paymentTerms || "Letter of Credit",
    specifications: enq.specifications || "",
    contractDuration: enq.validity || enq.deliveryPeriod || "—",
    performance: enq.performanceBond || enq.compliance || "—",
    regCode,
    registered: instrument.registered,
    instrumentType: instrument.instrumentType,
    status,
    ts: +new Date(enq.createdAt as unknown as string) || Date.now(),
  };
}

export interface MatchScore {
  score: number; // 0-100
  breakdown: Record<string, number>;
}

const sameText = (a?: string | null, b?: string | null): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

// Score how compatible a buy enquiry is with a sell enquiry across the fields
// the spec lists (product, quantity, price, origin, destination, payment terms,
// contract conditions/incoterms). Product is a HARD gate: different commodities
// never match and return null. Pure & unit-testable; weights sum to 100.
export function scoreInstrumentMatch(buy: TradeEnquiry, sell: TradeEnquiry): MatchScore | null {
  if (!enquiryProductsMatch(buy, sell)) return null;
  const breakdown: Record<string, number> = {};
  // Same commodity is the foundation of any pairing.
  breakdown.product = 40;

  // Quantity closeness (max 20): the closer the volumes, the higher the score.
  const bq = numFrom(buy.quantity), sq = numFrom(sell.quantity);
  breakdown.quantity = bq > 0 && sq > 0 ? Math.round((Math.min(bq, sq) / Math.max(bq, sq)) * 20) : 0;

  // Price closeness (max 15): a buyer bid >= seller ask is ideal (full marks);
  // otherwise scale by how close the bid is to the ask.
  const bp = numFrom(buy.price), sp = numFrom(sell.price);
  breakdown.price = bp > 0 && sp > 0 ? (bp >= sp ? 15 : Math.round((bp / sp) * 15)) : 0;

  // Logistics & terms alignment.
  breakdown.origin = sameText(buy.origin || buy.loadingPort, sell.origin || sell.loadingPort) ? 10 : 0;
  breakdown.destination = sameText(buy.dischargePort, sell.dischargePort) ? 5 : 0;
  breakdown.payment = sameText(buy.paymentTerms, sell.paymentTerms) ? 5 : 0;
  breakdown.incoterms = sameText(buy.incoterms, sell.incoterms) ? 5 : 0;

  const score = Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0));
  return { score, breakdown };
}

export interface ParsedLoiFields {
  buyerName: string; sellerName: string; commodity: string; origin: string;
  quantity: string; packing: string; incoterm: string; laycan: string; price: string; currency: string;
  loadingPort: string; dischargePort: string;
  coBuyerName: string; coBuyerAddress: string; coBuyerContact: string;
  coSellerName: string; coSellerAddress: string; coSellerContact: string;
  contractConfirmation: string; qualitySpecs: string; paymentTerms: string;
  docsForPayment: string; otherTerms: string; compliance: string;
  specialNote: string;
  // Person-in-charge names from the LOI party blocks ("Attention (PIC)");
  // only parseLoiForSpa fills these — other parsers leave them undefined.
  buyerPic?: string; sellerPic?: string;
}

// Extract the free-text SPECIAL NOTES block that LOI/FCO/Deal-Recap templates
// render as a "SPECIAL NOTES" heading followed by the note text. Collects lines
// after the heading until an obvious document terminator (separator rule,
// signatory block, or closing salutation) or end of document. Blank lines
// INSIDE the note are preserved so multi-paragraph notes survive derivation;
// every template places a terminator (or nothing) after the block, so blank
// lines never signal the end of the note. Pure — unit-testable.
export function extractSpecialNotes(content: string): string {
  const lines = (content || "").split("\n");
  const out: string[] = [];
  let inNotes = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (!inNotes) {
      if (t === "SPECIAL NOTES") inNotes = true;
      continue;
    }
    if (/^[═─=]+$/.test(t)) break;
    if (/^(We look forward|With warm regards|For & On Behalf|AUTHORISED SIGNATORY)/.test(t)) break;
    if (!t && out.length === 0) continue; // skip leading blanks before the note starts
    out.push(t);
  }
  // Trim trailing blank lines left between the note and the terminator/EOF.
  while (out.length && !out[out.length - 1]) out.pop();
  return out.join("\n");
}

// Parse a generated Purchase LOI's plain-text content back into structured fields
// so an SPA can be derived from it with every detail carried over. The LOI uses a
// 3-column numbered table ( "NN │ Parameter │ Value" ) plus "Issued to Seller" /
// "Issued by Buyer" company blocks; this mirrors the LOI template in
// server/documentTemplates.ts. Pure function — no I/O — so it is unit-testable.
export function parseLoiForSpa(content: string): ParsedLoiFields {
  const lines = (content || "").split("\n");
  const isSep = (t: string) => /^[═─=]+$/.test(t);
  const findValueAfter = (label: string): string => {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === label) {
        for (let j = i + 1; j < lines.length; j++) {
          const t = lines[j].trim();
          if (!t || isSep(t)) continue;
          return t;
        }
      }
    }
    return "";
  };

  // Collect the numbered table rows by serial number AND label. Labels make
  // the parser resilient when a future LOI adds or reorders commercial rows;
  // serials remain as a fallback for older manually edited LOIs.
  const rowByNum: Record<string, string> = {};
  const rowByLabel: Record<string, string> = {};
  const labelByNum: Record<string, string> = {};
  let currentNum: string | null = null;
  for (const line of lines) {
    const numMatch = line.match(/^\s*(\d{1,2})\s*│\s*([^│]*)│\s*(.*)$/);
    if (numMatch) {
      currentNum = numMatch[1];
      const label = (numMatch[2] || "").trim().replace(/\s+/g, " ");
      const value = (numMatch[3] || "").trim();
      rowByNum[currentNum] = value;
      if (label) {
        rowByLabel[label] = value;
        labelByNum[currentNum] = label;
      }
      continue;
    }
    const contMatch = line.match(/^\s*│\s*[^│]*│\s*(.*)$/);
    if (contMatch && currentNum) {
      const extra = (contMatch[1] || "").trim();
      if (extra) {
        rowByNum[currentNum] = rowByNum[currentNum] ? `${rowByNum[currentNum]}\n${extra}` : extra;
        const label = labelByNum[currentNum];
        if (label) rowByLabel[label] = rowByLabel[label] ? `${rowByLabel[label]}\n${extra}` : extra;
      }
      continue;
    }
    if (line.trim() && !isSep(line.trim())) currentNum = null;
  }

  const clean = (s?: string): string => {
    const t = (s || "").trim();
    return /^_+$/.test(t) ? "" : t;
  };
  const row = (label: string, legacyNum?: string): string => rowByLabel[label] ?? (legacyNum ? rowByNum[legacyNum] || "" : "");

  // Price row is rendered as "<CUR> <amount>"; split the leading currency code.
  let price = row("Price", "06");
  let currency = "USD";
  const curMatch = price.match(/^([A-Z]{3})\s+([\s\S]*)$/);
  if (curMatch) { currency = curMatch[1]; price = curMatch[2]; }

  // Specifications now render as a dedicated "COMMODITY SPECIFICATIONS" table
  // (Parameter | Specification | Rejection | Test Method) rather than inline in
  // row 08. Reconstruct the original newline spec blob from that table so the
  // SPA round-trips. Older pre-packing LOIs (specs still in row 08) fall back below.
  const specBlob = (() => {
    const norm = (s: string) => {
      const t = (s || "").trim();
      return t === "-" || /^_+$/.test(t) ? "" : t;
    };
    const out: string[] = [];
    let inSpecs = false;
    for (const raw of lines) {
      const t = raw.trim();
      if (t === "COMMODITY SPECIFICATIONS") { inSpecs = true; continue; }
      if (!inSpecs) continue;
      if (/^(SPECIAL NOTES|We look forward|With warm regards|For & On Behalf)/.test(t)) break;
      if (!t || isSep(t) || !t.includes("|")) continue;
      const cells = t.split("|").map((c) => c.trim());
      if ((cells[0] || "").toLowerCase() === "parameter") continue;
      const param = norm(cells[0] || "");
      const spec = norm(cells[1] || "");
      const rej = norm(cells[2] || "");
      const method = norm(cells[3] || "");
      if (!param && !spec) continue;
      let entry = spec ? `${param}: ${spec}` : param;
      if (rej) entry += ` (Rejection: ${rej})`;
      if (method) entry += ` [Method: ${method}]`;
      out.push(entry);
    }
    return out.join("\n");
  })();
  const specPointer = clean(row("Commodity Specifications", "08"));
  const qualitySpecs = specBlob || (specPointer === "As per Commodity Specifications table below" ? "" : specPointer);

  // Co-party blocks render as prefixed "Label: value" lines (coPartyBlock in
  // documentTemplates), distinct from the numbered table rows parsed above.
  const labelled = (label: string): string => {
    for (const line of lines) {
      const m = line.match(/^\s*([^:│]+):\s*(.+)$/);
      if (m && m[1].trim() === label) {
        const t = m[2].trim();
        return t === "-" || /^_+$/.test(t) ? "" : t;
      }
    }
    return "";
  };

  // "Attention (PIC)" appears once in EACH party block; resolve each PIC
  // relative to its block heading so seller/buyer names don't cross over.
  const picAfterHeading = (heading: string): string => {
    const start = lines.findIndex((l) => l.trim() === heading);
    if (start < 0) return "";
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].trim() === "Attention (PIC)") {
        // The PIC value is the IMMEDIATE next line; a blank line there means
        // the PIC was empty — never scan forward into unrelated content.
        const t = (lines[i + 1] || "").trim();
        if (!t || isSep(t) || t === "-") return "";
        // Co-party block or next labelled section means the PIC was blank.
        if (/^[^:│]+:\s/.test(t) || /^Issued (by|to)/.test(t)) return "";
        return clean(t);
      }
      // Stop at the next block heading — PIC belongs to this block only.
      if (/^Issued (by|to)/.test(lines[i].trim()) && i > start) return "";
    }
    return "";
  };

  return {
    buyerName: clean(findValueAfter("Issued by Buyer")),
    sellerName: clean(findValueAfter("Issued to Seller")),
    buyerPic: picAfterHeading("Issued by Buyer"),
    sellerPic: picAfterHeading("Issued to Seller"),
    coBuyerName: labelled("Co-Buyer Company"),
    coBuyerAddress: labelled("Co-Buyer Address"),
    coBuyerContact: labelled("Co-Buyer Contact"),
    coSellerName: labelled("Co-Seller Company"),
    coSellerAddress: labelled("Co-Seller Address"),
    coSellerContact: labelled("Co-Seller Contact"),
    commodity: clean(row("Commodity", "01")),
    origin: clean(row("Origin", "02")),
    quantity: clean(row("Quantity", "03")),
    packing: clean(row("Packing")),
    incoterm: clean(row("Incoterms Terms", "04")),
    laycan: clean(row("Delivery period", "05")),
    loadingPort: labelled("Loading Port"),
    dischargePort: labelled("Discharge Port"),
    price: clean(price),
    currency,
    contractConfirmation: clean(row("Contract Confirmation", "07")),
    qualitySpecs,
    paymentTerms: clean(row("Payment Terms", "09")),
    docsForPayment: clean(row("Documents for Payment", "10")),
    otherTerms: clean(row("Other terms & conditions", "11")),
    compliance: clean(row("Compliance", "12")),
    specialNote: extractSpecialNotes(content),
  };
}

// Rebuild the original newline spec blob (`Parameter: Spec (Rejection: X) [Method: Y]`)
// from a rendered pipe table that follows one of the given heading labels (e.g.
// "Quality Specifications" / "COMMODITY SPECIFICATIONS"). Cells of "-" or "___"
// are treated as empty. Used to round-trip specs from a generated FCO/SCO into an SPA.
function reconstructSpecBlobFromTable(lines: string[], triggers: string[]): string {
  const norm = (s: string) => {
    const t = (s || "").trim();
    return t === "-" || /^_+$/.test(t) ? "" : t;
  };
  const isTrigger = (t: string) => triggers.some((tr) => t === tr || t === `${tr}:`);
  const out: string[] = [];
  let inSpecs = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (!inSpecs) {
      if (isTrigger(t)) inSpecs = true;
      continue;
    }
    if (!t || isTrigger(t) || t === "Quality Specifications:") continue;
    if (/^[═─=]+$/.test(t)) continue;
    if (!t.includes("|")) break; // table ended (next heading/paragraph)
    const cells = t.split("|").map((c) => c.trim());
    if ((cells[0] || "").toLowerCase() === "parameter") continue; // header row
    const param = norm(cells[0] || "");
    const spec = norm(cells[1] || "");
    const rej = norm(cells[2] || "");
    const method = norm(cells[3] || "");
    if (!param && !spec) continue;
    let entry = spec ? `${param}: ${spec}` : param;
    if (rej) entry += ` (Rejection: ${rej})`;
    if (method) entry += ` [Method: ${method}]`;
    out.push(entry);
  }
  return out.join("\n");
}

// Parse a generated FCO/SCO/ICPO (or similar key:value + spec-table document)
// back into structured fields so an SPA can be derived from it with every detail
// carried over. These templates render party/commodity/delivery/payment blocks as
// "Label: value" lines (plus box-char │ tables for recap-style docs) and a
// "Quality Specifications" pipe table. Pure function — no I/O — so it is unit-testable.
// Legacy documents (generated before co-parties rendered as separate labeled
// blocks) merged a joint party into a single name string:
// "Primary Co jointly with Second Co". Split that back so derivation can
// recover both companies (KYC lookups need the PRIMARY name alone).
export function splitJointPartyName(name: string): { primary: string; co: string } {
  const m = (name || "").split(/\s+jointly with\s+/i);
  return { primary: (m[0] || "").trim(), co: (m[1] || "").trim() };
}

export function parseGeneratedDocFields(content: string): ParsedLoiFields {
  const lines = (content || "").split("\n");
  const map: Record<string, string> = {};
  for (const line of lines) {
    // Box-char │ tables (recap-style) first, then plain "Label: value".
    if (line.includes("│")) {
      // Two-column recap rows render as "Label │ value"; SCO offer rows carry a
      // leading serial column ("01 │ Label │ value"). Take the last cell as the
      // value and the cell before it as the label so BOTH shapes round-trip
      // (otherwise the SCO serial number is captured as the key and every
      // commercial field is dropped from a derived Deal Recap / SPA).
      const cells = line.split("│").map((c) => c.trim()).filter((c) => c.length > 0);
      if (cells.length >= 2) {
        const k = cells[cells.length - 2];
        const val = cells[cells.length - 1];
        if (k && !(k in map)) map[k] = val;
      }
    } else {
      const mColon = line.match(/^([^:]+):\s*(.+)$/);
      if (mColon) {
        const k = mColon[1].trim();
        if (k && !(k in map)) map[k] = mColon[2].trim();
      }
    }
  }
  // Template empty cells are rendered as an underscore placeholder ("____") and
  // unset values as "-"; treat both as empty so they don't carry into the SPA.
  const clean = (s: string) => {
    const t = (s || "").trim();
    return t === "-" || /^_+$/.test(t) ? "" : t;
  };
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      if (map[k] && clean(map[k])) return clean(map[k]);
    }
    return "";
  };

  // Price is rendered as "<CUR> <amount>"; split the leading currency code.
  let price = get("Unit Price", "Price", "Price & Currency", "Contract Price & Currency", "Price Per Unit");
  let currency = get("Currency") || "USD";
  const curMatch = price.match(/^([A-Z]{3})\s+([\s\S]+)$/);
  if (curMatch) { currency = curMatch[1]; price = curMatch[2].trim(); }
  // SCO renders the price as "<CUR> <amount> per MT"; drop the trailing unit
  // qualifier so the bare amount carries into the SPA.
  price = price.replace(/\s+per\s+\w+\.?$/i, "").trim();

  const specBlob = reconstructSpecBlobFromTable(lines, ["Quality Specifications", "COMMODITY SPECIFICATIONS", "PRODUCT SPECIFICATION"]);
  const qualitySpecs = specBlob || get("Quality Specifications", "Quality / Spec", "Commodity Specifications");

  return {
    buyerName: get("Buyer", "Buyer Name", "Issued by Buyer"),
    sellerName: get("Seller", "Seller Name", "FROM (SELLER)"),
    coBuyerName: get("Co-Buyer", "Co-Buyer Company"),
    coBuyerAddress: get("Co-Buyer Address"),
    coBuyerContact: get("Co-Buyer Contact"),
    coSellerName: get("Co-Seller", "Co-Seller Company"),
    coSellerAddress: get("Co-Seller Address"),
    coSellerContact: get("Co-Seller Contact"),
    commodity: get("Commodity"),
    origin: get("Origin", "Country of Origin"),
    quantity: get("Quantity", "Contractual Qty", "Contractual Quantity"),
    packing: get("Packing", "PACKING"),
    incoterm: get("Incoterm", "Incoterms", "Delivery Terms", "Delivery Basis", "Purchase Incoterms", "Incoterms Terms"),
    laycan: get("Laycan", "Loading Window", "Delivery Period"),
    loadingPort: get("Loading Port", "Port of Loading", "Loading Port(s)"),
    dischargePort: get("Discharge Port", "Port of Discharge", "Discharge Port(s)", "Destination Port"),
    price,
    currency,
    contractConfirmation: get("Contract Confirmation"),
    qualitySpecs,
    paymentTerms: get("Payment Terms"),
    docsForPayment: get("Documents for Payment", "Docs for Payment"),
    otherTerms: get("Other Terms"),
    compliance: get("Compliance"),
    specialNote: extractSpecialNotes(content),
  };
}

// SPA-specific parsed fields: the SPA template additionally renders each
// party's address, so a document derived from an SPA (TFR / DLC Draft) can
// carry those through even when no approved KYC record matches.
export interface ParsedSpaFields extends ParsedLoiFields {
  buyerAddress: string;
  sellerAddress: string;
}

// Parse the commercial terms back out of a generated SPA. The SPA is a
// long-form contract, not a "Label: value" sheet, so parseGeneratedDocFields
// cannot recover it: parties render under SELLER / BUYER headings with the
// SAME repeated labels ("Name of Company:", "Address:"), quantity renders as
// "Total: <qty> Metric Tons per month (...)", price as
// "Contract Price: <CUR> <price> per Metric Ton on <incoterm> basis." and
// delivery fields carry article numbering ("6.2 Port of Loading: ...").
// This parser stays in lockstep with the SPA template in
// server/documentTemplates.ts — renaming a label there must be mirrored here
// (see the parse-AND-render-in-lockstep convention). Pure — unit-testable.
export function parseSpaDocFields(content: string): ParsedSpaFields {
  const lines = (content || "").split("\n");
  const clean = (s: string) => {
    const t = (s || "").trim();
    return t === "-" || /^_+$/.test(t) ? "" : t;
  };

  // Section-aware "Label: value" capture. The SELLER and BUYER blocks repeat
  // identical labels, so keys are prefixed with the active party section.
  // Article numbering ("6.1 Origin") is stripped from the label.
  const map: Record<string, string> = {};
  let section = "";
  for (const raw of lines) {
    const t = raw.trim();
    if (t === "SELLER") { section = "seller"; continue; }
    if (t === "BUYER") { section = "buyer"; continue; }
    if (/^\(hereinafter\b/i.test(t) || /^Article\s+\d+/i.test(t)) { section = ""; }
    const m = t.match(/^(\d+(?:\.\d+)*\s+)?([^:|]+):\s*(.+)$/);
    if (!m) continue;
    const label = m[2].trim();
    const val = m[3].trim();
    const key = section ? `${section}.${label}` : label;
    if (!(key in map)) map[key] = val;
  }
  const get = (...keys: string[]): string => {
    for (const k of keys) if (map[k] && clean(map[k])) return clean(map[k]);
    return "";
  };

  // Article 4: "Total: <qty> Metric Tons per month (+/- 10% Buyers option)".
  let quantity = get("Total");
  quantity = clean(quantity.replace(/\s*Metric Tons per month.*$/i, "").trim());

  // Article 5: "Contract Price: <CUR> <price> per Metric Ton on <incoterm> basis."
  let price = "", currency = "USD", incoterm = "";
  const priceRaw = get("Contract Price");
  const pm = priceRaw.match(/^(?:([A-Z]{3})\s+)?(.+?)\s+per\s+Metric\s+Ton(?:\s+on\s+(.+?)\s+basis)?\.?$/i);
  if (pm) {
    if (pm[1]) currency = pm[1];
    price = clean(pm[2] || "");
    incoterm = clean(pm[3] || "");
  } else {
    price = clean(priceRaw);
  }

  const specBlob = reconstructSpecBlobFromTable(lines, ["Specifications", "Quality Specifications"]);

  return {
    sellerName: get("seller.Name of Company"),
    sellerAddress: get("seller.Address"),
    buyerName: get("buyer.Name of Company"),
    buyerAddress: get("buyer.Address"),
    coBuyerName: get("Co-Buyer Company"),
    coBuyerAddress: get("Co-Buyer Address"),
    coBuyerContact: get("Co-Buyer Contact"),
    coSellerName: get("Co-Seller Company"),
    coSellerAddress: get("Co-Seller Address"),
    coSellerContact: get("Co-Seller Contact"),
    commodity: get("Commodity"),
    origin: get("Origin"),
    quantity,
    packing: get("Packing"),
    incoterm,
    laycan: get("Latest date of shipment"),
    price,
    currency,
    loadingPort: get("Port of Loading"),
    dischargePort: get("Port of Discharge"),
    contractConfirmation: get("Cargo Confirmation"),
    qualitySpecs: specBlob,
    paymentTerms: get("Payment Method"),
    docsForPayment: get("Additional Documents for Payment (as agreed by the Parties)"),
    otherTerms: "",
    compliance: "",
    specialNote: extractSpecialNotes(content),
  };
}

export interface MatchSuggestion {
  id: string; // buyRef__sellRef
  buy: TradeEnquiry;
  sell: TradeEnquiry;
  score: number;
  breakdown: Record<string, number>;
}

// The automated matching engine: produce every viable buy<->sell pairing with a
// compatibility score, best first. Only matchable (pending) enquiries not yet in
// a deal are considered, and pairs already captured by an existing trade-match
// (proposed/confirmed) are excluded so the desk isn't shown duplicates.
export function computeMatchSuggestions(
  enquiries: TradeEnquiry[],
  existingDeals: Array<{ importEnquiryRef: string; exportEnquiryRef: string }>,
  excludedPairs: Set<string>,
): MatchSuggestion[] {
  const used = new Set<string>();
  for (const d of existingDeals) { used.add(d.importEnquiryRef); used.add(d.exportEnquiryRef); }
  const active = enquiries.filter(e => !used.has(e.enquiryRef) && isEnquiryStatusMatchable(e.status));
  const buys = active.filter(e => e.side === "buy");
  const sells = active.filter(e => e.side === "sell");
  const out: MatchSuggestion[] = [];
  for (const b of buys) {
    for (const s of sells) {
      const pairId = `${b.enquiryRef}__${s.enquiryRef}`;
      if (excludedPairs.has(pairId)) continue;
      const sc = scoreInstrumentMatch(b, s);
      if (!sc) continue;
      out.push({ id: pairId, buy: b, sell: s, score: sc.score, breakdown: sc.breakdown });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

// Build lookup maps from owner id -> BULLEX registration code, for clients
// (approved KYC participantId) and team members (participantId). Used to
// anonymize enquiries/matches down to codes only.
async function buildRegCodeMaps(): Promise<{
  clientCodeByKycId: Map<string, string>;
  teamCodeById: Map<string, string>;
}> {
  const [kycs, members] = await Promise.all([
    storage.getKycApplications(),
    storage.getAllTeamMembers(),
  ]);
  const clientCodeByKycId = new Map<string, string>();
  for (const k of kycs) if (k.participantId) clientCodeByKycId.set(k.id, k.participantId);
  const teamCodeById = new Map<string, string>();
  for (const m of members) if (m.participantId) teamCodeById.set(m.id, m.participantId);
  return { clientCodeByKycId, teamCodeById };
}

// Map enquiryRef -> which accepted instruments are registered against it. An LOI
// is the buy-side instrument; an FCO is the sell-side instrument. "Registered"
// means the document has been accepted (approved) by the desk.
async function buildRegisteredInstrumentMap(): Promise<Map<string, { hasLOI: boolean; hasFCO: boolean }>> {
  const docs = await storage.getDocuments();
  const map = new Map<string, { hasLOI: boolean; hasFCO: boolean }>();
  for (const d of docs) {
    if (!d.enquiryRef) continue;
    // A document counts as accepted/registered when the recipient accepted it in
    // the client portal OR the deal cascade marked it accepted.
    const accepted = d.recipientResponse === "accepted" || d.status === "accepted";
    if (!accepted) continue;
    const t = (d.docType || "").toUpperCase();
    if (t !== "LOI" && t !== "FCO") continue;
    const cur = map.get(d.enquiryRef) || { hasLOI: false, hasFCO: false };
    if (t === "LOI") cur.hasLOI = true; else cur.hasFCO = true;
    map.set(d.enquiryRef, cur);
  }
  return map;
}

// Shape one enquiry into an anonymized listing using the prebuilt maps. The
// instrument flag is side-aware: a buy enquiry is "registered" once its LOI is
// accepted; a sell enquiry once its FCO is accepted.
function listingForEnquiry(
  enq: TradeEnquiry,
  codes: { clientCodeByKycId: Map<string, string>; teamCodeById: Map<string, string> },
  regMap: Map<string, { hasLOI: boolean; hasFCO: boolean }>,
): TerminalListing {
  const reg = regMap.get(enq.enquiryRef) || { hasLOI: false, hasFCO: false };
  const side = (enq.side || "buy").toLowerCase() === "sell" ? "sell" : "buy";
  const registered = side === "sell" ? reg.hasFCO : reg.hasLOI;
  const instrumentType: "LOI" | "FCO" | null = registered ? (side === "sell" ? "FCO" : "LOI") : null;
  return buildTerminalListing(enq, resolveEnquiryRegCode(enq, codes), { registered, instrumentType });
}

// Document editing policy (single source of truth, pure & unit-testable).
//
// - Admin may edit a document in ANY state, including approved/sent/accepted/final.
// - Team members may edit ONLY their own document, and ONLY while it is still in
//   their hands. Team-prepared documents no longer require admin approval, so that
//   covers `pending_review`, ready-to-sign `draft`, or a doc the admin sent back
//   for changes before approval (`rejected` with NO recipientResponse). A
//   `rejected` document that already carries a `recipientResponse` originated from
//   a client amendment request on an already-sent document, so it is admin-only.
//   Once the document has left the team member (review/sent/accepted/final), only
//   the admin may edit it.
// - Any other principal may not edit.
export function canEditDocument(opts: {
  role: string | undefined;
  isOwner: boolean;
  status: string;
  recipientResponse?: string | null;
}): boolean {
  if (opts.role === "admin") return true;
  // Team members may no longer edit a generated document directly. Any change to
  // a document a team member created must be submitted as an amendment
  // (POST /api/documents/:id/request-amendment) and approved by an admin
  // (POST /api/documents/:id/review-amendment) before it replaces the live
  // content. This keeps every post-generation change admin-gated.
  return false;
}

// Document download/read policy (single source of truth, pure & unit-testable).
//
// - Admin may download any document.
// - A team member may download ONLY a document they created (mirrors the
//   GET /api/documents/:id ownership boundary). Being allocated the "doc-templates"
//   module is not enough to reach another member's document.
// - A client may download only a document sent to their KYC record.
// - Any other principal is denied.
export function canDownloadDocument(opts: {
  role: string | undefined;
  isOwner: boolean;
  isRecipientClient: boolean;
}): boolean {
  if (opts.role === "admin") return true;
  if (opts.role === "team") return opts.isOwner;
  if (opts.role === "client") return opts.isRecipientClient;
  return false;
}

// Per-document authorization decision for the deal-file ZIP endpoint
// (POST /api/documents/download-zip). Combines the single-file download policy
// (canDownloadDocument) with the own-agent-agreement carve-out
// (isOwnAgentAgreement) into ONE pure, DB-free gate so the ZIP scoping boundary
// is unit-testable: admin gets any document, a team member gets only documents
// they created plus their own NCNDA/ICA agent agreement, a client gets only
// documents sent to their KYC record, everyone else is denied.
export function canIncludeDocInZip(opts: {
  role: string | undefined;
  doc: {
    docType: string;
    agentCode?: string | null;
    submittedByTeamMemberId?: string | null;
    sentToClientId?: string | null;
  };
  teamMemberId: string | null;
  teamParticipantId: string | null | undefined;
  clientKycId: string | null | undefined;
}): boolean {
  const isOwner =
    (!!opts.teamMemberId && opts.doc.submittedByTeamMemberId === opts.teamMemberId) ||
    (!!opts.teamMemberId && isOwnAgentAgreement(opts.doc, opts.teamParticipantId));
  return canDownloadDocument({
    role: opts.role,
    isOwner,
    isRecipientClient: !!opts.doc.sentToClientId && opts.doc.sentToClientId === opts.clientKycId,
  });
}

// The single-file DOCX/PDF download routes enforce the EXACT same per-document
// gate as the ZIP endpoint. Exported as a distinct name so tests can pin that
// the two paths can never drift apart (it is the same function by identity).
export const canDownloadSingleFileDoc = canIncludeDocInZip;

// Emailing a document out (POST /api/documents/:id/send) enforces the EXACT
// same per-document ownership gate as downloading it: if a caller cannot
// download a document, they cannot email it to anyone either. Exported as a
// distinct name so tests can pin that the send path can never drift from the
// download/ZIP paths (it is the same function by identity). Note the route
// itself additionally restricts callers to admin/team via module gating and
// layers send-specific status/signature checks on top.
export const canSendDocViaEmail = canIncludeDocInZip;

// Bank-draft document types derived from an SPA that may ride along as extra
// attachments in the same email as their parent (one email, multiple
// documents). Never widen this beyond bank drafts.
export const SPA_EMAIL_ATTACHABLE_TYPES: ReadonlySet<string> = new Set(["DLC_MT700", "PBG_MT760"]);

// Per-attachment authorization decision for extra bank-draft attachments on
// the document email/send routes (resolveEmailAttachmentDocs). A child
// document may ride along ONLY when BOTH hold:
//   1. Derivation: it is a direct child (parentDocId) of the parent being
//      emailed AND of an attachable bank-draft type — prevents using the email
//      route to exfiltrate arbitrary documents; and
//   2. Ownership: the caller passes the SAME pure per-document gate as
//      downloading/emailing the child itself (canSendDocViaEmail): if the
//      sender cannot download a draft, they cannot email it out either — even
//      when it hangs under a parent they do own (e.g. an admin-created draft
//      under a team member's SPA).
// Pure and DB-free so the boundary is unit-testable.
export function canAttachDocToEmail(opts: {
  parentDoc: { id: string };
  child: {
    id: string;
    parentDocId?: string | null;
    docType: string;
    agentCode?: string | null;
    submittedByTeamMemberId?: string | null;
    sentToClientId?: string | null;
  };
  role: string | undefined;
  teamMemberId: string | null;
  teamParticipantId: string | null | undefined;
  clientKycId: string | null | undefined;
}): boolean {
  if (opts.child.parentDocId !== opts.parentDoc.id) return false;
  if (!SPA_EMAIL_ATTACHABLE_TYPES.has(opts.child.docType)) return false;
  return canSendDocViaEmail({
    role: opts.role,
    doc: opts.child,
    teamMemberId: opts.teamMemberId,
    teamParticipantId: opts.teamParticipantId,
    clientKycId: opts.clientKycId,
  });
}

export function hasDocumentSignature(
  doc: Pick<Document, "docType" | "buyerSignature" | "sellerSignature">,
): boolean {
  return doc.docType === "NCNDA" || doc.docType === "ADDENDUM"
    ? !!(doc.sellerSignature || doc.buyerSignature)
    : !!doc.buyerSignature;
}

export function hasRequiredDocumentSignatures(
  doc: Pick<Document, "docType" | "buyerSignature" | "sellerSignature">,
): boolean {
  if (doc.docType === "ADDENDUM") return !!doc.sellerSignature && !!doc.buyerSignature;
  return hasDocumentSignature(doc);
}

export async function finalizeDocumentWithSignatures(
  doc: Document,
): Promise<
  | { ok: true; doc: Document }
  | { ok: false; status: 400; message: string }
> {
  if (!lpgStsReviewState(doc).cleared) {
    return { ok: false, status: 400, message: "LPG STS SPA requires transaction-specific administrator clearance before finalization." };
  }
  if (!doc.content) return { ok: false, status: 400, message: "Document has no content" };
  if (!hasRequiredDocumentSignatures(doc)) {
    return {
      ok: false,
      status: 400,
      message: doc.docType === "ADDENDUM"
        ? "SPA addendum must be signed by both Seller and Buyer before converting to PDF"
        : "Document must be signed before converting to PDF",
    };
  }
  const submittedByLabel = await getDocSubmittedByLabel(doc.submittedByTeamMemberId);
  const files = await regenerateWithSignatures(
    doc.id,
    doc.title,
    doc.content,
    doc.buyerSignature || undefined,
    doc.sellerSignature || undefined,
    doc.buyerSignedName || undefined,
    doc.sellerSignedName || undefined,
    doc.buyerSignedAt ? new Date(doc.buyerSignedAt) : undefined,
    doc.sellerSignedAt ? new Date(doc.sellerSignedAt) : undefined,
    doc.docType,
    submittedByLabel,
    doc.buyerSignedIp || undefined,
    doc.sellerSignedIp || undefined,
    doc.agentCode || undefined,
    doc.teamMemberCode || undefined,
  );
  const updated = await storage.updateDocument(doc.id, {
    docxPath: files.docxPath,
    pdfPath: files.pdfPath,
    status: "final",
  }, isLpgStsSpa(doc) ? doc.content : undefined);
  return { ok: true, doc: updated };
}

// Response for a ZIP request where NO requested document was downloadable by
// the caller. Clients get an explicit 403 (they asked for someone else's
// documents); admin/team get a 404 (nothing found in their scope). Pure so the
// all-unauthorized contract is unit-testable.
export function zipAllUnauthorizedResponse(role: string | undefined): { status: 403 | 404; message: string } {
  return role === "client"
    ? { status: 403, message: "Access denied" }
    : { status: 404, message: "No downloadable documents found" };
}

// A team member is the SUBJECT of an NCNDA/ICA agent agreement when the
// document's agentCode equals their participant ID — regardless of who
// generated the document (admin or their inviter). The subject may VIEW,
// DOWNLOAD, and PROPOSE AMENDMENTS to their own agreement (staged in
// pendingContent, admin-approved), but never edit it directly. Pure and
// unit-testable; never widen this beyond NCNDA/ICA.
export function isOwnAgentAgreement(
  doc: { docType: string; agentCode?: string | null },
  participantId: string | null | undefined
): boolean {
  if (!participantId) return false;
  if (doc.docType !== "NCNDA" && doc.docType !== "ICA") return false;
  return !!doc.agentCode && doc.agentCode === participantId;
}

// Pure gate for POST /api/documents/:id/send-to-member. A team member may email a
// generated document only to a team member THEY personally added (the target's
// invitedByTeamMemberId equals the caller's team-member id) AND only when they
// own the document. Admins may send any document to any member. Kept DB-free so
// the inviter-scoping boundary is unit-testable.
export function canSendDocumentToMember(opts: {
  role: string | undefined;
  callerTeamMemberId: string | null;
  docOwnerTeamMemberId: string | null | undefined;
  targetInvitedByTeamMemberId: string | null | undefined;
}): boolean {
  if (opts.role === "admin") return true;
  if (opts.role !== "team") return false;
  if (!opts.callerTeamMemberId) return false;
  const ownsDoc = opts.docOwnerTeamMemberId === opts.callerTeamMemberId;
  const addedTarget = !!opts.targetInvitedByTeamMemberId
    && opts.targetInvitedByTeamMemberId === opts.callerTeamMemberId;
  return ownsDoc && addedTarget;
}

// A team member may generate an agent agreement (NCNDA/ICA) against a registered
// team member ONLY for a member they personally added (the target's
// invitedByTeamMemberId equals the caller's team-member id). Admins may generate
// for any member. Kept DB-free so the inviter-scoping boundary is unit-testable.
export function canGenerateAgentDocForMember(opts: {
  role: string | undefined;
  callerTeamMemberId: string | null;
  targetInvitedByTeamMemberId: string | null | undefined;
}): boolean {
  if (opts.role === "admin") return true;
  if (opts.role !== "team") return false;
  if (!opts.callerTeamMemberId) return false;
  return !!opts.targetInvitedByTeamMemberId
    && opts.targetInvitedByTeamMemberId === opts.callerTeamMemberId;
}

// Pure gate for linking a document to a client portal account at send time
// (POST /api/documents/:id/send with clientId). Admins and team members may
// link, but only when: the client KYC is approved, one of the client's
// registered emails matches the document's own buyer/seller party emails, and
// — for team callers — the outbound notification email itself goes to one of
// the client's registered addresses (so a team member cannot plant a document
// in a client portal while notifying someone else). Kept DB-free so this
// multi-tenant routing boundary is unit-testable.
export function validateClientLink(opts: {
  role: string | undefined;
  clientStatus: string | null | undefined;
  clientEmails: (string | null | undefined)[];
  docPartyEmails: (string | null | undefined)[];
  recipientEmail: string | null | undefined;
}): { ok: true } | { ok: false; reason: string } {
  if (opts.role !== "admin" && opts.role !== "team") {
    return { ok: false, reason: "Only administrators and team members may link a document to a client portal account" };
  }
  if (opts.clientStatus !== "approved") {
    return { ok: false, reason: "Documents can only be sent to approved KYC clients" };
  }
  const norm = (e: string | null | undefined) => (e || "").toLowerCase().trim();
  const clientEmails = opts.clientEmails.map(norm).filter(Boolean);
  const docEmails = opts.docPartyEmails.map(norm).filter(Boolean);
  if (!clientEmails.some((ce) => docEmails.includes(ce))) {
    return {
      ok: false,
      reason: "The selected client's registered email does not match the buyer or seller email on this document. Please select the correct client or update the document's party emails.",
    };
  }
  if (opts.role === "team" && !clientEmails.includes(norm(opts.recipientEmail))) {
    return {
      ok: false,
      reason: "The recipient email must be the selected client's registered contact or signatory email.",
    };
  }
  return { ok: true };
}

// Allowed next-document transitions per parent document type. Originating offer
// documents can be converted into an SPA directly (no client send/accept
// round-trip): an LOI (any of its transitions) and an FCO converted straight to
// an SPA. Every other transition (e.g. FCO → Deal Recap) requires the parent to
// have been accepted by the recipient first.
export const DOC_TRANSITIONS: Record<string, string[]> = {
  LOI: ["SCO", "ICPO", "SPA"],
  SCO: ["DEAL_RECAP"],
  FCO: ["DEAL_RECAP", "SPA"],
  DEAL_RECAP: ["SPA"],
  // TFR is deliberately ABSENT: a TFR consolidates BOTH legs of a matched
  // deal, so it is only prepared via the Deal Pipeline (deal matching), never
  // derived from a single SPA.
  SPA: ["ADDENDUM", "DLC_MT700", "PBG_MT760", "PI"],
};

export interface DocTransitionResult {
  ok: boolean;
  status?: number;
  message?: string;
}

// Pure gate for POST /api/documents/:id/create-next: decides whether a parent
// document may spawn the requested next document type given its current
// recipient-acceptance state. Keeping this DB-free makes the FCO→SPA shortcut
// (allowed without acceptance) and the FCO→Deal Recap rule (blocked until
// accepted) unit-testable without hitting the database.
export function evaluateDocTransition(opts: {
  parentDocType: string;
  nextDocType: string;
  recipientResponse?: string | null;
  // Whether EITHER party has signed the parent document. Required for the
  // signature-driven SPA transitions (TFR / DLC_MT700), which bypass the
  // recipient-acceptance gate precisely because they key off a signature.
  hasAnySignature?: boolean;
}): DocTransitionResult {
  const allowedNext = DOC_TRANSITIONS[opts.parentDocType] || [];
  if (!allowedNext.includes(opts.nextDocType)) {
    return {
      ok: false,
      status: 400,
      message: `Invalid transition: ${opts.parentDocType} can only create ${allowedNext.join(" or ") || "nothing"}`,
    };
  }
  // Addenda, bank drafts, and the PI transition have their own service-level
  // gates. The transition map only validates the parent/child shape here.
  if (
    opts.parentDocType === "SPA" &&
    (opts.nextDocType === "ADDENDUM" || opts.nextDocType === "DLC_MT700" || opts.nextDocType === "PBG_MT760" || opts.nextDocType === "PI")
  ) {
    return { ok: true };
  }
  const isDirectOfferToSpa =
    opts.parentDocType === "LOI" ||
    (opts.parentDocType === "FCO" && opts.nextDocType === "SPA");
  if (!isDirectOfferToSpa && opts.recipientResponse !== "accepted") {
    return { ok: false, status: 400, message: "Parent document must be accepted first" };
  }
  return { ok: true };
}

export function areAdminChecksComplete(adminChecks: unknown, expectedLabels?: string[]): boolean {
  if (!Array.isArray(adminChecks) || adminChecks.length === 0) return false;
  if (expectedLabels) {
    return adminChecks.length === expectedLabels.length
      && adminChecks.every((check, index) =>
        check
        && typeof check === "object"
        && (check as any).label === expectedLabels[index]
        && (check as any).checked === true);
  }
  return adminChecks.every((check) =>
    check && typeof check === "object" && (check as any).checked === true);
}

export function hasCompletedAdminChecklist(docType: string, adminChecks: unknown): boolean {
  return areAdminChecksComplete(
    Array.isArray(adminChecks) ? adminChecks.filter(c => c?.key !== "lpgStsReview") : adminChecks,
    buildAdminChecks(docType).map((check) => check.label),
  );
}

export function evaluateProformaInvoiceEligibility(opts: {
  isAdminCaller: boolean;
  parentDocType?: string | null;
  enquirySide?: string | null;
}): { ok: true } | { ok: false; status: number; message: string } {
  if (!opts.isAdminCaller) {
    return { ok: false, status: 403, message: "Only an administrator can create a Proforma Invoice" };
  }
  if (opts.parentDocType !== "SPA") {
    return { ok: false, status: 400, message: "A Proforma Invoice can only be created from an SPA" };
  }
  if (opts.enquirySide !== "buy" && opts.enquirySide !== "sell") {
    return { ok: false, status: 400, message: "A Proforma Invoice requires an Import or Export SPA linked to an enquiry" };
  }
  return { ok: true };
}

export function validateProformaInvoiceRecipient(opts: {
  docType?: string | null;
  enquirySide?: string | null;
  recipientEmail?: string | null;
  buyerEmail?: string | null;
  sellerEmail?: string | null;
  clientId?: string | null;
  clientStatus?: string | null;
  clientEmails?: Array<string | null | undefined>;
}): { ok: true } | { ok: false; reason: string } {
  if (opts.docType !== "PI") return { ok: true };
  const normalize = (value?: string | null) => (value || "").trim().toLowerCase();
  const recipient = normalize(opts.recipientEmail);
  const isExport = opts.enquirySide === "sell";
  const isImport = opts.enquirySide === "buy";
  if (!isImport && !isExport) {
    return { ok: false, reason: "The Proforma Invoice must remain linked to its Import or Export SPA enquiry" };
  }
  const recipientLabel = isExport ? "buyer" : "supplier";
  const expectedEmail = normalize(isExport ? opts.buyerEmail : opts.sellerEmail);
  if (!opts.clientId) return { ok: false, reason: `Select the approved ${recipientLabel} client before sending the Proforma Invoice` };
  if (opts.clientStatus !== "approved") return { ok: false, reason: `The selected ${recipientLabel} client is not approved` };
  if (!expectedEmail || recipient !== expectedEmail) {
    return { ok: false, reason: `The Proforma Invoice must be sent to the ${recipientLabel} email recorded on the SPA` };
  }
  if (!(opts.clientEmails || []).some((email) => normalize(email) === expectedEmail)) {
    return { ok: false, reason: `The selected client does not match the SPA ${recipientLabel}` };
  }
  return { ok: true };
}

export function requiresProformaPortalDelivery(docType?: string | null): boolean {
  return docType === "PI";
}

export function canManageProformaInvoice(opts: {
  docType?: string | null;
  role?: string | null;
}): boolean {
  return opts.docType !== "PI" || opts.role === "admin";
}

export function validateProformaInvoiceDirectEmail(opts: {
  docType?: string | null;
  role?: string | null;
  hasRequiredSignature: boolean;
}): { ok: true } | { ok: false; status: number; message: string } {
  if (opts.docType !== "PI") return { ok: true };
  if (opts.role !== "admin") {
    return { ok: false, status: 403, message: "Only an administrator can email a Proforma Invoice directly" };
  }
  if (!opts.hasRequiredSignature) {
    return { ok: false, status: 400, message: "The Proforma Invoice must be signed before it can be emailed directly" };
  }
  return { ok: true };
}

export function invalidatesProformaSpaApproval(opts: {
  docType?: string | null;
  enquirySide?: string | null;
  contentChanged: boolean;
}): boolean {
  return opts.contentChanged
    && opts.docType === "SPA"
    && (opts.enquirySide === "buy" || opts.enquirySide === "sell");
}

export const SPA_ADDENDUM_CATEGORIES = [
  "commercial_terms",
  "price",
  "payment_terms",
  "delivery",
  "documentation",
  "entity",
  "banking",
  "governing_law",
  "specific_clause",
  "custom_clause",
] as const;

type SpaAddendumCategory = (typeof SPA_ADDENDUM_CATEGORIES)[number];

export interface ValidatedSpaAddendumInput {
  addendumNumber?: string;
  effectiveDate: string;
  amendments: Array<SpaAddendumAmendment & { category: SpaAddendumCategory }>;
}

export type SpaAddendumValidationResult =
  | { ok: true; data: ValidatedSpaAddendumInput }
  | { ok: false; status: 400; message: string };

// Strict, DB-free validation for the dedicated SPA addendum workflow. Addenda
// cannot use the generic create-next endpoint because they require deliberate
// clause selections and replacement wording.
export function validateSpaAddendumInput(raw: unknown): SpaAddendumValidationResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, status: 400, message: "Addendum details are required" };
  }
  const body = raw as Record<string, unknown>;
  const text = (
    value: unknown,
    label: string,
    opts: { required?: boolean; max: number },
  ): { ok: true; value: string } | { ok: false; message: string } => {
    if (value === undefined || value === null || value === "") {
      return opts.required
        ? { ok: false, message: `${label} is required` }
        : { ok: true, value: "" };
    }
    if (typeof value !== "string") return { ok: false, message: `${label} must be text` };
    const valueTrimmed = value.trim();
    if (opts.required && !valueTrimmed) return { ok: false, message: `${label} is required` };
    if (valueTrimmed.length > opts.max) return { ok: false, message: `${label} is too long` };
    return { ok: true, value: valueTrimmed };
  };

  const effectiveDate = text(body.effectiveDate, "Effective date", { required: true, max: 10 });
  if (!effectiveDate.ok) return { ok: false, status: 400, message: effectiveDate.message };
  const dateMatch = effectiveDate.value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return { ok: false, status: 400, message: "Effective date must be a valid date" };
  const date = new Date(`${effectiveDate.value}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== Number(dateMatch[1]) ||
    date.getUTCMonth() + 1 !== Number(dateMatch[2]) ||
    date.getUTCDate() !== Number(dateMatch[3])
  ) {
    return { ok: false, status: 400, message: "Effective date must be a valid date" };
  }

  const addendumNumber = text(body.addendumNumber, "Addendum number", { max: 50 });
  if (!addendumNumber.ok) return { ok: false, status: 400, message: addendumNumber.message };
  const normalizedAddendumNumber = addendumNumber.value
    ? normalizeSpaAddendumNumber(addendumNumber.value)
    : "";
  if (addendumNumber.value && !normalizedAddendumNumber) {
    return { ok: false, status: 400, message: "Addendum number must include a number or reference" };
  }

  if (!Array.isArray(body.amendments) || body.amendments.length === 0) {
    return { ok: false, status: 400, message: "Select at least one clause to amend" };
  }
  if (body.amendments.length > 20) {
    return { ok: false, status: 400, message: "An addendum may contain at most 20 clause amendments" };
  }
  const categories = new Set<string>(SPA_ADDENDUM_CATEGORIES);
  const amendments: ValidatedSpaAddendumInput["amendments"] = [];
  for (let index = 0; index < body.amendments.length; index++) {
    const row = body.amendments[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, status: 400, message: `Amendment ${index + 1} is invalid` };
    }
    const item = row as Record<string, unknown>;
    if (typeof item.category !== "string" || !categories.has(item.category)) {
      return { ok: false, status: 400, message: `Choose a valid category for amendment ${index + 1}` };
    }
    const clauseNumber = text(item.clauseNumber, `Clause reference for amendment ${index + 1}`, { required: true, max: 100 });
    if (!clauseNumber.ok) return { ok: false, status: 400, message: clauseNumber.message };
    const description = text(item.description, `Description for amendment ${index + 1}`, { required: true, max: 500 });
    if (!description.ok) return { ok: false, status: 400, message: description.message };
    const existingProvision = text(item.existingProvision, `Existing provision for amendment ${index + 1}`, { max: 5_000 });
    if (!existingProvision.ok) return { ok: false, status: 400, message: existingProvision.message };
    const amendedProvision = text(item.amendedProvision, `Revised provision for amendment ${index + 1}`, { required: true, max: 10_000 });
    if (!amendedProvision.ok) return { ok: false, status: 400, message: amendedProvision.message };
    amendments.push({
      category: item.category as SpaAddendumCategory,
      clauseNumber: clauseNumber.value,
      description: description.value,
      ...(existingProvision.value ? { existingProvision: existingProvision.value } : {}),
      amendedProvision: amendedProvision.value,
    });
  }

  return {
    ok: true,
    data: {
      ...(normalizedAddendumNumber ? { addendumNumber: normalizedAddendumNumber } : {}),
      effectiveDate: effectiveDate.value,
      amendments,
    },
  };
}

// Build the dlcData map for a DLC Draft (SWIFT MT700) derived from a signed SPA.
// Maps the SPA's commercial terms into the MT700 field slots: applicant =
// buyer (50), beneficiary = seller (59), credit amount 32B = qty × unit price,
// ports of loading/discharge (44E/44F), goods description (45A) and delivery
// term. Pure and DB-free so the SPA→DLC carry-over is unit-testable; blank
// inputs simply leave the template's bracket placeholders in place.
// An index premium is not a unit price. Keep monetary totals blank until the
// ruling-month CP / index has been fixed by the parties (LPG SPA, among others).
function isFormulaContractPrice(price?: string): boolean {
  return /(?:\bCP\b|\bPlatts\b|\b(?:formula|index|premium|discount)\b|[+*]|\/\s*\d)/i.test(price || "");
}

export function buildDlcDataFromSpa(fields: {
  buyerName?: string;
  buyerAddress?: string;
  sellerName?: string;
  sellerAddress?: string;
  commodity?: string;
  origin?: string;
  quantity?: string;
  price?: string;
  currency?: string;
  incoterm?: string;
  loadingPort?: string;
  dischargePort?: string;
  qualitySpecs?: string;
}): Record<string, string> {
  const num = (s: string) => parseFloat(((s || "").match(/[\d,]+(?:\.\d+)?/)?.[0] || "").replace(/,/g, "")) || 0;
  const qtyNum = num(fields.quantity || "");
  const priceNum = isFormulaContractPrice(fields.price) ? 0 : num(fields.price || "");
  const amount = qtyNum && priceNum ? (qtyNum * priceNum).toLocaleString("en-US") : "";
  const deliveryTerm = [fields.incoterm, fields.dischargePort].filter(Boolean).join(" ");
  const d: Record<string, string> = {};
  const put = (k: string, v?: string) => { const t = (v || "").trim(); if (t) d[k] = t; };
  put("applicantName", fields.buyerName);
  put("applicantAddress", fields.buyerAddress);
  put("beneficiaryName", fields.sellerName);
  put("beneficiaryAddress", fields.sellerAddress);
  put("currency", fields.currency);
  put("amount", amount);
  put("pricePerUnit", fields.price);
  put("commodity", fields.commodity);
  put("origin", fields.origin);
  put("quantity", fields.quantity);
  put("portOfLoading", fields.loadingPort);
  put("portOfDischarge", fields.dischargePort);
  put("deliveryTerm", deliveryTerm);
  if ((fields.qualitySpecs || "").trim()) {
    d.productSpecification = `PRODUCT SPECIFICATION:\n${fields.qualitySpecs!.trim()}`;
  }
  return d;
}

// Build the pbgData map for a Performance Guarantee Draft (SWIFT MT760)
// derived from a signed SPA. Roles are the REVERSE of the LC: the SELLER's
// performance is guaranteed to the BUYER, so applicant (50) = seller and
// beneficiary (59) = buyer. The guarantee amount is conventionally a
// negotiated percentage of the contract value, so it is intentionally left
// as a template placeholder for the parties/bank to complete. Bank details
// come from the parties' approved KYC records when available: the SELLER's
// bank issues the guarantee (issuing bank name/BIC = seller's bank/SWIFT)
// and the BUYER's bank receives it (beneficiary bank BIC = buyer's SWIFT).
// Blank KYC data degrades to the template placeholders. Pure and
// DB-free so the SPA→PBG carry-over is unit-testable.
export function buildPbgDataFromSpa(fields: {
  buyerName?: string;
  buyerAddress?: string;
  buyerSwift?: string;
  sellerName?: string;
  sellerAddress?: string;
  sellerBank?: string;
  sellerSwift?: string;
  commodity?: string;
  origin?: string;
  quantity?: string;
  currency?: string;
  dischargePort?: string;
  spaNumber?: string;
}): Record<string, string> {
  const d: Record<string, string> = {};
  const put = (k: string, v?: string) => { const t = (v || "").trim(); if (t) d[k] = t; };
  put("applicantName", fields.sellerName);
  put("applicantAddress", fields.sellerAddress);
  put("beneficiaryName", fields.buyerName);
  put("beneficiaryAddress", fields.buyerAddress);
  put("currency", fields.currency);
  put("commodity", fields.commodity);
  put("origin", fields.origin);
  put("quantity", fields.quantity);
  put("destination", fields.dischargePort);
  put("spaNumber", fields.spaNumber);
  put("issuingBankName", fields.sellerBank);
  put("issuingBankBic", fields.sellerSwift);
  put("beneficiaryBankBic", fields.buyerSwift);
  return d;
}

export function buildProformaInvoiceDataFromSpa(fields: {
  spaNumber?: string;
  quantity?: string;
  price?: string;
  incoterm?: string;
  laycan?: string;
  packing?: string;
  validUntil?: string;
}): Record<string, string> {
  const cleanSpaNumber = (fields.spaNumber || "").trim() || "_______________";
  const num = (value?: string) =>
    parseFloat(((value || "").match(/[\d,]+(?:\.\d+)?/)?.[0] || "").replace(/,/g, ""));
  const quantity = num(fields.quantity);
  const price = isFormulaContractPrice(fields.price) ? NaN : num(fields.price);
  const totalAmount = Number.isFinite(quantity) && Number.isFinite(price)
    ? (quantity * price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";
  const invoiceSuffix = cleanSpaNumber.replace(/[^a-zA-Z0-9/-]+/g, "-");
  const data: Record<string, string> = {
    invoiceNumber: `PI-${invoiceSuffix}`,
    spaNumber: cleanSpaNumber,
  };
  const put = (key: string, value?: string) => {
    const trimmed = (value || "").trim();
    if (trimmed) data[key] = trimmed;
  };
  put("deliveryTerm", fields.incoterm);
  put("shipmentWindow", fields.laycan);
  put("packing", fields.packing);
  put("validUntil", fields.validUntil);
  put("totalAmount", totalAmount);
  return data;
}

export interface PreparedProformaInvoiceFields {
  title: string;
  invoiceNumber: string;
  invoiceDate: string;
  spaNumber: string;
  validUntil: string;
  sellerName: string;
  sellerAddress: string;
  sellerContact: string;
  sellerBank: string;
  sellerSwift: string;
  buyerName: string;
  buyerAddress: string;
  buyerContact: string;
  commodity: string;
  origin: string;
  quantity: string;
  loadingPort: string;
  dischargePort: string;
  deliveryTerm: string;
  shipmentWindow: string;
  packing: string;
  price: string;
  currency: string;
  paymentTerms: string;
  tolerance: string;
  totalAmount: string;
}

export interface ProformaInvoicePreparation {
  sourceRevision: string;
  fields: PreparedProformaInvoiceFields;
  content: string;
}

const PI_PREPARED_FIELD_KEYS: Array<keyof PreparedProformaInvoiceFields> = [
  "title", "invoiceNumber", "invoiceDate", "spaNumber", "validUntil",
  "sellerName", "sellerAddress", "sellerContact", "sellerBank", "sellerSwift",
  "buyerName", "buyerAddress", "buyerContact",
  "commodity", "origin", "quantity", "loadingPort", "dischargePort",
  "deliveryTerm", "shipmentWindow", "packing", "price", "currency",
  "paymentTerms", "tolerance", "totalAmount",
];

export function sanitizePreparedProformaInvoiceFields(input: unknown): PreparedProformaInvoiceFields {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return Object.fromEntries(PI_PREPARED_FIELD_KEYS.map((key) => {
    const value = typeof source[key] === "string" ? source[key].trim() : "";
    return [key, value.slice(0, key === "paymentTerms" ? 4000 : 1000)];
  })) as unknown as PreparedProformaInvoiceFields;
}

export function buildProformaInvoiceSourceRevision(parentDoc: any): string {
  return createHash("sha256").update(JSON.stringify({
    id: parentDoc?.id || null,
    content: parentDoc?.content ?? null,
    status: parentDoc?.status ?? null,
    adminChecks: parentDoc?.adminChecks ?? null,
    enquiryRef: parentDoc?.enquiryRef ?? null,
  })).digest("hex");
}

export function buildProformaInvoicePreviewToken(
  parentDocId: string,
  sourceRevision: string,
  fields: PreparedProformaInvoiceFields,
  secret = process.env.SESSION_SECRET,
): string {
  if (!secret) throw new Error("SESSION_SECRET is required to confirm Proforma Invoice previews");
  return createHmac("sha256", secret)
    .update(JSON.stringify({ parentDocId, sourceRevision, fields }))
    .digest("hex");
}

export function validateProformaInvoicePreviewToken(
  parentDocId: string,
  sourceRevision: string,
  fields: PreparedProformaInvoiceFields,
  token: unknown,
  secret = process.env.SESSION_SECRET,
): boolean {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return false;
  const expected = buildProformaInvoicePreviewToken(parentDocId, sourceRevision, fields, secret);
  return timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
}

// Fetch enquiries and deals from storage and return the proposed matches.
export async function findEnquiryMatches(): Promise<EnquiryMatch[]> {
  const enquiries = await storage.getTradeEnquiries();
  const existingDeals = await storage.getDeals();
  return computeEnquiryMatches(enquiries, existingDeals);
}

// Approve a deal's TFR: form exactly one trade in the Deal Desk and mint a
// blockchain block. Delegates to storage.formTradeForTfrApproval, which performs
// the entire formation (atomic claim, trade creation, block mint, TFR acceptance,
// enquiry linking, deal advance) inside a single DB transaction so any mid-way
// failure rolls back fully and the deal is never stranded in trade_forming. The
// conditional claim also serializes concurrent approvals so a trade can't be
// double-formed.
// Server-side allowlist of manually incorporable TFR fields (mirrors the edit
// dialog). Everything else — reference, parties, economics, conclusions,
// approval fields — stays auto-derived and cannot be overridden via the API.
const TFR_MANUAL_FIELD_KEYS = new Set([
  "addressedToName", "addressedToAddress", "addressedToAttn",
  "buyerBank", "buyerBankRating", "sellerBank", "sellerBankRating",
  "proposedInstruments", "workingCapitalRequired", "financingPeriod",
  "expectedYield", "preparedBy", "additionalDetails",
]);
const TFR_MANUAL_FIELD_MAX_LEN = 4000;

// A details save rebuilds the TFR content from the template — which would
// silently discard manual full-text edits made via "Edit Full TFR". The
// document carries a persistent contentManuallyEdited flag (set by the
// full-text edit endpoints, cleared by a rebuilding details save); when it is
// set, the save is rejected with this message unless the caller passed
// confirmRebuild: true. Exported for tests and for the client to key on.
export const TFR_MANUAL_EDIT_CONFLICT_MESSAGE =
  "This TFR's text was manually edited. Saving details rebuilds it from the template and will discard those manual edits — confirm the rebuild to proceed.";

// ── One-time backfill: legacy hand-edited TFRs ─────────────────────────────
// TFRs whose full text was hand-edited BEFORE the persistent
// contentManuallyEdited flag existed have the flag false, so a details save
// would rebuild from the template and silently discard those edits without
// the confirmation step. On startup (once, guarded by an app setting) we
// rebuild each still-editable TFR (pending deals + active candidates) from
// the template exactly like a details save would, and flag any document whose
// stored content diverges from that rebuild. Divergence can also come from
// enquiry-data drift since generation — flagging those too is deliberately
// conservative: a false positive only costs the admin one confirm click,
// while a false negative silently destroys manual work. Newly generated or
// details-rebuilt TFRs match their rebuild, so their flag stays false.
export const TFR_MANUAL_EDIT_BACKFILL_SETTING = "tfr_manual_edit_backfill_v1";

// Normalize TFR text for comparison: unify line endings, drop trailing
// whitespace, and ignore the template's `Date: <today>` line (it changes
// daily, so an untouched TFR generated yesterday would otherwise diff).
export function normalizeTfrContentForComparison(content: string): string {
  return (content || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => !/^Date:\s/.test(l))
    .join("\n")
    .trim();
}

export function tfrContentDivergesFromRebuild(stored: string, rebuilt: string): boolean {
  return normalizeTfrContentForComparison(stored) !== normalizeTfrContentForComparison(rebuilt);
}

export async function backfillTfrManualEditFlags(opts?: { force?: boolean }): Promise<{ checked: number; flagged: number; skipped: boolean }> {
  if (!opts?.force) {
    const done = await storage.getAppSetting(TFR_MANUAL_EDIT_BACKFILL_SETTING);
    if (done?.value === "done") return { checked: 0, flagged: 0, skipped: true };
  }

  const enquiries = await storage.getTradeEnquiries();
  const byRef = new Map(enquiries.map((e) => [e.enquiryRef, e]));
  let checked = 0;
  let flagged = 0;

  // Rebuild exactly like updateDealTfrDetails / updateTfrCandidateDetails do,
  // and flag the document when its stored content diverges from the rebuild.
  const evaluate = async (
    docId: string,
    reference: string,
    importRef: string,
    exportRef: string,
    commodity: string,
    manualDetails: Record<string, string> | null | undefined,
  ): Promise<void> => {
    const doc = await storage.getDocumentById(docId);
    if (!doc || doc.contentManuallyEdited) return;
    const importEnq = byRef.get(importRef);
    const exportEnq = byRef.get(exportRef);
    // Without both enquiries the details save 404s before its rebuild, so
    // there is nothing this guard needs to protect here.
    if (!importEnq || !exportEnq) return;
    checked++;
    const { tfrData } = await buildTfrData(reference, importEnq, exportEnq, commodity);
    if (manualDetails) Object.assign(tfrData, manualDetails);
    const imp = partiesFromEnquiry(importEnq);
    const exp = partiesFromEnquiry(exportEnq);
    const rebuilt = generateDocumentContent("TFR", undefined, { name: exp.buyer.name }, { name: imp.seller.name }, { tfrData } as any);
    if (tfrContentDivergesFromRebuild(doc.content || "", rebuilt)) {
      await storage.updateDocument(doc.id, { contentManuallyEdited: true });
      flagged++;
    }
  };

  for (const deal of await storage.getDeals()) {
    // Only still-editable TFRs need the guard: approved/formed deals reject
    // details saves outright before the manual-edit check.
    if (deal.tradeRef || deal.stage !== "tfr_pending" || !deal.tfrDocId) continue;
    try {
      await evaluate(deal.tfrDocId, deal.dealRef, deal.importEnquiryRef, deal.exportEnquiryRef, deal.commodity, deal.tfrManualDetails);
    } catch (err: any) {
      console.error(`[tfr-backfill] deal ${deal.dealRef} check failed:`, err?.message || err);
    }
  }
  for (const cand of await storage.getTfrCandidates()) {
    if (cand.status !== "active" || !cand.tfrDocId) continue;
    try {
      await evaluate(cand.tfrDocId, cand.candidateRef, cand.importEnquiryRef, cand.exportEnquiryRef, cand.commodity, cand.manualDetails);
    } catch (err: any) {
      console.error(`[tfr-backfill] candidate ${cand.candidateRef} check failed:`, err?.message || err);
    }
  }

  await storage.setAppSetting(TFR_MANUAL_EDIT_BACKFILL_SETTING, "done");
  return { checked, flagged, skipped: false };
}

export function cleanTfrManualDetails(details: Record<string, unknown>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(details || {})) {
    if (!TFR_MANUAL_FIELD_KEYS.has(key)) continue;
    if (typeof value === "string" && value.trim()) {
      cleaned[key] = value.trim().slice(0, TFR_MANUAL_FIELD_MAX_LEN);
    }
  }
  return cleaned;
}
async function stampTfrApprovalDoc(tfrDocId: string, approvedBy: string, approvedAt: Date, tradeRef: string): Promise<void> {
  const exists = await storage.getDocumentById(tfrDocId);
  if (!exists) return;
  const stamp = `\n\n=== ADMIN DIGITAL APPROVAL ===\nDigitally approved by: ${approvedBy}\nApproval time stamp: ${approvedAt.toISOString()} (UTC)\nTrade Reference: ${tradeRef}\n`;
  // Atomic conditional append (single UPDATE ... WHERE content NOT LIKE
  // '%stamp-marker%'): appends to the document's CURRENT content, so a
  // concurrent edit's rewrite can never be clobbered by a stale
  // read-modify-write snapshot, and a second stamping is a no-op.
  // The extra tradeRef condition guards against a revoke racing this
  // post-transaction stamp: revoke clears documents.tradeRef atomically, so a
  // late stamp matches nothing instead of stamping a reverted pending TFR.
  await storage.appendDocContentIfMissing(tfrDocId, "ADMIN DIGITAL APPROVAL", stamp, tradeRef);
  // Re-read the canonical content AFTER the append and ALWAYS regenerate the
  // files from it, even when the stamp was already present: an edit racing the
  // approval may have regenerated DOCX/PDF from its own pre-stamp content
  // snapshot, leaving stale unstamped files behind a stamped document.
  const doc = await storage.getDocumentById(tfrDocId);
  if (!doc) return;
  // Approval was revoked between the trade forming and this stamp — the doc is
  // pending again; regenerating here would race the revoke's own file refresh.
  if (doc.tradeRef !== tradeRef) return;
  const content = doc.content || "";
  const docxPath = await generateDocx(doc.id, doc.title, content, "Bullex Admin", undefined, doc.teamMemberCode || undefined, "TFR");
  const pdfPath = await generatePdf(doc.id, doc.title, content, "Bullex Admin", undefined, doc.teamMemberCode || undefined, "TFR");
  await storage.updateDocument(doc.id, { docxPath, pdfPath });
}

// Manually incorporate details into a deal's pending TFR: the admin addresses
// the TFR to a bank (or anyone it needs to be sent to) and fills in financial/
// banking-assessment fields. The details are merged over the auto-derived TFR
// data, the document content + files are regenerated, the details are stored on
// the deal for future regenerations, and the addressee is saved to the reusable
// recipients directory.
export async function updateDealTfrDetails(
  dealId: string,
  details: Record<string, unknown>,
): Promise<PipelineResult<Deal>> {
  const deal = await storage.getDealById(dealId);
  if (!deal) return { ok: false, status: 404, message: "Deal not found" };
  if (deal.tradeRef || deal.stage === "trade_formed") {
    return { ok: false, status: 409, message: "The TFR was already approved; its details can no longer be edited" };
  }
  if (!deal.tfrDocId) return { ok: false, status: 409, message: "The deal has no TFR yet — resume the cascade first" };
  const doc = await storage.getDocumentById(deal.tfrDocId);
  if (!doc) return { ok: false, status: 409, message: "TFR document is missing — resume the cascade first" };

  const cleaned = cleanTfrManualDetails(details);

  const enquiries = await storage.getTradeEnquiries();
  const importEnq = enquiries.find(e => e.enquiryRef === deal.importEnquiryRef);
  const exportEnq = enquiries.find(e => e.enquiryRef === deal.exportEnquiryRef);
  if (!importEnq || !exportEnq) return { ok: false, status: 404, message: "Linked enquiries not found" };

  // Manual full-text edit protection: the document carries a persistent flag
  // set by the full-text edit endpoints ("Edit Full TFR") and cleared whenever
  // a details save rebuilds the content from the template. Keying the guard
  // off this flag — instead of re-deriving the template output and diffing —
  // means an UNTOUCHED TFR never triggers a false "manually edited" 409 just
  // because the underlying enquiry data or the template changed after the TFR
  // was generated.
  if (details?.confirmRebuild !== true && doc.contentManuallyEdited) {
    return { ok: false, status: 409, message: TFR_MANUAL_EDIT_CONFLICT_MESSAGE };
  }

  // Persist the details FIRST via an atomic conditional update: it succeeds
  // only while the deal is still tfr_pending with no trade, so an edit racing
  // a concurrent approval or cancellation loses cleanly here.
  const updated = await storage.updateDealTfrDetailsIfPending(deal.id, cleaned);
  if (!updated) {
    return { ok: false, status: 409, message: "The TFR was approved or cancelled while editing; details were not changed" };
  }

  const { tfrData } = await buildTfrData(deal.dealRef, importEnq, exportEnq, deal.commodity);
  Object.assign(tfrData, cleaned);
  const imp = partiesFromEnquiry(importEnq);
  const exp = partiesFromEnquiry(exportEnq);
  const content = generateDocumentContent("TFR", undefined, { name: exp.buyer.name }, { name: imp.seller.name }, { tfrData } as any);

  // The content is now template-built again, so clear the manual-edit flag.
  const docUpdated = await storage.updateDocument(doc.id, { content, contentManuallyEdited: false });
  if (!docUpdated) {
    return { ok: false, status: 409, message: "The TFR document no longer exists; details were not applied" };
  }
  // File regeneration failure is a FAILURE — never report success while the
  // DOCX/PDF still carry the previous details.
  try {
    const docxPath = await generateDocx(doc.id, doc.title, content, "Bullex Admin", undefined, doc.teamMemberCode || undefined, "TFR");
    const pdfPath = await generatePdf(doc.id, doc.title, content, "Bullex Admin", undefined, doc.teamMemberCode || undefined, "TFR");
    await storage.updateDocument(doc.id, { docxPath, pdfPath });
  } catch (fileErr: any) {
    console.error("[deals] TFR file regeneration failed after details update:", fileErr);
    return { ok: false, status: 500, message: "Details saved but the TFR files could not be regenerated — save again to retry" };
  }

  // If an approval slipped in between our conditional claim and the file
  // write, re-apply the (idempotent) approval stamp so it is never lost.
  const fresh = await storage.getDealById(deal.id);
  if (fresh?.tradeRef) {
    try {
      await stampTfrApprovalDoc(doc.id, fresh.tfrApprovedBy || "Bullex Admin", fresh.tfrApprovedAt || new Date(), fresh.tradeRef);
    } catch (stampErr) {
      console.error("[deals] Failed to re-stamp approval after TFR edit:", stampErr);
    }
  }

  await saveTfrRecipientFromDetails(cleaned);
  return { ok: true, value: updated };
}

export async function updateTfrCandidateDetails(
  candidateId: string,
  details: Record<string, unknown>,
): Promise<PipelineResult<TfrCandidate>> {
  const candidate = await storage.getTfrCandidateById(candidateId);
  if (!candidate) return { ok: false, status: 404, message: "Candidate TFR not found" };
  if (candidate.status !== "active") {
    return {
      ok: false, status: 409,
      message: `Candidate TFR is already ${candidate.status === "deal_formed" ? "part of a deal" : "cancelled"}; its details can no longer be edited`,
    };
  }
  if (!candidate.tfrDocId) return { ok: false, status: 409, message: "Candidate has no TFR document" };
  const doc = await storage.getDocumentById(candidate.tfrDocId);
  if (!doc) return { ok: false, status: 409, message: "Candidate TFR document is missing" };

  const enquiries = await storage.getTradeEnquiries();
  const importEnq = enquiries.find(e => e.enquiryRef === candidate.importEnquiryRef);
  const exportEnq = enquiries.find(e => e.enquiryRef === candidate.exportEnquiryRef);
  if (!importEnq || !exportEnq) return { ok: false, status: 404, message: "Linked enquiries not found" };

  const cleaned = cleanTfrManualDetails(details);

  // Manual full-text edit protection (same as the deal path): keyed off the
  // document's persistent manual-edit flag, never off re-deriving the template
  // output (which drifts when enquiry data or the template changes).
  if (details?.confirmRebuild !== true && doc.contentManuallyEdited) {
    return { ok: false, status: 409, message: TFR_MANUAL_EDIT_CONFLICT_MESSAGE };
  }

  // Persist FIRST via an atomic conditional update: it succeeds only while the
  // candidate is still active, so an edit racing a concurrent cancel or
  // create-deal loses cleanly here (the graduated deal's TFR keeps whatever
  // details were on the candidate at claim time).
  const updated = await storage.updateTfrCandidateDetailsIfActive(candidate.id, cleaned);
  if (!updated) {
    return { ok: false, status: 409, message: "The candidate was cancelled or turned into a deal while editing; details were not changed" };
  }

  const { tfrData } = await buildTfrData(candidate.candidateRef, importEnq, exportEnq, candidate.commodity);
  Object.assign(tfrData, cleaned);
  const imp = partiesFromEnquiry(importEnq);
  const exp = partiesFromEnquiry(exportEnq);
  const content = generateDocumentContent("TFR", undefined, { name: exp.buyer.name }, { name: imp.seller.name }, { tfrData } as any);

  // The content is now template-built again, so clear the manual-edit flag.
  const docUpdated = await storage.updateDocument(doc.id, { content, contentManuallyEdited: false });
  if (!docUpdated) {
    return { ok: false, status: 409, message: "The candidate TFR document no longer exists; details were not applied" };
  }
  // File regeneration failure is a FAILURE — never report success while the
  // DOCX/PDF still carry the previous details.
  try {
    const docxPath = await generateDocx(doc.id, doc.title, content, "Bullex Admin", undefined, doc.teamMemberCode || undefined, "TFR");
    const pdfPath = await generatePdf(doc.id, doc.title, content, "Bullex Admin", undefined, doc.teamMemberCode || undefined, "TFR");
    await storage.updateDocument(doc.id, { docxPath, pdfPath });
  } catch (fileErr: any) {
    console.error("[tfr-candidates] TFR file regeneration failed after details update:", fileErr);
    return { ok: false, status: 500, message: "Details saved but the TFR files could not be regenerated — save again to retry" };
  }

  await saveTfrRecipientFromDetails(cleaned);
  return { ok: true, value: updated };
}

// Full-document TFR editing: the admin edits the ENTIRE TFR text (removing
// sections that don't apply, adding ones that do) instead of only the manual
// detail fields. The provided text becomes the document's canonical content
// and the DOCX/PDF are regenerated from it. A later "Edit TFR Details" save
// detects the divergence from the template output and refuses to rebuild
// (409 TFR_MANUAL_EDIT_CONFLICT_MESSAGE) unless confirmRebuild is passed.
const TFR_CONTENT_MAX_LEN = 200_000;

function validateTfrContent(raw: unknown): { ok: true; content: string } | { ok: false; message: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, message: "The TFR text cannot be empty" };
  }
  if (raw.length > TFR_CONTENT_MAX_LEN) {
    return { ok: false, message: "The TFR text is too long" };
  }
  return { ok: true, content: raw };
}

async function regenerateTfrFiles(docId: string, title: string, content: string, teamMemberCode?: string | null): Promise<void> {
  const docxPath = await generateDocx(docId, title, content, "Bullex Admin", undefined, teamMemberCode || undefined, "TFR");
  const pdfPath = await generatePdf(docId, title, content, "Bullex Admin", undefined, teamMemberCode || undefined, "TFR");
  // Conditional on the content still matching what the files were generated
  // from: if a concurrent edit rewrote the document (or a cancel deleted it),
  // this is a clean no-op rather than pointing the doc at stale files.
  await storage.updateDocumentPathsIfContentMatches(docId, content, docxPath, pdfPath);
}

export async function updateDealTfrContent(
  dealId: string,
  rawContent: unknown,
): Promise<PipelineResult<Deal>> {
  const valid = validateTfrContent(rawContent);
  if (!valid.ok) return { ok: false, status: 400, message: valid.message };
  const deal = await storage.getDealById(dealId);
  if (!deal) return { ok: false, status: 404, message: "Deal not found" };
  if (deal.tradeRef || deal.stage === "trade_formed") {
    return { ok: false, status: 409, message: "The TFR was already approved; its text can no longer be edited" };
  }
  if (!deal.tfrDocId) return { ok: false, status: 409, message: "The deal has no TFR yet — resume the cascade first" };

  // Atomic conditional content replace: fails cleanly if an approval stamped
  // the document (tradeRef set) between our pending check and this write.
  const doc = await storage.updateDocumentContentIfUnapproved(deal.tfrDocId, valid.content);
  if (!doc) {
    return { ok: false, status: 409, message: "The TFR was approved or removed while editing; the text was not changed" };
  }
  // File regeneration failure is a FAILURE — never report success while the
  // DOCX/PDF still carry the previous text.
  try {
    await regenerateTfrFiles(doc.id, doc.title, valid.content, doc.teamMemberCode);
  } catch (fileErr: any) {
    console.error("[deals] TFR file regeneration failed after full-text edit:", fileErr);
    return { ok: false, status: 500, message: "Text saved but the TFR files could not be regenerated — save again to retry" };
  }
  // If an approval slipped in between the content write and the file write,
  // re-apply the (idempotent) approval stamp so it is never lost.
  const fresh = await storage.getDealById(deal.id);
  if (fresh?.tradeRef) {
    try {
      await stampTfrApprovalDoc(doc.id, fresh.tfrApprovedBy || "Bullex Admin", fresh.tfrApprovedAt || new Date(), fresh.tradeRef);
    } catch (stampErr) {
      console.error("[deals] Failed to re-stamp approval after TFR full-text edit:", stampErr);
    }
  }
  return { ok: true, value: fresh || deal };
}

export async function updateTfrCandidateContent(
  candidateId: string,
  rawContent: unknown,
): Promise<PipelineResult<TfrCandidate>> {
  const valid = validateTfrContent(rawContent);
  if (!valid.ok) return { ok: false, status: 400, message: valid.message };
  const candidate = await storage.getTfrCandidateById(candidateId);
  if (!candidate) return { ok: false, status: 404, message: "Candidate TFR not found" };
  if (candidate.status !== "active") {
    return {
      ok: false, status: 409,
      message: `Candidate TFR is already ${candidate.status === "deal_formed" ? "part of a deal" : "cancelled"}; its text can no longer be edited`,
    };
  }
  if (!candidate.tfrDocId) return { ok: false, status: 409, message: "Candidate has no TFR document" };

  // Atomic: the candidate-active check and the content write happen in one
  // statement, so an edit racing a concurrent cancel/create-deal loses cleanly.
  const doc = await storage.updateCandidateDocContentIfActive(candidate.id, valid.content);
  if (!doc) {
    return { ok: false, status: 409, message: "The candidate was cancelled or turned into a deal while editing; the text was not changed" };
  }
  try {
    await regenerateTfrFiles(doc.id, doc.title, valid.content, doc.teamMemberCode);
  } catch (fileErr: any) {
    console.error("[tfr-candidates] TFR file regeneration failed after full-text edit:", fileErr);
    return { ok: false, status: 500, message: "Text saved but the TFR files could not be regenerated — save again to retry" };
  }
  return { ok: true, value: candidate };
}

export async function approveTfrForDeal(
  dealId: string,
  approvedBy: string = "Bullex Admin",
): Promise<PipelineResult<Deal & { createdTradeRef: string }>> {
  const existing = await storage.getDealById(dealId);
  if (!existing) return { ok: false, status: 404, message: "Deal not found" };
  if (existing.tradeRef) return { ok: false, status: 400, message: "Trade already formed for this deal" };
  if (existing.stage !== "tfr_pending" || !existing.tfrDocId) {
    return { ok: false, status: 400, message: "TFR is not ready for approval" };
  }

  // Resolve the linked enquiries (reads only) before forming the trade, so a
  // missing enquiry fails fast without ever touching the deal's stage.
  const enquiries = await storage.getTradeEnquiries();
  const importEnq = enquiries.find(e => e.enquiryRef === existing.importEnquiryRef);
  const exportEnq = enquiries.find(e => e.enquiryRef === existing.exportEnquiryRef);
  if (!importEnq || !exportEnq) return { ok: false, status: 404, message: "Linked enquiries not found" };

  // Approval marks both enquiries 'accepted' — re-check completeness here so
  // details removed after deal formation can't slip blank data into the trade.
  const detailsErr = enquiryPairDetailsError(importEnq, exportEnq);
  if (detailsErr) return { ok: false, status: 400, message: detailsErr };

  const qty = toNumber(importEnq.quantity) || toNumber(exportEnq.quantity);
  const salePrice = toNumber(exportEnq.price) || toNumber(importEnq.price);
  const buyerName = exportEnq.buyerName || exportEnq.createdBy || "TBD";
  const sellerName = importEnq.sellerName || importEnq.producer || "Bullfrog Group";

  // Bind to immutable KYC identities using the enquiry's client references.
  // exportEnq (buy-side) is the buyer; importEnq (sell-side) is the seller.
  const buyerKycId = exportEnq.submittedByClientId || exportEnq.assignedToClientId || null;
  const sellerKycId = importEnq.submittedByClientId || importEnq.assignedToClientId || null;

  // Form the trade atomically: claim the deal, create the trade, mint the block,
  // accept the TFR, tie both enquiries and advance the deal — all in a single
  // transaction. Any mid-way failure rolls the whole sequence back, so the deal
  // returns to tfr_pending (never stranded in trade_forming) and can be safely
  // re-approved with no half-formed trade or orphaned block left behind.
  const result = await storage.formTradeForTfrApproval({
    dealId: existing.id,
    tfrDocId: existing.tfrDocId,
    importEnqId: importEnq.id,
    exportEnqId: exportEnq.id,
    generateTradeHashFn: generateTradeHash,
    mineBlockFn: mineBlock,
    genesisHash: GENESIS_HASH,
    approvedBy,
    tradeInput: {
      commodity: existing.commodity,
      commodityCategory: commodityCategoryFor(existing.commodity),
      quantity: qty,
      unit: importEnq.unit || exportEnq.unit || "MT",
      pricePerUnit: salePrice,
      totalValue: salePrice * qty,
      currency: exportEnq.currency || importEnq.currency || "USD",
      buyerName,
      sellerName,
      buyerKycId,
      sellerKycId,
      origin: importEnq.origin || importEnq.loadingPort || "TBD",
      destination: exportEnq.dischargePort || "TBD",
      incoterm: exportEnq.incoterms || importEnq.incoterms || "FOB",
      enquiryRef: `${existing.importEnquiryRef} / ${existing.exportEnquiryRef}`,
      specifications: importEnq.specifications || exportEnq.specifications || "",
    },
  });

  if (!result.claimed) {
    return { ok: false, status: 409, message: "This deal is already being approved or has been formed" };
  }

  console.log(`[deals] TFR approved for ${existing.dealRef} -> formed trade ${result.trade.tradeRef}`);

  // Stamp the digital approval into the TFR document itself and refresh its
  // files. Best-effort: the authoritative stamp lives on the deal row.
  try {
    await stampTfrApprovalDoc(
      existing.tfrDocId,
      result.deal.tfrApprovedBy || approvedBy,
      result.deal.tfrApprovedAt || new Date(),
      result.trade.tradeRef,
    );
  } catch (stampErr) {
    console.error("[deals] Failed to stamp approval into TFR document:", stampErr);
  }

  return { ok: true, value: { ...result.deal, createdTradeRef: result.trade.tradeRef } };
}

// Revoke a TFR approval: atomically delete the minted trade + its blockchain
// block (only while the trade is still untouched pre_deal and its block is the
// chain tip), revert the TFR document and enquiries, and return the deal to
// tfr_pending. Afterwards the approval stamp is stripped from the document
// content and the DOCX/PDF files regenerated (best-effort, like stamping).
export async function revokeTfrApproval(dealId: string): Promise<PipelineResult<Deal>> {
  const result = await storage.revokeTfrApprovalForDeal(dealId);
  if (!result.ok) return { ok: false, status: result.status, message: result.message };

  console.log(`[deals] TFR approval revoked for deal ${result.deal.dealRef} (trade ${result.tradeRef} deleted)`);

  // Strip the "ADMIN DIGITAL APPROVAL" stamp from the document content and
  // regenerate its files. Best-effort: the authoritative approval state lives
  // on the deal row (already reverted); a failure here leaves a stale stamp in
  // the text only, and the next detail edit regenerates content from scratch.
  if (result.tfrDocId) {
    try {
      // Atomic conditional strip: removes the stamp ONLY while the document is
      // still detached from any trade. If a fresh re-approval slipped in after
      // the revoke transaction committed, the document carries the new
      // tradeRef and this stale cleanup matches nothing — it can never wipe
      // the new approval's stamp or its regenerated files.
      const stripped = await storage.stripDocContentIfDetached(result.tfrDocId, "\n\n=== ADMIN DIGITAL APPROVAL ===");
      const doc = stripped ?? await storage.getDocumentById(result.tfrDocId);
      // Refresh files only while the doc remains detached (same guard).
      if (doc && doc.tradeRef == null) {
        const content = doc.content || "";
        const docxPath = await generateDocx(doc.id, doc.title, content, "Bullex Admin", undefined, doc.teamMemberCode || undefined, "TFR");
        const pdfPath = await generatePdf(doc.id, doc.title, content, "Bullex Admin", undefined, doc.teamMemberCode || undefined, "TFR");
        await storage.setDocFilesIfDetached(doc.id, docxPath, pdfPath);
      }
    } catch (stripErr) {
      console.error("[deals] Failed to strip approval stamp from TFR document:", stripErr);
    }
  }

  return { ok: true, value: result.deal };
}

declare module "express-session" {
  interface SessionData {
    authenticated: boolean;
    username: string;
    role: "admin" | "client" | "team";
    clientKycId: string;
    clientCompanyName: string;
    allowedModules: string[];
    amendUnlockUntil?: number;
  }
}

const AMEND_UNLOCK_DURATION_MS = 15 * 60 * 1000;

// Uploaded files are persisted to Replit Object Storage (see server/object-files.ts).
// Storage categories used as bucket subfolders:
const KYC_CAT = "kyc";
const TRADE_CAT = "trades";
const ENQUIRY_CAT = "enquiries";
const TEAM_CAT = "team";
const CONTACT_CAT = "contacts";

const allowedExts = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".doc", ".docx", ".xls", ".xlsx"];
const photoExts = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

const EXT_TO_IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

function imageContentTypeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return EXT_TO_IMAGE_MIME[ext] || "application/octet-stream";
}

const EXT_TO_TRADE_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

// Derives a safe, server-controlled content type from the stored filename
// extension. Never use the client-supplied MIME type for serving — an attacker
// can send Content-Type: text/html while naming the file something.jpg.
function safeContentTypeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return EXT_TO_TRADE_MIME[ext] || "application/octet-stream";
}

const KYC_PUBLIC_UPLOAD_MAX = 10;
const KYC_PUBLIC_UPLOAD_WINDOW_MS = 15 * 60 * 1000;
const KYC_ORPHAN_CAP = 300;
// Global cap on pending (unreviewed) public KYC applications. Prevents multi-IP
// attackers from flooding the onboarding queue and exhausting email/screening quotas
// even after the per-IP rate limit is satisfied. 200 pending applications is far
// above realistic legitimate throughput and well below storage limits.
const KYC_APP_CAP = 200;
const kycPublicUploadTracker = new Map<string, { count: number; resetAt: number }>();

function checkKycPublicUploadRate(ip: string): boolean {
  const now = Date.now();
  const entry = kycPublicUploadTracker.get(ip);
  if (!entry || now > entry.resetAt) {
    kycPublicUploadTracker.set(ip, { count: 1, resetAt: now + KYC_PUBLIC_UPLOAD_WINDOW_MS });
    return true;
  }
  if (entry.count >= KYC_PUBLIC_UPLOAD_MAX) return false;
  entry.count++;
  return true;
}

// ── Team-KYC public upload abuse controls ────────────────────────────────────
// Global cap: limit the total number of unreviewed (pending) team-KYC
// applications that can accumulate in the database without admin action.
// This mirrors the KYC_ORPHAN_CAP pattern on the standard KYC flow and prevents
// a multi-IP attacker from filling storage with junk applications indefinitely.
const TEAM_KYC_APP_CAP = 100;

// Per-IP in-process tracker for team-KYC file uploads (photo + documents).
// Limits how many files a single IP can upload across all applications in a
// 15-minute window, as a fast secondary guard supplementing the global DB cap.
const TEAM_KYC_UPLOAD_MAX = 15;
const TEAM_KYC_UPLOAD_WINDOW_MS = 15 * 60 * 1000;
const teamKycUploadTracker = new Map<string, { count: number; resetAt: number }>();

function checkTeamKycUploadRate(ip: string): boolean {
  const now = Date.now();
  const entry = teamKycUploadTracker.get(ip);
  if (!entry || now > entry.resetAt) {
    teamKycUploadTracker.set(ip, { count: 1, resetAt: now + TEAM_KYC_UPLOAD_WINDOW_MS });
    return true;
  }
  if (entry.count >= TEAM_KYC_UPLOAD_MAX) return false;
  entry.count++;
  return true;
}

function createUploader(prefix: string, photoOnly = false) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { ...multipartFieldLimits, fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const allowed = photoOnly ? photoExts : allowedExts;
      if (allowed.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error(
          photoOnly
            ? "Photo must be JPG, PNG, or WEBP"
            : "File type not allowed. Accepted: PDF, JPG, PNG, WEBP, DOC, DOCX, XLS, XLSX"
        ));
      }
    },
  });
}

function handleMulterError(err: any, res: any) {
  if (err && (err.code === "LIMIT_FILE_SIZE" || err instanceof multer.MulterError)) {
    return res.status(400).json({ message: err.message || "File too large (max 10MB)" });
  }
  if (err) {
    return res.status(400).json({ message: err.message || "File upload error" });
  }
  return false;
}

const kycUpload = createUploader("kyc");
const tradeUpload = createUploader("trade");
const enquiryUpload = createUploader("enquiry");
const hrUpload = createUploader("hr");
const teamUpload = createUploader("team");
const teamPhotoUpload = createUploader("team-photo", true);
const contactCardUpload = createUploader("contact-card", true);

// Branding logo: restricted to PNG/JPG only. WEBP/HEIC are intentionally rejected
// because pdfkit's doc.image() cannot render them, and the logo must embed in PDFs.
const LOGO_CAT = "branding";
const logoExts = [".png", ".jpg", ".jpeg"];
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { ...multipartFieldLimits, fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (logoExts.includes(ext)) cb(null, true);
    else cb(new Error("Logo must be a PNG or JPG image"));
  },
});

// Validates the actual file bytes (not just the extension) so an attacker can't
// upload non-image content with an image extension.
function isPngOrJpegBytes(buf: Buffer | undefined): boolean {
  if (!buf || buf.length < 4) return false;
  const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  return png || jpeg;
}

const VALID_KYC_DOC_TYPES = [
  "certificate_of_incorporation",
  "memorandum_articles",
  "business_registration",
  "company_registration",
  "board_resolution_poa",
  "passport_copy",
  "audited_financial_statements",
  "bank_reference_letter",
  "proof_of_address",
];

const stageMandatoryDocs: Record<string, string[]> = {
  pre_deal: ["kyc_registration", "icpo_deal_recap"],
  deal: ["spa", "lc_draft", "lc_copy"],
  execution: ["coa", "cow", "coo", "bl", "beneficiary_cert", "sight_draft", "commercial_invoice"],
  final_payment: [],
};

const allMandatoryDocKeys = new Set(Object.values(stageMandatoryDocs).flat());

const allValidDocKeys = new Set([
  "kyc_registration", "loi", "fco", "icpo_deal_recap",
  "spa", "cpa", "lc_draft", "lc_copy", "performance_guarantee",
  "analysis_agency", "stevedoring_agency", "daily_loading_report",
  "coa", "cow", "coo", "bl", "beneficiary_cert", "certificate_insurance", "sight_draft", "commercial_invoice",
  "coa_disport", "cow_disport", "final_invoice", "copy_of_email",
]);

async function requireAuth(req: Request<any>, res: Response, next: NextFunction) {
  if (!req.session?.authenticated || !(req.session.role === "admin" || req.session.role === "team")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (req.session.role === "team") {
    try {
      const tm = await storage.getTeamMemberByUsername(req.session.username ?? "");
      if (!tm || tm.terminatedAt) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "Unauthorized" });
      }
    } catch {
      return res.status(401).json({ message: "Unauthorized" });
    }
  }
  return next();
}

// The document generator (page + all /api/documents/* routes) is a single
// capability that the admin UI exposes under TWO historically-separate module
// ids: "documents" ("Document generation & management", used by the Part-Time /
// Contractor presets) and "doc-templates" ("Doc. Templates"). Both render the
// same generator, so a member holding EITHER must be granted access — otherwise
// a member granted only "documents" sees the nav link but is walled out of the
// page and every document API. Keep this list in sync with the frontend
// ModuleRoute for /documents and /doc-templates.
const DOC_MODULES = ["documents", "doc-templates"];

function requireModule(moduleId: string | string[], opts?: { teamOnly?: boolean }) {
  const requiredIds = Array.isArray(moduleId) ? moduleId : [moduleId];
  return async (req: Request<any>, res: Response, next: NextFunction) => {
    if (!req.session?.authenticated) return res.status(401).json({ message: "Unauthorized" });
    if (req.session.role === "admin") {
      // Team-member-only modules are never accessible to admins, even though
      // admins normally bypass module gating.
      if (opts?.teamOnly) return res.status(403).json({ message: "Access denied: team members only" });
      return next();
    }
    if (req.session.role === "team") {
      // Resolve the team member's CURRENT modules from the database rather than
      // relying on the login-time session snapshot. This way, when an admin
      // grants a module (e.g. "enquiries") to a team member who is already
      // logged in, the access takes effect immediately without forcing them to
      // log out and back in.
      let modules = req.session.allowedModules ?? [];
      try {
        const tm = await storage.getTeamMemberByUsername(req.session.username ?? "");
        if (tm && !tm.terminatedAt) {
          const fresh = tm.allowedModules ?? [];
          if (JSON.stringify(fresh) !== JSON.stringify(modules)) {
            req.session.allowedModules = fresh;
          }
          modules = fresh;
        } else {
          // Team member no longer exists — fail closed rather than trusting the stale session snapshot.
          req.session.destroy(() => {});
          return res.status(401).json({ message: "Unauthorized" });
        }
      } catch {
        return res.status(401).json({ message: "Unable to validate team access" });
      }
      if (requiredIds.some((id) => modules.includes(id))) return next();
    }
    return res.status(403).json({ message: "Access denied: module not assigned" });
  };
}

export function requireAdminAuth(req: Request<any>, res: Response, next: NextFunction) {
  if (req.session && req.session.authenticated && req.session.role === "admin") {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

export async function revalidateTeamSession(req: Request, res: Response, next: NextFunction) {
  if (req.session?.authenticated && req.session.role === "team") {
    try {
      const member = await storage.getTeamMemberByUsername(req.session.username ?? "");
      if (!member || member.terminatedAt) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "Team service has ended", authenticated: false });
      }
    } catch {
      return res.status(503).json({ message: "Unable to validate team access" });
    }
  }
  next();
}

export async function authenticateTeamMember(username: unknown, password: unknown) {
  if (typeof username !== "string" || typeof password !== "string") return undefined;
  const member = await storage.getTeamMemberByUsername(username);
  if (!member || member.terminatedAt || !await bcrypt.compare(password, member.password)) return undefined;
  // bcrypt is deliberately expensive: termination may have committed during it.
  const current = await storage.getTeamMemberById(member.id);
  return current && !current.terminatedAt && current.password === member.password ? current : undefined;
}

function requireAmendUnlock(req: Request<any>, res: Response, next: NextFunction) {
  if (!req.session?.authenticated || req.session.role !== "admin") {
    return res.status(401).json({ message: "Admin authentication required" });
  }
  const until = req.session.amendUnlockUntil;
  if (!until || until < Date.now()) {
    return res.status(403).json({
      message: "Amend mode is locked. Re-enter admin password to enable amendments.",
      code: "AMEND_LOCKED",
    });
  }
  return next();
}

async function requireClientAuth(req: Request<any>, res: Response, next: NextFunction) {
  if (!req.session?.authenticated || req.session.role !== "client") {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const kyc = await storage.getKycApplicationById(req.session.clientKycId ?? "");
    if (!kyc || kyc.status !== "approved") {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Unauthorized" });
    }
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
}

// Document endpoints that approved clients may also reach (preview + create).
// Clients are allowed through here; the route handler then applies client-specific
// record-level scoping. Team/admin still go through the normal module gate.
function requireDocAccess(moduleId: string | string[]) {
  const moduleGuard = requireModule(moduleId);
  return (req: Request<any>, res: Response, next: NextFunction) => {
    if (req.session?.authenticated && req.session.role === "client") return next();
    return moduleGuard(req, res, next);
  };
}

// Returns the enquiry referenced by enquiryRef only if it belongs to this client
// (issued by them OR assigned to them). Used to bind client document preview/create
// to a record the client actually owns.
async function findClientOwnedEnquiry(clientKycId: string, enquiryRef: string) {
  const allEnq = await storage.getTradeEnquiries();
  return allEnq.find(
    (e) =>
      e.enquiryRef === enquiryRef &&
      ((e as any).submittedByClientId === clientKycId || (e as any).assignedToClientId === clientKycId),
  );
}

export async function getDocSubmittedByLabel(submittedByTeamMemberId: string | null | undefined): Promise<string | undefined> {
  if (!submittedByTeamMemberId) return undefined;
  try {
    const tm = await storage.getTeamMemberById(submittedByTeamMemberId);
    if (!tm) return `Team Member ID: ${submittedByTeamMemberId}`;
    return `${tm.name} (Team ID: ${tm.id})`;
  } catch {
    return `Team Member ID: ${submittedByTeamMemberId}`;
  }
}
// hint: Logic changed on both sides. Requires understanding intent of each change.
export type RegisterRoutesOptions = {
  sessionPool?: pg.Pool;
  attachRealtime?: boolean;
  seedOnStart?: boolean;
};

export async function registerRoutes(
  httpServer: Server,
  app: Express,
  options: RegisterRoutesOptions = {},
): Promise<Server> {

  app.set("trust proxy", 1);

  const PgSession = connectPgSimple(session);
  const pgPool = options.sessionPool ?? new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const sessionMiddleware = session({
    store: new PgSession({
      pool: pgPool,
      tableName: "session",
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "bullex-dev-only",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    },
  });
  app.use(sessionMiddleware);
  // Revalidate globally: many legacy endpoints only inspect the session flag.
  // Leave legacy admin sessions (which may have no explicit role) untouched.
  app.use(revalidateTeamSession);
  app.use((req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body: any) => json(projectLpgStsDocumentResponse(body));
    next();
  });

  // Bind an email-audit actor context to every authenticated admin/team request.
  // Any email triggered inside the request (including fire-and-forget sends)
  // picks this up via AsyncLocalStorage and gets a digitally-stamped sender
  // audit block (system ID, email, IP) appended in server/email.ts.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.session?.authenticated && (req.session.role === "admin" || req.session.role === "team")) {
      return runWithEmailActor(
        { role: req.session.role, username: req.session.username || "", ip: req.ip || "unknown" },
        () => next(),
      );
    }
    next();
  });

  // CSRF protection: reject state-changing requests whose Origin does not match this host.
  // sameSite:"lax" already blocks most cross-site cookie delivery, but this adds a defence-in-depth
  // layer that catches the remaining edge cases (e.g. older browsers, misconfigured proxies).
  app.use((req: Request<any>, res: Response, next: NextFunction) => {
    const method = req.method.toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return next();
    // Allow public non-session-sensitive POSTs (KYC registration, logout, file uploads).
    // Login endpoints are intentionally NOT bypassed so the origin check blocks cross-site
    // login CSRF / session-planting attacks. Same-origin browser logins include a matching
    // Origin header and pass through; server-to-server callers (no Origin) also pass through.
    // Exact-match bypass list: only truly public, unauthenticated endpoints that can legitimately
    // originate from different origins (e.g., forms submitted from public pages, external tools).
    const bypassExact = new Set([
      "/api/auth/logout",
      "/api/client/logout",
      "/api/team-kyc",
      "/api/hr/apply",
    ]);
    // Prefix-match bypass for endpoints with dynamic path segments (:token, :id).
    const bypassPrefix = [
      "/api/client/setup/",
      "/api/kyc-form/",
      "/api/team/reset/",
      "/api/kyc/submit",
      "/api/registrations/submit",
    ];
    const isBypass =
      bypassExact.has(req.path) ||
      bypassPrefix.some((p) => req.path.startsWith(p));
    if (isBypass) return next();
    const origin = req.headers["origin"] as string | undefined;
    if (!origin) return next(); // Non-browser / server-to-server calls have no Origin; allow through.
    try {
      const originHost = new URL(origin).host;
      const serverHost = (req.headers["x-forwarded-host"] as string | undefined) || req.get("host") || "";
      if (originHost !== serverHost) {
        return res.status(403).json({ message: "Forbidden: cross-origin request rejected" });
      }
    } catch {
      return res.status(403).json({ message: "Forbidden: invalid Origin header" });
    }
    next();
  });

  // Attach WebSocket chat (Bullex Chat: text + WebRTC signaling). Route-level
  // tests can omit this unrelated long-lived listener while still exercising
  // the production session middleware and HTTP route stack.
  if (options.attachRealtime !== false) {
    attachChat(httpServer, sessionMiddleware);
  }

  // ---- Bullex Chat REST endpoints ----
  app.get("/api/chat/me", async (req, res) => {
    const identity = await getSessionIdentity(req.session);
    if (!identity) return res.status(401).json({ message: "Unauthorized" });
    res.json(identity);
  });

  app.get("/api/chat/users", async (req, res) => {
    const me = await getSessionIdentity(req.session);
    if (!me) return res.status(401).json({ message: "Unauthorized" });
    const out: { id: string; name: string; role: string; subtitle?: string }[] = [];
    const adminUser = process.env.ADMIN_USERNAME;
    if (adminUser) out.push({ id: `admin:${adminUser}`, name: adminUser, role: "admin", subtitle: "Bullex Admin" });
    try {
      const teamRows = await storage.getAllTeamMembers();
      for (const t of teamRows) {
        out.push({ id: `team:${t.username}`, name: t.name || t.username, role: "team", subtitle: t.department || t.position || "Team Member" });
      }
    } catch {}
    // Clients must only see Bullex staff (admin + team), never other clients.
    // Only admin and team members may see the full client directory.
    if (me.role === "admin" || me.role === "team") {
      try {
        const kycRows = await storage.getKycApplications();
        for (const k of kycRows) {
          if (k.status === "approved" && k.clientUsername) {
            out.push({ id: `client:${k.id}`, name: k.companyName, role: "client", subtitle: k.contactName || "Client" });
          }
        }
      } catch {}
    }
    res.json(out.filter((u) => u.id !== me.id));
  });

  app.get("/api/chat/messages", async (req, res) => {
    const me = await getSessionIdentity(req.session);
    if (!me) return res.status(401).json({ message: "Unauthorized" });
    const roomId = String(req.query.room || "");
    if (!roomId) return res.status(400).json({ message: "room required" });
    if (!canAccessRoom(roomId, me.id)) return res.status(403).json({ message: "Forbidden" });
    const messages = await storage.getChatMessages(roomId, 200);
    res.json(messages);
  });

  app.get("/api/chat/dm-room", async (req, res) => {
    const me = await getSessionIdentity(req.session);
    if (!me) return res.status(401).json({ message: "Unauthorized" });
    const other = String(req.query.user || "");
    if (!other) return res.status(400).json({ message: "user required" });
    // Clients may only DM Bullex staff, never other clients.
    if (me.role === "client" && !other.startsWith("admin:") && !other.startsWith("team:")) {
      return res.status(403).json({ message: "Clients may only message Bullex staff." });
    }
    res.json({ roomId: dmRoomId(me.id, other) });
  });
  // ---- end Bullex Chat ----

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // ── Instant Google Meet link (admin/team only) ───────────────────────────
  // Creates a short Google Calendar event with a hangoutsMeet conference and
  // returns the shareable Meet link. Authenticated-only because each call
  // consumes the connected Google account's calendar/Meet quota.
  const meetLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many meeting requests. Please wait a moment and try again." },
  });
  app.post("/api/meet/instant", meetLimiter, requireAuth, async (req, res) => {
    try {
      const title = typeof req.body?.title === "string" ? req.body.title : undefined;
      const meeting = await createInstantMeeting({ title });
      return res.status(201).json(meeting);
    } catch (err: any) {
      console.error("[meet/instant] failed:", err?.message || err);
      return res.status(502).json({
        message:
          err?.message ||
          "Could not create the Google Meet link. Please reconnect Google Calendar and try again.",
      });
    }
  });

  // Email a Google Meet link to a client / counterparty (admin/team only).
  app.post("/api/meet/email", requireAuth, authenticatedEmailLimiter, async (req, res) => {
    try {
      const to = typeof req.body?.to === "string" ? req.body.to.trim() : "";
      const meetUrl = typeof req.body?.meetUrl === "string" ? req.body.meetUrl.trim() : "";
      const recipientName = typeof req.body?.recipientName === "string" ? req.body.recipientName.trim() : undefined;
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : undefined;

      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to);
      if (!emailOk) return res.status(400).json({ message: "A valid recipient email is required." });
      if (!/^https:\/\/meet\.google\.com\//.test(meetUrl)) {
        return res.status(400).json({ message: "A valid Google Meet link is required." });
      }

      const sent = await sendMeetingInviteEmail(to, meetUrl, {
        recipientName,
        senderName: req.session.username || undefined,
        note,
      });
      if (!sent) {
        return res.status(502).json({ message: "Email could not be sent. Check RESEND_API_KEY / verified domain." });
      }
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[meet/email] failed:", err?.message || err);
      return res.status(500).json({ message: err?.message || "Failed to send the meeting invitation." });
    }
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME;
    const adminPass = process.env.ADMIN_PASSWORD;
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminUser || !adminPass) {
      return res.status(500).json({ message: "Admin credentials not configured" });
    }
    const validUsername = username === adminUser || (adminEmail && username === adminEmail);
    if (validUsername && password === adminPass) {
      req.session.regenerate(() => {
        req.session.authenticated = true;
        req.session.username = adminUser;
        req.session.role = "admin";
        req.session.save(() => {
          return res.json({ authenticated: true, username: adminUser, role: "admin" });
        });
      });
      return;
    }
    const teamMember = await authenticateTeamMember(username, password);
    if (teamMember) {
      req.session.regenerate(() => {
        req.session.authenticated = true;
        req.session.username = teamMember.username;
        req.session.role = "team";
        req.session.allowedModules = teamMember.allowedModules ?? [];
        req.session.save(() => {
          return res.json({ authenticated: true, username: teamMember.username, role: "team", name: teamMember.name, allowedModules: teamMember.allowedModules ?? [] });
        });
      });
      return;
    }
    res.status(401).json({ message: "Invalid username or password" });
  });

  app.get("/api/team/members", requireAdminAuth, async (req, res) => {
    const members = await storage.getAllTeamMembers();
    res.json(members.map(m => ({ ...m, password: undefined })));
  });

  app.post("/api/team/members/:id/terminate", requireAdminAuth, async (req, res) => {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason || reason.length > 1000) {
      return res.status(400).json({ message: "Termination reason must be 1–1000 characters" });
    }
    try {
      const member = await storage.terminateTeamMember(req.params.id, reason, req.session.username || "admin");
      if (!member) return res.status(404).json({ message: "Team member not found" });
      disconnectTeamMember(member.username);
      res.json({ ...member, password: undefined });
    } catch {
      res.status(500).json({ message: "Failed to terminate team service" });
    }
  });

  app.post("/api/team/members", requireAdminAuth, async (req, res) => {
    const { username, password, name, department, email, ...rest } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ message: "username, password, and name are required" });
    }
    try {
      const hashedPassword = await bcrypt.hash(password, 12);
      const member = await storage.createTeamMember({ username, password: hashedPassword, name, department: department || null, email: email || null, ...rest });
      res.json({ ...member, password: undefined });
      notify({
        type: "team",
        title: `Team member created — ${name}`,
        message: [department, email].filter(Boolean).join(" · ") || `@${username}`,
        link: "/team",
        module: "team-members",
      });
    } catch (err: any) {
      if (err.message?.includes("unique")) {
        return res.status(409).json({ message: "Username already exists" });
      }
      res.status(500).json({ message: "Failed to create team member" });
    }
  });

  app.patch("/api/team/members/:id", requireAdminAuth, async (req, res) => {
    try {
      const { password, ...data } = req.body;
      if (password !== undefined && password !== null && password !== "") {
        return res.status(400).json({
          message: "Admin password changes are disabled. Use the 'Email Reset Link' button so the team member can set their own password.",
        });
      }
      const member = await storage.updateTeamMember(req.params.id, data);
      res.json({ ...member, password: undefined });
      notify({
        type: "team",
        title: `Team member updated — ${member?.name || "member"}`,
        message: `Profile details were changed`,
        link: "/team",
        module: "team-members",
      });
    } catch (err: any) {
      if (err.message?.includes("unique")) {
        return res.status(409).json({ message: "Username already exists" });
      }
      res.status(500).json({ message: "Failed to update team member" });
    }
  });

  // Generate & email a one-time password reset link for a team member (admin only)
  app.post("/api/team/members/:id/send-reset-link", requireAdminAuth, authenticatedEmailLimiter, async (req, res) => {
    try {
      const member = await storage.getTeamMemberById(req.params.id);
      if (!member) return res.status(404).json({ message: "Team member not found" });
      if (member.terminatedAt) return res.status(409).json({ message: "Team service has ended" });
      const recipient = member.email || null;
      if (!recipient) return res.status(400).json({ message: "Team member has no email address on file." });

      const { randomBytes } = await import("crypto");
      const token = randomBytes(32).toString("hex");
      const expiryHours = 24;
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

      await storage.createTeamPasswordResetToken(member.id, token, expiresAt);

      const proto = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const resetUrl = `${proto}://${host}/team-reset/${token}`;

      let sent = false;
      let emailError: string | undefined;
      try {
        sent = await sendTeamMemberPasswordResetLinkEmail(recipient, member.name || "Team Member", member.username, resetUrl, expiryHours);
        if (!sent) emailError = "Email provider returned a failure (check server logs).";
      } catch (e: any) {
        emailError = e?.message || "Unknown email error";
        console.error("[team-member-reset-link-email] error:", e);
      }
      res.json({ success: sent, emailSent: sent, emailError, recipient, expiresAt });
      if (sent) {
        notify({
          type: "team",
          title: `Password reset link sent — ${member.name || member.username}`,
          message: `Reset link emailed to ${recipient}`,
          link: "/team",
          module: "team-members",
        });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to send reset link" });
    }
  });

  // Public: verify a team password reset token (no auth)
  app.get("/api/team/reset/:token", async (req, res) => {
    try {
      const row = await storage.getTeamPasswordResetTokenByToken(req.params.token);
      if (!row) return res.status(404).json({ message: "Invalid reset link." });
      if (row.usedAt) return res.status(410).json({ message: "This reset link has already been used." });
      if (new Date(row.expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "This reset link has expired." });
      const member = await storage.getTeamMemberById(row.memberId);
      if (!member) return res.status(404).json({ message: "Team member not found." });
      if (member.terminatedAt) return res.status(410).json({ message: "Team service has ended" });
      res.json({ valid: true, username: member.username, name: member.name, expiresAt: row.expiresAt });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Public: consume a team password reset token and set a new password
  app.post("/api/team/reset/:token", async (req, res) => {
    try {
      const { password } = req.body || {};
      if (!password || typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }
      const row = await storage.getTeamPasswordResetTokenByToken(req.params.token);
      if (!row) return res.status(404).json({ message: "Invalid reset link." });
      if (row.usedAt) return res.status(410).json({ message: "This reset link has already been used." });
      if (new Date(row.expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "This reset link has expired." });
      const member = await storage.getTeamMemberById(row.memberId);
      if (!member) return res.status(404).json({ message: "Team member not found." });
      if (member.terminatedAt) return res.status(410).json({ message: "Team service has ended" });
      const hashedPassword = await bcrypt.hash(password, 12);
      const updated = await storage.completeTeamPasswordReset(req.params.token, hashedPassword);
      if (!updated) return res.status(410).json({ message: "Reset link is no longer valid" });
      res.json({ success: true, username: member.username });
      notify({
        type: "team",
        title: `Team member set a new password — ${member.name || member.username}`,
        message: `Password reset completed for @${member.username}`,
        link: "/team",
        severity: "warning",
        module: "team-members",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/team/members/:id/photo", requireAdminAuth, (req, res) => {
    teamPhotoUpload.single("photo")(req, res, async (err) => {
      if (handleMulterError(err, res)) return;
      const file = req.file;
      try {
        if (!file) return res.status(400).json({ message: "No file uploaded" });
        const member = await storage.getTeamMemberById(req.params.id);
        if (!member) {
          return res.status(404).json({ message: "Member not found" });
        }
        if (member.terminatedAt) return res.status(409).json({ message: "Team service has ended; profile is read-only" });
        const storedName = await saveUpload(TEAM_CAT, "team-photo", file);
        let updated;
        try {
          updated = await storage.updateTeamMemberPhoto(req.params.id, storedName);
        } catch (error) {
          // Termination can win while the upload is in flight. Never delete the
          // retained photo until the conditional profile update succeeds.
          await deleteObject(TEAM_CAT, storedName);
          throw error;
        }
        if (member.photoStoredName) {
          await deleteObject(TEAM_CAT, member.photoStoredName);
        }
        res.json({ ...updated, password: undefined });
        notify({
          type: "team",
          title: `Team member photo updated — ${member.name || member.username}`,
          message: `A new profile photo was uploaded`,
          link: "/team",
          module: "team-members",
        });
      } catch (e: any) {
        res.status(e.statusCode === 409 ? 409 : 500).json({ message: e.message });
      }
    });
  });

  app.get("/api/team/members/:id/photo", requireAdminAuth, async (req, res) => {
    try {
      const member = await storage.getTeamMemberById(req.params.id);
      if (!member || !member.photoStoredName) return res.status(404).json({ message: "No photo" });
      await streamObject(TEAM_CAT, member.photoStoredName, res, { inline: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Contacts (visiting cards) ──────────────────────────────────────────────
  // Gated by the "contacts" module; admins bypass. All allocated team members may
  // manage contacts (no approval workflow involved).
  app.get("/api/contacts", requireModule("contacts"), async (_req, res) => {
    try {
      res.json(await storage.getContacts());
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/contacts/:id", requireModule("contacts"), async (req, res) => {
    try {
      const contact = await storage.getContactById(req.params.id);
      if (!contact) return res.status(404).json({ message: "Contact not found" });
      res.json(contact);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/contacts", requireModule("contacts"), async (req, res) => {
    const parsed = insertContactSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid contact", errors: parsed.error.flatten() });
    }
    try {
      const submittedByTeamMemberId = await getSessionTeamMemberId(req);
      const created = await storage.createContact({ ...parsed.data, submittedByTeamMemberId });
      res.status(201).json(created);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/contacts/:id", requireModule("contacts"), async (req, res) => {
    const parsed = insertContactSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid contact", errors: parsed.error.flatten() });
    }
    if (Object.keys(parsed.data).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }
    try {
      const updated = await storage.updateContact(req.params.id, parsed.data);
      if (!updated) return res.status(404).json({ message: "Contact not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/contacts/:id", requireModule("contacts"), async (req, res) => {
    try {
      const existing = await storage.getContactById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Contact not found" });
      if (existing.cardImageStoredName) {
        await deleteObject(CONTACT_CAT, existing.cardImageStoredName);
      }
      await storage.deleteContact(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/contacts/:id/card", requireModule("contacts"), (req, res) => {
    contactCardUpload.single("card")(req, res, async (err) => {
      if (handleMulterError(err, res)) return;
      const file = req.file;
      try {
        if (!file) return res.status(400).json({ message: "No file uploaded" });
        const contact = await storage.getContactById(req.params.id);
        if (!contact) return res.status(404).json({ message: "Contact not found" });
        if (contact.cardImageStoredName) {
          await deleteObject(CONTACT_CAT, contact.cardImageStoredName);
        }
        const storedName = await saveUpload(CONTACT_CAT, "contact-card", file);
        const updated = await storage.updateContactCardImage(req.params.id, storedName);
        res.json(updated);
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    });
  });

  app.get("/api/contacts/:id/card", requireModule("contacts"), async (req, res) => {
    try {
      const contact = await storage.getContactById(req.params.id);
      if (!contact || !contact.cardImageStoredName) return res.status(404).json({ message: "No card image" });
      await streamObject(CONTACT_CAT, contact.cardImageStoredName, res, { inline: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ---- Counterparty company bank accounts (Banking & LC module) ----
  app.get("/api/bank-accounts", requireModule("banking"), async (_req, res) => {
    try {
      res.json(await storage.getCompanyBankAccounts());
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/bank-accounts", requireModule("banking"), async (req, res) => {
    const parsed = insertCompanyBankAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid bank account", errors: parsed.error.flatten() });
    }
    try {
      const submittedByTeamMemberId = await getSessionTeamMemberId(req);
      const created = await storage.createCompanyBankAccount({ ...parsed.data, submittedByTeamMemberId });
      res.status(201).json(created);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/bank-accounts/:id", requireModule("banking"), async (req, res) => {
    const parsed = insertCompanyBankAccountSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid bank account", errors: parsed.error.flatten() });
    }
    if (Object.keys(parsed.data).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }
    try {
      const updated = await storage.updateCompanyBankAccount(req.params.id, parsed.data);
      if (!updated) return res.status(404).json({ message: "Bank account not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/bank-accounts/:id", requireModule("banking"), async (req, res) => {
    try {
      const deleted = await storage.deleteCompanyBankAccount(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Bank account not found" });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ---- Shipment tracking (manual today; positionSource ready for a live AIS feed) ----
  app.get("/api/shipments", requireModule("shipments"), async (_req, res) => {
    try {
      res.json(await storage.getShipments());
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Public: live commodity market prices (server-side cached, 5 min).
  app.get("/api/market-prices", async (_req, res) => {
    try {
      const prices = await getMarketPrices();
      res.json(prices);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to fetch market prices" });
    }
  });

  app.get("/api/shipments/ais-status", requireModule("shipments"), async (_req, res) => {
    const { isAisEnabled } = await import("./ais");
    res.json({ enabled: isAisEnabled() });
  });

  app.get("/api/shipments/:id", requireModule("shipments"), async (req, res) => {
    try {
      const shipment = await storage.getShipmentById(req.params.id);
      if (!shipment) return res.status(404).json({ message: "Shipment not found" });
      res.json(shipment);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/shipments", requireModule("shipments"), async (req, res) => {
    const parsed = insertShipmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid shipment", errors: parsed.error.flatten() });
    }
    if ((parsed.data.lastLat == null) !== (parsed.data.lastLng == null)) {
      return res.status(400).json({ message: "Provide both latitude and longitude, or neither" });
    }
    try {
      const submittedByTeamMemberId = await getSessionTeamMemberId(req);
      const hasPosition = parsed.data.lastLat != null && parsed.data.lastLng != null;
      const created = await storage.createShipment({
        ...parsed.data,
        submittedByTeamMemberId,
        lastPositionAt: hasPosition ? new Date() : null,
      });
      res.status(201).json(created);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/shipments/:id", requireModule("shipments"), async (req, res) => {
    const parsed = insertShipmentSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid shipment", errors: parsed.error.flatten() });
    }
    if (Object.keys(parsed.data).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }
    try {
      const existing = await storage.getShipmentById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Shipment not found" });
      const positionTouched = "lastLat" in parsed.data || "lastLng" in parsed.data;
      let positionAt: { lastPositionAt: Date | null } | {} = {};
      if (positionTouched) {
        const nextLat = "lastLat" in parsed.data ? parsed.data.lastLat : existing.lastLat;
        const nextLng = "lastLng" in parsed.data ? parsed.data.lastLng : existing.lastLng;
        if ((nextLat == null) !== (nextLng == null)) {
          return res.status(400).json({ message: "Provide both latitude and longitude, or neither" });
        }
        positionAt = { lastPositionAt: nextLat != null ? new Date() : null, positionSource: "manual" };
      }
      const updated = await storage.updateShipment(req.params.id, {
        ...parsed.data,
        ...positionAt,
      });
      if (!updated) return res.status(404).json({ message: "Shipment not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/shipments/:id", requireModule("shipments"), async (req, res) => {
    try {
      const deleted = await storage.deleteShipment(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Shipment not found" });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/team/members/:id/documents", requireAdminAuth, async (req, res) => {
    const docs = await storage.getTeamMemberDocuments(req.params.id);
    res.json(docs);
  });

  app.post("/api/team/members/:id/documents", requireAdminAuth, teamUpload.single("file") as RequestHandler<any>, async (req, res) => {
    const file = req.file;
    try {
      if (!file) return res.status(400).json({ message: "No file uploaded" });
      const member = await storage.getTeamMemberById(req.params.id);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }
      const storedName = await saveUpload(TEAM_CAT, "team", file);
      const doc = await storage.createTeamMemberDocument({
        memberId: req.params.id,
        docType: req.body.docType || "other",
        originalName: file.originalname,
        storedName,
        mimeType: file.mimetype,
        size: file.size,
      });
      res.json(doc);
      notify({
        type: "team",
        title: `Team member document uploaded — ${member.name || member.username}`,
        message: `${doc.docType}: ${doc.originalName}`,
        link: "/team",
        module: "team-members",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/team/documents/:docId/download", requireAdminAuth, async (req, res) => {
    try {
      const doc = await storage.getTeamMemberDocumentById(req.params.docId);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      await streamObject(TEAM_CAT, doc.storedName, res, { downloadName: doc.originalName, contentType: doc.mimeType });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/team/documents/:docId", requireAdminAuth, async (req, res) => {
    try {
      const doc = await storage.getTeamMemberDocumentById(req.params.docId);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      await deleteObject(TEAM_CAT, doc.storedName);
      await storage.deleteTeamMemberDocument(req.params.docId);
      res.json({ success: true });
      notify({
        type: "team",
        title: `Team member document removed`,
        message: `${doc.docType}: ${doc.originalName} was deleted`,
        link: "/team",
        severity: "warning",
        module: "team-members",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/team/members/:id/submissions", requireAdminAuth, async (req, res) => {
    try {
      const [kycs, enquiries, potentialClients] = await Promise.all([
        storage.getKycApplicationsByTeamMemberId(req.params.id),
        storage.getTradeEnquiriesByTeamMemberId(req.params.id),
        storage.getPotentialClientsByTeamMemberId(req.params.id),
      ]);
      res.json({ kycs, enquiries, potentialClients });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/team/members/:id", requireAdminAuth, async (req, res) => {
    res.status(409).json({ message: "Team records must be retained. Terminate service instead." });
  });

  app.get("/api/team-kyc", requireAdminAuth, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const apps = await storage.getTeamKycApplications();
    // Join participantId from team_members (by teamUsername) so the admin UI can display it.
    const members = await storage.getAllTeamMembers();
    const pidByUsername = new Map(members.map(m => [m.username, m.participantId]));
    res.json(apps.map(a => ({
      ...a,
      teamPassword: undefined,
      participantId: a.teamUsername ? (pidByUsername.get(a.teamUsername) || null) : null,
    })));
  });

  // Send KYC invitation email to a candidate (admin only)
  app.post("/api/team-kyc/invite", requireAdminAuth, authenticatedEmailLimiter, async (req, res) => {
    try {
      const { name, email, position, department, message } = req.body;
      if (!email) return res.status(400).json({ message: "Candidate email is required" });

      const proto = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const baseUrl = `${proto}://${host}`;
      const params = new URLSearchParams();
      if (name) params.set("name", name);
      if (email) params.set("email", email);
      if (position) params.set("position", position);
      if (department) params.set("department", department);
      params.set("ref", "invite");
      const kycUrl = `${baseUrl}/team-kyc?${params.toString()}`;

      const { sendTeamKycInvite } = await import("./email.js");
      const sent = await sendTeamKycInvite(email, name || "Candidate", position || null, department || null, message || null, kycUrl);
      if (!sent) return res.status(500).json({ message: "Email could not be sent. Check RESEND_API_KEY." });
      res.json({ success: true, kycUrl });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Team-member self-service: add another team member ─────────────────────
  // A team member holding the "team-network" module can grow their own team two
  // ways: (a) email an onboarding invite, or (b) fill the new member's details
  // directly. Either way the resulting application carries invitedByTeamMemberId
  // bound to the caller, so once an admin approves it the new team member is
  // linked back to whoever added them — which is what scopes document sending.
  app.post("/api/team/my/invite", requireModule("team-network", { teamOnly: true }), authenticatedEmailLimiter, async (req, res) => {
    try {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.status(403).json({ message: "Team-member only" });
      const { name, email, position, department, message } = req.body;
      if (!email) return res.status(400).json({ message: "Candidate email is required" });

      const proto = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const baseUrl = `${proto}://${host}`;
      const params = new URLSearchParams();
      if (name) params.set("name", name);
      if (email) params.set("email", email);
      if (position) params.set("position", position);
      if (department) params.set("department", department);
      if (tmId) params.set("invitedBy", tmId);
      params.set("ref", "invite");
      const kycUrl = `${baseUrl}/team-kyc?${params.toString()}`;

      const { sendTeamKycInvite } = await import("./email.js");
      const sent = await sendTeamKycInvite(email, name || "Candidate", position || null, department || null, message || null, kycUrl);
      if (!sent) return res.status(500).json({ message: "Email could not be sent. Check RESEND_API_KEY." });
      res.json({ success: true });

      const inviter = await storage.getTeamMemberById(tmId).catch(() => null);
      notify({
        type: "team",
        title: `Team member invited — ${name || email}`,
        message: `Invitation sent to ${email} by ${inviter?.name || "a team member"}`,
        link: "/team",
        module: "team-members",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/team/my/team-kyc", requireModule("team-network", { teamOnly: true }), async (req, res) => {
    try {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.status(403).json({ message: "Team-member only" });
      // Credential/status/token/inviter fields are server-controlled — never trust them from the body.
      const { fullName, email, teamUsername: _u, teamPassword: _p, uploadToken: _t, invitedByTeamMemberId: _i, status: _s, ...rest } = req.body;
      if (!fullName || !email) return res.status(400).json({ message: "fullName and email are required" });

      const pendingCount = await storage.countPendingTeamKycApplications();
      if (pendingCount >= TEAM_KYC_APP_CAP) {
        return res.status(429).json({ message: "Application intake is temporarily paused. Please try again later." });
      }
      const application = await storage.createTeamKycApplication({ fullName, email, invitedByTeamMemberId: tmId, ...rest });
      res.json(application);

      const inviter = await storage.getTeamMemberById(tmId).catch(() => null);
      notify({
        type: "team",
        title: `Team member added — ${fullName}`,
        message: `Added by ${inviter?.name || "a team member"}${email ? ` · ${email}` : ""} (pending approval)`,
        link: "/team",
        module: "team-members",
      });

      const submittedAt = new Date().toLocaleDateString("en-GB", {
        day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
      const adminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME;
      if (adminEmail) {
        sendTeamKycAdminNotification(adminEmail, fullName, email, rest.positionApplied || null, rest.department || null, submittedAt)
          .catch((err) => console.error("[email] team-kyc admin notify failed:", err));
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to add team member" });
    }
  });

  // Members (and pending applications) the caller personally added. Approved
  // members with an email are eligible recipients for direct document sends.
  app.get("/api/team/my/added-members", requireModule("team-network", { teamOnly: true }), async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.json([]);
      const [members, apps] = await Promise.all([
        storage.getTeamMembersInvitedBy(tmId),
        storage.getTeamKycApplicationsInvitedBy(tmId),
      ]);
      const result = [
        ...members.map(m => ({
          kind: "member" as const,
          id: m.id,
          name: m.name,
          email: m.email,
          participantId: m.participantId,
          status: "approved" as const,
          canReceive: !!m.email,
        })),
        ...apps
          // Show pending/rejected applications, plus approved applications that
          // were NOT provisioned into a login (teamUsername still null). A
          // provisioned approval creates a team_members row already surfaced
          // above, so hiding those here avoids showing the same person twice.
          .filter(a => a.status !== "approved" || !a.teamUsername)
          .map(a => ({
            kind: "application" as const,
            id: a.id,
            name: a.fullName,
            email: a.email,
            participantId: null,
            status: a.status,
            // A login-less applicant can still receive a document by email
            // (e.g. an NCNDA/ICA sent during onboarding), so long as the
            // applicant hasn't been rejected. Delivery is email-only, so no
            // provisioned team_members row is required.
            canReceive: !!a.email && a.status !== "rejected",
          })),
      ];
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Full profile of an approved member the caller personally added. Ownership is
  // enforced by invitedByTeamMemberId — a member may only view people they added,
  // never an arbitrary team member (horizontal privilege boundary).
  app.get("/api/team/my/added-members/:id", requireModule("team-network", { teamOnly: true }), async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.status(403).json({ message: "No team session" });
      const member = await storage.getTeamMemberById(req.params.id);
      if (!member || member.invitedByTeamMemberId !== tmId) {
        return res.status(404).json({ message: "Member not found" });
      }
      const { password, ...safe } = member;
      res.json(safe);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Notify the admin about any change to a team KYC application (photo/document
  // upload, approval, rejection). Fire-and-forget so it never blocks the response.
  const notifyTeamKycAdminUpdate = (
    app: { fullName: string; email: string | null },
    eventTitle: string,
    eventDetail: string | null,
  ): void => {
    // In-app admin bell notification for every team-member lifecycle event.
    notify({
      type: "team",
      title: `${eventTitle} — ${app.fullName}`,
      message: eventDetail || app.email || app.fullName,
      link: "/team",
      module: "team-members",
    });
    const adminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME;
    if (!adminEmail) return;
    const occurredAt = new Date().toLocaleDateString("en-GB", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    sendTeamKycUpdateNotification(adminEmail, app.fullName, app.email || "—", eventTitle, eventDetail, occurredAt)
      .catch((err) => console.error("[email] team-kyc update admin notify failed:", err));
  };

  app.post("/api/team-kyc", publicFormLimiterStrict, async (req, res) => {
    try {
      // Explicitly exclude credential and token fields — they are server-controlled only.
      const { fullName, email, teamUsername: _u, teamPassword: _p, uploadToken: _t, invitedByTeamMemberId: rawInvitedBy, status: _s, ...rest } = req.body;
      if (!fullName || !email) {
        return res.status(400).json({ message: "fullName and email are required" });
      }
      // Validate the inviter reference (carried by a team-member invite link) so
      // a bogus value can never be persisted; unknown ids degrade to null.
      let invitedByTeamMemberId: string | null = null;
      if (typeof rawInvitedBy === "string" && rawInvitedBy.trim()) {
        const inviter = await storage.getTeamMemberById(rawInvitedBy.trim());
        invitedByTeamMemberId = inviter ? inviter.id : null;
      }
      // Global DB-backed cap: prevent storage exhaustion from automated bogus submissions.
      // Mirrors the KYC_ORPHAN_CAP pattern. Cap is applied before creating the record so
      // that junk applications cannot accumulate indefinitely across multiple IPs.
      const pendingCount = await storage.countPendingTeamKycApplications();
      if (pendingCount >= TEAM_KYC_APP_CAP) {
        return res.status(429).json({ message: "Application intake is temporarily paused. Please try again later." });
      }
      const app = await storage.createTeamKycApplication({ fullName, email, invitedByTeamMemberId, ...rest });
      res.json(app);

      notify({
        type: "team",
        title: `New team KYC application — ${fullName}`,
        message: [rest.positionApplied, rest.department, email].filter(Boolean).join(" · ") || email,
        link: "/team",
        module: "team-members",
      });

      // Fire emails in background after responding
      const submittedAt = new Date().toLocaleDateString("en-GB", {
        day: "2-digit", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
      const adminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME;
      if (adminEmail) {
        sendTeamKycAdminNotification(
          adminEmail,
          fullName,
          email,
          rest.positionApplied || null,
          rest.department || null,
          submittedAt
        ).catch((err) => console.error("[email] team-kyc admin notify failed:", err));
      }
      if (email) {
        sendTeamKycConfirmation(email, fullName)
          .catch((err) => console.error("[email] team-kyc confirmation failed:", err));
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to submit application" });
    }
  });

  // Photo upload for team KYC application — requires the upload token issued at creation.
  app.patch("/api/team-kyc/:id/photo", publicFormLimiterStrict, (req, res) => {
    teamPhotoUpload.single("photo")(req, res, async (err) => {
      if (handleMulterError(err, res)) return;
      const file = req.file;
      try {
        if (!file) return res.status(400).json({ message: "No file uploaded" });
        // Per-IP upload rate guard. Supplements the global application cap by
        // throttling the upload throughput of any individual source address.
        const ip = req.ip || "unknown";
        if (!checkTeamKycUploadRate(ip)) {
          return res.status(429).json({ message: "Too many uploads. Please try again later." });
        }
        const app = await storage.getTeamKycApplicationById(req.params.id);
        if (!app) {
          return res.status(404).json({ message: "Application not found" });
        }
        // Verify the upload token. Only the applicant who received the token in
        // the original POST response can upload files for this application.
        // Only privileged admin/team sessions bypass the token requirement;
        // client sessions and other authenticated roles must still present the token.
        const isPrivilegedSession = req.session?.authenticated &&
          (req.session.role === "admin" || req.session.role === "team");
        if (!isPrivilegedSession) {
          const token = req.headers["x-upload-token"] as string | undefined;
          if (!token || !app.uploadToken || token !== app.uploadToken) {
            return res.status(403).json({ message: "Invalid or missing upload token." });
          }
        }
        if (app.photoStoredName) {
          await deleteObject(TEAM_CAT, app.photoStoredName);
        }
        // Derive a safe image content type from the extension — never trust the
        // client-supplied MIME type, which could be text/html or similar.
        file.mimetype = imageContentTypeFromFilename(file.originalname);
        const storedName = await saveUpload(TEAM_CAT, "team-photo", file);
        const updated = await storage.updateTeamKycPhoto(req.params.id, storedName, file.originalname);
        res.json({ id: updated.id, photoOriginalName: updated.photoOriginalName });
        notifyTeamKycAdminUpdate(app, "Photo Uploaded", file.originalname);
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    });
  });

  // Serve photo for team KYC application. Requires an authenticated admin/team
  // session — this endpoint is only used by the admin review and team-members pages,
  // both of which are protected routes. Unauthenticated callers receive 401 to
  // prevent identity-document disclosure via a guessed or leaked application UUID.
  // Record-level check: admins may access any photo; team members may only access
  // photos for applications they personally invited (invitedByTeamMemberId match).
  // Non-owners receive 404 to avoid leaking application existence as a side-channel.
  app.get("/api/team-kyc/:id/photo", requireAuth, async (req, res) => {
    try {
      const application = await storage.getTeamKycApplicationById(req.params.id);
      if (!application || !application.photoStoredName) return res.status(404).json({ message: "No photo" });
      const callerTmId = await getSessionTeamMemberId(req);
      if (callerTmId !== null && application.invitedByTeamMemberId !== callerTmId) {
        return res.status(404).json({ message: "No photo" });
      }
      // Always derive the content type from the stored filename extension so an
      // attacker cannot serve HTML/script by uploading with a fake MIME type.
      const safeContentType = imageContentTypeFromFilename(application.photoStoredName);
      await streamObject(TEAM_CAT, application.photoStoredName, res, { inline: true, cacheControl: "private, max-age=3600", contentType: safeContentType });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Document upload for team KYC application — requires the upload token issued at creation.
  app.post("/api/team-kyc/:id/documents", publicFormLimiterStrict, (req, res) => {
    teamUpload.single("file")(req, res, async (err) => {
      if (handleMulterError(err, res)) return;
      const file = req.file;
      try {
        if (!file) return res.status(400).json({ message: "No file uploaded" });
        // Per-IP upload rate guard. Supplements the global application cap by
        // throttling the upload throughput of any individual source address.
        const ip = req.ip || "unknown";
        if (!checkTeamKycUploadRate(ip)) {
          return res.status(429).json({ message: "Too many uploads. Please try again later." });
        }
        const app = await storage.getTeamKycApplicationById(req.params.id);
        if (!app) {
          return res.status(404).json({ message: "Application not found" });
        }
        // Verify the upload token. Only the applicant who received the token in
        // the original POST response can upload files for this application.
        // Only privileged admin/team sessions bypass the token requirement;
        // client sessions and other authenticated roles must still present the token.
        const isPrivilegedSessionDoc = req.session?.authenticated &&
          (req.session.role === "admin" || req.session.role === "team");
        if (!isPrivilegedSessionDoc) {
          const token = req.headers["x-upload-token"] as string | undefined;
          if (!token || !app.uploadToken || token !== app.uploadToken) {
            return res.status(403).json({ message: "Invalid or missing upload token." });
          }
        }
        const existingDocs = await storage.getTeamKycDocuments(req.params.id);
        if (existingDocs.length >= 10) {
          return res.status(429).json({ message: "Maximum number of documents (10) already uploaded for this application." });
        }
        const storedName = await saveUpload(TEAM_CAT, "team", file);
        const doc = await storage.createTeamKycDocument({
          applicationId: req.params.id,
          docType: req.body.docType || "other",
          originalName: file.originalname,
          storedName,
          mimeType: file.mimetype,
          size: file.size,
        });
        res.json(doc);
        notifyTeamKycAdminUpdate(app, "Document Uploaded", `${doc.docType}: ${doc.originalName}`);
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    });
  });

  // List documents for a team KYC application (admin only)
  app.get("/api/team-kyc/:id/documents", requireAdminAuth, async (req, res) => {
    const docs = await storage.getTeamKycDocuments(req.params.id);
    res.json(docs);
  });

  // Delete a team KYC document (admin only)
  app.delete("/api/team-kyc-documents/:docId", requireAdminAuth, async (req, res) => {
    try {
      const doc = await storage.getTeamKycDocumentById(req.params.docId);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      await deleteObject(TEAM_CAT, doc.storedName);
      await storage.deleteTeamKycDocument(req.params.docId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Download a team KYC document (admin only)
  app.get("/api/team-kyc-documents/:docId/download", requireAdminAuth, async (req, res) => {
    try {
      const doc = await storage.getTeamKycDocumentById(req.params.docId);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      await streamObject(TEAM_CAT, doc.storedName, res, { downloadName: doc.originalName, contentType: doc.mimeType });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/team-kyc/:id", requireAdminAuth, async (req, res) => {
    try {
      const { status, reviewNotes, teamUsername, teamPassword, allowedModules } = req.body;
      const app = await storage.getTeamKycApplicationById(req.params.id);
      if (!app) return res.status(404).json({ message: "Application not found" });

      // Credentials are optional at approval time: an admin may approve now and
      // allocate the login later (or re-PATCH an already-approved application to
      // allocate it). When BOTH a username and password are supplied we provision
      // the account before persisting, so an application is never left referencing
      // a login that was never created. Provisioning failures (e.g. a duplicate
      // username) abort the request instead of being swallowed.
      const normalizedUsername = typeof teamUsername === "string" ? teamUsername.trim() : "";
      const shouldProvision = status === "approved" && !!normalizedUsername && !!teamPassword;
      // First-time provisioning (account didn't exist before this request) is what
      // triggers the welcome email + auto-NCNDA, whether it happens at approval or
      // at a later "allocate login" step.
      const firstTimeProvision = shouldProvision && !app.teamUsername;
      if (shouldProvision && app.teamUsername) {
        const linkedMember = await storage.getTeamMemberByUsername(app.teamUsername);
        if (linkedMember?.terminatedAt) return res.status(409).json({ message: "Team service has ended; login cannot be reallocated" });
        if (normalizedUsername !== app.teamUsername) return res.status(409).json({ message: "An allocated team username cannot be changed" });
      }

      const hashedTeamPassword = teamPassword ? await bcrypt.hash(teamPassword, 12) : undefined;
      if (shouldProvision) {
        const memberFields = {
          name: app.fullName,
          department: app.department || null,
          email: app.email || null,
          dateOfBirth: app.dateOfBirth || null,
          gender: app.gender || null,
          nationality: app.nationality || null,
          passportNumber: app.passportNumber || null,
          maritalStatus: app.maritalStatus || null,
          phone: app.phone || null,
          homeAddress: app.homeAddress || null,
          city: app.city || null,
          country: app.country || null,
          position: app.positionApplied || null,
          employmentType: app.employmentType || null,
          startDate: app.expectedStartDate || null,
          highestQualification: app.highestQualification || null,
          institution: app.institution || null,
          graduationYear: app.graduationYear || null,
          previousEmployer: app.previousEmployer || null,
          previousRole: app.previousRole || null,
          yearsExperience: app.yearsExperience || null,
          emergencyName: app.emergencyName || null,
          emergencyRelationship: app.emergencyRelationship || null,
          emergencyPhone: app.emergencyPhone || null,
          bankName: app.bankName || null,
          bankBranch: app.bankBranch || null,
          payrollAccountName: app.payrollAccountName || null,
          payrollAccountNumber: app.payrollAccountNumber || null,
          payrollSwift: app.payrollSwift || null,
          additionalNotes: app.additionalNotes || null,
          invitedByTeamMemberId: app.invitedByTeamMemberId || null,
        };
        try {
          const existing = await storage.getTeamMemberByUsername(normalizedUsername);
          if (existing?.terminatedAt) return res.status(409).json({ message: "Team service has ended; username remains reserved" });
          // An existing account may only be reused when it is THIS application's own
          // login (re-approval / re-allocation with the same username). A username
          // that belongs to a different member is a genuine collision and must be
          // rejected instead of silently overwriting that other member's profile.
          const isOwnAccount = !!existing && !!app.teamUsername && app.teamUsername === normalizedUsername;
          if (existing && !isOwnAccount) {
            return res.status(409).json({
              message: "That username is already in use by another team member. Choose a different username.",
            });
          }
          // Members added by another team member must always be able to create
          // documents (NCNDA, ICA, etc.), so guarantee the doc-templates module is
          // present regardless of what the admin selected. They never receive the
          // admin-only job-allocation surface (that lives on gated admin routes).
          const withDocTemplates = (mods: string[] | null | undefined): string[] => {
            const base = Array.isArray(mods) ? [...mods] : [];
            if (app.invitedByTeamMemberId && !base.includes("doc-templates")) base.push("doc-templates");
            return base;
          };
          if (!existing) {
            await storage.createTeamMember({
              username: normalizedUsername,
              password: hashedTeamPassword!,
              allowedModules: withDocTemplates(Array.isArray(allowedModules) ? allowedModules : []),
              ...memberFields,
            });
          } else {
            // Reusing this application's own account — always set the password so
            // the allocated credentials actually work, and refresh profile/modules.
            await storage.updateTeamMember(existing.id, {
              password: hashedTeamPassword!,
              allowedModules: withDocTemplates(Array.isArray(allowedModules) ? allowedModules : (existing.allowedModules ?? [])),
              ...memberFields,
            });
          }
        } catch (e: any) {
          console.error("[team-kyc] account provisioning failed:", e);
          return res.status(500).json({
            message: "Could not create the team member's login account, so the application was not approved. Ensure the username is not already in use, then try again.",
          });
        }
      }

      // Only persist credentials when we actually provisioned an account, so an
      // approval without credentials never records a username that has no login.
      const updated = await storage.updateTeamKycStatus(
        req.params.id, status, reviewNotes,
        shouldProvision ? normalizedUsername : undefined,
        shouldProvision ? hashedTeamPassword : undefined,
      );

      if ((status === "approved" || status === "rejected") && app.status !== status) {
        const reviewLabel = status === "approved" ? "Application Approved" : "Application Rejected";
        const detailParts: string[] = [];
        if (status === "approved" && normalizedUsername) detailParts.push(`Login username: ${normalizedUsername}`);
        if (reviewNotes) detailParts.push(`Notes: ${reviewNotes}`);
        notifyTeamKycAdminUpdate(app, reviewLabel, detailParts.length ? detailParts.join(" · ") : null);
      }

      // When the login account is first provisioned (at approval, or at a later
      // "allocate login" step), send the welcome email + auto-prepare the NCNDA.
      // Approving without credentials defers this until the login is allocated, so
      // we never email a member a "welcome" with no way to log in.
      let emailSent: boolean | null = null;
      let emailError: string | null = null;
      if (firstTimeProvision) {
        // 1) Welcome email — include participant ID from the freshly-created/updated team member.
        let welcomeParticipantId: string | null = null;
        try {
          if (normalizedUsername) {
            const tm = await storage.getTeamMemberByUsername(normalizedUsername);
            welcomeParticipantId = tm?.participantId || null;
          }
        } catch (_) {}
        if (!app.email) {
          emailError = "No email address on the application — welcome email skipped.";
          console.warn("[team-kyc] welcome email skipped: no recipient email");
        } else {
          try {
            emailSent = await sendTeamMemberWelcomeEmail(
              app.email,
              app.fullName,
              app.positionApplied || null,
              app.employmentType || null,
              normalizedUsername || null,
              welcomeParticipantId,
            );
            if (!emailSent) {
              emailError = `Welcome email was rejected by the email provider. Recipient: ${app.email}. Check server logs and ensure your Resend "from" domain is verified.`;
            }
          } catch (e: any) {
            emailSent = false;
            emailError = `Welcome email failed: ${e?.message || "unknown error"}`;
            console.error("[team-kyc] welcome email failed:", e);
          }
        }

        // 2) Auto-prepare NCNDA (Party A = Bullfrog Group, Party B = team member)
        try {
          const partyA: PartyDetails = {
            name: "Bullfrog Group",
            address: "Dubai, United Arab Emirates",
            contact: "docs@bullfrog-group.com",
          };
          const partyB: PartyDetails = {
            name: app.fullName,
            address: [app.homeAddress, app.city, app.country].filter(Boolean).join(", ") || "—",
            contact: app.email || "—",
          };
          const product: any = {
            commodity: "Introduction, representation and onboarding of prospective counterparties on behalf of Bullfrog Group / Bullex Trading Platform",
            governingLaw: "United Arab Emirates",
            recapValidity: "Courts of Dubai, UAE",
            validity: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
          };
          const title = `NCNDA — ${app.fullName}`;
          const content = generateDocumentContent("NCNDA", undefined, partyB, partyA, product);
          const created = await storage.createDocument({
            docType: "NCNDA",
            title,
            content,
            status: "pending_review",
            adminChecks: buildAdminChecks("NCNDA"),
            buyerEmail: app.email || null,
            sellerEmail: null,
            agentCode: welcomeParticipantId || null,
          } as any);
          try {
            const docxPath = await generateDocx(created.id, title, content, "Bullex Admin", welcomeParticipantId || undefined, undefined, created.docType);
            const pdfPath = await generatePdf(created.id, title, content, "Bullex Admin", welcomeParticipantId || undefined, undefined, created.docType);
            await storage.updateDocument(created.id, { docxPath, pdfPath });
          } catch (fileErr) {
            console.error("[team-kyc] NCNDA file generation failed:", fileErr);
          }
        } catch (e) {
          console.error("[team-kyc] auto-NCNDA creation failed:", e);
        }
      }

      res.json({ ...updated, teamPassword: undefined, emailSent, emailError });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update application" });
    }
  });

  // Re-fire welcome email + auto-generate NCNDA for an already-approved team KYC application.
  app.post("/api/team-kyc/:id/resend-welcome", requireAdminAuth, async (req, res) => {
    try {
      const app = await storage.getTeamKycApplicationById(req.params.id);
      if (!app) return res.status(404).json({ message: "Application not found" });
      if (app.status !== "approved") {
        return res.status(400).json({ message: "Application must be approved before resending welcome / NCNDA" });
      }

      let emailSent = false;
      let resendParticipantId: string | null = null;
      try {
        if (app.teamUsername) {
          const tm = await storage.getTeamMemberByUsername(app.teamUsername);
          resendParticipantId = tm?.participantId || null;
        }
      } catch (_) {}
      if (app.email) {
        try {
          emailSent = await sendTeamMemberWelcomeEmail(
            app.email,
            app.fullName,
            app.positionApplied || null,
            app.employmentType || null,
            app.teamUsername || null,
            resendParticipantId,
          );
        } catch (e) {
          console.error("[team-kyc] resend welcome email failed:", e);
        }
      }

      let ncndaDocId: string | null = null;
      try {
        const partyA: PartyDetails = {
          name: "Bullfrog Group",
          address: "Dubai, United Arab Emirates",
          contact: "docs@bullfrog-group.com",
        };
        const partyB: PartyDetails = {
          name: app.fullName,
          address: [app.homeAddress, app.city, app.country].filter(Boolean).join(", ") || "—",
          contact: app.email || "—",
        };
        const product: any = {
          commodity: "Introduction, representation and onboarding of prospective counterparties on behalf of Bullfrog Group / Bullex Trading Platform",
          governingLaw: "United Arab Emirates",
          recapValidity: "Courts of Dubai, UAE",
          validity: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
        };
        const title = `NCNDA — ${app.fullName}`;
        const content = generateDocumentContent("NCNDA", undefined, partyB, partyA, product);
        const created = await storage.createDocument({
          docType: "NCNDA",
          title,
          content,
          status: "pending_review",
          adminChecks: buildAdminChecks("NCNDA"),
          buyerEmail: app.email || null,
          sellerEmail: null,
          agentCode: resendParticipantId || null,
        } as any);
        ncndaDocId = created.id;
        try {
          const docxPath = await generateDocx(created.id, title, content, "Bullex Admin", resendParticipantId || undefined, undefined, created.docType);
          const pdfPath = await generatePdf(created.id, title, content, "Bullex Admin", resendParticipantId || undefined, undefined, created.docType);
          await storage.updateDocument(created.id, { docxPath, pdfPath });
        } catch (fileErr) {
          console.error("[team-kyc] resend NCNDA file generation failed:", fileErr);
        }
      } catch (e: any) {
        console.error("[team-kyc] resend NCNDA creation failed:", e);
        return res.status(500).json({ message: `NCNDA creation failed: ${e.message || e}` });
      }

      res.json({ success: true, emailSent, ncndaDocId });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to resend welcome" });
    }
  });

  // Generate a fresh NCNDA against an approved team member (Agent).
  // Party A (Issuer) = Bullfrog Group; Party B (Receiving Party) = the team member.
  app.post("/api/team-kyc/:id/generate-ncnda", requireAdminAuth, async (req, res) => {
    try {
      const app = await storage.getTeamKycApplicationById(req.params.id);
      if (!app) return res.status(404).json({ message: "Application not found" });
      if (app.status !== "approved") {
        return res.status(400).json({ message: "Team member must be approved before generating NCNDA" });
      }
      let participantId: string | null = null;
      if (app.teamUsername) {
        const tm = await storage.getTeamMemberByUsername(app.teamUsername);
        participantId = tm?.participantId || null;
      }

      const partyA: any = { name: "Bullfrog Group", address: "Dubai, United Arab Emirates", contact: "docs@bullfrog-group.com" };
      const partyB: any = {
        name: app.fullName,
        address: [app.homeAddress, app.city, app.country].filter(Boolean).join(", ") || "—",
        contact: app.email || "—",
      };
      const product: any = {
        commodity: "Introduction, representation and onboarding of prospective counterparties on behalf of Bullfrog Group / Bullex Trading Platform",
        governingLaw: "United Arab Emirates",
        recapValidity: "Courts of Dubai, UAE",
        validity: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
      };

      const title = `NCNDA — ${app.fullName}`;
      const content = generateDocumentContent("NCNDA", undefined, partyB, partyA, product);
      const created = await storage.createDocument({
        docType: "NCNDA",
        title,
        content,
        status: "pending_review",
        adminChecks: buildAdminChecks("NCNDA"),
        buyerEmail: app.email || null,
        sellerEmail: null,
        agentCode: participantId || null,
      } as any);
      try {
        const docxPath = await generateDocx(created.id, title, content, "Bullex Admin", participantId || undefined, undefined, created.docType);
        const pdfPath = await generatePdf(created.id, title, content, "Bullex Admin", participantId || undefined, undefined, created.docType);
        await storage.updateDocument(created.id, { docxPath, pdfPath });
      } catch (fileErr: any) {
        console.error("[team-ncnda] file generation failed:", fileErr?.message || fileErr);
      }
      const fresh = await storage.getDocumentById(created.id);
      res.json(fresh || created);
    } catch (err: any) {
      console.error("[team-ncnda] generation failed:", err);
      res.status(500).json({ message: err.message || "Failed to generate NCNDA" });
    }
  });

  // Generate an International Commission Agreement (ICA) against an approved team member (Agent).
  // Principal = Bullfrog Group; Agent = the team member.
  app.post("/api/team-kyc/:id/generate-ica", requireAdminAuth, async (req, res) => {
    try {
      const app = await storage.getTeamKycApplicationById(req.params.id);
      if (!app) return res.status(404).json({ message: "Application not found" });
      if (app.status !== "approved") {
        return res.status(400).json({ message: "Team member must be approved before generating ICA" });
      }
      let participantId: string | null = null;
      if (app.teamUsername) {
        const tm = await storage.getTeamMemberByUsername(app.teamUsername);
        participantId = tm?.participantId || null;
      }
      if (!participantId) {
        return res.status(400).json({ message: "Team member has no participant ID allocated; cannot generate ICA without an agent code" });
      }

      const agentLabel = req.body?.agentLabel || "Agent";
      const agencyType = req.body?.agencyType || "Non-Exclusive";

      const principal: any = { name: "Bullfrog Group", address: "Dubai, United Arab Emirates", contact: "docs@bullfrog-group.com" };
      const agent: any = {
        name: app.fullName,
        address: [app.homeAddress, app.city, app.country].filter(Boolean).join(", ") || "—",
        contact: app.email || "—",
      };
      const product: any = {
        effectiveDate: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
        agentLabel,
        agencyType,
        principalCountry: "United Arab Emirates",
        principalEntityType: "Group Holding",
        agentCountry: app.country || undefined,
        agentEntityType: app.employmentType || "Individual",
        agentRepresentative: app.fullName,
        agentDesignation: app.positionApplied || undefined,
        agentBankName: app.bankName || undefined,
        agentBankAddress: app.bankBranch || undefined,
        agentAccountName: app.payrollAccountName || undefined,
        agentAccountNumber: app.payrollAccountNumber || undefined,
        agentSwift: app.payrollSwift || undefined,
        commodity: "Introduction, representation and onboarding of prospective counterparties on behalf of Bullfrog Group / Bullex Trading Platform",
        governingLaw: "United Arab Emirates",
        seatOfArbitration: "Dubai, UAE",
        venueOfArbitration: "Dubai International Arbitration Centre (DIAC)",
        numArbitrators: "One",
        termYears: "3",
        recordKeepingYears: "7",
        amlOption: "Standard Commercial Compliance",
        commissionStructure: req.body?.commissionStructure || undefined,
        commissionBasis: req.body?.commissionBasis || undefined,
      };

      const title = `ICA — ${app.fullName}`;
      const content = generateDocumentContent("ICA", undefined, principal, agent, product);
      const created = await storage.createDocument({
        docType: "ICA",
        title,
        content,
        status: "pending_review",
        adminChecks: buildAdminChecks("ICA"),
        buyerEmail: null,
        sellerEmail: app.email || null,
        agentCode: participantId,
      } as any);

      try {
        const docxPath = await generateDocx(created.id, title, content, "Bullex Admin", participantId, undefined, created.docType);
        const pdfPath = await generatePdf(created.id, title, content, "Bullex Admin", participantId, undefined, created.docType);
        await storage.updateDocument(created.id, { docxPath, pdfPath });
      } catch (fileErr: any) {
        console.error("[team-ica] file generation failed:", fileErr?.message || fileErr);
      }
      const fresh = await storage.getDocumentById(created.id);
      res.json(fresh || created);
    } catch (err: any) {
      console.error("[team-ica] generation failed:", err);
      res.status(500).json({ message: err.message || "Failed to generate ICA" });
    }
  });

  // Generate NCNDA against a registered team member (by team_members.id).
  // Party A (Issuer) = Bullfrog Group; Party B (Receiving Party) = the team member (Agent).
  app.post("/api/team-members/:id/generate-ncnda", requireModule("team-network"), async (req, res) => {
    try {
      const tm = await storage.getTeamMemberById(req.params.id);
      if (!tm) return res.status(404).json({ message: "Team member not found" });
      // A team member may only generate for a member they personally added; admin
      // may generate for anyone. Owner-scope the doc so it lands in their vault.
      const callerTmId = req.session?.role === "team" ? await getSessionTeamMemberId(req) : null;
      if (!canGenerateAgentDocForMember({ role: req.session?.role, callerTeamMemberId: callerTmId, targetInvitedByTeamMemberId: tm.invitedByTeamMemberId })) {
        return res.status(403).json({ message: "You can only generate agreements for team members you added" });
      }
      const participantId = tm.participantId || null;

      const partyA: any = { name: "Bullfrog Group", address: "Dubai, United Arab Emirates", contact: "docs@bullfrog-group.com" };
      const partyB: any = {
        name: tm.name,
        address: [tm.homeAddress, tm.city, tm.country].filter(Boolean).join(", ") || "—",
        contact: tm.email || "—",
      };
      const product: any = {
        commodity: "Introduction, representation and onboarding of prospective counterparties on behalf of Bullfrog Group / Bullex Trading Platform",
        governingLaw: "United Arab Emirates",
        recapValidity: "Courts of Dubai, UAE",
        validity: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
      };

      const title = `NCNDA — ${tm.name}`;
      const content = generateDocumentContent("NCNDA", undefined, partyB, partyA, product);
      // Team-prepared NCNDA/ICA agreements always require admin approval before
      // the team member can sign or send them (pending_review → admin approves
      // → draft → sign & send from the team portal).
      const created = await storage.createDocument({
        docType: "NCNDA",
        title,
        content,
        status: "pending_review",
        adminChecks: buildAdminChecks("NCNDA"),
        buyerEmail: tm.email || null,
        sellerEmail: null,
        agentCode: participantId,
        submittedByTeamMemberId: callerTmId,
      } as any);
      if (callerTmId) notifyAgentDocPendingReview(created, callerTmId);
      try {
        const docxPath = await generateDocx(created.id, title, content, "Bullex Admin", participantId || undefined, undefined, created.docType);
        const pdfPath = await generatePdf(created.id, title, content, "Bullex Admin", participantId || undefined, undefined, created.docType);
        await storage.updateDocument(created.id, { docxPath, pdfPath });
      } catch (fileErr: any) {
        console.error("[tm-ncnda] file generation failed:", fileErr?.message || fileErr);
      }
      const fresh = await storage.getDocumentById(created.id);
      res.json(fresh || created);
    } catch (err: any) {
      console.error("[tm-ncnda] generation failed:", err);
      res.status(500).json({ message: err.message || "Failed to generate NCNDA" });
    }
  });

  // Generate ICA against a registered team member (by team_members.id).
  // Principal = Bullfrog Group; Agent = the team member.
  app.post("/api/team-members/:id/generate-ica", requireModule("team-network"), async (req, res) => {
    try {
      const tm = await storage.getTeamMemberById(req.params.id);
      if (!tm) return res.status(404).json({ message: "Team member not found" });
      // A team member may only generate for a member they personally added; admin
      // may generate for anyone. Owner-scope the doc so it lands in their vault.
      const callerTmId = req.session?.role === "team" ? await getSessionTeamMemberId(req) : null;
      if (!canGenerateAgentDocForMember({ role: req.session?.role, callerTeamMemberId: callerTmId, targetInvitedByTeamMemberId: tm.invitedByTeamMemberId })) {
        return res.status(403).json({ message: "You can only generate agreements for team members you added" });
      }
      const participantId = tm.participantId || null;
      if (!participantId) {
        return res.status(400).json({ message: "Team member has no participant ID allocated; cannot generate ICA without an agent code" });
      }

      const agentLabel = req.body?.agentLabel || "Agent";
      const agencyType = req.body?.agencyType || "Non-Exclusive";

      const principal: any = { name: "Bullfrog Group", address: "Dubai, United Arab Emirates", contact: "docs@bullfrog-group.com" };
      const agent: any = {
        name: tm.name,
        address: [tm.homeAddress, tm.city, tm.country].filter(Boolean).join(", ") || "—",
        contact: tm.email || "—",
      };
      const product: any = {
        effectiveDate: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
        agentLabel,
        agencyType,
        principalCountry: "United Arab Emirates",
        principalEntityType: "Group Holding",
        agentCountry: tm.country || undefined,
        agentEntityType: tm.employmentType || "Individual",
        agentRepresentative: tm.name,
        agentDesignation: tm.position || undefined,
        agentBankName: tm.bankName || undefined,
        agentBankAddress: tm.bankBranch || undefined,
        agentAccountName: tm.payrollAccountName || undefined,
        agentAccountNumber: tm.payrollAccountNumber || undefined,
        agentSwift: tm.payrollSwift || undefined,
        commodity: "Introduction, representation and onboarding of prospective counterparties on behalf of Bullfrog Group / Bullex Trading Platform",
        governingLaw: "United Arab Emirates",
        seatOfArbitration: "Dubai, UAE",
        venueOfArbitration: "Dubai International Arbitration Centre (DIAC)",
        numArbitrators: "One",
        termYears: "3",
        recordKeepingYears: "7",
        amlOption: "Standard Commercial Compliance",
        commissionStructure: req.body?.commissionStructure || undefined,
        commissionBasis: req.body?.commissionBasis || undefined,
      };

      const title = `ICA — ${tm.name}`;
      const content = generateDocumentContent("ICA", undefined, principal, agent, product);
      // Team-prepared agreements always require admin approval before send.
      const created = await storage.createDocument({
        docType: "ICA",
        title,
        content,
        status: "pending_review",
        adminChecks: buildAdminChecks("ICA"),
        buyerEmail: null,
        sellerEmail: tm.email || null,
        agentCode: participantId,
        submittedByTeamMemberId: callerTmId,
      } as any);
      if (callerTmId) notifyAgentDocPendingReview(created, callerTmId);
      try {
        const docxPath = await generateDocx(created.id, title, content, "Bullex Admin", participantId, undefined, created.docType);
        const pdfPath = await generatePdf(created.id, title, content, "Bullex Admin", participantId, undefined, created.docType);
        await storage.updateDocument(created.id, { docxPath, pdfPath });
      } catch (fileErr: any) {
        console.error("[tm-ica] file generation failed:", fileErr?.message || fileErr);
      }
      const fresh = await storage.getDocumentById(created.id);
      res.json(fresh || created);
    } catch (err: any) {
      console.error("[tm-ica] generation failed:", err);
      res.status(500).json({ message: err.message || "Failed to generate ICA" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ authenticated: false });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (req.session && req.session.authenticated) {
      let allowedModules = req.session.allowedModules ?? null;
      // For team members, return their CURRENT modules so the UI reflects any
      // access an admin granted after they logged in (no re-login required).
      if (req.session.role === "team") {
        try {
          const tm = await storage.getTeamMemberByUsername(req.session.username ?? "");
          if (tm && !tm.terminatedAt) {
            const fresh = tm.allowedModules ?? [];
            if (JSON.stringify(fresh) !== JSON.stringify(req.session.allowedModules ?? null)) {
              req.session.allowedModules = fresh;
            }
            allowedModules = fresh;
          } else {
            req.session.destroy(() => {});
            return res.status(401).json({ authenticated: false, message: "Unauthorized" });
          }
        } catch {
          return res.status(503).json({ authenticated: false, message: "Unable to validate team access" });
        }
      }
      return res.json({
        authenticated: true,
        username: req.session.username,
        role: req.session.role || "admin",
        allowedModules,
      });
    }
    res.json({ authenticated: false });
  });

  // ---- Admin Amend Mode (sudo-style re-auth gate) -------------------------
  app.post("/api/admin/amend-unlock", loginLimiter, requireAdminAuth, async (req, res) => {
    const { password } = req.body ?? {};
    const adminPass = process.env.ADMIN_PASSWORD;
    if (!adminPass) return res.status(500).json({ message: "Admin credentials not configured" });
    if (!password || password !== adminPass) {
      return res.status(401).json({ message: "Incorrect admin password." });
    }
    const until = Date.now() + AMEND_UNLOCK_DURATION_MS;
    req.session.amendUnlockUntil = until;
    req.session.save(() => res.json({ unlocked: true, until }));
  });

  app.post("/api/admin/amend-lock", requireAdminAuth, (req, res) => {
    req.session.amendUnlockUntil = undefined;
    req.session.save(() => res.json({ unlocked: false }));
  });

  app.get("/api/admin/amend-status", (req, res) => {
    const until = req.session?.amendUnlockUntil;
    const unlocked = !!until && until > Date.now() && req.session?.role === "admin";
    res.json({ unlocked, until: unlocked ? until : null });
  });

  // ---- Amend endpoints (admin + unlocked) ---------------------------------
  app.patch("/api/kyc/:id/amend", requireAdminAuth, requireAmendUnlock, async (req, res) => {
    try {
      const existing = await storage.getKycApplicationById(req.params.id);
      if (!existing) return res.status(404).json({ message: "KYC application not found" });
      const result = sanitizeKycAdminAmendFields(req.body, existing);
      if (!result.ok) return res.status(400).json({ message: result.message });
      const fields = result.fields;

      if (fields.clientUsername) {
        const usernameOwner = await storage.getKycByClientUsername(fields.clientUsername);
        if (usernameOwner && usernameOwner.id !== existing.id) {
          return res.status(409).json({ message: "This username is already in use by another client" });
        }
      }

      const fieldNames = Object.keys(fields).map((key) => key.replace(/([A-Z])/g, " $1").trim()).join(", ");
      const invalidateScreening = Object.keys(fields).some((key) => KYC_SCREENING_INPUT_FIELDS.has(key));
      const outcome = await approveWithBlockchainRetry(async () => {
        const result = await storage.applyDirectKycAdminAmendment(
          existing.id,
          fields,
          `Direct admin amendment by ${req.session.username || "admin"}`,
          {
            genesisHash: GENESIS_HASH,
            dataId: existing.id,
            dataSummary: `${existing.companyName} | Admin amendment: ${fieldNames}`,
            buildBlockFn: (previousHash, blockNumber) => {
              const timestampIso = new Date().toISOString();
              const amendmentHash = generateKycAmendmentHash(
                existing.companyName,
                existing.registrationNumber,
                fields,
                timestampIso,
              );
              const { hash, nonce } = mineBlock(blockNumber, previousHash, timestampIso, amendmentHash);
              return { hash, nonce, timestamp: new Date(timestampIso) };
            },
          },
          invalidateScreening,
        );
        return { result };
      });
      if (!outcome.ok) return res.status(409).json({ message: BLOCKCHAIN_ADVANCED_MESSAGE });
      const { updated, reapprovalRequired } = outcome.value.result;

      notify({
        type: "kyc_change_request",
        title: "KYC amended by admin",
        message: `${updated.companyName} — ${Object.keys(fields).length} field(s) updated${reapprovalRequired ? "; re-screening required" : ""}`,
        link: `/kyc-admin?kycId=${updated.id}`,
        severity: "warning",
        module: "kyc",
      });
      res.json({ ...sanitizeKyc(updated), reapprovalRequired });
    } catch (err: any) {
      if (err?.message?.includes("Portal username state changed")) {
        return res.status(409).json({ message: "The client account state changed; reopen the record and try again" });
      }
      if (err?.code === "23505" || err?.cause?.code === "23505") {
        return res.status(409).json({ message: "This username is already in use by another client" });
      }
      res.status(500).json({ message: err?.message || "Failed to amend KYC application" });
    }
  });

  app.post("/api/kyc/:id/password-reset-link", requireAdminAuth, requireAmendUnlock, async (req, res) => {
    try {
      const kyc = await storage.getKycApplicationById(req.params.id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      if (kyc.status !== "approved" || !kyc.clientUsername) {
        return res.status(400).json({ message: "Password reset is available only for approved client accounts with an allocated username" });
      }
      const recipient = kyc.contactEmail || kyc.signatoryEmail || kyc.filledByEmail;
      if (!recipient) return res.status(400).json({ message: "This KYC record has no email address for password reset delivery" });

      const expiryHours = 1;
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
      await storage.invalidateActiveClientPasswordSetupTokens(kyc.id);
      await storage.createClientPasswordSetupToken(kyc.id, token, expiresAt);
      const resetUrl = `${getTrustedPublicOrigin(req)}/client-setup/${token}`;
      const sent = await sendClientPasswordResetLinkEmail(
        recipient,
        kyc.contactName || kyc.signatoryName || "Client",
        kyc.clientUsername,
        resetUrl,
        expiryHours,
      );
      if (!sent) return res.status(502).json({ message: "Password reset email could not be sent" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to send password reset link" });
    }
  });

  // Direct admin amendment of an enquiry (password-unlocked amend mode).
  // Explicit ALLOWLIST of commercial columns: status, side, refs, ownership,
  // client-response and linkage fields are deliberately not amendable here —
  // status changes must go through the status route (acceptance-details gate),
  // and `side` drives deal pairing so flipping it would corrupt formed deals.
  // Unknown keys are rejected outright rather than passed to db.update().
  const ENQUIRY_AMENDABLE_COLUMNS = new Set([
    "product", "specifications", "producer", "quantity", "unit", "packing",
    "price", "currency", "incoterms", "paymentTerms", "deliveryPeriod", "validity",
    "origin", "loadingPort", "dischargePort",
    "buyerName", "buyerAddress", "buyerContact", "coBuyerName", "coBuyerAddress", "coBuyerContact",
    "sellerName", "sellerAddress", "sellerContact", "coSellerName", "coSellerAddress", "coSellerContact",
    "refPerson", "contractConfirmation", "docsForPayment", "otherTerms", "compliance",
    "performanceBond", "additionalInfo", "createdBy", "email",
  ]);

  app.patch("/api/trade-enquiries/:id/amend", requireAdminAuth, requireAmendUnlock, async (req, res) => {
    try {
      const existing = await storage.getTradeEnquiryById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Enquiry not found" });
      const fields: Record<string, any> = {};
      for (const [key, value] of Object.entries(req.body ?? {})) {
        if (!ENQUIRY_AMENDABLE_COLUMNS.has(key)) {
          return res.status(400).json({ message: `Field "${key}" cannot be amended` });
        }
        if (value !== null && typeof value !== "string") {
          return res.status(400).json({ message: `Field "${key}" must be text` });
        }
        fields[key] = value;
      }
      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ message: "No editable fields supplied" });
      }
      if ("product" in fields && !(typeof fields.product === "string" && fields.product.trim())) {
        return res.status(400).json({ message: "Product cannot be blank" });
      }
      // An accepted enquiry must stay complete: validate the merged record so a
      // direct amendment can't blank details the acceptance gate required
      // (which would corrupt TFR rebuilds falling back to enquiry values).
      if (isEnquiryStatusAccepted(existing.status)) {
        const missing = missingEnquiryAcceptanceDetails({ ...existing, ...fields });
        if (missing.length) {
          return res.status(400).json({ message: `Accepted enquiries must keep their key details — missing after this change: ${missing.join(", ")}` });
        }
      }
      const updated = await storage.updateTradeEnquiryFields(req.params.id, fields);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to amend enquiry" });
    }
  });

  const TEAM_AMEND_LOCKED_FIELDS = new Set([
    "id", "username", "password", "createdAt", "participantId", "terminatedAt", "terminationReason", "terminatedBy",
  ]);

  app.patch("/api/team/members/:id/amend", requireAdminAuth, requireAmendUnlock, async (req, res) => {
    try {
      const fields: Record<string, any> = {};
      for (const [key, value] of Object.entries(req.body ?? {})) {
        if (TEAM_AMEND_LOCKED_FIELDS.has(key)) continue;
        fields[key] = value;
      }
      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ message: "No editable fields supplied" });
      }
      const updated = await storage.updateTeamMember(req.params.id, fields);
      res.json({ ...updated, password: undefined });
      notify({
        type: "team",
        title: `Team member amended — ${updated?.name || "member"}`,
        message: `Amended fields: ${Object.keys(fields).join(", ")}`,
        link: "/team",
        severity: "warning",
        module: "team-members",
      });
    } catch (err: any) {
      if (err?.message?.includes("unique")) {
        return res.status(409).json({ message: "Username already exists" });
      }
      res.status(500).json({ message: err?.message || "Failed to amend team member" });
    }
  });

  const REGISTRATION_AMEND_ALLOWED = new Set([
    "fullName", "companyName", "email", "phone", "country", "roleType",
    "commodities", "message", "reviewNotes",
  ]);

  app.patch("/api/registrations/:id/amend", requireAdminAuth, requireAmendUnlock, async (req, res) => {
    try {
      const fields: Record<string, any> = {};
      for (const [key, value] of Object.entries(req.body ?? {})) {
        if (!REGISTRATION_AMEND_ALLOWED.has(key)) continue;
        fields[key] = value;
      }
      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ message: "No editable fields supplied" });
      }
      const updated = await storage.updateRegistrationFields(req.params.id, fields);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to amend registration" });
    }
  });

  // Public: verify a client password setup token (no auth)
  app.get("/api/client/setup/:token", async (req, res) => {
    try {
      const row = await storage.getClientPasswordSetupTokenByToken(req.params.token);
      if (!row) return res.status(404).json({ message: "Invalid setup link." });
      if (row.usedAt) return res.status(410).json({ message: "This setup link has already been used." });
      if (new Date(row.expiresAt).getTime() < Date.now()) return res.status(410).json({ message: "This setup link has expired." });
      const kyc = await storage.getKycApplicationById(row.kycId);
      if (!kyc || kyc.status !== "approved") return res.status(404).json({ message: "Associated account not found." });
      res.json({ valid: true, username: kyc.clientUsername, companyName: kyc.companyName, expiresAt: row.expiresAt });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Public: consume a client setup token and set the initial password
  app.post("/api/client/setup/:token", async (req, res) => {
    try {
      const { password } = req.body || {};
      if (!password || typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }
      const hashedPassword = await bcrypt.hash(password, 12);
      const updated = await storage.consumeClientPasswordSetupToken(req.params.token, hashedPassword);
      if (!updated) return res.status(410).json({ message: "This setup link is invalid, expired, or has already been used." });
      res.json({ success: true, username: updated.clientUsername });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/client/login", loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    try {
      const kyc = await storage.getKycByClientUsername(username);
      const passwordValid = kyc?.clientPassword ? await bcrypt.compare(password, kyc.clientPassword) : false;
      if (!kyc || !passwordValid || kyc.status !== "approved") {
        return res.status(401).json({ message: "Invalid credentials or account not active" });
      }
      req.session.regenerate(() => {
        req.session.authenticated = true;
        req.session.username = username;
        req.session.role = "client";
        req.session.clientKycId = kyc.id;
        req.session.clientCompanyName = kyc.companyName;
        req.session.save(() => {
          return res.json({ authenticated: true, username, role: "client", companyName: kyc.companyName, kycId: kyc.id });
        });
      });
    } catch (error) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/client/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ authenticated: false });
    });
  });

  app.get("/api/client/me", (req, res) => {
    if (req.session && req.session.authenticated && req.session.role === "client") {
      return res.json({
        authenticated: true,
        username: req.session.username,
        role: "client",
        kycId: req.session.clientKycId,
        companyName: req.session.clientCompanyName,
      });
    }
    res.json({ authenticated: false });
  });

  app.get("/api/client/kyc", requireClientAuth, async (req, res) => {
    try {
      const kyc = await storage.getKycApplicationById(req.session.clientKycId!);
      if (!kyc) return res.status(404).json({ message: "KYC record not found" });
      const { clientPassword, ...safeKyc } = kyc;
      res.json(safeKyc);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KYC data" });
    }
  });

  app.get("/api/client/trades", requireClientAuth, async (req, res) => {
    try {
      const clientKycId = req.session.clientKycId!;
      const allTrades = await storage.getTrades();
      const clientTrades = allTrades.filter(
        (t) => t.buyerKycId === clientKycId || t.sellerKycId === clientKycId
      );
      res.json(clientTrades);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trades" });
    }
  });

  app.get("/api/client/trades/:id/documents", requireClientAuth, async (req, res) => {
    try {
      const clientKycId = req.session.clientKycId!;
      const trade = await storage.getTradeById(req.params.id);
      if (!trade) return res.status(404).json({ message: "Trade not found" });
      if (trade.buyerKycId !== clientKycId && trade.sellerKycId !== clientKycId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const docs = await storage.getTradeDocuments(trade.id);
      res.json(docs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trade documents" });
    }
  });

  app.get("/api/client/trade-documents/:id/download", requireClientAuth, async (req, res) => {
    try {
      const clientKycId = req.session.clientKycId!;
      const doc = await storage.getTradeDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const trade = await storage.getTradeById(doc.tradeId);
      if (!trade || (trade.buyerKycId !== clientKycId && trade.sellerKycId !== clientKycId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      // Derive safe content type from the stored filename extension — never trust
      // the client-supplied MIME type stored in the database.
      const safeClientType = safeContentTypeFromFilename(doc.storedName);
      await streamObject(TRADE_CAT, doc.storedName, res, { downloadName: doc.originalName, contentType: safeClientType });
    } catch (error) {
      res.status(500).json({ message: "Failed to download document" });
    }
  });

  app.post("/api/client/enquiries/:id/respond", requireClientAuth, async (req, res) => {
    try {
      const { response } = req.body;
      if (!["accepted", "rejected"].includes(response)) {
        return res.status(400).json({ message: "Response must be 'accepted' or 'rejected'" });
      }
      const enquiry = await storage.getTradeEnquiryById(req.params.id);
      if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });

      // Verify this enquiry is explicitly assigned to the calling client.
      if ((enquiry as any).assignedToClientId !== req.session.clientKycId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Prevent overwriting an existing response (one-time constraint).
      if (enquiry.clientResponse) {
        return res.status(409).json({ message: "This enquiry has already been responded to" });
      }

      const companyName = req.session.clientCompanyName!;
      const updated = await storage.updateTradeEnquiryClientResponse(
        req.params.id,
        response,
        companyName
      );

      // If updated is undefined, a concurrent request raced ahead and already
      // recorded a response (the conditional WHERE caught it).
      if (!updated) {
        return res.status(409).json({ message: "This enquiry has already been responded to" });
      }

      // NOTE: Accepting an enquiry no longer forms a trade. Trades are only
      // created in the Deal Desk after a TFR is approved (see runDealCascade /
      // POST /api/deals/:id/approve-tfr). This endpoint only records the
      // client's response and status.

      sendEnquiryClientResponseNotification(enquiry, response, companyName).catch(() => {});
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to submit response" });
    }
  });

  app.get("/api/client/enquiries", requireClientAuth, async (req, res) => {
    try {
      const clientKycId = req.session.clientKycId!;
      const allEnquiries = await storage.getTradeEnquiries();
      // Return enquiries either assigned to this client account (for them to
      // respond to) or issued by this client themselves.
      const visible = allEnquiries.filter(
        (e) =>
          (e as any).assignedToClientId === clientKycId ||
          (e as any).submittedByClientId === clientKycId
      );
      res.json(visible);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch enquiries" });
    }
  });

  // Registered clients can issue their own Buy or Sell enquiry. The client is
  // always one defined party: the buyer on a "buy" enquiry, the seller on a
  // "sell" enquiry. The counterparty is left open for Bullex to source/match.
  app.post("/api/client/enquiries", requireClientAuth, publicFormLimiterModerate, async (req, res) => {
    try {
      const b = req.body || {};
      if (typeof b.product !== "string" || !b.product.trim()) {
        return res.status(400).json({ message: "Commodity is required" });
      }
      const str = (v: any) => (typeof v === "string" && v.trim()) ? v.trim() : null;
      const side = b.side === "sell" ? "sell" : "buy";

      const clientKycId = req.session.clientKycId!;
      const companyName = req.session.clientCompanyName!;
      const kyc = await storage.getKycApplicationById(clientKycId);
      const clientAddress = kyc?.registeredAddress || null;
      const clientContact = [kyc?.contactName, kyc?.contactEmail].filter(Boolean).join(" — ") || null;
      const clientEmail = kyc?.contactEmail || null;

      // The client is the defined party for their own side; the opposite party
      // is intentionally left blank. An optional co-party (joint company) may
      // be declared for the client's own side only.
      const partyFields = side === "buy"
        ? {
            buyerName: companyName, buyerAddress: clientAddress, buyerContact: clientContact,
            coBuyerName: str(b.coPartyName), coBuyerAddress: str(b.coPartyAddress), coBuyerContact: str(b.coPartyContact),
          }
        : {
            sellerName: companyName, sellerAddress: clientAddress, sellerContact: clientContact,
            coSellerName: str(b.coPartyName), coSellerAddress: str(b.coPartyAddress), coSellerContact: str(b.coPartyContact),
          };

      const enquiry = await storage.createTradeEnquiry({
        product: b.product.trim(),
        side,
        specifications: str(b.specifications),
        quantity: str(b.quantity),
        unit: str(b.unit) || "MT",
        packing: str(b.packing),
        loadingPort: str(b.loadingPort),
        dischargePort: str(b.dischargePort),
        incoterms: str(b.incoterms),
        deliveryPeriod: str(b.deliveryPeriod),
        validity: str(b.validity),
        price: str(b.price),
        currency: str(b.currency) || "USD",
        additionalInfo: str(b.additionalInfo),
        createdBy: companyName,
        email: clientEmail,
        submittedByClientId: clientKycId,
        ...partyFields,
      });

      sendEnquiryCreatedNotification(enquiry).catch(() => {});
      notify({
        type: "enquiry",
        title: `New ${side.toUpperCase()} enquiry from ${companyName}`,
        message: `${enquiry.enquiryRef} — ${enquiry.product}`,
        module: "enquiries",
      });
      res.status(201).json(enquiry);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create enquiry" });
    }
  });

  app.get("/api/client/documents", requireClientAuth, async (req, res) => {
    try {
      const kycId = req.session.clientKycId!;
      const clientDocs = await storage.getSentDocumentsForClient(kycId);
      res.json(clientDocs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.post("/api/client/documents/:id/respond", requireClientAuth, async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });

      const kycId = req.session.clientKycId!;
      if (doc.sentToClientId !== kycId) {
        return res.status(403).json({ message: "This document was not sent to you" });
      }
      if (doc.status !== "sent" || doc.recipientResponse !== "pending") {
        return res.status(400).json({ message: "Document is not awaiting your response" });
      }

      const { response, amendmentNotes } = req.body;
      if (!["accepted", "rejected"].includes(response)) {
        return res.status(400).json({ message: "Response must be 'accepted' or 'rejected'" });
      }

      const updateData: { recipientResponse: string; status: string; recipientRespondedAt: Date; recipientAmendmentNotes?: string } = {
        recipientResponse: response,
        recipientRespondedAt: new Date(),
        status: response === "accepted" ? "accepted" : "rejected",
      };
      if (response === "rejected" && amendmentNotes) {
        updateData.recipientAmendmentNotes = amendmentNotes;
      }
      const updated = await storage.respondToDocumentOnce(doc.id, updateData, doc.content);
      if (!updated) {
        return res.status(409).json({ message: "Document has already been responded to" });
      }

      if (response === "rejected" && amendmentNotes) {
        const clientCompanyName = req.session.clientCompanyName || "Client";
        const notifyEmails = [doc.buyerEmail, doc.sellerEmail, "trade@bullfrog-group.com"].filter(Boolean) as string[];
        const uniqueEmails = [...new Set(notifyEmails)];
        for (const email of uniqueEmails) {
          sendAmendmentRequestedEmail(email, "Trade Desk", doc.docType, doc.title, amendmentNotes, clientCompanyName)
            .catch(err => console.error("[docs] Failed to send amendment email to", email, err));
        }
      }

      // Client accepted a deal's TFR: the transaction still needs admin
      // approval to reach the Deal Desk — flag it so admins act on it.
      if (response === "accepted" && String(doc.docType).toUpperCase() === "TFR") {
        try {
          const deals = await storage.getDeals();
          const deal = deals.find((d) => d.tfrDocId === doc.id && !d.tradeRef && d.stage === "tfr_pending");
          if (deal) {
            notify({
              type: "tfr_ready_for_approval",
              title: "TFR client-accepted — approval needed",
              message: `${doc.title} was accepted by the client. Approve the TFR in the Deal Pipeline to form the trade on the Deal Desk.`,
              link: "/deal-pipeline",
              severity: "warning",
              module: "documents",
            });
          }
        } catch (err) {
          console.error("[deals] Failed to flag client-accepted TFR for approval:", err);
        }
      }

      notify({
        type: response === "accepted" ? "document_accepted" : "document_rejected",
        title: response === "accepted" ? `${doc.docType} accepted by client` : `${doc.docType} amendment requested`,
        message: response === "accepted"
          ? `${req.session.clientCompanyName || "Client"} accepted ${doc.title}`
          : `${req.session.clientCompanyName || "Client"} requested changes to ${doc.title}`,
        link: "/documents",
        severity: response === "accepted" ? "success" : "warning",
        module: "documents",
      });

      res.json(updated);
    } catch (error) {
      res.status(error instanceof LpgStsReviewError ? 409 : 500).json({
        message: error instanceof LpgStsReviewError ? error.message : "Failed to respond to document",
      });
    }
  });

  // Documents the client generated themselves (awaiting / under trade-desk review).
  app.get("/api/client/generated-documents", requireClientAuth, async (req, res) => {
    try {
      const kycId = req.session.clientKycId!;
      const mine = await storage.getGeneratedDocumentsForClient(kycId);
      res.json(mine);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.get("/api/client/documents/:id/download", requireClientAuth, async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });

      const kycId = req.session.clientKycId!;
      // A client may download documents sent to them OR documents they generated.
      if (doc.sentToClientId !== kycId && (doc as any).submittedByClientId !== kycId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!doc.content) return res.status(404).json({ message: "No file available" });

      // Regenerate the PDF from DB content on demand (mirrors the admin download
      // routes). The on-disk cache is not persistent — the production filesystem
      // is ephemeral and the cache is intentionally not shipped in the deployment
      // image — so we never rely on a pre-existing file.
      const submittedByLabel = await getDocSubmittedByLabel(doc.submittedByTeamMemberId);
      const hasSig = hasDocumentSignature(doc);
      let pdfPath: string;
      if (hasSig) {
        const result = await regenerateWithSignatures(
          doc.id, doc.title, doc.content,
          doc.buyerSignature || undefined, doc.sellerSignature || undefined,
          doc.buyerSignedName || undefined, doc.sellerSignedName || undefined,
          doc.buyerSignedAt ? new Date(doc.buyerSignedAt) : undefined,
          doc.sellerSignedAt ? new Date(doc.sellerSignedAt) : undefined,
          doc.docType,
          submittedByLabel,
          doc.buyerSignedIp || undefined,
          doc.sellerSignedIp || undefined,
          (doc as any).agentCode || undefined,
          (doc as any).teamMemberCode || undefined,
        );
        pdfPath = result.pdfPath;
      } else {
        pdfPath = await generatePdf(doc.id, doc.title, doc.content, submittedByLabel, (doc as any).agentCode || undefined, (doc as any).teamMemberCode || undefined, doc.docType);
      }
      const fullPath = getDocFilePath(pdfPath);
      if (!fullPath) return res.status(500).json({ message: "Failed to generate document" });

      const safeName = doc.title.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.download(fullPath, `${doc.docType}_${safeName}.pdf`);
    } catch (error) {
      res.status(500).json({ message: "Failed to download document" });
    }
  });

  if (options.seedOnStart !== false) {
    seedDatabase().catch((err) => console.error("Seed error:", err));
  }

  function sanitizeKyc(kyc: any) {
    const { clientPassword, ...safe } = kyc;
    return safe;
  }

  app.get("/api/kyc", requireAuth, async (req, res) => {
    try {
      let result;
      if (req.session!.role === "admin" || await callerHasModule(req, "kyc-admin")) {
        // Admins and team members allocated the KYC & Compliance module see every
        // KYC application; other team members see only the ones they submitted.
        result = await storage.getKycApplications();
      } else {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId) return res.status(403).json({ message: "Team-member only" });
        result = await storage.getKycApplicationsByTeamMemberId(tmId);
      }
      res.json(result.map(sanitizeKyc));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KYC applications" });
    }
  });

  // Approved KYC clients, available to admins and team members with a documents
  // module, for selecting the portal recipient when sending a document (NCNDA,
  // ICA, etc.). Exposes only the minimal fields needed by the send dialog —
  // never the full KYC record. Actual routing is still validated server-side at
  // POST /api/documents/:id/send (party email match + approved status).
  app.get("/api/clients/approved", requireModule(DOC_MODULES), async (_req, res) => {
    try {
      const all = await storage.getKycApplications();
      const clients = sortClientDetails(all
        .filter((k: any) => k.status === "approved")
        .map((k: any) => ({
          id: k.id,
          companyName: k.companyName,
          contactName: k.contactName,
          contactEmail: k.contactEmail,
          signatoryEmail: k.signatoryEmail,
        })));
      res.json(clients);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch approved clients" });
    }
  });

  // Approved participants, available to admins and team members with the "enquiries"
  // module (same gating as the enquiry routes), for populating buyer/seller details on
  // trade enquiries. Only exposes the minimal counterparty fields needed for auto-fill —
  // not the full KYC record.
  app.get("/api/participants", requireModule("enquiries"), async (req, res) => {
    try {
      const all = await storage.getKycApplications();
      const participants = sortClientDetails(all
        .filter((k: any) => k.status === "approved")
        .map((k: any) => ({
          id: k.id,
          companyName: k.companyName,
          registeredAddress: k.registeredAddress,
          primaryBusinessAddress: k.primaryBusinessAddress,
          contactName: k.contactName,
          contactPhone: k.contactPhone,
          contactEmail: k.contactEmail,
          category: k.category,
          products: k.products,
        })));
      res.json(participants);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch participants" });
    }
  });

  async function runSanctionsScreening(kycId: string, checkedBy: string) {
    const kyc = await storage.getKycApplicationById(kycId);
    if (!kyc) return null;

    const queries: { label: string; name: string; schema: string }[] = [];
    if (kyc.companyName) queries.push({ label: "Company", name: kyc.companyName, schema: "Company" });
    if (kyc.signatoryName) queries.push({ label: "Authorized Signatory", name: kyc.signatoryName, schema: "Person" });
    if (kyc.contactName && kyc.contactName !== kyc.signatoryName) {
      queries.push({ label: "Primary Contact", name: kyc.contactName, schema: "Person" });
    }

    const allMatches: any[] = [];
    let successfulQueries = 0;
    const apiKey = process.env.OPENSANCTIONS_API_KEY;
    const authHeaders: Record<string, string> = apiKey ? { Authorization: `ApiKey ${apiKey}` } : {};
    for (const q of queries) {
      try {
        const url = `https://api.opensanctions.org/match/default`;
        const body = { queries: { q1: { schema: q.schema, properties: { name: [q.name] } } } };
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const searchUrl = `https://api.opensanctions.org/search/default?q=${encodeURIComponent(q.name)}&limit=5`;
          const sresp = await fetch(searchUrl, { headers: authHeaders });
          if (!sresp.ok) {
            console.error(`[aml] both match and search endpoints failed for "${q.name}" (match ${resp.status}, search ${sresp.status})`);
            continue;
          }
          const sdata: any = await sresp.json();
          for (const r of sdata.results || []) {
            allMatches.push({
              queryLabel: q.label, queryName: q.name,
              matchedName: r.caption, schema: r.schema,
              score: r.score ?? null, datasets: r.datasets || [],
              topics: r.properties?.topics || [], countries: r.properties?.country || [],
              sourceUrl: `https://www.opensanctions.org/entities/${r.id}/`,
            });
          }
          successfulQueries++;
          continue;
        }
        const data: any = await resp.json();
        const results = data?.responses?.q1?.results || [];
        for (const r of results) {
          allMatches.push({
            queryLabel: q.label, queryName: q.name,
            matchedName: r.caption, schema: r.schema,
            score: r.score ?? null, match: r.match ?? false, datasets: r.datasets || [],
            topics: r.properties?.topics || [], countries: r.properties?.country || [],
            sourceUrl: `https://www.opensanctions.org/entities/${r.id}/`,
          });
        }
        successfulQueries++;
      } catch (err: any) {
        console.error(`[aml] screening failed for "${q.name}":`, err.message);
      }
    }

    // Fail-closed: if no queries succeeded, do NOT mark as clear. Persist an error state
    // so the approval gate remains locked until a real screening run completes.
    if (successfulQueries === 0) {
      const reason = apiKey
        ? "Screening provider unreachable — no queries completed successfully."
        : "Screening provider not connected — set OPENSANCTIONS_API_KEY to enable OFAC / UN / PEP screening.";
      const errored = await storage.updateKycAmlScreening(kycId, {
        amlStatus: "not_run",
        amlMatches: [],
        amlCheckedBy: checkedBy,
        amlNotes: reason,
        ofacStatus: "not_run", ofacMatches: [],
        unSanctionsStatus: "not_run", unSanctionsMatches: [],
        pepStatus: "not_run", pepMatches: [],
      });
      return {
        kyc: errored,
        amlStatus: "not_run",
        ofacStatus: "not_run",
        unSanctionsStatus: "not_run",
        pepStatus: "not_run",
        matchCount: 0,
        positiveCount: 0,
      };
    }

    const classifyMatch = (m: any) => {
      const ds: string[] = (m.datasets || []).map((d: string) => String(d).toLowerCase());
      const topics: string[] = (m.topics || []).map((t: string) => String(t).toLowerCase());
      return {
        ofac: ds.some(d => d.includes("us_ofac")),
        un: ds.some(d => d.includes("un_sc")),
        pep: topics.some(t => t.includes("role.pep") || t === "pep") || ds.some(d => /(^|_)peps?(_|$)/.test(d) || d.includes("pep")),
      };
    };
    const isPositive = (m: any) => m.match === true || (m.score != null && m.score >= 0.7);

    const ofacMatches = allMatches.filter(m => classifyMatch(m).ofac);
    const unMatches = allMatches.filter(m => classifyMatch(m).un);
    const pepMatches = allMatches.filter(m => classifyMatch(m).pep);
    const positives = allMatches.filter(isPositive);

    const ofacStatus = ofacMatches.some(isPositive) ? "hit" : "clear";
    const unSanctionsStatus = unMatches.some(isPositive) ? "hit" : "clear";
    const pepStatus = pepMatches.some(isPositive) ? "hit" : "clear";
    const amlStatus = positives.length > 0 ? "flagged" : "clear";

    const updated = await storage.updateKycAmlScreening(kycId, {
      amlStatus,
      amlMatches: allMatches,
      amlCheckedBy: checkedBy,
      ofacStatus, ofacMatches,
      unSanctionsStatus, unSanctionsMatches: unMatches,
      pepStatus, pepMatches,
    });

    if (amlStatus === "flagged") {
      const hits: string[] = [];
      if (ofacStatus === "hit") hits.push("OFAC");
      if (unSanctionsStatus === "hit") hits.push("UN Sanctions");
      if (pepStatus === "hit") hits.push("PEP");
      notify({
        type: "aml_flagged",
        title: "Sanctions / PEP screening flagged",
        message: `${kyc.companyName} — ${positives.length} positive match(es)${hits.length ? ` (${hits.join(", ")})` : ""}`,
        link: "/kyc-admin",
        severity: "alert",
        module: "kyc",
      });
    }

    return {
      kyc: updated,
      amlStatus,
      ofacStatus,
      unSanctionsStatus,
      pepStatus,
      matchCount: allMatches.length,
      positiveCount: positives.length,
    };
  }

  // Auto-approve a pending KYC application when sanctions/PEP screening came back
  // fully clear. Mirrors the admin approval path: participant ID, blockchain block,
  // auto-provisioned client-portal username and a one-time password-setup link.
  // Flagged or un-screened ("not_run") applications are never touched — they stay
  // pending for manual admin review.
  async function autoApproveKycIfClear(kycId: string, baseUrl: string | null) {
    // Atomic claim: flips pending+clear -> approved in a single conditional UPDATE,
    // so concurrent screenings / re-screens can never double-run the approval side effects.
    const claimed = await storage.claimKycForAutoApproval(
      kycId,
      "Auto-approved — sanctions / PEP screening returned no matches."
    );
    if (!claimed) return;

    // Auto-provision a client portal username. client_username has a DB unique
    // constraint — collisions surface as 23505 and we retry with a suffix.
    let clientUsername = claimed.clientUsername || null;
    if (!clientUsername) {
      const emailLocal = (claimed.contactEmail || claimed.signatoryEmail || "").split("@")[0];
      const base = (emailLocal || claimed.companyName || "client")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "")
        .slice(0, 24) || "client";
      for (let attempt = 0; attempt < 10 && !clientUsername; attempt++) {
        const candidate = attempt === 0 ? base : `${base}.${Math.floor(1000 + Math.random() * 9000)}`;
        try {
          await storage.updateKycClientUsername(kycId, candidate);
          clientUsername = candidate;
        } catch (err: any) {
          if (err?.code !== "23505") throw err;
        }
      }
      if (!clientUsername) {
        // Fail closed: approved clients must have a portal identity. Roll back for manual review.
        console.error("[kyc-auto-approve] username allocation exhausted for", claimed.companyName);
        await storage.updateKycStatus(kycId, "pending", "Auto-approval failed: could not allocate a unique portal username. Please approve manually.");
        notify({
          type: "kyc_submitted",
          title: "KYC auto-approval failed",
          message: `${claimed.companyName} — portal username allocation failed; manual approval required`,
          link: "/kyc-admin",
          severity: "alert",
          module: "kyc",
        });
        return;
      }
    }

    let updated = claimed;

    try {
      updated = await storage.assignKycParticipantId(kycId);
    } catch (err: any) {
      // Participant ID is mandatory for approved clients — roll back to pending
      // so an admin can retry, and surface the failure.
      console.error("[kyc-auto-approve] participant ID allocation failed:", err.message);
      await storage.updateKycStatus(kycId, "pending", "Auto-approval failed: participant ID allocation error. Please approve manually.");
      notify({
        type: "kyc_submitted",
        title: "KYC auto-approval failed",
        message: `${claimed.companyName} — participant ID allocation failed; manual approval required`,
        link: "/kyc-admin",
        severity: "alert",
        module: "kyc",
      });
      return;
    }

    let finalResult = updated;
    try {
      finalResult = await storage.mintKycBlock(kycId, generateKycHash, mineBlock, GENESIS_HASH);
      console.log(`[blockchain] KYC block minted for ${updated.companyName}, block #${finalResult.blockNumber} (auto-approved)`);
    } catch (err: any) {
      console.error("[blockchain] KYC minting failed (auto-approve):", err.message);
    }

    // Copy the applicant's bank details into the Banking module registry.
    await syncBankAccountsFromKyc(updated);

    // One-time password-setup link so the client can activate their portal login.
    let clientPortalSetupUrl: string | null = null;
    if (clientUsername && baseUrl) {
      try {
        const { randomBytes } = await import("crypto");
        const setupToken = randomBytes(32).toString("hex");
        const setupExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000);
        await storage.invalidateActiveClientPasswordSetupTokens(kycId);
        await storage.createClientPasswordSetupToken(kycId, setupToken, setupExpiry);
        clientPortalSetupUrl = `${baseUrl}/client-setup/${setupToken}`;
      } catch (err: any) {
        console.error("[client-setup-token] generation failed (auto-approve):", err.message);
      }
    }

    const emailTo = updated.signatoryEmail || updated.contactEmail;
    if (emailTo) {
      sendKycApprovalEmail(
        emailTo,
        updated.companyName,
        updated.signatoryName || updated.contactName,
        updated.category,
        updated.products,
        clientUsername || undefined,
        clientPortalSetupUrl,
        updated.participantId
      ).catch((err) => console.error("[email] auto-approval send failed:", err));
    }
    if (updated.filledByEmail && updated.filledByEmail !== emailTo) {
      sendKycApprovalEmail(
        updated.filledByEmail,
        updated.companyName,
        updated.filledByName || "Applicant",
        updated.category,
        updated.products,
        clientUsername || undefined,
        clientPortalSetupUrl,
        updated.participantId
      ).catch((err) => console.error("[email] auto-approval send to filledBy failed:", err));
    }
    const adminEmailAuto = process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME;
    if (adminEmailAuto) {
      sendKycActionAdminCopyEmail(
        adminEmailAuto,
        "approved",
        updated.companyName,
        updated.contactName || updated.signatoryName || "Unknown",
        updated.contactEmail || updated.signatoryEmail || "",
        "Auto-approved — sanctions / PEP screening returned no matches."
      ).catch((err) => console.error("[email] admin auto-approve copy failed:", err));
    }

    notify({
      type: "kyc_submitted",
      title: "KYC auto-approved",
      message: `${updated.companyName} passed screening and was approved automatically`,
      link: "/kyc-admin",
      severity: "info",
      module: "kyc",
    });
  }

  app.post("/api/kyc/:id/aml-check", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const exists = await storage.getKycApplicationById(id);
      if (!exists) return res.status(404).json({ message: "KYC application not found" });
      const checkedBy = req.session.username || "admin";
      const result = await runSanctionsScreening(id, checkedBy);
      if (!result) return res.status(404).json({ message: "KYC application not found" });
      // A clear re-screen auto-approves a still-pending application (no admin action needed).
      if (result.amlStatus === "clear") {
        autoApproveKycIfClear(id, getTrustedPublicOrigin(req))
          .catch((err) => console.error("[kyc-auto-approve] failed after re-screen:", err?.message));
      }
      res.json({
        amlStatus: result.amlStatus,
        ofacStatus: result.ofacStatus,
        unSanctionsStatus: result.unSanctionsStatus,
        pepStatus: result.pepStatus,
        matchCount: result.matchCount,
        positiveCount: result.positiveCount,
        kyc: sanitizeKyc(result.kyc),
      });
    } catch (error: any) {
      console.error("[aml] screening error:", error);
      res.status(500).json({ message: error.message || "AML screening failed" });
    }
  });

  app.post("/api/kyc/:id/aml-override", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { notes, decision } = req.body;
      if (!["manual_clear", "blocked"].includes(decision)) {
        return res.status(400).json({ message: "Decision must be 'manual_clear' or 'blocked'" });
      }
      if (!notes || typeof notes !== "string" || notes.trim().length < 5) {
        return res.status(400).json({ message: "Override notes (min 5 chars) are required for audit trail" });
      }
      const kyc = await storage.getKycApplicationById(id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      const checkedBy = req.session.username || "admin";
      const updated = await storage.updateKycAmlScreening(id, {
        amlStatus: decision,
        amlCheckedBy: checkedBy,
        amlNotes: notes,
      });
      res.json(sanitizeKyc(updated));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "AML override failed" });
    }
  });

  app.patch("/api/kyc/:id/status", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, reviewNotes, category, products, clientUsername, clientPassword } = req.body;
      if (!status || !["approved", "rejected", "pending"].includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be: approved, rejected, or pending" });
      }
      if (reviewNotes !== undefined && (typeof reviewNotes !== "string" || reviewNotes.length > 2000)) {
        return res.status(400).json({ message: "Review notes must be a string under 2000 characters" });
      }
      const kyc = await storage.getKycApplicationById(id);
      if (!kyc) {
        return res.status(404).json({ message: "KYC application not found" });
      }
      if (kyc.status === "approved") {
        return res.status(403).json({ message: "Approved applications cannot be modified" });
      }
      if (status === "approved" && !isKycApprovalScreeningComplete(kyc.amlStatus)) {
        return res.status(400).json({ message: "AML / World-Check screening must be completed (clear or manual override) before approval." });
      }

      if (status === "approved" && clientUsername) {
        const existingUser = await storage.getKycByClientUsername(clientUsername);
        if (existingUser && existingUser.id !== id) {
          return res.status(400).json({ message: "This username is already in use by another client" });
        }
      }

      let updated = await storage.updateKycStatus(id, status, reviewNotes, category, products);

      let finalResult = updated;
      if (status === "approved") {
        if (clientUsername && clientPassword) {
          const hashedClientPassword = await bcrypt.hash(clientPassword, 12);
          await storage.updateKycClientCredentials(id, clientUsername, hashedClientPassword);
        }
        // Allocate a stable, human-readable participant ID on first approval (idempotent).
        // Fail the approval if allocation fails — clients must have a participant ID.
        try {
          updated = await storage.assignKycParticipantId(id);
          finalResult = updated;
        } catch (err: any) {
          console.error("[participant-id] KYC allocation failed:", err.message);
          return res.status(500).json({ message: "Failed to allocate participant ID; approval not finalised." });
        }

        try {
          finalResult = await storage.mintKycBlock(id, generateKycHash, mineBlock, GENESIS_HASH);
          console.log(`[blockchain] KYC block minted for ${updated.companyName}, block #${finalResult.blockNumber}`);
        } catch (err: any) {
          console.error("[blockchain] KYC minting failed:", err.message);
        }

        // Copy the applicant's bank details into the Banking module registry.
        await syncBankAccountsFromKyc(updated);

        // Generate a one-time password-setup link instead of transmitting a plaintext password by email.
        let clientPortalSetupUrl: string | null = null;
        if (clientUsername) {
          try {
            const { randomBytes } = await import("crypto");
            const setupToken = randomBytes(32).toString("hex");
            const setupExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000);
            await storage.invalidateActiveClientPasswordSetupTokens(id);
            await storage.createClientPasswordSetupToken(id, setupToken, setupExpiry);
            clientPortalSetupUrl = `${getTrustedPublicOrigin(req)}/client-setup/${setupToken}`;
          } catch (err: any) {
            console.error("[client-setup-token] generation failed:", err.message);
          }
        }

        const emailTo = updated.signatoryEmail || updated.contactEmail;
        if (emailTo) {
          sendKycApprovalEmail(
            emailTo,
            updated.companyName,
            updated.signatoryName || updated.contactName,
            category || updated.category,
            products || updated.products,
            clientUsername,
            clientPortalSetupUrl,
            updated.participantId
          ).catch((err) => console.error("[email] background approval send failed:", err));
        }
        if (updated.filledByEmail && updated.filledByEmail !== emailTo) {
          sendKycApprovalEmail(
            updated.filledByEmail,
            updated.companyName,
            updated.filledByName || "Applicant",
            category || updated.category,
            products || updated.products,
            clientUsername,
            clientPortalSetupUrl,
            updated.participantId
          ).catch((err) => console.error("[email] background approval send to filledBy failed:", err));
        }
        // Admin audit copy
        const adminEmailApprove = process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME;
        if (adminEmailApprove) {
          sendKycActionAdminCopyEmail(
            adminEmailApprove,
            "approved",
            updated.companyName,
            updated.contactName || updated.signatoryName || "Unknown",
            updated.contactEmail || updated.signatoryEmail || "",
            reviewNotes
          ).catch((err) => console.error("[email] admin approve copy failed:", err));
        }
      }

      if (status === "rejected") {
        const emailTo = updated.signatoryEmail || updated.contactEmail;
        if (emailTo) {
          sendKycRejectionEmail(
            emailTo,
            updated.companyName,
            updated.signatoryName || updated.contactName,
            reviewNotes
          ).catch((err) => console.error("[email] background rejection send failed:", err));
        }
        if (updated.filledByEmail && updated.filledByEmail !== emailTo) {
          sendKycRejectionEmail(
            updated.filledByEmail,
            updated.companyName,
            updated.filledByName || "Applicant",
            reviewNotes
          ).catch((err) => console.error("[email] background rejection send to filledBy failed:", err));
        }
        // Admin audit copy
        const adminEmailReject = process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME;
        if (adminEmailReject) {
          sendKycActionAdminCopyEmail(
            adminEmailReject,
            "rejected",
            updated.companyName,
            updated.contactName || updated.signatoryName || "Unknown",
            updated.contactEmail || updated.signatoryEmail || "",
            reviewNotes
          ).catch((err) => console.error("[email] admin reject copy failed:", err));
        }
      }

      res.json(sanitizeKyc(finalResult));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update KYC status" });
    }
  });

  // Generate an NCNDA (Mutual Non-Circumvention / Non-Disclosure Agreement) for an approved KYC application.
  // Party A (Issuer) = Bullfrog Group; Party B (Receiving Party) = the approved participant.
  // Gated to the KYC & Compliance module (where the Generate buttons live):
  // ICA/NCNDA generation embeds KYC-derived data (addresses, bank details), so
  // documents-module-only members must NOT be able to invoke it.
  app.post("/api/kyc/:id/generate-ncnda", requireModule("kyc-admin"), async (req, res) => {
    try {
      const kyc = await storage.getKycApplicationById(req.params.id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      if (kyc.status !== "approved") {
        return res.status(400).json({ message: "NCNDA can only be generated for approved KYC applications" });
      }
      // Team-generated docs are owned by the generating member (record-visibility
      // scoping + doc-approval policy: team docs start as drafts).
      const callerTmId = req.session?.role === "team" ? await getSessionTeamMemberId(req) : null;
      if (req.session?.role === "team" && !callerTmId) {
        return res.status(403).json({ message: "Team member record not found" });
      }

      const partyA: any = {
        name: "Bullfrog Group",
        address: "Dubai, United Arab Emirates",
        contact: "docs@bullfrog-group.com",
      };
      const partyB: any = {
        name: kyc.companyName,
        address: [kyc.registeredAddress, kyc.primaryBusinessAddress].filter(Boolean).join(" / ") || "—",
        contact: kyc.signatoryEmail || kyc.contactEmail || "—",
      };
      const product: any = {
        commodity: kyc.products || kyc.coreBusinessDescription || "Introduction, representation and onboarding of prospective counterparties on behalf of Bullfrog Group / Bullex Trading Platform",
        governingLaw: "United Arab Emirates",
        recapValidity: "Courts of Dubai, UAE",
        validity: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
      };

      const title = `NCNDA — ${kyc.companyName}`;
      const content = generateDocumentContent("NCNDA", undefined, partyB, partyA, product);
      // Team-prepared agreements always require admin approval before send.
      const created = await storage.createDocument({
        docType: "NCNDA",
        title,
        content,
        status: "pending_review",
        adminChecks: buildAdminChecks("NCNDA"),
        buyerEmail: kyc.signatoryEmail || kyc.contactEmail || null,
        sellerEmail: null,
        sentToClientId: kyc.id,
        agentCode: kyc.participantId || null,
        submittedByTeamMemberId: callerTmId,
      } as any);
      if (callerTmId) notifyAgentDocPendingReview(created, callerTmId);

      try {
        const docxPath = await generateDocx(created.id, title, content, "Bullex Admin", kyc.participantId || undefined, undefined, created.docType);
        const pdfPath = await generatePdf(created.id, title, content, "Bullex Admin", kyc.participantId || undefined, undefined, created.docType);
        await storage.updateDocument(created.id, { docxPath, pdfPath });
      } catch (fileErr: any) {
        console.error("[ncnda] file generation failed:", fileErr?.message || fileErr);
      }

      const fresh = await storage.getDocumentById(created.id);
      res.json(fresh || created);
    } catch (err: any) {
      console.error("[ncnda] generation failed:", err);
      res.status(500).json({ message: err.message || "Failed to generate NCNDA" });
    }
  });

  // Generate an International Commission Agreement (ICA) for an approved KYC application
  // (typically used for Agent / Broker / Facilitator participant categories).
  app.post("/api/kyc/:id/generate-ica", requireModule("kyc-admin"), async (req, res) => {
    try {
      const kyc = await storage.getKycApplicationById(req.params.id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      if (kyc.status !== "approved") {
        return res.status(400).json({ message: "ICA can only be generated for approved KYC applications" });
      }
      // Team-generated docs are owned by the generating member (record-visibility
      // scoping + doc-approval policy: team docs start as drafts).
      const callerTmId = req.session?.role === "team" ? await getSessionTeamMemberId(req) : null;
      if (req.session?.role === "team" && !callerTmId) {
        return res.status(403).json({ message: "Team member record not found" });
      }
      if (!kyc.participantId) {
        return res.status(400).json({ message: "KYC has no participant ID allocated; cannot generate ICA without an agent code" });
      }

      const agentLabel = req.body?.agentLabel || "Agent";
      const agencyType = req.body?.agencyType || "Non-Exclusive";

      const principal = {
        name: "Bullfrog Group",
        address: "Dubai, United Arab Emirates",
        contact: "docs@bullfrog-group.com",
      };
      const agent = {
        name: kyc.companyName,
        address: [kyc.registeredAddress, kyc.primaryBusinessAddress].filter(Boolean).join(" / ") || "—",
        contact: kyc.signatoryEmail || kyc.contactEmail || "—",
      };
      const product: any = {
        effectiveDate: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
        agentLabel,
        agencyType,
        principalCountry: "United Arab Emirates",
        principalEntityType: "Group Holding",
        agentCountry: kyc.countryOfOperation || undefined,
        agentEntityType: kyc.businessType || undefined,
        agentRepresentative: kyc.signatoryName || kyc.contactName || undefined,
        agentDesignation: kyc.signatoryTitle || kyc.contactTitle || undefined,
        agentBankName: kyc.bankName || undefined,
        agentBankAddress: kyc.bankAddress || undefined,
        agentAccountName: kyc.accountName || undefined,
        agentAccountNumber: kyc.accountNumber || undefined,
        agentSwift: kyc.swiftCode || undefined,
        commodity: kyc.products || kyc.coreBusinessDescription || undefined,
        governingLaw: "United Arab Emirates",
        seatOfArbitration: "Dubai, UAE",
        venueOfArbitration: "Dubai International Arbitration Centre (DIAC)",
        numArbitrators: "One",
        termYears: "3",
        recordKeepingYears: "7",
        amlOption: "Standard Commercial Compliance",
        commissionStructure: req.body?.commissionStructure || undefined,
        commissionBasis: req.body?.commissionBasis || undefined,
      };

      const title = `ICA — ${kyc.companyName}`;
      const content = generateDocumentContent("ICA", undefined, principal as any, agent as any, product);
      // Team-prepared agreements always require admin approval before send.
      const created = await storage.createDocument({
        docType: "ICA",
        title,
        content,
        status: "pending_review",
        adminChecks: buildAdminChecks("ICA"),
        buyerEmail: null,
        sellerEmail: kyc.signatoryEmail || kyc.contactEmail || null,
        sentToClientId: kyc.id,
        agentCode: kyc.participantId,
        submittedByTeamMemberId: callerTmId,
      } as any);
      if (callerTmId) notifyAgentDocPendingReview(created, callerTmId);

      try {
        const docxPath = await generateDocx(created.id, title, content, "Bullex Admin", kyc.participantId, undefined, created.docType);
        const pdfPath = await generatePdf(created.id, title, content, "Bullex Admin", kyc.participantId, undefined, created.docType);
        await storage.updateDocument(created.id, { docxPath, pdfPath });
      } catch (fileErr: any) {
        console.error("[ica] file generation failed:", fileErr?.message || fileErr);
      }

      const fresh = await storage.getDocumentById(created.id);
      res.json(fresh || created);
    } catch (err: any) {
      console.error("[ica] generation failed:", err);
      res.status(500).json({ message: err.message || "Failed to generate ICA" });
    }
  });

  app.get("/api/kyc-change-requests", requireAdminAuth, async (_req, res) => {
    try {
      const requests = await storage.getKycChangeRequests();
      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch change requests" });
    }
  });

  app.get("/api/kyc/:id/change-requests", requireAuth, async (req, res) => {
    try {
      const kyc = await storage.getKycApplicationById(req.params.id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      const access = await ensureKycAccess(req, kyc);
      if (!access.ok) return res.status(403).json({ message: access.message });
      const requests = await storage.getKycChangeRequestsByApplicationId(req.params.id);
      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch change requests" });
    }
  });

  app.post("/api/kyc/:id/change-request", requireAuth, async (req, res) => {
    try {
      const kyc = await storage.getKycApplicationById(req.params.id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      if (kyc.status !== "approved") return res.status(400).json({ message: "Change requests can only be submitted for approved applications" });
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId || kyc.submittedByTeamMemberId !== tmId) {
          return res.status(403).json({ message: "You can only amend KYC applications you submitted" });
        }
      }
      const { changedFields, reason } = req.body;
      const result = sanitizeKycChangeFields(changedFields);
      if (!result.ok) return res.status(400).json({ message: result.message });
      const sanitized = result.fields;
      const created = await storage.createKycChangeRequest({
        kycApplicationId: req.params.id,
        changedFields: sanitized,
        reason: reason || null,
      });
      notify({
        type: "kyc_change_request",
        title: "KYC change requested",
        message: `${kyc.companyName} requested changes to ${Object.keys(sanitized).length} field(s)`,
        link: "/kyc-admin",
        severity: "warning",
        module: "kyc",
      });
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create change request" });
    }
  });

  app.patch("/api/kyc-change-requests/:id/status", requireAdminAuth, async (req, res) => {
    try {
      const { status, adminNotes } = req.body;
      if (!status || !["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Status must be approved or rejected" });
      }
      if (status === "approved") {
        // Pre-compute the block (no DB writes) so the amendment + block can be
        // persisted atomically inside approveAndApplyChangeRequest's transaction.
        // Any mid-way failure rolls back fully — an amended KYC record is never
        // left without its block (and vice-versa).
        const allReqs = await storage.getKycChangeRequests();
        const pendingReq = allReqs.find((c) => c.id === req.params.id);
        if (!pendingReq) return res.status(404).json({ message: "Change request not found" });
        if (pendingReq.status !== "pending") return res.status(400).json({ message: "Change request is no longer pending" });
        const targetKyc = await storage.getKycApplicationById(pendingReq.kycApplicationId);
        if (!targetKyc) return res.status(404).json({ message: "KYC application not found" });

        const changedFields = (pendingReq.changedFields || {}) as Record<string, any>;
        const fieldNames = Object.keys(changedFields).map((k) => k.replace(/([A-Z])/g, " $1").trim()).join(", ");

        // Each attempt re-reads the live tip and re-mines, so a retry after a
        // mid-approval chain move chains onto the NEW tip.
        // The block is computed INSIDE the storage transaction, under the
        // blockchain advisory lock, so its tip read cannot race a concurrent
        // mint or a TFR revoke's tip delete. The retry wrapper is kept as a
        // defense-in-depth safety net for any legacy "blockchain advanced"
        // error path.
        const outcome = await approveWithBlockchainRetry(async () => {
          const kyc = await storage.approveAndApplyChangeRequest(
            req.params.id,
            adminNotes,
            {
              genesisHash: GENESIS_HASH,
              dataId: targetKyc.id,
              dataSummary: `${targetKyc.companyName} | Amendment: ${fieldNames}`,
              buildBlockFn: (previousHash, blockNumber) => {
                const timestampIso = new Date().toISOString();
                const amendmentHash = generateKycAmendmentHash(
                  targetKyc.companyName,
                  targetKyc.registrationNumber,
                  changedFields,
                  timestampIso
                );
                const { hash, nonce } = mineBlock(blockNumber, previousHash, timestampIso, amendmentHash);
                return { hash, nonce, timestamp: new Date(timestampIso) };
              },
            },
            Object.keys(changedFields).some((key) => KYC_SCREENING_INPUT_FIELDS.has(key)),
          );
          return { kyc };
        });
        if (!outcome.ok) {
          return res.status(409).json({ message: BLOCKCHAIN_ADVANCED_MESSAGE });
        }
        const updatedKyc = outcome.value.kyc;
        console.log(`[blockchain] KYC amendment block minted for ${updatedKyc.companyName}`);

        try {
          const emailReqs = await storage.getKycChangeRequestsByApplicationId(updatedKyc.id);
          const changeReqForEmail = emailReqs.find((cr) => cr.id === req.params.id);
          const emailTo = updatedKyc.contactEmail || updatedKyc.signatoryEmail;
          if (emailTo && changeReqForEmail) {
            await sendChangeRequestApprovedEmail(
              emailTo,
              updatedKyc.companyName,
              updatedKyc.contactName || updatedKyc.signatoryName || "Participant",
              (changeReqForEmail.changedFields || {}) as Record<string, any>,
              adminNotes
            );
          }
        } catch (err: any) {
          console.error("[email] Change request approval email failed:", err.message);
        }

        res.json({ status: "approved", kycApplication: sanitizeKyc(updatedKyc) });
      } else {
        const updated = await storage.updateKycChangeRequestStatus(req.params.id, status, adminNotes);

        try {
          const changeReqs = await storage.getKycChangeRequests();
          const changeReq = changeReqs.find((cr) => cr.id === req.params.id);
          if (changeReq) {
            const kyc = await storage.getKycApplicationById(changeReq.kycApplicationId);
            if (kyc) {
              const emailTo = kyc.contactEmail || kyc.signatoryEmail;
              if (emailTo) {
                await sendChangeRequestRejectedEmail(
                  emailTo,
                  kyc.companyName,
                  kyc.contactName || kyc.signatoryName || "Participant",
                  (changeReq.changedFields || {}) as Record<string, any>,
                  adminNotes
                );
              }
            }
          }
        } catch (err: any) {
          console.error("[email] Change request rejection email failed:", err.message);
        }

        res.json(updated);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update change request" });
    }
  });

  // ─── TEAM MEMBER SELF-VIEW ───
  async function getSessionTeamMemberId(req: Request): Promise<string | null> {
    if (!req.session?.authenticated || req.session.role !== "team" || !req.session.username) return null;
    const tm = await storage.getTeamMemberByUsername(req.session.username);
    return tm?.id ?? null;
  }

  // True if the caller is an admin, or a team member whose CURRENT (DB-resolved)
  // module allocation includes `moduleId`. Team members granted a module get the
  // same read/visibility across all records as admins for that area; approval and
  // other mutating routes stay admin-only via requireAdminAuth.
  async function callerHasModule(req: Request, moduleId: string): Promise<boolean> {
    if (req.session?.role === "admin") return true;
    if (req.session?.role !== "team" || !req.session.username) return false;
    try {
      const tm = await storage.getTeamMemberByUsername(req.session.username);
      return !!tm && (tm.allowedModules ?? []).includes(moduleId);
    } catch {
      return (req.session.allowedModules ?? []).includes(moduleId);
    }
  }

  // True if the caller holds ANY of the given modules (admin always passes).
  // Document downloads accept every module that grants document visibility
  // (documents / doc-templates / vault) — per-document ownership rules
  // (canDownloadDocument) still apply after this gate.
  async function callerHasAnyModule(req: Request, moduleIds: string[]): Promise<boolean> {
    for (const m of moduleIds) {
      if (await callerHasModule(req, m)) return true;
    }
    return false;
  }
  const DOC_READ_MODULES = [...DOC_MODULES, "vault"];

  app.get("/api/team/me/kyc", requireAuth, async (req, res) => {
    try {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.status(403).json({ message: "Team-member only" });
      const list = await storage.getKycApplicationsByTeamMemberId(tmId);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/team/me/enquiries", requireAuth, async (req, res) => {
    try {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.status(403).json({ message: "Team-member only" });
      const list = await storage.getTradeEnquiriesForTeamMember(tmId);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── POTENTIAL CLIENTS (team-member CRM) ───
  app.get("/api/team/me/potential-clients", requireAuth, async (req, res) => {
    try {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.status(403).json({ message: "Team-member only" });
      const list = await storage.getPotentialClientsByTeamMemberId(tmId);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/team/me/potential-clients", requireAuth, async (req, res) => {
    try {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.status(403).json({ message: "Team-member only" });
      const data = insertPotentialClientSchema.parse(req.body);
      const created = await storage.createPotentialClient(tmId, data);
      res.json(created);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/team/me/potential-clients/:id", requireAuth, async (req, res) => {
    try {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.status(403).json({ message: "Team-member only" });
      const existing = await storage.getPotentialClientById(req.params.id);
      if (!existing || existing.teamMemberId !== tmId) return res.status(404).json({ message: "Not found" });
      const data = insertPotentialClientSchema.partial().parse(req.body);
      const updated = await storage.updatePotentialClient(req.params.id, data);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/team/me/potential-clients/:id", requireAuth, async (req, res) => {
    try {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.status(403).json({ message: "Team-member only" });
      const existing = await storage.getPotentialClientById(req.params.id);
      if (!existing || existing.teamMemberId !== tmId) return res.status(404).json({ message: "Not found" });
      await storage.deletePotentialClient(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: see all potential clients across team
  app.get("/api/potential-clients", requireAdminAuth, async (_req: Request, res: Response) => {
    try {
      const list = await storage.getPotentialClients();
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── KYC APPLICATION PDF: download + send-to-client ───
  // `mode` controls how widely a team member's "kyc-admin" module grants access:
  //   - "read"  → allocated team members may VIEW any KYC record and its documents.
  //   - "write" → module allocation does NOT grant access; mutations/actions
  //               (link docs, upload-to-existing, send-pdf, delete) stay limited to
  //               the submitting team member or an admin. This keeps the
  //               "all access EXCEPT approvals/mutations" boundary intact.
  async function ensureKycAccess(req: Request, kyc: any, mode: "read" | "write" = "read"): Promise<{ ok: boolean; message?: string; submittedBy?: string }> {
    if (!req.session?.authenticated) return { ok: false, message: "Not authenticated" };
    if (req.session.role === "admin") {
      const sb = await getDocSubmittedByLabel(kyc.submittedByTeamMemberId);
      return { ok: true, submittedBy: sb };
    }
    if (req.session.role === "team") {
      const tmId = await getSessionTeamMemberId(req);
      // Read-only: team members allocated the KYC & Compliance module may view any
      // KYC record and its documents. This visibility never extends to mutations.
      if (mode === "read" && await callerHasModule(req, "kyc-admin")) {
        const sb = await getDocSubmittedByLabel(kyc.submittedByTeamMemberId);
        return { ok: true, submittedBy: sb };
      }
      if (!tmId || kyc.submittedByTeamMemberId !== tmId) return { ok: false, message: "Not authorised for this KYC" };
      const sb = await getDocSubmittedByLabel(tmId);
      return { ok: true, submittedBy: sb };
    }
    return { ok: false, message: "Forbidden" };
  }

  // Returns the set of enquiryRefs that a team member submitted — used to scope trade-document access.
  async function getTeamMemberEnquiryRefs(tmId: string): Promise<Set<string>> {
    const enquiries = await storage.getTradeEnquiriesByTeamMemberId(tmId);
    const refs = new Set<string>();
    for (const e of enquiries) {
      if (e.enquiryRef) refs.add(e.enquiryRef);
    }
    return refs;
  }

  async function ensureTradeAccess(req: Request, trade: any): Promise<{ ok: boolean; message?: string }> {
    if (!req.session?.authenticated) return { ok: false, message: "Not authenticated" };
    if (req.session.role === "admin") return { ok: true };
    if (req.session.role === "team") {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId || trade.submittedByTeamMemberId !== tmId) return { ok: false, message: "Not authorised for this trade" };
      return { ok: true };
    }
    return { ok: false, message: "Forbidden" };
  }

  app.get("/api/kyc/:id/pdf", requireAuth, async (req, res) => {
    try {
      const kyc = await storage.getKycApplicationById(req.params.id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      const access = await ensureKycAccess(req, kyc);
      if (!access.ok) return res.status(403).json({ message: access.message });
      const docs = await storage.getKycDocumentsByApplicationId(kyc.id).catch(() => []);
      const pdfPath = await generateKycApplicationPdf(kyc, docs.map(d => ({ documentType: d.documentType, originalName: d.originalName })), access.submittedBy);
      const safeName = (kyc.companyName || "Bullex").replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
      res.download(pdfPath, `KYC_Application_${safeName}.pdf`);
    } catch (error: any) {
      console.error("[kyc-pdf] failed:", error);
      res.status(500).json({ message: error.message || "Failed to generate KYC PDF" });
    }
  });

  app.get("/api/kyc-form/blank-pdf", requireAuth, async (_req: Request, res: Response) => {
    try {
      const pdfPath = await generateBlankKycApplicationPdf();
      res.download(pdfPath, "Bullex_KYC_Application_Form.pdf");
    } catch (error: any) {
      console.error("[blank-kyc-pdf] failed:", error);
      res.status(500).json({ message: error.message || "Failed to generate blank KYC form" });
    }
  });

  app.post("/api/kyc-form/send-blank-pdf", requireModule("kyc-admin"), authenticatedEmailLimiter, async (req, res) => {
    try {
      const { recipientEmail, recipientName, ccEmail, message } = req.body || {};
      if (!recipientEmail || typeof recipientEmail !== "string" || !/^\S+@\S+\.\S+$/.test(recipientEmail)) {
        return res.status(400).json({ message: "Valid recipientEmail is required" });
      }
      if (recipientName && (typeof recipientName !== "string" || recipientName.length > 200)) return res.status(400).json({ message: "recipientName too long" });
      if (message && (typeof message !== "string" || message.length > 2000)) return res.status(400).json({ message: "message too long" });
      if (ccEmail && (typeof ccEmail !== "string" || !/^\S+@\S+\.\S+$/.test(ccEmail))) return res.status(400).json({ message: "Invalid ccEmail" });

      const pdfPath = await generateBlankKycApplicationPdf();
      const { sendBlankKycApplicationPdfEmail } = await import("./email");

      let senderName = "Bullex Admin";
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        const sb = await getDocSubmittedByLabel(tmId || undefined);
        senderName = sb?.split(" (")[0] || "Bullex Team";
      }

      const ok = await sendBlankKycApplicationPdfEmail(
        recipientEmail,
        recipientName || "Sir/Madam",
        pdfPath,
        senderName,
        typeof message === "string" ? message : undefined,
        ccEmail || undefined,
      );
      if (!ok) return res.status(500).json({ message: "Failed to send blank KYC form email" });
      res.json({ success: true, sentTo: recipientEmail });
    } catch (error: any) {
      console.error("[blank-kyc-pdf-send] failed:", error);
      res.status(500).json({ message: error.message || "Failed to send blank KYC form" });
    }
  });

  app.post("/api/kyc/:id/send-pdf", requireAuth, async (req, res) => {
    try {
      const { recipientEmail, recipientName, ccEmail, message } = req.body || {};
      if (!recipientEmail || typeof recipientEmail !== "string" || !/^\S+@\S+\.\S+$/.test(recipientEmail)) {
        return res.status(400).json({ message: "Valid recipientEmail is required" });
      }
      const kyc = await storage.getKycApplicationById(req.params.id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      const access = await ensureKycAccess(req, kyc, "write");
      if (!access.ok) return res.status(403).json({ message: access.message });

      const docs = await storage.getKycDocumentsByApplicationId(kyc.id).catch(() => []);
      const pdfPath = await generateKycApplicationPdf(kyc, docs.map(d => ({ documentType: d.documentType, originalName: d.originalName })), access.submittedBy);

      const { sendKycApplicationPdfEmail } = await import("./email");
      const senderName = req.session?.role === "team" ? (access.submittedBy?.split(" (")[0] || "Bullex Team") : "Bullex Admin";
      const ok = await sendKycApplicationPdfEmail(
        recipientEmail,
        recipientName || "Sir/Madam",
        kyc.companyName,
        pdfPath,
        senderName,
        typeof message === "string" ? message : undefined,
        ccEmail && /^\S+@\S+\.\S+$/.test(ccEmail) ? ccEmail : undefined,
      );
      if (!ok) return res.status(500).json({ message: "Failed to send KYC PDF email" });
      res.json({ success: true, sentTo: recipientEmail });
    } catch (error: any) {
      console.error("[kyc-pdf-send] failed:", error);
      res.status(500).json({ message: error.message || "Failed to send KYC PDF" });
    }
  });

  // ─── ENQUIRY CHANGE REQUESTS ───
  app.get("/api/enquiry-change-requests", requireAuth, async (req, res) => {
    try {
      const all = await storage.getEnquiryChangeRequests();
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId) return res.json([]);
        // "Own" enquiries for amendment purposes = submitted OR admin-allocated,
        // matching the team portal's enquiry list.
        const myEnq = await storage.getTradeEnquiriesForTeamMember(tmId);
        const myIds = new Set(myEnq.map(e => e.id));
        return res.json(all.filter(cr => myIds.has(cr.enquiryId)));
      }
      res.json(all);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/trade-enquiries/:id/change-requests", requireAuth, async (req, res) => {
    try {
      const enquiry = await storage.getTradeEnquiryById(req.params.id);
      if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId || (enquiry.submittedByTeamMemberId !== tmId && enquiry.allocatedTeamMemberId !== tmId)) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      res.json(await storage.getEnquiryChangeRequestsByEnquiryId(req.params.id));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trade-enquiries/:id/change-request", requireAuth, async (req, res) => {
    try {
      const enquiry = await storage.getTradeEnquiryById(req.params.id);
      if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });
      // Any team member with access to the enquiry (submitter OR admin-allocated)
      // may PROPOSE changes; nothing applies until an admin approves the request.
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId || (enquiry.submittedByTeamMemberId !== tmId && enquiry.allocatedTeamMemberId !== tmId)) {
          return res.status(403).json({ message: "You can only amend enquiries you submitted or are allocated to" });
        }
      }
      const lockedStatuses = ["accepted", "closed", "quoted", "under_review"];
      if (!lockedStatuses.includes(enquiry.status)) {
        return res.status(400).json({ message: "Amendments only allowed on accepted/closed/quoted/under-review enquiries. Edit directly while still active." });
      }
      const { changedFields, reason } = req.body;
      const result = sanitizeEnquiryChangeFields(changedFields);
      if (!result.ok) return res.status(400).json({ message: result.message });
      const sanitized = result.fields;
      const created = await storage.createEnquiryChangeRequest({
        enquiryId: req.params.id,
        changedFields: sanitized,
        reason: reason || null,
      });
      notify({
        type: "enquiry_change_request",
        title: "Enquiry change requested",
        message: `Amendment requested on enquiry ${enquiry.enquiryRef}`,
        link: "/trade-enquiries",
        severity: "warning",
        module: "enquiries",
      });
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/enquiry-change-requests/:id/status", requireAdminAuth, async (req, res) => {
    try {
      const { status, adminNotes } = req.body;
      if (!status || !["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Status must be approved or rejected" });
      }
      if (status === "approved") {
        // Pre-compute block (no DB writes) so amendment + block can be persisted atomically.
        const allReqs = await storage.getEnquiryChangeRequests();
        const pendingReq = allReqs.find((c) => c.id === req.params.id);
        if (!pendingReq) return res.status(404).json({ message: "Change request not found" });
        if (pendingReq.status !== "pending") return res.status(400).json({ message: "Change request is no longer pending" });
        const targetEnquiry = await storage.getTradeEnquiryById(pendingReq.enquiryId);
        if (!targetEnquiry) return res.status(404).json({ message: "Enquiry not found" });

        const changedFields = (pendingReq.changedFields || {}) as Record<string, any>;
        const fieldNames = Object.keys(changedFields).map((k) => k.replace(/([A-Z])/g, " $1").trim()).join(", ");

        // Each attempt re-reads the live tip and re-mines, so a retry after a
        // mid-approval chain move chains onto the NEW tip.
        // Block computed inside the storage transaction under the blockchain
        // advisory lock (see the KYC amendment route above); retry wrapper
        // kept as a defense-in-depth safety net.
        const outcome = await approveWithBlockchainRetry(async () => {
          const enquiry = await storage.approveAndApplyEnquiryChangeRequest(req.params.id, adminNotes, {
            genesisHash: GENESIS_HASH,
            dataId: targetEnquiry.id,
            dataSummary: `${targetEnquiry.enquiryRef} | Amendment: ${fieldNames}`,
            buildBlockFn: (previousHash, blockNumber) => {
              const timestampIso = new Date().toISOString();
              const amendmentHash = generateKycAmendmentHash(
                targetEnquiry.enquiryRef,
                targetEnquiry.product,
                changedFields,
                timestampIso,
              );
              const { hash, nonce } = mineBlock(blockNumber, previousHash, timestampIso, amendmentHash);
              return { hash, nonce, timestamp: new Date(timestampIso) };
            },
          });
          return { enquiry };
        });
        if (!outcome.ok) {
          return res.status(409).json({ message: BLOCKCHAIN_ADVANCED_MESSAGE });
        }
        const updated = outcome.value.enquiry;
        console.log(`[blockchain] Enquiry amendment block minted for ${updated.enquiryRef}`);
        res.json({ status: "approved", enquiry: updated });
      } else {
        const updated = await storage.updateEnquiryChangeRequestStatus(req.params.id, status, adminNotes);
        res.json(updated);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/enquiry/send-onboarding-link", requireModule("enquiries"), authenticatedEmailLimiter, async (req, res) => {
    try {
      const { email } = req.body || {};
      if (!email || typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ message: "Valid email is required." });
      }
      const enquiryUrl = `${req.protocol}://${req.get("host")}/enquiry-register`;
      let senderName: string | undefined;
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        const sb = await getDocSubmittedByLabel(tmId || undefined);
        senderName = sb?.split(" (")[0];
      } else if (req.session?.role === "admin") {
        senderName = "Bullex Admin";
      }
      const { sendEnquiryOnboardingInviteEmail } = await import("./email");
      const sent = await sendEnquiryOnboardingInviteEmail(email, enquiryUrl, senderName);
      if (!sent) return res.status(500).json({ message: "Failed to send invitation email." });
      res.json({ success: true, message: `Invitation sent to ${email}` });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Internal server error." });
    }
  });

  app.post("/api/public/trade-enquiries", publicFormLimiterModerate, async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.product || typeof b.product !== "string" || !b.product.trim()) {
        return res.status(400).json({ message: "Product is required" });
      }
      if (!b.email || typeof b.email !== "string" || !/^\S+@\S+\.\S+$/.test(b.email)) {
        return res.status(400).json({ message: "Valid email is required" });
      }
      if (!b.createdBy || typeof b.createdBy !== "string" || !b.createdBy.trim()) {
        return res.status(400).json({ message: "Your name / company is required" });
      }
      const str = (v: any, max = 1000) => (typeof v === "string" && v.trim()) ? v.trim().slice(0, max) : null;
      const side = b.side === "sell" ? "sell" : "buy";
      const enquiry = await storage.createTradeEnquiry({
        product: b.product.trim().slice(0, 200),
        side,
        specifications: str(b.specifications, 2000),
        producer: str(b.producer, 200),
        quantity: str(b.quantity, 100),
        unit: str(b.unit, 20) || "MT",
        packing: str(b.packing, 200),
        loadingPort: str(b.loadingPort, 200),
        incoterms: str(b.incoterms, 50),
        validity: str(b.validity, 200),
        additionalInfo: str(b.additionalInfo, 2000),
        createdBy: b.createdBy.trim().slice(0, 200),
        email: b.email.trim(),
        submittedByTeamMemberId: null,
      });
      sendEnquiryCreatedNotification(enquiry).catch(() => {});
      notify({
        type: "enquiry_created",
        title: "New trade enquiry",
        message: `${enquiry.createdBy || "Client"} — ${enquiry.product} (${enquiry.enquiryRef})`,
        link: "/trade-enquiries",
        severity: "info",
        module: "enquiries",
      });
      res.json({ success: true, enquiryRef: enquiry.enquiryRef });
    } catch (error: any) {
      console.error("[public-enquiry] failed:", error);
      res.status(500).json({ message: error.message || "Failed to submit enquiry" });
    }
  });

  app.post("/api/kyc/send-onboarding-link", requireModule("kyc-admin"), authenticatedEmailLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email address is required." });
      }
      const kycUrl = `${req.protocol}://${req.get("host")}/kyc`;
      const sent = await sendKycOnboardingInviteEmail(email, kycUrl);
      if (!sent) {
        return res.status(500).json({ message: "Failed to send invitation email." });
      }
      res.json({ success: true, message: `Invitation sent to ${email}` });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Internal server error." });
    }
  });

  app.post("/api/kyc", publicFormLimiterStrict, async (req, res) => {
    try {
      const parsed = insertKycSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      // Global DB-backed cap: prevent multi-IP attackers from flooding the onboarding
      // queue and exhausting email/sanctions-screening quotas indefinitely.
      // Applied before creation so junk records never accumulate beyond this limit.
      const pendingKycCount = await storage.countPendingKycApplications();
      if (pendingKycCount >= KYC_APP_CAP) {
        return res.status(429).json({ message: "Application intake is temporarily paused. Please try again later." });
      }
      const data: any = { ...parsed.data };
      // All KYC fields are optional — coerce missing/null values for text columns to
      // empty strings so NOT NULL text columns accept the row when the applicant skips them.
      // Skip non-text columns (timestamp, jsonb, integer, etc.) which cannot accept "".
      const cols: any = getTableColumns(kycApplications);
      for (const k of Object.keys(cols)) {
        const col = cols[k];
        if (!col?.notNull || col?.hasDefault) continue;
        const sqlType = typeof col?.getSQLType === "function" ? col.getSQLType() : "";
        const isText = sqlType === "text" || /^varchar/.test(sqlType);
        if (!isText) continue;
        if (data[k] === undefined || data[k] === null) data[k] = "";
      }
      // Always strip caller-supplied attribution; only the server may set it.
      delete data.submittedByTeamMemberId;
      if (req.session?.authenticated && req.session.role === "team" && req.session.username) {
        const tm = await storage.getTeamMemberByUsername(req.session.username);
        if (tm) data.submittedByTeamMemberId = tm.id;
      }
      const result = await storage.createKycApplication(data);

      // Link any documents that were uploaded during the public registration flow.
      // documentIds is an optional array of KYC document IDs to associate with this application.
      const documentIds = Array.isArray(req.body.documentIds) ? req.body.documentIds : [];
      if (documentIds.length > 0) {
        await storage.linkKycDocumentsToApplication(result.id, documentIds);
      }

      // Mandatory sanctions / PEP screening for every KYC application.
      // Runs in background so it doesn't delay the response or block submission on Yahoo/OpenSanctions latency.
      // If screening comes back fully clear, the application is auto-approved with no admin action;
      // flagged or un-screened applications stay pending for manual review.
      const kycBaseUrl = `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers["x-forwarded-host"] || req.get("host")}`;
      runSanctionsScreening(result.id, "system:auto")
        .then((screened) => {
          if (screened?.amlStatus === "clear") {
            return autoApproveKycIfClear(result.id, kycBaseUrl);
          }
        })
        .catch((err) => console.error("[aml] auto-screening failed:", err?.message));

      // Applicant confirmation: prefer the signatory email, but fall back to the
      // contact email — all KYC fields are optional, so signatoryEmail is often
      // blank and the applicant previously received no confirmation at all.
      const signatoryEmail = parsed.data.signatoryEmail || parsed.data.contactEmail;
      const submittedAt = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

      // Email to client (signatory or contact)
      if (signatoryEmail) {
        sendKycConfirmationEmail(
          signatoryEmail,
          parsed.data.companyName,
          parsed.data.signatoryName || parsed.data.contactName
        ).catch((err) => console.error("[email] background send failed:", err));
      }
      // Email to form filler (if different from signatory)
      if (parsed.data.filledByEmail && parsed.data.filledByEmail !== signatoryEmail) {
        sendKycConfirmationEmail(
          parsed.data.filledByEmail,
          parsed.data.companyName,
          parsed.data.filledByName || "Applicant"
        ).catch((err) => console.error("[email] background send to filledBy failed:", err));
      }
      // Email to admin
      const adminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME;
      if (adminEmail) {
        const contactEmail = parsed.data.contactEmail || parsed.data.signatoryEmail || parsed.data.filledByEmail || "";
        const contactName = parsed.data.contactName || parsed.data.signatoryName || parsed.data.filledByName || "Unknown";
        sendKycSubmittedAdminEmail(
          adminEmail,
          parsed.data.companyName,
          contactName,
          contactEmail,
          parsed.data.businessType,
          parsed.data.countryOfOperation,
          submittedAt
        ).catch((err) => console.error("[email] admin KYC notification failed:", err));
      }

      notify({
        type: "kyc_submitted",
        title: "New KYC submission",
        message: `${parsed.data.companyName} submitted a KYC application`,
        link: "/kyc-admin",
        severity: "info",
        module: "kyc",
      });

      res.json(sanitizeKyc(result));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create KYC application" });
    }
  });

  app.get("/api/trades", requireModule("trading"), async (req, res) => {
    try {
      let result;
      if (req.session!.role === "admin") {
        result = await storage.getTrades();
      } else {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId) return res.status(403).json({ message: "Team-member only" });
        result = await storage.getTradesByTeamMemberId(tmId);
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trades" });
    }
  });

  app.post("/api/trades", requireModule("trading"), async (req, res) => {
    try {
      const parsed = insertTradeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }

      const { quantity, pricePerUnit } = parsed.data;
      if (quantity <= 0 || pricePerUnit <= 0) {
        return res.status(400).json({ message: "Quantity and price must be positive" });
      }

      const tmId = req.session!.role === "team" ? await getSessionTeamMemberId(req) : null;

      const rawBuyerKycId = typeof req.body.buyerKycId === "string" ? req.body.buyerKycId : null;
      const rawSellerKycId = typeof req.body.sellerKycId === "string" ? req.body.sellerKycId : null;

      let resolvedBuyerName = parsed.data.buyerName;
      let resolvedSellerName = parsed.data.sellerName;

      if (rawBuyerKycId || rawSellerKycId) {
        const approvedKyc = (await storage.getKycApplications()).filter((k) => k.status === "approved");
        const approvedMap = new Map(approvedKyc.map((k) => [k.id, k]));
        if (rawBuyerKycId) {
          const buyerKyc = approvedMap.get(rawBuyerKycId);
          if (!buyerKyc) return res.status(400).json({ message: "Invalid buyerKycId: not an approved KYC participant" });
          resolvedBuyerName = buyerKyc.companyName;
        }
        if (rawSellerKycId) {
          const sellerKyc = approvedMap.get(rawSellerKycId);
          if (!sellerKyc) return res.status(400).json({ message: "Invalid sellerKycId: not an approved KYC participant" });
          resolvedSellerName = sellerKyc.companyName;
        }
      }

      const result = await storage.createPreDealTrade({
        ...parsed.data,
        buyerName: resolvedBuyerName,
        sellerName: resolvedSellerName,
        submittedByTeamMemberId: tmId,
        buyerKycId: rawBuyerKycId,
        sellerKycId: rawSellerKycId,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create trade" });
    }
  });

  app.patch("/api/trades/:id/status", requireModule("trading"), async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const statusFlow = ["pre_deal", "deal", "execution", "final_payment"];
      if (!status || !statusFlow.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const trade = await storage.getTradeById(id);
      if (!trade) {
        return res.status(404).json({ message: "Trade not found" });
      }
      const accessCheck = await ensureTradeAccess(req, trade);
      if (!accessCheck.ok) return res.status(403).json({ message: accessCheck.message });
      const currentIdx = statusFlow.indexOf(trade.status);
      const nextIdx = statusFlow.indexOf(status);
      if (nextIdx !== currentIdx + 1) {
        return res.status(409).json({ message: `Cannot transition from ${trade.status} to ${status}. Next valid status: ${statusFlow[currentIdx + 1] || "none"}` });
      }
      const mandatoryForCurrentStage = stageMandatoryDocs[trade.status] || [];
      const tradeFiles = await storage.getTradeDocuments(id);
      const uploadedKeys = new Set(tradeFiles.map((f) => f.documentKey));
      const missingDocs = mandatoryForCurrentStage.filter((d) => !uploadedKeys.has(d));
      if (missingDocs.length > 0) {
        return res.status(409).json({ message: `Mandatory documents must be uploaded for ${trade.status} before advancing: ${missingDocs.join(", ")}` });
      }

      if (trade.status === "pre_deal" && status === "deal") {
        try {
          const updated = await storage.mintTradeBlock(id, status, generateTradeHash, mineBlock, GENESIS_HASH);
          res.json(updated);
        } catch (mintError: any) {
          // The trade row is locked inside mintTradeBlock; if a concurrent
          // TFR revoke deleted it (or its status changed) mid-flight, surface
          // a clean conflict instead of a 500.
          const msg = String(mintError?.message || "");
          if (msg === "Trade not found" || msg.includes("not in pre_deal")) {
            return res.status(409).json({ message: "Trade was modified or revoked while this transition was in flight. Refresh and try again." });
          }
          if (msg.includes("incomplete blockchain record")) {
            return res.status(409).json({ message: "This trade's blockchain record is incomplete. It cannot advance until the chain record is repaired." });
          }
          throw mintError;
        }
      } else {
        // Conditional UPDATE keyed on the previously observed status: matches
        // zero rows if the trade was revoked (deleted) or transitioned by a
        // concurrent request.
        const updated = await storage.updateTradeStatus(id, status, trade.status);
        if (!updated) {
          return res.status(409).json({ message: "Trade was modified or revoked while this transition was in flight. Refresh and try again." });
        }
        res.json(updated);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update trade status" });
    }
  });

  app.patch("/api/trades/:id/documents", requireModule("trading"), async (req, res) => {
    try {
      const { id } = req.params;
      const { docKey, checked } = req.body;
      if (!docKey || typeof checked !== "boolean") {
        return res.status(400).json({ message: "Invalid request body" });
      }
      if (!allValidDocKeys.has(docKey)) {
        return res.status(400).json({ message: `Invalid document key: ${docKey}` });
      }
      if (checked && allMandatoryDocKeys.has(docKey)) {
        return res.status(409).json({ message: "Mandatory documents must be satisfied by uploading a file, not by manual confirmation." });
      }
      const trade = await storage.getTradeById(id);
      if (!trade) {
        return res.status(404).json({ message: "Trade not found" });
      }
      const accessCheck = await ensureTradeAccess(req, trade);
      if (!accessCheck.ok) return res.status(403).json({ message: accessCheck.message });
      // Row-locked, so a concurrent revoke (which deletes the trade) can't be
      // overwritten and concurrent flag updates can't clobber each other.
      const updated = await storage.setStageDocumentFlag(id, docKey, checked);
      if (!updated) {
        return res.status(409).json({ message: "Trade no longer exists — its approval may have been revoked." });
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update documents" });
    }
  });

  app.get("/api/blocks", async (_req, res) => {
    try {
      const result = await storage.getBlocks();
      // Preserve the legacy public proof feed and response shape, but never
      // expose record identifiers or human-readable KYC/enquiry summaries.
      res.json(projectBlocksForBlockchainViewer(result, PUBLIC_BLOCKCHAIN_SCOPE));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch blocks" });
    }
  });

  // Logical commodity parents for Deal reference blocks. The raw /api/blocks
  // ledger remains unchanged for chronological chain auditing.
  app.get("/api/product-blocks", requireModule("blockchain"), async (req, res) => {
    try {
      const teamMemberId = req.session!.role === "team"
        ? await getSessionTeamMemberId(req)
        : null;
      if (req.session!.role === "team" && !teamMemberId) {
        return res.status(403).json({ message: "Team-member only" });
      }
      const result = await storage.getProductBlockGroups(teamMemberId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch product deal blocks" });
    }
  });

  // Single least-privilege read model for the Blockchain page. Team members
  // receive only their own commercial records and only the fields rendered by
  // this page; admins retain the full-ledger view. This avoids widening access
  // through a page whose supporting APIs belong to other modules.
  app.get("/api/blockchain-ledger", requireModule("blockchain"), async (req, res) => {
    try {
      const isTeam = req.session!.role === "team";
      const teamMemberId = isTeam ? await getSessionTeamMemberId(req) : null;
      if (isTeam && !teamMemberId) {
        return res.status(403).json({ message: "Team-member only" });
      }
      const [ledgerBlocks, productGroups, visibleTrades, visibleKyc, visibleEnquiries] = await Promise.all([
        storage.getBlocks(),
        storage.getProductBlockGroups(teamMemberId),
        teamMemberId ? storage.getTradesByTeamMemberId(teamMemberId) : storage.getTrades(),
        teamMemberId
          ? storage.getKycApplicationsByTeamMemberId(teamMemberId)
          : storage.getKycApplications(),
        teamMemberId
          ? storage.getTradeEnquiriesForTeamMember(teamMemberId)
          : storage.getTradeEnquiries(),
      ]);

      const blocksForViewer = projectBlocksForBlockchainViewer(
        ledgerBlocks,
        isTeam
          ? {
              tradeBlockNumbers: new Set(
                visibleTrades
                  .map((trade) => trade.blockNumber)
                  .filter((blockNumber): blockNumber is number => blockNumber !== null),
              ),
              kycIds: new Set(visibleKyc.map((kyc) => kyc.id)),
              enquiryIds: new Set(visibleEnquiries.map((enquiry) => enquiry.id)),
            }
          : null,
      );

      res.json({
        blocks: blocksForViewer,
        productGroups,
        trades: visibleTrades.map((trade) => ({
          id: trade.id,
          tradeRef: trade.tradeRef,
          commodity: trade.commodity,
          commodityCategory: trade.commodityCategory,
          quantity: trade.quantity,
          unit: trade.unit,
          pricePerUnit: trade.pricePerUnit,
          totalValue: trade.totalValue,
          currency: trade.currency,
          origin: trade.origin,
          destination: trade.destination,
          status: trade.status,
          blockchainHash: trade.blockchainHash,
          blockNumber: trade.blockNumber,
        })),
        kycApps: visibleKyc.map((kyc) => ({
          id: kyc.id,
          companyName: kyc.companyName,
          registrationNumber: kyc.registrationNumber,
          countryOfIncorporation: kyc.countryOfIncorporation,
          category: kyc.category,
          products: kyc.products,
          blockchainHash: kyc.blockchainHash,
        })),
        enquiries: visibleEnquiries.map((enquiry) => ({
          id: enquiry.id,
          enquiryRef: enquiry.enquiryRef,
          side: enquiry.side,
          product: enquiry.product,
          quantity: enquiry.quantity,
          unit: enquiry.unit,
          createdBy: enquiry.createdBy,
          clientRespondedBy: enquiry.clientRespondedBy,
          loadingPort: enquiry.loadingPort,
          incoterms: enquiry.incoterms,
        })),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch blockchain ledger" });
    }
  });

  app.get("/api/documents/next-loi-number", requireModule(DOC_MODULES), async (req, res) => {
    try {
      const buyerName = (req.query.buyerName as string || "").trim();
      const prefix = buyerName.substring(0, 3).toUpperCase() || "XXX";
      const now = new Date();
      const ddmm = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}`;
      const allDocs = await storage.getDocuments();
      const loiDocs = allDocs.filter(d => d.docType === "LOI" && d.issueNumber);
      const serial = 181 + loiDocs.length;
      const issueNumber = `IMP-${prefix}-${ddmm}-${serial}`;
      res.json({ issueNumber });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to generate LOI number" });
    }
  });

  // Read-widened to the vault module: DocuVault renders reference blocks from
  // this list. Visibility scoping below is unchanged (admin = all, team =
  // own docs + own agent agreements); mutations/downloads keep their gates.
  app.get("/api/documents", requireModule([...DOC_MODULES, "vault"]), async (req, res) => {
    try {
      // Admins see every generated document. A team member sees ONLY the documents
      // they created (submittedByTeamMemberId) plus the NCNDA/ICA agent agreements
      // in which THEY are the agent (agentCode = their participant ID), never
      // other members' documents.
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) {
        return res.json(await storage.getDocumentsForBrowse());
      }
      const own = await storage.getDocumentsForBrowse(tmId);
      const member = await storage.getTeamMemberById(tmId);
      let merged = own;
      if (member?.participantId) {
        const agreements = await storage.getAgentAgreementsForBrowse(member.participantId);
        const seen = new Set(own.map((d) => d.id));
        merged = [...own, ...agreements.filter((d) => !seen.has(d.id))]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      res.json(merged);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.post("/api/documents/preview", requireDocAccess(DOC_MODULES), async (req, res) => {
    try {
      const { buyerDetails, sellerDetails, productDetails, docType, tradeRef } = req.body;
      if (!docType) return res.status(400).json({ message: "docType is required" });
      // TFRs consolidate both legs of a matched deal — they are only prepared
      // via the admin Deal Pipeline, never generated directly.
      if (docType === "TFR") {
        return res.status(400).json({ message: "TFRs are prepared via the Deal Pipeline after deal matching" });
      }

      // Clients may only preview documents tied to one of their own accepted
      // enquiries, and may never resolve an arbitrary trade (cross-record leak).
      const isClient = req.session?.role === "client";
      if (isClient) {
        const clientKycId = req.session.clientKycId;
        if (!clientKycId) return res.status(403).json({ message: "Client not found" });
        const enquiryRef = req.body.enquiryRef;
        if (!enquiryRef) {
          return res.status(400).json({ message: "Link the document to one of your accepted enquiries (enquiryRef required)" });
        }
        const ownedEnq = await findClientOwnedEnquiry(clientKycId, enquiryRef);
        if (!ownedEnq) {
          return res.status(403).json({ message: "You can only preview documents for your own enquiries" });
        }
        if (ownedEnq.status !== "accepted") {
          return res.status(400).json({ message: `Documents can only be created for accepted enquiries (current status: ${ownedEnq.status})` });
        }
      }

      let trade: Trade | undefined;
      if (tradeRef && !isClient) {
        const role = req.session?.role;
        if (role === "team") {
          // Team members may only use a tradeRef that is stored on one of their own
          // enquiries. Supplying an unrelated tradeRef is an information-disclosure attempt.
          const tmId = await getSessionTeamMemberId(req);
          if (!tmId) return res.status(403).json({ message: "Team member not found" });
          const previewEnquiryRef = req.body.enquiryRef as string | undefined;
          if (!previewEnquiryRef) {
            return res.status(400).json({ message: "enquiryRef is required when supplying tradeRef" });
          }
          const tmEnquiries = await storage.getTradeEnquiriesByTeamMemberId(tmId);
          const ownedPreviewEnq = tmEnquiries.find(e => e.enquiryRef === previewEnquiryRef);
          if (!ownedPreviewEnq) {
            return res.status(403).json({ message: "You can only supply tradeRef from your own enquiries" });
          }
          if (!tradeRefMatchesEnquiry(ownedPreviewEnq, tradeRef)) {
            return res.status(403).json({ message: "tradeRef does not match the trade linked to your enquiry" });
          }
        }
        // Admin: unrestricted access to any trade
        const trades = await storage.getTrades();
        trade = trades.find(t => t.tradeRef === tradeRef);
      }
      // Mirror the deal-recap numbering used at creation time so the previewed
      // text (which the user can edit) matches the final generated document.
      let previewDealRecapNumber: string | null = null;
      if (docType === "DEAL_RECAP" || docType === "SPA") {
        const buyName3 = (buyerDetails?.name || "XXX").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
        const sellName3 = (sellerDetails?.name || "XXX").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
        const now = new Date();
        const ddmm = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}`;
        const allDocs = await storage.getDocuments();
        const prefix = `${buyName3}/${sellName3}-${ddmm}`;
        const samePrefix = allDocs.filter(d => d.dealRecapNumber && d.dealRecapNumber.startsWith(prefix));
        previewDealRecapNumber = `${prefix}-${String(samePrefix.length + 1).padStart(3, "0")}`;
      }
      const content = generateDocumentContent(docType, trade, buyerDetails, sellerDetails, {
        ...productDetails,
        dealRecapNumber: previewDealRecapNumber || productDetails?.dealRecapNumber,
      });
      res.json({ content });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to preview document" });
    }
  });

  app.post("/api/documents", requireDocAccess(DOC_MODULES), async (req, res) => {
    try {
      const { buyerDetails, sellerDetails, productDetails, editedContent: _editedContent, ...docData } = req.body;
      const parsed = insertDocumentSchema.safeParse(docData);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      // TFRs consolidate both legs of a matched deal — they are only prepared
      // via the admin Deal Pipeline (createPipelineDoc), never via the generic
      // document-create route.
      if (parsed.data.docType === "TFR") {
        return res.status(400).json({ message: "TFRs are prepared via the Deal Pipeline after deal matching" });
      }
      if (parsed.data.docType === "ADDENDUM") {
        return res.status(400).json({
          message: "SPA addenda must be created from an existing SPA using the dedicated addendum form",
        });
      }
      if (parsed.data.docType === "PI") {
        return res.status(400).json({
          message: "Proforma Invoices must be created from an Import or Export SPA using the Create PI action",
        });
      }
      // Clients are never permitted to supply a tradeRef: doing so would allow them
      // to hydrate document content from trades they do not own. Reject early so the
      // lookup never executes for client callers.
      if (req.session?.role === "client" && parsed.data.tradeRef) {
        return res.status(403).json({ message: "Clients may not supply a tradeRef" });
      }

      // Trade lookup deferred to after role checks for team/admin callers so that
      // authorization (enquiry ownership) can be validated before the record is used.
      let trade: Trade | undefined;
      let issueNumber: string | null = null;
      if (parsed.data.docType === "LOI") {
        const buyName = (buyerDetails?.name || "").trim();
        const prefix = buyName.substring(0, 3).toUpperCase() || "XXX";
        const now = new Date();
        const ddmm = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}`;
        const allDocs = await storage.getDocuments();
        const loiDocs = allDocs.filter(d => d.docType === "LOI" && d.issueNumber);
        const serial = 181 + loiDocs.length;
        issueNumber = `IMP-${prefix}-${ddmm}-${serial}`;
      }

      let dealRecapNumber: string | null = null;
      if (parsed.data.docType === "DEAL_RECAP" || parsed.data.docType === "SPA") {
        const buyName3 = (buyerDetails?.name || "XXX").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
        const sellName3 = (sellerDetails?.name || "XXX").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
        const now = new Date();
        const ddmm = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}`;
        const allDocs = await storage.getDocuments();
        const prefix = `${buyName3}/${sellName3}-${ddmm}`;
        const samePrefix = allDocs.filter(d => d.dealRecapNumber && d.dealRecapNumber.startsWith(prefix));
        const serial = String(samePrefix.length + 1).padStart(3, "0");
        dealRecapNumber = `${prefix}-${serial}`;
      }

      const enquiryRef = req.body.enquiryRef || null;
      const linkedEnquiry = enquiryRef ? await storage.getTradeEnquiryByRef(enquiryRef) : null;

      // Team-member gating: must own the linked enquiry, and the enquiry must be admin-accepted.
      let submittedByTeamMemberId: string | null = null;
      let submittedByClientId: string | null = null;
      if (req.session?.role === "client") {
        // Client gating: an approved client may generate documents only against an
        // enquiry that is theirs (issued by them OR assigned to them) AND accepted.
        // The resulting document is created as pending_review and routed to the
        // trade desk — clients never produce a final/official document directly.
        const clientKycId = req.session.clientKycId;
        if (!clientKycId) return res.status(403).json({ message: "Client not found" });
        if (!enquiryRef) {
          return res.status(400).json({ message: "Link the document to one of your accepted enquiries (enquiryRef required)" });
        }
        const ownedEnq = await findClientOwnedEnquiry(clientKycId, enquiryRef);
        if (!ownedEnq) {
          return res.status(403).json({ message: "You can only create documents for your own enquiries" });
        }
        if (ownedEnq.status !== "accepted") {
          return res.status(400).json({ message: `Documents can only be created for accepted enquiries (current status: ${ownedEnq.status})` });
        }
        submittedByClientId = clientKycId;

        // Mirror the team-branch counterparty-email guard (side-specific): if the
        // linked enquiry recorded an email for a party, the corresponding email on
        // the document must match it, so a client cannot swap in an unrelated
        // participant's email. Sides where the enquiry captured no email are not
        // enforced (contact fields are free text and often store only a phone).
        const emailCheck = checkPartyEmailAgainstEnquiry({
          buyerContact: req.body.buyerDetails?.contact,
          sellerContact: req.body.sellerDetails?.contact,
          enquiryBuyerContact: ownedEnq.buyerContact,
          enquirySellerContact: ownedEnq.sellerContact,
        });
        if (!emailCheck.ok) {
          return res.status(422).json({
            message: emailCheck.side === "buyer"
              ? "Buyer contact email must match the enquiry's registered buyer contact"
              : "Seller contact email must match the enquiry's registered seller contact",
          });
        }
      } else if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId) return res.status(403).json({ message: "Team member not found" });
        if (!enquiryRef) {
          return res.status(400).json({ message: "Team members must link the document to one of their accepted enquiries (enquiryRef required)" });
        }
        const allEnq = await storage.getTradeEnquiriesForTeamMember(tmId);
        const ownedEnq = allEnq.find(e => e.enquiryRef === enquiryRef);
        if (!ownedEnq) {
          return res.status(403).json({ message: "You can only create documents for enquiries you submitted or that an admin has allocated to you" });
        }
        if (ownedEnq.status !== "accepted") {
          return res.status(400).json({ message: `Documents can only be created for accepted enquiries (current status: ${ownedEnq.status})` });
        }
        // Verify that the supplied tradeRef (if any) belongs to this team member's
        // enquiry. Prevents cross-record leakage of trade data to unauthorised callers.
        if (parsed.data.tradeRef && !tradeRefMatchesEnquiry(ownedEnq, parsed.data.tradeRef)) {
          return res.status(403).json({ message: "tradeRef does not match the trade linked to your enquiry" });
        }
        submittedByTeamMemberId = tmId;

        // Guard (side-specific): if the linked enquiry recorded an email for a
        // given party, the corresponding email supplied in the document must match
        // it. Enquiry contact fields are free text and frequently capture only a
        // name/phone for one party (e.g. the buyer) and an email for the other
        // (e.g. the seller); combining both sides into one allowlist — and failing
        // closed when neither side has an email — wrongly rejected a legitimately-
        // entered buyer email just because the enquiry only stored the seller's.
        // We only enforce a match where the enquiry actually recorded an email for
        // that side. Portal routing (the real multi-tenant boundary) is separately
        // locked down at POST /api/documents/:id/send, where team members cannot
        // set the client recipient and admin recipients are validated against doc emails.
        const emailCheck = checkPartyEmailAgainstEnquiry({
          buyerContact: req.body.buyerDetails?.contact,
          sellerContact: req.body.sellerDetails?.contact,
          enquiryBuyerContact: ownedEnq.buyerContact,
          enquirySellerContact: ownedEnq.sellerContact,
        });
        if (!emailCheck.ok) {
          return res.status(422).json({
            message: emailCheck.side === "buyer"
              ? "Buyer contact email must match the enquiry's registered buyer contact"
              : "Seller contact email must match the enquiry's registered seller contact",
          });
        }
      } else if (enquiryRef) {
        // Admin creating a doc against a team-member's enquiry — auto-attribute to the enquiry's owner
        // so that team member can see it in their list.
        try {
          const allEnquiries = await storage.getTradeEnquiries();
          const matched = allEnquiries.find(e => e.enquiryRef === enquiryRef);
          if (matched?.submittedByTeamMemberId) {
            submittedByTeamMemberId = matched.submittedByTeamMemberId;
          }
        } catch (e) {
          console.error("[docs] Failed to resolve enquiry owner for attribution:", e);
        }
      }

      // Perform the trade lookup now that all role-based tradeRef authorization has
      // passed. Clients are rejected earlier if they supply tradeRef; team members have
      // verified their tradeRef matches their owned enquiry; admins are unrestricted.
      if (parsed.data.tradeRef) {
        const trades = await storage.getTrades();
        trade = trades.find(t => t.tradeRef === parsed.data.tradeRef);
      }

      // If the user edited the text during the Review step, persist their edited
      // version verbatim instead of regenerating from the structured fields.
      if (typeof req.body.editedContent === "string" && req.body.editedContent.length > 500000) {
        return res.status(400).json({ message: "Edited document content is too large" });
      }
      const editedContent = typeof req.body.editedContent === "string" && req.body.editedContent.trim().length > 0
        ? req.body.editedContent
        : null;
      // For LOI use the freshly computed issueNumber; for cert/invoice docs (COA/COO/CI)
      // keep the number supplied via productDetails so the final document matches the preview.
      const content = editedContent ?? generateDocumentContent(parsed.data.docType, trade, buyerDetails, sellerDetails, { ...productDetails, loiIssueNumber: issueNumber ?? productDetails?.loiIssueNumber, dealRecapNumber: dealRecapNumber || undefined });
      const adminChecks = buildAdminChecks(parsed.data.docType);
      const buyerEmailExtracted = buyerDetails?.contact?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] || null;
      const sellerEmailExtracted = sellerDetails?.contact?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] || null;
      const resolvedAgentCode = await resolveAgentCode({
        buyerEmail: buyerEmailExtracted,
        sellerEmail: sellerEmailExtracted,
        sentToClientId: (parsed.data as any).sentToClientId || null,
        submittedByTeamMemberId,
      });
      const resolvedTeamMemberCode = await resolveTeamMemberCode({
        enquiryRef,
        submittedByTeamMemberId,
      });
      // Team- and admin-prepared documents generally do not require admin
      // approval: they are created ready-to-sign ("draft") so team members can
      // generate, sign, and send from their own terminal. Exceptions that still
      // require admin review before the preparer can sign/send:
      //   - client-submitted documents
      //   - team-prepared agent agreements (NCNDA/ICA)
      const isTeamAgentAgreement = !!submittedByTeamMemberId && ["NCNDA", "ICA"].includes(parsed.data.docType);
      const isProformaSpa = parsed.data.docType === "SPA"
        && (linkedEnquiry?.side === "buy" || linkedEnquiry?.side === "sell");
      const initialStatus = (submittedByClientId || isTeamAgentAgreement || isProformaSpa) ? "pending_review" : "draft";
      const result = await storage.createDocument({
        ...parsed.data,
        content,
        status: initialStatus,
        adminChecks,
        issueNumber,
        dealRecapNumber,
        enquiryRef,
        submittedByTeamMemberId,
        submittedByClientId,
        agentCode: resolvedAgentCode,
        teamMemberCode: resolvedTeamMemberCode,
        buyerEmail: buyerEmailExtracted,
        sellerEmail: sellerEmailExtracted,
        // Clients must never be able to pre-populate workflow-state or signature
        // fields. Explicitly null these out regardless of what parsed.data contains
        // so forged recipientResponse / signature values cannot be persisted.
        ...(submittedByClientId ? {
          recipientResponse: null,
          buyerSignature: null,
          sellerSignature: null,
          buyerSignedName: null,
          sellerSignedName: null,
          buyerSignedAt: null,
          sellerSignedAt: null,
          sentToClientId: null,
          sentTo: null,
        } : {}),
      } as any, { lpgSts: productDetails?.spaVariant === "lpg-sts" });

      try {
        const isLoi = parsed.data.docType === "LOI";
        const submittedByLabel = submittedByClientId
          ? `${req.session.clientCompanyName || "Client"} (Client)`
          : await getDocSubmittedByLabel(submittedByTeamMemberId);
        const docxPath = await generateDocx(result.id, result.title, content, submittedByLabel, resolvedAgentCode || undefined, resolvedTeamMemberCode || undefined, result.docType);
        let pdfPath: string | undefined;
        if (!isLoi) {
          pdfPath = await generatePdf(result.id, result.title, content, submittedByLabel, resolvedAgentCode || undefined, resolvedTeamMemberCode || undefined, result.docType);
        }
        const updated = await storage.updateDocument(result.id, { docxPath, ...(pdfPath ? { pdfPath } : {}) });

        // Client-submitted documents and team-prepared agent agreements
        // (NCNDA/ICA) require admin approval, so alert admins. Other
        // team-prepared documents are surfaced as an informational notice.
        if (submittedByClientId || isTeamAgentAgreement || isProformaSpa) {
          notify({
            type: "document_pending_review",
            title: "Document awaiting approval",
            message: `${submittedByLabel} prepared ${result.docType} "${result.title}" — review required`,
            link: "/documents",
            severity: "warning",
            module: "doc-templates",
          });
        } else if (submittedByTeamMemberId) {
          notify({
            type: "document_created",
            title: "Document prepared",
            message: `${submittedByLabel} prepared ${result.docType} "${result.title}"`,
            link: "/documents",
            severity: "info",
            module: "doc-templates",
          });
        }

        const buyerEmail = buyerDetails?.contact?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0];
        const sellerEmail = sellerDetails?.contact?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0];
        const buyerName = buyerDetails?.name || "Buyer";
        const sellerName = sellerDetails?.name || "Seller";

        // Do NOT auto-email buyer/seller on creation — documents must pass admin review first.
        // Sending happens explicitly via POST /api/documents/:id/send after approval + signature.
        void pdfPath; void buyerEmail; void sellerEmail; void buyerName; void sellerName;

        res.json(updated);
      } catch (fileErr) {
        console.error("[docs] File generation error (document still created):", fileErr);
        res.json(result);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create document" });
    }
  });

  app.get("/api/documents/:id", requireModule(DOC_MODULES), async (req, res) => {
    try {
      const doc = await storage.getDocumentForBrowse(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      // Admins may open any document; a team member may only open one they created
      // or an NCNDA/ICA agent agreement in which they are the agent.
      const tmId = await getSessionTeamMemberId(req);
      if (tmId && doc.submittedByTeamMemberId !== tmId) {
        const member = await storage.getTeamMemberById(tmId);
        if (!isOwnAgentAgreement(doc, member?.participantId)) {
          return res.status(404).json({ message: "Document not found" });
        }
      }
      res.json(doc);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch document" });
    }
  });

  app.patch("/api/documents/:id", requireModule(DOC_MODULES), async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (!canManageProformaInvoice({ docType: doc.docType, role: req.session?.role })) {
        return res.status(403).json({ message: "Only an administrator can modify a Proforma Invoice" });
      }
      if (
        doc.docType === "PI"
        && (doc.status !== "draft" || !!doc.buyerSignature || !!doc.sellerSignature)
      ) {
        return res.status(409).json({
          message: "A Proforma Invoice is immutable once signed or delivered. Delete an unsent PI and create it again if correction is required.",
        });
      }
      if (isSpaAddendumContentLocked(doc)) {
        return res.status(409).json({
          message: "A signed or completed SPA addendum is immutable. Create a new numbered addendum instead.",
        });
      }
      // Edit gate: see canEditDocument (single source of truth). Team members may
      // NOT mutate status; admin-review and the workflow endpoints control status
      // transitions (admin may still set draft/review/final below).
      const role = req.session?.role;
      const isTeam = role === "team";
      let isOwner = true;
      if (isTeam) {
        const tmId = await getSessionTeamMemberId(req);
        isOwner = !!tmId && doc.submittedByTeamMemberId === tmId;
        if (!isOwner) {
          return res.status(403).json({ message: "You can only edit documents you created" });
        }
      }
      if (!canEditDocument({ role, isOwner, status: doc.status, recipientResponse: doc.recipientResponse })) {
        if (isTeam) {
          return res.status(403).json({ message: "Team members cannot edit a generated document directly. Submit an amendment for admin approval." });
        }
        return res.status(403).json({ message: "Forbidden" });
      }
      const allowedStatuses = ["draft", "review", "final"];
      const { title, content, status } = req.body;
      if (doc.docType === "PI" && typeof status === "string" && status !== doc.status) {
        return res.status(400).json({
          message: "The Proforma Invoice status is managed by its signing and recipient acceptance workflow",
        });
      }
      const updateData: Record<string, any> = {};
      if (typeof title === "string" && title.trim()) updateData.title = title.trim();
      if (typeof content === "string") updateData.content = content;
      if (!isTeam && typeof status === "string" && allowedStatuses.includes(status)) updateData.status = status;
      const contentChanged = typeof content === "string" && content !== doc.content;
      const sourceEnquiry = contentChanged && doc.docType === "SPA" && doc.enquiryRef
        ? await storage.getTradeEnquiryByRef(doc.enquiryRef)
        : null;
      const shouldInvalidateProformaSpaApproval = invalidatesProformaSpaApproval({
        docType: doc.docType,
        enquirySide: sourceEnquiry?.side,
        contentChanged,
      });
      if (shouldInvalidateProformaSpaApproval) {
        updateData.status = "pending_review";
        updateData.adminChecks = buildAdminChecks("SPA");
      }
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
      const mutation = await storage.updateDocumentWithSpaAddendumGuard(
        req.params.id,
        updateData,
        "content",
        doc.docType === "PI"
          ? { expectedStatus: "draft", requireUnsigned: true }
          : shouldInvalidateProformaSpaApproval
            ? { disallowChildDocTypes: ["PI"] }
            : undefined,
      );
      if (!mutation.ok) {
        if (mutation.reason === "not_found") {
          return res.status(404).json({ message: "Document not found" });
        }
        if (mutation.reason === "spa_addendum_number_mismatch") {
          return res.status(409).json({
            message: "The addendum number is fixed and must remain unchanged in the document heading.",
          });
        }
        if (mutation.reason === "child_document_exists") {
          return res.status(409).json({
            message: "This SPA already has a Proforma Invoice. Delete the unsent PI or use a numbered SPA addendum instead of changing the approved SPA.",
          });
        }
        if (doc.docType === "PI" && mutation.reason === "status_conflict") {
          return res.status(409).json({
            message: "The Proforma Invoice was signed or delivered while it was being edited and is now immutable.",
          });
        }
        return res.status(409).json({
          message: "A signed or completed SPA addendum is immutable. Create a new numbered addendum instead.",
        });
      }
      const updated = mutation.document;
      res.json(updated);
    } catch (error: any) {
      res.status(error instanceof LpgStsReviewError ? 409 : 500).json({ message: error.message || "Failed to update document" });
    }
  });

  // A team member proposes an amendment to a document they generated. The
  // proposed content is STAGED (pendingContent) and does not replace the live
  // content until an admin approves it via /review-amendment. This enforces the
  // policy that team members generate freely but every amendment is admin-gated.
  app.post("/api/documents/:id/request-amendment", requireModule(DOC_MODULES), async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (!canManageProformaInvoice({ docType: doc.docType, role: req.session?.role })) {
        return res.status(403).json({ message: "Only an administrator can modify a Proforma Invoice" });
      }
      if (isSpaAddendumContentLocked(doc)) {
        return res.status(409).json({
          message: "A signed or completed SPA addendum cannot be amended. Create a new numbered addendum instead.",
        });
      }
      if (req.session?.role !== "team") {
        return res.status(403).json({ message: "Only team members submit amendment requests; admins edit directly." });
      }
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) {
        return res.status(403).json({ message: "You can only amend documents you created" });
      }
      // A member may amend documents they created, or their OWN NCNDA/ICA
      // agent agreement (they are the subject), even when an admin generated it.
      if (doc.submittedByTeamMemberId !== tmId) {
        const member = await storage.getTeamMemberById(tmId);
        if (!isOwnAgentAgreement(doc, member?.participantId)) {
          return res.status(403).json({ message: "You can only amend documents you created or your own agent agreement" });
        }
      }
      const { content, reason } = req.body;
      if (typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ message: "Amended content is required" });
      }
      if (content.length > 500000) {
        return res.status(400).json({ message: "Amended content is too large" });
      }
      const mutation = await storage.updateDocumentWithSpaAddendumGuard(doc.id, {
        pendingContent: content,
        amendmentReason: typeof reason === "string" ? reason.trim().slice(0, 2000) : null,
        amendmentRequestedBy: tmId,
        amendmentRequestedAt: new Date(),
      }, "content");
      if (!mutation.ok) {
        if (mutation.reason === "not_found") {
          return res.status(404).json({ message: "Document not found" });
        }
        if (mutation.reason === "spa_addendum_number_mismatch") {
          return res.status(409).json({
            message: "The addendum number is fixed and must remain unchanged in the proposed document heading.",
          });
        }
        return res.status(409).json({
          message: "A signed or completed SPA addendum cannot be amended. Create a new numbered addendum instead.",
        });
      }
      const updated = mutation.document;
      // Surface the pending amendment to admins for review.
      try {
        let requestedBy = "A team member";
        const tm = await storage.getTeamMemberById(tmId);
        if (tm?.name) requestedBy = tm.name;
        notify({
          type: "document_amendment_requested",
          title: `${doc.docType} amendment awaiting approval`,
          message: `${requestedBy} proposed changes to ${doc.docType} "${doc.title}" — admin review required`,
          link: "/documents",
          severity: "warning",
          module: "doc-templates",
        });
      } catch {}
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to submit amendment" });
    }
  });

  // Admin reviews a pending amendment. Approving replaces the live content with
  // the staged proposal (and clears any signatures, which no longer match the
  // amended body); rejecting discards the proposal. Either outcome clears the
  // pending-amendment fields.
  app.post("/api/documents/:id/review-amendment", requireAdminAuth, async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (!doc.pendingContent) {
        return res.status(400).json({ message: "No pending amendment on this document" });
      }
      const { decision, notes } = req.body;
      if (decision !== "approve" && decision !== "reject") {
        return res.status(400).json({ message: "decision must be 'approve' or 'reject'" });
      }
      if (decision === "approve" && doc.docType === "PI") {
        return res.status(409).json({
          message: "A Proforma Invoice cannot be replaced through the amendment workflow. Delete an unsent PI and create it again.",
        });
      }
      if (decision === "approve" && isSpaAddendumContentLocked(doc)) {
        return res.status(409).json({
          message: "A signed or completed SPA addendum cannot be replaced. Reject this proposal and create a new numbered addendum.",
        });
      }
      const sourceEnquiry = decision === "approve" && doc.docType === "SPA" && doc.enquiryRef
        ? await storage.getTradeEnquiryByRef(doc.enquiryRef)
        : null;
      const shouldInvalidateProformaSpaApproval = invalidatesProformaSpaApproval({
        docType: doc.docType,
        enquirySide: sourceEnquiry?.side,
        contentChanged: decision === "approve",
      });
      const review = await storage.reviewDocumentAmendmentAtomically(
        doc.id,
        decision,
        typeof notes === "string" && notes.trim()
          ? notes.trim().slice(0, 2000)
          : undefined,
        shouldInvalidateProformaSpaApproval
          ? {
              invalidateAdminReview: true,
              resetAdminChecks: buildAdminChecks("SPA"),
              disallowChildDocTypes: ["PI"],
            }
          : undefined,
      );
      if (!review.ok) {
        if (review.reason === "not_found") {
          return res.status(404).json({ message: "Document not found" });
        }
        if (review.reason === "no_pending_amendment") {
          return res.status(400).json({ message: "No pending amendment on this document" });
        }
        if (review.reason === "spa_addendum_number_mismatch") {
          return res.status(409).json({
            message: "The proposed amendment changes the fixed addendum number and cannot be approved.",
          });
        }
        if (review.reason === "child_document_exists") {
          return res.status(409).json({
            message: "This SPA already has a Proforma Invoice. Reject this amendment and use a numbered SPA addendum instead.",
          });
        }
        return res.status(409).json({
          message: "A signed or completed SPA addendum cannot be replaced. Reject this proposal and create a new numbered addendum.",
        });
      }
      const updated = review.document;
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to review amendment" });
    }
  });

  // Only an admin may delete a generated document.
  app.delete("/api/documents/:id", requireAdminAuth, async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (
        doc.docType === "PI"
        && (doc.status !== "draft" || !!doc.buyerSignature || !!doc.sellerSignature)
      ) {
        return res.status(409).json({
          message: "A signed or delivered Proforma Invoice is an immutable counterparty record and cannot be deleted",
        });
      }
      if (isSpaAddendumContentLocked(doc)) {
        return res.status(409).json({
          message: "A signed or completed SPA addendum is an execution record and cannot be deleted.",
        });
      }
      const deletion = await storage.deleteDocumentWithSpaAddendumGuard(doc.id);
      if (!deletion.ok) {
        if (deletion.reason === "not_found") {
          return res.status(404).json({ message: "Document not found" });
        }
        if (deletion.reason === "proforma_invoice_immutable") {
          return res.status(409).json({
            message: "A signed or delivered Proforma Invoice is an immutable counterparty record and cannot be deleted",
          });
        }
        return res.status(409).json({
          message: "A signed or completed SPA addendum is an execution record and cannot be deleted.",
        });
      }
      for (const p of [deletion.document.docxPath, deletion.document.pdfPath]) {
        if (!p) continue;
        const fullPath = getDocFilePath(p);
        if (fullPath) {
          try { fs.unlinkSync(fullPath); } catch { /* file may already be gone */ }
        }
      }
      res.json({ message: "Document deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to delete document" });
    }
  });

  app.get("/api/documents/:id/download/docx", async (req, res) => {
    try {
      if (!req.session?.authenticated) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const role = req.session.role;
      const isAdmin = role === "admin";
      const isTeam = role === "team";
      const isClient = role === "client";
      if (isTeam && !(await callerHasAnyModule(req, DOC_READ_MODULES))) {
        return res.status(403).json({ message: "Access denied: module not assigned" });
      }
      if (!isAdmin && !isTeam && !isClient) {
        return res.status(403).json({ message: "Access denied" });
      }
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });

      // Download access is admin-any / team-owner-only / client-recipient-only,
      // enforced by the SAME pure gate as the deal-file ZIP endpoint
      // (canDownloadSingleFileDoc === canIncludeDocInZip) so the two paths
      // can never drift apart.
      const tmIdDocx = isTeam ? await getSessionTeamMemberId(req) : null;
      const memberDocx = tmIdDocx ? await storage.getTeamMemberById(tmIdDocx) : null;
      const canDl = canDownloadSingleFileDoc({
        role,
        doc,
        teamMemberId: tmIdDocx,
        teamParticipantId: memberDocx?.participantId ?? null,
        clientKycId: req.session.clientKycId ?? null,
      });
      if (!canDl) {
        return res.status(isClient ? 403 : 404).json({ message: isClient ? "Access denied" : "Document not found" });
      }

      if (!doc.content) return res.status(404).json({ message: "Document content not available" });
      const hasSigDocx = hasDocumentSignature(doc);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      const submittedByLabel = await getDocSubmittedByLabel(doc.submittedByTeamMemberId);
      if (hasSigDocx) {
        const result = await regenerateWithSignatures(
          doc.id, doc.title, doc.content,
          doc.buyerSignature || undefined, doc.sellerSignature || undefined,
          doc.buyerSignedName || undefined, doc.sellerSignedName || undefined,
          doc.buyerSignedAt ? new Date(doc.buyerSignedAt) : undefined,
          doc.sellerSignedAt ? new Date(doc.sellerSignedAt) : undefined,
          doc.docType,
          submittedByLabel,
          doc.buyerSignedIp || undefined,
          doc.sellerSignedIp || undefined,
          (doc as any).agentCode || undefined,
          (doc as any).teamMemberCode || undefined,
        );
        const filePath = getDocFilePath(result.docxPath);
        if (!filePath) return res.status(500).json({ message: "Failed to generate DOCX file" });
        res.setHeader("Content-Disposition", `attachment; filename="${doc.docType}_${doc.title.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_")}.docx"`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        return res.sendFile(filePath);
      }
      const docxPath = await generateDocx(doc.id, doc.title, doc.content, submittedByLabel, (doc as any).agentCode || undefined, (doc as any).teamMemberCode || undefined, doc.docType);
      await storage.updateDocument(doc.id, { docxPath });
      const filePath = getDocFilePath(docxPath);
      if (!filePath) return res.status(500).json({ message: "Failed to generate DOCX file" });
      res.setHeader("Content-Disposition", `attachment; filename="${doc.docType}_${doc.title.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_")}.docx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.sendFile(filePath);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to download DOCX" });
    }
  });

  app.get("/api/documents/:id/download/pdf", async (req, res) => {
    try {
      if (!req.session?.authenticated) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const rolePdf = req.session.role;
      const isAdminPdf = rolePdf === "admin";
      const isTeamPdf = rolePdf === "team";
      const isClientPdf = rolePdf === "client";
      if (isTeamPdf && !(await callerHasAnyModule(req, DOC_READ_MODULES))) {
        return res.status(403).json({ message: "Access denied: module not assigned" });
      }
      if (!isAdminPdf && !isTeamPdf && !isClientPdf) {
        return res.status(403).json({ message: "Access denied" });
      }
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });

      // Download access is admin-any / team-owner-only / client-recipient-only,
      // enforced by the SAME pure gate as the deal-file ZIP endpoint
      // (canDownloadSingleFileDoc === canIncludeDocInZip) so the two paths
      // can never drift apart.
      const tmIdPdf = isTeamPdf ? await getSessionTeamMemberId(req) : null;
      const memberPdf = tmIdPdf ? await storage.getTeamMemberById(tmIdPdf) : null;
      const canDlPdf = canDownloadSingleFileDoc({
        role: rolePdf,
        doc,
        teamMemberId: tmIdPdf,
        teamParticipantId: memberPdf?.participantId ?? null,
        clientKycId: req.session.clientKycId ?? null,
      });
      if (!canDlPdf) {
        return res.status(isClientPdf ? 403 : 404).json({ message: isClientPdf ? "Access denied" : "Document not found" });
      }

      if (!doc.content) return res.status(404).json({ message: "Document content not available" });
      const hasSigPdf = hasDocumentSignature(doc);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      const submittedByLabelPdf = await getDocSubmittedByLabel(doc.submittedByTeamMemberId);
      if (hasSigPdf) {
        const result = await regenerateWithSignatures(
          doc.id, doc.title, doc.content,
          doc.buyerSignature || undefined, doc.sellerSignature || undefined,
          doc.buyerSignedName || undefined, doc.sellerSignedName || undefined,
          doc.buyerSignedAt ? new Date(doc.buyerSignedAt) : undefined,
          doc.sellerSignedAt ? new Date(doc.sellerSignedAt) : undefined,
          doc.docType,
          submittedByLabelPdf,
          doc.buyerSignedIp || undefined,
          doc.sellerSignedIp || undefined,
          (doc as any).agentCode || undefined,
          (doc as any).teamMemberCode || undefined,
        );
        const filePath = getDocFilePath(result.pdfPath);
        if (!filePath) return res.status(500).json({ message: "Failed to generate PDF file" });
        res.setHeader("Content-Disposition", `attachment; filename="${doc.docType}_${doc.title.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_")}.pdf"`);
        res.setHeader("Content-Type", "application/pdf");
        return res.sendFile(filePath);
      }
      const pdfPath = await generatePdf(doc.id, doc.title, doc.content, submittedByLabelPdf, (doc as any).agentCode || undefined, (doc as any).teamMemberCode || undefined, doc.docType);
      await storage.updateDocument(doc.id, { pdfPath });
      const filePath = getDocFilePath(pdfPath);
      if (!filePath) return res.status(500).json({ message: "Failed to generate PDF file" });
      res.setHeader("Content-Disposition", `attachment; filename="${doc.docType}_${doc.title.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_")}.pdf"`);
      res.setHeader("Content-Type", "application/pdf");
      res.sendFile(filePath);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to download PDF" });
    }
  });

  // Download a whole deal file (all documents in a reference block) as one ZIP.
  // The client sends the block's document ids; access is enforced per document
  // with the SAME rules as the single-file download routes (canDownloadDocument):
  // admin gets everything, team members only their own documents (plus their own
  // NCNDA/ICA agent agreement), clients only documents sent to them. Documents
  // the caller may not download are silently skipped — a team member zipping a
  // shared block simply gets their own subset.
  // Files are ALWAYS regenerated from stored DB content — the generated_docs
  // directory is an ephemeral cache and must never be trusted.
  app.post("/api/documents/download-zip", async (req, res) => {
    try {
      if (!req.session?.authenticated) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const role = req.session.role;
      const isAdmin = role === "admin";
      const isTeam = role === "team";
      const isClient = role === "client";
      if (isTeam && !(await callerHasAnyModule(req, DOC_READ_MODULES))) {
        return res.status(403).json({ message: "Access denied: module not assigned" });
      }
      if (!isAdmin && !isTeam && !isClient) {
        return res.status(403).json({ message: "Access denied" });
      }

      const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
      const ids: string[] = Array.from(new Set(rawIds.filter((x: any) => typeof x === "string" && x.trim()))).slice(0, 100) as string[];
      if (!ids.length) return res.status(400).json({ message: "No documents specified" });

      const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_").slice(0, 80) || "document";
      const zipName = sanitize(typeof req.body?.name === "string" ? req.body.name : "deal-file");

      const tmIdZip = isTeam ? await getSessionTeamMemberId(req) : null;
      const memberZip = tmIdZip ? await storage.getTeamMemberById(tmIdZip) : null;

      // Resolve each requested document, apply per-document access rules, and
      // regenerate its files from stored content BEFORE streaming the ZIP so
      // failures can still return a clean JSON error.
      const entries: Array<{ name: string; fullPath: string }> = [];
      const usedNames = new Set<string>();
      const uniqueName = (base: string, ext: string) => {
        let candidate = `${base}.${ext}`;
        let n = 2;
        while (usedNames.has(candidate)) candidate = `${base}_${n++}.${ext}`;
        usedNames.add(candidate);
        return candidate;
      };
      let anyAuthorized = false;
      const failures: string[] = [];

      // Phase 1 (sequential, cheap): resolve documents and apply per-document
      // access rules. Collect only the docs the caller may download.
      const authorizedDocs: Document[] = [];
      for (const id of ids) {
        const doc = await storage.getDocumentById(id);
        if (!doc) continue;

        const canDl = canIncludeDocInZip({
          role,
          doc,
          teamMemberId: tmIdZip,
          teamParticipantId: memberZip?.participantId,
          clientKycId: req.session.clientKycId ?? null,
        });
        if (!canDl) continue;
        anyAuthorized = true;
        if (!doc.content) { failures.push(doc.title); continue; }
        authorizedDocs.push(doc);
      }

      // Phase 2 (bounded parallel): regenerate DOCX/PDF for each authorized doc,
      // at most ZIP_GEN_CONCURRENCY at a time. Signed docs run the heavier
      // regenerateWithSignatures path, so serial generation on a 15+ document
      // deal could take long enough to hit proxy timeouts. Results are kept in
      // request order so ZIP entry names stay deterministic.
      const ZIP_GEN_CONCURRENCY = 3;
      type GenResult = { doc: Document; pdfFull: string | null; docxFull: string | null } | { doc: Document; failed: true };
      const results: GenResult[] = new Array(authorizedDocs.length);
      let nextIdx = 0;
      const generateOne = async (doc: Document): Promise<GenResult> => {
        try {
          const submittedByLabel = await getDocSubmittedByLabel(doc.submittedByTeamMemberId);
          const hasSig = hasDocumentSignature(doc);
          let docxRel: string | undefined;
          let pdfRel: string | undefined;
          if (hasSig) {
            const result = await regenerateWithSignatures(
              doc.id, doc.title, doc.content!,
              doc.buyerSignature || undefined, doc.sellerSignature || undefined,
              doc.buyerSignedName || undefined, doc.sellerSignedName || undefined,
              doc.buyerSignedAt ? new Date(doc.buyerSignedAt) : undefined,
              doc.sellerSignedAt ? new Date(doc.sellerSignedAt) : undefined,
              doc.docType,
              submittedByLabel,
              doc.buyerSignedIp || undefined,
              doc.sellerSignedIp || undefined,
              (doc as any).agentCode || undefined,
              (doc as any).teamMemberCode || undefined,
            );
            docxRel = result.docxPath;
            pdfRel = result.pdfPath;
          } else {
            docxRel = await generateDocx(doc.id, doc.title, doc.content!, submittedByLabel, (doc as any).agentCode || undefined, (doc as any).teamMemberCode || undefined, doc.docType);
            pdfRel = await generatePdf(doc.id, doc.title, doc.content!, submittedByLabel, (doc as any).agentCode || undefined, (doc as any).teamMemberCode || undefined, doc.docType);
            await storage.updateDocument(doc.id, { docxPath: docxRel, pdfPath: pdfRel });
          }
          return {
            doc,
            pdfFull: pdfRel ? getDocFilePath(pdfRel) : null,
            docxFull: docxRel ? getDocFilePath(docxRel) : null,
          };
        } catch (err: any) {
          console.error(`[docs] ZIP file regeneration failed for ${doc.docType} ${doc.id}:`, err?.message || err);
          return { doc, failed: true };
        }
      };
      const worker = async () => {
        while (nextIdx < authorizedDocs.length) {
          const idx = nextIdx++;
          results[idx] = await generateOne(authorizedDocs[idx]);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(ZIP_GEN_CONCURRENCY, authorizedDocs.length) }, () => worker()),
      );

      // Phase 3 (sequential): assign ZIP entry names in request order so
      // duplicate-name suffixes (_2, _3, ...) are deterministic.
      for (const r of results) {
        if (!r) continue;
        if ("failed" in r) { failures.push(r.doc.title); continue; }
        const base = sanitize(`${r.doc.docType}_${r.doc.title}`);
        if (r.pdfFull) entries.push({ name: uniqueName(base, "pdf"), fullPath: r.pdfFull });
        if (r.docxFull) entries.push({ name: uniqueName(base, "docx"), fullPath: r.docxFull });
        if (!r.pdfFull && !r.docxFull) failures.push(r.doc.title);
      }

      if (!anyAuthorized) {
        const denial = zipAllUnauthorizedResponse(role);
        return res.status(denial.status).json({ message: denial.message });
      }
      if (!entries.length) {
        return res.status(500).json({ message: `Could not generate any files for this deal${failures.length ? ` (failed: ${failures.join(", ")})` : ""}` });
      }

      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipName}.zip"`);

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", (err: any) => {
        console.error("[docs] ZIP stream error:", err?.message || err);
        res.destroy();
      });
      archive.pipe(res);
      for (const e of entries) {
        archive.file(e.fullPath, { name: e.name });
      }
      await archive.finalize();
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).json({ message: error.message || "Failed to build ZIP" });
      } else {
        res.destroy();
      }
    }
  });

  app.post("/api/documents/:id/convert-pdf", requireModule(DOC_MODULES), async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (requiresProformaPortalDelivery(doc.docType)) {
        return res.status(400).json({
          message: "Send the Proforma Invoice through its linked client-portal workflow to generate and deliver the signed PDF",
        });
      }

      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId || doc.submittedByTeamMemberId !== tmId) {
          return res.status(403).json({ message: "You can only convert documents you created" });
        }
      }

      const finalization = await finalizeDocumentWithSignatures(doc);
      if (!finalization.ok) {
        return res.status(finalization.status).json({ message: finalization.message });
      }
      const updated = finalization.doc;
      const finalPdfPath = updated.pdfPath!;

      const buyerEmail = doc.buyerEmail;
      const sellerEmail = doc.sellerEmail;
      if (buyerEmail) {
        sendDocumentEmail(buyerEmail, doc.buyerSignedName || "Buyer", doc.docType, doc.title, "Buyer", finalPdfPath)
          .catch(err => console.error("[docs] Failed to email buyer:", err));
      }
      if (sellerEmail) {
        sendDocumentEmail(sellerEmail, "Seller", doc.docType, doc.title, "Seller", finalPdfPath)
          .catch(err => console.error("[docs] Failed to email seller:", err));
      }

      res.json(updated);
    } catch (error: any) {
      res.status(error instanceof LpgStsReviewError ? 409 : 500).json({ message: error.message || "Failed to convert to PDF" });
    }
  });

  app.get("/api/documents/:id/lpg-sts-review", requireAdminAuth, async (req, res) => {
    try {
      const before = req.query.before;
      if (before !== undefined && (typeof before !== "string" || !/^\d+$/.test(before) || !Number.isSafeInteger(Number(before)))) {
        return res.status(400).json({ message: "Invalid history cursor" });
      }
      const page = await storage.getLpgStsReviewPage(req.params.id, before === undefined ? undefined : Number(before));
      if (!page) return res.status(404).json({ message: "Document not found" });
      res.json(page);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/documents/:id/lpg-sts-review", requireAdminAuth, async (req, res) => {
    try {
      const { expectedContent, expectedFingerprint, points } = req.body;
      if (typeof expectedContent !== "string" || typeof expectedFingerprint !== "string"
        || !/^[a-f0-9]{64}$/.test(expectedFingerprint) || !validateLpgStsReviewPoints(points)) {
        return res.status(400).json({ message: "Provide the saved SPA content, its current review fingerprint, and a decision with explanation for every LPG review point." });
      }
      const doc = await storage.clearLpgStsReview(req.params.id, expectedContent, points, req.session.username || "admin", expectedFingerprint);
      res.json(lpgStsReviewPage(doc));
    } catch (err: any) {
      res.status(err instanceof LpgStsReviewError ? 409 : 500).json({ message: err.message });
    }
  });

  app.patch("/api/documents/:id/admin-review", requireAdminAuth, async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (doc.docType === "PI") {
        return res.status(409).json({
          message: "A Proforma Invoice does not use the generic administrator review workflow",
        });
      }
      const { adminChecks, adminReviewNotes, action } = req.body;
      if (action === "approve" && !hasCompletedAdminChecklist(doc.docType, Array.isArray(adminChecks) ? adminChecks : doc.adminChecks)) {
        return res.status(400).json({ message: "Complete every administrator review check before approval" });
      }
      if ((action === "approve" || action === "reject") && isSpaAddendumContentLocked(doc)) {
        return res.status(409).json({
          message: "A signed or completed SPA addendum cannot return to an approval state.",
        });
      }
      const updateData: Record<string, any> = {};
      if (Array.isArray(adminChecks)) updateData.adminChecks = adminChecks;
      if (typeof adminReviewNotes === "string") updateData.adminReviewNotes = adminReviewNotes;
      if (action === "approve") {
        updateData.status = "draft";
      } else if (action === "reject") {
        updateData.status = "rejected";
      }
      const reviewMutation = await storage.updateDocumentWithSpaAddendumGuard(
        req.params.id,
        updateData,
        "content",
        {
          expectedContent: doc.content,
          ...(doc.docType === "SPA" ? { disallowChildDocTypes: ["PI"] } : {}),
        },
      );
      if (!reviewMutation.ok) {
        if (reviewMutation.reason === "not_found") {
          return res.status(404).json({ message: "Document not found" });
        }
        if (reviewMutation.reason === "status_conflict") {
          return res.status(409).json({
            message: "The document changed while it was being reviewed. Reopen it and review the latest content.",
          });
        }
        if (reviewMutation.reason === "child_document_exists") {
          return res.status(409).json({
            message: "This SPA already has a Proforma Invoice, so its approved review record is locked. Use a numbered SPA addendum for later changes.",
          });
        }
        return res.status(409).json({
          message: "A signed or completed SPA addendum cannot return to an approval state.",
        });
      }
      const updated = reviewMutation.document;

      // Notify the team member who prepared the document of the admin's decision
      // so they know the approved document is now available in their portal (or
      // that it was returned for amendment).
      if ((action === "approve" || action === "reject") && doc.submittedByTeamMemberId) {
        try {
          const tm = await storage.getTeamMemberById(doc.submittedByTeamMemberId);
          if (tm?.email) {
            sendDocumentReviewDecisionEmail(
              tm.email,
              tm.name,
              doc.docType,
              doc.title,
              action === "approve",
              typeof adminReviewNotes === "string" ? adminReviewNotes : undefined,
            ).catch(() => {});
          }
        } catch (notifyErr: any) {
          console.error("[admin-review] team notification failed:", notifyErr?.message);
        }
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update admin review" });
    }
  });

  app.post("/api/documents/:id/sign", requireModule(DOC_MODULES), async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (!lpgStsReviewState(doc).cleared) {
        return res.status(409).json({ message: "LPG STS SPA requires transaction-specific administrator clearance of every review point before signing." });
      }
      if (!canManageProformaInvoice({ docType: doc.docType, role: req.session?.role })) {
        return res.status(403).json({ message: "Only an administrator can sign a Proforma Invoice" });
      }
      if (doc.docType === "PI" && (doc.status !== "draft" || !!doc.buyerSignature || !!doc.sellerSignature)) {
        return res.status(409).json({
          message: "The Proforma Invoice issuer signature is final and cannot be replaced",
        });
      }
      if (isSpaAddendumExecuted(doc)) {
        return res.status(409).json({
          message: "This SPA addendum has been executed and its signatures are immutable.",
        });
      }

      let teamSignPartyRestriction: string | null = null;
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId || doc.submittedByTeamMemberId !== tmId) {
          return res.status(403).json({ message: "You can only sign documents you created" });
        }
        // Once a document has been sent or accepted, team members may no longer
        // add or modify signatures — only admins can.
        if (["sent", "accepted", "rejected"].includes(doc.status)) {
          return res.status(403).json({ message: "Signatures cannot be modified after the document has been sent" });
        }
        // A document awaiting admin approval cannot be signed by the team member.
        if (doc.status === "pending_review") {
          return res.status(403).json({ message: "This document is awaiting admin approval. You can sign and send it once an admin approves it." });
        }
        // Determine which party side the team member is authorised to sign.
        // A team member may only place their own side's signature: if the linked
        // enquiry is a buy-side enquiry they may sign as buyer; sell-side → seller.
        // Fail closed: if the linked enquiry cannot be resolved (lookup error or
        // not found), block the action rather than allowing unrestricted signing.
        // This side-based restriction only applies to genuine two-party documents
        // (NCNDA and SPA addenda). Single-signer trade documents (LOI/FCO/SCO/...) always store
        // the single issuer signature in the buyer slot regardless of which
        // real-world party issues them (see documentFileGenerator), so a
        // side-based restriction would wrongly block e.g. a sell-side member
        // signing an FCO (a seller-issued offer). Ownership is enforced above.
        if (doc.enquiryRef && (doc.docType === "NCNDA" || doc.docType === "ADDENDUM")) {
          let lookupSucceeded = false;
          try {
            const allEnq = await storage.getTradeEnquiriesForTeamMember(tmId);
            const linkedEnq = allEnq.find((e) => e.enquiryRef === doc.enquiryRef);
            if (linkedEnq) {
              teamSignPartyRestriction = linkedEnq.side === "buy" ? "buyer" : "seller";
              lookupSucceeded = true;
            }
          } catch {
            // lookup threw — fall through to the 403 below
          }
          if (!lookupSucceeded) {
            return res.status(403).json({ message: "Cannot determine your signing authority for this document" });
          }
        }
      }

      if (doc.status === "pending_review") {
        return res.status(400).json({ message: "Document must be approved by admin before signing." });
      }
      const { party, signature, name } = req.body;
      if (!party || !["buyer", "seller"].includes(party)) {
        return res.status(400).json({ message: "Party must be 'buyer' or 'seller'" });
      }
      if (doc.docType === "PI" && party !== "buyer") {
        return res.status(400).json({
          message: "The Proforma Invoice Seller / Issuer signature must use the issuer signature slot",
        });
      }
      if (!signature || !signature.startsWith("data:image/")) {
        return res.status(400).json({ message: "Invalid signature data" });
      }
      if (!name || !name.trim()) {
        return res.status(400).json({ message: "Signer name is required" });
      }
      // Enforce party-side restriction for team members: they may only sign as
      // the side that matches their enquiry's side field.
      if (teamSignPartyRestriction && party !== teamSignPartyRestriction) {
        return res.status(403).json({
          message: `You may only sign as the ${teamSignPartyRestriction} side on this document`,
        });
      }
      const now = new Date();
      const fwd = (req.headers["x-forwarded-for"] as string | undefined) || "";
      const clientIp = (fwd.split(",")[0] || "").trim() || req.ip || (req.socket?.remoteAddress ?? "") || "unknown";
      const updateData: Record<string, any> = {};
      if (party === "buyer") {
        updateData.buyerSignature = signature;
        updateData.buyerSignedAt = now;
        updateData.buyerSignedName = name.trim();
        updateData.buyerSignedIp = clientIp;
      } else {
        updateData.sellerSignature = signature;
        updateData.sellerSignedAt = now;
        updateData.sellerSignedName = name.trim();
        updateData.sellerSignedIp = clientIp;
      }
      const signMutation = await storage.updateDocumentWithSpaAddendumGuard(
        req.params.id,
        updateData,
        "execution",
        doc.docType === "PI"
          ? {
              expectedContent: doc.content,
              expectedStatus: "draft",
              requireUnsigned: true,
            }
          : {
              ...(isLpgStsSpa(doc) ? { expectedContent: doc.content } : {}),
              disallowedStatuses: req.session?.role === "team"
                ? ["sent", "accepted", "rejected", "pending_review"]
                : ["pending_review"],
            },
      );
      if (!signMutation.ok) {
        if (signMutation.reason === "not_found") {
          return res.status(404).json({ message: "Document not found" });
        }
        if (signMutation.reason === "status_conflict") {
          if (doc.docType === "PI") {
            return res.status(409).json({
              message: "The Proforma Invoice changed or was signed while this signature was being applied. Reopen the latest document.",
            });
          }
          if (req.session?.role === "team") {
            return res.status(403).json({
              message: signMutation.document?.status === "pending_review"
                ? "This document is awaiting admin approval. You can sign and send it once an admin approves it."
                : "Signatures cannot be modified after the document has been sent",
            });
          }
          return res.status(400).json({ message: "Document must be approved by admin before signing." });
        }
        return res.status(409).json({
          message: "This SPA addendum has been executed and its signatures are immutable.",
        });
      }
      const updated = signMutation.document;

      if (updated.content) {
        // Alerts admins in-app on failure (on-disk files would no longer
        // reflect the latest signature); never fails the signing request.
        await runFileGenerationOrNotify(updated, "signature_regenerate", async () => {
          const { regenerateWithSignatures } = await import("./documentFileGenerator");
          const submittedByLabelSign = await getDocSubmittedByLabel(updated.submittedByTeamMemberId);
          await regenerateWithSignatures(
            updated.id,
            updated.title,
            updated.content!,
            updated.buyerSignature || undefined,
            updated.sellerSignature || undefined,
            updated.buyerSignedName || undefined,
            updated.sellerSignedName || undefined,
            updated.buyerSignedAt ? new Date(updated.buyerSignedAt) : undefined,
            updated.sellerSignedAt ? new Date(updated.sellerSignedAt) : undefined,
            updated.docType,
            submittedByLabelSign,
            updated.buyerSignedIp || undefined,
            updated.sellerSignedIp || undefined,
            (updated as any).agentCode || undefined,
            (updated as any).teamMemberCode || undefined,
          );
        });
      }

      // Automatic document chaining, driven by signatures: FCO signed →
      // Deal Recap prepared; Deal Recap signed → SPA generated; SPA signed →
      // TFR generated. A signature from EITHER the buyer or the seller is
      // sufficient at every step. Guarded against duplicates (one auto child
      // per parent per type) and never fails the signing request itself.
      let autoCreatedDoc: any = null;
      const autoCreatedDocs: any[] = [];
      // A signed SPA fans out to the bank drafts: the DLC/LC draft (MT700),
      // then the Performance Guarantee draft (MT760) — each created at most
      // once per parent (atomic per type). The TFR is NOT part of this chain:
      // it is only prepared via the Deal Pipeline after deal matching.
      const AUTO_SIGN_CHAIN: Record<string, string[]> = {
        FCO: ["DEAL_RECAP"],
        DEAL_RECAP: ["SPA"],
        SPA: ["DLC_MT700", "PBG_MT760"],
      };
      const autoNextTypes = AUTO_SIGN_CHAIN[updated.docType] || [];
      if (autoNextTypes.length && (updated.buyerSignature || updated.sellerSignature)) {
        const isAdminCaller = !req.session?.role || req.session.role === "admin";
        for (const autoNextType of autoNextTypes) {
          try {
            // Atomic create: returns null if a child of this type already exists
            // (including one created by a concurrent sign request).
            const createdChild = await deriveNextDocument(updated, autoNextType, isAdminCaller, true);
            if (createdChild) {
              autoCreatedDocs.push(createdChild);
              console.log(`[docs] Auto-created ${autoNextType} ${createdChild.id} from signed ${updated.docType} ${updated.id}`);
            }
          } catch (chainErr: any) {
            console.error(`[docs] Auto-chain ${updated.docType} -> ${autoNextType} failed:`, chainErr?.message || chainErr);
            // Alert admins in-app: a bank-draft/child document is missing and
            // must be created manually. Never fails the signing request.
            await notify(buildAutoChainFailureNotification(updated, autoNextType, chainErr?.message));
          }
        }
        autoCreatedDoc = autoCreatedDocs[0] || null;
      }

      res.json({ ...updated, autoCreatedDoc, autoCreatedDocs });
    } catch (error: any) {
      res.status(error instanceof LpgStsReviewError ? 409 : 500).json({ message: error.message || "Failed to sign document" });
    }
  });

  app.delete("/api/documents/:id/sign/:party", requireModule(DOC_MODULES), async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (!canManageProformaInvoice({ docType: doc.docType, role: req.session?.role })) {
        return res.status(403).json({ message: "Only an administrator can change a Proforma Invoice signature" });
      }
      if (doc.docType === "PI") {
        return res.status(409).json({
          message: "The Proforma Invoice issuer signature is final and cannot be removed",
        });
      }
      if (isSpaAddendumExecuted(doc)) {
        return res.status(409).json({
          message: "This SPA addendum has been executed and its signatures cannot be removed.",
        });
      }

      let teamUnsignPartyRestriction: string | null = null;
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId || doc.submittedByTeamMemberId !== tmId) {
          return res.status(403).json({ message: "You can only remove signatures from documents you created" });
        }
        // Block signature removal once the document has been sent or accepted —
        // only admins may alter signatures at that point.
        if (["sent", "accepted", "rejected"].includes(doc.status)) {
          return res.status(403).json({ message: "Signatures cannot be modified after the document has been sent" });
        }
        // A document awaiting admin approval cannot have signatures modified.
        if (doc.status === "pending_review") {
          return res.status(403).json({ message: "This document is awaiting admin approval." });
        }
        // Restrict removal to the team member's own side.
        // Fail closed: if the linked enquiry cannot be resolved, block the action.
        // Only genuine two-party documents (NCNDA) carry a side restriction;
        // single-signer docs store the issuer signature in the buyer slot (see
        // the sign route above), so a side-based restriction does not apply.
        if (doc.enquiryRef && (doc.docType === "NCNDA" || doc.docType === "ADDENDUM")) {
          let lookupSucceeded = false;
          try {
            const allEnq = await storage.getTradeEnquiriesForTeamMember(tmId);
            const linkedEnq = allEnq.find((e) => e.enquiryRef === doc.enquiryRef);
            if (linkedEnq) {
              teamUnsignPartyRestriction = linkedEnq.side === "buy" ? "buyer" : "seller";
              lookupSucceeded = true;
            }
          } catch {
            // lookup threw — fall through to 403 below
          }
          if (!lookupSucceeded) {
            return res.status(403).json({ message: "Cannot determine your signing authority for this document" });
          }
        }
      }

      const { party } = req.params;
      if (!["buyer", "seller"].includes(party)) {
        return res.status(400).json({ message: "Party must be 'buyer' or 'seller'" });
      }
      if (teamUnsignPartyRestriction && party !== teamUnsignPartyRestriction) {
        return res.status(403).json({
          message: `You may only remove the ${teamUnsignPartyRestriction} side signature on this document`,
        });
      }
      const updateData: Record<string, any> = {};
      if (party === "buyer") {
        updateData.buyerSignature = null;
        updateData.buyerSignedAt = null;
        updateData.buyerSignedName = null;
        updateData.buyerSignedIp = null;
      } else {
        updateData.sellerSignature = null;
        updateData.sellerSignedAt = null;
        updateData.sellerSignedName = null;
        updateData.sellerSignedIp = null;
      }
      const unsignMutation = await storage.updateDocumentWithSpaAddendumGuard(
        req.params.id,
        updateData,
        "execution",
        req.session?.role === "team"
          ? { disallowedStatuses: ["sent", "accepted", "rejected", "pending_review"] }
          : undefined,
      );
      if (!unsignMutation.ok) {
        if (unsignMutation.reason === "not_found") {
          return res.status(404).json({ message: "Document not found" });
        }
        if (unsignMutation.reason === "status_conflict") {
          return res.status(403).json({
            message: unsignMutation.document?.status === "pending_review"
              ? "This document is awaiting admin approval."
              : "Signatures cannot be modified after the document has been sent",
          });
        }
        return res.status(409).json({
          message: "This SPA addendum has been executed and its signatures cannot be removed.",
        });
      }
      const updated = unsignMutation.document;

      if (updated.content) {
        // Alerts admins in-app on failure (the on-disk files would still show
        // the removed signature); never fails the unsign request itself.
        await runFileGenerationOrNotify(updated, "signature_regenerate", async () => {
          const { regenerateWithSignatures } = await import("./documentFileGenerator");
          const submittedByLabelUnsign = await getDocSubmittedByLabel(updated.submittedByTeamMemberId);
          await regenerateWithSignatures(
            updated.id,
            updated.title,
            updated.content!,
            updated.buyerSignature || undefined,
            updated.sellerSignature || undefined,
            updated.buyerSignedName || undefined,
            updated.sellerSignedName || undefined,
            updated.buyerSignedAt ? new Date(updated.buyerSignedAt) : undefined,
            updated.sellerSignedAt ? new Date(updated.sellerSignedAt) : undefined,
            updated.docType,
            submittedByLabelUnsign,
            updated.buyerSignedIp || undefined,
            updated.sellerSignedIp || undefined,
            (updated as any).agentCode || undefined,
            (updated as any).teamMemberCode || undefined,
          );
        });
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to remove signature" });
    }
  });

  app.post("/api/documents/:id/send", requireModule(DOC_MODULES), async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (!canManageProformaInvoice({ docType: doc.docType, role: req.session?.role })) {
        return res.status(403).json({ message: "Only an administrator can send a Proforma Invoice to its linked client portal" });
      }
      if (doc.docType === "PI" && doc.status !== "draft") {
        return res.status(409).json({
          message: "The Proforma Invoice has already entered the recipient acceptance workflow",
        });
      }
      const piSourceEnquiry = doc.docType === "PI" && doc.enquiryRef
        ? await storage.getTradeEnquiryByRef(doc.enquiryRef)
        : null;
      const piEnquirySide = piSourceEnquiry?.side ?? null;
      const piRecipientRole = piEnquirySide === "sell" ? "Buyer" : "Seller";
      const piRecipientLabel = piEnquirySide === "sell" ? "Buyer" : "Supplier";

      // Per-document ownership decision goes through the SAME pure gate as the
      // single-file download and deal-file ZIP routes
      // (canSendDocViaEmail === canDownloadSingleFileDoc === canIncludeDocInZip):
      // if the caller cannot download this document, they cannot email it out.
      const roleSend = req.session?.role;
      const tmIdSend = roleSend === "team" ? await getSessionTeamMemberId(req) : null;
      const memberSend = tmIdSend ? await storage.getTeamMemberById(tmIdSend) : null;
      const canSend = canSendDocViaEmail({
        role: roleSend,
        doc,
        teamMemberId: tmIdSend,
        teamParticipantId: memberSend?.participantId ?? null,
        clientKycId: req.session?.clientKycId ?? null,
      });
      if (!canSend) {
        return res.status(403).json({ message: "You can only send documents you created" });
      }

      const isTeamCaller = req.session?.role === "team";
      const allowedSendStatuses = isTeamCaller ? ["draft", "final"] : ["draft", "final", "rejected"];
      if (!allowedSendStatuses.includes(doc.status)) {
        return res.status(400).json({ message: `Cannot send document in '${doc.status}' state. Must be admin-approved before sending.` });
      }

      const isNcnda = doc.docType === "NCNDA";
      const hasSig = hasRequiredDocumentSignatures(doc);
      if (!hasSig) {
        return res.status(400).json({
          message: doc.docType === "ADDENDUM"
            ? "SPA addendum must be signed by both Seller and Buyer before sending"
            : isNcnda
              ? "NCNDA must be signed by Party A (Issuer) before sending"
              : "Document must be signed before sending",
        });
      }

      const { recipientEmail, clientId, ccEmail, message, attachDocIds } = req.body;
      if (!recipientEmail) {
        return res.status(400).json({ message: "Recipient email is required" });
      }
      const customMessage = typeof message === "string" ? message.trim().slice(0, 5000) : "";
      const selectedClientKyc = clientId ? await storage.getKycApplicationById(clientId) : null;
      const piRecipientCheck = validateProformaInvoiceRecipient({
        docType: doc.docType,
        enquirySide: piEnquirySide,
        recipientEmail,
        buyerEmail: doc.buyerEmail,
        sellerEmail: doc.sellerEmail,
        clientId,
        clientStatus: selectedClientKyc?.status,
        clientEmails: selectedClientKyc ? [selectedClientKyc.contactEmail, selectedClientKyc.signatoryEmail] : [],
      });
      if (!piRecipientCheck.ok) {
        return res.status(422).json({ message: piRecipientCheck.reason });
      }

      // Validate extra bank-draft attachments BEFORE the document is marked
      // sent, so an invalid attachment id fails the whole request cleanly.
      let extraPdfDocs: { docType: string; docTitle: string; pdfFilePath: string }[] = [];
      try {
        extraPdfDocs = await resolveEmailAttachmentDocs(doc, attachDocIds, {
          role: roleSend,
          teamMemberId: tmIdSend,
          teamParticipantId: memberSend?.participantId ?? null,
          clientKycId: req.session?.clientKycId ?? null,
        });
      } catch (attachErr: any) {
        return res.status(400).json({ message: attachErr?.message || "Invalid extra attachments" });
      }

      // Both admins and team members may link a document (NCNDA, ICA, or any
      // other type) to an approved client's portal account, validated by the
      // pure validateClientLink gate (approved status + party-email binding +
      // team notification-email binding).
      if (clientId) {
        const clientKyc = selectedClientKyc;
        if (!clientKyc) {
          return res.status(422).json({ message: "Selected client record not found" });
        }
        const linkCheck = validateClientLink({
          role: req.session?.role,
          clientStatus: clientKyc.status,
          clientEmails: [clientKyc.contactEmail, clientKyc.signatoryEmail],
          docPartyEmails: [doc.buyerEmail, doc.sellerEmail],
          recipientEmail,
        });
        if (!linkCheck.ok) {
          return res.status(422).json({ message: linkCheck.reason });
        }
      }

      const sendUpdate = {
        sentTo: recipientEmail,
        sentToClientId: clientId || null,
        recipientResponse: "pending",
        recipientAmendmentNotes: null,
        status: "sent",
      };
      let updated;
      if (doc.docType === "PI") {
        const sendMutation = await storage.updateDocumentWithSpaAddendumGuard(
          doc.id,
          sendUpdate,
          "execution",
          {
            expectedContent: doc.content,
            expectedStatus: "draft",
            expectedBuyerSignature: doc.buyerSignature,
          },
        );
        if (!sendMutation.ok) {
          return res.status(409).json({
            message: "The Proforma Invoice changed while client-portal delivery was being prepared. Reopen the latest document.",
          });
        }
        updated = sendMutation.document;
      } else {
        updated = await storage.updateDocument(doc.id, sendUpdate);
      }

      if (recipientEmail) {
        const recipientRole = (isNcnda ? "Party B" : doc.docType === "PI" ? piRecipientRole : "Buyer") as any;
        const sendWithAttachment = async () => {
          try {
            const { regenerateWithSignatures } = await import("./documentFileGenerator");
            const submittedByLabelSend = await getDocSubmittedByLabel(doc.submittedByTeamMemberId);
            // If sentToClientId is set and doc has no agentCode yet, resolve now.
            let effectiveAgentCode = (doc as any).agentCode || null;
            if (!effectiveAgentCode) {
              effectiveAgentCode = await resolveAgentCode({
                buyerEmail: doc.buyerEmail,
                sellerEmail: doc.sellerEmail,
                sentToClientId: clientId || (doc as any).sentToClientId || null,
                submittedByTeamMemberId: doc.submittedByTeamMemberId || null,
              });
              if (effectiveAgentCode) {
                await storage.updateDocument(doc.id, { agentCode: effectiveAgentCode } as any);
              }
            }
            const fresh = await regenerateWithSignatures(
              doc.id, doc.title, doc.content!,
              doc.buyerSignature || undefined, doc.sellerSignature || undefined,
              doc.buyerSignedName || undefined, doc.sellerSignedName || undefined,
              doc.buyerSignedAt ? new Date(doc.buyerSignedAt) : undefined,
              doc.sellerSignedAt ? new Date(doc.sellerSignedAt) : undefined,
              doc.docType,
              submittedByLabelSend,
              doc.buyerSignedIp || undefined,
              doc.sellerSignedIp || undefined,
              effectiveAgentCode || undefined,
              (doc as any).teamMemberCode || undefined,
            );
            await storage.updateDocument(doc.id, { pdfPath: fresh.pdfPath, docxPath: fresh.docxPath });
            await sendDocumentEmail(recipientEmail, isNcnda ? "Party B" : doc.docType === "PI" ? piRecipientLabel : "Recipient", doc.docType, doc.title, recipientRole, fresh.pdfPath, ccEmail || undefined, customMessage || undefined, undefined, extraPdfDocs.length ? extraPdfDocs : undefined);
          } catch (err: any) {
            console.error("[docs] Failed to email recipient:", err.message);
            // This runs in the background after the HTTP response — the caller
            // believes the send succeeded, so alert admins in-app that the
            // regeneration/email actually failed.
            await notify(buildFileGenerationFailureNotification(doc, "send_email", err?.message));
          }
        };
        sendWithAttachment();
        sendSignaturePendingEmail(recipientEmail, isNcnda ? "Party B (Receiving Party)" : "Recipient", doc.docType, doc.title)
          .catch(err => console.error("[docs] Failed to send signature pending email:", err));
      }

      notify({
        type: "document_sent",
        title: `${doc.docType} sent for review`,
        message: `${doc.title} sent to ${recipientEmail}`,
        link: "/documents",
        severity: "info",
        module: "documents",
      });

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to send document" });
    }
  });

  // Send a generated document directly to a team member the caller personally
  // added. Delivery is email-only, with BOTH the PDF and editable DOCX attached.
  // Restricted to the document's owner and members they invited
  // (canSendDocumentToMember); admins may send any document to any member.
  app.post("/api/documents/:id/send-to-member", requireModule(DOC_MODULES), async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (requiresProformaPortalDelivery(doc.docType)) {
        return res.status(400).json({
          message: "A Proforma Invoice can only be delivered to its approved linked counterparty through the client portal",
        });
      }

      const { teamMemberId, message } = req.body;
      if (!teamMemberId) return res.status(400).json({ message: "teamMemberId is required" });

      // The recipient may be a provisioned team member (has a login) OR a
      // login-less team-KYC applicant the caller invited. Delivery is
      // email-only, so a provisioned account is not required — resolve either.
      const member = await storage.getTeamMemberById(teamMemberId);
      let target: { email: string | null; name: string | null; invitedByTeamMemberId: string | null | undefined };
      if (member) {
        target = { email: member.email, name: member.name, invitedByTeamMemberId: member.invitedByTeamMemberId };
      } else {
        const app = await storage.getTeamKycApplicationById(teamMemberId);
        if (!app) return res.status(404).json({ message: "Team member not found" });
        if (app.status === "rejected") return res.status(422).json({ message: "That team member's application was rejected." });
        target = { email: app.email, name: app.fullName, invitedByTeamMemberId: app.invitedByTeamMemberId };
      }
      if (!target.email) return res.status(422).json({ message: "That team member has no email address on file." });

      const callerTmId = await getSessionTeamMemberId(req);
      const allowed = canSendDocumentToMember({
        role: req.session?.role,
        callerTeamMemberId: callerTmId,
        docOwnerTeamMemberId: doc.submittedByTeamMemberId,
        targetInvitedByTeamMemberId: target.invitedByTeamMemberId,
      });
      if (!allowed) {
        return res.status(403).json({ message: "You can only send documents you created to team members you personally added." });
      }

      // Team members may only send once the admin has approved the document
      // (pending_review → draft). Admins may send in any state.
      if (req.session?.role === "team" && doc.status === "pending_review") {
        return res.status(403).json({ message: "This document is awaiting admin approval. You can send it once an admin approves it." });
      }

      const isNcnda = doc.docType === "NCNDA";
      const hasSig = hasRequiredDocumentSignatures(doc);
      if (!hasSig) {
        return res.status(400).json({
          message: doc.docType === "ADDENDUM"
            ? "SPA addendum must be signed by both Seller and Buyer before sending"
            : isNcnda
              ? "NCNDA must be signed by Party A (Issuer) before sending"
              : "Document must be signed before sending",
        });
      }

      const customMessage = typeof message === "string" ? message.trim().slice(0, 5000) : "";

      const { regenerateWithSignatures } = await import("./documentFileGenerator");
      const submittedByLabelSend = await getDocSubmittedByLabel(doc.submittedByTeamMemberId);
      const fresh = await regenerateWithSignatures(
        doc.id, doc.title, doc.content!,
        doc.buyerSignature || undefined, doc.sellerSignature || undefined,
        doc.buyerSignedName || undefined, doc.sellerSignedName || undefined,
        doc.buyerSignedAt ? new Date(doc.buyerSignedAt) : undefined,
        doc.sellerSignedAt ? new Date(doc.sellerSignedAt) : undefined,
        doc.docType,
        submittedByLabelSend,
        doc.buyerSignedIp || undefined,
        doc.sellerSignedIp || undefined,
        (doc as any).agentCode || undefined,
        (doc as any).teamMemberCode || undefined,
      );
      await storage.updateDocument(doc.id, { pdfPath: fresh.pdfPath, docxPath: fresh.docxPath, sentTo: target.email });

      // This send guarantees BOTH the PDF and the editable DOCX are attached, so
      // fail fast rather than let the shared email helper fall back to PDF-only.
      if (!fresh.docxPath || !fs.existsSync(fresh.docxPath) || !fresh.pdfPath || !fs.existsSync(fresh.pdfPath)) {
        return res.status(500).json({ message: "Could not prepare both the PDF and DOCX for sending. Please try again." });
      }

      const emailed = await sendDocumentEmail(
        target.email,
        target.name || "Team Member",
        doc.docType,
        doc.title,
        isNcnda ? "Party B" : "Buyer",
        fresh.pdfPath,
        undefined,
        customMessage || undefined,
        fresh.docxPath,
      );
      if (!emailed) {
        return res.status(502).json({ message: "Document could not be emailed. Check the email service configuration." });
      }

      notify({
        type: "document_sent",
        title: `${doc.docType} sent to team member`,
        message: `${doc.title} sent to ${target.name}`,
        link: "/documents",
        severity: "info",
        module: "documents",
      });

      res.json({ success: true, sentTo: target.email });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to send document" });
    }
  });

  // Direct email of a generated document (PDF attached, optional CC) to any
  // recipient, without entering the client-portal review workflow. Restricted
  // to the admin and the team member who generated the document. Does NOT
  // change the document's workflow state.
  // Resolve and freshly regenerate the PDFs of child documents requested as
  // extra attachments for a parent-document email. Strictly scoped through the
  // pure canAttachDocToEmail gate: every id must be a direct child
  // (parentDocId) of the parent being emailed, of an attachable bank-draft
  // type, AND independently downloadable/emailable by the caller — this
  // prevents using the email route to exfiltrate arbitrary documents,
  // including drafts under the caller's own parent that the caller does not
  // own. Throws with a client-safe message on any invalid id.
  async function resolveEmailAttachmentDocs(
    parentDoc: any,
    attachDocIds: unknown,
    caller: {
      role: string | undefined;
      teamMemberId: string | null;
      teamParticipantId: string | null | undefined;
      clientKycId: string | null | undefined;
    },
  ): Promise<{ docType: string; docTitle: string; pdfFilePath: string }[]> {
    if (!Array.isArray(attachDocIds) || attachDocIds.length === 0) return [];
    if (attachDocIds.length > 3) throw new Error("At most 3 extra attachments are allowed");
    const { regenerateWithSignatures } = await import("./documentFileGenerator");
    const extras: { docType: string; docTitle: string; pdfFilePath: string }[] = [];
    const seen = new Set<string>();
    for (const rawId of attachDocIds) {
      const id = String(rawId);
      if (seen.has(id)) continue;
      seen.add(id);
      const child = await storage.getDocumentById(id);
      if (
        !child ||
        !canAttachDocToEmail({
          parentDoc,
          child,
          role: caller.role,
          teamMemberId: caller.teamMemberId,
          teamParticipantId: caller.teamParticipantId,
          clientKycId: caller.clientKycId,
        })
      ) {
        throw new Error("Attachments must be bank drafts derived from this document");
      }
      if (!child.content) throw new Error(`${child.docType} draft has no content to attach`);
      const label = await getDocSubmittedByLabel(child.submittedByTeamMemberId);
      const freshChild = await regenerateWithSignatures(
        child.id, child.title, child.content,
        child.buyerSignature || undefined, child.sellerSignature || undefined,
        child.buyerSignedName || undefined, child.sellerSignedName || undefined,
        child.buyerSignedAt ? new Date(child.buyerSignedAt) : undefined,
        child.sellerSignedAt ? new Date(child.sellerSignedAt) : undefined,
        child.docType,
        label,
        child.buyerSignedIp || undefined,
        child.sellerSignedIp || undefined,
        (child as any).agentCode || undefined,
        (child as any).teamMemberCode || undefined,
      );
      await storage.updateDocument(child.id, { pdfPath: freshChild.pdfPath, docxPath: freshChild.docxPath });
      extras.push({ docType: child.docType, docTitle: child.title, pdfFilePath: freshChild.pdfPath });
    }
    return extras;
  }

  app.post("/api/documents/:id/email", requireModule(DOC_MODULES), authenticatedEmailLimiter, async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const piDirectEmailCheck = validateProformaInvoiceDirectEmail({
        docType: doc.docType,
        role: req.session?.role,
        hasRequiredSignature: hasRequiredDocumentSignatures(doc),
      });
      if (!piDirectEmailCheck.ok) {
        return res.status(piDirectEmailCheck.status).json({ message: piDirectEmailCheck.message });
      }

      // Per-document ownership decision goes through the SAME pure gate as the
      // single-file download and deal-file ZIP routes
      // (canSendDocViaEmail === canDownloadSingleFileDoc === canIncludeDocInZip):
      // if the caller cannot download this document, they cannot email it out.
      const roleEmail = req.session?.role;
      const tmIdEmail = roleEmail === "team" ? await getSessionTeamMemberId(req) : null;
      const memberEmail = tmIdEmail ? await storage.getTeamMemberById(tmIdEmail) : null;
      const canEmail = canSendDocViaEmail({
        role: roleEmail,
        doc,
        teamMemberId: tmIdEmail,
        teamParticipantId: memberEmail?.participantId ?? null,
        clientKycId: req.session?.clientKycId ?? null,
      });
      if (!canEmail) {
        return res.status(403).json({ message: "You can only email documents you created" });
      }
      if (roleEmail === "team") {
        // A document awaiting admin approval stays in-house until approved.
        if (doc.status === "pending_review") {
          return res.status(403).json({ message: "This document is awaiting admin approval. You can email it once an admin approves it." });
        }
      }
      if (doc.docType === "ADDENDUM" && !hasRequiredDocumentSignatures(doc)) {
        return res.status(400).json({
          message: "SPA addendum must be signed by both Seller and Buyer before emailing",
        });
      }

      const { recipientEmail, ccEmail, message, attachDocIds } = req.body;
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!recipientEmail || typeof recipientEmail !== "string" || !emailRe.test(recipientEmail.trim())) {
        return res.status(400).json({ message: "A valid recipient email is required" });
      }
      const cc = typeof ccEmail === "string" && ccEmail.trim() ? ccEmail.trim() : undefined;
      if (cc && !emailRe.test(cc)) {
        return res.status(400).json({ message: "CC email is not a valid email address" });
      }
      const customMessage = typeof message === "string" ? message.trim().slice(0, 5000) : "";

      if (!doc.content) {
        return res.status(400).json({ message: "Document has no content to send" });
      }

      // Regenerate a fresh PDF (with any signatures already on the document).
      const { regenerateWithSignatures } = await import("./documentFileGenerator");
      const submittedByLabelEmail = await getDocSubmittedByLabel(doc.submittedByTeamMemberId);
      const fresh = await regenerateWithSignatures(
        doc.id, doc.title, doc.content,
        doc.buyerSignature || undefined, doc.sellerSignature || undefined,
        doc.buyerSignedName || undefined, doc.sellerSignedName || undefined,
        doc.buyerSignedAt ? new Date(doc.buyerSignedAt) : undefined,
        doc.sellerSignedAt ? new Date(doc.sellerSignedAt) : undefined,
        doc.docType,
        submittedByLabelEmail,
        doc.buyerSignedIp || undefined,
        doc.sellerSignedIp || undefined,
        (doc as any).agentCode || undefined,
        (doc as any).teamMemberCode || undefined,
      );
      await storage.updateDocument(doc.id, { pdfPath: fresh.pdfPath, docxPath: fresh.docxPath });

      // Optional derived bank drafts (LC / performance guarantee) riding along
      // in the same email; invalid ids reject the whole request.
      let extraPdfDocs: { docType: string; docTitle: string; pdfFilePath: string }[] = [];
      try {
        extraPdfDocs = await resolveEmailAttachmentDocs(doc, attachDocIds, {
          role: roleEmail,
          teamMemberId: tmIdEmail,
          teamParticipantId: memberEmail?.participantId ?? null,
          clientKycId: req.session?.clientKycId ?? null,
        });
      } catch (attachErr: any) {
        return res.status(400).json({ message: attachErr?.message || "Invalid extra attachments" });
      }

      const emailed = await sendDocumentEmail(
        recipientEmail.trim(),
        "Recipient",
        doc.docType,
        doc.title,
        "Recipient" as any,
        fresh.pdfPath,
        cc,
        customMessage || undefined,
        doc.docType === "PI" ? fresh.docxPath : undefined,
        extraPdfDocs.length ? extraPdfDocs : undefined,
      );
      if (!emailed) {
        return res.status(502).json({ message: "Document could not be emailed. Check the email service configuration." });
      }

      notify({
        type: "document_sent",
        title: `${doc.docType} emailed`,
        message: `${doc.title} emailed to ${recipientEmail.trim()}${cc ? ` (cc: ${cc})` : ""}`,
        link: "/documents",
        severity: "info",
        module: "documents",
      });

      res.json({ success: true, emailedTo: recipientEmail.trim(), cc: cc || null });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to email document" });
    }
  });

  app.post("/api/documents/:id/respond", requireAdminAuth, async (req, res) => {
    try {
      const doc = await storage.getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (doc.docType === "PI") {
        return res.status(403).json({
          message: "Only the recipient account linked to this Proforma Invoice may accept or reject it",
        });
      }

      if (doc.status !== "sent" || doc.recipientResponse !== "pending") {
        return res.status(400).json({ message: "Document must be in 'sent' state with 'pending' response to accept/reject" });
      }

      const { response, amendmentNotes } = req.body;
      if (!["accepted", "rejected"].includes(response)) {
        return res.status(400).json({ message: "Response must be 'accepted' or 'rejected'" });
      }

      // A deal's TFR is special: admin acceptance IS the approval, so route it
      // through the atomic trade-formation path (stamps the TFR, accepts it,
      // mints the block and puts the transaction on the Deal Desk). If trade
      // formation fails the TFR is NOT marked accepted — never accept silently.
      if (response === "accepted" && String(doc.docType).toUpperCase() === "TFR") {
        const deals = await storage.getDeals();
        const deal = deals.find((d) => d.tfrDocId === doc.id && !d.tradeRef);
        if (deal) {
          if (deal.stage !== "tfr_pending") {
            return res.status(400).json({ message: "This TFR's deal is not awaiting approval" });
          }
          const result = await approveTfrForDeal(deal.id);
          if (!result.ok) return res.status(result.status).json({ message: result.message });
          const refreshed = await storage.getDocumentById(doc.id);
          notify({
            type: "document_accepted",
            title: "TFR approved — trade formed",
            message: `${doc.title} approved; trade ${result.value.createdTradeRef} is now on the Deal Desk`,
            link: "/trading",
            severity: "success",
            module: "documents",
          });
          return res.json(refreshed ?? result.value);
        }
      }

      const updateData: {
        recipientResponse: string;
        status: string;
        recipientRespondedAt: Date;
        recipientAmendmentNotes?: string;
      } = {
        recipientResponse: response,
        recipientRespondedAt: new Date(),
        status: response === "accepted" ? "accepted" : "rejected",
      };
      if (response === "rejected" && amendmentNotes) {
        updateData.recipientAmendmentNotes = amendmentNotes;
      }
      const updated = await storage.respondToDocumentOnce(doc.id, updateData, doc.content);
      if (!updated) {
        return res.status(409).json({ message: "Document has already been responded to" });
      }

      notify({
        type: response === "accepted" ? "document_accepted" : "document_rejected",
        title: response === "accepted" ? `${doc.docType} accepted` : `${doc.docType} amendment requested`,
        message: response === "accepted"
          ? `${doc.title} was accepted`
          : `Amendment requested on ${doc.title}`,
        link: "/documents",
        severity: response === "accepted" ? "success" : "warning",
        module: "documents",
      });

      res.json(updated);
    } catch (error: any) {
      res.status(error instanceof LpgStsReviewError ? 409 : 500).json({ message: error.message || "Failed to respond to document" });
    }
  });

  app.post("/api/documents/:id/create-addendum", requireModule(DOC_MODULES), async (req, res) => {
    try {
      const parentDoc = await storage.getDocumentById(req.params.id);
      if (!parentDoc) return res.status(404).json({ message: "Parent document not found" });

      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId || parentDoc.submittedByTeamMemberId !== tmId) {
          return res.status(403).json({ message: "You can only create an addendum for an SPA you created" });
        }
      }

      const result = await createSpaAddendumForParent(parentDoc, req.body);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json(result.doc);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create SPA addendum" });
    }
  });

  app.post("/api/documents/:id/prepare-proforma-invoice", requireModule(DOC_MODULES), async (req, res) => {
    try {
      const parentDoc = await storage.getDocumentById(req.params.id);
      if (!parentDoc) return res.status(404).json({ message: "Parent document not found" });
      const result = await prepareProformaInvoiceForParent(
        parentDoc,
        !req.session?.role || req.session.role === "admin",
        undefined,
      );
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json(result.preparation);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to prepare Proforma Invoice" });
    }
  });

  app.post("/api/documents/:id/preview-proforma-invoice", requireModule(DOC_MODULES), async (req, res) => {
    try {
      const parentDoc = await storage.getDocumentById(req.params.id);
      if (!parentDoc) return res.status(404).json({ message: "Parent document not found" });
      if (!req.body?.sourceRevision || req.body.sourceRevision !== buildProformaInvoiceSourceRevision(parentDoc)) {
        return res.status(409).json({
          message: "The SPA changed while the Proforma Invoice was being prepared. Reopen the form to review the latest details.",
        });
      }
      const result = await prepareProformaInvoiceForParent(
        parentDoc,
        !req.session?.role || req.session.role === "admin",
        req.body.fields,
      );
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json({
        content: result.preparation.content,
        previewToken: buildProformaInvoicePreviewToken(
          parentDoc.id,
          result.preparation.sourceRevision,
          result.preparation.fields,
        ),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to preview Proforma Invoice" });
    }
  });

  app.post("/api/documents/:id/create-next", requireModule(DOC_MODULES), async (req, res) => {
    try {
      const parentDoc = await storage.getDocumentById(req.params.id);
      if (!parentDoc) return res.status(404).json({ message: "Parent document not found" });

      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId || parentDoc.submittedByTeamMemberId !== tmId) {
          return res.status(403).json({ message: "You can only advance workflow for documents you created" });
        }
      }

      const { nextDocType, sourceRevision, preparedFields, previewToken } = req.body;
      if (nextDocType === "PI" && (!sourceRevision || !preparedFields || !previewToken)) {
        return res.status(400).json({
          message: "Open the Commercial Invoice form and review the Proforma Invoice before creating it",
        });
      }
      const sanitizedPreparedFields = nextDocType === "PI"
        ? sanitizePreparedProformaInvoiceFields(preparedFields)
        : undefined;
      if (
        nextDocType === "PI"
        && !validateProformaInvoicePreviewToken(
          parentDoc.id,
          sourceRevision,
          sanitizedPreparedFields!,
          previewToken,
        )
      ) {
        return res.status(409).json({
          message: "The Proforma Invoice fields changed after review. Review the current Commercial Invoice form again before creating it.",
        });
      }
      const isAdminCaller = !req.session?.role || req.session.role === "admin";
      const result = await createNextDocumentForParent(parentDoc, nextDocType, isAdminCaller, {
        sourceRevision,
        preparedFields: sanitizedPreparedFields,
      });
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json(result.doc);
    } catch (error: any) {
      res.status(error instanceof LpgStsReviewError ? 409 : 500).json({ message: error.message || "Failed to create next document" });
    }
  });

  app.get("/api/kyc-documents", requireAdminAuth, async (req, res) => {
    try {
      const { documentType } = req.query;
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId) return res.json([]);
        const teamKycs = await storage.getKycApplicationsByTeamMemberId(tmId);
        const teamKycIds = new Set(teamKycs.map((k) => k.id));
        const allDocs = await storage.getKycDocuments(documentType as string | undefined);
        return res.json(allDocs.filter((d) => d.kycApplicationId && teamKycIds.has(d.kycApplicationId)));
      }
      const result = await storage.getKycDocuments(documentType as string | undefined);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KYC documents" });
    }
  });

  app.get("/api/kyc/:id/documents", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const kyc = await storage.getKycApplicationById(id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      const access = await ensureKycAccess(req, kyc);
      if (!access.ok) return res.status(403).json({ message: access.message });
      const result = await storage.getKycDocumentsByApplicationId(id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch KYC application documents" });
    }
  });

  app.patch("/api/kyc/:id/link-documents", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const kyc = await storage.getKycApplicationById(id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      const access = await ensureKycAccess(req, kyc, "write");
      if (!access.ok) return res.status(403).json({ message: access.message });
      const { documentIds } = req.body;
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ message: "documentIds array required" });
      }
      await storage.linkKycDocumentsToApplication(id, documentIds);
      res.json({ message: "Documents linked successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to link documents" });
    }
  });

  app.post("/api/kyc-documents/upload", (req, res, next) => {
    kycUpload.single("file")(req, res, (err: any) => {
      if (err) {
        if (handleMulterError(err, res)) return;
        return res.status(400).json({ message: err.message || "File upload error" });
      }
      next();
    });
  }, async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const { documentType, kycApplicationId } = req.body;
      if (!documentType || !VALID_KYC_DOC_TYPES.includes(documentType)) {
        return res.status(400).json({ message: "Invalid document type" });
      }
      // Rate-limit unauthenticated (public) uploads to prevent storage exhaustion.
      // Authenticated users (admin/team/client) bypass this check.
      if (!req.session?.authenticated && !(req.session as any)?.clientAuthenticated) {
        // Hard cap: query the DB so this limit survives restarts and applies across
        // all server instances. Orphaned docs are legitimately created by the public
        // KYC form before submission; we allow a generous headroom before rejecting.
        const orphanCount = await storage.countOrphanedKycDocuments();
        if (orphanCount >= KYC_ORPHAN_CAP) {
          return res.status(429).json({ message: "Upload limit reached. Please try again later." });
        }
        // Per-IP in-process check as a secondary, fast guard. req.ip is set by Express
        // using the trust proxy=1 configuration, so it reflects the real client IP from
        // the Replit reverse-proxy's X-Forwarded-For header without being directly
        // controllable by the caller.
        const ip = req.ip || "unknown";
        if (!checkKycPublicUploadRate(ip)) {
          return res.status(429).json({ message: "Too many uploads. Please try again later." });
        }
      }
      // Uploading directly to an existing application requires authentication + ownership.
      // Unauthenticated callers (public KYC registration) must leave kycApplicationId empty;
      // documents are linked to the newly-created application server-side on submission.
      if (kycApplicationId) {
        if (!req.session?.authenticated) {
          return res.status(401).json({ message: "Unauthorized" });
        }
        const kyc = await storage.getKycApplicationById(kycApplicationId);
        if (!kyc) {
          return res.status(404).json({ message: "KYC application not found" });
        }
        const access = await ensureKycAccess(req, kyc, "write");
        if (!access.ok) {
          return res.status(403).json({ message: access.message });
        }
      }
      // Team users may only attach documents to KYC applications they submitted
      // (write access — module-based visibility does not grant upload rights).
      if (kycApplicationId && req.session?.authenticated && req.session.role === "team") {
        const targetKyc = await storage.getKycApplicationById(kycApplicationId);
        if (!targetKyc) {
          return res.status(404).json({ message: "KYC application not found" });
        }
        const access = await ensureKycAccess(req, targetKyc, "write");
        if (!access.ok) {
          return res.status(403).json({ message: access.message });
        }
      }
      const storedName = await saveUpload(KYC_CAT, "kyc", file);
      const doc = await storage.createKycDocument({
        kycApplicationId: kycApplicationId || null,
        documentType,
        originalName: file.originalname,
        storedName,
        mimeType: file.mimetype,
        size: file.size,
      });
      res.json(doc);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to upload document" });
    }
  });

  app.get("/api/kyc-documents/:id/download", requireAuth, async (req, res) => {
    try {
      const docs = await storage.getKycDocuments();
      const doc = docs.find((d) => d.id === req.params.id);
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }
      if (req.session!.role !== "admin") {
        if (!doc.kycApplicationId) return res.status(403).json({ message: "Access denied" });
        const kyc = await storage.getKycApplicationById(doc.kycApplicationId);
        if (!kyc) return res.status(403).json({ message: "Access denied" });
        const access = await ensureKycAccess(req, kyc);
        if (!access.ok) return res.status(403).json({ message: access.message });
      }
      await streamObject(KYC_CAT, doc.storedName, res, { downloadName: doc.originalName, contentType: doc.mimeType });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to download document" });
    }
  });

  app.delete("/api/kyc-documents/:id", requireAdminAuth, async (req, res) => {
    try {
      const docs = await storage.getKycDocuments();
      const doc = docs.find((d) => d.id === req.params.id);
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }
      if (req.session?.role === "team") {
        if (!doc.kycApplicationId) return res.status(403).json({ message: "Access denied" });
        const kyc = await storage.getKycApplicationById(doc.kycApplicationId);
        if (!kyc) return res.status(403).json({ message: "Access denied" });
        const access = await ensureKycAccess(req, kyc);
        if (!access.ok) return res.status(403).json({ message: access.message });
      }
      await deleteObject(KYC_CAT, doc.storedName);
      await storage.deleteKycDocument(doc.id);
      res.json({ message: "Document deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to delete document" });
    }
  });

  app.get("/api/trade-documents", requireModule("trading"), async (req, res) => {
    try {
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId) return res.json([]);
        const refs = await getTeamMemberEnquiryRefs(tmId);
        const all = await storage.getTrades();
        const allowedTradeIds = new Set(
          all.filter((t) => t.enquiryRef && refs.has(t.enquiryRef)).map((t) => t.id)
        );
        const allDocs = await storage.getAllTradeDocuments();
        return res.json(allDocs.filter((d) => allowedTradeIds.has(d.tradeId)));
      }
      const result = await storage.getAllTradeDocuments();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trade documents" });
    }
  });

  app.get("/api/trades/:tradeId/files", requireModule("trading"), async (req, res) => {
    try {
      const trade = await storage.getTradeById(req.params.tradeId);
      if (!trade) return res.status(404).json({ message: "Trade not found" });
      const access = await ensureTradeAccess(req, trade);
      if (!access.ok) return res.status(403).json({ message: access.message });
      const result = await storage.getTradeDocuments(req.params.tradeId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trade documents" });
    }
  });

  app.post("/api/trades/:tradeId/files/upload", requireModule("trading"), tradeUpload.single("file") as RequestHandler<any>, async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const { documentKey } = req.body;
      if (!documentKey || !allValidDocKeys.has(documentKey)) {
        return res.status(400).json({ message: "Invalid document key" });
      }
      const trade = await storage.getTradeById(req.params.tradeId);
      if (!trade) {
        return res.status(404).json({ message: "Trade not found" });
      }
      const access = await ensureTradeAccess(req, trade);
      if (!access.ok) {
        return res.status(403).json({ message: access.message });
      }
      // Derive a safe content type from the file extension — never trust the
      // client-supplied MIME type, which could be text/html or similar and
      // allow a stored-XSS attack when the file is later previewed inline.
      file.mimetype = safeContentTypeFromFilename(file.originalname);
      const storedName = await saveUpload(TRADE_CAT, "trade", file);
      // Atomic attach: inserts the document row and sets the stage flag in one
      // row-locked transaction. Returns undefined if the trade was deleted
      // (TFR revoked) while the upload was in flight — no orphaned rows.
      const doc = await storage.attachTradeDocument({
        tradeId: req.params.tradeId,
        documentKey,
        originalName: file.originalname,
        storedName,
        mimeType: safeContentType(file.originalname),
        size: file.size,
      });
      if (!doc) {
        // Clean up the already-saved file so it doesn't linger unreferenced.
        try { await deleteObject(TRADE_CAT, storedName); } catch {}
        return res.status(409).json({ message: "Trade no longer exists — its approval may have been revoked." });
      }
      res.json(doc);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to upload trade document" });
    }
  });

  app.get("/api/trade-documents/:id/view", requireModule("trading"), async (req, res) => {
    try {
      const doc = await storage.getTradeDocumentById(req.params.id);
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }
      const trade = await storage.getTradeById(doc.tradeId);
      if (!trade) return res.status(404).json({ message: "Parent trade not found" });
      const access = await ensureTradeAccess(req, trade);
      if (!access.ok) return res.status(403).json({ message: access.message });
      // Always force attachment disposition and derive the content type from the
      // stored filename extension. Never serve user-uploaded trade files inline
      // from the application origin — doing so would allow a malicious upload
      // (e.g. HTML content behind a .jpg extension) to execute as same-origin
      // script in the reviewer's authenticated session.
      res.setHeader("X-Content-Type-Options", "nosniff");
      const safeType = safeContentTypeFromFilename(doc.storedName);
      await streamObject(TRADE_CAT, doc.storedName, res, { downloadName: doc.originalName, contentType: safeType });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to view document" });
    }
  });

  app.get("/api/trade-documents/:id/download", requireModule("trading"), async (req, res) => {
    try {
      const doc = await storage.getTradeDocumentById(req.params.id);
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }
      const trade = await storage.getTradeById(doc.tradeId);
      if (!trade) return res.status(404).json({ message: "Parent trade not found" });
      const access2 = await ensureTradeAccess(req, trade);
      if (!access2.ok) return res.status(403).json({ message: access2.message });
      // Derive safe content type from the stored filename extension rather than
      // trusting the client-supplied MIME type stored in the database.
      res.setHeader("X-Content-Type-Options", "nosniff");
      const safeDownloadType = safeContentTypeFromFilename(doc.storedName);
      await streamObject(TRADE_CAT, doc.storedName, res, { downloadName: doc.originalName, contentType: safeDownloadType });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to download document" });
    }
  });

  app.delete("/api/trade-documents/:id", requireAdminAuth, async (req, res) => {
    try {
      const doc = await storage.getTradeDocumentById(req.params.id);
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }
      const trade = await storage.getTradeById(doc.tradeId);
      if (!trade || !(await ensureTradeAccess(req, trade))) {
        return res.status(403).json({ message: "Access denied" });
      }
      await deleteObject(TRADE_CAT, doc.storedName);
      await storage.deleteTradeDocument(doc.id);
      const remaining = await storage.getTradeDocuments(doc.tradeId);
      const hasOtherForKey = remaining.some((d) => d.documentKey === doc.documentKey);
      if (!hasOtherForKey) {
        // Row-locked flag update; a no-op if the trade was deleted meanwhile.
        await storage.setStageDocumentFlag(doc.tradeId, doc.documentKey, false);
      }
      res.json({ message: "Document deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to delete trade document" });
    }
  });

  // ─── TRADE ENQUIRIES ───

  // Saved chemical composition for a commodity: returns the spec blob of the
  // most recent accepted enquiry for that product so a new enquiry form can be
  // prefilled; uploaded copper specifications are the fallback when no saved
  // template exists. Returns product + specifications + source (no party or
  // commercial data), so it is safe to share across all enquiry submitters.
  app.get("/api/enquiry-spec-template", requireModule("enquiries"), async (req, res) => {
    try {
      const product = typeof req.query.product === "string" ? req.query.product : "";
      if (!product.trim()) return res.status(400).json({ message: "product query parameter is required" });
      const tpl = await storage.getLatestAcceptedSpecsByProduct(product);
      res.json(enquirySpecTemplate(product, tpl));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Commodity-name suggestions for the enquiry form autocomplete. Returns ONLY
  // distinct product names (no party or commercial data), same safety posture
  // as the spec-template route above.
  app.get("/api/commodity-names", requireModule("enquiries"), async (req, res) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : "";
      if (!q.trim()) return res.json([]);
      res.json(await storage.getDistinctProductNames(q));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/trade-enquiries", requireModule("enquiries"), async (req, res) => {
    try {
      // Admins see every enquiry. A team member sees ONLY their own enquiries:
      // ones they submitted or ones an admin allocated to them.
      const tmId = await getSessionTeamMemberId(req);
      const enquiries = tmId
        ? await storage.getTradeEnquiriesForTeamMember(tmId)
        : await storage.getTradeEnquiries();
      res.json(enquiries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/trade-enquiries/:id", requireModule("enquiries"), async (req, res) => {
    try {
      const enquiry = await storage.getTradeEnquiryById(req.params.id);
      if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });
      // Admins may open any enquiry; a team member may only open one they submitted
      // or one an admin allocated to them.
      const tmId = await getSessionTeamMemberId(req);
      if (
        tmId &&
        (enquiry as any).submittedByTeamMemberId !== tmId &&
        (enquiry as any).allocatedTeamMemberId !== tmId
      ) {
        return res.status(404).json({ message: "Enquiry not found" });
      }
      res.json(enquiry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trade-enquiries", requireModule("enquiries"), async (req, res) => {
    try {
      const b = req.body;
      if (!b || typeof b.product !== "string" || !b.product.trim()) {
        return res.status(400).json({ message: "Product is required and must be a string" });
      }
      const str = (v: any) => (typeof v === "string" && v.trim()) ? v.trim() : null;
      const side = b.side === "sell" ? "sell" : "buy";
      // Server-controlled attribution only — ignore any caller-supplied submittedByTeamMemberId.
      let submittedByTeamMemberId: string | null = null;
      if (req.session?.authenticated && req.session.role === "team" && req.session.username) {
        const tm = await storage.getTeamMemberByUsername(req.session.username);
        if (tm) submittedByTeamMemberId = tm.id;
      }
      const enquiry = await storage.createTradeEnquiry({
        product: b.product.trim(),
        side,
        specifications: str(b.specifications),
        producer: str(b.producer),
        quantity: str(b.quantity),
        unit: str(b.unit) || "MT",
        packing: str(b.packing),
        origin: str(b.origin),
        loadingPort: str(b.loadingPort),
        dischargePort: str(b.dischargePort),
        incoterms: str(b.incoterms),
        deliveryPeriod: str(b.deliveryPeriod),
        validity: str(b.validity),
        price: str(b.price),
        currency: str(b.currency) || "USD",
        paymentTerms: str(b.paymentTerms),
        contractConfirmation: str(b.contractConfirmation),
        performanceBond: str(b.performanceBond),
        docsForPayment: str(b.docsForPayment),
        otherTerms: str(b.otherTerms),
        compliance: str(b.compliance),
        refPerson: str(b.refPerson),
        sellerName: str(b.sellerName),
        sellerAddress: str(b.sellerAddress),
        sellerContact: str(b.sellerContact),
        buyerName: str(b.buyerName),
        buyerAddress: str(b.buyerAddress),
        buyerContact: str(b.buyerContact),
        coSellerName: str(b.coSellerName),
        coSellerAddress: str(b.coSellerAddress),
        coSellerContact: str(b.coSellerContact),
        coBuyerName: str(b.coBuyerName),
        coBuyerAddress: str(b.coBuyerAddress),
        coBuyerContact: str(b.coBuyerContact),
        additionalInfo: str(b.additionalInfo),
        createdBy: str(b.createdBy),
        email: str(b.email),
        submittedByTeamMemberId,
      });
      sendEnquiryCreatedNotification(enquiry).catch(() => {});
      notify({
        type: "enquiry_created",
        title: "New trade enquiry",
        message: `${enquiry.createdBy || "Team"} — ${enquiry.product} (${enquiry.enquiryRef})`,
        link: "/trade-enquiries",
        severity: "info",
        module: "enquiries",
      });
      res.json(enquiry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/trade-enquiries/:id/assign", requireAdminAuth, async (req, res) => {
    try {
      const { clientId } = req.body;
      const existing = await storage.getTradeEnquiryById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Enquiry not found" });
      // clientId may be null to un-assign
      if (clientId !== null && clientId !== undefined) {
        const kyc = await storage.getKycApplicationById(clientId);
        if (!kyc || kyc.status !== "approved") {
          return res.status(422).json({ message: "Client not found or not approved" });
        }
      }
      const updated = await storage.assignEnquiryToClient(req.params.id, clientId ?? null);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin allocates a deal (anchored on the enquiry) to any team member. The
  // allocated member's code is then stamped on every document in this deal's
  // enquiry->shipment lifecycle. teamMemberId may be null to clear allocation.
  app.patch("/api/trade-enquiries/:id/allocate", requireAdminAuth, async (req, res) => {
    try {
      const { teamMemberId } = req.body;
      const existing = await storage.getTradeEnquiryById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Enquiry not found" });
      if (teamMemberId !== null && teamMemberId !== undefined && teamMemberId !== "") {
        const tm = await storage.getTeamMemberById(teamMemberId);
        if (!tm) return res.status(422).json({ message: "Team member not found" });
      }
      const updated = await storage.allocateEnquiryToTeamMember(
        req.params.id,
        teamMemberId && teamMemberId !== "" ? teamMemberId : null,
      );
      // Re-allocation is authoritative: backfill every document of this enquiry
      // so the member code stays consistent across the whole enquiry → shipment trail.
      if (updated?.enquiryRef) {
        const newCode = await resolveTeamMemberCode({ enquiryRef: updated.enquiryRef });
        const docs = await storage.getDocuments();
        await Promise.all(
          docs
            .filter((d) => d.enquiryRef === updated.enquiryRef && (d as any).teamMemberCode !== (newCode ?? null))
            .map((d) => storage.updateDocument(d.id, { teamMemberCode: newCode ?? null } as any)),
        );
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Per-team-member performance: how many enquiries are allocated to each
  // member, plus the trades and documents that flow from those allocated deals.
  app.get("/api/team-performance", requireAdminAuth, async (_req: Request, res: Response) => {
    try {
      const [members, enquiries, trades, documents] = await Promise.all([
        storage.getAllTeamMembers(),
        storage.getTradeEnquiries(),
        storage.getTrades(),
        storage.getDocuments(),
      ]);
      // enquiryRef -> allocated team member id (only allocated enquiries)
      const enquiryAllocation = new Map<string, string>();
      for (const e of enquiries) {
        const allocatedId = (e as any).allocatedTeamMemberId as string | undefined;
        if (allocatedId && e.enquiryRef) enquiryAllocation.set(e.enquiryRef, allocatedId);
      }
      const rows = members.map((m) => {
        const allocatedEnquiries = enquiries.filter(
          (e) => (e as any).allocatedTeamMemberId === m.id,
        ).length;
        const tradeCount = trades.filter(
          (t) => t.enquiryRef && enquiryAllocation.get(t.enquiryRef) === m.id,
        ).length;
        const documentCount = m.participantId
          ? documents.filter((d) => (d as any).teamMemberCode === m.participantId).length
          : 0;
        return {
          id: m.id,
          name: m.name,
          participantId: m.participantId || null,
          department: m.department || null,
          position: m.position || null,
          allocatedEnquiries,
          trades: tradeCount,
          documents: documentCount,
        };
      });
      rows.sort((a, b) =>
        (b.allocatedEnquiries + b.trades + b.documents) -
        (a.allocatedEnquiries + a.trades + a.documents),
      );
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/trade-enquiries/:id/status", requireAdminAuth, async (req, res) => {
    try {
      const { status } = req.body;
      if (typeof status !== "string" || !isAssignableEnquiryStatus(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const existing = await storage.getTradeEnquiryById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Enquiry not found" });
      // An accepted enquiry feeds deals/TFRs/documents — refuse acceptance
      // while key commercial details are blank, and say exactly what's missing.
      if (status === "accepted") {
        const missing = missingEnquiryAcceptanceDetails(existing);
        if (missing.length > 0) {
          return res.status(400).json({
            message: `Cannot accept this enquiry yet — please enter: ${missing.join(", ")}. Edit the enquiry, then accept it.`,
          });
        }
      }
      // Note: accepting an enquiry no longer auto-creates a trade. Trades are only
      // formed via the automated deal pipeline once a TFR is approved (POST
      // /api/deals/:id/approve-tfr).
      const updated = await storage.updateTradeEnquiryStatus(req.params.id, status);
      sendEnquiryStatusNotification(existing, status).catch(() => {});
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== Deal Desk Matching =====

  // Scored candidate buy<->sell pairings for the deal desk. Traders/admins only.
  // Anonymized: each side is returned as a terminal listing (reg codes only).
  app.get("/api/trade-matches/suggestions", requireModule("matching"), async (_req: Request, res: Response) => {
    try {
      const [enquiries, deals, existing, codes, regMap] = await Promise.all([
        storage.getTradeEnquiries(),
        storage.getDeals(),
        storage.getTradeMatches(),
        buildRegCodeMaps(),
        buildRegisteredInstrumentMap(),
      ]);
      // Exclude pairs already captured by a non-rejected match so the desk isn't
      // shown duplicates of work it has already proposed/confirmed.
      const excluded = new Set<string>();
      for (const m of existing) {
        if (m.status !== "rejected") excluded.add(`${m.buyEnquiryRef}__${m.sellEnquiryRef}`);
      }
      const suggestions = computeMatchSuggestions(
        enquiries,
        deals.map((d) => ({ importEnquiryRef: d.importEnquiryRef, exportEnquiryRef: d.exportEnquiryRef })),
        excluded,
      ).map((s) => ({
        id: s.id,
        buyEnquiryRef: s.buy.enquiryRef,
        sellEnquiryRef: s.sell.enquiryRef,
        product: s.buy.product,
        score: s.score,
        breakdown: s.breakdown,
        buy: listingForEnquiry(s.buy, codes, regMap),
        sell: listingForEnquiry(s.sell, codes, regMap),
      }));
      res.json(suggestions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // List existing proposed/confirmed/rejected matches (anonymized). Desk only.
  app.get("/api/trade-matches", requireModule("matching"), async (_req: Request, res: Response) => {
    try {
      const [matches, enquiries, codes, regMap] = await Promise.all([
        storage.getTradeMatches(),
        storage.getTradeEnquiries(),
        buildRegCodeMaps(),
        buildRegisteredInstrumentMap(),
      ]);
      const enqByRef = new Map(enquiries.map((e) => [e.enquiryRef, e]));
      const out = matches.map((m) => {
        const buy = enqByRef.get(m.buyEnquiryRef);
        const sell = enqByRef.get(m.sellEnquiryRef);
        return {
          ...m,
          buy: buy ? listingForEnquiry(buy, codes, regMap) : null,
          sell: sell ? listingForEnquiry(sell, codes, regMap) : null,
        };
      });
      res.json(out);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Propose a manual match. Traders/admins only. Validates both enquiries exist,
  // are the same commodity, and are not in a terminal state. Creates a PROPOSED
  // match (no documents, no deal pipeline) and notifies the desk.
  app.post("/api/trade-matches", requireModule("matching"), async (req, res) => {
    try {
      const buyEnquiryRef = String(req.body?.buyEnquiryRef || "").trim();
      const sellEnquiryRef = String(req.body?.sellEnquiryRef || "").trim();
      const notes = req.body?.notes ? String(req.body.notes).slice(0, 2000) : null;
      if (!buyEnquiryRef || !sellEnquiryRef) {
        return res.status(400).json({ message: "buyEnquiryRef and sellEnquiryRef are required" });
      }
      const enquiries = await storage.getTradeEnquiries();
      const buy = enquiries.find((e) => e.enquiryRef === buyEnquiryRef);
      const sell = enquiries.find((e) => e.enquiryRef === sellEnquiryRef);
      if (!buy || !sell) {
        return res.status(404).json({ message: "One or both enquiries were not found" });
      }
      if ((buy.side || "buy") !== "buy" || (sell.side || "sell") !== "sell") {
        return res.status(400).json({ message: "First enquiry must be a buy and second a sell" });
      }
      if (isEnquiryStatusTerminal(buy.status) || isEnquiryStatusTerminal(sell.status)) {
        return res.status(400).json({ message: "Cannot match an enquiry that is closed or cancelled" });
      }
      const scored = scoreInstrumentMatch(buy, sell);
      if (!scored) {
        return res.status(400).json({ message: "Enquiries are different commodities and cannot be matched" });
      }

      // Derive the actor label server-side (never from the client) for repudiation.
      let createdByLabel = "BULLEX Desk";
      if (req.session.role === "admin") {
        createdByLabel = "BULLEX Admin";
      } else if (req.session.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        const tm = tmId ? await storage.getTeamMemberById(tmId) : undefined;
        createdByLabel = tm?.participantId || tm?.name || "BULLEX Trader";
      }

      const all = await storage.getTradeMatches();
      const year = new Date().getFullYear();
      const serial = String(all.filter((m) => m.matchRef.startsWith(`MATCH-${year}-`)).length + 1).padStart(4, "0");
      const matchRef = `MATCH-${year}-${serial}`;

      const parsed = insertTradeMatchSchema.parse({
        buyEnquiryRef,
        sellEnquiryRef,
        product: buy.product,
        score: scored.score,
        matchType: "manual",
        status: "proposed",
        notes,
        createdByLabel,
      });
      const created = await storage.createTradeMatch({ ...parsed, matchRef });

      await notify({
        type: "match_proposed",
        title: "Match proposed for review",
        message: `${matchRef}: ${buy.product} — ${buyEnquiryRef} ↔ ${sellEnquiryRef} (score ${scored.score})`,
        link: "/matching",
        severity: "info",
        module: "matching",
      });

      res.status(201).json({ ...created, breakdown: scored.breakdown });
    } catch (error: any) {
      if (error?.issues) return res.status(400).json({ message: "Invalid match data", issues: error.issues });
      res.status(500).json({ message: error.message });
    }
  });

  // Confirm or reject a proposed match. Admin only (deal-desk decision of record).
  // No documents are generated and no deal pipeline is rebuilt — confirmation is
  // purely a desk decision flag, per the locked product decision.
  app.patch("/api/trade-matches/:id", requireAdminAuth, async (req, res) => {
    try {
      const status = String(req.body?.status || "").trim();
      if (status !== "confirmed" && status !== "rejected") {
        return res.status(400).json({ message: "status must be 'confirmed' or 'rejected'" });
      }
      const match = await storage.getTradeMatchById(req.params.id);
      if (!match) return res.status(404).json({ message: "Match not found" });
      if (match.status !== "proposed") {
        return res.status(409).json({ message: `Match already ${match.status}` });
      }
      const notes = req.body?.notes ? String(req.body.notes).slice(0, 2000) : match.notes;
      const updated = await storage.updateTradeMatch(req.params.id, {
        status,
        notes,
        reviewedBy: "BULLEX Admin",
        reviewedAt: new Date(),
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== Branding: document logos =====
  // Two admin-configured logos brand every generated DOCX/PDF (see
  // documentFileGenerator): the Bullfrog logo at the top/header and the Bullex
  // logo at the bottom/footer. Each is stored in Object Storage under the
  // "branding" category and referenced by its own app setting.
  // "primary" = Bullex (footer), "secondary" = Bullfrog (header).
  const LOGO_SLOTS: Record<string, { key: string; base: string }> = {
    primary: { key: LOGO_SETTING_KEY, base: "logo" },
    secondary: { key: LOGO_SECONDARY_SETTING_KEY, base: "logo-secondary" },
    letterhead: { key: LOGO_LETTERHEAD_SETTING_KEY, base: "letterhead" },
  };

  const uploadLogoSlot = async (slot: { key: string; base: string }, file: Express.Multer.File) => {
    // Resolve the previous object up front, but don't delete it until the new
    // logo is fully persisted (avoids losing the old logo on failure).
    let prevStored: string | undefined;
    const prev = await storage.getAppSetting(slot.key);
    if (prev) {
      try { prevStored = JSON.parse(prev.value)?.storedName; } catch {}
    }
    const storedName = await saveUpload(LOGO_CAT, slot.base, file);
    const meta = {
      storedName,
      originalName: file.originalname,
      contentType: safeContentType(file.originalname),
      uploadedAt: new Date().toISOString(),
    };
    try {
      await storage.setAppSetting(slot.key, JSON.stringify(meta));
    } catch (e) {
      try { await deleteObject(LOGO_CAT, storedName); } catch {}
      throw e;
    }
    if (prevStored && prevStored !== storedName) {
      try { await deleteObject(LOGO_CAT, prevStored); } catch {}
    }
    clearLogoCache();
    clearEmailLogoCache();
    return meta;
  };

  // Upload/replace a document logo. Admin only. :slot = primary | secondary.
  app.post("/api/settings/logo/:slot", requireAdminAuth, (req: Request, res: Response) => {
    const slot = LOGO_SLOTS[String(req.params.slot)];
    if (!slot) return res.status(404).json({ message: "Unknown logo slot" });
    logoUpload.single("file")(req, res, async (err: any) => {
      if (handleMulterError(err, res)) return;
      try {
        const file = req.file;
        if (!file) return res.status(400).json({ message: "No file uploaded" });
        const ext = path.extname(file.originalname).toLowerCase();
        if (!logoExts.includes(ext)) {
          return res.status(400).json({ message: "Logo must be a PNG or JPG image" });
        }
        if (!isPngOrJpegBytes(file.buffer)) {
          return res.status(400).json({ message: "File is not a valid PNG or JPG image" });
        }
        const meta = await uploadLogoSlot(slot, file);
        res.status(201).json({ logo: { originalName: meta.originalName, contentType: meta.contentType, uploadedAt: meta.uploadedAt } });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });
  });

  // Current logo metadata (no bytes). Admin only.
  app.get("/api/settings/logo/:slot", requireAdminAuth, async (req, res) => {
    const slot = LOGO_SLOTS[String(req.params.slot)];
    if (!slot) return res.status(404).json({ message: "Unknown logo slot" });
    try {
      const setting = await storage.getAppSetting(slot.key);
      if (!setting) return res.json({ logo: null });
      const meta = JSON.parse(setting.value);
      res.json({ logo: { originalName: meta.originalName, contentType: meta.contentType, uploadedAt: meta.uploadedAt } });
    } catch {
      res.json({ logo: null });
    }
  });

  // Remove a document logo. Admin only.
  app.delete("/api/settings/logo/:slot", requireAdminAuth, async (req, res) => {
    const slot = LOGO_SLOTS[String(req.params.slot)];
    if (!slot) return res.status(404).json({ message: "Unknown logo slot" });
    try {
      const setting = await storage.getAppSetting(slot.key);
      if (setting) {
        try { const m = JSON.parse(setting.value); if (m?.storedName) await deleteObject(LOGO_CAT, m.storedName); } catch {}
      }
      await storage.deleteAppSetting(slot.key);
      clearLogoCache();
    clearEmailLogoCache();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Public inline image stream of a logo (used by the admin preview and anywhere
  // branding is shown). Content type is derived server-side from the stored
  // filename extension, never from client input. :slot = primary | secondary.
  app.get("/api/branding/logo/:slot", async (req, res) => {
    const slot = LOGO_SLOTS[String(req.params.slot)];
    if (!slot) return res.status(404).json({ message: "Unknown logo slot" });
    try {
      const setting = await storage.getAppSetting(slot.key);
      if (!setting) return res.status(404).json({ message: "No logo set" });
      const meta = JSON.parse(setting.value);
      if (!meta?.storedName) return res.status(404).json({ message: "No logo set" });
      res.setHeader("X-Content-Type-Options", "nosniff");
      await streamObject(LOGO_CAT, meta.storedName, res, {
        inline: true,
        contentType: safeContentType(meta.storedName),
        cacheControl: "public, max-age=300",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Backward-compatible alias for the primary logo stream.
  app.get("/api/branding/logo", async (_req: Request, res: Response) => {
    try {
      const setting = await storage.getAppSetting(LOGO_SETTING_KEY);
      if (!setting) return res.status(404).json({ message: "No logo set" });
      const meta = JSON.parse(setting.value);
      if (!meta?.storedName) return res.status(404).json({ message: "No logo set" });
      res.setHeader("X-Content-Type-Options", "nosniff");
      await streamObject(LOGO_CAT, meta.storedName, res, {
        inline: true,
        contentType: safeContentType(meta.storedName),
        cacheControl: "public, max-age=300",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ===== Automated trade pipeline (deals) =====

  // List compatible Import<->Export enquiry pairs (same commodity, not already in a deal).
  app.get("/api/enquiry-matches", requireAdminAuth, async (_req: Request, res: Response) => {
    try {
      res.json(await findEnquiryMatches());
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Product-grouped matching board: every active enquiry organised by product and
  // split into Import (buy) / Export (sell), so the system can surface where a
  // counterpart exists. Excludes enquiries already tied to a deal or inactive.
  app.get("/api/enquiry-board", requireModule("enquiries"), async (req, res) => {
    try {
      // Gated by the "enquiries" module. Admins see every enquiry; a team
      // member's board is scoped to their OWN enquiries (submitted or
      // allocated), matching /api/trade-enquiries — the board payload carries
      // full party/commercial details, so it must not leak across members.
      const tmId = await getSessionTeamMemberId(req);
      const enquiries: TradeEnquiry[] = tmId
        ? await storage.getTradeEnquiriesForTeamMember(tmId)
        : await storage.getTradeEnquiries();
      const existingDeals = await storage.getDeals();
      const used = new Set<string>();
      for (const d of existingDeals) { used.add(d.importEnquiryRef); used.add(d.exportEnquiryRef); }
      // The board is an inclusive listing of every non-terminal enquiry not yet in
      // a deal (so admins always see their live enquiries). The stricter
      // allowlist is applied where it matters — to the *suggested* match pairs
      // (computeEnquiryMatches) — not to what is displayed here.
      const inactive = new Set(["closed", "rejected", "cancelled"]);
      const active = enquiries.filter(e => !used.has(e.enquiryRef) && !inactive.has(e.status));

      // Group by canonical MAIN product (e.g. "Granular Sulphur" and
      // "Sulphur 99.9%" share one Sulphur block), not the exact product string.
      const groups = new Map<string, { product: string; imports: TradeEnquiry[]; exports: TradeEnquiry[] }>();
      for (const e of active) {
        const { key, label } = canonicalProductGroup(e.product);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, { product: label, imports: [], exports: [] });
        const g = groups.get(key)!;
        if (e.side === "buy") g.imports.push(e); else if (e.side === "sell") g.exports.push(e);
      }
      const board = Array.from(groups.values()).sort((a, b) => a.product.localeCompare(b.product));
      res.json(board);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Flat tabular view of every enquiry for the Deal Pipeline dashboard, with an
  // inDeal flag so used enquiries are visibly distinguished.
  app.get("/api/enquiry-table", requireModule("enquiries"), async (req, res) => {
    try {
      // Gated by the "enquiries" module; allocated team members see every enquiry.
      const enquiries: TradeEnquiry[] = await storage.getTradeEnquiries();
      const existingDeals = await storage.getDeals();
      const used = new Set<string>();
      for (const d of existingDeals) { used.add(d.importEnquiryRef); used.add(d.exportEnquiryRef); }
      const rows = enquiries
        .map(e => ({
          id: e.id,
          enquiryRef: e.enquiryRef,
          product: e.product,
          side: e.side,
          quantity: e.quantity,
          unit: e.unit,
          price: e.price,
          currency: e.currency,
          status: e.status,
          inDeal: used.has(e.enquiryRef),
        }))
        .sort((a, b) => a.product.localeCompare(b.product) || a.side.localeCompare(b.side));
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/deals", requireAdminAuth, async (req, res) => {
    try {
      const allDeals = await storage.getDeals();
      if (req.session.role === "admin") {
        return res.json(allDeals);
      }
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId) return res.status(403).json({ message: "Access denied" });
      const myEnquiries = await storage.getTradeEnquiriesByTeamMemberId(tmId);
      const myRefs = new Set(myEnquiries.map(e => e.enquiryRef));
      res.json(allDeals.filter(d => myRefs.has(d.importEnquiryRef) || myRefs.has(d.exportEnquiryRef)));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create a deal from a chosen match and run the automatic document cascade.
  app.post("/api/deals", requireAdminAuth, async (req, res) => {
    try {
      const { importEnquiryRef, exportEnquiryRef, manual } = req.body || {};
      // `manual: true` = admin manual match: allows pairing across differing
      // commodity names. Route is already admin-only (requireAdminAuth).
      const result = await createDealFromEnquiries(importEnquiryRef, exportEnquiryRef, {
        allowCommodityMismatch: manual === true,
      });
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json(result.value);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Approve the TFR -> form the trade in the Deal Desk and mint a blockchain block.
  app.post("/api/deals/:id/approve-tfr", requireAdminAuth, async (req, res) => {
    try {
      const result = await approveTfrForDeal(req.params.id);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json(result.value);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Revoke a TFR approval: deletes the minted trade + blockchain block (only
  // while nothing downstream exists) and returns the deal to tfr_pending.
  app.post("/api/deals/:id/revoke-tfr-approval", requireAdminAuth, async (req, res) => {
    try {
      const result = await revokeTfrApproval(req.params.id);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json(result.value);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Retry/resume a deal's document cascade after a partial failure. Idempotent:
  // only the missing documents are created (see runDealCascade).
  app.post("/api/deals/:id/resume-cascade", requireAdminAuth, async (req, res) => {
    try {
      const result = await resumeDealCascade(req.params.id);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json(result.value);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Manually incorporate addressee + financial details into a pending TFR.
  app.patch("/api/deals/:id/tfr-details", requireAdminAuth, async (req, res) => {
    try {
      const result = await updateDealTfrDetails(req.params.id, req.body || {});
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json(result.value);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Edit a pending TFR's ENTIRE text (drop sections that don't apply, add ones
  // that do); the DOCX/PDF are regenerated from the edited text.
  app.patch("/api/deals/:id/tfr-content", requireAdminAuth, async (req, res) => {
    try {
      const result = await updateDealTfrContent(req.params.id, (req.body || {}).content);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json(result.value);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Saved TFR recipients (banks / addressees), most recently used first.
  app.get("/api/tfr-recipients", requireAdminAuth, async (_req, res) => {
    try {
      res.json(await storage.getTfrRecipients());
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Edit a saved TFR recipient (correct outdated / misspelled details).
  app.patch("/api/tfr-recipients/:id", requireAdminAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const data: Record<string, string | null> = {};
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) return res.status(400).json({ message: "Name cannot be blank" });
        data.name = name;
      }
      for (const key of ["address", "attn", "notes"] as const) {
        if (body[key] !== undefined) data[key] = body[key] === null ? null : String(body[key]).trim() || null;
      }
      if (Object.keys(data).length === 0) return res.status(400).json({ message: "No fields to update" });
      const updated = await storage.updateTfrRecipient(req.params.id, data);
      if (!updated) return res.status(404).json({ message: "Recipient not found" });
      res.json(updated);
    } catch (error: any) {
      // Unique-name collision: renaming onto an existing recipient (pg SQLSTATE
      // may surface on the error itself or on its cause under drizzle).
      if (error?.code === "23505" || error?.cause?.code === "23505") {
        return res.status(409).json({ message: "A recipient with that name already exists" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // Delete an obsolete saved TFR recipient.
  app.delete("/api/tfr-recipients/:id", requireAdminAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteTfrRecipient(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Recipient not found" });
      res.json(deleted);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Cancel a deal-backed TFR before trade formation: dissolves the deal and
  // removes the cascade documents, freeing the enquiries for re-matching.
  app.post("/api/deals/:id/cancel-tfr", requireAdminAuth, async (req, res) => {
    try {
      const result = await cancelDealTfr(req.params.id);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json(result.value);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Candidate TFRs: prepare/compare TFRs for several Import/Export combinations
  // before committing to a deal. Admin-only, like deal formation itself.
  app.get("/api/tfr-candidates", requireAdminAuth, async (_req, res) => {
    try {
      res.json(await storage.getTfrCandidates());
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tfr-candidates", requireAdminAuth, async (req, res) => {
    try {
      const { importEnquiryRef, exportEnquiryRef, manual } = req.body || {};
      const result = await prepareTfrCandidate(importEnquiryRef, exportEnquiryRef, {
        allowCommodityMismatch: manual === true,
      });
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.status(201).json(result.value);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Cancel a prepared candidate TFR (removes its draft TFR document).
  app.post("/api/tfr-candidates/:id/cancel", requireAdminAuth, async (req, res) => {
    try {
      const result = await cancelTfrCandidate(req.params.id);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json(result.value);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Manually incorporate addressee + financial details into an active
  // candidate TFR (same allowlisted fields as the deal TFR edit).
  app.patch("/api/tfr-candidates/:id/details", requireAdminAuth, async (req, res) => {
    try {
      const result = await updateTfrCandidateDetails(req.params.id, req.body || {});
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json(result.value);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Edit a candidate TFR's ENTIRE text; files regenerate from the edited text.
  app.patch("/api/tfr-candidates/:id/content", requireAdminAuth, async (req, res) => {
    try {
      const result = await updateTfrCandidateContent(req.params.id, (req.body || {}).content);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.json(result.value);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // The admin chose this combination: form the deal + run the cascade.
  app.post("/api/tfr-candidates/:id/create-deal", requireAdminAuth, async (req, res) => {
    try {
      const result = await createDealFromTfrCandidate(req.params.id);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.status(201).json(result.value);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Verify the current session owns this enquiry. Admins always pass; team members
  // must be the original submitter. Returns the enquiry on success, or sends an error
  // response and returns null on failure (in which case the caller should return).
  async function ensureEnquiryAccess(req: Request, res: Response, enquiryId: string) {
    const enquiry = await storage.getTradeEnquiryById(enquiryId);
    if (!enquiry) { res.status(404).json({ message: "Enquiry not found" }); return null; }
    if (req.session?.role === "team") {
      const tmId = await getSessionTeamMemberId(req);
      if (!tmId || enquiry.submittedByTeamMemberId !== tmId) {
        res.status(403).json({ message: "Forbidden" });
        return null;
      }
    }
    return enquiry;
  }

  app.delete("/api/trade-enquiries/:id", requireAuth, async (req, res) => {
    try {
      const existing = await ensureEnquiryAccess(req, res, req.params.id);
      if (!existing) return;
      const docs = await storage.getTradeEnquiryDocuments(req.params.id);
      for (const doc of docs) {
        await deleteObject(ENQUIRY_CAT, doc.storedName);
      }
      await storage.deleteTradeEnquiry(req.params.id);
      res.json({ message: "Enquiry deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── TRADE ENQUIRY DOCUMENTS ───
  app.get("/api/trade-enquiries/:id/documents", requireAuth, async (req, res) => {
    try {
      const enquiry = await ensureEnquiryAccess(req, res, req.params.id);
      if (!enquiry) return;
      const docs = await storage.getTradeEnquiryDocuments(req.params.id);
      res.json(docs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trade-enquiries/:id/documents", requireAuth, enquiryUpload.single("file") as RequestHandler<any>, async (req, res) => {
    const file = req.file;
    try {
      if (!file) return res.status(400).json({ message: "No file uploaded" });
      const enquiry = await ensureEnquiryAccess(req, res, req.params.id);
      if (!enquiry) {
        return;
      }
      const storedName = await saveUpload(ENQUIRY_CAT, "enquiry", file);
      const doc = await storage.createTradeEnquiryDocument({
        enquiryId: req.params.id,
        originalName: file.originalname,
        storedName,
        mimeType: file.mimetype,
        size: file.size,
      });
      res.json(doc);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/trade-enquiry-documents/:docId/download", requireAuth, async (req, res) => {
    try {
      const doc = await storage.getTradeEnquiryDocumentById(req.params.docId);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const enquiry = await ensureEnquiryAccess(req, res, doc.enquiryId);
      if (!enquiry) return;
      await streamObject(ENQUIRY_CAT, doc.storedName, res, { downloadName: doc.originalName, contentType: doc.mimeType });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/trade-enquiry-documents/:docId", requireAuth, async (req, res) => {
    try {
      const doc = await storage.getTradeEnquiryDocumentById(req.params.docId);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const enquiry = await ensureEnquiryAccess(req, res, doc.enquiryId);
      if (!enquiry) return;
      const deleted = await storage.deleteTradeEnquiryDocument(req.params.docId);
      if (!deleted) return res.status(404).json({ message: "Document not found" });
      await deleteObject(ENQUIRY_CAT, deleted.storedName);
      res.json({ message: "Document deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const DEFAULT_ROLE_TYPES = [
    "Trader", "Buyer", "Seller", "Broker", "Shipping Company",
    "Quality Assessment Agency", "Logistics Provider", "Financial Institution",
    "Inspection Company", "Insurance Provider", "Legal / Compliance",
  ];

  app.get("/api/role-types", async (_req: Request, res: Response) => {
    try {
      const regs = await storage.getRegistrations();
      const custom = new Set<string>();
      for (const reg of regs) {
        if (reg.roleType.startsWith("Other – ")) {
          const extracted = reg.roleType.replace(/^Other – /, "").trim();
          if (extracted && !DEFAULT_ROLE_TYPES.includes(extracted)) {
            custom.add(extracted);
          }
        }
      }
      const result = [...DEFAULT_ROLE_TYPES, ...Array.from(custom).sort(), "Other"];
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ---- Tokenisation: shipment blocks & investor funding ----------------------
  // Committed tokens = pending + confirmed + reimbursed (cancelled freed). Used to
  // compute funding progress and to cap new investments at the tokens issued.
  const committedTokens = (invs: Investment[]) =>
    invs.filter((i) => i.status !== "cancelled").reduce((s, i) => s + (i.tokens || 0), 0);

  // Anonymise/aggregate a block for public consumption (no investor PII).
  const shapePublicBlock = (block: ShipmentBlock, invs: Investment[]) => {
    const committed = committedTokens(invs);
    return {
      ...block,
      fundedTokens: committed,
      fundedAmount: committed,
      remainingTokens: Math.max(0, block.tokensIssued - committed),
      fundedPct: block.tokensIssued > 0 ? Math.min(100, (committed / block.tokensIssued) * 100) : 0,
      investorCount: new Set(invs.filter((i) => i.status !== "cancelled").map((i) => i.investorEmail.toLowerCase())).size,
    };
  };

  app.get("/api/shipment-blocks", async (_req: Request, res: Response) => {
    try {
      const blocks = await storage.getShipmentBlocks();
      const all = await storage.getInvestments();
      const byBlock = new Map<string, Investment[]>();
      for (const inv of all) {
        const arr = byBlock.get(inv.blockId) || [];
        arr.push(inv);
        byBlock.set(inv.blockId, arr);
      }
      res.json(blocks.map((b) => shapePublicBlock(b, byBlock.get(b.id) || [])));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/shipment-blocks", requireAdminAuth, async (req, res) => {
    try {
      const parsed = insertShipmentBlockSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid shipment block data", errors: parsed.error.flatten() });
      }
      const quantityMt = Number(parsed.data.quantityMt);
      const pricePerMt = Number(parsed.data.pricePerMt);
      const profitPerMt = Number(parsed.data.profitPerMt || 0);
      if (!(quantityMt > 0) || !(pricePerMt > 0) || profitPerMt < 0) {
        return res.status(400).json({ message: "Quantity and price must be positive; profit cannot be negative" });
      }
      const shipmentValue = quantityMt * pricePerMt;
      const tokensIssued = shipmentValue; // 1 token = USD 1 at issue
      const totalProfit = quantityMt * profitPerMt;
      const totalValue = shipmentValue + totalProfit;
      const tokenValue = tokensIssued > 0 ? totalValue / tokensIssued : 1;

      const all = await storage.getShipmentBlocks();
      const year = new Date().getFullYear();
      const serial = String(all.filter((b) => b.blockRef.startsWith(`BULL-BLOCK-${year}-`)).length + 1).padStart(4, "0");
      const blockRef = `BULL-BLOCK-${year}-${serial}`;

      const created = await storage.createShipmentBlock({
        ...parsed.data,
        quantityMt, pricePerMt, profitPerMt,
        blockRef, shipmentValue, tokensIssued, totalProfit, totalValue, tokenValue,
      });
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/shipment-blocks/:id", requireAdminAuth, async (req, res) => {
    try {
      const block = await storage.getShipmentBlockById(req.params.id);
      if (!block) return res.status(404).json({ message: "Shipment block not found" });
      const allowed = ["open", "funding", "funded", "shipped", "completed", "cancelled"];
      const status = String(req.body?.status || "").trim();
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: `status must be one of: ${allowed.join(", ")}` });
      }
      const updated = await storage.updateShipmentBlock(req.params.id, { status });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/investments", publicFormLimiterModerate, async (req, res) => {
    try {
      const parsed = insertInvestmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid investment data", errors: parsed.error.flatten() });
      }
      const block = await storage.getShipmentBlockById(parsed.data.blockId);
      if (!block) return res.status(404).json({ message: "Shipment block not found" });
      if (block.status !== "open" && block.status !== "funding") {
        return res.status(400).json({ message: "This shipment block is not open for funding" });
      }
      const amount = Number(parsed.data.amount);
      if (!(amount > 0)) return res.status(400).json({ message: "Investment amount must be greater than zero" });

      // Funding cap is a best-effort pre-check. Pledges land as 'pending' and are
      // manually confirmed by the desk before funds are committed, so a rare
      // concurrent over-pledge is reconciled at confirmation (admin can cancel),
      // not an irreversible over-allocation.
      const existing = await storage.getInvestmentsByBlockId(block.id);
      const remaining = block.tokensIssued - committedTokens(existing);
      if (amount > remaining + 0.0001) {
        return res.status(400).json({ message: `Only USD ${Math.max(0, remaining).toLocaleString()} of tokens remain in this block` });
      }

      const all = await storage.getInvestments();
      const year = new Date().getFullYear();
      const serial = String(all.filter((i) => i.investmentRef.startsWith(`BULL-INV-${year}-`)).length + 1).padStart(4, "0");
      const investmentRef = `BULL-INV-${year}-${serial}`;
      const lookupToken = randomBytes(16).toString("hex");

      const created = await storage.createInvestment({
        ...parsed.data,
        investorEmail: parsed.data.investorEmail.trim().toLowerCase(),
        amount,
        tokens: amount, // 1 token = USD 1 at issue
        investmentRef,
        lookupToken,
        blockRef: block.blockRef,
        commodity: block.commodity,
      });

      // Flip the block to 'funding' once it has its first commitment.
      if (block.status === "open") {
        await storage.updateShipmentBlock(block.id, { status: "funding" }).catch(() => {});
      }

      notify({
        type: "investment",
        title: "New investment pledged",
        message: `${investmentRef}: ${created.investorName} — USD ${amount.toLocaleString()} in ${block.blockRef} (${block.commodity})`,
        link: "/tokenization-model",
        severity: "info",
        module: "dashboard",
      });

      // Return without bank account number (least-privilege echo).
      const { bankAccountNumber, ...safe } = created;
      res.status(201).json(safe);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Investor self-service tracker. Public, possession-based: requires the
  // unguessable 32-hex lookupToken issued privately to the investor at
  // submission. The sequential investmentRef is NOT accepted as a lookup key
  // because it is predictable and would allow enumeration. Returns only a
  // minimal non-PII status summary (no name/email/phone/bank details).
  app.get("/api/investments/lookup", publicFormLimiterModerate, async (req, res) => {
    try {
      const token = String(req.query.token || "").trim();
      if (!token || !/^[a-f0-9]{32}$/.test(token)) {
        return res.status(400).json({ message: "A valid 32-character hex lookup token is required" });
      }
      const inv = await storage.getInvestmentByLookupToken(token);
      if (!inv) return res.status(404).json({ message: "No investment matches that token" });
      const block = await storage.getShipmentBlockById(inv.blockId);
      const tokenValue = block?.tokenValue ?? 1;
      res.json({
        investmentRef: inv.investmentRef,
        commodity: inv.commodity,
        blockRef: inv.blockRef,
        amount: inv.amount,
        tokens: inv.tokens,
        status: inv.status,
        tokenValue,
        blockStatus: block?.status ?? null,
        projectedPayout: inv.payoutAmount ?? inv.tokens * tokenValue,
        payoutAmount: inv.payoutAmount,
        reimbursedAt: inv.reimbursedAt,
        createdAt: inv.createdAt,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/investments", requireAdminAuth, async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getInvestments());
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/investments/:id", requireAdminAuth, async (req, res) => {
    try {
      const action = String(req.body?.status || "").trim();
      if (!["confirmed", "cancelled", "reimbursed"].includes(action)) {
        return res.status(400).json({ message: "status must be 'confirmed', 'cancelled' or 'reimbursed'" });
      }
      const inv = await storage.getInvestmentById(req.params.id);
      if (!inv) return res.status(404).json({ message: "Investment not found" });

      const data: Partial<Investment> = { status: action };
      if (action === "reimbursed") {
        const block = await storage.getShipmentBlockById(inv.blockId);
        const tokenValue = block?.tokenValue ?? 1;
        data.payoutAmount = inv.tokens * tokenValue;
        data.reimbursedAt = new Date();
      }
      const updated = await storage.updateInvestment(req.params.id, data);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/register", publicFormLimiterModerate, async (req, res) => {
    try {
      const { insertRegistrationSchema } = await import("@shared/schema");
      const parsed = insertRegistrationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid registration data", errors: parsed.error.flatten() });
      }
      const reg = await storage.createRegistration(parsed.data);
      notify({
        type: "registration",
        title: "New registration",
        message: `${reg.fullName} (${reg.companyName}) — ${reg.roleType}`,
        link: "/registrations",
        severity: "info",
        module: "registrations",
      });
      const submittedAt = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
      sendRegistrationConfirmationEmail(reg.email, reg.fullName, reg.roleType, reg.companyName).catch(() => {});
      sendRegistrationAdminEmail(
        "trade@bullfrog-group.com", reg.fullName, reg.companyName, reg.email,
        reg.phone, reg.country, reg.roleType, reg.commodities, reg.message, submittedAt
      ).catch(() => {});
      if (process.env.ADMIN_EMAIL) {
        sendRegistrationAdminEmail(
          process.env.ADMIN_EMAIL, reg.fullName, reg.companyName, reg.email,
          reg.phone, reg.country, reg.roleType, reg.commodities, reg.message, submittedAt
        ).catch(() => {});
      }
      res.status(201).json(reg);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/registrations", requireAdminAuth, async (_req: Request, res: Response) => {
    try {
      const regs = await storage.getRegistrations();
      res.json(regs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/registrations/:id/status", requireAdminAuth, async (req, res) => {
    try {
      const { status, reviewNotes } = req.body;
      if (!status) return res.status(400).json({ message: "Status is required" });
      const updated = await storage.updateRegistrationStatus(req.params.id, status, reviewNotes);
      if (status === "approved") {
        sendRegistrationApprovalEmail(updated.email, updated.fullName, updated.companyName, updated.roleType).catch(() => {});
      } else if (status === "rejected") {
        sendRegistrationRejectionEmail(updated.email, updated.fullName, updated.companyName, updated.roleType, reviewNotes).catch(() => {});
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/hr/apply", publicFormLimiterStrict, hrUpload.single("document"), async (req, res) => {
    try {
      const { fullName, email, phone, address, roleTitle, aboutYourself } = req.body;
      if (!fullName?.trim() || !email?.trim() || !roleTitle?.trim()) {
        return res.status(400).json({ message: "Full name, email and role are required." });
      }

      let attachmentBase64: string | undefined;
      let attachmentFilename: string | undefined;
      if (req.file) {
        attachmentBase64 = req.file.buffer.toString("base64");
        attachmentFilename = req.file.originalname;
      }

      const [hrSent, ackSent] = await Promise.allSettled([
        sendJobApplicationToHR(fullName, email, phone || "", address || "", roleTitle, aboutYourself || "", attachmentBase64, attachmentFilename),
        sendJobApplicationAcknowledgement(email, fullName, roleTitle),
      ]);

      res.json({
        success: true,
        hrEmailSent: hrSent.status === "fulfilled" && hrSent.value,
        ackEmailSent: ackSent.status === "fulfilled" && ackSent.value,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to submit application." });
    }
  });

  // ── Procurement Checklists ────────────────────────────────────────────────────
  app.get("/api/checklist-templates", requireModule("checklists"), async (_req, res) => {
    try {
      // Idempotent seed of the default Sulphur procurement checklist head.
      const existing = await storage.getChecklistTemplateByName(DEFAULT_CHECKLIST_TEMPLATE.name);
      if (!existing) await storage.createChecklistTemplate(DEFAULT_CHECKLIST_TEMPLATE);
      res.json(await storage.getChecklistTemplates());
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/checklist-templates", requireModule("checklists"), async (req, res) => {
    try {
      const { name, description, objective, stages, riskControls } = req.body;
      if (!name?.trim()) return res.status(400).json({ message: "Name is required" });
      if (!Array.isArray(stages) || stages.length === 0) return res.status(400).json({ message: "At least one stage is required" });
      for (const s of stages) {
        if (!s?.title?.trim() || !Array.isArray(s.items) || !Array.isArray(s.actions)) {
          return res.status(400).json({ message: "Each stage needs a title, items and actions" });
        }
      }
      const t = await storage.createChecklistTemplate({
        name: name.trim(), description, objective,
        stages, riskControls: Array.isArray(riskControls) ? riskControls : [],
      });
      res.json(t);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/checklist-records", requireModule("checklists"), async (req, res) => {
    try {
      const teamMemberId = await getSessionTeamMemberId(req);
      res.json(await storage.getChecklistRecords(teamMemberId));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/checklist-records/:id", requireModule("checklists"), async (req, res) => {
    try {
      const record = await storage.getChecklistRecordById(req.params.id);
      if (!record) return res.status(404).json({ message: "Checklist not found" });
      const teamMemberId = await getSessionTeamMemberId(req);
      if (teamMemberId && record.submittedByTeamMemberId !== teamMemberId) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(record);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/checklist-records", requireModule("checklists"), async (req, res) => {
    try {
      const { templateId, title, commodity, reference, notes } = req.body;
      if (!templateId || !title?.trim()) return res.status(400).json({ message: "Template and title are required" });
      if (!commodity?.trim()) return res.status(400).json({ message: "Product/commodity is required" });
      const template = await storage.getChecklistTemplateById(templateId);
      if (!template) return res.status(404).json({ message: "Checklist template not found" });
      const teamMemberId = await getSessionTeamMemberId(req);
      const record = await storage.createChecklistRecord({
        templateId, title: title.trim(), commodity: commodity.trim(), reference, notes,
        submittedByTeamMemberId: teamMemberId || null,
      });
      res.json(record);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/checklist-records/:id", requireModule("checklists"), async (req, res) => {
    try {
      const record = await storage.getChecklistRecordById(req.params.id);
      if (!record) return res.status(404).json({ message: "Checklist not found" });
      const teamMemberId = await getSessionTeamMemberId(req);
      if (teamMemberId && record.submittedByTeamMemberId !== teamMemberId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { title, commodity, reference, notes, progress, status } = req.body;
      const data: Record<string, unknown> = {};
      if (commodity !== undefined) {
        if (typeof commodity !== "string") return res.status(400).json({ message: "Invalid commodity" });
        data.commodity = commodity.trim() || null;
      }
      if (title !== undefined) {
        if (!String(title).trim()) return res.status(400).json({ message: "Title cannot be empty" });
        data.title = String(title).trim();
      }
      if (reference !== undefined) data.reference = reference;
      if (notes !== undefined) data.notes = notes;
      if (status !== undefined) {
        if (!["in_progress", "completed"].includes(status)) return res.status(400).json({ message: "Invalid status" });
        data.status = status;
      }
      if (progress !== undefined) {
        // Progress is a DELTA merged into the stored progress server-side, so
        // out-of-order / concurrent saves only affect the keys they touched.
        const ITEM_STATUSES = ["pending", "received", "verified", "na"];
        const isPlainObj = (v: unknown): v is Record<string, unknown> =>
          typeof v === "object" && v !== null && !Array.isArray(v);
        if (!isPlainObj(progress)) return res.status(400).json({ message: "Invalid progress" });
        const itemsDelta: Record<string, { status: string; note?: string }> = {};
        if (progress.items !== undefined) {
          if (!isPlainObj(progress.items)) return res.status(400).json({ message: "Invalid progress.items" });
          for (const [k, v] of Object.entries(progress.items)) {
            if (!isPlainObj(v) || !ITEM_STATUSES.includes(v.status as string)) {
              return res.status(400).json({ message: `Invalid item status for ${k}` });
            }
            if (v.note !== undefined && typeof v.note !== "string") {
              return res.status(400).json({ message: `Invalid item note for ${k}` });
            }
            itemsDelta[k] = { status: v.status as string, ...(v.note !== undefined ? { note: v.note as string } : {}) };
          }
        }
        const boolDelta = (section: unknown, name: string): Record<string, boolean> | { error: string } => {
          const out: Record<string, boolean> = {};
          if (section === undefined) return out;
          if (!isPlainObj(section)) return { error: `Invalid progress.${name}` };
          for (const [k, v] of Object.entries(section)) {
            if (typeof v !== "boolean") return { error: `Invalid progress.${name} value for ${k}` };
            out[k] = v;
          }
          return out;
        };
        const actionsDelta = boolDelta(progress.actions, "actions");
        if ("error" in actionsDelta) return res.status(400).json({ message: actionsDelta.error as string });
        const riskDelta = boolDelta(progress.riskControls, "riskControls");
        if ("error" in riskDelta) return res.status(400).json({ message: riskDelta.error as string });
        const current = record.progress || { items: {}, actions: {}, riskControls: {} };
        data.progress = {
          items: { ...(current.items || {}), ...itemsDelta },
          actions: { ...(current.actions || {}), ...actionsDelta },
          riskControls: { ...(current.riskControls || {}), ...riskDelta },
        };
      }
      res.json(await storage.updateChecklistRecord(req.params.id, data));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/checklist-records/:id", requireModule("checklists"), async (req, res) => {
    try {
      const record = await storage.getChecklistRecordById(req.params.id);
      if (!record) return res.status(404).json({ message: "Checklist not found" });
      const teamMemberId = await getSessionTeamMemberId(req);
      if (teamMemberId && record.submittedByTeamMemberId !== teamMemberId) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteChecklistRecord(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Team Task Board ───────────────────────────────────────────────────────────
  app.get("/api/tasks", requireModule("tasks"), async (_req, res) => {
    try {
      const tasks = await storage.getTeamTasks();
      res.json(tasks);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/tasks", requireModule("tasks"), async (req, res) => {
    try {
      const { title, description, priority, status, assignee, dueDate, createdBy } = req.body;
      if (!title) return res.status(400).json({ message: "Title is required" });
      const task = await storage.createTeamTask({ title, description, priority: priority || "medium", status: status || "todo", assignee, dueDate, createdBy });
      notify({
        type: "task_created",
        title: "New task",
        message: `${title}${assignee ? ` — assigned to ${assignee}` : ""}`,
        link: "/tasks",
        severity: priority === "high" ? "warning" : "info",
        module: "tasks",
      });
      res.json(task);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/tasks/:id", requireModule("tasks"), async (req, res) => {
    try {
      const prev = await storage.getTeamTaskById(req.params.id);
      const task = await storage.updateTeamTask(req.params.id, req.body);
      if (prev && req.body?.status && prev.status !== task.status) {
        notify({
          type: "task_status",
          title: `Task ${task.status === "done" ? "completed" : "moved to " + task.status}`,
          message: `${task.title}${task.assignee ? ` — ${task.assignee}` : ""}`,
          link: "/tasks",
          severity: task.status === "done" ? "success" : "info",
          module: "tasks",
        });
      }
      res.json(task);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/tasks/:id", requireModule("tasks"), async (req, res) => {
    try {
      await storage.deleteTeamTask(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/tasks/:id/updates", requireModule("tasks"), async (req, res) => {
    try {
      const updates = await storage.getTaskUpdates(req.params.id);
      res.json(updates);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/tasks/:id/updates", requireModule("tasks"), async (req, res) => {
    try {
      const { author, text } = req.body;
      if (!text) return res.status(400).json({ message: "Text is required" });
      const update = await storage.createTaskUpdate({ taskId: req.params.id, author: author || "Admin", text });
      const task = await storage.getTeamTaskById(req.params.id);
      notify({
        type: "task_update",
        title: `Task update: ${task?.title || "Task"}`,
        message: `${author || "Admin"}: ${text.slice(0, 140)}`,
        link: "/tasks",
        severity: "info",
        module: "tasks",
      });
      res.json(update);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Daily Reports ────────────────────────────────────────────────────────────
  app.get("/api/daily-reports", requireAuth, async (req, res) => {
    try {
      const { date, teamMemberId } = req.query as { date?: string; teamMemberId?: string };
      const filters: { date?: string; teamMemberId?: string } = {};
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) filters.date = date;
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId) return res.status(403).json({ message: "Team-member only" });
        filters.teamMemberId = tmId;
      } else if (teamMemberId) {
        filters.teamMemberId = teamMemberId;
      }
      const reports = await storage.getDailyReports(filters);
      res.json(reports);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/daily-reports", requireAuth, async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.summary || typeof b.summary !== "string" || !b.summary.trim()) {
        return res.status(400).json({ message: "Summary is required" });
      }
      const today = new Date().toISOString().slice(0, 10);
      const reportDate = (typeof b.reportDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.reportDate)) ? b.reportDate : today;
      let teamMemberId: string;
      let teamMemberName: string;
      if (req.session?.role === "team") {
        const tmId = await getSessionTeamMemberId(req);
        if (!tmId) return res.status(403).json({ message: "Team member not found" });
        const tm = await storage.getTeamMemberById(tmId);
        teamMemberId = tmId;
        teamMemberName = tm?.name || req.session.username || "Team Member";
      } else {
        teamMemberId = "admin";
        teamMemberName = "Admin";
      }
      const str = (v: any, max = 2000) => (typeof v === "string" && v.trim()) ? v.trim().slice(0, max) : null;
      const created = await storage.createDailyReport({
        teamMemberId,
        teamMemberName,
        reportDate,
        hoursWorked: str(b.hoursWorked, 20),
        summary: b.summary.trim().slice(0, 4000),
        tasksCompleted: str(b.tasksCompleted, 4000),
        blockers: str(b.blockers, 2000),
        nextSteps: str(b.nextSteps, 2000),
      });
      notify({
        type: "daily_report",
        title: `Daily report — ${teamMemberName}`,
        message: `${reportDate}: ${b.summary.trim().slice(0, 160)}`,
        link: "/tasks",
        severity: b.blockers ? "warning" : "info",
        module: "tasks",
      });
      res.json(created);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/daily-reports/:id", requireAdminAuth, async (req, res) => {
    try {
      await storage.deleteDailyReport(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/kyc/:id", requireAdminAuth, async (req, res) => {
    try {
      const kyc = await storage.getKycApplicationById(req.params.id);
      if (!kyc) return res.status(404).json({ message: "KYC application not found" });
      await storage.deleteKycApplication(req.params.id);
      notify({
        type: "kyc_deleted",
        title: "KYC application deleted",
        message: `${kyc.companyName} (status: ${kyc.status}) was removed by admin`,
        link: "/kyc-admin",
        severity: "warning",
        module: "kyc",
      });
      res.json({ success: true });
    } catch (e: any) {
      console.error("[kyc] delete failed:", e);
      res.status(500).json({ message: e.message || "Failed to delete KYC application" });
    }
  });

  // ── Notifications (admin-only inbox) ─────────────────────────────────────────
  // Cursor-paginated: ?limit=100&cursor=<base64 of createdAtISO|id>. Returns
  // { items, total, nextCursor } — nextCursor null when history is exhausted.
  app.get("/api/notifications", requireAdminAuth, async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "100"), 10) || 100, 1), 200);
      let cursor: { createdAt: Date; id: string } | undefined;
      if (typeof req.query.cursor === "string" && req.query.cursor) {
        try {
          const decoded = Buffer.from(req.query.cursor, "base64url").toString("utf8");
          const sep = decoded.indexOf("|");
          const createdAt = new Date(decoded.slice(0, sep));
          const id = decoded.slice(sep + 1);
          if (sep > 0 && !isNaN(createdAt.getTime()) && id) cursor = { createdAt, id };
        } catch {}
        if (!cursor) return res.status(400).json({ message: "Invalid cursor" });
      }
      const { items, total } = await storage.getNotificationsPage({ limit, cursor });
      const last = items[items.length - 1];
      const nextCursor = items.length === limit && last
        ? Buffer.from(`${new Date(last.createdAt as any).toISOString()}|${last.id}`).toString("base64url")
        : null;
      res.json({ items, total, nextCursor });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      if (req.session?.role !== "admin") return res.json({ count: 0 });
      const count = await storage.getUnreadNotificationCount();
      res.json({ count });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/notifications/:id/read", requireAdminAuth, async (req, res) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/notifications/read-all", requireAdminAuth, async (_req, res) => {
    try {
      await storage.markAllNotificationsRead();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/notifications/:id", requireAdminAuth, async (req, res) => {
    try {
      await storage.deleteNotification(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── OneDrive Database Backup ─────────────────────────────────────────────────
  app.post("/api/backup/run", requireAdminAuth, async (_req, res) => {
    try {
      const { runBackup } = await import("./onedrive-backup");
      const result = await runBackup();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Backup failed" });
    }
  });

  app.get("/api/backup/list", requireAdminAuth, async (_req, res) => {
    try {
      const { listBackups } = await import("./onedrive-backup");
      const files = await listBackups();
      res.json(files);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to list backups" });
    }
  });

  return httpServer;
}

// Child document types that must exist at most ONCE per parent. These are the
// signature-driven bank/report children a signed SPA fans out to; the manual
// create-next route uses the same atomic no-existing-child guard as the
// automatic sign chain for them, so a manual retry after an auto-chain
// failure succeeds exactly once and a duplicate attempt is refused (409)
// instead of silently creating a second bank draft.
export const ATOMIC_NEXT_TYPES = new Set(["DLC_MT700", "PBG_MT760", "TFR", "PI"]);

export function parseSpaIdentity(
  content: string,
  fallbackNumber?: string | null,
): { spaNumber: string; spaDate: string } {
  const clean = (value?: string | null) => {
    const trimmed = (value || "").trim();
    return !trimmed || /^_+$/.test(trimmed) ? "" : trimmed;
  };
  return {
    spaNumber: clean(content.match(/^SPA No:\s*(.+)$/im)?.[1]) || clean(fallbackNumber) || "_______________",
    spaDate: clean(content.match(/^Date:\s*(.+)$/im)?.[1]) || "_______________",
  };
}

function formatAddendumDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Dedicated creation service for SPA addenda. Unlike generic create-next, this
// accepts and validates the user's selected clauses, leaves the Original SPA
// unchanged, and persists the addendum as a normal linked document with files.
export async function createSpaAddendumForParent(
  parentDoc: any,
  rawInput: unknown,
): Promise<
  | { ok: true; doc: Document }
  | { ok: false; status: number; message: string }
> {
  const gate = evaluateDocTransition({
    parentDocType: String(parentDoc?.docType || ""),
    nextDocType: "ADDENDUM",
    recipientResponse: parentDoc?.recipientResponse,
    hasAnySignature: !!(parentDoc?.buyerSignature || parentDoc?.sellerSignature),
  });
  if (!gate.ok) {
    return { ok: false, status: gate.status ?? 400, message: gate.message ?? "Only an SPA can create an addendum" };
  }
  const validated = validateSpaAddendumInput(rawInput);
  if (!validated.ok) return validated;

  const spa = parseSpaDocFields(parentDoc.content || "");
  const identity = parseSpaIdentity(parentDoc.content || "", parentDoc.dealRecapNumber || parentDoc.tradeRef);
  const effectiveDate = formatAddendumDate(validated.data.effectiveDate);
  const buyerDetails: PartyDetails = {
    name: spa.buyerName,
    address: spa.buyerAddress,
    contact: parentDoc.buyerEmail || "",
    coName: spa.coBuyerName || undefined,
    coAddress: spa.coBuyerAddress || undefined,
    coContact: spa.coBuyerContact || undefined,
  };
  const sellerDetails: PartyDetails = {
    name: spa.sellerName,
    address: spa.sellerAddress,
    contact: parentDoc.sellerEmail || "",
    coName: spa.coSellerName || undefined,
    coAddress: spa.coSellerAddress || undefined,
    coContact: spa.coSellerContact || undefined,
  };
  const productDetails: any = {
    commodity: spa.commodity,
    origin: spa.origin,
    quantity: spa.quantity,
    packing: spa.packing || undefined,
    incoterm: spa.incoterm,
    price: spa.price,
    currency: spa.currency,
    laycan: spa.laycan,
    loadingPort: spa.loadingPort || undefined,
    dischargePort: spa.dischargePort || undefined,
    paymentTerms: spa.paymentTerms,
    qualitySpecs: spa.qualitySpecs,
    dealRecapNumber: parentDoc.dealRecapNumber || identity.spaNumber,
  };

  let trade: Trade | undefined;
  if (parentDoc.tradeRef) {
    trade = (await storage.getTrades()).find((item) => item.tradeRef === parentDoc.tradeRef);
  }
  let content = "";
  const allocation = await storage.createNumberedSpaAddendum(
    parentDoc.id,
    validated.data.addendumNumber,
    (addendumNumber) => {
      const addendumData: SpaAddendumData = {
        addendumNumber,
        effectiveDate,
        originalSpaNumber: identity.spaNumber,
        originalSpaDate: identity.spaDate,
        amendments: validated.data.amendments,
      };
      content = generateDocumentContent("ADDENDUM", trade, buyerDetails, sellerDetails, {
        ...productDetails,
        addendumData,
      });
      return {
        docType: "ADDENDUM",
        title: `Addendum ${addendumNumber} to ${parentDoc.title}`,
        tradeRef: parentDoc.tradeRef || null,
        enquiryRef: parentDoc.enquiryRef || null,
        dealRecapNumber: parentDoc.dealRecapNumber || null,
        parentDocId: parentDoc.id,
        status: "draft",
        adminChecks: buildAdminChecks("ADDENDUM"),
        content,
        buyerEmail: parentDoc.buyerEmail || null,
        sellerEmail: parentDoc.sellerEmail || null,
        submittedByTeamMemberId: parentDoc.submittedByTeamMemberId || null,
        submittedByClientId: parentDoc.submittedByClientId || null,
      };
    },
  );
  if (!allocation) {
    return {
      ok: false,
      status: 409,
      message: "That addendum number is already used for this SPA",
    };
  }
  const created = allocation.document;

  const submittedByLabel = await getDocSubmittedByLabel(created.submittedByTeamMemberId);
  const agentCode = parentDoc.agentCode || await resolveAgentCode({
    buyerEmail: created.buyerEmail,
    sellerEmail: created.sellerEmail,
    sentToClientId: null,
    submittedByTeamMemberId: created.submittedByTeamMemberId || null,
  });
  const teamMemberCode = (await resolveTeamMemberCode({
    enquiryRef: created.enquiryRef || null,
    submittedByTeamMemberId: created.submittedByTeamMemberId || null,
  })) || parentDoc.teamMemberCode || null;
  const stampFields: Partial<Document> = {};
  if (agentCode) stampFields.agentCode = agentCode;
  if (teamMemberCode) stampFields.teamMemberCode = teamMemberCode;
  if (Object.keys(stampFields).length) await storage.updateDocument(created.id, stampFields);

  const files = await runFileGenerationOrNotify(created, "pipeline_create", async () => {
    const docxPath = await generateDocx(
      created.id, created.title, content, submittedByLabel,
      agentCode || undefined, teamMemberCode || undefined, "ADDENDUM",
    );
    const pdfPath = await generatePdf(
      created.id, created.title, content, submittedByLabel,
      agentCode || undefined, teamMemberCode || undefined, "ADDENDUM",
    );
    return { docxPath, pdfPath };
  });
  if (!files) return { ok: true, doc: created };
  const updated = await storage.updateDocument(created.id, {
    ...stampFields,
    docxPath: files.docxPath,
    pdfPath: files.pdfPath,
  });
  return { ok: true, doc: updated };
}

// Service function behind POST /api/documents/:id/create-next (after the
// caller's ownership check): applies the transition gate, then derives the
// child — atomically for once-only child types. Exported so tests exercise
// the exact logic the manual recovery route runs.
export async function createNextDocumentForParent(
  parentDoc: any,
  nextDocType: string,
  isAdminCaller: boolean,
  options?: {
    sourceRevision?: string;
    preparedFields?: unknown;
  },
): Promise<{ ok: true; doc: any } | { ok: false; status: number; message: string }> {
  if (["DLC_MT700", "PBG_MT760"].includes(nextDocType) && !lpgStsReviewState(parentDoc).cleared) {
    return { ok: false, status: 409, message: "LPG STS SPA requires transaction-specific administrator clearance before generating bank drafts." };
  }
  if (nextDocType === "ADDENDUM") {
    return {
      ok: false,
      status: 400,
      message: "An SPA addendum requires selected clauses; use the dedicated addendum form",
    };
  }
  const gate = evaluateDocTransition({
    parentDocType: parentDoc.docType,
    nextDocType,
    recipientResponse: parentDoc.recipientResponse,
    hasAnySignature: !!(parentDoc.buyerSignature || parentDoc.sellerSignature),
  });
  if (!gate.ok) {
    return { ok: false, status: gate.status ?? 400, message: gate.message ?? "Transition not allowed" };
  }
  if (nextDocType === "PI") {
    const sourceEnquiry = parentDoc.enquiryRef
      ? await storage.getTradeEnquiryByRef(parentDoc.enquiryRef)
      : null;
    const piGate = evaluateProformaInvoiceEligibility({
      isAdminCaller,
      parentDocType: parentDoc.docType,
      enquirySide: sourceEnquiry?.side,
    });
    if (!piGate.ok) return piGate;
    if (options?.preparedFields && options.sourceRevision !== buildProformaInvoiceSourceRevision(parentDoc)) {
      return {
        ok: false,
        status: 409,
        message: "The SPA changed while the Proforma Invoice was being prepared. Reopen the form to review the latest details.",
      };
    }
  }
  const atomic = ATOMIC_NEXT_TYPES.has(nextDocType);
  const created = await deriveNextDocument(parentDoc, nextDocType, isAdminCaller, atomic, {
    preparedPi: options?.preparedFields,
  });
  if (!created) {
    if (nextDocType === "PI") {
      const freshParent = await storage.getDocumentById(parentDoc.id);
      const freshEnquiry = freshParent?.enquiryRef
        ? await storage.getTradeEnquiryByRef(freshParent.enquiryRef)
        : null;
      const freshGate = evaluateProformaInvoiceEligibility({
        isAdminCaller,
        parentDocType: freshParent?.docType,
        enquirySide: freshEnquiry?.side,
      });
      if (!freshGate.ok) return freshGate;
      if (freshParent?.content !== parentDoc.content) {
        return {
          ok: false,
          status: 409,
          message: "The SPA changed while the Proforma Invoice was being prepared. Reopen the PI form and review the latest SPA content.",
        };
      }
    }
    return { ok: false, status: 409, message: `A ${nextDocType} already exists for this document` };
  }
  return { ok: true, doc: created };
}

export async function prepareProformaInvoiceForParent(
  parentDoc: any,
  isAdminCaller: boolean,
  preparedFields?: unknown,
): Promise<
  { ok: true; preparation: ProformaInvoicePreparation }
  | { ok: false; status: number; message: string }
> {
  const sourceEnquiry = parentDoc.enquiryRef
    ? await storage.getTradeEnquiryByRef(parentDoc.enquiryRef)
    : null;
  const gate = evaluateProformaInvoiceEligibility({
    isAdminCaller,
    parentDocType: parentDoc.docType,
    enquirySide: sourceEnquiry?.side,
  });
  if (!gate.ok) return gate;
  const existingPi = (await storage.getDocuments()).some(
    (doc) => doc.parentDocId === parentDoc.id && doc.docType === "PI",
  );
  if (existingPi) {
    return { ok: false, status: 409, message: "A PI already exists for this SPA" };
  }
  const preview = await deriveNextDocument(parentDoc, "PI", isAdminCaller, false, {
    previewOnly: true,
    preparedPi: preparedFields,
  }) as { fields: PreparedProformaInvoiceFields; content: string } | null;
  if (!preview) {
    return { ok: false, status: 500, message: "Could not prepare the Proforma Invoice" };
  }
  return {
    ok: true,
    preparation: {
      sourceRevision: buildProformaInvoiceSourceRevision(parentDoc),
      fields: preview.fields,
      content: preview.content,
    },
  };
}

// Shared derivation used by the manual create-next route AND the automatic
// signature-driven chain (FCO signed → Deal Recap; Deal Recap signed → SPA;
// SPA signed → TFR). Parses the parent document's content, enriches party
// details from approved KYC (subject to the enquiry-name authorization
// boundary for non-admin callers), generates the content + DOCX/PDF files,
// and returns the newly created document.
// Selects the PIC (person-in-charge) value for a party on a derived document.
// Priority: the PIC parsed from the parent document's rendered text; else, ONLY
// when the parent is an LOI, the approved-KYC contact name; else empty string
// (so the template's contact fallback applies). Exported pure so tests can
// cover the KYC-fallback branch without a DB.
export function picForDerivedParty(
  parsedPic: string | null | undefined,
  parentDocType: string | null | undefined,
  kycContactName: string | null | undefined,
): string {
  return parsedPic || (parentDocType === "LOI" ? kycContactName || "" : "");
}

export async function deriveNextDocument(
  parentDoc: any,
  nextDocType: string,
  isAdminCaller: boolean,
  atomicIfNoChild = false,
  options?: { previewOnly?: boolean; preparedPi?: unknown },
): Promise<any> {
    if (["DLC_MT700", "PBG_MT760"].includes(nextDocType)) assertLpgStsCleared(parentDoc);
    let buyerName = "", sellerName = "", commodity = "", origin = "", quantity = "", packing = "";
    let incoterm = "", price = "", paymentTerms = "", qualitySpecs = "";
    let parsedCoBuyerName = "", parsedCoBuyerAddress = "", parsedCoBuyerContact = "";
    let parsedCoSellerName = "", parsedCoSellerAddress = "", parsedCoSellerContact = "";
    let laycan = "", currency = "USD", contractConfirmation = "", docsForPayment = "", otherTerms = "", compliance = "", specialNote = "";
    let loadingPort = "", dischargePort = "";
    let parsedBuyerAddress = "", parsedSellerAddress = "";
    let parsedBuyerPic = "", parsedSellerPic = "";

    if (parentDoc.docType === "SPA") {
      // TFR / DLC Draft derived from a signed SPA: the SPA is a long-form
      // contract, so it needs its own parser (repeated party labels under
      // SELLER/BUYER headings, "Total:"/"Contract Price:" commercial lines).
      const spa = parseSpaDocFields(parentDoc.content || "");
      buyerName = spa.buyerName; sellerName = spa.sellerName; commodity = spa.commodity;
      origin = spa.origin; quantity = spa.quantity; packing = spa.packing; incoterm = spa.incoterm;
      price = spa.price; paymentTerms = spa.paymentTerms; qualitySpecs = spa.qualitySpecs;
      laycan = spa.laycan; currency = spa.currency; contractConfirmation = spa.contractConfirmation;
      loadingPort = spa.loadingPort; dischargePort = spa.dischargePort;
      docsForPayment = spa.docsForPayment; otherTerms = spa.otherTerms; compliance = spa.compliance;
      specialNote = spa.specialNote;
      parsedBuyerAddress = spa.buyerAddress; parsedSellerAddress = spa.sellerAddress;
      parsedCoBuyerName = spa.coBuyerName; parsedCoBuyerAddress = spa.coBuyerAddress; parsedCoBuyerContact = spa.coBuyerContact;
      parsedCoSellerName = spa.coSellerName; parsedCoSellerAddress = spa.coSellerAddress; parsedCoSellerContact = spa.coSellerContact;
    } else if (parentDoc.docType === "LOI") {
      // Derive an SPA directly from a Purchase LOI, carrying over every detail
      // captured in the LOI (3-column numbered table + party blocks).
      const loi = parseLoiForSpa(parentDoc.content || "");
      buyerName = loi.buyerName; sellerName = loi.sellerName; commodity = loi.commodity;
      origin = loi.origin; quantity = loi.quantity; incoterm = loi.incoterm;
      price = loi.price; paymentTerms = loi.paymentTerms; qualitySpecs = loi.qualitySpecs;
      laycan = loi.laycan; currency = loi.currency; contractConfirmation = loi.contractConfirmation;
      loadingPort = loi.loadingPort; dischargePort = loi.dischargePort;
      docsForPayment = loi.docsForPayment; otherTerms = loi.otherTerms; compliance = loi.compliance;
      specialNote = loi.specialNote;
      parsedCoBuyerName = loi.coBuyerName; parsedCoBuyerAddress = loi.coBuyerAddress; parsedCoBuyerContact = loi.coBuyerContact;
      parsedCoSellerName = loi.coSellerName; parsedCoSellerAddress = loi.coSellerAddress; parsedCoSellerContact = loi.coSellerContact;
      parsedBuyerPic = loi.buyerPic || ""; parsedSellerPic = loi.sellerPic || "";
    } else {
      // FCO/SCO/ICPO/Deal Recap: carry over every detail from the generated
      // document (key:value blocks + reconstructed commodity-spec table).
      const parsed = parseGeneratedDocFields(parentDoc.content || "");
      buyerName = parsed.buyerName; sellerName = parsed.sellerName; commodity = parsed.commodity;
      origin = parsed.origin; quantity = parsed.quantity; packing = parsed.packing; incoterm = parsed.incoterm;
      price = parsed.price; paymentTerms = parsed.paymentTerms; qualitySpecs = parsed.qualitySpecs;
      laycan = parsed.laycan; currency = parsed.currency; contractConfirmation = parsed.contractConfirmation;
      loadingPort = parsed.loadingPort; dischargePort = parsed.dischargePort;
      docsForPayment = parsed.docsForPayment; otherTerms = parsed.otherTerms; compliance = parsed.compliance;
      specialNote = parsed.specialNote;
      parsedCoBuyerName = parsed.coBuyerName; parsedCoBuyerAddress = parsed.coBuyerAddress; parsedCoBuyerContact = parsed.coBuyerContact;
      parsedCoSellerName = parsed.coSellerName; parsedCoSellerAddress = parsed.coSellerAddress; parsedCoSellerContact = parsed.coSellerContact;
    }

    let dealRecapNumber: string | null = null;
    let enquiryRef = parentDoc.enquiryRef || null;

    if (nextDocType === "DEAL_RECAP" || nextDocType === "SPA") {
      const buyerName3 = (buyerName || "XXX").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
      const sellerName3 = (sellerName || "XXX").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
      const now = new Date();
      const ddmm = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}`;

      if (nextDocType === "SPA" && parentDoc.dealRecapNumber) {
        dealRecapNumber = parentDoc.dealRecapNumber;
      } else {
        const allDocs = await storage.getDocuments();
        const prefix = `${buyerName3}/${sellerName3}-${ddmm}`;
        const samePrefix = allDocs.filter(d => d.dealRecapNumber && d.dealRecapNumber.startsWith(prefix));
        const serial = String(samePrefix.length + 1).padStart(3, "0");
        dealRecapNumber = `${prefix}-${serial}`;
      }
    } else if (nextDocType === "TFR" || nextDocType === "DLC_MT700" || nextDocType === "PBG_MT760" || nextDocType === "PI") {
      // Carry the recap/contract number through so the TFR / DLC / PBG Draft
      // references the same deal chain as the SPA it was derived from.
      dealRecapNumber = parentDoc.dealRecapNumber || null;
    }

    // Enrich the party blocks with approved-KYC company profiles (registered
    // address, banking details, contact) so a derived SPA carries every party
    // detail automatically — the LOI/Recap only captures commodity and terms,
    // not the buyer/seller address or bank, which live on the KYC record.
    //
    // Authorization boundary: KYC records contain sensitive banking and contact
    // data. For non-admin callers (team/client) the enrichment must only return
    // KYC data for company names that are registered on the enquiry that already
    // authorized the document workflow. This prevents a team member from
    // embedding an arbitrary approved company name in a parent document and then
    // using create-next to exfiltrate that company's banking/address data.
    // Joint parties: parent docs render a joint party as
    // "Primary Co jointly with Second Co" (partyName in documentTemplates).
    // Split that back so KYC enrichment looks up the PRIMARY company (a
    // combined string never matches a KYC record) and the co-company is
    // carried separately with its own details.
    const buyerSplit = splitJointPartyName(buyerName);
    const sellerSplit = splitJointPartyName(sellerName);
    buyerName = buyerSplit.primary || buyerName;
    sellerName = sellerSplit.primary || sellerName;

    // The source enquiry is the authoritative record for co-seller/co-buyer
    // details (address/contact live there, not in the parent's rendered text).
    const sourceEnquiry = enquiryRef ? await storage.getTradeEnquiryByRef(enquiryRef) : null;
    const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
    let coBuyerName = parsedCoBuyerName || buyerSplit.co, coBuyerAddress = parsedCoBuyerAddress, coBuyerContact = parsedCoBuyerContact;
    let coSellerName = parsedCoSellerName || sellerSplit.co, coSellerAddress = parsedCoSellerAddress, coSellerContact = parsedCoSellerContact;
    if (sourceEnquiry) {
      // Prefer the enquiry's co-party record when it matches (or when the
      // parent text carried no co name at all but the enquiry has one).
      if (sourceEnquiry.coBuyerName && (!coBuyerName || norm(coBuyerName) === norm(sourceEnquiry.coBuyerName))) {
        coBuyerName = sourceEnquiry.coBuyerName;
        coBuyerAddress = sourceEnquiry.coBuyerAddress || "";
        coBuyerContact = sourceEnquiry.coBuyerContact || "";
      }
      if (sourceEnquiry.coSellerName && (!coSellerName || norm(coSellerName) === norm(sourceEnquiry.coSellerName))) {
        coSellerName = sourceEnquiry.coSellerName;
        coSellerAddress = sourceEnquiry.coSellerAddress || "";
        coSellerContact = sourceEnquiry.coSellerContact || "";
      }
    }

    let kycAllowedBuyerName: string | null = null;
    let kycAllowedSellerName: string | null = null;
    let kycAllowedCoBuyerName: string | null = null;
    let kycAllowedCoSellerName: string | null = null;

    if (isAdminCaller) {
      kycAllowedBuyerName = buyerName || null;
      kycAllowedSellerName = sellerName || null;
      kycAllowedCoBuyerName = coBuyerName || null;
      kycAllowedCoSellerName = coSellerName || null;
    } else if (sourceEnquiry) {
      if (buyerName && sourceEnquiry.buyerName && norm(buyerName) === norm(sourceEnquiry.buyerName)) {
        kycAllowedBuyerName = buyerName;
      }
      if (sellerName && sourceEnquiry.sellerName && norm(sellerName) === norm(sourceEnquiry.sellerName)) {
        kycAllowedSellerName = sellerName;
      }
      // Same authorization boundary for co-parties: only companies named on
      // the enquiry this document chain belongs to may be KYC-enriched.
      if (coBuyerName && sourceEnquiry.coBuyerName && norm(coBuyerName) === norm(sourceEnquiry.coBuyerName)) {
        kycAllowedCoBuyerName = coBuyerName;
      }
      if (coSellerName && sourceEnquiry.coSellerName && norm(coSellerName) === norm(sourceEnquiry.coSellerName)) {
        kycAllowedCoSellerName = coSellerName;
      }
    }

    const buyerKyc = kycAllowedBuyerName ? await storage.getApprovedKycByCompanyName(kycAllowedBuyerName) : undefined;
    const sellerKyc = kycAllowedSellerName ? await storage.getApprovedKycByCompanyName(kycAllowedSellerName) : undefined;
    const coBuyerKyc = (kycAllowedCoBuyerName && (!coBuyerAddress || !coBuyerContact)) ? await storage.getApprovedKycByCompanyName(kycAllowedCoBuyerName) : undefined;
    const coSellerKyc = (kycAllowedCoSellerName && (!coSellerAddress || !coSellerContact)) ? await storage.getApprovedKycByCompanyName(kycAllowedCoSellerName) : undefined;

    const buyerDetails: PartyDetails = {
      name: buyerName,
      address: buyerKyc?.registeredAddress || parsedBuyerAddress || "",
      contact: parentDoc.buyerEmail || buyerKyc?.contactEmail || "",
      // PIC carry-over is an LOI→SPA behavior only; other chains keep the
      // template's contact fallback for the PIC line.
      pic: picForDerivedParty(parsedBuyerPic, parentDoc.docType, buyerKyc?.contactName),
      bank: buyerKyc?.bankName || "",
      swift: buyerKyc?.swiftCode || "",
      coName: coBuyerName || undefined,
      coAddress: (coBuyerAddress || coBuyerKyc?.registeredAddress || "") || undefined,
      coContact: (coBuyerContact || coBuyerKyc?.contactEmail || "") || undefined,
    };
    const sellerDetails: PartyDetails = {
      name: sellerName,
      address: sellerKyc?.registeredAddress || parsedSellerAddress || "",
      contact: parentDoc.sellerEmail || sellerKyc?.contactEmail || "",
      pic: picForDerivedParty(parsedSellerPic, parentDoc.docType, sellerKyc?.contactName),
      bank: sellerKyc?.bankName || "",
      swift: sellerKyc?.swiftCode || "",
      coName: coSellerName || undefined,
      coAddress: (coSellerAddress || coSellerKyc?.registeredAddress || "") || undefined,
      coContact: (coSellerContact || coSellerKyc?.contactEmail || "") || undefined,
    };
    const productDetails: any = { commodity, origin, quantity, packing: packing || undefined, incoterm, price, paymentTerms, qualitySpecs, currency, laycan, loadingPort: loadingPort || undefined, dischargePort: dischargePort || undefined, contractConfirmation, docsForPayment, otherTerms, compliance, specialNote: specialNote || undefined, dealRecapNumber: dealRecapNumber || undefined };

    if (nextDocType === "PI") {
      const identity = parseSpaIdentity(parentDoc.content || "", parentDoc.dealRecapNumber || parentDoc.tradeRef);
      productDetails.piData = buildProformaInvoiceDataFromSpa({
        spaNumber: identity.spaNumber,
        quantity,
        price,
        incoterm,
        laycan,
        packing,
        validUntil: sourceEnquiry?.validity || undefined,
      });
    }

    let preparedPi: PreparedProformaInvoiceFields | null = null;
    if (nextDocType === "PI" && options?.preparedPi) {
      preparedPi = sanitizePreparedProformaInvoiceFields(options.preparedPi);
      buyerDetails.name = preparedPi.buyerName;
      buyerDetails.address = preparedPi.buyerAddress;
      buyerDetails.contact = preparedPi.buyerContact;
      sellerDetails.name = preparedPi.sellerName;
      sellerDetails.address = preparedPi.sellerAddress;
      sellerDetails.contact = preparedPi.sellerContact;
      sellerDetails.bank = preparedPi.sellerBank;
      sellerDetails.swift = preparedPi.sellerSwift;
      Object.assign(productDetails, {
        commodity: preparedPi.commodity,
        origin: preparedPi.origin,
        quantity: preparedPi.quantity,
        loadingPort: preparedPi.loadingPort,
        dischargePort: preparedPi.dischargePort,
        incoterm: preparedPi.deliveryTerm,
        laycan: preparedPi.shipmentWindow,
        packing: preparedPi.packing,
        price: preparedPi.price,
        currency: preparedPi.currency,
        paymentTerms: preparedPi.paymentTerms,
        validity: preparedPi.tolerance,
        piData: {
          invoiceNumber: preparedPi.invoiceNumber,
          invoiceDate: preparedPi.invoiceDate,
          spaNumber: preparedPi.spaNumber,
          validUntil: preparedPi.validUntil,
          deliveryTerm: preparedPi.deliveryTerm,
          shipmentWindow: preparedPi.shipmentWindow,
          packing: preparedPi.packing,
          totalAmount: preparedPi.totalAmount,
        },
      });
    }

    if (nextDocType === "TFR") {
      // Pre-fill the feasibility report's executive summary from the SPA's
      // commercial terms. A document-chain TFR covers a single transaction
      // leg, so the same terms populate both the Import and Export columns
      // and the risk team refines them during review.
      const num = (s: string) => parseFloat(((s || "").match(/[\d,]+(?:\.\d+)?/)?.[0] || "").replace(/,/g, "")) || 0;
      const qtyNum = num(quantity);
      const priceNum = num(price);
      const contractValue = qtyNum && priceNum ? `${currency} ${(qtyNum * priceNum).toLocaleString()}` : "";
      productDetails.tfrData = {
        reference: dealRecapNumber || parentDoc.enquiryRef || parentDoc.title || "",
        // Bank addressee heading — pre-filled from the buyer's approved KYC
        // bank when known, otherwise left blank for manual completion.
        addressedToName: buyerKyc?.bankName || "",
        addressedToAddress: buyerKyc?.bankAddress || "",
        productImport: commodity, productExport: commodity,
        originImport: origin, originExport: origin,
        quantityImport: quantity, quantityExport: quantity,
        priceImport: price, priceExport: price,
        contractValueImport: contractValue, contractValueExport: contractValue,
        deliveryTermsImport: incoterm, deliveryTermsExport: incoterm,
        paymentTermsImport: paymentTerms, paymentTermsExport: paymentTerms,
        partyImport: sellerName, partyExport: buyerName,
      };
    }

    if (nextDocType === "DLC_MT700") {
      // Pre-fill the bank LC draft from the SPA's commercial terms —
      // applicant/beneficiary, credit amount, ports and goods. Bank-side
      // fields (BICs, credit number, dates) stay as placeholders for the
      // issuing bank to complete.
      productDetails.dlcData = buildDlcDataFromSpa({
        buyerName,
        buyerAddress: buyerDetails.address,
        sellerName,
        sellerAddress: sellerDetails.address,
        commodity,
        origin,
        quantity,
        price,
        currency,
        incoterm,
        loadingPort,
        dischargePort,
        qualitySpecs,
      });
    }

    if (nextDocType === "PBG_MT760") {
      // Pre-fill the performance guarantee draft from the SPA: applicant =
      // seller (whose performance is guaranteed), beneficiary = buyer.
      // Bank fields come from KYC enrichment (seller's bank issues, buyer's
      // bank receives); guarantee amount and dates stay as placeholders.
      productDetails.pbgData = buildPbgDataFromSpa({
        buyerName,
        buyerAddress: buyerDetails.address,
        buyerSwift: buyerDetails.swift,
        sellerName,
        sellerAddress: sellerDetails.address,
        sellerBank: sellerDetails.bank,
        sellerSwift: sellerDetails.swift,
        commodity,
        origin,
        quantity,
        currency,
        dischargePort,
        spaNumber: dealRecapNumber || parentDoc.dealRecapNumber || "",
      });
    }

    let trade: Trade | undefined;
    if (parentDoc.tradeRef) {
      const trades = await storage.getTrades();
      trade = trades.find(t => t.tradeRef === parentDoc.tradeRef);
    }

    const content = generateDocumentContent(nextDocType, trade, buyerDetails, sellerDetails, productDetails);

    const title = preparedPi?.title || `${nextDocType === "PI" ? "Proforma Invoice" : nextDocType} - ${dealRecapNumber || parentDoc.title}`;
    if (nextDocType === "PI" && options?.previewOnly) {
      const pi = productDetails.piData || {};
      return {
        content,
        fields: {
          title,
          invoiceNumber: pi.invoiceNumber || "",
          invoiceDate: pi.invoiceDate || new Date().toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }),
          spaNumber: pi.spaNumber || "",
          validUntil: pi.validUntil || "",
          sellerName: sellerDetails.name || "",
          sellerAddress: sellerDetails.address || "",
          sellerContact: sellerDetails.contact || "",
          sellerBank: sellerDetails.bank || "",
          sellerSwift: sellerDetails.swift || "",
          buyerName: buyerDetails.name || "",
          buyerAddress: buyerDetails.address || "",
          buyerContact: buyerDetails.contact || "",
          commodity: productDetails.commodity || "",
          origin: productDetails.origin || "",
          quantity: productDetails.quantity || "",
          loadingPort: productDetails.loadingPort || "",
          dischargePort: productDetails.dischargePort || "",
          deliveryTerm: pi.deliveryTerm || productDetails.incoterm || "",
          shipmentWindow: pi.shipmentWindow || productDetails.laycan || "",
          packing: pi.packing || productDetails.packing || "",
          price: productDetails.price || "",
          currency: productDetails.currency || "USD",
          paymentTerms: productDetails.paymentTerms || "",
          tolerance: productDetails.validity || "As per SPA",
          totalAmount: pi.totalAmount || "",
        } satisfies PreparedProformaInvoiceFields,
      };
    }
    const insertDoc = {
      docType: nextDocType,
      title,
      tradeRef: parentDoc.tradeRef,
      enquiryRef,
      dealRecapNumber,
      parentDocId: parentDoc.id,
      // Derived documents follow the same no-approval policy as directly
      // created ones: they are only reachable by team/admin (doc-templates
      // module), so they start ready-to-sign ("draft") rather than requiring
      // a further admin review.
      status: nextDocType === "SPA" && (sourceEnquiry?.side === "buy" || sourceEnquiry?.side === "sell")
        ? "pending_review"
        : "draft",
      adminChecks: buildAdminChecks(nextDocType),
      content: content || `Document created from ${parentDoc.docType}: ${parentDoc.title}`,
      buyerEmail: parentDoc.buyerEmail,
      sellerEmail: parentDoc.sellerEmail,
      submittedByTeamMemberId: parentDoc.submittedByTeamMemberId || null,
    };

    // Atomic child creation serializes concurrent requests on the parent. PI
    // creation also revalidates the SPA identity, enquiry side, and content
    // under that same row lock so stale terms cannot produce an invoice.
    const result = (atomicIfNoChild || (isLpgStsSpa(parentDoc) && ["DLC_MT700", "PBG_MT760"].includes(nextDocType)))
      ? await storage.createDocumentIfNoChild(
          insertDoc,
          parentDoc.id,
          nextDocType,
          nextDocType === "PI"
            ? {
                parentDocType: "SPA",
                enquirySide: sourceEnquiry?.side,
                expectedParentContent: parentDoc.content ?? null,
              }
            : ["DLC_MT700", "PBG_MT760"].includes(nextDocType) && isLpgStsSpa(parentDoc)
              ? { parentDocType: "SPA", expectedParentContent: parentDoc.content ?? null }
              : undefined,
        )
      : await storage.createDocument(insertDoc);
    if (!result) return null;

    try {
      const submittedByLabelNext = await getDocSubmittedByLabel(result.submittedByTeamMemberId);
      const nextAgentCode = (parentDoc as any).agentCode || await resolveAgentCode({
        buyerEmail: result.buyerEmail,
        sellerEmail: result.sellerEmail,
        sentToClientId: null,
        submittedByTeamMemberId: result.submittedByTeamMemberId || null,
      });
      // Prefer the enquiry's CURRENT allocation so re-allocation propagates to
      // newly derived docs; fall back to the parent doc's stamped code.
      const nextTeamMemberCode = (await resolveTeamMemberCode({
        enquiryRef: result.enquiryRef || null,
        submittedByTeamMemberId: result.submittedByTeamMemberId || null,
      })) || (parentDoc as any).teamMemberCode || null;
      const updateFields: any = {};
      if (nextAgentCode) updateFields.agentCode = nextAgentCode;
      if (nextTeamMemberCode) updateFields.teamMemberCode = nextTeamMemberCode;
      if (Object.keys(updateFields).length) {
        await storage.updateDocument(result.id, updateFields);
      }
      const docxPath = await generateDocx(result.id, result.title, result.content || "", submittedByLabelNext, nextAgentCode || undefined, nextTeamMemberCode || undefined, result.docType);
      let pdfPath: string | undefined;
      if (nextDocType !== "LOI") {
        pdfPath = await generatePdf(result.id, result.title, result.content || "", submittedByLabelNext, nextAgentCode || undefined, nextTeamMemberCode || undefined, result.docType);
      }
      const updated = await storage.updateDocument(result.id, { docxPath, ...(pdfPath ? { pdfPath } : {}) });
      return updated;
    } catch (fileErr) {
      console.error("[docs] File generation error (document still created):", fileErr);
      return result;
    }
}

async function saveTfrRecipientFromDetails(cleaned: Record<string, string>): Promise<void> {
  if (!cleaned.addressedToName) return;
  try {
    await storage.upsertTfrRecipient({
      name: cleaned.addressedToName,
      address: cleaned.addressedToAddress ?? null,
      attn: cleaned.addressedToAttn ?? null,
      notes: null,
    });
  } catch (recErr) {
    console.error("[deals] Failed to save TFR recipient:", recErr);
  }
}
