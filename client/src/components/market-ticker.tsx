import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown } from "lucide-react";

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
    : p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

function TickerItem({ p }: { p: MarketPrice }) {
  const up = (p.changePct ?? 0) >= 0;
  return (
    <div className="flex items-center gap-2 px-5 shrink-0" data-testid={`ticker-item-${p.symbol}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70 whitespace-nowrap">
        {p.label}
      </span>
      <span className="text-sm font-bold text-white whitespace-nowrap" data-testid={`ticker-price-${p.symbol}`}>
        {formatPrice(p.price)}
        <span className="ml-1 text-[10px] font-medium text-white/50">{p.unit}</span>
      </span>
      {p.changePct != null && (
        <span
          className={`flex items-center gap-0.5 text-xs font-semibold whitespace-nowrap ${up ? "text-emerald-400" : "text-red-400"}`}
          data-testid={`ticker-change-${p.symbol}`}
        >
          {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {up ? "+" : ""}
          {p.changePct.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

export function MarketTicker() {
  const { data: prices } = useQuery<MarketPrice[]>({
    queryKey: ["/api/market-prices"],
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  if (!prices || prices.length === 0) return null;

  // Bullex Commodity Index: equal-weighted average daily % change across the
  // active commodities the desk trades, rebased to 100 at the prior close.
  const changes = prices.map((p) => p.changePct).filter((c): c is number => c != null);
  const indexPct = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null;
  const indexLevel = indexPct != null ? 100 + indexPct : null;
  const indexUp = (indexPct ?? 0) >= 0;

  // Duplicate the list so the marquee loops seamlessly.
  const loop = [...prices, ...prices];

  return (
    <div
      className="relative bg-[#1a1d23] border-y border-white/10 overflow-hidden"
      data-testid="market-ticker"
    >
      <div className="flex items-center">
        <div className="z-10 shrink-0 flex items-center gap-2 px-4 py-2.5 bg-primary">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-widest text-white whitespace-nowrap">
            Live Markets
          </span>
          {indexLevel != null && indexPct != null && (
            <span
              className="ml-2 pl-3 border-l border-white/25 flex items-center gap-1.5 whitespace-nowrap"
              data-testid="ticker-bullex-index"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/75">
                Bullex Index
              </span>
              <span className="text-xs font-bold text-white">{indexLevel.toFixed(2)}</span>
              <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${indexUp ? "text-emerald-300" : "text-red-300"}`}>
                {indexUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {indexUp ? "+" : ""}
                {indexPct.toFixed(2)}%
              </span>
            </span>
          )}
        </div>
        <div className="relative flex-1 overflow-hidden py-2.5">
          <div className="flex w-max animate-ticker-scroll hover:[animation-play-state:paused]">
            {loop.map((p, i) => (
              <TickerItem key={`${p.symbol}-${i}`} p={p} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
