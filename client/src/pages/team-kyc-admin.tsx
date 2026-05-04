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
} from "lucide-react";
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
  status: string;
  reviewNotes: string | null;
  teamUsername: string | null;
  createdAt: string;
}

export default function TeamKycAdmin() {
  const { authenticated, role } = useAuth();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: apps = [], isLoading } = useQuery<TeamKycApp[]>({
    queryKey: ["/api/team-kyc"],
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

  if (!authenticated) return <Login />;

  const statusBadge = (s: string) => {
    if (s === "approved") return <Badge className="bg-green-600 text-white text-[10px]">Approved</Badge>;
    if (s === "rejected") return <Badge variant="destructive" className="text-[10px]">Rejected</Badge>;
    return <Badge variant="secondary" className="text-[10px]">Pending</Badge>;
  };

  const Row = ({ label, value }: { label: string; value: string | null | undefined }) =>
    value ? (
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <p className="text-sm mt-0.5">{value}</p>
      </div>
    ) : null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold" data-testid="text-team-kyc-admin-heading">Team KYC Applications</h2>
        <p className="text-sm text-muted-foreground mt-1">Review staff employment submissions and assign login credentials.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading applications...</div>
      ) : apps.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">No Team KYC applications yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {apps.map(app => (
            <Card key={app.id} className="overflow-hidden" data-testid={`team-kyc-card-${app.id}`}>
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpanded(expanded === app.id ? null : app.id)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{app.fullName}</p>
                    <p className="text-xs text-muted-foreground truncate">{app.email} {app.positionApplied ? `· ${app.positionApplied}` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  {statusBadge(app.status)}
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    {new Date(app.createdAt).toLocaleDateString()}
                  </span>
                  {expanded === app.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>

              {expanded === app.id && (
                <div className="border-t border-border p-4 space-y-6 bg-muted/10">

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 mb-3"><User className="w-3.5 h-3.5" /> Personal Details</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Row label="Full Name" value={app.fullName} />
                      <Row label="Date of Birth" value={app.dateOfBirth} />
                      <Row label="Gender" value={app.gender} />
                      <Row label="Nationality" value={app.nationality} />
                      <Row label="Passport / ID No." value={app.passportNumber} />
                      <Row label="Marital Status" value={app.maritalStatus} />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 mb-3"><Phone className="w-3.5 h-3.5" /> Contact</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Row label="Email" value={app.email} />
                      <Row label="Phone" value={app.phone} />
                      <Row label="City" value={app.city} />
                      <Row label="Country" value={app.country} />
                      <div className="col-span-2 md:col-span-4"><Row label="Home Address" value={app.homeAddress} /></div>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 mb-3"><Briefcase className="w-3.5 h-3.5" /> Employment</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Row label="Position Applied" value={app.positionApplied} />
                      <Row label="Department" value={app.department} />
                      <Row label="Employment Type" value={app.employmentType} />
                      <Row label="Expected Start Date" value={app.expectedStartDate} />
                      {app.additionalNotes && <div className="col-span-2 md:col-span-4"><Row label="Notes" value={app.additionalNotes} /></div>}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 mb-3"><GraduationCap className="w-3.5 h-3.5" /> Education & Experience</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Row label="Qualification" value={app.highestQualification} />
                      <Row label="Institution" value={app.institution} />
                      <Row label="Graduation Year" value={app.graduationYear} />
                      <Row label="Previous Employer" value={app.previousEmployer} />
                      <Row label="Previous Role" value={app.previousRole} />
                      <Row label="Years of Experience" value={app.yearsExperience} />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 mb-3"><Heart className="w-3.5 h-3.5" /> Emergency Contact</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Row label="Name" value={app.emergencyName} />
                      <Row label="Relationship" value={app.emergencyRelationship} />
                      <Row label="Phone" value={app.emergencyPhone} />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 mb-3"><Landmark className="w-3.5 h-3.5" /> Bank / Payroll</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Row label="Bank Name" value={app.bankName} />
                      <Row label="Branch" value={app.bankBranch} />
                      <Row label="Account Name" value={app.payrollAccountName} />
                      <Row label="Account Number / IBAN" value={app.payrollAccountNumber} />
                      <Row label="SWIFT / BIC" value={app.payrollSwift} />
                    </div>
                  </div>

                  <div className="border-t border-border pt-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-primary">Admin Review</p>
                    <Textarea
                      className="bg-background border-border resize-none min-h-[60px] text-sm"
                      placeholder="Review notes (optional)..."
                      value={notes[app.id] || ""}
                      onChange={e => setNotes({ ...notes, [app.id]: e.target.value })}
                      data-testid={`textarea-team-kyc-notes-${app.id}`}
                    />

                    {app.status !== "approved" && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-wider text-primary">Platform Login Credentials</p>
                        <p className="text-[10px] text-muted-foreground">Optional. If provided, the team member will receive login credentials to access the platform.</p>
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
                        {app.teamUsername && (
                          <p className="text-[10px] text-muted-foreground">Current username: <span className="font-mono font-bold">{app.teamUsername}</span></p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider"
                        disabled={reviewMutation.isPending}
                        onClick={() => reviewMutation.mutate({
                          id: app.id,
                          status: "approved",
                          reviewNotes: notes[app.id] || undefined,
                          teamUsername: usernames[app.id] || undefined,
                          teamPassword: passwords[app.id] || undefined,
                        })}
                        data-testid={`btn-team-kyc-approve-${app.id}`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Approve
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
                        <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject
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
