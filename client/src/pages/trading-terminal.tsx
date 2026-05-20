import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bell,
  Plus,
  Ship,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Layers,
  FileText,
  Wallet,
} from "lucide-react";
import type { Trade, KycApplication, Document, TradeEnquiry } from "@shared/schema";

type Ticker = { label: string; price: string; change: number };

const TICKERS: Ticker[] = [
  { label: "ALUMINIUM", price: "$2,412/MT", change: 0.75 },
  { label: "SUGAR", price: "$0.197/lb", change: -0.3 },
  { label: "CRUDE OIL WTI", price: "$82.40/bbl", change: 1.2 },
  { label: "GOLD SPOT", price: "$2,318/oz", change: 0.4 },
  { label: "BRENT CRUDE", price: "$85.90/bbl", change: 1.5 },
  { label: "COPPER LME", price: "$4.56/lb", change: 0.9 },
  { label: "WHEAT HRW", price: "$5.82/bu", change: -0.7 },
];

const LIVE_PRICES = [
  { label: "WTI Crude", price: "$82.29", change: 1.2 },
  { label: "Gold Spot", price: "$2,319", change: 0.4 },
  { label: "Copper", price: "$4.56/lb", change: 0.9 },
  { label: "Wheat HRW", price: "$5.82/bu", change: -0.7 },
];

const STAGE_STYLES: Record<string, { label: string; cls: string }> = {
  pre_deal:       { label: "Pre-Deal",     cls: "text-amber-600 dark:text-amber-400" },
  deal:           { label: "Deal Open",    cls: "text-sky-600 dark:text-sky-400" },
  execution:      { label: "In Transit",   cls: "text-emerald-600 dark:text-emerald-400" },
  final_payment:  { label: "Discharge",    cls: "text-emerald-600 dark:text-emerald-400" },
};

function fmtCurrencyShort(n: number): string {
  if (!isFinite(n)) return "$0";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function todayLong(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function PriceChange({ change }: { change: number }) {
  const up = change >= 0;
  return (
    <span className={`text-xs font-semibold tabular-nums ${up ? "text-emerald-500" : "text-red-500"}`}>
      {up ? "+" : ""}{change.toFixed(change % 1 === 0 ? 0 : 2)}%
    </span>
  );
}

export default function TradingTerminal() {
  const { data: trades, isLoading: tradesLoading } = useQuery<Trade[]>({ queryKey: ["/api/trades"] });
  const { data: kycApps, isLoading: kycLoading } = useQuery<KycApplication[]>({ queryKey: ["/api/kyc"] });
  const { data: documents, isLoading: docsLoading } = useQuery<Document[]>({ queryKey: ["/api/documents"] });
  const { data: enquiries, isLoading: enquiriesLoading } = useQuery<TradeEnquiry[]>({ queryKey: ["/api/trade-enquiries"] });

  const [tickerOffset, setTickerOffset] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTickerOffset((v) => (v + 1) % TICKERS.length), 4000);
    return () => clearInterval(id);
  }, []);

  const rotatedTickers = useMemo(
    () => [...TICKERS.slice(tickerOffset), ...TICKERS.slice(0, tickerOffset)],
    [tickerOffset],
  );

  const tradeStats = useMemo(() => {
    const list = trades ?? [];
    const totalValue = list.reduce((sum, t) => sum + (Number(t.totalValue) || 0), 0);
    const active = list.filter((t) => t.status !== "final_payment").length;
    const inTransit = list.filter((t) => t.status === "execution").length;
    const loadingNow = list.filter((t) => t.status === "deal").length;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const newThisWeek = list.filter((t) => {
      const created = t.createdAt ? new Date(t.createdAt as unknown as string).getTime() : 0;
      return created > weekAgo;
    }).length;
    return { totalValue, active, inTransit, loadingNow, newThisWeek };
  }, [trades]);

  const pendingLcValue = useMemo(() => {
    const list = trades ?? [];
    return list.filter((t) => t.status === "deal" || t.status === "execution")
               .reduce((sum, t) => sum + (Number(t.totalValue) || 0), 0);
  }, [trades]);

  const openLcCount = useMemo(() =>
    (documents ?? []).filter((d) => d.recipientResponse === "pending").length,
  [documents]);

  const openEnquiriesCount = useMemo(() =>
    (enquiries ?? []).filter((e) => e.status === "open" || e.status === "under_review").length,
  [enquiries]);

  const activeDeals = useMemo(() => {
    const list = (trades ?? []).filter((t) => t.status !== "final_payment");
    return list.slice(0, 6);
  }, [trades]);

  const kycQueue = useMemo(() => {
    return (kycApps ?? []).filter((a) => a.status === "pending").slice(0, 4);
  }, [kycApps]);

  const pendingDocs = useMemo(() => {
    return (documents ?? [])
      .filter((d) => d.recipientResponse === "pending" || !d.buyerSignature || !d.sellerSignature)
      .slice(0, 4);
  }, [documents]);

  const liveShipment = useMemo(() => (trades ?? []).find((t) => t.status === "execution"), [trades]);

  const docProgress = (t: Trade) => {
    const stageDocs = (t.stageDocuments ?? {}) as Record<string, Array<{ confirmed?: boolean }>>;
    const all = Object.values(stageDocs).filter(Array.isArray).flat();
    const total = all.length;
    const confirmed = all.filter((d) => d?.confirmed).length;
    return total === 0 ? "—" : `${confirmed}/${total}`;
  };

  const kycTag = (k: KycApplication): { label: string; tone: string } => {
    if (k.amlStatus === "flagged") return { label: "AML Flag", tone: "text-red-600 dark:text-red-400" };
    if (k.amlStatus === "running" || k.amlStatus === "review") return { label: "AML Review", tone: "text-amber-600 dark:text-amber-400" };
    if (k.amlStatus === "not_run") return { label: "AML Pending", tone: "text-sky-600 dark:text-sky-400" };
    return { label: "Docs Pending", tone: "text-sky-600 dark:text-sky-400" };
  };

  const docTag = (d: Document): { label: string; tone: string } => {
    if (d.recipientResponse === "rejected") return { label: "Amendment", tone: "text-red-600 dark:text-red-400" };
    if (!d.buyerSignature || !d.sellerSignature) return { label: "Awaiting Sign", tone: "text-amber-600 dark:text-amber-400" };
    if (d.recipientResponse === "pending") return { label: "Awaiting Review", tone: "text-sky-600 dark:text-sky-400" };
    return { label: "Pending", tone: "text-muted-foreground" };
  };

  return (
    <div className="h-full flex flex-col bg-muted/20">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-4 bg-background border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-terminal-title">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-welcome">
            Welcome back · {todayLong()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button aria-label="Notifications" className="p-2 rounded-md hover:bg-muted relative" data-testid="button-notifications">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
          </button>
          <button aria-label="Shipments" className="p-2 rounded-md hover:bg-muted" data-testid="button-shipments-quick">
            <Ship className="w-4 h-4" />
          </button>
          <Link href="/trade-enquiries">
            <Button size="sm" className="gap-1.5" data-testid="button-new-enquiry">
              <Plus className="w-4 h-4" /> New Enquiry
            </Button>
          </Link>
        </div>
      </div>

      {/* Ticker strip */}
      <div className="bg-slate-900 dark:bg-slate-950 border-b border-slate-800 overflow-hidden">
        <div className="flex items-center gap-8 px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all duration-700">
          {rotatedTickers.map((t) => (
            <div key={t.label} className="flex items-center gap-2 text-slate-300" data-testid={`ticker-${t.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <span className="text-slate-400">{t.label}</span>
              <span className="text-white">{t.price}</span>
              <PriceChange change={t.change} />
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            value={fmtCurrencyShort(tradeStats.totalValue)}
            label="Trade Volume YTD"
            sub="Across all active trades"
            subTone="up"
            icon={<TrendingUp className="w-4 h-4" />}
            loading={tradesLoading}
            testId="kpi-volume"
          />
          <KpiCard
            value={String(tradeStats.active)}
            label="Active Deals"
            sub={`${tradeStats.newThisWeek} new this week`}
            subTone={tradeStats.newThisWeek > 0 ? "up" : "neutral"}
            icon={<Layers className="w-4 h-4" />}
            loading={tradesLoading}
            testId="kpi-active"
          />
          <KpiCard
            value={String(tradeStats.inTransit)}
            label="Shipments In Transit"
            sub={`${tradeStats.loadingNow} loading now`}
            subTone="neutral"
            icon={<Ship className="w-4 h-4" />}
            loading={tradesLoading}
            testId="kpi-transit"
          />
          <KpiCard
            value={fmtCurrencyShort(pendingLcValue)}
            label="Pending LC Value"
            sub={`${openLcCount} LCs open`}
            subTone="neutral"
            icon={<Wallet className="w-4 h-4" />}
            loading={tradesLoading || docsLoading}
            testId="kpi-lc"
          />
        </div>

        {/* Active Deals + Live Shipment */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Active Deals</h2>
              <Link href="/trading">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="link-view-all-deals">
                  View All <ArrowUpRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
            <div className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left py-2 font-semibold">Ref</th>
                    <th className="text-left py-2 font-semibold">Commodity</th>
                    <th className="text-left py-2 font-semibold">Value</th>
                    <th className="text-left py-2 font-semibold">Stage</th>
                    <th className="text-right py-2 font-semibold">Docs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tradesLoading && Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}><td colSpan={5} className="py-2"><Skeleton className="h-6" /></td></tr>
                  ))}
                  {!tradesLoading && activeDeals.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">No active deals</td></tr>
                  )}
                  {activeDeals.map((t) => {
                    const stage = STAGE_STYLES[t.status] ?? STAGE_STYLES.pre_deal;
                    const refShort = t.tradeRef.replace(/^BFG-\d{4}-/, "");
                    return (
                      <tr key={t.id} className="hover:bg-muted/40" data-testid={`row-deal-${t.id}`}>
                        <td className="py-2.5 font-mono text-xs">{refShort}</td>
                        <td className="py-2.5">{t.commodity}</td>
                        <td className="py-2.5 tabular-nums">{fmtCurrencyShort(Number(t.totalValue))}</td>
                        <td className={`py-2.5 text-xs font-semibold ${stage.cls}`}>{stage.label}</td>
                        <td className="py-2.5 text-right tabular-nums text-xs text-muted-foreground">{docProgress(t)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Live Shipment */}
          <Card className="p-0 overflow-hidden bg-slate-900 dark:bg-slate-950 text-slate-100 border-slate-800">
            <div className="px-5 pt-4 pb-3 flex items-center justify-between">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Live Shipment {liveShipment ? `— ${liveShipment.tradeRef}` : ""}
              </h2>
            </div>
            <div className="px-5 pb-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Vessel</p>
                  <p className="text-lg font-bold mt-0.5">{liveShipment ? `MV ${liveShipment.commodity.split(" ")[0]} Trader` : "MV Pacific Trader"}</p>
                </div>
                <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/15">In Transit</Badge>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                <span>{liveShipment?.origin ?? "Ras Tanura, SA"}</span>
                <span>{liveShipment?.destination ?? "JNPT Mumbai, IN"}</span>
              </div>
              <div className="relative h-1.5 bg-slate-800 rounded-full mb-2">
                <div className="absolute inset-y-0 left-0 bg-primary rounded-full" style={{ width: "63%" }} />
                <div className="absolute -top-0.5 -translate-x-1/2 text-primary" style={{ left: "63%" }}>
                  <Ship className="w-3 h-3" />
                </div>
              </div>
              <p className="text-[10px] text-slate-500 text-center mb-4">63% complete · ETA 24 Apr 2026</p>

              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-800">
                <Stat label="IMO" value="9456781" />
                <Stat label="Cargo" value="49,850 MT" />
                <Stat label="LC" value="MT700 Active" valueClass="text-primary" />
              </div>
            </div>
          </Card>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">KYC Queue</h2>
              <Link href="/kyc-admin">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="link-manage-kyc">
                  Manage <ArrowUpRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
            <div className="space-y-2">
              {kycLoading && Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-9 rounded-md" />
              ))}
              {!kycLoading && kycQueue.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">No pending applications</p>
              )}
              {!kycLoading && kycQueue.map((k) => {
                const tag = kycTag(k);
                return (
                  <Link key={k.id} href={`/kyc-admin?kycId=${k.id}`}>
                    <div className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/60 cursor-pointer" data-testid={`row-kyc-${k.id}`}>
                      <span className="text-sm font-medium truncate">{k.companyName}</span>
                      <span className={`text-[11px] font-semibold ${tag.tone}`}>{tag.label}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Documents Pending</h2>
              <Link href="/documents">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="link-view-docs">
                  View <ArrowUpRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
            <div className="space-y-2">
              {docsLoading && Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-9 rounded-md" />
              ))}
              {!docsLoading && pendingDocs.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">All documents complete</p>
              )}
              {!docsLoading && pendingDocs.map((d) => {
                const refShort = (d.tradeRef ?? d.id).replace(/^BFG-\d{4}-/, "").slice(0, 10);
                const tag = docTag(d);
                return (
                  <div key={d.id} className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/60" data-testid={`row-doc-${d.id}`}>
                    <span className="text-sm font-medium">
                      <span className="uppercase">{d.docType}</span> — {refShort}
                    </span>
                    <span className={`text-[11px] font-semibold ${tag.tone}`}>{tag.label}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Live Prices</h2>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="button-all-prices">
                All <ArrowUpRight className="w-3 h-3" />
              </Button>
            </div>
            <div className="space-y-1">
              {LIVE_PRICES.map((p) => (
                <div key={p.label} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/60" data-testid={`price-${p.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  <span className="text-sm">{p.label}</span>
                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="text-sm font-semibold">{p.price}</span>
                    <PriceChange change={p.change} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <p className="text-[10px] text-muted-foreground text-center pt-2" data-testid="text-data-note">
          {enquiriesLoading ? "Loading enquiries…" : `${openEnquiriesCount} open enquiries`} · Prices shown are indicative
        </p>
      </div>
    </div>
  );
}

function KpiCard({
  value, label, sub, subTone, icon, loading, testId,
}: {
  value: string;
  label: string;
  sub: string;
  subTone: "up" | "down" | "neutral";
  icon: React.ReactNode;
  loading?: boolean;
  testId: string;
}) {
  const subColor =
    subTone === "up" ? "text-emerald-600 dark:text-emerald-400" :
    subTone === "down" ? "text-red-600 dark:text-red-400" :
    "text-muted-foreground";
  return (
    <Card className="p-4 border-l-4 border-l-primary relative" data-testid={testId}>
      <div className="absolute top-3 right-3 text-muted-foreground/60">{icon}</div>
      {loading ? (
        <Skeleton className="h-8 w-32 mb-2" />
      ) : (
        <p className="text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      )}
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-1.5">{label}</p>
      <p className={`text-[11px] font-semibold mt-2 flex items-center gap-1 ${subColor}`}>
        {subTone === "up" && <ArrowUpRight className="w-3 h-3" />}
        {subTone === "down" && <ArrowDownRight className="w-3 h-3" />}
        {sub}
      </p>
    </Card>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
}
