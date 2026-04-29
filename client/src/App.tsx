import { Switch, Route, useRoute } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { TopNavbar } from "@/components/top-navbar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ClientAuthProvider } from "@/hooks/use-client-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield } from "lucide-react";
import NotFound from "@/pages/not-found";
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
import ClientPortal from "@/pages/client-portal";
import TradeEnquiries from "@/pages/trade-enquiries";
import Login from "@/pages/login";

function ProtectedRoute({ component: Component }: { component: () => JSX.Element }) {
  const { authenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!authenticated) {
    return <Login />;
  }

  return <Component />;
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
      <main className="flex-1">
        <KYC />
      </main>
      <footer className="border-t border-border bg-muted/30 px-4 py-2 text-center">
        <p className="text-[10px] text-muted-foreground">Bullex is a proprietary platform of Bullfrog Group.</p>
      </footer>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard">{() => <ProtectedRoute component={Dashboard} />}</Route>
      <Route path="/products" component={Products} />
      <Route path="/kyc-admin">{() => <ProtectedRoute component={KycAdmin} />}</Route>
      <Route path="/documents">{() => <ProtectedRoute component={DocumentGenerator} />}</Route>
      <Route path="/trading">{() => <ProtectedRoute component={Trading} />}</Route>
      <Route path="/vault">{() => <ProtectedRoute component={Vault} />}</Route>
      <Route path="/blockchain">{() => <ProtectedRoute component={Blockchain} />}</Route>
      <Route path="/platform" component={Platform} />
      <Route path="/trade-enquiries">{() => <ProtectedRoute component={TradeEnquiries} />}</Route>
      <Route path="/client-portal" component={ClientPortal} />
      <Route path="/investor" component={Investor} />
      <Route path="/contact" component={Contact} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppShell() {
  const { authenticated } = useAuth();

  return (
    <div className="flex flex-col h-screen w-full">
      <TopNavbar />
      <div className="flex flex-1 overflow-hidden">
        {authenticated && <AdminSidebar />}
        <main className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-hidden">
            <Router />
          </div>
          <footer className="border-t border-border bg-muted/30 px-4 py-2 text-center flex-shrink-0">
            <p className="text-[10px] text-muted-foreground" data-testid="text-global-footer">
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
  const [isClientPortal] = useRoute("/client-portal");
  const [isKyc] = useRoute("/kyc");

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClientAuthProvider>
            <AuthProvider>
              {isKycRegister ? (
                <KycRegister />
              ) : isClientPortal ? (
                <ClientPortal />
              ) : isKyc ? (
                <KycStandaloneShell />
              ) : (
                <AppShell />
              )}
            </AuthProvider>
          </ClientAuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
