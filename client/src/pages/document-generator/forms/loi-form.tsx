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
Eye,X,Send,FileSignature,ClipboardList,Plus,
Trash2
} from "lucide-react";
import { useDocGen } from "../use-doc-gen";
import { LpgPresetAction } from "./lpg-preset-action";
import { CopperPresetAction } from "./copper-preset-action";

export default function LoiForm() {
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
    sellerName,
    setSellerName,
    sellerAddress,
    setSellerAddress,
    sellerContact,
    setSellerContact,
    coBuyerName,
    setCoBuyerName,
    coBuyerAddress,
    setCoBuyerAddress,
    coBuyerContact,
    setCoBuyerContact,
    coSellerName,
    setCoSellerName,
    coSellerAddress,
    setCoSellerAddress,
    coSellerContact,
    setCoSellerContact,
    commodity,
    setCommodity,
    origin,
    setOrigin,
    quantity,
    setQuantity,
    specRows,
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
    laycan,
    setLaycan,
    paymentTerms,
    setPaymentTerms,
    analysisAgency,
    setAnalysisAgency,
    analysisAgencyContact,
    setAnalysisAgencyContact,
    validity,
    setValidity,
    refPerson,
    setRefPerson,
    contractConfirmation,
    setContractConfirmation,
    docsForPayment,
    setDocsForPayment,
    otherTerms,
    setOtherTerms,
    compliance,
    setCompliance,
    specialNote,
    setSpecialNote,
    loiIssueNumber,
    blPacking,
    setBlPacking,
    reviewContent,
    updateSpecRow,
    addSpecRow,
    removeSpecRow,
    approvedClients,
    fillFromKyc,
    resetForm,
    previewDoc,
    handleReview,
  } = useDocGen();

  return (
    <>
          {selectedType && !reviewContent && selectedType.value === "LOI" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>
              <LpgPresetAction kind="LOI" />
              <CopperPresetAction />
              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input placeholder="Enter LOI document title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-doc-title" />
              </div>

              <Accordion type="multiple" defaultValue={["header","params","closing"]} className="w-full">

                <AccordionItem value="header" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> LOI Header</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Issued to Seller</div>
                        <div className="p-1 space-y-1">
                          {approvedClients.length > 0 && (
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "seller"); }}>
                              <SelectTrigger className="h-7 text-xs" data-testid="select-seller-kyc-trigger"><SelectValue placeholder="Select from KYC..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Seller company name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} data-testid="input-seller-name" />
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Seller address" value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} data-testid="input-seller-address" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Joint Co-Seller (optional)</div>
                        <div className="p-1 space-y-1">
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Second company acting jointly as seller" value={coSellerName} onChange={(e) => setCoSellerName(e.target.value)} data-testid="input-co-seller-name" />
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Co-seller address" value={coSellerAddress} onChange={(e) => setCoSellerAddress(e.target.value)} data-testid="input-co-seller-address" />
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Co-seller contact person & email" value={coSellerContact} onChange={(e) => setCoSellerContact(e.target.value)} data-testid="input-co-seller-contact" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Attention (PIC)</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Seller contact person & email" value={sellerContact} onChange={(e) => setSellerContact(e.target.value)} data-testid="input-seller-contact" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Ref</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Reference person (e.g. Mr. Nilesh Thakkar)" value={refPerson} onChange={(e) => setRefPerson(e.target.value)} data-testid="input-ref-person" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">LOI Issue No. & Date</div>
                        <div className="p-2 text-xs flex items-center gap-2" data-testid="text-loi-issue-number">
                          <span className={loiIssueNumber ? "font-semibold text-foreground" : "text-muted-foreground"}>{loiIssueNumber || "Enter buyer name to generate"}</span>
                          <span className="text-muted-foreground">{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Valid Till</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Saturday 2nd August, 2025 - 2000HRS Dubai Time" value={validity} onChange={(e) => setValidity(e.target.value)} data-testid="input-validity" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Purchase Incoterms</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. CIF, FOB, CFR" value={incoterm} onChange={(e) => setIncoterm(e.target.value)} data-testid="input-incoterm" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Issued by Buyer</div>
                        <div className="p-1 space-y-1">
                          {approvedClients.length > 0 && (
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "buyer"); }}>
                              <SelectTrigger className="h-7 text-xs" data-testid="select-buyer-kyc-trigger"><SelectValue placeholder="Select from KYC..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Buyer company name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} data-testid="input-buyer-name" />
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Buyer address" value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} data-testid="input-buyer-address" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Joint Co-Buyer (optional)</div>
                        <div className="p-1 space-y-1">
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Second company acting jointly as buyer" value={coBuyerName} onChange={(e) => setCoBuyerName(e.target.value)} data-testid="input-co-buyer-name" />
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Co-buyer address" value={coBuyerAddress} onChange={(e) => setCoBuyerAddress(e.target.value)} data-testid="input-co-buyer-address" />
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Co-buyer contact person & email" value={coBuyerContact} onChange={(e) => setCoBuyerContact(e.target.value)} data-testid="input-co-buyer-contact" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Attention (PIC)</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Buyer contact person & title" value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} data-testid="input-buyer-contact" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="params" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> LOI Parameters (Sr. No. 01–12)</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[40px_130px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r text-center">Sr.</div>
                        <div className="p-2 border-r">Parameters</div>
                        <div className="p-2">Details</div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">01</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Commodity</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Iron Ore, Copper Concentrate, Gasoil 50ppm" value={commodity} onChange={(e) => setCommodity(e.target.value)} data-testid="input-commodity" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">02</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Origin</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Kamsar, Guinea" value={origin} onChange={(e) => setOrigin(e.target.value)} data-testid="input-origin" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">03</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Quantity</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 50,000 MT" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="input-quantity" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">—</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Packing</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. In Bulk / 50kg PP bags" value={blPacking} onChange={(e) => setBlPacking(e.target.value)} data-testid="input-sco-packing" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">04</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Incoterms Terms</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. CIF AWSP" value={incoterm} onChange={(e) => setIncoterm(e.target.value)} data-testid="input-incoterm-detail" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">05</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Delivery Period</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 15-30 April 2026" value={laycan} onChange={(e) => setLaycan(e.target.value)} data-testid="input-laycan" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">06</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Price</div>
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
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0 flex-1" placeholder="e.g. 70 per MT" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="input-price" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">07</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Contract Confirmation</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Subject to Producer's Confirmation of cargo" value={contractConfirmation} onChange={(e) => setContractConfirmation(e.target.value)} data-testid="input-contract-confirmation" /></div>
                      </div>
                      <div className="border-b">
                        <div className="grid grid-cols-[40px_1fr] border-b">
                          <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">08</div>
                          <div className="p-2 text-xs font-medium text-muted-foreground">Commodity Specifications</div>
                        </div>
                        <div className="px-2 py-1.5">
                          <div className="border rounded-md overflow-hidden">
                            <div className="grid grid-cols-[1fr_1fr_1fr_32px] bg-muted/50 border-b">
                              <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Parameter</div>
                              <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase border-l">Specification</div>
                              <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase border-l">Rejection Limit</div>
                              <div className="border-l"></div>
                            </div>
                            {specRows.map((row, idx) => (
                              <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_32px] border-b last:border-b-0">
                                <div className="p-0.5"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Al2O3" value={row.parameter} onChange={(e) => updateSpecRow(idx, "parameter", e.target.value)} data-testid={`input-spec-param-${idx}`} /></div>
                                <div className="p-0.5 border-l"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 45% min" value={row.specification} onChange={(e) => updateSpecRow(idx, "specification", e.target.value)} data-testid={`input-spec-value-${idx}`} /></div>
                                <div className="p-0.5 border-l"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. < 40%" value={row.rejection} onChange={(e) => updateSpecRow(idx, "rejection", e.target.value)} data-testid={`input-spec-reject-${idx}`} /></div>
                                <div className="flex items-center justify-center border-l">
                                  {specRows.length > 1 && (
                                    <button type="button" onClick={() => removeSpecRow(idx)} className="text-muted-foreground hover:text-destructive" data-testid={`button-remove-spec-${idx}`}>
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <Button type="button" variant="ghost" size="sm" className="mt-1 h-6 text-[10px] text-muted-foreground" onClick={addSpecRow} data-testid="button-add-spec-row">
                            <Plus className="w-3 h-3 mr-1" />Add Row
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">09</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Payment Terms</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. By DLC against 2% Performance Bond" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} data-testid="input-payment-terms" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">10</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-start pt-2">Documents for Payment</div>
                        <div className="p-1"><Textarea className="text-xs border-0 shadow-none focus-visible:ring-0 min-h-[100px]" placeholder={"Seller's export permit, and 3 copies\nCommercial Invoice, 3 Original and 3 copies\nPacking List, 3 originals and 3 copies\nCertificate of Origin, 3 originals and 3 copies\nAssay Report, 3 Original and 3 copies\nCertificate of quantity and quality issued by SGS\nInsurance Policy of 110% of invoice value"} value={docsForPayment} onChange={(e) => setDocsForPayment(e.target.value)} rows={6} data-testid="input-docs-for-payment" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">11</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-start pt-2">Other Terms & Conditions</div>
                        <div className="p-1"><Textarea className="text-xs border-0 shadow-none focus-visible:ring-0 min-h-[60px]" placeholder={"For DLC, after signing of SPA, Seller must arrange RWA by MT199 from LC receiving bank..."} value={otherTerms} onChange={(e) => setOtherTerms(e.target.value)} rows={3} data-testid="input-other-terms" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr]">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">12</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-start pt-2">Compliance</div>
                        <div className="p-1"><Textarea className="text-xs border-0 shadow-none focus-visible:ring-0 min-h-[40px]" placeholder={"Seller must send KYC documents to compliance@bullfrog.ae upon signing of SPA..."} value={compliance} onChange={(e) => setCompliance(e.target.value)} rows={2} data-testid="input-compliance" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="closing" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><FileSignature className="w-3.5 h-3.5" /> Closing & Signatory</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="text-xs font-semibold p-2 bg-muted/60 border-b">For & On Behalf of</div>
                      <div className="p-2 space-y-2">
                        <Input className="h-8 text-xs" placeholder="Buyer company name (signing party)" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} data-testid="input-buyer-name-sig" />
                        <Input className="h-8 text-xs" placeholder="Authorised Signatory Name & Title" value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} data-testid="input-buyer-contact-sig" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Loading Port</Label>
                        <Input className="h-8 text-xs mt-1" placeholder="e.g. Kamsar, Guinea" value={loadingPort} onChange={(e) => setLoadingPort(e.target.value)} data-testid="input-loading-port" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Discharge Port</Label>
                        <Input className="h-8 text-xs mt-1" placeholder="e.g. Rizhao, China" value={dischargePort} onChange={(e) => setDischargePort(e.target.value)} data-testid="input-discharge-port" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Analysis Agency</Label>
                        <Input className="h-8 text-xs mt-1" placeholder="e.g. SGS, Bureau Veritas" value={analysisAgency} onChange={(e) => setAnalysisAgency(e.target.value)} data-testid="input-analysis-agency" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Agency Contact</Label>
                        <Input className="h-8 text-xs mt-1" placeholder="Agency contact / email" value={analysisAgencyContact} onChange={(e) => setAnalysisAgencyContact(e.target.value)} data-testid="input-analysis-agency-contact" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <Label className="text-xs text-muted-foreground">Special Notes</Label>
                      <Textarea className="text-xs mt-1" placeholder="Special notes (optional)" value={specialNote} onChange={(e) => setSpecialNote(e.target.value)} rows={2} data-testid="input-special-note" />
                    </div>
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
                  {previewDoc.isPending ? "Loading Preview..." : "Review LOI"}
                </Button>
              </div>
            </div>
          )}
    </>
  );
}
