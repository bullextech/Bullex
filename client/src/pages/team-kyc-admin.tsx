import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2, XCircle, User, Briefcase, GraduationCap,
  Phone, Heart, Landmark, ChevronDown, ChevronUp, Loader2,
  Link2, Copy, Check, PenTool, Shield, FileText, Download,
  Camera, ImageIcon, Mail, Send,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import Login from "@/pages/login";

interface TeamKycApp {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  nationality: string | null;
  positionApplied: string | null;
  department: string | null;
  employmentType: string | null;
  expectedStartDate: string | null;
  highestQualification: string | null;
  institution: string | null;
  graduationYear: string | null;
  previousEmployer: string | null;
  previousRole: string | null;
  yearsExperience: string | null;
  homeAddress: string | null;
  city: string | null;
  country: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  passportNumber: string | null;
  maritalStatus: string | null;
  emergencyName: string | null;
  emergencyRelationship: string | null;
  emergencyPhone: string | null;
  bankName: string | null;
  bankBranch: string | null;
  payrollAccountName: string | null;
  payrollAccountNumber: string | null;
  payrollSwift: string | null;
  additionalNotes: string | null;
  declarationAgreed: boolean | null;
  declarationName: string | null;
  declarationDate: string | null;
  photoStoredName: string | null;
  photoOriginalName: string | null;
  status: string;
  reviewNotes: string | null;
  teamUsername: string | null;
  createdAt: string;
}

interface TeamKycDocument {
  id: string;
  applicationId: string;
  docType: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  cv_resume: "CV / Resume",
  national_id: "National ID Copy",
  passport_copy: "Passport Copy",
  academic_certificate: "Academic Certificate",
  professional_certificate: "Professional Certificate / License",
  reference_letter: "Reference Letter",
  other: "Other Document",
};

export default function TeamKycAdmin() {
  const { authenticated, role } = useAuth();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [linkCopied, setLinkCopied] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", position: "", department: "", message: "" });

  const inviteMutation = useMutation({
    mutationFn: (body: typeof inviteForm) => apiRequest("POST", "/api/team-kyc/invite", body),
    onSuccess: () => {
      toast({ title: "Invitation Sent", description: `Team KYC link emailed to ${inviteForm.email}.` });
      setEmailDialogOpen(false);
      setInviteForm({ name: "", email: "", position: "", department: "", message: "" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to send", description: err?.message || "Could not send the invitation email.", variant: "destructive" });
    },
  });

  const formLink = typeof window !== "undefined"
    ? `${window.location.origin}/team-kyc`
    : "/team-kyc";

  const copyLink = () => {
    navigator.clipboard.writeText(formLink).then(() => {
      setLinkCopied(true);
      toast({ title: "Link Copied", description: "The Team KYC form link has been copied to clipboard." });
      setTimeout(() => setLinkCopied(false), 3000);
    });
  };

  const { data: apps = [], isLoading } = useQuery<TeamKycApp[]>({
    queryKey: ["/api/team-kyc"],
  });

  const { data: docs = [] } = useQuery<TeamKycDocument[]>({
    queryKey: ["/api/team-kyc", expanded, "documents"],
    queryFn: () =>
      expanded
        ? fetch(`/api/team-kyc/${expanded}/documents`).then(r => r.json())
        : Promise.resolve([]),
    enabled: !!expanded,
  });

  const reviewMutation = useMutation({
    mutationFn: (body: { id: string; status: string; reviewNotes?: string; teamUsername?: string; teamPassword?: string }) =>
      apiRequest("PATCH", `/api/team-kyc/${body.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-kyc"] });
      toast({ title: "Application Updated", description: "The team KYC application has been updated." });
    },
    onError: (err: any) => {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    },
  });

  const [resendingId, setResendingId] = useState<string | null>(null);
  const resendMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/team-kyc/${id}/resend-welcome`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Welcome resent", description: "Welcome email sent and a fresh NCNDA was created in your Documents list." });
      setResendingId(null);
    },
    onError: (err: any) => {
      toast({ title: "Resend failed", description: err.message, variant: "destructive" });
      setResendingId(null);
    },
  });

  if (!authenticated) return <Login />;

  const statusBadge = (s: string) => {
    if (s === "approved") return <Badge className="bg-green-600 text-white text-[10px]">Approved</Badge>;
    if (s === "rejected") return <Badge variant="destructive" className="text-[10px]">Rejected</Badge>;
    return <Badge variant="secondary" className="text-[10px]">Pending</Badge>;
  };

  const Row = ({ label, value }: { label: string; value: string | null | undefined | boolean }) => {
    if (value === null || value === undefined || value === "") return null;
    return (
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <p className="text-sm mt-0.5">{String(value)}</p>
      </div>
    );
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const pending = apps.filter(a => a.status === "pending").length;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold" data-testid="text-team-kyc-admin-heading">Team KYC Applications</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Review staff employment submissions and assign login credentials upon approval.
            {pending > 0 && <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />{pending} pending review</span>}
          </p>
        </div>
      </div>

      {/* Shareable Link Card */}
      <Card className="border-primary/30 bg-primary/5" data-testid="card-team-kyc-link">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Link2 className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-primary mb-1 flex items-center gap-2">
                <Shield className="w-3.5 h-3.5" /> Team KYC Form — Shareable Link
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Send this link directly to team members so they can fill in all their details independently. Once submitted, you will receive an email notification and the application will appear below for review.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-background border border-border rounded-md px-3 py-2 font-mono text-xs text-muted-foreground truncate" data-testid="text-team-kyc-link">
                  {formLink}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyLink}
                  className="flex-shrink-0 gap-1.5"
                  data-testid="btn-copy-team-kyc-link"
                >
                  {linkCopied ? <><Check className="w-3.5 h-3.5 text-green-600" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy Link</>}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEmailDialogOpen(true)}
                  className="flex-shrink-0 gap-1.5"
                  data-testid="btn-email-team-kyc-link"
                >
                  <Mail className="w-3.5 h-3.5" /> Email Link
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => window.open(formLink, "_blank")}
                  className="flex-shrink-0 gap-1.5"
                  data-testid="btn-open-team-kyc-link"
                >
                  Open Form
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                No login required — team members can access and complete this form directly from any device.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email Invite Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-team-kyc-invite">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> Email Team KYC Link</DialogTitle>
            <DialogDescription>Send the Team KYC form link directly to a candidate or team member.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!inviteForm.email) {
                toast({ title: "Email required", description: "Please enter the recipient's email address.", variant: "destructive" });
                return;
              }
              inviteMutation.mutate(inviteForm);
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="invite-email" className="text-xs">Recipient Email <span className="text-destructive">*</span></Label>
              <Input
                id="invite-email"
                type="email"
                required
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                placeholder="candidate@example.com"
                data-testid="input-invite-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-name" className="text-xs">Candidate Name</Label>
              <Input
                id="invite-name"
                value={inviteForm.name}
                onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                placeholder="Full name (optional)"
                data-testid="input-invite-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-position" className="text-xs">Position</Label>
                <Input
                  id="invite-position"
                  value={inviteForm.position}
                  onChange={(e) => setInviteForm({ ...inviteForm, position: e.target.value })}
                  placeholder="e.g. Trade Analyst"
                  data-testid="input-invite-position"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-department" className="text-xs">Department</Label>
                <Input
                  id="invite-department"
                  value={inviteForm.department}
                  onChange={(e) => setInviteForm({ ...inviteForm, department: e.target.value })}
                  placeholder="e.g. Operations"
                  data-testid="input-invite-department"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-message" className="text-xs">Personal Message</Label>
              <Textarea
                id="invite-message"
                rows={3}
                value={inviteForm.message}
                onChange={(e) => setInviteForm({ ...inviteForm, message: e.target.value })}
                placeholder="Optional note to include in the email"
                data-testid="input-invite-message"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setEmailDialogOpen(false)} data-testid="btn-invite-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={inviteMutation.isPending} className="gap-1.5" data-testid="btn-invite-send">
                {inviteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Applications list */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading applications...</div>
      ) : apps.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <User className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-muted-foreground">No applications yet</p>
            <p className="text-xs text-muted-foreground mt-1">Share the form link above with team members to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {apps.map(app => (
            <Card key={app.id} className="overflow-hidden" data-testid={`team-kyc-card-${app.id}`}>
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpanded(expanded === app.id ? null : app.id)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  {/* Photo thumbnail or avatar */}
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center flex-shrink-0 border border-border">
                    {app.photoStoredName ? (
                      <img
                        src={`/api/team-kyc/${app.id}/photo`}
                        alt={app.fullName}
                        className="w-full h-full object-cover"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <User className="w-4 h-4 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{app.fullName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {app.email}
                      {app.positionApplied ? ` · ${app.positionApplied}` : ""}
                      {app.department ? ` · ${app.department}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  {app.photoStoredName && (
                    <span className="hidden sm:flex items-center gap-1 text-[10px] text-blue-600 font-semibold bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded px-1.5 py-0.5">
                      <Camera className="w-3 h-3" /> Photo
                    </span>
                  )}
                  {app.declarationAgreed && (
                    <span className="hidden sm:flex items-center gap-1 text-[10px] text-green-600 font-semibold bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded px-1.5 py-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Declared
                    </span>
                  )}
                  {statusBadge(app.status)}
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    {new Date(app.createdAt).toLocaleDateString()}
                  </span>
                  {expanded === app.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>

              {expanded === app.id && (
                <div className="border-t border-border p-5 space-y-6 bg-muted/10">

                  {/* Photo + Personal in same row */}
                  <div className="flex items-start gap-6">
                    {/* Photo panel */}
                    <div className="flex-shrink-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1">
                        <Camera className="w-3 h-3" /> Photo
                      </p>
                      <div className="w-28 h-32 rounded-lg border border-border bg-muted/30 overflow-hidden flex items-center justify-center" data-testid={`photo-preview-${app.id}`}>
                        {app.photoStoredName ? (
                          <img
                            src={`/api/team-kyc/${app.id}/photo`}
                            alt={app.fullName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-muted-foreground">
                            <ImageIcon className="w-6 h-6" />
                            <p className="text-[9px] text-center px-2">No photo uploaded</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Personal Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 mb-3">
                        <User className="w-3.5 h-3.5" /> Personal Details
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <Row label="Full Name" value={app.fullName} />
                        <Row label="Date of Birth" value={app.dateOfBirth} />
                        <Row label="Gender" value={app.gender} />
                        <Row label="Nationality" value={app.nationality} />
                        <Row label="Passport / ID No." value={app.passportNumber} />
                        <Row label="Marital Status" value={app.maritalStatus} />
                      </div>
                    </div>
                  </div>

                  {/* Contact */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 mb-3">
                      <Phone className="w-3.5 h-3.5" /> Contact Information
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Row label="Email" value={app.email} />
                      <Row label="Phone" value={app.phone} />
                      <Row label="City" value={app.city} />
                      <Row label="Country" value={app.country} />
                      {app.homeAddress && <div className="col-span-2 md:col-span-4"><Row label="Home Address" value={app.homeAddress} /></div>}
                    </div>
                  </div>

                  {/* Employment */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 mb-3">
                      <Briefcase className="w-3.5 h-3.5" /> Employment Details
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Row label="Position Applied" value={app.positionApplied} />
                      <Row label="Department" value={app.department} />
                      <Row label="Employment Type" value={app.employmentType} />
                      <Row label="Expected Start Date" value={app.expectedStartDate} />
                      {app.additionalNotes && <div className="col-span-2 md:col-span-4"><Row label="Notes" value={app.additionalNotes} /></div>}
                    </div>
                  </div>

                  {/* Education */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 mb-3">
                      <GraduationCap className="w-3.5 h-3.5" /> Education & Experience
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Row label="Qualification" value={app.highestQualification} />
                      <Row label="Institution" value={app.institution} />
                      <Row label="Graduation Year" value={app.graduationYear} />
                      <Row label="Previous Employer" value={app.previousEmployer} />
                      <Row label="Previous Role" value={app.previousRole} />
                      <Row label="Years of Experience" value={app.yearsExperience} />
                    </div>
                  </div>

                  {/* Emergency */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 mb-3">
                      <Heart className="w-3.5 h-3.5" /> Emergency Contact
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Row label="Name" value={app.emergencyName} />
                      <Row label="Relationship" value={app.emergencyRelationship} />
                      <Row label="Phone" value={app.emergencyPhone} />
                    </div>
                  </div>

                  {/* Bank */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 mb-3">
                      <Landmark className="w-3.5 h-3.5" /> Bank / Payroll Details
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Row label="Bank Name" value={app.bankName} />
                      <Row label="Branch" value={app.bankBranch} />
                      <Row label="Account Name" value={app.payrollAccountName} />
                      <Row label="Account Number / IBAN" value={app.payrollAccountNumber} />
                      <Row label="SWIFT / BIC" value={app.payrollSwift} />
                    </div>
                  </div>

                  {/* Supporting Documents */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 mb-3">
                      <FileText className="w-3.5 h-3.5" /> Supporting Documents
                    </p>
                    {docs.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No documents uploaded with this application.</p>
                    ) : (
                      <div className="space-y-2">
                        {docs.map(doc => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background border border-border"
                            data-testid={`admin-doc-${doc.id}`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <FileText className="w-4 h-4 text-primary" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">{doc.originalName}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {DOC_TYPE_LABELS[doc.docType] || doc.docType} · {formatBytes(doc.size)}
                                </p>
                              </div>
                            </div>
                            <a
                              href={`/api/team-kyc-documents/${doc.id}/download`}
                              download
                              className="flex-shrink-0"
                              data-testid={`btn-download-doc-${doc.id}`}
                            >
                              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
                                <Download className="w-3 h-3" /> Download
                              </Button>
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Statutory Declaration */}
                  <div className={`rounded-lg border p-4 ${app.declarationAgreed ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-muted/30 border-border"}`}>
                    <p className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 mb-3 text-primary">
                      <PenTool className="w-3.5 h-3.5" /> Statutory Declaration
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Declaration Agreed</p>
                        <p className={`text-sm mt-0.5 font-semibold ${app.declarationAgreed ? "text-green-600" : "text-destructive"}`}>
                          {app.declarationAgreed ? "✓ Yes — Agreed" : "✗ Not agreed"}
                        </p>
                      </div>
                      {app.declarationName && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Signed By (Print Name)</p>
                          <p className="text-sm mt-0.5 font-serif italic">{app.declarationName}</p>
                        </div>
                      )}
                      {app.declarationDate && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Date Signed</p>
                          <p className="text-sm mt-0.5">{app.declarationDate}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Admin Review */}
                  <div className="border-t border-border pt-5 space-y-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-primary">Admin Review & Credentials</p>

                    <Textarea
                      className="bg-background border-border resize-none min-h-[60px] text-sm"
                      placeholder="Review notes (optional)..."
                      value={notes[app.id] || ""}
                      onChange={e => setNotes({ ...notes, [app.id]: e.target.value })}
                      data-testid={`textarea-team-kyc-notes-${app.id}`}
                    />

                    {app.status === "approved" && app.teamUsername && (
                      <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <p className="text-xs text-green-700 dark:text-green-400 flex-1 min-w-[160px]">
                          Approved — Login created for <span className="font-mono font-bold">{app.teamUsername}</span>
                          {(app as any).participantId && (
                            <> · Participant ID <span className="font-mono font-bold" data-testid={`text-team-participant-id-${app.id}`}>{(app as any).participantId}</span></>
                          )}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] h-7"
                          disabled={resendMutation.isPending && resendingId === app.id}
                          onClick={() => { setResendingId(app.id); resendMutation.mutate(app.id); }}
                          data-testid={`btn-team-kyc-resend-${app.id}`}
                        >
                          {resendMutation.isPending && resendingId === app.id ? "Sending..." : "Resend Welcome + NCNDA"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="text-[11px] h-7"
                          onClick={async () => {
                            try {
                              const r = await apiRequest("POST", `/api/team-kyc/${app.id}/generate-ncnda`, {});
                              await r.json();
                              toast({ title: "NCNDA generated", description: `NCNDA created for ${app.fullName}.` });
                              queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
                            } catch (err: any) {
                              toast({ title: "NCNDA generation failed", description: err?.message || "Could not generate NCNDA.", variant: "destructive" });
                            }
                          }}
                          data-testid={`btn-team-kyc-generate-ncnda-${app.id}`}
                        >
                          Generate NCNDA
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          className="text-[11px] h-7"
                          onClick={async () => {
                            try {
                              const r = await apiRequest("POST", `/api/team-kyc/${app.id}/generate-ica`, {
                                agentLabel: "Agent",
                                agencyType: "Non-Exclusive",
                              });
                              await r.json();
                              toast({ title: "ICA generated", description: `International Commission Agreement created for ${app.fullName}.` });
                              queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
                            } catch (err: any) {
                              toast({ title: "ICA generation failed", description: err?.message || "Could not generate ICA.", variant: "destructive" });
                            }
                          }}
                          data-testid={`btn-team-kyc-generate-ica-${app.id}`}
                        >
                          Generate ICA
                        </Button>
                      </div>
                    )}

                    {app.status !== "approved" && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Allocate Login Credentials <span className="text-[10px] font-normal">(required to approve)</span>
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            className="bg-background border-border text-sm"
                            placeholder="Username"
                            value={usernames[app.id] || ""}
                            onChange={e => setUsernames({ ...usernames, [app.id]: e.target.value })}
                            data-testid={`input-team-kyc-username-${app.id}`}
                          />
                          <Input
                            className="bg-background border-border text-sm"
                            placeholder="Password"
                            type="password"
                            value={passwords[app.id] || ""}
                            onChange={e => setPasswords({ ...passwords, [app.id]: e.target.value })}
                            data-testid={`input-team-kyc-password-${app.id}`}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          These credentials will be stored securely and used for the team member's platform login. Send them to the team member after approval.
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider"
                        disabled={reviewMutation.isPending || app.status === "approved"}
                        onClick={() => {
                          if (!usernames[app.id] || !passwords[app.id]) {
                            toast({
                              title: "Credentials Required",
                              description: "Please enter a username and password to approve this application.",
                              variant: "destructive",
                            });
                            return;
                          }
                          reviewMutation.mutate({
                            id: app.id,
                            status: "approved",
                            reviewNotes: notes[app.id] || undefined,
                            teamUsername: usernames[app.id],
                            teamPassword: passwords[app.id],
                          });
                        }}
                        data-testid={`btn-team-kyc-approve-${app.id}`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                        {app.status === "approved" ? "Approved" : "Approve & Create Account"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1 text-xs font-bold uppercase tracking-wider"
                        disabled={reviewMutation.isPending || app.status === "rejected"}
                        onClick={() => reviewMutation.mutate({
                          id: app.id,
                          status: "rejected",
                          reviewNotes: notes[app.id] || undefined,
                        })}
                        data-testid={`btn-team-kyc-reject-${app.id}`}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1.5" />
                        {app.status === "rejected" ? "Rejected" : "Reject"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
