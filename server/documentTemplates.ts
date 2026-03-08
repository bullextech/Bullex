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

  SCO: (trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails) => `SOFT CORPORATE OFFER (SCO)
${"=".repeat(40)}

Date: ${today()}
Reference: ${trade?.tradeRef || "_______________"}
Status: DRAFT — Subject to Seller's Final Confirmation

PREAMBLE
We, the undersigned, hereby present this Soft Corporate Offer for the supply of the commodity described below. This SCO is issued in good faith and is subject to the Seller's final confirmation upon receipt of the Buyer's Irrevocable Corporate Purchase Order (ICPO).

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

TERMS & CONDITIONS
1. This Soft Corporate Offer is valid for a period of seven (7) working days from the date of issuance.
2. The Buyer shall respond with an ICPO within the validity period.
3. Upon receipt of ICPO, the Seller shall issue a Full Corporate Offer (FCO).
4. All terms are subject to final negotiation and execution of a Sales & Purchase Agreement (SPA).
5. This SCO does not constitute a binding contract.
${specialNoteBlock(product)}

AUTHORISED SIGNATORY
Name: _______________
Title: _______________
Company: ${v(seller?.name, trade?.sellerName)}
Date: ${today()}
Signature: _______________`,

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
    const validityDate = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    })();
    return `PURCHASE LETTER OF INTENT
${"=".repeat(50)}

┌─────────────────────────────────────────────────────────────────────┐
│  Issued to Seller                                                   │
│  ${v(seller?.name, trade?.sellerName).padEnd(65)}│
│  ${v(seller?.address).padEnd(65)}│
│  Attention (PIC)                                                    │
│  ${v(seller?.contact).padEnd(65)}│
├─────────────────────────────────────────────────────────────────────┤
│  LOI Issue No. and Date                                             │
│  ${(trade?.tradeRef || "_______________").padEnd(20)} ${today().padEnd(44)}│
│  Valid Till                                                         │
│  ${(validityDate + " (2000HRS Dubai Time)").padEnd(65)}│
│  Purchase Incoterms                                                 │
│  ${v(product?.incoterm, trade?.incoterm).padEnd(65)}│
├─────────────────────────────────────────────────────────────────────┤
│  Issued by Buyer                                                    │
│  ${v(buyer?.name, trade?.buyerName).padEnd(65)}│
│  ${v(buyer?.address).padEnd(65)}│
│  Attention (PIC)                                                    │
│  ${v(buyer?.contact).padEnd(65)}│
└─────────────────────────────────────────────────────────────────────┘

${"─".repeat(70)}
 Sr. No.  │  Parameters                │  Details
${"─".repeat(70)}
 01       │  Commodity                 │  ${v(product?.commodity, trade?.commodity)}
${"─".repeat(70)}
 02       │  Origin                    │  ${v(product?.origin, trade?.origin)}
${"─".repeat(70)}
 03       │  Quantity                  │  ${v(product?.quantity, trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : undefined)}
${"─".repeat(70)}
 04       │  Incoterms Terms           │  ${v(product?.incoterm, trade?.incoterm)}
${"─".repeat(70)}
 05       │  Delivery Period           │  ${v(product?.laycan)}
${"─".repeat(70)}
 06       │  Price                     │  ${cur} ${v(product?.price, trade ? trade.pricePerUnit.toLocaleString() : undefined)} per MT
${"─".repeat(70)}
 07       │  Contract Confirmation     │  Subject to Producer's Confirmation of cargo
${"─".repeat(70)}
 08       │  Commodity Specifications  │  ${product?.qualitySpecs?.trim() || "As per industry standard specifications"}
${"─".repeat(70)}
 09       │  Payment Terms             │  ${product?.paymentTerms?.trim() || "By DLC against 2% Performance Bond"}
${"─".repeat(70)}
 10       │  Documents for Payment     │  Seller's export permit, and 3 copies
          │                            │  Commercial Invoice, 3 Original and 3 copies
          │                            │  Packing List, 3 originals and 3 copies
          │                            │  Certificate of Origin, 3 originals and 3 copies
          │                            │  Assay Report, 3 Original and 3 copies
          │                            │  Certificate of quantity and quality issued by
          │                            │  an international independent surveyor such as
          │                            │  ${v(product?.analysisAgency, "SGS / Bureau Veritas")}
          │                            │  at loading port, 3 original and 3 copies
          │                            │  Certificate of quantity and quality at discharge
          │                            │  port, 3 original and 3 copies
          │                            │  Container Stuffing report at loading port
          │                            │  Certificate of Movement (product is clean and
          │                            │  free from any lien/encumbrance), 3 original and
          │                            │  3 copies
          │                            │  Insurance Policy of 110% of invoice value issued
          │                            │  by first class insurance company
${"─".repeat(70)}
 11       │  Other Terms & Conditions  │  For DLC, after signing of SPA, Seller must
          │                            │  arrange RWA by MT199 from LC receiving bank
          │                            │  indicating their readiness to accept LC and
          │                            │  issue performance bond 2% of the value of DLC
          │                            │  within 2 working days from the receipt of DLC.
${"─".repeat(70)}
 12       │  Compliance                │  Seller must send KYC documents to
          │                            │  compliance@bullfrog.ae upon signing of SPA
          │                            │  but before issuance of DLC.
${"─".repeat(70)}
${product?.specialNote ? `\nSPECIAL NOTES\n${product.specialNote}\n` : ""}

We look forward to hearing from you within the stipulated LOI Validity
and look forward to a long term and mutually fruitful association.

With warm regards,

For & On Behalf of
${v(buyer?.name, trade?.buyerName)}

AUTHORISED SIGNATORY
Name: ${v(buyer?.contact)}
Title: _______________
Date: ${today()}
Signature: _______________`;
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
};

export function generateDocumentContent(docType: string, trade?: Trade, buyerDetails?: PartyDetails, sellerDetails?: PartyDetails, productDetails?: ProductDetails): string {
  const templateFn = templates[docType];
  if (!templateFn) return "";
  return templateFn(trade, buyerDetails, sellerDetails, productDetails);
}
