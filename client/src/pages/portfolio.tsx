import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  ArrowUpRight,
  ArrowDownRight,
  Briefcase,
  PieChart,
} from "lucide-react";
import type { Asset } from "@shared/schema";

export default function Portfolio() {
  const { data: assets, isLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });

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

  const totalValue = assets
    ? assets.reduce((sum, a) => sum + a.quantity * a.currentPrice, 0)
    : 0;
  const totalCost = assets
    ? assets.reduce((sum, a) => sum + a.quantity * a.avgBuyPrice, 0)
    : 0;
  const totalPnl = totalValue - totalCost;
  const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const isProfitable = totalPnl >= 0;

  const colors = [
    "bg-chart-1",
    "bg-chart-2",
    "bg-chart-3",
    "bg-chart-4",
    "bg-chart-5",
  ];

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-portfolio-title">
          Portfolio
        </h1>
        <p className="text-sm text-muted-foreground">
          Your asset holdings and performance
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card data-testid="stat-total-value">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground mb-1">Total Value</p>
            <p className="text-2xl font-bold">
              ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card data-testid="stat-total-cost">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground mb-1">Total Cost Basis</p>
            <p className="text-2xl font-bold">
              ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card data-testid="stat-total-pnl">
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground mb-1">Unrealized P&L</p>
            <div className="flex items-center gap-2">
              <p
                className={`text-2xl font-bold ${
                  isProfitable ? "text-status-online" : "text-status-busy"
                }`}
              >
                {isProfitable ? "+" : ""}$
                {Math.abs(totalPnl).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </p>
              <Badge
                variant={isProfitable ? "default" : "destructive"}
                className="text-[10px]"
              >
                {isProfitable ? "+" : ""}
                {totalPnlPercent.toFixed(2)}%
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {assets && assets.length > 0 ? (
        <>
          <Card data-testid="card-allocation">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
              <CardTitle className="text-base font-semibold">Allocation</CardTitle>
              <PieChart className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex rounded-md overflow-hidden h-3 mb-4">
                {assets.map((asset, i) => {
                  const pct =
                    totalValue > 0
                      ? ((asset.quantity * asset.currentPrice) / totalValue) * 100
                      : 0;
                  return (
                    <div
                      key={asset.id}
                      className={`${colors[i % colors.length]} transition-all`}
                      style={{ width: `${pct}%` }}
                      title={`${asset.symbol}: ${pct.toFixed(1)}%`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3">
                {assets.map((asset, i) => {
                  const pct =
                    totalValue > 0
                      ? ((asset.quantity * asset.currentPrice) / totalValue) * 100
                      : 0;
                  return (
                    <div key={asset.id} className="flex items-center gap-1.5 text-xs">
                      <div
                        className={`w-2.5 h-2.5 rounded-sm ${colors[i % colors.length]}`}
                      />
                      <span className="font-medium">{asset.symbol}</span>
                      <span className="text-muted-foreground">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-holdings">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Holdings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {assets.map((asset) => {
                const value = asset.quantity * asset.currentPrice;
                const cost = asset.quantity * asset.avgBuyPrice;
                const pnl = value - cost;
                const pnlPercent =
                  cost > 0 ? ((value - cost) / cost) * 100 : 0;
                const isPos = pnl >= 0;
                const allocation =
                  totalValue > 0 ? (value / totalValue) * 100 : 0;

                return (
                  <div
                    key={asset.id}
                    className="p-4 rounded-md border space-y-3"
                    data-testid={`holding-${asset.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-bold text-primary">
                            {asset.symbol.slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <p className="font-semibold">{asset.symbol}</p>
                          <p className="text-xs text-muted-foreground">
                            {asset.name}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          ${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                        <p
                          className={`text-xs flex items-center gap-0.5 justify-end ${
                            isPos ? "text-status-online" : "text-status-busy"
                          }`}
                        >
                          {isPos ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3" />
                          )}
                          {isPos ? "+" : ""}$
                          {Math.abs(pnl).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}{" "}
                          ({isPos ? "+" : ""}
                          {pnlPercent.toFixed(2)}%)
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-xs">
                      <div>
                        <p className="text-muted-foreground">Quantity</p>
                        <p className="font-medium font-mono">
                          {asset.quantity.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Avg Price</p>
                        <p className="font-medium font-mono">
                          ${asset.avgBuyPrice.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Current</p>
                        <p className="font-medium font-mono">
                          ${asset.currentPrice.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">24h Change</p>
                        <p
                          className={`font-medium font-mono ${
                            asset.change24h >= 0
                              ? "text-status-online"
                              : "text-status-busy"
                          }`}
                        >
                          {asset.change24h >= 0 ? "+" : ""}
                          {asset.change24h.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Allocation</span>
                        <span className="font-medium">{allocation.toFixed(1)}%</span>
                      </div>
                      <Progress value={allocation} className="h-1.5" />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Briefcase className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm font-medium">No assets in portfolio</p>
            <p className="text-xs">Execute trades to build your portfolio</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
