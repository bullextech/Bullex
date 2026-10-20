import { useEffect, useState } from "react";
import { Plus, Trash2, FileSignature, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDocGen } from "../use-doc-gen";

type Category = "commercial_terms" | "price" | "payment_terms" | "delivery" | "documentation" | "entity" | "banking" | "governing_law" | "specific_clause" | "custom_clause";
type Amendment = { category: Category; clauseNumber: string; description: string; existingProvision: string; amendedProvision: string };
const categories: Array<{ value: Category; label: string }> = [
  { value: "commercial_terms", label: "Commercial terms" }, { value: "price", label: "Price" },
  { value: "payment_terms", label: "Payment terms" }, { value: "delivery", label: "Delivery" },
  { value: "documentation", label: "Documentation" }, { value: "entity", label: "Entity / party" },
  { value: "banking", label: "Banking" }, { value: "governing_law", label: "Governing law" },
  { value: "specific_clause", label: "Specific clause" }, { value: "custom_clause", label: "Custom clause" },
];
const blank = (): Amendment => ({ category: "specific_clause", clauseNumber: "", description: "", existingProvision: "", amendedProvision: "" });

export default function AddendumDialog() {
  const { addendumSpaId, setAddendumSpaId, docs, createAddendum } = useDocGen();
  const [addendumNumber, setAddendumNumber] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [amendments, setAmendments] = useState<Amendment[]>([blank()]);
  const [error, setError] = useState("");
  const spa = docs?.find((doc) => doc.id === addendumSpaId);

  useEffect(() => {
    if (addendumSpaId) {
      setAddendumNumber(""); setEffectiveDate(""); setAmendments([blank()]); setError("");
    }
  }, [addendumSpaId]);

  const update = (index: number, patch: Partial<Amendment>) =>
    setAmendments((rows) => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  const submit = () => {
    const invalid = !effectiveDate || amendments.some((row) => !row.clauseNumber.trim() || !row.description.trim() || !row.amendedProvision.trim());
    if (invalid) {
      setError(!effectiveDate ? "An effective date is required." : "Complete the clause reference, description, and revised provision for each amendment.");
      return;
    }
    setError("");
    createAddendum.mutate({
      id: addendumSpaId!,
      data: { addendumNumber: addendumNumber.trim() || undefined, effectiveDate, amendments: amendments.map(({ existingProvision, ...row }) => ({ ...row, existingProvision: existingProvision.trim() || undefined })) },
    });
  };

  return (
    <Dialog open={!!addendumSpaId} onOpenChange={(open) => !open && setAddendumSpaId(null)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pr-7">
          <DialogTitle className="flex items-center gap-2"><FileSignature className="w-5 h-5 text-primary" /> Create SPA addendum</DialogTitle>
          <DialogDescription>
            Record only the clauses being changed. The addendum will become a separate document linked to {spa?.title || "this SPA"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-4">
            <label className="space-y-1.5 text-sm font-medium">Effective date <span className="text-destructive">*</span>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} data-testid="input-addendum-effective-date" />
              <span className="block text-xs font-normal text-muted-foreground">When these revisions take legal effect.</span>
            </label>
            <label className="space-y-1.5 text-sm font-medium">Addendum number <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              <Input value={addendumNumber} onChange={(e) => setAddendumNumber(e.target.value)} placeholder="e.g. 02" data-testid="input-addendum-number" />
              <span className="block text-xs font-normal text-muted-foreground">Leave blank to assign this later.</span>
            </label>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div><h3 className="text-sm font-semibold">Amendment schedule</h3><p className="text-xs text-muted-foreground mt-0.5">Each row is a deliberate change to one SPA provision.</p></div>
            <Button type="button" variant="outline" size="sm" onClick={() => setAmendments((rows) => [...rows, blank()])}><Plus className="w-3.5 h-3.5 mr-1.5" /> Add clause</Button>
          </div>
          <div className="space-y-4">
            {amendments.map((row, index) => (
              <div key={index} className="rounded-lg border p-4 space-y-3 relative">
                <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amendment {index + 1}</p>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" disabled={amendments.length === 1} onClick={() => setAmendments((rows) => rows.filter((_, i) => i !== index))} aria-label={`Remove amendment ${index + 1}`}><Trash2 className="w-4 h-4" /></Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-3">
                  <label className="space-y-1.5 text-xs font-medium">Change category
                    <Select value={row.category} onValueChange={(value: Category) => update(index, { category: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}</SelectContent></Select>
                  </label>
                  <label className="space-y-1.5 text-xs font-medium">Clause number / reference <span className="text-destructive">*</span>
                    <Input value={row.clauseNumber} onChange={(e) => update(index, { clauseNumber: e.target.value })} placeholder="e.g. 4.2 or Schedule 1" />
                  </label>
                </div>
                <label className="block space-y-1.5 text-xs font-medium">Short description of the change <span className="text-destructive">*</span>
                  <Input value={row.description} onChange={(e) => update(index, { description: e.target.value })} placeholder="e.g. Revise shipment window for the second lift" />
                </label>
                <label className="block space-y-1.5 text-xs font-medium">Existing provision <span className="font-normal text-muted-foreground">(optional — quote the current wording)</span>
                  <Textarea value={row.existingProvision} onChange={(e) => update(index, { existingProvision: e.target.value })} placeholder="Current SPA wording, if useful for comparison" className="min-h-[68px] text-sm" />
                </label>
                <label className="block space-y-1.5 text-xs font-medium">Revised provision <span className="text-destructive">*</span>
                  <Textarea value={row.amendedProvision} onChange={(e) => update(index, { amendedProvision: e.target.value })} placeholder="The exact wording that will replace or amend the existing provision" className="min-h-[84px] text-sm" />
                </label>
              </div>
            ))}
          </div>
          {error && <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setAddendumSpaId(null)}>Cancel</Button>
          <Button onClick={submit} disabled={createAddendum.isPending}>{createAddendum.isPending ? "Creating addendum..." : "Create addendum"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}