import { Switch, Route, useRoute, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { TopNavbar } from "@/components/top-navbar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { MobileSidebarProvider, useMobileSidebar } from "@/hooks/use-mobile-sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ClientAuthProvider } from "@/hooks/use-client-auth";
import { AmendModeProvider } from "@/hooks/use-amend-mode";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield } from "lucide-react";
import NotFound from "@/pages/not-found";
import AccessDenied from "@/pages/access-denied";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import KYC from "@/pages/kyc";
import DocumentGenerator from "@/pages/document-generator";
import Trading from "@/pages/trades";
import Vault from "@/pages/vault";
import Blockchain from "@/pages/blockchain";
import Products from "@/pages/products";
import Contact from "@/pages/contact";
import KycAdmin from "@/pages/kyc-admin";
import Investor from "@/pages/investor";
import Platform from "@/pages/platform";
import KycRegister from "@/pages/kyc-register";
import EnquiryRegister from "@/pages/enquiry-register";
import ClientPortal from "@/pages/client-portal";
import TradeEnquiries from "@/pages/trade-enquiries";
import Deals from "@/pages/deals";
import Login from "@/pages/login";
import Register from "@/pages/register";
import RegistrationsAdmin from "@/pages/registrations-admin";
import HumanResources from "@/pages/human-resources";
import TeamMembers from "@/pages/team-members";
import TeamKYC from "@/pages/team-kyc";
import InvestorDeck from "@/pages/investor-deck";
import TradeBank from "@/pages/trade-bank";
import Banking from "@/pages/banking";
import DatabaseBackup from "@/pages/database-backup";
import TaskBoard from "@/pages/task-board";
import TeamPortal from "@/pages/team-portal";
import TeamReset from "@/pages/team-reset";
import ClientSetup from "@/pages/client-setup";
import Notifications from "@/pages/notifications";
import Chat from "@/pages/chat";
import { ComingSoon } from "@/pages/coming-soon";

const Analytics = () => <ComingSoon title="Analytics" description="Trading performance, KYC throughput and operational analytics will appear here." />;
const Shipments = () => <ComingSoon title="Shipments" description="Vessel scheduling, cargo loading, ETA tracking and discharge events." />;
const QaReports = () => <ComingSoon title="QA Reports" description="Sampling, quality, moisture and weight inspection reports from independent agencies." />;
const LivePrices = () => <ComingSoon title="Live Prices" description="Live commodity price feeds for metals, energy and fertilizers." />;

// Always requires login; admins get full access, team members get all modules unrestricted by this gate
function ProtectedRoute({ component: Component }: { component: () => JSX.Element }) {
  const { authenticated, loading } = useAuth();
  if (loading) return <div className="p-6 space-y-6"><Skeleton className="h-8 w-72" /><Skeleton className="h-[400px]" /></div>;
  if (!authenticated) return <Login />;
  return <Component />;
}

// Requires login AND a specific module in allowedModules (for team members).
// Admins bypass the module check entirely.
function ModuleRoute({ component: Component, moduleId }: { component: () => JSX.Element; moduleId: string }) {
  const { authenticated, loading, role, allowedModules } = useAuth();
  if (loading) return <div className="p-6 space-y-6"><Skeleton className="h-8 w-72" /><Skeleton className="h-[400px]" /></div>;
  if (!authenticated) return <Login />;
  if (role === "admin") return <Component />;
  if (role === "team" && (allowedModules ?? []).includes(moduleId)) return <Component />;
  return <AccessDenied />;
}

function KycStandaloneShell() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-background px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">BULLEX</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">KYC Onboarding</p>
          </div>
        </div>
        <ThemeToggle />
      </header>
      <main className="flex-1"><KYC /></main>
      <footer className="border-t border-border bg-muted/30 px-4 py-2 text-center">
        <p className="text-[10px] text-muted-foreground font-bold">Bullex is a proprietary platform of Bullfrog Group.</p>
      </footer>
    </div>
  );
}

function HomeOrTeamPortal() {
  const { authenticated, role, loading } = useAuth();
  if (loading) return <div className="p-6 space-y-6"><Skeleton className="h-8 w-72" /><Skeleton className="h-[400px]" /></div>;
  if (authenticated && role === "team") return <Redirect to="/team-portal" />;
  return <Home />;
}

function Router() {
  return (
    <Switch>
      <Route path="/">{() => <HomeOrTeamPortal />}</Route>
      <Route path="/dashboard">{() => <ModuleRoute component={Dashboard} moduleId="dashboard" />}</Route>
      <Route path="/registrations">{() => <ModuleRoute component={RegistrationsAdmin} moduleId="registrations" />}</Route>
      <Route path="/kyc-admin">{() => <ModuleRoute component={KycAdmin} moduleId="kyc-admin" />}</Route>
      <Route path="/team">{() => <ProtectedRoute component={TeamMembers} />}</Route>
      <Route path="/team-kyc-admin">{() => <Redirect to="/team" />}</Route>
      <Route path="/trade-enquiries">{() => <ModuleRoute component={TradeEnquiries} moduleId="enquiries" />}</Route>
      <Route path="/documents">{() => <ModuleRoute component={DocumentGenerator} moduleId="doc-templates" />}</Route>
      <Route path="/trading">{() => <ModuleRoute component={Trading} moduleId="trading" />}</Route>
      <Route path="/deals">{() => <ModuleRoute component={Deals} moduleId="deals" />}</Route>
      <Route path="/vault">{() => <ModuleRoute component={Vault} moduleId="vault" />}</Route>
      <Route path="/blockchain">{() => <ModuleRoute component={Blockchain} moduleId="blockchain" />}</Route>
      <Route path="/team-members">{() => <Redirect to="/team" />}</Route>
      <Route path="/hr">{() => <Redirect to="/team" />}</Route>
      <Route path="/db-backup">{() => <ProtectedRoute component={DatabaseBackup} />}</Route>
      <Route path="/tasks">{() => <ModuleRoute component={TaskBoard} moduleId="tasks" />}</Route>
      <Route path="/analytics">{() => <ModuleRoute component={Analytics} moduleId="analytics" />}</Route>
      <Route path="/notifications">{() => <ModuleRoute component={Notifications} moduleId="notifications" />}</Route>
      <Route path="/chat">{() => <ProtectedRoute component={Chat} />}</Route>
      <Route path="/doc-templates">{() => <ModuleRoute component={DocumentGenerator} moduleId="doc-templates" />}</Route>
      <Route path="/shipments">{() => <ModuleRoute component={Shipments} moduleId="shipments" />}</Route>
      <Route path="/qa-reports">{() => <ModuleRoute component={QaReports} moduleId="qa-reports" />}</Route>
      <Route path="/banking">{() => <ModuleRoute component={Banking} moduleId="banking" />}</Route>
      <Route path="/live-prices">{() => <ModuleRoute component={LivePrices} moduleId="live-prices" />}</Route>
      <Route path="/team-portal">{() => <ProtectedRoute component={TeamPortal} />}</Route>
      <Route path="/products" component={Products} />
      <Route path="/platform" component={Platform} />
      <Route path="/client-portal" component={ClientPortal} />
      <Route path="/investor" component={Investor} />
      <Route path="/human-resources" component={HumanResources} />
      <Route path="/contact" component={Contact} />
      <Route component={NotFound} />
    </Switch>
  );
}

function MobileSidebarSheet() {
  const { open, setOpen } = useMobileSidebar();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="p-0 w-64 max-w-[85vw]" data-testid="sheet-mobile-sidebar">
        <div onClick={() => setOpen(false)} className="h-full">
          <AdminSidebar />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AppShell() {
  const { authenticated } = useAuth();
  return (
    <div className="flex flex-col app-shell w-full safe-x">
      <div className="safe-top bg-background/95 flex-shrink-0">
        <TopNavbar />
      </div>
      <div className="flex flex-1 overflow-hidden">
        {authenticated && (
          <>
            <div className="hidden md:flex">
              <AdminSidebar />
            </div>
            <MobileSidebarSheet />
          </>
        )}
        <main className="flex-1 overflow-hidden flex flex-col min-w-0">
          <div className="flex-1 overflow-hidden">
            <Router />
          </div>
          <footer className="border-t border-border bg-muted/30 px-4 py-2 text-center flex-shrink-0 safe-bottom">
            <p className="text-[10px] text-muted-foreground font-bold" data-testid="text-global-footer">
              Bullex is a proprietary platform of Bullfrog Group.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}

function App() {
  const [isKycRegister] = useRoute("/kyc-register");
  const [isEnquiryRegister] = useRoute("/enquiry-register");
  const [isClientPortal] = useRoute("/client-portal");
  const [isKyc] = useRoute("/kyc");
  const [isTeamKyc] = useRoute("/team-kyc");
  const [isRegister] = useRoute("/register");
  const [isTeamReset] = useRoute("/team-reset/:token");
  const [isClientSetup] = useRoute("/client-setup/:token");
  const [isDeck] = useRoute("/deck");
  const [isTradeBank] = useRoute("/trade-bank");

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClientAuthProvider>
            <AuthProvider>
              <MobileSidebarProvider>
              <AmendModeProvider>
              {isKycRegister ? (
                <KycRegister />
              ) : isEnquiryRegister ? (
                <EnquiryRegister />
              ) : isClientPortal ? (
                <ClientPortal />
              ) : isKyc ? (
                <KycStandaloneShell />
              ) : isTeamKyc ? (
                <TeamKYC />
              ) : isRegister ? (
                <Register />
              ) : isTeamReset ? (
                <TeamReset />
              ) : isClientSetup ? (
                <ClientSetup />
              ) : isDeck ? (
                <InvestorDeck />
              ) : isTradeBank ? (
                <TradeBank />
              ) : (
                <AppShell />
              )}
              </AmendModeProvider>
              </MobileSidebarProvider>
            </AuthProvider>
          </ClientAuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
