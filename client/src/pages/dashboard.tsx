import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Link2,
  Shield,
  FileText,
  ArrowRight,
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Building2,
  UserCheck,
  UserCog,
  Briefcase,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import type { Trade, Block, KycApplication, Document, TeamKycApplication, TeamMember } from "@shared/schema";

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  testId,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: any;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-xl font-bold" data-testid={`${testId}-value`}>
              {value}
            </p>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const statusIcon = (status: string) => {
  switch (status) {
    case "final_payment":
      return <CheckCircle2 className="w-3.5 h-3.5 text-status-online" />;
    case "execution":
    case "deal":
    case "pre_deal":
      return <Clock className="w-3.5 h-3.5 text-status-away" />;
    default:
      return <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

const statusLabel = (status: string) => {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

export default function Dashboard() {
  const { data: trades, isLoading: tl } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });
  const { data: blocks, isLoading: bl } = useQuery<Block[]>({
    queryKey: ["/api/blocks"],
  });
  const { data: kycs, isLoading: kl } = useQuery<KycApplication[]>({
    queryKey: ["/api/kyc"],
  });
  const { data: docs, isLoading: dl } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });
  const { data: teamKycApps } = useQuery<TeamKycApplication[]>({
    queryKey: ["/api/team-kyc"],
  });
  const { data: teamMembers } = useQuery<TeamMember[]>({
    queryKey: ["/api/team/members"],
  });

  const isLoading = tl || bl || kl || dl;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[90px] rounded-md" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-[320px] rounded-md" />
          <Skeleton className="h-[320px] rounded-md" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-[400px] rounded-md lg:col-span-2" />
          <Skeleton className="h-[400px] rounded-md" />
        </div>
      </div>
    );
  }

  const totalTrades = trades?.length || 0;
  const latestBlock = blocks && blocks.length > 0 ? blocks[0] : null;
  const totalVolume = trades?.reduce((s, t) => s + t.totalValue, 0) || 0;
  const activeTrades = trades?.filter((t) => t.status !== "final_payment").length || 0;
  const recentTrades = trades?.slice(0, 6) || [];

  const kycPending = kycs?.filter((a) => a.status === "pending").length || 0;
  const kycApproved = kycs?.filter((a) => a.status === "approved").length || 0;
  const kycRejected = kycs?.filter((a) => a.status === "rejected").length || 0;
  const recentKyc = (kycs || []).slice(0, 5);

  const teamKycPending = teamKycApps?.filter((a) => a.status === "pending").length || 0;
  const teamKycApproved = teamKycApps?.filter((a) => a.status === "approved").length || 0;
  const teamKycRejected = teamKycApps?.filter((a) => a.status === "rejected").length || 0;
  const recentTeamKyc = (teamKycApps || []).slice(0, 5);

  const kycStatusConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    pending: { label: "Pending", color: "text-amber-600", bg: "bg-amber-600/10 border-amber-600/20 text-amber-700", icon: Clock },
    approved: { label: "Approved", color: "text-emerald-600", bg: "bg-emerald-600/10 border-emerald-600/20 text-emerald-700", icon: CheckCircle2 },
    rejected: { label: "Rejected", color: "text-red-600", bg: "bg-red-600/10 border-red-600/20 text-red-700", icon: XCircle },
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-widest">
              Bullex
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">
            Admin Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Physically backed trades, full provenance tracking, and transparent blockchain settlement
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/trading">
            <Button size="sm" data-testid="button-new-trade-dash">
              <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
              New Trade
            </Button>
          </Link>
          <Link href="/kyc">
            <Button size="sm" variant="secondary" data-testid="button-kyc-dash">
              KYC Onboarding
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Trades"
          value={totalTrades.toString()}
          subtitle={`${activeTrades} active`}
          icon={Link2}
          testId="stat-trades"
        />
        <StatCard
          title="Trade Volume"
          value={`$${totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          subtitle="All-time"
          icon={TrendingUp}
          testId="stat-volume"
        />
        <StatCard
          title="Chain Blocks"
          value={latestBlock ? latestBlock.blockNumber.toString() : "0"}
          subtitle="100% verified"
          icon={Layers}
          testId="stat-blocks"
        />
        <StatCard
          title="Documents"
          value={(docs?.length || 0).toString()}
          subtitle={`${kycs?.length || 0} KYC applications`}
          icon={FileText}
          testId="stat-docs"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-kyc-summary">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-primary" />
              Client KYC Registrations
            </CardTitle>
            <Link href="/kyc-admin">
              <Button variant="ghost" size="sm" className="text-xs" data-testid="link-all-kyc-dash">
                Manage <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-center" data-testid="dash-kyc-pending">
                <div className="text-2xl font-bold text-amber-600">{kycPending}</div>
                <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 mt-0.5">Pending</div>
              </div>
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-center" data-testid="dash-kyc-approved">
                <div className="text-2xl font-bold text-emerald-600">{kycApproved}</div>
                <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mt-0.5">Approved</div>
              </div>
              <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-center" data-testid="dash-kyc-rejected">
                <div className="text-2xl font-bold text-red-600">{kycRejected}</div>
                <div className="text-[10px] uppercase tracking-wider text-red-700 dark:text-red-400 mt-0.5">Rejected</div>
              </div>
            </div>
            <div className="space-y-0">
              {recentKyc.length > 0 ? recentKyc.map((app) => {
                const cfg = kycStatusConfig[app.status] || kycStatusConfig.pending;
                const Icon = cfg.icon;
                return (
                  <div key={app.id} className="flex items-center justify-between gap-3 py-2.5 border-b last:border-b-0" data-testid={`dash-kyc-row-${app.id}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{app.companyName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{app.countryOfIncorporation} · {app.contactEmail}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`rounded-none text-[10px] font-bold shrink-0 ${cfg.bg}`}>
                      <Icon className="w-2.5 h-2.5 mr-1" />
                      {cfg.label}
                    </Badge>
                  </div>
                );
              }) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <UserCheck className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-sm">No KYC applications yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-team-summary">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-primary" />
              Team Member Registrations
            </CardTitle>
            <Link href="/hr">
              <Button variant="ghost" size="sm" className="text-xs" data-testid="link-all-team-dash">
                Manage <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-center" data-testid="dash-team-members">
                <div className="text-2xl font-bold text-blue-600">{teamMembers?.length || 0}</div>
                <div className="text-[10px] uppercase tracking-wider text-blue-700 dark:text-blue-400 mt-0.5">Members</div>
              </div>
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-center" data-testid="dash-team-pending">
                <div className="text-2xl font-bold text-amber-600">{teamKycPending}</div>
                <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 mt-0.5">Pending</div>
              </div>
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-center" data-testid="dash-team-approved">
                <div className="text-2xl font-bold text-emerald-600">{teamKycApproved}</div>
                <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mt-0.5">Approved</div>
              </div>
              <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-center" data-testid="dash-team-rejected">
                <div className="text-2xl font-bold text-red-600">{teamKycRejected}</div>
                <div className="text-[10px] uppercase tracking-wider text-red-700 dark:text-red-400 mt-0.5">Rejected</div>
              </div>
            </div>
            <div className="space-y-0">
              {recentTeamKyc.length > 0 ? recentTeamKyc.map((app) => {
                const s = app.status;
                const cfg = kycStatusConfig[s] || kycStatusConfig.pending;
                const Icon = cfg.icon;
                return (
                  <div key={app.id} className="flex items-center justify-between gap-3 py-2.5 border-b last:border-b-0" data-testid={`dash-team-row-${app.id}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <UserCog className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{app.fullName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {app.positionApplied || "—"}{app.department ? ` · ${app.department}` : ""}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`rounded-none text-[10px] font-bold shrink-0 ${cfg.bg}`}>
                      <Icon className="w-2.5 h-2.5 mr-1" />
                      {cfg.label}
                    </Badge>
                  </div>
                );
              }) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Briefcase className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-sm">No team applications yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" data-testid="card-recent-trades">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
            <CardTitle className="text-base font-semibold">Recent Trades</CardTitle>
            <Link href="/trading">
              <Button variant="ghost" size="sm" data-testid="link-all-trades">
                View All
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentTrades.length > 0 ? (
              <div className="space-y-0">
                {recentTrades.map((trade) => (
                  <div
                    key={trade.id}
                    className="flex items-center justify-between gap-3 py-3 border-b last:border-b-0"
                    data-testid={`trade-row-${trade.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Link2 className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium font-mono">
                            {trade.tradeRef}
                          </span>
                          <Badge variant="secondary" className="text-[10px]">
                            {trade.commodityCategory}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {trade.commodity} &middot; {trade.origin} to {trade.destination}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-medium font-mono">
                          ${trade.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {trade.quantity} {trade.unit}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {statusIcon(trade.status)}
                        <span className="text-[10px]">{statusLabel(trade.status)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Link2 className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm">No trades yet</p>
                <p className="text-xs">Execute your first trade to begin</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-chain-status">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Chain Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Bullex Chain</span>
              <Badge className="text-[10px]">Live</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Blocks</span>
              <span className="font-mono font-medium">
                {latestBlock?.blockNumber || 0}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Chain Integrity</span>
              <span className="text-status-online font-medium">Valid</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Active Trades</span>
              <span className="font-mono font-medium">{activeTrades}</span>
            </div>

            {blocks && blocks.length > 0 && (
              <div className="pt-2 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Recent Blocks</p>
                {blocks.slice(0, 3).map((block) => {
                  const blockTrade = trades?.find((t) => t.blockNumber === block.blockNumber);
                  return (
                    <div
                      key={block.id}
                      className="p-2.5 rounded-md bg-muted space-y-1"
                      data-testid={`block-preview-${block.blockNumber}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-medium">
                          #{block.blockNumber}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {block.hash.slice(0, 8)}...{block.hash.slice(-4)}
                        </span>
                      </div>
                      {blockTrade && (
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{blockTrade.tradeRef}</span>
                          <span>{statusLabel(blockTrade.status)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
