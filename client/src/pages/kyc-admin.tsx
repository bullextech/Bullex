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
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { KycApplication } from "@shared/schema";

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pending: { label: "Pending Review", color: "text-amber-600", bg: "bg-amber-600/10 border-amber-600/20 text-amber-700", icon: Clock },
  approved: { label: "Approved", color: "text-emerald-600", bg: "bg-emerald-600/10 border-emerald-600/20 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "text-red-600", bg: "bg-red-600/10 border-red-600/20 text-red-700", icon: XCircle },
};

export default function KycAdmin() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const { data: applications, isLoading } = useQuery<KycApplication[]>({
    queryKey: ["/api/kyc"],
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const res = await apiRequest("PATCH", `/api/kyc/${id}/status`, { status, reviewNotes: notes });
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
                <div className="p-2 bg-white/10 rounded" data-testid="icon-kyc-admin">
                  <Shield className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-white/60">Administration</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-serif font-bold mb-4" data-testid="text-kyc-admin-title">
                KYC Administration
              </h1>
              <p className="text-white/70 text-lg leading-relaxed">
                Review, approve, or reject institutional KYC applications. Ensure compliance with Bullfrog Group onboarding standards before granting platform access.
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-serif font-bold text-foreground" data-testid="text-applications-heading">
              Applications
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
                              ["UBO", app.ultimateBeneficialOwners],
                              ["Shareholders", app.shareholders],
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

                              <div className="space-y-3">
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
                                    disabled={updateStatus.isPending || app.status === "approved"}
                                    onClick={() => updateStatus.mutate({ id: app.id, status: "approved", notes: reviewNotes[app.id] })}
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
                                    onClick={() => updateStatus.mutate({ id: app.id, status: "rejected", notes: reviewNotes[app.id] })}
                                    data-testid={`button-reject-${app.id}`}
                                  >
                                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                                    Reject
                                  </Button>
                                </div>

                                {app.status !== "pending" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full rounded-none h-9 text-xs font-bold uppercase tracking-wider"
                                    disabled={updateStatus.isPending}
                                    onClick={() => updateStatus.mutate({ id: app.id, status: "pending", notes: reviewNotes[app.id] })}
                                    data-testid={`button-reset-${app.id}`}
                                  >
                                    <Clock className="w-3.5 h-3.5 mr-1.5" />
                                    Reset to Pending
                                  </Button>
                                )}
                              </div>
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
    </div>
  );
}
