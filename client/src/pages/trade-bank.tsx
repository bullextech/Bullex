import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useRef, useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import type {
  Trade,
  KycApplication,
  Document as DocRow,
  Notification as AppNotification,
} from "@shared/schema";

const TERMINAL = ["final_payment", "cancelled", "closed", "completed", "rejected"];

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
};
const money = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${Math.round(n)}`;
const initials = (name: string) =>
  (name || "").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "—";
const titleCase = (s: string) =>
  (s || "").replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (d: unknown) => {
  const dt = new Date(d as string);
  return isNaN(dt.getTime()) ? "" : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtTime = (d: unknown) => {
  const dt = new Date(d as string);
  if (isNaN(dt.getTime())) return "";
  const t = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return dt.toDateString() === new Date().toDateString()
    ? `${t} today`
    : `${dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · ${t}`;
};

const tradeBadge = (s: string) => {
  const k = (s || "").toLowerCase();
  if (["final_payment", "completed", "closed"].includes(k)) return { cls: "approved", label: "Completed" };
  if (k === "execution") return { cls: "processing", label: "Execution" };
  if (k === "deal") return { cls: "processing", label: "Deal" };
  if (k === "pre_deal") return { cls: "review", label: "Pre-Deal" };
  if (["cancelled", "rejected"].includes(k)) return { cls: "risk", label: titleCase(k) };
  return { cls: "pending", label: titleCase(s) || "—" };
};

const docBadge = (d: DocRow) => {
  const s = (d.status || "").toLowerCase();
  if (d.buyerSignedAt || s === "signed" || s === "completed") return { cls: "approved", label: "Signed" };
  if (s === "draft") return { cls: "review", label: "Draft" };
  if (s.includes("sent")) return { cls: "processing", label: "Sent" };
  if (s.includes("reject")) return { cls: "risk", label: "Rejected" };
  if (s.includes("accept") || s.includes("verif")) return { cls: "approved", label: titleCase(s) };
  return { cls: "pending", label: titleCase(d.status || "") || "—" };
};

const notifSev = (sev: string) => {
  const s = (sev || "info").toLowerCase();
  if (["error", "critical", "danger"].includes(s))
    return { dot: "var(--coral)", iconBg: "var(--coral-bg)", iconColor: "var(--coral)", faIcon: "fa-triangle-exclamation" };
  if (["warning", "warn"].includes(s))
    return { dot: "var(--amber)", iconBg: "var(--amber-bg)", iconColor: "var(--amber)", faIcon: "fa-clock" };
  if (s === "success")
    return { dot: "var(--teal)", iconBg: "var(--teal-bg)", iconColor: "var(--teal)", faIcon: "fa-circle-check" };
  return { dot: "var(--blue)", iconBg: "var(--blue-bg)", iconColor: "var(--blue)", faIcon: "fa-bell" };
};

const roleGroup = (cat: string) => {
  const c = (cat || "").toLowerCase();
  if (c.includes("producer")) return "producer";
  if (c.includes("analysis")) return "qa";
  if (c.includes("chartering") || c.includes("broker")) return "broker";
  if (
    c.includes("port") || c.includes("shipping") || c.includes("ship owner") ||
    c.includes("clearing") || c.includes("stevedoring") || c.includes("logistic")
  )
    return "logistics";
  if (c.includes("buyer") || c.includes("seller") || c.includes("trader")) return "trader";
  return "trader";
};

export default function TradeBank() {
  const { authenticated, role } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  const { data: trades } = useQuery<Trade[]>({ queryKey: ["/api/trades"], enabled: authenticated });
  const { data: kyc } = useQuery<KycApplication[]>({ queryKey: ["/api/kyc"], enabled: authenticated });
  const { data: docs } = useQuery<DocRow[]>({ queryKey: ["/api/documents"], enabled: authenticated });
  const { data: notifs } = useQuery<AppNotification[]>({
    queryKey: ["/api/notifications"],
    enabled: authenticated && role === "admin",
  });

  const payload = useMemo(() => {
    if (!authenticated) return null;
    const T = trades ?? [];
    const K = kyc ?? [];
    const D = docs ?? [];

    const financeVolume = T.reduce((a, t) => a + num(t.totalValue), 0);
    const activeTrades = T.filter((t) => !TERMINAL.includes((t.status || "").toLowerCase())).length;
    const approved = K.filter((k) => (k.status || "").toLowerCase() === "approved");
    const approvalRate = K.length ? Math.round((approved.length / K.length) * 100) : 0;
    const riskWords = ["flag", "hit", "match", "potential", "review", "fail", "positive"];
    const atRisk = K.filter((k) =>
      [k.amlStatus, k.ofacStatus, k.unSanctionsStatus, k.pepStatus].some(
        (s) => s && riskWords.some((w) => String(s).toLowerCase().includes(w)),
      ),
    ).length;

    const byDate = <X extends { createdAt?: unknown }>(a: X, b: X) =>
      +new Date(b.createdAt as string) - +new Date(a.createdAt as string);

    const recentTrades = [...T].sort(byDate).slice(0, 6).map((t) => {
      const b = tradeBadge(t.status || "");
      return {
        ref: t.tradeRef,
        comm: `${t.commodity} — ${t.origin || "?"} → ${t.destination || "?"}`,
        amt: money(num(t.totalValue)),
        badge: b.cls,
        status: b.label,
      };
    });

    const matchTrades = (name: string) =>
      T.filter((t) =>
        [t.buyerName, t.sellerName].some((n) => (n || "").trim().toLowerCase() === (name || "").trim().toLowerCase()),
      );
    const participants = approved.map((k) => {
      const mt = matchTrades(k.companyName);
      const active = mt.filter((t) => !TERMINAL.includes((t.status || "").toLowerCase())).length;
      return {
        name: k.companyName,
        initials: initials(k.companyName),
        role: k.category || "Participant",
        roleGroup: roleGroup(k.category || ""),
        country: k.countryOfOperation || k.countryOfIncorporation || "—",
        rating: "—",
        active,
        completed: mt.length - active,
        status: "Active",
      };
    });

    const counts = { trader: 0, producer: 0, logistics: 0, broker: 0, qa: 0, collateral: 0 };
    approved.forEach((k) => {
      const g = roleGroup(k.category || "") as keyof typeof counts;
      if (g in counts) counts[g]++;
    });

    const documents = [...D].sort(byDate).slice(0, 8).map((d) => {
      const ext = d.pdfPath ? "PDF" : d.docxPath ? "DOCX" : "—";
      const icon = ext === "PDF" ? { c: "pdf", i: "fa-file-pdf" } : { c: "txt", i: "fa-file-lines" };
      const b = docBadge(d);
      return {
        name: d.title || `${d.tradeRef || ""} — ${titleCase(d.docType || "")}`.trim(),
        ref: d.tradeRef || d.enquiryRef || "—",
        ext,
        date: fmtDate(d.createdAt),
        iconClass: icon.c,
        faIcon: icon.i,
        badge: b.cls,
        status: b.label,
      };
    });

    let notifications: any[] | undefined;
    if (role === "admin" && notifs) {
      notifications = notifs.slice(0, 12).map((n) => {
        const sev = notifSev(n.severity || "");
        return {
          title: n.title,
          body: n.message,
          time: fmtTime(n.createdAt),
          source: n.module ? titleCase(n.module) : titleCase(n.type || ""),
          dot: sev.dot,
          iconBg: sev.iconBg,
          iconColor: sev.iconColor,
          faIcon: sev.faIcon,
          unread: !n.isRead,
        };
      });
    }

    return {
      kpis: { financeVolume: money(financeVolume), activeTrades, approvalRate: `${approvalRate}%`, atRisk },
      recentTrades,
      participants,
      counts,
      documents,
      notifications,
      totals: {
        trades: T.length,
        participants: participants.length,
        unread: notifications ? notifications.filter((x: any) => x.unread).length : undefined,
      },
    };
  }, [authenticated, role, trades, kyc, docs, notifs]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      // Only trust the handshake if it originates from our own iframe window.
      if (ev.source !== iframeRef.current?.contentWindow) return;
      if (ev.data && ev.data.source === "bullex-iframe" && ev.data.ready) setReady(true);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    if (ready && payload && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ source: "bullex-parent", payload }, "*");
    }
  }, [ready, payload]);

  return (
    <div className="fixed inset-0 w-screen h-screen bg-white" data-testid="page-trade-bank">
      <iframe
        ref={iframeRef}
        src="/trade-bank.html"
        title="Bullex Trade Bank"
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-popups allow-forms"
        referrerPolicy="no-referrer"
        onLoad={() => setReady(true)}
        data-testid="iframe-trade-bank"
      />
      <Link
        href="/"
        data-testid="link-trade-bank-back"
        className="fixed bottom-4 right-4 z-[200] flex items-center gap-2 rounded-full bg-[#990000] text-white px-4 py-2.5 text-xs font-medium shadow-lg hover:bg-[#6b0000] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Bullex
      </Link>
    </div>
  );
}
