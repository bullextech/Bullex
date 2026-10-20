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
Eye,Building2,Package,Ship
} from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function CooForm() {
  const {
    selectedType,
    title,
    setTitle,
    buyerName,
    setBuyerName,
    sellerName,
    setSellerName,
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
    blVesselName,
    setBlVesselName,
    blPacking,
    setBlPacking,
    cooLinkedBlId,
    setCooLinkedBlId,
    cooCertNo,
    setCooCertNo,
    reviewContent,
    approvedClients,
    fillCooFromBl,
    fillFromKyc,
    buildPayload,
    previewDoc,
    docs,
  } = useDocGen();

  return (
    <>
          {selectedType && !reviewContent && selectedType.value === "COO" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>
              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input placeholder="Enter COO document title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-coo-title" />
              </div>

              {/* BL Link & Cert No */}
              <div className="border rounded-md overflow-hidden">
                <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                  <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                </div>
                <div className="grid grid-cols-[160px_1fr] border-b">
                  <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center gap-1"><Ship className="w-3 h-3" /> Linked BL</div>
                  <div className="p-1">
                    {docs && docs.filter(d => d.docType === "BL").length > 0 ? (
                      <Select value={cooLinkedBlId} onValueChange={(val) => {
                        setCooLinkedBlId(val);
                        const blDoc = docs?.find(d => d.id === val);
                        if (blDoc) fillCooFromBl(blDoc);
                      }}>
                        <SelectTrigger className="h-8 text-xs" data-testid="select-coo-bl"><SelectValue placeholder="Select BL to auto-fill fields..." /></SelectTrigger>
                        <SelectContent>
                          {docs?.filter(d => d.docType === "BL").map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-muted-foreground p-1">No BL documents found — fill fields manually below</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-[160px_1fr]">
                  <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Cert No.</div>
                  <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={`COO-${new Date().getFullYear()}-001`} value={cooCertNo} onChange={(e) => setCooCertNo(e.target.value)} data-testid="input-coo-cert-no" /></div>
                </div>
              </div>

              <Accordion type="multiple" defaultValue={["shipper","cargo"]} className="w-full">
                <AccordionItem value="shipper" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Shipper & Consignee</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Shipper (Seller)</div>
                        <div className="p-1">
                          {approvedClients.length > 0 && (
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "seller"); }}>
                              <SelectTrigger className="h-7 text-xs mb-1" data-testid="select-coo-shipper-kyc"><SelectValue placeholder="Auto-fill from KYC..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Shipper / Seller name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} data-testid="input-coo-shipper" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Consignee</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. TO ORDER" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} data-testid="input-coo-consignee" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="cargo" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Cargo & Voyage</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                      </div>
                      {[
                        { label: "Vessel Name", val: blVesselName, set: setBlVesselName, ph: "e.g. MV BULLFROG STAR", tid: "input-coo-vessel" },
                        { label: "Port of Loading", val: loadingPort, set: setLoadingPort, ph: "e.g. Port of Conakry, Guinea", tid: "input-coo-loading-port" },
                        { label: "Port of Discharge", val: dischargePort, set: setDischargePort, ph: "e.g. Port Klang, Malaysia", tid: "input-coo-discharge-port" },
                        { label: "Commodity Name", val: commodity, set: setCommodity, ph: "e.g. Iron Ore, Copper Cathode", tid: "input-coo-commodity" },
                        { label: "Quantity (MT)", val: quantity, set: setQuantity, ph: "e.g. 50,000", tid: "input-coo-quantity" },
                        { label: "Country of Origin", val: origin, set: setOrigin, ph: "e.g. Guinea, Zambia", tid: "input-coo-origin" },
                        { label: "Packing", val: blPacking, set: setBlPacking, ph: "e.g. Bulk", tid: "input-coo-packing" },
                      ].map(({ label, val, set, ph, tid }, i, arr) => (
                        <div key={tid} className={`grid grid-cols-[160px_1fr]${i < arr.length - 1 ? " border-b" : ""}`}>
                          <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">{label}</div>
                          <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={ph} value={val} onChange={(e) => set(e.target.value)} data-testid={tid} /></div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" size="sm" onClick={() => previewDoc.mutate(buildPayload())} disabled={!title || previewDoc.isPending} data-testid="button-review-coo">
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  {previewDoc.isPending ? "Loading Preview..." : "Review COO"}
                </Button>
              </div>
            </div>
          )}
    </>
  );
}
