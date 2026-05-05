import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Cloud, RefreshCw, Loader2, ExternalLink, CloudUpload,
  Database, CheckCircle2, AlertCircle, FolderOpen, Clock,
} from "lucide-react";

interface BackupFile {
  name: string;
  size: number;
  lastModified: string;
  webUrl: string;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function DatabaseBackup() {
  const { toast } = useToast();
  const [lastResult, setLastResult] = useState<{ filename: string; sizeKb: number } | null>(null);

  const { data: backups = [], isLoading, refetch } = useQuery<BackupFile[]>({
    queryKey: ["/api/backup/list"],
    queryFn: () => fetch("/api/backup/list", { credentials: "include" }).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
  });

  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/backup/run"),
    onSuccess: async (res) => {
      const data = await res.json();
      setLastResult({ filename: data.filename, sizeKb: data.sizeKb });
      queryClient.invalidateQueries({ queryKey: ["/api/backup/list"] });
      toast({ title: "Backup Complete", description: `${data.filename} (${data.sizeKb} KB) uploaded to OneDrive.` });
    },
    onError: (err: any) => toast({ title: "Backup Failed", description: err.message, variant: "destructive" }),
  });

  const lbl = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border px-6 py-4 flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Cloud className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">Database Backup</h1>
            <p className="text-[10px] text-muted-foreground">Backup to Microsoft OneDrive · Bullex DB Backups folder</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh list"
            data-testid="btn-refresh-backups"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <Button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="rounded-none text-xs font-bold uppercase tracking-wider h-8"
            data-testid="btn-run-backup"
          >
            {runMutation.isPending
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Backing up...</>
              : <><CloudUpload className="w-3.5 h-3.5 mr-1.5" />Run Backup Now</>}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-3xl">

        {/* Status cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-border rounded-lg p-4 bg-muted/10">
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-3.5 h-3.5 text-primary" />
              <p className={lbl}>Total Backups</p>
            </div>
            <p className="text-2xl font-bold">{backups.length}</p>
          </div>
          <div className="border border-border rounded-lg p-4 bg-muted/10">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <p className={lbl}>Last Backup</p>
            </div>
            <p className="text-xs font-semibold">
              {backups[0] ? fmtDate(backups[0].lastModified) : "Never"}
            </p>
          </div>
          <div className="border border-border rounded-lg p-4 bg-muted/10">
            <div className="flex items-center gap-2 mb-1">
              <FolderOpen className="w-3.5 h-3.5 text-primary" />
              <p className={lbl}>OneDrive Folder</p>
            </div>
            <p className="text-xs font-semibold truncate">Bullex DB Backups</p>
          </div>
        </div>

        {/* Last run result */}
        {lastResult && (
          <div className="flex items-center gap-3 border border-green-500/30 bg-green-500/5 rounded-lg p-4">
            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-green-700 dark:text-green-400">Backup uploaded successfully</p>
              <p className="text-[10px] text-muted-foreground">{lastResult.filename} · {lastResult.sizeKb} KB</p>
            </div>
          </div>
        )}

        {/* What gets backed up */}
        <div className="border border-border rounded-lg p-4 space-y-2 bg-muted/10">
          <p className={lbl}>What gets backed up</p>
          <p className="text-xs text-muted-foreground">
            All data is exported as a single JSON file and uploaded to your OneDrive under the <strong>Bullex DB Backups</strong> folder. Each backup is a complete snapshot of the database.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {["KYC Applications","KYC Documents","Trades","Trade Documents","Trade Enquiries","Registrations","Team Members","Team Documents","Team KYC","Document Vault","Change Requests"].map(t => (
              <span key={t} className="px-2 py-0.5 text-[10px] bg-muted border border-border rounded font-medium">{t}</span>
            ))}
          </div>
        </div>

        {/* Backup list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className={lbl}>Backup History</p>
            {isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>

          {!isLoading && backups.length === 0 ? (
            <div className="border border-border rounded-lg p-8 text-center">
              <AlertCircle className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No backups yet. Run your first backup above.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {backups.map((b, i) => (
                <div
                  key={b.name}
                  className="flex items-center gap-3 border border-border rounded-lg px-4 py-3 bg-background hover:bg-muted/20 transition-colors"
                  data-testid={`backup-row-${i}`}
                >
                  <Database className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{b.name}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtDate(b.lastModified)} · {fmtSize(b.size)}</p>
                  </div>
                  {i === 0 && <Badge className="bg-primary/10 text-primary text-[9px] px-1.5 flex-shrink-0">Latest</Badge>}
                  {b.webUrl && (
                    <a
                      href={b.webUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
                      title="Open in OneDrive"
                      data-testid={`btn-open-backup-${i}`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
