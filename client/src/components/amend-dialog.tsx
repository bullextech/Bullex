import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Landmark, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAmendMode, formatAmendCountdown } from "@/hooks/use-amend-mode";

export type AmendField = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "email" | "tel" | "select" | "bank-list";
  options?: string[];
  colSpan?: 1 | 2;
};

type AmendBankEntry = {
  bankName: string;
  bankBranch: string;
  bankAddress: string;
  accountName: string;
  accountNumber: string;
  swiftCode: string;
  bankAccountCurrency: string;
  bankOfficerName: string;
  bankOfficerEmail: string;
};

const EMPTY_BANK: AmendBankEntry = {
  bankName: "",
  bankBranch: "",
  bankAddress: "",
  accountName: "",
  accountNumber: "",
  swiftCode: "",
  bankAccountCurrency: "",
  bankOfficerName: "",
  bankOfficerEmail: "",
};

const BANK_FIELDS: { key: keyof AmendBankEntry; label: string; type?: "email" }[] = [
  { key: "bankName", label: "Bank Name" },
  { key: "bankBranch", label: "Branch" },
  { key: "bankAddress", label: "Bank Address" },
  { key: "accountName", label: "Account Name" },
  { key: "accountNumber", label: "Account Number" },
  { key: "swiftCode", label: "SWIFT Code" },
  { key: "bankAccountCurrency", label: "Currency" },
  { key: "bankOfficerName", label: "Bank Officer Name" },
  { key: "bankOfficerEmail", label: "Bank Officer Email", type: "email" },
];

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

  // `initialValues` is assembled inline by several parent pages, so its object
  // identity changes whenever amend mode's countdown ticks. Reset only when the
  // dialog opens or switches records; otherwise every keystroke is wiped out.
  useEffect(() => {
    if (open) setValues(initialValues);
  }, [open, endpoint]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const res = await apiRequest("PATCH", endpoint, payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
      });
      toast({
        title: "Amendment saved",
        description: data?.reapprovalRequired
          ? "Identity details changed. The record is now pending and must be screened again."
          : "Record has been updated.",
      });
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
        const oldStr = f.type === "bank-list"
          ? JSON.stringify(Array.isArray(oldVal) ? oldVal : [])
          : oldVal === null || oldVal === undefined ? "" : String(oldVal);
        const newStr = f.type === "bank-list"
          ? JSON.stringify(Array.isArray(newVal) ? newVal : [])
          : newVal === null || newVal === undefined ? "" : String(newVal);
        if (oldStr !== newStr) {
          out[f.key] = f.type === "bank-list"
            ? (Array.isArray(newVal) ? newVal : [])
            : newVal === "" ? null : newVal;
        }
      }
    }
    return out;
  };

  const handleSave = () => {
    const changes = diff();
    if (Object.keys(changes).length === 0) {
      toast({ title: "No changes", description: "Modify at least one field to save." });
      return;
    }
    // Pass the already-computed payload through the unlock callback. Calling
    // handleSave again would reuse the pre-unlock `unlocked` closure and reopen
    // the password prompt instead of saving.
    if (!unlocked) {
      requestUnlock(() => saveMutation.mutate(changes));
      return;
    }
    saveMutation.mutate(changes);
  };

  const setField = (key: string, val: any) => setValues((v) => ({ ...v, [key]: val }));
  const updateBank = (fieldKey: string, index: number, key: keyof AmendBankEntry, value: string) => {
    const banks: AmendBankEntry[] = Array.isArray(values[fieldKey]) ? values[fieldKey] : [];
    setField(fieldKey, banks.map((bank, i) => i === index ? { ...bank, [key]: value } : bank));
  };

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
                  <div key={f.key} className={f.colSpan === 2 || f.type === "textarea" || f.type === "bank-list" ? "sm:col-span-2" : ""}>
                    <Label htmlFor={`amend-${f.key}`} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {f.label}
                    </Label>
                    {f.type === "bank-list" ? (
                      <div className="mt-2 space-y-3" data-testid={`amend-bank-list-${f.key}`}>
                        {(Array.isArray(values[f.key]) ? values[f.key] : []).map((bank: AmendBankEntry, index: number) => (
                          <div key={index} className="border border-border bg-muted/20 p-3 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <Landmark className="w-4 h-4 text-primary" />
                                <span className="text-xs font-bold uppercase tracking-wider">Additional Bank {index + 2}</span>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs text-destructive hover:text-destructive"
                                onClick={() => {
                                  const banks: AmendBankEntry[] = Array.isArray(values[f.key]) ? values[f.key] : [];
                                  setField(f.key, banks.filter((_: AmendBankEntry, i: number) => i !== index));
                                }}
                                data-testid={`button-remove-amend-bank-${index}`}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                              </Button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {BANK_FIELDS.map((bankField) => (
                                <div key={bankField.key} className={bankField.key === "bankAddress" ? "sm:col-span-2" : ""}>
                                  <Label htmlFor={`amend-${f.key}-${index}-${bankField.key}`} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {bankField.label}
                                  </Label>
                                  <Input
                                    id={`amend-${f.key}-${index}-${bankField.key}`}
                                    type={bankField.type ?? "text"}
                                    value={bank?.[bankField.key] ?? ""}
                                    onChange={(e) => updateBank(f.key, index, bankField.key, e.target.value)}
                                    className="mt-1"
                                    data-testid={`amend-bank-${index}-${bankField.key}`}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-none h-9 text-xs font-bold uppercase tracking-wider"
                          onClick={() => {
                            const banks: AmendBankEntry[] = Array.isArray(values[f.key]) ? values[f.key] : [];
                            setField(f.key, [...banks, { ...EMPTY_BANK }]);
                          }}
                          data-testid="button-add-amend-bank"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Another Bank
                        </Button>
                      </div>
                    ) : f.type === "textarea" ? (
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
