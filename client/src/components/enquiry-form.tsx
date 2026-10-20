import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient, uploadFormData } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { parseSpecRows, serializeSpecRows } from "@/lib/spec-rows";
import {
  Plus, FileText, Upload, X, Send, ClipboardList, FileSignature,
} from "lucide-react";
import { sortClientDetails } from "@shared/client-sorting";
import { trackEvent } from "@/lib/analytics";
import { LPG_REVIEW_NOTICE, lpgEnquiryPreset, fillEmptyLpgFields } from "@shared/lpg-format";
import { COPPER_CATHODE_NOTICE, copperCathodePreset } from "@shared/copper-cathodes";

const UNIT_OPTIONS = ["MT", "KG", "LBS", "BBL", "GAL", "LTR", "OZ", "TON"];
const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "AED", "CNY"];
const INCOTERM_OPTIONS = ["FOB", "CIF", "CFR", "EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP"];

export interface SpecRow { parameter: string; specification: string; rejection: string; testMethod: string; }

type Participant = {
  id: string;
  companyName: string;
  registeredAddress: string | null;
  primaryBusinessAddress: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  category: string | null;
  products: string | null;
};

export interface EnquiryFormData {
  side: "buy" | "sell";
  // Header
  sellerName: string;
  sellerAddress: string;
  sellerContact: string;
  refPerson: string;
  validity: string;
  incoterms: string;
  buyerName: string;
  buyerAddress: string;
  buyerContact: string;
  coSellerName: string;
  coSellerAddress: string;
  coSellerContact: string;
  coBuyerName: string;
  coBuyerAddress: string;
  coBuyerContact: string;
  createdBy: string;
  email: string;
  // Parameters
  product: string;
  origin: string;
  quantity: string;
  unit: string;
  packing: string;
  deliveryPeriod: string;
  price: string;
  currency: string;
  contractConfirmation: string;
  specifications: string;
  paymentTerms: string;
  performanceBond: string;
  docsForPayment: string;
  otherTerms: string;
  compliance: string;
  // Closing
  producer: string;
  loadingPort: string;
  dischargePort: string;
  additionalInfo: string;
}

const emptyForm: EnquiryFormData = {
  side: "buy",
  sellerName: "", sellerAddress: "", sellerContact: "", refPerson: "",
  validity: "", incoterms: "CIF",
  buyerName: "", buyerAddress: "", buyerContact: "",
  coSellerName: "", coSellerAddress: "", coSellerContact: "",
  coBuyerName: "", coBuyerAddress: "", coBuyerContact: "",
  createdBy: "", email: "",
  product: "", origin: "", quantity: "", unit: "MT", packing: "", deliveryPeriod: "",
  price: "", currency: "USD", contractConfirmation: "",
  specifications: "", paymentTerms: "", performanceBond: "", docsForPayment: "", otherTerms: "", compliance: "",
  producer: "", loadingPort: "", dischargePort: "", additionalInfo: "",
};

const emptySpecRows: SpecRow[] = [{ parameter: "", specification: "", rejection: "", testMethod: "" }];

interface EnquiryFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function EnquiryForm({ onSuccess, onCancel }: EnquiryFormProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<EnquiryFormData>({ ...emptyForm });
  const [specRows, setSpecRows] = useState<SpecRow[]>(emptySpecRows);
  const latestFormRef = useRef(form);
  latestFormRef.current = form;
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [sellerKycId, setSellerKycId] = useState("");
  const [buyerKycId, setBuyerKycId] = useState("");
  const [coSellerKycId, setCoSellerKycId] = useState("");
  const [coBuyerKycId, setCoBuyerKycId] = useState("");
  const [showCoSeller, setShowCoSeller] = useState(false);
  const [showCoBuyer, setShowCoBuyer] = useState(false);

  const { data: approvedKyc = [] } = useQuery<Participant[]>({
    queryKey: ["/api/participants"],
    select: sortClientDetails,
  });

  const fillSeller = (id: string) => {
    setSellerKycId(id);
    const k = approvedKyc.find(a => a.id === id);
    if (!k) return;
    setForm(p => ({
      ...p,
      sellerName: k.companyName || "",
      sellerAddress: k.primaryBusinessAddress || k.registeredAddress || "",
      sellerContact: [k.contactName, k.contactPhone, k.contactEmail].filter(Boolean).join(" · "),
    }));
  };

  const fillBuyer = (id: string) => {
    setBuyerKycId(id);
    const k = approvedKyc.find(a => a.id === id);
    if (!k) return;
    setForm(p => ({
      ...p,
      buyerName: k.companyName || "",
      buyerAddress: k.primaryBusinessAddress || k.registeredAddress || "",
      buyerContact: [k.contactName, k.contactPhone].filter(Boolean).join(" · "),
      email: k.contactEmail || "",
    }));
  };

  const fillCoSeller = (id: string) => {
    setCoSellerKycId(id);
    const k = approvedKyc.find(a => a.id === id);
    if (!k) return;
    setForm(p => ({
      ...p,
      coSellerName: k.companyName || "",
      coSellerAddress: k.primaryBusinessAddress || k.registeredAddress || "",
      coSellerContact: [k.contactName, k.contactPhone, k.contactEmail].filter(Boolean).join(" · "),
    }));
  };

  const fillCoBuyer = (id: string) => {
    setCoBuyerKycId(id);
    const k = approvedKyc.find(a => a.id === id);
    if (!k) return;
    setForm(p => ({
      ...p,
      coBuyerName: k.companyName || "",
      coBuyerAddress: k.primaryBusinessAddress || k.registeredAddress || "",
      coBuyerContact: [k.contactName, k.contactPhone].filter(Boolean).join(" · "),
    }));
  };

  const clearCoSeller = () => {
    setShowCoSeller(false);
    setCoSellerKycId("");
    setForm(p => ({ ...p, coSellerName: "", coSellerAddress: "", coSellerContact: "" }));
  };

  const clearCoBuyer = () => {
    setShowCoBuyer(false);
    setCoBuyerKycId("");
    setForm(p => ({ ...p, coBuyerName: "", coBuyerAddress: "", coBuyerContact: "" }));
  };

  const createMutation = useMutation({
    mutationFn: async (data: EnquiryFormData & { specifications: string }) => {
      const res = await apiRequest("POST", "/api/trade-enquiries", data);
      return res.json();
    },
    onSuccess: async (newEnquiry) => {
      trackEvent("enquiry_created", { location: "enquiry_form" });
      if (pendingFiles.length > 0) {
        await Promise.allSettled(pendingFiles.map(file => {
          const fd = new FormData();
          fd.append("file", file);
          return uploadFormData(`/api/trade-enquiries/${newEnquiry.id}/documents`, fd);
        }));
        setPendingFiles([]);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/trade-enquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team/me/enquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiry-board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiry-table"] });
      setForm({ ...emptyForm });
      setSpecRows(emptySpecRows);
      setSpecTemplateFetchedFor("");
      setSellerKycId("");
      setBuyerKycId("");
      setCoSellerKycId("");
      setCoBuyerKycId("");
      setShowCoSeller(false);
      setShowCoBuyer(false);
      toast({ title: "Trade enquiry created successfully" });
      onSuccess?.();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create enquiry", description: err.message, variant: "destructive" });
    },
  });

  // Saved chemical composition: when the commodity is entered and the spec
  // table is still empty, prefer saved compositions for the same product.
  // The API falls back to the uploaded copper sample when no saved specs exist.
  const [specTemplateFetchedFor, setSpecTemplateFetchedFor] = useState("");
  const prefillSeqRef = useRef(0);
  const prefillSpecsForProduct = async (product: string, opts?: { force?: boolean }) => {
    const key = product.trim().toLowerCase();
    if (!key || (!opts?.force && key === specTemplateFetchedFor)) return;
    // Stale-response guard: if the user picks commodity A then quickly B, a
    // slower A response must never overwrite B's freshly loaded specs.
    const seq = ++prefillSeqRef.current;
    const rowsEmpty = specRows.every(r => !r.parameter.trim() && !r.specification.trim() && !r.rejection.trim() && !r.testMethod.trim());
    if (!rowsEmpty || form.specifications.trim()) {
      if (opts?.force) toast({ title: "Existing specifications preserved", description: "Changing commodity does not replace your specifications. Review them for the selected product, or use the copper preset and confirm replacement." });
      return;
    }
    setSpecTemplateFetchedFor(key);
    try {
      const res = await fetch(`/api/enquiry-spec-template?product=${encodeURIComponent(product.trim())}`, { credentials: "include" });
      if (!res.ok) { setSpecTemplateFetchedFor(""); return; } // no access (e.g. public form) or server error — allow retry
      const tpl: { product: string | null; specifications: string | null; source?: string } = await res.json();
      if (seq !== prefillSeqRef.current) return; // a newer prefill superseded this one
      const current = latestFormRef.current;
      if (current.product.trim().toLowerCase() !== key || current.specifications.trim()) return;
      const parsed = tpl.source === "builtin-copper"
        ? copperCathodePreset(current, [])?.specRows
        : parseSpecRows(tpl.specifications);
      if (parsed && parsed.length) {
        // Re-check at apply time: never overwrite rows the user started typing
        // while the request was in flight, including after suggestion selection.
        setSpecRows(prev => {
          const stillEmpty = prev.every(r => !r.parameter.trim() && !r.specification.trim() && !r.rejection.trim() && !r.testMethod.trim());
          return stillEmpty ? parsed : prev;
        });
        toast({ title: "Specification template available", description: tpl.source === "builtin-copper"
          ? "Uploaded copper cathodes sample filled into empty specifications. Review before use; existing edits are preserved."
          : `Saved ${tpl.product} specifications filled into empty rows; existing edits are preserved.` });
      }
    } catch {
      // Prefill is best-effort; never block the form.
      setSpecTemplateFetchedFor("");
    }
  };

  // Commodity-name autocomplete: suggest existing commodities matching what's
  // being typed; picking one loads its saved composition immediately.
  const [productSuggestions, setProductSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suppressSuggestRef = useRef(false);
  useEffect(() => {
    const q = form.product.trim();
    if (suppressSuggestRef.current) { suppressSuggestRef.current = false; return; }
    if (q.length < 2) { setProductSuggestions([]); setShowSuggestions(false); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/commodity-names?q=${encodeURIComponent(q)}`, { credentials: "include" });
        if (!res.ok) return;
        const names: string[] = await res.json();
        // Hide the exact-typed name when it's the only suggestion — nothing to pick.
        const filtered = names.length === 1 && names[0].trim().toLowerCase() === q.toLowerCase() ? [] : names;
        setProductSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
      } catch { /* suggestions are best-effort */ }
    }, 300);
    return () => clearTimeout(t);
  }, [form.product]);
  const selectSuggestedProduct = (name: string) => {
    suppressSuggestRef.current = true;
    setForm(prev => ({ ...prev, product: name }));
    setShowSuggestions(false);
    setProductSuggestions([]);
    prefillSpecsForProduct(name, { force: true });
  };

  // Also fire automatically while the user pauses typing the commodity name,
  // so nobody has to know to click elsewhere first (blur stays as a fallback).
  const prefillRef = useRef(prefillSpecsForProduct);
  prefillRef.current = prefillSpecsForProduct;
  useEffect(() => {
    const product = form.product;
    if (!product.trim()) return;
    const t = setTimeout(() => prefillRef.current(product), 700);
    return () => clearTimeout(t);
  }, [form.product]);

  const handleSubmit = () => {
    if (!form.product.trim()) {
      toast({ title: "Commodity is required", variant: "destructive" });
      return;
    }
    const specText = serializeSpecRows(specRows);
    createMutation.mutate({ ...form, specifications: specText || form.specifications });
  };

  const f = (field: keyof EnquiryFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleCancel = () => {
    setForm({ ...emptyForm });
    setSpecRows(emptySpecRows);
    setSpecTemplateFetchedFor("");
    setPendingFiles([]);
    setSellerKycId("");
    setBuyerKycId("");
    setCoSellerKycId("");
    setCoBuyerKycId("");
    setShowCoSeller(false);
    setShowCoBuyer(false);
    onCancel?.();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 p-3 space-y-2">
        <p className="text-xs text-muted-foreground">{COPPER_CATHODE_NOTICE}</p>
        <Button type="button" variant="outline" size="sm" data-testid="apply-copper-enquiry"
          onClick={() => {
            const preset = copperCathodePreset(form, specRows, message => window.confirm(message));
            if (!preset) return;
            ++prefillSeqRef.current;
            setForm(current => ({ ...current, product: preset.product, origin: preset.origin, packing: preset.packing, specifications: "" }));
            setSpecRows(preset.specRows);
          }}>Apply uploaded copper cathodes specifications</Button>
      </div>
      <div className="rounded-md border bg-muted/30 p-3 space-y-2">
        <p className="text-xs text-muted-foreground">{LPG_REVIEW_NOTICE}</p>
        <Button type="button" variant="outline" size="sm" data-testid="apply-lpg-enquiry" onClick={() => {
          const preset = lpgEnquiryPreset();
          const { specifications, ...commercialFields } = preset;
          const specsEmpty = specRows.every(r => !r.parameter && !r.specification && !r.rejection && !r.testMethod);
          setForm(current => fillEmptyLpgFields(current, commercialFields));
          // Rows are the editable source of truth. Do not leave a duplicate
          // fallback blob that would resurrect sample rows after deletion.
          if (specsEmpty && !form.specifications.trim()) setSpecRows(parseSpecRows(specifications)!);
        }}>Apply LPG sample format</Button>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={form.side === "buy" ? "default" : "outline"}
          className={form.side === "buy" ? "bg-green-600 hover:bg-green-700 text-white flex-1" : "flex-1"}
          onClick={() => setForm(p => ({ ...p, side: "buy" }))}
          data-testid="button-side-buy"
        >IMPORT (BUY)</Button>
        <Button
          type="button"
          size="sm"
          variant={form.side === "sell" ? "default" : "outline"}
          className={form.side === "sell" ? "bg-red-600 hover:bg-red-700 text-white flex-1" : "flex-1"}
          onClick={() => setForm(p => ({ ...p, side: "sell" }))}
          data-testid="button-side-sell"
        >EXPORT (SELL)</Button>
      </div>

      <Accordion type="multiple" defaultValue={["header", "params", "closing"]} className="w-full">

        <AccordionItem value="header" className="border rounded-md mb-2">
          <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
            <span className="flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> Enquiry Header</span>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3">
            <div className="border rounded-md overflow-hidden">
              <div className="grid grid-cols-[140px_1fr] border-b">
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Issued to Seller</div>
                <div className="p-1 space-y-1">
                  {approvedKyc.length > 0 && (
                    <Select value={sellerKycId} onValueChange={fillSeller}>
                      <SelectTrigger className="h-7 text-xs" data-testid="select-seller-kyc"><SelectValue placeholder="Auto-fill from KYC participant…" /></SelectTrigger>
                      <SelectContent>{approvedKyc.map(k => <SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Seller company name" value={form.sellerName} onChange={f("sellerName")} data-testid="input-seller-name" />
                  <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Seller address" value={form.sellerAddress} onChange={f("sellerAddress")} data-testid="input-seller-address" />
                </div>
              </div>
              <div className="grid grid-cols-[140px_1fr] border-b">
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Attention (PIC)</div>
                <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Seller contact person & title" value={form.sellerContact} onChange={f("sellerContact")} data-testid="input-seller-contact" /></div>
              </div>
              {!showCoSeller && (
                <div className="border-b p-1">
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => setShowCoSeller(true)} data-testid="button-add-co-seller">
                    <Plus className="w-3 h-3 mr-1" /> Add Co-Seller (joint seller)
                  </Button>
                </div>
              )}
              {showCoSeller && (
                <>
                  <div className="grid grid-cols-[140px_1fr] border-b">
                    <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center justify-between bg-muted/30">
                      <span>Co-Seller</span>
                      <button type="button" onClick={clearCoSeller} className="text-muted-foreground hover:text-foreground" data-testid="button-remove-co-seller" aria-label="Remove co-seller"><X className="w-3 h-3" /></button>
                    </div>
                    <div className="p-1 space-y-1">
                      {approvedKyc.length > 0 && (
                        <Select value={coSellerKycId} onValueChange={fillCoSeller}>
                          <SelectTrigger className="h-7 text-xs" data-testid="select-co-seller-kyc"><SelectValue placeholder="Auto-fill from KYC participant…" /></SelectTrigger>
                          <SelectContent>{approvedKyc.map(k => <SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                      <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Co-seller company name" value={form.coSellerName} onChange={f("coSellerName")} data-testid="input-co-seller-name" />
                      <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Co-seller address" value={form.coSellerAddress} onChange={f("coSellerAddress")} data-testid="input-co-seller-address" />
                    </div>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] border-b">
                    <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Co-Seller PIC</div>
                    <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Co-seller contact person & title" value={form.coSellerContact} onChange={f("coSellerContact")} data-testid="input-co-seller-contact" /></div>
                  </div>
                </>
              )}
              <div className="grid grid-cols-[140px_1fr] border-b">
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Ref</div>
                <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Reference person (e.g. Mr. John Smith)" value={form.refPerson} onChange={f("refPerson")} data-testid="input-ref-person" /></div>
              </div>
              <div className="grid grid-cols-[140px_1fr] border-b">
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Valid Till</div>
                <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Saturday 2nd August, 2025 – 2000HRS Dubai Time" value={form.validity} onChange={f("validity")} data-testid="input-validity" /></div>
              </div>
              <div className="grid grid-cols-[140px_1fr] border-b">
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Purchase Incoterms</div>
                <div className="p-1">
                  <Select value={form.incoterms} onValueChange={(v) => setForm(p => ({ ...p, incoterms: v }))}>
                    <SelectTrigger className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" data-testid="select-incoterms"><SelectValue /></SelectTrigger>
                    <SelectContent>{INCOTERM_OPTIONS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-[140px_1fr] border-b">
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Issued by Buyer</div>
                <div className="p-1 space-y-1">
                  {approvedKyc.length > 0 && (
                    <Select value={buyerKycId} onValueChange={fillBuyer}>
                      <SelectTrigger className="h-7 text-xs" data-testid="select-buyer-kyc"><SelectValue placeholder="Auto-fill from KYC participant…" /></SelectTrigger>
                      <SelectContent>{approvedKyc.map(k => <SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Buyer company name" value={form.buyerName} onChange={f("buyerName")} data-testid="input-buyer-name" />
                  <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Buyer address" value={form.buyerAddress} onChange={f("buyerAddress")} data-testid="input-buyer-address" />
                </div>
              </div>
              {!showCoBuyer && (
                <div className="border-b p-1">
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => setShowCoBuyer(true)} data-testid="button-add-co-buyer">
                    <Plus className="w-3 h-3 mr-1" /> Add Co-Buyer (joint buyer)
                  </Button>
                </div>
              )}
              {showCoBuyer && (
                <>
                  <div className="grid grid-cols-[140px_1fr] border-b">
                    <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center justify-between bg-muted/30">
                      <span>Co-Buyer</span>
                      <button type="button" onClick={clearCoBuyer} className="text-muted-foreground hover:text-foreground" data-testid="button-remove-co-buyer" aria-label="Remove co-buyer"><X className="w-3 h-3" /></button>
                    </div>
                    <div className="p-1 space-y-1">
                      {approvedKyc.length > 0 && (
                        <Select value={coBuyerKycId} onValueChange={fillCoBuyer}>
                          <SelectTrigger className="h-7 text-xs" data-testid="select-co-buyer-kyc"><SelectValue placeholder="Auto-fill from KYC participant…" /></SelectTrigger>
                          <SelectContent>{approvedKyc.map(k => <SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                      <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Co-buyer company name" value={form.coBuyerName} onChange={f("coBuyerName")} data-testid="input-co-buyer-name" />
                      <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Co-buyer address" value={form.coBuyerAddress} onChange={f("coBuyerAddress")} data-testid="input-co-buyer-address" />
                    </div>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] border-b">
                    <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Co-Buyer PIC</div>
                    <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Co-buyer contact person & title" value={form.coBuyerContact} onChange={f("coBuyerContact")} data-testid="input-co-buyer-contact" /></div>
                  </div>
                </>
              )}
              <div className="grid grid-cols-[140px_1fr]">
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Attention (PIC)</div>
                <div className="p-1 space-y-1">
                  <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Buyer contact person & title" value={form.buyerContact} onChange={f("buyerContact")} data-testid="input-buyer-contact" />
                  <div className="grid grid-cols-2 gap-1">
                    <Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Created by (name)" value={form.createdBy} onChange={f("createdBy")} data-testid="input-created-by" />
                    <Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Email" value={form.email} onChange={f("email")} data-testid="input-email" />
                  </div>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="params" className="border rounded-md mb-2">
          <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
            <span className="flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Enquiry Parameters</span>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3">
            <div className="border rounded-md overflow-hidden">
              <div className="grid grid-cols-[40px_130px_1fr] text-xs bg-muted/60 font-semibold border-b">
                <div className="p-2 border-r text-center">Sr.</div>
                <div className="p-2 border-r">Parameters</div>
                <div className="p-2">Details</div>
              </div>
              {[
                { sr: "01", label: "Commodity", field: "product" as keyof EnquiryFormData, placeholder: "e.g. Iron Ore, Copper Cathode, Gasoil 10ppm", required: true },
                { sr: "02", label: "Origin", field: "origin" as keyof EnquiryFormData, placeholder: "e.g. Kamsar, Guinea" },
              ].map(({ sr, label, field, placeholder, required }) => (
                <div key={sr} className="grid grid-cols-[40px_130px_1fr] border-b">
                  <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">{sr}</div>
                  <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">{label}{required && " *"}</div>
                  <div className="p-1 relative">
                    <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={placeholder} value={form[field] as string} onChange={f(field)} autoComplete="off"
                      onBlur={field === "product" ? () => { setTimeout(() => setShowSuggestions(false), 150); prefillSpecsForProduct(form.product); } : undefined}
                      onFocus={field === "product" && productSuggestions.length > 0 ? () => setShowSuggestions(true) : undefined}
                      data-testid={`input-${field}`} />
                    {field === "product" && showSuggestions && productSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md" data-testid="list-commodity-suggestions">
                        {productSuggestions.map((name) => (
                          <button key={name} type="button" className="block w-full px-2 py-1.5 text-left text-xs hover:bg-accent"
                            onMouseDown={(e) => { e.preventDefault(); selectSuggestedProduct(name); }}
                            data-testid={`suggestion-${name}`}>
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-[40px_130px_1fr] border-b">
                <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">03</div>
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Quantity</div>
                <div className="p-1 flex gap-1">
                  <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0 flex-1" placeholder="e.g. 50,000" value={form.quantity} onChange={f("quantity")} data-testid="input-quantity" />
                  <Select value={form.unit} onValueChange={(v) => setForm(p => ({ ...p, unit: v }))}>
                    <SelectTrigger className="h-8 text-xs w-20 border-0 shadow-none" data-testid="select-unit"><SelectValue /></SelectTrigger>
                    <SelectContent>{UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-[40px_130px_1fr] border-b">
                <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">04</div>
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Packing</div>
                <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. In Bulk / 50kg PP bags / Jumbo bags" value={form.packing} onChange={f("packing")} data-testid="input-packing" /></div>
              </div>
              <div className="grid grid-cols-[40px_130px_1fr] border-b">
                <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">05</div>
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Incoterms Terms</div>
                <div className="p-1">
                  <Select value={form.incoterms} onValueChange={(v) => setForm(p => ({ ...p, incoterms: v }))}>
                    <SelectTrigger className="h-8 text-xs border-0 shadow-none focus-visible:ring-0"><SelectValue /></SelectTrigger>
                    <SelectContent>{INCOTERM_OPTIONS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-[40px_130px_1fr] border-b">
                <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">06</div>
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Delivery Period</div>
                <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 15-30 April 2026" value={form.deliveryPeriod} onChange={f("deliveryPeriod")} data-testid="input-delivery-period" /></div>
              </div>
              <div className="grid grid-cols-[40px_130px_1fr] border-b">
                <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">07</div>
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Price</div>
                <div className="p-1 flex gap-1">
                  <Select value={form.currency} onValueChange={(v) => setForm(p => ({ ...p, currency: v }))}>
                    <SelectTrigger className="h-8 text-xs w-20 border-0 shadow-none" data-testid="select-currency"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0 flex-1" placeholder="e.g. 70 per MT" value={form.price} onChange={f("price")} data-testid="input-price" />
                </div>
              </div>
              <div className="grid grid-cols-[40px_130px_1fr] border-b">
                <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">08</div>
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Contract Confirmation</div>
                <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Subject to Producer's Confirmation of cargo" value={form.contractConfirmation} onChange={f("contractConfirmation")} data-testid="input-contract-confirmation" /></div>
              </div>
              <div className="border-b">
                <div className="grid grid-cols-[40px_1fr] border-b">
                  <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">09</div>
                  <div className="p-2 text-xs font-medium text-muted-foreground">Commodity Specifications</div>
                </div>
                <div className="px-2 py-1.5">
                  <div className="border rounded-md overflow-hidden">
                    <div className="grid grid-cols-[1fr_1fr_1fr_1fr_32px] bg-muted/50 border-b">
                      <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Parameter</div>
                      <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase border-l">Specification</div>
                      <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase border-l">Rejection Limit</div>
                      <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase border-l">Test Method</div>
                      <div className="border-l" />
                    </div>
                    {specRows.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_1fr_32px] border-b last:border-b-0">
                        <div className="p-0.5"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Al2O3" value={row.parameter} onChange={(e) => setSpecRows(rows => rows.map((r, i) => i === idx ? { ...r, parameter: e.target.value } : r))} data-testid={`input-spec-param-${idx}`} /></div>
                        <div className="p-0.5 border-l"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 45% min" value={row.specification} onChange={(e) => setSpecRows(rows => rows.map((r, i) => i === idx ? { ...r, specification: e.target.value } : r))} data-testid={`input-spec-value-${idx}`} /></div>
                        <div className="p-0.5 border-l"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. < 40%" value={row.rejection} onChange={(e) => setSpecRows(rows => rows.map((r, i) => i === idx ? { ...r, rejection: e.target.value } : r))} data-testid={`input-spec-reject-${idx}`} /></div>
                        <div className="p-0.5 border-l"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. ASTM D4326" value={row.testMethod} onChange={(e) => setSpecRows(rows => rows.map((r, i) => i === idx ? { ...r, testMethod: e.target.value } : r))} data-testid={`input-spec-method-${idx}`} /></div>
                        <div className="flex items-center justify-center border-l">
                          {specRows.length > 1 && (
                            <button type="button" onClick={() => setSpecRows(rows => rows.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive" data-testid={`button-remove-spec-${idx}`}>
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="mt-1 h-6 text-[10px] text-muted-foreground" onClick={() => setSpecRows(rows => [...rows, { parameter: "", specification: "", rejection: "", testMethod: "" }])} data-testid="button-add-spec-row">
                    <Plus className="w-3 h-3 mr-1" /> Add Row
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-[40px_130px_1fr] border-b">
                <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">10</div>
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Payment Terms</div>
                <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. By DLC at Sight" value={form.paymentTerms} onChange={f("paymentTerms")} data-testid="input-payment-terms" /></div>
              </div>
              <div className="grid grid-cols-[40px_130px_1fr] border-b">
                <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">11</div>
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Performance Bond</div>
                <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 2% Performance Bond via MT760" value={form.performanceBond} onChange={f("performanceBond")} data-testid="input-performance-bond" /></div>
              </div>
              <div className="grid grid-cols-[40px_130px_1fr] border-b">
                <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">12</div>
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Attach Documents</div>
                <div className="p-2 flex items-center gap-3">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setPendingFiles(prev => [...prev, ...files]);
                        e.target.value = "";
                      }}
                      data-testid="input-attach-docs"
                    />
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-muted/60 transition-colors">
                      <Upload className="w-3.5 h-3.5" /> Attach File
                    </span>
                  </label>
                  {pendingFiles.length > 0 && (
                    <div className="flex-1 space-y-1">
                      {pendingFiles.map((file, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <FileText className="w-3 h-3 shrink-0" />
                          <span className="truncate">{file.name}</span>
                          <button type="button" onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))} className="shrink-0 hover:text-destructive" data-testid={`button-remove-file-${i}`}>
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {pendingFiles.length === 0 && (
                    <span className="text-xs text-muted-foreground">No files attached</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-[40px_130px_1fr] border-b">
                <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">13</div>
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-start pt-2">Other Terms</div>
                <div className="p-1"><Textarea className="text-xs border-0 shadow-none focus-visible:ring-0 min-h-[60px]" placeholder="Other terms and conditions..." value={form.otherTerms} onChange={f("otherTerms")} rows={3} data-testid="input-other-terms" /></div>
              </div>
              <div className="grid grid-cols-[40px_130px_1fr]">
                <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">14</div>
                <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-start pt-2">Compliance</div>
                <div className="p-1"><Textarea className="text-xs border-0 shadow-none focus-visible:ring-0 min-h-[40px]" placeholder="Buyer/Seller KYC should be completed" value={form.compliance} onChange={f("compliance")} rows={2} data-testid="input-compliance" /></div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="closing" className="border rounded-md mb-2">
          <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
            <span className="flex items-center gap-1.5"><FileSignature className="w-3.5 h-3.5" /> Closing & Logistics</span>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Loading Port</Label>
                <Input className="h-8 text-xs mt-1" placeholder="e.g. Kamsar, Guinea" value={form.loadingPort} onChange={f("loadingPort")} data-testid="input-loading-port" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Discharge Port</Label>
                <Input className="h-8 text-xs mt-1" placeholder="e.g. Rizhao, China" value={form.dischargePort} onChange={f("dischargePort")} data-testid="input-discharge-port" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Producer / Supplier</Label>
              <Input className="h-8 text-xs mt-1" placeholder="e.g. Mining Corp Ltd" value={form.producer} onChange={f("producer")} data-testid="input-producer" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Special Notes</Label>
              <Textarea className="text-xs mt-1" placeholder="Any additional notes or special conditions" value={form.additionalInfo} onChange={f("additionalInfo")} rows={2} data-testid="input-additional-info" />
            </div>
          </AccordionContent>
        </AccordionItem>

      </Accordion>

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit-enquiry">
          {createMutation.isPending ? "Creating..." : "Submit Enquiry"}
        </Button>
        <Button variant="outline" onClick={handleCancel} data-testid="button-cancel-enquiry">
          Cancel
        </Button>
      </div>
    </div>
  );
}
