import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, uploadFormData } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AmendDialog, type AmendSection } from "@/components/amend-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Search, Plus, FileText, Download, Trash2, Upload, Eye, X,
  Scale, Clock, Info, User, Mail, Send, ClipboardList, FileSignature,
  MapPin, Package, ChevronDown, ChevronUp, ArrowRight, CheckCircle2,
  Copy, Link2, ExternalLink, TrendingUp, Activity, XCircle, UserCheck,
} from "lucide-react";
import { EnquiryForm } from "@/components/enquiry-form";
import { useAuth } from "@/hooks/use-auth";
import type { TradeEnquiry, TradeEnquiryDocument, Trade, KycApplication, TeamMember } from "@shared/schema";
import { enquiryStatusBucket, ENQUIRY_STATUS_LABELS, isEnquiryStatusActive, isEnquiryStatusPending, isEnquiryStatusAccepted, isEnquiryStatusTerminal } from "@shared/schema";
import { buildEnquiryDocParams } from "@shared/enquiry-doc-prefill";
import { sortClientDetails } from "@shared/client-sorting";

// Badge colours keyed by the shared status bucket (pending/accepted/rejected/closed).
const STATUS_BUCKET_COLORS: Record<string, string> = {
  pending: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

function statusColor(status: string) {
  return STATUS_BUCKET_COLORS[enquiryStatusBucket(status)];
}

function statusLabel(status: string) {
  return ENQUIRY_STATUS_LABELS[enquiryStatusBucket(status)];
}

// Pending = active and not yet accepted (the "actionable" set in the UI).
function isPending(status: string) {
  return isEnquiryStatusPending(status);
}


export default function TradeEnquiries() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [amendEnquiry, setAmendEnquiry] = useState<TradeEnquiry | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sideFilter, setSideFilter] = useState<string>("all");
  const [viewEnquiry, setViewEnquiry] = useState<TradeEnquiry | null>(null);

  const { data: enquiries = [], isLoading } = useQuery<TradeEnquiry[]>({
    queryKey: ["/api/trade-enquiries"],
  });

  const { data: trades = [] } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });

  const totalTrades = trades.length;
  const activeTrades = trades.filter((t) => t.status !== "final_payment").length;
  const totalTradeVolume = trades.reduce((s, t) => s + (Number(t.totalValue) || 0), 0);

  const enqPending = enquiries.filter((e) => isPending(e.status)).length;
  const enqAccepted = enquiries.filter((e) => isEnquiryStatusAccepted(e.status)).length;
  const enqClosed = enquiries.filter((e) => isEnquiryStatusTerminal(e.status)).length;

  const [, navigate] = useLocation();

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/trade-enquiries/${id}/status`, { status });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade-enquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiry-board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiry-table"] });
      if (data?.createdTradeRef) {
        sessionStorage.setItem("highlightTradeRef", data.createdTradeRef);
        toast({
          title: `Trade ${data.createdTradeRef} registered`,
          description: "Enquiry accepted — navigating to Trade Register.",
        });
        setTimeout(() => navigate("/trading"), 600);
      } else {
        toast({ title: "Status updated" });
      }
    },
    onError: (e: any) =>
      toast({ title: "Could not update status", description: e?.message || "Error", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/trade-enquiries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade-enquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiry-board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiry-table"] });
      setViewEnquiry(null);
      toast({ title: "Enquiry deleted" });
    },
  });

  const searchStr = useSearch();
  const focusEnquiryId = new URLSearchParams(searchStr).get("enquiryId");

  useEffect(() => {
    if (focusEnquiryId && enquiries.length > 0) {
      const target = enquiries.find((e) => e.id === focusEnquiryId);
      if (target) setViewEnquiry(target);
    }
  }, [focusEnquiryId, enquiries]);

  const clearFocus = () => navigate("/trade-enquiries", { replace: true });

  const filtered = focusEnquiryId
    ? enquiries.filter((e) => e.id === focusEnquiryId)
    : enquiries.filter((e) => {
        const matchesSearch =
          !searchTerm ||
          e.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
          e.enquiryRef.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (e.sellerName || e.producer || "").toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? isPending(e.status) : e.status === statusFilter);
        const matchesSide = sideFilter === "all" || e.side === sideFilter;
        return matchesSearch && matchesStatus && matchesSide;
      });

  const enquiryUrl = typeof window !== "undefined" ? `${window.location.origin}/enquiry-register` : "/enquiry-register";
  const [enquiryLinkCopied, setEnquiryLinkCopied] = useState(false);
  const [enquiryLinkEmail, setEnquiryLinkEmail] = useState("");
  const copyEnquiryLink = async () => {
    try {
      await navigator.clipboard.writeText(enquiryUrl);
      setEnquiryLinkCopied(true);
      setTimeout(() => setEnquiryLinkCopied(false), 2000);
      toast({ title: "Link Copied", description: "Online enquiry link copied to clipboard." });
    } catch {
      toast({ title: "Copy Failed", description: "Unable to copy.", variant: "destructive" });
    }
  };
  const sendEnquiryLinkMutation = useMutation({
    mutationFn: async (email: string) => (await apiRequest("POST", "/api/enquiry/send-onboarding-link", { email })).json(),
    onSuccess: () => {
      toast({ title: "Invitation Sent", description: `Online enquiry link sent to ${enquiryLinkEmail.trim()}.` });
      setEnquiryLinkEmail("");
    },
    onError: (e: any) => toast({ title: "Send Failed", description: e?.message || "Failed to send.", variant: "destructive" }),
  });

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Trade Enquiries</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage commodity trade enquiries</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} data-testid="button-new-enquiry">
          <Plus className="w-4 h-4 mr-2" />
          New Enquiry
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3" data-testid="stats-trades">
        <Card className="bullex-stat-card" data-testid="stat-total-trades">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Link2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Trades</p>
                <p className="text-xl font-bold" data-testid="text-total-trades">{totalTrades}</p>
                <p className="text-[11px] text-muted-foreground">{activeTrades} active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bullex-stat-card" data-testid="stat-trade-volume">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Trade Volume</p>
                <p className="text-xl font-bold" data-testid="text-trade-volume">${totalTradeVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <p className="text-[11px] text-muted-foreground">All-time</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bullex-stat-card" data-testid="stat-active-trades">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Trades</p>
                <p className="text-xl font-bold" data-testid="text-active-trades">{activeTrades}</p>
                <p className="text-[11px] text-muted-foreground">In progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-enquiry-status">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            Trade Enquiries Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md bg-primary/5 border border-primary/20 p-4 text-center" data-testid="enq-stat-total">
              <div className="text-3xl font-bold text-primary">{enquiries.length}</div>
              <div className="text-[10px] uppercase tracking-wider text-primary mt-1">Enquiries</div>
            </div>
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 text-center" data-testid="enq-stat-pending">
              <div className="text-3xl font-bold text-amber-600">{enqPending}</div>
              <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 mt-1">Pending</div>
            </div>
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-4 text-center" data-testid="enq-stat-accepted">
              <div className="text-3xl font-bold text-emerald-600">{enqAccepted}</div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mt-1">Accepted</div>
            </div>
            <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-4 text-center" data-testid="enq-stat-closed">
              <div className="text-3xl font-bold text-red-600">{enqClosed}</div>
              <div className="text-[10px] uppercase tracking-wider text-red-700 dark:text-red-400 mt-1">Closed</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5" data-testid="card-online-enquiry-link">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Link2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Online Enquiry Link</p>
              <p className="text-xs text-muted-foreground">Share with clients to submit a trade enquiry online</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex flex-1 items-center gap-2 bg-background border border-border rounded-md px-3 py-2 min-w-0">
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground truncate font-mono" data-testid="text-online-enquiry-link">{enquiryUrl}</span>
            </div>
            <Button size="sm" variant={enquiryLinkCopied ? "secondary" : "outline"} onClick={copyEnquiryLink} className="flex-shrink-0" data-testid="button-copy-online-enquiry-link">
              <Copy className="w-3.5 h-3.5 mr-1.5" />
              {enquiryLinkCopied ? "Copied!" : "Copy Link"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="client@company.com"
              value={enquiryLinkEmail}
              onChange={(e) => setEnquiryLinkEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && enquiryLinkEmail.trim()) sendEnquiryLinkMutation.mutate(enquiryLinkEmail.trim()); }}
              className="h-9 text-xs flex-1"
              data-testid="input-online-enquiry-email"
            />
            <Button size="sm" onClick={() => enquiryLinkEmail.trim() && sendEnquiryLinkMutation.mutate(enquiryLinkEmail.trim())} disabled={sendEnquiryLinkMutation.isPending || !enquiryLinkEmail.trim()} className="flex-shrink-0" data-testid="button-send-online-enquiry-link">
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {sendEnquiryLinkMutation.isPending ? "Sending…" : "Send Invite"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              New Trade Enquiry
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EnquiryForm onSuccess={() => setShowForm(false)} onCancel={() => setShowForm(false)} />
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by commodity, reference, seller..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" data-testid="input-search-enquiries" />
        </div>
        <Select value={sideFilter} onValueChange={setSideFilter}>
          <SelectTrigger className="w-28" data-testid="select-side-filter"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="buy">Import (Buy)</SelectItem>
            <SelectItem value="sell">Export (Sell)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-status-filter"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Pending</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground" data-testid="text-enquiry-count">
          {filtered.length} enquir{filtered.length === 1 ? "y" : "ies"}
        </div>
      </div>

      {focusEnquiryId && (
        <div className="flex items-center justify-between gap-3 border border-primary/30 bg-primary/5 px-3 py-2 rounded-md" data-testid="banner-enquiry-focus">
          <p className="text-xs text-foreground">
            Showing a single enquiry opened from the team submissions view.
          </p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={clearFocus} data-testid="button-clear-enquiry-focus">
            Show all enquiries
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No trade enquiries found</p>
            <p className="text-sm mt-1">Click "New Enquiry" to create one</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((enquiry) => (
            <EnquiryCard
              key={enquiry.id}
              enquiry={enquiry}
              onView={() => setViewEnquiry(enquiry)}
              onStatusChange={(status) => statusMutation.mutate({ id: enquiry.id, status })}
              onDelete={() => { if (confirm("Delete this enquiry and all attached documents?")) deleteMutation.mutate(enquiry.id); }}
              onAmend={() => setAmendEnquiry(enquiry)}
            />
          ))}
        </div>
      )}

      {amendEnquiry && (
        <AmendDialog
          open={!!amendEnquiry}
          onOpenChange={(o) => { if (!o) setAmendEnquiry(null); }}
          title={`Amend Enquiry — ${amendEnquiry.enquiryRef}`}
          description="Direct admin amendment. Status changes are not made here — use Accept/Reject on the enquiry."
          endpoint={`/api/trade-enquiries/${amendEnquiry.id}/amend`}
          invalidateKeys={["/api/trade-enquiries", "/api/enquiry-board", "/api/enquiry-table"]}
          sections={ENQUIRY_AMEND_SECTIONS}
          initialValues={enquiryAmendInitialValues(amendEnquiry)}
        />
      )}

      {viewEnquiry && (
        <EnquiryDetailDialog
          enquiry={viewEnquiry}
          onClose={() => setViewEnquiry(null)}
          onStatusChange={(status) => { statusMutation.mutate({ id: viewEnquiry.id, status }); setViewEnquiry({ ...viewEnquiry, status }); }}
          onDelete={() => { if (confirm("Delete this enquiry and all attached documents?")) deleteMutation.mutate(viewEnquiry.id); }}
          onAssigned={(updated) => setViewEnquiry(updated)}
        />
      )}
    </div>
  );
}

function getValidityInfo(enquiry: TradeEnquiry): { label: string; color: string } {
  if (!enquiry.validity || !enquiry.createdAt) return { label: "", color: "" };
  const validityStr = String(enquiry.validity).trim();
  const daysMatch = validityStr.match(/(\d+)/);
  if (!daysMatch) return { label: enquiry.validity, color: "" };
  const validityDays = parseInt(daysMatch[1]);
  const expiry = new Date(new Date(enquiry.createdAt).getTime() + validityDays * 86400000);
  const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
  if (daysLeft <= 0) return { label: "Expired", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border border-red-200" };
  if (daysLeft <= 5) return { label: `${daysLeft}d left`, color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border border-orange-200" };
  return { label: `${daysLeft}d left`, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border border-green-200" };
}

function buildGenerateDocUrl(enquiry: TradeEnquiry, requestedType?: "SPA") {
  const docType = requestedType || (enquiry.side === "sell" ? "FCO" : "LOI");
  const params = buildEnquiryDocParams(enquiry, docType, { originFallsBackToLoadingPort: true });
  return `/documents?${params.toString()}`;
}

// Field keys are the exact Drizzle column names — the amend endpoint writes
// them straight through db.update().set().
const ENQUIRY_AMEND_SECTIONS: AmendSection[] = [
  { title: "Commercial Terms", fields: [
    { key: "product", label: "Product" },
    { key: "specifications", label: "Specifications", type: "textarea", colSpan: 2 },
    { key: "producer", label: "Producer" },
    { key: "quantity", label: "Quantity" },
    { key: "unit", label: "Unit" },
    { key: "packing", label: "Packing" },
    { key: "price", label: "Price" },
    { key: "currency", label: "Currency" },
    { key: "incoterms", label: "Incoterms" },
    { key: "paymentTerms", label: "Payment Terms" },
    { key: "deliveryPeriod", label: "Delivery Period" },
    { key: "validity", label: "Validity" },
  ]},
  { title: "Route", fields: [
    { key: "origin", label: "Origin" },
    { key: "loadingPort", label: "Loading Port" },
    { key: "dischargePort", label: "Discharge Port" },
  ]},
  { title: "Buyer", fields: [
    { key: "buyerName", label: "Buyer Name" },
    { key: "buyerAddress", label: "Buyer Address" },
    { key: "buyerContact", label: "Buyer Contact" },
    { key: "coBuyerName", label: "Co-Buyer Name" },
    { key: "coBuyerAddress", label: "Co-Buyer Address" },
    { key: "coBuyerContact", label: "Co-Buyer Contact" },
  ]},
  { title: "Seller", fields: [
    { key: "sellerName", label: "Seller Name" },
    { key: "sellerAddress", label: "Seller Address" },
    { key: "sellerContact", label: "Seller Contact" },
    { key: "coSellerName", label: "Co-Seller Name" },
    { key: "coSellerAddress", label: "Co-Seller Address" },
    { key: "coSellerContact", label: "Co-Seller Contact" },
  ]},
  { title: "Other", fields: [
    { key: "refPerson", label: "Reference Person" },
    { key: "contractConfirmation", label: "Contract Confirmation" },
    { key: "docsForPayment", label: "Documents for Payment", type: "textarea", colSpan: 2 },
    { key: "otherTerms", label: "Other Terms", type: "textarea", colSpan: 2 },
    { key: "compliance", label: "Compliance", type: "textarea", colSpan: 2 },
    { key: "performanceBond", label: "Performance Bond" },
    { key: "additionalInfo", label: "Additional Info", type: "textarea", colSpan: 2 },
    { key: "createdBy", label: "Created By" },
    { key: "email", label: "Contact Email", type: "email" },
  ]},
];

function enquiryAmendInitialValues(e: TradeEnquiry): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of ENQUIRY_AMEND_SECTIONS) for (const f of s.fields) out[f.key] = (e as any)[f.key] ?? "";
  return out;
}

function EnquiryCard({ enquiry, onView, onStatusChange, onDelete, onAmend }: {
  enquiry: TradeEnquiry; onView: () => void; onStatusChange: (s: string) => void; onDelete: () => void; onAmend: () => void;
}) {
  const [, nav] = useLocation();
  const goToTrade = () => {
    if (enquiry.linkedTradeRef) sessionStorage.setItem("highlightTradeRef", enquiry.linkedTradeRef);
    nav("/trading");
  };
  const validity = getValidityInfo(enquiry);
  return (
    <Card className="hover:shadow-md transition-shadow" data-testid={`card-enquiry-${enquiry.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge className={`text-[10px] font-bold ${enquiry.side === "sell" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`} data-testid={`badge-side-${enquiry.id}`}>
                {enquiry.side === "sell" ? "EXPORT" : "IMPORT"}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground" data-testid={`text-ref-${enquiry.id}`}>{enquiry.enquiryRef}</span>
              <Badge className={`text-[10px] ${statusColor(enquiry.status)}`} data-testid={`badge-status-${enquiry.id}`}>{statusLabel(enquiry.status)}</Badge>
              {enquiry.clientResponse && (
                <Badge className={`text-[10px] font-bold ${enquiry.clientResponse === "accepted" ? "bg-emerald-600 text-white" : "bg-orange-600 text-white"}`} data-testid={`badge-client-response-${enquiry.id}`}>
                  {enquiry.clientResponse === "accepted" ? "CLIENT ACCEPTED" : "CLIENT REJECTED"}
                </Badge>
              )}
            </div>
            <h3 className="font-semibold text-base truncate" data-testid={`text-product-${enquiry.id}`}>{enquiry.product}</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
              {(enquiry.sellerName || enquiry.producer) && <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5" /> {enquiry.sellerName || enquiry.producer}</span>}
              {enquiry.quantity && <span className="flex items-center gap-1"><Scale className="w-3.5 h-3.5" /> {enquiry.quantity} {enquiry.unit}</span>}
              {(enquiry.origin || enquiry.loadingPort) && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {enquiry.origin || enquiry.loadingPort}</span>}
              {enquiry.incoterms && <span className="flex items-center gap-1"><Info className="w-3.5 h-3.5" /> {enquiry.incoterms}</span>}
              {enquiry.price && <span className="flex items-center gap-1 font-medium text-foreground">{enquiry.currency || "USD"} {enquiry.price}</span>}
              {enquiry.validity && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {enquiry.validity}</span>}
              {validity.label && isEnquiryStatusActive(enquiry.status) && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${validity.color}`} data-testid={`badge-validity-${enquiry.id}`}>
                  <Clock className="w-3 h-3" />{validity.label}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="outline" size="sm" onClick={onView} data-testid={`button-view-${enquiry.id}`}><Eye className="w-3.5 h-3.5 mr-1" /> View</Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => nav(buildGenerateDocUrl(enquiry))} data-testid={`button-generate-doc-${enquiry.id}`}>
              <FileText className="w-3.5 h-3.5 mr-1" /> {enquiry.side === "sell" ? "FCO" : "LOI"}
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => nav(buildGenerateDocUrl(enquiry, "SPA"))} data-testid={`button-generate-spa-${enquiry.id}`}>
              Draft SPA
            </Button>
            {isPending(enquiry.status) && (
              <>
                <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => onStatusChange("accepted")} data-testid={`button-accept-${enquiry.id}`}>Accept</Button>
                <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => onStatusChange("rejected")} data-testid={`button-reject-${enquiry.id}`}>Reject</Button>
              </>
            )}
            {enquiry.linkedTradeRef && (
              <Button size="sm" className="h-8 text-xs bg-primary hover:bg-primary/90 text-white" onClick={goToTrade} data-testid={`link-trading-${enquiry.id}`}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> View Trade <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onAmend} data-testid={`button-amend-${enquiry.id}`}>Amend</Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete} data-testid={`button-delete-${enquiry.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EnquiryDetailDialog({ enquiry, onClose, onStatusChange, onDelete, onAssigned }: {
  enquiry: TradeEnquiry; onClose: () => void; onStatusChange: (s: string) => void; onDelete: () => void; onAssigned?: (updated: TradeEnquiry) => void;
}) {
  const { toast } = useToast();
  const [, nav] = useLocation();
  const goToTrade = () => {
    if (enquiry.linkedTradeRef) sessionStorage.setItem("highlightTradeRef", enquiry.linkedTradeRef);
    onClose();
    nav("/trading");
  };
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [uploading, setUploading] = useState(false);
  const [assignClientId, setAssignClientId] = useState<string>((enquiry as any).assignedToClientId || "");
  const [allocateMemberId, setAllocateMemberId] = useState<string>((enquiry as any).allocatedTeamMemberId || "none");

  const { data: approvedClients = [] } = useQuery<KycApplication[]>({
    queryKey: ["/api/kyc"],
    select: (data: KycApplication[]) => sortClientDetails(data.filter((k) => k.status === "approved")),
  });

  const { data: teamMembersList = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team/members"],
    enabled: isAdmin,
  });

  const allocateMutation = useMutation({
    mutationFn: async (teamMemberId: string | null): Promise<TradeEnquiry> => {
      const res = await apiRequest("PATCH", `/api/trade-enquiries/${enquiry.id}/allocate`, { teamMemberId });
      return res.json();
    },
    onSuccess: (updated: TradeEnquiry) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade-enquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-performance"] });
      toast({ title: (updated as any).allocatedTeamMemberId ? "Enquiry allocated to team member" : "Allocation removed" });
      if (onAssigned) onAssigned(updated);
    },
    onError: (err: any) => {
      toast({ title: "Failed to allocate enquiry", description: err.message, variant: "destructive" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (clientId: string | null): Promise<TradeEnquiry> => {
      const res = await apiRequest("PATCH", `/api/trade-enquiries/${enquiry.id}/assign`, { clientId });
      return res.json();
    },
    onSuccess: (updated: TradeEnquiry) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade-enquiries"] });
      toast({ title: clientId ? "Client assigned to enquiry" : "Client assignment removed" });
      if (onAssigned) onAssigned(updated);
    },
    onError: (err: any) => {
      toast({ title: "Failed to update assignment", description: err.message, variant: "destructive" });
    },
  });

  const clientId = assignClientId;

  const { data: docs = [], refetch: refetchDocs } = useQuery<TradeEnquiryDocument[]>({
    queryKey: ["/api/trade-enquiries", enquiry.id, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/trade-enquiries/${enquiry.id}/documents`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (docId: string) => { await apiRequest("DELETE", `/api/trade-enquiry-documents/${docId}`); },
    onSuccess: () => { refetchDocs(); toast({ title: "Document removed" }); },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await uploadFormData(`/api/trade-enquiries/${enquiry.id}/documents`, formData);
      refetchDocs();
      toast({ title: "Document uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const created = new Date(enquiry.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  const row = (label: string, value: string | null | undefined, testId?: string) =>
    value ? (
      <div className="flex justify-between py-1.5 border-b border-border/30 text-sm last:border-b-0">
        <span className="text-muted-foreground text-xs shrink-0 mr-4">{label}</span>
        <span className="font-medium text-right break-words" data-testid={testId}>{value}</span>
      </div>
    ) : null;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {enquiry.enquiryRef}
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`font-bold ${enquiry.side === "sell" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`} data-testid="badge-detail-side">
                {enquiry.side === "sell" ? "EXPORT (SELL)" : "IMPORT (BUY)"}
              </Badge>
              <Badge className={statusColor(enquiry.status)} data-testid="badge-detail-status">{statusLabel(enquiry.status)}</Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="border rounded-md overflow-hidden">
            <div className="text-xs font-bold uppercase tracking-wider p-2 bg-muted/60 border-b flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> Enquiry Header
            </div>
            <div className="p-3 space-y-0">
              {row("Issued to Seller", enquiry.sellerName)}
              {row("Seller Address", enquiry.sellerAddress)}
              {row("Seller Contact (PIC)", enquiry.sellerContact)}
              {row("Co-Seller (joint)", enquiry.coSellerName)}
              {row("Co-Seller Address", enquiry.coSellerAddress)}
              {row("Co-Seller Contact (PIC)", enquiry.coSellerContact)}
              {row("Ref", enquiry.refPerson)}
              {row("Date", created)}
              {row("Valid Till", enquiry.validity)}
              {row("Purchase Incoterms", enquiry.incoterms)}
              {row("Issued by Buyer", enquiry.buyerName)}
              {row("Buyer Address", enquiry.buyerAddress)}
              {row("Buyer Contact (PIC)", enquiry.buyerContact)}
              {row("Co-Buyer (joint)", enquiry.coBuyerName)}
              {row("Co-Buyer Address", enquiry.coBuyerAddress)}
              {row("Co-Buyer Contact (PIC)", enquiry.coBuyerContact)}
              {row("Created By", enquiry.createdBy, "text-detail-created-by")}
              {row("Email", enquiry.email, "text-detail-email")}
            </div>
          </div>

          <div className="border rounded-md overflow-hidden">
            <div className="text-xs font-bold uppercase tracking-wider p-2 bg-muted/60 border-b flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5" /> Enquiry Parameters
            </div>
            <div className="divide-y">
              {[
                ["01", "Commodity", enquiry.product],
                ["02", "Origin", enquiry.origin],
                ["03", "Quantity", enquiry.quantity ? `${enquiry.quantity} ${enquiry.unit}` : null],
                ["04", "Packing", enquiry.packing],
                ["05", "Incoterms", enquiry.incoterms],
                ["06", "Delivery Period", enquiry.deliveryPeriod],
                ["07", "Price", enquiry.price ? `${enquiry.currency || "USD"} ${enquiry.price}` : null],
                ["08", "Contract Confirmation", enquiry.contractConfirmation],
              ].map(([sr, label, val]) => val ? (
                <div key={sr} className="grid grid-cols-[40px_140px_1fr] text-sm">
                  <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">{sr}</div>
                  <div className="p-2 border-r text-xs text-muted-foreground">{label}</div>
                  <div className="p-2 text-xs font-medium" data-testid={`text-detail-${label?.toLowerCase().replace(/\s+/g, "-")}`}>{val}</div>
                </div>
              ) : null)}
              {enquiry.specifications && (
                <div className="grid grid-cols-[40px_1fr] text-sm">
                  <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">09</div>
                  <div className="p-2">
                    <p className="text-xs text-muted-foreground mb-1">Commodity Specifications</p>
                    <p className="text-xs whitespace-pre-wrap" data-testid="text-detail-specs">{enquiry.specifications}</p>
                  </div>
                </div>
              )}
              {[
                ["10", "Payment Terms", enquiry.paymentTerms],
                ["11", "Performance Bond", enquiry.performanceBond],
              ].map(([sr, label, val]) => val ? (
                <div key={sr} className="grid grid-cols-[40px_140px_1fr] text-sm">
                  <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">{sr}</div>
                  <div className="p-2 border-r text-xs text-muted-foreground">{label}</div>
                  <div className="p-2 text-xs font-medium whitespace-pre-wrap">{val}</div>
                </div>
              ) : null)}
              {enquiry.docsForPayment && (
                <div className="grid grid-cols-[40px_140px_1fr] text-sm">
                  <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">12</div>
                  <div className="p-2 border-r text-xs text-muted-foreground">Documents for Payment</div>
                  <div className="p-2">
                    <ul className="space-y-0.5">
                      {enquiry.docsForPayment.split("\n").filter(Boolean).map((doc, i) => (
                        <li key={i} className="text-xs font-medium flex items-start gap-1.5">
                          <span className="text-primary mt-0.5">✓</span>
                          <span>{doc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {[
                ["13", "Other Terms", enquiry.otherTerms],
                ["14", "Compliance", enquiry.compliance],
              ].map(([sr, label, val]) => val ? (
                <div key={sr} className="grid grid-cols-[40px_140px_1fr] text-sm">
                  <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">{sr}</div>
                  <div className="p-2 border-r text-xs text-muted-foreground">{label}</div>
                  <div className="p-2 text-xs font-medium whitespace-pre-wrap">{val}</div>
                </div>
              ) : null)}
            </div>
          </div>

          {(enquiry.loadingPort || enquiry.dischargePort || enquiry.producer || enquiry.additionalInfo) && (
            <div className="border rounded-md overflow-hidden">
              <div className="text-xs font-bold uppercase tracking-wider p-2 bg-muted/60 border-b flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> Logistics
              </div>
              <div className="p-3 space-y-0">
                {row("Loading Port", enquiry.loadingPort)}
                {row("Discharge Port", enquiry.dischargePort)}
                {row("Producer / Supplier", enquiry.producer)}
                {row("Special Notes", enquiry.additionalInfo)}
              </div>
            </div>
          )}

          {enquiry.clientResponse && (
            <div className={`rounded-lg p-4 ${enquiry.clientResponse === "accepted" ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"}`}>
              <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">Client Response</h4>
              <div className="flex items-center gap-2">
                <Badge className={`font-bold ${enquiry.clientResponse === "accepted" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
                  {enquiry.clientResponse === "accepted" ? "ACCEPTED" : "REJECTED"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  by {enquiry.clientRespondedBy}
                  {enquiry.clientRespondedAt && ` on ${new Date(enquiry.clientRespondedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`}
                </span>
              </div>
            </div>
          )}

          <div className="border rounded-md overflow-hidden">
            <div className="text-xs font-bold uppercase tracking-wider p-2 bg-muted/60 border-b flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" /> Client Portal Assignment
            </div>
            {isAdmin && (
              <div className="p-3 space-y-2 border-b">
                <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Team Member Allocation
                </div>
                <p className="text-xs text-muted-foreground">
                  Allocate this whole deal to a team member. Their member code is stamped on every document across the enquiry → shipment lifecycle for performance tracking.
                </p>
                <div className="flex items-center gap-2">
                  <Select value={allocateMemberId} onValueChange={setAllocateMemberId}>
                    <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-allocate-member">
                      <SelectValue placeholder="Select team member…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— No team member allocated —</SelectItem>
                      {teamMembersList.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}{m.participantId ? ` — ${m.participantId}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    disabled={allocateMutation.isPending}
                    onClick={() => allocateMutation.mutate(allocateMemberId === "none" ? null : allocateMemberId || null)}
                    data-testid="button-allocate-member"
                  >
                    {allocateMutation.isPending ? "Saving…" : "Save"}
                  </Button>
                </div>
                {(enquiry as any).allocatedTeamMemberId && (
                  <p className="text-xs text-green-700 dark:text-green-400" data-testid="text-current-allocation">
                    Currently allocated to:{" "}
                    <span className="font-semibold">
                      {(() => {
                        const m = teamMembersList.find((t) => t.id === (enquiry as any).allocatedTeamMemberId);
                        return m ? `${m.name}${m.participantId ? ` (${m.participantId})` : ""}` : (enquiry as any).allocatedTeamMemberId;
                      })()}
                    </span>
                  </p>
                )}
              </div>
            )}
            <div className="p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Assign this enquiry to a specific approved client so only they can see and respond to it in the Client Portal.
              </p>
              <div className="flex items-center gap-2">
                <Select value={assignClientId} onValueChange={setAssignClientId}>
                  <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-assign-client">
                    <SelectValue placeholder="Select approved client…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— No client assigned —</SelectItem>
                    {approvedClients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.companyName} — {c.contactName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="h-8 text-xs shrink-0"
                  disabled={assignMutation.isPending}
                  onClick={() => assignMutation.mutate(assignClientId === "none" ? null : assignClientId || null)}
                  data-testid="button-assign-client"
                >
                  {assignMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
              {(enquiry as any).assignedToClientId && (
                <p className="text-xs text-green-700 dark:text-green-400">
                  Currently assigned to: <span className="font-semibold">{approvedClients.find(c => c.id === (enquiry as any).assignedToClientId)?.companyName || (enquiry as any).assignedToClientId}</span>
                </p>
              )}
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Attached Documents</h4>
              <label>
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" onChange={handleUpload} disabled={uploading} data-testid="input-upload-doc" />
                <Button variant="outline" size="sm" asChild className="cursor-pointer" disabled={uploading}>
                  <span><Upload className="w-3.5 h-3.5 mr-1.5" />{uploading ? "Uploading..." : "Attach File"}</span>
                </Button>
              </label>
            </div>
            {docs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">No documents attached</p>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between bg-background rounded-md px-3 py-2 border" data-testid={`doc-row-${doc.id}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">{doc.originalName}</span>
                      <span className="text-xs text-muted-foreground shrink-0">({(doc.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" asChild data-testid={`button-download-doc-${doc.id}`}>
                        <a href={`/api/trade-enquiry-documents/${doc.id}/download`} target="_blank" rel="noreferrer"><Download className="w-3.5 h-3.5" /></a>
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteDocMutation.mutate(doc.id)} data-testid={`button-delete-doc-${doc.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t">
            {isPending(enquiry.status) && (
              <>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => onStatusChange("accepted")} data-testid="button-detail-accept">Accept</Button>
                <Button size="sm" variant="destructive" onClick={() => onStatusChange("rejected")} data-testid="button-detail-reject">Reject</Button>
              </>
            )}
            {enquiry.linkedTradeRef && (
              <Button size="sm" className="bg-primary hover:bg-primary/90 text-white" onClick={goToTrade} data-testid="link-detail-trading">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Go to Trading <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            )}
            {isEnquiryStatusAccepted(enquiry.status) && (
              <>
                <Button variant="outline" size="sm" onClick={() => { onClose(); nav(buildGenerateDocUrl(enquiry)); }} data-testid="link-generate-doc">
                  <FileText className="w-3.5 h-3.5 mr-1.5" /> Generate {enquiry.side === "sell" ? "FCO" : "LOI"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => { onClose(); nav(buildGenerateDocUrl(enquiry, "SPA")); }} data-testid="link-generate-spa">
                  Draft SPA (Standard / LPG STS)
                </Button>
              </>
            )}
            <div className="flex-1" />
            <Button variant="destructive" size="sm" onClick={onDelete} data-testid="button-detail-delete">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Enquiry
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
