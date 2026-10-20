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

export default function PbgForm() {
  const {
    selectedType,
    title,
    setTitle,
    reviewContent,
    setPbg,
    pbgText,
    approvedClients,
    resetForm,
    buildPayload,
    previewDoc,
  } = useDocGen();

  return (
    <>
          {selectedType && !reviewContent && selectedType.value === "PBG_MT760" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>

              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input placeholder="e.g. Performance Guarantee Draft MT760 — SPA 2026-001" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-doc-title-pbg" />
              </div>

              {approvedClients.length > 0 && (
                <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Applicant — auto-fill from KYC</Label>
                    <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) { setPbg("applicantName", kyc.companyName || ""); setPbg("applicantAddress", kyc.registeredAddress || ""); } }}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-pbg-applicant-kyc"><SelectValue placeholder="Select approved KYC..." /></SelectTrigger>
                      <SelectContent>
                        {approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Beneficiary — auto-fill from KYC</Label>
                    <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) { setPbg("beneficiaryName", kyc.companyName || ""); setPbg("beneficiaryAddress", kyc.registeredAddress || ""); } }}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-pbg-beneficiary-kyc"><SelectValue placeholder="Select approved KYC..." /></SelectTrigger>
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
                  {pbgText("issuingBankBic", "Issuing Bank BIC", "e.g. EBILAEAD")}
                  {pbgText("beneficiaryBankBic", "Beneficiary Bank BIC", "e.g. SBININBB")}
                  {pbgText("issuingBankName", "Issuing Bank Name", "Bank issuing the guarantee")}
                  {pbgText("bankReference", "Bank Reference (108)", "e.g. PBG2026XXXX")}
                </div>
              </div>

              <div className="border rounded-md p-3 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Guarantee Details</p>
                <div className="grid grid-cols-2 gap-3">
                  {pbgText("guaranteeNumber", "Guarantee Number (20)", "e.g. PBG-2026-0001")}
                  {pbgText("dateOfIssue", "Date of Issue (30)", "e.g. 260815")}
                  {pbgText("currency", "Currency (32B)", "USD")}
                  {pbgText("guaranteeAmount", "Guarantee Amount (32B)", "e.g. 525,000.00")}
                  {pbgText("currencyInWords", "Currency in Words", "UNITED STATES DOLLARS")}
                  {pbgText("amountInWords", "Amount in Words", "e.g. FIVE HUNDRED TWENTY FIVE THOUSAND")}
                  {pbgText("expiryDate", "Expiry Date (31E)", "e.g. 270228")}
                </div>
              </div>

              <div className="border rounded-md p-3 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Applicant & Beneficiary</p>
                <div className="grid grid-cols-2 gap-3">
                  {pbgText("applicantName", "Applicant Name (50)", "Party whose performance is guaranteed")}
                  {pbgText("beneficiaryName", "Beneficiary Name (59)", "Party receiving the guarantee")}
                  {pbgText("applicantAddress", "Applicant Address", "Registered address")}
                  {pbgText("beneficiaryAddress", "Beneficiary Address", "Registered address")}
                  {pbgText("applicantCountry", "Applicant Country", "e.g. UNITED ARAB EMIRATES")}
                  {pbgText("beneficiaryCountry", "Beneficiary Country", "e.g. INDIA")}
                </div>
              </div>

              <div className="border rounded-md p-3 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Underlying Transaction</p>
                <div className="grid grid-cols-2 gap-3">
                  {pbgText("spaNumber", "SPA Number", "e.g. SPA-2026-001")}
                  {pbgText("spaDate", "SPA Date", "e.g. 01 Aug 2026")}
                  {pbgText("quantity", "Quantity", "e.g. 50,000 METRIC TONS")}
                  {pbgText("commodity", "Commodity", "e.g. GRANULAR SULPHUR")}
                  {pbgText("origin", "Origin", "e.g. KAZAKHSTAN")}
                  {pbgText("destination", "Delivery Destination", "e.g. INDIA")}
                </div>
                {pbgText("underlyingTransaction", "Underlying Transaction Clause — overrides the fields above if filled", "THIS GUARANTEE IS ISSUED IN CONNECTION WITH...", true, 3)}
              </div>

              <div className="border rounded-md p-3 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Guarantee Undertaking (77U) — leave blank to use the standard URDG 758 text</p>
                {pbgText("guaranteeText", "Full Guarantee Text (77U) — optional override", "Leave blank for the standard undertaking incl. URDG 758, demand terms and non-transferability", true, 6)}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={resetForm} data-testid="button-cancel-pbg">Cancel</Button>
                <Button variant="outline" size="sm" onClick={() => previewDoc.mutate(buildPayload())} disabled={!title || previewDoc.isPending} data-testid="button-review-pbg">
                  <Eye className="w-4 h-4 mr-1" />
                  {previewDoc.isPending ? "Loading Preview..." : "Review Guarantee Draft"}
                </Button>
              </div>
            </div>
          )}
    </>
  );
}
