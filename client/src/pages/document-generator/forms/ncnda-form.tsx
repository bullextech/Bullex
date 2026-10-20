import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
Select,
SelectContent,
SelectGroup,
SelectItem,
SelectLabel,
SelectTrigger,
SelectValue,
} from "@/components/ui/select";

import {
Accordion,
AccordionContent,
AccordionItem,
AccordionTrigger,
} from "@/components/ui/accordion";
import {
Eye,X,Building2,FileSignature,ClipboardList
} from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function NcndaForm() {
  const {
    selectedType,
    title,
    setTitle,
    buyerName,
    setBuyerName,
    buyerAddress,
    setBuyerAddress,
    buyerContact,
    setBuyerContact,
    sellerName,
    setSellerName,
    sellerAddress,
    setSellerAddress,
    sellerContact,
    setSellerContact,
    commodity,
    setCommodity,
    validity,
    setValidity,
    recapValidity,
    setRecapValidity,
    governingLaw,
    setGoverningLaw,
    reviewContent,
    approvedClients,
    teamMembers,
    fillFromKyc,
    fillFromTeamMember,
    resetForm,
    previewDoc,
    handleReview,
  } = useDocGen();

  return (
    <>
          {selectedType && !reviewContent && selectedType.value === "NCNDA" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedType.description}</p>
              <div className="space-y-2">
                <Label>Document Title *</Label>
                <Input placeholder="Enter NCNDA document title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-doc-title" />
              </div>

              <Accordion type="multiple" defaultValue={["parties","terms","signatory"]} className="w-full">

                <AccordionItem value="parties" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Parties</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="border rounded-md overflow-hidden">
                        <div className="text-xs font-semibold p-2 bg-muted/60 border-b">Party A (Disclosing)</div>
                        <div className="p-2 space-y-2">
                          {(approvedClients.length > 0 || teamMembers.length > 0) && (
                            <Select onValueChange={(val) => {
                              if (val.startsWith("kyc:")) { const kyc = approvedClients.find(k => k.id === val.slice(4)); if (kyc) fillFromKyc(kyc, "seller"); }
                              else if (val.startsWith("tm:")) { const tm = teamMembers.find(m => m.id === val.slice(3)); if (tm) fillFromTeamMember(tm, "seller"); }
                            }}>
                              <SelectTrigger className="h-7 text-xs" data-testid="select-partya-kyc-trigger"><SelectValue placeholder="Auto-fill from KYC / Team..." /></SelectTrigger>
                              <SelectContent>
                                {approvedClients.length > 0 && (
                                  <SelectGroup>
                                    <SelectLabel>KYC Clients</SelectLabel>
                                    {approvedClients.map((k) => (<SelectItem key={k.id} value={`kyc:${k.id}`}>{k.companyName}</SelectItem>))}
                                  </SelectGroup>
                                )}
                                {teamMembers.length > 0 && (
                                  <SelectGroup>
                                    <SelectLabel>Team Members</SelectLabel>
                                    {teamMembers.map((m) => (<SelectItem key={m.id} value={`tm:${m.id}`}>{m.name}{m.position ? ` — ${m.position}` : ""}</SelectItem>))}
                                  </SelectGroup>
                                )}
                              </SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs" placeholder="Party A company name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} data-testid="input-partya-name" />
                          <Input className="h-8 text-xs" placeholder="Registered address" value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} data-testid="input-partya-address" />
                          <Input className="h-8 text-xs" placeholder="Authorised signatory name & title" value={sellerContact} onChange={(e) => setSellerContact(e.target.value)} data-testid="input-partya-contact" />
                        </div>
                      </div>
                      <div className="border rounded-md overflow-hidden">
                        <div className="text-xs font-semibold p-2 bg-muted/60 border-b">Party B (Recipient)</div>
                        <div className="p-2 space-y-2">
                          {(approvedClients.length > 0 || teamMembers.length > 0) && (
                            <Select onValueChange={(val) => {
                              if (val.startsWith("kyc:")) { const kyc = approvedClients.find(k => k.id === val.slice(4)); if (kyc) fillFromKyc(kyc, "buyer"); }
                              else if (val.startsWith("tm:")) { const tm = teamMembers.find(m => m.id === val.slice(3)); if (tm) fillFromTeamMember(tm, "buyer"); }
                            }}>
                              <SelectTrigger className="h-7 text-xs" data-testid="select-partyb-kyc-trigger"><SelectValue placeholder="Auto-fill from KYC / Team..." /></SelectTrigger>
                              <SelectContent>
                                {approvedClients.length > 0 && (
                                  <SelectGroup>
                                    <SelectLabel>KYC Clients</SelectLabel>
                                    {approvedClients.map((k) => (<SelectItem key={k.id} value={`kyc:${k.id}`}>{k.companyName}</SelectItem>))}
                                  </SelectGroup>
                                )}
                                {teamMembers.length > 0 && (
                                  <SelectGroup>
                                    <SelectLabel>Team Members</SelectLabel>
                                    {teamMembers.map((m) => (<SelectItem key={m.id} value={`tm:${m.id}`}>{m.name}{m.position ? ` — ${m.position}` : ""}</SelectItem>))}
                                  </SelectGroup>
                                )}
                              </SelectContent>
                            </Select>
                          )}
                          <Input className="h-8 text-xs" placeholder="Party B company name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} data-testid="input-partyb-name" />
                          <Input className="h-8 text-xs" placeholder="Registered address" value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} data-testid="input-partyb-address" />
                          <Input className="h-8 text-xs" placeholder="Authorised signatory name & title" value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} data-testid="input-partyb-contact" />
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="terms" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Agreement Terms</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[140px_1fr] text-xs bg-muted/60 font-semibold border-b">
                        <div className="p-2 border-r">Item</div><div className="p-2">Details</div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Effective Date</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder={`e.g. ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`} value={validity} onChange={(e) => setValidity(e.target.value)} data-testid="input-effective-date" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Proposed Transaction</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. Sale and Purchase of Iron Ore, Copper Cathode" value={commodity} onChange={(e) => setCommodity(e.target.value)} data-testid="input-proposed-transaction" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] border-b">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Governing Law</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. UAE (DIFC), English Law, Singapore" value={governingLaw} onChange={(e) => setGoverningLaw(e.target.value)} data-testid="input-governing-law" /></div>
                      </div>
                      <div className="grid grid-cols-[140px_1fr]">
                        <div className="p-2 border-r text-xs font-medium text-muted-foreground flex items-center">Jurisdiction (Courts)</div>
                        <div className="p-1"><Input className="h-8 text-xs border-0 shadow-none focus-visible:ring-0" placeholder="e.g. DIFC Courts, Dubai; Courts of England and Wales" value={recapValidity} onChange={(e) => setRecapValidity(e.target.value)} data-testid="input-jurisdiction" /></div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="signatory" className="border rounded-md mb-2">
                  <AccordionTrigger className="text-xs font-bold uppercase tracking-wider py-2 px-3 hover:no-underline bg-muted/50 rounded-t-md">
                    <span className="flex items-center gap-1.5"><FileSignature className="w-3.5 h-3.5" /> Execution</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="p-3 bg-muted/30 rounded-md text-xs text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground">Dual Signatory Block</p>
                      <p>The document will include a signature block for both Party A and Party B with name, title, date, and signature lines.</p>
                      <p className="mt-2">Term: <span className="font-medium text-foreground">1 year from Effective Date</span> (auto-included)</p>
                      <p>Confidentiality survival: <span className="font-medium text-foreground">1 year post-termination</span> (auto-included)</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

              </Accordion>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={resetForm} data-testid="button-cancel-generate">
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Cancel
                </Button>
                <Button onClick={handleReview} disabled={previewDoc.isPending} data-testid="button-review-doc">
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  {previewDoc.isPending ? "Loading Preview..." : "Review NCNDA"}
                </Button>
              </div>
            </div>
          )}
    </>
  );
}
