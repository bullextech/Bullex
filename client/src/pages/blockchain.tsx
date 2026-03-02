import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Link2,
  CheckCircle2,
  Shield,
  Hash,
  Clock,
  Layers,
  ArrowRight,
} from "lucide-react";
import type { Block, Trade } from "@shared/schema";

function BlockCard({ block, trades }: { block: Block; trades: Trade[] }) {
  const blockTrades = trades.filter((t) => t.blockNumber === block.blockNumber);
  const formattedDate = block.timestamp
    ? new Date(block.timestamp).toLocaleString()
    : "Unknown";

  return (
    <AccordionItem
      value={block.id}
      className="border rounded-md px-0 mb-3 last:mb-0"
      data-testid={`block-${block.blockNumber}`}
    >
      <AccordionTrigger className="px-4 py-3 [&[data-state=open]]:border-b">
        <div className="flex items-center gap-3 w-full pr-2">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">
                Block #{block.blockNumber}
              </span>
              {block.verified && (
                <Badge variant="default" className="text-[10px]">
                  <CheckCircle2 className="w-3 h-3 mr-0.5" />
                  Verified
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {block.tradeCount} transaction{block.tradeCount !== 1 ? "s" : ""}{" "}
              &middot; {formattedDate}
            </p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-3">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Hash className="w-3 h-3" /> Block Hash
              </p>
              <p className="font-mono text-xs break-all bg-muted p-2 rounded-md">
                {block.hash}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ArrowRight className="w-3 h-3" /> Previous Hash
              </p>
              <p className="font-mono text-xs break-all bg-muted p-2 rounded-md">
                {block.previousHash}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Nonce</p>
              <p className="font-mono font-medium">{block.nonce}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Timestamp</p>
              <p className="font-medium">{formattedDate}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Transactions</p>
              <p className="font-medium">{block.tradeCount}</p>
            </div>
          </div>

          {blockTrades.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2">Transactions in Block</p>
              <div className="space-y-2">
                {blockTrades.map((trade) => (
                  <div
                    key={trade.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-md bg-muted text-xs"
                    data-testid={`block-trade-${trade.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={trade.type === "buy" ? "default" : "secondary"}
                        className="text-[10px] uppercase"
                      >
                        {trade.type}
                      </Badge>
                      <span className="font-medium">{trade.assetSymbol}</span>
                      <span className="text-muted-foreground">
                        {trade.quantity} @ ${trade.price.toLocaleString()}
                      </span>
                    </div>
                    <span className="font-mono font-medium">
                      ${trade.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export default function Blockchain() {
  const { data: blocks, isLoading: blocksLoading } = useQuery<Block[]>({
    queryKey: ["/api/blocks"],
  });

  const { data: trades, isLoading: tradesLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });

  const isLoading = blocksLoading || tradesLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-md" />
      </div>
    );
  }

  const totalBlocks = blocks?.length || 0;
  const totalTransactions = blocks
    ? blocks.reduce((sum, b) => sum + b.tradeCount, 0)
    : 0;
  const verifiedBlocks = blocks?.filter((b) => b.verified).length || 0;

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-blockchain-title">
          Blockchain Ledger
        </h1>
        <p className="text-sm text-muted-foreground">
          Immutable record of all verified transactions
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card data-testid="stat-total-blocks">
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <Layers className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Blocks</p>
              <p className="text-xl font-bold">{totalBlocks}</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-total-transactions">
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-chart-2/10 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-chart-2" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Transactions</p>
              <p className="text-xl font-bold">{totalTransactions}</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-verified">
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-status-online/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-status-online" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Verified</p>
              <p className="text-xl font-bold">
                {totalBlocks > 0
                  ? `${((verifiedBlocks / totalBlocks) * 100).toFixed(0)}%`
                  : "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-blockchain">
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Block Explorer
          </CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            {totalBlocks} blocks
          </Badge>
        </CardHeader>
        <CardContent>
          {blocks && blocks.length > 0 ? (
            <Accordion type="single" collapsible>
              {blocks.map((block) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  trades={trades || []}
                />
              ))}
            </Accordion>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Link2 className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm font-medium">No blocks mined yet</p>
              <p className="text-xs">Execute trades to generate blockchain blocks</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
