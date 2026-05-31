import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  GitMerge,
  FileText,
  CheckCircle2,
  Loader2,
  Download,
  AlertTriangle,
  PackageSearch,
} from "lucide-react";
import type { Deal, TradeEnquiry, Document } from "@shared/schema";

type Match = { id: string; import: TradeEnquiry; export: TradeEnquiry };

const STAGE_LABELS: Record<string, string> = {
  matched: "Matched",
  documents_issued: "LOI + SCO issued",
  recaps_issued: "Deal Recaps issued",
  tfr_pending: "TFR pending approval",
  trade_formed: "Trade formed",
};

const STAGE_COLORS: Record<string, string> = {
  matched: "bg-slate-500 text-white",
  documents_issued: "bg-blue-600 text-white",
  recaps_issued: "bg-indigo-600 text-white",
  tfr_pending: "bg-amber-500 text-white",
  trade_formed: "bg-green-600 text-white",
};

export default function Deals() {
  const { toast } = useToast();
  const [startingId, setStartingId] = useState<string | null>(null);

  const { data: matches, isLoading: matchesLoading } = useQuery<Match[]>({ queryKey: ["/api/enquiry-matches"] });
  const { data: deals, isLoading: dealsLoading } = useQuery<Deal[]>({ queryKey: ["/api/deals"] });
  const { data: documents } = useQuery<Document[]>({ queryKey: ["/api/documents"] });

  const docById = useMemo(() => {
    const m = new Map<string, Document>();
    (documents ?? []).forEach(d => m.set(d.id, d));
    return m;
  }, [documents]);

  const startDeal = useMutation({
    mutationFn: async (match: Match) =>
      apiRequest("POST", "/api/deals", {
        importEnquiryRef: match.import.enquiryRef,
        exportEnquiryRef: match.export.enquiryRef,
      }),
    onSuccess: async (res) => {
      const deal = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiry-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      if (deal?.cascadeError) {
        toast({ title: "Deal created with errors", description: deal.cascadeError, variant: "destructive" });
      } else {
        toast({ title: "Deal started", description: `${deal?.dealRef} — documents generated, TFR awaiting approval.` });
      }
    },
    onError: (e: any) => toast({ title: "Could not start deal", description: e.message, variant: "destructive" }),
    onSettled: () => setStartingId(null),
  });

  const approveTfr = useMutation({
    mutationFn: async (dealId: string) => apiRequest("POST", `/api/deals/${dealId}/approve-tfr`, {}),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiry-matches"] });
      toast({ title: "TFR approved", description: `Trade ${data?.createdTradeRef} formed in the Deal Desk.` });
    },
    onError: (e: any) => toast({ title: "Approval failed", description: e.message, variant: "destructive" }),
  });

  const DocLink = ({ id, label }: { id?: string | null; label: string }) => {
    if (!id) return null;
    const doc = docById.get(id);
    const href = `/api/documents/${id}/download/${doc?.pdfPath ? "pdf" : "docx"}`;
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border bg-muted/40 hover:bg-muted"
        data-testid={`link-doc-${id}`}
      >
        <FileText className="w-3 h-3" />
        {doc?.title || label}
        <Download className="w-3 h-3 opacity-60" />
      </a>
    );
  };

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
          <GitMerge className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Deal Pipeline</h1>
          <p className="text-sm text-muted-foreground">Match Import and Export enquiries, then let the document cascade run automatically.</p>
        </div>
      </div>

      {/* Suggested matches */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <PackageSearch className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Suggested Matches</h2>
          {!matchesLoading && <Badge variant="outline" data-testid="badge-match-count">{matches?.length ?? 0}</Badge>}
        </div>

        {matchesLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-40" /><Skeleton className="h-40" />
          </div>
        ) : (matches?.length ?? 0) === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground" data-testid="text-no-matches">
            No compatible Import/Export pairs available. Create matching enquiries (same commodity) to form a deal.
          </CardContent></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {matches!.map(m => (
              <Card key={m.id} data-testid={`card-match-${m.id}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{m.import.product}</span>
                    <Badge variant="outline">{m.import.product}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="flex-1 rounded border p-2 bg-green-600/5 border-green-600/30">
                      <Badge className="bg-green-600 text-white text-[10px] mb-1">IMPORT (BUY)</Badge>
                      <div className="font-mono text-[11px] text-muted-foreground">{m.import.enquiryRef}</div>
                      <div className="mt-1">{m.import.buyerName || m.import.createdBy || "—"}</div>
                      <div className="text-muted-foreground">{m.import.quantity} {m.import.unit} · {m.import.price || "—"}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 rounded border p-2 bg-red-600/5 border-red-600/30">
                      <Badge className="bg-red-600 text-white text-[10px] mb-1">EXPORT (SELL)</Badge>
                      <div className="font-mono text-[11px] text-muted-foreground">{m.export.enquiryRef}</div>
                      <div className="mt-1">{m.export.sellerName || m.export.createdBy || "—"}</div>
                      <div className="text-muted-foreground">{m.export.quantity} {m.export.unit} · {m.export.price || "—"}</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={startDeal.isPending}
                    onClick={() => { setStartingId(m.id); startDeal.mutate(m); }}
                    data-testid={`button-start-deal-${m.id}`}
                  >
                    {startDeal.isPending && startingId === m.id
                      ? (<><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Starting…</>)
                      : (<><GitMerge className="w-4 h-4 mr-1" /> Start Deal</>)}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Active deals */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <GitMerge className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Deals</h2>
          {!dealsLoading && <Badge variant="outline" data-testid="badge-deal-count">{deals?.length ?? 0}</Badge>}
        </div>

        {dealsLoading ? (
          <Skeleton className="h-40" />
        ) : (deals?.length ?? 0) === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground" data-testid="text-no-deals">
            No deals yet. Start one from a suggested match above.
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {deals!.map(deal => (
              <Card key={deal.id} data-testid={`card-deal-${deal.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold" data-testid={`text-deal-ref-${deal.id}`}>{deal.dealRef}</span>
                      <Badge variant="outline">{deal.commodity}</Badge>
                      <Badge className={STAGE_COLORS[deal.stage] || "bg-slate-500 text-white"} data-testid={`badge-stage-${deal.id}`}>
                        {STAGE_LABELS[deal.stage] || deal.stage}
                      </Badge>
                    </div>
                    {deal.tradeRef && (
                      <Badge className="bg-green-600 text-white" data-testid={`badge-trade-${deal.id}`}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> {deal.tradeRef}
                      </Badge>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground font-mono">
                    {deal.importEnquiryRef} <ArrowRight className="w-3 h-3 inline" /> {deal.exportEnquiryRef}
                  </div>

                  {deal.cascadeError && (
                    <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded p-2" data-testid={`text-cascade-error-${deal.id}`}>
                      <AlertTriangle className="w-4 h-4 shrink-0" /> {deal.cascadeError}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <DocLink id={deal.loiDocId} label="LOI" />
                    <DocLink id={deal.scoDocId} label="SCO" />
                    <DocLink id={deal.dealRecapImportDocId} label="Deal Recap (Import)" />
                    <DocLink id={deal.dealRecapExportDocId} label="Deal Recap (Export)" />
                    <DocLink id={deal.tfrDocId} label="TFR" />
                  </div>

                  {deal.stage === "tfr_pending" && !deal.tradeRef && (
                    <Button
                      size="sm"
                      disabled={approveTfr.isPending}
                      onClick={() => approveTfr.mutate(deal.id)}
                      data-testid={`button-approve-tfr-${deal.id}`}
                    >
                      {approveTfr.isPending
                        ? (<><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Approving…</>)
                        : (<><CheckCircle2 className="w-4 h-4 mr-1" /> Approve TFR &amp; Form Trade</>)}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
