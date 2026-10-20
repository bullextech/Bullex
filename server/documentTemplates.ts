import type { Trade } from "@shared/schema";
import { lpgPurposeForDocument } from "@shared/lpg-format";
import type { LpgStsData } from "@shared/lpg-sts";
import { renderLpgStsSpa } from "./lpg-sts-template";

export interface PartyDetails {
  name?: string;
  address?: string;
  contact?: string;
  // Person-in-charge name (e.g. from an LOI's "Attention (PIC)"); when set,
  // the SPA renders it on the PIC line instead of the contact email.
  pic?: string;
  bank?: string;
  swift?: string;
  // Optional joint second company acting together with the primary party
  // (co-seller/co-buyer). Rendered alongside the primary on documents.
  coName?: string;
  coAddress?: string;
  coContact?: string;
}

export interface SpaAddendumAmendment {
  category: string;
  clauseNumber: string;
  description: string;
  existingProvision?: string;
  amendedProvision: string;
}

export interface SpaAddendumData {
  addendumNumber: string;
  effectiveDate: string;
  originalSpaNumber: string;
  originalSpaDate: string;
  amendments: SpaAddendumAmendment[];
}

export interface ProformaInvoiceData {
  invoiceNumber?: string;
  spaNumber?: string;
  invoiceDate?: string;
  validUntil?: string;
  deliveryTerm?: string;
  shipmentWindow?: string;
  packing?: string;
  totalAmount?: string;
}

export interface ProductDetails {
  spaVariant?: "standard" | "lpg-sts";
  lpgSts?: LpgStsData;
  commodity?: string;
  origin?: string;
  quantity?: string;
  qualitySpecs?: string;
  loadingPort?: string;
  dischargePort?: string;
  price?: string;
  currency?: string;
  incoterm?: string;
  laycan?: string;
  paymentTerms?: string;
  analysisAgency?: string;
  analysisAgencyContact?: string;
  validity?: string;
  refPerson?: string;
  contractConfirmation?: string;
  docsForPayment?: string;
  otherTerms?: string;
  compliance?: string;
  recapValidity?: string;
  deliveryBasis?: string;
  loadingWindow?: string;
  shippingTerms?: string;
  governingLaw?: string;
  annexSpecs?: string;
  qualityPremiums?: string;
  specialNote?: string;
  loiIssueNumber?: string | null;
  dealRecapNumber?: string | null;
  vesselName?: string;
  notifyParty?: string;
  packing?: string;
  charterPartyDate?: string;
  freightAdvance?: string;
  loadingTimeDays?: string;
  loadingTimeHours?: string;
  placeOfIssue?: string;
  dateOfIssue?: string;
  companyOnBehalf?: string;
  masterOfVessel?: string;
  agentsName?: string;
  // ICA-specific fields
  effectiveDate?: string;
  principalEntityType?: string;
  principalCountry?: string;
  principalRegNo?: string;
  principalRepresentative?: string;
  principalDesignation?: string;
  principalPassport?: string;
  agentEntityType?: string;
  agentCountry?: string;
  agentRegNo?: string;
  agentRepresentative?: string;
  agentDesignation?: string;
  agentPassport?: string;
  agentLabel?: string; // "Agent" | "Broker" | "Facilitator"
  agencyType?: string; // "Exclusive" | "Non-Exclusive"
  contractRef?: string;
  contractValue?: string;
  commissionStructure?: string;
  commissionBasis?: string;
  termYears?: string;
  seatOfArbitration?: string;
  venueOfArbitration?: string;
  numArbitrators?: string;
  amlOption?: string;
  recordKeepingYears?: string;
  principalBankName?: string;
  principalBankAddress?: string;
  principalAccountName?: string;
  principalAccountNumber?: string;
  principalIban?: string;
  principalSwift?: string;
  agentBankName?: string;
  agentBankAddress?: string;
  agentAccountName?: string;
  agentAccountNumber?: string;
  agentIban?: string;
  agentSwift?: string;
  // Transaction Feasibility Report — flexible key/value map of all TFR fields
  tfrData?: Record<string, string>;
  // FOB Procedure (EN590) — flexible key/value map of all procedure fields
  fobData?: Record<string, string>;
  // DLC Draft MT700 — flexible key/value map of all SWIFT MT700 fields
  dlcData?: Record<string, string>;
  // Performance Bank Guarantee Draft MT760 — flexible key/value map of all SWIFT MT760 fields
  pbgData?: Record<string, string>;
  // Proforma Invoice — commercial terms inherited from an approved SPA.
  piData?: ProformaInvoiceData;
  // SPA Addendum — selected clause amendments linked to an existing SPA.
  addendumData?: SpaAddendumData;
}

// SWIFT-structure sanitization shared by the MT700/MT760 draft templates:
// braces open/close message blocks, ":NN:" starts a new field tag and "-}"
// terminates block 4 — user input must never carry these.
function swiftCleanLine(s: string): string {
  return String(s).replace(/[{}]/g, "").replace(/[\r\n\u0000-\u001f]+/g, " ").trim();
}
function swiftCleanBlock(s: string): string {
  return String(s)
    .split(/\r\n?|\n/)
    .filter(l => !/^\s*(:\d{2}[A-Z]?:|-\})/.test(l))
    .map(l => l.replace(/[{}]/g, "").replace(/[\u0000-\u001f]/g, ""))
    .join("\n")
    .trim();
}

const today = () => new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
const v = (val?: string, fallback = "_______________") => val?.trim() || fallback;

// Renders a party's company name, joining a joint second company when present
// ("Primary Co jointly with Second Co"). Falls back like v() when both blank.
function partyName(p?: PartyDetails, fallback?: string): string {
  const primary = p?.name?.trim() || fallback?.trim() || "";
  const co = p?.coName?.trim() || "";
  if (primary && co) return `${primary} jointly with ${co}`;
  return v(primary || co);
}

// Renders a per-party field (address/contact) for a possibly-joint party:
// both values present → "primary / co"; otherwise whichever exists.
function partyField(primary?: string, co?: string): string {
  const a = (primary || "").trim();
  const b = (co || "").trim();
  if (a && b) return `${a} / ${b}`;
  return v(a || b);
}

// Joint second company rendered as its OWN labeled block, immediately after
// the primary party's block (never merged into the primary party's lines).
// Labels are prefixed ("Co-Seller Company") so parsers can round-trip them
// without colliding with the primary "Company:" labels. Returns "" when the
// party has no joint co-company.
function coPartyBlock(label: "Co-Seller" | "Co-Buyer", p?: PartyDetails): string {
  const co = p?.coName?.trim();
  if (!co) return "";
  return `

${label.toUpperCase()} DETAILS (JOINT ${label === "Co-Seller" ? "SELLER" : "BUYER"})
${label} Company: ${co}
${label} Address: ${v(p?.coAddress)}
${label} Contact: ${v(p?.coContact)}`;
}

function tradeBlock(trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails): string {
  const cur = product?.currency || trade?.currency || "USD";
  return `Commodity: ${v(product?.commodity, trade?.commodity)}
Quantity: ${v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined)}
Packing: ${v(product?.packing)}
Origin: ${v(product?.origin, trade?.origin)}
Unit Price: ${cur} ${v(product?.price, trade ? trade.pricePerUnit.toLocaleString() : undefined)}
Currency: ${cur}
Incoterm: ${v(product?.incoterm, trade?.incoterm)}
Buyer: ${v(buyer?.name, trade?.buyerName)}${buyer?.coName?.trim() ? `\nCo-Buyer: ${buyer.coName.trim()}` : ""}
Seller: ${v(seller?.name, trade?.sellerName)}${seller?.coName?.trim() ? `\nCo-Seller: ${seller.coName.trim()}` : ""}`;
}

// Parse the enquiry spec blob (one spec per line in the form
// `Parameter: Specification (Rejection: X) [Method: Y]`) into structured rows
// [parameter, specification, rejection, testMethod]. Uses the same end-anchored
// token rules as the enquiry/document editors: strip `[Method: …]` first, then
// `(Rejection: …)`, then split the remainder on the first colon. Lines that are
// already pipe-delimited are passed through; unstructured lines fall back to a
// single readable row (whole text in the Parameter column).
export function parseSpecBlobRows(blob?: string): [string, string, string, string][] {
  const raw = (blob || "").trim();
  if (!raw) return [];
  const cell = (s: string) => (s || "").replace(/\|/g, "/").trim();
  const rows: [string, string, string, string][] = [];
  for (const lineRaw of raw.split("\n")) {
    const line = lineRaw.trim();
    if (!line) continue;
    if (line.includes("|")) {
      const c = line.split("|").map((x) => x.trim());
      if (c.filter(Boolean).length === 0) continue;
      rows.push([cell(c[0] || ""), cell(c[1] || ""), cell(c[2] || ""), cell(c[3] || "")]);
      continue;
    }
    let rest = line;
    let testMethod = "";
    let rejection = "";
    const methodMatch = rest.match(/\s*\[Method:\s*([\s\S]*?)\]\s*$/i);
    if (methodMatch) {
      testMethod = methodMatch[1].trim();
      rest = rest.replace(/\s*\[Method:\s*[\s\S]*?\]\s*$/i, "").trim();
    }
    const rejMatch = rest.match(/\s*\(Rejection:\s*([\s\S]*?)\)\s*$/i);
    if (rejMatch) {
      rejection = rejMatch[1].trim();
      rest = rest.replace(/\s*\(Rejection:\s*[\s\S]*?\)\s*$/i, "").trim();
    }
    let parameter = rest;
    let specification = "";
    const colonIdx = rest.indexOf(":");
    if (colonIdx > -1) {
      parameter = rest.slice(0, colonIdx).trim();
      specification = rest.slice(colonIdx + 1).trim();
    }
    rows.push([cell(parameter), cell(specification), cell(rejection), cell(testMethod)]);
  }
  return rows;
}

// Build a pipe-delimited spec table block (header + one row per spec) that the
// generic DOCX/PDF builders render as a real bordered table.
export function specTable(product?: ProductDetails): string {
  const header = "Parameter | Specification | Rejection | Test Method";
  const rows = parseSpecBlobRows(product?.qualitySpecs);
  if (rows.length === 0) {
    return `${header}\n_______________ | _______________ | _______________ | _______________`;
  }
  const lines = [header];
  for (const [a, b, c, d] of rows) {
    // Grade markers survive the existing four-column downstream parser, while
    // separating the two independently specified LPG grades in output.
    if (a === "Propane grade" && rows.some(r => r[0] === "n-Butane grade")) {
      lines.push("", "Quality Specifications:", header);
    }
    lines.push(`${a || "-"} | ${b || "-"} | ${c || "-"} | ${d || "-"}`);
  }
  return lines.join("\n");
}

function qualityBlock(product?: ProductDetails): string {
  return `Quality Specifications:\n${specTable(product)}`;
}

function deliveryBlock(trade?: Trade, product?: ProductDetails): string {
  return `Loading Port: ${v(product?.loadingPort, trade?.origin)}
Discharge Port: ${v(product?.dischargePort, trade?.destination)}
Laycan: ${v(product?.laycan)}
Delivery Terms: ${v(product?.incoterm, trade?.incoterm)}`;
}

function paymentBlock(product?: ProductDetails): string {
  if (product?.paymentTerms) {
    return `Payment Terms: ${product.paymentTerms}`;
  }
  return `Payment Method: Irrevocable, Transferable, Confirmed Documentary Letter of Credit (DLC)
LC Issuing Bank: Top 25 World Bank
LC Validity: _____ days
Performance Bond: 2% of contract value`;
}

function inspectionBlock(product?: ProductDetails): string {
  const agency = product?.analysisAgency?.trim();
  const contact = product?.analysisAgencyContact?.trim();
  const dualGradeLpg = product?.qualitySpecs?.includes("n-Butane grade:") && product?.qualitySpecs?.includes("Propane grade:");
  const agencyName = agency || (dualGradeLpg ? "SGS or its appointed representative agent or affiliated company" : "SGS / Bureau Veritas");
  let block = `INSPECTION & ANALYSIS
Analysis Agency: ${agencyName}`;
  if (contact) block += `\nAgency Contact: ${contact}`;
  block += `\nPre-shipment inspection by ${agencyName} at loading port at Seller's cost.
Discharge inspection at Buyer's cost.`;
  return block;
}

function specialNoteBlock(product?: ProductDetails): string {
  if (!product?.specialNote) return "";
  return `\nSPECIAL NOTES\n${product.specialNote}`;
}

function buyerBlock(buyer?: PartyDetails, trade?: Trade): string {
  return `BUYER DETAILS
Company: ${v(buyer?.name, trade?.buyerName)}
Address: ${v(buyer?.address)}
Contact: ${v(buyer?.contact)}
Bank: ${v(buyer?.bank)}
SWIFT/BIC: ${v(buyer?.swift)}${coPartyBlock("Co-Buyer", buyer)}`;
}

function sellerBlock(seller?: PartyDetails, trade?: Trade): string {
  return `SELLER DETAILS
Company: ${v(seller?.name, trade?.sellerName)}
Address: ${v(seller?.address)}
Contact: ${v(seller?.contact)}
Bank: ${v(seller?.bank)}
SWIFT/BIC: ${v(seller?.swift)}${coPartyBlock("Co-Seller", seller)}`;
}

const templates: Record<string, (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => string> = {

  TFR: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const t = product?.tfrData || {};
    const g = (key: string, fb = "____") => {
      const val = t[key];
      return (val !== undefined && String(val).trim()) ? String(val).trim() : fb;
    };
    const dv = (key: string) => g(key, "—");
    const cb = (selected: string | undefined, options: string[]) =>
      options.map(o => `${selected && selected === o ? "[X]" : "[ ]"} ${o}`).join("    ");

    return `TRANSACTION FEASIBILITY REPORT

Date: ${today()}
Reference: ${trade?.tradeRef || g("reference")}${t.basisDocuments && String(t.basisDocuments).trim() ? `
Basis Documents: ${String(t.basisDocuments).trim()}` : ""}

To: ${g("addressedToName")}
Address: ${g("addressedToAddress")}
Attn.: ${g("addressedToAttn", "Trade Finance Department")}

1. EXECUTIVE SUMMARY

Transaction Overview | Import | Export
Product | ${dv("productImport")} | ${dv("productExport")}
Origin | ${dv("originImport")} | ${dv("originExport")}
Destination | ${dv("destinationImport")} | ${dv("destinationExport")}
Quantity | ${dv("quantityImport")} | ${dv("quantityExport")}
Price (per Mt) | ${dv("priceImport")} | ${dv("priceExport")}
Contract Value | ${dv("contractValueImport")} | ${dv("contractValueExport")}
Delivery Terms (Incoterms) | ${dv("deliveryTermsImport")} | ${dv("deliveryTermsExport")}
Payment Terms | ${dv("paymentTermsImport")} | ${dv("paymentTermsExport")}
Transaction Duration | ${dv("durationImport")} | ${dv("durationExport")}

2. PARTIES TO THE TRANSACTION

Parties | Import | Export
Party | ${dv("partyImport")} | ${dv("partyExport")}
Intermediary | ${dv("intermediaryImport")} | ${dv("intermediaryExport")}

3. FINANCIAL FEASIBILITY

Transaction Economics:
Particulars | Import (USD) | Export (USD) | Total Value (USD)
Purchase Cost (per mt) | ${dv("purchaseCostImport")} | ${dv("purchaseCostExport")} | ${dv("purchaseCostTotal")}
Freight Cost (per mt) | ${dv("freightImport")} | ${dv("freightExport")} | ${dv("freightTotal")}
Insurance Cost (per mt) | ${dv("insuranceImport")} | ${dv("insuranceExport")} | ${dv("insuranceTotal")}
Inspection Cost (per mt) | ${dv("inspectionImport")} | ${dv("inspectionExport")} | ${dv("inspectionTotal")}
Banking Cost | ${dv("bankingImport")} | ${dv("bankingExport")} | ${dv("bankingTotal")}
Other Cost | ${dv("otherImport")} | ${dv("otherExport")} | ${dv("otherTotal")}
Total | ${dv("totalImport")} | ${dv("totalExport")} | ${dv("totalTotal")}
Gross Profit | ${dv("grossProfitImport")} | ${dv("grossProfitExport")} | ${dv("grossProfitTotal")}
Net Profit | ${dv("netProfitImport")} | ${dv("netProfitExport")} | ${dv("netProfitTotal")}

Summary:
Particulars | Value
Gross Profit | ${dv("sumGrossProfit")}
Net Profit | ${dv("sumNetProfit")}
Import Total Cost | ${dv("importTotalCost")}
Export Total Cost | ${dv("exportTotalCost")}
Gross Margin | ${dv("grossMargin")}
ROI | ${dv("roi")}
Breakeven Analysis | ${dv("breakevenAnalysis")}

Conclusion:
${cb(t.financialConclusion, ["Financially Attractive", "Marginally Viable", "Not Attractive"])}

6. TRADE FINANCE FEASIBILITY

Proposed Banking Structure:
Possible Instruments: ${g("proposedInstruments", "Letter of Credit (LC), Standby Letter of Credit (SBLC), Documentary Collection, Bank Guarantee, Performance Bond, Back-to-Back LC, Deferred Payment LC")}

Banking Assessment:
Buyer Bank: ${g("buyerBank")}
Buyer Bank Rating: ${g("buyerBankRating")}
Seller Bank: ${g("sellerBank")}
Seller Bank Rating: ${g("sellerBankRating")}

Financing Requirement:
Working Capital Required: ${g("workingCapitalRequired")}
Financing Period: ${g("financingPeriod")}
Expected Yield: ${g("expectedYield")}

Conclusion:
${cb(t.financeConclusion, ["Bankable", "Bankable with Conditions", "Not Bankable"])}

7. LOGISTICS FEASIBILITY

Transportation:
Loading Port: ${g("loadingPort")}
Discharge Port: ${g("dischargePort")}
Shipping Route: ${g("shippingRoute")}
Transit Time: ${g("transitTime")}

Infrastructure Assessment:
Port Capacity: ${g("portCapacity")}
Vessel Availability: ${g("vesselAvailability")}
Storage Facilities: ${g("storageFacilities")}
Inland Transportation: ${g("inlandTransportation")}

Risks:
Congestion: ${g("congestion")}
Weather: ${g("weather")}
Political Disruptions: ${g("politicalDisruptions")}
Sanctions: ${g("logisticsSanctions")}

Conclusion:
${cb(t.logisticsConclusion, ["Logistically Feasible", "Requires Mitigation", "Not Feasible"])}

8. LEGAL & COMPLIANCE REVIEW

Corporate Due Diligence:
Corporate Registration: ${g("corporateRegistration")}
Beneficial Ownership: ${g("beneficialOwnership")}
Trade Licenses: ${g("tradeLicenses")}
Authority of Signatories: ${g("authorityOfSignatories")}

AML/KYC Review:
Sanctions Screening: ${g("sanctionsScreening")}
PEP Screening: ${g("pepScreening")}
Adverse Media Search: ${g("adverseMediaSearch")}
Ultimate Beneficial Owner Verification: ${g("uboVerification")}

Contract Review:
SPA: ${g("reviewSpa")}
Performance Bond: ${g("reviewPerformanceBond")}
LC Terms: ${g("reviewLcTerms")}
Arbitration Clauses: ${g("reviewArbitration")}

Conclusion:
${cb(t.complianceConclusion, ["Compliant", "Additional Review Required", "High Risk"])}

9. RISK ASSESSMENT

Commercial Risks:
Supplier Default: ${g("supplierDefault")}
Buyer Default: ${g("buyerDefault")}
Quality Disputes: ${g("qualityDisputes")}

Financial Risks:
Currency Risk: ${g("currencyRisk")}
Payment Risk: ${g("paymentRisk")}
Funding Risk: ${g("fundingRisk")}

Political Risks:
Export Restrictions: ${g("exportRestrictions")}
Sanctions: ${g("riskSanctions")}
Government Intervention: ${g("governmentIntervention")}

Operational Risks:
Shipment Delay: ${g("shipmentDelay")}
Documentation Errors: ${g("documentationErrors")}
Force Majeure: ${g("forceMajeure")}

Risk Rating:
Risk Category | Rating
Commercial | ${dv("commercialRating")}
Financial | ${dv("financialRating")}
Operational | ${dv("operationalRating")}
Political | ${dv("politicalRating")}
Compliance | ${dv("complianceRating")}

Overall Risk Rating:
${cb(t.overallRisk, ["Low", "Medium", "High"])}

10. SECURITY STRUCTURE

Available Security:
Corporate Guarantee: ${g("corporateGuarantee")}
Personal Guarantee: ${g("personalGuarantee")}
Post-Dated Cheques: ${g("postDatedCheques")}
Performance Bond: ${g("securityPerformanceBond")}
SBLC: ${g("sblc")}
Bank Guarantee: ${g("bankGuarantee")}
Escrow Arrangement: ${g("escrowArrangement")}

Adequacy Assessment:
${cb(t.securityAdequacy, ["Adequate", "Partially Adequate", "Inadequate"])}

11. OVERALL FEASIBILITY CONCLUSION

Final Assessment:
Commercial Feasibility: ${cb(t.commercialFeasibility, ["Yes", "No"])}
Financial Feasibility: ${cb(t.financialFeasibilityFinal, ["Yes", "No"])}
Banking Feasibility: ${cb(t.bankingFeasibility, ["Yes", "No"])}
Operational Feasibility: ${cb(t.operationalFeasibility, ["Yes", "No"])}
Compliance Feasibility: ${cb(t.complianceFeasibilityFinal, ["Yes", "No"])}

Recommendation:
${cb(t.recommendation, ["Proceed Immediately", "Proceed Subject to Conditions", "Re-Structure Transaction", "Do Not Proceed"])}

Conditions Precedent (if applicable):
${g("conditionsPrecedent", "—")}
${t.additionalDetails ? `
12. ADDITIONAL DETAILS

${String(t.additionalDetails).trim()}
` : ""}
Prepared By: ${g("preparedBy")}
Date: ${g("preparedDate", today())}
Approved By: ${g("approvedBy")}
Date: ${g("approvedDate")}
`;
  },

  FOB_PROCEDURE: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const f = product?.fobData || {};
    const g = (key: string, fb = "_______________") => {
      const val = f[key];
      return (val !== undefined && String(val).trim()) ? String(val).trim() : fb;
    };
    const isExport = (f.direction || "").toLowerCase().startsWith("export");
    const prod = g("product", "Diesel EN590 / AGO 10ppm");
    const terminal = g("terminal", "Nargis Terminal");
    const location = g("location", "Mersin, Turkey");
    const inspector = g("inspectionAgency", "SGS / Saybolt");

    const header = `${isExport ? "FOB EXPORT (SELL) PROCEDURE" : "FOB IMPORT (BUY) PROCEDURE"}
${"=".repeat(50)}

Date: ${today()}
Reference: ${g("reference", trade?.tradeRef || "_______________")}
Transaction Side: ${isExport ? "Export / Seller" : "Import / Buyer"}
Product: ${prod}
Terminal: ${terminal}
Terminal Location: ${location}
Tank Number: ${g("tankNumber")}
Quantity: ${g("quantity")}
Price Basis: ${g("price")}
Buyer: ${g("buyer", buyer?.name || trade?.buyerName)}
Seller: ${g("seller", seller?.name || trade?.sellerName)}
Inspection Agency: ${inspector}
Payment Instrument: ${g("paymentInstrument", "Irrevocable LC / SBLC / MT103")}`;

    const importBody = `PROCEDURAL STEPS
We hereby agree to purchase ${prod} on an FOB Tank / FOB Terminal basis at ${terminal}. In order to complete the transaction, we request you to follow the steps mentioned below. Please be advised that all steps are mandatory to follow to complete the transaction.

STEP ONE - PRODUCT DUE DILIGENCE DOCUMENTS
The Buyer shall obtain and verify the following from the Seller:
[ ] Terminal Storage Agreement (TSA)
[ ] Product Ownership Declaration
[ ] Product Passport / Specification Sheet
[ ] Latest Quality Report issued by ${inspector} as Inspection Agency
[ ] Tank Details - Tank Number, Tank Capacity, Product Quantity Available, Terminal Location
[ ] Authorisation from the Terminal allowing the Seller to dispose of the product

STEP TWO - SPA EXECUTION
Execute a Sales and Purchase Agreement (SPA) containing:
[ ] Product specification
[ ] Quantity
[ ] Price formula
[ ] FOB point
[ ] Incoterms 2020 FOB provisions
[ ] Inspection procedure
[ ] Transfer procedure
[ ] Payment terms
[ ] Title transfer clause
[ ] Arbitration clause (ICC preferred)

STEP THREE - LATEST PROOF OF PRODUCT
The Seller provides:
[ ] Fresh Tank Storage Receipt
[ ] Product Passport
[ ] Tank Certificate
[ ] Latest SGS Report
[ ] Authority to Verify (ATV)
The Buyer verifies directly with the terminal and the inspection company.

STEP FOUR - DIP TEST / QUANTITY VERIFICATION
The Buyer appoints an accredited inspector (${inspector}) who conducts:
[ ] Tank dipping
[ ] Sampling
[ ] Quantity measurement
[ ] Quality verification
The Buyer receives the Quantity Report and the Quality Report.

STEP FIVE - PAYMENT
Upon satisfactory verification, the Buyer pays in accordance with the SPA.
If the product belongs to a different company, the Seller must provide an Authorisation to Sell and Collect (ATSC) from the original owner. The original owner must authenticate the Seller's bank account (for receipt of payment) to the Buyer's official email, with a copy to the Seller and the tank/terminal owner, indicating their no objection to transfer of payment to the Seller's account, and must attach a board resolution or power of attorney (if applicable) indicating irrevocable authority to send the email for this transaction.
The Terminal Owner must issue a Conditional Release of Product Certificate to the Buyer indicating ownership details, the Seller's details, product, value and storage details, irrevocably confirming their ability, readiness and acceptance to transfer ownership of the cargo to the Buyer against proof of successful transfer of funds by MT103 to the Seller's account.
[ ] Ownership-transfer documentation executed
[ ] Terminal acknowledges the Buyer (or its nominated company) as new owner and issues a new Ownership Certificate in its favour

STEP SIX - LIFTING OF PRODUCT
[ ] Buyer nominates vessel, barge, tank trucks or pipeline transfer
[ ] Terminal issues loading authorisation`;

    const exportBody = `TRANSACTION PROCEDURE
We hereby agree to sell ${prod} on an FOB Tank / FOB Terminal basis at ${terminal}, ${location}. To complete the transaction, the Buyer must follow the transaction procedure as per below:

STEP ONE - BUYER'S KYC
The Buyer shall prepare and be able to submit:
[ ] Certificate of Incorporation / Company Registration
[ ] Tax Registration and Signatory Authority
[ ] Financial Capability / Proof of Funds / Bank's confirmation to issue LC or Bank Guarantee

STEP TWO - OFFER AND SPA EXECUTION
The Seller issues and executes:
[ ] Soft Corporate Offer (SCO) or Full Corporate Offer (FCO)
[ ] Sales and Purchase Agreement (specification, quantity, price formula, FOB point)
[ ] Incoterms 2020 FOB provisions
[ ] Inspection and transfer procedure
[ ] Payment terms and title-transfer clause
[ ] Arbitration clause (ICC preferred)
[ ] Product Passport / Specification Sheet
[ ] Quality Report issued by ${inspector} as Inspection Agency
[ ] Tank details (number, capacity, quantity, location)
[ ] Terminal authorisation to dispose of the product
If the product is owned by a third party, obtain an Authorisation to Sell and Collect (ATSC) from the original owner.

STEP THREE - PROOF OF PRODUCT
The Seller issues to the Buyer:
[ ] Fresh Tank Storage Receipt
[ ] Product Passport
[ ] Tank Certificate
[ ] Latest SGS Report
[ ] Authority to Verify (ATV) so the Buyer can confirm with the terminal

STEP FOUR - PAYMENT SECURITY
Before permitting the dip test or any transfer, the Seller shall secure:
[ ] Buyer's Irrevocable LC / SBLC or Bank Payment Undertaking, received and verified
[ ] Agreement on the Terminal Conditional Release Certificate mechanism

STEP FIVE - DIP TEST AND QUANTITY VERIFICATION
The Seller facilitates the Buyer's inspector (${inspector}):
[ ] Grant the inspector tank access
[ ] Tank dipping and sampling
[ ] Quantity and quality verification
[ ] Joint Quantity and Quality Reports issued

STEP SIX - PAYMENT AND TITLE TRANSFER
If the product belongs to a third party, the Seller shall provide the ATSC from the original owner; the original owner authenticates the Seller's bank account by official email to the Buyer (copied to the Seller and the terminal owner) confirming no objection to payment.
[ ] Terminal issues a Conditional Release of Product Certificate to the Buyer
[ ] Payment received by MT103 to the authenticated account
[ ] Ownership-transfer documentation executed
[ ] Terminal issues a new Ownership Certificate in the Buyer's favour

STEP SEVEN - LOADING AND DELIVERY
Against confirmed payment:
[ ] Receive the Buyer's vessel, barge or truck nomination
[ ] Terminal issues loading authorisation
[ ] Loading commences`;

    const common = `${isExport ? "SELLER" : "BUYER"}
Company: ${isExport ? v(seller?.name, g("seller")) : v(buyer?.name, g("buyer"))}
Name: _______________
Title: _______________

The digital signature, date and time of signing, and IP address of the signing party are captured electronically and appended below upon execution.`;

    return `${header}

${isExport ? exportBody : importBody}

${common}`;
  },

  SCO: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const cur = product?.currency || trade?.currency || "USD";
    return `SOFT CORPORATE OFFER (SCO)
${"=".repeat(50)}

Date: ${today()}
Reference: ${trade?.tradeRef || "_______________"}

TO:
Company: ${v(buyer?.name, trade?.buyerName)}
Address: ${v(buyer?.address)}
Attention: ${v(buyer?.contact)}${coPartyBlock("Co-Buyer", buyer)}

FROM (SELLER):
Company: ${v(seller?.name, trade?.sellerName)}
Address: ${v(seller?.address)}
Attention: ${v(seller?.contact)}${coPartyBlock("Co-Seller", seller)}

${"─".repeat(50)}

We hereby offer the following commodity under the terms and conditions set forth below:

Sr. │ Parameters                  │ Details
${"─".repeat(60)}
01  │ Commodity                   │ ${v(product?.commodity, trade?.commodity)}
02  │ Origin                      │ ${v(product?.origin, trade?.origin)}
03  │ Quantity                    │ ${v(product?.quantity, trade?.quantity ? `${trade.quantity} ${trade.unit || "MT"}` : undefined)}
04  │ Incoterms                   │ ${v(product?.incoterm, trade?.incoterm)}
05  │ Delivery Period             │ ${v(product?.laycan)}
06  │ Price                       │ ${cur} ${v(product?.price, trade?.pricePerUnit?.toString())} per MT
07  │ Quality Specifications      │ See Quality Specifications table below
08  │ Payment Terms               │ ${v(product?.paymentTerms)}
09  │ Inspection                  │ ${v(product?.analysisAgency, "SGS, Intertek or Bureau Veritas")}

Quality Specifications
${specTable(product)}

${"─".repeat(50)}

This offer is valid for acceptance within seven (7) calendar days from the date of issuance.

Upon acceptance of this SCO by the Buyer, both parties agree to proceed with the preparation and execution of a Deal Recap followed by a Sales & Purchase Agreement (SPA).

${"─".repeat(50)}

AUTHORISED SIGNATORY
For and on behalf of: ${partyName(seller, trade?.sellerName)}
Name: _______________
Title: _______________
Date: ${today()}
Signature: _______________`;
  },

  DEAL_RECAP: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const cur = product?.currency || trade?.currency || "USD";
    const recapVal = product?.recapValidity?.trim() || "Valid for acceptance for five (5) calendar days from issuance, subject to Seller's confirmation and product availability.";
    const agency = v(product?.analysisAgency, "SGS, Intertek or Bureau Veritas");
    return `RECAP – COMMERCIAL TERMS CONFIRMATION
${"=".repeat(50)}


${"═".repeat(70)}
CHAPTER I – INTRODUCTORY & BACKGROUND
${"═".repeat(70)}

 Item                          │ Description
${"─".repeat(70)}
 Contract Reference            │ ${trade?.tradeRef || "_______________"}
${"─".repeat(70)}
 Effective Date                │ Date of last authorized signature
${"─".repeat(70)}
 Seller                        │ ${v(seller?.name, trade?.sellerName)}
${"─".repeat(70)}${seller?.coName?.trim() ? `\n Co-Seller                     │ ${seller.coName.trim()}\n${"─".repeat(70)}` : ""}
 Buyer                         │ ${v(buyer?.name, trade?.buyerName)}
${"─".repeat(70)}${buyer?.coName?.trim() ? `\n Co-Buyer                      │ ${buyer.coName.trim()}\n${"─".repeat(70)}` : ""}
 Legal Model of Contract       │ Sales and Purchase Agreement (SPA)
${"─".repeat(70)}
 Recap Validity                │ ${recapVal}
${"─".repeat(70)}


${"═".repeat(70)}
CHAPTER II – SCOPE & COMMERCIAL TERMS
${"═".repeat(70)}

 Item                          │ Description
${"─".repeat(70)}
 Commodity                     │ ${v(product?.commodity, trade?.commodity)}
${"─".repeat(70)}
 Country of Origin             │ ${v(product?.origin, trade?.origin)}
${"─".repeat(70)}
 Quality / Specification       │ As per Annexure I - Product Specifications
${"─".repeat(70)}
 Delivery Basis                │ ${v(product?.deliveryBasis, product?.incoterm || trade?.incoterm)}
${"─".repeat(70)}
 Contractual Quantity          │ ${v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined)}
${"─".repeat(70)}
 Packing                       │ ${v(product?.packing)}
${"─".repeat(70)}


${"═".repeat(70)}
CHAPTER III – FINANCIAL & OPERATIONAL ARRANGEMENTS
${"═".repeat(70)}

 Item                          │ Description
${"─".repeat(70)}
 Contract Price & Currency     │ ${(product?.price?.trim()?.toUpperCase().startsWith(cur.toUpperCase()) ? "" : cur + " ")}${v(product?.price, trade ? trade.pricePerUnit.toLocaleString() : undefined)}
${"─".repeat(70)}
 Payment Terms                 │ ${v(product?.paymentTerms)}
${"─".repeat(70)}
 Loading Window                │ ${v(product?.loadingWindow, product?.laycan)}
${"─".repeat(70)}
 Shipping Terms                │ ${product?.shippingTerms?.trim() || `Delivery Term: ${v(product?.incoterm, trade?.incoterm)}\nPort of Discharge (POD): ${v(product?.dischargePort, trade?.destination)}`}
${"─".repeat(70)}


${"═".repeat(70)}
CHAPTER IV – MISCELLANEOUS & BOILERPLATE
${"═".repeat(70)}

 Item                          │ Description
${"─".repeat(70)}
 Governing Law & Jurisdiction  │ ${v(product?.governingLaw)}
${"─".repeat(70)}
 Application of Industry Standards │ Applicable international industry standards and ICC rules
${"─".repeat(70)}


For and on behalf of the Seller:          For and on behalf of the Buyer:
${partyName(seller, trade?.sellerName).padEnd(42)}${partyName(buyer, trade?.buyerName)}

Name: ${v(seller?.contact).padEnd(36)}Name: ${v(buyer?.contact)}
Authorised Signatory: _______________     Authorised Signatory: _______________
Title: _______________                    Title: _______________
Date: ${today().padEnd(37)}Date: ${today()}

Signature & Stamp:                        Signature & Stamp:




${"═".repeat(70)}
ANNEXURE I - COMMODITY SPECIFICATIONS
${"═".repeat(70)}

PRODUCT SPECIFICATION
${specTable(product)}
${product?.specialNote ? `\nSPECIAL NOTES\n${product.specialNote}\n` : ""}
`;
  },

  FCO: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => `FULL CORPORATE OFFER (FCO)
${"=".repeat(40)}

Date: ${today()}
Reference: ${trade?.tradeRef || "_______________"}
Status: IRREVOCABLE — Binding upon Buyer's acceptance

PREAMBLE
We, the undersigned, hereby confirm and present this Full Corporate Offer for the supply of the commodity described below. This FCO is irrevocable and binding upon acceptance by the Buyer within the stipulated validity period.

PARTIES
${sellerBlock(seller, trade)}

${buyerBlock(buyer, trade)}

COMMODITY DETAILS
${tradeBlock(trade, buyer, seller, product)}

${qualityBlock(product)}

DELIVERY TERMS
${deliveryBlock(trade, product)}

PAYMENT TERMS
${paymentBlock(product)}

${inspectionBlock(product)}

DOCUMENTATION
- Full set of Bills of Lading (3/3)
- Certificate of Origin
- Certificate of Analysis / Quality
- Certificate of Weight
- Commercial Invoice
- Packing List
- Insurance Certificate (CIF terms)
${product?.docsForPayment?.trim() ? `\nDocuments for Payment: ${product.docsForPayment.trim()}` : ""}
${product?.contractConfirmation?.trim() ? `\nContract Confirmation: ${product.contractConfirmation.trim()}` : ""}
${product?.otherTerms?.trim() ? `\nOTHER TERMS & CONDITIONS\nOther Terms: ${product.otherTerms.trim()}` : ""}
${product?.compliance?.trim() ? `\nCOMPLIANCE\nCompliance: ${product.compliance.trim()}` : ""}

VALIDITY
${product?.validity?.trim() ? `Offer Validity: ${product.validity.trim()}` : "This FCO is valid for five (5) working days from the date of issuance."}
${specialNoteBlock(product)}

AUTHORISED SIGNATORY
Name: _______________
Title: _______________
Company: ${partyName(seller, trade?.sellerName)}
Date: ${today()}
Signature: _______________`,

  ICPO: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => `IRREVOCABLE CORPORATE PURCHASE ORDER (ICPO)
${"=".repeat(40)}

Date: ${today()}
Reference: ${trade?.tradeRef || "_______________"}
Status: IRREVOCABLE

PREAMBLE
We, the undersigned Buyer, hereby issue this Irrevocable Corporate Purchase Order to purchase the commodity described below, under the terms and conditions set forth herein.

PARTIES
${buyerBlock(buyer, trade)}

${sellerBlock(seller, trade)}

COMMODITY DETAILS
${tradeBlock(trade, buyer, seller, product)}

${qualityBlock(product)}${(product?.contractConfirmation || "").trim() ? `\nContract Confirmation: ${(product!.contractConfirmation || "").trim()}` : ""}

DELIVERY TERMS
${deliveryBlock(trade, product)}

PAYMENT TERMS
${paymentBlock(product)}${(product?.docsForPayment || "").trim() ? `\nDocuments for Payment: ${(product!.docsForPayment || "").trim()}` : ""}${(product?.otherTerms || "").trim() ? `\n\nOTHER TERMS & CONDITIONS\n${(product!.otherTerms || "").trim()}` : ""}${(product?.compliance || "").trim() ? `\n\nCOMPLIANCE\n${(product!.compliance || "").trim()}` : ""}

BUYER'S UNDERTAKING
1. The Buyer confirms readiness, willingness, and ability to purchase the above commodity.
2. The Buyer shall issue an Irrevocable, Transferable, Confirmed Documentary Letter of Credit (DLC) within _____ banking days of executing the SPA.
3. The LC shall be issued by a Top 25 World Bank acceptable to the Seller.

TERMS & CONDITIONS
1. Upon acceptance of this ICPO, the Seller shall issue a Draft SPA within 5 working days.
2. The Buyer shall sign and return the SPA within 3 working days of receipt.
3. Trial shipment of _____ MT may be arranged prior to full contract execution.
4. All disputes shall be settled by arbitration under ICC rules.

BANKING DETAILS
Bank Name: ${v(buyer?.bank)}
Account Name: ${v(buyer?.name, trade?.buyerName)}
SWIFT/BIC: ${v(buyer?.swift)}
Bank Officer: _______________
Bank Officer Email: _______________
${specialNoteBlock(product)}

AUTHORISED SIGNATORY
Name: _______________
Title: _______________
Company: ${partyName(buyer, trade?.buyerName)}
Date: ${today()}
Signature: _______________`,

  ADDENDUM: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const data = product?.addendumData;
    const amendments = data?.amendments || [];
    const originalSpaNumber = data?.originalSpaNumber || product?.dealRecapNumber || trade?.tradeRef || "_______________";
    const originalSpaDate = data?.originalSpaDate || "_______________";
    const addendumNumber = data?.addendumNumber || "1";
    const effectiveDate = data?.effectiveDate || today();
    const sellerName = v(seller?.name, trade?.sellerName);
    const sellerAddress = v(seller?.address);
    const buyerName = v(buyer?.name, trade?.buyerName);
    const buyerAddress = v(buyer?.address);
    const commodity = v(product?.commodity, trade?.commodity);
    const categoryLabel = (category: string) => ({
      commercial_terms: "COMMERCIAL TERMS",
      price: "PRICE",
      payment_terms: "PAYMENT TERMS",
      delivery: "DELIVERY / SHIPMENT",
      documentation: "DOCUMENTATION",
      entity: "SELLER / NOMINATED / RECEIVING ENTITY",
      banking: "BANKING ARRANGEMENTS",
      governing_law: "GOVERNING LAW AND DISPUTE RESOLUTION",
      specific_clause: "SPECIFIC CLAUSE",
      custom_clause: "CUSTOM CLAUSE",
    }[category] || category.replace(/_/g, " ").toUpperCase());
    const cleanTableCell = (value?: string) =>
      (value || "—").replace(/\|/g, "/").replace(/\r?\n+/g, "; ").trim() || "—";
    const cleanNarrative = (value?: string) =>
      (value || "").replace(/\|/g, "/").replace(/\r?\n/g, "\n").trim();

    const selectedSections = amendments.map((amendment, index) => {
      const number = index + 2;
      const existing = amendment.existingProvision?.trim()
        ? `\nExisting Provision:\n“${cleanNarrative(amendment.existingProvision)}”\n`
        : "";
      return `${number}. AMENDMENT TO ${categoryLabel(amendment.category)} — CLAUSE ${cleanNarrative(amendment.clauseNumber)}

The Parties agree that Clause ${cleanNarrative(amendment.clauseNumber)} of the Original SPA concerning ${cleanNarrative(amendment.description)} is amended as follows:
${existing}
The relevant provision shall be deleted and replaced, supplemented and/or clarified by the following:

“${cleanNarrative(amendment.amendedProvision)}”

This amendment shall take effect on ${effectiveDate}.`;
    }).join("\n\n");

    const commercialCategories = new Set([
      "commercial_terms", "price", "payment_terms", "delivery",
      "documentation", "entity", "banking",
    ]);
    const commercialAmendments = amendments.filter((item) => commercialCategories.has(item.category));
    const annexA = commercialAmendments.length ? `

ANNEXURE A
REVISED COMMERCIAL TERMS

Commercial Term | Original SPA | Amended Term | Effective Date
${commercialAmendments.map((item) =>
  `${cleanTableCell(item.description)} | ${cleanTableCell(item.existingProvision)} | ${cleanTableCell(item.amendedProvision)} | ${cleanTableCell(effectiveDate)}`
).join("\n")}
` : "";
    const annexB = `

ANNEXURE B
CLAUSE-BY-CLAUSE AMENDMENTS

Original SPA Clause | Existing Provision | Amended Provision | Effective Date
${amendments.map((item) =>
  `Clause ${cleanTableCell(item.clauseNumber)} | ${cleanTableCell(item.existingProvision)} | ${cleanTableCell(item.amendedProvision)} | ${cleanTableCell(effectiveDate)}`
).join("\n")}`;
    const standardStart = amendments.length + 2;

    return `ADDENDUM NO. ${addendumNumber} TO SALE AND PURCHASE AGREEMENT NO. ${originalSpaNumber}

This Addendum No. ${addendumNumber} (“Addendum”) is made and entered into on ${effectiveDate},

BY AND BETWEEN:

${sellerName}, having its registered office at ${sellerAddress}, hereinafter referred to as the “Seller”;

AND

${buyerName}, having its registered office at ${buyerAddress}, hereinafter referred to as the “Buyer”.

The Seller and Buyer are individually referred to as a “Party” and collectively as the “Parties”.

RECITALS

A. The Parties entered into a Sale and Purchase Agreement dated ${originalSpaDate}, bearing reference number ${originalSpaNumber} (the “Original SPA”), concerning the sale and purchase of ${commodity}.

B. The Parties have mutually agreed to amend, supplement and/or clarify the provisions selected below.

C. The Parties wish to record those amendments in this Addendum without altering any other provision of the Original SPA.

NOW, THEREFORE, IT IS AGREED AS FOLLOWS:

1. PURPOSE OF THE ADDENDUM

This Addendum forms an integral part of the Original SPA and shall be read together with it.

Except as expressly amended or supplemented by this Addendum, all terms, conditions, representations, warranties, obligations and provisions of the Original SPA remain unchanged and in full force and effect.

${selectedSections}

${standardStart}. EFFECTIVE DATE

This Addendum becomes effective on ${effectiveDate} upon execution by duly authorised representatives of both Parties.

${standardStart + 1}. NO NOVATION AND CONTINUING VALIDITY

Unless expressly stated otherwise, this Addendum amends and supplements the Original SPA and does not constitute a novation, rescission or termination. All rights and obligations accrued before the Effective Date remain unaffected.

In the event of any inconsistency between this Addendum and the Original SPA, this Addendum prevails only to the extent of that inconsistency.

${standardStart + 2}. COUNTERPARTS AND ELECTRONIC SIGNATURE

This Addendum may be executed in counterparts. Electronic signatures, digitally signed copies and scanned counterparts exchanged electronically shall, to the extent permitted by applicable law, have the same legal effect as originals.

${standardStart + 3}. ENTIRE AGREEMENT, CONFIDENTIALITY AND AUTHORITY

This Addendum, together with the Original SPA and its duly executed annexures, schedules and prior amendments, constitutes the entire agreement concerning the subject matter amended herein.

The confidentiality obligations in the Original SPA apply equally to this Addendum. Each Party represents that it has full authority to enter into this Addendum and that its signatory is duly authorised to bind it.

IN WITNESS WHEREOF, the Parties have executed this Addendum through their duly authorised representatives.

FOR AND ON BEHALF OF THE SELLER

Legal Name: ${sellerName}
Address: ${sellerAddress}
Name: __________________________
Title: __________________________
Signature: ______________________
Date: ___________________________
Company Seal: ___________________

FOR AND ON BEHALF OF THE BUYER

Legal Name: ${buyerName}
Address: ${buyerAddress}
Name: __________________________
Title: __________________________
Signature: ______________________
Date: ___________________________
Company Seal: ___________________${annexA}${annexB}
`;
  },

  SPA: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    if (product?.spaVariant === "lpg-sts") return renderLpgStsSpa(trade, buyer, seller, product);
    const spaNum = product?.dealRecapNumber || trade?.tradeRef || "_______________";
    const curDate = today();
    const commodity = v(product?.commodity, trade?.commodity);
    const quantity = v(product?.quantity, trade ? `${trade.quantity} ${trade.unit || "MT"}` : undefined);
    const origin = v(product?.origin, trade?.origin);
    const loadingPort = v(product?.loadingPort, trade?.origin);
    const dischargePort = v(product?.dischargePort, trade?.destination);
    const price = v(product?.price, trade ? String(trade.pricePerUnit) : undefined);
    const cur = product?.currency || trade?.currency || "USD";
    const incoterm = v(product?.incoterm, trade?.incoterm);
    const paymentTerms = product?.paymentTerms?.trim() || "Irrevocable, Transferable, Confirmed Documentary Letter of Credit (DLC), payable at sight, issued from a prime international bank";
    const laycan = v(product?.laycan);
    const sName = v(seller?.name, trade?.sellerName);
    const sAddr = v(seller?.address);
    const sPic = v(seller?.pic, seller?.contact);
    const bName = v(buyer?.name, trade?.buyerName);
    const bAddr = v(buyer?.address);
    const bPic = v(buyer?.pic, buyer?.contact);
    const sellerBankName = v(seller?.bank);
    const sellerSwift = v(seller?.swift);
    const buyerBankName = v(buyer?.bank);
    const buyerSwift = v(buyer?.swift);
    const govLaw = v(product?.governingLaw, "Dubai, UAE");
    const arbitration = v(product?.governingLaw, "Dubai International Arbitration Centre (DIAC)");
    // Optional terms carried over from a parent LOI; only rendered when present so
    // the standard SPA (e.g. derived from a Deal Recap) is unaffected.
    const contractConfirmation = (product?.contractConfirmation || "").trim();
    const docsForPayment = (product?.docsForPayment || "").trim();
    const otherTerms = (product?.otherTerms || "").trim();
    const compliance = (product?.compliance || "").trim();
    const specialNote = (product?.specialNote || "").trim();

    return `SALES AND PURCHASE AGREEMENT (SPA)
${"=".repeat(60)}
SPA No: ${spaNum}
Date: ${curDate}

CONTRACT PREAMBLE
This Contract for sale and purchase of Commodity (hereinafter more particularly defined) made on this ${curDate} between:

SELLER
Name of Company: ${sName}
Address: ${sAddr}
PIC: ${sPic}
Email: ${seller?.contact || "_______________"}${coPartyBlock("Co-Seller", seller)}

(hereinafter ${seller?.coName?.trim() ? "jointly and severally " : ""}referred to as the Seller, which expression unless repugnant to the context shall mean and include its permitted assigns, successors, representatives, administrators and executors)

BUYER
Name of Company: ${bName}
Address: ${bAddr}
PIC: ${bPic}
Email: ${buyer?.contact || "_______________"}${coPartyBlock("Co-Buyer", buyer)}

(hereinafter ${buyer?.coName?.trim() ? "jointly and severally " : ""}referred to as the Buyer, which expression unless repugnant to the context shall mean and include its permitted assigns, successors, representatives, administrators and executors)

WHEREAS the Seller with full corporate authority, makes an irrevocable firm commitment to deliver the Commodity on ${incoterm} basis and hereby certifies, represents and warrants, that it can fulfill the requirement of this Contract and provide the Commodity in accordance with the below mentioned mutually agreed terms and conditions;

AND WHEREAS the Buyer agrees and makes an irrevocable commitment to purchase the Commodity under the below mentioned mutually terms and conditions;

NOW THIS AGREEMENT WITNESSETH AND IT IS HEREBY AGREED BY AND BETWEEN THE PARTIES HERETO AS FOLLOWS:

Article 1. Definitions
In this Contract the following terms shall, unless repugnant to the context, have the following meaning:

1.1
Arbitration Rules of the Dubai International Arbitration Centre shall mean and refer to the existing rules and subsequent modifications, amendments, revisions, substitutions thereto.

1.2
Business Day shall mean a day other than Saturday, Sunday, or a national holiday in the countries where the Parties are situated.

1.3
SGS shall mean Société Générale de Surveillance.

1.4
Commodity shall mean ${commodity} as per specifications in Article 3 and as per quantity in Article 4.

1.5
MT shall mean and refer to metric ton of ${commodity}.

1.6
Force Majeure Event shall mean and include any event, other than insufficiency of funds and non availability of Commodity, the consequences of which are beyond the control of the affected Party and which event cannot be prevented, overcome or remedied under the circumstances by the exercise by the affected Party of a standard of care and diligence consistent with that of a prudent man. The following shall be deemed to be Force Majeure Events:
a. An Act of God, fire, explosion, natural disasters such as flood, storm, lightning, avalanche, earthquake;
b. A strike, lock out or other industrial problem; An act of public enemy, war, terrorism, sabotage, blockade, revolution, civil unrest, riot, insurrection, epidemic;
c. Change in applicable laws substantially preventing performance of obligations.

1.8
Parties shall mean and refer to both the Buyer and the Seller.

1.9
Party shall mean and refer to either the Buyer or the Seller.

1.10
UCP 600 or URDG shall mean and refer to the International Chamber of Commerce Uniform Customs and Practice for Documentary Credits, Publication Number 600 and all subsequent modifications, amendments, revisions, substitutions thereto.

1.15
USD shall mean the currency of the United States of America.

Article 2. Aids to Interpretation
In this Contract unless repugnant to the context:

2.1
Words denoting singular include the plural and vice versa.

2.2
The headings are for convenience only and shall not affect interpretation.

2.3
Reference to any legislation, legislative provision, enactment, rules, includes any modification, re-enactment, substitution, subordinate legislation thereto.

Article 3. Name of Commodity and Specifications
Commodity: ${commodity}
Specifications:
${specTable(product)}${contractConfirmation ? `\n3.1 Cargo Confirmation: ${contractConfirmation}` : ""}

Article 4. Quantity
Total: ${quantity} Metric Tons per month (+/- 10% Buyers option)

Article 5. Price
Contract Price: ${cur} ${price} per Metric Ton on ${incoterm} basis.

Article 6. Origin and Delivery
6.1 Origin: ${origin}
6.2 Port of Loading: ${loadingPort}
6.3 Port of Discharge: ${dischargePort}

Article 7. Packing
${product?.packing?.trim() ? `Packing: ${product.packing.trim()}\n` : ""}Commodity shall be packed and marked in accordance with internationally accepted norms and standards applicable to the commodity.

Article 8. Shipment
8.1 Latest date of shipment: ${laycan}
8.2 Partial Shipment: Allowed (+/- 10% at Buyer's option)
8.3 Transshipment: As mutually agreed between the Parties.

Article 9. Contract Price and Value
The total contract value is ${cur} ${price} per Metric Ton on ${incoterm} basis. The contract price is firm and fixed for the duration of this Agreement unless mutually amended in writing by both Parties.

Article 10. Price Adjustment
In the event the quality of the Commodity does not conform to the specifications in Article 3, the Buyer shall have the right to either:
a. Reject the cargo and hold the Seller liable and responsible for the Buyer's losses; or
b. Accept the cargo, only if a price revision is mutually agreed upon by the Parties; failing such agreement the Buyer shall have the right to reject the cargo and hold the Seller responsible for the Buyer's losses including cost of DLC opening, lost profits and any claims from end buyers.

Article 11. Payment Terms
Payment Method: ${paymentTerms}
The DLC shall be valid for 90 days and shall be in conformity with rules of UCP Code 600 or URDG, latest revision as on date. All banking charges at Seller's bank are to Seller's account; all banking charges at Buyer's bank are to Buyer's account.

Article 12. Transfer of Title and Risk, Insurance
12.1 The Title with respect to each shipment shall pass from the Seller to the Buyer when the Seller receives payment reimbursement as set forth in Article 11.
12.2 All risk of loss, damage or destruction to the Commodity sold under this Contract shall pass from the Seller to the Buyer at the time of passing of the Bill of Lading.
12.3 Insurance for the Commodity shall be covered by the respective Party under ${incoterm} terms applicable to this Agreement.

Article 13. Advice of Delivery
13.1 The Seller shall send to the Buyer the Delivery advice within 1 Day after completion of loading advising the Commodity name, quantity, Bill of Lading date and ETA.
13.3 The Seller shall send a copy of documents as stipulated in Article 17 by e-mail within 2 Days after loading.
13.4 The Seller shall send to the Buyer 5, 3, 2, and 1 days notices of vessel estimated arrival at discharge port.

Article 14. Sampling and Analysis
The Seller shall, at its sole expense, appoint SGS (Société Générale de Surveillance) as analysis agency at loading port to determine the specifications of ${commodity} and other contents in the shipment, and provide a certificate showing Technical Specifications. The Buyer may appoint its own protective analysis agents at its sole expense.

Article 15. Weighing
At Loading Port, the Seller at its sole expense shall appoint SGS (Société Générale de Surveillance) to determine the weight of the shipment. The weight of the Commodity certified by SGS shall be the basis for the Seller's invoice. Certificate of Weight prepared by Seller's appointed Surveyor shall be final and binding on both Parties.

Article 16. Payment
16.1 Payment shall be guaranteed by opening a Documentary Letter of Credit (DLC), payable at sight, issued from a prime international bank. The DLC should be valid for 90 days.
16.2 The DLC shall be in conformity with UCP Code 600 or URDG, latest revision as on date, and any subsequent amendments thereto.
16.3 The DLC shall be payable against the Seller's sight draft for 100% of the value of the commodity, provided the sight draft is accompanied by documents as per Article 17.1.
16.4 Following completion of weighing, sampling, analysis and certification at the delivery point, the Seller shall prepare an invoice in USD based on the value of the shipment as per Technical Specifications issued by SGS at Loading Port.

Article 17. Documents to be Presented
17.1 For Payment - The following documents must be presented within agreed days after date but within the validity of the Letter of Credit:
17.1.1 Signed commercial invoice in 3 originals indicating value of goods shipped, contract number, DLC number.
17.1.2 3/3 full set of original "clean on board" Ocean Bills of Lading.
17.1.3 Certificate of Quality in 1 original and 3 copies issued by SGS at Loading Port, showing actual analysis results as per Article 14.
17.1.4 Certificate of Weight in 1 original and 3 copies issued by SGS at Loading Port certifying actual surveyed weight of cargo onboard vessel.
17.1.5 Certificate of Origin in 1 original and 3 copies issued by any Chamber of Commerce in ${origin}.
17.1.6 Cargo Manifest.
17.1.7 Packing List.${docsForPayment ? `\n17.2 Additional Documents for Payment (as agreed by the Parties): ${docsForPayment}` : ""}

Article 18. Taxes
Any export fees, taxes, duties, tariffs or other charges levied on the shipment in the country where the Commodity is loaded shall be to the sole account of the Seller. Any import fees, taxes, duties, tariffs or other charges in the country where the Commodity is unloaded shall be to the sole account of the Buyer.

Article 19. Loss of Cargo
In the event of partial or total loss of cargo, the weight and analysis as determined at Loading Port shall be final and shall be the basis of invoicing and payment.

Article 20. Force Majeure
20.1 If at any time during the existence of this Contract either Party is prevented from performing any obligation under this Contract as a result of a Force Majeure Event, the affected Party must within 7 days notify the other Party specifying: (a) the nature of the Force Majeure Event; (b) the estimated duration; (c) the obligations affected; (d) steps taken to remedy or mitigate the effects. Certificate issued by a Chamber of Commerce shall be sufficient proof of the existence of the Force Majeure Event.
20.2 If agreed that the Force Majeure Event substantially prevents the affected Party from performing obligations, the period for performance shall be extended by a period equal to the duration of the Force Majeure Event. Time lost during Force Majeure will not count as lay time, even if the vessel is on demurrage.
20.3 If operation of the Force Majeure Event exceeds 30 days, either Party may by notice in writing refuse further performance of the Contract, in which case neither Party shall have the right to claim damages arising out of the said Force Majeure Event.

Article 21. Dispute Resolution
21.1 Good faith negotiations: If a dispute arises, either Party shall make a written request within 10 days of the dispute. The Parties shall endeavour to resolve the dispute by good faith negotiations within 15 days of receipt of the request for resolution.
21.2 Arbitration:
a. If within 30 days the dispute is not resolved by good faith negotiations, it shall be referred for resolution by arbitration.
b. All disputes shall be submitted for arbitration in accordance with the Arbitration Rules of the ${arbitration} by arbitrators appointed in accordance with the said Rules. The arbitral award shall be final and binding on both Parties and enforceable in any country where assets of the Parties are situated.
c. The venue of arbitration proceedings shall be ${govLaw}.
d. The law governing the arbitration agreement and the arbitral proceedings shall be the law of ${govLaw}.
f. The cost of arbitration shall be borne by the losing Party, unless otherwise determined by the Arbitral award.

Article 22. Performance
The performance of this contract is an essence of this contract. Seller shall either show past performance documents or shall pay a performance bond as agreed to Buyer's bank for opening of LC. Buyer's bank shall confirm opening of LC for the transaction and requesting Seller's bank to irrevocably confirm opening of Performance Bond within 3 banking days from date of receipt of Buyer's LC.

Article 23. Banking Information
23.1 Seller's Bank:
Bank Name: ${sellerBankName}
Address: ${sAddr}
Account Name: ${sName}
Swift Code: ${sellerSwift}

23.2 Buyer's Bank:
Bank Name: ${buyerBankName}
Address: ${bAddr}
Account Name: ${bName}
Swift Code: ${buyerSwift}

Article 24. Limit of Liability
24.1 Seller shall not be liable for any special, indirect, punitive, exemplary, incidental, or consequential loss or damages of any nature, howsoever caused, whether based on warranty, contract, tort (including negligence) or strict liability.
24.2 The total liability of Seller arising out of performance or nonperformance of this Agreement shall not exceed the price of the discrete unit/shipment involved in the applicable claim.
24.3 The limitations of liability set forth in this article shall prevail over any conflicting provisions contained in any documents comprising the contract.

Article 25. Miscellaneous
25.1 Notices: Any notice or communication under this Contract must be in writing and delivered on a Business Day, either by prepaid courier, facsimile, or email to the recipient at the address or e-mail specified hereinabove.
25.2 Confidentiality: The Parties agree that the terms of this Contract shall remain confidential between the Parties and neither Party shall disclose any terms to any third Party unless required by law or with prior written consent of the other Party.
25.3 Entire Agreement: This Contract constitutes the entire agreement between the Parties in relation to its subject matter and supersedes all prior arrangements, understandings, negotiations or provisions.
25.4 Amendment: Any amendments to this Contract shall be by way of writing only, including any amendments to this clause as well.
25.5 Insurance: The Seller shall cover by own cost all risks insurance issued by a 1st class Insurance company for the benefit of the Buyer.
25.6 Warranty: The commodity supplied by the Seller is considered not to constitute a hazard to health or safety provided that it is handled and used in accordance with normal accepted safe working practices.
25.7 Assignment: This Contract, in whole or in part, or any rights and/or obligations hereunder, is not assignable without the prior written consent of the other Party.
25.8 Counterparts: This Contract is executed in two counterparts both of which, taken together, shall be deemed to constitute the same instrument.
25.9 Waiver: The failure by a Party to enforce any of its rights under the Contract will not constitute a waiver of those rights.
25.10 Severance: If any provision of this Contract is prohibited or unenforceable in any jurisdiction, that provision shall be ineffective to the extent of the prohibition without invalidating the remaining provisions.
25.11 Persons signing Contract: Each person who signs this Contract on behalf of a Party warrants that they are duly authorized by that Party to do so and that they bind that Party by their actions.${otherTerms ? `\n25.12 Other Terms and Conditions: ${otherTerms}` : ""}${compliance ? `\n25.13 Compliance: ${compliance}` : ""}${specialNote ? `\n\nSPECIAL NOTES\n${specialNote}` : ""}

Article 26. Electronic Signatures and Digital Execution
26.1 The Parties expressly agree that this Agreement and all related transaction documents, amendments, notices, invoices, shipping documents, banking communications, and commercial correspondence may be executed, transmitted, and stored electronically.
26.2 Any document executed by electronic signature, digital signature, PDF signature, DocuSign, Adobe Sign, encrypted signature platform, blockchain verification system, SWIFT authenticated message, or scanned signed copy transmitted by electronic mail shall be deemed valid, binding, enforceable, and legally equivalent to an original manually signed document.
26.3 The Parties agree that electronically transmitted copies of this Agreement and related documents shall be admissible as evidence in any judicial, arbitral, banking, or administrative proceedings and shall constitute original documents for all contractual and legal purposes.
26.4 Neither Party shall challenge the validity, enforceability, admissibility, or authenticity of any electronically signed or digitally transmitted document solely on the basis that such document exists in electronic form.
26.5 Electronic communications exchanged through official company email addresses, SWIFT messages, secured trade platforms, or mutually accepted digital communication systems shall constitute valid written communications between the Parties.
26.6 The Parties acknowledge and accept that counterparts transmitted electronically shall together constitute one and the same instrument.

Article 27. Confidentiality and Non-Disclosure Disclaimer
27.1 This Agreement, including all commercial terms, pricing structures, banking information, trade procedures, vessel details, suppliers, buyers, intermediaries, and all related documents and communications exchanged between the Parties, shall be treated as strictly private and confidential.
27.2 Neither Party shall disclose, reproduce, circulate, publish, or communicate any confidential information to any third party without prior written consent from the other Party, except where disclosure is required by: (a) Applicable law or governmental authority; (b) Banking institutions involved in the transaction; (c) Insurance providers, inspectors, surveyors, shipping agents, legal advisors, auditors, or regulatory authorities strictly for purposes connected with the transaction.
27.3 The receiving Party shall ensure that its employees, affiliates, agents, representatives, consultants, and subcontractors maintain the same level of confidentiality.
27.4 Any unauthorized disclosure of confidential information causing commercial, financial, reputational, or operational damage to the other Party shall constitute a material breach and shall entitle the affected Party to seek injunctive relief, damages, and all other remedies available under applicable law and arbitration rules.
27.5 The confidentiality obligations contained herein shall survive termination, expiration, cancellation, or completion of this Agreement for a period of five (5) years from the date of termination.
27.6 This Article shall not restrict either Party from disclosing information required for legal proceedings, regulatory compliance, or professional advice, provided that reasonable notice is given to the other Party.

IN WITNESS WHEREOF the Parties hereto have executed this Agreement as of the date first written above.

SELLER
For and on behalf of: ${sName}
Name: _______________
Title/Designation: _______________
Signature: _______________
Date: ${curDate}
Stamp:

BUYER
For and on behalf of: ${bName}
Name: _______________
Title/Designation: _______________
Signature: _______________
Date: ${curDate}
Stamp:`;
  },

  LOI: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const cur = product?.currency || trade?.currency || "USD";
    const defaultValidity = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " (2000HRS Dubai Time)";
    })();
    const validTill = product?.validity?.trim() || defaultValidity;
    const refLine = product?.refPerson?.trim() || buyer?.contact?.trim() || "_______________";
    return `PURCHASE LETTER OF INTENT
${"=".repeat(50)}

Issued to Seller
─────────────────────────────────────────────────────
  ${v(seller?.name, trade?.sellerName)}
  ${v(seller?.address)}

  Attention (PIC)
  ${v(seller?.contact)}${coPartyBlock("Co-Seller", seller)}

                     Ref
  ${refLine}


  LOI Issue No. and Date
  ${product?.loiIssueNumber || trade?.tradeRef || "_______________"} , ${today()}

  Valid Till
  ${validTill}

  Purchase Incoterms
  ${v(product?.incoterm, trade?.incoterm)}

Issued by Buyer
─────────────────────────────────────────────────────
  ${v(buyer?.name, trade?.buyerName)}
  ${v(buyer?.address)}

  Attention (PIC)
  ${v(buyer?.contact)}${coPartyBlock("Co-Buyer", buyer)}


${"═".repeat(70)}
 Sr. No. │ Parameters                  │ Details
${"═".repeat(70)}
 01      │ Commodity                   │ ${v(product?.commodity, trade?.commodity)}
${"─".repeat(70)}
 02      │ Origin                      │ ${v(product?.origin, trade?.origin)}
${"─".repeat(70)}
 03      │ Quantity                    │ ${v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined)}
${"─".repeat(70)}
 04      │ Packing                     │ ${v(product?.packing)}
${"─".repeat(70)}
 05      │ Incoterms Terms             │ ${v(product?.incoterm, trade?.incoterm)}
${"─".repeat(70)}
 06      │ Delivery period             │ ${v(product?.laycan)}
${"─".repeat(70)}
 07      │ Price                       │ ${cur} ${v(product?.price, trade ? trade.pricePerUnit.toLocaleString() : undefined)}
${"─".repeat(70)}
 08      │ Contract Confirmation       │ ${v(product?.contractConfirmation, "Subject to Producer's Confirmation of cargo")}
${"─".repeat(70)}
 09      │ Commodity Specifications    │ As per Commodity Specifications table below
${"─".repeat(70)}
  10      │ Payment Terms               │ ${v(product?.paymentTerms, "By DLC against 2% Performance Bond")}
${"─".repeat(70)}
  11      │ Documents for Payment       │ ${v(product?.docsForPayment)}
${"─".repeat(70)}
  12      │ Other terms & conditions    │ ${v(product?.otherTerms)}
${"─".repeat(70)}
  13      │ Compliance                  │ ${v(product?.compliance)}
${"═".repeat(70)}

COMMODITY SPECIFICATIONS
${specTable(product)}
${(product?.loadingPort?.trim() || product?.dischargePort?.trim()) ? `\nLOGISTICS\nLoading Port: ${v(product?.loadingPort, trade?.origin)}\nDischarge Port: ${v(product?.dischargePort, trade?.destination)}\n` : ""}${product?.specialNote ? `\nSPECIAL NOTES\n${product.specialNote}\n` : ""}


We look forward to hearing from you within the stipulated LOI Validity
and look forward to a long term and mutually fruitful association.

With warm regards,
${partyName(buyer, trade?.buyerName)}


`;
  },

  POP: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => `PROOF OF PRODUCT (POP)
${"=".repeat(40)}

Date: ${today()}
Reference: ${trade?.tradeRef || "_______________"}

PREAMBLE
This document serves as Proof of Product confirming the availability and existence of the commodity described below. The Seller warrants the authenticity of all information provided herein.

${sellerBlock(seller, trade)}

COMMODITY DETAILS
${tradeBlock(trade, buyer, seller, product)}

PRODUCT SPECIFICATIONS
${specTable(product)}

DELIVERY TERMS
${deliveryBlock(trade, product)}

SUPPORTING EVIDENCE
The following documents are provided as proof of product:
☐ ${product?.analysisAgency?.trim() || "SGS / Bureau Veritas"} Inspection Report
☐ Mine/Refinery Certificate of Production
☐ Warehouse Receipt / Stock Report
☐ Recent Certificate of Analysis (COA)
☐ Photographs of Product at Source
☐ Export Licence (if applicable)

STORAGE LOCATION
Warehouse/Mine: _______________
Location: ${v(product?.origin, trade?.origin)}
Available Quantity: ${v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined)}

SELLER'S WARRANTY
The Seller hereby warrants that:
1. The product exists and is available for immediate sale.
2. The product meets the stated specifications.
3. The Seller has legal title and authority to sell.
4. All export permits and licences are in order.
${specialNoteBlock(product)}

AUTHORISED SIGNATORY
Name: _______________
Title: _______________
Company: ${partyName(seller, trade?.sellerName)}
Date: ${today()}
Signature: _______________`,

  POF: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => `PROOF OF FUNDS (POF)
${"=".repeat(40)}

Date: ${today()}
Reference: ${trade?.tradeRef || "_______________"}

PREAMBLE
This document serves as Proof of Funds confirming the financial capacity of the Buyer to complete the transaction described below. The Buyer warrants that all financial information provided herein is accurate and verifiable.

${buyerBlock(buyer, trade)}

TRANSACTION DETAILS
${tradeBlock(trade, buyer, seller, product)}

FINANCIAL CONFIRMATION
The Buyer hereby confirms:
1. Availability of funds or equivalent.
2. The funds are clean, clear, and of non-criminal origin.
3. The funds are held in a reputable banking institution.
4. The Buyer is authorised to utilise said funds for this transaction.

BANKING DETAILS
Bank Name: ${v(buyer?.bank)}
Account Holder: ${v(buyer?.name, trade?.buyerName)}
Account Number: _______________
SWIFT/BIC: ${v(buyer?.swift)}
Account Currency: _______________

BANK OFFICER CONFIRMATION
Bank Officer Name: _______________
Bank Officer Title: _______________
Bank Officer Email: _______________
Bank Officer Tel: _______________

SUPPORTING DOCUMENTS
☐ Bank Statement (redacted as appropriate)
☐ Bank Comfort Letter (BCL)
☐ Treasury Confirmation
☐ LC Capability Letter
${specialNoteBlock(product)}

AUTHORISED SIGNATORY
Name: _______________
Title: _______________
Company: ${partyName(buyer, trade?.buyerName)}
Date: ${today()}
Signature: _______________`,

  BCL: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => `BANK COMFORT LETTER (BCL)
${"=".repeat(40)}

Date: ${today()}
Reference: ${trade?.tradeRef || "_______________"}

TO WHOM IT MAY CONCERN

RE: Bank Comfort Letter for ${v(buyer?.name, trade?.buyerName)}

Dear Sir/Madam,

We, the undersigned banking institution, hereby confirm the following with respect to our client named below:

CLIENT DETAILS
Client Name: ${v(buyer?.name, trade?.buyerName)}
Client Address: ${v(buyer?.address)}
Account Number: _______________
Account Type: _______________
Relationship Since: _______________

TRANSACTION REFERENCE
${tradeBlock(trade, buyer, seller, product)}

CONFIRMATION
We hereby confirm that:
1. The above-named client maintains an account in good standing with our institution.
2. The client has the financial capacity to engage in transactions of the nature and value described above.
3. Our institution is prepared to issue the necessary financial instruments, including but not limited to Documentary Letters of Credit, upon the client's instruction.
4. To the best of our knowledge, the client's funds are of legitimate origin.

DISCLAIMER
This letter is issued for reference purposes only and does not constitute a guarantee or commitment by this institution. The issuance of any financial instrument remains subject to our standard terms, conditions, and due diligence procedures.

BANK DETAILS
Bank Name: _______________
Branch: _______________
SWIFT/BIC: _______________
Address: _______________

AUTHORISED BANK OFFICER
Name: _______________
Title: _______________
Email: _______________
Tel: _______________
Date: ${today()}

Signature & Bank Seal: _______________`,

  CRC: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const cur = product?.currency || trade?.currency || "USD";
    const commodity = v(product?.commodity, trade?.commodity);
    const origin = v(product?.origin, trade?.origin);
    const quantity = v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined);
    const contractNo = v(trade?.tradeRef);
    const spaNo = v(product?.dealRecapNumber ?? undefined);
    const bName = v(buyer?.name, trade?.buyerName);
    const bAddr = v(buyer?.address);
    const sName = v(seller?.name, trade?.sellerName);
    const sBank = v(seller?.bank);
    const sSwift = v(seller?.swift);
    const sAddr = v(seller?.address);
    const inspection = v(product?.analysisAgency);
    const govLaw = product?.governingLaw?.trim();
    return `CONDITIONAL RELEASE CERTIFICATE
${"=".repeat(60)}
(Issued by Terminal Owner / Tank Owner)

Certificate No.: _______________
Date of Issue: ${today()}
Reference Contract No.: ${contractNo}
SPA No.: ${spaNo}
Commercial Invoice No.: _______________

BUYER (TO)
Company Name: ${bName}
Address: ${bAddr}
Country: _______________

SELLER / PRODUCT OWNER (CC)
Company Name: ${sName}
Financing Bank (if applicable): _______________
Independent Inspection Company: ${inspection}

SUBJECT
Conditional Release of Product Held in Storage

Dear Sir/Madam,

Pursuant to the written instructions received from the Product Owner/Seller and in accordance with the above-referenced Sale and Purchase Agreement ("SPA"), we hereby issue this Conditional Release of Product Certificate confirming that the below-described cargo is presently held under our custody and has been allocated exclusively for delivery to the Buyer identified herein.

1. PRODUCT INFORMATION
Product: ${commodity}
Origin: ${origin}
Quantity: ${quantity}
Unit (MT / BBL / CBM): _______________
Tank Number(s): _______________
Terminal: _______________
Storage Location: _______________

2. COMMERCIAL DETAILS
Contract Number: ${contractNo}
SPA Number: ${spaNo}
Commercial Invoice Number: _______________
Unit Price: ${cur} _______________ per MT
Quantity: ${quantity}
Total Contract Value: ${cur} _______________
Provisional Payment Percentage: _______ %
Provisional Payment Value: ${cur} _______________
Balance Payment: ${cur} _______________
Final Contract Value: ${cur} _______________

The Terminal Owner acknowledges that all payments relating to the above-mentioned transaction shall be remitted exclusively to the above-designated bank account of the Seller unless otherwise instructed by the Seller in writing and accepted by the Buyer. The Terminal Owner shall recognize payment as duly effected only upon written confirmation from the Seller and/or the Seller's designated receiving bank.

2A. SELLER'S BANKING DETAILS
Payment Reference: Contract No. / SPA No. / Commercial Invoice No.
Currency: ${cur}
Correspondent Bank (if applicable): _______________
IBAN / Account Number: _______________
SWIFT/BIC Code: ${sSwift}
Bank Address: _______________
Seller's Bank: ${sBank}
Beneficiary Address: ${sAddr}
Beneficiary Name: ${sName}

3. CONFIRMATION OF CUSTODY
We hereby certify that the above-mentioned cargo is physically stored within our terminal facilities and is presently held under our custody on behalf of the Seller/Product Owner.
The cargo has been specifically allocated against the above-mentioned Contract and SPA for delivery to the Buyer.

4. CONDITIONAL RESERVATION OF CARGO
Upon confirmation by the Seller and/or its designated receiving bank that the Provisional Payment in the amount of ${cur} _______________ has been duly received in accordance with the Commercial Invoice and SPA, the following shall apply:
- The above-mentioned cargo shall be irrevocably reserved and earmarked exclusively for the Buyer.
- The cargo shall not be sold, transferred, pledged, assigned, or otherwise encumbered in favor of any third party without the Buyer's prior written consent, except where required by law or a court order.
- The transaction shall become binding upon the Seller and Buyer in accordance with the terms of the SPA, subject to the fulfilment of the remaining contractual obligations.

5. TRANSFER OF OWNERSHIP
Upon confirmation by the Seller and/or its designated receiving bank of receipt of the Final Balance Payment in accordance with the SPA and Commercial Invoice, and upon written release instructions from the Seller, the Terminal Owner shall record the Buyer as the lawful cargo owner in the terminal's custody records.

6. REPRESENTATIONS
The Terminal Owner confirms that:
- the Terminal Owner has no unpaid storage or handling charges giving rise to any lien over the cargo as of the date of this certificate;
- to the best of the Terminal Owner's knowledge and based on its records, no notice of any third-party claim, attachment, seizure, or encumbrance affecting the cargo has been received.

7. INSPECTION RIGHTS
The Buyer shall have the right to appoint an independent inspection company to conduct:
☐ Dip Test
☐ Tank Gauging
☐ Quantity Verification
☐ Sampling
☐ Quality Inspection
subject to terminal operating procedures and prior appointment.

8. DELIVERY
Upon completion of the Final Payment and receipt of the Seller's written delivery instructions (or as otherwise provided in the SPA), the Terminal Owner shall release the cargo in accordance with the Buyer's loading or transfer instructions.

9. VALIDITY
This Certificate shall remain valid until:
- completion of the transaction;
- cancellation of the SPA by mutual agreement;
- written withdrawal jointly authorized by the Seller and Buyer; or
- replacement by a subsequent certificate.

9A. IRREVOCABLE CARGO ALLOCATION CLAUSE
Upon confirmation of receipt of the Provisional Payment by the Seller's designated bank, the cargo identified in this Certificate shall be irrevocably allocated to the Buyer and shall not be substituted, exchanged, blended or reallocated without the Buyer's prior written consent.

9B. NON-DIVERSION AND NON-ENCUMBRANCE UNDERTAKING
The Terminal Owner undertakes that while this Certificate remains valid, the cargo shall not be released, diverted, transferred, pledged, hypothecated or otherwise encumbered in favour of any third party except pursuant to the SPA, the Buyer's written instructions after transfer of ownership, or a final order of a competent court.

9C. RECOGNITION OF BUYER'S RIGHTS
Where the Buyer has financed the purchase through a bank or financial institution, the Terminal Owner shall recognize written instructions issued by such financing bank or its duly appointed security agent after ownership has transferred to the Buyer, subject to evidence of such financing arrangement.

9D. ASSIGNMENT OF TITLE
Following confirmation of the Final Payment and transfer of ownership, the Buyer shall be entitled to assign, pledge, transfer or otherwise deal with its ownership rights in the cargo, and the Terminal Owner shall recognize such assignment upon receipt of appropriate documentary evidence.

9E. TERMINAL REGISTER AMENDMENT
Following transfer of ownership, the Terminal Owner shall amend its custody and register records to reflect the Buyer as the lawful owner of the cargo and shall issue confirmation of such amendment upon the Buyer's request.

9F. BANK PAYMENT CONFIRMATION
The Seller's designated bank shall promptly notify the Seller and, where applicable, the Terminal Owner of receipt of the Provisional Payment and Final Payment. The Terminal Owner may rely upon such written confirmation for the purposes of cargo allocation and ownership registration.

9G. GOVERNING LAW AND DISPUTE RESOLUTION
This Certificate shall be governed by the law specified in the Sale and Purchase Agreement${govLaw ? ` (${govLaw})` : ""}. Any dispute relating solely to this Certificate shall be resolved in accordance with the dispute resolution mechanism contained in the SPA. Where the SPA is subject to ICC Arbitration, this Certificate shall be interpreted consistently with those provisions.

10. GOVERNING STATEMENT
This Certificate is issued solely in the Terminal Owner's capacity as custodian of the cargo. It confirms the storage status, allocation, and intended release procedure based on the Seller's written instructions and the SPA. Except as expressly stated herein, it does not amend the contractual rights and obligations of the Buyer and Seller under the SPA.

AUTHORIZED BY
For and on behalf of the Terminal Owner / Tank Owner
Company Name: _______________
Authorized Signatory: _______________
Designation: _______________
Date: ${today()}
Signature: _______________
Company Seal: _______________`;
  },

  HC: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const commodity = v(product?.commodity, trade?.commodity);
    const origin = v(product?.origin, trade?.origin);
    const quantity = v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined);
    const grade = v(product?.qualitySpecs);
    const poName = v(seller?.name, trade?.sellerName);
    const poAddr = v(seller?.address);
    const govLaw = product?.governingLaw?.trim();
    return `HOLDING CERTIFICATE
${"=".repeat(60)}
(Issued by Terminal Owner / Tank Owner)

Certificate No.: _______________
Date of Issue: ${today()}

HOLDING CERTIFICATE OF PRODUCT IN STORAGE

To Whom It May Concern,

This is to certify that _______________ ("Terminal Owner/Tank Owner"), the lawful operator and custodian of the storage facilities described below, hereby confirms that the petroleum product identified in this certificate is currently held in our storage facility on behalf of the Product Owner identified herein.

1. TERMINAL DETAILS
Terminal Owner / Tank Owner: _______________
Terminal Name: _______________
Terminal Address: _______________
Country: _______________

2. PRODUCT OWNER
Company Name: ${poName}
Registered Address: ${poAddr}

3. PRODUCT DETAILS
Product: ${commodity}
Grade / Specification: ${grade}
Origin: ${origin}
Quantity: ${quantity}
Unit (Metric Tons (MT) / Barrels / Cubic Meters): _______________
Tank Number(s): _______________
Storage Location: _______________

4. CONFIRMATION OF HOLDING
We hereby certify that the above-mentioned product is presently stored within our terminal facilities and is being held in custody on behalf of the above-named Product Owner.
The quantity stated herein is based upon our operational storage records as of the date of this certificate.

5. CONFIRMATION REGARDING LIENS AND ENCUMBRANCES
Based upon our storage records and to the best of our knowledge:
- the Terminal Owner has no possessory lien, storage lien, security interest, or retention right over the above-mentioned product arising from unpaid terminal charges or other obligations;
- the product is not subject to any claim, attachment, seizure, or encumbrance recorded in our terminal records;
- the Terminal Owner has not received notice of any third-party claim adversely affecting custody of the above-mentioned product.
Accordingly, the Terminal Owner confirms that the product is being held solely on behalf of the Product Owner identified above.

6. AVAILABILITY
The above-mentioned product is available in storage and shall remain under the custody of the Terminal Owner pending lawful written instructions from the Product Owner or any person duly authorized by the Product Owner, subject to:
- applicable laws and regulations;
- terminal operating procedures;
- payment of future storage and handling charges, if any;
- compliance with contractual obligations.

7. INSPECTION
The product may be made available for inspection, dip test, sampling and quantity verification by an independent inspection company upon receipt of proper written authorization from the Product Owner and subject to terminal scheduling and safety procedures.

8. VALIDITY
This certificate is issued solely for evidentiary purposes regarding the custody and storage status of the above-mentioned product as of the date of issue.
Unless withdrawn or superseded in writing, this certificate shall remain valid for _____ (__) calendar days from the date of issuance.

8A. REPRESENTATIONS AND WARRANTIES
The Terminal Owner represents that it is the lawful operator/custodian of the storage facility, has authority to issue this Certificate, and that the information contained herein is true and correct to the best of its knowledge as of the date of issue.

8B. NO LIEN AND NON-ENCUMBRANCE UNDERTAKING
The Terminal Owner confirms that neither it nor, to the best of its knowledge, any third party has any registered lien, pledge, security interest or encumbrance over the cargo recorded in its custody records and undertakes not to create or permit any such interest while this Certificate remains valid.

8C. IRREVOCABLE CUSTODY UNDERTAKING
The Terminal Owner shall continue to hold the cargo exclusively for the account of the Product Owner, or its lawful transferee, and shall not release the cargo except upon valid written instructions from the entitled party or pursuant to a final order of a competent authority.

8D. RECOGNITION OF FINANCING BANK
Where the Product Owner has assigned rights in the cargo to a financing bank or security agent, and satisfactory evidence of such assignment is provided, the Terminal Owner shall recognize such secured party for custody and release purposes.

8E. INSPECTION AND VERIFICATION
The Terminal Owner shall provide reasonable access for independent inspectors to perform dip testing, gauging, sampling and quantity verification in accordance with terminal procedures.

8F. SANCTIONS AND COMPLIANCE
The Terminal Owner confirms that its performance under this Certificate is subject to applicable sanctions laws, anti-money laundering regulations and mandatory legal requirements.

8G. GOVERNING LAW AND DISPUTE RESOLUTION
This Certificate shall be governed by the governing law specified in the applicable storage agreement or, where incorporated into a Sale and Purchase Agreement, by the governing law of that agreement${govLaw ? ` (${govLaw})` : ""}. Disputes shall be resolved in accordance with the dispute resolution provisions of the relevant agreement, including ICC arbitration where applicable.

9. DISCLAIMER
This Certificate may be relied upon by the Product Owner, Buyer, financing banks, confirming banks and independent inspection companies solely for the purpose of verifying custody and storage status, subject to its terms.
This Holding Certificate:
- does not constitute evidence of ownership or transfer of title;
- does not amend or replace any storage agreement or terminal contract;
- does not constitute a guarantee of payment, financing, or delivery;
- shall not be construed as creating any obligation on the part of the Terminal Owner beyond its obligations as custodian under applicable agreements and law.

AUTHORIZED SIGNATORY
For and on behalf of Terminal Owner / Tank Owner
Company Name: _______________
Authorized Representative: _______________
Designation: _______________
Date: ${today()}
Signature: _______________
Company Seal: _______________`;
  },

  DTA: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const commodity = v(product?.commodity, trade?.commodity);
    const origin = v(product?.origin, trade?.origin);
    const quantity = v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined);
    const buyerName = v(buyer?.name, trade?.buyerName);
    const buyerAddr = v(buyer?.address);
    const sellerName = v(seller?.name, trade?.sellerName);
    return `DIP TEST AUTHORIZATION CERTIFICATE
${"=".repeat(60)}
(On Terminal / Tank Owner / Cargo Owner letterhead)

Reference No.: _______________
Date: ${today()}

TO
Buyer
Company Name: ${buyerName}
Authorized Representative: _______________
Address: ${buyerAddr}
Email: _______________
Phone: _______________

CC
Terminal Owner / Terminal Operator
Company: _______________
Email: _______________

Seller
Company: ${sellerName}
Email: _______________

Independent Inspection Company
Company: _______________
Email: _______________

SUBJECT
Authorization for Dip Test, Quantity Verification, Sampling and Inspection of ${commodity}

Dear Sir/Madam,

We, _______________, being the lawful Tank Owner/Custodian of the storage tank(s) described below, hereby confirm that the Seller has advised us that the below-mentioned product is allocated for the proposed sale transaction.

Accordingly, we hereby authorize the Buyer and/or its duly appointed representatives to conduct a Dip Test, witness tank gauging, collect representative samples (where permitted), and observe quantity verification of the cargo under the supervision of the Terminal Operator and the Independent Inspection Company.

PRODUCT DETAILS
Product: ${commodity}
Origin: ${origin}
Quantity: ${quantity}
Tank Number(s): _______________
Storage Terminal: _______________
Terminal Location: _______________

SCOPE OF AUTHORIZATION
The Buyer and/or its nominated representatives are authorized to:
- Conduct dip measurement of the above storage tank(s).
- Witness tank gauging.
- Observe quantity verification.
- Witness sampling procedures.
- Receive sealed samples through the appointed Independent Inspection Company (subject to terminal regulations).
- Review tank calibration tables and relevant operational records necessary for quantity verification.
- Attend the inspection on the agreed inspection date and time.

INSPECTION
The inspection shall be conducted jointly by:
- Tank Owner Representative
- Terminal Representative
- Buyer's Representative
- Seller's Representative (optional)
- Independent Inspection Company

CONDITIONS
- This authorization is issued solely for inspection purposes and does not constitute transfer of ownership of the cargo.
- Entry into the terminal shall remain subject to: terminal safety regulations; security clearance; valid identification; PPE requirements; applicable port and terminal procedures.
- All sampling and quantity verification shall be performed only by or under the supervision of the appointed Independent Inspection Company.
- Any laboratory testing shall be conducted only on officially sealed samples.
- The inspection findings shall be documented in the official inspection report issued by the Independent Inspection Company.
- This authorization shall remain valid until _______________ unless revoked in writing.

CARGO STATUS
The Tank Owner confirms that the above cargo is presently stored in the identified storage tank(s) and is available for inspection in accordance with terminal operational procedures.
No representation is made by the Tank Owner regarding the commercial sale contract between Buyer and Seller.

CONTACT FOR SCHEDULING
Name: _______________
Position: _______________
Telephone: _______________
Email: _______________

AUTHORIZATION
For and on behalf of Tank Owner
Company Name: _______________
Authorized Signatory: _______________
Position: _______________
Date: ${today()}
Signature: _______________
Company Seal: _______________`;
  },

  NCNDA: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const partyA = v(seller?.name);
    const partyAAddress = v(seller?.address);
    const partyAContact = v(seller?.contact);
    const partyB = v(buyer?.name);
    const partyBAddress = v(buyer?.address);
    const partyBContact = v(buyer?.contact);
    const partyACoBlock = coPartyBlock("Co-Seller", seller);
    const partyBCoBlock = coPartyBlock("Co-Buyer", buyer);
    const effectiveDate = product?.validity?.trim() || today();
    const governingLaw = product?.governingLaw?.trim() || "_______________";
    const jurisdiction = product?.recapValidity?.trim() || "_______________";
    const proposedTransaction = product?.commodity?.trim() || "Sale and Purchase of various metals, minerals and energy products as may be mutually agreed between the Parties in writing from time to time during the Term of this Agreement";
    return `MUTUAL NON-CIRCUMVENTION NON-DISCLOSURE AGREEMENT (NCNDA)
${"=".repeat(70)}

This Mutual Non-Circumvention Non-Disclosure Agreement ("Agreement") is made on ${effectiveDate} ("Effective Date") by and between,

1. ${partyA}, a company incorporated under the laws of ${governingLaw}, having its registered office at ${partyAAddress}, represented by its authorised signatory, ${partyAContact} (hereinafter referred to as "Party A", which expression, unless it be repugnant to the context or meaning thereof, shall be deemed to mean and include its successors and assigns) of the one part;${partyACoBlock ? `${partyACoBlock}\n` : ""}

AND

2. ${partyB}, a company incorporated and registered under applicable laws, having its registered office at ${partyBAddress}, represented by its authorised signatory, ${partyBContact} (hereinafter referred to as "Party B", which expression shall, unless it be repugnant to the context or meaning thereof, mean and include its successors and permitted assigns) of the other part.${partyBCoBlock ? `${partyBCoBlock}\n` : ""}

"Party A" and "Party B" are collectively referred to as "Parties" and individually as "Party".

WHEREAS:

The Parties wish to explore discussions during which either Party may disclose its Confidential Information to the other for the Proposed Transaction (as defined below).

NOW, THEREFORE, in consideration of the foregoing and for other good and valuable consideration, the receipt and sufficiency of which is hereby acknowledged, the Parties hereto agree as follows:


${"═".repeat(70)}
1. DEFINITIONS
${"═".repeat(70)}

1.1 "Confidential Information" shall mean and include, without limitation:

   (a) the existence and terms of this Agreement;
   (b) the fact that the parties are or have been in discussions for the Proposed Transaction under this Agreement and any other fact with respect to such Proposed Transaction;
   (c) current, future, and proposed products and services of the Disclosing Party;
   (d) technical and non-technical information (regardless of whether such information is in tangible or intangible form) including but not limited to data, drawings, designs, ideas, concepts, formulae, methods, techniques, processes, financials, financial business plans, pricing, unpublished price sensitive information, business methods or trade secrets and compilations, reports, forecasts, studies, samples, statistics, summaries, interpretations and other materials (including any notes, records, analyses, correspondences or any derivatives of the foregoing), prepared by or for Recipient / Recipient's Representatives that contain, are based on, or otherwise reflect or are derived from, in whole or in part, any Confidential Information;
   (e) all intellectual property related information, inventions, improvements, modifications or discoveries, whether patentable or not, patent and patent applications, copyrights, trade secrets; and
   (f) any copies, notes, compilations or other documents, including any textual, numerical, graphical drawing or image fixed on paper, any electronic medium, any like media or any storage device containing such media, containing or embodying Confidential Information.

1.2 "Disclosing Party" means the person which discloses directly or indirectly Confidential Information in a particular instance or on whose behalf Confidential Information is furnished.

1.3 "Proposed Transaction" shall mean and include ${proposedTransaction}.

1.4 "Representatives" means with respect to a Party, any affiliates, or directors, officers, employees, representatives, consultants, advisors or agents of a Party or its affiliates.

1.5 "Recipient" means the Party receiving Confidential Information, whether directly or indirectly from a Disclosing Party.


${"═".repeat(70)}
2. TREATMENT OF CONFIDENTIAL INFORMATION
${"═".repeat(70)}

The Recipient agrees to do the following in respect of the Confidential Information disclosed by the Disclosing Party:

   (a) keep the Confidential Information strictly confidential and not disclose, disseminate or divulge to anyone, except where applicable in accordance with the terms of this Agreement;
   (b) except in connection with the Proposed Transaction, agrees not to use or exploit any of the Confidential Information, in whole or in part, in any way for any other purpose or for commercial benefit;
   (c) not cause or permit the use of Confidential Information, directly or indirectly, for obtaining intellectual property rights;
   (d) promptly notify the Disclosing Party in writing upon learning of any unauthorised disclosure or use of the Confidential Information and take all steps reasonably requested by the Disclosing Party to remedy any such unauthorised disclosure or use.


${"═".repeat(70)}
3. NON-CIRCUMVENTION
${"═".repeat(70)}

Each Party agrees not to circumvent, avoid, bypass, or obviate the other Party, directly or indirectly, in connection with the Proposed Transaction or any transaction arising from or related to the discussions between the Parties. Neither Party shall contact, deal with, or otherwise be involved with any business contacts, clients, customers, associates, or other entities introduced by the other Party without the prior written consent of the introducing Party.


${"═".repeat(70)}
4. AUTHORISED USERS
${"═".repeat(70)}

The Recipient will use the Disclosing Party's Confidential Information solely in connection with the Proposed Transaction. The Recipient will not disclose the Disclosing Party's Confidential Information to third parties, except to those Representatives of the Recipient who are required to have the information in order to participate in the Proposed Transaction and provided that such Representatives' confidentiality obligations are similar to those of the Recipient's under this Agreement.


${"═".repeat(70)}
5. EXCEPTIONS
${"═".repeat(70)}

The restrictions in Clause 2 shall not apply to Confidential Information which:

   (a) is lawfully known to the Recipient free of any restriction or obligation of confidence; or
   (b) is independently developed without reference to, benefit or use of any part of the Disclosing Party's Confidential Information; or
   (c) is lawfully disclosed to the Recipient, without restriction, after acceptance of this Agreement, by an independent third party who has a legal right to make such disclosure and is free from any obligation of confidence or non-use; or
   (d) is publicly known or generally in the public domain prior to the disclosure; or
   (e) is required to be disclosed by the Recipient pursuant to a legal, judicial, or administrative procedure, or is otherwise required by law; provided that the Recipient agrees to give the Disclosing Party reasonable advance notice so that the Disclosing Party may contest the disclosure or seek a protective order.


${"═".repeat(70)}
6. OWNERSHIP OF CONFIDENTIAL INFORMATION
${"═".repeat(70)}

All Confidential Information will remain the exclusive property of the Disclosing Party. Any disclosure of Confidential Information will not constitute an express or implied grant to the Recipient of any rights to or under the Disclosing Party's intellectual property rights.


${"═".repeat(70)}
7. RETURN OF CONFIDENTIAL INFORMATION
${"═".repeat(70)}

The Recipient will return or destroy all Confidential Information (in any form and including, without limitation, all summaries, correspondence, copies and excerpts of Confidential Information) promptly following the Disclosing Party's request. At the Disclosing Party's option, the Recipient will provide written certification of its compliance with this Clause. The Recipient may retain one (1) copy of the Confidential Information with its legal counsel for archival purposes.


${"═".repeat(70)}
8. TERM AND SURVIVAL OF OBLIGATIONS
${"═".repeat(70)}

   (a) This Agreement shall commence upon the Effective Date and will continue for a period of 1 (one) year from the Effective Date, unless terminated earlier by either Party by giving thirty (30) days prior written notice to the other Party.
   (b) The confidentiality and non-circumvention obligations of each Party set forth herein shall continue to apply for a period of 1 (one) year post the expiry or termination of this Agreement.


${"═".repeat(70)}
9. DATA PROTECTION
${"═".repeat(70)}

In so far as the Recipient receives Confidential Information from the Disclosing Party that includes any data relating to an identified or identifiable individual ("Personal Data"), the Recipient shall:

   (a) process the Personal Data only on behalf of the Disclosing Party and in accordance with instructions contained in this Agreement or received from the Disclosing Party from time to time and for the business purpose stated in this Agreement;
   (b) provide the Disclosing Party with full co-operation and assistance in relation to any complaint or request made in respect of any Personal Data;
   (c) not transfer the Personal Data of the concerned individual as disclosed by the Disclosing Party to any third party, without the prior written consent of the Disclosing Party.


${"═".repeat(70)}
10. ANTI-BRIBERY AND ANTI-CORRUPTION
${"═".repeat(70)}

In connection with this Agreement, the Parties warrant that neither they nor their directors, officers, shareholders, employees, agents, consultants or representatives have given, offered, promised or authorised and shall not give, offer, promise or authorise anything of value, directly or indirectly, to a government official or any other person to influence or reward official action. Each Party shall comply with all applicable anti-corruption and anti-bribery laws including the U.S. Foreign Corrupt Practices Act of 1977 (FCPA), the United Kingdom Bribery Act 2010, and any other applicable anti-bribery law or regulation.


${"═".repeat(70)}
11. CODE OF CONDUCT
${"═".repeat(70)}

Party B acknowledges that the business activities of Party A are self-regulated by the Bullfrog Code of Conduct ("Code") and agrees that it and its employees shall at all times abide by the Code. Party B further undertakes that it will promptly report any violation of the Code to legal@bullex.tech. Both Parties undertake to maintain confidentiality of all communication received in this regard.


${"═".repeat(70)}
12. GOVERNING LAW AND JURISDICTION
${"═".repeat(70)}

This Agreement will be governed, construed and enforced in accordance with the laws of ${governingLaw}. The Parties shall submit to the exclusive jurisdiction of the courts of ${jurisdiction}.


${"═".repeat(70)}
13. MISCELLANEOUS
${"═".repeat(70)}

   (a) The Parties warrant that the signatory signing this Agreement on their respective behalf is duly authorised to do so and irrevocably binds the respective Parties to this Agreement.
   (b) No amendment, variation, or modification to this Agreement will be effective unless it is in writing and signed by both Parties.
   (c) If any provision in this Agreement is found to be invalid or unenforceable in any respect in any jurisdiction, the validity and enforceability of the remaining provisions shall not be affected.
   (d) This Agreement constitutes the entire agreement between the Parties concerning the subject matter of this Agreement and shall supersede any and all prior discussions, negotiations, agreements and understandings between the Parties regarding such subject-matter.
   (e) Parties may not assign or delegate its rights, benefits, interests and obligations under this Agreement wholly or in part without the prior written consent of the other Party.
   (f) Trade Sanction Provisions: Both Parties represent and warrant that they comply with all applicable Sanctions laws. Neither Party nor any person directly or indirectly controlling or dealing with either Party (i) is a Sanctioned Person, (ii) is controlled by or is acting on behalf of a Sanctioned Person, or (iii) will fund any repayment or payment of obligations with proceeds derived from any transaction that would be prohibited by Sanctions.
   (g) This Agreement may be executed in any number of counterparts (including by facsimile or electronic mail in PDF form), all of which will be one and the same agreement.


IN WITNESS WHEREOF, the Parties hereto execute this Agreement by their authorised representatives.

${"─".repeat(70)}
For and on behalf of Party A:              For and on behalf of Party B:

${partyA.padEnd(43)}${partyB}

Name: ___________________________         Name: ___________________________

Title: __________________________         Title: __________________________

Date:  ${today().padEnd(37)}Date:  ${today()}

Signature: ______________________         Signature: ______________________

(who by their signature hereto warrants    (who by their signature hereto warrants
their authority)                           their authority)
${"─".repeat(70)}
`;
  },

  BL: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const shipper = v(seller?.name, trade?.sellerName);
    const consignee = v(buyer?.name, trade?.buyerName);
    const notifyParty = v(product?.notifyParty, buyer?.address);
    const vessel = v(product?.vesselName);
    const pol = v(product?.loadingPort, trade?.origin);
    const pod = v(product?.dischargePort, trade?.destination);
    const commodityName = v(product?.commodity, trade?.commodity);
    const qtyMT = v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined);
    const countryOrigin = v(product?.origin, trade?.origin);
    const packing = v(product?.packing);
    const cpDate = v(product?.charterPartyDate);
    const freightAdv = v(product?.freightAdvance);
    const ldDays = v(product?.loadingTimeDays, "___");
    const ldHours = v(product?.loadingTimeHours, "___");
    const placeIssue = v(product?.placeOfIssue);
    const dateIssue = v(product?.dateOfIssue, today());
    const company = v(product?.companyOnBehalf);
    const master = v(product?.masterOfVessel, vessel);
    const agents = v(product?.agentsName);

    return `BILL OF LADING
${"=".repeat(60)}
B/L No. 01
TO BE USED WITH CHARTER-PARTIES
CODE NAME: "CONGENBILL" EDITION 1994
ADOPTED BY THE BALTIC AND INTERNATIONAL MARITIME COUNCIL (BIMCO)
${"─".repeat(60)}

SHIPPER
${shipper}

CONSIGNEE
${consignee}

NOTIFY ADDRESS
${notifyParty}

VESSEL                                    PORT OF LOADING
${vessel.padEnd(42)}${pol}

PORT OF DISCHARGE
${pod}

${"─".repeat(60)}
DESCRIPTION OF GOODS
${"─".repeat(60)}

NAME OF COMMODITY: ${commodityName}
${qtyMT} METRIC TONS
COUNTRY OF ORIGIN: ${countryOrigin}
PACKING: ${packing}

'CLEAN ON BOARD'
'FREIGHT PAYABLE AS PER CHARTER PARTY'

(of which NIL on deck at Shipper's risk; the Carrier not being responsible
for loss or damage howsoever arising)

${"─".repeat(60)}

FREIGHT AS PER CHARTER PARTY DATED ${cpDate}

SHIPPED at the Port of Loading in apparent good order and condition on board
the Vessel for carriage to the Port of Discharge or so near thereto as she
may safely get the goods specified above. Weight, measure, quality, quantity,
condition, contents and value unknown.

IN WITNESS whereof the Master or Agent of the said Vessel has signed the
number of Bills of Lading indicated below all this tenor and date, any one of
which being accomplished the others shall be void.

FOR CONDITIONS OF CARRIAGE SEE OVERLEAF

${"─".repeat(60)}
FREIGHT ADVANCE
Received on account of freight: ${freightAdv}

TIME USED FOR LOADING
${ldDays} days    ${ldHours} hours

NUMBER OF ORIGINAL B/Ls: THREE (3)

${"─".repeat(60)}
PLACE AND DATE OF ISSUE
${placeIssue} DATED ${dateIssue}

FOR AND ON BEHALF OF ${company}
MASTER OF ${master}

FOR ${agents}
AS AGENTS ONLY

${"=".repeat(60)}
CONDITIONS OF CARRIAGE
${"=".repeat(60)}

1. All terms and conditions, liberties and exceptions of the Charter Party
   dated as overleaf, including the Law and Arbitration Clauses, are herewith
   incorporated.

2. General Paramount Clause.

   (a) The Hague Rules contained in the International Convention for the
   Unification of certain rules relating to Bills of Lading, dated Brussels
   the 25th August 1924 as enacted in the country of shipment, shall apply
   to this Bill of Lading. When no such enactment is in force in the country
   of shipment, the corresponding legislation of the country of destination
   shall apply, but in respect of shipments to which no such enactments are
   compulsorily applicable, the terms of the said Convention shall apply.

   (b) Trades where Hague-Visby Rules apply. In trades where the
   International Brussels Convention 1924 as amended by the Protocol signed
   at Brussels on February 23rd 1968 — the Hague Visby Rules — apply
   compulsorily, the provisions of the respective legislation shall apply to
   this Bill of Lading.

   (c) The Carrier shall in no case be responsible for loss or damage to the
   cargo, howsoever arising prior to loading into and after discharge from
   the vessel or while the cargo is in the charge of another Carrier, or in
   respect of deck cargo or live animals.

3. General Average.
   General Average shall be adjusted, stated and settled according to
   York-Antwerp Rules 1994, or any subsequent modification thereof, in London
   unless another place is agreed in the Charter Party. Cargo's contribution
   to General Average shall be paid to the Carrier even when such average is
   the result of a fault, neglect or error of the Master, Pilot or Crew. The
   Charterers, Shippers and Consignees expressly renounce the Belgian
   Commercial Code Part II, Art. 148.

4. New Jason Clause.
   In the event of accident, danger, damage or disaster before or after the
   commencement of the voyage, resulting from any cause whatsoever, whether
   due to negligence or not, for which, or for the consequence of which, the
   Carrier is not responsible, by statute, contract or otherwise, the cargo,
   Shippers, consignees or the owners of the cargo shall contribute with the
   Carrier in General Average to the payment of any sacrifices, losses or
   expenses of a General Average nature that may be made or incurred and
   shall pay salvage and special charges incurred in respect of the cargo.
   If a salving vessel is owned or operated by the Carrier, salvage shall be
   paid for as fully as if the said salving vessel or vessels belonged to
   strangers. Such deposit as the Carrier, or his agents, may deem sufficient
   to cover the estimated contribution of the goods and any salvage and
   special charges thereon shall, if required, be made by the cargo Shippers,
   Consignees or owners of the goods to the Carrier before delivery.

5. Both-to-Blame Collision Clause.
   If the Vessel comes into collision with another vessel as a result of the
   negligence of the other vessel and any act, neglect or default of the
   Master, Mariner, Pilot or the servants of the Carrier in the navigation
   or in the management of the Vessel, the owners of the cargo carried
   hereunder will indemnify the Carrier against all loss or liability to
   the other or non-carrying vessel or her owners in so far as such loss or
   liability represents loss of, or damage to, or any claim whatsoever of
   the owners of said cargo, paid or payable by the other or non-carrying
   ship or her Owners to the owners of said cargo and set-off, recouped or
   recovered by the other or non-carrying vessel or her Owners as part of
   their claim against the carrying Vessel or the Carrier.

   The foregoing provisions shall also apply where the owners, operators or
   those in charge of any vessel or vessels or objects other than, or in
   addition to, the colliding vessels, or objects are at fault in respect of
   a collision or contact.
`;
  },

  COA: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const commodity = v(product?.commodity, trade?.commodity);
    const quantity = v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined);
    const origin = v(product?.origin, trade?.origin);
    const vessel = v(product?.vesselName);
    const loadingPort = v(product?.loadingPort, trade?.origin);
    const dischargePort = v(product?.dischargePort, trade?.destination);
    const packing = v(product?.packing);
    const blDate = v(product?.charterPartyDate);
    const certNo = product?.loiIssueNumber || `COA-${new Date().getFullYear()}-001`;
    const inspPeriod = product?.laycan || "";
    const [inspFrom, inspTo] = inspPeriod.includes(" to ") ? inspPeriod.split(" to ") : [inspPeriod, inspPeriod];
    const loadPeriod = product?.validity || "";
    const [loadStart, loadEnd] = loadPeriod.includes(" to ") ? loadPeriod.split(" to ") : [loadPeriod, loadPeriod];
    const chemSpecs = product?.qualitySpecs || "_______________    :    _______________   PCT";
    const moisture = product?.specialNote || "_______________";
    const physSizes = product?.annexSpecs || "ABOVE ___MM  :    _______________   PCT\nBELOW ___MICRON  :    _______________   PCT";
    const agency = v(product?.analysisAgency, "_______________");
    const dateStr = today();
    return `CERTIFICATE OF QUALITY
'TO WHOM IT MAY CONCERN'
PAGE 1 OF 2

REF:  Certificate No. ${certNo}
DATE:  ${dateStr}

DESCRIPTION OF GOODS

NAME OF COMMODITY                 :     ${commodity}

QUANTITY                          :     ${quantity} METRIC TONS

COUNTRY OF ORIGIN                 :     ${origin}

PACKING                           :     ${packing}

NAME OF THE CARRYING VESSEL       :     ${vessel}

PORT OF LOADING                   :     ${loadingPort}

PORT OF DISCHARGE                 :     ${dischargePort}

B/L NO. & DATE                    :     01 & DATED ${blDate}

${"=".repeat(73)}

In accordance with the instructions received from the shipper, we attended at, ${loadingPort} during the period ${inspFrom} to ${inspTo} for the purpose of drawing representative samples of the consignment of ${commodity} while the cargo was being loaded on board the vessel ${vessel} at ${loadingPort}. We certify as under:

AT ${loadingPort}       :     Cargo loading commenced on  ${loadStart}
                              Cargo loading completed on  ${loadEnd}

SAMPLING PROCEDURE

Systematic mass based sampling carried out in accordance with BIS 1405 throughout course of loading. Sublotwise gross sample was constituted by collecting requisite number of sample increments while loading the cargo into the vessel at ${loadingPort}. Individual, Sublotwise gross samples were subject to size analysis and further processed to obtain for moisture determination and chemical analysis.

Sub-lot wise samples drawn as above mixed together to prepare composite sample representing the entire shipment.

PAGE_BREAK

PAGE 2 OF 2

REF:  Certificate No. ${certNo}
DATE:  ${dateStr}

Composite sample representing the shipment at ${loadingPort} was divided into 3 parts and sealed with our monogram. After retaining 2 parts for future reference, one part tested in our lab with the following results.

The analysis as per IS 1493 for the specifications computed for the cargo shipped are as under:

SPECIFICATIONS:
THE ACTUAL RESULT OF THE TEST FOR CHEMICAL COMPOSITIONS (ON DRY BASIS)
        (Percentage by weight)

${chemSpecs}

THE ACTUAL RESULT OF THE TEST FOR FREE MOISTURE LOSS AT 105 DEGREES CENTIGRADE           :  ${moisture}   PCT

THE ACTUAL RESULT OF THE TEST FOR PHYSICAL SIZES  (ON NATURAL BASIS) :
SIZE :
${physSizes}

This Certificate reflects our findings at the time and place of inspection only and does not refer to and any other matter.

FOR ${agency}




AUTHORIZED SIGNATORY
ISSUED AT LOADING PORT

This certificate contains only two pages.`;
  },

  COW: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const commodity = v(product?.commodity, trade?.commodity);
    const quantity = v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined);
    const origin = v(product?.origin, trade?.origin);
    const packing = v(product?.packing);
    const vessel = v(product?.vesselName);
    const loadingPort = v(product?.loadingPort, trade?.origin);
    const dischargePort = v(product?.dischargePort, trade?.destination);
    const blDate = v(product?.charterPartyDate);
    const certNo = product?.loiIssueNumber || `COW-${new Date().getFullYear()}-001`;
    const loadPeriod = product?.laycan || "_______________    TO   _______________";
    const moisture = product?.specialNote || "_______________";
    const dryQty = product?.annexSpecs || "_______________";
    const agency = v(product?.analysisAgency, "_______________");
    const dateStr = today();
    return `CERTIFICATE OF WEIGHT
'TO WHOM IT MAY CONCERN'

                                                                  PAGE 1 OF 1

REF:  Certificate No. ${certNo}
DATE:  ${dateStr}

DESCRIPTION OF GOODS

NAME OF COMMODITY                 :     ${commodity}

QUANTITY                          :     ${quantity} METRIC TONS

COUNTRY OF ORIGIN                 :     ${origin}

PACKING                           :     ${packing}

NAME OF THE CARRYING VESSEL       :     ${vessel}

PORT OF LOADING                   :     ${loadingPort}

PORT OF DISCHARGE                 :     ${dischargePort}

B/L NO. & DATE                    :     01 & DATED ${blDate}

${"=".repeat(73)}

In accordance with the instructions received from the shipper, we attended
for consignment of ${commodity} while the cargo was being loaded on board the
vessel ${vessel} and the weight loaded was determined at ${loadingPort}, by
Draft Survey.  We hereby certifying the actual surveyed weight of cargo
shipped at loading port in wet metric tons and dry metric tons as under:

Port of loading at ${loadingPort}    :     ${loadPeriod}

Quantity loaded at ${loadingPort}     :     ${quantity} METRIC TONS

Free Moisture loss at 105 degrees Centigrade :     ${moisture}    PCT

Dry Quantity     :     ${dryQty} METRIC TONS

This certificate reflects our findings at the time, date and place of
inspection and does not refer to any other matter.

FOR ${agency}




AUTHORIZED SIGNATORY
ISSUED AT LOADING PORT
This certificate contains only one page.`;
  },

  COO: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const shipper = v(seller?.name, trade?.sellerName);
    const consignee = (buyer?.name && buyer.name !== "_______________") ? buyer.name : "TO ORDER";
    const vessel = v(product?.vesselName);
    const pol = v(product?.loadingPort, trade?.origin);
    const pod = v(product?.dischargePort, trade?.destination);
    const commodityName = v(product?.commodity, trade?.commodity);
    const qtyMT = v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined);
    const packing = v(product?.packing);
    const countryOrigin = v(product?.origin, trade?.origin);
    const certNo = product?.loiIssueNumber || `COO-${new Date().getFullYear()}-001`;

    return `CERTIFICATE OF ORIGIN
${"=".repeat(60)}
CERT NO.: ${certNo}

SHIPPER
${shipper}

CONSIGNEE
${consignee}

PRE-CARRIAGE BY
_______________

PORT OF LOADING
${pol}

VESSEL NAME
${vessel}

PORT OF DISCHARGE
${pod}

FINAL DESTINATION
${pod}

${"─".repeat(60)}
DESCRIPTION OF GOODS
${"─".repeat(60)}
NAME OF COMMODITY: ${commodityName}
${qtyMT} METRIC TONS
PACKING: ${packing}
COUNTRY OF ORIGIN: ${countryOrigin}

${"─".repeat(60)}
CERTIFICATION
${"─".repeat(60)}

IT IS HEREBY CERTIFIED THAT TO THE BEST OF OUR KNOWLEDGE AND BELIEF THE ABOVE MENTIONED GOODS ARE OF ${countryOrigin} ORIGIN.
`;
  },

  CI: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const sellerName = v(seller?.name, trade?.sellerName);
    const sellerAddr = v(seller?.address);
    const sellerContact = v(seller?.contact);
    const sellerBank = v(seller?.bank);
    const sellerSwift = v(seller?.swift);
    const buyerName = v(buyer?.name, trade?.buyerName);
    const buyerAddr = v(buyer?.address);
    const buyerContact = v(buyer?.contact);
    const commodity = v(product?.commodity, trade?.commodity);
    const quantity = v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined);
    const origin = v(product?.origin, trade?.origin);
    const pol = v(product?.loadingPort, trade?.origin);
    const pod = v(product?.dischargePort, trade?.destination);
    const unitPrice = v(product?.price, trade ? `${trade.pricePerUnit}` : undefined);
    const currency = product?.currency || trade?.currency || "USD";
    const paymentTerms = v(product?.paymentTerms);
    const invoiceNo = product?.loiIssueNumber || `CI-${new Date().getFullYear()}-001`;
    const vessel = v(product?.vesselName);
    const voyage = v(product?.laycan);
    const blDate = v(product?.charterPartyDate);
    const blNo = product?.packing || "01";
    const lcNo = v(product?.specialNote);
    const lcBank = v(product?.annexSpecs);
    const tolerance = product?.validity || "+/- 10%";
    const totalAmount = v(product?.qualityPremiums);
    const dateStr = today();
    return `COMMERCIAL INVOICE
${"=".repeat(40)}

Invoice No.: ${invoiceNo}
Invoice Date: ${dateStr}

SELLER (BENEFICIARY)
Company: ${sellerName}
Address: ${sellerAddr}
Contact: ${sellerContact}
Bank: ${sellerBank}
SWIFT: ${sellerSwift}

BUYER (APPLICANT)
Company: ${buyerName}
Address: ${buyerAddr}
Contact: ${buyerContact}

LETTER OF CREDIT DETAILS
LC Number: ${lcNo}
LC Issuing Bank: ${lcBank}

SHIPMENT DETAILS
Vessel: ${vessel}
Voyage No.: ${voyage}
Port of Loading: ${pol}
Port of Discharge: ${pod}
Country of Origin: ${origin}
B/L No. & Date: ${blNo} & DATED ${blDate}

DESCRIPTION OF GOODS
| Commodity | Quantity (MT) | Unit Price (${currency}/MT) | Total Amount (${currency}) |
| ${commodity} | ${quantity} MT | ${currency} ${unitPrice}/MT | ${currency} ${totalAmount} |

Tolerance: ${tolerance}

TOTAL INVOICE VALUE: ${currency} ${totalAmount}

Payment Terms: ${paymentTerms}

FOR AND ON BEHALF OF ${sellerName}
Authorised Signatory
Name: _______________
Title: _______________
Date: ${dateStr}
Signature & Stamp: _______________`;
  },

  PI: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const pi = product?.piData || {};
    const sellerName = v(seller?.name, trade?.sellerName);
    const sellerAddr = v(seller?.address);
    const sellerContact = v(seller?.contact);
    const sellerBank = v(seller?.bank);
    const sellerSwift = v(seller?.swift);
    const buyerName = v(buyer?.name, trade?.buyerName);
    const buyerAddr = v(buyer?.address);
    const buyerContact = v(buyer?.contact);
    const commodity = v(product?.commodity, trade?.commodity);
    const quantity = v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined);
    const origin = v(product?.origin, trade?.origin);
    const pol = v(product?.loadingPort, trade?.origin);
    const pod = v(product?.dischargePort, trade?.destination);
    const unitPrice = v(product?.price, trade ? `${trade.pricePerUnit}` : undefined);
    const currency = product?.currency || trade?.currency || "USD";
    const paymentTerms = v(product?.paymentTerms);
    const spaNumber = pi.spaNumber || product?.dealRecapNumber || "_______________";
    const invoiceNo = pi.invoiceNumber || `PI-${spaNumber}`;
    const dateStr = pi.invoiceDate || today();
    const qtyNum = parseFloat(((quantity || "").match(/[\d,]+(?:\.\d+)?/)?.[0] || "").replace(/,/g, ""));
    const priceNum = parseFloat(((unitPrice || "").match(/[\d,]+(?:\.\d+)?/)?.[0] || "").replace(/,/g, ""));
    const computedTotal = Number.isFinite(qtyNum) && Number.isFinite(priceNum)
      ? (qtyNum * priceNum).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "";
    const totalAmount = pi.totalAmount || computedTotal || "_______________";
    return `PROFORMA INVOICE
${"=".repeat(40)}

Invoice No.: ${invoiceNo}
Invoice Date: ${dateStr}
SPA Reference: ${spaNumber}
Valid Until: ${pi.validUntil || "30 days from invoice date"}

SELLER (BENEFICIARY)
Company: ${sellerName}
Address: ${sellerAddr}
Contact: ${sellerContact}
Bank: ${sellerBank}
SWIFT: ${sellerSwift}

BUYER (APPLICANT)
Company: ${buyerName}
Address: ${buyerAddr}
Contact: ${buyerContact}

COMMERCIAL TERMS
SPA Reference: ${spaNumber}
Delivery Term: ${pi.deliveryTerm || product?.incoterm || "_______________"}

SHIPMENT DETAILS
Shipment Window: ${pi.shipmentWindow || product?.laycan || "_______________"}
Port of Loading: ${pol}
Port of Discharge: ${pod}
Country of Origin: ${origin}
Packing: ${pi.packing || product?.packing || "_______________"}

DESCRIPTION OF GOODS
| Commodity | Quantity (MT) | Unit Price (${currency}/MT) | Total Amount (${currency}) |
| ${commodity} | ${quantity} | ${currency} ${unitPrice}/MT | ${currency} ${totalAmount} |

Tolerance: ${product?.validity || "As per SPA"}

TOTAL PROFORMA VALUE: ${currency} ${totalAmount}

Payment Terms: ${paymentTerms}

This Proforma Invoice is issued under SPA ${spaNumber} and is subject to the terms and conditions of that agreement.

FOR AND ON BEHALF OF ${sellerName}
Authorised Signatory
Name: _______________
Title: _______________
Date: ${dateStr}
Signature & Stamp: _______________`;
  },

  LC: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => `LETTER OF CREDIT (LC)
${"=".repeat(40)}

Date: ${today()}
Reference: ${trade?.tradeRef || "_______________"}
LC Number: _______________

TYPE OF CREDIT
Irrevocable Documentary Letter of Credit

ISSUING BANK
Bank Name: _______________
Branch: _______________
SWIFT/BIC: _______________
Address: _______________

APPLICANT (BUYER)
Company: ${v(buyer?.name, trade?.buyerName)}
Address: ${v(buyer?.address)}
Contact: ${v(buyer?.contact)}${coPartyBlock("Co-Buyer", buyer)}

BENEFICIARY (SELLER)
Company: ${v(seller?.name, trade?.sellerName)}
Address: ${v(seller?.address)}
Contact: ${v(seller?.contact)}${coPartyBlock("Co-Seller", seller)}

ADVISING BANK
Bank Name: ${v(seller?.bank)}
SWIFT/BIC: ${v(seller?.swift)}
Address: _______________

LC DETAILS
${tradeBlock(trade, buyer, seller, product)}

Currency & Amount: ${product?.currency || "USD"} ${v(product?.price)}
Tolerance: +/- 10%
Expiry Date: _______________
Latest Shipment Date: _______________
Port of Loading: ${v(product?.loadingPort, trade?.origin)}
Port of Discharge: ${v(product?.dischargePort, trade?.destination)}
Incoterms: ${v(product?.incoterm, trade ? trade.incoterm : undefined)}
Partial Shipment: Allowed / Not Allowed
Transhipment: Allowed / Not Allowed

DOCUMENTS REQUIRED
1. Signed Commercial Invoice (3 originals + 3 copies)
2. Full set of clean on-board Bills of Lading (3/3) made out to order, blank endorsed
3. Certificate of Origin issued by Chamber of Commerce (3 originals)
4. Certificate of Quality & Quantity issued by ${v(product?.analysisAgency, "SGS / Bureau Veritas")}
5. Packing List (3 originals + 3 copies)
6. Certificate of Weight / Draft Survey Report
7. Insurance Certificate / Policy for 110% of invoice value (CIF terms)
8. Phytosanitary / Fumigation Certificate (if applicable)
9. Beneficiary's Certificate confirming shipment details

ADDITIONAL CONDITIONS
1. All banking charges outside the issuing bank are for the Beneficiary's account.
2. Documents must be presented within 21 days after the date of shipment.
3. This LC is subject to UCP 600 (ICC Uniform Customs and Practice for Documentary Credits, 2007 Revision).
4. Performance Bond of 2% of LC value to be issued by Beneficiary's bank upon receipt of LC.

SPECIAL INSTRUCTIONS
${v(product?.specialNote)}

AUTHORISED SIGNATORY
Name: _______________
Title: _______________
Bank: _______________
Date: ${today()}
Signature & Bank Seal: _______________`,

  ICA: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const principal = buyer;
    const agent = seller;
    const cur = product?.currency || trade?.currency || "USD";
    const agentRoleLabel = product?.agentLabel?.trim() || "Agent";
    const exclusiveBox = product?.agencyType?.toLowerCase() === "exclusive" ? "[X]" : "[ ]";
    const nonExclusiveBox = product?.agencyType?.toLowerCase() === "non-exclusive" ? "[X]" : "[ ]";
    return `INTERNATIONAL COMMISSION AGREEMENT
(ICC COMPLIANT MASTER COMMISSION AGREEMENT)

THIS INTERNATIONAL COMMISSION AGREEMENT ("Agreement") is made and entered into on ${v(product?.effectiveDate, today())} ("Effective Date")

BETWEEN

1. PRINCIPAL
Company Name: ${v(principal?.name)}
Type of Entity: ${v(product?.principalEntityType)}
Country of Incorporation: ${v(product?.principalCountry)}
Company Registration No.: ${v(product?.principalRegNo)}
Registered Address: ${v(principal?.address)}
Represented By: ${v(product?.principalRepresentative)}
Designation: ${v(product?.principalDesignation)}
Passport/ID No.: ${v(product?.principalPassport)}
Telephone / Email: ${v(principal?.contact)}
Hereinafter referred to as the "Principal".

AND

2. ${agentRoleLabel.toUpperCase()} / BROKER / FACILITATOR
Company Name: ${v(agent?.name)}
Type of Entity: ${v(product?.agentEntityType)}
Country of Incorporation: ${v(product?.agentCountry)}
Company Registration No.: ${v(product?.agentRegNo)}
Registered Address: ${v(agent?.address)}
Represented By: ${v(product?.agentRepresentative)}
Designation: ${v(product?.agentDesignation)}
Passport/ID No.: ${v(product?.agentPassport)}
Telephone / Email: ${v(agent?.contact)}
Hereinafter referred to as the "${agentRoleLabel}".

The Principal and ${agentRoleLabel} are hereinafter individually referred to as a "Party" and collectively as the "Parties."

RECITALS
WHEREAS:
A. The Principal is engaged in the business of international trade, procurement, supply, marketing, financing, brokerage, logistics, commodities, petroleum products, petrochemicals, metals, minerals, agricultural products, or related commercial activities;
B. The ${agentRoleLabel} possesses expertise, business contacts, networks, market intelligence, and commercial relationships capable of assisting the Principal in securing commercial opportunities and transactions;
C. The ${agentRoleLabel} desires to introduce and/or facilitate business opportunities for the Principal;
D. The Principal agrees to compensate the ${agentRoleLabel} by payment of commission in accordance with the terms and conditions of this Agreement;
NOW THEREFORE, in consideration of the mutual covenants herein contained, the Parties agree as follows:

ARTICLE 1 – DEFINITIONS
1.1 "Transaction" means any commercial transaction, sale, purchase, supply agreement, SPA, financing arrangement, joint venture, trade finance transaction, shipping arrangement, or business contract arising directly or indirectly from the ${agentRoleLabel}'s introduction, facilitation, negotiation, assistance, or involvement.
1.2 "Commission" means the compensation payable to the ${agentRoleLabel} pursuant to this Agreement.
1.3 "Buyer" means the purchaser, importer, consignee, end-user, or recipient introduced by the ${agentRoleLabel}.
1.4 "Seller" means the supplier, exporter, manufacturer, refinery, trader, or producer involved in the Transaction.
1.5 "Confidential Information" means all information disclosed between Parties including but not limited to trade secrets, customer data, banking information, pricing, contracts, logistics, commercial arrangements, business strategies, and financial details.
1.6 "ICC Rules" means the rules, guidelines, and practices issued by the International Chamber of Commerce including UCP 600, URDG 758, ISP98, Incoterms®, and ICC Arbitration Rules.

ARTICLE 2 – APPOINTMENT
2.1 Appointment. The Principal hereby appoints the ${agentRoleLabel} as its:
${nonExclusiveBox} Non-Exclusive Agent          ${exclusiveBox} Exclusive Agent
for the purpose of introducing, facilitating, negotiating, arranging, coordinating, and assisting in Transactions.
2.2 Scope of Services. The ${agentRoleLabel} may perform any of the following services:
- Introduce buyers, sellers, suppliers, or financiers;
- Facilitate negotiations between Parties;
- Coordinate documentation;
- Assist in banking and trade finance procedures;
- Assist in logistics and shipment coordination;
- Arrange meetings and communications;
- Facilitate issuance of financial instruments;
- Support execution of SPA/FCO/ICPO/LOI agreements;
- Assist in dispute coordination and commercial follow-up.
2.3 No Employment Relationship. Nothing herein shall create any partnership, employment, agency, fiduciary, or joint venture relationship unless expressly agreed in writing.

ARTICLE 3 – TRANSACTION DETAILS
Product / Commodity: ${v(product?.commodity, trade?.commodity)}
Origin: ${v(product?.origin, trade?.origin)}
Destination: ${v(product?.dischargePort, trade?.destination)}
Quantity: ${v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined)}
Contract Reference: ${v(product?.contractRef, trade?.tradeRef)}
Approximate Contract Value: ${cur} ${v(product?.contractValue)}
Delivery Terms (Incoterms®): ${v(product?.incoterm, trade?.incoterm)}
Payment Terms: ${v(product?.paymentTerms)}

ARTICLE 4 – COMMISSION STRUCTURE
4.1 Commission Amount: ${v(product?.commissionStructure)}
4.2 Commission Basis: ${v(product?.commissionBasis, "Gross Invoice Value")}
4.3 Payment Timing. Commission payments shall be made:
- Simultaneously with each shipment/payment;
- Within 5 banking days from receipt of funds by the Principal;
- Automatically from proceeds of each Transaction where applicable.
4.4 Method of Payment. Commission shall be paid by MT103 Wire Transfer, Telegraphic Transfer (TT), SWIFT Payment, Cryptocurrency (if legally permissible), or other agreed banking method.
4.5 Currency. All Commission payments shall be made in ${cur}.
4.6 Irrevocable Obligation. The Principal acknowledges that the ${agentRoleLabel}'s entitlement to Commission becomes irrevocable upon successful introduction or facilitation leading to a Transaction.
4.7 Continuing Transactions. Commission shall remain payable for contract renewals, extensions, rollovers, repeat orders, addendums, side agreements, related entities, affiliates or subsidiaries, and future transactions arising from the introduced relationship. This obligation shall survive termination of this Agreement.

ARTICLE 5 – NON-CIRCUMVENTION
5.1 The Parties irrevocably agree not to circumvent, bypass, avoid, interfere with, or attempt to exclude the ${agentRoleLabel} from any Transaction introduced under this Agreement.
5.2 All contacts introduced by the ${agentRoleLabel} shall remain protected. The Principal shall not directly or indirectly transact with such contacts without honoring Commission obligations.
5.3 Indirect Circumvention through related companies, nominees, subsidiaries, agents, partners, shareholders, affiliates, family members, or intermediaries shall constitute breach of this Agreement.
5.4 Penalty. In case of circumvention, the offending Party shall be liable for full unpaid Commission, damages, legal costs, arbitration expenses, and loss of profits.

ARTICLE 6 – NON-DISCLOSURE & CONFIDENTIALITY
The Parties agree to maintain strict confidentiality concerning all Confidential Information. Neither Party shall disclose any information to third parties without written consent except to banks, legal advisors, compliance officers, or government authorities where legally required. This obligation shall survive for 3 years after termination.

ARTICLE 7 – ICC RULES & INTERNATIONAL TRADE COMPLIANCE
This Agreement shall be interpreted in accordance with internationally accepted trade practices and ICC Rules including but not limited to ICC UCP 600, ICC URDG 758, ICC ISP98, ICC Incoterms® latest edition, ICC eUCP, and ICC Arbitration Rules. All documentary credits, guarantees, trade finance instruments, and banking operations shall comply with applicable ICC standards.

ARTICLE 8 – AML / KYC / SANCTIONS COMPLIANCE
Each Party represents and warrants that it complies with AML and KYC regulations; that it is not sanctioned under UN, OFAC, EU, UK, or other applicable sanctions regimes; that funds used are from lawful sources; and that it shall cooperate with compliance and due diligence requests. Any violation may result in immediate termination.

ARTICLE 9 – ANTI-BRIBERY & ETHICS
The Parties shall comply with all applicable anti-corruption laws including the UK Bribery Act, US FCPA, OECD Anti-Bribery Convention, and applicable local laws. No illegal payments, kickbacks, or improper inducements shall be made.

ARTICLE 10 – TERM & TERMINATION
10.1 Term. This Agreement shall remain valid for ${v(product?.termYears, "3")} years from the Effective Date.
10.2 Termination. Either Party may terminate this Agreement by giving 15 days written notice. Termination shall not affect accrued Commission rights.
10.3 Immediate Termination may occur in cases of fraud, sanctions violations, illegal activity, material breach, or insolvency.

ARTICLE 11 – FORCE MAJEURE
Neither Party shall be liable for delay or failure caused by events beyond reasonable control including war, government restrictions, sanctions, port closures, banking restrictions, natural disasters, pandemics, civil unrest, cyber attacks, and acts of God. The affected Party shall notify the other Party promptly.

ARTICLE 12 – GOVERNING LAW
This Agreement shall be governed by the laws of ${v(product?.governingLaw)} without regard to conflict of law principles.

ARTICLE 13 – DISPUTE RESOLUTION & ICC ARBITRATION
Any dispute arising from or related to this Agreement shall be finally settled under the Rules of Arbitration of the International Chamber of Commerce (ICC).
Seat of Arbitration: ${v(product?.seatOfArbitration)}
Venue: ${v(product?.venueOfArbitration)}
Language: English
Number of Arbitrators: ${v(product?.numArbitrators, "One")}
The arbitral award shall be final, binding, and enforceable in any competent jurisdiction.

ARTICLE 14 – DIGITAL EXECUTION
The Parties agree that electronically signed copies, PDF signatures, digital signatures, scanned copies, and electronic communications shall be deemed legally valid and enforceable as original documents.

ARTICLE 15 – NOTICES
All notices shall be made by Email, Courier, Registered mail, SWIFT, or Electronic communication. Notice shall be deemed received upon confirmed transmission.

ARTICLE 16 – ASSIGNMENT
Neither Party may assign this Agreement without prior written consent except to affiliated entities involved in the Transaction.

ARTICLE 17 – ENTIRE AGREEMENT
This Agreement constitutes the complete understanding between the Parties and supersedes all prior oral or written agreements. Any amendment must be in writing signed by both Parties.

ARTICLE 18 – SEVERABILITY
If any provision is deemed invalid or unenforceable, the remaining provisions shall remain in full force and effect.

ARTICLE 19 – COUNTERPARTS
This Agreement may be executed in counterparts, each of which shall constitute an original.

ARTICLE 20 – STRICT AML, SANCTIONS, COMPLIANCE & REGULATORY PROTECTION
1. General Compliance Undertaking. The Parties acknowledge that international trade transactions are subject to strict international banking, financial crime prevention, anti-money laundering, sanctions, anti-bribery, counter-terrorism financing, export control, and regulatory compliance requirements. Each Party agrees to fully comply with all applicable AML, CTF, KYC, sanctions, export control, anti-bribery, banking compliance and financial intelligence obligations.
2. Applicable International Regulations include FATF Recommendations, UN/OFAC/EU/UK sanctions, US FCPA, UK Bribery Act, Wolfsberg Principles, Basel compliance principles, ICC Anti-Corruption Clause, applicable Central Bank regulations, and applicable customs and trade regulations.
3. Compliance Standard elected for this Transaction: ${v(product?.amlOption, "Standard Commercial Compliance")}.
4. Right to Request Compliance Documents. Each Party shall have the right to request KYC, AML, banking compliance, and trade finance documentation reasonably necessary for due diligence.
5. Sanctions Representations. Each Party represents and warrants that it is not subject to sanctions imposed by the UN, OFAC, EU, UK, or any applicable governmental authority, nor owned or controlled by sanctioned persons or entities.
6. Prohibited Transactions. No Party shall use this Agreement for money laundering, terrorism financing, sanctions evasion, fraudulent trade, trade-based money laundering, bribery or corruption, illegal transfer of funds, false invoicing, illegal dual-use trade, or prohibited jurisdictions or activities.
7. Suspension Rights. If any Party reasonably suspects AML violations, fraudulent activity, sanctions exposure, suspicious financial activity, regulatory breaches, or illicit trade activity, such Party may immediately suspend performance pending compliance review without liability.
8. Termination for Compliance Breach. Any breach of AML, sanctions, anti-corruption, export control, or regulatory obligations shall constitute material breach permitting immediate termination.
9. Banking & Compliance Delays. Neither Party shall be liable for delays caused by legitimate compliance or banking review procedures.
10. Record Keeping. Each Party shall maintain accurate books, records, invoices, shipping documents, compliance records, and transaction documentation for a minimum period of ${v(product?.recordKeepingYears, "7")} years following completion of the Transaction.
11. Cooperation with Authorities. Where legally required, the Parties shall cooperate with regulatory authorities, courts, financial intelligence units, and banking institutions.

ARTICLE 21 – BANKING DETAILS
PRINCIPAL BANK DETAILS
Bank Name: ${v(product?.principalBankName, principal?.bank)}
Bank Address: ${v(product?.principalBankAddress)}
Account Name: ${v(product?.principalAccountName, principal?.name)}
Account Number: ${v(product?.principalAccountNumber)}
IBAN: ${v(product?.principalIban)}
SWIFT Code: ${v(product?.principalSwift, principal?.swift)}

${agentRoleLabel.toUpperCase()} BANK DETAILS
Bank Name: ${v(product?.agentBankName, agent?.bank)}
Bank Address: ${v(product?.agentBankAddress)}
Account Name: ${v(product?.agentAccountName, agent?.name)}
Account Number: ${v(product?.agentAccountNumber)}
IBAN: ${v(product?.agentIban)}
SWIFT Code: ${v(product?.agentSwift, agent?.swift)}

SIGNATURE PAGE
FOR THE PRINCIPAL
Company Name: ${v(principal?.name)}
Name: ${v(product?.principalRepresentative)}
Position: ${v(product?.principalDesignation)}
Signature: _______________
Date: _______________

FOR THE ${agentRoleLabel.toUpperCase()}
Company Name: ${v(agent?.name)}
Name: ${v(product?.agentRepresentative)}
Position: ${v(product?.agentDesignation)}
Signature: _______________
Date: _______________


ANNEXURE A — IRREVOCABLE MASTER FEE PROTECTION AGREEMENT (IMFPA)
(Integral Part of the International Commission Agreement)

IMPORTANT NOTICE
This Annexure A forms an integral and inseparable part of the International Commission Agreement and shall survive completion, termination, expiration, renewal, rollover, amendment, extension, replacement, or substitution of the Main Agreement and/or underlying commercial Transaction(s). The obligations herein are irrevocable, unconditional, continuing, and legally binding upon the Parties, their successors, assigns, affiliates, subsidiaries, nominees, agents, representatives, and beneficiaries.

1. PURPOSE
The purpose of this Annexure is to establish an irrevocable fee protection mechanism ensuring that all commissions, fees, remunerations, and intermediary compensations due to the ${agentRoleLabel}, Broker, Facilitator, Intermediary, Introducer, or Beneficiary are fully protected and paid in accordance with internationally accepted trade and banking practices including applicable ICC Rules.

2. IRREVOCABLE PAYMENT UNDERTAKING
The Principal hereby irrevocably, unconditionally, and absolutely undertakes to pay the ${agentRoleLabel} the agreed Commission for all Transaction(s) concluded directly or indirectly as a result of the ${agentRoleLabel}'s introduction, facilitation, negotiation, assistance, participation, or involvement. Such payment obligation shall remain enforceable regardless of change in transaction structure, replacement of parties, use of affiliates or nominees, assignment of contract, change of commodity, destination, vessel, banking arrangements, amendment to SPA or underlying agreements, corporate restructuring, termination of intermediary relationships, or direct dealings between parties introduced by the ${agentRoleLabel}.

3. ICC RULES & INTERNATIONAL BANKING STANDARDS
The Parties expressly agree that all payments, banking instruments, trade finance mechanisms, and obligations arising under this Annexure shall be interpreted and implemented in accordance with internationally recognized ICC standards including ICC UCP 600, ICC URDG 758, ICC ISP98, ICC Incoterms® (latest edition), ICC eRules, ICC Rules of Arbitration, ICC Banking Commission Opinions and Guidelines, ICC Anti-Corruption Clause, and ICC Model International Sale Contract principles where applicable.

4. FEE PROTECTION OBLIGATION
4.1 Earned Commission. Commission shall be deemed fully earned immediately upon successful introduction of Buyer and Seller; execution of LOI, ICPO, FCO, SPA, MOU, Term Sheet, or Contract; issuance of banking instruments; receipt of payment by Principal; shipment commencement; or any commercial benefit derived from the introduced relationship.
4.2 No Avoidance. The Principal shall not avoid payment of Commission by changing company names, using affiliated entities, utilizing subsidiaries or holding companies, appointing alternative intermediaries, re-routing transactions, splitting contracts, altering invoice structures, or using third-party payment structures.
4.3 Automatic Continuity. Fee protection shall automatically extend to renewals, extensions, rollovers, repeat shipments, spot contracts, framework agreements, additional quantities, addendums, side agreements, and future contracts between introduced parties.

5. PAYMENT MECHANISM
5.1 Timing. Commission payments shall be made simultaneously with receipt of commercial proceeds, on each shipment, on each tranche/payment received, without delay, deduction, withholding, or set-off.
5.2 Currency. All payments shall be made in freely transferable currency unless otherwise agreed.
5.3 Banking Method. MT103, SWIFT Wire Transfer, Escrow, Documentary Credit, automated split-payment structures, or blockchain-based payment systems where lawful.
5.4 Banking Charges. All sending bank charges shall be borne by the Principal and receiving bank charges by the ${agentRoleLabel} unless otherwise agreed.

6. NON-REVOCABILITY
The obligations under this Annexure are irrevocable, unconditional, absolute, continuing, and independent of underlying disputes. No dispute between Buyer and Seller shall affect the ${agentRoleLabel}'s right to earned Commission.

7. TRUST & FIDUCIARY OBLIGATION
The Principal acknowledges that any Commission amount received or retained on behalf of the ${agentRoleLabel} constitutes funds held in trust for the ${agentRoleLabel}. Failure to remit such funds may constitute breach of contract, unjust enrichment, fraudulent concealment, or breach of fiduciary undertaking.

8. AUDIT & TRANSPARENCY
The ${agentRoleLabel} shall have the right, upon reasonable notice, to request supporting documents evidencing shipment quantities, invoice values, payment receipts, banking confirmations, and contract amendments relevant to Commission calculation. The Principal shall not intentionally conceal commercial information affecting Commission entitlement.

9. DEFAULT
Failure to pay Commission when due shall constitute immediate default. Upon default, the ${agentRoleLabel} shall be entitled to immediate payment of outstanding sums, interest at 1% per annum, recovery of legal costs, recovery of arbitration costs, recovery of consequential damages, and injunctive relief where permissible.

10. SURVIVAL
This Annexure shall survive expiration, completion, termination, cancellation, rescission, or suspension of the Main Agreement. The obligations herein shall remain valid for all Transactions initiated during the term of the Main Agreement.

11. ICC ARBITRATION
Any dispute arising from this Annexure shall be resolved exclusively under ICC Arbitration Rules. The Parties expressly waive objections relating to jurisdiction or enforceability of ICC arbitration awards.

12. ENFORCEABILITY
This Annexure may be enforced independently of the Main Agreement. A breach of this Annexure shall constitute material breach of the Main Agreement.


ANNEXURE B — NON-CIRCUMVENTION, NON-DISCLOSURE & WORKING AGREEMENT (NCNDA)
(Integral Part of the International Commission Agreement)

IMPORTANT NOTICE
This Annexure B forms an integral and inseparable part of the International Commission Agreement and shall remain legally binding upon all Parties, their affiliates, subsidiaries, nominees, successors, assigns, officers, employees, agents, intermediaries, and representatives.

1. PURPOSE
To protect introduced business relationships, prevent circumvention, preserve confidentiality, protect commercial interests, ensure ethical international trade practices, and preserve intermediary rights.

2. NON-CIRCUMVENTION OBLIGATION
The Parties irrevocably agree that they shall not directly or indirectly circumvent, bypass, avoid, exclude, interfere with, or undermine the ${agentRoleLabel} or any protected party introduced under the Main Agreement.

3. PROTECTED PARTIES
Buyers, Sellers, Suppliers, Refineries, Manufacturers, End buyers, Financiers, Banks, Shipping companies, Investors, Trade contacts, Agents, Affiliates, and Mandates. Protection applies whether introduced verbally, electronically, physically, or through documentation.

4. PROHIBITED ACTIVITIES
Without written consent, the Parties shall not directly contact protected parties for competing transactions, negotiate around the ${agentRoleLabel}, use confidential information for independent transactions, divert business opportunities, utilize nominee companies to bypass the ${agentRoleLabel}, induce protected parties to terminate intermediary arrangements, or modify transaction structures to avoid commission obligations.

5. CONFIDENTIALITY
All commercial, banking, technical, financial, operational, and transactional information exchanged between Parties shall remain strictly confidential — including pricing, banking coordinates, SWIFT copies, SPA terms, logistics arrangements, client identities, financial structures, trade finance arrangements, commission structures, and contractual negotiations.

6. PERMITTED DISCLOSURE
Only with prior written consent, to banks and financial institutions, to legal counsel, to auditors, to compliance departments, or when required by applicable law or court order.

7. ICC ETHICS & GOOD FAITH
The Parties agree to conduct themselves in accordance with ICC ethical standards, international good faith trade practices, honest commercial dealing, international anti-corruption standards, and fair intermediary protection principles.

8. TERM OF PROTECTION
Non-circumvention and confidentiality obligations shall remain valid for 5 years from termination or completion of the Main Agreement.

9. DAMAGES
In case of breach, the offending Party shall be liable for full unpaid Commission, loss of profits, consequential damages, legal fees, ICC arbitration costs, equitable remedies, and injunctive relief.

10. ELECTRONIC COMMUNICATIONS
Emails, SWIFT messages, electronic signatures, scanned copies, PDF transmissions, blockchain records, and digital communications shall constitute admissible evidence and legally binding communications.

11. NO WAIVER
Failure by any Party to enforce any provision shall not constitute waiver of rights.

12. SEVERABILITY
If any provision is held unenforceable, the remaining provisions shall remain valid and enforceable.

13. ICC ARBITRATION
All disputes arising under this Annexure shall be finally resolved under ICC Arbitration Rules. The arbitral award shall be final, binding, and enforceable internationally under the New York Convention.

14. ACKNOWLEDGEMENT
The Parties acknowledge that they have read and understood this Annexure, voluntarily accept its terms, recognize the ${agentRoleLabel}'s role as protected intermediary, and accept ICC-based international trade principles governing this relationship.

SIGNATURES (ANNEXURES A & B)
FOR THE PRINCIPAL
Company: ${v(principal?.name)}
Authorized Signatory: ${v(product?.principalRepresentative)}
Position: ${v(product?.principalDesignation)}
Signature: _______________
Date: _______________

FOR THE ${agentRoleLabel.toUpperCase()}
Company: ${v(agent?.name)}
Authorized Signatory: ${v(product?.agentRepresentative)}
Position: ${v(product?.agentDesignation)}
Signature: _______________
Date: _______________`;
  },

  DLC_MT700: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const d = product?.dlcData || {};
    const MULTILINE_KEYS = new Set(["goodsDescription", "productSpecification", "documentsRequired", "additionalConditions"]);
    const g = (key: string, fb = "____") => {
      const raw = d[key];
      if (raw === undefined || !String(raw).trim()) return fb;
      return MULTILINE_KEYS.has(key) ? swiftCleanBlock(raw) : swiftCleanLine(raw);
    };
    const currency = g("currency", "USD");
    const goodsDefault = [
      `${g("quantity", product?.quantity || "____")} OF ${g("commodity", product?.commodity || "____").toUpperCase()}`,
      `OF ${g("origin", product?.origin || "____").toUpperCase()} ORIGIN.`,
    ].join("\n");
    const goods = g("goodsDescription", goodsDefault);
    const applicantName = g("applicantName", buyer?.name || "____");
    const applicantAddress = g("applicantAddress", buyer?.address || "____");
    const beneficiaryName = g("beneficiaryName", seller?.name || "____");
    const beneficiaryAddress = g("beneficiaryAddress", seller?.address || "____");

    return `DRAFT - SWIFT MT700

DOCUMENTARY CREDIT

STATUS: DRAFT FOR ISSUING BANK REVIEW

SWIFT MESSAGE

{1:F01${g("issuingBankBic", "[ISSUING BANK BIC]")}0000000000}
{2:I700${g("beneficiaryBankBic", "[BENEFICIARY BANK BIC]")}N}
{3:{108:${g("bankReference", "[BANK REFERENCE]")}}}
{4:

:27:1/1
:40A:IRREVOCABLE
:20:${g("creditNumber", "[DOCUMENTARY CREDIT NUMBER]")}
:31C:${g("dateOfIssue", "[DATE OF ISSUE]")}
:40E:UCP LATEST VERSION
:31D:${g("expiryDate", "[EXPIRY DATE]")} ${g("placeOfExpiry", "[PLACE OF EXPIRY]")}

:50:${applicantName}
${applicantAddress}
${g("applicantCountry", "[COUNTRY]")}

:59:${beneficiaryName}
${beneficiaryAddress}
${g("beneficiaryCountry", "[COUNTRY]")}

:32B:${currency}${g("amount", "[AMOUNT]")}
:39A:${g("tolerance", "[TOLERANCE]")}

:41A:${g("beneficiaryBankBic", "[BENEFICIARY BANK BIC]")}
BY PAYMENT

:42C:DRAFTS AT ${g("draftsAt", "SIGHT")}
:42A:${g("draweeBankBic", "[DRAWEE BANK BIC]")}

:43P:${g("partialShipments", "NOT ALLOWED")}
:43T:${g("transshipment", "ALLOWED")}

:44A:${g("placeOfReceipt", "[PLACE OF TAKING IN CHARGE / RECEIPT]")}
:44E:${g("portOfLoading", "[PORT / PLACE OF LOADING]")}
:44F:${g("portOfDischarge", "[PORT / PLACE OF DISCHARGE]")}
:44B:${g("finalDestination", "[PLACE OF FINAL DESTINATION]")}

:44C:${g("latestShipmentDate", "[LATEST DATE OF SHIPMENT]")}

:45A:
${goods}

${g("productSpecification", "PRODUCT SPECIFICATION:\n[AS PER CONTRACT]")}

PRICE: ${currency} ${g("pricePerUnit", "[PRICE]")} PER METRIC TON
DELIVERY TERM: ${g("deliveryTerm", "[CFR/CIF/FOB] [PORT]")}
TOTAL CREDIT AMOUNT: ${currency} ${g("amount", "[AMOUNT]")}

:46A:
${g("documentsRequired", `1. SIGNED COMMERCIAL INVOICE IN 3 ORIGINALS.

2. FULL SET OF CLEAN ON BOARD OCEAN BILLS OF LADING
MADE OUT TO ORDER OF THE ISSUING BANK, MARKED
"FREIGHT ${g("freightMark", "PREPAID")}" AND NOTIFYING THE
APPLICANT.

3. CERTIFICATE OF ORIGIN ISSUED BY THE COMPETENT
AUTHORITY IN THE COUNTRY OF ORIGIN, IN 1 ORIGINAL AND
2 COPIES.

4. CERTIFICATE OF ANALYSIS ISSUED BY SGS, BUREAU VERITAS,
INTERTEK OR ANOTHER INTERNATIONAL INSPECTION COMPANY
ACCEPTABLE TO THE APPLICANT.

5. CERTIFICATE OF WEIGHT ISSUED BY AN INDEPENDENT
INSPECTION COMPANY.

6. PACKING LIST / WEIGHT LIST IN 3 COPIES, WHERE
APPLICABLE.

7. CERTIFICATE OF QUALITY CONFIRMING COMPLIANCE WITH
THE CONTRACTUAL PRODUCT SPECIFICATION.

8. EXPORT CUSTOMS DECLARATION OR EQUIVALENT EXPORT
CUSTOMS DOCUMENT ISSUED BY THE COMPETENT CUSTOMS
AUTHORITY OF THE COUNTRY OF ORIGIN.

9. BENEFICIARY'S CERTIFICATE CONFIRMING THAT THE GOODS
ARE OF THE STATED ORIGIN AND THAT THE SHIPMENT
COMPLIES WITH THE TERMS OF THE UNDERLYING SPA.

10. INSURANCE POLICY / CERTIFICATE COVERING NOT LESS
THAN 110 PERCENT OF THE INVOICE VALUE, IN THE CURRENCY
OF THE CREDIT, ENDORSED IN BLANK AND COVERING THE
RISKS SPECIFIED IN THE CONTRACT, APPLICABLE FOR CIF
SHIPMENTS.`)}

:47A:
${g("additionalConditions", `1. ALL DOCUMENTS MUST INDICATE THE DOCUMENTARY CREDIT
NUMBER.

2. DOCUMENTS MUST NOT CONTAIN ANY MATERIAL
DISCREPANCY WITH THE TERMS OF THIS CREDIT.

3. THIRD PARTY DOCUMENTS ARE ACCEPTABLE EXCEPT
COMMERCIAL INVOICES AND DRAFTS.

4. CHARTER PARTY BILLS OF LADING ARE ${g("charterPartyBl", "NOT")} ACCEPTABLE.

5. PART SHIPMENTS ARE ${g("partialShipments", "NOT ALLOWED")}.

6. TRANSSHIPMENT IS ${g("transshipment", "ALLOWED")}.

7. DOCUMENTS ISSUED OR SIGNED ELECTRONICALLY ARE
ACCEPTABLE PROVIDED THEY ARE AUTHENTICATED AND
COMPLY WITH THE REQUIREMENTS OF THE ISSUING BANK.

8. MINOR TYPOGRAPHICAL ERRORS THAT DO NOT AFFECT THE
IDENTITY, QUANTITY, QUALITY, PRICE OR OTHER MATERIAL
TERMS OF THE GOODS SHALL NOT CONSTITUTE A DISCREPANCY.

9. ALL DOCUMENTS SHALL BE PRESENTED WITHIN ${g("presentationDays", "21")} DAYS
AFTER THE DATE OF SHIPMENT BUT WITHIN THE VALIDITY OF
THE CREDIT.

10. THIS CREDIT IS SUBJECT TO UCP 600, ICC PUBLICATION
NO. 600.`)}

:71B:
ALL BANKING CHARGES OUTSIDE THE ISSUING BANK ARE FOR
ACCOUNT OF THE BENEFICIARY UNLESS OTHERWISE AGREED.

:48:
DOCUMENTS TO BE PRESENTED WITHIN ${g("presentationDays", "21")} DAYS AFTER DATE
OF SHIPMENT BUT WITHIN THE VALIDITY OF THE CREDIT.

:49:${g("confirmationInstructions", "WITHOUT")}

:78:
UPON RECEIPT OF DOCUMENTS COMPLYING WITH THE TERMS AND
CONDITIONS OF THIS DOCUMENTARY CREDIT, WE SHALL EFFECT
PAYMENT IN ACCORDANCE WITH THE PAYMENT INSTRUCTIONS
CONTAINED HEREIN.

DOCUMENTS ARE TO BE FORWARDED TO:

${g("issuingBankName", "[ISSUING BANK NAME]")}
${g("issuingBankAddress", "[ISSUING BANK ADDRESS]")}
${g("issuingBankDepartment", "DOCUMENTS DEPARTMENT")}

IN ${g("setsCount", "ONE")} SET(S).

:72:
PLEASE ADVISE BENEFICIARY WITHOUT ADDING YOUR
CONFIRMATION UNLESS OTHERWISE AUTHORIZED.
-}
{5:{CHK:[BANK GENERATED CHECKSUM]}}`;
  },

  PBG_MT760: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const p = product?.pbgData || {};
    const MULTILINE_KEYS = new Set(["underlyingTransaction", "guaranteeText"]);
    const g = (key: string, fb = "____") => {
      const raw = p[key];
      if (raw === undefined || !String(raw).trim()) return fb;
      return MULTILINE_KEYS.has(key) ? swiftCleanBlock(raw) : swiftCleanLine(raw);
    };
    const currency = g("currency", "USD");
    const amount = g("guaranteeAmount", "[GUARANTEE AMOUNT]");
    const applicantName = g("applicantName", buyer?.name || "[APPLICANT NAME]");
    const beneficiaryName = g("beneficiaryName", seller?.name || "[BENEFICIARY NAME]");
    const issuingBankName = g("issuingBankName", "[ISSUING BANK NAME]");
    const issuingBankBic = g("issuingBankBic", "[ISSUING BANK BIC]");
    const expiryDate = g("expiryDate", "[EXPIRY DATE]");
    const underlyingDefault = [
      `THIS GUARANTEE IS ISSUED IN CONNECTION WITH SALE AND`,
      `PURCHASE AGREEMENT NO. ${g("spaNumber", "[SPA NUMBER]")} DATED ${g("spaDate", "[SPA DATE]")}`,
      `FOR THE SALE AND PURCHASE OF ${g("quantity", product?.quantity || "[QUANTITY]").toUpperCase()} OF`,
      `${g("commodity", product?.commodity || "[COMMODITY]").toUpperCase()} OF ${g("origin", product?.origin || "[ORIGIN]").toUpperCase()} ORIGIN FOR DELIVERY`,
      `TO ${g("destination", "[DESTINATION]").toUpperCase()}.`,
    ].join("\n");
    const underlying = g("underlyingTransaction", underlyingDefault);

    return `DRAFT - SWIFT MT760

IRREVOCABLE PERFORMANCE GUARANTEE

STATUS: DRAFT FOR ISSUING BANK REVIEW

SWIFT MESSAGE

{1:F01${issuingBankBic === "[ISSUING BANK BIC]" ? "[ISSUINGBANKBIC]" : issuingBankBic}0000000000}
{2:I760${g("beneficiaryBankBic", "[BENEFICIARYBANKBIC]")}N}
{3:{108:${g("bankReference", "[BANK REFERENCE]")}}}
{4:

:15A:
:20:${g("guaranteeNumber", "[GUARANTEE NUMBER]")}
:30:${g("dateOfIssue", "[DATE OF ISSUE]")}
:22D:DGAR
:40C:URDG
:23B:IRREVOCABLE

:50:${applicantName}
${g("applicantAddress", buyer?.address || "[REGISTERED ADDRESS]")}
${g("applicantCountry", "[COUNTRY]")}

:59:${beneficiaryName}
${g("beneficiaryAddress", seller?.address || "[REGISTERED ADDRESS]")}
${g("beneficiaryCountry", "[COUNTRY]")}

:32B:${currency}${amount}

:71D:ALL BANKING CHARGES OUTSIDE THE ISSUING BANK
ARE FOR ACCOUNT OF THE APPLICANT.

:77U:
${g("guaranteeText", `WE, ${issuingBankName}, AT THE REQUEST AND FOR
THE ACCOUNT OF ${applicantName.toUpperCase()}, HEREBY ISSUE OUR
IRREVOCABLE AND UNCONDITIONAL PERFORMANCE GUARANTEE
IN FAVOUR OF ${beneficiaryName.toUpperCase()} FOR AN AMOUNT NOT
EXCEEDING ${currency} ${amount} (${g("currencyInWords", "UNITED STATES DOLLARS")}
${g("amountInWords", "[AMOUNT IN WORDS]")} ONLY).

${underlying}

WE IRREVOCABLY UNDERTAKE TO PAY THE BENEFICIARY, UPON
RECEIPT OF A COMPLYING DEMAND, ANY AMOUNT UP TO THE
GUARANTEED AMOUNT IN RESPECT OF THE APPLICANT'S FAILURE
TO PERFORM ITS CONTRACTUAL OBLIGATIONS UNDER THE
UNDERLYING CONTRACT.

ANY DEMAND SHALL STATE THAT THE APPLICANT HAS FAILED
TO PERFORM ITS CONTRACTUAL OBLIGATIONS, QUOTE THIS
GUARANTEE NUMBER AND SPECIFY THE AMOUNT CLAIMED.

THE DEMAND SHALL BE PRESENTED THROUGH THE BENEFICIARY'S
BANK BY AUTHENTICATED SWIFT MESSAGE TO ${issuingBankBic}.

NO JUDGMENT, ARBITRAL AWARD OR PRIOR LEGAL ACTION
AGAINST THE APPLICANT SHALL BE REQUIRED AS A CONDITION
FOR PAYMENT UNDER THIS GUARANTEE.

OUR OBLIGATION UNDER THIS GUARANTEE IS INDEPENDENT OF
THE UNDERLYING CONTRACT AND SHALL NOT BE AFFECTED BY
ANY DISPUTE BETWEEN THE APPLICANT AND THE BENEFICIARY.

PARTIAL AND MULTIPLE DEMANDS ARE PERMITTED PROVIDED
THAT THE AGGREGATE AMOUNT PAID UNDER THIS GUARANTEE
DOES NOT EXCEED THE GUARANTEED AMOUNT.

ANY PAYMENT MADE UNDER THIS GUARANTEE SHALL REDUCE
THE AVAILABLE GUARANTEED AMOUNT ACCORDINGLY.

THIS GUARANTEE IS SUBJECT TO THE ICC UNIFORM RULES FOR
DEMAND GUARANTEES, ICC PUBLICATION NO. 758 (URDG 758).

THIS GUARANTEE IS NON-TRANSFERABLE.

THE GUARANTEE SHALL BECOME EFFECTIVE UPON ITS
AUTHENTICATED ISSUANCE BY THE ISSUING BANK.`)}

:31E:${expiryDate}

THIS GUARANTEE SHALL EXPIRE AT THE COUNTERS OF THE
ISSUING BANK ON ${expiryDate}. ANY DEMAND MUST BE
RECEIVED BY THE ISSUING BANK ON OR BEFORE THE EXPIRY
DATE.

:72:
PLEASE ADVISE BENEFICIARY UPON AUTHENTICATION.
PLEASE CONFIRM RECEIPT THROUGH AUTHENTICATED SWIFT
CHANNELS.
-}
{5:{CHK:[BANK GENERATED CHECKSUM]}}`;
  },
};

export function generateDocumentContent(docType: string, trade?: Trade, buyerDetails?: PartyDetails, sellerDetails?: PartyDetails, productDetails?: ProductDetails): string {
  if (!Object.prototype.hasOwnProperty.call(templates, docType)) return "";
  const templateFn = templates[docType as keyof typeof templates];
  if (!templateFn) return "";
  const product = productDetails && (docType === "LOI" || docType === "FCO")
    ? { ...productDetails, specialNote: lpgPurposeForDocument(productDetails.specialNote || "", docType) }
    : productDetails;
  return templateFn(trade, buyerDetails, sellerDetails, product);
}
