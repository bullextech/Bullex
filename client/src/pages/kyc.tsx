import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
  Clock,
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
  Download,
  Trash2,
  Loader2,
  Eye,
  Plus,
  Edit,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { KycApplication, KycDocument, KycChangeRequest } from "@shared/schema";

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

const editableFields = [
  { key: "companyName", label: "Company Name" },
  { key: "registeredAddress", label: "Registered Address" },
  { key: "primaryBusinessAddress", label: "Primary Business Address" },
  { key: "contactName", label: "Contact Name" },
  { key: "contactTitle", label: "Contact Title" },
  { key: "contactPhone", label: "Contact Phone" },
  { key: "contactEmail", label: "Contact Email" },
  { key: "countryOfOperation", label: "Country of Operation" },
  { key: "businessType", label: "Business Type" },
  { key: "coreBusinessDescription", label: "Core Business Description" },
  { key: "bankName", label: "Bank Name" },
  { key: "bankAddress", label: "Bank Address" },
  { key: "accountName", label: "Account Name" },
  { key: "accountNumber", label: "Account Number" },
  { key: "swiftCode", label: "SWIFT Code" },
  { key: "bankAccountCurrency", label: "Bank Account Currency" },
  { key: "signatoryName", label: "Signatory Name" },
  { key: "signatoryTitle", label: "Signatory Title" },
  { key: "signatoryEmail", label: "Signatory Email" },
];

export default function KYC() {
  const [activeTab, setActiveTab] = useState(0);
  const { toast } = useToast();
  const [form, setForm] = useState({ ...emptyForm });
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [uploadedDocIds, setUploadedDocIds] = useState<string[]>([]);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [editingKyc, setEditingKyc] = useState<KycApplication | null>(null);
  const [changeFields, setChangeFields] = useState<Record<string, string>>({});
  const [changeReason, setChangeReason] = useState("");

  const { data: kycs, isLoading } = useQuery<KycApplication[]>({
    queryKey: ["/api/kyc"],
  });

  const { data: kycDocs } = useQuery<KycDocument[]>({
    queryKey: ["/api/kyc-documents"],
  });

  const submitChangeRequest = useMutation({
    mutationFn: async ({ kycId, changedFields, reason }: { kycId: string; changedFields: Record<string, string>; reason: string }) => {
      const res = await apiRequest("POST", `/api/kyc/${kycId}/change-request`, { changedFields, reason });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Change Request Submitted", description: "Your change request has been submitted for admin review." });
      setEditingKyc(null);
      setChangeFields({});
      setChangeReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Submission Failed", description: error.message, variant: "destructive" });
    },
  });

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
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.id) setUploadedDocIds((prev) => [...prev, data.id]);
      queryClient.invalidateQueries({ queryKey: ["/api/kyc-documents"] });
      toast({ title: "Document Uploaded", description: "File has been uploaded successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    },
    onSettled: () => setUploadingType(null),
  });

  const deleteDoc = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/kyc-documents/${id}`);
      return res.json();
    },
    onSuccess: (_data: any, deletedId: string) => {
      setUploadedDocIds((prev) => prev.filter((docId) => docId !== deletedId));
      queryClient.invalidateQueries({ queryKey: ["/api/kyc-documents"] });
      toast({ title: "Document Removed", description: "File has been deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    },
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
      setUploadedDocIds([]);
      queryClient.invalidateQueries({ queryKey: ["/api/kyc"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kyc-documents"] });
      toast({
        title: "KYC Application Submitted",
        description: "Your KYC documentation has been securely transmitted to our compliance department. A dedicated compliance officer will review your file and contact you within 48-72 hours.",
      });
      setForm({ ...emptyForm });
      setActiveTab(0);
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

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[600px] rounded-md" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {kycs && kycs.length > 0 && (
        <Card data-testid="card-kyc-list">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Previous Applications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {kycs.map((kyc) => (
              <div
                key={kyc.id}
                className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted"
                data-testid={`kyc-row-${kyc.id}`}
              >
                <div className="flex items-center gap-3">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{kyc.companyName}</p>
                    <p className="text-xs text-muted-foreground">
                      {kyc.countryOfIncorporation} &middot; {kyc.contactEmail}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {kyc.status === "approved" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[10px] h-7 rounded-none"
                      onClick={() => {
                        setEditingKyc(kyc);
                        setChangeFields({});
                        setChangeReason("");
                      }}
                      data-testid={`button-request-changes-${kyc.id}`}
                    >
                      <Edit className="w-3 h-3 mr-1" /> Request Changes
                    </Button>
                  )}
                  <Badge
                    variant={kyc.status === "approved" ? "default" : "secondary"}
                    className="text-[10px] capitalize"
                  >
                    {kyc.status === "approved" && <CheckCircle2 className="w-3 h-3 mr-0.5" />}
                    {kyc.status === "pending" && <Clock className="w-3 h-3 mr-0.5" />}
                    {kyc.status}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editingKyc} onOpenChange={(open) => { if (!open) setEditingKyc(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-serif">
              <Edit className="w-5 h-5 text-primary" />
              Request Changes — {editingKyc?.companyName}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Edit the fields you want to change. Only modified fields will be submitted for admin approval.
            </p>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {editableFields.map(({ key, label }) => {
              const currentVal = editingKyc ? String((editingKyc as any)[key] || "") : "";
              return (
                <div key={key} className="space-y-1">
                  <Label className="text-xs font-medium">{label}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      className="text-sm rounded-none"
                      placeholder={currentVal || `Current: (empty)`}
                      value={changeFields[key] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setChangeFields((prev) => {
                          const next = { ...prev };
                          if (val === "" || val === currentVal) {
                            delete next[key];
                          } else {
                            next[key] = val;
                          }
                          return next;
                        });
                      }}
                      data-testid={`input-change-${key}`}
                    />
                  </div>
                  {currentVal && (
                    <p className="text-[10px] text-muted-foreground">Current: {currentVal}</p>
                  )}
                </div>
              );
            })}
            <div className="space-y-1 pt-2 border-t">
              <Label className="text-xs font-medium">Reason for Changes</Label>
              <Textarea
                className="text-sm rounded-none h-20"
                placeholder="Briefly explain why these changes are needed..."
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                data-testid="input-change-reason"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                className="rounded-none"
                onClick={() => setEditingKyc(null)}
                data-testid="button-cancel-changes"
              >
                Cancel
              </Button>
              <Button
                className="rounded-none"
                disabled={Object.keys(changeFields).length === 0 || submitChangeRequest.isPending}
                onClick={() => {
                  if (!editingKyc) return;
                  submitChangeRequest.mutate({
                    kycId: editingKyc.id,
                    changedFields: changeFields,
                    reason: changeReason,
                  });
                }}
                data-testid="button-submit-changes"
              >
                {submitChangeRequest.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Submitting...</>
                ) : (
                  "Submit Change Request"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="max-w-5xl" data-testid="card-kyc-form">
        <div className="p-6 md:p-8 border-b border-border bg-muted/10">
          <h2 className="text-2xl font-bold text-primary mb-2" data-testid="text-kyc-heading">
            Know Your Client Form (KYC)
          </h2>
          <p className="text-sm text-muted-foreground">
            Complete all sections to initiate KYC onboarding through Bullex. Fields marked * are mandatory.
          </p>
        </div>

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
              data-testid={`tab-kyc-section-${i}`}
            >
              {i + 1}. {section}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
          {activeTab === 0 && (
            <div data-testid="kyc-section-0">
              <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" /> 1. Company Details
              </h3>
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 md:col-span-2">
                  <Label className={labelClass}>Full Legal Name *</Label>
                  <Input name="companyName" required className={inputClass} placeholder="e.g. Acme Trading LLC" value={form.companyName} onChange={(e) => update("companyName", e.target.value)} data-testid="input-company-name" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className={labelClass}>Full Legal (Registered) Address *</Label>
                  <Textarea name="registeredAddress" required className={textareaClass} placeholder="Full legal address including postal code" value={form.registeredAddress} onChange={(e) => update("registeredAddress", e.target.value)} data-testid="input-address" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className={labelClass}>Full Primary Business Address (if different)</Label>
                  <Textarea name="primaryBusinessAddress" className={textareaClass} placeholder="Primary business address" value={form.primaryBusinessAddress} onChange={(e) => update("primaryBusinessAddress", e.target.value)} data-testid="input-business-address" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Date of Incorporation (DD/MM/YYYY) *</Label>
                  <Input name="dateOfIncorporation" required className={inputClass} placeholder="DD/MM/YYYY" value={form.dateOfIncorporation} onChange={(e) => update("dateOfIncorporation", e.target.value)} data-testid="input-incorporation-date" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Country of Incorporation *</Label>
                  <Input name="countryOfIncorporation" required className={inputClass} placeholder="e.g. United Arab Emirates" value={form.countryOfIncorporation} onChange={(e) => update("countryOfIncorporation", e.target.value)} data-testid="input-country-incorporation" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Country of Operation</Label>
                  <Input name="countryOfOperation" className={inputClass} placeholder="Primary country of operations" value={form.countryOfOperation} onChange={(e) => update("countryOfOperation", e.target.value)} data-testid="input-country-operation" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Business Registration Number *</Label>
                  <Input name="registrationNumber" required className={inputClass} placeholder="Registration number" value={form.registrationNumber} onChange={(e) => update("registrationNumber", e.target.value)} data-testid="input-reg-number" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Tax Identification Number</Label>
                  <Input name="taxIdNumber" className={inputClass} placeholder="Tax ID / TIN" value={form.taxIdNumber} onChange={(e) => update("taxIdNumber", e.target.value)} data-testid="input-tax-id" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Name of Contact Person *</Label>
                  <Input name="contactName" required className={inputClass} placeholder="Full name of primary contact" value={form.contactName} onChange={(e) => update("contactName", e.target.value)} data-testid="input-contact-name" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Corporate Title / Role *</Label>
                  <Input name="contactTitle" required className={inputClass} placeholder="e.g. Director, CEO" value={form.contactTitle} onChange={(e) => update("contactTitle", e.target.value)} data-testid="input-contact-title" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Phone Number *</Label>
                  <Input name="contactPhone" required className={inputClass} placeholder="+971 XX XXX XXXX" value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} data-testid="input-contact-phone" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Fax Number</Label>
                  <Input name="faxNumber" className={inputClass} placeholder="Fax number" value={form.faxNumber} onChange={(e) => update("faxNumber", e.target.value)} data-testid="input-fax" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Contact Email *</Label>
                  <Input name="contactEmail" type="email" required className={inputClass} placeholder="corporate@email.com" value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} data-testid="input-contact-email" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Website</Label>
                  <Input name="website" className={inputClass} placeholder="https://www.company.com" value={form.website} onChange={(e) => update("website", e.target.value)} data-testid="input-website" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 1 && (
            <div data-testid="kyc-section-1">
              <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" /> 2. Business Activity
              </h3>
              <div className="mt-6 space-y-6">
                <div className="space-y-2">
                  <Label className={labelClass}>Type of Business</Label>
                  <Select value={form.businessType} onValueChange={(v) => update("businessType", v)}>
                    <SelectTrigger className={inputClass} data-testid="select-business-type">
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
                  <Textarea className={`${textareaClass} min-h-[120px]`} placeholder="Describe the core business activity of your company, including principal commodities traded, geographic focus, and supply chain position." value={form.coreBusinessDescription} onChange={(e) => update("coreBusinessDescription", e.target.value)} data-testid="input-business-description" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 2 && (
            <div data-testid="kyc-section-2">
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
                    <div key={idx} className="p-4 border border-border bg-muted/20 space-y-3" data-testid={`ubo-box-${idx + 1}`}>
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                          UBO {idx + 1} {idx === 0 && <span className="text-destructive">*</span>}
                        </h4>
                        {idx > 0 && (
                          <button type="button" onClick={removeUbo} className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1" data-testid={`btn-remove-ubo-${idx + 1}`}>
                            <Trash2 className="h-3 w-3" /> Remove
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Full Name {idx === 0 && "*"}</Label>
                          <Input className={inputClass} placeholder="Full name" value={uName} onChange={(e) => updateUbo(0, e.target.value)} data-testid={`input-ubo-${idx + 1}-name`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Date of Birth {idx === 0 && "*"}</Label>
                          <Input className={inputClass} placeholder="DD/MM/YYYY" value={uDob} onChange={(e) => updateUbo(1, e.target.value)} data-testid={`input-ubo-${idx + 1}-dob`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Nationality {idx === 0 && "*"}</Label>
                          <Input className={inputClass} placeholder="Nationality" value={uNat} onChange={(e) => updateUbo(2, e.target.value)} data-testid={`input-ubo-${idx + 1}-nationality`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Passport No. {idx === 0 && "*"}</Label>
                          <Input className={inputClass} placeholder="Passport number" value={uPassport} onChange={(e) => updateUbo(3, e.target.value)} data-testid={`input-ubo-${idx + 1}-passport`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Percentage Held {idx === 0 && "*"}</Label>
                          <Input className={inputClass} placeholder="e.g. 25%" value={uPercent} onChange={(e) => updateUbo(4, e.target.value)} data-testid={`input-ubo-${idx + 1}-percent`} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button type="button" onClick={() => { const current = form.ultimateBeneficialOwners ? form.ultimateBeneficialOwners.split("\n").filter(Boolean) : []; current.push(" —  —  —  — "); update("ultimateBeneficialOwners", current.join("\n")); }} className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 border border-dashed border-primary/40 rounded px-4 py-2 w-full justify-center" data-testid="btn-add-ubo">
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
                    <div key={idx} className="p-4 border border-border bg-muted/20 space-y-3" data-testid={`shareholder-box-${idx + 1}`}>
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                          Shareholder {idx + 1} {idx === 0 && <span className="text-destructive">*</span>}
                        </h4>
                        {idx > 0 && (
                          <button type="button" onClick={removeShareholder} className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1" data-testid={`btn-remove-shareholder-${idx + 1}`}>
                            <Trash2 className="h-3 w-3" /> Remove
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Name {idx === 0 && "*"}</Label>
                          <Input className={inputClass} placeholder="Full name or entity" value={sName} onChange={(e) => updateShareholder(0, e.target.value)} data-testid={`input-shareholder-${idx + 1}-name`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Nationality {idx === 0 && "*"}</Label>
                          <Input className={inputClass} placeholder="Nationality" value={sNat} onChange={(e) => updateShareholder(1, e.target.value)} data-testid={`input-shareholder-${idx + 1}-nationality`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Percentage Held {idx === 0 && "*"}</Label>
                          <Input className={inputClass} placeholder="e.g. 25%" value={sPercent} onChange={(e) => updateShareholder(2, e.target.value)} data-testid={`input-shareholder-${idx + 1}-percent`} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button type="button" onClick={() => { const current = form.shareholders ? form.shareholders.split("\n").filter(Boolean) : []; current.push(" —  — "); update("shareholders", current.join("\n")); }} className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 border border-dashed border-primary/40 rounded px-4 py-2 w-full justify-center" data-testid="btn-add-shareholder">
                  <Plus className="h-4 w-4" /> Add Another Shareholder
                </button>
              </div>
            </div>
          )}

          {activeTab === 3 && (
            <div data-testid="kyc-section-3">
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
                                <Input className={inputClass} placeholder="Full name" value={dName} onChange={(e) => updateDirector(0, e.target.value)} data-testid={`input-director-${idx + 1}-name`} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Nationality {idx === 0 && "*"}</Label>
                                <Input className={inputClass} placeholder="Nationality" value={dNat} onChange={(e) => updateDirector(1, e.target.value)} data-testid={`input-director-${idx + 1}-nationality`} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Date of Birth {idx === 0 && "*"}</Label>
                                <Input className={inputClass} placeholder="DD/MM/YYYY" value={dDob} onChange={(e) => updateDirector(2, e.target.value)} data-testid={`input-director-${idx + 1}-dob`} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Position {idx === 0 && "*"}</Label>
                                <Input className={inputClass} placeholder="e.g. Managing Director" value={dPos} onChange={(e) => updateDirector(3, e.target.value)} data-testid={`input-director-${idx + 1}-position`} />
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
                  <Textarea className={textareaClass} placeholder="List subsidiaries with country of incorporation" value={form.subsidiaries} onChange={(e) => update("subsidiaries", e.target.value)} data-testid="input-subsidiaries" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Stock Exchange Listing (if applicable)</Label>
                  <Input className={inputClass} placeholder="Exchange name and ticker symbol" value={form.listingInfo} onChange={(e) => update("listingInfo", e.target.value)} data-testid="input-listing" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 4 && (
            <div data-testid="kyc-section-4">
              <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" /> 5. Financial Information
              </h3>
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className={labelClass}>Indicative Capital Range *</Label>
                  <Select value={form.capitalRange} onValueChange={(v) => update("capitalRange", v)}>
                    <SelectTrigger className={inputClass} data-testid="select-capital-range">
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
                    <SelectTrigger className={inputClass} data-testid="select-financial-currency">
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
                  <Input className={inputClass} placeholder="Issued share capital" value={form.shareCapital} onChange={(e) => update("shareCapital", e.target.value)} data-testid="input-share-capital" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Sales Revenue (Last FY)</Label>
                  <Input className={inputClass} placeholder="Annual revenue" value={form.salesRevenue} onChange={(e) => update("salesRevenue", e.target.value)} data-testid="input-sales-revenue" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Net Income (Last FY)</Label>
                  <Input className={inputClass} placeholder="Net income / profit" value={form.netIncome} onChange={(e) => update("netIncome", e.target.value)} data-testid="input-net-income" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Total Equity</Label>
                  <Input className={inputClass} placeholder="Total shareholders' equity" value={form.totalEquity} onChange={(e) => update("totalEquity", e.target.value)} data-testid="input-total-equity" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Total Balance Sheet</Label>
                  <Input className={inputClass} placeholder="Total assets" value={form.totalBalanceSheet} onChange={(e) => update("totalBalanceSheet", e.target.value)} data-testid="input-balance-sheet" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Last Reporting Period</Label>
                  <Input className={inputClass} placeholder="e.g. FY 2024" value={form.lastReportingPeriod} onChange={(e) => update("lastReportingPeriod", e.target.value)} data-testid="input-reporting-period" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className={labelClass}>External Auditors</Label>
                  <Input className={inputClass} placeholder="Name of external audit firm" value={form.externalAuditors} onChange={(e) => update("externalAuditors", e.target.value)} data-testid="input-auditors" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 5 && (
            <div data-testid="kyc-section-5">
              <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" /> 6. Primary Banking Information
              </h3>
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 md:col-span-2">
                  <Label className={labelClass}>Bank Name *</Label>
                  <Input className={inputClass} placeholder="Full name of bank" value={form.bankName} onChange={(e) => update("bankName", e.target.value)} data-testid="input-bank-name" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Branch</Label>
                  <Input className={inputClass} placeholder="Branch name" value={form.bankBranch} onChange={(e) => update("bankBranch", e.target.value)} data-testid="input-bank-branch" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Bank Address *</Label>
                  <Input className={inputClass} placeholder="Full bank address" value={form.bankAddress} onChange={(e) => update("bankAddress", e.target.value)} data-testid="input-bank-address" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Account Name *</Label>
                  <Input className={inputClass} placeholder="Name on account" value={form.accountName} onChange={(e) => update("accountName", e.target.value)} data-testid="input-account-name" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Account Number / IBAN *</Label>
                  <Input className={inputClass} placeholder="Account number or IBAN" value={form.accountNumber} onChange={(e) => update("accountNumber", e.target.value)} data-testid="input-account-number" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Swift Code *</Label>
                  <Input className={inputClass} placeholder="SWIFT / BIC code" value={form.swiftCode} onChange={(e) => update("swiftCode", e.target.value)} data-testid="input-swift-code" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Bank Account / Currency</Label>
                  <Select value={form.bankAccountCurrency} onValueChange={(v) => update("bankAccountCurrency", v)}>
                    <SelectTrigger className={inputClass} data-testid="select-bank-currency">
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
                  <Input className={inputClass} placeholder="Full name of bank officer" value={form.bankOfficerName} onChange={(e) => update("bankOfficerName", e.target.value)} data-testid="input-bank-officer-name" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Bank Officer Email *</Label>
                  <Input className={inputClass} type="email" placeholder="Bank officer email address" value={form.bankOfficerEmail} onChange={(e) => update("bankOfficerEmail", e.target.value)} data-testid="input-bank-officer-email" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 6 && (
            <div data-testid="kyc-section-6">
              <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> 7. Human Resources
              </h3>
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className={labelClass}>No. of Employees (Company)</Label>
                  <Input className={inputClass} placeholder="Number of employees" value={form.employeesCompany} onChange={(e) => update("employeesCompany", e.target.value)} data-testid="input-employees-company" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>No. of Employees (Group)</Label>
                  <Input className={inputClass} placeholder="Group-wide employee count" value={form.employeesGroup} onChange={(e) => update("employeesGroup", e.target.value)} data-testid="input-employees-group" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className={labelClass}>Previous Bullfrog Group Employee? *</Label>
                  <Select value={form.previousBullfrogEmployee} onValueChange={(v) => update("previousBullfrogEmployee", v)}>
                    <SelectTrigger className={inputClass} data-testid="select-previous-employee">
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
            <div data-testid="kyc-section-7">
              <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" /> 8. Compliance Questionnaire
              </h3>
              <div className="mt-6 space-y-6">
                <div className="space-y-2">
                  <Label className={labelClass}>Is your company subject to AML/CFT regulations? *</Label>
                  <Select value={form.amlSubject} onValueChange={(v) => update("amlSubject", v)}>
                    <SelectTrigger className={inputClass} data-testid="select-aml-subject">
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
                    <SelectTrigger className={inputClass} data-testid="select-aml-conformity">
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
                  <Input className={inputClass} placeholder="Regulatory authority name" value={form.amlRegulator} onChange={(e) => update("amlRegulator", e.target.value)} data-testid="input-aml-regulator" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Applicable AML/CFT Law Name *</Label>
                  <Input className={inputClass} placeholder="Name of applicable law / regulation" value={form.amlLawName} onChange={(e) => update("amlLawName", e.target.value)} data-testid="input-aml-law" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 8 && (
            <div data-testid="kyc-section-8">
              <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> 9. Documents Required
              </h3>
              <div className="mt-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload the following documents to complete KYC verification. Accepted formats: PDF, JPG, PNG, DOC, DOCX, XLS, XLSX (max 10MB each).
                </p>
                <div className="space-y-3">
                  {kycDocList.map((docDef) => {
                    const uploaded = kycDocs?.filter((d) => d.documentType === docDef.type && uploadedDocIds.includes(d.id)) || [];
                    const isUploading = uploadingType === docDef.type;
                    return (
                      <div key={docDef.type} className="rounded-lg border border-border bg-muted/30 overflow-hidden" data-testid={`kyc-doc-row-${docDef.type}`}>
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
                              data-testid={`input-file-${docDef.type}`}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant={uploaded.length > 0 ? "outline" : "default"}
                              disabled={isUploading}
                              onClick={() => fileInputRefs.current[docDef.type]?.click()}
                              data-testid={`btn-upload-${docDef.type}`}
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
                            {uploaded.map((file) => (
                              <div key={file.id} className="flex items-center justify-between text-xs gap-2" data-testid={`kyc-file-${file.id}`}>
                                <span className="text-muted-foreground truncate flex-1">{file.originalName} <span className="text-muted-foreground/60">({(file.size / 1024).toFixed(0)} KB)</span></span>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => window.open(`/api/kyc-documents/${file.id}/download`, "_blank")}
                                    data-testid={`btn-download-${file.id}`}
                                  >
                                    <Download className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                    onClick={() => deleteDoc.mutate(file.id)}
                                    disabled={deleteDoc.isPending}
                                    data-testid={`btn-delete-${file.id}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
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
                  <Textarea className={`${textareaClass} min-h-[100px]`} placeholder="Provide any notes regarding document submission, courier details, or digital upload references." value={form.documentReasons} onChange={(e) => update("documentReasons", e.target.value)} data-testid="input-document-notes" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 9 && (
            <div data-testid="kyc-section-9">
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
                    <Input className={inputClass} placeholder="Full name of signatory" value={form.signatoryName} onChange={(e) => update("signatoryName", e.target.value)} data-testid="input-signatory-name" />
                  </div>
                  <div className="space-y-2">
                    <Label className={labelClass}>Title *</Label>
                    <Input className={inputClass} placeholder="e.g. Managing Director" value={form.signatoryTitle} onChange={(e) => update("signatoryTitle", e.target.value)} data-testid="input-signatory-title" />
                  </div>
                  <div className="space-y-2">
                    <Label className={labelClass}>Company Name *</Label>
                    <Input className={inputClass} placeholder="Company name" value={form.signatoryCompany} onChange={(e) => update("signatoryCompany", e.target.value)} data-testid="input-signatory-company" />
                  </div>
                  <div className="space-y-2">
                    <Label className={labelClass}>Email *</Label>
                    <Input className={inputClass} type="email" placeholder="signatory@company.com" value={form.signatoryEmail} onChange={(e) => update("signatoryEmail", e.target.value)} data-testid="input-signatory-email" />
                  </div>
                  <div className="space-y-2">
                    <Label className={labelClass}>Place & Date *</Label>
                    <Input className={inputClass} placeholder="e.g. Dubai, 15/03/2025" value={form.signatoryPlaceDate} onChange={(e) => update("signatoryPlaceDate", e.target.value)} data-testid="input-signatory-place-date" />
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-border">
                  <h4 className="text-sm font-bold text-primary mb-4">Form Filled By</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className={labelClass}>Name</Label>
                      <Input className={inputClass} placeholder="Name of person filling this form" value={form.filledByName} onChange={(e) => update("filledByName", e.target.value)} data-testid="input-filled-by-name" />
                    </div>
                    <div className="space-y-2">
                      <Label className={labelClass}>Email</Label>
                      <Input className={inputClass} type="email" placeholder="email@company.com" value={form.filledByEmail} onChange={(e) => update("filledByEmail", e.target.value)} data-testid="input-filled-by-email" />
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
              data-testid="btn-prev-section"
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
                data-testid="btn-next-section"
              >
                Next Section
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPreview(true)}
                  data-testid="button-preview-kyc"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Preview
                </Button>
                <Button
                  type="submit"
                  disabled={submitKyc.isPending}
                  data-testid="button-submit-kyc"
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
                    ...kycDocList.filter(d => (kycDocs?.filter(doc => doc.documentType === d.type && uploadedDocIds.includes(doc.id)) || []).length > 0).map(d => [d.label, (kycDocs?.filter(doc => doc.documentType === d.type && uploadedDocIds.includes(doc.id)) || []).map(doc => doc.originalName).join(", ")]),
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
                  <Button variant="outline" onClick={() => setShowPreview(false)} data-testid="button-preview-close">
                    Back to Edit
                  </Button>
                  <Button onClick={() => { setShowPreview(false); handleSubmit({ preventDefault: () => {} } as React.FormEvent); }} disabled={submitKyc.isPending} data-testid="button-preview-submit">
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
  );
}
