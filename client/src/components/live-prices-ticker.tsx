import { useQuery } from "@tanstack/react-query";

type LivePrice = {
  name: string;
  unit: string;
  symbol: string;
  price: number;
  changePct: number;
};

function formatPrice(p: number, unit: string) {
  const decimals = p >= 100 ? 2 : p >= 10 ? 2 : p >= 1 ? 3 : 4;
  const formatted = p.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `$${formatted}${unit}`;
}

export function LivePricesTicker() {
  const { data, isLoading, isError } = useQuery<{ prices: LivePrice[]; cachedAt: number }>({
    queryKey: ["/api/live-prices"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const prices = data?.prices ?? [];

  return (
    <div
      className="bullex-header-dark border-b border-[hsl(220,40%,8%)] overflow-x-auto flex-shrink-0"
      data-testid="live-prices-ticker"
    >
      <div className="flex items-center gap-6 px-6 py-2.5 whitespace-nowrap min-h-[36px]">
        {isLoading && prices.length === 0 ? (
          <span className="text-[10px] uppercase tracking-wider text-white/50" data-testid="ticker-loading">
            Loading live commodity prices…
          </span>
        ) : isError && prices.length === 0 ? (
          <span className="text-[10px] uppercase tracking-wider text-red-400" data-testid="ticker-error">
            Live price feed unavailable
          </span>
        ) : prices.length === 0 ? (
          <span className="text-[10px] uppercase tracking-wider text-white/50" data-testid="ticker-empty">
            No live prices available
          </span>
        ) : (
          prices.map((t) => (
            <div
              key={t.symbol}
              className="flex items-center gap-2 text-xs"
              data-testid={`ticker-${t.symbol.toLowerCase()}`}
            >
              <span className="font-bold uppercase tracking-wider text-white/70 text-[10px]">
                {t.name}
              </span>
              <span className="font-mono font-semibold text-white">
                {formatPrice(t.price, t.unit)}
              </span>
              <span
                className={`font-mono font-semibold ${
                  t.changePct >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {t.changePct >= 0 ? "+" : ""}
                {t.changePct.toFixed(2)}%
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
