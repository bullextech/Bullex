import { lazy, Suspense, useEffect, type ComponentType } from "react";
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
import Login from "@/pages/login";
import { ComingSoon } from "@/pages/coming-soon";
import { idlePrefetchAllowedRoutes } from "@/lib/route-prefetch";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const KYC = lazy(() => import("@/pages/kyc"));
const DocumentGenerator = lazy(() => import("@/pages/document-generator"));
const Trading = lazy(() => import("@/pages/trades"));
const Vault = lazy(() => import("@/pages/vault"));
const Blockchain = lazy(() => import("@/pages/blockchain"));
const Products = lazy(() => import("@/pages/products"));
const Contact = lazy(() => import("@/pages/contact"));
const KycAdmin = lazy(() => import("@/pages/kyc-admin"));
const Investor = lazy(() => import("@/pages/investor"));
const TokenizationModel = lazy(() => import("@/pages/tokenization-model"));
const Platform = lazy(() => import("@/pages/platform"));
const KycRegister = lazy(() => import("@/pages/kyc-register"));
const EnquiryRegister = lazy(() => import("@/pages/enquiry-register"));
const ClientPortal = lazy(() => import("@/pages/client-portal"));
const TradeEnquiries = lazy(() => import("@/pages/trade-enquiries"));
const Register = lazy(() => import("@/pages/register"));
const RegistrationsAdmin = lazy(() => import("@/pages/registrations-admin"));
const HumanResources = lazy(() => import("@/pages/human-resources"));
const TeamMembers = lazy(() => import("@/pages/team-members"));
const TeamPerformance = lazy(() => import("@/pages/team-performance"));
const TeamKYC = lazy(() => import("@/pages/team-kyc"));
const InvestorDeck = lazy(() => import("@/pages/investor-deck"));
const TradeBank = lazy(() => import("@/pages/trade-bank"));
const Matching = lazy(() => import("@/pages/matching"));
const DealPipeline = lazy(() => import("@/pages/deal-pipeline"));
const Banking = lazy(() => import("@/pages/banking"));
const DatabaseBackup = lazy(() => import("@/pages/database-backup"));
const TaskBoard = lazy(() => import("@/pages/task-board"));
const Checklists = lazy(() => import("@/pages/checklists"));
const TeamPortal = lazy(() => import("@/pages/team-portal"));
const TeamReset = lazy(() => import("@/pages/team-reset"));
const ClientSetup = lazy(() => import("@/pages/client-setup"));
const Notifications = lazy(() => import("@/pages/notifications"));
const Chat = lazy(() => import("@/pages/chat"));
const Contacts = lazy(() => import("@/pages/contacts"));
const MyTeam = lazy(() => import("@/pages/my-team"));
const Shipments = lazy(() => import("@/pages/shipments"));
const LivePrices = lazy(() => import("@/pages/live-prices"));

function PageFallback() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-[400px]" />
    </div>
  );
}

const Analytics = () => <ComingSoon title="Analytics" description="Trading performance, KYC throughput and operational analytics will appear here." />;
const QaReports = () => <ComingSoon title="QA Reports" description="Sampling, quality, moisture and weight inspection reports from independent agencies." />;

// Always requires login; admins get full access, team members get all modules unrestricted by this gate
function ProtectedRoute({ component: Component }: { component: ComponentType }) {
  const { authenticated, loading } = useAuth();
  if (loading) return <div className="p-6 space-y-6"><Skeleton className="h-8 w-72" /><Skeleton className="h-[400px]" /></div>;
  if (!authenticated) return <Login />;
  return <Component />;
}

// Requires login AND the admin role (team members are denied).
function AdminRoute({ component: Component }: { component: ComponentType }) {
  const { authenticated, loading, role } = useAuth();
  if (loading) return <div className="p-6 space-y-6"><Skeleton className="h-8 w-72" /><Skeleton className="h-[400px]" /></div>;
  if (!authenticated) return <Login />;
  if (role === "admin") return <Component />;
  return <AccessDenied />;
}

// Requires login AND a specific module in allowedModules (for team members).
// Admins bypass the module check entirely.
function ModuleRoute({ component: Component, moduleId, teamOnly }: { component: ComponentType; moduleId: string | string[]; teamOnly?: boolean }) {
  const { authenticated, loading, role, allowedModules } = useAuth();
  const requiredIds = Array.isArray(moduleId) ? moduleId : [moduleId];
  if (loading) return <div className="p-6 space-y-6"><Skeleton className="h-8 w-72" /><Skeleton className="h-[400px]" /></div>;
  if (!authenticated) return <Login />;
  if (role === "admin") return teamOnly ? <AccessDenied /> : <Component />;
  if (role === "team" && requiredIds.some((id) => (allowedModules ?? []).includes(id))) return <Component />;
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
    <Suspense fallback={<PageFallback />}>
    <Switch>
      <Route path="/">{() => <HomeOrTeamPortal />}</Route>
      <Route path="/dashboard">{() => <ModuleRoute component={Dashboard} moduleId="dashboard" />}</Route>
      <Route path="/registrations">{() => <ModuleRoute component={RegistrationsAdmin} moduleId="registrations" />}</Route>
      <Route path="/kyc-admin">{() => <ModuleRoute component={KycAdmin} moduleId="kyc-admin" />}</Route>
      <Route path="/team">{() => <ProtectedRoute component={TeamMembers} />}</Route>
      <Route path="/team-performance">{() => <AdminRoute component={TeamPerformance} />}</Route>
      <Route path="/team-kyc-admin">{() => <Redirect to="/team" />}</Route>
      <Route path="/trade-enquiries">{() => <ModuleRoute component={TradeEnquiries} moduleId="enquiries" />}</Route>
      <Route path="/documents">{() => <ModuleRoute component={DocumentGenerator} moduleId={["documents", "doc-templates"]} />}</Route>
      <Route path="/trading">{() => <ModuleRoute component={Trading} moduleId="trading" />}</Route>
      <Route path="/matching">{() => <ModuleRoute component={Matching} moduleId="matching" />}</Route>
      <Route path="/deal-pipeline">{() => <ModuleRoute component={DealPipeline} moduleId="enquiries" />}</Route>
      <Route path="/vault">{() => <ModuleRoute component={Vault} moduleId="vault" />}</Route>
      <Route path="/blockchain">{() => <ModuleRoute component={Blockchain} moduleId="blockchain" />}</Route>
      <Route path="/team-members">{() => <Redirect to="/team" />}</Route>
      <Route path="/hr">{() => <Redirect to="/team" />}</Route>
      <Route path="/db-backup">{() => <ProtectedRoute component={DatabaseBackup} />}</Route>
      <Route path="/tasks">{() => <ModuleRoute component={TaskBoard} moduleId="tasks" />}</Route>
      <Route path="/checklists">{() => <ModuleRoute component={Checklists} moduleId="checklists" />}</Route>
      <Route path="/analytics">{() => <ModuleRoute component={Analytics} moduleId="analytics" />}</Route>
      <Route path="/notifications">{() => <ModuleRoute component={Notifications} moduleId="notifications" />}</Route>
      <Route path="/chat">{() => <ProtectedRoute component={Chat} />}</Route>
      <Route path="/doc-templates">{() => <ModuleRoute component={DocumentGenerator} moduleId={["documents", "doc-templates"]} />}</Route>
      <Route path="/shipments">{() => <ModuleRoute component={Shipments} moduleId="shipments" />}</Route>
      <Route path="/qa-reports">{() => <ModuleRoute component={QaReports} moduleId="qa-reports" />}</Route>
      <Route path="/banking">{() => <ModuleRoute component={Banking} moduleId="banking" />}</Route>
      <Route path="/live-prices">{() => <ModuleRoute component={LivePrices} moduleId="live-prices" />}</Route>
      <Route path="/contacts">{() => <ModuleRoute component={Contacts} moduleId="contacts" />}</Route>
      <Route path="/my-team">{() => <ModuleRoute component={MyTeam} moduleId="team-network" teamOnly />}</Route>
      <Route path="/team-portal">{() => <ProtectedRoute component={TeamPortal} />}</Route>
      <Route path="/products" component={Products} />
      <Route path="/platform" component={Platform} />
      <Route path="/client-portal" component={ClientPortal} />
      <Route path="/investor" component={Investor} />
      <Route path="/tokenization-model" component={TokenizationModel} />
      <Route path="/human-resources" component={HumanResources} />
      <Route path="/contact" component={Contact} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
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

// Once auth resolves, warm the chunks of the pages this user can open
// during browser idle time (helps touch devices, where hover prefetch
// never fires). No-op until authenticated; renders nothing.
function IdleRoutePrefetcher() {
  const { authenticated, loading, role, allowedModules, username } = useAuth();
  useEffect(() => {
    if (loading || !authenticated) return;
    idlePrefetchAllowedRoutes(role, allowedModules, username);
  }, [loading, authenticated, role, allowedModules, username]);
  return null;
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
        <IdleRoutePrefetcher />
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
              <Suspense fallback={<PageFallback />}>
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
              </Suspense>
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
