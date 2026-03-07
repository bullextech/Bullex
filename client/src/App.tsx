import { Switch, Route, useRoute } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import KYC from "@/pages/kyc";
import DocumentGenerator from "@/pages/document-generator";
import Trading from "@/pages/trades";
import Vault from "@/pages/vault";
import Blockchain from "@/pages/blockchain";
import Products from "@/pages/products";
import Tokenization from "@/pages/tokenization";
import Contact from "@/pages/contact";
import KycAdmin from "@/pages/kyc-admin";
import Investor from "@/pages/investor";
import Platform from "@/pages/platform";
import KycRegister from "@/pages/kyc-register";
import Login from "@/pages/login";
import Participants from "@/pages/participants";

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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/products" component={Products} />
      <Route path="/tokenization" component={Tokenization} />
      <Route path="/kyc" component={KYC} />
      <Route path="/kyc-admin">{() => <ProtectedRoute component={KycAdmin} />}</Route>
      <Route path="/documents">{() => <ProtectedRoute component={DocumentGenerator} />}</Route>
      <Route path="/trading">{() => <ProtectedRoute component={Trading} />}</Route>
      <Route path="/vault">{() => <ProtectedRoute component={Vault} />}</Route>
      <Route path="/blockchain">{() => <ProtectedRoute component={Blockchain} />}</Route>
      <Route path="/platform">{() => <ProtectedRoute component={Platform} />}</Route>
      <Route path="/participants">{() => <ProtectedRoute component={Participants} />}</Route>
      <Route path="/investor" component={Investor} />
      <Route path="/contact" component={Contact} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppShell() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-1 p-2 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-hidden">
            <Router />
          </main>
          <footer className="border-t border-border bg-muted/30 px-4 py-2 text-center">
            <p className="text-[10px] text-muted-foreground" data-testid="text-global-footer">
              Bullex is a proprietary platform of Bullfrog Group.
            </p>
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  const [isKycRegister] = useRoute("/kyc-register");

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            {isKycRegister ? (
              <KycRegister />
            ) : (
              <AppShell />
            )}
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
