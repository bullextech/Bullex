import {
ScrollText,
ShieldCheck,
Handshake,
Send,
ClipboardList,
FileSignature,
Landmark,
PackageCheck,
BadgeDollarSign,
Lock,
Ship,
FileCheck,
Package,
ListChecks,
ClipboardCheck,
} from "lucide-react";

export const docTypes = [
  { value: "LOI", label: "Purchase Letter of Intent", short: "LOI", description: "Buyer's formal expression of intent to purchase a commodity with full trade terms", icon: ScrollText },
  { value: "FCO", label: "Full Corporate Offer", short: "FCO", description: "Binding irrevocable offer with complete trade terms and conditions", icon: ShieldCheck },
  { value: "SCO", label: "Soft Corporate Offer", short: "SCO", description: "Seller's conditional offer issued in response to an accepted LOI", icon: Handshake },
  { value: "DEAL_RECAP", label: "Deal Recap", short: "Deal Recap", description: "Comprehensive summary of agreed trade terms between buyer and seller", icon: Send },
  { value: "ICPO", label: "Irrevocable Corporate Purchase Order", short: "ICPO", description: "Buyer's binding commitment to purchase the specified commodity", icon: ClipboardList },
  { value: "SPA", label: "Sales & Purchase Agreement", short: "SPA", description: "Standard SPA or LPG SPA — STS Basis: editable draft contract with legal review", icon: FileSignature },
  { value: "LC", label: "Letter of Credit", short: "LC", description: "Bank-issued payment guarantee for commodity trade settlement", icon: Landmark },
  { value: "POP", label: "Proof of Product", short: "POP", description: "Evidence confirming the availability and existence of the commodity", icon: PackageCheck },
  { value: "POF", label: "Proof of Funds", short: "POF", description: "Documentation verifying the buyer's financial capacity for the transaction", icon: BadgeDollarSign },
  { value: "BCL", label: "Bank Comfort Letter", short: "BCL", description: "Bank confirmation of client's financial standing and LC capability", icon: Handshake },
  { value: "NCNDA", label: "Non-Circumvention Non-Disclosure", short: "NCNDA", description: "Mutual agreement protecting confidential information and preventing circumvention of business relationships", icon: Lock },
  { value: "BL", label: "Bill of Lading", short: "BL", description: "CONGENBILL Edition 1994 — shipped-on-board bill of lading for charter party trades", icon: Ship },
  { value: "COO", label: "Certificate of Origin", short: "COO", description: "Certified declaration of the country of origin of the shipped goods, linked to the corresponding Bill of Lading", icon: FileCheck },
  { value: "COA", label: "Certificate of Quality", short: "COA", description: "Independent quality inspection certificate with chemical analysis, moisture content and physical size results, auto-filled from the corresponding LC", icon: FileCheck },
  { value: "COW", label: "Certificate of Weight", short: "COW", description: "Draft survey weight certificate issued at loading port confirming wet and dry metric tons, auto-filled from the corresponding LC", icon: FileCheck },
  { value: "CI", label: "Commercial Invoice", short: "CI", description: "Provisional commercial invoice showing seller/buyer details, shipment info, commodity quantity & price table, and total invoice value — auto-filled from the corresponding LC", icon: BadgeDollarSign },
  { value: "ICA", label: "International Commission Agreement", short: "ICA", description: "ICC-compliant master commission agreement between Principal and Agent/Broker/Facilitator, including Annexure A (IMFPA), Annexure B (NCNDA) and full AML/Compliance article", icon: FileSignature },
  { value: "CRC", label: "Conditional Release Certificate", short: "CRC", description: "Terminal/Tank Owner certificate confirming cargo held in storage is allocated exclusively to the Buyer, with conditional reservation, transfer of ownership, inspection rights, banking details and full governing clauses — released upon confirmed payment under the SPA", icon: PackageCheck },
  { value: "HC", label: "Holding Certificate", short: "HC", description: "Terminal/Tank Owner certificate confirming a petroleum product is held in storage on behalf of the Product Owner — terminal & product details, confirmation of holding, liens/encumbrance and custody undertakings, inspection rights, validity and disclaimer, with a Terminal Owner signature block", icon: Package },
  { value: "DTA", label: "Dip Test Authorization", short: "DTA", description: "Tank Owner authorization letter permitting the Buyer and its representatives to conduct a dip test, tank gauging, sampling and quantity verification of the cargo — addressed to Buyer with CC to terminal, seller and inspection company, covering product details, scope, joint inspection, conditions, cargo status and a Tank Owner signature block", icon: ClipboardList },
  // TFR is deliberately not offered as a manually generated document: a TFR
  // consolidates both legs of a matched deal, so it is only prepared via the
  // Deal Pipeline (deal matching).
  { value: "FOB_PROCEDURE", label: "FOB Procedure (EN590)", short: "FOB Proc", description: "Step-by-step FOB Tank/Terminal procedure for EN590 / AGO diesel, generated for either the Import (Buy) or Export (Sell) side — due diligence, SPA, proof of product, payment, dip test, title transfer and lifting, with full document checklists and critical precautions", icon: ClipboardCheck },
  { value: "DLC_MT700", label: "DLC Draft (SWIFT MT700)", short: "DLC MT700", description: "Draft Documentary Letter of Credit in SWIFT MT700 format for issuing bank review — irrevocable credit with applicant/beneficiary details, credit amount & tolerance, shipment terms, goods description (45A), required documents (46A), additional conditions (47A) and UCP 600 governance", icon: BadgeDollarSign },
  { value: "PBG_MT760", label: "Performance Guarantee Draft (SWIFT MT760)", short: "PBG MT760", description: "Draft Irrevocable Performance Bank Guarantee in SWIFT MT760 format for issuing bank review — demand guarantee (DGAR) under URDG 758 with applicant/beneficiary details, guarantee amount, underlying SPA reference, full guarantee undertaking text (77U) and expiry terms (31E)", icon: Lock },
];

export function getDocTypeLabel(docType: string): string {
  if (docType === "PI") return "Proforma Invoice";
  return docTypes.find((entry) => entry.value === docType)?.label || docType;
}
