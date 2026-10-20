import type { Document } from "@shared/schema";
import type { LpgStsReviewPage } from "@shared/lpg-sts";
import { apiRequest } from "@/lib/queryClient";

type ReviewDocument = Pick<Document, "id" | "docType" | "title" | "content" |
  "tradeRef" | "enquiryRef" | "parentDocId" | "buyerEmail" | "sellerEmail">;

/** A changed review boundary must never reuse the previous terms' clearance. */
export function lpgReviewQueryOptions(doc: ReviewDocument | null | undefined) {
  const url = `/api/documents/${doc?.id}/lpg-sts-review`;
  return {
    queryKey: [url, {
      docType: doc?.docType, title: doc?.title, content: doc?.content,
      tradeRef: doc?.tradeRef, enquiryRef: doc?.enquiryRef, parentDocId: doc?.parentDocId,
      buyerEmail: doc?.buyerEmail, sellerEmail: doc?.sellerEmail,
    }],
    queryFn: async (): Promise<LpgStsReviewPage> => {
      const response = await apiRequest("GET", url);
      return response.json();
    },
    staleTime: 0,
    refetchOnMount: "always" as const,
  };
}