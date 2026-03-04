import { Shield } from "lucide-react";

export default function KycRegister() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">BULLEX</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
              Client KYC Registration
            </p>
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto py-12 px-6 text-center">
        <p className="text-muted-foreground">KYC Registration form coming soon.</p>
      </div>
      <div className="border-t border-border bg-muted/30 px-6 py-4 text-center">
        <p className="text-[10px] text-muted-foreground">
          Bullex is a proprietary platform of Bullfrog Group.
        </p>
      </div>
    </div>
  );
}
