import { useEffect, useState } from "react";
import { Download, Smartphone, Monitor, Chrome } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios" | "android" | "desktop";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

export function InstallAppButton({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [showHelp, setShowHelp] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");

  useEffect(() => {
    setPlatform(detectPlatform());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const handleClick = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        if (outcome === "accepted") setInstalled(true);
        setDeferred(null);
        return;
      } catch {
        // fall through to help
      }
    }
    setShowHelp(true);
  };

  const Steps = () => {
    if (platform === "ios") {
      return (
        <>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Smartphone className="w-4 h-4 text-primary" /> iPhone / iPad (Safari)
          </div>
          <ol className="space-y-2.5 text-sm">
            <Step n={1}>Open this page in <strong>Safari</strong> (not Chrome or in-app browser).</Step>
            <Step n={2}>Tap the <strong>Share</strong> icon at the bottom of the screen.</Step>
            <Step n={3}>Scroll and tap <strong>"Add to Home Screen"</strong>, then <strong>Add</strong>.</Step>
          </ol>
        </>
      );
    }
    if (platform === "android") {
      return (
        <>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Smartphone className="w-4 h-4 text-primary" /> Android (Chrome)
          </div>
          <ol className="space-y-2.5 text-sm">
            <Step n={1}>Open this page in <strong>Chrome</strong>.</Step>
            <Step n={2}>Tap the <strong>⋮ menu</strong> in the top-right corner.</Step>
            <Step n={3}>Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</Step>
          </ol>
        </>
      );
    }
    return (
      <>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Monitor className="w-4 h-4 text-primary" /> Desktop (Chrome / Edge)
        </div>
        <ol className="space-y-2.5 text-sm">
          <Step n={1}>Look for the <strong>install icon</strong> <Chrome className="inline w-3.5 h-3.5 -mt-0.5" /> in the address bar (right side).</Step>
          <Step n={2}>Or open the browser <strong>⋮ menu</strong> → <strong>"Install Bullex…"</strong> / <strong>"Apps → Install this site as an app"</strong>.</Step>
          <Step n={3}>Confirm <strong>Install</strong>. Bullex will open in its own window.</Step>
        </ol>
      </>
    );
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={handleClick}
        className={`h-8 gap-1.5 ${className ?? ""}`}
        data-testid="button-install-app"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="text-xs font-semibold">Install App</span>
      </Button>

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-4 h-4 text-primary" /> Install Bullex on your device
            </DialogTitle>
            <DialogDescription>
              Bullex installs from your browser — no app store needed. Once installed, it launches full-screen from your home screen or app list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Steps />
          </div>
          <div className="mt-4 p-3 rounded-md bg-muted/50 border text-xs text-muted-foreground">
            <strong className="text-foreground">Note:</strong> Install only works on the live site
            (<code className="text-[10px]">bullex.tech</code> or your deployed URL), not inside this preview window.
            Open the live URL on your phone to install.
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center flex-shrink-0">
        {n}
      </span>
      <span className="flex-1 pt-0.5">{children}</span>
    </li>
  );
}
