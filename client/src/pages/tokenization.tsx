import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Mountain,
  Gem,
  Flame,
  Droplets,
  Sprout,
  Shield,
  Layers,
  Lock,
  Coins,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Hash,
  Globe,
  Zap,
  FileText,
  Link2,
} from "lucide-react";
import { Link } from "wouter";
import type { Trade, Block } from "@shared/schema";

const tokenDefinitions = [
  {
    id: "BFG-IRO",
    name: "Iron Ore Token",
    symbol: "IRO",
    commodity: "Iron Ore",
    category: "minerals",
    icon: Mountain,
    accent: "text-stone-600 dark:text-stone-400",
    accentBg: "bg-stone-600/10",
    standard: "BFG-20",
    decimals: 18,
    unitBacking: "1 token = 1 MT Iron Ore",
    specification: "Fe 62% min, fines & lump",
    origins: ["Guinea", "Sierra Leone", "Brazil"],
  },
  {
    id: "BFG-BAU",
    name: "Bauxite Token",
    symbol: "BAU",
    commodity: "Bauxite",
    category: "minerals",
    icon: Mountain,
    accent: "text-stone-600 dark:text-stone-400",
    accentBg: "bg-stone-600/10",
    standard: "BFG-20",
    decimals: 18,
    unitBacking: "1 token = 1 MT Bauxite",
    specification: "Al₂O₃ 45% min, rotary kiln grade",
    origins: ["Guinea", "Ghana"],
  },
  {
    id: "BFG-MNG",
    name: "Manganese Token",
    symbol: "MNG",
    commodity: "Manganese Ore",
    category: "minerals",
    icon: Mountain,
    accent: "text-stone-600 dark:text-stone-400",
    accentBg: "bg-stone-600/10",
    standard: "BFG-20",
    decimals: 18,
    unitBacking: "1 token = 1 MT Manganese Ore",
    specification: "Mn 36% min, metallurgical grade",
    origins: ["Gabon", "South Africa"],
  },
  {
    id: "BFG-CPC",
    name: "Copper Cathode Token",
    symbol: "CPC",
    commodity: "Copper Cathodes",
    category: "metals",
    icon: Gem,
    accent: "text-sky-600 dark:text-sky-400",
    accentBg: "bg-sky-600/10",
    standard: "BFG-20",
    decimals: 18,
    unitBacking: "1 token = 1 MT Copper Cathodes",
    specification: "Grade A, 99.99% purity, LME registered",
    origins: ["Zambia", "DRC", "Chile"],
  },
  {
    id: "BFG-ALU",
    name: "Aluminium Token",
    symbol: "ALU",
    commodity: "Aluminium",
    category: "metals",
    icon: Gem,
    accent: "text-sky-600 dark:text-sky-400",
    accentBg: "bg-sky-600/10",
    standard: "BFG-20",
    decimals: 18,
    unitBacking: "1 token = 1 MT Aluminium",
    specification: "Primary ingots, 99.7% min purity",
    origins: ["UAE", "India", "Russia"],
  },
  {
    id: "BFG-ULS",
    name: "ULSD Token",
    symbol: "ULS",
    commodity: "ULSD",
    category: "energy",
    icon: Flame,
    accent: "text-orange-600 dark:text-orange-400",
    accentBg: "bg-orange-600/10",
    standard: "BFG-20",
    decimals: 18,
    unitBacking: "1 token = 1 BBL ULSD",
    specification: "10ppm & 50ppm sulphur content",
    origins: ["Singapore", "UAE", "Netherlands"],
  },
  {
    id: "BFG-HSG",
    name: "HSGO Token",
    symbol: "HSG",
    commodity: "HSGO",
    category: "energy",
    icon: Flame,
    accent: "text-orange-600 dark:text-orange-400",
    accentBg: "bg-orange-600/10",
    standard: "BFG-20",
    decimals: 18,
    unitBacking: "1 token = 1 BBL HSGO",
    specification: "20,000ppm max sulphur",
    origins: ["Russia", "Middle East"],
  },
  {
    id: "BFG-LPG",
    name: "LPG Token",
    symbol: "LPG",
    commodity: "LPG",
    category: "energy",
    icon: Flame,
    accent: "text-orange-600 dark:text-orange-400",
    accentBg: "bg-orange-600/10",
    standard: "BFG-20",
    decimals: 18,
    unitBacking: "1 token = 1 MT LPG",
    specification: "Propane/butane mix, commercial grade",
    origins: ["Qatar", "UAE", "Saudi Arabia"],
  },
  {
    id: "BFG-BIT",
    name: "Bitumen Token",
    symbol: "BIT",
    commodity: "Bitumen",
    category: "petrochemicals",
    icon: Droplets,
    accent: "text-slate-600 dark:text-slate-400",
    accentBg: "bg-slate-600/10",
    standard: "BFG-20",
    decimals: 18,
    unitBacking: "1 token = 1 MT Bitumen",
    specification: "60/70 & 80/100 penetration grades",
    origins: ["Iran", "Singapore", "Bahrain"],
  },
  {
    id: "BFG-PCK",
    name: "Petcoke Token",
    symbol: "PCK",
    commodity: "Petcoke",
    category: "petrochemicals",
    icon: Droplets,
    accent: "text-slate-600 dark:text-slate-400",
    accentBg: "bg-slate-600/10",
    standard: "BFG-20",
    decimals: 18,
    unitBacking: "1 token = 1 MT Petcoke",
    specification: "Fuel grade, HGI 40+",
    origins: ["USA", "Saudi Arabia", "India"],
  },
  {
    id: "BFG-SUL",
    name: "Sulphur Token",
    symbol: "SUL",
    commodity: "Sulphur",
    category: "petrochemicals",
    icon: Droplets,
    accent: "text-slate-600 dark:text-slate-400",
    accentBg: "bg-slate-600/10",
    standard: "BFG-20",
    decimals: 18,
    unitBacking: "1 token = 1 MT Sulphur",
    specification: "99.5% min purity, granular/lump",
    origins: ["UAE", "Qatar", "Kuwait"],
  },
  {
    id: "BFG-NPK",
    name: "NPK Token",
    symbol: "NPK",
    commodity: "NPK",
    category: "fertilizers",
    icon: Sprout,
    accent: "text-teal-700 dark:text-teal-400",
    accentBg: "bg-teal-700/10",
    standard: "BFG-20",
    decimals: 18,
    unitBacking: "1 token = 1 MT NPK",
    specification: "Various N-P-K ratios, granular",
    origins: ["Russia", "Morocco", "China"],
  },
];

const categoryLabels: Record<string, string> = {
  minerals: "Minerals",
  metals: "Metals",
  energy: "Energy Products",
  petrochemicals: "Petrochemicals",
  fertilizers: "Fertilizers",
};

const categoryIcons: Record<string, typeof Mountain> = {
  minerals: Mountain,
  metals: Gem,
  energy: Flame,
  petrochemicals: Droplets,
  fertilizers: Sprout,
};

function getTokenLiveTrades(trades: Trade[], commodity: string) {
  return trades.filter(
    (t) => t.commodity.toLowerCase().includes(commodity.toLowerCase()) ||
      commodity.toLowerCase().includes(t.commodity.toLowerCase())
  );
}

export default function Tokenization() {
  const { data: trades, isLoading: tl } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });
  const { data: blocks, isLoading: bl } = useQuery<Block[]>({
    queryKey: ["/api/blocks"],
  });

  const isLoading = tl || bl;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[80px] rounded-md" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[260px] rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  const totalTokenizedValue = trades?.reduce((s, t) => s + t.totalValue, 0) || 0;
  const activeTokens = new Set(trades?.map((t) => t.commodity) || []).size;
  const latestBlock = blocks && blocks.length > 0 ? blocks[0] : null;

  const categories = [...new Set(tokenDefinitions.map((t) => t.category))];

  return (
    <div className="overflow-y-auto h-full">
      <div className="bg-primary text-primary-foreground py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-4">
              <Badge
                variant="secondary"
                className="text-[10px] uppercase tracking-widest bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20"
              >
                Blockchain Native
              </Badge>
              <Badge
                variant="secondary"
                className="text-[10px] uppercase tracking-widest bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20"
              >
                BFG-20 Standard
              </Badge>
            </div>
            <h1
              className="text-3xl md:text-4xl font-bold mb-4 tracking-tight"
              data-testid="text-tokenization-title"
            >
              Tokenisation of Real-World Commodities
            </h1>
            <div className="w-20 h-1 bg-primary-foreground/40 mb-6" />
            <p className="text-lg text-primary-foreground/80 font-light leading-relaxed">
              Bullex enables fractional ownership of physical commodities through
              1:1 asset-backed BFG-20 tokens. Retail and institutional investors
              gain direct exposure to verified commodity assets with transparent
              blockchain settlement and full auditability.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-card border-b border-border py-8 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-4 rounded-md bg-muted/50 border border-border" data-testid="stat-token-types">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Coins className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold">{tokenDefinitions.length}</p>
                <p className="text-[10px] text-muted-foreground">Token Types</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-md bg-muted/50 border border-border" data-testid="stat-tokenized-value">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold">
                  ${(totalTokenizedValue / 1_000_000).toFixed(1)}M
                </p>
                <p className="text-[10px] text-muted-foreground">Tokenised Value</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-md bg-muted/50 border border-border" data-testid="stat-active-tokens">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold">{activeTokens}</p>
                <p className="text-[10px] text-muted-foreground">Active Tokens</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-md bg-muted/50 border border-border" data-testid="stat-chain-block">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Layers className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold">
                  #{latestBlock?.blockNumber || 0}
                </p>
                <p className="text-[10px] text-muted-foreground">Latest Block</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-muted/30 border-b border-border py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xl font-bold tracking-tight mb-2" data-testid="text-how-tokenization">
            How Tokenisation Works
          </h2>
          <p className="text-sm text-muted-foreground mb-8 max-w-2xl">
            From physical commodity to investable digital token — a five-step process with full blockchain verification.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              {
                step: "01",
                icon: FileText,
                title: "Producer Lists",
                desc: "Commodity producers list verified physical assets with full provenance, specifications, and quantity details.",
              },
              {
                step: "02",
                icon: Shield,
                title: "Auditors Validate",
                desc: "Independent auditors verify commodity existence, quality, and storage before token issuance approval.",
              },
              {
                step: "03",
                icon: Coins,
                title: "Smart Contract Issues",
                desc: "BFG-20 tokens are minted at a 1:1 ratio, recorded on the Bullex blockchain via SHA-256 proof-of-work.",
              },
              {
                step: "04",
                icon: Hash,
                title: "Investors Buy",
                desc: "Retail and institutional investors acquire fractional or whole token positions in verified commodity assets.",
              },
              {
                step: "05",
                icon: Globe,
                title: "Profits Redistributed",
                desc: "Upon sale or settlement, profits are distributed proportionally to token holders via on-chain settlement.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.step} className="border relative overflow-hidden" data-testid={`card-token-step-${item.step}`}>
                  <CardContent className="p-5">
                    <span className="text-4xl font-bold text-primary/10 absolute top-3 right-4">
                      {item.step}
                    </span>
                    <div className="relative z-10">
                      <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center mb-3">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <h3 className="text-sm font-semibold mb-2">{item.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      <div className="py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight mb-1" data-testid="text-token-registry">
                Token Registry
              </h2>
              <p className="text-sm text-muted-foreground">
                All {tokenDefinitions.length} commodity tokens available on the Bullex platform.
              </p>
            </div>
            <Link href="/trading">
              <Button size="sm" data-testid="button-execute-trade">
                <Link2 className="w-3.5 h-3.5 mr-1.5" />
                Execute Trade
              </Button>
            </Link>
          </div>

          <Tabs defaultValue="all">
            <TabsList className="mb-6 flex-wrap h-auto gap-1" data-testid="tabs-token-categories">
              <TabsTrigger value="all" className="text-xs" data-testid="tab-all">
                All Tokens
              </TabsTrigger>
              {categories.map((cat) => {
                const CatIcon = categoryIcons[cat];
                return (
                  <TabsTrigger
                    key={cat}
                    value={cat}
                    className="text-xs"
                    data-testid={`tab-${cat}`}
                  >
                    <CatIcon className="w-3 h-3 mr-1" />
                    {categoryLabels[cat]}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="all">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tokenDefinitions.map((token) => (
                  <TokenCard
                    key={token.id}
                    token={token}
                    trades={trades || []}
                  />
                ))}
              </div>
            </TabsContent>

            {categories.map((cat) => (
              <TabsContent key={cat} value={cat}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tokenDefinitions
                    .filter((t) => t.category === cat)
                    .map((token) => (
                      <TokenCard
                        key={token.id}
                        token={token}
                        trades={trades || []}
                      />
                    ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>

      <div className="bg-card border-y border-border py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-widest">
              Tokenomics
            </Badge>
          </div>
          <h2 className="text-xl font-bold tracking-tight mb-2">
            Revenue Model & Fund Allocation
          </h2>
          <p className="text-sm text-muted-foreground mb-8 max-w-2xl">
            Bullex generates sustainable revenue through multiple fee streams across the token lifecycle,
            supporting the commodity trading infrastructure and blockchain verification systems.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="text-sm font-semibold mb-4">Revenue Streams</h3>
              <div className="space-y-3">
                {[
                  { label: "Token Issuance Fee", value: "0.5–1%", desc: "of asset value at minting" },
                  { label: "Secondary Trading Fee", value: "0.25–0.5%", desc: "per transaction" },
                  { label: "Custody & Storage", value: "Variable", desc: "ongoing asset custody fees" },
                  { label: "Technology Licensing", value: "Recurring", desc: "platform licensing revenue" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-border">
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                    </div>
                    <span className="text-sm font-bold text-primary">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-4">Fund Allocation</h3>
              <div className="space-y-3">
                {[
                  { label: "Technology Development", pct: "40%", color: "bg-primary" },
                  { label: "Commodity Sourcing", pct: "30%", color: "bg-primary/70" },
                  { label: "Compliance & Legal", pct: "20%", color: "bg-primary/50" },
                  { label: "Marketing & Growth", pct: "10%", color: "bg-primary/30" },
                ].map((item) => (
                  <div key={item.label} className="p-3 rounded-md bg-muted/50 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">{item.label}</p>
                      <span className="text-sm font-bold text-primary">{item.pct}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div className={`h-full rounded-full ${item.color}`} style={{ width: item.pct }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-muted/30 border-t border-border py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xl font-bold tracking-tight mb-2">
            Token Standard: BFG-20
          </h2>
          <p className="text-sm text-muted-foreground mb-8 max-w-2xl">
            All Bullex commodity tokens conform to the BFG-20 token standard — designed
            for investor access, fractional ownership, and transparent commodity-backed asset management.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: Lock,
                title: "1:1 Physical Backing",
                desc: "Every token is backed by a verified physical commodity unit. No fractional reserve — full collateralisation for investor confidence.",
              },
              {
                icon: Shield,
                title: "SHA-256 Verification",
                desc: "Token minting and transfers are secured by SHA-256 proof-of-work consensus on the Bullex blockchain.",
              },
              {
                icon: Globe,
                title: "Global Investor Access",
                desc: "Tokens enable cross-border investment and settlement across Asia, Middle East, and Africa — open to retail and institutional investors.",
              },
              {
                icon: Layers,
                title: "Immutable Provenance",
                desc: "Complete origin-to-destination tracking with blockchain-recorded trade metadata for every commodity unit.",
              },
              {
                icon: FileText,
                title: "Document Linkage",
                desc: "Each tokenised trade automatically generates linked documentation — Deal Recap, FCO, ICPO, SPA, and more.",
              },
              {
                icon: CheckCircle2,
                title: "Investor Compliance",
                desc: "Tokens are issued only to KYC-verified investors, ensuring full regulatory alignment and investor protection across all jurisdictions.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title} className="border" data-testid={`card-standard-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                  <CardContent className="p-5">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center mb-3">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {item.desc}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TokenCard({
  token,
  trades,
}: {
  token: (typeof tokenDefinitions)[number];
  trades: Trade[];
}) {
  const Icon = token.icon;
  const liveTrades = getTokenLiveTrades(trades, token.commodity);
  const totalMinted = liveTrades.reduce((s, t) => s + t.quantity, 0);
  const totalValue = liveTrades.reduce((s, t) => s + t.totalValue, 0);
  const latestTrade = liveTrades.length > 0 ? liveTrades[0] : null;

  return (
    <Card
      className="border hover:border-primary/30 transition-colors"
      data-testid={`token-card-${token.symbol.toLowerCase()}`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-md ${token.accentBg} flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${token.accent}`} />
            </div>
            <div>
              <h3 className="text-sm font-bold">{token.name}</h3>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-muted-foreground">
                  {token.id}
                </span>
                <Badge variant="secondary" className="text-[9px] px-1 py-0">
                  {token.standard}
                </Badge>
              </div>
            </div>
          </div>
          {liveTrades.length > 0 ? (
            <Badge className="text-[9px] bg-status-online/10 text-status-online border-status-online/20">
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[9px]">
              Registered
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed mb-4">
          {token.specification}
        </p>

        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Unit Backing</span>
            <span className="font-mono font-medium text-[11px]">{token.unitBacking}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Decimals</span>
            <span className="font-mono font-medium">{token.decimals}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Tokens Minted</span>
            <span className="font-mono font-medium">
              {totalMinted > 0 ? totalMinted.toLocaleString() : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Backed Value</span>
            <span className="font-mono font-medium">
              {totalValue > 0
                ? `$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : "—"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {token.origins.map((origin) => (
            <Badge
              key={origin}
              variant="outline"
              className="text-[9px] px-1.5 py-0"
            >
              {origin}
            </Badge>
          ))}
        </div>

        {latestTrade && (
          <div className="p-2.5 rounded-md bg-muted space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Latest Trade</span>
              <span className="text-[10px] font-mono font-medium">
                {latestTrade.tradeRef}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Block Hash</span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {latestTrade.blockchainHash
                  ? `${latestTrade.blockchainHash.slice(0, 8)}...${latestTrade.blockchainHash.slice(-4)}`
                  : "—"}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
