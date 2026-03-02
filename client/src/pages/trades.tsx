import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Link2,
  CheckCircle2,
  Clock,
  Search,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Trade } from "@shared/schema";

export default function Trades() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "buy" | "sell">("all");
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    assetSymbol: "",
    assetName: "",
    type: "buy" as "buy" | "sell",
    quantity: "",
    price: "",
  });

  const { data: trades, isLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });

  const createTrade = useMutation({
    mutationFn: async (data: {
      assetSymbol: string;
      assetName: string;
      type: "buy" | "sell";
      quantity: number;
      price: number;
      total: number;
    }) => {
      const res = await apiRequest("POST", "/api/trades", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      setOpen(false);
      setFormData({
        assetSymbol: "",
        assetName: "",
        type: "buy",
        quantity: "",
        price: "",
      });
      toast({
        title: "Trade Executed",
        description: "Your trade has been recorded and verified on the blockchain.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Trade Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(formData.quantity);
    const price = parseFloat(formData.price);
    if (!formData.assetSymbol || !formData.assetName || isNaN(qty) || isNaN(price)) {
      toast({
        title: "Invalid Input",
        description: "Please fill in all fields with valid values.",
        variant: "destructive",
      });
      return;
    }
    createTrade.mutate({
      assetSymbol: formData.assetSymbol.toUpperCase(),
      assetName: formData.assetName,
      type: formData.type,
      quantity: qty,
      price: price,
      total: qty * price,
    });
  };

  const filteredTrades = trades
    ?.filter((t) => filter === "all" || t.type === filter)
    .filter(
      (t) =>
        t.assetSymbol.toLowerCase().includes(search.toLowerCase()) ||
        t.assetName.toLowerCase().includes(search.toLowerCase())
    ) || [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[500px] rounded-md" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-trades-title">
            Trades
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage and track all your trading activity
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-trade">
              <Plus className="w-4 h-4 mr-2" />
              New Trade
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Execute New Trade</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="symbol">Symbol</Label>
                  <Input
                    id="symbol"
                    placeholder="BTC"
                    value={formData.assetSymbol}
                    onChange={(e) =>
                      setFormData({ ...formData, assetSymbol: e.target.value })
                    }
                    data-testid="input-symbol"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Asset Name</Label>
                  <Input
                    id="name"
                    placeholder="Bitcoin"
                    value={formData.assetName}
                    onChange={(e) =>
                      setFormData({ ...formData, assetName: e.target.value })
                    }
                    data-testid="input-asset-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) =>
                    setFormData({ ...formData, type: v as "buy" | "sell" })
                  }
                >
                  <SelectTrigger data-testid="select-trade-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({ ...formData, quantity: e.target.value })
                    }
                    data-testid="input-quantity"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">Price ($)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
                    }
                    data-testid="input-price"
                  />
                </div>
              </div>
              {formData.quantity && formData.price && (
                <div className="p-3 rounded-md bg-muted text-sm">
                  <span className="text-muted-foreground">Total: </span>
                  <span className="font-semibold">
                    $
                    {(
                      parseFloat(formData.quantity || "0") *
                      parseFloat(formData.price || "0")
                    ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={createTrade.isPending}
                data-testid="button-submit-trade"
              >
                {createTrade.isPending ? "Processing..." : "Execute Trade"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card data-testid="card-trades-table">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base font-semibold">Trade History</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search trades..."
                className="pl-8 w-48"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-trades"
              />
            </div>
            <div className="flex items-center gap-1">
              {(["all", "buy", "sell"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "secondary"}
                  onClick={() => setFilter(f)}
                  data-testid={`button-filter-${f}`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTrades.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Asset</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Block</TableHead>
                    <TableHead>Hash</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTrades.map((trade) => (
                    <TableRow key={trade.id} data-testid={`trade-table-row-${trade.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {trade.type === "buy" ? (
                            <TrendingUp className="w-3.5 h-3.5 text-status-online" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5 text-status-busy" />
                          )}
                          <Badge
                            variant={trade.type === "buy" ? "default" : "secondary"}
                            className="uppercase text-[10px]"
                          >
                            {trade.type}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium text-sm">{trade.assetSymbol}</span>
                          <span className="text-muted-foreground text-xs ml-1.5">
                            {trade.assetName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {trade.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        ${trade.price.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">
                        ${trade.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {trade.status === "confirmed" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-status-online" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-status-away" />
                          )}
                          <span className="text-xs capitalize">{trade.status}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {trade.blockNumber ? (
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            #{trade.blockNumber}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {trade.blockchainHash ? (
                          <div className="flex items-center gap-1">
                            <Link2 className="w-3 h-3 text-muted-foreground" />
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {trade.blockchainHash.slice(0, 10)}...
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <TrendingUp className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm font-medium">No trades found</p>
              <p className="text-xs">
                {search || filter !== "all"
                  ? "Try adjusting your filters"
                  : "Click 'New Trade' to get started"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
