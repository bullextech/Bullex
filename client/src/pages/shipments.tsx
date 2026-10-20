import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Ship, Plus, Search, Pencil, Trash2, Anchor, MapPin, Package,
  CalendarClock, ExternalLink, Radio, Navigation,
} from "lucide-react";
import { SHIPMENT_STATUSES, type Shipment, type InsertShipment } from "@shared/schema";

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  loading: "Loading",
  in_transit: "In Transit",
  discharging: "Discharging",
  delivered: "Delivered",
  delayed: "Delayed",
  cancelled: "Cancelled",
};

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  loading: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  in_transit: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  discharging: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  delayed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

type FormState = {
  vesselName: string;
  imoNumber: string;
  mmsi: string;
  tradeRef: string;
  commodity: string;
  quantity: string;
  unit: string;
  loadingPort: string;
  dischargePort: string;
  status: string;
  etd: string;
  eta: string;
  ata: string;
  lastLat: string;
  lastLng: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  vesselName: "", imoNumber: "", mmsi: "", tradeRef: "", commodity: "",
  quantity: "", unit: "MT", loadingPort: "", dischargePort: "",
  status: "scheduled", etd: "", eta: "", ata: "", lastLat: "", lastLng: "", notes: "",
};

function trackingUrl(s: Shipment): string {
  const term = s.imoNumber?.trim() || s.mmsi?.trim() || s.vesselName;
  return `https://www.vesselfinder.com/vessels?name=${encodeURIComponent(term)}`;
}

export default function Shipments() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Shipment | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Shipment | null>(null);

  const { data: shipments = [], isLoading } = useQuery<Shipment[]>({
    queryKey: ["/api/shipments"],
  });

  const { data: aisStatus } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/shipments/ais-status"],
  });
  const aisEnabled = aisStatus?.enabled ?? false;

  const set = (k: keyof FormState, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (s: Shipment) => {
    setEditing(s);
    setForm({
      vesselName: s.vesselName ?? "",
      imoNumber: s.imoNumber ?? "",
      mmsi: s.mmsi ?? "",
      tradeRef: s.tradeRef ?? "",
      commodity: s.commodity ?? "",
      quantity: s.quantity != null ? String(s.quantity) : "",
      unit: s.unit ?? "MT",
      loadingPort: s.loadingPort ?? "",
      dischargePort: s.dischargePort ?? "",
      status: s.status ?? "scheduled",
      etd: s.etd ?? "",
      eta: s.eta ?? "",
      ata: s.ata ?? "",
      lastLat: s.lastLat != null ? String(s.lastLat) : "",
      lastLng: s.lastLng != null ? String(s.lastLng) : "",
      notes: s.notes ?? "",
    });
    setDialogOpen(true);
  };

  const buildPayload = (): Partial<InsertShipment> => ({
    vesselName: form.vesselName.trim(),
    imoNumber: form.imoNumber.trim() || null,
    mmsi: form.mmsi.trim() || null,
    tradeRef: form.tradeRef.trim() || null,
    commodity: form.commodity.trim() || null,
    quantity: form.quantity.trim() ? Number(form.quantity) : null,
    unit: form.unit.trim() || "MT",
    loadingPort: form.loadingPort.trim() || null,
    dischargePort: form.dischargePort.trim() || null,
    status: form.status as InsertShipment["status"],
    etd: form.etd.trim() || null,
    eta: form.eta.trim() || null,
    ata: form.ata.trim() || null,
    lastLat: form.lastLat.trim() ? Number(form.lastLat) : null,
    lastLng: form.lastLng.trim() ? Number(form.lastLng) : null,
    notes: form.notes.trim() || null,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (editing) {
        await apiRequest("PATCH", `/api/shipments/${editing.id}`, payload);
      } else {
        await apiRequest("POST", "/api/shipments", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shipments"] });
      toast({ title: editing ? "Shipment updated" : "Shipment added" });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/shipments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shipments"] });
      toast({ title: "Shipment deleted" });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message, variant: "destructive" }),
  });

  const submit = () => {
    if (!form.vesselName.trim()) {
      toast({ title: "Vessel name is required", variant: "destructive" });
      return;
    }
    const lat = form.lastLat.trim(), lng = form.lastLng.trim();
    if ((lat && !lng) || (!lat && lng)) {
      toast({ title: "Enter both latitude and longitude, or neither", variant: "destructive" });
      return;
    }
    if (lat && (isNaN(Number(lat)) || Math.abs(Number(lat)) > 90)) {
      toast({ title: "Latitude must be between -90 and 90", variant: "destructive" });
      return;
    }
    if (lng && (isNaN(Number(lng)) || Math.abs(Number(lng)) > 180)) {
      toast({ title: "Longitude must be between -180 and 180", variant: "destructive" });
      return;
    }
    if (form.quantity.trim() && (isNaN(Number(form.quantity)) || Number(form.quantity) <= 0)) {
      toast({ title: "Quantity must be a positive number", variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  };

  const q = search.trim().toLowerCase();
  const filtered = shipments.filter(s => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (!q) return true;
    return [s.vesselName, s.imoNumber, s.mmsi, s.tradeRef, s.commodity, s.loadingPort, s.dischargePort]
      .filter(Boolean)
      .some(v => v!.toLowerCase().includes(q));
  });

  const active = shipments.filter(s => !["delivered", "cancelled"].includes(s.status)).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-shipments-title">
              <Ship className="w-6 h-6 text-primary" /> Shipments
            </h1>
            <p className="text-sm text-muted-foreground">
              Vessel &amp; cargo tracking — {active} active shipment{active === 1 ? "" : "s"}
            </p>
          </div>
          <Button onClick={openCreate} data-testid="button-add-shipment">
            <Plus className="w-4 h-4 mr-1.5" /> Add Shipment
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search vessel, IMO, trade ref, port…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-shipments"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44" data-testid="select-status-filter">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {SHIPMENT_STATUSES.map(s => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground" data-testid="text-ais-notice">
          <Radio className={`w-4 h-4 flex-shrink-0 mt-0.5 ${aisEnabled ? "text-emerald-600 dark:text-emerald-400" : ""}`} />
          <span>
            {aisEnabled ? (
              <>Live AIS tracking is <span className="font-medium text-emerald-700 dark:text-emerald-400">active</span> — positions
              of active shipments with an MMSI number update automatically from the satellite feed.
              Positions can still be entered manually for vessels without an MMSI.</>
            ) : (
              <>Positions are updated manually by the team. Live AIS satellite tracking can be connected
              later via a marine data provider — vessel records already carry IMO/MMSI identifiers, so
              no data changes will be needed. Use the “Track” link on a card for a live map lookup.</>
            )}
          </span>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm" data-testid="text-shipments-loading">Loading shipments…</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground" data-testid="text-shipments-empty">
              <Ship className="w-10 h-10 mx-auto mb-3 opacity-40" />
              {shipments.length === 0 ? "No shipments yet. Add your first vessel to start tracking." : "No shipments match your filters."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(s => (
              <Card key={s.id} data-testid={`card-shipment-${s.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate flex items-center gap-1.5" data-testid={`text-shipment-vessel-${s.id}`}>
                        <Anchor className="w-4 h-4 text-primary flex-shrink-0" />
                        {s.vesselName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.imoNumber ? `IMO ${s.imoNumber}` : s.mmsi ? `MMSI ${s.mmsi}` : "No identifier"}
                        {s.tradeRef ? ` · ${s.tradeRef}` : ""}
                      </p>
                    </div>
                    <Badge className={`flex-shrink-0 border-transparent ${STATUS_STYLES[s.status] ?? ""}`} data-testid={`badge-shipment-status-${s.id}`}>
                      {STATUS_LABELS[s.status] ?? s.status}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-sm">
                    {(s.loadingPort || s.dischargePort) && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{s.loadingPort || "—"} → {s.dischargePort || "—"}</span>
                      </p>
                    )}
                    {s.commodity && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Package className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">
                          {s.commodity}{s.quantity != null ? ` — ${s.quantity.toLocaleString()} ${s.unit ?? "MT"}` : ""}
                        </span>
                      </p>
                    )}
                    {(s.etd || s.eta || s.ata) && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <CalendarClock className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate text-xs">
                          {s.etd ? `ETD ${s.etd}` : ""}{s.etd && (s.eta || s.ata) ? " · " : ""}
                          {s.ata ? `ATA ${s.ata}` : s.eta ? `ETA ${s.eta}` : ""}
                        </span>
                      </p>
                    )}
                    {s.lastLat != null && s.lastLng != null && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Navigation className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="text-xs">
                          {s.lastLat.toFixed(3)}, {s.lastLng.toFixed(3)}
                          {s.lastPositionAt ? ` (as of ${new Date(s.lastPositionAt).toLocaleString()})` : ""}
                        </span>
                        {s.positionSource === "ais" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-400 text-emerald-700 dark:text-emerald-400" data-testid={`badge-shipment-ais-${s.id}`}>
                            Live AIS
                          </Badge>
                        )}
                      </p>
                    )}
                    {s.notes && <p className="text-xs text-muted-foreground line-clamp-2">{s.notes}</p>}
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <Button asChild variant="outline" size="sm" data-testid={`link-shipment-track-${s.id}`}>
                      <a href={trackingUrl(s)} target="_blank" rel="noreferrer">
                        <ExternalLink className="w-3.5 h-3.5 mr-1" /> Track
                      </a>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)} data-testid={`button-edit-shipment-${s.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(s)} data-testid={`button-delete-shipment-${s.id}`}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Shipment" : "Add Shipment"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Vessel Name *</Label>
              <Input value={form.vesselName} onChange={e => set("vesselName", e.target.value)} placeholder="MV Ocean Pioneer" data-testid="input-vessel-name" />
            </div>
            <div className="space-y-1.5">
              <Label>IMO Number</Label>
              <Input value={form.imoNumber} onChange={e => set("imoNumber", e.target.value)} placeholder="9876543" data-testid="input-imo" />
            </div>
            <div className="space-y-1.5">
              <Label>MMSI</Label>
              <Input value={form.mmsi} onChange={e => set("mmsi", e.target.value)} placeholder="235098765" data-testid="input-mmsi" />
            </div>
            <div className="space-y-1.5">
              <Label>Trade Reference</Label>
              <Input value={form.tradeRef} onChange={e => set("tradeRef", e.target.value)} placeholder="BFG-2026-0001" data-testid="input-trade-ref" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger data-testid="select-shipment-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIPMENT_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Commodity</Label>
              <Input value={form.commodity} onChange={e => set("commodity", e.target.value)} placeholder="Iron Ore" data-testid="input-commodity" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input value={form.quantity} onChange={e => set("quantity", e.target.value)} placeholder="55000" data-testid="input-quantity" />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input value={form.unit} onChange={e => set("unit", e.target.value)} placeholder="MT" data-testid="input-unit" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Loading Port</Label>
              <Input value={form.loadingPort} onChange={e => set("loadingPort", e.target.value)} placeholder="Port Hedland" data-testid="input-loading-port" />
            </div>
            <div className="space-y-1.5">
              <Label>Discharge Port</Label>
              <Input value={form.dischargePort} onChange={e => set("dischargePort", e.target.value)} placeholder="Jebel Ali" data-testid="input-discharge-port" />
            </div>
            <div className="space-y-1.5">
              <Label>ETD (departure)</Label>
              <Input type="date" value={form.etd} onChange={e => set("etd", e.target.value)} data-testid="input-etd" />
            </div>
            <div className="space-y-1.5">
              <Label>ETA (estimated arrival)</Label>
              <Input type="date" value={form.eta} onChange={e => set("eta", e.target.value)} data-testid="input-eta" />
            </div>
            <div className="space-y-1.5">
              <Label>ATA (actual arrival)</Label>
              <Input type="date" value={form.ata} onChange={e => set("ata", e.target.value)} data-testid="input-ata" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Last Latitude</Label>
                <Input value={form.lastLat} onChange={e => set("lastLat", e.target.value)} placeholder="25.276" data-testid="input-lat" />
              </div>
              <div className="space-y-1.5">
                <Label>Last Longitude</Label>
                <Input value={form.lastLng} onChange={e => set("lastLng", e.target.value)} placeholder="55.296" data-testid="input-lng" />
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3} placeholder="Charter details, agent contacts, delays…" data-testid="input-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-shipment">Cancel</Button>
            <Button onClick={submit} disabled={saveMutation.isPending} data-testid="button-save-shipment">
              {saveMutation.isPending ? "Saving…" : editing ? "Save Changes" : "Add Shipment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete shipment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the tracking record for “{deleteTarget?.vesselName}”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
