import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  FileText,
  CheckCircle2,
  Clock,
  FileCheck,
  Eye,
  Pencil,
  Save,
  X,
  User,
  Building2,
  Send,
  ShieldCheck,
  FileSignature,
  ScrollText,
  Handshake,
  ClipboardList,
  Landmark,
  BadgeDollarSign,
  PackageCheck,
  Download,
  Package,
  Plus,
  Trash2,
  ArrowRight,
  AlertCircle,
  Mail,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  ClipboardCheck,
  CheckSquare,
  Square,
  ListChecks,
  XCircle,
  Lock,
  Ship,
  Anchor,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import SignaturePad from "@/components/signature-pad";
import type { Document as Doc, KycApplication, Trade } from "@shared/schema";

const docTypes = [
  { value: "LOI", label: "Purchase Letter of Intent", short: "LOI", description: "Buyer's formal expression of intent to purchase a commodity with full trade terms", icon: ScrollText },
  { value: "FCO", label: "Full Corporate Offer", short: "FCO", description: "Binding irrevocable offer with complete trade terms and conditions", icon: ShieldCheck },
  { value: "SCO", label: "Soft Corporate Offer", short: "SCO", description: "Seller's conditional offer issued in response to an accepted LOI", icon: Handshake },
  { value: "DEAL_RECAP", label: "Deal Recap", short: "Deal Recap", description: "Comprehensive summary of agreed trade terms between buyer and seller", icon: Send },
  { value: "ICPO", label: "Irrevocable Corporate Purchase Order", short: "ICPO", description: "Buyer's binding commitment to purchase the specified commodity", icon: ClipboardList },
  { value: "SPA", label: "Sales & Purchase Agreement", short: "SPA", description: "Full legal contract between buyer and seller covering all trade terms", icon: FileSignature },
  { value: "LC", label: "Letter of Credit", short: "LC", description: "Bank-issued payment guarantee for commodity trade settlement", icon: Landmark },
  { value: "POP", label: "Proof of Product", short: "POP", description: "Evidence confirming the availability and existence of the commodity", icon: PackageCheck },
  { value: "POF", label: "Proof of Funds", short: "POF", description: "Documentation verifying the buyer's financial capacity for the transaction", icon: BadgeDollarSign },
  { value: "BCL", label: "Bank Comfort Letter", short: "BCL", description: "Bank confirmation of client's financial standing and LC capability", icon: Handshake },
  { value: "NCNDA", label: "Non-Circumvention Non-Disclosure", short: "NCNDA", description: "Mutual agreement protecting confidential information and preventing circumvention of business relationships", icon: Lock },
  { value: "BL", label: "Bill of Lading", short: "BL", description: "CONGENBILL Edition 1994 — shipped-on-board bill of lading for charter party trades", icon: Ship },
];

export default function DocumentGenerator() {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<typeof docTypes[0] | null>(null);
  const [title, setTitle] = useState("");
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
  const [commodity, setCommodity] = useState("");
  const [origin, setOrigin] = useState("");
  const [quantity, setQuantity] = useState("");
  const [qualitySpecs, setQualitySpecs] = useState("");
  const emptySpecRows = () => [
    { parameter: "", specification: "", rejection: "" },
    { parameter: "", specification: "", rejection: "" },
    { parameter: "", specification: "", rejection: "" },
    { parameter: "", specification: "", rejection: "" },
    { parameter: "", specification: "", rejection: "" },
  ];
  const [specRows, setSpecRows] = useState(emptySpecRows());
  const updateSpecRow = (idx: number, field: string, val: string) => {
    const updated = [...specRows];
    (updated[idx] as any)[field] = val;
    setSpecRows(updated);
    const serialized = updated
      .filter(r => r.parameter || r.specification || r.rejection)
      .map(r => `${r.parameter}: ${r.specification}${r.rejection ? ` (Rejection: ${r.rejection})` : ""}`)
      .join("\n");
    setQualitySpecs(serialized);
  };
  const addSpecRow = () => {
    setSpecRows([...specRows, { parameter: "", specification: "", rejection: "" }]);
  };
  const removeSpecRow = (idx: number) => {
    if (specRows.length <= 1) return;
    const updated = specRows.filter((_, i) => i !== idx);
    setSpecRows(updated);
    const serialized = updated
      .filter(r => r.parameter || r.specification || r.rejection)
      .map(r => `${r.parameter}: ${r.specification}${r.rejection ? ` (Rejection: ${r.rejection})` : ""}`)
      .join("\n");
    setQualitySpecs(serialized);
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
  const [viewDoc, setViewDoc] = useState<Doc | null>(null);
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [reviewContent, setReviewContent] = useState<string | null>(null);
  const [signParty, setSignParty] = useState<"buyer" | "seller" | null>(null);
  const [signDocId, setSignDocId] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");

  const urlParams = new URLSearchParams(window.location.search);
  const urlTradeRef = urlParams.get("tradeRef");
  const urlEnquiryRef = urlParams.get("enquiryRef");
  const [tradePrefilled, setTradePrefilled] = useState(false);

  const { data: allTrades } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
    enabled: !!urlTradeRef,
  });

  useEffect(() => {
    if (urlTradeRef && allTrades && !tradePrefilled) {
      const trade = allTrades.find((t) => t.tradeRef === urlTradeRef);
      if (trade) {
        setCommodity(trade.commodity || "");
        setOrigin(trade.origin || "");
        setQuantity(`${trade.quantity || ""} ${trade.unit || "MT"}`);
        setPrice(`${trade.pricePerUnit || ""}`);
        setCurrency(trade.currency || "USD");
        setIncoterm(trade.incoterm || "");
        setBuyerName(trade.buyerName || "");
        setSellerName(trade.sellerName || "");
        setTradePrefilled(true);
        toast({ title: "Trade loaded", description: `Pre-filled from trade ${trade.tradeRef}` });
      }
    }
  }, [urlTradeRef, allTrades, tradePrefilled]);

  const { data: docs, isLoading: docsLoading } = useQuery<Doc[]>({
    queryKey: ["/api/documents"],
  });

  const { data: kycClients } = useQuery<KycApplication[]>({
    queryKey: ["/api/kyc"],
  });

  const approvedClients = kycClients?.filter((k) => k.status === "approved") || [];

  const fillFromKyc = (kyc: KycApplication, role: "buyer" | "seller") => {
    const setName = role === "buyer" ? setBuyerName : setSellerName;
    const setAddress = role === "buyer" ? setBuyerAddress : setSellerAddress;
    const setContact = role === "buyer" ? setBuyerContact : setSellerContact;
    const setBank = role === "buyer" ? setBuyerBank : setSellerBank;
    const setSwift = role === "buyer" ? setBuyerSwift : setSellerSwift;
    setName(kyc.companyName || "");
    setAddress(kyc.registeredAddress || "");
    setContact([kyc.contactName, kyc.contactEmail].filter(Boolean).join(" — "));
    setBank(kyc.bankName || "");
    setSwift(kyc.swiftCode || "");
  };

  const resetForm = () => {
    setSelectedType(null);
    setTitle("");
    setBuyerName(""); setBuyerAddress(""); setBuyerContact(""); setBuyerBank(""); setBuyerSwift("");
    setSellerName(""); setSellerAddress(""); setSellerContact(""); setSellerBank(""); setSellerSwift("");
    setCommodity(""); setOrigin(""); setQuantity(""); setQualitySpecs(""); setSpecRows(emptySpecRows()); setLoadingPort(""); setDischargePort("");
    setPrice(""); setCurrency("USD"); setIncoterm(""); setLaycan(""); setPaymentTerms("");
    setAnalysisAgency(""); setAnalysisAgencyContact(""); setValidity(""); setRefPerson("");
    setContractConfirmation(""); setDocsForPayment(""); setOtherTerms(""); setCompliance("");
    setRecapValidity(""); setDeliveryBasis(""); setLoadingWindow(""); setShippingTerms("");
    setGoverningLaw(""); setAnnexSpecs(""); setQualityPremiums(""); setSpecialNote("");
    setBlVesselName(""); setBlNotifyParty(""); setBlPacking(""); setBlCharterPartyDate("");
    setBlFreightAdvance(""); setBlLoadingTimeDays(""); setBlLoadingTimeHours("");
    setBlPlaceOfIssue(""); setBlDateOfIssue(""); setBlCompanyOnBehalf(""); setBlMasterOfVessel(""); setBlAgentsName("");
    setReviewContent(null);
  };

  const buildPayload = () => ({
    docType: selectedType!.value,
    title,
    tradeRef: urlTradeRef || undefined,
    enquiryRef: urlEnquiryRef || undefined,
    buyerDetails: {
      name: buyerName, address: buyerAddress, contact: buyerContact,
      bank: buyerBank, swift: buyerSwift,
    },
    sellerDetails: {
      name: sellerName, address: sellerAddress, contact: sellerContact,
      bank: sellerBank, swift: sellerSwift,
    },
    productDetails: {
      commodity, origin, quantity, qualitySpecs, loadingPort, dischargePort,
      price, currency, incoterm, laycan, paymentTerms,
      analysisAgency, analysisAgencyContact, validity, refPerson,
      contractConfirmation, docsForPayment, otherTerms, compliance,
      recapValidity, deliveryBasis, loadingWindow, shippingTerms,
      governingLaw, annexSpecs, qualityPremiums, specialNote,
      vesselName: blVesselName, notifyParty: blNotifyParty, packing: blPacking,
      charterPartyDate: blCharterPartyDate, freightAdvance: blFreightAdvance,
      loadingTimeDays: blLoadingTimeDays, loadingTimeHours: blLoadingTimeHours,
      placeOfIssue: blPlaceOfIssue, dateOfIssue: blDateOfIssue,
      companyOnBehalf: blCompanyOnBehalf, masterOfVessel: blMasterOfVessel, agentsName: blAgentsName,
    },
  });

  const previewDoc = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/documents/preview", data);
      return res.json();
    },
    onSuccess: (result: { content: string }) => {
      if (!result.content) {
        toast({ title: "Preview Failed", description: "Document content could not be generated. Please try again.", variant: "destructive" });
        return;
      }
      setReviewContent(result.content);
    },
    onError: (error: Error) => {
      toast({ title: "Preview Failed", description: error.message, variant: "destructive" });
    },
  });

  const generateDoc = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/documents", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      resetForm();
      setReviewContent(null);
      toast({ title: "Document Generated", description: "Trade document has been created successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Generation Failed", description: error.message, variant: "destructive" });
    },
  });

  const updateDoc = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Doc> }) => {
      const res = await apiRequest("PATCH", `/api/documents/${id}`, data);
      return res.json();
    },
    onSuccess: (updated: Doc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setEditDoc(null);
      setViewDoc(updated);
      toast({ title: "Document Amended", description: "Changes saved successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const signDoc = useMutation({
    mutationFn: async ({ id, party, signature, name }: { id: string; party: string; signature: string; name: string }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/sign`, { party, signature, name });
      return res.json();
    },
    onSuccess: (updated: Doc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setSignParty(null);
      setSignDocId(null);
      setSignerName("");
      setViewDoc(updated);
      toast({ title: "Document Signed", description: `${signParty === "buyer" ? "Buyer" : "Seller"} signature applied successfully.` });
    },
    onError: (error: Error) => {
      toast({ title: "Signing Failed", description: error.message, variant: "destructive" });
    },
  });

  const removeSignature = useMutation({
    mutationFn: async ({ id, party }: { id: string; party: string }) => {
      const res = await apiRequest("DELETE", `/api/documents/${id}/sign/${party}`);
      return res.json();
    },
    onSuccess: (updated: Doc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setViewDoc(updated);
      toast({ title: "Signature Removed", description: "Signature has been removed and documents regenerated." });
    },
    onError: (error: Error) => {
      toast({ title: "Remove Failed", description: error.message, variant: "destructive" });
    },
  });

  const convertToPdf = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/documents/${id}/convert-pdf`);
      return res.json();
    },
    onSuccess: (updated: Doc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setViewDoc(updated);
      toast({ title: "PDF Generated", description: "LOI has been converted to PDF and marked as complete." });
    },
    onError: (error: Error) => {
      toast({ title: "Conversion Failed", description: error.message, variant: "destructive" });
    },
  });

  const [sendDocId, setSendDocId] = useState<string | null>(null);
  const [sendEmail, setSendEmail] = useState("");
  const [sendClientId, setSendClientId] = useState("");
  const [sendCcEmail, setSendCcEmail] = useState("");
  const [respondDocId, setRespondDocId] = useState<string | null>(null);
  const [respondAction, setRespondAction] = useState<"accepted" | "rejected" | null>(null);
  const [amendmentNotes, setAmendmentNotes] = useState("");
  const [docTabFilter, setDocTabFilter] = useState<string>("all");
  const [reviewDocId, setReviewDocId] = useState<string | null>(null);
  const [reviewChecks, setReviewChecks] = useState<Array<{ label: string; checked: boolean }>>([]);
  const [reviewNotes, setReviewNotes] = useState("");

  const sendDoc = useMutation({
    mutationFn: async ({ id, recipientEmail, clientId, ccEmail }: { id: string; recipientEmail: string; clientId?: string; ccEmail?: string }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/send`, { recipientEmail, clientId, ccEmail });
      return res.json();
    },
    onSuccess: (updated: Doc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setSendDocId(null);
      setSendEmail("");
      setSendClientId("");
      setViewDoc(updated);
      toast({ title: "Document Sent", description: "Document has been sent to the client for review." });
    },
    onError: (error: Error) => {
      toast({ title: "Send Failed", description: error.message, variant: "destructive" });
    },
  });

  const respondToDoc = useMutation({
    mutationFn: async ({ id, response, notes }: { id: string; response: string; notes?: string }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/respond`, { response, amendmentNotes: notes });
      return res.json();
    },
    onSuccess: (updated: Doc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setRespondDocId(null);
      setRespondAction(null);
      setAmendmentNotes("");
      setViewDoc(updated);
      toast({ title: "Response Recorded", description: `Document has been ${updated.recipientResponse}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Response Failed", description: error.message, variant: "destructive" });
    },
  });

  const createNextDoc = useMutation({
    mutationFn: async ({ id, nextDocType }: { id: string; nextDocType: string }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/create-next`, { nextDocType });
      return res.json();
    },
    onSuccess: (newDoc: Doc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setViewDoc(newDoc);
      toast({ title: "Document Created", description: `${newDoc.docType} has been created from accepted document.` });
    },
    onError: (error: Error) => {
      toast({ title: "Creation Failed", description: error.message, variant: "destructive" });
    },
  });

  const adminReview = useMutation({
    mutationFn: async ({ id, adminChecks, adminReviewNotes, action }: { id: string; adminChecks: Array<{ label: string; checked: boolean }>; adminReviewNotes: string; action?: string }) => {
      const res = await apiRequest("PATCH", `/api/documents/${id}/admin-review`, { adminChecks, adminReviewNotes, action });
      return res.json();
    },
    onSuccess: (updated: Doc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setViewDoc(updated);
      if (updated.status === "draft") {
        setReviewDocId(null);
        toast({ title: "Document Approved", description: "Document is now ready for signing." });
      } else if (updated.status === "rejected") {
        setReviewDocId(null);
        toast({ title: "Document Rejected", description: "Document has been rejected and returned for amendment." });
      } else {
        toast({ title: "Review Saved", description: "Admin review progress saved." });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Review Failed", description: error.message, variant: "destructive" });
    },
  });

  const openAdminReview = (doc: Doc) => {
    const checks = (doc.adminChecks as Array<{ label: string; checked: boolean }> | null) || [];
    setReviewChecks([...checks]);
    setReviewNotes(doc.adminReviewNotes || "");
    setReviewDocId(doc.id);
    setViewDoc(doc);
  };

  const toggleReviewCheck = (idx: number) => {
    setReviewChecks(prev => prev.map((c, i) => i === idx ? { ...c, checked: !c.checked } : c));
  };

  const getStatusBadge = (doc: Doc) => {
    const s = doc.status;
    const r = doc.recipientResponse;
    if (s === "pending_review") return { label: "Pending Review", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", icon: ListChecks };
    if (s === "accepted" || r === "accepted") return { label: "Accepted", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: ThumbsUp };
    if (s === "rejected") return { label: "Rejected", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: XCircle };
    if (r === "rejected") return { label: "Amendment Needed", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: AlertCircle };
    if (s === "sent" || r === "pending") return { label: "Sent", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: Mail };
    if (s === "final") return { label: "Final", color: "bg-primary text-primary-foreground", icon: CheckCircle2 };
    if (s === "draft") return { label: "Ready to Sign", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200", icon: FileSignature };
    return { label: s, color: "", icon: Clock };
  };

  const getNextDocType = (doc: Doc): string | null => {
    if (doc.recipientResponse !== "accepted") return null;
    if (doc.docType === "LOI") return "SCO";
    if (doc.docType === "SCO" || doc.docType === "FCO") return "DEAL_RECAP";
    if (doc.docType === "DEAL_RECAP") return "SPA";
    return null;
  };

  const canSend = (doc: Doc): boolean => {
    if (doc.status === "sent" || doc.status === "accepted" || doc.status === "final") return false;
    if (doc.docType === "NCNDA") return !!(doc.sellerSignature || doc.buyerSignature);
    return !!doc.buyerSignature;
  };

  const openSignDialog = (docId: string, party: "buyer" | "seller") => {
    setSignDocId(docId);
    setSignParty(party);
    setSignerName("");
  };

  const handleSignature = (dataUrl: string) => {
    if (!signDocId || !signParty || !signerName.trim()) {
      toast({ title: "Name Required", description: "Please enter the signer's name.", variant: "destructive" });
      return;
    }
    signDoc.mutate({ id: signDocId, party: signParty, signature: dataUrl, name: signerName });
  };

  const handleReview = () => {
    if (!selectedType || !title) {
      toast({ title: "Missing Fields", description: "Please enter a document title.", variant: "destructive" });
      return;
    }
    previewDoc.mutate(buildPayload());
  };

  const handleGenerate = () => {
    if (!selectedType || !title) {
      toast({ title: "Missing Fields", description: "Please enter a document title.", variant: "destructive" });
      return;
    }
    generateDoc.mutate(buildPayload());
  };

  const urlEnqProduct = urlParams.get("enqProduct") || "";
  const urlEnqQuantity = urlParams.get("enqQuantity") || "";
  const urlEnqOrigin = urlParams.get("enqOrigin") || "";
  const urlEnqIncoterm = urlParams.get("enqIncoterm") || "";
  const urlEnqSpecs = urlParams.get("enqSpecs") || "";
  const urlEnqValidity = urlParams.get("enqValidity") || "";
  const urlEnqCreatedBy = urlParams.get("enqCreatedBy") || "";
  const urlEnqEmail = urlParams.get("enqEmail") || "";

  const getLoiDefaultValidity = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " (2000HRS Dubai Time)";
  };

  const openTemplateDialog = (dt: typeof docTypes[0]) => {
    setSelectedType(dt);
    if (urlEnquiryRef) {
      setTitle(`${dt.short} - ${urlEnquiryRef}`);
      setCommodity(urlEnqProduct);
      setQuantity(urlEnqQuantity.trim());
      setOrigin(urlEnqOrigin);
      setLoadingPort(urlEnqOrigin);
      setIncoterm(urlEnqIncoterm);
      setQualitySpecs(urlEnqSpecs);
      setValidity(dt.value === "LOI" ? (urlEnqValidity || getLoiDefaultValidity()) : urlEnqValidity);
      setRefPerson(urlEnqCreatedBy);
      if (urlEnqEmail) {
        setBuyerContact(urlEnqEmail);
      }
    } else if (urlTradeRef && tradePrefilled) {
      setTitle(`${dt.short} - ${urlTradeRef}`);
      if (dt.value === "LOI") setValidity(getLoiDefaultValidity());
    } else {
      setTitle("");
      setBuyerName(""); setBuyerAddress(""); setBuyerContact(""); setBuyerBank(""); setBuyerSwift("");
      setSellerName(""); setSellerAddress(""); setSellerContact(""); setSellerBank(""); setSellerSwift("");
      setCommodity(""); setOrigin(""); setQuantity(""); setQualitySpecs(""); setLoadingPort(""); setDischargePort("");
      setPrice(""); setCurrency("USD"); setIncoterm(""); setLaycan(""); setPaymentTerms("");
      setAnalysisAgency(""); setAnalysisAgencyContact(""); setRefPerson("");
      setValidity(dt.value === "LOI" ? getLoiDefaultValidity() : "");
      setContractConfirmation(""); setDocsForPayment(""); setOtherTerms(""); setCompliance("");
      setRecapValidity(""); setDeliveryBasis(""); setLoadingWindow(""); setShippingTerms("");
      setGoverningLaw(""); setAnnexSpecs(""); setQualityPremiums(""); setSpecialNote("");
    }
  };

  useEffect(() => {
    if (selectedType?.value === "LOI" && buyerName.trim().length >= 1) {
      fetch(`/api/documents/next-loi-number?buyerName=${encodeURIComponent(buyerName)}`, { credentials: "include" })
        .then(r => r.json())
        .then(d => { if (d.issueNumber) setLoiIssueNumber(d.issueNumber); })
        .catch(() => {});
    } else {
      setLoiIssueNumber("");
    }
  }, [selectedType?.value, buyerName]);

  const fetchFreshDoc = async (id: string): Promise<Doc> => {
    const res = await fetch(`/api/documents/${id}`);
    if (!res.ok) throw new Error("Failed to fetch document");
    return res.json();
  };

  const openView = async (doc: Doc) => {
    try {
      const fresh = await fetchFreshDoc(doc.id);
      setViewDoc(fresh);
      setEditDoc(null);
      if (fresh.status === "pending_review") {
        setReviewChecks((fresh.adminChecks as Array<{ label: string; checked: boolean }> | null) || []);
        setReviewNotes(fresh.adminReviewNotes || "");
      }
    } catch {
      setViewDoc(doc);
      setEditDoc(null);
      if (doc.status === "pending_review") {
        setReviewChecks((doc.adminChecks as Array<{ label: string; checked: boolean }> | null) || []);
        setReviewNotes(doc.adminReviewNotes || "");
      }
    }
  };

  const openEdit = async (doc: Doc) => {
    try {
      const fresh = await fetchFreshDoc(doc.id);
      setEditDoc(fresh);
      setViewDoc(null);
      setEditTitle(fresh.title);
      setEditContent(fresh.content || "");
      setEditStatus(fresh.status);
    } catch {
      setEditDoc(doc);
      setViewDoc(null);
      setEditTitle(doc.title);
      setEditContent(doc.content || "");
      setEditStatus(doc.status);
    }
  };

  const handleSaveAmend = () => {
    if (!editDoc) return;
    const newStatus = editDoc.status === "rejected" ? "draft" : editStatus;
    updateDoc.mutate({
      id: editDoc.id,
      data: { title: editTitle, content: editContent, status: newStatus },
    });
  };

  const isLoading = docsLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-docgen-title">
          Document Templates
        </h1>
        <p className="text-sm text-muted-foreground">
          Select a template to generate trade documents linked to blockchain-verified transactions
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {docTypes.map((dt) => {
          const Icon = dt.icon;
          const count = docs?.filter(d => d.docType === dt.value).length || 0;
          return (
            <Card
              key={dt.value}
              className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md group"
              onClick={() => openTemplateDialog(dt)}
              data-testid={`template-box-${dt.value}`}
            >
              <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{dt.short}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{dt.label}</p>
                </div>
                {count > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {count} generated
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card data-testid="card-doc-list">
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
          <CardTitle className="text-base font-semibold">Generated Documents</CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            {docs?.length || 0} documents
          </Badge>
        </CardHeader>
        <div className="px-6 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: "all", label: "All", count: docs?.length || 0 },
              { key: "NCNDA", label: "NCNDA", count: docs?.filter(d => d.docType === "NCNDA").length || 0 },
              { key: "LOI", label: "LOI", count: docs?.filter(d => d.docType === "LOI").length || 0 },
              { key: "SCO", label: "SCO", count: docs?.filter(d => d.docType === "SCO").length || 0 },
              { key: "DEAL_RECAP", label: "Deal Recap", count: docs?.filter(d => d.docType === "DEAL_RECAP").length || 0 },
              { key: "SPA", label: "SPA", count: docs?.filter(d => d.docType === "SPA").length || 0 },
              { key: "BL", label: "BL", count: docs?.filter(d => d.docType === "BL").length || 0 },
              { key: "pending", label: "Pending Review", count: docs?.filter(d => d.status === "pending_review").length || 0 },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setDocTabFilter(tab.key)}
                data-testid={`tab-doc-${tab.key}`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${docTabFilter === tab.key ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted"}`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-semibold ${docTabFilter === tab.key ? "bg-white/20" : tab.key === "pending" && tab.count > 0 ? "bg-amber-500 text-white" : "bg-muted-foreground/20"}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <CardContent>
          {(() => {
            const filteredDocs = docs?.filter(doc => {
              if (docTabFilter === "all") return true;
              if (docTabFilter === "pending") return doc.status === "pending_review";
              return doc.docType === docTabFilter;
            }) || [];
            return filteredDocs.length > 0 ? (
            <div className="space-y-2">
              {filteredDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted"
                  data-testid={`doc-row-${doc.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileCheck className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{doc.title}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {doc.docType}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {doc.issueNumber ? doc.issueNumber : doc.dealRecapNumber ? doc.dealRecapNumber : doc.enquiryRef ? `Enq: ${doc.enquiryRef}` : doc.tradeRef ? `Trade: ${doc.tradeRef}` : "Standalone"}
                        {" "}&middot;{" "}
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(() => {
                      const sb = getStatusBadge(doc);
                      const SbIcon = sb.icon;
                      return (
                        <Badge className={`text-[10px] capitalize ${sb.color}`} data-testid={`badge-status-${doc.id}`}>
                          <SbIcon className="w-3 h-3 mr-0.5" />
                          {sb.label}
                        </Badge>
                      );
                    })()}
                    {(doc.docType === "NCNDA" ? doc.sellerSignature : doc.buyerSignature) && (
                      <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid={`badge-signed-${doc.id}`}>
                        <FileSignature className="w-3 h-3 mr-0.5" />
                        {doc.docType === "NCNDA" ? "Party A Signed" : "Signed"}
                      </Badge>
                    )}
                    {doc.docType === "NCNDA" && doc.buyerSignature && (
                      <Badge className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" data-testid={`badge-partyb-signed-${doc.id}`}>
                        <FileSignature className="w-3 h-3 mr-0.5" />
                        Party B Signed
                      </Badge>
                    )}
                    {doc.recipientResponse === "rejected" && (
                      <Badge className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid={`badge-rejected-${doc.id}`}>
                        <AlertCircle className="w-3 h-3 mr-0.5" />
                        Amendment Needed
                      </Badge>
                    )}
                    {canSend(doc) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-primary hover:text-primary/80"
                        onClick={() => { setSendDocId(doc.id); setSendEmail(doc.sellerEmail || doc.buyerEmail || ""); setSendClientId(""); }}
                        title="Send to client"
                        data-testid={`button-send-${doc.id}`}
                      >
                        <Send className="w-3.5 h-3.5 mr-1" />
                        Send
                      </Button>
                    )}
                    {doc.status === "accepted" && (() => { const next = getNextDocType(doc); return next ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-green-600 hover:text-green-700"
                        onClick={() => createNextDoc.mutate({ id: doc.id, nextDocType: next })}
                        disabled={createNextDoc.isPending}
                        title={`Generate ${next}`}
                        data-testid={`button-generate-next-${doc.id}`}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Generate {next}
                      </Button>
                    ) : null; })()}
                    {doc.docxPath && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => window.open(`/api/documents/${doc.id}/download/docx`, "_blank")}
                        title="Download DOCX"
                        data-testid={`button-download-docx-${doc.id}`}
                      >
                        <Download className="w-4 h-4 text-blue-600" />
                      </Button>
                    )}
                    {(doc.docType === "NCNDA" ? (doc.sellerSignature || doc.buyerSignature) : doc.buyerSignature) && !doc.pdfPath && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-orange-600 hover:text-orange-700"
                        onClick={() => convertToPdf.mutate(doc.id)}
                        disabled={convertToPdf.isPending}
                        title="Convert to PDF"
                        data-testid={`button-convert-pdf-${doc.id}`}
                      >
                        <FileCheck className="w-4 h-4 mr-1" />
                        {convertToPdf.isPending ? "Converting..." : "Convert to PDF"}
                      </Button>
                    )}
                    {doc.pdfPath && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => window.open(`/api/documents/${doc.id}/download/pdf`, "_blank")}
                        title="Download PDF"
                        data-testid={`button-download-pdf-${doc.id}`}
                      >
                        <FileText className="w-4 h-4 text-red-600" />
                      </Button>
                    )}
                    {doc.status === "pending_review" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-50 dark:text-amber-400"
                        onClick={() => openAdminReview(doc)}
                        title="Admin review checklist"
                        data-testid={`button-admin-review-${doc.id}`}
                      >
                        <ClipboardCheck className="w-3.5 h-3.5 mr-1" />
                        Review
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openView(doc)}
                      data-testid={`button-view-doc-${doc.id}`}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(doc)}
                      data-testid={`button-amend-doc-${doc.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm font-medium">No documents found</p>
              <p className="text-xs">{docTabFilter !== "all" ? "No documents in this category" : "Select a template above to generate trade documents"}</p>
            </div>
          );
          })()}
        </CardContent>
      </Card>

      <Dialog open={!!selectedType} onOpenChange={(open) => { if (!open) { resetForm(); } }}>
        <DialogContent className={reviewContent ? "max-w-3xl max-h-[90vh] overflow-y-auto" : (selectedType?.value === "DEAL_RECAP" || selectedType?.value === "LOI" || selectedType?.value === "NCNDA" || selectedType?.value === "BL") ? "max-w-2xl max-h-[90vh] overflow-y-auto" : "max-w-lg max-h-[85vh] overflow-y-auto"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-generate-dialog-title">
              {selectedType && (() => { const Icon = selectedType.icon; return <Icon className="w-5 h-5 text-primary" />; })()}
              {reviewContent ? `Review ${selectedType?.short}` : `Generate ${selectedType?.short}`}
            </DialogTitle>
          </DialogHeader>
          {selectedType && reviewContent && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Eye className="w-4 h-4" />
                Review the document below. If everything looks correct, click "Generate DOCX" to create the final document.
              </div>
              <div className="p-4 rounded-lg border bg-muted/30 whitespace-pre-wrap text-sm font-mono leading-relaxed max-h-[60vh] overflow-y-auto" data-testid="text-review-content">
                {reviewContent}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setReviewContent(null)} data-testid="button-back-to-edit">
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Back to Edit
                </Button>
                <Button onClick={handleGenerate} disabled={generateDoc.isPending} data-testid="button-confirm-generate">
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  {generateDoc.isPending ? "Generating..." : "Generate DOCX"}
                </Button>
              </div>
            </div>
          )}
          {selectedType && !reviewContent && selectedType.value === "DEAL_RECAP" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>
              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input placeholder="Enter Deal Recap document title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-doc-title" />
              </div>

              <Accordion type="multiple" defaultValue={["ch1","ch2","ch3","ch4","signatory","annex"]} className="w-full">

                <AccordionItem value="ch1" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Chapter I — Introductory & Background</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[140px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Item</div><div className="p-2">Description</div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Contract Reference</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Auto-filled from trade or enter manually" value={urlTradeRef || ""} readOnly={!!urlTradeRef} data-testid="input-contract-ref" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Effective Date</div>
                        <div className="p-2 text-xs text-muted-foreground flex items-center">Date of last authorized signature</div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Seller</div>
                        <div className="p-1">
                          {approvedClients.length > 0 && (
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "seller"); }}>
                              <SelectTrigger className="h-7 text-xs mb-1" data-testid="select-seller-kyc-trigger"><SelectValue placeholder="Select from KYC..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Seller company name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} data-testid="input-seller-name" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Buyer</div>
                        <div className="p-1">
                          {approvedClients.length > 0 && (
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "buyer"); }}>
                              <SelectTrigger className="h-7 text-xs mb-1" data-testid="select-buyer-kyc-trigger"><SelectValue placeholder="Select from KYC..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Buyer company name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} data-testid="input-buyer-name" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Legal Model</div>
                        <div className="p-2 text-xs text-muted-foreground flex items-center">Sales and Purchase Agreement (SPA)</div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Recap Validity</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Valid for 5 calendar days from issuance" value={recapValidity} onChange={(e) => setRecapValidity(e.target.value)} data-testid="input-recap-validity" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="ch2" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Chapter II — Scope & Commercial Terms</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[140px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Item</div><div className="p-2">Description</div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Commodity</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Iron Ore, Copper Cathode, Gasoil 10ppm" value={commodity} onChange={(e) => setCommodity(e.target.value)} data-testid="input-commodity" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Country of Origin</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Russia, Guinea, Australia" value={origin} onChange={(e) => setOrigin(e.target.value)} data-testid="input-origin" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Quality / Spec</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Anode Grade, Fe 63.5% min" value={qualitySpecs} onChange={(e) => setQualitySpecs(e.target.value)} data-testid="input-quality-specs" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Delivery Basis</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. FOB Vessel, CIF Discharge Port" value={deliveryBasis} onChange={(e) => setDeliveryBasis(e.target.value)} data-testid="input-delivery-basis" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Contractual Qty</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 50,000 MT +/- 10%" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="input-quantity" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="ch3" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><BadgeDollarSign className="w-3.5 h-3.5" /> Chapter III — Financial & Operational Arrangements</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[140px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Item</div><div className="p-2">Description</div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Price & Currency</div>
                        <div className="p-1 flex gap-1">
                          <Select value={currency} onValueChange={setCurrency}>
                            <SelectTrigger className="h-8 text-xs w-20" data-testid="select-currency"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="GBP">GBP</SelectItem>
                              <SelectItem value="AED">AED</SelectItem>
                              <SelectItem value="CNY">CNY</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0 flex-1" placeholder="e.g. 250 per MT" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="input-price" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Payment Terms</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. LC at Sight, PB: 2%" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} data-testid="input-payment-terms" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Loading Window</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 10-15th March 2026" value={loadingWindow} onChange={(e) => setLoadingWindow(e.target.value)} data-testid="input-loading-window" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Shipping Terms</div>
                        <div className="p-1"><Textarea className="text-xs border-0 shadow-none focus-visible:ring-0 min-h-[60px]" placeholder={"Delivery Term: CIF\nPort of Discharge (POD): Qingdao, China"} value={shippingTerms} onChange={(e) => setShippingTerms(e.target.value)} rows={2} data-testid="input-shipping-terms" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="ch4" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Landmark className="w-3.5 h-3.5" /> Chapter IV — Miscellaneous & Boilerplate</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[140px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Item</div><div className="p-2">Description</div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Governing Law</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. DIFC Dubai, English Law, LCIA" value={governingLaw} onChange={(e) => setGoverningLaw(e.target.value)} data-testid="input-governing-law" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Industry Standards</div>
                        <div className="p-2 text-xs text-muted-foreground flex items-center">Applicable international industry standards and ICC rules</div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="signatory" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><FileSignature className="w-3.5 h-3.5" /> Signatory Details</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="border rounded-md overflow-hidden">
                        <div className="text-xs font-semibold p-2 bg-muted/60 border-b">For and on behalf of the Seller</div>
                        <div className="p-2 space-y-2">
                          <Input className="h-8 text-xs" placeholder="Seller company name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} data-testid="input-seller-name-sig" />
                          <Input className="h-8 text-xs" placeholder="Name & email (e.g. VK — VK@BULLFROG.AE)" value={sellerContact} onChange={(e) => setSellerContact(e.target.value)} data-testid="input-seller-contact" />
                          <Input className="h-8 text-xs" placeholder="Seller address" value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} data-testid="input-seller-address" />
                          <Input className="h-8 text-xs" placeholder="Bank name" value={sellerBank} onChange={(e) => setSellerBank(e.target.value)} data-testid="input-seller-bank" />
                          <Input className="h-8 text-xs" placeholder="SWIFT / BIC code" value={sellerSwift} onChange={(e) => setSellerSwift(e.target.value)} data-testid="input-seller-swift" />
                        </div>
                      </div>
                      <div className="border rounded-md overflow-hidden">
                        <div className="text-xs font-semibold p-2 bg-muted/60 border-b">For and on behalf of the Buyer</div>
                        <div className="p-2 space-y-2">
                          <Input className="h-8 text-xs" placeholder="Buyer company name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} data-testid="input-buyer-name-sig" />
                          <Input className="h-8 text-xs" placeholder="Name & email (e.g. VK — VK@BULLFROG.AE)" value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} data-testid="input-buyer-contact" />
                          <Input className="h-8 text-xs" placeholder="Buyer address" value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} data-testid="input-buyer-address" />
                          <Input className="h-8 text-xs" placeholder="Bank name" value={buyerBank} onChange={(e) => setBuyerBank(e.target.value)} data-testid="input-buyer-bank" />
                          <Input className="h-8 text-xs" placeholder="SWIFT / BIC code" value={buyerSwift} onChange={(e) => setBuyerSwift(e.target.value)} data-testid="input-buyer-swift" />
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="annex" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Annexure I — Commodity Specifications</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3 space-y-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[1fr_1fr_1fr_32px] bg-muted/50 border-b">
                        <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Parameter</div>
                        <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase border-l">Specification</div>
                        <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase border-l">Rejection Limit</div>
                        <div className="border-l"></div>
                      </div>
                      {specRows.map((row, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_32px] border-b last:border-b-0">
                          <div className="p-0.5"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Fe" value={row.parameter} onChange={(e) => updateSpecRow(idx, "parameter", e.target.value)} data-testid={`input-annex-param-${idx}`} /></div>
                          <div className="p-0.5 border-l"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 63.5% min" value={row.specification} onChange={(e) => updateSpecRow(idx, "specification", e.target.value)} data-testid={`input-annex-spec-${idx}`} /></div>
                          <div className="p-0.5 border-l"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. < 60%" value={row.rejection} onChange={(e) => updateSpecRow(idx, "rejection", e.target.value)} data-testid={`input-annex-reject-${idx}`} /></div>
                          <div className="flex items-center justify-center border-l">
                            {specRows.length > 1 && (
                              <button type="button" onClick={() => removeSpecRow(idx)} className="text-muted-foreground hover:text-destructive" data-testid={`button-remove-annex-${idx}`}>
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={addSpecRow} data-testid="button-add-annex-row">
                      <Plus className="w-3 h-3 mr-1" />Add Row
                    </Button>
                    <Textarea className="text-xs" placeholder="Special Notes (optional)" value={specialNote} onChange={(e) => setSpecialNote(e.target.value)} rows={2} data-testid="input-special-note" />
                  </AccordionContent>
                </AccordionItem>

              </Accordion>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={resetForm} data-testid="button-cancel-generate">
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Cancel
                </Button>
                <Button onClick={handleReview} disabled={previewDoc.isPending} data-testid="button-review-doc">
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  {previewDoc.isPending ? "Loading Preview..." : "Review Deal Recap"}
                </Button>
              </div>
            </div>
          )}
          {selectedType && !reviewContent && selectedType.value === "LOI" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>
              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input placeholder="Enter LOI document title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-doc-title" />
              </div>

              <Accordion type="multiple" defaultValue={["header","params","closing"]} className="w-full">

                <AccordionItem value="header" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> LOI Header</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Issued to Seller</div>
                        <div className="p-1 space-y-1">
                          {approvedClients.length > 0 && (
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "seller"); }}>
                              <SelectTrigger className="h-7 text-xs" data-testid="select-seller-kyc-trigger"><SelectValue placeholder="Select from KYC..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Seller company name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} data-testid="input-seller-name" />
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Seller address" value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} data-testid="input-seller-address" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Attention (PIC)</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Seller contact person & email" value={sellerContact} onChange={(e) => setSellerContact(e.target.value)} data-testid="input-seller-contact" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Ref</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Reference person (e.g. Mr. Nilesh Thakkar)" value={refPerson} onChange={(e) => setRefPerson(e.target.value)} data-testid="input-ref-person" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">LOI Issue No. & Date</div>
                        <div className="p-2 text-xs flex items-center gap-2" data-testid="text-loi-issue-number">
                          <span className={loiIssueNumber ? "font-semibold text-foreground" : "text-muted-foreground"}>{loiIssueNumber || "Enter buyer name to generate"}</span>
                          <span className="text-muted-foreground">{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Valid Till</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Saturday 2nd August, 2025 - 2000HRS Dubai Time" value={validity} onChange={(e) => setValidity(e.target.value)} data-testid="input-validity" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Purchase Incoterms</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. CIF, FOB, CFR" value={incoterm} onChange={(e) => setIncoterm(e.target.value)} data-testid="input-incoterm" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Issued by Buyer</div>
                        <div className="p-1 space-y-1">
                          {approvedClients.length > 0 && (
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "buyer"); }}>
                              <SelectTrigger className="h-7 text-xs" data-testid="select-buyer-kyc-trigger"><SelectValue placeholder="Select from KYC..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Buyer company name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} data-testid="input-buyer-name" />
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Buyer address" value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} data-testid="input-buyer-address" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Attention (PIC)</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Buyer contact person & title" value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} data-testid="input-buyer-contact" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="params" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> LOI Parameters (Sr. No. 01–12)</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[40px_130px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r text-center">Sr.</div>
                        <div className="p-2 border-r">Parameters</div>
                        <div className="p-2">Details</div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">01</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Commodity</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Iron Ore, Copper Concentrate, Gasoil 50ppm" value={commodity} onChange={(e) => setCommodity(e.target.value)} data-testid="input-commodity" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">02</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Origin</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Kamsar, Guinea" value={origin} onChange={(e) => setOrigin(e.target.value)} data-testid="input-origin" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">03</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Quantity</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 50,000 MT" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="input-quantity" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">04</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Incoterms Terms</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. CIF AWSP" value={incoterm} onChange={(e) => setIncoterm(e.target.value)} data-testid="input-incoterm-detail" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">05</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Delivery Period</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 15-30 April 2026" value={laycan} onChange={(e) => setLaycan(e.target.value)} data-testid="input-laycan" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">06</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Price</div>
                        <div className="p-1 flex gap-1">
                          <Select value={currency} onValueChange={setCurrency}>
                            <SelectTrigger className="h-8 text-xs w-20" data-testid="select-currency"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="GBP">GBP</SelectItem>
                              <SelectItem value="AED">AED</SelectItem>
                              <SelectItem value="CNY">CNY</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0 flex-1" placeholder="e.g. 70 per MT" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="input-price" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">07</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Contract Confirmation</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Subject to Producer's Confirmation of cargo" value={contractConfirmation} onChange={(e) => setContractConfirmation(e.target.value)} data-testid="input-contract-confirmation" /></div>
                      </div>
                      <div className="border-b">
                        <div className="grid grid-cols-[40px_1fr] border-b">
                          <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">08</div>
                          <div className="p-2 text-xs font-medium text-muted-foreground">Commodity Specifications</div>
                        </div>
                        <div className="px-2 py-1.5">
                          <div className="border rounded-md overflow-hidden">
                            <div className="grid grid-cols-[1fr_1fr_1fr_32px] bg-muted/50 border-b">
                              <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Parameter</div>
                              <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase border-l">Specification</div>
                              <div className="p-1.5 text-[10px] font-semibold text-muted-foreground uppercase border-l">Rejection Limit</div>
                              <div className="border-l"></div>
                            </div>
                            {specRows.map((row, idx) => (
                              <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_32px] border-b last:border-b-0">
                                <div className="p-0.5"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Al2O3" value={row.parameter} onChange={(e) => updateSpecRow(idx, "parameter", e.target.value)} data-testid={`input-spec-param-${idx}`} /></div>
                                <div className="p-0.5 border-l"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 45% min" value={row.specification} onChange={(e) => updateSpecRow(idx, "specification", e.target.value)} data-testid={`input-spec-value-${idx}`} /></div>
                                <div className="p-0.5 border-l"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. < 40%" value={row.rejection} onChange={(e) => updateSpecRow(idx, "rejection", e.target.value)} data-testid={`input-spec-reject-${idx}`} /></div>
                                <div className="flex items-center justify-center border-l">
                                  {specRows.length > 1 && (
                                    <button type="button" onClick={() => removeSpecRow(idx)} className="text-muted-foreground hover:text-destructive" data-testid={`button-remove-spec-${idx}`}>
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <Button type="button" variant="ghost" size="sm" className="mt-1 h-6 text-[10px] text-muted-foreground" onClick={addSpecRow} data-testid="button-add-spec-row">
                            <Plus className="w-3 h-3 mr-1" />Add Row
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">09</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Payment Terms</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. By DLC against 2% Performance Bond" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} data-testid="input-payment-terms" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">10</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-start pt-2">Documents for Payment</div>
                        <div className="p-1"><Textarea className="text-xs border-0 shadow-none focus-visible:ring-0 min-h-[100px]" placeholder={"Seller's export permit, and 3 copies\nCommercial Invoice, 3 Original and 3 copies\nPacking List, 3 originals and 3 copies\nCertificate of Origin, 3 originals and 3 copies\nAssay Report, 3 Original and 3 copies\nCertificate of quantity and quality issued by SGS\nInsurance Policy of 110% of invoice value"} value={docsForPayment} onChange={(e) => setDocsForPayment(e.target.value)} rows={6} data-testid="input-docs-for-payment" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">11</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-start pt-2">Other Terms & Conditions</div>
                        <div className="p-1"><Textarea className="text-xs border-0 shadow-none focus-visible:ring-0 min-h-[60px]" placeholder={"For DLC, after signing of SPA, Seller must arrange RWA by MT199 from LC receiving bank..."} value={otherTerms} onChange={(e) => setOtherTerms(e.target.value)} rows={3} data-testid="input-other-terms" /></div>
                      </div>
                      <div className="grid grid-cols-[40px_130px_1fr]">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">12</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-start pt-2">Compliance</div>
                        <div className="p-1"><Textarea className="text-xs border-0 shadow-none focus-visible:ring-0 min-h-[40px]" placeholder={"Seller must send KYC documents to compliance@bullfrog.ae upon signing of SPA..."} value={compliance} onChange={(e) => setCompliance(e.target.value)} rows={2} data-testid="input-compliance" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="closing" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><FileSignature className="w-3.5 h-3.5" /> Closing & Signatory</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="text-xs font-semibold p-2 bg-muted/60 border-b">For & On Behalf of</div>
                      <div className="p-2 space-y-2">
                        <Input className="h-8 text-xs" placeholder="Buyer company name (signing party)" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} data-testid="input-buyer-name-sig" />
                        <Input className="h-8 text-xs" placeholder="Authorised Signatory Name & Title" value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} data-testid="input-buyer-contact-sig" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Loading Port</Label>
                        <Input className="h-8 text-xs mt-1" placeholder="e.g. Kamsar, Guinea" value={loadingPort} onChange={(e) => setLoadingPort(e.target.value)} data-testid="input-loading-port" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Discharge Port</Label>
                        <Input className="h-8 text-xs mt-1" placeholder="e.g. Rizhao, China" value={dischargePort} onChange={(e) => setDischargePort(e.target.value)} data-testid="input-discharge-port" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Analysis Agency</Label>
                        <Input className="h-8 text-xs mt-1" placeholder="e.g. SGS, Bureau Veritas" value={analysisAgency} onChange={(e) => setAnalysisAgency(e.target.value)} data-testid="input-analysis-agency" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Agency Contact</Label>
                        <Input className="h-8 text-xs mt-1" placeholder="Agency contact / email" value={analysisAgencyContact} onChange={(e) => setAnalysisAgencyContact(e.target.value)} data-testid="input-analysis-agency-contact" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <Label className="text-xs text-muted-foreground">Special Notes</Label>
                      <Textarea className="text-xs mt-1" placeholder="Special notes (optional)" value={specialNote} onChange={(e) => setSpecialNote(e.target.value)} rows={2} data-testid="input-special-note" />
                    </div>
                  </AccordionContent>
                </AccordionItem>

              </Accordion>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={resetForm} data-testid="button-cancel-generate">
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Cancel
                </Button>
                <Button onClick={handleReview} disabled={previewDoc.isPending} data-testid="button-review-doc">
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  {previewDoc.isPending ? "Loading Preview..." : "Review LOI"}
                </Button>
              </div>
            </div>
          )}
          {selectedType && !reviewContent && selectedType.value === "NCNDA" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>
              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input placeholder="Enter NCNDA document title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-doc-title" />
              </div>

              <Accordion type="multiple" defaultValue={["parties","terms","signatory"]} className="w-full">

                <AccordionItem value="parties" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Parties</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="border rounded-md overflow-hidden">
                        <div className="text-xs font-semibold p-2 bg-muted/60 border-b">Party A (Disclosing)</div>
                        <div className="p-2 space-y-2">
                          {approvedClients.length > 0 && (
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "seller"); }}>
                              <SelectTrigger className="h-7 text-xs" data-testid="select-partya-kyc-trigger"><SelectValue placeholder="Auto-fill from KYC..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs" placeholder="Party A company name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} data-testid="input-partya-name" />
                          <Input className="h-8 text-xs" placeholder="Registered address" value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} data-testid="input-partya-address" />
                          <Input className="h-8 text-xs" placeholder="Authorised signatory name & title" value={sellerContact} onChange={(e) => setSellerContact(e.target.value)} data-testid="input-partya-contact" />
                        </div>
                      </div>
                      <div className="border rounded-md overflow-hidden">
                        <div className="text-xs font-semibold p-2 bg-muted/60 border-b">Party B (Recipient)</div>
                        <div className="p-2 space-y-2">
                          {approvedClients.length > 0 && (
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "buyer"); }}>
                              <SelectTrigger className="h-7 text-xs" data-testid="select-partyb-kyc-trigger"><SelectValue placeholder="Auto-fill from KYC..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs" placeholder="Party B company name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} data-testid="input-partyb-name" />
                          <Input className="h-8 text-xs" placeholder="Registered address" value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} data-testid="input-partyb-address" />
                          <Input className="h-8 text-xs" placeholder="Authorised signatory name & title" value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} data-testid="input-partyb-contact" />
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="terms" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Agreement Terms</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[140px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Item</div><div className="p-2">Details</div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Effective Date</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={`e.g. ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`} value={validity} onChange={(e) => setValidity(e.target.value)} data-testid="input-effective-date" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Proposed Transaction</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Sale and Purchase of Iron Ore, Copper Cathode" value={commodity} onChange={(e) => setCommodity(e.target.value)} data-testid="input-proposed-transaction" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Governing Law</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. UAE (DIFC), English Law, Singapore" value={governingLaw} onChange={(e) => setGoverningLaw(e.target.value)} data-testid="input-governing-law" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Jurisdiction (Courts)</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. DIFC Courts, Dubai; Courts of England and Wales" value={recapValidity} onChange={(e) => setRecapValidity(e.target.value)} data-testid="input-jurisdiction" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="signatory" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><FileSignature className="w-3.5 h-3.5" /> Execution</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="p-3 bg-muted/30 rounded-md text-xs text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground">Dual Signatory Block</p>
                      <p>The document will include a signature block for both Party A and Party B with name, title, date, and signature lines.</p>
                      <p className="mt-2">Term: <span className="font-medium text-foreground">1 year from Effective Date</span> (auto-included)</p>
                      <p>Confidentiality survival: <span className="font-medium text-foreground">1 year post-termination</span> (auto-included)</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

              </Accordion>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={resetForm} data-testid="button-cancel-generate">
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Cancel
                </Button>
                <Button onClick={handleReview} disabled={previewDoc.isPending} data-testid="button-review-doc">
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  {previewDoc.isPending ? "Loading Preview..." : "Review NCNDA"}
                </Button>
              </div>
            </div>
          )}
          {selectedType && !reviewContent && selectedType.value === "BL" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>
              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input placeholder="Enter BL document title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-doc-title" />
              </div>

              <Accordion type="multiple" defaultValue={["shipper","consignee","cargo","shipping","issuance"]} className="w-full">

                <AccordionItem value="shipper" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Shipper & Consignee</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Shipper</div>
                        <div className="p-1">
                          {approvedClients.length > 0 && (
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "seller"); }}>
                              <SelectTrigger className="h-7 text-xs mb-1" data-testid="select-bl-shipper-kyc"><SelectValue placeholder="Auto-fill from KYC..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Shipper company name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} data-testid="input-bl-shipper" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Consignee</div>
                        <div className="p-1">
                          {approvedClients.length > 0 && (
                            <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "buyer"); }}>
                              <SelectTrigger className="h-7 text-xs mb-1" data-testid="select-bl-consignee-kyc"><SelectValue placeholder="Auto-fill from KYC..." /></SelectTrigger>
                              <SelectContent>{approvedClients.map((k) => (<SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>))}</SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Consignee company name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} data-testid="input-bl-consignee" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Notify Address</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Notify party / address" value={blNotifyParty} onChange={(e) => setBlNotifyParty(e.target.value)} data-testid="input-bl-notify-party" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="cargo" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Cargo & Vessel</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Vessel Name</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. MV BULLFROG STAR" value={blVesselName} onChange={(e) => setBlVesselName(e.target.value)} data-testid="input-bl-vessel" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Port of Loading</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Port of Conakry, Guinea" value={loadingPort} onChange={(e) => setLoadingPort(e.target.value)} data-testid="input-bl-loading-port" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Port of Discharge</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Port Klang, Malaysia" value={dischargePort} onChange={(e) => setDischargePort(e.target.value)} data-testid="input-bl-discharge-port" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Commodity Name</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Iron Ore, Copper Cathode" value={commodity} onChange={(e) => setCommodity(e.target.value)} data-testid="input-bl-commodity" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Quantity (MT)</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 50,000" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="input-bl-quantity" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Country of Origin</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Guinea, Zambia" value={origin} onChange={(e) => setOrigin(e.target.value)} data-testid="input-bl-origin" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Packing</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Bulk, In Bags (50kg PP Woven Bags)" value={blPacking} onChange={(e) => setBlPacking(e.target.value)} data-testid="input-bl-packing" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="shipping" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Anchor className="w-3.5 h-3.5" /> Freight & Loading</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Charter Party Date</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={`e.g. ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`} value={blCharterPartyDate} onChange={(e) => setBlCharterPartyDate(e.target.value)} data-testid="input-bl-cp-date" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Freight Advance</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. USD 250,000" value={blFreightAdvance} onChange={(e) => setBlFreightAdvance(e.target.value)} data-testid="input-bl-freight-advance" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Loading Time (Days)</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 5" value={blLoadingTimeDays} onChange={(e) => setBlLoadingTimeDays(e.target.value)} data-testid="input-bl-loading-days" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Loading Time (Hours)</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 12" value={blLoadingTimeHours} onChange={(e) => setBlLoadingTimeHours(e.target.value)} data-testid="input-bl-loading-hours" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="issuance" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><FileSignature className="w-3.5 h-3.5" /> Issuance & Signature</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[160px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Field</div><div className="p-2">Value</div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Place of Issue</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Dubai, UAE" value={blPlaceOfIssue} onChange={(e) => setBlPlaceOfIssue(e.target.value)} data-testid="input-bl-place-issue" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Date of Issue</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={`e.g. ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`} value={blDateOfIssue} onChange={(e) => setBlDateOfIssue(e.target.value)} data-testid="input-bl-date-issue" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Company on Behalf</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Company signing as master's agent" value={blCompanyOnBehalf} onChange={(e) => setBlCompanyOnBehalf(e.target.value)} data-testid="input-bl-company-behalf" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Master of Vessel</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Vessel name for 'Master of ___'" value={blMasterOfVessel} onChange={(e) => setBlMasterOfVessel(e.target.value)} data-testid="input-bl-master-vessel" /></div>
                      </div>
                      <div className="grid grid-cols-[160px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Agents Name</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Shipping agents company name" value={blAgentsName} onChange={(e) => setBlAgentsName(e.target.value)} data-testid="input-bl-agents-name" /></div>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2 px-1">Fixed content: B/L No. 01 · THREE (3) originals · CONGENBILL conditions of carriage (General Paramount, General Average, New Jason, Both-to-Blame) are auto-included.</p>
                  </AccordionContent>
                </AccordionItem>

              </Accordion>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={resetForm} data-testid="button-cancel-generate">
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Cancel
                </Button>
                <Button onClick={handleReview} disabled={previewDoc.isPending} data-testid="button-review-doc">
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  {previewDoc.isPending ? "Loading Preview..." : "Review BL"}
                </Button>
              </div>
            </div>
          )}
          {selectedType && !reviewContent && selectedType.value !== "DEAL_RECAP" && selectedType.value !== "LOI" && selectedType.value !== "NCNDA" && selectedType.value !== "BL" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>

              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input
                  placeholder={`Enter ${selectedType.short} document title`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  data-testid="input-doc-title"
                />
              </div>

              <Accordion type="multiple" defaultValue={["product"]} className="w-full">
                <AccordionItem value="product" className="border-b-0">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 hover:no-underline">
                    <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Product Details</span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-3">
                    <Input placeholder="Commodity (e.g. Iron Ore, Copper Cathode, Gasoil 10ppm)" value={commodity} onChange={(e) => setCommodity(e.target.value)} data-testid="input-commodity" />
                    <Input placeholder="Origin (e.g. Guinea, Zambia)" value={origin} onChange={(e) => setOrigin(e.target.value)} data-testid="input-origin" />
                    <Input placeholder="Quantity (e.g. 50,000 MT)" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="input-quantity" />
                    <Textarea placeholder="Quality Specifications (e.g. Fe 63.5% min, moisture 8% max, Al2O3 2.5% max)" value={qualitySpecs} onChange={(e) => setQualitySpecs(e.target.value)} rows={3} data-testid="input-quality-specs" />
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Loading Port" value={loadingPort} onChange={(e) => setLoadingPort(e.target.value)} data-testid="input-loading-port" />
                      <Input placeholder="Discharge Port" value={dischargePort} onChange={(e) => setDischargePort(e.target.value)} data-testid="input-discharge-port" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Price (e.g. 118.50 per MT)" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="input-price" />
                      <Select value={currency} onValueChange={setCurrency}>
                        <SelectTrigger data-testid="select-currency">
                          <SelectValue placeholder="Currency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="GBP">GBP</SelectItem>
                          <SelectItem value="AED">AED</SelectItem>
                          <SelectItem value="CNY">CNY</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Incoterm (e.g. FOB, CIF, CFR)" value={incoterm} onChange={(e) => setIncoterm(e.target.value)} data-testid="input-incoterm" />
                      <Input placeholder="Laycan (e.g. 15-30 April 2026)" value={laycan} onChange={(e) => setLaycan(e.target.value)} data-testid="input-laycan" />
                    </div>
                    <Input placeholder="Payment Terms (e.g. By DLC against 2% Performance Bond)" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} data-testid="input-payment-terms" />
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Analysis Agency (e.g. SGS, CCIC, Alfred H. Knight)" value={analysisAgency} onChange={(e) => setAnalysisAgency(e.target.value)} data-testid="input-analysis-agency" />
                      <Input placeholder="Agency Contact / Email" value={analysisAgencyContact} onChange={(e) => setAnalysisAgencyContact(e.target.value)} data-testid="input-analysis-agency-contact" />
                    </div>
                    <Textarea placeholder="Special Notes (e.g. subject to SGS inspection, performance bond required)" value={specialNote} onChange={(e) => setSpecialNote(e.target.value)} rows={2} data-testid="input-special-note" />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="buyer" className="border-b-0">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 hover:no-underline">
                    <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Buyer Details</span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-3">
                    {approvedClients.length > 0 && (
                      <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "buyer"); }} data-testid="select-buyer-kyc">
                        <SelectTrigger data-testid="select-buyer-kyc-trigger">
                          <SelectValue placeholder="Select from approved KYC clients..." />
                        </SelectTrigger>
                        <SelectContent>
                          {approvedClients.map((k) => (
                            <SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Input placeholder="Buyer company name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} data-testid="input-buyer-name" />
                    <Input placeholder="Buyer address" value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} data-testid="input-buyer-address" />
                    <Input placeholder="Contact person & email" value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} data-testid="input-buyer-contact" />
                    <Input placeholder="Bank name" value={buyerBank} onChange={(e) => setBuyerBank(e.target.value)} data-testid="input-buyer-bank" />
                    <Input placeholder="SWIFT / BIC code" value={buyerSwift} onChange={(e) => setBuyerSwift(e.target.value)} data-testid="input-buyer-swift" />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="seller" className="border-b-0">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 hover:no-underline">
                    <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Seller Details</span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-3">
                    {approvedClients.length > 0 && (
                      <Select onValueChange={(val) => { const kyc = approvedClients.find(k => k.id === val); if (kyc) fillFromKyc(kyc, "seller"); }} data-testid="select-seller-kyc">
                        <SelectTrigger data-testid="select-seller-kyc-trigger">
                          <SelectValue placeholder="Select from approved KYC clients..." />
                        </SelectTrigger>
                        <SelectContent>
                          {approvedClients.map((k) => (
                            <SelectItem key={k.id} value={k.id}>{k.companyName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Input placeholder="Seller company name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} data-testid="input-seller-name" />
                    <Input placeholder="Seller address" value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} data-testid="input-seller-address" />
                    <Input placeholder="Contact person & email" value={sellerContact} onChange={(e) => setSellerContact(e.target.value)} data-testid="input-seller-contact" />
                    <Input placeholder="Bank name" value={sellerBank} onChange={(e) => setSellerBank(e.target.value)} data-testid="input-seller-bank" />
                    <Input placeholder="SWIFT / BIC code" value={sellerSwift} onChange={(e) => setSellerSwift(e.target.value)} data-testid="input-seller-swift" />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={resetForm} data-testid="button-cancel-generate">
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Cancel
                </Button>
                <Button onClick={handleReview} disabled={previewDoc.isPending} data-testid="button-review-doc">
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  {previewDoc.isPending ? "Loading Preview..." : `Review ${selectedType.short}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewDoc} onOpenChange={(open) => !open && setViewDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-view-doc-title">
              <FileCheck className="w-5 h-5 text-primary" />
              {viewDoc?.title}
            </DialogTitle>
          </DialogHeader>
          {viewDoc && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Document Type</Label>
                  <p className="text-sm font-medium" data-testid="text-view-doc-type">{docTypes.find(d => d.value === viewDoc.docType)?.label || viewDoc.docType}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  {(() => {
                    const sb = getStatusBadge(viewDoc);
                    const SbIcon = sb.icon;
                    return (
                      <Badge className={`text-[10px] capitalize ${sb.color}`} data-testid="text-view-doc-status">
                        <SbIcon className="w-3 h-3 mr-0.5" />
                        {sb.label}
                      </Badge>
                    );
                  })()}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Trade Reference</Label>
                  <p className="text-sm" data-testid="text-view-doc-trade">{viewDoc.tradeRef || "Standalone"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Created</Label>
                  <p className="text-sm" data-testid="text-view-doc-date">{new Date(viewDoc.createdAt).toLocaleString()}</p>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Content</Label>
                <div className="mt-1 p-4 rounded-md bg-muted min-h-[120px] whitespace-pre-wrap text-sm" data-testid="text-view-doc-content">
                  {viewDoc.content || "No content yet. Use the Amend button to add content."}
                </div>
              </div>

              {viewDoc.content && (
                <div className="border rounded-lg p-3 bg-muted/30">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Download Document</p>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => window.open(`/api/documents/${viewDoc.id}/download/docx`, "_blank")}
                      data-testid="button-download-docx-view"
                    >
                      <FileText className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                      Download DOCX
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => window.open(`/api/documents/${viewDoc.id}/download/pdf`, "_blank")}
                      data-testid="button-download-pdf-view"
                    >
                      <FileText className="w-3.5 h-3.5 mr-1.5 text-red-600" />
                      Download PDF
                    </Button>
                  </div>
                </div>
              )}

              {viewDoc.status === "pending_review" && (
                <div className="border-t pt-4" data-testid="section-admin-review">
                  <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ListChecks className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Admin Review Checklist</p>
                      </div>
                      <span className="text-xs text-amber-700 dark:text-amber-400">
                        {reviewChecks.filter(c => c.checked).length}/{reviewChecks.length} items verified
                      </span>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-400">Complete all checklist items and approve to enable document signing.</p>
                    <div className="space-y-1.5">
                      {reviewChecks.map((check, idx) => (
                        <button
                          key={idx}
                          onClick={() => toggleReviewCheck(idx)}
                          className={`w-full flex items-center gap-2.5 p-2.5 rounded-md text-left text-xs transition-colors ${check.checked ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200" : "bg-white dark:bg-muted border border-amber-200 dark:border-amber-800 text-foreground hover:bg-amber-50 dark:hover:bg-amber-900"}`}
                          data-testid={`check-item-${idx}`}
                        >
                          {check.checked ? (
                            <CheckSquare className="w-4 h-4 text-green-600 flex-shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          )}
                          {check.label}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-amber-800 dark:text-amber-300">Admin Review Notes</Label>
                      <Textarea
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="Add verification notes, risk observations, or concerns..."
                        rows={2}
                        className="text-xs resize-none border-amber-200 dark:border-amber-800"
                        data-testid="textarea-admin-review-notes"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => adminReview.mutate({ id: viewDoc.id, adminChecks: reviewChecks, adminReviewNotes: reviewNotes })}
                        disabled={adminReview.isPending}
                        data-testid="button-save-review"
                      >
                        <Save className="w-3.5 h-3.5 mr-1" />
                        Save Progress
                      </Button>
                      <Button
                        size="sm"
                        className="text-xs bg-green-600 hover:bg-green-700 text-white flex-1"
                        onClick={() => adminReview.mutate({ id: viewDoc.id, adminChecks: reviewChecks, adminReviewNotes: reviewNotes, action: "approve" })}
                        disabled={adminReview.isPending || reviewChecks.filter(c => c.checked).length < reviewChecks.length}
                        data-testid="button-approve-doc"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        {reviewChecks.filter(c => c.checked).length < reviewChecks.length
                          ? `Approve (${reviewChecks.filter(c => c.checked).length}/${reviewChecks.length} checked)`
                          : "Approve — Ready to Sign"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs"
                        onClick={() => adminReview.mutate({ id: viewDoc.id, adminChecks: reviewChecks, adminReviewNotes: reviewNotes, action: "reject" })}
                        disabled={adminReview.isPending}
                        data-testid="button-reject-doc-review"
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <Label className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                  <FileSignature className="w-4 h-4" />
                  Digital Signatures
                </Label>
                <div className={`grid gap-4 ${viewDoc.docType === "NCNDA" ? "grid-cols-2" : "grid-cols-1"}`}>
                  {/* Party A / Seller signature (Issuer for NCNDA) */}
                  <div className="border rounded-lg p-3 space-y-2" data-testid="section-seller-signature">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">
                      {viewDoc.docType === "NCNDA" ? "Party A (Issuer)" : "Buyer / Issuer Signature"}
                    </p>
                    {(viewDoc.docType === "NCNDA" ? viewDoc.sellerSignature : viewDoc.buyerSignature) ? (
                      <div className="space-y-1.5">
                        <div className="bg-white border rounded p-2 flex justify-center">
                          <img src={(viewDoc.docType === "NCNDA" ? viewDoc.sellerSignature : viewDoc.buyerSignature)!} alt="Signature" className="max-h-16 object-contain" data-testid={viewDoc.docType === "NCNDA" ? "img-seller-signature" : "img-buyer-signature"} />
                        </div>
                        <p className="text-xs text-muted-foreground" data-testid={viewDoc.docType === "NCNDA" ? "text-seller-signed-name" : "text-buyer-signed-name"}>
                          Signed by: <span className="font-medium text-foreground">{viewDoc.docType === "NCNDA" ? viewDoc.sellerSignedName : viewDoc.buyerSignedName}</span>
                        </p>
                        {(viewDoc.docType === "NCNDA" ? viewDoc.sellerSignedAt : viewDoc.buyerSignedAt) && (
                          <p className="text-xs text-muted-foreground">
                            Date: {new Date((viewDoc.docType === "NCNDA" ? viewDoc.sellerSignedAt : viewDoc.buyerSignedAt)!).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-[10px]">Signed</Badge>
                          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-destructive" onClick={() => { if (confirm(`Remove ${viewDoc.docType === "NCNDA" ? "Party A" : "buyer"} signature?`)) removeSignature.mutate({ id: viewDoc.id, party: viewDoc.docType === "NCNDA" ? "seller" : "buyer" }); }} data-testid="button-remove-partya-sig">
                            <X className="w-3 h-3 mr-0.5" />Remove
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="bg-muted/50 border border-dashed rounded p-4 flex items-center justify-center min-h-[60px]">
                          <p className="text-xs text-muted-foreground">{viewDoc.status === "pending_review" ? "Awaiting admin approval" : "Not yet signed"}</p>
                        </div>
                        {viewDoc.status !== "pending_review" && (
                          <Button variant="outline" size="sm" className="w-full" onClick={() => openSignDialog(viewDoc.id, viewDoc.docType === "NCNDA" ? "seller" : "buyer")} data-testid="button-sign-partya">
                            <FileSignature className="w-3.5 h-3.5 mr-1.5" />
                            {viewDoc.docType === "NCNDA" ? "Sign as Party A (Issuer)" : "Sign as Buyer"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Party B signature (only shown for NCNDA) */}
                  {viewDoc.docType === "NCNDA" && (
                    <div className="border rounded-lg p-3 space-y-2" data-testid="section-partyb-signature">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">Party B (Receiving Party)</p>
                      {viewDoc.buyerSignature ? (
                        <div className="space-y-1.5">
                          <div className="bg-white border rounded p-2 flex justify-center">
                            <img src={viewDoc.buyerSignature} alt="Party B Signature" className="max-h-16 object-contain" data-testid="img-partyb-signature" />
                          </div>
                          <p className="text-xs text-muted-foreground" data-testid="text-partyb-signed-name">
                            Signed by: <span className="font-medium text-foreground">{viewDoc.buyerSignedName}</span>
                          </p>
                          {viewDoc.buyerSignedAt && (
                            <p className="text-xs text-muted-foreground">
                              Date: {new Date(viewDoc.buyerSignedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                            </p>
                          )}
                          <div className="flex items-center gap-2">
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-[10px]">Signed</Badge>
                            <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-destructive" onClick={() => { if (confirm("Remove Party B signature?")) removeSignature.mutate({ id: viewDoc.id, party: "buyer" }); }} data-testid="button-remove-partyb-sig">
                              <X className="w-3 h-3 mr-0.5" />Remove
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="bg-muted/50 border border-dashed rounded p-4 flex items-center justify-center min-h-[60px]">
                            <p className="text-xs text-muted-foreground">{viewDoc.status === "pending_review" ? "Awaiting admin approval" : "Optional — sign after receipt"}</p>
                          </div>
                          {viewDoc.status !== "pending_review" && (
                            <Button variant="outline" size="sm" className="w-full" onClick={() => openSignDialog(viewDoc.id, "buyer")} data-testid="button-sign-partyb">
                              <FileSignature className="w-3.5 h-3.5 mr-1.5" />
                              Sign as Party B
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {(viewDoc.docType === "NCNDA" ? (viewDoc.sellerSignature || viewDoc.buyerSignature) : viewDoc.buyerSignature) && !viewDoc.pdfPath && viewDoc.status !== "sent" && viewDoc.status !== "accepted" && (
                <div className="border-t pt-4">
                  <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-4 text-center space-y-3">
                    <p className="text-sm font-medium text-orange-800 dark:text-orange-200">{viewDoc.docType} is signed and ready to finalize</p>
                    <p className="text-xs text-orange-600 dark:text-orange-400">Convert to PDF to finalize the document. This will generate the final PDF with the digital signature embedded.</p>
                    <Button
                      className="bg-orange-600 hover:bg-orange-700 text-white"
                      onClick={() => convertToPdf.mutate(viewDoc.id)}
                      disabled={convertToPdf.isPending}
                      data-testid="button-convert-pdf-view"
                    >
                      <FileCheck className="w-4 h-4 mr-1.5" />
                      {convertToPdf.isPending ? "Converting..." : `Convert to PDF & Complete ${viewDoc.docType}`}
                    </Button>
                  </div>
                </div>
              )}
              {viewDoc.pdfPath && viewDoc.status === "final" && (
                <div className="border-t pt-4">
                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <p className="text-sm font-medium text-green-800 dark:text-green-200">{viewDoc.docType} Complete</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => window.open(`/api/documents/${viewDoc.id}/download/pdf`, "_blank")} data-testid="button-download-final-pdf">
                      <FileText className="w-3.5 h-3.5 mr-1.5 text-red-600" />
                      Download PDF
                    </Button>
                  </div>
                </div>
              )}

              {viewDoc.recipientResponse === "rejected" && viewDoc.recipientAmendmentNotes && (
                <div className="border-t pt-4">
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <p className="text-sm font-semibold text-red-800 dark:text-red-200">Amendment Requested</p>
                    </div>
                    <p className="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap" data-testid="text-amendment-notes">{viewDoc.recipientAmendmentNotes}</p>
                    <p className="text-xs text-red-500 dark:text-red-400">Amend the document and resend to the counterparty.</p>
                  </div>
                </div>
              )}

              {viewDoc.sentTo && viewDoc.recipientResponse === "pending" && (
                <div className="border-t pt-4">
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-blue-600" />
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Awaiting Response</p>
                    </div>
                    <p className="text-xs text-blue-600 dark:text-blue-400">Sent to: {viewDoc.sentTo}</p>
                    <div className="flex gap-2">
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { setRespondDocId(viewDoc.id); setRespondAction("accepted"); }} data-testid="button-accept-doc">
                        <ThumbsUp className="w-3.5 h-3.5 mr-1" />
                        Accept
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => { setRespondDocId(viewDoc.id); setRespondAction("rejected"); }} data-testid="button-reject-doc">
                        <ThumbsDown className="w-3.5 h-3.5 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {viewDoc.recipientResponse === "accepted" && (() => {
                const next = getNextDocType(viewDoc);
                if (!next) return null;
                return (
                  <div className="border-t pt-4">
                    <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <p className="text-sm font-medium text-green-800 dark:text-green-200">{viewDoc.docType} Accepted</p>
                      </div>
                      <p className="text-xs text-green-600 dark:text-green-400">Proceed to create the next document in the workflow.</p>
                      <Button size="sm" onClick={() => createNextDoc.mutate({ id: viewDoc.id, nextDocType: next })} disabled={createNextDoc.isPending} data-testid="button-create-next-doc">
                        <ArrowRight className="w-3.5 h-3.5 mr-1" />
                        {createNextDoc.isPending ? "Creating..." : `Create ${next}`}
                      </Button>
                    </div>
                  </div>
                );
              })()}

              {(viewDoc.enquiryRef || viewDoc.dealRecapNumber || viewDoc.parentDocId) && (
                <div className="border-t pt-4">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    {viewDoc.enquiryRef && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Enquiry Reference</Label>
                        <p className="font-medium" data-testid="text-enquiry-ref">{viewDoc.enquiryRef}</p>
                      </div>
                    )}
                    {viewDoc.dealRecapNumber && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Deal Recap / SPA Number</Label>
                        <p className="font-medium" data-testid="text-deal-recap-number">{viewDoc.dealRecapNumber}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setViewDoc(null)} data-testid="button-close-view">
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Close
                </Button>
                {canSend(viewDoc) && (
                  <Button variant="outline" onClick={() => { setSendDocId(viewDoc.id); setSendEmail(viewDoc.sellerEmail || viewDoc.buyerEmail || ""); setSendClientId(""); }} data-testid="button-send-doc">
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    Send to Client
                  </Button>
                )}
                {(viewDoc.status === "rejected" || viewDoc.status === "draft") && (
                  <Button onClick={() => openEdit(viewDoc)} data-testid="button-edit-from-view">
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                    Amend
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!signParty && !!signDocId} onOpenChange={(open) => { if (!open) { setSignParty(null); setSignDocId(null); setSignerName(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-sign-dialog-title">
              <FileSignature className="w-5 h-5 text-primary" />
              {(() => {
                const doc = docs?.find(d => d.id === signDocId);
                if (doc?.docType === "NCNDA") {
                  return signParty === "seller" ? "Sign as Party A (Issuer)" : "Sign as Party B (Receiving Party)";
                }
                return signParty === "buyer" ? "Sign as Buyer" : "Sign as Seller";
              })()}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name of Signatory</Label>
              <Input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Enter your full name"
                data-testid="input-signer-name"
              />
            </div>
            <div>
              <Label className="mb-2 block">Draw Your Signature</Label>
              <SignaturePad
                onSave={handleSignature}
                onCancel={() => { setSignParty(null); setSignDocId(null); setSignerName(""); }}
              />
            </div>
            {signDoc.isPending && (
              <p className="text-sm text-center text-muted-foreground">Applying signature and regenerating documents...</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editDoc} onOpenChange={(open) => !open && setEditDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-edit-doc-heading">
              <Pencil className="w-5 h-5 text-primary" />
              Amend Document
            </DialogTitle>
          </DialogHeader>
          {editDoc && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Document Type</Label>
                  <p className="text-sm font-medium">{docTypes.find(d => d.value === editDoc.docType)?.label || editDoc.docType}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Trade Reference</Label>
                  <p className="text-sm">{editDoc.tradeRef || "Standalone"}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  data-testid="input-edit-doc-title"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger data-testid="select-edit-doc-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="final">Final</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={10}
                  placeholder="Enter document content..."
                  className="font-mono text-sm"
                  data-testid="textarea-edit-doc-content"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditDoc(null)} data-testid="button-cancel-edit">
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Cancel
                </Button>
                <Button onClick={handleSaveAmend} disabled={updateDoc.isPending} data-testid="button-save-amend">
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {updateDoc.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!sendDocId} onOpenChange={(open) => { if (!open) { setSendDocId(null); setSendEmail(""); setSendClientId(""); setSendCcEmail(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-send-dialog-title">
              <Send className="w-5 h-5 text-primary" />
              {docs?.find(d => d.id === sendDocId)?.docType === "NCNDA" ? "Send NCNDA to Party B" : "Send Document to Client"}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const sendingDoc = docs?.find(d => d.id === sendDocId);
            const isNcndaSend = sendingDoc?.docType === "NCNDA";
            return (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {isNcndaSend
                    ? "Send the signed NCNDA to Party B (Receiving Party) for review and countersignature. An email with the PDF attached will be sent to the recipient, with a copy to the issuing party."
                    : "Send this document to a registered client for review and acceptance. The document will appear in their Client Portal and an email notification will be sent."}
                </p>
                <div className="space-y-2">
                  <Label>{isNcndaSend ? "Party B — Select Client (optional)" : "Select Client"}</Label>
                  <Select value={sendClientId} onValueChange={(val) => {
                    setSendClientId(val);
                    const client = approvedClients.find((c) => c.id === val);
                    if (client) setSendEmail(client.contactEmail || client.signatoryEmail || "");
                  }}>
                    <SelectTrigger data-testid="select-send-client">
                      <SelectValue placeholder="Choose a registered client" />
                    </SelectTrigger>
                    <SelectContent>
                      {approvedClients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.companyName} — {c.contactName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isNcndaSend ? "Party B Email (Receiving Party) *" : "Recipient Email"}</Label>
                  <Input
                    type="email"
                    value={sendEmail}
                    onChange={(e) => setSendEmail(e.target.value)}
                    placeholder={isNcndaSend ? "Party B email address" : "Enter recipient email address"}
                    data-testid="input-send-email"
                  />
                </div>
                {isNcndaSend && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      Party A Email (Issuer — CC)
                      <span className="text-xs text-muted-foreground font-normal">optional</span>
                    </Label>
                    <Input
                      type="email"
                      value={sendCcEmail}
                      onChange={(e) => setSendCcEmail(e.target.value)}
                      placeholder="Issuing party email for copy"
                      data-testid="input-send-cc-email"
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setSendDocId(null); setSendEmail(""); setSendClientId(""); setSendCcEmail(""); }} data-testid="button-cancel-send">
                    Cancel
                  </Button>
                  <Button onClick={() => { if (sendDocId && sendEmail) sendDoc.mutate({ id: sendDocId, recipientEmail: sendEmail, clientId: sendClientId || undefined, ccEmail: sendCcEmail || undefined }); }} disabled={!sendEmail || sendDoc.isPending} data-testid="button-confirm-send">
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    {sendDoc.isPending ? "Sending..." : isNcndaSend ? "Send NCNDA to Party B" : "Send to Client"}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!respondDocId && !!respondAction} onOpenChange={(open) => { if (!open) { setRespondDocId(null); setRespondAction(null); setAmendmentNotes(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-respond-dialog-title">
              {respondAction === "accepted" ? <ThumbsUp className="w-5 h-5 text-green-600" /> : <ThumbsDown className="w-5 h-5 text-red-600" />}
              {respondAction === "accepted" ? "Accept Document" : "Reject Document"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {respondAction === "accepted" ? (
              <p className="text-sm text-muted-foreground">Accepting this document will allow the next step in the document workflow to proceed.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Rejecting this document will send it back for amendment. Please provide notes explaining what changes are needed.</p>
                <div className="space-y-2">
                  <Label>Amendment Notes</Label>
                  <Textarea
                    value={amendmentNotes}
                    onChange={(e) => setAmendmentNotes(e.target.value)}
                    placeholder="Describe the changes required..."
                    rows={4}
                    data-testid="textarea-amendment-notes"
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setRespondDocId(null); setRespondAction(null); setAmendmentNotes(""); }} data-testid="button-cancel-respond">
                Cancel
              </Button>
              <Button
                className={respondAction === "accepted" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                variant={respondAction === "rejected" ? "destructive" : "default"}
                onClick={() => { if (respondDocId && respondAction) respondToDoc.mutate({ id: respondDocId, response: respondAction, notes: amendmentNotes }); }}
                disabled={respondToDoc.isPending || (respondAction === "rejected" && !amendmentNotes.trim())}
                data-testid="button-confirm-respond"
              >
                {respondToDoc.isPending ? "Processing..." : respondAction === "accepted" ? "Confirm Accept" : "Confirm Reject"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
