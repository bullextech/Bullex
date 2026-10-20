import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
  FileCheck,
  Send,
  Pencil,
  MessageSquare,
  Plus,
  Lock,
} from "lucide-react";
import { useClientAuth } from "@/hooks/use-client-auth";
import ClientLogin from "./client-login";
import { ChatPanel } from "@/components/chat-panel";

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
  packing: string | null;
  coSellerName: string | null;
  coBuyerName: string | null;
  loadingPort: string | null;
  incoterms: string | null;
  validity: string | null;
  additionalInfo: string | null;
  status: string;
  clientResponse: string | null;
  clientRespondedBy: string | null;
  clientRespondedAt: string | null;
  submittedByClientId: string | null;
  createdAt: string;
}

interface ClientDocument {
  id: string;
  docType: string;
  title: string;
  status: string;
  enquiryRef: string | null;
  tradeRef: string | null;
  issueNumber: string | null;
  dealRecapNumber: string | null;
  recipientResponse: string | null;
  recipientAmendmentNotes: string | null;
  sentTo: string | null;
  docxPath: string | null;
  pdfPath: string | null;
  lpgStsReview?: { required: boolean; cleared: boolean };
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
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  open: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  under_review: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  quoted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const enquiryStatusLabels: Record<string, string> = {
  active: "Active",
  open: "Active",
  under_review: "Active",
  quoted: "Active",
  closed: "Closed",
  cancelled: "Closed",
};

function EnquiryCard({ enquiry, isOwn }: { enquiry: ClientEnquiry; isOwn: boolean }) {
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
                {isOwn && (
                  <Badge variant="outline" className="text-[10px] border-primary/40 text-primary" data-testid={`badge-own-enquiry-${enquiry.id}`}>
                    Issued by you
                  </Badge>
                )}
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
              {enquiry.packing && (
                <div className="flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Packing</p>
                    <p className="text-xs font-medium">{enquiry.packing}</p>
                  </div>
                </div>
              )}
              {enquiry.coSellerName && (
                <div className="flex items-start gap-2">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Co-Seller (joint)</p>
                    <p className="text-xs font-medium">{enquiry.coSellerName}</p>
                  </div>
                </div>
              )}
              {enquiry.coBuyerName && (
                <div className="flex items-start gap-2">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Co-Buyer (joint)</p>
                    <p className="text-xs font-medium">{enquiry.coBuyerName}</p>
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
              {isOwn ? (
                <div className="flex items-center gap-3 p-3 rounded-md bg-muted/40 border">
                  <SearchCheck className="w-5 h-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">You issued this {enquiry.side === "sell" ? "sell" : "buy"} enquiry</p>
                    <p className="text-[10px] text-muted-foreground">
                      The Bullex trade desk is sourcing a counterparty. You'll be notified when there's an update.
                    </p>
                  </div>
                </div>
              ) : hasResponded ? (
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

const docTypeLabels: Record<string, string> = {
  LOI: "Letter of Intent",
  FCO: "Full Corporate Offer",
  SCO: "Soft Corporate Offer",
  DEAL_RECAP: "Deal Recap",
  PI: "Proforma Invoice",
  ICPO: "Purchase Order",
  SPA: "Sales & Purchase Agreement",
  LC: "Letter of Credit",
  POP: "Proof of Product",
  POF: "Proof of Funds",
  BCL: "Bank Comfort Letter",
};

function ClientDocumentCard({ doc }: { doc: ClientDocument }) {
  const { toast } = useToast();
  const [showAmendDialog, setShowAmendDialog] = useState(false);
  const [amendNotes, setAmendNotes] = useState("");

  const respondMutation = useMutation({
    mutationFn: async ({ response, notes }: { response: string; notes?: string }) => {
      const res = await apiRequest("POST", `/api/client/documents/${doc.id}/respond`, { response, amendmentNotes: notes });
      return res.json();
    },
    onSuccess: (_data, { response }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/documents"] });
      setShowAmendDialog(false);
      setAmendNotes("");
      toast({ title: response === "accepted" ? "Document Accepted" : "Amendment Requested" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to respond", description: err.message, variant: "destructive" });
    },
  });

  const created = new Date(doc.createdAt).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
  // The client receives only this server-derived projection. Reviewer
  // identities, decisions, notes, fingerprints, and reserved metadata remain
  // admin-only.
  const lpgStsBlocked = doc.lpgStsReview?.required === true && doc.lpgStsReview.cleared !== true;

  return (
    <>
      <Card className="border" data-testid={`card-client-doc-${doc.id}`}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <FileCheck className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm" data-testid={`text-doc-title-${doc.id}`}>{doc.title}</span>
                  <Badge variant="secondary" className="text-[10px]">{doc.docType}</Badge>
                  <Badge className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    <Send className="w-3 h-3 mr-0.5" />
                    Awaiting Response
                  </Badge>
                  {lpgStsBlocked && (
                    <Badge className="text-[10px] bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid={`badge-client-lpg-sts-blocked-${doc.id}`}>
                      <Lock className="w-3 h-3 mr-0.5" />
                      Clearance required
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {docTypeLabels[doc.docType] || doc.docType}
                  {doc.issueNumber && ` — ${doc.issueNumber}`}
                  {doc.dealRecapNumber && ` — ${doc.dealRecapNumber}`}
                  {" · "}{created}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => window.open(`/api/client/documents/${doc.id}/download`, "_blank")}
                title="Download"
                data-testid={`button-download-client-doc-${doc.id}`}
              >
                <Download className="w-4 h-4 text-blue-600" />
              </Button>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => respondMutation.mutate({ response: "accepted" })}
                disabled={respondMutation.isPending || lpgStsBlocked}
                title={lpgStsBlocked ? "Blocked pending administrator LPG STS clearance" : undefined}
                data-testid={`button-accept-doc-${doc.id}`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAmendDialog(true)}
                data-testid={`button-amend-doc-${doc.id}`}
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Request Amendment
              </Button>
            </div>
          </div>
          {lpgStsBlocked && (
            <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" role="alert" data-testid={`notice-client-lpg-sts-blocked-${doc.id}`}>
              <p className="font-medium flex items-center gap-2"><Lock className="w-4 h-4" />Acceptance is blocked pending LPG STS review</p>
              <p className="mt-1 text-xs">An administrator must clear every transaction-specific review point for this exact document content. You may still request an amendment.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAmendDialog} onOpenChange={setShowAmendDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-orange-600" />
              Request Amendment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Please describe the changes you require for <strong>{doc.title}</strong>. The document will be sent back for revision.
            </p>
            <Textarea
              value={amendNotes}
              onChange={(e) => setAmendNotes(e.target.value)}
              placeholder="Describe the amendments needed..."
              rows={4}
              data-testid="textarea-client-amendment-notes"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowAmendDialog(false); setAmendNotes(""); }}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => respondMutation.mutate({ response: "rejected", notes: amendNotes })}
                disabled={!amendNotes.trim() || respondMutation.isPending}
                data-testid="button-confirm-amendment"
              >
                {respondMutation.isPending ? "Submitting..." : "Submit Amendment Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const COMMODITY_OPTIONS = [
  "Iron Ore", "Bauxite", "Manganese Ore",
  "Copper Cathode", "Copper Concentrate", "Aluminium Ingots",
  "Gasoil 10ppm", "Gasoil 50ppm", "LHC", "HSFO", "HSGO",
  "Petcoke – Anode Grade", "Petcoke – Fuel Grade",
  "NPK",
];

const INCOTERM_OPTIONS = ["FOB", "CIF", "CFR", "FCA", "EXW", "DAP", "DDP"];

function IssueEnquiryDialog({ companyName }: { companyName: string | null }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("MT");
  const [packing, setPacking] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [incoterms, setIncoterms] = useState("");
  const [loadingPort, setLoadingPort] = useState("");
  const [validity, setValidity] = useState("");
  const [specifications, setSpecifications] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [coPartyName, setCoPartyName] = useState("");
  const [coPartyAddress, setCoPartyAddress] = useState("");
  const [coPartyContact, setCoPartyContact] = useState("");

  const reset = () => {
    setSide("buy"); setProduct(""); setQuantity(""); setUnit("MT"); setPacking("");
    setPrice(""); setCurrency("USD"); setIncoterms(""); setLoadingPort("");
    setValidity(""); setSpecifications(""); setAdditionalInfo("");
    setCoPartyName(""); setCoPartyAddress(""); setCoPartyContact("");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/client/enquiries", {
        side, product, quantity, unit, packing, price, currency,
        incoterms, loadingPort, validity, specifications, additionalInfo,
        coPartyName, coPartyAddress, coPartyContact,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/enquiries"] });
      toast({ title: "Enquiry submitted", description: "The Bullex trade desk has been notified." });
      reset();
      setOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to submit enquiry", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <Button size="sm" onClick={() => setOpen(true)} data-testid="button-issue-enquiry">
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        Issue Enquiry
      </Button>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SearchCheck className="w-5 h-5 text-primary" />
            Issue a Buy / Sell Enquiry
          </DialogTitle>
          <DialogDescription>
            You ({companyName || "your organisation"}) are the {side === "buy" ? "buyer" : "seller"} on this enquiry. The Bullex trade desk will source the counterparty.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Enquiry Type</Label>
              <Select value={side} onValueChange={(v) => setSide(v as "buy" | "sell")}>
                <SelectTrigger data-testid="select-enquiry-side"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">Buy — I want to purchase</SelectItem>
                  <SelectItem value="sell">Sell — I want to sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Commodity</Label>
              <Select value={product} onValueChange={setProduct}>
                <SelectTrigger data-testid="select-enquiry-product"><SelectValue placeholder="Select commodity" /></SelectTrigger>
                <SelectContent>
                  {COMMODITY_OPTIONS.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Quantity</Label>
              <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 50,000" data-testid="input-enquiry-quantity" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Unit</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="MT" data-testid="input-enquiry-unit" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Packing <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={packing} onChange={(e) => setPacking(e.target.value)} placeholder="e.g. In Bulk / 50kg PP bags / Jumbo bags" data-testid="input-enquiry-packing" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{side === "buy" ? "Co-Buyer" : "Co-Seller"} <span className="text-muted-foreground">(optional — second company acting jointly as {side === "buy" ? "buyer" : "seller"} with you)</span></Label>
            <Input value={coPartyName} onChange={(e) => setCoPartyName(e.target.value)} placeholder="Joint company name" data-testid="input-enquiry-co-party-name" />
            <Input value={coPartyAddress} onChange={(e) => setCoPartyAddress(e.target.value)} placeholder="Joint company address" data-testid="input-enquiry-co-party-address" />
            <Input value={coPartyContact} onChange={(e) => setCoPartyContact(e.target.value)} placeholder="Joint company contact person" data-testid="input-enquiry-co-party-contact" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Target Price <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 95 / MT" data-testid="input-enquiry-price" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="USD" data-testid="input-enquiry-currency" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Incoterms <span className="text-muted-foreground">(optional)</span></Label>
              <Select value={incoterms} onValueChange={setIncoterms}>
                <SelectTrigger data-testid="select-enquiry-incoterms"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {INCOTERM_OPTIONS.map((i) => (<SelectItem key={i} value={i}>{i}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{side === "buy" ? "Discharge / Delivery Port" : "Loading Port"} <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={loadingPort} onChange={(e) => setLoadingPort(e.target.value)} placeholder="Port" data-testid="input-enquiry-port" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Validity <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="e.g. 30 days" data-testid="input-enquiry-validity" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Specifications <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea value={specifications} onChange={(e) => setSpecifications(e.target.value)} rows={2} placeholder="Grade, purity, moisture, etc." data-testid="textarea-enquiry-specifications" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Additional Information <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea value={additionalInfo} onChange={(e) => setAdditionalInfo(e.target.value)} rows={2} placeholder="Any other details for the trade desk" data-testid="textarea-enquiry-additional" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }} data-testid="button-cancel-enquiry">Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!product || createMutation.isPending}
              data-testid="button-submit-enquiry"
            >
              {createMutation.isPending ? "Submitting..." : "Submit Enquiry"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const CLIENT_DOC_TYPES: { value: string; label: string }[] = [
  { value: "LOI", label: "Purchase Letter of Intent" },
  { value: "FCO", label: "Full Corporate Offer" },
  { value: "SCO", label: "Soft Corporate Offer" },
  { value: "DEAL_RECAP", label: "Deal Recap" },
  { value: "ICPO", label: "Irrevocable Corporate Purchase Order" },
  { value: "SPA", label: "Sales & Purchase Agreement" },
  { value: "LC", label: "Letter of Credit" },
  { value: "POP", label: "Proof of Product" },
  { value: "POF", label: "Proof of Funds" },
  { value: "BCL", label: "Bank Comfort Letter" },
  { value: "NCNDA", label: "Non-Circumvention Non-Disclosure" },
  { value: "BL", label: "Bill of Lading" },
  { value: "COO", label: "Certificate of Origin" },
  { value: "COA", label: "Certificate of Quality" },
  { value: "COW", label: "Certificate of Weight" },
  { value: "CI", label: "Commercial Invoice" },
  { value: "ICA", label: "International Commission Agreement" },
];

const genStatusBadge: Record<string, { label: string; cls: string }> = {
  pending_review: { label: "Under Trade Desk Review", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  draft: { label: "Draft", cls: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  approved: { label: "Approved", cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  sent: { label: "Sent", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  accepted: { label: "Accepted", cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

function ClientGeneratedDocCard({ doc }: { doc: ClientDocument }) {
  const created = new Date(doc.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const badge = genStatusBadge[doc.status] || { label: doc.status, cls: "bg-gray-100 text-gray-800" };
  return (
    <Card className="border" data-testid={`card-generated-doc-${doc.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm truncate" data-testid={`text-generated-title-${doc.id}`}>{doc.title}</span>
                <Badge variant="secondary" className="text-[10px]">{doc.docType}</Badge>
                <Badge className={`text-[10px] ${badge.cls}`} data-testid={`badge-generated-status-${doc.id}`}>{badge.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {doc.enquiryRef && <>Enquiry {doc.enquiryRef} · </>}{created}
              </p>
            </div>
          </div>
          {(doc.pdfPath || doc.docxPath) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={() => window.open(`/api/client/documents/${doc.id}/download`, "_blank")}
              title="Download"
              data-testid={`button-download-generated-${doc.id}`}
            >
              <Download className="w-4 h-4 text-blue-600" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ClientDocumentGenerator({
  enquiries,
  kycData,
}: {
  enquiries: ClientEnquiry[];
  kycData: KycData | undefined;
}) {
  const { toast } = useToast();
  const acceptedEnquiries = enquiries.filter((e) => e.status === "accepted");

  const [enquiryId, setEnquiryId] = useState("");
  const [docType, setDocType] = useState("");
  const [title, setTitle] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [buyerBank, setBuyerBank] = useState("");
  const [buyerSwift, setBuyerSwift] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerAddress, setSellerAddress] = useState("");
  const [sellerContact, setSellerContact] = useState("");
  const [sellerBank, setSellerBank] = useState("");
  const [sellerSwift, setSellerSwift] = useState("");
  const [commodity, setCommodity] = useState("");
  const [origin, setOrigin] = useState("");
  const [quantity, setQuantity] = useState("");
  const [loadingPort, setLoadingPort] = useState("");
  const [dischargePort, setDischargePort] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [incoterm, setIncoterm] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [qualitySpecs, setQualitySpecs] = useState("");
  const [validity, setValidity] = useState("");
  const [reviewContent, setReviewContent] = useState<string | null>(null);

  const selectedEnquiry = acceptedEnquiries.find((e) => e.id === enquiryId);

  const resetFields = () => {
    setTitle(""); setBuyerName(""); setBuyerAddress(""); setBuyerContact("");
    setBuyerBank(""); setBuyerSwift(""); setSellerName(""); setSellerAddress("");
    setSellerContact(""); setSellerBank(""); setSellerSwift(""); setCommodity("");
    setOrigin(""); setQuantity(""); setLoadingPort(""); setDischargePort("");
    setPrice(""); setCurrency("USD"); setIncoterm(""); setPaymentTerms("");
    setQualitySpecs(""); setValidity(""); setReviewContent(null);
  };

  const applyPrefill = (id: string, type: string) => {
    const e = acceptedEnquiries.find((x) => x.id === id) as any;
    if (!e) return;
    setBuyerName(e.buyerName || "");
    setBuyerAddress(e.buyerAddress || "");
    setBuyerContact(e.buyerContact || "");
    setSellerName(e.sellerName || e.producer || "");
    setSellerAddress(e.sellerAddress || "");
    setSellerContact(e.sellerContact || "");
    setCommodity(e.product || "");
    setOrigin(e.origin || "");
    setQuantity(e.quantity ? `${e.quantity} ${e.unit || "MT"}`.trim() : "");
    setLoadingPort(e.loadingPort || "");
    setDischargePort(e.dischargePort || "");
    setPrice(e.price || "");
    setCurrency(e.currency || "USD");
    setIncoterm(e.incoterms || "");
    setPaymentTerms(e.paymentTerms || "");
    setQualitySpecs(e.specifications || "");
    setValidity(e.validity || "");
    const label = CLIENT_DOC_TYPES.find((d) => d.value === type)?.label || type;
    setTitle(`${label} — ${e.enquiryRef}`);
    setReviewContent(null);
  };

  const onSelectEnquiry = (id: string) => {
    setEnquiryId(id);
    if (docType) applyPrefill(id, docType);
  };
  const onSelectDocType = (type: string) => {
    setDocType(type);
    if (enquiryId) applyPrefill(enquiryId, type);
  };

  const buildPayload = () => ({
    docType,
    title,
    enquiryRef: selectedEnquiry?.enquiryRef,
    buyerDetails: { name: buyerName, address: buyerAddress, contact: buyerContact, bank: buyerBank, swift: buyerSwift },
    sellerDetails: { name: sellerName, address: sellerAddress, contact: sellerContact, bank: sellerBank, swift: sellerSwift },
    productDetails: {
      commodity, origin, quantity, loadingPort, dischargePort,
      price, currency, incoterm, paymentTerms, qualitySpecs, validity,
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/documents/preview", buildPayload());
      return res.json();
    },
    onSuccess: (result: { content: string }) => {
      if (!result.content) {
        toast({ title: "Preview failed", description: "Document content could not be generated.", variant: "destructive" });
        return;
      }
      setReviewContent(result.content);
    },
    onError: (err: Error) => toast({ title: "Preview failed", description: err.message, variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/documents", { ...buildPayload(), editedContent: reviewContent });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/generated-documents"] });
      toast({ title: "Document submitted", description: "Sent to the Bullex trade desk for review." });
      setEnquiryId(""); setDocType(""); resetFields();
    },
    onError: (err: Error) => toast({ title: "Failed to generate", description: err.message, variant: "destructive" }),
  });

  const canPreview = !!enquiryId && !!docType && !!title.trim();

  if (acceptedEnquiries.length === 0) {
    return (
      <Card className="border">
        <CardContent className="p-8 text-center">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No accepted enquiries yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Once an enquiry is accepted, you can generate trade documents against it here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border" data-testid="card-client-doc-generator">
      <CardContent className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Accepted Enquiry</Label>
            <Select value={enquiryId} onValueChange={onSelectEnquiry}>
              <SelectTrigger data-testid="select-doc-enquiry"><SelectValue placeholder="Select an accepted enquiry" /></SelectTrigger>
              <SelectContent>
                {acceptedEnquiries.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.enquiryRef} — {e.product}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Document Type</Label>
            <Select value={docType} onValueChange={onSelectDocType}>
              <SelectTrigger data-testid="select-doc-type"><SelectValue placeholder="Select a document" /></SelectTrigger>
              <SelectContent>
                {CLIENT_DOC_TYPES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label} ({d.value})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {enquiryId && docType && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Document Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-doc-title" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2">
              <p className="md:col-span-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-1">Buyer</p>
              <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Buyer name" data-testid="input-buyer-name" />
              <Input value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} placeholder="Buyer contact (name — email)" data-testid="input-buyer-contact" />
              <Input value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} placeholder="Buyer address" data-testid="input-buyer-address" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={buyerBank} onChange={(e) => setBuyerBank(e.target.value)} placeholder="Buyer bank" data-testid="input-buyer-bank" />
                <Input value={buyerSwift} onChange={(e) => setBuyerSwift(e.target.value)} placeholder="SWIFT" data-testid="input-buyer-swift" />
              </div>

              <p className="md:col-span-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-2">Seller</p>
              <Input value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder="Seller name" data-testid="input-seller-name" />
              <Input value={sellerContact} onChange={(e) => setSellerContact(e.target.value)} placeholder="Seller contact (name — email)" data-testid="input-seller-contact" />
              <Input value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} placeholder="Seller address" data-testid="input-seller-address" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={sellerBank} onChange={(e) => setSellerBank(e.target.value)} placeholder="Seller bank" data-testid="input-seller-bank" />
                <Input value={sellerSwift} onChange={(e) => setSellerSwift(e.target.value)} placeholder="SWIFT" data-testid="input-seller-swift" />
              </div>

              <p className="md:col-span-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-2">Commodity & Terms</p>
              <Input value={commodity} onChange={(e) => setCommodity(e.target.value)} placeholder="Commodity" data-testid="input-commodity" />
              <Input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Origin" data-testid="input-origin" />
              <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Quantity" data-testid="input-quantity" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" data-testid="input-price" />
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="Currency" data-testid="input-currency" />
              </div>
              <Input value={loadingPort} onChange={(e) => setLoadingPort(e.target.value)} placeholder="Loading port" data-testid="input-loading-port" />
              <Input value={dischargePort} onChange={(e) => setDischargePort(e.target.value)} placeholder="Discharge port" data-testid="input-discharge-port" />
              <Input value={incoterm} onChange={(e) => setIncoterm(e.target.value)} placeholder="Incoterm" data-testid="input-incoterm" />
              <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Payment terms" data-testid="input-payment-terms" />
              <Input value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="Validity" data-testid="input-validity" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Quality / Specifications</Label>
              <Textarea value={qualitySpecs} onChange={(e) => setQualitySpecs(e.target.value)} rows={2} data-testid="textarea-quality-specs" />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => previewMutation.mutate()}
                disabled={!canPreview || previewMutation.isPending}
                data-testid="button-preview-doc"
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                {previewMutation.isPending ? "Generating…" : "Preview"}
              </Button>
              {reviewContent !== null && (
                <Button
                  size="sm"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  data-testid="button-generate-doc"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {generateMutation.isPending ? "Submitting…" : "Submit to Trade Desk"}
                </Button>
              )}
            </div>

            {reviewContent !== null && (
              <div className="space-y-1.5">
                <Label className="text-xs">Review &amp; Edit Document</Label>
                <Textarea
                  value={reviewContent}
                  onChange={(e) => setReviewContent(e.target.value)}
                  rows={16}
                  className="font-mono text-xs"
                  data-testid="textarea-review-content"
                />
                <p className="text-[11px] text-muted-foreground">
                  This document will be submitted to the Bullex trade desk for review — it is not finalised until the desk approves it.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function ClientPortal() {
  const { authenticated, loading, username, companyName, kycId, logout } = useClientAuth();

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

  const { data: clientDocs, isLoading: docsLoading } = useQuery<ClientDocument[]>({
    queryKey: ["/api/client/documents"],
    queryFn: async () => {
      const res = await fetch("/api/client/documents", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: authenticated,
  });

  const { data: generatedDocs } = useQuery<ClientDocument[]>({
    queryKey: ["/api/client/generated-documents"],
    queryFn: async () => {
      const res = await fetch("/api/client/generated-documents", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: authenticated,
  });

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground mb-4 flex items-center gap-2" data-testid="text-chat-heading">
            <MessageSquare className="w-4 h-4" />
            Messages
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Chat directly with the Bullex team — text messages and 1-to-1 video calls.
          </p>
          <ChatPanel embedded />
        </div>

        {clientDocs && clientDocs.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground mb-4 flex items-center gap-2" data-testid="text-docs-heading">
              <FileCheck className="w-4 h-4" />
              Documents Pending Your Review
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              The following documents have been sent to you for review. Please accept or request amendments.
            </p>
            {docsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
            ) : (
              <div className="space-y-3">
                {clientDocs.map((doc) => (
                  <ClientDocumentCard key={doc.id} doc={doc} />
                ))}
              </div>
            )}
          </div>
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
                  Contact <a href="mailto:trade@bullfrog-group.com" className="text-primary hover:underline">trade@bullfrog-group.com</a> to initiate a trade.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="mb-8">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground mb-4 flex items-center gap-2" data-testid="text-generate-docs-heading">
            <FileText className="w-4 h-4" />
            Generate Trade Documents
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Select one of your accepted enquiries and generate any trade document. Submitted documents are
            sent to the Bullex trade desk for review before they become official.
          </p>
          <ClientDocumentGenerator enquiries={enquiries || []} kycData={kycData} />

          {generatedDocs && generatedDocs.length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Your Submitted Documents</p>
              {generatedDocs.map((doc) => (
                <ClientGeneratedDocCard key={doc.id} doc={doc} />
              ))}
            </div>
          )}
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2" data-testid="text-enquiries-heading">
              <SearchCheck className="w-4 h-4" />
              Product Enquiries
            </h3>
            <IssueEnquiryDialog companyName={companyName} />
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Enquiries you've issued and enquiries shared with you by the Bullex trade desk.
          </p>
          {enquiriesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : enquiries && enquiries.length > 0 ? (
            <div className="space-y-3">
              {enquiries.map((enquiry) => (
                <EnquiryCard key={enquiry.id} enquiry={enquiry} isOwn={!!kycId && enquiry.submittedByClientId === kycId} />
              ))}
            </div>
          ) : (
            <Card className="border">
              <CardContent className="p-8 text-center">
                <SearchCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No enquiries yet.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use <span className="font-medium">Issue Enquiry</span> to submit a buy or sell enquiry to the Bullex trade desk.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
