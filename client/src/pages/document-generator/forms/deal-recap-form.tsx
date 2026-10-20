import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
FileText,Eye,X,FileSignature,ClipboardList,
Landmark,
BadgeDollarSign,Package,
Plus,
Trash2
} from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function DealRecapForm() {
  const {
    selectedType,
    title,
    setTitle,
    buyerName,
    setBuyerName,
    buyerAddress,
    setBuyerAddress,
    buyerContact,
    setBuyerContact,
    buyerBank,
    setBuyerBank,
    buyerSwift,
    setBuyerSwift,
    sellerName,
    setSellerName,
    sellerAddress,
    setSellerAddress,
    sellerContact,
    setSellerContact,
    sellerBank,
    setSellerBank,
    sellerSwift,
    setSellerSwift,
    commodity,
    setCommodity,
    origin,
    setOrigin,
    quantity,
    setQuantity,
    qualitySpecs,
    setQualitySpecs,
    specRows,
    price,
    setPrice,
    currency,
    setCurrency,
    paymentTerms,
    setPaymentTerms,
    recapValidity,
    setRecapValidity,
    deliveryBasis,
    setDeliveryBasis,
    loadingWindow,
    setLoadingWindow,
    shippingTerms,
    setShippingTerms,
    governingLaw,
    setGoverningLaw,
    specialNote,
    setSpecialNote,
    blPacking,
    setBlPacking,
    reviewContent,
    updateSpecRow,
    addSpecRow,
    removeSpecRow,
    urlTradeRef,
    approvedClients,
    fillFromKyc,
    resetForm,
    previewDoc,
    handleReview,
  } = useDocGen();

  return (
    <>
          {selectedType && !reviewContent && selectedType.value === "DEAL_RECAP" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>
              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input placeholder="Enter Deal Recap document title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-doc-title" />
              </div>

              <Accordion type="multiple" defaultValue={["ch1","ch2","ch3","ch4","signatory","annex"]} className="w-full">

                <AccordionItem value="ch1" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Chapter I — Introductory & Background</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[140px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Item</div><div className="p-2">Description</div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Contract Reference</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Auto-filled from trade or enter manually" value={urlTradeRef || ""} readOnly={!!urlTradeRef} data-testid="input-contract-ref" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Effective Date</div>
                        <div className="p-2 text-xs text-muted-foreground flex items-center">Date of last authorized signature</div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Seller</div>
                        <div className="p-1">
                          {approvedClients.length > 0 && (
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "seller"); }}>
                              <SelectTrigger className="h-7 text-xs mb-1" data-testid="select-seller-kyc-trigger"><SelectValue placeholder="Select from KYC..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Seller company name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} data-testid="input-seller-name" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Buyer</div>
                        <div className="p-1">
                          {approvedClients.length > 0 && (
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "buyer"); }}>
                              <SelectTrigger className="h-7 text-xs mb-1" data-testid="select-buyer-kyc-trigger"><SelectValue placeholder="Select from KYC..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Buyer company name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} data-testid="input-buyer-name" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Legal Model</div>
                        <div className="p-2 text-xs text-muted-foreground flex items-center">Sales and Purchase Agreement (SPA)</div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Recap Validity</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Valid for 5 calendar days from issuance" value={recapValidity} onChange={(e) => setRecapValidity(e.target.value)} data-testid="input-recap-validity" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="ch2" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Chapter II — Scope & Commercial Terms</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[140px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Item</div><div className="p-2">Description</div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Commodity</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Iron Ore, Copper Cathode, Gasoil 10ppm" value={commodity} onChange={(e) => setCommodity(e.target.value)} data-testid="input-commodity" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Country of Origin</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Russia, Guinea, Australia" value={origin} onChange={(e) => setOrigin(e.target.value)} data-testid="input-origin" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Quality / Spec</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Anode Grade, Fe 63.5% min" value={qualitySpecs} onChange={(e) => setQualitySpecs(e.target.value)} data-testid="input-quality-specs" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Delivery Basis</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. FOB Vessel, CIF Discharge Port" value={deliveryBasis} onChange={(e) => setDeliveryBasis(e.target.value)} data-testid="input-delivery-basis" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Contractual Qty</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 50,000 MT +/- 10%" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="input-quantity" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Packing</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. In Bulk / 50kg PP bags" value={blPacking} onChange={(e) => setBlPacking(e.target.value)} data-testid="input-core-packing" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="ch3" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><BadgeDollarSign className="w-3.5 h-3.5" /> Chapter III — Financial & Operational Arrangements</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[140px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Item</div><div className="p-2">Description</div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Price & Currency</div>
                        <div className="p-1 flex gap-1">
                          <Select value={currency} onValueChange={setCurrency}>
                            <SelectTrigger className="h-8 text-xs w-20" data-testid="select-currency"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="GBP">GBP</SelectItem><SelectItem value="CNY">CNY</SelectItem>
                              <SelectItem value="AED">AED</SelectItem>
                              <SelectItem value="CNY">CNY</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0 flex-1" placeholder="e.g. 250 per MT" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="input-price" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Payment Terms</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. LC at Sight, PB: 2%" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} data-testid="input-payment-terms" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Loading Window</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 10-15th March 2026" value={loadingWindow} onChange={(e) => setLoadingWindow(e.target.value)} data-testid="input-loading-window" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Shipping Terms</div>
                        <div className="p-1"><Textarea className="text-xs border-0 shadow-none focus-visible:ring-0 min-h-[60px]" placeholder={"Delivery Term: CIF\nPort of Discharge (POD): Qingdao, China"} value={shippingTerms} onChange={(e) => setShippingTerms(e.target.value)} rows={2} data-testid="input-shipping-terms" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="ch4" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Landmark className="w-3.5 h-3.5" /> Chapter IV — Miscellaneous & Boilerplate</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[140px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Item</div><div className="p-2">Description</div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Governing Law</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. DIFC Dubai, English Law, LCIA" value={governingLaw} onChange={(e) => setGoverningLaw(e.target.value)} data-testid="input-governing-law" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Industry Standards</div>
                        <div className="p-2 text-xs text-muted-foreground flex items-center">Applicable international industry standards and ICC rules</div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="signatory" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><FileSignature className="w-3.5 h-3.5" /> Signatory Details</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="border rounded-md overflow-hidden">
                        <div className="text-xs font-semibold p-2 bg-muted/60 border-b">For and on behalf of the Seller</div>
                        <div className="p-2 space-y-2">
                          <Input className="h-8 text-xs" placeholder="Seller company name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} data-testid="input-seller-name-sig" />
                          <Input className="h-8 text-xs" placeholder="Name & email (e.g. VK — VK@BULLFROG.AE)" value={sellerContact} onChange={(e) => setSellerContact(e.target.value)} data-testid="input-seller-contact" />
                          <Input className="h-8 text-xs" placeholder="Seller address" value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} data-testid="input-seller-address" />
                          <Input className="h-8 text-xs" placeholder="Bank name" value={sellerBank} onChange={(e) => setSellerBank(e.target.value)} data-testid="input-seller-bank" />
                          <Input className="h-8 text-xs" placeholder="SWIFT / BIC code" value={sellerSwift} onChange={(e) => setSellerSwift(e.target.value)} data-testid="input-seller-swift" />
                        </div>
                      </div>
                      <div className="border rounded-md overflow-hidden">
                        <div className="text-xs font-semibold p-2 bg-muted/60 border-b">For and on behalf of the Buyer</div>
                        <div className="p-2 space-y-2">
                          <Input className="h-8 text-xs" placeholder="Buyer company name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} data-testid="input-buyer-name-sig" />
                          <Input className="h-8 text-xs" placeholder="Name & email (e.g. VK — VK@BULLFROG.AE)" value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} data-testid="input-buyer-contact" />
                          <Input className="h-8 text-xs" placeholder="Buyer address" value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} data-testid="input-buyer-address" />
                          <Input className="h-8 text-xs" placeholder="Bank name" value={buyerBank} onChange={(e) => setBuyerBank(e.target.value)} data-testid="input-buyer-bank" />
                          <Input className="h-8 text-xs" placeholder="SWIFT / BIC code" value={buyerSwift} onChange={(e) => setBuyerSwift(e.target.value)} data-testid="input-buyer-swift" />
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="annex" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Annexure I — Commodity Specifications</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3 space-y-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_32px] bg-muted/50 border-b">
                        <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Parameter</div>
                        <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase border-l">Specification</div>
                        <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase border-l">Rejection Limit</div>
                        <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase border-l">Test Method</div>
                        <div className="border-l"></div>
                      </div>
                      {specRows.map((row, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_1fr_32px] border-b last:border-b-0">
                          <div className="p-0.5"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Fe" value={row.parameter} onChange={(e) => updateSpecRow(idx, "parameter", e.target.value)} data-testid={`input-annex-param-${idx}`} /></div>
                          <div className="p-0.5 border-l"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 63.5% min" value={row.specification} onChange={(e) => updateSpecRow(idx, "specification", e.target.value)} data-testid={`input-annex-spec-${idx}`} /></div>
                          <div className="p-0.5 border-l"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. < 60%" value={row.rejection} onChange={(e) => updateSpecRow(idx, "rejection", e.target.value)} data-testid={`input-annex-reject-${idx}`} /></div>
                          <div className="p-0.5 border-l"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. ISO 4689" value={row.testMethod} onChange={(e) => updateSpecRow(idx, "testMethod", e.target.value)} data-testid={`input-annex-method-${idx}`} /></div>
                          <div className="flex items-center justify-center border-l">
                            {specRows.length > 1 && (
                              <button type="button" onClick={() => removeSpecRow(idx)} className="text-muted-foreground hover:text-destructive" data-testid={`button-remove-annex-${idx}`}>
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={addSpecRow} data-testid="button-add-annex-row">
                      <Plus className="w-3 h-3 mr-1" />Add Row
                    </Button>
                    <Textarea className="text-xs" placeholder="Special Notes (optional)" value={specialNote} onChange={(e) => setSpecialNote(e.target.value)} rows={2} data-testid="input-special-note" />
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
                  {previewDoc.isPending ? "Loading Preview..." : "Review Deal Recap"}
                </Button>
              </div>
            </div>
          )}
    </>
  );
}
