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

export default function CowForm() {
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
    cowLinkedLcId,
    setCowLinkedLcId,
    cowCertNo,
    setCowCertNo,
    cowVessel,
    setCowVessel,
    cowBlDate,
    setCowBlDate,
    cowLoadPeriod,
    setCowLoadPeriod,
    cowMoisture,
    setCowMoisture,
    cowDryQty,
    setCowDryQty,
    cowPacking,
    setCowPacking,
    reviewContent,
    fillCowFromLc,
    buildPayload,
    previewDoc,
    docs,
  } = useDocGen();

  return (
    <>
          {selectedType && !reviewContent && selectedType.value === "COW" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>
              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input placeholder="Enter COW document title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-cow-title" />
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
                      <Select value={cowLinkedLcId} onValueChange={(val) => {
                        setCowLinkedLcId(val);
                        const lcDoc = docs?.find(d => d.id === val);
                        if (lcDoc) fillCowFromLc(lcDoc);
                      }}>
                        <SelectTrigger className="h-8 text-xs" data-testid="select-cow-lc"><SelectValue placeholder="Select LC to auto-fill fields..." /></SelectTrigger>
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
                  <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={`COW-${new Date().getFullYear()}-001`} value={cowCertNo} onChange={(e) => setCowCertNo(e.target.value)} data-testid="input-cow-cert-no" /></div>
                </div>
              </div>

              <Accordion type="multiple" defaultValue={["goods","voyage","weight"]} className="w-full">
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
                        { label: "Commodity Name", val: commodity, set: setCommodity, ph: "e.g. Iron Ore, Bauxite", tid: "input-cow-commodity" },
                        { label: "Quantity (MT)", val: quantity, set: setQuantity, ph: "e.g. 200,000", tid: "input-cow-quantity" },
                        { label: "Country of Origin", val: origin, set: setOrigin, ph: "e.g. Guinea", tid: "input-cow-origin" },
                        { label: "Packing", val: cowPacking, set: setCowPacking, ph: "e.g. In Bulk", tid: "input-cow-packing" },
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
                        { label: "Vessel Name", val: cowVessel, set: setCowVessel, ph: "e.g. MV BULLFROG STAR", tid: "input-cow-vessel" },
                        { label: "Port of Loading", val: loadingPort, set: setLoadingPort, ph: "e.g. Conakry, Guinea", tid: "input-cow-pol" },
                        { label: "Port of Discharge", val: dischargePort, set: setDischargePort, ph: "e.g. Port Klang, Malaysia", tid: "input-cow-pod" },
                        { label: "B/L Date", val: cowBlDate, set: setCowBlDate, ph: "e.g. 10.05.2026", tid: "input-cow-bl-date" },
                        { label: "Analysis Agency", val: analysisAgency, set: setAnalysisAgency, ph: "e.g. SGS / Bureau Veritas", tid: "input-cow-agency" },
                      ].map(({ label, val, set, ph, tid }, i, arr) => (
                        <div key={tid} className={`grid grid-cols-[160px_1fr]${i < arr.length - 1 ? " border-b" : ""}`}>
                          <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">{label}</div>
                          <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={ph} value={val} onChange={(e) => set(e.target.value)} data-testid={tid} /></div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="weight" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Weight Survey Results</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Loading Period</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 01.05.2026    TO   10.05.2026" value={cowLoadPeriod} onChange={(e) => setCowLoadPeriod(e.target.value)} data-testid="input-cow-load-period" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Free Moisture (PCT)</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 8.50" value={cowMoisture} onChange={(e) => setCowMoisture(e.target.value)} data-testid="input-cow-moisture" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Dry Quantity (MT)</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 183,500.000" value={cowDryQty} onChange={(e) => setCowDryQty(e.target.value)} data-testid="input-cow-dry-qty" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" size="sm" onClick={() => previewDoc.mutate(buildPayload())} disabled={!title || previewDoc.isPending} data-testid="button-review-cow">
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  {previewDoc.isPending ? "Loading Preview..." : "Review COW"}
                </Button>
              </div>
            </div>
          )}
    </>
  );
}
