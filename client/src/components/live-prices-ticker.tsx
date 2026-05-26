const TICKER: { name: string; price: string; change: number }[] = [
  { name: "WHEAT", price: "$6.04/bu", change: 0.20 },
  { name: "SILVER", price: "$27.42/oz", change: -0.65 },
  { name: "ALUMINIUM", price: "$2,412/MT", change: 0.75 },
  { name: "SUGAR", price: "$0.197/lb", change: -0.30 },
  { name: "CRUDE OIL WTI", price: "$82.40/bbl", change: 1.20 },
  { name: "GOLD SPOT", price: "$2,318/oz", change: 0.40 },
  { name: "BRENT CRUDE", price: "$85.90/bbl", change: 0.55 },
  { name: "COPPER LME", price: "$4.56/lb", change: 0.90 },
  { name: "NATURAL GAS", price: "$1.94/mmbtu", change: -1.30 },
];

export function LivePricesTicker() {
  return (
    <div
      className="bullex-header-dark border-b border-[hsl(220,40%,8%)] overflow-x-auto flex-shrink-0"
      data-testid="live-prices-ticker"
    >
      <div className="flex items-center gap-6 px-6 py-2.5 whitespace-nowrap">
        {TICKER.map((t) => (
          <div
            key={t.name}
            className="flex items-center gap-2 text-xs"
            data-testid={`ticker-${t.name.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <span className="font-bold uppercase tracking-wider text-white/70 text-[10px]">
              {t.name}
            </span>
            <span className="font-mono font-semibold text-white">{t.price}</span>
            <span
              className={`font-mono font-semibold ${
                t.change >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {t.change >= 0 ? "+" : ""}
              {t.change.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
