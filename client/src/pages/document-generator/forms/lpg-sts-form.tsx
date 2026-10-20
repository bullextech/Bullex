import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LPG_STS_REFERENCE, LPG_STS_SAMPLE, LPG_STS_WARNINGS } from "@shared/lpg-sts";
import { useDocGen } from "../use-doc-gen";

export function LpgStsForm() {
  const f = useDocGen();
  const sample = () => {
    if (!f.commodity) f.setCommodity(LPG_STS_SAMPLE.commodity);
    if (!f.quantity) f.setQuantity(LPG_STS_SAMPLE.quantity);
    if (!f.dischargePort) f.setDischargePort(LPG_STS_SAMPLE.dischargePort);
    if (!f.incoterm) f.setIncoterm(LPG_STS_SAMPLE.incoterm);
    if (!f.paymentTerms) f.setPaymentTerms(LPG_STS_SAMPLE.paymentTerms);
  };
  return <section className="space-y-3 rounded-lg border p-4" data-testid="spa-draft-selector">
    <Label>SPA draft format</Label>
    <Select value={f.spaVariant} onValueChange={v => { f.setSpaVariant(v); }}>
      <SelectTrigger data-testid="select-spa-variant"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="standard">Standard SPA</SelectItem>
        <SelectItem value="lpg-sts">LPG SPA — STS Basis</SelectItem>
      </SelectContent>
    </Select>
    {f.spaVariant === "lpg-sts" && <>
      <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-xs text-blue-950 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100" data-testid="notice-lpg-sts-clearance">
        This is an editable, unsaved draft. It has no legal/commercial clearance. After saving, an administrator must review every flagged point against the exact saved content before signing, finalization, or bank-draft generation is enabled.
      </div>
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 space-y-2" role="alert">
        {LPG_STS_WARNINGS.map(w => <p key={w}>{w}</p>)}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={sample}>Fill empty commercial fields with SAMPLE terms</Button>
      <p className="text-xs text-muted-foreground">Selected transaction parties and entered commercial fields are preserved. Empty fields use marked sample defaults where stated, otherwise blanks. Edit the Product Details below and every clause or annexure here. Summary changes do not rewrite negotiated clauses: reconcile both before submitting for legal review.</p>
      <div className="grid grid-cols-2 gap-3">
        {([
          ["reference", "SPA reference", ""],
          ["issueDate", "Issue date (defaults to today)", ""],
          ["mainPremium", "Main CP premium USD/MT — SAMPLE", "70.00"],
          ["provisionalPremium", "Provisional CP premium USD/MT — SAMPLE", "50.00"],
          ["producer", "Producer (no reference identity)", ""],
        ] as const).map(([key, label, fallback]) => <div key={key} className="space-y-1">
          <Label htmlFor={`lpg-sts-${key}`}>{label}</Label>
          <Input id={`lpg-sts-${key}`} value={f.lpgSts[key] ?? fallback} onChange={e => f.setLpgSts(prev => ({ ...prev, [key]: e.target.value }))} />
        </div>)}
      </div>
      <p className="text-xs text-muted-foreground">All 30 accepted-revision clauses and both annexures are editable below. Keep numbering and table separators. Tokens such as {"{{quantity}}"}, {"{{origin}}"}, {"{{laycan}}"}, {"{{dischargePort}}"}, {"{{mainPremium}}"} and {"{{sellerBank}}"} resolve from the current form. Blank notice/contact, account, terminal, vessel and timing details must be completed for your transaction. Annexure II includes the full receiving terminal data sheet.</p>
      <div className="max-h-[480px] overflow-y-auto space-y-2">
        {LPG_STS_REFERENCE.map((original, index) => <details key={index} className="rounded border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">{original.split("\n")[0]}</summary>
          <Textarea aria-label={`Edit ${original.split("\n")[0]}`} className="mt-2 font-mono text-xs" rows={14}
            value={f.lpgSts.sections?.[index] ?? original}
            onChange={e => {
              const text = e.target.value;
              f.setLpgSts(prev => {
                const sections = [...(prev.sections || LPG_STS_REFERENCE)];
                sections[index] = text;
                return { ...prev, sections };
              });
            }} />
        </details>)}
      </div>
    </>}
  </section>;
}