import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function TradeBank() {
  return (
    <div className="fixed inset-0 w-screen h-screen bg-white" data-testid="page-trade-bank">
      <iframe
        src="/trade-bank.html"
        title="Bullex Trade Bank"
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-popups allow-forms"
        referrerPolicy="no-referrer"
        data-testid="iframe-trade-bank"
      />
      <Link
        href="/"
        data-testid="link-trade-bank-back"
        className="fixed bottom-4 right-4 z-[200] flex items-center gap-2 rounded-full bg-[#1A1916] text-[#E6B84A] px-4 py-2.5 text-xs font-medium shadow-lg hover:bg-[#2e2c28] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Bullex
      </Link>
    </div>
  );
}
