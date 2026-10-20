import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Activity, Clock } from "lucide-react";

interface MarketPrice {
  symbol: string;
  label: string;
  category: string;
  unit: string;
  price: number;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  currency: string;
  marketTime: string | null;
}

function formatPrice(p: number) {
  return p >= 100
    ? p.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export default function LivePrices() {
  const { data: prices, isLoading } = useQuery<MarketPrice[]>({
    queryKey: ["/api/market-prices"],
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  const changes = (prices ?? []).map((p) => p.changePct).filter((c): c is number => c != null);
  const indexPct = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null;
  const indexLevel = indexPct != null ? 100 + indexPct : null;
  const indexUp = (indexPct ?? 0) >= 0;

  const categories = Array.from(new Set((prices ?? []).map((p) => p.category)));
  const lastUpdate = (prices ?? [])
    .map((p) => (p.marketTime ? new Date(p.marketTime).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight" data-testid="text-live-prices-title">Live Prices</h1>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Exchange-traded reference prices for the commodities Bullex deals in. Refreshes every minute.
            </p>
          </div>
          {lastUpdate > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="text-prices-updated">
              <Clock className="w-3.5 h-3.5" />
              Last market print: {new Date(lastUpdate).toLocaleString()}
            </span>
          )}
        </div>

        {/* Bullex Index summary */}
        <Card className="rounded-none border border-border shadow-none bg-[#1a1d23] text-white">
          <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-widest text-white/60 font-semibold">Bullex Commodity Index</p>
                <p className="text-[11px] text-white/40">Equal-weighted daily move, rebased to 100 at prior close</p>
              </div>
            </div>
            {indexLevel != null && indexPct != null ? (
              <div className="flex items-center gap-3" data-testid="text-bullex-index">
                <span className="text-3xl font-bold">{indexLevel.toFixed(2)}</span>
                <span className={`flex items-center gap-1 text-sm font-semibold ${indexUp ? "text-emerald-400" : "text-red-400"}`}>
                  {indexUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {indexUp ? "+" : ""}{indexPct.toFixed(2)}%
                </span>
              </div>
            ) : (
              <Skeleton className="h-9 w-32 bg-white/10" />
            )}
          </CardContent>
        </Card>

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-none" />
            ))}
          </div>
        )}

        {categories.map((cat) => (
          <div key={cat} className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground" data-testid={`heading-category-${cat.toLowerCase()}`}>
              {cat}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(prices ?? []).filter((p) => p.category === cat).map((p) => {
                const up = (p.changePct ?? 0) >= 0;
                return (
                  <Card key={p.symbol} className="rounded-none border border-border shadow-none" data-testid={`card-price-${p.symbol}`}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-tight">{p.label}</p>
                        <Badge variant="outline" className="text-[10px] font-mono shrink-0">{p.symbol}</Badge>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold font-mono" data-testid={`text-price-${p.symbol}`}>{formatPrice(p.price)}</span>
                        <span className="text-xs text-muted-foreground">{p.unit}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        {p.changePct != null ? (
                          <span className={`flex items-center gap-1 font-semibold ${up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                            {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            {up ? "+" : ""}{p.changePct.toFixed(2)}%
                          </span>
                        ) : <span />}
                        {p.prevClose != null && (
                          <span className="text-muted-foreground">Prev {formatPrice(p.prevClose)}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}

        <p className="text-[11px] text-muted-foreground border-t border-border pt-4">
          Prices are exchange-traded futures reference quotes (COMEX / NYMEX / ICE via public market data), cached
          server-side for 5 minutes. Non-exchange commodities (iron ore, bauxite, manganese, petcoke, HSFO, NPK) are
          priced off negotiated contracts and paid index services and are not shown as live quotes.
        </p>
      </div>
    </div>
  );
}
