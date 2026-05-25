import type { Trade } from "@shared/schema";

export interface PartyDetails {
  name?: string;
  address?: string;
  contact?: string;
  bank?: string;
  swift?: string;
}

export interface ProductDetails {
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
}

const today = () => new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
const v = (val?: string, fallback = "_______________") => val?.trim() || fallback;

function tradeBlock(trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails): string {
  const cur = product?.currency || trade?.currency || "USD";
  return `Commodity: ${v(product?.commodity, trade?.commodity)}
Quantity: ${v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined)}
Origin: ${v(product?.origin, trade?.origin)}
Unit Price: ${cur} ${v(product?.price, trade ? trade.pricePerUnit.toLocaleString() : undefined)}
Currency: ${cur}
Incoterm: ${v(product?.incoterm, trade?.incoterm)}
Buyer: ${v(buyer?.name, trade?.buyerName)}
Seller: ${v(seller?.name, trade?.sellerName)}`;
}

function qualityBlock(product?: ProductDetails): string {
  if (!product?.qualitySpecs) return `Quality Specifications: _______________`;
  return `Quality Specifications:\n${product.qualitySpecs}`;
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
  const agencyName = agency || "SGS / Bureau Veritas";
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
SWIFT/BIC: ${v(buyer?.swift)}`;
}

function sellerBlock(seller?: PartyDetails, trade?: Trade): string {
  return `SELLER DETAILS
Company: ${v(seller?.name, trade?.sellerName)}
Address: ${v(seller?.address)}
Contact: ${v(seller?.contact)}
Bank: ${v(seller?.bank)}
SWIFT/BIC: ${v(seller?.swift)}`;
}

const templates: Record<string, (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => string> = {

  SCO: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const cur = product?.currency || trade?.currency || "USD";
    return `SOFT CORPORATE OFFER (SCO)
${"=".repeat(50)}

Date: ${today()}
Reference: ${trade?.tradeRef || "_______________"}

TO:
Company: ${v(buyer?.name, trade?.buyerName)}
Address: ${v(buyer?.address)}
Attention: ${v(buyer?.contact)}

FROM (SELLER):
Company: ${v(seller?.name, trade?.sellerName)}
Address: ${v(seller?.address)}
Attention: ${v(seller?.contact)}

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
07  │ Quality Specifications      │ ${v(product?.qualitySpecs)}
08  │ Payment Terms               │ ${v(product?.paymentTerms)}
09  │ Inspection                  │ ${v(product?.analysisAgency, "SGS, Intertek or Bureau Veritas")}

${"─".repeat(50)}

This offer is valid for acceptance within seven (7) calendar days from the date of issuance.

Upon acceptance of this SCO by the Buyer, both parties agree to proceed with the preparation and execution of a Deal Recap followed by a Sales & Purchase Agreement (SPA).

${"─".repeat(50)}

AUTHORISED SIGNATORY
For and on behalf of: ${v(seller?.name, trade?.sellerName)}
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
${"─".repeat(70)}
 Buyer                         │ ${v(buyer?.name, trade?.buyerName)}
${"─".repeat(70)}
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
 Quality / Specification       │ ${product?.qualitySpecs?.trim() || "As per Annex 1 – Product Specifications"}
${"─".repeat(70)}
 Delivery Basis                │ ${v(product?.deliveryBasis, product?.incoterm || trade?.incoterm)}
${"─".repeat(70)}
 Contractual Quantity          │ ${v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined)}
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
${v(seller?.name, trade?.sellerName).padEnd(42)}${v(buyer?.name, trade?.buyerName)}

Name: ${v(seller?.contact).padEnd(36)}Name: ${v(buyer?.contact)}
Authorised Signatory: _______________     Authorised Signatory: _______________
Title: _______________                    Title: _______________
Date: ${today().padEnd(37)}Date: ${today()}

Signature & Stamp:                        Signature & Stamp:




${"═".repeat(70)}
⬛ ANNEXURE I – COMMODITY SPECIFICATIONS
${"═".repeat(70)}

${"═".repeat(70)}
 Sr. No. │ Parameters                  │ Details
${"═".repeat(70)}
 08      │ Commodity                   │ ${v(product?.qualitySpecs)}
         │ Specifications              │
${"═".repeat(70)}
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

VALIDITY
This FCO is valid for five (5) working days from the date of issuance.
${specialNoteBlock(product)}

AUTHORISED SIGNATORY
Name: _______________
Title: _______________
Company: ${v(seller?.name, trade?.sellerName)}
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

${qualityBlock(product)}

DELIVERY TERMS
${deliveryBlock(trade, product)}

PAYMENT TERMS
${paymentBlock(product)}

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
Company: ${v(buyer?.name, trade?.buyerName)}
Date: ${today()}
Signature: _______________`,

  SPA: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
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
    const qualitySpecs = v(product?.qualitySpecs);
    const laycan = v(product?.laycan);
    const sName = v(seller?.name, trade?.sellerName);
    const sAddr = v(seller?.address);
    const sPic = v(seller?.contact);
    const bName = v(buyer?.name, trade?.buyerName);
    const bAddr = v(buyer?.address);
    const bPic = v(buyer?.contact);
    const sellerBankName = v(seller?.bank);
    const sellerSwift = v(seller?.swift);
    const buyerBankName = v(buyer?.bank);
    const buyerSwift = v(buyer?.swift);
    const govLaw = v(product?.governingLaw, "Dubai, UAE");
    const arbitration = v(product?.governingLaw, "Dubai International Arbitration Centre (DIAC)");

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
Email: ${seller?.contact || "_______________"}

(hereinafter referred to as the Seller, which expression unless repugnant to the context shall mean and include its permitted assigns, successors, representatives, administrators and executors)

BUYER
Name of Company: ${bName}
Address: ${bAddr}
PIC: ${bPic}
Email: ${buyer?.contact || "_______________"}

(hereinafter referred to as the Buyer, which expression unless repugnant to the context shall mean and include its permitted assigns, successors, representatives, administrators and executors)

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
Specifications: ${qualitySpecs}

Article 4. Quantity
Total: ${quantity} Metric Tons per month (+/- 10% Buyers option)

Article 5. Price
Contract Price: ${cur} ${price} per Metric Ton on ${incoterm} basis.

Article 6. Origin and Delivery
6.1 Origin: ${origin}
6.2 Port of Loading: ${loadingPort}
6.3 Port of Discharge: ${dischargePort}

Article 7. Packing
Commodity shall be packed and marked in accordance with internationally accepted norms and standards applicable to the commodity.

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
17.1.7 Packing List.

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
25.11 Persons signing Contract: Each person who signs this Contract on behalf of a Party warrants that they are duly authorized by that Party to do so and that they bind that Party by their actions.

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
  ${v(seller?.contact)}

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
  ${v(buyer?.contact)}


${"═".repeat(70)}
 Sr. No. │ Parameters                  │ Details
${"═".repeat(70)}
 01      │ Commodity                   │ ${v(product?.commodity, trade?.commodity)}
${"─".repeat(70)}
 02      │ Origin                      │ ${v(product?.origin, trade?.origin)}
${"─".repeat(70)}
 03      │ Quantity                    │ ${v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined)}
${"─".repeat(70)}
 04      │ Incoterms Terms             │ ${v(product?.incoterm, trade?.incoterm)}
${"─".repeat(70)}
 05      │ Delivery period             │ ${v(product?.laycan)}
${"─".repeat(70)}
 06      │ Price                       │ ${cur} ${v(product?.price, trade ? trade.pricePerUnit.toLocaleString() : undefined)}
${"─".repeat(70)}
 07      │ Contract Confirmation       │ ${v(product?.contractConfirmation, "Subject to Producer's Confirmation of cargo")}
${"─".repeat(70)}
${(() => {
  const specs = (product?.qualitySpecs || "").trim();
  if (!specs) {
    return ` 08      │ Commodity                   │ _______________\n         │ Specifications              │`;
  }
  const lines = specs.split("\n").map(l => l.trim()).filter(Boolean);
  const out: string[] = [];
  out.push(` 08      │ Commodity                   │ ${lines[0] || ""}`);
  out.push(`         │ Specifications              │${lines[1] ? " " + lines[1] : ""}`);
  for (let i = 2; i < lines.length; i++) {
    out.push(`         │                             │ ${lines[i]}`);
  }
  return out.join("\n");
})()}
${"─".repeat(70)}
 09      │ Payment Terms               │ ${v(product?.paymentTerms, "By DLC against 2% Performance Bond")}
${"─".repeat(70)}
 10      │ Documents for Payment       │ ${v(product?.docsForPayment)}
${"─".repeat(70)}
 11      │ Other terms & conditions    │ ${v(product?.otherTerms)}
${"─".repeat(70)}
 12      │ Compliance                  │ ${v(product?.compliance)}
${"═".repeat(70)}
${product?.specialNote ? `\nSPECIAL NOTES\n${product.specialNote}\n` : ""}


We look forward to hearing from you within the stipulated LOI Validity
and look forward to a long term and mutually fruitful association.

With warm regards,
${v(buyer?.name, trade?.buyerName)}


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
${product?.qualitySpecs ? product.qualitySpecs : `Grade/Quality: _______________
Chemical Composition: _______________
Moisture Content: _______________
Packaging: _______________`}

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
Company: ${v(seller?.name, trade?.sellerName)}
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
Company: ${v(buyer?.name, trade?.buyerName)}
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

  NCNDA: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => {
    const partyA = v(seller?.name);
    const partyAAddress = v(seller?.address);
    const partyAContact = v(seller?.contact);
    const partyB = v(buyer?.name);
    const partyBAddress = v(buyer?.address);
    const partyBContact = v(buyer?.contact);
    const effectiveDate = product?.validity?.trim() || today();
    const governingLaw = product?.governingLaw?.trim() || "_______________";
    const jurisdiction = product?.recapValidity?.trim() || "_______________";
    const proposedTransaction = product?.commodity?.trim() || "Sale and Purchase of various metals, minerals and energy products as may be mutually agreed between the Parties in writing from time to time during the Term of this Agreement";
    return `MUTUAL NON-CIRCUMVENTION NON-DISCLOSURE AGREEMENT (NCNDA)
${"=".repeat(70)}

This Mutual Non-Circumvention Non-Disclosure Agreement ("Agreement") is made on ${effectiveDate} ("Effective Date") by and between,

1. ${partyA}, a company incorporated under the laws of ${governingLaw}, having its registered office at ${partyAAddress}, represented by its authorised signatory, ${partyAContact} (hereinafter referred to as "Party A", which expression, unless it be repugnant to the context or meaning thereof, shall be deemed to mean and include its successors and assigns) of the one part;

AND

2. ${partyB}, a company incorporated and registered under applicable laws, having its registered office at ${partyBAddress}, represented by its authorised signatory, ${partyBContact} (hereinafter referred to as "Party B", which expression shall, unless it be repugnant to the context or meaning thereof, mean and include its successors and permitted assigns) of the other part.

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
Contact: ${v(buyer?.contact)}

BENEFICIARY (SELLER)
Company: ${v(seller?.name, trade?.sellerName)}
Address: ${v(seller?.address)}
Contact: ${v(seller?.contact)}

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
};

export function generateDocumentContent(docType: string, trade?: Trade, buyerDetails?: PartyDetails, sellerDetails?: PartyDetails, productDetails?: ProductDetails): string {
  const templateFn = templates[docType];
  if (!templateFn) return "";
  return templateFn(trade, buyerDetails, sellerDetails, productDetails);
}
