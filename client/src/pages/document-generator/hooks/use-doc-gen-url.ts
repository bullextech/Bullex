// URL / launch-parameter parsing for the document generator: trade & enquiry
// launch refs plus the enq* field seeds passed by the enquiry board / team
// portal "Generate Document" links.
export function useDocGenUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlTradeRef = urlParams.get("tradeRef");
  const urlEnquiryRef = urlParams.get("enquiryRef");
  const urlOpenDocId = urlParams.get("openDocId") || (typeof window !== "undefined" ? sessionStorage.getItem("openDocId") : null);
  const urlDocType = urlParams.get("docType");

  const urlEnqProduct = urlParams.get("enqProduct") || "";
  const urlEnqQuantity = urlParams.get("enqQuantity") || "";
  const urlEnqOrigin = urlParams.get("enqOrigin") || "";
  const urlEnqLoadingPort = urlParams.get("enqLoadingPort") || "";
  const urlEnqIncoterm = urlParams.get("enqIncoterm") || "";
  const urlEnqSpecs = urlParams.get("enqSpecs") || "";
  const urlEnqDeliveryPeriod = urlParams.get("enqDeliveryPeriod") || "";
  const urlEnqValidity = urlParams.get("enqValidity") || "";
  const urlEnqCreatedBy = urlParams.get("enqCreatedBy") || "";
  const urlEnqEmail = urlParams.get("enqEmail") || "";
  const urlEnqDischargePort = urlParams.get("enqDischargePort") || "";
  const urlEnqProducer = urlParams.get("enqProducer") || "";
  const urlEnqPacking = urlParams.get("enqPacking") || "";
  const urlEnqAdditionalInfo = urlParams.get("enqAdditionalInfo") || "";
  const urlEnqPerformanceBond = urlParams.get("enqPerformanceBond") || "";
  const urlEnqCoSellerName = urlParams.get("enqCoSellerName") || "";
  const urlEnqCoSellerAddress = urlParams.get("enqCoSellerAddress") || "";
  const urlEnqCoSellerContact = urlParams.get("enqCoSellerContact") || "";
  const urlEnqCoBuyerName = urlParams.get("enqCoBuyerName") || "";
  const urlEnqCoBuyerAddress = urlParams.get("enqCoBuyerAddress") || "";
  const urlEnqCoBuyerContact = urlParams.get("enqCoBuyerContact") || "";

  return {
    urlParams,
    urlTradeRef,
    urlEnquiryRef,
    urlOpenDocId,
    urlDocType,
    urlEnqProduct,
    urlEnqQuantity,
    urlEnqOrigin,
    urlEnqLoadingPort,
    urlEnqIncoterm,
    urlEnqSpecs,
    urlEnqDeliveryPeriod,
    urlEnqValidity,
    urlEnqCreatedBy,
    urlEnqEmail,
    urlEnqDischargePort,
    urlEnqProducer,
    urlEnqPacking,
    urlEnqAdditionalInfo,
    urlEnqPerformanceBond,
    urlEnqCoSellerName,
    urlEnqCoSellerAddress,
    urlEnqCoSellerContact,
    urlEnqCoBuyerName,
    urlEnqCoBuyerAddress,
    urlEnqCoBuyerContact,
  };
}

export type DocGenUrl = ReturnType<typeof useDocGenUrl>;
