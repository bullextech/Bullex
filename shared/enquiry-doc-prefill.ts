// Pure helpers shared by the enquiry → document-generator prefill paths.
//
// Two paths seed the generator from an approved enquiry:
//   1. Launch links (team portal / trade enquiries) encode enquiry fields as
//      `enq*` URL params — built by buildEnquiryDocParams().
//   2. The linked-enquiry effect in the generator treats the DB enquiry as
//      authoritative and overwrites URL-seeded values — field map built by
//      computeEnquiryPrefill(), merge semantics in mergeEnquiryPrefill().
//
// Keeping these pure (no React, no DB) lets server/__tests__ exercise them
// directly with node:test.

/** The subset of a TradeEnquiry the document prefill paths read. */
export interface EnquiryPrefillSource {
  enquiryRef: string;
  product?: string | null;
  quantity?: string | null;
  unit?: string | null;
  packing?: string | null;
  origin?: string | null;
  loadingPort?: string | null;
  dischargePort?: string | null;
  producer?: string | null;
  incoterms?: string | null;
  specifications?: string | null;
  deliveryPeriod?: string | null;
  validity?: string | null;
  price?: string | null;
  currency?: string | null;
  paymentTerms?: string | null;
  additionalInfo?: string | null;
  performanceBond?: string | null;
  compliance?: string | null;
  refPerson?: string | null;
  contractConfirmation?: string | null;
  docsForPayment?: string | null;
  otherTerms?: string | null;
  buyerName?: string | null;
  buyerAddress?: string | null;
  buyerContact?: string | null;
  sellerName?: string | null;
  sellerAddress?: string | null;
  sellerContact?: string | null;
  // Optional joint parties — a second company acting together with the
  // primary seller/buyer. Carried onto generated documents (LOI/FCO/SPA).
  coSellerName?: string | null;
  coSellerAddress?: string | null;
  coSellerContact?: string | null;
  coBuyerName?: string | null;
  coBuyerAddress?: string | null;
  coBuyerContact?: string | null;
  createdBy?: string | null;
  email?: string | null;
}

/**
 * The enquiry's Special Notes (additionalInfo) and Performance Bond both land
 * in the document's Special Notes block — LOI/FCO templates have no dedicated
 * performance-bond section, so dropping either here silently loses it.
 */
export function composeEnquirySpecialNote(
  additionalInfo?: string | null,
  performanceBond?: string | null,
): string {
  return [additionalInfo || "", performanceBond ? `Performance Bond: ${performanceBond}` : ""]
    .filter(Boolean)
    .join("\n");
}

/** Quantity + unit as shown in documents ("5000 MT"); empty when no quantity. */
export function formatEnquiryQuantity(quantity?: string | null, unit?: string | null): string {
  // Free-text quantities (including dual-grade LPG allocations) may already
  // contain units. Do not append a second unit after the entire narrative.
  if (quantity && quantity.split(/[^A-Za-z]+/).some(token => token.toUpperCase() === (unit || "MT").toUpperCase())) return quantity.trim();
  return quantity ? `${quantity} ${unit || "MT"}`.trim() : "";
}

/**
 * Build the `enq*` launch-link params for /documents?… links.
 * `originFallsBackToLoadingPort` preserves the trade-enquiries builder's
 * behaviour of seeding origin from the loading port when origin is blank.
 */
export function buildEnquiryDocParams(
  enquiry: EnquiryPrefillSource,
  docType: string,
  opts: { originFallsBackToLoadingPort?: boolean } = {},
): URLSearchParams {
  const origin = enquiry.origin || (opts.originFallsBackToLoadingPort ? enquiry.loadingPort : "") || "";
  return new URLSearchParams({
    enquiryRef: enquiry.enquiryRef,
    docType,
    enqProduct: enquiry.product || "",
    enqQuantity: formatEnquiryQuantity(enquiry.quantity, enquiry.unit),
    enqPacking: enquiry.packing || "",
    enqOrigin: origin,
    enqLoadingPort: enquiry.loadingPort || "",
    enqDischargePort: enquiry.dischargePort || "",
    enqProducer: enquiry.producer || "",
    enqIncoterm: enquiry.incoterms || "",
    enqSpecs: enquiry.specifications || "",
    enqDeliveryPeriod: enquiry.deliveryPeriod || "",
    enqValidity: enquiry.validity || "",
    enqPrice: enquiry.price || "",
    enqCurrency: enquiry.currency || "",
    enqPaymentTerms: enquiry.paymentTerms || "",
    enqContractConfirmation: enquiry.contractConfirmation || "",
    enqDocsForPayment: enquiry.docsForPayment || "",
    enqOtherTerms: enquiry.otherTerms || "",
    enqCompliance: enquiry.compliance || "",
    enqAdditionalInfo: enquiry.additionalInfo || "",
    enqPerformanceBond: enquiry.performanceBond || "",
    enqCreatedBy: enquiry.createdBy || "",
    enqEmail: enquiry.email || "",
    // Joint co-seller/co-buyer — each field gets its own enq* param so the
    // generator can seed them even when the DB enquiry cannot be fetched.
    enqCoSellerName: enquiry.coSellerName || "",
    enqCoSellerAddress: enquiry.coSellerAddress || "",
    enqCoSellerContact: enquiry.coSellerContact || "",
    enqCoBuyerName: enquiry.coBuyerName || "",
    enqCoBuyerAddress: enquiry.coBuyerAddress || "",
    enqCoBuyerContact: enquiry.coBuyerContact || "",
  });
}

/** Generator form fields the enquiry prefill paths populate. */
export interface EnquiryPrefillFields {
  commodity: string;
  origin: string;
  quantity: string;
  packing: string;
  qualitySpecs: string;
  loadingPort: string;
  dischargePort: string;
  laycan: string;
  price: string;
  currency: string;
  incoterm: string;
  paymentTerms: string;
  validity: string;
  refPerson: string;
  contractConfirmation: string;
  docsForPayment: string;
  otherTerms: string;
  specialNote: string;
  compliance: string;
  buyerName: string;
  buyerAddress: string;
  buyerContact: string;
  sellerName: string;
  sellerAddress: string;
  sellerContact: string;
  coBuyerName: string;
  coBuyerAddress: string;
  coBuyerContact: string;
  coSellerName: string;
  coSellerAddress: string;
  coSellerContact: string;
}

/**
 * Field map from the authoritative DB enquiry. Empty string means "the
 * enquiry has no value for this field" (so a URL-seeded value survives).
 */
export function computeEnquiryPrefill(e: EnquiryPrefillSource): EnquiryPrefillFields {
  return {
    commodity: e.product || "",
    origin: e.origin || "",
    quantity: formatEnquiryQuantity(e.quantity, e.unit),
    packing: e.packing || "",
    qualitySpecs: e.specifications || "",
    loadingPort: e.loadingPort || "",
    dischargePort: e.dischargePort || "",
    laycan: e.deliveryPeriod || "",
    price: e.price || "",
    currency: e.currency || "",
    incoterm: e.incoterms || "",
    paymentTerms: e.paymentTerms || "",
    validity: e.validity || "",
    refPerson: e.refPerson || "",
    contractConfirmation: e.contractConfirmation || "",
    docsForPayment: e.docsForPayment || "",
    otherTerms: e.otherTerms || "",
    specialNote: composeEnquirySpecialNote(e.additionalInfo, e.performanceBond),
    compliance: e.compliance || "",
    buyerName: e.buyerName || "",
    buyerAddress: e.buyerAddress || "",
    buyerContact: e.buyerContact || "",
    sellerName: e.sellerName || e.producer || "",
    sellerAddress: e.sellerAddress || "",
    sellerContact: e.sellerContact || "",
    coBuyerName: e.coBuyerName || "",
    coBuyerAddress: e.coBuyerAddress || "",
    coBuyerContact: e.coBuyerContact || "",
    coSellerName: e.coSellerName || "",
    coSellerAddress: e.coSellerAddress || "",
    coSellerContact: e.coSellerContact || "",
  };
}

/**
 * Merge semantics of the linked-enquiry effect: a non-empty DB value always
 * overrides whatever the URL seeded; blank DB values keep the seeded value.
 */
export function mergeEnquiryPrefill(
  urlSeeded: Partial<EnquiryPrefillFields>,
  dbPrefill: EnquiryPrefillFields,
): EnquiryPrefillFields {
  const out = {} as EnquiryPrefillFields;
  for (const key of Object.keys(dbPrefill) as (keyof EnquiryPrefillFields)[]) {
    out[key] = dbPrefill[key] || urlSeeded[key] || "";
  }
  return out;
}
