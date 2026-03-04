import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
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
  TrendingUp,
  MapPin,
  Mail,
  DollarSign,
  BarChart3,
  Users,
  PieChart,
} from "lucide-react";

const features = [
  {
    icon: Lock,
    title: "1:1 Asset Backing",
    description:
      "Every BFG-20 token is backed by a verified physical commodity unit — no fractional reserve, full collateralisation. Investors hold real exposure to tangible assets.",
  },
  {
    icon: Layers,
    title: "Fractional Access",
    description:
      "Retail and institutional investors can acquire fractional or whole positions in commodity assets, lowering barriers to entry for global commodity markets.",
  },
  {
    icon: Globe,
    title: "Transparent Settlement",
    description:
      "On-chain settlement ensures every transaction is recorded immutably on the Bullex blockchain with SHA-256 proof-of-work — full auditability for all parties.",
  },
  {
    icon: Link2,
    title: "Blockchain-Verified Provenance",
    description:
      "Every commodity trade is recorded on our proprietary blockchain, ensuring tamper-proof transaction history and complete origin-to-destination tracking.",
  },
  {
    icon: UserCheck,
    title: "Institutional KYC & Compliance",
    description:
      "Comprehensive Know Your Customer onboarding covering company details, beneficial ownership, AML/CFT compliance, and authorized signatory verification.",
  },
  {
    icon: Shield,
    title: "Investor Protection",
    description:
      "Tokens are issued only to KYC-verified investors with built-in regulatory alignment, audit trails, and compliance frameworks meeting international standards.",
  },
];

const divisions = [
  { icon: Mountain, name: "Minerals", products: "Iron Ore, Bauxite, Manganese", color: "text-stone-600 dark:text-stone-400" },
  { icon: Gem, name: "Metals", products: "Copper Cathodes, Aluminium", color: "text-sky-700 dark:text-sky-400" },
  { icon: Flame, name: "Energy", products: "ULSD, HSGO, LPG", color: "text-red-800 dark:text-red-400" },
  { icon: Droplets, name: "Petrochemicals", products: "Bitumen, Petcoke, Sulphur", color: "text-slate-600 dark:text-slate-400" },
  { icon: Sprout, name: "Fertilizers", products: "NPK", color: "text-teal-700 dark:text-teal-400" },
];

const stats = [
  { value: "5", label: "Asset Classes" },
  { value: "12", label: "Tokenised Assets" },
  { value: "1:1", label: "Physical Backing" },
  { value: "100%", label: "Blockchain Verified" },
];

export default function Home() {
  const { toast } = useToast();
  const [supplyForm, setSupplyForm] = useState({
    companyName: "",
    email: "",
    commodity: "",
    message: "",
  });

  const handleSupplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplyForm.companyName || !supplyForm.email || !supplyForm.commodity || !supplyForm.message) {
      toast({ title: "Missing Fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    toast({ title: "Inquiry Submitted", description: "A member of our trading desk will contact you shortly." });
    setSupplyForm({ companyName: "", email: "", commodity: "", message: "" });
  };

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
                  Investor Whitepaper • 2025
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
              Liquidity • Transparency • Access
            </p>
            <div className="w-20 h-1 bg-primary-foreground/40 mb-6" />
            <p className="text-lg md:text-xl text-primary-foreground/80 font-light leading-relaxed mb-8 max-w-2xl">
              Bullex enables fractional ownership of physical commodities through
              1:1 asset-backed BFG-20 tokens. Retail and institutional investors gain
              direct exposure to verified commodity assets with transparent blockchain
              settlement and full auditability.
            </p>
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
              Bullex is a blockchain-backed platform for the tokenisation of real-world
              commodities. It bridges physical commodity markets with digital asset
              infrastructure — enabling fractional ownership, transparent settlement,
              and investor access across minerals, metals, energy, and petrochemicals.
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
              From physical commodity to investable digital token — a five-step process with full blockchain verification.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              {
                step: "01",
                icon: FileText,
                title: "Producer Lists",
                desc: "Commodity producers list verified physical assets with full provenance, specifications, and quantity details on the Bullex platform.",
                link: "/platform",
                linkText: "View Platform",
              },
              {
                step: "02",
                icon: Shield,
                title: "Auditors Validate",
                desc: "Independent auditors verify commodity existence, quality, and storage conditions before token issuance is approved.",
                link: "/platform",
                linkText: "Compliance",
              },
              {
                step: "03",
                icon: Coins,
                title: "Smart Contract Issues",
                desc: "BFG-20 tokens are minted at a 1:1 ratio to the physical asset, recorded on the Bullex blockchain via SHA-256 proof-of-work.",
                link: "/tokenization",
                linkText: "Token Registry",
              },
              {
                step: "04",
                icon: Users,
                title: "Investors Buy",
                desc: "Retail and institutional investors acquire fractional or whole token positions in verified, audited commodity assets.",
                link: "/investor",
                linkText: "Investor Info",
              },
              {
                step: "05",
                icon: PieChart,
                title: "Profits Redistributed",
                desc: "Upon commodity sale or settlement, profits are distributed proportionally to token holders via on-chain settlement.",
                link: "/tokenization",
                linkText: "Tokenomics",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.step} className="border relative overflow-hidden" data-testid={`card-step-${item.step}`}>
                  <CardContent className="p-5">
                    <span className="text-4xl font-bold text-primary/10 absolute top-3 right-4">
                      {item.step}
                    </span>
                    <div className="relative z-10">
                      <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center mb-3">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
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
              );
            })}
          </div>
        </div>
      </div>

      <div className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-commodity-divisions">
              Tokenised Commodity Divisions
            </h2>
            <div className="w-16 h-1 bg-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Bullex tokenises commodities across five core divisions — each asset backed
              1:1 by physical goods, enabling fractional ownership and transparent settlement.
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
                View All Tokenised Assets
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-card border-y border-border py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-widest mb-4">
              Investment Overview
            </Badge>
            <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-quick-stats">
              Quick Stats
            </h2>
            <div className="w-16 h-1 bg-primary mx-auto mb-4" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            <Card className="border" data-testid="stat-investment-ask">
              <CardContent className="p-6 text-center">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <DollarSign className="w-5 h-5 text-primary" />
                </div>
                <p className="text-2xl font-bold text-primary">USD 20M</p>
                <p className="text-xs text-muted-foreground mt-1">Investment Ask</p>
              </CardContent>
            </Card>
            <Card className="border" data-testid="stat-primary-commodities">
              <CardContent className="p-6 text-center">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <BarChart3 className="w-5 h-5 text-primary" />
                </div>
                <p className="text-2xl font-bold text-primary">5 Divisions</p>
                <p className="text-xs text-muted-foreground mt-1">Primary Commodities</p>
              </CardContent>
            </Card>
            <Card className="border" data-testid="stat-breakeven">
              <CardContent className="p-6 text-center">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <p className="text-2xl font-bold text-primary">Year 3</p>
                <p className="text-xs text-muted-foreground mt-1">Projected Breakeven</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="bg-muted/30 border-b border-border py-16 px-6">
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
                Commodity Tokenisation
              </h2>
              <div className="w-16 h-1 bg-primary mb-4" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Every commodity on the Bullex platform is represented as a
                blockchain-backed digital token under the proprietary BFG-20 standard.
                Each token is pegged 1:1 to a physical commodity unit — no fractional
                reserve, full collateralisation for investor confidence.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                When an asset is verified and listed, BFG-20 tokens are minted at the exact
                quantity of the physical commodity and recorded on the Bullex blockchain
                through SHA-256 proof-of-work mining. Investors acquire tokens representing
                direct ownership of the underlying commodity — from origin to settlement.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="p-3 rounded-md bg-card border border-border">
                  <p className="text-xl font-bold text-primary">12</p>
                  <p className="text-[10px] text-muted-foreground">Token Types</p>
                </div>
                <div className="p-3 rounded-md bg-card border border-border">
                  <p className="text-xl font-bold text-primary">5</p>
                  <p className="text-[10px] text-muted-foreground">Asset Classes</p>
                </div>
                <div className="p-3 rounded-md bg-card border border-border">
                  <p className="text-xl font-bold text-primary">1:1</p>
                  <p className="text-[10px] text-muted-foreground">Physical Backing</p>
                </div>
                <div className="p-3 rounded-md bg-card border border-border">
                  <p className="text-xl font-bold text-primary">18</p>
                  <p className="text-[10px] text-muted-foreground">Token Decimals</p>
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
              <h3 className="text-sm font-semibold mb-3">How Tokenisation Works</h3>
              {[
                {
                  step: "01",
                  icon: FileText,
                  title: "Asset Listing",
                  desc: "Commodity producers list verified physical assets with provenance, specifications, and storage details on the Bullex platform.",
                },
                {
                  step: "02",
                  icon: Shield,
                  title: "Audit & Validation",
                  desc: "Independent auditors verify asset existence, quality, and storage before approving token issuance.",
                },
                {
                  step: "03",
                  icon: Coins,
                  title: "Token Minting",
                  desc: "BFG-20 tokens are minted at a 1:1 ratio — each token represents exactly one unit of the physical commodity.",
                },
                {
                  step: "04",
                  icon: Hash,
                  title: "Investor Settlement",
                  desc: "Investors acquire tokens on-chain. Upon sale, profits are distributed proportionally to all token holders.",
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

      <section className="bg-primary text-white" data-testid="section-initiate-trade">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="p-10 lg:p-16 flex flex-col justify-center">
              <h2 className="text-3xl font-bold mb-4 tracking-tight">Initiate Trade</h2>
              <div className="w-24 h-1 bg-white/30 mb-8"></div>
              <p className="text-white/80 text-lg leading-relaxed mb-12">
                Submit your commodity requirements directly to our trading desk. Our specialists will review your inquiry and respond with indicative pricing and availability within 24 hours.
              </p>
              <div className="space-y-8">
                <div className="flex items-center gap-4">
                  <div className="bg-white/10 p-3 rounded-sm"><MapPin className="h-6 w-6 text-white/80" /></div>
                  <div>
                    <div className="font-bold text-sm uppercase tracking-wider mb-1">Headquarters</div>
                    <div className="text-white/70 text-sm">Dubai, United Arab Emirates</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="bg-white/10 p-3 rounded-sm"><Mail className="h-6 w-6 text-white/80" /></div>
                  <div>
                    <div className="font-bold text-sm uppercase tracking-wider mb-1">Direct Desk</div>
                    <div className="text-white/70 text-sm">trade@bullex.tech</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-10 lg:p-16 bg-card text-foreground border-l border-border">
              <h3 className="text-2xl font-bold text-primary mb-8 tracking-tight">Trade Inquiry</h3>
              <form onSubmit={handleSupplySubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Company Name *</label>
                    <Input className="border-border rounded-none h-12 focus-visible:ring-primary" placeholder="Corporate Entity" value={supplyForm.companyName} onChange={(e) => setSupplyForm({ ...supplyForm, companyName: e.target.value })} data-testid="supply-input-company" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Contact Email *</label>
                    <Input type="email" className="border-border rounded-none h-12 focus-visible:ring-primary" placeholder="email@company.com" value={supplyForm.email} onChange={(e) => setSupplyForm({ ...supplyForm, email: e.target.value })} data-testid="supply-input-email" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-primary">Commodity Category *</label>
                  <select className="flex h-12 w-full border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-none" value={supplyForm.commodity} onChange={(e) => setSupplyForm({ ...supplyForm, commodity: e.target.value })} data-testid="supply-select-commodity">
                    <option value="">Select category...</option>
                    <option value="minerals">Minerals (Iron Ore, Bauxite, Manganese)</option>
                    <option value="metals">Metals (Copper, Aluminium)</option>
                    <option value="energy">Energy Products (ULSD, HSGO, LPG)</option>
                    <option value="petchem">Petrochemicals (Bitumen, Petcoke, Sulphur)</option>
                    <option value="fertilizers">Fertilizers (NPK)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-primary">Target Specifications & Volume</label>
                  <Textarea className="border-border rounded-none min-h-[120px] resize-none focus-visible:ring-primary" placeholder="Please include target volume, destination port (CIF/FOB), and specific grades required." value={supplyForm.message} onChange={(e) => setSupplyForm({ ...supplyForm, message: e.target.value })} data-testid="supply-input-specs" />
                </div>
                <Button type="submit" className="w-full rounded-none h-12 text-sm font-bold uppercase tracking-wider" data-testid="button-submit-supply">Submit to Trading Desk</Button>
                <p className="text-xs text-muted-foreground text-center">
                  By submitting this inquiry, you confirm your authority to initiate trade dialogue on behalf of your organization.
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>

      <div className="bg-primary text-primary-foreground py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="max-w-lg">
              <h2 className="text-2xl font-bold tracking-tight mb-3">
                Built for Investors
              </h2>
              <p className="text-primary-foreground/70 text-sm leading-relaxed">
                Bullex is designed for both retail and institutional investors
                seeking direct exposure to real-world commodity assets. Every feature —
                from KYC onboarding to blockchain settlement — is purpose-built for
                transparent, accessible commodity investment.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Lock className="w-4 h-4 text-primary-foreground/60 flex-shrink-0" />
                <span className="text-sm text-primary-foreground/80">1:1 Asset-Backed Tokens</span>
              </div>
              <div className="flex items-center gap-3">
                <Layers className="w-4 h-4 text-primary-foreground/60 flex-shrink-0" />
                <span className="text-sm text-primary-foreground/80">Fractional Ownership Access</span>
              </div>
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-primary-foreground/60 flex-shrink-0" />
                <span className="text-sm text-primary-foreground/80">Asia, Middle East & Africa Coverage</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-primary-foreground/60 flex-shrink-0" />
                <span className="text-sm text-primary-foreground/80">Transparent On-Chain Settlement</span>
              </div>
            </div>
          </div>
          <div className="mt-10 pt-8 border-t border-primary-foreground/10">
            <p className="text-xs text-primary-foreground/40">
              Bullex — Tokenisation of Real-World Commodities — All Rights Reserved
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
