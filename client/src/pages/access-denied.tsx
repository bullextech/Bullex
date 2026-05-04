import { ShieldX } from "lucide-react";
import { useLocation } from "wouter";

export default function AccessDenied() {
  const [, setLocation] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <ShieldX className="w-7 h-7 text-destructive" />
      </div>
      <h2 className="text-lg font-bold mb-1">Access Restricted</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        You do not have permission to access this module. Contact your administrator to request access.
      </p>
      <button
        onClick={() => setLocation("/dashboard")}
        className="mt-6 px-5 py-2 bg-primary text-primary-foreground text-xs font-bold rounded hover:bg-primary/90 transition-colors"
      >
        Go to Dashboard
      </button>
    </div>
  );
}
