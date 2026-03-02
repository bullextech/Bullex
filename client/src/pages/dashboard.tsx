import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Link2,
  Layers,
} from "lucide-react";
import type { Trade, Asset, Block } from "@shared/schema";

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  testId,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: any;
  trend?: "up" | "down" | "neutral";
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`${testId}-value`}>
          {value}
        </div>
        {subtitle && (
          <p
            className={`text-xs mt-1 flex items-center gap-1 ${
              trend === "up"
                ? "text-status-online"
                : trend === "down"
                ? "text-status-busy"
                : "text-muted-foreground"
            }`}
          >
            {trend === "up" && <ArrowUpRight className="w-3 h-3" />}
            {trend === "down" && <ArrowDownRight className="w-3 h-3" />}
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RecentTradeRow({ trade }: { trade: Trade }) {
  const isBuy = trade.type === "buy";

  return (
    <div
      className="flex items-center justify-between gap-2 py-3 border-b last:border-b-0"
      data-testid={`trade-row-${trade.id}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
            isBuy
              ? "bg-status-online/10 text-status-online"
              : "bg-status-busy/10 text-status-busy"
          }`}
        >
          {isBuy ? (
            <TrendingUp className="w-4 h-4" />
          ) : (
            <TrendingDown className="w-4 h-4" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {trade.assetSymbol}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {trade.assetName}
          </p>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-medium">
          ${trade.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </p>
        <p className="text-xs text-muted-foreground">
          {trade.quantity} @ ${trade.price.toLocaleString()}
        </p>
      </div>
      <Badge
        variant={isBuy ? "default" : "secondary"}
        className="flex-shrink-0 uppercase text-[10px]"
      >
        {trade.type}
      </Badge>
    </div>
  );
}

export default function Dashboard() {
  const { data: trades, isLoading: tradesLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });

  const { data: assets, isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });

  const { data: blocks, isLoading: blocksLoading } = useQuery<Block[]>({
    queryKey: ["/api/blocks"],
  });

  const isLoading = tradesLoading || assetsLoading || blocksLoading;

  const totalPortfolioValue = assets
    ? assets.reduce((sum, a) => sum + a.quantity * a.currentPrice, 0)
    : 0;

  const totalTrades = trades?.length || 0;
  const latestBlock = blocks && blocks.length > 0 ? blocks[0] : null;
  const totalVolume = trades
    ? trades.reduce((sum, t) => sum + t.total, 0)
    : 0;

  const recentTrades = trades?.slice(0, 5) || [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-md" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-[400px] rounded-md" />
          <Skeleton className="h-[400px] rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Your trade management overview with blockchain verification
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Portfolio Value"
          value={`$${totalPortfolioValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
          })}`}
          subtitle="Total holdings value"
          icon={DollarSign}
          trend="up"
          testId="stat-portfolio"
        />
        <StatCard
          title="Total Volume"
          value={`$${totalVolume.toLocaleString(undefined, {
            minimumFractionDigits: 2,
          })}`}
          subtitle="All-time trade volume"
          icon={BarChart3}
          trend="neutral"
          testId="stat-volume"
        />
        <StatCard
          title="Total Trades"
          value={totalTrades.toString()}
          subtitle={`${trades?.filter((t) => t.type === "buy").length || 0} buys, ${trades?.filter((t) => t.type === "sell").length || 0} sells`}
          icon={TrendingUp}
          trend="neutral"
          testId="stat-trades"
        />
        <StatCard
          title="Latest Block"
          value={latestBlock ? `#${latestBlock.blockNumber}` : "N/A"}
          subtitle={latestBlock ? `${latestBlock.tradeCount} txns verified` : "No blocks yet"}
          icon={Link2}
          trend="neutral"
          testId="stat-block"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-recent-trades">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
            <CardTitle className="text-base font-semibold">Recent Trades</CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              {recentTrades.length} latest
            </Badge>
          </CardHeader>
          <CardContent>
            {recentTrades.length > 0 ? (
              <div>
                {recentTrades.map((trade) => (
                  <RecentTradeRow key={trade.id} trade={trade} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <ArrowUpRight className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">No trades yet</p>
                <p className="text-xs">Start trading to see activity here</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-portfolio-overview">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
            <CardTitle className="text-base font-semibold">Portfolio Overview</CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              {assets?.length || 0} assets
            </Badge>
          </CardHeader>
          <CardContent>
            {assets && assets.length > 0 ? (
              <div className="space-y-3">
                {assets.map((asset) => {
                  const value = asset.quantity * asset.currentPrice;
                  const pnl =
                    (asset.currentPrice - asset.avgBuyPrice) * asset.quantity;
                  const pnlPercent =
                    asset.avgBuyPrice > 0
                      ? ((asset.currentPrice - asset.avgBuyPrice) /
                          asset.avgBuyPrice) *
                        100
                      : 0;
                  const isPositive = pnl >= 0;

                  return (
                    <div
                      key={asset.id}
                      className="flex items-center justify-between gap-2 py-3 border-b last:border-b-0"
                      data-testid={`asset-row-${asset.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-primary">
                            {asset.symbol.slice(0, 2)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{asset.symbol}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {asset.name}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-medium">
                          ${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                        <p
                          className={`text-xs flex items-center gap-0.5 justify-end ${
                            isPositive ? "text-status-online" : "text-status-busy"
                          }`}
                        >
                          {isPositive ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3" />
                          )}
                          {isPositive ? "+" : ""}
                          {pnlPercent.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Layers className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">No assets yet</p>
                <p className="text-xs">Your holdings will appear here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
