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
Eye,Send
} from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function TfrForm() {
  const {
    selectedType,
    title,
    setTitle,
    reviewContent,
    tfrLinkedRecapId,
    setTfrLinkedRecapId,
    tfrText,
    tfrChoice,
    tfrDualRow,
    tfrTripleRow,
    tfrColHeader,
    fillTfrFromRecap,
    buildPayload,
    previewDoc,
    docs,
  } = useDocGen();

  return (
    <>
          {selectedType && !reviewContent && selectedType.value === "TFR" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>

              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input placeholder="Enter TFR document title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-doc-title-tfr" />
              </div>

              <div className="border rounded-md overflow-hidden">
                <div className="grid grid-cols-[160px_1fr] border-b">
                  <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center gap-1"><Send className="w-3 h-3" /> Source Deal Recap</div>
                  <div className="p-1">
                    {docs && docs.filter(d => d.docType === "DEAL_RECAP").length > 0 ? (
                      <Select value={tfrLinkedRecapId} onValueChange={(val) => {
                        setTfrLinkedRecapId(val);
                        const recapDoc = docs?.find(d => d.id === val);
                        if (recapDoc) fillTfrFromRecap(recapDoc);
                      }}>
                        <SelectTrigger className="h-8 text-xs" data-testid="select-tfr-recap"><SelectValue placeholder="Select Deal Recap to copy details from..." /></SelectTrigger>
                        <SelectContent>
                          {docs?.filter(d => d.docType === "DEAL_RECAP").map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-muted-foreground p-1">No Deal Recap documents found — fill fields manually below</p>
                    )}
                  </div>
                </div>
              </div>

              <Accordion type="multiple" defaultValue={["exec"]} className="w-full">
                <AccordionItem value="exec" className="border-b-0">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 hover:no-underline">1. Executive Summary</AccordionTrigger>
                  <AccordionContent className="space-y-2 pb-3">
                    {tfrText("reference", "Reference", "e.g. BFG-2026-0001")}
                    <p className="text-xs font-semibold text-muted-foreground pt-1">Transaction Overview</p>
                    {tfrColHeader(["", "Import", "Export"])}
                    {tfrDualRow("Product", "productImport", "productExport")}
                    {tfrDualRow("Origin", "originImport", "originExport")}
                    {tfrDualRow("Destination", "destinationImport", "destinationExport")}
                    {tfrDualRow("Quantity", "quantityImport", "quantityExport")}
                    {tfrDualRow("Price (per Mt)", "priceImport", "priceExport")}
                    {tfrDualRow("Contract Value", "contractValueImport", "contractValueExport")}
                    {tfrDualRow("Delivery Terms", "deliveryTermsImport", "deliveryTermsExport")}
                    {tfrDualRow("Payment Terms", "paymentTermsImport", "paymentTermsExport")}
                    {tfrDualRow("Transaction Duration", "durationImport", "durationExport")}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="parties" className="border-b-0">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 hover:no-underline">2. Parties to the Transaction</AccordionTrigger>
                  <AccordionContent className="space-y-2 pb-3">
                    {tfrColHeader(["", "Import", "Export"])}
                    {tfrDualRow("Party", "partyImport", "partyExport")}
                    {tfrDualRow("Intermediary", "intermediaryImport", "intermediaryExport")}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="financial" className="border-b-0">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 hover:no-underline">3. Financial Feasibility</AccordionTrigger>
                  <AccordionContent className="space-y-2 pb-3">
                    <p className="text-xs font-semibold text-muted-foreground">Transaction Economics</p>
                    {tfrColHeader(["Particulars", "Import (USD)", "Export (USD)", "Total (USD)"])}
                    {tfrTripleRow("Purchase Cost (per mt)", "purchaseCostImport", "purchaseCostExport", "purchaseCostTotal")}
                    {tfrTripleRow("Freight Cost (per mt)", "freightImport", "freightExport", "freightTotal")}
                    {tfrTripleRow("Insurance Cost (per mt)", "insuranceImport", "insuranceExport", "insuranceTotal")}
                    {tfrTripleRow("Inspection Cost (per mt)", "inspectionImport", "inspectionExport", "inspectionTotal")}
                    {tfrTripleRow("Banking Cost", "bankingImport", "bankingExport", "bankingTotal")}
                    {tfrTripleRow("Other Cost", "otherImport", "otherExport", "otherTotal")}
                    {tfrTripleRow("Total", "totalImport", "totalExport", "totalTotal")}
                    {tfrTripleRow("Gross Profit", "grossProfitImport", "grossProfitExport", "grossProfitTotal")}
                    {tfrTripleRow("Net Profit", "netProfitImport", "netProfitExport", "netProfitTotal")}
                    <p className="text-xs font-semibold text-muted-foreground pt-1">Summary</p>
                    <div className="grid grid-cols-2 gap-3">
                      {tfrText("sumGrossProfit", "Gross Profit")}
                      {tfrText("sumNetProfit", "Net Profit")}
                      {tfrText("importTotalCost", "Import Total Cost")}
                      {tfrText("exportTotalCost", "Export Total Cost")}
                      {tfrText("grossMargin", "Gross Margin")}
                      {tfrText("roi", "ROI")}
                    </div>
                    {tfrText("breakevenAnalysis", "Breakeven Analysis", "", true)}
                    {tfrChoice("financialConclusion", "Conclusion", ["Financially Attractive", "Marginally Viable", "Not Attractive"])}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="finance" className="border-b-0">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 hover:no-underline">6. Trade Finance Feasibility</AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-3">
                    {tfrText("proposedInstruments", "Possible Instruments", "", true)}
                    <div className="grid grid-cols-2 gap-3">
                      {tfrText("buyerBank", "Buyer Bank")}
                      {tfrText("buyerBankRating", "Buyer Bank Rating")}
                      {tfrText("sellerBank", "Seller Bank")}
                      {tfrText("sellerBankRating", "Seller Bank Rating")}
                      {tfrText("workingCapitalRequired", "Working Capital Required")}
                      {tfrText("financingPeriod", "Financing Period")}
                      {tfrText("expectedYield", "Expected Yield")}
                    </div>
                    {tfrChoice("financeConclusion", "Conclusion", ["Bankable", "Bankable with Conditions", "Not Bankable"])}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="logistics" className="border-b-0">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 hover:no-underline">7. Logistics Feasibility</AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-3">
                    <div className="grid grid-cols-2 gap-3">
                      {tfrText("loadingPort", "Loading Port")}
                      {tfrText("dischargePort", "Discharge Port")}
                      {tfrText("shippingRoute", "Shipping Route")}
                      {tfrText("transitTime", "Transit Time")}
                      {tfrText("portCapacity", "Port Capacity")}
                      {tfrText("vesselAvailability", "Vessel Availability")}
                      {tfrText("storageFacilities", "Storage Facilities")}
                      {tfrText("inlandTransportation", "Inland Transportation")}
                      {tfrText("congestion", "Congestion Risk")}
                      {tfrText("weather", "Weather Risk")}
                      {tfrText("politicalDisruptions", "Political Disruptions")}
                      {tfrText("logisticsSanctions", "Sanctions")}
                    </div>
                    {tfrChoice("logisticsConclusion", "Conclusion", ["Logistically Feasible", "Requires Mitigation", "Not Feasible"])}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="legal" className="border-b-0">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 hover:no-underline">8. Legal &amp; Compliance Review</AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-3">
                    <div className="grid grid-cols-2 gap-3">
                      {tfrText("corporateRegistration", "Corporate Registration")}
                      {tfrText("beneficialOwnership", "Beneficial Ownership")}
                      {tfrText("tradeLicenses", "Trade Licenses")}
                      {tfrText("authorityOfSignatories", "Authority of Signatories")}
                      {tfrText("sanctionsScreening", "Sanctions Screening")}
                      {tfrText("pepScreening", "PEP Screening")}
                      {tfrText("adverseMediaSearch", "Adverse Media Search")}
                      {tfrText("uboVerification", "UBO Verification")}
                      {tfrText("reviewSpa", "SPA Review")}
                      {tfrText("reviewPerformanceBond", "Performance Bond Review")}
                      {tfrText("reviewLcTerms", "LC Terms Review")}
                      {tfrText("reviewArbitration", "Arbitration Clauses Review")}
                    </div>
                    {tfrChoice("complianceConclusion", "Conclusion", ["Compliant", "Additional Review Required", "High Risk"])}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="risk" className="border-b-0">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 hover:no-underline">9. Risk Assessment</AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-3">
                    <div className="grid grid-cols-2 gap-3">
                      {tfrText("supplierDefault", "Supplier Default")}
                      {tfrText("buyerDefault", "Buyer Default")}
                      {tfrText("qualityDisputes", "Quality Disputes")}
                      {tfrText("currencyRisk", "Currency Risk")}
                      {tfrText("paymentRisk", "Payment Risk")}
                      {tfrText("fundingRisk", "Funding Risk")}
                      {tfrText("exportRestrictions", "Export Restrictions")}
                      {tfrText("riskSanctions", "Sanctions")}
                      {tfrText("governmentIntervention", "Government Intervention")}
                      {tfrText("shipmentDelay", "Shipment Delay")}
                      {tfrText("documentationErrors", "Documentation Errors")}
                      {tfrText("forceMajeure", "Force Majeure")}
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground">Risk Rating</p>
                    <div className="grid grid-cols-2 gap-3">
                      {tfrChoice("commercialRating", "Commercial", ["Low", "Medium", "High"])}
                      {tfrChoice("financialRating", "Financial", ["Low", "Medium", "High"])}
                      {tfrChoice("operationalRating", "Operational", ["Low", "Medium", "High"])}
                      {tfrChoice("politicalRating", "Political", ["Low", "Medium", "High"])}
                      {tfrChoice("complianceRating", "Compliance", ["Low", "Medium", "High"])}
                    </div>
                    {tfrChoice("overallRisk", "Overall Risk Rating", ["Low", "Medium", "High"])}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="security" className="border-b-0">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 hover:no-underline">10. Security Structure</AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-3">
                    <div className="grid grid-cols-2 gap-3">
                      {tfrText("corporateGuarantee", "Corporate Guarantee")}
                      {tfrText("personalGuarantee", "Personal Guarantee")}
                      {tfrText("postDatedCheques", "Post-Dated Cheques")}
                      {tfrText("securityPerformanceBond", "Performance Bond")}
                      {tfrText("sblc", "SBLC")}
                      {tfrText("bankGuarantee", "Bank Guarantee")}
                      {tfrText("escrowArrangement", "Escrow Arrangement")}
                    </div>
                    {tfrChoice("securityAdequacy", "Adequacy Assessment", ["Adequate", "Partially Adequate", "Inadequate"])}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="conclusion" className="border-b-0">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 hover:no-underline">11. Overall Feasibility Conclusion</AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-3">
                    <div className="grid grid-cols-2 gap-3">
                      {tfrChoice("commercialFeasibility", "Commercial Feasibility", ["Yes", "No"])}
                      {tfrChoice("financialFeasibilityFinal", "Financial Feasibility", ["Yes", "No"])}
                      {tfrChoice("bankingFeasibility", "Banking Feasibility", ["Yes", "No"])}
                      {tfrChoice("operationalFeasibility", "Operational Feasibility", ["Yes", "No"])}
                      {tfrChoice("complianceFeasibilityFinal", "Compliance Feasibility", ["Yes", "No"])}
                    </div>
                    {tfrChoice("recommendation", "Recommendation", ["Proceed Immediately", "Proceed Subject to Conditions", "Re-Structure Transaction", "Do Not Proceed"])}
                    {tfrText("conditionsPrecedent", "Conditions Precedent (if applicable)", "", true)}
                    <div className="grid grid-cols-2 gap-3">
                      {tfrText("preparedBy", "Prepared By")}
                      {tfrText("preparedDate", "Prepared Date")}
                      {tfrText("approvedBy", "Approved By")}
                      {tfrText("approvedDate", "Approved Date")}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" size="sm" onClick={() => previewDoc.mutate(buildPayload())} disabled={!title || previewDoc.isPending} data-testid="button-review-tfr">
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  {previewDoc.isPending ? "Loading Preview..." : "Review TFR"}
                </Button>
              </div>
            </div>
          )}
    </>
  );
}
