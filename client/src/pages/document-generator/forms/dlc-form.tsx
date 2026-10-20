import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
Select,
SelectContent,SelectItem,SelectTrigger,
SelectValue
} from "@/components/ui/select";

import {
Eye
} from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function DlcForm() {
  const {
    selectedType,
    title,
    setTitle,
    reviewContent,
    setDlc,
    dlcText,
    dlcChoice,
    approvedClients,
    resetForm,
    buildPayload,
    previewDoc,
  } = useDocGen();

  return (
    <>
          {selectedType && !reviewContent && selectedType.value === "DLC_MT700" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>

              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input placeholder="e.g. DLC Draft MT700 — Sulphur 50,000 MT" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-doc-title-dlc" />
              </div>

              {approvedClients.length > 0 && (
                <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Applicant (Buyer) — auto-fill from KYC</Label>
                    <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) { setDlc("applicantName", kyc.companyName || ""); setDlc("applicantAddress", kyc.registeredAddress || ""); } }}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-dlc-applicant-kyc"><SelectValue placeholder="Select approved KYC..." /></SelectTrigger>
                      <SelectContent>
                        {approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Beneficiary (Seller) — auto-fill from KYC</Label>
                    <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) { setDlc("beneficiaryName", kyc.companyName || ""); setDlc("beneficiaryAddress", kyc.registeredAddress || ""); } }}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-dlc-beneficiary-kyc"><SelectValue placeholder="Select approved KYC..." /></SelectTrigger>
                      <SelectContent>
                        {approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="border rounded-md p-3 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Banks & References</p>
                <div className="grid grid-cols-2 gap-3">
                  {dlcText("issuingBankBic", "Issuing Bank BIC", "e.g. EBILAEAD")}
                  {dlcText("beneficiaryBankBic", "Beneficiary Bank BIC", "e.g. KZKOKZKX")}
                  {dlcText("draweeBankBic", "Drawee Bank BIC", "e.g. EBILAEAD")}
                  {dlcText("bankReference", "Bank Reference (108)", "e.g. LC2026XXXX")}
                  {dlcText("issuingBankName", "Issuing Bank Name", "Bank name for document forwarding")}
                  {dlcText("issuingBankAddress", "Issuing Bank Address", "Bank address")}
                </div>
              </div>

              <div className="border rounded-md p-3 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Credit Details</p>
                <div className="grid grid-cols-2 gap-3">
                  {dlcText("creditNumber", "Documentary Credit Number (20)", "e.g. DC-2026-0001")}
                  {dlcText("dateOfIssue", "Date of Issue (31C)", "e.g. 260815 or 15 Aug 2026")}
                  {dlcText("expiryDate", "Expiry Date (31D)", "e.g. 261130")}
                  {dlcText("placeOfExpiry", "Place of Expiry (31D)", "e.g. DUBAI, UAE")}
                  {dlcText("currency", "Currency (32B)", "USD")}
                  {dlcText("amount", "Amount (32B)", "e.g. 5,000,000.00")}
                  {dlcText("tolerance", "Tolerance (39A)", "e.g. 05/05")}
                  {dlcChoice("draftsAt", "Drafts At (42C)", ["SIGHT", "30 DAYS", "60 DAYS", "90 DAYS", "120 DAYS", "180 DAYS"], "SIGHT")}
                  {dlcChoice("partialShipments", "Partial Shipments (43P)", ["ALLOWED", "NOT ALLOWED"], "NOT ALLOWED")}
                  {dlcChoice("transshipment", "Transshipment (43T)", ["ALLOWED", "NOT ALLOWED"], "ALLOWED")}
                  {dlcText("presentationDays", "Presentation Period (48, days)", "21")}
                  {dlcText("setsCount", "Document Sets (78)", "ONE")}
                </div>
              </div>

              <div className="border rounded-md p-3 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Applicant & Beneficiary</p>
                <div className="grid grid-cols-2 gap-3">
                  {dlcText("applicantName", "Applicant Name (50)", "Buyer company")}
                  {dlcText("beneficiaryName", "Beneficiary Name (59)", "Seller company")}
                  {dlcText("applicantAddress", "Applicant Address", "Address")}
                  {dlcText("beneficiaryAddress", "Beneficiary Address", "Address")}
                  {dlcText("applicantCountry", "Applicant Country", "e.g. UNITED ARAB EMIRATES")}
                  {dlcText("beneficiaryCountry", "Beneficiary Country", "e.g. KAZAKHSTAN")}
                </div>
              </div>

              <div className="border rounded-md p-3 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Shipment (44)</p>
                <div className="grid grid-cols-2 gap-3">
                  {dlcText("placeOfReceipt", "Place of Taking in Charge (44A)", "e.g. ATYRAU, KAZAKHSTAN")}
                  {dlcText("portOfLoading", "Port / Place of Loading (44E)", "e.g. AKTAU PORT")}
                  {dlcText("portOfDischarge", "Port / Place of Discharge (44F)", "e.g. MUNDRA, INDIA")}
                  {dlcText("finalDestination", "Final Destination (44B)", "e.g. MUNDRA, INDIA")}
                  {dlcText("latestShipmentDate", "Latest Date of Shipment (44C)", "e.g. 261031")}
                  {dlcChoice("charterPartyBl", "Charter Party B/L", ["NOT ACCEPTABLE", "ACCEPTABLE"], "NOT ACCEPTABLE")}
                </div>
              </div>

              <div className="border rounded-md p-3 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Goods (45A)</p>
                <div className="grid grid-cols-2 gap-3">
                  {dlcText("quantity", "Quantity", "e.g. 50,000 METRIC TONS")}
                  {dlcText("commodity", "Commodity", "e.g. GRANULAR SULPHUR")}
                  {dlcText("origin", "Origin", "e.g. KAZAKHSTAN")}
                  {dlcText("pricePerUnit", "Price per MT", "e.g. 105.00")}
                  {dlcText("deliveryTerm", "Delivery Term", "e.g. CFR MUNDRA, INDIA")}
                </div>
                {dlcText("goodsDescription", "Goods Description — overrides quantity/commodity/origin above if filled", "50,000 METRIC TONS OF GRANULAR SULPHUR\nOF KAZAKHSTAN ORIGIN.", true, 3)}
                {dlcText("productSpecification", "Product Specification", "PRODUCT SPECIFICATION:\nSULPHUR CONTENT: MINIMUM 99.95%\nMOISTURE: MAXIMUM 0.50%\n...", true, 5)}
              </div>

              <div className="border rounded-md p-3 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Documents & Conditions — leave blank to use the standard clauses</p>
                {dlcText("documentsRequired", "Documents Required (46A) — optional override", "Leave blank for the standard 10-document set", true, 5)}
                {dlcText("additionalConditions", "Additional Conditions (47A) — optional override", "Leave blank for the standard 10 conditions incl. UCP 600", true, 5)}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={resetForm} data-testid="button-cancel-dlc">Cancel</Button>
                <Button variant="outline" size="sm" onClick={() => previewDoc.mutate(buildPayload())} disabled={!title || previewDoc.isPending} data-testid="button-review-dlc">
                  <Eye className="w-4 h-4 mr-1" />
                  {previewDoc.isPending ? "Loading Preview..." : "Review DLC Draft"}
                </Button>
              </div>
            </div>
          )}
    </>
  );
}
