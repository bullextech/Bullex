import { LPG_STS_REFERENCE } from "./lpg-sts-reference";

export const LPG_STS_VARIANT = "lpg-sts" as const;
export const LPG_STS_REVIEW_POINTS = [
  { id: "pricing", label: "Confirm main and provisional CP premiums and formula pricing" },
  { id: "jurisdiction", label: "Resolve or approve Bangladesh delivery versus Indian import clearance" },
  { id: "laytime", label: "Review clauses 9 and 10 together, including the first 144 hours and weather allocation" },
  { id: "liability", label: "Resolve or approve incomplete liability wording in clause 17.4(b)" },
  { id: "transaction", label: "Review all clauses and annexures, blank periods, terminal data and grade quantities for this transaction" },
] as const;
export type LpgStsReviewPointId = typeof LPG_STS_REVIEW_POINTS[number]["id"];
export interface LpgStsReviewDecision {
  id: LpgStsReviewPointId;
  decision: "resolved" | "approved";
  note: string;
}
export interface LpgStsClearance {
  fingerprint: string;
  reviewedBy: string;
  reviewedAt: string;
  points: LpgStsReviewDecision[];
}
export type LpgStsReviewHistoryEntry =
  | {
    type: "clearance";
    fingerprint: string;
    reviewedBy: string;
    reviewedAt: string;
    points: LpgStsReviewDecision[];
  }
  | {
    type: "invalidation";
    fingerprint: string;
    occurredAt: string;
    reason: string;
    nextFingerprint: string;
  };
export interface LpgStsReviewMetadata {
  key: "lpgStsReview";
  clearance: LpgStsClearance | null;
  /** Optional only for documents saved before the append-only audit was introduced. */
  history?: LpgStsReviewHistoryEntry[];
}
export function getLpgStsReviewMetadata(doc: { adminChecks?: unknown }): LpgStsReviewMetadata | undefined {
  return Array.isArray(doc.adminChecks)
    ? doc.adminChecks.find((check: any) => check?.key === "lpgStsReview")
    : undefined;
}
export function isLpgStsSpa(doc: { docType?: string; content?: string | null; adminChecks?: unknown }): boolean {
  return doc.docType === "SPA" && (
    !!getLpgStsReviewMetadata(doc) || /LPG SPA\s*[—–-]\s*STS Basis/i.test(doc.content || "")
  );
}
export interface LpgStsReviewState {
  expectedFingerprint: string;
  required: boolean;
  cleared: boolean;
  points: typeof LPG_STS_REVIEW_POINTS;
  clearance: LpgStsClearance | null;
  history: LpgStsReviewHistoryEntry[];
}
export interface LpgStsReviewPage extends LpgStsReviewState {
  historyTotal: number;
  nextBefore: number | null;
}
export const LPG_STS_WARNINGS = [
  "SAMPLE draft only — all terms and both annexures require transaction-specific commercial and legal review; selecting this draft does not approve it.",
  "PRICE CONFLICT: clause 7 uses Saudi CP + USD 70/MT for the main price and CP + USD 50/MT for provisional invoicing. Separate editable inputs intentionally retain this discrepancy. Confirm both before approval.",
  "Formula pricing is not a fixed unit price. Derived PI and DLC monetary totals remain blank until an agreed numeric price is supplied; a CP premium alone must never be treated as the cargo price.",
  "JURISDICTION CONFLICT: clause 28.3 retains Indian import clearance from the source despite Bangladesh STS delivery. Legal must explicitly resolve the jurisdiction; no automatic substitution is made.",
  "LEGAL FLAG: clause 9.0 allocates the first 144 hours to Seller while other laytime/weather provisions allocate time to Buyer. Review clauses 9 and 10 together.",
  "Review the incomplete liability wording in clause 17.4(b), all blank periods and terminal data, and approximate grade quantities (10,311 + 6,874 MT do not equal 17,184 MT). Never silently reconcile these values.",
] as const;

export interface LpgStsData {
  reference?: string;
  issueDate?: string;
  mainPremium?: string;
  provisionalPremium?: string;
  producer?: string;
  /** Per-section accepted text, with {{field}} tokens resolved at generation. */
  sections?: string[];
}

export const LPG_STS_SAMPLE = {
  commodity: "Liquefied Petroleum Gas (segregated n-Butane / Propane 60/40)",
  quantity: "17,184 MT +/- 5%",
  dischargePort: "Kutubdia Outer Anchorage, Bay of Bengal, Bangladesh",
  incoterm: "CIF",
  paymentTerms: "Irrevocable confirmed letter of credit at sight, UCP 600; 110% of estimated cargo value; valid at least 60 days after Bill of Lading",
};
export { LPG_STS_REFERENCE };

/** Keep the document type SPA; never leak variant state to other documents. */
export function spaVariantPayload(docType: string | undefined, variant: string, data: LpgStsData) {
  return docType === "SPA" && variant === LPG_STS_VARIANT
    ? { spaVariant: LPG_STS_VARIANT, lpgSts: data }
    : {};
}