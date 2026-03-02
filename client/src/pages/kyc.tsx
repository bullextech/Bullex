import { useState } from "react";
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
  Globe,
  Phone,
  Mail,
  CheckCircle2,
  Clock,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { KycApplication } from "@shared/schema";

const steps = [
  { num: 1, title: "Company Details" },
  { num: 2, title: "Business Activity" },
  { num: 3, title: "Contact & Signatory" },
];

export default function KYC() {
  const [currentStep, setCurrentStep] = useState(1);
  const { toast } = useToast();

  const [form, setForm] = useState({
    companyName: "",
    registeredAddress: "",
    businessAddress: "",
    contactPerson: "",
    contactTitle: "",
    phone: "",
    fax: "",
    email: "",
    website: "",
    dateOfIncorporation: "",
    countryOfIncorporation: "",
    countryOfOperation: "",
    businessRegNumber: "",
    taxId: "",
    businessType: "",
    businessDescription: "",
  });

  const { data: kycs, isLoading } = useQuery<KycApplication[]>({
    queryKey: ["/api/kyc"],
  });

  const submitKyc = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/kyc", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kyc"] });
      toast({
        title: "KYC Application Submitted",
        description: "Your Know Your Client application has been submitted for review.",
      });
      setForm({
        companyName: "",
        registeredAddress: "",
        businessAddress: "",
        contactPerson: "",
        contactTitle: "",
        phone: "",
        fax: "",
        email: "",
        website: "",
        dateOfIncorporation: "",
        countryOfIncorporation: "",
        countryOfOperation: "",
        businessRegNumber: "",
        taxId: "",
        businessType: "",
        businessDescription: "",
      });
      setCurrentStep(1);
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!form.companyName || !form.registeredAddress || !form.contactPerson ||
        !form.contactTitle || !form.phone || !form.email ||
        !form.dateOfIncorporation || !form.countryOfIncorporation || !form.businessRegNumber) {
      toast({
        title: "Missing Required Fields",
        description: "Please complete all mandatory fields marked with *",
        variant: "destructive",
      });
      return;
    }
    submitKyc.mutate(form);
  };

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-kyc-title">
          Know Your Client (KYC)
        </h1>
        <p className="text-sm text-muted-foreground">
          Complete KYC onboarding to initiate trade through Bullex
        </p>
      </div>

      {kycs && kycs.length > 0 && (
        <Card data-testid="card-kyc-list">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Previous Applications</CardTitle>
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
                      {kyc.countryOfIncorporation} &middot; {kyc.email}
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

      <Card data-testid="card-kyc-form">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-primary" />
            New KYC Application
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-6">
            {steps.map((step, i) => (
              <div key={step.num} className="flex items-center gap-2 flex-1">
                <button
                  onClick={() => setCurrentStep(step.num)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    currentStep === step.num
                      ? "bg-primary text-primary-foreground"
                      : currentStep > step.num
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                  data-testid={`button-step-${step.num}`}
                >
                  {currentStep > step.num ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    step.num
                  )}
                </button>
                <span className="text-xs font-medium hidden sm:inline">{step.title}</span>
                {i < steps.length - 1 && (
                  <div className="flex-1 h-px bg-border" />
                )}
              </div>
            ))}
          </div>

          {currentStep === 1 && (
            <div className="space-y-4" data-testid="step-1-content">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Full Legal Name *</Label>
                  <Input
                    placeholder="Company legal name"
                    value={form.companyName}
                    onChange={(e) => update("companyName", e.target.value)}
                    data-testid="input-company-name"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Registered Address *</Label>
                  <Textarea
                    placeholder="Full registered address"
                    value={form.registeredAddress}
                    onChange={(e) => update("registeredAddress", e.target.value)}
                    className="resize-none"
                    data-testid="input-registered-address"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Business Address (if different)</Label>
                  <Textarea
                    placeholder="Primary business address"
                    value={form.businessAddress}
                    onChange={(e) => update("businessAddress", e.target.value)}
                    className="resize-none"
                    data-testid="input-business-address"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date of Incorporation *</Label>
                  <Input
                    placeholder="DD/MM/YYYY"
                    value={form.dateOfIncorporation}
                    onChange={(e) => update("dateOfIncorporation", e.target.value)}
                    data-testid="input-incorporation-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Country of Incorporation *</Label>
                  <Input
                    placeholder="e.g., United Arab Emirates"
                    value={form.countryOfIncorporation}
                    onChange={(e) => update("countryOfIncorporation", e.target.value)}
                    data-testid="input-country-incorporation"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Country of Operation</Label>
                  <Input
                    placeholder="Country of primary operations"
                    value={form.countryOfOperation}
                    onChange={(e) => update("countryOfOperation", e.target.value)}
                    data-testid="input-country-operation"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Business Registration Number *</Label>
                  <Input
                    placeholder="Registration number"
                    value={form.businessRegNumber}
                    onChange={(e) => update("businessRegNumber", e.target.value)}
                    data-testid="input-reg-number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tax Identification Number</Label>
                  <Input
                    placeholder="Tax ID"
                    value={form.taxId}
                    onChange={(e) => update("taxId", e.target.value)}
                    data-testid="input-tax-id"
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4" data-testid="step-2-content">
              <div className="space-y-2">
                <Label>Type of Business</Label>
                <Select
                  value={form.businessType}
                  onValueChange={(v) => update("businessType", v)}
                >
                  <SelectTrigger data-testid="select-business-type">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Trader">Trader</SelectItem>
                    <SelectItem value="Dealer">Dealer</SelectItem>
                    <SelectItem value="Collector">Collector</SelectItem>
                    <SelectItem value="Manufacturer">Manufacturer</SelectItem>
                    <SelectItem value="Refiner">Refiner</SelectItem>
                    <SelectItem value="Broker">Broker</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description of Core Business Activity</Label>
                <Textarea
                  placeholder="Describe the core business activity of your company"
                  value={form.businessDescription}
                  onChange={(e) => update("businessDescription", e.target.value)}
                  className="resize-none min-h-[120px]"
                  data-testid="input-business-description"
                />
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4" data-testid="step-3-content">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contact Person *</Label>
                  <div className="relative">
                    <UserCheck className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Full name"
                      value={form.contactPerson}
                      onChange={(e) => update("contactPerson", e.target.value)}
                      data-testid="input-contact-person"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Corporate Title / Role *</Label>
                  <Input
                    placeholder="e.g., Managing Director"
                    value={form.contactTitle}
                    onChange={(e) => update("contactTitle", e.target.value)}
                    data-testid="input-contact-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number *</Label>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="+971 XX XXX XXXX"
                      value={form.phone}
                      onChange={(e) => update("phone", e.target.value)}
                      data-testid="input-phone"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Fax Number</Label>
                  <Input
                    placeholder="Fax number"
                    value={form.fax}
                    onChange={(e) => update("fax", e.target.value)}
                    data-testid="input-fax"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email Address *</Label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      type="email"
                      placeholder="contact@company.com"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                      data-testid="input-email"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <div className="relative">
                    <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="https://company.com"
                      value={form.website}
                      onChange={(e) => update("website", e.target.value)}
                      data-testid="input-website"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <Button
              variant="secondary"
              onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
              disabled={currentStep === 1}
              data-testid="button-prev-step"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Previous
            </Button>
            {currentStep < 3 ? (
              <Button
                onClick={() => setCurrentStep(currentStep + 1)}
                data-testid="button-next-step"
              >
                Next Section
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={submitKyc.isPending}
                data-testid="button-submit-kyc"
              >
                {submitKyc.isPending ? "Submitting..." : "Submit KYC Application"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
