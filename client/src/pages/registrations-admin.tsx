import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Clock, Building2, User, Mail, Phone, Globe, Briefcase, Package, MessageSquare, Calendar, Pencil } from "lucide-react";
import type { Registration } from "@shared/schema";
import { AmendDialog, type AmendSection } from "@/components/amend-dialog";
import { useAmendMode } from "@/hooks/use-amend-mode";

const STATUS_FILTERS = ["all", "pending", "approved", "rejected"];

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800" data-testid="badge-status-approved">Approved</Badge>;
  if (status === "rejected") return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800" data-testid="badge-status-rejected">Rejected</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800" data-testid="badge-status-pending">Pending</Badge>;
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm">
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div>
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium">{value}</span>
      </div>
    </div>
  );
}

export default function RegistrationsAdmin() {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Registration | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [amendTarget, setAmendTarget] = useState<Registration | null>(null);
  const { requestUnlock } = useAmendMode();

  const openAmend = (reg: Registration) => {
    requestUnlock(() => setAmendTarget(reg));
  };

  const { data: registrations = [], isLoading, isError } = useQuery<Registration[]>({
    queryKey: ["/api/registrations"],
    staleTime: 0,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      apiRequest("PATCH", `/api/registrations/${id}/status`, { status, reviewNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registrations"] });
      setSelected(null);
      setActionType(null);
      setReviewNotes("");
    },
  });

  const filtered = registrations.filter(r => filter === "all" || r.status === filter);

  const pendingCount = registrations.filter(r => r.status === "pending").length;

  const openAction = (reg: Registration, type: "approve" | "reject") => {
    setSelected(reg);
    setActionType(type);
    setReviewNotes("");
  };

  const confirmAction = () => {
    if (!selected || !actionType) return;
    statusMutation.mutate({
      id: selected.id,
      status: actionType === "approve" ? "approved" : "rejected",
      notes: reviewNotes.trim() || undefined,
    });
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">Registrations</h1>
          <p className="text-sm text-muted-foreground">
            Review and approve platform registration requests
          </p>
        </div>
        {pendingCount > 0 && (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800 text-sm px-3 py-1" data-testid="badge-pending-count">
            {pendingCount} pending
          </Badge>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border">
        {STATUS_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            data-testid={`button-filter-${f}`}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
              filter === f
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
            <span className="ml-1.5 text-xs text-muted-foreground">
              ({f === "all" ? registrations.length : registrations.filter(r => r.status === f).length})
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : isError ? (
        <div className="text-center py-20 text-muted-foreground" data-testid="text-error-state">
          <XCircle className="w-10 h-10 mx-auto mb-3 text-destructive opacity-60" />
          <p className="font-medium text-destructive">Failed to load registrations</p>
          <p className="text-sm mt-1">Please ensure you are logged in as admin and refresh the page.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground" data-testid="text-empty-state">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No {filter === "all" ? "" : filter} registrations</p>
          <p className="text-sm mt-1">Registrations submitted from the public form will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(reg => (
            <div
              key={reg.id}
              className="bg-card border border-border rounded-xl p-5 space-y-4"
              data-testid={`card-registration-${reg.id}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-base truncate" data-testid={`text-reg-name-${reg.id}`}>{reg.fullName}</h3>
                    <StatusBadge status={reg.status} />
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">{reg.companyName}</p>
                </div>
                <p className="text-xs text-muted-foreground flex-shrink-0">
                  {new Date(reg.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <DetailRow icon={Briefcase} label="Role" value={reg.roleType} />
                <DetailRow icon={Globe} label="Country" value={reg.country} />
                <DetailRow icon={Mail} label="Email" value={reg.email} />
                <DetailRow icon={Phone} label="Phone" value={reg.phone} />
                {reg.commodities && <DetailRow icon={Package} label="Commodities" value={reg.commodities} />}
                {reg.message && (
                  <div className="sm:col-span-2">
                    <DetailRow icon={MessageSquare} label="Message" value={reg.message} />
                  </div>
                )}
              </div>

              {reg.reviewNotes && (
                <div className={`rounded-lg p-3 text-sm border ${reg.status === "approved" ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300" : "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300"}`}>
                  <span className="font-medium">Review notes: </span>{reg.reviewNotes}
                </div>
              )}

              <div className="flex gap-2 pt-1 flex-wrap">
                {reg.status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                      onClick={() => openAction(reg, "approve")}
                      data-testid={`button-approve-${reg.id}`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/10 gap-1.5"
                      onClick={() => openAction(reg, "reject")}
                      data-testid={`button-reject-${reg.id}`}
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => openAmend(reg)}
                  data-testid={`button-amend-${reg.id}`}
                >
                  <Pencil className="w-4 h-4" />
                  Amend (Admin)
                </Button>
              </div>

              {reg.reviewedAt && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Reviewed: {new Date(reg.reviewedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Approve / Reject dialog */}
      <Dialog open={!!actionType && !!selected} onOpenChange={() => { setActionType(null); setSelected(null); setReviewNotes(""); }}>
        <DialogContent data-testid="dialog-review-action">
          <DialogHeader>
            <DialogTitle className={actionType === "approve" ? "text-green-600" : "text-red-600"}>
              {actionType === "approve" ? "Approve Registration" : "Reject Registration"}
            </DialogTitle>
            <DialogDescription>
              {selected && (
                <span>
                  {actionType === "approve"
                    ? `Approving ${selected.fullName} (${selected.companyName}) as ${selected.roleType}. They will be notified by email.`
                    : `Rejecting ${selected.fullName} (${selected.companyName}). They will be notified by email.`}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="text-sm font-medium">
              {actionType === "approve" ? "Notes (optional)" : "Reason for rejection (optional)"}
            </label>
            <Textarea
              placeholder={actionType === "approve" ? "Any notes about this approval..." : "Reason for rejection..."}
              value={reviewNotes}
              onChange={e => setReviewNotes(e.target.value)}
              className="resize-none min-h-[90px]"
              data-testid="textarea-review-notes"
            />
            <p className="text-xs text-muted-foreground">
              {actionType === "reject"
                ? "If provided, this reason will be included in the rejection email sent to the applicant."
                : "Notes are for internal use and will not be sent to the applicant."}
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setActionType(null); setSelected(null); }} data-testid="button-cancel-action">
              Cancel
            </Button>
            <Button
              onClick={confirmAction}
              disabled={statusMutation.isPending}
              className={actionType === "approve" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
              data-testid="button-confirm-action"
            >
              {statusMutation.isPending
                ? "Processing..."
                : actionType === "approve" ? "Confirm Approval" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {amendTarget && (
        <AmendDialog
          open={!!amendTarget}
          onOpenChange={(o) => { if (!o) setAmendTarget(null); }}
          title={`Amend Registration — ${amendTarget.fullName}`}
          description="Edit registration details. Changes are logged and require admin amend mode."
          endpoint={`/api/registrations/${amendTarget.id}/amend`}
          invalidateKeys={["/api/registrations"]}
          initialValues={{
            fullName: amendTarget.fullName ?? "",
            companyName: amendTarget.companyName ?? "",
            email: amendTarget.email ?? "",
            phone: amendTarget.phone ?? "",
            country: amendTarget.country ?? "",
            roleType: amendTarget.roleType ?? "",
            commodities: amendTarget.commodities ?? "",
            message: amendTarget.message ?? "",
            reviewNotes: amendTarget.reviewNotes ?? "",
          }}
          sections={REGISTRATION_AMEND_SECTIONS}
        />
      )}
    </div>
  );
}

const REGISTRATION_AMEND_SECTIONS: AmendSection[] = [
  {
    title: "Contact",
    fields: [
      { key: "fullName", label: "Full Name" },
      { key: "companyName", label: "Company Name" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "tel" },
      { key: "country", label: "Country" },
      { key: "roleType", label: "Role Type" },
    ],
  },
  {
    title: "Details",
    fields: [
      { key: "commodities", label: "Commodities", colSpan: 2 },
      { key: "message", label: "Message", type: "textarea" },
      { key: "reviewNotes", label: "Review Notes", type: "textarea" },
    ],
  },
];
