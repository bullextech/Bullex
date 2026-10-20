import { Button } from "@/components/ui/button";
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
import { Send, UserPlus } from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function SendMemberDialog() {
  const {
    sendMemberDocId,
    setSendMemberDocId,
    sendMemberId,
    setSendMemberId,
    sendMemberMessage,
    setSendMemberMessage,
    receivableMembers,
    sendToMember,
  } = useDocGen();

  return (
    <Dialog open={!!sendMemberDocId} onOpenChange={(open) => { if (!open) { setSendMemberDocId(null); setSendMemberId(""); setSendMemberMessage(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-send-member-dialog-title">
              <UserPlus className="w-5 h-5 text-primary" />
              Send to Team Member
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Email this document directly to a team member you personally added. Both the PDF and the editable DOCX will be attached.
            </p>
            <div className="space-y-2">
              <Label>Team Member *</Label>
              <Select value={sendMemberId} onValueChange={setSendMemberId}>
                <SelectTrigger data-testid="select-send-member">
                  <SelectValue placeholder="Choose a team member you added" />
                </SelectTrigger>
                <SelectContent>
                  {receivableMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} — {m.email}{m.kind === "application" ? " (login pending)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                Message
                <span className="text-xs text-muted-foreground font-normal">optional</span>
              </Label>
              <Textarea
                value={sendMemberMessage}
                onChange={(e) => setSendMemberMessage(e.target.value)}
                placeholder="Add a message to include in the email"
                rows={4}
                maxLength={5000}
                data-testid="input-send-member-message"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setSendMemberDocId(null); setSendMemberId(""); setSendMemberMessage(""); }} data-testid="button-cancel-send-member">
                Cancel
              </Button>
              <Button onClick={() => { if (sendMemberDocId && sendMemberId) sendToMember.mutate({ id: sendMemberDocId, teamMemberId: sendMemberId, message: sendMemberMessage || undefined }); }} disabled={!sendMemberId || sendToMember.isPending} data-testid="button-confirm-send-member">
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {sendToMember.isPending ? "Sending..." : "Send Document"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
  );
}
