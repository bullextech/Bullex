import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import {
  FolderOpen,
  FileText,
  FileCheck,
  Shield,
  Download,
  Search,
  Paperclip,
  ClipboardCheck,
  Handshake,
  Ship,
  CreditCard,
} from "lucide-react";
import type { Trade, TradeDocument, Document as GeneratedDoc } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileSignature, Eye } from "lucide-react";
import { productImageRules, genericProductImage as imgGeneric } from "@/lib/product-images";

function detectBlockProduct(docs: GeneratedDoc[]): { img: string; name: string | null } {
  // Pull candidate product text from each doc: explicit Commodity/Product
  // lines in the rendered content first, then the doc title as fallback.
  const candidates: string[] = [];
  for (const d of docs) {
    const contentMatches = Array.from((d.content || "").matchAll(/(?:commodity|product)\s*(?:name)?\s*[:\-]\s*([^\n]+)/gi));
    for (const m of contentMatches) candidates.push(m[1]);
    candidates.push(d.title);
  }
  for (const text of candidates) {
    const rule = productImageRules.find((r) => r.test.test(text));
    if (rule) return { img: rule.img, name: rule.name };
  }
  return { img: imgGeneric, name: null };
}

const stageConfig: Record<string, { label: string; icon: typeof ClipboardCheck; color: string }> = {
  pre_deal: { label: "Pre-Deal", icon: ClipboardCheck, color: "text-sky-600" },
  deal: { label: "Deal", icon: Handshake, color: "text-primary" },
  execution: { label: "Execution", icon: Ship, color: "text-orange-600" },
  final_payment: { label: "Final Payment", icon: CreditCard, color: "text-emerald-600" },
};

const docKeyLabels: Record<string, string> = {
  kyc_registration: "KYC Registration",
  loi: "Letter of Intent (LOI)",
  fco: "Full Corporate Offer (FCO)",
  icpo_deal_recap: "ICPO / Deal Recap",
  spa: "Sale & Purchase Agreement (SPA)",
  cpa: "Commission & Protection Agreement (CPA)",
  lc_draft: "LC Draft Confirmation",
  lc_copy: "LC Copy",
  performance_guarantee: "Performance Guarantee",
  analysis_agency: "Analysis Agency Appointment",
  stevedoring_agency: "Stevedoring Agency",
  daily_loading_report: "Daily Loading Report",
  coa: "Certificate of Quality (COA)",
  cow: "Certificate of Weight (COW)",
  coo: "Certificate of Origin (COO)",
  bl: "Bills of Lading (BL)",
  beneficiary_cert: "Beneficiary Certificate",
  certificate_insurance: "Certificate of Insurance",
  sight_draft: "Sight Draft",
  commercial_invoice: "Commercial Invoice",
  coa_disport: "COA at Discharge Port",
  cow_disport: "COW at Discharge Port",
  final_invoice: "Final Commercial Invoice",
  copy_of_email: "Copy of Email to Buyer",
};

const docKeyToStage: Record<string, string> = {
  kyc_registration: "pre_deal", loi: "pre_deal", fco: "pre_deal", icpo_deal_recap: "pre_deal",
  spa: "deal", cpa: "deal", lc_draft: "deal", lc_copy: "deal", performance_guarantee: "deal",
  analysis_agency: "execution", stevedoring_agency: "execution", daily_loading_report: "execution",
  coa: "execution", cow: "execution", coo: "execution", bl: "execution",
  beneficiary_cert: "execution", certificate_insurance: "execution", sight_draft: "execution", commercial_invoice: "execution",
  coa_disport: "final_payment", cow_disport: "final_payment", final_invoice: "final_payment", copy_of_email: "final_payment",
};

export default function Vault() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [openBlockKey, setOpenBlockKey] = useState<string | null>(null);
  const [viewDoc, setViewDoc] = useState<GeneratedDoc | null>(null);

  const { data: tradeDocs, isLoading: docsLoading } = useQuery<TradeDocument[]>({
    queryKey: ["/api/trade-documents"],
  });
  const { data: trades, isLoading: tradesLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });
  const { data: generatedDocs } = useQuery<GeneratedDoc[]>({
    queryKey: ["/api/documents"],
  });

  const isLoading = docsLoading || tradesLoading;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-md" />
      </div>
    );
  }

  const allDocs = tradeDocs || [];
  const tradeMap = new Map((trades || []).map((t) => [t.id, t]));

  const filteredDocs = allDocs
    .filter((d) => {
      if (stageFilter !== "all" && docKeyToStage[d.documentKey] !== stageFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const trade = tradeMap.get(d.tradeId);
        const label = docKeyLabels[d.documentKey] || d.documentKey;
        return (
          d.originalName.toLowerCase().includes(q) ||
          label.toLowerCase().includes(q) ||
          (trade?.tradeRef || "").toLowerCase().includes(q) ||
          (trade?.commodity || "").toLowerCase().includes(q)
        );
      }
      return true;
    });

  const totalDocs = allDocs.length;
  const tradeCount = new Set(allDocs.map((d) => d.tradeId)).size;
  const stageBreakdown = allDocs.reduce<Record<string, number>>((acc, d) => {
    const stage = docKeyToStage[d.documentKey] || "unknown";
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {});

  const groupedByTrade: Record<string, TradeDocument[]> = {};
  filteredDocs.forEach((d) => {
    if (!groupedByTrade[d.tradeId]) groupedByTrade[d.tradeId] = [];
    groupedByTrade[d.tradeId].push(d);
  });

  return (
    <div className="overflow-y-auto h-full">
      <div className="bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="max-w-2xl flex items-center gap-3.5">
              <div className="p-2 bg-white/10 rounded flex-shrink-0" data-testid="icon-vault">
                <FolderOpen className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-serif font-bold leading-tight" data-testid="text-vault-title">
                  DocuVault
                </h1>
                <p className="text-white/60 text-sm leading-snug mt-1">
                  Central repository of all deal documents — filed by reference number, archived for compliance and audit.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-white/5 border border-white/10 px-3 py-2.5 rounded text-center" data-testid="stat-total-docs">
                <div className="text-[10px] text-white/50 uppercase tracking-wider">Files</div>
                <div className="text-lg font-bold">{totalDocs}</div>
              </div>
              <div className="bg-white/5 border border-white/10 px-3 py-2.5 rounded text-center" data-testid="stat-trade-count">
                <div className="text-[10px] text-white/50 uppercase tracking-wider">Trades</div>
                <div className="text-lg font-bold">{tradeCount}</div>
              </div>
              <div className="bg-white/5 border border-white/10 px-3 py-2.5 rounded text-center" data-testid="stat-stage-execution">
                <div className="text-[10px] text-white/50 uppercase tracking-wider">Exec.</div>
                <div className="text-lg font-bold">{stageBreakdown["execution"] || 0}</div>
              </div>
              <div className="bg-white/5 border border-white/10 px-3 py-2.5 rounded text-center" data-testid="stat-stage-deal">
                <div className="text-[10px] text-white/50 uppercase tracking-wider">Deal</div>
                <div className="text-lg font-bold">{stageBreakdown["deal"] || 0}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {(() => {
          // DocuVault: one square block per deal reference number; every
          // generated document created with that reference lands in the same
          // block automatically. Reference resolution is chain-level (walk
          // parentDocId to the chain root, pick the chain's first enquiry
          // ref / deal recap number / trade ref); referenceless chains fall
          // back to a block titled after the chain's root document.
          const gDocs = generatedDocs || [];
          if (gDocs.length === 0) return null;
          const byId = new Map(gDocs.map((d) => [d.id, d]));
          const rootKeyOf = (doc: GeneratedDoc): string => {
            let cur = doc;
            const seen = new Set<string>([cur.id]);
            while (cur.parentDocId) {
              if (seen.has(cur.parentDocId)) return Array.from(seen).sort()[0]; // cycle guard
              const parent = byId.get(cur.parentDocId);
              if (!parent) return cur.parentDocId; // invisible ancestor = synthetic root
              cur = parent;
              seen.add(cur.id);
            }
            return cur.id;
          };
          const chains = new Map<string, GeneratedDoc[]>();
          for (const d of gDocs) {
            const rk = rootKeyOf(d);
            chains.set(rk, [...(chains.get(rk) || []), d]);
          }
          const blocks = new Map<string, { label: string; hasRef: boolean; items: GeneratedDoc[]; latest: number }>();
          for (const [rk, members] of Array.from(chains.entries())) {
            const oldestFirst = members.slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            const ref = oldestFirst.map((m) => m.enquiryRef || m.dealRecapNumber || m.tradeRef).find(Boolean);
            const key = ref ? `REF:${ref}` : `DOC:${rk}`;
            const label = ref || (byId.get(rk) || oldestFirst[0]).title;
            const b = blocks.get(key) || { label, hasRef: !!ref, items: [], latest: 0 };
            for (const m of members) {
              b.items.push(m);
              b.latest = Math.max(b.latest, new Date(m.createdAt).getTime());
            }
            blocks.set(key, b);
          }
          const ordered = Array.from(blocks.entries()).sort((a, b) => b[1].latest - a[1].latest);
          const testKey = (key: string) => key.replace(/[^a-zA-Z0-9_-]+/g, "-");
          const openBlock = openBlockKey ? blocks.get(openBlockKey) : null;
          return (
            <div className="mb-10">
              <div className="mb-6">
                <h2 className="text-2xl font-serif font-bold text-foreground" data-testid="text-docuvault-title">
                  Deal Reference Blocks
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Every document generated under a reference number is filed in its block automatically
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {ordered.map(([key, block]) => {
                  const product = detectBlockProduct(block.items);
                  return (
                    <button
                      key={key}
                      onClick={() => setOpenBlockKey(key)}
                      className="aspect-square rounded-none border border-border bg-card hover:border-primary hover:shadow-md transition-all flex flex-col overflow-hidden text-left group"
                      data-testid={`docuvault-block-${testKey(key)}`}
                    >
                      <div className="relative w-full flex-1 min-h-0 overflow-hidden">
                        <img
                          src={product.img}
                          alt={product.name || "Trade commodity"}
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                        {product.name && (
                          <span className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[9px] uppercase tracking-wider px-1.5 py-0.5">
                            {product.name}
                          </span>
                        )}
                        <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 flex items-center gap-1">
                          <FolderOpen className="w-3 h-3" />
                          {block.items.length}
                        </span>
                      </div>
                      <div className="w-full p-2.5 border-t border-border bg-card">
                        <div className={`text-sm font-bold truncate ${block.hasRef ? "font-mono text-primary" : ""}`} title={block.label}>
                          {block.label}
                        </div>
                        <div className="text-[10px] text-muted-foreground/70 truncate">
                          {Array.from(new Set(block.items.map((d) => d.docType))).join(" · ")}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <Dialog open={!!openBlock} onOpenChange={(open) => { if (!open) setOpenBlockKey(null); }}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2" data-testid="text-docuvault-dialog-title">
                      <FolderOpen className="w-5 h-5 text-primary" />
                      <span className={openBlock?.hasRef ? "font-mono" : ""}>{openBlock?.label}</span>
                      <Badge variant="secondary" className="text-[10px]">{openBlock?.items.length || 0} documents</Badge>
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    {(openBlock?.items || [])
                      .slice()
                      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                      .map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted" data-testid={`docuvault-doc-${doc.id}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <FileCheck className="w-4 h-4 text-primary flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium truncate">{doc.title}</span>
                                <Badge variant="secondary" className="text-[10px]">{doc.docType}</Badge>
                                {(doc.buyerSignature || doc.sellerSignature) && (
                                  <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                    <FileSignature className="w-3 h-3 mr-0.5" />
                                    Signed
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                <span className="capitalize">{doc.status.replace(/_/g, " ")}</span>
                                {" "}&middot;{" "}
                                {new Date(doc.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setViewDoc(doc)}
                              title="View document"
                              data-testid={`docuvault-view-${doc.id}`}
                            >
                              <Eye className="w-4 h-4 text-primary" />
                            </Button>
                            {doc.docxPath && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => window.open(`/api/documents/${doc.id}/download/docx`, "_blank")}
                                title="Download DOCX"
                                data-testid={`docuvault-docx-${doc.id}`}
                              >
                                <Download className="w-4 h-4 text-blue-600" />
                              </Button>
                            )}
                            {doc.pdfPath && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => window.open(`/api/documents/${doc.id}/download/pdf`, "_blank")}
                                title="Download PDF"
                                data-testid={`docuvault-pdf-${doc.id}`}
                              >
                                <FileText className="w-4 h-4 text-red-600" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={!!viewDoc} onOpenChange={(open) => { if (!open) setViewDoc(null); }}>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 flex-wrap" data-testid="text-docuvault-view-title">
                      <FileCheck className="w-5 h-5 text-primary" />
                      <span>{viewDoc?.title}</span>
                      {viewDoc && <Badge variant="secondary" className="text-[10px]">{viewDoc.docType}</Badge>}
                      {viewDoc && (viewDoc.buyerSignature || viewDoc.sellerSignature) && (
                        <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          <FileSignature className="w-3 h-3 mr-0.5" />
                          Signed
                        </Badge>
                      )}
                    </DialogTitle>
                  </DialogHeader>
                  {viewDoc && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="capitalize">Status: {viewDoc.status.replace(/_/g, " ")}</span>
                        <span>&middot;</span>
                        <span>Created {new Date(viewDoc.createdAt).toLocaleString()}</span>
                        {(viewDoc.enquiryRef || viewDoc.dealRecapNumber || viewDoc.tradeRef) && (
                          <>
                            <span>&middot;</span>
                            <span className="font-mono">{viewDoc.enquiryRef || viewDoc.dealRecapNumber || viewDoc.tradeRef}</span>
                          </>
                        )}
                      </div>
                      <div className="p-4 rounded-md bg-muted whitespace-pre-wrap text-sm max-h-[50vh] overflow-y-auto" data-testid="text-docuvault-view-content">
                        {viewDoc.content || "No content available for this document."}
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        {viewDoc.docxPath && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => window.open(`/api/documents/${viewDoc.id}/download/docx`, "_blank")}
                            data-testid="btn-docuvault-view-docx"
                          >
                            <Download className="w-4 h-4 text-blue-600" />
                            Download DOCX
                          </Button>
                        )}
                        {viewDoc.pdfPath && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => window.open(`/api/documents/${viewDoc.id}/download/pdf`, "_blank")}
                            data-testid="btn-docuvault-view-pdf"
                          >
                            <FileText className="w-4 h-4 text-red-600" />
                            Download PDF
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          );
        })()}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-serif font-bold text-foreground" data-testid="text-vault-registry">
              Document Registry
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              All documents uploaded through the blockchain trading pipeline
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                className="pl-8 w-52 h-10 rounded-none border-border"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-vault"
              />
            </div>
            <div className="flex gap-1">
              <Button
                variant={stageFilter === "all" ? "default" : "outline"}
                size="sm"
                className="rounded-none text-xs h-10"
                onClick={() => setStageFilter("all")}
                data-testid="btn-filter-all"
              >
                All
              </Button>
              {Object.entries(stageConfig).map(([key, cfg]) => (
                <Button
                  key={key}
                  variant={stageFilter === key ? "default" : "outline"}
                  size="sm"
                  className="rounded-none text-xs h-10"
                  onClick={() => setStageFilter(key)}
                  data-testid={`btn-filter-${key}`}
                >
                  {cfg.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {Object.keys(groupedByTrade).length > 0 ? (
          <div className="space-y-6">
            {Object.entries(groupedByTrade).map(([tradeId, docs]) => {
              const trade = tradeMap.get(tradeId);
              const tradeRef = trade?.tradeRef || `Trade ${tradeId.slice(0, 8)}...`;
              const commodity = trade?.commodity || "Unknown";
              const commodityCategory = trade?.commodityCategory || "";
              const origin = trade?.origin || "—";
              const destination = trade?.destination || "—";
              const blockchainHash = trade?.blockchainHash || null;

              const byStage: Record<string, TradeDocument[]> = {};
              docs.forEach((d) => {
                const stage = docKeyToStage[d.documentKey] || "unknown";
                if (!byStage[stage]) byStage[stage] = [];
                byStage[stage].push(d);
              });

              return (
                <Card key={tradeId} className="rounded-none border-border" data-testid={`vault-trade-${tradeId}`}>
                  <CardHeader className="border-b border-border bg-muted/20">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-bold flex items-center gap-3">
                        <span className="font-mono text-primary">{tradeRef}</span>
                        <span className="text-muted-foreground font-normal">{commodity}</span>
                        {commodityCategory && <Badge variant="outline" className="text-[10px] rounded-none">{commodityCategory}</Badge>}
                      </CardTitle>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {origin} → {destination}
                        </span>
                        {blockchainHash && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Shield className="w-3 h-3" />
                            <span className="font-mono">{blockchainHash.slice(0, 10)}...</span>
                          </div>
                        )}
                        <Badge variant="secondary" className="text-[10px] rounded-none">
                          <Paperclip className="w-3 h-3 mr-1" />
                          {docs.length} file{docs.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {Object.entries(byStage).map(([stageKey, stageDocs]) => {
                      const cfg = stageConfig[stageKey];
                      if (!cfg) return null;
                      const Icon = cfg.icon;
                      return (
                        <div key={stageKey} className="border-b border-border/50 last:border-b-0" data-testid={`vault-stage-${tradeId}-${stageKey}`}>
                          <div className="flex items-center gap-2 px-5 py-2.5 bg-muted/10">
                            <Icon className={`w-4 h-4 ${cfg.color}`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.label} Stage</span>
                            <Badge variant="outline" className="text-[9px] rounded-none ml-auto">{stageDocs.length}</Badge>
                          </div>
                          <div className="divide-y divide-border/30">
                            {stageDocs.map((doc) => (
                              <div
                                key={doc.id}
                                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/20 transition-colors"
                                data-testid={`vault-doc-${doc.id}`}
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <FileCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium">{docKeyLabels[doc.documentKey] || doc.documentKey}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                      <Paperclip className="w-3 h-3" />
                                      <span className="truncate">{doc.originalName}</span>
                                      <span className="text-muted-foreground/50">({(doc.size / 1024).toFixed(0)} KB)</span>
                                      <span>&middot;</span>
                                      <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Badge variant="secondary" className="text-[9px] rounded-none uppercase">{doc.mimeType.split("/")[1]}</Badge>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 rounded-none text-xs gap-1"
                                    onClick={() => window.open(`/api/trade-documents/${doc.id}/download`, "_blank")}
                                    data-testid={`btn-download-vault-${doc.id}`}
                                  >
                                    <Download className="w-3 h-3" />
                                    Download
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="rounded-none">
            <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <FolderOpen className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm font-medium">
                {search || stageFilter !== "all" ? "No documents match your filters" : "No documents in the vault"}
              </p>
              <p className="text-xs mt-1">
                {search || stageFilter !== "all"
                  ? "Adjust your search or filter criteria"
                  : "Upload documents through the Blockchain Trading pipeline to populate the vault"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
