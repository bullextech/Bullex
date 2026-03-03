import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Shield,
  Link2,
  FileText,
  UserCheck,
  Layers,
  ArrowRight,
  Lock,
  Globe,
  Zap,
  CheckCircle2,
  Mountain,
  Gem,
  Flame,
  Droplets,
  Sprout,
  Package,
  FolderOpen,
  Coins,
  Hash,
  Target,
  BarChart3,
  Users,
  ClipboardCheck,
} from "lucide-react";

const features = [
  {
    icon: Coins,
    title: "1:1 Asset Backing",
    description:
      "Every digital token issued on Bullex is backed 1:1 by a verified, physical commodity. No fractional reserve — full collateralization ensures investor confidence and asset integrity.",
  },
  {
    icon: Users,
    title: "Fractional Access",
    description:
      "Tokenization enables fractional ownership of high-value commodity contracts, opening institutional-grade investments to both retail and institutional investors worldwide.",
  },
  {
    icon: Layers,
    title: "Transparent Settlement",
    description:
      "All transactions are recorded on an immutable blockchain ledger with SHA-256 proof-of-work consensus, providing real-time auditability and tamper-proof settlement records.",
  },
  {
    icon: Link2,
    title: "Blockchain-Verified Provenance",
    description:
      "Every commodity's origin, quality audit, and trade lifecycle is cryptographically verified on-chain, ensuring complete provenance transparency from producer to investor.",
  },
  {
    icon: UserCheck,
    title: "Institutional KYC & Compliance",
    description:
      "Comprehensive Know Your Customer onboarding covering beneficial ownership, compliance questionnaires, AML/CFT frameworks, and authorized signatory verification.",
  },
  {
    icon: Lock,
    title: "Regulatory Alignment",
    description:
      "Built-in compliance frameworks aligned with international commodity trade finance standards, enabling seamless cross-border tokenized asset transfers.",
  },
];

const divisions = [
  { icon: Mountain, name: "Minerals", products: "Iron Ore, Bauxite, Manganese Ore — tokenized for fractional investment", color: "text-stone-600 dark:text-stone-400" },
  { icon: Gem, name: "Metals", products: "Copper Cathodes, Aluminium — asset-backed digital tokens", color: "text-sky-700 dark:text-sky-400" },
  { icon: Flame, name: "Energy Products", products: "ULSD, HSGO, LPG — transparent energy commodity tokens", color: "text-red-800 dark:text-red-400" },
  { icon: Droplets, name: "Petrochemicals", products: "Bitumen, Petcoke, Sulphur — verified on-chain assets", color: "text-slate-600 dark:text-slate-400" },
  { icon: Sprout, name: "Fertilizers", products: "NPK — tokenized agricultural commodity access", color: "text-teal-700 dark:text-teal-400" },
];

const stats = [
  { value: "5", label: "Commodity Divisions" },
  { value: "13", label: "Tokenized Commodities" },
  { value: "1:1", label: "Asset-Backed Tokens" },
  { value: "100%", label: "Blockchain Verified" },
];

export default function Home() {
  return (
    <div className="overflow-y-auto h-full">
      <div className="bg-primary text-primary-foreground py-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }} />
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-primary-foreground/10 border border-primary-foreground/20 flex items-center justify-center">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <Badge variant="secondary" className="text-[10px] uppercase tracking-widest bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20">
                  Investor Whitepaper &bull; 2025
                </Badge>
              </div>
            </div>
            <h1
              className="text-4xl md:text-5xl font-bold mb-4 tracking-tight leading-tight"
              data-testid="text-home-title"
            >
              Tokenising Real-World
              <br />
              Commodities
            </h1>
            <p className="text-lg text-primary-foreground/60 font-medium tracking-wide mb-4">
              Liquidity &bull; Transparency &bull; Access
            </p>
            <div className="w-20 h-1 bg-primary-foreground/40 mb-6" />
            <p className="text-lg md:text-xl text-primary-foreground/80 font-light leading-relaxed mb-8 max-w-2xl">
              Bullex is the institutional-grade platform for tokenising physical
              commodities into 1:1 asset-backed digital tokens — enabling fractional
              ownership, transparent settlement, and global investor access across
              retail and institutional markets.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard">
                <Button
                  size="lg"
                  variant="secondary"
                  className="font-medium"
                  data-testid="button-go-dashboard"
                >
                  Open Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/products">
                <Button
                  size="lg"
                  variant="outline"
                  className="font-medium border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                  data-testid="button-view-products"
                >
                  <Package className="w-4 h-4 mr-2" />
                  View Products
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border-b border-border py-8 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center" data-testid={`stat-home-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <p className="text-2xl md:text-3xl font-bold text-primary">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3" data-testid="text-what-is-bullex">
              What is Bullex?
            </h2>
            <div className="w-16 h-1 bg-primary mx-auto mb-4" />
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Bullex is Bullfrog Group's proprietary platform for tokenising real-world
              commodities. It bridges the gap between physical commodity markets and digital
              asset infrastructure — enabling fractional ownership, 1:1 asset backing,
              and transparent, blockchain-verified settlement for investors worldwide.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} className="border" data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, "-")}`}>
                  <CardContent className="p-5">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center mb-3">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-sm font-semibold mb-2">{feature.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-muted/30 border-y border-border py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold tracking-tight mb-3">How Bullex Works</h2>
            <div className="w-16 h-1 bg-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              A five-step process from commodity sourcing to investor profit redistribution — fully on-chain and transparent.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              {
                step: "01",
                title: "Producer Lists Commodity",
                desc: "A commodity producer lists verified physical assets on the Bullex platform with full origin, quantity, and quality documentation.",
                link: "/products",
                linkText: "View Products",
              },
              {
                step: "02",
                title: "Auditors Validate",
                desc: "Independent auditors verify the commodity's authenticity, quality, and reserves — ensuring every listed asset meets institutional standards.",
                link: "/kyc",
                linkText: "KYC & Compliance",
              },
              {
                step: "03",
                title: "Smart Contract Issues Tokens",
                desc: "A smart contract mints 1:1 asset-backed digital tokens on the Bullex blockchain, representing fractional ownership of the physical commodity.",
                link: "/tokenization",
                linkText: "Tokenization",
              },
              {
                step: "04",
                title: "Investors Buy Tokens",
                desc: "Retail and institutional investors purchase fractional commodity tokens, gaining exposure to real-world assets with full blockchain transparency.",
                link: "/dashboard",
                linkText: "Dashboard",
              },
              {
                step: "05",
                title: "Profits Redistributed",
                desc: "Revenue from commodity sales is distributed proportionally to token holders via smart contract, with full on-chain audit trails.",
                link: "/blockchain",
                linkText: "View Ledger",
              },
            ].map((item) => (
              <Card key={item.step} className="border relative overflow-hidden" data-testid={`card-step-${item.step}`}>
                <CardContent className="p-5">
                  <span className="text-4xl font-bold text-primary/10 absolute top-3 right-4">
                    {item.step}
                  </span>
                  <div className="relative z-10">
                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">
                      Step {item.step}
                    </p>
                    <h3 className="text-sm font-semibold mb-2">{item.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                      {item.desc}
                    </p>
                    <Link href={item.link}>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" data-testid={`link-step-${item.step}`}>
                        {item.linkText}
                        <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <div className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-commodity-divisions">
              Commodity Divisions
            </h2>
            <div className="w-16 h-1 bg-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Bullex tokenises commodities across five core divisions, enabling fractional
              investment access to physical assets across Asia, the Middle East, and Africa.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {divisions.map((div) => {
              const Icon = div.icon;
              return (
                <Link key={div.name} href="/products">
                  <Card
                    className="border cursor-pointer hover:border-primary/30 transition-colors group h-full"
                    data-testid={`card-division-${div.name.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <CardContent className="p-4 text-center">
                      <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/20 transition-colors">
                        <Icon className={`w-5 h-5 ${div.color}`} />
                      </div>
                      <h3 className="text-sm font-semibold mb-1">{div.name}</h3>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        {div.products}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
          <div className="text-center mt-6">
            <Link href="/products">
              <Button variant="outline" size="sm" data-testid="link-all-products">
                View All Products
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-card border-y border-border py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-quick-stats">
              Investment Snapshot
            </h2>
            <div className="w-16 h-1 bg-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Key figures from the Bullex investor whitepaper.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border" data-testid="card-investment-ask">
              <CardContent className="p-5 text-center">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Target className="w-5 h-5 text-primary" />
                </div>
                <p className="text-2xl font-bold text-primary">USD 20M</p>
                <p className="text-xs text-muted-foreground mt-1">Investment Ask</p>
              </CardContent>
            </Card>
            <Card className="border" data-testid="card-primary-commodities">
              <CardContent className="p-5 text-center">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <BarChart3 className="w-5 h-5 text-primary" />
                </div>
                <p className="text-2xl font-bold text-primary">5 Divisions</p>
                <p className="text-xs text-muted-foreground mt-1">Primary Commodities</p>
              </CardContent>
            </Card>
            <Card className="border" data-testid="card-projected-breakeven">
              <CardContent className="p-5 text-center">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <ClipboardCheck className="w-5 h-5 text-primary" />
                </div>
                <p className="text-2xl font-bold text-primary">Year 3</p>
                <p className="text-xs text-muted-foreground mt-1">Projected Breakeven</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="bg-muted/30 border-y border-border py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-12 items-start">
            <div className="lg:w-1/2">
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="secondary" className="text-[10px] uppercase tracking-widest">
                  BFG-20 Standard
                </Badge>
                <Badge variant="secondary" className="text-[10px] uppercase tracking-widest">
                  Blockchain Native
                </Badge>
              </div>
              <h2
                className="text-2xl font-bold tracking-tight mb-3"
                data-testid="text-tokenization-section"
              >
                Commodity Tokenization
              </h2>
              <div className="w-16 h-1 bg-primary mb-4" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Bullex tokenises physical commodities into digital assets under the
                proprietary BFG-20 standard. Each token is pegged 1:1 to a physical
                commodity unit — enabling fractional ownership, instant liquidity,
                and transparent price discovery for investors worldwide.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                Revenue is generated through issuance fees (0.5-1%), secondary
                trading fees (0.25-0.5%), custody and storage management, and
                technology licensing — creating multiple sustainable income streams
                for the platform and its stakeholders.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="p-3 rounded-md bg-card border border-border">
                  <p className="text-xl font-bold text-primary">1:1</p>
                  <p className="text-[10px] text-muted-foreground">Physical Backing</p>
                </div>
                <div className="p-3 rounded-md bg-card border border-border">
                  <p className="text-xl font-bold text-primary">5</p>
                  <p className="text-[10px] text-muted-foreground">Asset Classes</p>
                </div>
                <div className="p-3 rounded-md bg-card border border-border">
                  <p className="text-xl font-bold text-primary">0.5-1%</p>
                  <p className="text-[10px] text-muted-foreground">Issuance Fee</p>
                </div>
                <div className="p-3 rounded-md bg-card border border-border">
                  <p className="text-xl font-bold text-primary">0.25-0.5%</p>
                  <p className="text-[10px] text-muted-foreground">Trading Fee</p>
                </div>
              </div>
              <Link href="/tokenization">
                <Button size="sm" data-testid="button-explore-tokens">
                  <Coins className="w-3.5 h-3.5 mr-1.5" />
                  Explore Token Registry
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>

            <div className="lg:w-1/2 space-y-3">
              <h3 className="text-sm font-semibold mb-3">How Tokenization Works</h3>
              {[
                {
                  step: "01",
                  icon: Package,
                  title: "Producer Lists Asset",
                  desc: "A commodity producer lists verified physical assets on the platform with origin documentation and quality certificates.",
                },
                {
                  step: "02",
                  icon: ClipboardCheck,
                  title: "Auditor Validates",
                  desc: "Independent auditors verify the commodity's authenticity, quality, and reserves before token issuance is approved.",
                },
                {
                  step: "03",
                  icon: Coins,
                  title: "Smart Contract Mints Tokens",
                  desc: "A smart contract issues 1:1 asset-backed tokens on the Bullex blockchain, each representing fractional ownership of the physical commodity.",
                },
                {
                  step: "04",
                  icon: Users,
                  title: "Investors Buy Tokens",
                  desc: "Retail and institutional investors purchase fractional tokens, gaining transparent exposure to real-world commodity assets.",
                },
                {
                  step: "05",
                  icon: BarChart3,
                  title: "Profits Redistributed",
                  desc: "Revenue from commodity sales flows back to token holders proportionally via smart contract, with full on-chain settlement records.",
                },
              ].map((item) => {
                const StepIcon = item.icon;
                return (
                  <Card key={item.step} className="border" data-testid={`card-token-flow-${item.step}`}>
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <StepIcon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                            Step {item.step}
                          </span>
                          <h4 className="text-sm font-semibold">{item.title}</h4>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              <div className="pt-2">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Sample tokens include{" "}
                  <span className="font-mono text-foreground">BFG-IRO</span> (Iron Ore),{" "}
                  <span className="font-mono text-foreground">BFG-CPC</span> (Copper Cathodes),{" "}
                  <span className="font-mono text-foreground">BFG-ULS</span> (ULSD),{" "}
                  <span className="font-mono text-foreground">BFG-BIT</span> (Bitumen), and{" "}
                  <span className="font-mono text-foreground">BFG-NPK</span> (NPK) — all conforming
                  to the BFG-20 token standard.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-primary text-primary-foreground py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="max-w-lg">
              <h2 className="text-2xl font-bold tracking-tight mb-3">
                Built for Investors
              </h2>
              <p className="text-primary-foreground/70 text-sm leading-relaxed">
                Bullex is designed for both retail and institutional investors seeking
                transparent, asset-backed exposure to real-world commodities. Every
                feature — from KYC onboarding to on-chain settlement — is purpose-built
                for fractional commodity investment at scale.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-primary-foreground/60 flex-shrink-0" />
                <span className="text-sm text-primary-foreground/80">1:1 Asset-Backed Tokens</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-primary-foreground/60 flex-shrink-0" />
                <span className="text-sm text-primary-foreground/80">Fractional Ownership Access</span>
              </div>
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-primary-foreground/60 flex-shrink-0" />
                <span className="text-sm text-primary-foreground/80">Asia, Middle East & Africa Coverage</span>
              </div>
              <div className="flex items-center gap-3">
                <Zap className="w-4 h-4 text-primary-foreground/60 flex-shrink-0" />
                <span className="text-sm text-primary-foreground/80">Transparent On-Chain Settlement</span>
              </div>
            </div>
          </div>
          <div className="mt-10 pt-8 border-t border-primary-foreground/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-primary-foreground/40">
              BullEx — Tokenisation of Real-World Commodities
            </p>
            <Link href="/dashboard">
              <Button
                variant="secondary"
                size="sm"
                data-testid="button-footer-dashboard"
              >
                Go to Dashboard
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
