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
  Eye,
} from "lucide-react";
import type { Trade, TradeDocument } from "@shared/schema";

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

  const { data: tradeDocs, isLoading: docsLoading } = useQuery<TradeDocument[]>({
    queryKey: ["/api/trade-documents"],
  });
  const { data: trades, isLoading: tradesLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });

  const isLoading = docsLoading || tradesLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
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
                  Document Vault
                </h1>
                <p className="text-white/60 text-sm leading-snug mt-1">
                  Secure repository of all trade pipeline documents — archived for compliance and audit.
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
                                    onClick={() => window.open(`/api/trade-documents/${doc.id}/view`, "_blank")}
                                    data-testid={`btn-view-${doc.id}`}
                                  >
                                    <Eye className="w-3 h-3" />
                                    View
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => window.open(`/api/trade-documents/${doc.id}/download`, "_blank")}
                                    data-testid={`btn-download-vault-${doc.id}`}
                                  >
                                    <Download className="w-3.5 h-3.5" />
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
