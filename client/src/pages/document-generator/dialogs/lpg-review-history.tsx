import { LPG_STS_REVIEW_POINTS, type LpgStsReviewHistoryEntry } from "@shared/lpg-sts";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import type { LpgStsReviewPage } from "@shared/lpg-sts";

/** Read-only audit information: never used to populate the clearance form. */
export function LpgReviewHistory({ history, docId, nextBefore, total }: {
  history: LpgStsReviewHistoryEntry[]; docId?: string; nextBefore?: number | null; total?: number;
}) {
  const [entries, setEntries] = useState(history);
  const [cursor, setCursor] = useState(nextBefore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const loadOlder = async () => {
    if (!docId || cursor == null || loading) return;
    setLoading(true);
    setError(false);
    try {
      const response = await apiRequest("GET", `/api/documents/${docId}/lpg-sts-review?before=${cursor}`);
      const page: LpgStsReviewPage = await response.json();
      setEntries(current => [...page.history, ...current]);
      setCursor(page.nextBefore);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="border-t pt-4 space-y-3" aria-label="LPG review history" data-testid="lpg-review-history">
      <h4 className="text-sm font-semibold">Review history</h4>
      <p className="text-xs text-muted-foreground">
        Historical decisions are a record only. They do not authorize execution of amended terms.
        Decisions discarded before history tracking began cannot be recovered.
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No review decisions recorded yet.</p>
      ) : (
        <ol className="space-y-3">
          {entries.slice().reverse().map((entry, index) => (
            <li key={`${entries.length - index}`} className="rounded-md border p-3 space-y-2 text-sm">
              <p className="font-medium">
                {entry.type === "clearance" ? "Clearance recorded" : "Clearance revoked"}
              </p>
              <p className="text-xs text-muted-foreground">
                {entry.type === "clearance" ? `Reviewed by ${entry.reviewedBy} · ` : ""}
                {new Date(entry.type === "clearance" ? entry.reviewedAt : entry.occurredAt).toLocaleString()}
              </p>
              {entry.type === "invalidation" && <p className="whitespace-pre-wrap">{entry.reason}</p>}
              <details>
                <summary className="cursor-pointer text-xs font-medium">
                  {entry.type === "clearance" ? "View decisions and document fingerprint" : "View document fingerprints"}
                </summary>
                <div className="mt-2 space-y-3">
                  <p className="text-xs">Reviewed document fingerprint: <code className="block break-all text-muted-foreground">{entry.fingerprint}</code></p>
                  {entry.type === "invalidation" ? (
                    <p className="text-xs">Amended document fingerprint: <code className="block break-all text-muted-foreground">{entry.nextFingerprint}</code></p>
                  ) : (
                    <ul className="space-y-3">
                      {entry.points.map((point) => (
                        <li key={point.id} className="space-y-1">
                          <p className="text-xs font-medium">{LPG_STS_REVIEW_POINTS.find(({ id }) => id === point.id)?.label || point.id}</p>
                          <p className="text-xs">{point.decision === "resolved" ? "Resolved" : "Approved as written"}</p>
                          <p className="whitespace-pre-wrap break-words">{point.note}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}
      {total !== undefined && <p className="text-xs text-muted-foreground">Showing {entries.length} of {total} recorded events.</p>}
      {error && <p role="alert" className="text-sm text-destructive">Could not load older events. Please retry.</p>}
      {cursor != null && docId && <Button variant="outline" disabled={loading} onClick={loadOlder}>
        {loading ? "Loading…" : error ? "Retry loading older events" : "Load older events"}
      </Button>}
    </section>
  );
}