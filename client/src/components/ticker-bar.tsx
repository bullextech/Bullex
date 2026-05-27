import { useEffect, useState } from "react";

type Ticker = { symbol: string; price: string; unit: string; change: number };

const SEED: Ticker[] = [
  { symbol: "BRENT CRUDE", price: "85.90", unit: "bbl", change: 1.50 },
  { symbol: "COPPER LME",  price: "4.56",  unit: "lb",  change: 0.90 },
  { symbol: "WHEAT HRW",   price: "5.82",  unit: "bu",  change: -0.70 },
  { symbol: "NATURAL GAS", price: "1.94",  unit: "mmbtu", change: -1.30 },
  { symbol: "SOYBEANS",    price: "12.04", unit: "bu",  change: 0.20 },
  { symbol: "SILVER",      price: "27.42", unit: "oz",  change: -0.65 },
  { symbol: "GOLD",        price: "2364.10", unit: "oz", change: 0.42 },
  { symbol: "ALUMINIUM",   price: "2540.00", unit: "mt", change: -0.18 },
];

export function TickerBar() {
  const [ticks, setTicks] = useState<Ticker[]>(SEED);

  useEffect(() => {
    const id = setInterval(() => {
      setTicks((prev) =>
        prev.map((t) => {
          const drift = (Math.random() - 0.5) * 0.4;
          const newPrice = Math.max(0.01, parseFloat(t.price) * (1 + drift / 100));
          return { ...t, price: newPrice.toFixed(2), change: +(t.change + drift).toFixed(2) };
        }),
      );
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="border-b border-border bg-card text-foreground flex-shrink-0"
      data-testid="ticker-bar"
    >
      <div className="flex items-center overflow-x-auto whitespace-nowrap px-4 h-8 gap-6 text-[11px] font-medium" style={{ scrollbarWidth: "none" }}>
        {ticks.map((t) => {
          const up = t.change >= 0;
          return (
            <div key={t.symbol} className="flex items-center gap-1.5 flex-shrink-0" data-testid={`ticker-${t.symbol.toLowerCase().replace(/\s+/g, "-")}`}>
              <span className="text-muted-foreground uppercase tracking-wider text-[10px]">{t.symbol}</span>
              <span className="font-bold">${t.price}</span>
              <span className="text-muted-foreground text-[10px]">/{t.unit}</span>
              <span className={up ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-red-600 dark:text-red-400 font-semibold"}>
                {up ? "+" : ""}{t.change.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
