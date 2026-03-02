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
  Link2,
  CheckCircle2,
  Clock,
  Search,
  Ship,
  FileCheck,
  Shield,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Trade } from "@shared/schema";

const commodityCategories = [
  { value: "minerals", label: "Minerals", items: ["Iron Ore", "Bauxite", "Manganese"] },
  { value: "metals", label: "Metals", items: ["Copper Cathodes", "Aluminium Ingots"] },
  { value: "energy", label: "Energy Products", items: ["ULSD", "HSGO", "LPG"] },
  { value: "petrochemicals", label: "Petrochemicals", items: ["Bitumen", "Petcoke", "Sulphur"] },
  { value: "fertilizers", label: "Fertilizers", items: ["NPK"] },
];

const statusConfig: Record<string, { icon: any; color: string }> = {
  initiated: { icon: Clock, color: "text-status-away" },
  lc_issued: { icon: FileCheck, color: "text-chart-2" },
  in_transit: { icon: Ship, color: "text-chart-1" },
  completed: { icon: CheckCircle2, color: "text-status-online" },
};

const statusLabel = (s: string) =>
  s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

export default function Trading() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();

  const [form, setForm] = useState({
    commodityCategory: "",
    commodity: "",
    quantity: "",
    unit: "MT",
    pricePerUnit: "",
    currency: "USD",
    buyerName: "",
    sellerName: "",
    origin: "",
    destination: "",
    incoterm: "CIF",
  });

  const { data: trades, isLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });

  const createTrade = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/trades", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setOpen(false);
      setForm({
        commodityCategory: "",
        commodity: "",
        quantity: "",
        unit: "MT",
        pricePerUnit: "",
        currency: "USD",
        buyerName: "",
        sellerName: "",
        origin: "",
        destination: "",
        incoterm: "CIF",
      });
      toast({
        title: "Trade Executed",
        description: "Trade recorded and verified on the Bullex blockchain.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Trade Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(form.quantity);
    const price = parseFloat(form.pricePerUnit);
    if (!form.commodity || !form.commodityCategory || isNaN(qty) || isNaN(price) ||
        !form.buyerName || !form.sellerName || !form.origin || !form.destination) {
      toast({ title: "Invalid Input", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    createTrade.mutate({
      ...form,
      quantity: qty,
      pricePerUnit: price,
      totalValue: qty * price,
    });
  };

  const selectedCategory = commodityCategories.find((c) => c.value === form.commodityCategory);

  const filteredTrades = trades
    ?.filter((t) => statusFilter === "all" || t.status === statusFilter)
    .filter((t) =>
      t.tradeRef.toLowerCase().includes(search.toLowerCase()) ||
      t.commodity.toLowerCase().includes(search.toLowerCase()) ||
      t.buyerName.toLowerCase().includes(search.toLowerCase())
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
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-trading-title">
            Blockchain Trading
          </h1>
          <p className="text-sm text-muted-foreground">
            Execute and manage commodity trades with blockchain verification
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-trade">
              <Plus className="w-4 h-4 mr-2" />
              New Trade
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Execute New Trade
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select
                    value={form.commodityCategory}
                    onValueChange={(v) => setForm({ ...form, commodityCategory: v, commodity: "" })}
                  >
                    <SelectTrigger data-testid="select-category">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {commodityCategories.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Commodity *</Label>
                  <Select
                    value={form.commodity}
                    onValueChange={(v) => setForm({ ...form, commodity: v })}
                    disabled={!form.commodityCategory}
                  >
                    <SelectTrigger data-testid="select-commodity">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedCategory?.items.map((item) => (
                        <SelectItem key={item} value={item}>{item}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="0"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    data-testid="input-quantity"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                    <SelectTrigger data-testid="select-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MT">MT</SelectItem>
                      <SelectItem value="BBL">BBL</SelectItem>
                      <SelectItem value="KG">KG</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Price/Unit *</Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={form.pricePerUnit}
                    onChange={(e) => setForm({ ...form, pricePerUnit: e.target.value })}
                    data-testid="input-price"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Buyer *</Label>
                  <Input
                    placeholder="Buyer company"
                    value={form.buyerName}
                    onChange={(e) => setForm({ ...form, buyerName: e.target.value })}
                    data-testid="input-buyer"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Seller *</Label>
                  <Input
                    placeholder="Seller company"
                    value={form.sellerName}
                    onChange={(e) => setForm({ ...form, sellerName: e.target.value })}
                    data-testid="input-seller"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Origin *</Label>
                  <Input
                    placeholder="e.g., Guinea"
                    value={form.origin}
                    onChange={(e) => setForm({ ...form, origin: e.target.value })}
                    data-testid="input-origin"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Destination *</Label>
                  <Input
                    placeholder="e.g., China"
                    value={form.destination}
                    onChange={(e) => setForm({ ...form, destination: e.target.value })}
                    data-testid="input-destination"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Incoterm</Label>
                  <Select value={form.incoterm} onValueChange={(v) => setForm({ ...form, incoterm: v })}>
                    <SelectTrigger data-testid="select-incoterm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CIF">CIF</SelectItem>
                      <SelectItem value="FOB">FOB</SelectItem>
                      <SelectItem value="CFR">CFR</SelectItem>
                      <SelectItem value="DAP">DAP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger data-testid="select-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="AED">AED</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.quantity && form.pricePerUnit && (
                <div className="p-3 rounded-md bg-muted text-sm flex items-center justify-between">
                  <span className="text-muted-foreground">Total Value</span>
                  <span className="font-mono font-semibold">
                    {form.currency} {(parseFloat(form.quantity || "0") * parseFloat(form.pricePerUnit || "0")).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={createTrade.isPending} data-testid="button-submit-trade">
                {createTrade.isPending ? "Mining Block..." : "Execute & Record on Chain"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card data-testid="card-trades-table">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base font-semibold">Trade Ledger</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="pl-8 w-44"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-trades"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="initiated">Initiated</SelectItem>
                <SelectItem value="lc_issued">LC Issued</SelectItem>
                <SelectItem value="in_transit">In Transit</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTrades.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trade Ref</TableHead>
                    <TableHead>Commodity</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Block</TableHead>
                    <TableHead>Hash</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTrades.map((trade) => {
                    const sc = statusConfig[trade.status] || statusConfig.initiated;
                    const StatusIcon = sc.icon;
                    return (
                      <TableRow key={trade.id} data-testid={`trade-row-${trade.id}`}>
                        <TableCell>
                          <span className="font-mono text-sm font-medium">{trade.tradeRef}</span>
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="text-sm">{trade.commodity}</span>
                            <span className="text-xs text-muted-foreground ml-1.5">
                              ({trade.commodityCategory})
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {trade.quantity.toLocaleString()} {trade.unit}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">
                          {trade.currency} {trade.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">{trade.origin} → {trade.destination}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <StatusIcon className={`w-3.5 h-3.5 ${sc.color}`} />
                            <span className="text-xs">{statusLabel(trade.status)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {trade.blockNumber ? (
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              #{trade.blockNumber}
                            </Badge>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          {trade.blockchainHash ? (
                            <div className="flex items-center gap-1">
                              <Link2 className="w-3 h-3 text-muted-foreground" />
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {trade.blockchainHash.slice(0, 8)}...
                              </span>
                            </div>
                          ) : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Link2 className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm font-medium">No trades found</p>
              <p className="text-xs">
                {search || statusFilter !== "all" ? "Adjust your filters" : "Click 'New Trade' to execute your first trade"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
