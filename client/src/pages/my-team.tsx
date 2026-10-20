import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { UserPlus, Mail, Send, Users, CheckCircle2, Clock, XCircle, Eye, FileText } from "lucide-react";

type AddedMember = {
  kind: "member" | "application";
  id: string;
  name: string;
  email: string;
  participantId: string | null;
  status: "approved" | "pending" | "rejected" | string;
  canReceive: boolean;
};

type MemberDetail = {
  id: string;
  name: string;
  participantId: string | null;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  position: string | null;
  department: string | null;
  employmentType: string | null;
  startDate: string | null;
  city: string | null;
  country: string | null;
  allowedModules: string[] | null;
  createdAt: string;
};

const EMPTY_INVITE = { name: "", email: "", position: "", department: "", message: "" };
const EMPTY_DIRECT = {
  fullName: "", email: "", phone: "", nationality: "",
  positionApplied: "", department: "", employmentType: "", additionalNotes: "",
};

export default function MyTeam() {
  const { toast } = useToast();
  const [invite, setInvite] = useState({ ...EMPTY_INVITE });
  const [direct, setDirect] = useState({ ...EMPTY_DIRECT });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [generating, setGenerating] = useState<"ncnda" | "ica" | null>(null);

  const { data: members = [], isLoading } = useQuery<AddedMember[]>({
    queryKey: ["/api/team/my/added-members"],
  });

  const { data: detail, isLoading: detailLoading } = useQuery<MemberDetail>({
    queryKey: ["/api/team/my/added-members", detailId],
    enabled: !!detailId,
  });

  const inviteMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/team/my/invite", invite),
    onSuccess: () => {
      toast({ title: "Invitation sent", description: `An onboarding invite was emailed to ${invite.email}.` });
      setInvite({ ...EMPTY_INVITE });
    },
    onError: (err: any) => toast({ title: "Could not send invite", description: err.message, variant: "destructive" }),
  });

  const directMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/team/my/team-kyc", direct),
    onSuccess: () => {
      toast({ title: "Team member submitted", description: "Their application is pending admin approval." });
      setDirect({ ...EMPTY_DIRECT });
      queryClient.invalidateQueries({ queryKey: ["/api/team/my/added-members"] });
    },
    onError: (err: any) => toast({ title: "Could not add member", description: err.message, variant: "destructive" }),
  });

  const generateDoc = async (kind: "ncnda" | "ica") => {
    if (!detail) return;
    setGenerating(kind);
    try {
      const body = kind === "ica" ? { agentLabel: "Agent", agencyType: "Non-Exclusive" } : {};
      const r = await apiRequest("POST", `/api/team-members/${detail.id}/generate-${kind}`, body);
      const created = await r.json();
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: `${kind.toUpperCase()} prepared`, description: `Sent for admin approval. Once approved, you can sign and send it from the Document Generator.` });
      try { sessionStorage.setItem("openDocId", created.id); } catch {}
      window.location.assign(`/documents?openDocId=${created.id}`);
    } catch (err: any) {
      toast({ title: `Could not generate ${kind.toUpperCase()}`, description: err?.message || "Please try again.", variant: "destructive" });
      setGenerating(null);
    }
  };

  const statusBadge = (m: AddedMember) => {
    if (m.status === "approved") {
      // Approved via KYC but no login provisioned yet (only "member" rows have a login).
      if (m.kind === "application") return <Badge variant="outline" className="gap-1" data-testid={`status-member-${m.id}`}><CheckCircle2 className="h-3 w-3" /> Approved · login pending</Badge>;
      return <Badge className="gap-1" data-testid={`status-member-${m.id}`}><CheckCircle2 className="h-3 w-3" /> Approved</Badge>;
    }
    if (m.status === "rejected") return <Badge variant="destructive" className="gap-1" data-testid={`status-member-${m.id}`}><XCircle className="h-3 w-3" /> Rejected</Badge>;
    return <Badge variant="secondary" className="gap-1" data-testid={`status-member-${m.id}`}><Clock className="h-3 w-3" /> Pending</Badge>;
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><Users className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">My Team</h1>
            <p className="text-sm text-muted-foreground">Add team members. Once an admin approves them, you can send documents you generate directly to them.</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Invite by email */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Mail className="h-5 w-5" /> Invite by email</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="invite-email">Email *</Label>
                <Input id="invite-email" type="email" value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} placeholder="colleague@company.com" data-testid="input-invite-email" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="invite-name">Name</Label>
                <Input id="invite-name" value={invite.name} onChange={e => setInvite({ ...invite, name: e.target.value })} placeholder="Full name" data-testid="input-invite-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="invite-position">Position</Label>
                  <Input id="invite-position" value={invite.position} onChange={e => setInvite({ ...invite, position: e.target.value })} data-testid="input-invite-position" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="invite-department">Department</Label>
                  <Input id="invite-department" value={invite.department} onChange={e => setInvite({ ...invite, department: e.target.value })} data-testid="input-invite-department" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="invite-message">Message</Label>
                <Textarea id="invite-message" value={invite.message} onChange={e => setInvite({ ...invite, message: e.target.value })} placeholder="Optional note included in the invite email" rows={2} data-testid="input-invite-message" />
              </div>
              <Button className="w-full gap-2" disabled={!invite.email || inviteMutation.isPending} onClick={() => inviteMutation.mutate()} data-testid="button-send-invite">
                <Send className="h-4 w-4" /> {inviteMutation.isPending ? "Sending…" : "Send invitation"}
              </Button>
            </CardContent>
          </Card>

          {/* Add directly */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><UserPlus className="h-5 w-5" /> Add details directly</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="direct-name">Full name *</Label>
                  <Input id="direct-name" value={direct.fullName} onChange={e => setDirect({ ...direct, fullName: e.target.value })} data-testid="input-direct-name" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="direct-email">Email *</Label>
                  <Input id="direct-email" type="email" value={direct.email} onChange={e => setDirect({ ...direct, email: e.target.value })} data-testid="input-direct-email" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="direct-phone">Phone</Label>
                  <Input id="direct-phone" value={direct.phone} onChange={e => setDirect({ ...direct, phone: e.target.value })} data-testid="input-direct-phone" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="direct-nationality">Nationality</Label>
                  <Input id="direct-nationality" value={direct.nationality} onChange={e => setDirect({ ...direct, nationality: e.target.value })} data-testid="input-direct-nationality" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="direct-position">Position</Label>
                  <Input id="direct-position" value={direct.positionApplied} onChange={e => setDirect({ ...direct, positionApplied: e.target.value })} data-testid="input-direct-position" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="direct-department">Department</Label>
                  <Input id="direct-department" value={direct.department} onChange={e => setDirect({ ...direct, department: e.target.value })} data-testid="input-direct-department" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Employment type</Label>
                <Select value={direct.employmentType} onValueChange={v => setDirect({ ...direct, employmentType: v })}>
                  <SelectTrigger data-testid="select-direct-employment"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Full-time">Full-time</SelectItem>
                    <SelectItem value="Part-time">Part-time</SelectItem>
                    <SelectItem value="Contract">Contract</SelectItem>
                    <SelectItem value="Consultant">Consultant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="direct-notes">Notes</Label>
                <Textarea id="direct-notes" value={direct.additionalNotes} onChange={e => setDirect({ ...direct, additionalNotes: e.target.value })} rows={2} data-testid="input-direct-notes" />
              </div>
              <Button className="w-full gap-2" disabled={!direct.fullName || !direct.email || directMutation.isPending} onClick={() => directMutation.mutate()} data-testid="button-add-direct">
                <UserPlus className="h-4 w-4" /> {directMutation.isPending ? "Submitting…" : "Add team member"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Added members list */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5" /> Team members you added</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="text-empty-members">You haven't added any team members yet.</p>
            ) : (
              <div className="divide-y">
                {members.map(m => (
                  <div key={`${m.kind}-${m.id}`} className="flex items-center justify-between py-3 gap-3" data-testid={`row-member-${m.id}`}>
                    <div className="min-w-0">
                      <p className="font-medium" data-testid={`text-member-name-${m.id}`}>{m.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{m.email}{m.participantId ? ` · ${m.participantId}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {m.kind === "member" && m.status === "approved" && (
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => setDetailId(m.id)} data-testid={`button-view-details-${m.id}`}>
                          <Eye className="h-3.5 w-3.5" /> Details
                        </Button>
                      )}
                      {statusBadge(m)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-lg" data-testid="dialog-member-detail">
          <DialogHeader>
            <DialogTitle>{detail?.name || "Team member"}</DialogTitle>
            <DialogDescription>Details of a team member you added, now approved by an admin.</DialogDescription>
          </DialogHeader>
          {detailLoading || !detail ? (
            <p className="text-sm text-muted-foreground py-4">Loading…</p>
          ) : (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Field label="Participant ID" value={detail.participantId} testId="detail-participant-id" />
                <Field label="Email" value={detail.email} testId="detail-email" />
                <Field label="Phone" value={detail.phone} testId="detail-phone" />
                <Field label="Nationality" value={detail.nationality} testId="detail-nationality" />
                <Field label="Position" value={detail.position} testId="detail-position" />
                <Field label="Department" value={detail.department} testId="detail-department" />
                <Field label="Employment type" value={detail.employmentType} testId="detail-employment" />
                <Field label="Start date" value={detail.startDate} testId="detail-start-date" />
                <Field label="City" value={detail.city} testId="detail-city" />
                <Field label="Country" value={detail.country} testId="detail-country" />
              </dl>
              {(detail.allowedModules ?? []).includes("doc-templates") && (
                <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm" data-testid="detail-doc-access">
                  <FileText className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                  <span>This member can create documents (NCNDA, ICA and others) from the Document Generator.</span>
                </div>
              )}
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Generate agent agreement</p>
                <p className="text-xs text-muted-foreground">Prepare an NCNDA or ICA for this member. It goes to the admin for approval first — once approved, you can sign and send it from the Document Generator.</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline" size="sm" className="gap-1"
                    disabled={generating !== null}
                    onClick={() => generateDoc("ncnda")}
                    data-testid="button-generate-ncnda"
                  >
                    <FileText className="h-3.5 w-3.5" /> {generating === "ncnda" ? "Generating…" : "Generate NCNDA"}
                  </Button>
                  <Button
                    variant="outline" size="sm" className="gap-1"
                    disabled={generating !== null || !detail.participantId}
                    onClick={() => generateDoc("ica")}
                    title={!detail.participantId ? "This member has no participant ID allocated yet" : undefined}
                    data-testid="button-generate-ica"
                  >
                    <FileText className="h-3.5 w-3.5" /> {generating === "ica" ? "Generating…" : "Generate ICA"}
                  </Button>
                </div>
                {!detail.participantId && (
                  <p className="text-xs text-muted-foreground">ICA needs a participant ID — ask an admin to allocate one first.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, testId }: { label: string; value: string | null; testId: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium" data-testid={testId}>{value || "—"}</dd>
    </div>
  );
}
