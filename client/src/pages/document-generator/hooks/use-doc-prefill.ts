import { useState, useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Document as Doc, KycApplication, TeamMember } from "@shared/schema";
import { computeEnquiryPrefill, composeEnquirySpecialNote } from "@shared/enquiry-doc-prefill";
import { docTypes } from "../doc-types";
import type { DocGenUrl } from "./use-doc-gen-url";
import type { DocFormState } from "./use-doc-form-state";
import type { DocGenQueries } from "./use-doc-gen-queries";
import type { DocRepoState } from "./use-doc-repo-state";

// Everything that seeds the generate form: URL/trade/enquiry prefill effects,
// template auto-open, LOI issue-number lookup, opening a doc by URL id, and
// the fill-from-* helpers that copy fields out of related documents/records.
export function useDocPrefill({
  toast,
  url,
  form,
  queries,
  repo,
}: {
  toast: ReturnType<typeof useToast>["toast"];
  url: DocGenUrl;
  form: DocFormState;
  queries: DocGenQueries;
  repo: DocRepoState;
}) {
  const { urlTradeRef, urlEnquiryRef, urlOpenDocId, urlDocType } = url;
  const { allTrades, linkedEnquiry, docs } = queries;
  const [tradePrefilled, setTradePrefilled] = useState(false);
  const [autoOpenedKey, setAutoOpenedKey] = useState<string | null>(null);
  const [enquiryPrefilledFor, setEnquiryPrefilledFor] = useState<string | null>(null);

  useEffect(() => {
    if (urlTradeRef && allTrades && !tradePrefilled) {
      const trade = allTrades.find((t) => t.tradeRef === urlTradeRef);
      if (trade) {
        form.setCommodity(trade.commodity || "");
        form.setOrigin(trade.origin || "");
        form.setQuantity(`${trade.quantity || ""} ${trade.unit || "MT"}`);
        form.setPrice(`${trade.pricePerUnit || ""}`);
        form.setCurrency(trade.currency || "USD");
        form.setIncoterm(trade.incoterm || "");
        form.setBuyerName(trade.buyerName || "");
        form.setSellerName(trade.sellerName || "");
        setTradePrefilled(true);
        toast({ title: "Trade loaded", description: `Pre-filled from trade ${trade.tradeRef}` });
      }
    }
  }, [urlTradeRef, allTrades, tradePrefilled]);

  // Prefill from linked trade enquiry when a template is opened.
  useEffect(() => {
    if (!form.selectedType || !linkedEnquiry) return;
    const key = `${linkedEnquiry.id}::${form.selectedType.value}`;
    if (enquiryPrefilledFor === key) return;
    const e = linkedEnquiry;
    // The approved enquiry (from the DB) is authoritative: it overwrites any
    // URL-seeded values (blank enquiry fields keep the seeded value — see
    // mergeEnquiryPrefill in @shared/enquiry-doc-prefill, which the tests
    // exercise). This runs once per enquiry+template (keyed above),
    // immediately after the dialog opens, so user edits are not clobbered.
    const p = computeEnquiryPrefill(e);
    const setIfPresent = (val: string, setter: (v: string) => void) => {
      if (val) setter(val);
    };
    setIfPresent(p.commodity, form.setCommodity);
    setIfPresent(p.origin, form.setOrigin);
    setIfPresent(p.quantity, form.setQuantity);
    setIfPresent(p.packing, form.setBlPacking);
    setIfPresent(p.qualitySpecs, form.setQualitySpecs);
    if (p.qualitySpecs) {
      const parsedRows = form.parseSpecRows(p.qualitySpecs);
      if (parsedRows && parsedRows.length) {
        form.setSpecRows(parsedRows);
      }
    }
    setIfPresent(p.loadingPort, form.setLoadingPort);
    setIfPresent(p.dischargePort, form.setDischargePort);
    setIfPresent(p.laycan, form.setLaycan);
    setIfPresent(p.price, form.setPrice);
    setIfPresent(p.currency, form.setCurrency);
    setIfPresent(p.incoterm, form.setIncoterm);
    setIfPresent(p.paymentTerms, form.setPaymentTerms);
    setIfPresent(p.validity, form.setValidity);
    setIfPresent(p.refPerson, form.setRefPerson);
    setIfPresent(p.contractConfirmation, form.setContractConfirmation);
    setIfPresent(p.docsForPayment, form.setDocsForPayment);
    setIfPresent(p.otherTerms, form.setOtherTerms);
    // The enquiry's "Special Notes" (Logistics section) and Performance Bond
    // carry into the document's Special Notes block (LOI/FCO templates have
    // no dedicated performance-bond section).
    setIfPresent(p.specialNote, form.setSpecialNote);
    setIfPresent(p.compliance, form.setCompliance);
    setIfPresent(p.buyerName, form.setBuyerName);
    setIfPresent(p.buyerAddress, form.setBuyerAddress);
    setIfPresent(p.buyerContact, form.setBuyerContact);
    setIfPresent(p.sellerName, form.setSellerName);
    setIfPresent(p.sellerAddress, form.setSellerAddress);
    setIfPresent(p.sellerContact, form.setSellerContact);
    setIfPresent(p.coBuyerName, form.setCoBuyerName);
    setIfPresent(p.coBuyerAddress, form.setCoBuyerAddress);
    setIfPresent(p.coBuyerContact, form.setCoBuyerContact);
    setIfPresent(p.coSellerName, form.setCoSellerName);
    setIfPresent(p.coSellerAddress, form.setCoSellerAddress);
    setIfPresent(p.coSellerContact, form.setCoSellerContact);
    if (!form.title) {
      form.setTitle(`${form.selectedType.label} — ${e.enquiryRef}`);
    }
    setEnquiryPrefilledFor(key);
    toast({ title: "Enquiry loaded", description: `Pre-filled from enquiry ${e.enquiryRef}` });
  }, [form.selectedType, linkedEnquiry, enquiryPrefilledFor]);

  // Open a document directly from a URL/session-stored id (e.g. from a
  // notification link), then clean the marker up so it doesn't re-fire.
  useEffect(() => {
    if (urlOpenDocId && docs && !repo.viewDoc) {
      const found = docs.find((d) => d.id === urlOpenDocId);
      if (found) {
        repo.setViewDoc(found);
        try { sessionStorage.removeItem("openDocId"); } catch {}
        const u = new URL(window.location.href);
        if (u.searchParams.has("openDocId")) {
          u.searchParams.delete("openDocId");
          window.history.replaceState({}, "", u.toString());
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      }
    }
  }, [urlOpenDocId, docs]);

  const fillCooFromBl = (blDoc: Doc) => {
    const content = blDoc.content || "";
    const lines = content.split("\n");
    const findIdx = (keyword: string) => lines.findIndex(l => l.trim() === keyword);
    const extractAfter = (prefix: string) => {
      const line = lines.find(l => l.trim().startsWith(prefix));
      return line ? line.substring(line.indexOf(prefix) + prefix.length).trim() : "";
    };
    const nextNonEmpty = (fromIdx: number) => {
      for (let i = fromIdx + 1; i < lines.length; i++) {
        const t = lines[i].trim();
        if (t && !t.match(/^[=─]+$/)) return t;
      }
      return "";
    };
    const shipperIdx = findIdx("SHIPPER");
    if (shipperIdx >= 0) form.setSellerName(nextNonEmpty(shipperIdx));
    const vesselLineIdx = lines.findIndex(l => l.includes("VESSEL") && l.includes("PORT OF LOADING"));
    if (vesselLineIdx >= 0 && vesselLineIdx + 1 < lines.length) {
      const dataLine = lines[vesselLineIdx + 1] || "";
      form.setBlVesselName(dataLine.substring(0, 42).trim());
      form.setLoadingPort(dataLine.substring(42).trim());
    }
    const podIdx = findIdx("PORT OF DISCHARGE");
    if (podIdx >= 0) form.setDischargePort(nextNonEmpty(podIdx));
    form.setCommodity(extractAfter("NAME OF COMMODITY: "));
    form.setOrigin(extractAfter("COUNTRY OF ORIGIN: "));
    form.setBlPacking(extractAfter("PACKING: "));
    const qtyLine = lines.find(l => l.includes("METRIC TONS") && !l.startsWith("IN WITNESS") && !l.startsWith("NUMBER"));
    if (qtyLine) form.setQuantity(qtyLine.replace("METRIC TONS", "").trim());
    toast({ title: "Fields auto-filled", description: `Loaded from BL: ${blDoc.title}` });
  };

  const fillTfrFromRecap = (recapDoc: Doc) => {
    const content = recapDoc.content || "";
    const lines = content.split("\n");
    const clean = (s: string) => {
      const t = (s || "").trim();
      return /^[_\-—\s]*$/.test(t) ? "" : t;
    };
    const rows: Record<string, string> = {};
    for (const line of lines) {
      let idx = line.indexOf("│");
      if (idx === -1) idx = line.indexOf("|");
      if (idx === -1) continue;
      const label = line.substring(0, idx).trim();
      const value = clean(line.substring(idx + 1));
      if (label && value && !rows[label]) rows[label] = value;
    }
    const extractAfter = (prefix: string) => {
      const line = lines.find(l => l.includes(prefix));
      return line ? clean(line.substring(line.indexOf(prefix) + prefix.length)) : "";
    };
    const updates: Record<string, string> = {};
    const set = (k: string, v: string) => { if (v) updates[k] = v; };
    const setDual = (base: string, v: string) => { if (v) { updates[`${base}Import`] = v; updates[`${base}Export`] = v; } };
    set("reference", rows["Contract Reference"]);
    setDual("product", rows["Commodity"]);
    setDual("origin", rows["Country of Origin"]);
    setDual("quantity", rows["Contractual Quantity"]);
    setDual("contractValue", rows["Contract Price & Currency"]);
    setDual("deliveryTerms", rows["Delivery Basis"]);
    setDual("paymentTerms", rows["Payment Terms"]);
    set("partyImport", rows["Seller"]);
    set("partyExport", rows["Buyer"]);
    const pod = extractAfter("Port of Discharge (POD):");
    if (pod) { setDual("destination", pod); set("dischargePort", pod); }
    set("loadingPort", rows["Country of Origin"]);
    form.setTfrData((prev) => ({ ...prev, ...updates }));
    toast({ title: "Fields auto-filled", description: `Loaded from Deal Recap: ${recapDoc.title}` });
  };

  const fillCiFromLc = (lcDoc: Doc) => {
    const content = lcDoc.content || "";
    const lines = content.split("\n");
    const extractAfter = (prefix: string) => {
      const line = lines.find(l => l.trim().startsWith(prefix));
      return line ? line.substring(line.indexOf(prefix) + prefix.length).trim() : "";
    };
    const findSectionIdx = (header: string) => lines.findIndex(l => l.trim() === header);
    const extractFromRange = (startIdx: number, endIdx: number, prefix: string) => {
      const slice = lines.slice(startIdx + 1, endIdx > 0 ? endIdx : undefined);
      const line = slice.find(l => l.trim().startsWith(prefix));
      if (!line) return "";
      const idx = line.indexOf(":");
      return idx >= 0 ? line.substring(idx + 1).trim() : "";
    };
    const applicantIdx = findSectionIdx("APPLICANT (BUYER)");
    const beneficiaryIdx = findSectionIdx("BENEFICIARY (SELLER)");
    const advisingIdx = findSectionIdx("ADVISING BANK");
    const lcDetailsIdx = findSectionIdx("LC DETAILS");
    const issuingIdx = findSectionIdx("ISSUING BANK");

    const endOf = (idx: number, ...candidates: number[]) => {
      const nexts = candidates.filter(c => c > idx);
      return nexts.length > 0 ? Math.min(...nexts) : lines.length;
    };

    const bName = extractFromRange(applicantIdx, endOf(applicantIdx, beneficiaryIdx, advisingIdx, lcDetailsIdx), "Company");
    if (bName) form.setBuyerName(bName);
    const bAddr = extractFromRange(applicantIdx, endOf(applicantIdx, beneficiaryIdx, advisingIdx, lcDetailsIdx), "Address");
    if (bAddr) form.setBuyerAddress(bAddr);
    const bContact = extractFromRange(applicantIdx, endOf(applicantIdx, beneficiaryIdx, advisingIdx, lcDetailsIdx), "Contact");
    if (bContact) form.setBuyerContact(bContact);

    const sName = extractFromRange(beneficiaryIdx, endOf(beneficiaryIdx, advisingIdx, lcDetailsIdx), "Company");
    if (sName) form.setSellerName(sName);
    const sAddr = extractFromRange(beneficiaryIdx, endOf(beneficiaryIdx, advisingIdx, lcDetailsIdx), "Address");
    if (sAddr) form.setSellerAddress(sAddr);
    const sContact = extractFromRange(beneficiaryIdx, endOf(beneficiaryIdx, advisingIdx, lcDetailsIdx), "Contact");
    if (sContact) form.setSellerContact(sContact);

    if (advisingIdx >= 0) {
      const bankName = extractFromRange(advisingIdx, endOf(advisingIdx, lcDetailsIdx), "Bank Name");
      if (bankName && bankName !== "_______________") form.setSellerBank(bankName);
      const swift = extractFromRange(advisingIdx, endOf(advisingIdx, lcDetailsIdx), "SWIFT");
      if (swift && swift !== "_______________") form.setSellerSwift(swift);
    }

    const lcNoLine = lines.find(l => l.trim().startsWith("LC Number:"));
    if (lcNoLine) {
      const val = lcNoLine.substring(lcNoLine.indexOf(":") + 1).trim();
      if (val && val !== "_______________") form.setCiLcNo(val);
    }
    if (issuingIdx >= 0) {
      const issuingBank = extractFromRange(issuingIdx, endOf(issuingIdx, applicantIdx, beneficiaryIdx), "Bank Name");
      if (issuingBank && issuingBank !== "_______________") form.setCiLcBank(issuingBank);
    }

    const commodity = extractAfter("Commodity: ");
    if (commodity) form.setCommodity(commodity);
    const qty = extractAfter("Quantity: ");
    if (qty) form.setQuantity(qty);
    const origin = extractAfter("Origin: ");
    if (origin) form.setOrigin(origin);
    const pol = extractAfter("Port of Loading: ");
    if (pol) form.setLoadingPort(pol);
    const pod = extractAfter("Port of Discharge: ");
    if (pod) form.setDischargePort(pod);

    const rawUnitPrice = extractAfter("Unit Price: ");
    if (rawUnitPrice) {
      const parts = rawUnitPrice.trim().split(" ");
      if (parts.length >= 2) { form.setCurrency(parts[0]); form.setPrice(parts[1]); }
      else form.setPrice(rawUnitPrice);
    }
    const cur = extractAfter("Currency: ");
    if (cur) form.setCurrency(cur);

    const payTerms = extractAfter("Payment Terms: ");
    if (payTerms) form.setPaymentTerms(payTerms);

    toast({ title: "Fields auto-filled", description: `Loaded from LC: ${lcDoc.title}` });
  };

  const fillCowFromLc = (lcDoc: Doc) => {
    const content = lcDoc.content || "";
    const lines = content.split("\n");
    const extractAfter = (prefix: string) => {
      const line = lines.find(l => l.trim().startsWith(prefix));
      return line ? line.substring(line.indexOf(prefix) + prefix.length).trim() : "";
    };
    const commodity = extractAfter("Commodity: ");
    if (commodity) form.setCommodity(commodity);
    const origin = extractAfter("Country of Origin: ");
    if (origin) form.setOrigin(origin);
    const quantity = extractAfter("Quantity: ");
    if (quantity) form.setQuantity(quantity);
    const pol = extractAfter("Port of Loading: ");
    if (pol) form.setLoadingPort(pol);
    const pod = extractAfter("Port of Discharge: ");
    if (pod) form.setDischargePort(pod);
    toast({ title: "Fields auto-filled", description: `Loaded from LC: ${lcDoc.title}` });
  };

  const fillCoaFromLc = (lcDoc: Doc) => {
    const content = lcDoc.content || "";
    const lines = content.split("\n");
    const extractAfter = (prefix: string) => {
      const line = lines.find(l => l.trim().startsWith(prefix));
      return line ? line.substring(line.indexOf(prefix) + prefix.length).trim() : "";
    };
    const commodity = extractAfter("Commodity: ");
    if (commodity) form.setCommodity(commodity);
    const origin = extractAfter("Country of Origin: ");
    if (origin) form.setOrigin(origin);
    const quantity = extractAfter("Quantity: ");
    if (quantity) form.setQuantity(quantity);
    const pol = extractAfter("Port of Loading: ");
    if (pol) form.setLoadingPort(pol);
    const pod = extractAfter("Port of Discharge: ");
    if (pod) form.setDischargePort(pod);
    toast({ title: "Fields auto-filled", description: `Loaded from LC: ${lcDoc.title}` });
  };

  const fillFromKyc = (kyc: KycApplication, role: "buyer" | "seller") => {
    const setName = role === "buyer" ? form.setBuyerName : form.setSellerName;
    const setAddress = role === "buyer" ? form.setBuyerAddress : form.setSellerAddress;
    const setContact = role === "buyer" ? form.setBuyerContact : form.setSellerContact;
    const setBank = role === "buyer" ? form.setBuyerBank : form.setSellerBank;
    const setSwift = role === "buyer" ? form.setBuyerSwift : form.setSellerSwift;
    setName(kyc.companyName || "");
    setAddress(kyc.registeredAddress || "");
    setContact([kyc.contactName, kyc.contactEmail].filter(Boolean).join(" — "));
    setBank(kyc.bankName || "");
    setSwift(kyc.swiftCode || "");
  };

  const fillFromTeamMember = (member: TeamMember, role: "buyer" | "seller") => {
    const setName = role === "buyer" ? form.setBuyerName : form.setSellerName;
    const setAddress = role === "buyer" ? form.setBuyerAddress : form.setSellerAddress;
    const setContact = role === "buyer" ? form.setBuyerContact : form.setSellerContact;
    const setBank = role === "buyer" ? form.setBuyerBank : form.setSellerBank;
    const setSwift = role === "buyer" ? form.setBuyerSwift : form.setSellerSwift;
    setName(member.name || "");
    setAddress([member.homeAddress, member.city, member.country].filter(Boolean).join(", "));
    setContact([member.name, member.position || member.department].filter(Boolean).join(" — "));
    setBank(member.bankName || "");
    setSwift(member.payrollSwift || "");
  };

  const getLoiDefaultValidity = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " (2000HRS Dubai Time)";
  };

  const openTemplateDialog = (dt: typeof docTypes[0]) => {
    form.setSelectedType(dt);
    if (urlEnquiryRef) {
      form.setTitle(`${dt.short} - ${urlEnquiryRef}`);
      form.setCommodity(url.urlEnqProduct);
      form.setQuantity(url.urlEnqQuantity.trim());
      if (url.urlEnqPacking) form.setBlPacking(url.urlEnqPacking);
      form.setOrigin(url.urlEnqOrigin);
      form.setLoadingPort(url.urlEnqLoadingPort);
      form.setDischargePort(url.urlEnqDischargePort);
      form.setIncoterm(url.urlEnqIncoterm);
      form.setQualitySpecs(url.urlEnqSpecs);
      const parsedSpecRows = form.parseSpecRows(url.urlEnqSpecs);
      if (parsedSpecRows && parsedSpecRows.length) form.setSpecRows(parsedSpecRows);
      form.setLaycan(url.urlEnqDeliveryPeriod);
      for (const [key, setter] of [
        ["enqPrice", form.setPrice], ["enqCurrency", form.setCurrency],
        ["enqPaymentTerms", form.setPaymentTerms],
        ["enqContractConfirmation", form.setContractConfirmation],
        ["enqDocsForPayment", form.setDocsForPayment],
        ["enqOtherTerms", form.setOtherTerms], ["enqCompliance", form.setCompliance],
      ] as const) {
        const value = url.urlParams.get(key);
        if (value) setter(value);
      }
      form.setValidity(dt.value === "LOI" ? (url.urlEnqValidity || getLoiDefaultValidity()) : url.urlEnqValidity);
      form.setRefPerson(url.urlEnqCreatedBy);
      if (url.urlEnqEmail) {
        form.setBuyerContact(url.urlEnqEmail);
      }
      // Logistics details from the enquiry: producer/supplier seeds the seller
      // name, and the enquiry's Special Notes carry into the document.
      if (url.urlEnqProducer) form.setSellerName(url.urlEnqProducer);
      // Joint co-seller/co-buyer companies from the enquiry.
      if (url.urlEnqCoSellerName) form.setCoSellerName(url.urlEnqCoSellerName);
      if (url.urlEnqCoSellerAddress) form.setCoSellerAddress(url.urlEnqCoSellerAddress);
      if (url.urlEnqCoSellerContact) form.setCoSellerContact(url.urlEnqCoSellerContact);
      if (url.urlEnqCoBuyerName) form.setCoBuyerName(url.urlEnqCoBuyerName);
      if (url.urlEnqCoBuyerAddress) form.setCoBuyerAddress(url.urlEnqCoBuyerAddress);
      if (url.urlEnqCoBuyerContact) form.setCoBuyerContact(url.urlEnqCoBuyerContact);
      form.setSpecialNote(composeEnquirySpecialNote(url.urlEnqAdditionalInfo, url.urlEnqPerformanceBond));
    } else if (urlTradeRef && tradePrefilled) {
      form.setTitle(`${dt.short} - ${urlTradeRef}`);
      if (dt.value === "LOI") form.setValidity(getLoiDefaultValidity());
    } else {
      form.setTitle("");
      form.setBuyerName(""); form.setBuyerAddress(""); form.setBuyerContact(""); form.setBuyerBank(""); form.setBuyerSwift("");
      form.setSellerName(""); form.setSellerAddress(""); form.setSellerContact(""); form.setSellerBank(""); form.setSellerSwift("");
      form.setCoBuyerName(""); form.setCoBuyerAddress(""); form.setCoBuyerContact("");
      form.setCoSellerName(""); form.setCoSellerAddress(""); form.setCoSellerContact("");
      form.setCommodity(""); form.setOrigin(""); form.setQuantity(""); form.setQualitySpecs(""); form.setLoadingPort(""); form.setDischargePort("");
      form.setPrice(""); form.setCurrency("USD"); form.setIncoterm(""); form.setLaycan(""); form.setPaymentTerms("");
      form.setAnalysisAgency(""); form.setAnalysisAgencyContact(""); form.setRefPerson("");
      form.setValidity(dt.value === "LOI" ? getLoiDefaultValidity() : "");
      form.setContractConfirmation(""); form.setDocsForPayment(""); form.setOtherTerms(""); form.setCompliance("");
      form.setRecapValidity(""); form.setDeliveryBasis(""); form.setLoadingWindow(""); form.setShippingTerms("");
      form.setGoverningLaw(""); form.setAnnexSpecs(""); form.setQualityPremiums(""); form.setSpecialNote("");
    }
  };

  useEffect(() => {
    if (form.selectedType?.value === "LOI" && form.buyerName.trim().length >= 1) {
      fetch(`/api/documents/next-loi-number?buyerName=${encodeURIComponent(form.buyerName)}`, { credentials: "include" })
        .then(r => r.json())
        .then(d => { if (d.issueNumber) form.setLoiIssueNumber(d.issueNumber); })
        .catch(() => {});
    } else {
      form.setLoiIssueNumber("");
    }
  }, [form.selectedType?.value, form.buyerName]);

  // Auto-open the requested template (?docType=) — used by "Generate Document"
  // from an enquiry (buy → LOI, sell → FCO). Keyed by the URL so it re-fires
  // for a different enquiry/template within the same session, but never
  // re-opens a dialog the user just closed for the same URL.
  useEffect(() => {
    if (!urlDocType || form.selectedType) return;
    const key = `${urlDocType.toLowerCase()}::${urlEnquiryRef || ""}`;
    if (autoOpenedKey === key) return;
    const dt = docTypes.find((d) => d.value.toLowerCase() === urlDocType.toLowerCase());
    if (dt) {
      openTemplateDialog(dt);
      setAutoOpenedKey(key);
    }
  }, [urlDocType, urlEnquiryRef, autoOpenedKey, form.selectedType]);

  return {
    tradePrefilled, setTradePrefilled,
    autoOpenedKey, setAutoOpenedKey,
    enquiryPrefilledFor, setEnquiryPrefilledFor,
    fillCooFromBl,
    fillTfrFromRecap,
    fillCiFromLc,
    fillCowFromLc,
    fillCoaFromLc,
    fillFromKyc,
    fillFromTeamMember,
    getLoiDefaultValidity,
    openTemplateDialog,
  };
}

export type DocPrefill = ReturnType<typeof useDocPrefill>;
