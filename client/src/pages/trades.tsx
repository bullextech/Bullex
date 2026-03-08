import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { TradeEnquiry } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  CheckCircle2,
  Clock,
  Search,
  Shield,
  Hash,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  TrendingUp,
  Globe,
  FileText,
  Lock,
  Unlock,
  Handshake,
  Ship,
  CreditCard,
  FileCheck,
  ClipboardCheck,
  Circle,
  Upload,
  Download,
  Trash2,
  Loader2,
  Paperclip,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Trade, Block, TradeDocument, KycApplication } from "@shared/schema";

const stageDefinitions = [
  {
    key: "pre_deal",
    label: "Pre-Deal Stage",
    icon: ClipboardCheck,
    color: "text-sky-600",
    bgColor: "bg-sky-600",
    description: "Identification of participants, product details, pricing, and initial documentation.",
    documents: [
      { key: "kyc_registration", label: "KYC Registration", mandatory: true },
      { key: "loi", label: "Letter of Intent (LOI)", mandatory: false },
      { key: "fco", label: "Full Corporate Offer (FCO)", mandatory: false },
      { key: "icpo_deal_recap", label: "ICPO / Deal Recap", mandatory: true },
    ],
  },
  {
    key: "deal",
    label: "Deal Stage",
    icon: Handshake,
    color: "text-primary",
    bgColor: "bg-primary",
    description: "Confirmation of agreements, LC issuance, and performance guarantees.",
    documents: [
      { key: "spa", label: "Sale & Purchase Agreement (SPA)", mandatory: true },
      { key: "cpa", label: "Commission & Protection Agreement (CPA)", mandatory: false },
      { key: "lc_draft", label: "LC Draft Confirmation", mandatory: true },
      { key: "lc_copy", label: "LC Copy", mandatory: true },
      { key: "performance_guarantee", label: "Performance Guarantee", mandatory: false },
    ],
  },
  {
    key: "execution",
    label: "Execution Stage / Finance",
    icon: Ship,
    color: "text-orange-600",
    bgColor: "bg-orange-600",
    description: "Loading operations, quality/weight certification, shipping documents, and financial instruments.",
    documents: [
      { key: "analysis_agency", label: "Analysis Agency Appointment at Loading Port", mandatory: false },
      { key: "stevedoring_agency", label: "Stevedoring Agency at Loading Port", mandatory: false },
      { key: "daily_loading_report", label: "Daily Loading Report", mandatory: false },
      { key: "coa", label: "Certificate of Quality (COA)", mandatory: true },
      { key: "cow", label: "Certificate of Weight (COW)", mandatory: true },
      { key: "coo", label: "Certificate of Origin (COO)", mandatory: true },
      { key: "bl", label: "Bills of Lading (BL)", mandatory: true },
      { key: "beneficiary_cert", label: "Beneficiary Certificate", mandatory: true },
      { key: "certificate_insurance", label: "Certificate of Insurance", mandatory: false },
      { key: "sight_draft", label: "Sight Draft", mandatory: true },
      { key: "commercial_invoice", label: "Commercial Invoice", mandatory: true },
    ],
  },
  {
    key: "final_payment",
    label: "Final Payment",
    icon: CreditCard,
    color: "text-emerald-600",
    bgColor: "bg-emerald-600",
    description: "Discharge port certificates, final invoicing, and payment confirmation.",
    documents: [
      { key: "coa_disport", label: "COA at Discharge Port", mandatory: false },
      { key: "cow_disport", label: "COW at Discharge Port", mandatory: false },
      { key: "final_invoice", label: "Final Commercial Invoice", mandatory: false },
      { key: "copy_of_email", label: "Copy of Email to Buyer (if applicable)", mandatory: false },
    ],
  },
];

const statusFlow = stageDefinitions.map((s) => s.key);

const commodityCategories = [
  { value: "minerals", label: "Minerals", items: ["Iron Ore", "Bauxite", "Manganese"] },
  { value: "metals", label: "Metals", items: ["Copper Cathodes", "Aluminium Ingots"] },
  { value: "energy", label: "Energy Products", items: ["ULSD", "HSGO", "LPG"] },
  { value: "petrochemicals", label: "Petrochemicals", items: ["Bitumen", "Petcoke", "Sulphur"] },
  { value: "fertilizers", label: "Fertilizers", items: ["NPK"] },
];

function getStageLabel(status: string) {
  return stageDefinitions.find((s) => s.key === status)?.label || status;
}

export default function Trading() {
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showNewTrade, setShowNewTrade] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [enquiryPrefilled, setEnquiryPrefilled] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
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

  const urlParams = new URLSearchParams(window.location.search);
  const enquiryId = urlParams.get("enquiry");

  const { data: prefillEnquiry } = useQuery<TradeEnquiry>({
    queryKey: ["/api/trade-enquiries", enquiryId],
    queryFn: async () => {
      const res = await fetch(`/api/trade-enquiries/${enquiryId}`);
      if (!res.ok) throw new Error("Failed to fetch enquiry");
      return res.json();
    },
    enabled: !!enquiryId && !enquiryPrefilled,
  });

  useEffect(() => {
    if (prefillEnquiry && !enquiryPrefilled) {
      const product = prefillEnquiry.product.toUpperCase();
      let matchedCategory = "";
      let matchedCommodity = "";
      for (const cat of commodityCategories) {
        const found = cat.items.find((item) => product.includes(item.toUpperCase()));
        if (found) {
          matchedCategory = cat.value;
          matchedCommodity = found;
          break;
        }
      }
      setForm({
        commodityCategory: matchedCategory,
        commodity: matchedCommodity || prefillEnquiry.product,
        quantity: prefillEnquiry.quantity || "",
        unit: prefillEnquiry.unit || "MT",
        pricePerUnit: "",
        currency: "USD",
        buyerName: prefillEnquiry.side === "buy" ? (prefillEnquiry.createdBy || "") : "",
        sellerName: prefillEnquiry.side === "sell" ? (prefillEnquiry.createdBy || "") : "Bullfrog Group",
        origin: prefillEnquiry.loadingPort || "",
        destination: "",
        incoterm: prefillEnquiry.incoterms || "CIF",
      });
      setShowNewTrade(true);
      setEnquiryPrefilled(true);
      toast({ title: "Enquiry loaded", description: `Pre-filled from ${prefillEnquiry.enquiryRef}` });
    }
  }, [prefillEnquiry, enquiryPrefilled]);

  const { data: trades, isLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });

  const { data: blocks } = useQuery<Block[]>({
    queryKey: ["/api/blocks"],
  });

  const { data: kycApplications } = useQuery<KycApplication[]>({
    queryKey: ["/api/kyc"],
  });

  const approvedClients = kycApplications?.filter((a) => a.status === "approved") || [];

  const { data: tradeFiles } = useQuery<TradeDocument[]>({
    queryKey: ["/api/trades", expandedTrade, "files"],
    queryFn: async () => {
      if (!expandedTrade) return [];
      const res = await fetch(`/api/trades/${expandedTrade}/files`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!expandedTrade,
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
        commodityCategory: "", commodity: "", quantity: "", unit: "MT",
        pricePerUnit: "", currency: "USD", buyerName: "", sellerName: "Bullfrog Group",
        origin: "", destination: "", incoterm: "CIF",
      });
      toast({ title: "Pre-Deal Created", description: "Trade initiated at Pre-Deal stage. Complete mandatory documents and advance to Deal to record on blockchain." });
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
    onSuccess: (_data: any, variables: { id: string; status: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      if (variables.status === "deal") {
        toast({ title: "Registered on Chain", description: "Block mined and trade recorded on the Bullex blockchain. Advanced to Deal stage." });
      } else {
        toast({ title: "Stage Advanced", description: "Trade has progressed to the next stage." });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Advance Failed", description: error.message, variant: "destructive" });
    },
  });

  const toggleDocument = useMutation({
    mutationFn: async ({ id, docKey, checked }: { id: string; docKey: string; checked: boolean }) => {
      const res = await apiRequest("PATCH", `/api/trades/${id}/documents`, { docKey, checked });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
    },
    onError: (error: Error) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const uploadTradeDoc = useMutation({
    mutationFn: async ({ tradeId, documentKey, file }: { tradeId: string; documentKey: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentKey", documentKey);
      const res = await fetch(`/api/trades/${tradeId}/files/upload`, { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trades", expandedTrade, "files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trade-documents"] });
      toast({ title: "Document Uploaded", description: "File uploaded and document confirmed." });
    },
    onError: (error: Error) => {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    },
    onSettled: () => setUploadingKey(null),
  });

  const deleteTradeDoc = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/trade-documents/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trades", expandedTrade, "files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trade-documents"] });
      toast({ title: "Document Removed", description: "File deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
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
    createTrade.mutate({ ...form, quantity: qty, pricePerUnit: price, totalValue: qty * price });
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
  const activeTrades = trades?.filter((t) => t.status !== "final_payment").length || 0;
  const chainValid = blocks?.every((b) => b.verified) ?? true;

  function isStageMandatoryComplete(trade: Trade, stageKey: string): boolean {
    const stage = stageDefinitions.find((s) => s.key === stageKey);
    if (!stage) return false;
    const docs = (trade.stageDocuments as Record<string, boolean>) || {};
    return stage.documents.filter((d) => d.mandatory).every((d) => docs[d.key] === true);
  }

  function canAdvance(trade: Trade): boolean {
    const currentIdx = statusFlow.indexOf(trade.status);
    if (currentIdx >= statusFlow.length - 1) return false;
    return isStageMandatoryComplete(trade, trade.status);
  }

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
                Document-gated blockchain trading platform. Every stage requires mandatory documents to be confirmed before advancing — ensuring transparency, compliance, and immutable verification.
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-10">
          <h2 className="text-xl font-serif font-bold text-primary mb-4" data-testid="text-how-it-works">Document-Gated Blockchain</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-0">
            {stageDefinitions.map((stage, idx) => {
              const Icon = stage.icon;
              const mandatoryCount = stage.documents.filter((d) => d.mandatory).length;
              const totalDocs = stage.documents.length;
              return (
                <div key={stage.key} className="relative" data-testid={`stage-card-${stage.key}`}>
                  <div className={`p-5 border border-border bg-card h-full ${idx === 0 ? "" : "border-l-0"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-7 h-7 rounded-full ${stage.bgColor} text-white flex items-center justify-center text-xs font-bold`}>
                        {idx + 1}
                      </div>
                      <Icon className={`w-4 h-4 ${stage.color}`} />
                    </div>
                    <h3 className="text-sm font-bold text-foreground mb-1">{stage.label}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3">{stage.description}</p>
                    <div className="flex gap-2">
                      <Badge variant="secondary" className="text-[10px] rounded-none">{mandatoryCount} Mandatory</Badge>
                      <Badge variant="outline" className="text-[10px] rounded-none">{totalDocs - mandatoryCount} Optional</Badge>
                    </div>
                  </div>
                  {idx < stageDefinitions.length - 1 && (
                    <div className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10">
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-serif font-bold text-foreground" data-testid="text-trade-ledger">
              Trade Ledger
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              All trades are blockchain-verified with document-gated stage progression
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
              <SelectTrigger className="w-40 h-10 rounded-none border-border" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {stageDefinitions.map((s) => (
                  <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setShowNewTrade(!showNewTrade)} className="rounded-none h-10" data-testid="button-new-trade">
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
                    <Select value={form.commodityCategory} onValueChange={(v) => setForm({ ...form, commodityCategory: v, commodity: "" })}>
                      <SelectTrigger className="rounded-none h-11 border-border" data-testid="select-category"><SelectValue placeholder="Select category..." /></SelectTrigger>
                      <SelectContent>{commodityCategories.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Commodity *</label>
                    <Select value={form.commodity} onValueChange={(v) => setForm({ ...form, commodity: v })} disabled={!form.commodityCategory}>
                      <SelectTrigger className="rounded-none h-11 border-border" data-testid="select-commodity"><SelectValue placeholder="Select commodity..." /></SelectTrigger>
                      <SelectContent>{selectedCategory?.items.map((item) => (<SelectItem key={item} value={item}>{item}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Quantity *</label>
                    <Input type="number" step="any" placeholder="0" className="rounded-none h-11 border-border" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} data-testid="input-quantity" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Unit</label>
                    <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                      <SelectTrigger className="rounded-none h-11 border-border" data-testid="select-unit"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="MT">MT</SelectItem><SelectItem value="BBL">BBL</SelectItem><SelectItem value="KG">KG</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Price/Unit (USD) *</label>
                    <Input type="number" step="any" placeholder="0.00" className="rounded-none h-11 border-border" value={form.pricePerUnit} onChange={(e) => setForm({ ...form, pricePerUnit: e.target.value })} data-testid="input-price" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Buyer *</label>
                    <Select value={form.buyerName} onValueChange={(v) => setForm({ ...form, buyerName: v })}>
                      <SelectTrigger className="rounded-none h-11 border-border" data-testid="select-buyer"><SelectValue placeholder="Select buyer..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bullfrog Group">Bullfrog Group</SelectItem>
                        {approvedClients.map((client) => (
                          <SelectItem key={client.id} value={client.companyName}>{client.companyName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {approvedClients.length === 0 && (
                      <p className="text-[10px] text-muted-foreground">No approved KYC clients yet. Approve clients in Admin to add them here.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Seller</label>
                    <Select value={form.sellerName} onValueChange={(v) => setForm({ ...form, sellerName: v })}>
                      <SelectTrigger className="rounded-none h-11 border-border" data-testid="select-seller"><SelectValue placeholder="Select seller..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bullfrog Group">Bullfrog Group</SelectItem>
                        {approvedClients.map((client) => (
                          <SelectItem key={client.id} value={client.companyName}>{client.companyName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Origin *</label>
                    <Input placeholder="e.g., Guinea" className="rounded-none h-11 border-border" value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} data-testid="input-origin" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Destination *</label>
                    <Input placeholder="e.g., China" className="rounded-none h-11 border-border" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} data-testid="input-destination" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Incoterm</label>
                    <Select value={form.incoterm} onValueChange={(v) => setForm({ ...form, incoterm: v })}>
                      <SelectTrigger className="rounded-none h-11 border-border" data-testid="select-incoterm"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="CIF">CIF</SelectItem><SelectItem value="FOB">FOB</SelectItem><SelectItem value="CFR">CFR</SelectItem><SelectItem value="DAP">DAP</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Currency</label>
                    <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                      <SelectTrigger className="rounded-none h-11 border-border" data-testid="select-currency"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="GBP">GBP</SelectItem><SelectItem value="AED">AED</SelectItem></SelectContent>
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
                  {createTrade.isPending ? "Creating Pre-Deal..." : "Initiate Pre-Deal Trade"}
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
            <div className="col-span-2">Stage</div>
            <div className="col-span-1"></div>
          </div>

          {filteredTrades.length > 0 ? (
            filteredTrades.map((trade) => {
              const isExpanded = expandedTrade === trade.id;
              const currentStageIdx = statusFlow.indexOf(trade.status);
              const currentStage = stageDefinitions[currentStageIdx] || stageDefinitions[0];
              const StageIcon = currentStage.icon;
              const docs = (trade.stageDocuments as Record<string, boolean>) || {};

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
                    <div className="col-span-2 text-right font-mono text-sm font-bold">
                      {trade.currency} {trade.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div className="col-span-2">
                      <span className="text-sm">{trade.origin} <ArrowRight className="w-3 h-3 inline mx-1" /> {trade.destination}</span>
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center gap-1.5">
                        <StageIcon className={`w-3.5 h-3.5 ${currentStage.color}`} />
                        <span className={`text-xs font-bold ${currentStage.color}`}>{currentStage.label}</span>
                      </div>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border bg-muted/10" data-testid={`trade-detail-${trade.id}`}>
                      <div className="px-5 py-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div>
                          <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-4">Trade Details</h4>
                          <div className="space-y-2">
                            {[
                              ["Trade Reference", trade.tradeRef],
                              ["Commodity", `${trade.commodity} (${trade.commodityCategory})`],
                              ["Quantity", `${trade.quantity.toLocaleString()} ${trade.unit}`],
                              ["Price/Unit", `${trade.currency} ${trade.pricePerUnit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
                              ["Total Value", `${trade.currency} ${trade.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
                              ["Buyer", trade.buyerName],
                              ["Seller", trade.sellerName],
                              ["Route", `${trade.origin} → ${trade.destination}`],
                              ["Incoterm", trade.incoterm],
                            ].map(([label, value]) => (
                              <div key={label} className="flex justify-between py-1.5 border-b border-border/30 text-sm">
                                <span className="text-muted-foreground">{label}</span>
                                <span className={`font-medium ${label === "Total Value" ? "text-primary font-bold font-mono" : label === "Trade Reference" ? "font-mono font-bold" : ""}`}>{value}</span>
                              </div>
                            ))}
                          </div>

                          <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-3 mt-6">Blockchain Record</h4>
                          {trade.blockchainHash ? (
                            <div className="bg-primary/5 border border-primary/10 p-4 space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-xs text-muted-foreground uppercase">Block #</span>
                                <span className="font-mono font-bold">{trade.blockNumber}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-xs text-muted-foreground uppercase">Nonce</span>
                                <span className="font-mono">{trade.nonce}</span>
                              </div>
                              <div>
                                <span className="text-xs text-muted-foreground uppercase block mb-1">Trade Hash</span>
                                <span className="font-mono text-xs text-primary break-all">{trade.blockchainHash}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-muted/30 border border-border p-4 text-sm">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Clock className="w-4 h-4" />
                                <span>Pending — block will be mined when trade advances to Deal stage</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="lg:col-span-2">
                          <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-4">
                            Document-Gated Pipeline
                          </h4>

                          <div className="flex items-center gap-1 mb-6">
                            {stageDefinitions.map((stage, idx) => {
                              const isComplete = idx < currentStageIdx;
                              const isCurrent = idx === currentStageIdx;
                              return (
                                <div key={stage.key} className="flex items-center gap-1 flex-1">
                                  <div className={`flex-1 h-2 rounded-full ${isComplete ? stage.bgColor : isCurrent ? `${stage.bgColor}/40` : "bg-muted"}`} />
                                  {idx < stageDefinitions.length - 1 && <div className="w-1" />}
                                </div>
                              );
                            })}
                          </div>

                          <div className="space-y-4">
                            {stageDefinitions.map((stage, stageIdx) => {
                              const Icon = stage.icon;
                              const isComplete = stageIdx < currentStageIdx;
                              const isCurrent = stageIdx === currentStageIdx;
                              const isFuture = stageIdx > currentStageIdx;
                              const mandatoryDocs = stage.documents.filter((d) => d.mandatory);
                              const mandatoryComplete = mandatoryDocs.every((d) => docs[d.key] === true);
                              const completedDocs = stage.documents.filter((d) => docs[d.key] === true).length;

                              return (
                                <div
                                  key={stage.key}
                                  className={`border p-4 transition-all ${
                                    isCurrent
                                      ? "border-primary/30 bg-card"
                                      : isComplete
                                      ? "border-border bg-muted/20"
                                      : "border-border/40 bg-transparent opacity-50"
                                  }`}
                                  data-testid={`pipeline-stage-${stage.key}`}
                                >
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${isComplete ? "bg-emerald-600" : isCurrent ? stage.bgColor : "bg-muted-foreground/30"}`}>
                                        {isComplete ? <CheckCircle2 className="w-4 h-4" /> : stageIdx + 1}
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-bold">{stage.label}</span>
                                          {isCurrent && <Badge className="text-[10px] rounded-none">Current</Badge>}
                                          {isComplete && <Badge variant="secondary" className="text-[10px] rounded-none bg-emerald-600/10 text-emerald-700">Complete</Badge>}
                                        </div>
                                        <span className="text-xs text-muted-foreground">{completedDocs}/{stage.documents.length} documents confirmed</span>
                                      </div>
                                    </div>
                                    {isCurrent && (
                                      <div className="flex items-center gap-2">
                                        {mandatoryComplete ? (
                                          <Unlock className="w-4 h-4 text-emerald-600" />
                                        ) : (
                                          <Lock className="w-4 h-4 text-muted-foreground" />
                                        )}
                                        <Button
                                          size="sm"
                                          className="rounded-none text-xs h-8"
                                          disabled={!canAdvance(trade) || updateStatus.isPending}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const nextStatus = statusFlow[currentStageIdx + 1];
                                            if (nextStatus) updateStatus.mutate({ id: trade.id, status: nextStatus });
                                          }}
                                          data-testid={`button-advance-${trade.id}`}
                                        >
                                          {!mandatoryComplete
                                            ? "Mandatory Docs Required"
                                            : trade.status === "pre_deal"
                                            ? "Register on Chain & Advance"
                                            : "Advance to Next Stage"}
                                        </Button>
                                      </div>
                                    )}
                                  </div>

                                  <div className="space-y-1 mt-2">
                                    {stage.documents.map((doc) => {
                                      const isChecked = docs[doc.key] === true;
                                      const docFiles = tradeFiles?.filter((f) => f.documentKey === doc.key) || [];
                                      const isUploadingThis = uploadingKey === `${trade.id}-${doc.key}`;
                                      const refKey = `${trade.id}-${doc.key}`;
                                      return (
                                        <div key={doc.key} className="rounded border border-border/40 overflow-hidden" data-testid={`doc-${trade.id}-${doc.key}`}>
                                          <div className="flex items-center gap-2 p-2">
                                            <button
                                              type="button"
                                              className="flex-shrink-0"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                toggleDocument.mutate({ id: trade.id, docKey: doc.key, checked: !isChecked });
                                              }}
                                              data-testid={`checkbox-${trade.id}-${doc.key}`}
                                            >
                                              {isChecked ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                              ) : (
                                                <Circle className="w-4 h-4 text-muted-foreground/40" />
                                              )}
                                            </button>
                                            <span className={`text-xs flex-1 ${isChecked ? "text-foreground" : "text-muted-foreground"}`}>
                                              {doc.label}
                                            </span>
                                            {docFiles.length > 0 && (
                                              <Badge variant="secondary" className="text-[9px] rounded-none bg-emerald-600/10 text-emerald-700 px-1.5 py-0">
                                                <Paperclip className="w-2.5 h-2.5 mr-0.5" />
                                                {docFiles.length}
                                              </Badge>
                                            )}
                                            <Badge
                                              variant={doc.mandatory ? "default" : "outline"}
                                              className={`text-[9px] rounded-none px-1.5 py-0 ${
                                                doc.mandatory ? "bg-primary/10 text-primary border-primary/20" : ""
                                              }`}
                                            >
                                              {doc.mandatory ? "M" : "O"}
                                            </Badge>
                                            <input
                                              type="file"
                                              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                                              className="hidden"
                                              ref={(el) => { fileInputRefs.current[refKey] = el; }}
                                              onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                  setUploadingKey(refKey);
                                                  uploadTradeDoc.mutate({ tradeId: trade.id, documentKey: doc.key, file });
                                                }
                                                e.target.value = "";
                                              }}
                                              data-testid={`input-file-${trade.id}-${doc.key}`}
                                            />
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 px-2 text-[10px]"
                                              disabled={isUploadingThis}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                fileInputRefs.current[refKey]?.click();
                                              }}
                                              data-testid={`btn-upload-${trade.id}-${doc.key}`}
                                            >
                                              {isUploadingThis ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                              ) : (
                                                <><Upload className="w-3 h-3 mr-1" />Upload</>
                                              )}
                                            </Button>
                                          </div>
                                          {docFiles.length > 0 && (
                                            <div className="border-t border-border/30 bg-muted/20 px-2 py-1 space-y-0.5">
                                              {docFiles.map((f) => (
                                                <div key={f.id} className="flex items-center justify-between text-[10px] gap-1" data-testid={`trade-file-${f.id}`}>
                                                  <span className="text-muted-foreground truncate flex-1">
                                                    <Paperclip className="w-2.5 h-2.5 inline mr-1" />
                                                    {f.originalName} <span className="opacity-50">({(f.size / 1024).toFixed(0)} KB)</span>
                                                  </span>
                                                  <div className="flex items-center gap-0.5 flex-shrink-0">
                                                    <Button
                                                      type="button"
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-5 w-5 p-0"
                                                      onClick={(e) => { e.stopPropagation(); window.open(`/api/trade-documents/${f.id}/download`, "_blank"); }}
                                                      data-testid={`btn-download-trade-${f.id}`}
                                                    >
                                                      <Download className="w-2.5 h-2.5" />
                                                    </Button>
                                                    <Button
                                                      type="button"
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                                                      onClick={(e) => { e.stopPropagation(); deleteTradeDoc.mutate(f.id); }}
                                                      disabled={deleteTradeDoc.isPending}
                                                      data-testid={`btn-delete-trade-${f.id}`}
                                                    >
                                                      <Trash2 className="w-2.5 h-2.5" />
                                                    </Button>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
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
              <FileText className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm font-medium">No trades found</p>
              <p className="text-xs mt-1">
                {search || statusFilter !== "all" ? "Adjust your filters" : "Click 'New Trade' to execute your first trade"}
              </p>
            </div>
          )}
        </div>
      </div>

      <section className="py-16 lg:py-24 bg-muted/30 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-serif font-bold text-primary mb-4">Why Document-Gated Blockchain</h2>
            <div className="w-24 h-1 bg-primary mx-auto mb-6"></div>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Bullex enforces mandatory document compliance at every stage. No trade advances without verified documentation — ensuring institutional-grade integrity.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-card p-8 border border-border" data-testid="card-feature-gating">
              <Lock className="h-8 w-8 text-primary mb-4" />
              <h3 className="text-lg font-serif font-bold text-primary mb-3">Document Gating</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Each trade stage is locked until all mandatory documents are confirmed. KYC, SPA, LC, Bills of Lading, and Certificates of Quality/Weight gate progression through the deal lifecycle.
              </p>
            </div>
            <div className="bg-card p-8 border border-border" data-testid="card-feature-immutability">
              <Hash className="h-8 w-8 text-primary mb-4" />
              <h3 className="text-lg font-serif font-bold text-primary mb-3">Cryptographic Integrity</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Every trade block is SHA-256 hashed and chained to the previous record, creating a fully auditable and tamper-proof ledger visible to all counterparties.
              </p>
            </div>
            <div className="bg-card p-8 border border-border" data-testid="card-feature-transparency">
              <Globe className="h-8 w-8 text-primary mb-4" />
              <h3 className="text-lg font-serif font-bold text-primary mb-3">Full Transparency</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Complete visibility across Pre-Deal, Deal, Execution, and Final Payment stages. All counterparties see document status, trade data, and blockchain verification in real-time.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
