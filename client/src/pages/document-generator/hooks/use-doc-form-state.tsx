import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { docTypes } from "../doc-types";
import { spaVariantPayload, type LpgStsData } from "@shared/lpg-sts";

// All per-document form field state for the generate dialog: the shared trade
// fields, the doc-family-specific fields (BL/COO/COA/CI/COW), the free-form
// TFR/FOB/DLC/PBG data maps with their small field renderers, the quality-spec
// row editor, plus resetForm and buildPayload.
export function useDocFormState({ urlTradeRef, urlEnquiryRef }: { urlTradeRef: string | null; urlEnquiryRef: string | null }) {
  const [selectedType, setSelectedType] = useState<typeof docTypes[0] | null>(null);
  const [title, setTitle] = useState("");
  const [spaVariant, setSpaVariant] = useState("standard");
  const [lpgSts, setLpgSts] = useState<LpgStsData>({});
  const [buyerName, setBuyerName] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [buyerBank, setBuyerBank] = useState("");
  const [buyerSwift, setBuyerSwift] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerAddress, setSellerAddress] = useState("");
  const [sellerContact, setSellerContact] = useState("");
  const [sellerBank, setSellerBank] = useState("");
  const [sellerSwift, setSellerSwift] = useState("");
  // Optional joint second companies acting together with the primary buyer/seller.
  const [coBuyerName, setCoBuyerName] = useState("");
  const [coBuyerAddress, setCoBuyerAddress] = useState("");
  const [coBuyerContact, setCoBuyerContact] = useState("");
  const [coSellerName, setCoSellerName] = useState("");
  const [coSellerAddress, setCoSellerAddress] = useState("");
  const [coSellerContact, setCoSellerContact] = useState("");
  const [commodity, setCommodity] = useState("");
  const [origin, setOrigin] = useState("");
  const [quantity, setQuantity] = useState("");
  const [qualitySpecs, setQualitySpecs] = useState("");
  const emptySpecRows = () => [
    { parameter: "", specification: "", rejection: "", testMethod: "" },
    { parameter: "", specification: "", rejection: "", testMethod: "" },
    { parameter: "", specification: "", rejection: "", testMethod: "" },
    { parameter: "", specification: "", rejection: "", testMethod: "" },
    { parameter: "", specification: "", rejection: "", testMethod: "" },
  ];
  const [specRows, setSpecRows] = useState(emptySpecRows());
  const serializeSpecRows = (rows: { parameter: string; specification: string; rejection: string; testMethod: string }[]) =>
    rows
      .filter(r => r.parameter || r.specification || r.rejection || r.testMethod)
      .map(r => `${r.parameter}: ${r.specification}${r.rejection ? ` (Rejection: ${r.rejection})` : ""}${r.testMethod ? ` [Method: ${r.testMethod}]` : ""}`)
      .join("\n");
  const parseSpecRows = (raw: string | null | undefined) => {
    const lines = (raw || "").split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return null;
    return lines.map((line) => {
      let testMethod = "";
      let rejection = "";
      let rest = line;
      const methodMatch = rest.match(/\[Method:\s*(.*?)\]\s*$/i);
      if (methodMatch && methodMatch.index !== undefined) {
        testMethod = (methodMatch[1] || "").trim();
        rest = rest.slice(0, methodMatch.index).trim();
      }
      const rejMatch = rest.match(/\(Rejection:\s*(.*?)\)\s*$/i);
      if (rejMatch && rejMatch.index !== undefined) {
        rejection = (rejMatch[1] || "").trim();
        rest = rest.slice(0, rejMatch.index).trim();
      }
      const colon = rest.indexOf(":");
      if (colon >= 0) {
        return { parameter: rest.slice(0, colon).trim(), specification: rest.slice(colon + 1).trim(), rejection, testMethod };
      }
      return { parameter: "", specification: rest, rejection, testMethod };
    });
  };
  const updateSpecRow = (idx: number, field: string, val: string) => {
    const updated = [...specRows];
    (updated[idx] as any)[field] = val;
    setSpecRows(updated);
    setQualitySpecs(serializeSpecRows(updated));
  };
  const addSpecRow = () => {
    setSpecRows([...specRows, { parameter: "", specification: "", rejection: "", testMethod: "" }]);
  };
  const removeSpecRow = (idx: number) => {
    if (specRows.length <= 1) return;
    const updated = specRows.filter((_, i) => i !== idx);
    setSpecRows(updated);
    setQualitySpecs(serializeSpecRows(updated));
  };
  const [loadingPort, setLoadingPort] = useState("");
  const [dischargePort, setDischargePort] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [incoterm, setIncoterm] = useState("");
  const [laycan, setLaycan] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [analysisAgency, setAnalysisAgency] = useState("");
  const [analysisAgencyContact, setAnalysisAgencyContact] = useState("");
  const [validity, setValidity] = useState("");
  const [refPerson, setRefPerson] = useState("");
  const [contractConfirmation, setContractConfirmation] = useState("");
  const [docsForPayment, setDocsForPayment] = useState("");
  const [otherTerms, setOtherTerms] = useState("");
  const [compliance, setCompliance] = useState("");
  const [recapValidity, setRecapValidity] = useState("");
  const [deliveryBasis, setDeliveryBasis] = useState("");
  const [loadingWindow, setLoadingWindow] = useState("");
  const [shippingTerms, setShippingTerms] = useState("");
  const [governingLaw, setGoverningLaw] = useState("");
  const [annexSpecs, setAnnexSpecs] = useState("");
  const [qualityPremiums, setQualityPremiums] = useState("");
  const [specialNote, setSpecialNote] = useState("");
  const [loiIssueNumber, setLoiIssueNumber] = useState("");
  const [blVesselName, setBlVesselName] = useState("");
  const [blNotifyParty, setBlNotifyParty] = useState("");
  const [blPacking, setBlPacking] = useState("");
  const [blCharterPartyDate, setBlCharterPartyDate] = useState("");
  const [blFreightAdvance, setBlFreightAdvance] = useState("");
  const [blLoadingTimeDays, setBlLoadingTimeDays] = useState("");
  const [blLoadingTimeHours, setBlLoadingTimeHours] = useState("");
  const [blPlaceOfIssue, setBlPlaceOfIssue] = useState("");
  const [blDateOfIssue, setBlDateOfIssue] = useState("");
  const [blCompanyOnBehalf, setBlCompanyOnBehalf] = useState("");
  const [blMasterOfVessel, setBlMasterOfVessel] = useState("");
  const [blAgentsName, setBlAgentsName] = useState("");
  const [cooLinkedBlId, setCooLinkedBlId] = useState("");
  const [cooCertNo, setCooCertNo] = useState("");
  const [coaLinkedLcId, setCoaLinkedLcId] = useState("");
  const [coaCertNo, setCoaCertNo] = useState("");
  const [coaVessel, setCoaVessel] = useState("");
  const [coaBlDate, setCoaBlDate] = useState("");
  const [coaInspPeriod, setCoaInspPeriod] = useState("");
  const [coaLoadPeriod, setCoaLoadPeriod] = useState("");
  const [coaChemSpecs, setCoaChemSpecs] = useState("");
  const [coaMoisture, setCoaMoisture] = useState("");
  const [coaPhysicalSizes, setCoaPhysicalSizes] = useState("");
  const [coaPacking, setCoaPacking] = useState("");
  const [ciLinkedLcId, setCiLinkedLcId] = useState("");
  const [ciInvoiceNo, setCiInvoiceNo] = useState("");
  const [ciVessel, setCiVessel] = useState("");
  const [ciVoyage, setCiVoyage] = useState("");
  const [ciBlNo, setCiBlNo] = useState("");
  const [ciBlDate, setCiBlDate] = useState("");
  const [ciLcNo, setCiLcNo] = useState("");
  const [ciLcBank, setCiLcBank] = useState("");
  const [ciTolerance, setCiTolerance] = useState("+/- 10%");
  const [ciTotalAmount, setCiTotalAmount] = useState("");
  // PI preparation reuses the Commercial Invoice form, with these additional
  // SPA-linked fields that do not exist on a standalone CI.
  const [piInvoiceDate, setPiInvoiceDate] = useState("");
  const [piSpaNumber, setPiSpaNumber] = useState("");
  const [piValidUntil, setPiValidUntil] = useState("");
  const [cowLinkedLcId, setCowLinkedLcId] = useState("");
  const [cowCertNo, setCowCertNo] = useState("");
  const [cowVessel, setCowVessel] = useState("");
  const [cowBlDate, setCowBlDate] = useState("");
  const [cowLoadPeriod, setCowLoadPeriod] = useState("");
  const [cowMoisture, setCowMoisture] = useState("");
  const [cowDryQty, setCowDryQty] = useState("");
  const [cowPacking, setCowPacking] = useState("");

  // Pre-generation review (preview) content state.
  const [reviewContent, setReviewContent] = useState<string | null>(null);
  const [originalReviewContent, setOriginalReviewContent] = useState<string | null>(null);
  const [isEditingReview, setIsEditingReview] = useState(false);

  const [tfrData, setTfrData] = useState<Record<string, string>>({});
  const [tfrLinkedRecapId, setTfrLinkedRecapId] = useState("");
  const [fobData, setFobData] = useState<Record<string, string>>({ direction: "Import (Buy)" });
  const setFob = (key: string, val: string) => setFobData((prev) => ({ ...prev, [key]: val }));
  const fobText = (key: string, label: string, placeholder = "") => (
    <div className="space-y-1.5" key={key}>
      <Label className="text-xs">{label}</Label>
      <Input className="h-8 text-sm" placeholder={placeholder} value={fobData[key] || ""} onChange={(e) => setFob(key, e.target.value)} data-testid={`input-fob-${key}`} />
    </div>
  );
  const [dlcData, setDlcData] = useState<Record<string, string>>({});
  const setDlc = (key: string, val: string) => setDlcData((prev) => ({ ...prev, [key]: val }));
  const dlcText = (key: string, label: string, placeholder = "", textarea = false, rows = 3) => (
    <div className="space-y-1.5" key={key}>
      <Label className="text-xs">{label}</Label>
      {textarea ? (
        <Textarea className="text-sm font-mono" rows={rows} placeholder={placeholder} value={dlcData[key] || ""} onChange={(e) => setDlc(key, e.target.value)} data-testid={`input-dlc-${key}`} />
      ) : (
        <Input className="h-8 text-sm" placeholder={placeholder} value={dlcData[key] || ""} onChange={(e) => setDlc(key, e.target.value)} data-testid={`input-dlc-${key}`} />
      )}
    </div>
  );
  const dlcChoice = (key: string, label: string, options: string[], def = "") => (
    <div className="space-y-1.5" key={key}>
      <Label className="text-xs">{label}</Label>
      <Select value={dlcData[key] || def} onValueChange={(val) => setDlc(key, val)}>
        <SelectTrigger className="h-8 text-sm" data-testid={`select-dlc-${key}`}>
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
  const [pbgData, setPbgData] = useState<Record<string, string>>({});
  const setPbg = (key: string, val: string) => setPbgData((prev) => ({ ...prev, [key]: val }));
  const pbgText = (key: string, label: string, placeholder = "", textarea = false, rows = 3) => (
    <div className="space-y-1.5" key={key}>
      <Label className="text-xs">{label}</Label>
      {textarea ? (
        <Textarea className="text-sm font-mono" rows={rows} placeholder={placeholder} value={pbgData[key] || ""} onChange={(e) => setPbg(key, e.target.value)} data-testid={`input-pbg-${key}`} />
      ) : (
        <Input className="h-8 text-sm" placeholder={placeholder} value={pbgData[key] || ""} onChange={(e) => setPbg(key, e.target.value)} data-testid={`input-pbg-${key}`} />
      )}
    </div>
  );
  const setTfr = (key: string, val: string) => setTfrData((prev) => ({ ...prev, [key]: val }));
  const tfrText = (key: string, label: string, placeholder = "", textarea = false) => (
    <div className="space-y-1.5" key={key}>
      <Label className="text-xs">{label}</Label>
      {textarea ? (
        <Textarea className="text-sm" rows={2} placeholder={placeholder} value={tfrData[key] || ""} onChange={(e) => setTfr(key, e.target.value)} data-testid={`input-tfr-${key}`} />
      ) : (
        <Input className="h-8 text-sm" placeholder={placeholder} value={tfrData[key] || ""} onChange={(e) => setTfr(key, e.target.value)} data-testid={`input-tfr-${key}`} />
      )}
    </div>
  );
  const tfrChoice = (key: string, label: string, options: string[]) => (
    <div className="space-y-1.5" key={key}>
      <Label className="text-xs">{label}</Label>
      <Select value={tfrData[key] || ""} onValueChange={(val) => setTfr(key, val)}>
        <SelectTrigger className="h-8 text-sm" data-testid={`select-tfr-${key}`}>
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
  const tfrCell = (key: string, placeholder = "") => (
    <Input className="h-8 text-sm" placeholder={placeholder} value={tfrData[key] || ""} onChange={(e) => setTfr(key, e.target.value)} data-testid={`input-tfr-${key}`} />
  );
  const tfrDualRow = (label: string, importKey: string, exportKey: string) => (
    <div className="grid grid-cols-[150px_1fr_1fr] gap-2 items-center" key={importKey}>
      <Label className="text-xs">{label}</Label>
      {tfrCell(importKey)}
      {tfrCell(exportKey)}
    </div>
  );
  const tfrTripleRow = (label: string, importKey: string, exportKey: string, totalKey: string) => (
    <div className="grid grid-cols-[150px_1fr_1fr_1fr] gap-2 items-center" key={importKey}>
      <Label className="text-xs">{label}</Label>
      {tfrCell(importKey)}
      {tfrCell(exportKey)}
      {tfrCell(totalKey)}
    </div>
  );
  const tfrColHeader = (cols: string[]) => (
    <div className={`grid gap-2 ${cols.length === 4 ? "grid-cols-[150px_1fr_1fr_1fr]" : "grid-cols-[150px_1fr_1fr]"}`}>
      {cols.map((c, i) => <span key={i} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c}</span>)}
    </div>
  );

  const resetForm = () => {
    setSpaVariant("standard"); setLpgSts({});
    setSelectedType(null);
    setTitle("");
    setBuyerName(""); setBuyerAddress(""); setBuyerContact(""); setBuyerBank(""); setBuyerSwift("");
    setSellerName(""); setSellerAddress(""); setSellerContact(""); setSellerBank(""); setSellerSwift("");
    setCoBuyerName(""); setCoBuyerAddress(""); setCoBuyerContact("");
    setCoSellerName(""); setCoSellerAddress(""); setCoSellerContact("");
    setCommodity(""); setOrigin(""); setQuantity(""); setQualitySpecs(""); setSpecRows(emptySpecRows()); setLoadingPort(""); setDischargePort("");
    setPrice(""); setCurrency("USD"); setIncoterm(""); setLaycan(""); setPaymentTerms("");
    setAnalysisAgency(""); setAnalysisAgencyContact(""); setValidity(""); setRefPerson("");
    setContractConfirmation(""); setDocsForPayment(""); setOtherTerms(""); setCompliance("");
    setRecapValidity(""); setDeliveryBasis(""); setLoadingWindow(""); setShippingTerms("");
    setGoverningLaw(""); setAnnexSpecs(""); setQualityPremiums(""); setSpecialNote("");
    setBlVesselName(""); setBlNotifyParty(""); setBlPacking(""); setBlCharterPartyDate("");
    setBlFreightAdvance(""); setBlLoadingTimeDays(""); setBlLoadingTimeHours("");
    setBlPlaceOfIssue(""); setBlDateOfIssue(""); setBlCompanyOnBehalf(""); setBlMasterOfVessel(""); setBlAgentsName("");
    setCooLinkedBlId(""); setCooCertNo("");
    setCoaLinkedLcId(""); setCoaCertNo(""); setCoaVessel(""); setCoaBlDate("");
    setCoaInspPeriod(""); setCoaLoadPeriod(""); setCoaChemSpecs(""); setCoaMoisture(""); setCoaPhysicalSizes(""); setCoaPacking("");
    setCowLinkedLcId(""); setCowCertNo(""); setCowVessel(""); setCowBlDate("");
    setCowLoadPeriod(""); setCowMoisture(""); setCowDryQty(""); setCowPacking("");
    setCiLinkedLcId(""); setCiInvoiceNo(""); setCiVessel(""); setCiVoyage(""); setCiBlNo(""); setCiBlDate("");
    setCiLcNo(""); setCiLcBank(""); setCiTolerance("+/- 10%"); setCiTotalAmount("");
    setPiInvoiceDate(""); setPiSpaNumber(""); setPiValidUntil("");
    setTfrData({});
    setTfrLinkedRecapId("");
    setFobData({ direction: "Import (Buy)" });
    setDlcData({});
    setPbgData({});
    setReviewContent(null);
    setOriginalReviewContent(null);
    setIsEditingReview(false);
  };

  const buildPayload = () => ({
    docType: selectedType!.value,
    title,
    tradeRef: urlTradeRef || undefined,
    enquiryRef: urlEnquiryRef || undefined,
    buyerDetails: {
      name: buyerName, address: buyerAddress, contact: buyerContact,
      bank: buyerBank, swift: buyerSwift,
      coName: coBuyerName, coAddress: coBuyerAddress, coContact: coBuyerContact,
    },
    sellerDetails: {
      name: sellerName, address: sellerAddress, contact: sellerContact,
      bank: sellerBank, swift: sellerSwift,
      coName: coSellerName, coAddress: coSellerAddress, coContact: coSellerContact,
    },
    productDetails: {
      ...spaVariantPayload(selectedType?.value, spaVariant, lpgSts),
      commodity, origin, quantity, loadingPort, dischargePort,
      price, currency, incoterm, paymentTerms,
      analysisAgency, analysisAgencyContact, refPerson,
      contractConfirmation, docsForPayment, otherTerms, compliance,
      recapValidity, deliveryBasis, loadingWindow, shippingTerms,
      governingLaw,
      qualitySpecs: selectedType?.value === "COA" ? coaChemSpecs : qualitySpecs,
      specialNote: selectedType?.value === "COA" ? coaMoisture : selectedType?.value === "COW" ? cowMoisture : selectedType?.value === "CI" ? ciLcNo : specialNote,
      annexSpecs: selectedType?.value === "COA" ? coaPhysicalSizes : selectedType?.value === "COW" ? cowDryQty : selectedType?.value === "CI" ? ciLcBank : annexSpecs,
      laycan: selectedType?.value === "COA" ? coaInspPeriod : selectedType?.value === "COW" ? cowLoadPeriod : selectedType?.value === "CI" ? ciVoyage : laycan,
      validity: selectedType?.value === "COA" ? coaLoadPeriod : selectedType?.value === "CI" ? ciTolerance : validity,
      vesselName: selectedType?.value === "COA" ? coaVessel : selectedType?.value === "COW" ? cowVessel : selectedType?.value === "CI" ? ciVessel : blVesselName,
      notifyParty: blNotifyParty,
      packing: selectedType?.value === "COA" ? coaPacking : selectedType?.value === "COW" ? cowPacking : selectedType?.value === "CI" ? ciBlNo : blPacking,
      charterPartyDate: selectedType?.value === "COA" ? coaBlDate : selectedType?.value === "COW" ? cowBlDate : selectedType?.value === "CI" ? ciBlDate : blCharterPartyDate,
      qualityPremiums: selectedType?.value === "CI" ? ciTotalAmount : qualityPremiums,
      freightAdvance: blFreightAdvance,
      loadingTimeDays: blLoadingTimeDays, loadingTimeHours: blLoadingTimeHours,
      placeOfIssue: blPlaceOfIssue, dateOfIssue: blDateOfIssue,
      companyOnBehalf: blCompanyOnBehalf, masterOfVessel: blMasterOfVessel, agentsName: blAgentsName,
      loiIssueNumber: selectedType?.value === "COO" ? cooCertNo : selectedType?.value === "COA" ? coaCertNo : selectedType?.value === "COW" ? cowCertNo : selectedType?.value === "CI" ? ciInvoiceNo : loiIssueNumber,
      tfrData: selectedType?.value === "TFR" ? tfrData : undefined,
      fobData: selectedType?.value === "FOB_PROCEDURE" ? fobData : undefined,
      dlcData: selectedType?.value === "DLC_MT700" ? dlcData : undefined,
      pbgData: selectedType?.value === "PBG_MT760" ? pbgData : undefined,
    },
  });

  const buildPreparedProformaInvoiceFields = () => ({
    title,
    invoiceNumber: ciInvoiceNo,
    invoiceDate: piInvoiceDate,
    spaNumber: piSpaNumber,
    validUntil: piValidUntil,
    sellerName,
    sellerAddress,
    sellerContact,
    sellerBank,
    sellerSwift,
    buyerName,
    buyerAddress,
    buyerContact,
    commodity,
    origin,
    quantity,
    loadingPort,
    dischargePort,
    deliveryTerm: incoterm,
    shipmentWindow: ciVoyage,
    packing: ciBlNo,
    price,
    currency,
    paymentTerms,
    tolerance: ciTolerance,
    totalAmount: ciTotalAmount,
  });

  return {
    spaVariant, setSpaVariant, lpgSts, setLpgSts,
    selectedType, setSelectedType,
    title, setTitle,
    buyerName, setBuyerName,
    buyerAddress, setBuyerAddress,
    buyerContact, setBuyerContact,
    buyerBank, setBuyerBank,
    buyerSwift, setBuyerSwift,
    sellerName, setSellerName,
    sellerAddress, setSellerAddress,
    sellerContact, setSellerContact,
    sellerBank, setSellerBank,
    sellerSwift, setSellerSwift,
    coBuyerName, setCoBuyerName,
    coBuyerAddress, setCoBuyerAddress,
    coBuyerContact, setCoBuyerContact,
    coSellerName, setCoSellerName,
    coSellerAddress, setCoSellerAddress,
    coSellerContact, setCoSellerContact,
    commodity, setCommodity,
    origin, setOrigin,
    quantity, setQuantity,
    qualitySpecs, setQualitySpecs,
    specRows, setSpecRows,
    loadingPort, setLoadingPort,
    dischargePort, setDischargePort,
    price, setPrice,
    currency, setCurrency,
    incoterm, setIncoterm,
    laycan, setLaycan,
    paymentTerms, setPaymentTerms,
    analysisAgency, setAnalysisAgency,
    analysisAgencyContact, setAnalysisAgencyContact,
    validity, setValidity,
    refPerson, setRefPerson,
    contractConfirmation, setContractConfirmation,
    docsForPayment, setDocsForPayment,
    otherTerms, setOtherTerms,
    compliance, setCompliance,
    recapValidity, setRecapValidity,
    deliveryBasis, setDeliveryBasis,
    loadingWindow, setLoadingWindow,
    shippingTerms, setShippingTerms,
    governingLaw, setGoverningLaw,
    annexSpecs, setAnnexSpecs,
    qualityPremiums, setQualityPremiums,
    specialNote, setSpecialNote,
    loiIssueNumber, setLoiIssueNumber,
    blVesselName, setBlVesselName,
    blNotifyParty, setBlNotifyParty,
    blPacking, setBlPacking,
    blCharterPartyDate, setBlCharterPartyDate,
    blFreightAdvance, setBlFreightAdvance,
    blLoadingTimeDays, setBlLoadingTimeDays,
    blLoadingTimeHours, setBlLoadingTimeHours,
    blPlaceOfIssue, setBlPlaceOfIssue,
    blDateOfIssue, setBlDateOfIssue,
    blCompanyOnBehalf, setBlCompanyOnBehalf,
    blMasterOfVessel, setBlMasterOfVessel,
    blAgentsName, setBlAgentsName,
    cooLinkedBlId, setCooLinkedBlId,
    cooCertNo, setCooCertNo,
    coaLinkedLcId, setCoaLinkedLcId,
    coaCertNo, setCoaCertNo,
    coaVessel, setCoaVessel,
    coaBlDate, setCoaBlDate,
    coaInspPeriod, setCoaInspPeriod,
    coaLoadPeriod, setCoaLoadPeriod,
    coaChemSpecs, setCoaChemSpecs,
    coaMoisture, setCoaMoisture,
    coaPhysicalSizes, setCoaPhysicalSizes,
    coaPacking, setCoaPacking,
    ciLinkedLcId, setCiLinkedLcId,
    ciInvoiceNo, setCiInvoiceNo,
    ciVessel, setCiVessel,
    ciVoyage, setCiVoyage,
    ciBlNo, setCiBlNo,
    ciBlDate, setCiBlDate,
    ciLcNo, setCiLcNo,
    ciLcBank, setCiLcBank,
    ciTolerance, setCiTolerance,
    ciTotalAmount, setCiTotalAmount,
    piInvoiceDate, setPiInvoiceDate,
    piSpaNumber, setPiSpaNumber,
    piValidUntil, setPiValidUntil,
    cowLinkedLcId, setCowLinkedLcId,
    cowCertNo, setCowCertNo,
    cowVessel, setCowVessel,
    cowBlDate, setCowBlDate,
    cowLoadPeriod, setCowLoadPeriod,
    cowMoisture, setCowMoisture,
    cowDryQty, setCowDryQty,
    cowPacking, setCowPacking,
    reviewContent, setReviewContent,
    originalReviewContent, setOriginalReviewContent,
    isEditingReview, setIsEditingReview,
    tfrData, setTfrData,
    tfrLinkedRecapId, setTfrLinkedRecapId,
    fobData, setFobData,
    dlcData, setDlcData,
    pbgData, setPbgData,
    emptySpecRows,
    serializeSpecRows,
    parseSpecRows,
    updateSpecRow,
    addSpecRow,
    removeSpecRow,
    setFob, fobText,
    setDlc, dlcText, dlcChoice,
    setPbg, pbgText,
    setTfr, tfrText, tfrChoice, tfrCell, tfrDualRow, tfrTripleRow, tfrColHeader,
    resetForm,
    buildPayload,
    buildPreparedProformaInvoiceFields,
  };
}

export type DocFormState = ReturnType<typeof useDocFormState>;
