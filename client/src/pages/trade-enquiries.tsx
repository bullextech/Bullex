import { useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Search, Plus, FileText, Download, Trash2, Upload, Eye, X,
  Package, MapPin, Scale, Clock, Info, ChevronDown
} from "lucide-react";
import type { TradeEnquiry, TradeEnquiryDocument } from "@shared/schema";

const INCOTERM_OPTIONS = ["FOB", "CIF", "CFR", "EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP"];
const UNIT_OPTIONS = ["MT", "KG", "LBS", "BBL", "GAL", "LTR", "OZ", "TON"];

const STATUS_COLORS: Record<string, string> = {
  open: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  under_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  quoted: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  under_review: "Under Review",
  quoted: "Quoted",
  closed: "Closed",
  cancelled: "Cancelled",
};

interface EnquiryForm {
  side: "buy" | "sell";
  product: string;
  specifications: string;
  producer: string;
  quantity: string;
  unit: string;
  loadingPort: string;
  incoterms: string;
  validity: string;
  additionalInfo: string;
}

const emptyForm: EnquiryForm = {
  side: "buy",
  product: "",
  specifications: "",
  producer: "",
  quantity: "",
  unit: "MT",
  loadingPort: "",
  incoterms: "FOB",
  validity: "",
  additionalInfo: "",
};

export default function TradeEnquiries() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EnquiryForm>({ ...emptyForm });
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sideFilter, setSideFilter] = useState<string>("all");
  const [viewEnquiry, setViewEnquiry] = useState<TradeEnquiry | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const { data: enquiries = [], isLoading } = useQuery<TradeEnquiry[]>({
    queryKey: ["/api/trade-enquiries"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: EnquiryForm) => {
      const res = await apiRequest("POST", "/api/trade-enquiries", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade-enquiries"] });
      setForm({ ...emptyForm });
      setShowForm(false);
      toast({ title: "Trade enquiry created successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create enquiry", description: err.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/trade-enquiries/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade-enquiries"] });
      toast({ title: "Status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update status", description: err.message, variant: "destructive" });
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
    onError: (err: Error) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    },
  });

  const filtered = enquiries.filter((e) => {
    const matchesSearch =
      !searchTerm ||
      e.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.enquiryRef.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.producer?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || e.status === statusFilter;
    const matchesSide = sideFilter === "all" || e.side === sideFilter;
    return matchesSearch && matchesStatus && matchesSide;
  });

  const handleSubmit = () => {
    if (!form.product.trim()) {
      toast({ title: "Product is required", variant: "destructive" });
      return;
    }
    createMutation.mutate(form);
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Trade Enquiries</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage commodity trade enquiries and requests</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} data-testid="button-new-enquiry">
          <Plus className="w-4 h-4 mr-2" />
          New Enquiry
        </Button>
      </div>

      {showForm && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Trade Enquiry Template
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Enquiry Type *</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={form.side === "buy" ? "default" : "outline"}
                  className={form.side === "buy" ? "bg-green-600 hover:bg-green-700 text-white flex-1" : "flex-1"}
                  onClick={() => setForm({ ...form, side: "buy" })}
                  data-testid="button-side-buy"
                >
                  BUY
                </Button>
                <Button
                  type="button"
                  variant={form.side === "sell" ? "default" : "outline"}
                  className={form.side === "sell" ? "bg-red-600 hover:bg-red-700 text-white flex-1" : "flex-1"}
                  onClick={() => setForm({ ...form, side: "sell" })}
                  data-testid="button-side-sell"
                >
                  SELL
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product">Product / Commodity *</Label>
                <Input
                  id="product"
                  placeholder="e.g. Bauxite, Iron Ore, ULSD"
                  value={form.product}
                  onChange={(e) => setForm({ ...form, product: e.target.value })}
                  data-testid="input-product"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="producer">Producer / Supplier</Label>
                <Input
                  id="producer"
                  placeholder="e.g. Mining Corp Ltd"
                  value={form.producer}
                  onChange={(e) => setForm({ ...form, producer: e.target.value })}
                  data-testid="input-producer"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="specifications">Specifications / Quality Details</Label>
              <Textarea
                id="specifications"
                placeholder="e.g. Al2O3: 45% min, SiO2: 3.5% max, Fe2O3: 18% max, Moisture: 10% max"
                value={form.specifications}
                onChange={(e) => setForm({ ...form, specifications: e.target.value })}
                rows={3}
                data-testid="input-specifications"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  placeholder="e.g. 50,000"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  data-testid="input-quantity"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger data-testid="select-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="loadingPort">Loading Port</Label>
                <Input
                  id="loadingPort"
                  placeholder="e.g. Kamsar, Guinea"
                  value={form.loadingPort}
                  onChange={(e) => setForm({ ...form, loadingPort: e.target.value })}
                  data-testid="input-loading-port"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="incoterms">Incoterms</Label>
                <Select value={form.incoterms} onValueChange={(v) => setForm({ ...form, incoterms: v })}>
                  <SelectTrigger data-testid="select-incoterms">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INCOTERM_OPTIONS.map((i) => (
                      <SelectItem key={i} value={i}>{i}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="validity">Validity Period</Label>
                <Input
                  id="validity"
                  placeholder="e.g. 7 working days, 30 days from date of issue"
                  value={form.validity}
                  onChange={(e) => setForm({ ...form, validity: e.target.value })}
                  data-testid="input-validity"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="additionalInfo">Additional Information</Label>
              <Textarea
                id="additionalInfo"
                placeholder="Any additional notes, shipping requirements, payment preferences, or special conditions"
                value={form.additionalInfo}
                onChange={(e) => setForm({ ...form, additionalInfo: e.target.value })}
                rows={3}
                data-testid="input-additional-info"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending}
                data-testid="button-submit-enquiry"
              >
                {createMutation.isPending ? "Creating..." : "Submit Enquiry"}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowForm(false); setForm({ ...emptyForm }); }}
                data-testid="button-cancel-enquiry"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by product, reference, producer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search-enquiries"
          />
        </div>
        <Select value={sideFilter} onValueChange={setSideFilter}>
          <SelectTrigger className="w-28" data-testid="select-side-filter">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="buy">Buy</SelectItem>
            <SelectItem value="sell">Sell</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-status-filter">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="under_review">Under Review</SelectItem>
            <SelectItem value="quoted">Quoted</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground" data-testid="text-enquiry-count">
          {filtered.length} enquir{filtered.length === 1 ? "y" : "ies"}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />
          ))}
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
              onDelete={() => {
                if (confirm("Delete this enquiry and all attached documents?")) {
                  deleteMutation.mutate(enquiry.id);
                }
              }}
            />
          ))}
        </div>
      )}

      {viewEnquiry && (
        <EnquiryDetailDialog
          enquiry={viewEnquiry}
          onClose={() => setViewEnquiry(null)}
          onStatusChange={(status) => {
            statusMutation.mutate({ id: viewEnquiry.id, status });
            setViewEnquiry({ ...viewEnquiry, status });
          }}
          onDelete={() => {
            if (confirm("Delete this enquiry and all attached documents?")) {
              deleteMutation.mutate(viewEnquiry.id);
            }
          }}
        />
      )}
    </div>
  );
}

function EnquiryCard({
  enquiry,
  onView,
  onStatusChange,
  onDelete,
}: {
  enquiry: TradeEnquiry;
  onView: () => void;
  onStatusChange: (status: string) => void;
  onDelete: () => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow" data-testid={`card-enquiry-${enquiry.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge
                className={`text-[10px] font-bold ${enquiry.side === "sell" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}
                data-testid={`badge-side-${enquiry.id}`}
              >
                {enquiry.side === "sell" ? "SELL" : "BUY"}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground" data-testid={`text-ref-${enquiry.id}`}>
                {enquiry.enquiryRef}
              </span>
              <Badge className={`text-[10px] ${STATUS_COLORS[enquiry.status]}`} data-testid={`badge-status-${enquiry.id}`}>
                {STATUS_LABELS[enquiry.status]}
              </Badge>
            </div>
            <h3 className="font-semibold text-base truncate" data-testid={`text-product-${enquiry.id}`}>
              {enquiry.product}
            </h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
              {enquiry.producer && (
                <span className="flex items-center gap-1">
                  <Package className="w-3.5 h-3.5" /> {enquiry.producer}
                </span>
              )}
              {enquiry.quantity && (
                <span className="flex items-center gap-1">
                  <Scale className="w-3.5 h-3.5" /> {enquiry.quantity} {enquiry.unit}
                </span>
              )}
              {enquiry.loadingPort && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {enquiry.loadingPort}
                </span>
              )}
              {enquiry.incoterms && (
                <span className="flex items-center gap-1">
                  <Info className="w-3.5 h-3.5" /> {enquiry.incoterms}
                </span>
              )}
              {enquiry.validity && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> {enquiry.validity}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="outline" size="sm" onClick={onView} data-testid={`button-view-${enquiry.id}`}>
              <Eye className="w-3.5 h-3.5 mr-1" /> View
            </Button>
            <Select onValueChange={onStatusChange}>
              <SelectTrigger className="h-8 text-xs w-28" data-testid={`select-status-${enquiry.id}`}>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="quoted">Quoted</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete} data-testid={`button-delete-${enquiry.id}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EnquiryDetailDialog({
  enquiry,
  onClose,
  onStatusChange,
  onDelete,
}: {
  enquiry: TradeEnquiry;
  onClose: () => void;
  onStatusChange: (status: string) => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
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
    mutationFn: async (docId: string) => {
      await apiRequest("DELETE", `/api/trade-enquiry-documents/${docId}`);
    },
    onSuccess: () => {
      refetchDocs();
      toast({ title: "Document removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove document", description: err.message, variant: "destructive" });
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/trade-enquiries/${enquiry.id}/documents`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      refetchDocs();
      toast({ title: "Document uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const created = new Date(enquiry.createdAt).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Trade Enquiry — {enquiry.enquiryRef}
            </div>
            <div className="flex items-center gap-2">
              <Badge
                className={`font-bold ${enquiry.side === "sell" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}
                data-testid="badge-detail-side"
              >
                {enquiry.side === "sell" ? "SELL" : "BUY"}
              </Badge>
              <Badge className={STATUS_COLORS[enquiry.status]} data-testid="badge-detail-status">
                {STATUS_LABELS[enquiry.status]}
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Enquiry Details</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Type:</span>
                <span className={`ml-2 font-bold ${enquiry.side === "sell" ? "text-red-600" : "text-green-600"}`}>
                  {enquiry.side === "sell" ? "SELL" : "BUY"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Date:</span>
                <span className="ml-2 font-medium">{created}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Product:</span>
                <span className="ml-2 font-medium" data-testid="text-detail-product">{enquiry.product}</span>
              </div>
              {enquiry.producer && (
                <div>
                  <span className="text-muted-foreground">Producer:</span>
                  <span className="ml-2 font-medium">{enquiry.producer}</span>
                </div>
              )}
              {enquiry.quantity && (
                <div>
                  <span className="text-muted-foreground">Quantity:</span>
                  <span className="ml-2 font-medium">{enquiry.quantity} {enquiry.unit}</span>
                </div>
              )}
              {enquiry.loadingPort && (
                <div>
                  <span className="text-muted-foreground">Loading Port:</span>
                  <span className="ml-2 font-medium">{enquiry.loadingPort}</span>
                </div>
              )}
              {enquiry.incoterms && (
                <div>
                  <span className="text-muted-foreground">Incoterms:</span>
                  <span className="ml-2 font-medium">{enquiry.incoterms}</span>
                </div>
              )}
              {enquiry.validity && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Validity:</span>
                  <span className="ml-2 font-medium">{enquiry.validity}</span>
                </div>
              )}
            </div>
          </div>

          {enquiry.specifications && (
            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">Specifications</h4>
              <p className="text-sm whitespace-pre-wrap" data-testid="text-detail-specs">{enquiry.specifications}</p>
            </div>
          )}

          {enquiry.additionalInfo && (
            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">Additional Information</h4>
              <p className="text-sm whitespace-pre-wrap" data-testid="text-detail-additional">{enquiry.additionalInfo}</p>
            </div>
          )}

          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Attached Documents</h4>
              <label>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  onChange={handleUpload}
                  disabled={uploading}
                  data-testid="input-upload-doc"
                />
                <Button variant="outline" size="sm" asChild className="cursor-pointer" disabled={uploading}>
                  <span>
                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                    {uploading ? "Uploading..." : "Attach File"}
                  </span>
                </Button>
              </label>
            </div>

            {docs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">No documents attached</p>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between bg-background rounded-md px-3 py-2 border"
                    data-testid={`doc-row-${doc.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">{doc.originalName}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        ({(doc.size / 1024).toFixed(0)} KB)
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        data-testid={`button-download-doc-${doc.id}`}
                      >
                        <a href={`/api/trade-enquiry-documents/${doc.id}/download`} target="_blank" rel="noreferrer">
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => deleteDocMutation.mutate(doc.id)}
                        data-testid={`button-delete-doc-${doc.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t">
            <Select onValueChange={onStatusChange}>
              <SelectTrigger className="w-40" data-testid="select-detail-status">
                <SelectValue placeholder="Change Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="quoted">Quoted</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <Button variant="destructive" size="sm" onClick={onDelete} data-testid="button-detail-delete">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete Enquiry
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
