import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { TradingTerminalFrame } from "@/components/trading-terminal-frame";

export default function TradingTerminal() {
  return (
    <div className="fixed inset-0 w-screen h-screen bg-[#0B0E11]" data-testid="page-trading-terminal">
      <TradingTerminalFrame className="w-full h-full border-0" />
      <Link
        href="/trading"
        data-testid="link-trading-terminal-back"
        className="fixed bottom-4 right-4 z-[200] flex items-center gap-2 rounded-full bg-[#990000] text-white px-4 py-2.5 text-xs font-medium shadow-lg hover:bg-[#6b0000] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Bullex
      </Link>
    </div>
  );
}
