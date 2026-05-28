import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Bell,
  ShoppingCart,
  Plus,
  ArrowRight,
  Ship,
  TrendingUp,
  TrendingDown,
  Package,
  Building2,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
} from "lucide-react";
import type {
  Trade,
  KycApplication,
  Document,
  TradeEnquiry,
} from "@shared/schema";

const LIVE_PRICES: { name: string; price: string; change: number }[] = [
  { name: "WTI Crude", price: "$82.51", change: 1.2 },
  { name: "Gold Spot", price: "$2,316", change: 0.4 },
  { name: "Copper LME", price: "$4.56/lb", change: 0.9 },
];

function formatMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function stageLabel(s: string) {
  switch (s) {
    case "pre_deal": return "ICPO";
    case "deal": return "SPA";
    case "execution": return "BL";
    case "final_payment": return "Settled";
    default: return s;
  }
}

function stageColor(s: string) {
  switch (s) {
    case "final_payment": return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "execution": return "bg-blue-100 text-blue-700 border-blue-200";
    case "deal": return "bg-amber-100 text-amber-700 border-amber-200";
    default: return "bg-primary/10 text-primary border-primary/30";
  }
}

function kycBadge(s: string) {
  if (s === "approved") return { label: "Approved", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (s === "rejected") return { label: "Rejected", cls: "bg-red-100 text-red-700 border-red-200" };
  return { label: "Pending", cls: "bg-amber-100 text-amber-700 border-amber-200" };
}

function StatCard({ value, label, testId }: { value: string; label: string; testId: string }) {
  return (
    <Card className="bullex-stat-card" data-testid={testId}>
      <CardContent className="py-5 px-5">
        <div className="text-3xl font-bold text-foreground leading-tight" data-testid={`${testId}-value`}>{value}</div>
        <div className="text-xs text-muted-foreground mt-1.5">{label}</div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-foreground">{title}</h3>
      {action}
    </div>
  );
}

function SectionLinkButton({ href, label = "View All" }: { href: string; label?: string }) {
  return (
    <Link href={href}>
      <Button variant="outline" size="sm" className="h-7 px-3 rounded-none text-[11px] font-medium border-border">
        {label} <ArrowRight className="w-3 h-3 ml-1" />
      </Button>
    </Link>
  );
}

export default function Dashboard() {
  const { data: trades, isLoading: tl } = useQuery<Trade[]>({ queryKey: ["/api/trades"] });
  const { data: kycs, isLoading: kl } = useQuery<KycApplication[]>({ queryKey: ["/api/kyc"] });
  const { data: docs, isLoading: dl } = useQuery<Document[]>({ queryKey: ["/api/documents"] });
  const { data: enquiries, isLoading: el } = useQuery<TradeEnquiry[]>({ queryKey: ["/api/trade-enquiries"] });

  const isLoading = tl || kl || dl || el;

  const totalVolume = trades?.reduce((s, t) => s + t.totalValue, 0) || 0;
  const activeShipments = trades?.filter((t) => t.status === "execution").length || 0;
  const activeEnquiries = enquiries?.filter((e) => e.status === "active" || e.status === "open").length || 0;
  const letterOfCredit = docs?.filter((d) => ["POP", "POF", "BCL", "LOI"].includes((d.documentType || "").toUpperCase())).length || 0;

  const recentDeals = (trades || []).slice(0, 5);
  const recentKyc = (kycs || []).slice(0, 5);
  const pendingKyc = kycs?.filter((k) => k.status === "pending") || [];
  const pendingEnq = enquiries?.filter((e) => e.status === "open" || e.status === "active") || [];
  const pendingActions = [
    ...pendingKyc.slice(0, 3).map((k) => ({ id: `kyc-${k.id}`, label: `KYC review: ${k.companyName}`, href: "/kyc-admin" })),
    ...pendingEnq.slice(0, 3).map((e) => ({ id: `enq-${e.id}`, label: `Enquiry ${e.enquiryRef} · ${e.product}`, href: "/trade-enquiries" })),
  ].slice(0, 5);
  const liveShipments = trades?.filter((t) => t.status === "execution").slice(0, 3) || [];

  return (
    <div className="overflow-y-auto h-full bg-background">
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border bg-card">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Overview of your trading activity</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground" data-testid="button-notifications">
            <Bell className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground" data-testid="button-cart">
            <ShoppingCart className="w-4 h-4" />
          </Button>
          <Link href="/trade-enquiries">
            <Button size="sm" className="h-9 px-4 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold" data-testid="button-new-enquiry">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> New Enquiry
            </Button>
          </Link>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-none" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard value={String(activeEnquiries)} label="Active Enquiries" testId="stat-enquiries" />
            <StatCard value={formatMoney(totalVolume)} label="Pipeline Value" testId="stat-pipeline" />
            <StatCard value={String(activeShipments)} label="Shipments" testId="stat-shipments" />
            <StatCard value={String(letterOfCredit)} label="Letters of Credit" testId="stat-loc" />
          </div>
        )}

        {/* Recent Deals + Recent KYC */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="rounded-none border border-border shadow-none">
            <CardContent className="p-5">
              <SectionHeader title="Recent Deals" action={<SectionLinkButton href="/trading" />} />
              {recentDeals.length > 0 ? (
                <div className="border border-border overflow-x-auto">
                  <div className="min-w-[420px]">
                  <div className="grid grid-cols-[1fr_1.2fr_0.8fr_0.7fr] gap-2 px-3 py-2.5 bullex-header-dark text-[10px] font-bold uppercase tracking-wider">
                    <div>Ref</div><div>Commodity</div><div>Value</div><div>Stage</div>
                  </div>
                  {recentDeals.map((t) => (
                    <div key={t.id} className="grid grid-cols-[1fr_1.2fr_0.8fr_0.7fr] gap-2 px-3 py-3 border-t border-border text-sm items-center" data-testid={`deal-row-${t.id}`}>
                      <div className="font-mono text-xs">{t.tradeRef}</div>
                      <div className="truncate">{t.commodity}</div>
                      <div className="font-mono text-xs">{t.totalValue.toLocaleString()}</div>
                      <div>
                        <Badge variant="outline" className={`rounded-none text-[10px] font-bold ${stageColor(t.status)}`}>{stageLabel(t.status)}</Badge>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              ) : (
                <div className="border border-border py-10 text-center text-sm text-muted-foreground" data-testid="deals-empty">No deals yet</div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-none border border-border shadow-none">
            <CardContent className="p-5">
              <SectionHeader title="Recent KYC Applications" action={<SectionLinkButton href="/kyc-admin" />} />
              {recentKyc.length > 0 ? (
                <div className="divide-y divide-border border border-border">
                  {recentKyc.map((k) => {
                    const b = kycBadge(k.status);
                    return (
                      <div key={k.id} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`kyc-row-${k.id}`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">{k.companyName}</span>
                        </div>
                        <Badge variant="outline" className={`rounded-none text-[10px] font-bold shrink-0 ${b.cls}`}>{b.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="border border-border py-10 text-center text-sm text-muted-foreground" data-testid="kyc-empty">No KYC applications yet</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Pending Actions + Active Shipments + Live Prices */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="rounded-none border border-border shadow-none">
            <CardContent className="p-5 h-full flex flex-col">
              <SectionHeader title="Pending Actions" />
              {pendingActions.length > 0 ? (
                <ul className="space-y-2 flex-1" data-testid="pending-actions-list">
                  {pendingActions.map((a) => (
                    <li key={a.id} data-testid={`pending-${a.id}`}>
                      <Link href={a.href}>
                        <a className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors py-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="truncate">{a.label}</span>
                        </a>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex-1 flex items-center justify-center py-12 text-sm text-muted-foreground" data-testid="pending-empty">No pending actions</div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-none border border-border shadow-none">
            <CardContent className="p-5 h-full flex flex-col">
              <SectionHeader title="Active Shipments" action={<SectionLinkButton href="/trading" label="View" />} />
              {liveShipments.length > 0 ? (
                <ul className="space-y-2 flex-1" data-testid="shipments-list">
                  {liveShipments.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-1.5 text-sm" data-testid={`shipment-${t.id}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Ship className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="font-mono text-xs">{t.tradeRef}</span>
                        <span className="truncate text-muted-foreground">· {t.commodity}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0">{t.origin} → {t.destination}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-8 gap-3" data-testid="shipments-empty">
                  <Ship className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No shipments</p>
                  <Link href="/trading">
                    <Button size="sm" className="rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8" data-testid="button-add-shipment">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Shipment
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-none border border-border shadow-none">
            <CardContent className="p-5 h-full flex flex-col">
              <SectionHeader title="Live Prices" action={<SectionLinkButton href="/products" label="All" />} />
              <ul className="space-y-3 flex-1" data-testid="live-prices-list">
                {LIVE_PRICES.map((p) => (
                  <li key={p.name} className="flex items-center justify-between gap-3 text-sm" data-testid={`price-${p.name.toLowerCase().replace(/\s+/g, "-")}`}>
                    <span className="text-foreground">{p.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-foreground">{p.price}</span>
                      <span className={`font-mono text-xs font-semibold ${p.change >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {p.change >= 0 ? "+" : ""}{p.change.toFixed(1)}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <Link href="/products">
                  <Button variant="outline" size="sm" className="w-full h-8 rounded-none text-[11px] border-border">All Prices →</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
