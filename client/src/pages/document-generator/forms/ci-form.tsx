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
Eye,Building2,Landmark,
BadgeDollarSign,Ship
} from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function CiForm() {
  const {
    selectedType,
    piPreparationParentId,
    piPreparation,
    title,
    setTitle,
    buyerName,
    setBuyerName,
    buyerAddress,
    setBuyerAddress,
    buyerContact,
    setBuyerContact,
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
    loadingPort,
    setLoadingPort,
    dischargePort,
    setDischargePort,
    price,
    setPrice,
    currency,
    setCurrency,
    incoterm,
    setIncoterm,
    paymentTerms,
    setPaymentTerms,
    ciLinkedLcId,
    setCiLinkedLcId,
    ciInvoiceNo,
    setCiInvoiceNo,
    ciVessel,
    setCiVessel,
    ciVoyage,
    setCiVoyage,
    ciBlNo,
    setCiBlNo,
    ciBlDate,
    setCiBlDate,
    ciLcNo,
    setCiLcNo,
    ciLcBank,
    setCiLcBank,
    ciTolerance,
    setCiTolerance,
    ciTotalAmount,
    setCiTotalAmount,
    piInvoiceDate,
    setPiInvoiceDate,
    piSpaNumber,
    setPiSpaNumber,
    piValidUntil,
    setPiValidUntil,
    reviewContent,
    approvedClients,
    fillCiFromLc,
    fillFromKyc,
    buildPayload,
    previewDoc,
    previewProformaInvoice,
    handleReviewPreparedProformaInvoice,
    docs,
  } = useDocGen();
  const isProformaMode = !!piPreparationParentId;

  return (
    <>
          {selectedType && !reviewContent && selectedType.value === "CI" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {isProformaMode
                  ? "Review the SPA-derived details in the Commercial Invoice form before creating the linked Proforma Invoice."
                  : selectedType.description}
              </p>
              <div className="space-y-2">
                <Label>{isProformaMode ? "Proforma Invoice Title" : "Document Title"} *</Label>
                <Input placeholder={isProformaMode ? "Enter Proforma Invoice title" : "Enter Commercial Invoice title"} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-ci-title" />
              </div>

              <div className="border rounded-md overflow-hidden">
                <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                  <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                </div>
                {!isProformaMode && <div className="grid grid-cols-[160px_1fr] border-b">
                  <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center gap-1"><Landmark className="w-3 h-3" /> Linked LC</div>
                  <div className="p-1">
                    {docs && docs.filter(d => d.docType === "LC").length > 0 ? (
                      <Select value={ciLinkedLcId} onValueChange={(val) => {
                        setCiLinkedLcId(val);
                        const lcDoc = docs?.find(d => d.id === val);
                        if (lcDoc) fillCiFromLc(lcDoc);
                      }}>
                        <SelectTrigger className="h-8 text-xs" data-testid="select-ci-lc"><SelectValue placeholder="Select LC to auto-fill fields..." /></SelectTrigger>
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
                </div>}
                <div className={`grid grid-cols-[160px_1fr] ${isProformaMode ? "border-b" : ""}`}>
                  <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Invoice No.</div>
                  <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={`${isProformaMode ? "PI" : "CI"}-${new Date().getFullYear()}-001`} value={ciInvoiceNo} onChange={(e) => setCiInvoiceNo(e.target.value)} data-testid="input-ci-invoice-no" /></div>
                </div>
                {isProformaMode && <>
                  <div className="grid grid-cols-[160px_1fr] border-b">
                    <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Invoice Date</div>
                    <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" value={piInvoiceDate} onChange={(e) => setPiInvoiceDate(e.target.value)} data-testid="input-pi-invoice-date" /></div>
                  </div>
                  <div className="grid grid-cols-[160px_1fr] border-b">
                    <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">SPA Reference</div>
                    <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" value={piSpaNumber} onChange={(e) => setPiSpaNumber(e.target.value)} data-testid="input-pi-spa-reference" /></div>
                  </div>
                  <div className="grid grid-cols-[160px_1fr]">
                    <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Valid Until</div>
                    <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" value={piValidUntil} onChange={(e) => setPiValidUntil(e.target.value)} data-testid="input-pi-valid-until" /></div>
                  </div>
                </>}
              </div>

              <Accordion type="multiple" defaultValue={["parties","lc","shipment","goods"]} className="w-full">

                <AccordionItem value="parties" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Seller & Buyer</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3 space-y-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Seller (Beneficiary)</div><div className="p-2">Value</div>
                      </div>
                      {approvedClients.length > 0 && (
                        <div className="grid grid-cols-[160px_1fr] border-b">
                          <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Auto-fill from KYC</div>
                          <div className="p-1">
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "seller"); }}>
                              <SelectTrigger className="h-7 text-xs" data-testid="select-ci-seller-kyc"><SelectValue placeholder="Select registered entity..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                      {[
                        { label: "Company Name", val: sellerName, set: setSellerName, ph: "Seller company name", tid: "input-ci-seller-name" },
                        { label: "Address", val: sellerAddress, set: setSellerAddress, ph: "Seller address", tid: "input-ci-seller-addr" },
                        { label: "Contact", val: sellerContact, set: setSellerContact, ph: "Contact email / phone", tid: "input-ci-seller-contact" },
                        { label: "Bank", val: sellerBank, set: setSellerBank, ph: "Seller bank name", tid: "input-ci-seller-bank" },
                        { label: "SWIFT", val: sellerSwift, set: setSellerSwift, ph: "SWIFT/BIC code", tid: "input-ci-seller-swift" },
                      ].map(({ label, val, set, ph, tid }, i, arr) => (
                        <div key={tid} className={`grid grid-cols-[160px_1fr]${i < arr.length - 1 ? " border-b" : ""}`}>
                          <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">{label}</div>
                          <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={ph} value={val} onChange={(e) => set(e.target.value)} data-testid={tid} /></div>
                        </div>
                      ))}
                    </div>
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Buyer (Applicant)</div><div className="p-2">Value</div>
                      </div>
                      {approvedClients.length > 0 && (
                        <div className="grid grid-cols-[160px_1fr] border-b">
                          <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Auto-fill from KYC</div>
                          <div className="p-1">
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "buyer"); }}>
                              <SelectTrigger className="h-7 text-xs" data-testid="select-ci-buyer-kyc"><SelectValue placeholder="Select registered entity..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                      {[
                        { label: "Company Name", val: buyerName, set: setBuyerName, ph: "Buyer company name", tid: "input-ci-buyer-name" },
                        { label: "Address", val: buyerAddress, set: setBuyerAddress, ph: "Buyer address", tid: "input-ci-buyer-addr" },
                        { label: "Contact", val: buyerContact, set: setBuyerContact, ph: "Contact email / phone", tid: "input-ci-buyer-contact" },
                      ].map(({ label, val, set, ph, tid }, i, arr) => (
                        <div key={tid} className={`grid grid-cols-[160px_1fr]${i < arr.length - 1 ? " border-b" : ""}`}>
                          <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">{label}</div>
                          <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={ph} value={val} onChange={(e) => set(e.target.value)} data-testid={tid} /></div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {!isProformaMode && <AccordionItem value="lc" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Landmark className="w-3.5 h-3.5" /> LC Details</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">LC Number</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. LC-2026-00123" value={ciLcNo} onChange={(e) => setCiLcNo(e.target.value)} data-testid="input-ci-lc-no" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">LC Issuing Bank</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. HSBC Bank" value={ciLcBank} onChange={(e) => setCiLcBank(e.target.value)} data-testid="input-ci-lc-bank" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>}

                <AccordionItem value="shipment" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Ship className="w-3.5 h-3.5" /> Shipment Details</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                      </div>
                      {(isProformaMode ? [
                        { label: "Commodity", val: commodity, set: setCommodity, ph: "e.g. Iron Ore", tid: "input-ci-commodity" },
                        { label: "Quantity (MT)", val: quantity, set: setQuantity, ph: "e.g. 200,000", tid: "input-ci-quantity" },
                        { label: "Country of Origin", val: origin, set: setOrigin, ph: "e.g. Guinea", tid: "input-ci-origin" },
                        { label: "Port of Loading", val: loadingPort, set: setLoadingPort, ph: "e.g. Conakry, Guinea", tid: "input-ci-pol" },
                        { label: "Port of Discharge", val: dischargePort, set: setDischargePort, ph: "e.g. Port Klang, Malaysia", tid: "input-ci-pod" },
                        { label: "Delivery Term", val: incoterm, set: setIncoterm, ph: "e.g. CFR", tid: "input-pi-delivery-term" },
                        { label: "Shipment Window", val: ciVoyage, set: setCiVoyage, ph: "e.g. 15-30 September 2026", tid: "input-pi-shipment-window" },
                        { label: "Packing", val: ciBlNo, set: setCiBlNo, ph: "e.g. Bulk", tid: "input-pi-packing" },
                      ] : [
                        { label: "Commodity", val: commodity, set: setCommodity, ph: "e.g. Iron Ore", tid: "input-ci-commodity" },
                        { label: "Quantity (MT)", val: quantity, set: setQuantity, ph: "e.g. 200,000", tid: "input-ci-quantity" },
                        { label: "Country of Origin", val: origin, set: setOrigin, ph: "e.g. Guinea", tid: "input-ci-origin" },
                        { label: "Port of Loading", val: loadingPort, set: setLoadingPort, ph: "e.g. Conakry, Guinea", tid: "input-ci-pol" },
                        { label: "Port of Discharge", val: dischargePort, set: setDischargePort, ph: "e.g. Port Klang, Malaysia", tid: "input-ci-pod" },
                        { label: "Vessel Name", val: ciVessel, set: setCiVessel, ph: "e.g. MV BULLFROG STAR", tid: "input-ci-vessel" },
                        { label: "Voyage No.", val: ciVoyage, set: setCiVoyage, ph: "e.g. V001E", tid: "input-ci-voyage" },
                        { label: "B/L No.", val: ciBlNo, set: setCiBlNo, ph: "e.g. 01", tid: "input-ci-bl-no" },
                        { label: "B/L Date", val: ciBlDate, set: setCiBlDate, ph: "e.g. 10.05.2026", tid: "input-ci-bl-date" },
                      ]).map(({ label, val, set, ph, tid }, i, arr) => (
                        <div key={tid} className={`grid grid-cols-[160px_1fr]${i < arr.length - 1 ? " border-b" : ""}`}>
                          <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">{label}</div>
                          <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={ph} value={val} onChange={(e) => set(e.target.value)} data-testid={tid} /></div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="goods" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><BadgeDollarSign className="w-3.5 h-3.5" /> Goods & Invoice Value</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Currency</div>
                        <div className="p-1">
                          <Select value={currency} onValueChange={setCurrency}>
                            <SelectTrigger className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" data-testid="select-ci-currency"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="GBP">GBP</SelectItem><SelectItem value="CNY">CNY</SelectItem>
                              <SelectItem value="AED">AED</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Unit Price (/MT)</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 50.00" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="input-ci-unit-price" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Total Amount</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 10,000,000.00" value={ciTotalAmount} onChange={(e) => setCiTotalAmount(e.target.value)} data-testid="input-ci-total-amount" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Tolerance</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="+/- 10%" value={ciTolerance} onChange={(e) => setCiTolerance(e.target.value)} data-testid="input-ci-tolerance" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Payment Terms</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 100% LC at sight" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} data-testid="input-ci-payment-terms" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

              </Accordion>

              <div className="flex gap-2 justify-end pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => isProformaMode ? handleReviewPreparedProformaInvoice() : previewDoc.mutate(buildPayload())}
                  disabled={!title || (isProformaMode ? previewProformaInvoice.isPending : previewDoc.isPending)}
                  data-testid="button-review-ci"
                >
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  {(isProformaMode ? previewProformaInvoice.isPending : previewDoc.isPending)
                    ? "Loading Preview..."
                    : isProformaMode ? "Review PI" : "Review CI"}
                </Button>
              </div>
            </div>
          )}
    </>
  );
}
