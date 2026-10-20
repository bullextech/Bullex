import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Workflow,
  ArrowDownToLine,
  ArrowUpFromLine,
  GitMerge,
  FileCheck2,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Scale, XCircle, Pencil, Landmark, Trash2, FolderOpen } from "lucide-react";
import { productImageFor } from "@/lib/product-images";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TradeEnquiry, Deal, TfrCandidate, TfrRecipient } from "@shared/schema";

// Manually incorporable TFR fields, grouped for the edit dialog. Values are
// merged over the auto-derived TFR data server-side and stored for reuse.
const TFR_FIELD_GROUPS: { title: string; fields: { key: string; label: string; textarea?: boolean }[] }[] = [
  {
    title: "Addressed To (Bank / Recipient)",
    fields: [
      { key: "addressedToName", label: "Name / Institution" },
      { key: "addressedToAddress", label: "Address", textarea: true },
      { key: "addressedToAttn", label: "Attn." },
    ],
  },
  {
    title: "Banking Assessment",
    fields: [
      { key: "buyerBank", label: "Buyer Bank" },
      { key: "buyerBankRating", label: "Buyer Bank Rating" },
      { key: "sellerBank", label: "Seller Bank" },
      { key: "sellerBankRating", label: "Seller Bank Rating" },
      { key: "proposedInstruments", label: "Possible Instruments" },
    ],
  },
  {
    title: "Financing Requirement",
    fields: [
      { key: "workingCapitalRequired", label: "Working Capital Required" },
      { key: "financingPeriod", label: "Financing Period" },
      { key: "expectedYield", label: "Expected Yield" },
    ],
  },
  {
    title: "Sign-off & Additional Details",
    fields: [
      { key: "preparedBy", label: "Prepared By" },
      { key: "additionalDetails", label: "Additional Details", textarea: true },
    ],
  },
];

// Full-document TFR editing: the entire TFR text is opened in one editor so
// sections that don't apply can be removed (or kept for later incorporation).
// The DOCX/PDF are regenerated from the edited text on save.
type TfrContentTarget = {
  refLabel: string;
  endpoint: string;
  docId: string;
};
function TfrContentDialog({
  target,
  open,
  onClose,
}: {
  target: TfrContentTarget;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { data: doc, isLoading } = useQuery<{ content?: string | null }>({
    queryKey: [`/api/documents/${target.docId}`],
    enabled: open,
  });
  const [text, setText] = useState<string | null>(null);
  const value = text ?? doc?.content ?? "";

  const save = useMutation({
    mutationFn: async () => apiRequest("PATCH", target.endpoint, { content: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tfr-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${target.docId}`] });
      toast({
        title: "TFR text updated",
        description: "The full document was saved and the DOCX/PDF regenerated from it.",
      });
      onClose();
    },
    onError: (e: any) =>
      toast({ title: "Could not update TFR", description: e?.message || "Error", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">Edit Full TFR — {target.refLabel}</DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-muted-foreground">
          The entire TFR is open for editing — delete sections that are not required, or leave them in
          place for later incorporation. Your manual edits are protected: a later "Edit TFR Details" save
          will ask for confirmation before rebuilding the document from the template.
        </p>
        {isLoading ? (
          <Skeleton className="h-64" />
        ) : (
          <Textarea
            className="font-mono text-xs flex-1 min-h-[50vh]"
            value={value}
            onChange={(e) => setText(e.target.value)}
            data-testid="textarea-tfr-content"
          />
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={save.isPending || isLoading || !value.trim()}
            onClick={() => save.mutate()}
            data-testid="button-save-tfr-content"
          >
            {save.isPending ? "Saving…" : "Save Full TFR & Regenerate Files"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TfrEditTarget = {
  refLabel: string;
  endpoint: string;
  initialDetails: Record<string, string> | null | undefined;
};
function TfrDetailsDialog({
  target,
  open,
  onClose,
}: {
  target: TfrEditTarget;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>(
    () => ({ ...(target.initialDetails || {}) }),
  );
  const { data: recipients } = useQuery<TfrRecipient[]>({
    queryKey: ["/api/tfr-recipients"],
    enabled: open,
  });
  // Set when the server refused to rebuild because the TFR text was manually
  // edited; renders a confirm dialog before re-sending with confirmRebuild.
  const [confirmingRebuild, setConfirmingRebuild] = useState(false);

  const save = useMutation({
    mutationFn: async ({ confirmRebuild }: { confirmRebuild?: boolean } = {}) =>
      apiRequest("PATCH", target.endpoint, confirmRebuild ? { ...values, confirmRebuild: true } : values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tfr-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tfr-recipients"] });
      toast({
        title: "TFR updated",
        description: "Details were incorporated into the TFR and the recipient saved for future use.",
      });
      onClose();
    },
    onError: (e: any) => {
      if (String(e?.message || "").includes("manually edited")) {
        setConfirmingRebuild(true);
        return;
      }
      toast({ title: "Could not update TFR", description: e?.message || "Error", variant: "destructive" });
    },
  });

  const applyRecipient = (id: string) => {
    const r = (recipients || []).find((x) => x.id === id);
    if (!r) return;
    setValues((v) => ({
      ...v,
      addressedToName: r.name,
      addressedToAddress: r.address || "",
      addressedToAttn: r.attn || "",
    }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">Incorporate TFR Details — {target.refLabel}</DialogTitle>
        </DialogHeader>
        {(recipients || []).length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Reuse a saved recipient</Label>
            <Select onValueChange={applyRecipient}>
              <SelectTrigger data-testid="select-tfr-recipient">
                <SelectValue placeholder="Select saved bank / recipient…" />
              </SelectTrigger>
              <SelectContent>
                {(recipients || []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {TFR_FIELD_GROUPS.map((group) => (
          <div key={group.title} className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.title}</p>
            {group.fields.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs" htmlFor={`tfr-${f.key}`}>{f.label}</Label>
                {f.textarea ? (
                  <Textarea
                    id={`tfr-${f.key}`}
                    rows={2}
                    value={values[f.key] || ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    data-testid={`input-tfr-${f.key}`}
                  />
                ) : (
                  <Input
                    id={`tfr-${f.key}`}
                    value={values[f.key] || ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    data-testid={`input-tfr-${f.key}`}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={() => save.mutate({})}
            data-testid="button-save-tfr-details"
          >
            {save.isPending ? "Saving…" : "Save & Regenerate TFR"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <AlertDialog open={confirmingRebuild} onOpenChange={(o) => !o && setConfirmingRebuild(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rebuild TFR and lose manual edits?</AlertDialogTitle>
            <AlertDialogDescription>
              This TFR's text was manually edited via "Edit Full TFR". Saving these details rebuilds the
              document from the template, which will discard those manual text edits. Do you want to
              rebuild anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-tfr-rebuild">Keep Manual Edits</AlertDialogCancel>
            <AlertDialogAction
              disabled={save.isPending}
              onClick={() => {
                setConfirmingRebuild(false);
                save.mutate({ confirmRebuild: true });
              }}
              data-testid="button-confirm-tfr-rebuild"
            >
              Rebuild &amp; Discard Edits
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

// Admin directory of saved TFR recipients (banks / addressees). Lists every
// saved recipient with edit + delete so outdated or misspelled entries don't
// accumulate in the reuse dropdown forever.
function SavedRecipientsCard() {
  const { toast } = useToast();
  const { data: recipients, isLoading } = useQuery<TfrRecipient[]>({
    queryKey: ["/api/tfr-recipients"],
  });
  const [editing, setEditing] = useState<TfrRecipient | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<TfrRecipient | null>(null);
  const [form, setForm] = useState({ name: "", address: "", attn: "", notes: "" });

  const startEdit = (r: TfrRecipient) => {
    setEditing(r);
    setForm({ name: r.name, address: r.address || "", attn: r.attn || "", notes: r.notes || "" });
  };

  const update = useMutation({
    mutationFn: async () =>
      apiRequest("PATCH", `/api/tfr-recipients/${editing!.id}`, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tfr-recipients"] });
      toast({ title: "Recipient updated", description: "The saved details were corrected." });
      setEditing(null);
    },
    onError: (e: any) =>
      toast({ title: "Could not update recipient", description: e?.message || "Error", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/tfr-recipients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tfr-recipients"] });
      toast({ title: "Recipient removed", description: "It will no longer appear in the reuse dropdown." });
      setConfirmingDelete(null);
    },
    onError: (e: any) =>
      toast({ title: "Could not remove recipient", description: e?.message || "Error", variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Landmark className="w-4 h-4" /> Saved TFR Recipients
        </CardTitle>
        <p className="text-[11px] text-muted-foreground mt-1">
          Banks / addressees saved from TFR edits, reusable in the "Incorporate TFR Details" dialog.
          Correct outdated details or remove obsolete entries here.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-16" />
        ) : !recipients || recipients.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-recipients-empty">
            No saved recipients yet. Saving TFR details with an "Addressed To" name adds it here.
          </p>
        ) : (
          recipients.map((r) => (
            <div
              key={r.id}
              className="rounded-md border border-border p-3 flex items-start gap-3"
              data-testid={`recipient-row-${r.id}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold truncate" data-testid={`text-recipient-name-${r.id}`}>{r.name}</div>
                {r.address && <div className="text-[11px] text-muted-foreground whitespace-pre-line">{r.address}</div>}
                {r.attn && <div className="text-[11px] text-muted-foreground">Attn: {r.attn}</div>}
                {r.notes && <div className="text-[11px] text-muted-foreground italic">{r.notes}</div>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startEdit(r)}
                  data-testid={`button-edit-recipient-${r.id}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  disabled={remove.isPending}
                  onClick={() => setConfirmingDelete(r)}
                  data-testid={`button-delete-recipient-${r.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
      <AlertDialog open={!!confirmingDelete} onOpenChange={(o) => !o && setConfirmingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved recipient?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmingDelete?.name}" will be permanently removed and will no longer
              appear in the reuse dropdown. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-recipient">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={() => confirmingDelete && remove.mutate(confirmingDelete.id)}
              data-testid="button-confirm-delete-recipient"
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Edit Saved Recipient</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="recipient-name">Name / Institution</Label>
              <Input
                id="recipient-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                data-testid="input-recipient-name"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="recipient-address">Address</Label>
              <Textarea
                id="recipient-address"
                rows={2}
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                data-testid="input-recipient-address"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="recipient-attn">Attn.</Label>
              <Input
                id="recipient-attn"
                value={form.attn}
                onChange={(e) => setForm((f) => ({ ...f, attn: e.target.value }))}
                data-testid="input-recipient-attn"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="recipient-notes">Notes</Label>
              <Input
                id="recipient-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                data-testid="input-recipient-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              size="sm"
              disabled={update.isPending || !form.name.trim()}
              onClick={() => update.mutate()}
              data-testid="button-save-recipient"
            >
              {update.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Product-grouped board rows shaped by GET /api/enquiry-board:
// every active enquiry not yet in a deal, split Import (buy) / Export (sell).
interface BoardGroup {
  product: string;
  imports: TradeEnquiry[];
  exports: TradeEnquiry[];
}

const STAGE_BADGE: Record<string, { label: string; className: string }> = {
  matched: { label: "Matched", className: "bg-sky-500 text-white" },
  documents_issued: { label: "Documents Issued", className: "bg-indigo-500 text-white" },
  recaps_issued: { label: "Recaps Issued", className: "bg-violet-500 text-white" },
  tfr_pending: { label: "TFR Pending Approval", className: "bg-amber-500 text-white" },
  trade_formed: { label: "Trade Formed", className: "bg-emerald-600 text-white" },
};

const fmtQty = (e: TradeEnquiry) =>
  e.quantity ? `${e.quantity} ${e.unit || "MT"}` : "—";
const fmtPrice = (e: TradeEnquiry) =>
  e.price ? `${e.currency || "USD"} ${e.price}` : "—";

function EnquiryCard({
  enq,
  side,
  selected,
  onSelect,
  selectable,
  candidateCount = 0,
}: {
  enq: TradeEnquiry;
  side: "import" | "export";
  selected: boolean;
  onSelect: () => void;
  selectable: boolean;
  candidateCount?: number;
}) {
  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={onSelect}
      data-testid={`board-enquiry-${enq.enquiryRef}`}
      className={`w-full text-left rounded-md border p-3 transition-colors ${
        selected
          ? "border-primary ring-1 ring-primary bg-primary/5"
          : "border-border hover-elevate"
      } ${selectable ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant={side === "import" ? "default" : "secondary"}
          className="text-[10px] px-1.5 py-0"
        >
          {side === "import" ? "IMPORT · BUY" : "EXPORT · SELL"}
        </Badge>
        <span className="font-mono text-xs font-semibold">{enq.enquiryRef}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
          {enq.status}
        </Badge>
        {candidateCount > 0 && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0"
            data-testid={`badge-in-candidates-${enq.enquiryRef}`}
          >
            <Scale className="w-2.5 h-2.5 mr-1" />
            In {candidateCount} candidate TFR{candidateCount > 1 ? "s" : ""} · still available
          </Badge>
        )}
        {selected && <CheckCircle2 className="w-3.5 h-3.5 text-primary ml-auto" />}
      </div>
      <div className="mt-1.5 text-xs">
        {fmtQty(enq)} · {fmtPrice(enq)}
        {enq.incoterms ? ` · ${enq.incoterms}` : ""}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {(enq.origin || enq.loadingPort || "—")} → {(enq.dischargePort || "—")}
      </div>
      <div className="text-[11px] text-muted-foreground truncate">
        {side === "import"
          ? enq.buyerName ? `Buyer: ${enq.buyerName}` : null
          : enq.sellerName ? `Seller: ${enq.sellerName}` : null}
      </div>
    </button>
  );
}

export default function DealPipeline() {
  const { toast } = useToast();
  const [, nav] = useLocation();
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const { data: board, isLoading: loadingBoard } = useQuery<BoardGroup[]>({
    queryKey: ["/api/enquiry-board"],
  });
  const { data: deals, isLoading: loadingDeals } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
    enabled: isAdmin,
  });
  const { data: candidates, isLoading: loadingCandidates } = useQuery<TfrCandidate[]>({
    queryKey: ["/api/tfr-candidates"],
    enabled: isAdmin,
  });
  const activeCandidates = (candidates || []).filter((c) => c.status === "active");
  // How many active candidate TFRs each enquiry appears in — shown on the board
  // so admins know a prepared TFR does NOT lock the enquiry.
  const candidateCountByRef = new Map<string, number>();
  for (const c of activeCandidates) {
    for (const ref of [c.importEnquiryRef, c.exportEnquiryRef]) {
      candidateCountByRef.set(ref, (candidateCountByRef.get(ref) || 0) + 1);
    }
  }

  // One selected pair at a time. Normally constrained to a single product
  // group; in manual-match mode an admin may pair across product groups.
  const [manual, setManual] = useState(false);
  // Which DealVault product block is open (shows that product's enquiries).
  // Always validated against the live board — if a refetch removes the product
  // (e.g. its enquiries went into a deal), the derived openGroup goes null and
  // no stale panel is rendered.
  const [openProduct, setOpenProduct] = useState<string | null>(null);
  const openGroup = openProduct ? (board || []).find((g) => g.product === openProduct) ?? null : null;
  const [editingTfrDeal, setEditingTfrDeal] = useState<Deal | null>(null);
  const [editingTfrContent, setEditingTfrContent] = useState<TfrContentTarget | null>(null);
  const [editingTfrCandidate, setEditingTfrCandidate] = useState<TfrCandidate | null>(null);
  const [sel, setSel] = useState<{ product: string; importRef?: string; exportRef?: string }>({ product: "" });

  const toggle = (product: string, side: "import" | "export", ref: string) => {
    setSel((prev) => {
      const base = manual || prev.product === product ? { ...prev } : { product };
      const key = side === "import" ? "importRef" : "exportRef";
      return { ...base, product, [key]: (base as any)[key] === ref ? undefined : ref };
    });
  };

  const toggleManual = (on: boolean) => {
    setManual(on);
    setSel({ product: "" }); // clear selection when switching modes
  };

  const formDeal = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/deals", {
        importEnquiryRef: sel.importRef,
        exportEnquiryRef: sel.exportRef,
        manual,
      }),
    onSuccess: () => {
      setSel({ product: "" });
      invalidateCandidateViews();
      toast({
        title: "Deal formed — TFR prepared",
        description:
          "The document cascade ran: LOI + SCO, both Deal Recaps, and a consolidated TFR now awaiting approval.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Could not form deal", description: e?.message || "Error", variant: "destructive" }),
  });

  const invalidateCandidateViews = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/tfr-candidates"] });
    queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/enquiry-board"] });
    queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
  };

  const prepareCandidate = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/tfr-candidates", {
        importEnquiryRef: sel.importRef,
        exportEnquiryRef: sel.exportRef,
        manual,
      }),
    onSuccess: () => {
      setSel({ product: "" });
      invalidateCandidateViews();
      toast({
        title: "Candidate TFR prepared",
        description:
          "No deal was formed — compare it below with other combinations, then create the deal from the best one.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Could not prepare TFR", description: e?.message || "Error", variant: "destructive" }),
  });

  const cancelCandidate = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/tfr-candidates/${id}/cancel`),
    onSuccess: () => {
      invalidateCandidateViews();
      toast({ title: "Candidate TFR cancelled", description: "Its draft TFR document was removed." });
    },
    onError: (e: any) =>
      toast({ title: "Could not cancel TFR", description: e?.message || "Error", variant: "destructive" }),
  });

  const createDealFromCandidate = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/tfr-candidates/${id}/create-deal`),
    onSuccess: () => {
      invalidateCandidateViews();
      toast({
        title: "Deal formed from candidate",
        description:
          "The document cascade ran (LOI + SCO, Deal Recaps, final TFR). Competing candidates for these enquiries were cancelled.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Could not create deal", description: e?.message || "Error", variant: "destructive" }),
  });

  const cancelDealTfr = useMutation({
    mutationFn: async (dealId: string) => apiRequest("POST", `/api/deals/${dealId}/cancel-tfr`),
    onSuccess: () => {
      invalidateCandidateViews();
      toast({
        title: "TFR cancelled — deal dissolved",
        description: "The TFR and its cascade documents were removed; both enquiries are back on the board.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Could not cancel TFR", description: e?.message || "Error", variant: "destructive" }),
  });

  const approveTfr = useMutation({
    mutationFn: async (dealId: string) => {
      const res = await apiRequest("POST", `/api/deals/${dealId}/approve-tfr`);
      return res.json() as Promise<{ createdTradeRef?: string }>;
    },
    onSuccess: (deal) => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      toast({
        title: "TFR approved & registered on chain",
        description: "The trade has been formed in Pre-Deal with its blockchain record ready for stage advancement.",
      });
      // Take the admin straight to the Deal Desk with the new trade highlighted.
      if (deal?.createdTradeRef) {
        sessionStorage.setItem("highlightTradeRef", deal.createdTradeRef);
        nav("/trading");
      }
    },
    onError: (e: any) =>
      toast({ title: "Could not approve TFR", description: e?.message || "Error", variant: "destructive" }),
  });

  const revokeTfrApproval = useMutation({
    mutationFn: async (dealId: string) => apiRequest("POST", `/api/deals/${dealId}/revoke-tfr-approval`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({
        title: "TFR approval revoked",
        description: "The trade was removed and the TFR is back to pending — it can be edited, re-approved, or cancelled.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Could not revoke approval", description: e?.message || "Error", variant: "destructive" }),
  });

  const resumeCascade = useMutation({
    mutationFn: async (dealId: string) => apiRequest("POST", `/api/deals/${dealId}/resume-cascade`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Cascade resumed", description: "Missing documents were regenerated." });
    },
    onError: (e: any) =>
      toast({ title: "Could not resume cascade", description: e?.message || "Error", variant: "destructive" }),
  });

  const pairReady = !!sel.importRef && !!sel.exportRef;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary flex items-center justify-center">
            <Workflow className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight" data-testid="text-deal-pipeline-title">
              Deal Pipeline
            </h1>
            <p className="text-xs text-muted-foreground">
              Product-wise Import / Export transactions — match a pair to form a deal and prepare the TFR.
            </p>
          </div>
        </div>

        {/* Product-wise Import / Export board */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm flex items-center gap-2" data-testid="text-dealvault-title">
                <GitMerge className="w-4 h-4" /> DealVault — Product-wise Import &amp; Export Transactions
              </CardTitle>
              {isAdmin && (
                <div className="ml-auto flex items-center gap-2">
                  <label htmlFor="manual-match" className="text-xs text-muted-foreground cursor-pointer">
                    Manual match (across products)
                  </label>
                  <Switch
                    id="manual-match"
                    checked={manual}
                    onCheckedChange={toggleManual}
                    data-testid="switch-manual-match"
                  />
                </div>
              )}
            </div>
            {isAdmin && manual && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Manual mode: pick any Import and any Export — the same-commodity rule is overridden and the pair
                is matched exactly as you select it.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {loadingBoard ? (
              <div className="space-y-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
            ) : !board || board.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="text-board-empty">
                No active enquiries available for matching.
              </p>
            ) : (
              <>
                {/* DealVault: one product block per commodity, DocuVault-style.
                    Every enquiry for that product (import + export) is filed
                    inside its block; click a block to open it and pair. */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {board.map((g) => {
                    const product = productImageFor(g.product);
                    const isOpen = openProduct === g.product;
                    return (
                      <button
                        key={g.product}
                        type="button"
                        onClick={() => setOpenProduct(isOpen ? null : g.product)}
                        className={`aspect-square rounded-none border bg-card hover:border-primary hover:shadow-md transition-all flex flex-col overflow-hidden text-left group ${
                          isOpen ? "border-primary ring-1 ring-primary" : "border-border"
                        }`}
                        data-testid={`dealvault-block-${g.product}`}
                      >
                        <div className="relative w-full flex-1 min-h-0 overflow-hidden">
                          <img
                            src={product.img}
                            alt={g.product}
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                          {g.imports.length > 0 && g.exports.length > 0 && (
                            <span className="absolute top-1.5 left-1.5 bg-emerald-600 text-white text-[9px] uppercase tracking-wider px-1.5 py-0.5">
                              Match available
                            </span>
                          )}
                          <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 flex items-center gap-1">
                            <FolderOpen className="w-3 h-3" />
                            {g.imports.length + g.exports.length}
                          </span>
                        </div>
                        <div className="w-full p-2.5 border-t border-border bg-card">
                          <div className="text-sm font-bold truncate" title={g.product}>
                            {g.product}
                          </div>
                          <div className="text-[10px] text-muted-foreground/70 truncate">
                            {g.imports.length} import · {g.exports.length} export
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!openGroup && (
                  <p className="text-[11px] text-muted-foreground">
                    Open a product block to see all its enquiries and pair an Import with an Export.
                  </p>
                )}
                {openGroup &&
                  board
                    .filter((g) => (manual ? true : g.product === openGroup.product))
                    .map((g) => {
                const isSelGroup = sel.product === g.product;
                return (
                  <div key={g.product} className="rounded-lg border border-border p-4 space-y-3" data-testid={`board-group-${g.product}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold">{g.product}</h3>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {g.imports.length} import · {g.exports.length} export
                      </Badge>
                      {g.imports.length > 0 && g.exports.length > 0 && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500 text-white">
                          Match available
                        </Badge>
                      )}
                      {isAdmin && isSelGroup && pairReady && (
                        <div className="ml-auto flex items-center gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={prepareCandidate.isPending || formDeal.isPending}
                            onClick={() => prepareCandidate.mutate()}
                            data-testid="button-prepare-candidate-tfr"
                          >
                            <Scale className="w-3.5 h-3.5 mr-1.5" />
                            {prepareCandidate.isPending ? "Preparing…" : "Prepare TFR (compare)"}
                          </Button>
                          <Button
                            size="sm"
                            disabled={formDeal.isPending || prepareCandidate.isPending}
                            onClick={() => formDeal.mutate()}
                            data-testid="button-form-deal"
                          >
                            <FileCheck2 className="w-3.5 h-3.5 mr-1.5" />
                            {formDeal.isPending ? "Preparing TFR…" : "Form Deal & Prepare TFR"}
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <ArrowDownToLine className="w-3.5 h-3.5" /> Import (Buy)
                        </div>
                        {g.imports.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">No import enquiries.</p>
                        ) : (
                          g.imports.map((e) => (
                            <EnquiryCard
                              key={e.id}
                              enq={e}
                              side="import"
                              selectable={isAdmin}
                              selected={(manual || isSelGroup) && sel.importRef === e.enquiryRef}
                              onSelect={() => toggle(g.product, "import", e.enquiryRef)}
                              candidateCount={candidateCountByRef.get(e.enquiryRef) || 0}
                            />
                          ))
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <ArrowUpFromLine className="w-3.5 h-3.5" /> Export (Sell)
                        </div>
                        {g.exports.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">No export enquiries.</p>
                        ) : (
                          g.exports.map((e) => (
                            <EnquiryCard
                              key={e.id}
                              enq={e}
                              side="export"
                              selectable={isAdmin}
                              selected={(manual || isSelGroup) && sel.exportRef === e.enquiryRef}
                              onSelect={() => toggle(g.product, "export", e.enquiryRef)}
                              candidateCount={candidateCountByRef.get(e.enquiryRef) || 0}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              </>
            )}
          </CardContent>
        </Card>

        {/* Generated TFRs — every generated TFR (candidate + deal-backed) in one place */}
        {isAdmin && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2" data-testid="text-tfr-header">
                <FileCheck2 className="w-4 h-4" /> Generated TFRs
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">
                All generated Trade Formation Requests. Cancelling a TFR frees its enquiries so they can be
                re-matched on the board above in a different combination.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {!loadingCandidates && activeCandidates.length === 0 && !loadingDeals && (!deals || deals.length === 0) && (
                <p className="text-sm text-muted-foreground" data-testid="text-tfrs-empty">
                  No TFRs generated yet. Select an import/export pair above and prepare a candidate TFR or
                  form a deal.
                </p>
              )}

              {activeCandidates.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Scale className="w-4 h-4" /> Candidate TFRs — Compare Combinations
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Prepared for comparison only; no deal exists yet and the enquiries remain available.
                      Create the deal from the best combination — competing candidates are cancelled
                      automatically — or cancel the ones you don't want.
                    </p>
                  </div>
              {activeCandidates.map((c) => (
                <div key={c.id} className="rounded-md border border-border p-3 space-y-2" data-testid={`candidate-row-${c.candidateRef}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold">{c.candidateRef}</span>
                    <span className="text-xs">{c.commodity}</span>
                    {c.manualMatch && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">Manual match</Badge>
                    )}
                    {c.grossProfit && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-emerald-600 text-white" data-testid={`candidate-profit-${c.candidateRef}`}>
                        Gross profit: {c.grossProfit}
                      </Badge>
                    )}
                    {Object.values(c.manualDetails || {}).some((v) => v && v.trim()) && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                        data-testid={`candidate-details-${c.candidateRef}`}
                      >
                        <Pencil className="w-2.5 h-2.5 mr-1" />
                        {c.manualDetails?.addressedToName?.trim()
                          ? `Details added · ${c.manualDetails.addressedToName.trim()}`
                          : "Details added"}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    Import: {c.importEnquiryRef} · Export: {c.exportEnquiryRef}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {c.tfrDocId && (
                      <Button size="sm" variant="outline" asChild data-testid={`button-candidate-docx-${c.candidateRef}`}>
                        <a href={`/api/documents/${c.tfrDocId}/download/docx`} target="_blank" rel="noreferrer">
                          <Download className="w-3.5 h-3.5 mr-1.5" /> TFR DOCX (editable)
                        </a>
                      </Button>
                    )}
                    {c.tfrDocId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingTfrCandidate(c)}
                        data-testid={`button-candidate-edit-tfr-${c.candidateRef}`}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit TFR Details
                      </Button>
                    )}
                    {c.tfrDocId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditingTfrContent({
                            refLabel: c.candidateRef,
                            endpoint: `/api/tfr-candidates/${c.id}/content`,
                            docId: c.tfrDocId!,
                          })
                        }
                        data-testid={`button-candidate-edit-full-tfr-${c.candidateRef}`}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit Full TFR
                      </Button>
                    )}
                    <Button
                      size="sm"
                      disabled={createDealFromCandidate.isPending || cancelCandidate.isPending}
                      onClick={() => createDealFromCandidate.mutate(c.id)}
                      data-testid={`button-candidate-create-deal-${c.candidateRef}`}
                    >
                      <FileCheck2 className="w-3.5 h-3.5 mr-1.5" /> Create Deal from this TFR
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      disabled={cancelCandidate.isPending || createDealFromCandidate.isPending}
                      onClick={() => cancelCandidate.mutate(c.id)}
                      data-testid={`button-candidate-cancel-${c.candidateRef}`}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1.5" /> Cancel TFR
                    </Button>
                  </div>
                </div>
              ))}
                </div>
              )}

              {(loadingDeals || (deals && deals.length > 0)) && (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <FileCheck2 className="w-4 h-4" /> Deal TFRs — Formed Deals &amp; Status
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      A deal exists behind each of these TFRs. "Cancel TFR &amp; Dissolve Deal" removes the
                      TFR and its cascade documents and puts both enquiries back on the board.
                    </p>
                  </div>
              {loadingDeals ? (
                <Skeleton className="h-20" />
              ) : (
                (deals || []).map((d) => {
                  const stage = STAGE_BADGE[d.stage || "matched"] || STAGE_BADGE.matched;
                  return (
                    <div key={d.id} className="rounded-md border border-border p-3 space-y-2" data-testid={`deal-row-${d.dealRef}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold">{d.dealRef}</span>
                        <span className="text-xs">{d.commodity}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 ${stage.className}`}>{stage.label}</Badge>
                        {d.cascadeError && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 border-destructive text-destructive">
                            <AlertTriangle className="w-3 h-3" /> Cascade error
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        Import: {d.importEnquiryRef} · Export: {d.exportEnquiryRef}
                        {d.tradeRef ? ` · Trade: ${d.tradeRef}` : ""}
                      </div>
                      {d.tfrManualDetails?.addressedToName && (
                        <div className="text-[11px] text-muted-foreground">
                          Addressed to: {d.tfrManualDetails.addressedToName}
                        </div>
                      )}
                      {d.tfrApprovedAt && (
                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400" data-testid={`text-tfr-approved-${d.dealRef}`}>
                          Digitally approved by {d.tfrApprovedBy || "Admin"} on {new Date(d.tfrApprovedAt).toLocaleString()}
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        {d.tfrDocId && !d.tfrApprovedAt && (
                          <Button size="sm" variant="outline" asChild data-testid={`button-tfr-docx-${d.dealRef}`}>
                            <a href={`/api/documents/${d.tfrDocId}/download/docx`} target="_blank" rel="noreferrer">
                              <Download className="w-3.5 h-3.5 mr-1.5" /> TFR DOCX (editable)
                            </a>
                          </Button>
                        )}
                        {d.tfrDocId && d.tfrApprovedAt && (
                          <Button size="sm" variant="outline" asChild data-testid={`button-tfr-pdf-${d.dealRef}`}>
                            <a href={`/api/documents/${d.tfrDocId}/download/pdf`} target="_blank" rel="noreferrer">
                              <Download className="w-3.5 h-3.5 mr-1.5" /> TFR PDF (approved)
                            </a>
                          </Button>
                        )}
                        {d.stage === "tfr_pending" && d.tfrDocId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingTfrDeal(d)}
                            data-testid={`button-edit-tfr-${d.dealRef}`}
                          >
                            <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit TFR Details
                          </Button>
                        )}
                        {d.stage === "tfr_pending" && d.tfrDocId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEditingTfrContent({
                                refLabel: d.dealRef,
                                endpoint: `/api/deals/${d.id}/tfr-content`,
                                docId: d.tfrDocId!,
                              })
                            }
                            data-testid={`button-edit-full-tfr-${d.dealRef}`}
                          >
                            <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit Full TFR
                          </Button>
                        )}
                        {d.stage === "tfr_pending" && (
                          <Button
                            size="sm"
                            disabled={approveTfr.isPending}
                            onClick={() => approveTfr.mutate(d.id)}
                            data-testid={`button-approve-tfr-${d.dealRef}`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Approve TFR &amp; Form Trade
                          </Button>
                        )}
                        {/* Older deals (approved before approval stamping existed) have a
                            tradeRef but no tfrApprovedAt — the trade itself is what revoke
                            undoes, so key on the trade, not the stamp. */}
                        {d.stage === "trade_formed" && d.tradeRef && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            disabled={revokeTfrApproval.isPending}
                            onClick={() => {
                              if (window.confirm(
                                `Revoke the digital approval of ${d.dealRef}'s TFR?\n\nTrade ${d.tradeRef} will be removed from the Deal Desk (and its blockchain block deleted) and the TFR returns to pending. Only possible while nothing has been built on the trade yet.`,
                              )) {
                                revokeTfrApproval.mutate(d.id);
                              }
                            }}
                            data-testid={`button-revoke-tfr-${d.dealRef}`}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1.5" /> Revoke Approval
                          </Button>
                        )}
                        {d.cascadeError && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={resumeCascade.isPending}
                            onClick={() => resumeCascade.mutate(d.id)}
                            data-testid={`button-resume-${d.dealRef}`}
                          >
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Resume Cascade
                          </Button>
                        )}
                        {d.stage !== "trade_formed" && !d.tradeRef && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            disabled={cancelDealTfr.isPending || approveTfr.isPending}
                            onClick={() => cancelDealTfr.mutate(d.id)}
                            data-testid={`button-cancel-tfr-${d.dealRef}`}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1.5" /> Cancel TFR &amp; Dissolve Deal
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Saved TFR recipient directory — admin maintenance */}
        {isAdmin && <SavedRecipientsCard />}
      </div>
      {editingTfrContent && (
        <TfrContentDialog
          target={editingTfrContent}
          open
          onClose={() => setEditingTfrContent(null)}
        />
      )}
      {editingTfrDeal && (
        <TfrDetailsDialog
          key={editingTfrDeal.id}
          target={{
            refLabel: editingTfrDeal.dealRef,
            endpoint: `/api/deals/${editingTfrDeal.id}/tfr-details`,
            initialDetails: editingTfrDeal.tfrManualDetails,
          }}
          open
          onClose={() => setEditingTfrDeal(null)}
        />
      )}
      {editingTfrCandidate && (
        <TfrDetailsDialog
          key={editingTfrCandidate.id}
          target={{
            refLabel: editingTfrCandidate.candidateRef,
            endpoint: `/api/tfr-candidates/${editingTfrCandidate.id}/details`,
            initialDetails: editingTfrCandidate.manualDetails,
          }}
          open
          onClose={() => setEditingTfrCandidate(null)}
        />
      )}
    </div>
  );
}
