import type { Trade } from "@shared/schema";
import { LPG_STS_REFERENCE, LPG_STS_SAMPLE, LPG_STS_WARNINGS } from "@shared/lpg-sts";
import type { PartyDetails, ProductDetails } from "./documentTemplates";

const blank = "_______________";
const value = (...values: (string | null | undefined)[]) => values.find(v => v?.trim())?.trim() || blank;

export function renderLpgStsSpa(trade?: Trade, buyer?: PartyDetails, seller?: PartyDetails, product?: ProductDetails): string {
  const data = product?.lpgSts || {};
  if (data.sections && (data.sections.length !== 32 || data.sections.some(s => typeof s !== "string" || !s.trim()))) {
    throw new Error("LPG STS draft requires all 30 clauses and both annexures. Restore any empty section before generating.");
  }
  const fields: Record<string, string> = {
    reference: value(data.reference, product?.dealRecapNumber, trade?.tradeRef),
    issueDate: value(data.issueDate, product?.dateOfIssue, new Date().toISOString().slice(0, 10)),
    sellerName: value(seller?.name, trade?.sellerName),
    sellerBank: value(seller?.bank), sellerSwift: value(seller?.swift),
    sellerAddress: value(seller?.address), sellerContact: value(seller?.contact),
    buyerAddress: value(buyer?.address), buyerContact: value(buyer?.contact),
    buyerName: value(buyer?.name, trade?.buyerName),
    quantity: value(product?.quantity, trade ? `${trade.quantity} ${trade.unit || "MT"}` : undefined, LPG_STS_SAMPLE.quantity),
    origin: value(product?.origin, trade?.origin),
    producer: value(data.producer),
    dischargePort: value(product?.dischargePort, trade?.destination, LPG_STS_SAMPLE.dischargePort),
    laycan: value(product?.laycan),
    mainPremium: value(data.mainPremium ?? "70.00"),
    provisionalPremium: value(data.provisionalPremium ?? "50.00"),
  };
  const resolve = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (_, key) => fields[key] || blank);
  const sections = (data.sections || LPG_STS_REFERENCE).map(resolve);
  const party = (label: string, p: PartyDetails | undefined, name: string) => `${label}
Name of Company: ${name}
Address: ${value(p?.address)}
PIC: ${value(p?.pic, p?.contact)}
Email: ${value(p?.contact)}
(hereinafter referred to as the ${label.toLowerCase()})
${p?.coName ? `Co-${label === "BUYER" ? "Buyer" : "Seller"} Company: ${p.coName}\nCo-${label === "BUYER" ? "Buyer" : "Seller"} Address: ${value(p.coAddress)}\nCo-${label === "BUYER" ? "Buyer" : "Seller"} Contact: ${value(p.coContact)}` : ""}`;
  // Exact standard-SPA labels are the interface to PI / DLC / PBG derivation.
  return `SALES AND PURCHASE AGREEMENT (SPA)
LPG SPA — STS Basis
SPA No: ${fields.reference}
Date: ${fields.issueDate}

DRAFT REVIEW — SAMPLE TERMS, NOT APPROVED
${LPG_STS_WARNINGS.join("\n")}

${party("SELLER", seller, fields.sellerName)}
${party("BUYER", buyer, fields.buyerName)}

COMMERCIAL SUMMARY — read with the full clauses and annexures
Commodity: ${value(product?.commodity, trade?.commodity, LPG_STS_SAMPLE.commodity)}
Origin: ${fields.origin}
Total: ${fields.quantity}
Packing: ${value(product?.packing, "In bulk, fully segregated")}
Contract Price: ${product?.currency || "USD"} ${value(product?.price, `Saudi CP + ${fields.mainPremium}`)} per Metric Ton on ${value(product?.incoterm, LPG_STS_SAMPLE.incoterm)} basis.
Latest date of shipment: ${fields.laycan}
Port of Loading: ${value(product?.loadingPort)}
Port of Discharge: ${fields.dischargePort}
Payment Method: ${value(product?.paymentTerms, LPG_STS_SAMPLE.paymentTerms)}
Specifications:
Parameter | Specification
Product | ${value(product?.qualitySpecs, "See Annexure I — separate n-Butane and Propane specifications")}

The parties agree to one single shipment. No term commitment, exclusivity, volume obligation or renewal arises without a separate written agreement. Any incorporated offer must be expressly identified and agreed by the parties.

${sections.slice(0, 30).join("\n\n")}

SIGNATURES
For and on behalf of the Buyer / Issuer
Company: ${fields.buyerName}
AUTHORISED SIGNATORY
Name: _______________
Title: _______________
Date: _______________
Signature: _______________

For and on behalf of the Seller
Company: ${fields.sellerName}
Name: _______________
Title: _______________
Seller signature (manual) — _______________
Date: _______________

Witness for the Buyer
Name: _______________
Witness signature (manual) — _______________
Date: _______________
Witness for the Seller
Name: _______________
Witness signature (manual) — _______________
Date: _______________

${sections.slice(30).join("\n\n")}
${product?.specialNote ? `\nSPECIAL NOTES\n${product.specialNote}` : ""}`;
}