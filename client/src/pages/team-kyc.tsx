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
];

const empty = {
  fullName: "", dateOfBirth: "", gender: "", nationality: "", passportNumber: "",
  maritalStatus: "", email: "", phone: "", homeAddress: "", city: "", country: "",
  positionApplied: "", department: "", employmentType: "", expectedStartDate: "",
  highestQualification: "", institution: "", graduationYear: "", previousEmployer: "",
  previousRole: "", yearsExperience: "", emergencyName: "", emergencyRelationship: "",
  emergencyPhone: "", bankName: "", bankBranch: "", payrollAccountName: "",
  payrollAccountNumber: "", payrollSwift: "", additionalNotes: "",
};

export default function TeamKYC() {
  const { toast } = useToast();
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState({ ...empty });
  const [submitted, setSubmitted] = useState(false);

  const up = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }));
  const lbl = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
  const inp = "bg-background border-border";
  const ta  = "bg-background border-border resize-none min-h-[80px]";

  const submitMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/team-kyc", data),
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
    submitMutation.mutate(form);
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
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">Team KYC</p>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">Application Submitted</h2>
            <p className="text-sm text-muted-foreground">
              Your employment data has been received. An administrator will review your application and provide login credentials once approved.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-background px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">BULLEX</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">Team KYC — Staff Onboarding</p>
          </div>
        </div>
      </header>

      <main className="flex-1 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-primary mb-1">Staff Employment Form</h2>
            <p className="text-sm text-muted-foreground">Complete all sections. Your login credentials will be created by the admin upon approval.</p>
          </div>

          <div className="flex overflow-x-auto gap-1 mb-6 pb-1">
            {sections.map((s, i) => {
              const Icon = s.icon;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTab(i)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md text-[0.65rem] font-bold uppercase tracking-wider transition-colors ${
                    tab === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`tab-team-kyc-${i}`}
                >
                  <Icon className="w-3 h-3" />
                  {i + 1}. {s.label}
                </button>
              );
            })}
          </div>

          <Card className="p-6 md:p-8">
            <form onSubmit={handleSubmit}>

              {tab === 0 && (
                <div className="space-y-6" data-testid="team-kyc-section-0">
                  <h3 className="text-sm font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <User className="w-4 h-4" /> 1. Personal Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label className={lbl}>Full Legal Name *</Label>
                      <Input className={inp} placeholder="As on passport/ID" value={form.fullName} onChange={e => up("fullName", e.target.value)} data-testid="input-team-full-name" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Date of Birth</Label>
                      <Input className={inp} placeholder="DD/MM/YYYY" value={form.dateOfBirth} onChange={e => up("dateOfBirth", e.target.value)} data-testid="input-team-dob" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Gender</Label>
                      <Select value={form.gender} onValueChange={v => up("gender", v)}>
                        <SelectTrigger className={inp} data-testid="select-team-gender"><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Nationality</Label>
                      <Input className={inp} placeholder="e.g. Guinean" value={form.nationality} onChange={e => up("nationality", e.target.value)} data-testid="input-team-nationality" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Passport / National ID No.</Label>
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

              {tab === 1 && (
                <div className="space-y-6" data-testid="team-kyc-section-1">
                  <h3 className="text-sm font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <Phone className="w-4 h-4" /> 2. Contact Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className={lbl}>Email Address *</Label>
                      <Input type="email" className={inp} placeholder="personal@email.com" value={form.email} onChange={e => up("email", e.target.value)} data-testid="input-team-email" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Phone Number</Label>
                      <Input className={inp} placeholder="+XXX XX XXX XXXX" value={form.phone} onChange={e => up("phone", e.target.value)} data-testid="input-team-phone" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className={lbl}>Home Address</Label>
                      <Textarea className={ta} placeholder="Full home address" value={form.homeAddress} onChange={e => up("homeAddress", e.target.value)} data-testid="input-team-address" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>City</Label>
                      <Input className={inp} placeholder="City" value={form.city} onChange={e => up("city", e.target.value)} data-testid="input-team-city" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Country</Label>
                      <Input className={inp} placeholder="Country of residence" value={form.country} onChange={e => up("country", e.target.value)} data-testid="input-team-country" />
                    </div>
                  </div>
                </div>
              )}

              {tab === 2 && (
                <div className="space-y-6" data-testid="team-kyc-section-2">
                  <h3 className="text-sm font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <Briefcase className="w-4 h-4" /> 3. Employment Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className={lbl}>Position Applied / Role</Label>
                      <Input className={inp} placeholder="e.g. Trade Operations Analyst" value={form.positionApplied} onChange={e => up("positionApplied", e.target.value)} data-testid="input-team-position" />
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
                      <Input className={inp} placeholder="DD/MM/YYYY" value={form.expectedStartDate} onChange={e => up("expectedStartDate", e.target.value)} data-testid="input-team-start-date" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className={lbl}>Additional Notes</Label>
                      <Textarea className={ta} placeholder="Any other relevant information..." value={form.additionalNotes} onChange={e => up("additionalNotes", e.target.value)} data-testid="input-team-notes" />
                    </div>
                  </div>
                </div>
              )}

              {tab === 3 && (
                <div className="space-y-6" data-testid="team-kyc-section-3">
                  <h3 className="text-sm font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <GraduationCap className="w-4 h-4" /> 4. Education & Experience
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className={lbl}>Highest Qualification</Label>
                      <Select value={form.highestQualification} onValueChange={v => up("highestQualification", v)}>
                        <SelectTrigger className={inp} data-testid="select-team-qualification"><SelectValue placeholder="Select..." /></SelectTrigger>
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
                    <div className="space-y-2">
                      <Label className={lbl}>Graduation Year</Label>
                      <Input className={inp} placeholder="e.g. 2018" value={form.graduationYear} onChange={e => up("graduationYear", e.target.value)} data-testid="input-team-grad-year" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className={lbl}>Institution / University</Label>
                      <Input className={inp} placeholder="Name of institution" value={form.institution} onChange={e => up("institution", e.target.value)} data-testid="input-team-institution" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Previous Employer</Label>
                      <Input className={inp} placeholder="Most recent employer" value={form.previousEmployer} onChange={e => up("previousEmployer", e.target.value)} data-testid="input-team-prev-employer" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Previous Role / Title</Label>
                      <Input className={inp} placeholder="Job title held" value={form.previousRole} onChange={e => up("previousRole", e.target.value)} data-testid="input-team-prev-role" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Total Years of Experience</Label>
                      <Input className={inp} placeholder="e.g. 5" value={form.yearsExperience} onChange={e => up("yearsExperience", e.target.value)} data-testid="input-team-experience" />
                    </div>
                  </div>
                </div>
              )}

              {tab === 4 && (
                <div className="space-y-6" data-testid="team-kyc-section-4">
                  <h3 className="text-sm font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <Heart className="w-4 h-4" /> 5. Emergency Contact
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label className={lbl}>Full Name</Label>
                      <Input className={inp} placeholder="Emergency contact's full name" value={form.emergencyName} onChange={e => up("emergencyName", e.target.value)} data-testid="input-team-emergency-name" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Relationship</Label>
                      <Input className={inp} placeholder="e.g. Spouse, Parent, Sibling" value={form.emergencyRelationship} onChange={e => up("emergencyRelationship", e.target.value)} data-testid="input-team-emergency-relation" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Phone Number</Label>
                      <Input className={inp} placeholder="+XXX XX XXX XXXX" value={form.emergencyPhone} onChange={e => up("emergencyPhone", e.target.value)} data-testid="input-team-emergency-phone" />
                    </div>
                  </div>
                </div>
              )}

              {tab === 5 && (
                <div className="space-y-6" data-testid="team-kyc-section-5">
                  <h3 className="text-sm font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <Landmark className="w-4 h-4" /> 6. Bank / Payroll Details
                  </h3>
                  <p className="text-xs text-muted-foreground">This information is used for salary payment purposes only.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label className={lbl}>Bank Name</Label>
                      <Input className={inp} placeholder="Full name of bank" value={form.bankName} onChange={e => up("bankName", e.target.value)} data-testid="input-team-bank-name" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Branch</Label>
                      <Input className={inp} placeholder="Branch name" value={form.bankBranch} onChange={e => up("bankBranch", e.target.value)} data-testid="input-team-bank-branch" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>SWIFT / BIC Code</Label>
                      <Input className={inp} placeholder="SWIFT code" value={form.payrollSwift} onChange={e => up("payrollSwift", e.target.value)} data-testid="input-team-swift" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Account Name</Label>
                      <Input className={inp} placeholder="Name on account" value={form.payrollAccountName} onChange={e => up("payrollAccountName", e.target.value)} data-testid="input-team-account-name" />
                    </div>
                    <div className="space-y-2">
                      <Label className={lbl}>Account Number / IBAN</Label>
                      <Input className={inp} placeholder="Account number or IBAN" value={form.payrollAccountNumber} onChange={e => up("payrollAccountNumber", e.target.value)} data-testid="input-team-account-number" />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
                <Button type="button" variant="outline" disabled={tab === 0} onClick={() => setTab(t => t - 1)} data-testid="btn-team-kyc-prev">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                </Button>
                {tab < sections.length - 1 ? (
                  <Button type="button" onClick={() => setTab(t => t + 1)} data-testid="btn-team-kyc-next">
                    Next <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={submitMutation.isPending} data-testid="btn-team-kyc-submit">
                    {submitMutation.isPending ? "Submitting..." : "Submit Application"}
                  </Button>
                )}
              </div>
            </form>
          </Card>
        </div>
      </main>

      <footer className="border-t border-border bg-muted/30 px-4 py-2 text-center">
        <p className="text-[10px] text-muted-foreground">Bullex is a proprietary platform of Bullfrog Group.</p>
      </footer>
    </div>
  );
}
