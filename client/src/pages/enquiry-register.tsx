import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, Send } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const COMMODITIES = [
  "Iron Ore", "Bauxite", "Manganese Ore",
  "Copper Cathode", "Copper Concentrate", "Aluminium Ingots",
  "Gasoil 10ppm", "Gasoil 50ppm", "LHC", "HSFO", "HSGO",
  "Petcoke – Anode Grade", "Petcoke – Fuel Grade",
  "NPK", "Other",
];
const INCOTERMS = ["FOB", "CIF", "CFR", "FCA", "EXW", "DAP", "DDP"];

export default function EnquiryRegister() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [form, setForm] = useState({
    side: "buy", product: "", productOther: "", specifications: "", producer: "",
    quantity: "", unit: "MT", loadingPort: "", incoterms: "", validity: "",
    additionalInfo: "", createdBy: "", email: "",
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = useMutation({
    mutationFn: async () => {
      const product = form.product === "Other" ? form.productOther.trim() : form.product;
      const res = await apiRequest("POST", "/api/public/trade-enquiries", { ...form, product });
      return res.json();
    },
    onSuccess: (data: any) => {
      setSubmitted(data?.enquiryRef || "submitted");
      toast({ title: "Enquiry Submitted", description: `Reference: ${data?.enquiryRef || ""}. Our trade desk will contact you shortly.` });
    },
    onError: (e: any) => toast({ title: "Submission Failed", description: e?.message || "Please try again.", variant: "destructive" }),
  });

  const canSubmit = (form.product === "Other" ? form.productOther.trim() : form.product) && form.email.trim() && form.createdBy.trim();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-background px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary flex items-center justify-center">
            <Send className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">BULLEX TRADING PLATFORM</h1>
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">Trade Enquiry Submission</p>
          </div>
        </div>
      </header>

      <main className="flex-1 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          {submitted ? (
            <Card data-testid="card-enquiry-success">
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto mb-4" />
                <h2 className="text-xl font-bold mb-2">Enquiry Received</h2>
                <p className="text-sm text-muted-foreground mb-1">Your enquiry has been submitted to the Bullex trade desk.</p>
                {submitted !== "submitted" && (
                  <p className="text-sm">Reference: <span className="font-mono font-semibold" data-testid="text-enquiry-ref">{submitted}</span></p>
                )}
                <p className="text-xs text-muted-foreground mt-4">A confirmation has been sent to <strong>{form.email}</strong>. Our team will be in touch shortly.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Submit Trade Enquiry</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Share your commodity requirements with the Bullex trade desk. We will revert with a quotation.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" onClick={() => set("side")("buy")}
                    className={form.side === "buy" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                    variant={form.side === "buy" ? "default" : "outline"} data-testid="button-side-buy">I want to BUY</Button>
                  <Button type="button" onClick={() => set("side")("sell")}
                    className={form.side === "sell" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
                    variant={form.side === "sell" ? "default" : "outline"} data-testid="button-side-sell">I want to SELL</Button>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Commodity *</Label>
                    <Select value={form.product} onValueChange={set("product")}>
                      <SelectTrigger className="h-9 mt-1" data-testid="select-product"><SelectValue placeholder="Select commodity" /></SelectTrigger>
                      <SelectContent>{COMMODITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {form.product === "Other" && (
                    <div>
                      <Label className="text-xs">Specify Commodity *</Label>
                      <Input className="h-9 mt-1" value={form.productOther} onChange={(e) => set("productOther")(e.target.value)} data-testid="input-product-other" />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">Quantity</Label>
                    <div className="flex gap-1 mt-1">
                      <Input className="h-9 flex-1" placeholder="e.g. 50,000" value={form.quantity} onChange={(e) => set("quantity")(e.target.value)} data-testid="input-quantity" />
                      <Select value={form.unit} onValueChange={set("unit")}>
                        <SelectTrigger className="h-9 w-20" data-testid="select-unit"><SelectValue /></SelectTrigger>
                        <SelectContent>{["MT", "KG", "BBL", "TON"].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Loading Port / Origin</Label>
                    <Input className="h-9 mt-1" placeholder="e.g. Kamsar, Guinea" value={form.loadingPort} onChange={(e) => set("loadingPort")(e.target.value)} data-testid="input-loading-port" />
                  </div>
                  <div>
                    <Label className="text-xs">Incoterms</Label>
                    <Select value={form.incoterms} onValueChange={set("incoterms")}>
                      <SelectTrigger className="h-9 mt-1" data-testid="select-incoterms"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{INCOTERMS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Validity</Label>
                    <Input className="h-9 mt-1" placeholder="e.g. 7 days" value={form.validity} onChange={(e) => set("validity")(e.target.value)} data-testid="input-validity" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Producer / Refinery (if known)</Label>
                    <Input className="h-9 mt-1" placeholder="e.g. Mining Corp Ltd" value={form.producer} onChange={(e) => set("producer")(e.target.value)} data-testid="input-producer" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Specifications</Label>
                    <Textarea className="mt-1" rows={2} placeholder="Quality / grade / packing details" value={form.specifications} onChange={(e) => set("specifications")(e.target.value)} data-testid="input-specifications" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Additional Information</Label>
                    <Textarea className="mt-1" rows={2} placeholder="Any other notes" value={form.additionalInfo} onChange={(e) => set("additionalInfo")(e.target.value)} data-testid="input-additional-info" />
                  </div>
                </div>

                <div className="border-t pt-4 grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Your Name / Company *</Label>
                    <Input className="h-9 mt-1" value={form.createdBy} onChange={(e) => set("createdBy")(e.target.value)} data-testid="input-created-by" />
                  </div>
                  <div>
                    <Label className="text-xs">Email *</Label>
                    <Input type="email" className="h-9 mt-1" value={form.email} onChange={(e) => set("email")(e.target.value)} data-testid="input-email" />
                  </div>
                </div>

                <Button onClick={() => submit.mutate()} disabled={!canSubmit || submit.isPending} className="w-full" data-testid="button-submit-enquiry">
                  {submit.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  {submit.isPending ? "Submitting…" : "Submit Enquiry"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <footer className="border-t border-border bg-muted/30 px-4 py-2 text-center">
        <p className="text-[10px] text-muted-foreground font-bold">Bullex is a proprietary platform of Bullfrog Group.</p>
      </footer>
    </div>
  );
}
