import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  User,
  Phone,
  Briefcase,
  GraduationCap,
  Heart,
  Landmark,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Shield,
  PenTool,
  AlertCircle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const sections = [
  { label: "Personal Details", icon: User },
  { label: "Contact Information", icon: Phone },
  { label: "Employment Details", icon: Briefcase },
  { label: "Education & Experience", icon: GraduationCap },
  { label: "Emergency Contact", icon: Heart },
  { label: "Bank / Payroll", icon: Landmark },
  { label: "Statutory Declaration", icon: PenTool },
];

const empty = {
  fullName: "", dateOfBirth: "", gender: "", nationality: "", passportNumber: "",
  maritalStatus: "", email: "", phone: "", homeAddress: "", city: "", country: "",
  positionApplied: "", department: "", employmentType: "", expectedStartDate: "",
  highestQualification: "", institution: "", graduationYear: "", previousEmployer: "",
  previousRole: "", yearsExperience: "", emergencyName: "", emergencyRelationship: "",
  emergencyPhone: "", bankName: "", bankBranch: "", payrollAccountName: "",
  payrollAccountNumber: "", payrollSwift: "", additionalNotes: "",
  declarationName: "", declarationDate: "",
};

export default function TeamKYC() {
  const { toast } = useToast();
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState({ ...empty });
  const [declarationAgreed, setDeclarationAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const up = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }));
  const lbl = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
  const inp = "bg-background border-border";
  const ta = "bg-background border-border resize-none min-h-[80px]";

  const submitMutation = useMutation({
    mutationFn: (data: typeof form & { declarationAgreed: boolean }) =>
      apiRequest("POST", "/api/team-kyc", data),
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err: any) => {
      toast({ title: "Submission Failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName || !form.email) {
      toast({ title: "Required Fields", description: "Full name and email are required.", variant: "destructive" });
      return;
    }
    if (!declarationAgreed) {
      toast({ title: "Statutory Declaration Required", description: "You must agree to the statutory declaration before submitting.", variant: "destructive" });
      return;
    }
    if (!form.declarationName.trim()) {
      toast({ title: "Signature Required", description: "Please print your full name to sign the declaration.", variant: "destructive" });
      return;
    }
    submitMutation.mutate({ ...form, declarationAgreed });
  };

  const goNext = () => {
    if (tab === 0 && !form.fullName) {
      toast({ title: "Required", description: "Please enter your full legal name.", variant: "destructive" });
      return;
    }
    if (tab === 1 && !form.email) {
      toast({ title: "Required", description: "Please enter your email address.", variant: "destructive" });
      return;
    }
    setTab(t => t + 1);
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="border-b border-border bg-background px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">BULLEX</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">Bullfrog Group — Staff Onboarding</p>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Application Submitted</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Your employment onboarding application and statutory declaration have been securely received. The HR/Admin team will review your details and you will be notified by email once a decision has been made.
            </p>
            <div className="bg-muted/40 border border-border rounded-lg p-4 text-left">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">What happens next?</p>
              <ul className="text-xs text-muted-foreground space-y-1 mt-2">
                <li>• Admin reviews your application</li>
                <li>• Upon approval, your login credentials will be sent to you</li>
                <li>• You will then be able to access the Bullex platform</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground mt-4">Questions? Email <a href="mailto:career@bullex.tech" className="text-primary underline">career@bullex.tech</a></p>
          </div>
        </main>
        <footer className="border-t border-border bg-muted/30 px-4 py-2 text-center">
          <p className="text-[10px] text-muted-foreground">Bullex is a proprietary platform of Bullfrog Group. All information is handled in strict confidence.</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">BULLEX</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">Bullfrog Group — Staff Onboarding KYC</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="w-3.5 h-3.5" />
          <span>Secure & Confidential</span>
        </div>
      </header>

      <main className="flex-1 py-8 px-4">
        <div className="max-w-3xl mx-auto">

          {/* Title */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-primary mb-1">Staff Employment KYC Form</h2>
            <p className="text-sm text-muted-foreground">
              Complete all sections accurately. Fields marked <span className="text-destructive font-bold">*</span> are mandatory. Your login credentials will be allocated by admin upon approval.
            </p>
          </div>

          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Section {tab + 1} of {sections.length}</span>
              <span className="text-xs font-semibold text-primary">{Math.round(((tab + 1) / sections.length) * 100)}% complete</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${((tab + 1) / sections.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Section tabs */}
          <div className="flex overflow-x-auto gap-0.5 mb-6 pb-1 border-b border-border">
            {sections.map((s, i) => {
              const Icon = s.icon;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTab(i)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-[0.62rem] font-bold uppercase tracking-wider border-b-2 transition-colors ${
                    tab === i
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`tab-team-kyc-${i}`}
                >
                  <Icon className="w-3 h-3 flex-shrink-0" />
                  <span className="hidden sm:inline">{i + 1}. {s.label}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </button>
              );
            })}
          </div>

          <Card className="p-6 md:p-8">
            <form onSubmit={handleSubmit}>

              {/* ── Section 1: Personal Details ── */}
              {tab === 0 && (
                <div className="space-y-6" data-testid="team-kyc-section-0">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <User className="w-5 h-5" /> 1. Personal Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2 md:col-span-2">
                      <Label className={lbl}>Full Legal Name <span className="text-destructive">*</span></Label>
                      <Input className={inp} placeholder="As it appears on your passport or national ID" value={form.fullName} onChange={e => up("fullName", e.target.value)} data-testid="input-team-full-name" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Date of Birth (DD/MM/YYYY)</Label>
                      <Input className={inp} placeholder="e.g. 15/03/1990" value={form.dateOfBirth} onChange={e => up("dateOfBirth", e.target.value)} data-testid="input-team-dob" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Gender</Label>
                      <Select value={form.gender} onValueChange={v => up("gender", v)}>
                        <SelectTrigger className={inp} data-testid="select-team-gender"><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                          <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Nationality</Label>
                      <Input className={inp} placeholder="e.g. Guinean, Nigerian, British" value={form.nationality} onChange={e => up("nationality", e.target.value)} data-testid="input-team-nationality" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Passport / National ID Number</Label>
                      <Input className={inp} placeholder="Document number" value={form.passportNumber} onChange={e => up("passportNumber", e.target.value)} data-testid="input-team-passport" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Marital Status</Label>
                      <Select value={form.maritalStatus} onValueChange={v => up("maritalStatus", v)}>
                        <SelectTrigger className={inp} data-testid="select-team-marital"><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Single">Single</SelectItem>
                          <SelectItem value="Married">Married</SelectItem>
                          <SelectItem value="Divorced">Divorced</SelectItem>
                          <SelectItem value="Widowed">Widowed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Section 2: Contact Information ── */}
              {tab === 1 && (
                <div className="space-y-6" data-testid="team-kyc-section-1">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <Phone className="w-5 h-5" /> 2. Contact Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label className={lbl}>Email Address <span className="text-destructive">*</span></Label>
                      <Input type="email" className={inp} placeholder="your.email@example.com" value={form.email} onChange={e => up("email", e.target.value)} data-testid="input-team-email" />
                      <p className="text-[10px] text-muted-foreground">Login credentials will be sent to this address upon approval.</p>
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Phone Number</Label>
                      <Input className={inp} placeholder="+XXX XX XXX XXXX" value={form.phone} onChange={e => up("phone", e.target.value)} data-testid="input-team-phone" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className={lbl}>Home / Residential Address</Label>
                      <Textarea className={ta} placeholder="Full home address including street, suburb, and postal code" value={form.homeAddress} onChange={e => up("homeAddress", e.target.value)} data-testid="input-team-address" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>City</Label>
                      <Input className={inp} placeholder="City of residence" value={form.city} onChange={e => up("city", e.target.value)} data-testid="input-team-city" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Country</Label>
                      <Input className={inp} placeholder="Country of residence" value={form.country} onChange={e => up("country", e.target.value)} data-testid="input-team-country" />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Section 3: Employment Details ── */}
              {tab === 2 && (
                <div className="space-y-6" data-testid="team-kyc-section-2">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <Briefcase className="w-5 h-5" /> 3. Employment Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2 md:col-span-2">
                      <Label className={lbl}>Position Applied / Role Title</Label>
                      <Input className={inp} placeholder="e.g. Trade Operations Analyst, Compliance Officer" value={form.positionApplied} onChange={e => up("positionApplied", e.target.value)} data-testid="input-team-position" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Department</Label>
                      <Select value={form.department} onValueChange={v => up("department", v)}>
                        <SelectTrigger className={inp} data-testid="select-team-department"><SelectValue placeholder="Select department..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Trading">Trading</SelectItem>
                          <SelectItem value="Operations">Operations</SelectItem>
                          <SelectItem value="Finance">Finance</SelectItem>
                          <SelectItem value="Compliance">Compliance</SelectItem>
                          <SelectItem value="Legal">Legal</SelectItem>
                          <SelectItem value="Logistics">Logistics</SelectItem>
                          <SelectItem value="IT">IT</SelectItem>
                          <SelectItem value="HR">HR</SelectItem>
                          <SelectItem value="Management">Management</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Employment Type</Label>
                      <Select value={form.employmentType} onValueChange={v => up("employmentType", v)}>
                        <SelectTrigger className={inp} data-testid="select-team-employment-type"><SelectValue placeholder="Select type..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Full-Time">Full-Time</SelectItem>
                          <SelectItem value="Part-Time">Part-Time</SelectItem>
                          <SelectItem value="Contract">Contract</SelectItem>
                          <SelectItem value="Consultant">Consultant</SelectItem>
                          <SelectItem value="Intern">Intern</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Expected Start Date</Label>
                      <Input className={inp} placeholder="DD/MM/YYYY or ASAP" value={form.expectedStartDate} onChange={e => up("expectedStartDate", e.target.value)} data-testid="input-team-start-date" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className={lbl}>Additional Notes</Label>
                      <Textarea className={ta} placeholder="Any other relevant information you wish to share..." value={form.additionalNotes} onChange={e => up("additionalNotes", e.target.value)} data-testid="input-team-notes" />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Section 4: Education & Experience ── */}
              {tab === 3 && (
                <div className="space-y-6" data-testid="team-kyc-section-3">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <GraduationCap className="w-5 h-5" /> 4. Education & Experience
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label className={lbl}>Highest Qualification</Label>
                      <Select value={form.highestQualification} onValueChange={v => up("highestQualification", v)}>
                        <SelectTrigger className={inp} data-testid="select-team-qualification"><SelectValue placeholder="Select qualification..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="High School / GCSE">High School / GCSE</SelectItem>
                          <SelectItem value="Diploma">Diploma</SelectItem>
                          <SelectItem value="Bachelor's Degree">Bachelor's Degree</SelectItem>
                          <SelectItem value="Master's Degree">Master's Degree</SelectItem>
                          <SelectItem value="PhD / Doctorate">PhD / Doctorate</SelectItem>
                          <SelectItem value="Professional Certification">Professional Certification</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Graduation Year</Label>
                      <Input className={inp} placeholder="e.g. 2018" value={form.graduationYear} onChange={e => up("graduationYear", e.target.value)} data-testid="input-team-grad-year" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className={lbl}>Institution / University</Label>
                      <Input className={inp} placeholder="Name of school or university" value={form.institution} onChange={e => up("institution", e.target.value)} data-testid="input-team-institution" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Previous Employer</Label>
                      <Input className={inp} placeholder="Most recent employer" value={form.previousEmployer} onChange={e => up("previousEmployer", e.target.value)} data-testid="input-team-prev-employer" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Previous Role / Job Title</Label>
                      <Input className={inp} placeholder="Job title held" value={form.previousRole} onChange={e => up("previousRole", e.target.value)} data-testid="input-team-prev-role" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Total Years of Experience</Label>
                      <Select value={form.yearsExperience} onValueChange={v => up("yearsExperience", v)}>
                        <SelectTrigger className={inp} data-testid="select-team-experience"><SelectValue placeholder="Select range..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Less than 1 year">Less than 1 year</SelectItem>
                          <SelectItem value="1–2 years">1–2 years</SelectItem>
                          <SelectItem value="3–5 years">3–5 years</SelectItem>
                          <SelectItem value="5–10 years">5–10 years</SelectItem>
                          <SelectItem value="10+ years">10+ years</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Section 5: Emergency Contact ── */}
              {tab === 4 && (
                <div className="space-y-6" data-testid="team-kyc-section-4">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <Heart className="w-5 h-5" /> 5. Emergency Contact
                  </h3>
                  <p className="text-xs text-muted-foreground">Please provide details of a person who can be contacted in the event of an emergency.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2 md:col-span-2">
                      <Label className={lbl}>Full Name</Label>
                      <Input className={inp} placeholder="Emergency contact's full name" value={form.emergencyName} onChange={e => up("emergencyName", e.target.value)} data-testid="input-team-emergency-name" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Relationship</Label>
                      <Select value={form.emergencyRelationship} onValueChange={v => up("emergencyRelationship", v)}>
                        <SelectTrigger className={inp} data-testid="select-team-emergency-relation"><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Spouse / Partner">Spouse / Partner</SelectItem>
                          <SelectItem value="Parent">Parent</SelectItem>
                          <SelectItem value="Sibling">Sibling</SelectItem>
                          <SelectItem value="Child">Child</SelectItem>
                          <SelectItem value="Friend">Friend</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Phone Number</Label>
                      <Input className={inp} placeholder="+XXX XX XXX XXXX" value={form.emergencyPhone} onChange={e => up("emergencyPhone", e.target.value)} data-testid="input-team-emergency-phone" />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Section 6: Bank / Payroll ── */}
              {tab === 5 && (
                <div className="space-y-6" data-testid="team-kyc-section-5">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <Landmark className="w-5 h-5" /> 6. Bank / Payroll Details
                  </h3>
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">This information is used strictly for payroll and salary payment purposes. It is held securely and treated as confidential.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2 md:col-span-2">
                      <Label className={lbl}>Bank Name</Label>
                      <Input className={inp} placeholder="Full name of your bank" value={form.bankName} onChange={e => up("bankName", e.target.value)} data-testid="input-team-bank-name" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Branch / Location</Label>
                      <Input className={inp} placeholder="Branch name or city" value={form.bankBranch} onChange={e => up("bankBranch", e.target.value)} data-testid="input-team-bank-branch" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>SWIFT / BIC Code</Label>
                      <Input className={inp} placeholder="e.g. AAABBBCCXXX" value={form.payrollSwift} onChange={e => up("payrollSwift", e.target.value)} data-testid="input-team-swift" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Account Name</Label>
                      <Input className={inp} placeholder="Name as it appears on account" value={form.payrollAccountName} onChange={e => up("payrollAccountName", e.target.value)} data-testid="input-team-account-name" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Account Number / IBAN</Label>
                      <Input className={inp} placeholder="Account number or full IBAN" value={form.payrollAccountNumber} onChange={e => up("payrollAccountNumber", e.target.value)} data-testid="input-team-account-number" />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Section 7: Statutory Declaration ── */}
              {tab === 6 && (
                <div className="space-y-6" data-testid="team-kyc-section-6">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <PenTool className="w-5 h-5" /> 7. Statutory Declaration
                  </h3>

                  <div className="bg-muted/30 border border-border rounded-lg p-5 space-y-3">
                    <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">Declaration of Truth & Accuracy</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      I, the undersigned, hereby solemnly and sincerely declare that:
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-2 ml-4">
                      <li className="flex items-start gap-2">
                        <span className="text-primary font-bold flex-shrink-0">1.</span>
                        All information provided in this employment onboarding form is true, accurate, and complete to the best of my knowledge and belief.
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary font-bold flex-shrink-0">2.</span>
                        I have not knowingly omitted any material information that could affect my application or employment at Bullfrog Group.
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary font-bold flex-shrink-0">3.</span>
                        I understand that providing false or misleading information may result in the immediate rejection of this application or termination of employment.
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary font-bold flex-shrink-0">4.</span>
                        I consent to Bullfrog Group processing my personal data for HR and operational purposes, in accordance with applicable data protection laws.
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary font-bold flex-shrink-0">5.</span>
                        I acknowledge that the bank and payroll details provided will be used solely for salary remittance.
                      </li>
                    </ul>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      I make this declaration conscientiously believing it to be true and correct, and by virtue of the provisions of applicable law.
                    </p>
                  </div>

                  {/* Checkbox */}
                  <div className="flex items-start gap-3 p-4 rounded-lg border-2 border-border hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => setDeclarationAgreed(v => !v)}
                    data-testid="checkbox-declaration-container"
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${declarationAgreed ? "bg-primary border-primary" : "border-muted-foreground"}`}
                      data-testid="checkbox-declaration"
                    >
                      {declarationAgreed && <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        I agree to the above Statutory Declaration <span className="text-destructive">*</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        By checking this box, I confirm that all information provided is true and accurate and I make this declaration in good faith.
                      </p>
                    </div>
                  </div>

                  {/* Signature fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label className={lbl}>Print Full Name (Signature) <span className="text-destructive">*</span></Label>
                      <Input
                        className={`${inp} font-serif italic text-base`}
                        placeholder="Type your full legal name as your signature"
                        value={form.declarationName}
                        onChange={e => up("declarationName", e.target.value)}
                        data-testid="input-declaration-name"
                      />
                      <p className="text-[10px] text-muted-foreground">Typing your full name constitutes your digital signature on this declaration.</p>
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Date</Label>
                      <Input
                        className={inp}
                        placeholder="DD/MM/YYYY"
                        value={form.declarationDate}
                        onChange={e => up("declarationDate", e.target.value)}
                        data-testid="input-declaration-date"
                      />
                    </div>
                  </div>

                  {!declarationAgreed && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                      <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                      <p className="text-xs text-destructive">You must agree to the statutory declaration above before you can submit this application.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between mt-8 pt-5 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  disabled={tab === 0}
                  onClick={() => setTab(t => t - 1)}
                  data-testid="btn-team-kyc-prev"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                </Button>
                <span className="text-xs text-muted-foreground hidden sm:block">
                  {tab + 1} / {sections.length} — {sections[tab].label}
                </span>
                {tab < sections.length - 1 ? (
                  <Button type="button" onClick={goNext} data-testid="btn-team-kyc-next">
                    Next <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={submitMutation.isPending || !declarationAgreed}
                    className="min-w-[160px]"
                    data-testid="btn-team-kyc-submit"
                  >
                    {submitMutation.isPending ? "Submitting..." : "Submit Application"}
                  </Button>
                )}
              </div>
            </form>
          </Card>
        </div>
      </main>

      <footer className="border-t border-border bg-muted/30 px-4 py-3 text-center">
        <p className="text-[10px] text-muted-foreground">Bullex is a proprietary platform of Bullfrog Group. All personal information is handled with strict confidentiality in accordance with applicable data protection laws.</p>
      </footer>
    </div>
  );
}
