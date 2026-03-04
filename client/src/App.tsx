import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/products" component={Products} />
      <Route path="/tokenization" component={Tokenization} />
      <Route path="/kyc" component={KYC} />
      <Route path="/kyc-admin" component={KycAdmin} />
      <Route path="/documents" component={DocumentGenerator} />
      <Route path="/trading" component={Trading} />
      <Route path="/vault" component={Vault} />
      <Route path="/blockchain" component={Blockchain} />
      <Route path="/platform" component={Platform} />
      <Route path="/investor" component={Investor} />
      <Route path="/contact" component={Contact} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
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
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
