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
];

export default function Platform() {
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
