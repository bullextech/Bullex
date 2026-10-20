import { Button } from "@/components/ui/button";
import { Pencil, X, Send, Mail, UserPlus } from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function ViewFooterActions() {
  const {
    viewDoc,
    setViewDoc,
    setSendDocId,
    setAttachDocIds,
    setSendEmail,
    setSendClientId,
    setEmailDocId,
    setEmailTo,
    setEmailCc,
    setEmailMessage,
    setSendMemberDocId,
    setSendMemberId,
    setSendMemberMessage,
    isTeam,
    receivableMembers,
    canEmailDoc,
    defaultEmailRecipient,
    canSend,
    canAmend,
    openEdit,
    proformaInvoiceRecipient,
  } = useDocGen();
  if (!viewDoc) return null;

  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={() => setViewDoc(null)} data-testid="button-close-view">
        <X className="w-3.5 h-3.5 mr-1.5" />
        Close
      </Button>
      {canSend(viewDoc) && (
        <Button variant="outline" onClick={() => { setSendDocId(viewDoc.id); setSendEmail(viewDoc.docType === "PI" ? proformaInvoiceRecipient(viewDoc).email : viewDoc.sellerEmail || viewDoc.buyerEmail || ""); setSendClientId(""); setAttachDocIds([]); }} data-testid="button-send-doc">
          <Send className="w-3.5 h-3.5 mr-1.5" />
          {viewDoc.docType === "PI" ? `Send to ${proformaInvoiceRecipient(viewDoc).label}` : "Send to Client"}
        </Button>
      )}
      {viewDoc.docType !== "PI" && isTeam && canSend(viewDoc) && receivableMembers.length > 0 && (
        <Button variant="outline" onClick={() => { setSendMemberDocId(viewDoc.id); setSendMemberId(""); setSendMemberMessage(""); }} data-testid="button-send-member">
          <UserPlus className="w-3.5 h-3.5 mr-1.5" />
          Send to Team Member
        </Button>
      )}
      {canEmailDoc(viewDoc) && (
        <Button variant="outline" onClick={() => { setEmailDocId(viewDoc.id); setEmailTo(defaultEmailRecipient(viewDoc)); setEmailCc(""); setEmailMessage(""); setAttachDocIds([]); }} data-testid="button-email-doc">
          <Mail className="w-3.5 h-3.5 mr-1.5" />
          Email
        </Button>
      )}
      {canAmend(viewDoc) && (
        <Button onClick={() => openEdit(viewDoc)} data-testid="button-edit-from-view">
          <Pencil className="w-3.5 h-3.5 mr-1.5" />
          Amend
        </Button>
      )}
    </div>
  );
}
