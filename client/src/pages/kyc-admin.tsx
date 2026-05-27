import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Shield,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Building2,
  User,
  Phone,
  Mail,
  Globe,
  Landmark,
  Users,
  FileText,
  AlertTriangle,
  Link2,
  Layers,
  TrendingUp,
  ArrowRight,
  AlertCircle,
  Download,
  FileCheck,
  Edit,
  X,
  Plus,
  Copy,
  Send,
  ExternalLink,
  Briefcase,
  UserCheck,
  UserX,
  UserCog,
  ClipboardList,
  Package,
  CalendarDays,
  Loader2,
  Trash2,
  FileSignature,
} from "lucide-react";
import type { DailyReport, TeamTask } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { KycApplication, Trade, Block, Document, KycDocument, KycChangeRequest, TeamKycApplication, TeamMember, TradeEnquiry, EnquiryChangeRequest } from "@shared/schema";
import { useAmendMode } from "@/hooks/use-amend-mode";
import { AmendDialog, type AmendSection } from "@/components/amend-dialog";
import { Pencil } from "lucide-react";

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pending: { label: "Pending Review", color: "text-amber-600", bg: "bg-amber-600/10 border-amber-600/20 text-amber-700", icon: Clock },
  approved: { label: "Approved", color: "text-emerald-600", bg: "bg-emerald-600/10 border-emerald-600/20 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "text-red-600", bg: "bg-red-600/10 border-red-600/20 text-red-700", icon: XCircle },
};

const tradeStatusIcon = (status: string) => {
  switch (status) {
    case "final_payment":
      return <CheckCircle2 className="w-3.5 h-3.5 text-status-online" />;
    case "execution":
    case "deal":
    case "pre_deal":
      return <Clock className="w-3.5 h-3.5 text-status-away" />;
    default:
      return <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

const tradeStatusLabel = (status: string) => {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

export default function KycAdmin() {
  const { requestUnlock } = useAmendMode();
  const [amendKyc, setAmendKyc] = useState<KycApplication | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<Record<string, string>>({});
  const [clientUsernames, setClientUsernames] = useState<Record<string, string>>({});
  const [clientPasswords, setClientPasswords] = useState<Record<string, string>>({});
  const [productInput, setProductInput] = useState<Record<string, string>>({});
  const [sendKycPdfApp, setSendKycPdfApp] = useState<KycApplication | null>(null);
  const [sendKycPdfTo, setSendKycPdfTo] = useState("");
  const [sendKycPdfName, setSendKycPdfName] = useState("");
  const [sendKycPdfCc, setSendKycPdfCc] = useState("");
  const [sendKycPdfMsg, setSendKycPdfMsg] = useState("");
  const { toast } = useToast();

  const sendKycPdfMutation = useMutation({
    mutationFn: async ({ id, recipientEmail, recipientName, ccEmail, message }: { id: string; recipientEmail: string; recipientName?: string; ccEmail?: string; message?: string }) => {
      const res = await apiRequest("POST", `/api/kyc/${id}/send-pdf`, { recipientEmail, recipientName, ccEmail: ccEmail || undefined, message: message || undefined });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "KYC PDF sent", description: `Sent to ${data?.sentTo || "recipient"}.` });
      setSendKycPdfApp(null);
    },
    onError: (e: any) => toast({ title: "Failed to send", description: e.message, variant: "destructive" }),
  });

  const { data: applications, isLoading: kycLoading } = useQuery<KycApplication[]>({
    queryKey: ["/api/kyc"],
  });
  const { data: trades, isLoading: tl } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });
  const { data: blocks, isLoading: bl } = useQuery<Block[]>({
    queryKey: ["/api/blocks"],
  });
  const { data: expandedDocs } = useQuery<KycDocument[]>({
    queryKey: ["/api/kyc", expandedId, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/kyc/${expandedId}/documents`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    enabled: !!expandedId,
  });

  const { data: docs, isLoading: dl } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  const { data: enquiries } = useQuery<TradeEnquiry[]>({ queryKey: ["/api/trade-enquiries"] });
  const { data: enquiryChangeRequests } = useQuery<EnquiryChangeRequest[]>({ queryKey: ["/api/enquiry-change-requests"] });
  const [enquiryCRNotes, setEnquiryCRNotes] = useState<Record<string, string>>({});
  const updateEnquiryChangeRequest = useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: string; status: string; adminNotes?: string }) => {
      const res = await apiRequest("PATCH", `/api/enquiry-change-requests/${id}/status`, { status, adminNotes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enquiry-change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trade-enquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
    },
  });

  const { data: changeRequests } = useQuery<KycChangeRequest[]>({
    queryKey: ["/api/kyc-change-requests"],
  });

  const { data: teamKycApps } = useQuery<TeamKycApplication[]>({
    queryKey: ["/api/team-kyc"],
  });

  const { data: teamMembers } = useQuery<TeamMember[]>({
    queryKey: ["/api/team/members"],
  });

  const [kycLinkEmail, setKycLinkEmail] = useState("");
  const [kycLinkSending, setKycLinkSending] = useState(false);
  const [kycLinkCopied, setKycLinkCopied] = useState(false);

  const [blankFormDialogOpen, setBlankFormDialogOpen] = useState(false);
  const [blankFormTo, setBlankFormTo] = useState("");
  const [blankFormName, setBlankFormName] = useState("");
  const [blankFormCc, setBlankFormCc] = useState("");
  const [blankFormMsg, setBlankFormMsg] = useState("");
  const sendBlankKycFormMutation = useMutation({
    mutationFn: async (vars: { recipientEmail: string; recipientName: string; ccEmail: string; message: string }) => {
      return apiRequest("POST", "/api/kyc-form/send-blank-pdf", vars);
    },
    onSuccess: () => {
      toast({ title: "Blank Form Sent", description: `Bullex KYC form emailed to ${blankFormTo.trim()}.` });
      setBlankFormDialogOpen(false); setBlankFormTo(""); setBlankFormName(""); setBlankFormCc(""); setBlankFormMsg("");
    },
    onError: (e: any) => toast({ title: "Send Failed", description: e?.message || "Failed to send blank form.", variant: "destructive" }),
  });

  const kycOnboardingUrl = `${window.location.origin}/kyc`;

  const copyKycLink = async () => {
    try {
      await navigator.clipboard.writeText(kycOnboardingUrl);
      setKycLinkCopied(true);
      setTimeout(() => setKycLinkCopied(false), 2000);
      toast({ title: "Link Copied", description: "KYC onboarding link copied to clipboard." });
    } catch {
      toast({ title: "Copy Failed", description: "Unable to copy to clipboard.", variant: "destructive" });
    }
  };

  const sendKycLinkEmail = async () => {
    if (!kycLinkEmail.trim()) {
      toast({ title: "Email Required", description: "Please enter a recipient email address.", variant: "destructive" });
      return;
    }
    setKycLinkSending(true);
    try {
      await apiRequest("POST", "/api/kyc/send-onboarding-link", { email: kycLinkEmail.trim() });
      toast({ title: "Invitation Sent", description: `KYC onboarding link sent to ${kycLinkEmail.trim()}.` });
      setKycLinkEmail("");
    } catch (err: any) {
      toast({ title: "Send Failed", description: err.message || "Failed to send email.", variant: "destructive" });
    } finally {
      setKycLinkSending(false);
    }
  };

  const [changeRequestNotes, setChangeRequestNotes] = useState<Record<string, string>>({});
  const updateChangeRequest = useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: string; status: string; adminNotes?: string }) => {
      const res = await apiRequest("PATCH", `/api/kyc-change-requests/${id}/status`, { status, adminNotes });
      return res.json();
    },
    onSuccess: (_data: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/kyc-change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kyc"] });
      toast({ title: "Change Request Updated", description: `Request has been ${variables.status}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const isLoading = kycLoading || tl || bl || dl;

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, notes, category, products, clientUsername, clientPassword }: { id: string; status: string; notes?: string; category?: string; products?: string; clientUsername?: string; clientPassword?: string }) => {
      const res = await apiRequest("PATCH", `/api/kyc/${id}/status`, { status, reviewNotes: notes, category, products, clientUsername, clientPassword });
      return res.json();
    },
    onSuccess: (_data: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/kyc"] });
      const action = variables.status === "approved" ? "approved" : variables.status === "rejected" ? "rejected" : "set to pending";
      toast({ title: "KYC Updated", description: `Application has been ${action}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteKyc = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/kyc/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kyc"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-kyc"] });
      toast({ title: "KYC Deleted", description: "The application has been permanently removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    },
  });

  const kycSearchStr = useSearch();
  const focusKycId = new URLSearchParams(kycSearchStr).get("kycId");
  const [, kycNavigate] = useLocation();
  const clearKycFocus = () => kycNavigate("/kyc-admin", { replace: true });

  useEffect(() => {
    if (focusKycId) setExpandedId(focusKycId);
  }, [focusKycId]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-32 rounded-md" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[90px] rounded-md" />
          ))}
        </div>
        <Skeleton className="h-[500px] rounded-md" />
      </div>
    );
  }

  const filtered = focusKycId
    ? (applications?.filter((a) => a.id === focusKycId) || [])
    : (applications
        ?.filter((a) => statusFilter === "all" || a.status === statusFilter)
        .filter((a) =>
          a.companyName.toLowerCase().includes(search.toLowerCase()) ||
          a.contactName.toLowerCase().includes(search.toLowerCase()) ||
          a.contactEmail.toLowerCase().includes(search.toLowerCase()) ||
          a.countryOfIncorporation.toLowerCase().includes(search.toLowerCase())
        ) || []);

  const pendingCount = applications?.filter((a) => a.status === "pending").length || 0;
  const approvedCount = applications?.filter((a) => a.status === "approved").length || 0;
  const rejectedCount = applications?.filter((a) => a.status === "rejected").length || 0;

  const teamKycPending = teamKycApps?.filter((a) => a.status === "pending").length || 0;
  const teamKycApproved = teamKycApps?.filter((a) => a.status === "approved").length || 0;
  const teamKycRejected = teamKycApps?.filter((a) => a.status === "rejected").length || 0;
  const recentTeamKyc = (teamKycApps || []).slice(0, 5);
  const recentKyc = (applications || []).slice(0, 5);

  const totalTrades = trades?.length || 0;
  const latestBlock = blocks && blocks.length > 0 ? blocks[0] : null;
  const totalVolume = trades?.reduce((s, t) => s + t.totalValue, 0) || 0;
  const activeTrades = trades?.filter((t) => t.status !== "final_payment").length || 0;
  const recentTrades = trades?.slice(0, 5) || [];

  return (
    <div className="overflow-y-auto h-full">
      <div className="bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="max-w-2xl flex items-center gap-3.5">
              <div className="p-2 bg-white/10 rounded flex-shrink-0" data-testid="icon-kyc-admin">
                <Shield className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-serif font-bold leading-tight" data-testid="text-kyc-admin-title">
                  KYC Dashboard
                </h1>
                <p className="text-white/60 text-sm leading-snug mt-1">
                  KYC application management, onboarding and compliance review.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/5 border border-white/10 px-3 py-2.5 rounded text-center" data-testid="stat-pending">
                  <div className="text-[10px] text-white/50 uppercase tracking-wider">Pending</div>
                  <div className="text-lg font-bold text-amber-400">{pendingCount}</div>
                </div>
                <div className="bg-white/5 border border-white/10 px-3 py-2.5 rounded text-center" data-testid="stat-approved">
                  <div className="text-[10px] text-white/50 uppercase tracking-wider">Approved</div>
                  <div className="text-lg font-bold text-emerald-400">{approvedCount}</div>
                </div>
                <div className="bg-white/5 border border-white/10 px-3 py-2.5 rounded text-center" data-testid="stat-rejected">
                  <div className="text-[10px] text-white/50 uppercase tracking-wider">Rejected</div>
                  <div className="text-lg font-bold text-red-400">{rejectedCount}</div>
                </div>
              </div>
              <Link href="/kyc">
                <Button
                  size="sm"
                  className="bg-white text-primary hover:bg-white/90 rounded font-bold uppercase tracking-wider text-[11px] h-9 px-3"
                  data-testid="button-new-kyc-onboarding"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  New KYC
                </Button>
              </Link>
            </div>
          </div>

          {/* Onboarding link strip */}
          <div className="bg-white/5 border border-white/10 rounded px-3 py-2.5 flex flex-wrap items-center gap-2" data-testid="card-kyc-onboarding-link">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/60 mr-1">
              <Link2 className="w-3.5 h-3.5" />
              <span>Client KYC Link</span>
            </div>
            <div className="flex flex-1 items-center gap-1.5 bg-white/10 border border-white/10 rounded px-2 py-1 min-w-[180px]">
              <ExternalLink className="w-3 h-3 text-white/50 flex-shrink-0" />
              <span className="text-[11px] text-white/80 truncate font-mono" data-testid="text-kyc-link">{kycOnboardingUrl}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={copyKycLink}
              className="h-8 px-2.5 text-[11px] bg-white/5 border-white/20 text-white hover:bg-white/15 hover:text-white"
              data-testid="button-copy-kyc-link"
            >
              <Copy className="w-3 h-3 mr-1" />
              {kycLinkCopied ? "Copied!" : "Copy"}
            </Button>
            <div className="flex items-center gap-1.5">
              <Input
                placeholder="client@company.com"
                value={kycLinkEmail}
                onChange={(e) => setKycLinkEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendKycLinkEmail()}
                className="h-8 text-[11px] w-48 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                data-testid="input-kyc-link-email"
              />
              <Button
                size="sm"
                onClick={sendKycLinkEmail}
                disabled={kycLinkSending}
                className="h-8 px-2.5 text-[11px] bg-white text-primary hover:bg-white/90"
                data-testid="button-send-kyc-link"
              >
                <Send className="w-3 h-3 mr-1" />
                {kycLinkSending ? "Sending…" : "Send"}
              </Button>
            </div>
            <a href="/api/kyc-form/blank-pdf" target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="h-8 px-2.5 text-[11px] bg-white/5 border-white/20 text-white hover:bg-white/15 hover:text-white" data-testid="button-download-blank-kyc">
                <Download className="w-3 h-3 mr-1" />
                Blank PDF
              </Button>
            </a>
            <Button size="sm" variant="outline" onClick={() => setBlankFormDialogOpen(true)} className="h-8 px-2.5 text-[11px] bg-white/5 border-white/20 text-white hover:bg-white/15 hover:text-white" data-testid="button-email-blank-kyc">
              <Send className="w-3 h-3 mr-1" />
              Email Form
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {false && (() => {
          const allEnq = enquiries || [];
          const enqActive = allEnq.filter((e) => e.status === "active").length;
          const enqAccepted = allEnq.filter((e) => e.status === "accepted").length;
          const enqClosed = allEnq.filter((e) => e.status === "closed").length;
          const enqRejected = allEnq.filter((e) => e.status === "rejected").length;
          const recentEnq = [...allEnq]
            .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
            .slice(0, 6);
          const enqStatusClass = (s: string) =>
            s === "accepted"
              ? "bg-emerald-600/10 border-emerald-600/20 text-emerald-700"
              : s === "rejected"
              ? "bg-red-600/10 border-red-600/20 text-red-700"
              : s === "closed"
              ? "bg-slate-500/10 border-slate-500/20 text-slate-700 dark:text-slate-300"
              : "bg-blue-600/10 border-blue-600/20 text-blue-700";
          const EnqIcon = (s: string) =>
            s === "accepted" ? CheckCircle2 : s === "rejected" ? XCircle : s === "closed" ? AlertCircle : Clock;
          return (
            <Card className="mb-8" data-testid="card-enquiries-summary">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-primary" />
                  Trade Enquiries Status
                </CardTitle>
                <Link href="/trade-enquiries">
                  <Button variant="ghost" size="sm" className="text-xs" data-testid="link-all-enquiries">
                    View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                  <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-center" data-testid="enq-summary-total">
                    <div className="text-2xl font-bold text-primary">{allEnq.length}</div>
                    <div className="text-[10px] uppercase tracking-wider text-primary mt-0.5">Total</div>
                  </div>
                  <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-center" data-testid="enq-summary-active">
                    <div className="text-2xl font-bold text-blue-600">{enqActive}</div>
                    <div className="text-[10px] uppercase tracking-wider text-blue-700 dark:text-blue-400 mt-0.5">Active</div>
                  </div>
                  <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-center" data-testid="enq-summary-accepted">
                    <div className="text-2xl font-bold text-emerald-600">{enqAccepted}</div>
                    <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mt-0.5">Accepted</div>
                  </div>
                  <div className="rounded-md bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 p-3 text-center" data-testid="enq-summary-closed">
                    <div className="text-2xl font-bold text-slate-600 dark:text-slate-300">{enqClosed}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-700 dark:text-slate-400 mt-0.5">Closed</div>
                  </div>
                  <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-center" data-testid="enq-summary-rejected">
                    <div className="text-2xl font-bold text-red-600">{enqRejected}</div>
                    <div className="text-[10px] uppercase tracking-wider text-red-700 dark:text-red-400 mt-0.5">Rejected</div>
                  </div>
                </div>
                <div className="space-y-0">
                  {recentEnq.length > 0 ? recentEnq.map((eq) => {
                    const Icon = EnqIcon(eq.status);
                    const created = new Date(eq.createdAt as any).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
                    return (
                      <Link key={eq.id} href="/trade-enquiries">
                        <a className="flex items-center justify-between gap-3 py-2.5 border-b last:border-b-0 hover-elevate active-elevate-2 px-2 -mx-2 rounded" data-testid={`enq-summary-row-${eq.id}`}>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Package className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                <span className="font-mono text-xs text-muted-foreground mr-1.5">{eq.enquiryRef}</span>
                                {eq.product}
                                {eq.side ? <span className="text-[10px] uppercase ml-1.5 text-muted-foreground">({eq.side})</span> : null}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {eq.quantity ? `${eq.quantity} ${eq.unit || ""}` : "—"}
                                {eq.loadingPort ? ` · ${eq.loadingPort}` : ""}
                                {eq.incoterms ? ` · ${eq.incoterms}` : ""}
                                {` · ${created}`}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className={`rounded-none text-[10px] font-bold shrink-0 ${enqStatusClass(eq.status)}`}>
                            <Icon className="w-2.5 h-2.5 mr-1" />
                            {eq.status.charAt(0).toUpperCase() + eq.status.slice(1)}
                          </Badge>
                        </a>
                      </Link>
                    );
                  }) : (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <ClipboardList className="w-8 h-8 mb-2 opacity-20" />
                      <p className="text-sm">No trade enquiries yet</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {(() => {
          const pendingChangeReqs = changeRequests?.filter((cr) => cr.status === "pending") || [];
          if (pendingChangeReqs.length === 0) return null;
          return (
            <Card className="mb-6 border-amber-300 dark:border-amber-700" data-testid="card-change-requests">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-serif flex items-center gap-2">
                  <Edit className="w-5 h-5 text-amber-600" />
                  Pending Change Requests
                  <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                    {pendingChangeReqs.length}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Approved participants have requested changes to their KYC data. Review and approve or reject below.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {pendingChangeReqs.map((cr) => {
                  const app = applications?.find((a) => a.id === cr.kycApplicationId);
                  const fields = cr.changedFields as Record<string, any>;
                  return (
                    <div key={cr.id} className="border border-border rounded-md p-4 space-y-3" data-testid={`change-request-${cr.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold">{app?.companyName || "Unknown Company"}</p>
                          <p className="text-xs text-muted-foreground">
                            Submitted {new Date(cr.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          </p>
                          {cr.reason && (
                            <p className="text-xs text-muted-foreground mt-1 italic">Reason: {cr.reason}</p>
                          )}
                        </div>
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          <Clock className="w-3 h-3 mr-1" /> Pending
                        </Badge>
                      </div>
                      <div className="bg-muted/50 rounded p-3 space-y-2">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Proposed Changes</p>
                        {Object.entries(fields).map(([key, val]) => {
                          const currentVal = app ? (app as any)[key] : undefined;
                          const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (c: string) => c.toUpperCase());
                          return (
                            <div key={key} className="grid grid-cols-3 gap-2 text-xs">
                              <span className="font-medium text-muted-foreground">{label}</span>
                              <span className="text-red-500 line-through truncate" title={String(currentVal || "—")}>{String(currentVal || "—")}</span>
                              <span className="text-emerald-600 font-medium truncate" title={String(val)}>{String(val)}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Admin notes (optional)..."
                          className="text-xs h-16 rounded-none"
                          value={changeRequestNotes[cr.id] || ""}
                          onChange={(e) => setChangeRequestNotes((prev) => ({ ...prev, [cr.id]: e.target.value }))}
                          data-testid={`input-cr-notes-${cr.id}`}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => updateChangeRequest.mutate({ id: cr.id, status: "approved", adminNotes: changeRequestNotes[cr.id] })}
                            disabled={updateChangeRequest.isPending}
                            data-testid={`button-approve-cr-${cr.id}`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve & Apply
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-none border-red-300 text-red-600 hover:bg-red-50"
                            onClick={() => updateChangeRequest.mutate({ id: cr.id, status: "rejected", adminNotes: changeRequestNotes[cr.id] })}
                            disabled={updateChangeRequest.isPending}
                            data-testid={`button-reject-cr-${cr.id}`}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })()}

        {false && (() => {
          const pendingEnquiryCRs = enquiryChangeRequests?.filter((cr) => cr.status === "pending") || [];
          if (pendingEnquiryCRs.length === 0) return null;
          return (
            <Card className="mb-6 border-amber-300 dark:border-amber-700" data-testid="card-enquiry-change-requests">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-serif flex items-center gap-2">
                  <Edit className="w-5 h-5 text-amber-600" />
                  Pending Enquiry Amendments
                  <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                    {pendingEnquiryCRs.length}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Team members have requested changes to their enquiries. Approving will record the amendment on-chain.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {pendingEnquiryCRs.map((cr) => {
                  const eq = enquiries?.find((e) => e.id === cr.enquiryId);
                  const fields = cr.changedFields as Record<string, any>;
                  return (
                    <div key={cr.id} className="border border-border rounded-md p-4 space-y-3" data-testid={`enquiry-change-request-${cr.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold">{eq?.enquiryRef || "Unknown Enquiry"} <span className="text-muted-foreground font-normal">— {eq?.product || ""}</span></p>
                          <p className="text-xs text-muted-foreground">
                            Submitted {new Date(cr.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          </p>
                          {cr.reason && <p className="text-xs text-muted-foreground mt-1 italic">Reason: {cr.reason}</p>}
                        </div>
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          <Clock className="w-3 h-3 mr-1" /> Pending
                        </Badge>
                      </div>
                      <div className="bg-muted/50 rounded p-3 space-y-2">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Proposed Changes</p>
                        {Object.entries(fields).map(([key, val]) => {
                          const currentVal = eq ? (eq as any)[key] : undefined;
                          const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (c: string) => c.toUpperCase());
                          return (
                            <div key={key} className="grid grid-cols-3 gap-2 text-xs">
                              <span className="font-medium text-muted-foreground">{label}</span>
                              <span className="text-red-500 line-through truncate" title={String(currentVal || "—")}>{String(currentVal || "—")}</span>
                              <span className="text-emerald-600 font-medium truncate" title={String(val)}>{String(val)}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Admin notes (optional)..."
                          className="text-xs h-16 rounded-none"
                          value={enquiryCRNotes[cr.id] || ""}
                          onChange={(e) => setEnquiryCRNotes((prev) => ({ ...prev, [cr.id]: e.target.value }))}
                          data-testid={`input-enq-cr-notes-${cr.id}`}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => updateEnquiryChangeRequest.mutate({ id: cr.id, status: "approved", adminNotes: enquiryCRNotes[cr.id] })}
                            disabled={updateEnquiryChangeRequest.isPending}
                            data-testid={`button-approve-enq-cr-${cr.id}`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve & Apply
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-none border-red-300 text-red-600 hover:bg-red-50"
                            onClick={() => updateEnquiryChangeRequest.mutate({ id: cr.id, status: "rejected", adminNotes: enquiryCRNotes[cr.id] })}
                            disabled={updateEnquiryChangeRequest.isPending}
                            data-testid={`button-reject-enq-cr-${cr.id}`}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })()}

        {focusKycId && (
          <div className="flex items-center justify-between gap-3 border border-primary/30 bg-primary/5 px-3 py-2 rounded-md mb-4" data-testid="banner-kyc-focus">
            <p className="text-xs text-foreground">
              Showing a single KYC application opened from the team submissions view.
            </p>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={clearKycFocus} data-testid="button-clear-kyc-focus">
              Show all applications
            </Button>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-serif font-bold text-foreground" data-testid="text-applications-heading">
              KYC Applications
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {applications?.length || 0} total applications
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search company, contact..."
                className="pl-8 w-56 h-10 rounded-none border-border"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-kyc"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 h-10 rounded-none border-border" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-0 border border-border" data-testid="card-kyc-table">
          <div className="grid grid-cols-12 gap-2 px-5 py-3 bullex-header-dark border-b border-border text-xs font-bold uppercase tracking-wider text-white/80">
            <div className="col-span-3">Company</div>
            <div className="col-span-2">Country</div>
            <div className="col-span-2">Contact</div>
            <div className="col-span-2">Submitted</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1"></div>
          </div>

          {filtered.length > 0 ? (
            filtered.map((app) => {
              const isExpanded = expandedId === app.id;
              const config = statusConfig[app.status] || statusConfig.pending;
              const StatusIcon = config.icon;

              return (
                <div key={app.id} className="border-b border-border last:border-b-0" data-testid={`kyc-row-${app.id}`}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    aria-controls={`kyc-detail-${app.id}`}
                    className="w-full grid grid-cols-12 gap-2 px-5 py-4 items-center hover:bg-muted/30 transition-colors text-left cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : app.id)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedId(isExpanded ? null : app.id);
                      }
                    }}
                    data-testid={`button-expand-kyc-${app.id}`}
                  >
                    <div className="col-span-3">
                      <div className="text-sm font-bold text-foreground">{app.companyName}</div>
                      <div className="text-xs text-muted-foreground">{app.registrationNumber}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-sm">{app.countryOfIncorporation}</span>
                    </div>
                    <div className="col-span-2">
                      <div className="text-sm">{app.contactName}</div>
                      <div className="text-xs text-muted-foreground">{app.contactEmail}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-sm text-muted-foreground">
                        {new Date(app.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <Badge variant="outline" className={`rounded-none text-[10px] font-bold ${config.bg}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {config.label}
                      </Badge>
                    </div>
                    <div className="col-span-1 flex justify-end items-center gap-1">
                      <button
                        type="button"
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        disabled={deleteKyc.isPending}
                        title={`Delete KYC for ${app.companyName}`}
                        onKeyDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          const confirmed = window.confirm(
                            `Permanently delete KYC for "${app.companyName}" (status: ${app.status})?\n\nThis removes the application, its uploaded documents and any change requests. This cannot be undone.`
                          );
                          if (confirmed) deleteKyc.mutate(app.id);
                        }}
                        data-testid={`button-row-delete-kyc-${app.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border bg-muted/10" data-testid={`kyc-detail-${app.id}`}>
                      <div className="px-5 pt-4 pb-2 flex flex-wrap gap-2 justify-end border-b border-border/40">
                        <a
                          href={`/api/kyc/${app.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          data-testid={`link-download-kyc-pdf-${app.id}`}
                        >
                          <Button size="sm" variant="outline" className="rounded-none h-9 text-xs font-bold uppercase tracking-wider">
                            <Download className="w-3.5 h-3.5 mr-1.5" /> Download KYC PDF
                          </Button>
                        </a>
                        <Button
                          size="sm"
                          className="rounded-none h-9 text-xs font-bold uppercase tracking-wider bg-primary hover:bg-primary/90 text-primary-foreground"
                          onClick={() => {
                            setSendKycPdfApp(app);
                            setSendKycPdfTo(app.contactEmail || app.signatoryEmail || "");
                            setSendKycPdfName(app.contactName || app.signatoryName || "");
                            setSendKycPdfCc("");
                            setSendKycPdfMsg("");
                          }}
                          data-testid={`button-send-kyc-pdf-${app.id}`}
                        >
                          <Send className="w-3.5 h-3.5 mr-1.5" /> Send PDF to Client
                        </Button>
                      </div>
                      <div className="px-5 py-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div>
                          <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-4 flex items-center gap-2">
                            <Building2 className="w-4 h-4" /> Company Details
                          </h4>
                          <div className="space-y-2">
                            {[
                              ["Company Name", app.companyName],
                              ["Registered Address", app.registeredAddress],
                              ["Business Address", app.primaryBusinessAddress],
                              ["Date of Incorporation", app.dateOfIncorporation],
                              ["Country of Incorporation", app.countryOfIncorporation],
                              ["Country of Operation", app.countryOfOperation],
                              ["Registration Number", app.registrationNumber],
                              ["Tax ID", app.taxIdNumber],
                              ["Business Type", app.businessType],
                            ].map(([label, value]) => (
                              <div key={label} className="flex justify-between py-1.5 border-b border-border/30 text-sm">
                                <span className="text-muted-foreground text-xs">{label}</span>
                                <span className="font-medium text-right max-w-[60%] break-words">{value || "—"}</span>
                              </div>
                            ))}
                          </div>

                          <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-3 mt-6 flex items-center gap-2">
                            <User className="w-4 h-4" /> Contact & Signatory
                          </h4>
                          <div className="space-y-2">
                            {[
                              ["Contact Name", app.contactName],
                              ["Title", app.contactTitle],
                              ["Phone", app.contactPhone],
                              ["Email", app.contactEmail],
                              ["Website", app.website],
                              ["Signatory", app.signatoryName],
                              ["Signatory Title", app.signatoryTitle],
                              ["Signatory Company", app.signatoryCompany],
                              ["Signatory Email", app.signatoryEmail],
                              ["Filled By", app.filledByName],
                              ["Filled By Email", app.filledByEmail],
                            ].map(([label, value]) => (
                              <div key={label} className="flex justify-between py-1.5 border-b border-border/30 text-sm">
                                <span className="text-muted-foreground text-xs">{label}</span>
                                <span className="font-medium text-right max-w-[60%] break-words">{value || "—"}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-4 flex items-center gap-2">
                            <Landmark className="w-4 h-4" /> Financial & Banking
                          </h4>
                          <div className="space-y-2">
                            {[
                              ["Bank Name", app.bankName],
                              ["Bank Branch", app.bankBranch],
                              ["Account Name", app.accountName],
                              ["Account Number", app.accountNumber],
                              ["SWIFT Code", app.swiftCode],
                              ["Currency", app.bankAccountCurrency],
                              ["Bank Officer Name", app.bankOfficerName],
                              ["Bank Officer Email", app.bankOfficerEmail],
                              ["Share Capital", app.shareCapital],
                              ["Capital Range", app.capitalRange],
                              ["Financial Currency", app.financialCurrency],
                              ["Sales Revenue", app.salesRevenue],
                              ["Net Income", app.netIncome],
                              ["Total Equity", app.totalEquity],
                              ["External Auditors", app.externalAuditors],
                            ].map(([label, value]) => (
                              <div key={label} className="flex justify-between py-1.5 border-b border-border/30 text-sm">
                                <span className="text-muted-foreground text-xs">{label}</span>
                                <span className="font-medium text-right max-w-[60%] break-words">{value || "—"}</span>
                              </div>
                            ))}
                          </div>

                          <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-3 mt-6 flex items-center gap-2">
                            <Users className="w-4 h-4" /> Ownership & HR
                          </h4>
                          <div className="space-y-2">
                            {[
                              ...(app.ultimateBeneficialOwners ? app.ultimateBeneficialOwners.split("\n").filter(Boolean).map((line: string, i: number) => {
                                const p = line.split(" — ");
                                return [`UBO ${i + 1}`, `${p[0] || ""}  |  DOB: ${p[1] || "N/A"}  |  Nationality: ${p[2] || "N/A"}  |  Passport: ${p[3] || "N/A"}  |  ${p[4] || "N/A"}`];
                              }) : [["UBO", "—"]]),
                              ...(app.shareholders ? app.shareholders.split("\n").filter(Boolean).map((line: string, i: number) => {
                                const p = line.split(" — ");
                                return [`Shareholder ${i + 1}`, `${p[0] || ""}  |  Nationality: ${p[1] || "N/A"}  |  ${p[2] || "N/A"}`];
                              }) : [["Shareholders", "—"]]),
                              ["Management", app.managementStructure],
                              ["Subsidiaries", app.subsidiaries],
                              ["Employees (Company)", app.employeesCompany],
                              ["Employees (Group)", app.employeesGroup],
                            ].map(([label, value]) => (
                              <div key={label} className="flex justify-between py-1.5 border-b border-border/30 text-sm">
                                <span className="text-muted-foreground text-xs">{label}</span>
                                <span className="font-medium text-right max-w-[60%] break-words">{value || "—"}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-4 flex items-center gap-2">
                            <FileText className="w-4 h-4" /> Compliance & AML
                          </h4>
                          <div className="space-y-2">
                            {[
                              ["AML Subject", app.amlSubject],
                              ["AML Program", app.amlConformityProgram],
                              ["AML Regulator", app.amlRegulator],
                              ["AML Law", app.amlLawName],
                              ["Previous Bullfrog Employee", app.previousBullfrogEmployee],
                              ["Core Business", app.coreBusinessDescription],
                            ].map(([label, value]) => (
                              <div key={label} className="flex justify-between py-1.5 border-b border-border/30 text-sm">
                                <span className="text-muted-foreground text-xs">{label}</span>
                                <span className="font-medium text-right max-w-[60%] break-words">{value || "—"}</span>
                              </div>
                            ))}
                          </div>

                          <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-4 mt-6 flex items-center gap-2">
                            <FileCheck className="w-4 h-4" /> Attached Documents
                          </h4>
                          {expandedDocs && expandedDocs.length > 0 ? (
                            <div className="space-y-2 mb-6">
                              {expandedDocs.map((doc) => (
                                <div key={doc.id} className="flex items-center justify-between p-3 border border-border bg-muted/30" data-testid={`admin-doc-${doc.id}`}>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <FileText className="w-4 h-4 text-primary shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate">{doc.originalName}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {doc.documentType} · {doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : "—"}
                                      </p>
                                    </div>
                                  </div>
                                  <a
                                    href={`/api/kyc-documents/${doc.id}/download`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    data-testid={`admin-download-doc-${doc.id}`}
                                  >
                                    <Button size="sm" variant="outline" className="rounded-none h-8 text-xs gap-1.5">
                                      <Download className="w-3.5 h-3.5" />
                                      Download
                                    </Button>
                                  </a>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground mb-6">No documents attached to this application.</p>
                          )}

                          <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-4 mt-6 flex items-center gap-2">
                            <Shield className="w-4 h-4" /> Admin Review
                          </h4>

                          <div className="space-y-4">
                            <div className="p-4 border border-border bg-card">
                              <div className="flex items-center gap-2 mb-3">
                                <StatusIcon className={`w-4 h-4 ${config.color}`} />
                                <span className={`text-sm font-bold ${config.color}`}>{config.label}</span>
                              </div>

                              {app.reviewNotes && (
                                <div className="mb-4 p-3 bg-muted/50 border border-border/50 text-sm">
                                  <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Review Notes</span>
                                  <span className="text-foreground">{app.reviewNotes}</span>
                                </div>
                              )}

                              {app.status === "approved" ? (
                                <div className="space-y-3">
                                  <div className="p-3 bg-emerald-600/5 border border-emerald-600/20 text-sm">
                                    <div className="flex items-center gap-2 mb-2">
                                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Application Approved</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">This application has been approved.</p>
                                  </div>
                                  <AmlScreeningPanel app={app} />
                                  {(app as any).participantId && (
                                    <div className="flex justify-between items-center py-1.5 border-b border-border/30 text-sm">
                                      <span className="text-muted-foreground text-xs uppercase tracking-wider">Participant ID</span>
                                      <span className="font-mono font-bold text-primary" data-testid={`text-client-participant-id-${app.id}`}>{(app as any).participantId}</span>
                                    </div>
                                  )}
                                  {app.blockchainHash && (
                                    <div className="p-3 bg-primary/5 border border-primary/20 text-sm space-y-1">
                                      <div className="flex items-center gap-2">
                                        <Shield className="w-4 h-4 text-primary" />
                                        <span className="text-xs font-bold uppercase tracking-wider text-primary">Blockchain Verified</span>
                                        <span className="text-[10px] text-muted-foreground ml-auto">Block #{app.blockNumber}</span>
                                      </div>
                                      <p className="font-mono text-[10px] break-all text-muted-foreground">{app.blockchainHash}</p>
                                    </div>
                                  )}
                                  {app.category && (
                                    <div className="flex justify-between py-1.5 border-b border-border/30 text-sm">
                                      <span className="text-muted-foreground text-xs">Category</span>
                                      <span className="font-medium">{app.category}</span>
                                    </div>
                                  )}
                                  {app.products && (
                                    <div className="flex justify-between py-1.5 border-b border-border/30 text-sm">
                                      <span className="text-muted-foreground text-xs">Products</span>
                                      <span className="font-medium text-right max-w-[60%] break-words">{app.products}</span>
                                    </div>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full rounded-none h-9 text-xs font-bold uppercase tracking-wider mt-2 gap-1.5"
                                    onClick={() => requestUnlock(() => setAmendKyc(app))}
                                    data-testid={`button-amend-kyc-${app.id}`}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                    Amend (Admin)
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="w-full rounded-none h-9 text-xs font-bold uppercase tracking-wider gap-1.5"
                                    onClick={async () => {
                                      try {
                                        const r = await apiRequest("POST", `/api/kyc/${app.id}/generate-ncnda`, {});
                                        const created = await r.json();
                                        queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
                                        toast({ title: "NCNDA generated", description: `Opening NCNDA for ${app.companyName}…` });
                                        try { sessionStorage.setItem("openDocId", created.id); } catch {}
                                        window.location.assign(`/documents?openDocId=${created.id}`);
                                      } catch (err: any) {
                                        console.error("[generate-ncnda]", err);
                                        toast({ title: "NCNDA generation failed", description: err?.message || "Could not generate NCNDA.", variant: "destructive" });
                                      }
                                    }}
                                    data-testid={`button-generate-ncnda-${app.id}`}
                                  >
                                    <FileSignature className="w-3.5 h-3.5" />
                                    Generate NCNDA
                                  </Button>
                                  {(() => {
                                    const AGENT_CATEGORIES = ["Port Agent","Shipping Agent","Chartering Broker","Custom Clearing Agent","Stevedoring Agent","Analysis Agency"];
                                    if (!app.category || !AGENT_CATEGORIES.includes(app.category)) return null;
                                    return (
                                      <Button
                                        size="sm"
                                        variant="default"
                                        className="w-full rounded-none h-9 text-xs font-bold uppercase tracking-wider gap-1.5"
                                        onClick={async () => {
                                          try {
                                            const r = await apiRequest("POST", `/api/kyc/${app.id}/generate-ica`, {
                                              agentLabel: app.category === "Chartering Broker" ? "Broker" : "Agent",
                                              agencyType: "Non-Exclusive",
                                            });
                                            const created = await r.json();
                                            queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
                                            toast({ title: "ICA generated", description: `Opening ICA for ${app.companyName}…` });
                                            try { sessionStorage.setItem("openDocId", created.id); } catch {}
                                            window.location.assign(`/documents?openDocId=${created.id}`);
                                          } catch (err: any) {
                                            console.error("[generate-ica]", err);
                                            toast({ title: "ICA generation failed", description: err?.message || "Could not generate ICA.", variant: "destructive" });
                                          }
                                        }}
                                        data-testid={`button-generate-ica-${app.id}`}
                                      >
                                        <FileSignature className="w-3.5 h-3.5" />
                                        Generate ICA
                                      </Button>
                                    );
                                  })()}
                                </div>
                              ) : (
                              <div className="space-y-3">
                                <div className="space-y-1.5">
                                  <label className="text-xs font-bold uppercase tracking-wider text-primary">Category</label>
                                  {(() => {
                                    const KNOWN = ["Producer","Buyer","Seller","Analysis Agency","Port Agent","Shipping Agent","Chartering Broker","Ship Owner","Custom Clearing Agent","Stevedoring Agent","Trading House"];
                                    const raw = categories[app.id] !== undefined ? categories[app.id] : (app.category || "");
                                    const isOther = raw && !KNOWN.includes(raw);
                                    const dropdownVal = isOther ? "Others" : raw;
                                    return (
                                      <>
                                        <Select
                                          value={dropdownVal}
                                          onValueChange={(val) => setCategories({ ...categories, [app.id]: val === "Others" ? "Others: " : val })}
                                        >
                                          <SelectTrigger className="rounded-none h-10 border-border text-sm" data-testid={`select-category-${app.id}`}>
                                            <SelectValue placeholder="Assign a category..." />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {KNOWN.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                            <SelectItem value="Others">Others (specify)</SelectItem>
                                          </SelectContent>
                                        </Select>
                                        {(dropdownVal === "Others") && (
                                          <Input
                                            className="rounded-none h-10 border-border text-sm mt-2"
                                            placeholder="Please specify category..."
                                            value={raw.startsWith("Others: ") ? raw.slice(8) : (raw === "Others" ? "" : raw)}
                                            onChange={(e) => setCategories({ ...categories, [app.id]: "Others: " + e.target.value })}
                                            data-testid={`input-category-other-${app.id}`}
                                          />
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>

                                <div className="space-y-1.5">
                                  <label className="text-xs font-bold uppercase tracking-wider text-primary">Products</label>
                                  {(() => {
                                    const currentProducts = (products[app.id] !== undefined ? products[app.id] : (app.products || ""))
                                      .split(",").map((p: string) => p.trim()).filter(Boolean);
                                    const addProduct = (value: string) => {
                                      const trimmed = value.trim();
                                      if (!trimmed) return;
                                      const newItems = trimmed.split(",").map((p: string) => p.trim()).filter(Boolean);
                                      const updated = [...new Set([...currentProducts, ...newItems])];
                                      setProducts({ ...products, [app.id]: updated.join(", ") });
                                      setProductInput({ ...productInput, [app.id]: "" });
                                    };
                                    const removeProduct = (idx: number) => {
                                      const updated = currentProducts.filter((_: string, i: number) => i !== idx);
                                      setProducts({ ...products, [app.id]: updated.join(", ") });
                                    };
                                    return (
                                      <div className="space-y-2">
                                        {currentProducts.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5">
                                            {currentProducts.map((product: string, idx: number) => (
                                              <Badge
                                                key={idx}
                                                variant="secondary"
                                                className="text-xs px-2 py-1 rounded-none flex items-center gap-1"
                                                data-testid={`badge-product-${app.id}-${idx}`}
                                              >
                                                {product}
                                                <button
                                                  type="button"
                                                  className="ml-0.5 hover:text-destructive transition-colors"
                                                  onClick={() => removeProduct(idx)}
                                                  data-testid={`button-remove-product-${app.id}-${idx}`}
                                                >
                                                  <X className="w-3 h-3" />
                                                </button>
                                              </Badge>
                                            ))}
                                          </div>
                                        )}
                                        <div className="flex gap-1.5">
                                          <Input
                                            className="rounded-none h-9 border-border text-sm flex-1"
                                            placeholder="Type a product and press Enter..."
                                            value={productInput[app.id] || ""}
                                            onChange={(e) => setProductInput({ ...productInput, [app.id]: e.target.value })}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                e.preventDefault();
                                                addProduct(productInput[app.id] || "");
                                              }
                                            }}
                                            data-testid={`input-products-${app.id}`}
                                          />
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="rounded-none h-9 px-2"
                                            onClick={() => addProduct(productInput[app.id] || "")}
                                            data-testid={`button-add-product-${app.id}`}
                                          >
                                            <Plus className="w-3.5 h-3.5" />
                                          </Button>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>

                                <div className="space-y-1.5">
                                  <label className="text-xs font-bold uppercase tracking-wider text-primary">Review Notes</label>
                                  <Textarea
                                    className="rounded-none min-h-[80px] resize-none border-border text-sm"
                                    placeholder="Optional notes for this decision..."
                                    value={reviewNotes[app.id] || ""}
                                    onChange={(e) => setReviewNotes({ ...reviewNotes, [app.id]: e.target.value })}
                                    data-testid={`textarea-review-${app.id}`}
                                  />
                                </div>

                                {app.status !== "approved" && (
                                  <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase tracking-wider text-primary">Client Portal Credentials</label>
                                    <p className="text-[10px] text-muted-foreground">Optional. If provided, these credentials will be sent to the client upon approval.</p>
                                    <div className="grid grid-cols-2 gap-2">
                                      <Input
                                        className="rounded-none border-border text-sm"
                                        placeholder="Username"
                                        value={clientUsernames[app.id] || ""}
                                        onChange={(e) => setClientUsernames({ ...clientUsernames, [app.id]: e.target.value })}
                                        data-testid={`input-client-username-${app.id}`}
                                      />
                                      <Input
                                        className="rounded-none border-border text-sm"
                                        placeholder="Password"
                                        value={clientPasswords[app.id] || ""}
                                        onChange={(e) => setClientPasswords({ ...clientPasswords, [app.id]: e.target.value })}
                                        data-testid={`input-client-password-${app.id}`}
                                      />
                                    </div>
                                  </div>
                                )}

                                <AmlScreeningPanel app={app} />

                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="flex-1 rounded-none h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider disabled:bg-muted disabled:text-muted-foreground"
                                    disabled={updateStatus.isPending || !["clear", "manual_clear"].includes((app as any).amlStatus || "not_run")}
                                    title={!["clear", "manual_clear"].includes((app as any).amlStatus || "not_run") ? "Complete AML / World-Check screening first" : ""}
                                    onClick={() => {
                                      updateStatus.mutate({ id: app.id, status: "approved", notes: reviewNotes[app.id], category: categories[app.id] || app.category || undefined, products: products[app.id] !== undefined ? products[app.id] : (app.products || undefined), clientUsername: clientUsernames[app.id] || undefined, clientPassword: clientPasswords[app.id] || undefined });
                                    }}
                                    data-testid={`button-approve-${app.id}`}
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="flex-1 rounded-none h-10 text-xs font-bold uppercase tracking-wider"
                                    disabled={updateStatus.isPending || app.status === "rejected"}
                                    onClick={() => updateStatus.mutate({ id: app.id, status: "rejected", notes: reviewNotes[app.id], category: categories[app.id] || app.category || undefined, products: products[app.id] !== undefined ? products[app.id] : (app.products || undefined) })}
                                    data-testid={`button-reject-${app.id}`}
                                  >
                                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                                    Reject
                                  </Button>
                                </div>

                                {app.status === "rejected" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full rounded-none h-9 text-xs font-bold uppercase tracking-wider"
                                    disabled={updateStatus.isPending}
                                    onClick={() => updateStatus.mutate({ id: app.id, status: "pending", notes: reviewNotes[app.id], category: categories[app.id] || app.category || undefined, products: products[app.id] !== undefined ? products[app.id] : (app.products || undefined) })}
                                    data-testid={`button-reset-${app.id}`}
                                  >
                                    <Clock className="w-3.5 h-3.5 mr-1.5" />
                                    Reset to Pending
                                  </Button>
                                )}
                              </div>
                              )}

                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full mt-3 rounded-none h-9 text-xs font-bold uppercase tracking-wider border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                disabled={deleteKyc.isPending}
                                onClick={() => {
                                  const confirmed = window.confirm(
                                    `Permanently delete KYC for "${app.companyName}" (status: ${app.status})?\n\nThis removes the application, its uploaded documents and any change requests. This cannot be undone.`
                                  );
                                  if (confirmed) deleteKyc.mutate(app.id);
                                }}
                                data-testid={`button-delete-kyc-${app.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                Delete KYC
                              </Button>
                            </div>
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
              <p className="text-sm font-medium">No applications found</p>
              <p className="text-xs mt-1">
                {search || statusFilter !== "all" ? "Adjust your filters" : "KYC applications will appear here once submitted"}
              </p>
            </div>
          )}
        </div>

      </div>

      <Dialog open={blankFormDialogOpen} onOpenChange={setBlankFormDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-email-blank-kyc">
          <DialogHeader>
            <DialogTitle>Email Blank KYC Application Form</DialogTitle>
            <DialogDescription>Send a printable Bullex KYC form to a client to complete offline.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1">
              <Label className="text-xs">Recipient Email *</Label>
              <Input value={blankFormTo} onChange={(e) => setBlankFormTo(e.target.value)} placeholder="client@example.com" data-testid="input-blank-kyc-to" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Recipient Name</Label>
              <Input value={blankFormName} onChange={(e) => setBlankFormName(e.target.value)} placeholder="Mr. John Doe" data-testid="input-blank-kyc-name" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">CC (optional)</Label>
              <Input value={blankFormCc} onChange={(e) => setBlankFormCc(e.target.value)} placeholder="cc@example.com" data-testid="input-blank-kyc-cc" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Message (optional)</Label>
              <Textarea value={blankFormMsg} onChange={(e) => setBlankFormMsg(e.target.value)} rows={3} placeholder="Add a short note for the recipient…" data-testid="input-blank-kyc-msg" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBlankFormDialogOpen(false)} data-testid="button-blank-kyc-cancel">Cancel</Button>
            <Button
              disabled={sendBlankKycFormMutation.isPending || !blankFormTo.trim()}
              onClick={() => sendBlankKycFormMutation.mutate({ recipientEmail: blankFormTo.trim(), recipientName: blankFormName.trim(), ccEmail: blankFormCc.trim(), message: blankFormMsg.trim() })}
              data-testid="button-blank-kyc-confirm"
            >
              <Send className="w-4 h-4 mr-1.5" />
              {sendBlankKycFormMutation.isPending ? "Sending…" : "Send Form"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sendKycPdfApp} onOpenChange={(o) => !o && setSendKycPdfApp(null)}>
        <DialogContent className="max-w-lg" data-testid="dialog-send-kyc-pdf">
          <DialogHeader>
            <DialogTitle>Send KYC Application PDF</DialogTitle>
            <DialogDescription>
              Email the full KYC application PDF for <span className="font-semibold">{sendKycPdfApp?.companyName}</span> to a recipient.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1">
              <Label className="text-xs">Recipient Email *</Label>
              <Input value={sendKycPdfTo} onChange={(e) => setSendKycPdfTo(e.target.value)} placeholder="client@example.com" data-testid="input-send-kyc-pdf-to" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Recipient Name</Label>
              <Input value={sendKycPdfName} onChange={(e) => setSendKycPdfName(e.target.value)} placeholder="Mr. John Doe" data-testid="input-send-kyc-pdf-name" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">CC (optional)</Label>
              <Input value={sendKycPdfCc} onChange={(e) => setSendKycPdfCc(e.target.value)} placeholder="cc@example.com" data-testid="input-send-kyc-pdf-cc" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Message (optional)</Label>
              <Textarea value={sendKycPdfMsg} onChange={(e) => setSendKycPdfMsg(e.target.value)} rows={3} placeholder="Add a short note for the recipient…" data-testid="input-send-kyc-pdf-msg" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendKycPdfApp(null)} data-testid="button-send-kyc-pdf-cancel">Cancel</Button>
            <Button
              disabled={sendKycPdfMutation.isPending || !sendKycPdfTo.trim() || !sendKycPdfApp}
              onClick={() => sendKycPdfApp && sendKycPdfMutation.mutate({ id: sendKycPdfApp.id, recipientEmail: sendKycPdfTo.trim(), recipientName: sendKycPdfName.trim(), ccEmail: sendKycPdfCc.trim(), message: sendKycPdfMsg.trim() })}
              data-testid="button-send-kyc-pdf-confirm"
            >
              <Send className="w-4 h-4 mr-1.5" />
              {sendKycPdfMutation.isPending ? "Sending…" : "Send PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {amendKyc && (
        <AmendDialog
          open={!!amendKyc}
          onOpenChange={(o) => { if (!o) setAmendKyc(null); }}
          title={`Amend KYC — ${(amendKyc as any).companyName || amendKyc.id}`}
          description="Edit approved KYC fields. Blockchain hash, status, and AML decision are immutable."
          endpoint={`/api/kyc/${amendKyc.id}/amend`}
          invalidateKeys={["/api/kyc-applications", "/api/kyc", "/api/team-kyc"]}
          initialValues={{
            companyName: (amendKyc as any).companyName ?? "",
            legalEntityType: (amendKyc as any).legalEntityType ?? "",
            registrationNumber: (amendKyc as any).registrationNumber ?? "",
            registeredAddress: (amendKyc as any).registeredAddress ?? "",
            operatingAddress: (amendKyc as any).operatingAddress ?? "",
            countryOfIncorporation: (amendKyc as any).countryOfIncorporation ?? "",
            taxId: (amendKyc as any).taxId ?? "",
            website: (amendKyc as any).website ?? "",
            primaryContactName: (amendKyc as any).primaryContactName ?? "",
            primaryContactEmail: (amendKyc as any).primaryContactEmail ?? "",
            primaryContactPhone: (amendKyc as any).primaryContactPhone ?? "",
            primaryContactRole: (amendKyc as any).primaryContactRole ?? "",
            authorizedSignatoryName: (amendKyc as any).authorizedSignatoryName ?? "",
            authorizedSignatoryRole: (amendKyc as any).authorizedSignatoryRole ?? "",
            authorizedSignatoryEmail: (amendKyc as any).authorizedSignatoryEmail ?? "",
            bankName: (amendKyc as any).bankName ?? "",
            bankAccountNumber: (amendKyc as any).bankAccountNumber ?? "",
            bankSwiftCode: (amendKyc as any).bankSwiftCode ?? "",
            bankIban: (amendKyc as any).bankIban ?? "",
            category: amendKyc.category ?? "",
            products: amendKyc.products ?? "",
            reviewNotes: amendKyc.reviewNotes ?? "",
          }}
          sections={KYC_AMEND_SECTIONS}
        />
      )}
    </div>
  );
}

function AmlScreeningPanel({ app, readOnly = false }: { app: any; readOnly?: boolean }) {
  const { toast } = useToast();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideNotes, setOverrideNotes] = useState("");
  const [overrideDecision, setOverrideDecision] = useState<"manual_clear" | "blocked">("manual_clear");
  const status: string = app.amlStatus || "not_run";
  const matches: any[] = Array.isArray(app.amlMatches) ? app.amlMatches : [];
  const positives = matches.filter(m => m.match === true || (m.score != null && m.score >= 0.7));
  const ofacStatus: string = app.ofacStatus || "not_run";
  const unSanctionsStatus: string = app.unSanctionsStatus || "not_run";
  const pepStatus: string = app.pepStatus || "not_run";
  const subBadgeClass = (s: string) => {
    if (s === "hit") return "bg-red-100 text-red-700 border-red-300";
    if (s === "clear") return "bg-emerald-100 text-emerald-700 border-emerald-300";
    return "bg-gray-100 text-gray-600 border-gray-300";
  };
  const subBadgeLabel = (s: string) => (s === "hit" ? "Hit" : s === "clear" ? "Clear" : "Not Run");

  const runCheck = useMutation({
    mutationFn: () => apiRequest("POST", `/api/kyc/${app.id}/aml-check`, {}),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/kyc"] });
      toast({
        title: data.amlStatus === "clear" ? "Screening Clear" : "Screening Flagged",
        description: `${data.matchCount} total result${data.matchCount === 1 ? "" : "s"}, ${data.positiveCount} potential match${data.positiveCount === 1 ? "" : "es"}.`,
        variant: data.amlStatus === "clear" ? "default" : "destructive",
      });
    },
    onError: (err: any) => toast({ title: "Screening failed", description: err.message, variant: "destructive" }),
  });

  const override = useMutation({
    mutationFn: () => apiRequest("POST", `/api/kyc/${app.id}/aml-override`, { decision: overrideDecision, notes: overrideNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kyc"] });
      setOverrideOpen(false); setOverrideNotes("");
      toast({ title: "AML decision saved" });
    },
    onError: (err: any) => toast({ title: "Override failed", description: err.message, variant: "destructive" }),
  });

  const badge = (() => {
    switch (status) {
      case "clear": return { c: "bg-emerald-100 text-emerald-700 border-emerald-300", l: "Clear" };
      case "manual_clear": return { c: "bg-blue-100 text-blue-700 border-blue-300", l: "Cleared (Manual)" };
      case "flagged": return { c: "bg-amber-100 text-amber-800 border-amber-300", l: "Flagged — Review" };
      case "blocked": return { c: "bg-red-100 text-red-700 border-red-300", l: "Blocked" };
      default: return { c: "bg-gray-100 text-gray-600 border-gray-300", l: "Not Screened" };
    }
  })();

  return (
    <div className="border-2 border-primary/30 bg-primary/5 rounded-none p-4 space-y-3" data-testid={`aml-panel-${app.id}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-primary">AML / World-Check Screening</span>
        </div>
        <Badge className={`rounded-none text-[10px] font-bold uppercase border ${badge.c}`} data-testid={`aml-status-${app.id}`}>{badge.l}</Badge>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Every KYC application is screened against three mandatory lists — OFAC SDN, UN Consolidated Sanctions, and global PEPs — via the OpenSanctions consolidated dataset.
        Approval is locked until all three checks are cleared (or manually overridden).
      </p>

      <div className="grid grid-cols-3 gap-2">
        <div className="border border-border bg-background rounded-none p-2 flex flex-col gap-1" data-testid={`screening-ofac-${app.id}`}>
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">OFAC Sanctions</span>
          <Badge className={`rounded-none text-[10px] font-bold uppercase border w-fit ${subBadgeClass(ofacStatus)}`}>{subBadgeLabel(ofacStatus)}</Badge>
        </div>
        <div className="border border-border bg-background rounded-none p-2 flex flex-col gap-1" data-testid={`screening-un-${app.id}`}>
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">UN Sanctions</span>
          <Badge className={`rounded-none text-[10px] font-bold uppercase border w-fit ${subBadgeClass(unSanctionsStatus)}`}>{subBadgeLabel(unSanctionsStatus)}</Badge>
        </div>
        <div className="border border-border bg-background rounded-none p-2 flex flex-col gap-1" data-testid={`screening-pep-${app.id}`}>
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">PEP Screening</span>
          <Badge className={`rounded-none text-[10px] font-bold uppercase border w-fit ${subBadgeClass(pepStatus)}`}>{subBadgeLabel(pepStatus)}</Badge>
        </div>
      </div>

      {app.amlCheckedAt && (
        <div className="text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap">
          <span>Last run: {new Date(app.amlCheckedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          {app.amlCheckedBy && <span>· by {app.amlCheckedBy}</span>}
          <span>· {matches.length} result{matches.length === 1 ? "" : "s"}</span>
          {positives.length > 0 && <span className="text-red-600 font-semibold">· {positives.length} potential match{positives.length === 1 ? "" : "es"}</span>}
        </div>
      )}

      {app.amlNotes && (
        <div className="text-[11px] bg-background border border-border rounded-none p-2">
          <span className="font-semibold">Override note: </span>{app.amlNotes}
        </div>
      )}

      {matches.length > 0 && (
        <div className="max-h-72 overflow-y-auto space-y-1.5">
          {matches.map((m, i) => {
            const isPositive = m.match === true || (m.score != null && m.score >= 0.7);
            return (
              <div key={i} className={`text-[11px] border rounded-none p-2 ${isPositive ? "bg-red-50 border-red-200" : "bg-background border-border"}`} data-testid={`aml-match-${app.id}-${i}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    {isPositive ? <AlertTriangle className="w-3 h-3 text-red-600" /> : <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                    <span className="font-semibold">{m.matchedName}</span>
                    <span className="text-muted-foreground">({m.schema})</span>
                  </div>
                  {m.score != null && (
                    <Badge variant="outline" className={`rounded-none text-[9px] ${isPositive ? "border-red-300 text-red-700" : ""}`}>
                      {(m.score * 100).toFixed(0)}% match
                    </Badge>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  <div>Query: {m.queryLabel} — "{m.queryName}"</div>
                  {m.datasets?.length > 0 && <div>Lists: {m.datasets.slice(0, 6).join(", ")}{m.datasets.length > 6 ? "…" : ""}</div>}
                  {m.topics?.length > 0 && <div>Topics: {m.topics.join(", ")}</div>}
                  {m.countries?.length > 0 && <div>Countries: {m.countries.join(", ")}</div>}
                  {m.sourceUrl && (
                    <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      View entity <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-none h-8 text-[11px] font-semibold"
            onClick={() => runCheck.mutate()}
            disabled={runCheck.isPending}
            data-testid={`button-aml-run-${app.id}`}
          >
            {runCheck.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Search className="w-3 h-3 mr-1.5" />}
            {status === "not_run" ? "Run Screening" : "Re-run Screening"}
          </Button>
          {status !== "not_run" && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-none h-8 text-[11px] font-semibold"
              onClick={() => setOverrideOpen(true)}
              data-testid={`button-aml-override-${app.id}`}
            >
              <UserCheck className="w-3 h-3 mr-1.5" />
              Manual Decision
            </Button>
          )}
        </div>
      )}

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>AML Manual Decision</DialogTitle>
            <DialogDescription>Record your manual review decision for audit purposes. Required when overriding flagged matches.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider">Decision</Label>
              <Select value={overrideDecision} onValueChange={(v: any) => setOverrideDecision(v)}>
                <SelectTrigger className="rounded-none mt-1" data-testid="select-aml-decision">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual_clear">Clear — false positive / acceptable risk</SelectItem>
                  <SelectItem value="blocked">Block — confirmed adverse match</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider">Justification (audit trail, min 5 chars)</Label>
              <Textarea
                className="rounded-none mt-1 min-h-[100px]"
                placeholder="e.g. Reviewed match — entity is in different jurisdiction (US v. UK), confirmed false positive via passport check."
                value={overrideNotes}
                onChange={e => setOverrideNotes(e.target.value)}
                data-testid="textarea-aml-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-none" onClick={() => setOverrideOpen(false)}>Cancel</Button>
            <Button
              className="rounded-none"
              disabled={override.isPending || overrideNotes.trim().length < 5}
              onClick={() => override.mutate()}
              data-testid="button-aml-save-decision"
            >
              {override.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
              Save Decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const KYC_AMEND_SECTIONS: AmendSection[] = [
  {
    title: "Company",
    fields: [
      { key: "companyName", label: "Company Name" },
      { key: "legalEntityType", label: "Legal Entity Type" },
      { key: "registrationNumber", label: "Registration Number" },
      { key: "countryOfIncorporation", label: "Country of Incorporation" },
      { key: "taxId", label: "Tax ID" },
      { key: "website", label: "Website" },
      { key: "registeredAddress", label: "Registered Address", colSpan: 2 },
      { key: "operatingAddress", label: "Operating Address", colSpan: 2 },
    ],
  },
  {
    title: "Primary Contact",
    fields: [
      { key: "primaryContactName", label: "Contact Name" },
      { key: "primaryContactRole", label: "Contact Role" },
      { key: "primaryContactEmail", label: "Contact Email", type: "email" },
      { key: "primaryContactPhone", label: "Contact Phone", type: "tel" },
    ],
  },
  {
    title: "Authorized Signatory",
    fields: [
      { key: "authorizedSignatoryName", label: "Signatory Name" },
      { key: "authorizedSignatoryRole", label: "Signatory Role" },
      { key: "authorizedSignatoryEmail", label: "Signatory Email", type: "email" },
    ],
  },
  {
    title: "Banking",
    fields: [
      { key: "bankName", label: "Bank Name" },
      { key: "bankAccountNumber", label: "Account Number" },
      { key: "bankSwiftCode", label: "SWIFT Code" },
      { key: "bankIban", label: "IBAN" },
    ],
  },
  {
    title: "Classification",
    fields: [
      { key: "category", label: "Category" },
      { key: "products", label: "Products" },
      { key: "reviewNotes", label: "Review Notes", type: "textarea" },
    ],
  },
];
