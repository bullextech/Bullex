import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { KycApplication, KycDocument } from "@shared/schema";

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
  signatoryPlaceDate: "",
};

export default function KYC() {
  const [activeTab, setActiveTab] = useState(0);
  const { toast } = useToast();
  const [form, setForm] = useState({ ...emptyForm });
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [uploadedDocIds, setUploadedDocIds] = useState<string[]>([]);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: kycs, isLoading } = useQuery<KycApplication[]>({
    queryKey: ["/api/kyc"],
  });

  const { data: kycDocs } = useQuery<KycDocument[]>({
    queryKey: ["/api/kyc-documents"],
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
        !form.dateOfIncorporation || !form.countryOfIncorporation || !form.registrationNumber) {
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
                <Badge
                  variant={kyc.status === "approved" ? "default" : "secondary"}
                  className="text-[10px] capitalize"
                >
                  {kyc.status === "approved" && <CheckCircle2 className="w-3 h-3 mr-0.5" />}
                  {kyc.status === "pending" && <Clock className="w-3 h-3 mr-0.5" />}
                  {kyc.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
                  <Label className={labelClass}>Ultimate Beneficial Owner(s)</Label>
                  <p className="text-xs text-muted-foreground">Please provide details of all individuals who hold directly or indirectly more than 10% of the company's shares or voting rights.</p>
                  <Textarea className={`${textareaClass} min-h-[120px]`} placeholder="Name, Date of Birth, Nationality, Passport No., Percentage held — one per line" value={form.ultimateBeneficialOwners} onChange={(e) => update("ultimateBeneficialOwners", e.target.value)} data-testid="input-beneficial-owners" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Shareholders (Direct & Indirect)</Label>
                  <Textarea className={`${textareaClass} min-h-[100px]`} placeholder="List all shareholders with name, nationality, and percentage held" value={form.shareholders} onChange={(e) => update("shareholders", e.target.value)} data-testid="input-shareholders" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 3 && (
            <div data-testid="kyc-section-3">
              <h3 className="text-base font-bold text-primary border-b border-border pb-2 flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> 4. Management Structure
              </h3>
              <div className="mt-6 space-y-6">
                <div className="space-y-2">
                  <Label className={labelClass}>Directors / Senior Management</Label>
                  <p className="text-xs text-muted-foreground">List all directors and senior officers with their full name, nationality, date of birth, and position.</p>
                  <Textarea className={`${textareaClass} min-h-[120px]`} placeholder="Full Name — Nationality — DOB — Position (one per line)" value={form.managementStructure} onChange={(e) => update("managementStructure", e.target.value)} data-testid="input-management" />
                </div>
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
                  <Label className={labelClass}>Previous Bullfrog Group Employee?</Label>
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
                  <Label className={labelClass}>Is your company subject to AML/CFT regulations?</Label>
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
                  <Label className={labelClass}>Does your company have an AML/CFT conformity program?</Label>
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
                  <Label className={labelClass}>Name of AML/CFT Regulator</Label>
                  <Input className={inputClass} placeholder="Regulatory authority name" value={form.amlRegulator} onChange={(e) => update("amlRegulator", e.target.value)} data-testid="input-aml-regulator" />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Applicable AML/CFT Law Name</Label>
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
                    <Label className={labelClass}>Company Name</Label>
                    <Input className={inputClass} placeholder="Company name" value={form.signatoryCompany} onChange={(e) => update("signatoryCompany", e.target.value)} data-testid="input-signatory-company" />
                  </div>
                  <div className="space-y-2">
                    <Label className={labelClass}>Place & Date *</Label>
                    <Input className={inputClass} placeholder="e.g. Dubai, 15/03/2025" value={form.signatoryPlaceDate} onChange={(e) => update("signatoryPlaceDate", e.target.value)} data-testid="input-signatory-place-date" />
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
                onClick={() => setActiveTab(activeTab + 1)}
                data-testid="btn-next-section"
              >
                Next Section
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={submitKyc.isPending}
                data-testid="button-submit-kyc"
              >
                <UserCheck className="w-4 h-4 mr-2" />
                {submitKyc.isPending ? "Submitting..." : "Submit KYC Application"}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
