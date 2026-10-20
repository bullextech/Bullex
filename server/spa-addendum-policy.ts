import type { Document } from "@shared/schema";

type SpaAddendumLockFields = Pick<
  Document,
  "docType" | "status" | "buyerSignature" | "sellerSignature" | "addendumNumber"
>;

export function normalizeSpaAddendumNumber(value: string): string {
  const stripped = value
    .trim()
    .replace(/^addendum\s*(?:no\.?)?\s*/i, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (/^\d+$/.test(stripped)) {
    return stripped.replace(/^0+(?=\d)/, "");
  }
  return stripped;
}

export function isSpaAddendumContentLocked(doc: SpaAddendumLockFields): boolean {
  return doc.docType === "ADDENDUM" && (
    !!doc.sellerSignature ||
    !!doc.buyerSignature ||
    ["final", "sent", "accepted"].includes(doc.status)
  );
}

export function isSpaAddendumExecuted(doc: SpaAddendumLockFields): boolean {
  return doc.docType === "ADDENDUM" && (
    (!!doc.sellerSignature && !!doc.buyerSignature) ||
    ["final", "sent", "accepted"].includes(doc.status)
  );
}

export function preservesSpaAddendumNumber(
  doc: Pick<Document, "docType" | "addendumNumber">,
  proposedContent: string,
): boolean {
  if (doc.docType !== "ADDENDUM" || !doc.addendumNumber) return true;
  const escapedNumber = doc.addendumNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^ADDENDUM NO\\.\\s*${escapedNumber}\\s+TO SALE AND PURCHASE AGREEMENT`,
    "im",
  ).test(proposedContent);
}