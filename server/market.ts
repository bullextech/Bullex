// Live commodity market prices via Yahoo Finance public chart API.
// Server-side cached (5 min) so public page traffic never fans out to Yahoo.
// Fail-soft per symbol: an unavailable contract is simply omitted.

export interface MarketPrice {
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

const SYMBOLS: { symbol: string; label: string; category: string; unit: string }[] = [
  { symbol: "TIO=F", label: "Iron Ore 62% Fe CFR China", category: "Minerals", unit: "USD/t" },
  { symbol: "HG=F", label: "Copper (COMEX)", category: "Metals", unit: "USD/lb" },
  { symbol: "ALI=F", label: "Aluminium (COMEX)", category: "Metals", unit: "USD/t" },
  { symbol: "BZ=F", label: "Brent Crude", category: "Energy", unit: "USD/bbl" },
  { symbol: "CL=F", label: "WTI Crude", category: "Energy", unit: "USD/bbl" },
  { symbol: "HO=F", label: "Gasoil / ULSD", category: "Energy", unit: "USD/gal" },
  { symbol: "RB=F", label: "RBOB Gasoline", category: "Energy", unit: "USD/gal" },
  { symbol: "NG=F", label: "Natural Gas (Henry Hub)", category: "Energy", unit: "USD/MMBtu" },
  { symbol: "MTF=F", label: "Coal API2 Rotterdam", category: "Energy", unit: "USD/t" },
];

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; data: MarketPrice[] } | null = null;
let inflight: Promise<MarketPrice[]> | null = null;

async function fetchSymbol(s: (typeof SYMBOLS)[number]): Promise<MarketPrice | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.symbol)}?range=1d&interval=1d`;
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!resp.ok) return null;
    const data: any = await resp.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== "number") return null;
    // Reject stale quotes (some Yahoo contracts stopped trading years ago,
    // e.g. TIO=F last printed in 2021). Never show outdated prices.
    const MAX_QUOTE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
    if (
      typeof meta.regularMarketTime === "number" &&
      Date.now() - meta.regularMarketTime * 1000 > MAX_QUOTE_AGE_MS
    ) {
      return null;
    }
    const prevClose = typeof meta.chartPreviousClose === "number" ? meta.chartPreviousClose : null;
    const change = prevClose != null ? price - prevClose : null;
    return {
      symbol: s.symbol,
      label: s.label,
      category: s.category,
      unit: s.unit,
      price,
      prevClose,
      change,
      changePct: prevClose ? ((price - prevClose) / prevClose) * 100 : null,
      currency: meta.currency || "USD",
      marketTime: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    };
  } catch (err: any) {
    console.error(`[market] fetch failed for ${s.symbol}:`, err?.message);
    return null;
  }
}

export async function getMarketPrices(): Promise<MarketPrice[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const results = await Promise.all(SYMBOLS.map(fetchSymbol));
      const data = results.filter((r): r is MarketPrice => r !== null);
      // Only replace the cache when we got something; keep serving stale data on a full outage.
      if (data.length > 0) cache = { at: Date.now(), data };
      return cache?.data ?? [];
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
