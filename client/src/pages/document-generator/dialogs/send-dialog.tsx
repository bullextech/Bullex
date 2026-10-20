import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Send } from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function SendDialog() {
  const {
    sendDocId,
    setSendDocId,
    attachDocIds,
    setAttachDocIds,
    sendEmail,
    setSendEmail,
    sendClientId,
    setSendClientId,
    sendCcEmail,
    setSendCcEmail,
    sendMessage,
    setSendMessage,
    sendClients,
    toggleAttachDoc,
    attachableChildren,
    attachLabel,
    sendDoc,
    docs,
    proformaInvoiceRecipient,
  } = useDocGen();

  return (
    <Dialog open={!!sendDocId} onOpenChange={(open) => { if (!open) { setSendDocId(null); setSendEmail(""); setSendClientId(""); setSendCcEmail(""); setSendMessage(""); setAttachDocIds([]); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-send-dialog-title">
              <Send className="w-5 h-5 text-primary" />
              {docs?.find(d => d.id === sendDocId)?.docType === "NCNDA"
                ? "Send NCNDA to Party B"
                : docs?.find(d => d.id === sendDocId)?.docType === "PI"
                  ? `Send Proforma Invoice to ${proformaInvoiceRecipient(docs.find(d => d.id === sendDocId)!).label}`
                  : "Send Document to Client"}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const sendingDoc = docs?.find(d => d.id === sendDocId);
            const isNcndaSend = sendingDoc?.docType === "NCNDA";
            const isPiSend = sendingDoc?.docType === "PI";
            const piRecipient = sendingDoc
              ? proformaInvoiceRecipient(sendingDoc)
              : { label: "Supplier", labelLower: "supplier", email: "", side: "buy" as const };
            const piRecipientEmail = piRecipient.email.trim().toLowerCase();
            const selectableClients = isPiSend
              ? sendClients.filter((client) =>
                  [client.contactEmail, client.signatoryEmail]
                    .some((email) => (email || "").trim().toLowerCase() === piRecipientEmail))
              : sendClients;
            return (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {isNcndaSend
                    ? "Send the signed NCNDA to Party B (Receiving Party) for review and countersignature. An email with the PDF attached will be sent to the recipient, with a copy to the issuing party."
                    : isPiSend
                      ? `Send the seller-issued Proforma Invoice to the approved ${piRecipient.labelLower} recorded on the ${piRecipient.side === "sell" ? "Export" : "Import"} SPA. It will appear in the ${piRecipient.labelLower}'s Client Portal for acceptance.`
                      : "Send this document to a registered client for review and acceptance. The document will appear in their Client Portal and an email notification will be sent."}
                </p>
                <div className="space-y-2">
                  <Label>{isNcndaSend ? "Party B — Select Client (optional)" : isPiSend ? `Approved ${piRecipient.label} Client *` : "Select Client"}</Label>
                  <Select value={sendClientId} onValueChange={(val) => {
                    setSendClientId(val);
                    const client = selectableClients.find((c) => c.id === val);
                    if (client) {
                      const matchedRecipientEmail = isPiSend
                        ? [client.contactEmail, client.signatoryEmail]
                            .find((email) => (email || "").trim().toLowerCase() === piRecipientEmail)
                        : undefined;
                      setSendEmail(matchedRecipientEmail || client.contactEmail || client.signatoryEmail || "");
                    }
                  }}>
                    <SelectTrigger data-testid="select-send-client">
                      <SelectValue placeholder={isPiSend ? `Choose the SPA ${piRecipient.labelLower}` : "Choose a registered client"} />
                    </SelectTrigger>
                    <SelectContent>
                      {selectableClients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.companyName} — {c.contactName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isPiSend && selectableClients.length === 0 && (
                    <p className="text-xs text-destructive">No approved {piRecipient.labelLower} client matches the {piRecipient.labelLower} email on this SPA.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{isNcndaSend ? "Party B Email (Receiving Party) *" : isPiSend ? `${piRecipient.label} Email *` : "Recipient Email"}</Label>
                  <Input
                    type="email"
                    value={sendEmail}
                    onChange={(e) => { if (!isPiSend) setSendEmail(e.target.value); }}
                    readOnly={isPiSend}
                    placeholder={isNcndaSend ? "Party B email address" : isPiSend ? `${piRecipient.label} email from SPA` : "Enter recipient email address"}
                    data-testid="input-send-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    {isNcndaSend ? "Party A Email (Issuer — CC)" : "CC Email"}
                    <span className="text-xs text-muted-foreground font-normal">optional</span>
                  </Label>
                  <Input
                    type="email"
                    value={sendCcEmail}
                    onChange={(e) => setSendCcEmail(e.target.value)}
                    placeholder={isNcndaSend ? "Issuing party email for copy" : "Email address to copy"}
                    data-testid="input-send-cc-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    Message from Bullfrog Group
                    <span className="text-xs text-muted-foreground font-normal">optional</span>
                  </Label>
                  <Textarea
                    value={sendMessage}
                    onChange={(e) => setSendMessage(e.target.value)}
                    placeholder="Add a message to include in the email to the recipient"
                    rows={4}
                    maxLength={5000}
                    data-testid="input-send-message"
                  />
                </div>
                {attachableChildren(sendDocId).length > 0 && (
                  <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attach bank drafts to the same email</Label>
                    {attachableChildren(sendDocId).map((child) => (
                      <label key={child.id} className="flex items-center gap-2 text-sm cursor-pointer" data-testid={`attach-send-${child.id}`}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={attachDocIds.includes(child.id)}
                          onChange={() => toggleAttachDoc(child.id)}
                        />
                        {attachLabel(child)}
                      </label>
                    ))}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setSendDocId(null); setSendEmail(""); setSendClientId(""); setSendCcEmail(""); setSendMessage(""); setAttachDocIds([]); }} data-testid="button-cancel-send">
                    Cancel
                  </Button>
                  <Button onClick={() => { if (sendDocId && sendEmail) sendDoc.mutate({ id: sendDocId, recipientEmail: sendEmail, clientId: sendClientId || undefined, ccEmail: sendCcEmail || undefined, message: sendMessage || undefined, attachDocIds: attachDocIds.length ? attachDocIds : undefined }); }} disabled={!sendEmail || (isPiSend && !sendClientId) || sendDoc.isPending} data-testid="button-confirm-send">
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    {sendDoc.isPending ? "Sending..." : isNcndaSend ? "Send NCNDA to Party B" : isPiSend ? `Send to ${piRecipient.label}` : "Send to Client"}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
  );
}
