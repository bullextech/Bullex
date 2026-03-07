import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  MapPin,
  Globe,
  Mail,
  Phone,
  Users,
  CheckCircle2,
  Shield,
  Calendar,
} from "lucide-react";
import type { KycApplication } from "@shared/schema";

export default function Participants() {
  const { data: applications, isLoading } = useQuery<KycApplication[]>({
    queryKey: ["/api/kyc"],
  });

  const approved = applications?.filter((a) => a.status === "approved") || [];

  if (isLoading) {
    return (
      <div className="overflow-y-auto h-full p-6">
        <Skeleton className="h-8 w-72 mb-2" />
        <Skeleton className="h-4 w-96 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[220px] rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      <div className="bg-primary text-primary-foreground py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <Badge
            variant="secondary"
            className="text-[10px] uppercase tracking-widest bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 mb-4"
          >
            Platform
          </Badge>
          <h1
            className="text-3xl md:text-4xl font-bold mb-4 tracking-tight"
            data-testid="text-participants-title"
          >
            Approved Participants
          </h1>
          <div className="w-20 h-1 bg-primary-foreground/40 mb-4" />
          <p className="text-base text-primary-foreground/80 font-light leading-relaxed max-w-2xl">
            KYC-verified entities approved to trade on the Bullex platform.
            All participants have completed institutional due diligence and compliance onboarding.
          </p>
        </div>
      </div>

      <div className="bg-card border-b border-border py-6 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="text-center" data-testid="stat-total-approved">
              <p className="text-2xl font-bold text-primary">{approved.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Approved Participants</p>
            </div>
            <div className="text-center" data-testid="stat-countries">
              <p className="text-2xl font-bold text-primary">
                {new Set(approved.map((a) => a.countryOfIncorporation)).size}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Countries</p>
            </div>
            <div className="text-center" data-testid="stat-kyc-verified">
              <p className="text-2xl font-bold text-primary">100%</p>
              <p className="text-xs text-muted-foreground mt-1">KYC Verified</p>
            </div>
          </div>
        </div>
      </div>

      <div className="py-10 px-6">
        <div className="max-w-5xl mx-auto">
          {approved.length === 0 ? (
            <Card className="border">
              <CardContent className="p-12 text-center">
                <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center mx-auto mb-4">
                  <Users className="w-7 h-7 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2" data-testid="text-no-participants">No Approved Participants Yet</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Participants will appear here once their KYC applications have been reviewed and approved by the admin team.
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
                      <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      <Badge variant="secondary" className="text-[9px] uppercase tracking-wider bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Approved
                      </Badge>
                    </div>

                    <h3 className="text-sm font-bold mb-1" data-testid={`text-participant-name-${participant.id}`}>
                      {participant.companyName}
                    </h3>

                    {participant.businessType && (
                      <p className="text-[10px] text-muted-foreground mb-3 uppercase tracking-wider">
                        {participant.businessType}
                      </p>
                    )}

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

                    <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      <span className="text-[10px] text-primary font-medium uppercase tracking-wider">
                        KYC Verified
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
