import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Link2,
  CheckCircle2,
  Clock,
  Search,
  Ship,
  FileCheck,
  Shield,
  Layers,
  Hash,
  ChevronDown,
  ChevronUp,
  MapPin,
  Building2,
  Mail,
  ArrowRight,
  Boxes,
  TrendingUp,
  Globe,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Trade, Block } from "@shared/schema";

const commodityCategories = [
  { value: "minerals", label: "Minerals", items: ["Iron Ore", "Bauxite", "Manganese"] },
  { value: "metals", label: "Metals", items: ["Copper Cathodes", "Aluminium Ingots"] },
  { value: "energy", label: "Energy Products", items: ["ULSD", "HSGO", "LPG"] },
  { value: "petrochemicals", label: "Petrochemicals", items: ["Bitumen", "Petcoke", "Sulphur"] },
  { value: "fertilizers", label: "Fertilizers", items: ["NPK"] },
];

const statusConfig: Record<string, { icon: any; color: string; label: string }> = {
  initiated: { icon: Clock, color: "text-orange-500", label: "Initiated" },
  lc_issued: { icon: FileCheck, color: "text-sky-500", label: "LC Issued" },
  in_transit: { icon: Ship, color: "text-blue-600", label: "In Transit" },
  completed: { icon: CheckCircle2, color: "text-emerald-500", label: "Completed" },
};

const statusFlow = ["initiated", "lc_issued", "in_transit", "completed"];

export default function Trading() {
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showNewTrade, setShowNewTrade] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({
    commodityCategory: "",
    commodity: "",
    quantity: "",
    unit: "MT",
    pricePerUnit: "",
    currency: "USD",
    buyerName: "",
    sellerName: "Bullfrog Group",
    origin: "",
    destination: "",
    incoterm: "CIF",
  });

  const [supplyForm, setSupplyForm] = useState({
    companyName: "",
    email: "",
    commodity: "",
    message: "",
  });

  const { data: trades, isLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });

  const { data: blocks } = useQuery<Block[]>({
    queryKey: ["/api/blocks"],
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
      setShowNewTrade(false);
      setForm({
        commodityCategory: "",
        commodity: "",
        quantity: "",
        unit: "MT",
        pricePerUnit: "",
        currency: "USD",
        buyerName: "",
        sellerName: "Bullfrog Group",
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

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/trades/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      toast({ title: "Status Updated", description: "Trade status has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
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

  const handleSupplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplyForm.companyName || !supplyForm.email || !supplyForm.commodity || !supplyForm.message) {
      toast({ title: "Missing Fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    toast({
      title: "Inquiry Submitted",
      description: "A member of our trading desk will contact you shortly.",
    });
    setSupplyForm({ companyName: "", email: "", commodity: "", message: "" });
  };

  const selectedCategory = commodityCategories.find((c) => c.value === form.commodityCategory);

  const filteredTrades = trades
    ?.filter((t) => statusFilter === "all" || t.status === statusFilter)
    .filter((t) =>
      t.tradeRef.toLowerCase().includes(search.toLowerCase()) ||
      t.commodity.toLowerCase().includes(search.toLowerCase()) ||
      t.buyerName.toLowerCase().includes(search.toLowerCase())
    ) || [];

  const totalBlocks = blocks?.length || 0;
  const totalTrades = trades?.length || 0;
  const activeTrades = trades?.filter((t) => t.status !== "completed").length || 0;
  const chainValid = blocks?.every((b) => b.verified) ?? true;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-32 rounded-md" />
        <Skeleton className="h-[500px] rounded-md" />
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      <div className="bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-white/10 rounded" data-testid="icon-blockchain-trading">
                  <Shield className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-white/60">Bullex Platform</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-serif font-bold mb-4" data-testid="text-trading-title">
                Blockchain Trading
              </h1>
              <p className="text-white/70 text-lg leading-relaxed">
                Execute and manage commodity trades with real-time blockchain verification. Every transaction is cryptographically hashed and immutably recorded on the Bullex chain.
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
              <div className="bg-white/5 border border-white/10 p-4 rounded text-center" data-testid="stat-total-blocks">
                <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Total Blocks</div>
                <div className="text-2xl font-bold">{totalBlocks}</div>
              </div>
              <div className="bg-white/5 border border-white/10 p-4 rounded text-center" data-testid="stat-transactions">
                <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Transactions</div>
                <div className="text-2xl font-bold">{totalTrades}</div>
              </div>
              <div className="bg-white/5 border border-white/10 p-4 rounded text-center" data-testid="stat-chain-integrity">
                <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Chain Integrity</div>
                <div className={`text-2xl font-bold ${chainValid ? "text-emerald-400" : "text-red-400"}`}>
                  {chainValid ? "Valid" : "Invalid"}
                </div>
              </div>
              <div className="bg-white/5 border border-white/10 p-4 rounded text-center" data-testid="stat-active-trades">
                <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Active Trades</div>
                <div className="text-2xl font-bold">{activeTrades}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-serif font-bold text-foreground" data-testid="text-trade-ledger">
              Trade Ledger
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              All trades are blockchain-verified and immutably recorded
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search trades..."
                className="pl-8 w-52 h-10 rounded-none border-border"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-trades"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-10 rounded-none border-border" data-testid="select-status-filter">
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
            <Button
              onClick={() => setShowNewTrade(!showNewTrade)}
              className="rounded-none h-10"
              data-testid="button-new-trade"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Trade
            </Button>
          </div>
        </div>

        {showNewTrade && (
          <Card className="mb-8 border-primary/20 rounded-none" data-testid="card-new-trade-form">
            <CardContent className="p-6 lg:p-8">
              <div className="flex items-center gap-3 mb-6">
                <Shield className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-serif font-bold text-primary">Execute New Trade</h3>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Category *</label>
                    <Select
                      value={form.commodityCategory}
                      onValueChange={(v) => setForm({ ...form, commodityCategory: v, commodity: "" })}
                    >
                      <SelectTrigger className="rounded-none h-11 border-border" data-testid="select-category">
                        <SelectValue placeholder="Select category..." />
                      </SelectTrigger>
                      <SelectContent>
                        {commodityCategories.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Commodity *</label>
                    <Select
                      value={form.commodity}
                      onValueChange={(v) => setForm({ ...form, commodity: v })}
                      disabled={!form.commodityCategory}
                    >
                      <SelectTrigger className="rounded-none h-11 border-border" data-testid="select-commodity">
                        <SelectValue placeholder="Select commodity..." />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedCategory?.items.map((item) => (
                          <SelectItem key={item} value={item}>{item}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Quantity *</label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="0"
                      className="rounded-none h-11 border-border"
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                      data-testid="input-quantity"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Unit</label>
                    <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                      <SelectTrigger className="rounded-none h-11 border-border" data-testid="select-unit">
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
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Price/Unit (USD) *</label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      className="rounded-none h-11 border-border"
                      value={form.pricePerUnit}
                      onChange={(e) => setForm({ ...form, pricePerUnit: e.target.value })}
                      data-testid="input-price"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Buyer *</label>
                    <Input
                      placeholder="Buyer company"
                      className="rounded-none h-11 border-border"
                      value={form.buyerName}
                      onChange={(e) => setForm({ ...form, buyerName: e.target.value })}
                      data-testid="input-buyer"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Seller</label>
                    <Input
                      placeholder="Seller company"
                      className="rounded-none h-11 border-border"
                      value={form.sellerName}
                      onChange={(e) => setForm({ ...form, sellerName: e.target.value })}
                      data-testid="input-seller"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Origin *</label>
                    <Input
                      placeholder="e.g., Guinea"
                      className="rounded-none h-11 border-border"
                      value={form.origin}
                      onChange={(e) => setForm({ ...form, origin: e.target.value })}
                      data-testid="input-origin"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Destination *</label>
                    <Input
                      placeholder="e.g., China"
                      className="rounded-none h-11 border-border"
                      value={form.destination}
                      onChange={(e) => setForm({ ...form, destination: e.target.value })}
                      data-testid="input-destination"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Incoterm</label>
                    <Select value={form.incoterm} onValueChange={(v) => setForm({ ...form, incoterm: v })}>
                      <SelectTrigger className="rounded-none h-11 border-border" data-testid="select-incoterm">
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
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Currency</label>
                    <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                      <SelectTrigger className="rounded-none h-11 border-border" data-testid="select-currency">
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
                  <div className="p-4 bg-primary/5 border border-primary/10 flex items-center justify-between" data-testid="text-total-value">
                    <span className="text-sm text-muted-foreground font-bold uppercase tracking-wider">Total Value</span>
                    <span className="font-mono font-bold text-lg text-primary">
                      {form.currency} {(parseFloat(form.quantity || "0") * parseFloat(form.pricePerUnit || "0")).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                <Button type="submit" className="w-full rounded-none h-12 text-sm font-bold uppercase tracking-wider" disabled={createTrade.isPending} data-testid="button-submit-trade">
                  {createTrade.isPending ? "Mining Block..." : "Execute & Record on Chain"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="space-y-0 border border-border" data-testid="card-trades-table">
          <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-muted/50 border-b border-border text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <div className="col-span-2">Trade Ref</div>
            <div className="col-span-2">Commodity</div>
            <div className="col-span-1 text-right">Qty</div>
            <div className="col-span-2 text-right">Value</div>
            <div className="col-span-2">Route</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1">Block</div>
            <div className="col-span-1"></div>
          </div>

          {filteredTrades.length > 0 ? (
            filteredTrades.map((trade) => {
              const sc = statusConfig[trade.status] || statusConfig.initiated;
              const StatusIcon = sc.icon;
              const isExpanded = expandedTrade === trade.id;
              const currentStatusIdx = statusFlow.indexOf(trade.status);

              return (
                <div key={trade.id} className="border-b border-border last:border-b-0" data-testid={`trade-row-${trade.id}`}>
                  <button
                    className="w-full grid grid-cols-12 gap-2 px-5 py-4 items-center hover:bg-muted/30 transition-colors text-left"
                    onClick={() => setExpandedTrade(isExpanded ? null : trade.id)}
                    data-testid={`button-expand-trade-${trade.id}`}
                  >
                    <div className="col-span-2">
                      <span className="font-mono text-sm font-bold text-primary">{trade.tradeRef}</span>
                    </div>
                    <div className="col-span-2">
                      <div className="text-sm font-medium">{trade.commodity}</div>
                      <div className="text-xs text-muted-foreground">{trade.commodityCategory}</div>
                    </div>
                    <div className="col-span-1 text-right font-mono text-sm">
                      {trade.quantity.toLocaleString()} {trade.unit}
                    </div>
                    <div className="col-span-2 text-right">
                      <div className="font-mono text-sm font-bold">
                        {trade.currency} {trade.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-sm">{trade.origin} <ArrowRight className="w-3 h-3 inline mx-1" /> {trade.destination}</span>
                    </div>
                    <div className="col-span-1">
                      <div className="flex items-center gap-1.5">
                        <StatusIcon className={`w-3.5 h-3.5 ${sc.color}`} />
                        <span className="text-xs font-bold uppercase">{sc.label}</span>
                      </div>
                    </div>
                    <div className="col-span-1">
                      {trade.blockNumber ? (
                        <Badge variant="secondary" className="font-mono text-xs rounded-none">
                          #{trade.blockNumber}
                        </Badge>
                      ) : "-"}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border bg-muted/20 px-5 py-6" data-testid={`trade-detail-${trade.id}`}>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                          <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-4">Trade Details</h4>
                          <div className="space-y-3">
                            <div className="flex justify-between py-2 border-b border-border/50">
                              <span className="text-sm text-muted-foreground">Trade Reference</span>
                              <span className="font-mono text-sm font-bold">{trade.tradeRef}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                              <span className="text-sm text-muted-foreground">Commodity</span>
                              <span className="text-sm font-medium">{trade.commodity} ({trade.commodityCategory})</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                              <span className="text-sm text-muted-foreground">Quantity</span>
                              <span className="font-mono text-sm">{trade.quantity.toLocaleString()} {trade.unit}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                              <span className="text-sm text-muted-foreground">Price Per Unit</span>
                              <span className="font-mono text-sm">{trade.currency} {trade.pricePerUnit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                              <span className="text-sm text-muted-foreground">Total Value</span>
                              <span className="font-mono text-sm font-bold text-primary">
                                {trade.currency} {trade.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                              <span className="text-sm text-muted-foreground">Buyer</span>
                              <span className="text-sm font-medium">{trade.buyerName}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                              <span className="text-sm text-muted-foreground">Seller</span>
                              <span className="text-sm font-medium">{trade.sellerName}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                              <span className="text-sm text-muted-foreground">Route</span>
                              <span className="text-sm">{trade.origin} → {trade.destination}</span>
                            </div>
                            <div className="flex justify-between py-2">
                              <span className="text-sm text-muted-foreground">Incoterm</span>
                              <span className="text-sm font-bold">{trade.incoterm}</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-4">Blockchain Record</h4>
                          <div className="bg-primary/5 border border-primary/10 p-4 space-y-3 mb-6">
                            <div className="flex justify-between">
                              <span className="text-xs text-muted-foreground uppercase tracking-wider">Block #</span>
                              <span className="font-mono text-sm font-bold">{trade.blockNumber || "Pending"}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-xs text-muted-foreground uppercase tracking-wider">Nonce</span>
                              <span className="font-mono text-sm">{trade.nonce || "-"}</span>
                            </div>
                            {trade.blockchainHash && (
                              <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Trade Hash</span>
                                <span className="font-mono text-xs text-primary break-all">{trade.blockchainHash}</span>
                              </div>
                            )}
                            {trade.previousHash && (
                              <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Previous Hash</span>
                                <span className="font-mono text-xs text-muted-foreground break-all">{trade.previousHash}</span>
                              </div>
                            )}
                          </div>

                          <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-4">Status Pipeline</h4>
                          <div className="space-y-2">
                            {statusFlow.map((s, idx) => {
                              const cfg = statusConfig[s];
                              const Icon = cfg.icon;
                              const isActive = idx <= currentStatusIdx;
                              const isCurrent = s === trade.status;
                              const isNext = idx === currentStatusIdx + 1;

                              return (
                                <div
                                  key={s}
                                  className={`flex items-center justify-between p-3 border transition-colors ${
                                    isCurrent ? "border-primary/30 bg-primary/5" : isActive ? "border-border bg-muted/30" : "border-border/50 bg-transparent"
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <Icon className={`w-4 h-4 ${isActive ? cfg.color : "text-muted-foreground/30"}`} />
                                    <span className={`text-sm font-medium ${isActive ? "" : "text-muted-foreground/50"}`}>
                                      {cfg.label}
                                    </span>
                                    {isCurrent && (
                                      <Badge variant="secondary" className="text-[10px] rounded-none">Current</Badge>
                                    )}
                                  </div>
                                  {isNext && trade.status !== "completed" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs rounded-none h-7"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateStatus.mutate({ id: trade.id, status: s });
                                      }}
                                      disabled={updateStatus.isPending}
                                      data-testid={`button-advance-${trade.id}-${s}`}
                                    >
                                      Advance
                                    </Button>
                                  )}
                                  {isActive && !isCurrent && (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Layers className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm font-medium">No trades found</p>
              <p className="text-xs mt-1">
                {search || statusFilter !== "all" ? "Adjust your filters" : "Click 'New Trade' to execute your first trade"}
              </p>
            </div>
          )}
        </div>
      </div>

      <section className="bg-primary text-white" data-testid="section-initiate-trade">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="p-10 lg:p-16 flex flex-col justify-center">
              <h2 className="text-3xl font-serif font-bold mb-4">Initiate Trade</h2>
              <div className="w-24 h-1 bg-white/30 mb-8"></div>
              <p className="text-white/80 text-lg leading-relaxed mb-12">
                Submit your commodity requirements directly to our trading desk. Our specialists will review your inquiry and respond with indicative pricing and availability within 24 hours.
              </p>
              <div className="space-y-8">
                <div className="flex items-center gap-4">
                  <div className="bg-white/10 p-3 rounded-sm">
                    <MapPin className="h-6 w-6 text-white/80" />
                  </div>
                  <div>
                    <div className="font-bold text-sm uppercase tracking-wider mb-1">Headquarters</div>
                    <div className="text-white/70 text-sm">Dubai, United Arab Emirates</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="bg-white/10 p-3 rounded-sm">
                    <Mail className="h-6 w-6 text-white/80" />
                  </div>
                  <div>
                    <div className="font-bold text-sm uppercase tracking-wider mb-1">Direct Desk</div>
                    <div className="text-white/70 text-sm">trade@bullex.tech</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-10 lg:p-16 bg-card text-foreground border-l border-border">
              <h3 className="text-2xl font-serif font-bold text-primary mb-8">Request Supply</h3>
              <form onSubmit={handleSupplySubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Company Name *</label>
                    <Input
                      className="border-border rounded-none h-12 focus-visible:ring-primary"
                      placeholder="Corporate Entity"
                      value={supplyForm.companyName}
                      onChange={(e) => setSupplyForm({ ...supplyForm, companyName: e.target.value })}
                      data-testid="supply-input-company"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Contact Email *</label>
                    <Input
                      type="email"
                      className="border-border rounded-none h-12 focus-visible:ring-primary"
                      placeholder="email@company.com"
                      value={supplyForm.email}
                      onChange={(e) => setSupplyForm({ ...supplyForm, email: e.target.value })}
                      data-testid="supply-input-email"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-primary">Commodity Category *</label>
                  <select
                    className="flex h-12 w-full border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-none"
                    value={supplyForm.commodity}
                    onChange={(e) => setSupplyForm({ ...supplyForm, commodity: e.target.value })}
                    data-testid="supply-select-commodity"
                  >
                    <option value="">Select category...</option>
                    <option value="minerals">Minerals (Iron Ore, Bauxite, Manganese)</option>
                    <option value="metals">Metals (Copper, Aluminium)</option>
                    <option value="energy">Energy Products (ULSD, HSGO, LPG)</option>
                    <option value="petchem">Petrochemicals (Bitumen, Petcoke, Sulphur)</option>
                    <option value="fertilizers">Fertilizers (NPK)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-primary">Target Specifications & Volume</label>
                  <Textarea
                    className="border-border rounded-none min-h-[120px] resize-none focus-visible:ring-primary"
                    placeholder="Please include target volume, destination port (CIF/FOB), and specific grades required."
                    value={supplyForm.message}
                    onChange={(e) => setSupplyForm({ ...supplyForm, message: e.target.value })}
                    data-testid="supply-input-specs"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full rounded-none h-12 text-sm font-bold uppercase tracking-wider"
                  data-testid="button-submit-supply"
                >
                  Submit to Trading Desk
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  By submitting this inquiry, you confirm your authority to initiate trade dialogue on behalf of your organization.
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-muted/30 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-serif font-bold text-primary mb-4">
              Why Blockchain Trading
            </h2>
            <div className="w-24 h-1 bg-primary mx-auto mb-6"></div>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Every trade on Bullex is powered by our proprietary blockchain, ensuring institutional-grade transparency and immutability.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-card p-8 border border-border" data-testid="card-feature-immutability">
              <Hash className="h-8 w-8 text-primary mb-4" />
              <h3 className="text-lg font-serif font-bold text-primary mb-3">Cryptographic Integrity</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Every trade block is SHA-256 hashed and chained to the previous record, creating a fully auditable and tamper-proof ledger visible to all counterparties.
              </p>
            </div>
            <div className="bg-card p-8 border border-border" data-testid="card-feature-efficiency">
              <TrendingUp className="h-8 w-8 text-primary mb-4" />
              <h3 className="text-lg font-serif font-bold text-primary mb-3">Operational Efficiency</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Automated block mining, trade reference generation, and real-time status tracking eliminate manual processes and accelerate settlement cycles.
              </p>
            </div>
            <div className="bg-card p-8 border border-border" data-testid="card-feature-transparency">
              <Globe className="h-8 w-8 text-primary mb-4" />
              <h3 className="text-lg font-serif font-bold text-primary mb-3">Data Transparency</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Cryptographic verification ensures that trade data — quantities, values, counterparties, and shipping details — cannot be altered once recorded on the chain.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
