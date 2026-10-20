import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Document as Doc } from "@shared/schema";
import type { DocFormState } from "./use-doc-form-state";
import type { DocRepoState } from "./use-doc-repo-state";
import type { PreparedProformaInvoiceFields, ProformaInvoicePreparation } from "./use-doc-repo-state";
import { docTypes } from "../doc-types";
import { trackEvent } from "@/lib/analytics";
import type { LpgStsReviewDecision, LpgStsReviewState } from "@shared/lpg-sts";

// Every server mutation the document generator performs (preview, generate,
// amend, sign, send, respond, chain-next, admin review, ...) plus the submit
// handlers that validate and dispatch them.
export function useDocMutations({
  toast,
  isTeam,
  form,
  repo,
}: {
  toast: ReturnType<typeof useToast>["toast"];
  isTeam: boolean;
  form: DocFormState;
  repo: DocRepoState;
}) {
  const previewDoc = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/documents/preview", data);
      return res.json();
    },
    onSuccess: (result: { content: string }) => {
      if (!result.content) {
        toast({ title: "Preview Failed", description: "Document content could not be generated. Please try again.", variant: "destructive" });
        return;
      }
      form.setReviewContent(result.content);
      form.setOriginalReviewContent(result.content);
      form.setIsEditingReview(false);
    },
    onError: (error: Error) => {
      toast({ title: "Preview Failed", description: error.message, variant: "destructive" });
    },
  });

  const generateDoc = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/documents", data);
      return res.json();
    },
    onSuccess: () => {
      trackEvent("document_created", { location: "document_generator" });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      form.resetForm();
      form.setReviewContent(null);
      form.setOriginalReviewContent(null);
      form.setIsEditingReview(false);
      toast({ title: "Document Generated", description: "Trade document has been created successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Generation Failed", description: error.message, variant: "destructive" });
    },
  });

  const updateDoc = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Doc> }) => {
      const res = await apiRequest("PATCH", `/api/documents/${id}`, data);
      return res.json();
    },
    onSuccess: (updated: Doc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      repo.setEditDoc(null);
      repo.setViewDoc(updated);
      toast({ title: "Document Amended", description: "Changes saved successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    },
  });

  // Team members propose an amendment; the change is staged and requires admin
  // approval before it replaces the live document content.
  const requestAmendment = useMutation({
    mutationFn: async ({ id, content, reason }: { id: string; content: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/request-amendment`, { content, reason });
      return res.json();
    },
    onSuccess: (updated: Doc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      repo.setEditDoc(null);
      repo.setAmendReason("");
      repo.setViewDoc(updated);
      toast({ title: "Amendment Submitted", description: "Your proposed changes are pending admin approval." });
    },
    onError: (error: Error) => {
      toast({ title: "Amendment Failed", description: error.message, variant: "destructive" });
    },
  });

  // Admin approves or rejects a staged amendment.
  const reviewAmendment = useMutation({
    mutationFn: async ({ id, decision, notes }: { id: string; decision: "approve" | "reject"; notes?: string }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/review-amendment`, { decision, notes });
      return res.json();
    },
    onSuccess: (updated: Doc, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      repo.setAmendReviewNotes("");
      repo.setViewDoc(updated);
      toast({
        title: vars.decision === "approve" ? "Amendment Approved" : "Amendment Rejected",
        description: vars.decision === "approve" ? "The proposed changes are now live." : "The proposed changes were discarded.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Review Failed", description: error.message, variant: "destructive" });
    },
  });

  const signDoc = useMutation({
    mutationFn: async ({ id, party, signature, name }: { id: string; party: string; signature: string; name: string }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/sign`, { party, signature, name });
      return res.json();
    },
    onSuccess: (updated: Doc & { autoCreatedDoc?: Doc | null; autoCreatedDocs?: Doc[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      repo.setSignParty(null);
      repo.setSignDocId(null);
      repo.setSignerName("");
      const { autoCreatedDoc, autoCreatedDocs, ...doc } = updated;
      repo.setViewDoc(doc as Doc);
      const labelFor = (t?: string) =>
        t === "DEAL_RECAP" ? "Deal Recap" : t === "DLC_MT700" ? "DLC Draft (MT700)" : t === "PBG_MT760" ? "Performance Guarantee Draft (MT760)" : t;
      const created = (autoCreatedDocs && autoCreatedDocs.length ? autoCreatedDocs : autoCreatedDoc ? [autoCreatedDoc] : []);
      const autoLabels = created.map(d => labelFor(d.docType)).join(", ");
      toast({
        title: "Document Signed",
        description: created.length
          ? `${repo.signParty === "buyer" ? "Buyer" : "Seller"} signature applied. ${autoLabels} ${created.length > 1 ? "were" : "was"} prepared automatically as ${created.length > 1 ? "drafts" : "a draft"}.`
          : `${repo.signParty === "buyer" ? "Buyer" : "Seller"} signature applied successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Signing Failed", description: error.message, variant: "destructive" });
    },
  });

  const removeSignature = useMutation({
    mutationFn: async ({ id, party }: { id: string; party: string }) => {
      const res = await apiRequest("DELETE", `/api/documents/${id}/sign/${party}`);
      return res.json();
    },
    onSuccess: (updated: Doc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      repo.setViewDoc(updated);
      toast({ title: "Signature Removed", description: "Signature has been removed and documents regenerated." });
    },
    onError: (error: Error) => {
      toast({ title: "Remove Failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteDoc = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/documents/${id}`);
      return res.json();
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      repo.setViewDoc((prev) => (prev && prev.id === id ? null : prev));
      toast({ title: "Document Deleted", description: "The document has been permanently removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    },
  });

  const convertToPdf = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/documents/${id}/convert-pdf`);
      return res.json();
    },
    onSuccess: (updated: Doc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      repo.setViewDoc(updated);
      toast({ title: "PDF Generated", description: "LOI has been converted to PDF and marked as complete." });
    },
    onError: (error: Error) => {
      toast({ title: "Conversion Failed", description: error.message, variant: "destructive" });
    },
  });

  const sendDoc = useMutation({
    mutationFn: async ({ id, recipientEmail, clientId, ccEmail, message, attachDocIds }: { id: string; recipientEmail: string; clientId?: string; ccEmail?: string; message?: string; attachDocIds?: string[] }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/send`, { recipientEmail, clientId, ccEmail, message, attachDocIds });
      return res.json();
    },
    onSuccess: (updated: Doc) => {
      // The API accepts the request before background email delivery completes.
      trackEvent("document_send_requested", { location: "document_generator" });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      repo.setSendDocId(null);
      repo.setSendEmail("");
      repo.setSendClientId("");
      repo.setSendCcEmail("");
      repo.setSendMessage("");
      repo.setAttachDocIds([]);
      repo.setViewDoc(updated);
      toast({ title: "Document Sent", description: "Document has been sent to the client for review." });
    },
    onError: (error: Error) => {
      toast({ title: "Send Failed", description: error.message, variant: "destructive" });
    },
  });

  // Direct email of the generated document (PDF attached, optional CC) —
  // does not change the document's workflow state.
  const emailDoc = useMutation({
    mutationFn: async ({ id, recipientEmail, ccEmail, message, attachDocIds }: { id: string; recipientEmail: string; ccEmail?: string; message?: string; attachDocIds?: string[] }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/email`, { recipientEmail, ccEmail, message, attachDocIds });
      return res.json();
    },
    onSuccess: (data: { emailedTo: string; cc: string | null }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      repo.setEmailDocId(null);
      repo.setEmailTo("");
      repo.setEmailCc("");
      repo.setEmailMessage("");
      repo.setAttachDocIds([]);
      toast({ title: "Email Sent", description: `Document emailed to ${data.emailedTo}${data.cc ? ` (cc: ${data.cc})` : ""}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Email Failed", description: error.message, variant: "destructive" });
    },
  });

  const sendToMember = useMutation({
    mutationFn: async ({ id, teamMemberId, message }: { id: string; teamMemberId: string; message?: string }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/send-to-member`, { teamMemberId, message });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      repo.setSendMemberDocId(null);
      repo.setSendMemberId("");
      repo.setSendMemberMessage("");
      toast({ title: "Document Sent", description: "The document (PDF + DOCX) has been emailed to your team member." });
    },
    onError: (error: Error) => {
      toast({ title: "Send Failed", description: error.message, variant: "destructive" });
    },
  });

  const respondToDoc = useMutation({
    mutationFn: async ({ id, response, notes }: { id: string; response: string; notes?: string }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/respond`, { response, amendmentNotes: notes });
      return res.json();
    },
    onSuccess: (updated: Doc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      repo.setRespondDocId(null);
      repo.setRespondAction(null);
      repo.setAmendmentNotes("");
      repo.setViewDoc(updated);
      toast({ title: "Response Recorded", description: `Document has been ${updated.recipientResponse}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Response Failed", description: error.message, variant: "destructive" });
    },
  });

  const createNextDoc = useMutation({
    mutationFn: async ({ id, nextDocType }: { id: string; nextDocType: string }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/create-next`, { nextDocType });
      return res.json();
    },
    onSuccess: (newDoc: Doc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      repo.setViewDoc(newDoc);
      toast({ title: "Document Created", description: `${newDoc.docType} has been created from accepted document.` });
    },
    onError: (error: Error) => {
      toast({ title: "Creation Failed", description: error.message, variant: "destructive" });
    },
  });

  const prepareProformaInvoice = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/documents/${id}/prepare-proforma-invoice`, {});
      return res.json() as Promise<ProformaInvoicePreparation>;
    },
    onSuccess: (preparation, id) => {
      const fields = preparation.fields;
      form.resetForm();
      form.setTitle(fields.title);
      form.setCiInvoiceNo(fields.invoiceNumber);
      form.setPiInvoiceDate(fields.invoiceDate);
      form.setPiSpaNumber(fields.spaNumber);
      form.setPiValidUntil(fields.validUntil);
      form.setSellerName(fields.sellerName);
      form.setSellerAddress(fields.sellerAddress);
      form.setSellerContact(fields.sellerContact);
      form.setSellerBank(fields.sellerBank);
      form.setSellerSwift(fields.sellerSwift);
      form.setBuyerName(fields.buyerName);
      form.setBuyerAddress(fields.buyerAddress);
      form.setBuyerContact(fields.buyerContact);
      form.setCommodity(fields.commodity);
      form.setOrigin(fields.origin);
      form.setQuantity(fields.quantity);
      form.setLoadingPort(fields.loadingPort);
      form.setDischargePort(fields.dischargePort);
      form.setIncoterm(fields.deliveryTerm);
      form.setCiVoyage(fields.shipmentWindow);
      form.setCiBlNo(fields.packing);
      form.setPrice(fields.price);
      form.setCurrency(fields.currency || "USD");
      form.setPaymentTerms(fields.paymentTerms);
      form.setCiTolerance(fields.tolerance);
      form.setCiTotalAmount(fields.totalAmount);
      repo.setPiPreparationParentId(id);
      repo.setPiPreparation(preparation);
      repo.setPiPreviewToken(null);
      repo.setViewDoc(null);
      form.setSelectedType(docTypes.find((type) => type.value === "CI")!);
    },
    onError: (error: Error) => {
      toast({ title: "PI Preparation Failed", description: error.message, variant: "destructive" });
    },
  });

  const previewProformaInvoice = useMutation({
    mutationFn: async ({
      id,
      sourceRevision,
      fields,
      preparationInstance,
    }: {
      id: string;
      sourceRevision: string;
      fields: PreparedProformaInvoiceFields;
      preparationInstance: number;
    }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/preview-proforma-invoice`, {
        sourceRevision,
        fields,
      });
      return res.json() as Promise<{ content: string; previewToken: string }>;
    },
    onSuccess: ({ content, previewToken }, variables) => {
      if (
        repo.piPreparationParentIdRef.current !== variables.id
        || repo.piPreparationRef.current?.sourceRevision !== variables.sourceRevision
        || repo.piPreparationInstanceRef.current !== variables.preparationInstance
      ) {
        return;
      }
      form.setReviewContent(content);
      form.setOriginalReviewContent(content);
      form.setIsEditingReview(false);
      repo.setPiPreviewToken(previewToken);
    },
    onError: (error: Error) => {
      toast({ title: "PI Preview Failed", description: error.message, variant: "destructive" });
    },
  });

  const createPreparedProformaInvoice = useMutation({
    mutationFn: async ({
      id,
      sourceRevision,
      fields,
      previewToken,
    }: {
      id: string;
      sourceRevision: string;
      fields: PreparedProformaInvoiceFields;
      previewToken: string;
    }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/create-next`, {
        nextDocType: "PI",
        sourceRevision,
        preparedFields: fields,
        previewToken,
      });
      return res.json() as Promise<Doc>;
    },
    onSuccess: (newDoc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      repo.setPiPreparationParentId(null);
      repo.setPiPreparation(null);
      repo.setPiPreviewToken(null);
      form.resetForm();
      repo.setViewDoc(newDoc);
      toast({ title: "Proforma Invoice Created", description: "The reviewed PI is now in the document repository." });
    },
    onError: (error: Error) => {
      toast({ title: "PI Creation Failed", description: error.message, variant: "destructive" });
    },
  });

  const createAddendum = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { addendumNumber?: string; effectiveDate: string; amendments: Array<{ category: string; clauseNumber: string; description: string; existingProvision?: string; amendedProvision: string }> } }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/create-addendum`, data);
      return res.json();
    },
    onSuccess: (newDoc: Doc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      repo.setViewDoc(newDoc);
      repo.setAddendumSpaId(null);
      toast({ title: "Addendum Created", description: "The clause-specific SPA addendum is now in the document repository." });
    },
    onError: (error: Error) => toast({ title: "Addendum Failed", description: error.message, variant: "destructive" }),
  });

  const adminReview = useMutation({
    mutationFn: async ({ id, adminChecks, adminReviewNotes, action }: { id: string; adminChecks: Array<{ label: string; checked: boolean }>; adminReviewNotes: string; action?: string }) => {
      const res = await apiRequest("PATCH", `/api/documents/${id}/admin-review`, { adminChecks, adminReviewNotes, action });
      return res.json();
    },
    onSuccess: (updated: Doc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      repo.setViewDoc(updated);
      if (updated.status === "draft") {
        repo.setReviewDocId(null);
        toast({ title: "Document Approved", description: "Document is now ready for signing." });
      } else if (updated.status === "rejected") {
        repo.setReviewDocId(null);
        toast({ title: "Document Rejected", description: "Document has been rejected and returned for amendment." });
      } else {
        toast({ title: "Review Saved", description: "Admin review progress saved." });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Review Failed", description: error.message, variant: "destructive" });
    },
  });

  const saveLpgStsReview = useMutation({
    mutationFn: async ({ id, expectedContent, expectedFingerprint, points }: { id: string; expectedContent: string; expectedFingerprint: string; points: LpgStsReviewDecision[] }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/lpg-sts-review`, { expectedContent, expectedFingerprint, points });
      return res.json() as Promise<LpgStsReviewState & { expectedFingerprint: string }>;
    },
    onSuccess: (state, variables) => {
      queryClient.setQueryData([`/api/documents/${variables.id}/lpg-sts-review`], state);
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${variables.id}/lpg-sts-review`] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "LPG STS review saved", description: "The clearance is bound to this exact document content." });
    },
    onError: (error: Error) => {
      toast({ title: "Review not saved", description: error.message, variant: "destructive" });
    },
  });

  const handleSignature = (dataUrl: string) => {
    if (!repo.signDocId || !repo.signParty || !repo.signerName.trim()) {
      toast({ title: "Name Required", description: "Please enter the signer's name.", variant: "destructive" });
      return;
    }
    signDoc.mutate({ id: repo.signDocId, party: repo.signParty, signature: dataUrl, name: repo.signerName });
  };

  const handleReview = () => {
    if (!form.selectedType || !form.title) {
      toast({ title: "Missing Fields", description: "Please enter a document title.", variant: "destructive" });
      return;
    }
    previewDoc.mutate(form.buildPayload());
  };

  const handleReviewPreparedProformaInvoice = () => {
    if (!repo.piPreparationParentId || !repo.piPreparation) return;
    const fields = form.buildPreparedProformaInvoiceFields();
    const required: Array<keyof PreparedProformaInvoiceFields> = [
      "title", "invoiceNumber", "sellerName", "buyerName",
      "commodity", "quantity", "price", "currency",
    ];
    if (required.some((key) => !fields[key].trim())) {
      toast({
        title: "Missing Fields",
        description: "Complete the title, invoice number, seller, buyer, commodity, quantity, unit price, and currency.",
        variant: "destructive",
      });
      return;
    }
    previewProformaInvoice.mutate({
      id: repo.piPreparationParentId,
      sourceRevision: repo.piPreparation.sourceRevision,
      fields,
      preparationInstance: repo.piPreparationInstanceRef.current,
    });
  };

  const handleCreatePreparedProformaInvoice = () => {
    if (!repo.piPreparationParentId || !repo.piPreparation) return;
    if (!repo.piPreviewToken) {
      toast({
        title: "Review Required",
        description: "Review the Proforma Invoice generated from the current Commercial Invoice fields before creating it.",
        variant: "destructive",
      });
      return;
    }
    createPreparedProformaInvoice.mutate({
      id: repo.piPreparationParentId,
      sourceRevision: repo.piPreparation.sourceRevision,
      fields: form.buildPreparedProformaInvoiceFields(),
      previewToken: repo.piPreviewToken,
    });
  };

  const handleGenerate = () => {
    if (!form.selectedType || !form.title) {
      toast({ title: "Missing Fields", description: "Please enter a document title.", variant: "destructive" });
      return;
    }
    const payload = form.buildPayload();
    const wasEdited = form.reviewContent != null && form.reviewContent !== form.originalReviewContent;
    generateDoc.mutate(wasEdited ? { ...payload, editedContent: form.reviewContent } : payload);
  };

  const handleSaveAmend = () => {
    if (!repo.editDoc) return;
    if (isTeam) {
      // Team edits are proposals: staged for admin approval, not applied live.
      requestAmendment.mutate({ id: repo.editDoc.id, content: repo.editContent, reason: repo.amendReason });
      return;
    }
    const newStatus = repo.editDoc.status === "rejected" ? "draft" : repo.editStatus;
    updateDoc.mutate({
      id: repo.editDoc.id,
      data: { title: repo.editTitle, content: repo.editContent, status: newStatus },
    });
  };

  return {
    previewDoc,
    generateDoc,
    updateDoc,
    requestAmendment,
    reviewAmendment,
    signDoc,
    removeSignature,
    deleteDoc,
    convertToPdf,
    sendDoc,
    emailDoc,
    sendToMember,
    respondToDoc,
    createNextDoc,
    prepareProformaInvoice,
    previewProformaInvoice,
    createPreparedProformaInvoice,
    createAddendum,
    adminReview,
    saveLpgStsReview,
    handleSignature,
    handleReview,
    handleReviewPreparedProformaInvoice,
    handleCreatePreparedProformaInvoice,
    handleGenerate,
    handleSaveAmend,
  };
}

export type DocMutations = ReturnType<typeof useDocMutations>;
