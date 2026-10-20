import { Button } from "@/components/ui/button";
import { serializeSpecRows } from "@/lib/spec-rows";
import { COPPER_CATHODE_NOTICE, copperCathodePreset } from "@shared/copper-cathodes";
import { useDocGen } from "../use-doc-gen";

export function CopperPresetAction() {
  const f = useDocGen();
  return <div className="rounded-md border bg-muted/30 p-3 space-y-2">
    <p className="text-xs text-muted-foreground">{COPPER_CATHODE_NOTICE}</p>
    <Button type="button" variant="outline" size="sm" data-testid="apply-copper-document" onClick={() => {
      const preset = copperCathodePreset({
        product: f.commodity, origin: f.origin, packing: f.blPacking, specifications: f.qualitySpecs,
      }, f.specRows, message => window.confirm(message));
      if (!preset) return;
      f.setCommodity(preset.product);
      f.setOrigin(preset.origin);
      f.setBlPacking(preset.packing);
      f.setSpecRows(preset.specRows);
      f.setQualitySpecs(serializeSpecRows(preset.specRows));
    }}>Apply uploaded copper cathodes specifications</Button>
  </div>;
}