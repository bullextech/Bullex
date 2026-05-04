import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
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
  ChevronRight, Camera, Edit2, Save, FilePlus,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

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

const DOC_TYPES = [
  { value: "cv", label: "CV / Résumé" },
  { value: "national_id", label: "National ID" },
  { value: "passport", label: "Passport Copy" },
  { value: "certificate", label: "Certificate / Diploma" },
  { value: "bank_statement", label: "Bank Statement" },
  { value: "other", label: "Other Document" },
];

const TABS = [
  { key: "credentials", label: "Login", icon: Lock },
  { key: "personal", label: "Personal", icon: User },
  { key: "contact", label: "Contact", icon: Phone },
  { key: "employment", label: "Employment", icon: Briefcase },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "emergency", label: "Emergency", icon: Heart },
  { key: "bank", label: "Bank", icon: Landmark },
  { key: "documents", label: "Documents", icon: FileText },
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

export default function TeamMembersPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

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

  const up = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }));
  const lbl = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";
  const inp = "rounded-none h-9 text-sm bg-background border-border";
  const ta = "rounded-none text-sm bg-background border-border resize-none min-h-[72px]";

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
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

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main list */}
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
          {isLoading ? (
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
          {/* Panel header */}
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
            {TABS.map(t => {
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
              /* Edit mode — all tabs */
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
                    {/* Upload area */}
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
                        <input ref={docInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" className="hidden" onChange={handleDocUpload} />
                      </div>
                      <p className="text-[10px] text-muted-foreground">PDF, JPG, PNG, DOC, XLSX — max 10 MB</p>
                    </div>

                    {/* Document list */}
                    {selectedDocs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center border border-border">
                        <FilePlus className="w-8 h-8 text-muted-foreground/20 mb-2" />
                        <p className="text-xs text-muted-foreground">No documents uploaded yet</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {selectedDocs.map(doc => {
                          const dt = DOC_TYPES.find(d => d.value === doc.docType);
                          return (
                            <div key={doc.id} className="flex items-center gap-3 p-3 border border-border hover:bg-muted/20 transition-colors" data-testid={`doc-row-${doc.id}`}>
                              <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{doc.originalName}</p>
                                <p className="text-[10px] text-muted-foreground">{dt?.label || doc.docType} · {fmtSize(doc.size)} · {new Date(doc.uploadedAt).toLocaleDateString("en-GB")}</p>
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
  );
}
