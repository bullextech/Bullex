import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
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
  Mail,
  Truck,
  Search,
  CircleDot,
} from "lucide-react";

export default function Investor() {
  const { toast } = useToast();
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    message: "",
  });

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name || !contactForm.email || !contactForm.message) {
      toast({ title: "Missing Fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    toast({ title: "Message Sent", description: "Thank you for your interest. Our team will be in touch shortly." });
    setContactForm({ name: "", email: "", message: "" });
  };

  return (
    <div className="overflow-y-auto h-full">
      <div className="bg-primary text-primary-foreground py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-10 items-start">
            <div className="lg:w-3/5">
              <p className="text-xs font-semibold text-primary-foreground/60 uppercase tracking-widest mb-3" data-testid="text-investor-eyebrow">
                Investor Whitepaper • 2025
              </p>
              <h1
                className="text-3xl md:text-4xl font-bold mb-4 tracking-tight leading-tight"
                data-testid="text-investor-title"
              >
                Tokenising Real-World Commodities —
                <br />
                Liquidity • Transparency • Access
              </h1>
              <div className="w-20 h-1 bg-primary-foreground/40 mb-6" />
              <p className="text-base text-primary-foreground/80 font-light leading-relaxed mb-6">
                BullEx enables fractional ownership of physical commodities (Gold, Copper, Iron Ore, Bauxite)
                using audited, 1:1 asset-backed tokens. Built for retail & institutional investors seeking
                direct exposure with instant settlement and clear proof-of-reserve.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="bg-primary-foreground/5 border-primary-foreground/10 border">
                  <CardContent className="p-4">
                    <h4 className="text-sm font-semibold text-primary-foreground mb-1">1:1 Asset Backing</h4>
                    <p className="text-xs text-primary-foreground/60">Every BullEx token is backed by physical commodity stored with audited custodians.</p>
                  </CardContent>
                </Card>
                <Card className="bg-primary-foreground/5 border-primary-foreground/10 border">
                  <CardContent className="p-4">
                    <h4 className="text-sm font-semibold text-primary-foreground mb-1">Fractional Access</h4>
                    <p className="text-xs text-primary-foreground/60">Invest from small amounts — diversify across commodities without large capital.</p>
                  </CardContent>
                </Card>
                <Card className="bg-primary-foreground/5 border-primary-foreground/10 border">
                  <CardContent className="p-4">
                    <h4 className="text-sm font-semibold text-primary-foreground mb-1">Transparent Settlement</h4>
                    <p className="text-xs text-primary-foreground/60">Smart contracts automate funding, settlement and profit distribution with full audit trails.</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="lg:w-2/5 w-full">
              <Card className="bg-primary-foreground/5 border-primary-foreground/10 border">
                <CardContent className="p-6">
                  <h3 className="text-lg font-bold text-primary-foreground mb-4" data-testid="text-quick-stats">Quick Stats</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-primary-foreground/60">Investment Ask</span>
                      <span className="text-sm font-bold text-primary-foreground">USD 20M</span>
                    </div>
                    <div className="h-px bg-primary-foreground/10" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-primary-foreground/60">Primary Commodities</span>
                      <span className="text-sm font-bold text-primary-foreground">Gold, Copper, Iron Ore, Bauxite</span>
                    </div>
                    <div className="h-px bg-primary-foreground/10" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-primary-foreground/60">Projected Breakeven</span>
                      <span className="text-sm font-bold text-primary-foreground">Year 3</span>
                    </div>
                  </div>
                  <div className="mt-6 p-3 rounded-md bg-primary-foreground/5 border border-primary-foreground/10">
                    <p className="text-[10px] text-primary-foreground/50 uppercase tracking-wider">Latest Whitepaper</p>
                    <p className="text-sm font-bold text-primary-foreground mt-1">BullEx Whitepaper v1.0</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <div className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-platform-overview">
            Platform Overview
          </h2>
          <div className="w-16 h-1 bg-primary mb-4" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-3xl">
            BullEx integrates producers, custodians, auditors, freight and buyers through a unified platform.
            Trades that meet due diligence are tokenised via smart contracts that represent commodity rights.
            Investors can buy, trade and redeem tokens on BullEx or withdraw fiat/physical upon redemption rules being satisfied.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border">
              <CardContent className="p-6">
                <h3 className="text-base font-bold mb-4" data-testid="text-how-it-works">How It Works</h3>
                <div className="space-y-4">
                  {[
                    { num: "1", text: "Producer lists commodity and submits documentation for due diligence." },
                    { num: "2", text: "Independent auditors validate quantity & quality; custodians issue warehouse receipts." },
                    { num: "3", text: "Smart contract issues BullEx tokens (1:1) and opens subscription round." },
                    { num: "4", text: "Investors buy tokens — funds are released on milestones; shipping & delivery tracked." },
                    { num: "5", text: "Profits redistributed automatically; tokens redeemable for fiat or physical delivery." },
                  ].map((step) => (
                    <div key={step.num} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-primary">{step.num}</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{step.text}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border">
              <CardContent className="p-6">
                <h3 className="text-base font-bold mb-4" data-testid="text-security-compliance">Security & Compliance</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  KYC/AML enforced, proof-of-reserve audits, insured custody and regulatory-first rollout
                  in target jurisdictions. Smart contracts are audited by third-party security firms before
                  production deployment.
                </p>
                <div className="space-y-3">
                  {[
                    { icon: Shield, label: "KYC/AML enforcement on all participants" },
                    { icon: Search, label: "Independent proof-of-reserve audits" },
                    { icon: Lock, label: "Insured custody with audited custodians" },
                    { icon: FileText, label: "Third-party smart contract security audits" },
                    { icon: Globe, label: "Regulatory-first rollout in target jurisdictions" },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label} className="flex items-center gap-3">
                        <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="bg-muted/30 border-y border-border py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <Badge variant="secondary" className="text-[10px] uppercase tracking-widest mb-4">
            Tokenomics
          </Badge>
          <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-tokenomics">
            Tokenomics
          </h2>
          <div className="w-16 h-1 bg-primary mb-4" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-3xl">
            BullEx tokens are utility tokens representing claim on physical commodity units.
            Token supply is minted per trade and fully backed by reserved inventory. Token holders can:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
            <Card className="border">
              <CardContent className="p-4 flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold mb-1">Earn Profit Share</h4>
                  <p className="text-xs text-muted-foreground">Earn profit share from trade settlements distributed proportionally.</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border">
              <CardContent className="p-4 flex items-start gap-3">
                <Coins className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold mb-1">Stake Tokens</h4>
                  <p className="text-xs text-muted-foreground">Stake tokens for platform benefits and enhanced access.</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border">
              <CardContent className="p-4 flex items-start gap-3">
                <Truck className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold mb-1">Redeem Tokens</h4>
                  <p className="text-xs text-muted-foreground">Redeem for physical delivery or fiat (subject to T&C).</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="text-sm font-semibold mb-4">Revenue Streams</h3>
              <div className="space-y-3">
                {[
                  { label: "Issuance Fees", value: "0.5–1%", desc: "of asset value at token minting" },
                  { label: "Trading Fees", value: "0.25–0.5%", desc: "per secondary market transaction" },
                  { label: "Custody & Storage", value: "Variable", desc: "ongoing asset custody fees" },
                  { label: "Licensing & Institutional", value: "Recurring", desc: "platform licensing and institutional services" },
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

            <div>
              <h3 className="text-sm font-semibold mb-4">Fund Allocation</h3>
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
          <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-roadmap">
            Roadmap
          </h2>
          <div className="w-16 h-1 bg-primary mb-8" />
          <div className="space-y-4">
            {[
              { year: "2025", desc: "Pilot tokenisation: Gold; platform MVP & audits." },
              { year: "2026", desc: "Launch Copper & Iron Ore tokenisation; expand custodial partners." },
              { year: "2027", desc: "Add Bauxite & scale global partnerships." },
              { year: "2028", desc: "Institutional integrations & exchange listings." },
              { year: "2029", desc: "DeFi integration and advanced secondary market liquidity." },
            ].map((item) => (
              <div key={item.year} className="flex items-start gap-4" data-testid={`roadmap-${item.year}`}>
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                  <div className="w-px h-full bg-primary/20 min-h-[20px]" />
                </div>
                <div className="pb-4">
                  <p className="text-sm font-bold text-primary">{item.year}</p>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-muted/30 border-y border-border py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-team">
            Team & Advisors
          </h2>
          <div className="w-16 h-1 bg-primary mb-4" />
          <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
            BullEx brings together commodity traders, blockchain engineers, legal & compliance,
            and custody experts. Advisors include strategic partners in mining and trade finance.
            Full bios available upon request.
          </p>
        </div>
      </div>

      <div className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-get-in-touch">
                Get in Touch
              </h2>
              <div className="w-16 h-1 bg-primary mb-4" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-8">
                Interested in partnerships, custody, or investment? Email <span className="font-medium text-foreground">team@bullex.tech</span> or
                use the form to request a meeting.
              </p>

              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-primary">Full Name *</label>
                  <Input
                    className="border-border rounded-none h-11"
                    placeholder="Full name"
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                    data-testid="input-investor-name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-primary">Email *</label>
                  <Input
                    type="email"
                    className="border-border rounded-none h-11"
                    placeholder="Email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    data-testid="input-investor-email"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-primary">How can we help? *</label>
                  <Textarea
                    className="border-border rounded-none min-h-[100px] resize-none"
                    placeholder="How can we help?"
                    value={contactForm.message}
                    onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                    data-testid="input-investor-message"
                  />
                </div>
                <Button type="submit" className="rounded-none h-11 text-sm font-bold uppercase tracking-wider" data-testid="button-investor-send">
                  <Mail className="w-4 h-4 mr-2" />
                  Send Message
                </Button>
              </form>
            </div>

            <div className="flex flex-col justify-center">
              <Card className="border">
                <CardContent className="p-8 text-center">
                  <div className="w-14 h-14 rounded-lg bg-primary flex items-center justify-center mx-auto mb-4">
                    <Shield className="w-7 h-7 text-primary-foreground" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">Ready to Invest?</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                    Start your journey into commodity investment with BullEx. Complete KYC onboarding
                    to access the full range of tokenised commodity assets.
                  </p>
                  <div className="flex flex-col gap-3">
                    <Link href="/kyc">
                      <Button className="w-full rounded-none h-11 font-medium" data-testid="button-investor-kyc">
                        Start KYC Onboarding
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                    <Link href="/contact">
                      <Button variant="outline" className="w-full rounded-none h-11 font-medium" data-testid="button-investor-contact">
                        Contact Us
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-muted/30 border-t border-border py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            BullEx 2025 — Tokenisation of Real-World Commodities
          </p>
          <p className="text-xs text-muted-foreground">
            Contact: <a href="mailto:team@bullex.tech" className="text-primary hover:underline">team@bullex.tech</a>
          </p>
        </div>
      </div>
    </div>
  );
}
