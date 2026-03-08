import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  FileText,
  Download,
  ChevronDown,
  ChevronRight,
  Package,
  TrendingUp,
  Globe,
  DollarSign,
  Ship,
  LogOut,
  User,
  SearchCheck,
  Scale,
  MapPin,
  Clock,
  Info,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useClientAuth } from "@/hooks/use-client-auth";
import ClientLogin from "./client-login";

interface Trade {
  id: string;
  tradeRef: string;
  commodity: string;
  commodityCategory: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  totalValue: number;
  currency: string;
  buyerName: string;
  sellerName: string;
  origin: string;
  destination: string;
  incoterm: string;
  status: string;
  blockchainHash: string | null;
  createdAt: string;
}

interface TradeDocument {
  id: string;
  tradeId: string;
  documentKey: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

interface ClientEnquiry {
  id: string;
  enquiryRef: string;
  side: string;
  product: string;
  specifications: string | null;
  producer: string | null;
  quantity: string | null;
  unit: string | null;
  loadingPort: string | null;
  incoterms: string | null;
  validity: string | null;
  additionalInfo: string | null;
  status: string;
  clientResponse: string | null;
  clientRespondedBy: string | null;
  clientRespondedAt: string | null;
  createdAt: string;
}

interface KycData {
  companyName: string;
  registeredAddress: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  category: string | null;
  products: string | null;
  status: string;
  clientUsername: string | null;
}

const statusColors: Record<string, string> = {
  pre_deal: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  deal: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  execution: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  final_payment: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const statusLabels: Record<string, string> = {
  pre_deal: "Pre-Deal",
  deal: "Deal",
  execution: "Execution",
  final_payment: "Final Payment",
  completed: "Completed",
};

const docKeyLabels: Record<string, string> = {
  kyc_registration: "KYC Registration",
  loi: "Letter of Intent",
  fco: "Full Corporate Offer",
  icpo_deal_recap: "ICPO / Deal Recap",
  spa: "Sale & Purchase Agreement",
  cpa: "Commission Payment Agreement",
  lc_draft: "LC Draft",
  lc_copy: "LC Copy",
  performance_guarantee: "Performance Guarantee",
  analysis_agency: "Analysis Agency",
  stevedoring_agency: "Stevedoring Agency",
  daily_loading_report: "Daily Loading Report",
  coa: "Certificate of Analysis",
  cow: "Certificate of Weight",
  coo: "Certificate of Origin",
  bl: "Bill of Lading",
  beneficiary_cert: "Beneficiary Certificate",
  certificate_insurance: "Certificate of Insurance",
  sight_draft: "Sight Draft",
  commercial_invoice: "Commercial Invoice",
  coa_disport: "COA (Discharge Port)",
  cow_disport: "COW (Discharge Port)",
  final_invoice: "Final Invoice",
  copy_of_email: "Copy of Email",
};

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TradeCard({ trade }: { trade: Trade }) {
  const [expanded, setExpanded] = useState(false);

  const { data: documents, isLoading: docsLoading } = useQuery<TradeDocument[]>({
    queryKey: ["/api/client/trades", trade.id, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/client/trades/${trade.id}/documents`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: expanded,
  });

  return (
    <Card className="border" data-testid={`card-client-trade-${trade.id}`}>
      <CardContent className="p-0">
        <button
          className="w-full p-5 text-left flex items-center justify-between hover:bg-muted/30 transition-colors"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-expand-trade-${trade.id}`}
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm" data-testid={`text-trade-ref-${trade.id}`}>{trade.tradeRef}</span>
                <Badge variant="outline" className={`text-[10px] ${statusColors[trade.status] || ""}`} data-testid={`badge-trade-status-${trade.id}`}>
                  {statusLabels[trade.status] || trade.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {trade.commodity} ({trade.commodityCategory}) — {trade.quantity.toLocaleString()} {trade.unit}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold" data-testid={`text-trade-value-${trade.id}`}>{formatCurrency(trade.totalValue, trade.currency)}</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(trade.pricePerUnit, trade.currency)}/{trade.unit}</p>
            </div>
            {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {expanded && (
          <div className="border-t px-5 pb-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
              <div className="flex items-start gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Buyer</p>
                  <p className="text-xs font-medium">{trade.buyerName}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Seller</p>
                  <p className="text-xs font-medium">{trade.sellerName}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Globe className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Route</p>
                  <p className="text-xs font-medium">{trade.origin} → {trade.destination}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Ship className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Incoterm</p>
                  <p className="text-xs font-medium">{trade.incoterm}</p>
                </div>
              </div>
            </div>

            {trade.blockchainHash && (
              <div className="bg-muted/30 border rounded-md p-3 mb-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Blockchain Hash</p>
                <p className="text-xs font-mono break-all" data-testid={`text-trade-hash-${trade.id}`}>{trade.blockchainHash}</p>
              </div>
            )}

            <div className="mt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" />
                Trade Documents
              </h4>
              {docsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : documents && documents.length > 0 ? (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/20 transition-colors"
                      data-testid={`row-doc-${doc.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{docKeyLabels[doc.documentKey] || doc.documentKey}</p>
                          <p className="text-[10px] text-muted-foreground">{doc.originalName} — {formatFileSize(doc.size)}</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs flex-shrink-0"
                        onClick={() => {
                          window.open(`/api/client/trade-documents/${doc.id}/download`, "_blank");
                        }}
                        data-testid={`button-download-doc-${doc.id}`}
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Download
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No documents uploaded for this trade yet.</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const enquiryStatusColors: Record<string, string> = {
  open: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  under_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  quoted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const enquiryStatusLabels: Record<string, string> = {
  open: "Open",
  under_review: "Under Review",
  quoted: "Quoted",
  closed: "Closed",
  cancelled: "Cancelled",
};

function EnquiryCard({ enquiry }: { enquiry: ClientEnquiry }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const created = new Date(enquiry.createdAt).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });

  const respondMutation = useMutation({
    mutationFn: async (response: string) => {
      const res = await apiRequest("POST", `/api/client/enquiries/${enquiry.id}/respond`, { response });
      return res.json();
    },
    onSuccess: (_data, response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/enquiries"] });
      toast({ title: response === "accepted" ? "Enquiry accepted" : "Enquiry rejected" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to respond", description: err.message, variant: "destructive" });
    },
  });

  const hasResponded = !!enquiry.clientResponse;
  const respondedAt = enquiry.clientRespondedAt
    ? new Date(enquiry.clientRespondedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  return (
    <Card className="border" data-testid={`card-client-enquiry-${enquiry.id}`}>
      <CardContent className="p-0">
        <button
          className="w-full p-5 text-left flex items-center justify-between hover:bg-muted/30 transition-colors"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-expand-enquiry-${enquiry.id}`}
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <SearchCheck className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  className={`text-[10px] font-bold ${enquiry.side === "sell" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}
                >
                  {enquiry.side === "sell" ? "SELL" : "BUY"}
                </Badge>
                <span className="font-bold text-sm">{enquiry.enquiryRef}</span>
                <Badge variant="outline" className={`text-[10px] ${enquiryStatusColors[enquiry.status] || ""}`}>
                  {enquiryStatusLabels[enquiry.status] || enquiry.status}
                </Badge>
                {hasResponded && (
                  <Badge
                    className={`text-[10px] font-bold ${enquiry.clientResponse === "accepted" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}
                    data-testid={`badge-response-${enquiry.id}`}
                  >
                    {enquiry.clientResponse === "accepted" ? "ACCEPTED" : "REJECTED"}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {enquiry.product}
                {enquiry.quantity && ` — ${enquiry.quantity} ${enquiry.unit || "MT"}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:block">{created}</span>
            {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {expanded && (
          <div className="border-t px-5 pb-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-4 text-sm">
              <div className="flex items-start gap-2">
                <Package className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Product</p>
                  <p className="text-xs font-medium">{enquiry.product}</p>
                </div>
              </div>
              {enquiry.producer && (
                <div className="flex items-start gap-2">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Producer</p>
                    <p className="text-xs font-medium">{enquiry.producer}</p>
                  </div>
                </div>
              )}
              {enquiry.quantity && (
                <div className="flex items-start gap-2">
                  <Scale className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Quantity</p>
                    <p className="text-xs font-medium">{enquiry.quantity} {enquiry.unit || "MT"}</p>
                  </div>
                </div>
              )}
              {enquiry.loadingPort && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Loading Port</p>
                    <p className="text-xs font-medium">{enquiry.loadingPort}</p>
                  </div>
                </div>
              )}
              {enquiry.incoterms && (
                <div className="flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Incoterms</p>
                    <p className="text-xs font-medium">{enquiry.incoterms}</p>
                  </div>
                </div>
              )}
              {enquiry.validity && (
                <div className="flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Validity</p>
                    <p className="text-xs font-medium">{enquiry.validity}</p>
                  </div>
                </div>
              )}
            </div>

            {enquiry.specifications && (
              <div className="bg-muted/30 border rounded-md p-3 mb-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Specifications</p>
                <p className="text-xs whitespace-pre-wrap">{enquiry.specifications}</p>
              </div>
            )}

            {enquiry.additionalInfo && (
              <div className="bg-muted/30 border rounded-md p-3 mb-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Additional Information</p>
                <p className="text-xs whitespace-pre-wrap">{enquiry.additionalInfo}</p>
              </div>
            )}

            <div className="border-t pt-4 mt-2">
              {hasResponded ? (
                <div className={`flex items-center gap-3 p-3 rounded-md ${enquiry.clientResponse === "accepted" ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"}`}>
                  {enquiry.clientResponse === "accepted" ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  )}
                  <div>
                    <p className={`text-sm font-semibold ${enquiry.clientResponse === "accepted" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                      {enquiry.clientResponse === "accepted" ? "Enquiry Accepted" : "Enquiry Rejected"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      by {enquiry.clientRespondedBy}{respondedAt && ` on ${respondedAt}`}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-muted-foreground flex-1">Respond to this enquiry:</p>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={(e) => { e.stopPropagation(); respondMutation.mutate("accepted"); }}
                    disabled={respondMutation.isPending}
                    data-testid={`button-accept-enquiry-${enquiry.id}`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={(e) => { e.stopPropagation(); respondMutation.mutate("rejected"); }}
                    disabled={respondMutation.isPending}
                    data-testid={`button-reject-enquiry-${enquiry.id}`}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ClientPortal() {
  const { authenticated, loading, username, companyName, logout } = useClientAuth();

  const { data: trades, isLoading: tradesLoading } = useQuery<Trade[]>({
    queryKey: ["/api/client/trades"],
    queryFn: async () => {
      const res = await fetch("/api/client/trades");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: authenticated,
  });

  const { data: kycData } = useQuery<KycData>({
    queryKey: ["/api/client/kyc"],
    queryFn: async () => {
      const res = await fetch("/api/client/kyc");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: authenticated,
  });

  const { data: enquiries, isLoading: enquiriesLoading } = useQuery<ClientEnquiry[]>({
    queryKey: ["/api/client/enquiries"],
    queryFn: async () => {
      const res = await fetch("/api/client/enquiries", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: authenticated,
  });

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!authenticated) {
    return <ClientLogin />;
  }

  const activeTrades = trades?.filter((t) => t.status !== "completed") || [];
  const completedTrades = trades?.filter((t) => t.status === "completed") || [];
  const totalValue = trades?.reduce((sum, t) => sum + t.totalValue, 0) || 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="bg-primary text-primary-foreground px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight" data-testid="text-client-portal-title">Client Portal</h1>
              <p className="text-primary-foreground/70 text-sm mt-1">Welcome back, {companyName}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs text-primary-foreground/60">Signed in as</p>
                <p className="text-sm font-medium flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {username}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                onClick={logout}
                data-testid="button-client-logout"
              >
                <LogOut className="w-3.5 h-3.5 mr-1" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 -mt-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="border" data-testid="card-stat-total-trades">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Trades</p>
                  <p className="text-xl font-bold">{trades?.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border" data-testid="card-stat-active-trades">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active Trades</p>
                  <p className="text-xl font-bold">{activeTrades.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border" data-testid="card-stat-trade-volume">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Trade Volume</p>
                  <p className="text-xl font-bold">{formatCurrency(totalValue, "USD")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {kycData && (
          <Card className="border mb-8" data-testid="card-company-info">
            <CardContent className="p-5">
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Company Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Company Name</p>
                  <p className="font-medium">{kycData.companyName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Category</p>
                  <p className="font-medium">{kycData.category || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Products</p>
                  <p className="font-medium">{kycData.products || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Contact</p>
                  <p className="font-medium">{kycData.contactName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Email</p>
                  <p className="font-medium">{kycData.contactEmail}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Phone</p>
                  <p className="font-medium">{kycData.contactPhone}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mb-8">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground mb-4" data-testid="text-trades-heading">
            Your Trades
          </h3>
          {tradesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : trades && trades.length > 0 ? (
            <div className="space-y-3">
              {trades.map((trade) => (
                <TradeCard key={trade.id} trade={trade} />
              ))}
            </div>
          ) : (
            <Card className="border">
              <CardContent className="p-8 text-center">
                <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No trades found for your organisation yet.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Contact <a href="mailto:trade@bullex.tech" className="text-primary hover:underline">trade@bullex.tech</a> to initiate a trade.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="mb-8">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground mb-4 flex items-center gap-2" data-testid="text-enquiries-heading">
            <SearchCheck className="w-4 h-4" />
            Product Enquiries
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Trade enquiries matching your registered products
            {kycData?.products ? ` (${kycData.products})` : kycData?.category ? ` (${kycData.category})` : ""}
          </p>
          {enquiriesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : enquiries && enquiries.length > 0 ? (
            <div className="space-y-3">
              {enquiries.map((enquiry) => (
                <EnquiryCard key={enquiry.id} enquiry={enquiry} />
              ))}
            </div>
          ) : (
            <Card className="border">
              <CardContent className="p-8 text-center">
                <SearchCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No product enquiries matching your registered products.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Enquiries for products you deal in will appear here automatically.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
