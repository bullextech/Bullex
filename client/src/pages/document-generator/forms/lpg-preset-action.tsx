import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LPG_REVIEW_NOTICE, lpgDocumentPreset } from "@shared/lpg-format";
import { parseSpecRows } from "@/lib/spec-rows";
import { useDocGen } from "../use-doc-gen";

export function LpgPresetAction({ kind }: { kind: "LOI" | "FCO" }) {
  const f = useDocGen();
  const apply = () => {
    const p = lpgDocumentPreset(kind);
    const fields = [
      [f.commodity, f.setCommodity, p.commodity], [f.origin, f.setOrigin, p.origin],
      [f.quantity, f.setQuantity, p.quantity], [f.blPacking, f.setBlPacking, p.packing],
      [f.loadingPort, f.setLoadingPort, p.loadingPort], [f.dischargePort, f.setDischargePort, p.dischargePort],
      [f.laycan, f.setLaycan, p.laycan], [f.price, f.setPrice, p.price],
      [f.currency, f.setCurrency, p.currency], [f.incoterm, f.setIncoterm, p.incoterm],
      [f.paymentTerms, f.setPaymentTerms, p.paymentTerms], [f.validity, f.setValidity, p.validity],
      [f.contractConfirmation, f.setContractConfirmation, p.contractConfirmation],
      [f.docsForPayment, f.setDocsForPayment, p.docsForPayment],
      [f.otherTerms, f.setOtherTerms, p.otherTerms], [f.compliance, f.setCompliance, p.compliance],
      [f.specialNote, f.setSpecialNote, p.specialNote],
    ] as const;
    for (const [value, setter, sample] of fields) if (!value.trim()) setter(sample);
    if (!f.qualitySpecs.trim() && f.specRows.every(r => !r.parameter && !r.specification && !r.rejection && !r.testMethod)) {
      f.setQualitySpecs(p.qualitySpecs);
      f.setSpecRows(parseSpecRows(p.qualitySpecs)!);
    }
  };
  return <div className="rounded-md border bg-muted/30 p-3 space-y-2">
    <p className="text-xs text-muted-foreground">{LPG_REVIEW_NOTICE}</p>
    <Button type="button" variant="outline" size="sm" onClick={apply} data-testid={`apply-lpg-${kind.toLowerCase()}`}>Apply LPG sample format</Button>
    {kind === "FCO" && <details>
      <summary className="cursor-pointer text-sm">Validity, documentation and execution terms</summary>
      {([
        ["Offer validity", f.validity, f.setValidity],
        ["Contract confirmation", f.contractConfirmation, f.setContractConfirmation],
        ["Documents for payment", f.docsForPayment, f.setDocsForPayment],
        ["Other terms & conditions", f.otherTerms, f.setOtherTerms],
        ["Compliance", f.compliance, f.setCompliance],
      ] as const).map(([label, value, setter]) => <div className="space-y-1 mt-3" key={label}>
        <Label>{label}<Textarea aria-label={label} value={value} onChange={e => setter(e.target.value)} /></Label>
      </div>)}
    </details>}
  </div>;
}