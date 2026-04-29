import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Users,
  Briefcase,
  Globe,
  GraduationCap,
  Heart,
  Shield,
  TrendingUp,
  MapPin,
  Clock,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  CheckCircle2,
  Star,
  Handshake,
  Lightbulb,
  Award,
} from "lucide-react";

const OPEN_ROLES = [
  {
    id: "1",
    title: "Senior Commodity Trader",
    department: "Trading",
    location: "Dubai, UAE",
    type: "Full-Time",
    level: "Senior",
    description:
      "Lead buy-side and sell-side transactions across our mineral, metal, and energy divisions. Manage client relationships, structure trade deals, and ensure compliance with documentation standards (LOI, SCO, SPA).",
    requirements: [
      "7+ years in physical commodity trading (minerals, metals, or energy)",
      "Proven track record closing bulk commodity deals",
      "Strong knowledge of trade finance instruments (LC, SBLC)",
      "Familiarity with Incoterms and export documentation",
      "Excellent negotiation and relationship management skills",
    ],
  },
  {
    id: "2",
    title: "KYC & Compliance Analyst",
    department: "Compliance",
    location: "Dubai, UAE",
    type: "Full-Time",
    level: "Mid-Level",
    description:
      "Review and process KYC/AML onboarding applications for counterparties and clients. Verify beneficial ownership, conduct due diligence, and maintain compliance records on the Bullex platform.",
    requirements: [
      "3+ years in KYC/AML within trade finance, banking, or commodities",
      "Knowledge of FATF standards and UAE AML regulations",
      "Experience reviewing corporate documentation and UBO structures",
      "Strong attention to detail and analytical skills",
      "ACAMS certification preferred",
    ],
  },
  {
    id: "3",
    title: "Trade Operations Executive",
    department: "Operations",
    location: "Dubai, UAE",
    type: "Full-Time",
    level: "Mid-Level",
    description:
      "Coordinate the end-to-end execution of commodity trade transactions — from Deal Recap through SPA to final settlement. Liaise with inspection agencies, shipping companies, and banks.",
    requirements: [
      "4+ years in trade operations or logistics within commodities",
      "Understanding of shipping documentation (BL, COA, COO, COW)",
      "Experience with Letter of Credit processes",
      "Ability to manage multiple active trades simultaneously",
      "Strong organisational and communication skills",
    ],
  },
  {
    id: "4",
    title: "Blockchain & Platform Developer",
    department: "Technology",
    location: "Dubai, UAE / Remote",
    type: "Full-Time",
    level: "Senior",
    description:
      "Build and maintain the Bullex trading platform — including blockchain ledger, document generation engine, and client portal. Work with React, Node.js, TypeScript, and PostgreSQL.",
    requirements: [
      "5+ years full-stack development (React, Node.js, TypeScript)",
      "Experience with blockchain concepts (proof-of-work, SHA-256, immutability)",
      "PostgreSQL and REST API design experience",
      "Understanding of document workflows and PDF generation",
      "Ability to work in a fast-moving fintech/commodity environment",
    ],
  },
  {
    id: "5",
    title: "Investor Relations Associate",
    department: "Finance",
    location: "Dubai, UAE",
    type: "Full-Time",
    level: "Mid-Level",
    description:
      "Support institutional and retail investor communications, manage onboarding queries, and help prepare investment documentation and reporting materials for BFG-20 token holders.",
    requirements: [
      "3+ years in investor relations, private equity, or financial services",
      "Strong written and verbal communication skills",
      "Experience preparing pitch decks and investor memoranda",
      "Understanding of tokenised asset frameworks is a plus",
      "CFA Level 1 or equivalent financial qualification preferred",
    ],
  },
  {
    id: "6",
    title: "Business Development Manager",
    department: "Commercial",
    location: "Dubai, UAE",
    type: "Full-Time",
    level: "Senior",
    description:
      "Identify and onboard new trading counterparties across the GCC, Asia, and Africa. Develop strategic partnerships with producers, offtakers, and logistics providers in the commodity supply chain.",
    requirements: [
      "6+ years in B2B business development in commodities, trading, or logistics",
      "Strong network in mineral, energy, or agricultural trading sectors",
      "Experience structuring commercial agreements and NDAs",
      "Willingness to travel internationally",
      "Fluency in English; Arabic or Mandarin is an advantage",
    ],
  },
];

const BENEFITS = [
  { icon: TrendingUp, title: "Competitive Compensation", desc: "Market-leading salaries with performance-linked bonuses tied to trading volumes and platform milestones." },
  { icon: Globe, title: "Global Exposure", desc: "Work with counterparties across Asia, the Middle East, and Africa — gaining unparalleled international commodity market experience." },
  { icon: GraduationCap, title: "Learning & Development", desc: "Sponsored certifications (ACAMS, CFA, CTP), in-house training on trade finance documentation and blockchain compliance." },
  { icon: Heart, title: "Health & Wellbeing", desc: "Comprehensive health insurance for you and your dependents, mental wellness support, and generous annual leave." },
  { icon: Shield, title: "Stability & Governance", desc: "Work within a professionally governed trading house with blockchain-backed audit trails, ensuring transparency and institutional credibility." },
  { icon: Handshake, title: "Collaborative Culture", desc: "A lean, high-performance team culture that rewards initiative, rewards results, and values every team member's contribution." },
];

const VALUES = [
  { icon: Shield, title: "Integrity", desc: "Every transaction, document, and decision is held to the highest standard of transparency and accountability." },
  { icon: Lightbulb, title: "Innovation", desc: "We leverage blockchain technology to modernise commodity trading — and we expect our team to bring fresh ideas every day." },
  { icon: Star, title: "Excellence", desc: "We set the bar high in trade execution, compliance, and client service. Mediocrity is not in our vocabulary." },
  { icon: Award, title: "Impact", desc: "Our work moves physical commodities across the world — we take that responsibility seriously and take pride in the results we deliver." },
];

function RoleCard({ role }: { role: typeof OPEN_ROLES[0] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="border" data-testid={`card-role-${role.id}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-2">
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{role.department}</Badge>
              <Badge variant="outline" className="text-[10px]">{role.level}</Badge>
              <Badge variant="outline" className="text-[10px]">{role.type}</Badge>
            </div>
            <h3 className="text-sm font-semibold mb-1" data-testid={`text-role-title-${role.id}`}>{role.title}</h3>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{role.location}</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{role.type}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 flex-shrink-0"
            onClick={() => setOpen(!open)}
            data-testid={`button-role-expand-${role.id}`}
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>

        {open && (
          <div className="mt-4 pt-4 border-t border-border space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">{role.description}</p>
            <div>
              <p className="text-xs font-semibold mb-2 text-foreground">Requirements</p>
              <ul className="space-y-1.5">
                {role.requirements.map((req, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                    {req}
                  </li>
                ))}
              </ul>
            </div>
            <a href={`mailto:career@bullex.tech?subject=Application – ${encodeURIComponent(role.title)}`}>
              <Button size="sm" className="h-8 text-xs mt-1" data-testid={`button-apply-${role.id}`}>
                Apply for This Role
                <ArrowRight className="w-3 h-3 ml-1.5" />
              </Button>
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApplicationForm() {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", role: "", message: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast({ title: "Please fill in your name and email.", variant: "destructive" });
      return;
    }
    const subject = form.role.trim()
      ? `Application – ${form.role.trim()}`
      : "General Application – Bullex Careers";
    const body = [
      `Name: ${form.name.trim()}`,
      `Email: ${form.email.trim()}`,
      form.role.trim() ? `Position of Interest: ${form.role.trim()}` : "",
      "",
      form.message.trim() || "(No cover note provided)",
    ].filter((l) => l !== undefined).join("\n");
    window.location.href = `mailto:career@bullex.tech?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="hr-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full Name *</Label>
          <Input
            id="hr-name"
            placeholder="Your full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-9 text-sm"
            data-testid="input-hr-name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hr-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Address *</Label>
          <Input
            id="hr-email"
            type="email"
            placeholder="you@company.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="h-9 text-sm"
            data-testid="input-hr-email"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="hr-role" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Position of Interest</Label>
        <Input
          id="hr-role"
          placeholder="e.g. Senior Commodity Trader, or open to any role"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          className="h-9 text-sm"
          data-testid="input-hr-role"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="hr-message" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cover Note</Label>
        <Textarea
          id="hr-message"
          placeholder="Briefly describe your background and why you want to join Bullex..."
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          rows={4}
          className="text-sm resize-none"
          data-testid="input-hr-message"
        />
      </div>
      <Button type="submit" disabled={sending} className="h-9 px-6 text-sm font-medium" data-testid="button-hr-submit">
        {sending ? "Submitting…" : "Submit Application"}
        {!sending && <ArrowRight className="w-3.5 h-3.5 ml-2" />}
      </Button>
    </form>
  );
}

export default function HumanResources() {
  return (
    <div className="overflow-y-auto h-full">

      {/* ── Hero ── */}
      <div className="bg-primary text-primary-foreground py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-3xl">
            <Badge
              variant="secondary"
              className="text-[10px] uppercase tracking-widest bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 mb-4"
            >
              Human Resources
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight" data-testid="text-hr-title">
              Build Your Career in Commodity Trading
            </h1>
            <div className="w-20 h-1 bg-primary-foreground/40 mb-6" />
            <p className="text-lg text-primary-foreground/80 font-light leading-relaxed">
              Bullex is assembling a world-class team of commodity traders, compliance
              professionals, technologists, and dealmakers. Join us at the frontier of
              blockchain-backed physical commodity markets.
            </p>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="bg-card border-b border-border py-8 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center" data-testid="stat-hr-divisions">
              <p className="text-2xl font-bold text-primary">5</p>
              <p className="text-xs text-muted-foreground mt-1">Commodity Divisions</p>
            </div>
            <div className="text-center" data-testid="stat-hr-roles">
              <p className="text-2xl font-bold text-primary">{OPEN_ROLES.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Open Positions</p>
            </div>
            <div className="text-center" data-testid="stat-hr-location">
              <p className="text-2xl font-bold text-primary">Dubai</p>
              <p className="text-xs text-muted-foreground mt-1">Headquarters</p>
            </div>
            <div className="text-center" data-testid="stat-hr-global">
              <p className="text-2xl font-bold text-primary">Global</p>
              <p className="text-xs text-muted-foreground mt-1">Market Reach</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Our Values ── */}
      <div className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-widest mb-4">Our Values</Badge>
            <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-hr-values-title">
              What We Stand For
            </h2>
            <div className="w-16 h-1 bg-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Our culture is built on the values that have made Bullfrog Group a trusted name
              in global commodity markets for years.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {VALUES.map((v) => {
              const Icon = v.icon;
              return (
                <Card key={v.title} className="border" data-testid={`card-value-${v.title.toLowerCase()}`}>
                  <CardContent className="p-5">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center mb-3">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-sm font-semibold mb-2">{v.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{v.desc}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Open Positions ── */}
      <div className="bg-muted/30 border-y border-border py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-widest mb-4">Careers</Badge>
            <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-hr-openings-title">
              Current Openings
            </h2>
            <div className="w-16 h-1 bg-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              We are growing across trading, compliance, technology, and commercial functions.
              Expand a role below to see requirements and apply directly.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {OPEN_ROLES.map((role) => (
              <RoleCard key={role.id} role={role} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Benefits ── */}
      <div className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-widest mb-4">Why Bullex</Badge>
            <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-hr-benefits-title">
              Benefits & Perks
            </h2>
            <div className="w-16 h-1 bg-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              We invest in our people the same way we invest in our trades — with conviction and long-term thinking.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {BENEFITS.map((b) => {
              const Icon = b.icon;
              return (
                <Card key={b.title} className="border" data-testid={`card-benefit-${b.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                  <CardContent className="p-5">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center mb-3">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-sm font-semibold mb-2">{b.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Application Form ── */}
      <div className="bg-muted/30 border-y border-border py-16 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-widest mb-4">Apply Now</Badge>
            <h2 className="text-2xl font-bold tracking-tight mb-3" data-testid="text-hr-apply-title">
              Send Us Your Application
            </h2>
            <div className="w-16 h-1 bg-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Don't see the exact role you're looking for? We're always open to hearing
              from exceptional people. Fill in the form below and our HR team will be in touch.
            </p>
          </div>
          <Card className="border">
            <CardContent className="p-6 sm:p-8">
              <ApplicationForm />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="bg-primary text-primary-foreground py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="max-w-lg">
              <h2 className="text-2xl font-bold tracking-tight mb-3">
                Questions About Joining Bullex?
              </h2>
              <p className="text-primary-foreground/70 text-sm leading-relaxed">
                Our HR team is happy to answer any questions about working at Bullex,
                our hiring process, or the roles currently available across our commodity
                trading operations.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <a href="mailto:career@bullex.tech">
                <Button variant="secondary" size="lg" className="font-medium" data-testid="button-hr-email">
                  Email HR Team
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </a>
              <Link href="/contact">
                <Button
                  variant="outline"
                  size="lg"
                  className="font-medium border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                  data-testid="button-hr-contact"
                >
                  Contact Page
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
