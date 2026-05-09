import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Search, Plus, FileText, Download, Trash2, Upload, Eye, X,
  Scale, Clock, Info, User, Mail, Send, ClipboardList, FileSignature,
  MapPin, Package, ChevronDown, ChevronUp, ArrowRight, CheckCircle2,
} from "lucide-react";
import type { TradeEnquiry, TradeEnquiryDocument } from "@shared/schema";

const UNIT_OPTIONS = ["MT", "KG", "LBS", "BBL", "GAL", "LTR", "OZ", "TON"];
const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "AED", "CNY"];
const INCOTERM_OPTIONS = ["FOB", "CIF", "CFR", "EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP"];


const STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  under_review: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  quoted: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Pending",
  open: "Pending",
  under_review: "Pending",
  quoted: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  closed: "Closed",
  cancelled: "Closed",
};

function isActive(status: string) {
  return status !== "closed" && status !== "cancelled" && status !== "rejected";
}


interface SpecRow { parameter: string; specification: string; rejection: string; }

interface EnquiryForm {
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
  createdBy: string;
  email: string;
  // Parameters
  product: string;
  origin: string;
  quantity: string;
  unit: string;
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

const emptyForm: EnquiryForm = {
  side: "buy",
  sellerName: "", sellerAddress: "", sellerContact: "", refPerson: "",
  validity: "", incoterms: "CIF",
  buyerName: "", buyerAddress: "", buyerContact: "", createdBy: "", email: "",
  product: "", origin: "", quantity: "", unit: "MT", deliveryPeriod: "",
  price: "", currency: "USD", contractConfirmation: "",
  specifications: "", paymentTerms: "", performanceBond: "", docsForPayment: "", otherTerms: "", compliance: "",
  producer: "", loadingPort: "", dischargePort: "", additionalInfo: "",
};

const emptySpecRows: SpecRow[] = [{ parameter: "", specification: "", rejection: "" }];

export default function TradeEnquiries() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EnquiryForm>({ ...emptyForm });
  const [specRows, setSpecRows] = useState<SpecRow[]>(emptySpecRows);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sideFilter, setSideFilter] = useState<string>("all");
  const [viewEnquiry, setViewEnquiry] = useState<TradeEnquiry | null>(null);

  const { data: enquiries = [], isLoading } = useQuery<TradeEnquiry[]>({
    queryKey: ["/api/trade-enquiries"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: EnquiryForm & { specifications: string }) => {
      const res = await apiRequest("POST", "/api/trade-enquiries", data);
      return res.json();
    },
    onSuccess: async (newEnquiry) => {
      if (pendingFiles.length > 0) {
        await Promise.allSettled(pendingFiles.map(file => {
          const fd = new FormData();
          fd.append("file", file);
          return fetch(`/api/trade-enquiries/${newEnquiry.id}/documents`, { method: "POST", body: fd, credentials: "include" });
        }));
        setPendingFiles([]);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/trade-enquiries"] });
      setForm({ ...emptyForm });
      setSpecRows(emptySpecRows);
      setShowForm(false);
      toast({ title: "Trade enquiry created successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create enquiry", description: err.message, variant: "destructive" });
    },
  });

  const [, navigate] = useLocation();

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/trade-enquiries/${id}/status`, { status });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade-enquiries"] });
      if (data?.createdTradeRef) {
        toast({ title: "Enquiry accepted — trade created", description: `Trade ${data.createdTradeRef} has been opened in Blockchain Trading.` });
        setTimeout(() => navigate(`/trading?tradeRef=${encodeURIComponent(data.createdTradeRef)}`), 1200);
      } else {
        toast({ title: "Status updated" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/trade-enquiries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade-enquiries"] });
      setViewEnquiry(null);
      toast({ title: "Enquiry deleted" });
    },
  });

  const filtered = enquiries.filter((e) => {
    const matchesSearch =
      !searchTerm ||
      e.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.enquiryRef.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.sellerName || e.producer || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? isActive(e.status) && e.status !== "accepted" : e.status === statusFilter);
    const matchesSide = sideFilter === "all" || e.side === sideFilter;
    return matchesSearch && matchesStatus && matchesSide;
  });

  const handleSubmit = () => {
    if (!form.product.trim()) {
      toast({ title: "Commodity is required", variant: "destructive" });
      return;
    }
    const specText = specRows.filter(r => r.parameter.trim()).map(r => `${r.parameter}: ${r.specification}${r.rejection ? ` (Rejection: ${r.rejection})` : ""}`).join("\n");
    createMutation.mutate({ ...form, specifications: specText || form.specifications });
  };

  const f = (field: keyof EnquiryForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Trade Enquiries</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage commodity trade enquiries</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} data-testid="button-new-enquiry">
          <Plus className="w-4 h-4 mr-2" />
          New Enquiry
        </Button>
      </div>

      {showForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              New Trade Enquiry
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={form.side === "buy" ? "default" : "outline"}
                className={form.side === "buy" ? "bg-green-600 hover:bg-green-700 text-white flex-1" : "flex-1"}
                onClick={() => setForm(p => ({ ...p, side: "buy" }))}
                data-testid="button-side-buy"
              >BUY</Button>
              <Button
                type="button"
                size="sm"
                variant={form.side === "sell" ? "default" : "outline"}
                className={form.side === "sell" ? "bg-red-600 hover:bg-red-700 text-white flex-1" : "flex-1"}
                onClick={() => setForm(p => ({ ...p, side: "sell" }))}
                data-testid="button-side-sell"
              >SELL</Button>
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
                        <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Seller company name" value={form.sellerName} onChange={f("sellerName")} data-testid="input-seller-name" />
                        <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Seller address" value={form.sellerAddress} onChange={f("sellerAddress")} data-testid="input-seller-address" />
                      </div>
                    </div>
                    <div className="grid grid-cols-[140px_1fr] border-b">
                      <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center bg-muted/30">Attention (PIC)</div>
                      <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Seller contact person & title" value={form.sellerContact} onChange={f("sellerContact")} data-testid="input-seller-contact" /></div>
                    </div>
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
                        <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Buyer company name" value={form.buyerName} onChange={f("buyerName")} data-testid="input-buyer-name" />
                        <Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="Buyer address" value={form.buyerAddress} onChange={f("buyerAddress")} data-testid="input-buyer-address" />
                      </div>
                    </div>
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
                      { sr: "01", label: "Commodity", field: "product" as keyof EnquiryForm, placeholder: "e.g. Iron Ore, Copper Cathode, Gasoil 10ppm", required: true },
                      { sr: "02", label: "Origin", field: "origin" as keyof EnquiryForm, placeholder: "e.g. Kamsar, Guinea" },
                    ].map(({ sr, label, field, placeholder, required }) => (
                      <div key={sr} className="grid grid-cols-[40px_130px_1fr] border-b">
                        <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">{sr}</div>
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">{label}{required && " *"}</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={placeholder} value={form[field] as string} onChange={f(field)} data-testid={`input-${field}`} /></div>
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
                      <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Incoterms Terms</div>
                      <div className="p-1">
                        <Select value={form.incoterms} onValueChange={(v) => setForm(p => ({ ...p, incoterms: v }))}>
                          <SelectTrigger className="h-8 text-xs border-0 shadow-none focus-visible:ring-0"><SelectValue /></SelectTrigger>
                          <SelectContent>{INCOTERM_OPTIONS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-[40px_130px_1fr] border-b">
                      <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">05</div>
                      <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Delivery Period</div>
                      <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 15-30 April 2026" value={form.deliveryPeriod} onChange={f("deliveryPeriod")} data-testid="input-delivery-period" /></div>
                    </div>
                    <div className="grid grid-cols-[40px_130px_1fr] border-b">
                      <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">06</div>
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
                      <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">07</div>
                      <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Contract Confirmation</div>
                      <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Subject to Producer's Confirmation of cargo" value={form.contractConfirmation} onChange={f("contractConfirmation")} data-testid="input-contract-confirmation" /></div>
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
                            <div className="border-l" />
                          </div>
                          {specRows.map((row, idx) => (
                            <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_32px] border-b last:border-b-0">
                              <div className="p-0.5"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Al2O3" value={row.parameter} onChange={(e) => setSpecRows(rows => rows.map((r, i) => i === idx ? { ...r, parameter: e.target.value } : r))} data-testid={`input-spec-param-${idx}`} /></div>
                              <div className="p-0.5 border-l"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 45% min" value={row.specification} onChange={(e) => setSpecRows(rows => rows.map((r, i) => i === idx ? { ...r, specification: e.target.value } : r))} data-testid={`input-spec-value-${idx}`} /></div>
                              <div className="p-0.5 border-l"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. < 40%" value={row.rejection} onChange={(e) => setSpecRows(rows => rows.map((r, i) => i === idx ? { ...r, rejection: e.target.value } : r))} data-testid={`input-spec-reject-${idx}`} /></div>
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
                        <Button type="button" variant="ghost" size="sm" className="mt-1 h-6 text-[10px] text-muted-foreground" onClick={() => setSpecRows(rows => [...rows, { parameter: "", specification: "", rejection: "" }])} data-testid="button-add-spec-row">
                          <Plus className="w-3 h-3 mr-1" /> Add Row
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-[40px_130px_1fr] border-b">
                      <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">09</div>
                      <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Payment Terms</div>
                      <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. By DLC at Sight" value={form.paymentTerms} onChange={f("paymentTerms")} data-testid="input-payment-terms" /></div>
                    </div>
                    <div className="grid grid-cols-[40px_130px_1fr] border-b">
                      <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">10</div>
                      <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Performance Bond</div>
                      <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. 2% Performance Bond via MT760" value={form.performanceBond} onChange={f("performanceBond")} data-testid="input-performance-bond" /></div>
                    </div>
                    <div className="grid grid-cols-[40px_130px_1fr] border-b">
                      <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">11</div>
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
                      <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">12</div>
                      <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-start pt-2">Other Terms</div>
                      <div className="p-1"><Textarea className="text-xs border-0 shadow-none focus-visible:ring-0 min-h-[60px]" placeholder="Other terms and conditions..." value={form.otherTerms} onChange={f("otherTerms")} rows={3} data-testid="input-other-terms" /></div>
                    </div>
                    <div className="grid grid-cols-[40px_130px_1fr]">
                      <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">13</div>
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
              <Button variant="outline" onClick={() => { setShowForm(false); setForm({ ...emptyForm }); setSpecRows(emptySpecRows); setPendingFiles([]); }} data-testid="button-cancel-enquiry">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by commodity, reference, seller..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" data-testid="input-search-enquiries" />
        </div>
        <Select value={sideFilter} onValueChange={setSideFilter}>
          <SelectTrigger className="w-28" data-testid="select-side-filter"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="buy">Buy</SelectItem>
            <SelectItem value="sell">Sell</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-status-filter"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Pending</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground" data-testid="text-enquiry-count">
          {filtered.length} enquir{filtered.length === 1 ? "y" : "ies"}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No trade enquiries found</p>
            <p className="text-sm mt-1">Click "New Enquiry" to create one</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((enquiry) => (
            <EnquiryCard
              key={enquiry.id}
              enquiry={enquiry}
              onView={() => setViewEnquiry(enquiry)}
              onStatusChange={(status) => statusMutation.mutate({ id: enquiry.id, status })}
              onDelete={() => { if (confirm("Delete this enquiry and all attached documents?")) deleteMutation.mutate(enquiry.id); }}
            />
          ))}
        </div>
      )}

      {viewEnquiry && (
        <EnquiryDetailDialog
          enquiry={viewEnquiry}
          onClose={() => setViewEnquiry(null)}
          onStatusChange={(status) => { statusMutation.mutate({ id: viewEnquiry.id, status }); setViewEnquiry({ ...viewEnquiry, status }); }}
          onDelete={() => { if (confirm("Delete this enquiry and all attached documents?")) deleteMutation.mutate(viewEnquiry.id); }}
        />
      )}
    </div>
  );
}

function getValidityInfo(enquiry: TradeEnquiry): { label: string; color: string } {
  if (!enquiry.validity || !enquiry.createdAt) return { label: "", color: "" };
  const validityStr = String(enquiry.validity).trim();
  const daysMatch = validityStr.match(/(\d+)/);
  if (!daysMatch) return { label: enquiry.validity, color: "" };
  const validityDays = parseInt(daysMatch[1]);
  const expiry = new Date(new Date(enquiry.createdAt).getTime() + validityDays * 86400000);
  const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
  if (daysLeft <= 0) return { label: "Expired", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border border-red-200" };
  if (daysLeft <= 5) return { label: `${daysLeft}d left`, color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border border-orange-200" };
  return { label: `${daysLeft}d left`, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border border-green-200" };
}

function EnquiryCard({ enquiry, onView, onStatusChange, onDelete }: {
  enquiry: TradeEnquiry; onView: () => void; onStatusChange: (s: string) => void; onDelete: () => void;
}) {
  const [, nav] = useLocation();
  const validity = getValidityInfo(enquiry);
  return (
    <Card className="hover:shadow-md transition-shadow" data-testid={`card-enquiry-${enquiry.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge className={`text-[10px] font-bold ${enquiry.side === "sell" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`} data-testid={`badge-side-${enquiry.id}`}>
                {enquiry.side === "sell" ? "SELL" : "BUY"}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground" data-testid={`text-ref-${enquiry.id}`}>{enquiry.enquiryRef}</span>
              <Badge className={`text-[10px] ${STATUS_COLORS[enquiry.status]}`} data-testid={`badge-status-${enquiry.id}`}>{STATUS_LABELS[enquiry.status]}</Badge>
              {enquiry.clientResponse && (
                <Badge className={`text-[10px] font-bold ${enquiry.clientResponse === "accepted" ? "bg-emerald-600 text-white" : "bg-orange-600 text-white"}`} data-testid={`badge-client-response-${enquiry.id}`}>
                  {enquiry.clientResponse === "accepted" ? "CLIENT ACCEPTED" : "CLIENT REJECTED"}
                </Badge>
              )}
            </div>
            <h3 className="font-semibold text-base truncate" data-testid={`text-product-${enquiry.id}`}>{enquiry.product}</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
              {(enquiry.sellerName || enquiry.producer) && <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5" /> {enquiry.sellerName || enquiry.producer}</span>}
              {enquiry.quantity && <span className="flex items-center gap-1"><Scale className="w-3.5 h-3.5" /> {enquiry.quantity} {enquiry.unit}</span>}
              {(enquiry.origin || enquiry.loadingPort) && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {enquiry.origin || enquiry.loadingPort}</span>}
              {enquiry.incoterms && <span className="flex items-center gap-1"><Info className="w-3.5 h-3.5" /> {enquiry.incoterms}</span>}
              {enquiry.price && <span className="flex items-center gap-1 font-medium text-foreground">{enquiry.currency || "USD"} {enquiry.price}</span>}
              {enquiry.validity && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {enquiry.validity}</span>}
              {validity.label && isActive(enquiry.status) && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${validity.color}`} data-testid={`badge-validity-${enquiry.id}`}>
                  <Clock className="w-3 h-3" />{validity.label}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="outline" size="sm" onClick={onView} data-testid={`button-view-${enquiry.id}`}><Eye className="w-3.5 h-3.5 mr-1" /> View</Button>
            {isActive(enquiry.status) && enquiry.status !== "accepted" && (
              <>
                <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => onStatusChange("accepted")} data-testid={`button-accept-${enquiry.id}`}>Accept</Button>
                <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => onStatusChange("rejected")} data-testid={`button-reject-${enquiry.id}`}>Reject</Button>
              </>
            )}
            {enquiry.status === "accepted" && (
              <Button size="sm" className="h-8 text-xs bg-primary hover:bg-primary/90 text-white" onClick={() => nav(enquiry.linkedTradeRef ? `/trading?tradeRef=${encodeURIComponent(enquiry.linkedTradeRef)}` : "/trading")} data-testid={`link-trading-${enquiry.id}`}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> View Trade <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete} data-testid={`button-delete-${enquiry.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EnquiryDetailDialog({ enquiry, onClose, onStatusChange, onDelete }: {
  enquiry: TradeEnquiry; onClose: () => void; onStatusChange: (s: string) => void; onDelete: () => void;
}) {
  const { toast } = useToast();
  const [, nav] = useLocation();
  const [uploading, setUploading] = useState(false);

  const { data: docs = [], refetch: refetchDocs } = useQuery<TradeEnquiryDocument[]>({
    queryKey: ["/api/trade-enquiries", enquiry.id, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/trade-enquiries/${enquiry.id}/documents`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (docId: string) => { await apiRequest("DELETE", `/api/trade-enquiry-documents/${docId}`); },
    onSuccess: () => { refetchDocs(); toast({ title: "Document removed" }); },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/trade-enquiries/${enquiry.id}/documents`, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Upload failed"); }
      refetchDocs();
      toast({ title: "Document uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const created = new Date(enquiry.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  const row = (label: string, value: string | null | undefined, testId?: string) =>
    value ? (
      <div className="flex justify-between py-1.5 border-b border-border/30 text-sm last:border-b-0">
        <span className="text-muted-foreground text-xs shrink-0 mr-4">{label}</span>
        <span className="font-medium text-right break-words" data-testid={testId}>{value}</span>
      </div>
    ) : null;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {enquiry.enquiryRef}
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`font-bold ${enquiry.side === "sell" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`} data-testid="badge-detail-side">
                {enquiry.side === "sell" ? "SELL" : "BUY"}
              </Badge>
              <Badge className={STATUS_COLORS[enquiry.status]} data-testid="badge-detail-status">{STATUS_LABELS[enquiry.status]}</Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="border rounded-md overflow-hidden">
            <div className="text-xs font-bold uppercase tracking-wider p-2 bg-muted/60 border-b flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> Enquiry Header
            </div>
            <div className="p-3 space-y-0">
              {row("Issued to Seller", enquiry.sellerName)}
              {row("Seller Address", enquiry.sellerAddress)}
              {row("Seller Contact (PIC)", enquiry.sellerContact)}
              {row("Ref", enquiry.refPerson)}
              {row("Date", created)}
              {row("Valid Till", enquiry.validity)}
              {row("Purchase Incoterms", enquiry.incoterms)}
              {row("Issued by Buyer", enquiry.buyerName)}
              {row("Buyer Address", enquiry.buyerAddress)}
              {row("Buyer Contact (PIC)", enquiry.buyerContact)}
              {row("Created By", enquiry.createdBy, "text-detail-created-by")}
              {row("Email", enquiry.email, "text-detail-email")}
            </div>
          </div>

          <div className="border rounded-md overflow-hidden">
            <div className="text-xs font-bold uppercase tracking-wider p-2 bg-muted/60 border-b flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5" /> Enquiry Parameters
            </div>
            <div className="divide-y">
              {[
                ["01", "Commodity", enquiry.product],
                ["02", "Origin", enquiry.origin],
                ["03", "Quantity", enquiry.quantity ? `${enquiry.quantity} ${enquiry.unit}` : null],
                ["04", "Incoterms", enquiry.incoterms],
                ["05", "Delivery Period", enquiry.deliveryPeriod],
                ["06", "Price", enquiry.price ? `${enquiry.currency || "USD"} ${enquiry.price}` : null],
                ["07", "Contract Confirmation", enquiry.contractConfirmation],
              ].map(([sr, label, val]) => val ? (
                <div key={sr} className="grid grid-cols-[40px_140px_1fr] text-sm">
                  <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">{sr}</div>
                  <div className="p-2 border-r text-xs text-muted-foreground">{label}</div>
                  <div className="p-2 text-xs font-medium" data-testid={`text-detail-${label?.toLowerCase().replace(/\s+/g, "-")}`}>{val}</div>
                </div>
              ) : null)}
              {enquiry.specifications && (
                <div className="grid grid-cols-[40px_1fr] text-sm">
                  <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">08</div>
                  <div className="p-2">
                    <p className="text-xs text-muted-foreground mb-1">Commodity Specifications</p>
                    <p className="text-xs whitespace-pre-wrap" data-testid="text-detail-specs">{enquiry.specifications}</p>
                  </div>
                </div>
              )}
              {[
                ["09", "Payment Terms", enquiry.paymentTerms],
                ["10", "Performance Bond", enquiry.performanceBond],
              ].map(([sr, label, val]) => val ? (
                <div key={sr} className="grid grid-cols-[40px_140px_1fr] text-sm">
                  <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">{sr}</div>
                  <div className="p-2 border-r text-xs text-muted-foreground">{label}</div>
                  <div className="p-2 text-xs font-medium whitespace-pre-wrap">{val}</div>
                </div>
              ) : null)}
              {enquiry.docsForPayment && (
                <div className="grid grid-cols-[40px_140px_1fr] text-sm">
                  <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">11</div>
                  <div className="p-2 border-r text-xs text-muted-foreground">Documents for Payment</div>
                  <div className="p-2">
                    <ul className="space-y-0.5">
                      {enquiry.docsForPayment.split("\n").filter(Boolean).map((doc, i) => (
                        <li key={i} className="text-xs font-medium flex items-start gap-1.5">
                          <span className="text-primary mt-0.5">✓</span>
                          <span>{doc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {[
                ["12", "Other Terms", enquiry.otherTerms],
                ["13", "Compliance", enquiry.compliance],
              ].map(([sr, label, val]) => val ? (
                <div key={sr} className="grid grid-cols-[40px_140px_1fr] text-sm">
                  <div className="p-2 border-r text-xs text-center font-medium text-muted-foreground">{sr}</div>
                  <div className="p-2 border-r text-xs text-muted-foreground">{label}</div>
                  <div className="p-2 text-xs font-medium whitespace-pre-wrap">{val}</div>
                </div>
              ) : null)}
            </div>
          </div>

          {(enquiry.loadingPort || enquiry.dischargePort || enquiry.producer || enquiry.additionalInfo) && (
            <div className="border rounded-md overflow-hidden">
              <div className="text-xs font-bold uppercase tracking-wider p-2 bg-muted/60 border-b flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> Logistics
              </div>
              <div className="p-3 space-y-0">
                {row("Loading Port", enquiry.loadingPort)}
                {row("Discharge Port", enquiry.dischargePort)}
                {row("Producer / Supplier", enquiry.producer)}
                {row("Special Notes", enquiry.additionalInfo)}
              </div>
            </div>
          )}

          {enquiry.clientResponse && (
            <div className={`rounded-lg p-4 ${enquiry.clientResponse === "accepted" ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"}`}>
              <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">Client Response</h4>
              <div className="flex items-center gap-2">
                <Badge className={`font-bold ${enquiry.clientResponse === "accepted" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
                  {enquiry.clientResponse === "accepted" ? "ACCEPTED" : "REJECTED"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  by {enquiry.clientRespondedBy}
                  {enquiry.clientRespondedAt && ` on ${new Date(enquiry.clientRespondedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`}
                </span>
              </div>
            </div>
          )}

          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Attached Documents</h4>
              <label>
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" onChange={handleUpload} disabled={uploading} data-testid="input-upload-doc" />
                <Button variant="outline" size="sm" asChild className="cursor-pointer" disabled={uploading}>
                  <span><Upload className="w-3.5 h-3.5 mr-1.5" />{uploading ? "Uploading..." : "Attach File"}</span>
                </Button>
              </label>
            </div>
            {docs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">No documents attached</p>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between bg-background rounded-md px-3 py-2 border" data-testid={`doc-row-${doc.id}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">{doc.originalName}</span>
                      <span className="text-xs text-muted-foreground shrink-0">({(doc.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" asChild data-testid={`button-download-doc-${doc.id}`}>
                        <a href={`/api/trade-enquiry-documents/${doc.id}/download`} target="_blank" rel="noreferrer"><Download className="w-3.5 h-3.5" /></a>
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteDocMutation.mutate(doc.id)} data-testid={`button-delete-doc-${doc.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t">
            {isActive(enquiry.status) && enquiry.status !== "accepted" && (
              <>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => onStatusChange("accepted")} data-testid="button-detail-accept">Accept</Button>
                <Button size="sm" variant="destructive" onClick={() => onStatusChange("rejected")} data-testid="button-detail-reject">Reject</Button>
              </>
            )}
            {enquiry.status === "accepted" && (
              <>
                <Button size="sm" className="bg-primary hover:bg-primary/90 text-white" onClick={() => { onClose(); nav(enquiry.linkedTradeRef ? `/trading?tradeRef=${encodeURIComponent(enquiry.linkedTradeRef)}` : "/trading"); }} data-testid="link-detail-trading">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Go to Trading <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => { onClose(); nav(`/documents?enquiryRef=${encodeURIComponent(enquiry.enquiryRef)}&enqProduct=${encodeURIComponent(enquiry.product || "")}&enqQuantity=${encodeURIComponent(enquiry.quantity ? (enquiry.quantity + " " + (enquiry.unit || "MT")) : "")}&enqOrigin=${encodeURIComponent(enquiry.origin || enquiry.loadingPort || "")}&enqIncoterm=${encodeURIComponent(enquiry.incoterms || "")}&enqSpecs=${encodeURIComponent(enquiry.specifications || "")}&enqValidity=${encodeURIComponent(enquiry.validity || "")}&enqCreatedBy=${encodeURIComponent(enquiry.createdBy || "")}&enqEmail=${encodeURIComponent(enquiry.email || "")}`); }} data-testid="link-generate-doc">
                  <FileText className="w-3.5 h-3.5 mr-1.5" /> Generate Document
                </Button>
              </>
            )}
            <div className="flex-1" />
            <Button variant="destructive" size="sm" onClick={onDelete} data-testid="button-detail-delete">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Enquiry
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
