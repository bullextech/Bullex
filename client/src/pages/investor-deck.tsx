import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Shield, ChevronLeft, ChevronRight, Printer, Maximize2,
  FileWarning, ShieldCheck, FileText, Coins, Boxes, Database,
  ScrollText, BadgeCheck, Layers, Workflow, TrendingUp, Globe2,
  Wallet, Mail, Phone, MapPin, ArrowRight, Link2, Gauge,
} from "lucide-react";

const C = {
  bg: "#0a1628",
  panel: "#0f1e35",
  panel2: "#13243f",
  line: "rgba(255,255,255,0.08)",
  primary: "#c41230",
  primaryDeep: "#990000",
  accent: "#0084be",
  gold: "#e0b243",
  text: "#e8eef5",
  muted: "#8aa0b8",
};

const TEXT = "#e8eef5";
const MUTED = "#8aa0b8";
const META = "#6b8299";

function Meta({ index, total, tag }: { index: number; total: number; tag: string }) {
  const block = String(index + 1).padStart(2, "0");
  return (
    <div
      className="flex items-center gap-3 font-mono text-[11px] tracking-[0.25em] uppercase"
      style={{ color: META }}
    >
      <span style={{ color: C.primary }}>BLOCK {block}</span>
      <span style={{ color: C.line }}>/</span>
      <span>{String(total).padStart(2, "0")}</span>
      <span style={{ color: C.line }}>·</span>
      <span>{tag}</span>
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-mono text-[12px] tracking-[0.3em] uppercase mb-5"
      style={{ color: C.accent }}
    >
      {children}
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="font-bold leading-[1.08] tracking-tight"
      style={{ color: TEXT, fontSize: "clamp(1.9rem, 4.2vw, 3.4rem)" }}
    >
      {children}
    </h2>
  );
}

function SlideFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[1180px] mx-auto px-8 md:px-14 py-10 md:py-14 h-full flex flex-col justify-center">
      {children}
    </div>
  );
}

function Bar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm md:text-base font-medium" style={{ color: TEXT }}>{label}</span>
        <span className="font-mono text-sm" style={{ color: C.gold }}>{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

type Slide = { tag: string; render: () => React.ReactNode };

const LOGO = "/bullex-logo-transparent.png";

const slides: Slide[] = [
  {
    tag: "COVER",
    render: () => (
      <SlideFrame>
        <div className="flex flex-col items-center text-center">
          <img src={LOGO} alt="Bullex" className="w-20 h-20 md:w-24 md:h-24 object-contain mb-8" />
          <div
            className="font-bold tracking-tight"
            style={{ color: TEXT, fontSize: "clamp(3rem, 9vw, 6.5rem)", letterSpacing: "-0.02em" }}
          >
            BULLEX
          </div>
          <div
            className="font-mono tracking-[0.4em] uppercase mt-2 mb-8"
            style={{ color: C.accent, fontSize: "clamp(0.7rem, 1.6vw, 1rem)" }}
          >
            Physical Commodity Trading Platform
          </div>
          <p
            className="max-w-2xl text-base md:text-xl leading-relaxed"
            style={{ color: MUTED }}
          >
            Blockchain-backed trade lifecycle, tokenised commodities, and
            institutional-grade compliance — in one platform.
          </p>
          <div className="mt-12 flex items-center gap-4 font-mono text-[11px] tracking-[0.25em] uppercase" style={{ color: META }}>
            <span>Investor Presentation</span>
            <span style={{ color: C.line }}>·</span>
            <span>2026</span>
            <span style={{ color: C.line }}>·</span>
            <span>Bullfrog Group · Dubai</span>
          </div>
        </div>
      </SlideFrame>
    ),
  },
  {
    tag: "PROBLEM",
    render: () => (
      <SlideFrame>
        <Kicker>The Problem</Kicker>
        <Title>Physical commodity trade still runs on paper and trust</Title>
        <p className="mt-5 text-base md:text-lg max-w-3xl" style={{ color: MUTED }}>
          Billions in commodities move across borders every day on a foundation of
          email, PDFs, and manual reconciliation — slow, opaque, and exposed to fraud.
        </p>
        <div className="grid md:grid-cols-2 gap-5 mt-10">
          {[
            { icon: FileWarning, t: "Document fraud & delay", d: "LOI, SCO, SPA, BL and COO chains are paper-heavy and easily forged or lost." },
            { icon: ShieldCheck, t: "Fragmented compliance", d: "KYC and sanctions screening repeated inconsistently across every counterparty." },
            { icon: Link2, t: "Trust gaps", d: "Buyers and sellers have no shared, tamper-proof record of the deal." },
            { icon: Wallet, t: "Locked capital", d: "Slow settlement and intermediaries tie up working capital for weeks." },
          ].map((x) => (
            <div key={x.t} className="rounded-xl p-6 border" style={{ background: C.panel, borderColor: C.line }}>
              <x.icon className="w-7 h-7 mb-3" style={{ color: C.primary }} />
              <div className="font-semibold text-lg" style={{ color: TEXT }}>{x.t}</div>
              <div className="text-sm mt-1.5 leading-relaxed" style={{ color: MUTED }}>{x.d}</div>
            </div>
          ))}
        </div>
      </SlideFrame>
    ),
  },
  {
    tag: "SOLUTION",
    render: () => (
      <SlideFrame>
        <Kicker>The Solution</Kicker>
        <Title>One platform for the entire physical trade lifecycle</Title>
        <p className="mt-5 text-base md:text-lg max-w-3xl" style={{ color: MUTED }}>
          Bullex digitises onboarding, trade execution, documentation and settlement —
          and writes every trade and KYC record into an immutable, SHA-256 ledger.
        </p>
        <div className="grid md:grid-cols-3 gap-5 mt-10">
          {[
            { icon: ShieldCheck, t: "Blockchain verification", d: "Every trade and KYC approval is hashed and mined into a tamper-proof chain." },
            { icon: FileText, t: "End-to-end documents", d: "Generate, sign and exchange 12+ trade documents with full audit trail." },
            { icon: Coins, t: "Tokenised access", d: "BFG-20 tokens open fractional, liquid exposure to physical commodities." },
          ].map((x) => (
            <div key={x.t} className="rounded-xl p-7 border" style={{ background: C.panel, borderColor: C.line }}>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ background: "rgba(196,18,48,0.12)" }}>
                <x.icon className="w-6 h-6" style={{ color: C.primary }} />
              </div>
              <div className="font-semibold text-xl" style={{ color: TEXT }}>{x.t}</div>
              <div className="text-sm mt-2 leading-relaxed" style={{ color: MUTED }}>{x.d}</div>
            </div>
          ))}
        </div>
      </SlideFrame>
    ),
  },
  {
    tag: "WORKFLOW",
    render: () => (
      <SlideFrame>
        <Kicker>How It Works</Kicker>
        <Title>From onboarding to verified settlement</Title>
        <div className="grid md:grid-cols-4 gap-4 mt-12">
          {[
            { n: "01", icon: BadgeCheck, t: "Onboarding", d: "Institutional KYC, sanctions screening and approval." },
            { n: "02", icon: Workflow, t: "Trade", d: "Structure and execute commodity trades on-platform." },
            { n: "03", icon: ScrollText, t: "Documents", d: "Generate and sign the full LOI → SCO → SPA chain." },
            { n: "04", icon: ShieldCheck, t: "Verification", d: "Records hashed into the blockchain ledger." },
          ].map((x, i) => (
            <div key={x.t} className="relative rounded-xl p-6 border" style={{ background: C.panel, borderColor: C.line }}>
              <div className="font-mono text-3xl font-bold mb-3" style={{ color: "rgba(224,178,67,0.85)" }}>{x.n}</div>
              <x.icon className="w-7 h-7 mb-3" style={{ color: C.accent }} />
              <div className="font-semibold text-lg" style={{ color: TEXT }}>{x.t}</div>
              <div className="text-sm mt-1.5 leading-relaxed" style={{ color: MUTED }}>{x.d}</div>
              {i < 3 && <ArrowRight className="hidden md:block absolute -right-3 top-1/2 w-5 h-5" style={{ color: C.line }} />}
            </div>
          ))}
        </div>
      </SlideFrame>
    ),
  },
  {
    tag: "PRODUCT",
    render: () => (
      <SlideFrame>
        <Kicker>The Platform</Kicker>
        <Title>Six modules, one source of truth</Title>
        <div className="grid md:grid-cols-3 gap-4 mt-10">
          {[
            { icon: BadgeCheck, t: "KYC & Onboarding", d: "10-section institutional KYC with approvals." },
            { icon: FileText, t: "Document Generator", d: "12+ contract types with DOCX/PDF & signatures." },
            { icon: Workflow, t: "Blockchain Trading", d: "Document-gated trade lifecycle execution." },
            { icon: Database, t: "Document Vault", d: "Secure, searchable repository of every file." },
            { icon: Boxes, t: "Blockchain Ledger", d: "Block explorer for trades and KYC records." },
            { icon: ShieldCheck, t: "Compliance", d: "Sanctions screening and audit-ready trails." },
          ].map((x) => (
            <div key={x.t} className="rounded-xl p-6 border flex gap-4 items-start" style={{ background: C.panel, borderColor: C.line }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(0,132,190,0.12)" }}>
                <x.icon className="w-5 h-5" style={{ color: C.accent }} />
              </div>
              <div>
                <div className="font-semibold" style={{ color: TEXT }}>{x.t}</div>
                <div className="text-sm mt-1 leading-relaxed" style={{ color: MUTED }}>{x.d}</div>
              </div>
            </div>
          ))}
        </div>
      </SlideFrame>
    ),
  },
  {
    tag: "MARKET",
    render: () => (
      <SlideFrame>
        <Kicker>What We Trade</Kicker>
        <Title>Five commodity divisions</Title>
        <div className="grid md:grid-cols-5 gap-4 mt-12">
          {[
            { t: "Minerals", d: "Iron Ore, Bauxite, Manganese" },
            { t: "Metals", d: "Copper Cathode, Aluminium" },
            { t: "Energy", d: "Gasoil, LHC, HSFO, HSGO" },
            { t: "Petrochemicals", d: "Petcoke (Anode & Fuel)" },
            { t: "Fertilizers", d: "NPK" },
          ].map((x, i) => (
            <div key={x.t} className="rounded-xl p-6 border h-full" style={{ background: i % 2 ? C.panel2 : C.panel, borderColor: C.line }}>
              <div className="font-mono text-xs mb-3" style={{ color: C.gold }}>0{i + 1}</div>
              <div className="font-semibold text-lg" style={{ color: TEXT }}>{x.t}</div>
              <div className="text-sm mt-2 leading-relaxed" style={{ color: MUTED }}>{x.d}</div>
            </div>
          ))}
        </div>
        <p className="mt-10 text-sm md:text-base max-w-3xl" style={{ color: MUTED }}>
          Each division is tradable physically and tokenisable as a BFG-20 asset, giving
          investors regulated exposure to the underlying commodity.
        </p>
      </SlideFrame>
    ),
  },
  {
    tag: "TOKENISATION",
    render: () => (
      <SlideFrame>
        <Kicker>Tokenisation</Kicker>
        <Title>BFG-20: commodities, on-chain</Title>
        <div className="grid md:grid-cols-2 gap-10 mt-9 items-center">
          <div>
            <p className="text-base md:text-lg leading-relaxed" style={{ color: MUTED }}>
              The BFG-20 standard turns physical commodity inventory into transferable,
              auditable tokens — unlocking fractional ownership, liquidity and
              transparent settlement for investors and trade partners.
            </p>
            <div className="grid grid-cols-2 gap-4 mt-8">
              {[
                { k: "12", v: "Tokens in registry" },
                { k: "5", v: "Step issuance process" },
                { k: "100%", v: "Asset-backed" },
                { k: "24/7", v: "Ledger transparency" },
              ].map((s) => (
                <div key={s.v} className="rounded-xl p-5 border" style={{ background: C.panel, borderColor: C.line }}>
                  <div className="font-bold text-3xl" style={{ color: C.gold }}>{s.k}</div>
                  <div className="text-sm mt-1" style={{ color: MUTED }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl p-8 border" style={{ background: C.panel, borderColor: C.line }}>
            {["Source & verify commodity", "Mint BFG-20 token", "List on platform", "Trade & settle on-chain", "Redeem or hold"].map((step, i) => (
              <div key={step} className="flex items-center gap-4 py-3" style={{ borderBottom: i < 4 ? `1px solid ${C.line}` : "none" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm shrink-0" style={{ background: "rgba(196,18,48,0.15)", color: C.primary }}>{i + 1}</div>
                <span style={{ color: TEXT }}>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </SlideFrame>
    ),
  },
  {
    tag: "REVENUE",
    render: () => (
      <SlideFrame>
        <Kicker>Business Model</Kicker>
        <Title>Diversified, recurring revenue</Title>
        <div className="grid md:grid-cols-4 gap-4 mt-12">
          {[
            { icon: Coins, t: "Issuance fees", d: "0.5–1% on each token issuance." },
            { icon: TrendingUp, t: "Trading fees", d: "0.25–0.5% per matched trade." },
            { icon: Database, t: "Custody fees", d: "Recurring fees on assets under custody." },
            { icon: Layers, t: "Licensing", d: "Platform & technology licensing." },
          ].map((x) => (
            <div key={x.t} className="rounded-xl p-6 border" style={{ background: C.panel, borderColor: C.line }}>
              <x.icon className="w-7 h-7 mb-4" style={{ color: C.gold }} />
              <div className="font-semibold text-lg" style={{ color: TEXT }}>{x.t}</div>
              <div className="text-sm mt-1.5 leading-relaxed" style={{ color: MUTED }}>{x.d}</div>
            </div>
          ))}
        </div>
        <p className="mt-10 text-sm md:text-base max-w-3xl" style={{ color: MUTED }}>
          Revenue scales with both transaction volume and assets on the platform —
          combining transactional upside with recurring custody and licensing income.
        </p>
      </SlideFrame>
    ),
  },
  {
    tag: "OPPORTUNITY",
    render: () => (
      <SlideFrame>
        <Kicker>Market Opportunity</Kicker>
        <Title>A multi-trillion dollar market going digital</Title>
        <div className="grid md:grid-cols-3 gap-5 mt-12">
          {[
            { icon: Globe2, k: "$20T+", t: "Annual global physical commodity trade flows." },
            { icon: Gauge, k: "Early", t: "Digitisation of trade documents and settlement is just beginning." },
            { icon: Coins, k: "Rising", t: "Institutional demand for tokenised real-world assets." },
          ].map((x) => (
            <div key={x.t} className="rounded-xl p-7 border" style={{ background: C.panel, borderColor: C.line }}>
              <x.icon className="w-8 h-8 mb-4" style={{ color: C.accent }} />
              <div className="font-bold text-4xl" style={{ color: C.gold }}>{x.k}</div>
              <div className="text-sm mt-3 leading-relaxed" style={{ color: MUTED }}>{x.t}</div>
            </div>
          ))}
        </div>
        <p className="mt-10 text-sm max-w-3xl" style={{ color: META }}>
          Figures are illustrative market context for the scale of global physical commodity trade.
        </p>
      </SlideFrame>
    ),
  },
  {
    tag: "TRACTION",
    render: () => (
      <SlideFrame>
        <Kicker>Why Now</Kicker>
        <Title>The platform is already live</Title>
        <div className="grid md:grid-cols-2 gap-5 mt-10">
          {[
            { icon: ShieldCheck, t: "Operational blockchain ledger", d: "Trades and KYC approvals are being hashed into the chain today." },
            { icon: FileText, t: "Full document engine", d: "12+ contract types with digital signatures and client portal delivery." },
            { icon: BadgeCheck, t: "Compliance-first", d: "Institutional KYC and live sanctions screening built in." },
            { icon: Boxes, t: "Tokenisation framework", d: "BFG-20 registry and issuance process in place." },
          ].map((x) => (
            <div key={x.t} className="rounded-xl p-6 border flex gap-4 items-start" style={{ background: C.panel, borderColor: C.line }}>
              <ShieldCheck className="w-6 h-6 shrink-0 mt-0.5" style={{ color: C.primary }} />
              <div>
                <div className="font-semibold text-lg" style={{ color: TEXT }}>{x.t}</div>
                <div className="text-sm mt-1 leading-relaxed" style={{ color: MUTED }}>{x.d}</div>
              </div>
            </div>
          ))}
        </div>
      </SlideFrame>
    ),
  },
  {
    tag: "USE-OF-FUNDS",
    render: () => (
      <SlideFrame>
        <Kicker>Use of Funds</Kicker>
        <Title>Where investment goes</Title>
        <div className="grid md:grid-cols-2 gap-12 mt-10 items-center">
          <div className="space-y-6">
            <Bar label="Technology & platform" pct={40} color={C.primary} />
            <Bar label="Commodity sourcing" pct={30} color={C.accent} />
            <Bar label="Compliance & legal" pct={20} color={C.gold} />
            <Bar label="Marketing & growth" pct={10} color="#5b8a72" />
          </div>
          <div className="rounded-2xl p-8 border" style={{ background: C.panel, borderColor: C.line }}>
            <p className="text-base md:text-lg leading-relaxed" style={{ color: MUTED }}>
              Capital is weighted toward the technology and sourcing engine that drives
              transaction volume, with disciplined investment in the compliance backbone
              that institutional counterparties require.
            </p>
          </div>
        </div>
      </SlideFrame>
    ),
  },
  {
    tag: "THE-ASK",
    render: () => (
      <SlideFrame>
        <div className="rounded-2xl p-10 md:p-14 border text-center" style={{ background: `linear-gradient(135deg, ${C.panel} 0%, ${C.panel2} 100%)`, borderColor: C.line }}>
          <Kicker>The Opportunity</Kicker>
          <Title>Invest in the infrastructure of physical commodity trade</Title>
          <p className="mt-6 text-base md:text-xl max-w-2xl mx-auto" style={{ color: MUTED }}>
            Back a live, compliance-first platform that turns commodity trade into a
            transparent, tokenised and verifiable asset class.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 mt-10">
            {["Register & KYC", "Review terms", "Allocate capital", "Track on-chain"].map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <div className="rounded-full px-5 py-2.5 border font-medium text-sm" style={{ borderColor: C.line, color: TEXT, background: "rgba(255,255,255,0.03)" }}>
                  <span className="font-mono mr-2" style={{ color: C.gold }}>{i + 1}</span>{s}
                </div>
                {i < 3 && <ArrowRight className="w-4 h-4" style={{ color: C.line }} />}
              </div>
            ))}
          </div>
        </div>
      </SlideFrame>
    ),
  },
  {
    tag: "CONTACT",
    render: () => (
      <SlideFrame>
        <div className="flex flex-col items-center text-center">
          <img src={LOGO} alt="Bullex" className="w-16 h-16 object-contain mb-6" />
          <Title>Let's build the future of commodity trade</Title>
          <div className="grid sm:grid-cols-3 gap-5 mt-12 w-full max-w-3xl">
            {[
              { icon: Mail, t: "Investor relations", d: "team@bullex.tech" },
              { icon: Mail, t: "Trade desk", d: "trade@bullex.tech" },
              { icon: Phone, t: "Phone", d: "+971 58 541 6399" },
            ].map((x) => (
              <div key={x.t} className="rounded-xl p-6 border" style={{ background: C.panel, borderColor: C.line }}>
                <x.icon className="w-6 h-6 mx-auto mb-3" style={{ color: C.accent }} />
                <div className="font-semibold" style={{ color: TEXT }}>{x.t}</div>
                <div className="text-sm mt-1 break-words" style={{ color: MUTED }}>{x.d}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-10" style={{ color: MUTED }}>
            <MapPin className="w-4 h-4" style={{ color: C.primary }} />
            <span className="text-sm">Dubai, United Arab Emirates</span>
          </div>
          <div className="mt-8 font-mono text-[11px] tracking-[0.25em] uppercase" style={{ color: META }}>
            Bullex is a proprietary platform of Bullfrog Group
          </div>
        </div>
      </SlideFrame>
    ),
  },
];

const printCss = `
@media print {
  @page { size: 1280px 720px; margin: 0; }
  body { background: ${C.bg} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .deck-screen { display: none !important; }
  .deck-print { display: block !important; }
  .deck-print-slide {
    width: 1280px; height: 720px; page-break-after: always; overflow: hidden;
    position: relative; background: ${C.bg};
  }
}
.deck-print { display: none; }
`;

export default function InvestorDeck() {
  const [current, setCurrent] = useState(0);
  const total = slides.length;

  const go = useCallback((dir: number) => {
    setCurrent((c) => Math.min(total - 1, Math.max(0, c + dir)));
  }, [total]);

  const print = useCallback(() => window.print(), []);
  const fullscreen = useCallback(() => {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "BUTTON" || tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
      else if (e.key === "Home") setCurrent(0);
      else if (e.key === "End") setCurrent(total - 1);
      else if (e.key.toLowerCase() === "f") fullscreen();
      else if (e.key.toLowerCase() === "p") print();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, fullscreen, print, total]);

  const slide = slides[current];

  return (
    <div className="min-h-screen w-full" style={{ background: C.bg, color: TEXT }} data-testid="investor-deck">
      <style dangerouslySetInnerHTML={{ __html: printCss }} />

      <div className="deck-screen relative flex flex-col" style={{ height: "100vh" }}>
        {/* top bar */}
        <div className="flex items-center justify-between px-6 md:px-10 py-4 shrink-0" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div className="flex items-center gap-3">
            <img src={LOGO} alt="Bullex" className="w-7 h-7 object-contain" />
            <span className="font-bold tracking-tight" style={{ color: TEXT }}>BULLEX</span>
            <span className="hidden sm:inline font-mono text-[10px] tracking-[0.25em] uppercase ml-2" style={{ color: META }}>Investor Deck</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fullscreen} data-testid="button-fullscreen" className="p-2 rounded-md transition-colors" style={{ color: MUTED }} title="Fullscreen (F)">
              <Maximize2 className="w-4 h-4" />
            </button>
            <button onClick={print} data-testid="button-print" className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-90" style={{ background: C.primary, color: "#fff" }} title="Print / Save PDF (P)">
              <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Save PDF</span>
            </button>
          </div>
        </div>

        {/* slide area */}
        <div className="relative flex-1 overflow-hidden">
          <div className="absolute top-6 left-6 md:left-10 z-10">
            <Meta index={current} total={total} tag={slide.tag} />
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="absolute inset-0"
            >
              {slide.render()}
            </motion.div>
          </AnimatePresence>

          {/* click zones */}
          <button aria-label="Previous" onClick={() => go(-1)} className="absolute left-0 top-0 h-full w-[18%] cursor-w-resize" style={{ background: "transparent" }} data-testid="zone-prev" />
          <button aria-label="Next" onClick={() => go(1)} className="absolute right-0 top-0 h-full w-[60%] cursor-e-resize" style={{ background: "transparent" }} data-testid="zone-next" />
        </div>

        {/* bottom controls */}
        <div className="flex items-center justify-between px-6 md:px-10 py-4 shrink-0" style={{ borderTop: `1px solid ${C.line}` }}>
          <button onClick={() => go(-1)} disabled={current === 0} data-testid="button-prev" className="flex items-center gap-1.5 text-sm transition-opacity disabled:opacity-30" style={{ color: MUTED }}>
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <div className="flex items-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                data-testid={`dot-${i}`}
                className="rounded-full transition-all"
                style={{
                  width: i === current ? 22 : 7,
                  height: 7,
                  background: i === current ? C.primary : "rgba(255,255,255,0.2)",
                }}
              />
            ))}
          </div>
          <button onClick={() => go(1)} disabled={current === total - 1} data-testid="button-next" className="flex items-center gap-1.5 text-sm transition-opacity disabled:opacity-30" style={{ color: MUTED }}>
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* print version: all slides stacked */}
      <div className="deck-print">
        {slides.map((s, i) => (
          <div key={i} className="deck-print-slide">
            <div className="absolute top-6 left-10 z-10">
              <Meta index={i} total={total} tag={s.tag} />
            </div>
            <div className="h-full">{s.render()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
