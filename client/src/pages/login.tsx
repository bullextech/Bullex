import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Loader2, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const ROLES = ["Buyer", "Seller", "Compliance", "Banking", "Admin"] as const;
type Role = typeof ROLES[number];

export default function Login() {
  const { login } = useAuth();
  const [role, setRole] = useState<Role>("Admin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username || !password) {
      setError("Please enter both username and password.");
      return;
    }
    setLoading(true);
    const result = await login(username, password);
    setLoading(false);
    if (!result.success) setError(result.error || "Login failed");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-[#0a1628]">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-lg bg-primary flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
            <Shield className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white" data-testid="text-login-title">
            Bullex
          </h1>
          <p className="text-[11px] text-slate-400 uppercase tracking-[0.25em] mt-2">
            Physical Commodity Trading Platform
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#0f1e35] border border-white/5 rounded-lg p-6 sm:p-7 shadow-2xl">
          <h2 className="text-base font-semibold text-white mb-5" data-testid="text-login-heading">
            Sign in to continue
          </h2>

          {/* Role selector */}
          <div className="mb-5">
            <label className="block text-[11px] text-slate-400 mb-2">Login as:</label>
            <div className="grid grid-cols-5 gap-1 p-1 bg-[#0a1628] border border-white/10 rounded-md">
              {ROLES.map((r) => {
                const active = r === role;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    data-testid={`tab-role-${r.toLowerCase()}`}
                    className={`px-1 py-1.5 text-[11px] sm:text-xs rounded transition-colors text-center truncate ${
                      active
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Username">
              <Input
                type="text"
                placeholder="Your username"
                className="h-11 bg-[#0a1628] border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-primary"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                data-testid="input-login-username"
              />
            </Field>

            <Field label="Password">
              <Input
                type="password"
                placeholder="Enter your password"
                className="h-11 bg-[#0a1628] border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-primary"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                data-testid="input-login-password"
              />
            </Field>

            {error && (
              <div
                className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-sm text-red-300"
                data-testid="text-login-error"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={loading}
              data-testid="button-login-submit"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Authenticating...</>
              ) : (
                <>Sign in <ArrowRight className="w-4 h-4 ml-2" /></>
              )}
            </Button>
          </form>

          <p className="text-[11px] text-slate-500 text-center mt-5">
            Access restricted to authorised personnel of Bullfrog Group.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] text-slate-400">{label}</label>
      {children}
    </div>
  );
}
