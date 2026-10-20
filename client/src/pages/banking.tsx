import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Landmark, ExternalLink, Plus, Pencil, Trash2, Building2, Search, LayoutDashboard, CreditCard } from "lucide-react";
import { TradeBankFrame } from "@/components/trade-bank-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCompanyBankAccountSchema, type CompanyBankAccount, type InsertCompanyBankAccount } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { sortClientDetails } from "@shared/client-sorting";

const emptyValues: InsertCompanyBankAccount = {
  companyName: "", bankName: "", branch: "", bankAddress: "", accountName: "",
  accountNumber: "", iban: "", swiftCode: "", currency: "", correspondentBank: "",
  correspondentSwift: "", notes: "",
};

function BankAccountDialog({
  open, onOpenChange, editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CompanyBankAccount | null;
}) {
  const { toast } = useToast();
  const form = useForm<InsertCompanyBankAccount>({
    resolver: zodResolver(insertCompanyBankAccountSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      editing
        ? {
            companyName: editing.companyName, bankName: editing.bankName,
            branch: editing.branch ?? "", bankAddress: editing.bankAddress ?? "",
            accountName: editing.accountName ?? "", accountNumber: editing.accountNumber ?? "",
            iban: editing.iban ?? "", swiftCode: editing.swiftCode ?? "",
            currency: editing.currency ?? "", correspondentBank: editing.correspondentBank ?? "",
            correspondentSwift: editing.correspondentSwift ?? "", notes: editing.notes ?? "",
          }
        : emptyValues,
    );
  }, [open, editing, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: InsertCompanyBankAccount) => {
      if (editing) {
        return apiRequest("PATCH", `/api/bank-accounts/${editing.id}`, data);
      }
      return apiRequest("POST", "/api/bank-accounts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      toast({ title: editing ? "Bank account updated" : "Bank account added" });
      onOpenChange(false);
      form.reset(emptyValues);
    },
    onError: (e: Error) => toast({ title: "Failed to save bank account", description: e.message, variant: "destructive" }),
  });

  const fields: { name: keyof InsertCompanyBankAccount; label: string; placeholder?: string }[] = [
    { name: "companyName", label: "Company Name *", placeholder: "Counterparty company" },
    { name: "bankName", label: "Bank Name *" },
    { name: "branch", label: "Branch" },
    { name: "accountName", label: "Account Name" },
    { name: "accountNumber", label: "Account Number" },
    { name: "iban", label: "IBAN" },
    { name: "swiftCode", label: "SWIFT / BIC" },
    { name: "currency", label: "Currency", placeholder: "e.g. USD, AED, EUR" },
    { name: "correspondentBank", label: "Correspondent Bank" },
    { name: "correspondentSwift", label: "Correspondent SWIFT" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-bank-dialog-title">
            {editing ? "Edit Bank Account" : "Add Bank Account"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.map((f) => (
                <FormField
                  key={f.name}
                  control={form.control}
                  name={f.name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{f.label}</FormLabel>
                      <FormControl>
                        <Input {...field} value={(field.value as string) ?? ""} placeholder={f.placeholder} data-testid={`input-bank-${f.name}`} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <FormField
              control={form.control}
              name="bankAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Bank Address</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} data-testid="input-bank-bankAddress" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} rows={2} data-testid="input-bank-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-bank-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} data-testid="button-bank-save">
                {saveMutation.isPending ? "Saving…" : editing ? "Save Changes" : "Add Account"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function BankAccountsPanel() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyBankAccount | null>(null);
  const [deleting, setDeleting] = useState<CompanyBankAccount | null>(null);

  const { data: accounts = [], isLoading } = useQuery<CompanyBankAccount[]>({
    queryKey: ["/api/bank-accounts"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/bank-accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      toast({ title: "Bank account deleted" });
      setDeleting(null);
    },
    onError: (e: Error) => toast({ title: "Failed to delete", description: e.message, variant: "destructive" }),
  });

  const q = search.trim().toLowerCase();
  const filtered = sortClientDetails(q
    ? accounts.filter((a) =>
        [a.companyName, a.bankName, a.accountName, a.accountNumber, a.iban, a.swiftCode, a.currency]
          .some((v) => v?.toLowerCase().includes(q)))
    : accounts);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company, bank, IBAN, SWIFT…"
              className="pl-9"
              data-testid="input-bank-search"
            />
          </div>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }} data-testid="button-add-bank-account">
            <Plus className="w-4 h-4 mr-1.5" /> Add Bank Account
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-md" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded-md py-16 text-center" data-testid="text-bank-empty">
            <Building2 className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">{q ? "No matching bank accounts" : "No bank accounts yet"}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {q ? "Try a different search." : "Add the bank account details of companies you are dealing with."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((a) => (
              <div key={a.id} className="border border-border rounded-md bg-card p-4" data-testid={`card-bank-account-${a.id}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate" data-testid={`text-bank-company-${a.id}`}>{a.companyName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {a.bankName}{a.branch ? ` · ${a.branch}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {a.currency && (
                      <Badge variant="outline" className="text-[10px] font-bold uppercase">{a.currency}</Badge>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(a); setDialogOpen(true); }} data-testid={`button-edit-bank-${a.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(a)} data-testid={`button-delete-bank-${a.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {[
                    ["Account Name", a.accountName],
                    ["Account No.", a.accountNumber],
                    ["IBAN", a.iban],
                    ["SWIFT / BIC", a.swiftCode],
                    ["Correspondent", a.correspondentBank],
                    ["Corr. SWIFT", a.correspondentSwift],
                    ["Bank Address", a.bankAddress],
                  ].filter(([, v]) => v).map(([label, v]) => (
                    <div key={label as string} className="min-w-0">
                      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
                      <dd className="font-mono truncate">{v}</dd>
                    </div>
                  ))}
                </dl>
                {a.notes && <p className="text-xs text-muted-foreground mt-2 border-t border-border pt-2">{a.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <BankAccountDialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }} editing={editing} />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bank account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the bank account details for {deleting?.companyName} ({deleting?.bankName}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-bank">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              data-testid="button-confirm-delete-bank"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Banking() {
  const [tab, setTab] = useState<"dashboard" | "accounts">("dashboard");

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="page-banking">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-background px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Landmark className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight truncate" data-testid="text-banking-title">
              Banking &amp; LC
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              Live trade-finance overview powered by Bullex Trade Bank
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setTab("dashboard")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${tab === "dashboard" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
              data-testid="tab-banking-dashboard"
            >
              <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
            </button>
            <button
              onClick={() => setTab("accounts")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${tab === "accounts" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
              data-testid="tab-banking-accounts"
            >
              <CreditCard className="w-3.5 h-3.5" /> Bank Accounts
            </button>
          </div>
          <Link
            href="/trade-bank"
            data-testid="link-open-trade-bank"
            className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-xs font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Full Trade Bank
          </Link>
        </div>
      </header>
      <div className={`flex-1 min-h-0 ${tab === "dashboard" ? "bg-white" : ""}`}>
        {tab === "dashboard" ? (
          <TradeBankFrame className="w-full h-full border-0" />
        ) : (
          <BankAccountsPanel />
        )}
      </div>
    </div>
  );
}
