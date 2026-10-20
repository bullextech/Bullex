import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import {
FileText,FileCheck,
Eye,
Pencil,X,Send,FileSignature,Download,Plus,
Trash2,AlertCircle,
Mail,ClipboardCheck,ListChecks,Loader2,FolderOpen,
ChevronUp,
ChevronDown,
Search
} from "lucide-react";
import type { Document as Doc } from "@shared/schema";
import { lazy,Suspense } from "react";
import { docTypes, getDocTypeLabel } from "./doc-types";
import { useDocGenController,DocGenProvider,useDocGen } from "./use-doc-gen";

const LogoManager = lazy(() => import("./logo-manager"));
const GenerateDialog = lazy(() => import("./generate-dialog"));
const DocGenDialogs = lazy(() => import("./dialogs").then(m => ({ default: m.default })));

export default function DocumentGenerator() {
  const gen = useDocGenController();
  return (
    <DocGenProvider value={gen}>
      <DocumentGeneratorInner />
    </DocGenProvider>
  );
}

function DocumentGeneratorInner() {
  const {
    setSelectedType,
    setTitle,
    setTfrLinkedRecapId,
    setSendDocId,
    setAttachDocIds,
    setSendEmail,
    setSendClientId,
    setEmailDocId,
    setEmailTo,
    setEmailCc,
    setEmailMessage,
    docTabFilter,
    setDocTabFilter,
    docSearch,
    setDocSearch,
    docViewMode,
    setDocViewMode,
    expandedRefBlocks,
    zipDownloadingKey,
    isAdmin,
    fillTfrFromRecap,
    deleteDoc,
    convertToPdf,
    toggleRefBlock,
    downloadBlockZip,
    createNextDoc,
    prepareProformaInvoice,
    setAddendumSpaId,
    openAdminReview,
    getStatusBadge,
    getNextDocTypes,
    canEmailDoc,
    defaultEmailRecipient,
    canSend,
    canAmend,
    canCreateProformaInvoice,
    isProformaSpa,
    proformaInvoiceRecipient,
    openTemplateDialog,
    openView,
    openEdit,
    isLoading,
    selectedType,
    docs,
    lpgReviewByDocId,
  } = useDocGen();


  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  const pageMode: "templates" | "documents" | "both" =
    typeof window !== "undefined" && window.location.pathname.startsWith("/doc-templates")
      ? "templates"
      : typeof window !== "undefined" && window.location.pathname.startsWith("/documents")
      ? "documents"
      : "both";

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto h-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-docgen-title">
            {pageMode === "documents" ? "Generated Documents" : "Document Templates"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {pageMode === "documents"
              ? "Review, amend, sign and send documents that have been generated from templates."
              : "Select a template to generate trade documents linked to blockchain-verified transactions"}
          </p>
        </div>
        {isAdmin && (
          <Suspense fallback={null}>
            <LogoManager />
          </Suspense>
        )}
      </div>

      {pageMode !== "documents" && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {docTypes.map((dt) => {
          const Icon = dt.icon;
          const count = docs?.filter(d => d.docType === dt.value).length || 0;
          return (
            <Card
              key={dt.value}
              className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md group"
              onClick={() => openTemplateDialog(dt)}
              data-testid={`template-box-${dt.value}`}
            >
              <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{dt.short}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{dt.label}</p>
                </div>
                {count > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {count} generated
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      )}

      {pageMode !== "templates" && (
      <Card data-testid="card-doc-list">
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
          <CardTitle className="text-base font-semibold">Document Repository</CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border overflow-hidden">
              {([["byRef", "By Reference"], ["list", "All Documents"]] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setDocViewMode(mode)}
                  data-testid={`toggle-docview-${mode}`}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${docViewMode === mode ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Badge variant="secondary" className="text-[10px]">
              {docs?.length || 0} documents
            </Badge>
          </div>
        </CardHeader>
        <div className="px-6 pb-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              placeholder="Search by reference, title, doc type or party name..."
              className="pl-9 h-9 text-sm"
              data-testid="input-doc-search"
            />
            {docSearch && (
              <button
                onClick={() => setDocSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title="Clear search"
                data-testid="button-clear-doc-search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: "all", label: "All", count: docs?.length || 0 },
              { key: "NCNDA", label: "NCNDA", count: docs?.filter(d => d.docType === "NCNDA").length || 0 },
              { key: "LOI", label: "LOI", count: docs?.filter(d => d.docType === "LOI").length || 0 },
              { key: "SCO", label: "SCO", count: docs?.filter(d => d.docType === "SCO").length || 0 },
              { key: "DEAL_RECAP", label: "Deal Recap", count: docs?.filter(d => d.docType === "DEAL_RECAP").length || 0 },
              { key: "SPA", label: "SPA", count: docs?.filter(d => d.docType === "SPA").length || 0 },
              { key: "BL", label: "BL", count: docs?.filter(d => d.docType === "BL").length || 0 },
              { key: "pending", label: "Pending Review", count: docs?.filter(d => d.status === "pending_review").length || 0 },
              { key: "amendments", label: "Amendments", count: docs?.filter(d => d.pendingContent).length || 0 },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setDocTabFilter(tab.key)}
                data-testid={`tab-doc-${tab.key}`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${docTabFilter === tab.key ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted"}`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-semibold ${docTabFilter === tab.key ? "bg-white/20" : tab.key === "pending" && tab.count > 0 ? "bg-amber-500 text-white" : "bg-muted-foreground/20"}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <CardContent>
          {(() => {
            const filteredDocs = docs?.filter(doc => {
              if (docTabFilter === "all") return true;
              if (docTabFilter === "pending") return doc.status === "pending_review";
              if (docTabFilter === "amendments") return !!doc.pendingContent;
              return doc.docType === docTabFilter;
            }) || [];
            // Search matches on reference, title, doc type (code + label),
            // and party names (signed names, emails, and rendered content —
            // buyer/seller names live in the document text).
            const q = docSearch.trim().toLowerCase();
            const docMatches = (doc: Doc) => {
              if (!q) return true;
              const dt = docTypes.find((t) => t.value === doc.docType);
              return [
                doc.title, doc.docType, getDocTypeLabel(doc.docType), dt?.short,
                doc.enquiryRef, doc.dealRecapNumber, doc.tradeRef, doc.issueNumber,
                doc.buyerSignedName, doc.sellerSignedName, doc.buyerEmail, doc.sellerEmail,
                doc.content,
              ].some((v) => v && v.toLowerCase().includes(q));
            };
            const renderDocRow = (doc: Doc) => (
              (() => {
                const lpgReview = lpgReviewByDocId.get(doc.id);
                const lpgBlocked = lpgReview?.data?.required === true && lpgReview.data.cleared !== true;
                return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted"
                  data-testid={`doc-row-${doc.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileCheck className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{doc.title}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {getDocTypeLabel(doc.docType)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {doc.issueNumber ? doc.issueNumber : doc.dealRecapNumber ? doc.dealRecapNumber : doc.enquiryRef ? `Enq: ${doc.enquiryRef}` : doc.tradeRef ? `Trade: ${doc.tradeRef}` : "Standalone"}
                        {" "}&middot;{" "}
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(() => {
                      const sb = getStatusBadge(doc);
                      const SbIcon = sb.icon;
                      return (
                        <Badge className={`text-[10px] capitalize ${sb.color}`} data-testid={`badge-status-${doc.id}`}>
                          <SbIcon className="w-3 h-3 mr-0.5" />
                          {sb.label}
                        </Badge>
                      );
                    })()}
                    {lpgBlocked && (
                      <Badge className="text-[10px] bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid={`badge-lpg-sts-blocked-${doc.id}`}>
                        <AlertCircle className="w-3 h-3 mr-0.5" />
                        LPG STS clearance required
                      </Badge>
                    )}
                    {((doc.docType === "NCNDA" || doc.docType === "ADDENDUM") ? (doc.sellerSignature || doc.buyerSignature) : doc.buyerSignature) && (
                      <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid={`badge-signed-${doc.id}`}>
                        <FileSignature className="w-3 h-3 mr-0.5" />
                        {doc.docType === "NCNDA" ? "Party A Signed" : "Signed"}
                      </Badge>
                    )}
                    {doc.docType === "NCNDA" && doc.buyerSignature && (
                      <Badge className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" data-testid={`badge-partyb-signed-${doc.id}`}>
                        <FileSignature className="w-3 h-3 mr-0.5" />
                        Party B Signed
                      </Badge>
                    )}
                    {doc.recipientResponse === "rejected" && (
                      <Badge className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid={`badge-rejected-${doc.id}`}>
                        <AlertCircle className="w-3 h-3 mr-0.5" />
                        Amendment Needed
                      </Badge>
                    )}
                    {canSend(doc) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-primary hover:text-primary/80"
                        onClick={() => { setSendDocId(doc.id); setSendEmail(doc.docType === "PI" ? proformaInvoiceRecipient(doc).email : doc.sellerEmail || doc.buyerEmail || ""); setSendClientId(""); setAttachDocIds([]); }}
                        title={doc.docType === "PI" ? `Send to ${proformaInvoiceRecipient(doc).label.toLowerCase()} portal` : "Send to client"}
                        data-testid={`button-send-${doc.id}`}
                      >
                        <Send className="w-3.5 h-3.5 mr-1" />
                        {doc.docType === "PI" ? `Send to ${proformaInvoiceRecipient(doc).label}` : "Send"}
                      </Button>
                    )}
                    {canEmailDoc(doc) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-primary hover:text-primary/80"
                        onClick={() => { setEmailDocId(doc.id); setEmailTo(defaultEmailRecipient(doc)); setEmailCc(""); setEmailMessage(""); setAttachDocIds([]); }}
                        title="Email document (PDF)"
                        data-testid={`button-email-${doc.id}`}
                      >
                        <Mail className="w-3.5 h-3.5 mr-1" />
                        Email
                      </Button>
                    )}
                    {canCreateProformaInvoice(doc) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-50 dark:text-amber-400"
                        onClick={() => prepareProformaInvoice.mutate(doc.id)}
                        disabled={prepareProformaInvoice.isPending}
                        title="Open the Commercial Invoice template to prepare the Proforma Invoice"
                        data-testid={`button-create-pi-${doc.id}`}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        {prepareProformaInvoice.isPending ? "Preparing..." : "Create PI"}
                      </Button>
                    )}
                    {(doc.status === "accepted" || doc.docType === "LOI" || doc.docType === "FCO" || doc.docType === "SPA") && getNextDocTypes(doc)
                      .filter((next) => next !== "PI" || !isProformaSpa(doc))
                      .map((next) => (
                      <Button
                        key={next}
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-green-600 hover:text-green-700"
                        onClick={() => next === "PI"
                          ? prepareProformaInvoice.mutate(doc.id)
                          : createNextDoc.mutate({ id: doc.id, nextDocType: next })}
                        disabled={lpgBlocked || createNextDoc.isPending || prepareProformaInvoice.isPending}
                        title={lpgBlocked ? "Blocked pending LPG STS clearance" : `Generate ${next}`}
                        data-testid={`button-generate-next-${next}-${doc.id}`}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        {next === "PI" ? "Create PI" : `Generate ${next}`}
                      </Button>
                    ))}
                    {doc.docType === "SPA" && (
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-green-600 hover:text-green-700" onClick={() => setAddendumSpaId(doc.id)} data-testid={`button-create-addendum-${doc.id}`}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Create Addendum
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive hover:text-destructive/80"
                        onClick={() => {
                          if (confirm(`Delete "${doc.title}"? This permanently removes the document and its files.`)) {
                            deleteDoc.mutate(doc.id);
                          }
                        }}
                        disabled={deleteDoc.isPending}
                        title="Delete document"
                        data-testid={`button-delete-${doc.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Delete
                      </Button>
                    )}
                    {doc.docxPath && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => window.open(`/api/documents/${doc.id}/download/docx`, "_blank")}
                        title="Download DOCX"
                        data-testid={`button-download-docx-${doc.id}`}
                      >
                        <Download className="w-4 h-4 text-blue-600" />
                      </Button>
                    )}
                    {doc.docType !== "PI" && ((doc.docType === "ADDENDUM"
                      ? (doc.sellerSignature && doc.buyerSignature)
                      : doc.docType === "NCNDA"
                        ? (doc.sellerSignature || doc.buyerSignature)
                        : doc.buyerSignature) &&
                      doc.status !== "sent" &&
                      doc.status !== "accepted" &&
                      doc.status !== "final" &&
                      (doc.docType === "ADDENDUM" || !doc.pdfPath)) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-orange-600 hover:text-orange-700"
                        onClick={() => convertToPdf.mutate(doc.id)}
                         disabled={lpgBlocked || convertToPdf.isPending}
                         title={lpgBlocked ? "Blocked pending LPG STS clearance" : "Convert to PDF"}
                        data-testid={`button-convert-pdf-${doc.id}`}
                      >
                        <FileCheck className="w-4 h-4 mr-1" />
                        {convertToPdf.isPending ? "Converting..." : "Convert to PDF"}
                      </Button>
                    )}
                    {doc.pdfPath && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => window.open(`/api/documents/${doc.id}/download/pdf`, "_blank")}
                        title="Download PDF"
                        data-testid={`button-download-pdf-${doc.id}`}
                      >
                        <FileText className="w-4 h-4 text-red-600" />
                      </Button>
                    )}
                    {isAdmin && doc.status === "pending_review" && !isProformaSpa(doc) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-50 dark:text-amber-400"
                        onClick={() => openAdminReview(doc)}
                        title="Admin review checklist"
                        data-testid={`button-admin-review-${doc.id}`}
                      >
                        <ClipboardCheck className="w-3.5 h-3.5 mr-1" />
                        Review
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openView(doc)}
                      data-testid={`button-view-doc-${doc.id}`}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {canAmend(doc) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(doc)}
                        data-testid={`button-amend-doc-${doc.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                 </div>
                );
              })()
            );

            // Repository view: every document chain lives under ONE reference
            // block. Resolution is CHAIN-level, never per-child:
            //  1. each doc resolves to a chain-root identity by walking
            //     parentDocId (cycle-guarded); if an ancestor is not visible
            //     in this (possibly scoped) list, its id still serves as the
            //     synthetic chain root, so visible siblings stay together;
            //  2. each chain picks ONE canonical reference — the first
            //     enquiry ref / deal recap number / trade ref found walking
            //     members oldest-first — shared by every member;
            //  3. chains that carry the same reference merge into one block
            //     (same deal); referenceless chains fall back to DOC:<rootId>.
            const byId = new Map((docs || []).map((d) => [d.id, d]));
            const rootKeyOf = (doc: Doc): string => {
              let cur = doc;
              const seen = new Set<string>([cur.id]);
              while (cur.parentDocId) {
                if (seen.has(cur.parentDocId)) {
                  // Cycle (defensive — the DB never creates one): every member
                  // must resolve to the SAME representative, so pick the
                  // lexicographically smallest id on the traversed path.
                  return Array.from(seen).sort()[0];
                }
                const parent = byId.get(cur.parentDocId);
                if (!parent) return cur.parentDocId; // invisible ancestor = synthetic chain root
                cur = parent;
                seen.add(cur.id);
              }
              return cur.id;
            };
            const chains = new Map<string, Doc[]>();
            for (const d of docs || []) {
              const rk = rootKeyOf(d);
              const list = chains.get(rk) || [];
              list.push(d);
              chains.set(rk, list);
            }
            const chainBlockOf = new Map<string, { key: string; label: string }>();
            for (const [rk, members] of Array.from(chains.entries())) {
              const oldestFirst = members.slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
              const ref = oldestFirst.map((m) => m.enquiryRef || m.dealRecapNumber || m.tradeRef).find(Boolean);
              chainBlockOf.set(rk, ref
                ? { key: `REF:${ref}`, label: ref }
                : { key: `DOC:${rk}`, label: (byId.get(rk) || oldestFirst[0]).title });
            }
            // A doc survives the search if it matches directly OR its
            // block's reference label matches (find a deal by its ref even
            // when a child doc doesn't carry the ref field itself).
            const searchedDocs = filteredDocs.filter((d) =>
              docMatches(d) || (q !== "" && chainBlockOf.get(rootKeyOf(d))!.label.toLowerCase().includes(q))
            );

            if (searchedDocs.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <FileText className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-sm font-medium">No documents found</p>
                  <p className="text-xs">{q ? `No documents match "${docSearch.trim()}"` : docTabFilter !== "all" ? "No documents in this category" : "Select a template above to generate trade documents"}</p>
                </div>
              );
            }

            if (docViewMode === "list") {
              return <div className="space-y-2">{searchedDocs.map(renderDocRow)}</div>;
            }

            const blocks = new Map<string, { label: string; items: Doc[]; latest: number }>();
            for (const d of searchedDocs) {
              const { key, label } = chainBlockOf.get(rootKeyOf(d))!;
              const b = blocks.get(key) || { label, items: [], latest: 0 };
              b.items.push(d);
              b.latest = Math.max(b.latest, new Date(d.createdAt).getTime());
              blocks.set(key, b);
            }
            const ordered = Array.from(blocks.entries()).sort((a, b) => b[1].latest - a[1].latest);
            const testKey = (key: string) => key.replace(/[^a-zA-Z0-9_-]+/g, "-");
            return (
              <div className="space-y-3">
                {ordered.map(([key, block]) => {
                  const open = q ? true : expandedRefBlocks.has(key);
                  return (
                    <div key={key} className="rounded-lg border overflow-hidden" data-testid={`ref-block-${testKey(key)}`}>
                      <div className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-muted/60">
                        <button
                          className="flex items-center gap-3 min-w-0 flex-1 text-left"
                          onClick={() => toggleRefBlock(key)}
                          data-testid={`ref-block-toggle-${testKey(key)}`}
                        >
                          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <FolderOpen className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{block.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {block.items.length} document{block.items.length === 1 ? "" : "s"}
                              {" "}&middot;{" "}
                              {Array.from(new Set(block.items.map((d) => d.docType))).join(", ")}
                            </div>
                          </div>
                        </button>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 h-7 text-xs"
                            disabled={zipDownloadingKey === key}
                            onClick={() => downloadBlockZip(key, block.label, block.items)}
                            data-testid={`button-download-block-${testKey(key)}`}
                          >
                            {zipDownloadingKey === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">Download all</span>
                          </Button>
                          <Badge variant="secondary" className="text-[10px]">{block.items.length}</Badge>
                          <button
                            onClick={() => toggleRefBlock(key)}
                            aria-label={open ? "Collapse" : "Expand"}
                            data-testid={`ref-block-chevron-${testKey(key)}`}
                          >
                            {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                          </button>
                        </div>
                      </div>
                      {open && (
                        <div className="p-3 space-y-2 border-t">
                          {block.items
                            .slice()
                            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                            .map(renderDocRow)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>
      )}

      {selectedType && (
        <Suspense fallback={null}>
          <GenerateDialog />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <DocGenDialogs />
      </Suspense>
    </div>
  );
}
