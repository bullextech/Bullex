import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Save, CheckSquare, Square, ListChecks, XCircle } from "lucide-react";
import { useDocGen } from "../use-doc-gen";

export default function ViewAdminReview() {
  const { viewDoc, reviewChecks, reviewNotes, setReviewNotes, adminReview, toggleReviewCheck } = useDocGen();
  if (!viewDoc || viewDoc.status !== "pending_review") return null;

  return (
    <div className="border-t pt-4" data-testid="section-admin-review">
      <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Admin Review Checklist</p>
          </div>
          <span className="text-xs text-amber-700 dark:text-amber-400">
            {reviewChecks.filter(c => c.checked).length}/{reviewChecks.length} items verified
          </span>
        </div>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Complete all checklist items and approve to enable document signing.
        </p>
        <div className="space-y-1.5">
          {reviewChecks.map((check, idx) => (
            <button
              key={idx}
              onClick={() => toggleReviewCheck(idx)}
              className={`w-full flex items-center gap-2.5 p-2.5 rounded-md text-left text-xs transition-colors ${check.checked ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200" : "bg-white dark:bg-muted border border-amber-200 dark:border-amber-800 text-foreground hover:bg-amber-50 dark:hover:bg-amber-900"}`}
              data-testid={`check-item-${idx}`}
            >
              {check.checked ? (
                <CheckSquare className="w-4 h-4 text-green-600 flex-shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-amber-400 flex-shrink-0" />
              )}
              {check.label}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-amber-800 dark:text-amber-300">Admin Review Notes</Label>
          <Textarea
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder="Add verification notes, risk observations, or concerns..."
            rows={2}
            className="text-xs resize-none border-amber-200 dark:border-amber-800"
            data-testid="textarea-admin-review-notes"
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => adminReview.mutate({ id: viewDoc.id, adminChecks: reviewChecks, adminReviewNotes: reviewNotes })}
            disabled={adminReview.isPending}
            data-testid="button-save-review"
          >
            <Save className="w-3.5 h-3.5 mr-1" />
            Save Progress
          </Button>
          <Button
            size="sm"
            className="text-xs bg-green-600 hover:bg-green-700 text-white flex-1"
            onClick={() => adminReview.mutate({ id: viewDoc.id, adminChecks: reviewChecks, adminReviewNotes: reviewNotes, action: "approve" })}
            disabled={adminReview.isPending || reviewChecks.filter(c => c.checked).length < reviewChecks.length}
            data-testid="button-approve-doc"
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            {reviewChecks.filter(c => c.checked).length < reviewChecks.length
              ? `Approve (${reviewChecks.filter(c => c.checked).length}/${reviewChecks.length} checked)`
              : "Approve — Ready to Sign"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="text-xs"
            onClick={() => adminReview.mutate({ id: viewDoc.id, adminChecks: reviewChecks, adminReviewNotes: reviewNotes, action: "reject" })}
            disabled={adminReview.isPending}
            data-testid="button-reject-doc-review"
          >
            <XCircle className="w-3.5 h-3.5 mr-1" />
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
