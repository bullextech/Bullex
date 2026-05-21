import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Pencil, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAmendMode, formatAmendCountdown } from "@/hooks/use-amend-mode";

export type AmendField = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "email" | "tel" | "select";
  options?: string[];
  colSpan?: 1 | 2;
};

export type AmendSection = {
  title: string;
  fields: AmendField[];
};

interface AmendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  endpoint: string;
  invalidateKeys: (string | (string | number)[])[];
  sections: AmendSection[];
  initialValues: Record<string, any>;
}

export function AmendDialog({
  open, onOpenChange, title, description, endpoint, invalidateKeys, sections, initialValues,
}: AmendDialogProps) {
  const { toast } = useToast();
  const { unlocked, remainingMs, requestUnlock } = useAmendMode();
  const [values, setValues] = useState<Record<string, any>>(initialValues);

  useEffect(() => { if (open) setValues(initialValues); }, [open, initialValues]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const res = await apiRequest("PATCH", endpoint, payload);
      return res.json();
    },
    onSuccess: () => {
      invalidateKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
      });
      toast({ title: "Amendment saved", description: "Record has been updated." });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Amendment failed", description: err.message, variant: "destructive" });
    },
  });

  const diff = (): Record<string, any> => {
    const out: Record<string, any> = {};
    for (const section of sections) {
      for (const f of section.fields) {
        const oldVal = initialValues[f.key] ?? null;
        const newVal = values[f.key] ?? null;
        const oldStr = oldVal === null || oldVal === undefined ? "" : String(oldVal);
        const newStr = newVal === null || newVal === undefined ? "" : String(newVal);
        if (oldStr !== newStr) out[f.key] = newVal === "" ? null : newVal;
      }
    }
    return out;
  };

  const handleSave = () => {
    if (!unlocked) { requestUnlock(handleSave); return; }
    const changes = diff();
    if (Object.keys(changes).length === 0) {
      toast({ title: "No changes", description: "Modify at least one field to save." });
      return;
    }
    saveMutation.mutate(changes);
  };

  const setField = (key: string, val: any) => setValues((v) => ({ ...v, [key]: val }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saveMutation.isPending) onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" /> {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
          {unlocked && (
            <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400" data-testid="text-amend-countdown">
              Amend mode unlocked · {formatAmendCountdown(remainingMs)} remaining
            </p>
          )}
        </DialogHeader>

        <div className="space-y-5 py-2">
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
                {section.title}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {section.fields.map((f) => (
                  <div key={f.key} className={f.colSpan === 2 || f.type === "textarea" ? "sm:col-span-2" : ""}>
                    <Label htmlFor={`amend-${f.key}`} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {f.label}
                    </Label>
                    {f.type === "textarea" ? (
                      <Textarea
                        id={`amend-${f.key}`}
                        value={values[f.key] ?? ""}
                        onChange={(e) => setField(f.key, e.target.value)}
                        rows={3}
                        className="mt-1"
                        data-testid={`amend-input-${f.key}`}
                      />
                    ) : f.type === "select" ? (
                      <Select value={values[f.key] ?? ""} onValueChange={(v) => setField(f.key, v)}>
                        <SelectTrigger id={`amend-${f.key}`} className="mt-1" data-testid={`amend-select-${f.key}`}>
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(f.options ?? []).map((o) => (
                            <SelectItem key={o} value={o}>{o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={`amend-${f.key}`}
                        type={f.type ?? "text"}
                        value={values[f.key] ?? ""}
                        onChange={(e) => setField(f.key, e.target.value)}
                        className="mt-1"
                        data-testid={`amend-input-${f.key}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saveMutation.isPending} data-testid="btn-amend-dialog-cancel">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="btn-amend-dialog-save">
            {saveMutation.isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</> : <><Save className="w-4 h-4 mr-1.5" /> Save Amendment</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
