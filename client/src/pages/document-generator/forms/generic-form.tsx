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
Eye,X,
User,
Building2,Package
} from "lucide-react";
import { useDocGen } from "../use-doc-gen";
import { LpgPresetAction } from "./lpg-preset-action";
import { CopperPresetAction } from "./copper-preset-action";
import { LpgStsForm } from "./lpg-sts-form";

export default function GenericForm() {
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
    qualitySpecs,
    setQualitySpecs,
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
    specialNote,
    setSpecialNote,
    blPacking,
    setBlPacking,
    reviewContent,
    approvedClients,
    fillFromKyc,
    resetForm,
    previewDoc,
    handleReview,
  } = useDocGen();

  return (
    <>
          {selectedType && !reviewContent && selectedType.value !== "DEAL_RECAP" && selectedType.value !== "LOI" && selectedType.value !== "NCNDA" && selectedType.value !== "BL" && selectedType.value !== "COO" && selectedType.value !== "COA" && selectedType.value !== "COW" && selectedType.value !== "CI" && selectedType.value !== "TFR" && selectedType.value !== "FOB_PROCEDURE" && selectedType.value !== "DLC_MT700" && selectedType.value !== "PBG_MT760" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>
              {selectedType.value === "FCO" && <LpgPresetAction kind="FCO" />}
              {["FCO", "SPA"].includes(selectedType.value) && <CopperPresetAction />}
              {selectedType.value === "SPA" && <LpgStsForm />}

              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input
                  placeholder={`Enter ${selectedType.short} document title`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  data-testid="input-doc-title"
                />
              </div>

              <Accordion type="multiple" defaultValue={["product"]} className="w-full">
                <AccordionItem value="product" className="border-b-0">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 hover:no-underline">
                    <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Product Details</span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-3">
                    <Input placeholder="Commodity (e.g. Iron Ore, Copper Cathode, Gasoil 10ppm)" value={commodity} onChange={(e) => setCommodity(e.target.value)} data-testid="input-commodity" />
                    <Input placeholder="Origin (e.g. Guinea, Zambia)" value={origin} onChange={(e) => setOrigin(e.target.value)} data-testid="input-origin" />
                    <Input placeholder="Quantity (e.g. 50,000 MT)" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="input-quantity" />
                    <Input placeholder="Packing (e.g. In Bulk / 50kg PP bags)" value={blPacking} onChange={(e) => setBlPacking(e.target.value)} data-testid="input-packing" />
                    <Textarea placeholder="Quality Specifications (e.g. Fe 63.5% min, moisture 8% max, Al2O3 2.5% max)" value={qualitySpecs} onChange={(e) => setQualitySpecs(e.target.value)} rows={3} data-testid="input-quality-specs" />
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Loading Port" value={loadingPort} onChange={(e) => setLoadingPort(e.target.value)} data-testid="input-loading-port" />
                      <Input placeholder="Discharge Port" value={dischargePort} onChange={(e) => setDischargePort(e.target.value)} data-testid="input-discharge-port" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Price (e.g. 118.50 per MT)" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="input-price" />
                      <Select value={currency} onValueChange={setCurrency}>
                        <SelectTrigger data-testid="select-currency">
                          <SelectValue placeholder="Currency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="GBP">GBP</SelectItem><SelectItem value="CNY">CNY</SelectItem>
                          <SelectItem value="AED">AED</SelectItem>
                          <SelectItem value="CNY">CNY</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Incoterm (e.g. FOB, CIF, CFR)" value={incoterm} onChange={(e) => setIncoterm(e.target.value)} data-testid="input-incoterm" />
                      <Input placeholder="Laycan (e.g. 15-30 April 2026)" value={laycan} onChange={(e) => setLaycan(e.target.value)} data-testid="input-laycan" />
                    </div>
                    <Input placeholder="Payment Terms (e.g. By DLC against 2% Performance Bond)" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} data-testid="input-payment-terms" />
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Analysis Agency (e.g. SGS, CCIC, Alfred H. Knight)" value={analysisAgency} onChange={(e) => setAnalysisAgency(e.target.value)} data-testid="input-analysis-agency" />
                      <Input placeholder="Agency Contact / Email" value={analysisAgencyContact} onChange={(e) => setAnalysisAgencyContact(e.target.value)} data-testid="input-analysis-agency-contact" />
                    </div>
                    <Textarea placeholder="Special Notes (e.g. subject to SGS inspection, performance bond required)" value={specialNote} onChange={(e) => setSpecialNote(e.target.value)} rows={2} data-testid="input-special-note" />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="buyer" className="border-b-0">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 hover:no-underline">
                    <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Buyer Details</span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-3">
                    {approvedClients.length > 0 && (
                      <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "buyer"); }} data-testid="select-buyer-kyc">
                        <SelectTrigger data-testid="select-buyer-kyc-trigger">
                          <SelectValue placeholder="Select from approved KYC clients..." />
                        </SelectTrigger>
                        <SelectContent>
                          {approvedClients.map((k) => (
                            <SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Input placeholder="Buyer company name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} data-testid="input-buyer-name" />
                    <Input placeholder="Buyer address" value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} data-testid="input-buyer-address" />
                    <Input placeholder="Contact person & email" value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} data-testid="input-buyer-contact" />
                    <Input placeholder="Bank name" value={buyerBank} onChange={(e) => setBuyerBank(e.target.value)} data-testid="input-buyer-bank" />
                    <Input placeholder="SWIFT / BIC code" value={buyerSwift} onChange={(e) => setBuyerSwift(e.target.value)} data-testid="input-buyer-swift" />
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">Joint Co-Buyer (optional)</p>
                    <Input placeholder="Second company acting jointly as buyer" value={coBuyerName} onChange={(e) => setCoBuyerName(e.target.value)} data-testid="input-co-buyer-name" />
                    <Input placeholder="Co-buyer address" value={coBuyerAddress} onChange={(e) => setCoBuyerAddress(e.target.value)} data-testid="input-co-buyer-address" />
                    <Input placeholder="Co-buyer contact person & email" value={coBuyerContact} onChange={(e) => setCoBuyerContact(e.target.value)} data-testid="input-co-buyer-contact" />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="seller" className="border-b-0">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 hover:no-underline">
                    <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Seller Details</span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-3">
                    {approvedClients.length > 0 && (
                      <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "seller"); }} data-testid="select-seller-kyc">
                        <SelectTrigger data-testid="select-seller-kyc-trigger">
                          <SelectValue placeholder="Select from approved KYC clients..." />
                        </SelectTrigger>
                        <SelectContent>
                          {approvedClients.map((k) => (
                            <SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Input placeholder="Seller company name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} data-testid="input-seller-name" />
                    <Input placeholder="Seller address" value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} data-testid="input-seller-address" />
                    <Input placeholder="Contact person & email" value={sellerContact} onChange={(e) => setSellerContact(e.target.value)} data-testid="input-seller-contact" />
                    <Input placeholder="Bank name" value={sellerBank} onChange={(e) => setSellerBank(e.target.value)} data-testid="input-seller-bank" />
                    <Input placeholder="SWIFT / BIC code" value={sellerSwift} onChange={(e) => setSellerSwift(e.target.value)} data-testid="input-seller-swift" />
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">Joint Co-Seller (optional)</p>
                    <Input placeholder="Second company acting jointly as seller" value={coSellerName} onChange={(e) => setCoSellerName(e.target.value)} data-testid="input-co-seller-name" />
                    <Input placeholder="Co-seller address" value={coSellerAddress} onChange={(e) => setCoSellerAddress(e.target.value)} data-testid="input-co-seller-address" />
                    <Input placeholder="Co-seller contact person & email" value={coSellerContact} onChange={(e) => setCoSellerContact(e.target.value)} data-testid="input-co-seller-contact" />
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
                  {previewDoc.isPending ? "Loading Preview..." : `Review ${selectedType.short}`}
                </Button>
              </div>
            </div>
          )}
    </>
  );
}
