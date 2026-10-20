import type { Document as Doc, TradeEnquiry } from "@shared/schema";
import {
  CheckCircle2,
  Clock,
  FileSignature,
  AlertCircle,
  Mail,
  ThumbsUp,
  ListChecks,
  XCircle,
} from "lucide-react";

// Role- and status-based policy helpers: what a document's badge shows, which
// documents can chain next, and who may send/email/amend/attach.
export function useDocPolicies({
  isTeam,
  isAdmin,
  allEnquiries,
  myEnquiries,
  docs,
}: {
  isTeam: boolean;
  isAdmin: boolean;
  allEnquiries: TradeEnquiry[] | undefined;
  myEnquiries: TradeEnquiry[] | undefined;
  docs: Doc[] | undefined;
}) {
  const getStatusBadge = (doc: Doc) => {
    const s = doc.status;
    const r = doc.recipientResponse;
    if (s === "pending_review") return { label: "Pending Review", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", icon: ListChecks };
    if (s === "accepted" || r === "accepted") return { label: "Accepted", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: ThumbsUp };
    if (s === "rejected") return { label: "Rejected", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: XCircle };
    if (r === "rejected") return { label: "Amendment Needed", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: AlertCircle };
    if (s === "sent" || r === "pending") return { label: "Sent", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: Mail };
    if (s === "final") return { label: "Final", color: "bg-primary text-primary-foreground", icon: CheckCircle2 };
    if (s === "draft") return { label: "Ready to Sign", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200", icon: FileSignature };
    return { label: s, color: "", icon: Clock };
  };

  const getNextDocTypes = (doc: Doc): string[] => {
    // An LOI can be converted directly into an SCO, ICPO, or SPA without a
    // send/accept round-trip; the rest of the chain still requires acceptance.
    if (doc.docType === "LOI") return ["SCO", "ICPO", "SPA"];
    // An FCO is an originating offer: it can be converted straight into an SPA
    // without a send/accept round-trip; a Deal Recap still requires acceptance.
    if (doc.docType === "FCO") return doc.recipientResponse === "accepted" ? ["DEAL_RECAP", "SPA"] : ["SPA"];
    // A prepared SPA can spawn the bank drafts (DLC MT700 / PBG MT760) right
    // away so they can be amended before emailing; the TFR still requires a
    // signature (auto-chained on signing).
    if (doc.docType === "SPA") {
      return ["DLC_MT700", "PBG_MT760"];
    }
    if (doc.recipientResponse !== "accepted") return [];
    if (doc.docType === "SCO") return ["DEAL_RECAP"];
    if (doc.docType === "DEAL_RECAP") return ["SPA"];
    return [];
  };

  // Direct email is available to the admin on any document, and to a team
  // member on documents they created (their list only contains their own docs
  // plus admin-issued agent agreements, which carry no owner id). Team members
  // must wait for admin approval (pending_review) before emailing out.
  const canEmailDoc = (doc: Doc): boolean => {
    // A PI may also be delivered outside the linked client-portal workflow,
    // but only by an administrator after the issuer signature makes it final.
    if (doc.docType === "PI") return isAdmin && !!doc.buyerSignature;
    if (isTeam) {
      if (!doc.submittedByTeamMemberId) return false;
      if (doc.status === "pending_review") return false;
    }
    if (doc.docType === "ADDENDUM" && !(doc.sellerSignature && doc.buyerSignature)) return false;
    return true;
  };

  // Default direct-email recipient: the counterparty of the linked enquiry —
  // the Seller for an Import (buy) enquiry, the Buyer for an Export/sale
  // enquiry. Falls back to docType convention (LOI = import, FCO = export)
  // when the enquiry side cannot be resolved.
  const defaultEmailRecipient = (doc: Doc): string => {
    const side = doc.enquiryRef
      ? (allEnquiries?.find((e) => e.enquiryRef === doc.enquiryRef)
        ?? myEnquiries?.find((e) => e.enquiryRef === doc.enquiryRef))?.side
      : undefined;
    if (side === "buy") return doc.sellerEmail || doc.buyerEmail || "";
    if (side === "sell") return doc.buyerEmail || doc.sellerEmail || "";
    if (doc.docType === "LOI") return doc.sellerEmail || doc.buyerEmail || "";
    if (doc.docType === "FCO") return doc.buyerEmail || doc.sellerEmail || "";
    return doc.buyerEmail || doc.sellerEmail || "";
  };

  const canSend = (doc: Doc): boolean => {
    if (doc.status === "sent" || doc.status === "accepted" || doc.status === "final") return false;
    if (doc.docType === "PI" && !isAdmin) return false;
    if (doc.docType === "ADDENDUM") return !!(doc.sellerSignature && doc.buyerSignature);
    if (doc.docType === "NCNDA") return !!(doc.sellerSignature || doc.buyerSignature);
    return !!doc.buyerSignature;
  };

  const isProformaSpa = (doc: Doc): boolean => {
    if (doc.docType !== "SPA" || !doc.enquiryRef) return false;
    const side = (allEnquiries?.find((entry) => entry.enquiryRef === doc.enquiryRef)
      ?? myEnquiries?.find((entry) => entry.enquiryRef === doc.enquiryRef))?.side;
    return side === "buy" || side === "sell";
  };

  const canCreateProformaInvoice = (doc: Doc): boolean =>
    isAdmin
    && isProformaSpa(doc)
    && !(docs || []).some((child) => child.parentDocId === doc.id && child.docType === "PI");

  const proformaInvoiceRecipient = (doc: Doc) => {
    const side = doc.enquiryRef
      ? (allEnquiries?.find((entry) => entry.enquiryRef === doc.enquiryRef)
        ?? myEnquiries?.find((entry) => entry.enquiryRef === doc.enquiryRef))?.side
      : undefined;
    if (side === "sell") {
      return { label: "Buyer", labelLower: "buyer", email: doc.buyerEmail || "", side: "sell" as const };
    }
    return { label: "Supplier", labelLower: "supplier", email: doc.sellerEmail || "", side: "buy" as const };
  };

  // Editing policy (mirrors server canEditDocument): the owning team member and
  // the admin may edit a document while it is still in the team member's hands.
  // Team-prepared documents no longer need admin approval, so that covers
  // pending_review, ready-to-sign (draft), and pre-approval rejections (rejected
  // with NO recipientResponse). A 'rejected' doc that carries a recipientResponse
  // came from a client amendment request on an already-sent doc, so it is
  // admin-only. Once the doc has left the team member (review/sent/accepted/final),
  // only the admin may edit.
  // Team members may PROPOSE an amendment (staged for admin approval) on
  // documents they still hold, but not while a proposal is already pending.
  // Admins edit directly at any time.
  const canAmend = (doc: Doc): boolean => {
    if (doc.docType === "PI") {
      return isAdmin
        && doc.status === "draft"
        && !doc.buyerSignature
        && !doc.sellerSignature;
    }
    if (isTeam) {
      if (doc.pendingContent) return false;
      // NCNDA/ICA agent agreements: a team member may propose an amendment on
      // their own agreement at any stage (server enforces ownership/subject);
      // the admin reviews and approves before it replaces the live content.
      if (doc.docType === "NCNDA" || doc.docType === "ICA") return true;
      return doc.status === "pending_review" || doc.status === "draft" || (doc.status === "rejected" && !doc.recipientResponse);
    }
    return true;
  };

  // Mirrors the server's canAttachDocToEmail gate (server/routes.ts): a bank
  // draft may ride along only when the sender could email the draft itself —
  // admin can attach any draft; a team member only drafts THEY created
  // (submittedByTeamMemberId set — their list never contains other members'
  // ids, so non-null means "mine"). Admin-created drafts under a team member's
  // parent are hidden instead of failing with a 400 after submit.
  const canAttachChildDraft = (d: Doc): boolean => {
    if (isAdmin) return true;
    if (isTeam) return !!d.submittedByTeamMemberId;
    return false;
  };
  const attachableChildren = (parentId: string | null) =>
    (docs || []).filter(
      (d) =>
        d.parentDocId === parentId &&
        (d.docType === "DLC_MT700" || d.docType === "PBG_MT760") &&
        canAttachChildDraft(d)
    );
  const attachLabel = (d: { docType: string; title: string }) =>
    `${d.docType === "DLC_MT700" ? "Draft LC (SWIFT MT700)" : "Performance Guarantee (SWIFT MT760)"} — ${d.title}`;

  return {
    getStatusBadge,
    getNextDocTypes,
    canEmailDoc,
    defaultEmailRecipient,
    canSend,
    isProformaSpa,
    canCreateProformaInvoice,
    proformaInvoiceRecipient,
    canAmend,
    canAttachChildDraft,
    attachableChildren,
    attachLabel,
  };
}

export type DocPolicies = ReturnType<typeof useDocPolicies>;
