import { useRef, useState } from "react";
import type { Document as Doc } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

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

// Document repository / dialog state: the currently viewed or edited document,
// the sign/send/email/respond/admin-review dialog fields, list filters and the
// grouped-by-reference view, plus deal-file ZIP downloads.
export function useDocRepoState({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [viewDoc, setViewDoc] = useState<Doc | null>(null);
  const [addendumSpaId, setAddendumSpaId] = useState<string | null>(null);
  const [piPreparationParentId, setPiPreparationParentIdState] = useState<string | null>(null);
  const [piPreparation, setPiPreparationState] = useState<ProformaInvoicePreparation | null>(null);
  const piPreparationParentIdRef = useRef<string | null>(null);
  const piPreparationRef = useRef<ProformaInvoicePreparation | null>(null);
  const piPreparationInstanceRef = useRef(0);
  const setPiPreparationParentId = (value: string | null) => {
    piPreparationParentIdRef.current = value;
    setPiPreparationParentIdState(value);
  };
  const setPiPreparation = (value: ProformaInvoicePreparation | null) => {
    piPreparationInstanceRef.current += 1;
    piPreparationRef.current = value;
    setPiPreparationState(value);
  };
  const [piPreviewToken, setPiPreviewToken] = useState<string | null>(null);
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [amendReason, setAmendReason] = useState("");
  const [amendReviewNotes, setAmendReviewNotes] = useState("");
  const [signParty, setSignParty] = useState<"buyer" | "seller" | null>(null);
  const [signDocId, setSignDocId] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");

  const [sendDocId, setSendDocId] = useState<string | null>(null);
  // Bank-draft children (LC / performance guarantee) ticked to ride along in
  // the same email as the parent document.
  const [attachDocIds, setAttachDocIds] = useState<string[]>([]);
  const toggleAttachDoc = (id: string) =>
    setAttachDocIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const [sendEmail, setSendEmail] = useState("");
  const [sendClientId, setSendClientId] = useState("");
  const [sendCcEmail, setSendCcEmail] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [emailDocId, setEmailDocId] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [sendMemberDocId, setSendMemberDocId] = useState<string | null>(null);
  const [sendMemberId, setSendMemberId] = useState("");
  const [sendMemberMessage, setSendMemberMessage] = useState("");
  const [respondDocId, setRespondDocId] = useState<string | null>(null);
  const [respondAction, setRespondAction] = useState<"accepted" | "rejected" | null>(null);
  const [amendmentNotes, setAmendmentNotes] = useState("");
  const [docTabFilter, setDocTabFilter] = useState<string>("all");
  const [docSearch, setDocSearch] = useState("");
  // Document repository view: flat list vs grouped under one reference block
  // per deal chain (enquiry ref / deal recap number / root document).
  const [docViewMode, setDocViewMode] = useState<"list" | "byRef">("byRef");
  const [expandedRefBlocks, setExpandedRefBlocks] = useState<Set<string>>(new Set());
  const toggleRefBlock = (key: string) =>
    setExpandedRefBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  // Download all documents of a reference block as one ZIP (full deal file).
  const [zipDownloadingKey, setZipDownloadingKey] = useState<string | null>(null);
  const downloadBlockZip = async (key: string, label: string, items: Doc[]) => {
    setZipDownloadingKey(key);
    try {
      const res = await fetch("/api/documents/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: items.map((d) => d.id), name: `Deal_${label}` }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Could not build the deal file ZIP");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Deal_${label.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_") || "file"}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || "Could not download the deal file.", variant: "destructive" });
    } finally {
      setZipDownloadingKey(null);
    }
  };
  const [reviewDocId, setReviewDocId] = useState<string | null>(null);
  const [reviewChecks, setReviewChecks] = useState<Array<{ label: string; checked: boolean }>>([]);
  const [reviewNotes, setReviewNotes] = useState("");
  const ordinaryAdminChecks = (value: unknown): Array<{ label: string; checked: boolean }> =>
    Array.isArray(value)
      ? value.filter((check): check is { label: string; checked: boolean } =>
          !!check && typeof check.label === "string" && typeof check.checked === "boolean" && check.key !== "lpgStsReview")
      : [];

  const openAdminReview = (doc: Doc) => {
    const checks = ordinaryAdminChecks(doc.adminChecks);
    setReviewChecks([...checks]);
    setReviewNotes(doc.adminReviewNotes || "");
    setReviewDocId(doc.id);
    setViewDoc(doc);
  };

  const toggleReviewCheck = (idx: number) => {
    setReviewChecks(prev => prev.map((c, i) => i === idx ? { ...c, checked: !c.checked } : c));
  };

  const openSignDialog = (docId: string, party: "buyer" | "seller") => {
    setSignDocId(docId);
    setSignParty(party);
    setSignerName("");
  };

  const fetchFreshDoc = async (id: string): Promise<Doc> => {
    const res = await fetch(`/api/documents/${id}`);
    if (!res.ok) throw new Error("Failed to fetch document");
    return res.json();
  };

  const openView = async (doc: Doc) => {
    try {
      const fresh = await fetchFreshDoc(doc.id);
      setViewDoc(fresh);
      setEditDoc(null);
      setReviewChecks(ordinaryAdminChecks(fresh.adminChecks));
      setReviewNotes(fresh.adminReviewNotes || "");
    } catch {
      setViewDoc(doc);
      setEditDoc(null);
      setReviewChecks(ordinaryAdminChecks(doc.adminChecks));
      setReviewNotes(doc.adminReviewNotes || "");
    }
  };

  const openEdit = async (doc: Doc) => {
    setAmendReason("");
    try {
      const fresh = await fetchFreshDoc(doc.id);
      setEditDoc(fresh);
      setViewDoc(null);
      setEditTitle(fresh.title);
      setEditContent(fresh.content || "");
      setEditStatus(fresh.status);
    } catch {
      setEditDoc(doc);
      setViewDoc(null);
      setEditTitle(doc.title);
      setEditContent(doc.content || "");
      setEditStatus(doc.status);
    }
  };

  return {
    viewDoc, setViewDoc,
    addendumSpaId, setAddendumSpaId,
    piPreparationParentId, setPiPreparationParentId,
    piPreparation, setPiPreparation,
    piPreparationParentIdRef,
    piPreparationRef,
    piPreparationInstanceRef,
    piPreviewToken, setPiPreviewToken,
    editDoc, setEditDoc,
    editTitle, setEditTitle,
    editContent, setEditContent,
    editStatus, setEditStatus,
    amendReason, setAmendReason,
    amendReviewNotes, setAmendReviewNotes,
    signParty, setSignParty,
    signDocId, setSignDocId,
    signerName, setSignerName,
    sendDocId, setSendDocId,
    attachDocIds, setAttachDocIds,
    toggleAttachDoc,
    sendEmail, setSendEmail,
    sendClientId, setSendClientId,
    sendCcEmail, setSendCcEmail,
    sendMessage, setSendMessage,
    emailDocId, setEmailDocId,
    emailTo, setEmailTo,
    emailCc, setEmailCc,
    emailMessage, setEmailMessage,
    sendMemberDocId, setSendMemberDocId,
    sendMemberId, setSendMemberId,
    sendMemberMessage, setSendMemberMessage,
    respondDocId, setRespondDocId,
    respondAction, setRespondAction,
    amendmentNotes, setAmendmentNotes,
    docTabFilter, setDocTabFilter,
    docSearch, setDocSearch,
    docViewMode, setDocViewMode,
    expandedRefBlocks, setExpandedRefBlocks,
    toggleRefBlock,
    zipDownloadingKey, setZipDownloadingKey,
    downloadBlockZip,
    reviewDocId, setReviewDocId,
    reviewChecks, setReviewChecks,
    reviewNotes, setReviewNotes,
    openAdminReview,
    toggleReviewCheck,
    openSignDialog,
    fetchFreshDoc,
    openView,
    openEdit,
  };
}

export type DocRepoState = ReturnType<typeof useDocRepoState>;
