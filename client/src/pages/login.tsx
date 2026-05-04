import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Lock, LogIn, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function Login() {
  const { login } = useAuth();
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
    if (!result.success) {
      setError(result.error || "Login failed");
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-lg bg-primary flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-login-title">BULLEX</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] mt-1">Platform Access</p>
        </div>

        <Card className="border">
          <CardContent className="p-8">
            <div className="flex items-center gap-2 mb-6">
              <Lock className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-primary">Authentication Required</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Username</label>
                <Input
                  type="text"
                  placeholder="Enter username"
                  className="rounded-none h-11 border-border"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  data-testid="input-login-username"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Password</label>
                <Input
                  type="password"
                  placeholder="Enter password"
                  className="rounded-none h-11 border-border"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  data-testid="input-login-password"
                />
              </div>

              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-sm text-destructive" data-testid="text-login-error">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full rounded-none h-12 text-sm font-bold uppercase tracking-wider"
                disabled={loading}
                data-testid="button-login-submit"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Authenticating...</>
                ) : (
                  <><LogIn className="w-4 h-4 mr-2" />Sign In</>
                )}
              </Button>
            </form>

            <p className="text-[10px] text-muted-foreground text-center mt-6">
              Access restricted to authorized personnel only.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
