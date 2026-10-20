import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function RespondDialog() {
  const {
    respondDocId,
    setRespondDocId,
    respondAction,
    setRespondAction,
    amendmentNotes,
    setAmendmentNotes,
    respondToDoc,
  } = useDocGen();

  return (
    <Dialog open={!!respondDocId && !!respondAction} onOpenChange={(open) => { if (!open) { setRespondDocId(null); setRespondAction(null); setAmendmentNotes(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-respond-dialog-title">
              {respondAction === "accepted" ? <ThumbsUp className="w-5 h-5 text-green-600" /> : <ThumbsDown className="w-5 h-5 text-red-600" />}
              {respondAction === "accepted" ? "Accept Document" : "Reject Document"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {respondAction === "accepted" ? (
              <p className="text-sm text-muted-foreground">Accepting this document will allow the next step in the document workflow to proceed.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Rejecting this document will send it back for amendment. Please provide notes explaining what changes are needed.</p>
                <div className="space-y-2">
                  <Label>Amendment Notes</Label>
                  <Textarea
                    value={amendmentNotes}
                    onChange={(e) => setAmendmentNotes(e.target.value)}
                    placeholder="Describe the changes required..."
                    rows={4}
                    data-testid="textarea-amendment-notes"
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setRespondDocId(null); setRespondAction(null); setAmendmentNotes(""); }} data-testid="button-cancel-respond">
                Cancel
              </Button>
              <Button
                className={respondAction === "accepted" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                variant={respondAction === "rejected" ? "destructive" : "default"}
                onClick={() => { if (respondDocId && respondAction) respondToDoc.mutate({ id: respondDocId, response: respondAction, notes: amendmentNotes }); }}
                disabled={respondToDoc.isPending || (respondAction === "rejected" && !amendmentNotes.trim())}
                data-testid="button-confirm-respond"
              >
                {respondToDoc.isPending ? "Processing..." : respondAction === "accepted" ? "Confirm Accept" : "Confirm Reject"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
  );
}
