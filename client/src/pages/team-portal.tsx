import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Briefcase, FileText, ShieldCheck, Plus, Send, AlertCircle, CheckCircle2, Clock, XCircle, ExternalLink, FilePlus, Mail, FileSignature, Download, Copy, Link2, ClipboardList, CalendarDays, Loader2, Building2, Pencil, Trash2, MapPin, Phone, Globe } from "lucide-react";
import type { DailyReport, TeamTask } from "@shared/schema";
import type { KycApplication, TradeEnquiry, EnquiryChangeRequest, KycChangeRequest, Document, PotentialClient } from "@shared/schema";

const POTENTIAL_CLIENT_STATUSES = [
  { value: "lead", label: "Lead" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "negotiating", label: "Negotiating" },
  { value: "converted", label: "Converted" },
  { value: "dropped", label: "Dropped" },
];

const PRODUCT_OPTIONS = [
  "Iron Ore", "Bauxite", "Manganese Ore",
  "Copper Cathode", "Copper Concentrate", "Aluminium Ingots",
  "Gasoil 10ppm", "Gasoil 50ppm", "LHC", "HSFO", "HSGO",
  "Petcoke – Anode Grade", "Petcoke – Fuel Grade",
  "NPK",
];

function PotentialClientsPanel() {
  const { toast } = useToast();
  const emptyForm = {
    companyName: "", contactPerson: "", email: "", phone: "", website: "",
    address: "", city: "", country: "", products: [] as string[],
    status: "lead", source: "", notes: "", lastContactedAt: "",
  };
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const clientsQuery = useQuery<PotentialClient[]>({ queryKey: ["/api/team/me/potential-clients"] });

  const saveMutation = useMutation({
    mutationFn: async (body: typeof emptyForm) => {
      const payload = { ...body, products: body.products.length ? body.products : null, lastContactedAt: body.lastContactedAt || null };
      if (editingId) return apiRequest("PATCH", `/api/team/me/potential-clients/${editingId}`, payload);
      return apiRequest("POST", "/api/team/me/potential-clients", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team/me/potential-clients"] });
      toast({ title: editingId ? "Client updated" : "Client added" });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    },
    onError: (err: any) => toast({ title: "Save failed", description: err?.message || "Could not save client", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/team/me/potential-clients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team/me/potential-clients"] });
      toast({ title: "Client removed" });
    },
  });

  const openNew = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (c: PotentialClient) => {
    setEditingId(c.id);
    setForm({
      companyName: c.companyName, contactPerson: c.contactPerson || "", email: c.email || "",
      phone: c.phone || "", website: c.website || "", address: c.address || "",
      city: c.city || "", country: c.country || "", products: c.products || [],
      status: c.status, source: c.source || "", notes: c.notes || "",
      lastContactedAt: c.lastContactedAt || "",
    });
    setDialogOpen(true);
  };

  const toggleProduct = (p: string) => {
    setForm((f) => ({ ...f, products: f.products.includes(p) ? f.products.filter((x) => x !== p) : [...f.products, p] }));
  };

  const statusBadgeClass = (s: string) => {
    switch (s) {
      case "converted": return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
      case "qualified":
      case "negotiating": return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
      case "contacted": return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
      case "dropped": return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const clients = clientsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Potential Clients</p>
              <p className="text-xs text-muted-foreground">Keep a live list of prospects you are working with — company, products of interest, contacts, and status.</p>
            </div>
          </div>
          <Button onClick={openNew} className="gap-1.5 flex-shrink-0" data-testid="btn-add-potential-client">
            <Plus className="w-4 h-4" /> Add Client
          </Button>
        </CardContent>
      </Card>

      {clientsQuery.isLoading ? (
        <Skeleton className="h-40" />
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-semibold">No potential clients yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Add Client" to record your first prospect.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {clients.map((c) => (
            <Card key={c.id} data-testid={`card-potential-client-${c.id}`} className="hover-elevate">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <h4 className="text-sm font-bold truncate" data-testid={`text-client-company-${c.id}`}>{c.companyName}</h4>
                      <Badge variant="outline" className={`text-[10px] uppercase ${statusBadgeClass(c.status)}`}>{c.status}</Badge>
                      {c.source && <span className="text-[10px] text-muted-foreground">via {c.source}</span>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {c.contactPerson && <div className="flex items-center gap-1.5"><Briefcase className="w-3 h-3" />{c.contactPerson}</div>}
                      {c.email && <div className="flex items-center gap-1.5"><Mail className="w-3 h-3" /><a href={`mailto:${c.email}`} className="hover:text-primary truncate">{c.email}</a></div>}
                      {c.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{c.phone}</div>}
                      {c.website && <div className="flex items-center gap-1.5"><Globe className="w-3 h-3" /><a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="hover:text-primary truncate">{c.website}</a></div>}
                      {(c.address || c.city || c.country) && (
                        <div className="flex items-center gap-1.5 sm:col-span-2"><MapPin className="w-3 h-3 flex-shrink-0" /><span className="truncate">{[c.address, c.city, c.country].filter(Boolean).join(", ")}</span></div>
                      )}
                      {c.lastContactedAt && <div className="flex items-center gap-1.5"><CalendarDays className="w-3 h-3" />Last contact: {c.lastContactedAt}</div>}
                    </div>
                    {c.products && c.products.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {c.products.map((p) => <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>)}
                      </div>
                    )}
                    {c.notes && <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">{c.notes}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)} data-testid={`btn-edit-client-${c.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { if (confirm(`Remove ${c.companyName}?`)) deleteMutation.mutate(c.id); }} data-testid={`btn-delete-client-${c.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingId(null); setForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-potential-client">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Potential Client" : "Add Potential Client"}</DialogTitle>
            <DialogDescription>Record company details, products of interest, and contact information.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.companyName.trim()) {
                toast({ title: "Company name required", variant: "destructive" });
                return;
              }
              saveMutation.mutate(form);
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pc-company" className="text-xs">Company Name <span className="text-destructive">*</span></Label>
                <Input id="pc-company" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required data-testid="input-client-company" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pc-contact" className="text-xs">Contact Person</Label>
                <Input id="pc-contact" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} data-testid="input-client-contact" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pc-email" className="text-xs">Email</Label>
                <Input id="pc-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-client-email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pc-phone" className="text-xs">Phone</Label>
                <Input id="pc-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-client-phone" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pc-website" className="text-xs">Website</Label>
                <Input id="pc-website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." data-testid="input-client-website" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pc-address" className="text-xs">Address</Label>
                <Input id="pc-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="input-client-address" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pc-city" className="text-xs">City</Label>
                <Input id="pc-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} data-testid="input-client-city" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pc-country" className="text-xs">Country</Label>
                <Input id="pc-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} data-testid="input-client-country" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pc-status" className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger id="pc-status" data-testid="select-client-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POTENTIAL_CLIENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pc-source" className="text-xs">Source</Label>
                <Input id="pc-source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Referral, Event, Cold call..." data-testid="input-client-source" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pc-last" className="text-xs">Last Contacted</Label>
                <Input id="pc-last" type="date" value={form.lastContactedAt} onChange={(e) => setForm({ ...form, lastContactedAt: e.target.value })} data-testid="input-client-last-contacted" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Products of Interest</Label>
              <div className="flex flex-wrap gap-1.5 p-2 border border-border rounded-md max-h-32 overflow-y-auto">
                {PRODUCT_OPTIONS.map((p) => {
                  const on = form.products.includes(p);
                  return (
                    <Badge key={p} variant={on ? "default" : "outline"} className="cursor-pointer text-[10px]" onClick={() => toggleProduct(p)} data-testid={`badge-product-${p}`}>
                      {on && <CheckCircle2 className="w-3 h-3 mr-1" />}{p}
                    </Badge>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pc-notes" className="text-xs">Notes</Label>
              <Textarea id="pc-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Conversation notes, next steps, pricing..." data-testid="input-client-notes" />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending} className="gap-1.5" data-testid="btn-save-client">
                {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {editingId ? "Save Changes" : "Add Client"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const KYC_AMENDABLE_FIELDS: { key: string; label: string }[] = [
  { key: "companyName", label: "Company Name" },
  { key: "registeredAddress", label: "Registered Address" },
  { key: "primaryBusinessAddress", label: "Primary Business Address" },
  { key: "contactName", label: "Contact Name" },
  { key: "contactTitle", label: "Contact Title" },
  { key: "contactPhone", label: "Contact Phone" },
  { key: "contactEmail", label: "Contact Email" },
  { key: "website", label: "Website" },
  { key: "bankName", label: "Bank Name" },
  { key: "accountNumber", label: "Account Number" },
  { key: "swiftCode", label: "SWIFT Code" },
];

const ENQUIRY_AMENDABLE_FIELDS: { key: string; label: string }[] = [
  { key: "specifications", label: "Specifications" },
  { key: "producer", label: "Producer" },
  { key: "quantity", label: "Quantity" },
  { key: "unit", label: "Unit" },
  { key: "loadingPort", label: "Loading Port" },
  { key: "dischargePort", label: "Discharge Port" },
  { key: "incoterms", label: "Incoterms" },
  { key: "validity", label: "Validity" },
  { key: "price", label: "Price" },
  { key: "currency", label: "Currency" },
  { key: "paymentTerms", label: "Payment Terms" },
  { key: "additionalInfo", label: "Additional Info" },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any; label: string }> = {
    pending: { variant: "secondary", icon: Clock, label: "Pending" },
    pending_review: { variant: "secondary", icon: Clock, label: "Awaiting Admin Approval" },
    approved: { variant: "default", icon: CheckCircle2, label: "Approved" },
    accepted: { variant: "default", icon: CheckCircle2, label: "Accepted" },
    rejected: { variant: "destructive", icon: XCircle, label: "Rejected" },
    active: { variant: "secondary", icon: Clock, label: "Active" },
    open: { variant: "secondary", icon: Clock, label: "Open" },
    under_review: { variant: "secondary", icon: Clock, label: "Under Review" },
    quoted: { variant: "default", icon: CheckCircle2, label: "Quoted" },
    closed: { variant: "outline", icon: CheckCircle2, label: "Closed" },
    draft: { variant: "default", icon: FileSignature, label: "Approved — Ready to Sign" },
    sent: { variant: "default", icon: Send, label: "Sent" },
    final: { variant: "default", icon: CheckCircle2, label: "Finalised" },
  };
  const cfg = map[status] || { variant: "outline" as const, icon: AlertCircle, label: status };
  const Icon = cfg.icon;
  return <Badge variant={cfg.variant} data-testid={`badge-status-${status}`}><Icon className="w-3 h-3 mr-1" />{cfg.label}</Badge>;
}

function AmendmentDialog({
  title,
  fields,
  current,
  onSubmit,
  disabled,
  triggerLabel,
  testIdPrefix,
}: {
  title: string;
  fields: { key: string; label: string }[];
  current: Record<string, any>;
  onSubmit: (changedFields: Record<string, string>, reason: string) => Promise<void>;
  disabled?: boolean;
  triggerLabel: string;
  testIdPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const reset = () => { setValues({}); setReason(""); };

  const handleSubmit = async () => {
    const changed: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.key];
      if (v !== undefined && v.trim() !== "" && v !== (current[f.key] ?? "")) {
        changed[f.key] = v.trim();
      }
    }
    if (Object.keys(changed).length === 0) {
      toast({ title: "No changes", description: "Edit at least one field with a different value.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(changed, reason);
      toast({ title: "Amendment requested", description: "Admin will review and apply the changes." });
      reset();
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Failed", description: e.message || "Could not submit", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} data-testid={`${testIdPrefix}-button-amend`}>
          <Send className="w-3 h-3 mr-1" />{triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Only fill the fields you want to change. Admin must approve before changes take effect; once approved the amendment is recorded on-chain.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key} className="grid gap-1">
              <Label className="text-xs">{f.label}</Label>
              <div className="text-[11px] text-muted-foreground">Current: <span className="font-mono">{String(current[f.key] ?? "—")}</span></div>
              <Input
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                placeholder="New value (leave blank to keep current)"
                data-testid={`${testIdPrefix}-input-${f.key}`}
              />
            </div>
          ))}
          <div className="grid gap-1 pt-2 border-t">
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} data-testid={`${testIdPrefix}-input-reason`} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} data-testid={`${testIdPrefix}-button-cancel`}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} data-testid={`${testIdPrefix}-button-submit`}>
            {submitting ? "Submitting…" : "Submit Amendment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewEnquiryDialog() {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("MT");
  const [loadingPort, setLoadingPort] = useState("");
  const [incoterms, setIncoterms] = useState("");
  const [specifications, setSpecifications] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const { toast } = useToast();

  const reset = () => {
    setSide("buy"); setProduct(""); setQuantity(""); setUnit("MT");
    setLoadingPort(""); setIncoterms(""); setSpecifications(""); setAdditionalInfo("");
  };

  const m = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/trade-enquiries", {
        side, product, quantity, unit, loadingPort, incoterms, specifications, additionalInfo,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team/me/enquiries"] });
      toast({ title: "Enquiry submitted" });
      reset();
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button data-testid="button-new-enquiry"><Plus className="w-4 h-4 mr-1" />New Enquiry</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Submit Trade Enquiry</DialogTitle>
          <DialogDescription>This will be submitted to the trading desk for review.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">Side</Label>
            <Select value={side} onValueChange={(v) => setSide(v as any)}>
              <SelectTrigger data-testid="select-side"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="buy">Buy</SelectItem>
                <SelectItem value="sell">Sell</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Product *</Label>
            <Input value={product} onChange={(e) => setProduct(e.target.value)} required data-testid="input-product" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Quantity</Label>
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="input-quantity" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Unit</Label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} data-testid="input-unit" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Loading Port</Label>
            <Input value={loadingPort} onChange={(e) => setLoadingPort(e.target.value)} data-testid="input-loading-port" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Incoterms</Label>
            <Input value={incoterms} onChange={(e) => setIncoterms(e.target.value)} data-testid="input-incoterms" />
          </div>
          <div className="grid gap-1 col-span-2">
            <Label className="text-xs">Specifications</Label>
            <Textarea value={specifications} onChange={(e) => setSpecifications(e.target.value)} rows={2} data-testid="input-specifications" />
          </div>
          <div className="grid gap-1 col-span-2">
            <Label className="text-xs">Additional Info</Label>
            <Textarea value={additionalInfo} onChange={(e) => setAdditionalInfo(e.target.value)} rows={2} data-testid="input-additional-info" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={!product.trim() || m.isPending} data-testid="button-submit-enquiry">
            {m.isPending ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamPortal() {
  const { username, role } = useAuth();

  const kycQuery = useQuery<KycApplication[]>({ queryKey: ["/api/team/me/kyc"] });
  const enquiryQuery = useQuery<TradeEnquiry[]>({ queryKey: ["/api/team/me/enquiries"] });
  const allKycChangeReqs = useQuery<KycChangeRequest[]>({ queryKey: ["/api/kyc-change-requests"] });
  const allEnquiryChangeReqs = useQuery<EnquiryChangeRequest[]>({ queryKey: ["/api/enquiry-change-requests"] });
  const documentsQuery = useQuery<Document[]>({ queryKey: ["/api/documents"] });
  const { toast } = useToast();
  const [sendDialogDoc, setSendDialogDoc] = useState<Document | null>(null);
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendCc, setSendCc] = useState("");
  const [sendKycPdfApp, setSendKycPdfApp] = useState<KycApplication | null>(null);
  const [sendKycPdfTo, setSendKycPdfTo] = useState("");
  const [sendKycPdfName, setSendKycPdfName] = useState("");
  const [sendKycPdfCc, setSendKycPdfCc] = useState("");
  const [sendKycPdfMsg, setSendKycPdfMsg] = useState("");
  const sendKycPdfMutation = useMutation({
    mutationFn: async ({ id, recipientEmail, recipientName, ccEmail, message }: { id: string; recipientEmail: string; recipientName?: string; ccEmail?: string; message?: string }) => {
      const res = await apiRequest("POST", `/api/kyc/${id}/send-pdf`, { recipientEmail, recipientName, ccEmail: ccEmail || undefined, message: message || undefined });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "KYC PDF sent", description: `Sent to ${data?.sentTo || "recipient"}.` });
      setSendKycPdfApp(null);
      setSendKycPdfTo(""); setSendKycPdfName(""); setSendKycPdfCc(""); setSendKycPdfMsg("");
    },
    onError: (err: any) => toast({ title: "Failed to send", description: err.message, variant: "destructive" }),
  });
  const [kycLinkEmail, setKycLinkEmail] = useState("");
  const [kycLinkCopied, setKycLinkCopied] = useState(false);
  const kycOnboardingUrl = typeof window !== "undefined" ? `${window.location.origin}/kyc` : "/kyc";
  const copyKycLink = async () => {
    try {
      await navigator.clipboard.writeText(kycOnboardingUrl);
      setKycLinkCopied(true);
      setTimeout(() => setKycLinkCopied(false), 2000);
      toast({ title: "Link Copied", description: "Online KYC link copied to clipboard." });
    } catch {
      toast({ title: "Copy Failed", description: "Unable to copy to clipboard.", variant: "destructive" });
    }
  };
  const sendKycLinkMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/kyc/send-onboarding-link", { email });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invitation Sent", description: `Online KYC link sent to ${kycLinkEmail.trim()}.` });
      setKycLinkEmail("");
    },
    onError: (e: any) => toast({ title: "Send Failed", description: e?.message || "Failed to send invite.", variant: "destructive" }),
  });

  const [enquiryLinkEmail, setEnquiryLinkEmail] = useState("");
  const [enquiryLinkCopied, setEnquiryLinkCopied] = useState(false);
  const enquiryOnboardingUrl = typeof window !== "undefined" ? `${window.location.origin}/enquiry-register` : "/enquiry-register";
  const copyEnquiryLink = async () => {
    try {
      await navigator.clipboard.writeText(enquiryOnboardingUrl);
      setEnquiryLinkCopied(true);
      setTimeout(() => setEnquiryLinkCopied(false), 2000);
      toast({ title: "Link Copied", description: "Online enquiry link copied to clipboard." });
    } catch {
      toast({ title: "Copy Failed", description: "Unable to copy to clipboard.", variant: "destructive" });
    }
  };
  const sendEnquiryLinkMutation = useMutation({
    mutationFn: async (email: string) => (await apiRequest("POST", "/api/enquiry/send-onboarding-link", { email })).json(),
    onSuccess: () => {
      toast({ title: "Invitation Sent", description: `Online enquiry link sent to ${enquiryLinkEmail.trim()}.` });
      setEnquiryLinkEmail("");
    },
    onError: (e: any) => toast({ title: "Send Failed", description: e?.message || "Failed to send invite.", variant: "destructive" }),
  });

  const [blankFormDialogOpen, setBlankFormDialogOpen] = useState(false);
  const [blankFormTo, setBlankFormTo] = useState("");
  const [blankFormName, setBlankFormName] = useState("");
  const [blankFormCc, setBlankFormCc] = useState("");
  const [blankFormMsg, setBlankFormMsg] = useState("");
  const sendBlankKycFormMutation = useMutation({
    mutationFn: async (vars: { recipientEmail: string; recipientName: string; ccEmail: string; message: string }) => {
      const res = await apiRequest("POST", "/api/kyc-form/send-blank-pdf", vars);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Blank Form Sent", description: `Bullex KYC form emailed to ${blankFormTo.trim()}.` });
      setBlankFormDialogOpen(false); setBlankFormTo(""); setBlankFormName(""); setBlankFormCc(""); setBlankFormMsg("");
    },
    onError: (e: any) => toast({ title: "Send Failed", description: e?.message || "Failed to send blank form.", variant: "destructive" }),
  });
  const sendDocMutation = useMutation({
    mutationFn: async ({ id, recipientEmail, ccEmail }: { id: string; recipientEmail: string; ccEmail?: string }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/send`, { recipientEmail, ccEmail: ccEmail || undefined });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Document sent", description: "The recipient has been notified by email." });
      setSendDialogDoc(null);
      setSendRecipient("");
      setSendCc("");
    },
    onError: (err: any) => toast({ title: "Failed to send", description: err.message, variant: "destructive" }),
  });

  const requestKycAmendment = useMutation({
    mutationFn: async ({ id, changedFields, reason }: { id: string; changedFields: Record<string, string>; reason: string }) => {
      const res = await apiRequest("POST", `/api/kyc/${id}/change-request`, { changedFields, reason });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/kyc-change-requests"] }),
  });

  const requestEnquiryAmendment = useMutation({
    mutationFn: async ({ id, changedFields, reason }: { id: string; changedFields: Record<string, string>; reason: string }) => {
      const res = await apiRequest("POST", `/api/trade-enquiries/${id}/change-request`, { changedFields, reason });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/enquiry-change-requests"] }),
  });

  if (role !== "team") {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertTitle>Team-Member Portal</AlertTitle>
          <AlertDescription>This portal is for team members. Admins can access all data via the regular admin pages.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const kycList = kycQuery.data ?? [];
  const enquiryList = enquiryQuery.data ?? [];

  const reqsForKyc = (kycId: string) => (allKycChangeReqs.data ?? []).filter((r) => r.kycApplicationId === kycId);
  const reqsForEnquiry = (eqId: string) => (allEnquiryChangeReqs.data ?? []).filter((r) => r.enquiryId === eqId);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto h-full" data-testid="page-team-portal">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-primary" />
            My Portal
          </h1>
          <p className="text-sm text-muted-foreground">Welcome, <span className="font-medium text-foreground">{username}</span>. Track your submissions and request amendments after admin approval.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-stat-kyc">
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" />My KYC Submissions</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{kycList.length}</div></CardContent>
        </Card>
        <Card data-testid="card-stat-enquiries">
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><FileText className="w-4 h-4" />My Enquiries</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{enquiryList.length}</div></CardContent>
        </Card>
        <Card data-testid="card-stat-pending">
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><Clock className="w-4 h-4" />Pending Amendments</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(allKycChangeReqs.data ?? []).filter((r) => r.status === "pending" && kycList.some(k => k.id === r.kycApplicationId)).length
                + (allEnquiryChangeReqs.data ?? []).filter((r) => r.status === "pending" && enquiryList.some(e => e.id === r.enquiryId)).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="kyc">
        <TabsList>
          <TabsTrigger value="kyc" data-testid="tab-kyc">My KYC</TabsTrigger>
          <TabsTrigger value="enquiries" data-testid="tab-enquiries">My Enquiries</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">My Documents</TabsTrigger>
          <TabsTrigger value="clients" data-testid="tab-clients">Potential Clients</TabsTrigger>
          <TabsTrigger value="tasks" data-testid="tab-tasks">My Work</TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">Daily Report</TabsTrigger>
        </TabsList>

        <TabsContent value="kyc" className="space-y-4">
          <Card className="border-primary/20 bg-primary/5" data-testid="card-online-kyc-link">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Link2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Online KYC Link</p>
                  <p className="text-xs text-muted-foreground">Share with clients to start their KYC application online</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex flex-1 items-center gap-2 bg-background border border-border rounded-md px-3 py-2 min-w-0">
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-muted-foreground truncate font-mono" data-testid="text-online-kyc-link">{kycOnboardingUrl}</span>
                </div>
                <Button
                  size="sm"
                  variant={kycLinkCopied ? "secondary" : "outline"}
                  onClick={copyKycLink}
                  className="flex-shrink-0"
                  data-testid="button-copy-online-kyc-link"
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  {kycLinkCopied ? "Copied!" : "Copy Link"}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="client@company.com"
                  value={kycLinkEmail}
                  onChange={(e) => setKycLinkEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && kycLinkEmail.trim()) sendKycLinkMutation.mutate(kycLinkEmail.trim()); }}
                  className="h-9 text-xs flex-1"
                  data-testid="input-online-kyc-email"
                />
                <Button
                  size="sm"
                  onClick={() => kycLinkEmail.trim() && sendKycLinkMutation.mutate(kycLinkEmail.trim())}
                  disabled={sendKycLinkMutation.isPending || !kycLinkEmail.trim()}
                  className="flex-shrink-0"
                  data-testid="button-send-online-kyc-link"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {sendKycLinkMutation.isPending ? "Sending…" : "Send Invite"}
                </Button>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end gap-2 flex-wrap">
            <a href="/api/kyc-form/blank-pdf" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" data-testid="button-download-blank-kyc">
                <Download className="w-4 h-4 mr-1" />Download Blank Form
              </Button>
            </a>
            <Button variant="secondary" onClick={() => setBlankFormDialogOpen(true)} data-testid="button-email-blank-kyc">
              <Send className="w-4 h-4 mr-1" />Email Blank Form
            </Button>
            <Link href="/kyc">
              <Button data-testid="button-new-kyc"><Plus className="w-4 h-4 mr-1" />Submit New KYC</Button>
            </Link>
          </div>
          {kycQuery.isLoading ? <Skeleton className="h-32" /> : kycList.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">You haven't submitted any KYC applications yet.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {kycList.map((kyc) => {
                const reqs = reqsForKyc(kyc.id);
                const pending = reqs.filter((r) => r.status === "pending");
                return (
                  <Card key={kyc.id} data-testid={`card-kyc-${kyc.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2 flex-wrap" data-testid={`text-kyc-name-${kyc.id}`}>
                            {kyc.companyName}
                            {(kyc as any).participantId && (
                              <Badge variant="outline" className="font-mono text-[10px]" data-testid={`badge-participant-id-${kyc.id}`}>{(kyc as any).participantId}</Badge>
                            )}
                          </CardTitle>
                          <CardDescription className="text-xs mt-1">
                            Reg #{kyc.registrationNumber} • {kyc.countryOfIncorporation} • Submitted {new Date(kyc.createdAt).toLocaleDateString()}
                          </CardDescription>
                        </div>
                        <StatusBadge status={kyc.status} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                        <div><span className="text-muted-foreground">Contact:</span> <span className="font-medium">{kyc.contactName}</span></div>
                        <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{kyc.contactEmail}</span></div>
                        {kyc.category && <div><span className="text-muted-foreground">Category:</span> <Badge variant="outline">{kyc.category}</Badge></div>}
                      </div>
                      {kyc.reviewNotes && (
                        <div className="text-xs p-2 rounded bg-muted">
                          <span className="font-medium">Admin notes:</span> {kyc.reviewNotes}
                        </div>
                      )}
                      {reqs.length > 0 && (
                        <div className="space-y-1.5 border-t pt-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Amendment Requests</p>
                          {reqs.map((r) => (
                            <div key={r.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/40" data-testid={`row-kyc-amend-${r.id}`}>
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{Object.keys((r.changedFields as any) || {}).length} field(s)</span>
                                <span className="text-muted-foreground ml-2">{new Date(r.createdAt).toLocaleString()}</span>
                                {r.reason && <p className="text-muted-foreground truncate">{r.reason}</p>}
                                {r.adminNotes && <p className="text-muted-foreground italic">Admin: {r.adminNotes}</p>}
                              </div>
                              <StatusBadge status={r.status} />
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-end gap-2 flex-wrap">
                        <a href={`/api/kyc/${kyc.id}/pdf`} target="_blank" rel="noreferrer" data-testid={`link-download-kyc-pdf-${kyc.id}`}>
                          <Button variant="outline" size="sm">
                            <Download className="w-3.5 h-3.5 mr-1" /> Download PDF
                          </Button>
                        </a>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            setSendKycPdfApp(kyc);
                            setSendKycPdfTo(kyc.contactEmail || kyc.signatoryEmail || "");
                            setSendKycPdfName(kyc.contactName || kyc.signatoryName || "");
                            setSendKycPdfCc("");
                            setSendKycPdfMsg("");
                          }}
                          data-testid={`button-send-kyc-pdf-${kyc.id}`}
                        >
                          <Mail className="w-3.5 h-3.5 mr-1" /> Send PDF to Client
                        </Button>
                        <AmendmentDialog
                          title={`Request Amendment — ${kyc.companyName}`}
                          fields={KYC_AMENDABLE_FIELDS}
                          current={kyc as any}
                          disabled={kyc.status !== "approved" || pending.length > 0}
                          triggerLabel={kyc.status !== "approved" ? "Amendments after approval" : pending.length > 0 ? "Amendment Pending" : "Request Amendment"}
                          testIdPrefix={`kyc-${kyc.id}`}
                          onSubmit={(changedFields, reason) => requestKycAmendment.mutateAsync({ id: kyc.id, changedFields, reason })}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="enquiries" className="space-y-4">
          <Card className="border-primary/20 bg-primary/5" data-testid="card-online-enquiry-link">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Link2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Online Enquiry Link</p>
                  <p className="text-xs text-muted-foreground">Share with clients to submit a trade enquiry online</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex flex-1 items-center gap-2 bg-background border border-border rounded-md px-3 py-2 min-w-0">
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-muted-foreground truncate font-mono" data-testid="text-online-enquiry-link">{enquiryOnboardingUrl}</span>
                </div>
                <Button size="sm" variant={enquiryLinkCopied ? "secondary" : "outline"} onClick={copyEnquiryLink} className="flex-shrink-0" data-testid="button-copy-online-enquiry-link">
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  {enquiryLinkCopied ? "Copied!" : "Copy Link"}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="client@company.com"
                  value={enquiryLinkEmail}
                  onChange={(e) => setEnquiryLinkEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && enquiryLinkEmail.trim()) sendEnquiryLinkMutation.mutate(enquiryLinkEmail.trim()); }}
                  className="h-9 text-xs flex-1"
                  data-testid="input-online-enquiry-email"
                />
                <Button size="sm" onClick={() => enquiryLinkEmail.trim() && sendEnquiryLinkMutation.mutate(enquiryLinkEmail.trim())} disabled={sendEnquiryLinkMutation.isPending || !enquiryLinkEmail.trim()} className="flex-shrink-0" data-testid="button-send-online-enquiry-link">
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {sendEnquiryLinkMutation.isPending ? "Sending…" : "Send Invite"}
                </Button>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <NewEnquiryDialog />
          </div>
          {enquiryQuery.isLoading ? <Skeleton className="h-32" /> : enquiryList.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">You haven't submitted any enquiries yet.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {enquiryList.map((eq) => {
                const reqs = reqsForEnquiry(eq.id);
                const pending = reqs.filter((r) => r.status === "pending");
                const lockedForAmendment = ["accepted", "closed", "quoted", "under_review"].includes(eq.status);
                return (
                  <Card key={eq.id} data-testid={`card-enquiry-${eq.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2" data-testid={`text-enquiry-ref-${eq.id}`}>
                            {eq.enquiryRef}
                            <Badge variant="outline" className="text-[10px]">{eq.side?.toUpperCase()}</Badge>
                          </CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {eq.product} • {eq.quantity || "—"} {eq.unit || ""} • Submitted {new Date(eq.createdAt).toLocaleDateString()}
                          </CardDescription>
                        </div>
                        <StatusBadge status={eq.status} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                        {eq.loadingPort && <div><span className="text-muted-foreground">Loading:</span> {eq.loadingPort}</div>}
                        {eq.incoterms && <div><span className="text-muted-foreground">Incoterms:</span> {eq.incoterms}</div>}
                        {eq.linkedTradeRef && (
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">Trade:</span>
                            <Link href="/trading" className="text-primary hover:underline inline-flex items-center gap-0.5">{eq.linkedTradeRef}<ExternalLink className="w-3 h-3" /></Link>
                          </div>
                        )}
                      </div>
                      {eq.specifications && <div className="text-xs"><span className="text-muted-foreground">Specs:</span> {eq.specifications}</div>}
                      {reqs.length > 0 && (
                        <div className="space-y-1.5 border-t pt-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Amendment Requests</p>
                          {reqs.map((r) => (
                            <div key={r.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/40" data-testid={`row-enquiry-amend-${r.id}`}>
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{Object.keys((r.changedFields as any) || {}).length} field(s)</span>
                                <span className="text-muted-foreground ml-2">{new Date(r.createdAt).toLocaleString()}</span>
                                {r.reason && <p className="text-muted-foreground truncate">{r.reason}</p>}
                                {r.adminNotes && <p className="text-muted-foreground italic">Admin: {r.adminNotes}</p>}
                              </div>
                              <StatusBadge status={r.status} />
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-end gap-2 flex-wrap">
                        {eq.status === "accepted" && (
                          <Link href={`/documents?enquiryRef=${encodeURIComponent(eq.enquiryRef)}`}>
                            <Button variant="default" size="sm" data-testid={`button-create-doc-${eq.id}`}>
                              <FilePlus className="w-4 h-4 mr-1" /> Generate Documents
                            </Button>
                          </Link>
                        )}
                        <AmendmentDialog
                          title={`Request Amendment — ${eq.enquiryRef}`}
                          fields={ENQUIRY_AMENDABLE_FIELDS}
                          current={eq as any}
                          disabled={!lockedForAmendment || pending.length > 0}
                          triggerLabel={
                            !lockedForAmendment
                              ? "Edit while still active"
                              : pending.length > 0
                              ? "Amendment Pending"
                              : "Request Amendment"
                          }
                          testIdPrefix={`enquiry-${eq.id}`}
                          onSubmit={(changedFields, reason) => requestEnquiryAmendment.mutateAsync({ id: eq.id, changedFields, reason })}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="clients" className="space-y-4">
          <PotentialClientsPanel />
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <MyTasksPanel username={username || ""} />
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <DailyReportPanel />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          {documentsQuery.isLoading ? <Skeleton className="h-32" /> : (documentsQuery.data ?? []).length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
              You haven't created any documents yet. Documents can be created from your <span className="font-semibold">accepted</span> enquiries.
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {(documentsQuery.data ?? []).map((doc) => {
                const approved = ["draft", "final"].includes(doc.status);
                const sent = doc.status === "sent";
                const rejected = doc.status === "rejected";
                const pendingReview = doc.status === "pending_review";
                const isNcnda = doc.docType === "NCNDA";
                const hasSig = isNcnda ? (doc.sellerSignature || doc.buyerSignature) : doc.buyerSignature;
                const canSend = approved && hasSig;
                return (
                  <Card key={doc.id} data-testid={`card-doc-${doc.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{doc.docType}</Badge>
                            <span className="truncate" data-testid={`text-doc-title-${doc.id}`}>{doc.title}</span>
                          </CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {doc.enquiryRef && <>Enquiry: <span className="font-mono">{doc.enquiryRef}</span> • </>}
                            Created {new Date(doc.createdAt).toLocaleString()}
                          </CardDescription>
                        </div>
                        <StatusBadge status={doc.status} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {pendingReview && (
                        <Alert>
                          <Clock className="w-4 h-4" />
                          <AlertTitle className="text-sm">Awaiting admin approval</AlertTitle>
                          <AlertDescription className="text-xs">An admin must review and approve this document before you can send it to the buyer or seller.</AlertDescription>
                        </Alert>
                      )}
                      {rejected && doc.adminReviewNotes && (
                        <Alert variant="destructive">
                          <XCircle className="w-4 h-4" />
                          <AlertTitle className="text-sm">Rejected by admin</AlertTitle>
                          <AlertDescription className="text-xs">{doc.adminReviewNotes}</AlertDescription>
                        </Alert>
                      )}
                      {approved && !hasSig && (
                        <Alert>
                          <AlertCircle className="w-4 h-4" />
                          <AlertTitle className="text-sm">Approved — signature required</AlertTitle>
                          <AlertDescription className="text-xs">Open the document in the generator to apply your signature, then come back to send.</AlertDescription>
                        </Alert>
                      )}
                      {sent && (
                        <div className="text-xs p-2 rounded bg-muted/40">
                          <span className="font-medium">Sent to:</span> {doc.sentTo}
                          {doc.recipientResponse && <Badge variant="outline" className="ml-2 text-[10px]">{doc.recipientResponse}</Badge>}
                        </div>
                      )}
                      <div className="flex justify-end gap-2 flex-wrap">
                        {doc.pdfPath && (
                          <a href={`/api/documents/${doc.id}/download/pdf`} target="_blank" rel="noreferrer">
                            <Button variant="outline" size="sm" data-testid={`button-download-pdf-${doc.id}`}>PDF</Button>
                          </a>
                        )}
                        {doc.docxPath && (
                          <a href={`/api/documents/${doc.id}/download/docx`} target="_blank" rel="noreferrer">
                            <Button variant="outline" size="sm" data-testid={`button-download-docx-${doc.id}`}>DOCX</Button>
                          </a>
                        )}
                        <Link href={`/documents?docId=${doc.id}`}>
                          <Button variant="outline" size="sm" data-testid={`button-open-doc-${doc.id}`}>
                            <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          disabled={!canSend}
                          onClick={() => {
                            setSendDialogDoc(doc);
                            setSendRecipient(doc.buyerEmail || doc.sellerEmail || "");
                            setSendCc("");
                          }}
                          data-testid={`button-send-doc-${doc.id}`}
                        >
                          <Mail className="w-4 h-4 mr-1" />
                          {sent ? "Re-send" : canSend ? "Send to Buyer/Seller" : "Awaiting Approval"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!sendDialogDoc} onOpenChange={(o) => !o && setSendDialogDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Document by Email</DialogTitle>
            <DialogDescription>
              Send <span className="font-mono">{sendDialogDoc?.docType}</span> — {sendDialogDoc?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1">
              <Label className="text-xs">Recipient Email *</Label>
              <Input
                type="email"
                value={sendRecipient}
                onChange={(e) => setSendRecipient(e.target.value)}
                placeholder="buyer@example.com"
                data-testid="input-send-recipient"
              />
              {(sendDialogDoc?.buyerEmail || sendDialogDoc?.sellerEmail) && (
                <div className="flex gap-2 mt-1 flex-wrap">
                  {sendDialogDoc?.buyerEmail && (
                    <Button type="button" variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => setSendRecipient(sendDialogDoc.buyerEmail!)}>
                      Buyer: {sendDialogDoc.buyerEmail}
                    </Button>
                  )}
                  {sendDialogDoc?.sellerEmail && (
                    <Button type="button" variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => setSendRecipient(sendDialogDoc.sellerEmail!)}>
                      Seller: {sendDialogDoc.sellerEmail}
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">CC (optional)</Label>
              <Input
                type="email"
                value={sendCc}
                onChange={(e) => setSendCc(e.target.value)}
                placeholder="cc@example.com"
                data-testid="input-send-cc"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendDialogDoc(null)}>Cancel</Button>
            <Button
              disabled={!sendRecipient || sendDocMutation.isPending}
              onClick={() => sendDialogDoc && sendDocMutation.mutate({ id: sendDialogDoc.id, recipientEmail: sendRecipient, ccEmail: sendCc })}
              data-testid="button-confirm-send"
            >
              <Send className="w-4 h-4 mr-1" />
              {sendDocMutation.isPending ? "Sending…" : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={blankFormDialogOpen} onOpenChange={setBlankFormDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-email-blank-kyc">
          <DialogHeader>
            <DialogTitle>Email Blank KYC Application Form</DialogTitle>
            <DialogDescription>Send a printable Bullex KYC form to a client to complete offline.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1">
              <Label className="text-xs">Recipient Email *</Label>
              <Input value={blankFormTo} onChange={(e) => setBlankFormTo(e.target.value)} placeholder="client@example.com" data-testid="input-blank-kyc-to" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Recipient Name</Label>
              <Input value={blankFormName} onChange={(e) => setBlankFormName(e.target.value)} placeholder="Mr. John Doe" data-testid="input-blank-kyc-name" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">CC (optional)</Label>
              <Input value={blankFormCc} onChange={(e) => setBlankFormCc(e.target.value)} placeholder="cc@example.com" data-testid="input-blank-kyc-cc" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Message (optional)</Label>
              <Textarea value={blankFormMsg} onChange={(e) => setBlankFormMsg(e.target.value)} rows={3} placeholder="Add a short note for the recipient…" data-testid="input-blank-kyc-msg" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBlankFormDialogOpen(false)} data-testid="button-blank-kyc-cancel">Cancel</Button>
            <Button
              disabled={sendBlankKycFormMutation.isPending || !blankFormTo.trim()}
              onClick={() => sendBlankKycFormMutation.mutate({ recipientEmail: blankFormTo.trim(), recipientName: blankFormName.trim(), ccEmail: blankFormCc.trim(), message: blankFormMsg.trim() })}
              data-testid="button-blank-kyc-confirm"
            >
              <Send className="w-4 h-4 mr-1.5" />
              {sendBlankKycFormMutation.isPending ? "Sending…" : "Send Form"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sendKycPdfApp} onOpenChange={(o) => !o && setSendKycPdfApp(null)}>
        <DialogContent className="max-w-lg" data-testid="dialog-send-kyc-pdf">
          <DialogHeader>
            <DialogTitle>Send KYC Application PDF</DialogTitle>
            <DialogDescription>
              Email the KYC PDF for <span className="font-semibold">{sendKycPdfApp?.companyName}</span> to a recipient.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1">
              <Label className="text-xs">Recipient Email *</Label>
              <Input value={sendKycPdfTo} onChange={(e) => setSendKycPdfTo(e.target.value)} placeholder="client@example.com" data-testid="input-send-kyc-pdf-to" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Recipient Name</Label>
              <Input value={sendKycPdfName} onChange={(e) => setSendKycPdfName(e.target.value)} placeholder="Mr. John Doe" data-testid="input-send-kyc-pdf-name" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">CC (optional)</Label>
              <Input value={sendKycPdfCc} onChange={(e) => setSendKycPdfCc(e.target.value)} placeholder="cc@example.com" data-testid="input-send-kyc-pdf-cc" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Message (optional)</Label>
              <Textarea value={sendKycPdfMsg} onChange={(e) => setSendKycPdfMsg(e.target.value)} rows={3} placeholder="Add a short note for the recipient…" data-testid="input-send-kyc-pdf-msg" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendKycPdfApp(null)} data-testid="button-send-kyc-pdf-cancel">Cancel</Button>
            <Button
              disabled={sendKycPdfMutation.isPending || !sendKycPdfTo.trim() || !sendKycPdfApp}
              onClick={() => sendKycPdfApp && sendKycPdfMutation.mutate({ id: sendKycPdfApp.id, recipientEmail: sendKycPdfTo.trim(), recipientName: sendKycPdfName.trim(), ccEmail: sendKycPdfCc.trim(), message: sendKycPdfMsg.trim() })}
              data-testid="button-send-kyc-pdf-confirm"
            >
              <Send className="w-4 h-4 mr-1.5" />
              {sendKycPdfMutation.isPending ? "Sending…" : "Send PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MyTasksPanel({ username }: { username: string }) {
  const { toast } = useToast();
  const tasksQuery = useQuery<TeamTask[]>({ queryKey: ["/api/tasks"] });
  const myTasks = (tasksQuery.data ?? []).filter(t => t.assignee === username);
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiRequest("PATCH", `/api/tasks/${id}`, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }); toast({ title: "Status updated" }); },
  });
  const STATUS_OPTS = [
    { v: "todo", l: "To Do" },
    { v: "in_progress", l: "In Progress" },
    { v: "review", l: "Review" },
    { v: "done", l: "Done" },
  ];
  if (tasksQuery.isLoading) return <Skeleton className="h-32" />;
  if (myTasks.length === 0) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No work allocated to you yet.</CardContent></Card>;
  return (
    <div className="space-y-3">
      {myTasks.map(task => (
        <Card key={task.id} data-testid={`card-task-${task.id}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm" data-testid={`text-task-title-${task.id}`}>{task.title}</h4>
                {task.description && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{task.description}</p>}
              </div>
              <Badge variant="outline" className="text-[10px]">{task.priority}</Badge>
            </div>
            <div className="flex items-center justify-between gap-2 mt-3 mb-3">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {task.dueDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{task.dueDate}</span>}
                {task.createdBy && <span>by {task.createdBy}</span>}
              </div>
              <div className="flex items-center gap-1">
                {STATUS_OPTS.map(s => (
                  <Button key={s.v} size="sm" variant={task.status === s.v ? "default" : "outline"} className="h-7 text-[10px] px-2"
                    onClick={() => updateStatus.mutate({ id: task.id, status: s.v })}
                    disabled={updateStatus.isPending}
                    data-testid={`button-set-${s.v}-${task.id}`}>
                    {s.l}
                  </Button>
                ))}
              </div>
            </div>
            <TaskUpdatesPanel taskId={task.id} author={username} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TaskUpdatesPanel({ taskId, author }: { taskId: string; author: string }) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const updatesQuery = useQuery<any[]>({
    queryKey: ["/api/tasks", taskId, "updates"],
    queryFn: () => fetch(`/api/tasks/${taskId}/updates`, { credentials: "include" }).then(r => r.json()),
  });
  const postUpdate = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tasks/${taskId}/updates`, { text, author }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "updates"] });
      setText("");
      toast({ title: "Progress update posted" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message || "Try again.", variant: "destructive" }),
  });
  const updates = updatesQuery.data ?? [];
  return (
    <div className="border-t pt-3 mt-2 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Progress / Explanation</p>
      {updates.length > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {updates.map((u: any) => (
            <div key={u.id} className="bg-muted/40 rounded px-2.5 py-1.5 text-xs" data-testid={`update-${u.id}`}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-semibold text-[11px]">{u.author}</span>
                <span className="text-[9px] text-muted-foreground">{new Date(u.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="whitespace-pre-wrap text-foreground/85">{u.text}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Textarea
          rows={2}
          placeholder="Add a progress note or explanation…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="text-xs flex-1"
          data-testid={`input-update-${taskId}`}
        />
        <Button size="sm" onClick={() => postUpdate.mutate()} disabled={!text.trim() || postUpdate.isPending} data-testid={`button-post-update-${taskId}`}>
          {postUpdate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function DailyReportPanel() {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ reportDate: today, hoursWorked: "", summary: "", tasksCompleted: "", blockers: "", nextSteps: "" });
  const reportsQuery = useQuery<DailyReport[]>({ queryKey: ["/api/daily-reports"] });
  const submit = useMutation({
    mutationFn: () => apiRequest("POST", "/api/daily-reports", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/daily-reports"] });
      setForm({ reportDate: today, hoursWorked: "", summary: "", tasksCompleted: "", blockers: "", nextSteps: "" });
      toast({ title: "Daily Report Submitted", description: "Your report has been recorded." });
    },
    onError: (e: any) => toast({ title: "Submission Failed", description: e?.message || "Try again.", variant: "destructive" }),
  });
  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="w-4 h-4 text-primary" />Submit Today's Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={form.reportDate} onChange={(e) => setForm({ ...form, reportDate: e.target.value })} className="h-9 mt-1" data-testid="input-report-date" />
            </div>
            <div>
              <Label className="text-xs">Hours Worked</Label>
              <Input placeholder="e.g. 8" value={form.hoursWorked} onChange={(e) => setForm({ ...form, hoursWorked: e.target.value })} className="h-9 mt-1" data-testid="input-hours-worked" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Summary *</Label>
            <Textarea placeholder="What did you work on today?" rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} className="mt-1" data-testid="input-summary" />
          </div>
          <div>
            <Label className="text-xs">Tasks Completed</Label>
            <Textarea placeholder="Specific deliverables / tickets / clients handled" rows={2} value={form.tasksCompleted} onChange={(e) => setForm({ ...form, tasksCompleted: e.target.value })} className="mt-1" data-testid="input-tasks-completed" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Blockers</Label>
              <Textarea placeholder="Anything blocking you?" rows={2} value={form.blockers} onChange={(e) => setForm({ ...form, blockers: e.target.value })} className="mt-1" data-testid="input-blockers" />
            </div>
            <div>
              <Label className="text-xs">Next Steps</Label>
              <Textarea placeholder="Plan for tomorrow" rows={2} value={form.nextSteps} onChange={(e) => setForm({ ...form, nextSteps: e.target.value })} className="mt-1" data-testid="input-next-steps" />
            </div>
          </div>
          <Button onClick={() => submit.mutate()} disabled={!form.summary.trim() || submit.isPending} className="w-full" data-testid="button-submit-report">
            {submit.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            {submit.isPending ? "Submitting…" : "Submit Daily Report"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" />My Recent Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {reportsQuery.isLoading ? <Skeleton className="h-20" /> : (reportsQuery.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No reports submitted yet.</p>
          ) : (
            <div className="space-y-2">
              {(reportsQuery.data ?? []).slice(0, 10).map(r => (
                <div key={r.id} className="border rounded-md p-3 text-xs" data-testid={`report-${r.id}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-3 h-3 text-muted-foreground" />
                      <span className="font-semibold">{r.reportDate}</span>
                      {r.hoursWorked && <Badge variant="outline" className="text-[10px]">{r.hoursWorked}h</Badge>}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{new Date(r.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="whitespace-pre-wrap" data-testid={`report-summary-${r.id}`}>{r.summary}</p>
                  {r.tasksCompleted && <p className="mt-1 text-muted-foreground"><span className="font-semibold">Tasks:</span> {r.tasksCompleted}</p>}
                  {r.blockers && <p className="mt-1 text-amber-700 dark:text-amber-400"><span className="font-semibold">Blockers:</span> {r.blockers}</p>}
                  {r.nextSteps && <p className="mt-1 text-muted-foreground"><span className="font-semibold">Next:</span> {r.nextSteps}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
