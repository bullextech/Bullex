import { useQuery } from "@tanstack/react-query";
import type { Document as Doc, KycApplication, TeamMember, Trade, TradeEnquiry } from "@shared/schema";
import { sortClientDetails } from "@shared/client-sorting";
import { LPG_STS_REVIEW_POINTS, type LpgStsReviewState } from "@shared/lpg-sts";

// All server data the document generator reads: documents, trades, enquiries,
// KYC clients, team members, and the direct-send recipient directories.
export function useDocGenQueries({ urlTradeRef, urlEnquiryRef, isTeam, isAdmin }: { urlTradeRef: string | null; urlEnquiryRef: string | null; isTeam: boolean; isAdmin: boolean }) {
  // Non-admin projections deliberately omit the authoritative fingerprint,
  // while the admin GET state includes it.
  type AuthoritativeLpgReviewState = Omit<LpgStsReviewState, "expectedFingerprint"> & { expectedFingerprint?: string };
  const { data: allTrades } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
    enabled: !!urlTradeRef,
  });

  // Always fetched (not just on enquiry-launched sessions) so the direct-email
  // dialog can resolve a document's linked enquiry side (Import vs Export) and
  // prefill the correct counterparty email.
  const { data: allEnquiries } = useQuery<TradeEnquiry[]>({
    queryKey: ["/api/trade-enquiries"],
    retry: false,
  });

  // Fallback source for team members who can generate documents but lack the
  // "enquiries" module (so /api/trade-enquiries 403s). This returns only the
  // current team member's own enquiries, so it stays correctly scoped.
  const { data: myEnquiries } = useQuery<TradeEnquiry[]>({
    queryKey: ["/api/team/me/enquiries"],
    retry: false,
  });

  const linkedEnquiry = urlEnquiryRef
    ? (allEnquiries?.find((e) => e.enquiryRef === urlEnquiryRef)
      ?? myEnquiries?.find((e) => e.enquiryRef === urlEnquiryRef))
    : undefined;

  const { data: docs, isLoading: docsLoading } = useQuery<Doc[]>({
    queryKey: ["/api/documents"],
  });

  type ProjectedLpgStsReview = { required: boolean; cleared: boolean };
  const projectedReview = (doc: Doc) =>
    (doc as Doc & { lpgStsReview?: ProjectedLpgStsReview }).lpgStsReview;
  const lpgDocs = (docs || []).filter((doc) =>
    projectedReview(doc)?.required === true
  );

  // Lists use bounded server-derived summaries for every role. Full review
  // data is requested only by the open administrator review dialog.
  const lpgReviewByDocId = new Map<string, { data?: AuthoritativeLpgReviewState; isLoading: boolean; isFetching: boolean }>();
  lpgDocs.forEach((doc) => {
    const projection = projectedReview(doc);
    lpgReviewByDocId.set(doc.id, {
        data: {
          required: projection?.required === true,
          cleared: projection?.cleared === true,
          points: LPG_STS_REVIEW_POINTS,
          clearance: null,
          history: [],
        },
        isLoading: false,
        isFetching: false,
      });
  });

  const { data: kycClients } = useQuery<KycApplication[]>({
    queryKey: ["/api/kyc"],
  });

  const approvedClients = sortClientDetails(kycClients?.filter((k) => k.status === "approved") || []);

  // Minimal approved-client directory for the send dialog: unlike /api/kyc
  // (scoped to a team member's own submissions), this lists every approved
  // client so team members can send NCNDA/ICA and other documents to any
  // approved KYC client's portal.
  const { data: sendClientsData } = useQuery<{ id: string; companyName: string; contactName: string; contactEmail: string | null; signatoryEmail: string | null }[]>({
    queryKey: ["/api/clients/approved"],
    retry: false,
  });
  const sendClients = sortClientDetails(sendClientsData || []);

  const { data: teamMembersData } = useQuery<TeamMember[]>({
    queryKey: ["/api/team/members"],
    retry: false,
  });

  const teamMembers = teamMembersData || [];

  // Team members I personally added — eligible recipients for a direct send.
  const { data: myAddedMembers = [] } = useQuery<Array<{ kind: string; id: string; name: string; email: string; status: string; canReceive: boolean }>>({
    queryKey: ["/api/team/my/added-members"],
    enabled: isTeam,
  });
  // Any member/applicant with an email can receive a document — a provisioned
  // login is not required (delivery is email-only). This lets a team member send
  // NCNDA/ICA to people they invited whose login is still pending.
  const receivableMembers = myAddedMembers.filter(m => m.canReceive);

  return {
    allTrades,
    allEnquiries,
    myEnquiries,
    linkedEnquiry,
    docs,
    docsLoading,
    lpgReviewByDocId,
    kycClients,
    approvedClients,
    sendClientsData,
    sendClients,
    teamMembersData,
    teamMembers,
    myAddedMembers,
    receivableMembers,
  };
}

export type DocGenQueries = ReturnType<typeof useDocGenQueries>;
