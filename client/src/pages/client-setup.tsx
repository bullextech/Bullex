import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Shield, Loader2, CheckCircle2, XCircle, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";

type VerifyState =
  | { status: "loading" }
  | { status: "valid"; username: string; companyName: string; expiresAt: string }
  | { status: "invalid"; message: string };

export default function ClientSetup() {
  const [, params] = useRoute("/client-setup/:token");
  const [, navigate] = useLocation();
  const token = params?.token || "";
  const [verify, setVerify] = useState<VerifyState>({ status: "loading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setVerify({ status: "invalid", message: "Missing setup token." });
        return;
      }
      try {
        const r = await fetch(`/api/client/setup/${encodeURIComponent(token)}`);
        const j = await r.json();
        if (cancelled) return;
        if (r.ok && j.valid) {
          setVerify({ status: "valid", username: j.username, companyName: j.companyName, expiresAt: j.expiresAt });
        } else {
          setVerify({ status: "invalid", message: j.message || "This setup link is no longer valid." });
        }
      } catch (e: any) {
        if (!cancelled) setVerify({ status: "invalid", message: e?.message || "Could not verify the setup link." });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (password.length < 8) { setSubmitError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setSubmitError("The two passwords do not match."); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/client/setup/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Could not set password.");
      setDone(true);
    } catch (e: any) {
      setSubmitError(e?.message || "Could not set password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-background px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">BULLEX</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">Client Portal Setup</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md border border-border bg-card rounded-md shadow-sm overflow-hidden" data-testid="card-client-setup">
          <div className="border-b border-border bg-muted/30 px-5 py-4 flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-primary" />
            <div>
              <h2 className="text-sm font-bold tracking-tight">Set Your Portal Password</h2>
              <p className="text-[10px] text-muted-foreground">One-time secure account setup</p>
            </div>
          </div>

          <div className="p-5">
            {verify.status === "loading" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Verifying setup link...
              </div>
            )}

            {verify.status === "invalid" && (
              <div className="text-center py-6" data-testid="text-setup-invalid">
                <XCircle className="w-10 h-10 text-destructive mx-auto mb-2" />
                <p className="text-sm font-semibold mb-1">Link unavailable</p>
                <p className="text-xs text-muted-foreground">{verify.message}</p>
                <p className="text-[10px] text-muted-foreground mt-3">
                  Please contact <a href="mailto:team@bullex.tech" className="text-primary underline">team@bullex.tech</a> to request a new link.
                </p>
              </div>
            )}

            {verify.status === "valid" && done && (
              <div className="text-center py-6" data-testid="text-setup-success">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                <p className="text-sm font-semibold mb-1">Password set successfully</p>
                <p className="text-xs text-muted-foreground">You can now sign in to the Client Portal.</p>
                <Button
                  className="mt-4 rounded-none text-xs font-bold uppercase tracking-wider h-9"
                  onClick={() => navigate("/client-portal")}
                  data-testid="btn-setup-go-portal"
                >
                  Go to Client Portal
                </Button>
              </div>
            )}

            {verify.status === "valid" && !done && (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="text-xs text-muted-foreground border border-border bg-muted/30 rounded-md px-3 py-2">
                  <p>Welcome, <strong className="text-foreground">{verify.companyName}</strong></p>
                  <p className="mt-1">Username: <span className="font-mono">{verify.username}</span></p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider">New password</Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    data-testid="input-setup-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider">Confirm password</Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Re-enter your password"
                    required
                    data-testid="input-setup-confirm"
                  />
                </div>
                {submitError && (
                  <p className="text-xs text-destructive border border-destructive/20 bg-destructive/5 p-2" data-testid="text-setup-error">
                    {submitError}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-none text-xs font-bold uppercase tracking-wider h-10"
                  data-testid="btn-setup-submit"
                >
                  {submitting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Setting up...</> : "Set Password & Access Portal"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-muted/30 px-4 py-2 text-center">
        <p className="text-[10px] text-muted-foreground font-bold">Bullex is a proprietary platform of Bullfrog Group.</p>
      </footer>
    </div>
  );
}
