import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import {
  Users, Trash2, Plus, Loader2, X, Upload, Download, FileText,
  User, Phone, Briefcase, GraduationCap, Heart, Landmark, Lock,
  ChevronRight, Camera, Edit2, Save, FilePlus, UserCheck,
  CheckCircle2, XCircle, PenTool, ImageIcon, AlertCircle, ClipboardList,
  Mail, Send, Copy, ExternalLink,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

// ── Types ────────────────────────────────────────────────────────────────────
interface TeamMember {
  id: string; username: string; name: string; department: string | null;
  email: string | null; position: string | null; employmentType: string | null;
  startDate: string | null; phone: string | null; dateOfBirth: string | null;
  gender: string | null; nationality: string | null; passportNumber: string | null;
  maritalStatus: string | null; homeAddress: string | null; city: string | null;
  country: string | null; highestQualification: string | null; institution: string | null;
  graduationYear: string | null; previousEmployer: string | null; previousRole: string | null;
  yearsExperience: string | null; emergencyName: string | null; emergencyRelationship: string | null;
  emergencyPhone: string | null; bankName: string | null; bankBranch: string | null;
  payrollAccountName: string | null; payrollAccountNumber: string | null;
  payrollSwift: string | null; photoStoredName: string | null;
  additionalNotes: string | null; createdAt: string;
}

interface TeamDoc {
  id: string; memberId: string; docType: string;
  originalName: string; storedName: string; mimeType: string; size: number; uploadedAt: string;
}

interface TeamKycApp {
  id: string; fullName: string; email: string; phone: string | null;
  nationality: string | null; positionApplied: string | null; department: string | null;
  employmentType: string | null; expectedStartDate: string | null;
  highestQualification: string | null; institution: string | null; graduationYear: string | null;
  previousEmployer: string | null; previousRole: string | null; yearsExperience: string | null;
  homeAddress: string | null; city: string | null; country: string | null;
  dateOfBirth: string | null; gender: string | null; passportNumber: string | null;
  maritalStatus: string | null; emergencyName: string | null; emergencyRelationship: string | null;
  emergencyPhone: string | null; bankName: string | null; bankBranch: string | null;
  payrollAccountName: string | null; payrollAccountNumber: string | null;
  payrollSwift: string | null; additionalNotes: string | null;
  declarationAgreed: boolean | null; declarationName: string | null; declarationDate: string | null;
  photoStoredName: string | null; photoOriginalName: string | null;
  status: string; reviewNotes: string | null; teamUsername: string | null; createdAt: string;
}

interface TeamKycDoc {
  id: string; applicationId: string; docType: string;
  originalName: string; storedName: string; mimeType: string; size: number; uploadedAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DOC_TYPES = [
  { value: "cv", label: "CV / Résumé" },
  { value: "national_id", label: "National ID" },
  { value: "passport", label: "Passport Copy" },
  { value: "certificate", label: "Certificate / Diploma" },
  { value: "bank_statement", label: "Bank Statement" },
  { value: "other", label: "Other Document" },
];

const KYC_DOC_LABELS: Record<string, string> = {
  cv_resume: "CV / Resume", national_id: "National ID Copy",
  passport_copy: "Passport Copy", academic_certificate: "Academic Certificate",
  professional_certificate: "Professional Certificate", reference_letter: "Reference Letter",
  other: "Other Document",
};

const MEMBER_TABS = [
  { key: "credentials", label: "Login", icon: Lock },
  { key: "personal", label: "Personal", icon: User },
  { key: "contact", label: "Contact", icon: Phone },
  { key: "employment", label: "Employment", icon: Briefcase },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "emergency", label: "Emergency", icon: Heart },
  { key: "bank", label: "Bank", icon: Landmark },
  { key: "documents", label: "Documents", icon: FileText },
];

const KYC_TABS = [
  { key: "personal", label: "Personal", icon: User },
  { key: "contact", label: "Contact", icon: Phone },
  { key: "employment", label: "Employment", icon: Briefcase },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "emergency", label: "Emergency", icon: Heart },
  { key: "bank", label: "Bank", icon: Landmark },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "declaration", label: "Declaration", icon: PenTool },
  { key: "review", label: "Review", icon: ClipboardList },
];

const emptyForm = {
  name: "", username: "", password: "", department: "", email: "",
  dateOfBirth: "", gender: "", nationality: "", passportNumber: "", maritalStatus: "",
  phone: "", homeAddress: "", city: "", country: "",
  position: "", employmentType: "", startDate: "",
  highestQualification: "", institution: "", graduationYear: "",
  previousEmployer: "", previousRole: "", yearsExperience: "",
  emergencyName: "", emergencyRelationship: "", emergencyPhone: "",
  bankName: "", bankBranch: "", payrollAccountName: "", payrollAccountNumber: "", payrollSwift: "",
  additionalNotes: "",
};

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function MemberAvatar({ member, size = "md" }: { member: TeamMember; size?: "sm" | "md" | "lg" }) {
  const sz = size === "lg" ? "w-20 h-20 text-2xl" : size === "md" ? "w-12 h-12 text-base" : "w-9 h-9 text-xs";
  if (member.photoStoredName) {
    return (
      <img
        src={`/api/team/members/${member.id}/photo`}
        alt={member.name}
        className={`${sz} rounded-full object-cover border-2 border-border flex-shrink-0`}
      />
    );
  }
  return (
    <div className={`${sz} rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 font-bold text-primary`}>
      {member.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
    </div>
  );
}

// ── KYC Detail Panel ─────────────────────────────────────────────────────────
function KycDetailPanel({ app, onClose }: { app: TeamKycApp; onClose: () => void }) {
  const { toast } = useToast();
  const [kycTab, setKycTab] = useState("personal");
  const [kycUsername, setKycUsername] = useState("");
  const [kycPassword, setKycPassword] = useState("");
  const [reviewNote, setReviewNote] = useState(app.reviewNotes || "");

  const lbl = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

  const { data: kycDocs = [] } = useQuery<TeamKycDoc[]>({
    queryKey: ["/api/team-kyc", app.id, "documents"],
    queryFn: () =>
      fetch(`/api/team-kyc/${app.id}/documents`, { credentials: "include", cache: "no-store" }).then(r => r.json()),
  });

  const reviewMutation = useMutation({
    mutationFn: (body: { status: string; reviewNotes?: string; teamUsername?: string; teamPassword?: string }) =>
      apiRequest("PATCH", `/api/team-kyc/${app.id}`, body),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-kyc"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team/members"] });
      toast({
        title: vars.status === "approved" ? "Application Approved" : "Application Rejected",
        description: vars.status === "approved"
          ? `${app.fullName} has been approved and their account created.`
          : `${app.fullName}'s application has been rejected.`,
      });
      onClose();
    },
    onError: (err: any) => toast({ title: "Action Failed", description: err.message, variant: "destructive" }),
  });

  const handleApprove = () => {
    if (!kycUsername.trim() || !kycPassword.trim()) {
      toast({ title: "Credentials Required", description: "Enter a username and password before approving.", variant: "destructive" });
      return;
    }
    reviewMutation.mutate({ status: "approved", reviewNotes: reviewNote, teamUsername: kycUsername, teamPassword: kycPassword });
  };

  const handleReject = () => {
    reviewMutation.mutate({ status: "rejected", reviewNotes: reviewNote });
  };

  const InfoRow = ({ label, value }: { label: string; value: string | null | undefined | boolean }) => {
    if (value === null || value === undefined || value === "") return null;
    return (
      <div>
        <p className={lbl}>{label}</p>
        <p className="text-sm mt-0.5">{String(value)}</p>
      </div>
    );
  };

  const statusColor = app.status === "approved"
    ? "bg-green-600 text-white"
    : app.status === "rejected"
      ? "bg-destructive text-white"
      : "bg-amber-500 text-white";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-5 py-3 flex items-center justify-between flex-shrink-0 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center flex-shrink-0 border border-border">
            {app.photoStoredName ? (
              <img src={`/api/team-kyc/${app.id}/photo`} alt={app.fullName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-primary">
                {app.fullName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold truncate">{app.fullName}</h2>
              <Badge className={`${statusColor} text-[10px] flex-shrink-0 capitalize`}>{app.status}</Badge>
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              {app.email}{app.positionApplied ? ` · ${app.positionApplied}` : ""}{app.department ? ` · ${app.department}` : ""}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground flex-shrink-0" data-testid="btn-kyc-panel-close">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex overflow-x-auto flex-shrink-0 bg-muted/20">
        {KYC_TABS.map(t => {
          const Icon = t.icon;
          const isReview = t.key === "review";
          return (
            <button
              key={t.key}
              onClick={() => setKycTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b-2 flex-shrink-0 transition-colors ${
                kycTab === t.key
                  ? isReview ? "border-amber-500 text-amber-600" : "border-primary text-primary bg-background"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-kyc-${t.key}`}
            >
              <Icon className="w-3 h-3" />
              {t.label}
              {isReview && app.status === "pending" && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 ml-0.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-5">

          {/* Personal */}
          {kycTab === "personal" && (
            <div className="space-y-5">
              <div className="flex items-start gap-5">
                <div className="flex-shrink-0">
                  <p className={`${lbl} mb-2 flex items-center gap-1`}><Camera className="w-3 h-3" /> Photo</p>
                  <div className="w-24 h-28 rounded-lg border border-border bg-muted/30 overflow-hidden flex items-center justify-center" data-testid={`kyc-photo-${app.id}`}>
                    {app.photoStoredName ? (
                      <img src={`/api/team-kyc/${app.id}/photo`} alt={app.fullName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <ImageIcon className="w-5 h-5" />
                        <p className="text-[9px] text-center px-1">No photo</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <InfoRow label="Full Name" value={app.fullName} />
                  <InfoRow label="Date of Birth" value={app.dateOfBirth} />
                  <InfoRow label="Gender" value={app.gender} />
                  <InfoRow label="Nationality" value={app.nationality} />
                  <InfoRow label="Passport / ID No." value={app.passportNumber} />
                  <InfoRow label="Marital Status" value={app.maritalStatus} />
                </div>
              </div>
            </div>
          )}

          {/* Contact */}
          {kycTab === "contact" && (
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Email" value={app.email} />
              <InfoRow label="Phone" value={app.phone} />
              <InfoRow label="City" value={app.city} />
              <InfoRow label="Country" value={app.country} />
              {app.homeAddress && <div className="col-span-2"><InfoRow label="Home Address" value={app.homeAddress} /></div>}
            </div>
          )}

          {/* Employment */}
          {kycTab === "employment" && (
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Position Applied" value={app.positionApplied} />
              <InfoRow label="Department" value={app.department} />
              <InfoRow label="Employment Type" value={app.employmentType} />
              <InfoRow label="Expected Start Date" value={app.expectedStartDate} />
              {app.additionalNotes && <div className="col-span-2"><InfoRow label="Additional Notes" value={app.additionalNotes} /></div>}
            </div>
          )}

          {/* Education */}
          {kycTab === "education" && (
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Highest Qualification" value={app.highestQualification} />
              <InfoRow label="Institution" value={app.institution} />
              <InfoRow label="Graduation Year" value={app.graduationYear} />
              <InfoRow label="Previous Employer" value={app.previousEmployer} />
              <InfoRow label="Previous Role" value={app.previousRole} />
              <InfoRow label="Years of Experience" value={app.yearsExperience} />
            </div>
          )}

          {/* Emergency */}
          {kycTab === "emergency" && (
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Contact Name" value={app.emergencyName} />
              <InfoRow label="Relationship" value={app.emergencyRelationship} />
              <InfoRow label="Phone" value={app.emergencyPhone} />
            </div>
          )}

          {/* Bank */}
          {kycTab === "bank" && (
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Bank Name" value={app.bankName} />
              <InfoRow label="Branch" value={app.bankBranch} />
              <InfoRow label="Account Name" value={app.payrollAccountName} />
              <InfoRow label="Account Number / IBAN" value={app.payrollAccountNumber} />
              <InfoRow label="SWIFT / BIC" value={app.payrollSwift} />
            </div>
          )}

          {/* Documents */}
          {kycTab === "documents" && (
            <div className="space-y-3">
              {kycDocs.length === 0 ? (
                <div className="border border-dashed border-border rounded-lg p-8 text-center">
                  <FileText className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No documents were uploaded with this application.</p>
                </div>
              ) : (
                kycDocs.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/20 border border-border" data-testid={`kyc-doc-${doc.id}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{doc.originalName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {KYC_DOC_LABELS[doc.docType] || doc.docType} · {fmtSize(doc.size)}
                        </p>
                      </div>
                    </div>
                    <a href={`/api/team-kyc-documents/${doc.id}/download`} download className="flex-shrink-0" data-testid={`btn-dl-kyc-doc-${doc.id}`}>
                      <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs rounded-none">
                        <Download className="w-3 h-3" /> Download
                      </Button>
                    </a>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Statutory Declaration */}
          {kycTab === "declaration" && (
            <div className={`rounded-lg border p-5 space-y-4 ${app.declarationAgreed ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-muted/30 border-border"}`}>
              <div>
                <p className={lbl}>Declaration Status</p>
                <p className={`text-sm mt-1 font-semibold flex items-center gap-1.5 ${app.declarationAgreed ? "text-green-600" : "text-destructive"}`}>
                  {app.declarationAgreed
                    ? <><CheckCircle2 className="w-4 h-4" /> Agreed — Statutory declaration accepted</>
                    : <><XCircle className="w-4 h-4" /> Not agreed</>}
                </p>
              </div>
              {app.declarationName && (
                <div>
                  <p className={lbl}>Digital Signature (Printed Name)</p>
                  <p className="text-base mt-1 font-serif italic">{app.declarationName}</p>
                </div>
              )}
              {app.declarationDate && (
                <div>
                  <p className={lbl}>Date Signed</p>
                  <p className="text-sm mt-1">{app.declarationDate}</p>
                </div>
              )}
              <div>
                <p className={lbl}>Submitted On</p>
                <p className="text-sm mt-1">{new Date(app.createdAt).toLocaleString()}</p>
              </div>
            </div>
          )}

          {/* Review & Action */}
          {kycTab === "review" && (
            <div className="space-y-5">
              {app.status === "approved" && app.teamUsername ? (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">Application Approved</p>
                    <p className="text-xs text-green-600 dark:text-green-500">
                      Login created for <span className="font-mono font-bold">{app.teamUsername}</span>. Team member profile is now active.
                    </p>
                  </div>
                </div>
              ) : app.status === "rejected" ? (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                  <XCircle className="w-5 h-5 text-destructive flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-destructive">Application Rejected</p>
                    {app.reviewNotes && <p className="text-xs text-muted-foreground mt-0.5">Notes: {app.reviewNotes}</p>}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">This application is awaiting review. Review all tabs before approving or rejecting.</p>
                </div>
              )}

              <div className="space-y-2">
                <Label className={lbl}>Review Notes</Label>
                <Textarea
                  className="bg-background border-border resize-none min-h-[70px] text-sm"
                  placeholder="Optional internal notes about this application..."
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  data-testid={`textarea-kyc-review-note-${app.id}`}
                />
              </div>

              {app.status !== "approved" && (
                <div className="space-y-3 border border-border rounded-lg p-4 bg-muted/10">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">Allocate Login Credentials</p>
                  <p className="text-xs text-muted-foreground">Set the username and password the team member will use to log in to Bullex. Required to approve.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className={lbl}>Username <span className="text-destructive">*</span></Label>
                      <Input
                        className="bg-background border-border text-sm"
                        placeholder="e.g. john.doe@bullex"
                        value={kycUsername}
                        onChange={e => setKycUsername(e.target.value)}
                        data-testid={`input-kyc-username-${app.id}`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={lbl}>Password <span className="text-destructive">*</span></Label>
                      <Input
                        type="password"
                        className="bg-background border-border text-sm"
                        placeholder="Set a strong password"
                        value={kycPassword}
                        onChange={e => setKycPassword(e.target.value)}
                        data-testid={`input-kyc-password-${app.id}`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {app.status !== "approved" && (
                <div className="flex gap-3">
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase tracking-wider text-xs"
                    disabled={reviewMutation.isPending}
                    onClick={handleApprove}
                    data-testid={`btn-kyc-approve-${app.id}`}
                  >
                    {reviewMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                    Approve & Create Account
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 font-bold uppercase tracking-wider text-xs"
                    disabled={reviewMutation.isPending || app.status === "rejected"}
                    onClick={handleReject}
                    data-testid={`btn-kyc-reject-${app.id}`}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                    {app.status === "rejected" ? "Rejected" : "Reject"}
                  </Button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function TeamMembersPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // View toggle: members or kyc
  const [view, setView] = useState<"members" | "kyc">("members");

  // Member state
  const [panel, setPanel] = useState<"none" | "add" | "edit">("none");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState("credentials");
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("cv");
  const [docUploading, setDocUploading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  // KYC state
  const [selectedKycId, setSelectedKycId] = useState<string | null>(null);
  const [kycFilter, setKycFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", position: "", department: "", message: "" });
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const upInvite = (f: string, v: string) => setInviteForm(p => ({ ...p, [f]: v }));

  const inviteMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/team-kyc/invite", body),
    onSuccess: async (res) => {
      const data = await res.json();
      setInviteLink(data.kycUrl || null);
      toast({ title: "Invitation Sent", description: `KYC invitation email sent to ${inviteForm.email}` });
    },
    onError: (err: any) => toast({ title: "Invite Failed", description: err.message, variant: "destructive" }),
  });

  const up = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }));
  const lbl = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";
  const inp = "rounded-none h-9 text-sm bg-background border-border";
  const ta = "rounded-none text-sm bg-background border-border resize-none min-h-[72px]";

  // Members queries
  const { data: members = [], isLoading: membersLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team/members"],
  });

  const selected = members.find(m => m.id === selectedId) ?? null;

  const { data: selectedDocs = [] } = useQuery<TeamDoc[]>({
    queryKey: ["/api/team/members", selectedId, "documents"],
    queryFn: async () => {
      if (!selectedId) return [];
      const r = await fetch(`/api/team/members/${selectedId}/documents`, { credentials: "include" });
      return r.json();
    },
    enabled: !!selectedId,
  });

  // KYC queries
  const { data: kycApps = [], isLoading: kycLoading } = useQuery<TeamKycApp[]>({
    queryKey: ["/api/team-kyc"],
    queryFn: () =>
      fetch("/api/team-kyc", { credentials: "include", cache: "no-store" }).then(r => r.json()),
  });

  const filteredKyc = kycFilter === "all" ? kycApps : kycApps.filter(a => a.status === kycFilter);
  const pendingCount = kycApps.filter(a => a.status === "pending").length;
  const selectedKyc = kycApps.find(a => a.id === selectedKycId) ?? null;

  // Member mutations
  const createMutation = useMutation({
    mutationFn: async (body: object) => {
      const r = await fetch("/api/team/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "include" });
      if (!r.ok) { const j = await r.json(); throw new Error(j.message); }
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team/members"] });
      setSelectedId(data.id);
      setPanel("edit");
      setTab("personal");
      toast({ title: "Member Created", description: "Now complete their full KYT profile below." });
    },
    onError: (err: any) => setFormError(err.message || "Failed to create member"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: object }) => {
      const r = await fetch(`/api/team/members/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "include" });
      if (!r.ok) { const j = await r.json(); throw new Error(j.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team/members"] });
      toast({ title: "Profile Saved", description: "Team member data updated." });
    },
    onError: (err: any) => toast({ title: "Save Failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/team/members/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team/members"] });
      setPanel("none"); setSelectedId(null);
      toast({ title: "Member Removed" });
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (docId: string) => {
      const r = await fetch(`/api/team/documents/${docId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/team/members", selectedId, "documents"] }),
  });

  if (role !== "admin") {
    return <div className="flex-1 flex items-center justify-center h-full"><p className="text-sm text-muted-foreground">Admin access required.</p></div>;
  }

  const openAdd = () => {
    setForm({ ...emptyForm });
    setFormError("");
    setTab("credentials");
    setPanel("add");
  };

  const openEdit = (m: TeamMember) => {
    setSelectedId(m.id);
    setForm({
      name: m.name || "", username: m.username || "", password: "",
      department: m.department || "", email: m.email || "",
      dateOfBirth: m.dateOfBirth || "", gender: m.gender || "",
      nationality: m.nationality || "", passportNumber: m.passportNumber || "",
      maritalStatus: m.maritalStatus || "", phone: m.phone || "",
      homeAddress: m.homeAddress || "", city: m.city || "", country: m.country || "",
      position: m.position || "", employmentType: m.employmentType || "",
      startDate: m.startDate || "", highestQualification: m.highestQualification || "",
      institution: m.institution || "", graduationYear: m.graduationYear || "",
      previousEmployer: m.previousEmployer || "", previousRole: m.previousRole || "",
      yearsExperience: m.yearsExperience || "", emergencyName: m.emergencyName || "",
      emergencyRelationship: m.emergencyRelationship || "", emergencyPhone: m.emergencyPhone || "",
      bankName: m.bankName || "", bankBranch: m.bankBranch || "",
      payrollAccountName: m.payrollAccountName || "", payrollAccountNumber: m.payrollAccountNumber || "",
      payrollSwift: m.payrollSwift || "", additionalNotes: m.additionalNotes || "",
    });
    setTab("credentials");
    setPanel("edit");
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.username.trim() || !form.password.trim() || !form.name.trim()) {
      setFormError("Name, username and password are required."); return;
    }
    createMutation.mutate(Object.fromEntries(Object.entries(form).filter(([, v]) => v !== "")));
  };

  const handleSave = () => {
    if (!selectedId) return;
    const body: any = Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== "" || k === "password"));
    if (!body.password) delete body.password;
    updateMutation.mutate({ id: selectedId, body });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    setPhotoUploading(true);
    const fd = new FormData(); fd.append("photo", file);
    try {
      const r = await fetch(`/api/team/members/${selectedId}/photo`, { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) { const j = await r.json(); throw new Error(j.message); }
      queryClient.invalidateQueries({ queryKey: ["/api/team/members"] });
      toast({ title: "Photo Updated" });
    } catch (err: any) {
      toast({ title: "Photo Upload Failed", description: err.message, variant: "destructive" });
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    setDocUploading(true);
    const fd = new FormData(); fd.append("file", file); fd.append("docType", docType);
    try {
      const r = await fetch(`/api/team/members/${selectedId}/documents`, { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) { const j = await r.json(); throw new Error(j.message); }
      queryClient.invalidateQueries({ queryKey: ["/api/team/members", selectedId, "documents"] });
      toast({ title: "Document Uploaded" });
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    } finally {
      setDocUploading(false);
      if (docInputRef.current) docInputRef.current.value = "";
    }
  };

  const closePanel = () => { setPanel("none"); setSelectedId(null); };

  const kycStatusBadge = (s: string) => {
    if (s === "approved") return <Badge className="bg-green-600 text-white text-[9px] px-1.5">Approved</Badge>;
    if (s === "rejected") return <Badge variant="destructive" className="text-[9px] px-1.5">Rejected</Badge>;
    return <Badge className="bg-amber-500 text-white text-[9px] px-1.5">Pending</Badge>;
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden flex-col">

      {/* Top toggle bar */}
      <div className="flex-shrink-0 border-b border-border bg-muted/20 flex items-center gap-1 px-3 py-2">
        <button
          onClick={() => { setView("members"); setSelectedKycId(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${view === "members" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          data-testid="btn-view-members"
        >
          <Users className="w-3.5 h-3.5" /> Team Members
          <span className="ml-1 text-[10px] font-normal opacity-70">{members.length}</span>
        </button>
        <button
          onClick={() => { setView("kyc"); setPanel("none"); setSelectedId(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${view === "kyc" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          data-testid="btn-view-kyc"
        >
          <UserCheck className="w-3.5 h-3.5" /> KYC Applications
          {pendingCount > 0 && (
            <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${view === "kyc" ? "bg-white/20" : "bg-amber-500 text-white"}`}>
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Members View ── */}
      {view === "members" && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left list */}
          <div className={`flex flex-col ${panel !== "none" ? "w-72 flex-shrink-0 border-r border-border" : "flex-1"} overflow-hidden transition-all`}>
            <div className="border-b border-border px-5 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-primary" />
                <div>
                  <h1 className="text-sm font-bold tracking-tight" data-testid="text-team-page-title">Team Members</h1>
                  <p className="text-[10px] text-muted-foreground">Full KYT staff profiles</p>
                </div>
              </div>
              <Button size="sm" className="rounded-none text-xs font-bold uppercase tracking-wider h-8" onClick={openAdd} data-testid="button-add-team-member">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {membersLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground p-4"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</div>
              ) : members.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Users className="w-8 h-8 text-muted-foreground/20 mb-2" />
                  <p className="text-xs text-muted-foreground">No team members yet</p>
                </div>
              ) : members.map(m => (
                <button
                  key={m.id}
                  onClick={() => openEdit(m)}
                  data-testid={`row-team-member-${m.id}`}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-md text-left transition-colors ${selectedId === m.id ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/40 border border-transparent"}`}
                >
                  <MemberAvatar member={m} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{m.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{m.position || m.department || m.email || m.username}</p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Detail / Add panel */}
          {panel !== "none" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="border-b border-border px-6 py-3 flex items-center justify-between flex-shrink-0 gap-4">
                {panel === "edit" && selected ? (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex-shrink-0">
                      <MemberAvatar member={selected} size="md" />
                      <button
                        onClick={() => photoInputRef.current?.click()}
                        disabled={photoUploading}
                        className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-md hover:bg-primary/80 transition-colors"
                        title="Upload photo"
                        data-testid="button-upload-photo"
                      >
                        {photoUploading ? <Loader2 className="w-2.5 h-2.5 text-white animate-spin" /> : <Camera className="w-2.5 h-2.5 text-white" />}
                      </button>
                      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold truncate">{selected.name}</h2>
                      <p className="text-[10px] text-muted-foreground">{selected.position || selected.department || "No role set"}</p>
                    </div>
                  </div>
                ) : (
                  <h2 className="text-sm font-bold uppercase tracking-wider">New Team Member</h2>
                )}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {panel === "edit" && (
                    <>
                      <Button size="sm" className="rounded-none text-xs font-bold h-8 uppercase tracking-wider" onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-member">
                        {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-3.5 h-3.5 mr-1" />Save</>}
                      </Button>
                      <Button size="sm" variant="destructive" className="rounded-none text-xs h-8" onClick={() => { if (confirm(`Remove ${selected?.name}?`)) deleteMutation.mutate(selectedId!); }} data-testid={`button-delete-member-${selectedId}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                  <button onClick={closePanel} className="text-muted-foreground hover:text-foreground" data-testid="button-close-panel">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-border flex overflow-x-auto flex-shrink-0 bg-muted/20">
                {MEMBER_TABS.map(t => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b-2 flex-shrink-0 transition-colors ${tab === t.key ? "border-primary text-primary bg-background" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                      data-testid={`tab-member-${t.key}`}
                    >
                      <Icon className="w-3 h-3" />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Form content */}
              <div className="flex-1 overflow-y-auto p-6">
                {panel === "add" ? (
                  <form onSubmit={handleCreate}>
                    {tab === "credentials" && (
                      <div className="space-y-4 max-w-lg">
                        <p className="text-xs text-muted-foreground mb-4">Create the member's account first — then complete the rest of their profile.</p>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Full Name *</Label>
                          <Input className={inp} placeholder="Full name" value={form.name} onChange={e => up("name", e.target.value)} data-testid="input-team-name" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className={lbl}>Department</Label>
                            <Select value={form.department} onValueChange={v => up("department", v)}>
                              <SelectTrigger className={inp}><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>
                                {["Trading","Operations","Finance","Compliance","Legal","Logistics","IT","HR","Management","Other"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className={lbl}>Position / Role</Label>
                            <Input className={inp} placeholder="e.g. Analyst" value={form.position} onChange={e => up("position", e.target.value)} />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Email</Label>
                          <Input type="email" className={inp} placeholder="team@bullex.tech" value={form.email} onChange={e => up("email", e.target.value)} data-testid="input-team-email" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className={lbl}>Username *</Label>
                            <Input className={inp} placeholder="login username" value={form.username} onChange={e => up("username", e.target.value)} data-testid="input-team-username-create" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className={lbl}>Password *</Label>
                            <Input type="password" className={inp} placeholder="set password" value={form.password} onChange={e => up("password", e.target.value)} data-testid="input-team-password-create" />
                          </div>
                        </div>
                        {formError && <p className="text-xs text-destructive border border-destructive/20 bg-destructive/5 p-2">{formError}</p>}
                        <Button type="submit" className="rounded-none text-xs font-bold uppercase tracking-wider w-full h-10" disabled={createMutation.isPending} data-testid="button-submit-team-member">
                          {createMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creating...</> : "Create Member & Continue →"}
                        </Button>
                      </div>
                    )}
                  </form>
                ) : (
                  <div className="max-w-2xl space-y-5">
                    {tab === "credentials" && (
                      <div className="space-y-4">
                        <p className="text-xs text-muted-foreground">Change username or reset password. Leave password blank to keep current.</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className={lbl}>Full Name *</Label>
                            <Input className={inp} value={form.name} onChange={e => up("name", e.target.value)} data-testid="input-edit-name" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className={lbl}>Department</Label>
                            <Select value={form.department} onValueChange={v => up("department", v)}>
                              <SelectTrigger className={inp}><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>
                                {["Trading","Operations","Finance","Compliance","Legal","Logistics","IT","HR","Management","Other"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className={lbl}>Username *</Label>
                            <Input className={inp} value={form.username} onChange={e => up("username", e.target.value)} data-testid="input-edit-username" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className={lbl}>New Password</Label>
                            <Input type="password" className={inp} placeholder="Leave blank to keep current" value={form.password} onChange={e => up("password", e.target.value)} />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Email</Label>
                          <Input type="email" className={inp} value={form.email} onChange={e => up("email", e.target.value)} />
                        </div>
                      </div>
                    )}

                    {tab === "personal" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5 col-span-2">
                          <Label className={lbl}>Full Legal Name</Label>
                          <Input className={inp} value={form.name} onChange={e => up("name", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Date of Birth</Label>
                          <Input className={inp} placeholder="DD/MM/YYYY" value={form.dateOfBirth} onChange={e => up("dateOfBirth", e.target.value)} data-testid="input-edit-dob" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Gender</Label>
                          <Select value={form.gender} onValueChange={v => up("gender", v)}>
                            <SelectTrigger className={inp}><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Male">Male</SelectItem>
                              <SelectItem value="Female">Female</SelectItem>
                              <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Nationality</Label>
                          <Input className={inp} placeholder="e.g. Guinean" value={form.nationality} onChange={e => up("nationality", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Passport / National ID No.</Label>
                          <Input className={inp} placeholder="Document number" value={form.passportNumber} onChange={e => up("passportNumber", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Marital Status</Label>
                          <Select value={form.maritalStatus} onValueChange={v => up("maritalStatus", v)}>
                            <SelectTrigger className={inp}><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Single">Single</SelectItem>
                              <SelectItem value="Married">Married</SelectItem>
                              <SelectItem value="Divorced">Divorced</SelectItem>
                              <SelectItem value="Widowed">Widowed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {tab === "contact" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className={lbl}>Email</Label>
                          <Input type="email" className={inp} value={form.email} onChange={e => up("email", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Phone Number</Label>
                          <Input className={inp} placeholder="+XXX XX XXX XXXX" value={form.phone} onChange={e => up("phone", e.target.value)} />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                          <Label className={lbl}>Home Address</Label>
                          <Textarea className={ta} placeholder="Full home address" value={form.homeAddress} onChange={e => up("homeAddress", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>City</Label>
                          <Input className={inp} value={form.city} onChange={e => up("city", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Country</Label>
                          <Input className={inp} value={form.country} onChange={e => up("country", e.target.value)} />
                        </div>
                      </div>
                    )}

                    {tab === "employment" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className={lbl}>Position / Role</Label>
                          <Input className={inp} placeholder="e.g. Trade Analyst" value={form.position} onChange={e => up("position", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Department</Label>
                          <Select value={form.department} onValueChange={v => up("department", v)}>
                            <SelectTrigger className={inp}><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              {["Trading","Operations","Finance","Compliance","Legal","Logistics","IT","HR","Management","Other"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Employment Type</Label>
                          <Select value={form.employmentType} onValueChange={v => up("employmentType", v)}>
                            <SelectTrigger className={inp}><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Full-Time">Full-Time</SelectItem>
                              <SelectItem value="Part-Time">Part-Time</SelectItem>
                              <SelectItem value="Contract">Contract</SelectItem>
                              <SelectItem value="Consultant">Consultant</SelectItem>
                              <SelectItem value="Intern">Intern</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Start Date</Label>
                          <Input className={inp} placeholder="DD/MM/YYYY" value={form.startDate} onChange={e => up("startDate", e.target.value)} />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                          <Label className={lbl}>Additional Notes</Label>
                          <Textarea className={ta} value={form.additionalNotes} onChange={e => up("additionalNotes", e.target.value)} />
                        </div>
                      </div>
                    )}

                    {tab === "education" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className={lbl}>Highest Qualification</Label>
                          <Select value={form.highestQualification} onValueChange={v => up("highestQualification", v)}>
                            <SelectTrigger className={inp}><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="High School">High School</SelectItem>
                              <SelectItem value="Diploma">Diploma</SelectItem>
                              <SelectItem value="Bachelor's Degree">Bachelor's Degree</SelectItem>
                              <SelectItem value="Master's Degree">Master's Degree</SelectItem>
                              <SelectItem value="PhD / Doctorate">PhD / Doctorate</SelectItem>
                              <SelectItem value="Professional Certification">Professional Certification</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Graduation Year</Label>
                          <Input className={inp} placeholder="e.g. 2018" value={form.graduationYear} onChange={e => up("graduationYear", e.target.value)} />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                          <Label className={lbl}>Institution / University</Label>
                          <Input className={inp} value={form.institution} onChange={e => up("institution", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Previous Employer</Label>
                          <Input className={inp} value={form.previousEmployer} onChange={e => up("previousEmployer", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Previous Role / Title</Label>
                          <Input className={inp} value={form.previousRole} onChange={e => up("previousRole", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Total Years of Experience</Label>
                          <Input className={inp} placeholder="e.g. 5" value={form.yearsExperience} onChange={e => up("yearsExperience", e.target.value)} />
                        </div>
                      </div>
                    )}

                    {tab === "emergency" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5 col-span-2">
                          <Label className={lbl}>Emergency Contact Name</Label>
                          <Input className={inp} placeholder="Full name" value={form.emergencyName} onChange={e => up("emergencyName", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Relationship</Label>
                          <Input className={inp} placeholder="e.g. Spouse, Parent" value={form.emergencyRelationship} onChange={e => up("emergencyRelationship", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Phone Number</Label>
                          <Input className={inp} placeholder="+XXX XX XXX XXXX" value={form.emergencyPhone} onChange={e => up("emergencyPhone", e.target.value)} />
                        </div>
                      </div>
                    )}

                    {tab === "bank" && (
                      <div className="grid grid-cols-2 gap-4">
                        <p className="col-span-2 text-xs text-muted-foreground">Used for salary / payroll payments.</p>
                        <div className="space-y-1.5 col-span-2">
                          <Label className={lbl}>Bank Name</Label>
                          <Input className={inp} value={form.bankName} onChange={e => up("bankName", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Branch</Label>
                          <Input className={inp} value={form.bankBranch} onChange={e => up("bankBranch", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>SWIFT / BIC Code</Label>
                          <Input className={inp} value={form.payrollSwift} onChange={e => up("payrollSwift", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Account Name</Label>
                          <Input className={inp} value={form.payrollAccountName} onChange={e => up("payrollAccountName", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className={lbl}>Account Number / IBAN</Label>
                          <Input className={inp} value={form.payrollAccountNumber} onChange={e => up("payrollAccountNumber", e.target.value)} />
                        </div>
                      </div>
                    )}

                    {tab === "documents" && (
                      <div className="space-y-5">
                        <div className="border border-dashed border-border rounded-none p-4 space-y-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Upload Document</p>
                          <div className="flex items-center gap-2">
                            <Select value={docType} onValueChange={setDocType}>
                              <SelectTrigger className="rounded-none h-9 text-xs w-52 bg-background border-border">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DOC_TYPES.map(dt => <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-none text-xs h-9"
                              onClick={() => docInputRef.current?.click()}
                              disabled={docUploading}
                              data-testid="button-upload-doc"
                            >
                              {docUploading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Uploading...</> : <><Upload className="w-3.5 h-3.5 mr-1.5" />Choose File</>}
                            </Button>
                            <input ref={docInputRef} type="file" className="hidden" onChange={handleDocUpload} />
                          </div>
                        </div>
                        {selectedDocs.length === 0 ? (
                          <div className="text-center py-10 border border-border rounded-none">
                            <FilePlus className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">No documents yet</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {selectedDocs.map(doc => {
                              const dt = DOC_TYPES.find(d => d.value === doc.docType);
                              return (
                                <div key={doc.id} className="flex items-center gap-3 p-2.5 border border-border rounded-none bg-muted/10" data-testid={`doc-row-${doc.id}`}>
                                  <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold truncate">{doc.originalName}</p>
                                    <p className="text-[10px] text-muted-foreground">{dt?.label || doc.docType} · {fmtSize(doc.size)}</p>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <a
                                      href={`/api/team/documents/${doc.id}/download`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-muted-foreground hover:text-primary transition-colors"
                                      title="Download"
                                      data-testid={`btn-download-doc-${doc.id}`}
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </a>
                                    <button
                                      onClick={() => deleteDocMutation.mutate(doc.id)}
                                      disabled={deleteDocMutation.isPending}
                                      className="text-muted-foreground hover:text-destructive transition-colors"
                                      title="Delete"
                                      data-testid={`btn-delete-doc-${doc.id}`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {tab !== "documents" && (
                      <div className="pt-2">
                        <Button onClick={handleSave} disabled={updateMutation.isPending} className="rounded-none text-xs font-bold uppercase tracking-wider h-9" data-testid="button-save-section">
                          {updateMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving...</> : <><Save className="w-3.5 h-3.5 mr-1.5" />Save Changes</>}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── KYC Applications View ── */}
      {view === "kyc" && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left list */}
          <div className={`flex flex-col ${selectedKycId ? "w-72 flex-shrink-0 border-r border-border" : "flex-1"} overflow-hidden`}>
            <div className="border-b border-border px-5 py-4 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <UserCheck className="w-4 h-4 text-primary" />
                  <div>
                    <h1 className="text-sm font-bold tracking-tight">KYC Applications</h1>
                    <p className="text-[10px] text-muted-foreground">Staff onboarding submissions</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowInvite(true); setInviteLink(null); }}
                  data-testid="btn-invite-candidate"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-[10px] font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors"
                >
                  <Mail className="w-3 h-3" /> Invite
                </button>
              </div>
              {/* Filter bar */}
              <div className="flex gap-1">
                {(["pending", "all", "approved", "rejected"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setKycFilter(f)}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      kycFilter === f
                        ? f === "pending" ? "bg-amber-500 text-white" : f === "approved" ? "bg-green-600 text-white" : f === "rejected" ? "bg-destructive text-white" : "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`btn-kyc-filter-${f}`}
                  >
                    {f}
                    {f === "pending" && pendingCount > 0 && <span className="ml-1">({pendingCount})</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {kycLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground p-4"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</div>
              ) : filteredKyc.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <UserCheck className="w-8 h-8 text-muted-foreground/20 mb-2" />
                  <p className="text-xs text-muted-foreground">No {kycFilter === "all" ? "" : kycFilter} applications</p>
                </div>
              ) : filteredKyc.map(app => (
                <button
                  key={app.id}
                  onClick={() => setSelectedKycId(app.id === selectedKycId ? null : app.id)}
                  data-testid={`row-kyc-${app.id}`}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-md text-left transition-colors ${selectedKycId === app.id ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/40 border border-transparent"}`}
                >
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center flex-shrink-0 border border-border">
                    {app.photoStoredName ? (
                      <img src={`/api/team-kyc/${app.id}/photo`} alt={app.fullName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-bold text-primary">
                        {app.fullName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{app.fullName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{app.positionApplied || app.department || app.email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {kycStatusBadge(app.status)}
                    {app.status === "pending" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* KYC Detail panel */}
          {selectedKycId && selectedKyc && (
            <KycDetailPanel
              key={selectedKycId}
              app={selectedKyc}
              onClose={() => setSelectedKycId(null)}
            />
          )}

          {!selectedKycId && (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <UserCheck className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm font-semibold text-muted-foreground">Select an application to review</p>
                <p className="text-xs text-muted-foreground mt-1">View all details, documents, and take action from the Review tab.</p>
                <button
                  onClick={() => { setShowInvite(true); setInviteLink(null); }}
                  data-testid="btn-invite-candidate-empty"
                  className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded text-xs font-bold hover:bg-primary/90 transition-colors mx-auto"
                >
                  <Mail className="w-3.5 h-3.5" /> Invite a Candidate
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Invite Candidate Modal ── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background border border-border rounded-lg shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold">Invite Candidate</h2>
              </div>
              <button
                onClick={() => setShowInvite(false)}
                data-testid="btn-invite-modal-close"
                className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {inviteLink ? (
                /* Success state */
                <div className="space-y-4">
                  <div className="flex flex-col items-center text-center gap-2 py-2">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                    <p className="text-sm font-semibold">Invitation Sent!</p>
                    <p className="text-xs text-muted-foreground">An email with the KYC form link has been sent to <strong>{inviteForm.email}</strong>.</p>
                  </div>
                  <div className="bg-muted/50 border border-border rounded p-3 space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">KYC Form Link</p>
                    <p className="text-xs text-primary break-all">{inviteLink}</p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(inviteLink); toast({ title: "Link Copied" }); }}
                      data-testid="btn-copy-invite-link"
                      className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors mt-1"
                    >
                      <Copy className="w-3 h-3" /> Copy Link
                    </button>
                  </div>
                  <button
                    onClick={() => { setShowInvite(false); setInviteForm({ name: "", email: "", position: "", department: "", message: "" }); setInviteLink(null); }}
                    data-testid="btn-invite-done"
                    className="w-full py-2 bg-primary text-primary-foreground rounded text-xs font-bold hover:bg-primary/90 transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                /* Form state */
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Send the KYC onboarding form link to a candidate with their details pre-filled.</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Full Name</Label>
                      <Input
                        value={inviteForm.name}
                        onChange={e => upInvite("name", e.target.value)}
                        placeholder="Jane Doe"
                        className="h-9 text-xs rounded-none bg-background border-border"
                        data-testid="input-invite-name"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email <span className="text-destructive">*</span></Label>
                      <Input
                        value={inviteForm.email}
                        onChange={e => upInvite("email", e.target.value)}
                        placeholder="jane@example.com"
                        type="email"
                        className="h-9 text-xs rounded-none bg-background border-border"
                        data-testid="input-invite-email"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Position</Label>
                      <Input
                        value={inviteForm.position}
                        onChange={e => upInvite("position", e.target.value)}
                        placeholder="e.g. Trade Analyst"
                        className="h-9 text-xs rounded-none bg-background border-border"
                        data-testid="input-invite-position"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Department</Label>
                      <Input
                        value={inviteForm.department}
                        onChange={e => upInvite("department", e.target.value)}
                        placeholder="e.g. Operations"
                        className="h-9 text-xs rounded-none bg-background border-border"
                        data-testid="input-invite-department"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Personal Message (optional)</Label>
                    <Textarea
                      value={inviteForm.message}
                      onChange={e => upInvite("message", e.target.value)}
                      placeholder="e.g. Welcome to the team! Please complete your KYC as soon as possible."
                      className="text-xs rounded-none bg-background border-border resize-none min-h-[64px]"
                      data-testid="input-invite-message"
                    />
                  </div>

                  <button
                    disabled={!inviteForm.email || inviteMutation.isPending}
                    onClick={() => inviteMutation.mutate(inviteForm)}
                    data-testid="btn-send-invite"
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {inviteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
