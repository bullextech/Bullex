import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Coins, TrendingUp, Ship, Wallet, ArrowRight, Calculator, ShieldCheck,
  Layers, Banknote, CheckCircle2, Clock, XCircle,
} from "lucide-react";

const COMMODITIES = [
  "Iron Ore", "Bauxite", "Manganese Ore", "Copper Cathode", "Copper Concentrate",
  "Aluminium Ingots", "Gasoil 10ppm", "Gasoil 50ppm", "LHC", "HSFO", "HSGO",
  "Petcoke – Anode Grade", "Petcoke – Fuel Grade", "NPK",
];

type PublicBlock = {
  id: string;
  blockRef: string;
  commodity: string;
  quantityMt: number;
  pricePerMt: number;
  profitPerMt: number;
  shipmentValue: number;
  tokensIssued: number;
  totalProfit: number;
  totalValue: number;
  tokenValue: number;
  origin: string | null;
  destination: string | null;
  status: string;
  fundedTokens: number;
  fundedAmount: number;
  remainingTokens: number;
  fundedPct: number;
  investorCount: number;
};

type TrackedInvestment = {
  investmentRef: string;
  blockRef: string;
  commodity: string;
  amount: number;
  tokens: number;
  status: string;
  tokenValue: number;
  blockStatus: string | null;
  projectedPayout: number;
  payoutAmount: number | null;
  reimbursedAt: string | null;
  createdAt: string;
};

type AdminInvestment = {
  id: string;
  investmentRef: string;
  blockId: string;
  blockRef: string;
  commodity: string;
  investorName: string;
  investorEmail: string;
  investorPhone: string | null;
  amount: number;
  tokens: number;
  status: string;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  payoutAmount: number | null;
  reimbursedAt: string | null;
  createdAt: string;
};

const usd = (n: number) =>
  "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const usd2 = (n: number) =>
  "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tokens = (n: number) => (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    open: { label: "Open", className: "bg-emerald-600 text-white" },
    funding: { label: "Funding", className: "bg-[#0084be] text-white" },
    funded: { label: "Fully Funded", className: "bg-primary text-primary-foreground" },
    shipped: { label: "Shipped", className: "bg-amber-600 text-white" },
    completed: { label: "Completed", className: "bg-slate-700 text-white" },
    cancelled: { label: "Cancelled", className: "bg-destructive text-destructive-foreground" },
    pending: { label: "Pending", className: "bg-amber-500 text-white" },
    confirmed: { label: "Confirmed", className: "bg-[#0084be] text-white" },
    reimbursed: { label: "Reimbursed", className: "bg-emerald-600 text-white" },
  };
  const s = map[status] || { label: status, className: "bg-muted text-foreground" };
  return <Badge className={s.className}>{s.label}</Badge>;
}

// ---- Interactive calculator -------------------------------------------------
function TokenCalculator() {
  const [quantity, setQuantity] = useState(50000);
  const [price, setPrice] = useState(100);
  const [profit, setProfit] = useState(10);

  const shipmentValue = quantity * price;
  const tokensIssued = shipmentValue;
  const totalProfit = quantity * profit;
  const totalValue = shipmentValue + totalProfit;
  const tokenValue = tokensIssued > 0 ? totalValue / tokensIssued : 0;
  const roi = shipmentValue > 0 ? (totalProfit / shipmentValue) * 100 : 0;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calculator className="h-5 w-5 text-primary" />
          Tokenization Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-8">
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="calc-qty">Quantity (metric tonnes)</Label>
            <Input
              id="calc-qty" type="number" min={0} value={quantity}
              onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))}
              data-testid="input-calc-quantity"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="calc-price">Price per tonne (USD)</Label>
            <Input
              id="calc-price" type="number" min={0} value={price}
              onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
              data-testid="input-calc-price"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="calc-profit">Profit per tonne (USD)</Label>
            <Input
              id="calc-profit" type="number" min={0} value={profit}
              onChange={(e) => setProfit(Math.max(0, Number(e.target.value)))}
              data-testid="input-calc-profit"
            />
          </div>
        </div>
        <div className="space-y-3">
          <CalcRow label="Shipment value" value={usd(shipmentValue)} testid="text-calc-shipment-value" />
          <CalcRow label="Bull tokens issued" value={tokens(tokensIssued)} hint="1 token = USD 1 at issue" testid="text-calc-tokens" />
          <CalcRow label="Projected profit" value={usd(totalProfit)} testid="text-calc-profit" />
          <Separator />
          <CalcRow label="Total value at completion" value={usd(totalValue)} testid="text-calc-total-value" />
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Token value at payout</p>
              <p className="text-3xl font-bold text-primary" data-testid="text-calc-token-value">{usd2(tokenValue)}</p>
            </div>
            <Badge className="bg-emerald-600 text-white text-sm" data-testid="text-calc-roi">
              {roi.toFixed(1)}% return
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CalcRow({ label, value, hint, testid }: { label: string; value: string; hint?: string; testid?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div>
        <p className="text-sm text-foreground">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <p className="text-lg font-semibold tabular-nums" data-testid={testid}>{value}</p>
    </div>
  );
}

// ---- Invest dialog ----------------------------------------------------------
const investFormSchema = z.object({
  investorName: z.string().min(2, "Name is required"),
  investorEmail: z.string().email("Valid email required"),
  investorPhone: z.string().optional(),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  bankName: z.string().min(2, "Bank name is required"),
  bankAccountName: z.string().min(2, "Account holder is required"),
  bankAccountNumber: z.string().min(4, "Account number is required"),
});
type InvestForm = z.infer<typeof investFormSchema>;

function InvestDialog({ block }: { block: PublicBlock }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const form = useForm<InvestForm>({
    resolver: zodResolver(investFormSchema),
    defaultValues: {
      investorName: "", investorEmail: "", investorPhone: "",
      amount: Math.min(10000, block.remainingTokens),
      bankName: "", bankAccountName: "", bankAccountNumber: "",
    },
  });
  const amount = form.watch("amount");
  const projectedPayout = (Number(amount) || 0) * block.tokenValue;

  const mutation = useMutation({
    mutationFn: async (values: InvestForm) =>
      apiRequest("POST", "/api/investments", { ...values, blockId: block.id }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/shipment-blocks"] });
      toast({
        title: "Investment submitted",
        description: `Reference ${data.investmentRef}. Save your lookup token: ${data.lookupToken} — you will need it to track this investment.`,
        duration: 12000,
      });
      setOpen(false);
      form.reset();
    },
    onError: (err: any) => {
      toast({ title: "Could not submit investment", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" data-testid={`button-invest-${block.id}`}>
          <Wallet className="h-4 w-4 mr-2" /> Invest in this block
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invest in {block.blockRef}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          {block.commodity} · {usd(block.remainingTokens)} of tokens still available · 1 token = USD 1
        </p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField control={form.control} name="amount" render={({ field }) => (
              <FormItem>
                <FormLabel>Investment amount (USD)</FormLabel>
                <FormControl><Input type="number" min={1} {...field} data-testid="input-invest-amount" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="rounded-md bg-muted/50 p-3 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">Projected payout at completion</span>
              <span className="font-semibold" data-testid="text-invest-projected">{usd2(projectedPayout)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="investorName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl><Input {...field} data-testid="input-invest-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="investorEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" {...field} data-testid="input-invest-email" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="investorPhone" render={({ field }) => (
              <FormItem>
                <FormLabel>Phone (optional)</FormLabel>
                <FormControl><Input {...field} data-testid="input-invest-phone" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Separator />
            <p className="text-sm font-medium flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" /> Funding bank account
            </p>
            <FormField control={form.control} name="bankName" render={({ field }) => (
              <FormItem>
                <FormLabel>Bank name</FormLabel>
                <FormControl><Input {...field} data-testid="input-invest-bank-name" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="bankAccountName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Account holder</FormLabel>
                  <FormControl><Input {...field} data-testid="input-invest-account-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="bankAccountNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Account number</FormLabel>
                  <FormControl><Input {...field} data-testid="input-invest-account-number" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-invest">
                {mutation.isPending ? "Submitting…" : "Submit investment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Block card -------------------------------------------------------------
function BlockCard({ block }: { block: PublicBlock }) {
  const investable = block.status === "open" || block.status === "funding";
  return (
    <Card className="flex flex-col" data-testid={`card-block-${block.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="font-mono text-xs">{block.blockRef}</Badge>
          {statusBadge(block.status)}
        </div>
        <CardTitle className="text-lg flex items-center gap-2 pt-1">
          <Ship className="h-5 w-5 text-primary" /> {block.commodity}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {tokens(block.quantityMt)} mt
          {block.origin ? ` · ${block.origin}` : ""}
          {block.destination ? ` → ${block.destination}` : ""}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 gap-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Stat label="Shipment value" value={usd(block.shipmentValue)} />
          <Stat label="Tokens issued" value={tokens(block.tokensIssued)} />
          <Stat label="Token value" value={usd2(block.tokenValue)} highlight />
          <Stat label="Investors" value={String(block.investorCount)} />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{usd(block.fundedAmount)} funded</span>
            <span>{usd(block.remainingTokens)} left</span>
          </div>
          <Progress value={block.fundedPct} data-testid={`progress-block-${block.id}`} />
        </div>
        <div className="mt-auto pt-1">
          {investable ? (
            <InvestDialog block={block} />
          ) : (
            <Button className="w-full" variant="secondary" disabled>Not open for funding</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-semibold tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

// ---- Investment tracker -----------------------------------------------------
// Possession-based: requires the unguessable 32-hex lookupToken issued to the
// investor at submission. The sequential investmentRef is NOT used as a lookup
// key because it is predictable; the token is the only accepted credential.
function InvestmentTracker() {
  const [token, setToken] = useState("");
  const [activeToken, setActiveToken] = useState<string | null>(null);

  const { data, isFetching, error } = useQuery<TrackedInvestment>({
    queryKey: ["/api/investments/lookup", activeToken],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/investments/lookup?token=${encodeURIComponent(activeToken!)}`,
      );
      return res.json();
    },
    enabled: !!activeToken,
    retry: false,
  });

  const canSubmit = token.trim().length >= 16;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wallet className="h-5 w-5 text-primary" /> Track your investment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-[1fr_auto] gap-2">
          <Input
            placeholder="Lookup token (issued at submission)" value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) setActiveToken(token.trim()); }}
            data-testid="input-track-token"
          />
          <Button onClick={() => setActiveToken(token.trim())} disabled={!canSubmit} data-testid="button-track-lookup">
            Track
          </Button>
        </div>
        {isFetching && <p className="text-sm text-muted-foreground">Looking up…</p>}
        {activeToken && !isFetching && error && (
          <p className="text-sm text-muted-foreground" data-testid="text-track-notfound">
            No investment matches that token.
          </p>
        )}
        {data && !error && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-4" data-testid="row-tracked-investment">
            <div>
              <p className="font-medium">{data.commodity} <span className="font-mono text-xs text-muted-foreground">{data.blockRef}</span></p>
              <p className="text-xs text-muted-foreground">
                {data.investmentRef} · {tokens(data.tokens)} tokens · invested {usd(data.amount)} · token value {usd2(data.tokenValue)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{data.status === "reimbursed" ? "Paid out" : "Projected payout"}</p>
                <p className="font-semibold">{usd2(data.payoutAmount ?? data.projectedPayout)}</p>
              </div>
              {statusBadge(data.status)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Admin: create block ----------------------------------------------------
const blockFormSchema = z.object({
  commodity: z.string().min(1, "Select a commodity"),
  quantityMt: z.coerce.number().positive("Quantity must be positive"),
  pricePerMt: z.coerce.number().positive("Price must be positive"),
  profitPerMt: z.coerce.number().min(0, "Profit cannot be negative"),
  origin: z.string().optional(),
  destination: z.string().optional(),
});
type BlockForm = z.infer<typeof blockFormSchema>;

function AdminPanel() {
  const { toast } = useToast();
  const form = useForm<BlockForm>({
    resolver: zodResolver(blockFormSchema),
    defaultValues: { commodity: "", quantityMt: 50000, pricePerMt: 100, profitPerMt: 10, origin: "", destination: "" },
  });

  const createBlock = useMutation({
    mutationFn: async (values: BlockForm) => apiRequest("POST", "/api/shipment-blocks", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shipment-blocks"] });
      toast({ title: "Shipment block created" });
      form.reset({ commodity: "", quantityMt: 50000, pricePerMt: 100, profitPerMt: 10, origin: "", destination: "" });
    },
    onError: (err: any) => toast({ title: "Could not create block", description: err?.message, variant: "destructive" }),
  });

  const { data: investments } = useQuery<AdminInvestment[]>({ queryKey: ["/api/investments"] });
  const { data: blocks } = useQuery<PublicBlock[]>({ queryKey: ["/api/shipment-blocks"] });

  const updateInvestment = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => apiRequest("PATCH", `/api/investments/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shipment-blocks"] });
      toast({ title: "Investment updated" });
    },
    onError: (err: any) => toast({ title: "Update failed", description: err?.message, variant: "destructive" }),
  });

  const updateBlock = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => apiRequest("PATCH", `/api/shipment-blocks/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shipment-blocks"] });
      toast({ title: "Block status updated" });
    },
    onError: (err: any) => toast({ title: "Update failed", description: err?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold">Desk administration</h2>
        <Badge variant="outline">Admin / team</Badge>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Create a shipment block</CardTitle></CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => createBlock.mutate(v))} className="grid md:grid-cols-3 gap-4">
              <FormField control={form.control} name="commodity" render={({ field }) => (
                <FormItem className="md:col-span-3">
                  <FormLabel>Commodity</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-block-commodity"><SelectValue placeholder="Select commodity" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COMMODITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="quantityMt" render={({ field }) => (
                <FormItem><FormLabel>Quantity (mt)</FormLabel><FormControl><Input type="number" {...field} data-testid="input-block-quantity" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="pricePerMt" render={({ field }) => (
                <FormItem><FormLabel>Price / mt (USD)</FormLabel><FormControl><Input type="number" {...field} data-testid="input-block-price" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="profitPerMt" render={({ field }) => (
                <FormItem><FormLabel>Profit / mt (USD)</FormLabel><FormControl><Input type="number" {...field} data-testid="input-block-profit" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="origin" render={({ field }) => (
                <FormItem><FormLabel>Origin (optional)</FormLabel><FormControl><Input {...field} data-testid="input-block-origin" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="destination" render={({ field }) => (
                <FormItem><FormLabel>Destination (optional)</FormLabel><FormControl><Input {...field} data-testid="input-block-destination" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex items-end">
                <Button type="submit" disabled={createBlock.isPending} data-testid="button-create-block">
                  {createBlock.isPending ? "Creating…" : "Create block"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Manage blocks</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(blocks?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No blocks yet.</p>}
          {blocks?.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3" data-testid={`row-admin-block-${b.id}`}>
              <div>
                <p className="font-medium">{b.commodity} <span className="font-mono text-xs text-muted-foreground">{b.blockRef}</span></p>
                <p className="text-xs text-muted-foreground">{usd(b.fundedAmount)} / {usd(b.tokensIssued)} funded · token value {usd2(b.tokenValue)}</p>
              </div>
              <div className="flex items-center gap-2">
                {statusBadge(b.status)}
                <Select value={b.status} onValueChange={(status) => updateBlock.mutate({ id: b.id, status })}>
                  <SelectTrigger className="w-[150px]" data-testid={`select-block-status-${b.id}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["open", "funding", "funded", "shipped", "completed", "cancelled"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Investments</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(investments?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No investments yet.</p>}
          {investments?.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3" data-testid={`row-admin-investment-${inv.id}`}>
              <div>
                <p className="font-medium">{inv.investorName} <span className="font-mono text-xs text-muted-foreground">{inv.investmentRef}</span></p>
                <p className="text-xs text-muted-foreground">
                  {inv.commodity} {inv.blockRef} · {usd(inv.amount)} ({tokens(inv.tokens)} tokens)
                </p>
                <p className="text-xs text-muted-foreground">
                  {inv.investorEmail}{inv.bankName ? ` · ${inv.bankName}` : ""}{inv.bankAccountNumber ? ` · acct ${inv.bankAccountNumber}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {statusBadge(inv.status)}
                {inv.status === "pending" && (
                  <Button size="sm" onClick={() => updateInvestment.mutate({ id: inv.id, status: "confirmed" })} data-testid={`button-confirm-${inv.id}`}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Confirm
                  </Button>
                )}
                {inv.status === "confirmed" && (
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => updateInvestment.mutate({ id: inv.id, status: "reimbursed" })} data-testid={`button-reimburse-${inv.id}`}>
                    <Banknote className="h-4 w-4 mr-1" /> Reimburse
                  </Button>
                )}
                {inv.status !== "cancelled" && inv.status !== "reimbursed" && (
                  <Button size="sm" variant="ghost" onClick={() => updateInvestment.mutate({ id: inv.id, status: "cancelled" })} data-testid={`button-cancel-${inv.id}`}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Page -------------------------------------------------------------------
export default function TokenizationModel() {
  const { authenticated, role } = useAuth();
  const isAdmin = authenticated && role === "admin";
  const { data: blocks, isLoading } = useQuery<PublicBlock[]>({ queryKey: ["/api/shipment-blocks"] });

  const openBlocks = useMemo(
    () => (blocks || []).filter((b) => b.status !== "cancelled"),
    [blocks],
  );

  return (
    <div className="overflow-y-auto h-full">
      {/* Hero */}
      <div className="bg-primary text-primary-foreground py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <Badge variant="secondary" className="text-[10px] uppercase tracking-widest bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 mb-4">
            Tokenization Model
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight" data-testid="text-tokenization-title">
            Invest in shipments, redeem in tokens
          </h1>
          <p className="text-lg text-primary-foreground/85 max-w-3xl">
            Every Bullex shipment is tokenized at its at-cost value — one Bull token equals USD 1 at issue.
            Investors fund shipment blocks from their bank account and are reimbursed in tokens once the
            shipment completes, sharing in the trade profit as the token value appreciates.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12 space-y-14">
        {/* How it works — worked example */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">How the model works</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            <FlowStep n={1} icon={<Ship className="h-5 w-5" />} title="Shipment valued" body="A 50,000 mt Copper shipment at $100/mt is worth $5,000,000 at cost." />
            <FlowStep n={2} icon={<Coins className="h-5 w-5" />} title="Tokens issued" body="5,000,000 Bull tokens are minted — 1 token = USD 1 of shipment value." />
            <FlowStep n={3} icon={<TrendingUp className="h-5 w-5" />} title="Profit accrues" body="At $10/mt profit the block earns $500,000, lifting total value to $5,500,000." />
            <FlowStep n={4} icon={<Wallet className="h-5 w-5" />} title="Redeemed" body="Token value becomes $5.5M ÷ 5M = $1.10. Investors are paid tokens × token value." />
          </div>
          <p className="text-sm text-muted-foreground">
            The worked example uses round numbers. Use the calculator below to model any shipment.
          </p>
        </section>

        {/* Calculator */}
        <section><TokenCalculator /></section>

        {/* Available blocks */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Ship className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">Open shipment blocks</h2>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading shipment blocks…</p>
          ) : openBlocks.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground" data-testid="text-no-blocks">
              No shipment blocks are open right now. Check back soon.
            </CardContent></Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {openBlocks.map((b) => <BlockCard key={b.id} block={b} />)}
            </div>
          )}
        </section>

        {/* Portfolio */}
        <section><InvestmentTracker /></section>

        {/* Admin */}
        {isAdmin && <section><AdminPanel /></section>}

        <p className="text-center text-xs text-muted-foreground pt-4">
          Bullex is a proprietary platform of Bullfrog Group.
        </p>
      </div>
    </div>
  );
}

function FlowStep({ n, icon, title, body }: { n: number; icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card className="relative">
      <CardContent className="pt-6 space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">{n}</span>
          {icon}
        </div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
