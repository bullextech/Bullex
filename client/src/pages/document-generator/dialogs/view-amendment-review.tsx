import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function ViewAmendmentReview() {
  const { viewDoc, amendReviewNotes, setAmendReviewNotes, isAdmin, reviewAmendment } = useDocGen();
  if (!viewDoc || !viewDoc.pendingContent) return null;

  return (
    <div className="border-t pt-4" data-testid="section-amendment-review">
      <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400" />
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {isAdmin ? "Pending Amendment — Review Required" : "Amendment Pending Admin Approval"}
          </p>
        </div>
        {viewDoc.amendmentReason && (
          <div className="text-xs text-amber-800 dark:text-amber-300">
            <span className="font-semibold">Reason: </span>
            <span className="whitespace-pre-wrap" data-testid="text-amendment-reason">{viewDoc.amendmentReason}</span>
          </div>
        )}
        {isAdmin ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Current (live)</p>
                <pre className="text-[11px] bg-white dark:bg-muted border rounded p-2 max-h-64 overflow-auto whitespace-pre-wrap" data-testid="text-amendment-current">{viewDoc.content || "(empty)"}</pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Proposed</p>
                <pre className="text-[11px] bg-white dark:bg-muted border border-amber-300 dark:border-amber-700 rounded p-2 max-h-64 overflow-auto whitespace-pre-wrap" data-testid="text-amendment-proposed">{viewDoc.pendingContent}</pre>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-amber-800 dark:text-amber-300">Review Notes (optional)</Label>
              <Textarea
                value={amendReviewNotes}
                onChange={(e) => setAmendReviewNotes(e.target.value)}
                placeholder="Notes about this decision..."
                rows={2}
                className="text-xs resize-none border-amber-200 dark:border-amber-800"
                data-testid="textarea-amendment-review-notes"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="text-xs bg-green-600 hover:bg-green-700 text-white flex-1"
                onClick={() => reviewAmendment.mutate({ id: viewDoc.id, decision: "approve", notes: amendReviewNotes })}
                disabled={reviewAmendment.isPending}
                data-testid="button-approve-amendment"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Approve Amendment
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="text-xs"
                onClick={() => reviewAmendment.mutate({ id: viewDoc.id, decision: "reject", notes: amendReviewNotes })}
                disabled={reviewAmendment.isPending}
                data-testid="button-reject-amendment"
              >
                <XCircle className="w-3.5 h-3.5 mr-1" />
                Reject
              </Button>
            </div>
          </>
        ) : (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Your proposed changes have been submitted and are awaiting admin approval. The current document remains active until approved.
          </p>
        )}
      </div>
    </div>
  );
}
