import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, ShieldCheck, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AmendStatus = { unlocked: boolean; until: number | null };

interface AmendModeCtx {
  unlocked: boolean;
  until: number | null;
  remainingMs: number;
  requestUnlock: (onUnlocked?: () => void) => void;
  lock: () => void;
  loading: boolean;
}

const Ctx = createContext<AmendModeCtx | null>(null);

export function AmendModeProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);
  const [now, setNow] = useState(Date.now());

  const { data, isLoading } = useQuery<AmendStatus>({
    queryKey: ["/api/admin/amend-status"],
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const unlocked = !!data?.unlocked;
  const until = data?.until ?? null;
  const remainingMs = until ? Math.max(0, until - now) : 0;

  useEffect(() => {
    if (!unlocked) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [unlocked]);

  useEffect(() => {
    if (unlocked && until && until <= now) {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/amend-status"] });
    }
  }, [unlocked, until, now]);

  const unlockMutation = useMutation({
    mutationFn: async (pw: string) => {
      const res = await apiRequest("POST", "/api/admin/amend-unlock", { password: pw });
      return res.json() as Promise<AmendStatus>;
    },
    onSuccess: (resp) => {
      queryClient.setQueryData(["/api/admin/amend-status"], resp);
      setDialogOpen(false);
      setPassword("");
      setError(null);
      toast({ title: "Amend mode unlocked", description: "Editable for 15 minutes." });
      pendingCallback?.();
      setPendingCallback(null);
    },
    onError: (err: Error) => {
      setError(err.message || "Incorrect password");
    },
  });

  const lockMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/amend-lock", {});
      return res.json() as Promise<AmendStatus>;
    },
    onSuccess: (resp) => {
      queryClient.setQueryData(["/api/admin/amend-status"], resp);
      toast({ title: "Amend mode locked" });
    },
  });

  const requestUnlock = useCallback((onUnlocked?: () => void) => {
    if (unlocked) { onUnlocked?.(); return; }
    setPendingCallback(() => onUnlocked ?? null);
    setError(null);
    setPassword("");
    setDialogOpen(true);
  }, [unlocked]);

  const value = useMemo<AmendModeCtx>(() => ({
    unlocked, until, remainingMs, requestUnlock,
    lock: () => lockMutation.mutate(),
    loading: isLoading,
  }), [unlocked, until, remainingMs, requestUnlock, isLoading, lockMutation]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open && !unlockMutation.isPending) {
          setDialogOpen(false);
          setPendingCallback(null);
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> Admin Amend Mode
            </DialogTitle>
            <DialogDescription>
              Re-enter the admin password to unlock editing of approved records for 15 minutes.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (password) unlockMutation.mutate(password); }} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="amend-password" className="text-xs font-semibold uppercase tracking-wider">Admin Password</Label>
              <Input
                id="amend-password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                autoFocus
                data-testid="input-amend-password"
                disabled={unlockMutation.isPending}
              />
              {error && (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> {error}
                </p>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={unlockMutation.isPending} data-testid="btn-amend-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={!password || unlockMutation.isPending} data-testid="btn-amend-unlock">
                {unlockMutation.isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Verifying…</> : <><Lock className="w-4 h-4 mr-1.5" /> Unlock</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

export function useAmendMode(): AmendModeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAmendMode must be used within AmendModeProvider");
  return v;
}

export function formatAmendCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
