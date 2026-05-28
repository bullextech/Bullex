import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallAppButton({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
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

  const canPrompt = !!deferred;
  const ios = isIos();

  if (!canPrompt && !ios) return null;

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferred(null);
    } else if (ios) {
      setShowIosHelp(true);
    }
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

      <Dialog open={showIosHelp} onOpenChange={setShowIosHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-primary" /> Install Bullex on iPhone / iPad
            </DialogTitle>
            <DialogDescription>
              iOS doesn't allow one-tap install — follow these three quick steps:
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm mt-2">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
              <span>Open this page in <strong>Safari</strong> (not Chrome).</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
              <span>Tap the <strong>Share</strong> icon at the bottom of the screen.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
              <span>Choose <strong>“Add to Home Screen”</strong> and confirm.</span>
            </li>
          </ol>
          <p className="text-xs text-muted-foreground mt-2">
            The Bullex icon will appear on your home screen and launch full-screen, just like a native app.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
