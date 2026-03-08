import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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
  UserCheck,
  Building2,
  CheckCircle2,
  Shield,
  Landmark,
  Users,
  BarChart3,
  FileCheck,
  Briefcase,
  Scale,
  FileText,
  PenTool,
  Upload,
  Loader2,
  Eye,
  Plus,
  Trash2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const sections = [
  "Company Details",
  "Business Activity",
  "Beneficial Owners",
  "Management Structure",
  "Financial Information",
  "Banking Information",
  "Human Resources",
  "Compliance Questionnaire",
  "Documents Required",
  "Authorised Signatory",
];

const sectionIcons = [
  Building2, Briefcase, Users, Users, BarChart3,
  Landmark, Users, Scale, FileText, PenTool,
];

const kycDocList = [
  { label: "Certificate of Incorporation", type: "certificate_of_incorporation" },
  { label: "Memorandum & Articles of Association", type: "memorandum_articles" },
  { label: "Business Registration No.", type: "business_registration" },
  { label: "Company Registration", type: "company_registration" },
  { label: "Board Resolution / Power of Attorney", type: "board_resolution_poa" },
  { label: "Passport Copy of Authorized Signatory", type: "passport_copy" },
  { label: "Latest Audited Financial Statements", type: "audited_financial_statements" },
  { label: "Bank Reference Letter", type: "bank_reference_letter" },
  { label: "Proof of Address (utility bill / bank statement)", type: "proof_of_address" },
];

const emptyForm = {
  companyName: "",
  registeredAddress: "",
  primaryBusinessAddress: "",
  dateOfIncorporation: "",
  countryOfIncorporation: "",
  countryOfOperation: "",
  registrationNumber: "",
  taxIdNumber: "",
  businessType: "",
  coreBusinessDescription: "",
  ultimateBeneficialOwners: "",
  shareholders: "",
  managementStructure: "",
  subsidiaries: "",
  listingInfo: "",
  shareCapital: "",
  capitalRange: "",
  financialCurrency: "",
  salesRevenue: "",
  netIncome: "",
  totalEquity: "",
  totalBalanceSheet: "",
  lastReportingPeriod: "",
  externalAuditors: "",
  bankName: "",
  bankBranch: "",
  bankAddress: "",
  accountName: "",
  accountNumber: "",
  swiftCode: "",
  bankAccountCurrency: "",
  bankOfficerName: "",
  bankOfficerEmail: "",
  employeesCompany: "",
  employeesGroup: "",
  previousBullfrogEmployee: "",
  amlSubject: "",
  amlConformityProgram: "",
  amlRegulator: "",
  amlLawName: "",
  documentReasons: "",
  contactName: "",
  contactTitle: "",
  contactPhone: "",
  contactEmail: "",
  faxNumber: "",
  website: "",
  signatoryName: "",
  signatoryTitle: "",
  signatoryCompany: "",
  signatoryEmail: "",
  signatoryPlaceDate: "",
  filledByName: "",
  filledByEmail: "",
};

export default function KycRegister() {
  const [activeTab, setActiveTab] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState({ ...emptyForm });
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, { name: string; size: number }[]>>({});
  const [uploadedDocIds, setUploadedDocIds] = useState<string[]>([]);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const uploadDoc = useMutation({
    mutationFn: async ({ file, documentType }: { file: File; documentType: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", documentType);
      const res = await fetch("/api/kyc-documents/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      const created = await res.json();
      return { documentType, name: file.name, size: file.size, id: created.id };
    },
    onSuccess: (data) => {
      setUploadedDocs((prev) => ({
        ...prev,
        [data.documentType]: [...(prev[data.documentType] || []), { name: data.name, size: data.size }],
      }));
      if (data.id) setUploadedDocIds((prev) => [...prev, data.id]);
      toast({ title: "Document Uploaded", description: "File has been uploaded successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    },
    onSettled: () => setUploadingType(null),
  });

  const handleFileSelect = (documentType: string, file: File) => {
    setUploadingType(documentType);
    uploadDoc.mutate({ file, documentType });
  };

  const submitKyc = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/kyc", data);
      const created = await res.json();
      if (uploadedDocIds.length > 0 && created.id) {
        await apiRequest("PATCH", `/api/kyc/${created.id}/link-documents`, {
          documentIds: uploadedDocIds,
        });
      }
      return created;
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (error: Error) => {
      toast({ title: "Submission Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName || !form.registeredAddress || !form.contactName ||
        !form.contactTitle || !form.contactPhone || !form.contactEmail ||
        !form.dateOfIncorporation || !form.countryOfIncorporation || !form.registrationNumber ||
        !form.signatoryCompany) {
      toast({
        title: "Missing Required Fields",
        description: "Please complete all mandatory fields marked with * before submitting.",
        variant: "destructive",
      });
      return;
    }
    submitKyc.mutate(form);
  };

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const labelClass = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
  const inputClass = "bg-background border-border";
  const textareaClass = "bg-background border-border resize-none min-h-[80px]";

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="border-b border-border bg-card px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-primary flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">BULLEX</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
                Client KYC Registration
              </p>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-3" data-testid="text-kyc-success">KYC Application Submitted</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your KYC documentation has been securely transmitted to our compliance department.
              A dedicated compliance officer will review your file and contact you within 48-72 hours.
            </p>
            <p className="text-xs text-muted-foreground mt-4">
              You may close this page.
            </p>
          </div>
        </div>
        <div className="border-t border-border bg-muted/30 px-6 py-4 text-center">
          <p className="text-[10px] text-muted-foreground">
            Bullex is a proprietary platform of Bullfrog Group.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-primary flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">BULLEX</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
                Client KYC Registration
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="text-[10px] uppercase tracking-widest">
            Secure Form
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="bg-primary text-primary-foreground py-10 px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold tracking-tight mb-2" data-testid="text-kyc-register-title">
              Know Your Client Form (KYC)
            </h2>
            <p className="text-sm text-primary-foreground/70">
              Complete all 10 sections below to begin your onboarding with Bullex.
              Fields marked with * are mandatory. Your information is transmitted securely.
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-8">
          <Card data-testid="card-kyc-register-form">
            <div className="flex overflow-x-auto border-b border-border bg-muted/5 px-4 gap-1 scrollbar-hide">
              {sections.map((section, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className={`flex-shrink-0 px-3 py-3 text-[0.65rem] font-bold uppercase tracking-wider border-b-2 transition-colors ${
                    activeTab === i
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-primary"
                  }`}
                  data-testid={`tab-kyc-register-section-${i}`}
                >
                  {i + 1}. {section}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
              {activeTab === 0 && (
                <div data-testid="kyc-register-section-0">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" /> 1. Company Details
                  </h3>
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 md:col-span-2">
                      <Label className={labelClass}>Full Legal Name *</Label>
                      <Input name="companyName" required className={inputClass} placeholder="e.g. Acme Trading LLC" value={form.companyName} onChange={(e) => update("companyName", e.target.value)} data-testid="input-reg-company-name" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className={labelClass}>Full Legal (Registered) Address *</Label>
                      <Textarea name="registeredAddress" required className={textareaClass} placeholder="Full legal address including postal code" value={form.registeredAddress} onChange={(e) => update("registeredAddress", e.target.value)} data-testid="input-reg-address" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className={labelClass}>Full Primary Business Address (if different)</Label>
                      <Textarea name="primaryBusinessAddress" className={textareaClass} placeholder="Primary business address" value={form.primaryBusinessAddress} onChange={(e) => update("primaryBusinessAddress", e.target.value)} data-testid="input-reg-business-address" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Date of Incorporation (DD/MM/YYYY) *</Label>
                      <Input name="dateOfIncorporation" required className={inputClass} placeholder="DD/MM/YYYY" value={form.dateOfIncorporation} onChange={(e) => update("dateOfIncorporation", e.target.value)} data-testid="input-reg-incorporation-date" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Country of Incorporation *</Label>
                      <Input name="countryOfIncorporation" required className={inputClass} placeholder="e.g. United Arab Emirates" value={form.countryOfIncorporation} onChange={(e) => update("countryOfIncorporation", e.target.value)} data-testid="input-reg-country-incorporation" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Country of Operation</Label>
                      <Input name="countryOfOperation" className={inputClass} placeholder="Primary country of operations" value={form.countryOfOperation} onChange={(e) => update("countryOfOperation", e.target.value)} data-testid="input-reg-country-operation" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Business Registration Number *</Label>
                      <Input name="registrationNumber" required className={inputClass} placeholder="Registration number" value={form.registrationNumber} onChange={(e) => update("registrationNumber", e.target.value)} data-testid="input-reg-number" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Tax Identification Number</Label>
                      <Input name="taxIdNumber" className={inputClass} placeholder="Tax ID / TIN" value={form.taxIdNumber} onChange={(e) => update("taxIdNumber", e.target.value)} data-testid="input-reg-tax-id" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Name of Contact Person *</Label>
                      <Input name="contactName" required className={inputClass} placeholder="Full name of primary contact" value={form.contactName} onChange={(e) => update("contactName", e.target.value)} data-testid="input-reg-contact-name" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Corporate Title / Role *</Label>
                      <Input name="contactTitle" required className={inputClass} placeholder="e.g. Director, CEO" value={form.contactTitle} onChange={(e) => update("contactTitle", e.target.value)} data-testid="input-reg-contact-title" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Phone Number *</Label>
                      <Input name="contactPhone" required className={inputClass} placeholder="+971 XX XXX XXXX" value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} data-testid="input-reg-contact-phone" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Fax Number</Label>
                      <Input name="faxNumber" className={inputClass} placeholder="Fax number" value={form.faxNumber} onChange={(e) => update("faxNumber", e.target.value)} data-testid="input-reg-fax" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Contact Email *</Label>
                      <Input name="contactEmail" type="email" required className={inputClass} placeholder="corporate@email.com" value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} data-testid="input-reg-contact-email" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Website</Label>
                      <Input name="website" className={inputClass} placeholder="https://www.company.com" value={form.website} onChange={(e) => update("website", e.target.value)} data-testid="input-reg-website" />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 1 && (
                <div data-testid="kyc-register-section-1">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-primary" /> 2. Business Activity
                  </h3>
                  <div className="mt-6 space-y-6">
                    <div className="space-y-2">
                      <Label className={labelClass}>Type of Business</Label>
                      <Select value={form.businessType} onValueChange={(v) => update("businessType", v)}>
                        <SelectTrigger className={inputClass} data-testid="select-reg-business-type">
                          <SelectValue placeholder="Select type..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Producer">Producer</SelectItem>
                          <SelectItem value="Seller">Seller</SelectItem>
                          <SelectItem value="Co Seller">Co Seller</SelectItem>
                          <SelectItem value="Buyer">Buyer</SelectItem>
                          <SelectItem value="Co Buyer">Co Buyer</SelectItem>
                          <SelectItem value="Analysis Agency">Analysis Agency</SelectItem>
                          <SelectItem value="Collateral Manager">Collateral Manager</SelectItem>
                          <SelectItem value="Shipping Agency">Shipping Agency</SelectItem>
                          <SelectItem value="Stevedoring Agency">Stevedoring Agency</SelectItem>
                          <SelectItem value="Custom House Agent (CHA)">Custom House Agent (CHA)</SelectItem>
                          <SelectItem value="Chartering Companies">Chartering Companies</SelectItem>
                          <SelectItem value="Chartering Brokers">Chartering Brokers</SelectItem>
                          <SelectItem value="Ship Owner">Ship Owner</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Description of Core Business Activity</Label>
                      <Textarea className={`${textareaClass} min-h-[120px]`} placeholder="Describe the core business activity of your company, including principal commodities traded, geographic focus, and supply chain position." value={form.coreBusinessDescription} onChange={(e) => update("coreBusinessDescription", e.target.value)} data-testid="input-reg-business-description" />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 2 && (
                <div data-testid="kyc-register-section-2">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" /> 3. Beneficial Owners
                  </h3>
                  <div className="mt-6 space-y-6">
                    <div className="space-y-2">
                      <Label className={labelClass}>Ultimate Beneficial Owner(s) *</Label>
                      <p className="text-xs text-muted-foreground">Please provide details of all individuals who hold directly or indirectly more than 10% of the company's shares or voting rights.</p>
                    </div>
                    {Array.from({ length: Math.max(1, (form.ultimateBeneficialOwners ? form.ultimateBeneficialOwners.split("\n").filter(Boolean).length : 0) || 1) }).map((_, idx) => {
                      const lines = form.ultimateBeneficialOwners ? form.ultimateBeneficialOwners.split("\n").filter(Boolean) : [];
                      const parts = (lines[idx] || "").split(" — ");
                      const uName = parts[0] || "";
                      const uDob = parts[1] || "";
                      const uNat = parts[2] || "";
                      const uPassport = parts[3] || "";
                      const uPercent = parts[4] || "";
                      const updateUbo = (field: number, val: string) => {
                        const current = form.ultimateBeneficialOwners ? form.ultimateBeneficialOwners.split("\n").filter(Boolean) : [];
                        while (current.length <= idx) current.push("");
                        const p = current[idx].split(" — ");
                        while (p.length < 5) p.push("");
                        p[field] = val;
                        current[idx] = p.join(" — ");
                        update("ultimateBeneficialOwners", current.filter((l) => l !== " —  —  —  — ").join("\n"));
                      };
                      const removeUbo = () => {
                        const current = form.ultimateBeneficialOwners ? form.ultimateBeneficialOwners.split("\n").filter(Boolean) : [];
                        current.splice(idx, 1);
                        update("ultimateBeneficialOwners", current.join("\n"));
                      };
                      return (
                        <div key={idx} className="p-4 border border-border bg-muted/20 space-y-3" data-testid={`ubo-box-reg-${idx + 1}`}>
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                              UBO {idx + 1} {idx === 0 && <span className="text-destructive">*</span>}
                            </h4>
                            {idx > 0 && (
                              <button type="button" onClick={removeUbo} className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1" data-testid={`btn-remove-ubo-reg-${idx + 1}`}>
                                <Trash2 className="h-3 w-3" /> Remove
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Full Name {idx === 0 && "*"}</Label>
                              <Input className={inputClass} placeholder="Full name" value={uName} onChange={(e) => updateUbo(0, e.target.value)} data-testid={`input-reg-ubo-${idx + 1}-name`} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Date of Birth {idx === 0 && "*"}</Label>
                              <Input className={inputClass} placeholder="DD/MM/YYYY" value={uDob} onChange={(e) => updateUbo(1, e.target.value)} data-testid={`input-reg-ubo-${idx + 1}-dob`} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Nationality {idx === 0 && "*"}</Label>
                              <Input className={inputClass} placeholder="Nationality" value={uNat} onChange={(e) => updateUbo(2, e.target.value)} data-testid={`input-reg-ubo-${idx + 1}-nationality`} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Passport No. {idx === 0 && "*"}</Label>
                              <Input className={inputClass} placeholder="Passport number" value={uPassport} onChange={(e) => updateUbo(3, e.target.value)} data-testid={`input-reg-ubo-${idx + 1}-passport`} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Percentage Held {idx === 0 && "*"}</Label>
                              <Input className={inputClass} placeholder="e.g. 25%" value={uPercent} onChange={(e) => updateUbo(4, e.target.value)} data-testid={`input-reg-ubo-${idx + 1}-percent`} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <button type="button" onClick={() => { const current = form.ultimateBeneficialOwners ? form.ultimateBeneficialOwners.split("\n").filter(Boolean) : []; current.push(" —  —  —  — "); update("ultimateBeneficialOwners", current.join("\n")); }} className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 border border-dashed border-primary/40 rounded px-4 py-2 w-full justify-center" data-testid="btn-add-ubo-reg">
                      <Plus className="h-4 w-4" /> Add Another UBO
                    </button>
                    <div className="space-y-2 mt-4">
                      <Label className={labelClass}>Shareholders (Direct & Indirect) *</Label>
                      <p className="text-xs text-muted-foreground">Provide details of all direct and indirect shareholders.</p>
                    </div>
                    {Array.from({ length: Math.max(1, (form.shareholders ? form.shareholders.split("\n").filter(Boolean).length : 0) || 1) }).map((_, idx) => {
                      const lines = form.shareholders ? form.shareholders.split("\n").filter(Boolean) : [];
                      const parts = (lines[idx] || "").split(" — ");
                      const sName = parts[0] || "";
                      const sNat = parts[1] || "";
                      const sPercent = parts[2] || "";
                      const updateShareholder = (field: number, val: string) => {
                        const current = form.shareholders ? form.shareholders.split("\n").filter(Boolean) : [];
                        while (current.length <= idx) current.push("");
                        const p = current[idx].split(" — ");
                        while (p.length < 3) p.push("");
                        p[field] = val;
                        current[idx] = p.join(" — ");
                        update("shareholders", current.filter((l) => l !== " —  — ").join("\n"));
                      };
                      const removeShareholder = () => {
                        const current = form.shareholders ? form.shareholders.split("\n").filter(Boolean) : [];
                        current.splice(idx, 1);
                        update("shareholders", current.join("\n"));
                      };
                      return (
                        <div key={idx} className="p-4 border border-border bg-muted/20 space-y-3" data-testid={`shareholder-box-reg-${idx + 1}`}>
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                              Shareholder {idx + 1} {idx === 0 && <span className="text-destructive">*</span>}
                            </h4>
                            {idx > 0 && (
                              <button type="button" onClick={removeShareholder} className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1" data-testid={`btn-remove-shareholder-reg-${idx + 1}`}>
                                <Trash2 className="h-3 w-3" /> Remove
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Name {idx === 0 && "*"}</Label>
                              <Input className={inputClass} placeholder="Full name or entity" value={sName} onChange={(e) => updateShareholder(0, e.target.value)} data-testid={`input-reg-shareholder-${idx + 1}-name`} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Nationality {idx === 0 && "*"}</Label>
                              <Input className={inputClass} placeholder="Nationality" value={sNat} onChange={(e) => updateShareholder(1, e.target.value)} data-testid={`input-reg-shareholder-${idx + 1}-nationality`} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Percentage Held {idx === 0 && "*"}</Label>
                              <Input className={inputClass} placeholder="e.g. 25%" value={sPercent} onChange={(e) => updateShareholder(2, e.target.value)} data-testid={`input-reg-shareholder-${idx + 1}-percent`} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <button type="button" onClick={() => { const current = form.shareholders ? form.shareholders.split("\n").filter(Boolean) : []; current.push(" —  — "); update("shareholders", current.join("\n")); }} className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 border border-dashed border-primary/40 rounded px-4 py-2 w-full justify-center" data-testid="btn-add-shareholder-reg">
                      <Plus className="h-4 w-4" /> Add Another Shareholder
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 3 && (
                <div data-testid="kyc-register-section-3">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" /> 4. Management Structure
                  </h3>
                  <div className="mt-6 space-y-6">
                    <p className="text-xs text-muted-foreground">Provide details for directors / senior officers. At least Director 1 is mandatory.</p>
                    {(() => {
                      const lines = form.managementStructure ? form.managementStructure.split("\n").filter(Boolean) : [];
                      const count = Math.max(1, lines.length);
                      return (
                        <>
                          {Array.from({ length: count }).map((_, idx) => {
                            const parts = (lines[idx] || "").split(" — ");
                            const dName = parts[0] || "";
                            const dNat = parts[1] || "";
                            const dDob = parts[2] || "";
                            const dPos = parts[3] || "";
                            const updateDirector = (field: number, val: string) => {
                              const current = form.managementStructure ? form.managementStructure.split("\n").filter(Boolean) : [];
                              while (current.length <= idx) current.push("");
                              const p = current[idx].split(" — ");
                              while (p.length < 4) p.push("");
                              p[field] = val;
                              current[idx] = p.join(" — ");
                              update("managementStructure", current.filter((l) => l !== " —  —  — ").join("\n"));
                            };
                            const removeDirector = () => {
                              const current = form.managementStructure ? form.managementStructure.split("\n").filter(Boolean) : [];
                              current.splice(idx, 1);
                              update("managementStructure", current.join("\n"));
                            };
                            return (
                              <div key={idx} className="p-4 border border-border bg-muted/20 space-y-3" data-testid={`director-box-${idx + 1}`}>
                                <div className="flex items-center justify-between">
                                  <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                                    Director {idx + 1} {idx === 0 && <span className="text-destructive">*</span>}
                                  </h4>
                                  {idx > 0 && (
                                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={removeDirector} data-testid={`button-remove-director-${idx + 1}`}>
                                      <Trash2 className="w-3 h-3 mr-1" /> Remove
                                    </Button>
                                  )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Full Name {idx === 0 && "*"}</Label>
                                    <Input className={inputClass} placeholder="Full name" value={dName} onChange={(e) => updateDirector(0, e.target.value)} data-testid={`input-reg-director-${idx + 1}-name`} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Nationality {idx === 0 && "*"}</Label>
                                    <Input className={inputClass} placeholder="Nationality" value={dNat} onChange={(e) => updateDirector(1, e.target.value)} data-testid={`input-reg-director-${idx + 1}-nationality`} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Date of Birth {idx === 0 && "*"}</Label>
                                    <Input className={inputClass} placeholder="DD/MM/YYYY" value={dDob} onChange={(e) => updateDirector(2, e.target.value)} data-testid={`input-reg-director-${idx + 1}-dob`} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Position {idx === 0 && "*"}</Label>
                                    <Input className={inputClass} placeholder="e.g. Managing Director" value={dPos} onChange={(e) => updateDirector(3, e.target.value)} data-testid={`input-reg-director-${idx + 1}-position`} />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-none"
                            onClick={() => {
                              const current = form.managementStructure ? form.managementStructure.split("\n").filter(Boolean) : [];
                              current.push(" —  —  — ");
                              update("managementStructure", current.join("\n"));
                            }}
                            data-testid="button-add-director"
                          >
                            <Plus className="w-3.5 h-3.5 mr-1" /> Add Director
                          </Button>
                        </>
                      );
                    })()}
                    <div className="space-y-2">
                      <Label className={labelClass}>Subsidiaries / Affiliated Companies</Label>
                      <Textarea className={textareaClass} placeholder="List subsidiaries with country of incorporation" value={form.subsidiaries} onChange={(e) => update("subsidiaries", e.target.value)} data-testid="input-reg-subsidiaries" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Stock Exchange Listing (if applicable)</Label>
                      <Input className={inputClass} placeholder="Exchange name and ticker symbol" value={form.listingInfo} onChange={(e) => update("listingInfo", e.target.value)} data-testid="input-reg-listing" />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 4 && (
                <div data-testid="kyc-register-section-4">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" /> 5. Financial Information
                  </h3>
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className={labelClass}>Indicative Capital Range *</Label>
                      <Select value={form.capitalRange} onValueChange={(v) => update("capitalRange", v)}>
                        <SelectTrigger className={inputClass} data-testid="select-reg-capital-range">
                          <SelectValue placeholder="Select range..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="<1M">Under $1M</SelectItem>
                          <SelectItem value="1M-5M">$1M – $5M</SelectItem>
                          <SelectItem value="5M-10M">$5M – $10M</SelectItem>
                          <SelectItem value="10M-50M">$10M – $50M</SelectItem>
                          <SelectItem value="50M-100M">$50M – $100M</SelectItem>
                          <SelectItem value="100M-500M">$100M – $500M</SelectItem>
                          <SelectItem value=">500M">Over $500M</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Reporting Currency</Label>
                      <Select value={form.financialCurrency} onValueChange={(v) => update("financialCurrency", v)}>
                        <SelectTrigger className={inputClass} data-testid="select-reg-financial-currency">
                          <SelectValue placeholder="Select currency..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="GBP">GBP</SelectItem>
                          <SelectItem value="AED">AED</SelectItem>
                          <SelectItem value="CHF">CHF</SelectItem>
                          <SelectItem value="SGD">SGD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Share Capital</Label>
                      <Input className={inputClass} placeholder="Issued share capital" value={form.shareCapital} onChange={(e) => update("shareCapital", e.target.value)} data-testid="input-reg-share-capital" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Sales Revenue (Last FY)</Label>
                      <Input className={inputClass} placeholder="Annual revenue" value={form.salesRevenue} onChange={(e) => update("salesRevenue", e.target.value)} data-testid="input-reg-sales-revenue" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Net Income (Last FY)</Label>
                      <Input className={inputClass} placeholder="Net income / profit" value={form.netIncome} onChange={(e) => update("netIncome", e.target.value)} data-testid="input-reg-net-income" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Total Equity</Label>
                      <Input className={inputClass} placeholder="Total shareholders' equity" value={form.totalEquity} onChange={(e) => update("totalEquity", e.target.value)} data-testid="input-reg-total-equity" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Total Balance Sheet</Label>
                      <Input className={inputClass} placeholder="Total assets" value={form.totalBalanceSheet} onChange={(e) => update("totalBalanceSheet", e.target.value)} data-testid="input-reg-balance-sheet" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Last Reporting Period</Label>
                      <Input className={inputClass} placeholder="e.g. FY 2024" value={form.lastReportingPeriod} onChange={(e) => update("lastReportingPeriod", e.target.value)} data-testid="input-reg-reporting-period" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className={labelClass}>External Auditors</Label>
                      <Input className={inputClass} placeholder="Name of external audit firm" value={form.externalAuditors} onChange={(e) => update("externalAuditors", e.target.value)} data-testid="input-reg-auditors" />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 5 && (
                <div data-testid="kyc-register-section-5">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <Landmark className="h-5 w-5 text-primary" /> 6. Primary Banking Information
                  </h3>
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 md:col-span-2">
                      <Label className={labelClass}>Bank Name *</Label>
                      <Input className={inputClass} placeholder="Full name of bank" value={form.bankName} onChange={(e) => update("bankName", e.target.value)} data-testid="input-reg-bank-name" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Branch</Label>
                      <Input className={inputClass} placeholder="Branch name" value={form.bankBranch} onChange={(e) => update("bankBranch", e.target.value)} data-testid="input-reg-bank-branch" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Bank Address *</Label>
                      <Input className={inputClass} placeholder="Full bank address" value={form.bankAddress} onChange={(e) => update("bankAddress", e.target.value)} data-testid="input-reg-bank-address" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Account Name *</Label>
                      <Input className={inputClass} placeholder="Name on account" value={form.accountName} onChange={(e) => update("accountName", e.target.value)} data-testid="input-reg-account-name" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Account Number / IBAN *</Label>
                      <Input className={inputClass} placeholder="Account number or IBAN" value={form.accountNumber} onChange={(e) => update("accountNumber", e.target.value)} data-testid="input-reg-account-number" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Swift Code *</Label>
                      <Input className={inputClass} placeholder="SWIFT / BIC code" value={form.swiftCode} onChange={(e) => update("swiftCode", e.target.value)} data-testid="input-reg-swift-code" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Bank Account / Currency</Label>
                      <Select value={form.bankAccountCurrency} onValueChange={(v) => update("bankAccountCurrency", v)}>
                        <SelectTrigger className={inputClass} data-testid="select-reg-bank-currency">
                          <SelectValue placeholder="Select currency..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="GBP">GBP</SelectItem>
                          <SelectItem value="AED">AED</SelectItem>
                          <SelectItem value="CHF">CHF</SelectItem>
                          <SelectItem value="SGD">SGD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Bank Officer Name *</Label>
                      <Input className={inputClass} placeholder="Full name of bank officer" value={form.bankOfficerName} onChange={(e) => update("bankOfficerName", e.target.value)} data-testid="input-reg-bank-officer-name" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Bank Officer Email *</Label>
                      <Input className={inputClass} type="email" placeholder="Bank officer email address" value={form.bankOfficerEmail} onChange={(e) => update("bankOfficerEmail", e.target.value)} data-testid="input-reg-bank-officer-email" />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 6 && (
                <div data-testid="kyc-register-section-6">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" /> 7. Human Resources
                  </h3>
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className={labelClass}>No. of Employees (Company)</Label>
                      <Input className={inputClass} placeholder="Number of employees" value={form.employeesCompany} onChange={(e) => update("employeesCompany", e.target.value)} data-testid="input-reg-employees-company" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>No. of Employees (Group)</Label>
                      <Input className={inputClass} placeholder="Group-wide employee count" value={form.employeesGroup} onChange={(e) => update("employeesGroup", e.target.value)} data-testid="input-reg-employees-group" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className={labelClass}>Previous Bullfrog Group Employee? *</Label>
                      <Select value={form.previousBullfrogEmployee} onValueChange={(v) => update("previousBullfrogEmployee", v)}>
                        <SelectTrigger className={inputClass} data-testid="select-reg-previous-employee">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="No">No</SelectItem>
                          <SelectItem value="Yes">Yes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 7 && (
                <div data-testid="kyc-register-section-7">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <Scale className="h-5 w-5 text-primary" /> 8. Compliance Questionnaire
                  </h3>
                  <div className="mt-6 space-y-6">
                    <div className="space-y-2">
                      <Label className={labelClass}>Is your company subject to AML/CFT regulations? *</Label>
                      <Select value={form.amlSubject} onValueChange={(v) => update("amlSubject", v)}>
                        <SelectTrigger className={inputClass} data-testid="select-reg-aml-subject">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Yes">Yes</SelectItem>
                          <SelectItem value="No">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Does your company have an AML/CFT conformity program? *</Label>
                      <Select value={form.amlConformityProgram} onValueChange={(v) => update("amlConformityProgram", v)}>
                        <SelectTrigger className={inputClass} data-testid="select-reg-aml-conformity">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Yes">Yes</SelectItem>
                          <SelectItem value="No">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Name of AML/CFT Regulator *</Label>
                      <Input className={inputClass} placeholder="Regulatory authority name" value={form.amlRegulator} onChange={(e) => update("amlRegulator", e.target.value)} data-testid="input-reg-aml-regulator" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Applicable AML/CFT Law Name *</Label>
                      <Input className={inputClass} placeholder="Name of applicable law / regulation" value={form.amlLawName} onChange={(e) => update("amlLawName", e.target.value)} data-testid="input-reg-aml-law" />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 8 && (
                <div data-testid="kyc-register-section-8">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" /> 9. Documents Required
                  </h3>
                  <div className="mt-6 space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Upload the following documents to complete KYC verification. Accepted formats: PDF, JPG, PNG, DOC, DOCX, XLS, XLSX (max 10MB each).
                    </p>
                    <div className="space-y-3">
                      {kycDocList.map((docDef) => {
                        const uploaded = uploadedDocs[docDef.type] || [];
                        const isUploading = uploadingType === docDef.type;
                        return (
                          <div key={docDef.type} className="rounded-lg border border-border bg-muted/30 overflow-hidden" data-testid={`kyc-reg-doc-row-${docDef.type}`}>
                            <div className="flex items-center justify-between p-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <FileCheck className={`w-4 h-4 flex-shrink-0 ${uploaded.length > 0 ? "text-green-600" : "text-muted-foreground"}`} />
                                <span className="text-sm font-medium truncate">{docDef.label}</span>
                                {uploaded.length > 0 && (
                                  <Badge variant="default" className="text-[10px] bg-green-600 hover:bg-green-700 flex-shrink-0">
                                    <CheckCircle2 className="w-3 h-3 mr-0.5" />
                                    {uploaded.length} uploaded
                                  </Badge>
                                )}
                              </div>
                              <div className="flex-shrink-0 ml-2">
                                <input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                                  className="hidden"
                                  ref={(el) => { fileInputRefs.current[docDef.type] = el; }}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileSelect(docDef.type, file);
                                    e.target.value = "";
                                  }}
                                  data-testid={`input-reg-file-${docDef.type}`}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={uploaded.length > 0 ? "outline" : "default"}
                                  disabled={isUploading}
                                  onClick={() => fileInputRefs.current[docDef.type]?.click()}
                                  data-testid={`btn-reg-upload-${docDef.type}`}
                                >
                                  {isUploading ? (
                                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Uploading...</>
                                  ) : (
                                    <><Upload className="w-3.5 h-3.5 mr-1.5" /> {uploaded.length > 0 ? "Upload Another" : "Upload"}</>
                                  )}
                                </Button>
                              </div>
                            </div>
                            {uploaded.length > 0 && (
                              <div className="border-t border-border bg-background px-3 py-2 space-y-1.5">
                                {uploaded.map((file, idx) => (
                                  <div key={idx} className="flex items-center text-xs gap-2">
                                    <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0" />
                                    <span className="text-muted-foreground truncate">{file.name} <span className="text-muted-foreground/60">({(file.size / 1024).toFixed(0)} KB)</span></span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="space-y-2 mt-4">
                      <Label className={labelClass}>Additional Notes / Document Submission Details</Label>
                      <Textarea className={`${textareaClass} min-h-[100px]`} placeholder="Provide any notes regarding document submission, courier details, or digital upload references." value={form.documentReasons} onChange={(e) => update("documentReasons", e.target.value)} data-testid="input-reg-document-notes" />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 9 && (
                <div data-testid="kyc-register-section-9">
                  <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                    <PenTool className="h-5 w-5 text-primary" /> 10. Authorised Signatory
                  </h3>
                  <div className="mt-6 space-y-4">
                    <p className="text-sm text-muted-foreground">
                      I hereby confirm that the information provided above is true and correct to the best of my knowledge and belief. I understand that any false statement may result in the rejection of this application.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className={labelClass}>Print Name *</Label>
                        <Input className={inputClass} placeholder="Full name of signatory" value={form.signatoryName} onChange={(e) => update("signatoryName", e.target.value)} data-testid="input-reg-signatory-name" />
                      </div>
                      <div className="space-y-2">
                        <Label className={labelClass}>Title *</Label>
                        <Input className={inputClass} placeholder="e.g. Managing Director" value={form.signatoryTitle} onChange={(e) => update("signatoryTitle", e.target.value)} data-testid="input-reg-signatory-title" />
                      </div>
                      <div className="space-y-2">
                        <Label className={labelClass}>Company Name *</Label>
                        <Input className={inputClass} placeholder="Company name" value={form.signatoryCompany} onChange={(e) => update("signatoryCompany", e.target.value)} data-testid="input-reg-signatory-company" />
                      </div>
                      <div className="space-y-2">
                        <Label className={labelClass}>Email *</Label>
                        <Input className={inputClass} type="email" placeholder="signatory@company.com" value={form.signatoryEmail} onChange={(e) => update("signatoryEmail", e.target.value)} data-testid="input-reg-signatory-email" />
                      </div>
                      <div className="space-y-2">
                        <Label className={labelClass}>Place & Date *</Label>
                        <Input className={inputClass} placeholder="e.g. Dubai, 15/03/2025" value={form.signatoryPlaceDate} onChange={(e) => update("signatoryPlaceDate", e.target.value)} data-testid="input-reg-signatory-place-date" />
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-border">
                      <h4 className="text-sm font-bold text-primary mb-4">Form Filled By</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className={labelClass}>Name</Label>
                          <Input className={inputClass} placeholder="Name of person filling this form" value={form.filledByName} onChange={(e) => update("filledByName", e.target.value)} data-testid="input-reg-filled-by-name" />
                        </div>
                        <div className="space-y-2">
                          <Label className={labelClass}>Email</Label>
                          <Input className={inputClass} type="email" placeholder="email@company.com" value={form.filledByEmail} onChange={(e) => update("filledByEmail", e.target.value)} data-testid="input-reg-filled-by-email" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActiveTab(Math.max(0, activeTab - 1))}
                  disabled={activeTab === 0}
                  data-testid="btn-reg-prev-section"
                >
                  Previous Section
                </Button>
                {activeTab < sections.length - 1 ? (
                  <Button
                    type="button"
                    onClick={() => {
                      if (activeTab === 2) {
                        if (!form.ultimateBeneficialOwners.trim() || !form.shareholders.trim()) {
                          toast({ title: "Required Fields", description: "Ultimate Beneficial Owners and Shareholders are mandatory. Please complete both fields before proceeding.", variant: "destructive" });
                          return;
                        }
                      }
                      if (activeTab === 3) {
                        const lines = form.managementStructure ? form.managementStructure.split("\n").filter(Boolean) : [];
                        const parts = (lines[0] || "").split(" — ");
                        if (!parts[0]?.trim() || !parts[1]?.trim() || !parts[2]?.trim() || !parts[3]?.trim()) {
                          toast({ title: "Required Fields", description: "Director 1 details (Full Name, Nationality, Date of Birth, Position) are mandatory.", variant: "destructive" });
                          return;
                        }
                      }
                      if (activeTab === 5) {
                        if (!form.bankOfficerName.trim() || !form.bankOfficerEmail.trim()) {
                          toast({ title: "Required Fields", description: "Bank Officer Name and Email are mandatory. Please complete both fields before proceeding.", variant: "destructive" });
                          return;
                        }
                      }
                      if (activeTab === 6) {
                        if (!form.previousBullfrogEmployee.trim()) {
                          toast({ title: "Required Field", description: "Please select whether you are a previous Bullfrog Group employee before proceeding.", variant: "destructive" });
                          return;
                        }
                      }
                      if (activeTab === 7) {
                        if (!form.amlSubject.trim() || !form.amlConformityProgram.trim() || !form.amlRegulator.trim() || !form.amlLawName.trim()) {
                          toast({ title: "Required Fields", description: "All Compliance Questionnaire fields are mandatory. Please complete every field before proceeding.", variant: "destructive" });
                          return;
                        }
                      }
                      setActiveTab(activeTab + 1);
                    }}
                    data-testid="btn-reg-next-section"
                  >
                    Next Section
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowPreview(true)}
                      data-testid="button-reg-preview-kyc"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Preview
                    </Button>
                    <Button
                      type="submit"
                      disabled={submitKyc.isPending}
                      data-testid="button-reg-submit-kyc"
                    >
                      <UserCheck className="w-4 h-4 mr-2" />
                      {submitKyc.isPending ? "Submitting..." : "Submit KYC Application"}
                    </Button>
                  </div>
                )}
              </div>

              <Dialog open={showPreview} onOpenChange={setShowPreview}>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-bold flex items-center gap-2">
                      <Eye className="w-5 h-5" /> KYC Application Preview
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-6 mt-4">
                    {[
                      { title: "1. Company Details", icon: <Building2 className="w-4 h-4" />, rows: [
                        ["Full Legal Name", form.companyName], ["Registered Address", form.registeredAddress],
                        ["Primary Business Address", form.primaryBusinessAddress], ["Date of Incorporation", form.dateOfIncorporation],
                        ["Country of Incorporation", form.countryOfIncorporation], ["Country of Operation", form.countryOfOperation],
                        ["Registration Number", form.registrationNumber], ["Tax ID Number", form.taxIdNumber],
                        ["Contact Name", form.contactName], ["Corporate Title", form.contactTitle],
                        ["Phone", form.contactPhone], ["Email", form.contactEmail],
                        ["Fax", form.faxNumber], ["Website", form.website],
                      ]},
                      { title: "2. Business Activity", icon: <Briefcase className="w-4 h-4" />, rows: [
                        ["Type of Business", form.businessType], ["Core Business Description", form.coreBusinessDescription],
                      ]},
                      { title: "3. Beneficial Owners", icon: <Users className="w-4 h-4" />, rows: [
                        ...(form.ultimateBeneficialOwners ? form.ultimateBeneficialOwners.split("\n").filter(Boolean).map((line: string, i: number) => {
                          const p = line.split(" — ");
                          return [`UBO ${i + 1}`, `${p[0] || ""}  |  DOB: ${p[1] || "N/A"}  |  Nationality: ${p[2] || "N/A"}  |  Passport: ${p[3] || "N/A"}  |  ${p[4] || "N/A"}`];
                        }) : [["Ultimate Beneficial Owners", "—"]]),
                        ...(form.shareholders ? form.shareholders.split("\n").filter(Boolean).map((line: string, i: number) => {
                          const p = line.split(" — ");
                          return [`Shareholder ${i + 1}`, `${p[0] || ""}  |  Nationality: ${p[1] || "N/A"}  |  ${p[2] || "N/A"}`];
                        }) : [["Shareholders", "—"]]),
                      ]},
                      { title: "4. Management Structure", icon: <Users className="w-4 h-4" />, rows: [
                        ["Directors / Senior Management", form.managementStructure],
                        ["Subsidiaries", form.subsidiaries], ["Stock Exchange Listing", form.listingInfo],
                      ]},
                      { title: "5. Financial Information", icon: <BarChart3 className="w-4 h-4" />, rows: [
                        ["Share Capital", form.shareCapital], ["Capital Range", form.capitalRange],
                        ["Financial Currency", form.financialCurrency], ["Sales Revenue", form.salesRevenue],
                        ["Net Income", form.netIncome], ["Total Equity", form.totalEquity],
                        ["Total Balance Sheet", form.totalBalanceSheet], ["Last Reporting Period", form.lastReportingPeriod],
                        ["External Auditors", form.externalAuditors],
                      ]},
                      { title: "6. Banking Information", icon: <Landmark className="w-4 h-4" />, rows: [
                        ["Bank Name", form.bankName], ["Branch", form.bankBranch], ["Bank Address", form.bankAddress],
                        ["Account Name", form.accountName], ["Account Number", form.accountNumber],
                        ["SWIFT Code", form.swiftCode], ["Currency", form.bankAccountCurrency],
                        ["Bank Officer Name", form.bankOfficerName], ["Bank Officer Email", form.bankOfficerEmail],
                      ]},
                      { title: "7. Human Resources", icon: <Users className="w-4 h-4" />, rows: [
                        ["Employees (Company)", form.employeesCompany], ["Employees (Group)", form.employeesGroup],
                        ["Previous Bullfrog Employee", form.previousBullfrogEmployee],
                      ]},
                      { title: "8. Compliance Questionnaire", icon: <Scale className="w-4 h-4" />, rows: [
                        ["AML/CFT Subject", form.amlSubject], ["AML/CFT Conformity Program", form.amlConformityProgram],
                        ["AML/CFT Regulator", form.amlRegulator], ["Applicable AML/CFT Law", form.amlLawName],
                      ]},
                      { title: "9. Documents", icon: <FileText className="w-4 h-4" />, rows: [
                        ["Document Notes", form.documentReasons],
                        ...kycDocList.filter(d => (uploadedDocs[d.type] || []).length > 0).map(d => [d.label, uploadedDocs[d.type].map(f => f.name).join(", ")]),
                      ]},
                      { title: "10. Authorised Signatory", icon: <PenTool className="w-4 h-4" />, rows: [
                        ["Print Name", form.signatoryName], ["Title", form.signatoryTitle],
                        ["Company Name", form.signatoryCompany], ["Email", form.signatoryEmail], ["Place & Date", form.signatoryPlaceDate],
                        ["Filled By", form.filledByName], ["Filled By Email", form.filledByEmail],
                      ]},
                    ].map((section) => (
                      <div key={section.title} className="border border-border p-4" data-testid={`preview-section-${section.title.split(".")[0].trim()}`}>
                        <h4 className="text-sm font-bold text-primary flex items-center gap-2 mb-3">{section.icon} {section.title}</h4>
                        <div className="space-y-1.5">
                          {section.rows.map(([label, value]) => (
                            <div key={label} className="flex justify-between py-1 border-b border-border/30 text-sm">
                              <span className="text-muted-foreground text-xs">{label}</span>
                              <span className="font-medium text-right max-w-[60%] break-words whitespace-pre-line">{value || "—"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-end gap-2 pt-4 border-t border-border">
                      <Button variant="outline" onClick={() => setShowPreview(false)} data-testid="button-reg-preview-close">
                        Back to Edit
                      </Button>
                      <Button onClick={() => { setShowPreview(false); handleSubmit({ preventDefault: () => {} } as React.FormEvent); }} disabled={submitKyc.isPending} data-testid="button-reg-preview-submit">
                        <UserCheck className="w-4 h-4 mr-2" />
                        {submitKyc.isPending ? "Submitting..." : "Submit KYC Application"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </form>
          </Card>
        </div>
      </div>

      <div className="border-t border-border bg-muted/30 px-6 py-4 text-center">
        <p className="text-[10px] text-muted-foreground">
          Bullex is a proprietary platform of Bullfrog Group.
        </p>
      </div>
    </div>
  );
}
