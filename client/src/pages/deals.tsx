import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowRight,
  GitMerge,
  FileText,
  CheckCircle2,
  Loader2,
  Download,
  AlertTriangle,
  PackageSearch,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
} from "lucide-react";
import type { Deal, TradeEnquiry, Document } from "@shared/schema";

type ProductGroup = { product: string; imports: TradeEnquiry[]; exports: TradeEnquiry[] };
type EnquiryRowData = {
  id: string;
  enquiryRef: string;
  product: string;
  side: string;
  quantity: string | null;
  unit: string | null;
  price: string | null;
  currency: string | null;
  status: string;
  inDeal: boolean;
};

const STAGE_LABELS: Record<string, string> = {
  matched: "Matched",
  documents_issued: "LOI + SCO issued",
  recaps_issued: "Deal Recaps issued",
  tfr_pending: "TFR pending approval",
  trade_forming: "Trade forming",
  trade_formed: "Trade formed",
};

const STAGE_COLORS: Record<string, string> = {
  matched: "bg-slate-500 text-white",
  documents_issued: "bg-blue-600 text-white",
  recaps_issued: "bg-indigo-600 text-white",
  tfr_pending: "bg-amber-500 text-white",
  trade_forming: "bg-amber-600 text-white",
  trade_formed: "bg-green-600 text-white",
};

export default function Deals() {
  const { toast } = useToast();
  const [startingPair, setStartingPair] = useState<string | null>(null);

  const { data: board, isLoading: boardLoading } = useQuery<ProductGroup[]>({ queryKey: ["/api/enquiry-board"] });
  const { data: enquiryRows, isLoading: rowsLoading } = useQuery<EnquiryRowData[]>({ queryKey: ["/api/enquiry-table"] });
  const { data: deals, isLoading: dealsLoading } = useQuery<Deal[]>({ queryKey: ["/api/deals"] });
  const { data: documents } = useQuery<Document[]>({ queryKey: ["/api/documents"] });

  const docById = useMemo(() => {
    const m = new Map<string, Document>();
    (documents ?? []).forEach(d => m.set(d.id, d));
    return m;
  }, [documents]);

  const totals = useMemo(() => {
    let imports = 0, exports = 0, matchable = 0;
    (board ?? []).forEach(g => {
      imports += g.imports.length;
      exports += g.exports.length;
      if (g.imports.length > 0 && g.exports.length > 0) matchable += 1;
    });
    return { imports, exports, matchable, products: board?.length ?? 0 };
  }, [board]);

  const startDeal = useMutation({
    mutationFn: async ({ importRef, exportRef }: { importRef: string; exportRef: string }) =>
      apiRequest("POST", "/api/deals", { importEnquiryRef: importRef, exportEnquiryRef: exportRef }),
    onSuccess: async (res) => {
      const deal = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiry-board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiry-table"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      if (deal?.cascadeError) {
        toast({ title: "Deal created with errors", description: deal.cascadeError, variant: "destructive" });
      } else {
        toast({ title: "Deal started", description: `${deal?.dealRef} — documents generated, TFR awaiting approval.` });
      }
    },
    onError: (e: any) => toast({ title: "Could not start deal", description: e.message, variant: "destructive" }),
    onSettled: () => setStartingPair(null),
  });

  const approveTfr = useMutation({
    mutationFn: async (dealId: string) => apiRequest("POST", `/api/deals/${dealId}/approve-tfr`, {}),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiry-board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiry-table"] });
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

  const EnquiryRow = ({ e, side }: { e: TradeEnquiry; side: "import" | "export" }) => {
    const party = side === "import"
      ? (e.buyerName || e.createdBy || "—")
      : (e.sellerName || e.producer || e.createdBy || "—");
    return (
      <div className="rounded border p-2 bg-background" data-testid={`enquiry-${side}-${e.id}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">{e.enquiryRef}</span>
          {e.validity && <span className="text-[10px] text-muted-foreground">valid {e.validity}</span>}
        </div>
        <div className="text-sm font-medium mt-0.5 truncate" title={party}>{party}</div>
        <div className="text-xs text-muted-foreground">
          {(e.quantity || "—")} {e.unit || ""}{e.price ? ` · ${e.price} ${e.currency || ""}` : ""}
        </div>
        {(e.loadingPort || e.dischargePort || e.origin) && (
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {side === "import"
              ? `${e.origin || e.loadingPort || "—"}`
              : `${e.dischargePort || e.loadingPort || "—"}`}
            {e.incoterms ? ` · ${e.incoterms}` : ""}
          </div>
        )}
      </div>
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
          <p className="text-sm text-muted-foreground">Enquiries grouped by product into Import and Export — start a deal where both sides exist.</p>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Products</div>
          <div className="text-2xl font-bold" data-testid="stat-products">{totals.products}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><ArrowDownToLine className="w-3 h-3 text-green-600" /> Imports (Buy)</div>
          <div className="text-2xl font-bold" data-testid="stat-imports">{totals.imports}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><ArrowUpFromLine className="w-3 h-3 text-red-600" /> Exports (Sell)</div>
          <div className="text-2xl font-bold" data-testid="stat-exports">{totals.exports}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><GitMerge className="w-3 h-3 text-primary" /> Matchable</div>
          <div className="text-2xl font-bold" data-testid="stat-matchable">{totals.matchable}</div>
        </CardContent></Card>
      </div>

      {/* Product matching board */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <PackageSearch className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Enquiry Matching Board</h2>
        </div>

        {boardLoading ? (
          <div className="space-y-3"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
        ) : (board?.length ?? 0) === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground" data-testid="text-no-enquiries">
            No active enquiries. Create Import (Buy) and Export (Sell) enquiries for the same product to form a deal.
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {board!.map(group => {
              const matchable = group.imports.length > 0 && group.exports.length > 0;
              return (
                <Card key={group.product} data-testid={`card-product-${group.product}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
                      <span className="flex items-center gap-2">
                        <PackageSearch className="w-4 h-4 text-muted-foreground" />
                        {group.product}
                      </span>
                      {matchable ? (
                        <Badge className="bg-primary text-primary-foreground" data-testid={`badge-matchable-${group.product}`}>
                          <GitMerge className="w-3 h-3 mr-1" /> Matchable
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground" data-testid={`badge-awaiting-${group.product}`}>
                          <Clock className="w-3 h-3 mr-1" />
                          {group.imports.length === 0 ? "Awaiting import" : "Awaiting export"}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Imports column */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-green-600 text-white text-[10px]">IMPORT (BUY)</Badge>
                          <span className="text-xs text-muted-foreground">{group.imports.length}</span>
                        </div>
                        {group.imports.length === 0 ? (
                          <div className="text-xs text-muted-foreground italic py-2">No import enquiries</div>
                        ) : group.imports.map(e => <EnquiryRow key={e.id} e={e} side="import" />)}
                      </div>
                      {/* Exports column */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-red-600 text-white text-[10px]">EXPORT (SELL)</Badge>
                          <span className="text-xs text-muted-foreground">{group.exports.length}</span>
                        </div>
                        {group.exports.length === 0 ? (
                          <div className="text-xs text-muted-foreground italic py-2">No export enquiries</div>
                        ) : group.exports.map(e => <EnquiryRow key={e.id} e={e} side="export" />)}
                      </div>
                    </div>

                    {matchable && (
                      <div className="border-t pt-3 space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">Suggested matches</div>
                        {group.imports.flatMap(imp => group.exports.map(exp => {
                          const pairId = `${imp.enquiryRef}__${exp.enquiryRef}`;
                          return (
                            <div key={pairId} className="flex items-center gap-2 flex-wrap rounded border bg-muted/30 p-2" data-testid={`pair-${pairId}`}>
                              <span className="font-mono text-[11px] text-green-700 dark:text-green-400">{imp.enquiryRef}</span>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                              <span className="font-mono text-[11px] text-red-700 dark:text-red-400">{exp.enquiryRef}</span>
                              <Button
                                size="sm"
                                className="ml-auto h-7"
                                disabled={startDeal.isPending}
                                onClick={() => { setStartingPair(pairId); startDeal.mutate({ importRef: imp.enquiryRef, exportRef: exp.enquiryRef }); }}
                                data-testid={`button-start-deal-${pairId}`}
                              >
                                {startDeal.isPending && startingPair === pairId
                                  ? (<><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Starting…</>)
                                  : (<><GitMerge className="w-3.5 h-3.5 mr-1" /> Start Deal</>)}
                              </Button>
                            </div>
                          );
                        }))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* All enquiries table */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">All Enquiries</h2>
          {!rowsLoading && <Badge variant="outline" data-testid="badge-enquiry-count">{enquiryRows?.length ?? 0}</Badge>}
        </div>

        {rowsLoading ? (
          <Skeleton className="h-48" />
        ) : (enquiryRows?.length ?? 0) === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground" data-testid="text-no-enquiry-rows">
            No enquiries yet.
          </CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table data-testid="table-enquiries">
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Import / Export</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enquiryRows!.map(r => (
                    <TableRow key={r.id} data-testid={`row-enquiry-${r.id}`}>
                      <TableCell className="font-mono text-xs" data-testid={`cell-ref-${r.id}`}>{r.enquiryRef}</TableCell>
                      <TableCell className="font-medium" data-testid={`cell-product-${r.id}`}>{r.product}</TableCell>
                      <TableCell data-testid={`cell-side-${r.id}`}>
                        {r.side === "buy" ? (
                          <Badge className="bg-green-600 text-white text-[10px]">IMPORT (BUY)</Badge>
                        ) : (
                          <Badge className="bg-red-600 text-white text-[10px]">EXPORT (SELL)</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`cell-qty-${r.id}`}>
                        {r.quantity ? `${r.quantity} ${r.unit || ""}`.trim() : "—"}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`cell-price-${r.id}`}>
                        {r.price ? `${r.price} ${r.currency || ""}`.trim() : "—"}
                      </TableCell>
                      <TableCell data-testid={`cell-status-${r.id}`}>
                        {r.inDeal ? (
                          <Badge variant="outline" className="text-[10px]"><GitMerge className="w-3 h-3 mr-1" /> In deal</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] capitalize">{r.status.replace(/_/g, " ")}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
            No deals yet. Start one from a matchable product above.
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
