import { createHash } from "node:crypto";
import {
  getLpgStsReviewMetadata, isLpgStsSpa, LPG_STS_REVIEW_POINTS,
  type LpgStsClearance, type LpgStsReviewDecision, type LpgStsReviewHistoryEntry,
  type LpgStsReviewState, type LpgStsReviewPage,
} from "@shared/lpg-sts";

type ReviewDocument = {
  id?: string; docType?: string; title?: string; content?: string | null;
  status?: string;
  buyerSignature?: string | null;
  tradeRef?: string | null; enquiryRef?: string | null; parentDocId?: string | null;
  buyerEmail?: string | null; sellerEmail?: string | null; adminChecks?: unknown;
};
export class LpgStsReviewError extends Error {
  status = 409;
}
export function lpgStsFingerprint(doc: ReviewDocument): string {
  return createHash("sha256").update(JSON.stringify([
    "lpg-sts-review-v1", doc.id, doc.docType, doc.title, doc.content,
    doc.tradeRef, doc.enquiryRef, doc.parentDocId, doc.buyerEmail, doc.sellerEmail,
  ])).digest("hex");
}
export function validateLpgStsReviewPoints(points: unknown): points is LpgStsReviewDecision[] {
  return Array.isArray(points) && points.length === LPG_STS_REVIEW_POINTS.length
    && LPG_STS_REVIEW_POINTS.every(({ id }) => points.filter(p => p?.id === id).length === 1)
    && points.every(p => (p.decision === "resolved" || p.decision === "approved")
      && typeof p.note === "string" && !!p.note.trim() && p.note.length <= 5000);
}
export function lpgStsReviewState(doc: ReviewDocument): LpgStsReviewState {
  const required = isLpgStsSpa(doc);
  const metadata = getLpgStsReviewMetadata(doc);
  const clearance = metadata?.clearance || null;
  const history = Array.isArray(metadata?.history) ? metadata.history : [];
  const cleared = !required || !!(clearance
    && clearance.fingerprint === lpgStsFingerprint(doc)
    && clearance.reviewedBy && clearance.reviewedAt
    && validateLpgStsReviewPoints(clearance.points));
  return {
    expectedFingerprint: lpgStsFingerprint(doc), required, cleared,
    points: LPG_STS_REVIEW_POINTS, clearance, history,
  };
}
export function assertLpgStsCleared(doc: ReviewDocument): void {
  if (!lpgStsReviewState(doc).cleared) {
    throw new LpgStsReviewError("LPG STS SPA requires transaction-specific administrator clearance of every review point before signing, accepting, finalizing or generating bank drafts.");
  }
}
export function assertLpgStsAcceptanceReady(doc: ReviewDocument): void {
  assertLpgStsCleared(doc);
  // Ordinary SPA readiness uses the buyerSignature slot (its issuer slot),
  // not either-party signatures. Clearance never substitutes for a signature.
  if (isLpgStsSpa(doc) && !doc.buyerSignature) {
    throw new LpgStsReviewError("The LPG STS SPA must be signed again before acceptance.");
  }
}
/** Only this server-owned entry carries clearance. Never trust a submitted entry. */
export function withLpgStsMetadata(
  checks: unknown,
  clearance: LpgStsClearance | null,
  history: LpgStsReviewHistoryEntry[] = [],
): unknown[] {
  return [
    ...(Array.isArray(checks) ? checks.filter(c => c?.key !== "lpgStsReview") : []),
    { key: "lpgStsReview", clearance, history },
  ];
}
export function sanitizeLpgStsCreation<T extends ReviewDocument>(doc: T, selectedLpgVariant = false): T {
  const clean = { ...doc, adminChecks: Array.isArray(doc.adminChecks)
    ? doc.adminChecks.filter(c => c?.key !== "lpgStsReview") : doc.adminChecks };
  if (isLpgStsSpa(clean) || (clean.docType === "SPA" && selectedLpgVariant)) {
    clean.adminChecks = withLpgStsMetadata(clean.adminChecks, null);
  }
  return clean;
}

const REVIEW_BOUND_FIELDS = [
  "id", "docType", "title", "content", "tradeRef", "enquiryRef",
  "parentDocId", "buyerEmail", "sellerEmail",
] as const;

function clearanceHistoryEntry(clearance: LpgStsClearance): LpgStsReviewHistoryEntry {
  return { type: "clearance", ...clearance };
}

function sameClearanceEvent(entry: LpgStsReviewHistoryEntry, clearance: LpgStsClearance): boolean {
  return entry.type === "clearance"
    && entry.fingerprint === clearance.fingerprint
    && entry.reviewedBy === clearance.reviewedBy
    && entry.reviewedAt === clearance.reviewedAt;
}

/** Return trusted stored history, backfilling only the currently preserved legacy clearance. */
export function lpgStsReviewHistory(doc: ReviewDocument): LpgStsReviewHistoryEntry[] {
  const metadata = getLpgStsReviewMetadata(doc);
  const history = Array.isArray(metadata?.history) ? [...metadata.history] : [];
  const clearance = metadata?.clearance;
  if (clearance && !history.some(entry => sameClearanceEvent(entry, clearance))) {
    history.push(clearanceHistoryEntry(clearance));
  }
  return history;
}

/** Exclusive append-only array offset: newer appends cannot shift older pages. */
export function lpgStsReviewPage(doc: ReviewDocument, before?: number): LpgStsReviewPage {
  const history = lpgStsReviewHistory(doc);
  const end = before === undefined ? history.length : Math.min(before, history.length);
  const start = Math.max(0, end - 20);
  return {
    ...lpgStsReviewState(doc),
    history: history.slice(start, end),
    historyTotal: history.length,
    nextBefore: start || null,
  };
}

export function appendLpgStsClearance(
  checks: unknown,
  clearance: LpgStsClearance,
): unknown[] {
  const doc = { adminChecks: checks };
  return withLpgStsMetadata(checks, clearance, [
    ...lpgStsReviewHistory(doc),
    clearanceHistoryEntry(clearance),
  ]);
}

/** Called under the document row lock for every mutation, including amendments. */
export function protectLpgStsMutation<T extends ReviewDocument>(current: T, data: Partial<T>): Partial<T> {
  if (isLpgStsSpa(current) && data.docType !== undefined && data.docType !== current.docType) {
    throw new LpgStsReviewError("An LPG STS SPA cannot change its document type to bypass review.");
  }
  const next = { ...current, ...data };
  if (!isLpgStsSpa(current) && !isLpgStsSpa(next)) {
    if (Array.isArray(data.adminChecks)) return { ...data, adminChecks: data.adminChecks.filter(c => c?.key !== "lpgStsReview") };
    return data;
  }
  const changed = lpgStsFingerprint(current) !== lpgStsFingerprint(next);
  const clearance = getLpgStsReviewMetadata(current)?.clearance || null;
  const history = lpgStsReviewHistory(current);
  if (changed && clearance) {
    const changedFields = REVIEW_BOUND_FIELDS.filter(field => current[field] !== next[field]);
    history.push({
      type: "invalidation",
      fingerprint: clearance.fingerprint,
      occurredAt: new Date().toISOString(),
      reason: `Changed review-bound fields: ${changedFields.join(", ")}`,
      nextFingerprint: lpgStsFingerprint(next),
    });
  }
  return {
    ...data,
    ...(changed ? {
      buyerSignature: null, sellerSignature: null,
      buyerSignedAt: null, sellerSignedAt: null,
      buyerSignedName: null, sellerSignedName: null,
      buyerSignedIp: null, sellerSignedIp: null,
      docxPath: null, pdfPath: null,
      recipientResponse: null, recipientRespondedAt: null, recipientAmendmentNotes: null,
      sentTo: null, sentToClientId: null,
      ...(["sent", "accepted", "final"].includes(next.status || "")
        ? { status: "draft" }
        : {}),
    } : {}),
    // Submitted reserved entries are never consulted: only generic checks may
    // be replaced, while clearance and history always come from the locked row.
    adminChecks: withLpgStsMetadata(data.adminChecks ?? current.adminChecks,
      changed ? null : clearance, history),
  };
}
export function isLpgStsExecutionMutation(data: {
  buyerSignature?: string | null; sellerSignature?: string | null; status?: string; recipientResponse?: string | null;
}): boolean {
  return !!data.buyerSignature || !!data.sellerSignature || data.status === "final"
    || data.status === "accepted" || data.recipientResponse === "accepted";
}

/** Apply at the JSON boundary, including nested documents in mutation results.
 * Review explanations and administrator identity are never portal data.
 */
export function projectLpgStsDocumentResponse(value: any): any {
  if (Array.isArray(value)) return value.map(projectLpgStsDocumentResponse);
  if (!value || typeof value !== "object"
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return value;
  const projected: Record<string, any> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "adminChecks" && Array.isArray(entry)) {
      projected[key] = entry.filter(check => check?.key !== "lpgStsReview");
    } else {
      projected[key] = projectLpgStsDocumentResponse(entry);
    }
  }
  if (typeof value.id === "string" && typeof value.docType === "string") {
    const { required, cleared } = lpgStsReviewState(value);
    projected.lpgStsReview = { required, cleared };
  }
  return projected;
}