import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GitMerge,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Lock,
} from "lucide-react";
import type { TradeMatch } from "@shared/schema";

// Anonymized terminal listing — reg codes only, never party names (server-shaped).
interface Listing {
  id: string;
  side: "buy" | "sell";
  commodity: string;
  volume: number;
  unit: string;
  price: number;
  currency: string;
  origin: string;
  destination: string;
  grade: string;
  incoterms: string;
  payment: string;
  regCode: string;
  registered: boolean;
  instrumentType: "LOI" | "FCO" | null;
  status: "open" | "matched" | "registered";
}

interface Suggestion {
  id: string;
  buyEnquiryRef: string;
  sellEnquiryRef: string;
  product: string;
  score: number;
  breakdown: Record<string, number>;
  buy: Listing;
  sell: Listing;
}

type MatchRow = TradeMatch & { buy: Listing | null; sell: Listing | null };

const fmtNum = (n: number | string | null | undefined) => {
  const parsed = typeof n === "number" ? n : parseFloat(String(n ?? "").replace(/[^\d.]/g, ""));
  return isNaN(parsed) ? String(n ?? "—") : new Intl.NumberFormat("en-US").format(parsed);
};

const scoreColor = (score: number) =>
  score >= 70
    ? "bg-emerald-500 text-white"
    : score >= 40
      ? "bg-amber-500 text-white"
      : "bg-muted text-muted-foreground";

// Anonymized listing chip. Identifies the party ONLY by its BULLEX registration
// code — buyer/seller names are never sent to this page by the backend.
function ListingChip({ listing, side }: { listing: Listing | null; side: "buy" | "sell" }) {
  if (!listing) {
    return (
      <div className="flex flex-col gap-0.5 text-muted-foreground" data-testid={`listing-missing-${side}`}>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 w-fit">
          {side === "buy" ? "BUY" : "SELL"}
        </Badge>
        <span className="text-[11px]">Enquiry no longer available</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5" data-testid={`listing-${listing.id}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant={side === "buy" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
          {side === "buy" ? "BUY" : "SELL"}
        </Badge>
        <span className="font-mono text-xs font-semibold" data-testid={`text-regcode-${listing.id}`}>
          {listing.regCode}
        </span>
        {listing.registered && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 gap-1 border-emerald-500 text-emerald-600 dark:text-emerald-400"
            data-testid={`badge-registered-${listing.id}`}
          >
            <ShieldCheck className="w-3 h-3" /> {listing.instrumentType || "REG"}
          </Badge>
        )}
      </div>
      <span className="font-mono text-[10px] text-muted-foreground">{listing.id}</span>
      <span className="text-xs">
        {listing.commodity} · {fmtNum(listing.volume)} {listing.unit}
        {listing.price ? ` · ${fmtNum(listing.price)} ${listing.currency}` : ""}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {listing.origin} → {listing.destination}
        {listing.incoterms ? ` · ${listing.incoterms}` : ""}
      </span>
    </div>
  );
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  proposed: { label: "Proposed", className: "bg-amber-500 text-white" },
  confirmed: { label: "Confirmed", className: "bg-emerald-500 text-white" },
  rejected: { label: "Rejected", className: "bg-destructive text-destructive-foreground" },
};

export default function Matching() {
  const { role } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === "admin";

  const { data: suggestions, isLoading: loadingSuggestions } = useQuery<Suggestion[]>({
    queryKey: ["/api/trade-matches/suggestions"],
  });
  const { data: matches, isLoading: loadingMatches } = useQuery<MatchRow[]>({
    queryKey: ["/api/trade-matches"],
  });

  const [pendingPair, setPendingPair] = useState<string | null>(null);

  const propose = useMutation({
    mutationFn: async (vars: { id: string; buyEnquiryRef: string; sellEnquiryRef: string }) => {
      setPendingPair(vars.id);
      return apiRequest("POST", "/api/trade-matches", {
        buyEnquiryRef: vars.buyEnquiryRef,
        sellEnquiryRef: vars.sellEnquiryRef,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trade-matches/suggestions"] });
      toast({ title: "Match proposed", description: "Flagged to the deal desk for review." });
    },
    onError: (e: any) =>
      toast({ title: "Could not propose match", description: e?.message || "Error", variant: "destructive" }),
    onSettled: () => setPendingPair(null),
  });

  const review = useMutation({
    mutationFn: async (vars: { id: string; status: "confirmed" | "rejected" }) =>
      apiRequest("PATCH", `/api/trade-matches/${vars.id}`, { status: vars.status }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trade-matches/suggestions"] });
      toast({
        title: vars.status === "confirmed" ? "Match confirmed" : "Match rejected",
        description:
          vars.status === "confirmed"
            ? "Recorded as a desk decision. No documents were generated."
            : "The proposed match was rejected.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Could not update match", description: e?.message || "Error", variant: "destructive" }),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
            <GitMerge className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">
              Deal Desk Matching
            </h1>
            <p className="text-sm text-muted-foreground">
              Pair compatible buy/sell instruments and flag them to the desk. A match is a proposal for review — no
              documents are generated. Parties are shown by registration code only.
            </p>
          </div>
        </div>

        <div
          className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-md px-3 py-2"
          data-testid="text-confidential-notice"
        >
          <Lock className="w-3.5 h-3.5 shrink-0" />
          Confidential: counterparties are anonymized to BULLEX registration codes (BFG-CL / BFG-TM). Names are never
          exposed on this screen.
        </div>

        {/* Suggestions — scored candidate pairs. Admin & team may propose. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-primary" /> Match Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingSuggestions ? (
              <Skeleton className="h-32 w-full" />
            ) : !suggestions?.length ? (
              <p className="text-sm text-muted-foreground" data-testid="text-no-suggestions">
                No compatible buy/sell instrument pairs available right now.
              </p>
            ) : (
              suggestions.map((s) => (
                <div
                  key={s.id}
                  className="border border-border rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-4"
                  data-testid={`suggestion-${s.id}`}
                >
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
                    <ListingChip listing={s.buy} side="buy" />
                    <ArrowRight className="w-4 h-4 text-muted-foreground mx-auto hidden md:block" />
                    <ListingChip listing={s.sell} side="sell" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`text-sm font-bold rounded-md px-2 py-1 ${scoreColor(s.score)}`}
                        data-testid={`text-score-${s.id}`}
                      >
                        {s.score}
                      </span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">score</span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        propose.mutate({ id: s.id, buyEnquiryRef: s.buyEnquiryRef, sellEnquiryRef: s.sellEnquiryRef })
                      }
                      disabled={propose.isPending && pendingPair === s.id}
                      data-testid={`button-propose-${s.id}`}
                    >
                      <GitMerge className="w-4 h-4 mr-1" /> Propose Match
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Proposed / reviewed matches. Admin confirms or rejects. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="w-4 h-4 text-primary" /> Proposed Matches
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingMatches ? (
              <Skeleton className="h-32 w-full" />
            ) : !matches?.length ? (
              <p className="text-sm text-muted-foreground" data-testid="text-no-matches">
                No matches proposed yet. Propose one from a suggestion above.
              </p>
            ) : (
              matches.map((m) => {
                const badge = STATUS_BADGE[m.status] || STATUS_BADGE.proposed;
                return (
                  <div key={m.id} className="border border-border rounded-lg p-4 space-y-3" data-testid={`match-${m.id}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold" data-testid={`text-matchref-${m.id}`}>
                          {m.matchRef}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {m.product}
                        </Badge>
                        <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${badge.className}`} data-testid={`badge-status-${m.id}`}>
                          {badge.label}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        Proposed by {m.createdByLabel || "BULLEX Desk"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
                      <ListingChip listing={m.buy} side="buy" />
                      <ArrowRight className="w-4 h-4 text-muted-foreground mx-auto hidden md:block" />
                      <ListingChip listing={m.sell} side="sell" />
                    </div>

                    {m.notes && <p className="text-[11px] text-muted-foreground italic">“{m.notes}”</p>}

                    {m.status !== "proposed" && m.reviewedBy && (
                      <p className="text-[11px] text-muted-foreground" data-testid={`text-reviewed-${m.id}`}>
                        {badge.label} by {m.reviewedBy}
                      </p>
                    )}

                    {isAdmin && m.status === "proposed" && (
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
                        <Button
                          size="sm"
                          onClick={() => review.mutate({ id: m.id, status: "confirmed" })}
                          disabled={review.isPending}
                          data-testid={`button-confirm-${m.id}`}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => review.mutate({ id: m.id, status: "rejected" })}
                          disabled={review.isPending}
                          data-testid={`button-reject-${m.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-1" /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
