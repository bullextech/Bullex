import type { Trade } from "@shared/schema";

const today = () => new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

function tradeBlock(trade?: Trade): string {
  if (!trade) return `[Commodity]: _______________
[Quantity]: _______________
[Unit Price]: _______________
[Total Value]: _______________
[Currency]: _______________
[Origin]: _______________
[Destination]: _______________
[Incoterm]: _______________
[Buyer]: _______________
[Seller]: _______________`;

  return `Commodity: ${trade.commodity}
Quantity: ${trade.quantity.toLocaleString()} ${trade.unit}
Unit Price: ${trade.currency} ${trade.pricePerUnit.toLocaleString()}
Total Value: ${trade.currency} ${trade.totalValue.toLocaleString()}
Currency: ${trade.currency}
Origin: ${trade.origin}
Destination: ${trade.destination}
Incoterm: ${trade.incoterm}
Buyer: ${trade.buyerName}
Seller: ${trade.sellerName}`;
}

const templates: Record<string, (trade?: Trade) => string> = {

  SCO: (trade?: Trade) => `SOFT CORPORATE OFFER (SCO)
${"=".repeat(40)}

Date: ${today()}
Reference: ${trade?.tradeRef || "_______________"}
Status: DRAFT — Subject to Seller's Final Confirmation

PREAMBLE
We, the undersigned, hereby present this Soft Corporate Offer for the supply of the commodity described below. This SCO is issued in good faith and is subject to the Seller's final confirmation upon receipt of the Buyer's Irrevocable Corporate Purchase Order (ICPO).

COMMODITY DETAILS
${tradeBlock(trade)}

TERMS & CONDITIONS
1. This Soft Corporate Offer is valid for a period of seven (7) working days from the date of issuance.
2. The Buyer shall respond with an ICPO within the validity period.
3. Upon receipt of ICPO, the Seller shall issue a Full Corporate Offer (FCO).
4. All terms are subject to final negotiation and execution of a Sales & Purchase Agreement (SPA).
5. This SCO does not constitute a binding contract.

BANKING DETAILS
Bank Name: _______________
Account Name: _______________
SWIFT/BIC: _______________

AUTHORISED SIGNATORY
Name: _______________
Title: _______________
Company: _______________
Date: ${today()}
Signature: _______________`,

  FCO: (trade?: Trade) => `FULL CORPORATE OFFER (FCO)
${"=".repeat(40)}

Date: ${today()}
Reference: ${trade?.tradeRef || "_______________"}
Status: IRREVOCABLE — Binding upon Buyer's acceptance

PREAMBLE
We, the undersigned, hereby confirm and present this Full Corporate Offer for the supply of the commodity described below. This FCO is irrevocable and binding upon acceptance by the Buyer within the stipulated validity period.

COMMODITY DETAILS
${tradeBlock(trade)}

DELIVERY TERMS
Shipment Period: Within _____ days from LC issuance
Loading Port: ${trade?.origin || "_______________"}
Discharge Port: ${trade?.destination || "_______________"}
Delivery Terms: ${trade?.incoterm || "_______________"}

PAYMENT TERMS
Payment Method: Irrevocable, Transferable, Confirmed Documentary Letter of Credit (DLC)
LC Issuing Bank: Top 25 World Bank
LC Validity: _____ days
Performance Bond: 2% of contract value

INSPECTION
Pre-shipment inspection by SGS/Bureau Veritas at loading port at Seller's cost.
Discharge inspection at Buyer's cost.

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

AUTHORISED SIGNATORY
Name: _______________
Title: _______________
Company: _______________
Date: ${today()}
Signature: _______________`,

  ICPO: (trade?: Trade) => `IRREVOCABLE CORPORATE PURCHASE ORDER (ICPO)
${"=".repeat(40)}

Date: ${today()}
Reference: ${trade?.tradeRef || "_______________"}
Status: IRREVOCABLE

PREAMBLE
We, the undersigned Buyer, hereby issue this Irrevocable Corporate Purchase Order to purchase the commodity described below, under the terms and conditions set forth herein.

COMMODITY DETAILS
${tradeBlock(trade)}

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
Bank Name: _______________
Account Name: _______________
SWIFT/BIC: _______________
Bank Officer: _______________
Bank Officer Email: _______________

AUTHORISED SIGNATORY
Name: _______________
Title: _______________
Company: ${trade?.buyerName || "_______________"}
Date: ${today()}
Signature: _______________`,

  SPA: (trade?: Trade) => `SALES & PURCHASE AGREEMENT (SPA)
${"=".repeat(40)}

Date: ${today()}
Agreement Reference: ${trade?.tradeRef || "_______________"}

PARTIES
Seller: ${trade?.sellerName || "_______________"} (hereinafter referred to as "Seller")
Buyer: ${trade?.buyerName || "_______________"} (hereinafter referred to as "Buyer")

RECITALS
WHEREAS the Seller desires to sell and the Buyer desires to purchase the commodity described herein under the terms and conditions set forth in this Agreement.

ARTICLE 1 — COMMODITY
${tradeBlock(trade)}

ARTICLE 2 — PRICE AND PAYMENT
2.1 The total contract value is ${trade ? `${trade.currency} ${trade.totalValue.toLocaleString()}` : "_______________"}.
2.2 Payment shall be made by Irrevocable, Transferable, Confirmed Documentary Letter of Credit (DLC).
2.3 The LC shall be issued within _____ banking days of signing this Agreement.
2.4 The LC shall be issued by a Top 25 World Bank.

ARTICLE 3 — DELIVERY
3.1 Shipment shall commence within _____ days from LC issuance.
3.2 Loading Port: ${trade?.origin || "_______________"}
3.3 Discharge Port: ${trade?.destination || "_______________"}
3.4 Delivery Terms: ${trade?.incoterm || "_______________"}

ARTICLE 4 — INSPECTION
4.1 Pre-shipment inspection by SGS / Bureau Veritas at the loading port.
4.2 Inspection costs at loading port: Seller's account.
4.3 Inspection costs at discharge port: Buyer's account.

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

SELLER
Name: _______________
Title: _______________
Company: ${trade?.sellerName || "_______________"}
Date: ${today()}
Signature: _______________

BUYER
Name: _______________
Title: _______________
Company: ${trade?.buyerName || "_______________"}
Date: ${today()}
Signature: _______________`,

  LOI: (trade?: Trade) => `LETTER OF INTENT (LOI)
${"=".repeat(40)}

Date: ${today()}
Reference: ${trade?.tradeRef || "_______________"}

TO: ${trade?.sellerName || "_______________"}
FROM: ${trade?.buyerName || "_______________"}

SUBJECT: Letter of Intent to Purchase ${trade?.commodity || "_______________"}

Dear Sir/Madam,

We hereby express our firm intention and interest to purchase the commodity described below under the terms and conditions outlined herein.

COMMODITY DETAILS
${tradeBlock(trade)}

INTENT
1. We confirm our genuine interest, readiness, willingness, and financial ability to purchase the above commodity.
2. This LOI serves as a preliminary expression of intent and shall be followed by the issuance of an ICPO within _____ working days.
3. Upon Seller's acceptance, we request a Soft Corporate Offer (SCO) or Full Corporate Offer (FCO).

BUYER'S CONFIRMATION
We confirm that:
a) We are a duly registered and authorised company.
b) We have the financial capacity to complete this transaction.
c) Our banking institution is ready to issue an LC upon execution of the SPA.

BANKING REFERENCE
Bank Name: _______________
Account Name: _______________
SWIFT/BIC: _______________
Bank Officer: _______________

VALIDITY
This Letter of Intent is valid for ten (10) working days from the date of issuance.

AUTHORISED SIGNATORY
Name: _______________
Title: _______________
Company: ${trade?.buyerName || "_______________"}
Date: ${today()}
Signature: _______________`,

  POP: (trade?: Trade) => `PROOF OF PRODUCT (POP)
${"=".repeat(40)}

Date: ${today()}
Reference: ${trade?.tradeRef || "_______________"}

PREAMBLE
This document serves as Proof of Product confirming the availability and existence of the commodity described below. The Seller warrants the authenticity of all information provided herein.

COMMODITY DETAILS
${tradeBlock(trade)}

PRODUCT SPECIFICATIONS
Grade/Quality: _______________
Chemical Composition: _______________
Moisture Content: _______________
Packaging: _______________

SUPPORTING EVIDENCE
The following documents are provided as proof of product:
☐ SGS / Bureau Veritas Inspection Report
☐ Mine/Refinery Certificate of Production
☐ Warehouse Receipt / Stock Report
☐ Recent Certificate of Analysis (COA)
☐ Photographs of Product at Source
☐ Export Licence (if applicable)

STORAGE LOCATION
Warehouse/Mine: _______________
Location: ${trade?.origin || "_______________"}
Available Quantity: ${trade ? `${trade.quantity.toLocaleString()} ${trade.unit}` : "_______________"}

SELLER'S WARRANTY
The Seller hereby warrants that:
1. The product exists and is available for immediate sale.
2. The product meets the stated specifications.
3. The Seller has legal title and authority to sell.
4. All export permits and licences are in order.

AUTHORISED SIGNATORY
Name: _______________
Title: _______________
Company: ${trade?.sellerName || "_______________"}
Date: ${today()}
Signature: _______________`,

  POF: (trade?: Trade) => `PROOF OF FUNDS (POF)
${"=".repeat(40)}

Date: ${today()}
Reference: ${trade?.tradeRef || "_______________"}

PREAMBLE
This document serves as Proof of Funds confirming the financial capacity of the Buyer to complete the transaction described below. The Buyer warrants that all financial information provided herein is accurate and verifiable.

TRANSACTION DETAILS
${tradeBlock(trade)}

FINANCIAL CONFIRMATION
The Buyer hereby confirms:
1. Availability of funds in the amount of ${trade ? `${trade.currency} ${trade.totalValue.toLocaleString()}` : "_______________"} or equivalent.
2. The funds are clean, clear, and of non-criminal origin.
3. The funds are held in a reputable banking institution.
4. The Buyer is authorised to utilise said funds for this transaction.

BANKING DETAILS
Bank Name: _______________
Account Holder: _______________
Account Number: _______________
SWIFT/BIC: _______________
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

AUTHORISED SIGNATORY
Name: _______________
Title: _______________
Company: ${trade?.buyerName || "_______________"}
Date: ${today()}
Signature: _______________`,

  BCL: (trade?: Trade) => `BANK COMFORT LETTER (BCL)
${"=".repeat(40)}

Date: ${today()}
Reference: ${trade?.tradeRef || "_______________"}

TO WHOM IT MAY CONCERN

RE: Bank Comfort Letter for ${trade?.buyerName || "_______________"}

Dear Sir/Madam,

We, the undersigned banking institution, hereby confirm the following with respect to our client named below:

CLIENT DETAILS
Client Name: ${trade?.buyerName || "_______________"}
Account Number: _______________
Account Type: _______________
Relationship Since: _______________

TRANSACTION REFERENCE
${tradeBlock(trade)}

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

export function generateDocumentContent(docType: string, trade?: Trade): string {
  const templateFn = templates[docType];
  if (!templateFn) return "";
  return templateFn(trade);
}
