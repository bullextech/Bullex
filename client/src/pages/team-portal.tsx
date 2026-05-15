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
import { Briefcase, FileText, ShieldCheck, Plus, Send, AlertCircle, CheckCircle2, Clock, XCircle, ExternalLink } from "lucide-react";
import type { KycApplication, TradeEnquiry, EnquiryChangeRequest, KycChangeRequest } from "@shared/schema";

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
    approved: { variant: "default", icon: CheckCircle2, label: "Approved" },
    accepted: { variant: "default", icon: CheckCircle2, label: "Accepted" },
    rejected: { variant: "destructive", icon: XCircle, label: "Rejected" },
    active: { variant: "secondary", icon: Clock, label: "Active" },
    open: { variant: "secondary", icon: Clock, label: "Open" },
    under_review: { variant: "secondary", icon: Clock, label: "Under Review" },
    quoted: { variant: "default", icon: CheckCircle2, label: "Quoted" },
    closed: { variant: "outline", icon: CheckCircle2, label: "Closed" },
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
    <div className="p-6 space-y-6 overflow-y-auto h-full" data-testid="page-team-portal">
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
        </TabsList>

        <TabsContent value="kyc" className="space-y-4">
          <div className="flex justify-end">
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
                          <CardTitle className="text-base" data-testid={`text-kyc-name-${kyc.id}`}>{kyc.companyName}</CardTitle>
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
                      <div className="flex justify-end">
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
                      <div className="flex justify-end">
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
      </Tabs>
    </div>
  );
}
