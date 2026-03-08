import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { KycApplication, Trade, Block, Document, KycDocument, KycChangeRequest } from "@shared/schema";

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<Record<string, string>>({});
  const { toast } = useToast();

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

  const { data: changeRequests } = useQuery<KycChangeRequest[]>({
    queryKey: ["/api/kyc-change-requests"],
  });

  const [changeRequestNotes, setChangeRequestNotes] = useState<Record<string, string>>({});
  const [adminEditingKyc, setAdminEditingKyc] = useState<KycApplication | null>(null);
  const [adminChangeFields, setAdminChangeFields] = useState<Record<string, string>>({});
  const [adminChangeReason, setAdminChangeReason] = useState("");

  const adminSubmitChangeRequest = useMutation({
    mutationFn: async ({ kycId, changedFields, reason }: { kycId: string; changedFields: Record<string, string>; reason: string }) => {
      const res = await apiRequest("POST", `/api/kyc/${kycId}/change-request`, { changedFields, reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kyc-change-requests"] });
      toast({ title: "Change Request Created", description: "Change request has been submitted for review." });
      setAdminEditingKyc(null);
      setAdminChangeFields({});
      setAdminChangeReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Submission Failed", description: error.message, variant: "destructive" });
    },
  });

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
    mutationFn: async ({ id, status, notes, category, products }: { id: string; status: string; notes?: string; category?: string; products?: string }) => {
      const res = await apiRequest("PATCH", `/api/kyc/${id}/status`, { status, reviewNotes: notes, category, products });
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

  const filtered = applications
    ?.filter((a) => statusFilter === "all" || a.status === statusFilter)
    .filter((a) =>
      a.companyName.toLowerCase().includes(search.toLowerCase()) ||
      a.contactName.toLowerCase().includes(search.toLowerCase()) ||
      a.contactEmail.toLowerCase().includes(search.toLowerCase()) ||
      a.countryOfIncorporation.toLowerCase().includes(search.toLowerCase())
    ) || [];

  const pendingCount = applications?.filter((a) => a.status === "pending").length || 0;
  const approvedCount = applications?.filter((a) => a.status === "approved").length || 0;
  const rejectedCount = applications?.filter((a) => a.status === "rejected").length || 0;

  const totalTrades = trades?.length || 0;
  const latestBlock = blocks && blocks.length > 0 ? blocks[0] : null;
  const totalVolume = trades?.reduce((s, t) => s + t.totalValue, 0) || 0;
  const activeTrades = trades?.filter((t) => t.status !== "final_payment").length || 0;
  const recentTrades = trades?.slice(0, 5) || [];

  return (
    <div className="overflow-y-auto h-full">
      <div className="bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-white/10 rounded" data-testid="icon-kyc-admin">
                  <Shield className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-white/60">Administration</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-serif font-bold mb-4" data-testid="text-kyc-admin-title">
                Admin Dashboard
              </h1>
              <p className="text-white/70 text-lg leading-relaxed">
                Overview of trading activity, blockchain status, and KYC application management.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 lg:gap-4">
              <div className="bg-white/5 border border-white/10 p-4 rounded text-center" data-testid="stat-pending">
                <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Pending</div>
                <div className="text-2xl font-bold text-amber-400">{pendingCount}</div>
              </div>
              <div className="bg-white/5 border border-white/10 p-4 rounded text-center" data-testid="stat-approved">
                <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Approved</div>
                <div className="text-2xl font-bold text-emerald-400">{approvedCount}</div>
              </div>
              <div className="bg-white/5 border border-white/10 p-4 rounded text-center" data-testid="stat-rejected">
                <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Rejected</div>
                <div className="text-2xl font-bold text-red-400">{rejectedCount}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card data-testid="stat-trades">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Link2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Trades</p>
                  <p className="text-xl font-bold">{totalTrades}</p>
                  <p className="text-[11px] text-muted-foreground">{activeTrades} active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-volume">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Trade Volume</p>
                  <p className="text-xl font-bold">${totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  <p className="text-[11px] text-muted-foreground">All-time</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-blocks">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Layers className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Chain Blocks</p>
                  <p className="text-xl font-bold">{latestBlock ? latestBlock.blockNumber.toString() : "0"}</p>
                  <p className="text-[11px] text-muted-foreground">100% verified</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-docs">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Documents</p>
                  <p className="text-xl font-bold">{(docs?.length || 0)}</p>
                  <p className="text-[11px] text-muted-foreground">{applications?.length || 0} KYC applications</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <Card className="lg:col-span-2" data-testid="card-recent-trades">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
              <CardTitle className="text-base font-semibold">Recent Trades</CardTitle>
              <Link href="/trading">
                <Button variant="ghost" size="sm" data-testid="link-all-trades">
                  View All
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {recentTrades.length > 0 ? (
                <div className="space-y-0">
                  {recentTrades.map((trade) => (
                    <div
                      key={trade.id}
                      className="flex items-center justify-between gap-3 py-3 border-b last:border-b-0"
                      data-testid={`trade-row-${trade.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Link2 className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium font-mono">{trade.tradeRef}</span>
                            <Badge variant="secondary" className="text-[10px]">{trade.commodityCategory}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {trade.commodity} &middot; {trade.origin} to {trade.destination}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-medium font-mono">
                            ${trade.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{trade.quantity} {trade.unit}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {tradeStatusIcon(trade.status)}
                          <span className="text-[10px]">{tradeStatusLabel(trade.status)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Link2 className="w-10 h-10 mb-3 opacity-20" />
                  <p className="text-sm">No trades yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-chain-status">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Chain Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Bullex Chain</span>
                <Badge className="text-[10px]">Live</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Blocks</span>
                <span className="font-mono font-medium">{latestBlock?.blockNumber || 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Chain Integrity</span>
                <span className="text-status-online font-medium">Valid</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Active Trades</span>
                <span className="font-mono font-medium">{activeTrades}</span>
              </div>
              {blocks && blocks.length > 0 && (
                <div className="pt-2 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Recent Blocks</p>
                  {blocks.slice(0, 3).map((block) => {
                    const blockTrade = trades?.find((t) => t.blockNumber === block.blockNumber);
                    return (
                      <div key={block.id} className="p-2.5 rounded-md bg-muted space-y-1" data-testid={`block-preview-${block.blockNumber}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-medium">#{block.blockNumber}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {block.hash.slice(0, 8)}...{block.hash.slice(-4)}
                          </span>
                        </div>
                        {blockTrade && (
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>{blockTrade.tradeRef}</span>
                            <span>{tradeStatusLabel(blockTrade.status)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

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
          <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-muted/50 border-b border-border text-xs font-bold uppercase tracking-wider text-muted-foreground">
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
                  <button
                    className="w-full grid grid-cols-12 gap-2 px-5 py-4 items-center hover:bg-muted/30 transition-colors text-left"
                    onClick={() => setExpandedId(isExpanded ? null : app.id)}
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
                    <div className="col-span-1 flex justify-end">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border bg-muted/10" data-testid={`kyc-detail-${app.id}`}>
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
                                    <p className="text-xs text-muted-foreground">This application has been approved. To modify details, submit a change request.</p>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="mt-2 rounded-none text-xs"
                                      onClick={() => {
                                        setAdminEditingKyc(app);
                                        setAdminChangeFields({});
                                        setAdminChangeReason("");
                                      }}
                                      data-testid={`button-admin-request-changes-${app.id}`}
                                    >
                                      <Edit className="w-3 h-3 mr-1" /> Request Changes
                                    </Button>
                                  </div>
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
                                </div>
                              ) : (
                              <div className="space-y-3">
                                <div className="space-y-1.5">
                                  <label className="text-xs font-bold uppercase tracking-wider text-primary">Category</label>
                                  <Select
                                    value={categories[app.id] || app.category || ""}
                                    onValueChange={(val) => setCategories({ ...categories, [app.id]: val })}
                                  >
                                    <SelectTrigger className="rounded-none h-10 border-border text-sm" data-testid={`select-category-${app.id}`}>
                                      <SelectValue placeholder="Assign a category..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Buyer">Buyer</SelectItem>
                                      <SelectItem value="Seller">Seller</SelectItem>
                                      <SelectItem value="Broker">Broker</SelectItem>
                                      <SelectItem value="Investor">Investor</SelectItem>
                                      <SelectItem value="Producer">Producer</SelectItem>
                                      <SelectItem value="Trader">Trader</SelectItem>
                                      <SelectItem value="Custodian">Custodian</SelectItem>
                                      <SelectItem value="Auditor">Auditor</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1.5">
                                  <label className="text-xs font-bold uppercase tracking-wider text-primary">Products</label>
                                  <Input
                                    className="rounded-none h-10 border-border text-sm"
                                    placeholder="e.g. Iron Ore, Copper, Bauxite"
                                    value={products[app.id] !== undefined ? products[app.id] : (app.products || "")}
                                    onChange={(e) => setProducts({ ...products, [app.id]: e.target.value })}
                                    data-testid={`input-products-${app.id}`}
                                  />
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

                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="flex-1 rounded-none h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider"
                                    disabled={updateStatus.isPending}
                                    onClick={() => updateStatus.mutate({ id: app.id, status: "approved", notes: reviewNotes[app.id], category: categories[app.id] || app.category || undefined, products: products[app.id] !== undefined ? products[app.id] : (app.products || undefined) })}
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

        <Dialog open={!!adminEditingKyc} onOpenChange={(open) => { if (!open) setAdminEditingKyc(null); }}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg font-serif">
                <Edit className="w-5 h-5 text-primary" />
                Request Changes — {adminEditingKyc?.companyName}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Edit the fields you want to change. Only modified fields will be submitted as a change request for admin approval.
              </p>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {[
                { key: "companyName", label: "Company Name" },
                { key: "registeredAddress", label: "Registered Address" },
                { key: "primaryBusinessAddress", label: "Primary Business Address" },
                { key: "contactName", label: "Contact Name" },
                { key: "contactTitle", label: "Contact Title" },
                { key: "contactPhone", label: "Contact Phone" },
                { key: "contactEmail", label: "Contact Email" },
                { key: "countryOfOperation", label: "Country of Operation" },
                { key: "businessType", label: "Business Type" },
                { key: "coreBusinessDescription", label: "Core Business Description" },
                { key: "bankName", label: "Bank Name" },
                { key: "bankAddress", label: "Bank Address" },
                { key: "accountName", label: "Account Name" },
                { key: "accountNumber", label: "Account Number" },
                { key: "swiftCode", label: "SWIFT Code" },
                { key: "bankAccountCurrency", label: "Bank Account Currency" },
                { key: "signatoryName", label: "Signatory Name" },
                { key: "signatoryTitle", label: "Signatory Title" },
                { key: "signatoryEmail", label: "Signatory Email" },
              ].map(({ key, label }) => {
                const currentVal = adminEditingKyc ? String((adminEditingKyc as any)[key] || "") : "";
                return (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs font-medium">{label}</Label>
                    <Input
                      className="text-sm rounded-none"
                      placeholder={currentVal || "Current: (empty)"}
                      value={adminChangeFields[key] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAdminChangeFields((prev) => {
                          const next = { ...prev };
                          if (val === "" || val === currentVal) {
                            delete next[key];
                          } else {
                            next[key] = val;
                          }
                          return next;
                        });
                      }}
                      data-testid={`input-admin-change-${key}`}
                    />
                    {currentVal && (
                      <p className="text-[10px] text-muted-foreground">Current: {currentVal}</p>
                    )}
                  </div>
                );
              })}
              <div className="space-y-1 pt-2 border-t">
                <Label className="text-xs font-medium">Reason for Changes</Label>
                <Textarea
                  className="text-sm rounded-none h-20"
                  placeholder="Briefly explain why these changes are needed..."
                  value={adminChangeReason}
                  onChange={(e) => setAdminChangeReason(e.target.value)}
                  data-testid="input-admin-change-reason"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  className="rounded-none"
                  onClick={() => setAdminEditingKyc(null)}
                  data-testid="button-admin-cancel-changes"
                >
                  Cancel
                </Button>
                <Button
                  className="rounded-none"
                  disabled={Object.keys(adminChangeFields).length === 0 || adminSubmitChangeRequest.isPending}
                  onClick={() => {
                    if (!adminEditingKyc) return;
                    adminSubmitChangeRequest.mutate({
                      kycId: adminEditingKyc.id,
                      changedFields: adminChangeFields,
                      reason: adminChangeReason,
                    });
                  }}
                  data-testid="button-admin-submit-changes"
                >
                  {adminSubmitChangeRequest.isPending ? "Submitting..." : "Submit Change Request"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
