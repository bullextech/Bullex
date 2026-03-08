import { useState } from "react";
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
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Document as Doc } from "@shared/schema";

const docTypes = [
  { value: "SCO", label: "Soft Corporate Offer", short: "SCO", description: "Initial offer issued by the seller to express willingness to supply a commodity", icon: Send },
  { value: "FCO", label: "Full Corporate Offer", short: "FCO", description: "Binding irrevocable offer with complete trade terms and conditions", icon: ShieldCheck },
  { value: "ICPO", label: "Irrevocable Corporate Purchase Order", short: "ICPO", description: "Buyer's binding commitment to purchase the specified commodity", icon: ClipboardList },
  { value: "SPA", label: "Sales & Purchase Agreement", short: "SPA", description: "Full legal contract between buyer and seller covering all trade terms", icon: FileSignature },
  { value: "LOI", label: "Letter of Intent", short: "LOI", description: "Buyer's preliminary expression of interest to purchase a commodity", icon: ScrollText },
  { value: "POP", label: "Proof of Product", short: "POP", description: "Evidence confirming the availability and existence of the commodity", icon: PackageCheck },
  { value: "POF", label: "Proof of Funds", short: "POF", description: "Documentation verifying the buyer's financial capacity for the transaction", icon: BadgeDollarSign },
  { value: "BCL", label: "Bank Comfort Letter", short: "BCL", description: "Bank confirmation of client's financial standing and LC capability", icon: Landmark },
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
  const [viewDoc, setViewDoc] = useState<Doc | null>(null);
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editStatus, setEditStatus] = useState("");

  const { data: docs, isLoading: docsLoading } = useQuery<Doc[]>({
    queryKey: ["/api/documents"],
  });

  const resetForm = () => {
    setSelectedType(null);
    setTitle("");
    setBuyerName(""); setBuyerAddress(""); setBuyerContact(""); setBuyerBank(""); setBuyerSwift("");
    setSellerName(""); setSellerAddress(""); setSellerContact(""); setSellerBank(""); setSellerSwift("");
  };

  const generateDoc = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/documents", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      resetForm();
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

  const handleGenerate = () => {
    if (!selectedType || !title) {
      toast({ title: "Missing Fields", description: "Please enter a document title.", variant: "destructive" });
      return;
    }
    generateDoc.mutate({
      docType: selectedType.value,
      title,
      buyerDetails: {
        name: buyerName, address: buyerAddress, contact: buyerContact,
        bank: buyerBank, swift: buyerSwift,
      },
      sellerDetails: {
        name: sellerName, address: sellerAddress, contact: sellerContact,
        bank: sellerBank, swift: sellerSwift,
      },
    });
  };

  const openTemplateDialog = (dt: typeof docTypes[0]) => {
    setSelectedType(dt);
    setTitle("");
    setBuyerName(""); setBuyerAddress(""); setBuyerContact(""); setBuyerBank(""); setBuyerSwift("");
    setSellerName(""); setSellerAddress(""); setSellerContact(""); setSellerBank(""); setSellerSwift("");
  };

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
    } catch {
      setViewDoc(doc);
      setEditDoc(null);
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
    updateDoc.mutate({
      id: editDoc.id,
      data: { title: editTitle, content: editContent, status: editStatus },
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
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
          <CardTitle className="text-base font-semibold">Generated Documents</CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            {docs?.length || 0} documents
          </Badge>
        </CardHeader>
        <CardContent>
          {docs && docs.length > 0 ? (
            <div className="space-y-2">
              {docs.map((doc) => (
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
                        {doc.tradeRef ? `Trade: ${doc.tradeRef}` : "Standalone"}
                        {" "}&middot;{" "}
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge
                      variant={doc.status === "final" ? "default" : "secondary"}
                      className="text-[10px] capitalize"
                    >
                      {doc.status === "final" ? (
                        <CheckCircle2 className="w-3 h-3 mr-0.5" />
                      ) : (
                        <Clock className="w-3 h-3 mr-0.5" />
                      )}
                      {doc.status}
                    </Badge>
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
              <p className="text-sm font-medium">No documents generated</p>
              <p className="text-xs">Select a template above to generate trade documents</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedType} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-generate-dialog-title">
              {selectedType && (() => { const Icon = selectedType.icon; return <Icon className="w-5 h-5 text-primary" />; })()}
              Generate {selectedType?.short}
            </DialogTitle>
          </DialogHeader>
          {selectedType && (
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

              <Accordion type="multiple" className="w-full">
                <AccordionItem value="buyer" className="border-b-0">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 hover:no-underline">
                    <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Buyer Details</span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-3">
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
                <Button onClick={handleGenerate} disabled={generateDoc.isPending} data-testid="button-generate-doc">
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  {generateDoc.isPending ? "Generating..." : `Generate ${selectedType.short}`}
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
                  <Badge variant={viewDoc.status === "final" ? "default" : "secondary"} className="capitalize" data-testid="text-view-doc-status">
                    {viewDoc.status}
                  </Badge>
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
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setViewDoc(null)} data-testid="button-close-view">
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Close
                </Button>
                <Button onClick={() => openEdit(viewDoc)} data-testid="button-edit-from-view">
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Amend
                </Button>
              </div>
            </div>
          )}
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
    </div>
  );
}
