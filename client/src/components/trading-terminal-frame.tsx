import { useRef, useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useClientAuth } from "@/hooks/use-client-auth";
import type { TradeEnquiry } from "@shared/schema";

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
};
const avatarRole = (role: string) =>
  role === "admin" ? "Administrator" : role === "team" ? "Team Member" : "Participant";

const gradeFrom = (spec: string | null | undefined) => {
  const s = (spec || "").toLowerCase();
  if (s.includes("grade a") || s.includes("premium")) return "Grade A (Premium)";
  if (s.includes("grade b")) return "Grade B (Standard)";
  if (s.includes("organic") || s.includes("certified")) return "Certified";
  return "Standard";
};

interface TradingTerminalFrameProps {
  className?: string;
}

export function TradingTerminalFrame({ className }: TradingTerminalFrameProps) {
  const { authenticated, role, username, name } = useAuth();
  const client = useClientAuth();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  const user = useMemo(() => {
    if (authenticated && (role === "admin" || role === "team")) {
      const display = name || username || (role === "admin" ? "Admin" : "Team");
      return { name: display, role: avatarRole(role) };
    }
    if (client.authenticated) {
      const display = client.companyName || client.username || "Client";
      return { name: display, role: "Client" };
    }
    return null;
  }, [authenticated, role, username, name, client.authenticated, client.companyName, client.username]);

  // Live enquiries are admin/team-only server-side (/api/trade-enquiries is
  // requireModule("enquiries")). Client-portal users keep the demo book but
  // still get their name/role pushed via the `user` object below.
  const { data: enquiriesData } = useQuery<TradeEnquiry[]>({
    queryKey: ["/api/trade-enquiries"],
    enabled: authenticated,
  });

  const payload = useMemo(() => {
    if (!authenticated) return null;
    const E = enquiriesData ?? [];
    const myCompany = (client.companyName || name || username || "").trim().toLowerCase();

    const enquiries = E.filter(
      (e) => !["cancelled", "closed", "rejected", "withdrawn"].includes((e.status || "").toLowerCase()),
    ).map((e) => {
      const side = (e.side || "buy").toLowerCase() === "sell" ? "sell" : "buy";
      const participant =
        side === "sell"
          ? e.sellerName || e.producer || e.createdBy || "—"
          : e.buyerName || e.createdBy || "—";
      return {
        id: e.enquiryRef,
        side,
        commodity: e.product,
        volume: num(e.quantity),
        price: num(e.price),
        origin: e.origin || e.loadingPort || "—",
        destination: e.dischargePort || "—",
        grade: gradeFrom(e.specifications),
        incoterms: e.incoterms || "FOB",
        payment: e.paymentTerms || "Letter of Credit",
        participant,
        status: e.linkedTradeRef ? "matched" : "open",
        ts: +new Date(e.createdAt as unknown as string) || Date.now(),
        notes: e.additionalInfo || "",
        mine: !!(myCompany && String(participant).trim().toLowerCase() === myCompany),
      };
    });

    return { enquiries };
  }, [authenticated, enquiriesData, client.companyName, name, username]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      if (ev.data && ev.data.source === "bullex-iframe" && ev.data.ready) setReady(true);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    if (!ready || !iframeRef.current?.contentWindow) return;
    const msg: Record<string, unknown> = { ...(payload || {}), user: user ?? null };
    iframeRef.current.contentWindow.postMessage({ source: "bullex-parent", payload: msg }, "*");
  }, [ready, payload, user]);

  return (
    <iframe
      ref={iframeRef}
      src="/trading-terminal.html"
      title="Bullex Trading Terminal"
      className={className}
      sandbox="allow-scripts allow-popups allow-forms"
      referrerPolicy="no-referrer"
      onLoad={() => setReady(true)}
      data-testid="iframe-trading-terminal"
    />
  );
}
