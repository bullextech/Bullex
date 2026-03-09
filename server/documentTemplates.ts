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
⬛ ANNEX I – PRODUCT SPECIFICATION, QUALITY ADJUSTMENT & SAMPLING
${"═".repeat(70)}

Product: ${v(product?.commodity, trade?.commodity)}
Grade: ${v(product?.qualitySpecs?.split("\\n")?.[0], "_______________")}

The product supplied under this Contract shall comply with the
following specifications. Guaranteed specifications represent binding
commitments by the Seller. Typical specifications are provided for
reference only and shall not constitute contractual guarantees.

PRODUCT SPECIFICATION
${"─".repeat(70)}
 Parameter          │ Guaranteed Specification │ Typical Specification │ Rejection Limit
${"─".repeat(70)}
${product?.annexSpecs?.trim() || ` Moisture           │ -             │ -             │ -
 Ash                │ -             │ -             │ -
 Volatile Matter    │ -             │ -             │ -
 Fixed Carbon       │ -             │ -             │ -
 Sulphur            │ -             │ -             │ -
 Calorific Value    │ -             │ -             │ -
 Size Distribution  │ -             │ -             │ -`}
${"─".repeat(70)}


QUALITY PREMIUMS AND PENALTIES
${"─".repeat(70)}
${product?.qualityPremiums?.trim() || "To be agreed between Buyer and Seller."}
${"─".repeat(70)}


SAMPLING PROCEDURE
Sampling shall be conducted during loading at the loading port
following internationally recognized standards for sampling.
Incremental samples shall be taken systematically and combined into
representative composite samples. Sampling and sealing procedures
shall be supervised and certified by the independent inspection
company.

QUALITY DETERMINATION
All quality determinations shall be performed by an internationally
recognized inspection company such as ${agency}
at the loading port. The inspection certificate issued at the loading
port shall be final and binding for both Parties.

SAMPLE RETENTION
One representative sealed sample shall be retained by the inspection
company for ninety (90) days for reference in case of dispute.

MOISTURE DETERMINATION
Moisture content shall be determined at the loading port based on
laboratory analysis of representative composite samples. The moisture
value determined at the loading port shall be the contractual moisture
value for the cargo. Any determination at the discharge port shall be
for reference only and shall not affect commercial settlement.

QUANTITY AND WEIGHT DETERMINATION
The quantity of the cargo shall be determined at the loading port by
draft survey conducted by an independent inspection company such as
${agency}.
The draft survey certificate issued at the loading port shall
determine the official shipped quantity and shall be final and binding
for both Parties.
The quantity stated in the Bill of Lading and confirmed by the draft
survey certificate shall be the contractual quantity for invoicing and
settlement purposes.
${product?.specialNote ? `\n\nSPECIAL NOTES\n${product.specialNote}` : ""}
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

  SPA: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => `SALES & PURCHASE AGREEMENT (SPA)
${"=".repeat(40)}

Date: ${today()}
Agreement Reference: ${trade?.tradeRef || "_______________"}

PARTIES
${sellerBlock(seller, trade)}
(hereinafter referred to as "Seller")

${buyerBlock(buyer, trade)}
(hereinafter referred to as "Buyer")

RECITALS
WHEREAS the Seller desires to sell and the Buyer desires to purchase the commodity described herein under the terms and conditions set forth in this Agreement.

ARTICLE 1 — COMMODITY
${tradeBlock(trade, buyer, seller, product)}

${qualityBlock(product)}

ARTICLE 2 — PRICE AND PAYMENT
${paymentBlock(product)}

ARTICLE 3 — DELIVERY
${deliveryBlock(trade, product)}

ARTICLE 4 — ${inspectionBlock(product)}

ARTICLE 5 — DOCUMENTATION
The Seller shall provide the following documents:
a) Full set of Bills of Lading (3/3)
b) Certificate of Origin
c) Certificate of Analysis / Quality
d) Certificate of Weight
e) Commercial Invoice
f) Packing List
g) Insurance Certificate (if CIF)

ARTICLE 6 — FORCE MAJEURE
Neither party shall be liable for failure to perform due to circumstances beyond their reasonable control, including but not limited to acts of God, war, government sanctions, or natural disasters.

ARTICLE 7 — ARBITRATION
All disputes arising from this Agreement shall be settled by arbitration under ICC Rules in London, England.

ARTICLE 8 — GOVERNING LAW
This Agreement shall be governed by English Law.
${specialNoteBlock(product)}

SELLER
Name: _______________
Title: _______________
Company: ${v(seller?.name, trade?.sellerName)}
Date: ${today()}
Signature: _______________

BUYER
Name: _______________
Title: _______________
Company: ${v(buyer?.name, trade?.buyerName)}
Date: ${today()}
Signature: _______________`,

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
  ${trade?.tradeRef || "_______________"} , ${today()}

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
 08      │ Commodity                   │ ${v(product?.qualitySpecs)}
         │ Specifications              │
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


For & On Behalf of
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
Port of Loading: ${v(product?.loadingPort, trade?.loadingPort)}
Port of Discharge: ${v(product?.dischargePort, trade?.dischargePort)}
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
};

export function generateDocumentContent(docType: string, trade?: Trade, buyerDetails?: PartyDetails, sellerDetails?: PartyDetails, productDetails?: ProductDetails): string {
  const templateFn = templates[docType];
  if (!templateFn) return "";
  return templateFn(trade, buyerDetails, sellerDetails, productDetails);
}
