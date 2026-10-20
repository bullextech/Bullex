import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Mail } from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function EmailDialog() {
  const {
    emailDocId,
    setEmailDocId,
    emailTo,
    setEmailTo,
    emailCc,
    setEmailCc,
    emailMessage,
    setEmailMessage,
    attachDocIds,
    setAttachDocIds,
    toggleAttachDoc,
    attachableChildren,
    attachLabel,
    emailDoc,
    docs,
  } = useDocGen();
  const emailingDoc = docs?.find((doc) => doc.id === emailDocId);
  const isPiEmail = emailingDoc?.docType === "PI";

  return (
    <Dialog open={!!emailDocId} onOpenChange={(open) => { if (!open) { setEmailDocId(null); setEmailTo(""); setEmailCc(""); setEmailMessage(""); setAttachDocIds([]); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-email-dialog-title">
              <Mail className="w-5 h-5 text-primary" />
              {isPiEmail ? "Email Proforma Invoice" : "Email Document"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isPiEmail
                ? "Email this finalised Proforma Invoice directly to an address you choose. The PDF and editable DOCX are attached, and the linked client-portal workflow is not changed."
                : "Email this document directly with the PDF attached. This does not change the document's status or start a client review workflow."}
            </p>
            <div className="space-y-2">
              <Label>Recipient Email *</Label>
              <Input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="Enter recipient email address"
                data-testid="input-email-to"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                CC Email
                <span className="text-xs text-muted-foreground font-normal">optional</span>
              </Label>
              <Input
                type="email"
                value={emailCc}
                onChange={(e) => setEmailCc(e.target.value)}
                placeholder="Email address to copy"
                data-testid="input-email-cc"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                Message
                <span className="text-xs text-muted-foreground font-normal">optional</span>
              </Label>
              <Textarea
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                placeholder="Add a message to include in the email"
                rows={4}
                maxLength={5000}
                data-testid="input-email-message"
              />
            </div>
            {attachableChildren(emailDocId).length > 0 && (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attach bank drafts to the same email</Label>
                {attachableChildren(emailDocId).map((child) => (
                  <label key={child.id} className="flex items-center gap-2 text-sm cursor-pointer" data-testid={`attach-email-${child.id}`}>
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
              <Button variant="outline" onClick={() => { setEmailDocId(null); setEmailTo(""); setEmailCc(""); setEmailMessage(""); setAttachDocIds([]); }} data-testid="button-cancel-email">
                Cancel
              </Button>
              <Button
                onClick={() => { if (emailDocId && emailTo) emailDoc.mutate({ id: emailDocId, recipientEmail: emailTo, ccEmail: emailCc || undefined, message: emailMessage || undefined, attachDocIds: attachDocIds.length ? attachDocIds : undefined }); }}
                disabled={!emailTo || emailDoc.isPending}
                data-testid="button-confirm-email"
              >
                <Mail className="w-3.5 h-3.5 mr-1.5" />
                {emailDoc.isPending ? "Sending..." : isPiEmail ? "Send PI Email" : "Send Email"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
  );
}
