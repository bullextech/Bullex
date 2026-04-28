import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import {
  UserCheck,
  FileText,
  Link2,
  FolderOpen,
  Layers,
  ArrowRight,
  Shield,
  Coins,
  Copy,
  Check,
  ExternalLink,
  Share2,
  Building2,
  MapPin,
  Globe,
  Mail,
  Phone,
  Users,
  CheckCircle2,
  Calendar,
  Download,
  FileCheck,
  Edit,
  ShieldCheck,
  LogIn,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { KycApplication, KycDocument } from "@shared/schema";

const platformFeatures = [
  {
    icon: UserCheck,
    title: "KYC Registration",
    description:
      "Comprehensive 10-section institutional Know Your Customer onboarding — covering company details, beneficial ownership, compliance questionnaires, banking information, and authorized signatory verification.",
    link: "/kyc",
    linkText: "Start KYC",
  },
  {
    icon: FileText,
    title: "Document Generator",
    description:
      "Generate trade documents instantly — Deal Recap, FCO, ICPO, SPA, LOI, POP, POF, and BCL — all linked to verified trades with blockchain-backed integrity and full audit trails.",
    link: "/documents",
    linkText: "Generate Documents",
  },
  {
    icon: Link2,
    title: "Blockchain Trading",
    description:
      "Execute commodity trades across five divisions with automatic blockchain mining. Each trade is recorded via SHA-256 proof-of-work consensus for tamper-proof verification.",
    link: "/trading",
    linkText: "Execute Trade",
  },
  {
    icon: FolderOpen,
    title: "Document Vault",
    description:
      "Centralized, secure storage for all trade documentation — organized by type and trade reference, with blockchain hash verification for every uploaded document.",
    link: "/vault",
    linkText: "Open Vault",
  },
  {
    icon: Layers,
    title: "Blockchain Ledger",
    description:
      "Full block explorer with transaction drill-down, chain integrity validation, and cryptographic hash verification — providing complete transparency across all trades.",
    link: "/blockchain",
    linkText: "View Ledger",
  },
  {
    icon: Coins,
    title: "Tokenisation",
    description:
      "Browse the full BFG-20 token registry — 12 commodity-backed tokens across five divisions with 1:1 physical backing, tokenomics, and revenue model details.",
    link: "/tokenization",
    linkText: "Token Registry",
  },
];

export default function Platform() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<KycApplication | null>(null);
  const [editingParticipant, setEditingParticipant] = useState<KycApplication | null>(null);
  const [changeFields, setChangeFields] = useState<Record<string, string>>({});
  const [changeReason, setChangeReason] = useState("");
  const { data: applications, isLoading: participantsLoading } = useQuery<KycApplication[]>({
    queryKey: ["/api/kyc"],
  });
  const submitChangeRequest = useMutation({
    mutationFn: async (data: { kycId: string; changedFields: Record<string, string>; reason: string }) => {
      const res = await apiRequest("POST", `/api/kyc/${data.kycId}/change-request`, {
        changedFields: data.changedFields,
        reason: data.reason,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Change request submitted", description: "The change request has been submitted for review." });
      setEditingParticipant(null);
      setChangeFields({});
      setChangeReason("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit change request.", variant: "destructive" });
    },
  });
  const { data: participantDocs } = useQuery<KycDocument[]>({
    queryKey: ["/api/kyc", selectedParticipant?.id, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/kyc/${selectedParticipant!.id}/documents`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    enabled: !!selectedParticipant,
  });
  const approved = applications?.filter((a) => a.status === "approved") || [];

  const kycLink = `${window.location.origin}/kyc-register`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(kycLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = kycLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Bullex KYC Registration",
          text: "Complete your KYC registration on the Bullex platform",
          url: kycLink,
        });
      } catch {}
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="overflow-y-auto h-full">
      <div className="bg-primary text-primary-foreground py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-3xl">
            <Badge
              variant="secondary"
              className="text-[10px] uppercase tracking-widest bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 mb-4"
            >
              Bullex Trading Platform
            </Badge>
            <h1
              className="text-3xl md:text-4xl font-bold mb-4 tracking-tight"
              data-testid="text-platform-title"
            >
              Platform Tools
            </h1>
            <div className="w-20 h-1 bg-primary-foreground/40 mb-6" />
            <p className="text-lg text-primary-foreground/80 font-light leading-relaxed">
              Access the full suite of Bullex trading tools — from client onboarding
              and trade execution to document management and blockchain verification.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-card border-b border-border py-6 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <ExternalLink className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Client KYC Registration Link</p>
                <p className="text-[10px] text-muted-foreground">Share this link with clients to begin onboarding</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0 w-full sm:w-auto">
              <div className="flex-1 min-w-0 px-3 py-2 rounded-md bg-muted border border-border text-sm font-mono text-muted-foreground truncate" data-testid="text-kyc-link">
                {kycLink}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="flex-shrink-0"
                data-testid="button-copy-kyc-link"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1.5 text-green-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copy
                  </>
                )}
              </Button>
              <Button
                size="sm"
                onClick={handleShareLink}
                className="flex-shrink-0"
                data-testid="button-share-kyc-link"
              >
                <Share2 className="w-3.5 h-3.5 mr-1.5" />
                Share Link
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="py-10 px-6 border-b border-border">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <LogIn className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Portal Access</h2>
              <p className="text-xs text-muted-foreground">Admin management and client self-service portals</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Link href="/kyc-admin">
              <Card className="border hover:border-primary/40 transition-all group cursor-pointer hover:shadow-md" data-testid="card-portal-admin">
                <CardContent className="p-6 flex items-start gap-5">
                  <div className="w-12 h-12 rounded-md bg-primary flex items-center justify-center flex-shrink-0 group-hover:bg-primary/90 transition-colors">
                    <ShieldCheck className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-base font-bold">Admin Portal</h3>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Review and approve KYC applications, manage trades, generate documents, and oversee platform operations.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {["KYC Review", "Trade Management", "Document Generation", "Vault"].map((tag) => (
                        <span key={tag} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{tag}</span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/client-portal">
              <Card className="border hover:border-primary/40 transition-all group cursor-pointer hover:shadow-md" data-testid="card-portal-client">
                <CardContent className="p-6 flex items-start gap-5">
                  <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                    <Building2 className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-base font-bold">Client Portal</h3>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Client self-service portal — view assigned trades, review and accept documents, and track transaction progress.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {["Trade Documents", "Accept / Amend", "Document History", "Notifications"].map((tag) => (
                        <span key={tag} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{tag}</span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </div>

      <div className="py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {platformFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={feature.title}
                  className="border hover:border-primary/30 transition-colors group"
                  data-testid={`card-platform-${feature.title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-1">
                      {feature.description}
                    </p>
                    <Link href={feature.link}>
                      <Button variant="outline" size="sm" className="w-full" data-testid={`button-platform-${feature.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        {feature.linkText}
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-muted/30 border-t border-border py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight" data-testid="text-participants-heading">
                Approved Participants
              </h2>
              <p className="text-xs text-muted-foreground">
                KYC-verified entities approved to trade on the platform
              </p>
            </div>
            <Badge variant="secondary" className="ml-auto text-xs">
              {approved.length} Approved
            </Badge>
          </div>

          {participantsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[200px] rounded-md" />
              ))}
            </div>
          ) : approved.length === 0 ? (
            <Card className="border">
              <CardContent className="p-10 text-center">
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mx-auto mb-3">
                  <Users className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-semibold mb-1" data-testid="text-no-participants">No Approved Participants Yet</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Participants will appear here once their KYC applications have been reviewed and approved.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {approved.map((participant) => (
                <Card
                  key={participant.id}
                  className="border hover:border-primary/30 transition-colors"
                  data-testid={`card-participant-${participant.id}`}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="secondary" className="text-[9px] uppercase tracking-wider bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Approved
                        </Badge>
                        {participant.blockchainHash && (
                          <Badge variant="secondary" className="text-[9px] uppercase tracking-wider bg-primary/10 text-primary border-primary/20" data-testid={`badge-blockchain-${participant.id}`}>
                            <Shield className="w-3 h-3 mr-1" />
                            Blockchain Verified
                          </Badge>
                        )}
                      </div>
                    </div>

                    <h3
                      className="text-sm font-bold mb-1 cursor-pointer hover:text-primary transition-colors"
                      onClick={() => setSelectedParticipant(participant)}
                      data-testid={`text-participant-name-${participant.id}`}
                    >
                      {participant.companyName}
                    </h3>

                    <div className="flex items-center gap-2 flex-wrap">
                      {participant.businessType && (
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          {participant.businessType}
                        </p>
                      )}
                      {participant.category && (
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider" data-testid={`badge-category-${participant.id}`}>
                          {participant.category}
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-2 mt-3 pt-3 border-t border-border">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">
                          {participant.countryOfIncorporation}
                        </span>
                      </div>

                      {participant.countryOfOperation && participant.countryOfOperation !== participant.countryOfIncorporation && (
                        <div className="flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs text-muted-foreground truncate">
                            Operations: {participant.countryOfOperation}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">
                          {participant.contactEmail}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">
                          {participant.contactPhone}
                        </span>
                      </div>

                      {participant.dateOfIncorporation && (
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs text-muted-foreground truncate">
                            Inc. {participant.dateOfIncorporation}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        <span className="text-[10px] text-primary font-medium uppercase tracking-wider">
                          KYC Verified
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[10px] text-muted-foreground hover:text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingParticipant(participant);
                          setChangeFields({});
                          setChangeReason("");
                        }}
                        data-testid={`button-request-changes-${participant.id}`}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Request Changes
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!selectedParticipant} onOpenChange={() => setSelectedParticipant(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" aria-describedby={undefined} data-testid="dialog-participant-details">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg" data-testid="text-dialog-participant-name">
                  {selectedParticipant?.companyName}
                </DialogTitle>
                {selectedParticipant?.businessType && (
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">
                    {selectedParticipant.businessType}
                  </p>
                )}
              </div>
              <Badge variant="secondary" className="ml-auto text-[9px] uppercase tracking-wider bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Approved
              </Badge>
            </div>
          </DialogHeader>

          {selectedParticipant && (
            <div className="space-y-6 mt-4">
              <DetailSection title="Company Information">
                <DetailRow label="Category" value={selectedParticipant.category} />
                <DetailRow label="Company Name" value={selectedParticipant.companyName} />
                <DetailRow label="Registered Address" value={selectedParticipant.registeredAddress} />
                <DetailRow label="Primary Business Address" value={selectedParticipant.primaryBusinessAddress} />
                <DetailRow label="Date of Incorporation" value={selectedParticipant.dateOfIncorporation} />
                <DetailRow label="Country of Incorporation" value={selectedParticipant.countryOfIncorporation} />
                <DetailRow label="Country of Operation" value={selectedParticipant.countryOfOperation} />
                <DetailRow label="Registration Number" value={selectedParticipant.registrationNumber} />
                <DetailRow label="Tax ID Number" value={selectedParticipant.taxIdNumber} />
                <DetailRow label="Business Type" value={selectedParticipant.businessType} />
                <DetailRow label="Core Business Description" value={selectedParticipant.coreBusinessDescription} />
              </DetailSection>

              <DetailSection title="Ownership & Structure">
                <DetailRow label="Ultimate Beneficial Owners" value={selectedParticipant.ultimateBeneficialOwners} />
                <DetailRow label="Shareholders" value={selectedParticipant.shareholders} />
                <DetailRow label="Management Structure" value={selectedParticipant.managementStructure} />
                <DetailRow label="Subsidiaries" value={selectedParticipant.subsidiaries} />
                <DetailRow label="Listing Information" value={selectedParticipant.listingInfo} />
                <DetailRow label="Share Capital" value={selectedParticipant.shareCapital} />
              </DetailSection>

              <DetailSection title="Financial Information">
                <DetailRow label="Capital Range" value={selectedParticipant.capitalRange} />
                <DetailRow label="Financial Currency" value={selectedParticipant.financialCurrency} />
                <DetailRow label="Sales Revenue" value={selectedParticipant.salesRevenue} />
                <DetailRow label="Net Income" value={selectedParticipant.netIncome} />
                <DetailRow label="Total Equity" value={selectedParticipant.totalEquity} />
                <DetailRow label="Total Balance Sheet" value={selectedParticipant.totalBalanceSheet} />
                <DetailRow label="Last Reporting Period" value={selectedParticipant.lastReportingPeriod} />
                <DetailRow label="External Auditors" value={selectedParticipant.externalAuditors} />
              </DetailSection>

              <DetailSection title="Banking Details">
                <DetailRow label="Bank Name" value={selectedParticipant.bankName} />
                <DetailRow label="Bank Branch" value={selectedParticipant.bankBranch} />
                <DetailRow label="Bank Address" value={selectedParticipant.bankAddress} />
                <DetailRow label="Account Name" value={selectedParticipant.accountName} />
                <DetailRow label="Account Number" value={selectedParticipant.accountNumber} />
                <DetailRow label="SWIFT Code" value={selectedParticipant.swiftCode} />
                <DetailRow label="Account Currency" value={selectedParticipant.bankAccountCurrency} />
                <DetailRow label="Bank Officer Name" value={selectedParticipant.bankOfficerName} />
                <DetailRow label="Bank Officer Email" value={selectedParticipant.bankOfficerEmail} />
              </DetailSection>

              <DetailSection title="Compliance">
                <DetailRow label="Employees (Company)" value={selectedParticipant.employeesCompany} />
                <DetailRow label="Employees (Group)" value={selectedParticipant.employeesGroup} />
                <DetailRow label="Previous Bullfrog Employee" value={selectedParticipant.previousBullfrogEmployee} />
                <DetailRow label="AML Subject" value={selectedParticipant.amlSubject} />
                <DetailRow label="AML Conformity Program" value={selectedParticipant.amlConformityProgram} />
                <DetailRow label="AML Regulator" value={selectedParticipant.amlRegulator} />
                <DetailRow label="AML Law Name" value={selectedParticipant.amlLawName} />
              </DetailSection>

              <DetailSection title="Contact & Signatory">
                <DetailRow label="Contact Name" value={selectedParticipant.contactName} />
                <DetailRow label="Contact Title" value={selectedParticipant.contactTitle} />
                <DetailRow label="Contact Phone" value={selectedParticipant.contactPhone} />
                <DetailRow label="Contact Email" value={selectedParticipant.contactEmail} />
                <DetailRow label="Fax Number" value={selectedParticipant.faxNumber} />
                <DetailRow label="Website" value={selectedParticipant.website} />
                <DetailRow label="Signatory Name" value={selectedParticipant.signatoryName} />
                <DetailRow label="Signatory Title" value={selectedParticipant.signatoryTitle} />
                <DetailRow label="Signatory Company" value={selectedParticipant.signatoryCompany} />
                <DetailRow label="Signatory Place/Date" value={selectedParticipant.signatoryPlaceDate} />
              </DetailSection>

              {participantDocs && participantDocs.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-3 pb-2 border-b border-border">
                    Attached Documents
                  </h4>
                  <div className="space-y-2">
                    {participantDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-border"
                        data-testid={`doc-participant-${doc.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <FileCheck className="w-4 h-4 text-primary flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{doc.originalName}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {doc.documentType} &bull; {(doc.size / 1024).toFixed(0)} KB
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 flex-shrink-0"
                          onClick={() => window.open(`/api/kyc-documents/${doc.id}/download`, "_blank")}
                          data-testid={`btn-download-doc-${doc.id}`}
                        >
                          <Download className="w-3.5 h-3.5 mr-1" />
                          <span className="text-xs">Download</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingParticipant} onOpenChange={(open) => { if (!open) setEditingParticipant(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-request-changes">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-serif">
              <Edit className="w-5 h-5 text-primary" />
              Request Changes — {editingParticipant?.companyName}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Edit the fields you want to change. Only modified fields will be submitted as a change request for admin approval.
            </p>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {[
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
            ].map(({ key, label }) => {
              const currentVal = editingParticipant ? String((editingParticipant as any)[key] || "") : "";
              return (
                <div key={key} className="space-y-1">
                  <Label className="text-xs font-medium">{label}</Label>
                  <Input
                    className="text-sm rounded-none"
                    placeholder={currentVal || "Current: (empty)"}
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
                onClick={() => setEditingParticipant(null)}
                data-testid="button-cancel-changes"
              >
                Cancel
              </Button>
              <Button
                className="rounded-none"
                disabled={Object.keys(changeFields).length === 0 || submitChangeRequest.isPending}
                onClick={() => {
                  if (!editingParticipant) return;
                  submitChangeRequest.mutate({
                    kycId: editingParticipant.id,
                    changedFields: changeFields,
                    reason: changeReason,
                  });
                }}
                data-testid="button-submit-changes"
              >
                {submitChangeRequest.isPending ? "Submitting..." : "Submit Change Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-3 pb-2 border-b border-border">
        {title}
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {children}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div data-testid={`detail-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}
