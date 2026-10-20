import { Button } from "@/components/ui/button";
import { AlertCircle, Mail, ThumbsUp, ThumbsDown } from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function ViewResponsePrompts() {
  const { viewDoc, setRespondDocId, setRespondAction } = useDocGen();
  if (!viewDoc) return null;

  return (
    <>
      {viewDoc.recipientResponse === "rejected" && viewDoc.recipientAmendmentNotes && (
        <div className="border-t pt-4">
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <p className="text-sm font-semibold text-red-800 dark:text-red-200">Amendment Requested</p>
            </div>
            <p className="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap" data-testid="text-amendment-notes">{viewDoc.recipientAmendmentNotes}</p>
            <p className="text-xs text-red-500 dark:text-red-400">Amend the document and resend to the counterparty.</p>
          </div>
        </div>
      )}

      {viewDoc.sentTo && viewDoc.recipientResponse === "pending" && (
        <div className="border-t pt-4">
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-600" />
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Awaiting Response</p>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400">Sent to: {viewDoc.sentTo}</p>
            <div className="flex gap-2">
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { setRespondDocId(viewDoc.id); setRespondAction("accepted"); }} data-testid="button-accept-doc">
                <ThumbsUp className="w-3.5 h-3.5 mr-1" />
                Accept
              </Button>
              <Button size="sm" variant="destructive" onClick={() => { setRespondDocId(viewDoc.id); setRespondAction("rejected"); }} data-testid="button-reject-doc">
                <ThumbsDown className="w-3.5 h-3.5 mr-1" />
                Reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
