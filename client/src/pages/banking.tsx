import { Link } from "wouter";
import { Landmark, ExternalLink } from "lucide-react";
import { TradeBankFrame } from "@/components/trade-bank-frame";

export default function Banking() {
  return (
    <div className="flex flex-col h-full min-h-0" data-testid="page-banking">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-background px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Landmark className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight truncate" data-testid="text-banking-title">
              Banking &amp; LC
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              Live trade-finance overview powered by Bullex Trade Bank
            </p>
          </div>
        </div>
        <Link
          href="/trade-bank"
          data-testid="link-open-trade-bank"
          className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-xs font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open Full Trade Bank
        </Link>
      </header>
      <div className="flex-1 min-h-0 bg-white">
        <TradeBankFrame className="w-full h-full border-0" />
      </div>
    </div>
  );
}
