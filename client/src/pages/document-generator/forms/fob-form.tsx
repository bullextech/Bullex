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

export default function FobForm() {
  const {
    selectedType,
    title,
    setTitle,
    reviewContent,
    fobData,
    setFob,
    fobText,
    approvedClients,
    fillFromKyc,
    resetForm,
    buildPayload,
    previewDoc,
  } = useDocGen();

  return (
    <>
          {selectedType && !reviewContent && selectedType.value === "FOB_PROCEDURE" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>

              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input placeholder="Enter procedure document title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-doc-title-fob" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Transaction Side *</Label>
                <Select value={fobData.direction || "Import (Buy)"} onValueChange={(val) => setFob("direction", val)}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-fob-direction">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Import (Buy)">Import (Buy) — Buyer's procedure</SelectItem>
                    <SelectItem value="Export (Sell)">Export (Sell) — Seller's procedure</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {approvedClients.length > 0 && (
                <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Buyer — auto-fill from KYC</Label>
                    <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) { fillFromKyc(kyc, "buyer"); setFob("buyer", kyc.companyName || ""); } }}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-fob-buyer-kyc"><SelectValue placeholder="Select approved KYC..." /></SelectTrigger>
                      <SelectContent>
                        {approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Seller — auto-fill from KYC</Label>
                    <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) { fillFromKyc(kyc, "seller"); setFob("seller", kyc.companyName || ""); } }}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-fob-seller-kyc"><SelectValue placeholder="Select approved KYC..." /></SelectTrigger>
                      <SelectContent>
                        {approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {fobText("reference", "Reference", "e.g. BFG-2026-0001")}
                {fobText("product", "Product", "Diesel EN590 / AGO 10ppm")}
                {fobText("terminal", "Terminal", "Nargis Terminal")}
                {fobText("location", "Terminal Location", "Mersin, Turkey")}
                {fobText("tankNumber", "Tank Number", "e.g. TK-12")}
                {fobText("quantity", "Quantity", "e.g. 50,000 MT")}
                {fobText("price", "Price Basis", "e.g. Platts - USD/MT")}
                {fobText("buyer", "Buyer", "Buyer company name")}
                {fobText("seller", "Seller", "Seller company name")}
                {fobText("inspectionAgency", "Inspection Agency", "SGS / Bureau Veritas / Intertek")}
                {fobText("paymentInstrument", "Payment Instrument", "Irrevocable LC / SBLC / MT103")}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={resetForm} data-testid="button-cancel-fob">Cancel</Button>
                <Button variant="outline" size="sm" onClick={() => previewDoc.mutate(buildPayload())} disabled={!title || previewDoc.isPending} data-testid="button-review-fob">
                  <Eye className="w-4 h-4 mr-1" />
                  {previewDoc.isPending ? "Loading Preview..." : "Review Procedure"}
                </Button>
              </div>
            </div>
          )}
    </>
  );
}
