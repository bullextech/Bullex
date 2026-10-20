import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardCheck, Plus, ChevronLeft, Trash2, Loader2, ShieldAlert,
  CheckCircle2, FileText, ListChecks,
} from "lucide-react";
import type { ChecklistTemplate, ChecklistRecord, ChecklistProgress, ChecklistStageDef } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const ITEM_STATUSES = [
  { value: "pending", label: "Pending", className: "text-gray-500 bg-gray-100" },
  { value: "received", label: "Received", className: "text-blue-600 bg-blue-50" },
  { value: "verified", label: "Verified", className: "text-green-600 bg-green-50" },
  { value: "na", label: "N/A", className: "text-amber-600 bg-amber-50" },
] as const;

const EMPTY_PROGRESS: ChecklistProgress = { items: {}, actions: {}, riskControls: {} };

function normalizeProgress(p: ChecklistProgress | null | undefined): ChecklistProgress {
  return {
    items: p?.items ?? {},
    actions: p?.actions ?? {},
    riskControls: p?.riskControls ?? {},
  };
}

function countProgress(template: ChecklistTemplate, progress: ChecklistProgress) {
  let total = 0, done = 0;
  (template.stages || []).forEach((stage, si) => {
    stage.items.forEach((_item, ii) => {
      total++;
      const st = progress.items[`s${si}i${ii}`]?.status;
      if (st === "verified" || st === "received" || st === "na") done++;
    });
    stage.actions.forEach((_a, ai) => {
      total++;
      if (progress.actions[`s${si}a${ai}`]) done++;
    });
  });
  (template.riskControls || []).forEach((_r, ri) => {
    total++;
    if (progress.riskControls[String(ri)]) done++;
  });
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

function StatusPill({ status }: { status?: string }) {
  const s = ITEM_STATUSES.find((x) => x.value === status) ?? ITEM_STATUSES[0];
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${s.className}`}>{s.label}</span>;
}

export default function Checklists() {
  const { toast } = useToast();
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCommodity, setNewCommodity] = useState("");
  const [newReference, setNewReference] = useState("");
  const [newTemplateId, setNewTemplateId] = useState("");

  const { data: templates = [], isLoading: templatesLoading } = useQuery<ChecklistTemplate[]>({
    queryKey: ["/api/checklist-templates"],
  });
  const { data: records = [], isLoading: recordsLoading } = useQuery<ChecklistRecord[]>({
    queryKey: ["/api/checklist-records"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/checklist-records", {
        templateId: newTemplateId || templates[0]?.id,
        title: newTitle,
        commodity: newCommodity,
        reference: newReference || undefined,
      });
      return res.json();
    },
    onSuccess: (record: ChecklistRecord) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-records"] });
      setCreateOpen(false);
      setNewTitle("");
      setNewCommodity("");
      setNewReference("");
      setOpenRecordId(record.id);
    },
    onError: (e: any) => toast({ title: "Could not create checklist", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/checklist-records/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-records"] });
      toast({ title: "Checklist deleted" });
    },
    onError: (e: any) => toast({ title: "Could not delete checklist", description: e.message, variant: "destructive" }),
  });

  const openRecord = records.find((r) => r.id === openRecordId);
  const openTemplate = openRecord ? templates.find((t) => t.id === openRecord.templateId) : undefined;

  if (openRecord && openTemplate) {
    return (
      <ChecklistForm
        key={openRecord.id}
        record={openRecord}
        template={openTemplate}
        onBack={() => setOpenRecordId(null)}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-checklists-title">
              <ClipboardCheck className="w-6 h-6 text-primary" /> Procurement Checklists
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track supplier due-diligence and documentary compliance stage by stage before releasing any payment instrument.
            </p>
          </div>
          <Button onClick={() => { setNewTemplateId(templates[0]?.id || ""); setCreateOpen(true); }} disabled={templatesLoading || templates.length === 0} data-testid="button-new-checklist">
            <Plus className="w-4 h-4 mr-2" /> New Checklist
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="w-4 h-4" /> Checklist Heads
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {templatesLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
            ) : templates.map((t) => (
              <div key={t.id} className="border rounded-lg p-4" data-testid={`card-template-${t.id}`}>
                <div className="font-semibold">{t.name}</div>
                {t.description && <div className="text-sm text-muted-foreground mt-0.5">{t.description}</div>}
                {t.objective && <div className="text-xs text-muted-foreground mt-2 italic">Objective: {t.objective}</div>}
                <div className="flex gap-2 mt-3 flex-wrap">
                  <Badge variant="secondary">{t.stages.length} stages</Badge>
                  <Badge variant="secondary">{t.stages.reduce((n, s) => n + s.items.length, 0)} documents</Badge>
                  {(t.riskControls?.length ?? 0) > 0 && <Badge variant="secondary">{t.riskControls.length} risk controls</Badge>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> Checklist Forms
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recordsLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
            ) : records.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No checklist forms yet. Click "New Checklist" to start one from a checklist head.
              </div>
            ) : records.map((r) => {
              const template = templates.find((t) => t.id === r.templateId);
              const stats = template ? countProgress(template, normalizeProgress(r.progress)) : null;
              return (
                <div key={r.id} className="border rounded-lg p-4 flex items-center gap-4 flex-wrap hover:bg-muted/40 cursor-pointer" onClick={() => setOpenRecordId(r.id)} data-testid={`card-record-${r.id}`}>
                  <div className="flex-1 min-w-[220px]">
                    <div className="font-semibold flex items-center gap-2">
                      {r.title}
                      {r.status === "completed" && <Badge className="bg-green-100 text-green-700 hover:bg-green-100"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {r.commodity ? `${r.commodity} · ` : ""}{r.reference ? `Ref: ${r.reference} · ` : ""}{template?.name || "Checklist"} · {new Date(r.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  {stats && (
                    <div className="w-40">
                      <Progress value={stats.pct} className="h-2" />
                      <div className="text-xs text-muted-foreground mt-1">{stats.done}/{stats.total} · {stats.pct}%</div>
                    </div>
                  )}
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); if (confirm("Delete this checklist form?")) deleteMutation.mutate(r.id); }} data-testid={`button-delete-record-${r.id}`}>
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Checklist Form</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Checklist Head</Label>
              <Select value={newTemplateId || templates[0]?.id || ""} onValueChange={setNewTemplateId}>
                <SelectTrigger data-testid="select-template"><SelectValue placeholder="Select a checklist head" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Supplier LLP — March shipment" data-testid="input-record-title" />
            </div>
            <div className="space-y-1.5">
              <Label>Product / Commodity *</Label>
              <Input value={newCommodity} onChange={(e) => setNewCommodity(e.target.value)} placeholder="e.g. Sulphur, Urea, Copper Cathodes" data-testid="input-record-commodity" />
            </div>
            <div className="space-y-1.5">
              <Label>Reference (optional)</Label>
              <Input value={newReference} onChange={(e) => setNewReference(e.target.value)} placeholder="Enquiry / deal / supplier reference" data-testid="input-record-reference" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!newTitle.trim() || !newCommodity.trim() || createMutation.isPending} data-testid="button-create-record">
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChecklistForm({ record, template, onBack }: { record: ChecklistRecord; template: ChecklistTemplate; onBack: () => void }) {
  const { toast } = useToast();
  const [progress, setProgress] = useState<ChecklistProgress>(() => normalizeProgress(record.progress));
  const [notes, setNotes] = useState(record.notes || "");
  const [dirty, setDirty] = useState(false);

  const stats = useMemo(() => countProgress(template, progress), [template, progress]);

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      progress?: {
        items?: Record<string, { status: string; note?: string }>;
        actions?: Record<string, boolean>;
        riskControls?: Record<string, boolean>;
      };
      notes?: string;
      status?: string;
    }) => {
      const res = await apiRequest("PATCH", `/api/checklist-records/${record.id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-records"] });
      setDirty(false);
    },
    onError: (e: any) => toast({ title: "Could not save checklist", description: e.message, variant: "destructive" }),
  });

  // The server merges progress DELTAS, so each save only sends the keys that
  // changed — concurrent/out-of-order saves can't clobber other entries.
  const setItem = (key: string, patch: Partial<{ status: string; note: string }>, save = true) => {
    setProgress((p) => {
      const prev = p.items[key] ?? { status: "pending" };
      const entry = { ...prev, ...patch };
      if (save) saveMutation.mutate({ progress: { items: { [key]: entry } } });
      return { ...p, items: { ...p.items, [key]: entry } };
    });
  };

  const setAction = (key: string, checked: boolean) => {
    setProgress((p) => ({ ...p, actions: { ...p.actions, [key]: checked } }));
    saveMutation.mutate({ progress: { actions: { [key]: checked } } });
  };

  const setRiskControl = (key: string, checked: boolean) => {
    setProgress((p) => ({ ...p, riskControls: { ...p.riskControls, [key]: checked } }));
    saveMutation.mutate({ progress: { riskControls: { [key]: checked } } });
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-1" data-testid="button-back">
              <ChevronLeft className="w-4 h-4 mr-1" /> All checklists
            </Button>
            <h1 className="text-xl font-bold" data-testid="text-record-title">{record.title}</h1>
            <p className="text-sm text-muted-foreground">{record.commodity ? `${record.commodity} · ` : ""}{template.name}{record.reference ? ` · Ref: ${record.reference}` : ""}</p>
          </div>
          <div className="text-right space-y-2">
            <div className="w-48">
              <Progress value={stats.pct} className="h-2" />
              <div className="text-xs text-muted-foreground mt-1">{stats.done}/{stats.total} complete · {stats.pct}%</div>
            </div>
            <Button
              size="sm"
              variant={record.status === "completed" ? "outline" : "default"}
              onClick={() => saveMutation.mutate({ status: record.status === "completed" ? "in_progress" : "completed" })}
              data-testid="button-toggle-complete"
            >
              {record.status === "completed" ? "Reopen" : "Mark Completed"}
            </Button>
          </div>
        </div>

        {template.objective && (
          <Card className="bg-muted/40">
            <CardContent className="p-4 text-sm"><span className="font-semibold">Objective: </span>{template.objective}</CardContent>
          </Card>
        )}

        {template.stages.map((stage: ChecklistStageDef, si: number) => (
          <Card key={si}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{stage.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {stage.items.map((item, ii) => {
                  const key = `s${si}i${ii}`;
                  const st = progress.items[key];
                  return (
                    <div key={key} className="border rounded-md p-3 flex items-start gap-3 flex-wrap" data-testid={`row-item-${key}`}>
                      <div className="flex-1 min-w-[200px]">
                        <div className="text-sm font-medium">{item.label}</div>
                        {item.purpose && <div className="text-xs text-muted-foreground">{item.purpose}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusPill status={st?.status} />
                        <Select value={st?.status || "pending"} onValueChange={(v) => setItem(key, { status: v })}>
                          <SelectTrigger className="w-32 h-8" data-testid={`select-status-${key}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ITEM_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        className="h-8 w-full sm:w-56"
                        placeholder="Remarks"
                        value={st?.note || ""}
                        onChange={(e) => setItem(key, { note: e.target.value }, false)}
                        onBlur={() => setItem(key, {})}
                        data-testid={`input-note-${key}`}
                      />
                    </div>
                  );
                })}
              </div>
              {stage.actions.length > 0 && (
                <div className="border-t pt-3 space-y-2">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Buyer Action</div>
                  {stage.actions.map((action, ai) => {
                    const key = `s${si}a${ai}`;
                    return (
                      <label key={key} className="flex items-start gap-2 text-sm cursor-pointer" data-testid={`row-action-${key}`}>
                        <Checkbox
                          checked={!!progress.actions[key]}
                          onCheckedChange={(v) => setAction(key, v === true)}
                          className="mt-0.5"
                        />
                        <span className={progress.actions[key] ? "line-through text-muted-foreground" : ""}>{action}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {(template.riskControls?.length ?? 0) > 0 && (
          <Card className="border-amber-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-amber-700">
                <ShieldAlert className="w-4 h-4" /> Buyer Risk-Control Checklist (Critical Controls)
              </CardTitle>
              <p className="text-xs text-muted-foreground">Before issuing an LC or any other payment instrument, confirm that:</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {template.riskControls.map((rc, ri) => (
                <label key={ri} className="flex items-start gap-2 text-sm cursor-pointer" data-testid={`row-risk-${ri}`}>
                  <Checkbox
                    checked={!!progress.riskControls[String(ri)]}
                    onCheckedChange={(v) => setRiskControl(String(ri), v === true)}
                    className="mt-0.5"
                  />
                  <span className={progress.riskControls[String(ri)] ? "line-through text-muted-foreground" : ""}>{rc}</span>
                </label>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} rows={4} placeholder="General notes for this checklist…" data-testid="input-notes" />
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={() => saveMutation.mutate({ notes })} disabled={!dirty || saveMutation.isPending} data-testid="button-save-notes">
                {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Notes
              </Button>
              {saveMutation.isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
