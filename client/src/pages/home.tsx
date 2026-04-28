import { useState, useRef } from "react";
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
  CheckCircle2,
  Mountain,
  Gem,
  Flame,
  Droplets,
  Sprout,
  Package,
  FolderOpen,
  TrendingUp,
  MapPin,
  Mail,
  Play,
  Volume2,
  VolumeX,
  ChevronDown,
} from "lucide-react";

const features = [
  {
    icon: Link2,
    title: "Blockchain-Verified Trading",
    description:
      "Every commodity trade is recorded on our proprietary blockchain with SHA-256 proof-of-work consensus, ensuring tamper-proof transaction history and full auditability.",
  },
  {
    icon: UserCheck,
    title: "Institutional KYC Onboarding",
    description:
      "Comprehensive 10-section Know Your Customer process covering company details, beneficial ownership, compliance questionnaires, and authorized signatory verification.",
  },
  {
    icon: FileText,
    title: "Automated Document Generation",
    description:
      "Generate trade documents instantly — Deal Recap, FCO, ICPO, SPA, LOI, POP, POF, and BCL — all linked to verified trades with blockchain-backed integrity.",
  },
  {
    icon: FolderOpen,
    title: "Secure Document Vault",
    description:
      "Centralized storage for all trade documentation, organized by type and trade reference, with blockchain hash verification for every document.",
  },
  {
    icon: Layers,
    title: "Real-Time Blockchain Ledger",
    description:
      "Full block explorer with transaction drill-down, chain integrity validation, and cryptographic hash verification for complete transparency.",
  },
  {
    icon: Lock,
    title: "Compliance & Governance",
    description:
      "Built-in AML/CFT compliance frameworks, regulatory alignment, and institutional-grade audit trails meeting international trade finance standards.",
  },
];

const divisions = [
  { icon: Mountain, name: "Minerals", products: "Iron Ore, Bauxite, Manganese Ore", color: "text-stone-600 dark:text-stone-400" },
  { icon: Gem, name: "Metals", products: "Copper Cathode, Copper Concentrate, Aluminium Ingots", color: "text-sky-700 dark:text-sky-400" },
  { icon: Flame, name: "Energy Products", products: "Gasoil 10ppm, Gasoil 50ppm, LHC, HSFO, HSGO", color: "text-red-800 dark:text-red-400" },
  { icon: Droplets, name: "Petrochemicals", products: "Petcoke – Anode Grade, Petcoke – Fuel Grade", color: "text-slate-600 dark:text-slate-400" },
  { icon: Sprout, name: "Fertilizers", products: "NPK, Sulphur – Granular, Sulphur – Lumps", color: "text-teal-700 dark:text-teal-400" },
];

const stats = [
  { value: "5", label: "Trading Divisions" },
  { value: "16", label: "Active Commodities" },
  { value: "16", label: "Tokenised Assets" },
  { value: "100%", label: "Blockchain Verified" },
];

const videoShowcase = [
  {
    src: "/videos/mining-operation.mp4",
    label: "Minerals & Metals",
    title: "Global Mining Operations",
    desc: "Iron ore, copper, bauxite and manganese sourced from the world's most productive mining regions.",
    badge: "Minerals · Metals",
  },
  {
    src: "/videos/oil-tanker-sunset.mp4",
    label: "Energy & Petrochemicals",
    title: "International Energy Trade",
    desc: "Gasoil, HSFO, HSGO and petcoke transported across global shipping routes from origin to destination.",
    badge: "Energy · Petrochemicals",
  },
  {
    src: "/videos/port-terminal-night.mp4",
    label: "Global Logistics Hub",
    title: "24/7 Port Operations",
    desc: "Round-the-clock commodity handling across major deep-water ports in Asia, the Middle East, and Africa.",
    badge: "Logistics · Trade",
  },
];

export default function Home() {
  const { toast } = useToast();
  const [heroMuted, setHeroMuted] = useState(true);
  const heroVideoRef = useRef<HTMLVideoElement>(null);
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

  const toggleMute = () => {
    if (heroVideoRef.current) {
      heroVideoRef.current.muted = !heroVideoRef.current.muted;
      setHeroMuted(!heroMuted);
    }
  };

  return (
    <div className="overflow-y-auto h-full">

      {/* ── HERO VIDEO SECTION ── */}
      <div className="relative h-[90vh] min-h-[560px] overflow-hidden bg-black" data-testid="section-hero">
        <video
          ref={heroVideoRef}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-60"
          src="/videos/cargo-ship-ocean.mp4"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/80" />

        <div className="relative z-10 h-full flex flex-col justify-center px-6">
          <div className="max-w-5xl mx-auto w-full">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-sm">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <Badge className="text-[10px] uppercase tracking-widest bg-white/10 text-white border-white/20 backdrop-blur-sm">
                  Commodity Trading Platform
                </Badge>
              </div>
              <h1
                className="text-5xl md:text-6xl font-bold mb-4 tracking-tight leading-tight text-white"
                data-testid="text-home-title"
              >
                Bullex Trading
                <br />
                <span className="text-primary">Platform</span>
              </h1>
              <div className="w-20 h-1 bg-primary mb-6" />
              <p className="text-lg md:text-xl text-white/80 font-light leading-relaxed mb-10 max-w-2xl">
                The institutional-grade, blockchain-backed platform for managing
                commodity trades, client onboarding, and trade documentation
                across Bullfrog Group's global operations.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Link href="/platform">
                  <Button size="lg" className="h-12 px-8 text-sm font-bold uppercase tracking-wider" data-testid="button-hero-get-started">
                    Access Platform
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/products">
                  <Button size="lg" variant="outline" className="h-12 px-8 text-sm font-bold uppercase tracking-wider border-white/30 text-white hover:bg-white/10 bg-transparent" data-testid="button-hero-view-products">
                    <Package className="w-4 h-4 mr-2" />
                    View Products
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={toggleMute}
          className="absolute bottom-6 right-6 z-20 w-10 h-10 rounded-full bg-black/40 border border-white/20 flex items-center justify-center backdrop-blur-sm hover:bg-black/60 transition-colors"
          data-testid="button-hero-mute"
        >
          {heroMuted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
        </button>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 animate-bounce">
          <ChevronDown className="w-6 h-6 text-white/60" />
        </div>
      </div>

      {/* ── STATS BAR ── */}
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

      {/* ── VIDEO SHOWCASE ── */}
      <div className="py-16 px-6 bg-background" data-testid="section-video-showcase">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-widest mb-4">Global Operations</Badge>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
              Trading Across Continents
            </h2>
            <div className="w-16 h-1 bg-primary mx-auto mb-4" />
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed text-sm">
              Bullex facilitates institutional commodity trade flows connecting producers,
              traders, and end-buyers across Asia, the Middle East, and Africa.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {videoShowcase.map((v) => (
              <div
                key={v.src}
                className="group relative rounded-lg overflow-hidden border border-border hover:border-primary/40 transition-all hover:shadow-lg"
                data-testid={`card-video-${v.label.toLowerCase().replace(/[\s·]+/g, "-")}`}
              >
                <div className="relative aspect-video bg-black overflow-hidden">
                  <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    src={v.src}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <Badge className="absolute top-3 left-3 text-[9px] uppercase tracking-wider bg-primary/90 text-white border-0">
                    {v.badge}
                  </Badge>
                </div>
                <div className="p-4 bg-card">
                  <h3 className="text-sm font-bold mb-1">{v.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── WHAT IS BULLEX ── */}
      <div className="py-16 px-6 bg-muted/20 border-y border-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3" data-testid="text-what-is-bullex">
              What is Bullex?
            </h2>
            <div className="w-16 h-1 bg-primary mx-auto mb-4" />
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Bullex is a proprietary commodity trading system — purpose-built for
              institutional commodity trading with blockchain verification at its core.
              It streamlines the entire trade lifecycle from client onboarding through
              document generation to final settlement.
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

      {/* ── HOW IT WORKS ── */}
      <div className="bg-muted/30 border-b border-border py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold tracking-tight mb-3">How Bullex Works</h2>
            <div className="w-16 h-1 bg-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              A streamlined workflow from client onboarding to blockchain-verified trade settlement.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { step: "01", title: "Client Onboarding", desc: "Complete institutional KYC with our comprehensive 10-section form covering company details, compliance, and signatory verification.", link: "/platform", linkText: "Start KYC" },
              { step: "02", title: "Trade Execution", desc: "Execute commodity trades across five divisions. Each trade is automatically mined into the blockchain with proof-of-work verification.", link: "/platform", linkText: "Execute Trade" },
              { step: "03", title: "Document Generation", desc: "Generate all required trade documents — Deal Recap, FCO, ICPO, SPA, LOI, and more — linked directly to verified blockchain trades.", link: "/platform", linkText: "Generate Docs" },
              { step: "04", title: "Verification & Audit", desc: "Every transaction is immutably recorded on the Bullex blockchain, providing a tamper-proof audit trail and real-time chain integrity.", link: "/platform", linkText: "View Ledger" },
            ].map((item) => (
              <Card key={item.step} className="border relative overflow-hidden" data-testid={`card-step-${item.step}`}>
                <CardContent className="p-5">
                  <span className="text-4xl font-bold text-primary/10 absolute top-3 right-4">{item.step}</span>
                  <div className="relative z-10">
                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Step {item.step}</p>
                    <h3 className="text-sm font-semibold mb-2">{item.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-4">{item.desc}</p>
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

      {/* ── COMMODITY DIVISIONS ── */}
      <div className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-commodity-divisions">Commodity Divisions</h2>
            <div className="w-16 h-1 bg-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Bullex manages trades across five core commodity divisions, operating primarily in Asia, the Middle East, and Africa.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {divisions.map((div) => {
              const Icon = div.icon;
              return (
                <Link key={div.name} href="/products">
                  <Card className="border cursor-pointer hover:border-primary/30 transition-colors group h-full" data-testid={`card-division-${div.name.toLowerCase().replace(/\s+/g, "-")}`}>
                    <CardContent className="p-4 text-center">
                      <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/20 transition-colors">
                        <Icon className={`w-5 h-5 ${div.color}`} />
                      </div>
                      <h3 className="text-sm font-semibold mb-1">{div.name}</h3>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{div.products}</p>
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

      {/* ── INITIATE TRADE ── */}
      <section className="bg-primary text-white" data-testid="section-initiate-trade">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="p-10 lg:p-16 flex flex-col justify-center">
              <h2 className="text-3xl font-bold mb-4 tracking-tight">Initiate Trade</h2>
              <div className="w-24 h-1 bg-white/30 mb-8" />
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
                    <option value="minerals">Minerals (Iron Ore, Bauxite, Manganese Ore)</option>
                    <option value="metals">Metals (Copper Cathode, Copper Concentrate, Aluminium Ingots)</option>
                    <option value="energy">Energy Products (Gasoil 10ppm, Gasoil 50ppm, LHC, HSFO, HSGO)</option>
                    <option value="petchem">Petrochemicals (Petcoke – Anode Grade, Petcoke – Fuel Grade)</option>
                    <option value="fertilizers">Fertilizers (NPK, Sulphur – Granular, Sulphur – Lumps)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-primary">Message *</label>
                  <Textarea className="border-border rounded-none min-h-[120px] focus-visible:ring-primary resize-none" placeholder="Describe your requirements, quantities, destination ports, preferred delivery window..." value={supplyForm.message} onChange={(e) => setSupplyForm({ ...supplyForm, message: e.target.value })} data-testid="supply-textarea-message" />
                </div>
                <Button type="submit" className="w-full rounded-none h-12 text-sm font-bold uppercase tracking-wider" data-testid="supply-button-submit">
                  Submit Inquiry
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
