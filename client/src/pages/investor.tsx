import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Shield,
  Users,
  TrendingUp,
  Lock,
  Globe,
  CheckCircle2,
  ArrowRight,
  DollarSign,
  PieChart,
  FileText,
  Layers,
  Coins,
  BarChart3,
  Target,
  Clock,
} from "lucide-react";

export default function Investor() {
  return (
    <div className="overflow-y-auto h-full">
      <div className="bg-primary text-primary-foreground py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-3xl">
            <Badge
              variant="secondary"
              className="text-[10px] uppercase tracking-widest bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 mb-4"
            >
              Investor Relations
            </Badge>
            <h1
              className="text-3xl md:text-4xl font-bold mb-4 tracking-tight"
              data-testid="text-investor-title"
            >
              Invest in Real-World Commodities
            </h1>
            <div className="w-20 h-1 bg-primary-foreground/40 mb-6" />
            <p className="text-lg text-primary-foreground/80 font-light leading-relaxed">
              Gain direct exposure to physical commodity assets through Bullex's
              blockchain-backed trading platform. 1:1 asset-backed tokens, transparent
              settlement, and institutional-grade compliance — built for retail and
              institutional investors.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-card border-b border-border py-8 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center" data-testid="stat-investor-ask">
              <p className="text-2xl font-bold text-primary">USD 20M</p>
              <p className="text-xs text-muted-foreground mt-1">Investment Ask</p>
            </div>
            <div className="text-center" data-testid="stat-investor-divisions">
              <p className="text-2xl font-bold text-primary">5</p>
              <p className="text-xs text-muted-foreground mt-1">Commodity Divisions</p>
            </div>
            <div className="text-center" data-testid="stat-investor-breakeven">
              <p className="text-2xl font-bold text-primary">Year 3</p>
              <p className="text-xs text-muted-foreground mt-1">Projected Breakeven</p>
            </div>
            <div className="text-center" data-testid="stat-investor-backing">
              <p className="text-2xl font-bold text-primary">1:1</p>
              <p className="text-xs text-muted-foreground mt-1">Asset-Backed</p>
            </div>
          </div>
        </div>
      </div>

      <div className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-why-invest">
              Why Invest with Bullex?
            </h2>
            <div className="w-16 h-1 bg-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Bullex offers a unique opportunity to invest in physical commodity markets
              through a secure, transparent, and blockchain-verified platform.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: Lock,
                title: "1:1 Asset Backing",
                desc: "Every BFG-20 token is backed by a verified physical commodity — no fractional reserve, full collateralisation. Your investment holds a direct claim on real-world assets.",
              },
              {
                icon: Users,
                title: "Fractional Ownership",
                desc: "Access commodity investments previously reserved for large trading houses. Acquire fractional positions in bulk commodities across five core divisions.",
              },
              {
                icon: Layers,
                title: "Transparent Settlement",
                desc: "All trades are recorded on the Bullex blockchain with SHA-256 proof-of-work consensus. Settlement is auditable and tamper-proof from origin to destination.",
              },
              {
                icon: Shield,
                title: "Institutional Compliance",
                desc: "Comprehensive KYC/AML frameworks, beneficial ownership verification, and regulatory alignment meeting international trade finance standards.",
              },
              {
                icon: Globe,
                title: "Global Market Access",
                desc: "Invest in commodities sourced from Asia, the Middle East, and Africa — covering minerals, metals, energy products, petrochemicals, and fertilizers.",
              },
              {
                icon: BarChart3,
                title: "Diversified Portfolio",
                desc: "Spread investment across five commodity divisions and 13 individual products, reducing concentration risk and capturing multiple market opportunities.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title} className="border" data-testid={`card-invest-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                  <CardContent className="p-5">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center mb-3">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-sm font-semibold mb-2">{item.title}</h3>
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

      <div className="bg-muted/30 border-y border-border py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-12 items-start">
            <div className="lg:w-1/2">
              <Badge variant="secondary" className="text-[10px] uppercase tracking-widest mb-4">
                Revenue Model
              </Badge>
              <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-revenue-model">
                How Returns Are Generated
              </h2>
              <div className="w-16 h-1 bg-primary mb-4" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                Bullex generates revenue through multiple streams across the commodity
                trading lifecycle. Returns are distributed proportionally to token holders
                upon commodity sale or settlement through transparent on-chain mechanisms.
              </p>
              <div className="space-y-3">
                {[
                  { label: "Token Issuance Fee", value: "0.5–1%", desc: "of asset value at minting" },
                  { label: "Secondary Trading Fee", value: "0.25–0.5%", desc: "per transaction" },
                  { label: "Custody & Storage", value: "Variable", desc: "ongoing asset custody fees" },
                  { label: "Technology Licensing", value: "Recurring", desc: "platform licensing revenue" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between p-3 rounded-md bg-card border border-border" data-testid={`revenue-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                    </div>
                    <span className="text-sm font-bold text-primary">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:w-1/2">
              <Badge variant="secondary" className="text-[10px] uppercase tracking-widest mb-4">
                Fund Allocation
              </Badge>
              <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-fund-allocation">
                Where Your Investment Goes
              </h2>
              <div className="w-16 h-1 bg-primary mb-4" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                Investment capital is strategically allocated across four key areas
                to maximise growth, ensure compliance, and scale commodity sourcing operations.
              </p>
              <div className="space-y-3">
                {[
                  { label: "Technology Development", pct: "40%", color: "bg-primary", desc: "Platform infrastructure, blockchain, and security" },
                  { label: "Commodity Sourcing", pct: "30%", color: "bg-primary/70", desc: "Supply chain, procurement, and logistics" },
                  { label: "Compliance & Legal", pct: "20%", color: "bg-primary/50", desc: "Regulatory alignment, KYC, and audit" },
                  { label: "Marketing & Growth", pct: "10%", color: "bg-primary/30", desc: "Investor acquisition and market expansion" },
                ].map((item) => (
                  <div key={item.label} className="p-3 rounded-md bg-card border border-border" data-testid={`allocation-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      <span className="text-sm font-bold text-primary">{item.pct}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-2">{item.desc}</p>
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

      <div className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-how-to-invest">
              How to Invest
            </h2>
            <div className="w-16 h-1 bg-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              A simple, four-step process from registration to receiving returns.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                step: "01",
                icon: FileText,
                title: "Register & KYC",
                desc: "Complete the institutional KYC process with company details, beneficial ownership, and compliance verification.",
                link: "/kyc",
                linkText: "Start KYC",
              },
              {
                step: "02",
                icon: Target,
                title: "Choose Commodities",
                desc: "Select from 13 commodity assets across five divisions — minerals, metals, energy, petrochemicals, and fertilizers.",
                link: "/products",
                linkText: "View Products",
              },
              {
                step: "03",
                icon: Coins,
                title: "Acquire Tokens",
                desc: "Purchase BFG-20 tokens backed 1:1 by physical commodities, recorded on the Bullex blockchain.",
                link: "/tokenization",
                linkText: "Token Registry",
              },
              {
                step: "04",
                icon: TrendingUp,
                title: "Receive Returns",
                desc: "Upon commodity sale or settlement, profits are distributed proportionally to token holders via on-chain settlement.",
                link: "/blockchain",
                linkText: "View Ledger",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.step} className="border relative overflow-hidden" data-testid={`card-invest-step-${item.step}`}>
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
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" data-testid={`link-invest-step-${item.step}`}>
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

      <div className="bg-primary text-primary-foreground py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="max-w-lg">
              <h2 className="text-2xl font-bold tracking-tight mb-3">
                Ready to Invest?
              </h2>
              <p className="text-primary-foreground/70 text-sm leading-relaxed">
                Start your journey into commodity investment with Bullex. Complete
                KYC onboarding to access the full range of tokenised commodity assets
                across five global divisions.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/kyc">
                <Button variant="secondary" size="lg" className="font-medium" data-testid="button-investor-kyc">
                  Start KYC Onboarding
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button
                  variant="outline"
                  size="lg"
                  className="font-medium border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                  data-testid="button-investor-contact"
                >
                  Contact Us
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
