import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
Select,
SelectContent,SelectItem,SelectTrigger,
SelectValue
} from "@/components/ui/select";

import {
Accordion,
AccordionContent,
AccordionItem,
AccordionTrigger,
} from "@/components/ui/accordion";
import {
Eye,ClipboardList,
Landmark,Package,Ship
} from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function CoaForm() {
  const {
    selectedType,
    title,
    setTitle,
    commodity,
    setCommodity,
    origin,
    setOrigin,
    quantity,
    setQuantity,
    loadingPort,
    setLoadingPort,
    dischargePort,
    setDischargePort,
    analysisAgency,
    setAnalysisAgency,
    coaLinkedLcId,
    setCoaLinkedLcId,
    coaCertNo,
    setCoaCertNo,
    coaVessel,
    setCoaVessel,
    coaBlDate,
    setCoaBlDate,
    coaInspPeriod,
    setCoaInspPeriod,
    coaLoadPeriod,
    setCoaLoadPeriod,
    coaChemSpecs,
    setCoaChemSpecs,
    coaMoisture,
    setCoaMoisture,
    coaPhysicalSizes,
    setCoaPhysicalSizes,
    coaPacking,
    setCoaPacking,
    reviewContent,
    fillCoaFromLc,
    buildPayload,
    previewDoc,
    docs,
  } = useDocGen();

  return (
    <>
          {selectedType && !reviewContent && selectedType.value === "COA" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>
              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input placeholder="Enter COA document title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-coa-title" />
              </div>

              {/* LC Link & Cert No */}
              <div className="border rounded-md overflow-hidden">
                <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                  <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                </div>
                <div className="grid grid-cols-[160px_1fr] border-b">
                  <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center gap-1"><Landmark className="w-3 h-3" /> Linked LC</div>
                  <div className="p-1">
                    {docs && docs.filter(d => d.docType === "LC").length > 0 ? (
                      <Select value={coaLinkedLcId} onValueChange={(val) => {
                        setCoaLinkedLcId(val);
                        const lcDoc = docs?.find(d => d.id === val);
                        if (lcDoc) fillCoaFromLc(lcDoc);
                      }}>
                        <SelectTrigger className="h-8 text-xs" data-testid="select-coa-lc"><SelectValue placeholder="Select LC to auto-fill fields..." /></SelectTrigger>
                        <SelectContent>
                          {docs?.filter(d => d.docType === "LC").map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-muted-foreground p-1">No LC documents found — fill fields manually below</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-[160px_1fr]">
                  <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Cert No.</div>
                  <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={`COA-${new Date().getFullYear()}-001`} value={coaCertNo} onChange={(e) => setCoaCertNo(e.target.value)} data-testid="input-coa-cert-no" /></div>
                </div>
              </div>

              <Accordion type="multiple" defaultValue={["goods","voyage","specs"]} className="w-full">
                <AccordionItem value="goods" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Description of Goods</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                      </div>
                      {[
                        { label: "Commodity Name", val: commodity, set: setCommodity, ph: "e.g. Iron Ore, Bauxite", tid: "input-coa-commodity" },
                        { label: "Quantity (MT)", val: quantity, set: setQuantity, ph: "e.g. 200,000", tid: "input-coa-quantity" },
                        { label: "Country of Origin", val: origin, set: setOrigin, ph: "e.g. Guinea", tid: "input-coa-origin" },
                        { label: "Packing", val: coaPacking, set: setCoaPacking, ph: "e.g. In Bulk", tid: "input-coa-packing" },
                      ].map(({ label, val, set, ph, tid }, i, arr) => (
                        <div key={tid} className={`grid grid-cols-[160px_1fr]${i < arr.length - 1 ? " border-b" : ""}`}>
                          <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">{label}</div>
                          <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={ph} value={val} onChange={(e) => set(e.target.value)} data-testid={tid} /></div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="voyage" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Ship className="w-3.5 h-3.5" /> Vessel & Ports</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                      </div>
                      {[
                        { label: "Vessel Name", val: coaVessel, set: setCoaVessel, ph: "e.g. MV BULLFROG STAR", tid: "input-coa-vessel" },
                        { label: "Port of Loading", val: loadingPort, set: setLoadingPort, ph: "e.g. Conakry, Guinea", tid: "input-coa-pol" },
                        { label: "Port of Discharge", val: dischargePort, set: setDischargePort, ph: "e.g. Port Klang, Malaysia", tid: "input-coa-pod" },
                        { label: "B/L Date", val: coaBlDate, set: setCoaBlDate, ph: "e.g. 10.05.2026", tid: "input-coa-bl-date" },
                        { label: "Inspection Period", val: coaInspPeriod, set: setCoaInspPeriod, ph: "e.g. 01.05.2026 to 10.05.2026", tid: "input-coa-insp-period" },
                        { label: "Loading Period", val: coaLoadPeriod, set: setCoaLoadPeriod, ph: "e.g. 01.05.2026 to 05.05.2026", tid: "input-coa-load-period" },
                        { label: "Analysis Agency", val: analysisAgency, set: setAnalysisAgency, ph: "e.g. SGS / Bureau Veritas", tid: "input-coa-agency" },
                      ].map(({ label, val, set, ph, tid }, i, arr) => (
                        <div key={tid} className={`grid grid-cols-[160px_1fr]${i < arr.length - 1 ? " border-b" : ""}`}>
                          <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">{label}</div>
                          <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={ph} value={val} onChange={(e) => set(e.target.value)} data-testid={tid} /></div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="specs" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Test Results & Specifications</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3 space-y-3">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1 block">Chemical Compositions (one per line, e.g. Fe2O3 : 55.00 PCT)</Label>
                      <textarea
                        className="w-full border rounded-md text-xs p-2 font-mono bg-background resize-y min-h-[100px] focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder={"Fe2O3    :    55.00   PCT\nAl2O3    :    3.50   PCT\nSiO2    :    8.20   PCT\nTiO2    :    0.08   PCT\nMnO     :    0.06   PCT"}
                        value={coaChemSpecs}
                        onChange={(e) => setCoaChemSpecs(e.target.value)}
                        data-testid="textarea-coa-chem-specs"
                      />
                    </div>
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Free Moisture (PCT)</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 8.50" value={coaMoisture} onChange={(e) => setCoaMoisture(e.target.value)} data-testid="input-coa-moisture" /></div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1 block">Physical Sizes (one per line, e.g. ABOVE 50MM : 0.50 PCT)</Label>
                      <textarea
                        className="w-full border rounded-md text-xs p-2 font-mono bg-background resize-y min-h-[80px] focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder={"ABOVE 50MM  :    0.50   PCT\nBELOW 150MICRON  :    3.20   PCT\nABOVE 10.00 MM   :    85.00   PCT"}
                        value={coaPhysicalSizes}
                        onChange={(e) => setCoaPhysicalSizes(e.target.value)}
                        data-testid="textarea-coa-physical-sizes"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" size="sm" onClick={() => previewDoc.mutate(buildPayload())} disabled={!title || previewDoc.isPending} data-testid="button-review-coa">
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  {previewDoc.isPending ? "Loading Preview..." : "Review COA"}
                </Button>
              </div>
            </div>
          )}
    </>
  );
}
