import { useState } from "react";
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
  Users, Trash2, Plus, Loader2, X, Download, FileText,
  User, Phone, Briefcase, GraduationCap, Heart, Landmark, Lock,
  ChevronRight, Camera, FilePlus, UserCheck,
  CheckCircle2, XCircle, PenTool, ImageIcon, AlertCircle, ClipboardList,
  Mail, Send, Copy, ExternalLink, ShieldCheck, RefreshCw, KeyRound,
} from "lucide-react";
import { PLATFORM_MODULES } from "@/components/admin-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useAmendMode } from "@/hooks/use-amend-mode";
import { AmendDialog, type AmendSection } from "@/components/amend-dialog";
import { Pencil } from "lucide-react";
import type { KycApplication, TradeEnquiry, PotentialClient } from "@shared/schema";

type MemberSubmissions = {
  kycs: (KycApplication & { participantId?: string | null })[];
  enquiries: TradeEnquiry[];
  potentialClients: PotentialClient[];
};
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
  additionalNotes: string | null; allowedModules: string[] | null; createdAt: string;
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
  participantId?: string | null;
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
  { key: "submissions", label: "Submissions", icon: ClipboardList },
  { key: "credentials", label: "Login", icon: Lock },
  { key: "personal", label: "Personal", icon: User },
  { key: "contact", label: "Contact", icon: Phone },
  { key: "employment", label: "Employment", icon: Briefcase },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "emergency", label: "Emergency", icon: Heart },
  { key: "bank", label: "Bank", icon: Landmark },
  { key: "access", label: "Access", icon: ShieldCheck },
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

// ── Employment type → default module preset ───────────────────────────────────
const ALL_MODULE_IDS = PLATFORM_MODULES.map(m => m.id);

function getModulePreset(employmentType: string | null): string[] {
  const et = (employmentType || "").toLowerCase();
  if (et.includes("full") || et.includes("permanent")) return [...ALL_MODULE_IDS];
  if (et.includes("part")) return ["dashboard", "documents", "vault"];
  if (et.includes("contract")) return ["dashboard", "enquiries", "trading", "documents"];
  if (et.includes("intern") || et.includes("train")) return ["dashboard"];
  return ["dashboard", "documents"];
}

// ── KYC Detail Panel ─────────────────────────────────────────────────────────
function KycDetailPanel({ app, onClose }: { app: TeamKycApp; onClose: () => void }) {
  const { toast } = useToast();
  const [kycTab, setKycTab] = useState("personal");
  const [kycUsername, setKycUsername] = useState("");
  const [kycPassword, setKycPassword] = useState("");
  const [reviewNote, setReviewNote] = useState(app.reviewNotes || "");
  const [allowedModules, setAllowedModules] = useState<string[]>(() => getModulePreset(app.employmentType));

  const toggleModule = (id: string) =>
    setAllowedModules(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);

  const lbl = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

  const { data: kycDocs = [] } = useQuery<TeamKycDoc[]>({
    queryKey: ["/api/team-kyc", app.id, "documents"],
    queryFn: () =>
      fetch(`/api/team-kyc/${app.id}/documents`, { credentials: "include", cache: "no-store" }).then(r => r.json()),
  });

  const resendMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/team-kyc/${app.id}/resend-welcome`),
    onSuccess: () => {
      toast({ title: "Welcome Resent", description: `Welcome email + NCNDA resent to ${app.fullName}.` });
    },
    onError: (err: any) => toast({ title: "Resend Failed", description: err.message, variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: async (body: { status: string; reviewNotes?: string; teamUsername?: string; teamPassword?: string; allowedModules?: string[] }) => {
      const res = await apiRequest("PATCH", `/api/team-kyc/${app.id}`, body);
      try { return await res.json(); } catch { return {}; }
    },
    onSuccess: (data: any, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-kyc"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team/members"] });
      const emailFailed = vars.status === "approved" && data && data.emailSent !== true;
      toast({
        title: vars.status === "approved" ? "Application Approved" : "Application Rejected",
        description: vars.status === "approved"
          ? (emailFailed
              ? `${app.fullName} has been approved and their account created. ⚠ Welcome email was NOT delivered: ${data?.emailError || "no confirmation from email provider"}`
              : `${app.fullName} has been approved, account created, and welcome email sent to ${app.email}.`)
          : `${app.fullName}'s application has been rejected.`,
        variant: emailFailed ? "destructive" : "default",
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
    if (allowedModules.length === 0) {
      toast({ title: "No Access Selected", description: "Grant at least one platform module before approving.", variant: "destructive" });
      return;
    }
    reviewMutation.mutate({ status: "approved", reviewNotes: reviewNote, teamUsername: kycUsername, teamPassword: kycPassword, allowedModules });
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
              {/* ── Information Completeness Checklist ── */}
              {(() => {
                const has = (v: string | null | undefined | boolean) => v !== null && v !== undefined && v !== "" && v !== false;
                const sections = [
                  {
                    label: "Passport Photo",
                    icon: Camera,
                    filled: has(app.photoStoredName),
                    detail: app.photoOriginalName || null,
                  },
                  {
                    label: "Personal Details",
                    icon: User,
                    items: [
                      { name: "Date of Birth", v: app.dateOfBirth },
                      { name: "Gender", v: app.gender },
                      { name: "Nationality", v: app.nationality },
                      { name: "Passport / ID No.", v: app.passportNumber },
                      { name: "Marital Status", v: app.maritalStatus },
                    ],
                  },
                  {
                    label: "Contact Information",
                    icon: Phone,
                    items: [
                      { name: "Phone", v: app.phone },
                      { name: "Home Address", v: app.homeAddress },
                      { name: "City", v: app.city },
                      { name: "Country", v: app.country },
                    ],
                  },
                  {
                    label: "Employment Details",
                    icon: Briefcase,
                    items: [
                      { name: "Position Applied", v: app.positionApplied },
                      { name: "Department", v: app.department },
                      { name: "Employment Type", v: app.employmentType },
                      { name: "Expected Start Date", v: app.expectedStartDate },
                    ],
                  },
                  {
                    label: "Education & Experience",
                    icon: GraduationCap,
                    items: [
                      { name: "Qualification", v: app.highestQualification },
                      { name: "Institution", v: app.institution },
                      { name: "Graduation Year", v: app.graduationYear },
                      { name: "Previous Employer", v: app.previousEmployer },
                      { name: "Previous Role", v: app.previousRole },
                      { name: "Years Experience", v: app.yearsExperience },
                    ],
                  },
                  {
                    label: "Emergency Contact",
                    icon: Heart,
                    items: [
                      { name: "Name", v: app.emergencyName },
                      { name: "Relationship", v: app.emergencyRelationship },
                      { name: "Phone", v: app.emergencyPhone },
                    ],
                  },
                  {
                    label: "Bank Details",
                    icon: Landmark,
                    items: [
                      { name: "Bank Name", v: app.bankName },
                      { name: "Branch", v: app.bankBranch },
                      { name: "Account Name", v: app.payrollAccountName },
                      { name: "Account Number", v: app.payrollAccountNumber },
                      { name: "SWIFT / BIC", v: app.payrollSwift },
                    ],
                  },
                  {
                    label: "Declaration",
                    icon: PenTool,
                    filled: has(app.declarationAgreed) && has(app.declarationName),
                    detail: app.declarationAgreed ? `Signed by ${app.declarationName || "—"}` : null,
                  },
                  {
                    label: "Documents Uploaded",
                    icon: FileText,
                    filled: kycDocs.length > 0,
                    detail: kycDocs.length > 0 ? `${kycDocs.length} file${kycDocs.length !== 1 ? "s" : ""}` : null,
                  },
                ];

                return (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-border bg-muted/30">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Application Information Checklist</p>
                    </div>
                    <div className="divide-y divide-border">
                      {sections.map(sec => {
                        const Icon = sec.icon;
                        let filled: boolean;
                        let filledCount: number | null = null;
                        let totalCount: number | null = null;

                        if ("items" in sec && sec.items) {
                          filledCount = sec.items.filter(i => has(i.v)).length;
                          totalCount = sec.items.length;
                          filled = filledCount > 0;
                        } else {
                          filled = sec.filled ?? false;
                        }

                        return (
                          <div key={sec.label} className="flex items-center gap-3 px-4 py-2.5">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${filled ? "bg-green-100 dark:bg-green-900/40" : "bg-muted"}`}>
                              {filled
                                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                                : <AlertCircle className="w-3 h-3 text-muted-foreground" />
                              }
                            </div>
                            <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${filled ? "text-foreground" : "text-muted-foreground"}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium ${filled ? "text-foreground" : "text-muted-foreground"}`}>{sec.label}</p>
                              {filled && ("items" in sec && sec.items) && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                  {sec.items.filter(i => has(i.v)).map(i => i.name).join(" · ")}
                                </p>
                              )}
                              {filled && sec.detail && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">{sec.detail}</p>
                              )}
                            </div>
                            <div className="flex-shrink-0 text-right">
                              {filledCount !== null && totalCount !== null ? (
                                <span className={`text-[10px] font-bold ${filledCount === totalCount ? "text-green-600 dark:text-green-400" : filledCount > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                                  {filledCount}/{totalCount}
                                </span>
                              ) : (
                                <span className={`text-[10px] font-bold ${filled ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                                  {filled ? "✓" : "—"}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {app.status === "approved" && app.teamUsername ? (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">Application Approved</p>
                    <p className="text-xs text-green-600 dark:text-green-500">
                      Login created for <span className="font-mono font-bold">{app.teamUsername}</span>
                      {app.participantId && (
                        <> · Participant ID <span className="font-mono font-bold" data-testid={`text-team-participant-id-${app.id}`}>{app.participantId}</span></>
                      )}. Team member profile is now active.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[11px] h-7"
                      disabled={resendMutation.isPending}
                      onClick={() => resendMutation.mutate()}
                      data-testid={`btn-team-kyc-resend-${app.id}`}
                    >
                      {resendMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
                      {resendMutation.isPending ? "Sending..." : "Resend Welcome + NCNDA"}
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
                <div className="space-y-4 border border-border rounded-lg p-4 bg-muted/10">
                  {/* Login credentials */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-primary">Allocate Login Credentials</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Set the username and password for Bullex login. Required to approve.</p>
                    </div>
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

                  {/* Platform access permissions */}
                  <div className="space-y-2.5 pt-3 border-t border-border">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5" /> Platform Access Permissions
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Select which modules this team member can access.
                          {app.employmentType && <span className="ml-1 italic">Auto-suggested for <strong>{app.employmentType}</strong>.</span>}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded flex-shrink-0 ${allowedModules.length > 0 ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
                        {allowedModules.length}/{PLATFORM_MODULES.length} modules
                      </span>
                    </div>

                    {/* Quick presets */}
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[10px] text-muted-foreground self-center">Quick presets:</span>
                      {[
                        { label: "Full Access", modules: ALL_MODULE_IDS },
                        { label: "Full-Time", modules: ALL_MODULE_IDS },
                        { label: "Part-Time", modules: ["dashboard", "documents", "vault"] },
                        { label: "Contractor", modules: ["dashboard", "enquiries", "trading", "documents"] },
                        { label: "Intern", modules: ["dashboard"] },
                      ].map(p => (
                        <button
                          key={p.label}
                          onClick={() => setAllowedModules(p.modules)}
                          data-testid={`btn-preset-${p.label.toLowerCase().replace(/\s+/g, "-")}`}
                          className="px-2 py-0.5 text-[10px] font-bold bg-muted hover:bg-primary hover:text-primary-foreground rounded transition-colors border border-border"
                        >
                          {p.label}
                        </button>
                      ))}
                      <button
                        onClick={() => setAllowedModules([])}
                        className="px-2 py-0.5 text-[10px] font-bold text-muted-foreground hover:text-destructive rounded transition-colors"
                      >
                        Clear all
                      </button>
                    </div>

                    {/* Module toggles */}
                    <div className="grid grid-cols-1 gap-1.5">
                      {PLATFORM_MODULES.map(mod => {
                        const Icon = mod.icon;
                        const active = allowedModules.includes(mod.id);
                        return (
                          <button
                            key={mod.id}
                            onClick={() => toggleModule(mod.id)}
                            data-testid={`btn-module-${mod.id}`}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-md border text-left transition-all ${
                              active
                                ? "bg-primary/8 border-primary/30 dark:bg-primary/10"
                                : "bg-background border-border hover:border-muted-foreground/40"
                            }`}
                          >
                            <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                              active ? "bg-primary border-primary" : "border-muted-foreground/30 bg-background"
                            }`}>
                              {active && <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />}
                            </div>
                            <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>{mod.title}</p>
                              <p className="text-[10px] text-muted-foreground">{mod.description}</p>
                            </div>
                          </button>
                        );
                      })}
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

// ── Locked Member View (read-only one-scroll profile) ───────────────────────
function ReadField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs text-foreground border-b border-border/60 pb-1.5 min-h-[1.5rem] break-words" data-testid={`locked-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
        {value && String(value).trim() !== "" ? value : <span className="text-muted-foreground/60">—</span>}
      </p>
    </div>
  );
}

function LockedSection({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-background rounded-none" data-testid={`locked-section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
        <Icon className="w-3.5 h-3.5 text-primary" />
        <h3 className="text-[11px] font-bold uppercase tracking-wider">{title}</h3>
        <Lock className="w-3 h-3 text-muted-foreground ml-auto" />
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function LockedMemberView({
  member, profileModules, docs, submissions, submissionsLoading, submissionsError,
  submissionsErrorObj, refetchSubmissions, onSendReset, sendingReset, onNavigate,
}: {
  member: TeamMember;
  profileModules: string[];
  docs: TeamDoc[];
  submissions: MemberSubmissions | undefined;
  submissionsLoading: boolean;
  submissionsError: boolean;
  submissionsErrorObj: Error | null;
  refetchSubmissions: () => void;
  onSendReset: () => void;
  sendingReset: boolean;
  onNavigate: (to: string) => void;
}) {
  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-10" data-testid="locked-member-view">
      <div className="border border-primary/30 bg-primary/5 px-4 py-2.5 flex items-center gap-2.5 rounded-none">
        <Lock className="w-4 h-4 text-primary flex-shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-bold">Profile Locked</p>
          <p className="text-[11px] text-muted-foreground">This team member has been approved. All profile data is read-only and cannot be amended. Use the secure reset link below to let the member update their own password.</p>
        </div>
      </div>

      <LockedSection icon={Lock} title="Login & Account">
        <div className="grid grid-cols-2 gap-x-5 gap-y-3">
          <ReadField label="Full Name" value={member.name} />
          <ReadField label="Username" value={member.username} />
          <ReadField label="Email" value={member.email} />
          <ReadField label="Department" value={member.department} />
        </div>
        <div className="mt-4 border border-border bg-muted/30 rounded-md p-3 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <KeyRound className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-bold">Password Reset Link</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Emails a secure one-time link (valid for 2 hours) so the team member can set their own password. No plaintext password is sent.</p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-none text-xs font-bold uppercase tracking-wider h-8"
            disabled={!member.email || sendingReset}
            onClick={onSendReset}
            data-testid="btn-send-reset-link"
          >
            {sendingReset
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Sending...</>
              : <><Mail className="w-3.5 h-3.5 mr-1.5" /> Email Reset Link{member.email ? ` to ${member.email}` : ""}</>}
          </Button>
          {!member.email && <p className="text-[10px] text-destructive">No email on file — reset link cannot be sent.</p>}
        </div>
      </LockedSection>

      <LockedSection icon={User} title="Personal">
        <div className="grid grid-cols-2 gap-x-5 gap-y-3">
          <ReadField label="Full Legal Name" value={member.name} />
          <ReadField label="Date of Birth" value={member.dateOfBirth} />
          <ReadField label="Gender" value={member.gender} />
          <ReadField label="Nationality" value={member.nationality} />
          <ReadField label="Passport / National ID" value={member.passportNumber} />
          <ReadField label="Marital Status" value={member.maritalStatus} />
        </div>
      </LockedSection>

      <LockedSection icon={Phone} title="Contact">
        <div className="grid grid-cols-2 gap-x-5 gap-y-3">
          <ReadField label="Email" value={member.email} />
          <ReadField label="Phone" value={member.phone} />
          <div className="col-span-2"><ReadField label="Home Address" value={member.homeAddress} /></div>
          <ReadField label="City" value={member.city} />
          <ReadField label="Country" value={member.country} />
        </div>
      </LockedSection>

      <LockedSection icon={Briefcase} title="Employment">
        <div className="grid grid-cols-2 gap-x-5 gap-y-3">
          <ReadField label="Position / Role" value={member.position} />
          <ReadField label="Department" value={member.department} />
          <ReadField label="Employment Type" value={member.employmentType} />
          <ReadField label="Start Date" value={member.startDate} />
          <div className="col-span-2"><ReadField label="Additional Notes" value={member.additionalNotes} /></div>
        </div>
      </LockedSection>

      <LockedSection icon={GraduationCap} title="Education & Experience">
        <div className="grid grid-cols-2 gap-x-5 gap-y-3">
          <ReadField label="Highest Qualification" value={member.highestQualification} />
          <ReadField label="Graduation Year" value={member.graduationYear} />
          <div className="col-span-2"><ReadField label="Institution / University" value={member.institution} /></div>
          <ReadField label="Previous Employer" value={member.previousEmployer} />
          <ReadField label="Previous Role" value={member.previousRole} />
          <ReadField label="Years of Experience" value={member.yearsExperience} />
        </div>
      </LockedSection>

      <LockedSection icon={Heart} title="Emergency Contact">
        <div className="grid grid-cols-2 gap-x-5 gap-y-3">
          <div className="col-span-2"><ReadField label="Contact Name" value={member.emergencyName} /></div>
          <ReadField label="Relationship" value={member.emergencyRelationship} />
          <ReadField label="Phone" value={member.emergencyPhone} />
        </div>
      </LockedSection>

      <LockedSection icon={Landmark} title="Bank / Payroll">
        <div className="grid grid-cols-2 gap-x-5 gap-y-3">
          <div className="col-span-2"><ReadField label="Bank Name" value={member.bankName} /></div>
          <ReadField label="Branch" value={member.bankBranch} />
          <ReadField label="SWIFT / BIC" value={member.payrollSwift} />
          <ReadField label="Account Name" value={member.payrollAccountName} />
          <ReadField label="Account Number / IBAN" value={member.payrollAccountNumber} />
        </div>
      </LockedSection>

      <LockedSection icon={ShieldCheck} title="Platform Access">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] text-muted-foreground">Modules this member can access when signed in to Bullex.</p>
          <span className={`text-[10px] font-bold px-2 py-1 rounded ${profileModules.length > 0 ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
            {profileModules.length}/{PLATFORM_MODULES.length} modules
          </span>
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {PLATFORM_MODULES.map(mod => {
            const Icon = mod.icon;
            const active = profileModules.includes(mod.id);
            return (
              <div
                key={mod.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-md border ${active ? "bg-primary/8 border-primary/30 dark:bg-primary/10" : "bg-muted/30 border-border opacity-60"}`}
                data-testid={`locked-module-${mod.id}`}
              >
                <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 ${active ? "bg-primary border-primary" : "border-muted-foreground/30 bg-background"}`}>
                  {active && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                </div>
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>{mod.title}</p>
                  <p className="text-[10px] text-muted-foreground">{mod.description}</p>
                </div>
                <span className={`text-[10px] font-bold ${active ? "text-primary" : "text-muted-foreground/40"}`}>
                  {active ? "Allowed" : "Blocked"}
                </span>
              </div>
            );
          })}
        </div>
      </LockedSection>

      <LockedSection icon={FileText} title="Documents">
        {docs.length === 0 ? (
          <div className="text-center py-6">
            <FilePlus className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No documents on file.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map(doc => {
              const dt = DOC_TYPES.find(d => d.value === doc.docType);
              return (
                <div key={doc.id} className="flex items-center gap-3 p-2.5 border border-border rounded-none bg-muted/10" data-testid={`locked-doc-${doc.id}`}>
                  <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{doc.originalName}</p>
                    <p className="text-[10px] text-muted-foreground">{dt?.label || doc.docType} · {fmtSize(doc.size)}</p>
                  </div>
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
                </div>
              );
            })}
          </div>
        )}
      </LockedSection>

      <LockedSection icon={ClipboardList} title="Submissions">
        {submissionsLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
        ) : submissionsError ? (
          <div className="border border-destructive/30 bg-destructive/5 rounded-none p-3 space-y-2">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <p className="text-xs font-bold uppercase tracking-wider">Could not load submissions</p>
            </div>
            <p className="text-[11px] text-muted-foreground">{submissionsErrorObj?.message || "Unknown error"}</p>
            <Button size="sm" variant="outline" className="rounded-none text-xs h-8" onClick={() => refetchSubmissions()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border border-border rounded-none">
              <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider">Client KYC Applications</p>
                <Badge variant="outline" className="text-[10px]">{submissions?.kycs?.length ?? 0}</Badge>
              </div>
              {(submissions?.kycs ?? []).length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">No KYCs submitted.</div>
              ) : (
                <div className="divide-y divide-border">
                  {submissions!.kycs.map(k => (
                    <div key={k.id} className="p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold truncate">{k.companyName}</span>
                          {k.participantId && <Badge variant="outline" className="font-mono text-[9px]">{k.participantId}</Badge>}
                          <Badge variant={k.status === "approved" ? "default" : k.status === "rejected" ? "destructive" : "secondary"} className="text-[9px] capitalize">{k.status}</Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Reg #{k.registrationNumber} · {k.countryOfIncorporation} · {new Date(k.createdAt).toLocaleDateString()}</p>
                      </div>
                      <Button asChild size="sm" variant="outline" className="h-7 text-[10px] rounded-none flex-shrink-0">
                        <a
                          href={`/kyc-admin?kycId=${k.id}`}
                          onClick={(ev) => { if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return; ev.preventDefault(); onNavigate(`/kyc-admin?kycId=${k.id}`); }}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" /> Open
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-border rounded-none">
              <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider">Trade Enquiries</p>
                <Badge variant="outline" className="text-[10px]">{submissions?.enquiries?.length ?? 0}</Badge>
              </div>
              {(submissions?.enquiries ?? []).length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">No enquiries submitted.</div>
              ) : (
                <div className="divide-y divide-border">
                  {submissions!.enquiries.map(e => (
                    <div key={e.id} className="p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-semibold">{e.enquiryRef}</span>
                          {e.side && <Badge variant="outline" className="text-[9px] uppercase">{e.side}</Badge>}
                          <Badge variant={e.status === "accepted" || e.status === "quoted" ? "default" : e.status === "closed" ? "outline" : "secondary"} className="text-[9px] capitalize">{e.status?.replace("_", " ")}</Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{e.product} · {e.quantity || "—"} {e.unit || ""} · {new Date(e.createdAt).toLocaleDateString()}</p>
                      </div>
                      <Button asChild size="sm" variant="outline" className="h-7 text-[10px] rounded-none flex-shrink-0">
                        <a
                          href={`/trade-enquiries?enquiryId=${e.id}`}
                          onClick={(ev) => { if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return; ev.preventDefault(); onNavigate(`/trade-enquiries?enquiryId=${e.id}`); }}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" /> Open
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-border rounded-none">
              <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider">Potential Clients</p>
                <Badge variant="outline" className="text-[10px]">{submissions?.potentialClients?.length ?? 0}</Badge>
              </div>
              {(submissions?.potentialClients ?? []).length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">No prospects tracked.</div>
              ) : (
                <div className="divide-y divide-border">
                  {submissions!.potentialClients.map(c => (
                    <div key={c.id} className="p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold truncate">{c.companyName}</span>
                        <Badge variant="outline" className="text-[9px] capitalize">{c.status}</Badge>
                        {c.source && <span className="text-[9px] text-muted-foreground">via {c.source}</span>}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{[c.contactPerson, c.email, c.phone].filter(Boolean).join(" · ") || "No contact details"}</p>
                      {c.products && c.products.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.products.slice(0, 4).map(p => <Badge key={p} variant="secondary" className="text-[9px]">{p}</Badge>)}
                          {c.products.length > 4 && <span className="text-[9px] text-muted-foreground">+{c.products.length - 4} more</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </LockedSection>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function TeamMembersPage() {
  const { role } = useAuth();
  const { requestUnlock } = useAmendMode();
  const [amendMember, setAmendMember] = useState<TeamMember | null>(null);
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
  const [profileModules, setProfileModules] = useState<string[]>([]);

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

  const { data: submissions, isLoading: submissionsLoading, isError: submissionsError, error: submissionsErrorObj, refetch: refetchSubmissions } = useQuery<MemberSubmissions>({
    queryKey: ["/api/team/members", selectedId, "submissions"],
    queryFn: async () => {
      if (!selectedId) return { kycs: [], enquiries: [], potentialClients: [] };
      const r = await fetch(`/api/team/members/${selectedId}/submissions`, { credentials: "include" });
      if (!r.ok) throw new Error(`Failed to load submissions (${r.status})`);
      return r.json() as Promise<MemberSubmissions>;
    },
    enabled: !!selectedId,
  });

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
      fetch("/api/team-kyc", { credentials: "include", cache: "no-store" })
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : []),
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

  const sendResetMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/team/members/${id}/send-reset-link`, { method: "POST", credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Failed to send reset link");
      return j as { emailSent: boolean; emailError?: string; recipient: string; expiresAt: string };
    },
    onSuccess: (data) => {
      if (data.emailSent) {
        toast({ title: "Reset Link Sent", description: `Secure password reset link emailed to ${data.recipient}.` });
      } else {
        toast({
          title: "Reset Link Created — Email Failed",
          description: data.emailError || "The link was generated but the email could not be delivered.",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => toast({ title: "Could Not Send Reset Link", description: err.message, variant: "destructive" }),
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
    setProfileModules(m.allowedModules ?? []);
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
                  <h1 className="text-sm font-bold tracking-tight" data-testid="text-team-page-title">Team</h1>
                  <p className="text-[10px] text-muted-foreground">Team members &amp; KYC applications</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-none text-xs font-bold uppercase tracking-wider h-8"
                  onClick={() => { setShowInvite(true); setInviteLink(null); }}
                  data-testid="button-invite-team-member"
                >
                  <Mail className="w-3.5 h-3.5 mr-1" /> Invite
                </Button>
                <Button size="sm" className="rounded-none text-xs font-bold uppercase tracking-wider h-8" onClick={openAdd} data-testid="button-add-team-member">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {pendingCount > 0 && (
                <div className="mb-3 border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 rounded-md overflow-hidden" data-testid="section-pending-team-kyc">
                  <button
                    type="button"
                    onClick={() => setView("kyc")}
                    className="w-full px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 transition-colors flex items-center justify-between text-left"
                    data-testid="btn-pending-section-header"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                        Pending Applications
                      </p>
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400">({pendingCount})</span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                  </button>
                  <div className="divide-y divide-amber-500/20">
                    {kycApps.filter(a => a.status === "pending").slice(0, 5).map(app => (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => { setView("kyc"); setKycFilter("pending"); setSelectedKycId(app.id); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-amber-500/10 transition-colors"
                        data-testid={`row-pending-kyc-${app.id}`}
                      >
                        <div className="w-7 h-7 rounded-full overflow-hidden bg-amber-500/20 flex items-center justify-center flex-shrink-0 border border-amber-500/30">
                          {app.photoStoredName ? (
                            <img src={`/api/team-kyc/${app.id}/photo`} alt={app.fullName} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400">
                              {app.fullName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate">{app.fullName}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{app.positionApplied || app.department || app.email}</p>
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500 text-white flex-shrink-0">
                          Review
                        </span>
                      </button>
                    ))}
                    {pendingCount > 5 && (
                      <button
                        type="button"
                        onClick={() => { setView("kyc"); setKycFilter("pending"); }}
                        className="w-full px-3 py-2 text-[10px] text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 transition-colors font-semibold"
                        data-testid="btn-pending-view-all"
                      >
                        + {pendingCount - 5} more pending — View all
                      </button>
                    )}
                  </div>
                </div>
              )}
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
                      <div
                        className="absolute -bottom-1 -right-1 w-5 h-5 bg-muted border border-border rounded-full flex items-center justify-center shadow-sm"
                        title="Profile photo is locked"
                      >
                        <Lock className="w-2.5 h-2.5 text-muted-foreground" />
                      </div>
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
                      <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider border-green-600 text-green-700 dark:text-green-400 gap-1">
                        <Lock className="w-2.5 h-2.5" /> Locked Profile
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-none text-xs h-8 gap-1"
                        onClick={() => requestUnlock(() => setAmendMember(selected))}
                        data-testid={`button-amend-member-${selectedId}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Amend (Admin)
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

              {/* Tabs (only when creating a new member) */}
              {panel === "add" && (
                <div className="border-b border-border flex overflow-x-auto flex-shrink-0 bg-muted/20">
                  {MEMBER_TABS.filter(t => t.key === "credentials").map(t => {
                    const Icon = t.icon;
                    return (
                      <div
                        key={t.key}
                        className="flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-primary text-primary bg-background flex-shrink-0"
                        data-testid={`tab-member-${t.key}`}
                      >
                        <Icon className="w-3 h-3" />
                        {t.label}
                      </div>
                    );
                  })}
                </div>
              )}

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
                ) : selected ? (
                  <LockedMemberView
                    member={selected}
                    profileModules={profileModules}
                    docs={selectedDocs}
                    submissions={submissions}
                    submissionsLoading={submissionsLoading}
                    submissionsError={submissionsError}
                    submissionsErrorObj={submissionsErrorObj as Error | null}
                    refetchSubmissions={refetchSubmissions}
                    onSendReset={() => selectedId && sendResetMutation.mutate(selectedId)}
                    sendingReset={sendResetMutation.isPending}
                    onNavigate={setLocation}
                  />
                ) : null}
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

      {amendMember && (
        <AmendDialog
          open={!!amendMember}
          onOpenChange={(o) => { if (!o) setAmendMember(null); }}
          title={`Amend Team Member — ${amendMember.name}`}
          description="Edit approved team member fields. Password cannot be changed here — use the password reset link instead."
          endpoint={`/api/team/members/${amendMember.id}/amend`}
          invalidateKeys={["/api/team/members", ["/api/team/members", amendMember.id]]}
          initialValues={{
            name: amendMember.name ?? "",
            username: amendMember.username ?? "",
            email: amendMember.email ?? "",
            phone: amendMember.phone ?? "",
            department: amendMember.department ?? "",
            position: amendMember.position ?? "",
            employmentType: amendMember.employmentType ?? "",
            startDate: amendMember.startDate ?? "",
            dateOfBirth: amendMember.dateOfBirth ?? "",
            gender: amendMember.gender ?? "",
            nationality: amendMember.nationality ?? "",
            passportNumber: amendMember.passportNumber ?? "",
            maritalStatus: amendMember.maritalStatus ?? "",
            homeAddress: amendMember.homeAddress ?? "",
            city: amendMember.city ?? "",
            country: amendMember.country ?? "",
            additionalNotes: amendMember.additionalNotes ?? "",
          }}
          sections={TEAM_AMEND_SECTIONS}
        />
      )}
    </div>
  );
}

const TEAM_AMEND_SECTIONS: AmendSection[] = [
  {
    title: "Login & Account",
    fields: [
      { key: "name", label: "Full Name" },
      { key: "username", label: "Username" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "tel" },
    ],
  },
  {
    title: "Personal",
    fields: [
      { key: "dateOfBirth", label: "Date of Birth" },
      { key: "gender", label: "Gender" },
      { key: "nationality", label: "Nationality" },
      { key: "passportNumber", label: "Passport / National ID" },
      { key: "maritalStatus", label: "Marital Status" },
    ],
  },
  {
    title: "Address",
    fields: [
      { key: "homeAddress", label: "Home Address", colSpan: 2 },
      { key: "city", label: "City" },
      { key: "country", label: "Country" },
    ],
  },
  {
    title: "Employment",
    fields: [
      { key: "position", label: "Position / Role" },
      { key: "department", label: "Department" },
      { key: "employmentType", label: "Employment Type" },
      { key: "startDate", label: "Start Date" },
      { key: "additionalNotes", label: "Additional Notes", type: "textarea" },
    ],
  },
];
