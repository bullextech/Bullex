import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, ShieldCheck, Building2, Users, Lock, LogIn, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useClientAuth } from "@/hooks/use-client-auth";

export default function Platform() {
  const [activeTab, setActiveTab] = useState<"admin" | "team" | "client">("admin");

  const { login: adminLogin, authenticated: adminAuthenticated } = useAuth();
  const { login: clientLogin, authenticated: clientAuthenticated } = useClientAuth();
  const [, setLocation] = useLocation();

  const [adminUser, setAdminUser] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);

  const [teamUser, setTeamUser] = useState("");
  const [teamPass, setTeamPass] = useState("");
  const [teamError, setTeamError] = useState("");
  const [teamLoading, setTeamLoading] = useState(false);

  const [clientUser, setClientUser] = useState("");
  const [clientPass, setClientPass] = useState("");
  const [clientError, setClientError] = useState("");
  const [clientLoading, setClientLoading] = useState(false);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError("");
    if (!adminUser || !adminPass) {
      setAdminError("Please enter both username and password.");
      return;
    }
    setAdminLoading(true);
    const result = await adminLogin(adminUser, adminPass);
    setAdminLoading(false);
    if (result.success) {
      setLocation("/dashboard");
    } else {
      setAdminError(result.error || "Invalid credentials");
    }
  };

  const handleTeamLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeamError("");
    if (!teamUser || !teamPass) {
      setTeamError("Please enter both username and password.");
      return;
    }
    setTeamLoading(true);
    const result = await adminLogin(teamUser, teamPass);
    setTeamLoading(false);
    if (result.success) {
      setLocation("/dashboard");
    } else {
      setTeamError(result.error || "Invalid credentials");
    }
  };

  const handleClientLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError("");
    if (!clientUser || !clientPass) {
      setClientError("Please enter both username and password.");
      return;
    }
    setClientLoading(true);
    const result = await clientLogin(clientUser, clientPass);
    setClientLoading(false);
    if (result.success) {
      setLocation("/client-portal");
    } else {
      setClientError(result.error || "Invalid credentials");
    }
  };

  const tabs = [
    { key: "admin" as const, label: "Admin", icon: ShieldCheck, testId: "tab-admin-login" },
    { key: "team" as const, label: "Team", icon: Users, testId: "tab-team-login" },
    { key: "client" as const, label: "Client", icon: Building2, testId: "tab-client-login" },
  ];

  return (
    <div className="overflow-y-auto h-full bg-muted/20 flex items-start justify-center py-16 px-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-lg bg-primary flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-platform-title">BULLEX</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] mt-1">Commodity Trading Platform</p>
        </div>

        <div className="flex border border-border overflow-hidden bg-background">
          <div className="w-44 flex-shrink-0 border-r border-border bg-muted/30 flex flex-col">
            {tabs.map((tab, i) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setAdminError("");
                  setTeamError("");
                  setClientError("");
                }}
                data-testid={tab.testId}
                className={`flex flex-col items-center justify-center gap-2 py-7 px-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                  i < tabs.length - 1 ? "border-b border-border" : ""
                } ${
                  activeTab === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <tab.icon className="w-6 h-6" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 p-8">
            {activeTab === "admin" && (
              <>
                <div className="flex items-center gap-2 mb-6">
                  <Lock className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-primary">Admin Authentication</h2>
                </div>
                <form onSubmit={handleAdminLogin} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Username</label>
                    <Input
                      type="text"
                      placeholder="Enter admin username"
                      className="rounded-none h-11 border-border"
                      value={adminUser}
                      onChange={(e) => setAdminUser(e.target.value)}
                      autoComplete="username"
                      data-testid="input-admin-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Password</label>
                    <Input
                      type="password"
                      placeholder="Enter admin password"
                      className="rounded-none h-11 border-border"
                      value={adminPass}
                      onChange={(e) => setAdminPass(e.target.value)}
                      autoComplete="current-password"
                      data-testid="input-admin-password"
                    />
                  </div>
                  {adminError && (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 text-sm text-destructive" data-testid="text-admin-login-error">
                      {adminError}
                    </div>
                  )}
                  <Button
                    type="submit"
                    className="w-full rounded-none h-12 text-sm font-bold uppercase tracking-wider"
                    disabled={adminLoading}
                    data-testid="button-admin-login-submit"
                  >
                    {adminLoading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Authenticating...</>
                    ) : (
                      <><LogIn className="w-4 h-4 mr-2" />Sign In as Admin</>
                    )}
                  </Button>
                </form>
                <p className="text-[10px] text-muted-foreground text-center mt-6">
                  Access restricted to authorized personnel only.
                </p>
              </>
            )}

            {activeTab === "team" && (
              <>
                <div className="flex items-center gap-2 mb-6">
                  <Lock className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-primary">Team Authentication</h2>
                </div>
                <form onSubmit={handleTeamLogin} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Username</label>
                    <Input
                      type="text"
                      placeholder="Enter team username"
                      className="rounded-none h-11 border-border"
                      value={teamUser}
                      onChange={(e) => setTeamUser(e.target.value)}
                      autoComplete="username"
                      data-testid="input-team-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Password</label>
                    <Input
                      type="password"
                      placeholder="Enter team password"
                      className="rounded-none h-11 border-border"
                      value={teamPass}
                      onChange={(e) => setTeamPass(e.target.value)}
                      autoComplete="current-password"
                      data-testid="input-team-password"
                    />
                  </div>
                  {teamError && (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 text-sm text-destructive" data-testid="text-team-login-error">
                      {teamError}
                    </div>
                  )}
                  <Button
                    type="submit"
                    className="w-full rounded-none h-12 text-sm font-bold uppercase tracking-wider"
                    disabled={teamLoading}
                    data-testid="button-team-login-submit"
                  >
                    {teamLoading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Authenticating...</>
                    ) : (
                      <><LogIn className="w-4 h-4 mr-2" />Sign In as Team</>
                    )}
                  </Button>
                </form>
                <p className="text-[10px] text-muted-foreground text-center mt-6">
                  Team credentials are provided by your administrator.
                </p>
              </>
            )}

            {activeTab === "client" && (
              <>
                <div className="flex items-center gap-2 mb-6">
                  <Lock className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-primary">Client Authentication</h2>
                </div>
                <form onSubmit={handleClientLogin} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Username</label>
                    <Input
                      type="text"
                      placeholder="Enter client username"
                      className="rounded-none h-11 border-border"
                      value={clientUser}
                      onChange={(e) => setClientUser(e.target.value)}
                      autoComplete="username"
                      data-testid="input-client-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Password</label>
                    <Input
                      type="password"
                      placeholder="Enter client password"
                      className="rounded-none h-11 border-border"
                      value={clientPass}
                      onChange={(e) => setClientPass(e.target.value)}
                      autoComplete="current-password"
                      data-testid="input-client-password"
                    />
                  </div>
                  {clientError && (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 text-sm text-destructive" data-testid="text-client-login-error">
                      {clientError}
                    </div>
                  )}
                  <Button
                    type="submit"
                    className="w-full rounded-none h-12 text-sm font-bold uppercase tracking-wider"
                    disabled={clientLoading}
                    data-testid="button-client-login-submit"
                  >
                    {clientLoading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Authenticating...</>
                    ) : (
                      <><LogIn className="w-4 h-4 mr-2" />Sign In as Client</>
                    )}
                  </Button>
                </form>
                <p className="text-[10px] text-muted-foreground text-center mt-6">
                  Client credentials are provided upon KYC approval.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
