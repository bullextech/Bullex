import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LPG_STS_REVIEW_POINTS,
  type LpgStsReviewDecision,
  type LpgStsReviewPage,
} from "@shared/lpg-sts";
import { useDocGen } from "../use-doc-gen";
import { LpgReviewHistory } from "./lpg-review-history";
import { lpgReviewQueryOptions } from "../hooks/lpg-review-query";

export default function ViewLpgStsReview() {
  const { viewDoc, isAdmin, lpgReviewByDocId, saveLpgStsReview } = useDocGen();
  const summary = viewDoc ? lpgReviewByDocId.get(viewDoc.id) : undefined;
  const adminReview = useQuery<LpgStsReviewPage>({
    ...lpgReviewQueryOptions(viewDoc),
    enabled: isAdmin && summary?.data?.required === true,
  });
  const review = isAdmin ? adminReview : summary;
  const clearance = review?.data?.clearance;
  const [decisions, setDecisions] = useState<Record<string, { decision: "" | "resolved" | "approved"; note: string }>>({});
  const authoritativeReviewReady = adminReview.isSuccess && adminReview.isFetchedAfterMount;
  const reviewRefreshFailed = adminReview.isError;

  useEffect(() => {
    const saved = new Map(clearance?.points.map((point) => [point.id, point]) || []);
    setDecisions(Object.fromEntries(LPG_STS_REVIEW_POINTS.map((point) => {
      const value = saved.get(point.id);
      return [point.id, { decision: value?.decision || "", note: value?.note || "" }];
    })));
  }, [viewDoc?.id, clearance?.fingerprint]);

  if (!viewDoc || summary?.data?.required !== true) return null;
  const cleared = review?.data?.cleared === true && (!isAdmin || (!adminReview.isFetching && !adminReview.isError));
  const complete = LPG_STS_REVIEW_POINTS.every((point) =>
    decisions[point.id]?.decision && decisions[point.id]?.note.trim()
  );
  const expectedFingerprint = review?.data?.expectedFingerprint;
  const hasAuthoritativeFingerprint = authoritativeReviewReady
    && !review?.isFetching
    && typeof expectedFingerprint === "string"
    && /^[a-f0-9]{64}$/i.test(expectedFingerprint);

  const save = () => {
    if (!complete) return;
    saveLpgStsReview.mutate({
      id: viewDoc.id,
      expectedContent: viewDoc.content || "",
      expectedFingerprint: expectedFingerprint!,
      points: LPG_STS_REVIEW_POINTS.map((point) => ({
        id: point.id,
        decision: decisions[point.id].decision,
        note: decisions[point.id].note.trim(),
      })) as LpgStsReviewDecision[],
    });
  };

  return (
    <div className="border-t pt-4 space-y-3" data-testid="section-lpg-sts-review">
      <Label className="text-sm font-semibold flex items-center gap-1.5">
        <ClipboardCheck className="w-4 h-4" />
        LPG STS legal/commercial clearance
      </Label>
      {review?.isLoading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Checking content-bound clearance…</p>
      ) : cleared ? (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100">
          <p className="font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Cleared for this exact saved content</p>
          {clearance && <p className="mt-1 text-xs">Reviewed by {clearance.reviewedBy} on {new Date(clearance.reviewedAt).toLocaleString()}.</p>}
        </div>
      ) : (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-medium flex items-center gap-2"><Lock className="w-4 h-4" />Signing, finalization, and bank-draft generation are blocked</p>
          <p className="mt-1 text-xs">Any document amendment invalidates an earlier clearance.</p>
        </div>
      )}

      {isAdmin ? (
        <div className="space-y-3">
          {LPG_STS_REVIEW_POINTS.map((point) => (
            <div key={point.id} className="rounded-md border p-3 space-y-2" data-testid={`lpg-review-point-${point.id}`}>
              <p className="text-sm font-medium">{point.label}</p>
              <div className="grid gap-2 sm:grid-cols-[150px_1fr]">
                <Select
                  value={decisions[point.id]?.decision || ""}
                  onValueChange={(decision: "resolved" | "approved") =>
                    setDecisions((current) => ({ ...current, [point.id]: { decision, note: current[point.id]?.note || "" } }))
                  }
                >
                  <SelectTrigger data-testid={`select-lpg-review-${point.id}`}><SelectValue placeholder="Decision" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="approved">Approved as written</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  rows={2}
                  value={decisions[point.id]?.note || ""}
                  onChange={(event) => setDecisions((current) => ({
                    ...current,
                    [point.id]: { decision: current[point.id]?.decision || "", note: event.target.value },
                  }))}
                  placeholder="Required transaction-specific review note"
                  data-testid={`textarea-lpg-review-${point.id}`}
                />
              </div>
            </div>
          ))}
          {!complete && <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Select a decision and enter a note for every point.</p>}
          {!hasAuthoritativeFingerprint && !reviewRefreshFailed && (
            <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-lpg-review-refreshing">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />Refreshing the authoritative document review state…
            </p>
          )}
          {reviewRefreshFailed && (
            <p className="text-xs text-destructive flex items-center gap-1" role="alert" data-testid="text-lpg-review-refresh-failed">
              <AlertTriangle className="w-3.5 h-3.5" />Could not verify the current review fingerprint. Close and reopen this document before trying again.
            </p>
          )}
          <Button onClick={save} disabled={!complete || !hasAuthoritativeFingerprint || saveLpgStsReview.isPending || review?.isLoading} data-testid="button-save-lpg-sts-review">
            {saveLpgStsReview.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ClipboardCheck className="w-4 h-4 mr-1.5" />}
            Save content-bound clearance
          </Button>
          {reviewRefreshFailed ? (
            <p className="text-xs text-destructive">Review history could not be refreshed. Close and reopen this document to retry.</p>
          ) : review?.data && (
            <LpgReviewHistory
              key={`${viewDoc.id}:${adminReview.dataUpdatedAt}`}
              history={review.data.history || []}
              docId={viewDoc.id}
              nextBefore={adminReview.data?.nextBefore}
              total={adminReview.data?.historyTotal}
            />
          )}
        </div>
      ) : !cleared && (
        <p className="text-xs text-muted-foreground">An administrator must clear all five review points before this document can proceed.</p>
      )}
    </div>
  );
}