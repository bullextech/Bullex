import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  Share2,
} from "lucide-react";

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
      "Generate trade documents instantly — SCO, FCO, ICPO, SPA, LOI, POP, POF, and BCL — all linked to verified trades with blockchain-backed integrity and full audit trails.",
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
  {
    icon: ShieldCheck,
    title: "Admin",
    description:
      "Review and manage KYC applications — approve or reject submissions, view applicant details, and oversee the institutional onboarding pipeline.",
    link: "/kyc-admin",
    linkText: "Open Admin",
  },
];

export default function Platform() {
  const [copied, setCopied] = useState(false);

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
    </div>
  );
}
