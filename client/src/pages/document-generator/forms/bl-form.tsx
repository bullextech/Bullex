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
Eye,X,Building2,FileSignature,Package,Anchor
} from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function BlForm() {
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
    blNotifyParty,
    setBlNotifyParty,
    blPacking,
    setBlPacking,
    blCharterPartyDate,
    setBlCharterPartyDate,
    blFreightAdvance,
    setBlFreightAdvance,
    blLoadingTimeDays,
    setBlLoadingTimeDays,
    blLoadingTimeHours,
    setBlLoadingTimeHours,
    blPlaceOfIssue,
    setBlPlaceOfIssue,
    blDateOfIssue,
    setBlDateOfIssue,
    blCompanyOnBehalf,
    setBlCompanyOnBehalf,
    blMasterOfVessel,
    setBlMasterOfVessel,
    blAgentsName,
    setBlAgentsName,
    reviewContent,
    approvedClients,
    fillFromKyc,
    resetForm,
    previewDoc,
    handleReview,
  } = useDocGen();

  return (
    <>
          {selectedType && !reviewContent && selectedType.value === "BL" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>
              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input placeholder="Enter BL document title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-doc-title" />
              </div>

              <Accordion type="multiple" defaultValue={["shipper","consignee","cargo","shipping","issuance"]} className="w-full">

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
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Shipper</div>
                        <div className="p-1">
                          {approvedClients.length > 0 && (
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "seller"); }}>
                              <SelectTrigger className="h-7 text-xs mb-1" data-testid="select-bl-shipper-kyc"><SelectValue placeholder="Auto-fill from KYC..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Shipper company name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} data-testid="input-bl-shipper" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Consignee</div>
                        <div className="p-1">
                          {approvedClients.length > 0 && (
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "buyer"); }}>
                              <SelectTrigger className="h-7 text-xs mb-1" data-testid="select-bl-consignee-kyc"><SelectValue placeholder="Auto-fill from KYC..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Consignee company name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} data-testid="input-bl-consignee" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Notify Address</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Notify party / address" value={blNotifyParty} onChange={(e) => setBlNotifyParty(e.target.value)} data-testid="input-bl-notify-party" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="cargo" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Cargo & Vessel</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Vessel Name</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. MV BULLFROG STAR" value={blVesselName} onChange={(e) => setBlVesselName(e.target.value)} data-testid="input-bl-vessel" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Port of Loading</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Port of Conakry, Guinea" value={loadingPort} onChange={(e) => setLoadingPort(e.target.value)} data-testid="input-bl-loading-port" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Port of Discharge</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Port Klang, Malaysia" value={dischargePort} onChange={(e) => setDischargePort(e.target.value)} data-testid="input-bl-discharge-port" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Commodity Name</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Iron Ore, Copper Cathode" value={commodity} onChange={(e) => setCommodity(e.target.value)} data-testid="input-bl-commodity" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Quantity (MT)</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 50,000" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="input-bl-quantity" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Country of Origin</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Guinea, Zambia" value={origin} onChange={(e) => setOrigin(e.target.value)} data-testid="input-bl-origin" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Packing</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Bulk, In Bags (50kg PP Woven Bags)" value={blPacking} onChange={(e) => setBlPacking(e.target.value)} data-testid="input-bl-packing" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="shipping" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Anchor className="w-3.5 h-3.5" /> Freight & Loading</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Charter Party Date</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={`e.g. ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`} value={blCharterPartyDate} onChange={(e) => setBlCharterPartyDate(e.target.value)} data-testid="input-bl-cp-date" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Freight Advance</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. USD 250,000" value={blFreightAdvance} onChange={(e) => setBlFreightAdvance(e.target.value)} data-testid="input-bl-freight-advance" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Loading Time (Days)</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 5" value={blLoadingTimeDays} onChange={(e) => setBlLoadingTimeDays(e.target.value)} data-testid="input-bl-loading-days" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Loading Time (Hours)</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 12" value={blLoadingTimeHours} onChange={(e) => setBlLoadingTimeHours(e.target.value)} data-testid="input-bl-loading-hours" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="issuance" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><FileSignature className="w-3.5 h-3.5" /> Issuance & Signature</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Place of Issue</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Dubai, UAE" value={blPlaceOfIssue} onChange={(e) => setBlPlaceOfIssue(e.target.value)} data-testid="input-bl-place-issue" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Date of Issue</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={`e.g. ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`} value={blDateOfIssue} onChange={(e) => setBlDateOfIssue(e.target.value)} data-testid="input-bl-date-issue" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Company on Behalf</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Company signing as master's agent" value={blCompanyOnBehalf} onChange={(e) => setBlCompanyOnBehalf(e.target.value)} data-testid="input-bl-company-behalf" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Master of Vessel</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Vessel name for 'Master of ___'" value={blMasterOfVessel} onChange={(e) => setBlMasterOfVessel(e.target.value)} data-testid="input-bl-master-vessel" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Agents Name</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Shipping agents company name" value={blAgentsName} onChange={(e) => setBlAgentsName(e.target.value)} data-testid="input-bl-agents-name" /></div>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2 px-1">Fixed content: B/L No. 01 · THREE (3) originals · CONGENBILL conditions of carriage (General Paramount, General Average, New Jason, Both-to-Blame) are auto-included.</p>
                  </AccordionContent>
                </AccordionItem>

              </Accordion>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={resetForm} data-testid="button-cancel-generate">
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Cancel
                </Button>
                <Button onClick={handleReview} disabled={previewDoc.isPending} data-testid="button-review-doc">
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  {previewDoc.isPending ? "Loading Preview..." : "Review BL"}
                </Button>
              </div>
            </div>
          )}
    </>
  );
}
